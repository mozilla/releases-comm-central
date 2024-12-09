/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMsgTxn_h__
#define nsMsgTxn_h__

#include "nsIMsgTxn.h"
#include "msgCore.h"
#include "nsCOMPtr.h"
#include "nsIMsgWindow.h"
#include "MailNewsTypes2.h"

#include "mozilla/EditTransactionBase.h"

using mozilla::EditTransactionBase;

#define NS_MESSAGETRANSACTION_IID             \
  {/* da621b30-1efc-11d3-abe4-00805f8ac968 */ \
   0xda621b30,                                \
   0x1efc,                                    \
   0x11d3,                                    \
   {0xab, 0xe4, 0x00, 0x80, 0x5f, 0x8a, 0xc9, 0x68}}
/**
 * Base class to support undo/redo for moving/copying/deleting/marking
 * messages.
 * Just a thin layer on top of nsITransaction which adds fields for runtime
 * type and for msgWindow. The UI needs the transaction type to describe the
 * undo/redo action in the GUI (eg "Undo deletion"), but there's no provision
 * for this in the base nsITransaction interface.
 */
class nsMsgTxn : public nsIMsgTxn {
 public:
  nsMsgTxn();

  // These should only be called once, to set up the object initially.
  nsresult SetMsgWindow(nsIMsgWindow* msgWindow);
  nsresult SetTransactionType(uint32_t txnType);

  NS_DECL_ISUPPORTS
  NS_DECL_NSITRANSACTION
  NS_DECL_NSIMSGTXN

 protected:
  virtual ~nsMsgTxn();

  nsCOMPtr<nsIMsgWindow> m_msgWindow;
  uint32_t m_txnType;

  // Helper function which returns true if the specified message has the
  // nsMsgMessageFlags::IMAPDeleted flag set.
  // NOTE: This doesn't rely on nsMsgTxn state, and should probably be moved
  // out to somewhere more sensible.
  nsresult CheckForToggleDelete(nsIMsgFolder* aFolder, const nsMsgKey& aMsgKey,
                                bool* aResult);
};

#endif
