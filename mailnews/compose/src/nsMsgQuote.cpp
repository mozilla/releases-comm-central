/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIURL.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIServiceManager.h"
#include "nsIStreamListener.h"
#include "nsIStreamConverter.h"
#include "nsIStreamConverterService.h"
#include "nsIMimeStreamConverter.h"
#include "nsMimeTypes.h"
#include "nsICharsetConverterManager.h"
#include "prprf.h"
#include "nsMsgQuote.h"
#include "nsMsgCompUtils.h"
#include "nsIMsgMessageService.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsMsgMimeCID.h"
#include "nsMsgCompCID.h"
#include "nsMsgCompose.h"
#include "nsMsgMailNewsUrl.h"
#include "mozilla/Services.h"
#include "nsContentUtils.h"

NS_IMPL_ISUPPORTS(nsMsgQuoteListener, nsIMsgQuoteListener,
                  nsIMimeStreamConverterListener)

nsMsgQuoteListener::nsMsgQuoteListener() {}

nsMsgQuoteListener::~nsMsgQuoteListener() {}

NS_IMETHODIMP nsMsgQuoteListener::SetMsgQuote(nsIMsgQuote* msgQuote) {
  mMsgQuote = do_GetWeakReference(msgQuote);
  return NS_OK;
}

NS_IMETHODIMP nsMsgQuoteListener::GetMsgQuote(nsIMsgQuote** aMsgQuote) {
  nsresult rv = NS_OK;
  if (aMsgQuote) {
    nsCOMPtr<nsIMsgQuote> msgQuote = do_QueryReferent(mMsgQuote);
    msgQuote.forget(aMsgQuote);
  } else
    rv = NS_ERROR_NULL_POINTER;

  return rv;
}

nsresult nsMsgQuoteListener::OnHeadersReady(nsIMimeHeaders* headers) {
  nsCOMPtr<nsIMsgQuotingOutputStreamListener> quotingOutputStreamListener;
  nsCOMPtr<nsIMsgQuote> msgQuote = do_QueryReferent(mMsgQuote);

  if (msgQuote)
    msgQuote->GetStreamListener(getter_AddRefs(quotingOutputStreamListener));

  if (quotingOutputStreamListener)
    quotingOutputStreamListener->SetMimeHeaders(headers);
  return NS_OK;
}

//
// Implementation...
//
nsMsgQuote::nsMsgQuote() {
  mQuoteHeaders = false;
  mQuoteListener = nullptr;
}

nsMsgQuote::~nsMsgQuote() {}

NS_IMPL_ISUPPORTS(nsMsgQuote, nsIMsgQuote, nsISupportsWeakReference)

NS_IMETHODIMP nsMsgQuote::GetStreamListener(
    nsIMsgQuotingOutputStreamListener** aStreamListener) {
  if (!aStreamListener) {
    return NS_ERROR_NULL_POINTER;
  }
  nsCOMPtr<nsIMsgQuotingOutputStreamListener> streamListener =
      do_QueryReferent(mStreamListener);
  if (!streamListener) {
    return NS_ERROR_FAILURE;
  }
  NS_IF_ADDREF(*aStreamListener = streamListener);
  return NS_OK;
}

nsresult nsMsgQuote::QuoteMessage(
    const char* msgURI, bool quoteHeaders,
    nsIMsgQuotingOutputStreamListener* aQuoteMsgStreamListener,
    const char* aMsgCharSet, bool headersOnly, nsIMsgDBHdr* aMsgHdr) {
  nsresult rv;
  if (!msgURI) return NS_ERROR_INVALID_ARG;

  mQuoteHeaders = quoteHeaders;
  mStreamListener = do_GetWeakReference(aQuoteMsgStreamListener);

  nsAutoCString msgUri(msgURI);
  bool fileUrl = !strncmp(msgURI, "file:", 5);
  bool forwardedMessage =
      PL_strstr(msgURI, "&realtype=message/rfc822") != nullptr;
  nsCOMPtr<nsIURI> newURI;
  if (fileUrl) {
    msgUri.Replace(0, 5, "mailbox:"_ns);
    msgUri.AppendLiteral("?number=0");
    rv = NS_NewURI(getter_AddRefs(newURI), msgUri);
    nsCOMPtr<nsIMsgMessageUrl> mailUrl(do_QueryInterface(newURI));
    if (mailUrl) mailUrl->SetMessageHeader(aMsgHdr);
  } else if (forwardedMessage)
    rv = NS_NewURI(getter_AddRefs(newURI), msgURI);
  else {
    nsCOMPtr<nsIMsgMessageService> msgService;
    rv = GetMessageServiceFromURI(nsDependentCString(msgURI),
                                  getter_AddRefs(msgService));
    if (NS_FAILED(rv)) return rv;
    rv = msgService->GetUrlForUri(nsDependentCString(msgURI), nullptr,
                                  getter_AddRefs(newURI));
  }
  if (NS_FAILED(rv)) return rv;

  nsAutoCString queryPart;
  rv = newURI->GetQuery(queryPart);
  if (!queryPart.IsEmpty()) queryPart.Append('&');

  if (headersOnly) /* We don't need to quote the message body but we still need
                      to extract the headers */
    queryPart.AppendLiteral("header=only");
  else if (quoteHeaders)
    queryPart.AppendLiteral("header=quote");
  else
    queryPart.AppendLiteral("header=quotebody");
  rv = NS_MutateURI(newURI).SetQuery(queryPart).Finalize(newURI);
  NS_ENSURE_SUCCESS(rv, rv);

  // if we were given a non empty charset, then use it
  if (aMsgCharSet && *aMsgCharSet) {
    nsCOMPtr<nsIMsgI18NUrl> i18nUrl(do_QueryInterface(newURI));
    if (i18nUrl) i18nUrl->SetCharsetOverRide(aMsgCharSet);
  }

  mQuoteListener = do_CreateInstance(NS_MSGQUOTELISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;
  mQuoteListener->SetMsgQuote(this);

  // funky magic go get the isupports for this class which inherits from
  // multiple interfaces.
  nsISupports* supports;
  QueryInterface(NS_GET_IID(nsISupports), (void**)&supports);
  nsCOMPtr<nsISupports> quoteSupport = supports;
  NS_IF_RELEASE(supports);

  // now we want to create a necko channel for this url and we want to open it
  mQuoteChannel = nullptr;
  nsCOMPtr<nsIIOService> netService = mozilla::services::GetIOService();
  NS_ENSURE_TRUE(netService, NS_ERROR_UNEXPECTED);
  rv = netService->NewChannelFromURI(
      newURI, nullptr, nsContentUtils::GetSystemPrincipal(), nullptr,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER, getter_AddRefs(mQuoteChannel));

  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIStreamConverterService> streamConverterService =
      do_GetService("@mozilla.org/streamConverters;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIStreamListener> convertedListener;
  nsCOMPtr<nsIMsgQuotingOutputStreamListener> streamListener =
      do_QueryReferent(mStreamListener);
  rv = streamConverterService->AsyncConvertData(
      "message/rfc822", "application/xhtml+xml", streamListener, quoteSupport,
      getter_AddRefs(convertedListener));
  if (NS_FAILED(rv)) return rv;

  //  now try to open the channel passing in our display consumer as the
  //  listener
  rv = mQuoteChannel->AsyncOpen(convertedListener);
  return rv;
}

NS_IMETHODIMP
nsMsgQuote::GetQuoteListener(nsIMimeStreamConverterListener** aQuoteListener) {
  if (!aQuoteListener || !mQuoteListener) return NS_ERROR_NULL_POINTER;
  NS_ADDREF(*aQuoteListener = mQuoteListener);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgQuote::GetQuoteChannel(nsIChannel** aQuoteChannel) {
  if (!aQuoteChannel || !mQuoteChannel) return NS_ERROR_NULL_POINTER;
  NS_ADDREF(*aQuoteChannel = mQuoteChannel);
  return NS_OK;
}
