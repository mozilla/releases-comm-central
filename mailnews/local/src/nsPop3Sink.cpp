/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsPop3Sink.h"
#include "nsISeekableStream.h"
#include "prprf.h"
#include "prlog.h"
#include "nscore.h"
#include <stdio.h>
#include <time.h>
#include "nsParseMailbox.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgIncomingServer.h"
#include "nsLocalUtils.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsIMsgFolder.h"  // TO include biffState enum. Change to bool later...
#include "nsMsgMessageFlags.h"
#include "nsMailHeaders.h"
#include "nsIMsgAccountManager.h"
#include "nsIPop3Protocol.h"
#include "nsLocalMailFolder.h"
#include "nsIInputStream.h"
#include "nsIDocShell.h"
#include "nsMsgUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsISupportsPrimitives.h"
#include "nsIObserverService.h"
#include "nsIPop3Service.h"
#include "mozilla/Logging.h"
#include "mozilla/Services.h"

/* for logging to Error Console */
#include "nsIScriptError.h"

mozilla::LazyLogModule POP3LOGMODULE("POP3");
#define POP3LOG(str) "sink: [this=%p] " str, this

NS_IMPL_ISUPPORTS(nsPop3Sink, nsIPop3Sink)

nsPop3Sink::nsPop3Sink() {
  m_biffState = 0;
  m_numNewMessages = 0;
  m_numNewMessagesInFolder = 0;
  m_numMsgsDownloaded = 0;
  m_senderAuthed = false;
  m_outFileStream = nullptr;
  m_uidlDownload = false;
  m_buildMessageUri = false;
}

nsPop3Sink::~nsPop3Sink() {
  MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
          (POP3LOG("Calling ReleaseFolderLock from ~nsPop3Sink")));
  ReleaseFolderLock();
}

nsresult nsPop3Sink::DiscardStalePartialMessages(nsIPop3Protocol* protocol) {
  struct PartialRecord {
    nsCOMPtr<nsIMsgDBHdr> m_msgDBHdr = nullptr;
    nsCString m_uidl;
  };
  nsTArray<PartialRecord> partialMsgsArray;

  // Walk through all the messages in this folder and look for any
  // partial messages. For each of those, dig through the mailbox and
  // find the account that the message belongs to. If that account
  // matches the current Account, then look for the UIDL and save
  // this message for later processing.

  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_folder);
  if (!localFolder) {
    return NS_ERROR_FAILURE;
  }

  nsCOMPtr<nsIMsgEnumerator> messages;
  bool hasMore = false;
  bool isOpen = false;
  nsLocalFolderScanState folderScanState;
  nsCOMPtr<nsIMsgDatabase> db;
  m_folder->GetMsgDatabase(getter_AddRefs(db));
  if (!db) return NS_ERROR_FAILURE;  // we need it to grub through the folder

  nsresult rv = db->EnumerateMessages(getter_AddRefs(messages));
  if (messages) messages->HasMoreElements(&hasMore);
  while (hasMore && NS_SUCCEEDED(rv)) {
    uint32_t flags = 0;
    nsCOMPtr<nsIMsgDBHdr> msgDBHdr;
    rv = messages->GetNext(getter_AddRefs(msgDBHdr));
    if (!NS_SUCCEEDED(rv)) break;
    msgDBHdr->GetFlags(&flags);
    if (flags & nsMsgMessageFlags::Partial) {
      // Open the various streams we need to seek and read from the mailbox
      if (!isOpen) {
        rv = localFolder->GetFolderScanState(&folderScanState);
        if (NS_SUCCEEDED(rv)) {
          isOpen = true;
        } else {
          break;
        }
      }
      rv = localFolder->GetUidlFromFolder(&folderScanState, msgDBHdr);
      if (!NS_SUCCEEDED(rv)) break;

      // If we got the uidl, see if this partial message belongs to this
      // account. Add it to the array if so...
      if (folderScanState.m_uidl &&
          m_accountKey.Equals(folderScanState.m_accountKey,
                              nsCaseInsensitiveCStringComparator)) {
        partialMsgsArray.AppendElement(
            PartialRecord{msgDBHdr, nsCString{folderScanState.m_uidl}});
      }
    }
    messages->HasMoreElements(&hasMore);
  }
  if (isOpen && folderScanState.m_inputStream) {
    folderScanState.m_inputStream->Close();
  }
  NS_ENSURE_SUCCESS(rv, rv);

  // For all the partial messages saved above, ask the protocol handler if they
  // still exist on the server. Any messages that don't exist any more are
  // deleted from the msgDB.

  bool deleted = false;
  for (PartialRecord& partialMsg : partialMsgsArray) {
    bool found = true;
    protocol->CheckMessage(partialMsg.m_uidl.get(), &found);
    if (!found && partialMsg.m_msgDBHdr) {
      rv = db->DeleteHeader(partialMsg.m_msgDBHdr, nullptr, false, true);
      if (NS_FAILED(rv)) {
        continue;
      }
      deleted = true;
    }
  }
  partialMsgsArray.Clear();
  if (deleted) {
    localFolder->NotifyDelete();
  }
  return NS_OK;
}

nsresult nsPop3Sink::BeginMailDelivery(bool uidlDownload,
                                       nsIMsgWindow* aMsgWindow) {
  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryInterface(m_popServer);
  if (!server) return NS_ERROR_UNEXPECTED;

  m_window = aMsgWindow;

  nsCOMPtr<nsIMsgAccountManager> acctMgr =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  nsCOMPtr<nsIMsgAccount> account;
  NS_ENSURE_SUCCESS(rv, rv);
  acctMgr->FindAccountForServer(server, getter_AddRefs(account));
  if (account) account->GetKey(m_accountKey);

  bool isLocked;
  nsCOMPtr<nsISupports> supports =
      do_QueryInterface(static_cast<nsIPop3Sink*>(this));

  NS_ENSURE_STATE(m_folder);
  m_folder->GetLocked(&isLocked);
  if (!isLocked) {
    MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
            (POP3LOG("BeginMailDelivery acquiring semaphore")));
    m_folder->AcquireSemaphore(supports, "nsPop3Sink::BeginMailDelivery"_ns);
  } else {
    MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
            (POP3LOG("BeginMailDelivery folder locked")));
    return NS_MSG_FOLDER_BUSY;
  }
  m_uidlDownload = uidlDownload;

  m_folder->GetNumNewMessages(false, &m_numNewMessagesInFolder);

#ifdef DEBUG
  printf("Begin mail message delivery.\n");
#endif
  nsCOMPtr<nsIPop3Service> pop3Service(
      do_GetService("@mozilla.org/messenger/popservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  pop3Service->NotifyDownloadStarted(m_folder);
  return NS_OK;
}

nsresult nsPop3Sink::EndMailDelivery(nsIPop3Protocol* protocol) {
  if (!m_uidlDownload) {
    DiscardStalePartialMessages(protocol);
  }

  if (m_newMailParser) {
    m_newMailParser->DoneParsing();
    m_newMailParser->EndMsgDownload();
  }
  if (m_outFileStream) {
    m_outFileStream->Close();
    m_outFileStream = nullptr;
  }

  // tell the parser to mark the db valid *after* closing the mailbox.
  if (m_newMailParser) m_newMailParser->UpdateDBFolderInfo();

  MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
          (POP3LOG("Calling ReleaseFolderLock from EndMailDelivery")));
  nsresult rv = ReleaseFolderLock();
  NS_ASSERTION(NS_SUCCEEDED(rv), "folder lock not released successfully");

  bool filtersRun;
  m_folder->CallFilterPlugins(nullptr,
                              &filtersRun);  // ??? do we need msgWindow?
  int32_t numNewMessagesInFolder;
  // if filters have marked msgs read or deleted, the num new messages count
  // will go negative by the number of messages marked read or deleted,
  // so if we add that number to the number of msgs downloaded, that will give
  // us the number of actual new messages.
  m_folder->GetNumNewMessages(false, &numNewMessagesInFolder);
  m_numNewMessages -= (m_numNewMessagesInFolder - numNewMessagesInFolder);
  m_folder->SetNumNewMessages(
      m_numNewMessages);  // we'll adjust this for spam later
  if (!filtersRun && m_numNewMessages > 0) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    m_folder->GetServer(getter_AddRefs(server));
    if (server) {
      server->SetPerformingBiff(true);
      m_folder->SetBiffState(m_biffState);
      server->SetPerformingBiff(false);
    }
  }
  // note that size on disk has possibly changed.
  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_folder);
  if (localFolder) (void)localFolder->RefreshSizeOnDisk();
  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryInterface(m_popServer);
  if (server) {
    nsCOMPtr<nsIMsgFilterList> filterList;
    rv = server->GetFilterList(nullptr, getter_AddRefs(filterList));
    NS_ENSURE_SUCCESS(rv, rv);

    if (filterList) (void)filterList->FlushLogIfNecessary();
  }

  // fix for bug #161999
  // we should update the summary totals for the folder (inbox)
  // in case it's not the open folder
  m_folder->UpdateSummaryTotals(true);

