/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "netCore.h"
#include "nsNetUtil.h"
#include "nsImapOfflineSync.h"
#include "nsImapMailFolder.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgAccountManager.h"
#include "nsINntpIncomingServer.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIMsgCopyService.h"
#include "nsImapProtocol.h"
#include "nsMsgUtils.h"
#include "nsIAutoSyncManager.h"
#include "mozilla/Unused.h"

NS_IMPL_ISUPPORTS(nsImapOfflineSync, nsIUrlListener, nsIMsgCopyServiceListener,
                  nsIDBChangeListener, nsIImapOfflineSync)

nsImapOfflineSync::nsImapOfflineSync() {
  m_singleFolderToUpdate = nullptr;
  m_window = nullptr;
  mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kFlagsChanged;
  m_mailboxupdatesStarted = false;
  m_mailboxupdatesFinished = false;
  m_createdOfflineFolders = false;
  m_pseudoOffline = false;
  m_KeyIndex = 0;
  mCurrentUIDValidity = nsMsgKey_None;
  m_listener = nullptr;
}

NS_IMETHODIMP
nsImapOfflineSync::Init(nsIMsgWindow* window, nsIUrlListener* listener,
                        nsIMsgFolder* singleFolderOnly, bool isPseudoOffline) {
  m_window = window;
  m_listener = listener;
  m_singleFolderToUpdate = singleFolderOnly;
  m_pseudoOffline = isPseudoOffline;

  // not the perfect place for this, but I think it will work.
  if (m_window) m_window->SetStopped(false);

  return NS_OK;
}

nsImapOfflineSync::~nsImapOfflineSync() {}

void nsImapOfflineSync::SetWindow(nsIMsgWindow* window) { m_window = window; }

NS_IMETHODIMP nsImapOfflineSync::OnStartRunningUrl(nsIURI* url) {
  return NS_OK;
}

NS_IMETHODIMP
nsImapOfflineSync::OnStopRunningUrl(nsIURI* url, nsresult exitCode) {
  nsresult rv = exitCode;

  // where do we make sure this gets cleared when we start running urls?
  bool stopped = false;
  if (m_window) m_window->GetStopped(&stopped);

  if (m_curTempFile) {
    m_curTempFile->Remove(false);
    m_curTempFile = nullptr;
  }
  // NS_BINDING_ABORTED is used for the user pressing stop, which
  // should cause us to abort the offline process. Other errors
  // should allow us to continue.
  if (stopped) {
    if (m_listener) m_listener->OnStopRunningUrl(url, NS_BINDING_ABORTED);
    return NS_OK;
  }
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(url);

  if (imapUrl)
    nsImapProtocol::LogImapUrl(NS_SUCCEEDED(rv) ? "offline imap url succeeded "
                                                : "offline imap url failed ",
                               imapUrl);

  // If we succeeded, or it was an imap move/copy that timed out, clear the
  // operation.
  bool moveCopy =
      mCurrentPlaybackOpType == nsIMsgOfflineImapOperation::kMsgCopy ||
      mCurrentPlaybackOpType == nsIMsgOfflineImapOperation::kMsgMoved;
  if (NS_SUCCEEDED(exitCode) || exitCode == NS_MSG_ERROR_IMAP_COMMAND_FAILED ||
      (moveCopy && exitCode == NS_ERROR_NET_TIMEOUT)) {
    ClearCurrentOps();
    rv = ProcessNextOperation();
  }
  // else if it's a non-stop error, and we're doing multiple folders,
  // go to the next folder.
  else if (!m_singleFolderToUpdate) {
    if (AdvanceToNextFolder())
      rv = ProcessNextOperation();
    else if (m_listener)
      m_listener->OnStopRunningUrl(url, rv);
  }

  return rv;
}

/**
 * Leaves m_currentServer at the next imap or local mail "server" that
 * might have offline events to playback, and m_folderQueue holding
 * a (reversed) list of all the folders to consider for that server.
 * If no more servers, m_currentServer will be left at nullptr and the
 * function returns false.
 */
