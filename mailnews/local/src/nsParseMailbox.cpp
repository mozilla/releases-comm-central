/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MailNewsTypes.h"
#include "msgCore.h"
#include "nsIURI.h"
#include "nsIChannel.h"
#include "nsParseMailbox.h"
#include "nsIMsgHdr.h"
#include "nsIMsgDatabase.h"
#include "nsMsgMessageFlags.h"
#include "nsIDBFolderInfo.h"
#include "nsIInputStream.h"
#include "nsIFile.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsIMailboxUrl.h"
#include "nsNetUtil.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgFolder.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgFilter.h"
#include "nsIMsgFilterPlugin.h"
#include "nsIMsgFilterHitNotify.h"
#include "nsIIOService.h"
#include "nsMsgI18N.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsMsgUtils.h"
#include "prprf.h"
#include "prmem.h"
#include "nsMsgSearchCore.h"
#include "nsMailHeaders.h"
#include "nsIMsgMailSession.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "nsIMsgComposeService.h"
#include "nsIMsgCopyService.h"
#include "nsICryptoHash.h"
#include "nsIStringBundle.h"
#include "nsPrintfCString.h"
#include "nsIMsgFilterCustomAction.h"
#include <ctype.h>
#include "nsIMsgPluggableStore.h"
#include "mozilla/Components.h"
#include "nsQueryObject.h"
#include "nsIOutputStream.h"
#include "mozilla/Logging.h"

using namespace mozilla;

extern LazyLogModule FILTERLOGMODULE;

/* the following macros actually implement addref, release and query interface
 * for our component. */
NS_IMPL_ISUPPORTS_INHERITED(nsMsgMailboxParser, nsParseMailMessageState,
                            nsIStreamListener, nsIRequestObserver)

// Whenever data arrives from the connection, core netlib notifices the protocol
// by calling OnDataAvailable. We then read and process the incoming data from
// the input stream.
NS_IMETHODIMP nsMsgMailboxParser::OnDataAvailable(nsIRequest* request,
                                                  nsIInputStream* aIStream,
                                                  uint64_t sourceOffset,
                                                  uint32_t aLength) {
  return ProcessMailboxInputStream(aIStream, aLength);
}

NS_IMETHODIMP nsMsgMailboxParser::OnStartRequest(nsIRequest* request) {
  // extract the appropriate event sinks from the url and initialize them in our
  // protocol data the URL should be queried for a nsIMailboxURL. If it doesn't
  // support a mailbox URL interface then we have an error.
  nsresult rv = NS_OK;

  nsCOMPtr<nsIIOService> ioServ = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(ioServ, NS_ERROR_UNEXPECTED);

  // We know the request is an nsIChannel we can get a URI from, but this is
  // probably bad form. See Bug 1528662.
  nsCOMPtr<nsIChannel> channel = do_QueryInterface(request, &rv);
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                       "error QI nsIRequest to nsIChannel failed");
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> uri;
  rv = channel->GetURI(getter_AddRefs(uri));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMailboxUrl> runningUrl = do_QueryInterface(uri, &rv);

  nsCOMPtr<nsIMsgMailNewsUrl> url = do_QueryInterface(uri);
  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(m_folder);

  if (NS_SUCCEEDED(rv) && runningUrl && folder) {
    url->GetStatusFeedback(getter_AddRefs(m_statusFeedback));

    // okay, now fill in our event sinks...Note that each getter ref counts
    // before it returns the interface to us...we'll release when we are done

    folder->GetName(m_folderName);

    nsCOMPtr<nsIFile> path;
    folder->GetFilePath(getter_AddRefs(path));

    if (path) {
      int64_t fileSize;
      path->GetFileSize(&fileSize);
      // the size of the mailbox file is our total base line for measuring
      // progress
      m_graph_progress_total = fileSize;
      UpdateStatusText("buildingSummary");
      nsCOMPtr<nsIMsgDBService> msgDBService =
          do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
      if (msgDBService) {
        // Use OpenFolderDB to always open the db so that db's m_folder
        // is set correctly.
        rv = msgDBService->OpenFolderDB(folder, true, getter_AddRefs(m_mailDB));
        if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING)
          rv = msgDBService->CreateNewDB(folder, getter_AddRefs(m_mailDB));

        if (m_mailDB) m_mailDB->AddListener(this);
      }
      NS_ASSERTION(m_mailDB, "failed to open mail db parsing folder");

      // try to get a backup message database
      nsresult rvignore =
          folder->GetBackupMsgDatabase(getter_AddRefs(m_backupMailDB));

      // We'll accept failures and move on, as we're dealing with some
      // sort of unknown problem to begin with.
      if (NS_FAILED(rvignore)) {
        if (m_backupMailDB) m_backupMailDB->RemoveListener(this);
        m_backupMailDB = nullptr;
      } else if (m_backupMailDB) {
        m_backupMailDB->AddListener(this);
      }
    }
  }

  // need to get the mailbox name out of the url and call SetMailboxName with
  // it. then, we need to open the mail db for this parser.
  return rv;
}

// stop binding is a "notification" informing us that the stream associated with
// aURL is going away.
NS_IMETHODIMP nsMsgMailboxParser::OnStopRequest(nsIRequest* request,
                                                nsresult aStatus) {
  DoneParsingFolder(aStatus);
  // what can we do? we can close the stream?

  if (m_mailDB) m_mailDB->RemoveListener(this);
  // and we want to mark ourselves for deletion or some how inform our protocol
  // manager that we are available for another url if there is one....

  ReleaseFolderLock();
  // be sure to clear any status text and progress info..
  m_graph_progress_received = 0;
  UpdateProgressPercent();
  UpdateStatusText("localStatusDocumentDone");

  return NS_OK;
}