#ifdef DEBUG
  printf("End mail message delivery.\n");
#endif
  nsCOMPtr<nsIPop3Service> pop3Service(
      do_GetService("@mozilla.org/messenger/popservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  pop3Service->NotifyDownloadCompleted(m_folder, m_numNewMessages);
  return NS_OK;
}

nsresult nsPop3Sink::ReleaseFolderLock() {
  nsresult result = NS_OK;
  if (!m_folder) return result;
  bool haveSemaphore;
  nsCOMPtr<nsISupports> supports =
      do_QueryInterface(static_cast<nsIPop3Sink*>(this));
  result = m_folder->TestSemaphore(supports, &haveSemaphore);
  MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
          (POP3LOG("ReleaseFolderLock haveSemaphore = %s"),
           haveSemaphore ? "TRUE" : "FALSE"));

  if (NS_SUCCEEDED(result) && haveSemaphore)
    result = m_folder->ReleaseSemaphore(supports,
                                        "nsPop3Sink::ReleaseFolderLock"_ns);
  return result;
}

nsresult nsPop3Sink::AbortMailDelivery(nsIPop3Protocol* protocol) {
  // ### PS TODO - discard any new message?

  if (m_outFileStream) {
    m_outFileStream->Close();
    m_outFileStream = nullptr;
  }

  /* tell the parser to mark the db valid *after* closing the mailbox.
  we have truncated the inbox, so berkeley mailbox and msf file are in sync*/
  if (m_newMailParser) m_newMailParser->UpdateDBFolderInfo();
  MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
          (POP3LOG("Calling ReleaseFolderLock from AbortMailDelivery")));

  nsresult rv = ReleaseFolderLock();
  NS_ASSERTION(NS_SUCCEEDED(rv), "folder lock not released successfully");

#ifdef DEBUG
  printf("Abort mail message delivery.\n");
