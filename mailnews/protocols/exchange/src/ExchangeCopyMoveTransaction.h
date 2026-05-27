/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGECOPYMOVETRANSACTION_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGECOPYMOVETRANSACTION_H_

#include "IExchangeFolder.h"
#include "nsMsgTxn.h"
#include "nsIMsgHdr.h"
#include "nsIMsgWindow.h"

/**
 * A transaction representing an intra-server Exchange copy or move operation.
 */
class ExchangeCopyMoveTransaction : public nsMsgTxn {
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
  static RefPtr<ExchangeCopyMoveTransaction> ForCopy(
      nsCOMPtr<IExchangeFolder> originalSourceFolder,
      nsCOMPtr<IExchangeFolder> originalDestinationFolder,
      nsCOMPtr<nsIMsgWindow> window,
      nsTArray<RefPtr<nsIMsgDBHdr>> originalHeaders,
      nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders);

  /**
   * Return a transaction for a move operation.
   *
   * @see `ExchangeCopyMoveTransaction::ForCopy` for an explanation of the
   * parameters.
   */
  static RefPtr<ExchangeCopyMoveTransaction> ForMove(
      nsCOMPtr<IExchangeFolder> originalSourceFolder,
      nsCOMPtr<IExchangeFolder> originalDestinationFolder,
      nsCOMPtr<nsIMsgWindow> window, nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders);

  NS_IMETHOD UndoTransaction() override;
  NS_IMETHOD RedoTransaction() override;

  /**
   * Replace the collection of headers so that the next undo/redo operates on
   * the given `headers`.
   */
  void UpdateHeaderSet(const nsTArray<RefPtr<nsIMsgDBHdr>>& headers);

 protected:
  virtual ~ExchangeCopyMoveTransaction();

 private:
  /**
   * Construct an Undo/Redo transaction for a copy or move operation.
   *
   * @see `ExchangeCopyMoveTransaction::ForCopy` for an explanation of the
   * parameters.
   */
  ExchangeCopyMoveTransaction(
      nsCOMPtr<IExchangeFolder> originalSourceFolder,
      nsCOMPtr<IExchangeFolder> originalDestinationFolder,
      nsCOMPtr<nsIMsgWindow> window, bool isMove,
      nsTArray<RefPtr<nsIMsgDBHdr>>&& originalHeaders,
      nsTArray<RefPtr<nsIMsgDBHdr>>&& newHeaders);
  /**
   * Perform the operation, moving the current set of headers from `fromFolder`
   * and to `toFolder`.
   */
  nsresult PerformOperation(IExchangeFolder* fromFolder,
                            IExchangeFolder* toFolder);

  const nsCOMPtr<IExchangeFolder> mOriginalSourceFolder;
  const nsCOMPtr<IExchangeFolder> mOriginalDestinationFolder;
  const nsCOMPtr<nsIMsgWindow> mWindow;
  const bool mIsMove;
  const nsTArray<RefPtr<nsIMsgDBHdr>> mOriginalHeaderSet;
  nsTArray<RefPtr<nsIMsgDBHdr>> mCurrentHeaderSet;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGECOPYMOVETRANSACTION_H_
