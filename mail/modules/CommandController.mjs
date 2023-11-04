/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Command controller implementation for tabs. Allows registering commands
 * without requiring command elements in the markup. Shape is similar to
 * nsIController, except that doCommand is enhanced similar to
 * nsICommandController's doCommandWithParams.
 */
const commandController = {
  _callbackCommands: {},
  _isCallbackEnabled: {},

  /**
   * Add a new command available in the current tab.
   *
   * @param {string} commandName - Name of the command to register
   * @param {(...args) => {}} callback - Callback to execute when the command is
   *   triggered.
   * @param {boolean|() => boolean} [isEnabled = true] - Callback (or boolean)
   *   whether the command is enabled.
   */
  registerCallback(commandName, callback, isEnabled = true) {
    this._callbackCommands[commandName] = callback;
    this._isCallbackEnabled[commandName] = isEnabled;
    window.browsingContext.topChromeWindow.goUpdateCommand(commandName);
  },

  supportsCommand(command) {
    return command in this._callbackCommands;
  },
  isCommandEnabled(command) {
    const type = typeof this._isCallbackEnabled[command];
    if (type == "function") {
      return this._isCallbackEnabled[command]();
    } else if (type == "boolean") {
      return this._isCallbackEnabled[command];
    }

    return false;
  },
  /**
   * Calls the callback for the command, if it is enabled.
   *
   * @param {string} command - Name of the command to execute.
   * @param {...any} [args] - Arguments passed to the command callback.
   */
  doCommand(command, ...args) {
    if (!this.isCommandEnabled(command)) {
      return;
    }

    if (command in this._callbackCommands) {
      this._callbackCommands[command](...args);
    }
  },
};
export default commandController;

// Add the controller to this window's controllers, so that built-in commands
// such as cmd_selectAll run our code instead of the default code.
window.controllers.insertControllerAt(0, commandController);

// Expose the controller on the window global for code that isn't in a module
// yet and for the tab handler.
window.commandController = commandController;
