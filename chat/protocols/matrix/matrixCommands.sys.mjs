/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

ChromeUtils.defineESModuleGetters(lazy, {
  MatrixPowerLevels: "resource:///modules/matrixPowerLevels.sys.mjs",
  MatrixSDK: "resource:///modules/matrix-sdk.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "EVENT_TO_STRING", () => ({
  ban: "powerLevel.ban",
  [lazy.MatrixSDK.EventType.RoomAvatar]: "powerLevel.roomAvatar",
  [lazy.MatrixSDK.EventType.RoomCanonicalAlias]: "powerLevel.mainAddress",
  [lazy.MatrixSDK.EventType.RoomHistoryVisibility]: "powerLevel.history",
  [lazy.MatrixSDK.EventType.RoomName]: "powerLevel.roomName",
  [lazy.MatrixSDK.EventType.RoomPowerLevels]: "powerLevel.changePermissions",
  [lazy.MatrixSDK.EventType.RoomServerAcl]: "powerLevel.server_acl",
  [lazy.MatrixSDK.EventType.RoomTombstone]: "powerLevel.upgradeRoom",
  invite: "powerLevel.inviteUser",
  kick: "powerLevel.kickUsers",
  redact: "powerLevel.remove",
  state_default: "powerLevel.state_default",
  users_default: "powerLevel.defaultRole",
  events_default: "powerLevel.events_default",
  [lazy.MatrixSDK.EventType.RoomEncryption]: "powerLevel.encryption",
  [lazy.MatrixSDK.EventType.RoomTopic]: "powerLevel.topic",
}));

