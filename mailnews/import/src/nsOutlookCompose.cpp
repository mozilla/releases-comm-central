/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ErrorNames.h"
#include "nscore.h"
#include "prthread.h"
#include "nsString.h"
#include "nsMsgUtils.h"
#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIURI.h"
#include "nsMsgI18N.h"
#include "nsIOutputStream.h"
#include "nsIInputStream.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgSend.h"
#include "nsImportEmbeddedImageData.h"
#include "nsCRT.h"
#include "nsOutlookCompose.h"
#include "nsTArray.h"

#include "ImportDebug.h"

#include "nsMsgUtils.h"

#include "nsMsgMessageFlags.h"
#include "nsMsgLocalFolderHdrs.h"

#include "mozilla/Components.h"
#include "mozilla/SpinEventLoopUntil.h"

// Escape lines starting with "From ", ">From ", etc. in a buffer.
nsresult EscapeFromSpaceLine(nsIOutputStream* outputStream, char* start,
                             const char* end);
bool IsAFromSpaceLine(char* start, const char* end);

#ifdef IMPORT_DEBUG
static const char* p_test_headers =
    "Received: from netppl.invalid (IDENT:monitor@get.freebsd.because.microsoftsucks.invalid [209.3.31.115])\n\
 by mail4.sirius.invalid (8.9.1/8.9.1) with SMTP id PAA27232;\n\
 Mon, 17 May 1999 15:27:43 -0700 (PDT)\n\
Message-ID: <ikGD3jRTsKklU.Ggm2HmE2A1Jsqd0p@netppl.invalid>\n\
From: \"adsales@qualityservice.invalid\" <adsales@qualityservice.invalid>\n\
Subject: Re: Your College Diploma (36822)\n\
Date: Mon, 17 May 1999 15:09:29 -0400 (EDT)\n\
MIME-Version: 1.0\n\
Content-Type: TEXT/PLAIN; charset=\"US-ASCII\"\n\
Content-Transfer-Encoding: 7bit\n\
X-UIDL: 19990517.152941\n\
Status: RO";

static const char* p_test_body =
    "Hello world?\n\
";
#else
#  define p_test_headers nullptr
#  define p_test_body nullptr
#endif

#define kWhitespace "\b\t\r\n "

//////////////////////////////////////////////////////////////////////////////////////////////////

// A replacement for SimpleBufferTonyRCopiedTwice round-robin buffer and
// ReadFileState classes
class CCompositionFile {
 public:
  // fifoBuffer is used for memory allocation optimization
  // convertCRs controls if we want to convert standalone CRs to CRLFs
  CCompositionFile(nsIFile* aFile, void* fifoBuffer, uint32_t fifoBufferSize,
                   bool convertCRs = false);

  explicit operator bool() const { return m_fileSize && m_pInputStream; }

  // Reads up to and including the term sequence, or entire file if term isn't
  // found termSize may be used to include NULLs in the terminator sequences.
  // termSize value of -1 means "zero-terminated string" -> size is calculated
  // with strlen
  nsresult ToString(nsCString& dest, const char* term = 0, int termSize = -1);
  nsresult ToStream(nsIOutputStream* dest, const char* term = 0,
                    int termSize = -1);
  char LastChar() { return m_lastChar; }

 private:
  nsCOMPtr<nsIFile> m_pFile;
  nsCOMPtr<nsIInputStream> m_pInputStream;
  int64_t m_fileSize;
  int64_t m_fileReadPos;
  char* m_fifoBuffer;
  uint32_t m_fifoBufferSize;
  char* m_fifoBufferReadPos;     // next character to read
  char* m_fifoBufferWrittenPos;  // if we have read less than buffer size then
                                 // this will show it
  bool m_convertCRs;
  char m_lastChar;

  nsresult EnsureHasDataInBuffer();
  template <class _OutFn>
  nsresult ToDest(_OutFn dest, const char* term, int termSize);
};

//////////////////////////////////////////////////////////////////////////////////////////////////

// First off, a listener
class OutlookSendListener : public nsIMsgSendListener {
 public:
  OutlookSendListener() { m_done = false; }

  // nsISupports interface
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_IMETHOD OnStartSending(const char* aMsgID, uint32_t aMsgSize) {
    return NS_OK;
  }

  NS_IMETHOD OnSendProgress(const char* aMsgID, uint32_t aProgress,
                            uint32_t aProgressMax) {
    return NS_OK;
  }

  NS_IMETHOD OnStatus(const char* aMsgID, const char16_t* aMsg) {
    return NS_OK;
  }

  NS_IMETHOD OnStopSending(const char* aMsgID, nsresult aStatus,
                           const char16_t* aMsg, nsIFile* returnFile) {
    m_done = true;
    m_location = returnFile;
    return NS_OK;
  }

  NS_IMETHOD OnTransportSecurityError(const char* msgID, nsresult status,
                                      nsITransportSecurityInfo* secInfo,
                                      nsACString const& location) {
    return NS_OK;
  }

  NS_IMETHOD OnSendNotPerformed(const char* aMsgID, nsresult aStatus) {
    return NS_OK;
  }

  NS_IMETHOD OnGetDraftFolderURI(const char* aMsgID,
                                 const nsACString& aFolderURI) {
    return NS_OK;
  }

  static nsresult CreateSendListener(nsIMsgSendListener** ppListener);
  void Reset() {
    m_done = false;
    m_location = nullptr;
  }

  bool m_done;
  nsCOMPtr<nsIFile> m_location;

 protected:
  virtual ~OutlookSendListener() {}
};

NS_IMPL_ISUPPORTS(OutlookSendListener, nsIMsgSendListener)

nsresult OutlookSendListener::CreateSendListener(
    nsIMsgSendListener** ppListener) {
  NS_ENSURE_ARG_POINTER(ppListener);
  NS_ADDREF(*ppListener = new OutlookSendListener());
  return NS_OK;
}

/////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

nsOutlookCompose::nsOutlookCompose() {
  m_optimizationBuffer = new char[FILE_IO_BUFFER_SIZE];
}

nsOutlookCompose::~nsOutlookCompose() {
  if (m_pIdentity) {
    nsresult rv = m_pIdentity->ClearAllValues();
    NS_ASSERTION(NS_SUCCEEDED(rv), "failed to clear values");
    if (NS_FAILED(rv)) return;
  }
  delete[] m_optimizationBuffer;
}

MOZ_RUNINIT nsCOMPtr<nsIMsgIdentity> nsOutlookCompose::m_pIdentity = nullptr;

nsresult nsOutlookCompose::CreateIdentity(void) {
  if (m_pIdentity) return NS_OK;

  nsCOMPtr<nsIMsgAccountManager> accMgr =
      mozilla::components::AccountManager::Service();
  nsresult rv = accMgr->CreateIdentity(getter_AddRefs(m_pIdentity));
  nsString name;
  name.AssignLiteral("Import Identity");
  if (m_pIdentity) {
    m_pIdentity->SetFullName(name);
    m_pIdentity->SetEmail("import@service.invalid"_ns);
  }
  return rv;
}

void nsOutlookCompose::ReleaseIdentity() { m_pIdentity = nullptr; }

nsresult nsOutlookCompose::CreateComponents(void) {
  nsresult rv = NS_OK;

  m_pMsgFields = nullptr;
  if (!m_pListener)
    rv = OutlookSendListener::CreateSendListener(getter_AddRefs(m_pListener));

  if (NS_SUCCEEDED(rv)) {
    m_pMsgFields =
        do_CreateInstance("@mozilla.org/messengercompose/composefields;1", &rv);
    if (NS_SUCCEEDED(rv) && m_pMsgFields) {
      // IMPORT_LOG0("nsOutlookCompose - CreateComponents succeeded\n");
      m_pMsgFields->SetForcePlainText(false);
      return NS_OK;
    }
  }

  return NS_ERROR_FAILURE;
}

