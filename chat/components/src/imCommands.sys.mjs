/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/commands.properties")
);

export function CommandsService() {}
CommandsService.prototype = {
  initCommands() {
    this._commands = {};
    // The say command is directly implemented in the UI layer, but has a
    // dummy command registered here so it shows up as a command (e.g. when
    // using the /help command).
    this.registerCommand({
      name: "say",
      get helpString() {
        return lazy._("sayHelpString");
      },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
      priority: Ci.imICommand.CMD_PRIORITY_HIGH,
      run(aMsg, aConv) {
        throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
      },
    });

    this.registerCommand({
      name: "raw",
      get helpString() {
        return lazy._("rawHelpString");
      },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
      priority: Ci.imICommand.CMD_PRIORITY_DEFAULT,
      run(aMsg, aConv) {
        let conv = IMServices.conversations.getUIConversation(aConv);
        if (!conv) {
          return false;
        }
        conv.sendMsg(aMsg);
        return true;
      },
    });

    this.registerCommand({
      // Reference the command service so we can use the internal properties
      // directly.
      cmdSrv: this,

      name: "help",
      get helpString() {
        return lazy._("helpHelpString");
      },
      usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
      priority: Ci.imICommand.CMD_PRIORITY_DEFAULT,
      run(aMsg, aConv) {
        aMsg = aMsg.trim();
        let conv = IMServices.conversations.getUIConversation(aConv);
        if (!conv) {
          return false;
        }

        // Handle when no command is given, list all possible commands that are
        // available for this conversation (alphabetically).
        if (!aMsg) {
          let commands = this.cmdSrv.listCommandsForConversation(aConv);
          if (!commands.length) {
            return false;
          }

          // Concatenate the command names (separated by a comma and space).
          let cmds = commands
            .map(aCmd => aCmd.name)
            .sort()
            .join(", ");
          let message = lazy._("commands", cmds);

          // Display the message
          conv.systemMessage(message);
          return true;
        }

        // A command name was given, find the commands that match.
        let cmdArray = this.cmdSrv._findCommands(aConv, aMsg);

        if (!cmdArray.length) {
          // No command that matches.
          let message = lazy._("noCommand", aMsg);
          conv.systemMessage(message);
          return true;
        }

        // Only show the help for the one of the highest priority.
        let cmd = cmdArray[0];

        let text = cmd.helpString;
        if (!text) {
          text = lazy._("noHelp", cmd.name);
        }

        // Display the message.
        conv.systemMessage(text);
        return true;
      },
    });

    // Status commands
    let status = {
      back: "AVAILABLE",
      away: "AWAY",
      busy: "UNAVAILABLE",
      dnd: "UNAVAILABLE",
      offline: "OFFLINE",
    };
    for (let cmd in status) {
      let statusValue = Ci.imIStatusInfo["STATUS_" + status[cmd]];
      this.registerCommand({
        name: cmd,
        get helpString() {
          return lazy._("statusCommand", this.name, lazy._(this.name));
        },
        usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
        priority: Ci.imICommand.CMD_PRIORITY_HIGH,
        run(aMsg) {
          IMServices.core.globalUserStatus.setStatus(statusValue, aMsg);
          return true;
        },
      });
    }
  },
  unInitCommands() {
    delete this._commands;
  },

  registerCommand(aCommand, aPrplId) {
    let name = aCommand.name;
    if (!name) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    if (!this._commands.hasOwnProperty(name)) {
      this._commands[name] = {};
    }
    this._commands[name][aPrplId || ""] = aCommand;
  },
  unregisterCommand(aCommandName, aPrplId) {
    if (this._commands.hasOwnProperty(aCommandName)) {
      let prplId = aPrplId || "";
      let commands = this._commands[aCommandName];
      if (commands.hasOwnProperty(prplId)) {
        delete commands[prplId];
      }
      if (!Object.keys(commands).length) {
        delete this._commands[aCommandName];
      }
    }
  },
  listCommandsForConversation(aConversation) {
    let result = [];
    let prplId = aConversation && aConversation.account.protocol.id;
    for (let name in this._commands) {
      let commands = this._commands[name];
      if (commands.hasOwnProperty("")) {
        result.push(commands[""]);
      }
      if (prplId && commands.hasOwnProperty(prplId)) {
        result.push(commands[prplId]);
      }
    }
    if (aConversation) {
      result = result.filter(this._usageContextFilter(aConversation));
    }
    return result;
  },
  // List only the commands for a protocol (excluding the global commands).
  listCommandsForProtocol(aPrplId) {
    if (!aPrplId) {
      throw new Error("You must provide a prpl ID.");
    }

    let result = [];
    for (let name in this._commands) {
      let commands = this._commands[name];
      if (commands.hasOwnProperty(aPrplId)) {
        result.push(commands[aPrplId]);
      }
    }
    return result;
  },
  _usageContextFilter(aConversation) {
    let usageContext =
      Ci.imICommand["CMD_CONTEXT_" + (aConversation.isChat ? "CHAT" : "IM")];
    return c => c.usageContext & usageContext;
  },
  _findCommands(aConversation, aName) {
    let prplId = null;
    if (aConversation) {
      let account = aConversation.account;
      if (account.connected) {
        prplId = account.protocol.id;
      }
    }

    let commandNames;
    // If there is an exact match for the given command name,
    // don't look at any other commands.
    if (this._commands.hasOwnProperty(aName)) {
      commandNames = [aName];
    } else {
      // Otherwise, check if there is a partial match.
      commandNames = Object.keys(this._commands).filter(command =>
        command.startsWith(aName)
      );
    }

    // If a single full command name matches the given (partial)
    // command name, return the results for that command name. Otherwise,
    // return an empty array (don't assume a certain command).
    let cmdArray = [];
    for (let commandName of commandNames) {
      let matches = [];

      // Get the 2 possible commands (the global and the proto specific).
      let commands = this._commands[commandName];
      if (commands.hasOwnProperty("")) {
        matches.push(commands[""]);
      }
      if (prplId && commands.hasOwnProperty(prplId)) {
        matches.push(commands[prplId]);
      }

      // Remove the commands that can't apply in this context.
      if (aConversation) {
        matches = matches.filter(this._usageContextFilter(aConversation));
      }

      if (!matches.length) {
        continue;
      }

      // If we have found a second matching command name, return the empty array.
      if (cmdArray.length) {
        return [];
      }

      cmdArray = matches;
    }

    // Sort the matching commands by priority before returning the array.
    return cmdArray.sort((a, b) => b.priority - a.priority);
  },
  executeCommand(aMessage, aConversation, aReturnedConv) {
    if (!aMessage) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    let matchResult;
    if (
      aMessage[0] != "/" ||
      !(matchResult = /^\/([a-z0-9]+)(?: |$)([\s\S]*)/.exec(aMessage))
    ) {
      return false;
    }

    let [, name, args] = matchResult;

    let cmdArray = this._findCommands(aConversation, name);
    if (!cmdArray.length) {
      return false;
    }

    // cmdArray contains commands sorted by priority, attempt to apply
    // them in order until one succeeds.
    if (!cmdArray.some(aCmd => aCmd.run(args, aConversation, aReturnedConv))) {
      // If they all failed, print help message.
      this.executeCommand("/help " + name, aConversation);
    }
    return true;
  },

  QueryInterface: ChromeUtils.generateQI(["imICommandsService"]),
  classDescription: "Commands",
};
