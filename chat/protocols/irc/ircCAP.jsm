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
 *     http://ircv3.net/specs/core/capability-negotiation-3.1.html
 *     http://ircv3.net/specs/core/capability-negotiation-3.2.html
 *
 * Note that this doesn't include any implementation as these RFCs do not even
 * include example parameters.
 */

this.EXPORTED_SYMBOLS = ["ircCAP"];

var Cu = Components.utils;

Cu.import("resource:///modules/ircHandlers.jsm");
Cu.import("resource:///modules/ircUtils.jsm");

/*
 * Parses a CAP message of the form:
 *   CAP <subcommand> [<parameters>]
 * The cap field is added to the message and it has the following fields:
 *   subcommand
 *   parameters A list of capabilities.
 */
function capMessage(aMessage) {
  // The CAP parameters are space separated as the last parameter.
  let parameters = aMessage.params.slice(-1)[0].trim().split(" ");
  // The subcommand is the second parameter...although sometimes it's the first
  // parameter.
  aMessage.cap = {
    subcommand: aMessage.params[aMessage.params.length == 3 ? 1 : 0]
  };

  return parameters.map(function(aParameter) {
    // Clone the original object.
    let message = Object.assign({}, aMessage);
    message.cap = Object.assign({}, aMessage.cap);

    // If there's a modifier...pull it off. (This is pretty much unused, but we
    // have to pull it off for backward compatibility.)
    if ('-=~'.includes(aParameter[0])) {
      message.cap.modifier = aParameter[0];
      aParameter = aParameter.substr(1);
    } else
      message.cap.modifier = undefined;

    // The names are case insensitive, arbitrarily choose lowercase.
    message.cap.parameter = aParameter.toLowerCase();
    message.cap.disable = message.cap.modifier == "-";
    message.cap.sticky = message.cap.modifier == "=";
    message.cap.ack = message.cap.modifier == "~";

    return message;
  });
}

var ircCAP = {
  name: "Client Capabilities",
  // Slightly above default RFC 2812 priority.
  priority: ircHandlers.DEFAULT_PRIORITY + 10,
  isEnabled: () => true,

  commands: {
    "CAP": function(aMessage) {
      // [* | <nick>] <subcommand> :<parameters>
      let messages = capMessage(aMessage);

      messages = messages.filter(aMessage =>
        !ircHandlers.handleCAPMessage(this, aMessage));
      if (messages.length) {
        // Display the list of unhandled CAP messages.
        let unhandledMessages =
          messages.map(aMsg => aMsg.cap.parameter).join(" ");
        this.LOG("Unhandled CAP messages: " + unhandledMessages +
                 "\nRaw message: " + aMessage.rawMessage);
      }

      // If no CAP handlers were added, just tell the server we're done.
      if (aMessage.cap.subcommand == "LS" && !this._caps.size)
        this.sendMessage("CAP", "END");
      return true;
    },

    "410": function(aMessage) { // ERR_INVALIDCAPCMD
      // <unrecognized subcommand> :Invalid CAP subcommand
      this.WARN("Invalid subcommand: " + aMessage.params[1]);
      return true;
    }
  }
};
