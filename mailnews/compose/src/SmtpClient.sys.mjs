/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Based on https://github.com/emailjs/emailjs-smtp-client
 *
 * Copyright (c) 2013 Andris Reinman
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { MailStringUtils } from "resource:///modules/MailStringUtils.sys.mjs";
import { SmtpAuthenticator } from "resource:///modules/MailAuthenticator.sys.mjs";
import { MsgUtils } from "resource:///modules/MimeMessageUtils.sys.mjs";

export class SmtpClient {
  /**
   * The number of RCPT TO commands sent on the connection by this client.
   * This can count-up over multiple messages.
   * Per RFC, the minimum total number of recipients that MUST be buffered
   * is 100 recipients.
   *
   * @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.1.8
   * When 100 or more recipients have been counted on a connection, a new
   * connection will be established to handle the additional recipients.
   */
  rcptCount = 0;

  /**
   * Set true only when doing a retry.
   */
  isRetry = false;

  /**
   * Becomes false when either recipient or message count reaches their limit.
   */
  reuseConnection = true;

  /**
   * Creates a connection object to a SMTP server and allows to send mail through it.
   * Call `connect` method to inititate the actual connection, the constructor only
   * defines the properties but does not actually connect.
   *
   * @class
   *
   * @param {nsISmtpServer} server - The associated nsISmtpServer instance.
   */
  constructor(server) {
    this.options = {
      alwaysSTARTTLS:
        server.socketType == Ci.nsMsgSocketType.trySTARTTLS ||
        server.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS,
      requireTLS: server.socketType == Ci.nsMsgSocketType.SSL,
    };

    this.socket = false; // Downstream TCP socket to the SMTP server, created with TCPSocket
    this.waitDrain = false; // Keeps track if the downstream socket is currently full and a drain event should be waited for or not

    // Private properties

    this._server = server;
    this._authenticator = new SmtpAuthenticator(server);
    this._authenticating = false;
    // A list of auth methods detected from the EHLO response.
    this._supportedAuthMethods = [];
    // A list of auth methods that worth a try.
    this._possibleAuthMethods = [];
    // Auth method set by user preference.
    this._preferredAuthMethods =
      {
        [Ci.nsMsgAuthMethod.passwordCleartext]: ["PLAIN", "LOGIN"],
        [Ci.nsMsgAuthMethod.passwordEncrypted]: ["CRAM-MD5"],
        [Ci.nsMsgAuthMethod.GSSAPI]: ["GSSAPI"],
        [Ci.nsMsgAuthMethod.NTLM]: ["NTLM"],
        [Ci.nsMsgAuthMethod.OAuth2]: ["XOAUTH2"],
        [Ci.nsMsgAuthMethod.secure]: ["CRAM-MD5", "XOAUTH2"],
      }[server.authMethod] || [];
    // The next auth method to try if the current failed.
    this._nextAuthMethod = null;

    // A list of capabilities detected from the EHLO response.
    this._capabilities = [];

    this._dataMode = false; // If true, accepts data from the upstream to be passed directly to the downstream socket. Used after the DATA command
    this._lastDataBytes = ""; // Keep track of the last bytes to see how the terminating dot should be placed
    this._envelope = null; // Envelope object for tracking who is sending mail to whom
    this._currentAction = null; // Stores the function that should be run after a response has been received from the server

    this._parseBlock = { data: [], statusCode: null };
    this._parseRemainder = ""; // If the complete line is not received yet, contains the beginning of it

    this.logger = MsgUtils.smtpLogger;

    // Event placeholders
    this.onerror = (e, failedSecInfo) => {}; // Will be run when an error occurs. The `onclose` event will fire subsequently.
    this.ondrain = () => {}; // More data can be buffered in the socket.
    this.onclose = () => {}; // The connection to the server has been closed
    this.onidle = () => {}; // The connection is established and idle, you can send mail now
    this.onready = failedRecipients => {}; // Waiting for mail body, lists addresses that were not accepted as recipients
    this.ondone = success => {}; // The mail has been sent. Wait for `onidle` next. Indicates if the message was queued by the server.
    // Callback when this client is ready to be reused.
    this.onFree = () => {};
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    if (this.socket?.readyState == "open") {
      this.logger.debug("Reusing a connection");
      this.onidle();
    } else {
      const hostname = this._server.hostname.toLowerCase();
      const port = this._server.port || (this.options.requireTLS ? 465 : 587);
      this.logger.debug(`Connecting to smtp://${hostname}:${port}`);
      this._secureTransport = this.options.requireTLS;
      this.socket = new TCPSocket(hostname, port, {
        binaryType: "arraybuffer",
        useSecureTransport: this._secureTransport,
      });

      this.socket.onerror = this._onError;
      this.socket.onopen = this._onOpen;

      // Reset these counters when a new connection is opened. When the number
      // of messages sent or the number of recipients for the messages reaches
      // their respective threshold, a new connection will be established.
      this._numMessages = 0;
      this.rcptCount = 0;
    }
    this._freed = false;
    const msgsPerConn = this._server._getIntPrefWithDefault(
      "max_messages_per_connection",
      10
    );
    this._messagesPerConnection = msgsPerConn > 0 ? msgsPerConn : 0;
  }

  /**
   * Sends QUIT
   */
  quit() {
    this._authenticating = false;
    this._sendCommand("QUIT");
    this._currentAction = this.close;
  }

