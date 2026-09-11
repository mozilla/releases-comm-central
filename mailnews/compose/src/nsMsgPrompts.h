/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_COMPOSE_SRC_NSMSGPROMPTS_H_
#define COMM_MAILNEWS_COMPOSE_SRC_NSMSGPROMPTS_H_

#include "nscore.h"
#include "nsString.h"

// TODO: When bug 2032686 removes the nsMsgSendLater caller, move this helper
// into nsMsgCompose.cpp and remove nsMsgPrompts.{h,cpp}.
nsresult ShowSendAlert(const nsACString& aL10nId);

#endif  // COMM_MAILNEWS_COMPOSE_SRC_NSMSGPROMPTS_H_
