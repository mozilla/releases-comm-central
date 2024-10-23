/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAppDirectoryServiceDefs.h"
#include "nsSuiteProfileMigratorUtils.h"
#include "nsCRT.h"
#include "nsIFile.h"
#include "nsILineInputStream.h"
#include "nsIOutputStream.h"
#include "nsIPrefBranch.h"
#include "nsIPrefLocalizedString.h"
#include "nsIPrefService.h"
#include "nsIServiceManager.h"
#include "nsISupportsPrimitives.h"
#include "nsIURL.h"
#include "nsSuiteProfileMigratorBase.h"
#include "nsNetUtil.h"
#include "nsIDirectoryEnumerator.h"
#include "nsIFileProtocolHandler.h"
#include "nsServiceManagerUtils.h"
#include "prtime.h"
#include "nsINIParser.h"
#include "nsArrayUtils.h"

#define MAIL_DIR_50_NAME             u"Mail"_ns
#define IMAP_MAIL_DIR_50_NAME        u"ImapMail"_ns
#define NEWS_DIR_50_NAME             u"News"_ns
#define DIR_NAME_CHROME              u"chrome"_ns

NS_IMPL_ISUPPORTS(nsSuiteProfileMigratorBase, nsISuiteProfileMigrator,
                  nsITimerCallback)

using namespace mozilla;

///////////////////////////////////////////////////////////////////////////////
// nsITimerCallback

NS_IMETHODIMP
nsSuiteProfileMigratorBase::Notify(nsITimer *timer) {
  CopyNextFolder();
  return NS_OK;
}

NS_IMETHODIMP
nsSuiteProfileMigratorBase::GetName(nsACString& aName) {
  aName.AssignLiteral("nsSuiteProfileMigratorBase");
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsSuiteProfileMigratorBase

nsSuiteProfileMigratorBase::nsSuiteProfileMigratorBase() {
  mFileCopyTransactionIndex = 0;
  mObserverService = do_GetService("@mozilla.org/observer-service;1");
}

///////////////////////////////////////////////////////////////////////////////
// nsISuiteProfileMigrator methods

NS_IMETHODIMP
nsSuiteProfileMigratorBase::GetSourceExists(bool* aResult) {
  nsCOMPtr<nsIArray> profiles;
  GetSourceProfiles(getter_AddRefs(profiles));

  if (profiles) {
    uint32_t count;
    profiles->GetLength(&count);
    *aResult = count > 0;
  }
  else
    *aResult = false;

  return NS_OK;
}

NS_IMETHODIMP
nsSuiteProfileMigratorBase::GetSourceHasMultipleProfiles(bool* aResult) {
  nsCOMPtr<nsIArray> profiles;
  GetSourceProfiles(getter_AddRefs(profiles));

  if (profiles) {
    uint32_t count;
    profiles->GetLength(&count);
    *aResult = count > 1;
  }
  else
    *aResult = false;

  return NS_OK;
}

NS_IMETHODIMP
nsSuiteProfileMigratorBase::GetSourceProfiles(nsIArray** aResult) {
  if (!mProfileNames && !mProfileLocations) {
    nsresult rv;
    mProfileNames = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    if (NS_FAILED(rv))
      return rv;

    mProfileLocations = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    if (NS_FAILED(rv))
      return rv;

    // Fills mProfileNames and mProfileLocations
    FillProfileDataFromRegistry();
  }

  NS_IF_ADDREF(*aResult = mProfileNames);
  return NS_OK;
}


///////////////////////////////////////////////////////////////////////////////
// Pref Transform methods

#define GETPREF(xform, method, value) \
  xform->prefHasValue = NS_SUCCEEDED(aBranch->method(xform->sourcePrefName, value)); \
  return NS_OK;

#define SETPREF(xform, method, value) \
  if (xform->prefHasValue) { \
    return aBranch->method(xform->targetPrefName ? \
                           xform->targetPrefName : \
                           xform->sourcePrefName, value); \
  } \
  return NS_OK;

nsresult
nsSuiteProfileMigratorBase::GetString(PrefTransform* aTransform,
                                      nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*)aTransform;
  nsCString str;
  nsresult rv = aBranch->GetCharPref(xform->sourcePrefName, str);
  if (NS_SUCCEEDED(rv)) {
    xform->prefHasValue = true;
    xform->stringValue = moz_xstrdup(str.get());
  }
  return rv;
}