nsresult nsOutlookCompose::ComposeTheMessage(nsMsgDeliverMode mode,
                                             CMapiMessage& msg,
                                             nsIFile** pMsg) {
  nsresult rv = CreateComponents();
  NS_ENSURE_SUCCESS(rv, rv);
  rv = CreateIdentity();
  NS_ENSURE_SUCCESS(rv, rv);

  // IMPORT_LOG0("Outlook Compose created necessary components\n");

  CMapiMessageHeaders* headers = msg.GetHeaders();

  nsString unival;
  headers->UnfoldValue(CMapiMessageHeaders::hdrFrom, unival,
                       msg.GetBodyCharset());
  m_pMsgFields->SetFrom(unival);
  headers->UnfoldValue(CMapiMessageHeaders::hdrTo, unival,
                       msg.GetBodyCharset());
  m_pMsgFields->SetTo(unival);
  headers->UnfoldValue(CMapiMessageHeaders::hdrSubject, unival,
                       msg.GetBodyCharset());
  m_pMsgFields->SetSubject(unival);
  headers->UnfoldValue(CMapiMessageHeaders::hdrCc, unival,
                       msg.GetBodyCharset());
  m_pMsgFields->SetCc(unival);
  headers->UnfoldValue(CMapiMessageHeaders::hdrReplyTo, unival,
                       msg.GetBodyCharset());
  m_pMsgFields->SetReplyTo(unival);
  m_pMsgFields->SetMessageId(headers->Value(CMapiMessageHeaders::hdrMessageID));

  // We only use those headers that may need to be processed by Thunderbird
  // to create a good rfc822 document, or need to be encoded (like To and Cc).
  // These will replace the originals on import. All the other headers
  // will be copied to the destination unaltered in CopyComposedMessage().

  nsTArray<RefPtr<nsIMsgAttachedFile>> attachments;
  msg.GetAttachments(attachments);

  nsString bodyW;
  bodyW = msg.GetBody();

  nsTArray<RefPtr<nsIMsgEmbeddedImageData>> embeddedObjects;

  if (msg.BodyIsHtml()) {
    for (unsigned int i = 0; i < msg.EmbeddedAttachmentsCount(); i++) {
      nsIURI* uri;
      const char* cid;
      const char* name;
      if (msg.GetEmbeddedAttachmentInfo(i, &uri, &cid, &name)) {
        nsCOMPtr<nsIMsgEmbeddedImageData> imageData =
            new nsImportEmbeddedImageData(uri, nsDependentCString(cid),
                                          nsDependentCString(name));
        embeddedObjects.AppendElement(imageData);
      }
    }
  }

  nsCString bodyA;
  const char* charset = msg.GetBodyCharset();
  nsMsgI18NConvertFromUnicode(
      charset ? nsDependentCString(charset) : EmptyCString(), bodyW, bodyA);

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      mozilla::components::AccountManager::Service();
  nsCOMPtr<nsIImportService> importService =
      mozilla::components::Import::Service();

  // nsIImportService.createRFC822Message creates a runnable and dispatches to
  // the main thread.
  rv = importService->CreateRFC822Message(
      m_pIdentity,   // dummy identity
      m_pMsgFields,  // message fields
      msg.BodyIsHtml() ? "text/html" : "text/plain",
      bodyA,  // body pointer
      mode == nsIMsgSend::nsMsgSaveAsDraft,
      attachments,  // local attachments
      embeddedObjects,
      m_pListener);  // listener

  OutlookSendListener* pListen =
      static_cast<OutlookSendListener*>(m_pListener.get());
  if (NS_FAILED(rv)) {
    nsAutoCString name;
    mozilla::GetErrorName(rv, name);
    IMPORT_LOG1("*** Error, CreateAndSendMessage FAILED: %s\n", name.get());
  } else {
    // Wait for the listener to get done.
    mozilla::SpinEventLoopUntil(
        "nsIImportService.createRFC822Message is async"_ns, [=]() {
          bool shutdownInProgress = false;
          accountManager->GetShutdownInProgress(&shutdownInProgress);
          return pListen->m_done || shutdownInProgress;
        });
  }

  if (pListen->m_location) {
    pListen->m_location->Clone(pMsg);
    rv = NS_OK;
  } else {
    rv = NS_ERROR_FAILURE;
    IMPORT_LOG0("*** Error, Outlook compose unsuccessful\n");
  }

  pListen->Reset();
  return rv;
}