NS_IMETHODIMP
nsParseMailMessageState::OnHdrPropertyChanged(
    nsIMsgDBHdr* aHdrToChange, const nsACString& property, bool aPreChange,
    uint32_t* aStatus, nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP
nsParseMailMessageState::OnHdrFlagsChanged(nsIMsgDBHdr* aHdrChanged,
                                           uint32_t aOldFlags,
                                           uint32_t aNewFlags,
                                           nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP
nsParseMailMessageState::OnHdrDeleted(nsIMsgDBHdr* aHdrChanged,
                                      nsMsgKey aParentKey, int32_t aFlags,
                                      nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP
nsParseMailMessageState::OnHdrAdded(nsIMsgDBHdr* aHdrAdded, nsMsgKey aParentKey,
                                    int32_t aFlags,
                                    nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

/* void OnParentChanged (in nsMsgKey aKeyChanged, in nsMsgKey oldParent, in
 * nsMsgKey newParent, in nsIDBChangeListener aInstigator); */
NS_IMETHODIMP
nsParseMailMessageState::OnParentChanged(nsMsgKey aKeyChanged,
                                         nsMsgKey oldParent, nsMsgKey newParent,
                                         nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

/* void OnAnnouncerGoingAway (in nsIDBChangeAnnouncer instigator); */
NS_IMETHODIMP
nsParseMailMessageState::OnAnnouncerGoingAway(
    nsIDBChangeAnnouncer* instigator) {
  if (m_backupMailDB && m_backupMailDB == instigator) {
    m_backupMailDB->RemoveListener(this);
    m_backupMailDB = nullptr;
  } else if (m_mailDB) {
    m_mailDB->RemoveListener(this);
    m_mailDB = nullptr;
    m_newMsgHdr = nullptr;
  }
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::OnEvent(nsIMsgDatabase* aDB,
                                               const char* aEvent) {
  return NS_OK;
}

/* void OnReadChanged (in nsIDBChangeListener instigator); */
NS_IMETHODIMP
nsParseMailMessageState::OnReadChanged(nsIDBChangeListener* instigator) {
  return NS_OK;
}

/* void OnJunkScoreChanged (in nsIDBChangeListener instigator); */
NS_IMETHODIMP
nsParseMailMessageState::OnJunkScoreChanged(nsIDBChangeListener* instigator) {
  return NS_OK;
}

nsMsgMailboxParser::nsMsgMailboxParser() : nsMsgLineBuffer() { Init(); }

nsMsgMailboxParser::nsMsgMailboxParser(nsIMsgFolder* aFolder)
    : nsMsgLineBuffer() {
  m_folder = do_GetWeakReference(aFolder);
}

nsMsgMailboxParser::~nsMsgMailboxParser() { ReleaseFolderLock(); }

nsresult nsMsgMailboxParser::Init() {
  m_graph_progress_total = 0;
  m_graph_progress_received = 0;
  return AcquireFolderLock();
}

void nsMsgMailboxParser::UpdateStatusText(const char* stringName) {
  if (m_statusFeedback) {
    nsresult rv;
    nsCOMPtr<nsIStringBundleService> bundleService =
        mozilla::components::StringBundle::Service();
    if (!bundleService) return;
    nsCOMPtr<nsIStringBundle> bundle;
    rv = bundleService->CreateBundle(
        "chrome://messenger/locale/localMsgs.properties",
        getter_AddRefs(bundle));
    if (NS_FAILED(rv)) return;
    nsString finalString;
    AutoTArray<nsString, 1> stringArray = {m_folderName};
    rv = bundle->FormatStringFromName(stringName, stringArray, finalString);
    m_statusFeedback->ShowStatusString(finalString);
  }
}

void nsMsgMailboxParser::UpdateProgressPercent() {
  if (m_statusFeedback && m_graph_progress_total != 0) {
    // prevent overflow by dividing both by 100
    int64_t progressTotal = m_graph_progress_total / 100;
    int64_t progressReceived = m_graph_progress_received / 100;
    if (progressTotal > 0)
      m_statusFeedback->ShowProgress((100 * (progressReceived)) /
                                     progressTotal);
  }
}

nsresult nsMsgMailboxParser::ProcessMailboxInputStream(nsIInputStream* aIStream,
                                                       uint32_t aLength) {
  // Impose an upper limit on our read buffer, just in case.
  // 1MB: small enough to cope with, but still ridiculously big.
  constexpr uint32_t maxBuf = 1024 * 1024;
  while (aLength > 0) {
    uint32_t chunkSize = std::min(aLength, maxBuf);
    nsresult rv = m_inputStream.GrowBuffer(chunkSize);
    NS_ENSURE_SUCCESS(rv, rv);
    uint32_t bytesRead = 0;
    // OK, this sucks, but we're going to have to copy into our
    // own byte buffer, and then pass that to the line buffering code,
    // which means a couple buffer copies.
    rv = aIStream->Read(m_inputStream.GetBuffer(), chunkSize, &bytesRead);
    NS_ENSURE_SUCCESS(rv, rv);
    aLength -= bytesRead;
    rv = BufferInput(m_inputStream.GetBuffer(), bytesRead);
    NS_ENSURE_SUCCESS(rv, rv);
    if (m_graph_progress_total > 0) {
      m_graph_progress_received += bytesRead;
    }
  }
  return NS_OK;
}

void nsMsgMailboxParser::DoneParsingFolder(nsresult status) {
  // End of file. Flush out any data remaining in the buffer.
  Flush();
  PublishMsgHeader(nullptr);

  // only mark the db valid if we've succeeded.
  if (NS_SUCCEEDED(status) &&
      m_mailDB)  // finished parsing, so flush db folder info
    UpdateDBFolderInfo();
  else if (m_mailDB)
    m_mailDB->SetSummaryValid(false);

  // remove the backup database
  if (m_backupMailDB) {
    nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(m_folder);
    if (folder) folder->RemoveBackupMsgDatabase();
    m_backupMailDB = nullptr;
  }
}

void nsMsgMailboxParser::UpdateDBFolderInfo() { UpdateDBFolderInfo(m_mailDB); }

// update folder info in db so we know not to reparse.
void nsMsgMailboxParser::UpdateDBFolderInfo(nsIMsgDatabase* mailDB) {
  mailDB->SetSummaryValid(true);
}

// Tell the world about the message header (add to db, and view, if any)
void nsMsgMailboxParser::PublishMsgHeader(nsIMsgWindow* msgWindow) {
  FinishHeader();
  if (m_newMsgHdr) {
    nsCString storeToken = nsPrintfCString("%" PRIu64, m_envelope_pos);
    m_newMsgHdr->SetStringProperty("storeToken", storeToken);
    m_newMsgHdr->SetMessageOffset(m_envelope_pos);

    uint32_t flags;
    (void)m_newMsgHdr->GetFlags(&flags);
    if (flags & nsMsgMessageFlags::Expunged) {
      nsCOMPtr<nsIDBFolderInfo> folderInfo;
      m_mailDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
      uint32_t size;
      (void)m_newMsgHdr->GetMessageSize(&size);
      folderInfo->ChangeExpungedBytes(size);
      m_newMsgHdr = nullptr;
    } else if (m_mailDB) {
      // add hdr but don't notify - shouldn't be requiring notifications
      // during summary file rebuilding
      m_mailDB->AddNewHdrToDB(m_newMsgHdr, false);
      m_newMsgHdr = nullptr;
    } else
      NS_ASSERTION(
          false,
          "no database while parsing local folder");  // should have a DB, no?
  } else if (m_mailDB) {
    // m_newMsgHdr is null when Expunged flag is set (see FinalizeHeaders()).
    nsCOMPtr<nsIDBFolderInfo> folderInfo;
    m_mailDB->GetDBFolderInfo(getter_AddRefs(folderInfo));
    if (folderInfo)
      folderInfo->ChangeExpungedBytes(m_position - m_envelope_pos);
  }
}

void nsMsgMailboxParser::AbortNewHeader() {
  if (m_newMsgHdr && m_mailDB) m_newMsgHdr = nullptr;
}

void nsMsgMailboxParser::OnNewMessage(nsIMsgWindow* msgWindow) {
  PublishMsgHeader(msgWindow);
  Clear();
}

nsresult nsMsgMailboxParser::HandleLine(const char* line, uint32_t lineLength) {
  NS_ENSURE_STATE(m_mailDB);  // if no DB, do we need to parse at all?
  return ParseFolderLine(line, lineLength);
}

void nsMsgMailboxParser::ReleaseFolderLock() {
  nsresult result;
  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(m_folder);
  if (!folder) return;
  bool haveSemaphore;
  nsCOMPtr<nsISupports> supports =
      do_QueryInterface(static_cast<nsIMsgParseMailMsgState*>(this));
  result = folder->TestSemaphore(supports, &haveSemaphore);
  if (NS_SUCCEEDED(result) && haveSemaphore)
    (void)folder->ReleaseSemaphore(supports);
}

nsresult nsMsgMailboxParser::AcquireFolderLock() {
  nsCOMPtr<nsIMsgFolder> folder = do_QueryReferent(m_folder);
  if (!folder) return NS_ERROR_NULL_POINTER;
  nsCOMPtr<nsISupports> supports = do_QueryObject(this);
  return folder->AcquireSemaphore(supports);
}

NS_IMPL_ISUPPORTS(nsParseMailMessageState, nsIMsgParseMailMsgState,
                  nsIDBChangeListener)

nsParseMailMessageState::nsParseMailMessageState() {
  m_position = 0;
  m_new_key = nsMsgKey_None;
  m_state = nsIMsgParseMailMsgState::ParseHeadersState;

  // setup handling of custom db headers, headers that are added to .msf files
  // as properties of the nsMsgHdr objects, controlled by the
  // pref mailnews.customDBHeaders, a space-delimited list of headers.
  // E.g., if mailnews.customDBHeaders is "X-Spam-Score", and we're parsing
  // a mail message with the X-Spam-Score header, we'll set the
  // "x-spam-score" property of nsMsgHdr to the value of the header.
  m_customDBHeaderValues = nullptr;
  nsCString customDBHeaders;  // not shown in search UI
  nsCOMPtr<nsIPrefBranch> pPrefBranch(do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (!pPrefBranch) {
    return;
  }
  pPrefBranch->GetCharPref("mailnews.customDBHeaders", customDBHeaders);
  ToLowerCase(customDBHeaders);
  if (customDBHeaders.Find("content-base") == -1)
    customDBHeaders.InsertLiteral("content-base ", 0);
  ParseString(customDBHeaders, ' ', m_customDBHeaders);

  // now add customHeaders
  nsCString customHeadersString;  // shown in search UI
  nsTArray<nsCString> customHeadersArray;
  pPrefBranch->GetCharPref("mailnews.customHeaders", customHeadersString);
  ToLowerCase(customHeadersString);
  customHeadersString.StripWhitespace();
  ParseString(customHeadersString, ':', customHeadersArray);
  for (uint32_t i = 0; i < customHeadersArray.Length(); i++) {
    if (!m_customDBHeaders.Contains(customHeadersArray[i]))
      m_customDBHeaders.AppendElement(customHeadersArray[i]);
  }

  if (m_customDBHeaders.Length()) {
    m_customDBHeaderValues =
        new struct message_header[m_customDBHeaders.Length()];
  }
  Clear();
}

nsParseMailMessageState::~nsParseMailMessageState() {
  ClearAggregateHeader(m_toList);
  ClearAggregateHeader(m_ccList);
  delete[] m_customDBHeaderValues;
}

NS_IMETHODIMP nsParseMailMessageState::Clear() {
  m_message_id.length = 0;
  m_references.length = 0;
  m_date.length = 0;
  m_delivery_date.length = 0;
  m_from.length = 0;
  m_sender.length = 0;
  m_newsgroups.length = 0;
  m_subject.length = 0;
  m_status.length = 0;
  m_mozstatus.length = 0;
  m_mozstatus2.length = 0;
  m_envelope_from.length = 0;
  m_envelope_date.length = 0;
  m_priority.length = 0;
  m_keywords.length = 0;
  m_mdn_dnt.length = 0;
  m_return_path.length = 0;
  m_account_key.length = 0;
  m_in_reply_to.length = 0;
  m_replyTo.length = 0;
  m_content_type.length = 0;
  m_mdn_original_recipient.length = 0;
  m_bccList.length = 0;
  m_body_lines = 0;
  m_newMsgHdr = nullptr;
  m_envelope_pos = 0;
  m_new_key = nsMsgKey_None;
  ClearAggregateHeader(m_toList);
  ClearAggregateHeader(m_ccList);
  m_headers.ResetWritePos();
  m_envelope.ResetWritePos();
  m_receivedTime = 0;
  m_receivedValue.Truncate();
  for (uint32_t i = 0; i < m_customDBHeaders.Length(); i++) {
    m_customDBHeaderValues[i].length = 0;
  }
  m_headerstartpos = 0;
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::SetState(nsMailboxParseState aState) {
  m_state = aState;
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::GetState(nsMailboxParseState* aState) {
  if (!aState) return NS_ERROR_NULL_POINTER;

  *aState = m_state;
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::GetNewMsgHdr(nsIMsgDBHdr** aMsgHeader) {
  NS_ENSURE_ARG_POINTER(aMsgHeader);
  NS_IF_ADDREF(*aMsgHeader = m_newMsgHdr);
  return m_newMsgHdr ? NS_OK : NS_ERROR_NULL_POINTER;
}

NS_IMETHODIMP nsParseMailMessageState::SetNewMsgHdr(nsIMsgDBHdr* aMsgHeader) {
  m_newMsgHdr = aMsgHeader;
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::ParseAFolderLine(const char* line,
                                                        uint32_t lineLength) {
  ParseFolderLine(line, lineLength);
  return NS_OK;
}

nsresult nsParseMailMessageState::ParseFolderLine(const char* line,
                                                  uint32_t lineLength) {
  nsresult rv;

  if (m_state == nsIMsgParseMailMsgState::ParseHeadersState) {
    if (EMPTY_MESSAGE_LINE(line)) {
      /* End of headers.  Now parse them. */
      rv = ParseHeaders();
      NS_ASSERTION(NS_SUCCEEDED(rv), "error parsing headers parsing mailbox");
      NS_ENSURE_SUCCESS(rv, rv);

      rv = FinalizeHeaders();
      NS_ASSERTION(NS_SUCCEEDED(rv),
                   "error finalizing headers parsing mailbox");
      NS_ENSURE_SUCCESS(rv, rv);

      m_state = nsIMsgParseMailMsgState::ParseBodyState;
    } else {
      /* Otherwise, this line belongs to a header.  So append it to the
         header data, and stay in MBOX `MIME_PARSE_HEADERS' state.
      */
      m_headers.AppendBuffer(line, lineLength);
    }
  } else if (m_state == nsIMsgParseMailMsgState::ParseBodyState) {
    m_body_lines++;
  }

  m_position += lineLength;

  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::SetMailDB(nsIMsgDatabase* mailDB) {
  m_mailDB = mailDB;
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::SetBackupMailDB(
    nsIMsgDatabase* aBackupMailDB) {
  m_backupMailDB = aBackupMailDB;
  if (m_backupMailDB) m_backupMailDB->AddListener(this);
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::SetNewKey(nsMsgKey aKey) {
  m_new_key = aKey;
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::FinishHeader() {
  if (m_newMsgHdr) {
    m_newMsgHdr->SetMessageSize(m_position - m_envelope_pos);
    m_newMsgHdr->SetLineCount(m_body_lines);
  }
  return NS_OK;
}

NS_IMETHODIMP nsParseMailMessageState::GetAllHeaders(char** pHeaders,
                                                     int32_t* pHeadersSize) {
  if (!pHeaders || !pHeadersSize) return NS_ERROR_NULL_POINTER;
  *pHeaders = m_headers.GetBuffer();
  *pHeadersSize = m_headers.GetBufferPos();
  return NS_OK;
}

// generate headers as a string, with CRLF between the headers
NS_IMETHODIMP nsParseMailMessageState::GetHeaders(char** pHeaders) {
  NS_ENSURE_ARG_POINTER(pHeaders);
  nsCString crlfHeaders;
  char* curHeader = m_headers.GetBuffer();
  for (uint32_t headerPos = 0; headerPos < m_headers.GetBufferPos();) {
    crlfHeaders.Append(curHeader);
    crlfHeaders.Append(CRLF);
    int32_t headerLen = strlen(curHeader);
    curHeader += headerLen + 1;
    headerPos += headerLen + 1;
  }
  *pHeaders = ToNewCString(crlfHeaders);
  return NS_OK;
}

struct message_header* nsParseMailMessageState::GetNextHeaderInAggregate(
    nsTArray<struct message_header*>& list) {
  // When parsing a message with multiple To or CC header lines, we're storing
  // each line in a list, where the list represents the "aggregate" total of all
  // the header. Here we get a new line for the list

  struct message_header* header =
      (struct message_header*)PR_Calloc(1, sizeof(struct message_header));
  list.AppendElement(header);
  return header;
}

void nsParseMailMessageState::GetAggregateHeader(
    nsTArray<struct message_header*>& list, struct message_header* outHeader) {
  // When parsing a message with multiple To or CC header lines, we're storing
  // each line in a list, where the list represents the "aggregate" total of all
  // the header. Here we combine all the lines together, as though they were
  // really all found on the same line

  struct message_header* header = nullptr;
  int length = 0;
  size_t i;

  // Count up the bytes required to allocate the aggregated header
  for (i = 0; i < list.Length(); i++) {
    header = list.ElementAt(i);
    length += (header->length + 1);  //+ for ","
  }

  if (length > 0) {
    char* value = (char*)PR_CALLOC(length + 1);  //+1 for null term
    if (value) {
      // Catenate all the To lines together, separated by commas
      value[0] = '\0';
      size_t size = list.Length();
      for (i = 0; i < size; i++) {
        header = list.ElementAt(i);
        PL_strncat(value, header->value, header->length);
        if (i + 1 < size) PL_strcat(value, ",");
      }
      outHeader->length = length;
      outHeader->value = value;
    }
  } else {
    outHeader->length = 0;
    outHeader->value = nullptr;
  }
}

void nsParseMailMessageState::ClearAggregateHeader(
    nsTArray<struct message_header*>& list) {
  // Reset the aggregate headers. Free only the message_header struct since
  // we don't own the value pointer

  for (size_t i = 0; i < list.Length(); i++) PR_Free(list.ElementAt(i));
  list.Clear();
}

/* largely lifted from mimehtml.c, which does similar parsing, sigh...
 */
nsresult nsParseMailMessageState::ParseHeaders() {
  char* buf = m_headers.GetBuffer();
  uint32_t buf_length = m_headers.GetBufferPos();
  if (buf_length == 0) {
    // No header of an expected type is present. Consider this a successful
    // parse so email still shows on summary and can be accessed and deleted.
    return NS_OK;
  }
  char* buf_end = buf + buf_length;
  if (!(buf_length > 1 &&
        (buf[buf_length - 1] == '\r' || buf[buf_length - 1] == '\n'))) {
    NS_WARNING("Header text should always end in a newline");
    return NS_ERROR_UNEXPECTED;
  }
  while (buf < buf_end) {
    char* colon = PL_strnchr(buf, ':', buf_end - buf);
    char* value = 0;
    struct message_header* header = 0;
    struct message_header receivedBy;

    if (!colon) break;

    nsDependentCSubstring headerStr(buf, colon);
    ToLowerCase(headerStr);

    // Obtain firstChar in headerStr. But if headerStr is empty, just set it to
    // the colon. This is needed because First() asserts on an empty string.
    char firstChar = !headerStr.IsEmpty() ? headerStr.First() : *colon;

    // See RFC 5322 section 3.6 for min-max number for given header.
    // If multiple headers exist we need to make sure to use the first one.

    switch (firstChar) {
      case 'b':
        if (headerStr.EqualsLiteral("bcc") && !m_bccList.length)
          header = &m_bccList;
        break;
      case 'c':
        if (headerStr.EqualsLiteral("cc"))  // XXX: RFC 5322 says it's 0 or 1.
          header = GetNextHeaderInAggregate(m_ccList);
        else if (headerStr.EqualsLiteral("content-type"))
          header = &m_content_type;
        break;
      case 'd':
        if (headerStr.EqualsLiteral("date") && !m_date.length)
          header = &m_date;
        else if (headerStr.EqualsLiteral("disposition-notification-to"))
          header = &m_mdn_dnt;
        else if (headerStr.EqualsLiteral("delivery-date"))
          header = &m_delivery_date;
        break;
      case 'f':
        if (headerStr.EqualsLiteral("from") && !m_from.length) {
          header = &m_from;
        }
        break;
      case 'i':
        if (headerStr.EqualsLiteral("in-reply-to") && !m_in_reply_to.length)
          header = &m_in_reply_to;
        break;
      case 'm':
        if (headerStr.EqualsLiteral("message-id") && !m_message_id.length)
          header = &m_message_id;
        break;
      case 'n':
        if (headerStr.EqualsLiteral("newsgroups")) header = &m_newsgroups;
        break;
      case 'o':
        if (headerStr.EqualsLiteral("original-recipient"))
          header = &m_mdn_original_recipient;
        break;
      case 'p':
        // we could very well care what the priority header was when we
        // remember its value. If so, need to remember it here. Also,
        // different priority headers can appear in the same message,
        // but we only remember the last one that we see. Applies also to
        // x-priority checked below.
        if (headerStr.EqualsLiteral("priority")) header = &m_priority;
        break;
      case 'r':
        if (headerStr.EqualsLiteral("references") && !m_references.length)
          header = &m_references;
        else if (headerStr.EqualsLiteral("return-path"))
          header = &m_return_path;
        // treat conventional Return-Receipt-To as MDN
        // Disposition-Notification-To
        else if (headerStr.EqualsLiteral("return-receipt-to"))
          header = &m_mdn_dnt;
        else if (headerStr.EqualsLiteral("reply-to") && !m_replyTo.length)
          header = &m_replyTo;
        else if (headerStr.EqualsLiteral("received")) {
          header = &receivedBy;
          header->length = 0;
        }
        break;
      case 's':
        if (headerStr.EqualsLiteral("subject") && !m_subject.length)
          header = &m_subject;
        else if (headerStr.EqualsLiteral("sender") && !m_sender.length)
          header = &m_sender;
        else if (headerStr.EqualsLiteral("status"))
          header = &m_status;
        break;
      case 't':
        if (headerStr.EqualsLiteral("to"))  // XXX: RFC 5322 says it's 0 or 1.
          header = GetNextHeaderInAggregate(m_toList);
        break;
      case 'x':
        if (headerStr.EqualsIgnoreCase(X_MOZILLA_STATUS2) &&
            !m_mozstatus2.length)
          header = &m_mozstatus2;
        else if (headerStr.EqualsIgnoreCase(X_MOZILLA_STATUS) &&
                 !m_mozstatus.length)
          header = &m_mozstatus;
        else if (headerStr.EqualsIgnoreCase(HEADER_X_MOZILLA_ACCOUNT_KEY) &&
                 !m_account_key.length)
          header = &m_account_key;
        else if (headerStr.EqualsLiteral("x-priority"))  // See case 'p' above.
          header = &m_priority;
        else if (headerStr.EqualsIgnoreCase(HEADER_X_MOZILLA_KEYWORDS) &&
                 !m_keywords.length)
          header = &m_keywords;
        break;
    }

    if (!header && m_customDBHeaders.Length()) {
      size_t customHeaderIndex = m_customDBHeaders.IndexOf(headerStr);
      if (customHeaderIndex != m_customDBHeaders.NoIndex)
        header = &m_customDBHeaderValues[customHeaderIndex];
    }

    buf = colon + 1;
    // We will be shuffling downwards, so this is our insertion point.
    char* bufWrite = buf;

  SEARCH_NEWLINE:
    // move past any non terminating characters, rewriting them if folding white
    // space exists
    while (buf < buf_end && *buf != '\r' && *buf != '\n') {
      if (buf != bufWrite) *bufWrite = *buf;
      buf++;
      bufWrite++;
    }

    // Look for folding, so CRLF, CR or LF followed by space or tab.
    if ((buf + 2 < buf_end && (buf[0] == '\r' && buf[1] == '\n') &&
         (buf[2] == ' ' || buf[2] == '\t')) ||
        (buf + 1 < buf_end && (buf[0] == '\r' || buf[0] == '\n') &&
         (buf[1] == ' ' || buf[1] == '\t'))) {
      // Remove trailing spaces at the "write position" and add a single
      // folding space.
      while (*(bufWrite - 1) == ' ' || *(bufWrite - 1) == '\t') bufWrite--;
      *(bufWrite++) = ' ';

      // Skip CRLF, CR+space or LF+space ...
      buf += 2;

      // ... and skip leading spaces in that line.
      while (buf < buf_end && (*buf == ' ' || *buf == '\t')) buf++;

      // If we get here, the message headers ended in an empty line, like:
      // To: blah blah blah<CR><LF>  <CR><LF>[end of buffer]. The code below
      // requires buf to land on a newline to properly null-terminate the
      // string, so back up a tad so that it is pointing to one.
      if (buf == buf_end) {
        --buf;
        MOZ_ASSERT(*buf == '\n' || *buf == '\r',
                   "Header text should always end in a newline.");
      }
      goto SEARCH_NEWLINE;
    }

    // Null out the remainder after all the white space contained in
    // the header has been folded.
    if (bufWrite < buf) {
      memset(bufWrite, '\0', buf - bufWrite);
    }

    if (header) {
      value = colon + 1;
      // eliminate trailing blanks after the colon
      while (value < bufWrite && (*value == ' ' || *value == '\t')) value++;

      header->value = value;
      header->length = bufWrite - value;
      if (header->length < 0) header->length = 0;
    }
    if (*buf == '\r' || *buf == '\n') {
      char* last = bufWrite;
      char* saveBuf = buf;
      if (*buf == '\r' && buf + 1 < buf_end && buf[1] == '\n') buf++;
      buf++;
      // null terminate the left-over slop so we don't confuse msg filters.
      *saveBuf = 0;
      *last = 0; /* short-circuit const, and null-terminate header. */
    }

    if (header) {
      /* More const short-circuitry... */
      /* strip trailing whitespace */
      while (header->length > 0 && IS_SPACE(header->value[header->length - 1]))
        ((char*)header->value)[--header->length] = 0;
      if (header == &receivedBy) {
        if (m_receivedTime == 0) {
          // parse Received: header for date.
          // We trust the first header as that is closest to recipient,
          // and less likely to be spoofed.
          nsAutoCString receivedHdr(header->value, header->length);
          int32_t lastSemicolon = receivedHdr.RFindChar(';');
          if (lastSemicolon != -1) {
            nsAutoCString receivedDate;
            receivedDate = Substring(receivedHdr, lastSemicolon + 1);
            receivedDate.Trim(" \t\b\r\n");
            PRTime resultTime;
            if (PR_ParseTimeString(receivedDate.get(), false, &resultTime) ==
                PR_SUCCESS)
              m_receivedTime = resultTime;
            else
              NS_WARNING("PR_ParseTimeString failed in ParseHeaders().");
          }
        }
        // Someone might want the received header saved.
        if (m_customDBHeaders.Length()) {
          if (m_customDBHeaders.Contains("received"_ns)) {
            if (!m_receivedValue.IsEmpty()) m_receivedValue.Append(' ');
            m_receivedValue.Append(header->value, header->length);
          }
        }
      }

      MOZ_ASSERT(header->value[header->length] == 0,
                 "Non-null-terminated strings cause very, very bad problems");
    }
  }
  return NS_OK;
}

nsresult nsParseMailMessageState::InternSubject(struct message_header* header) {
  if (!header || header->length == 0) {
    m_newMsgHdr->SetSubject(""_ns);
    return NS_OK;
  }

  nsDependentCString key(header->value);

  uint32_t flags;
  (void)m_newMsgHdr->GetFlags(&flags);
  /* strip "Re: " */
  /**
        We trust the X-Mozilla-Status line to be the smartest in almost
        all things.  One exception, however, is the HAS_RE flag.  Since
         we just parsed the subject header anyway, we expect that parsing
         to be smartest.  (After all, what if someone just went in and
        edited the subject line by hand?)
     */
  nsCString modifiedSubject;
  bool strippedRE = NS_MsgStripRE(key, modifiedSubject);
  if (strippedRE)
    flags |= nsMsgMessageFlags::HasRe;
  else
    flags &= ~nsMsgMessageFlags::HasRe;
  m_newMsgHdr->SetFlags(flags);  // this *does not* update the mozilla-status
                                 // header in the local folder

  m_newMsgHdr->SetSubject(strippedRE ? modifiedSubject : key);

  return NS_OK;
}

// we've reached the end of the envelope, and need to turn all our accumulated
// message_headers into a single nsIMsgDBHdr to store in a database.
nsresult nsParseMailMessageState::FinalizeHeaders() {
  nsresult rv;
  struct message_header* sender;
  struct message_header* recipient;
  struct message_header* subject;
  struct message_header* id;
  struct message_header* inReplyTo;
  struct message_header* replyTo;
  struct message_header* references;
  struct message_header* date;
  struct message_header* deliveryDate;
  struct message_header* statush;
  struct message_header* mozstatus;
  struct message_header* mozstatus2;
  struct message_header* priority;
  struct message_header* keywords;
  struct message_header* account_key;
  struct message_header* ccList;
  struct message_header* bccList;
  struct message_header* mdn_dnt;
  struct message_header md5_header;
  struct message_header* content_type;
  char md5_data[50];

  uint32_t flags = 0;
  nsMsgPriorityValue priorityFlags = nsMsgPriority::notSet;

  if (!m_mailDB)  // if we don't have a valid db, skip the header.
    return NS_OK;

  struct message_header to;
  GetAggregateHeader(m_toList, &to);
  struct message_header cc;
  GetAggregateHeader(m_ccList, &cc);
  // we don't aggregate bcc, as we only generate it locally,
  // and we don't use multiple lines

  // clang-format off
  sender       = (m_from.length          ? &m_from          :
                  m_sender.length        ? &m_sender        :
                  m_envelope_from.length ? &m_envelope_from : 0);
  recipient    = (to.length              ? &to              :
                  cc.length              ? &cc              :
                  m_newsgroups.length    ? &m_newsgroups    : 0);
  ccList       = (cc.length              ? &cc              : 0);
  bccList      = (m_bccList.length       ? &m_bccList       : 0);
  subject      = (m_subject.length       ? &m_subject       : 0);
  id           = (m_message_id.length    ? &m_message_id    : 0);
  references   = (m_references.length    ? &m_references    : 0);
  statush      = (m_status.length        ? &m_status        : 0);
  mozstatus    = (m_mozstatus.length     ? &m_mozstatus     : 0);
  mozstatus2   = (m_mozstatus2.length    ? &m_mozstatus2    : 0);
  date         = (m_date.length          ? &m_date          :
                  m_envelope_date.length ? &m_envelope_date : 0);
  deliveryDate = (m_delivery_date.length ? &m_delivery_date : 0);
  priority     = (m_priority.length      ? &m_priority      : 0);
  keywords     = (m_keywords.length      ? &m_keywords      : 0);
  mdn_dnt      = (m_mdn_dnt.length       ? &m_mdn_dnt       : 0);
  inReplyTo    = (m_in_reply_to.length   ? &m_in_reply_to   : 0);
  replyTo      = (m_replyTo.length       ? &m_replyTo       : 0);
  content_type = (m_content_type.length  ? &m_content_type  : 0);
  account_key  = (m_account_key.length   ? &m_account_key   : 0);
  // clang-format on

  if (mozstatus) {
    if (mozstatus->length == 4) {
      NS_ASSERTION(MsgIsHex(mozstatus->value, 4),
                   "Expected 4 hex digits for flags.");
      flags = MsgUnhex(mozstatus->value, 4);
      // strip off and remember priority bits.
      flags &= ~nsMsgMessageFlags::RuntimeOnly;
      priorityFlags =
          (nsMsgPriorityValue)((flags & nsMsgMessageFlags::Priorities) >> 13);
      flags &= ~nsMsgMessageFlags::Priorities;
    }
  }

  if (mozstatus2) {
    uint32_t flags2 = 0;
    sscanf(mozstatus2->value, " %x ", &flags2);
    flags |= flags2;
  }

  if (!(flags & nsMsgMessageFlags::Expunged))  // message was deleted, don't
                                               // bother creating a hdr.
  {
    // We'll need the message id first to recover data from the backup database
    nsAutoCString rawMsgId;
    /* Take off <> around message ID. */
    if (id) {
      if (id->length > 0 && id->value[0] == '<') {
        id->length--;
        id->value++;
      }

      NS_WARNING_ASSERTION(id->length > 0,
                           "id->length failure in FinalizeHeaders().");

      if (id->length > 0 && id->value[id->length - 1] == '>')
        /* generate a new null-terminated string without the final > */
        rawMsgId.Assign(id->value, id->length - 1);
      else
        rawMsgId.Assign(id->value);
    }

    /*
     * Try to copy the data from the backup database, referencing the MessageID
     * If that fails, just create a new header
     */
    nsCOMPtr<nsIMsgDBHdr> oldHeader;
    nsresult ret = NS_OK;

    if (m_backupMailDB && !rawMsgId.IsEmpty())
      ret = m_backupMailDB->GetMsgHdrForMessageID(rawMsgId.get(),
                                                  getter_AddRefs(oldHeader));

    // m_new_key is set in nsImapMailFolder::ParseAdoptedHeaderLine to be
    // the UID of the message, so that the key can get created as UID. That of
    // course is extremely confusing, and we really need to clean that up. We
    // really should not conflate the meaning of envelope position, key, and
    // UID.
    if (NS_SUCCEEDED(ret) && oldHeader)
      ret = m_mailDB->CopyHdrFromExistingHdr(m_new_key, oldHeader, false,
                                             getter_AddRefs(m_newMsgHdr));
    else if (!m_newMsgHdr) {
      // Should assert that this is not a local message
      ret = m_mailDB->CreateNewHdr(m_new_key, getter_AddRefs(m_newMsgHdr));
    }

    if (NS_SUCCEEDED(ret) && m_newMsgHdr) {
      uint32_t origFlags;
      (void)m_newMsgHdr->GetFlags(&origFlags);
      if (origFlags & nsMsgMessageFlags::HasRe)
        flags |= nsMsgMessageFlags::HasRe;
      else
        flags &= ~nsMsgMessageFlags::HasRe;

      flags &=
          ~nsMsgMessageFlags::Offline;  // don't keep nsMsgMessageFlags::Offline
                                        // for local msgs
      if (mdn_dnt && !(origFlags & nsMsgMessageFlags::Read) &&
          !(origFlags & nsMsgMessageFlags::MDNReportSent) &&
          !(flags & nsMsgMessageFlags::MDNReportSent))
        flags |= nsMsgMessageFlags::MDNReportNeeded;

      m_newMsgHdr->SetFlags(flags);
      if (priorityFlags != nsMsgPriority::notSet)
        m_newMsgHdr->SetPriority(priorityFlags);

      // if we have a reply to header, and it's different from the from: header,
      // set the "replyTo" attribute on the msg hdr.
      if (replyTo && (!sender || replyTo->length != sender->length ||
                      strncmp(replyTo->value, sender->value, sender->length)))
        m_newMsgHdr->SetStringProperty("replyTo",
                                       nsDependentCString(replyTo->value));

      if (sender) {
        m_newMsgHdr->SetAuthor(nsDependentCString(sender->value));
      }

      if (recipient == &m_newsgroups) {
        /* In the case where the recipient is a newsgroup, truncate the string
           at the first comma.  This is used only for presenting the thread
           list, and newsgroup lines tend to be long and non-shared, and tend to
           bloat the string table.  So, by only showing the first newsgroup, we
           can reduce memory and file usage at the expense of only showing the
           one group in the summary list, and only being able to sort on the
           first group rather than the whole list.  It's worth it. */
        char* ch;
        ch = PL_strchr(recipient->value, ',');
        if (ch) {
          /* generate a new string that terminates before the , */
          nsAutoCString firstGroup;
          firstGroup.Assign(recipient->value, ch - recipient->value);
          m_newMsgHdr->SetRecipients(firstGroup);
        }

        m_newMsgHdr->SetRecipients(nsDependentCString(recipient->value));
      } else if (recipient) {
        m_newMsgHdr->SetRecipients(nsDependentCString(recipient->value));
      }
      if (ccList) {
        m_newMsgHdr->SetCcList(nsDependentCString(ccList->value));
      }

      if (bccList) {
        m_newMsgHdr->SetBccList(nsDependentCString(bccList->value));
      }

      rv = InternSubject(subject);
      if (NS_SUCCEEDED(rv)) {
        if (!id) {
          // what to do about this? we used to do a hash of all the headers...
          nsAutoCString hash;
          const char* md5_b64 = "dummy.message.id";
          nsresult rv;
          nsCOMPtr<nsICryptoHash> hasher =
              do_CreateInstance("@mozilla.org/security/hash;1", &rv);
          if (NS_SUCCEEDED(rv)) {
            if (NS_SUCCEEDED(hasher->Init(nsICryptoHash::MD5)) &&
                NS_SUCCEEDED(
                    hasher->Update((const uint8_t*)m_headers.GetBuffer(),
                                   m_headers.GetBufferPos())) &&
                NS_SUCCEEDED(hasher->Finish(true, hash)))
              md5_b64 = hash.get();
          }
          PR_snprintf(md5_data, sizeof(md5_data), "<md5:%s>", md5_b64);
          md5_header.value = md5_data;
          md5_header.length = strlen(md5_data);
          id = &md5_header;
        }

        if (!rawMsgId.IsEmpty()) {
          m_newMsgHdr->SetMessageId(rawMsgId);
        } else {
          m_newMsgHdr->SetMessageId(nsDependentCString(id->value));
        }

        m_mailDB->UpdatePendingAttributes(m_newMsgHdr);

        if (!mozstatus && statush) {
          // Parse a little bit of the Berkeley Mail status header.
          for (const char* s = statush->value; *s; s++) {
            uint32_t msgFlags = 0;
            (void)m_newMsgHdr->GetFlags(&msgFlags);
            switch (*s) {
              case 'R':
              case 'O':
              case 'r':
                m_newMsgHdr->SetFlags(msgFlags | nsMsgMessageFlags::Read);
                break;
              case 'D':
              case 'd':
                // msg->flags |= nsMsgMessageFlags::Expunged; // Maybe?
                break;
              case 'N':
              case 'n':
              case 'U':
              case 'u':
                m_newMsgHdr->SetFlags(msgFlags & ~nsMsgMessageFlags::Read);
                break;
              default:
                NS_WARNING(nsPrintfCString("Unexpected status for %s: %s",
                                           rawMsgId.get(), statush->value)
                               .get());
                break;
            }
          }
        }

        if (account_key != nullptr)
          m_newMsgHdr->SetAccountKey(account_key->value);
        // use in-reply-to header as references, if there's no references header
        if (references != nullptr) {
          m_newMsgHdr->SetReferences(nsDependentCString(references->value));
        } else if (inReplyTo != nullptr) {
          m_newMsgHdr->SetReferences(nsDependentCString(inReplyTo->value));
        } else {
          m_newMsgHdr->SetReferences(""_ns);
        }

        // 'Received' should be as reliable an indicator of the receipt
        // date+time as possible, whilst always giving something *from
        // the message*.  It won't use PR_Now() under any circumstance.
        // Therefore, the fall-thru order for 'Received' is:
        // Received: -> Delivery-date: -> date
        // 'Date' uses:
        // date -> 'Received' -> PR_Now()
        //
        // date is:
        // Date: -> m_envelope_date

        uint32_t rcvTimeSecs = 0;
        PRTime datePRTime = 0;
        if (date) {
          // Date:
          if (PR_ParseTimeString(date->value, false, &datePRTime) ==
              PR_SUCCESS) {
            // Convert to seconds as default value for 'Received'.
            PRTime2Seconds(datePRTime, &rcvTimeSecs);
          } else {
            NS_WARNING(
                "PR_ParseTimeString of date failed in FinalizeHeader().");
          }
        }
        if (m_receivedTime) {
          // Upgrade 'Received' to Received: ?
          PRTime2Seconds(m_receivedTime, &rcvTimeSecs);
          if (datePRTime == 0) datePRTime = m_receivedTime;
        } else if (deliveryDate) {
          // Upgrade 'Received' to Delivery-date: ?
          PRTime resultTime;
          if (PR_ParseTimeString(deliveryDate->value, false, &resultTime) ==
              PR_SUCCESS) {
            PRTime2Seconds(resultTime, &rcvTimeSecs);
            if (datePRTime == 0) datePRTime = resultTime;
          } else {
            // TODO/FIXME: We need to figure out what to do in this case!
            NS_WARNING(
                "PR_ParseTimeString of delivery date failed in "
                "FinalizeHeader().");
          }
        }
        m_newMsgHdr->SetUint32Property("dateReceived", rcvTimeSecs);

        if (datePRTime == 0) {
          // If there was some problem parsing the Date header *AND* we
          // couldn't get a valid envelope date *AND* we couldn't get a valid
          // Received: header date, use now as the time.
          // This doesn't affect local (POP3) messages, because we use the
          // envelope date if there's no Date: header, but it will affect IMAP
          // msgs w/o a Date: header or Received: headers.
          datePRTime = PR_Now();
        }
        m_newMsgHdr->SetDate(datePRTime);

        if (priority) {
          nsMsgPriorityValue priorityVal = nsMsgPriority::Default;

          // We can ignore |NS_MsgGetPriorityFromString()| return value,
          // since we set a default value for |priorityVal|.
          NS_MsgGetPriorityFromString(priority->value, priorityVal);
          m_newMsgHdr->SetPriority(priorityVal);
        } else if (priorityFlags == nsMsgPriority::notSet)
          m_newMsgHdr->SetPriority(nsMsgPriority::none);
        if (keywords) {
          // When there are many keywords, some may not have been written
          // to the message file, so add extra keywords from the backup
          nsAutoCString oldKeywords;
          m_newMsgHdr->GetStringProperty("keywords", oldKeywords);
          nsTArray<nsCString> newKeywordArray, oldKeywordArray;
          ParseString(
              Substring(keywords->value, keywords->value + keywords->length),
              ' ', newKeywordArray);
          ParseString(oldKeywords, ' ', oldKeywordArray);
          for (uint32_t i = 0; i < oldKeywordArray.Length(); i++)
            if (!newKeywordArray.Contains(oldKeywordArray[i]))
              newKeywordArray.AppendElement(oldKeywordArray[i]);
          nsAutoCString newKeywords;
          for (uint32_t i = 0; i < newKeywordArray.Length(); i++) {
            if (i) newKeywords.Append(' ');
            newKeywords.Append(newKeywordArray[i]);
          }
          m_newMsgHdr->SetStringProperty("keywords", newKeywords);
        }
        for (uint32_t i = 0; i < m_customDBHeaders.Length(); i++) {
          if (m_customDBHeaderValues[i].length)
            m_newMsgHdr->SetStringProperty(
                m_customDBHeaders[i].get(),
                nsDependentCString(m_customDBHeaderValues[i].value));
          // The received header is accumulated separately
          if (m_customDBHeaders[i].EqualsLiteral("received") &&
              !m_receivedValue.IsEmpty())
            m_newMsgHdr->SetStringProperty("received", m_receivedValue);
        }
        if (content_type) {
          char* substring = PL_strstr(content_type->value, "charset");
          if (substring) {
            char* charset = PL_strchr(substring, '=');
            if (charset) {
              charset++;
              /* strip leading whitespace and double-quote */
              while (*charset && (IS_SPACE(*charset) || '\"' == *charset))
                charset++;
              /* strip trailing whitespace and double-quote */
              char* end = charset;
              while (*end && !IS_SPACE(*end) && '\"' != *end && ';' != *end)
                end++;
              if (*charset) {
                if (*end != '\0') {
                  // if we're not at the very end of the line, we need
                  // to generate a new string without the trailing crud
                  nsAutoCString rawCharSet;
                  rawCharSet.Assign(charset, end - charset);
                  m_newMsgHdr->SetCharset(rawCharSet.get());
                } else {
                  m_newMsgHdr->SetCharset(charset);
                }
              }
            }
          }
          substring = PL_strcasestr(content_type->value, "multipart/mixed");
          if (substring) {
            uint32_t newFlags;
            m_newMsgHdr->OrFlags(nsMsgMessageFlags::Attachment, &newFlags);
          }
        }
      }
    } else {
      NS_ASSERTION(false, "error creating message header");
      rv = NS_ERROR_OUT_OF_MEMORY;
    }
  } else
    rv = NS_OK;

  // ### why is this stuff const?
  char* tmp = (char*)to.value;
  PR_Free(tmp);
  tmp = (char*)cc.value;
  PR_Free(tmp);

  return rv;
}

nsParseNewMailState::nsParseNewMailState() : m_disableFilters(false) {
  m_numNotNewMessages = 0;
}

NS_IMPL_ISUPPORTS_INHERITED(nsParseNewMailState, nsMsgMailboxParser,
                            nsIMsgFilterHitNotify)

nsresult nsParseNewMailState::Init(nsIMsgFolder* serverFolder,
                                   nsIMsgFolder* downloadFolder,
                                   nsIMsgWindow* aMsgWindow, nsIMsgDBHdr* aHdr,
                                   nsIOutputStream* aOutputStream) {
  NS_ENSURE_ARG_POINTER(serverFolder);
  nsresult rv;
  Clear();
  m_rootFolder = serverFolder;
  m_msgWindow = aMsgWindow;
  m_downloadFolder = downloadFolder;

  m_newMsgHdr = aHdr;
  m_outputStream = aOutputStream;
  // the new mail parser isn't going to get the stream input, it seems, so we
  // can't use the OnStartRequest mechanism the mailbox parser uses. So, let's
  // open the db right now.
  nsCOMPtr<nsIMsgDBService> msgDBService =
      do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
  if (msgDBService && !m_mailDB)
    rv = msgDBService->OpenFolderDB(downloadFolder, false,
                                    getter_AddRefs(m_mailDB));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = serverFolder->GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv)) {
    nsString serverName;
    server->GetPrettyName(serverName);
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Local) Detected new local messages on account '%s'",
             NS_ConvertUTF16toUTF8(serverName).get()));
    rv = server->GetFilterList(aMsgWindow, getter_AddRefs(m_filterList));

    if (m_filterList) rv = server->ConfigureTemporaryFilters(m_filterList);
    // check if this server defers to another server, in which case
    // we'll use that server's filters as well.
    nsCOMPtr<nsIMsgFolder> deferredToRootFolder;
    server->GetRootMsgFolder(getter_AddRefs(deferredToRootFolder));
    if (serverFolder != deferredToRootFolder) {
      nsCOMPtr<nsIMsgIncomingServer> deferredToServer;
      deferredToRootFolder->GetServer(getter_AddRefs(deferredToServer));
      if (deferredToServer)
        deferredToServer->GetFilterList(
            aMsgWindow, getter_AddRefs(m_deferredToServerFilterList));
    }
  }
  m_disableFilters = false;
  return NS_OK;
}

nsParseNewMailState::~nsParseNewMailState() {
  if (m_mailDB) m_mailDB->Close(true);
  if (m_backupMailDB) m_backupMailDB->ForceClosed();
#ifdef DOING_JSFILTERS
  JSFilter_cleanup();
#endif
}

// not an IMETHOD so we don't need to do error checking or return an error.
// We only have one caller.
void nsParseNewMailState::GetMsgWindow(nsIMsgWindow** aMsgWindow) {
  NS_IF_ADDREF(*aMsgWindow = m_msgWindow);
}

// This gets called for every message because libnet calls IncorporateBegin,
// IncorporateWrite (once or more), and IncorporateComplete for every message.
void nsParseNewMailState::DoneParsingFolder(nsresult status) {
  PublishMsgHeader(nullptr);
  if (m_mailDB)  // finished parsing, so flush db folder info
    UpdateDBFolderInfo();
}

void nsParseNewMailState::OnNewMessage(nsIMsgWindow* msgWindow) {}

void nsParseNewMailState::PublishMsgHeader(nsIMsgWindow* msgWindow) {
  bool moved = false;
  FinishHeader();

  if (m_newMsgHdr) {
    uint32_t newFlags, oldFlags;
    m_newMsgHdr->GetFlags(&oldFlags);
    if (!(oldFlags &
          nsMsgMessageFlags::Read))  // don't mark read messages as new.
      m_newMsgHdr->OrFlags(nsMsgMessageFlags::New, &newFlags);

    if (!m_disableFilters) {
      nsCOMPtr<nsIMsgIncomingServer> server;
      nsresult rv = m_rootFolder->GetServer(getter_AddRefs(server));
      NS_ENSURE_SUCCESS_VOID(rv);
      int32_t duplicateAction;
      server->GetIncomingDuplicateAction(&duplicateAction);
      if (duplicateAction != nsIMsgIncomingServer::keepDups) {
        bool isDup;
        server->IsNewHdrDuplicate(m_newMsgHdr, &isDup);
        if (isDup) {
          // we want to do something similar to applying filter hits.
          // if a dup is marked read, it shouldn't trigger biff.
          // Same for deleting it or moving it to trash.
          switch (duplicateAction) {
            case nsIMsgIncomingServer::deleteDups: {
              nsCOMPtr<nsIMsgPluggableStore> msgStore;
              nsresult rv =
                  m_downloadFolder->GetMsgStore(getter_AddRefs(msgStore));
              if (NS_SUCCEEDED(rv)) {
                rv = msgStore->DiscardNewMessage(m_outputStream, m_newMsgHdr);
                if (NS_FAILED(rv))
                  m_rootFolder->ThrowAlertMsg("dupDeleteFolderTruncateFailed",
                                              msgWindow);
              }
              m_mailDB->RemoveHeaderMdbRow(m_newMsgHdr);
            } break;

            case nsIMsgIncomingServer::moveDupsToTrash: {
              nsCOMPtr<nsIMsgFolder> trash;
              GetTrashFolder(getter_AddRefs(trash));
              if (trash) {
                uint32_t newFlags;
                bool msgMoved;
                m_newMsgHdr->AndFlags(~nsMsgMessageFlags::New, &newFlags);
                nsCOMPtr<nsIMsgPluggableStore> msgStore;
                rv = m_downloadFolder->GetMsgStore(getter_AddRefs(msgStore));
                if (NS_SUCCEEDED(rv))
                  rv = msgStore->MoveNewlyDownloadedMessage(m_newMsgHdr, trash,
                                                            &msgMoved);
                if (NS_SUCCEEDED(rv) && !msgMoved) {
                  rv = MoveIncorporatedMessage(m_newMsgHdr, m_mailDB, trash,
                                               nullptr, msgWindow);
                  if (NS_SUCCEEDED(rv))
                    rv = m_mailDB->RemoveHeaderMdbRow(m_newMsgHdr);
                }
                if (NS_FAILED(rv))
                  NS_WARNING("moveDupsToTrash failed for some reason.");
              }
            } break;
            case nsIMsgIncomingServer::markDupsRead:
              MarkFilteredMessageRead(m_newMsgHdr);
              break;
          }
          int32_t numNewMessages;
          m_downloadFolder->GetNumNewMessages(false, &numNewMessages);
          m_downloadFolder->SetNumNewMessages(numNewMessages - 1);

          m_newMsgHdr = nullptr;
          return;
        }
      }

      ApplyFilters(&moved, msgWindow);
    }
    if (!moved) {
      if (m_mailDB) {
        m_mailDB->AddNewHdrToDB(m_newMsgHdr, true);
        nsCOMPtr<nsIMsgFolderNotificationService> notifier(
            do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
        if (notifier) notifier->NotifyMsgAdded(m_newMsgHdr);
        // mark the header as not yet reported classified
        nsMsgKey msgKey;
        m_newMsgHdr->GetMessageKey(&msgKey);
        m_downloadFolder->OrProcessingFlags(
            msgKey, nsMsgProcessingFlags::NotReportedClassified);
      }
    }  // if it was moved by imap filter, m_parseMsgState->m_newMsgHdr ==
       // nullptr
    m_newMsgHdr = nullptr;
  }
}

nsresult nsParseNewMailState::GetTrashFolder(nsIMsgFolder** pTrashFolder) {
  nsresult rv = NS_ERROR_UNEXPECTED;
  if (!pTrashFolder) return NS_ERROR_NULL_POINTER;

  if (m_downloadFolder) {
    nsCOMPtr<nsIMsgIncomingServer> incomingServer;
    m_downloadFolder->GetServer(getter_AddRefs(incomingServer));
    nsCOMPtr<nsIMsgFolder> rootMsgFolder;
    incomingServer->GetRootMsgFolder(getter_AddRefs(rootMsgFolder));
    if (rootMsgFolder) {
      rv = rootMsgFolder->GetFolderWithFlags(nsMsgFolderFlags::Trash,
                                             pTrashFolder);
      if (!*pTrashFolder) rv = NS_ERROR_FAILURE;
    }
  }
  return rv;
}

void nsParseNewMailState::ApplyFilters(bool* pMoved, nsIMsgWindow* msgWindow) {
  m_msgMovedByFilter = m_msgCopiedByFilter = false;

  if (!m_disableFilters) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr = m_newMsgHdr;
    nsCOMPtr<nsIMsgFolder> downloadFolder = m_downloadFolder;
    if (m_rootFolder) {
      if (!downloadFolder)
        m_rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                         getter_AddRefs(downloadFolder));
      if (downloadFolder) downloadFolder->GetURI(m_inboxUri);
      char* headers = m_headers.GetBuffer();
      uint32_t headersSize = m_headers.GetBufferPos();
      nsAutoCString tok;
      msgHdr->GetStringProperty("storeToken", tok);
      if (m_filterList) {
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Local) Running filters on 1 message (%s)", tok.get()));
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Local) Using filters from the original account"));
        (void)m_filterList->ApplyFiltersToHdr(
            nsMsgFilterType::InboxRule, msgHdr, downloadFolder, m_mailDB,
            nsDependentCSubstring(headers, headersSize), this, msgWindow);
      }
      if (!m_msgMovedByFilter && m_deferredToServerFilterList) {
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Local) Running filters on 1 message (%s)", tok.get()));
        MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                ("(Local) Using filters from the deferred to account"));
        (void)m_deferredToServerFilterList->ApplyFiltersToHdr(
            nsMsgFilterType::InboxRule, msgHdr, downloadFolder, m_mailDB,
            nsDependentCSubstring(headers, headersSize), this, msgWindow);
      }
    }
  }
  if (pMoved) *pMoved = m_msgMovedByFilter;
}

NS_IMETHODIMP nsParseNewMailState::ApplyFilterHit(nsIMsgFilter* filter,
                                                  nsIMsgWindow* msgWindow,
                                                  bool* applyMore) {
  NS_ENSURE_ARG_POINTER(filter);
  NS_ENSURE_ARG_POINTER(applyMore);

  uint32_t newFlags;
  nsresult rv = NS_OK;

  *applyMore = true;

  nsCOMPtr<nsIMsgDBHdr> msgHdr = m_newMsgHdr;

  nsTArray<RefPtr<nsIMsgRuleAction>> filterActionList;
  rv = filter->GetSortedActionList(filterActionList);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t numActions = filterActionList.Length();

  nsCString msgId;
  msgHdr->GetMessageId(msgId);
  nsMsgKey msgKey;
  msgHdr->GetMessageKey(&msgKey);
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Local) Applying %" PRIu32
           " filter actions on message with key %" PRIu32,
           numActions, msgKeyToInt(msgKey)));
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Debug,
          ("(Local) Message ID: %s", msgId.get()));

  bool loggingEnabled = false;
  if (m_filterList && numActions)
    m_filterList->GetLoggingEnabled(&loggingEnabled);

  bool msgIsNew = true;
  nsresult finalResult = NS_OK;  // result of all actions
  for (uint32_t actionIndex = 0; actionIndex < numActions && *applyMore;
       actionIndex++) {
    nsCOMPtr<nsIMsgRuleAction> filterAction(filterActionList[actionIndex]);
    if (!filterAction) {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,
              ("(Local) Filter action at index %" PRIu32 " invalid, skipping",
               actionIndex));
      continue;
    }

    nsMsgRuleActionType actionType;
    if (NS_SUCCEEDED(filterAction->GetType(&actionType))) {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Local) Running filter action at index %" PRIu32
               ", action type = %i",
               actionIndex, actionType));
      if (loggingEnabled) (void)filter->LogRuleHit(filterAction, msgHdr);

      nsCString actionTargetFolderUri;
      if (actionType == nsMsgFilterAction::MoveToFolder ||
          actionType == nsMsgFilterAction::CopyToFolder) {
        rv = filterAction->GetTargetFolderUri(actionTargetFolderUri);
        if (NS_FAILED(rv) || actionTargetFolderUri.IsEmpty()) {
          // clang-format off
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Warning,
                  ("(Local) Target URI for Copy/Move action is empty, skipping"));
          // clang-format on
          NS_ASSERTION(false, "actionTargetFolderUri is empty");
          continue;
        }
      }

      rv = NS_OK;  // result of the current action
      switch (actionType) {
        case nsMsgFilterAction::Delete: {
          nsCOMPtr<nsIMsgFolder> trash;
          // set value to trash folder
          rv = GetTrashFolder(getter_AddRefs(trash));
          if (NS_SUCCEEDED(rv) && trash) {
            rv = trash->GetURI(actionTargetFolderUri);
            if (NS_FAILED(rv)) break;
          }

          rv = msgHdr->OrFlags(nsMsgMessageFlags::Read,
                               &newFlags);  // mark read in trash.
          msgIsNew = false;
        }
          // FALLTHROUGH
          [[fallthrough]];
        case nsMsgFilterAction::MoveToFolder: {
          // If moving to a different folder, do it.
          if (!actionTargetFolderUri.IsEmpty() &&
              !m_inboxUri.Equals(actionTargetFolderUri,
                                 nsCaseInsensitiveCStringComparator)) {
            nsCOMPtr<nsIMsgFolder> destIFolder;
            // XXX TODO: why do we create the folder here, while we do not in
            // the Copy action?
            rv = GetOrCreateFolder(actionTargetFolderUri,
                                   getter_AddRefs(destIFolder));
            if (NS_FAILED(rv)) {
              MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                      ("(Local) Target Folder for Move action does not exist"));
              break;
            }
            bool msgMoved = false;
            // If we're moving to an imap folder, or this message has already
            // has a pending copy action, use the imap coalescer so that
            // we won't truncate the inbox before the copy fires.
            if (m_msgCopiedByFilter ||
                StringBeginsWith(actionTargetFolderUri, "imap:"_ns)) {
              if (!m_moveCoalescer)
                m_moveCoalescer =
                    new nsImapMoveCoalescer(m_downloadFolder, m_msgWindow);
              NS_ENSURE_TRUE(m_moveCoalescer, NS_ERROR_OUT_OF_MEMORY);
              rv = m_moveCoalescer->AddMove(destIFolder, msgKey);
              msgIsNew = false;
              if (NS_FAILED(rv)) break;
            } else {
              nsCOMPtr<nsIMsgPluggableStore> msgStore;
              rv = m_downloadFolder->GetMsgStore(getter_AddRefs(msgStore));
              if (NS_SUCCEEDED(rv))
                rv = msgStore->MoveNewlyDownloadedMessage(msgHdr, destIFolder,
                                                          &msgMoved);
              if (NS_SUCCEEDED(rv) && !msgMoved)
                rv = MoveIncorporatedMessage(msgHdr, m_mailDB, destIFolder,
                                             filter, msgWindow);
              m_msgMovedByFilter = NS_SUCCEEDED(rv);
              if (!m_msgMovedByFilter /* == NS_FAILED(err) */) {
                // XXX: Invoke MSG_LOG_TO_CONSOLE once bug 1135265 lands.
                if (loggingEnabled) {
                  (void)filter->LogRuleHitFail(filterAction, msgHdr, rv,
                                               "filterFailureMoveFailed"_ns);
                }
              }
            }
          } else {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                    ("(Local) Target folder is the same as source folder, "
                     "skipping"));
            rv = NS_OK;
          }
          *applyMore = false;
        } break;
        case nsMsgFilterAction::CopyToFolder: {
          nsCString uri;
          rv = m_rootFolder->GetURI(uri);

          if (!actionTargetFolderUri.IsEmpty() &&
              !actionTargetFolderUri.Equals(uri)) {
            nsCOMPtr<nsIMsgFolder> dstFolder;
            nsCOMPtr<nsIMsgCopyService> copyService;
            rv = GetExistingFolder(actionTargetFolderUri,
                                   getter_AddRefs(dstFolder));
            if (NS_FAILED(rv)) {
              // Let's show a more specific warning.
              MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                      ("(Local) Target Folder for Copy action does not exist"));
              NS_WARNING("Target Folder does not exist.");
              break;
            }

            copyService = do_GetService(
                "@mozilla.org/messenger/messagecopyservice;1", &rv);
            if (NS_SUCCEEDED(rv))
              rv = copyService->CopyMessages(m_downloadFolder, {&*msgHdr},
                                             dstFolder, false, nullptr,
                                             msgWindow, false);

            if (NS_FAILED(rv)) {
              // XXX: Invoke MSG_LOG_TO_CONSOLE once bug 1135265 lands.
              if (loggingEnabled) {
                (void)filter->LogRuleHitFail(filterAction, msgHdr, rv,
                                             "filterFailureCopyFailed"_ns);
              }
            } else
              m_msgCopiedByFilter = true;
          } else {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
                    ("(Local) Target folder is the same as source folder, "
                     "skipping"));
            break;
          }
        } break;
        case nsMsgFilterAction::MarkRead:
          msgIsNew = false;
          MarkFilteredMessageRead(msgHdr);
          rv = NS_OK;
          break;
        case nsMsgFilterAction::MarkUnread:
          msgIsNew = true;
          MarkFilteredMessageUnread(msgHdr);
          rv = NS_OK;
          break;
        case nsMsgFilterAction::KillThread:
          rv = msgHdr->SetUint32Property("ProtoThreadFlags",
                                         nsMsgMessageFlags::Ignored);
          break;
        case nsMsgFilterAction::KillSubthread:
          rv = msgHdr->OrFlags(nsMsgMessageFlags::Ignored, &newFlags);
          break;
        case nsMsgFilterAction::WatchThread:
          rv = msgHdr->OrFlags(nsMsgMessageFlags::Watched, &newFlags);
          break;
        case nsMsgFilterAction::MarkFlagged: {
          rv = m_downloadFolder->MarkMessagesFlagged({&*msgHdr}, true);
        } break;
        case nsMsgFilterAction::ChangePriority: {
          nsMsgPriorityValue filterPriority;
          filterAction->GetPriority(&filterPriority);
          rv = msgHdr->SetPriority(filterPriority);
        } break;
        case nsMsgFilterAction::AddTag: {
          nsCString keyword;
          filterAction->GetStrValue(keyword);
          rv = m_downloadFolder->AddKeywordsToMessages({&*msgHdr}, keyword);
          break;
        }
        case nsMsgFilterAction::JunkScore: {
          nsAutoCString junkScoreStr;
          int32_t junkScore;
          filterAction->GetJunkScore(&junkScore);
          junkScoreStr.AppendInt(junkScore);
          if (junkScore == nsIJunkMailPlugin::IS_SPAM_SCORE) msgIsNew = false;
          rv = msgHdr->SetStringProperty("junkscore", junkScoreStr);
          msgHdr->SetStringProperty("junkscoreorigin", "filter"_ns);
        } break;
        case nsMsgFilterAction::Forward: {
          nsCString forwardTo;
          filterAction->GetStrValue(forwardTo);
          m_forwardTo.AppendElement(forwardTo);
          m_msgToForwardOrReply = msgHdr;
          rv = NS_OK;
        } break;
        case nsMsgFilterAction::Reply: {
          nsCString replyTemplateUri;
          filterAction->GetStrValue(replyTemplateUri);
          m_replyTemplateUri.AppendElement(replyTemplateUri);
          m_msgToForwardOrReply = msgHdr;
          m_ruleAction = filterAction;
          m_filter = filter;
          rv = NS_OK;
        } break;
        case nsMsgFilterAction::DeleteFromPop3Server: {
          nsCOMPtr<nsIMsgFolder> downloadFolder;
          msgHdr->GetFolder(getter_AddRefs(downloadFolder));
          nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
              do_QueryInterface(downloadFolder, &rv);
          if (NS_FAILED(rv) || !localFolder) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                    ("(Local) Couldn't find local mail folder"));
            break;
          }
          // This action ignores the deleteMailLeftOnServer preference
          rv = localFolder->MarkMsgsOnPop3Server({&*msgHdr}, POP3_FORCE_DEL);

          // If this is just a header, throw it away. It's useless now
          // that the server copy is being deleted.
          uint32_t flags = 0;
          msgHdr->GetFlags(&flags);
          if (flags & nsMsgMessageFlags::Partial) {
            m_msgMovedByFilter = true;
            msgIsNew = false;
          }
        } break;
        case nsMsgFilterAction::FetchBodyFromPop3Server: {
          nsCOMPtr<nsIMsgFolder> downloadFolder;
          msgHdr->GetFolder(getter_AddRefs(downloadFolder));
          nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
              do_QueryInterface(downloadFolder, &rv);
          if (NS_FAILED(rv) || !localFolder) {
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                    ("(Local) Couldn't find local mail folder"));
            break;
          }
          uint32_t flags = 0;
          msgHdr->GetFlags(&flags);
          if (flags & nsMsgMessageFlags::Partial) {
            rv = localFolder->MarkMsgsOnPop3Server({&*msgHdr}, POP3_FETCH_BODY);
            // Don't add this header to the DB, we're going to replace it
            // with the full message.
            m_msgMovedByFilter = true;
            msgIsNew = false;
            // Don't do anything else in this filter, wait until we
            // have the full message.
            *applyMore = false;
          }
        } break;

        case nsMsgFilterAction::StopExecution: {
          // don't apply any more filters
          *applyMore = false;
          rv = NS_OK;
        } break;

        case nsMsgFilterAction::Custom: {
          nsCOMPtr<nsIMsgFilterCustomAction> customAction;
          rv = filterAction->GetCustomAction(getter_AddRefs(customAction));
          if (NS_FAILED(rv)) break;

          nsAutoCString value;
          rv = filterAction->GetStrValue(value);
          if (NS_FAILED(rv)) break;

          rv = customAction->ApplyAction({&*msgHdr}, value, nullptr,
                                         nsMsgFilterType::InboxRule, msgWindow);
        } break;

        default:
          // XXX should not be reached. Check in debug build.
          NS_ERROR("unexpected filter action");
          rv = NS_ERROR_UNEXPECTED;
          break;
      }
    }
    if (NS_FAILED(rv)) {
      finalResult = rv;
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
              ("(Local) Action execution failed with error: %" PRIx32,
               static_cast<uint32_t>(rv)));
      if (loggingEnabled) {
        (void)filter->LogRuleHitFail(filterAction, msgHdr, rv,
                                     "filterFailureAction"_ns);
      }
    } else {
      MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
              ("(Local) Action execution succeeded"));
    }
  }
  if (!msgIsNew) {
    int32_t numNewMessages;
    m_downloadFolder->GetNumNewMessages(false, &numNewMessages);
    if (numNewMessages > 0)
      m_downloadFolder->SetNumNewMessages(numNewMessages - 1);
    m_numNotNewMessages++;
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Local) Message will not be marked new"));
  }
  MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
          ("(Local) Finished executing actions"));
  return finalResult;
}

