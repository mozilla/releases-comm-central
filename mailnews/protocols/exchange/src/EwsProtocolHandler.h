/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLHANDLER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLHANDLER_H_

#include "nsIProtocolHandler.h"
#include "nsString.h"

class EwsProtocolHandler : public nsIProtocolHandler {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROTOCOLHANDLER

  explicit EwsProtocolHandler(const nsACString& exchangeScheme);

 protected:
  virtual ~EwsProtocolHandler();

 private:
  nsAutoCString mExchangeScheme;
};

MOZ_EXPORT nsresult NS_CreateEwsProtocolHandler(REFNSIID aIID, void** aResult);
MOZ_EXPORT nsresult NS_CreateGraphProtocolHandler(REFNSIID aIID,
                                                  void** aResult);

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLHANDLER_H_
