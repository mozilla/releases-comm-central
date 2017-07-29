/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

Components.utils.import("resource://gre/modules/OAuth2.jsm");
Components.utils.import("resource://gre/modules/OAuth2Providers.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function OAuth2Module() {
  this._refreshToken = '';
}
OAuth2Module.prototype = {
  // XPCOM registration stuff
  QueryInterface: XPCOMUtils.generateQI([Ci.msgIOAuth2Module]),
  classID: Components.ID("{b63d8e4c-bf60-439b-be0e-7c9f67291042}"),

  _loadOAuthClientDetails(aIssuer) {
    let details = OAuth2Providers.getIssuerDetails(aIssuer);
    if (details)
      [this._appKey, this._appSecret, this._authURI, this._tokenURI] = details;
    else
      throw Cr.NS_ERROR_INVALID_ARGUMENT;
  },
  initFromSmtp(aServer) {
    return this._initPrefs("mail.smtpserver." + aServer.key + ".",
      aServer.username, aServer.hostname);
  },
  initFromMail(aServer) {
    return this._initPrefs("mail.server." + aServer.key + ".",
      aServer.username, aServer.realHostName);
  },
  _initPrefs(root, aUsername, aHostname) {
    // Load all of the parameters from preferences.
    let issuer = Preferences.get(root + "oauth2.issuer", "");
    let scope = Preferences.get(root + "oauth2.scope", "");

    // These properties are absolutely essential to OAuth2 support. If we don't
    // have them, we don't support OAuth2.
    if (!issuer || !scope) {
      // Since we currently only support gmail, init values if server matches.
      let details = OAuth2Providers.getHostnameDetails(aHostname);
      if (details)
      {
        [issuer, scope] = details;
        Preferences.set(root + "oauth2.issuer", issuer);
        Preferences.set(root + "oauth2.scope", scope);
      }
      else
        return false;
    }

    // Find the app key we need for the OAuth2 string. Eventually, this should
    // be using dynamic client registration, but there are no current
    // implementations that we can test this with.
    this._loadOAuthClientDetails(issuer);

    // Username is needed to generate the XOAUTH2 string.
    this._username = aUsername;
    // LoginURL is needed to save the refresh token in the password manager.
    this._loginUrl = "oauth://" + issuer;
    // We use the scope to indicate the realm.
    this._scope = scope;

    // Define the OAuth property and store it.
    this._oauth = new OAuth2(this._authURI, scope, this._appKey,
      this._appSecret);
    this._oauth.authURI = this._authURI;
    this._oauth.tokenURI = this._tokenURI;

    // Try hinting the username...
    this._oauth.extraAuthParams = [
      ["login_hint", aUsername]
    ];

    // Set the window title to something more useful than "Unnamed"
    this._oauth.requestWindowTitle =
      Services.strings.createBundle("chrome://messenger/locale/messenger.properties")
                      .formatStringFromName("oauth2WindowTitle",
                                            [aUsername, aHostname], 2);

    // This stores the refresh token in the login manager.
    Object.defineProperty(this._oauth, "refreshToken", {
      get: () => this.refreshToken,
      set: (token) => this.refreshToken = token
    });

    return true;
  },

  get refreshToken() {
    let loginMgr = Cc["@mozilla.org/login-manager;1"]
                     .getService(Ci.nsILoginManager);
    let logins = loginMgr.findLogins({}, this._loginUrl, null, this._scope);
    for (let login of logins) {
      if (login.username == this._username)
        return login.password;
    }
    return '';
  },
  set refreshToken(token) {
    let loginMgr = Cc["@mozilla.org/login-manager;1"]
                     .getService(Ci.nsILoginManager);

    // Check if we already have a login with this username, and modify the
    // password on that, if we do.
    let logins = loginMgr.findLogins({}, this._loginUrl, null, this._scope);
    for (let login of logins) {
      if (login.username == this._username) {
        if (token) {
          let propBag = Cc["@mozilla.org/hash-property-bag;1"].
                        createInstance(Ci.nsIWritablePropertyBag);
          propBag.setProperty("password", token);
          loginMgr.modifyLogin(login, propBag);
        }
        else
          loginMgr.removeLogin(login);
        return token;
      }
    }

    // Otherwise, we need a new login, so create one and fill it in.
    let login = Cc["@mozilla.org/login-manager/loginInfo;1"]
                  .createInstance(Ci.nsILoginInfo);
    login.init(this._loginUrl, null, this._scope, this._username, token,
      '', '');
    loginMgr.addLogin(login);
    return token;
  },

  connect(aWithUI, aListener) {
    this._oauth.connect(() => aListener.onSuccess(this._oauth.accessToken),
                        x => aListener.onFailure(x),
                        aWithUI, false);
  },

  buildXOAuth2String() {
    return btoa("user=" + this._username + "\x01auth=Bearer " +
      this._oauth.accessToken + "\x01\x01");
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([OAuth2Module]);
