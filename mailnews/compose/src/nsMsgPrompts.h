/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_COMPOSE_SRC_NSMSGPROMPTS_H_
#define COMM_MAILNEWS_COMPOSE_SRC_NSMSGPROMPTS_H_

#include "nscore.h"
#include "nsError.h"
#include "nsString.h"

class mozIDOMWindowProxy;

nsresult nsMsgGetMessageByName(const char* aName, nsString& aResult);
nsresult nsMsgBuildMessageWithFile(nsIFile* aFile, nsString& aResult);
nsresult nsMsgBuildMessageWithTmpFile(nsIFile* aFile, nsString& aResult);
nsresult nsMsgDisplayMessageByName(mozIDOMWindowProxy* window,
                                   const char* aName,
                                   const char16_t* windowTitle = nullptr);
nsresult nsMsgDisplayMessageByString(mozIDOMWindowProxy* window,
                                     const char16_t* msg,
                                     const char16_t* windowTitle = nullptr);
nsresult nsMsgAskBooleanQuestionByString(mozIDOMWindowProxy* window,
                                         const char16_t* msg, bool* answer,
                                         const char16_t* windowTitle = nullptr);

#endif  // COMM_MAILNEWS_COMPOSE_SRC_NSMSGPROMPTS_H_
