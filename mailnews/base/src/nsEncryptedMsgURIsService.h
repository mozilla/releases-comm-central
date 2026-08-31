/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSENCRYPTEDMSGURISSERVICE_H_
#define COMM_MAILNEWS_BASE_SRC_NSENCRYPTEDMSGURISSERVICE_H_

#include "nsIEncryptedMsgURIsService.h"
#include "nsTArray.h"
#include "nsString.h"

class nsEncryptedMsgURIsService : public nsIEncryptedMsgURIsService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIENCRYPTEDMSGURISSERVICE

  nsEncryptedMsgURIsService();

 protected:
  virtual ~nsEncryptedMsgURIsService();
  nsTArray<nsCString> mEncryptedURIs;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSENCRYPTEDMSGURISSERVICE_H_
