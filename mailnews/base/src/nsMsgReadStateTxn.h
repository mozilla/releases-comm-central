/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGREADSTATETXN_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGREADSTATETXN_H_

#include "nsMsgTxn.h"
#include "nsTArray.h"
#include "nsCOMPtr.h"
#include "nsIMsgFolder.h"

//------------------------------------------------------------------------------
// A mark-all transaction handler. Helper for redo/undo of message read states.
//------------------------------------------------------------------------------
class nsMsgReadStateTxn : public nsMsgTxn {
 public:
  nsMsgReadStateTxn();
  virtual ~nsMsgReadStateTxn();

  nsresult Init(nsIMsgFolder* aParentFolder, uint32_t aNumKeys,
                nsMsgKey* aMsgKeyArray);
  NS_IMETHOD UndoTransaction() override;
  NS_IMETHOD RedoTransaction() override;

 protected:
  NS_IMETHOD MarkMessages(bool aAsRead);

 private:
  nsCOMPtr<nsIMsgFolder> mParentFolder;
  nsTArray<nsMsgKey> mMarkedMessages;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGREADSTATETXN_H_
