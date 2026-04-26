/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsMsgSearchCore.h"
#include "nsMsgUtils.h"
#include "nsMsgBodyHandler.h"
#include "plbase64.h"
#include "nsMimeTypes.h"
#include "nsIPgpMimeProxy.h"
#include "nsICMSMessage.h"
#include "nsICMSDecoder.h"
#include "nsMsgI18N.h"
#include "mozilla/Utf8.h"
#include "mime_closure.h"

nsMsgBodyHandler::nsMsgBodyHandler(nsIMsgSearchScopeTerm* scope,
                                   nsIMsgDBHdr* msg) {
  m_scope = scope;

  // The following are variables used when the body handler is handling stuff
  // from filters....through this constructor, that is not the case so we set
  // them to NULL.
  m_remainingHeaders = nullptr;
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
  m_remainingHeaders = nullptr;
  m_Filtering = Filtering;

  Initialize();

  if (m_Filtering) {
    m_remainingHeaders = mozilla::Span(headers, headersSize);
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
  m_seenMpPGP = false;
  m_partIsPGP = false;
  m_partIsSMIME = false;
  m_pastPartHeaders = false;
  m_inMessageAttachment = false;
}

nsMsgBodyHandler::~nsMsgBodyHandler() {}

int32_t nsMsgBodyHandler::GetNextLine(nsCString& buf, nsCString& charset,
                                      bool& needsQPReset) {
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

    outLength =
        ApplyTransformations(nextLine, length, eatThisLine, buf, needsQPReset);
  }

  if (outLength < 0) return -1;  // eof out

  // For non-multipart messages, the entire message minus headers is encoded.
  if (!m_isMultipart && !m_partIsSMIME && m_base64part) {
    Base64Decode(buf);
    outLength = buf.Length();
    m_base64part = false;
  }

  // Process aggregated HTML.
  if (!m_isMultipart && m_partIsHtml) {
    StripHtml(buf);
    outLength = buf.Length();
  }

  if (m_partIsSMIME &&
      mozilla::Preferences::GetBool("mail.search_encrypted_bodies")) {
    nsCString decrypted;
    DecryptSMIME(buf, decrypted);
    GetRelevantTextParts(decrypted, buf);
    outLength = decrypted.Length();
    m_partCharset = "UTF-8";
  }

  charset = m_partCharset;
  return outLength;
}

