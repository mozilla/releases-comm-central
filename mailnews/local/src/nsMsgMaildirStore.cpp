/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Class for handling Maildir stores.
*/

#include "MailNewsTypes.h"
#include "nsMsgMessageFlags.h"
#include "prprf.h"
#include "msgCore.h"
#include "nsMsgMaildirStore.h"
#include "nsIMsgFolder.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIDirectoryEnumerator.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsCOMArray.h"
#include "nsIFile.h"
#include "nsNetUtil.h"
#include "nsIMsgDatabase.h"
#include "nsMsgUtils.h"
#include "nsIDBFolderInfo.h"
#include "nsParseMailbox.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMailboxUrl.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgFilterPlugin.h"
#include "nsLocalUndoTxn.h"
#include "nsIMessenger.h"
#include "nsThreadUtils.h"
#include "mozilla/Logging.h"
#include "mozilla/SlicedInputStream.h"

static mozilla::LazyLogModule MailDirLog("MailDirStore");

/*
 * MaildirScanner is a helper class for implementing
 * nsMsgMaildirStore::AsyncScan().
 *
 * It derives from nsIStreamListener purely as an implementation detail,
 * using itself as a listener to handle async streaming of message data.
 * nsIStreamListener shouldn't be considered part of the public interface.
 *
 * It keeps a self reference, which will be released when the operation is
 * finished. So the caller doesn't need to hold onto it.
 */
class MaildirScanner : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER

  // Start scanning.
  // If an error occurs here, it'll be returned directly and no listener
  // methods will be called.
  nsresult BeginScan(nsIFile* mboxFile, nsIStoreScanListener* scanListener);

 private:
  virtual ~MaildirScanner() {}

  void NextFile();

  nsCOMPtr<nsIStoreScanListener> mScanListener;

  RefPtr<MaildirScanner> mKungFuDeathGrip;
  nsresult mStatus{NS_OK};
  nsCOMPtr<nsIDirectoryEnumerator> mDirEnumerator;
  // Pump to use sync stream as async.
  nsCOMPtr<nsIInputStreamPump> mPump;
};

NS_IMPL_ISUPPORTS(MaildirScanner, nsIStreamListener)

nsresult MaildirScanner::BeginScan(nsIFile* maildirPath,
                                   nsIStoreScanListener* scanListener) {
  MOZ_ASSERT(scanListener);
  MOZ_ASSERT(!mScanListener);
  MOZ_ASSERT(!mKungFuDeathGrip);

  mScanListener = scanListener;

  nsCOMPtr<nsIFile> cur;
  maildirPath->Clone(getter_AddRefs(cur));
  cur->Append(u"cur"_ns);

  nsresult rv = cur->GetDirectoryEntries(getter_AddRefs(mDirEnumerator));
  NS_ENSURE_SUCCESS(rv, rv);

  // We're up and running. Hold ourself in existence until scan is complete.
  mKungFuDeathGrip = this;

  // Kick off via dispatch, so the first callbacks will be properly async.
  // (otherwise the first callbacks will be called before BeginScan() finishes,
  // which should be fine, but just seems a bit inconsistent).
  RefPtr<MaildirScanner> self = this;
  NS_DispatchToMainThread(
      NS_NewRunnableFunction("Maildir BeginScan kickoff", [self] {
        self->mScanListener->OnStartScan();
        self->NextFile();
      }));
  return NS_OK;
}

// The main driver. Returns no error code. If an error occurs, the mStatus
// member is set and the appropriate nsIStoreScanListener callbacks are
// invoked.
void MaildirScanner::NextFile() {
  nsCOMPtr<nsIFile> f;
  if (NS_SUCCEEDED(mStatus)) {
    mStatus = mDirEnumerator->GetNextFile(getter_AddRefs(f));
  }
  if (NS_SUCCEEDED(mStatus) && f) {
    // Try and provide the listener a sensible(ish) envDate.
    PRTime mtime;
    nsresult rv = f->GetLastModifiedTime(&mtime);
    if (NS_FAILED(rv)) {
      mtime = 0;
    }

    // Start streaming the next message.
    nsAutoCString storeToken;
    f->GetNativeLeafName(storeToken);
    mStatus = mScanListener->OnStartMessage(storeToken, ""_ns, mtime);

    nsCOMPtr<nsIInputStream> stream;
    if (NS_SUCCEEDED(mStatus)) {
      mStatus = NS_NewLocalFileInputStream(getter_AddRefs(stream), f);
    }
    nsCOMPtr<nsIInputStreamPump> pump;
    if (NS_SUCCEEDED(mStatus)) {
      mStatus = NS_NewInputStreamPump(getter_AddRefs(pump), stream.forget());
    }
    if (NS_SUCCEEDED(mStatus)) {
      mPump = pump;  // Keep the pump in existence until we're done.
      mStatus = mPump->AsyncRead(this);
    }
  }

  if (!f || NS_FAILED(mStatus)) {
    // We've finished (or failed).
    mScanListener->OnStopScan(mStatus);
    mPump = nullptr;
    mKungFuDeathGrip = nullptr;
  }
}

NS_IMETHODIMP MaildirScanner::OnStartRequest(nsIRequest* req) {
  mStatus = mScanListener->OnStartRequest(req);
  return mStatus;
}

NS_IMETHODIMP MaildirScanner::OnDataAvailable(nsIRequest* req,
                                              nsIInputStream* stream,
                                              uint64_t offset, uint32_t count) {
  mStatus = mScanListener->OnDataAvailable(req, stream, offset, count);
  return mStatus;
}

NS_IMETHODIMP MaildirScanner::OnStopRequest(nsIRequest* req, nsresult status) {
  mScanListener->OnStopRequest(req, status);
  mStatus = status;
  NextFile();
  return NS_OK;
}

// Helper function to produce a safe filename from a Message-ID value.
// We'll percent-encode anything not in this set: [-+.%=@_0-9a-zA-Z]
// This is an overly-picky set, but should:
//  - leave most sane Message-IDs unchanged
//  - be safe on windows (the pickiest case)
//  - avoid chars that can trip up shell scripts (spaces, semicolons etc)
// If input contains malicious binary (or multibyte chars) it'll be
// safely encoded as individual bytes.
static void percentEncode(nsACString const& in, nsACString& out) {
  const char* end = in.EndReading();
  const char* cur;
  // We know the output will be at least as long as the input.
  out.SetLength(0);
  out.SetCapacity(in.Length());
  for (cur = in.BeginReading(); cur < end; ++cur) {
    const char c = *cur;
    bool whitelisted = (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') ||
                       (c >= 'a' && c <= 'z') || c == '-' || c == '+' ||
                       c == '.' || c == '%' || c == '=' || c == '@' || c == '_';
    if (whitelisted) {
      out.Append(c);
    } else {
      out.AppendPrintf("%%%02x", (unsigned char)c);
    }
  }
}

nsMsgMaildirStore::nsMsgMaildirStore() {}

nsMsgMaildirStore::~nsMsgMaildirStore() {}

NS_IMPL_ISUPPORTS(nsMsgMaildirStore, nsIMsgPluggableStore)

// Iterates over the folders in the "path" directory, and adds subfolders to
// parent for each Maildir folder found.
nsresult nsMsgMaildirStore::AddSubFolders(nsIMsgFolder* parent, nsIFile* path,
                                          bool deep) {
  nsCOMArray<nsIFile> currentDirEntries;

  nsCOMPtr<nsIDirectoryEnumerator> directoryEnumerator;
  nsresult rv = path->GetDirectoryEntries(getter_AddRefs(directoryEnumerator));
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasMore;
  while (NS_SUCCEEDED(directoryEnumerator->HasMoreElements(&hasMore)) &&
         hasMore) {
    nsCOMPtr<nsIFile> currentFile;
    rv = directoryEnumerator->GetNextFile(getter_AddRefs(currentFile));
    if (NS_SUCCEEDED(rv) && currentFile) {
      nsAutoString leafName;
      currentFile->GetLeafName(leafName);
      bool isDirectory = false;
      currentFile->IsDirectory(&isDirectory);
      // Make sure this really is a mail folder dir (i.e., a directory that
      // contains cur and tmp sub-dirs, and not a .sbd or .mozmsgs dir).
      if (isDirectory && !nsShouldIgnoreFile(leafName, currentFile))
        currentDirEntries.AppendObject(currentFile);
    }
  }

  // add the folders
  int32_t count = currentDirEntries.Count();
  for (int32_t i = 0; i < count; ++i) {
    nsCOMPtr<nsIFile> currentFile(currentDirEntries[i]);

    nsAutoString leafName;
    currentFile->GetLeafName(leafName);

    nsCOMPtr<nsIMsgFolder> child;
    rv = parent->AddSubfolder(leafName, getter_AddRefs(child));
    if (child) {
      nsString folderName;
      child->GetName(folderName);  // try to get it from cache/db
      if (folderName.IsEmpty()) child->SetPrettyName(leafName);
      if (deep) {
        nsCOMPtr<nsIFile> path;
        rv = child->GetFilePath(getter_AddRefs(path));
        NS_ENSURE_SUCCESS(rv, rv);

        // Construct the .sbd directory path for the possible children of the
        // folder.
        GetDirectoryForFolder(path);
        bool directory = false;
        // Check that <folder>.sbd really is a directory.
        path->IsDirectory(&directory);
        if (directory) AddSubFolders(child, path, true);
      }
    }
  }
  return rv == NS_MSG_FOLDER_EXISTS ? NS_OK : rv;
}

NS_IMETHODIMP nsMsgMaildirStore::DiscoverSubFolders(nsIMsgFolder* aParentFolder,
                                                    bool aDeep) {
  NS_ENSURE_ARG_POINTER(aParentFolder);

  nsCOMPtr<nsIFile> path;
  nsresult rv = aParentFolder->GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isServer, directory = false;
  aParentFolder->GetIsServer(&isServer);
  if (!isServer) GetDirectoryForFolder(path);

  path->IsDirectory(&directory);
  if (directory) rv = AddSubFolders(aParentFolder, path, aDeep);

  return (rv == NS_MSG_FOLDER_EXISTS) ? NS_OK : rv;
}

/**
 * Create if missing a Maildir-style folder with "tmp" and "cur" subfolders
 * but no "new" subfolder, because it doesn't make sense in the mail client
 * context. ("new" directory is for messages on the server that haven't been
 *  seen by a mail client).
 * aFolderName is already "safe" - it has been through NS_MsgHashIfNecessary.
 */
nsresult nsMsgMaildirStore::CreateMaildir(nsIFile* path) {
  nsresult rv = path->Create(nsIFile::DIRECTORY_TYPE, 0700);
  if (NS_FAILED(rv) && rv != NS_ERROR_FILE_ALREADY_EXISTS) {
    NS_WARNING("Could not create root directory for message folder");
    return rv;
  }

  // Create tmp, cur leaves
  nsCOMPtr<nsIFile> leaf(do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  leaf->InitWithFile(path);

  leaf->AppendNative("tmp"_ns);
  rv = leaf->Create(nsIFile::DIRECTORY_TYPE, 0700);
  if (NS_FAILED(rv) && rv != NS_ERROR_FILE_ALREADY_EXISTS) {
    NS_WARNING("Could not create tmp directory for message folder");
    return rv;
  }

  leaf->SetNativeLeafName("cur"_ns);
  rv = leaf->Create(nsIFile::DIRECTORY_TYPE, 0700);
  if (NS_FAILED(rv) && rv != NS_ERROR_FILE_ALREADY_EXISTS) {
    NS_WARNING("Could not create cur directory for message folder");
    return rv;
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::CreateFolder(nsIMsgFolder* aParent,
                                              const nsAString& aFolderName,
                                              nsIMsgFolder** aResult) {
  NS_ENSURE_ARG_POINTER(aParent);
  NS_ENSURE_ARG_POINTER(aResult);
  if (aFolderName.IsEmpty()) return NS_MSG_ERROR_INVALID_FOLDER_NAME;

  nsCOMPtr<nsIFile> path;
  nsresult rv = aParent->GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  // Get a directory based on our current path
  bool isServer;
  aParent->GetIsServer(&isServer);
  rv = CreateDirectoryForFolder(path, isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  // Make sure the new folder name is valid
  nsAutoString safeFolderName(aFolderName);
  NS_MsgHashIfNecessary(safeFolderName);

  path->Append(safeFolderName);
  bool exists;
  path->Exists(&exists);
  if (exists)  // check this because localized names are different from disk
               // names
    return NS_MSG_FOLDER_EXISTS;

  rv = CreateMaildir(path);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> child;
  // GetFlags and SetFlags in AddSubfolder will fail because we have no db at
  // this point but mFlags is set.
  rv = aParent->AddSubfolder(safeFolderName, getter_AddRefs(child));
  if (!child || NS_FAILED(rv)) {
    path->Remove(true);  // recursive
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
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("CreateFolder - failed creating db for new folder"));
      path->Remove(true);  // recursive
      rv = NS_MSG_CANT_CREATE_FOLDER;
    }
  }
  child.forget(aResult);
  return rv;
}

NS_IMETHODIMP nsMsgMaildirStore::HasSpaceAvailable(nsIMsgFolder* aFolder,
                                                   int64_t aSpaceRequested,
                                                   bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  NS_ENSURE_ARG_POINTER(aFolder);

  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  *aResult = DiskSpaceAvailableInStore(pathFile, aSpaceRequested);
  if (!*aResult) return NS_ERROR_FILE_NO_DEVICE_SPACE;

  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::IsSummaryFileValid(nsIMsgFolder* aFolder,
                                                    nsIMsgDatabase* aDB,
                                                    bool* aResult) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aDB);
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = true;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  aDB->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
  nsresult rv =
      dbFolderInfo->GetBooleanProperty("maildirValid", false, aResult);
  if (!*aResult) {
    nsCOMPtr<nsIFile> newFile;
    rv = aFolder->GetFilePath(getter_AddRefs(newFile));
    NS_ENSURE_SUCCESS(rv, rv);
    newFile->Append(u"cur"_ns);

    // If the "cur" sub-dir doesn't exist, and there are no messages
    // in the db, then the folder is probably new and the db is valid.
    bool exists;
    newFile->Exists(&exists);
    if (!exists) {
      int32_t numMessages;
      dbFolderInfo->GetNumMessages(&numMessages);
      if (!numMessages) *aResult = true;
    }
  }
  return rv;
}

NS_IMETHODIMP nsMsgMaildirStore::SetSummaryFileValid(nsIMsgFolder* aFolder,
                                                     nsIMsgDatabase* aDB,
                                                     bool aValid) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aDB);
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  aDB->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
  NS_ENSURE_STATE(dbFolderInfo);
  return dbFolderInfo->SetBooleanProperty("maildirValid", aValid);
}