// this gets run in a second pass, after apply filters to a header.
nsresult nsParseNewMailState::ApplyForwardAndReplyFilter(
    nsIMsgWindow* msgWindow) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgIncomingServer> server;

  uint32_t i;
  uint32_t count = m_forwardTo.Length();
  nsMsgKey msgKey;
  if (count > 0 && m_msgToForwardOrReply) {
    m_msgToForwardOrReply->GetMessageKey(&msgKey);
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Local) Forwarding message with key %" PRIu32 " to %" PRIu32
             " addresses",
             msgKeyToInt(msgKey), count));
  }

  for (i = 0; i < count; i++) {
    if (!m_forwardTo[i].IsEmpty()) {
      nsAutoString forwardStr;
      CopyASCIItoUTF16(m_forwardTo[i], forwardStr);
      rv = m_rootFolder->GetServer(getter_AddRefs(server));
      NS_ENSURE_SUCCESS(rv, rv);
      {
        nsCOMPtr<nsIMsgComposeService> compService =
            do_GetService("@mozilla.org/messengercompose;1", &rv);
        NS_ENSURE_SUCCESS(rv, rv);
        rv = compService->ForwardMessage(
            forwardStr, m_msgToForwardOrReply, msgWindow, server,
            nsIMsgComposeService::kForwardAsDefault);
        if (NS_FAILED(rv))
          MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                  ("(Local) Forwarding failed"));
      }
    }
  }
  m_forwardTo.Clear();

  count = m_replyTemplateUri.Length();
  if (count > 0 && m_msgToForwardOrReply) {
    MOZ_LOG(FILTERLOGMODULE, LogLevel::Info,
            ("(Local) Replying message with key %" PRIu32 " to %" PRIu32
             " addresses",
             msgKeyToInt(msgKey), count));
  }

  for (i = 0; i < count; i++) {
    if (!m_replyTemplateUri[i].IsEmpty()) {
      // copy this and truncate the original, so we don't accidentally re-use it
      // on the next hdr.
      rv = m_rootFolder->GetServer(getter_AddRefs(server));
      if (server) {
        nsCOMPtr<nsIMsgComposeService> compService =
            do_GetService("@mozilla.org/messengercompose;1");
        if (compService) {
          rv = compService->ReplyWithTemplate(
              m_msgToForwardOrReply, m_replyTemplateUri[i], msgWindow, server);
          if (NS_FAILED(rv)) {
            NS_WARNING("ReplyWithTemplate failed");
            MOZ_LOG(FILTERLOGMODULE, LogLevel::Error,
                    ("(Local) Replying failed"));
            if (rv == NS_ERROR_ABORT) {
              (void)m_filter->LogRuleHitFail(
                  m_ruleAction, m_msgToForwardOrReply, rv,
                  "filterFailureSendingReplyAborted"_ns);
            } else {
              (void)m_filter->LogRuleHitFail(
                  m_ruleAction, m_msgToForwardOrReply, rv,
                  "filterFailureSendingReplyError"_ns);
            }
          }
        }
      }
    }
  }
  m_replyTemplateUri.Clear();
  m_msgToForwardOrReply = nullptr;
  return rv;
}

