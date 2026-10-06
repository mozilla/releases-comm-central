/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_TELEMETRYRECORDER_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_TELEMETRYRECORDER_H_

#include "nsID.h"

extern "C" {
// Instantiates a new ITelemetryRecorder for EWS with a Rust implementation.
MOZ_EXPORT nsresult NS_CreateEwsTelemetryRecorder(REFNSIID aIID,
                                                  void** aResult);
// Instantiates a new ITelemetryRecorder for Graph with a Rust implementation.
MOZ_EXPORT nsresult NS_CreateGraphTelemetryRecorder(REFNSIID aIID,
                                                    void** aResult);
}

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EWSCLIENT_H_
