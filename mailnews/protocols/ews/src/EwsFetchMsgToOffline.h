/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFETCHMSGTOOFFLINE_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFETCHMSGTOOFFLINE_H_

#include <functional>
#include "MailNewsTypes.h"

class nsIMsgFolder;
/**
 * Asynchronously fetch the given message from the server, write it to the
 * local message store, update the msgDB accordingly (storeToken etc...),
 * then call onDone().
 *
 * This function is currently Ews-specific, but could reasonably be made
 * protocol independent.
 *
 * If the operation fails, onDone() will be passed a failure code.
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
nsresult EwsFetchMsgToOffline(nsIMsgFolder* folder, nsMsgKey msgKey,
                              std::function<void(nsresult)> onDone);

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSFETCHMSGTOOFFLINE_H_
