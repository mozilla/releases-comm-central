/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_SRC_MIMEMMIX_H_
#define COMM_MAILNEWS_MIME_SRC_MIMEMMIX_H_

#include "mimemult.h"
#include "nsIMailChannel.h"
#include "nsCOMPtr.h"
#include "nsIMsgOpenPGPSink.h"
#include "nsTArray.h"
#include "mimepbuf.h"

/* The MimeMultipartMixed class implements the multipart/mixed MIME container.
 */

typedef struct MimeMultipartMixedClass MimeMultipartMixedClass;
typedef struct MimeMultipartMixed MimeMultipartMixed;

struct MimeMultipartMixedClass {
  MimeMultipartClass multipart;
};

extern MimeMultipartMixedClass mimeMultipartMixedClass;

class MMMCppMembers;

struct MimeMultipartMixed {
  MimeMultipart multipart;

  MimePartBufferData* payload;

  // These are the states of the parser state machine.
  // In general, the states move forward, only.
  // The only exception is expectingSigContinueOrOtherHeader.
  // When a non-continuation line follows a Sig header, we allow
  // going back to expectingSigOrOtherHeader, to allow multiple
  // consecutive Sig headers to be processed.
  enum {
    expectingInitialBoundary,
    expectingSigOrOtherHeader,
    expectingSigContinueOrOtherHeader,
    expectingMoreHeadersOrEndOfHeaders,
    expectingBodyLinesOrBoundary,
    skippingOverAdditionalParts
  } headerState;

  // Make sure that trailing CRLF which must be excluded from signature
  // calculcation are never written into our buffer. We do this by
  // not writing CRLF until we know that non-CRLF follows.
  unsigned int postponedCRLFCounter;

  uint16_t childCounter;
  nsCString url;

  MMMCppMembers* cpp;
};

class MMMCppMembers {
  friend struct MimeMultipartMixed;

 public:
  mozilla::Maybe<bool> isTopPart;
  nsTArray<nsCString> sigs;
  nsCOMPtr<nsIMsgOpenPGPSink> openpgpSink;
  nsCString currentSig;
};

#define MimeMultipartMixedClassInitializer(ITYPE, CSUPER) \
  {MimeMultipartClassInitializer(ITYPE, CSUPER)}

#endif  // COMM_MAILNEWS_MIME_SRC_MIMEMMIX_H_