nsresult
nsSuiteProfileMigratorBase::SetString(PrefTransform* aTransform,
                                      nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*) aTransform;
  SETPREF(aTransform, SetCharPref,
          nsDependentCString(xform->stringValue));
}

nsresult
nsSuiteProfileMigratorBase::GetBool(PrefTransform* aTransform,
                                    nsIPrefBranch* aBranch) {
  GETPREF(aTransform, GetBoolPref, &aTransform->boolValue)
}

nsresult
nsSuiteProfileMigratorBase::SetBool(PrefTransform* aTransform,
                                    nsIPrefBranch* aBranch) {
  SETPREF(aTransform, SetBoolPref, aTransform->boolValue)
}

nsresult
nsSuiteProfileMigratorBase::GetInt(PrefTransform* aTransform,
                                   nsIPrefBranch* aBranch) {
  GETPREF(aTransform, GetIntPref, &aTransform->intValue)
}

nsresult
nsSuiteProfileMigratorBase::SetInt(PrefTransform* aTransform,
                                   nsIPrefBranch* aBranch) {
  SETPREF(aTransform, SetIntPref, aTransform->intValue)
}

nsresult
nsSuiteProfileMigratorBase::SetFile(PrefTransform* aTransform,
                                    nsIPrefBranch* aBranch) {
  // In this case targetPrefName is just an additional preference
  // that needs to be modified and not what the sourcePrefName is
  // going to be saved to once it is modified.
  nsresult rv = NS_OK;
  if (aTransform->prefHasValue) {
    nsCOMPtr<nsIProtocolHandler> handler;
    nsCOMPtr<nsIIOService> ioService(do_GetIOService());
    if (!ioService)
      return NS_OK;
    rv = ioService->GetProtocolHandler("file", getter_AddRefs(handler));
    if (NS_FAILED(rv))
      return NS_OK;
    nsCOMPtr<nsIFileProtocolHandler> fileHandler(do_QueryInterface(handler));
    if (!fileHandler)
      return NS_OK;

    nsCString fileURL(aTransform->stringValue);
    nsCOMPtr<nsIFile> file;
    // Start off by assuming fileURL is a URL spec and
    // try and get a File from it.
    rv = fileHandler->GetFileFromURLSpec(fileURL, getter_AddRefs(file));
    if (NS_FAILED(rv)) {
      // Okay it wasn't a URL spec so assume it is a localfile,
      // if this fails then just don't set anything.
      rv = NS_NewNativeLocalFile(fileURL, getter_AddRefs(file));
      if (NS_FAILED(rv))
        return NS_OK;
    }
    // Now test to see if File exists and is an actual file.
    bool exists = false;
    rv = file->Exists(&exists);
    if (NS_SUCCEEDED(rv) && exists)
      rv = file->IsFile(&exists);

    if (NS_SUCCEEDED(rv) && exists) {
      // After all that let's just get the URL spec and set the pref to it.
      rv = fileHandler->GetURLSpecFromFile(file, fileURL);
      if (NS_FAILED(rv))
        return NS_OK;
      rv = aBranch->SetCharPref(aTransform->sourcePrefName, fileURL);
      if (NS_SUCCEEDED(rv) && aTransform->targetPrefName)
        rv = aBranch->SetIntPref(aTransform->targetPrefName, 1);
    }
  }
  return rv;
}

