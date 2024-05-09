/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMailProfileMigratorUtils.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgOutgoingServer.h"
#include "nsIMsgOutgoingServerService.h"
#include "nsIPrefLocalizedString.h"
#include "nsIPrefService.h"
#include "nsISupportsPrimitives.h"
#include "nsNetCID.h"
#include "nsNetUtil.h"
#include "nsSeamonkeyProfileMigrator.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsComponentManagerUtils.h"  // for do_CreateInstance
#include "mozilla/ArrayUtils.h"
#include "nsIFile.h"

#include "nsIAbManager.h"
#include "nsIAbDirectory.h"
#include "../../../../mailnews/import/src/MorkImport.h"

// Mail specific folder paths
#define MAIL_DIR_50_NAME u"Mail"_ns
#define IMAP_MAIL_DIR_50_NAME u"ImapMail"_ns
#define NEWS_DIR_50_NAME u"News"_ns

///////////////////////////////////////////////////////////////////////////////
// nsSeamonkeyProfileMigrator
#define FILE_NAME_JUNKTRAINING u"training.dat"_ns
#define FILE_NAME_PERSONALDICTIONARY u"persdict.dat"_ns
#define FILE_NAME_PERSONAL_ADDRESSBOOK u"abook.mab"_ns
#define FILE_NAME_MAILVIEWS u"mailviews.dat"_ns
#define FILE_NAME_CERT9DB u"cert9.db"_ns
#define FILE_NAME_KEY4DB u"key4.db"_ns
#define FILE_NAME_SECMODDB u"secmod.db"_ns
#define FILE_NAME_PREFS u"prefs.js"_ns
#define FILE_NAME_USER_PREFS u"user.js"_ns

struct PrefBranchStruct {
  char* prefName;
  int32_t type;
  union {
    char* stringValue;
    int32_t intValue;
    bool boolValue;
    char16_t* wstringValue;
  };
};

NS_IMPL_ISUPPORTS(nsSeamonkeyProfileMigrator, nsIMailProfileMigrator,
                  nsITimerCallback)

nsSeamonkeyProfileMigrator::nsSeamonkeyProfileMigrator() {}

nsSeamonkeyProfileMigrator::~nsSeamonkeyProfileMigrator() {}

///////////////////////////////////////////////////////////////////////////////
// nsIMailProfileMigrator

NS_IMETHODIMP
nsSeamonkeyProfileMigrator::Migrate(uint16_t aItems,
                                    nsIProfileStartup* aStartup,
                                    const char16_t* aProfile) {
  nsresult rv = NS_OK;
  bool aReplace = aStartup ? true : false;

  if (!mTargetProfile) {
    GetProfilePath(aStartup, mTargetProfile);
    if (!mTargetProfile) return NS_ERROR_FAILURE;
  }
  if (!mSourceProfile) {
    GetSourceProfile(aProfile);
    if (!mSourceProfile) return NS_ERROR_FAILURE;
  }

  NOTIFY_OBSERVERS(MIGRATION_STARTED, nullptr);

  if (aReplace) {
    CopyPreferences(aReplace);
  } else {
    ImportPreferences(aItems);
  }

  // fake notifications for things we've already imported as part of
  // CopyPreferences
  COPY_DATA(DummyCopyRoutine, aReplace,
            nsIMailProfileMigrator::ACCOUNT_SETTINGS);
  COPY_DATA(DummyCopyRoutine, aReplace, nsIMailProfileMigrator::NEWSDATA);

  // copy junk mail training file
  COPY_DATA(CopyJunkTraining, aReplace, nsIMailProfileMigrator::JUNKTRAINING);
  COPY_DATA(CopyPasswords, aReplace, nsIMailProfileMigrator::PASSWORDS);

  // the last thing to do is to actually copy over any mail folders we have
  // marked for copying we want to do this last and it will be asynchronous so
  // the UI doesn't freeze up while we perform this potentially very long
  // operation.

  nsAutoString index;
  index.AppendInt(nsIMailProfileMigrator::MAILDATA);
  NOTIFY_OBSERVERS(MIGRATION_ITEMBEFOREMIGRATE, index.get());

  // Generate the max progress value now that we know all of the files we need
  // to copy
  uint32_t count = mFileCopyTransactions.Length();
  for (uint32_t i = 0; i < count; ++i) {
    fileTransactionEntry fileTransaction = mFileCopyTransactions.ElementAt(i);
    int64_t fileSize;
    fileTransaction.srcFile->GetFileSize(&fileSize);
    mMaxProgress += fileSize;
  }

  CopyNextFolder();

  return rv;
}

NS_IMETHODIMP
nsSeamonkeyProfileMigrator::GetMigrateData(const char16_t* aProfile,
                                           bool aReplace, uint16_t* aResult) {
  *aResult = 0;

  if (!mSourceProfile) {
    GetSourceProfile(aProfile);
    if (!mSourceProfile) return NS_ERROR_FILE_NOT_FOUND;
  }

  MigrationData data[] = {
      {ToNewUnicode(FILE_NAME_PREFS), nsIMailProfileMigrator::SETTINGS, false},
      {ToNewUnicode(FILE_NAME_JUNKTRAINING),
       nsIMailProfileMigrator::JUNKTRAINING, true},
  };

  // Frees file name strings allocated above.
  GetMigrateDataFromArray(data, sizeof(data) / sizeof(MigrationData), aReplace,
                          mSourceProfile, aResult);

  // Now locate passwords
  nsCString signonsFileName;
  GetSignonFileName(aReplace, signonsFileName);

  if (!signonsFileName.IsEmpty()) {
    nsAutoString fileName;
    CopyASCIItoUTF16(signonsFileName, fileName);
    nsCOMPtr<nsIFile> sourcePasswordsFile;
    mSourceProfile->Clone(getter_AddRefs(sourcePasswordsFile));
    sourcePasswordsFile->Append(fileName);

    bool exists;
    sourcePasswordsFile->Exists(&exists);
    if (exists) *aResult |= nsIMailProfileMigrator::PASSWORDS;
  }

  // add some extra migration fields for things we also migrate
  *aResult |= nsIMailProfileMigrator::ACCOUNT_SETTINGS |
              nsIMailProfileMigrator::MAILDATA |
              nsIMailProfileMigrator::NEWSDATA |
              nsIMailProfileMigrator::ADDRESSBOOK_DATA;

  return NS_OK;
}

