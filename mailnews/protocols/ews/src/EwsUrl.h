/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __COMM_MAILNEWS_PROTOCOLS_EWS_URL_H
#define __COMM_MAILNEWS_PROTOCOLS_EWS_URL_H

#include "nsMsgMailNewsUrl.h"

/**
 * This class is all but unnecessary, but `nsMsgMailNewsUrl` does not offer a
 * public means of construction for cases where a mailnews URL is needed for API
 * reasons but has no special logic.
 */
class EwsUrl : public nsMsgMailNewsUrl {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  EwsUrl();

 protected:
  virtual ~EwsUrl();
};

#endif
