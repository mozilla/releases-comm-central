/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This contains an implementation of the multi-prefix IRC extension. This fixes
 * a protocol level bug where the following can happen:
 *   foo MODE +h
 *   foo MODE +o
 *   bar JOINs the channel (and receives @foo)
 *   foo MODE -o
 * foo knows that it has mode +h, but bar does not know foo has +h set.
 *
 *   https://docs.inspircd.org/2/modules/namesx/
 *   https://ircv3.net/specs/extensions/multi-prefix-3.1
 */

import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";

export var isupportNAMESX = {
  name: "ISUPPORT NAMESX",
  // Slightly above default ISUPPORT priority.
  priority: ircHandlerPriorities.DEFAULT_PRIORITY + 10,
  isEnabled: () => true,

  commands: {
    NAMESX() {
      this.sendMessage("PROTOCTL", "NAMESX");
      return true;
    },
  },
};

export var capMultiPrefix = {
  name: "CAP multi-prefix",
  // Slightly above default ISUPPORT priority.
  priority: ircHandlerPriorities.HIGH_PRIORITY,
  isEnabled: () => true,

  commands: {
    "multi-prefix": function (aMessage) {
      // Request to use multi-prefix if it is supported.
      if (
        aMessage.cap.subcommand === "LS" ||
        aMessage.cap.subcommand === "NEW"
      ) {
        this.addCAP("multi-prefix");
        this.sendMessage("CAP", ["REQ", "multi-prefix"]);
      } else if (
        aMessage.cap.subcommand === "ACK" ||
        aMessage.cap.subcommand === "NAK"
      ) {
        this.removeCAP("multi-prefix");
      } else {
        return false;
      }
      return true;
    },
  },
};
