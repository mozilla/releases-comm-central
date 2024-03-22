/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

// Get conversation object.
function getConv(aConv) {
  return aConv.wrappedJSObject;
}

// Get account object.
function getAccount(aConv) {
  return getConv(aConv)._account;
}

function getMUC(aConv) {
  const conv = getConv(aConv);
  if (conv.left) {
    conv.writeMessage(
      conv.name,
      lazy._("conversation.error.commandFailedNotInRoom"),
      { system: true }
    );
    return null;
  }
  return conv;
}

// Trims the string and splits it in two parts on the first space
// if there is one. Returns the non-empty parts in an array.
function splitInput(aString) {
  const params = aString.trim();
  if (!params) {
    return [];
  }

  const splitParams = [];
  const offset = params.indexOf(" ");
  if (offset != -1) {
    splitParams.push(params.slice(0, offset));
    splitParams.push(params.slice(offset + 1).trimLeft());
  } else {
    splitParams.push(params);
  }
  return splitParams;
}

// Trims the string and splits it in two parts (The first part is a nickname
// and the second part is the rest of string) based on nicknames of current
// participants. Returns the non-empty parts in an array.
function splitByNick(aString, aConv) {
  const params = aString.trim();
  if (!params) {
    return [];
  }

  // Match trimmed-string with the longest prefix of participant's nickname.
  let nickName = "";
  for (const participant of aConv._participants.keys()) {
    if (
      params.startsWith(participant + " ") &&
      participant.length > nickName.length
    ) {
      nickName = participant;
    }
  }
  if (!nickName) {
    const offset = params.indexOf(" ");
    const expectedNickName = offset != -1 ? params.slice(0, offset) : params;
    aConv.writeMessage(
      aConv.name,
      lazy._("conversation.error.nickNotInRoom", expectedNickName),
      { system: true }
    );
    return [];
  }

  const splitParams = [];
  splitParams.push(nickName);

  const msg = params.substring(nickName.length);
  if (msg) {
    splitParams.push(msg.trimLeft());
  }
  return splitParams;
}

// Splits aMsg in two entries and checks the first entry is a valid jid, then
// passes it to aConv.invite().
// Returns false if aMsg is empty, otherwise returns true.
function invite(aMsg, aConv) {
  const params = splitInput(aMsg);
  if (!params.length) {
    return false;
  }

  // Check user's jid is valid.
  const account = getAccount(aConv);
  const jid = account._parseJID(params[0]);
  if (!jid) {
    aConv.writeMessage(
      aConv.name,
      lazy._("conversation.error.invalidJID", params[0]),
      { system: true }
    );
    return true;
  }

  aConv.invite(...params);
  return true;
}

export var commands = [
  {
    name: "join",
    get helpString() {
      return lazy._("command.join3", "join");
    },
    run(aMsg, aConv, aReturnedConv) {
      const account = getAccount(aConv);
      let params = aMsg.trim();
      let conv;

      if (!params) {
        conv = getConv(aConv);
        if (!conv.isChat) {
          return false;
        }
        if (!conv.left) {
          return true;
        }

        // Rejoin the current conversation. If the conversation was explicitly
        // parted by the user, chatRoomFields will have been deleted.
        // Otherwise, make use of it.
        if (conv.chatRoomFields) {
          account.joinChat(conv.chatRoomFields);
          return true;
        }

        params = conv.name;
      }
      const chatRoomFields = account.getChatRoomDefaultFieldValues(params);
      conv = account.joinChat(chatRoomFields);

      if (aReturnedConv) {
        aReturnedConv.value = conv;
      }
      return true;
    },
  },
  {
    name: "part",
    get helpString() {
      return lazy._("command.part2", "part");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const conv = getConv(aConv);
      if (!conv.left) {
        conv.part(aMsg);
      }
      return true;
    },
  },
  {
    name: "topic",
    get helpString() {
      return lazy._("command.topic", "topic");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const conv = getMUC(aConv);
      if (!conv) {
        return true;
      }
      conv.topic = aMsg;
      return true;
    },
  },
  {
    name: "ban",
    get helpString() {
      return lazy._("command.ban", "ban");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const params = splitInput(aMsg);
      if (!params.length) {
        return false;
      }

      const conv = getMUC(aConv);
      if (conv) {
        conv.ban(...params);
      }
      return true;
    },
  },
  {
    name: "kick",
    get helpString() {
      return lazy._("command.kick", "kick");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const conv = getMUC(aConv);
      if (!conv) {
        return true;
      }

      const params = splitByNick(aMsg, conv);
      if (!params.length) {
        return false;
      }
      conv.kick(...params);
      return true;
    },
  },
  {
    name: "invite",
    get helpString() {
      return lazy._("command.invite", "invite");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const conv = getMUC(aConv);
      if (!conv) {
        return true;
      }

      return invite(aMsg, conv);
    },
  },
  {
    name: "inviteto",
    get helpString() {
      return lazy._("command.inviteto", "inviteto");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.IM,
    run: (aMsg, aConv) => invite(aMsg, getConv(aConv)),
  },
  {
    name: "me",
    get helpString() {
      return lazy._("command.me", "me");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const params = aMsg.trim();
      if (!params) {
        return false;
      }

      const conv = getConv(aConv);
      conv.sendMsg(params, true);

      return true;
    },
  },
  {
    name: "nick",
    get helpString() {
      return lazy._("command.nick", "nick");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      const params = aMsg.trim().split(/\s+/);
      if (!params[0]) {
        return false;
      }

      const conv = getMUC(aConv);
      if (conv) {
        conv.setNick(params[0]);
      }
      return true;
    },
  },
  {
    name: "msg",
    get helpString() {
      return lazy._("command.msg", "msg");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv, aReturnedConv) {
      const conv = getMUC(aConv);
      if (!conv) {
        return true;
      }

      const params = splitByNick(aMsg, conv);
      if (params.length != 2) {
        return false;
      }
      const [nickName, msg] = params;

      const account = getAccount(aConv);
      const privateConv = account.createConversation(
        conv.name + "/" + nickName
      );
      if (!privateConv) {
        return true;
      }
      privateConv.sendMsg(msg.trim());

      if (aReturnedConv) {
        aReturnedConv.value = privateConv;
      }
      return true;
    },
  },
  {
    name: "version",
    get helpString() {
      return lazy._("command.version", "version");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.IM,
    run(aMsg, aConv) {
      const conv = getConv(aConv);
      if (conv.left) {
        return true;
      }

      // We do not have user's resource.
      if (!conv._targetResource) {
        conv.writeMessage(
          conv.name,
          lazy._("conversation.error.resourceNotAvailable", conv.shortName),
          {
            system: true,
          }
        );
        return true;
      }

      conv.getVersion();
      return true;
    },
  },
];