NS_IMETHODIMP
nsSeamonkeyProfileMigrator::GetSourceProfiles(nsTArray<nsString>& aResult) {
  if (mProfileNames.IsEmpty() && mProfileLocations.IsEmpty()) {
    // Fills mProfileNames and mProfileLocations
    FillProfileDataFromSeamonkeyRegistry();
  }

  aResult = mProfileNames.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsSeamonkeyProfileMigrator::GetSourceProfileLocations(
    nsTArray<RefPtr<nsIFile>>& aResult) {
  if (mProfileNames.IsEmpty() && mProfileLocations.IsEmpty()) {
    // Fills mProfileNames and mProfileLocations
    FillProfileDataFromSeamonkeyRegistry();
  }

  aResult = mProfileLocations.Clone();
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsSeamonkeyProfileMigrator

nsresult nsSeamonkeyProfileMigrator::GetSourceProfile(
    const char16_t* aProfile) {
  uint32_t count = mProfileNames.Length();
  for (uint32_t i = 0; i < count; ++i) {
    nsString profileName = mProfileNames[i];
    if (profileName.Equals(aProfile)) {
      mSourceProfile = mProfileLocations[i];
      break;
    }
  }

  return NS_OK;
}

nsresult nsSeamonkeyProfileMigrator::FillProfileDataFromSeamonkeyRegistry() {
  // Find the Seamonkey Registry
  nsCOMPtr<nsIProperties> fileLocator(
      do_GetService("@mozilla.org/file/directory_service;1"));
  nsCOMPtr<nsIFile> seamonkeyData;
#undef EXTRA_PREPEND

#ifdef XP_WIN
#  define NEW_FOLDER "SeaMonkey"
#  define EXTRA_PREPEND "Mozilla"

  fileLocator->Get(NS_WIN_APPDATA_DIR, NS_GET_IID(nsIFile),
                   getter_AddRefs(seamonkeyData));
  NS_ENSURE_TRUE(seamonkeyData, NS_ERROR_FAILURE);

#elif defined(XP_MACOSX)
#  define NEW_FOLDER "SeaMonkey"
#  define EXTRA_PREPEND "Application Support"
  fileLocator->Get(NS_MAC_USER_LIB_DIR, NS_GET_IID(nsIFile),
                   getter_AddRefs(seamonkeyData));
  NS_ENSURE_TRUE(seamonkeyData, NS_ERROR_FAILURE);

#elif defined(XP_UNIX)
#  define NEW_FOLDER "seamonkey"
#  define EXTRA_PREPEND ".mozilla"
  fileLocator->Get(NS_UNIX_HOME_DIR, NS_GET_IID(nsIFile),
                   getter_AddRefs(seamonkeyData));
  NS_ENSURE_TRUE(seamonkeyData, NS_ERROR_FAILURE);

#else
  // On other OS just abort.
  return NS_ERROR_FAILURE;
#endif

  nsCOMPtr<nsIFile> newSeamonkeyData;
  seamonkeyData->Clone(getter_AddRefs(newSeamonkeyData));
  NS_ENSURE_TRUE(newSeamonkeyData, NS_ERROR_FAILURE);

#ifdef EXTRA_PREPEND
  newSeamonkeyData->Append(NS_LITERAL_STRING_FROM_CSTRING(EXTRA_PREPEND));
#endif
  newSeamonkeyData->Append(NS_LITERAL_STRING_FROM_CSTRING(NEW_FOLDER));

  nsresult rv = GetProfileDataFromProfilesIni(newSeamonkeyData, mProfileNames,
                                              mProfileLocations);

  return rv;
}

static nsSeamonkeyProfileMigrator::PrefTransform gTransforms[] = {

    MAKESAMETYPEPREFTRANSFORM("signon.SignonFileName", String),
    MAKESAMETYPEPREFTRANSFORM("mailnews.headers.showUserAgent", Bool),
    MAKESAMETYPEPREFTRANSFORM("mailnews.headers.showOrganization", Bool),
    MAKESAMETYPEPREFTRANSFORM("mail.collect_addressbook", String),
    MAKESAMETYPEPREFTRANSFORM("mail.collect_email_address_outgoing", Bool),
    MAKESAMETYPEPREFTRANSFORM("mail.wrap_long_lines", Bool),
    MAKESAMETYPEPREFTRANSFORM("mailnews.customHeaders", String),
    MAKESAMETYPEPREFTRANSFORM("mail.default_html_action", Int),
    MAKESAMETYPEPREFTRANSFORM("mail.forward_message_mode", Int),
    MAKESAMETYPEPREFTRANSFORM("mail.SpellCheckBeforeSend", Bool),
    MAKESAMETYPEPREFTRANSFORM("mail.warn_on_send_accel_key", Bool),
    MAKESAMETYPEPREFTRANSFORM("mailnews.headers.showUserAgent", Bool),
    MAKESAMETYPEPREFTRANSFORM("mailnews.headers.showOrganization", Bool),
    MAKESAMETYPEPREFTRANSFORM("mail.biff.play_sound", Bool),
    MAKESAMETYPEPREFTRANSFORM("mail.biff.play_sound.type", Int),
    MAKESAMETYPEPREFTRANSFORM("mail.biff.play_sound.url", String),
    MAKESAMETYPEPREFTRANSFORM("mail.biff.show_alert", Bool),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.type", Int),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.http", String),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.http_port", Int),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.ftp", String),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.ftp_port", Int),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.ssl", String),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.ssl_port", Int),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.socks", String),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.socks_port", Int),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.no_proxies_on", String),
    MAKESAMETYPEPREFTRANSFORM("network.proxy.autoconfig_url", String),

    MAKESAMETYPEPREFTRANSFORM("mail.accountmanager.accounts", String),
    MAKESAMETYPEPREFTRANSFORM("mail.accountmanager.defaultaccount", String),
    MAKESAMETYPEPREFTRANSFORM("mail.accountmanager.localfoldersserver", String),
    MAKESAMETYPEPREFTRANSFORM("mail.smtp.defaultserver", String),
    MAKESAMETYPEPREFTRANSFORM("mail.smtpservers", String),

    MAKESAMETYPEPREFTRANSFORM("msgcompose.font_face", String),
    MAKESAMETYPEPREFTRANSFORM("msgcompose.font_size", String),
    MAKESAMETYPEPREFTRANSFORM("msgcompose.text_color", String),
    MAKESAMETYPEPREFTRANSFORM("msgcompose.background_color", String),

    MAKEPREFTRANSFORM("mail.pane_config", "mail.pane_config.dynamic", Int,
                      Int)};

/**
 * Use the current Seamonkey's prefs.js as base, and transform some branches.
 * Thunderbird's prefs.js is thrown away.
 */
nsresult nsSeamonkeyProfileMigrator::TransformPreferences(
    const nsAString& aSourcePrefFileName,
    const nsAString& aTargetPrefFileName) {
  PrefTransform* transform;
  PrefTransform* end =
      gTransforms + sizeof(gTransforms) / sizeof(PrefTransform);

  // Load the source pref file
  nsCOMPtr<nsIPrefService> psvc(do_GetService(NS_PREFSERVICE_CONTRACTID));
  psvc->ResetPrefs();

  nsCOMPtr<nsIFile> sourcePrefsFile;
  mSourceProfile->Clone(getter_AddRefs(sourcePrefsFile));
  sourcePrefsFile->Append(aSourcePrefFileName);
  psvc->ReadUserPrefsFromFile(sourcePrefsFile);

  nsCOMPtr<nsIPrefBranch> branch(do_QueryInterface(psvc));
  for (transform = gTransforms; transform < end; ++transform)
    transform->prefGetterFunc(transform, branch);

  static const char* branchNames[] = {
      // Keep the three below first, or change the indexes below
      "mail.identity.", "mail.server.",     "ldap_2.servers.",
      "mail.account.",  "mail.smtpserver.", "mailnews.labels.",
      "mailnews.tags."};

  // read in the various pref branch trees for accounts, identities, servers,
  // etc.
  PBStructArray branches[MOZ_ARRAY_LENGTH(branchNames)];
  uint32_t i;
  for (i = 0; i < MOZ_ARRAY_LENGTH(branchNames); ++i)
    ReadBranch(branchNames[i], psvc, branches[i]);

  // The signature file prefs may be paths to files in the seamonkey profile
  // path so we need to copy them over and fix these paths up before we write
  // them out to the new prefs.js.
  CopySignatureFiles(branches[0], psvc);

  // Certain mail prefs may actually be absolute paths instead of profile
  // relative paths we need to fix these paths up before we write them out to
  // the new prefs.js
  CopyMailFolders(branches[1], psvc);

  TransformAddressbooksForImport(psvc, branches[2], true);

  // Now that we have all the pref data in memory, load the target pref file,
  // and write it back out.
  psvc->ResetPrefs();

  // XXX Re-order this?

  for (transform = gTransforms; transform < end; ++transform)
    transform->prefSetterFunc(transform, branch);

  for (i = 0; i < MOZ_ARRAY_LENGTH(branchNames); i++)
    WriteBranch(branchNames[i], psvc, branches[i]);

  nsCOMPtr<nsIFile> targetPrefsFile;
  mTargetProfile->Clone(getter_AddRefs(targetPrefsFile));
  targetPrefsFile->Append(aTargetPrefFileName);
  psvc->SavePrefFile(targetPrefsFile);

  return NS_OK;
}

