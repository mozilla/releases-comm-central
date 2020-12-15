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

const EXPORTED_SYMBOLS = ["SmtpClient"];

var { setTimeout, clearTimeout } = ChromeUtils.import(
  "resource://gre/modules/Timer.jsm"
);
var { SmtpAuthenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);

var encode = btoa;
var DEBUG_TAG = "SMTP Client";

/**
 * Lower Bound for socket timeout to wait since the last data was written to a socket
 */
const TIMEOUT_SOCKET_LOWER_BOUND = 10000;

/**
 * Multiplier for socket timeout:
 *
 * We assume at least a GPRS connection with 115 kb/s = 14,375 kB/s tops, so 10 KB/s to be on
 * the safe side. We can timeout after a lower bound of 10s + (n KB / 10 KB/s). A 1 MB message
 * upload would be 110 seconds to wait for the timeout. 10 KB/s === 0.1 s/B
 */
const TIMEOUT_SOCKET_MULTIPLIER = 0.1;

class SmtpClient {
  /**
   * Creates a connection object to a SMTP server and allows to send mail through it.
   * Call `connect` method to inititate the actual connection, the constructor only
   * defines the properties but does not actually connect.
   *
   * @constructor
   *
   * @param {nsISmtpServer} server - The associated nsISmtpServer instance.
   */
  constructor(server) {
    let authMethod = {
      [Ci.nsMsgAuthMethod.passwordCleartext]: "PLAIN",
      [Ci.nsMsgAuthMethod.passwordEncrypted]: "LOGIN",
      [Ci.nsMsgAuthMethod.OAuth2]: "XOAUTH2",
    }[server.authMethod];
    this.options = {
      ignoreTLS: server.socketType == Ci.nsMsgSocketType.plain,
      requireTLS: server.socketType == Ci.nsMsgSocketType.SSL,
      authMethod,
    };

    this.timeoutSocketLowerBound = TIMEOUT_SOCKET_LOWER_BOUND;
    this.timeoutSocketMultiplier = TIMEOUT_SOCKET_MULTIPLIER;

    this.port = server.port || (this.options.useSecureTransport ? 465 : 25);
    this.host = server.hostname;

    this._authenticator = new SmtpAuthenticator(server);

    /**
     * If set to true, start an encrypted connection instead of the plaintext one
     * (recommended if applicable). If useSecureTransport is not set but the port used is 465,
     * then ecryption is used by default.
     */
    this.options.useSecureTransport =
      "useSecureTransport" in this.options
        ? !!this.options.useSecureTransport
        : this.port === 465;

    this.options.name = this.options.name || "localhost"; // Hostname of the client, this will be used for introducing to the server
    this.socket = false; // Downstream TCP socket to the SMTP server, created with mozTCPSocket
    this.destroyed = false; // Indicates if the connection has been closed and can't be used anymore
    this.waitDrain = false; // Keeps track if the downstream socket is currently full and a drain event should be waited for or not

    // Private properties

    this._supportedAuth = []; // A list of authentication mechanisms detected from the EHLO response and which are compatible with this library
    this._dataMode = false; // If true, accepts data from the upstream to be passed directly to the downstream socket. Used after the DATA command
    this._lastDataBytes = ""; // Keep track of the last bytes to see how the terminating dot should be placed
    this._envelope = null; // Envelope object for tracking who is sending mail to whom
    this._currentAction = null; // Stores the function that should be run after a response has been received from the server
    this._secureMode = !!this.options.useSecureTransport; // Indicates if the connection is secured or plaintext
    this._socketTimeoutTimer = false; // Timer waiting to declare the socket dead starting from the last write
    this._socketTimeoutStart = false; // Start time of sending the first packet in data mode
    this._socketTimeoutPeriod = false; // Timeout for sending in data mode, gets extended with every send()

    this._parseBlock = { data: [], statusCode: null };
    this._parseRemainder = ""; // If the complete line is not received yet, contains the beginning of it

    this.logger = console.createInstance({
      prefix: "mailnews.smtp",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mailnews.smtp.loglevel",
    });

    // Event placeholders
    this.onerror = e => {}; // Will be run when an error occurs. The `onclose` event will fire subsequently.
    this.ondrain = () => {}; // More data can be buffered in the socket.
    this.onclose = () => {}; // The connection to the server has been closed
    this.onidle = () => {}; // The connection is established and idle, you can send mail now
    this.onready = failedRecipients => {}; // Waiting for mail body, lists addresses that were not accepted as recipients
    this.ondone = success => {}; // The mail has been sent. Wait for `onidle` next. Indicates if the message was queued by the server.
  }

