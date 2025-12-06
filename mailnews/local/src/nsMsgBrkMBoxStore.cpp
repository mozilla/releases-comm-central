/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Class for handling Berkeley Mailbox stores.
*/

#include "FolderPopulation.h"
#include "MailNewsTypes.h"
#include "prlog.h"
#include "msgCore.h"
#include "nsMsgBrkMBoxStore.h"
#include "nsIMsgFolder.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIRandomAccessStream.h"
#include "nsCOMArray.h"
#include "nsIFile.h"
#include "nsIDirectoryEnumerator.h"
#include "nsIMsgHdr.h"
#include "nsNetUtil.h"
#include "nsIMsgDatabase.h"
#include "nsMsgUtils.h"
#include "nsIDBFolderInfo.h"
#include "nsPrintfCString.h"
#include "nsQuarantinedOutputStream.h"
#include "MboxMsgInputStream.h"
#include "MboxMsgOutputStream.h"
#include "MboxCompactor.h"
#include "MboxScanner.h"
#include "mozilla/glean/CommMailMetrics.h"
#include "mozilla/Logging.h"
#include "mozilla/Preferences.h"
#include "mozilla/ScopeExit.h"
#include <cstdlib>  // for std::abs(int/long)
#include <cmath>    // for std::abs(float/double)

using mozilla::LogLevel;
using mozilla::Preferences;

mozilla::LazyLogModule gMboxLog("mbox");

/****************************************************************************
 * nsMsgBrkMBoxStore implementation.
 */
nsMsgBrkMBoxStore::nsMsgBrkMBoxStore() {}

nsMsgBrkMBoxStore::~nsMsgBrkMBoxStore() {}

NS_IMPL_ISUPPORTS(nsMsgBrkMBoxStore, nsIMsgPluggableStore)