bool nsImapOfflineSync::AdvanceToNextServer() {
  nsresult rv = NS_OK;

  if (m_allServers.IsEmpty()) {
    NS_ASSERTION(!m_currentServer, "this shouldn't be set");
    m_currentServer = nullptr;
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
    NS_ASSERTION(accountManager && NS_SUCCEEDED(rv),
                 "couldn't get account mgr");
    if (!accountManager || NS_FAILED(rv)) return false;

    rv = accountManager->GetAllServers(m_allServers);
    NS_ENSURE_SUCCESS(rv, false);
  }
  size_t serverIndex = 0;
  if (m_currentServer) {
    serverIndex = m_allServers.IndexOf(m_currentServer);
    if (serverIndex == m_allServers.NoIndex) {
      serverIndex = 0;
    } else {
      // Move to the next server
      ++serverIndex;
    }
  }
  m_currentServer = nullptr;
  nsCOMPtr<nsIMsgFolder> rootFolder;

  while (serverIndex < m_allServers.Length()) {
    nsCOMPtr<nsIMsgIncomingServer> server(m_allServers[serverIndex]);
    serverIndex++;

    nsCOMPtr<nsINntpIncomingServer> newsServer = do_QueryInterface(server);
    if (newsServer)  // news servers aren't involved in offline imap
      continue;

    if (server) {
      m_currentServer = server;
      server->GetRootFolder(getter_AddRefs(rootFolder));
      if (rootFolder) {
        rv = rootFolder->GetDescendants(m_folderQueue);
        if (NS_SUCCEEDED(rv)) {
          if (!m_folderQueue.IsEmpty()) {
            // We'll be popping folders off the end as they are processed.
            m_folderQueue.Reverse();
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Sets m_currentFolder to the next folder to process.
 *
 * @return  True if next folder to process was found, otherwise false.
 */
bool nsImapOfflineSync::AdvanceToNextFolder() {
  // we always start by changing flags
  mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kFlagsChanged;

  if (m_currentFolder) {
    m_currentFolder->SetMsgDatabase(nullptr);
    m_currentFolder = nullptr;
  }

  bool hasMore = false;
  if (m_currentServer) {
    hasMore = !m_folderQueue.IsEmpty();
  }
  if (!hasMore) {
    hasMore = AdvanceToNextServer();
  }
  if (hasMore) {
    m_currentFolder = m_folderQueue.PopLastElement();
  }
  ClearDB();
  return m_currentFolder;
}

void nsImapOfflineSync::AdvanceToFirstIMAPFolder() {
  m_currentServer = nullptr;
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder;
  while (!imapFolder && AdvanceToNextFolder()) {
    imapFolder = do_QueryInterface(m_currentFolder);
  }
}

void nsImapOfflineSync::ProcessFlagOperation(nsIMsgOfflineImapOperation* op) {
  nsCOMPtr<nsIMsgOfflineImapOperation> currentOp = op;
  nsTArray<nsMsgKey> matchingFlagKeys;
  uint32_t currentKeyIndex = m_KeyIndex;

  imapMessageFlagsType matchingFlags;
  currentOp->GetNewFlags(&matchingFlags);
  bool flagsMatch = true;
  do {  // loop for all messages with the same flags
    if (flagsMatch) {
      nsMsgKey curKey;
      currentOp->GetMessageKey(&curKey);
      matchingFlagKeys.AppendElement(curKey);
      currentOp->SetPlayingBack(true);
      m_currentOpsToClear.AppendObject(currentOp);
    }
    currentOp = nullptr;
    imapMessageFlagsType newFlags = kNoImapMsgFlag;
    imapMessageFlagsType flagOperation = kNoImapMsgFlag;
    if (++currentKeyIndex < m_CurrentKeys.Length())
      m_currentDB->GetOfflineOpForKey(m_CurrentKeys[currentKeyIndex], false,
                                      getter_AddRefs(currentOp));
    if (currentOp) {
      currentOp->GetFlagOperation(&flagOperation);
      currentOp->GetNewFlags(&newFlags);
    }
    flagsMatch = (flagOperation & nsIMsgOfflineImapOperation::kFlagsChanged) &&
                 (newFlags == matchingFlags);
  } while (currentOp);

  if (!matchingFlagKeys.IsEmpty()) {
    nsAutoCString uids;
    nsImapMailFolder::AllocateUidStringFromKeys(matchingFlagKeys, uids);
    uint32_t curFolderFlags;
    m_currentFolder->GetFlags(&curFolderFlags);

    if (uids.get() && (curFolderFlags & nsMsgFolderFlags::ImapBox)) {
      nsresult rv = NS_OK;
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
          do_QueryInterface(m_currentFolder);
      nsCOMPtr<nsIURI> uriToSetFlags;
      if (imapFolder) {
        rv = imapFolder->SetImapFlags(uids.get(), matchingFlags,
                                      getter_AddRefs(uriToSetFlags));
        if (NS_SUCCEEDED(rv) && uriToSetFlags) {
          nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
              do_QueryInterface(uriToSetFlags);
          if (mailnewsUrl) mailnewsUrl->RegisterListener(this);
        }
      }
    }
  } else
    ProcessNextOperation();
}

void nsImapOfflineSync::ProcessKeywordOperation(
    nsIMsgOfflineImapOperation* op) {
  nsCOMPtr<nsIMsgOfflineImapOperation> currentOp = op;
  nsTArray<nsMsgKey> matchingKeywordKeys;
  uint32_t currentKeyIndex = m_KeyIndex;

  nsAutoCString keywords;
  if (mCurrentPlaybackOpType == nsIMsgOfflineImapOperation::kAddKeywords)
    currentOp->GetKeywordsToAdd(getter_Copies(keywords));
  else
    currentOp->GetKeywordsToRemove(getter_Copies(keywords));
  bool keywordsMatch = true;
  do {  // loop for all messages with the same keywords
    if (keywordsMatch) {
      nsMsgKey curKey;
      currentOp->GetMessageKey(&curKey);
      matchingKeywordKeys.AppendElement(curKey);
      currentOp->SetPlayingBack(true);
      m_currentOpsToClear.AppendObject(currentOp);
    }
    currentOp = nullptr;
    if (++currentKeyIndex < m_CurrentKeys.Length())
      m_currentDB->GetOfflineOpForKey(m_CurrentKeys[currentKeyIndex], false,
                                      getter_AddRefs(currentOp));
    if (currentOp) {
      nsAutoCString curOpKeywords;
      nsOfflineImapOperationType operation;
      currentOp->GetOperation(&operation);
      if (mCurrentPlaybackOpType == nsIMsgOfflineImapOperation::kAddKeywords)
        currentOp->GetKeywordsToAdd(getter_Copies(curOpKeywords));
      else
        currentOp->GetKeywordsToRemove(getter_Copies(curOpKeywords));
      keywordsMatch = (operation & mCurrentPlaybackOpType) &&
                      (curOpKeywords.Equals(keywords));
    }
  } while (currentOp);

  if (!matchingKeywordKeys.IsEmpty()) {
    uint32_t curFolderFlags;
    m_currentFolder->GetFlags(&curFolderFlags);

    if (curFolderFlags & nsMsgFolderFlags::ImapBox) {
      nsresult rv = NS_OK;
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
          do_QueryInterface(m_currentFolder);
      nsCOMPtr<nsIURI> uriToStoreCustomKeywords;
      if (imapFolder) {
        rv = imapFolder->StoreCustomKeywords(
            m_window,
            (mCurrentPlaybackOpType == nsIMsgOfflineImapOperation::kAddKeywords)
                ? keywords
                : EmptyCString(),
            (mCurrentPlaybackOpType ==
             nsIMsgOfflineImapOperation::kRemoveKeywords)
                ? keywords
                : EmptyCString(),
            matchingKeywordKeys, getter_AddRefs(uriToStoreCustomKeywords));
        if (NS_SUCCEEDED(rv) && uriToStoreCustomKeywords) {
          nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
              do_QueryInterface(uriToStoreCustomKeywords);
          if (mailnewsUrl) mailnewsUrl->RegisterListener(this);
        }
      }
    }
  } else
    ProcessNextOperation();
}

// XXX This should not be void but return an error to indicate which low
// level routine failed.
void nsImapOfflineSync::ProcessAppendMsgOperation(
    nsIMsgOfflineImapOperation* currentOp, int32_t opType) {
  nsMsgKey msgKey;
  currentOp->GetMessageKey(&msgKey);
  nsCOMPtr<nsIMsgDBHdr> mailHdr;
  nsresult rv = m_currentDB->GetMsgHdrForKey(msgKey, getter_AddRefs(mailHdr));
  if (NS_FAILED(rv) || !mailHdr) {
    m_currentDB->RemoveOfflineOp(currentOp);
    ProcessNextOperation();
    return;
  }

  nsCOMPtr<nsIFile> tmpFile;

  if (NS_WARN_IF(NS_FAILED(GetSpecialDirectoryWithFileName(
          NS_OS_TEMP_DIR, "nscpmsg.txt", getter_AddRefs(tmpFile)))))
    return;

  if (NS_WARN_IF(
          NS_FAILED(tmpFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600))))
    return;

  nsCOMPtr<nsIOutputStream> outputStream;
  rv = MsgNewBufferedFileOutputStream(getter_AddRefs(outputStream), tmpFile,
                                      PR_WRONLY | PR_CREATE_FILE, 00600);
  if (NS_WARN_IF(NS_FAILED(rv) || !outputStream)) return;

  // We break out of the loop to get to the clean-up code.
  bool setPlayingBack = false;
  do {
    nsCString moveDestination;
    currentOp->GetDestinationFolderURI(moveDestination);

    nsCOMPtr<nsIMsgFolder> destFolder;
    rv = GetOrCreateFolder(moveDestination, getter_AddRefs(destFolder));
    if (NS_WARN_IF(NS_FAILED(rv))) break;

    nsCOMPtr<nsIInputStream> inStream;
    rv = destFolder->GetLocalMsgStream(mailHdr, getter_AddRefs(inStream));
    if (NS_WARN_IF((NS_FAILED(rv)))) break;

    // From this point onwards, we need to set "playing back".
    setPlayingBack = true;

    // Copy the dest folder offline store msg to the temp file.
    uint64_t bytesCopied;
    rv = SyncCopyStream(inStream, outputStream, bytesCopied,
                        FILE_IO_BUFFER_SIZE);

    // rv could have an error from Read/Write.
    nsresult rv2 = outputStream->Close();
    if (NS_FAILED(rv2)) {
      NS_WARNING("ouputStream->Close() failed");
    }
    outputStream = nullptr;  // Don't try to close it again below.

    // rv: Read/Write, rv2: Close
    if (NS_FAILED(rv) || NS_FAILED(rv2)) {
      // This Remove() will fail under Windows if the output stream
      // fails to close above.
      mozilla::Unused << NS_WARN_IF(NS_FAILED(tmpFile->Remove(false)));
      break;
    }

    nsCOMPtr<nsIFile> cloneTmpFile;
    // clone the tmp file to defeat nsIFile's stat/size caching.
    tmpFile->Clone(getter_AddRefs(cloneTmpFile));
    m_curTempFile = cloneTmpFile;
    nsCOMPtr<nsIMsgCopyService> copyService =
        do_GetService("@mozilla.org/messenger/messagecopyservice;1");

    // CopyFileMessage returns error async to this->OnStopCopy
    // if copyService is null, let's crash here and now.
    rv = copyService->CopyFileMessage(cloneTmpFile, destFolder,
                                      nullptr,  // nsIMsgDBHdr* msgToReplace
                                      true,     // isDraftOrTemplate
                                      0,        // new msg flags
                                      EmptyCString(), this, m_window);
    MOZ_ASSERT(NS_SUCCEEDED(rv),
               "CopyFileMessage() failed. Fatal. Error in call setup?");
  } while (false);

  if (setPlayingBack) {
    currentOp->SetPlayingBack(true);
    m_currentOpsToClear.AppendObject(currentOp);
    m_currentDB->DeleteHeader(mailHdr, nullptr, true, true);
  }

  // Close the output stream if it's not already closed.
  if (outputStream)
    mozilla::Unused << NS_WARN_IF(NS_FAILED(outputStream->Close()));
}

void nsImapOfflineSync::ClearCurrentOps() {
  int32_t opCount = m_currentOpsToClear.Count();
  for (int32_t i = opCount - 1; i >= 0; i--) {
    m_currentOpsToClear[i]->SetPlayingBack(false);
    m_currentOpsToClear[i]->ClearOperation(mCurrentPlaybackOpType);
    m_currentOpsToClear.RemoveObjectAt(i);
  }
}

void nsImapOfflineSync::ProcessMoveOperation(nsIMsgOfflineImapOperation* op) {
  nsTArray<nsMsgKey> matchingFlagKeys;
  uint32_t currentKeyIndex = m_KeyIndex;
  nsCString moveDestination;
  op->GetDestinationFolderURI(moveDestination);
  bool moveMatches = true;
  nsCOMPtr<nsIMsgOfflineImapOperation> currentOp = op;
  do {  // loop for all messages with the same destination
    if (moveMatches) {
      nsMsgKey curKey;
      currentOp->GetMessageKey(&curKey);
      matchingFlagKeys.AppendElement(curKey);
      currentOp->SetPlayingBack(true);
      m_currentOpsToClear.AppendObject(currentOp);
    }
    currentOp = nullptr;

    if (++currentKeyIndex < m_CurrentKeys.Length()) {
      nsCString nextDestination;
      nsresult rv = m_currentDB->GetOfflineOpForKey(
          m_CurrentKeys[currentKeyIndex], false, getter_AddRefs(currentOp));
      moveMatches = false;
      if (NS_SUCCEEDED(rv) && currentOp) {
        nsOfflineImapOperationType opType;
        currentOp->GetOperation(&opType);
        if (opType & nsIMsgOfflineImapOperation::kMsgMoved) {
          currentOp->GetDestinationFolderURI(nextDestination);
          moveMatches = moveDestination.Equals(nextDestination);
        }
      }
    }
  } while (currentOp);

  nsCOMPtr<nsIMsgFolder> destFolder;
  FindFolder(moveDestination, getter_AddRefs(destFolder));
  // if the dest folder doesn't really exist, these operations are
  // going to fail, so clear them out and move on.
  if (!destFolder) {
    NS_WARNING("trying to playing back move to non-existent folder");
    ClearCurrentOps();
    ProcessNextOperation();
    return;
  }
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
      do_QueryInterface(m_currentFolder);
  if (imapFolder && DestFolderOnSameServer(destFolder)) {
    uint32_t curFolderFlags;
    m_currentFolder->GetFlags(&curFolderFlags);
    bool curFolderOffline = curFolderFlags & nsMsgFolderFlags::Offline;
    imapFolder->ReplayOfflineMoveCopy(matchingFlagKeys, true, destFolder, this,
                                      m_window, curFolderOffline);
  } else {
    nsresult rv;
    nsTArray<RefPtr<nsIMsgDBHdr>> messages;
    for (uint32_t keyIndex = 0; keyIndex < matchingFlagKeys.Length();
         keyIndex++) {
      nsCOMPtr<nsIMsgDBHdr> mailHdr = nullptr;
      rv = m_currentFolder->GetMessageHeader(
          matchingFlagKeys.ElementAt(keyIndex), getter_AddRefs(mailHdr));
      if (NS_SUCCEEDED(rv) && mailHdr) {
        uint32_t msgSize;
        // in case of a move, the header has already been deleted,
        // so we've really got a fake header. We need to get its flags and
        // size from the offline op to have any chance of doing the move.
        mailHdr->GetMessageSize(&msgSize);
        if (!msgSize) {
          imapMessageFlagsType newImapFlags;
          uint32_t msgFlags = 0;
          op->GetMsgSize(&msgSize);
          op->GetNewFlags(&newImapFlags);
          // first three bits are the same
          msgFlags |= (newImapFlags & 0x07);
          if (newImapFlags & kImapMsgForwardedFlag)
            msgFlags |= nsMsgMessageFlags::Forwarded;
          mailHdr->SetFlags(msgFlags);
          mailHdr->SetMessageSize(msgSize);
        }
        messages.AppendElement(mailHdr);
      }
    }
    nsCOMPtr<nsIMsgCopyService> copyService =
        do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
    if (copyService) {
      copyService->CopyMessages(m_currentFolder, messages, destFolder, true,
                                this, m_window, false);
    }
  }
}

// I'm tempted to make this a method on nsIMsgFolder, but that interface
// is already so huge, and there are only a few places in the code that do this.
// If there end up to be more places that need this, then we can reconsider.
bool nsImapOfflineSync::DestFolderOnSameServer(nsIMsgFolder* destFolder) {
  nsCOMPtr<nsIMsgIncomingServer> srcServer;
  nsCOMPtr<nsIMsgIncomingServer> dstServer;

  bool sameServer = false;
  if (NS_SUCCEEDED(m_currentFolder->GetServer(getter_AddRefs(srcServer))) &&
      NS_SUCCEEDED(destFolder->GetServer(getter_AddRefs(dstServer))))
    dstServer->Equals(srcServer, &sameServer);
  return sameServer;
}

void nsImapOfflineSync::ProcessCopyOperation(
    nsIMsgOfflineImapOperation* aCurrentOp) {
  nsCOMPtr<nsIMsgOfflineImapOperation> currentOp = aCurrentOp;

  nsTArray<nsMsgKey> matchingFlagKeys;
  uint32_t currentKeyIndex = m_KeyIndex;
  nsCString copyDestination;
  currentOp->GetCopyDestination(0, getter_Copies(copyDestination));
  bool copyMatches = true;
  nsresult rv;

  do {  // loop for all messages with the same destination
    if (copyMatches) {
      nsMsgKey curKey;
      currentOp->GetMessageKey(&curKey);
      matchingFlagKeys.AppendElement(curKey);
      currentOp->SetPlayingBack(true);
      m_currentOpsToClear.AppendObject(currentOp);
    }
    currentOp = nullptr;

    if (++currentKeyIndex < m_CurrentKeys.Length()) {
      nsCString nextDestination;
      rv = m_currentDB->GetOfflineOpForKey(m_CurrentKeys[currentKeyIndex],
                                           false, getter_AddRefs(currentOp));
      copyMatches = false;
      if (NS_SUCCEEDED(rv) && currentOp) {
        nsOfflineImapOperationType opType;
        currentOp->GetOperation(&opType);
        if (opType & nsIMsgOfflineImapOperation::kMsgCopy) {
          currentOp->GetCopyDestination(0, getter_Copies(nextDestination));
          copyMatches = copyDestination.Equals(nextDestination);
        }
      }
    }
  } while (currentOp);

  nsAutoCString uids;
  nsCOMPtr<nsIMsgFolder> destFolder;
  FindFolder(copyDestination, getter_AddRefs(destFolder));
  // if the dest folder doesn't really exist, these operations are
  // going to fail, so clear them out and move on.
  if (!destFolder) {
    NS_ERROR("trying to playing back copy to non-existent folder");
    ClearCurrentOps();
    ProcessNextOperation();
    return;
  }
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
      do_QueryInterface(m_currentFolder);
  if (imapFolder && DestFolderOnSameServer(destFolder)) {
    uint32_t curFolderFlags;
    m_currentFolder->GetFlags(&curFolderFlags);
    bool curFolderOffline = curFolderFlags & nsMsgFolderFlags::Offline;
    rv = imapFolder->ReplayOfflineMoveCopy(matchingFlagKeys, false, destFolder,
                                           this, m_window, curFolderOffline);
  } else {
    nsTArray<RefPtr<nsIMsgDBHdr>> messages;
    for (uint32_t keyIndex = 0; keyIndex < matchingFlagKeys.Length();
         keyIndex++) {
      nsCOMPtr<nsIMsgDBHdr> mailHdr = nullptr;
      rv = m_currentFolder->GetMessageHeader(
          matchingFlagKeys.ElementAt(keyIndex), getter_AddRefs(mailHdr));
      if (NS_SUCCEEDED(rv) && mailHdr) messages.AppendElement(mailHdr);
    }
    nsCOMPtr<nsIMsgCopyService> copyService =
        do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
    if (copyService)
      copyService->CopyMessages(m_currentFolder, messages, destFolder, false,
                                this, m_window, false);
  }
}

void nsImapOfflineSync::ProcessEmptyTrash() {
  m_currentFolder->EmptyTrash(this);
  ClearDB();  // EmptyTrash closes and deletes the trash db.
}

// returns true if we found a folder to create, false if we're done creating
// folders.
bool nsImapOfflineSync::CreateOfflineFolders() {
  while (m_currentFolder) {
    uint32_t flags;
    m_currentFolder->GetFlags(&flags);
    bool offlineCreate = (flags & nsMsgFolderFlags::CreatedOffline) != 0;
    if (offlineCreate) {
      if (CreateOfflineFolder(m_currentFolder)) return true;
    }
    AdvanceToNextFolder();
  }
  return false;
}

bool nsImapOfflineSync::CreateOfflineFolder(nsIMsgFolder* folder) {
  nsCOMPtr<nsIMsgFolder> parent;
  folder->GetParent(getter_AddRefs(parent));

  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(parent);
  nsCOMPtr<nsIURI> createFolderURI;
  nsCString onlineName;
  imapFolder->GetOnlineName(onlineName);

  NS_ConvertASCIItoUTF16 folderName(onlineName);
  nsresult rv = imapFolder->PlaybackOfflineFolderCreate(
      folderName, nullptr, getter_AddRefs(createFolderURI));
  if (createFolderURI && NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
        do_QueryInterface(createFolderURI);
    if (mailnewsUrl) mailnewsUrl->RegisterListener(this);
  }
  return NS_SUCCEEDED(rv) ? true
                          : false;  // this is asynch, we have to return and be
                                    // called again by the OfflineOpExitFunction
}

int32_t nsImapOfflineSync::GetCurrentUIDValidity() {
  if (m_currentFolder) {
    nsCOMPtr<nsIImapMailFolderSink> imapFolderSink =
        do_QueryInterface(m_currentFolder);
    if (imapFolderSink) imapFolderSink->GetUidValidity(&mCurrentUIDValidity);
  }
  return mCurrentUIDValidity;
}

/**
 * Playing back offline operations is one giant state machine that runs through
 * ProcessNextOperation.
 * The first state is creating online any folders created offline (we do this
 * first, so we can play back any operations in them in the next pass)
 */
NS_IMETHODIMP
nsImapOfflineSync::ProcessNextOperation() {
  nsresult rv = NS_OK;

  // if we haven't created offline folders, and we're updating all folders,
  // first, find offline folders to create.
  if (!m_createdOfflineFolders) {
    if (m_singleFolderToUpdate) {
      if (!m_pseudoOffline) {
        AdvanceToFirstIMAPFolder();
        if (CreateOfflineFolders()) return NS_OK;
      }
    } else {
      if (CreateOfflineFolders()) return NS_OK;
      m_currentServer = nullptr;
      AdvanceToNextFolder();
    }
    m_createdOfflineFolders = true;
  }
  // if updating one folder only, restore m_currentFolder to that folder
  if (m_singleFolderToUpdate) m_currentFolder = m_singleFolderToUpdate;

  uint32_t folderFlags;
  nsCOMPtr<nsIDBFolderInfo> folderInfo;
  while (m_currentFolder && !m_currentDB) {
    m_currentFolder->GetFlags(&folderFlags);
    // need to check if folder has offline events, /* or is configured for
    // offline */ shouldn't need to check if configured for offline use, since
    // any folder with events should have nsMsgFolderFlags::OfflineEvents set.
    if (folderFlags &
        (nsMsgFolderFlags::OfflineEvents /* | nsMsgFolderFlags::Offline */)) {
      nsCOMPtr<nsIMsgDatabase> db;
      m_currentFolder->GetDBFolderInfoAndDB(getter_AddRefs(folderInfo),
                                            getter_AddRefs(db));
      if (db) {
        m_currentDB = do_QueryInterface(db, &rv);
        m_currentDB->AddListener(this);
      }
    }

    if (m_currentDB) {
      m_CurrentKeys.Clear();
      m_KeyIndex = 0;
      if (NS_FAILED(m_currentDB->ListAllOfflineOpIds(m_CurrentKeys)) ||
          m_CurrentKeys.IsEmpty()) {
        ClearDB();
        folderInfo = nullptr;  // can't hold onto folderInfo longer than db
        m_currentFolder->ClearFlag(nsMsgFolderFlags::OfflineEvents);
      } else {
        // trash any ghost msgs
        bool deletedGhostMsgs = false;
        for (uint32_t fakeIndex = 0; fakeIndex < m_CurrentKeys.Length();
             fakeIndex++) {
          nsCOMPtr<nsIMsgOfflineImapOperation> currentOp;
          m_currentDB->GetOfflineOpForKey(m_CurrentKeys[fakeIndex], false,
                                          getter_AddRefs(currentOp));
          if (currentOp) {
            nsOfflineImapOperationType opType;
            currentOp->GetOperation(&opType);

            if (opType == nsIMsgOfflineImapOperation::kMoveResult) {
              nsMsgKey curKey;
              currentOp->GetMessageKey(&curKey);
              m_currentDB->RemoveOfflineOp(currentOp);
              deletedGhostMsgs = true;

              // Remember the pseudo headers before we delete them,
              // and when we download new headers, tell listeners about the
              // message key change between the pseudo headers and the real
              // downloaded headers. Note that we're not currently sending
              // a msgsDeleted notification for these headers, but the
              // db listeners are notified about the deletion.
              // for imap folders, we should adjust the pending counts, because
              // we have a header that we know about, but don't have in the db.
              nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
                  do_QueryInterface(m_currentFolder);
              if (imapFolder) {
                bool hdrIsRead;
                m_currentDB->IsRead(curKey, &hdrIsRead);
                imapFolder->ChangePendingTotal(1);
                if (!hdrIsRead) imapFolder->ChangePendingUnread(1);
                imapFolder->AddMoveResultPseudoKey(curKey);
              }
              m_currentDB->DeleteMessage(curKey, nullptr, false);
            }
          }
        }

        if (deletedGhostMsgs) m_currentFolder->SummaryChanged();

        m_CurrentKeys.Clear();
        if (NS_FAILED(m_currentDB->ListAllOfflineOpIds(m_CurrentKeys)) ||
            m_CurrentKeys.IsEmpty()) {
          ClearDB();
        } else if (folderFlags & nsMsgFolderFlags::ImapBox) {
          // if pseudo offline, falls through to playing ops back.
          if (!m_pseudoOffline) {
            // there are operations to playback so check uid validity
            SetCurrentUIDValidity(0);  // force initial invalid state
            // do a lite select here and hook ourselves up as a listener.
            nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
                do_QueryInterface(m_currentFolder, &rv);
            if (imapFolder) rv = imapFolder->LiteSelect(this, m_window);
            // this is async, we will be called again by OnStopRunningUrl.
            return rv;
          }
        }
      }
    }

    if (!m_currentDB) {
      // only advance if we are doing all folders
      if (!m_singleFolderToUpdate)
        AdvanceToNextFolder();
      else
        m_currentFolder = nullptr;  // force update of this folder now.
    }
  }

  if (m_currentFolder) m_currentFolder->GetFlags(&folderFlags);
  // do the current operation
  if (m_currentDB) {
    bool currentFolderFinished = false;
    if (!folderInfo) m_currentDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
    // user canceled the lite select! if GetCurrentUIDValidity() == 0
    if (folderInfo && (m_KeyIndex < m_CurrentKeys.Length()) &&
        (m_pseudoOffline || (GetCurrentUIDValidity() != 0) ||
         !(folderFlags & nsMsgFolderFlags::ImapBox))) {
      int32_t curFolderUidValidity;
      folderInfo->GetImapUidValidity(&curFolderUidValidity);
      bool uidvalidityChanged =
          (!m_pseudoOffline && folderFlags & nsMsgFolderFlags::ImapBox) &&
          (GetCurrentUIDValidity() != curFolderUidValidity);
      nsCOMPtr<nsIMsgOfflineImapOperation> currentOp;
      if (uidvalidityChanged)
        DeleteAllOfflineOpsForCurrentDB();
      else
        m_currentDB->GetOfflineOpForKey(m_CurrentKeys[m_KeyIndex], false,
                                        getter_AddRefs(currentOp));

      if (currentOp) {
        nsOfflineImapOperationType opType;
        currentOp->GetOperation(&opType);
        // loop until we find the next db record that matches the current
        // playback operation
        while (currentOp && !(opType & mCurrentPlaybackOpType)) {
          // remove operations with no type.
          if (!opType) m_currentDB->RemoveOfflineOp(currentOp);
          currentOp = nullptr;
          ++m_KeyIndex;
          if (m_KeyIndex < m_CurrentKeys.Length())
            m_currentDB->GetOfflineOpForKey(m_CurrentKeys[m_KeyIndex], false,
                                            getter_AddRefs(currentOp));
          if (currentOp) currentOp->GetOperation(&opType);
        }
        // if we did not find a db record that matches the current playback
        // operation, then move to the next playback operation and recurse.
        if (!currentOp) {
          // we are done with the current type
          if (mCurrentPlaybackOpType ==
              nsIMsgOfflineImapOperation::kFlagsChanged) {
            mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kAddKeywords;
            // recurse to deal with next type of operation
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else if (mCurrentPlaybackOpType ==
                     nsIMsgOfflineImapOperation::kAddKeywords) {
            mCurrentPlaybackOpType =
                nsIMsgOfflineImapOperation::kRemoveKeywords;
            // recurse to deal with next type of operation
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else if (mCurrentPlaybackOpType ==
                     nsIMsgOfflineImapOperation::kRemoveKeywords) {
            mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kMsgCopy;
            // recurse to deal with next type of operation
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else if (mCurrentPlaybackOpType ==
                     nsIMsgOfflineImapOperation::kMsgCopy) {
            mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kMsgMoved;
            // recurse to deal with next type of operation
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else if (mCurrentPlaybackOpType ==
                     nsIMsgOfflineImapOperation::kMsgMoved) {
            mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kAppendDraft;
            // recurse to deal with next type of operation
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else if (mCurrentPlaybackOpType ==
                     nsIMsgOfflineImapOperation::kAppendDraft) {
            mCurrentPlaybackOpType =
                nsIMsgOfflineImapOperation::kAppendTemplate;
            // recurse to deal with next type of operation
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else if (mCurrentPlaybackOpType ==
                     nsIMsgOfflineImapOperation::kAppendTemplate) {
            mCurrentPlaybackOpType = nsIMsgOfflineImapOperation::kDeleteAllMsgs;
            m_KeyIndex = 0;
            ProcessNextOperation();
          } else {
            DeleteAllOfflineOpsForCurrentDB();
            currentFolderFinished = true;
          }

        } else {
          if (mCurrentPlaybackOpType ==
              nsIMsgOfflineImapOperation::kFlagsChanged)
            ProcessFlagOperation(currentOp);
          else if (mCurrentPlaybackOpType ==
                       nsIMsgOfflineImapOperation::kAddKeywords ||
                   mCurrentPlaybackOpType ==
                       nsIMsgOfflineImapOperation::kRemoveKeywords)
            ProcessKeywordOperation(currentOp);
          else if (mCurrentPlaybackOpType ==
                   nsIMsgOfflineImapOperation::kMsgCopy)
            ProcessCopyOperation(currentOp);
          else if (mCurrentPlaybackOpType ==
                   nsIMsgOfflineImapOperation::kMsgMoved)
            ProcessMoveOperation(currentOp);
          else if (mCurrentPlaybackOpType ==
                   nsIMsgOfflineImapOperation::kAppendDraft)
            ProcessAppendMsgOperation(currentOp,
                                      nsIMsgOfflineImapOperation::kAppendDraft);
          else if (mCurrentPlaybackOpType ==
                   nsIMsgOfflineImapOperation::kAppendTemplate)
            ProcessAppendMsgOperation(
                currentOp, nsIMsgOfflineImapOperation::kAppendTemplate);
          else if (mCurrentPlaybackOpType ==
                   nsIMsgOfflineImapOperation::kDeleteAllMsgs) {
            // empty trash is going to delete the db, so we'd better release the
            // reference to the offline operation first.
            currentOp = nullptr;
            ProcessEmptyTrash();
          } else
            NS_WARNING("invalid playback op type");
        }
      } else
        currentFolderFinished = true;
    } else
      currentFolderFinished = true;

    if (currentFolderFinished) {
      ClearDB();
      if (!m_singleFolderToUpdate) {
        AdvanceToNextFolder();
        ProcessNextOperation();
        return NS_OK;
      }
      m_currentFolder = nullptr;
    }
  }

  if (!m_currentFolder && !m_mailboxupdatesStarted) {
    m_mailboxupdatesStarted = true;

    // if we are updating more than one folder then we need the iterator
    if (!m_singleFolderToUpdate) {
      m_currentServer = nullptr;
      AdvanceToNextFolder();
    }
    if (m_singleFolderToUpdate) {
      m_singleFolderToUpdate->ClearFlag(nsMsgFolderFlags::OfflineEvents);
      m_singleFolderToUpdate->UpdateFolder(m_window);
    }
  }
  // if we get here, then I *think* we're done. Not sure, though.
#ifdef DEBUG_bienvenu
  printf("done with offline imap sync\n");
#endif
  nsCOMPtr<nsIUrlListener> saveListener = m_listener;
  m_listener = nullptr;

  if (saveListener)
    saveListener->OnStopRunningUrl(nullptr /* don't know url */, rv);
  return rv;
}

void nsImapOfflineSync::DeleteAllOfflineOpsForCurrentDB() {
  m_KeyIndex = 0;
  nsCOMPtr<nsIMsgOfflineImapOperation> currentOp;
  m_currentDB->GetOfflineOpForKey(m_CurrentKeys[m_KeyIndex], false,
                                  getter_AddRefs(currentOp));
  while (currentOp) {
    // NS_ASSERTION(currentOp->GetOperationFlags() == 0);
    // delete any ops that have already played back
    m_currentDB->RemoveOfflineOp(currentOp);
    currentOp = nullptr;

    if (++m_KeyIndex < m_CurrentKeys.Length())
      m_currentDB->GetOfflineOpForKey(m_CurrentKeys[m_KeyIndex], false,
                                      getter_AddRefs(currentOp));
  }
  m_currentDB->Commit(nsMsgDBCommitType::kLargeCommit);
  // turn off nsMsgFolderFlags::OfflineEvents
  if (m_currentFolder)
    m_currentFolder->ClearFlag(nsMsgFolderFlags::OfflineEvents);
}

nsImapOfflineDownloader::nsImapOfflineDownloader(nsIMsgWindow* aMsgWindow,
                                                 nsIUrlListener* aListener)
    : nsImapOfflineSync() {
  Init(aMsgWindow, aListener, nullptr, false);
  // pause auto-sync service
  nsresult rv;
  nsCOMPtr<nsIAutoSyncManager> autoSyncMgr =
      do_GetService(NS_AUTOSYNCMANAGER_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv)) autoSyncMgr->Pause();
}

nsImapOfflineDownloader::~nsImapOfflineDownloader() {}

NS_IMETHODIMP
nsImapOfflineDownloader::ProcessNextOperation() {
  nsresult rv = NS_OK;
  m_mailboxupdatesStarted = true;

  if (!m_mailboxupdatesFinished) {
    if (AdvanceToNextServer()) {
      nsCOMPtr<nsIMsgFolder> rootMsgFolder;
      m_currentServer->GetRootFolder(getter_AddRefs(rootMsgFolder));
      nsCOMPtr<nsIMsgFolder> inbox;
      if (rootMsgFolder) {
        // Update the INBOX first so the updates on the remaining
        // folders pickup the results of any filter moves.
        rootMsgFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                          getter_AddRefs(inbox));
        if (inbox) {
          nsCOMPtr<nsIMsgFolder> offlineImapFolder;
          nsCOMPtr<nsIMsgImapMailFolder> imapInbox = do_QueryInterface(inbox);
          if (imapInbox) {
            rootMsgFolder->GetFolderWithFlags(
                nsMsgFolderFlags::Offline, getter_AddRefs(offlineImapFolder));
            if (!offlineImapFolder) {
              // no imap folders configured for offline use - check if the
              // account is set up so that we always download inbox msg bodies
              // for offline use
              nsCOMPtr<nsIImapIncomingServer> imapServer =
                  do_QueryInterface(m_currentServer);
              if (imapServer) {
                bool downloadBodiesOnGetNewMail = false;
                imapServer->GetDownloadBodiesOnGetNewMail(
                    &downloadBodiesOnGetNewMail);
                if (downloadBodiesOnGetNewMail) offlineImapFolder = inbox;
              }
            }
          }
          // if this isn't an imap inbox, or we have an offline imap sub-folder,
          // then update the inbox. otherwise, it's an imap inbox for an account
          // with no folders configured for offline use, so just advance to the
          // next server.
          if (!imapInbox || offlineImapFolder) {
            // here we should check if this a pop3 server/inbox, and the user
            // doesn't want to download pop3 mail for offline use.
            if (!imapInbox) {
            }
            rv = inbox->GetNewMessages(m_window, this);
            if (NS_SUCCEEDED(rv)) return rv;  // otherwise, fall through.
          }
        }
      }
      return ProcessNextOperation();  // recurse and do next server.
    }
    m_allServers.Clear();
    m_mailboxupdatesFinished = true;
  }

  while (AdvanceToNextFolder()) {
    uint32_t folderFlags;

    ClearDB();
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder;
    if (m_currentFolder) imapFolder = do_QueryInterface(m_currentFolder);
    m_currentFolder->GetFlags(&folderFlags);
    // need to check if folder has offline events, or is configured for offline
    if (imapFolder && folderFlags & nsMsgFolderFlags::Offline &&
        !(folderFlags & nsMsgFolderFlags::Virtual)) {
      rv = m_currentFolder->DownloadAllForOffline(this, m_window);
      if (NS_SUCCEEDED(rv) || rv == NS_BINDING_ABORTED) return rv;
      // if this fails and the user didn't cancel/stop, fall through to code
      // that advances to next folder
    }
  }
  if (m_listener) m_listener->OnStopRunningUrl(nullptr, NS_OK);
  return rv;
}

NS_IMETHODIMP nsImapOfflineSync::OnStartCopy() {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* void OnProgress (in uint32_t aProgress, in uint32_t aProgressMax); */
NS_IMETHODIMP nsImapOfflineSync::OnProgress(uint32_t aProgress,
                                            uint32_t aProgressMax) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* void SetMessageKey (in uint32_t aKey); */
NS_IMETHODIMP nsImapOfflineSync::SetMessageKey(uint32_t aKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* [noscript] void GetMessageId (in nsCString aMessageId); */
NS_IMETHODIMP nsImapOfflineSync::GetMessageId(nsACString& messageId) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/* void OnStopCopy (in nsresult aStatus); */
NS_IMETHODIMP nsImapOfflineSync::OnStopCopy(nsresult aStatus) {
  return OnStopRunningUrl(nullptr, aStatus);
}

void nsImapOfflineSync::ClearDB() {
  m_currentOpsToClear.Clear();
  if (m_currentDB) m_currentDB->RemoveListener(this);
  m_currentDB = nullptr;
}

NS_IMETHODIMP
nsImapOfflineSync::OnHdrPropertyChanged(nsIMsgDBHdr* aHdrToChange,
                                        const nsACString& property,
                                        bool aPreChange, uint32_t* aStatus,
                                        nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP
nsImapOfflineSync::OnHdrFlagsChanged(nsIMsgDBHdr* aHdrChanged,
                                     uint32_t aOldFlags, uint32_t aNewFlags,
                                     nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP
nsImapOfflineSync::OnHdrDeleted(nsIMsgDBHdr* aHdrChanged, nsMsgKey aParentKey,
                                int32_t aFlags,
                                nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP
nsImapOfflineSync::OnHdrAdded(nsIMsgDBHdr* aHdrAdded, nsMsgKey aParentKey,
                              int32_t aFlags,
                              nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

/* void OnParentChanged (in nsMsgKey aKeyChanged, in nsMsgKey oldParent, in
 * nsMsgKey newParent, in nsIDBChangeListener aInstigator); */
NS_IMETHODIMP
nsImapOfflineSync::OnParentChanged(nsMsgKey aKeyChanged, nsMsgKey oldParent,
                                   nsMsgKey newParent,
                                   nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

/* void OnAnnouncerGoingAway (in nsIDBChangeAnnouncer instigator); */
NS_IMETHODIMP
nsImapOfflineSync::OnAnnouncerGoingAway(nsIDBChangeAnnouncer* instigator) {
  ClearDB();
  return NS_OK;
}

NS_IMETHODIMP nsImapOfflineSync::OnEvent(nsIMsgDatabase* aDB,
                                         const char* aEvent) {
  return NS_OK;
}

/* void OnReadChanged (in nsIDBChangeListener instigator); */
NS_IMETHODIMP
nsImapOfflineSync::OnReadChanged(nsIDBChangeListener* instigator) {
  return NS_OK;
}

/* void OnJunkScoreChanged (in nsIDBChangeListener instigator); */
NS_IMETHODIMP
nsImapOfflineSync::OnJunkScoreChanged(nsIDBChangeListener* instigator) {
  return NS_OK;
}
