/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFETCHMSGSTOOFFLINE_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFETCHMSGSTOOFFLINE_H_

#include <functional>
#include "MailNewsTypes.h"
#include "nsTArray.h"

class nsIMsgFolder;
/**
 * Asynchronously download the given messages, write them to the local
 * messageStore, update db to set storeToken/offlineMessageSize etc...
 *
 * When all messages are successfully downloaded:
 *  - onDone() will be invoked with NS_OK.
 *
 * If an error occurs while downloading a message:
 *  - onDone() will be invoked with the failure code.
 *  - no more messages will be downloaded.
 *
 * If the call to EwsFetchMsgsToOffline() returns an error code,
 * no async operation will be started and onDone() will _not_
 * be invoked.
 *
 * If the call to EwsFetchMsgsToOffline() succeeds, it will return
 * NS_OK and the async operation will be started.
 * If the async operation is started, onDone() will _always_ be
 * invoked when it completes, with the resultant status.
 *
 * NOTE: writes to mbox stores can be preempted - this is where something
 * starts writing a message when a write is already ongoing.
 * When this happens, the old write will be failed (and rolled back) and
 * the new write will be allowed.
 * If that happens while this function is running, it'll manifest itself
 * as a failure code passed out to onDone(), most likely
 * NS_BASE_STREAM_CLOSED.
 *
 */
nsresult EwsFetchMsgsToOffline(nsIMsgFolder* folder,
                               nsTArray<nsMsgKey> const& msgKeys,
                               std::function<void(nsresult)> onDone);

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFETCHMSGSTOOFFLINE_H_
