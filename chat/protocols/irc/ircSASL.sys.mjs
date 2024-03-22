/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements SASL for IRC.
 *   https://raw.github.com/atheme/atheme/master/doc/SASL
 *   https://ircv3.net/specs/extensions/sasl-3.2
 */

import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";

export var ircSASL = {
  name: "SASL AUTHENTICATE",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled() {
    return this._activeCAPs.has("sasl");
  },

  commands: {
    AUTHENTICATE(aMessage) {
      // Expect an empty response, if something different is received abort.
      if (aMessage.params[0] != "+") {
        this.sendMessage("AUTHENTICATE", "*");
        this.WARN(
          "Aborting SASL authentication, unexpected message " +
            "received:\n" +
            aMessage.rawMessage
        );
        return true;
      }

      // An authentication identity, authorization identity and password are
      // used, separated by null.
      const data = [
        this._requestedNickname,
        this._requestedNickname,
        this.imAccount.password,
      ].join("\0");
      // btoa for Unicode, see https://developer.mozilla.org/en-US/docs/DOM/window.btoa
      const base64Data = btoa(unescape(encodeURIComponent(data)));
      this.sendMessage(
        "AUTHENTICATE",
        base64Data,
        "AUTHENTICATE <base64 encoded nick, user and password not logged>"
      );
      return true;
    },

    900() {
      // RPL_LOGGEDIN
      // <nick>!<ident>@<host> <account> :You are now logged in as <user>
      // Now logged in ("whether by SASL or otherwise").
      this.isAuthenticated = true;
      return true;
    },

    901() {
      // RPL_LOGGEDOUT
      // The user's account name is unset (whether by SASL or otherwise).
      this.isAuthenticated = false;
      return true;
    },

    902() {
      // ERR_NICKLOCKED
      // Authentication failed because the account is currently locked out,
      // held, or otherwise administratively made unavailable.
      this.WARN(
        "You must use a nick assigned to you. SASL authentication failed."
      );
      this.removeCAP("sasl");
      return true;
    },

    903() {
      // RPL_SASLSUCCESS
      // Authentication was successful.
      this.isAuthenticated = true;
      this.LOG("SASL authentication successful.");
      // We may receive this again while already connected if the user manually
      // identifies with Nickserv.
      if (!this.connected) {
        this.removeCAP("sasl");
      }
      return true;
    },

    904() {
      // ERR_SASLFAIL
      // Sent when the SASL authentication fails because of invalid credentials
      // or other errors not explicitly mentioned by other numerics.
      this.WARN("Authentication with SASL failed.");
      this.removeCAP("sasl");
      return true;
    },

    905() {
      // ERR_SASLTOOLONG
      // Sent when credentials are valid, but the SASL authentication fails
      // because the client-sent `AUTHENTICATE` command was too long.
      this.ERROR("SASL: AUTHENTICATE command was too long.");
      this.removeCAP("sasl");
      return true;
    },

    906() {
      // ERR_SASLABORTED
      // The client completed registration before SASL authentication completed,
      // or because we sent `AUTHENTICATE` with `*` as the parameter.
      //
      // Freenode sends 906 in addition to 904, ignore 906 in this case.
      if (this._requestedCAPs.has("sasl")) {
        this.ERROR(
          "Registration completed before SASL authentication completed."
        );
        this.removeCAP("sasl");
      }
      return true;
    },

    907() {
      // ERR_SASLALREADY
      // Response if client attempts to AUTHENTICATE after successful
      // authentication.
      this.ERROR("Attempting SASL authentication twice?!");
      this.removeCAP("sasl");
      return true;
    },

    908() {
      // RPL_SASLMECHS
      // <nick> <mechanisms> :are available SASL mechanisms
      // List of SASL mechanisms supported by the server (or network, services).
      // The numeric contains a comma-separated list of mechanisms.
      return false;
    },
  },
};

export var capSASL = {
  name: "SASL CAP",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    sasl(aMessage) {
      // Return early if we are already authenticated (can happen due to cap-notify)
      if (this.isAuthenticated) {
        return true;
      }

      if (
        (aMessage.cap.subcommand === "LS" ||
          aMessage.cap.subcommand === "NEW") &&
        this.imAccount.password
      ) {
        if (aMessage.cap.value) {
          const mechanisms = aMessage.cap.value.split(",");
          // We only support the plain authentication mechanism for now, abort if it's not available.
          if (!mechanisms.includes("PLAIN")) {
            return true;
          }
        }
        // If it supports SASL, let the server know we're requiring SASL.
        this.addCAP("sasl");
        this.sendMessage("CAP", ["REQ", "sasl"]);
      } else if (aMessage.cap.subcommand === "ACK") {
        // The server acknowledges our choice to use SASL, send the first
        // message.
        this.sendMessage("AUTHENTICATE", "PLAIN");
      } else if (aMessage.cap.subcommand === "NAK") {
        this.removeCAP("sasl");
      }

      return true;
    },
  },
};
