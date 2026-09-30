/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMESSENGER_H_
#define COMM_MAILNEWS_BASE_SRC_NSMESSENGER_H_

#include "nsIMessenger.h"
#include "nsCOMPtr.h"
#include "nsITransactionManager.h"
#include "nsWeakReference.h"

class nsMessenger : public nsIMessenger, public nsSupportsWeakReference {
 public:
  nsMessenger();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGER

 protected:
  virtual ~nsMessenger();

 private:
  nsCOMPtr<nsITransactionManager> mTxnMgr;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMESSENGER_H_
