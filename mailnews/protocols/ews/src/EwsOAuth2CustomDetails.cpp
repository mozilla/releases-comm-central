/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsOAuth2CustomDetails.h"

#include "mozilla/Preferences.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"

NS_IMPL_ISUPPORTS(EwsOAuth2CustomDetails, IOAuth2CustomDetails);

nsresult EwsOAuth2CustomDetails::ForHostname(const nsACString& hostname,
                                             EwsOAuth2CustomDetails** details) {
  NS_ENSURE_ARG_POINTER(details);

  nsCOMPtr<nsIPrefService> prefs = mozilla::Preferences::GetService();

  nsAutoCString branchName;
  branchName.AssignLiteral("mail.ews.server.details.");
  branchName.Append(hostname);
  branchName.Append(".");

  nsCOMPtr<nsIPrefBranch> prefBranch;
  nsresult rv = prefs->GetBranch(branchName.get(), getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<EwsOAuth2CustomDetails> result =
      new EwsOAuth2CustomDetails(std::move(prefBranch));

  result.forget(details);

  return NS_OK;
}

EwsOAuth2CustomDetails::EwsOAuth2CustomDetails(
    nsCOMPtr<nsIPrefBranch>&& prefBranch)
    : mPrefBranch(std::move(prefBranch)) {}

NS_IMETHODIMP EwsOAuth2CustomDetails::GetUseCustomDetails(bool* value) {
  NS_ENSURE_ARG(value);
  *value = GetConfiguredUseCustomDetails();
  return NS_OK;
}

NS_IMETHODIMP EwsOAuth2CustomDetails::GetIssuer(nsACString& value) {
  // The issuer and the endpoint host are the same things.
  const auto issuer = GetConfiguredEndpointHost();
  if (issuer) {
    value.Assign(*issuer);
  } else {
    value.Assign("");
  }
  return NS_OK;
}

NS_IMETHODIMP EwsOAuth2CustomDetails::GetScopes(nsACString& value) {
  const auto scopes = GetConfiguredOAuthScopes();
  if (scopes) {
    value.Assign(*scopes);
  } else {
    value.Assign("");
  }
  return NS_OK;
}

NS_IMETHODIMP EwsOAuth2CustomDetails::GetClientId(nsACString& value) {
  const auto applicationId = GetConfiguredApplicationId();
  if (applicationId) {
    value.Assign(*applicationId);
  } else {
    value.Assign("");
  }
  return NS_OK;
}

namespace {
nsAutoCString ConstructBaseEndpointUri(
    const std::optional<nsAutoCString>& endpointHost,
    const std::optional<nsAutoCString>& tenant) {
  nsAutoCString result;
  result.Assign("https://");

  if (endpointHost) {
    result.Append(*endpointHost);
  } else {
    result.Append("login.microsoftonline.com");
  }

  result.Append("/");

  if (tenant) {
    result.Append(*tenant);
  } else {
    result.Append("common");
  }

  return result;
}
}  // namespace

NS_IMETHODIMP EwsOAuth2CustomDetails::GetAuthorizationEndpoint(
    nsACString& value) {
  value = ConstructBaseEndpointUri(GetConfiguredEndpointHost(),
                                   GetConfiguredTenant());

  value.Append("/oauth2/v2.0/authorize");
  return NS_OK;
}

NS_IMETHODIMP EwsOAuth2CustomDetails::GetTokenEndpoint(nsACString& value) {
  value = ConstructBaseEndpointUri(GetConfiguredEndpointHost(),
                                   GetConfiguredTenant());

  value.Append("/oauth2/v2.0/token");
  return NS_OK;
}

NS_IMETHODIMP EwsOAuth2CustomDetails::GetRedirectionEndpoint(
    nsACString& value) {
  const auto redirectionEndpoint = GetConfiguredRedirectUri();
  if (redirectionEndpoint) {
    value.Assign(*redirectionEndpoint);
  } else {
    value.Assign("");
  }
  return NS_OK;
}

namespace {

constexpr auto kUseCustomDetails = "useCustomDetails";
constexpr auto kApplicationId = "applicationId";
constexpr auto kTenant = "tenant";
constexpr auto kRedirectUri = "redirectUri";
constexpr auto kEndpointHost = "endpointHost";
constexpr auto kOAuthScopes = "oauthScopes";

}  // namespace

nsresult EwsOAuth2CustomDetails::SetConfiguredUseCustomDetails(
    bool useCustomDetails) {
  return mPrefBranch->SetBoolPref(kUseCustomDetails, useCustomDetails);
}

nsresult EwsOAuth2CustomDetails::SetConfiguredApplicationId(
    const nsACString& applicationId) {
  return mPrefBranch->SetStringPref(kApplicationId, applicationId);
}

nsresult EwsOAuth2CustomDetails::SetConfiguredTenant(const nsACString& tenant) {
  return mPrefBranch->SetStringPref(kTenant, tenant);
}

nsresult EwsOAuth2CustomDetails::SetConfiguredRedirectUri(
    const nsACString& redirectUri) {
  return mPrefBranch->SetStringPref(kRedirectUri, redirectUri);
}

nsresult EwsOAuth2CustomDetails::SetConfiguredEndpointHost(
    const nsACString& endpointHost) {
  return mPrefBranch->SetStringPref(kEndpointHost, endpointHost);
}

nsresult EwsOAuth2CustomDetails::SetConfiguredOAuthScopes(
    const nsACString& oauthScopes) {
  return mPrefBranch->SetStringPref(kOAuthScopes, oauthScopes);
}

bool EwsOAuth2CustomDetails::GetConfiguredUseCustomDetails() const {
  bool result;
  nsresult rv = mPrefBranch->GetBoolPref(kUseCustomDetails, &result);

  if (NS_FAILED(rv)) {
    return false;
  }

  return result;
}

std::optional<nsAutoCString>
EwsOAuth2CustomDetails::GetConfiguredApplicationId() const {
  return GetStringPrefValueOrNone(kApplicationId);
}

std::optional<nsAutoCString> EwsOAuth2CustomDetails::GetConfiguredTenant()
    const {
  return GetStringPrefValueOrNone(kTenant);
}

std::optional<nsAutoCString> EwsOAuth2CustomDetails::GetConfiguredRedirectUri()
    const {
  return GetStringPrefValueOrNone(kRedirectUri);
}

std::optional<nsAutoCString> EwsOAuth2CustomDetails::GetConfiguredEndpointHost()
    const {
  return GetStringPrefValueOrNone(kEndpointHost);
}

std::optional<nsAutoCString> EwsOAuth2CustomDetails::GetConfiguredOAuthScopes()
    const {
  return GetStringPrefValueOrNone(kOAuthScopes);
}

std::optional<nsAutoCString> EwsOAuth2CustomDetails::GetStringPrefValueOrNone(
    const char* prefName) const {
  nsAutoCString result;
  nsresult rv = mPrefBranch->GetStringPref(prefName, ""_ns, 0, result);

  if (NS_FAILED(rv)) {
    return std::nullopt;
  }

  if (result.IsEmpty()) {
    return std::nullopt;
  }

  return std::make_optional(std::move(result));
}