nsresult nsOutlookCompose::CopyComposedMessage(nsIFile* pSrc,
                                               nsIOutputStream* pDst,
                                               CMapiMessage& origMsg) {
  uint32_t written;
  nsresult rv;
  // I'm unsure if we really need the convertCRs feature here.
  // The headers in the file are generated by TB, the body was generated by rtf
  // reader that always used CRLF, and the attachments were processed by TB
  // either... However, I let it stay as it was in the original code.
  CCompositionFile f(pSrc, m_optimizationBuffer, FILE_IO_BUFFER_SIZE, true);
  if (!f) {
    IMPORT_LOG0("*** Error, unexpected zero file size for composed message\n");
    return NS_ERROR_FAILURE;
  }

  // Bug 219269
  // Write out the x-mozilla-status headers.
  char statusLine[50];
  uint32_t msgFlags = 0;
  if (origMsg.IsRead()) msgFlags |= nsMsgMessageFlags::Read;
  if (!origMsg.FullMessageDownloaded()) msgFlags |= nsMsgMessageFlags::Partial;
  if (origMsg.IsForvarded()) msgFlags |= nsMsgMessageFlags::Forwarded;
  if (origMsg.IsReplied()) msgFlags |= nsMsgMessageFlags::Replied;
  if (origMsg.HasAttach()) msgFlags |= nsMsgMessageFlags::Attachment;
  _snprintf(statusLine, sizeof(statusLine),
            X_MOZILLA_STATUS_FORMAT MSG_LINEBREAK, msgFlags & 0xFFFF);
  rv = pDst->Write(statusLine, strlen(statusLine), &written);
  _snprintf(statusLine, sizeof(statusLine),
            X_MOZILLA_STATUS2_FORMAT MSG_LINEBREAK, msgFlags & 0xFFFF0000);
  rv = pDst->Write(statusLine, strlen(statusLine), &written);
  // End Bug 219269

  // well, isn't this a hoot!
  // Read the headers from the new message, get the ones we like
  // and write out only the headers we want from the new message,
  // along with all of the other headers from the "old" message!

  nsCString newHeadersStr;
  rv = f.ToString(newHeadersStr,
                  MSG_LINEBREAK MSG_LINEBREAK);  // Read all the headers
  NS_ENSURE_SUCCESS(rv, rv);
  UpdateHeaders(*origMsg.GetHeaders(),
                CMapiMessageHeaders(newHeadersStr.get()));
  rv = origMsg.GetHeaders()->ToStream(pDst);
  NS_ENSURE_SUCCESS(rv, rv);

  // I use the terminating sequence here to avoid a possible situation when a
  // "From " line gets split over two sequential reads and thus will not be
  // escaped. This is done by reading up to CRLF (one line every time), though
  // it may be slower

  // Here I revert the changes that were made when the multipart/related message
  // was composed in nsMsgSend::ProcessMultipartRelated() - the Content-Ids of
  // attachments were replaced with new ones.
  nsCString line;
  while (NS_SUCCEEDED(f.ToString(line, MSG_LINEBREAK))) {
    EscapeFromSpaceLine(pDst, const_cast<char*>(line.get()),
                        line.get() + line.Length());
  }

  if (f.LastChar() != nsCRT::LF) {
    rv = pDst->Write(MSG_LINEBREAK, 2, &written);
    if (written != 2) rv = NS_ERROR_FAILURE;
  }

  return rv;
}

nsresult nsOutlookCompose::ProcessMessage(nsMsgDeliverMode mode,
                                          CMapiMessage& msg,
                                          nsIOutputStream* pDst) {
  nsCOMPtr<nsIFile> compositionFile;
  nsresult rv = ComposeTheMessage(mode, msg, getter_AddRefs(compositionFile));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = CopyComposedMessage(compositionFile, pDst, msg);
  compositionFile->Remove(false);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error copying composed message to destination mailbox\n");
  }
  return rv;
}

void nsOutlookCompose::UpdateHeader(CMapiMessageHeaders& oldHeaders,
                                    const CMapiMessageHeaders& newHeaders,
                                    CMapiMessageHeaders::SpecialHeader header,
                                    bool addIfAbsent) {
  const char* oldVal = oldHeaders.Value(header);
  if (!addIfAbsent && !oldVal) return;
  const char* newVal = newHeaders.Value(header);
  if (!newVal) return;
  // Bug 145150 - Turn "Content-Type: application/ms-tnef" into "Content-Type:
  // text/plain"
  //              so the body text can be displayed normally (instead of in an
  //              attachment).
  if (header == CMapiMessageHeaders::hdrContentType)
    if (stricmp(newVal, "application/ms-tnef") == 0) newVal = "text/plain";
  // End Bug 145150
  if (oldVal) {
    if (strcmp(oldVal, newVal) == 0) return;
    // Backup the old header value
    nsCString backupHdrName("X-MozillaBackup-");
    backupHdrName += CMapiMessageHeaders::SpecialName(header);
    oldHeaders.SetValue(backupHdrName.get(), oldVal, false);
  }
  // Now replace it with new value
  oldHeaders.SetValue(header, newVal);
}

