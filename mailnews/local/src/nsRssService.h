/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_LOCAL_SRC_NSRSSSERVICE_H_
#define COMM_MAILNEWS_LOCAL_SRC_NSRSSSERVICE_H_

#include "nsIRssService.h"
#include "nsIMsgProtocolInfo.h"

class nsRssService : public nsIMsgProtocolInfo, public nsIRssService {
 public:
  nsRssService();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIRSSSERVICE
  NS_DECL_NSIMSGPROTOCOLINFO

 private:
  virtual ~nsRssService();
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_NSRSSSERVICE_H_
