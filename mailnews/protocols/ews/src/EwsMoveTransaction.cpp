/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsMoveTransaction.h"

#include "nsIMsgFolder.h"

namespace {

class UpdateHeaderSetListener : public IEwsFolderOperationListener {
 public:
  NS_DECL_IEWSFOLDEROPERATIONLISTENER
  NS_DECL_ISUPPORTS

  explicit UpdateHeaderSetListener(RefPtr<EwsMoveTransaction> transaction)
      : mTransaction(std::move(transaction)) {}

 protected:
  virtual ~UpdateHeaderSetListener() = default;

 private:
  RefPtr<EwsMoveTransaction> mTransaction;
};

NS_IMPL_ISUPPORTS(UpdateHeaderSetListener, IEwsFolderOperationListener);

NS_IMETHODIMP UpdateHeaderSetListener::OnComplete(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& headers) {
  mTransaction->UpdateHeaderSet(headers);
  return NS_OK;
}

}  // namespace

EwsMoveTransaction::EwsMoveTransaction(
    nsCOMPtr<IEwsFolder> originalSourceFolder,
    nsCOMPtr<IEwsFolder> originalDestinationFolder,
    nsCOMPtr<nsIMsgWindow> window, nsTArray<RefPtr<nsIMsgDBHdr>>&& headers)
    : mOriginalSourceFolder(std::move(originalSourceFolder)),
      mOriginalDestinationFolder(std::move(originalDestinationFolder)),
      mWindow(std::move(window)),
      mCurrentHeaderSet(std::move(headers)) {}

EwsMoveTransaction::~EwsMoveTransaction() = default;

NS_IMETHODIMP EwsMoveTransaction::UndoTransaction() {
  return PerformOperation(mOriginalDestinationFolder, mOriginalSourceFolder);
}

NS_IMETHODIMP EwsMoveTransaction::RedoTransaction() {
  return PerformOperation(mOriginalSourceFolder, mOriginalDestinationFolder);
}

void EwsMoveTransaction::UpdateHeaderSet(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& headers) {
  mCurrentHeaderSet.ClearAndRetainStorage();
  for (auto&& header : headers) {
    mCurrentHeaderSet.AppendElement(header);
  }
}

nsresult EwsMoveTransaction::PerformOperation(IEwsFolder* fromFolder,
                                              IEwsFolder* toFolder) {
  RefPtr<UpdateHeaderSetListener> listener = new UpdateHeaderSetListener(this);
  nsresult rv = toFolder->CopyItemsOnSameServer(
      fromFolder, mCurrentHeaderSet, true, mWindow, nullptr, false, listener);
  NS_ENSURE_SUCCESS(rv, rv);

  // Clear the header list now so we can't complete an operation while the async
  // operation is going.
  mCurrentHeaderSet.ClearAndRetainStorage();

  return NS_OK;
}
