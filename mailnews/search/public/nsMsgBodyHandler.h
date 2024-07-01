/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsMsgBodyHandler_h
#define __nsMsgBodyHandler_h

#include "nsCOMPtr.h"
#include "nsIMsgSearchScopeTerm.h"
#include "nsReadLine.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/Span.h"

//---------------------------------------------------------------------------
// nsMsgBodyHandler: used to retrieve lines from POP and IMAP offline messages.
// This is a helper class used by nsMsgSearchTerm::MatchBody() and
// nsMsgSearchTerm::MatchArbitraryHeader().
//---------------------------------------------------------------------------
class nsMsgBodyHandler {
 public:
  nsMsgBodyHandler(nsIMsgSearchScopeTerm*, nsIMsgDBHdr* msg);

  // We can also create a body handler when doing arbitrary header
  // filtering...we need the list of headers and the header size as well
  // if we are doing filtering...if ForFilters is false, headers and
  // headersSize is ignored!!!
  // If ForFilters is true, `headers` should contain a list of
  // '\0'-terminated header strings (See Bug 1791947 for cleanup suggestion).
  nsMsgBodyHandler(nsIMsgSearchScopeTerm*, nsIMsgDBHdr* msg,
                   const char* headers, uint32_t headersSize, bool ForFilters);

  ~nsMsgBodyHandler();

  // Returns next message line in buf and the applicable charset, if found.
  // The return value is the length of 'buf' or -1 for EOF.
  int32_t GetNextLine(nsCString& buf, nsCString& charset);
  bool IsQP() { return m_partIsQP; }

  // Transformations
  void SetStripHeaders(bool strip) { m_stripHeaders = strip; }

 protected:
  void Initialize();  // common initialization code

  // Filter related methods. For filtering we always use the headers
  // list instead of the database...
  bool m_Filtering;
  int32_t GetNextFilterLine(nsCString& buf);
  // pointer into the headers list in the original message hdr db...
  mozilla::Span<const char> m_remainingHeaders;

  // Reading from raw message stream.
  int32_t GetNextLocalLine(nsACString& line);
  nsIMsgSearchScopeTerm* m_scope;
  nsCOMPtr<nsIInputStream> m_msgStream;
  mozilla::UniquePtr<nsLineBuffer<char>> m_lineBuffer;

  // Transformations
  // With the exception of m_isMultipart, these all apply to the various parts
  bool m_stripHeaders;     // true if we're supposed to strip of message headers
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
  static void StripHtml(nsCString& buf);
  static void Base64Decode(nsCString& buf);
};
#endif
