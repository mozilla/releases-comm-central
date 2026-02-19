/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MailHeaderParsing.h"

#include "MailNewsTypes.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"
#include "nsReadableUtils.h"
#include "nsURLHelper.h"  // For net_ParseContentType().
#include "HeaderReader.h"
#include "IHeaderBlock.h"
#include "nsIMimeConverter.h"
#include "mozilla/Components.h"

// Attempt to extract a timestamp from a "Received:" header value, e.g:
// "from bar.com by foo.com ; Thu, 21 May 1998 05:33:29 -0700".
// Returns 0 if no timestamp could be extracted.
static PRTime TimestampFromReceived(nsACString const& received) {
  int32_t sep = received.RFindChar(';');
  if (sep == kNotFound) {
    return 0;
  }
  auto dateStr = Substring(received, sep + 1);
  PRTime time;
  if (PR_ParseTimeString(PromiseFlatCString(dateStr).get(), false, &time) !=
      PR_SUCCESS) {
    return 0;
  }
  return time;
}

// NOTE:
// Does not attempt to use fallback timestamps.
//  - RawHdr.date is from the "Date": header, else 0.
//  - RawHdr.dateReceived is from the first "Received:" header, else 0.
// Any fallback policy (e.g. to mbox timestamp or PR_Now()) is left up to
// the caller.
//
// Does not strip "Re:" off subject.
//
// Does not generate missing Message-Id (nsParseMailMessageState uses an
// md5sum of the header block).
RawHdr ParseRawMailHeaders(mozilla::Span<const char> raw) {
  // NOTE: old code aggregates multiple To: and Cc: header occurrences.
  // Turns them into comma-separated lists.
  // See nsParseMailMessageState::FinalizeHeaders().

  RawHdr out;
  HeaderReader rdr;

  // RFC5322 says 0 or 1 occurrences for each of "To:" and "Cc:", but we'll
  // aggregate multiple.
  AutoTArray<nsCString, 1> toValues;   // Collect "To:" values.
  AutoTArray<nsCString, 1> ccValues;   // Collect "Cc:" values.
  AutoTArray<nsCString, 1> bccValues;  // Collect "Bcc:" values.
  nsAutoCString newsgroups;            // "Newsgroups:" value.
  nsAutoCString mozstatus;
  nsAutoCString mozstatus2;
  nsAutoCString status;  // "Status:" value
  rdr.Parse(raw, [&](HeaderReader::Hdr const& hdr) -> bool {
    auto const& n = hdr.Name(raw);
    // Alphabetical, because why not?
    if (n.LowerCaseEqualsLiteral("bcc")) {
      // Collect multiple "Bcc:" values.
      bccValues.AppendElement(hdr.Value(raw));
    } else if (n.LowerCaseEqualsLiteral("cc")) {
      // Collect multiple "Cc:" values.
      ccValues.AppendElement(hdr.Value(raw));
    } else if (n.LowerCaseEqualsLiteral("content-type")) {
      nsAutoCString contentType;
      nsAutoCString charset;
      bool hasCharset;
      net_ParseContentType(hdr.Value(raw), contentType, charset, &hasCharset);
      if (hasCharset) {
        out.charset = charset;
      }
      if (contentType.LowerCaseEqualsLiteral("multipart/mixed")) {
        out.flags |= nsMsgMessageFlags::Attachment;
      }
    } else if (n.LowerCaseEqualsLiteral("date")) {
      nsCString dateStr = hdr.Value(raw);
      PRTime time;
      if (PR_ParseTimeString(dateStr.get(), false, &time) == PR_SUCCESS) {
        out.date = time;
      }
    } else if (n.LowerCaseEqualsLiteral("disposition-notification-to")) {
      // TODO: should store value? (nsParseMailMessageState doesn't)
      // flags |= nsMsgMessageFlags::MDNReportNeeded;
    } else if (n.LowerCaseEqualsLiteral("delivery-date")) {
      // NOTE: nsParseMailMessageState collects this and uses it as a fallback
      // if it can't get a receipt timestamp from "Received":.
      // But it seems pretty obscure, so leaving it out.
      // (It seems to be a X.400 -> RFC 822 mapping).
    } else if (n.LowerCaseEqualsLiteral("from")) {
      // "From:" takes precedence over "Sender:".
      out.sender = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("in-reply-to")) {
      // "In-Reply-To:" used as a fallback for missing "References:".
      if (out.references.IsEmpty()) {
        auto ids = ParseIdentificationFields(hdr.Value(raw));
        if (!ids.IsEmpty()) {
          out.references = {ids[0]};
        }
      }
    } else if (n.LowerCaseEqualsLiteral("message-id")) {
      auto ids = ParseIdentificationFields(hdr.Value(raw));
      if (!ids.IsEmpty()) {
        out.messageId = ids[0];
      }
    } else if (n.LowerCaseEqualsLiteral("newsgroups")) {
      // We _might_ need this for recipients (see below).
      newsgroups = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("original-recipient")) {
      // NOTE: unused in nsParseMailMessageState.
    } else if (n.LowerCaseEqualsLiteral("priority")) {
      // Treat "Priority:" and "X-Priority:" the same way.
      NS_MsgGetPriorityFromString(hdr.Value(raw).get(), out.priority);
    } else if (n.LowerCaseEqualsLiteral("references")) {
      out.references = ParseIdentificationFields(hdr.Value(raw));
    } else if (n.LowerCaseEqualsLiteral("return-path")) {
      // NOTE: unused in nsParseMailMessageState.
    } else if (n.LowerCaseEqualsLiteral("return-receipt-to")) {
      // NOTE: nsParseMailMessageState treats "Return-Receipt-To:" as
      // "Disposition-Notification-To:".
      // flags |= nsMsgMessageFlags::MDNReportNeeded;
    } else if (n.LowerCaseEqualsLiteral("received")) {
      // Record the timestamp from the first (closest) "Received:" header.
      // (See RFC 5321).
      if (out.dateReceived == 0) {
        out.dateReceived = TimestampFromReceived(hdr.Value(raw));
      }
    } else if (n.LowerCaseEqualsLiteral("reply-to")) {
      out.replyTo = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("sender")) {
      // "From:" takes precedence over "Sender:".
      if (out.sender.IsEmpty()) {
        out.sender = hdr.Value(raw);
      }
    } else if (n.LowerCaseEqualsLiteral("status")) {
      status = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("subject")) {
      out.subject = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("to")) {
      toValues.AppendElement(hdr.Value(raw));
    } else if (n.LowerCaseEqualsLiteral("x-account-key")) {
      out.accountKey = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("x-mozilla-keys")) {
      out.keywords = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("x-mozilla-status")) {
      mozstatus = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("x-mozilla-status2")) {
      mozstatus2 = hdr.Value(raw);
    } else if (n.LowerCaseEqualsLiteral("x-priority")) {
      // Treat "Priority:" and "X-Priority:" the same way.
      NS_MsgGetPriorityFromString(hdr.Value(raw).get(), out.priority);
    } else {
      // TODO: check custom keys.
    }
    return true;  // Keep going.
  });

  nsCOMPtr<nsIMimeConverter> mimeConverter;
  mimeConverter = mozilla::components::MimeConverter::Service();
  NS_ENSURE_TRUE(mimeConverter, out);
  mimeConverter->DecodeMimeHeaderToUTF8(out.sender, out.charset.get(), true,
                                        true, out.sender);
  mimeConverter->DecodeMimeHeaderToUTF8(out.subject, out.charset.get(), true,
                                        true, out.subject);

  // Merge multiple "Cc:" values.
  out.ccList = StringJoin(","_ns, ccValues);
  mimeConverter->DecodeMimeHeaderToUTF8(out.ccList, out.charset.get(), true,
                                        true, out.ccList);
  // Merge multiple "Bcc:" values.
  out.bccList = StringJoin(","_ns, bccValues);
  mimeConverter->DecodeMimeHeaderToUTF8(out.bccList, out.charset.get(), true,
                                        true, out.bccList);

  // Fill in recipients, with fallbacks.
  if (!toValues.IsEmpty()) {
    out.recipients = StringJoin(","_ns, toValues);
    mimeConverter->DecodeMimeHeaderToUTF8(out.recipients, out.charset.get(),
                                          true, true, out.recipients);
  } else if (!out.ccList.IsEmpty()) {
    out.recipients = out.ccList;
  } else if (!newsgroups.IsEmpty()) {
    // In the case where the recipient is a newsgroup, truncate the string
    // at the first comma.  This is used only for presenting the thread
    // list, and newsgroup lines tend to be long and non-shared.
    auto splitter = newsgroups.Split(',');
    auto first = splitter.begin();
    if (first != splitter.end()) {
      out.recipients = *first;
    }
  }

  // Figure out flags from assorted headers.
  out.flags = 0;
  if (mozstatus.Length() == 4 && MsgIsHex(mozstatus.get(), 4)) {
    uint32_t xflags = MsgUnhex(mozstatus.get(), 4);
    // Mask out a few "phantom" flags, which shouldn't be persisted.
    xflags &= ~nsMsgMessageFlags::RuntimeOnly;
    out.flags |= xflags;
  } else if (!status.IsEmpty()) {
    // Parse a little bit of the Berkeley Mail "Status:" header.
    // NOTE: Can't find any proper documentation on "Status:".
    // Maybe it's time to ditch it?
    if (status.FindCharInSet("RrO"_ns) != kNotFound) {
      out.flags |= nsMsgMessageFlags::Read;
    }
    if (status.FindCharInSet("NnUu"_ns) != kNotFound) {
      out.flags &= ~nsMsgMessageFlags::Read;
    }
    // Ignore 'd'/'D' (deleted)
  }
  if (mozstatus.Length() == 8 && MsgIsHex(mozstatus.get(), 8)) {
    uint32_t xflags = MsgUnhex(mozstatus.get(), 8);
    // Mask out a few "phantom" flags, which shouldn't be persisted.
    xflags &= ~nsMsgMessageFlags::RuntimeOnly;
    // Only upper 16 bits used for "X-Mozilla-Status2:".
    xflags |= xflags & 0xFFFF0000;
    out.flags |= xflags;
  }

  // TODO: nsParseMailMessageState leaves replyTo unset if "Reply-To:" is
  // same as "Sender:" or "From:". Not sure we should implement that or not.

  // TODO: disposition-notification-to handling. Some flags cancel out.
  // nsParseMailMessageState doesn't seem to store
  // "Disposition-Notification-To" value, but we support sending receipt
  // notifications, right? So how is it implemented? Investigation needed.

  // TODO: custom header storage
  return out;
}

RawHdr ParseHeaderBlock(IHeaderBlock* headers) {
  // Implementation Note:
  // This is a wrapper around ParseRawMailHeaders(), but it's really a
  // little inside-out. ParseRawMailHeaders() should really just wrap the raw
  // string with an IHeaderBlock and use that interface to iterate over the
  // header fields.
  // Ideally, IHeaderBlock->AsRaw() should never be needed.
  nsCString raw;
  nsresult rv = headers->AsRaw(raw);
  if (NS_FAILED(rv)) {
    // Should never happen, but XPCOM doesn't really do infallible methods :-(
    NS_WARNING("IHeaderBlock.asRaw() failed.");
    return RawHdr{};  // Blank.
  }
  return ParseRawMailHeaders(raw);
}
