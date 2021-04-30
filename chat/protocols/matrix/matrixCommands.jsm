/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["commands"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { EventType, MsgType } = ChromeUtils.import(
  "resource:///modules/matrix-sdk.jsm"
);

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

ChromeUtils.defineModuleGetter(
  this,
  "MatrixPowerLevels",
  "resource:///modules/matrixPowerLevels.jsm"
);

// Commands from element that we're not yet supporting (including equivalents):
// - /nick (no proper display name change support in matrix.jsm yet)
// - /myroomnick <display_name>
// - /roomavatar [<mxc_url>]
// - /myroomavatar [<mxc_url>]
// - /myavatar [<mxc_url>]
// - /ignore <user-id> (kind of available, but not matrix level ignores)
// - /unignore <user-id>
// - /whois <user-id>
// - /converttodm
// - /converttoroom
// - /upgraderoom

function getConv(conv) {
  return conv.wrappedJSObject;
}

function getAccount(conv) {
  return getConv(conv)._account;
}

var EVENT_TO_STRING = {
  ban: "powerLevel.ban",
  [EventType.RoomAvatar]: "powerLevel.roomAvatar",
  [EventType.RoomCanonicalAlias]: "powerLevel.mainAddress",
  [EventType.RoomHistoryVisibility]: "powerLevel.history",
  [EventType.RoomName]: "powerLevel.roomName",
  [EventType.RoomPowerLevels]: "powerLevel.changePermissions",
  [EventType.RoomServerAcl]: "powerLevel.server_acl",
  [EventType.RoomTombstone]: "powerLevel.upgradeRoom",
  invite: "powerLevel.inviteUser",
  kick: "powerLevel.kickUsers",
  redact: "powerLevel.remove",
  state_default: "powerLevel.state_default",
  users_default: "powerLevel.defaultRole",
  events_default: "powerLevel.events_default",
  [EventType.RoomEncryption]: "powerLevel.encryption",
  [EventType.RoomTopic]: "powerLevel.topic",
};

/**
 * Generates a string representing the required power level to send an event
 * in a room.
 *
 * @param {string} eventType - Matrix event type.
 * @param {number} userPower - Power level required to send the events.
 * @returns {string} Human readable representation of the event type and its
 * required power level.
 */
function getEventString(eventType, userPower) {
  if (EVENT_TO_STRING.hasOwnProperty(eventType)) {
    return _(EVENT_TO_STRING[eventType], userPower);
  }
  return null;
}

/**
 * Lists out many room details, like aliases and permissions, as notices in
 * their room.
 *
 * @param {imIAccount} account - Account of the room.
 * @param {prplIConversation} conv - Conversation to list details for.
 */
function publishRoomDetails(account, conv) {
  let roomState = conv.roomState;
  let powerLevelEvent = roomState.getStateEvents(EventType.RoomPowerLevels, "");
  let room = conv.room;

  let name = room.name;
  let nameString = _("detail.name", name);
  conv.writeMessage(account.userId, nameString, {
    system: true,
  });

  let roomId = room.roomId;
  let roomIdString = _("detail.roomId", roomId);
  conv.writeMessage(account.userId, roomIdString, {
    system: true,
  });

  let roomVersion = room.getVersion();
  let versionString = _("detail.version", roomVersion);
  conv.writeMessage(account.userId, versionString, {
    system: true,
  });

  let topic = null;
  if (roomState.getStateEvents(EventType.RoomTopic).length) {
    topic = roomState.getStateEvents(EventType.RoomTopic)[0].getContent().topic;
  }
  let topicString = _("detail.topic", topic);
  conv.writeMessage(account.userId, topicString, {
    system: true,
  });

  let guestAccess = roomState
    .getStateEvents(EventType.RoomGuestAccess, "")
    .getContent().guest_access;
  let guestAccessString = _("detail.guest", guestAccess);
  conv.writeMessage(account.userId, guestAccessString, {
    system: true,
  });

  let admins = [];
  let moderators = [];

  let powerLevel = powerLevelEvent.getContent();
  for (let [key, value] of Object.entries(powerLevel.users)) {
    if (value >= MatrixPowerLevels.admin) {
      admins.push(key);
    } else if (value >= MatrixPowerLevels.moderator) {
      moderators.push(key);
    }
  }

  if (admins.length) {
    let adminString = _("detail.admin", admins.join(", "));
    conv.writeMessage(account.userId, adminString, {
      system: true,
    });
  }

  if (moderators.length) {
    let moderatorString = _("detail.moderator", moderators.join(", "));
    conv.writeMessage(account.userId, moderatorString, {
      system: true,
    });
  }

  if (roomState.getStateEvents(EventType.RoomCanonicalAlias).length) {
    let event = roomState.getStateEvents(EventType.RoomCanonicalAlias)[0];
    let content = event.getContent();
    let aliases = content.alt_aliases;
    if (aliases) {
      let aliasString = _("detail.alias", aliases.join(","));
      conv.writeMessage(account.userId, aliasString, {
        system: true,
      });
    }
  }

  conv.writeMessage(account.userId, _("detail.power"), {
    system: true,
  });

  const defaultLevel = powerLevel.users_default;
  for (let [key, value] of Object.entries(powerLevel)) {
    if (key == "users") {
      continue;
    }
    if (key == "events") {
      for (let [userKey, userValue] of Object.entries(powerLevel.events)) {
        let userPower = MatrixPowerLevels.toText(userValue, defaultLevel);
        let powerString = getEventString(userKey, userPower);
        if (!powerString) {
          continue;
        }
        conv.writeMessage(account.userId, powerString, {
          system: true,
        });
      }
      continue;
    }
    let userPower = MatrixPowerLevels.toText(value, defaultLevel);
    let powerString = getEventString(key, userPower);
    if (!powerString) {
      continue;
    }
    conv.writeMessage(account.userId, powerString, {
      system: true,
    });
  }
}

/**
 * Generic command handler for commands with up to 2 params.
 *
 * @param {(imIAccount, prplIConversation, string[]) => boolean} commandCallback - Command handler implementation. Returns true when successful.
 * @param {number} parameterCount - Number of parameters. Maximum 2.
 * @param {object} [options] - Extra options.
 * @param {number} [options.requiredCount] - How many of the parameters are required (from the start).
 * @param {(string[]) => boolean} [options.validateParams] - Validator function for params.
 * @param {(prplIConversation, string[]) => any[]} [options.formatParams] - Formatting function for params.
 * @returns {(string, imIConversation) => boolean} Command handler function that returns true when the command was handled.
 */
function runCommand(
  commandCallback,
  parameterCount,
  {
    requiredCount = parameterCount,
    validateParams = params => true,
    formatParams = (conv, params) => [conv._roomId, ...params],
  } = {}
) {
  if (parameterCount > 2) {
    throw new Error("Can not handle more than two parameters");
  }
  return (msg, convObj) => {
    // Parse msg into the given parameter count
    let params = [];
    const trimmedMsg = msg.trim();
    if (parameterCount === 0) {
      if (trimmedMsg) {
        return false;
      }
    } else if (parameterCount === 1) {
      if (!trimmedMsg.length && requiredCount > 0) {
        return false;
      }
      params.push(trimmedMsg);
    } else if (parameterCount === 2) {
      if (
        (!trimmedMsg.length && requiredCount > 0) ||
        (!trimmedMsg.includes(" ") && requiredCount > 1)
      ) {
        return false;
      }
      const separatorIndex = trimmedMsg.indexOf(" ");
      if (separatorIndex > 0) {
        params.push(
          trimmedMsg.slice(0, separatorIndex),
          trimmedMsg.slice(separatorIndex + 1)
        );
      } else {
        params.push(trimmedMsg);
      }
    }

    if (!validateParams(params)) {
      return false;
    }

    const account = getAccount(convObj);
    const conv = getConv(convObj);
    params = formatParams(conv, params);
    return commandCallback(account, conv, params);
  };
}

/**
 * Generic command handler that calls a matrix JS client method. First param
 * is always the roomId.
 *
 * @param {string} clientMethod - Name of the method on the matrix client.
 * @param {number} parameterCount - Number of parameters. Maximum 2.
 * @param {object} [options] - Extra options.
 * @param {number} [options.requiredCount] - How many of the parameters are required (from the start).
 * @param {(string[]) => boolean} [options.validateParams] - Validator function for params.
 * @param {(prplIConversation, string[]) => any[]} [options.formatParams] - Formatting function for params.
 * @returns {(string, imIConversation) => boolean} Command handler function that returns true when the command was handled.
 */
function clientCommand(clientMethod, parameterCount, options) {
  return runCommand(
    (account, conv, params) => {
      account._client[clientMethod](...params).catch(error => {
        conv.writeMessage(account.userId, error.message, {
          system: true,
          error: true,
        });
      });
      return true;
    },
    parameterCount,
    options
  );
}

var commands = [
  {
    name: "ban",
    get helpString() {
      return _("command.ban", "ban");
    },
    run: clientCommand("ban", 2, { requiredCount: 1 }),
  },
  {
    name: "unban",
    get helpString() {
      return _("command.unban", "unban");
    },
    run: clientCommand("unban", 1),
  },
  {
    name: "invite",
    get helpString() {
      return _("command.invite", "invite");
    },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: clientCommand("invite", 1),
  },
  {
    name: "kick",
    get helpString() {
      return _("command.kick", "kick");
    },
    run: clientCommand("kick", 2, { requiredCount: 1 }),
  },
  {
    name: "op",
    get helpString() {
      return _("command.op", "op");
    },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: clientCommand("setPowerLevel", 2, {
      validateParams([userId, powerLevelString]) {
        const powerLevel = Number.parseInt(powerLevelString);
        return (
          Number.isInteger(powerLevel) && powerLevel >= MatrixPowerLevels.user
        );
      },
      formatParams(conv, [userId, powerLevelString]) {
        const powerLevel = Number.parseInt(powerLevelString);
        let powerLevelEvent = conv.roomState.getStateEvents(
          EventType.RoomPowerLevels,
          ""
        );
        return [conv._roomId, userId, powerLevel, powerLevelEvent];
      },
    }),
  },
  {
    name: "deop",
    get helpString() {
      return _("command.deop", "deop");
    },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: clientCommand("setPowerLevel", 1, {
      formatParams(conv, [userId]) {
        const powerLevelEvent = conv.roomState.getStateEvents(
          EventType.RoomPowerLevels,
          ""
        );
        return [conv._roomId, userId, MatrixPowerLevels.user, powerLevelEvent];
      },
    }),
  },
  {
    name: "part",
    get helpString() {
      return _("command.leave", "leave");
    },
    run: clientCommand("leave", 0),
  },
  {
    name: "topic",
    get helpString() {
      return _("command.topic", "topic");
    },
    run: runCommand((account, conv, [roomId, topic]) => {
      conv.topic = topic;
      return true;
    }, 1),
  },
  {
    name: "visibility",
    get helpString() {
      return _("command.visibility", "visibility");
    },
    run: clientCommand("setRoomDirectoryVisibility", 1, {
      formatParams(conv, [visibilityString]) {
        const visibility =
          Number.parseInt(visibilityString) === 1 ? "public" : "private";
        return [conv._roomId, visibility];
      },
    }),
  },
  {
    name: "roomname",
    get helpString() {
      return _("command.roomname", "roomname");
    },
    run: clientCommand("setRoomName", 1),
  },
  {
    name: "detail",
    get helpString() {
      return _("command.detail", "detail");
    },
    run(msg, convObj, returnedConv) {
      let account = getAccount(convObj);
      let conv = getConv(convObj);
      publishRoomDetails(account, conv);
      return true;
    },
  },
  {
    name: "addalias",
    get helpString() {
      return _("command.addalias", "addalias");
    },
    run: clientCommand("createAlias", 1, {
      formatParams(conv, [alias]) {
        return [alias, conv._roomId];
      },
    }),
  },
  {
    name: "removealias",
    get helpString() {
      return _("command.removealias", "removealias");
    },
    run: clientCommand("deleteAlias", 1, {
      formatParams(conv, [alias]) {
        return [alias];
      },
    }),
  },
  {
    name: "me",
    get helpString() {
      return _("command.me", "me");
    },
    run: clientCommand("sendEvent", 1, {
      formatParams(conv, [message]) {
        const content = {
          body: message,
          msgtype: MsgType.Emote,
        };
        return [conv._roomId, EventType.RoomMessage, content];
      },
    }),
  },
  {
    name: "msg",
    get helpString() {
      return _("command.msg", "msg");
    },
    run: runCommand((account, conv, [roomId, userId, message]) => {
      const room = account.getDirectConversation(userId);
      if (room) {
        room.waitForRoom().then(readyRoom => {
          readyRoom.sendMsg(message);
        });
      } else {
        account.ERROR("Could not create room for direct message to " + userId);
      }
      return true;
    }, 2),
  },
  {
    name: "join",
    get helpString() {
      return _("command.join", "join");
    },
    run: runCommand(
      (account, conv, [currentRoomId, joinRoomId]) => {
        account.getGroupConversation(joinRoomId);
        return true;
      },
      1,
      {
        validateParams([roomId]) {
          // TODO support joining rooms without a human readable ID.
          return roomId.startsWith("#");
        },
      }
    ),
  },
];