  /**
   * Initiate a connection to the server
   */
  connect(SocketContructor = TCPSocket) {
    this.socket = new SocketContructor(this.host, this.port, {
      binaryType: "arraybuffer",
      useSecureTransport: this._secureMode,
      ca: this.options.ca,
      tlsWorkerPath: this.options.tlsWorkerPath,
      ws: this.options.ws,
    });

    // allows certificate handling for platform w/o native tls support
    // oncert is non standard so setting it might throw if the socket object is immutable
    try {
      this.socket.oncert = this.oncert;
    } catch (E) {}
    this.socket.onerror = this._onError.bind(this);
    this.socket.onopen = this._onOpen.bind(this);
  }

  /**
   * Sends QUIT
   */
  quit() {
    this.logger.debug(DEBUG_TAG, "Sending QUIT...");
    this._sendCommand("QUIT");
    this._currentAction = this.close;
  }

  /**
   * Closes the connection to the server
   */
  close() {
    this.logger.debug(DEBUG_TAG, "Closing connection...");
    if (this.socket && this.socket.readyState === "open") {
      this.socket.close();
    } else {
      this._destroy();
    }
  }

  // Mail related methods

  /**
   * Initiates a new message by submitting envelope data, starting with
   * `MAIL FROM:` command. Use after `onidle` event
   *
   * @param {Object} envelope Envelope object in the form of {from:"...", to:["..."]}
   */
  useEnvelope(envelope) {
    this._envelope = envelope || {};
    this._envelope.from = [].concat(
      this._envelope.from || "anonymous@" + this.options.name
    )[0];
    this._envelope.to = [].concat(this._envelope.to || []);

    // clone the recipients array for latter manipulation
    this._envelope.rcptQueue = [].concat(this._envelope.to);
    this._envelope.rcptFailed = [];
    this._envelope.responseQueue = [];

    this._currentAction = this._actionMAIL;
    this.logger.debug(DEBUG_TAG, "Sending MAIL FROM...");
    this._sendCommand("MAIL FROM:<" + this._envelope.from + ">");
  }

  /**
   * Send ASCII data to the server. Works only in data mode (after `onready` event), ignored
   * otherwise
   *
   * @param {String} chunk ASCII string (quoted-printable, base64 etc.) to be sent to the server
   * @return {Boolean} If true, it is safe to send more data, if false, you *should* wait for the ondrain event before sending more
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

    // end data mode, reset the variables for extending the timeout in data mode
    this._dataMode = false;
    this._socketTimeoutStart = false;
    this._socketTimeoutPeriod = false;

    return this.waitDrain;
  }

  // PRIVATE METHODS

  /**
   * Queue some data from the server for parsing.
   *
   * @param {String} chunk Chunk of data received from the server
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
   *
   * @event
   * @param {Event} evt Event object. Not used
   */
  _onOpen(event) {
    if (event && event.data && event.data.proxyHostname) {
      this.options.name = event.data.proxyHostname;
    }

    this.socket.ondata = this._onData.bind(this);

    this.socket.onclose = this._onClose.bind(this);
    this.socket.ondrain = this._onDrain.bind(this);

    this._currentAction = this._actionGreeting;
  }

  /**
   * Data listener for chunks of data emitted by the server
   *
   * @event
   * @param {Event} evt Event object. See `evt.data` for the chunk received
   */
  _onData(evt) {
    clearTimeout(this._socketTimeoutTimer);
    var stringPayload = new TextDecoder("UTF-8").decode(
      new Uint8Array(evt.data)
    );
    this.logger.debug(DEBUG_TAG, "SERVER: " + stringPayload);
    this._parse(stringPayload);
  }

  /**
   * More data can be buffered in the socket, `waitDrain` is reset to false
   *
   * @event
   * @param {Event} evt Event object. Not used
   */
  _onDrain() {
    this.waitDrain = false;
    this.ondrain();
  }

