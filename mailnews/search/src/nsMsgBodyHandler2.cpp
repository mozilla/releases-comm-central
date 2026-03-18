/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ///////////////////////////////////////////////////////////////////////////
// Below is nsMsgBodyHandler2, a copy of nsMsgBodyHandler that we use to parse
// an entire decrypted message in a string.
//
// This .cpp file is included in nsMsgBodyHandler.cpp.
// ///////////////////////////////////////////////////////////////////////////

class nsMsgBodyHandler2 {
 public:
  explicit nsMsgBodyHandler2(const nsCString& buf);
  virtual ~nsMsgBodyHandler2();
  int32_t GetNextLine(nsCString& buf, nsCString& charset);
  bool IsQP() { return m_partIsQP; }

 protected:
  void Initialize();  // common initialization code
  int32_t GetNextLocalLine(nsCString& buf);

  const char* m_currInput;
  const char* m_currInputEnd;

  // Transformations
  // With the exception of m_isMultipart, these all apply to the various parts
  bool m_EOF;
  bool m_pastPartHeaders;  // true if we've already skipped over the part
                           // headers
  bool m_partIsQP;     // true if the Content-Transfer-Encoding header claims
                       // quoted-printable
  bool m_partIsHtml;   // true if the Content-type header claims text/html
  bool m_base64part;   // true if the current part is in base64
  bool m_isMultipart;  // true if the message is a multipart/* message
  bool m_partIsText;   // true if the current part is text/*
  bool m_inMessageAttachment;  // true if current part is message/*

  nsTArray<nsCString> m_boundaries;  // The boundary strings to look for
  nsCString m_partCharset;           // The charset found in the part

  // See implementation for comments
  int32_t ApplyTransformations(const nsCString& line, int32_t length,
                               bool& returnThisLine, nsCString& buf);
  void SniffPossibleMIMEHeader(const nsCString& line);
};

nsMsgBodyHandler2::nsMsgBodyHandler2(const nsCString& buf) {
  m_currInput = buf.BeginReading();
  m_currInputEnd = m_currInput + buf.Length();

  Initialize();
}

void nsMsgBodyHandler2::Initialize() {
  // Default transformations for local message search and MAPI access
  m_EOF = false;
  m_partIsHtml = false;
  m_base64part = false;
  m_partIsQP = false;
  m_isMultipart = false;
  m_partIsText = true;  // Default is text/plain, maybe proven otherwise later.
  m_pastPartHeaders = false;
  m_inMessageAttachment = false;
}

nsMsgBodyHandler2::~nsMsgBodyHandler2() {}

int32_t nsMsgBodyHandler2::GetNextLine(nsCString& buf, nsCString& charset) {
  if (m_EOF) return -1;
  int32_t length = -1;     // length of incoming line or -1 eof
  int32_t outLength = -1;  // length of outgoing line or -1 eof
  bool eatThisLine = true;
  nsAutoCString nextLine;

  while (eatThisLine) {
    length = GetNextLocalLine(nextLine);
    if (length < 0) break;  // eof in
    outLength = ApplyTransformations(nextLine, length, eatThisLine, buf);
  }

  if (outLength < 0) return -1;  // eof out

  // For non-multipart messages, the entire message minus headers is encoded.
  if (!m_isMultipart && m_base64part) {
    nsMsgBodyHandler::Base64Decode(buf);
    outLength = buf.Length();
    m_base64part = false;
  }

  // Process aggregated HTML.
  if (!m_isMultipart && m_partIsHtml) {
    nsMsgBodyHandler::StripHtml(buf);
    outLength = buf.Length();
  }

  charset = m_partCharset;
  return outLength;
}

// return -1 if no more local lines, length of next line otherwise.
int32_t nsMsgBodyHandler2::GetNextLocalLine(nsCString& buf) {
  if (m_EOF) return -1;
  if (m_currInput >= m_currInputEnd) return -1;

  const char* q = m_currInput;
  // Deliver the next line.
  while (q < m_currInputEnd && *q && *q != '\r' && *q != '\n') q++;
  if (!*q && q < m_currInputEnd) {
    NS_WARNING("nsMsgBodyHandler2: null byte found in message buffer");
    m_EOF = true;
  }

  int32_t l = q - m_currInput;
  buf.Assign(m_currInput, q - m_currInput);

  // This mimicks nsILineInputStream.readLine() which claims to skip
  // LF, CR, CRLF and LFCR.
  if (*q == '\r' && (q + 1) < m_currInputEnd && *(q + 1) == '\n') {
    q += 2;
  } else if (*q == '\n' && (q + 1) < m_currInputEnd && *(q + 1) == '\r') {
    q += 2;
  } else if (*q) {
    q++;
  }
  m_currInput = q;

  return l;
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
int32_t nsMsgBodyHandler2::ApplyTransformations(const nsCString& line,
                                                int32_t length,
                                                bool& eatThisLine,
                                                nsCString& buf) {
  eatThisLine = false;

  if (!m_pastPartHeaders)  // line is a line from the part headers
  {
    eatThisLine = true;

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
      nsMsgBodyHandler::Base64Decode(buf);
      // Work on the parsed string
      if (!buf.Length()) {
        NS_WARNING("Trying to transform an empty buffer");
        eatThisLine = true;
      } else {
        // Avoid spurious failures
        eatThisLine = false;
      }
    } else if (!m_partIsHtml) {
      buf.Truncate();
      eatThisLine = true;  // We have no content...
    }

    if (m_partIsHtml) {
      nsMsgBodyHandler::StripHtml(buf);
    }

    // Reset all assumed headers
    m_base64part = false;
    m_pastPartHeaders = false;
    m_partIsHtml = false;
    // If we ever see a multipart message, each part needs to set
    // 'm_partIsText', so no more defaulting to 'true' when the part is done.
    m_partIsText = false;

    m_partIsQP = false;
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

/**
 * Determines the MIME type, if present, from the current line.
 *
 * m_partIsHtml, m_isMultipart, m_partIsText, m_base64part, and boundary are
 * all set by this method at various points in time.
 *
 * @param line        (in)    a header line that may contain a MIME header
 */
void nsMsgBodyHandler2::SniffPossibleMIMEHeader(const nsCString& line) {
  // Some parts of MIME are case-sensitive and other parts are case-insensitive;
  // specifically, the headers are all case-insensitive and the values we care
  // about are also case-insensitive, with the sole exception of the boundary
  // string, so we can't just take the input line and make it lower case.
  nsCString lowerCaseLine;
  ToLowerCase(line, lowerCaseLine);

  if (StringBeginsWith(lowerCaseLine, "content-transfer-encoding:"_ns))
    m_partIsQP = lowerCaseLine.Find("quoted-printable") != -1;

  if (StringBeginsWith(lowerCaseLine, "content-type:"_ns)) {
    if (lowerCaseLine.Find("text/html") != kNotFound) {
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

  if ((start = lowerCaseLine.Find("charset=")) != kNotFound) {
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
      lowerCaseLine.Find(ENCODING_BASE64) != kNotFound)
    m_base64part = true;
}
