/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_EMITTERS_NSEMITTERUTILS_H_
#define COMM_MAILNEWS_MIME_EMITTERS_NSEMITTERUTILS_H_

#include "prmem.h"
#include "plstr.h"

extern "C" bool EmitThisHeaderForPrefSetting(int32_t dispType,
                                             const char* header);

#endif  // COMM_MAILNEWS_MIME_EMITTERS_NSEMITTERUTILS_H_
