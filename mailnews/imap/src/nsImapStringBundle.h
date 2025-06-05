/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPSTRINGBUNDLE_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPSTRINGBUNDLE_H_

#include "nsIStringBundle.h"

PR_BEGIN_EXTERN_C

nsresult IMAPGetStringByName(const char* stringName, char16_t** aString);
nsresult IMAPGetStringBundle(nsIStringBundle** aBundle);

PR_END_EXTERN_C

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPSTRINGBUNDLE_H_
