/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { OAuth2 } = ChromeUtils.import("resource:///modules/OAuth2.jsm");
var { OAuth2Providers } = ChromeUtils.import(
  "resource:///modules/OAuth2Providers.jsm"
);

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
      aServer.username,
      aServer.hostName
    );
  },
  initFromABDirectory(aDirectory, aHostname) {
    this._initPrefs(
      aDirectory.dirPrefId + ".",
      aDirectory.getStringValue("carddav.username", "") || aDirectory.UID,
      aHostname
    );
  },
  _initPrefs(root, aUsername, aHostname) {
    let issuer = Services.prefs.getStringPref(root + "oauth2.issuer", null);
    let scope = Services.prefs.getStringPref(root + "oauth2.scope", null);

    const details = OAuth2Providers.getHostnameDetails(aHostname);
    if (
      details &&
      (details[0] != issuer ||
        !scope?.split(" ").every(s => details[1].split(" ").includes(s)))
    ) {
      // Found in the list of hardcoded providers. Use the hardcoded values.
      // But only if what we had wasn't a narrower scope of current
      // defaults. Updating scope would cause re-authorization.
      [issuer, scope] = details;
      //  Store them for the future, can be useful once we support
      // dynamic registration.
      Services.prefs.setStringPref(root + "oauth2.issuer", issuer);
      Services.prefs.setStringPref(root + "oauth2.scope", scope);
    }
    if (!issuer || !scope) {
      // We need these properties for OAuth2 support.
      return false;
    }

    // Find the app key we need for the OAuth2 string. Eventually, this should
    // be using dynamic client registration, but there are no current
    // implementations that we can test this with.
    const issuerDetails = OAuth2Providers.getIssuerDetails(issuer);
    if (!issuerDetails.clientId) {
      return false;
    }

    // Username is needed to generate the XOAUTH2 string.
    this._username = aUsername;
    // loginOrigin is needed to save the refresh token in the password manager.
    this._loginOrigin = "oauth://" + issuer;
    // We use the scope to indicate realm when storing in the password manager.
    this._scope = scope;

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
        oauth.username == aUsername &&
        oauth.scope == scope
      ) {
        this._oauth = oauth;
        break;
      }
    }
    if (!this._oauth) {
      // Define the OAuth property and store it.
      this._oauth = new OAuth2(scope, issuerDetails);
      this._oauth.username = aUsername;
      oAuth2Objects.add(new WeakRef(this._oauth));

      // Try hinting the username...
      this._oauth.extraAuthParams = [["login_hint", aUsername]];

      // Set the window title to something more useful than "Unnamed"
      this._oauth.requestWindowTitle = Services.strings
        .createBundle("chrome://messenger/locale/messenger.properties")
        .formatStringFromName("oauth2WindowTitle", [aUsername, aHostname]);

      // This stores the refresh token in the login manager.
      this._oauth.refreshToken = this.getRefreshToken();
    }

    return true;
  },

  getRefreshToken() {
    for (const login of Services.logins.findLogins(
      this._loginOrigin,
      null,
      ""
    )) {
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
  async setRefreshToken(token) {
    // Check if we already have a login with this username, and modify the
    // password on that, if we do.
    const logins = Services.logins.findLogins(
      this._loginOrigin,
      null,
      this._scope
    );
    for (const login of logins) {
      if (login.username == this._username) {
        if (token) {
          if (token != login.password) {
            const propBag = Cc[
              "@mozilla.org/hash-property-bag;1"
            ].createInstance(Ci.nsIWritablePropertyBag);
            propBag.setProperty("password", token);
            Services.logins.modifyLogin(login, propBag);
          }
        } else {
          Services.logins.removeLogin(login);
        }
        return;
      }
    }

    // Unless the token is null, we need to create and fill in a new login
    if (token) {
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
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
      await Services.logins.addLoginAsync(login);
    }
  },

  connect(aWithUI, aListener) {
    const oldRefreshToken = this._oauth.refreshToken;
    const promptlistener = {
      onPromptStartAsync(callback) {
        this.onPromptAuthAvailable(callback);
      },

      onPromptAuthAvailable: callback => {
        this._oauth.connect(aWithUI, false).then(
          async () => {
            if (this._oauth.refreshToken != oldRefreshToken) {
              // Refresh token changed, save it.
              await this.setRefreshToken(this._oauth.refreshToken);
            }
            aListener.onSuccess(
              btoa(
                `user=${this._username}\x01auth=Bearer ${this._oauth.accessToken}\x01\x01`
              )
            );
            callback?.onAuthResult(true);
          },
          () => {
            aListener.onFailure(Cr.NS_ERROR_ABORT);
            callback?.onAuthResult(false);
          }
        );
      },
      onPromptCanceled() {
        aListener.onFailure(Cr.NS_ERROR_ABORT);
      },
      onPromptStart() {},
    };

    const asyncprompter = Cc[
      "@mozilla.org/messenger/msgAsyncPrompter;1"
    ].getService(Ci.nsIMsgAsyncPrompter);
    const promptkey = this._loginOrigin + "/" + this._username;
    asyncprompter.queueAsyncAuthPrompt(promptkey, false, promptlistener);
  },
};

/**
 * Forget any `OAuth2` objects we've stored, which is necessary in some
 * testing scenarios.
 */
OAuth2Module._forgetObjects = function () {
  oAuth2Objects.clear();
};
