/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SmtpAuthenticator"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

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
   * Forget cached password.
   */
  forgetPassword() {
    throw Components.Exception(
      "forgetPassword not implemented",
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

  /**
   * Init a nsIMailAuthModule instance for GSSAPI auth.
   * @param {('smtp'|'imap')} protocol - The protocol name.
   */
  initGssapiAuth(protocol) {
    this._authModule = Cc["@mozilla.org/mail/auth-module;1"].createInstance(
      Ci.nsIMailAuthModule
    );
    this._authModule.init(
      "sasl-gssapi", // Auth module type
      `${protocol}@${this.hostname}`,
      0, // nsIAuthModule::REQ_DEFAULT
      null, // domain
      this.username,
      null // password
    );
  }

  /**
   * Get the next token in a sequence of GSSAPI auth steps.
   * @param {string} inToken - A base64 encoded string, usually server challenge.
   * @returns {string}
   */
  getNextGssapiToken(inToken) {
    return this._authModule.getNextToken(inToken);
  }

  /**
   * Init a nsIMailAuthModule instance for NTLM auth.
   */
  initNtlmAuth() {
    this._authModule = Cc["@mozilla.org/mail/auth-module;1"].createInstance(
      Ci.nsIMailAuthModule
    );
    this._authModule.init(
      "ntlm", // Auth module type
      null, // Service name
      0, // nsIAuthModule::REQ_DEFAULT
      null, // domain
      this.username,
      this.getPassword()
    );
  }

  /**
   * Get the next token in a sequence of NTLM auth steps.
   * @param {string} inToken - A base64 encoded string, usually server challenge.
   * @returns {string}
   */
  getNextNtlmToken(inToken) {
    return this._authModule.getNextToken(inToken);
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

  forgetPassword() {
    this._server.forgetPassword();
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
    let authPrompt;
    try {
      // This prompt has a checkbox for saving password.
      authPrompt = MailServices.mailSession.topmostMsgWindow.authPrompt;
    } catch (e) {
      // Often happens in tests. This prompt has no checkbox for saving password.
      authPrompt = Services.ww.getNewAuthPrompter(null);
    }
    return this._server.getPasswordWithUI(
      promptString,
      promptTitle,
      authPrompt
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
