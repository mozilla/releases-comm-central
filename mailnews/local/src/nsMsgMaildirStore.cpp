/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
   Class for handling Maildir stores.
*/

#include "FolderPopulation.h"
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
#include "nsIRandomAccessStream.h"
#include "nsCOMArray.h"
#include "nsIFile.h"
#include "nsLocalFile.h"
#include "nsNetUtil.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsMsgUtils.h"
#include "nsIDBFolderInfo.h"
#include "nsPrintfCString.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgFilterPlugin.h"  // For nsIJunkMailPlugin::IS_SPAM_SCORE.
#include "nsLocalUndoTxn.h"
#include "nsIMessenger.h"
#include "nsThreadUtils.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/ScopeExit.h"

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
  nsresult rv = maildirPath->Clone(getter_AddRefs(cur));
  NS_ENSURE_SUCCESS(rv, rv);
  cur->Append(u"cur"_ns);

  rv = cur->GetDirectoryEntries(getter_AddRefs(mDirEnumerator));
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
    nsAutoString storeToken;
    f->GetLeafName(storeToken);
    mStatus = mScanListener->OnStartMessage(NS_ConvertUTF16toUTF8(storeToken),
                                            ""_ns, mtime);

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

// Helper to get one of the special maildir subdirs ("cur" or "tmp", since
// we don't really use "new'). Creates the directory if it doesn't exist.
static nsresult EnsureSubDir(nsIMsgFolder* folder, nsAString const& subName,
                             nsIFile** result) {
  nsCOMPtr<nsIFile> path;
  nsresult rv = folder->GetFilePath(getter_AddRefs(path));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ENSURE_SUCCESS(rv, rv);
  path->Append(subName);

  bool exists;
  rv = path->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) {
    rv = path->Create(nsIFile::DIRECTORY_TYPE, 0700);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  path.forget(result);
  return NS_OK;
}

nsMsgMaildirStore::nsMsgMaildirStore() {
  // Hostname is part of the traditional maildir file naming.
  // A blank or truncated hostname isn't ideal, but neither is it fatal - it
  // doesn't add any real uniqueness to our filenames.
  char hostName[64];
  if (PR_GetSystemInfo(PR_SI_HOSTNAME, hostName, sizeof hostName) ==
      PR_SUCCESS) {
    // NUL-terminator is not guaranteed if truncated.
    hostName[sizeof hostName - 1] = '\0';
    mHostname = hostName;
  }
}

nsMsgMaildirStore::~nsMsgMaildirStore() {}

NS_IMPL_ISUPPORTS(nsMsgMaildirStore, nsIMsgPluggableStore)

nsCString nsMsgMaildirStore::UniqueName() {
  // Generate a unique filename.
  // (see https://cr.yp.to/proto/maildir.html )
  //
  // The form we'll use is:
  // "{seconds}.M{microseconds}P{pid}Q{count}.{hostname}"
  PRTime now = PR_Now();
  int64_t seconds = now / PR_USEC_PER_SEC;
  int64_t microsecs = now % PR_USEC_PER_SEC;
  ++mUniqueCount;

  return nsPrintfCString("%" PRId64 ".M%" PRId64 "P%ldQ%d.%s", seconds,
                         microsecs, (long)getpid(), mUniqueCount,
                         mHostname.get());
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
  if (directory) rv = PopulateFolderHierarchy(aParentFolder, this, true);

  return (rv == NS_MSG_FOLDER_EXISTS) ? NS_OK : rv;
}

