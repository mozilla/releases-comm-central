/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This implements the Client-to-Client Protocol (CTCP), a subprotocol of IRC.
 *   REVISED AND UPDATED CTCP SPECIFICATION
 *     http://www.alien.net.au/irc/ctcp.txt
 */
import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";
import { displayMessage } from "resource:///modules/ircUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/irc.ftl"], true)
);

// Split into a CTCP message which is a single command and a single parameter:
//   <command> " " <parameter>
// The high level dequote is to unescape \001 in the message content.
export function CTCPMessage(aMessage, aRawCTCPMessage) {
  const message = Object.assign({}, aMessage);
  message.ctcp = {};
  message.ctcp.rawMessage = aRawCTCPMessage;

  // High/CTCP level dequote: replace the quote char \134 followed by a or \134
  // with \001 or \134, respectively. Any other character after \134 is replaced
  // with itself.
  const dequotedCTCPMessage = message.ctcp.rawMessage.replace(
    /\\(.|$)/g,
    aStr => {
      if (aStr[1]) {
        return aStr[1] == "a" ? "\x01" : aStr[1];
      }
      return "";
    }
  );

  const separator = dequotedCTCPMessage.indexOf(" ");
  // If there's no space, then only a command is given.
  // Do not capitalize the command, case sensitive
  if (separator == -1) {
    message.ctcp.command = dequotedCTCPMessage;
    message.ctcp.param = "";
  } else {
    message.ctcp.command = dequotedCTCPMessage.slice(0, separator);
    message.ctcp.param = dequotedCTCPMessage.slice(separator + 1);
  }
  return message;
}

// This is the CTCP handler for IRC protocol, it will call each CTCP handler.
export var ircCTCP = {
  name: "CTCP",
  // Slightly above default RFC 2812 priority.
  priority: ircHandlerPriorities.HIGH_PRIORITY,
  isEnabled: () => true,

  // CTCP uses only PRIVMSG and NOTICE commands.
  commands: {
    PRIVMSG: ctcpHandleMessage,
    NOTICE: ctcpHandleMessage,
  },
};

// Parse the message and call all CTCP handlers on the message.
function ctcpHandleMessage(message, ircHandlers) {
  // If there are no CTCP handlers, then don't parse the CTCP message.
  if (!ircHandlers.hasCTCPHandlers) {
    return false;
  }

  // The raw CTCP message is in the last parameter of the IRC message.
  const rawCTCPParam = message.params.slice(-1)[0];

  // Split the raw message into the multiple CTCP messages and pull out the
  // command and parameters.
  const ctcpMessages = [];
  const otherMessage = rawCTCPParam.replace(
    // eslint-disable-next-line no-control-regex
    /\x01([^\x01]*)\x01/g,
    function (aMatch, aMsg) {
      if (aMsg) {
        ctcpMessages.push(new CTCPMessage(message, aMsg));
      }
      return "";
    }
  );

  // If no CTCP messages were found, return false.
  if (!ctcpMessages.length) {
    return false;
  }

  // If there's some message left, send it back through the IRC handlers after
  // stripping out the CTCP information. I highly doubt this will ever happen,
  // but just in case. ;)
  if (otherMessage) {
    message.params.pop();
    message.params.push(otherMessage);
    ircHandlers.handleMessage(this, message);
  }

  // Loop over each raw CTCP message.
  for (const ctcpMessage of ctcpMessages) {
    if (!ircHandlers.handleCTCPMessage(this, ctcpMessage)) {
      this.WARN(
        "Unhandled CTCP message: " +
          ctcpMessage.ctcp.rawMessage +
          "\nin IRC message: " +
          ctcpMessage.rawMessage
      );
      // For unhandled CTCP message, respond with a NOTICE ERRMSG that echoes
      // back the original command.
      this.sendCTCPMessage(ctcpMessage.origin, true, "ERRMSG", [
        ctcpMessage.ctcp.rawMessage,
        ":Unhandled CTCP command",
      ]);
    }
  }

  // We have handled this message as much as we can.
  return true;
}