  /**
   * Closes the connection to the server
   *
   * @param {boolean} [immediately] - Close the socket without waiting for
   *   unsent data.
   */
  close(immediately) {
    if (this.socket && this.socket.readyState === "open") {
      if (immediately) {
        this.logger.debug(
          `Closing connection to ${this._server.hostname} immediately!`
        );
        this.socket.closeImmediately();
      } else {
        this.logger.debug(`Closing connection to ${this._server.hostname}...`);
        this.socket.close();
      }
    } else {
      this.logger.debug(`Connection to ${this._server.hostname} closed`);
      this._free();
    }
  }

  // Mail related methods

  /**
   * Initiates a new message by submitting envelope data, starting with
   * `MAIL FROM:` command. Use after `onidle` event
   *
   * @param {object} envelope - The envelope object.
   * @param {string} envelope.from - The from address.
   * @param {string[]} envelope.to - The to addresses.
   * @param {number} envelope.size - The file size.
   * @param {boolean} envelope.requestDSN - Whether to request Delivery Status Notifications.
   * @param {boolean} envelope.messageId - The message id.
   */
  useEnvelope(envelope) {
    // First on a new message, clear the QUIT timer if it's running.
    if (this._quitTimer) {
      this.logger.debug("Clearing QUIT timer");
      clearTimeout(this._quitTimer);
      this._quitTimer = null;
    }

    this._envelope = envelope || {};
    this._envelope.from = [].concat(
      this._envelope.from || "anonymous@" + this._getHelloArgument()
    )[0];

    if (!this._capabilities.includes("SMTPUTF8")) {
      // If server doesn't support SMTPUTF8, check if addresses contain invalid
      // characters.

      const recipients = this._envelope.to;
      this._envelope.to = [];

      for (let recipient of recipients) {
        if (!recipient) {
          // This happens when nsISmtpService.sendMailMessage() is called with
          // recipients without @, for example in test_sendMailAddressIDN.js.
          continue;
        }
        let lastAt = null;
        let firstInvalid = null;
        for (let i = 0; i < recipient.length; i++) {
          const ch = recipient[i];
          if (ch == "@") {
            lastAt = i;
          } else if ((ch < " " || ch > "~") && ch != "\t") {
            firstInvalid = i;
            break;
          }
        }
        if (firstInvalid != null) {
          if (!lastAt) {
            // Invalid char found in the localpart, throw error until we implement RFC 6532.
            this._onNsError(MsgUtils.NS_ERROR_ILLEGAL_LOCALPART, recipient);
            return;
          }
          // Invalid char found in the domainpart, convert it to ACE.
          const idnService = Cc[
            "@mozilla.org/network/idn-service;1"
          ].getService(Ci.nsIIDNService);
          const domain = idnService.convertUTF8toACE(
            recipient.slice(lastAt + 1)
          );
          recipient = `${recipient.slice(0, lastAt)}@${domain}`;
        }
        this._envelope.to.push(recipient);
      }
    }

    // clone the recipients array for latter manipulation
    this._envelope.rcptQueue = [...new Set(this._envelope.to)];
    this._envelope.rcptFailed = [];
    this._envelope.responseQueue = [];

    if (!this._envelope.rcptQueue.length) {
      this._onNsError(MsgUtils.NS_MSG_NO_RECIPIENTS);
      return;
    }

    this._currentAction = this._actionMAIL;
    let cmd = `MAIL FROM:<${this._envelope.from}>`;
    if (
      this._capabilities.includes("8BITMIME") &&
      !Services.prefs.getBoolPref("mail.strictly_mime", false)
    ) {
      cmd += " BODY=8BITMIME";
    }
    if (this._capabilities.includes("SMTPUTF8")) {
      // Should not send SMTPUTF8 if all ascii, see RFC6531.
      // eslint-disable-next-line no-control-regex
      const ascii = /^[\x00-\x7F]+$/;
      if ([envelope.from, ...envelope.to].some(x => !ascii.test(x))) {
        cmd += " SMTPUTF8";
      }
    }
    if (this._capabilities.includes("SIZE")) {
      cmd += ` SIZE=${this._envelope.size}`;
    }
    if (this._capabilities.includes("DSN") && this._envelope.requestDSN) {
      const ret = Services.prefs.getBoolPref("mail.dsn.ret_full_on")
        ? "FULL"
        : "HDRS";
      cmd += ` RET=${ret} ENVID=${envelope.messageId}`;
    }
    this._sendCommand(cmd);
  }

  /**
   * Send ASCII data to the server. Works only in data mode (after `onready` event), ignored
   * otherwise
   *
   * @param {string} chunk ASCII string (quoted-printable, base64 etc.) to be sent to the server
   * @returns {boolean} If true, it is safe to send more data, if false, you *should* wait for the ondrain event before sending more
   */
  send(chunk) {
    // works only in data mode
    if (!this._dataMode) {
      // this line should never be reached but if it does,
      // act like everything's normal.
      return true;
    }

    // TODO: if the chunk is an arraybuffer, use a separate function to send the data
    return this._sendString(chunk);
  }

