/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCopyMessageStreamListener.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgImapMailFolder.h"
#include "nsIChannel.h"
#include "nsIURI.h"

NS_IMPL_ISUPPORTS(nsCopyMessageStreamListener, nsIStreamListener,
                  nsIRequestObserver, nsICopyMessageStreamListener)

nsCopyMessageStreamListener::nsCopyMessageStreamListener() {}

nsCopyMessageStreamListener::~nsCopyMessageStreamListener() {
  // All member variables are nsCOMPtr's.
}

NS_IMETHODIMP nsCopyMessageStreamListener::Init(
    nsICopyMessageListener* destination, bool isMove) {
  mDestination = destination;
  mIsMove = isMove;
  return NS_OK;
}

NS_IMETHODIMP nsCopyMessageStreamListener::StartMessage() {
  if (mDestination) {
    return mDestination->StartMessage();
  }
  return NS_OK;
}

NS_IMETHODIMP nsCopyMessageStreamListener::EndMessage(nsMsgKey key) {
  if (mDestination) {
    return mDestination->EndMessage(key);
  }
  return NS_OK;
}

NS_IMETHODIMP nsCopyMessageStreamListener::OnDataAvailable(
    nsIRequest* /* request */, nsIInputStream* aIStream, uint64_t sourceOffset,
    uint32_t aLength) {
  return mDestination->CopyData(aIStream, aLength);
}

NS_IMETHODIMP nsCopyMessageStreamListener::OnStartRequest(nsIRequest* request) {
  return mDestination->BeginCopy();
}

NS_IMETHODIMP nsCopyMessageStreamListener::EndCopy(nsresult status) {
  bool copySucceeded = (status == NS_BINDING_SUCCEEDED);
  nsresult rv = mDestination->EndCopy(copySucceeded);
  NS_ENSURE_SUCCESS(rv, rv);

  // If this is a move and we finished the copy, delete the old message.
  if (mIsMove) {
    // don't do this if we're moving to an imap folder - that's handled
    // elsewhere.
    nsCOMPtr<nsIMsgImapMailFolder> destImap = do_QueryInterface(mDestination);
    // if the destination is a local folder, it will handle the delete from the
    // source in EndMove
    if (!destImap) rv = mDestination->EndMove(copySucceeded);
  }
  // Even if the above actions failed we probably still want to return NS_OK.
  // There should probably be some error dialog if either the copy or delete
  // failed.
  return NS_OK;
}

NS_IMETHODIMP nsCopyMessageStreamListener::OnStopRequest(nsIRequest* request,
                                                         nsresult aStatus) {
  return EndCopy(aStatus);
}
