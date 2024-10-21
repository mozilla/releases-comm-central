/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsLocalUndoTxn_h__
#define nsLocalUndoTxn_h__

#include "msgCore.h"
#include "nsIMsgFolder.h"
#include "nsMsgTxn.h"
#include "nsTArray.h"
#include "nsIFolderListener.h"
#include "nsIWeakReferenceUtils.h"

class nsLocalUndoFolderListener;

class nsLocalMoveCopyMsgTxn : public nsIFolderListener, public nsMsgTxn {
 public:
  nsLocalMoveCopyMsgTxn();
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIFOLDERLISTENER

  // overloading nsITransaction methods
  NS_IMETHOD UndoTransaction(void) override;
  NS_IMETHOD RedoTransaction(void) override;

  // helper
  nsresult AddSrcKey(nsMsgKey aKey);
  nsresult AddDstKey(nsMsgKey aKey);
  nsresult AddDstMsgSize(uint32_t msgSize);
  nsresult SetSrcFolder(nsIMsgFolder* srcFolder);
  nsresult GetSrcIsImap(bool* isImap);
  nsresult SetDstFolder(nsIMsgFolder* dstFolder);
  nsresult Init(nsIMsgFolder* srcFolder, nsIMsgFolder* dstFolder, bool isMove);
  nsresult UndoImapDeleteFlag(nsIMsgFolder* aFolder,
                              nsTArray<nsMsgKey>& aKeyArray, bool deleteFlag);
  nsresult UndoTransactionInternal();

 private:
  virtual ~nsLocalMoveCopyMsgTxn();
  nsWeakPtr m_srcFolder;
  nsTArray<nsMsgKey> m_srcKeyArray;  // used when src is local or imap
  nsWeakPtr m_dstFolder;
  nsTArray<nsMsgKey> m_dstKeyArray;
  bool m_isMove;
  bool m_srcIsImap4;
  nsTArray<uint32_t> m_dstSizeArray;
  bool m_undoing;  // if false, re-doing
  uint32_t m_numHdrsCopied;
  nsTArray<nsCString> m_copiedMsgIds;
  nsLocalUndoFolderListener* mUndoFolderListener;
};

class nsLocalUndoFolderListener : public nsIFolderListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIFOLDERLISTENER

  nsLocalUndoFolderListener(nsLocalMoveCopyMsgTxn* aTxn, nsIMsgFolder* aFolder);

 private:
  virtual ~nsLocalUndoFolderListener();
  nsLocalMoveCopyMsgTxn* mTxn;
  nsIMsgFolder* mFolder;
};

#endif