NS_IMETHODIMP nsMsgMaildirStore::DeleteFolder(nsIMsgFolder* aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);
  bool exists;

  // Delete the Maildir itself.
  nsCOMPtr<nsIFile> pathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(pathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  exists = false;
  pathFile->Exists(&exists);
  if (exists) {
    rv = pathFile->Remove(true);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Delete any subfolders (.sbd-suffixed directories).
  AddDirectorySeparator(pathFile);
  exists = false;
  pathFile->Exists(&exists);
  if (exists) {
    rv = pathFile->Remove(true);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::RenameFolder(nsIMsgFolder* aFolder,
                                              const nsAString& aNewName,
                                              nsIMsgFolder** aNewFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aNewFolder);

  // old path
  nsCOMPtr<nsIFile> oldPathFile;
  nsresult rv = aFolder->GetFilePath(getter_AddRefs(oldPathFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // old sbd directory
  nsCOMPtr<nsIFile> sbdPathFile;
  uint32_t numChildren;
  aFolder->GetNumSubFolders(&numChildren);
  if (numChildren > 0) {
    sbdPathFile = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = sbdPathFile->InitWithFile(oldPathFile);
    NS_ENSURE_SUCCESS(rv, rv);
    GetDirectoryForFolder(sbdPathFile);
  }

  // old summary
  nsCOMPtr<nsIFile> oldSummaryFile;
  rv = aFolder->GetSummaryFile(getter_AddRefs(oldSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // Validate new name
  nsAutoString safeName(aNewName);
  NS_MsgHashIfNecessary(safeName);

  aFolder->ForceDBClosed();

  // rename folder
  rv = oldPathFile->MoveTo(nullptr, safeName);
  NS_ENSURE_SUCCESS(rv, rv);

  if (numChildren > 0) {
    // rename "*.sbd" directory
    nsAutoString sbdName = safeName;
    sbdName.AppendLiteral(FOLDER_SUFFIX);
    sbdPathFile->MoveTo(nullptr, sbdName);
  }

  // rename summary
  nsAutoString summaryName(safeName);
  summaryName.AppendLiteral(SUMMARY_SUFFIX);
  oldSummaryFile->MoveTo(nullptr, summaryName);

  nsCOMPtr<nsIMsgFolder> parentFolder;
  rv = aFolder->GetParent(getter_AddRefs(parentFolder));
  if (!parentFolder) return NS_ERROR_NULL_POINTER;

  return parentFolder->AddSubfolder(safeName, aNewFolder);
}

NS_IMETHODIMP nsMsgMaildirStore::CopyFolder(
    nsIMsgFolder* aSrcFolder, nsIMsgFolder* aDstFolder, bool aIsMoveFolder,
    nsIMsgWindow* aMsgWindow, nsIMsgCopyServiceListener* aListener,
    const nsAString& aNewName) {
  NS_ENSURE_ARG_POINTER(aSrcFolder);
  NS_ENSURE_ARG_POINTER(aDstFolder);

  nsAutoString folderName;
  if (aNewName.IsEmpty())
    aSrcFolder->GetName(folderName);
  else
    folderName.Assign(aNewName);

  nsAutoString safeFolderName(folderName);
  NS_MsgHashIfNecessary(safeFolderName);
  aSrcFolder->ForceDBClosed();

  nsCOMPtr<nsIFile> oldPath;
  nsresult rv = aSrcFolder->GetFilePath(getter_AddRefs(oldPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> summaryFile;
  GetSummaryFileLocation(oldPath, getter_AddRefs(summaryFile));

  nsCOMPtr<nsIFile> newPath;
  rv = aDstFolder->GetFilePath(getter_AddRefs(newPath));
  NS_ENSURE_SUCCESS(rv, rv);

  // create target directory based on our current path
  bool isServer;
  aDstFolder->GetIsServer(&isServer);
  rv = CreateDirectoryForFolder(newPath, isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> origPath;
  oldPath->Clone(getter_AddRefs(origPath));

  rv = oldPath->CopyTo(newPath, safeFolderName);
  NS_ENSURE_SUCCESS(rv, rv);  // will fail if a file by that name exists

  // Copy to dir can fail if file does not exist. If copy fails, we test
  // if the file exists or not, if it does not that's ok, we continue
  // without copying it. If it fails and file exist and is not zero sized
  // there is real problem.
  nsAutoString dbName(safeFolderName);
  dbName.AppendLiteral(SUMMARY_SUFFIX);
  rv = summaryFile->CopyTo(newPath, dbName);
  if (!NS_SUCCEEDED(rv)) {
    // Test if the file is not empty
    bool exists;
    int64_t fileSize;
    summaryFile->Exists(&exists);
    summaryFile->GetFileSize(&fileSize);
    if (exists && fileSize > 0)
      NS_ENSURE_SUCCESS(rv, rv);  // Yes, it should have worked!
    // else case is file is zero sized, no need to copy it,
    // not an error
    // else case is file does not exist - not an error
  }

  nsCOMPtr<nsIMsgFolder> newMsgFolder;
  rv = aDstFolder->AddSubfolder(safeFolderName, getter_AddRefs(newMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  newMsgFolder->SetPrettyName(folderName);
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

    // Notify that the folder that was dragged and dropped has been created.
    // No need to do this for its subfolders - isMoveFolder will be true for
    // folder.
    aDstFolder->NotifyFolderAdded(newMsgFolder);

    nsCOMPtr<nsIMsgFolder> msgParent;
    aSrcFolder->GetParent(getter_AddRefs(msgParent));
    aSrcFolder->SetParent(nullptr);
    if (msgParent) {
      // The files have already been moved, so delete storage false
      msgParent->PropagateDelete(aSrcFolder, false);
      oldPath->Remove(true);
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

NS_IMETHODIMP
nsMsgMaildirStore::GetNewMsgOutputStream(nsIMsgFolder* aFolder,
                                         nsIMsgDBHdr** aNewMsgHdr,
                                         nsIOutputStream** aResult) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_ENSURE_ARG_POINTER(aNewMsgHdr);
  NS_ENSURE_ARG_POINTER(aResult);

  nsCOMPtr<nsIMsgDatabase> db;
  nsresult rv = aFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!*aNewMsgHdr) {
    rv = db->CreateNewHdr(nsMsgKey_None, aNewMsgHdr);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  // With maildir, messages have whole file to themselves.
  (*aNewMsgHdr)->SetMessageOffset(0);

  // We're going to save the new message into the maildir 'tmp' folder.
  // When the message is completed, it can be moved to 'cur'.
  nsCOMPtr<nsIFile> newFile;
  rv = aFolder->GetFilePath(getter_AddRefs(newFile));
  NS_ENSURE_SUCCESS(rv, rv);
  newFile->Append(u"tmp"_ns);

  // let's check if the folder exists
  // XXX TODO: kill this and make sure maildir creation includes cur/tmp
  bool exists;
  newFile->Exists(&exists);
  if (!exists) {
    MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
            ("GetNewMsgOutputStream - tmp subfolder does not exist!!"));
    rv = newFile->Create(nsIFile::DIRECTORY_TYPE, 0755);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Generate the 'tmp' file name based on timestamp.
  // (We'll use the Message-ID as the basis for the final filename,
  // but we don't have headers at this point).
  nsAutoCString newName;
  newName.AppendInt(static_cast<int64_t>(PR_Now()));
  newFile->AppendNative(newName);

  // CreateUnique, in case we get more than one message per millisecond :-)
  rv = newFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
  NS_ENSURE_SUCCESS(rv, rv);
  newFile->GetNativeLeafName(newName);
  // save the file name in the message header - otherwise no way to retrieve it
  (*aNewMsgHdr)->SetStringProperty("storeToken", newName);

  return MsgNewBufferedFileOutputStream(aResult, newFile,
                                        PR_WRONLY | PR_CREATE_FILE, 00600);
}

NS_IMETHODIMP
nsMsgMaildirStore::DiscardNewMessage(nsIOutputStream* aOutputStream,
                                     nsIMsgDBHdr* aNewHdr) {
  NS_ENSURE_ARG_POINTER(aOutputStream);
  NS_ENSURE_ARG_POINTER(aNewHdr);

  aOutputStream->Close();
  // file path is stored in message header property "storeToken"
  nsAutoCString fileName;
  aNewHdr->GetStringProperty("storeToken", fileName);
  if (fileName.IsEmpty()) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIFile> path;
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = aNewHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folder->GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  // path to the message download folder
  path->Append(u"tmp"_ns);
  path->AppendNative(fileName);

  return path->Remove(false);
}

NS_IMETHODIMP
nsMsgMaildirStore::FinishNewMessage(nsIOutputStream* aOutputStream,
                                    nsIMsgDBHdr* aNewHdr) {
  NS_ENSURE_ARG_POINTER(aOutputStream);
  NS_ENSURE_ARG_POINTER(aNewHdr);

  aOutputStream->Close();

  nsCOMPtr<nsIFile> folderPath;
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = aNewHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folder->GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  // tmp filename is stored in "storeToken".
  // By now we'll have the Message-ID, which we'll base the final filename on.
  nsAutoCString tmpName;
  aNewHdr->GetStringProperty("storeToken", tmpName);
  if (tmpName.IsEmpty()) {
    NS_ERROR("FinishNewMessage - no storeToken in msg hdr!!");
    return NS_ERROR_FAILURE;
  }

  // path to the new destination
  nsCOMPtr<nsIFile> curPath;
  folderPath->Clone(getter_AddRefs(curPath));
  curPath->Append(u"cur"_ns);

  // let's check if the folder exists
  // XXX TODO: kill this and make sure maildir creation includes cur/tmp
  bool exists;
  curPath->Exists(&exists);
  if (!exists) {
    rv = curPath->Create(nsIFile::DIRECTORY_TYPE, 0755);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // path to the downloaded message
  nsCOMPtr<nsIFile> fromPath;
  folderPath->Clone(getter_AddRefs(fromPath));
  fromPath->Append(u"tmp"_ns);
  fromPath->AppendNative(tmpName);

  // Check that the message is still in tmp.
  // XXX TODO: revisit this. I think it's needed because the
  // pairing rules for:
  // GetNewMsgOutputStream(), FinishNewMessage(),
  // MoveNewlyDownloadedMessage() and DiscardNewMessage()
  // are not well defined.
  // If they are sorted out, this code can be removed.
  fromPath->Exists(&exists);
  if (!exists) {
    // Perhaps the message has already moved. See bug 1028372 to fix this.
    nsCOMPtr<nsIFile> existingPath;
    curPath->Clone(getter_AddRefs(existingPath));
    existingPath->AppendNative(tmpName);
    existingPath->Exists(&exists);
    if (exists)  // then there is nothing to do
      return NS_OK;

    NS_ERROR("FinishNewMessage - oops! file does not exist!");
    return NS_ERROR_FILE_NOT_FOUND;
  }

  nsCString msgID;
  aNewHdr->GetMessageId(msgID);

  nsCString baseName;
  // For missing or suspiciously-short Message-IDs, use a timestamp
  // instead.
  // This also avoids some special filenames we can't use in windows (CON,
  // AUX, NUL, LPT1 etc...). With an extension (eg "LPT4.txt") they're all
  // below 9 chars.
  if (msgID.Length() < 9) {
    baseName.AppendInt(static_cast<int64_t>(PR_Now()));
  } else {
    percentEncode(msgID, baseName);
    // No length limit on Message-Id header, but lets clip our filenames
    // well below any MAX_PATH limits.
    if (baseName.Length() > (128 - 4)) {
      baseName.SetLength(128 - 4);  // (4 for ".eml")
    }
  }

  nsCOMPtr<nsIFile> toPath;
  curPath->Clone(getter_AddRefs(toPath));
  nsCString toName(baseName);
  toName.Append(".eml");
  toPath->AppendNative(toName);

  // Using CreateUnique in case we have duplicate Message-Ids
  rv = toPath->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
  if (NS_FAILED(rv)) {
    // NS_ERROR_FILE_TOO_BIG means CreateUnique() bailed out at 10000 attempts.
    if (rv != NS_ERROR_FILE_TOO_BIG) {
      NS_ENSURE_SUCCESS(rv, rv);
    }
    // As a last resort, fall back to using timestamp as filename.
    toName.SetLength(0);
    toName.AppendInt(static_cast<int64_t>(PR_Now()));
    toName.Append(".eml");
    toPath->SetNativeLeafName(toName);
    rv = toPath->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Move into place (using whatever name CreateUnique() settled upon).
  toPath->GetNativeLeafName(toName);
  rv = fromPath->MoveToNative(curPath, toName);
  NS_ENSURE_SUCCESS(rv, rv);
  // Update the db to reflect the final filename.
  aNewHdr->SetStringProperty("storeToken", toName);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgMaildirStore::MoveNewlyDownloadedMessage(nsIMsgDBHdr* aHdr,
                                              nsIMsgFolder* aDestFolder,
                                              bool* aResult) {
  NS_ENSURE_ARG_POINTER(aHdr);
  NS_ENSURE_ARG_POINTER(aDestFolder);
  NS_ENSURE_ARG_POINTER(aResult);

  nsCOMPtr<nsIFile> folderPath;
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = aHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folder->GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  // file path is stored in message header property
  nsAutoCString fileName;
  aHdr->GetStringProperty("storeToken", fileName);
  if (fileName.IsEmpty()) {
    NS_ERROR("FinishNewMessage - no storeToken in msg hdr!!");
    return NS_ERROR_FAILURE;
  }

  // path to the downloaded message
  nsCOMPtr<nsIFile> fromPath;
  folderPath->Clone(getter_AddRefs(fromPath));
  fromPath->Append(u"cur"_ns);
  fromPath->AppendNative(fileName);

  // let's check if the tmp file exists
  bool exists;
  fromPath->Exists(&exists);
  if (!exists) {
    NS_ERROR("FinishNewMessage - oops! file does not exist!");
    return NS_ERROR_FAILURE;
  }

  // move to the "cur" subfolder
  nsCOMPtr<nsIFile> toPath;
  aDestFolder->GetFilePath(getter_AddRefs(folderPath));
  folderPath->Clone(getter_AddRefs(toPath));
  toPath->Append(u"cur"_ns);

  // let's check if the folder exists
  // XXX TODO: kill this and make sure maildir creation includes cur/tmp
  toPath->Exists(&exists);
  if (!exists) {
    rv = toPath->Create(nsIFile::DIRECTORY_TYPE, 0755);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgDatabase> destMailDB;
  rv = aDestFolder->GetMsgDatabase(getter_AddRefs(destMailDB));
  NS_WARNING_ASSERTION(destMailDB && NS_SUCCEEDED(rv),
                       "failed to open mail db moving message");

  nsCOMPtr<nsIMsgDBHdr> newHdr;
  if (destMailDB)
    rv = destMailDB->CopyHdrFromExistingHdr(nsMsgKey_None, aHdr, true,
                                            getter_AddRefs(newHdr));
  if (NS_SUCCEEDED(rv) && !newHdr) rv = NS_ERROR_UNEXPECTED;

  if (NS_FAILED(rv)) {
    aDestFolder->ThrowAlertMsg("filterFolderHdrAddFailed", nullptr);
    return rv;
  }

  nsCOMPtr<nsIFile> existingPath;
  toPath->Clone(getter_AddRefs(existingPath));
  existingPath->AppendNative(fileName);
  existingPath->Exists(&exists);

  if (exists) {
    rv = existingPath->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
    existingPath->GetNativeLeafName(fileName);
    newHdr->SetStringProperty("storeToken", fileName);
  }

  rv = fromPath->MoveToNative(toPath, fileName);
  *aResult = NS_SUCCEEDED(rv);
  if (NS_FAILED(rv))
    aDestFolder->ThrowAlertMsg("filterFolderWriteFailed", nullptr);

  if (NS_FAILED(rv)) {
    if (destMailDB) destMailDB->Close(true);

    return NS_MSG_ERROR_WRITING_MAIL_FOLDER;
  }

  bool movedMsgIsNew = false;
  // if we have made it this far then the message has successfully been
  // written to the new folder now add the header to the destMailDB.

  uint32_t newFlags;
  newHdr->GetFlags(&newFlags);
  nsMsgKey msgKey;
  newHdr->GetMessageKey(&msgKey);
  if (!(newFlags & nsMsgMessageFlags::Read)) {
    nsCString junkScoreStr;
    (void)newHdr->GetStringProperty("junkscore", junkScoreStr);
    if (atoi(junkScoreStr.get()) != nsIJunkMailPlugin::IS_SPAM_SCORE) {
      newHdr->OrFlags(nsMsgMessageFlags::New, &newFlags);
      destMailDB->AddToNewList(msgKey);
      movedMsgIsNew = true;
    }
  }

  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) notifier->NotifyMsgAdded(newHdr);

  if (movedMsgIsNew) {
    aDestFolder->SetHasNewMessages(true);

    // Notify the message was moved.
    if (notifier) {
      notifier->NotifyMsgUnincorporatedMoved(folder, newHdr);
    }
  }

  nsCOMPtr<nsIMsgDatabase> sourceDB;
  rv = folder->GetMsgDatabase(getter_AddRefs(sourceDB));

  if (NS_SUCCEEDED(rv) && sourceDB) sourceDB->RemoveHeaderMdbRow(aHdr);

  destMailDB->SetSummaryValid(true);
  aDestFolder->UpdateSummaryTotals(true);
  destMailDB->Commit(nsMsgDBCommitType::kLargeCommit);
  return rv;
}

NS_IMETHODIMP
nsMsgMaildirStore::GetMsgInputStream(nsIMsgFolder* aMsgFolder,
                                     const nsACString& aMsgToken,
                                     nsIInputStream** aResult) {
  NS_ENSURE_ARG_POINTER(aMsgFolder);
  NS_ENSURE_ARG_POINTER(aResult);

  // construct path to file
  nsCOMPtr<nsIFile> path;
  nsresult rv = aMsgFolder->GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  if (aMsgToken.IsEmpty()) {
    MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
            ("GetMsgInputStream - empty storeToken!!"));
    return NS_ERROR_FAILURE;
  }

  path->Append(u"cur"_ns);

  // let's check if the folder exists
  // XXX TODO: kill this and make sure maildir creation includes cur/tmp
  bool exists;
  path->Exists(&exists);
  if (!exists) {
    MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
            ("GetMsgInputStream - oops! cur subfolder does not exist!"));
    rv = path->Create(nsIFile::DIRECTORY_TYPE, 0755);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  path->AppendNative(aMsgToken);
  return NS_NewLocalFileInputStream(aResult, path);
}

NS_IMETHODIMP nsMsgMaildirStore::DeleteMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray) {
  nsCOMPtr<nsIMsgFolder> folder;

  for (auto msgHdr : aHdrArray) {
    msgHdr->GetFolder(getter_AddRefs(folder));
    nsCOMPtr<nsIFile> path;
    nsresult rv = folder->GetFilePath(getter_AddRefs(path));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString fileName;
    msgHdr->GetStringProperty("storeToken", fileName);

    if (fileName.IsEmpty()) {
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("DeleteMessages - empty storeToken!!"));
      // Perhaps an offline store has not downloaded this particular message.
      continue;
    }

    path->Append(u"cur"_ns);
    path->AppendNative(fileName);

    // Let's check if the message exists.
    bool exists;
    path->Exists(&exists);
    if (!exists) {
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("DeleteMessages - file does not exist !!"));
      // Perhaps an offline store has not downloaded this particular message.
      continue;
    }
    path->Remove(false);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgMaildirStore::CopyMessages(bool aIsMove,
                                const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray,
                                nsIMsgFolder* aDstFolder,
                                nsTArray<RefPtr<nsIMsgDBHdr>>& aDstHdrs,
                                nsITransaction** aUndoAction, bool* aCopyDone) {
  NS_ENSURE_ARG_POINTER(aDstFolder);
  NS_ENSURE_ARG_POINTER(aCopyDone);
  NS_ENSURE_ARG_POINTER(aUndoAction);

  *aCopyDone = false;
  if (aHdrArray.IsEmpty()) {
    return NS_ERROR_INVALID_ARG;
  }
  nsCOMPtr<nsIMsgFolder> srcFolder;
  nsresult rv;
  nsIMsgDBHdr* msgHdr = aHdrArray[0];
  rv = msgHdr->GetFolder(getter_AddRefs(srcFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Both source and destination folders must use maildir type store.
  nsCOMPtr<nsIMsgPluggableStore> srcStore;
  nsAutoCString srcType;
  srcFolder->GetMsgStore(getter_AddRefs(srcStore));
  if (srcStore) srcStore->GetStoreType(srcType);
  nsCOMPtr<nsIMsgPluggableStore> dstStore;
  nsAutoCString dstType;
  aDstFolder->GetMsgStore(getter_AddRefs(dstStore));
  if (dstStore) dstStore->GetStoreType(dstType);
  if (!srcType.EqualsLiteral("maildir") || !dstType.EqualsLiteral("maildir"))
    return NS_OK;

  // Both source and destination must be local folders. In theory we could
  //   do efficient copies of the offline store of IMAP, but this is not
  //   supported yet. For that, we need to deal with both correct handling
  //   of deletes from the src server, and msgKey = UIDL in the dst folder.
  nsCOMPtr<nsIMsgLocalMailFolder> destLocalFolder(
      do_QueryInterface(aDstFolder));
  if (!destLocalFolder) return NS_OK;
  nsCOMPtr<nsIMsgLocalMailFolder> srcLocalFolder(do_QueryInterface(srcFolder));
  if (!srcLocalFolder) return NS_OK;

  // We should be able to use a file move for an efficient copy.

  nsCOMPtr<nsIFile> destFolderPath;
  nsCOMPtr<nsIMsgDatabase> destDB;
  aDstFolder->GetMsgDatabase(getter_AddRefs(destDB));
  rv = aDstFolder->GetFilePath(getter_AddRefs(destFolderPath));
  NS_ENSURE_SUCCESS(rv, rv);
  destFolderPath->Append(u"cur"_ns);

  nsCOMPtr<nsIFile> srcFolderPath;
  rv = srcFolder->GetFilePath(getter_AddRefs(srcFolderPath));
  NS_ENSURE_SUCCESS(rv, rv);
  srcFolderPath->Append(u"cur"_ns);

  nsCOMPtr<nsIMsgDatabase> srcDB;
  srcFolder->GetMsgDatabase(getter_AddRefs(srcDB));
  RefPtr<nsLocalMoveCopyMsgTxn> msgTxn = new nsLocalMoveCopyMsgTxn;
  NS_ENSURE_TRUE(msgTxn, NS_ERROR_OUT_OF_MEMORY);
  if (NS_SUCCEEDED(msgTxn->Init(srcFolder, aDstFolder, aIsMove))) {
    if (aIsMove)
      msgTxn->SetTransactionType(nsIMessenger::eMoveMsg);
    else
      msgTxn->SetTransactionType(nsIMessenger::eCopyMsg);
  }

  aDstHdrs.Clear();
  aDstHdrs.SetCapacity(aHdrArray.Length());

  for (auto srcHdr : aHdrArray) {
    nsMsgKey srcKey;
    srcHdr->GetMessageKey(&srcKey);
    msgTxn->AddSrcKey(srcKey);
    nsAutoCString fileName;
    srcHdr->GetStringProperty("storeToken", fileName);
    if (fileName.IsEmpty()) {
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("GetMsgInputStream - empty storeToken!!"));
      return NS_ERROR_FAILURE;
    }

    nsCOMPtr<nsIFile> srcFile;
    rv = srcFolderPath->Clone(getter_AddRefs(srcFile));
    NS_ENSURE_SUCCESS(rv, rv);
    srcFile->AppendNative(fileName);

    nsCOMPtr<nsIFile> destFile;
    destFolderPath->Clone(getter_AddRefs(destFile));
    destFile->AppendNative(fileName);
    bool exists;
    destFile->Exists(&exists);
    if (exists) {
      rv = destFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
      NS_ENSURE_SUCCESS(rv, rv);
      destFile->GetNativeLeafName(fileName);
    }
    if (aIsMove)
      rv = srcFile->MoveToNative(destFolderPath, fileName);
    else
      rv = srcFile->CopyToNative(destFolderPath, fileName);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgDBHdr> destHdr;
    if (destDB) {
      rv = destDB->CopyHdrFromExistingHdr(nsMsgKey_None, srcHdr, true,
                                          getter_AddRefs(destHdr));
      NS_ENSURE_SUCCESS(rv, rv);
      destHdr->SetStringProperty("storeToken", fileName);
      aDstHdrs.AppendElement(destHdr);
      nsMsgKey dstKey;
      destHdr->GetMessageKey(&dstKey);
      msgTxn->AddDstKey(dstKey);
    }
  }
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) {
    notifier->NotifyMsgsMoveCopyCompleted(aIsMove, aHdrArray, aDstFolder,
                                          aDstHdrs);
  }

  // For now, we only support local dest folders, and for those we are done and
  // can delete the messages. Perhaps this should be moved into the folder
  // when we try to support other folder types.
  if (aIsMove) {
    for (auto msgDBHdr : aHdrArray) {
      srcDB->DeleteHeader(msgDBHdr, nullptr, false, true);
    }
  }

  *aCopyDone = true;
  msgTxn.forget(aUndoAction);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgMaildirStore::GetSupportsCompaction(bool* aSupportsCompaction) {
  NS_ENSURE_ARG_POINTER(aSupportsCompaction);
  *aSupportsCompaction = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::AsyncCompact(
    nsIMsgFolder* folder, nsIStoreCompactListener* compactListener,
    bool patchXMozillaHeaders) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgMaildirStore::AsyncScan(nsIMsgFolder* folder,
                                           nsIStoreScanListener* scanListener) {
  nsCOMPtr<nsIFile> maildirPath;
  nsresult rv = folder->GetFilePath(getter_AddRefs(maildirPath));
  NS_ENSURE_SUCCESS(rv, rv);
  // Fire and forget. MaildirScanner will hold itself in existence until
  // finished.
  RefPtr<MaildirScanner> scanner(new MaildirScanner());
  return scanner->BeginScan(maildirPath, scanListener);
}

NS_IMETHODIMP nsMsgMaildirStore::ChangeFlags(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray, uint32_t aFlags,
    bool aSet) {
  for (auto msgHdr : aHdrArray) {
    // get output stream for header
    nsCOMPtr<nsIOutputStream> outputStream;
    nsresult rv = GetOutputStream(msgHdr, outputStream);
    NS_ENSURE_SUCCESS(rv, rv);

    // Work out the flags we want to write.
    uint32_t flags = 0;
    (void)msgHdr->GetFlags(&flags);
    flags &= ~(nsMsgMessageFlags::RuntimeOnly | nsMsgMessageFlags::Offline);
    if (aSet) {
      flags |= aFlags;
    } else {
      flags &= ~aFlags;
    }

    // Rewrite X-Mozilla-Status headers.
    nsCOMPtr<nsISeekableStream> seekable(do_QueryInterface(outputStream, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = RewriteMsgFlags(seekable, flags);
    if (NS_FAILED(rv)) NS_WARNING("updateFolderFlag failed");
  }
  return NS_OK;
}

// get output stream from header
nsresult nsMsgMaildirStore::GetOutputStream(
    nsIMsgDBHdr* aHdr, nsCOMPtr<nsIOutputStream>& aOutputStream) {
  // file name is stored in message header property "storeToken"
  nsAutoCString fileName;
  aHdr->GetStringProperty("storeToken", fileName);
  if (fileName.IsEmpty()) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = aHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> folderPath;
  rv = folder->GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> maildirFile;
  folderPath->Clone(getter_AddRefs(maildirFile));
  maildirFile->Append(u"cur"_ns);
  maildirFile->AppendNative(fileName);

  return MsgGetFileStream(maildirFile, getter_AddRefs(aOutputStream));
}

NS_IMETHODIMP nsMsgMaildirStore::ChangeKeywords(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray, const nsACString& aKeywords,
    bool aAdd) {
  if (aHdrArray.IsEmpty()) return NS_ERROR_INVALID_ARG;

  nsTArray<nsCString> keywordsToAdd;
  nsTArray<nsCString> keywordsToRemove;
  if (aAdd) {
    ParseString(aKeywords, ' ', keywordsToAdd);
  } else {
    ParseString(aKeywords, ' ', keywordsToRemove);
  }

  for (auto msgHdr : aHdrArray) {
    // Open the message file.
    nsCOMPtr<nsIOutputStream> output;
    nsresult rv = GetOutputStream(msgHdr, output);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsISeekableStream> seekable(do_QueryInterface(output, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    bool notEnoughRoom;
    rv = ChangeKeywordsHelper(seekable, keywordsToAdd, keywordsToRemove,
                              notEnoughRoom);
    NS_ENSURE_SUCCESS(rv, rv);
    if (notEnoughRoom) {
      // The growKeywords property indicates that the X-Mozilla-Keys header
      // doesn't have enough space, and should be rebuilt during the next
      // folder compaction.
      // TODO: For maildir there is no compaction, so this'll have no effect!
      msgHdr->SetUint32Property("growKeywords", 1);
    }
    output->Close();
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::GetStoreType(nsACString& aType) {
  aType.AssignLiteral("maildir");
  return NS_OK;
}

/**
 * Finds the directory associated with this folder. That is if the path is
 * c:\Inbox, it will return c:\Inbox.sbd if it succeeds. Path is strictly
 * an out parameter.
 */
nsresult nsMsgMaildirStore::GetDirectoryForFolder(nsIFile* path) {
  // add directory separator to the path
  nsAutoString leafName;
  path->GetLeafName(leafName);
  leafName.AppendLiteral(FOLDER_SUFFIX);
  return path->SetLeafName(leafName);
}

nsresult nsMsgMaildirStore::CreateDirectoryForFolder(nsIFile* path,
                                                     bool aIsServer) {
  nsresult rv = NS_OK;
  if (!aIsServer) {
    rv = GetDirectoryForFolder(path);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  bool pathIsDirectory = false;
  path->IsDirectory(&pathIsDirectory);
  if (!pathIsDirectory) {
    bool pathExists;
    path->Exists(&pathExists);
    // If for some reason there's a file with the directory separator
    // then we are going to fail.
    rv = pathExists ? NS_MSG_COULD_NOT_CREATE_DIRECTORY
                    : path->Create(nsIFile::DIRECTORY_TYPE, 0700);
  }
  return rv;
}

// For maildir store, our estimate is just the total of the file sizes.
NS_IMETHODIMP nsMsgMaildirStore::EstimateFolderSize(nsIMsgFolder* folder,
                                                    int64_t* size) {
  MOZ_ASSERT(size);
  *size = 0;
  bool isServer = false;
  nsresult rv = folder->GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);
  if (isServer) {
    return NS_OK;
  }

  nsCOMPtr<nsIFile> cur;
  rv = folder->GetFilePath(getter_AddRefs(cur));
  NS_ENSURE_SUCCESS(rv, rv);
  cur->Append(u"cur"_ns);

  nsCOMPtr<nsIDirectoryEnumerator> dirEnumerator;
  rv = cur->GetDirectoryEntries(getter_AddRefs(dirEnumerator));
  NS_ENSURE_SUCCESS(rv, rv);

  int64_t total = 0;
  while (true) {
    nsCOMPtr<nsIFile> f;
    rv = dirEnumerator->GetNextFile(getter_AddRefs(f));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!f) {
      break;  // No more files.
    }

    // Shouldn't have any subdirs in here, but if we do, skip 'em.
    bool isDir;
    rv = f->IsDirectory(&isDir);
    NS_ENSURE_SUCCESS(rv, rv);
    if (isDir) {
      continue;
    }

    int64_t s;
    rv = f->GetFileSize(&s);
    NS_ENSURE_SUCCESS(rv, rv);
    total += s;
  }
  *size = total;
  return NS_OK;
}
