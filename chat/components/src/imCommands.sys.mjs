/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/commands.properties")
);

/**
 * @typedef {object} Command
 * @property {string} name
 * @property {string} helpString - Help message displayed when the user types
 *   /help <name>.
 *   Format: <command name> <parameters>: <help message>
 *   Example: "help &lt;name&gt;: show the help message for the &lt;name&gt;
 *            command, or the list of possible commands when used without
 *            parameter."
 * @property {number} usageContext - Value should be one of
 *   CommandsService.COMMAND_CONTEXT.
 * @property {number} priority - Any integer value is usable as a priority.
 *   0 is the default priority. (CommandsService.COMMAND_PRIORITY.DEFAULT)
 *   < 0 is lower priority.
 *   > 0 is higher priority.
 *   Commands registered by protocol plugins will usually use
 *   CommandsService.COMMAND_PRIORITY.PRPL.
 * @property {(aMessage: string, aConversation?: prplIConversation, aReturnedConv?: prplIConversation) => boolean} run -
 *   Will return true if the command handled the message (it should not be sent).
 *   The leading slash, the command name and the following space are not included
 *   in the aMessage parameter.
 *   If a conversation is returned as a result of executing the command,
 *   the caller should consider focusing it.
 */

export class CommandsService {
  COMMAND_CONTEXT = Object.freeze({
    IM: 1,
    CHAT: 2,
    ALL: 1 | 2,
  });
  COMMAND_PRIORITY = Object.freeze({
    LOW: -1000,
    DEFAULT: 0,
    PRPL: 1000,
    HIGH: 4000,
  });

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
      usageContext: this.COMMAND_CONTEXT.ALL,
      priority: this.COMMAND_PRIORITY.HIGH,
      run() {
        throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
      },
    });

    this.registerCommand({
      name: "raw",
      get helpString() {
        return lazy._("rawHelpString");
      },
      usageContext: this.COMMAND_CONTEXT.ALL,
      priority: this.COMMAND_PRIORITY.DEFAULT,
      run(aMsg, aConv) {
        const conv = IMServices.conversations.getUIConversation(aConv);
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
      usageContext: this.COMMAND_CONTEXT.ALL,
      priority: this.COMMAND_PRIORITY.DEFAULT,
      run(aMsg, aConv) {
        aMsg = aMsg.trim();
        const conv = IMServices.conversations.getUIConversation(aConv);
        if (!conv) {
          return false;
        }

        // Handle when no command is given, list all possible commands that are
        // available for this conversation (alphabetically).
        if (!aMsg) {
          const commands = this.cmdSrv.listCommandsForConversation(aConv);
          if (!commands.length) {
            return false;
          }

          // Concatenate the command names (separated by a comma and space).
          const cmds = commands
            .map(aCmd => aCmd.name)
            .sort()
            .join(", ");
          const message = lazy._("commands", cmds);

          // Display the message
          conv.systemMessage(message);
          return true;
        }

        // A command name was given, find the commands that match.
        const cmdArray = this.cmdSrv._findCommands(aConv, aMsg);

        if (!cmdArray.length) {
          // No command that matches.
          const message = lazy._("noCommand", aMsg);
          conv.systemMessage(message);
          return true;
        }

        // Only show the help for the one of the highest priority.
        const cmd = cmdArray[0];

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
    const status = {
      back: "AVAILABLE",
      away: "AWAY",
      busy: "UNAVAILABLE",
      dnd: "UNAVAILABLE",
      offline: "OFFLINE",
    };
    for (const cmd in status) {
      const statusValue = Ci.imIStatusInfo["STATUS_" + status[cmd]];
      this.registerCommand({
        name: cmd,
        get helpString() {
          return lazy._("statusCommand", this.name, lazy._(this.name));
        },
        usageContext: this.COMMAND_CONTEXT.ALL,
        priority: this.COMMAND_PRIORITY.HIGH,
        run(aMsg) {
          IMServices.core.globalUserStatus.setStatus(statusValue, aMsg);
          return true;
        },
      });
    }
  }
  unInitCommands() {
    delete this._commands;
  }

  /**
   * Commands registered without a protocol id will work for all protocols.
   * Registering several commands of the same name with the same
   * protocol id or no protocol id will replace the former command
   * with the latter.
   *
   * @param {Command} aCommand
   * @param {string} [aPrplId]
   */
  registerCommand(aCommand, aPrplId) {
    const name = aCommand.name;
    if (!name) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    if (!this._commands.hasOwnProperty(name)) {
      this._commands[name] = {};
    }
    this._commands[name][aPrplId || ""] = aCommand;
  }
  /**
   * aPrplId should be the same as what was used for the command registration.
   *
   * @param {string} aCommandName
   * @param {string} [aPrplId]
   */
  unregisterCommand(aCommandName, aPrplId) {
    if (this._commands.hasOwnProperty(aCommandName)) {
      const prplId = aPrplId || "";
      const commands = this._commands[aCommandName];
      if (commands.hasOwnProperty(prplId)) {
        delete commands[prplId];
      }
      if (!Object.keys(commands).length) {
        delete this._commands[aCommandName];
      }
    }
  }
  /**
   *
   * @param {prplIConversation} [aConversation]
   * @returns {Command[]}
   */
  listCommandsForConversation(aConversation) {
    let result = [];
    const prplId = aConversation && aConversation.account.protocol.id;
    for (const name in this._commands) {
      const commands = this._commands[name];
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
  }
  /**
   * List only the commands for a protocol (excluding the global commands).
   *
   * @param {string} aPrplId
   * @returns {Command[]}
   */
  listCommandsForProtocol(aPrplId) {
    if (!aPrplId) {
      throw new Error("You must provide a prpl ID.");
    }

    const result = [];
    for (const name in this._commands) {
      const commands = this._commands[name];
      if (commands.hasOwnProperty(aPrplId)) {
        result.push(commands[aPrplId]);
      }
    }
    return result;
  }
  _usageContextFilter(aConversation) {
    const usageContext =
      this.COMMAND_CONTEXT[aConversation.isChat ? "CHAT" : "IM"];
    return c => c.usageContext & usageContext;
  }
  _findCommands(aConversation, aName) {
    let prplId = null;
    if (aConversation) {
      const account = aConversation.account;
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
    for (const commandName of commandNames) {
      let matches = [];

      // Get the 2 possible commands (the global and the proto specific).
      const commands = this._commands[commandName];
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
  }
  /**
   * Will return true if a command handled the message (it should not be sent).
   * The aConversation parameters is required to execute protocol specific
   * commands. Application global commands will work without it.
   * If a conversation is returned as a result of executing the command,
   * the caller should consider focusing it.
   *
   * @param {string} aMessage
   * @param {prplIConversation} [aConversation]
   * @param {prplIConversation} [aReturnedConv]
   * @returns {boolean}
   */
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

    const [, name, args] = matchResult;

    const cmdArray = this._findCommands(aConversation, name);
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
  }
}

export const cmd = new CommandsService();