void nsParseNewMailState::MarkFilteredMessageRead(nsIMsgDBHdr* msgHdr) {
  m_downloadFolder->MarkMessagesRead({msgHdr}, true);
}

void nsParseNewMailState::MarkFilteredMessageUnread(nsIMsgDBHdr* msgHdr) {
  uint32_t newFlags;
  if (m_mailDB) {
    nsMsgKey msgKey;
    msgHdr->GetMessageKey(&msgKey);
    m_mailDB->AddToNewList(msgKey);
  } else {
    msgHdr->OrFlags(nsMsgMessageFlags::New, &newFlags);
  }
  m_downloadFolder->MarkMessagesRead({msgHdr}, false);
}

nsresult nsParseNewMailState::EndMsgDownload() {
  if (m_moveCoalescer) m_moveCoalescer->PlaybackMoves();

  // need to do this for all folders that had messages filtered into them
  uint32_t serverCount = m_filterTargetFolders.Count();
  nsresult rv;
  nsCOMPtr<nsIMsgMailSession> session =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  if (NS_SUCCEEDED(rv) && session)  // don't use NS_ENSURE_SUCCESS here - we
                                    // need to release semaphore below
  {
    for (uint32_t index = 0; index < serverCount; index++) {
      bool folderOpen;
      session->IsFolderOpenInWindow(m_filterTargetFolders[index], &folderOpen);
      if (!folderOpen) {
        uint32_t folderFlags;
        m_filterTargetFolders[index]->GetFlags(&folderFlags);
        if (!(folderFlags &
              (nsMsgFolderFlags::Trash | nsMsgFolderFlags::Inbox))) {
          bool filtersRun;
          m_filterTargetFolders[index]->CallFilterPlugins(nullptr, &filtersRun);
          if (!filtersRun)
            m_filterTargetFolders[index]->SetMsgDatabase(nullptr);
        }
      }
    }
  }
  m_filterTargetFolders.Clear();
  return rv;
}