// Find and extract the first header in m_remainingHeaders and assign it to
// buf. m_remainingHeaders is usually a view over
// nsParseMailMessageState::m_headers, which is a raw byte array containing a
// NUL delimited list of header strings.
// Returns the length of the header including the terminating NUL, or -1
// if all headers have been processed before.
int32_t nsMsgBodyHandler::GetNextFilterLine(nsCString& buf) {
  // Each header may contain CRs & LFs. It is possible to have: To NUL CR LF
  // From. We want to skip over these CR/LFs if they start at the beginning of
  // what we think is another header. There may also be multiple NUL chars
  // between headers.
  auto nextHeader = std::find_if_not(
      m_remainingHeaders.cbegin(), m_remainingHeaders.cend(), [](const char c) {
        return c == '\r' || c == '\n' || c == ' ' || c == '\0';
      });
  auto endOfHeader = std::find(nextHeader, m_remainingHeaders.cend(), '\0');
  if (endOfHeader == m_remainingHeaders.cend()) {
    buf.Truncate();
    m_remainingHeaders = nullptr;
    return -1;
  }

  ++endOfHeader;
  buf.Assign(nsCString(mozilla::Span<const char>(nextHeader, endOfHeader)));
  m_remainingHeaders =
      mozilla::Span<const char>(endOfHeader, m_remainingHeaders.cend());
  return endOfHeader - nextHeader;
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
                                               nsCString& buf,
                                               bool& needsQPReset) {
  eatThisLine = false;
  needsQPReset = false;

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
        // Avoid spurious failures
        eatThisLine = false;
      }
    } else if (!m_partIsHtml && !m_partIsPGP) {
      buf.Truncate();
      eatThisLine = true;  // We have no content...
    }

    if (m_partIsHtml) {
      StripHtml(buf);
    }

    if (m_partIsPGP &&
        mozilla::Preferences::GetBool("mail.search_encrypted_bodies")) {
      nsCString decrypted;
      DecryptPGP(buf, decrypted);
      GetRelevantTextParts(decrypted, buf);
      m_partCharset = "UTF-8";
    }

    // Reset all assumed headers
    m_pastPartHeaders = false;
    m_base64part = false;
    m_partIsHtml = false;
    // If we ever see a multipart message, each part needs to set
    // 'm_partIsText', so no more defaulting to 'true' when the part is done.
    m_partIsText = false;

    if (m_partIsPGP) {
      m_seenMpPGP = false;
    }
    m_partIsPGP = false;
    m_partIsSMIME = false;
    // We must ensure m_partIsQP is set to false after the caller is done
    // processing our return value, to ensure that the following part will not
    // get QP decoding incorrectly.
    needsQPReset = true;
    return buf.Length();
  }

  if (!m_partIsText && !m_partIsPGP && !m_partIsSMIME) {
    // Ignore non-text parts
    buf.Truncate();
    eatThisLine = true;
    return 0;
  }

  // Accumulate base64 parts, HTML parts and encrypted parts for later decoding
  // or tag stripping.
  if (m_base64part || m_partIsHtml || m_partIsPGP || m_partIsSMIME) {
    if (m_partIsHtml && !m_base64part) {
      size_t bufLength = buf.Length();
      if (!m_partIsQP || bufLength == 0 || !StringEndsWith(buf, "="_ns)) {
        // Replace newline in HTML with a space.
        buf.Append(' ');
      } else {
        // Strip the soft line break.
        buf.SetLength(bufLength - 1);
      }
    } else if (m_partIsPGP && buf.Length() > 0) {
      // Ensure that the BEGIN PGP lines are on their own line. Not necessry for
      // S/MIME because it is a full base64 block that doesn't have such lines.
      buf.Append('\n');
    }
    buf.Append(line);
    eatThisLine = true;
    return buf.Length();
  }

  buf.Assign(line);
  return buf.Length();
}

