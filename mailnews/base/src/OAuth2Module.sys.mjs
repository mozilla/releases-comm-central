/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OAuth2 } from "resource:///modules/OAuth2.sys.mjs";

import { OAuth2Providers } from "resource:///modules/OAuth2Providers.sys.mjs";

const log = console.createInstance({
  prefix: "mailnews.oauth",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mailnews.oauth.loglevel",
});

/**
 * A collection of `OAuth2` objects that have previously been created.
 * Only weak references are stored here, so if all the owners of an `OAuth2`
 * is cleaned up, so is the object itself.
 */
const oAuth2Objects = new Set();

/**
 * OAuth2Module is the glue layer that gives XPCOM access to an OAuth2
 * bearer token it can use to authenticate in SASL steps.
 * It also takes care of persising the refreshToken for later usage.
 *
 * @implements {msgIOAuth2Module}
 */
export function OAuth2Module() {}

OAuth2Module.prototype = {
  QueryInterface: ChromeUtils.generateQI(["msgIOAuth2Module"]),

  initFromOutgoing(server) {
    return this.initFromHostname(
      server.serverURI.host,
      server.username,
      server.type
    );
  },

  initFromMail(server) {
    return this.initFromMailWithOptionalOverrides(
      server,
      false,
      null,
      null,
      null
    );
  },

  initFromMailWithOptionalOverrides(
    server,
    allowOverrides,
    overrideIssuer,
    overrideScopes,
    overrideDetails
  ) {
    return this.initFromHostnameWithOptionalOverrides(
      server.hostName,
      server.username,
      server.type,
      allowOverrides,
      overrideIssuer,
      overrideScopes,
      overrideDetails
    );
  },

  initFromHostname(hostname, username, type) {
    return this.initFromHostnameWithOptionalOverrides(
      hostname,
      username,
      type,
      false,
      null,
      null,
      null
    );
  },

  initFromHostnameWithOptionalOverrides(
    hostname,
    username,
    type,
    allowOverrides,
    overrideIssuer,
    overrideScopes,
    overrideDetails
  ) {
    if (typeof allowOverrides == "undefined" || allowOverrides == null) {
      allowOverrides = false;
    }
    const overridePrefEnabled = Services.prefs.getBoolPref(
      "experimental.mail.ews.overrideOAuth.enabled",
      false
    );

    const doOverrides = overridePrefEnabled && allowOverrides;

    const details = doOverrides
      ? this._getHostnameDetailsWithOverrides(
          hostname,
          type,
          overrideIssuer,
          overrideScopes
        )
      : OAuth2Providers.getHostnameDetails(hostname, type);

    if (!details) {
      return false;
    }

    const { issuer, allScopes, requiredScopes } = details;
    // Find the app key we need for the OAuth2 string. Eventually, this should
    // be using dynamic client registration, but there are no current
    // implementations that we can test this with.
    const issuerDetails = doOverrides
      ? this._getIssuerWithOverrides(issuer, overrideDetails)
      : OAuth2Providers.getIssuerDetails(issuer);

    if (!issuerDetails.clientId) {
      return false;
    }

    // Username is needed to generate the XOAUTH2 string.
    this._username = username;
    // loginOrigin is needed to save the refresh token in the password manager.
    this._loginOrigin = "oauth://" + issuer;
    // We use the scope to indicate realm when storing in the password manager.
    this._scope = allScopes;
    this._requiredScopes = scopeSet(requiredScopes);

    // Look for an existing `OAuth2` object with the same endpoint, username
    // and scope.
    for (const weakRef of oAuth2Objects) {
      const oauth = weakRef.deref();
      if (!oauth) {
        oAuth2Objects.delete(weakRef);
        continue;
      }
      if (
        oauth.authorizationEndpoint == issuerDetails.authorizationEndpoint &&
        oauth.username == username &&
        scopeSet(oauth.scope).isSupersetOf(this._requiredScopes)
      ) {
        log.debug(`Found existing OAuth2 object for ${issuer}`);
        this._oauth = oauth;
        break;
      }
    }
    if (!this._oauth) {
      log.debug(`Creating a new OAuth2 object for ${issuer}`);
      // This gets the refresh token from the login manager. It may change
      // `this._scope` if a refresh token was found for the required scopes
      // but not all of the wanted scopes.
      const refreshToken = this.getRefreshToken();

      // Define the OAuth property and store it.
      this._oauth = new OAuth2(this._scope, issuerDetails);
      this._oauth.username = username;
      oAuth2Objects.add(new WeakRef(this._oauth));

      // Try hinting the username...
      this._oauth.extraAuthParams = [["login_hint", username]];

      // Set the window title to something more useful than "Unnamed"
      this._oauth.requestWindowTitle = Services.strings
        .createBundle("chrome://messenger/locale/messenger.properties")
        .formatStringFromName("oauth2WindowTitle", [username, hostname]);

      this._oauth.refreshToken = refreshToken;
    }

    return true;
  },

  getRefreshToken() {
    for (const login of Services.logins.findLogins(
      this._loginOrigin,
      null,
      ""
    )) {
      if (login.username != this._username) {
        continue;
      }

      if (scopeSet(login.httpRealm).isSupersetOf(this._requiredScopes)) {
        this._scope = login.httpRealm;
        return login.password;
      }
    }
    return "";
  },
  async setRefreshToken(token) {
    const scope = this._oauth.scope ?? this._scope;
    const grantedScopes = scopeSet(scope);

    // Update any existing logins matching this origin, username, and scope.
    const logins = Services.logins.findLogins(this._loginOrigin, null, "");
    let didChangePassword = false;
    for (const login of logins) {
      if (login.username != this._username) {
        continue;
      }

      const loginScopes = scopeSet(login.httpRealm);
      if (grantedScopes.isSupersetOf(loginScopes)) {
        if (grantedScopes.size == loginScopes.size) {
          // The scope matches, just update the token...
          if (login.password != token) {
            // ... but only if it actually changed.
            log.debug(
              `Updating existing token for ${this._loginOrigin} with scope "${scope}"`
            );
            const propBag = Cc[
              "@mozilla.org/hash-property-bag;1"
            ].createInstance(Ci.nsIWritablePropertyBag);
            propBag.setProperty("password", token);
            propBag.setProperty("timePasswordChanged", Date.now());
            Services.logins.modifyLogin(login, propBag);
          }
          didChangePassword = true;
        } else {
          // We've got a new token for this scope, remove the existing one.
          log.debug(
            `Removing superseded token for ${this._loginOrigin} with scope "${login.httpRealm}"`
          );
          Services.logins.removeLogin(login);
        }
      }
    }

    // Unless the token is null, we need to create and fill in a new login.
    if (!didChangePassword && token) {
      log.debug(
        `Creating new login for ${this._loginOrigin} with httpRealm "${scope}"`
      );
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
        Ci.nsILoginInfo
      );
      login.init(this._loginOrigin, null, scope, this._username, token, "", "");
      await Services.logins.addLoginAsync(login);
    }
  },

  connect(withUI, listener) {
    this._fetchAccessToken(listener, withUI, true);
  },

  getAccessToken(listener) {
    this._fetchAccessToken(listener, true, false);
  },

  /**
   * Return the hostname details with the given issuer and scopes override values applied.
   *
   * If there is no known provider for the given hostname, `issuer` and `scopes`
   * must be non-null and non-empty. Otherwise, `issuer` and `scopes` will be
   * used to override the values of the known provider obtained from the lookup.
   *
   * If there is no known provider and either `issuer` or `scopes` is empty,
   * this function will return `null`.
   *
   * @param {string} hostname
   * @param {string} type
   * @param {string} issuer
   * @param {string} scopes
   * @returns {OAuth2Providers.hostnameDetails}
   */
  _getHostnameDetailsWithOverrides(hostname, type, issuer, scopes) {
    let details = OAuth2Providers.getHostnameDetails(hostname, type);

    if (!details) {
      // If it's not a known issuer, then we have to have a custom issuer and scopes.
      // We are allowing overrides because the previous check didn't return.
      if (!issuer || !scopes) {
        return null;
      }
      details = {
        issuer,
        allScopes: scopes,
        requiredScopes: scopes,
      };
    } else {
      // If it's a known issuer, and we're allowing overrides, then
      // override the known values with the custom values.
      details.issuer = issuer || details.issuer;
      details.allScopes = scopes || details.allScopes;
      details.requiredScopes = scopes || details.requiredScopes;
    }

    return details;
  },

  /**
   * Return the issuer details from the `OAuth2Provider` with the given
   * overrides applied on top of them.
   *
   * If there are no known details for the given issuer, then this function will
   * return an undefined value.
   *
   * @param {string} issuer
   * @param {Array<string>} overrideDetails
   * @returns {Array<string>}
   */
  _getIssuerWithOverrides(issuer, overrideDetails) {
    let issuerDetails = OAuth2Providers.getIssuerDetails(issuer);
    if (typeof overrideDetails != "undefined" && overrideDetails) {
      // Don't overwrite the object we got from the static configuration so we
      // can roll back to it if overrides are disabled later.
      issuerDetails = structuredClone(issuerDetails) ?? {};
      for (let i = 0; i < overrideDetails.length - 1; i += 2) {
        const name = overrideDetails[i];
        const value = overrideDetails[i + 1].trim();
        if (value) {
          issuerDetails[name] = value;
        }
      }
    }
    return issuerDetails;
  },

  /**
   * Gets a current access token for the provider.
   *
   * @param {msgIOAuth2ModuleListener} listener - The listener for the results
   *   of authentication.
   * @param {bool} shouldPrompt - If true and user input is needed to complete
   *   authentication (such as logging in to the provider), prompt the user.
   *   Otherwise, return an error.
   * @param {bool} shouldMakeSaslToken - If true, return an access token
   *   formatted for use with SASL XOAUTH2. Otherwise, return the access token
   *   unmodified.
   */
  _fetchAccessToken(listener, shouldPrompt, shouldMakeSaslToken) {
    // NOTE: `onPromptStartAsync` and `onPromptAuthAvailable` have _different_
    // values for `this` due to differences in how arrow functions bind `this`
    // (i.e., to the surrounding lexical scope rather than the object of which)
    // they are a member).
    const promptListener = {
      onPromptStartAsync(callback) {
        this.onPromptAuthAvailable(callback);
      },

      onPromptAuthAvailable: callback => {
        const oldRefreshToken = this._oauth.refreshToken;

        this._oauth.connect(shouldPrompt, false).then(
          async () => {
            if (
              this._oauth.refreshToken != oldRefreshToken ||
              this._oauth.scope != this._scope
            ) {
              // Refresh token and/or scope changed; save them.
              await this.setRefreshToken(this._oauth.refreshToken);
              this._scope = this._oauth.scope;
            }

            let retval = this._oauth.accessToken;
            if (shouldMakeSaslToken) {
              // Pre-format the return value for an SASL XOAUTH2 client response
              // if that's what the consumer is expecting.
              retval = btoa(
                `user=${this._username}\x01auth=Bearer ${retval}\x01\x01`
              );
            }

            listener.onSuccess(retval);
            callback?.onAuthResult(true);
          },
          () => {
            listener.onFailure(Cr.NS_ERROR_ABORT);
            callback?.onAuthResult(false);
          }
        );
      },
      onPromptCanceled() {
        listener.onFailure(Cr.NS_ERROR_ABORT);
      },
      onPromptStart() {},
    };

    const asyncPrompter = Cc[
      "@mozilla.org/messenger/msgAsyncPrompter;1"
    ].getService(Ci.nsIMsgAsyncPrompter);

    const promptKey = `${this._loginOrigin}/${this._username}`;
    asyncPrompter.queueAsyncAuthPrompt(promptKey, false, promptListener);
  },
};

/**
 * Forget any `OAuth2` objects we've stored, which is necessary in some
 * testing scenarios.
 */
OAuth2Module._forgetObjects = function () {
  log.debug("Clearing OAuth2 objects from cache");
  oAuth2Objects.clear();
};

/**
 * Turns a space-delimited string of scopes into a Set containing the scopes.
 *
 * @param {string} scopeString
 * @returns {Set}
 */
function scopeSet(scopeString) {
  if (!scopeString) {
    return new Set();
  }
  return new Set(scopeString.split(" "));
}