nsresult nsParseNewMailState::AppendMsgFromStream(nsIInputStream* fileStream,
                                                  nsIMsgDBHdr* aHdr,
                                                  nsIMsgFolder* destFolder) {
  nsCOMPtr<nsIMsgPluggableStore> store;
  nsCOMPtr<nsIOutputStream> destOutputStream;
  nsresult rv = destFolder->GetMsgStore(getter_AddRefs(store));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = store->GetNewMsgOutputStream(destFolder, &aHdr,
                                    getter_AddRefs(destOutputStream));
  NS_ENSURE_SUCCESS(rv, rv);

  uint64_t bytesCopied;
  rv = SyncCopyStream(fileStream, destOutputStream, bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = store->FinishNewMessage(destOutputStream, aHdr);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

/*
 * Moves message pointed to by mailHdr into folder destIFolder.
 * After successful move mailHdr is no longer usable by the caller.
 */
nsresult nsParseNewMailState::MoveIncorporatedMessage(nsIMsgDBHdr* mailHdr,
                                                      nsIMsgDatabase* sourceDB,
                                                      nsIMsgFolder* destIFolder,
                                                      nsIMsgFilter* filter,
                                                      nsIMsgWindow* msgWindow) {
  NS_ENSURE_ARG_POINTER(destIFolder);
  nsresult rv = NS_OK;

  // check if the destination is a real folder (by checking for null parent)
  // and if it can file messages (e.g., servers or news folders can't file
  // messages). Or read only imap folders...
  bool canFileMessages = true;
  nsCOMPtr<nsIMsgFolder> parentFolder;
  destIFolder->GetParent(getter_AddRefs(parentFolder));
  if (parentFolder) destIFolder->GetCanFileMessages(&canFileMessages);
  if (!parentFolder || !canFileMessages) {
    if (filter) {
      filter->SetEnabled(false);
      // we need to explicitly save the filter file.
      if (m_filterList) m_filterList->SaveToDefaultFile();
      destIFolder->ThrowAlertMsg("filterDisabled", msgWindow);
    }
    return NS_MSG_NOT_A_MAIL_FOLDER;
  }

  uint32_t messageLength;
  mailHdr->GetMessageSize(&messageLength);

  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(destIFolder);
  if (localFolder) {
    bool destFolderTooBig = true;
    rv = localFolder->WarnIfLocalFileTooBig(msgWindow, messageLength,
                                            &destFolderTooBig);
    if (NS_FAILED(rv) || destFolderTooBig)
      return NS_MSG_ERROR_WRITING_MAIL_FOLDER;
  }

  nsCOMPtr<nsISupports> myISupports =
      do_QueryInterface(static_cast<nsIMsgParseMailMsgState*>(this));

  // Make sure no one else is writing into this folder
  if (NS_FAILED(rv = destIFolder->AcquireSemaphore(myISupports))) {
    destIFolder->ThrowAlertMsg("filterFolderDeniedLocked", msgWindow);
    return rv;
  }
  nsCOMPtr<nsIInputStream> inputStream;
  rv =
      m_downloadFolder->GetLocalMsgStream(mailHdr, getter_AddRefs(inputStream));
  if (NS_FAILED(rv)) {
    NS_ERROR("couldn't get source msg input stream in move filter");
    destIFolder->ReleaseSemaphore(myISupports);
    return NS_MSG_FOLDER_UNREADABLE;  // ### dmb
  }

  nsCOMPtr<nsIMsgDatabase> destMailDB;

  if (!localFolder) {
    destIFolder->ReleaseSemaphore(myISupports);
    return NS_MSG_POP_FILTER_TARGET_ERROR;
  }

  // don't force upgrade in place - open the db here before we start writing to
  // the destination file because XP_Stat can return file size including bytes
  // written...
  rv = localFolder->GetDatabaseWOReparse(getter_AddRefs(destMailDB));
  NS_WARNING_ASSERTION(destMailDB && NS_SUCCEEDED(rv),
                       "failed to open mail db parsing folder");
  nsCOMPtr<nsIMsgDBHdr> newHdr;

  if (destMailDB)
    rv = destMailDB->CopyHdrFromExistingHdr(m_new_key, mailHdr, true,
                                            getter_AddRefs(newHdr));
  if (NS_SUCCEEDED(rv) && !newHdr) rv = NS_ERROR_UNEXPECTED;

  if (NS_FAILED(rv)) {
    destIFolder->ThrowAlertMsg("filterFolderHdrAddFailed", msgWindow);
  } else {
    rv = AppendMsgFromStream(inputStream, newHdr, destIFolder);
    if (NS_FAILED(rv))
      destIFolder->ThrowAlertMsg("filterFolderWriteFailed", msgWindow);
  }

  if (NS_FAILED(rv)) {
    if (destMailDB) destMailDB->Close(true);

    destIFolder->ReleaseSemaphore(myISupports);

    return NS_MSG_ERROR_WRITING_MAIL_FOLDER;
  }

  bool movedMsgIsNew = false;
  // if we have made it this far then the message has successfully been written
  // to the new folder now add the header to the destMailDB.

  uint32_t newFlags;
  newHdr->GetFlags(&newFlags);
  nsMsgKey msgKey;
  newHdr->GetMessageKey(&msgKey);
  if (!(newFlags & nsMsgMessageFlags::Read)) {
    nsCString junkScoreStr;
    (void)newHdr->GetStringProperty("junkscore", junkScoreStr);
    if (atoi(junkScoreStr.get()) == nsIJunkMailPlugin::IS_HAM_SCORE) {
      newHdr->OrFlags(nsMsgMessageFlags::New, &newFlags);
      destMailDB->AddToNewList(msgKey);
      movedMsgIsNew = true;
    }
  }
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) notifier->NotifyMsgAdded(newHdr);
  // mark the header as not yet reported classified
  destIFolder->OrProcessingFlags(msgKey,
                                 nsMsgProcessingFlags::NotReportedClassified);
  m_msgToForwardOrReply = newHdr;

  if (movedMsgIsNew) destIFolder->SetHasNewMessages(true);
  if (!m_filterTargetFolders.Contains(destIFolder))
    m_filterTargetFolders.AppendObject(destIFolder);

  destIFolder->ReleaseSemaphore(myISupports);

  (void)localFolder->RefreshSizeOnDisk();

  // Notify the message was moved.
  if (notifier) {
    nsCOMPtr<nsIMsgFolder> folder;
    nsresult rv = mailHdr->GetFolder(getter_AddRefs(folder));
    if (NS_SUCCEEDED(rv)) {
      notifier->NotifyMsgUnincorporatedMoved(folder, newHdr);
    } else {
      NS_WARNING("Can't get folder for message that was moved.");
    }
  }

  nsCOMPtr<nsIMsgPluggableStore> store;
  rv = m_downloadFolder->GetMsgStore(getter_AddRefs(store));
  if (store) store->DiscardNewMessage(m_outputStream, mailHdr);
  if (sourceDB) sourceDB->RemoveHeaderMdbRow(mailHdr);

  // update the folder size so we won't reparse.
  UpdateDBFolderInfo(destMailDB);
  destIFolder->UpdateSummaryTotals(true);

  destMailDB->Commit(nsMsgDBCommitType::kLargeCommit);
  return rv;
}
