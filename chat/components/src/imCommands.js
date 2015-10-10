/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/commands.properties")
);

function CommandsService() { }
CommandsService.prototype = {
  initCommands: function() {
    this._commands = {};
    // The say command is directly implemented in the UI layer, but has a
    // dummy command registered here so it shows up as a command (e.g. when
    // using the /help command).
    this.registerCommand({
      name: "say",
      get helpString() { return _("sayHelpString"); },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
      priority: Ci.imICommand.CMD_PRIORITY_HIGH,
      run: function(aMsg, aConv) {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      }
    });

    this.registerCommand({
      name: "raw",
      get helpString() { return _("rawHelpString"); },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
      priority: Ci.imICommand.CMD_PRIORITY_DEFAULT,
      run: function(aMsg, aConv) {
        let conv = Services.conversations.getUIConversation(aConv);
        if (!conv)
          return false;
        conv.sendMsg(aMsg);
        return true;
      }
    });

    this.registerCommand({
      // Reference the command service so we can use the internal properties
      // directly.
      cmdSrv: this,

      name: "help",
      get helpString() { return _("helpHelpString"); },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
      priority: Ci.imICommand.CMD_PRIORITY_DEFAULT,
      run: function(aMsg, aConv) {
        let conv = Services.conversations.getUIConversation(aConv);
        if (!conv)
          return false;

        // Handle when no command is given, list all possible commands that are
        // available for this conversation (alphabetically).
        if (!aMsg) {
          let commands = this.cmdSrv.listCommandsForConversation(aConv, {});
          if (!commands.length)
            return false;

          // Concatenate the command names (separated by a comma and space).
          let cmds = commands.map(aCmd => aCmd.name).sort().join(", ");
          let message = _("commands", cmds);

          // Display the message
          conv.systemMessage(message);
          return true;
        }

        // A command name was given, find the commands that match.
        let cmdArray = this.cmdSrv._findCommands(aConv, aMsg);

        if (!cmdArray.length) {
          // No command that matches.
          let message = _("noCommand", aMsg);
          conv.systemMessage(message);
          return true;
        }

        // Only show the help for the one of the highest priority.
        let cmd = cmdArray[0];

        let text = cmd.helpString;
        if (!text)
          text = _("noHelp", cmd.name);

        // Display the message.
        conv.systemMessage(text);
        return true;
      }
    });

    // Status commands
    let status = {
      back: "AVAILABLE",
      away: "AWAY",
      busy: "UNAVAILABLE",
      dnd: "UNAVAILABLE",
      offline: "OFFLINE"
    };
    for (let cmd in status) {
      let statusValue = Ci.imIStatusInfo["STATUS_" + status[cmd]];
      this.registerCommand({
        name: cmd,
        get helpString() { return _("statusCommand", this.name, _(this.name)); },
        usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
        priority: Ci.imICommand.CMD_PRIORITY_HIGH,
        run: function(aMsg) {
          Services.core.globalUserStatus.setStatus(statusValue, aMsg);
          return true;
        }
      });
    }
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
      if (commands.hasOwnProperty(prplId))
        delete commands[prplId];
      if (!Object.keys(commands).length)
        delete this._commands[aCommandName];
    }
  },
  listCommandsForConversation: function(aConversation, commandCount) {
    let result = [];
    let prplId = aConversation && aConversation.account.protocol.id;
    for (let name in this._commands) {
      let commands = this._commands[name];
      if (commands.hasOwnProperty(""))
        result.push(commands[""]);
      if (prplId && commands.hasOwnProperty(prplId))
        result.push(commands[prplId]);
    }
    if (aConversation)
      result = result.filter(this._usageContextFilter(aConversation));
    commandCount.value = result.length;
    return result;
  },
  // List only the commands for a protocol (excluding the global commands).
  listCommandsForProtocol: function(aPrplId, commandCount) {
    if (!aPrplId)
      throw "You must provide a prpl ID.";

    let result = [];
    for (let name in this._commands) {
      let commands = this._commands[name];
      if (commands.hasOwnProperty(aPrplId))
        result.push(commands[aPrplId]);
    }
    commandCount.value = result.length;
    return result;
  },
  _usageContextFilter: function(aConversation) {
    let usageContext =
      Ci.imICommand["CMD_CONTEXT_" + (aConversation.isChat ? "CHAT" : "IM")];
    return c => c.usageContext & usageContext;
  },
  _findCommands: function(aConversation, aName) {
    let prplId = null;
    if (aConversation) {
      let account = aConversation.account;
      if (account.connected)
        prplId = account.protocol.id;
    }

    let commandNames;
    // If there is an exact match for the given command name,
    // don't look at any other commands.
    if (this._commands.hasOwnProperty(aName))
      commandNames = [aName];
    // Otherwise, check if there is a partial match.
    else {
      commandNames = Object.keys(this._commands)
                           .filter(command => command.startsWith(aName));
    }

    // If a single full command name matches the given (partial)
    // command name, return the results for that command name. Otherwise,
    // return an empty array (don't assume a certain command).
    let cmdArray = [];
    for (let commandName of commandNames) {
      let matches = [];

      // Get the 2 possible commands (the global and the proto specific).
      let commands = this._commands[commandName];
      if (commands.hasOwnProperty(""))
        matches.push(commands[""]);
      if (prplId && commands.hasOwnProperty(prplId))
        matches.push(commands[prplId]);

      // Remove the commands that can't apply in this context.
      if (aConversation)
        matches = matches.filter(this._usageContextFilter(aConversation));

      if (!matches.length)
        continue;

      // If we have found a second matching command name, return the empty array.
      if (cmdArray.length)
        return [];

      cmdArray = matches;
    }

    // Sort the matching commands by priority before returning the array.
    return cmdArray.sort((a, b) => b.priority - a.priority);
  },
  executeCommand: function(aMessage, aConversation, aReturnedConv) {
    if (!aMessage)
      throw Cr.NS_ERROR_INVALID_ARG;

    let matchResult;
    if (aMessage[0] != "/" ||
        !(matchResult = /^\/([a-z0-9]+)(?: |$)([\s\S]*)/.exec(aMessage)))
      return false;

    let [, name, args] = matchResult;

    let cmdArray = this._findCommands(aConversation, name);
    if (!cmdArray.length)
      return false;

    // cmdArray contains commands sorted by priority, attempt to apply
    // them in order until one succeeds.
    if (!cmdArray.some(aCmd => aCmd.run(args, aConversation, aReturnedConv))) {
      // If they all failed, print help message.
      this.executeCommand("/help " + name, aConversation);
    }
    return true;
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.imICommandsService]),
  classDescription: "Commands",
  classID: Components.ID("{7cb20c68-ccc8-4a79-b6f1-0b4771ed6c23}"),
  contractID: "@mozilla.org/chat/commands-service;1"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandsService]);