  /**
   * Indicates that a data stream for the socket is ended. Works only in data
   * mode (after `onready` event), ignored otherwise. Use it when you are done
   * with sending the mail. This method does not close the socket. Once the mail
   * has been queued by the server, `ondone` and `onidle` are emitted.
   *
   * @param {Buffer} [chunk] Chunk of data to be sent to the server
   */
  end(chunk) {
    // works only in data mode
    if (!this._dataMode) {
      // this line should never be reached but if it does,
      // act like everything's normal.
      return true;
    }

    if (chunk && chunk.length) {
      this.send(chunk);
    }

    // redirect output from the server to _actionStream
    this._currentAction = this._actionStream;

    // indicate that the stream has ended by sending a single dot on its own line
    // if the client already closed the data with \r\n no need to do it again
    if (this._lastDataBytes === "\r\n") {
      this.waitDrain = this._send(new Uint8Array([0x2e, 0x0d, 0x0a]).buffer); // .\r\n
    } else if (this._lastDataBytes.substr(-1) === "\r") {
      this.waitDrain = this._send(
        new Uint8Array([0x0a, 0x2e, 0x0d, 0x0a]).buffer
      ); // \n.\r\n
    } else {
      this.waitDrain = this._send(
        new Uint8Array([0x0d, 0x0a, 0x2e, 0x0d, 0x0a]).buffer
      ); // \r\n.\r\n
    }

    // End data mode.
    this._dataMode = false;

    return this.waitDrain;
  }

  // PRIVATE METHODS

  /**
   * Queue some data from the server for parsing.
   *
   * @param {string} chunk Chunk of data received from the server
   */
  _parse(chunk) {
    // Lines should always end with <CR><LF> but you never know, might be only <LF> as well
    var lines = (this._parseRemainder + (chunk || "")).split(/\r?\n/);
    this._parseRemainder = lines.pop(); // not sure if the line has completely arrived yet

    for (let i = 0, len = lines.length; i < len; i++) {
      if (!lines[i].trim()) {
        // nothing to check, empty line
        continue;
      }

      // possible input strings for the regex:
      // 250-MULTILINE REPLY
      // 250 LAST LINE OF REPLY
      // 250 1.2.3 MESSAGE

      const match = lines[i].match(
        /^(\d{3})([- ])(?:(\d+\.\d+\.\d+)(?: ))?(.*)/
      );

      if (match) {
        this._parseBlock.data.push(match[4]);

        if (match[2] === "-") {
          // this is a multiline reply
          this._parseBlock.statusCode =
            this._parseBlock.statusCode || Number(match[1]);
        } else {
          const statusCode = Number(match[1]) || 0;
          const response = {
            statusCode,
            data: this._parseBlock.data.join("\n"),
            // Success means can move to the next step. Though 3xx is not
            // failure, we don't consider it success here.
            success: statusCode >= 200 && statusCode < 300,
          };

          this._onCommand(response);
          this._parseBlock = {
            data: [],
            statusCode: null,
          };
        }
      } else {
        this._onCommand({
          success: false,
          statusCode: this._parseBlock.statusCode || null,
          data: [lines[i]].join("\n"),
        });
        this._parseBlock = {
          data: [],
          statusCode: null,
        };
      }
    }
  }

  // EVENT HANDLERS FOR THE SOCKET

  /**
   * Connection listener that is run when the connection to the server is opened.
   * Sets up different event handlers for the opened socket
   */
  _onOpen = () => {
    this.logger.debug("Connected");

    this.socket.ondata = this._onData;
    this.socket.onclose = this._onClose;
    this.socket.ondrain = this._onDrain;

    this._currentAction = this._actionGreeting;
    this.socket.transport.setTimeout(
      Ci.nsISocketTransport.TIMEOUT_READ_WRITE,
      Services.prefs.getIntPref("mailnews.tcptimeout")
    );
  };

  /**
   * Data listener for chunks of data emitted by the server
   *
   * @param {Event} evt - Event object. See `evt.data` for the chunk received
   */
  _onData = async evt => {
    const stringPayload = new TextDecoder("UTF-8").decode(
      new Uint8Array(evt.data)
    );
    // "S: " to denote that this is data from the Server.
    this.logger.debug(`S: ${stringPayload}`);

    // Prevent blocking the main thread, otherwise onclose/onerror may not be
    // called in time. test_smtpPasswordFailure3 is such a case, the server
    // rejects AUTH PLAIN then closes the connection, the client then sends AUTH
    // LOGIN. This line guarantees onclose is called before sending AUTH LOGIN.
    await new Promise(resolve => setTimeout(resolve));
    this._parse(stringPayload);
  };

  /**
   * More data can be buffered in the socket, `waitDrain` is reset to false
   */
  _onDrain = () => {
    this.waitDrain = false;
    this.ondrain();
  };

  /**
   * Error handler. Emits an nsresult value.
   *
   * @param {Error|TCPSocketErrorEvent} event - An Error or TCPSocketErrorEvent object.
   */
  _onError = async event => {
    this.logger.error(`${event.name}: a ${event.message} error occurred`);
    if (this._freed) {
      // Ignore socket errors if already freed.
      return;
    }

    this._free();
    this.quit();

    let nsError = Cr.NS_ERROR_FAILURE;
    let secInfo = null;
    if (TCPSocketErrorEvent.isInstance(event)) {
      nsError = event.errorCode;
      secInfo =
        await event.target.transport?.tlsSocketControl?.asyncGetSecurityInfo();
      if (secInfo) {
        this.logger.error(`SecurityError info: ${secInfo.errorCodeString}`);
        if (secInfo.failedCertChain.length) {
          const chain = secInfo.failedCertChain.map(c => {
            return c.commonName + "; serial# " + c.serialNumber;
          });
          this.logger.error(`SecurityError cert chain: ${chain.join(" <- ")}`);
        }
        this._server.closeCachedConnections();
      }
    }

    // Use nsresult to integrate with other parts of sending process, e.g.
    // MessageSend.sys.mjs will show an error message depending on the nsresult.
    this.onerror(nsError, "", secInfo);
  };

