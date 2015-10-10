/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements the Client-to-Client Protocol (CTCP), a subprotocol of IRC.
 *   REVISED AND UPDATED CTCP SPECIFICATION
 *     http://www.alien.net.au/irc/ctcp.txt
 */

this.EXPORTED_SYMBOLS = ["ircCTCP", "ctcpBase"];

var Cu = Components.utils;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/ircHandlers.jsm");
Cu.import("resource:///modules/ircUtils.jsm");

// Split into a CTCP message which is a single command and a single parameter:
//   <command> " " <parameter>
// The high level dequote is to unescape \001 in the message content.
function CTCPMessage(aMessage, aRawCTCPMessage) {
  let message = aMessage;
  message.ctcp = {};
  message.ctcp.rawMessage = aRawCTCPMessage;

  // High/CTCP level dequote: replace the quote char \134 followed by a or \134
  // with \001 or \134, respectively. Any other character after \134 is replaced
  // with itself.
  let dequotedCTCPMessage = message.ctcp.rawMessage.replace(/\\(.|$)/g,
    aStr => aStr[1] ? (aStr[1] == "a" ? "\x01" : aStr[1]) : "");

  let separator = dequotedCTCPMessage.indexOf(" ");
  // If there's no space, then only a command is given.
  // Do not capitalize the command, case sensitive
  if (separator == -1) {
    message.ctcp.command = dequotedCTCPMessage;
    message.ctcp.param = "";
  }
  else {
    message.ctcp.command = dequotedCTCPMessage.slice(0, separator);
    message.ctcp.param = dequotedCTCPMessage.slice(separator + 1);
  }
  return message;
}


// This is the CTCP handler for IRC protocol, it will call each CTCP handler.
var ircCTCP = {
  name: "CTCP",
  // Slightly above default RFC 2812 priority.
  priority: ircHandlers.HIGH_PRIORITY,
  isEnabled: () => true,

  // CTCP uses only PRIVMSG and NOTICE commands.
  commands: {
    "PRIVMSG": ctcpHandleMessage,
    "NOTICE": ctcpHandleMessage
  }
}
// Parse the message and call all CTCP handlers on the message.
function ctcpHandleMessage(aMessage) {
  // If there are no CTCP handlers, then don't parse the CTCP message.
  if (!ircHandlers.hasCTCPHandlers)
    return false;

  // The raw CTCP message is in the last parameter of the IRC message.
  let rawCTCPParam = aMessage.params.slice(-1)[0];

  // Split the raw message into the multiple CTCP messages and pull out the
  // command and parameters.
  let ctcpMessages = [];
  let otherMessage = rawCTCPParam.replace(/\x01([^\x01]*)\x01/g,
    function(aMatch, aMsg) {
      if (aMsg)
        ctcpMessages.push(new CTCPMessage(aMessage, aMsg));
      return "";
    });

  // If no CTCP messages were found, return false.
  if (!ctcpMessages.length)
    return false;

  // If there's some message left, send it back through the IRC handlers after
  // stripping out the CTCP information. I highly doubt this will ever happen,
  // but just in case. ;)
  if (otherMessage) {
    let message = aMessage;
    message.params.pop();
    message.params.push(otherMessage);
    ircHandlers.handleMessage(message);
  }

  // Loop over each raw CTCP message.
  for each (let message in ctcpMessages) {
    if (!ircHandlers.handleCTCPMessage(this, message)) {
      this.WARN("Unhandled CTCP message: " + message.ctcp.rawMessage +
                "\nin IRC message: " + message.rawMessage);
      // For unhandled CTCP message, respond with a NOTICE ERRMSG that echoes
      // back the original command.
      this.sendCTCPMessage(message.origin, true, "ERRMSG",
                           [message.ctcp.rawMessage, ":Unhandled CTCP command"]);
    }
  }

  // We have handled this message as much as we can.
  return true;
}

