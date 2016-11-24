/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements server-time for IRC.
 *   http://ircv3.net/specs/extensions/server-time-3.2.html
 */

this.EXPORTED_SYMBOLS = ["capServerTime", "tagServerTime"];

const Cu = Components.utils;

Cu.import("resource:///modules/ircHandlers.jsm");

function handleServerTimeTag(aMsg) {
  if (aMsg.tagValue) {
    // Normalize leap seconds to the next second before it.
    const time = aMsg.tagValue.replace(/60.\d{3}(?=Z$)/, "59.999");
    aMsg.message.time = Math.floor(Date.parse(time) / 1000);
    aMsg.message.delayed = true;
  }
}

var tagServerTime = {
  name: "server-time Tags",
  priority: ircHandlers.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    "time": handleServerTimeTag,
    "znc.in/server-time-iso": handleServerTimeTag
  }
};

var capServerTime = {
  name: "server-time CAP",
  priority: ircHandlers.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    "server-time": function(aMessage) {
      if (aMessage.cap.subcommand == "LS") {
        this.sendMessage("CAP", ["REQ", "server-time"]);
      }
      return true;
    },
    "znc.in/server-time-iso": function(aMessage) {
      if (aMessage.cap.subcommand == "LS") {
        this.sendMessage("CAP", ["REQ", "znc.in/server-time-iso"]);
      }
      return true;
    }
  }
};