NS_IMETHODIMP nsMsgBrkMBoxStore::DiscoverSubFolders(nsIMsgFolder* aParentFolder,
                                                    bool aDeep) {
  NS_ENSURE_ARG_POINTER(aParentFolder);

  nsCOMPtr<nsIFile> path;
  nsresult rv = aParentFolder->GetFilePath(getter_AddRefs(path));
  if (NS_FAILED(rv)) return rv;

  bool exists;
  path->Exists(&exists);
  if (!exists) {
    // Apparently, this code is only used to create a real folder alongside
    // the .msf file for a virtual folder. Although the empty folder seems
    // useless, trying to move the virtual folder later on will fail without
    // it.
    rv = path->Create(nsIFile::DIRECTORY_TYPE, 0755);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return PopulateFolderHierarchy(aParentFolder, this, aDeep);
}

// Given a directory structure:
// ...profile/Mail/localfolders/
//     foo
//     foo.sbd/
//        bar
//        bar.sbd/
//          wibble
//        pibble
//        shouldnt_be_here/
//          rubbish
//
// Calling this function should yield these results:
//
// parent     |  Should return
// -----------+---------------
// root       | ["foo"]
// foo        | ["bar", "pibble"]
// foo/bar    | ["wibble"]
// foo/pibble | []
//
NS_IMETHODIMP nsMsgBrkMBoxStore::DiscoverChildFolders(
    nsIMsgFolder* parent, nsTArray<nsCString>& children) {
  NS_ENSURE_ARG(parent);

  children.ClearAndRetainStorage();

  // Subfolders are in `<parentname>.sbd` dir, if it exists.
  nsCOMPtr<nsIFile> sbd;
  {
    MOZ_TRY(parent->GetFilePath(getter_AddRefs(sbd)));
    bool isServer;
    parent->GetIsServer(&isServer);
    if (!isServer) {
      nsAutoString name;
      MOZ_TRY(sbd->GetLeafName(name));
      name.AppendLiteral(FOLDER_SUFFIX);
      MOZ_TRY(sbd->SetLeafName(name));
    }
    bool exists;
    MOZ_TRY(sbd->Exists(&exists));
    if (!exists) {
      return NS_OK;  // No subfolders.
    }
    bool isDir;
    MOZ_TRY(sbd->IsDirectory(&isDir));
    if (!isDir) {
      return NS_OK;  // Confusing, but treat as no subfolders.
    }
  }

  // Now look for child folders inside `<parentname>.sbd/`.
  nsCOMPtr<nsIDirectoryEnumerator> dirEnumerator;
  MOZ_TRY(sbd->GetDirectoryEntries(getter_AddRefs(dirEnumerator)));
  while (true) {
    nsCOMPtr<nsIFile> child;
    MOZ_TRY(dirEnumerator->GetNextFile(getter_AddRefs(child)));
    if (!child) {
      break;  // Finished.
    }

    bool isDir = false;
    MOZ_TRY(child->IsDirectory(&isDir));
    if (isDir) {
      continue;  // Ignore directories.
    }
    if (nsShouldIgnoreFile(child)) {
      continue;  // Not interested.
    }

    // If we get this far, we treat it as an mbox file.
    nsAutoString fileName;
    MOZ_TRY(child->GetLeafName(fileName));

    children.AppendElement(DecodeFilename(fileName));
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::CreateFolder(nsIMsgFolder* aParent,
                                              const nsACString& aFolderName,
                                              nsIMsgFolder** aResult) {
  NS_ENSURE_ARG_POINTER(aParent);
  NS_ENSURE_ARG_POINTER(aResult);
  if (aFolderName.IsEmpty()) return NS_MSG_ERROR_INVALID_FOLDER_NAME;

  // Make sure the new folder name is valid
  nsString safeFolderName16 = NS_MsgHashIfNecessary(aFolderName);
  nsAutoCString safeFolderName = NS_ConvertUTF16toUTF8(safeFolderName16);

  // Register the subfolder in memory before creating any on-disk file or
  // directory for the folder. This way, we don't run the risk of getting in a
  // situation where `nsMsgBrkMBoxStore::DiscoverSubFolders` (which
  // `AddSubfolder` ends up indirectly calling) gets confused because there are
  // files for a folder it doesn't have on record (see Bug 1889653). `GetFlags`
  // and `SetFlags` in `AddSubfolder` will fail because we have no db at this
  // point but mFlags is set.
  nsCOMPtr<nsIMsgFolder> child;
  nsresult rv = aParent->AddSubfolder(aFolderName, getter_AddRefs(child));
  if (!child || NS_FAILED(rv)) {
    return rv;
  }

  nsCOMPtr<nsIFile> path;
  rv = aParent->GetFilePath(getter_AddRefs(path));
  if (NS_FAILED(rv)) {
    aParent->PropagateDelete(child, false);
    return rv;
  }
  // Get a directory based on our current path.
  rv = CreateDirectoryForFolder(path);
  if (NS_FAILED(rv)) {
    aParent->PropagateDelete(child, false);
    return rv;
  }

  path->Append(safeFolderName16);
  bool exists;
  path->Exists(&exists);
  // check this because localized names are different from disk names
  if (exists) {
    aParent->PropagateDelete(child, false);
    return NS_MSG_FOLDER_EXISTS;
  }

  rv = path->Create(nsIFile::NORMAL_FILE_TYPE, 0600);
  if (NS_FAILED(rv)) {
    aParent->PropagateDelete(child, false);
    return rv;
  }

  // Create an empty database for this mail folder, set its name from the user
  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  if (msgDBService) {
    nsCOMPtr<nsIMsgDatabase> unusedDB;
    rv = msgDBService->OpenFolderDB(child, true, getter_AddRefs(unusedDB));
    if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING)
      rv = msgDBService->CreateNewDB(child, getter_AddRefs(unusedDB));

    if ((NS_SUCCEEDED(rv) || rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE) &&
        unusedDB) {
      // need to set the folder name
      nsCOMPtr<nsIDBFolderInfo> folderInfo;
      rv = unusedDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
      if (NS_SUCCEEDED(rv)) folderInfo->SetMailboxName(safeFolderName);

      unusedDB->SetSummaryValid(true);
      unusedDB->Close(true);
      aParent->UpdateSummaryTotals(true);
    } else {
      aParent->PropagateDelete(child, true);
      rv = NS_MSG_CANT_CREATE_FOLDER;
    }
  }
  child.forget(aResult);
  return rv;
}

// Get the current attributes of the mbox file, corrected for caching
void nsMsgBrkMBoxStore::GetMailboxModProperties(nsIMsgFolder* aFolder,
                                                int64_t* aSize,
                                                uint32_t* aDate) {
  // We'll simply return 0 on errors.
  *aDate = 0;
  *aSize = 0;
  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS_VOID(rv);

  rv = pathFile->GetFileSize(aSize);
  if (NS_FAILED(rv)) return;  // expected result for virtual folders

  PRTime lastModTime;
  rv = pathFile->GetLastModifiedTime(&lastModTime);
  NS_ENSURE_SUCCESS_VOID(rv);

  *aDate = (uint32_t)(lastModTime / PR_MSEC_PER_SEC);
}

NS_IMETHODIMP nsMsgBrkMBoxStore::HasSpaceAvailable(nsIMsgFolder* aFolder,
                                                   int64_t aSpaceRequested,
                                                   bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_ENSURE_ARG_POINTER(aFolder);

  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  bool allow4GBfolders =
      Preferences::GetBool("mailnews.allowMboxOver4GB", true);

  if (!allow4GBfolders) {
    // Allow the mbox to only reach 0xFFC00000 = 4 GiB - 4 MiB.
    int64_t fileSize;
    rv = pathFile->GetFileSize(&fileSize);
    NS_ENSURE_SUCCESS(rv, rv);

    *aResult = ((fileSize + aSpaceRequested) < 0xFFC00000LL);
    if (!*aResult) return NS_ERROR_FILE_TOO_BIG;
  }

  *aResult = DiskSpaceAvailableInStore(pathFile, aSpaceRequested);
  if (!*aResult) return NS_ERROR_FILE_NO_DEVICE_SPACE;

  return NS_OK;
}

static bool gGotGlobalPrefs = false;
static int32_t gTimeStampLeeway = 60;

NS_IMETHODIMP nsMsgBrkMBoxStore::IsSummaryFileValid(nsIMsgFolder* aFolder,
                                                    nsIMsgDatabase* aDB,
                                                    bool* aResult) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aDB);
  NS_ENSURE_ARG_POINTER(aResult);
  // We only check local folders for db validity.
  nsCOMPtr<nsIMsgLocalMailFolder> localFolder(do_QueryInterface(aFolder));
  if (!localFolder) {
    *aResult = true;
    return NS_OK;
  }

  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  rv = aDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
  NS_ENSURE_SUCCESS(rv, rv);
  int64_t folderSize;
  uint32_t folderDate;
  int32_t numUnreadMessages;

  *aResult = false;

  folderInfo->GetNumUnreadMessages(&numUnreadMessages);
  folderInfo->GetFolderSize(&folderSize);
  folderInfo->GetFolderDate(&folderDate);

  int64_t fileSize = 0;
  uint32_t actualFolderTimeStamp = 0;
  GetMailboxModProperties(aFolder, &fileSize, &actualFolderTimeStamp);

  if (folderSize == fileSize && numUnreadMessages >= 0) {
    if (!folderSize) {
      *aResult = true;
      return NS_OK;
    }
    if (!gGotGlobalPrefs) {
      Preferences::GetInt("mail.db_timestamp_leeway", &gTimeStampLeeway);
      gGotGlobalPrefs = true;
    }
    // if those values are ok, check time stamp
    if (gTimeStampLeeway == 0)
      *aResult = folderDate == actualFolderTimeStamp;
    else
      *aResult = std::abs((int32_t)(actualFolderTimeStamp - folderDate)) <=
                 gTimeStampLeeway;
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::SetSummaryFileValid(nsIMsgFolder* aFolder,
                                                     nsIMsgDatabase* aDB,
                                                     bool aValid) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aDB);
  // We only need to do this for local folders.
  nsCOMPtr<nsIMsgLocalMailFolder> localFolder(do_QueryInterface(aFolder));
  if (!localFolder) return NS_OK;

  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  rv = aDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
  NS_ENSURE_SUCCESS(rv, rv);
  bool exists;
  pathFile->Exists(&exists);
  if (!exists) return NS_MSG_ERROR_FOLDER_MISSING;

  if (aValid) {
    uint32_t actualFolderTimeStamp;
    int64_t fileSize;
    GetMailboxModProperties(aFolder, &fileSize, &actualFolderTimeStamp);
    folderInfo->SetFolderSize(fileSize);
    folderInfo->SetFolderDate(actualFolderTimeStamp);
  } else {
    folderInfo->SetVersion(0);  // that ought to do the trick.
  }
  aDB->Commit(nsMsgDBCommitType::kLargeCommit);
  return rv;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::DeleteFolder(nsIMsgFolder* folder) {
  NS_ENSURE_ARG_POINTER(folder);

  // Delete mbox file.
  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = folder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  bool mboxExists = false;
  pathFile->Exists(&mboxExists);
  if (mboxExists) {
    rv = pathFile->Remove(false);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Delete any subfolders (.sbd-suffixed directories).
  AddDirectorySeparator(pathFile);
  bool subdirExists = false;
  pathFile->Exists(&subdirExists);
  if (subdirExists) {
    rv = pathFile->Remove(true);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::RenameFolder(nsIMsgFolder* aFolder,
                                              const nsACString& aNewName,
                                              nsIMsgFolder** aNewFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aNewFolder);

  uint32_t numChildren;
  aFolder->GetNumSubFolders(&numChildren);

  nsCOMPtr<nsIFile> oldPathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(oldPathFile));
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIMsgFolder> parentFolder;
  rv = aFolder->GetParent(getter_AddRefs(parentFolder));
  if (!parentFolder) return NS_ERROR_NULL_POINTER;

  nsCOMPtr<nsIFile> oldSummaryFile;
  rv = aFolder->GetSummaryFile(getter_AddRefs(oldSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> dirFile;
  oldPathFile->Clone(getter_AddRefs(dirFile));

  if (numChildren > 0) {
    rv = CreateDirectoryForFolder(dirFile);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsString safeFolderName16 = NS_MsgHashIfNecessary(aNewName);
  nsAutoCString safeFolderName = NS_ConvertUTF16toUTF8(safeFolderName16);

  nsCOMPtr<nsIFile> parentPathFile;
  parentFolder->GetFilePath(getter_AddRefs(parentPathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isDirectory = false;
  parentPathFile->IsDirectory(&isDirectory);
  if (!isDirectory) {
    nsAutoString leafName;
    parentPathFile->GetLeafName(leafName);
    leafName.AppendLiteral(FOLDER_SUFFIX);
    rv = parentPathFile->SetLeafName(leafName);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  aFolder->ForceDBClosed();
  // save off dir name before appending .msf
  rv = oldPathFile->MoveTo(nullptr, safeFolderName16);
  if (NS_FAILED(rv)) return rv;

  nsString dbName(safeFolderName16);
  dbName.AppendLiteral(SUMMARY_SUFFIX);
  oldSummaryFile->MoveTo(nullptr, dbName);

  if (numChildren > 0) {
    // rename "*.sbd" directory
    nsAutoString newNameDirStr(safeFolderName16);
    newNameDirStr.AppendLiteral(FOLDER_SUFFIX);
    dirFile->MoveTo(nullptr, newNameDirStr);
  }

  return parentFolder->AddSubfolder(safeFolderName, aNewFolder);
}

NS_IMETHODIMP nsMsgBrkMBoxStore::CopyFolder(
    nsIMsgFolder* aSrcFolder, nsIMsgFolder* aDstFolder, bool aIsMoveFolder,
    nsIMsgWindow* aMsgWindow, nsIMsgCopyServiceListener* aListener,
    const nsACString& aNewName) {
  NS_ENSURE_ARG_POINTER(aSrcFolder);
  NS_ENSURE_ARG_POINTER(aDstFolder);

  nsAutoCString folderName;
  if (aNewName.IsEmpty()) {
    aSrcFolder->GetName(folderName);
  } else {
    folderName.Assign(aNewName);
  }

  nsString safeFolderName16 = NS_MsgHashIfNecessary(folderName);
  nsAutoCString safeFolderName = NS_ConvertUTF16toUTF8(safeFolderName16);

  nsCOMPtr<nsIMsgLocalMailFolder> localSrcFolder(do_QueryInterface(aSrcFolder));
  nsCOMPtr<nsIMsgDatabase> srcDB;
  if (localSrcFolder)
    localSrcFolder->GetDatabaseWOReparse(getter_AddRefs(srcDB));
  bool summaryValid = !!srcDB;
  srcDB = nullptr;
  aSrcFolder->ForceDBClosed();

  nsCOMPtr<nsIFile> oldPath;
  nsresult rv = aSrcFolder->GetFilePath(getter_AddRefs(oldPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> summaryFile;
  GetSummaryFileLocation(oldPath, getter_AddRefs(summaryFile));

  nsCOMPtr<nsIFile> newPath;
  rv = aDstFolder->GetFilePath(getter_AddRefs(newPath));
  NS_ENSURE_SUCCESS(rv, rv);

  bool newPathIsDirectory = false;
  newPath->IsDirectory(&newPathIsDirectory);
  if (!newPathIsDirectory) {
    AddDirectorySeparator(newPath);
    rv = newPath->Create(nsIFile::DIRECTORY_TYPE, 0700);
    if (rv == NS_ERROR_FILE_ALREADY_EXISTS) rv = NS_OK;
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIFile> origPath;
  oldPath->Clone(getter_AddRefs(origPath));

  // copying necessary for aborting.... if failure return
  rv = oldPath->CopyTo(newPath, safeFolderName16);
  NS_ENSURE_SUCCESS(rv, rv);  // Will fail if a file by that name exists

  // Copy to dir can fail if filespec does not exist. If copy fails, we test
  // if the filespec exist or not, if it does not that's ok, we continue
  // without copying it. If it fails and filespec exist and is not zero sized
  // there is real problem
  // Copy the file to the new dir
  nsAutoString dbName(safeFolderName16);
  dbName.AppendLiteral(SUMMARY_SUFFIX);
  rv = summaryFile->CopyTo(newPath, dbName);
  if (NS_FAILED(rv))  // Test if the copy is successful
  {
    // Test if the filespec has data
    bool exists;
    int64_t fileSize;
    summaryFile->Exists(&exists);
    summaryFile->GetFileSize(&fileSize);
    if (exists && fileSize > 0)
      NS_ENSURE_SUCCESS(rv, rv);  // Yes, it should have worked !
    // else case is filespec is zero sized, no need to copy it,
    // not an error
  }

  nsCOMPtr<nsIMsgFolder> newMsgFolder;
  rv = aDstFolder->AddSubfolder(safeFolderName, getter_AddRefs(newMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // linux and mac are not good about maintaining the file stamp when copying
  // folders around. So if the source folder db is good, set the dest db as
  // good too.
  nsCOMPtr<nsIMsgDatabase> destDB;
  if (summaryValid) {
    nsAutoString folderLeafName;
    origPath->GetLeafName(folderLeafName);
    newPath->Append(folderLeafName);
    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIFile> newDBFile;
    // "foo/bar/INBOX" -> "foo/bar/INBOX.msf"
    rv = GetSummaryFileLocation(newPath, getter_AddRefs(newDBFile));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = msgDBService->OpenDBFromFile(newDBFile, newMsgFolder, false, true,
                                      getter_AddRefs(destDB));
    if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE && destDB)
      destDB->SetSummaryValid(true);
  }
  newMsgFolder->SetName(folderName);
  uint32_t flags;
  aSrcFolder->GetFlags(&flags);
  newMsgFolder->SetFlags(flags);
  bool changed = false;
  rv = aSrcFolder->MatchOrChangeFilterDestination(newMsgFolder, true, &changed);
  if (changed) aSrcFolder->AlertFilterChanged(aMsgWindow);

  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  rv = aSrcFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  // Copy subfolders to the new location
  nsresult copyStatus = NS_OK;
  nsCOMPtr<nsIMsgLocalMailFolder> localNewFolder(
      do_QueryInterface(newMsgFolder, &rv));
  if (NS_SUCCEEDED(rv)) {
    for (nsIMsgFolder* folder : subFolders) {
      copyStatus =
          localNewFolder->CopyFolderLocal(folder, false, aMsgWindow, aListener);
      // Test if the call succeeded, if not we have to stop recursive call
      if (NS_FAILED(copyStatus)) {
        // Copy failed we have to notify caller to handle the error and stop
        // moving the folders. In case this happens to the topmost level of
        // recursive call, then we just need to break from the while loop and
        // go to error handling code.
        if (!aIsMoveFolder) return copyStatus;
        break;
      }
    }
  }

  if (aIsMoveFolder && NS_SUCCEEDED(copyStatus)) {
    if (localNewFolder) {
      nsCOMPtr<nsISupports> srcSupport(do_QueryInterface(aSrcFolder));
      localNewFolder->OnCopyCompleted(srcSupport, true);
    }

    // Notify the "folder" that was dragged and dropped has been created. No
    // need to do this for its subfolders. isMoveFolder will be true for folder.
    aDstFolder->NotifyFolderAdded(newMsgFolder);

    nsCOMPtr<nsIMsgFolder> msgParent;
    aSrcFolder->GetParent(getter_AddRefs(msgParent));
    aSrcFolder->SetParent(nullptr);
    if (msgParent) {
      // The files have already been moved, so delete storage false
      msgParent->PropagateDelete(aSrcFolder, false);
      oldPath->Remove(false);  // berkeley mailbox
      aSrcFolder->DeleteStorage();

      nsCOMPtr<nsIFile> parentPath;
      rv = msgParent->GetFilePath(getter_AddRefs(parentPath));
      NS_ENSURE_SUCCESS(rv, rv);

      AddDirectorySeparator(parentPath);
      nsCOMPtr<nsIDirectoryEnumerator> children;
      parentPath->GetDirectoryEntries(getter_AddRefs(children));
      bool more;
      // checks if the directory is empty or not
      if (children && NS_SUCCEEDED(children->HasMoreElements(&more)) && !more)
        parentPath->Remove(true);
    }
  } else {
    // This is the case where the copy of a subfolder failed.
    // We have to delete the newDirectory tree to make a "rollback".
    // Someone should add a popup to warn the user that the move was not
    // possible.
    if (aIsMoveFolder && NS_FAILED(copyStatus)) {
      nsCOMPtr<nsIMsgFolder> msgParent;
      newMsgFolder->ForceDBClosed();
      newMsgFolder->GetParent(getter_AddRefs(msgParent));
      newMsgFolder->SetParent(nullptr);
      if (msgParent) {
        msgParent->PropagateDelete(newMsgFolder, false);
        newMsgFolder->DeleteStorage();
        AddDirectorySeparator(newPath);
        newPath->Remove(true);  // berkeley mailbox
      }
      return NS_ERROR_FAILURE;
    }
  }
  return NS_OK;
}

// If the given folder has a write in progress, discard it.
// NOTE: in theory, we could have multiple writes going if we were using
// Quarantining. But in practice the protocol => folder interfaces assume a
// single message at a time for now.
nsresult nsMsgBrkMBoxStore::InvalidateOngoingWrite(nsIMsgFolder* folder) {
  MOZ_ASSERT(folder);
  auto existing = mOngoingWrites.lookup(folder->URI());
  if (existing) {
    // boooo....
    MOZ_LOG(gMboxLog, LogLevel::Warning,
            ("PREEMPTING WRITE stream=0x%p folder='%s' (roll back to filepos "
             "%" PRIu64 ")",
             existing->value().stream.get(), folder->URI().get(),
             existing->value().filePos));
    NS_WARNING(
        nsPrintfCString("Already writing to folder '%s'", folder->URI().get())
            .get());
    // Close the old stream - this will roll back everything it wrote.
    existing->value().stream->Close();
    mOngoingWrites.remove(existing);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::GetNewMsgOutputStream(nsIMsgFolder* folder,
                                         nsIOutputStream** outStream) {
  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG_POINTER(outStream);

  nsresult rv;
  // First, check the mOngoingWrites set to make sure we're not already
  // writing to this folder. If so, we'll abort and roll back the previous one
  // before issuing a new stream.
  rv = InvalidateOngoingWrite(folder);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> mboxFile;
  rv = folder->GetFilePath(getter_AddRefs(mboxFile));
  NS_ENSURE_SUCCESS(rv, rv);
  MOZ_LOG(gMboxLog, LogLevel::Info,
          ("Opening mbox file '%s' for writing.",
           mboxFile->HumanReadablePath().get()));

  bool exists = false;
  mboxFile->Exists(&exists);
  if (!exists) {
    MOZ_LOG(gMboxLog, LogLevel::Info,
            ("'%s' does not exist, so creating it now.",
             mboxFile->HumanReadablePath().get()));
    rv = mboxFile->Create(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // We want a buffered, mbox-aware stream. Some wrapping is required.
  nsCOMPtr<nsIOutputStream> stream;
  int64_t filePos = 0;
  {
    nsCOMPtr<nsIOutputStream> rawStream;
    rv = NS_NewLocalFileOutputStream(getter_AddRefs(rawStream), mboxFile,
                                     PR_WRONLY | PR_CREATE_FILE | PR_APPEND,
                                     00600);
    if (NS_FAILED(rv)) {
      MOZ_LOG(gMboxLog, LogLevel::Error,
              ("failed opening offline store for %s", folder->URI().get()));
    }
    NS_ENSURE_SUCCESS(rv, rv);

    // 2**16 buffer size for good performance in 2024?
    nsCOMPtr<nsIOutputStream> bufferedStream;
    rv = NS_NewBufferedOutputStream(getter_AddRefs(bufferedStream),
                                    rawStream.forget(), 65536);
    if (NS_FAILED(rv)) {
      MOZ_LOG(gMboxLog, LogLevel::Error,
              ("failed opening buffered stream for %s", folder->URI().get()));
    }
    NS_ENSURE_SUCCESS(rv, rv);

    // Jump to the end of the file (and record position for new message).
    nsCOMPtr<nsISeekableStream> seekable(
        do_QueryInterface(bufferedStream, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = seekable->Seek(nsISeekableStream::NS_SEEK_END, 0);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = seekable->Tell(&filePos);
    NS_ENSURE_SUCCESS(rv, rv);

    // Wrap to handle mbox "From " separator, escaping etc.
    RefPtr<MboxMsgOutputStream> mboxStream =
        new MboxMsgOutputStream(bufferedStream, true);

    if (Preferences::GetBool("mailnews.downloadToTempFile", false)) {
      // If quarantining, add another wrapping stream.
      stream = new nsQuarantinedOutputStream(mboxStream);
      MOZ_LOG(gMboxLog, LogLevel::Info,
              ("START-Q MSG stream=0x%p folder=%s offset=%" PRIi64 "",
               stream.get(), folder->URI().get(), filePos));
    } else {
      stream = mboxStream;
      MOZ_LOG(gMboxLog, LogLevel::Info,
              ("START MSG stream=0x%p folder=%s offset=%" PRIi64 "",
               stream.get(), folder->URI().get(), filePos));
    }
  }

  // Up and running - add the stream to the set of ongoing writes.
  MOZ_ALWAYS_TRUE(mOngoingWrites.putNew(folder->URI(),
                                        StreamDetails{filePos, stream.get()}));

  stream.forget(outStream);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::FinishNewMessage(nsIMsgFolder* folder,
                                    nsIOutputStream* outStream,
                                    nsACString& storeToken) {
  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG(outStream);

  auto details = mOngoingWrites.lookup(folder->URI());
  if (!details) {
    // We should have a record of the write!
    return NS_ERROR_UNEXPECTED;
  }

  // Should be the stream we issued originally!
  MOZ_ASSERT(outStream == details->value().stream);

  // We are always dealing with nsISafeOutputStream.
  // It requires an explicit commit, or the data will be discarded.
  nsCOMPtr<nsISafeOutputStream> safe = do_QueryInterface(outStream);
  MOZ_ASSERT(safe);
  // Commit the write.
  nsresult rv = safe->Finish();
  NS_ENSURE_SUCCESS(rv, rv);

  storeToken = nsPrintfCString("%" PRId64, details->value().filePos);

  // The write is all done.
  mOngoingWrites.remove(details);

  MOZ_LOG(gMboxLog, LogLevel::Info,
          ("FINISH MSG stream=0x%p folder=%s storeToken=%s", outStream,
           folder->URI().get(), nsPromiseFlatCString(storeToken).get()));
  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::DiscardNewMessage(nsIMsgFolder* folder,
                                     nsIOutputStream* outStream) {
  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG(outStream);

  auto details = mOngoingWrites.lookup(folder->URI());
  // Ideally, the stream we're discarding is the one in mOngoingWrites, in
  // which case we can just remove it.
  // BUT.
  // If the write was preempted, this stream will already have been
  // discarded and the mOngoingWrites table will refer to the more recent
  // write. We don't want to blat over that, so check first.
  if (details && outStream == details->value().stream) {
    mOngoingWrites.remove(details);
    MOZ_LOG(gMboxLog, LogLevel::Info,
            ("DISCARD MSG stream=0x%p folder=%s filePos=%" PRId64 "", outStream,
             folder->URI().get(), details->value().filePos));

  } else {
    MOZ_LOG(gMboxLog, LogLevel::Warning,
            ("DISCARD MSG (preempted) stream=0x%p folder=%s", outStream,
             folder->URI().get()));
  }

  // Safe to close the stream in any case.
  outStream->Close();

  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::MoveNewlyDownloadedMessage(nsIMsgDBHdr* aNewHdr,
                                              nsIMsgFolder* aDestFolder,
                                              bool* aResult) {
  NS_ENSURE_ARG_POINTER(aNewHdr);
  NS_ENSURE_ARG_POINTER(aDestFolder);
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::GetMsgInputStream(nsIMsgFolder* aMsgFolder,
                                     const nsACString& aMsgToken,
                                     uint32_t aMaxAllowedSize,
                                     nsIInputStream** aResult) {
  NS_ENSURE_ARG_POINTER(aMsgFolder);
  NS_ENSURE_ARG_POINTER(aResult);
  MOZ_ASSERT(!aMsgToken.IsEmpty());

  uint64_t offset = ParseUint64Str(PromiseFlatCString(aMsgToken).get());
  nsCOMPtr<nsIFile> mboxFile;
  nsresult rv = aMsgFolder->GetFilePath(getter_AddRefs(mboxFile));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIInputStream> rawMboxStream;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(rawMboxStream), mboxFile);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsISeekableStream> seekable(do_QueryInterface(rawMboxStream));
  rv = seekable->Seek(PR_SEEK_SET, offset);
  NS_ENSURE_SUCCESS(rv, rv);
  // Build stream to return a single message from the msgStore.
  // NOTE: It turns out that Seek()ing way past the end of the file doesn't
  // cause an error. And reading from there doesn't return an error either
  // (just an EOF).
  // But it's OK - MboxMsgInputStream will handle that case, and its Read()
  // method will safely return an error (NS_MSG_ERROR_MBOX_MALFORMED).
  RefPtr<MboxMsgInputStream> msgStream =
      new MboxMsgInputStream(rawMboxStream, aMaxAllowedSize);
  msgStream.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::DeleteMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray) {
  if (aHdrArray.IsEmpty()) {
    return NS_OK;  // noop.
  }
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = aHdrArray[0]->GetFolder(getter_AddRefs(folder));
  nsTArray<nsCString> storeTokens;
  for (nsIMsgDBHdr* msg : aHdrArray) {
    nsAutoCString tok;
    rv = msg->GetStoreToken(tok);
    NS_ENSURE_SUCCESS(rv, rv);
    storeTokens.AppendElement(tok);
  }
  return DeleteStoreMessages(folder, storeTokens);
}

NS_IMETHODIMP nsMsgBrkMBoxStore::DeleteStoreMessages(
    nsIMsgFolder* folder, nsTArray<nsCString> const& storeTokens) {
  NS_ENSURE_ARG(folder);
  if (storeTokens.IsEmpty()) {
    return NS_OK;  // Early out, don't need to open file.
  }

  nsCOMPtr<nsIFile> mboxFile;
  nsresult rv = folder->GetFilePath(getter_AddRefs(mboxFile));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIRandomAccessStream> stream;
  rv = NS_NewLocalFileRandomAccessStream(getter_AddRefs(stream), mboxFile);
  NS_ENSURE_SUCCESS(rv, rv);

  for (size_t i = 0; i < storeTokens.Length(); ++i) {
    // Jump to start of message.
    uint64_t msgStart = storeTokens[i].ToInteger64(&rv);
    NS_ENSURE_SUCCESS(rv, rv);
    // Set Expunged in X-Mozilla-Status.
    auto details = FindXMozillaStatusHeaders(stream, msgStart);
    uint32_t newFlags = details.msgFlags | nsMsgMessageFlags::Expunged;
    rv = PatchXMozillaStatusHeaders(stream, msgStart, details, newFlags);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  SetDBValid(folder);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::CopyMessages(bool isMove,
                                const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray,
                                nsIMsgFolder* aDstFolder,
                                nsTArray<RefPtr<nsIMsgDBHdr>>& aDstHdrs,
                                nsITransaction** aUndoAction, bool* aCopyDone) {
  NS_ENSURE_ARG_POINTER(aDstFolder);
  NS_ENSURE_ARG_POINTER(aCopyDone);
  aDstHdrs.Clear();
  *aUndoAction = nullptr;
  // We return false to indicate there's no shortcut. The calling code will
  // just have to perform the copy the hard way.
  *aCopyDone = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::AsyncScan(nsIMsgFolder* folder,
                                           nsIStoreScanListener* scanListener) {
  nsCOMPtr<nsIFile> mboxPath;
  nsresult rv = folder->GetFilePath(getter_AddRefs(mboxPath));
  NS_ENSURE_SUCCESS(rv, rv);
  // Fire and forget. MboxScanner will hold itself in existence until finished.
  RefPtr<MboxScanner> scanner(new MboxScanner());
  return scanner->BeginScan(mboxPath, scanListener);
}

void nsMsgBrkMBoxStore::SetDBValid(nsIMsgFolder* folder) {
  nsCOMPtr<nsIMsgDatabase> db;
  folder->GetMsgDatabase(getter_AddRefs(db));
  if (db) {
    SetSummaryFileValid(folder, db, true);
  }
}

NS_IMETHODIMP nsMsgBrkMBoxStore::ChangeFlags(
    nsIMsgFolder* folder, nsTArray<nsCString> const& storeTokens,
    nsTArray<uint32_t> const& newFlags) {
  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG(storeTokens.Length() == newFlags.Length());

  if (storeTokens.IsEmpty()) {
    return NS_OK;  // Early out, don't need to open file.
  }

  nsCOMPtr<nsIFile> mboxFile;
  nsresult rv = folder->GetFilePath(getter_AddRefs(mboxFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIRandomAccessStream> stream;
  rv = NS_NewLocalFileRandomAccessStream(getter_AddRefs(stream), mboxFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  for (size_t i = 0; i < storeTokens.Length(); ++i) {
    // Jump to start of message.
    uint64_t msgStart = storeTokens[i].ToInteger64(&rv);
    NS_ENSURE_SUCCESS(rv, rv);
    // Replace flags in X-Mozilla-Status and X-Mozilla-Status2.
    auto details = FindXMozillaStatusHeaders(stream, msgStart);
    rv = PatchXMozillaStatusHeaders(stream, msgStart, details, newFlags[i]);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  SetDBValid(folder);
  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::ChangeKeywords(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray, const nsACString& aKeywords,
    bool aAdd) {
  if (aHdrArray.IsEmpty()) return NS_ERROR_INVALID_ARG;

  nsresult rv;
  nsTArray<nsCString> keywordsToAdd;
  nsTArray<nsCString> keywordsToRemove;
  if (aAdd) {
    ParseString(aKeywords, ' ', keywordsToAdd);
  } else {
    ParseString(aKeywords, ' ', keywordsToRemove);
  }

  nsCOMPtr<nsIMsgFolder> folder;
  rv = aHdrArray[0]->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> mboxFile;
  rv = folder->GetFilePath(getter_AddRefs(mboxFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIRandomAccessStream> stream;
  rv = NS_NewLocalFileRandomAccessStream(getter_AddRefs(stream), mboxFile);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto msgHdr : aHdrArray) {
    nsAutoCString storeToken;
    rv = msgHdr->GetStoreToken(storeToken);
    NS_ENSURE_SUCCESS(rv, rv);
    uint64_t msgStart = storeToken.ToInteger64(&rv);
    NS_ENSURE_SUCCESS(rv, rv);
    stream->Seek(nsISeekableStream::NS_SEEK_SET, msgStart);
    NS_ENSURE_SUCCESS(rv, rv);

    bool notEnoughRoom;
    rv = ChangeKeywordsHelper(stream, keywordsToAdd, keywordsToRemove,
                              notEnoughRoom);

    NS_ENSURE_SUCCESS(rv, rv);
    if (notEnoughRoom) {
      // The growKeywords property indicates that the X-Mozilla-Keys header
      // doesn't have enough space, and should be rebuilt during the next
      // folder compaction.
      msgHdr->SetUint32Property("growKeywords", 1);
    }
  }

  SetDBValid(folder);
  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::GetStoreType(nsACString& aType) {
  aType.AssignLiteral("mbox");
  return NS_OK;
}

/* Finds the directory associated with this folder.  That is if the path is
   c:\Inbox, it will return c:\Inbox.sbd if it succeeds.  If that path doesn't
   currently exist then it will create it. Path is strictly an out parameter.
  */
nsresult nsMsgBrkMBoxStore::CreateDirectoryForFolder(nsIFile* path) {
  nsresult rv = NS_OK;

  bool pathIsDirectory = false;
  path->IsDirectory(&pathIsDirectory);
  if (!pathIsDirectory) {
    // If the current path isn't a directory, add directory separator
    // and test it out.
    nsAutoString leafName;
    path->GetLeafName(leafName);
    leafName.AppendLiteral(FOLDER_SUFFIX);
    rv = path->SetLeafName(leafName);
    if (NS_FAILED(rv)) return rv;

    // If that doesn't exist, then we have to create this directory
    pathIsDirectory = false;
    path->IsDirectory(&pathIsDirectory);
    if (!pathIsDirectory) {
      bool pathExists;
      path->Exists(&pathExists);
      // If for some reason there's a file with the directory separator
      // then we are going to fail.
      rv = pathExists ? NS_MSG_COULD_NOT_CREATE_DIRECTORY
                      : path->Create(nsIFile::DIRECTORY_TYPE, 0700);
    }
  }
  return rv;
}

// For mbox store, we'll just use mbox file size as our estimate.
NS_IMETHODIMP nsMsgBrkMBoxStore::EstimateFolderSize(nsIMsgFolder* folder,
                                                    int64_t* size) {
  MOZ_ASSERT(size);

  *size = 0;
  bool isServer = false;
  nsresult rv = folder->GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);
  if (isServer) {
    return NS_OK;
  }
  nsCOMPtr<nsIFile> file;
  rv = folder->GetFilePath(getter_AddRefs(file));
  NS_ENSURE_SUCCESS(rv, rv);
  // There can be cases where the mbox file won't exist (e.g. non-offline
  // IMAP folder). Return 0 size for that case.
  bool exists;
  rv = file->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (exists) {
    rv = file->GetFileSize(size);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgBrkMBoxStore::GetSupportsCompaction(bool* aSupportsCompaction) {
  NS_ENSURE_ARG_POINTER(aSupportsCompaction);
  *aSupportsCompaction = true;
  return NS_OK;
}

NS_IMETHODIMP nsMsgBrkMBoxStore::AsyncCompact(
    nsIMsgFolder* folder, nsIStoreCompactListener* compactListener,
    bool patchXMozillaHeaders) {
  nsCOMPtr<nsIFile> srcMbox;
  nsresult rv = folder->GetFilePath(getter_AddRefs(srcMbox));
  NS_ENSURE_SUCCESS(rv, rv);

  // Fire and forget. MboxScanner will hold itself in existence until finished.
  RefPtr<MboxCompactor> compactor = new MboxCompactor();
  return compactor->BeginCompaction(srcMbox, compactListener,
                                    patchXMozillaHeaders);
}
