/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgSearchCore.h"
#include "nsMsgUtils.h"
#include "nsMsgBodyHandler.h"
#include "nsMsgSearchTerm.h"
#include "nsIMsgHdr.h"
#include "nsMsgMessageFlags.h"
#include "nsISeekableStream.h"
#include "nsIInputStream.h"
#include "nsIFile.h"
#include "plbase64.h"
#include "prmem.h"
#include "nsMimeTypes.h"

nsMsgBodyHandler::nsMsgBodyHandler(nsIMsgSearchScopeTerm* scope,
                                   uint32_t numLines, nsIMsgDBHdr* msg,
                                   nsIMsgDatabase* db) {
  m_scope = scope;
  m_numLocalLines = numLines;
  uint32_t flags;
  m_lineCountInBodyLines = NS_SUCCEEDED(msg->GetFlags(&flags))
                               ? !(flags & nsMsgMessageFlags::Offline)
                               : true;
  // account for added x-mozilla-status lines, and envelope line.
  if (!m_lineCountInBodyLines) m_numLocalLines += 3;
  m_msgHdr = msg;
  m_db = db;

  // the following are variables used when the body handler is handling stuff
  // from filters....through this constructor, that is not the case so we set
  // them to NULL.
  m_headers = NULL;
  m_headersSize = 0;
  m_Filtering = false;  // make sure we set this before we call initialize...

  Initialize();  // common initialization stuff
  OpenLocalFolder();
}

nsMsgBodyHandler::nsMsgBodyHandler(nsIMsgSearchScopeTerm* scope,
                                   uint32_t numLines, nsIMsgDBHdr* msg,
                                   nsIMsgDatabase* db, const char* headers,
                                   uint32_t headersSize, bool Filtering) {
  m_scope = scope;
  m_numLocalLines = numLines;
  uint32_t flags;
  m_lineCountInBodyLines = NS_SUCCEEDED(msg->GetFlags(&flags))
                               ? !(flags & nsMsgMessageFlags::Offline)
                               : true;
  // account for added x-mozilla-status lines, and envelope line.
  if (!m_lineCountInBodyLines) m_numLocalLines += 3;
  m_msgHdr = msg;
  m_db = db;
  m_headersSize = headersSize;
  m_Filtering = Filtering;

  Initialize();

  if (m_Filtering)
    m_headers = headers;
  else
    OpenLocalFolder();  // if nothing else applies, then we must be a POP folder
                        // file
}

void nsMsgBodyHandler::Initialize()
// common initialization code regardless of what body type we are handling...
{
  // Default transformations for local message search and MAPI access
  m_stripHeaders = true;
  m_partIsHtml = false;
  m_base64part = false;
  m_partIsQP = false;
  m_isMultipart = false;
  m_partIsText = true;  // Default is text/plain, maybe proven otherwise later.
  m_pastMsgHeaders = false;
  m_pastPartHeaders = false;
  m_inMessageAttachment = false;
  m_headerBytesRead = 0;
}

nsMsgBodyHandler::~nsMsgBodyHandler() {}

int32_t nsMsgBodyHandler::GetNextLine(nsCString& buf, nsCString& charset) {
  int32_t length = -1;     // length of incoming line or -1 eof
  int32_t outLength = -1;  // length of outgoing line or -1 eof
  bool eatThisLine = true;
  nsAutoCString nextLine;

  while (eatThisLine) {
    // first, handle the filtering case...this is easy....
    if (m_Filtering)
      length = GetNextFilterLine(nextLine);
    else {
      // 3 cases: Offline IMAP, POP, or we are dealing with a news message....
      // Offline cases should be same as local mail cases, since we're going
      // to store offline messages in berkeley format folders.
      if (m_db) {
        length = GetNextLocalLine(nextLine);  // (2) POP
      }
    }

    if (length < 0) break;  // eof in

    outLength = ApplyTransformations(nextLine, length, eatThisLine, buf);
  }

  if (outLength < 0) return -1;  // eof out

  // For non-multipart messages, the entire message minus headers is encoded
  // ApplyTransformations can only decode a part
  if (!m_isMultipart && m_base64part) {
    Base64Decode(buf);
    m_base64part = false;
    // And reapply our transformations...
    outLength = ApplyTransformations(buf, buf.Length(), eatThisLine, buf);
  }

  // Process aggregated HTML.
  if (!m_isMultipart && m_partIsHtml) {
    StripHtml(buf);
    outLength = buf.Length();
  }

  charset = m_partCharset;
  return outLength;
}

void nsMsgBodyHandler::OpenLocalFolder() {
  nsCOMPtr<nsIInputStream> inputStream;
  nsresult rv = m_scope->GetInputStream(m_msgHdr, getter_AddRefs(inputStream));
  // Warn and return if GetInputStream fails
  NS_ENSURE_SUCCESS_VOID(rv);
  m_fileLineStream = do_QueryInterface(inputStream);
}

int32_t nsMsgBodyHandler::GetNextFilterLine(nsCString& buf) {
  // m_nextHdr always points to the next header in the list....the list is NULL
  // terminated...
  uint32_t numBytesCopied = 0;
  if (m_headersSize > 0) {
    // #mscott. Ugly hack! filter headers list have CRs & LFs inside the NULL
    // delimited list of header strings. It is possible to have: To NULL CR LF
    // From. We want to skip over these CR/LFs if they start at the beginning of
    // what we think is another header.

    while (m_headersSize > 0 && (m_headers[0] == '\r' || m_headers[0] == '\n' ||
                                 m_headers[0] == ' ' || m_headers[0] == '\0')) {
      m_headers++;  // skip over these chars...
      m_headersSize--;
    }

    if (m_headersSize > 0) {
      numBytesCopied = strlen(m_headers) + 1;
      buf.Assign(m_headers);
      m_headers += numBytesCopied;
      // be careful...m_headersSize is unsigned. Don't let it go negative or we
      // overflow to 2^32....*yikes*
      if (m_headersSize < numBytesCopied)
        m_headersSize = 0;
      else
        m_headersSize -= numBytesCopied;  // update # bytes we have read from
                                          // the headers list

      return (int32_t)numBytesCopied;
    }
  } else if (m_headersSize == 0) {
    buf.Truncate();
  }
  return -1;
}

// return -1 if no more local lines, length of next line otherwise.

int32_t nsMsgBodyHandler::GetNextLocalLine(nsCString& buf)
// returns number of bytes copied
{
  if (m_numLocalLines) {
    // I the line count is in body lines, only decrement once we have
    // processed all the headers.  Otherwise the line is not in body
    // lines and we want to decrement for every line.
    if (m_pastMsgHeaders || !m_lineCountInBodyLines) m_numLocalLines--;
    // do we need to check the return value here?
    if (m_fileLineStream) {
      bool more = false;
      nsresult rv = m_fileLineStream->ReadLine(buf, &more);
      if (NS_SUCCEEDED(rv)) return buf.Length();
    }
  }

  return -1;
}

/**
 * This method applies a sequence of transformations to the line.
 *
 * It applies the following sequences in order
 * * Removes headers if the searcher doesn't want them
 *   (sets m_past*Headers)
 * * Determines the current MIME type.
 *   (via SniffPossibleMIMEHeader)
 * * Strips any HTML if the searcher doesn't want it
 * * Strips non-text parts
 * * Decodes any base64 part
 *   (resetting part variables: m_base64part, m_pastPartHeaders, m_partIsHtml,
 *    m_partIsText)
 *
 * @param line        (in)    the current line
 * @param length      (in)    the length of said line
 * @param eatThisLine (out)   whether or not to ignore this line
 * @param buf         (inout) if m_base64part, the current part as needed for
 *                            decoding; else, it is treated as an out param (a
 *                            redundant version of line).
 * @return            the length of the line after applying transformations
 */
int32_t nsMsgBodyHandler::ApplyTransformations(const nsCString& line,
                                               int32_t length,
                                               bool& eatThisLine,
                                               nsCString& buf) {
  eatThisLine = false;

  if (!m_pastPartHeaders)  // line is a line from the part headers
  {
    if (m_stripHeaders) eatThisLine = true;

    // We have already grabbed all worthwhile information from the headers,
    // so there is no need to keep track of the current lines
    buf.Assign(line);

    SniffPossibleMIMEHeader(buf);

    if (buf.IsEmpty() || buf.First() == '\r' || buf.First() == '\n') {
      if (!m_inMessageAttachment) {
        m_pastPartHeaders = true;
      } else {
        // We're in a message attachment and have just read past the
        // part header for the attached message. We now need to read
        // the message headers and any part headers.
        // We can now forget about the special handling of attached messages.
        m_inMessageAttachment = false;
      }
    }

    // We set m_pastMsgHeaders to 'true' only once.
    if (m_pastPartHeaders) m_pastMsgHeaders = true;

    return length;
  }

  // Check to see if this is one of our boundary strings.
  bool matchedBoundary = false;
  if (m_isMultipart && m_boundaries.Length() > 0) {
    for (int32_t i = (int32_t)m_boundaries.Length() - 1; i >= 0; i--) {
      if (StringBeginsWith(line, m_boundaries[i])) {
        matchedBoundary = true;
        // If we matched a boundary, we won't need the nested/later ones any
        // more.
        m_boundaries.SetLength(i + 1);
        break;
      }
    }
  }
  if (matchedBoundary) {
    if (m_base64part && m_partIsText) {
      Base64Decode(buf);
      // Work on the parsed string
      if (!buf.Length()) {
        NS_WARNING("Trying to transform an empty buffer");
        eatThisLine = true;
      } else {
        // It is wrong to call ApplyTransformations() here since this will
        // lead to the buffer being doubled-up at |buf.Append(line);|
        // below. ApplyTransformations(buf, buf.Length(), eatThisLine, buf);
        // Avoid spurious failures
        eatThisLine = false;
      }
    } else if (!m_partIsHtml) {
      buf.Truncate();
      eatThisLine = true;  // We have no content...
    }

    if (m_partIsHtml) {
      StripHtml(buf);
    }

    // Reset all assumed headers
    m_base64part = false;
    // Get ready to sniff new part headers, but do not reset m_pastMsgHeaders
    // since it will screw the body line count.
    m_pastPartHeaders = false;
    m_partIsHtml = false;
    // If we ever see a multipart message, each part needs to set
    // 'm_partIsText', so no more defaulting to 'true' when the part is done.
    m_partIsText = false;

    // Note: we cannot reset 'm_partIsQP' yet since we still need it to process
    // the last buffer returned here. Parsing the next part will set a new
    // value.
    return buf.Length();
  }

  if (!m_partIsText) {
    // Ignore non-text parts
    buf.Truncate();
    eatThisLine = true;
    return 0;
  }

  // Accumulate base64 parts and HTML parts for later decoding or tag stripping.
  if (m_base64part || m_partIsHtml) {
    if (m_partIsHtml && !m_base64part) {
      size_t bufLength = buf.Length();
      if (!m_partIsQP || bufLength == 0 || !StringEndsWith(buf, "="_ns)) {
        // Replace newline in HTML with a space.
        buf.Append(' ');
      } else {
        // Strip the soft line break.
        buf.SetLength(bufLength - 1);
      }
    }
    buf.Append(line);
    eatThisLine = true;
    return buf.Length();
  }

  buf.Assign(line);
  return buf.Length();
}

void nsMsgBodyHandler::StripHtml(nsCString& pBufInOut) {
  char* pBuf = (char*)PR_Malloc(pBufInOut.Length() + 1);
  if (pBuf) {
    char* pWalk = pBuf;

    char* pWalkInOut = (char*)pBufInOut.get();
    bool inTag = false;
    while (*pWalkInOut)  // throw away everything inside < >
    {
      if (!inTag) {
        if (*pWalkInOut == '<')
          inTag = true;
        else
          *pWalk++ = *pWalkInOut;
      } else {
        if (*pWalkInOut == '>') inTag = false;
      }
      pWalkInOut++;
    }
    *pWalk = 0;  // null terminator

    pBufInOut.Adopt(pBuf);
  }
}

/**
 * Determines the MIME type, if present, from the current line.
 *
 * m_partIsHtml, m_isMultipart, m_partIsText, m_base64part, and boundary are
 * all set by this method at various points in time.
 *
 * @param line        (in)    a header line that may contain a MIME header
 */
