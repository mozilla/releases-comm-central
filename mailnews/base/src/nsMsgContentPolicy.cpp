/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgContentPolicy.h"
#include "nsIMsgMailSession.h"
#include "nsIPermissionManager.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIAbManager.h"
#include "nsIAbDirectory.h"
#include "nsIAbCard.h"
#include "nsIMsgWindow.h"
#include "nsIMsgHdr.h"
#include "nsIEncryptedSMIMEURIsSrvc.h"
#include "nsNetUtil.h"
#include "nsIMsgComposeService.h"
#include "nsIDocShellTreeItem.h"
#include "nsIWebNavigation.h"
#include "nsContentPolicyUtils.h"
#include "nsFrameLoaderOwner.h"
#include "nsFrameLoader.h"
#include "nsMsgUtils.h"
#include "nsThreadUtils.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/dom/HTMLImageElement.h"
#include "nsINntpUrl.h"
#include "nsILoadInfo.h"
#include "nsSandboxFlags.h"
#include "nsQueryObject.h"
#include "mozilla/dom/WindowGlobalParent.h"
#include "mozilla/SyncRunnable.h"
#include "nsIObserverService.h"

static const char kBlockRemoteImages[] =
    "mailnews.message_display.disable_remote_image";
static const char kTrustedDomains[] = "mail.trusteddomains";

using namespace mozilla;
using namespace mozilla::mailnews;

// Per message headder flags to keep track of whether the user is allowing
// remote content for a particular message. if you change or add more values to
// these constants, be sure to modify the corresponding definitions in
// mailWindowOverlay.js
#define kNoRemoteContentPolicy 0
#define kBlockRemoteContent 1
#define kAllowRemoteContent 2

NS_IMPL_ISUPPORTS(nsMsgContentPolicy, nsIContentPolicy, nsIMsgContentPolicy,
                  nsIObserver, nsISupportsWeakReference)

nsMsgContentPolicy::nsMsgContentPolicy() { mBlockRemoteImages = true; }

nsMsgContentPolicy::~nsMsgContentPolicy() {
  // hey, we are going away...clean up after ourself....unregister our observer
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefInternal =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv)) {
    prefInternal->RemoveObserver(kBlockRemoteImages, this);
  }
}

