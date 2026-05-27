/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeCopyMoveTransaction.h"

#include "nsIMessenger.h"
#include "nsIMsgFolder.h"

namespace {

class UpdateHeaderSetListener : public IExchangeFolderOperationListener {
 public:
  NS_DECL_IEXCHANGEFOLDEROPERATIONLISTENER
  NS_DECL_ISUPPORTS

  explicit UpdateHeaderSetListener(
      RefPtr<ExchangeCopyMoveTransaction> transaction)
      : mTransaction(std::move(transaction)) {}

 protected:
  virtual ~UpdateHeaderSetListener() = default;

 private:
  RefPtr<ExchangeCopyMoveTransaction> mTransaction;
};

NS_IMPL_ISUPPORTS(UpdateHeaderSetListener, IExchangeFolderOperationListener);

NS_IMETHODIMP UpdateHeaderSetListener::OnComplete(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& headers) {
  mTransaction->UpdateHeaderSet(headers);
  return NS_OK;
}

}  // namespace

RefPtr<ExchangeCopyMoveTransaction> ExchangeCopyMoveTransaction::ForCopy(
    nsCOMPtr<IExchangeFolder> originalSourceFolder,
    nsCOMPtr<IExchangeFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window,
    nsTArray<RefPtr<nsIMsgDBHdr>> originalHeaders,
    nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders) {
  return new ExchangeCopyMoveTransaction(
      std::move(originalSourceFolder), std::move(originalDestinationFolder),
      std::move(window), false, std::move(originalHeaders),
      std::move(newHeaders));
}

RefPtr<ExchangeCopyMoveTransaction> ExchangeCopyMoveTransaction::ForMove(
    nsCOMPtr<IExchangeFolder> originalSourceFolder,
    nsCOMPtr<IExchangeFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window, nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders) {
  // The move case has no need to hold on to a reference for the original
  // headers.
  return new ExchangeCopyMoveTransaction(
      std::move(originalSourceFolder), std::move(originalDestinationFolder),
      std::move(window), true, nsTArray<RefPtr<nsIMsgDBHdr>>(),
      std::move(newHeaders));
}

ExchangeCopyMoveTransaction::ExchangeCopyMoveTransaction(
    nsCOMPtr<IExchangeFolder> originalSourceFolder,
    nsCOMPtr<IExchangeFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window, bool isMove,
    nsTArray<RefPtr<nsIMsgDBHdr>>&& originalHeaders,
    nsTArray<RefPtr<nsIMsgDBHdr>>&& newHeaders)
    : mOriginalSourceFolder(std::move(originalSourceFolder)),
      mOriginalDestinationFolder(std::move(originalDestinationFolder)),
      mWindow(std::move(window)),
      mIsMove(isMove),
      mOriginalHeaderSet(std::move(originalHeaders)),
      mCurrentHeaderSet(std::move(newHeaders)) {}

ExchangeCopyMoveTransaction::~ExchangeCopyMoveTransaction() = default;

NS_IMETHODIMP ExchangeCopyMoveTransaction::UndoTransaction() {
  if (mIsMove) {
    return PerformOperation(mOriginalDestinationFolder, mOriginalSourceFolder);
  }

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> msgFolder =
      do_QueryInterface(mOriginalDestinationFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = msgFolder->DeleteMessages(mCurrentHeaderSet, mWindow, true, false,
                                 nullptr, false);
  NS_ENSURE_SUCCESS(rv, rv);

  mCurrentHeaderSet.ClearAndRetainStorage();
  return NS_OK;
}

NS_IMETHODIMP ExchangeCopyMoveTransaction::RedoTransaction() {
  return PerformOperation(mOriginalSourceFolder, mOriginalDestinationFolder);
}

void ExchangeCopyMoveTransaction::UpdateHeaderSet(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& headers) {
  mCurrentHeaderSet.ClearAndRetainStorage();
  for (auto&& header : headers) {
    mCurrentHeaderSet.AppendElement(header);
  }
}

nsresult ExchangeCopyMoveTransaction::PerformOperation(
    IExchangeFolder* fromFolder, IExchangeFolder* toFolder) {
  RefPtr<UpdateHeaderSetListener> listener = new UpdateHeaderSetListener(this);
  const auto& transactionHeaders =
      mIsMove ? mCurrentHeaderSet : mOriginalHeaderSet;
  // We can pass `eUnknown` as the undo operation type because we're passing
  // another argument to disallow undo for this operation.
  nsresult rv = toFolder->CopyItemsOnSameServer(
      fromFolder, transactionHeaders, mIsMove, mWindow, nullptr, false,
      nsIMessenger::eUnknown, listener);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}
