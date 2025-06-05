/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSNEWMAILNEWSURI_H_
#define COMM_MAILNEWS_BASE_SRC_NSNEWMAILNEWSURI_H_

#include "nsIURI.h"

// Instantiates a new `nsIURI` of the appropriate concrete type for the provided
// URI spec.
nsresult NS_NewMailnewsURI(nsIURI** aURI, const nsACString& aSpec,
                           const char* aCharset /* = nullptr */,
                           nsIURI* aBaseURI /* = nullptr */);

#endif  // COMM_MAILNEWS_BASE_SRC_NSNEWMAILNEWSURI_H_
