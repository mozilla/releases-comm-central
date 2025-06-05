/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_SRC_NSSIMPLEMIMECONVERTERSTUB_H_
#define COMM_MAILNEWS_MIME_SRC_NSSIMPLEMIMECONVERTERSTUB_H_

#include "nsIMimeContentTypeHandler.h"

nsresult MIME_NewSimpleMimeConverterStub(const char* aContentType,
                                         nsIMimeContentTypeHandler** aResult);

#endif  // COMM_MAILNEWS_MIME_SRC_NSSIMPLEMIMECONVERTERSTUB_H_