  /**
   * Error handler for the socket
   *
   * @event
   * @param {Event} evt Event object. See evt.data for the error
   */
  _onError(evt) {
    if (evt instanceof Error && evt.message) {
      this.logger.error(DEBUG_TAG, evt);
      this.onerror(evt);
    } else if (evt && evt.data instanceof Error) {
      this.logger.error(DEBUG_TAG, evt.data);
      this.onerror(evt.data);
    } else {
      this.logger.error(
        DEBUG_TAG,
        new Error(
          (evt && evt.data && evt.data.message) || evt.data || evt || "Error"
        )
      );
      this.onerror(
        new Error(
          (evt && evt.data && evt.data.message) || evt.data || evt || "Error"
        )
      );
    }

    this.close();
  }

  /**
   * Indicates that the socket has been closed
   *
   * @event
   * @param {Event} evt Event object. Not used
   */
  _onClose() {
    this.logger.debug(DEBUG_TAG, "Socket closed.");
    this._destroy();
  }

  /**
   * This is not a socket data handler but the handler for data emitted by the parser,
   * so this data is safe to use as it is always complete (server might send partial chunks)
   *
   * @event
   * @param {Object} command Parsed data
   */
  _onCommand(command) {
    if (typeof this._currentAction === "function") {
      this._currentAction(command);
    }
  }

  _onTimeout() {
    // inform about the timeout and shut down
    var error = new Error("Socket timed out!");
    this._onError(error);
  }

  /**
   * Ensures that the connection is closed and such
   */
  _destroy() {
    clearTimeout(this._socketTimeoutTimer);

    if (!this.destroyed) {
      this.destroyed = true;
      this.onclose();
    }
  }

  /**
   * Sends a string to the socket.
   *
   * @param {String} chunk ASCII string (quoted-printable, base64 etc.) to be sent to the server
   * @return {Boolean} If true, it is safe to send more data, if false, you *should* wait for the ondrain event before sending more
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

    this.logger.debug(
      DEBUG_TAG,
      "Sending " + chunk.length + " bytes of payload"
    );

    // pass the chunk to the socket
    this.waitDrain = this._send(new TextEncoder("UTF-8").encode(chunk).buffer);
    return this.waitDrain;
  }

  /**
   * Send a string command to the server, also append \r\n if needed
   *
   * @param {String} str String to be sent to the server
   */
  _sendCommand(str) {
    this.waitDrain = this._send(
      new TextEncoder("UTF-8").encode(
        str + (str.substr(-2) !== "\r\n" ? "\r\n" : "")
      ).buffer
    );
  }

  _send(buffer) {
    this._setTimeout(buffer.byteLength);
    return this.socket.send(buffer);
  }

  _setTimeout(byteLength) {
    var prolongPeriod = Math.floor(byteLength * this.timeoutSocketMultiplier);
    var timeout;

    if (this._dataMode) {
      // we're in data mode, so we count only one timeout that get extended for every send().
      var now = Date.now();

      // the old timeout start time
      this._socketTimeoutStart = this._socketTimeoutStart || now;

      // the old timeout period, normalized to a minimum of TIMEOUT_SOCKET_LOWER_BOUND
      this._socketTimeoutPeriod =
        (this._socketTimeoutPeriod || this.timeoutSocketLowerBound) +
        prolongPeriod;

      // the new timeout is the delta between the new firing time (= timeout period + timeout start time) and now
      timeout = this._socketTimeoutStart + this._socketTimeoutPeriod - now;
    } else {
      // set new timout
      timeout = this.timeoutSocketLowerBound + prolongPeriod;
    }

    clearTimeout(this._socketTimeoutTimer); // clear pending timeouts
    this._socketTimeoutTimer = setTimeout(this._onTimeout.bind(this), timeout); // arm the next timeout
  }

  /**
   * Intitiate authentication sequence if needed
   */
  async _authenticateUser() {
    if (this._supportedAuth.length == 0) {
      // no need to authenticate, at least no data given
      this._currentAction = this._actionIdle;
      this.onidle(); // ready to take orders
      return;
    }

    var auth;

    if (this.options.authMethod) {
      auth = this.options.authMethod.toUpperCase().trim();
    } else {
      // use first supported
      auth = (this._supportedAuth[0] || "PLAIN").toUpperCase().trim();
    }

    switch (auth) {
      case "LOGIN":
        // LOGIN is a 3 step authentication process
        // C: AUTH LOGIN
        // C: BASE64(USER)
        // C: BASE64(PASS)
        this.logger.debug(DEBUG_TAG, "Authentication via AUTH LOGIN");
        this._currentAction = this._actionAUTH_LOGIN_USER;
        this._sendCommand("AUTH LOGIN");
        return;
      case "PLAIN":
        // AUTH PLAIN is a 1 step authentication process
        // C: AUTH PLAIN BASE64(\0 USER \0 PASS)
        this.logger.debug(DEBUG_TAG, "Authentication via AUTH PLAIN");
        this._currentAction = this._actionAUTHComplete;
        this._sendCommand(
          // convert to BASE64
          "AUTH PLAIN " +
            encode(
              "\u0000" + // skip authorization identity as it causes problems with some servers
                this._authenticator.getUsername() +
                "\u0000" +
                this._authenticator.getPassword()
            )
        );
        return;
      case "XOAUTH2":
        // See https://developers.google.com/gmail/xoauth2_protocol#smtp_protocol_exchange
        this.logger.debug(DEBUG_TAG, "Authentication via AUTH XOAUTH2");
        this._currentAction = this._actionAUTH_XOAUTH2;
        let oauthToken = await this._authenticator.getOAuthToken();
        this._sendCommand("AUTH XOAUTH2 " + oauthToken);
        return;
    }

    this._onError(new Error("Unknown authentication method " + auth));
  }

  // ACTIONS FOR RESPONSES FROM THE SMTP SERVER

  /**
   * Initial response from the server, must have a status 220
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionGreeting(command) {
    if (command.statusCode !== 220) {
      this._onError(new Error("Invalid greeting: " + command.data));
      return;
    }

    if (this.options.lmtp) {
      this.logger.debug(DEBUG_TAG, "Sending LHLO " + this.options.name);

      this._currentAction = this._actionLHLO;
      this._sendCommand("LHLO " + this.options.name);
    } else {
      this.logger.debug(DEBUG_TAG, "Sending EHLO " + this.options.name);

      this._currentAction = this._actionEHLO;
      this._sendCommand("EHLO " + this.options.name);
    }
  }

  /**
   * Response to LHLO
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionLHLO(command) {
    if (!command.success) {
      this.logger.error(DEBUG_TAG, "LHLO not successful");
      this._onError(new Error(command.data));
      return;
    }

    // Process as EHLO response
    this._actionEHLO(command);
  }

  /**
   * Response to EHLO. If the response is an error, try HELO instead
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionEHLO(command) {
    var match;

    if (!command.success) {
      if (!this._secureMode && this.options.requireTLS) {
        var errMsg = "STARTTLS not supported without EHLO";
        this.logger.error(DEBUG_TAG, errMsg);
        this._onError(new Error(errMsg));
        return;
      }

      // Try HELO instead
      this.logger.warn(
        DEBUG_TAG,
        "EHLO not successful, trying HELO " + this.options.name
      );
      this._currentAction = this._actionHELO;
      this._sendCommand("HELO " + this.options.name);
      return;
    }

    // Detect if the server supports PLAIN auth
    if (command.data.match(/AUTH(?:\s+[^\n]*\s+|\s+)PLAIN/i)) {
      this.logger.debug(DEBUG_TAG, "Server supports AUTH PLAIN");
      this._supportedAuth.push("PLAIN");
    }

    // Detect if the server supports LOGIN auth
    if (command.data.match(/AUTH(?:\s+[^\n]*\s+|\s+)LOGIN/i)) {
      this.logger.debug(DEBUG_TAG, "Server supports AUTH LOGIN");
      this._supportedAuth.push("LOGIN");
    }

    // Detect if the server supports XOAUTH2 auth
    if (command.data.match(/AUTH(?:\s+[^\n]*\s+|\s+)XOAUTH2/i)) {
      this.logger.debug(DEBUG_TAG, "Server supports AUTH XOAUTH2");
      this._supportedAuth.push("XOAUTH2");
    }

    // Detect maximum allowed message size
    if ((match = command.data.match(/SIZE (\d+)/i)) && Number(match[1])) {
      const maxAllowedSize = Number(match[1]);
      this.logger.debug(
        DEBUG_TAG,
        "Maximum allowd message size: " + maxAllowedSize
      );
    }

    // Detect if the server supports STARTTLS
    if (!this._secureMode) {
      if (
        (command.data.match(/STARTTLS\s?$/im) && !this.options.ignoreTLS) ||
        !!this.options.requireTLS
      ) {
        this._currentAction = this._actionSTARTTLS;
        this.logger.debug(DEBUG_TAG, "Sending STARTTLS");
        this._sendCommand("STARTTLS");
        return;
      }
    }

    this._authenticateUser();
  }

  /**
   * Handles server response for STARTTLS command. If there's an error
   * try HELO instead, otherwise initiate TLS upgrade. If the upgrade
   * succeedes restart the EHLO
   *
   * @param {String} str Message from the server
   */
  _actionSTARTTLS(command) {
    if (!command.success) {
      this.logger.error(DEBUG_TAG, "STARTTLS not successful");
      this._onError(new Error(command.data));
      return;
    }

    this._secureMode = true;
    this.socket.upgradeToSecure();

    // restart protocol flow
    this._currentAction = this._actionEHLO;
    this._sendCommand("EHLO " + this.options.name);
  }

