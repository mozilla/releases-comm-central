/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements server-time for IRC.
 *   https://ircv3.net/specs/extensions/server-time-3.2
 */

import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";

function handleServerTimeTag(aMsg) {
  if (aMsg.tagValue) {
    // Normalize leap seconds to the next second before it.
    const time = aMsg.tagValue.replace(/60.\d{3}(?=Z$)/, "59.999");
    aMsg.message.time = Math.floor(Date.parse(time) / 1000);
    aMsg.message.delayed = true;
  }
}

export var tagServerTime = {
  name: "server-time Tags",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled() {
    return (
      this._activeCAPs.has("server-time") ||
      this._activeCAPs.has("znc.in/server-time-iso")
    );
  },

  commands: {
    time: handleServerTimeTag,
    "znc.in/server-time-iso": handleServerTimeTag,
  },
};

export var capServerTime = {
  name: "server-time CAP",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    "server-time": function (aMessage) {
      if (
        aMessage.cap.subcommand === "LS" ||
        aMessage.cap.subcommand === "NEW"
      ) {
        this.addCAP("server-time");
        this.sendMessage("CAP", ["REQ", "server-time"]);
      } else if (
        aMessage.cap.subcommand === "ACK" ||
        aMessage.cap.subcommand === "NAK"
      ) {
        this.removeCAP("server-time");
      } else {
        return false;
      }
      return true;
    },
    "znc.in/server-time-iso": function (aMessage) {
      // Only request legacy server time CAP if the standard one is not available.
      if (
        (aMessage.cap.subcommand === "LS" ||
          aMessage.cap.subcommand === "NEW") &&
        !this._availableCAPs.has("server-time")
      ) {
        this.addCAP("znc.in/server-time-iso");
        this.sendMessage("CAP", ["REQ", "znc.in/server-time-iso"]);
      } else if (
        aMessage.cap.subcommand === "ACK" ||
        aMessage.cap.subcommand === "NAK"
      ) {
        this.removeCAP("znc.in/server-time-iso");
      } else {
        return false;
      }
      return true;
    },
  },
};
