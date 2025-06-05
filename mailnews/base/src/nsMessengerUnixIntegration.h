/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMESSENGERUNIXINTEGRATION_H_
#define COMM_MAILNEWS_BASE_SRC_NSMESSENGERUNIXINTEGRATION_H_

#include "nsIMessengerOSIntegration.h"
#include "nsID.h"

extern "C" {
// Implemented in Rust.
MOZ_EXPORT nsresult nsLinuxSysTrayHandlerConstructor(REFNSIID aIID,
                                                     void** aResult);
}  // extern "C"

#endif  // COMM_MAILNEWS_BASE_SRC_NSMESSENGERUNIXINTEGRATION_H_