// This is the the basic CTCP protocol.
export var ctcpBase = {
  // Parameters
  name: "CTCP",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled: () => true,

  // These represent CTCP commands.
  commands: {
    ACTION(aMessage) {
      // ACTION <text>
      // Display message in conversation
      return displayMessage(
        this,
        aMessage,
        { action: true },
        aMessage.ctcp.param
      );
    },

    // Used when an error needs to be replied with.
    ERRMSG(aMessage) {
      this.WARN(
        aMessage.origin +
          " failed to handle CTCP message: " +
          aMessage.ctcp.param
      );
      return true;
    },

    // This is commented out since CLIENTINFO automatically returns the
    // supported CTCP parameters and this is not supported.

    // Returns the user's full name, and idle time.
    // "FINGER": function(aMessage) { return false; },

    // Dynamic master index of what a client knows.
    CLIENTINFO(message, ircHandlers) {
      if (message.command == "PRIVMSG") {
        // Received a CLIENTINFO request, respond with the support CTCP
        // messages.
        const info = new Set();
        for (const handler of ircHandlers._ctcpHandlers) {
          for (const command in handler.commands) {
            info.add(command);
          }
        }

        const supportedCtcp = [...info].join(" ");
        this.LOG(
          "Reporting support for the following CTCP messages: " + supportedCtcp
        );
        this.sendCTCPMessage(message.origin, true, "CLIENTINFO", supportedCtcp);
      } else {
        // Received a CLIENTINFO response, store the information for future
        // use.
        const info = message.ctcp.param.split(" ");
        this.setWhois(message.origin, { clientInfo: info });
      }
      return true;
    },

    // Used to measure the delay of the IRC network between clients.
    PING(aMessage) {
      // PING timestamp
      if (aMessage.command == "PRIVMSG") {
        // Received PING request, send PING response.
        this.LOG(
          "Received PING request from " +
            aMessage.origin +
            '. Sending PING response: "' +
            aMessage.ctcp.param +
            '".'
        );
        this.sendCTCPMessage(
          aMessage.origin,
          true,
          "PING",
          aMessage.ctcp.param
        );
        return true;
      }
      return this.handlePingReply(aMessage.origin, aMessage.ctcp.param);
    },

    // These are commented out since CLIENTINFO automatically returns the
    // supported CTCP parameters and this is not supported.

    // An encryption protocol between clients without any known reference.
    // "SED": function(aMessage) { return false; },

    // Where to obtain a copy of a client.
    // "SOURCE": function(aMessage) { return false; },

    // Gets the local date and time from other clients.
    TIME(aMessage) {
      if (aMessage.command == "PRIVMSG") {
        // TIME
        // Received a TIME request, send a human readable response.
        const now = new Date().toString();
        this.LOG(
          "Received TIME request from " +
            aMessage.origin +
            '. Sending TIME response: "' +
            now +
            '".'
        );
        this.sendCTCPMessage(aMessage.origin, true, "TIME", ":" + now);
      } else {
        // TIME :<human-readable-time-string>
        // Received a TIME reply, display it.
        // Remove the : prefix, if it exists and display the result.
        const time = aMessage.ctcp.param.slice(aMessage.ctcp.param[0] == ":");
        this.getConversation(aMessage.origin).writeMessage(
          aMessage.origin,
          lazy.l10n.formatValueSync("ctcp-time", {
            username: aMessage.origin,
            timeResponse: time,
          }),
          { system: true, tags: aMessage.tags }
        );
      }
      return true;
    },

    // This is commented out since CLIENTINFO automatically returns the
    // supported CTCP parameters and this is not supported.

    // A string set by the user (never the client coder)
    // "USERINFO": function(aMessage) { return false; },

    // The version and type of the client.
    VERSION(aMessage) {
      if (aMessage.command == "PRIVMSG") {
        // VERSION
        // Received VERSION request, send VERSION response.
        const version = Services.appinfo.name + " " + Services.appinfo.version;
        this.LOG(
          "Received VERSION request from " +
            aMessage.origin +
            '. Sending VERSION response: "' +
            version +
            '".'
        );
        this.sendCTCPMessage(aMessage.origin, true, "VERSION", version);
      } else if (aMessage.command == "NOTICE" && aMessage.ctcp.param.length) {
        // VERSION #:#:#
        // Received VERSION response, display to the user.
        const response = lazy.l10n.formatValueSync("ctcp-version", {
          username: aMessage.origin,
          version: aMessage.ctcp.param,
        });
        this.getConversation(aMessage.origin).writeMessage(
          aMessage.origin,
          response,
          {
            system: true,
            tags: aMessage.tags,
          }
        );
      }
      return true;
    },
  },
};
