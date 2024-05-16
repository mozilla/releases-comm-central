/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_SERVER_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_SERVER_H

#include "nsID.h"

extern "C" {
// Instantiates a new nsIMsgOutgoingServer with a Rust implementation, that also
// implements nsIEwsServer.
MOZ_EXPORT nsresult nsEwsOutgoingServerConstructor(REFNSIID aIID,
                                                   void** aResult);
}  // extern "C"

#endif  // defined __COMM_MAILNEWS_PROTOCOLS_EWS_SERVER_H
