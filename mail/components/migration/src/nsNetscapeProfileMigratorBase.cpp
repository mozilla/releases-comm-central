/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAppDirectoryServiceDefs.h"
#include "nsIFile.h"
#include "nsIInputStream.h"
#include "nsILineInputStream.h"
#include "nsIPrefBranch.h"
#include "nsIPrefLocalizedString.h"
#include "nsIPrefService.h"
#include "nsIServiceManager.h"
#include "nsIURL.h"
#include "nsNetscapeProfileMigratorBase.h"
#include "nsNetUtil.h"
#include "prtime.h"
#include "prprf.h"
#include "nsINIParser.h"
#include "nsMailProfileMigratorUtils.h"
#include "nsIDirectoryEnumerator.h"
#include "nsServiceManagerUtils.h"

#define MIGRATION_BUNDLE \
  "chrome://messenger/locale/migration/migration.properties"

#define FILE_NAME_PREFS_5X u"prefs.js"_ns

///////////////////////////////////////////////////////////////////////////////
// nsNetscapeProfileMigratorBase
nsNetscapeProfileMigratorBase::nsNetscapeProfileMigratorBase() {
  mObserverService = do_GetService("@mozilla.org/observer-service;1");
  mMaxProgress = 0;
  mCurrentProgress = 0;
  mFileCopyTransactionIndex = 0;
}

NS_IMPL_ISUPPORTS(nsNetscapeProfileMigratorBase, nsIMailProfileMigrator,
                  nsITimerCallback)

nsresult nsNetscapeProfileMigratorBase::GetProfileDataFromProfilesIni(
    nsIFile* aDataDir, nsTArray<nsString>& aProfileNames,
    nsTArray<RefPtr<nsIFile>>& aProfileLocations) {
  nsCOMPtr<nsIFile> profileIni;
  nsresult rv = aDataDir->Clone(getter_AddRefs(profileIni));
  NS_ENSURE_SUCCESS(rv, rv);

  profileIni->Append(u"profiles.ini"_ns);

  // Does it exist?
  bool profileFileExists = false;
  rv = profileIni->Exists(&profileFileExists);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!profileFileExists) return NS_ERROR_FILE_NOT_FOUND;

  nsINIParser parser;
  rv = parser.Init(profileIni);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString buffer, filePath;
  bool isRelative;

  // This is an infinite loop that is broken when we no longer find profiles
  // for profileID with IsRelative option.
  for (unsigned int c = 0; true; ++c) {
    nsAutoCString profileID("Profile");
    profileID.AppendInt(c);

    if (NS_FAILED(parser.GetString(profileID.get(), "IsRelative", buffer)))
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
    rv = NS_NewNativeLocalFile(EmptyCString(), true, getter_AddRefs(rootDir));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = isRelative ? rootDir->SetRelativeDescriptor(aDataDir, filePath)
                    : rootDir->SetPersistentDescriptor(filePath);
    if (NS_FAILED(rv)) continue;

    bool exists = false;
    rootDir->Exists(&exists);

    if (exists) {
      aProfileLocations.AppendElement(rootDir);
      aProfileNames.AppendElement(NS_ConvertUTF8toUTF16(buffer));
    }
  }
  return NS_OK;
}

#define GETPREF(xform, method, value)                          \
  nsresult rv = aBranch->method(xform->sourcePrefName, value); \
  if (NS_SUCCEEDED(rv)) xform->prefHasValue = true;            \
  return rv;

#define SETPREF(xform, method, value)                                          \
  if (xform->prefHasValue) {                                                   \
    return aBranch->method(                                                    \
        xform->targetPrefName ? xform->targetPrefName : xform->sourcePrefName, \
        value);                                                                \
  }                                                                            \
  return NS_OK;

nsresult nsNetscapeProfileMigratorBase::GetString(PrefTransform* aTransform,
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

nsresult nsNetscapeProfileMigratorBase::SetString(PrefTransform* aTransform,
                                                  nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*)aTransform;
  SETPREF(xform, SetCharPref, nsDependentCString(xform->stringValue));
}

nsresult nsNetscapeProfileMigratorBase::GetBool(PrefTransform* aTransform,
                                                nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*)aTransform;
  GETPREF(xform, GetBoolPref, &xform->boolValue);
}

nsresult nsNetscapeProfileMigratorBase::SetBool(PrefTransform* aTransform,
                                                nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*)aTransform;
  SETPREF(xform, SetBoolPref, xform->boolValue);
}

nsresult nsNetscapeProfileMigratorBase::GetInt(PrefTransform* aTransform,
                                               nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*)aTransform;
  GETPREF(xform, GetIntPref, &xform->intValue);
}

nsresult nsNetscapeProfileMigratorBase::SetInt(PrefTransform* aTransform,
                                               nsIPrefBranch* aBranch) {
  PrefTransform* xform = (PrefTransform*)aTransform;
  SETPREF(xform, SetIntPref, xform->intValue);
}

nsresult nsNetscapeProfileMigratorBase::CopyFile(
    const nsAString& aSourceFileName, const nsAString& aTargetFileName) {
  nsCOMPtr<nsIFile> sourceFile;
  mSourceProfile->Clone(getter_AddRefs(sourceFile));

  sourceFile->Append(aSourceFileName);
  bool exists = false;
  sourceFile->Exists(&exists);
  if (!exists) return NS_OK;

  nsCOMPtr<nsIFile> targetFile;
  mTargetProfile->Clone(getter_AddRefs(targetFile));

  targetFile->Append(aTargetFileName);
  targetFile->Exists(&exists);
  if (exists) targetFile->Remove(false);

  return sourceFile->CopyTo(mTargetProfile, aTargetFileName);
}