// This is the the basic CTCP protocol.
var ctcpBase = {
  // Parameters
  name: "CTCP",
  priority: ircHandlers.DEFAULT_PRIORITY,
  isEnabled: () => true,

  // These represent CTCP commands.
  commands: {
    "ACTION": function(aMessage) {
      // ACTION <text>
      // Display message in conversation
      this.getConversation(this.isMUCName(aMessage.params[0]) ?
                             aMessage.params[0] : aMessage.origin)
          .writeMessage(aMessage.origin, "/me " + aMessage.ctcp.param,
                        {incoming: true});
      return true;
    },

    // Used when an error needs to be replied with.
    "ERRMSG": function(aMessage) {
      this.WARN(aMessage.origin + " failed to handle CTCP message: " +
                aMessage.ctcp.param);
      return true;
    },

    // This is commented out since CLIENTINFO automatically returns the
    // supported CTCP parameters and this is not supported.

    // Returns the user's full name, and idle time.
    //"FINGER": function(aMessage) { return false; },

    // Dynamic master index of what a client knows.
    "CLIENTINFO": function(aMessage) {
      if (aMessage.command == "PRIVMSG") {
        // Received a CLIENTINFO request, respond with the support CTCP
        // messages.
        let info = new Set();
        for (let handler of ircHandlers._ctcpHandlers) {
          for (let command in handler.commands)
            info.add(command);
        }

        let supportedCtcp = [...info].join(" ");
        this.LOG("Reporting support for the following CTCP messages: " +
                 supportedCtcp);
        this.sendCTCPMessage(aMessage.origin, true, "CLIENTINFO",
                             supportedCtcp);
      }
      else {
        // Received a CLIENTINFO response, store the information for future
        // use.
        let info = aMessage.ctcp.param.split(" ");
        this.setWhois(aMessage.origin, {clientInfo: info})
      }
      return true;
    },

    // Used to measure the delay of the IRC network between clients.
    "PING": function(aMessage) {
      // PING timestamp
      if (aMessage.command == "PRIVMSG") {
        // Received PING request, send PING response.
        this.LOG("Received PING request from " + aMessage.origin +
                 ". Sending PING response: \"" + aMessage.ctcp.param + "\".");
        this.sendCTCPMessage(aMessage.origin, true, "PING",
                             aMessage.ctcp.param);
        return true;
      }
      else
        return this.handlePingReply(aMessage.origin, aMessage.ctcp.param);
    },

    // These are commented out since CLIENTINFO automatically returns the
    // supported CTCP parameters and this is not supported.

    // An encryption protocol between clients without any known reference.
    //"SED": function(aMessage) { return false; },

    // Where to obtain a copy of a client.
    //"SOURCE": function(aMessage) { return false; },

    // Gets the local date and time from other clients.
    "TIME": function(aMessage) {
      if (aMessage.command == "PRIVMSG") {
        // TIME
        // Received a TIME request, send a human readable response.
        let now = (new Date()).toString();
        this.LOG("Received TIME request from " + aMessage.origin +
                 ". Sending TIME response: \"" + now + "\".");
        this.sendCTCPMessage(aMessage.origin, true, "TIME", ":" + now);
      }
      else {
        // TIME :<human-readable-time-string>
        // Received a TIME reply, display it.
        // Remove the : prefix, if it exists and display the result.
        let time = aMessage.ctcp.param.slice(aMessage.ctcp.param[0] == ":");
        this.getConversation(aMessage.origin)
            .writeMessage(aMessage.origin,
                          _("ctcp.time", aMessage.origin, time),
                          {system: true});
      }
      return true;
    },

    // This is commented out since CLIENTINFO automatically returns the
    // supported CTCP parameters and this is not supported.

    // A string set by the user (never the client coder)
    //"USERINFO": function(aMessage) { return false; },

    // The version and type of the client.
    "VERSION": function(aMessage) {
      if (aMessage.command == "PRIVMSG") {
        // VERSION
        // Received VERSION request, send VERSION response.
        let version = Services.appinfo.name + " " + Services.appinfo.version;
        this.LOG("Received VERSION request from " + aMessage.origin +
                 ". Sending VERSION response: \"" + version + "\".");
        this.sendCTCPMessage(aMessage.origin, true, "VERSION", version);
      }
      else if (aMessage.command == "NOTICE" && aMessage.ctcp.param.length) {
        // VERSION #:#:#
        // Received VERSION response, display to the user.
        let response = _("ctcp.version", aMessage.origin,
                         aMessage.ctcp.param);
        this.getConversation(aMessage.origin)
            .writeMessage(aMessage.origin, response, {system: true});
      }
      return true;
    }
  }
};
