/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mailnews_ffi_glue.h"

#include "mozilla/LoadInfo.h"
#include "mozilla/net/CookieJarSettings.h"
#include "nsCOMPtr.h"
#include "nsContentUtils.h"

using namespace mozilla::net;

extern "C" nsresult new_auth_module(const char* authMethod,
                                    nsIAuthModule** outModule) {
  nsCOMPtr<nsIAuthModule> module = nsIAuthModule::CreateInstance(authMethod);
  if (!module) {
    // As per the call contract set out in the function's documentation, we must
    // not return a success if `CreateInstance` returned a null pointer (which
    // it does if `authMethod` is unknown, or if we request NTLM but it's not
    // available).
    return NS_ERROR_INVALID_ARG;
  }

  module.forget(outModule);
  return NS_OK;
}

extern "C" nsresult new_loadinfo_with_cookie_settings(
    nsIPrincipal* aLoadingPrincipal, nsIPrincipal* aTriggeringPrincipal,
    nsINode* aLoadingNode, nsSecurityFlags aSecurityFlags,
    nsContentPolicyType aContentPolicyType, uint32_t aSandboxFlags,
    nsILoadInfo** outLoadInfo) {
  // The documentation for the flavor of `LoadInfo::Create` we use below
  // specifies that `aLoadingPrincipal` must not be null.
  NS_ENSURE_ARG_POINTER(aLoadingPrincipal);

  nsCOMPtr<nsILoadInfo> loadInfo = MOZ_TRY(LoadInfo::Create(
      aLoadingPrincipal, aTriggeringPrincipal, aLoadingNode, aSecurityFlags,
      aContentPolicyType, mozilla::Maybe<mozilla::dom::ClientInfo>(),
      mozilla::Maybe<mozilla::dom::ServiceWorkerDescriptor>(), aSandboxFlags));

  bool shouldResistFingerprinting =
      nsContentUtils::ShouldResistFingerprinting_dangerous(
          aLoadingPrincipal,
          "We don't have a CookieJarSettings yet since we're creating it",
          mozilla::RFPTarget::IsAlwaysEnabledForPrecompute);

  // `CookieJarSettings::Create` takes one of two modes: either `eRegular` or
  // `ePrivate`, which define the behavior to follow for allowing or rejecting
  // cookies. Looking at other places where this method is called, `ePrivate`
  // seems strongly tied with private browsing, which isn't a thing in
  // Thunderbird.
  //
  // This does NOT conflict with the user's cookie settings, i.e. cookies will
  // still be blocked if cookies are disabled in the settings or there's a
  // blocking exception for the site.
  nsCOMPtr<nsICookieJarSettings> cookieJar = CookieJarSettings::Create(
      CookieJarSettings::eRegular, shouldResistFingerprinting);

  MOZ_TRY(loadInfo->SetCookieJarSettings(cookieJar));

  loadInfo.forget(outLoadInfo);

  return NS_OK;
}
