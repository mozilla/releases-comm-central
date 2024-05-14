/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/matrix-properties.ftl"], true)
);

ChromeUtils.defineESModuleGetters(lazy, {
  MatrixPowerLevels: "resource:///modules/matrixPowerLevels.sys.mjs",
  MatrixSDK: "resource:///modules/matrix-sdk.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "EVENT_TO_STRING", () => ({
  ban: "power-level-ban",
  [lazy.MatrixSDK.EventType.RoomAvatar]: "power-level-room-avatar",
  [lazy.MatrixSDK.EventType.RoomCanonicalAlias]: "power-level-main-address",
  [lazy.MatrixSDK.EventType.RoomHistoryVisibility]: "power-level-history",
  [lazy.MatrixSDK.EventType.RoomName]: "power-level-room-name",
  [lazy.MatrixSDK.EventType.RoomPowerLevels]: "power-level-change-permissions",
  [lazy.MatrixSDK.EventType.RoomServerAcl]: "power-level-server-acl",
  [lazy.MatrixSDK.EventType.RoomTombstone]: "power-level-upgrade-room",
  invite: "power-level-invite-user",
  kick: "power-level-kick-users",
  redact: "power-level-remove",
  state_default: "power-level-state-default",
  users_default: "power-level-default-role",
  events_default: "power-level-events-default",
  [lazy.MatrixSDK.EventType.RoomEncryption]: "power-level-encryption",
  [lazy.MatrixSDK.EventType.RoomTopic]: "power-level-topic",
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
    return lazy.l10n.formatValueSync(lazy.EVENT_TO_STRING[eventType], {
      var1: userPower,
    });
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
  const nameString = lazy.l10n.formatValueSync("detail-name", { value: name });
  conv.writeMessage(account.userId, nameString, {
    system: true,
  });

  const roomId = room.roomId;
  const roomIdString = lazy.l10n.formatValueSync("detail-room-id", {
    value: roomId,
  });
  conv.writeMessage(account.userId, roomIdString, {
    system: true,
  });

  const roomVersion = room.getVersion();
  const versionString = lazy.l10n.formatValueSync("detail-version", {
    value: roomVersion,
  });
  conv.writeMessage(account.userId, versionString, {
    system: true,
  });

  let topic = null;
  if (roomState.getStateEvents(lazy.MatrixSDK.EventType.RoomTopic)?.length) {
    topic = roomState
      .getStateEvents(lazy.MatrixSDK.EventType.RoomTopic)[0]
      .getContent().topic;
  }
  const topicString = lazy.l10n.formatValueSync("detail-topic", {
    value: topic,
  });
  conv.writeMessage(account.userId, topicString, {
    system: true,
  });

  const guestAccess = roomState
    .getStateEvents(lazy.MatrixSDK.EventType.RoomGuestAccess, "")
    ?.getContent()?.guest_access;
  const guestAccessString = lazy.l10n.formatValueSync("detail-guest", {
    value: guestAccess,
  });
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
    const adminString = lazy.l10n.formatValueSync("detail-admin", {
      value: admins.join(", "),
    });
    conv.writeMessage(account.userId, adminString, {
      system: true,
    });
  }

  if (moderators.length) {
    const moderatorString = lazy.l10n.formatValueSync("detail-moderator", {
      value: moderators.join(", "),
    });
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
      const aliasString = lazy.l10n.formatValueSync("detail-alias", {
        value: aliases.join(","),
      });
      conv.writeMessage(account.userId, aliasString, {
        system: true,
      });
    }
  }

  conv.writeMessage(account.userId, lazy.l10n.formatValueSync("detail-power"), {
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
      return lazy.l10n.formatValueSync("command-ban", { commandName: "ban" });
    },
    run: clientCommand("ban", 2, { requiredCount: 1 }),
  },
  {
    name: "unban",
    get helpString() {
      return lazy.l10n.formatValueSync("command-unban", {
        commandName: "unban",
      });
    },
    run: clientCommand("unban", 1),
  },
  {
    name: "invite",
    get helpString() {
      return lazy.l10n.formatValueSync("command-invite", {
        commandName: "invite",
      });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: clientCommand("invite", 1),
  },
  {
    name: "kick",
    get helpString() {
      return lazy.l10n.formatValueSync("command-kick", { commandName: "kick" });
    },
    run: clientCommand("kick", 2, { requiredCount: 1 }),
  },
  {
    name: "op",
    get helpString() {
      return lazy.l10n.formatValueSync("command-op", { commandName: "op" });
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
      return lazy.l10n.formatValueSync("command-deop", { commandName: "deop" });
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
      return lazy.l10n.formatValueSync("command-leave", {
        commandName: "part",
      });
    },
    run: clientCommand("leave", 0),
  },
  {
    name: "topic",
    get helpString() {
      return lazy.l10n.formatValueSync("command-topic", {
        commandName: "topic",
      });
    },
    run: runCommand((account, conv, [, topic]) => {
      conv.topic = topic;
      return true;
    }, 1),
  },
  {
    name: "visibility",
    get helpString() {
      return lazy.l10n.formatValueSync("command-visibility", {
        commandName: "visibility",
      });
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
      return lazy.l10n.formatValueSync("command-roomname", {
        commandName: "roomname",
      });
    },
    run: clientCommand("setRoomName", 1),
  },
  {
    name: "detail",
    get helpString() {
      return lazy.l10n.formatValueSync("command-detail", {
        commandName: "detail",
      });
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
      return lazy.l10n.formatValueSync("command-addalias", {
        commandName: "addalias",
      });
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
      return lazy.l10n.formatValueSync("command-removealias", {
        commandName: "removealias",
      });
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
      return lazy.l10n.formatValueSync("command-me", { commandName: "me" });
    },
    run: runCommand((account, conv, [, message]) => {
      conv.sendMsg(message, true);
      return true;
    }, 1),
  },
  {
    name: "msg",
    get helpString() {
      return lazy.l10n.formatValueSync("command-msg", { commandName: "msg" });
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
      return lazy.l10n.formatValueSync("command-join", { commandName: "join" });
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