#endif
  nsCOMPtr<nsIPop3Service> pop3Service(
      do_GetService("@mozilla.org/messenger/popservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  pop3Service->NotifyDownloadCompleted(m_folder, 0);
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::IncorporateBegin(const char* uidlString, uint32_t flags) {
#ifdef DEBUG
  printf("Incorporate message begin:\n");
  if (uidlString) printf("uidl string: %s\n", uidlString);
#endif

  nsresult rv;

  nsCOMPtr<nsIMsgDatabase> db;
  rv = m_folder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = m_folder->GetMsgStore(getter_AddRefs(m_msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = m_msgStore->GetNewMsgOutputStream(m_folder,
                                         getter_AddRefs(m_outFileStream));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> serverFolder;
  rv = GetServerFolder(getter_AddRefs(serverFolder));
  if (NS_FAILED(rv)) return rv;

  // Annoyingly, there's some state which needs to be carried over multiple
  // messages, hence this hoop-jumping.
  int32_t oldNotNewCount = 0;
  RefPtr<nsImapMoveCoalescer> oldCoalescer;
  mozilla::UniquePtr<nsTHashMap<nsCStringHashKey, int32_t>>
      oldFilterTargetFoldersMsgMovedCount;
  if (m_newMailParser) {
    oldNotNewCount = m_newMailParser->m_numNotNewMessages;
    oldCoalescer = m_newMailParser->m_moveCoalescer;
    oldFilterTargetFoldersMsgMovedCount.swap(
        m_newMailParser->m_filterTargetFoldersMsgMovedCount);
    m_newMailParser->m_moveCoalescer = nullptr;
    m_newMailParser = nullptr;
  }

  nsCOMPtr<nsIMsgDBHdr> newHdr;
  rv = db->CreateNewHdr(nsMsgKey_None, getter_AddRefs(newHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create a new mail parser to parse out the headers of the message and
  // load the details into the message database.
  m_newMailParser = new nsParseNewMailState;
  rv = m_newMailParser->Init(serverFolder, m_folder, m_window, newHdr,
                             m_outFileStream);
  m_newMailParser->m_numNotNewMessages = oldNotNewCount;
  m_newMailParser->m_moveCoalescer = oldCoalescer;
  m_newMailParser->m_filterTargetFoldersMsgMovedCount.swap(
      oldFilterTargetFoldersMsgMovedCount);

  if (m_uidlDownload) m_newMailParser->DisableFilters();

  // If we failed to initialize the parser, then just don't use it!!!
  // We can still continue without one.
  if (NS_FAILED(rv)) {
    m_newMailParser = nullptr;
    MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Warning,
            (POP3LOG("Failed to initialize m_newMailParser")));
  }

  nsCString outputString;
  // Write out account-key before UIDL so the code that looks for
  // UIDL will find the account first and know it can stop looking
  // once it finds the UIDL line.
  if (!m_accountKey.IsEmpty()) {
    outputString.AssignLiteral(HEADER_X_MOZILLA_ACCOUNT_KEY ": ");
    outputString.Append(m_accountKey);
    outputString.AppendLiteral(MSG_LINEBREAK);
    rv = WriteLineToMailbox(outputString);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  if (uidlString) {
    outputString.AssignLiteral("X-UIDL: ");
    outputString.Append(uidlString);
    outputString.AppendLiteral(MSG_LINEBREAK);
    rv = WriteLineToMailbox(outputString);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // WriteLineToMailbox("X-Mozilla-Status: 8000" MSG_LINEBREAK);
  char* statusLine = PR_smprintf(X_MOZILLA_STATUS_FORMAT MSG_LINEBREAK, flags);
  outputString.Assign(statusLine);
  rv = WriteLineToMailbox(outputString);
  PR_smprintf_free(statusLine);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = WriteLineToMailbox("X-Mozilla-Status2: 00000000"_ns MSG_LINEBREAK);
  NS_ENSURE_SUCCESS(rv, rv);

  // leave space for 60 bytes worth of keys/tags
  rv = WriteLineToMailbox(nsLiteralCString(X_MOZILLA_KEYWORDS));
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::SetPopServer(nsIPop3IncomingServer* server) {
  m_popServer = server;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::GetPopServer(nsIPop3IncomingServer** aServer) {
  NS_ENSURE_ARG_POINTER(aServer);
  NS_IF_ADDREF(*aServer = m_popServer);
  return NS_OK;
}

NS_IMETHODIMP nsPop3Sink::GetFolder(nsIMsgFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_IF_ADDREF(*aFolder = m_folder);
  return NS_OK;
}

NS_IMETHODIMP nsPop3Sink::SetFolder(nsIMsgFolder* aFolder) {
  m_folder = aFolder;
  return NS_OK;
}

nsresult nsPop3Sink::GetServerFolder(nsIMsgFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  if (m_popServer) {
    // not sure what this is used for - might be wrong if we have a deferred
    // account.
    nsCOMPtr<nsIMsgIncomingServer> incomingServer =
        do_QueryInterface(m_popServer);
    if (incomingServer) return incomingServer->GetRootFolder(aFolder);
  }
  *aFolder = nullptr;
  return NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsPop3Sink::SetMsgsToDownload(uint32_t aNumMessages) {
  m_numNewMessages = aNumMessages;
  return NS_OK;
}

NS_IMETHODIMP nsPop3Sink::IncorporateWrite(const char* block, int32_t length) {
  return WriteLineToMailbox(nsDependentCString(block, length));
}

nsresult nsPop3Sink::WriteLineToMailbox(const nsACString& buffer) {
  if (!buffer.IsEmpty()) {
    uint32_t bufferLen = buffer.Length();
    if (m_newMailParser)
      m_newMailParser->HandleLine(buffer.BeginReading(), bufferLen);
    // The following (!m_outFileStream etc) was added to make sure that we don't
    // write somewhere where for some reason or another we can't write to and
    // lose the messages See bug 62480
    NS_ENSURE_TRUE(m_outFileStream, NS_ERROR_OUT_OF_MEMORY);

    nsresult rv =
        SyncWriteAll(m_outFileStream, buffer.BeginReading(), bufferLen);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::IncorporateComplete(nsIMsgWindow* aMsgWindow, int32_t aSize) {
  if (m_buildMessageUri && !m_baseMessageUri.IsEmpty() && m_newMailParser) {
    nsCOMPtr<nsIMsgDBHdr> hdr;
    m_newMailParser->GetNewMsgHdr(getter_AddRefs(hdr));
    if (hdr) {
      nsMsgKey msgKey;
      hdr->GetMessageKey(&msgKey);
      m_messageUri.Truncate();
      nsBuildLocalMessageURI(m_baseMessageUri, msgKey, m_messageUri);
    }
  }

  nsresult rv;

  NS_ASSERTION(m_newMailParser, "could not get m_newMailParser");

  // If line separators in server response are just LF instead of stardard CRLF,
  // the blank line between the headers and the message body will not be
  // detected. The detection of this blank line causes the header content to
  // be parsed to correctly display the message list information. Send parser an
  // empty/blank line to cause a header parse if it has not yet occurred.
  if (m_newMailParser) {
    rv = m_newMailParser->HandleLine("", 0);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // We need to flush the output stream in case mail filters move/copy the new
  // message. This relies on all the data being flushed (i.e., written to disk).
  rv = m_outFileStream->Flush();
  NS_ENSURE_SUCCESS(rv, rv);
  if (m_newMailParser) {
    // PublishMsgHdr clears m_newMsgHdr, so we need a comptr to
    // hold onto it.
    nsCOMPtr<nsIMsgDBHdr> hdr;
    m_newMailParser->GetNewMsgHdr(getter_AddRefs(hdr));
    NS_ASSERTION(hdr, "m_newMailParser->m_newMsgHdr wasn't set");
    if (!hdr) return NS_ERROR_FAILURE;

    nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_folder);

    // If a header already exists for this message (for example, when
    // getting a complete message when a partial exists), then update the new
    // header from the old.
    nsCOMPtr<nsIMsgDBHdr> oldMsgHdr;
    if (localFolder) {
      rv = !m_origMessageUri.IsEmpty()
               ? GetMsgDBHdrFromURI(m_origMessageUri, getter_AddRefs(oldMsgHdr))
               : localFolder->RetrieveHdrOfPartialMessage(
                     hdr, getter_AddRefs(oldMsgHdr));
      if (NS_SUCCEEDED(rv) && oldMsgHdr) {
        localFolder->UpdateNewMsgHdr(oldMsgHdr, hdr);
      }
    }

    nsAutoCString storeToken;
    rv = m_msgStore->FinishNewMessage(m_folder, m_outFileStream, storeToken);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = hdr->SetStoreToken(storeToken);
    NS_ENSURE_SUCCESS(rv, rv);

    m_newMailParser->PublishMsgHeader(aMsgWindow);
    m_newMailParser->ApplyForwardAndReplyFilter(aMsgWindow);
    if (aSize) hdr->SetUint32Property("onlineSize", aSize);

    if (oldMsgHdr) {
      // We had the partial message, but got the full now.
      nsCOMPtr<nsIMsgFolder> oldMsgFolder;
      rv = oldMsgHdr->GetFolder(getter_AddRefs(oldMsgFolder));
      NS_ENSURE_SUCCESS(rv, rv);
      nsCString oldURI;
      rv = oldMsgFolder->GetUriForMsg(oldMsgHdr, oldURI);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIMsgFolder> newMsgFolder;
      rv = hdr->GetFolder(getter_AddRefs(newMsgFolder));
      NS_ENSURE_SUCCESS(rv, rv);
      nsCString newURI;
      rv = newMsgFolder->GetUriForMsg(hdr, newURI);
      NS_ENSURE_SUCCESS(rv, rv);

      // Delete old header before notifying.
      nsCOMPtr<nsIMsgDatabase> db;
      rv = m_folder->GetMsgDatabase(getter_AddRefs(db));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = db->DeleteHeader(oldMsgHdr, nullptr, false, true);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIObserverService> obsServ =
          mozilla::services::GetObserverService();
      nsCOMPtr<nsISupportsString> origUri =
          do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID, &rv);
      if (NS_SUCCEEDED(rv)) {
        origUri->SetData(NS_ConvertUTF8toUTF16(oldURI));
        obsServ->NotifyObservers(origUri, "message-content-updated",
                                 NS_ConvertUTF8toUTF16(newURI).get());
      }
    }
  }

#ifdef DEBUG
  printf("Incorporate message complete.\n");
#endif
  nsCOMPtr<nsIPop3Service> pop3Service(
      do_GetService("@mozilla.org/messenger/popservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  pop3Service->NotifyDownloadProgress(m_folder, ++m_numMsgsDownloaded,
                                      m_numNewMessages);
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::IncorporateAbort() {
  if (m_msgStore && m_newMailParser) {
    nsCOMPtr<nsIMsgDBHdr> hdr;
    m_newMailParser->GetNewMsgHdr(getter_AddRefs(hdr));
    m_msgStore->DiscardNewMessage(m_folder, m_outFileStream);
  }
  m_outFileStream = nullptr;
#ifdef DEBUG
  printf("Incorporate message abort.\n");
#endif
  return NS_OK;
}

nsresult nsPop3Sink::SetBiffStateAndUpdateFE(uint32_t aBiffState,
                                             int32_t numNewMessages,
                                             bool notify) {
  m_biffState = aBiffState;
  if (m_newMailParser) numNewMessages -= m_newMailParser->m_numNotNewMessages;

  if (notify && m_folder && numNewMessages > 0 &&
      numNewMessages != m_numNewMessages &&
      aBiffState == nsIMsgFolder::nsMsgBiffState_NewMail) {
    m_folder->SetNumNewMessages(numNewMessages);
    m_folder->SetBiffState(aBiffState);
  }
  m_numNewMessages = numNewMessages;

  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::GetBuildMessageUri(bool* bVal) {
  NS_ENSURE_ARG_POINTER(bVal);
  *bVal = m_buildMessageUri;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::SetBuildMessageUri(bool bVal) {
  m_buildMessageUri = bVal;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::GetMessageUri(nsACString& messageUri) {
  NS_ENSURE_TRUE(!m_messageUri.IsEmpty(), NS_ERROR_FAILURE);
  messageUri = m_messageUri;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::SetMessageUri(const nsACString& messageUri) {
  m_messageUri = messageUri;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::GetBaseMessageUri(nsACString& baseMessageUri) {
  NS_ENSURE_TRUE(!m_baseMessageUri.IsEmpty(), NS_ERROR_FAILURE);
  baseMessageUri = m_baseMessageUri;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::SetBaseMessageUri(const nsACString& baseMessageUri) {
  m_baseMessageUri = baseMessageUri;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::GetOrigMessageUri(nsACString& aOrigMessageUri) {
  aOrigMessageUri.Assign(m_origMessageUri);
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::SetOrigMessageUri(const nsACString& aOrigMessageUri) {
  m_origMessageUri.Assign(aOrigMessageUri);
  return NS_OK;
}
