/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from accountSetup.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { OAuth2Providers } = ChromeUtils.import(
  "resource:///modules/OAuth2Providers.jsm"
);

/**
 * This checks a given config, by trying a real connection and login,
 * with username and password.
 *
 * TODO
 * - give specific errors, bug 555448
 * - return a working |Abortable| to allow cancel
 *
 * @param accountConfig {AccountConfig} The guessed account config.
 *    username, password, realname, emailaddress etc. are not filled out,
 *    but placeholders to be filled out via replaceVariables().
 * @param alter {boolean}
 *    Try other usernames and login schemes, until login works.
 *    Warning: Modifies |accountConfig|.
 *
 * This function is async.
 * @param successCallback function(accountConfig)
 *   Called when we could guess the config.
 *   For accountConfig, see below.
 * @param errorCallback function(ex)
 *   Called when we could guess not the config, either
 *   because we have not found anything or
 *   because there was an error (e.g. no network connection).
 *   The ex.message will contain a user-presentable message.
 */
function verifyConfig(
  config,
  alter,
  msgWindow,
  successCallback,
  errorCallback
) {
  ddump("verify config:\n" + config);
  assert(
    config instanceof AccountConfig,
    "BUG: Arg 'config' needs to be an AccountConfig object"
  );
  assert(typeof alter == "boolean");
  assert(typeof successCallback == "function");
  assert(typeof errorCallback == "function");

  if (
    MailServices.accounts.findRealServer(
      config.incoming.username,
      config.incoming.hostname,
      config.incoming.type,
      config.incoming.port
    )
  ) {
    errorCallback("Incoming server exists");
    return;
  }

  // incoming server
  let inServer = MailServices.accounts.createIncomingServer(
    config.incoming.username,
    config.incoming.hostname,
    config.incoming.type
  );
  inServer.port = config.incoming.port;
  inServer.password = config.incoming.password;
  if (config.incoming.socketType == 1) {
    // plain
    inServer.socketType = Ci.nsMsgSocketType.plain;
  } else if (config.incoming.socketType == 2) {
    // SSL
    inServer.socketType = Ci.nsMsgSocketType.SSL;
  } else if (config.incoming.socketType == 3) {
    // STARTTLS
    inServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
  }

  gEmailWizardLogger.info(
    "Setting incoming server authMethod to " + config.incoming.auth
  );
  inServer.authMethod = config.incoming.auth;

  try {
    // Lookup OAuth2 issuer if needed.
    // -- Incoming.
    if (
      config.incoming.auth == Ci.nsMsgAuthMethod.OAuth2 &&
      (!config.incoming.oauthSettings ||
        !config.incoming.oauthSettings.issuer ||
        !config.incoming.oauthSettings.scope)
    ) {
      let details = OAuth2Providers.getHostnameDetails(
        config.incoming.hostname
      );
      if (!details) {
        throw new Error(
          `Could not get OAuth2 details for hostname=${config.incoming.hostname}.`
        );
      }
      config.incoming.oauthSettings = { issuer: details[0], scope: details[1] };
    }
    // -- Outgoing.
    if (
      config.outgoing.auth == Ci.nsMsgAuthMethod.OAuth2 &&
      (!config.outgoing.oauthSettings ||
        !config.outgoing.oauthSettings.issuer ||
        !config.outgoing.oauthSettings.scope)
    ) {
      let details = OAuth2Providers.getHostnameDetails(
        config.outgoing.hostname
      );
      if (!details) {
        throw new Error(
          `Could not get OAuth2 details for hostname=${config.outgoing.hostname}.`
        );
      }
      config.outgoing.oauthSettings = { issuer: details[0], scope: details[1] };
    }
    if (config.incoming.owaURL) {
      inServer.setUnicharValue("owa_url", config.incoming.owaURL);
    }
    if (config.incoming.ewsURL) {
      inServer.setUnicharValue("ews_url", config.incoming.ewsURL);
    }
    if (config.incoming.easURL) {
      inServer.setUnicharValue("eas_url", config.incoming.easURL);
    }

    if (inServer.password || inServer.authMethod == Ci.nsMsgAuthMethod.OAuth2) {
      verifyLogon(
        config,
        inServer,
        alter,
        msgWindow,
        successCallback,
        errorCallback
      );
    } else {
      // Avoid pref pollution, clear out server prefs.
      MailServices.accounts.removeIncomingServer(inServer, true);
      successCallback(config);
    }
  } catch (e) {
    gEmailWizardLogger.error("verifyConfig failed: " + e);
    // Avoid pref pollution, clear out server prefs.
    MailServices.accounts.removeIncomingServer(inServer, true);
    errorCallback(e);
  }
}

