/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["OAuth2Module"];

var { OAuth2 } = ChromeUtils.import("resource:///modules/OAuth2.jsm");
var { OAuth2Providers } = ChromeUtils.import(
  "resource:///modules/OAuth2Providers.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * OAuth2Module is the glue layer that gives XPCOM access to an OAuth2
 * bearer token it can use to authenticate in SASL steps.
 * It also takes care of persising the refreshToken for later usage.
 *
 * @implements {msgIOAuth2Module}
 */
function OAuth2Module() {}
OAuth2Module.prototype = {
  // XPCOM registration stuff
  QueryInterface: ChromeUtils.generateQI(["msgIOAuth2Module"]),

  initFromSmtp(aServer) {
    return this._initPrefs(
      "mail.smtpserver." + aServer.key + ".",
      aServer.username,
      aServer.hostname
    );
  },
  initFromMail(aServer) {
    return this._initPrefs(
      "mail.server." + aServer.key + ".",
      aServer.realUsername,
      aServer.realHostName
    );
  },
  initFromABDirectory(aDirectory, aHostname) {
    this._initPrefs(
      aDirectory.dirPrefId + ".",
      aDirectory.getStringValue("carddav.username", "") || aDirectory.UID,
      aHostname
    );
    if (aHostname == "mochi.test") {
      // I don't know why, but tests refuse to work with a plain HTTP endpoint
      // (the request is redirected to HTTPS, which we're not listening to).
      // Just use an HTTPS endpoint.
      this._oauth.redirectionEndpoint = "https://localhost";
    }
  },
  _initPrefs(root, aUsername, aHostname) {
    // Load all of the parameters from preferences.
    let issuer = Services.prefs.getStringPref(root + "oauth2.issuer", "");
    let scope = Services.prefs.getStringPref(root + "oauth2.scope", "");

    // These properties are absolutely essential to OAuth2 support. If we don't
    // have them, we don't support OAuth2.
    if (!issuer || !scope) {
      // Since we currently only support gmail, init values if server matches.
      let details = OAuth2Providers.getHostnameDetails(aHostname);
      if (details) {
        [issuer, scope] = details;
        Services.prefs.setStringPref(root + "oauth2.issuer", issuer);
        Services.prefs.setStringPref(root + "oauth2.scope", scope);
      } else {
        return false;
      }
    }

    // Find the app key we need for the OAuth2 string. Eventually, this should
    // be using dynamic client registration, but there are no current
    // implementations that we can test this with.
    let [
      clientId,
      clientSecret,
      authorizationEndpoint,
      tokenEndpoint,
    ] = OAuth2Providers.getIssuerDetails(issuer);
    if (!clientId) {
      return false;
    }

    // Username is needed to generate the XOAUTH2 string.
    this._username = aUsername;
    // loginOrigin is needed to save the refresh token in the password manager.
    this._loginOrigin = "oauth://" + issuer;
    // We use the scope to indicate realm when storing in the password manager.
    this._scope = scope;

    // Define the OAuth property and store it.
    this._oauth = new OAuth2(
      authorizationEndpoint,
      tokenEndpoint,
      scope,
      clientId,
      clientSecret
    );

    // Try hinting the username...
    this._oauth.extraAuthParams = [["login_hint", aUsername]];

    // Set the window title to something more useful than "Unnamed"
    this._oauth.requestWindowTitle = Services.strings
      .createBundle("chrome://messenger/locale/messenger.properties")
      .formatStringFromName("oauth2WindowTitle", [aUsername, aHostname]);

    // This stores the refresh token in the login manager.
    Object.defineProperty(this._oauth, "refreshToken", {
      get: () => this.refreshToken,
      set: token => {
        this.refreshToken = token;
      },
    });

    return true;
  },

  get refreshToken() {
    for (let login of Services.logins.findLogins(this._loginOrigin, null, "")) {
      if (
        login.username == this._username &&
        (login.httpRealm == this._scope ||
          login.httpRealm.split(" ").includes(this._scope))
      ) {
        return login.password;
      }
    }
    return "";
  },
  set refreshToken(token) {
    // Check if we already have a login with this username, and modify the
    // password on that, if we do.
    let logins = Services.logins.findLogins(
      this._loginOrigin,
      null,
      this._scope
    );
    for (let login of logins) {
      if (login.username == this._username) {
        if (token) {
          let propBag = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
            Ci.nsIWritablePropertyBag
          );
          propBag.setProperty("password", token);
          Services.logins.modifyLogin(login, propBag);
        } else {
          Services.logins.removeLogin(login);
        }
        return;
      }
    }

    // Unless the token is null, we need to create and fill in a new login
    if (token) {
      let login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
        Ci.nsILoginInfo
      );
      login.init(
        this._loginOrigin,
        null,
        this._scope,
        this._username,
        token,
        "",
        ""
      );
      Services.logins.addLogin(login);
    }
  },

  connect(aWithUI, aListener) {
    let oauth = this._oauth;
    let promptlistener = {
      onPromptStartAsync(callback) {
        this.onPromptAuthAvailable(callback);
      },

      onPromptAuthAvailable: callback => {
        oauth.connect(
          () => {
            aListener.onSuccess(
              btoa(
                `user=${this._username}\x01auth=Bearer ${oauth.accessToken}\x01\x01`
              )
            );
            if (callback) {
              callback.onAuthResult(true);
            }
          },
          () => {
            aListener.onFailure(Cr.NS_ERROR_ABORT);
            if (callback) {
              callback.onAuthResult(false);
            }
          },
          aWithUI,
          false
        );
      },
      onPromptCanceled() {
        aListener.onFailure(Cr.NS_ERROR_ABORT);
      },
      onPromptStart() {},
    };

    let asyncprompter = Cc[
      "@mozilla.org/messenger/msgAsyncPrompter;1"
    ].getService(Ci.nsIMsgAsyncPrompter);
    let promptkey = this._loginOrigin + "/" + this._username;
    asyncprompter.queueAsyncAuthPrompt(promptkey, false, promptlistener);
  },
};
