/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailCryptoUtils } from "resource:///modules/MailCryptoUtils.sys.mjs";

import { MailStringUtils } from "resource:///modules/MailStringUtils.sys.mjs";

/**
 * A base class for interfaces when authenticating a mail connection.
 */
class MailAuthenticator {
  /**
   * Get the hostname for a connection.
   *
   * @returns {string}
   */
  get hostname() {
    throw Components.Exception(
      "hostname getter not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Get the username for a connection.
   *
   * @returns {string}
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
   *
   * @returns {string}
   */
  getPassword() {
    throw Components.Exception(
      "getPassword not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Get the CRAM-MD5 auth token for a connection.
   *
   * @param {string} password - The password, used as HMAC-MD5 secret.
   * @param {string} challenge - The base64 encoded server challenge.
   * @returns {string}
   */
  getCramMd5Token(password, challenge) {
    // Hash the challenge.
    const signature = MailCryptoUtils.hmacMd5(
      new TextEncoder().encode(password),
      new TextEncoder().encode(atob(challenge))
    );
    // Get the hex form of the signature.
    const hex = [...signature]
      .map(x => x.toString(16).padStart(2, "0"))
      .join("");
    return btoa(`${this.username} ${hex}`);
  }

  /**
   * Get the OAuth token for a connection.
   *
   * @returns {string}
   */
  async getOAuthToken() {
    throw Components.Exception(
      "getOAuthToken not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Init a nsIMailAuthModule instance for GSSAPI auth.
   *
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
   *
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
   *
   * @param {string} inToken - A base64 encoded string, usually server challenge.
   * @returns {string}
   */
  getNextNtlmToken(inToken) {
    return this._authModule.getNextToken(inToken);
  }

  /**
   * Show a dialog for authentication failure.
   *
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
   *
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {string} accountname - A user defined account name or the server hostname.
   * @returns {number} 0: Retry; 1: Cancel; 2: New password.
   */
  _promptAuthFailed(msgWindow, accountname) {
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    const message = bundle.formatStringFromName("mailServerLoginFailed2", [
      this.hostname,
      this.username,
    ]);

    const title = bundle.formatStringFromName(
      "mailServerLoginFailedTitleWithAccount",
      [accountname]
    );

    const retryButtonLabel = bundle.GetStringFromName(
      "mailServerLoginFailedRetryButton"
    );
    const newPasswordButtonLabel = bundle.GetStringFromName(
      "mailServerLoginFailedEnterNewPasswordButton"
    );
    const buttonFlags =
      Ci.nsIPrompt.BUTTON_POS_0 * Ci.nsIPrompt.BUTTON_TITLE_IS_STRING +
      Ci.nsIPrompt.BUTTON_POS_1 * Ci.nsIPrompt.BUTTON_TITLE_CANCEL +
      Ci.nsIPrompt.BUTTON_POS_2 * Ci.nsIPrompt.BUTTON_TITLE_IS_STRING;
    const dummyValue = { value: false };

    return Services.prompt.confirmEx(
      msgWindow?.domWindow,
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
 *
 * @augments {MailAuthenticator}
 */
export class SmtpAuthenticator extends MailAuthenticator {
  /**
   * @param {nsIMsgOutgoingServer} server - The associated server instance.
   */
  constructor(server) {
    super();
    this._server = server;
  }

  get hostname() {
    return this._server.serverURI.host;
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
    const composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties"
    );
    const username = this._server.username;
    let promptString;
    if (username) {
      promptString = composeBundle.formatStringFromName(
        "smtpEnterPasswordPromptWithUsername",
        [this._server.serverURI.host, username]
      );
    } else {
      promptString = composeBundle.formatStringFromName(
        "smtpEnterPasswordPrompt",
        [this._server.serverURI.host]
      );
    }
    const promptTitle = composeBundle.formatStringFromName(
      "smtpEnterPasswordPromptTitleWithHostname",
      [this._server.serverURI.host]
    );
    return this._server.getPasswordWithUI(promptString, promptTitle);
  }

  /**
   * Get the ByteString form of the current password.
   *
   * @returns {string}
   */
  getByteStringPassword() {
    return MailStringUtils.stringToByteString(this.getPassword());
  }

  /**
   * Get the PLAIN auth token for a connection.
   *
   * @returns {string}
   */
  getPlainToken() {
    // According to rfc4616#section-2, password should be UTF-8 BinaryString
    // before base64 encoded.
    return btoa("\0" + this.username + "\0" + this.getByteStringPassword());
  }

  async getOAuthToken() {
    const oauth2Module = Cc["@mozilla.org/mail/oauth2-module;1"].createInstance(
      Ci.msgIOAuth2Module
    );
    if (!oauth2Module.initFromSmtp(this._server)) {
      return Promise.reject(`initFromSmtp failed, hostname: ${this.hostname}`);
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

/**
 * Collection of helper functions for authenticating an incoming server.
 *
 * @augments {MailAuthenticator}
 */
class IncomingServerAuthenticator extends MailAuthenticator {
  /**
   * @param {nsIMsgIncomingServer} server - The associated server instance.
   */
  constructor(server) {
    super();
    this._server = server;
  }

  get hostname() {
    return this._server.hostName;
  }

  get username() {
    return this._server.username;
  }

  forgetPassword() {
    this._server.forgetPassword();
  }

  /**
   * Get the ByteString form of the current password.
   *
   * @returns {string}
   */
  async getByteStringPassword() {
    return MailStringUtils.stringToByteString(await this.getPassword());
  }

  /**
   * Get the PLAIN auth token for a connection.
   *
   * @returns {string}
   */
  async getPlainToken() {
    // According to rfc4616#section-2, password should be UTF-8 BinaryString
    // before base64 encoded.
    return btoa(
      "\0" + this.username + "\0" + (await this.getByteStringPassword())
    );
  }

  async getOAuthToken() {
    const oauth2Module = Cc["@mozilla.org/mail/oauth2-module;1"].createInstance(
      Ci.msgIOAuth2Module
    );
    if (!oauth2Module.initFromMail(this._server)) {
      return Promise.reject(`initFromMail failed, hostname: ${this.hostname}`);
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

  promptAuthFailed(msgWindow) {
    return this._promptAuthFailed(msgWindow, this._server.prettyName);
  }
}

/**
 * Collection of helper functions for authenticating a NNTP connection.
 *
 * @augments {IncomingServerAuthenticator}
 */
export class NntpAuthenticator extends IncomingServerAuthenticator {
  /**
   * @returns {string} - NNTP server has no userName pref, need to pass it in.
   */
  get username() {
    return this._username;
  }

  set username(value) {
    this._username = value;
  }
}

/**
 * Collection of helper functions for authenticating a POP connection.
 *
 * @augments {IncomingServerAuthenticator}
 */
export class Pop3Authenticator extends IncomingServerAuthenticator {
  async getPassword() {
    if (this._server.password) {
      return this._server.password;
    }
    const composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/localMsgs.properties"
    );
    const params = [this._server.username, this._server.hostName];
    const promptString = composeBundle.formatStringFromName(
      "pop3EnterPasswordPrompt",
      params
    );
    const promptTitle = composeBundle.formatStringFromName(
      "pop3EnterPasswordPromptTitleWithUsername",
      [this._server.hostName]
    );
    return this._server.wrappedJSObject.getPasswordWithUIAsync(
      promptString,
      promptTitle
    );
  }
}

/**
 * Collection of helper functions for authenticating an IMAP connection.
 *
 * @augments {IncomingServerAuthenticator}
 */
export class ImapAuthenticator extends IncomingServerAuthenticator {
  async getPassword() {
    if (this._server.password) {
      return this._server.password;
    }
    const composeBundle = Services.strings.createBundle(
      "chrome://messenger/locale/imapMsgs.properties"
    );
    const params = [this._server.username, this._server.hostName];
    const promptString = composeBundle.formatStringFromName(
      "imapEnterServerPasswordPrompt",
      params
    );
    const promptTitle = composeBundle.formatStringFromName(
      "imapEnterPasswordPromptTitleWithUsername",
      [this._server.hostName]
    );
    return this._server.wrappedJSObject.getPasswordWithUIAsync(
      promptString,
      promptTitle
    );
  }
}
