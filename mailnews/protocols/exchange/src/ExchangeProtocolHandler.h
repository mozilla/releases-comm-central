/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEPROTOCOLHANDLER_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEPROTOCOLHANDLER_H_

#include "nsIProtocolHandler.h"

class ExchangeProtocolHandler : public nsIProtocolHandler {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROTOCOLHANDLER

  explicit ExchangeProtocolHandler(const nsACString& aScheme);

 protected:
  virtual ~ExchangeProtocolHandler();

 private:
  nsAutoCString mExchangeScheme;
};

// Factory functions for protocol-specific instantiation
extern "C" {
nsresult NS_CreateEwsProtocolHandler(REFNSIID aIID, void** aResult);
nsresult NS_CreateGraphProtocolHandler(REFNSIID aIID, void** aResult);
}

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEPROTOCOLHANDLER_H_
