/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGTRANSACTIONSERVICE_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGTRANSACTIONSERVICE_H_

#include "nsIMsgTransactionService.h"
#include "nsITransactionManager.h"
#include "mozilla/TransactionManager.h"

class nsMsgTransactionService : public nsIMsgTransactionService {
 public:
  nsMsgTransactionService();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMSGTRANSACTIONSERVICE
 protected:
  virtual ~nsMsgTransactionService() = default;

 private:
  nsCOMPtr<nsITransactionManager> mTransactionManager;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGTRANSACTIONSERVICE_H_
