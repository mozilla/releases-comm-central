/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgTxn.h"
#include "nsIMessenger.h"  // For nsIMessenger::eUnknown et al.
#include "nsIMsgHdr.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsMsgMessageFlags.h"

NS_IMPL_ISUPPORTS(nsMsgTxn, nsIMsgTxn, nsITransaction)

nsMsgTxn::nsMsgTxn() : m_txnType(nsIMessenger::eUnknown) {}

nsMsgTxn::~nsMsgTxn() {}

/////////////////////// Transaction Stuff //////////////////
NS_IMETHODIMP nsMsgTxn::DoTransaction() { return NS_OK; }

NS_IMETHODIMP nsMsgTxn::UndoTransaction() { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP nsMsgTxn::RedoTransaction() { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP nsMsgTxn::GetIsTransient(bool* aIsTransient) {
  if (nullptr != aIsTransient)
    *aIsTransient = false;
  else
    return NS_ERROR_NULL_POINTER;
  return NS_OK;
}

NS_IMETHODIMP nsMsgTxn::Merge(nsITransaction* aTransaction, bool* aDidMerge) {
  *aDidMerge = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgTxn::GetMsgWindow(nsIMsgWindow** msgWindow) {
  if (!msgWindow || !m_msgWindow) return NS_ERROR_NULL_POINTER;
  NS_ADDREF(*msgWindow = m_msgWindow);
  return NS_OK;
}

NS_IMETHODIMP nsMsgTxn::GetTxnType(uint32_t* txnType) {
  MOZ_ASSERT(txnType);
  *txnType = m_txnType;
  return NS_OK;
}

nsresult nsMsgTxn::SetMsgWindow(nsIMsgWindow* msgWindow) {
  m_msgWindow = msgWindow;
  return NS_OK;
}

nsresult nsMsgTxn::SetTransactionType(uint32_t txnType) {
  MOZ_ASSERT(m_txnType == nsIMessenger::eUnknown);  // Initialisation only.
  m_txnType = txnType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgTxn::GetAsEditTransactionBase(EditTransactionBase**) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

/*none of the callers pass null aFolder,
  we always initialize aResult (before we pass in) for the case where the key is
  not in the db*/
nsresult nsMsgTxn::CheckForToggleDelete(nsIMsgFolder* aFolder,
                                        const nsMsgKey& aMsgKey,
                                        bool* aResult) {
  NS_ENSURE_ARG(aResult);
  nsCOMPtr<nsIMsgDBHdr> message;
  nsCOMPtr<nsIMsgDatabase> db;
  nsresult rv = aFolder->GetMsgDatabase(getter_AddRefs(db));
  if (db) {
    bool containsKey;
    rv = db->ContainsKey(aMsgKey, &containsKey);
    if (NS_FAILED(rv) || !containsKey)  // the message has been deleted from db,
                                        // so we cannot do toggle here
      return NS_OK;
    rv = db->GetMsgHdrForKey(aMsgKey, getter_AddRefs(message));
    uint32_t flags;
    if (NS_SUCCEEDED(rv) && message) {
      message->GetFlags(&flags);
      *aResult = (flags & nsMsgMessageFlags::IMAPDeleted) != 0;
    }
  }
  return rv;
}
