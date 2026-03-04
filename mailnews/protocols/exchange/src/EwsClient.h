/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSCLIENT_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSCLIENT_H_

#include "nsID.h"

extern "C" {
// Instantiates a new IEwsClient with a Rust implementation.
MOZ_EXPORT nsresult NS_CreateEwsClient(REFNSIID aIID, void** aResult);
}

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSCLIENT_H_
