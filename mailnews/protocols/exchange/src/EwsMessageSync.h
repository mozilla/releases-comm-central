/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMESSAGESYNC_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMESSAGESYNC_H_

#include <functional>
#include "MailNewsTypes.h"

class EwsFolder;
class IHeaderBlock;

/**
 * Starts an EWS message sync operation running upon the given folder.
 *
 * `onStart` is called when the operation successfully starts.
 *
 * `onStop` is called when the operation finishes or fails.
 * It is passed the final result status and a list of messages which have
 * been added to the folder. Even if the operation fails, some messages still
 * may have been added.
 *
 * If this function returns a failure code, the operation has failed to start
 * and neither `onStart` or `onStop` will be called.
 */
nsresult EwsPerformMessageSync(
    EwsFolder* folder, std::function<void()> onStart,
    std::function<void(nsresult, nsTArray<nsMsgKey> const&,
                       nsTArray<RefPtr<IHeaderBlock>> const&)>
        onStop);

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMESSAGESYNC_H_
