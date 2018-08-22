/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCommonBaseCID.h"
#include "nsTransactionManagerExtra.h"
#include "mozilla/TransactionManager.h"

NS_IMPL_ISUPPORTS(nsTransactionManagerExtra,
                  nsITransactionManagerExtra)

NS_IMETHODIMP
nsTransactionManagerExtra::CreateTransactionManager(nsITransactionManager** aManager)
{
  NS_ENSURE_ARG_POINTER(aManager);
  nsCOMPtr<nsITransactionManager> manager = new mozilla::TransactionManager();
  manager.forget(aManager);
  return NS_OK;
}

nsTransactionManagerExtra::~nsTransactionManagerExtra()
{
}
