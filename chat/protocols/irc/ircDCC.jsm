/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This contains an implementation of the Direct Client-to-Client (DCC)
 * protocol.
 *   A description of the DCC protocol
 *     http://www.irchelp.org/irchelp/rfc/dccspec.html
 */

const EXPORTED_SYMBOLS = ["ctcpDCC" /* , "dccBase"*/];

const { ircHandlers } = ChromeUtils.import(
  "resource:///modules/ircHandlers.jsm"
);

// Parse a CTCP message into a DCC message. A DCC message is a CTCP message of
// the form:
//   DCC <type> <argument> <address> <port> [<size>]
function DCCMessage(aMessage, aAccount) {
  let message = aMessage;
  let params = message.ctcp.param.split(" ");
  if (params.length < 4) {
    aAccount.ERROR("Not enough DCC parameters:\n" + JSON.stringify(aMessage));
    return null;
  }

  try {
    // Address, port and size should be treated as unsigned long, unsigned short
    // and unsigned long, respectively. The protocol is designed to handle
    // further arguments, if necessary.
    message.ctcp.dcc = {
      type: params[0],
      argument: params[1],
      address: Number(params[2]),
      port: Number(params[3]),
      size: params.length == 5 ? Number(params[4]) : null,
      furtherArguments: params.length > 5 ? params.slice(5) : [],
    };
  } catch (e) {
    aAccount.ERROR(
      "Error parsing DCC parameters:\n" + JSON.stringify(aMessage)
    );
    return null;
  }

  return message;
}

// This is the DCC handler for CTCP, it will call each DCC handler.
var ctcpDCC = {
  name: "DCC",
  // Slightly above default CTCP priority.
  priority: ircHandlers.HIGH_PRIORITY + 10,
  isEnabled: () => true,

  commands: {
    // Handle a DCC message by parsing the message and executing any handlers.
    DCC(aMessage) {
      // If there are no DCC handlers, then don't parse the DCC message.
      if (!ircHandlers.hasDCCHandlers) {
        return false;
      }

      // Parse the message and attempt to handle it.
      return ircHandlers.handleDCCMessage(this, DCCMessage(aMessage, this));
    },
  },
};
