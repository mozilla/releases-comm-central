/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/******************************************************************************
 * nsMsgContentPolicy enforces the specified content policy on images, js,
 * plugins, etc. This is the class used to determine what elements in a message
 * should be loaded.
 *
 * nsMsgCookiePolicy enforces our cookie policy for mail and RSS messages.
 ******************************************************************************/

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGCONTENTPOLICY_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGCONTENTPOLICY_H_

#include "nsIContentPolicy.h"
#include "nsIObserver.h"
#include "nsWeakReference.h"
#include "nsString.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgCompose.h"
#include "nsIDocShell.h"
#include "nsIPermissionManager.h"
#include "nsIMsgContentPolicy.h"
#include "nsTArray.h"

class nsIMsgDBHdr;
class nsIDocShell;

class nsMsgContentPolicy : public nsIContentPolicy,
                           public nsIObserver,
                           public nsIMsgContentPolicy,
                           public nsSupportsWeakReference {
 public:
  nsMsgContentPolicy();

  nsresult Init();

  NS_DECL_ISUPPORTS
  NS_DECL_NSICONTENTPOLICY
  NS_DECL_NSIOBSERVER
  NS_DECL_NSIMSGCONTENTPOLICY

 protected:
  virtual ~nsMsgContentPolicy();

  bool mBlockRemoteImages;
  nsCString mTrustedMailDomains;
  nsCOMPtr<nsIPermissionManager> mPermissionManager;

  bool IsTrustedDomain(nsIURI* aContentLocation);
  bool IsSafeRequestingLocation(nsIURI* aRequestingLocation);
  bool IsExposedProtocol(nsIURI* aContentLocation);
  bool IsExposedChromeProtocol(nsIURI* aContentLocation);
  bool ShouldBlockUnexposedProtocol(nsIURI* aContentLocation);

  bool ShouldAcceptRemoteContentForSender(nsIMsgDBHdr* aMsgHdr);
  int16_t ShouldAcceptRemoteContentForMsgHdr(nsIMsgDBHdr* aMsgHdr,
                                             nsIURI* aRequestingLocation,
                                             nsIURI* aContentLocation);
  void NotifyContentWasBlocked(uint64_t aBrowsingContextId,
                               nsIURI* aContentLocation);
  void ShouldAcceptContentForPotentialMsg(uint64_t aBrowsingContextId,
                                          nsIURI* aOriginatorLocation,
                                          nsIURI* aContentLocation,
                                          int16_t* aDecision);
  void ComposeShouldLoad(nsIMsgCompose* aMsgCompose,
                         nsISupports* aRequestingContext,
                         nsIURI* aOriginatorLocation, nsIURI* aContentLocation,
                         int16_t* aDecision);
  already_AddRefed<nsIMsgCompose> GetMsgComposeForBrowsingContext(
      mozilla::dom::BrowsingContext* aRequestingContext);

  nsresult GetRootDocShellForContext(nsISupports* aRequestingContext,
                                     nsIDocShell** aDocShell);
  nsresult GetOriginatingURIForContext(nsISupports* aRequestingContext,
                                       nsIURI** aURI);
  nsresult SetDisableItemsOnMailNewsUrlDocshells(nsIURI* aContentLocation,
                                                 nsILoadInfo* aLoadInfo);

  nsTArray<nsCString> mCustomExposedProtocols;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGCONTENTPOLICY_H_
