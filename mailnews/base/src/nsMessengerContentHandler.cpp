/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessengerContentHandler.h"
#include "nsIChannel.h"
#include "nsPIDOMWindow.h"
#include "nsIServiceManager.h"
#include "nsIWindowWatcher.h"
#include "nsIDocShell.h"
#include "nsIWebNavigation.h"
#include "nsString.h"
#include "nsMsgBaseCID.h"
#include "plstr.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsServiceManagerUtils.h"
#include "nsIURIMutator.h"

nsMessengerContentHandler::nsMessengerContentHandler() {}

/* the following macro actually implement addref, release and query interface
 * for our component. */
NS_IMPL_ISUPPORTS(nsMessengerContentHandler, nsIContentHandler)

nsMessengerContentHandler::~nsMessengerContentHandler() {}

NS_IMETHODIMP nsMessengerContentHandler::HandleContent(
    const char* aContentType, nsIInterfaceRequestor* aWindowContext,
    nsIRequest* request) {
  nsresult rv = NS_OK;
  if (!request) return NS_ERROR_NULL_POINTER;

  // First of all, get the content type and make sure it is a content type we
  // know how to handle!
  if (PL_strcasecmp(aContentType, "application/x-message-display") == 0) {
    nsCOMPtr<nsIURI> aUri;
    nsCOMPtr<nsIChannel> aChannel = do_QueryInterface(request);
    if (!aChannel) return NS_ERROR_FAILURE;

    rv = aChannel->GetURI(getter_AddRefs(aUri));
    if (aUri) {
      rv = request->Cancel(NS_ERROR_ABORT);
      if (NS_SUCCEEDED(rv)) {
        nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(aUri);
        if (mailnewsurl) {
          nsAutoCString queryPart;
          mailnewsurl->GetQuery(queryPart);
          queryPart.Replace(queryPart.Find("type=message/rfc822"),
                            sizeof("type=message/rfc822") - 1,
                            "type=application/x-message-display");
          // Don't mutate/clone here.
          rv = mailnewsurl->SetQueryInternal(queryPart);
          NS_ENSURE_SUCCESS(rv, rv);
          rv = OpenWindow(aUri);
        } else {
          // Not an nsIMsgMailNewsUrl, so maybe a file URL, like opening a
          // message attachment (.eml file in a temp directory).
          nsAutoCString scheme;
          rv = aUri->GetScheme(scheme);
          NS_ENSURE_SUCCESS(rv, rv);
          if (scheme.Equals("file")) {
            // Add a special bit like in MsgOpenFromFile().
            rv = NS_MutateURI(aUri)
                     .SetQuery("type=application/x-message-display"_ns)
                     .Finalize(aUri);
            NS_ENSURE_SUCCESS(rv, rv);
          }
          rv = OpenWindow(aUri);
        }
      }
    }
  }

  return rv;
}

// Utility function to open a message display window and and load the message in
// it.
nsresult nsMessengerContentHandler::OpenWindow(nsIURI* aURI) {
  NS_ENSURE_ARG_POINTER(aURI);

  nsCOMPtr<nsIWindowWatcher> wwatch =
      do_GetService("@mozilla.org/embedcomp/window-watcher;1");
  if (!wwatch) return NS_ERROR_FAILURE;

  nsCOMPtr<mozIDOMWindowProxy> newWindow;
  return wwatch->OpenWindow(
      0, "chrome://messenger/content/messageWindow.xhtml"_ns, "_blank"_ns,
      "all,chrome,dialog=no,status,toolbar"_ns, aURI,
      getter_AddRefs(newWindow));
}
