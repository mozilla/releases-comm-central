/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSCOPYMOVETRANSACTION_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSCOPYMOVETRANSACTION_H_

#include "IEwsFolder.h"
#include "nsMsgTxn.h"
#include "nsIMsgHdr.h"
#include "nsIMsgWindow.h"

/**
 * A transaction representing an intra-server EWS copy or move operation.
 */
class EwsCopyMoveTransaction : public nsMsgTxn {
 public:
  /**
   * Return a transaction for a copy operation.
   *
   * The copy operation copied items from `originalSourceFolder` to
   * `originalDestinationFolder`. The `window` is the containing window for the
   * operation that also manages the undo stack. The `originalHeaders` parameter
   * represents the headers that were used as the source headers for the
   * original operation. The `newHeaders` parameter should contain the headers
   * that resulted from the original operation (i.e. The resulting headers from
   * the original copy or move operation).
   */
  static RefPtr<EwsCopyMoveTransaction> ForCopy(
      nsCOMPtr<IEwsFolder> originalSourceFolder,
      nsCOMPtr<IEwsFolder> originalDestinationFolder,
      nsCOMPtr<nsIMsgWindow> window,
      nsTArray<RefPtr<nsIMsgDBHdr>> originalHeaders,
      nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders);

  /**
   * Return a transaction for a move operation.
   *
   * @see `EwsCopyMoveTransaction::ForCopy` for an explanation of the
   * parameters.
   */
  static RefPtr<EwsCopyMoveTransaction> ForMove(
      nsCOMPtr<IEwsFolder> originalSourceFolder,
      nsCOMPtr<IEwsFolder> originalDestinationFolder,
      nsCOMPtr<nsIMsgWindow> window, nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders);

  NS_IMETHOD UndoTransaction() override;
  NS_IMETHOD RedoTransaction() override;

  /**
   * Replace the collection of headers so that the next undo/redo operates on
   * the given `headers`.
   */
  void UpdateHeaderSet(const nsTArray<RefPtr<nsIMsgDBHdr>>& headers);

 protected:
  virtual ~EwsCopyMoveTransaction();

 private:
  /**
   * Construct an Undo/Redo transaction for a copy or move operation.
   *
   * @see `EwsCopyMoveTransaction::ForCopy` for an explanation of the
   * parameters.
   */
  EwsCopyMoveTransaction(nsCOMPtr<IEwsFolder> originalSourceFolder,
                         nsCOMPtr<IEwsFolder> originalDestinationFolder,
                         nsCOMPtr<nsIMsgWindow> window, bool isMove,
                         nsTArray<RefPtr<nsIMsgDBHdr>>&& originalHeaders,
                         nsTArray<RefPtr<nsIMsgDBHdr>>&& newHeaders);
  /**
   * Perform the operation, moving the current set of headers from `fromFolder`
   * and to `toFolder`.
   */
  nsresult PerformOperation(IEwsFolder* fromFolder, IEwsFolder* toFolder);

  const nsCOMPtr<IEwsFolder> mOriginalSourceFolder;
  const nsCOMPtr<IEwsFolder> mOriginalDestinationFolder;
  const nsCOMPtr<nsIMsgWindow> mWindow;
  const bool mIsMove;
  const nsTArray<RefPtr<nsIMsgDBHdr>> mOriginalHeaderSet;
  nsTArray<RefPtr<nsIMsgDBHdr>> mCurrentHeaderSet;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSCOPYMOVETRANSACTION_H_
