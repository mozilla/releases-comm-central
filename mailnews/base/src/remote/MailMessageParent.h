/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_REMOTE_MAILMESSAGEPARENT_H_
#define COMM_MAILNEWS_BASE_SRC_REMOTE_MAILMESSAGEPARENT_H_

#include "mozilla/ipc/ProtocolUtils.h"
#include "mozilla/net/NeckoChannelParams.h"
#include "mozilla/net/PNeckoParent.h"

using mozilla::ipc::IPCResult;
using mozilla::net::LoadInfoArgs;
using GetMailMessageStreamResolver =
    mozilla::net::PNeckoParent::GetMailMessageStreamResolver;

/**
 * This parent process class handles requests from a child process (via
 * NeckoParent) for mail message data.
 */
class MailMessageParent {
 public:
  static IPCResult RecvGetMailMessageStream(
      nsIURI* uri, const LoadInfoArgs& loadInfo,
      GetMailMessageStreamResolver&& resolve);
};

#endif  // COMM_MAILNEWS_BASE_SRC_REMOTE_MAILMESSAGEPARENT_H_
