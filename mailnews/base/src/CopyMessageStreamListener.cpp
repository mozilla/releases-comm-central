/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CopyMessageStreamListener.h"
#include "nsIMsgImapMailFolder.h"
#include "nsIChannel.h"

NS_IMPL_ISUPPORTS(CopyMessageStreamListener, nsIStreamListener,
                  nsIRequestObserver, nsICopyMessageListener)

CopyMessageStreamListener::CopyMessageStreamListener(
    nsICopyMessageListener* destination, bool isMove)
    : mDestination(destination), mIsMove(isMove) {}

CopyMessageStreamListener::~CopyMessageStreamListener() {}

NS_IMETHODIMP CopyMessageStreamListener::StartMessage() {
  return mDestination->StartMessage();
}

NS_IMETHODIMP CopyMessageStreamListener::BeginCopy() {
  return mDestination->BeginCopy();
}

NS_IMETHODIMP CopyMessageStreamListener::CopyData(nsIInputStream* aIStream,
                                                  int32_t aLength) {
  return mDestination->CopyData(aIStream, aLength);
}

NS_IMETHODIMP CopyMessageStreamListener::EndCopy(bool copySucceeded) {
  nsresult rv = mDestination->EndCopy(copySucceeded);
  NS_ENSURE_SUCCESS(rv, rv);

  // If this is a move and we finished the copy, delete the old message.
  if (mIsMove) {
    // don't do this if we're moving to an imap folder - that's handled
    // elsewhere.
    nsCOMPtr<nsIMsgImapMailFolder> destImap = do_QueryInterface(mDestination);
    // if the destination is a local folder, it will handle the delete from the
    // source in EndMove
    if (!destImap) {
      mDestination->EndMove(copySucceeded);
    }
  }

  // Even if the above actions failed we probably still want to return NS_OK.
  // There should probably be some error dialog if either the copy or delete
  // failed.
  return NS_OK;
}

NS_IMETHODIMP CopyMessageStreamListener::EndMove(bool moveSucceeded) {
  return mDestination->EndMove(moveSucceeded);
}

NS_IMETHODIMP CopyMessageStreamListener::EndMessage(nsMsgKey key) {
  return mDestination->EndMessage(key);
}

NS_IMETHODIMP CopyMessageStreamListener::OnStartRequest(nsIRequest* aRequest) {
  return BeginCopy();
}

NS_IMETHODIMP CopyMessageStreamListener::OnDataAvailable(
    nsIRequest* aRequest, nsIInputStream* aInputStream, uint64_t aOffset,
    uint32_t aCount) {
  return CopyData(aInputStream, aCount);
}

NS_IMETHODIMP CopyMessageStreamListener::OnStopRequest(nsIRequest* aRequest,
                                                       nsresult aStatus) {
  return EndCopy(NS_SUCCEEDED(aStatus));
}