nsresult
nsSuiteProfileMigratorBase::SetImage(PrefTransform* aTransform,
                                     nsIPrefBranch* aBranch) {
  if (aTransform->prefHasValue)
    // This transforms network.image.imageBehavior into
    // permissions.default.image
    return aBranch->SetIntPref("permissions.default.image",
                        aTransform->intValue == 1 ? 3 :
                        aTransform->intValue == 2 ? 2 : 1);
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// General Utility Methods

nsresult
nsSuiteProfileMigratorBase::GetSourceProfile(const char16_t* aProfile) {
  uint32_t count;
  mProfileNames->GetLength(&count);
  for (uint32_t i = 0; i < count; ++i) {
    nsCOMPtr<nsISupportsString> str(do_QueryElementAt(mProfileNames, i));
    nsString profileName;
    str->GetData(profileName);
    if (profileName.Equals(aProfile))
    {
      mSourceProfile = do_QueryElementAt(mProfileLocations, i);
      break;
    }
  }

  return NS_OK;
}

nsresult
nsSuiteProfileMigratorBase::GetProfileDataFromProfilesIni(nsIFile* aDataDir,
                                                          nsIMutableArray* aProfileNames,
                                                          nsIMutableArray* aProfileLocations) {
  nsresult rv;
  nsCOMPtr<nsIFile> profileIni;
  rv = aDataDir->Clone(getter_AddRefs(profileIni));
  NS_ENSURE_SUCCESS(rv, rv);

  profileIni->Append(u"profiles.ini"_ns);

  // Does it exist?
  bool profileFileExists = false;
  rv = profileIni->Exists(&profileFileExists);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!profileFileExists)
    return NS_ERROR_FILE_NOT_FOUND;

  nsINIParser parser;
  rv = parser.Init(profileIni);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString buffer, filePath;
  bool isRelative;

  unsigned int c = 0;
  for (c = 0; true; ++c) {
    nsAutoCString profileID("Profile");
    profileID.AppendInt(c);

    rv = parser.GetString(profileID.get(), "IsRelative", buffer);
    if (NS_FAILED(rv))
      break;

    isRelative = buffer.EqualsLiteral("1");

    rv = parser.GetString(profileID.get(), "Path", filePath);
    if (NS_FAILED(rv)) {
      NS_ERROR("Malformed profiles.ini: Path= not found");
      continue;
    }

    rv = parser.GetString(profileID.get(), "Name", buffer);
    if (NS_FAILED(rv)) {
      NS_ERROR("Malformed profiles.ini: Name= not found");
      continue;
    }

    nsCOMPtr<nsIFile> rootDir;
    rv = NS_NewNativeLocalFile(EmptyCString(), getter_AddRefs(rootDir));
    NS_ENSURE_SUCCESS(rv, rv);

    if (isRelative)
      rv = rootDir->SetRelativeDescriptor(aDataDir, filePath);
    else
      rv = rootDir->SetPersistentDescriptor(filePath);

    if (NS_FAILED(rv)) continue;

    bool exists;
    rootDir->Exists(&exists);

    if (exists) {
      aProfileLocations->AppendElement(rootDir);

      nsCOMPtr<nsISupportsString> profileNameString(
        do_CreateInstance("@mozilla.org/supports-string;1"));

      profileNameString->SetData(NS_ConvertUTF8toUTF16(buffer));
      aProfileNames->AppendElement(profileNameString);
    }
  }
  return NS_OK;
}

nsresult
nsSuiteProfileMigratorBase::CopyFile(const char* aSourceFileName,
                                     const char* aTargetFileName) {
  nsCOMPtr<nsIFile> sourceFile;
  mSourceProfile->Clone(getter_AddRefs(sourceFile));

  sourceFile->AppendNative(nsDependentCString(aSourceFileName));
  bool exists = false;
  sourceFile->Exists(&exists);
  if (!exists)
    return NS_OK;

  nsCOMPtr<nsIFile> targetFile;
  mTargetProfile->Clone(getter_AddRefs(targetFile));

  targetFile->AppendNative(nsDependentCString(aTargetFileName));
  targetFile->Exists(&exists);
  if (exists)
    targetFile->Remove(false);

  return sourceFile->CopyToNative(mTargetProfile,
                                  nsDependentCString(aTargetFileName));
}

