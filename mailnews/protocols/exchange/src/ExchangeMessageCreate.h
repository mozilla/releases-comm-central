/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEMESSAGECREATE_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEMESSAGECREATE_H_

#include <functional>
#include "MailNewsTypes.h"

class EwsFolder;
class IHeaderBlock;
class nsIInputStream;

/**
 * Create a message in the given folder, on both the remote server
 * and locally. It starts an asynchronous operation, which invokes the supplied
 * callback upon completion.
 *
 * @param destFolder  The folder in which the message is to be created.
 * @param srcRaw      A stream which will serve up the raw rfc5322 message
 *                    data when read.
 * @param isRead      If set, the resulting message will be marked read (both
 *                    locally and remotely).
 * @param isDraft     This is a little nebulous and needs to be better defined.
 *                    For EWS it affects the server-side "unchanged" property,
 *                    but it's not quite clear why or what the effect is.
 * @param onComplete  Callback to invoked upon completion, with either the
 *                    newly-created nsIMsgDBHdr or a failure code.
 *
 * @returns           A success code if (and only if) the operation was
 *                    successfully started.
 */
nsresult ExchangePerformMessageCreate(
    EwsFolder* destFolder, nsIInputStream* srcRaw, bool isRead, bool isDraft,
    std::function<void(nsresult, nsIMsgDBHdr*)> onComplete);

/**
 * Create a message in the given folder, on both the remote server
 * and locally, using an existing nsIMsgDBHdr as a template to copy
 * properties from.
 * It starts an asynchronous operation, which invokes the supplied
 * callback upon completion.
 *
 * @param destFolder  The folder in which the message is to be created.
 * @param srcRaw      A stream which will serve up the raw rfc5322 message
 *                    data when read.
 * @param srcHdr      An existing nsIMsgDBHdr to copy properties from, likely
 *                    in another folder.
 * @param srcExcludeProperties
 *                    A list of properties to exclude from the header copy.
 * @param isDraft     This is a little nebulous and needs to be better defined.
 *                    For EWS it affects the server-side "unchanged" property,
 *                    but it's not quite clear why or what the effect is.
 * @param onComplete  Callback to invoked upon completion, with either the
 *                    newly-created nsIMsgDBHdr or a failure code.
 *
 * @returns           A success code if (and only if) the operation was
 *                    successfully started.
 */
nsresult ExchangePerformMessageCreateFromCopy(
    EwsFolder* destFolder, nsIInputStream* srcRaw, nsIMsgDBHdr* srcHdr,
    nsTArray<nsCString> const& srcExcludeProperties, bool isDraft,
    std::function<void(nsresult, nsIMsgDBHdr*)> onComplete);

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEMESSAGECREATE_H_
