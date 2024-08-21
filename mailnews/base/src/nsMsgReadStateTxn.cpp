/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgReadStateTxn.h"

#include "nsIMsgHdr.h"

nsMsgReadStateTxn::nsMsgReadStateTxn() {}

nsMsgReadStateTxn::~nsMsgReadStateTxn() {}

nsresult nsMsgReadStateTxn::Init(nsIMsgFolder* aParentFolder, uint32_t aNumKeys,
                                 nsMsgKey* aMsgKeyArray) {
  NS_ENSURE_ARG_POINTER(aParentFolder);

  mParentFolder = aParentFolder;
  mMarkedMessages.AppendElements(aMsgKeyArray, aNumKeys);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgReadStateTxn::UndoTransaction() { return MarkMessages(false); }

NS_IMETHODIMP
nsMsgReadStateTxn::RedoTransaction() { return MarkMessages(true); }

NS_IMETHODIMP
nsMsgReadStateTxn::MarkMessages(bool aAsRead) {
  nsTArray<RefPtr<nsIMsgDBHdr>> messages(mMarkedMessages.Length());
  for (auto msgKey : mMarkedMessages) {
    nsCOMPtr<nsIMsgDBHdr> curMsgHdr;
    nsresult rv =
        mParentFolder->GetMessageHeader(msgKey, getter_AddRefs(curMsgHdr));
    if (NS_SUCCEEDED(rv) && curMsgHdr) {
      messages.AppendElement(curMsgHdr);
    }
  }
  return mParentFolder->MarkMessagesRead(messages, aAsRead);
}