NS_IMETHODIMP nsMsgMaildirStore::DiscoverChildFolders(
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
    if (!isDir) {
      continue;  // Not interested in files.
    }
    if (nsShouldIgnoreFile(child)) {
      continue;  // Not interested.
    }

    // If we get this far, we treat it as a child maildir.
    nsAutoString dirName;
    MOZ_TRY(child->GetLeafName(dirName));

    children.AppendElement(DecodeFilename(dirName));
  }

  return NS_OK;
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
  nsCOMPtr<nsIFile> leaf = new nsLocalFile();
  rv = leaf->InitWithFile(path);
  NS_ENSURE_SUCCESS(rv, rv);

  leaf->Append(u"tmp"_ns);
  rv = leaf->Create(nsIFile::DIRECTORY_TYPE, 0700);
  if (NS_FAILED(rv) && rv != NS_ERROR_FILE_ALREADY_EXISTS) {
    NS_WARNING("Could not create tmp directory for message folder");
    return rv;
  }

  leaf->SetLeafName(u"cur"_ns);
  rv = leaf->Create(nsIFile::DIRECTORY_TYPE, 0700);
  if (NS_FAILED(rv) && rv != NS_ERROR_FILE_ALREADY_EXISTS) {
    NS_WARNING("Could not create cur directory for message folder");
    return rv;
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::CreateFolder(nsIMsgFolder* aParent,
                                              const nsACString& aFolderName,
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
  nsString safeFolderName16 = NS_MsgHashIfNecessary(aFolderName);
  nsAutoCString safeFolderName = NS_ConvertUTF16toUTF8(safeFolderName16);

  path->Append(safeFolderName16);
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
                                              const nsACString& aNewName,
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
    sbdPathFile = new nsLocalFile();
    rv = sbdPathFile->InitWithFile(oldPathFile);
    NS_ENSURE_SUCCESS(rv, rv);
    GetDirectoryForFolder(sbdPathFile);
  }

  // old summary
  nsCOMPtr<nsIFile> oldSummaryFile;
  rv = aFolder->GetSummaryFile(getter_AddRefs(oldSummaryFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // Validate new name
  nsString safeFolderName16 = NS_MsgHashIfNecessary(aNewName);
  nsAutoCString safeFolderName = NS_ConvertUTF16toUTF8(safeFolderName16);

  aFolder->ForceDBClosed();

  // rename folder
  rv = oldPathFile->MoveTo(nullptr, safeFolderName16);
  NS_ENSURE_SUCCESS(rv, rv);

  if (numChildren > 0) {
    // rename "*.sbd" directory
    nsAutoString sbdName(safeFolderName16);
    sbdName.AppendLiteral(FOLDER_SUFFIX);
    sbdPathFile->MoveTo(nullptr, sbdName);
  }

  // rename summary
  nsAutoString summaryName(safeFolderName16);
  summaryName.AppendLiteral(SUMMARY_SUFFIX);
  oldSummaryFile->MoveTo(nullptr, summaryName);

  nsCOMPtr<nsIMsgFolder> parentFolder;
  rv = aFolder->GetParent(getter_AddRefs(parentFolder));
  if (!parentFolder) return NS_ERROR_NULL_POINTER;

  return parentFolder->AddSubfolder(safeFolderName, aNewFolder);
}

NS_IMETHODIMP nsMsgMaildirStore::CopyFolder(
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
  rv = oldPath->Clone(getter_AddRefs(origPath));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = oldPath->CopyTo(newPath, safeFolderName16);
  NS_ENSURE_SUCCESS(rv, rv);  // will fail if a file by that name exists

  // Copy to dir can fail if file does not exist. If copy fails, we test
  // if the file exists or not, if it does not that's ok, we continue
  // without copying it. If it fails and file exist and is not zero sized
  // there is real problem.
  nsAutoString dbName(safeFolderName16);
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

nsresult nsMsgMaildirStore::InternalGetNewMsgOutputStream(
    nsIMsgFolder* folder, nsACString& storeToken, nsIOutputStream** outStream) {
  nsresult rv;
  // To set up to write a new message:
  // 1. Discard any ongoing write already active in the folder.
  // 2. Generate a unique filename.
  // 3. Open output stream to write to "tmp/{filename}".
  // 4. Store the stream and filename in the mOngoingWrites map.

  // Are we already writing to this folder? If so, we'll ditch the existing
  // write. This behaviour is implicitly expected by the protocol->folder
  // interface (sigh).
  auto existing = mOngoingWrites.lookup(folder->URI());
  if (existing) {
    // Uhoh.
    MOZ_LOG(MailDirLog, mozilla::LogLevel::Error,
            ("Already writing to folder '%s'", folder->URI().get()));
    NS_WARNING(
        nsPrintfCString("Already writing to folder '%s'", folder->URI().get())
            .get());

    // Close stream, delete partly-written file, remove from ongoing set.
    existing->value().stream->Close();
    nsCOMPtr<nsIFile> partial;
    rv = EnsureSubDir(folder, u"tmp"_ns, getter_AddRefs(partial));
    NS_ENSURE_SUCCESS(rv, rv);
    partial->Append(NS_ConvertUTF8toUTF16(existing->value().filename));
    partial->Remove(false);
    mOngoingWrites.remove(existing);
  }

  // Time to open a new stream for writing.

  // Generate a unique name for the file.
  // We need ".eml" for OS search integration (for windows, anyway).
  nsAutoCString filename(UniqueName());
  filename.AppendLiteral(".eml");

  // We're going to save the new message into the maildir 'tmp' folder.
  // When the message is completed, it can be moved to 'cur'.
  nsCOMPtr<nsIFile> tmpFile;
  rv = EnsureSubDir(folder, u"tmp"_ns, getter_AddRefs(tmpFile));
  NS_ENSURE_SUCCESS(rv, rv);
  tmpFile->Append(NS_ConvertUTF8toUTF16(filename));

  bool fileExists;
  tmpFile->Exists(&fileExists);
  if (fileExists) {
    return NS_ERROR_FILE_ALREADY_EXISTS;
  }

  nsCOMPtr<nsIOutputStream> stream;
  rv = MsgNewBufferedFileOutputStream(getter_AddRefs(stream), tmpFile,
                                      PR_WRONLY | PR_CREATE_FILE, 00600);
  NS_ENSURE_SUCCESS(rv, rv);

  // Up and running - add the stream to the set of ongoing writes.
  MOZ_ALWAYS_TRUE(mOngoingWrites.putNew(folder->URI(),
                                        StreamDetails{filename, stream.get()}));

  // Done! Return stream and filename.
  storeToken = filename;
  stream.forget(outStream);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgMaildirStore::GetNewMsgOutputStream(nsIMsgFolder* folder,
                                         nsIOutputStream** outStream) {
  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG_POINTER(outStream);
  nsAutoCString unused;
  return InternalGetNewMsgOutputStream(folder, unused, outStream);
}

NS_IMETHODIMP
nsMsgMaildirStore::FinishNewMessage(nsIMsgFolder* folder,
                                    nsIOutputStream* outStream,
                                    nsACString& storeToken) {
  // To commit the message we want to:
  // 1. Close the output stream.
  // 2. Move the completed file from "tmp/" to "cur/".
  // 3. Remove the entry in mOngoingWrites.
  // 4. Return the filename in "cur/" as the storeToken.

  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG(outStream);

  auto entry = mOngoingWrites.lookup(folder->URI());
  if (!entry) {
    // We should have a record of the write!
    return NS_ERROR_ILLEGAL_VALUE;
  }

  // Take a copy of the entry before we remove it.
  StreamDetails details = entry->value();
  mOngoingWrites.remove(entry);

  // Should be the stream we issued originally!
  MOZ_ASSERT(outStream == details.stream);

  // Path to the new destination dir.
  nsCOMPtr<nsIFile> curDir;
  nsresult rv = EnsureSubDir(folder, u"cur"_ns, getter_AddRefs(curDir));
  NS_ENSURE_SUCCESS(rv, rv);

  // Path to the downloaded message in "tmp/".
  nsCOMPtr<nsIFile> tmpFile;
  rv = EnsureSubDir(folder, u"tmp"_ns, getter_AddRefs(tmpFile));
  NS_ENSURE_SUCCESS(rv, rv);
  tmpFile->Append(NS_ConvertUTF8toUTF16(details.filename));

  // In case we fail before moving the file into place.
  auto tmpGuard = mozilla::MakeScopeExit([&] { tmpFile->Remove(false); });

  rv = outStream->Close();
  NS_ENSURE_SUCCESS(rv, rv);

  // While downloading messages, filter actions can shortcut things and
  // move messages under us. They definitely should not do it like that
  // (Bug 1028372), but for now we'll check to see if it's already been
  // moved into "cur/".
  bool exists;
  tmpFile->Exists(&exists);
  if (!exists) {
    tmpGuard.release();  // Won't need to delete it!
    // Not in "tmp/"... is it in "cur/" now?
    nsCOMPtr<nsIFile> destPath;
    curDir->Clone(getter_AddRefs(destPath));
    destPath->Append(NS_ConvertUTF8toUTF16(details.filename));
    destPath->Exists(&exists);
    if (exists) {
      // It's already been moved to "cur/". We'll just accept that.
      return NS_OK;
    }
    NS_ERROR("FinishNewMessage - oops! file does not exist!");
    return NS_ERROR_FILE_NOT_FOUND;
  }

  // Move into "cur/".
  rv = tmpFile->MoveTo(curDir, EmptyString());
  NS_ENSURE_SUCCESS(rv, rv);

  tmpGuard.release();
  storeToken = details.filename;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgMaildirStore::DiscardNewMessage(nsIMsgFolder* folder,
                                     nsIOutputStream* outStream) {
  // To throw away a message we want to:
  // 1. Close the output stream.
  // 2. Delete the partial file in "tmp/".
  // 3. Remove the entry in mOngoingWrites.

  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG(outStream);

  auto entry = mOngoingWrites.lookup(folder->URI());
  if (!entry) {
    // We should have a record of the write!
    return NS_ERROR_ILLEGAL_VALUE;
  }

  // Take a copy of the entry before we remove it.
  StreamDetails details = entry->value();
  mOngoingWrites.remove(entry);

  // Should be the stream we issued originally!
  MOZ_ASSERT(outStream == details.stream);

  outStream->Close();

  nsCOMPtr<nsIFile> tmpFile;
  nsresult rv = EnsureSubDir(folder, u"tmp"_ns, getter_AddRefs(tmpFile));
  NS_ENSURE_SUCCESS(rv, rv);
  tmpFile->Append(NS_ConvertUTF8toUTF16(details.filename));

  tmpFile->Remove(false);
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
  aHdr->GetStoreToken(fileName);
  if (fileName.IsEmpty()) {
    NS_ERROR("FinishNewMessage - no storeToken in msg hdr!!");
    return NS_ERROR_FAILURE;
  }
  nsAutoString fileName16 = NS_ConvertUTF8toUTF16(fileName);

  // path to the downloaded message
  nsCOMPtr<nsIFile> fromPath;
  rv = folderPath->Clone(getter_AddRefs(fromPath));
  NS_ENSURE_SUCCESS(rv, rv);
  fromPath->Append(u"cur"_ns);
  fromPath->Append(fileName16);

  // let's check if the tmp file exists
  bool exists;
  fromPath->Exists(&exists);
  if (!exists) {
    NS_ERROR("FinishNewMessage - oops! file does not exist!");
    return NS_ERROR_FAILURE;
  }

  // move to the "cur" subfolder
  nsCOMPtr<nsIFile> toPath;
  rv = aDestFolder->GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = folderPath->Clone(getter_AddRefs(toPath));
  NS_ENSURE_SUCCESS(rv, rv);
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
  rv = toPath->Clone(getter_AddRefs(existingPath));
  NS_ENSURE_SUCCESS(rv, rv);
  existingPath->Append(fileName16);
  existingPath->Exists(&exists);

  if (exists) {
    rv = existingPath->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
    existingPath->GetLeafName(fileName16);
    newHdr->SetStoreToken(NS_ConvertUTF16toUTF8(fileName16));
  }

  rv = fromPath->MoveTo(toPath, fileName16);
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
      mozilla::components::FolderNotification::Service());
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

// aMaxAllowedSize is currently ignored, we always return the full
// amount of data that we have available in the file.
NS_IMETHODIMP
nsMsgMaildirStore::GetMsgInputStream(nsIMsgFolder* aMsgFolder,
                                     const nsACString& aMsgToken,
                                     uint32_t aMaxAllowedSize,
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

  path->Append(NS_ConvertUTF8toUTF16(aMsgToken));
  return NS_NewLocalFileInputStream(aResult, path);
}

NS_IMETHODIMP nsMsgMaildirStore::DeleteMessages(
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

NS_IMETHODIMP nsMsgMaildirStore::DeleteStoreMessages(
    nsIMsgFolder* folder, nsTArray<nsCString> const& storeTokens) {
  NS_ENSURE_ARG(folder);

  for (auto storeToken : storeTokens) {
    if (storeToken.IsEmpty()) {
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("DeleteStoreMessages - empty storeToken!!"));
      // Perhaps an offline store has not downloaded this particular message.
      continue;
    }

    nsCOMPtr<nsIFile> path;
    nsresult rv = folder->GetFilePath(getter_AddRefs(path));
    NS_ENSURE_SUCCESS(rv, rv);
    path->Append(u"cur"_ns);
    path->Append(NS_ConvertUTF8toUTF16(storeToken));

    // Let's check if the message exists.
    bool exists;
    path->Exists(&exists);
    if (!exists) {
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("DeleteStoreMessages - file does not exist !!"));
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
    srcHdr->GetStoreToken(fileName);
    if (fileName.IsEmpty()) {
      MOZ_LOG(MailDirLog, mozilla::LogLevel::Info,
              ("GetMsgInputStream - empty storeToken!!"));
      return NS_ERROR_FAILURE;
    }
    nsAutoString fileName16 = NS_ConvertUTF8toUTF16(fileName);

    nsCOMPtr<nsIFile> srcFile;
    rv = srcFolderPath->Clone(getter_AddRefs(srcFile));
    NS_ENSURE_SUCCESS(rv, rv);
    srcFile->Append(fileName16);

    nsCOMPtr<nsIFile> destFile;
    rv = destFolderPath->Clone(getter_AddRefs(destFile));
    NS_ENSURE_SUCCESS(rv, rv);
    destFile->Append(fileName16);
    bool exists;
    destFile->Exists(&exists);
    if (exists) {
      rv = destFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
      NS_ENSURE_SUCCESS(rv, rv);
      destFile->GetLeafName(fileName16);
    }
    if (aIsMove)
      rv = srcFile->MoveTo(destFolderPath, fileName16);
    else
      rv = srcFile->CopyTo(destFolderPath, fileName16);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgDBHdr> destHdr;
    if (destDB) {
      rv = destDB->CopyHdrFromExistingHdr(nsMsgKey_None, srcHdr, true,
                                          getter_AddRefs(destHdr));
      NS_ENSURE_SUCCESS(rv, rv);
      destHdr->SetStoreToken(NS_ConvertUTF16toUTF8(fileName16));
      aDstHdrs.AppendElement(destHdr);
      nsMsgKey dstKey;
      destHdr->GetMessageKey(&dstKey);
      msgTxn->AddDstKey(dstKey);
    }
  }
  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyMsgsMoveCopyCompleted(aIsMove, aHdrArray, aDstFolder,
                                        aDstHdrs);

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
    nsIMsgFolder* folder, nsTArray<nsCString> const& storeTokens,
    nsTArray<uint32_t> const& newFlags) {
  NS_ENSURE_ARG(folder);
  NS_ENSURE_ARG(storeTokens.Length() == newFlags.Length());

  for (size_t i = 0; i < storeTokens.Length(); ++i) {
    // Open a stream to patch the message file.
    nsCOMPtr<nsIRandomAccessStream> stream;
    nsresult rv =
        GetPatchableStream(folder, storeTokens[i], getter_AddRefs(stream));
    NS_ENSURE_SUCCESS(rv, rv);

    auto details = FindXMozillaStatusHeaders(stream, 0);
    rv = PatchXMozillaStatusHeaders(stream, 0, details, newFlags[i]);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

// get output stream from header
nsresult nsMsgMaildirStore::GetPatchableStream(nsIMsgFolder* folder,
                                               nsACString const& storeToken,
                                               nsIRandomAccessStream** stream) {
  if (storeToken.IsEmpty()) {
    return NS_ERROR_FAILURE;
  }

  nsresult rv;
  nsCOMPtr<nsIFile> folderPath;
  rv = folder->GetFilePath(getter_AddRefs(folderPath));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> maildirFile;
  rv = folderPath->Clone(getter_AddRefs(maildirFile));
  NS_ENSURE_SUCCESS(rv, rv);
  maildirFile->Append(u"cur"_ns);
  // Filename is storeToken.
  maildirFile->Append(NS_ConvertUTF8toUTF16(storeToken));

  rv = NS_NewLocalFileRandomAccessStream(stream, maildirFile);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

NS_IMETHODIMP nsMsgMaildirStore::ChangeKeywords(
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

  for (auto msgHdr : aHdrArray) {
    nsAutoCString storeToken;
    rv = msgHdr->GetStoreToken(storeToken);
    NS_ENSURE_SUCCESS(rv, rv);

    // Open the message file.
    nsCOMPtr<nsIRandomAccessStream> stream;
    rv = GetPatchableStream(folder, storeToken, getter_AddRefs(stream));
    NS_ENSURE_SUCCESS(rv, rv);

    bool notEnoughRoom;
    rv = ChangeKeywordsHelper(stream, keywordsToAdd, keywordsToRemove,
                              notEnoughRoom);
    NS_ENSURE_SUCCESS(rv, rv);
    if (notEnoughRoom) {
      // The growKeywords property indicates that the X-Mozilla-Keys header
      // doesn't have enough space, and should be rebuilt during the next
      // folder compaction.
      // TODO: For maildir there is no compaction, so this'll have no effect!
      msgHdr->SetUint32Property("growKeywords", 1);
    }
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
