/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements SASL for IRC.
 *   https://raw.github.com/atheme/atheme/master/doc/SASL
 *   https://github.com/ircv3/ircv3-specifications/blob/master/extensions/sasl-3.1
 */

this.EXPORTED_SYMBOLS = ["ircSASL", "capSASL"];

var Cu = Components.utils;

Cu.import("resource:///modules/ircHandlers.jsm");
Cu.import("resource:///modules/ircUtils.jsm");

var ircSASL = {
  name: "SASL AUTHENTICATE",
  priority: ircHandlers.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    "AUTHENTICATE": function(aMessage) {
      // Expect an empty response, if something different is received abort.
      if (aMessage.params[0] != "+") {
        this.sendMessage("AUTHENTICATE", "*");
        this.WARN("Aborting SASL authentication, unexpected message " +
                  "received:\n" + aMessage.rawMessage);
        return true;
      }

      // An authentication identity, authorization identity and password are
      // used, separated by null.
      let data = [this._requestedNickname, this._requestedNickname,
                  this.imAccount.password].join("\0");
      // btoa for Unicode, see https://developer.mozilla.org/en-US/docs/DOM/window.btoa
      let base64Data = btoa(unescape(encodeURIComponent(data)));
      this.sendMessage("AUTHENTICATE", base64Data,
                       "AUTHENTICATE <base64 encoded nick, user and password not logged>");
      return true;
    },

    "900": function(aMessage) {
      // RPL_LOGGEDIN
      // <nick>!<ident>@<host> <account> :You are now logged in as <user>
      // Now logged in ("whether by SASL or otherwise").
      this.isAuthenticated = true;
      return true;
    },

    "901": function(aMessage) {
      // RPL_LOGGEDOUT
      // The user's account name is unset (whether by SASL or otherwise).
      this.isAuthenticated = false;
      return true;
    },

    "902": function(aMessage) {
      // ERR_NICKLOCKED
      // Authentication failed because the account is currently locked out,
      // held, or otherwise administratively made unavailable.
      this.WARN("You must use a nick assigned to you. SASL authentication failed.");
      this.removeCAP("sasl");
      return true;
    },

    "903": function(aMessage) {
      // RPL_SASLSUCCESS
      // Authentication was successful.
      this.isAuthenticated = true;
      this.LOG("SASL authentication successful.");
      // We may receive this again while already connected if the user manually
      // identifies with Nickserv.
      if (!this.connected)
        this.removeCAP("sasl");
      return true;
    },

    "904": function(aMessage) {
      // ERR_SASLFAIL
      // Sent when the SASL authentication fails because of invalid credentials
      // or other errors not explicitly mentioned by other numerics.
      this.WARN("Authentication with SASL failed.");
      this.removeCAP("sasl");
      return true;
    },

    "905": function(aMessage) {
      // ERR_SASLTOOLONG
      // Sent when credentials are valid, but the SASL authentication fails
      // because the client-sent `AUTHENTICATE` command was too long.
      this.ERROR("SASL: AUTHENTICATE command was too long.");
      this.removeCAP("sasl");
      return true;
    },

    "906": function(aMessage) {
      // ERR_SASLABORTED
      // The client completed registration before SASL authentication completed,
      // or because we sent `AUTHENTICATE` with `*` as the parameter.
      this.ERROR("Registration completed before SASL authentication completed.");
      this.removeCAP("sasl");
      return true;
    },

    "907": function(aMessage) {
      // ERR_SASLALREADY
      // Response if client attempts to AUTHENTICATE after successful
      // authentication.
      this.ERROR("Attempting SASL authentication twice?!");
      this.removeCAP("sasl");
      return true;
    },

    "908": function(aMessage) {
      // RPL_SASLMECHS
      // <nick> <mechanisms> :are available SASL mechanisms
      // List of SASL mechanisms supported by the server (or network, services).
      // The numeric contains a comma-separated list of mechanisms.
      return false;
    }
  }
};

var capSASL = {
  name: "SASL CAP",
  priority: ircHandlers.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    "sasl": function(aMessage) {
      if (aMessage.cap.subcommand == "LS" && this.imAccount.password) {
        // If it supports SASL, let the server know we're requiring SASL.
        this.sendMessage("CAP", ["REQ", "sasl"]);
        this.addCAP("sasl");
      }
      else if (aMessage.cap.subcommand == "ACK") {
        // The server acknowledges our choice to use SASL, send the first
        // message.
        this.sendMessage("AUTHENTICATE", "PLAIN");
      }

      return true;
    }
  }
};