void nsMsgBodyHandler::SniffPossibleMIMEHeader(const nsCString& line) {
  // Some parts of MIME are case-sensitive and other parts are case-insensitive;
  // specifically, the headers are all case-insensitive and the values we care
  // about are also case-insensitive, with the sole exception of the boundary
  // string, so we can't just take the input line and make it lower case.
  nsCString lowerCaseLine(line);
  ToLowerCase(lowerCaseLine);

  if (StringBeginsWith(lowerCaseLine, "content-transfer-encoding:"_ns))
    m_partIsQP =
        lowerCaseLine.Find("quoted-printable", /* ignoreCase = */ true) != -1;

  if (StringBeginsWith(lowerCaseLine, "content-type:"_ns)) {
    if (lowerCaseLine.Find("text/html", /* ignoreCase = */ true) != -1) {
      m_partIsText = true;
      m_partIsHtml = true;
    } else if (lowerCaseLine.Find("multipart/", /* ignoreCase = */ true) !=
               -1) {
      if (m_isMultipart) {
        // Nested multipart, get ready for new headers.
        m_base64part = false;
        m_partIsQP = false;
        m_pastPartHeaders = false;
        m_partIsHtml = false;
        m_partIsText = false;
      }
      m_isMultipart = true;
      m_partCharset.Truncate();
    } else if (lowerCaseLine.Find("message/", /* ignoreCase = */ true) != -1) {
      // Initialise again.
      m_base64part = false;
      m_partIsQP = false;
      m_pastPartHeaders = false;
      m_partIsHtml = false;
      m_partIsText =
          true;  // Default is text/plain, maybe proven otherwise later.
      m_inMessageAttachment = true;
    } else if (lowerCaseLine.Find("text/", /* ignoreCase = */ true) != -1)
      m_partIsText = true;
    else if (lowerCaseLine.Find("text/", /* ignoreCase = */ true) == -1)
      m_partIsText = false;  // We have disproven our assumption.
  }

  int32_t start;
  if (m_isMultipart && (start = lowerCaseLine.Find(
                            "boundary=", /* ignoreCase = */ true)) != -1) {
    start += 9;  // strlen("boundary=")
    if (line[start] == '\"') start++;
    int32_t end = line.RFindChar('\"');
    if (end == -1) end = line.Length();

    // Collect all boundaries. Since we only react to crossing a boundary,
    // we can simply collect the boundaries instead of forming a tree
    // structure from the message. Keep it simple ;-)
    nsCString boundary;
    boundary.AssignLiteral("--");
    boundary.Append(Substring(line, start, end - start));
    if (!m_boundaries.Contains(boundary)) m_boundaries.AppendElement(boundary);
  }

  if (m_isMultipart &&
      (start = lowerCaseLine.Find("charset=", /* ignoreCase = */ true)) != -1) {
    start += 8;  // strlen("charset=")
    bool foundQuote = false;
    if (line[start] == '\"') {
      start++;
      foundQuote = true;
    }
    int32_t end = line.FindChar(foundQuote ? '\"' : ';', start);
    if (end == -1) end = line.Length();

    m_partCharset.Assign(Substring(line, start, end - start));
  }

  if (StringBeginsWith(lowerCaseLine, "content-transfer-encoding:"_ns) &&
      lowerCaseLine.Find(ENCODING_BASE64, /* ignoreCase = */ true) != kNotFound)
    m_base64part = true;
}

/**
 * Decodes the given base64 string.
 *
 * It returns its decoded string in its input.
 *
 * @param pBufInOut   (inout) a buffer of the string
 */
void nsMsgBodyHandler::Base64Decode(nsCString& pBufInOut) {
  char* decodedBody =
      PL_Base64Decode(pBufInOut.get(), pBufInOut.Length(), nullptr);
  if (decodedBody) {
    // Replace CR LF with spaces.
    char* q = decodedBody;
    while (*q) {
      if (*q == '\n' || *q == '\r') *q = ' ';
      q++;
    }
    pBufInOut.Adopt(decodedBody);
  }
}