// helper function, copies the contents of srcDir into destDir.
// destDir will be created if it doesn't exist.
nsresult
nsSuiteProfileMigratorBase::RecursiveCopy(nsIFile* srcDir,
                                          nsIFile* destDir) {
  bool exists;
  nsresult rv = srcDir->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!exists)
    // We do not want to fail if the source folder does not exist because then
    // parts of the migration process following this would not get executed
    return NS_OK;

  bool isDir;

  rv = srcDir->IsDirectory(&isDir);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!isDir)
    return NS_ERROR_INVALID_ARG;

  rv = destDir->Exists(&exists);
  if (NS_SUCCEEDED(rv) && !exists)
    rv = destDir->Create(nsIFile::DIRECTORY_TYPE, 0775);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDirectoryEnumerator> dirIterator;
  rv = srcDir->GetDirectoryEntries(getter_AddRefs(dirIterator));
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasMore = false;
  while (NS_SUCCEEDED(dirIterator->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsIFile> dirEntry;
    rv = dirIterator->GetNextFile(getter_AddRefs(dirEntry));
    if (NS_SUCCEEDED(rv) && dirEntry) {
      rv = dirEntry->IsDirectory(&isDir);
      if (NS_SUCCEEDED(rv)) {
        if (isDir) {
          nsCOMPtr<nsIFile> newChild;
          rv = destDir->Clone(getter_AddRefs(newChild));
          if (NS_SUCCEEDED(rv)) {
            nsAutoString leafName;
            dirEntry->GetLeafName(leafName);

            newChild->AppendRelativePath(leafName);
            rv = newChild->Exists(&exists);
            if (NS_SUCCEEDED(rv) && !exists)
              rv = newChild->Create(nsIFile::DIRECTORY_TYPE, 0775);

            rv = RecursiveCopy(dirEntry, newChild);
          }
        }
        else {
          // we aren't going to do any actual file copying here. Instead,
          // add this to our file transaction list so we can copy files
          // asynchronously...
          fileTransactionEntry fileEntry;

          fileEntry.srcFile = dirEntry;
          fileEntry.destFile = destDir;

          mFileCopyTransactions.AppendElement(fileEntry);
        }
      }
    }
  }

  return rv;
}

void
nsSuiteProfileMigratorBase::ReadBranch(const char * branchName,
                                       nsIPrefService* aPrefService,
                                       PBStructArray &aPrefs) {
  // Enumerate the branch
  nsCOMPtr<nsIPrefBranch> branch;
  aPrefService->GetBranch(branchName, getter_AddRefs(branch));

  nsTArray<nsCString> prefs;

  nsresult rv = branch->GetChildList("", prefs);
  if (NS_FAILED(rv))
    return;

  for (auto& pref : prefs) {
    // Save each pref's value into an array
    char* currPref = moz_xstrdup(pref.get());
    int32_t type;
    branch->GetPrefType(currPref, &type);

    PrefBranchStruct* prefBranch = new PrefBranchStruct;
    if (!prefBranch) {
      NS_WARNING("Could not create new PrefBranchStruct");
      free(currPref);
      return;
    }
    prefBranch->prefName = currPref;
    prefBranch->type = type;

    switch (type) {
    case nsIPrefBranch::PREF_STRING: {
      nsCString str;
      rv = branch->GetCharPref(currPref, str);
      prefBranch->stringValue = moz_xstrdup(str.get());
      break;
    }
    case nsIPrefBranch::PREF_BOOL:
      rv = branch->GetBoolPref(currPref, &prefBranch->boolValue);
      break;
    case nsIPrefBranch::PREF_INT:
      rv = branch->GetIntPref(currPref, &prefBranch->intValue);
      break;
    default:
      NS_WARNING("Invalid prefBranch Type in "
                 "nsSuiteProfileMigratorBase::ReadBranch\n");
      break;
    }

    if (NS_SUCCEEDED(rv))
      aPrefs.AppendElement(prefBranch);
  }
}

void
nsSuiteProfileMigratorBase::WriteBranch(const char * branchName,
                                        nsIPrefService* aPrefService,
                                        PBStructArray &aPrefs) {
  // Enumerate the branch
  nsCOMPtr<nsIPrefBranch> branch;
  aPrefService->GetBranch(branchName, getter_AddRefs(branch));

  uint32_t count = aPrefs.Length();
  for (uint32_t i = 0; i < count; ++i) {
    PrefBranchStruct* pref = aPrefs.ElementAt(i);

    switch (pref->type) {
    case nsIPrefBranch::PREF_STRING: {
      branch->SetCharPref(pref->prefName,
                          nsDependentCString(pref->stringValue));
      free(pref->stringValue);
      pref->stringValue = nullptr;
      break;
    }
    case nsIPrefBranch::PREF_BOOL:
      branch->SetBoolPref(pref->prefName, pref->boolValue);
      break;
    case nsIPrefBranch::PREF_INT:
      branch->SetIntPref(pref->prefName, pref->intValue);
      break;
    default:
      NS_WARNING("Invalid Pref Type in "
                 "nsSuiteProfileMigratorBase::WriteBranch\n");
      break;
    }
    free(pref->prefName);
    pref->prefName = nullptr;
    delete pref;
    pref = nullptr;
  }
  aPrefs.Clear();
}

nsresult
nsSuiteProfileMigratorBase::GetFileValue(nsIPrefBranch* aPrefBranch,
                                         const char* aRelPrefName,
                                         const char* aPrefName,
                                         nsIFile** aReturnFile) {
  nsCString prefValue;
  nsCOMPtr<nsIFile> theFile;
  nsresult rv = aPrefBranch->GetCharPref(aRelPrefName, prefValue);
  if (NS_SUCCEEDED(rv)) {
    // The pref has the format: [ProfD]a/b/c
    if (!StringBeginsWith(prefValue, "[ProfD]"_ns))
      return NS_ERROR_FILE_NOT_FOUND;

    rv = NS_NewNativeLocalFile(EmptyCString(), getter_AddRefs(theFile));
    if (NS_FAILED(rv))
      return rv;

    rv = theFile->SetRelativeDescriptor(mSourceProfile, Substring(prefValue, 7));
    if (NS_FAILED(rv))
      return rv;
  } else {
    rv = aPrefBranch->GetComplexValue(aPrefName,
                                      NS_GET_IID(nsIFile),
                                      getter_AddRefs(theFile));
  }

  theFile.forget(aReturnFile);
  return rv;
}

///////////////////////////////////////////////////////////////////////////////
// Mail Import Functions

nsresult
nsSuiteProfileMigratorBase::CopyAddressBookDirectories(PBStructArray &aLdapServers,
                                                       nsIPrefService* aPrefService) {
  // each server has a pref ending with .filename. The value of that pref
  // points to a profile which we need to migrate.
  nsAutoString index;
  index.AppendInt(nsISuiteProfileMigrator::ADDRESSBOOK_DATA);
  NOTIFY_OBSERVERS(MIGRATION_ITEMBEFOREMIGRATE, index.get());

  uint32_t count = aLdapServers.Length();
  for (uint32_t i = 0; i < count; ++i) {
    PrefBranchStruct* pref = aLdapServers.ElementAt(i);
    nsDependentCString prefName(pref->prefName);

    if (StringEndsWith(prefName, ".filename"_ns)) {
      CopyFile(pref->stringValue, pref->stringValue);
    }

    // we don't need to do anything to the fileName pref itself
  }

  NOTIFY_OBSERVERS(MIGRATION_ITEMAFTERMIGRATE, index.get());

  return NS_OK;
}

nsresult
nsSuiteProfileMigratorBase::CopySignatureFiles(PBStructArray &aIdentities,
                                               nsIPrefService* aPrefService) {
  nsresult rv = NS_OK;

  uint32_t count = aIdentities.Length();
  for (uint32_t i = 0; i < count; ++i)
  {
    PrefBranchStruct* pref = aIdentities.ElementAt(i);
    nsDependentCString prefName(pref->prefName);

    // a partial fix for bug #255043
    // if the user's signature file from seamonkey lives in the
    // old profile root, we'll copy it over to the new profile root and
    // then set the pref to the new value. Note, this doesn't work for
    // multiple signatures that live below the seamonkey profile root
    if (StringEndsWith(prefName, ".sig_file"_ns))
    {
      // turn the pref into a nsIFile
      nsCOMPtr<nsIFile> srcSigFile =
        do_CreateInstance(NS_LOCAL_FILE_CONTRACTID);
      rv = srcSigFile->SetPersistentDescriptor(nsDependentCString(pref->stringValue));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIFile> targetSigFile;
      rv = mTargetProfile->Clone(getter_AddRefs(targetSigFile));
      NS_ENSURE_SUCCESS(rv, rv);

      // now make the copy
      bool exists;
      srcSigFile->Exists(&exists);
      if (exists)
      {
        nsAutoString leafName;
        srcSigFile->GetLeafName(leafName);
        // will fail if we've already copied a sig file here
        srcSigFile->CopyTo(targetSigFile, leafName);
        targetSigFile->Append(leafName);

        // now write out the new descriptor
        nsAutoCString descriptorString;
        rv = targetSigFile->GetPersistentDescriptor(descriptorString);
        NS_ENSURE_SUCCESS(rv, rv);

        free(pref->stringValue);
        pref->stringValue = ToNewCString(descriptorString);
      }
    }
  }
  return NS_OK;
}

