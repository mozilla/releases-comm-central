/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_PROTOCOL_HANDLER_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_PROTOCOL_HANDLER_H

#include "nsIProtocolHandler.h"

class EwsProtocolHandler : public nsIProtocolHandler {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROTOCOLHANDLER

  EwsProtocolHandler();

 protected:
  virtual ~EwsProtocolHandler();
};

#endif