nsresult nsSeamonkeyProfileMigrator::CopySignatureFiles(
    PBStructArray& aIdentities, nsIPrefService* aPrefService) {
  nsresult rv = NS_OK;

  uint32_t count = aIdentities.Length();
  for (uint32_t i = 0; i < count; ++i) {
    PrefBranchStruct* pref = aIdentities.ElementAt(i);
    nsDependentCString prefName(pref->prefName);

    // a partial fix for bug #255043
    // if the user's signature file from seamonkey lives in the
    // seamonkey profile root, we'll copy it over to the new
    // thunderbird profile root and then set the pref to the new value
    // note, this doesn't work for multiple signatures that live
    // below the seamonkey profile root
    if (StringEndsWith(prefName, ".sig_file"_ns)) {
      // turn the pref into a nsIFile
      nsCOMPtr<nsIFile> srcSigFile =
          do_CreateInstance(NS_LOCAL_FILE_CONTRACTID);
      rv = srcSigFile->SetPersistentDescriptor(
          nsDependentCString(pref->stringValue));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIFile> targetSigFile;
      rv = mTargetProfile->Clone(getter_AddRefs(targetSigFile));
      NS_ENSURE_SUCCESS(rv, rv);

      // now make the copy
      bool exists;
      srcSigFile->Exists(&exists);
      if (exists) {
        nsAutoString leafName;
        srcSigFile->GetLeafName(leafName);
        srcSigFile->CopyTo(
            targetSigFile,
            leafName);  // will fail if we've already copied a sig file here
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

nsresult nsSeamonkeyProfileMigrator::CopyMailFolders(
    PBStructArray& aMailServers, nsIPrefService* aPrefService) {
  // Each server has a .directory pref which points to the location of the mail
  // data for that server. We need to do two things for that case...
  // (1) Fix up the directory path for the new profile
  // (2) copy the mail folder data from the source directory pref to the
  //     destination directory pref

  nsresult rv;
  uint32_t count = aMailServers.Length();
  for (uint32_t i = 0; i < count; i++) {
    PrefBranchStruct* pref = aMailServers.ElementAt(i);
    nsDependentCString prefName(pref->prefName);

    if (StringEndsWith(prefName, ".directory-rel"_ns)) {
      // When the directories are modified below, we may change the .directory
      // pref. As we don't have a pref branch to modify at this stage and set
      // up the relative folders properly, we'll just remove all the
      // *.directory-rel prefs. Mailnews will cope with this, creating them
      // when it first needs them.
      if (pref->type == nsIPrefBranch::PREF_STRING) free(pref->stringValue);

      aMailServers.RemoveElementAt(i);
      // Now decrease i and count to match the removed element
      --i;
      --count;
    } else if (StringEndsWith(prefName, ".directory"_ns)) {
      // let's try to get a branch for this particular server to simplify things
      prefName.Cut(prefName.Length() - strlen("directory"),
                   strlen("directory"));
      prefName.Insert("mail.server.", 0);

      nsCOMPtr<nsIPrefBranch> serverBranch;
      aPrefService->GetBranch(prefName.get(), getter_AddRefs(serverBranch));

      if (!serverBranch)
        break;  // should we clear out this server pref from aMailServers?

      nsCString serverType;
      serverBranch->GetCharPref("type", serverType);

      nsCOMPtr<nsIFile> sourceMailFolder;
      serverBranch->GetComplexValue("directory", NS_GET_IID(nsIFile),
                                    getter_AddRefs(sourceMailFolder));

      // now based on type, we need to build a new destination path for the mail
      // folders for this server
      nsCOMPtr<nsIFile> targetMailFolder;
      if (serverType.Equals("imap")) {
        mTargetProfile->Clone(getter_AddRefs(targetMailFolder));
        targetMailFolder->Append(IMAP_MAIL_DIR_50_NAME);
      } else if (serverType.Equals("none") || serverType.Equals("pop3") ||
                 serverType.Equals("rss")) {
        // local folders and POP3 servers go under <profile>\Mail
        mTargetProfile->Clone(getter_AddRefs(targetMailFolder));
        targetMailFolder->Append(MAIL_DIR_50_NAME);
      } else if (serverType.Equals("nntp")) {
        mTargetProfile->Clone(getter_AddRefs(targetMailFolder));
        targetMailFolder->Append(NEWS_DIR_50_NAME);
      }

      if (targetMailFolder) {
        // for all of our server types, append the host name to the directory as
        // part of the new location
        nsCString hostName;
        serverBranch->GetCharPref("hostname", hostName);
        targetMailFolder->Append(NS_ConvertASCIItoUTF16(hostName));

        // we should make sure the host name based directory we are going to
        // migrate the accounts into is unique. This protects against the case
        // where the user has multiple servers with the same host name.
        rv = targetMailFolder->CreateUnique(nsIFile::DIRECTORY_TYPE, 0777);
        NS_ENSURE_SUCCESS(rv, rv);

        (void)RecursiveCopy(sourceMailFolder, targetMailFolder);
        // now we want to make sure the actual directory pref that gets
        // transformed into the new profile's pref.js has the right file
        // location.
        nsAutoCString descriptorString;
        rv = targetMailFolder->GetPersistentDescriptor(descriptorString);
        NS_ENSURE_SUCCESS(rv, rv);
        free(pref->stringValue);
        pref->stringValue = ToNewCString(descriptorString);
      }
    } else if (StringEndsWith(prefName, ".newsrc.file"_ns)) {
      // copy the news RC file into \News. this won't work if the user has
      // different newsrc files for each account I don't know what to do in that
      // situation.

      nsCOMPtr<nsIFile> targetNewsRCFile;
      mTargetProfile->Clone(getter_AddRefs(targetNewsRCFile));
      targetNewsRCFile->Append(NEWS_DIR_50_NAME);

      // turn the pref into a nsIFile
      nsCOMPtr<nsIFile> srcNewsRCFile =
          do_CreateInstance(NS_LOCAL_FILE_CONTRACTID);
      rv = srcNewsRCFile->SetPersistentDescriptor(
          nsDependentCString(pref->stringValue));
      NS_ENSURE_SUCCESS(rv, rv);

      // now make the copy
      bool exists;
      srcNewsRCFile->Exists(&exists);
      if (exists) {
        nsAutoString leafName;
        srcNewsRCFile->GetLeafName(leafName);
        srcNewsRCFile->CopyTo(
            targetNewsRCFile,
            leafName);  // will fail if we've already copied a newsrc file here
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

  return NS_OK;
}

nsresult nsSeamonkeyProfileMigrator::CopyPreferences(bool aReplace) {
  nsresult rv = NS_OK;
  nsresult tmp;

  tmp = TransformPreferences(FILE_NAME_PREFS, FILE_NAME_PREFS);

  if (NS_FAILED(tmp)) {
    rv = tmp;
  }
  tmp = CopyFile(FILE_NAME_USER_PREFS, FILE_NAME_USER_PREFS);
  if (NS_FAILED(tmp)) {
    rv = tmp;
  }

  // Security Stuff
  tmp = CopyFile(FILE_NAME_CERT9DB, FILE_NAME_CERT9DB);
  if (NS_FAILED(tmp)) {
    rv = tmp;
  }
  tmp = CopyFile(FILE_NAME_KEY4DB, FILE_NAME_KEY4DB);
  if (NS_FAILED(tmp)) {
    rv = tmp;
  }
  tmp = CopyFile(FILE_NAME_SECMODDB, FILE_NAME_SECMODDB);
  if (NS_FAILED(tmp)) {
    rv = tmp;
  }

  tmp = CopyFile(FILE_NAME_PERSONALDICTIONARY, FILE_NAME_PERSONALDICTIONARY);
  if (NS_FAILED(tmp)) {
    rv = tmp;
  }
  tmp = CopyFile(FILE_NAME_MAILVIEWS, FILE_NAME_MAILVIEWS);
  if (NS_FAILED(tmp)) {
    rv = tmp;
  }
  return rv;
}

/**
 * Use the current Thunderbird's prefs.js as base, transform branches of
 * Seamonkey's prefs.js so that those branches can be imported without conflicts
 * or overwriting.
 */
nsresult nsSeamonkeyProfileMigrator::ImportPreferences(uint16_t aItems) {
  nsresult rv;
  nsCOMPtr<nsIPrefService> psvc(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // Because all operations on nsIPrefService or nsIPrefBranch will update
  // prefs.js directly, we need to backup the current pref file to be used as a
  // base later.
  nsCOMPtr<nsIFile> targetPrefsFile;
  mTargetProfile->Clone(getter_AddRefs(targetPrefsFile));
  targetPrefsFile->Append(FILE_NAME_PREFS + u".orig"_ns);
  rv = psvc->SavePrefFile(targetPrefsFile);
  NS_ENSURE_SUCCESS(rv, rv);

  // Load the source pref file.
  rv = psvc->ResetPrefs();
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIFile> sourcePrefsFile;
  mSourceProfile->Clone(getter_AddRefs(sourcePrefsFile));
  sourcePrefsFile->Append(FILE_NAME_PREFS);
  rv = psvc->ReadUserPrefsFromFile(sourcePrefsFile);
  NS_ENSURE_SUCCESS(rv, rv);

  // Read in the various pref branch trees for accounts, identities, servers,
  // etc.
  static const char* branchNames[] = {"mail.identity.",   "mail.server.",
                                      "mail.account.",    "mail.smtpserver.",
                                      "mailnews.labels.", "mailnews.tags.",
                                      "ldap_2.servers."};
  PBStructArray sourceBranches[MOZ_ARRAY_LENGTH(branchNames)];
  for (uint32_t i = 0; i < MOZ_ARRAY_LENGTH(branchNames); i++) {
    if ((!(aItems & nsIMailProfileMigrator::SETTINGS) && i <= 5) ||
        (!(aItems & nsIMailProfileMigrator::ADDRESSBOOK_DATA) && i == 6)) {
      continue;
    }
    ReadBranch(branchNames[i], psvc, sourceBranches[i]);
  }

  // Read back the original prefs.
  rv = psvc->ResetPrefs();
  NS_ENSURE_SUCCESS(rv, rv);
  rv = psvc->ReadUserPrefsFromFile(targetPrefsFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgAccountManager> accountManager(
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  PrefKeyHashTable smtpServerKeyHashTable;
  PrefKeyHashTable identityKeyHashTable;
  PrefKeyHashTable serverKeyHashTable;

  // Transforming order is important here.
  TransformSmtpServersForImport(sourceBranches[3], smtpServerKeyHashTable);

  // mail.identity.idN.smtpServer depends on previous step.
  TransformIdentitiesForImport(sourceBranches[0], accountManager,
                               smtpServerKeyHashTable, identityKeyHashTable);

  TransformMailServersForImport(branchNames[1], psvc, sourceBranches[1],
                                accountManager, serverKeyHashTable);

  // mail.accountN.{identities,server} depends on previous steps.
  TransformMailAccountsForImport(psvc, sourceBranches[2], accountManager,
                                 identityKeyHashTable, serverKeyHashTable);

  // CopyMailFolders requires mail.server.serverN branch exists.
  WriteBranch(branchNames[1], psvc, sourceBranches[1], false);
  CopyMailFolders(sourceBranches[1], psvc);

  // TransformAddressbooksForImport writes the branch and migrates the files.
  TransformAddressbooksForImport(psvc, sourceBranches[6], false);

  for (uint32_t i = 0; i < MOZ_ARRAY_LENGTH(branchNames); i++)
    WriteBranch(branchNames[i], psvc, sourceBranches[i]);

  targetPrefsFile->Remove(false);
  return rv;
}

/**
 * Transform mail.identity branch.
 */
nsresult nsSeamonkeyProfileMigrator::TransformIdentitiesForImport(
    PBStructArray& aIdentities, nsIMsgAccountManager* accountManager,
    PrefKeyHashTable& smtpServerKeyHashTable, PrefKeyHashTable& keyHashTable) {
  nsresult rv;
  nsTArray<nsCString> newKeys;

  for (auto pref : aIdentities) {
    nsDependentCString prefName(pref->prefName);
    nsTArray<nsCString> keys;
    ParseString(prefName, '.', keys);
    auto key = keys[0];
    if (key == "default") {
      continue;
    } else if (StringEndsWith(prefName, ".smtpServer"_ns)) {
      nsDependentCString serverKey(pref->stringValue);
      nsCString newServerKey;
      if (smtpServerKeyHashTable.Get(serverKey, &newServerKey)) {
        pref->stringValue = moz_xstrdup(newServerKey.get());
      }
    }

    // For every seamonkey identity, create a new one to avoid conflicts.
    nsCString newKey;
    if (!keyHashTable.Get(key, &newKey)) {
      nsCOMPtr<nsIMsgIdentity> identity;
      rv = accountManager->CreateIdentity(getter_AddRefs(identity));
      NS_ENSURE_SUCCESS(rv, rv);

      identity->GetKey(newKey);
      keyHashTable.InsertOrUpdate(key, newKey);
    }

    // Replace the prefName with the new key.
    prefName.Assign(moz_xstrdup(newKey.get()));
    for (uint32_t j = 1; j < keys.Length(); j++) {
      prefName.Append('.');
      prefName.Append(keys[j]);
    }
    pref->prefName = moz_xstrdup(prefName.get());
  }
  return NS_OK;
}

/**
 * Transform mail.account branch. Also update mail.accountmanager.accounts at
 * the end.
 */
nsresult nsSeamonkeyProfileMigrator::TransformMailAccountsForImport(
    nsIPrefService* aPrefService, PBStructArray& aAccounts,
    nsIMsgAccountManager* accountManager,
    PrefKeyHashTable& identityKeyHashTable,
    PrefKeyHashTable& serverKeyHashTable) {
  nsTHashMap<nsCStringHashKey, nsCString> keyHashTable;
  nsTArray<nsCString> newKeys;

  for (auto pref : aAccounts) {
    nsDependentCString prefName(pref->prefName);
    nsTArray<nsCString> keys;
    ParseString(prefName, '.', keys);
    auto key = keys[0];
    if (key == "default") {
      continue;
    } else if (StringEndsWith(prefName, ".identities"_ns)) {
      nsDependentCString identityKey(pref->stringValue);
      nsCString newIdentityKey;
      if (identityKeyHashTable.Get(identityKey, &newIdentityKey)) {
        pref->stringValue = moz_xstrdup(newIdentityKey.get());
      }
    } else if (StringEndsWith(prefName, ".server"_ns)) {
      nsDependentCString serverKey(pref->stringValue);
      nsCString newServerKey;
      if (serverKeyHashTable.Get(serverKey, &newServerKey)) {
        pref->stringValue = moz_xstrdup(newServerKey.get());
      }
    }

    // For every seamonkey account, create a new one to avoid conflicts.
    nsCString newKey;
    if (!keyHashTable.Get(key, &newKey)) {
      accountManager->GetUniqueAccountKey(newKey);
      newKeys.AppendElement(newKey);
      keyHashTable.InsertOrUpdate(key, newKey);
    }

    // Replace the prefName with the new key.
    prefName.Assign(moz_xstrdup(newKey.get()));
    for (uint32_t j = 1; j < keys.Length(); j++) {
      prefName.Append('.');
      prefName.Append(keys[j]);
    }
    pref->prefName = moz_xstrdup(prefName.get());
  }

  // Append newly create accounts to mail.accountmanager.accounts.
  nsCOMPtr<nsIPrefBranch> branch;
  nsCString newAccounts;
  uint32_t count = newKeys.Length();
  if (count) {
    nsresult rv =
        aPrefService->GetBranch("mail.accountmanager.", getter_AddRefs(branch));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = branch->GetCharPref("accounts", newAccounts);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  for (uint32_t i = 0; i < count; i++) {
    newAccounts.Append(',');
    newAccounts.Append(newKeys[i]);
  }
  if (count) {
    (void)branch->SetCharPref("accounts", newAccounts);
  }

  return NS_OK;
}

/**
 * Transform mail.server branch.
 */
nsresult nsSeamonkeyProfileMigrator::TransformMailServersForImport(
    const char* branchName, nsIPrefService* aPrefService,
    PBStructArray& aMailServers, nsIMsgAccountManager* accountManager,
    PrefKeyHashTable& keyHashTable) {
  nsTArray<nsCString> newKeys;

  for (auto pref : aMailServers) {
    nsDependentCString prefName(pref->prefName);
    nsTArray<nsCString> keys;
    ParseString(prefName, '.', keys);
    auto key = keys[0];
    if (key == "default") {
      continue;
    }
    nsCString newKey;
    bool exists = keyHashTable.Get(key, &newKey);
    if (!exists) {
      do {
        // Since updating prefs.js is batched, GetUniqueServerKey may return the
        // previous key. Sleep 500ms and check if the returned key already
        // exists to workaround it.
        PR_Sleep(PR_MillisecondsToInterval(500));
        accountManager->GetUniqueServerKey(newKey);
      } while (newKeys.Contains(newKey));
      newKeys.AppendElement(newKey);
      keyHashTable.InsertOrUpdate(key, newKey);
    }

    prefName.Assign(moz_xstrdup(newKey.get()));
    for (uint32_t j = 1; j < keys.Length(); j++) {
      prefName.Append('.');
      prefName.Append(keys[j]);
    }

    pref->prefName = moz_xstrdup(prefName.get());

    // Set `mail.server.serverN.type` so that GetUniqueServerKey next time will
    // get a new key.
    if (!exists) {
      nsCOMPtr<nsIPrefBranch> branch;
      nsAutoCString serverTypeKey;
      serverTypeKey.Assign(newKey.get());
      serverTypeKey.AppendLiteral(".type");
      nsresult rv = aPrefService->GetBranch(branchName, getter_AddRefs(branch));
      NS_ENSURE_SUCCESS(rv, rv);
      (void)branch->SetCharPref(serverTypeKey.get(), "placeholder"_ns);
    }
  }
  return NS_OK;
}

/**
 * Transform mail.smtpserver branch.
 * CreateServer will update mail.smtpservers for us.
 */
nsresult nsSeamonkeyProfileMigrator::TransformSmtpServersForImport(
    PBStructArray& aServers, PrefKeyHashTable& keyHashTable) {
  nsresult rv;
  nsCOMPtr<nsIMsgOutgoingServerService> outgoingServerService(do_GetService(
      "@mozilla.org/messengercompose/outgoingserverservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<nsCString> newKeys;

  for (auto pref : aServers) {
    nsDependentCString prefName(pref->prefName);
    nsTArray<nsCString> keys;
    ParseString(prefName, '.', keys);
    auto key = keys[0];
    if (key == "default") {
      continue;
    }

    // For every seamonkey smtp server, create a new one to avoid conflicts.
    nsCString newKey;
    if (!keyHashTable.Get(key, &newKey)) {
      nsCOMPtr<nsIMsgOutgoingServer> server;
      rv = outgoingServerService->CreateServer("smtp"_ns,
                                               getter_AddRefs(server));
      NS_ENSURE_SUCCESS(rv, rv);

      server->GetKey(newKey);
      newKeys.AppendElement(newKey);
      keyHashTable.InsertOrUpdate(key, newKey);
    }

    // Replace the prefName with the new key.
    prefName.Assign(moz_xstrdup(newKey.get()));
    for (uint32_t j = 1; j < keys.Length(); j++) {
      prefName.Append('.');
      prefName.Append(keys[j]);
    }
    pref->prefName = moz_xstrdup(prefName.get());
  }

  return NS_OK;
}

/**
 * Transform ldap_2.servers branch.
 */
nsresult nsSeamonkeyProfileMigrator::TransformAddressbooksForImport(
    nsIPrefService* aPrefService, PBStructArray& aAddressbooks, bool aReplace) {
  nsTHashMap<nsCStringHashKey, nsCString> keyHashTable;
  nsTHashMap<nsCStringHashKey, nsCString> pendingMigrations;
  nsTArray<nsCString> newKeys;
  nsresult rv;

  nsCOMPtr<nsIPrefBranch> branch;
  rv = aPrefService->GetBranch("ldap_2.servers.", getter_AddRefs(branch));
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto pref : aAddressbooks) {
    nsDependentCString prefName(pref->prefName);
    nsTArray<nsCString> keys;
    ParseString(prefName, '.', keys);
    auto key = keys[0];
    if (key == "default") {
      continue;
    }

    nsCString newKey;
    if (aReplace) {
      newKey.Assign(key);
    } else {
      // For every addressbook, create a new one to avoid conflicts.
      if (!keyHashTable.Get(key, &newKey)) {
        uint32_t uniqueCount = 0;

        while (true) {
          nsAutoCString filenameKey;
          nsAutoCString filename;
          filenameKey.Assign(key);
          filenameKey.AppendInt(++uniqueCount);
          filenameKey.AppendLiteral(".filename");
          nsresult rv = branch->GetCharPref(filenameKey.get(), filename);
          if (NS_FAILED(rv)) {
            newKey.Assign(key);
            newKey.AppendInt(uniqueCount);
            (void)branch->SetCharPref(filenameKey.get(), "placeholder"_ns);
            break;
          }
        }
        keyHashTable.InsertOrUpdate(key, newKey);
      }
    }

    // Replace the prefName with the new key.
    prefName.Assign(moz_xstrdup(newKey.get()));
    for (uint32_t j = 1; j < keys.Length(); j++) {
      prefName.Append('.');
      prefName.Append(keys[j]);

      if (j == 1) {
        if (keys[j].Equals("dirType")) {
          // Make sure we have the right type of directory.
          pref->intValue = 101;
        } else if (!aReplace && keys[j].Equals("description") &&
                   !strcmp(pref->stringValue,
                           "chrome://messenger/locale/addressbook/"
                           "addressBook.properties")) {
          // We're importing the default directories, which have localized
          // names. The names are tied to the pref's name, which we are
          // changing, so the localization will fail. Instead, do the
          // localization here and assign it to the directory being copied.
          nsCOMPtr<nsIPrefLocalizedString> localizedString;
          rv = branch->GetComplexValue(pref->prefName,
                                       NS_GET_IID(nsIPrefLocalizedString),
                                       getter_AddRefs(localizedString));
          if (NS_SUCCEEDED(rv)) {
            nsString localizedValue;
            localizedString->GetData(localizedValue);
            pref->stringValue =
                moz_xstrdup(NS_ConvertUTF16toUTF8(localizedValue).get());
          }
        } else if (keys[j].Equals("filename")) {
          // Update the prefs for the new filename of the directory.
          nsCString oldFileName(pref->stringValue);
          nsCString newFileName(pref->stringValue);

          if (StringEndsWith(newFileName, "mab"_ns)) {
            newFileName.Cut(newFileName.Length() - strlen("mab"),
                            strlen("mab"));
            newFileName.Append("sqlite");
            pref->stringValue = moz_xstrdup(newFileName.get());
          }

          if (!aReplace) {
            // Find an unused filename in the destination directory.
            nsCOMPtr<nsIFile> targetAddrbook;
            mTargetProfile->Clone(getter_AddRefs(targetAddrbook));
            targetAddrbook->Append(NS_ConvertUTF8toUTF16(newFileName));
            nsresult rv =
                targetAddrbook->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
            NS_ENSURE_SUCCESS(rv, rv);

            nsString leafName;
            targetAddrbook->GetLeafName(leafName);

            pref->stringValue =
                moz_xstrdup(NS_ConvertUTF16toUTF8(leafName).get());
          }

          if (StringEndsWith(oldFileName, "sqlite"_ns)) {
            nsCOMPtr<nsIFile> oldFile;
            mSourceProfile->Clone(getter_AddRefs(oldFile));
            oldFile->Append(NS_ConvertUTF8toUTF16(oldFileName));
            bool exists = false;
            oldFile->Exists(&exists);
            if (exists) {
              // The source directory already has SQLite directories.
              // Just copy them.
              CopyFile(NS_ConvertUTF8toUTF16(oldFileName),
                       NS_ConvertUTF8toUTF16(newFileName));
              continue;
            }

            oldFileName.Cut(oldFileName.Length() - strlen("sqlite"),
                            strlen("sqlite"));
            oldFileName.Append("mab");
          }

          // Store the directories to be migrated for later.
          pendingMigrations.InsertOrUpdate(newKey, oldFileName);
        }
      }
    }
    pref->prefName = moz_xstrdup(prefName.get());
  }

  // Write out the preferences and ask the address book manager to reload.
  // This initializes the directories using the new prefs we've just set up.
  WriteBranch("ldap_2.servers.", aPrefService, aAddressbooks, false);
  NOTIFY_OBSERVERS("addrbook-reload", nullptr);

  // Do the migration.
  for (auto iter = pendingMigrations.Iter(); !iter.Done(); iter.Next()) {
    nsCString dirPrefId = "ldap_2.servers."_ns;
    dirPrefId.Append(iter.Key());
    MigrateMABFile(dirPrefId, iter.UserData());
  }

  return NS_OK;
}

nsresult nsSeamonkeyProfileMigrator::MigrateMABFile(
    const nsCString& aDirPrefId, const nsCString& aSourceFileName) {
  nsCOMPtr<nsIFile> sourceFile;
  mSourceProfile->Clone(getter_AddRefs(sourceFile));

  sourceFile->Append(NS_ConvertUTF8toUTF16(aSourceFileName));
  bool exists = false;
  sourceFile->Exists(&exists);
  if (!exists) return NS_OK;

  nsresult rv;

  nsCOMPtr<nsIAbManager> abManager(
      do_GetService("@mozilla.org/abmanager;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbDirectory> directory;
  rv = abManager->GetDirectoryFromId(aDirPrefId, getter_AddRefs(directory));
  NS_ENSURE_SUCCESS(rv, NS_OK);

  rv = ReadMABToDirectory(sourceFile, directory);

  return NS_OK;
}

void nsSeamonkeyProfileMigrator::ReadBranch(const char* branchName,
                                            nsIPrefService* aPrefService,
                                            PBStructArray& aPrefs) {
  // Enumerate the branch
  nsCOMPtr<nsIPrefBranch> branch;
  aPrefService->GetBranch(branchName, getter_AddRefs(branch));

  nsTArray<nsCString> prefs;
  nsresult rv = branch->GetChildList("", prefs);
  if (NS_FAILED(rv)) return;

  for (auto& pref : prefs) {
    // Save each pref's value into an array
    char* currPref = moz_xstrdup(pref.get());
    int32_t type;
    branch->GetPrefType(currPref, &type);
    PrefBranchStruct* prefBranch = new PrefBranchStruct;
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
        NS_WARNING(
            "Invalid Pref Type in "
            "nsNetscapeProfileMigratorBase::ReadBranch");
        break;
    }
    if (NS_SUCCEEDED(rv))
      aPrefs.AppendElement(prefBranch);
    else
      delete prefBranch;
  }
}

void nsSeamonkeyProfileMigrator::WriteBranch(const char* branchName,
                                             nsIPrefService* aPrefService,
                                             PBStructArray& aPrefs,
                                             bool deallocate) {
  // Enumerate the branch
  nsCOMPtr<nsIPrefBranch> branch;
  aPrefService->GetBranch(branchName, getter_AddRefs(branch));

  uint32_t count = aPrefs.Length();
  for (uint32_t i = 0; i < count; i++) {
    PrefBranchStruct* pref = aPrefs.ElementAt(i);
    switch (pref->type) {
      case nsIPrefBranch::PREF_STRING:
        (void)branch->SetCharPref(pref->prefName,
                                  nsDependentCString(pref->stringValue));
        if (deallocate) {
          free(pref->stringValue);
          pref->stringValue = nullptr;
        }
        break;
      case nsIPrefBranch::PREF_BOOL:
        (void)branch->SetBoolPref(pref->prefName, pref->boolValue);
        break;
      case nsIPrefBranch::PREF_INT:
        (void)branch->SetIntPref(pref->prefName, pref->intValue);
        break;
      default:
        NS_WARNING(
            "Invalid Pref Type in "
            "nsNetscapeProfileMigratorBase::WriteBranch");
        break;
    }
    if (deallocate) {
      free(pref->prefName);
      pref->prefName = nullptr;
      delete pref;
    }
    pref = nullptr;
  }
  if (deallocate) {
    aPrefs.Clear();
  }
}

nsresult nsSeamonkeyProfileMigrator::DummyCopyRoutine(bool aReplace) {
  // place holder function only to fake the UI out into showing some migration
  // process.
  return NS_OK;
}

nsresult nsSeamonkeyProfileMigrator::CopyJunkTraining(bool aReplace) {
  return aReplace ? CopyFile(FILE_NAME_JUNKTRAINING, FILE_NAME_JUNKTRAINING)
                  : NS_OK;
}

nsresult nsSeamonkeyProfileMigrator::CopyPasswords(bool aReplace) {
  nsresult rv = NS_OK;

  nsCString signonsFileName;
  GetSignonFileName(aReplace, signonsFileName);

  if (signonsFileName.IsEmpty()) return NS_ERROR_FILE_NOT_FOUND;

  nsAutoString fileName;
  CopyASCIItoUTF16(signonsFileName, fileName);
  if (aReplace)
    rv = CopyFile(fileName, fileName);
  else {
    // don't do anything right now
  }
  return rv;
}
