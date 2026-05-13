/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEPROTOCOLINFO_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEPROTOCOLINFO_H_

#include "nsIMsgProtocolInfo.h"

class ExchangeProtocolInfo : public nsIMsgProtocolInfo {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPROTOCOLINFO

  ExchangeProtocolInfo();

 protected:
  virtual ~ExchangeProtocolInfo();
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEPROTOCOLINFO_H_
