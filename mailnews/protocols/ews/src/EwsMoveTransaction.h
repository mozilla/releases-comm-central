/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMOVETRANSACTION_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMOVETRANSACTION_H_

#include "IEwsFolder.h"
#include "nsMsgTxn.h"
#include "nsIMsgHdr.h"
#include "nsIMsgWindow.h"

/**
 * A transaction representing an intra-server EWS move operation.
 */
class EwsMoveTransaction : public nsMsgTxn {
 public:
  EwsMoveTransaction(nsCOMPtr<IEwsFolder> originalSourceFolder,
                     nsCOMPtr<IEwsFolder> originalDestinationFolder,
                     nsCOMPtr<nsIMsgWindow> window,
                     nsTArray<RefPtr<nsIMsgDBHdr>>&& headers);

  NS_IMETHOD UndoTransaction() override;
  NS_IMETHOD RedoTransaction() override;

  /**
   * Replace the collection of headers so that the next undo/redo operates on
   * the given `headers`.
   */
  void UpdateHeaderSet(const nsTArray<RefPtr<nsIMsgDBHdr>>& headers);

 protected:
  virtual ~EwsMoveTransaction();

 private:
  /**
   * Perform the operation, moving the current set of headers from `fromFolder`
   * and to `toFolder`.
   */
  nsresult PerformOperation(IEwsFolder* fromFolder, IEwsFolder* toFolder);

  nsCOMPtr<IEwsFolder> mOriginalSourceFolder;
  nsCOMPtr<IEwsFolder> mOriginalDestinationFolder;
  nsCOMPtr<nsIMsgWindow> mWindow;
  nsTArray<RefPtr<nsIMsgDBHdr>> mCurrentHeaderSet;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSMOVETRANSACTION_H_