void nsOutlookCompose::UpdateHeaders(CMapiMessageHeaders& oldHeaders,
                                     const CMapiMessageHeaders& newHeaders) {
  // Well, ain't this a peach?
  // This is rather disgusting but there really isn't much to be done about
  // it....

  // 1. For each "old" header, replace it with the new one if we want,
  // then right it out.
  // 2. Then if we haven't written the "important" new headers, write them out
  // 3. Terminate the headers with an extra eol.

  // Important headers:
  //  "Content-type",
  //  "MIME-Version",
  //  "Content-transfer-encoding"
  // consider "X-Accept-Language"?

  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrContentType);
  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrMimeVersion);
  UpdateHeader(oldHeaders, newHeaders,
               CMapiMessageHeaders::hdrContentTransferEncoding);

  // Other replaced headers (only if they exist):
  //  "From",
  //  "To",
  //  "Subject",
  //  "Reply-to",
  //  "Cc"

  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrFrom, false);
  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrTo, false);
  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrSubject, false);
  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrReplyTo, false);
  UpdateHeader(oldHeaders, newHeaders, CMapiMessageHeaders::hdrCc, false);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

CCompositionFile::CCompositionFile(nsIFile* aFile, void* fifoBuffer,
                                   uint32_t fifoBufferSize, bool convertCRs)
    : m_pFile(aFile),
      m_fileSize(0),
      m_fileReadPos(0),
      m_fifoBuffer(static_cast<char*>(fifoBuffer)),
      m_fifoBufferSize(fifoBufferSize),
      m_fifoBufferReadPos(static_cast<char*>(fifoBuffer)),
      m_fifoBufferWrittenPos(static_cast<char*>(fifoBuffer)),
      m_convertCRs(convertCRs),
      m_lastChar(0) {
  m_pFile->GetFileSize(&m_fileSize);
  if (!m_fileSize) {
    IMPORT_LOG0("*** Error, unexpected zero file size for composed message\n");
    return;
  }

  nsresult rv =
      NS_NewLocalFileInputStream(getter_AddRefs(m_pInputStream), m_pFile);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error, unable to open composed message file\n");
    return;
  }
}

nsresult CCompositionFile::EnsureHasDataInBuffer() {
  if (m_fifoBufferReadPos < m_fifoBufferWrittenPos) return NS_OK;
  // Populate the buffer with new data!
  uint32_t count = m_fifoBufferSize;
  if ((m_fileReadPos + count) > m_fileSize) count = m_fileSize - m_fileReadPos;
  if (!count) return NS_ERROR_FAILURE;  // Isn't there a "No more data" error?

  uint32_t bytesRead = 0;
  nsresult rv = m_pInputStream->Read(m_fifoBuffer, count, &bytesRead);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!bytesRead || (bytesRead > count)) return NS_ERROR_FAILURE;
  m_fifoBufferWrittenPos = m_fifoBuffer + bytesRead;
  m_fifoBufferReadPos = m_fifoBuffer;
  m_fileReadPos += bytesRead;

  return NS_OK;
}

class CTermGuard {
 public:
  CTermGuard(const char* term, int termSize)
      : m_term(term),
        m_termSize(term ? ((termSize != -1) ? termSize : strlen(term)) : 0),
        m_matchPos(0) {}

  // if the guard triggered
  inline bool IsTriggered() const {
    return m_termSize && (m_matchPos == m_termSize);
  }
  // indicates if the guard has something to check
  inline bool IsChecking() const { return m_termSize; }

  bool Check(char c)  // returns true only if the whole sequence passed
  {
    if (!m_termSize)  // no guard
      return false;
    if (m_matchPos >= m_termSize)  // check past success!
      m_matchPos = 0;
    if (m_term[m_matchPos] != c)  // Reset sequence
      m_matchPos = 0;
    if (m_term[m_matchPos] == c) {        // Sequence continues
      return ++m_matchPos == m_termSize;  // If equal then sequence complete!
    }
    // Sequence broken
    return false;
  }

 private:
  const char* m_term;
  int m_termSize;
  int m_matchPos;
};

