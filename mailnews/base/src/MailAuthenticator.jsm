/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpAuthenticator"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * A base class for interfaces when authenticating a mail connection.
 */
class MailAuthenticator {
  /**
   * Get the username for a connection.
   * @returns string
   */
  getUsername() {
    throw Components.Exception(
      "getUsername not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Get the password for a connection.
   * @returns string
   */
  getPassword() {
    throw Components.Exception(
      "getPassword not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Get the OAuth token for a connection.
   * @returns string
   */
  async getOAuthToken() {
    throw Components.Exception(
      "getOAuthToken not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
}

/**
 * Collection of helper functions for authenticating an SMTP connection.
 */
class SmtpAuthenticator extends MailAuthenticator {
  /**
   * @param {nsISmtpServer} server - The associated server instance.
   */
  constructor(server) {
    super();
    this._server = server;
  }

  getUsername() {
    return this._server.username;
  }

  getPassword() {
    if (this._server.password) {
      return this._server.password;
    }
    let composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );
    let username = this._server.username;
    let promptString;
    if (username) {
      promptString = composeBundle.formatStringFromName(
        "smtpEnterPasswordPromptWithUsername",
        [this._server.hostname, username]
      );
    } else {
      promptString = composeBundle.formatStringFromName(
        "smtpEnterPasswordPrompt",
        [this._server.hostname]
      );
    }
    let promptTitle = composeBundle.formatStringFromName(
      "smtpEnterPasswordPromptTitleWithHostname",
      [this._server.hostname]
    );
    return this._server.getPasswordWithUI(
      promptString,
      promptTitle,
      Services.ww.getNewAuthPrompter(null)
    );
  }

  async getOAuthToken() {
    let oauth2Module = Cc["@mozilla.org/mail/oauth2-module;1"].createInstance(
      Ci.msgIOAuth2Module
    );
    if (!oauth2Module.initFromSmtp(this._server)) {
      return Promise.reject(
        `initFromSmtp failed, hostname: ${this._server.hostname}`
      );
    }
    return new Promise((resolve, reject) => {
      oauth2Module.connect(true, {
        onSuccess: token => {
          resolve(token);
        },
        onFailure: e => {
          reject(e);
        },
      });
    });
  }
}
