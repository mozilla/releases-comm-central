/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["GTalkProtocol"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { GenericProtocolPrototype } = ChromeUtils.import(
  "resource:///modules/jsProtoHelper.jsm"
);
var { XMPPAccountPrototype } = ChromeUtils.import(
  "resource:///modules/xmpp-base.jsm"
);
var { XMPPSession } = ChromeUtils.import(
  "resource:///modules/xmpp-session.jsm"
);
var { Stanza } = ChromeUtils.import("resource:///modules/xmpp-xml.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

XPCOMUtils.defineLazyModuleGetters(this, {
  OAuth2: "resource:///modules/OAuth2.jsm",
  OAuth2Providers: "resource:///modules/OAuth2Providers.jsm",
});

// PlainFullBindAuth is an authentication mechanism that works like
// the standard PLAIN mechanism but adds a client-uses-full-bind-result
// attribute to the auth stanza to tell the Google Talk servers that we
// support their JID Domain Discovery extension.
//
// See https://developers.google.com/talk/jep_extensions/jid_domain_change
function* PlainFullBindAuth(aAccount, aUsername, aPassword, aDomain) {
  let key = btoa("\0" + aUsername + "\0" + aPassword);
  let attrs = {
    mechanism: "PLAIN",
    "xmlns:ga": "http://www.google.com/talk/protocol/auth",
    "ga:client-uses-full-bind-result": "true",
  };
  let stanza = yield {
    send: Stanza.node("auth", Stanza.NS.sasl, attrs, key),
    log:
      "<auth.../> (PlainFullBindAuth base64 encoded username and password not logged)",
  };

  if (stanza.localName != "success") {
    throw new Error("Didn't receive the expected auth success stanza.");
  }
}

// OAuth2 is an authentication mechanism that allows the client to never receive
// the password from the user. The user logs into the website directly and the
// client receives an access token and refresh token.
//
// This is required for use with accounts which have two-factor authentication
// configured (without app passwords) and maybe other configurations.
//
// See an archived version of https://developers.google.com/talk/jep_extensions/oauth
function* OAuth2Auth(account, username, password, domain) {
  // Get the OAuth2 information.
  let [issuer, scope] = OAuth2Providers.getHostnameDetails("talk.google.com");
  let [
    clientId,
    clientSecret,
    authorizationEndpoint,
    tokenEndpoint,
  ] = OAuth2Providers.getIssuerDetails(issuer);
  let jid = `${username}@${domain}`;
  let oauth = new OAuth2(
    authorizationEndpoint,
    tokenEndpoint,
    scope,
    clientId,
    clientSecret
  );
  oauth.extraAuthParams = [["login_hint", jid]];

  // Attempt to find a previously valid OAuth2 session.
  let isNew = true;
  let loginOrigin = "oauth://" + issuer;
  for (let login of Services.logins.findLogins(loginOrigin, null, "")) {
    if (
      login.username == jid &&
      (login.httpRealm == scope || login.httpRealm.split(" ").includes(scope))
    ) {
      oauth.refreshToken = login.password;
      isNew = false;
      break;
    }
  }

  // If this is new then it is expected that the user may take a few moments
  // (longer than the timeout on the connection) to login.
  //
  // 1. Initiate the OAuth2 prompt.
  // 2. Yield an error state.
  // 3. Once the OAuth2 prompt is done, reconnect.
  if (isNew) {
    oauth.connect(
      () => {
        // Login was successful, store the information for subsequent logins.
        account.LOG("Saved refresh token for subsequent logins");
        let newLoginInfo = Cc[
          "@mozilla.org/login-manager/loginInfo;1"
        ].createInstance(Ci.nsILoginInfo);
        newLoginInfo.init(
          loginOrigin,
          null,
          scope,
          jid,
          oauth.refreshToken,
          "",
          ""
        );
        // If this errors, it will abort the login.
        Services.logins.addLogin(newLoginInfo);

        // Start a new connection.
        account._connect();
      },
      () => {
        // There's nothing to do in case of an error, the account is already
        // disconnected with an authentication failure.
      },
      true
    );

    // Authentication is pending the user's input.
    yield {
      error: true,
    };
    return;
  }

  // Create a new promise which fires with the result of the OAuth2 negotiation.
  let stanza = yield new Promise((resolve, reject) => {
    oauth.connect(resolve, reject, true);
  })
    .then(() => {
      // Generate the stanza for login.
      let key = btoa("\0" + username + "\0" + oauth.accessToken);
      let attrs = {
        mechanism: "X-OAUTH2",
        "auth:service": "oauth2",
        "xmlns:auth": "http://www.google.com/talk/protocol/auth",
      };
      return {
        send: Stanza.node("auth", Stanza.NS.sasl, attrs, key),
        log: "<auth.../> (base64 encoded username and OAuth token not logged)",
      };
    })
    .catch(err => {
      throw new Error("OAuth2 error: " + err);
    });

  if (stanza.localName != "success") {
    throw new Error("Didn't receive the expected auth success stanza.");
  }
}

function GTalkAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);
}
GTalkAccount.prototype = {
  __proto__: XMPPAccountPrototype,
  connect() {
    this._jid = this._parseJID(this.name);
    // The XMPP spec says that the node part of a JID is optional, but
    // in the case of Google Talk if the username typed by the user
    // doesn't contain an @, we prefer assuming that it's the domain
    // part that's been omitted.
    if (!this._jid.node) {
      // If the domain part was omitted, swap the node and domain parts,
      // use 'gmail.com' as the default domain, and tell the Google
      // Talk server that we will use the full bind result.
      this._jid.node = this._jid.domain;
      this._jid.domain = "gmail.com";
      this.authMechanisms = { PLAIN: PlainFullBindAuth };
    }

    // If the account has no password configured, use OAuth2 to authenticate.
    let password = this.imAccount.password;
    if (!password) {
      this.authMechanisms = { "X-OAUTH2": OAuth2Auth };
    }

    // For the resource, if the user has edited the option, always use that.
    if (this.prefs.prefHasUserValue("resource")) {
      let resource = this.getString("resource");
      this._jid = this._setJID(this._jid.domain, this._jid.node, resource);
    }

    this._connect(password);
  },

  /**
   * Create the XMPPSession, initiating the connection.
   *
   * @param {string|null} password - The password, or null for OAuth2 accounts.
   */
  _connect(password) {
    this._connection = new XMPPSession(
      "talk.google.com",
      443,
      "require_tls",
      this._jid,
      password,
      this
    );
  },
};

function GTalkProtocol() {
  this.commands = ChromeUtils.import(
    "resource:///modules/xmpp-commands.jsm"
  ).commands;
  this.registerCommands();
}
GTalkProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "gtalk";
  },
  get name() {
    return _("gtalk.protocolName");
  },
  get iconBaseURI() {
    return "chrome://prpl-gtalk/skin/";
  },
  get usernameEmptyText() {
    return _("gtalk.usernameHint");
  },
  getAccount(aImAccount) {
    return new GTalkAccount(this, aImAccount);
  },
  options: {
    resource: {
      get label() {
        return _("options.resource");
      },
      default: "",
    },
  },
  get chatHasTopic() {
    return true;
  },
  // New GTalk accounts will prefer OAuth2, which works with Google's two-factor
  // authentication.
  get noPassword() {
    return true;
  },
};