namespace {

// Struct for our tiered mapping
struct EntityMapping {
  const char* name;
  const char* utf8Value;  // "" means delete, " " means space
};

// MUST be ASCII-sorted for binary search (Uppercase first, then lowercase)
static const EntityMapping gHtmlEntities[] = {
    // --- UPPERCASE LATIN-1 SUPPLEMENT ---
    {"AElig", "\xC3\x86"},   // Æ
    {"Aacute", "\xC3\x81"},  // Á
    {"Acirc", "\xC3\x82"},   // Â
    {"Agrave", "\xC3\x80"},  // À
    {"Aring", "\xC3\x85"},   // Å
    {"Atilde", "\xC3\x83"},  // Ã
    {"Auml", "\xC3\x84"},    // Ä
    {"Ccedil", "\xC3\x87"},  // Ç
    {"ETH", "\xC3\x90"},     // Ð
    {"Eacute", "\xC3\x89"},  // É
    {"Ecirc", "\xC3\x8A"},   // Ê
    {"Egrave", "\xC3\x88"},  // È
    {"Euml", "\xC3\x8B"},    // Ë
    {"Iacute", "\xC3\x8D"},  // Í
    {"Icirc", "\xC3\x8E"},   // Î
    {"Igrave", "\xC3\x8C"},  // Ì
    {"Iuml", "\xC3\x8F"},    // Ï
    {"Ntilde", "\xC3\x91"},  // Ñ
    {"Oacute", "\xC3\x93"},  // Ó
    {"Ocirc", "\xC3\x94"},   // Ô
    {"Ograve", "\xC3\x92"},  // Ò
    {"Oslash", "\xC3\x98"},  // Ø
    {"Otilde", "\xC3\x95"},  // Õ
    {"Ouml", "\xC3\x96"},    // Ö
    {"THORN", "\xC3\x9E"},   // Þ
    {"Uacute", "\xC3\x9A"},  // Ú
    {"Ucirc", "\xC3\x9B"},   // Û
    {"Ugrave", "\xC3\x99"},  // Ù
    {"Uuml", "\xC3\x9C"},    // Ü
    {"Yacute", "\xC3\x9D"},  // Ý

    // --- LOWERCASE ENTITIES ---
    {"aacute", "\xC3\xA1"},  // á
    {"acirc", "\xC3\xA2"},   // â
    {"acute", "\xC2\xB4"},   // ´
    {"aelig", "\xC3\xA6"},   // æ
    {"agrave", "\xC3\xA0"},  // à
    {"amp", "&"},            // & (Big Five)
    {"apos", "'"},           // ' (Big Five)
    {"aring", "\xC3\xA5"},   // å
    {"atilde", "\xC3\xA3"},  // ã
    {"auml", "\xC3\xA4"},    // ä

    {"brvbar", "\xC2\xA6"},  // ¦

    {"ccedil", "\xC3\xA7"},  // ç
    {"cedil", "\xC2\xB8"},   // ¸
    {"cent", "\xC2\xA2"},    // ¢
    {"copy", "\xC2\xA9"},    // ©
    {"curren", "\xC2\xA4"},  // ¤

    {"deg", "\xC2\xB0"},     // °
    {"divide", "\xC3\xB7"},  // ÷

    {"eacute", "\xC3\xA9"},  // é
    {"ecirc", "\xC3\xAA"},   // ê
    {"egrave", "\xC3\xA8"},  // è
    {"emsp", " "},           // Word Merger -> Space
    {"ensp", " "},           // Word Merger -> Space
    {"eth", "\xC3\xB0"},     // ð
    {"euml", "\xC3\xAB"},    // ë

    {"frac12", "\xC2\xBD"},  // ½
    {"frac14", "\xC2\xBC"},  // ¼
    {"frac34", "\xC2\xBE"},  // ¾

    {"gt", ">"},  // > (Big Five)

    {"iacute", "\xC3\xAD"},  // í
    {"icirc", "\xC3\xAE"},   // î
    {"iexcl", "\xC2\xA1"},   // ¡
    {"igrave", "\xC3\xAC"},  // ì
    {"iquest", "\xC2\xBF"},  // ¿
    {"iuml", "\xC3\xAF"},    // ï

    {"laquo", "\xC2\xAB"},  // «
    {"lt", "<"},            // < (Big Five)

    {"macr", "\xC2\xAF"},    // ¯
    {"micro", "\xC2\xB5"},   // µ
    {"middot", "\xC2\xB7"},  // ·

    {"nbsp", " "},           // Word Merger -> Space
    {"not", "\xC2\xAC"},     // ¬
    {"ntilde", "\xC3\xB1"},  // ñ

    {"oacute", "\xC3\xB3"},  // ó
    {"ocirc", "\xC3\xB4"},   // ô
    {"ograve", "\xC3\xB2"},  // ò
    {"ordf", "\xC2\xAA"},    // ª
    {"ordm", "\xC2\xBA"},    // º
    {"oslash", "\xC3\xB8"},  // ø
    {"otilde", "\xC3\xB5"},  // õ
    {"ouml", "\xC3\xB6"},    // ö

    {"para", "\xC2\xB6"},    // ¶
    {"plusmn", "\xC2\xB1"},  // ±
    {"pound", "\xC2\xA3"},   // £

    {"quot", "\""},  // " (Big Five)

    {"raquo", "\xC2\xBB"},  // »

    {"sect", "\xC2\xA7"},   // §
    {"shy", ""},            // Word Splitter -> Delete entirely
    {"sup1", "\xC2\xB9"},   // ¹
    {"sup2", "\xC2\xB2"},   // ²
    {"sup3", "\xC2\xB3"},   // ³
    {"szlig", "\xC3\x9F"},  // ß

    {"thinsp", " "},        // Word Merger -> Space
    {"thorn", "\xC3\xBE"},  // þ
    {"times", "\xC3\x97"},  // ×

    {"uacute", "\xC3\xBA"},  // ú
    {"ucirc", "\xC3\xBB"},   // û
    {"ugrave", "\xC3\xB9"},  // ù
    {"uml", "\xC2\xA8"},     // ¨
    {"uuml", "\xC3\xBC"},    // ü

    {"yacute", "\xC3\xBD"},  // ý
    {"yen", "\xC2\xA5"},     // ¥
    {"yuml", "\xC3\xBF"},    // ÿ

    {"zwnj", ""}  // Word Splitter -> Delete entirely
};

// Fast binary search helper
static const char* DecodeEntityLookup(const nsDependentCSubstring& aEntity) {
  int left = 0;
  int right = (sizeof(gHtmlEntities) / sizeof(EntityMapping)) - 1;

  while (left <= right) {
    int mid = left + (right - left) / 2;

    // Wrap the lookup table's C-string in a Mozilla string class
    // so we can safely compare it against the substring
    nsDependentCString mappedName(gHtmlEntities[mid].name);

    if (aEntity.Equals(mappedName)) {
      return gHtmlEntities[mid].utf8Value;
    }

    // Use Mozilla's overloaded operators to navigate the binary search
    if (aEntity < mappedName) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return nullptr;  // Not in our supported tiers, fallback to raw string
}

}  // namespace

void nsMsgBodyHandler::StripHtml(nsCString& pBufInOut) {
  if (pBufInOut.IsEmpty()) {
    return;
  }

  char* buf = pBufInOut.BeginWriting();
  char* writePtr = buf;
  const char* readPtr = buf;
  const char* endPtr = buf + pBufInOut.Length();

  enum SkipMode { None, Style, Script };
  SkipMode skipMode = None;

  bool inTag = false;
  bool inQuotes = false;
  char quoteChar = '\0';

  // We explicitly check readPtr < endPtr to ensure absolute memory safety.
  while (readPtr < endPtr && *readPtr) {
    size_t remaining = endPtr - readPtr;

    // 1. SKIP MODE: Ignore CSS and JS
    if (skipMode != None) {
      if (skipMode == Style && remaining >= 7 &&
          nsDependentCSubstring(readPtr, 7).LowerCaseEqualsASCII("</style")) {
        skipMode = None;
        readPtr += 7;
        inTag = true;
      } else if (skipMode == Script && remaining >= 8 &&
                 nsDependentCSubstring(readPtr, 8)
                     .LowerCaseEqualsASCII("</script")) {
        skipMode = None;
        readPtr += 8;
        inTag = true;
      } else {
        readPtr++;
      }
      continue;
    }

    char c = *readPtr;

    if (!inTag) {
      // 2. TAG DETECTION
      if (c == '<') {
        if (remaining >= 6 &&
            nsDependentCSubstring(readPtr, 6).LowerCaseEqualsASCII("<style")) {
          skipMode = Style;
          readPtr += 6;
          continue;
        }

        if (remaining >= 7 &&
            nsDependentCSubstring(readPtr, 7).LowerCaseEqualsASCII("<script")) {
          skipMode = Script;
          readPtr += 7;
          continue;
        }

        char next = (remaining > 1) ? *(readPtr + 1) : '\0';
        if (next != '\0' && (mozilla::IsAsciiAlpha(next) || next == '/' ||
                             next == '!' || next == '?')) {
          inTag = true;
          inQuotes = false;
        } else {
          *writePtr++ = c;
        }
      }
      // 3. TIERED HTML ENTITY DECODING
      else if (c == '&') {
        // Safely bound the lookahead to a maximum of 12 bytes using memchr.
        // This prevents runaway scans if a semicolon is missing.
        size_t searchLen = std::min(remaining, (size_t)12);
        const void* match = memchr(readPtr, ';', searchLen);
        const char* entityEnd = nullptr;
        const char* decodedValue = nullptr;
        if (match) {
          entityEnd = static_cast<const char*>(match);
          size_t entityLen = entityEnd - readPtr - 1;
          if (entityLen >= 2 && entityLen <= 10) {
            decodedValue = DecodeEntityLookup(
                nsDependentCSubstring(readPtr + 1, entityLen));
          }
        }
        if (decodedValue) {
          // Write the mapped value. This handles Tier 1 (space), Tier 2
          // (delete/skip), and Tiers 3/4 (exact UTF-8 bytes).
          while (*decodedValue) {
            *writePtr++ = *decodedValue++;
          }
          // Fast-forward the read pointer past the ';'
          readPtr = entityEnd;
        } else {
          // Fallback: Treat '&' as literal text.
          *writePtr++ = c;
        }
      }
      // 4. NORMAL TEXT
      else {
        *writePtr++ = c;
      }
    } else {
      // 5. INSIDE A TAG
      if (inQuotes) {
        if (c == quoteChar) inQuotes = false;
      } else {
        if (c == '"' || c == '\'') {
          inQuotes = true;
          quoteChar = c;
        } else if (c == '>') {
          inTag = false;
        }
      }
    }
    readPtr++;
  }

  pBufInOut.SetLength(writePtr - buf);
}

/* static */
int nsMsgBodyHandler::OutputFunctionPGP(const char* buf, int32_t buf_size,
                                        int32_t outputClosureType,
                                        void* outputClosure) {
  nsMsgBodyHandler* self = reinterpret_cast<nsMsgBodyHandler*>(outputClosure);
  self->mDecrypted.Append(buf, buf_size);
  return 0;
}

/* static */
void nsMsgBodyHandler::OutputFunctionSMIME(void* arg, const char* buf,
                                           unsigned long length) {
  nsMsgBodyHandler* self = reinterpret_cast<nsMsgBodyHandler*>(arg);
  self->mDecrypted.Append(buf, length);
}

void nsMsgBodyHandler::DecryptPGP(const nsCString& aEncrypted,
                                  nsCString& aDecrypted) {
  aDecrypted.Truncate();
  mDecrypted.Truncate();
  nsresult rv;
  nsCOMPtr<nsIPgpMimeProxy> decryptor =
      do_CreateInstance("@mozilla.org/mime/pgp-mime-decrypt;1", &rv);
  NS_ENSURE_SUCCESS_VOID(rv);

  decryptor->Init();
  // If we pass a boundary, code in mimeDecrypt.sys.mjs will look for a
  // two part multipart/encrypted structure. We just pass the net data.
  // Use a boundary which won't be found 100%.
  decryptor->SetContentType(
      "multipart/encrypted; boundary=$$none$$none$$none$$none$$none"_ns);
  decryptor->SetMimeCallback(nsMsgBodyHandler::OutputFunctionPGP,
                             MimeClosure::isMimeObject, this, nullptr, nullptr);
  decryptor->Write(aEncrypted.get(), aEncrypted.Length());
  decryptor->Finish();
  decryptor->RemoveMimeCallback();
  aDecrypted.Assign(mDecrypted.get());  // Make a copy.
}

void nsMsgBodyHandler::DecryptSMIME(const nsCString& aEncrypted,
                                    nsCString& aDecrypted) {
  aDecrypted.Truncate();
  mDecrypted.Truncate();

  // base64-decode the buffer. We need to determine the output length.
  int32_t inLen = aEncrypted.Length();
  while (inLen > 0 && aEncrypted[inLen - 1] == '=') inLen--;
  if (!inLen) return;
  int32_t outLen =
      (inLen / 4) * 3 + ((inLen % 4 == 3) ? 2 : 0) + ((inLen % 4 == 2) ? 1 : 0);
  char* decoded = (char*)moz_xmalloc(outLen);
  if (!decoded) return;
  PL_Base64Decode(aEncrypted.get(), inLen, decoded);

  nsresult rv;
  nsCOMPtr<nsICMSDecoder> decryptor =
      do_CreateInstance(NS_CMSDECODER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) {
    free(decoded);
    return;
  }
  rv = decryptor->Start(nsMsgBodyHandler::OutputFunctionSMIME, this);
  if (NS_FAILED(rv)) {
    free(decoded);
    return;
  }
  rv = decryptor->Update(decoded, outLen);
  free(decoded);
  if (NS_FAILED(rv)) {
    return;
  }
  nsCOMPtr<nsICMSMessage> cinfo;
  rv = decryptor->Finish(getter_AddRefs(cinfo));
  NS_ENSURE_SUCCESS_VOID(rv);
  aDecrypted.Assign(mDecrypted.get());  // Make a copy.
}

void nsMsgBodyHandler::GetRelevantTextParts(const nsCString& aInput,
                                            nsCString& aOutput) {
  aOutput.Truncate();

  // Code copied from nsMsgSearchTerm::MatchBody().
  nsMsgBodyHandler2* bodyHan2 = new nsMsgBodyHandler2(aInput);

  bool endOfFile = false;
  nsAutoCString buf;
  nsCString charset;
  while (!endOfFile) {
    if (bodyHan2->GetNextLine(buf, charset) >= 0) {
      bool softLineBreak = false;
      // Do in-place decoding of quoted printable
      if (bodyHan2->IsQP()) {
        softLineBreak = StringEndsWith(buf, "="_ns);
        MsgStripQuotedPrintable(buf);
        // If soft line break, chop off the last char as well.
        size_t bufLength = buf.Length();
        if ((bufLength > 0) && softLineBreak) buf.SetLength(bufLength - 1);
      }

      if (!charset.IsEmpty() && !charset.EqualsIgnoreCase("UTF-8") &&
          !charset.EqualsIgnoreCase("UTF8")) {
        // Convert to UTF-8.
        nsAutoString buf16;
        nsresult rv = nsMsgI18NConvertToUnicode(charset, buf, buf16);
        if (NS_FAILED(rv)) {
          // No charset or conversion failed, maybe due to a bad charset, try
          // UTF-8.
          if (mozilla::IsUtf8(buf)) {
            CopyUTF8toUTF16(buf, buf16);
          } else {
            // Bad luck, let's assume ASCII/windows-1252 then.
            CopyASCIItoUTF16(buf, buf16);
          }
        }
        CopyUTF16toUTF8(buf16, buf);
      }

      aOutput.Append(buf);

      // Replace the line break with a space so huhu\nhaha is not found as
      // huhuhaha.
      if (!softLineBreak) aOutput.Append(' ');
    } else
      endOfFile = true;
  }
  delete bodyHan2;
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
        m_seenMpPGP = false;
        m_partIsPGP = false;
        m_partIsSMIME = false;
      }
      m_isMultipart = true;
      m_partCharset.Truncate();
      m_seenMpPGP = false;
    } else if (lowerCaseLine.Find("message/") != kNotFound) {
      // Initialise again.
      m_base64part = false;
      m_partIsQP = false;
      m_pastPartHeaders = false;
      m_partIsHtml = false;
      m_partIsText =
          true;  // Default is text/plain, maybe proven otherwise later.
      m_seenMpPGP = false;
      m_partIsPGP = false;
      m_partIsSMIME = false;
      m_inMessageAttachment = true;
    } else if (lowerCaseLine.Find("application/octet-stream") != kNotFound &&
               m_seenMpPGP) {
      m_base64part = false;
      m_partIsQP = false;
      m_pastPartHeaders = false;
      m_partIsHtml = false;
      m_partIsText = false;
      m_seenMpPGP = false;
      m_partIsPGP = true;
      m_partIsSMIME = false;
    } else if (lowerCaseLine.Find("application/pkcs7-mime") != kNotFound ||
               lowerCaseLine.Find("application/x-pkcs7-mime") != kNotFound) {
      m_base64part = false;
      m_partIsQP = false;
      m_pastPartHeaders = false;
      m_partIsHtml = false;
      m_partIsText = false;
      m_seenMpPGP = false;
      m_partIsPGP = false;
      // S/MIME is one monolithic base64-encoded blob with no boundaries.
      m_partIsSMIME = true;
    } else if (lowerCaseLine.Find("text/") != kNotFound)
      m_partIsText = true;
    else if (lowerCaseLine.Find("text/") == kNotFound)
      m_partIsText = false;  // We have disproven our assumption.
  }

  if (m_isMultipart && lowerCaseLine.Find("protocol") != kNotFound &&
      lowerCaseLine.Find("application/pgp-encrypted") != kNotFound) {
    m_seenMpPGP = true;
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

  // For simple text/plain or text/html messages we don't need the charset,
  // since the caller of `MatchBody()` already provides the overall message
  // charset.
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
