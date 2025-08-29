/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsCopyMoveTransaction.h"

#include "nsIMsgFolder.h"

namespace {

class UpdateHeaderSetListener : public IEwsFolderOperationListener {
 public:
  NS_DECL_IEWSFOLDEROPERATIONLISTENER
  NS_DECL_ISUPPORTS

  explicit UpdateHeaderSetListener(RefPtr<EwsCopyMoveTransaction> transaction)
      : mTransaction(std::move(transaction)) {}

 protected:
  virtual ~UpdateHeaderSetListener() = default;

 private:
  RefPtr<EwsCopyMoveTransaction> mTransaction;
};

NS_IMPL_ISUPPORTS(UpdateHeaderSetListener, IEwsFolderOperationListener);

NS_IMETHODIMP UpdateHeaderSetListener::OnComplete(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& headers) {
  mTransaction->UpdateHeaderSet(headers);
  return NS_OK;
}

}  // namespace

RefPtr<EwsCopyMoveTransaction> EwsCopyMoveTransaction::ForCopy(
    nsCOMPtr<IEwsFolder> originalSourceFolder,
    nsCOMPtr<IEwsFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window,
    nsTArray<RefPtr<nsIMsgDBHdr>> originalHeaders,
    nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders) {
  return new EwsCopyMoveTransaction(
      std::move(originalSourceFolder), std::move(originalDestinationFolder),
      std::move(window), false, std::move(originalHeaders),
      std::move(newHeaders));
}

RefPtr<EwsCopyMoveTransaction> EwsCopyMoveTransaction::ForMove(
    nsCOMPtr<IEwsFolder> originalSourceFolder,
    nsCOMPtr<IEwsFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window, nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders) {
  // The move case has no need to hold on to a reference for the original
  // headers.
  return new EwsCopyMoveTransaction(
      std::move(originalSourceFolder), std::move(originalDestinationFolder),
      std::move(window), true, nsTArray<RefPtr<nsIMsgDBHdr>>(),
      std::move(newHeaders));
}

EwsCopyMoveTransaction::EwsCopyMoveTransaction(
    nsCOMPtr<IEwsFolder> originalSourceFolder,
    nsCOMPtr<IEwsFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window, bool isMove,
    nsTArray<RefPtr<nsIMsgDBHdr>>&& originalHeaders,
    nsTArray<RefPtr<nsIMsgDBHdr>>&& newHeaders)
    : mOriginalSourceFolder(std::move(originalSourceFolder)),
      mOriginalDestinationFolder(std::move(originalDestinationFolder)),
      mWindow(std::move(window)),
      mIsMove(isMove),
      mOriginalHeaderSet(std::move(originalHeaders)),
      mCurrentHeaderSet(std::move(newHeaders)) {}

EwsCopyMoveTransaction::~EwsCopyMoveTransaction() = default;

NS_IMETHODIMP EwsCopyMoveTransaction::UndoTransaction() {
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

NS_IMETHODIMP EwsCopyMoveTransaction::RedoTransaction() {
  return PerformOperation(mOriginalSourceFolder, mOriginalDestinationFolder);
}

void EwsCopyMoveTransaction::UpdateHeaderSet(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& headers) {
  mCurrentHeaderSet.ClearAndRetainStorage();
  for (auto&& header : headers) {
    mCurrentHeaderSet.AppendElement(header);
  }
}

nsresult EwsCopyMoveTransaction::PerformOperation(IEwsFolder* fromFolder,
                                                  IEwsFolder* toFolder) {
  RefPtr<UpdateHeaderSetListener> listener = new UpdateHeaderSetListener(this);
  const auto& transactionHeaders =
      mIsMove ? mCurrentHeaderSet : mOriginalHeaderSet;
  nsresult rv;
  rv = toFolder->CopyItemsOnSameServer(fromFolder, transactionHeaders, mIsMove,
                                       mWindow, nullptr, false, listener);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}