  /**
   * Error handler. Emits an nsresult value.
   *
   * @param {nsresult} nsError - A nsresult.
   * @param {string} errorParam - Param to form the error message.
   * @param {string} [extra] - Some messages take two arguments to format.
   * @param {number} [statusCode] - Only needed when checking need to retry.
   */
  _onNsError(nsError, errorParam, extra, statusCode) {
    // First check if handling an error response that might need a retry.
    if ([this._actionMAIL, this._actionRCPT].includes(this._currentAction)) {
      if (statusCode >= 400 && statusCode < 500) {
        // Possibly too many recipients, too many messages, to much data
        // or too much time has elapsed on this connection.
        if (!this.isRetry) {
          // Now seeing error 4xx meaning that the current message can't be
          // accepted. We close the connection and try again to send on a new
          // connection using this same client instance. If the retry also
          // fails on the new connection, we give up and report the error.
          this.logger.debug("Retry send on new connection.");
          this.quit();
          this.isRetry = true; // flag that we will retry on new connection
          this.close(true);
          this.connect();
          return; // return without reporting the error yet
        }
      }
    }

    const errorName = MsgUtils.getErrorStringName(nsError);
    let errorMessage = "";
    if (
      [
        MsgUtils.NS_ERROR_SMTP_SERVER_ERROR,
        MsgUtils.NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED,
        MsgUtils.NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2,
        MsgUtils.NS_ERROR_SENDING_FROM_COMMAND,
        MsgUtils.NS_ERROR_SENDING_RCPT_COMMAND,
        MsgUtils.NS_ERROR_SENDING_DATA_COMMAND,
        MsgUtils.NS_ERROR_SENDING_MESSAGE,
        MsgUtils.NS_ERROR_ILLEGAL_LOCALPART,
      ].includes(nsError)
    ) {
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messengercompose/composeMsgs.properties"
      );
      if (nsError == MsgUtils.NS_ERROR_ILLEGAL_LOCALPART) {
        errorMessage = bundle
          .GetStringFromName(errorName)
          .replace("%s", errorParam);
      } else {
        errorMessage = bundle.formatStringFromName(errorName, [
          errorParam,
          extra,
        ]);
      }
    }
    this.onerror(nsError, errorMessage);
    this.close();
  }

  /**
   * Indicates that the socket has been closed
   */
  _onClose = () => {
    this.logger.debug("Socket closed.");
    this._free();
    if (this._authenticating) {
      // In some cases, socket is closed for invalid username/password.
      this._onAuthFailed({ data: "Socket closed." });
    }
  };

  /**
   * This is not a socket data handler but the handler for data emitted by the parser,
   * so this data is safe to use as it is always complete (server might send partial chunks)
   *
   * @param {object} command - Parsed data.
   */
  _onCommand(command) {
    if (command.statusCode < 200 || command.statusCode >= 400) {
      // @see https://datatracker.ietf.org/doc/html/rfc5321#section-3.8
      // 421: SMTP service shutting down and closing transmission channel.
      // When that happens during idle, just close the connection.
      if (
        command.statusCode == 421 &&
        this._currentAction == this._actionIdle
      ) {
        this.close(true);
        return;
      }

      this.logger.error(
        `Command failed: ${command.statusCode} ${command.data}; currentAction=${this._currentAction?.name}`
      );
    }
    if (typeof this._currentAction === "function") {
      this._currentAction(command);
    }
  }

  /**
   * This client has finished the current process and ready to be reused.
   */
  _free() {
    if (!this._freed) {
      this._freed = true;
      this.onFree();
    }
  }

  /**
   * Sends a string to the socket.
   *
   * @param {string} chunk ASCII string (quoted-printable, base64 etc.) to be sent to the server
   * @returns {boolean} If true, it is safe to send more data, if false, you *should* wait for the ondrain event before sending more
   */
  _sendString(chunk) {
    // escape dots
    if (!this.options.disableEscaping) {
      chunk = chunk.replace(/\n\./g, "\n..");
      if (
        (this._lastDataBytes.substr(-1) === "\n" || !this._lastDataBytes) &&
        chunk.charAt(0) === "."
      ) {
        chunk = "." + chunk;
      }
    }

    // Keeping eye on the last bytes sent, to see if there is a <CR><LF> sequence
    // at the end which is needed to end the data stream
    if (chunk.length > 2) {
      this._lastDataBytes = chunk.substr(-2);
    } else if (chunk.length === 1) {
      this._lastDataBytes = this._lastDataBytes.substr(-1) + chunk;
    }

    this.logger.debug("Sending " + chunk.length + " bytes of payload");

    // pass the chunk to the socket
    this.waitDrain = this._send(
      MailStringUtils.byteStringToUint8Array(chunk).buffer
    );
    return this.waitDrain;
  }

  /**
   * Send a string command to the server, also append CRLF if needed.
   *
   * @param {string} str - String to be sent to the server.
   * @param {boolean} [suppressLogging=false] - If true and not in dev mode,
   *   do not log the str. For non-release builds output won't be suppressed,
   *   so that debugging auth problems is easier.
   */
  _sendCommand(str, suppressLogging = false) {
    if (this.socket.readyState !== "open") {
      if (str != "QUIT") {
        this.logger.warn(
          `Failed to send "${str}" because socket state is ${this.socket.readyState}`
        );
      }
      return;
    }
    // "C: " is used to denote that this is data from the Client.
    if (suppressLogging && AppConstants.MOZ_UPDATE_CHANNEL != "default") {
      this.logger.debug(
        "C: Logging suppressed (it probably contained auth information)"
      );
    } else {
      this.logger.debug(`C: ${str}`);
    }
    this.waitDrain = this._send(
      new TextEncoder().encode(str + (str.substr(-2) !== "\r\n" ? "\r\n" : ""))
        .buffer
    );
  }

  _send(buffer) {
    return this.socket.send(buffer);
  }

  /**
   * Intitiate authentication sequence if needed
   *
   * @param {boolean} forceNewPassword - Discard cached password.
   */
  async _authenticateUser(forceNewPassword) {
    if (
      this._preferredAuthMethods.length == 0 ||
      this._supportedAuthMethods.length == 0
    ) {
      // no need to authenticate, at least no data given
      this._currentAction = this._actionIdle;
      this.onidle(); // ready to take orders
      return;
    }

    if (!this._nextAuthMethod) {
      this._onAuthFailed({ data: "No available auth method." });
      return;
    }

    this._authenticating = true;

    this._currentAuthMethod = this._nextAuthMethod;
    this._nextAuthMethod =
      this._possibleAuthMethods[
        this._possibleAuthMethods.indexOf(this._currentAuthMethod) + 1
      ];
    this.logger.debug(`Current auth method: ${this._currentAuthMethod}`);

    switch (this._currentAuthMethod) {
      case "LOGIN":
        // LOGIN is a 3 step authentication process
        // C: AUTH LOGIN
        // C: BASE64(USER)
        // C: BASE64(PASS)
        this.logger.debug("Authentication via AUTH LOGIN");
        this._currentAction = this._actionAUTH_LOGIN_USER;
        this._sendCommand("AUTH LOGIN");
        return;
      case "PLAIN":
        // AUTH PLAIN is a 1 step authentication process
        // C: AUTH PLAIN BASE64(\0 USER \0 PASS)
        this.logger.debug("Authentication via AUTH PLAIN");
        this._currentAction = this._actionAUTHComplete;
        this._sendCommand(
          "AUTH PLAIN " + this._authenticator.getPlainToken(),
          true
        );
        return;
      case "CRAM-MD5":
        this.logger.debug("Authentication via AUTH CRAM-MD5");
        this._currentAction = this._actionAUTH_CRAM;
        this._sendCommand("AUTH CRAM-MD5");
        return;
      case "XOAUTH2": {
        // See https://developers.google.com/gmail/xoauth2_protocol#smtp_protocol_exchange
        this.logger.debug("Authentication via AUTH XOAUTH2");
        this._currentAction = this._actionAUTH_XOAUTH2;
        const oauthToken = await this._authenticator.getOAuthToken();
        this._sendCommand("AUTH XOAUTH2 " + oauthToken, true);
        return;
      }
      case "GSSAPI": {
        this.logger.debug("Authentication via AUTH GSSAPI");
        this._currentAction = this._actionAUTH_GSSAPI;
        this._authenticator.initGssapiAuth("smtp");
        // Don't send first token until we get a 334 continuation response.
        // This avoids sending a line that is possibly rejected as too long.
        this._sendCommand("AUTH GSSAPI", true);
        return;
      }
      case "NTLM": {
        this.logger.debug("Authentication via AUTH NTLM");
        this._currentAction = this._actionAUTH_NTLM;
        this._authenticator.initNtlmAuth("smtp");
        let token;
        try {
          token = this._authenticator.getNextNtlmToken("");
        } catch (e) {
          this.logger.error(e);
          this._actionAUTHComplete({ success: false, data: "AUTH NTLM" });
          return;
        }
        this._sendCommand(`AUTH NTLM ${token}`, true);
        return;
      }
    }

    this._onAuthFailed({
      data: `Unknown authentication method ${this._currentAuthMethod}`,
    });
  }

  _onAuthFailed(command) {
    this.logger.error(`Authentication failed: ${command.data}`);
    if (!this._freed) {
      if (this._nextAuthMethod) {
        // Try the next auth method.
        this._authenticateUser();
        return;
      } else if (!this._currentAuthMethod) {
        // No auth method was even tried.
        let err;
        if (
          this._server.authMethod == Ci.nsMsgAuthMethod.passwordEncrypted &&
          (this._supportedAuthMethods.includes("PLAIN") ||
            this._supportedAuthMethods.includes("LOGIN"))
        ) {
          // Pref has encrypted password, server claims to support plaintext
          // password.
          err = [
            Ci.nsMsgSocketType.alwaysSTARTTLS,
            Ci.nsMsgSocketType.SSL,
          ].includes(this._server.socketType)
            ? MsgUtils.NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL
            : MsgUtils.NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL;
        } else if (
          this._server.authMethod == Ci.nsMsgAuthMethod.passwordCleartext &&
          this._supportedAuthMethods.includes("CRAM-MD5")
        ) {
          // Pref has plaintext password, server claims to support encrypted
          // password.
          err = MsgUtils.NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT;
        } else {
          err = MsgUtils.NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED;
        }
        this._onNsError(err);
        return;
      }
    }

    // Ask user what to do.
    const action = this._authenticator.promptAuthFailed();
    if (action == 1) {
      // Cancel button pressed.
      this.logger.error(`Authentication failed: ${command.data}`);
      this._onNsError(MsgUtils.NS_ERROR_SMTP_AUTH_FAILURE);
      return;
    } else if (action == 2) {
      // 'New password' button pressed. Forget cached password, new password
      // will be asked.
      this._authenticator.forgetPassword();
    }

    if (this._freed) {
      // If connection is lost, reconnect.
      this.connect();
      return;
    }

    // Reset _nextAuthMethod to start again.
    this._nextAuthMethod = this._possibleAuthMethods[0];
    if (action == 2 || action == 0) {
      // action = 0 means retry button pressed.
      this._authenticateUser();
    }
  }

  _getHelloArgument() {
    const helloArgument = this._server.helloArgument;
    if (helloArgument) {
      return helloArgument;
    }

    try {
      // The address format follows rfc5321#section-4.1.3.
      const netAddr = this.socket?.transport.getScriptableSelfAddr();
      const address = netAddr.address;
      if (netAddr.family === Ci.nsINetAddr.FAMILY_INET6) {
        return `[IPV6:${address}]`;
      }
      return `[${address}]`;
    } catch (e) {}

    return "[127.0.0.1]";
  }

  // ACTIONS FOR RESPONSES FROM THE SMTP SERVER

  /**
   * Initial response from the server, must have a status 220
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionGreeting(command) {
    if (command.statusCode !== 220) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
      return;
    }

    if (this.options.lmtp) {
      this._currentAction = this._actionLHLO;
      this._sendCommand("LHLO " + this._getHelloArgument());
    } else {
      this._currentAction = this._actionEHLO;
      this._sendCommand("EHLO " + this._getHelloArgument());
    }
  }

  /**
   * Response to LHLO
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionLHLO(command) {
    if (!command.success) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
      return;
    }

    // Process as EHLO response
    this._actionEHLO(command);
  }

  /**
   * Response to EHLO. If the response is an error, try HELO instead
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionEHLO(command) {
    if ([500, 502].includes(command.statusCode)) {
      // EHLO is not implemented by the server.
      if (this.options.alwaysSTARTTLS) {
        // If alwaysSTARTTLS is set by the user, EHLO is required to advertise it.
        this._onNsError(MsgUtils.NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS);
        return;
      }

      // Try HELO instead
      this.logger.warn(
        "EHLO not successful, trying HELO " + this._getHelloArgument()
      );
      this._currentAction = this._actionHELO;
      this._sendCommand("HELO " + this._getHelloArgument());
      return;
    } else if (!command.success) {
      // 501 Syntax error or some other error.
      this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
      return;
    }

    this._supportedAuthMethods = [];

    const lines = command.data.toUpperCase().split("\n");
    // Skip the first greeting line.
    for (const line of lines.slice(1)) {
      if (line.startsWith("AUTH ")) {
        this._supportedAuthMethods = line.slice(5).split(" ");
      } else {
        this._capabilities.push(line.split(" ")[0]);
      }
    }

    if (!this._secureTransport && this.options.alwaysSTARTTLS) {
      // STARTTLS is required by the user. Detect if the server supports it.
      if (this._capabilities.includes("STARTTLS")) {
        this._currentAction = this._actionSTARTTLS;
        this._sendCommand("STARTTLS");
        return;
      }
      // STARTTLS is required but not advertised.
      this._onNsError(MsgUtils.NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS);
      return;
    }

    // If a preferred method is not supported by the server, no need to try it.
    this._possibleAuthMethods = this._preferredAuthMethods.filter(x =>
      this._supportedAuthMethods.includes(x)
    );
    this.logger.debug(`Possible auth methods: ${this._possibleAuthMethods}`);
    this._nextAuthMethod = this._possibleAuthMethods[0];

    if (
      this._capabilities.includes("CLIENTID") &&
      (this._secureTransport ||
        // For test purpose.
        ["localhost", "127.0.0.1", "::1"].includes(this._server.hostname)) &&
      this._server.clientidEnabled &&
      this._server.clientid
    ) {
      // Client identity extension, still a draft.
      this._currentAction = this._actionCLIENTID;
      this._sendCommand("CLIENTID UUID " + this._server.clientid, true);
    } else {
      this._authenticateUser();
    }
  }

  /**
   * Handles server response for STARTTLS command. If there's an error
   * try HELO instead, otherwise initiate TLS upgrade. If the upgrade
   * succeeds restart the EHLO
   *
   * @param {string} command - Message from the server.
   */
  _actionSTARTTLS(command) {
    if (!command.success) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
      return;
    }

    this.socket.upgradeToSecure();
    this._secureTransport = true;

    // restart protocol flow
    this._currentAction = this._actionEHLO;
    this._sendCommand("EHLO " + this._getHelloArgument());
  }

  /**
   * Response to HELO
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionHELO(command) {
    if (!command.success) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
      return;
    }
    this._authenticateUser();
  }

  /**
   * Handles server response for CLIENTID command. If successful then will
   * initiate the authenticateUser process.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionCLIENTID(command) {
    if (!command.success) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
      return;
    }
    this._authenticateUser();
  }

  /**
   * Returns the saved/cached server password, or show a password dialog. If the
   * user cancels the dialog, abort sending.
   *
   * @returns {string} The server password.
   */
  _getPassword() {
    try {
      return this._authenticator.getPassword();
    } catch (e) {
      if (e.result == Cr.NS_ERROR_ABORT) {
        this.quit();
        this.onerror(e.result);
      } else {
        throw e;
      }
    }
    return null;
  }

  /**
   * Response to AUTH LOGIN, if successful expects base64 encoded username
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_LOGIN_USER(command) {
    if (command.statusCode !== 334 || command.data !== "VXNlcm5hbWU6") {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_AUTH_FAILURE, command.data);
      return;
    }
    this.logger.debug("AUTH LOGIN USER");
    this._currentAction = this._actionAUTH_LOGIN_PASS;
    this._sendCommand(btoa(this._authenticator.username), true);
  }

  /**
   * Process the response to AUTH LOGIN with a username. If successful, expects
   * a base64-encoded password.
   *
   * @param {{statusCode: number, data: string}} command - Parsed command from
   *   the server.
   */
  _actionAUTH_LOGIN_PASS(command) {
    if (
      command.statusCode !== 334 ||
      (command.data !== btoa("Password:") && command.data !== btoa("password:"))
    ) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_AUTH_FAILURE, command.data);
      return;
    }
    this.logger.debug("AUTH LOGIN PASS");
    this._currentAction = this._actionAUTHComplete;
    let password = this._getPassword();
    if (
      !Services.prefs.getBoolPref(
        "mail.smtp_login_pop3_user_pass_auth_is_latin1",
        true
      ) ||
      !/^[\x00-\xFF]+$/.test(password) // eslint-disable-line no-control-regex
    ) {
      // Unlike PLAIN auth, the payload of LOGIN auth is not standardized. When
      // `mail.smtp_login_pop3_user_pass_auth_is_latin1` is true, we apply
      // base64 encoding directly. Otherwise, we convert it to UTF-8
      // BinaryString first.
      password = MailStringUtils.stringToByteString(password);
    }
    this._sendCommand(btoa(password), true);
  }

  /**
   * Response to AUTH CRAM, if successful expects base64 encoded challenge.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  async _actionAUTH_CRAM(command) {
    if (command.statusCode !== 334) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_AUTH_FAILURE, command.data);
      return;
    }
    this._currentAction = this._actionAUTHComplete;
    this._sendCommand(
      this._authenticator.getCramMd5Token(this._getPassword(), command.data),
      true
    );
  }

  /**
   * Response to AUTH XOAUTH2 token, if error occurs send empty response
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_XOAUTH2(command) {
    if (!command.success) {
      this.logger.warn("Error during AUTH XOAUTH2, sending empty response");
      this._sendCommand("");
      this._currentAction = this._actionAUTHComplete;
    } else {
      this._actionAUTHComplete(command);
    }
  }

  /**
   * Response to AUTH GSSAPI, if successful expects a base64 encoded challenge.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_GSSAPI(command) {
    // GSSAPI auth can be multiple steps. We exchange tokens with the server
    // until success or failure.
    if (command.success) {
      this._actionAUTHComplete(command);
      return;
    }
    if (command.statusCode !== 334) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_AUTH_GSSAPI, command.data);
      return;
    }
    let token;
    try {
      token = this._authenticator.getNextGssapiToken(command.data);
    } catch (e) {
      this.logger.error(e);
      this._actionAUTHComplete({ success: false, data: "AUTH GSSAPI" });
      return;
    }
    this._currentAction = this._actionAUTH_GSSAPI;
    this._sendCommand(token, true);
  }

  /**
   * Response to AUTH NTLM, if successful expects a base64 encoded challenge.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_NTLM(command) {
    // NTLM auth can be multiple steps. We exchange tokens with the server
    // until success or failure.
    if (command.success) {
      this._actionAUTHComplete(command);
      return;
    }
    if (command.statusCode !== 334) {
      this._onNsError(MsgUtils.NS_ERROR_SMTP_AUTH_FAILURE, command.data);
      return;
    }
    const token = this._authenticator.getNextNtlmToken(command.data);
    this._currentAction = this._actionAUTH_NTLM;
    this._sendCommand(token, true);
  }

  /**
   * Checks if authentication succeeded or not. If successfully authenticated
   * emit `idle` to indicate that an e-mail can be sent using this connection
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTHComplete(command) {
    this._authenticating = false;
    if (!command.success) {
      this._onAuthFailed(command);
      return;
    }

    this.logger.debug("Authentication successful.");

    this._currentAction = this._actionIdle;
    this.onidle(); // ready to take orders
  }

  /**
   * Used when the connection is idle, not expecting anything from the server.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionIdle(command) {
    this._onNsError(MsgUtils.NS_ERROR_SMTP_SERVER_ERROR, command.data);
  }

  /**
   * Response to MAIL FROM command. Proceed to defining RCPT TO list if successful
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionMAIL(command) {
    if (!command.success) {
      let errorCode = MsgUtils.NS_ERROR_SENDING_FROM_COMMAND; // default code
      if (command.statusCode == 552) {
        // Too much mail data indicated by "size" parameter of MAIL FROM.
        // @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.1.9
        errorCode = MsgUtils.NS_ERROR_SMTP_PERM_SIZE_EXCEEDED_2;
      }
      if (command.statusCode == 452 || command.statusCode == 451) {
        // @see https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.1.10
        errorCode = MsgUtils.NS_ERROR_SMTP_TEMP_SIZE_EXCEEDED;
      }
      this._onNsError(errorCode, command.data, null, command.statusCode);
      return;
    }
    this.logger.debug(
      "MAIL FROM successful, proceeding with " +
        this._envelope.rcptQueue.length +
        " recipients"
    );
    this.logger.debug("Adding recipient...");
    this._envelope.curRecipient = this._envelope.rcptQueue.shift();
    this._currentAction = this._actionRCPT;
    this._sendCommand(
      `RCPT TO:<${this._envelope.curRecipient}>${this._getRCPTParameters()}`
    );
  }

  /**
   * Prepare the RCPT params, currently only DSN params. If the server supports
   * DSN and sender requested DSN, append DSN params to each RCPT TO command.
   */
  _getRCPTParameters() {
    if (this._capabilities.includes("DSN") && this._envelope.requestDSN) {
      const notify = [];
      if (Services.prefs.getBoolPref("mail.dsn.request_never_on")) {
        notify.push("NEVER");
      } else {
        if (Services.prefs.getBoolPref("mail.dsn.request_on_success_on")) {
          notify.push("SUCCESS");
        }
        if (Services.prefs.getBoolPref("mail.dsn.request_on_failure_on")) {
          notify.push("FAILURE");
        }
        if (Services.prefs.getBoolPref("mail.dsn.request_on_delay_on")) {
          notify.push("DELAY");
        }
      }
      if (notify.length > 0) {
        return ` NOTIFY=${notify.join(",")}`;
      }
    }
    return "";
  }

  /**
   * Response to a RCPT TO command. If the command is unsuccessful, emit an
   * error to abort the sending.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionRCPT(command) {
    if (!command.success) {
      this._onNsError(
        MsgUtils.NS_ERROR_SENDING_RCPT_COMMAND,
        command.data,
        this._envelope.curRecipient,
        command.statusCode
      );
      return;
    }
    this.rcptCount++;
    this._envelope.responseQueue.push(this._envelope.curRecipient);

    if (this._envelope.rcptQueue.length) {
      // Send the next recipient.
      this._envelope.curRecipient = this._envelope.rcptQueue.shift();
      this._currentAction = this._actionRCPT;
      this._sendCommand(
        `RCPT TO:<${this._envelope.curRecipient}>${this._getRCPTParameters()}`
      );
    } else {
      this.logger.debug(
        `Total RCPTs during this connection: ${this.rcptCount}`
      );
      this.logger.debug("RCPT TO done. Proceeding with payload.");
      this._currentAction = this._actionDATA;
      this._sendCommand("DATA");
    }
  }

  /**
   * Response to the DATA command. Server is now waiting for a message, so emit `onready`
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionDATA(command) {
    // response should be 354 but according to this issue https://github.com/eleith/emailjs/issues/24
    // some servers might use 250 instead
    if (![250, 354].includes(command.statusCode)) {
      this._onNsError(MsgUtils.NS_ERROR_SENDING_DATA_COMMAND, command.data);
      return;
    }

    this._dataMode = true;
    this._currentAction = this._actionIdle;
    this.onready(this._envelope.rcptFailed);
  }

  /**
   * Response from the server, once the message stream has ended with <CR><LF>.<CR><LF>
   * Emits `ondone`.
   *
   * @param {object} command Parsed command from the server {statusCode, data}
   */
  _actionStream(command) {
    var rcpt;

    if (this.options.lmtp) {
      // LMTP returns a response code for *every* successfully set recipient
      // For every recipient the message might succeed or fail individually

      rcpt = this._envelope.responseQueue.shift();
      if (!command.success) {
        this.logger.error("Local delivery to " + rcpt + " failed.");
        this._envelope.rcptFailed.push(rcpt);
      } else {
        this.logger.error("Local delivery to " + rcpt + " succeeded.");
      }

      if (this._envelope.responseQueue.length) {
        this._currentAction = this._actionStream;
        return;
      }

      this._currentAction = this._actionIdle;
      this.ondone(0);
    } else {
      // For SMTP the message either fails or succeeds, there is no information
      // about individual recipients

      if (!command.success) {
        this.logger.error("Message sending failed.");
      } else {
        this.logger.debug("Message sent successfully.");
        this.isRetry = false;
      }
      this._numMessages++; // Number of messages sent on current connection.

      // Recipient count has reached the limit or message count per connection
      // is enabled and has reached the limit, set flag to cause QUIT to be
      // sent by onFree() called below.
      if (
        this.rcptCount > 99 ||
        (this._messagesPerConnection > 0 &&
          this._numMessages >= this._messagesPerConnection)
      ) {
        this.reuseConnection = false;
      }

      // If reuseConnection is set false above, don't start the QUIT timer
      // below since the connection will be closed and a new connection
      // established.
      // If reuseConnection is true, the timer will be started. It will only
      // timeout and send QUIT if another message is NOT sent within the set
      // time. Also, if another send becomes active right before the timeout
      // occurs, don't send the QUIT.
      if (this.reuseConnection) {
        this._server.sendIsActive = false;
        this.logger.debug("Start 5 second QUIT timer");
        this._quitTimer = setTimeout(() => {
          if (this.socket?.readyState == "open" && !this._server.sendIsActive) {
            this.quit();
          }
          this._quitTimer = null;
        }, 5000);
      }

      this._currentAction = this._actionIdle;
      if (command.success) {
        this.ondone(0);
      } else {
        this._onNsError(MsgUtils.NS_ERROR_SENDING_MESSAGE, command.data);
      }
    }

    this._freed = true;
    this.onFree();
  }
}