// Commands from element that we're not yet supporting (including equivalents):
// - /nick (no proper display name change support in matrix.sys.mjs yet)
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
  if (lazy.EVENT_TO_STRING.hasOwnProperty(eventType)) {
    return lazy._(lazy.EVENT_TO_STRING[eventType], userPower);
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
  const roomState = conv.roomState;
  const powerLevelEvent = roomState.getStateEvents(
    lazy.MatrixSDK.EventType.RoomPowerLevels,
    ""
  );
  const room = conv.room;

  const name = room.name;
  const nameString = lazy._("detail.name", name);
  conv.writeMessage(account.userId, nameString, {
    system: true,
  });

  const roomId = room.roomId;
  const roomIdString = lazy._("detail.roomId", roomId);
  conv.writeMessage(account.userId, roomIdString, {
    system: true,
  });

  const roomVersion = room.getVersion();
  const versionString = lazy._("detail.version", roomVersion);
  conv.writeMessage(account.userId, versionString, {
    system: true,
  });

  let topic = null;
  if (roomState.getStateEvents(lazy.MatrixSDK.EventType.RoomTopic)?.length) {
    topic = roomState
      .getStateEvents(lazy.MatrixSDK.EventType.RoomTopic)[0]
      .getContent().topic;
  }
  const topicString = lazy._("detail.topic", topic);
  conv.writeMessage(account.userId, topicString, {
    system: true,
  });

  const guestAccess = roomState
    .getStateEvents(lazy.MatrixSDK.EventType.RoomGuestAccess, "")
    ?.getContent()?.guest_access;
  const guestAccessString = lazy._("detail.guest", guestAccess);
  conv.writeMessage(account.userId, guestAccessString, {
    system: true,
  });

  const admins = [];
  const moderators = [];

  const powerLevel = powerLevelEvent.getContent();
  for (const [key, value] of Object.entries(powerLevel.users)) {
    if (value >= lazy.MatrixPowerLevels.admin) {
      admins.push(key);
    } else if (value >= lazy.MatrixPowerLevels.moderator) {
      moderators.push(key);
    }
  }

  if (admins.length) {
    const adminString = lazy._("detail.admin", admins.join(", "));
    conv.writeMessage(account.userId, adminString, {
      system: true,
    });
  }

  if (moderators.length) {
    const moderatorString = lazy._("detail.moderator", moderators.join(", "));
    conv.writeMessage(account.userId, moderatorString, {
      system: true,
    });
  }

  if (
    roomState.getStateEvents(lazy.MatrixSDK.EventType.RoomCanonicalAlias)
      ?.length
  ) {
    const canonicalAlias = room.getCanonicalAlias();
    const aliases = room.getAltAliases();
    if (canonicalAlias && !aliases.includes(canonicalAlias)) {
      aliases.unshift(canonicalAlias);
    }
    if (aliases.length) {
      const aliasString = lazy._("detail.alias", aliases.join(","));
      conv.writeMessage(account.userId, aliasString, {
        system: true,
      });
    }
  }

  conv.writeMessage(account.userId, lazy._("detail.power"), {
    system: true,
  });

  const defaultLevel = lazy.MatrixPowerLevels.getUserDefaultLevel(powerLevel);
  for (const [key, value] of Object.entries(powerLevel)) {
    if (key == "users") {
      continue;
    }
    if (key == "events") {
      for (const [userKey, userValue] of Object.entries(powerLevel.events)) {
        const userPower = lazy.MatrixPowerLevels.toText(
          userValue,
          defaultLevel
        );
        const powerString = getEventString(userKey, userPower);
        if (!powerString) {
          continue;
        }
        conv.writeMessage(account.userId, powerString, {
          system: true,
        });
      }
      continue;
    }
    const userPower = lazy.MatrixPowerLevels.toText(value, defaultLevel);
    const powerString = getEventString(key, userPower);
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
 * @returns {(string, IMConversation) => boolean} Command handler function that returns true when the command was handled.
 */
function runCommand(
  commandCallback,
  parameterCount,
  {
    requiredCount = parameterCount,
    validateParams = () => true,
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
 * @returns {(string, IMConversation) => boolean} Command handler function that returns true when the command was handled.
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

export var commands = [
  {
    name: "ban",
    get helpString() {
      return lazy._("command.ban", "ban");
    },
    run: clientCommand("ban", 2, { requiredCount: 1 }),
  },
  {
    name: "unban",
    get helpString() {
      return lazy._("command.unban", "unban");
    },
    run: clientCommand("unban", 1),
  },
  {
    name: "invite",
    get helpString() {
      return lazy._("command.invite", "invite");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: clientCommand("invite", 1),
  },
  {
    name: "kick",
    get helpString() {
      return lazy._("command.kick", "kick");
    },
    run: clientCommand("kick", 2, { requiredCount: 1 }),
  },
  {
    name: "op",
    get helpString() {
      return lazy._("command.op", "op");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: clientCommand("setPowerLevel", 2, {
      validateParams([, powerLevelString]) {
        const powerLevel = Number.parseInt(powerLevelString);
        return (
          Number.isInteger(powerLevel) &&
          powerLevel >= lazy.MatrixPowerLevels.user
        );
      },
      formatParams(conv, [userId, powerLevelString]) {
        const powerLevel = Number.parseInt(powerLevelString);
        return [conv._roomId, userId, powerLevel];
      },
    }),
  },
  {
    name: "deop",
    get helpString() {
      return lazy._("command.deop", "deop");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: clientCommand("setPowerLevel", 1, {
      formatParams(conv, [userId]) {
        return [conv._roomId, userId, lazy.MatrixPowerLevels.user];
      },
    }),
  },
  {
    name: "part",
    get helpString() {
      return lazy._("command.leave", "part");
    },
    run: clientCommand("leave", 0),
  },
  {
    name: "topic",
    get helpString() {
      return lazy._("command.topic", "topic");
    },
    run: runCommand((account, conv, [, topic]) => {
      conv.topic = topic;
      return true;
    }, 1),
  },
  {
    name: "visibility",
    get helpString() {
      return lazy._("command.visibility", "visibility");
    },
    run: clientCommand("setRoomDirectoryVisibility", 1, {
      formatParams(conv, [visibilityString]) {
        const visibility =
          Number.parseInt(visibilityString) === 1
            ? lazy.MatrixSDK.Visibility.Public
            : lazy.MatrixSDK.Visibility.Private;
        return [conv._roomId, visibility];
      },
    }),
  },
  {
    name: "roomname",
    get helpString() {
      return lazy._("command.roomname", "roomname");
    },
    run: clientCommand("setRoomName", 1),
  },
  {
    name: "detail",
    get helpString() {
      return lazy._("command.detail", "detail");
    },
    run(msg, convObj) {
      const account = getAccount(convObj);
      const conv = getConv(convObj);
      publishRoomDetails(account, conv);
      return true;
    },
  },
  {
    name: "addalias",
    get helpString() {
      return lazy._("command.addalias", "addalias");
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
      return lazy._("command.removealias", "removealias");
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
      return lazy._("command.me", "me");
    },
    run: runCommand((account, conv, [, message]) => {
      conv.sendMsg(message, true);
      return true;
    }, 1),
  },
  {
    name: "msg",
    get helpString() {
      return lazy._("command.msg", "msg");
    },
    run: runCommand((account, conv, [, userId, message]) => {
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
      return lazy._("command.join", "join");
    },
    run: runCommand(
      (account, conv, [, joinRoomId]) => {
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
