/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "FuzzingInterfaceStream.h"

#include "mozilla/NullPrincipal.h"
#include "mozilla/fuzzing/FuzzingStreamListener.h"

#include "nsICategoryManager.h"
#include "nsIChannel.h"
#include "nsIInputStream.h"
#include "nsILoadInfo.h"
#include "nsIMimeConverter.h"
#include "nsIServiceManager.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsIURL.h"

#include "nsCOMPtr.h"
#include "nsMsgUtils.h"
#include "nsNetCID.h"
#include "nsNetUtil.h"
#include "nsString.h"
#include "nsServiceManagerUtils.h"

using namespace mozilla;
using namespace mozilla::net;

static int InitMimeDecoder(int* argc, char*** argv) { return 0; }

static int FuzzingMimeDecoder(nsCOMPtr<nsIInputStream> stream) {
  nsresult rv;

  nsCOMPtr<nsIChannel> channel;
  nsCOMPtr<nsILoadGroup> loadGroup;
  nsCOMPtr<nsIURI> uri;

  rv = NS_NewURI(getter_AddRefs(uri), "about:blank");

  if (NS_FAILED(rv)) {
    MOZ_CRASH("Call to NS_NewURI() failed.");
  }

  nsCOMPtr<nsIPrincipal> nullPrincipal =
      NullPrincipal::CreateWithoutOriginAttributes();

  rv = NS_NewInputStreamChannel(
      getter_AddRefs(channel), uri, stream.forget(), nullPrincipal,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER);

  if (NS_FAILED(rv)) {
    MOZ_CRASH("Call to NS_NewInputStreamChannel() failed.");
  }

  nsCOMPtr<nsIStreamListener> conversionListener;
  nsCOMPtr<nsIStreamConverterService> streamConverter =
      do_GetService("@mozilla.org/streamConverters;1", &rv);

  if (NS_FAILED(rv)) {
    MOZ_CRASH("Call to do_GetService() failed.");
  }

  // This listener will simply consume all of our data and record when
  // the request is stopped so we can synchronize the fuzzing loop.
  RefPtr<FuzzingStreamListener> streamListener = new FuzzingStreamListener();

  rv = streamConverter->AsyncConvertData("message/rfc822", "*/*",
                                         streamListener, channel,
                                         getter_AddRefs(conversionListener));

  if (NS_FAILED(rv)) {
    MOZ_CRASH("Call to AsyncConvertData() failed.");
  }

  rv = channel->AsyncOpen(conversionListener);

  if (NS_FAILED(rv)) {
    MOZ_CRASH("Call to AsyncOpen() failed.");
  }

  // Wait for StopRequest.
  streamListener->waitUntilDone();

  return 0;
}

MOZ_FUZZING_INTERFACE_STREAM(InitMimeDecoder, FuzzingMimeDecoder, MimeDecoder);
