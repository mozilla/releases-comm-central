/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgCopyService.h"
#include "nsCOMArray.h"
#include "nspr.h"
#include "nsIFile.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsServiceManagerUtils.h"
#include "nsMsgUtils.h"
#include "mozilla/Logging.h"

static mozilla::LazyLogModule gCopyServiceLog("MsgCopyService");

// ******************** nsCopySource ******************

nsCopySource::nsCopySource() : m_processed(false) {
  MOZ_COUNT_CTOR(nsCopySource);
}

nsCopySource::nsCopySource(nsIMsgFolder* srcFolder) : m_processed(false) {
  MOZ_COUNT_CTOR(nsCopySource);
  m_msgFolder = srcFolder;
}

nsCopySource::~nsCopySource() { MOZ_COUNT_DTOR(nsCopySource); }

void nsCopySource::AddMessage(nsIMsgDBHdr* aMsg) {
  m_messageArray.AppendElement(aMsg);
}

// ************ nsCopyRequest *****************
//

nsCopyRequest::nsCopyRequest()
    : m_requestType(nsCopyMessagesType),
      m_isMoveOrDraftOrTemplate(false),
      m_allowUndo(false),
      m_processed(false),
      m_newMsgFlags(0) {
  MOZ_COUNT_CTOR(nsCopyRequest);
}

nsCopyRequest::~nsCopyRequest() {
  MOZ_COUNT_DTOR(nsCopyRequest);

  int32_t j = m_copySourceArray.Length();
  while (j-- > 0) delete m_copySourceArray.ElementAt(j);
}

