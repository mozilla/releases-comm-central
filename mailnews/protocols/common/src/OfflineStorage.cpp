/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "OfflineStorage.h"

#include "nsIChannel.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIMsgFolder.h"
#include "nsIMsgHdr.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"

NS_IMPL_ISUPPORTS(OfflineMessageReadListener, nsIStreamListener)

OfflineMessageReadListener::~OfflineMessageReadListener() = default;

NS_IMETHODIMP OfflineMessageReadListener::OnStartRequest(nsIRequest* request) {
  if (mShouldStart) {
    mShouldStart = false;
    return mDestination->OnStartRequest(mChannel);
  }

  return NS_OK;
}

NS_IMETHODIMP OfflineMessageReadListener::OnStopRequest(nsIRequest* request,
                                                        nsresult status) {
  nsresult rv = mDestination->OnStopRequest(mChannel, status);
  if (NS_FAILED(status)) {
    // The streaming failed, discard the offline copy of the message so it can
    // be downloaded again later.
    mFolder->DiscardOfflineMsg(mMsgKey);
  }
  return rv;
}
NS_IMETHODIMP OfflineMessageReadListener::OnDataAvailable(
    nsIRequest* request, nsIInputStream* aInStream, uint64_t aSourceOffset,
    uint32_t aCount) {
  return mDestination->OnDataAvailable(mChannel, aInStream, aSourceOffset,
                                       aCount);
}

// The public-facing helper function.
nsresult AsyncReadMessageFromStore(nsIMsgDBHdr* message,
                                   nsIStreamListener* streamListener,
                                   bool convertData, nsIChannel* srcChannel,
                                   nsIRequest** readRequest) {
  NS_ENSURE_ARG_POINTER(message);
  NS_ENSURE_ARG_POINTER(streamListener);
  NS_ENSURE_ARG_POINTER(srcChannel);

  nsCOMPtr<nsIMsgFolder> folder;
  MOZ_TRY(message->GetFolder(getter_AddRefs(folder)));

  // Make sure the message exists in the offline store.
  nsMsgKey msgKey;
  MOZ_TRY(message->GetMessageKey(&msgKey));

  bool hasOffline;
  MOZ_TRY(folder->HasMsgOffline(msgKey, &hasOffline));

  if (!hasOffline) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Stream the message from the store into the stream listener.
  nsCOMPtr<nsIInputStream> msgStream;
  MOZ_TRY(folder->GetMsgInputStream(message, getter_AddRefs(msgStream)));

  nsCOMPtr<nsIInputStreamPump> pump;
  MOZ_TRY(NS_NewInputStreamPump(getter_AddRefs(pump), msgStream.forget()));

  // Set up a stream converter if required.
  nsCOMPtr<nsIStreamListener> consumerListener = streamListener;
  if (convertData) {
    nsCOMPtr<nsIStreamConverterService> streamConverterService =
        do_GetService("@mozilla.org/streamConverters;1");

    nsCOMPtr<nsIStreamListener> convertedListener;
    nsresult rv = streamConverterService->AsyncConvertData(
        MESSAGE_RFC822, ANY_WILDCARD, streamListener, srcChannel,
        getter_AddRefs(consumerListener));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  MOZ_TRY(pump->AsyncRead(consumerListener));

  pump.forget(readRequest);
  return NS_OK;
}
