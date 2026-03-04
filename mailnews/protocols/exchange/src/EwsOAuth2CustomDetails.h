/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSOAUTH2CUSTOMDETAILS_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSOAUTH2CUSTOMDETAILS_H_

#include "msgIOAuth2Module.h"
#include "nsCOMPtr.h"

#include <optional>

class nsIPrefBranch;

/**
 * Configured OAuth2 connection parameters for EWS/Microsoft Office365.
 *
 * Microsoft exchange exposes a single Tenant connection parameter
 * that is then used in conjunction with the endpoint host (issuer)
 * and a standard URL scheme to construct the authorization and token
 * endpoints. This class enables configuration of the user-facing
 * values and maps those values to the `IOAuth2CustomDetails` interface
 * to provide the standard OAuth2 connection parameter set.
 *
 * All other configured values are passed through the interface verbatim to
 * their corresponding connection parameters.
 */
class EwsOAuth2CustomDetails : public IOAuth2CustomDetails {
 public:
  NS_DECL_IOAUTH2CUSTOMDETAILS;
  NS_DECL_ISUPPORTS;

  /** Return an instance of this class for the given `hostname`. */
  static nsresult ForHostname(const nsACString& hostname,
                              EwsOAuth2CustomDetails** details);

  /** Set whether or not the custom details should be used for this provider. */
  nsresult SetConfiguredUseCustomDetails(bool useCustomDetails);

  ///@{
  /** Set the parameter named within the method name. */
  nsresult SetConfiguredApplicationId(const nsACString& applicationId);
  nsresult SetConfiguredTenant(const nsACString& tenant);
  nsresult SetConfiguredRedirectUri(const nsACString& redirectUri);
  nsresult SetConfiguredEndpointHost(const nsACString& endpointHost);
  nsresult SetConfiguredOAuthScopes(const nsACString& oauthScopes);
  ///@}

  /**  Return whether or not to use the custom details for this provider. */
  bool GetConfiguredUseCustomDetails() const;

  ///@{
  /**
   * Return the configured value for the named parameter, or `std::nullopt` if
   * the value is not configured.
   */
  std::optional<nsAutoCString> GetConfiguredApplicationId() const;
  std::optional<nsAutoCString> GetConfiguredTenant() const;
  std::optional<nsAutoCString> GetConfiguredRedirectUri() const;
  std::optional<nsAutoCString> GetConfiguredEndpointHost() const;
  std::optional<nsAutoCString> GetConfiguredOAuthScopes() const;
  ///@}

 protected:
  virtual ~EwsOAuth2CustomDetails() = default;

 private:
  explicit EwsOAuth2CustomDetails(nsCOMPtr<nsIPrefBranch>&& prefBranch);

  /**
   * Return the string value of the preferenceStored in the given `prefName` or
   * `std::nullopt` if the value is not configured.
   */
  std::optional<nsAutoCString> GetStringPrefValueOrNone(
      const char* prefName) const;

  nsCOMPtr<nsIPrefBranch> mPrefBranch;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSOAUTH2CUSTOMDETAILS_H_
