/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgSearchCore.h"
#include "nsMsgUtils.h"
#include "nsMsgBodyHandler.h"
#include "nsMsgSearchTerm.h"
#include "nsIInputStream.h"
#include "plbase64.h"
#include "nsMimeTypes.h"

nsMsgBodyHandler::nsMsgBodyHandler(nsIMsgSearchScopeTerm* scope,
                                   nsIMsgDBHdr* msg) {
  m_scope = scope;

  // The following are variables used when the body handler is handling stuff
  // from filters....through this constructor, that is not the case so we set
  // them to NULL.
  m_headers = nullptr;
  m_headersSize = 0;
  m_Filtering = false;  // make sure we set this before we call initialize...

  Initialize();  // common initialization stuff

  nsresult rv = m_scope->GetInputStream(msg, getter_AddRefs(m_msgStream));
  NS_ENSURE_SUCCESS_VOID(rv);  // Not ideal, but warn at least.
  m_lineBuffer = mozilla::MakeUnique<nsLineBuffer<char>>();
}

nsMsgBodyHandler::nsMsgBodyHandler(nsIMsgSearchScopeTerm* scope,
                                   nsIMsgDBHdr* msg, const char* headers,
                                   uint32_t headersSize, bool Filtering) {
  m_scope = scope;
  m_headers = nullptr;
  m_headersSize = 0;
  m_Filtering = Filtering;

  Initialize();

  if (m_Filtering) {
    m_headers = headers;
    m_headersSize = headersSize;
  } else {
    nsresult rv = m_scope->GetInputStream(msg, getter_AddRefs(m_msgStream));
    NS_ENSURE_SUCCESS_VOID(rv);  // Not ideal, but warn at least.
    m_lineBuffer = mozilla::MakeUnique<nsLineBuffer<char>>();
  }
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
  m_pastPartHeaders = false;
  m_inMessageAttachment = false;
  m_headerBytesRead = 0;
}

nsMsgBodyHandler::~nsMsgBodyHandler() {}

int32_t nsMsgBodyHandler::GetNextLine(nsCString& buf, nsCString& charset) {
  if (!m_Filtering && !m_msgStream) {
    return -1;  // In an invalid state, so EOF immediately.
  }

  int32_t outLength = -1;  // length of outgoing line or -1 eof
  bool eatThisLine = true;
  while (eatThisLine) {
    nsAutoCString nextLine;
    int32_t length = -1;
    if (m_Filtering) {
      length = GetNextFilterLine(nextLine);
    } else {
      length = GetNextLocalLine(nextLine);
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

// Return length of line, otherwise -1 for EOF.
// Line is returned with EOL sequence trimmed off.
int32_t nsMsgBodyHandler::GetNextLocalLine(nsACString& line) {
  bool more;
  nsresult rv = NS_ReadLine(m_msgStream.get(), m_lineBuffer.get(), line, &more);
  if (NS_FAILED(rv)) {
    return -1;
  }
  if (line.IsEmpty() && !more) {
    return -1;  // No more data.
  }
  return line.Length();
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
    m_pastPartHeaders = false;
    m_base64part = false;
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
    m_partIsQP = lowerCaseLine.Find("quoted-printable") != kNotFound;

  if (StringBeginsWith(lowerCaseLine, "content-type:"_ns)) {
    if (lowerCaseLine.LowerCaseFindASCII("text/html") != kNotFound) {
      m_partIsText = true;
      m_partIsHtml = true;
    } else if (lowerCaseLine.Find("multipart/") != kNotFound) {
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
    } else if (lowerCaseLine.Find("message/") != kNotFound) {
      // Initialise again.
      m_base64part = false;
      m_partIsQP = false;
      m_pastPartHeaders = false;
      m_partIsHtml = false;
      m_partIsText =
          true;  // Default is text/plain, maybe proven otherwise later.
      m_inMessageAttachment = true;
    } else if (lowerCaseLine.Find("text/") != kNotFound)
      m_partIsText = true;
    else if (lowerCaseLine.Find("text/") == kNotFound)
      m_partIsText = false;  // We have disproven our assumption.
  }

  int32_t start;
  if (m_isMultipart && (start = lowerCaseLine.Find("boundary=")) != kNotFound) {
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

  if (m_isMultipart && (start = lowerCaseLine.Find("charset=")) != kNotFound) {
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
      lowerCaseLine.LowerCaseFindASCII(ENCODING_BASE64) != kNotFound)
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