nsresult
nsSuiteProfileMigratorBase::CopyJunkTraining(bool aReplace)
{
  return aReplace ? CopyFile(FILE_NAME_JUNKTRAINING,
                             FILE_NAME_JUNKTRAINING) : NS_OK;
}

nsresult
nsSuiteProfileMigratorBase::CopyMailFolderPrefs(PBStructArray &aMailServers,
                                                nsIPrefService* aPrefService) {
  // Each server has a .directory pref which points to the location of the
  // mail data for that server. We need to do two things for that case...
  // (1) Fix up the directory path for the new profile
  // (2) copy the mail folder data from the source directory pref to the
  //     destination directory pref
  CopyFile(FILE_NAME_VIRTUALFOLDERS, FILE_NAME_VIRTUALFOLDERS);

  int32_t count = aMailServers.Length();
  for (int32_t i = 0; i < count; ++i) {
    PrefBranchStruct* pref = aMailServers.ElementAt(i);
    nsDependentCString prefName(pref->prefName);

    if (StringEndsWith(prefName, ".directory"_ns)) {
      // let's try to get a branch for this particular server to simplify things
      prefName.Cut(prefName.Length() - strlen("directory"),
                   strlen("directory"));
      prefName.Insert("mail.server.", 0);

      nsCOMPtr<nsIPrefBranch> serverBranch;
      aPrefService->GetBranch(prefName.get(), getter_AddRefs(serverBranch));

      if (!serverBranch)
        break; // should we clear out this server pref from aMailServers?

      nsCString serverType;
      serverBranch->GetCharPref("type", serverType);

      nsCOMPtr<nsIFile> sourceMailFolder;
      nsresult rv = GetFileValue(serverBranch, "directory-rel", "directory",
                                 getter_AddRefs(sourceMailFolder));
      NS_ENSURE_SUCCESS(rv, rv);

      // now based on type, we need to build a new destination path for the
      // mail folders for this server
      nsCOMPtr<nsIFile> targetMailFolder;
      if (serverType.Equals("imap")) {
        mTargetProfile->Clone(getter_AddRefs(targetMailFolder));
        targetMailFolder->Append(IMAP_MAIL_DIR_50_NAME);
      }
      else if (serverType.Equals("none") || serverType.Equals("pop3")) {
        // local folders and POP3 servers go under <profile>\Mail
        mTargetProfile->Clone(getter_AddRefs(targetMailFolder));
        targetMailFolder->Append(MAIL_DIR_50_NAME);
      }
      else if (serverType.Equals("nntp")) {
        mTargetProfile->Clone(getter_AddRefs(targetMailFolder));
        targetMailFolder->Append(NEWS_DIR_50_NAME);
      }

      if (targetMailFolder) {
        // for all of our server types, append the host name to the directory
        // as part of the new location
        nsCString hostName;
        serverBranch->GetCharPref("hostname", hostName);
        targetMailFolder->Append(NS_ConvertASCIItoUTF16(hostName));

        // we should make sure the host name based directory we are going to
        // migrate the accounts into is unique. This protects against the
        // case where the user has multiple servers with the same host name.
        rv = targetMailFolder->CreateUnique(nsIFile::DIRECTORY_TYPE, 0777);
        NS_ENSURE_SUCCESS(rv, rv);

        RecursiveCopy(sourceMailFolder, targetMailFolder);
        // now we want to make sure the actual directory pref that gets
        // transformed into the new profile's pref.js has the right file
        // location.
        nsAutoCString descriptorString;
        rv = targetMailFolder->GetPersistentDescriptor(descriptorString);
        NS_ENSURE_SUCCESS(rv, rv);

        free(pref->stringValue);
        pref->stringValue = ToNewCString(descriptorString);
      }
    }
    else if (StringEndsWith(prefName, ".newsrc.file"_ns)) {
      // copy the news RC file into \News. this won't work if the user has
      // different newsrc files for each account I don't know what to do in
      // that situation.
      nsCOMPtr<nsIFile> targetNewsRCFile;
      mTargetProfile->Clone(getter_AddRefs(targetNewsRCFile));
      targetNewsRCFile->Append(NEWS_DIR_50_NAME);

      // turn the pref into a nsIFile
      nsCOMPtr<nsIFile> srcNewsRCFile =
        do_CreateInstance(NS_LOCAL_FILE_CONTRACTID);
      nsresult rv = srcNewsRCFile->SetPersistentDescriptor(
        nsDependentCString(pref->stringValue));
      NS_ENSURE_SUCCESS(rv, rv);

      // now make the copy
      bool exists;
      srcNewsRCFile->Exists(&exists);
      if (exists) {
        nsAutoString leafName;
        srcNewsRCFile->GetLeafName(leafName);
        // will fail if we've already copied a newsrc file here
        srcNewsRCFile->CopyTo(targetNewsRCFile,leafName);
        targetNewsRCFile->Append(leafName);

        // now write out the new descriptor
        nsAutoCString descriptorString;
        rv = targetNewsRCFile->GetPersistentDescriptor(descriptorString);
        NS_ENSURE_SUCCESS(rv, rv);

        free(pref->stringValue);
        pref->stringValue = ToNewCString(descriptorString);
      }
    }
  }

  // Remove all .directory-rel prefs as those might have changed; MailNews
  // will create those prefs again on first use
  for (int32_t i = count; i-- > 0; ) {
    PrefBranchStruct* pref = aMailServers.ElementAt(i);
    nsDependentCString prefName(pref->prefName);

    if (StringEndsWith(prefName, ".directory-rel"_ns)) {
      if (pref->type == nsIPrefBranch::PREF_STRING)
        free(pref->stringValue);

      aMailServers.RemoveElementAt(i);
    }
  }

  return NS_OK;
}