nsresult nsMsgContentPolicy::Init() {
  nsresult rv;

  // register ourself as an observer on the mail preference to block remote
  // images
  nsCOMPtr<nsIPrefBranch> prefInternal =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  prefInternal->AddObserver(kBlockRemoteImages, this, true);

  prefInternal->GetCharPref(kTrustedDomains, mTrustedMailDomains);
  prefInternal->GetBoolPref(kBlockRemoteImages, &mBlockRemoteImages);

  // Grab a handle on the PermissionManager service for managing allowed remote
  // content senders.
  mPermissionManager = do_GetService(NS_PERMISSIONMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

/**
 * @returns true if the sender referenced by aMsgHdr is explicitly allowed to
 *          load remote images according to the PermissionManager
 */
bool nsMsgContentPolicy::ShouldAcceptRemoteContentForSender(
    nsIMsgDBHdr* aMsgHdr) {
  if (!aMsgHdr) return false;

  // extract the e-mail address from the msg hdr
  nsCString author;
  nsresult rv = aMsgHdr->GetAuthor(getter_Copies(author));
  NS_ENSURE_SUCCESS(rv, false);

  nsCString emailAddress;
  ExtractEmail(EncodedHeader(author), emailAddress);
  if (emailAddress.IsEmpty()) return false;

  nsCOMPtr<nsIIOService> ios =
      do_GetService("@mozilla.org/network/io-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, false);
  nsCOMPtr<nsIURI> mailURI;
  emailAddress.InsertLiteral("chrome://messenger/content/email=", 0);
  rv = ios->NewURI(emailAddress, nullptr, nullptr, getter_AddRefs(mailURI));
  NS_ENSURE_SUCCESS(rv, false);

  // check with permission manager
  uint32_t permission = 0;
  mozilla::OriginAttributes attrs;
  RefPtr<mozilla::BasePrincipal> principal =
      mozilla::BasePrincipal::CreateContentPrincipal(mailURI, attrs);
  rv = mPermissionManager->TestPermissionFromPrincipal(principal, "image"_ns,
                                                       &permission);
  NS_ENSURE_SUCCESS(rv, false);

  // Only return true if the permission manager has an explicit allow
  return (permission == nsIPermissionManager::ALLOW_ACTION);
}

/**
 * Extract the host name from aContentLocation, and look it up in our list
 * of trusted domains.
 */
bool nsMsgContentPolicy::IsTrustedDomain(nsIURI* aContentLocation) {
  bool trustedDomain = false;
  // get the host name of the server hosting the remote image
  nsAutoCString host;
  nsresult rv = aContentLocation->GetHost(host);

  if (NS_SUCCEEDED(rv) && !mTrustedMailDomains.IsEmpty())
    trustedDomain = MsgHostDomainIsTrusted(host, mTrustedMailDomains);

  return trustedDomain;
}

NS_IMETHODIMP
nsMsgContentPolicy::ShouldLoad(nsIURI* aContentLocation, nsILoadInfo* aLoadInfo,
                               int16_t* aDecision) {
  nsresult rv = NS_OK;
  ExtContentPolicyType aContentType = aLoadInfo->GetExternalContentPolicyType();
  nsCOMPtr<nsISupports> aRequestingContext;
  if (aContentType == ExtContentPolicy::TYPE_DOCUMENT)
    aRequestingContext = aLoadInfo->ContextForTopLevelLoad();
  else
    aRequestingContext = aLoadInfo->LoadingNode();
  nsCOMPtr<nsIPrincipal> loadingPrincipal = aLoadInfo->GetLoadingPrincipal();
  nsCOMPtr<nsIURI> aRequestingLocation;
  if (loadingPrincipal) {
    BasePrincipal::Cast(loadingPrincipal)
        ->GetURI(getter_AddRefs(aRequestingLocation));
  }

  // The default decision at the start of the function is to accept the load.
  // Once we have checked the content type and the requesting location, then
  // we switch it to reject.
  //
  // Be very careful about returning error codes - if this method returns an
  // NS_ERROR_*, any decision made here will be ignored, and the document could
  // be accepted when we don't want it to be.
  //
  // In most cases if an error occurs, its something we didn't expect so we
  // should be rejecting the document anyway.
  *aDecision = nsIContentPolicy::ACCEPT;

  NS_ENSURE_ARG_POINTER(aContentLocation);

#ifdef DEBUG_MsgContentPolicy
  fprintf(stderr, "aContentType: %d\naContentLocation = %s\n", aContentType,
          aContentLocation->GetSpecOrDefault().get());
  fprintf(stderr, "aRequestingContext is %s\n",
          aRequestingContext ? "not null" : "null");
#endif

#ifndef MOZ_THUNDERBIRD
  // Go find out if we are dealing with mailnews. Anything else
  // isn't our concern and we accept content.
  nsCOMPtr<nsIDocShell> rootDocShell;
  rv = GetRootDocShellForContext(aRequestingContext,
                                 getter_AddRefs(rootDocShell));
  NS_ENSURE_SUCCESS(rv, rv);

  // We only want to deal with mailnews
  if (rootDocShell->GetAppType() != nsIDocShell::APP_TYPE_MAIL) return NS_OK;
#endif

  switch (aContentType) {
      // Plugins (nsIContentPolicy::TYPE_OBJECT) are blocked on document load.
    case ExtContentPolicy::TYPE_DOCUMENT:
      // At this point, we have no intention of supporting a different JS
      // setting on a subdocument, so we don't worry about TYPE_SUBDOCUMENT
      // here.

      if (NS_IsMainThread()) {
        rv = SetDisableItemsOnMailNewsUrlDocshells(aContentLocation, aLoadInfo);
      } else {
        auto SetDisabling = [&, location = nsCOMPtr(aContentLocation),
                             loadInfo = nsCOMPtr(aLoadInfo)]() -> auto {
          rv = SetDisableItemsOnMailNewsUrlDocshells(location, loadInfo);
        };
        nsCOMPtr<nsIRunnable> task =
            NS_NewRunnableFunction("SetDisabling", SetDisabling);
        mozilla::SyncRunnable::DispatchToThread(
            mozilla::GetMainThreadSerialEventTarget(), task);
      }
      // if something went wrong during the tweaking, reject this content
      if (NS_FAILED(rv)) {
        NS_WARNING("Failed to set disable items on docShells");
        *aDecision = nsIContentPolicy::REJECT_TYPE;
        return NS_OK;
      }
      break;

    case ExtContentPolicy::TYPE_CSP_REPORT:
      // We cannot block CSP reports.
      *aDecision = nsIContentPolicy::ACCEPT;
      return NS_OK;
      break;

    default:
      break;
  }

  // NOTE: Not using NS_ENSURE_ARG_POINTER because this is a legitimate case
  // that can happen.  Also keep in mind that the default policy used for a
  // failure code is ACCEPT.
  if (!aRequestingLocation) return NS_ERROR_INVALID_POINTER;

#ifdef DEBUG_MsgContentPolicy
  fprintf(stderr, "aRequestingLocation = %s\n",
          aRequestingLocation->GetSpecOrDefault().get());
#endif

  // If the requesting location is safe, accept the content location request.
  if (IsSafeRequestingLocation(aRequestingLocation)) return rv;

  // Now default to reject so early returns via NS_ENSURE_SUCCESS
  // cause content to be rejected.
  *aDecision = nsIContentPolicy::REJECT_REQUEST;

  // We want to establish the following:
  // \--------\  requester    |               |              |
  // content   \------------\ |               |              |
  // requested               \| mail message  | news message | http(s)/data etc.
  // -------------------------+---------------+--------------+------------------
  // mail message content     | load if same  | don't load   | don't load
  // mailbox, imap, JsAccount | message (1)   | (2)          | (3)
  // -------------------------+---------------+--------------+------------------
  // news message             | don't load (4)| load (5)     | load (6)
  // -------------------------+---------------+--------------+------------------
  // http(s)/data, etc.       | (default)     | (default)    | (default)
  // -------------------------+---------------+--------------+------------------
  nsCOMPtr<nsIMsgMessageUrl> contentURL(do_QueryInterface(aContentLocation));
  if (contentURL) {
    nsCOMPtr<nsINntpUrl> contentNntpURL(do_QueryInterface(aContentLocation));
    if (!contentNntpURL) {
      // Mail message (mailbox, imap or JsAccount) content requested, for
      // example a message part, like an image: To load mail message content the
      // requester must have the same "normalized" principal. This is basically
      // a "same origin" test, it protects against cross-loading of mail message
      // content from other mail or news messages.
      nsCOMPtr<nsIMsgMessageUrl> requestURL(
          do_QueryInterface(aRequestingLocation));
      // If the request URL is not also a message URL, then we don't accept.
      if (requestURL) {
        nsCString contentPrincipalSpec, requestPrincipalSpec;
        nsresult rv1 = contentURL->GetNormalizedSpec(contentPrincipalSpec);
        nsresult rv2 = requestURL->GetNormalizedSpec(requestPrincipalSpec);
        if (NS_SUCCEEDED(rv1) && NS_SUCCEEDED(rv2) &&
            contentPrincipalSpec.Equals(requestPrincipalSpec))
          *aDecision = nsIContentPolicy::ACCEPT;  // (1)
      }
      return NS_OK;  // (2) and (3)
    }

    // News message content requested. Don't accept request coming
    // from a mail message since it would access the news server.
    nsCOMPtr<nsIMsgMessageUrl> requestURL(
        do_QueryInterface(aRequestingLocation));
    if (requestURL) {
      nsCOMPtr<nsINntpUrl> requestNntpURL(
          do_QueryInterface(aRequestingLocation));
      if (!requestNntpURL) return NS_OK;  // (4)
    }
    *aDecision = nsIContentPolicy::ACCEPT;  // (5) and (6)
    return NS_OK;
  }

  // If exposed protocol not covered by the test above or protocol that has been
  // specifically exposed by an add-on, or is a chrome url, then allow the load.
  if (IsExposedProtocol(aContentLocation)) {
    *aDecision = nsIContentPolicy::ACCEPT;
    return NS_OK;
  }

  // Never load unexposed protocols except for web protocols and file.
  // Protocols like ftp are always blocked.
  if (ShouldBlockUnexposedProtocol(aContentLocation)) return NS_OK;

  // Mailnews URIs are not loaded in child processes, so I think that beyond
  // here, if we're in a child process, the decision will always be accept.
  //
  // targetContext->Canonical does not work in a child process, so we can't
  // really move on anyway.
  if (!XRE_IsParentProcess()) {
    *aDecision = nsIContentPolicy::ACCEPT;
    return NS_OK;
  }

  // Find out the URI that originally initiated the set of requests for this
  // context.
  RefPtr<mozilla::dom::BrowsingContext> targetContext;
  rv = aLoadInfo->GetTargetBrowsingContext(getter_AddRefs(targetContext));
  NS_ENSURE_SUCCESS(rv, NS_OK);

  if (!targetContext) {
    *aDecision = nsIContentPolicy::ACCEPT;
    return NS_OK;
  }

  nsCOMPtr<nsIURI> originatorLocation;
  dom::CanonicalBrowsingContext* cbc = targetContext->Canonical();
  if (cbc) {
    dom::WindowGlobalParent* wgp = cbc->GetCurrentWindowGlobal();
    if (wgp) {
      originatorLocation = wgp->GetDocumentURI();
    }
  }
  if (!originatorLocation) {
    return NS_OK;
  }

#ifdef DEBUG_MsgContentPolicy
  fprintf(stderr, "originatorLocation = %s\n",
          originatorLocation->GetSpecOrDefault().get());
#endif

  // Don't load remote content for encrypted messages.
  nsCOMPtr<nsIEncryptedSMIMEURIsService> encryptedURIService = do_GetService(
      "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  bool isEncrypted;
  rv = encryptedURIService->IsEncrypted(aRequestingLocation->GetSpecOrDefault(),
                                        &isEncrypted);
  NS_ENSURE_SUCCESS(rv, rv);
  if (isEncrypted) {
    *aDecision = nsIContentPolicy::REJECT_REQUEST;
    NotifyContentWasBlocked(targetContext->Id(), aContentLocation);
    return NS_OK;
  }

  // If we are allowing all remote content...
  if (!mBlockRemoteImages) {
    *aDecision = nsIContentPolicy::ACCEPT;
    return NS_OK;
  }

  uint32_t permission;
  mozilla::OriginAttributes attrs;
  RefPtr<mozilla::BasePrincipal> principal =
      mozilla::BasePrincipal::CreateContentPrincipal(aContentLocation, attrs);
  mPermissionManager->TestPermissionFromPrincipal(principal, "image"_ns,
                                                  &permission);
  switch (permission) {
    case nsIPermissionManager::UNKNOWN_ACTION: {
      // No exception was found for this location.
      break;
    }
    case nsIPermissionManager::ALLOW_ACTION: {
      *aDecision = nsIContentPolicy::ACCEPT;
      return NS_OK;
    }
    case nsIPermissionManager::DENY_ACTION: {
      *aDecision = nsIContentPolicy::REJECT_REQUEST;
      return NS_OK;
    }
  }

  // Handle compose windows separately from mail. Work out if we're in a compose
  // window or not.
  nsCOMPtr<nsIMsgCompose> msgCompose =
      GetMsgComposeForBrowsingContext(targetContext);
  if (msgCompose) {
    ComposeShouldLoad(msgCompose, aRequestingContext, originatorLocation,
                      aContentLocation, aDecision);
    return NS_OK;
  }

  // Allow content when using a remote page.
  bool isHttp;
  bool isHttps;
  rv = originatorLocation->SchemeIs("http", &isHttp);
  nsresult rv2 = originatorLocation->SchemeIs("https", &isHttps);
  if (NS_SUCCEEDED(rv) && NS_SUCCEEDED(rv2) && (isHttp || isHttps)) {
    *aDecision = nsIContentPolicy::ACCEPT;
    return NS_OK;
  }

  // The default decision is still to reject.
  ShouldAcceptContentForPotentialMsg(targetContext->Id(), aRequestingLocation,
                                     aContentLocation, aDecision);
  return NS_OK;
}

/**
 * Determines if the requesting location is a safe one, i.e. its under the
 * app/user's control - so file, about, chrome etc.
 */
bool nsMsgContentPolicy::IsSafeRequestingLocation(nsIURI* aRequestingLocation) {
  if (!aRequestingLocation) return false;

  // If aRequestingLocation is one of chrome, resource, file or view-source,
  // allow aContentLocation to load.
  bool isChrome;
  bool isRes;
  bool isFile;
  bool isViewSource;

  nsresult rv = aRequestingLocation->SchemeIs("chrome", &isChrome);
  NS_ENSURE_SUCCESS(rv, false);
  rv = aRequestingLocation->SchemeIs("resource", &isRes);
  NS_ENSURE_SUCCESS(rv, false);
  rv = aRequestingLocation->SchemeIs("file", &isFile);
  NS_ENSURE_SUCCESS(rv, false);
  rv = aRequestingLocation->SchemeIs("view-source", &isViewSource);
  NS_ENSURE_SUCCESS(rv, false);

  if (isChrome || isRes || isFile || isViewSource) return true;

  // Only allow about: to load anything if the requesting location is not the
  // special about:blank one.
  bool isAbout;
  rv = aRequestingLocation->SchemeIs("about", &isAbout);
  NS_ENSURE_SUCCESS(rv, false);

  if (!isAbout) return false;

  nsCString fullSpec;
  rv = aRequestingLocation->GetSpec(fullSpec);
  NS_ENSURE_SUCCESS(rv, false);

  return !fullSpec.EqualsLiteral("about:blank");
}

/**
 * Determines if the content location is a scheme that we're willing to expose
 * for unlimited loading of content.
 */
bool nsMsgContentPolicy::IsExposedProtocol(nsIURI* aContentLocation) {
  nsAutoCString contentScheme;
  nsresult rv = aContentLocation->GetScheme(contentScheme);
  NS_ENSURE_SUCCESS(rv, false);

  // Check some exposed protocols. Not all protocols in the list of
  // network.protocol-handler.expose.* prefs in all-thunderbird.js are
  // admitted purely based on their scheme.
  // news, snews, nntp, imap and mailbox are checked before the call
  // to this function by matching content location and requesting location.
  if (contentScheme.LowerCaseEqualsLiteral("mailto")) return true;

  if (contentScheme.LowerCaseEqualsLiteral("about")) {
    // We want to allow about pages to load content freely. But not about:blank.
    nsAutoCString fullSpec;
    rv = aContentLocation->GetSpec(fullSpec);
    NS_ENSURE_SUCCESS(rv, false);
    if (fullSpec.EqualsLiteral("about:blank")) {
      return false;
    }
    return true;
  }

  // check if customized exposed scheme
  if (mCustomExposedProtocols.Contains(contentScheme)) return true;

  bool isChrome;
  rv = aContentLocation->SchemeIs("chrome", &isChrome);
  NS_ENSURE_SUCCESS(rv, false);

  bool isRes;
  rv = aContentLocation->SchemeIs("resource", &isRes);
  NS_ENSURE_SUCCESS(rv, false);

  bool isData;
  rv = aContentLocation->SchemeIs("data", &isData);
  NS_ENSURE_SUCCESS(rv, false);

  bool isMozExtension;
  rv = aContentLocation->SchemeIs("moz-extension", &isMozExtension);
  NS_ENSURE_SUCCESS(rv, false);

  return isChrome || isRes || isData || isMozExtension;
}

/**
 * We block most unexposed protocols that access remote data
 * - apart from web protocols, and file.
 */
bool nsMsgContentPolicy::ShouldBlockUnexposedProtocol(
    nsIURI* aContentLocation) {
  // Error condition - we must return true so that we block.

  // about:blank is "web", it should not be blocked.
  nsAutoCString fullSpec;
  nsresult rv = aContentLocation->GetSpec(fullSpec);
  NS_ENSURE_SUCCESS(rv, true);
  if (fullSpec.EqualsLiteral("about:blank")) {
    return false;
  }

  bool isHttp;
  rv = aContentLocation->SchemeIs("http", &isHttp);
  NS_ENSURE_SUCCESS(rv, true);

  bool isHttps;
  rv = aContentLocation->SchemeIs("https", &isHttps);
  NS_ENSURE_SUCCESS(rv, true);

  bool isWs;  // websocket
  rv = aContentLocation->SchemeIs("ws", &isWs);
  NS_ENSURE_SUCCESS(rv, true);

  bool isWss;  // secure websocket
  rv = aContentLocation->SchemeIs("wss", &isWss);
  NS_ENSURE_SUCCESS(rv, true);

  bool isBlob;
  rv = aContentLocation->SchemeIs("blob", &isBlob);
  NS_ENSURE_SUCCESS(rv, true);

  bool isFile;
  rv = aContentLocation->SchemeIs("file", &isFile);
  NS_ENSURE_SUCCESS(rv, true);

  return !isHttp && !isHttps && !isWs && !isWss && !isBlob && !isFile;
}

/**
 * The default for this function will be to reject the content request.
 * When determining if to allow the request for a given msg hdr, the function
 * will go through the list of remote content blocking criteria:
 *
 * #1 Allow if there is a db header for a manual override.
 * #2 Allow if the message is in an RSS folder.
 * #3 Allow if the domain for the remote image in our white list.
 * #4 Allow if the author has been specifically white listed.
 */
int16_t nsMsgContentPolicy::ShouldAcceptRemoteContentForMsgHdr(
    nsIMsgDBHdr* aMsgHdr, nsIURI* aRequestingLocation,
    nsIURI* aContentLocation) {
  if (!aMsgHdr) return static_cast<int16_t>(nsIContentPolicy::REJECT_REQUEST);

  // Case #1, check the db hdr for the remote content policy on this particular
  // message.
  uint32_t remoteContentPolicy = kNoRemoteContentPolicy;
  aMsgHdr->GetUint32Property("remoteContentPolicy", &remoteContentPolicy);

  // Case #2, check if the message is in an RSS folder
  bool isRSS = false;
  IsRSSArticle(aRequestingLocation, &isRSS);

  // Case #3, the domain for the remote image is in our white list
  bool trustedDomain = IsTrustedDomain(aContentLocation);

  // Case 4 means looking up items in the permissions database. So if
  // either of the two previous items means we load the data, just do it.
  if (isRSS || remoteContentPolicy == kAllowRemoteContent || trustedDomain)
    return nsIContentPolicy::ACCEPT;

  // Case #4, author is in our white list..
  bool allowForSender = ShouldAcceptRemoteContentForSender(aMsgHdr);

  int16_t result = allowForSender
                       ? static_cast<int16_t>(nsIContentPolicy::ACCEPT)
                       : static_cast<int16_t>(nsIContentPolicy::REJECT_REQUEST);

  // kNoRemoteContentPolicy means we have never set a value on the message
  if (result == nsIContentPolicy::REJECT_REQUEST && !remoteContentPolicy)
    aMsgHdr->SetUint32Property("remoteContentPolicy", kBlockRemoteContent);

  return result;
}

class RemoteContentNotifierEvent : public mozilla::Runnable {
 public:
  RemoteContentNotifierEvent(uint64_t aBrowsingContextId, nsIURI* aContentURI)
      : mozilla::Runnable("RemoteContentNotifierEvent"),
        mBrowsingContextId(aBrowsingContextId),
        mContentURI(aContentURI) {}

  NS_IMETHOD Run() {
    nsAutoString data;
    data.AppendInt(mBrowsingContextId);
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    observerService->NotifyObservers(mContentURI, "remote-content-blocked",
                                     data.get());
    return NS_OK;
  }

 private:
  uint64_t mBrowsingContextId;
  nsCOMPtr<nsIURI> mContentURI;
};

/**
 * This function is used to show a blocked remote content notification.
 */
void nsMsgContentPolicy::NotifyContentWasBlocked(uint64_t aBrowsingContextId,
                                                 nsIURI* aContentLocation) {
  // Post this as an event because it can cause dom mutations, and we
  // get called at a bad time to be causing dom mutations.
  NS_DispatchToCurrentThread(
      new RemoteContentNotifierEvent(aBrowsingContextId, aContentLocation));
}

/**
 * This function is used to determine if we allow content for a remote message.
 * If we reject loading remote content, then we'll inform the message window
 * that this message has remote content (and hence we are not loading it).
 *
 * See ShouldAcceptRemoteContentForMsgHdr for the actual decisions that
 * determine if we are going to allow remote content.
 */
void nsMsgContentPolicy::ShouldAcceptContentForPotentialMsg(
    uint64_t aBrowsingContextId, nsIURI* aRequestingLocation,
    nsIURI* aContentLocation, int16_t* aDecision) {
  NS_ASSERTION(
      *aDecision == nsIContentPolicy::REJECT_REQUEST,
      "AllowContentForPotentialMessage expects default decision to be reject!");

  // Is it a mailnews url?
  nsresult rv;
  nsCOMPtr<nsIMsgMessageUrl> msgUrl(
      do_QueryInterface(aRequestingLocation, &rv));
  if (NS_FAILED(rv)) {
    // It isn't a mailnews url - so we accept the load here, and let other
    // content policies make the decision if we should be loading it or not.
    *aDecision = nsIContentPolicy::ACCEPT;
    return;
  }

  nsCString resourceURI;
  rv = msgUrl->GetUri(resourceURI);
  NS_ENSURE_SUCCESS_VOID(rv);

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  rv = GetMsgDBHdrFromURI(resourceURI, getter_AddRefs(msgHdr));

  // Get a decision on whether or not to allow remote content for this message
  // header.
  *aDecision = ShouldAcceptRemoteContentForMsgHdr(msgHdr, aRequestingLocation,
                                                  aContentLocation);

  // If we're not allowing the remote content, tell the nsIMsgWindow loading
  // this url that this is the case, so that the UI knows to show the remote
  // content header bar, so the user can override if they wish.
  if (*aDecision == nsIContentPolicy::REJECT_REQUEST) {
    NotifyContentWasBlocked(aBrowsingContextId, aContentLocation);
  }
}

/**
 * Content policy logic for compose windows
 */
void nsMsgContentPolicy::ComposeShouldLoad(nsIMsgCompose* aMsgCompose,
                                           nsISupports* aRequestingContext,
                                           nsIURI* aOriginatorLocation,
                                           nsIURI* aContentLocation,
                                           int16_t* aDecision) {
  NS_ASSERTION(*aDecision == nsIContentPolicy::REJECT_REQUEST,
               "ComposeShouldLoad expects default decision to be reject!");

  nsCString originalMsgURI;
  nsresult rv = aMsgCompose->GetOriginalMsgURI(originalMsgURI);
  NS_ENSURE_SUCCESS_VOID(rv);

  if (!originalMsgURI.IsEmpty()) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = GetMsgDBHdrFromURI(originalMsgURI, getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS_VOID(rv);
    *aDecision =
        ShouldAcceptRemoteContentForMsgHdr(msgHdr, nullptr, aContentLocation);

    if (!aOriginatorLocation->GetSpecOrDefault().EqualsLiteral(
            "about:blank?compose")) {
      return;
    }
  }

  // We want to allow the user to add remote content, but do that only when
  // the allowRemoteContent was set. This way quoted remoted content won't
  // automatically load, but e.g. pasted content will load because the UI
  // code toggles the flag.
  nsCOMPtr<mozilla::dom::Element> element =
      do_QueryInterface(aRequestingContext);
  RefPtr<mozilla::dom::HTMLImageElement> image =
      mozilla::dom::HTMLImageElement::FromNodeOrNull(element);
  if (image) {
    // Special case image elements.
    bool allowRemoteContent = false;
    aMsgCompose->GetAllowRemoteContent(&allowRemoteContent);
    if (allowRemoteContent) {
      *aDecision = nsIContentPolicy::ACCEPT;
      return;
    }
  }
}

already_AddRefed<nsIMsgCompose>
nsMsgContentPolicy::GetMsgComposeForBrowsingContext(
    mozilla::dom::BrowsingContext* aBrowsingContext) {
  nsresult rv;

  nsIDocShell* shell = aBrowsingContext->GetDocShell();
  if (!shell) return nullptr;
  nsCOMPtr<nsIDocShellTreeItem> docShellTreeItem(shell);

  nsCOMPtr<nsIDocShellTreeItem> rootItem;
  rv = docShellTreeItem->GetInProcessSameTypeRootTreeItem(
      getter_AddRefs(rootItem));
  NS_ENSURE_SUCCESS(rv, nullptr);

  nsCOMPtr<nsIDocShell> docShell(do_QueryInterface(rootItem, &rv));
  NS_ENSURE_SUCCESS(rv, nullptr);

  nsCOMPtr<nsIMsgComposeService> composeService(
      do_GetService("@mozilla.org/messengercompose;1", &rv));
  NS_ENSURE_SUCCESS(rv, nullptr);

  nsCOMPtr<nsIMsgCompose> msgCompose;
  // Don't bother checking rv, as GetMsgComposeForDocShell returns
  // NS_ERROR_FAILURE for not found.
  composeService->GetMsgComposeForDocShell(docShell,
                                           getter_AddRefs(msgCompose));
  return msgCompose.forget();
}

nsresult nsMsgContentPolicy::SetDisableItemsOnMailNewsUrlDocshells(
    nsIURI* aContentLocation, nsILoadInfo* aLoadInfo) {
  // XXX if this class changes so that this method can be called from
  // ShouldProcess, and if it's possible for this to be null when called from
  // ShouldLoad, but not in the corresponding ShouldProcess call,
  // we need to re-think the assumptions underlying this code.

  NS_ENSURE_ARG_POINTER(aContentLocation);
  NS_ENSURE_ARG_POINTER(aLoadInfo);

  RefPtr<mozilla::dom::BrowsingContext> browsingContext =
      aLoadInfo->GetTargetBrowsingContext();
  if (!browsingContext) {
    return NS_OK;
  }

  // We're only worried about policy settings in content docshells.
  if (!browsingContext->IsContent()) {
    return NS_OK;
  }

  nsCOMPtr<nsIDocShell> docShell = browsingContext->GetDocShell();
  if (!docShell) {
    // If there's no docshell to get to, there's nowhere for the JavaScript to
    // run, so we're already safe and don't need to disable anything.
    return NS_OK;
  }

  // Ensure starting off unsandboxed. We sandbox later if needed.
  MOZ_ALWAYS_SUCCEEDS(browsingContext->SetSandboxFlags(SANDBOXED_NONE));

  nsresult rv;
  bool isAllowedContent = !ShouldBlockUnexposedProtocol(aContentLocation);
  nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(aContentLocation);
  if (!msgUrl && !isAllowedContent) {
    // If it's not a mailnews url or allowed content url (http[s]|file) then
    // bail; otherwise set whether JavaScript is allowed.
    return NS_OK;
  }

  if (!isAllowedContent) {
    // Disable JavaScript on message URLs.
    rv = browsingContext->SetAllowJavascript(false);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = browsingContext->SetAllowContentRetargetingOnChildren(false);
    NS_ENSURE_SUCCESS(rv, rv);
    // NOTE! Do not set single sandboxing flags only. Sandboxing -  when used -
    // starts off with all things sandboxed, and individual sandbox keywords
    // will *allow* the specific feature.
    // Disabling by setting single flags without starting off with all things
    // sandboxed would the normal assumptions about sandboxing.
    // The flags - contrary to the keywords - *prevent* a given feature.
    uint32_t sandboxFlags = SANDBOX_ALL_FLAGS;

    // Do not block links with target attribute from opening (at all).
    // xref bug 421310 - we would like to prevent using target, but *handle*
    // links like the target wasn't there.
    sandboxFlags &= ~SANDBOXED_AUXILIARY_NAVIGATION;

    // For some unexplicable reason, when SANDBOXED_ORIGIN is in affect, then
    // images will not work with test --verify. So unset it.
    sandboxFlags &= ~SANDBOXED_ORIGIN;

    // Having both SANDBOXED_TOPLEVEL_NAVIGATION and
    // SANDBOXED_TOPLEVEL_NAVIGATION_USER_ACTIVATION will generate a warning,
    // see BothAllowTopNavigationAndUserActivationPresent. So unset it.
    sandboxFlags &= ~SANDBOXED_TOPLEVEL_NAVIGATION_USER_ACTIVATION;

    rv = browsingContext->SetSandboxFlags(sandboxFlags);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    // JavaScript is allowed on non-message URLs.
    rv = browsingContext->SetAllowJavascript(true);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = browsingContext->SetAllowContentRetargetingOnChildren(true);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = docShell->SetAllowPlugins(false);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

/**
 * Gets the root docshell from a requesting context.
 */
nsresult nsMsgContentPolicy::GetRootDocShellForContext(
    nsISupports* aRequestingContext, nsIDocShell** aDocShell) {
  NS_ENSURE_ARG_POINTER(aRequestingContext);
  nsresult rv;

  nsIDocShell* shell = NS_CP_GetDocShellFromContext(aRequestingContext);
  NS_ENSURE_TRUE(shell, NS_ERROR_NULL_POINTER);
  nsCOMPtr<nsIDocShellTreeItem> docshellTreeItem(shell);

  nsCOMPtr<nsIDocShellTreeItem> rootItem;
  rv = docshellTreeItem->GetInProcessRootTreeItem(getter_AddRefs(rootItem));
  NS_ENSURE_SUCCESS(rv, rv);

  return CallQueryInterface(rootItem, aDocShell);
}

/**
 * Gets the originating URI that started off a set of requests, accounting
 * for multiple iframes.
 *
 * Navigates up the docshell tree from aRequestingContext and finds the
 * highest parent with the same type docshell as aRequestingContext, then
 * returns the URI associated with that docshell.
 */
nsresult nsMsgContentPolicy::GetOriginatingURIForContext(
    nsISupports* aRequestingContext, nsIURI** aURI) {
  NS_ENSURE_ARG_POINTER(aRequestingContext);
  nsresult rv;

  nsIDocShell* shell = NS_CP_GetDocShellFromContext(aRequestingContext);
  if (!shell) {
    *aURI = nullptr;
    return NS_OK;
  }
  nsCOMPtr<nsIDocShellTreeItem> docshellTreeItem(shell);

  nsCOMPtr<nsIDocShellTreeItem> rootItem;
  rv = docshellTreeItem->GetInProcessSameTypeRootTreeItem(
      getter_AddRefs(rootItem));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIWebNavigation> webNavigation(do_QueryInterface(rootItem, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  return webNavigation->GetCurrentURI(aURI);
}

NS_IMETHODIMP
nsMsgContentPolicy::ShouldProcess(nsIURI* aContentLocation,
                                  nsILoadInfo* aLoadInfo, int16_t* aDecision) {
  // XXX Returning ACCEPT is presumably only a reasonable thing to do if we
  // think that ShouldLoad is going to catch all possible cases (i.e. that
  // everything we use to make decisions is going to be available at
  // ShouldLoad time, and not only become available in time for ShouldProcess).
  // Do we think that's actually the case?
  *aDecision = nsIContentPolicy::ACCEPT;
  return NS_OK;
}

NS_IMETHODIMP nsMsgContentPolicy::Observe(nsISupports* aSubject,
                                          const char* aTopic,
                                          const char16_t* aData) {
  if (!strcmp(NS_PREFBRANCH_PREFCHANGE_TOPIC_ID, aTopic)) {
    NS_LossyConvertUTF16toASCII pref(aData);

    nsresult rv;

    nsCOMPtr<nsIPrefBranch> prefBranchInt = do_QueryInterface(aSubject, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    if (pref.Equals(kBlockRemoteImages))
      prefBranchInt->GetBoolPref(kBlockRemoteImages, &mBlockRemoteImages);
  }

  return NS_OK;
}

/**
 * Implementation of nsIMsgContentPolicy
 *
 */
NS_IMETHODIMP
nsMsgContentPolicy::AddExposedProtocol(const nsACString& aScheme) {
  if (mCustomExposedProtocols.Contains(aScheme)) return NS_OK;

  mCustomExposedProtocols.AppendElement(aScheme);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgContentPolicy::RemoveExposedProtocol(const nsACString& aScheme) {
  mCustomExposedProtocols.RemoveElement(aScheme);

  return NS_OK;
}
