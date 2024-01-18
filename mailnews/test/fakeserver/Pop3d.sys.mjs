/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Contributors:
 *   Ben Bucksch <ben.bucksch beonex.com> <http://business.beonex.com> (RFC 5034 Authentication)
 */
/* This file implements test POP3 servers
 */

import {
  AuthPLAIN,
  AuthLOGIN,
  AuthCRAM,
} from "resource://testing-common/mailnews/Auth.sys.mjs";

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

// Since we don't really need to worry about peristence, we can just
// use a UIDL counter.
var gUIDLCount = 1;

/**
 * Read the contents of a file to the string.
 *
 * @param fileName A path relative to the current working directory, or
 *                 a filename underneath the "data" directory relative to
 *                 the cwd.
 */
function readFile(fileName) {
  const cwd = Services.dirsvc.get("CurWorkD", Ci.nsIFile);

  // Try to find the file relative to either the data directory or to the
  // current working directory.
  let file = cwd.clone();
  if (fileName.includes("/")) {
    const parts = fileName.split("/");
    for (const part of parts) {
      if (part == "..") {
        file = file.parent;
      } else {
        file.append(part);
      }
    }
  } else {
    file.append("data");
    file.append(fileName);
  }

  if (!file.exists()) {
    throw new Error("Cannot find file named " + fileName);
  }

  return mailTestUtils.loadFileToString(file);
}

export class Pop3Daemon {
  messages = [];
  _messages = [];
  _totalMessageSize = 0;

  /**
   * Set the messages that the POP3 daemon will provide to its clients.
   *
   * @param messages An array of either 1) strings that are filenames whose
   *     contents will be loaded from the files or 2) objects with a "fileData"
   *     attribute whose value is the content of the file.
   */
  setMessages(messages) {
    this._messages = [];
    this._totalMessageSize = 0;

    function addMessage(element) {
      // if it's a string, then it's a file-name.
      if (typeof element == "string") {
        this._messages.push({ fileData: readFile(element), size: -1 });
      } else {
        // Otherwise it's an object as dictionary already.
        this._messages.push(element);
      }
    }
    messages.forEach(addMessage, this);

    for (var i = 0; i < this._messages.length; ++i) {
      this._messages[i].size = this._messages[i].fileData.length;
      this._messages[i].uidl = "UIDL" + gUIDLCount++;
      this._totalMessageSize += this._messages[i].size;
    }
  }
  getTotalMessages() {
    return this._messages.length;
  }
  getTotalMessageSize() {
    return this._totalMessageSize;
  }
}

// POP3 TEST SERVERS
// -----------------

var kStateAuthNeeded = 1; // Not authenticated yet, need username and password
var kStateAuthPASS = 2; // got command USER, expecting command PASS
var kStateTransaction = 3; // Authenticated, can fetch and delete mail

/**
 * This handler implements the bare minimum required by RFC 1939.
 * If dropOnAuthFailure is set, the server will drop the connection
 * on authentication errors, to simulate servers that do the same.
 */
export class POP3_RFC1939_handler {
  kUsername = "fred";
  kPassword = "wilma";

  constructor(daemon, { username = "fred", password = "wilma" } = {}) {
    this._daemon = daemon;
    this.kUsername = username;
    this.kPassword = password;
    this.closing = false;
    this.dropOnAuthFailure = false;
    this._multiline = false;
    this.resetTest();
  }

  resetTest() {
    this._state = kStateAuthNeeded;
  }

  USER(args) {
    if (this._state != kStateAuthNeeded) {
      return "-ERR invalid state";
    }

    if (args == this.kUsername) {
      this._state = kStateAuthPASS;
      return "+OK user recognized";
    }

    return "-ERR sorry, no such mailbox";
  }
  PASS(args) {
    if (this._state != kStateAuthPASS) {
      return "-ERR invalid state";
    }

    if (args == this.kPassword) {
      this._state = kStateTransaction;
      return "+OK maildrop locked and ready";
    }

    this._state = kStateAuthNeeded;
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "-ERR invalid password";
  }
  STAT(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }

