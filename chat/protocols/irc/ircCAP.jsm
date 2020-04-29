/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements the IRC Client Capabilities sub-protocol.
 *   Client Capab Proposal
 *     http://www.leeh.co.uk/ircd/client-cap.txt
 *   RFC Drafts: IRC Client Capabilities
 *     http://tools.ietf.org/html/draft-baudis-irc-capab-00
 *     http://tools.ietf.org/html/draft-mitchell-irc-capabilities-01
 *   IRCv3
 *     https://ircv3.net/specs/core/capability-negotiation.html
 *
 * Note that this doesn't include any implementation as these RFCs do not even
 * include example parameters.
 */

const EXPORTED_SYMBOLS = ["ircCAP", "capNotify"];

const { ircHandlers } = ChromeUtils.import(
  "resource:///modules/ircHandlers.jsm"
);

/*
 * Parses a CAP message of the form:
 *   CAP [*|<user>] <subcommand> [*] [<parameters>]
 * The cap field is added to the message and it has the following fields:
 *   subcommand
 *   parameters A list of capabilities.
 */
function capMessage(aMessage, aAccount) {
  // The CAP parameters are space separated as the last parameter.
  let parameters = aMessage.params
    .slice(-1)[0]
    .trim()
    .split(" ");
  // The subcommand is the second parameter...although sometimes it's the first
  // parameter.
  aMessage.cap = {
    subcommand: aMessage.params[aMessage.params.length >= 3 ? 1 : 0],
  };

  const messages = parameters.map(function(aParameter) {
    // Clone the original object.
    let message = Object.assign({}, aMessage);
    message.cap = Object.assign({}, aMessage.cap);

    // If there's a modifier...pull it off. (This is pretty much unused, but we
    // have to pull it off for backward compatibility.)
    if ("-=~".includes(aParameter[0])) {
      message.cap.modifier = aParameter[0];
      aParameter = aParameter.substr(1);
    } else {
      message.cap.modifier = undefined;
    }

    // CAP v3.2 capability value
    if (aParameter.includes("=")) {
      let paramParts = aParameter.split("=");
      aParameter = paramParts[0];
      // The value itself may contain an = sign, join the rest of the parts back together.
      message.cap.value = paramParts.slice(1).join("=");
    }

    // The names are case insensitive, arbitrarily choose lowercase.
    message.cap.parameter = aParameter.toLowerCase();
    message.cap.disable = message.cap.modifier == "-";
    message.cap.sticky = message.cap.modifier == "=";
    message.cap.ack = message.cap.modifier == "~";

    return message;
  });

  // Queue up messages if the server is indicating multiple lines of caps to list.
  if (
    (aMessage.cap.subcommand === "LS" || aMessage.cap.subcommand === "LIST") &&
    aMessage.params.length == 4
  ) {
    aAccount._queuedCAPs = aAccount._queuedCAPs.concat(messages);
    return [];
  }

  const retMessages = aAccount._queuedCAPs.concat(messages);
  aAccount._queuedCAPs.length = 0;
  return retMessages;
}

var ircCAP = {
  name: "Client Capabilities",
  // Slightly above default RFC 2812 priority.
  priority: ircHandlers.DEFAULT_PRIORITY + 10,
  isEnabled: () => true,

  commands: {
    CAP(aMessage) {
      // [* | <nick>] <subcommand> :<parameters>
      let messages = capMessage(aMessage, this);

      for (const message of messages) {
        if (
          message.cap.subcommand === "LS" ||
          message.cap.subcommand === "NEW"
        ) {
          this._availableCAPs.add(message.cap.parameter);
        } else if (message.cap.subcommand === "ACK") {
          this._activeCAPs.add(message.cap.parameter);
        } else if (message.cap.subcommand === "DEL") {
          this._availableCAPs.delete(message.cap.parameter);
          this._activeCAPs.delete(message.cap.parameter);
        }
      }

      messages = messages.filter(
        aMessage => !ircHandlers.handleCAPMessage(this, aMessage)
      );
      if (messages.length) {
        // Display the list of unhandled CAP messages.
        let unhandledMessages = messages
          .map(aMsg => aMsg.cap.parameter)
          .join(" ");
        this.LOG(
          "Unhandled CAP messages: " +
            unhandledMessages +
            "\nRaw message: " +
            aMessage.rawMessage
        );
      }

      // If no CAP handlers were added, just tell the server we're done.
      if (
        aMessage.cap.subcommand == "LS" &&
        !this._requestedCAPs.size &&
        !this._queuedCAPs.length
      ) {
        this.sendMessage("CAP", "END");
        this._negotiatedCAPs = true;
      }
      return true;
    },

    "410": function(aMessage) {
      // ERR_INVALIDCAPCMD
      // <unrecognized subcommand> :Invalid CAP subcommand
      this.WARN("Invalid subcommand: " + aMessage.params[1]);
      return true;
    },
  },
};

var capNotify = {
  name: "Client Capabilities",
  priority: ircHandlers.DEFAULT_PRIORITY,
  // This is implicitly enabled as part of CAP v3.2, so always enable it.
  isEnabled: () => true,

  commands: {
    "cap-notify": function(aMessage) {
      // This negotiation is entirely optional. cap-notify may thus never be formally registered.
      if (
        aMessage.cap.subcommand === "LS" ||
        aMessage.cap.subcommand === "NEW"
      ) {
        this.addCAP("cap-notify");
        this.sendMessage("CAP", ["REQ", "cap-notify"]);
      } else if (
        aMessage.cap.subcommand === "ACK" ||
        aMessage.cap.subcommand === "NAK"
      ) {
        this.removeCAP("cap-notify");
      } else {
        return false;
      }
      return true;
    },
  },
};
