/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
// This file implements test SMTP servers

import {
  AuthPLAIN,
  AuthLOGIN,
  AuthCRAM,
} from "resource://testing-common/mailnews/Auth.sys.mjs";

export class SmtpDaemon {
  _messages = {};
}

// SMTP TEST SERVERS
// -----------------

var kStateAuthNeeded = 0;
var kStateAuthOptional = 2;
var kStateAuthenticated = 3;

/**
 * This handler implements the bare minimum required by RFC 2821.
 *
 * @see RFC 2821
 * If dropOnAuthFailure is set, the server will drop the connection
 * on authentication errors, to simulate servers that do the same.
 */
export class SMTP_RFC2821_handler {
  kAuthRequired = false;
  kUsername = "testsmtp";
  kPassword = "smtptest";
  kAuthSchemes = ["CRAM-MD5", "PLAIN", "LOGIN"];
  kCapabilities = ["8BITMIME", "SIZE", "CLIENTID"];
  _nextAuthFunction = undefined;

  constructor(daemon) {
    this._daemon = daemon;
    this.closing = false;
    this.dropOnAuthFailure = false;

    this._kAuthSchemeStartFunction = {
      "CRAM-MD5": this.authCRAMStart,
      PLAIN: this.authPLAINStart,
      LOGIN: this.authLOGINStart,
    };

    this.resetTest();
  }

  resetTest() {
    this._state = this.kAuthRequired ? kStateAuthNeeded : kStateAuthOptional;
    this._nextAuthFunction = undefined;
    this._multiline = false;
    this.expectingData = false;
    this._daemon.post = "";
  }
  EHLO() {
    var capa = "250-fakeserver greets you";
    if (this.kCapabilities.length > 0) {
      capa += "\n250-" + this.kCapabilities.join("\n250-");
    }
    if (this.kAuthSchemes.length > 0) {
      capa += "\n250-AUTH " + this.kAuthSchemes.join(" ");
    }
    capa += "\n250 HELP"; // the odd one: no "-", per RFC 2821
    return capa;
  }
  CLIENTID() {
    return "250 ok";
  }
  AUTH(lineRest) {
    if (this._state == kStateAuthenticated) {
      return "503 You're already authenticated";
    }
    var args = lineRest.split(" ");
    var scheme = args[0].toUpperCase();
    // |scheme| contained in |kAuthSchemes|?
    if (
      !this.kAuthSchemes.some(function (s) {
        return s == scheme;
      })
    ) {
      return "504 AUTH " + scheme + " not supported";
    }
    var func = this._kAuthSchemeStartFunction[scheme];
    if (!func || typeof func != "function") {
      return (
        "504 I just pretended to implement AUTH " + scheme + ", but I don't"
      );
    }
    dump("Starting AUTH " + scheme + "\n");
    return func.call(this, args.length > 1 ? args[1] : undefined);
  }
  MAIL() {
    if (this._state == kStateAuthNeeded) {
      return "530 5.7.0 Authentication required";
    }
    return "250 ok";
  }
  RCPT() {
    if (this._state == kStateAuthNeeded) {
      return "530 5.7.0 Authentication required";
    }
    return "250 ok";
  }
  DATA() {
    if (this._state == kStateAuthNeeded) {
      return "530 5.7.0 Authentication required";
    }
    this.expectingData = true;
    this._daemon.post = "";
    return "354 ok\n";
  }
  RSET() {
    return "250 ok\n";
  }
  VRFY() {
    if (this._state == kStateAuthNeeded) {
      return "530 5.7.0 Authentication required";
    }
    return "250 ok\n";
  }
  EXPN() {
    return "250 ok\n";
  }
  HELP() {
    return "211 ok\n";
  }
  NOOP() {
    return "250 ok\n";
  }
  QUIT() {
    this.closing = true;
    return "221 done";
  }
  onStartup() {
    this.closing = false;
    return "220 ok";
  }

  /**
   * AUTH implementations
   *
   * @see RFC 4954
   */
  authPLAINStart(lineRest) {
    if (lineRest) {
      // all in one command, called initial client response, see RFC 4954
      return this.authPLAINCred(lineRest);
    }

    this._nextAuthFunction = this.authPLAINCred;
    this._multiline = true;

    return "334 ";
  }
  authPLAINCred(line) {
    var req = AuthPLAIN.decodeLine(line);
    if (req.username == this.kUsername && req.password == this.kPassword) {
      this._state = kStateAuthenticated;
      return "235 2.7.0 Hello friend! Friends give friends good advice: Next time, use CRAM-MD5";
    }
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "535 5.7.8 Wrong username or password, crook!";
  }

  authCRAMStart() {
    this._nextAuthFunction = this.authCRAMDigest;
    this._multiline = true;

    this._usedCRAMMD5Challenge = AuthCRAM.createChallenge("localhost");
    return "334 " + this._usedCRAMMD5Challenge;
  }
  authCRAMDigest(line) {
    var req = AuthCRAM.decodeLine(line);
    var expectedDigest = AuthCRAM.encodeCRAMMD5(
      this._usedCRAMMD5Challenge,
      this.kPassword
    );
    if (req.username == this.kUsername && req.digest == expectedDigest) {
      this._state = kStateAuthenticated;
      return "235 2.7.0 Hello friend!";
    }
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "535 5.7.8 Wrong username or password, crook!";
  }

  authLOGINStart() {
    this._nextAuthFunction = this.authLOGINUsername;
    this._multiline = true;

    return "334 " + btoa("Username:");
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
    return "334 " + btoa("Password:");
  }
  authLOGINBadUsername() {
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "535 5.7.8 Wrong username or password, crook!";
  }
  authLOGINPassword(line) {
    var req = AuthLOGIN.decodeLine(line);
    if (req == this.kPassword) {
      this._state = kStateAuthenticated;
      return "235 2.7.0 Hello friend! Where did you pull out this old auth scheme?";
    }
    if (this.dropOnAuthFailure) {
      this.closing = true;
    }
    return "535 5.7.8 Wrong username or password, crook!";
  }

  onError(command) {
    return "500 Command " + command + " not recognized\n";
  }
  onServerFault(e) {
    return "451 Internal server error: " + e;
  }
  onMultiline(line) {
    if (this._nextAuthFunction) {
      var func = this._nextAuthFunction;
      this._multiline = false;
      this._nextAuthFunction = undefined;
      if (line == "*") {
        // abort, per RFC 4954 and others
        return "501 Okay, as you wish. Chicken";
      }
      if (!func || typeof func != "function") {
        return "451 I'm lost. Internal server error during auth";
      }
      try {
        return func.call(this, line);
      } catch (e) {
        return "451 " + e;
      }
    }
    if (line == ".") {
      if (this.expectingData) {
        this.expectingData = false;
        return "250 Wonderful article, your style is gorgeous!";
      }
      return "503 Huch? How did you get here?";
    }

    if (this.expectingData) {
      if (line.startsWith(".")) {
        line = line.substring(1);
      }
      // This uses CR LF to match with the specification
      this._daemon.post += line + "\r\n";
    }
    return undefined;
  }
  postCommand(reader) {
    if (this.closing) {
      reader.closeSocket();
    }
    reader.setMultiline(this._multiline || this.expectingData);
  }
}