  /**
   * Response to HELO
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionHELO(command) {
    if (!command.success) {
      this.logger.error(DEBUG_TAG, "HELO not successful");
      this._onError(new Error(command.data));
      return;
    }
    this._authenticateUser();
  }

  /**
   * Response to AUTH LOGIN, if successful expects base64 encoded username
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_LOGIN_USER(command) {
    if (command.statusCode !== 334 || command.data !== "VXNlcm5hbWU6") {
      this.logger.error(
        DEBUG_TAG,
        "AUTH LOGIN USER not successful: " + command.data
      );
      this._onError(
        new Error(
          'Invalid login sequence while waiting for "334 VXNlcm5hbWU6 ": ' +
            command.data
        )
      );
      return;
    }
    this.logger.debug(DEBUG_TAG, "AUTH LOGIN USER successful");
    this._currentAction = this._actionAUTH_LOGIN_PASS;
    this._sendCommand(encode(this._authenticator.getUsername()));
  }

  /**
   * Response to AUTH LOGIN username, if successful expects base64 encoded password
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_LOGIN_PASS(command) {
    if (command.statusCode !== 334 || command.data !== "UGFzc3dvcmQ6") {
      this.logger.error(
        DEBUG_TAG,
        "AUTH LOGIN PASS not successful: " + command.data
      );
      this._onError(
        new Error(
          'Invalid login sequence while waiting for "334 UGFzc3dvcmQ6 ": ' +
            command.data
        )
      );
      return;
    }
    this.logger.debug(DEBUG_TAG, "AUTH LOGIN PASS successful");
    this._currentAction = this._actionAUTHComplete;
    this._sendCommand(encode(this._authenticator.getPassword()));
  }

  /**
   * Response to AUTH XOAUTH2 token, if error occurs send empty response
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTH_XOAUTH2(command) {
    if (!command.success) {
      this.logger.warn(
        DEBUG_TAG,
        "Error during AUTH XOAUTH2, sending empty response"
      );
      this._sendCommand("");
      this._currentAction = this._actionAUTHComplete;
    } else {
      this._actionAUTHComplete(command);
    }
  }

  /**
   * Checks if authentication succeeded or not. If successfully authenticated
   * emit `idle` to indicate that an e-mail can be sent using this connection
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionAUTHComplete(command) {
    if (!command.success) {
      this.logger.debug(DEBUG_TAG, "Authentication failed: " + command.data);
      this._onError(new Error(command.data));
      return;
    }

    this.logger.debug(DEBUG_TAG, "Authentication successful.");

    this._currentAction = this._actionIdle;
    this.onidle(); // ready to take orders
  }

  /**
   * Used when the connection is idle and the server emits timeout
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionIdle(command) {
    if (command.statusCode > 300) {
      this._onError(new Error(command.data));
      return;
    }

    this._onError(new Error(command.data));
  }

  /**
   * Response to MAIL FROM command. Proceed to defining RCPT TO list if successful
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionMAIL(command) {
    if (!command.success) {
      this.logger.debug(DEBUG_TAG, "MAIL FROM unsuccessful: " + command.data);
      this._onError(new Error(command.data));
      return;
    }

    if (!this._envelope.rcptQueue.length) {
      this._onError(new Error("Can't send mail - no recipients defined"));
    } else {
      this.logger.debug(
        DEBUG_TAG,
        "MAIL FROM successful, proceeding with " +
          this._envelope.rcptQueue.length +
          " recipients"
      );
      this.logger.debug(DEBUG_TAG, "Adding recipient...");
      this._envelope.curRecipient = this._envelope.rcptQueue.shift();
      this._currentAction = this._actionRCPT;
      this._sendCommand("RCPT TO:<" + this._envelope.curRecipient + ">");
    }
  }

  /**
   * Response to a RCPT TO command. If the command is unsuccessful, try the next one,
   * as this might be related only to the current recipient, not a global error, so
   * the following recipients might still be valid
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionRCPT(command) {
    if (!command.success) {
      this.logger.warn(
        DEBUG_TAG,
        "RCPT TO failed for: " + this._envelope.curRecipient
      );
      // this is a soft error
      this._envelope.rcptFailed.push(this._envelope.curRecipient);
    } else {
      this._envelope.responseQueue.push(this._envelope.curRecipient);
    }

    if (!this._envelope.rcptQueue.length) {
      if (this._envelope.rcptFailed.length < this._envelope.to.length) {
        this._currentAction = this._actionDATA;
        this.logger.debug(DEBUG_TAG, "RCPT TO done, proceeding with payload");
        this._sendCommand("DATA");
      } else {
        this._onError(
          new Error("Can't send mail - all recipients were rejected")
        );
        this._currentAction = this._actionIdle;
      }
    } else {
      this.logger.debug(DEBUG_TAG, "Adding recipient...");
      this._envelope.curRecipient = this._envelope.rcptQueue.shift();
      this._currentAction = this._actionRCPT;
      this._sendCommand("RCPT TO:<" + this._envelope.curRecipient + ">");
    }
  }

  /**
   * Response to the DATA command. Server is now waiting for a message, so emit `onready`
   *
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionDATA(command) {
    // response should be 354 but according to this issue https://github.com/eleith/emailjs/issues/24
    // some servers might use 250 instead
    if (![250, 354].includes(command.statusCode)) {
      this.logger.error(DEBUG_TAG, "DATA unsuccessful " + command.data);
      this._onError(new Error(command.data));
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
   * @param {Object} command Parsed command from the server {statusCode, data}
   */
  _actionStream(command) {
    var rcpt;

    if (this.options.lmtp) {
      // LMTP returns a response code for *every* successfully set recipient
      // For every recipient the message might succeed or fail individually

      rcpt = this._envelope.responseQueue.shift();
      if (!command.success) {
        this.logger.error(DEBUG_TAG, "Local delivery to " + rcpt + " failed.");
        this._envelope.rcptFailed.push(rcpt);
      } else {
        this.logger.error(
          DEBUG_TAG,
          "Local delivery to " + rcpt + " succeeded."
        );
      }

      if (this._envelope.responseQueue.length) {
        this._currentAction = this._actionStream;
        return;
      }

      this._currentAction = this._actionIdle;
      this.ondone(true);
    } else {
      // For SMTP the message either fails or succeeds, there is no information
      // about individual recipients

      if (!command.success) {
        this.logger.error(DEBUG_TAG, "Message sending failed.");
      } else {
        this.logger.debug(DEBUG_TAG, "Message sent successfully.");
      }

      this._currentAction = this._actionIdle;
      this.ondone(!!command.success);
    }

    // If the client wanted to do something else (eg. to quit), do not force idle
    if (this._currentAction === this._actionIdle) {
      // Waiting for new connections
      this.logger.debug(
        DEBUG_TAG,
        "Idling while waiting for new connections..."
      );
      this.onidle();
    }
  }
}
