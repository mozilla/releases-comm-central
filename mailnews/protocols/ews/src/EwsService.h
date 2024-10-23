/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_SERVICE_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_SERVICE_H

#include "nsIMsgMessageService.h"

class EwsService : public nsIMsgMessageService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGMESSAGESERVICE

  EwsService();

 protected:
  virtual ~EwsService();

 private:
  nsresult MsgHdrFromUri(nsIURI* uri, nsIMsgDBHdr** _retval);
  nsresult NewURIForChannel(const nsACString& spec, nsIURI** channelUri);
};

#endif