nsresult nsCopyRequest::Init(nsCopyRequestType type, nsISupports* aSupport,
                             nsIMsgFolder* dstFolder, bool bVal,
                             uint32_t newMsgFlags,
                             const nsACString& newMsgKeywords,
                             nsIMsgCopyServiceListener* listener,
                             nsIMsgWindow* msgWindow, bool allowUndo) {
  nsresult rv = NS_OK;
  m_requestType = type;
  m_srcSupport = aSupport;
  m_dstFolder = dstFolder;
  m_isMoveOrDraftOrTemplate = bVal;
  m_allowUndo = allowUndo;
  m_newMsgFlags = newMsgFlags;
  m_newMsgKeywords = newMsgKeywords;

  if (listener) m_listener = listener;
  if (msgWindow) {
    m_msgWindow = msgWindow;
    if (m_allowUndo) msgWindow->GetTransactionManager(getter_AddRefs(m_txnMgr));
  }
  if (type == nsCopyFoldersType) {
    // To support multiple copy folder operations to the same destination, we
    // need to save the leaf name of the src file spec so that FindRequest() is
    // able to find the right request when copy finishes.
    nsCOMPtr<nsIMsgFolder> srcFolder = do_QueryInterface(aSupport, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsString folderName;
    rv = srcFolder->GetName(folderName);
    NS_ENSURE_SUCCESS(rv, rv);
    m_dstFolderName = folderName;
  }

  return rv;
}

nsCopySource* nsCopyRequest::AddNewCopySource(nsIMsgFolder* srcFolder) {
  nsCopySource* newSrc = new nsCopySource(srcFolder);
  if (newSrc) {
    m_copySourceArray.AppendElement(newSrc);
    if (srcFolder == m_dstFolder) newSrc->m_processed = true;
  }
  return newSrc;
}

// ************* nsMsgCopyService ****************
//

nsMsgCopyService::nsMsgCopyService() {}

nsMsgCopyService::~nsMsgCopyService() {
  int32_t i = m_copyRequests.Length();

  while (i-- > 0) ClearRequest(m_copyRequests.ElementAt(i), NS_ERROR_FAILURE);
}

void nsMsgCopyService::LogCopyCompletion(nsISupports* aSrc,
                                         nsIMsgFolder* aDest) {
  nsCString srcFolderUri, destFolderUri;
  nsCOMPtr<nsIMsgFolder> srcFolder(do_QueryInterface(aSrc));
  if (srcFolder) srcFolder->GetURI(srcFolderUri);
  aDest->GetURI(destFolderUri);
  MOZ_LOG(gCopyServiceLog, mozilla::LogLevel::Info,
          ("NotifyCompletion - src %s dest %s\n", srcFolderUri.get(),
           destFolderUri.get()));
}

void nsMsgCopyService::LogCopyRequest(const char* logMsg,
                                      nsCopyRequest* aRequest) {
  nsCString srcFolderUri, destFolderUri;
  nsCOMPtr<nsIMsgFolder> srcFolder(do_QueryInterface(aRequest->m_srcSupport));
  if (srcFolder) srcFolder->GetURI(srcFolderUri);
  aRequest->m_dstFolder->GetURI(destFolderUri);
  uint32_t numMsgs = 0;
  if (aRequest->m_requestType == nsCopyMessagesType &&
      aRequest->m_copySourceArray.Length() > 0) {
    numMsgs = aRequest->m_copySourceArray[0]->m_messageArray.Length();
  }
  MOZ_LOG(gCopyServiceLog, mozilla::LogLevel::Info,
          ("request %p %s - src %s dest %s numItems %d type=%d", aRequest,
           logMsg, srcFolderUri.get(), destFolderUri.get(), numMsgs,
           aRequest->m_requestType));
}

nsresult nsMsgCopyService::ClearRequest(nsCopyRequest* aRequest, nsresult rv) {
  if (aRequest) {
    if (MOZ_LOG_TEST(gCopyServiceLog, mozilla::LogLevel::Info))
      LogCopyRequest(
          NS_SUCCEEDED(rv) ? "Clearing OK request" : "Clearing failed request",
          aRequest);

    if (NS_SUCCEEDED(rv) && aRequest->m_requestType == nsCopyFoldersType) {
      // Send folder copy/move notifications to nsIMsgFolderListeners.
      // BAD SMELL ALERT: Seems odd that this is the only place the folder
      // notification is invoked from the copyService.
      // For message copy/move operations, the folder code handles the
      // notification (to take one example).
      // This suggests lack of clarity of responsibility.
      nsCOMPtr<nsIMsgFolderNotificationService> notifier(
          do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
      if (notifier) {
        for (nsCopySource* copySource : aRequest->m_copySourceArray) {
          notifier->NotifyFolderMoveCopyCompleted(
              aRequest->m_isMoveOrDraftOrTemplate, copySource->m_msgFolder,
              aRequest->m_dstFolder);
        }
      }
    }

    // undo stuff
    if (aRequest->m_allowUndo && aRequest->m_copySourceArray.Length() > 1 &&
        aRequest->m_txnMgr)
      aRequest->m_txnMgr->EndBatch(false);

    m_copyRequests.RemoveElement(aRequest);
    if (aRequest->m_listener) aRequest->m_listener->OnStopCopy(rv);
    delete aRequest;
  }

  return rv;
}

nsresult nsMsgCopyService::QueueRequest(nsCopyRequest* aRequest,
                                        bool* aCopyImmediately) {
  NS_ENSURE_ARG_POINTER(aRequest);
  NS_ENSURE_ARG_POINTER(aCopyImmediately);
  *aCopyImmediately = true;
  nsCopyRequest* copyRequest;

  // Check through previous requests to see if the copy can start immediately.
  uint32_t cnt = m_copyRequests.Length();

  for (uint32_t i = 0; i < cnt; i++) {
    copyRequest = m_copyRequests.ElementAt(i);
    if (aRequest->m_requestType == nsCopyFoldersType) {
      // For copy folder, see if both destination folder (root)
      // (ie, Local Folder) and folder name (ie, abc) are the same.
      if (copyRequest->m_dstFolderName == aRequest->m_dstFolderName &&
          SameCOMIdentity(copyRequest->m_dstFolder, aRequest->m_dstFolder)) {
        *aCopyImmediately = false;
        break;
      }
    } else if (SameCOMIdentity(copyRequest->m_dstFolder,
                               aRequest->m_dstFolder)) {
      // If dst are same and we already have a request, we cannot copy
      // immediately.
      *aCopyImmediately = false;
      break;
    }
  }

  // Queue it.
  m_copyRequests.AppendElement(aRequest);
  return NS_OK;
}

nsresult nsMsgCopyService::DoCopy(nsCopyRequest* aRequest) {
  NS_ENSURE_ARG(aRequest);
  bool copyImmediately;
  QueueRequest(aRequest, &copyImmediately);
  if (MOZ_LOG_TEST(gCopyServiceLog, mozilla::LogLevel::Info))
    LogCopyRequest(copyImmediately ? "DoCopy" : "QueueRequest", aRequest);

  // if no active request for this dest folder then we can copy immediately
  if (copyImmediately) return DoNextCopy();

  return NS_OK;
}

nsresult nsMsgCopyService::DoNextCopy() {
  nsresult rv = NS_OK;
  nsCopyRequest* copyRequest = nullptr;
  nsCopySource* copySource = nullptr;
  uint32_t i, j, scnt;

  uint32_t cnt = m_copyRequests.Length();
  if (cnt > 0) {
    nsCOMArray<nsIMsgFolder> activeTargets;

    // ** jt -- always FIFO
    for (i = 0; i < cnt; i++) {
      copyRequest = m_copyRequests.ElementAt(i);
      copySource = nullptr;
      scnt = copyRequest->m_copySourceArray.Length();
      if (!copyRequest->m_processed) {
        // if the target folder of this request already has an active
        // copy request, skip this request for now.
        if (activeTargets.ContainsObject(copyRequest->m_dstFolder)) {
          copyRequest = nullptr;
          continue;
        }
        if (scnt <= 0) goto found;  // must be CopyFileMessage
        for (j = 0; j < scnt; j++) {
          copySource = copyRequest->m_copySourceArray.ElementAt(j);
          if (!copySource->m_processed) goto found;
        }
        if (j >= scnt)  // all processed set the value
          copyRequest->m_processed = true;
      }
      if (copyRequest->m_processed) {
        // Keep track of folders actively getting copied to.
        activeTargets.AppendObject(copyRequest->m_dstFolder);
      }
    }
  found:
    if (copyRequest && !copyRequest->m_processed) {
      if (copyRequest->m_listener) copyRequest->m_listener->OnStartCopy();
      if (copyRequest->m_requestType == nsCopyMessagesType && copySource) {
        copySource->m_processed = true;
        rv = copyRequest->m_dstFolder->CopyMessages(
            copySource->m_msgFolder, copySource->m_messageArray,
            copyRequest->m_isMoveOrDraftOrTemplate, copyRequest->m_msgWindow,
            copyRequest->m_listener, false,
            copyRequest->m_allowUndo);  // isFolder operation false

      } else if (copyRequest->m_requestType == nsCopyFoldersType) {
        NS_ENSURE_STATE(copySource);
        copySource->m_processed = true;

        nsCOMPtr<nsIMsgFolder> dstFolder = copyRequest->m_dstFolder;
        nsCOMPtr<nsIMsgFolder> srcFolder = copySource->m_msgFolder;

        // If folder transfer is not within the same server and if a folder
        // move was requested, set the request move flag false to avoid
        // removing the list of marked deleted messages in the source folder.
        bool isMove = copyRequest->m_isMoveOrDraftOrTemplate;
        if (copyRequest->m_isMoveOrDraftOrTemplate) {
          bool sameServer;
          IsOnSameServer(dstFolder, srcFolder, &sameServer);
          if (!sameServer) copyRequest->m_isMoveOrDraftOrTemplate = false;
        }

        // NOTE: The folder invokes NotifyCompletion() when the operation is
        // complete. Some folders (localfolder!) invoke it before CopyFolder()
        // even returns. This will likely delete the request object, so
        // you have to assume that copyRequest is invalid when CopyFolder()
        // returns.
        rv = dstFolder->CopyFolder(srcFolder, isMove, copyRequest->m_msgWindow,
                                   copyRequest->m_listener);
        // If CopyFolder() fails (e.g. destination folder already exists),
        // it won't send a completion notification (NotifyCompletion()).
        // So copyRequest will still exist, and we need to ditch it.
        if (NS_FAILED(rv)) {
          ClearRequest(copyRequest, rv);
        }
      } else if (copyRequest->m_requestType == nsCopyFileMessageType) {
        nsCOMPtr<nsIFile> aFile(
            do_QueryInterface(copyRequest->m_srcSupport, &rv));
        if (NS_SUCCEEDED(rv)) {
          // ** in case of saving draft/template; the very first
          // time we may not have the original message to replace
          // with; if we do we shall have an instance of copySource
          nsCOMPtr<nsIMsgDBHdr> aMessage;
          if (copySource) {
            aMessage = copySource->m_messageArray[0];
            copySource->m_processed = true;
          }
          copyRequest->m_processed = true;
          rv = copyRequest->m_dstFolder->CopyFileMessage(
              aFile, aMessage, copyRequest->m_isMoveOrDraftOrTemplate,
              copyRequest->m_newMsgFlags, copyRequest->m_newMsgKeywords,
              copyRequest->m_msgWindow, copyRequest->m_listener);
        }
      }
    }
  }
  return rv;
}

/**
 * Find a request in m_copyRequests which matches the passed in source
 * and destination folders.
 *
 * @param aSupport the iSupports of the source folder.
 * @param dstFolder the destination folder of the copy request.
 */
nsCopyRequest* nsMsgCopyService::FindRequest(nsISupports* aSupport,
                                             nsIMsgFolder* dstFolder) {
  nsCopyRequest* matchingRequest = nullptr;
  for (auto copyRequest : m_copyRequests) {
    if (!SameCOMIdentity(copyRequest->m_srcSupport, aSupport)) {
      continue;
    }
    if (SameCOMIdentity(copyRequest->m_dstFolder.get(), dstFolder)) {
      matchingRequest = copyRequest;
      break;
    }

    // When copying folders the notification of the message copy serves as a
    // proxy for the folder copy. Check for that here.
    if (copyRequest->m_requestType == nsCopyFoldersType) {
      // See if the parent of the copied folder is the same as the one when the
      // request was made. Note if the destination folder is already a server
      // folder then no need to get parent.
      bool isServer = false;
      dstFolder->GetIsServer(&isServer);
      if (!isServer) {
        nsCOMPtr<nsIMsgFolder> parentMsgFolder;
        nsresult rv = dstFolder->GetParent(getter_AddRefs(parentMsgFolder));
        if (NS_FAILED(rv) || !parentMsgFolder ||
            (copyRequest->m_dstFolder.get() != parentMsgFolder)) {
          continue;
        }
      }
      matchingRequest = copyRequest;
      break;
    }
  }
  return matchingRequest;
}

NS_IMPL_ISUPPORTS(nsMsgCopyService, nsIMsgCopyService)

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP nsMsgCopyService::CopyMessages(
    nsIMsgFolder* srcFolder, /* UI src folder */
    nsTArray<RefPtr<nsIMsgDBHdr>> const& messages, nsIMsgFolder* dstFolder,
    bool isMove, nsIMsgCopyServiceListener* listener, nsIMsgWindow* window,
    bool allowUndo) {
  NS_ENSURE_ARG_POINTER(srcFolder);
  NS_ENSURE_ARG_POINTER(dstFolder);

  MOZ_LOG(gCopyServiceLog, mozilla::LogLevel::Debug, ("CopyMessages"));

  if (srcFolder == dstFolder) {
    NS_ERROR("src and dest folders for msg copy can't be the same");
    return NS_ERROR_FAILURE;
  }
  nsCopyRequest* copyRequest;
  nsCopySource* copySource = nullptr;
  nsIMsgDBHdr* msg;
  nsCOMPtr<nsIMsgFolder> curFolder;
  nsCOMPtr<nsISupports> aSupport;
  int cnt;
  nsresult rv;

  // XXX TODO
  // JUNK MAIL RELATED
  // make sure dest folder exists
  // and has proper flags, before we start copying?

  // bail early if nothing to do
  if (messages.IsEmpty()) {
    if (listener) {
      listener->OnStartCopy();
      listener->OnStopCopy(NS_OK);
    }
    return NS_OK;
  }

  copyRequest = new nsCopyRequest();
  if (!copyRequest) return NS_ERROR_OUT_OF_MEMORY;

  nsTArray<RefPtr<nsIMsgDBHdr>> unprocessed = messages.Clone();
  aSupport = srcFolder;

  rv = copyRequest->Init(nsCopyMessagesType, aSupport, dstFolder, isMove,
                         0 /* new msg flags, not used */, EmptyCString(),
                         listener, window, allowUndo);
  if (NS_FAILED(rv)) goto done;

  if (MOZ_LOG_TEST(gCopyServiceLog, mozilla::LogLevel::Info))
    LogCopyRequest("CopyMessages request", copyRequest);

  // Build up multiple nsCopySource objects. Each holds a single source folder
  // and all the messages in the folder that are to be copied.
  cnt = unprocessed.Length();
  while (cnt-- > 0) {
    msg = unprocessed[cnt];
    rv = msg->GetFolder(getter_AddRefs(curFolder));

    if (NS_FAILED(rv)) goto done;
    if (!copySource) {
      // Begin a folder grouping.
      copySource = copyRequest->AddNewCopySource(curFolder);
      if (!copySource) {
        rv = NS_ERROR_OUT_OF_MEMORY;
        goto done;
      }
    }

    // Stash message if in the current folder grouping.
    if (curFolder == copySource->m_msgFolder) {
      copySource->AddMessage(msg);
      unprocessed.RemoveElementAt((size_t)cnt);
    }

    if (cnt == 0) {
      // Finished a folder. Start a new pass to handle any remaining messages
      // in other folders.
      cnt = unprocessed.Length();
      if (cnt > 0) {
        // Force to create a new one and continue grouping the messages.
        copySource = nullptr;
      }
    }
  }

  // undo stuff
  if (NS_SUCCEEDED(rv) && copyRequest->m_allowUndo &&
      copyRequest->m_copySourceArray.Length() > 1 && copyRequest->m_txnMgr) {
    nsCOMPtr<nsITransactionManager> txnMgr = copyRequest->m_txnMgr;
    txnMgr->BeginBatch(nullptr);
  }

done:

  if (NS_FAILED(rv))
    delete copyRequest;
  else
    rv = DoCopy(copyRequest);

  return rv;
}

NS_IMETHODIMP
nsMsgCopyService::CopyFolder(nsIMsgFolder* srcFolder, nsIMsgFolder* dstFolder,
                             bool isMove, nsIMsgCopyServiceListener* listener,
                             nsIMsgWindow* window) {
  NS_ENSURE_ARG_POINTER(srcFolder);
  NS_ENSURE_ARG_POINTER(dstFolder);
  nsCopyRequest* copyRequest;
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> curFolder;

  copyRequest = new nsCopyRequest();
  rv = copyRequest->Init(nsCopyFoldersType, srcFolder, dstFolder, isMove,
                         0 /* new msg flags, not used */, EmptyCString(),
                         listener, window, false);
  NS_ENSURE_SUCCESS(rv, rv);

  copyRequest->AddNewCopySource(srcFolder);
  return DoCopy(copyRequest);
}

NS_IMETHODIMP
nsMsgCopyService::CopyFileMessage(nsIFile* file, nsIMsgFolder* dstFolder,
                                  nsIMsgDBHdr* msgToReplace, bool isDraft,
                                  uint32_t aMsgFlags,
                                  const nsACString& aNewMsgKeywords,
                                  nsIMsgCopyServiceListener* listener,
                                  nsIMsgWindow* window) {
  nsresult rv = NS_ERROR_NULL_POINTER;
  nsCopyRequest* copyRequest;
  nsCopySource* copySource = nullptr;

  NS_ENSURE_ARG_POINTER(file);
  NS_ENSURE_ARG_POINTER(dstFolder);

  copyRequest = new nsCopyRequest();
  if (!copyRequest) return rv;

  rv = copyRequest->Init(nsCopyFileMessageType, file, dstFolder, isDraft,
                         aMsgFlags, aNewMsgKeywords, listener, window, false);
  if (NS_FAILED(rv)) goto done;

  if (msgToReplace) {
    // The actual source of the message is a file not a folder, but
    // we still need an nsCopySource to reference the old message header
    // which will be used to recover message metadata.
    copySource = copyRequest->AddNewCopySource(nullptr);
    if (!copySource) {
      rv = NS_ERROR_OUT_OF_MEMORY;
      goto done;
    }
    copySource->AddMessage(msgToReplace);
  }

done:
  if (NS_FAILED(rv)) {
    delete copyRequest;
  } else {
    rv = DoCopy(copyRequest);
  }

  return rv;
}

NS_IMETHODIMP
nsMsgCopyService::NotifyCompletion(nsISupports* aSupport,
                                   nsIMsgFolder* dstFolder, nsresult result) {
  if (MOZ_LOG_TEST(gCopyServiceLog, mozilla::LogLevel::Info))
    LogCopyCompletion(aSupport, dstFolder);
  nsCopyRequest* copyRequest = nullptr;
  uint32_t numOrigRequests = m_copyRequests.Length();
  do {
    // loop for copy requests, because if we do a cross server folder copy,
    // we'll have a copy request for the folder copy, which will in turn
    // generate a copy request for the messages in the folder, which
    // will have the same src support.
    copyRequest = FindRequest(aSupport, dstFolder);

    if (copyRequest) {
      // ClearRequest can cause a new request to get added to m_copyRequests
      // with matching source and dest folders if the copy listener starts
      // a new copy. We want to ignore any such request here, because it wasn't
      // the one that was completed. So we keep track of how many original
      // requests there were.
      if (m_copyRequests.IndexOf(copyRequest) >= numOrigRequests) break;
      // check if this copy request is done by making sure all the
      // sources have been processed.
      int32_t sourceIndex, sourceCount;
      sourceCount = copyRequest->m_copySourceArray.Length();
      for (sourceIndex = 0; sourceIndex < sourceCount;) {
        if (!(copyRequest->m_copySourceArray.ElementAt(sourceIndex))
                 ->m_processed)
          break;
        sourceIndex++;
      }
      // if all sources processed, mark the request as processed
      if (sourceIndex >= sourceCount) copyRequest->m_processed = true;
      // if this request is done, or failed, clear it.
      if (copyRequest->m_processed || NS_FAILED(result)) {
        ClearRequest(copyRequest, result);
        numOrigRequests--;
      } else
        break;
    } else
      break;
  } while (copyRequest);

  return DoNextCopy();
}
