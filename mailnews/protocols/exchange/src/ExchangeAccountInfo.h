/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEACCOUNTINFO_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEACCOUNTINFO_H_

#include "IExchangeAccountInfo.h"
#include "nsCOMPtr.h"
#include "nsIMsgIncomingServer.h"

/**
 * Provides queries about an account's local folder hierarchy.
 */
class ExchangeAccountInfo final : public IExchangeAccountInfo {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGEACCOUNTINFO

  explicit ExchangeAccountInfo(nsIMsgIncomingServer* server)
      : mServer(server) {}

 private:
  ~ExchangeAccountInfo() = default;

  nsCOMPtr<nsIMsgIncomingServer> mServer;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEACCOUNTINFO_H_
