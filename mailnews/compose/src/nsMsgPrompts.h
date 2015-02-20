/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgPrompts_H_
#define _nsMsgPrompts_H_

#include "nscore.h"
#include "nsError.h"
#include "nsStringGlue.h"

class nsIPrompt;

nsresult      nsMsgGetMessageByName(const char16_t* aName, nsString& aResult);
nsresult      nsMsgBuildMessageWithFile(nsIFile * aFile, nsString& aResult);
nsresult      nsMsgBuildMessageWithTmpFile(nsIFile * aFile, nsString& aResult);
nsresult      nsMsgDisplayMessageByName(nsIPrompt *aPrompt, const char16_t *aName, const char16_t *windowTitle = nullptr);
nsresult      nsMsgDisplayMessageByString(nsIPrompt * aPrompt, const char16_t * msg, const char16_t * windowTitle = nullptr);
nsresult      nsMsgAskBooleanQuestionByString(nsIPrompt * aPrompt, const char16_t * msg, bool *answer, const char16_t * windowTitle = nullptr);

#endif /* _nsMsgPrompts_H_ */