function verifyLogon(
  config,
  inServer,
  alter,
  msgWindow,
  successCallback,
  errorCallback
) {
  gEmailWizardLogger.info("verifyLogon for server at " + inServer.hostName);
  // hack - save away the old callbacks.
  let saveCallbacks = msgWindow.notificationCallbacks;
  // set our own callbacks - this works because verifyLogon will
  // synchronously create the transport and use the notification callbacks.
  let listener = new urlListener(
    config,
    inServer,
    alter,
    msgWindow,
    successCallback,
    errorCallback
  );
  // our listener listens both for the url and cert errors.
  msgWindow.notificationCallbacks = listener;
  // try to work around bug where backend is clearing password.
  try {
    inServer.password = config.incoming.password;
    let uri = inServer.verifyLogon(listener, msgWindow);
    // clear msgWindow so url won't prompt for passwords.
    uri.QueryInterface(Ci.nsIMsgMailNewsUrl).msgWindow = null;
  } finally {
    // restore them
    msgWindow.notificationCallbacks = saveCallbacks;
  }
}

function urlListener(
  config,
  server,
  alter,
  msgWindow,
  successCallback,
  errorCallback
) {
  this.mConfig = config;
  this.mServer = server;
  this.mAlter = alter;
  this.mSuccessCallback = successCallback;
  this.mErrorCallback = errorCallback;
  this.mMsgWindow = msgWindow;
  this.mCertError = false;
  this._log = gEmailWizardLogger;
}
urlListener.prototype = {
  OnStartRunningUrl(aUrl) {
    this._log.info("Starting to test username");
    this._log.info(
      "  username=" +
        (this.mConfig.incoming.username != this.mConfig.identity.emailAddress) +
        ", have savedUsername=" +
        (this.mConfig.usernameSaved ? "true" : "false")
    );
    this._log.info("  authMethod=" + this.mServer.authMethod);
  },

  OnStopRunningUrl(aUrl, aExitCode) {
    try {
      this._log.info("Finished verifyConfig resulted in " + aExitCode);
      if (Components.isSuccessCode(aExitCode)) {
        this._cleanup();
        this.mSuccessCallback(this.mConfig);
        return;
      }
    } catch (e) {
      this._log.error(e);
    }

    try {
      let nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
        Ci.nsINSSErrorsService
      );
      let errorClass = nssErrorsService.getErrorClass(aExitCode);
      if (errorClass == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        this.mCertError = true;
      }
    } catch (e) {
      // It's not an NSS error.
    }

    if (this.mCertError) {
      this._log.error("cert error");

      let mailNewsUrl = aUrl.QueryInterface(Ci.nsIMsgMailNewsUrl);
      let secInfo = mailNewsUrl.failedSecInfo;
      this.informUserOfCertError(secInfo, aUrl.asciiHostPort);
    } else if (this.mAlter) {
      // Try other variations.
      this.tryNextLogon(aUrl);
    } else {
      // Logon failed, and we aren't supposed to try other variations.
      this._failed(aUrl);
    }
  },

  tryNextLogon(aPreviousUrl) {
    this._log.info("tryNextLogon()");
    this._log.info(
      "  username=" +
        (this.mConfig.incoming.username != this.mConfig.identity.emailAddress) +
        ", have savedUsername=" +
        (this.mConfig.usernameSaved ? "true" : "false")
    );
    this._log.info("  authMethod=" + this.mServer.authMethod);
    // check if we tried full email address as username
    if (this.mConfig.incoming.username != this.mConfig.identity.emailAddress) {
      this._log.info("  Changing username to email address.");
      this.mConfig.usernameSaved = this.mConfig.incoming.username;
      this.mConfig.incoming.username = this.mConfig.identity.emailAddress;
      this.mConfig.outgoing.username = this.mConfig.identity.emailAddress;
      this.mServer.username = this.mConfig.incoming.username;
      this.mServer.password = this.mConfig.incoming.password;
      verifyLogon(
        this.mConfig,
        this.mServer,
        this.mAlter,
        this.mMsgWindow,
        this.mSuccessCallback,
        this.mErrorCallback
      );
      return;
    }

    if (this.mConfig.usernameSaved) {
      this._log.info("  Re-setting username.");
      // If we tried the full email address as the username, then let's go
      // back to trying just the username before trying the other cases.
      this.mConfig.incoming.username = this.mConfig.usernameSaved;
      this.mConfig.outgoing.username = this.mConfig.usernameSaved;
      this.mConfig.usernameSaved = null;
      this.mServer.username = this.mConfig.incoming.username;
      this.mServer.password = this.mConfig.incoming.password;
    }

    // sec auth seems to have failed, and we've tried both
    // varieties of user name, sadly.
    // So fall back to non-secure auth, and
    // again try the user name and email address as username
    assert(this.mConfig.incoming.auth == this.mServer.authMethod);
    this._log.info(
      "  Using SSL: " +
        (this.mServer.socketType == Ci.nsMsgSocketType.SSL ||
          this.mServer.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS)
    );
    if (
      this.mConfig.incoming.authAlternatives &&
      this.mConfig.incoming.authAlternatives.length
    ) {
      // We may be dropping back to insecure auth methods here,
      // which is not good. But then again, we already warned the user,
      // if it is a config without SSL.
      this._log.info(
        "  auth alternatives = " +
          this.mConfig.incoming.authAlternatives.join(",")
      );
      this._log.info("  Decreasing auth.");
      this._log.info(
        "  Have password: " + (this.mServer.password ? "true" : "false")
      );
      let brokenAuth = this.mConfig.incoming.auth;
      // take the next best method (compare chooseBestAuthMethod() in guess)
      this.mConfig.incoming.auth = this.mConfig.incoming.authAlternatives.shift();
      this.mServer.authMethod = this.mConfig.incoming.auth;
      // Assume that SMTP server has same methods working as incoming.
      // Broken assumption, but we currently have no SMTP verification.
      // TODO implement real SMTP verification
      if (
        this.mConfig.outgoing.auth == brokenAuth &&
        this.mConfig.outgoing.authAlternatives.includes(
          this.mConfig.incoming.auth
        )
      ) {
        this.mConfig.outgoing.auth = this.mConfig.incoming.auth;
      }
      this._log.info("  outgoing auth: " + this.mConfig.outgoing.auth);
      verifyLogon(
        this.mConfig,
        this.mServer,
        this.mAlter,
        this.mMsgWindow,
        this.mSuccessCallback,
        this.mErrorCallback
      );
      return;
    }

    // Tried all variations we can. Give up.
    this._log.info("Giving up.");
    this._failed(aPreviousUrl);
  },

  _cleanup() {
    try {
      // Avoid pref pollution, clear out server prefs.
      if (this.mServer) {
        MailServices.accounts.removeIncomingServer(this.mServer, true);
        this.mServer = null;
      }
    } catch (e) {
      this._log.error(e);
    }
  },

  _failed(aUrl) {
    this._cleanup();
    var code = aUrl.errorCode || "login-error-unknown";
    var msg = aUrl.errorMessage;
    // *Only* for known (!) username/password errors, show our message.
    // But there are 1000 other reasons why it could have failed, e.g.
    // server not reachable, bad auth method, server hiccups, or even
    // custom server messages that tell the user to do something,
    // so show the backend error message, unless we are certain
    // that it's a wrong username or password.
    if (
      !msg || // Normal IMAP login error sets no error msg
      code == "pop3UsernameFailure" ||
      code == "pop3PasswordFailed" ||
      code == "imapOAuth2Error"
    ) {
      msg = getStringBundle(
        "chrome://messenger/locale/accountCreationModel.properties"
      ).GetStringFromName("cannot_login.error");
    }
    var ex = new Exception(msg);
    ex.code = code;
    this.mErrorCallback(ex);
  },

  informUserOfCertError(secInfo, location) {
    var params = {
      exceptionAdded: false,
      securityInfo: secInfo,
      prefetchCert: true,
      location,
    };
    window.openDialog(
      "chrome://pippki/content/exceptionDialog.xhtml",
      "",
      "chrome,centerscreen,modal",
      params
    );
    this._log.info("cert exception dialog closed");
    this._log.info("cert exceptionAdded = " + params.exceptionAdded);
    if (!params.exceptionAdded) {
      this._cleanup();
      let errorMsg = getStringBundle(
        "chrome://messenger/locale/accountCreationModel.properties"
      ).GetStringFromName("cannot_login.error");
      this.mErrorCallback(new Exception(errorMsg));
    } else {
      // Retry the logon now that we've added the cert exception.
      verifyLogon(
        this.mConfig,
        this.mServer,
        this.mAlter,
        this.mMsgWindow,
        this.mSuccessCallback,
        this.mErrorCallback
      );
    }
  },

  // nsIInterfaceRequestor
  getInterface(iid) {
    return this.QueryInterface(iid);
  },

  // nsISupports
  QueryInterface: ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIUrlListener",
  ]),
};
