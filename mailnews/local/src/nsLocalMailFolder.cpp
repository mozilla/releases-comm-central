/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsISeekableStream.h"
#include "prlog.h"

#include "CopyMessageStreamListener.h"
#include "FolderCompactor.h"
#include "HeaderReader.h"
#include "LineReader.h"
#include "msgCore.h"  // precompiled header...
#include "nsLocalMailFolder.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgMessageFlags.h"
#include "prprf.h"
#include "prmem.h"
#include "nsIDBFolderInfo.h"
#include "nsITransactionManager.h"
#include "nsParseMailbox.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgWindow.h"
#include "nsCOMPtr.h"
#include "nsMsgUtils.h"
#include "nsLocalUtils.h"
#include "nsIPop3IncomingServer.h"
#include "nsILocalMailIncomingServer.h"
#include "nsIMsgIncomingServer.h"
#include "nsString.h"
#include "nsIMsgFolderCacheElement.h"
#include "nsIMsgCopyService.h"
#include "nsIMessenger.h"
#include "nsIDocShell.h"
#include "nsIPrompt.h"
#include "nsIPop3URL.h"
#include "nsIMsgMailSession.h"
#include "nsNetCID.h"
#include "nsISpamSettings.h"
#include "nsMailHeaders.h"
#include "nsCOMArray.h"
#include "nsIRssIncomingServer.h"
#include "nsNetUtil.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsReadLine.h"
#include "nsIURIMutator.h"
#include "mozilla/Components.h"
#include "mozilla/UniquePtr.h"
#include "StoreIndexer.h"
#include "nsIPropertyBag2.h"

#include <algorithm>
#include <functional>

//////////////////////////////////////////////////////////////////////////////
// nsLocal
/////////////////////////////////////////////////////////////////////////////

nsLocalMailCopyState::nsLocalMailCopyState()
    : m_flags(0),
      m_lastProgressTime(PR_IntervalToMilliseconds(PR_IntervalNow())),
      m_curDstKey(nsMsgKey_None),
      m_curCopyIndex(0),
      m_totalMsgCount(0),
      m_isMove(false),
      m_isFolder(false),
      m_addXMozillaHeaders(false),
      m_copyingMultipleMessages(false),
      m_fromLineSeen(false),
      m_allowUndo(false),
      m_writeFailed(false),
      m_notifyFolderLoaded(false) {}

nsLocalMailCopyState::~nsLocalMailCopyState() {
  if (m_fileStream) m_fileStream->Close();
  if (m_messageService) {
    nsCOMPtr<nsIMsgFolder> srcFolder = do_QueryInterface(m_srcSupport);
    if (srcFolder && m_message) {
      nsCString uri;
      srcFolder->GetUriForMsg(m_message, uri);
    }
  }
}

nsLocalFolderScanState::nsLocalFolderScanState() : m_uidl(nullptr) {}

nsLocalFolderScanState::~nsLocalFolderScanState() {}

///////////////////////////////////////////////////////////////////////////////
// nsMsgLocalMailFolder interface
///////////////////////////////////////////////////////////////////////////////

nsMsgLocalMailFolder::nsMsgLocalMailFolder(void)
    : mCopyState(nullptr),
      mHaveReadNameFromDB(false),
      mInitialized(false),
      mCheckForNewMessagesAfterParsing(false),
      m_parsingFolder(false),
      mDownloadInProgress(false) {}

nsMsgLocalMailFolder::~nsMsgLocalMailFolder(void) {}

NS_IMPL_ISUPPORTS_INHERITED(nsMsgLocalMailFolder, nsMsgDBFolder,
                            nsICopyMessageListener, nsIMsgLocalMailFolder)

////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsMsgLocalMailFolder::CreateLocalSubfolder(
    const nsAString& aFolderName, nsIMsgFolder** aChild) {
  NS_ENSURE_ARG_POINTER(aChild);
  nsresult rv = CreateSubfolderInternal(aFolderName, nullptr, aChild);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) notifier->NotifyFolderAdded(*aChild);

  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetManyHeadersToDownload(bool* retval) {
  bool isLocked;
  // if the folder is locked, we're probably reparsing - let's build the
  // view when we've finished reparsing.
  GetLocked(&isLocked);
  if (isLocked) {
    *retval = true;
    return NS_OK;
  }

  return nsMsgDBFolder::GetManyHeadersToDownload(retval);
}

// Rebuild the msgDB by scanning the msgStore.
NS_IMETHODIMP nsMsgLocalMailFolder::ParseFolder(nsIMsgWindow* window,
                                                nsIUrlListener* listener) {
  RefPtr<StoreIndexer> indexer = new StoreIndexer();
  nsresult rv;

  // Set up for progress updates.
  // statusFeedback can be left null, in which case we'll skip the progress
  // reports.
  nsCOMPtr<nsIMsgStatusFeedback> statusFeedback;
  nsCOMPtr<nsIStringBundle> bundle;
  nsString folderName;
  GetName(folderName);
  if (window) {
    window->GetStatusFeedback(getter_AddRefs(statusFeedback));
    nsCOMPtr<nsIStringBundleService> stringService =
        mozilla::components::StringBundle::Service();
    if (stringService) {
      nsCOMPtr<nsIStringBundle> filterBundle;
      stringService->CreateBundle(
          "chrome://messenger/locale/localMsgs.properties",
          getter_AddRefs(bundle));
    }
    if (!bundle) {
      statusFeedback = nullptr;
    }
  }

  // Start indexing, call FinishUpAfterParseFolder() when done.
  // NOTE: the division of labour between ParseFolder() and the StoreIndexer
  // is still a little arbitrary. Ideally, StoreIndexer would deal exclusively
  // with a single database (not the backup db juggling it currently does),
  // and all the folder-related stuff would happen out here.
  // The way nsMailboxParseState is arranged makes that a little tricky
  // right now, but that stuff is also overdue for a refactoring.

  // Callback to handle progress updates.
  auto progressFn = [=](int64_t current, int64_t expected) {
    if (statusFeedback && expected > 0) {
      current = std::min(current, expected);  // Clip to 100%
      int64_t percent = (100 * current) / expected;
      statusFeedback->ShowProgress((int32_t)percent);
    }
  };

  // Callback to clean up afterwards.
  auto completionFn = [=, self = RefPtr(this)](nsresult status) {
    if (statusFeedback) {
      statusFeedback->StopMeteors();
      nsAutoString msg;
      nsresult rv = bundle->FormatStringFromName("localStatusDocumentDone",
                                                 {folderName}, msg);
      if (NS_SUCCEEDED(rv)) {
        statusFeedback->ShowStatusString(msg);
      }
    }
    self->FinishUpAfterParseFolder(status);
  };

  // Start the parsing.
  rv = indexer->GoIndex(this, progressFn, completionFn);
  NS_ENSURE_SUCCESS(rv, rv);
  m_parsingFolder = true;
  mReparseListener = listener;

  if (statusFeedback) {
    nsAutoString msg;
    rv = bundle->FormatStringFromName("buildingSummary", {folderName}, msg);
    if (NS_SUCCEEDED(rv)) {
      statusFeedback->ShowStatusString(msg);
      statusFeedback->StartMeteors();
    }
  }

  return NS_OK;
}

// Helper fn used by ParseFolder().
// Called to do all the things we want to do when the StoreIndexer finishes.
// Would prefer this to just be a lambda inside ParseFolder(),
// but it's a little more involved than it probably should be...
void nsMsgLocalMailFolder::FinishUpAfterParseFolder(nsresult status) {
  m_parsingFolder = false;
  // TODO: Updating the size should be pushed down into the msg store backend
  // so that the size is recalculated as part of parsing the folder data
  // (important for maildir), once GetSizeOnDisk is pushed into the msgStores
  // (bug 1032360).
  RefreshSizeOnDisk();

  // Update the summary totals so the front end will
  // show the right thing.
  UpdateSummaryTotals(true);

  // If a listener was passed into ParseFolder(), tell it the reparse is done.
  if (mReparseListener) {
    mReparseListener->OnStopRunningUrl(nullptr, status);
    mReparseListener = nullptr;
  }

  // If we're an inbox, and mCheckForNewMessagesAfterParsing is set,
  // then kick off GetNewMessages().
  // Shouldn't have to deal with this here. See Bug 1848476.
  if (NS_SUCCEEDED(status) && mFlags & nsMsgFolderFlags::Inbox) {
    nsresult rv;
    nsCOMPtr<nsIMsgMailSession> mailSession =
        do_GetService("@mozilla.org/messenger/services/session;1", &rv);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgWindow> msgWindow;
      mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));
      if (msgWindow && mDatabase && mCheckForNewMessagesAfterParsing) {
        mCheckForNewMessagesAfterParsing = false;
        // TODO: maybe simplify this.
        // - if parsing succeeded, then db should always be valid, right?
        bool valid = false;
        mDatabase->GetSummaryValid(&valid);
        if (valid) {
          GetNewMessages(msgWindow, nullptr);
        }
      }
    }
  }
  NotifyFolderEvent(kFolderLoaded);
}

// this won't force a reparse of the folder if the db is invalid.
NS_IMETHODIMP
nsMsgLocalMailFolder::GetMsgDatabase(nsIMsgDatabase** aMsgDatabase) {
  return GetDatabaseWOReparse(aMsgDatabase);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::GetSubFolders(nsTArray<RefPtr<nsIMsgFolder>>& folders) {
  if (!mInitialized) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    nsresult rv = GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);
    nsCOMPtr<nsIMsgPluggableStore> msgStore;
    // need to set this flag here to avoid infinite recursion
    mInitialized = true;
    rv = server->GetMsgStore(getter_AddRefs(msgStore));
    NS_ENSURE_SUCCESS(rv, rv);
    // This should add all existing folders as sub-folders of this folder.
    rv = msgStore->DiscoverSubFolders(this, true);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIFile> path;
    rv = GetFilePath(getter_AddRefs(path));
    if (NS_FAILED(rv)) return rv;

    bool directory;
    path->IsDirectory(&directory);
    if (directory) {
      SetFlag(nsMsgFolderFlags::Mail | nsMsgFolderFlags::Elided |
              nsMsgFolderFlags::Directory);

      bool isServer;
      GetIsServer(&isServer);
      if (isServer) {
        nsCOMPtr<nsIMsgIncomingServer> server;
        rv = GetServer(getter_AddRefs(server));
        NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);

        nsCOMPtr<nsILocalMailIncomingServer> localMailServer;
        localMailServer = do_QueryInterface(server, &rv);
        NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);

        // first create the folders on disk (as empty files)
        rv = localMailServer->CreateDefaultMailboxes();
        if (NS_FAILED(rv) && rv != NS_MSG_FOLDER_EXISTS) return rv;

        // must happen after CreateSubFolders, or the folders won't exist.
        rv = localMailServer->SetFlagsOnDefaultMailboxes();
        if (NS_FAILED(rv)) return rv;
      }
    }
    UpdateSummaryTotals(false);
  }

  return nsMsgDBFolder::GetSubFolders(folders);
}

nsresult nsMsgLocalMailFolder::GetDatabase() {
  nsCOMPtr<nsIMsgDatabase> msgDB;
  return GetDatabaseWOReparse(getter_AddRefs(msgDB));
}

// we treat failure as null db returned
NS_IMETHODIMP nsMsgLocalMailFolder::GetDatabaseWOReparse(
    nsIMsgDatabase** aDatabase) {
  NS_ENSURE_ARG(aDatabase);
  if (m_parsingFolder) return NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE;

  nsresult rv = NS_OK;
  if (!mDatabase) {
    rv = OpenDatabase();
    if (mDatabase) {
      mDatabase->AddListener(this);
      UpdateNewMessages();
    }
  }
  NS_IF_ADDREF(*aDatabase = mDatabase);
  if (mDatabase) mDatabase->SetLastUseTime(PR_Now());
  return rv;
}

// Makes sure the database is open and exists.  If the database is out of date,
// then this call will return NS_ERROR_NOT_INITIALIZED and run an async url
// to reparse the folder. The passed in url listener will get called when the
// url is done.
NS_IMETHODIMP nsMsgLocalMailFolder::GetDatabaseWithReparse(
    nsIUrlListener* aReparseUrlListener, nsIMsgWindow* aMsgWindow,
    nsIMsgDatabase** aMsgDatabase) {
  nsresult rv = NS_OK;
  // if we're already reparsing, just remember the listener so we can notify it
  // when we've finished.
  if (m_parsingFolder) {
    return NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE;
  }

  if (!mDatabase) {
    nsCOMPtr<nsIFile> pathFile;
    rv = GetFilePath(getter_AddRefs(pathFile));
    if (NS_FAILED(rv)) return rv;

    bool exists;
    rv = pathFile->Exists(&exists);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!exists)
      return NS_ERROR_NULL_POINTER;  // mDatabase will be null at this point.

    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsresult folderOpen =
        msgDBService->OpenFolderDB(this, true, getter_AddRefs(mDatabase));
    if (folderOpen == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE) {
      nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
      nsCOMPtr<nsIPropertyBag2> transferInfo;
      if (mDatabase) {
        mDatabase->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
        if (dbFolderInfo) {
          dbFolderInfo->SetNumMessages(0);
          dbFolderInfo->SetNumUnreadMessages(0);
          dbFolderInfo->GetTransferInfo(getter_AddRefs(transferInfo));
        }
        dbFolderInfo = nullptr;

        // A backup message database might have been created earlier, for
        // example if the user requested a reindex. We'll use the earlier one if
        // we can, otherwise we'll try to backup at this point.
        if (NS_FAILED(OpenBackupMsgDatabase())) {
          CloseAndBackupFolderDB(EmptyCString());
          if (NS_FAILED(OpenBackupMsgDatabase()) && mBackupDatabase) {
            mBackupDatabase->RemoveListener(this);
            mBackupDatabase = nullptr;
          }
        } else
          mDatabase->ForceClosed();

        mDatabase = nullptr;
      }
      nsCOMPtr<nsIFile> summaryFile;
      rv = GetSummaryFileLocation(pathFile, getter_AddRefs(summaryFile));
      NS_ENSURE_SUCCESS(rv, rv);
      // Remove summary file.
      summaryFile->Remove(false);

      // if it's out of date then reopen with upgrade.
      rv = msgDBService->CreateNewDB(this, getter_AddRefs(mDatabase));
      NS_ENSURE_SUCCESS(rv, rv);

      if (transferInfo && mDatabase) {
        SetDBTransferInfo(transferInfo);
        mDatabase->SetSummaryValid(false);
      }
    } else if (folderOpen == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING) {
      rv = msgDBService->CreateNewDB(this, getter_AddRefs(mDatabase));
    }

    if (mDatabase) {
      if (mAddListener) mDatabase->AddListener(this);

      // if we have to regenerate the folder, run the parser url.
      if (folderOpen == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING ||
          folderOpen == NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE) {
        if (NS_FAILED(rv = ParseFolder(aMsgWindow, aReparseUrlListener))) {
          if (rv == NS_MSG_FOLDER_BUSY) {
            // we need to null out the db so that parsing gets kicked off again.
            mDatabase->RemoveListener(this);
            mDatabase = nullptr;
            ThrowAlertMsg("parsingFolderFailed", aMsgWindow);
          }
          return rv;
        }

        return NS_ERROR_NOT_INITIALIZED;
      }

      // We have a valid database so lets extract necessary info.
      UpdateSummaryTotals(true);
    }
  }
  NS_IF_ADDREF(*aMsgDatabase = mDatabase);
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::UpdateFolder(nsIMsgWindow* aWindow) {
  (void)RefreshSizeOnDisk();
  nsresult rv;

  if (!PromptForMasterPasswordIfNecessary()) return NS_ERROR_FAILURE;

  // If we don't currently have a database, get it.  Otherwise, the folder has
  // been updated (presumably this changes when we download headers when opening
  // inbox).  If it's updated, send NotifyFolderLoaded.
  if (!mDatabase) {
    // return of NS_ERROR_NOT_INITIALIZED means running parsing URL
    // We don't need the return value, and assigning it to mDatabase which
    // is already set internally leaks.
    nsCOMPtr<nsIMsgDatabase> returnedDb;
    rv = GetDatabaseWithReparse(nullptr, aWindow, getter_AddRefs(returnedDb));
    if (NS_SUCCEEDED(rv)) NotifyFolderEvent(kFolderLoaded);
  } else {
    bool valid;
    rv = mDatabase->GetSummaryValid(&valid);
    // don't notify folder loaded or try compaction if db isn't valid
    // (we're probably reparsing or copying msgs to it)
    if (NS_SUCCEEDED(rv) && valid)
      NotifyFolderEvent(kFolderLoaded);
    else if (mCopyState)
      mCopyState->m_notifyFolderLoaded =
          true;                 // defer folder loaded notification
    else if (!m_parsingFolder)  // if the db was already open, it's probably OK
                                // to load it if not parsing
      NotifyFolderEvent(kFolderLoaded);
  }
  bool filtersRun;
  bool hasNewMessages;
  GetHasNewMessages(&hasNewMessages);
  if (mDatabase) ApplyRetentionSettings();
  // if we have new messages, try the filter plugins.
  if (NS_SUCCEEDED(rv) && hasNewMessages)
    (void)CallFilterPlugins(aWindow, &filtersRun);
  // Callers should rely on folder loaded event to ensure completion of loading.
  // So we'll return NS_OK even if parsing is still in progress
  if (rv == NS_ERROR_NOT_INITIALIZED) rv = NS_OK;
  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetFolderURL(nsACString& aUrl) {
  nsresult rv;
  nsCOMPtr<nsIFile> path;
  rv = GetFilePath(getter_AddRefs(path));
  if (NS_FAILED(rv)) return rv;

  rv = NS_GetURLSpecFromFile(path, aUrl);
  NS_ENSURE_SUCCESS(rv, rv);

  aUrl.Replace(0, strlen("file:"), "mailbox:");

  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::CreateStorageIfMissing(
    nsIUrlListener* aUrlListener) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgFolder> msgParent;
  GetParent(getter_AddRefs(msgParent));

  // parent is probably not set because *this* was probably created by rdf
  // and not by folder discovery. So, we have to compute the parent.
  if (!msgParent) {
    nsAutoCString folderName(mURI);
    nsAutoCString uri;
    int32_t leafPos = folderName.RFindChar('/');
    nsAutoCString parentName(folderName);
    if (leafPos > 0) {
      // If there is a hierarchy, there is a parent.
      // Don't strip off slash if it's the first character
      parentName.SetLength(leafPos);
      rv = GetOrCreateFolder(parentName, getter_AddRefs(msgParent));
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  if (msgParent) {
    nsString folderName;
    GetName(folderName);
    rv = msgParent->CreateSubfolder(folderName, nullptr);
    // by definition, this is OK.
    if (rv == NS_MSG_FOLDER_EXISTS) return NS_OK;
  }

  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::CreateSubfolder(const nsAString& folderName,
                                      nsIMsgWindow* msgWindow) {
  nsCOMPtr<nsIMsgFolder> newFolder;
  nsresult rv =
      CreateSubfolderInternal(folderName, msgWindow, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) notifier->NotifyFolderAdded(newFolder);

  return NS_OK;
}

nsresult nsMsgLocalMailFolder::CreateSubfolderInternal(
    const nsAString& folderName, nsIMsgWindow* msgWindow,
    nsIMsgFolder** aNewFolder) {
  nsresult rv = CheckIfFolderExists(folderName, this, msgWindow);
  // No need for an assertion: we already throw an alert.
  if (NS_FAILED(rv)) return rv;
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgStore->CreateFolder(this, folderName, aNewFolder);
  if (rv == NS_MSG_ERROR_INVALID_FOLDER_NAME) {
    ThrowAlertMsg("folderCreationFailed", msgWindow);
  } else if (rv == NS_MSG_FOLDER_EXISTS) {
    ThrowAlertMsg("folderExists", msgWindow);
  }

  if (NS_SUCCEEDED(rv)) {
    // we need to notify explicitly the flag change because it failed when we
    // did AddSubfolder
    (*aNewFolder)->OnFlagChange(mFlags);
    (*aNewFolder)
        ->SetPrettyName(
            folderName);  // because empty trash will create a new trash folder
    NotifyFolderAdded(*aNewFolder);
  }

  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::CompactAll(nsIUrlListener* aListener,
                                               nsIMsgWindow* aMsgWindow) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  bool storeSupportsCompaction;
  msgStore->GetSupportsCompaction(&storeSupportsCompaction);
  nsTArray<RefPtr<nsIMsgFolder>> folderArray;
  if (storeSupportsCompaction) {
    nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
    rv = rootFolder->GetDescendants(allDescendants);
    NS_ENSURE_SUCCESS(rv, rv);
    int64_t expungedBytes = 0;
    for (auto folder : allDescendants) {
      // If folder doesn't currently have a DB, expungedBytes might be out of
      // whack. Also the compact might do a folder reparse first, which could
      // change the expungedBytes count (via Expunge flag in X-Mozilla-Status).
      bool hasDB;
      folder->GetDatabaseOpen(&hasDB);

      expungedBytes = 0;
      if (folder) rv = folder->GetExpungedBytes(&expungedBytes);

      NS_ENSURE_SUCCESS(rv, rv);

      if (!hasDB || expungedBytes > 0) folderArray.AppendElement(folder);
    }
  }

  return AsyncCompactFolders(folderArray, aListener, aMsgWindow);
}

NS_IMETHODIMP nsMsgLocalMailFolder::Compact(nsIUrlListener* aListener,
                                            nsIMsgWindow* aMsgWindow) {
  return AsyncCompactFolders({this}, aListener, aMsgWindow);
}

NS_IMETHODIMP nsMsgLocalMailFolder::EmptyTrash(nsIUrlListener* aListener) {
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> trashFolder;
  rv = GetTrashFolder(getter_AddRefs(trashFolder));
  if (NS_SUCCEEDED(rv)) {
    uint32_t flags;
    trashFolder->GetFlags(&flags);
    int32_t totalMessages = 0;
    rv = trashFolder->GetTotalMessages(true, &totalMessages);
    if (totalMessages <= 0) {
      // Any folders to deal with?
      nsTArray<RefPtr<nsIMsgFolder>> subFolders;
      rv = trashFolder->GetSubFolders(subFolders);
      NS_ENSURE_SUCCESS(rv, rv);
      if (subFolders.IsEmpty()) {
        return NS_OK;
      }
    }
    nsCOMPtr<nsIMsgFolder> parentFolder;
    rv = trashFolder->GetParent(getter_AddRefs(parentFolder));
    if (NS_SUCCEEDED(rv) && parentFolder) {
      nsCOMPtr<nsIPropertyBag2> transferInfo;
      trashFolder->GetDBTransferInfo(getter_AddRefs(transferInfo));
      trashFolder->SetParent(nullptr);
      parentFolder->PropagateDelete(trashFolder, true);
      parentFolder->CreateSubfolder(u"Trash"_ns, nullptr);
      nsCOMPtr<nsIMsgFolder> newTrashFolder;
      rv = GetTrashFolder(getter_AddRefs(newTrashFolder));
      if (NS_SUCCEEDED(rv) && newTrashFolder) {
        nsCOMPtr<nsIMsgLocalMailFolder> localTrash =
            do_QueryInterface(newTrashFolder);
        if (transferInfo) newTrashFolder->SetDBTransferInfo(transferInfo);
        if (localTrash) localTrash->RefreshSizeOnDisk();
        // update the summary totals so the front end will
        // show the right thing for the new trash folder
        // see bug #161999
        nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
        nsCOMPtr<nsIMsgDatabase> db;
        newTrashFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                             getter_AddRefs(db));
        if (dbFolderInfo) {
          dbFolderInfo->SetNumUnreadMessages(0);
          dbFolderInfo->SetNumMessages(0);
        }
        newTrashFolder->UpdateSummaryTotals(true);
      }
    }
  }
  return rv;
}

nsresult nsMsgLocalMailFolder::IsChildOfTrash(bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  uint32_t parentFlags = 0;
  *result = false;
  bool isServer;
  nsresult rv = GetIsServer(&isServer);
  if (NS_FAILED(rv) || isServer) return NS_OK;

  rv = GetFlags(&parentFlags);  // this is the parent folder
  if (parentFlags & nsMsgFolderFlags::Trash) {
    *result = true;
    return rv;
  }

  nsCOMPtr<nsIMsgFolder> parentFolder;
  nsCOMPtr<nsIMsgFolder> thisFolder;
  rv = QueryInterface(NS_GET_IID(nsIMsgFolder), getter_AddRefs(thisFolder));

  while (!isServer) {
    thisFolder->GetParent(getter_AddRefs(parentFolder));
    if (!parentFolder) return NS_OK;

    rv = parentFolder->GetIsServer(&isServer);
    if (NS_FAILED(rv) || isServer) return NS_OK;

    rv = parentFolder->GetFlags(&parentFlags);
    if (NS_FAILED(rv)) return NS_OK;

    if (parentFlags & nsMsgFolderFlags::Trash) {
      *result = true;
      return rv;
    }

    thisFolder = parentFolder;
  }
  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::DeleteSelf(nsIMsgWindow* msgWindow) {
  nsresult rv;
  bool isChildOfTrash;
  IsChildOfTrash(&isChildOfTrash);

  uint32_t folderFlags = 0;
  GetFlags(&folderFlags);
  // when deleting from trash, or virtual folder, just delete it.
  if (isChildOfTrash || folderFlags & nsMsgFolderFlags::Virtual)
    return nsMsgDBFolder::DeleteSelf(msgWindow);

  nsCOMPtr<nsIMsgFolder> trashFolder;
  rv = GetTrashFolder(getter_AddRefs(trashFolder));
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgCopyService> copyService(
        do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = copyService->CopyFolder(this, trashFolder, true, nullptr, msgWindow);
  }
  return rv;
}

nsresult nsMsgLocalMailFolder::ConfirmFolderDeletion(nsIMsgWindow* aMsgWindow,
                                                     nsIMsgFolder* aFolder,
                                                     bool* aResult) {
  NS_ENSURE_ARG(aResult);
  NS_ENSURE_ARG(aMsgWindow);
  NS_ENSURE_ARG(aFolder);
  nsCOMPtr<nsIDocShell> docShell;
  aMsgWindow->GetRootDocShell(getter_AddRefs(docShell));
  if (docShell) {
    bool confirmDeletion = true;
    nsresult rv;
    nsCOMPtr<nsIPrefBranch> pPrefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    pPrefBranch->GetBoolPref("mailnews.confirm.moveFoldersToTrash",
                             &confirmDeletion);
    if (confirmDeletion) {
      nsCOMPtr<nsIStringBundleService> bundleService =
          mozilla::components::StringBundle::Service();
      NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
      nsCOMPtr<nsIStringBundle> bundle;
      rv = bundleService->CreateBundle(
          "chrome://messenger/locale/localMsgs.properties",
          getter_AddRefs(bundle));
      NS_ENSURE_SUCCESS(rv, rv);

      nsAutoString folderName;
      rv = aFolder->GetName(folderName);
      NS_ENSURE_SUCCESS(rv, rv);
      AutoTArray<nsString, 1> formatStrings = {folderName};

      nsAutoString deleteFolderDialogTitle;
      rv = bundle->GetStringFromName("pop3DeleteFolderDialogTitle",
                                     deleteFolderDialogTitle);
      NS_ENSURE_SUCCESS(rv, rv);

      nsAutoString deleteFolderButtonLabel;
      rv = bundle->GetStringFromName("pop3DeleteFolderButtonLabel",
                                     deleteFolderButtonLabel);
      NS_ENSURE_SUCCESS(rv, rv);

      nsAutoString confirmationStr;
      rv = bundle->FormatStringFromName("pop3MoveFolderToTrash", formatStrings,
                                        confirmationStr);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIPrompt> dialog(do_GetInterface(docShell));
      if (dialog) {
        int32_t buttonPressed = 0;
        // Default the dialog to "cancel".
        const uint32_t buttonFlags =
            (nsIPrompt::BUTTON_TITLE_IS_STRING * nsIPrompt::BUTTON_POS_0) +
            (nsIPrompt::BUTTON_TITLE_CANCEL * nsIPrompt::BUTTON_POS_1);
        bool dummyValue = false;
        rv = dialog->ConfirmEx(deleteFolderDialogTitle.get(),
                               confirmationStr.get(), buttonFlags,
                               deleteFolderButtonLabel.get(), nullptr, nullptr,
                               nullptr, &dummyValue, &buttonPressed);
        NS_ENSURE_SUCCESS(rv, rv);
        *aResult = !buttonPressed;  // "ok" is in position 0
      }
    } else
      *aResult = true;
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::Rename(const nsAString& aNewName,
                                           nsIMsgWindow* msgWindow) {
  // Renaming to the same name is easy
  if (mName.Equals(aNewName)) return NS_OK;

  nsCOMPtr<nsIMsgFolder> parentFolder;
  nsresult rv = GetParent(getter_AddRefs(parentFolder));
  if (!parentFolder) return NS_ERROR_NULL_POINTER;

  rv = CheckIfFolderExists(aNewName, parentFolder, msgWindow);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgStore->RenameFolder(this, aNewName, getter_AddRefs(newFolder));
  if (NS_FAILED(rv)) {
    if (msgWindow)
      (void)ThrowAlertMsg(
          (rv == NS_MSG_FOLDER_EXISTS) ? "folderExists" : "folderRenameFailed",
          msgWindow);
    return rv;
  }

  int32_t count = mSubFolders.Count();
  if (newFolder) {
    // Because we just renamed the db, w/o setting the pretty name in it,
    // we need to force the pretty name to be correct.
    // SetPrettyName won't write the name to the db if it doesn't think the
    // name has changed. This hack forces the pretty name to get set in the db.
    // We could set the new pretty name on the db before renaming the .msf file,
    // but if the rename failed, it would be out of sync.
    newFolder->SetPrettyName(EmptyString());
    newFolder->SetPrettyName(aNewName);
    bool changed = false;
    MatchOrChangeFilterDestination(newFolder, true /*case-insensitive*/,
                                   &changed);
    if (changed) AlertFilterChanged(msgWindow);

    if (count > 0) newFolder->RenameSubFolders(msgWindow, this);

    // Discover the subfolders inside this folder (this is recursive)
    nsTArray<RefPtr<nsIMsgFolder>> dummy;
    newFolder->GetSubFolders(dummy);

    // the newFolder should have the same flags
    newFolder->SetFlags(mFlags);
    if (parentFolder) {
      SetParent(nullptr);
      parentFolder->PropagateDelete(this, false);
      parentFolder->NotifyFolderAdded(newFolder);
    }
    // Forget our path, since this folder object renamed itself.
    SetFilePath(nullptr);
    newFolder->NotifyFolderEvent(kRenameCompleted);

    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) notifier->NotifyFolderRenamed(this, newFolder);
  }
  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::RenameSubFolders(nsIMsgWindow* msgWindow,
                                                     nsIMsgFolder* oldFolder) {
  nsresult rv = NS_OK;
  mInitialized = true;

  uint32_t flags;
  oldFolder->GetFlags(&flags);
  SetFlags(flags);

  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  rv = oldFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* msgFolder : subFolders) {
    nsString folderName;
    rv = msgFolder->GetName(folderName);
    nsCOMPtr<nsIMsgFolder> newFolder;
    AddSubfolder(folderName, getter_AddRefs(newFolder));
    if (newFolder) {
      newFolder->SetPrettyName(folderName);
      bool changed = false;
      msgFolder->MatchOrChangeFilterDestination(
          newFolder, true /*case-insensitive*/, &changed);
      if (changed) msgFolder->AlertFilterChanged(msgWindow);
      newFolder->RenameSubFolders(msgWindow, msgFolder);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetPrettyName(nsAString& prettyName) {
  return nsMsgDBFolder::GetPrettyName(prettyName);
}

NS_IMETHODIMP nsMsgLocalMailFolder::SetPrettyName(const nsAString& aName) {
  nsresult rv = nsMsgDBFolder::SetPrettyName(aName);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCString folderName;
  rv = GetStringProperty("folderName", folderName);
  NS_ConvertUTF16toUTF8 utf8FolderName(mName);
  return NS_FAILED(rv) || !folderName.Equals(utf8FolderName)
             ? SetStringProperty("folderName", utf8FolderName)
             : rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetName(nsAString& aName) {
  ReadDBFolderInfo(false);
  return nsMsgDBFolder::GetName(aName);
}

nsresult nsMsgLocalMailFolder::OpenDatabase() {
  nsresult rv;
  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> file;
  rv = GetFilePath(getter_AddRefs(file));

  rv = msgDBService->OpenFolderDB(this, true, getter_AddRefs(mDatabase));
  if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING) {
    // check if we're a real folder by looking at the parent folder.
    nsCOMPtr<nsIMsgFolder> parent;
    GetParent(getter_AddRefs(parent));
    if (parent) {
      // This little dance creates an empty .msf file and then checks
      // if the db is valid - this works if the folder is empty, which
      // we don't have a direct way of checking.
      nsCOMPtr<nsIMsgDatabase> db;
      rv = msgDBService->CreateNewDB(this, getter_AddRefs(db));
      if (db) {
        UpdateSummaryTotals(true);
        db->Close(true);
        mDatabase = nullptr;
        db = nullptr;
        rv = msgDBService->OpenFolderDB(this, false, getter_AddRefs(mDatabase));
        if (NS_FAILED(rv)) mDatabase = nullptr;
      }
    }
  } else if (NS_FAILED(rv))
    mDatabase = nullptr;

  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                           nsIMsgDatabase** db) {
  if (!db || !folderInfo || !mPath || mIsServer)
    return NS_ERROR_NULL_POINTER;  // ducarroz: should we use
                                   // NS_ERROR_INVALID_ARG?

  nsresult rv;
  if (mDatabase)
    rv = NS_OK;
  else {
    rv = OpenDatabase();

    if (mAddListener && mDatabase) mDatabase->AddListener(this);
  }

  NS_IF_ADDREF(*db = mDatabase);
  if (NS_SUCCEEDED(rv) && *db) rv = (*db)->GetDBFolderInfo(folderInfo);
  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::ReadFromFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  NS_ENSURE_ARG_POINTER(element);
  nsresult rv = nsMsgDBFolder::ReadFromFolderCacheElem(element);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCString utf8Name;
  rv = element->GetCachedString("folderName", utf8Name);
  NS_ENSURE_SUCCESS(rv, rv);
  CopyUTF8toUTF16(utf8Name, mName);
  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::WriteToFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  NS_ENSURE_ARG_POINTER(element);
  nsMsgDBFolder::WriteToFolderCacheElem(element);
  return element->SetCachedString("folderName", NS_ConvertUTF16toUTF8(mName));
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetDeletable(bool* deletable) {
  NS_ENSURE_ARG_POINTER(deletable);

  bool isServer;
  GetIsServer(&isServer);
  *deletable = !(isServer || (mFlags & nsMsgFolderFlags::SpecialUse));
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::RefreshSizeOnDisk() {
  int64_t oldFolderSize = mFolderSize;
  // we set this to unknown to force it to get recalculated from disk
  mFolderSize = kSizeUnknown;
  if (NS_SUCCEEDED(GetSizeOnDisk(&mFolderSize)))
    NotifyIntPropertyChanged(kFolderSize, oldFolderSize, mFolderSize);
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetSizeOnDisk(int64_t* aSize) {
  NS_ENSURE_ARG_POINTER(aSize);

  bool isServer = false;
  nsresult rv = GetIsServer(&isServer);
  // If this is the rootFolder, return 0 as a safe value.
  if (NS_FAILED(rv) || isServer) mFolderSize = 0;

  // Ignore virtual folders, for maildir there's not even a file to test.
  uint32_t folderFlags = 0;
  GetFlags(&folderFlags);
  if (folderFlags & nsMsgFolderFlags::Virtual) mFolderSize = 0;

  if (mFolderSize == kSizeUnknown) {
    nsCOMPtr<nsIFile> file;
    rv = GetFilePath(getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);
    // Use a temporary variable so that we keep mFolderSize on kSizeUnknown
    // if GetFileSize() fails.
    int64_t folderSize;
    rv = file->GetFileSize(&folderSize);
    NS_ENSURE_SUCCESS(rv, rv);

    mFolderSize = folderSize;
  }
  *aSize = mFolderSize;
  return NS_OK;
}

nsresult nsMsgLocalMailFolder::GetTrashFolder(nsIMsgFolder** result) {
  NS_ENSURE_ARG_POINTER(result);
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv)) {
    rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Trash, result);
    if (!*result) rv = NS_ERROR_FAILURE;
  }
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::DeleteMessages(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& msgHeaders, nsIMsgWindow* msgWindow,
    bool deleteStorage, bool isMove, nsIMsgCopyServiceListener* listener,
    bool allowUndo) {
  nsresult rv;

  // shift delete case - (delete to trash is handled in EndMove)
  // this is also the case when applying retention settings.
  if (deleteStorage && !isMove) {
    nsTArray<RefPtr<nsIMsgDBHdr>> hdrsToDelete;
    for (auto msgHdr : msgHeaders) {
      uint32_t attachmentDetached = 0;
      msgHdr->GetUint32Property("attachmentDetached", &attachmentDetached);
      if (!attachmentDetached) {
        hdrsToDelete.AppendElement(msgHdr);
      }
    }
    MarkMsgsOnPop3Server(hdrsToDelete, POP3_DELETE);
  }

  bool isTrashFolder = mFlags & nsMsgFolderFlags::Trash;

  // notify on delete from trash and shift-delete
  if (!isMove && (deleteStorage || isTrashFolder)) {
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
    if (notifier) {
      if (listener) {
        listener->OnStartCopy();
        listener->OnStopCopy(NS_OK);
      }
      notifier->NotifyMsgsDeleted(msgHeaders);
    }
  }

  if (!deleteStorage && !isTrashFolder) {
    // We're moving the messages to trash folder. Start by kicking off a copy.
    nsCOMPtr<nsIMsgFolder> trashFolder;
    rv = GetTrashFolder(getter_AddRefs(trashFolder));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgCopyService> copyService =
          do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      // When the copy completes, DeleteMessages() will be called again to
      // perform the actual delete.
      return copyService->CopyMessages(this, msgHeaders, trashFolder, true,
                                       listener, msgWindow, allowUndo);
    }
  } else {
    // Performing an _actual_ delete. There are two ways we got here:
    // 1) We're deleting messages without moving to trash.
    // 2) We're in the second phase of a Move (to trash or elsewhere). The
    //    copy succeeded, and now we need to delete the source messages.
    nsCOMPtr<nsIMsgDatabase> msgDB;
    rv = GetDatabaseWOReparse(getter_AddRefs(msgDB));
    if (NS_SUCCEEDED(rv)) {
      if (deleteStorage && isMove && GetDeleteFromServerOnMove())
        MarkMsgsOnPop3Server(msgHeaders, POP3_DELETE);

      nsCOMPtr<nsISupports> msgSupport;
      rv = EnableNotifications(allMessageCountNotifications, false);
      if (NS_SUCCEEDED(rv)) {
        // First, delete the actual messages in the store.
        nsCOMPtr<nsIMsgPluggableStore> msgStore;
        rv = GetMsgStore(getter_AddRefs(msgStore));
        if (NS_SUCCEEDED(rv)) {
          // Second, remove the message entries from the DB.
          rv = msgStore->DeleteMessages(msgHeaders);
          for (auto hdr : msgHeaders) {
            rv = msgDB->DeleteHeader(hdr, nullptr, false, true);
          }
        }
      } else if (rv == NS_MSG_FOLDER_BUSY) {
        ThrowAlertMsg("deletingMsgsFailed", msgWindow);
      }

      // Let everyone know the operation has finished.
      NotifyFolderEvent(NS_SUCCEEDED(rv) ? kDeleteOrMoveMsgCompleted
                                         : kDeleteOrMoveMsgFailed);
      // NOTE: This reenabling also forces immediate recount + notification.
      EnableNotifications(allMessageCountNotifications, true);
      if (msgWindow) {
        AutoCompact(msgWindow);
      }
    }
  }

  if (msgWindow && !isMove && (deleteStorage || isTrashFolder)) {
    // Clear undo and redo stack.
    nsCOMPtr<nsITransactionManager> txnMgr;
    msgWindow->GetTransactionManager(getter_AddRefs(txnMgr));
    if (txnMgr) {
      txnMgr->Clear();
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::AddMessageDispositionState(
    nsIMsgDBHdr* aMessage, nsMsgDispositionState aDispositionFlag) {
  nsMsgMessageFlagType msgFlag = 0;
  switch (aDispositionFlag) {
    case nsIMsgFolder::nsMsgDispositionState_Replied:
      msgFlag = nsMsgMessageFlags::Replied;
      break;
    case nsIMsgFolder::nsMsgDispositionState_Forwarded:
      msgFlag = nsMsgMessageFlags::Forwarded;
      break;
    case nsIMsgFolder::nsMsgDispositionState_Redirected:
      msgFlag = nsMsgMessageFlags::Redirected;
      break;
    default:
      return NS_ERROR_UNEXPECTED;
  }

  nsresult rv =
      nsMsgDBFolder::AddMessageDispositionState(aMessage, aDispositionFlag);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->ChangeFlags({aMessage}, msgFlag, true);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::MarkMessagesRead(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages, bool aMarkRead) {
  nsresult rv = nsMsgDBFolder::MarkMessagesRead(aMessages, aMarkRead);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->ChangeFlags(aMessages, nsMsgMessageFlags::Read, aMarkRead);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::MarkMessagesFlagged(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages, bool aMarkFlagged) {
  nsresult rv = nsMsgDBFolder::MarkMessagesFlagged(aMessages, aMarkFlagged);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->ChangeFlags(aMessages, nsMsgMessageFlags::Marked,
                               aMarkFlagged);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::MarkAllMessagesRead(nsIMsgWindow* aMsgWindow) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<nsMsgKey> thoseMarked;
  EnableNotifications(allMessageCountNotifications, false);
  rv = mDatabase->MarkAllRead(thoseMarked);
  EnableNotifications(allMessageCountNotifications, true);
  NS_ENSURE_SUCCESS(rv, rv);

  if (thoseMarked.IsEmpty()) {
    return NS_OK;
  }

  nsTArray<RefPtr<nsIMsgDBHdr>> messages;
  rv = MsgGetHeadersFromKeys(mDatabase, thoseMarked, messages);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgStore->ChangeFlags(messages, nsMsgMessageFlags::Read, true);
  NS_ENSURE_SUCCESS(rv, rv);

  mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);

  // Setup a undo-state
  if (aMsgWindow)
    rv = AddMarkAllReadUndoAction(aMsgWindow, thoseMarked.Elements(),
                                  thoseMarked.Length());

  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::MarkThreadRead(nsIMsgThread* thread) {
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<nsMsgKey> thoseMarked;
  rv = mDatabase->MarkThreadRead(thread, nullptr, thoseMarked);
  NS_ENSURE_SUCCESS(rv, rv);
  if (thoseMarked.IsEmpty()) {
    return NS_OK;
  }

  nsTArray<RefPtr<nsIMsgDBHdr>> messages;
  rv = MsgGetHeadersFromKeys(mDatabase, thoseMarked, messages);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgStore->ChangeFlags(messages, nsMsgMessageFlags::Read, true);
  NS_ENSURE_SUCCESS(rv, rv);

  mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);

  return rv;
}

nsresult nsMsgLocalMailFolder::InitCopyState(
    nsISupports* aSupport, nsTArray<RefPtr<nsIMsgDBHdr>> const& messages,
    bool isMove, nsIMsgCopyServiceListener* listener, nsIMsgWindow* msgWindow,
    bool isFolder, bool allowUndo) {
  nsCOMPtr<nsIFile> path;

  NS_ASSERTION(!mCopyState, "already copying a msg into this folder");
  if (mCopyState) return NS_ERROR_FAILURE;  // already has a  copy in progress

  // get mDatabase set, so we can use it to add new hdrs to this db.
  // calling GetDatabase will set mDatabase - we use the comptr
  // here to avoid doubling the refcnt on mDatabase. We don't care if this
  // fails - we just want to give it a chance. It will definitely fail in
  // nsLocalMailFolder::EndCopy because we will have written data to the folder
  // and changed its size.
  nsCOMPtr<nsIMsgDatabase> msgDB;
  GetDatabaseWOReparse(getter_AddRefs(msgDB));
  bool isLocked;

  GetLocked(&isLocked);
  if (isLocked) return NS_MSG_FOLDER_BUSY;

  AcquireSemaphore(static_cast<nsIMsgLocalMailFolder*>(this));

  mCopyState = new nsLocalMailCopyState();
  NS_ENSURE_TRUE(mCopyState, NS_ERROR_OUT_OF_MEMORY);

  mCopyState->m_destDB = msgDB;

  mCopyState->m_srcSupport = aSupport;
  mCopyState->m_messages = messages.Clone();
  mCopyState->m_curCopyIndex = 0;
  mCopyState->m_isMove = isMove;
  mCopyState->m_isFolder = isFolder;
  mCopyState->m_allowUndo = allowUndo;
  mCopyState->m_msgWindow = msgWindow;
  mCopyState->m_totalMsgCount = messages.Length();
  if (listener) mCopyState->m_listener = listener;
  mCopyState->m_copyingMultipleMessages = false;

  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::OnAnnouncerGoingAway(
    nsIDBChangeAnnouncer* instigator) {
  if (mCopyState) mCopyState->m_destDB = nullptr;
  return nsMsgDBFolder::OnAnnouncerGoingAway(instigator);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::OnCopyCompleted(nsISupports* srcSupport,
                                      bool moveCopySucceeded) {
  if (mCopyState && mCopyState->m_notifyFolderLoaded)
    NotifyFolderEvent(kFolderLoaded);

  (void)RefreshSizeOnDisk();
  // we are the destination folder for a move/copy
  bool haveSemaphore;
  nsresult rv =
      TestSemaphore(static_cast<nsIMsgLocalMailFolder*>(this), &haveSemaphore);
  if (NS_SUCCEEDED(rv) && haveSemaphore)
    ReleaseSemaphore(static_cast<nsIMsgLocalMailFolder*>(this));

  if (mCopyState && !mCopyState->m_newMsgKeywords.IsEmpty() &&
      mCopyState->m_newHdr) {
    AddKeywordsToMessages({&*mCopyState->m_newHdr},
                          mCopyState->m_newMsgKeywords);
  }
  if (moveCopySucceeded && mDatabase) {
    mDatabase->SetSummaryValid(true);
    (void)CloseDBIfFolderNotOpen(false);
  }

  delete mCopyState;
  mCopyState = nullptr;
  nsCOMPtr<nsIMsgCopyService> copyService =
      do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return copyService->NotifyCompletion(
      srcSupport, this, moveCopySucceeded ? NS_OK : NS_ERROR_FAILURE);
}

bool nsMsgLocalMailFolder::CheckIfSpaceForCopy(nsIMsgWindow* msgWindow,
                                               nsIMsgFolder* srcFolder,
                                               nsISupports* srcSupports,
                                               bool isMove,
                                               int64_t totalMsgSize) {
  bool spaceNotAvailable = true;
  nsresult rv =
      WarnIfLocalFileTooBig(msgWindow, totalMsgSize, &spaceNotAvailable);
  if (NS_FAILED(rv) || spaceNotAvailable) {
    if (isMove && srcFolder)
      srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
    OnCopyCompleted(srcSupports, false);
    return false;
  }
  return true;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::CopyMessages(nsIMsgFolder* srcFolder,
                                   nsTArray<RefPtr<nsIMsgDBHdr>> const& srcHdrs,
                                   bool isMove, nsIMsgWindow* msgWindow,
                                   nsIMsgCopyServiceListener* listener,
                                   bool isFolder, bool allowUndo) {
  nsCOMPtr<nsISupports> srcSupport = do_QueryInterface(srcFolder);
  bool isServer;
  nsresult rv = GetIsServer(&isServer);
  if (NS_SUCCEEDED(rv) && isServer) {
    NS_ERROR("Destination is the root folder. Cannot move/copy here");
    if (isMove) srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
    return OnCopyCompleted(srcSupport, false);
  }

  UpdateTimestamps(allowUndo);
  nsCString protocolType;
  rv = srcFolder->GetURI(protocolType);
  protocolType.SetLength(protocolType.FindChar(':'));

  // If we're offline and the source folder is imap or news, to do the
  // copy the message bodies MUST reside in offline storage.
  bool needOfflineBodies =
      (WeAreOffline() && (protocolType.LowerCaseEqualsLiteral("imap") ||
                          protocolType.LowerCaseEqualsLiteral("news")));
  int64_t totalMsgSize = 0;
  bool allMsgsHaveOfflineStore = true;
  for (auto message : srcHdrs) {
    nsMsgKey key;
    uint32_t msgSize;
    message->GetMessageSize(&msgSize);

    /* 200 is a per-message overhead to account for any extra data added
       to the message.
    */
    totalMsgSize += msgSize + 200;

    // Check if each source folder message has offline storage regardless
    // of whether we're online or offline.
    message->GetMessageKey(&key);
    bool hasMsgOffline = false;
    srcFolder->HasMsgOffline(key, &hasMsgOffline);
    allMsgsHaveOfflineStore = allMsgsHaveOfflineStore && hasMsgOffline;

    // If we're offline and not all messages are in offline storage, the copy
    // or move can't occur and a notification for the user to download the
    // messages is posted.
    if (needOfflineBodies && !hasMsgOffline) {
      if (isMove) srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
      ThrowAlertMsg("cantMoveMsgWOBodyOffline", msgWindow);
      return OnCopyCompleted(srcSupport, false);
    }
  }

  if (!CheckIfSpaceForCopy(msgWindow, srcFolder, srcSupport, isMove,
                           totalMsgSize))
    return NS_OK;

  NS_ENSURE_SUCCESS(rv, rv);
  bool storeDidCopy = false;
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsITransaction> undoTxn;
  nsTArray<RefPtr<nsIMsgDBHdr>> dstHdrs;
  rv = msgStore->CopyMessages(isMove, srcHdrs, this, dstHdrs,
                              getter_AddRefs(undoTxn), &storeDidCopy);
  if (storeDidCopy) {
    NS_ASSERTION(undoTxn, "if store does copy, it needs to add undo action");
    if (msgWindow && undoTxn) {
      nsCOMPtr<nsITransactionManager> txnMgr;
      msgWindow->GetTransactionManager(getter_AddRefs(txnMgr));
      if (txnMgr) txnMgr->DoTransaction(undoTxn);
    }
    if (isMove) {
      srcFolder->NotifyFolderEvent(NS_SUCCEEDED(rv) ? kDeleteOrMoveMsgCompleted
                                                    : kDeleteOrMoveMsgFailed);
    }

    if (NS_SUCCEEDED(rv)) {
      // If the store did the copy, like maildir, we need to mark messages on
      // the server. Otherwise that's done in EndMove().
      nsCOMPtr<nsIMsgLocalMailFolder> localDstFolder;
      QueryInterface(NS_GET_IID(nsIMsgLocalMailFolder),
                     getter_AddRefs(localDstFolder));
      if (localDstFolder) {
        // If we are the trash and a local msg is being moved to us, mark the
        // source for delete from server, if so configured.
        if (mFlags & nsMsgFolderFlags::Trash) {
          // If we're deleting on all moves, we'll mark this message for
          // deletion when we call DeleteMessages on the source folder. So don't
          // mark it for deletion here, in that case.
          if (!GetDeleteFromServerOnMove()) {
            localDstFolder->MarkMsgsOnPop3Server(dstHdrs, POP3_DELETE);
          }
        }
      }
    }

    OnCopyCompleted(srcSupport, NS_SUCCEEDED(rv));
    return rv;
  }
  // If the store doesn't do the copy, we'll stream the source messages into
  // the target folder, using getMsgInputStream and getNewMsgOutputStream.

  // don't update the counts in the dest folder until it is all over
  EnableNotifications(allMessageCountNotifications, false);

  // sort the message array by key
  nsTArray<nsMsgKey> keyArray(srcHdrs.Length());
  nsTArray<RefPtr<nsIMsgDBHdr>> sortedMsgs(srcHdrs.Length());
  for (nsIMsgDBHdr* aMessage : srcHdrs) {
    nsMsgKey key;
    aMessage->GetMessageKey(&key);
    keyArray.AppendElement(key);
  }
  keyArray.Sort();
  rv = MessagesInKeyOrder(keyArray, srcFolder, sortedMsgs);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = InitCopyState(srcSupport, sortedMsgs, isMove, listener, msgWindow,
                     isFolder, allowUndo);

  if (NS_FAILED(rv)) {
    ThrowAlertMsg("operationFailedFolderBusy", msgWindow);
    (void)OnCopyCompleted(srcSupport, false);
    return rv;
  }

  if (!protocolType.LowerCaseEqualsLiteral("mailbox")) {
    // Copying from a non-local source, so we will be adding "X-Mozilla-*"
    // headers before copying the message proper.
    mCopyState->m_addXMozillaHeaders = true;
    nsParseMailMessageState* parseMsgState = new nsParseMailMessageState();
    if (parseMsgState) {
      nsCOMPtr<nsIMsgDatabase> msgDb;
      mCopyState->m_parseMsgState = parseMsgState;
      GetDatabaseWOReparse(getter_AddRefs(msgDb));
      if (msgDb) parseMsgState->SetMailDB(msgDb);
    }
  }

  // undo stuff
  if (allowUndo)  // no undo for folder move/copy or or move/copy from search
                  // window
  {
    RefPtr<nsLocalMoveCopyMsgTxn> msgTxn = new nsLocalMoveCopyMsgTxn;
    if (msgTxn && NS_SUCCEEDED(msgTxn->Init(srcFolder, this, isMove))) {
      msgTxn->SetMsgWindow(msgWindow);
      if (isMove) {
        if (mFlags & nsMsgFolderFlags::Trash)
          msgTxn->SetTransactionType(nsIMessenger::eDeleteMsg);
        else
          msgTxn->SetTransactionType(nsIMessenger::eMoveMsg);
      } else
        msgTxn->SetTransactionType(nsIMessenger::eCopyMsg);
      msgTxn.swap(mCopyState->m_undoMsgTxn);
    }
  }

  if (srcHdrs.Length() > 1 &&
      ((protocolType.LowerCaseEqualsLiteral("imap") &&
        !allMsgsHaveOfflineStore) ||
       protocolType.LowerCaseEqualsLiteral("mailbox"))) {
    // For an imap source folder with more than one message to be copied that
    // are not all in offline storage, this fetches all the messages from the
    // imap server to do the copy. When source folder is "mailbox", this is not
    // a concern since source messages are in local storage.
    mCopyState->m_copyingMultipleMessages = true;
    rv = CopyMessagesTo(keyArray, msgWindow, isMove);
    if (NS_FAILED(rv)) {
      NS_ERROR("copy message failed");
      (void)OnCopyCompleted(srcSupport, false);
    }
  } else {
    // This obtains the source messages from local/offline storage to do the
    // copy. Note: CopyMessageTo() actually handles one or more messages.
    nsIMsgDBHdr* msgSupport = mCopyState->m_messages[0];
    if (msgSupport) {
      rv = CopyMessageTo(msgSupport, msgWindow, isMove);
      if (NS_FAILED(rv)) {
        NS_ASSERTION(false, "copy message failed");
        (void)OnCopyCompleted(srcSupport, false);
      }
    }
  }
  // if this failed immediately, need to turn back on notifications and inform
  // FE.
  if (NS_FAILED(rv)) {
    if (isMove) srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
    EnableNotifications(allMessageCountNotifications, true);
  }
  return rv;
}

// for srcFolder that are on different server than the dstFolder.
// "this" is the parent of the new dest folder.
nsresult nsMsgLocalMailFolder::CopyFolderAcrossServer(
    nsIMsgFolder* srcFolder, nsIMsgWindow* msgWindow,
    nsIMsgCopyServiceListener* listener, bool moveMsgs) {
  mInitialized = true;

  nsString folderName;
  srcFolder->GetName(folderName);

  nsCOMPtr<nsIMsgFolder> newMsgFolder;
  nsresult rv = CreateSubfolderInternal(folderName, msgWindow,
                                        getter_AddRefs(newMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgEnumerator> messages;
  rv = srcFolder->GetMessages(getter_AddRefs(messages));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIMsgDBHdr>> msgArray;
  bool hasMoreElements = false;

  if (messages) rv = messages->HasMoreElements(&hasMoreElements);

  while (NS_SUCCEEDED(rv) && hasMoreElements) {
    nsCOMPtr<nsIMsgDBHdr> msg;
    rv = messages->GetNext(getter_AddRefs(msg));
    NS_ENSURE_SUCCESS(rv, rv);

    msgArray.AppendElement(msg);
    rv = messages->HasMoreElements(&hasMoreElements);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (msgArray.Length() > 0)  // if only srcFolder has messages..
    // Allow move of copied messages but keep source folder in place.
    newMsgFolder->CopyMessages(srcFolder, msgArray, moveMsgs, msgWindow,
                               listener, true /* is folder*/,
                               false /* allowUndo */);
  else {
    nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
        do_QueryInterface(newMsgFolder);
    if (localFolder) {
      // normally these would get called from ::EndCopy when the last message
      // was finished copying. But since there are no messages, we have to call
      // them explicitly.
      nsCOMPtr<nsISupports> srcSupports = do_QueryInterface(srcFolder);
      localFolder->CopyAllSubFolders(srcFolder, msgWindow, listener, moveMsgs);
      return localFolder->OnCopyCompleted(srcSupports, true);
    }
  }
  return NS_OK;  // otherwise the front-end will say Exception::CopyFolder
}

nsresult  // copy the sub folders
nsMsgLocalMailFolder::CopyAllSubFolders(nsIMsgFolder* srcFolder,
                                        nsIMsgWindow* msgWindow,
                                        nsIMsgCopyServiceListener* listener,
                                        bool isMove) {
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = srcFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* folder : subFolders) {
    CopyFolderAcrossServer(folder, msgWindow, listener, isMove);
  }
  return NS_OK;
}

// "this" is the destination (parent) folder that srcFolder is copied to.
NS_IMETHODIMP
nsMsgLocalMailFolder::CopyFolder(nsIMsgFolder* srcFolder, bool isMoveFolder,
                                 nsIMsgWindow* msgWindow,
                                 nsIMsgCopyServiceListener* listener) {
  NS_ENSURE_ARG_POINTER(srcFolder);
  nsresult rv;
  bool sameServer;
  rv = IsOnSameServer(this, srcFolder, &sameServer);
  NS_ENSURE_SUCCESS(rv, rv);
  if (sameServer && isMoveFolder) {
    // Do a pure folder move within the same Local Folder account/server. where
    // "pure" means the folder AND messages are copied to the Local Folders
    // destination and then both are removed from source account.
    rv = CopyFolderLocal(srcFolder, isMoveFolder, msgWindow, listener);
  } else {
    // !sameServer OR it's a copy. Unit tests expect a successful folder
    // copy within Local Folders account/server even though the UI forbids copy
    // and only allows moves inside the same account. CopyFolderAcrossServer(),
    // called below, handles the folder copy within Local Folders (needed by
    // unit tests) and it handles the folder move or copy from another account
    // or server into Local Folders. The move from another account is "impure"
    // since just the messages are moved but the source folder remains in place.
    rv = CopyFolderAcrossServer(srcFolder, msgWindow, listener, isMoveFolder);
  }
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::CopyFolderLocal(nsIMsgFolder* srcFolder,
                                      bool isMoveFolder,
                                      nsIMsgWindow* msgWindow,
                                      nsIMsgCopyServiceListener* aListener) {
  mInitialized = true;
  bool isChildOfTrash;
  nsresult rv = IsChildOfTrash(&isChildOfTrash);
  if (NS_SUCCEEDED(rv) && isChildOfTrash) {
    // do it just for the parent folder (isMoveFolder is true for parent only)
    // if we are deleting/moving a folder tree don't confirm for rss folders.
    if (isMoveFolder) {
      // if there's a msgWindow, confirm the deletion
      if (msgWindow) {
        bool okToDelete = false;
        ConfirmFolderDeletion(msgWindow, srcFolder, &okToDelete);
        if (!okToDelete) return NS_MSG_ERROR_COPY_FOLDER_ABORTED;
      }
      // if we are moving a favorite folder to trash, we should clear the
      // favorites flag so it gets removed from the view.
      srcFolder->ClearFlag(nsMsgFolderFlags::Favorite);
    }

    bool match = false;
    srcFolder->MatchOrChangeFilterDestination(nullptr, false, &match);
    if (match && msgWindow) {
      bool confirmed = false;
      srcFolder->ConfirmFolderDeletionForFilter(msgWindow, &confirmed);
      if (!confirmed) return NS_MSG_ERROR_COPY_FOLDER_ABORTED;
    }
  }

  nsAutoString newFolderName;
  nsAutoString folderName;
  rv = srcFolder->GetName(folderName);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return rv;
  }

  if (!isMoveFolder) {
    rv = CheckIfFolderExists(folderName, this, msgWindow);
    if (NS_WARN_IF(NS_FAILED(rv))) {
      return rv;
    }
  } else {
    // If folder name already exists in destination, generate a new unique name.
    bool containsChild = true;
    uint32_t i;
    for (i = 1; containsChild; i++) {
      newFolderName.Assign(folderName);
      if (i > 1) {
        // This could be localizable but Toolkit is fine without it, see
        // mozilla/toolkit/content/contentAreaUtils.js::uniqueFile()
        newFolderName.Append('(');
        newFolderName.AppendInt(i);
        newFolderName.Append(')');
      }
      rv = ContainsChildNamed(newFolderName, &containsChild);
      if (NS_WARN_IF(NS_FAILED(rv))) {
        return rv;
      }
    }

    // 'i' is one more than the number of iterations done
    // and the number tacked onto the name of the folder.
    if (i > 2 && !isChildOfTrash) {
      // Folder name already exists, ask if rename is OK.
      // If moving to Trash, don't ask and do it.
      if (!ConfirmAutoFolderRename(msgWindow, folderName, newFolderName))
        return NS_MSG_ERROR_COPY_FOLDER_ABORTED;
    }
  }

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return rv;
  }

  return msgStore->CopyFolder(srcFolder, this, isMoveFolder, msgWindow,
                              aListener, newFolderName);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::CopyFileMessage(nsIFile* aFile, nsIMsgDBHdr* msgToReplace,
                                      bool isDraftOrTemplate,
                                      uint32_t newMsgFlags,
                                      const nsACString& aNewMsgKeywords,
                                      nsIMsgWindow* msgWindow,
                                      nsIMsgCopyServiceListener* listener) {
  NS_ENSURE_ARG_POINTER(aFile);
  nsresult rv = NS_ERROR_NULL_POINTER;
  nsParseMailMessageState* parseMsgState = nullptr;
  int64_t fileSize = 0;

  nsCOMPtr<nsISupports> fileSupport(aFile);

  aFile->GetFileSize(&fileSize);
  if (!CheckIfSpaceForCopy(msgWindow, nullptr, fileSupport, false, fileSize))
    return NS_OK;

  nsTArray<RefPtr<nsIMsgDBHdr>> messages;
  if (msgToReplace) messages.AppendElement(msgToReplace);

  rv = InitCopyState(fileSupport, messages, msgToReplace ? true : false,
                     listener, msgWindow, false, false);
  if (NS_SUCCEEDED(rv)) {
    if (mCopyState) {
      mCopyState->m_newMsgKeywords = aNewMsgKeywords;
      mCopyState->m_flags = newMsgFlags;
    }

    parseMsgState = new nsParseMailMessageState();
    NS_ENSURE_TRUE(parseMsgState, NS_ERROR_OUT_OF_MEMORY);
    nsCOMPtr<nsIMsgDatabase> msgDb;
    mCopyState->m_parseMsgState = parseMsgState;
    GetDatabaseWOReparse(getter_AddRefs(msgDb));
    if (msgDb) parseMsgState->SetMailDB(msgDb);

    nsCOMPtr<nsIInputStream> inputStream;
    nsCOMPtr<nsISeekableStream> seekableStream;
    rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), aFile);
    if NS_SUCCEEDED (rv) {
      seekableStream = do_QueryInterface(inputStream, &rv);
    }

    // All or none for adding a message file to the store
    if (NS_SUCCEEDED(rv) && fileSize > PR_INT32_MAX)
      rv = NS_ERROR_ILLEGAL_VALUE;  // may need error code for max msg size

    // Sniff the beginning of the message to check for:
    // 1. An erroneous "From " separator (a proper RFC5322 message file
    //    shouldn't have one, but they are out there in the wild (e.g.
    //    previous versions of TB would include a "From " line in emails
    //    saved out to a file).
    // 2. X-Mozilla-* headers. If they aren't present, we'll ask for them
    //    to be added during the copy process.
    int64_t msgStart = 0;
    if (NS_SUCCEEDED(rv) && inputStream) {
      // X-Mozilla-* headers, if present, appear early. So 2KB should be
      // enough.
      mozilla::Buffer<char> buf(2048);
      uint32_t n;
      rv = inputStream->Read(buf.Elements(), buf.Length(), &n);

      if (NS_SUCCEEDED(rv)) {
        auto data = buf.AsSpan().First(n);
        // Found a "From " line? If so, note where it ends so we can skip it.
        auto firstLine = FirstLine(data);
        if (firstLine.Length() >= 5 &&
            nsDependentCSubstring(firstLine.First(5)).EqualsLiteral("From ")) {
          msgStart = (int64_t)firstLine.Length();  // Includes the EOL.
          data = data.From(firstLine.Length());
        }

        // Are there any X-Mozilla-(Status|Status2|Keys) headers?
        // If not, we'll ask for them to be added.
        mCopyState->m_addXMozillaHeaders = true;
        HeaderReader rdr;
        rdr.Parse(data, [&](HeaderReader::Hdr const& hdr) {
          auto const name = hdr.Name(data);
          if (name.EqualsLiteral(X_MOZILLA_STATUS) ||
              name.EqualsLiteral(X_MOZILLA_STATUS2) ||
              name.EqualsLiteral("X-Mozilla-Keys")) {
            mCopyState->m_addXMozillaHeaders = false;
            return false;  // Early out.
          }
          return true;  // Continue scanning headers.
        });

        // Seek back to beginning of message, ready for copying,
        // If we did find an initial "From ", skip to the next line.
        rv = seekableStream->Seek(nsISeekableStream::NS_SEEK_SET, msgStart);
      }
    }

    if (NS_SUCCEEDED(rv)) {
      rv = BeginCopy();
    }
    if (NS_SUCCEEDED(rv)) {
      rv = CopyData(inputStream, (int32_t)fileSize - msgStart);
    }
    if (NS_SUCCEEDED(rv)) {
      rv = EndCopy(true);
    }

    // mDatabase should have been initialized above.
    // If we were going to delete, here is where we would do it. But because
    // existing code already supports doing those deletes, we are just going
    // to end the copy.
    if (NS_SUCCEEDED(rv) && msgToReplace && mDatabase) {
      rv = OnCopyCompleted(fileSupport, true);
    }

    if (inputStream) {
      inputStream->Close();
    }
  }

  if (NS_FAILED(rv)) {
    (void)OnCopyCompleted(fileSupport, false);
  }

  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetNewMessages(nsIMsgWindow* aWindow,
                                                   nsIUrlListener* aListener) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);

  nsCOMPtr<nsILocalMailIncomingServer> localMailServer =
      do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);

  // XXX todo, move all this into nsILocalMailIncomingServer's GetNewMail
  // so that we don't have to have RSS foo here.
  nsCOMPtr<nsIRssIncomingServer> rssServer = do_QueryInterface(server, &rv);
  mozilla::Unused << rssServer;
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIURI> resultURI;
    return localMailServer->GetNewMail(aWindow, aListener, this,
                                       getter_AddRefs(resultURI));
  }

  nsCOMPtr<nsIMsgFolder> inbox;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = server->GetRootMsgFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                   getter_AddRefs(inbox));
  }
  nsCOMPtr<nsIMsgLocalMailFolder> localInbox = do_QueryInterface(inbox, &rv);
  if (NS_SUCCEEDED(rv)) {
    bool valid = false;
    nsCOMPtr<nsIMsgDatabase> db;
    // This will kick off a reparse if the db is out of date.
    // TODO: This uses SetCheckForNewMessagesAfterParsing() to tell
    // FinishUpAfterParseFolder() to call us again when it's done.
    // Would be much better to pass in a UrlListener here which calls
    // GetNewMail() in its OnStopRunningUrl() callback.
    // See Bug 1848476.
    rv = localInbox->GetDatabaseWithReparse(nullptr, aWindow,
                                            getter_AddRefs(db));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIURI> resultURI;
      db->GetSummaryValid(&valid);
      rv = valid ? localMailServer->GetNewMail(aWindow, aListener, inbox,
                                               getter_AddRefs(resultURI))
                 : localInbox->SetCheckForNewMessagesAfterParsing(true);
    }
  }
  return rv;
}

nsresult nsMsgLocalMailFolder::WriteStartOfNewMessage() {
  // If moving, delete the message in source folder that was just copied.
  // It will have index one less than the current index.
  // But only do this if source folder is imap.
  // Could be optimized (DeleteMessages() operate on non-array)?
  nsresult rv;
  uint32_t idx = mCopyState->m_curCopyIndex;
  if (mCopyState->m_isMove && idx) {
    nsCOMPtr<nsIMsgFolder> srcFolder =
        do_QueryInterface(mCopyState->m_srcSupport, &rv);
    if (NS_SUCCEEDED(rv) && srcFolder) {
      // Delete source messages as we go only if they come from
      // an imap folder.
      nsCString protocolType;
      if (NS_SUCCEEDED(srcFolder->GetURI(protocolType))) {
        if (StringHead(protocolType, 5).LowerCaseEqualsLiteral("imap:")) {
          // Create "array" of one message header to delete
          idx--;
          if (idx < mCopyState->m_messages.Length()) {
            // Above check avoids a possible MOZ_CRASH after error recovery.
            RefPtr<nsIMsgDBHdr> msg = mCopyState->m_messages[idx];
            srcFolder->DeleteMessages({msg}, mCopyState->m_msgWindow, true,
                                      true, nullptr, mCopyState->m_allowUndo);
          }
        }
      }
    }
  }

  // CopyFileMessage() and CopyMessages() from servers other than pop3
  if (mCopyState->m_parseMsgState) {
    // Make sure the parser knows where the "From " separator is.
    // A hack for Bug 1734847.
    // If we were using nsMsgMailboxParser, that would handle it automatically.
    // But we're using the base class (nsParseMailMessageState) which doesn't.
    mCopyState->m_parseMsgState->m_envelope_pos =
        mCopyState->m_parseMsgState->m_position;

    if (mCopyState->m_parseMsgState->m_newMsgHdr) {
      mCopyState->m_parseMsgState->m_newMsgHdr->GetMessageKey(
          &mCopyState->m_curDstKey);
    }
    mCopyState->m_parseMsgState->SetState(
        nsIMsgParseMailMsgState::ParseHeadersState);
  }
  if (mCopyState->m_addXMozillaHeaders) {
    // The message is apparently coming in from a source which doesn't
    // include X-Mozilla-Status et al, so we'll slip them in now, before
    // we start writing the real headers.
    // TODO: A much more robust solution would be to check for the headers
    // as the data flows through CopyData(), and to add in any missing
    // X-Mozilla-* headers there. Falls under Bug 1731177.
    nsCString result;
    uint32_t bytesWritten;

    // Insert an X-Mozilla-Status header.
    char statusStrBuf[50];
    if (mCopyState->m_curCopyIndex < mCopyState->m_messages.Length()) {
      uint32_t dbFlags = 0;
      mCopyState->m_messages[mCopyState->m_curCopyIndex]->GetFlags(&dbFlags);

      // write out x-mozilla-status, but make sure we don't write out
      // nsMsgMessageFlags::Offline
      PR_snprintf(
          statusStrBuf, sizeof(statusStrBuf),
          X_MOZILLA_STATUS_FORMAT MSG_LINEBREAK,
          dbFlags &
              ~(nsMsgMessageFlags::RuntimeOnly | nsMsgMessageFlags::Offline) &
              0x0000FFFF);
    } else {
      strcpy(statusStrBuf, "X-Mozilla-Status: 0001" MSG_LINEBREAK);
    }

    mCopyState->m_fileStream->Write(statusStrBuf, strlen(statusStrBuf),
                                    &bytesWritten);
    if (mCopyState->m_parseMsgState) {
      mCopyState->m_parseMsgState->ParseAFolderLine(statusStrBuf,
                                                    strlen(statusStrBuf));
    }

    // Insert an X-Mozilla-Status2 header.
    result = "X-Mozilla-Status2: 00000000" MSG_LINEBREAK;
    mCopyState->m_fileStream->Write(result.get(), result.Length(),
                                    &bytesWritten);
    if (mCopyState->m_parseMsgState) {
      mCopyState->m_parseMsgState->ParseAFolderLine(result.get(),
                                                    result.Length());
    }

    // Insert an X-Mozilla-Keys header.
    result = X_MOZILLA_KEYWORDS;
    mCopyState->m_fileStream->Write(result.get(), result.Length(),
                                    &bytesWritten);
    if (mCopyState->m_parseMsgState) {
      mCopyState->m_parseMsgState->ParseAFolderLine(result.get(),
                                                    result.Length());
    }
  }

  mCopyState->m_curCopyIndex++;
  return NS_OK;
}

nsresult nsMsgLocalMailFolder::InitCopyMsgHdrAndFileStream() {
  nsresult rv = GetMsgStore(getter_AddRefs(mCopyState->m_msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mCopyState->m_msgStore->GetNewMsgOutputStream(
      this, getter_AddRefs(mCopyState->m_newHdr),
      getter_AddRefs(mCopyState->m_fileStream));
  NS_ENSURE_SUCCESS(rv, rv);
  if (mCopyState->m_parseMsgState)
    mCopyState->m_parseMsgState->SetNewMsgHdr(mCopyState->m_newHdr);
  return rv;
}

// nsICopyMessageListener.beginCopy()
NS_IMETHODIMP nsMsgLocalMailFolder::BeginCopy() {
  if (!mCopyState) return NS_ERROR_NULL_POINTER;

  if (!mCopyState->m_copyingMultipleMessages) {
    nsresult rv = InitCopyMsgHdrAndFileStream();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  // The output stream may or may not be set already, depending upon all kinds
  // of inscrutable conditions. This needs cleaning up (see Bug 1731177).
  if (!mCopyState->m_fileStream) {
    return NS_OK;
  }

  int32_t messageIndex = (mCopyState->m_copyingMultipleMessages)
                             ? mCopyState->m_curCopyIndex - 1
                             : mCopyState->m_curCopyIndex;
  NS_ASSERTION(!mCopyState->m_copyingMultipleMessages || messageIndex >= 0,
               "messageIndex invalid");
  // by the time we get here, m_curCopyIndex is 1 relative because
  // WriteStartOfNewMessage increments it
  if (messageIndex < (int32_t)mCopyState->m_messages.Length()) {
    mCopyState->m_message = mCopyState->m_messages[messageIndex];
  } else {
    mCopyState->m_message = nullptr;
  }
  // The flags of the source message can get changed when it is deleted, so
  // save them here.
  if (mCopyState->m_message)
    mCopyState->m_message->GetFlags(&(mCopyState->m_flags));
  DisplayMoveCopyStatusMsg();
  if (mCopyState->m_listener)
    mCopyState->m_listener->OnProgress(mCopyState->m_curCopyIndex,
                                       mCopyState->m_totalMsgCount);
  // if we're copying more than one message, StartMessage will handle this.
  return !mCopyState->m_copyingMultipleMessages ? WriteStartOfNewMessage()
                                                : NS_OK;
}

// nsICopyMessageListener.copyData()
NS_IMETHODIMP nsMsgLocalMailFolder::CopyData(nsIInputStream* aIStream,
                                             int32_t aLength) {
  // check to make sure we have control of the write.
  bool haveSemaphore;
  nsresult rv = NS_OK;

  rv = TestSemaphore(static_cast<nsIMsgLocalMailFolder*>(this), &haveSemaphore);
  if (NS_FAILED(rv)) return rv;
  if (!haveSemaphore) return NS_MSG_FOLDER_BUSY;

  if (!mCopyState) return NS_ERROR_OUT_OF_MEMORY;

  while (aLength > 0 && !mCopyState->m_writeFailed) {
    uint32_t readCount;
    rv = aIStream->Read(
        mCopyState->m_dataBuffer.begin(),
        std::min((uint32_t)aLength, (uint32_t)mCopyState->m_dataBuffer.Length),
        &readCount);
    if (readCount == 0) {
      rv = NS_ERROR_UNEXPECTED;  // unexpected EOF.
    }
    NS_ENSURE_SUCCESS(rv, rv);
    aLength -= readCount;
    auto data =
        mozilla::Span<const char>(mCopyState->m_dataBuffer.cbegin(), readCount);
    mCopyState->m_LineReader.Feed(
        data, std::bind(&nsMsgLocalMailFolder::CopyLine, this,
                        std::placeholders::_1));
  }

  if (mCopyState->m_writeFailed) {
    return NS_ERROR_UNEXPECTED;
  }
  return NS_OK;
}

// Handle a single line - called from CopyData() and EndCopy().
// Would be better not to do this line by line but we're feeding
// into a nsParseMailMessageState here, and that needs lines.
// Returns true upon success.
// Upon failure, sets mCopyState->m_writeFailed and returns false.
bool nsMsgLocalMailFolder::CopyLine(mozilla::Span<const char> line) {
  if (!mCopyState->m_fileStream) {
    ThrowAlertMsg("copyMsgWriteFailed", mCopyState->m_msgWindow);
    mCopyState->m_writeFailed = true;
    return false;  // Stop processing!
  }

  // Feed it to the messagestore.
  uint32_t bytesWritten;
  nsresult rv = mCopyState->m_fileStream->Write(line.data(), line.Length(),
                                                &bytesWritten);
  if (NS_FAILED(rv)) {
    ThrowAlertMsg("copyMsgWriteFailed", mCopyState->m_msgWindow);
    mCopyState->m_writeFailed = true;
    return false;  // Stop processing!
  }

  if (mCopyState->m_parseMsgState) {
    // Also feed it through the nsParseMailMessageState to extract the
    // headers for an nsIMsgDBHdr.
    mCopyState->m_parseMsgState->ParseAFolderLine(line.data(), line.size());
  }
  return true;  // All good.
}

void nsMsgLocalMailFolder::CopyPropertiesToMsgHdr(nsIMsgDBHdr* destHdr,
                                                  nsIMsgDBHdr* srcHdr,
                                                  bool aIsMove) {
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS_VOID(rv);

  nsCString dontPreserve;

  // These preferences exist so that extensions can control which properties
  // are preserved in the database when a message is moved or copied. All
  // properties are preserved except those listed in these preferences
  if (aIsMove)
    prefBranch->GetCharPref("mailnews.database.summary.dontPreserveOnMove",
                            dontPreserve);
  else
    prefBranch->GetCharPref("mailnews.database.summary.dontPreserveOnCopy",
                            dontPreserve);

  CopyHdrPropertiesWithSkipList(destHdr, srcHdr, dontPreserve);
}

void nsMsgLocalMailFolder::CopyHdrPropertiesWithSkipList(
    nsIMsgDBHdr* destHdr, nsIMsgDBHdr* srcHdr, const nsCString& skipList) {
  nsTArray<nsCString> properties;
  nsresult rv = srcHdr->GetProperties(properties);
  NS_ENSURE_SUCCESS_VOID(rv);

  // We'll add spaces at beginning and end so we can search for space-name-space
  nsCString dontPreserveEx(" "_ns);
  dontPreserveEx.Append(skipList);
  dontPreserveEx.Append(' ');

  nsCString sourceString;
  for (auto property : properties) {
    nsAutoCString propertyEx(" "_ns);
    propertyEx.Append(property);
    propertyEx.Append(' ');
    if (dontPreserveEx.Find(propertyEx) != -1)  // -1 is not found
      continue;

    srcHdr->GetStringProperty(property.get(), sourceString);
    destHdr->SetStringProperty(property.get(), sourceString);
  }
}

// nsICopyMessageListener.endCopy()
MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMsgLocalMailFolder::EndCopy(bool aCopySucceeded) {
  if (!mCopyState) return NS_OK;

  // Flush any remaining data (i.e if the last line of the message had
  // no EOL).
  mCopyState->m_LineReader.Flush(
      std::bind(&nsMsgLocalMailFolder::CopyLine, this, std::placeholders::_1));

  // we are the destination folder for a move/copy
  nsresult rv = aCopySucceeded ? NS_OK : NS_ERROR_FAILURE;

  if (!aCopySucceeded || mCopyState->m_writeFailed) {
    if (mCopyState->m_fileStream) {
      if (mCopyState->m_curDstKey != nsMsgKey_None) {
        mCopyState->m_msgStore->DiscardNewMessage(mCopyState->m_fileStream,
                                                  mCopyState->m_newHdr);
      }
      mCopyState->m_fileStream = nullptr;
    }

    if (!mCopyState->m_isMove) {
      // passing true because the messages that have been successfully
      // copied have their corresponding hdrs in place. The message that has
      // failed has been truncated so the msf file and berkeley mailbox
      // are in sync.
      (void)OnCopyCompleted(mCopyState->m_srcSupport, true);
      // enable the dest folder
      EnableNotifications(allMessageCountNotifications, true);
    }
    return NS_OK;
  }

  bool multipleCopiesFinished =
      (mCopyState->m_curCopyIndex >= mCopyState->m_totalMsgCount);

  RefPtr<nsLocalMoveCopyMsgTxn> localUndoTxn = mCopyState->m_undoMsgTxn;

  // flush the copied message. We need a close at the end to get the
  // file size and time updated correctly.
  //
  // These filestream closes are handled inconsistently in the code. In some
  // cases, this is done in EndMessage, while in others it is done here in
  // EndCopy. When we do the close in EndMessage, we'll set
  // mCopyState->m_fileStream to null since it is no longer needed, and detect
  // here the null stream so we know that we don't have to close it here.
  //
  // Similarly, m_parseMsgState->GetNewMsgHdr() returns a null hdr if the hdr
  // has already been processed by EndMessage so it is not doubly added here.

  if (mCopyState->m_fileStream) {
    rv = mCopyState->m_msgStore->FinishNewMessage(mCopyState->m_fileStream,
                                                  mCopyState->m_newHdr);
    if (NS_SUCCEEDED(rv) && mCopyState->m_newHdr) {
      mCopyState->m_newHdr->GetMessageKey(&mCopyState->m_curDstKey);
    }
    mCopyState->m_fileStream = nullptr;
  }
  // Copy the header to the new database
  if (mCopyState->m_message) {
    //  CopyMessages() goes here, and CopyFileMessages() with metadata to save;
    nsCOMPtr<nsIMsgDBHdr> newHdr;
    if (!mCopyState->m_parseMsgState) {
      if (mCopyState->m_destDB) {
        if (mCopyState->m_newHdr) {
          newHdr = mCopyState->m_newHdr;
          CopyHdrPropertiesWithSkipList(newHdr, mCopyState->m_message,
                                        "storeToken msgOffset"_ns);
          // We need to copy more than just what UpdateNewMsgHdr does. In fact,
          // I think we want to copy almost every property other than
          // storeToken and msgOffset.
          mCopyState->m_destDB->AddNewHdrToDB(newHdr, true);
        } else {
          rv = mCopyState->m_destDB->CopyHdrFromExistingHdr(
              mCopyState->m_curDstKey, mCopyState->m_message, true,
              getter_AddRefs(newHdr));
        }
        uint32_t newHdrFlags;
        if (newHdr) {
          // turn off offline flag - it's not valid for local mail folders.
          newHdr->AndFlags(~nsMsgMessageFlags::Offline, &newHdrFlags);
          mCopyState->m_destMessages.AppendElement(newHdr);
        }
      }
      // we can do undo with the dest folder db, see bug #198909
      // else
      //   mCopyState->m_undoMsgTxn = nullptr;  // null out the transaction
      //                                        // because we can't undo w/o
      //                                        // the msg db
    }

    // if we plan on allowing undo, (if we have a mCopyState->m_parseMsgState or
    // not) we need to save the source and dest keys on the undo txn. see bug
    // #179856 for details
    bool isImap;
    if (NS_SUCCEEDED(rv) && localUndoTxn) {
      localUndoTxn->GetSrcIsImap(&isImap);
      if (!isImap || !mCopyState->m_copyingMultipleMessages) {
        nsMsgKey aKey;
        mCopyState->m_message->GetMessageKey(&aKey);
        localUndoTxn->AddSrcKey(aKey);
        localUndoTxn->AddDstKey(mCopyState->m_curDstKey);
      }
    }
  }
  nsCOMPtr<nsIMsgDBHdr> newHdr;
  // CopyFileMessage() and CopyMessages() from servers other than mailbox
  if (mCopyState->m_parseMsgState) {
    nsCOMPtr<nsIMsgDatabase> msgDb;
    mCopyState->m_parseMsgState->FinishHeader();
    GetDatabaseWOReparse(getter_AddRefs(msgDb));
    if (msgDb) {
      nsresult result =
          mCopyState->m_parseMsgState->GetNewMsgHdr(getter_AddRefs(newHdr));
      // we need to copy newHdr because mCopyState will get cleared
      // in OnCopyCompleted, but we need OnCopyCompleted to know about
      // the newHdr, via mCopyState. And we send a notification about newHdr
      // after OnCopyCompleted.
      mCopyState->m_newHdr = newHdr;
      if (NS_SUCCEEDED(result) && newHdr) {
        // Copy message metadata.
        uint32_t newFlags;
        newHdr->GetFlags(&newFlags);
        if (mCopyState->m_message) {
          // Propagate the new flag on an imap to local folder filter action
          // Flags may get changed when deleting the original source message in
          // IMAP. We have a copy of the original flags, but parseMsgState has
          // already tried to decide what those flags should be. Who to believe?
          // Let's deal here with the flags that might get changed, Read and
          // New, and trust upstream code for everything else. However,
          // we need to carry over HasRe since the subject is copied over
          // from the original.
          uint32_t carryOver = nsMsgMessageFlags::New |
                               nsMsgMessageFlags::Read |
                               nsMsgMessageFlags::HasRe;
          newHdr->SetFlags((newFlags & ~carryOver) |
                           ((mCopyState->m_flags) & carryOver));

          // Copy other message properties.
          CopyPropertiesToMsgHdr(newHdr, mCopyState->m_message,
                                 mCopyState->m_isMove);
        } else {
          // Carry over some of the enforced flags, but do not clear any of the
          // already set flags (for example nsMsgMessageFlags::Queued or
          // nsMsgMessageFlags::MDNReportSent).
          uint32_t carryOver = nsMsgMessageFlags::New |
                               nsMsgMessageFlags::Read |
                               nsMsgMessageFlags::Marked;
          newHdr->SetFlags((newFlags & ~carryOver) |
                           ((mCopyState->m_flags) & carryOver));
        }
        msgDb->AddNewHdrToDB(newHdr, true);
        if (localUndoTxn) {
          // ** jt - recording the message size for possible undo use; the
          // message size is different for pop3 and imap4 messages
          uint32_t msgSize;
          newHdr->GetMessageSize(&msgSize);
          localUndoTxn->AddDstMsgSize(msgSize);
        }

        mCopyState->m_destMessages.AppendElement(newHdr);
      }
      // msgDb->SetSummaryValid(true);
      // msgDb->Commit(nsMsgDBCommitType::kLargeCommit);
    } else
      mCopyState->m_undoMsgTxn = nullptr;  // null out the transaction because
                                           // we can't undo w/o the msg db

    mCopyState->m_parseMsgState->Clear();
    if (mCopyState->m_listener)  // CopyFileMessage() only
      mCopyState->m_listener->SetMessageKey(mCopyState->m_curDstKey);
  }

  if (!multipleCopiesFinished && !mCopyState->m_copyingMultipleMessages) {
    // CopyMessages() goes here; CopyFileMessage() never gets in here because
    // curCopyIndex will always be less than the mCopyState->m_totalMsgCount
    nsIMsgDBHdr* aSupport = mCopyState->m_messages[mCopyState->m_curCopyIndex];
    rv = CopyMessageTo(aSupport, mCopyState->m_msgWindow, mCopyState->m_isMove);
  } else {
    // If we have some headers, then there is a source, so notify
    // itemMoveCopyCompleted. If we don't have any headers already, (eg save as
    // draft, send) then notify itemAdded. This notification is done after the
    // messages are deleted, so that saving a new draft of a message works
    // correctly -- first an itemDeleted is sent for the old draft, then an
    // itemAdded for the new draft.
    uint32_t numHdrs = mCopyState->m_messages.Length();

    if (multipleCopiesFinished && numHdrs && !mCopyState->m_isFolder) {
      // we need to send this notification before we delete the source messages,
      // because deleting the source messages clears out the src msg db hdr.
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier) {
        notifier->NotifyMsgsMoveCopyCompleted(mCopyState->m_isMove,
                                              mCopyState->m_messages, this,
                                              mCopyState->m_destMessages);
      }
    }

    // Now allow folder or nested folders move of their msgs from Local Folders.
    // The original source folder(s) remain, just the msgs are moved (after
    // copy they are deleted).
    if (multipleCopiesFinished) {
      nsCOMPtr<nsIMsgFolder> srcFolder;
      srcFolder = do_QueryInterface(mCopyState->m_srcSupport);
      if (mCopyState->m_isFolder) {
        // Copy or move all subfolders then notify completion
        CopyAllSubFolders(srcFolder, nullptr, nullptr, mCopyState->m_isMove);
      }

      // If this is done on move of selected messages between "mailbox" folders,
      // the source messages are never deleted. So do this only on msg copy.
      if (!mCopyState->m_isMove) {
        if (mCopyState->m_msgWindow && mCopyState->m_undoMsgTxn) {
          nsCOMPtr<nsITransactionManager> txnMgr;
          mCopyState->m_msgWindow->GetTransactionManager(
              getter_AddRefs(txnMgr));
          if (txnMgr) {
            RefPtr<nsLocalMoveCopyMsgTxn> txn = mCopyState->m_undoMsgTxn;
            txnMgr->DoTransaction(txn);
          }
        }

        // enable the dest folder
        EnableNotifications(allMessageCountNotifications, true);
        if (srcFolder && !mCopyState->m_isFolder) {
          // I'm not too sure of the proper location of this event. It seems to
          // need to be after the EnableNotifications, or the folder counts can
          // be incorrect during the kDeleteOrMoveMsgCompleted call.
          srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
        }
        (void)OnCopyCompleted(mCopyState->m_srcSupport, true);
      }
    }
    // Send the itemAdded notification in case we didn't send the
    // itemMoveCopyCompleted notification earlier. Posting news messages
    // involves this, yet doesn't have the newHdr initialized, so don't send any
    // notifications in that case.
    if (!numHdrs && newHdr) {
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier) {
        notifier->NotifyMsgAdded(newHdr);
        // We do not appear to trigger classification in this case, so let's
        // paper over the abyss by just sending the classification notification.
        notifier->NotifyMsgsClassified({&*newHdr}, false, false);
        // (We do not add the NotReportedClassified processing flag since we
        // just reported it!)
      }
    }
  }
  return rv;
}

static bool gGotGlobalPrefs;
static bool gDeleteFromServerOnMove;

bool nsMsgLocalMailFolder::GetDeleteFromServerOnMove() {
  if (!gGotGlobalPrefs) {
    nsCOMPtr<nsIPrefBranch> pPrefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID));
    if (pPrefBranch) {
      pPrefBranch->GetBoolPref("mail.pop3.deleteFromServerOnMove",
                               &gDeleteFromServerOnMove);
      gGotGlobalPrefs = true;
    }
  }
  return gDeleteFromServerOnMove;
}

// nsICopyMessageListener.endMove()
MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMsgLocalMailFolder::EndMove(bool moveSucceeded) {
  nsresult rv;
  if (!mCopyState) return NS_OK;

  if (!moveSucceeded || mCopyState->m_writeFailed) {
    // Notify that a completion finished.
    nsCOMPtr<nsIMsgFolder> srcFolder =
        do_QueryInterface(mCopyState->m_srcSupport, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);

    /* passing true because the messages that have been successfully copied have
       their corresponding hdrs in place. The message that has failed has been
       truncated so the msf file and berkeley mailbox are in sync*/

    (void)OnCopyCompleted(mCopyState->m_srcSupport, true);
    // enable the dest folder
    EnableNotifications(allMessageCountNotifications, true);
    return NS_OK;
  }

  if (mCopyState && mCopyState->m_curCopyIndex >= mCopyState->m_totalMsgCount) {
    // Notify that a completion finished.
    nsCOMPtr<nsIMsgFolder> srcFolder =
        do_QueryInterface(mCopyState->m_srcSupport, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgLocalMailFolder> localSrcFolder =
        do_QueryInterface(srcFolder);
    if (localSrcFolder) {
      // if we are the trash and a local msg is being moved to us, mark the
      // source for delete from server, if so configured.
      if (mFlags & nsMsgFolderFlags::Trash) {
        // if we're deleting on all moves, we'll mark this message for deletion
        // when we call DeleteMessages on the source folder. So don't mark it
        // for deletion here, in that case.
        if (!GetDeleteFromServerOnMove()) {
          localSrcFolder->MarkMsgsOnPop3Server(mCopyState->m_messages,
                                               POP3_DELETE);
        }
      }
    }
    // lets delete these all at once - much faster that way
    rv = srcFolder->DeleteMessages(mCopyState->m_messages,
                                   mCopyState->m_msgWindow, true, true, nullptr,
                                   mCopyState->m_allowUndo);
    AutoCompact(mCopyState->m_msgWindow);

    // enable the dest folder
    EnableNotifications(allMessageCountNotifications, true);
    // I'm not too sure of the proper location of this event. It seems to need
    // to be after the EnableNotifications, or the folder counts can be
    // incorrect during the kDeleteOrMoveMsgCompleted call.
    srcFolder->NotifyFolderEvent(NS_SUCCEEDED(rv) ? kDeleteOrMoveMsgCompleted
                                                  : kDeleteOrMoveMsgFailed);

    if (NS_SUCCEEDED(rv) && mCopyState->m_msgWindow &&
        mCopyState->m_undoMsgTxn) {
      nsCOMPtr<nsITransactionManager> txnMgr;
      mCopyState->m_msgWindow->GetTransactionManager(getter_AddRefs(txnMgr));
      if (txnMgr) {
        RefPtr<nsLocalMoveCopyMsgTxn> txn = mCopyState->m_undoMsgTxn;
        txnMgr->DoTransaction(txn);
      }
    }
    (void)OnCopyCompleted(
        mCopyState->m_srcSupport,
        NS_SUCCEEDED(rv)
            ? true
            : false);  // clear the copy state so that the next message from a
                       // different folder can be move
  }

  return NS_OK;
}

// nsICopyMessageListener.startMessage()
// this is the beginning of the next message copied
NS_IMETHODIMP nsMsgLocalMailFolder::StartMessage() {
  // We get crashes that we don't understand (bug 284876), so stupidly prevent
  // that.
  NS_ENSURE_ARG_POINTER(mCopyState);
  nsresult rv = InitCopyMsgHdrAndFileStream();
  NS_ENSURE_SUCCESS(rv, rv);
  return WriteStartOfNewMessage();
}

// nsICopyMessageListener.endMessage()
// just finished the current message.
NS_IMETHODIMP nsMsgLocalMailFolder::EndMessage(nsMsgKey key) {
  NS_ENSURE_ARG_POINTER(mCopyState);

  RefPtr<nsLocalMoveCopyMsgTxn> localUndoTxn = mCopyState->m_undoMsgTxn;
  nsCOMPtr<nsIMsgWindow> msgWindow;
  nsresult rv;

  if (localUndoTxn) {
    localUndoTxn->GetMsgWindow(getter_AddRefs(msgWindow));
    localUndoTxn->AddSrcKey(key);
    localUndoTxn->AddDstKey(mCopyState->m_curDstKey);
  }

  // Request addition of X-Mozilla-Status et al.
  mCopyState->m_addXMozillaHeaders = true;
  if (mCopyState->m_fileStream) {
    rv = mCopyState->m_msgStore->FinishNewMessage(mCopyState->m_fileStream,
                                                  mCopyState->m_newHdr);
    mCopyState->m_fileStream = nullptr;
  }

  // CopyFileMessage() and CopyMessages() from servers other than mailbox
  if (mCopyState->m_parseMsgState) {
    nsCOMPtr<nsIMsgDatabase> msgDb;
    nsCOMPtr<nsIMsgDBHdr> newHdr;

    mCopyState->m_parseMsgState->FinishHeader();

    rv = mCopyState->m_parseMsgState->GetNewMsgHdr(getter_AddRefs(newHdr));
    if (NS_SUCCEEDED(rv) && newHdr) {
      nsCOMPtr<nsIMsgFolder> srcFolder =
          do_QueryInterface(mCopyState->m_srcSupport, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsIMsgDatabase> srcDB;
      srcFolder->GetMsgDatabase(getter_AddRefs(srcDB));
      if (srcDB) {
        nsCOMPtr<nsIMsgDBHdr> srcMsgHdr;
        srcDB->GetMsgHdrForKey(key, getter_AddRefs(srcMsgHdr));
        if (srcMsgHdr)
          CopyPropertiesToMsgHdr(newHdr, srcMsgHdr, mCopyState->m_isMove);
      }
      rv = GetDatabaseWOReparse(getter_AddRefs(msgDb));
      if (NS_SUCCEEDED(rv) && msgDb) {
        msgDb->AddNewHdrToDB(newHdr, true);
        if (localUndoTxn) {
          // ** jt - recording the message size for possible undo use; the
          // message size is different for pop3 and imap4 messages
          uint32_t msgSize;
          newHdr->GetMessageSize(&msgSize);
          localUndoTxn->AddDstMsgSize(msgSize);
        }
      } else
        mCopyState->m_undoMsgTxn = nullptr;  // null out the transaction because
                                             // we can't undo w/o the msg db
    }
    mCopyState->m_parseMsgState->Clear();

    if (mCopyState->m_listener)  // CopyFileMessage() only
      mCopyState->m_listener->SetMessageKey(mCopyState->m_curDstKey);
  }

  return NS_OK;
}

nsresult nsMsgLocalMailFolder::CopyMessagesTo(nsTArray<nsMsgKey>& keyArray,
                                              nsIMsgWindow* aMsgWindow,
                                              bool isMove) {
  if (!mCopyState) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> srcFolder(
      do_QueryInterface(mCopyState->m_srcSupport, &rv));
  NS_ENSURE_SUCCESS(rv, NS_ERROR_NO_INTERFACE);

  if (!mCopyState->m_messageService) {
    nsCString uri;
    srcFolder->GetURI(uri);
    rv = GetMessageServiceFromURI(uri,
                                  getter_AddRefs(mCopyState->m_messageService));
  }

  if (NS_SUCCEEDED(rv) && mCopyState->m_messageService) {
    mCopyState->m_curCopyIndex = 0;
    // we need to kick off the first message - subsequent messages
    // are kicked off by nsMailboxProtocol when it finishes a message
    // before starting the next message. Only do this if the source folder
    // is a local folder, however. IMAP will handle calling StartMessage for
    // each message that gets downloaded, and news doesn't go through here
    // because news only downloads one message at a time, and this routine
    // is for multiple message copy.
    nsCOMPtr<nsIMsgLocalMailFolder> srcLocalFolder =
        do_QueryInterface(srcFolder);
    if (srcLocalFolder) {
      StartMessage();
    }

    RefPtr<CopyMessageStreamListener> streamListener =
        new CopyMessageStreamListener(this, isMove);

    nsCOMPtr<nsIURI> dummyNull;
    rv = mCopyState->m_messageService->CopyMessages(
        keyArray, srcFolder, streamListener, isMove, nullptr, aMsgWindow,
        getter_AddRefs(dummyNull));
  }

  return rv;
}

nsresult nsMsgLocalMailFolder::CopyMessageTo(nsISupports* message,
                                             nsIMsgWindow* aMsgWindow,
                                             bool isMove) {
  if (!mCopyState) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  nsresult rv;
  nsCOMPtr<nsIMsgDBHdr> msgHdr(do_QueryInterface(message, &rv));
  NS_ENSURE_SUCCESS(rv, NS_ERROR_NO_INTERFACE);

  mCopyState->m_message = msgHdr;

  nsCOMPtr<nsIMsgFolder> srcFolder(
      do_QueryInterface(mCopyState->m_srcSupport, &rv));
  NS_ENSURE_SUCCESS(rv, NS_ERROR_NO_INTERFACE);
  nsCString uri;
  srcFolder->GetUriForMsg(msgHdr, uri);

  if (!mCopyState->m_messageService) {
    rv = GetMessageServiceFromURI(uri,
                                  getter_AddRefs(mCopyState->m_messageService));
  }

  if (NS_SUCCEEDED(rv) && mCopyState->m_messageService) {
    RefPtr<CopyMessageStreamListener> streamListener =
        new CopyMessageStreamListener(this, isMove);

    rv = mCopyState->m_messageService->CopyMessage(uri, streamListener, isMove,
                                                   nullptr, aMsgWindow);
  }

  return rv;
}

// A message is being deleted from a POP3 mail file, so check and see if we have
// the message being deleted in the server. If so, then we need to remove the
// message from the server as well. We have saved the UIDL of the message in the
// popstate.dat file and we must match this uidl, so read the message headers
// and see if we have it, then mark the message for deletion from the server.
// The next time we look at mail the message will be deleted from the server.

NS_IMETHODIMP
nsMsgLocalMailFolder::MarkMsgsOnPop3Server(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages, int32_t aMark) {
  nsLocalFolderScanState folderScanState;
  nsCOMPtr<nsIPop3IncomingServer> curFolderPop3MailServer;
  nsCOMArray<nsIPop3IncomingServer>
      pop3Servers;  // servers with msgs deleted...

  nsCOMPtr<nsIMsgIncomingServer> incomingServer;
  nsresult rv = GetServer(getter_AddRefs(incomingServer));
  NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // I wonder if we should run through the pop3 accounts and see if any of them
  // have leave on server set. If not, we could short-circuit some of this.

  curFolderPop3MailServer = do_QueryInterface(incomingServer, &rv);
  rv = GetFolderScanState(&folderScanState);
  NS_ENSURE_SUCCESS(rv, rv);

  // Filter delete requests are always honored, others are subject
  // to the deleteMailLeftOnServer preference.
  int32_t mark;
  mark = (aMark == POP3_FORCE_DEL) ? POP3_DELETE : aMark;

  for (auto msgDBHdr : aMessages) {
    uint32_t flags = 0;
    if (msgDBHdr) {
      msgDBHdr->GetFlags(&flags);
      nsCOMPtr<nsIPop3IncomingServer> msgPop3Server = curFolderPop3MailServer;
      bool leaveOnServer = false;
      bool deleteMailLeftOnServer = false;
      // set up defaults, in case there's no x-mozilla-account header
      if (curFolderPop3MailServer) {
        curFolderPop3MailServer->GetDeleteMailLeftOnServer(
            &deleteMailLeftOnServer);
        curFolderPop3MailServer->GetLeaveMessagesOnServer(&leaveOnServer);
      }

      rv = GetUidlFromFolder(&folderScanState, msgDBHdr);
      if (!NS_SUCCEEDED(rv)) continue;

      if (folderScanState.m_uidl) {
        nsCOMPtr<nsIMsgAccount> account;
        rv = accountManager->GetAccount(folderScanState.m_accountKey,
                                        getter_AddRefs(account));
        if (NS_SUCCEEDED(rv) && account) {
          account->GetIncomingServer(getter_AddRefs(incomingServer));
          nsCOMPtr<nsIPop3IncomingServer> curMsgPop3MailServer =
              do_QueryInterface(incomingServer);
          if (curMsgPop3MailServer) {
            msgPop3Server = curMsgPop3MailServer;
            msgPop3Server->GetDeleteMailLeftOnServer(&deleteMailLeftOnServer);
            msgPop3Server->GetLeaveMessagesOnServer(&leaveOnServer);
          }
        }
      }
      // ignore this header if not partial and leaveOnServer not set...
      // or if we can't find the pop3 server.
      if (!msgPop3Server ||
          (!(flags & nsMsgMessageFlags::Partial) && !leaveOnServer))
        continue;
      // if marking deleted, ignore header if we're not deleting from
      // server when deleting locally.
      if (aMark == POP3_DELETE && leaveOnServer && !deleteMailLeftOnServer)
        continue;
      if (folderScanState.m_uidl) {
        msgPop3Server->AddUidlToMark(folderScanState.m_uidl, mark);
        // remember this pop server in list of servers with msgs deleted
        if (pop3Servers.IndexOfObject(msgPop3Server) == -1)
          pop3Servers.AppendObject(msgPop3Server);
      }
    }
  }
  if (folderScanState.m_inputStream) folderScanState.m_inputStream->Close();
  // need to do this for all pop3 mail servers that had messages deleted.
  uint32_t serverCount = pop3Servers.Count();
  for (uint32_t index = 0; index < serverCount; index++)
    pop3Servers[index]->MarkMessages();

  return rv;
}

NS_IMETHODIMP nsMsgLocalMailFolder::RetrieveHdrOfPartialMessage(
    nsIMsgDBHdr* newHdr, nsIMsgDBHdr** oldHdr) {
  NS_ENSURE_ARG_POINTER(newHdr);
  NS_ENSURE_ARG_POINTER(oldHdr);
  *oldHdr = nullptr;

  nsCString newMsgId;
  newHdr->GetMessageId(newMsgId);

  // Walk through all the selected headers, looking for a matching
  // Message-ID.
  for (uint32_t i = 0; i < mDownloadPartialMessages.Length(); i++) {
    nsCOMPtr<nsIMsgDBHdr> msgDBHdr = mDownloadPartialMessages[i];
    nsCString oldMsgId;
    msgDBHdr->GetMessageId(oldMsgId);

    // Return the first match and remove it from the array
    if (newMsgId.Equals(oldMsgId)) {
      msgDBHdr.forget(oldHdr);
      mDownloadPartialMessages.RemoveElementAt(i);
      break;
    }
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::DownloadMessagesForOffline(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& aMessages, nsIMsgWindow* aWindow) {
  if (mDownloadInProgress)
    return NS_ERROR_FAILURE;  // already has a download in progress

  // We're starting a download...
  mDownloadInProgress = true;

  MarkMsgsOnPop3Server(aMessages, POP3_FETCH_BODY);

  // Pull out all the PARTIAL messages into a new array
  nsresult rv;
  for (nsIMsgDBHdr* hdr : aMessages) {
    uint32_t flags = 0;
    hdr->GetFlags(&flags);
    if (flags & nsMsgMessageFlags::Partial) {
      mDownloadPartialMessages.AppendElement(hdr);
    }
  }
  mDownloadWindow = aWindow;

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);

  nsCOMPtr<nsILocalMailIncomingServer> localMailServer =
      do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, NS_MSG_INVALID_OR_MISSING_SERVER);
  nsCOMPtr<nsIURI> resultURI;
  return localMailServer->GetNewMail(aWindow, this, this,
                                     getter_AddRefs(resultURI));
}

NS_IMETHODIMP nsMsgLocalMailFolder::HasMsgOffline(nsMsgKey msgKey,
                                                  bool* result) {
  NS_ENSURE_ARG(result);
  *result = false;
  GetDatabase();
  if (!mDatabase) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = mDatabase->GetMsgHdrForKey(msgKey, getter_AddRefs(hdr));
  if (NS_FAILED(rv)) return rv;

  if (hdr) {
    uint32_t flags = 0;
    hdr->GetFlags(&flags);
    // Would be nice to check nsMsgMessageFlags::Offline... but local
    // folders don't set it.
    // Don't want partial messages.
    if (!(flags & nsMsgMessageFlags::Partial)) {
      *result = true;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::GetLocalMsgStream(nsIMsgDBHdr* hdr,
                                                      nsIInputStream** stream) {
  return GetMsgInputStream(hdr, stream);
}

NS_IMETHODIMP nsMsgLocalMailFolder::NotifyDelete() {
  NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
  return NS_OK;
}

// TODO:  once we move certain code into the IncomingServer (search for TODO)
// this method will go away.
// sometimes this gets called when we don't have the server yet, so
// that's why we're not calling GetServer()
NS_IMETHODIMP
nsMsgLocalMailFolder::GetIncomingServerType(nsACString& aServerType) {
  nsresult rv;
  if (mType.IsEmpty()) {
    nsCOMPtr<nsIURL> url;
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .SetSpec(mURI)
             .Finalize(url);
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIMsgAccountManager> accountManager =
        do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIMsgIncomingServer> server;
    // try "none" first
    rv = NS_MutateURI(url).SetScheme("none"_ns).Finalize(url);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = accountManager->FindServerByURI(url, getter_AddRefs(server));
    if (NS_SUCCEEDED(rv) && server)
      mType.AssignLiteral("none");
    else {
      // next try "pop3"
      rv = NS_MutateURI(url).SetScheme("pop3"_ns).Finalize(url);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = accountManager->FindServerByURI(url, getter_AddRefs(server));
      if (NS_SUCCEEDED(rv) && server)
        mType.AssignLiteral("pop3");
      else {
        // next try "rss"
        rv = NS_MutateURI(url).SetScheme("rss"_ns).Finalize(url);
        NS_ENSURE_SUCCESS(rv, rv);
        rv = accountManager->FindServerByURI(url, getter_AddRefs(server));
        if (NS_SUCCEEDED(rv) && server)
          mType.AssignLiteral("rss");
        else {
        }
      }
    }
  }
  aServerType = mType;
  return NS_OK;
}

nsresult nsMsgLocalMailFolder::CreateBaseMessageURI(const nsACString& aURI) {
  return nsCreateLocalBaseMessageURI(aURI, mBaseMessageURI);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::OnStartRunningUrl(nsIURI* aUrl) {
  nsresult rv;
  nsCOMPtr<nsIPop3URL> popurl = do_QueryInterface(aUrl, &rv);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString aSpec;
    rv = aUrl->GetSpec(aSpec);
    NS_ENSURE_SUCCESS(rv, rv);
    if (strstr(aSpec.get(), "uidl=")) {
      nsCOMPtr<nsIPop3Sink> popsink;
      rv = popurl->GetPop3Sink(getter_AddRefs(popsink));
      if (NS_SUCCEEDED(rv)) {
        popsink->SetBaseMessageUri(mBaseMessageURI);
        nsCString messageuri;
        popurl->GetMessageUri(messageuri);
        popsink->SetOrigMessageUri(messageuri);
      }
    }
  }
  return nsMsgDBFolder::OnStartRunningUrl(aUrl);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::OnStopRunningUrl(nsIURI* aUrl, nsresult aExitCode) {
  // If we just finished a DownloadMessages call, reset...
  if (mDownloadInProgress) {
    mDownloadInProgress = false;
    mDownloadPartialMessages.Clear();
    mDownloadWindow = nullptr;
    return nsMsgDBFolder::OnStopRunningUrl(aUrl, aExitCode);
  }

  if (mFlags & nsMsgFolderFlags::Inbox) {
    // if we are the inbox and running pop url
    nsresult rv;
    nsCOMPtr<nsIPop3URL> popurl = do_QueryInterface(aUrl, &rv);
    mozilla::Unused << popurl;
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgIncomingServer> server;
      GetServer(getter_AddRefs(server));
      // this is the deferred to account, in the global inbox case
      if (server) server->SetPerformingBiff(false);  // biff is over
    }
  }
  return nsMsgDBFolder::OnStopRunningUrl(aUrl, aExitCode);
}

nsresult nsMsgLocalMailFolder::DisplayMoveCopyStatusMsg() {
  nsresult rv = NS_OK;
  if (mCopyState) {
    if (!mCopyState->m_statusFeedback) {
      // get msgWindow from undo txn
      nsCOMPtr<nsIMsgWindow> msgWindow;
      if (mCopyState->m_undoMsgTxn)
        mCopyState->m_undoMsgTxn->GetMsgWindow(getter_AddRefs(msgWindow));
      if (!msgWindow) return NS_OK;  // not a fatal error.

      msgWindow->GetStatusFeedback(
          getter_AddRefs(mCopyState->m_statusFeedback));
    }

    if (!mCopyState->m_stringBundle) {
      nsCOMPtr<nsIStringBundleService> bundleService =
          mozilla::components::StringBundle::Service();
      NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
      rv = bundleService->CreateBundle(
          "chrome://messenger/locale/localMsgs.properties",
          getter_AddRefs(mCopyState->m_stringBundle));
      NS_ENSURE_SUCCESS(rv, rv);
    }
    if (mCopyState->m_statusFeedback && mCopyState->m_stringBundle) {
      nsString folderName;
      GetName(folderName);
      nsAutoString numMsgSoFarString;
      numMsgSoFarString.AppendInt((mCopyState->m_copyingMultipleMessages)
                                      ? mCopyState->m_curCopyIndex
                                      : 1);

      nsAutoString totalMessagesString;
      totalMessagesString.AppendInt(mCopyState->m_totalMsgCount);
      nsString finalString;
      AutoTArray<nsString, 3> stringArray = {numMsgSoFarString,
                                             totalMessagesString, folderName};
      rv = mCopyState->m_stringBundle->FormatStringFromName(
          (mCopyState->m_isMove) ? "movingMessagesStatus"
                                 : "copyingMessagesStatus",
          stringArray, finalString);
      int64_t nowMS = PR_IntervalToMilliseconds(PR_IntervalNow());

      // only update status/progress every half second
      if (nowMS - mCopyState->m_lastProgressTime < 500 &&
          mCopyState->m_curCopyIndex < mCopyState->m_totalMsgCount)
        return NS_OK;

      mCopyState->m_lastProgressTime = nowMS;
      mCopyState->m_statusFeedback->ShowStatusString(finalString);
      mCopyState->m_statusFeedback->ShowProgress(
          mCopyState->m_curCopyIndex * 100 / mCopyState->m_totalMsgCount);
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::SetFlagsOnDefaultMailboxes(uint32_t flags) {
  if (flags & nsMsgFolderFlags::Inbox)
    setSubfolderFlag(u"Inbox"_ns, nsMsgFolderFlags::Inbox);

  if (flags & nsMsgFolderFlags::SentMail)
    setSubfolderFlag(u"Sent"_ns, nsMsgFolderFlags::SentMail);

  if (flags & nsMsgFolderFlags::Drafts)
    setSubfolderFlag(u"Drafts"_ns, nsMsgFolderFlags::Drafts);

  if (flags & nsMsgFolderFlags::Templates)
    setSubfolderFlag(u"Templates"_ns, nsMsgFolderFlags::Templates);

  if (flags & nsMsgFolderFlags::Trash)
    setSubfolderFlag(u"Trash"_ns, nsMsgFolderFlags::Trash);

  if (flags & nsMsgFolderFlags::Queue)
    setSubfolderFlag(u"Unsent Messages"_ns, nsMsgFolderFlags::Queue);

  if (flags & nsMsgFolderFlags::Junk)
    setSubfolderFlag(u"Junk"_ns, nsMsgFolderFlags::Junk);

  if (flags & nsMsgFolderFlags::Archive)
    setSubfolderFlag(u"Archives"_ns, nsMsgFolderFlags::Archive);

  return NS_OK;
}

nsresult nsMsgLocalMailFolder::setSubfolderFlag(const nsAString& aFolderName,
                                                uint32_t flags) {
  // FindSubFolder() expects the folder name to be escaped
  // see bug #192043
  nsAutoCString escapedFolderName;
  nsresult rv = NS_MsgEscapeEncodeURLPath(aFolderName, escapedFolderName);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgFolder> msgFolder;
  rv = FindSubFolder(escapedFolderName, getter_AddRefs(msgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // we only want to do this if the folder *really* exists,
  // so check if it has a parent. Otherwise, we'll create the
  // .msf file when we don't want to.
  nsCOMPtr<nsIMsgFolder> parent;
  msgFolder->GetParent(getter_AddRefs(parent));
  if (!parent) return NS_ERROR_FAILURE;

  rv = msgFolder->SetFlag(flags);
  NS_ENSURE_SUCCESS(rv, rv);
  return msgFolder->SetPrettyName(aFolderName);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::GetCheckForNewMessagesAfterParsing(
    bool* aCheckForNewMessagesAfterParsing) {
  NS_ENSURE_ARG_POINTER(aCheckForNewMessagesAfterParsing);
  *aCheckForNewMessagesAfterParsing = mCheckForNewMessagesAfterParsing;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::SetCheckForNewMessagesAfterParsing(
    bool aCheckForNewMessagesAfterParsing) {
  mCheckForNewMessagesAfterParsing = aCheckForNewMessagesAfterParsing;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::NotifyCompactCompleted() {
  mExpungedBytes = 0;
  m_newMsgs.Clear();  // if compacted, m_newMsgs probably aren't valid.
  // if compacted, processing flags probably also aren't valid.
  ClearProcessingFlags();
  (void)RefreshSizeOnDisk();
  (void)CloseDBIfFolderNotOpen(false);
  NotifyFolderEvent(kCompactCompleted);
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::Shutdown(bool shutdownChildren) {
  mInitialized = false;
  return nsMsgDBFolder::Shutdown(shutdownChildren);
}

NS_IMETHODIMP
nsMsgLocalMailFolder::OnMessageClassified(const nsACString& aMsgURI,
                                          nsMsgJunkStatus aClassification,
                                          uint32_t aJunkPercent)

{
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISpamSettings> spamSettings;
  rv = server->GetSpamSettings(getter_AddRefs(spamSettings));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString spamFolderURI;
  rv = spamSettings->GetSpamFolderURI(spamFolderURI);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!aMsgURI.IsEmpty())  // not end of batch
  {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = GetMsgDBHdrFromURI(aMsgURI, getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsMsgKey msgKey;
    rv = msgHdr->GetMessageKey(&msgKey);
    NS_ENSURE_SUCCESS(rv, rv);

    // check if this message needs junk classification
    uint32_t processingFlags;
    GetProcessingFlags(msgKey, &processingFlags);

    if (processingFlags & nsMsgProcessingFlags::ClassifyJunk) {
      nsMsgDBFolder::OnMessageClassified(aMsgURI, aClassification,
                                         aJunkPercent);

      if (aClassification == nsIJunkMailPlugin::JUNK) {
        bool willMoveMessage = false;

        // don't do the move when we are opening up
        // the junk mail folder or the trash folder
        // or when manually classifying messages in those folders
        if (!(mFlags & nsMsgFolderFlags::Junk ||
              mFlags & nsMsgFolderFlags::Trash)) {
          bool moveOnSpam = false;
          rv = spamSettings->GetMoveOnSpam(&moveOnSpam);
          NS_ENSURE_SUCCESS(rv, rv);
          if (moveOnSpam) {
            nsCOMPtr<nsIMsgFolder> folder;
            rv = FindFolder(spamFolderURI, getter_AddRefs(folder));
            NS_ENSURE_SUCCESS(rv, rv);
            if (folder) {
              rv = folder->SetFlag(nsMsgFolderFlags::Junk);
              NS_ENSURE_SUCCESS(rv, rv);
              mSpamKeysToMove.AppendElement(msgKey);
              willMoveMessage = true;
            } else {
              // XXX TODO
              // JUNK MAIL RELATED
              // the listener should do
              // rv = folder->SetFlag(nsMsgFolderFlags::Junk);
              // NS_ENSURE_SUCCESS(rv,rv);
              // mSpamKeysToMove.AppendElement(msgKey);
              // willMoveMessage = true;
              rv =
                  GetOrCreateJunkFolder(spamFolderURI, nullptr /* aListener */);
              NS_ASSERTION(NS_SUCCEEDED(rv), "GetOrCreateJunkFolder failed");
            }
          }
        }
        rv = spamSettings->LogJunkHit(msgHdr, willMoveMessage);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  }

  else  // end of batch
  {
    // Parent will apply post bayes filters.
    nsMsgDBFolder::OnMessageClassified(EmptyCString(),
                                       nsIJunkMailPlugin::UNCLASSIFIED, 0);
    nsTArray<RefPtr<nsIMsgDBHdr>> messages;
    if (!mSpamKeysToMove.IsEmpty()) {
      nsCOMPtr<nsIMsgFolder> folder;
      if (!spamFolderURI.IsEmpty()) {
        rv = FindFolder(spamFolderURI, getter_AddRefs(folder));
        NS_ENSURE_SUCCESS(rv, rv);
      }
      for (uint32_t keyIndex = 0; keyIndex < mSpamKeysToMove.Length();
           keyIndex++) {
        // If an upstream filter moved this message, don't move it here.
        nsMsgKey msgKey = mSpamKeysToMove.ElementAt(keyIndex);
        nsMsgProcessingFlagType processingFlags;
        GetProcessingFlags(msgKey, &processingFlags);
        if (folder && !(processingFlags & nsMsgProcessingFlags::FilterToMove)) {
          nsCOMPtr<nsIMsgDBHdr> mailHdr;
          rv = GetMessageHeader(msgKey, getter_AddRefs(mailHdr));
          if (NS_SUCCEEDED(rv) && mailHdr) messages.AppendElement(mailHdr);
        } else {
          // We don't need the processing flag any more.
          AndProcessingFlags(msgKey, ~nsMsgProcessingFlags::FilterToMove);
        }
      }

      if (folder) {
        nsCOMPtr<nsIMsgCopyService> copySvc =
            do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
        NS_ENSURE_SUCCESS(rv, rv);

        rv = copySvc->CopyMessages(
            this, messages, folder, true,
            /*nsIMsgCopyServiceListener* listener*/ nullptr, nullptr,
            false /*allowUndo*/);
        NS_ASSERTION(NS_SUCCEEDED(rv), "CopyMessages failed");
        if (NS_FAILED(rv)) {
          nsAutoCString logMsg(
              "failed to copy junk messages to junk folder rv = ");
          logMsg.AppendInt(static_cast<uint32_t>(rv), 16);
          spamSettings->LogJunkString(logMsg.get());
        }
      }
    }
    int32_t numNewMessages;
    GetNumNewMessages(false, &numNewMessages);
    SetNumNewMessages(numNewMessages - messages.Length());
    mSpamKeysToMove.Clear();
    // check if this is the inbox first...
    if (mFlags & nsMsgFolderFlags::Inbox) PerformBiffNotifications();
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::GetFolderScanState(nsLocalFolderScanState* aState) {
  NS_ENSURE_ARG_POINTER(aState);

  nsresult rv = GetMsgStore(getter_AddRefs(aState->m_msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  aState->m_uidl = nullptr;
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::GetUidlFromFolder(nsLocalFolderScanState* aState,
                                        nsIMsgDBHdr* aMsgDBHdr) {
  bool more = false;
  uint32_t size = 0, len = 0;
  const char* accountKey = nullptr;
  nsresult rv =
      GetMsgInputStream(aMsgDBHdr, getter_AddRefs(aState->m_inputStream));
  NS_ENSURE_SUCCESS(rv, rv);

  mozilla::UniquePtr<nsLineBuffer<char>> lineBuffer(new nsLineBuffer<char>);

  aState->m_uidl = nullptr;

  aMsgDBHdr->GetMessageSize(&len);
  while (len > 0) {
    rv = NS_ReadLine(aState->m_inputStream.get(), lineBuffer.get(),
                     aState->m_header, &more);
    if (NS_SUCCEEDED(rv)) {
      size = aState->m_header.Length();
      if (!size) break;
      // this isn't quite right - need to account for line endings
      len -= size;
      // account key header will always be before X_UIDL header
      if (!accountKey) {
        accountKey =
            strstr(aState->m_header.get(), HEADER_X_MOZILLA_ACCOUNT_KEY);
        if (accountKey) {
          accountKey += strlen(HEADER_X_MOZILLA_ACCOUNT_KEY) + 2;
          aState->m_accountKey = accountKey;
        }
      } else {
        aState->m_uidl = strstr(aState->m_header.get(), X_UIDL);
        if (aState->m_uidl) {
          aState->m_uidl += X_UIDL_LEN + 2;  // skip UIDL: header
          break;
        }
      }
    }
  }
  aState->m_inputStream->Close();
  aState->m_inputStream = nullptr;
  return rv;
}

/**
 * Adds a message to the end of the folder, parsing it as it goes, and
 * applying filters, if applicable.
 */
NS_IMETHODIMP
nsMsgLocalMailFolder::AddMessage(const char* aMessage, nsIMsgDBHdr** aHdr) {
  NS_ENSURE_ARG_POINTER(aHdr);
  AutoTArray<nsCString, 1> aMessages = {nsDependentCString(aMessage)};
  nsTArray<RefPtr<nsIMsgDBHdr>> hdrs;
  nsresult rv = AddMessageBatch(aMessages, hdrs);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ADDREF(*aHdr = hdrs[0]);
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::AddMessageBatch(
    const nsTArray<nsCString>& aMessages,
    nsTArray<RefPtr<nsIMsgDBHdr>>& aHdrArray) {
  aHdrArray.ClearAndRetainStorage();
  aHdrArray.SetCapacity(aMessages.Length());

  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsCOMPtr<nsIOutputStream> outFileStream;
  nsCOMPtr<nsIMsgDBHdr> newHdr;

  rv = server->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isLocked;

  GetLocked(&isLocked);
  if (isLocked) return NS_MSG_FOLDER_BUSY;

  AcquireSemaphore(static_cast<nsIMsgLocalMailFolder*>(this));

  if (NS_SUCCEEDED(rv)) {
    NS_ENSURE_SUCCESS(rv, rv);
    for (uint32_t i = 0; i < aMessages.Length(); i++) {
      RefPtr<nsParseNewMailState> newMailParser = new nsParseNewMailState;
      NS_ENSURE_TRUE(newMailParser, NS_ERROR_OUT_OF_MEMORY);
      if (!mGettingNewMessages) newMailParser->DisableFilters();
      rv = msgStore->GetNewMsgOutputStream(this, getter_AddRefs(newHdr),
                                           getter_AddRefs(outFileStream));
      NS_ENSURE_SUCCESS(rv, rv);

      // Get a msgWindow. Proceed without one, but filter actions to imap
      // folders will silently fail if not signed in and no window for a prompt.
      nsCOMPtr<nsIMsgWindow> msgWindow;
      nsCOMPtr<nsIMsgMailSession> mailSession =
          do_GetService("@mozilla.org/messenger/services/session;1", &rv);
      if (NS_SUCCEEDED(rv))
        mailSession->GetTopmostMsgWindow(getter_AddRefs(msgWindow));

      rv = newMailParser->Init(rootFolder, this, msgWindow, newHdr,
                               outFileStream);
      NS_ENSURE_SUCCESS(rv, rv);
      newMailParser->SetState(nsIMsgParseMailMsgState::ParseHeadersState);

      uint32_t bytesWritten;
      uint32_t messageLen = aMessages[i].Length();
      outFileStream->Write(aMessages[i].get(), messageLen, &bytesWritten);
      rv = newMailParser->BufferInput(aMessages[i].get(), messageLen);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = newMailParser->Flush();
      NS_ENSURE_SUCCESS(rv, rv);

      msgStore->FinishNewMessage(outFileStream, newHdr);
      outFileStream = nullptr;
      newMailParser->OnStopRequest(nullptr, NS_OK);
      newMailParser->EndMsgDownload();
      aHdrArray.AppendElement(newHdr);
    }
  }
  ReleaseSemaphore(static_cast<nsIMsgLocalMailFolder*>(this));
  return rv;
}

NS_IMETHODIMP
nsMsgLocalMailFolder::WarnIfLocalFileTooBig(nsIMsgWindow* aWindow,
                                            int64_t aSpaceRequested,
                                            bool* aTooBig) {
  NS_ENSURE_ARG_POINTER(aTooBig);

  *aTooBig = true;
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  bool spaceAvailable = false;
  // check if we have a reasonable amount of space left
  rv = msgStore->HasSpaceAvailable(this, aSpaceRequested, &spaceAvailable);
  if (NS_SUCCEEDED(rv) && spaceAvailable) {
    *aTooBig = false;
  } else if (rv == NS_ERROR_FILE_TOO_BIG) {
    ThrowAlertMsg("mailboxTooLarge", aWindow);
  } else {
    ThrowAlertMsg("outOfDiskSpace", aWindow);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::FetchMsgPreviewText(
    nsTArray<nsMsgKey> const& aKeysToFetch, nsIUrlListener* aUrlListener,
    bool* aAsyncResults) {
  NS_ENSURE_ARG_POINTER(aAsyncResults);

  *aAsyncResults = false;
  nsCOMPtr<nsIInputStream> inputStream;

  for (uint32_t i = 0; i < aKeysToFetch.Length(); i++) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    nsCString prevBody;
    nsresult rv = GetMessageHeader(aKeysToFetch[i], getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);
    // ignore messages that already have a preview body.
    msgHdr->GetStringProperty("preview", prevBody);
    if (!prevBody.IsEmpty()) continue;

    rv = GetMsgInputStream(msgHdr, getter_AddRefs(inputStream));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetMsgPreviewTextFromStream(msgHdr, inputStream);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgLocalMailFolder::AddKeywordsToMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aKeywords) {
  nsresult rv = nsMsgDBFolder::AddKeywordsToMessages(aMessages, aKeywords);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->ChangeKeywords(aMessages, aKeywords, true /* add */);
}

NS_IMETHODIMP nsMsgLocalMailFolder::RemoveKeywordsFromMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& aMessages,
    const nsACString& aKeywords) {
  nsresult rv = nsMsgDBFolder::RemoveKeywordsFromMessages(aMessages, aKeywords);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgStore->ChangeKeywords(aMessages, aKeywords, false /* remove */);
}

NS_IMETHODIMP nsMsgLocalMailFolder::UpdateNewMsgHdr(nsIMsgDBHdr* aOldHdr,
                                                    nsIMsgDBHdr* aNewHdr) {
  NS_ENSURE_ARG_POINTER(aOldHdr);
  NS_ENSURE_ARG_POINTER(aNewHdr);
  // Preserve any properties set on the message.
  CopyPropertiesToMsgHdr(aNewHdr, aOldHdr, true);

  // Preserve keywords manually, since they are set as don't preserve.
  nsCString keywordString;
  aOldHdr->GetStringProperty("keywords", keywordString);
  aNewHdr->SetStringProperty("keywords", keywordString);

  // If the junk score was set by the plugin, remove junkscore to force a new
  // junk analysis, this time using the body.
  nsCString junkScoreOrigin;
  aOldHdr->GetStringProperty("junkscoreorigin", junkScoreOrigin);
  if (junkScoreOrigin.EqualsLiteral("plugin"))
    aNewHdr->SetStringProperty("junkscore", ""_ns);

  return NS_OK;
}