void
nsSuiteProfileMigratorBase::CopyMailFolders() {
  nsAutoString index;
  index.AppendInt(nsISuiteProfileMigrator::MAILDATA);
  NOTIFY_OBSERVERS(MIGRATION_ITEMBEFOREMIGRATE, index.get());

  // Generate the max progress value now that we know all of the files we
  // need to copy
  uint32_t count = mFileCopyTransactions.Length();
  mMaxProgress = 0;
  mCurrentProgress = 0;

  for (uint32_t i = 0; i < count; ++i) {
    fileTransactionEntry fileTransaction = mFileCopyTransactions[i];
    int64_t fileSize;
    fileTransaction.srcFile->GetFileSize(&fileSize);
    mMaxProgress += fileSize;
  }

  CopyNextFolder();
}

void
nsSuiteProfileMigratorBase::CopyNextFolder() {
  if (mFileCopyTransactionIndex < mFileCopyTransactions.Length()) {
    fileTransactionEntry fileTransaction =
      mFileCopyTransactions.ElementAt(mFileCopyTransactionIndex++);

    // copy the file
    fileTransaction.srcFile->CopyTo(fileTransaction.destFile,
                                    EmptyString());

    // add to our current progress
    int64_t fileSize;
    fileTransaction.srcFile->GetFileSize(&fileSize);
    mCurrentProgress += fileSize;

    uint32_t percentage = (uint32_t)(mCurrentProgress * 100 / mMaxProgress);

    nsAutoString index;
    index.AppendInt(percentage);

    NOTIFY_OBSERVERS(MIGRATION_PROGRESS, index.get());

    if (mFileCopyTransactionIndex == mFileCopyTransactions.Length())
    {
      EndCopyFolders();
      return;
    }

    // fire a timer to handle the next one.
    mFileIOTimer = do_CreateInstance("@mozilla.org/timer;1");

    if (mFileIOTimer)
      mFileIOTimer->InitWithCallback(static_cast<nsITimerCallback *>(this),
                                     1, nsITimer::TYPE_ONE_SHOT);
  }
  else
    EndCopyFolders();

  return;
}

void
nsSuiteProfileMigratorBase::EndCopyFolders() {
  mFileCopyTransactions.Clear();
  mFileCopyTransactionIndex = 0;

  // notify the UI that we are done with the migration process
  nsAutoString index;
  index.AppendInt(nsISuiteProfileMigrator::MAILDATA);
  NOTIFY_OBSERVERS(MIGRATION_ITEMAFTERMIGRATE, index.get());

  NOTIFY_OBSERVERS(MIGRATION_ENDED, nullptr);
}
