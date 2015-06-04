/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["commands"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://chat/locale/xmpp.properties")
);

// Get conversation object.
function getConv(aConv) aConv.wrappedJSObject;

// Get account object.
function getAccount(aConv) getConv(aConv)._account;

var commands = [
  {
    name: "join",
    get helpString() _("command.join"),
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
    get helpString() _("command.part"),
    usageContext: Ci.imICommand.CMD_CONTEXT_CHAT,
    run: function(aMsg, aConv) {
      let conv = getConv(aConv);
      if (!conv.left)
        conv.part(aMsg);
      return true;
    }
  }
];
