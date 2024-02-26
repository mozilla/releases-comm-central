/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsPop3Sink.h"
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
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIPromptService.h"
#include "nsIDocShell.h"
#include "mozIDOMWindow.h"
#include "nsEmbedCID.h"
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

partialRecord::partialRecord() : m_msgDBHdr(nullptr) {}

partialRecord::~partialRecord() {}

// Walk through all the messages in this folder and look for any
// PARTIAL messages. For each of those, dig through the mailbox and
// find the Account that the message belongs to. If that Account
// matches the current Account, then look for the Uidl and save
// this message for later processing.
nsresult nsPop3Sink::FindPartialMessages() {
  nsCOMPtr<nsIMsgEnumerator> messages;
  bool hasMore = false;
  bool isOpen = false;
  nsLocalFolderScanState folderScanState;
  nsCOMPtr<nsIMsgDatabase> db;
  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_folder);
  m_folder->GetMsgDatabase(getter_AddRefs(db));
  if (!localFolder || !db)
    return NS_ERROR_FAILURE;  // we need it to grub through the folder

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
        if (NS_SUCCEEDED(rv))
          isOpen = true;
        else
          break;
      }
      rv = localFolder->GetUidlFromFolder(&folderScanState, msgDBHdr);
      if (!NS_SUCCEEDED(rv)) break;

      // If we got the uidl, see if this partial message belongs to this
      // account. Add it to the array if so...
      if (folderScanState.m_uidl &&
          m_accountKey.Equals(folderScanState.m_accountKey,
                              nsCaseInsensitiveCStringComparator)) {
        partialRecord* partialMsg = new partialRecord();
        if (partialMsg) {
          partialMsg->m_uidl = folderScanState.m_uidl;
          partialMsg->m_msgDBHdr = msgDBHdr;
          m_partialMsgsArray.AppendElement(partialMsg);
        }
      }
    }
    messages->HasMoreElements(&hasMore);
  }
  if (isOpen && folderScanState.m_inputStream)
    folderScanState.m_inputStream->Close();
  return rv;
}

// For all the partial messages saved by FindPartialMessages,
// ask the protocol handler if they still exist on the server.
// Any messages that don't exist any more are deleted from the
// msgDB.
void nsPop3Sink::CheckPartialMessages(nsIPop3Protocol* protocol) {
  uint32_t count = m_partialMsgsArray.Length();
  bool deleted = false;

  for (uint32_t i = 0; i < count; i++) {
    partialRecord* partialMsg;
    bool found = true;
    partialMsg = m_partialMsgsArray.ElementAt(i);
    protocol->CheckMessage(partialMsg->m_uidl.get(), &found);
    if (!found && partialMsg->m_msgDBHdr) {
      if (m_newMailParser)
        m_newMailParser->m_mailDB->DeleteHeader(partialMsg->m_msgDBHdr, nullptr,
                                                false, true);
      deleted = true;
    }
    delete partialMsg;
  }
  m_partialMsgsArray.Clear();
  if (deleted) {
    nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(m_folder);
    if (localFolder) localFolder->NotifyDelete();
  }
}

nsresult nsPop3Sink::BeginMailDelivery(bool uidlDownload,
                                       nsIMsgWindow* aMsgWindow, bool* aBool) {
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
    m_folder->AcquireSemaphore(supports);
  } else {
    MOZ_LOG(POP3LOGMODULE, mozilla::LogLevel::Debug,
            (POP3LOG("BeginMailDelivery folder locked")));
    return NS_MSG_FOLDER_BUSY;
  }
  m_uidlDownload = uidlDownload;
  if (!uidlDownload) FindPartialMessages();

  m_folder->GetNumNewMessages(false, &m_numNewMessagesInFolder);

#ifdef DEBUG
  printf("Begin mail message delivery.\n");
