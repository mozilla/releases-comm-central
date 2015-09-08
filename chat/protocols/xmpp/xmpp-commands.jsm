/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["commands"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

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
    splitParams.push(params.slice(offset + 1));
  }
  else
    splitParams.push(params);
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
      let conv = getConv(aConv);
      if (!conv.left)
        conv.topic = aMsg;
      return true;
    }
  },
  {
    name: "ban",
    get helpString() _("command.ban", "ban"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let params = splitInput(aMsg);
      if (!params.length)
        return false;

      let conv = getConv(aConv);
      if (!conv.left)
        conv.ban(params[0], params[1]);
      return true;
    }
  },
  {
    name: "kick",
    get helpString() _("command.kick", "kick"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let params = splitInput(aMsg);
      if (!params.length)
        return false;

      let conv = getConv(aConv);
      if (!conv.left)
        conv.ban(params[0], params[1]);
      return true;
    }
  }
];
