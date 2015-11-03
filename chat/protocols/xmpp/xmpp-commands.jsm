/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["commands"];

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
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
  let conv = getConv(aConv);
  if (conv.left) {
    conv.writeMessage(conv.name,
                      _("conversation.error.commandFailedNotInRoom"),
                      {system: true});
    return null;
  }
  return conv;
}

// Trims the string and splits it in two parts on the first space
// if there is one. Returns the non-empty parts in an array.
function splitInput(aString) {
  let params = aString.trim();
  if (!params)
    return [];

  let splitParams = [];
  let offset = params.indexOf(" ");
  if (offset != -1) {
    splitParams.push(params.slice(0, offset));
    splitParams.push(params.slice(offset + 1).trimLeft());
  }
  else
    splitParams.push(params);
  return splitParams;
}

// Trims the string and splits it in two parts (The first part is a nickname
// and the second part is the rest of string) based on nicknames of current
// participants. Returns the non-empty parts in an array.
function splitByNick(aString, aConv) {
  let params = aString.trim();
  if (!params)
    return [];

  // Match trimmed-string with the longest prefix of participant's nickname.
  let nickName = "";
  for (let participant of aConv._participants.keys()) {
    if (params.startsWith(participant + " ") &&
        participant.length > nickName.length)
      nickName = participant;
  }
  if (!nickName) {
    let offset = params.indexOf(" ");
    let expectedNickName = offset != -1 ? params.slice(0, offset) : params;
    aConv.writeMessage(aConv.name,
                      _("conversation.error.nickNotInRoom", expectedNickName),
                      {system: true});
    return [];
  }

  let splitParams = [];
  splitParams.push(nickName);

  let msg = params.substring(nickName.length);
  if (msg)
    splitParams.push(msg.trimLeft());
  return splitParams;
}

var commands = [
  {
    name: "join",
    get helpString() { return _("command.join3", "join"); },
    run: function(aMsg, aConv, aReturnedConv) {
      let account = getAccount(aConv);
      let params = aMsg.trim();
      let conv;

      if (!params) {
        conv = getConv(aConv);
        if (!conv.isChat)
          return false;
        if (!conv.left)
          return true;

        // Rejoin the current conversation. If the conversation was explicitly
        // parted by the user, chatRoomFields will have been deleted.
        // Otherwise, make use of it.
        if (conv.chatRoomFields) {
          account.joinChat(conv.chatRoomFields);
          return true;
        }

        params = conv.name;
      }
      let chatRoomFields = account.getChatRoomDefaultFieldValues(params);
      conv = account.joinChat(chatRoomFields);

      if (aReturnedConv)
        aReturnedConv.value = conv;
      return true;
    }
  },
  {
    name: "part",
    get helpString() { return _("command.part2", "part"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let conv = getConv(aConv);
      if (!conv.left)
        conv.part(aMsg);
      return true;
    }
  },
  {
    name: "topic",
    get helpString() { return _("command.topic", "topic"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let conv = getMUC(aConv);
      if (!conv)
        return true;
      conv.topic = aMsg;
      return true;
    }
  },
  {
    name: "ban",
    get helpString() { return _("command.ban", "ban"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let params = splitInput(aMsg);
      if (!params.length)
        return false;

      let conv = getMUC(aConv);
      if (conv)
        conv.ban(...params);
      return true;
    }
  },
  {
    name: "kick",
    get helpString() { return _("command.kick", "kick"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let conv = getMUC(aConv);
      if (!conv)
        return true;

      let params = splitByNick(aMsg, conv);
      if (!params.length)
        return false;
      conv.kick(...params);
      return true;
    }
  },
  {
    name: "invite",
    get helpString() { return _("command.invite", "invite"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let params = splitInput(aMsg);
      if (!params.length)
        return false;

      let conv = getMUC(aConv);
      if (!conv)
        return true;

      // Check user's jid is valid.
      let account = getAccount(aConv);
      let jid = account._parseJID(params[0]);
      if (!jid) {
        conv.writeMessage(conv.name,
                          _("conversation.error.invalidJID", params[0]),
                          {system: true});
        return true;
      }
      conv.invite(...params);
      return true;
    }
  },
  {
    name: "me",
    get helpString() { return _("command.me", "me"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let params = aMsg.trim();
      if (!params)
        return false;

      // XEP-0245: The /me Command.
      // We need to append "/me " in the first four characters of the message
      // body.
      let conv = getConv(aConv);
      conv.sendMsg("/me " + params);

      return true;
    }
  },
  {
    name: "nick",
    get helpString() { return _("command.nick", "nick"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let params = aMsg.trim().split(/\s+/);
      if (!params[0])
        return false;

      let conv = getMUC(aConv);
      if (conv)
        conv.setNick(params[0]);
      return true;
    }
  },
  {
    name: "msg",
    get helpString() { return _("command.msg", "msg"); },
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv, aReturnedConv) {
      let conv = getMUC(aConv);
      if (!conv)
        return true;

      let params = splitByNick(aMsg, conv);
      if (params.length != 2)
        return false;
      let [nickName, msg] = params;

      let account = getAccount(aConv);
      let privateConv = account.createConversation(conv.name + "/" + nickName);
      if (!privateConv)
        return true;
      privateConv.sendMsg(msg.trim());

      if (aReturnedConv)
        aReturnedConv.value = privateConv;
      return true;
    }
  }
];
