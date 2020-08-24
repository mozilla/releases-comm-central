/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbContentHandler.h"
#include "nsAbBaseCID.h"
#include "nsNetUtil.h"
#include "nsCOMPtr.h"
#include "mozilla/NullPrincipal.h"
#include "mozilla/dom/BrowsingContext.h"
#include "mozilla/UniquePtr.h"
#include "nsISupportsPrimitives.h"
#include "plstr.h"
#include "nsPIDOMWindow.h"
#include "mozIDOMWindow.h"
#include "nsIDocShell.h"
#include "nsIDocShellTreeItem.h"
#include "nsMsgUtils.h"
#include "nsIMsgVCardService.h"
#include "nsIAbCard.h"
#include "nsIChannel.h"
//
// nsAbContentHandler
//
nsAbContentHandler::nsAbContentHandler() {}

nsAbContentHandler::~nsAbContentHandler() {}

NS_IMPL_ISUPPORTS(nsAbContentHandler, nsIContentHandler,
                  nsIStreamLoaderObserver)

NS_IMETHODIMP
nsAbContentHandler::HandleContent(const char* aContentType,
                                  nsIInterfaceRequestor* aWindowContext,
                                  nsIRequest* request) {
  NS_ENSURE_ARG_POINTER(request);

  nsresult rv = NS_OK;

  if (PL_strcasecmp(aContentType, "text/x-vcard") == 0) {
    // create a vcard stream listener that can parse the data stream
    // and bring up the appropriate UI

    // (1) cancel the current load operation. We'll restart it
    request->Cancel(NS_ERROR_ABORT);
    // get the url we were trying to open
    nsCOMPtr<nsIURI> uri;
    nsCOMPtr<nsIChannel> channel = do_QueryInterface(request);
    NS_ENSURE_TRUE(channel, NS_ERROR_FAILURE);

    rv = channel->GetURI(getter_AddRefs(uri));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIPrincipal> nullPrincipal =
        do_CreateInstance("@mozilla.org/nullprincipal;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // create a stream loader to handle the v-card data
    nsCOMPtr<nsIStreamLoader> streamLoader;
    rv = NS_NewStreamLoader(
        getter_AddRefs(streamLoader), uri, this, nullPrincipal,
        nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        nsIContentPolicy::TYPE_OTHER);
    NS_ENSURE_SUCCESS(rv, rv);

  } else {
    return NS_ERROR_WONT_HANDLE_CONTENT;
  }

  return rv;
}

NS_IMETHODIMP
nsAbContentHandler::OnStreamComplete(nsIStreamLoader* aLoader,
                                     nsISupports* aContext, nsresult aStatus,
                                     uint32_t datalen, const uint8_t* data) {
  NS_ENSURE_ARG_POINTER(aContext);
  NS_ENSURE_SUCCESS(
      aStatus, aStatus);  // don't process the vcard if we got a status error
  nsresult rv = NS_OK;

  // take our vCard string and open up an address book window based on it
  nsCOMPtr<nsIMsgVCardService> vCardService =
      do_GetService(NS_MSGVCARDSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbCard> cardFromVCard;
  rv = vCardService->EscapedVCardToAbCard((const char*)data,
                                          getter_AddRefs(cardFromVCard));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIDOMWindowProxy> domWindow = do_GetInterface(aContext);
  NS_ENSURE_TRUE(domWindow, NS_ERROR_FAILURE);
  nsCOMPtr<nsPIDOMWindowOuter> parentWindow =
      nsPIDOMWindowOuter::From(domWindow);

  RefPtr<mozilla::dom::BrowsingContext> dialogWindow;
  return parentWindow->OpenDialog(
      u"chrome://messenger/content/addressbook/abNewCardDialog.xhtml"_ns,
      EmptyString(), u"chrome,resizable=no,titlebar,modal,centerscreen"_ns,
      cardFromVCard, getter_AddRefs(dialogWindow));
}
