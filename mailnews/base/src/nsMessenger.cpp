/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessenger.h"

#include "mozilla/Components.h"
#include "nsITransaction.h"
#include "nsMsgTxn.h"
#include "nsIMsgTransactionService.h"
#include "nsMsgUtils.h"

nsMessenger::nsMessenger() {}

nsMessenger::~nsMessenger() {}

NS_IMPL_ISUPPORTS(nsMessenger, nsIMessenger, nsISupportsWeakReference)

NS_IMETHODIMP nsMessenger::SetWindow(mozIDOMWindowProxy* aWin,
                                     nsIMsgWindow* aMsgWindow) {
  if (aWin) {
    nsCOMPtr<nsIMsgTransactionService> txns =
        mozilla::components::Txns::Service();
    NS_ENSURE_STATE(txns);
    txns->GetTransactionManager(getter_AddRefs(mTxnMgr));
  }
  return NS_OK;
}

NS_IMETHODIMP nsMessenger::GetUndoTransactionType(uint32_t* txnType) {
  NS_ENSURE_TRUE(txnType && mTxnMgr, NS_ERROR_NULL_POINTER);
  *txnType = nsMessenger::eUnknown;
  nsCOMPtr<nsITransaction> txn;
  nsresult rv = mTxnMgr->PeekUndoStack(getter_AddRefs(txn));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!txn) {
    return NS_OK;  // Nothing to undo.
  }
  // Manager holds nsITransactions, but txnType is added by nsIMsgTxn.
  nsCOMPtr<nsIMsgTxn> msgTxn = do_QueryInterface(txn, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return msgTxn->GetTxnType(txnType);
}

NS_IMETHODIMP nsMessenger::CanUndo(bool* bValue) {
  NS_ENSURE_TRUE(bValue && mTxnMgr, NS_ERROR_NULL_POINTER);

  nsresult rv;
  *bValue = false;
  int32_t count = 0;
  rv = mTxnMgr->GetNumberOfUndoItems(&count);
  if (NS_SUCCEEDED(rv) && count > 0) *bValue = true;
  return rv;
}

NS_IMETHODIMP nsMessenger::GetRedoTransactionType(uint32_t* txnType) {
  NS_ENSURE_TRUE(txnType && mTxnMgr, NS_ERROR_NULL_POINTER);

  *txnType = nsMessenger::eUnknown;
  nsCOMPtr<nsITransaction> txn;
  nsresult rv = mTxnMgr->PeekRedoStack(getter_AddRefs(txn));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!txn) {
    return NS_OK;  // Nothing to redo.
  }
  // Manager holds nsITransactions, but txnType is added by nsIMsgTxn.
  nsCOMPtr<nsIMsgTxn> msgTxn = do_QueryInterface(txn, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return msgTxn->GetTxnType(txnType);
}

NS_IMETHODIMP nsMessenger::CanRedo(bool* bValue) {
  NS_ENSURE_TRUE(bValue && mTxnMgr, NS_ERROR_NULL_POINTER);

  nsresult rv;
  *bValue = false;
  int32_t count = 0;
  rv = mTxnMgr->GetNumberOfRedoItems(&count);
  if (NS_SUCCEEDED(rv) && count > 0) *bValue = true;
  return rv;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMessenger::Undo(nsIMsgWindow* msgWindow) {
  nsresult rv = NS_OK;
  if (mTxnMgr) {
    int32_t numTxn = 0;
    rv = mTxnMgr->GetNumberOfUndoItems(&numTxn);
    if (NS_SUCCEEDED(rv) && numTxn > 0) {
      nsCOMPtr<nsITransaction> txn;
      rv = mTxnMgr->PeekUndoStack(getter_AddRefs(txn));
      if (NS_SUCCEEDED(rv) && txn) {
        static_cast<nsMsgTxn*>(static_cast<nsITransaction*>(txn.get()))
            ->SetMsgWindow(msgWindow);
      }
      nsCOMPtr<nsITransactionManager> txnMgr = mTxnMgr;
      txnMgr->UndoTransaction();
    }
  }
  return rv;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMessenger::Redo(nsIMsgWindow* msgWindow) {
  nsresult rv = NS_OK;
  if (mTxnMgr) {
    int32_t numTxn = 0;
    rv = mTxnMgr->GetNumberOfRedoItems(&numTxn);
    if (NS_SUCCEEDED(rv) && numTxn > 0) {
      nsCOMPtr<nsITransaction> txn;
      rv = mTxnMgr->PeekRedoStack(getter_AddRefs(txn));
      if (NS_SUCCEEDED(rv) && txn) {
        static_cast<nsMsgTxn*>(static_cast<nsITransaction*>(txn.get()))
            ->SetMsgWindow(msgWindow);
      }
      nsCOMPtr<nsITransactionManager> txnMgr = mTxnMgr;
      txnMgr->RedoTransaction();
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMessenger::GetTransactionManager(nsITransactionManager** aTxnMgr) {
  NS_ENSURE_TRUE(mTxnMgr && aTxnMgr, NS_ERROR_NULL_POINTER);
  NS_ADDREF(*aTxnMgr = mTxnMgr);
  return NS_OK;
}

NS_IMETHODIMP
nsMessenger::FormatFileSize(uint64_t aSize, bool aUseKB,
                            nsAString& aFormattedSize) {
  return ::FormatFileSize(aSize, aUseKB, aFormattedSize);
}
