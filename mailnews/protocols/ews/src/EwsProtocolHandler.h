/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLHANDLER_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLHANDLER_H_

#include "nsIProtocolHandler.h"

class EwsProtocolHandler : public nsIProtocolHandler {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROTOCOLHANDLER

  EwsProtocolHandler();

 protected:
  virtual ~EwsProtocolHandler();
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLHANDLER_H_
