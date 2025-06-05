/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_PUBLIC_MAILNEWSTYPES_H_
#define COMM_MAILNEWS_BASE_PUBLIC_MAILNEWSTYPES_H_

#include "msgCore.h"
#include "MailNewsTypes2.h"

const nsMsgKey nsMsgKey_None = 0xffffffff;
const nsMsgViewIndex nsMsgViewIndex_None = 0xFFFFFFFF;

/* kSizeUnknown is a special value of folder size that indicates the size
 * is unknown yet. Usually this causes the folder to determine the real size
 * immediately as it is queried by a consumer.
 */
const int64_t kSizeUnknown = -1;

#endif  // COMM_MAILNEWS_BASE_PUBLIC_MAILNEWSTYPES_H_
