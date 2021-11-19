/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef NS_NEWSUTILS_H
#define NS_NEWSUTILS_H

#include "nsString.h"
#include "MailNewsTypes2.h"

#define kNewsRootURI "news:/"
#define kNntpRootURI "nntp:/"
#define kNewsMessageRootURI "news-message:/"
#define kNewsURIGroupQuery "?group="
#define kNewsURIKeyQuery "&key="

#define kNewsRootURILen 6
#define kNntpRootURILen 6
#define kNewsMessageRootURILen 14
#define kNewsURIGroupQueryLen 7
#define kNewsURIKeyQueryLen 5

extern nsresult nsParseNewsMessageURI(const nsACString& uri, nsCString& group,
                                      nsMsgKey* key);

extern nsresult nsCreateNewsBaseMessageURI(const nsACString& baseURI,
                                           nsCString& baseMessageURI);

#endif  // NS_NEWSUTILS_H