    return (
      "+OK " +
      this._daemon.getTotalMessages() +
      " " +
      this._daemon.getTotalMessageSize()
    );
  }
  LIST(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }

    var result = "+OK " + this._daemon._messages.length + " messages\r\n";
    for (var i = 0; i < this._daemon._messages.length; ++i) {
      result += i + 1 + " " + this._daemon._messages[i].size + "\r\n";
    }

    result += ".";
    return result;
  }
  UIDL(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }
    let result = "+OK\r\n";
    for (let i = 0; i < this._daemon._messages.length; ++i) {
      result += i + 1 + " " + this._daemon._messages[i].uidl + "\r\n";
    }

    result += ".";
    return result;
  }
  TOP(args) {
    const [messageNumber, numberOfBodyLines] = args.split(" ");
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }
    let result = "+OK\r\n";
    const msg = this._daemon._messages[messageNumber - 1].fileData;
    const index = msg.indexOf("\r\n\r\n");
    result += msg.slice(0, index);
    if (numberOfBodyLines) {
      result += "\r\n\r\n";
      const bodyLines = msg.slice(index + 4).split("\r\n");
      result += bodyLines.slice(0, numberOfBodyLines).join("\r\n");
    }
    result += "\r\n.";
    return result;
  }
  RETR(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }

    var result = "+OK " + this._daemon._messages[args - 1].size + "\r\n";
    result += this._daemon._messages[args - 1].fileData;
    result += ".";
    return result;
  }
  DELE(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }
    return "+OK";
  }
  NOOP(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }
    return "+OK";
  }
  RSET(args) {
    if (this._state != kStateTransaction) {
      return "-ERR invalid state";
    }
    this._state = kStateAuthNeeded;
    return "+OK";
  }
  QUIT(args) {
    // Let the client close the socket
    // this.closing = true;
    return "+OK fakeserver signing off";
  }
  onStartup() {
    this.closing = false;
    this._state = kStateAuthNeeded;
    return "+OK Fake POP3 server ready";
  }
  onError(command, args) {
    return "-ERR command " + command + " not implemented";
  }
  onServerFault(e) {
    return "-ERR internal server error: " + e;
  }
  postCommand(reader) {
    reader.setMultiline(this._multiline);
    if (this.closing) {
      reader.closeSocket();
    }
  }
}

/**
 * This implements CAPA
 *
 * @see RFC 2449
 */
export class POP3_RFC2449_handler extends POP3_RFC1939_handler {
  kCapabilities = ["UIDL", "TOP"]; // the test may adapt this as necessary

  CAPA(args) {
    var capa = "+OK List of our wanna-be capabilities follows:\r\n";
    for (var i = 0; i < this.kCapabilities.length; i++) {
      capa += this.kCapabilities[i] + "\r\n";
    }
    if (this.capaAdditions) {
      capa += this.capaAdditions();
    }
    capa += "IMPLEMENTATION fakeserver\r\n.";
    return capa;
  }
}

/**
 * This implements the AUTH command, i.e. authentication using CRAM-MD5 etc.
 *
 * @see RFC 5034
 * @author Ben Bucksch <ben.bucksch beonex.com> <http://business.beonex.com>
 */
export class POP3_RFC5034_handler extends POP3_RFC2449_handler {
  kAuthSchemes = ["CRAM-MD5", "PLAIN", "LOGIN"]; // the test may adapt this as necessary
  _usedCRAMMD5Challenge = null; // not base64-encoded

  constructor(daemon, options) {
    super(daemon, options);

    this._kAuthSchemeStartFunction = {
      "CRAM-MD5": this.authCRAMStart,
      PLAIN: this.authPLAINStart,
      LOGIN: this.authLOGINStart,
    };
  }

  // called by this.CAPA()
  capaAdditions() {
    var capa = "";
    if (this.kAuthSchemes.length > 0) {
      capa += "SASL";
      for (var i = 0; i < this.kAuthSchemes.length; i++) {
        capa += " " + this.kAuthSchemes[i];
      }
      capa += "\r\n";
    }
    return capa;
  }
  AUTH(lineRest) {
    // |lineRest| is a string containing the rest of line after "AUTH "
    if (this._state != kStateAuthNeeded) {
      return "-ERR invalid state";
    }

    // AUTH without arguments returns a list of supported schemes
    if (!lineRest) {
      var capa = "+OK I like:\r\n";
      for (var i = 0; i < this.kAuthSchemes.length; i++) {
        capa += this.kAuthSchemes[i] + "\r\n";
      }
      capa += ".\r\n";
      return capa;
    }

    var args = lineRest.split(" ");
    var scheme = args[0].toUpperCase();
    // |scheme| contained in |kAuthSchemes|?
    if (
      !this.kAuthSchemes.some(function (s) {
        return s == scheme;
      })
    ) {
      return "-ERR AUTH " + scheme + " not supported";
    }

    var func = this._kAuthSchemeStartFunction[scheme];
    if (!func || typeof func != "function") {
      return (
        "-ERR I just pretended to implement AUTH " + scheme + ", but I don't"
      );
    }
    return func.call(this, "1" in args ? args[1] : undefined);
  }

  onMultiline(line) {
    if (this._nextAuthFunction) {
      var func = this._nextAuthFunction;
      this._multiline = false;
      this._nextAuthFunction = undefined;
      if (line == "*") {
        return "-ERR Okay, as you wish. Chicken";
      }
      if (!func || typeof func != "function") {
        return "-ERR I'm lost. Internal server error during auth";
      }
      try {
        return func.call(this, line);
      } catch (e) {
        return "-ERR " + e;
      }
    }

    if (super.onMultiline) {
      // Call parent.
      return super.onMultiline.call(this, line);
    }
    return undefined;
  }

  authPLAINStart(lineRest) {
    this._nextAuthFunction = this.authPLAINCred;
    this._multiline = true;

    return "+";
  }
  authPLAINCred(line) {
    var req = AuthPLAIN.decodeLine(line);
    if (req.username == this.kUsername && req.password == this.kPassword) {
      this._state = kStateTransaction;
      return "+OK Hello friend! Friends give friends good advice: Next time, use CRAM-MD5";
    }
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "-ERR Wrong username or password, crook!";
  }

  authCRAMStart(lineRest) {
    this._nextAuthFunction = this.authCRAMDigest;
    this._multiline = true;

    this._usedCRAMMD5Challenge = AuthCRAM.createChallenge("localhost");
    return "+ " + this._usedCRAMMD5Challenge;
  }
  authCRAMDigest(line) {
    var req = AuthCRAM.decodeLine(line);
    var expectedDigest = AuthCRAM.encodeCRAMMD5(
      this._usedCRAMMD5Challenge,
      this.kPassword
    );
    if (req.username == this.kUsername && req.digest == expectedDigest) {
      this._state = kStateTransaction;
      return "+OK Hello friend!";
    }
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "-ERR Wrong username or password, crook!";
  }

  authLOGINStart(lineRest) {
    this._nextAuthFunction = this.authLOGINUsername;
    this._multiline = true;

    return "+ " + btoa("Username:");
  }
  authLOGINUsername(line) {
    var req = AuthLOGIN.decodeLine(line);
    if (req == this.kUsername) {
      this._nextAuthFunction = this.authLOGINPassword;
    } else {
      // Don't return error yet, to not reveal valid usernames.
      this._nextAuthFunction = this.authLOGINBadUsername;
    }
    this._multiline = true;
    return "+ " + btoa("Password:");
  }
  authLOGINBadUsername(line) {
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "-ERR Wrong username or password, crook!";
  }
  authLOGINPassword(line) {
    var req = AuthLOGIN.decodeLine(line);
    if (req == this.kPassword) {
      this._state = kStateTransaction;
      return "+OK Hello friend! Where did you pull out this old auth scheme?";
    }
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "-ERR Wrong username or password, crook!";
  }
}
