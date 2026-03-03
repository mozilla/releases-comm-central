/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_MAILHEADERPARSING_H_
#define COMM_MAILNEWS_BASE_SRC_MAILHEADERPARSING_H_

/**
 * Functions to help parse RFC5322 headers and extract the metadata we need
 * to store in our message database.
 */

#include "nsIMsgDatabase.h"
#include "mozilla/Span.h"

class IHeaderBlock;
struct RawHdr;

/**
 * Parses a raw RFC5322 message header block, using the values to fill out
 * a RawHdr struct ready for loading into our message DB.
 */
RawHdr ParseRawMailHeaders(mozilla::Span<const char> raw);

/**
 * Populates a RawHdr struct using data provided by an IHeaderBlock.
 * NOTE: Ultimately the plan is to provide all mail header data via
 * IHeaderBlock objects, rather than passing about raw rfc5322 strings
 * that require further parsing.
 * That way, rfc5322-native protocols (e.g. POP3, IMAP) can just wrap an
 * IHeaderBlock implementation around a raw rfc5322 header block, and
 * "foreign" protocols (e.g. EWS/Graph), can provide a custom IHeaderBlock
 * which handles mapping required metadata without having to construct an
 * artificial RFC5322 string.
 * This function is a bit of an interim step, until we take the jump and
 * have the DB message-adding functions just take a IHeaderBlock directly.
 */
RawHdr ParseHeaderBlock(IHeaderBlock* headers);

#endif  // COMM_MAILNEWS_BASE_SRC_MAILHEADERPARSING_H_
