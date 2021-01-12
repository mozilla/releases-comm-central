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
   * Get the hostname for a connection.
   * @returns string
   */
  get hostname() {
    throw Components.Exception(
      "hostname getter not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Get the username for a connection.
   * @returns string
   */
  get username() {
    throw Components.Exception(
      "username getter not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Get the password for a connection.
   * @param {boolean} forceNew - Discard the cached password, force requesting
   *   new password from user.
   * @returns string
   */
  getPassword(forceNew) {
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

  /**
   * Show a dialog for authentication failure.
   * @returns {number} - 0: Retry; 1: Cancel; 2: New password.
   */
  promptAuthFailed() {
    throw Components.Exception(
      "promptAuthFailed not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Show a dialog for authentication failure.
   * @param {nsIMsgWindow} - The associated msg window.
   * @param {string} - A user defined account name or the server hostname.
   * @returns {number} - 0: Retry; 1: Cancel; 2: New password.
   */
  _promptAuthFailed(msgWindow, accountname) {
    let dialog;
    if (msgWindow) {
      dialog = msgWindow.promptDialog;
    }
    if (!dialog) {
      dialog = Services.ww.getNewPrompter(null);
    }

    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    let message = bundle.formatStringFromName("mailServerLoginFailed2", [
      this.hostname,
      this.username,
    ]);

    let title = bundle.formatStringFromName(
      "mailServerLoginFailedTitleWithAccount",
      [accountname]
    );

    let retryButtonLabel = bundle.GetStringFromName(
      "mailServerLoginFailedRetryButton"
    );
    let newPasswordButtonLabel = bundle.GetStringFromName(
      "mailServerLoginFailedEnterNewPasswordButton"
    );
    let buttonFlags =
      Ci.nsIPrompt.BUTTON_POS_0 * Ci.nsIPrompt.BUTTON_TITLE_IS_STRING +
      Ci.nsIPrompt.BUTTON_POS_1 * Ci.nsIPrompt.BUTTON_TITLE_CANCEL +
      Ci.nsIPrompt.BUTTON_POS_2 * Ci.nsIPrompt.BUTTON_TITLE_IS_STRING;
    let dummyValue = { value: false };

    return dialog.confirmEx(
      title,
      message,
      buttonFlags,
      retryButtonLabel,
      null,
      newPasswordButtonLabel,
      null,
      dummyValue
    );
  }
}

/**
 * Collection of helper functions for authenticating an SMTP connection.
 * @extends MailAuthenticator
 */
class SmtpAuthenticator extends MailAuthenticator {
  /**
   * @param {nsISmtpServer} server - The associated server instance.
   */
  constructor(server) {
    super();
    this._server = server;
  }

  get hostname() {
    return this._server.hostname;
  }

  get username() {
    return this._server.username;
  }

  getPassword(forceNew) {
    if (forceNew) {
      this._server.forgetPassword();
    } else if (this._server.password) {
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

  promptAuthFailed() {
    return this._promptAuthFailed(
      null,
      this._server.description || this.hostname
    );
  }
}
