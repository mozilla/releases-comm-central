/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMailboxService_h___
#define nsMailboxService_h___

#include "nscore.h"
#include "nsISupports.h"

#include "nsIMsgFolder.h"
#include "nsIMsgMessageService.h"
#include "nsIMsgWindow.h"
#include "nsIMailboxUrl.h"
#include "nsIURI.h"
#include "nsIUrlListener.h"
#include "nsIProtocolHandler.h"

class nsMailboxService : public nsIMsgMessageService,
                         public nsIMsgMessageFetchPartService,
                         public nsIProtocolHandler {
 public:
  nsMailboxService();
  static nsresult NewURI(const nsACString& aSpec, const char* aOriginCharset,
                         nsIURI* aBaseURI, nsIURI** _retval);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGMESSAGESERVICE
  NS_DECL_NSIMSGMESSAGEFETCHPARTSERVICE
  NS_DECL_NSIPROTOCOLHANDLER

 protected:
  virtual ~nsMailboxService();

  // helper functions used by the service
  nsresult PrepareMessageUrl(const nsACString& aSrcMsgMailboxURI,
                             nsIUrlListener* aUrlListener,
                             nsMailboxAction aMailboxAction,
                             nsIMailboxUrl** aMailboxUrl,
                             nsIMsgWindow* msgWindow);

  nsresult RunMailboxUrl(nsIURI* aMailboxUrl,
                         nsISupports* aDisplayConsumer = nullptr);

  nsresult FetchMessage(
      const nsACString& aMessageURI, nsISupports* aDisplayConsumer,
      nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener,
      const char* aFileName, /* only used by open attachment */
      nsMailboxAction mailboxAction, bool aAutodetectCharset, nsIURI** aURL);

  nsresult DecomposeMailboxURI(const nsACString& aMessageURI,
                               nsIMsgFolder** aFolder, nsMsgKey* aMsgKey);
};

#endif /* nsMailboxService_h___ */
