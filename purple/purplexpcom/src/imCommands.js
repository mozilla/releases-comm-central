/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2011.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

XPCOMUtils.defineLazyServiceGetter(this, "obs",
                                   "@mozilla.org/observer-service;1",
                                   "nsIObserverService");

function CommandsService() { }
CommandsService.prototype = {
  initCommands: function() {
    this._commands = {};
    this.registerCommand({
      name: "raw",
      priority: Ci.imICommand.PRIORITY_DEFAULT,
      run: function(aMsg, aConv) {
        aConv.sendMsg(aMsg);
        return true;
      }
    });
  },
  unInitCommands: function() {
    delete this._commands;
  },

  registerCommand: function(aCommand, aPrplId) {
    let name = aCommand.name;
    if (!name)
      throw Cr.NS_ERROR_INVALID_ARG;

    if (!(this._commands.hasOwnProperty(name)))
      this._commands[name] = {};
    this._commands[name][aPrplId || ""] = aCommand;
  },
  unregisterCommand: function(aCommandName, aPrplId) {
    if (this._commands.hasOwnProperty(aCommandName)) {
      let prplId = aPrplId || "";
      let commands = this._commands[aCommandName];
      if (commands.hasOwnProperty(aPrplId))
        delete commands[aPrplId];
      if (!Object.keys(commands).length)
        delete this._commands[aCommandName];
    }
  },
  listCommands: function(aConversation, commandCount) {
    let result = [];
    let prplId = aConversation && aConversation.account.protocol.id;
    for (let name in this._commands) {
      let commands = this._commands[name];
      if (commands.hasOwnProperty(""))
        result.push(commands[""]);
      if (prplId && commands.hasOwnProperty(prplId))
        result.push(commands[prplId]);
    }
    commandCount.value = result.length;
    return result;
  },
  executeCommand: function (aMessage, aConversation) {
    if (!aMessage)
      throw Cr.NS_ERROR_INVALID_ARG;

    let matchResult;
    if (aMessage[0] != "/" ||
        !(matchResult = /^\/([a-z]+)(?: |$)([\s\S]*)/(aMessage)))
      return false;

    let [, name, args] = matchResult;
    if (!(this._commands.hasOwnProperty(name)))
      return false;

    // Get the 2 possible commands (the global and the proto specific)
    let cmdArray = [];
    let commands = this._commands[name];
    if (commands.hasOwnProperty(""))
      cmdArray.push(commands[""]);

    if (aConversation) {
      let prplId = aConversation.account.protocol.id;
      if (commands.hasOwnProperty(prplId))
        cmdArray.push(commands[prplId]);
    }

    // Attempt to apply them in order until one succeeds.
    return cmdArray.sort(function(a, b) b.priority - a.priority)
                   .some(function (aCmd) aCmd.run(args, aConversation));
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.imICommandsService]),
  classDescription: "Commands",
  classID: Components.ID("{7cb20c68-ccc8-4a79-b6f1-0b4771ed6c23}"),
  contractID: "@instantbird.org/purple/commands-service;1"
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandsService]);
