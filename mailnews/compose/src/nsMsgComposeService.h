/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIMsgComposeService.h"
#include "nsCOMPtr.h"
#include "nsWeakReference.h"
#include "nsIWeakReference.h"
#include "nsIMimeStreamConverter.h"
#include "nsInterfaceHashtable.h"

#include "nsICommandLineHandler.h"

class nsMsgComposeService : public nsIMsgComposeService,
                            public nsICommandLineHandler,
                            public nsSupportsWeakReference {
 public:
  nsMsgComposeService();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOMPOSESERVICE
  NS_DECL_NSICOMMANDLINEHANDLER

  nsresult Init();
  void Reset();
  void DeleteCachedWindows();
  nsresult AddGlobalHtmlDomains();

 private:
  virtual ~nsMsgComposeService();

  nsresult GetTo3PaneWindow();

  nsresult LoadDraftOrTemplate(
      const nsACString& aMsgURI, nsMimeOutputType aOutType,
      nsIMsgIdentity* aIdentity, const nsACString& aOriginalMsgURI,
      nsIMsgDBHdr* aOrigMsgHdr, bool aForwardInline, bool overrideComposeFormat,
      nsIMsgWindow* aMsgWindow, bool autodetectCharset);

  nsresult RunMessageThroughMimeDraft(
      const nsACString& aMsgURI, nsMimeOutputType aOutType,
      nsIMsgIdentity* aIdentity, const nsACString& aOriginalMsgURI,
      nsIMsgDBHdr* aOrigMsgHdr, bool aForwardInline, const nsAString& forwardTo,
      bool overrideComposeFormat, nsIMsgWindow* aMsgWindow,
      bool autodetectCharset);

  // hash table mapping dom windows to nsIMsgCompose objects
  nsInterfaceHashtable<nsISupportsHashKey, nsIWeakReference>
      mOpenComposeWindows;

  // When doing a reply and the settings are enabled, get the HTML of the
  // selected text in the original message window so that it can be quoted
  // instead of the entire message.
  nsresult GetOrigWindowSelection(mozilla::dom::Selection* selection,
                                  nsACString& aSelHTML);
};
