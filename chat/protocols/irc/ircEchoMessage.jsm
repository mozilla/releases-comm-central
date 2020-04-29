/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements the echo-message capability for IRC.
 *   https://ircv3.net/specs/extensions/echo-message-3.2
 *
 * When enabled, displaying of a sent messages is disabled (until it is received
 * by the server and sent back to the sender). This helps to ensure the ordering
 * of messages is consistent for all participants in a channel and also helps
 * signify whether a message was properly sent to a channel during disconnect.
 */

const EXPORTED_SYMBOLS = ["capEchoMessage"];

const { ircHandlers } = ChromeUtils.import(
  "resource:///modules/ircHandlers.jsm"
);

var capEchoMessage = {
  name: "echo-message CAP",
  priority: ircHandlers.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    "echo-message": function(aMessage) {
      if (
        aMessage.cap.subcommand === "LS" ||
        aMessage.cap.subcommand === "NEW"
      ) {
        this.addCAP("echo-message");
        this.sendMessage("CAP", ["REQ", "echo-message"]);
      } else if (
        aMessage.cap.subcommand === "ACK" ||
        aMessage.cap.subcommand === "NAK"
      ) {
        this.removeCAP("echo-message");
      } else {
        return false;
      }
      return true;
    },
  },
};