#endif
  nsCOMPtr<nsIPop3Service> pop3Service(
      do_GetService("@mozilla.org/messenger/popservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  pop3Service->NotifyDownloadStarted(m_folder);
  if (aBool) *aBool = true;
  return NS_OK;
}

nsresult nsPop3Sink::EndMailDelivery(nsIPop3Protocol* protocol) {
  CheckPartialMessages(protocol);

  if (m_newMailParser) {
    if (m_outFileStream) m_outFileStream->Flush();  // try this.
    m_newMailParser->OnStopRequest(nullptr, NS_OK);
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

  // check if the folder open in this window is not the current folder, and if
  // it has new message, in which case we need to try to run the filter plugin.
  if (m_newMailParser) {
    nsCOMPtr<nsIMsgWindow> msgWindow;
    m_newMailParser->GetMsgWindow(getter_AddRefs(msgWindow));
    // this breaks down if it's biff downloading new mail because
    // there's no msgWindow...
    if (msgWindow) {
      nsCOMPtr<nsIMsgFolder> openFolder;
      (void)msgWindow->GetOpenFolder(getter_AddRefs(openFolder));
      if (openFolder && openFolder != m_folder) {
        // only call filter plugins if folder is a local folder, because only
        // local folders get messages filtered into them synchronously by pop3.
        nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
            do_QueryInterface(openFolder);
        if (localFolder) {
          bool hasNew, isLocked;
          (void)openFolder->GetHasNewMessages(&hasNew);
          if (hasNew) {
            // if the open folder is locked, we shouldn't run the spam filters
            // on it because someone is using the folder. see 218433.
            // Ideally, the filter plugin code would try to grab the folder lock
            // and hold onto it until done, but that's more difficult and I
            // think this will actually fix the problem.
            openFolder->GetLocked(&isLocked);
            if (!isLocked) openFolder->CallFilterPlugins(nullptr, &filtersRun);
          }
        }
      }
    }
  }
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
    result = m_folder->ReleaseSemaphore(supports);
  return result;
}

nsresult nsPop3Sink::AbortMailDelivery(nsIPop3Protocol* protocol) {
  CheckPartialMessages(protocol);

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
  nsCOMPtr<nsIMsgDBHdr> newHdr;

  nsCOMPtr<nsIMsgIncomingServer> server = do_QueryInterface(m_popServer);
  if (!server) return NS_ERROR_UNEXPECTED;

  rv = server->GetMsgStore(getter_AddRefs(m_msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = m_msgStore->GetNewMsgOutputStream(m_folder, getter_AddRefs(newHdr),
                                         getter_AddRefs(m_outFileStream));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> serverFolder;
  rv = GetServerFolder(getter_AddRefs(serverFolder));
  if (NS_FAILED(rv)) return rv;

  // Annoyingly, there's some state which needs to be carried over multiple
  // messages, hence this hoop-jumping.
  int32_t oldNotNewCount = 0;
  RefPtr<nsImapMoveCoalescer> oldCoalescer;
  if (m_newMailParser) {
    oldNotNewCount = m_newMailParser->m_numNotNewMessages;
    oldCoalescer = m_newMailParser->m_moveCoalescer;
    m_newMailParser->m_moveCoalescer = nullptr;
    m_newMailParser = nullptr;
  }
  // Create a new mail parser to parse out the headers of the message and
  // load the details into the message database.
  m_newMailParser = new nsParseNewMailState;
  rv = m_newMailParser->Init(serverFolder, m_folder, m_window, newHdr,
                             m_outFileStream);
  m_newMailParser->m_numNotNewMessages = oldNotNewCount;
  m_newMailParser->m_moveCoalescer = oldCoalescer;

  if (m_uidlDownload) m_newMailParser->DisableFilters();

  // If we failed to initialize the parser, then just don't use it!!!
  // We can still continue without one.
  if (NS_FAILED(rv)) {
    m_newMailParser = nullptr;
    rv = NS_OK;
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

nsresult nsPop3Sink::IncorporateWrite(const char* block, int32_t length) {
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

    // To remove seeking to the end for each line to be written, remove the
    // following line. See bug 1116055 for details.
#define SEEK_TO_END
#ifdef SEEK_TO_END
    // seek to the end in case someone else has sought elsewhere in our stream.
    nsCOMPtr<nsISeekableStream> seekableOutStream =
        do_QueryInterface(m_outFileStream);

    if (seekableOutStream) {
      int64_t before_seek_pos;
      nsresult rv2 = seekableOutStream->Tell(&before_seek_pos);
      MOZ_ASSERT(NS_SUCCEEDED(rv2),
                 "seekableOutStream->Tell(&before_seek_pos) failed");

      // XXX Handle error such as network error for remote file system.
      seekableOutStream->Seek(nsISeekableStream::NS_SEEK_END, 0);

      int64_t after_seek_pos;
      nsresult rv3 = seekableOutStream->Tell(&after_seek_pos);
      MOZ_ASSERT(NS_SUCCEEDED(rv3),
                 "seekableOutStream->Tell(&after_seek_pos) failed");

      if (NS_SUCCEEDED(rv2) && NS_SUCCEEDED(rv3)) {
        if (before_seek_pos != after_seek_pos) {
          nsString folderName;
          if (m_folder) m_folder->GetPrettyName(folderName);
          // This merits a console message, it's poor man's telemetry.
          MsgLogToConsole4(
              u"Unexpected file position change detected"_ns +
                  (folderName.IsEmpty() ? EmptyString() : u" in folder "_ns) +
                  (folderName.IsEmpty() ? EmptyString() : folderName) +
                  u". "
                  "If you can reliably reproduce this, please report the "
                  "steps you used to dev-apps-thunderbird@lists.mozilla.org "
                  "or to bug 1308335 at bugzilla.mozilla.org. "
                  "Resolving this problem will allow speeding up message "
                  "downloads."_ns,
              NS_LITERAL_STRING_FROM_CSTRING(__FILE__), __LINE__,
              nsIScriptError::errorFlag);
#  ifdef DEBUG
          // Debugging, see bug 1116055.
          if (!folderName.IsEmpty()) {
            fprintf(stderr,
                    "(seekdebug) WriteLineToMailbox() detected an unexpected "
                    "file position change in folder %s.\n",
                    NS_ConvertUTF16toUTF8(folderName).get());
          } else {
            fprintf(stderr,
                    "(seekdebug) WriteLineToMailbox() detected an unexpected "
                    "file position change.\n");
          }
          fprintf(stderr,
                  "(seekdebug) before_seek_pos=0x%016llx, "
                  "after_seek_pos=0x%016llx\n",
                  (long long unsigned int)before_seek_pos,
                  (long long unsigned int)after_seek_pos);
#  endif
        }
      }
    }
#endif

    uint32_t bytesWritten;
    nsresult rv =
        m_outFileStream->Write(buffer.BeginReading(), bufferLen, &bytesWritten);
    NS_ENSURE_SUCCESS(rv, rv);
    NS_ENSURE_TRUE(bytesWritten == bufferLen, NS_ERROR_FAILURE);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsPop3Sink::IncorporateComplete(nsIMsgWindow* aMsgWindow, int32_t aSize) {
  if (m_buildMessageUri && !m_baseMessageUri.IsEmpty() && m_newMailParser &&
      m_newMailParser->m_newMsgHdr) {
    nsMsgKey msgKey;
    m_newMailParser->m_newMsgHdr->GetMessageKey(&msgKey);
    m_messageUri.Truncate();
    nsBuildLocalMessageURI(m_baseMessageUri, msgKey, m_messageUri);
  }

  bool leaveOnServer = false;
  m_popServer->GetLeaveMessagesOnServer(&leaveOnServer);
  // We need to flush the output stream, in case mail filters move
  // the new message, which relies on all the data being flushed.
  nsresult rv =
      m_outFileStream->Flush();  // Make sure the message is written to the disk
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ASSERTION(m_newMailParser, "could not get m_newMailParser");
  if (m_newMailParser) {
    // PublishMsgHdr clears m_newMsgHdr, so we need a comptr to
    // hold onto it.
    nsCOMPtr<nsIMsgDBHdr> hdr = m_newMailParser->m_newMsgHdr;
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
    m_msgStore->FinishNewMessage(m_outFileStream, hdr);
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
  NS_ENSURE_STATE(m_outFileStream);
  nsresult rv = m_outFileStream->Close();
  NS_ENSURE_SUCCESS(rv, rv);
  if (m_msgStore && m_newMailParser && m_newMailParser->m_newMsgHdr) {
    m_msgStore->DiscardNewMessage(m_outFileStream,
                                  m_newMailParser->m_newMsgHdr);
  }
#ifdef DEBUG
  printf("Incorporate message abort.\n");
#endif
  return rv;
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
