/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import { OAuth2Providers } from "resource:///modules/OAuth2Providers.sys.mjs";
import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

/**
 * @implements {nsIUrlListener}
 * @implements {nsIInterfaceRequestor}
 */
export class ConfigVerifier {
  QueryInterface = ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIUrlListener",
  ]);

  // @see {nsIInterfaceRequestor}
  getInterface(iid) {
    return this.QueryInterface(iid);
  }

  constructor(msgWindow) {
    this.msgWindow = msgWindow;
    this._log = console.createInstance({
      prefix: "mail.setup",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mail.setup.loglevel",
    });
  }

  /**
   * @param {nsIURI} url - The URL being processed.
   * @see {nsIUrlListener}
   */
  OnStartRunningUrl() {
    this._log.debug(`Starting to verify configuration;
      email as username=${
        this.config.incoming.username != this.config.identity.emailAddress
      }
      savedUsername=${this.config.usernameSaved ? "true" : "false"},
      authMethod=${this.server.authMethod}`);
  }

  /**
   * @param {nsIURI} url - The URL being processed.
   * @param {nsresult} status - A result code of URL processing.
   * @see {nsIUrlListener}
   */
  OnStopRunningUrl(url, status) {
    if (Components.isSuccessCode(status)) {
      this._log.debug(`Configuration verified successfully!`);
      if (this.server.authMethod == Ci.nsMsgAuthMethod.OAuth2) {
        const grantedScope = this.server.getUnicharValue("oauth2.scope", "");
        this.config.incoming.oauthSettings.scope = grantedScope;
        this.config.outgoing.oauthSettings.scope = grantedScope;
      }
      this.cleanup();
      this.successCallback(this.config);
      return;
    }

    this._log.debug(`Verifying configuration failed; status=${status}`);

    let certError = false;
    try {
      const nssErrorsService = Cc[
        "@mozilla.org/nss_errors_service;1"
      ].getService(Ci.nsINSSErrorsService);
      const errorClass = nssErrorsService.getErrorClass(status);
      if (errorClass == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        certError = true;
      }
    } catch (e) {
      // It's not an NSS error.
    }

    if (certError) {
      const mailNewsUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
      const secInfo = mailNewsUrl.failedSecInfo;
      this.informUserOfCertError(secInfo, url.asciiHostPort);
    } else if (this.alter) {
      // Try other variations.
      this.server.closeCachedConnections();
      this.tryNextLogon(url);
    } else {
      // Logon failed, and we aren't supposed to try other variations.
      this._failed(url);
    }
  }

  tryNextLogon(aPreviousUrl) {
    this._log.debug("Trying next logon variation");
    // check if we tried full email address as username
    if (this.config.incoming.username != this.config.identity.emailAddress) {
      this._log.debug("Changing username to email address.");
      this.config.usernameSaved = this.config.incoming.username;
      this.config.incoming.username = this.config.identity.emailAddress;
      this.config.outgoing.username = this.config.identity.emailAddress;
      this.server.username = this.config.incoming.username;
      this.server.password = this.config.incoming.password;
      this.verifyLogon();
      return;
    }

    if (this.config.usernameSaved) {
      this._log.debug("Re-setting username.");
      // If we tried the full email address as the username, then let's go
      // back to trying just the username before trying the other cases.
      this.config.incoming.username = this.config.usernameSaved;
      this.config.outgoing.username = this.config.usernameSaved;
      this.config.usernameSaved = null;
      this.server.username = this.config.incoming.username;
      this.server.password = this.config.incoming.password;
    }

    // sec auth seems to have failed, and we've tried both
    // varieties of user name, sadly.
    // So fall back to non-secure auth, and
    // again try the user name and email address as username
    if (this.server.socketType == Ci.nsMsgSocketType.SSL) {
      this._log.debug("Using SSL");
    } else if (this.server.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS) {
      this._log.debug("Using STARTTLS");
    }
    if (
      this.config.incoming.authAlternatives &&
      this.config.incoming.authAlternatives.length
    ) {
      // We may be dropping back to insecure auth methods here,
      // which is not good. But then again, we already warned the user,
      // if it is a config without SSL.

      const brokenAuth = this.config.incoming.auth;
      // take the next best method (compare chooseBestAuthMethod() in guess)
      this.config.incoming.auth = this.config.incoming.authAlternatives.shift();
      this.server.authMethod = this.config.incoming.auth;
      // Assume that SMTP server has same methods working as incoming.
      // Broken assumption, but we currently have no SMTP verification.
      // TODO: implement real SMTP verification
      if (
        this.config.outgoing.auth == brokenAuth &&
        this.config.outgoing.authAlternatives.includes(
          this.config.incoming.auth
        )
      ) {
        this.config.outgoing.auth = this.config.incoming.auth;
      }
      this._log.debug(`Trying next auth method: ${this.server.authMethod}`);
      this.verifyLogon();
      return;
    }

    // Tried all variations we can. Give up.
    this._log.debug("Have tried all variations. Giving up.");
    this._failed(aPreviousUrl);
  }

  /**
   * Clear out the server we had created for use during testing.
   */
  cleanup() {
    try {
      if (this.server) {
        MailServices.accounts.removeIncomingServer(this.server, true);
        this.server = null;
      }
    } catch (e) {
      this._log.error(e);
    }
  }

  /**
   * @param {nsIURI} url - The URL being processed.
   */
  _failed(url) {
    this.cleanup();
    url = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
    const code = url.errorCode || "login-error-unknown";
    let msg = url.errorMessage;
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
      msg = AccountCreationUtils.getStringBundle(
        "chrome://messenger/locale/accountCreationModel.properties"
      ).GetStringFromName("cannot_login.error");
    }
    this.errorCallback(new Error(msg));
  }

  /**
   * Inform users that we got a certificate error for the specified location.
   * Allow them to add an exception for it.
   *
   * @param {nsITransportSecurityInfo} secInfo
   * @param {string} location - "host:port" that had the problem.
   */
  informUserOfCertError(secInfo, location) {
    this._log.debug(`Informing user about cert error for ${location}`);
    const params = {
      exceptionAdded: false,
      securityInfo: secInfo,
      prefetchCert: true,
      location,
    };
    Services.wm
      .getMostRecentWindow("mail:3pane")
      .browsingContext.topChromeWindow.openDialog(
        "chrome://pippki/content/exceptionDialog.xhtml",
        "exceptionDialog",
        "chrome,centerscreen,modal",
        params
      );
    if (!params.exceptionAdded) {
      this._log.debug(`Did not accept exception for ${location}`);
      this.cleanup();
      const errorMsg = AccountCreationUtils.getStringBundle(
        "chrome://messenger/locale/accountCreationModel.properties"
      ).GetStringFromName("cannot_login.error");
      this.errorCallback(new Error(errorMsg));
    } else {
      this._log.debug(`Accept exception for ${location} - will retry logon.`);
      // Retry the logon now that we've added the cert exception.
      this.verifyLogon();
    }
  }

  /**
   * This checks a given config, by trying a real connection and login,
   * with username and password.
   *
   * @param  {AccountConfig} config - The guessed account config.
   *   username, password, realname, emailaddress etc. are not filled out,
   *   but placeholders to be filled out via replaceVariables().
   * @param alter {boolean} - Try other usernames and login schemes, until
   *   login works. Warning: Modifies |config|.
   * @returns {Promise<AccountConfig>} the successful configuration.
   * @throws {Error} when we could guess not the config, either
   *   because we have not found anything or because there was an error
   *   (e.g. no network connection).
   *   The ex.message will contain a user-presentable message.
   */
  async verifyConfig(config, alter) {
    this.alter = alter;
    return new Promise((resolve, reject) => {
      this.config = config;
      this.successCallback = resolve;
      this.errorCallback = reject;
      if (
        MailServices.accounts.findServer(
          config.incoming.username,
          config.incoming.hostname,
          config.incoming.type,
          config.incoming.port
        )
      ) {
        reject(new Error("Incoming server exists"));
        return;
      }

      // incoming server
      if (!this.server) {
        this.server = MailServices.accounts.createIncomingServer(
          config.incoming.username,
          config.incoming.hostname,
          config.incoming.type
        );
      }
      this.server.port = config.incoming.port;
      this.server.password = config.incoming.password;
      this.server.socketType = config.incoming.socketType;

      this._log.info(
        "Setting incoming server authMethod to " + config.incoming.auth
      );
      this.server.authMethod = config.incoming.auth;

      try {
        // Lookup OAuth2 issuer if needed.
        // -- Incoming.
        if (
          config.incoming.auth == Ci.nsMsgAuthMethod.OAuth2 &&
          (!config.incoming.oauthSettings ||
            !config.incoming.oauthSettings.issuer ||
            !config.incoming.oauthSettings.scope)
        ) {
          const details = OAuth2Providers.getHostnameDetails(
            config.incoming.hostname
          );
          if (!details) {
            reject(
              new Error(
                `Could not get OAuth2 details for hostname=${config.incoming.hostname}.`
              )
            );
          }
          config.incoming.oauthSettings = {
            issuer: details[0],
            scope: details[1],
          };
        }
        // -- Outgoing.
        if (
          config.outgoing.auth == Ci.nsMsgAuthMethod.OAuth2 &&
          (!config.outgoing.oauthSettings ||
            !config.outgoing.oauthSettings.issuer ||
            !config.outgoing.oauthSettings.scope)
        ) {
          const details = OAuth2Providers.getHostnameDetails(
            config.outgoing.hostname
          );
          if (!details) {
            reject(
              new Error(
                `Could not get OAuth2 details for hostname=${config.outgoing.hostname}.`
              )
            );
          }
          config.outgoing.oauthSettings = {
            issuer: details[0],
            scope: details[1],
          };
        }
        if (config.incoming.owaURL) {
          this.server.setUnicharValue("owa_url", config.incoming.owaURL);
        }
        if (config.incoming.ewsURL) {
          this.server.setUnicharValue("ews_url", config.incoming.ewsURL);
        }
        if (config.incoming.easURL) {
          this.server.setUnicharValue("eas_url", config.incoming.easURL);
        }

        if (
          this.server.password ||
          this.server.authMethod == Ci.nsMsgAuthMethod.OAuth2
        ) {
          this.verifyLogon();
        } else {
          this.cleanup();
          resolve(config);
        }
      } catch (e) {
        this._log.info("verifyConfig failed: " + e);
        this.cleanup();
        reject(e);
      }
    });
  }

  /**
   * Verify that the provided credentials can log in to the incoming server.
   */
  verifyLogon() {
    this._log.info("verifyLogon for server at " + this.server.hostName);

    this.server.password = this.config.incoming.password;
    const uri = this.server.verifyLogon(this, this.msgWindow);
    // clear msgWindow so url won't prompt for passwords.
    uri.QueryInterface(Ci.nsIMsgMailNewsUrl).msgWindow = null;
  }
}
