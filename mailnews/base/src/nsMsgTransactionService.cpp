/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgTransactionService.h"

NS_IMPL_ISUPPORTS(nsMsgTransactionService, nsIMsgTransactionService)
nsMsgTransactionService::nsMsgTransactionService() {
  mTransactionManager = new mozilla::TransactionManager();
  mTransactionManager->SetMaxTransactionCount(-1);
}

NS_IMETHODIMP nsMsgTransactionService::GetTransactionManager(
    nsITransactionManager** aTransactionManager) {
  NS_ENSURE_ARG_POINTER(aTransactionManager);
  NS_IF_ADDREF(*aTransactionManager = mTransactionManager);
  return NS_OK;
}

NS_IMETHODIMP nsMsgTransactionService::SetTransactionManager(
    nsITransactionManager* aTransactionManager) {
  mTransactionManager = aTransactionManager;
  return NS_OK;
}
