/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_SERVICE_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_SERVICE_H

#include "nsIMsgMessageService.h"
#include "nsIProtocolHandler.h"

class EwsService : public nsIMsgMessageService, public nsIProtocolHandler {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGMESSAGESERVICE
  NS_DECL_NSIPROTOCOLHANDLER

  EwsService();

 protected:
  virtual ~EwsService();
};

#endif