template <class _OutFn>
nsresult CCompositionFile::ToDest(_OutFn dest, const char* term, int termSize) {
  CTermGuard guard(term, termSize);

  // We already know the required string size, so reduce future reallocations
  if (!guard.IsChecking() && !m_convertCRs)
    dest.SetCapacity(m_fileSize - m_fileReadPos);

  bool wasCR = false;
  char c = 0;
  nsresult rv;
  while (NS_SUCCEEDED(rv = EnsureHasDataInBuffer())) {
    if (!guard.IsChecking() && !m_convertCRs) {  // Use efficient algorithm
      dest.Append(m_fifoBufferReadPos,
                  m_fifoBufferWrittenPos - m_fifoBufferReadPos);
    } else {  // Check character by character to convert CRs and find
              // terminating sequence
      while (m_fifoBufferReadPos < m_fifoBufferWrittenPos) {
        c = *m_fifoBufferReadPos;
        if (m_convertCRs && wasCR) {
          wasCR = false;
          if (c != nsCRT::LF) {
            const char kTmpLF = nsCRT::LF;
            dest.Append(&kTmpLF, 1);
            if (guard.Check(nsCRT::LF)) {
              c = nsCRT::LF;  // save last char
              break;
            }
          }
        }
        dest.Append(&c, 1);
        m_fifoBufferReadPos++;

        if (guard.Check(c)) break;

        if (m_convertCRs && (c == nsCRT::CR)) wasCR = true;
      }
      if (guard.IsTriggered()) break;
    }
  }

  // check for trailing CR (only if caller didn't specify the terminating
  // sequence that ends with CR - in this case he knows what he does!)
  if (m_convertCRs && !guard.IsTriggered() && (c == nsCRT::CR)) {
    c = nsCRT::LF;
    dest.Append(&c, 1);
  }

  NS_ENSURE_SUCCESS(rv, rv);

  m_lastChar = c;
  return NS_OK;
}

class dest_nsCString {
 public:
  explicit dest_nsCString(nsCString& str) : m_str(str) { m_str.Truncate(); }
  void SetCapacity(int32_t sz) { m_str.SetCapacity(sz); }
  nsresult Append(const char* buf, uint32_t count) {
    m_str.Append(buf, count);
    return NS_OK;
  }

 private:
  nsCString& m_str;
};

class dest_Stream {
 public:
  explicit dest_Stream(nsIOutputStream* dest) : m_stream(dest) {}
  void SetCapacity(int32_t) { /*do nothing*/ }
  // const_cast here is due to the poor design of the EscapeFromSpaceLine()
  // that requires a non-constant pointer while doesn't modify its data
  nsresult Append(const char* buf, uint32_t count) {
    return EscapeFromSpaceLine(m_stream, const_cast<char*>(buf), buf + count);
  }

 private:
  nsIOutputStream* m_stream;
};

nsresult CCompositionFile::ToString(nsCString& dest, const char* term,
                                    int termSize) {
  return ToDest(dest_nsCString(dest), term, termSize);
}

nsresult CCompositionFile::ToStream(nsIOutputStream* dest, const char* term,
                                    int termSize) {
  return ToDest(dest_Stream(dest), term, termSize);
}

// Moved from nsMsgUtils.cpp:

bool IsAFromSpaceLine(char* start, const char* end) {
  bool rv = false;
  while ((start < end) && (*start == '>')) start++;
  // If the leading '>'s are followed by an 'F' then we have a possible case
  // here.
  if ((*start == 'F') && (end - start > 4) && !strncmp(start, "From ", 5))
    rv = true;
  return rv;
}

//
// This function finds all lines starting with "From " or "From " preceding
// with one or more '>' (ie, ">From", ">>From", etc) in the input buffer
// (between 'start' and 'end') and prefix them with a ">" .
//
nsresult EscapeFromSpaceLine(nsIOutputStream* outputStream, char* start,
                             const char* end) {
  nsresult rv;
  char* pChar;
  uint32_t written;

  pChar = start;
  while (start < end) {
    while ((pChar < end) && (*pChar != '\r') && ((pChar + 1) < end) &&
           (*(pChar + 1) != '\n'))
      pChar++;
    if ((pChar + 1) == end) pChar++;

    if (pChar < end) {
      // Found a line so check if it's a qualified "From " line.
      if (IsAFromSpaceLine(start, pChar)) {
        rv = outputStream->Write(">", 1, &written);
        NS_ENSURE_SUCCESS(rv, rv);
      }
      int32_t lineTerminatorCount = (*(pChar + 1) == '\n') ? 2 : 1;
      rv = outputStream->Write(start, pChar - start + lineTerminatorCount,
                               &written);
      NS_ENSURE_SUCCESS(rv, rv);
      pChar += lineTerminatorCount;
      start = pChar;
    } else if (start < end) {
      // Check and flush out the remaining data and we're done.
      if (IsAFromSpaceLine(start, end)) {
        rv = outputStream->Write(">", 1, &written);
        NS_ENSURE_SUCCESS(rv, rv);
      }
      rv = outputStream->Write(start, end - start, &written);
      NS_ENSURE_SUCCESS(rv, rv);
      break;
    }
  }
  return NS_OK;
}