nsresult nsNetscapeProfileMigratorBase::GetSignonFileName(
    bool aReplace, nsACString& aFileName) {
  nsresult rv;
  if (aReplace) {
    // Find out what the signons file was called, this is stored in a pref
    // in Seamonkey.
    nsCOMPtr<nsIPrefService> psvc(do_GetService(NS_PREFSERVICE_CONTRACTID));
    psvc->ResetPrefs();

    nsCOMPtr<nsIFile> sourcePrefsName;
    mSourceProfile->Clone(getter_AddRefs(sourcePrefsName));
    sourcePrefsName->Append(FILE_NAME_PREFS_5X);
    psvc->ReadUserPrefsFromFile(sourcePrefsName);

    nsCOMPtr<nsIPrefBranch> branch(do_QueryInterface(psvc));
    rv = branch->GetCharPref("signon.SignonFileName", aFileName);
  } else
    rv = LocateSignonsFile(aFileName);
  return rv;
}

nsresult nsNetscapeProfileMigratorBase::LocateSignonsFile(nsACString& aResult) {
  nsCOMPtr<nsIDirectoryEnumerator> entries;
  nsresult rv = mSourceProfile->GetDirectoryEntries(getter_AddRefs(entries));
  if (NS_FAILED(rv)) return rv;

  nsAutoCString fileName;
  bool hasMore = false;
  while (NS_SUCCEEDED(entries->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsIFile> currFile;
    rv = entries->GetNextFile(getter_AddRefs(currFile));
    if (NS_FAILED(rv)) break;

    nsCOMPtr<nsIURI> uri;
    rv = NS_NewFileURI(getter_AddRefs(uri), currFile);
    if (NS_FAILED(rv)) break;
    nsCOMPtr<nsIURL> url(do_QueryInterface(uri));

    nsAutoCString extn;
    url->GetFileExtension(extn);

    if (extn.EqualsIgnoreCase("s")) {
      url->GetFileName(fileName);
      break;
    }
  }

  aResult = fileName;

  return NS_OK;
}

// helper function, copies the contents of srcDir into destDir.
// destDir will be created if it doesn't exist.

nsresult nsNetscapeProfileMigratorBase::RecursiveCopy(nsIFile* srcDir,
                                                      nsIFile* destDir) {
  nsresult rv;
  bool isDir;

  rv = srcDir->IsDirectory(&isDir);
  if (NS_FAILED(rv)) return rv;
  if (!isDir) return NS_ERROR_INVALID_ARG;

  bool exists;
  rv = destDir->Exists(&exists);
  if (NS_SUCCEEDED(rv) && !exists)
    rv = destDir->Create(nsIFile::DIRECTORY_TYPE, 0775);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIDirectoryEnumerator> dirIterator;
  rv = srcDir->GetDirectoryEntries(getter_AddRefs(dirIterator));
  if (NS_FAILED(rv)) return rv;

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
        } else {
          // we aren't going to do any actual file copying here. Instead, add
          // this to our file transaction list so we can copy files
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

///////////////////////////////////////////////////////////////////////////////
// nsITimerCallback

NS_IMETHODIMP
nsNetscapeProfileMigratorBase::Notify(nsITimer* timer) {
  CopyNextFolder();
  return NS_OK;
}

void nsNetscapeProfileMigratorBase::CopyNextFolder() {
  if (mFileCopyTransactionIndex < mFileCopyTransactions.Length()) {
    fileTransactionEntry fileTransaction =
        mFileCopyTransactions.ElementAt(mFileCopyTransactionIndex++);

    // copy the file
    fileTransaction.srcFile->CopyTo(fileTransaction.destFile,
                                    fileTransaction.newName);

    // add to our current progress
    int64_t fileSize;
    fileTransaction.srcFile->GetFileSize(&fileSize);
    mCurrentProgress += fileSize;

    uint32_t percentage = (uint32_t)(mCurrentProgress * 100 / mMaxProgress);

    nsAutoString index;
    index.AppendInt(percentage);

    NOTIFY_OBSERVERS(MIGRATION_PROGRESS, index.get());

    // fire a timer to handle the next one.
    mFileIOTimer = do_CreateInstance("@mozilla.org/timer;1");

    if (mFileIOTimer)
      mFileIOTimer->InitWithCallback(static_cast<nsITimerCallback*>(this),
                                     percentage == 100 ? 500 : 0,
                                     nsITimer::TYPE_ONE_SHOT);
  } else
    EndCopyFolders();

  return;
}

void nsNetscapeProfileMigratorBase::EndCopyFolders() {
  mFileCopyTransactions.Clear();
  mFileCopyTransactionIndex = 0;

  // notify the UI that we are done with the migration process
  nsAutoString index;
  index.AppendInt(nsIMailProfileMigrator::MAILDATA);
  NOTIFY_OBSERVERS(MIGRATION_ITEMAFTERMIGRATE, index.get());

  NOTIFY_OBSERVERS(MIGRATION_ENDED, nullptr);
}

NS_IMETHODIMP
nsNetscapeProfileMigratorBase::GetSourceHasMultipleProfiles(bool* aResult) {
  nsTArray<nsString> profiles;
  GetSourceProfiles(profiles);

  *aResult = profiles.Length() > 1;
  return NS_OK;
}

NS_IMETHODIMP
nsNetscapeProfileMigratorBase::GetSourceExists(bool* aResult) {
  nsTArray<nsString> profiles;
  GetSourceProfiles(profiles);

  *aResult = profiles.Length() > 0;
  return NS_OK;
}
