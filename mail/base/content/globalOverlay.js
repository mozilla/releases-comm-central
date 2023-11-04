/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Notifies observers that quitting has been requested.
 *
 * @returns {boolean} - True if an observer prevented quitting, false otherwise.
 */
function canQuitApplication() {
  try {
    const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    Services.obs.notifyObservers(cancelQuit, "quit-application-requested");

    // Something aborted the quit process.
    if (cancelQuit.data) {
      return false;
    }
  } catch (ex) {}
  return true;
}

/**
 * Quit the application if no `quit-application-requested` observer prevents it.
 */
function goQuitApplication() {
  if (!canQuitApplication()) {
    return false;
  }

  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  return true;
}

/**
 * Gets the first registered controller that returns true for both
 * `supportsCommand` and `isCommandEnabled`, or null if no controllers
 * return true for both.
 *
 * @param {string} command - The command name to pass to controllers.
 * @returns {nsIController|null}
 */
function getEnabledControllerForCommand(command) {
  // The first controller for which `supportsCommand` returns true.
  const controllerA =
    top.document.commandDispatcher.getControllerForCommand(command);
  if (controllerA?.isCommandEnabled(command)) {
    return controllerA;
  }

  // Didn't find a controller, or `isCommandEnabled` returned false?
  // Try the other controllers. Note this isn't exactly the same set
  // of controllers as `commandDispatcher` has.
  for (let i = 0; i < top.controllers.getControllerCount(); i++) {
    const controllerB = top.controllers.getControllerAt(i);
    if (
      controllerB !== controllerA &&
      controllerB.supportsCommand(command) &&
      controllerB.isCommandEnabled(command)
    ) {
      return controllerB;
    }
  }

  return null;
}

/**
 * Updates the enabled state of the element with the ID `command`. The command
 * is considered enabled if at least one controller returns true for both
 * `supportsCommand` and `isCommandEnabled`.
 *
 * @param {string} command - The command name to pass to controllers.
 */
function goUpdateCommand(command) {
  try {
    goSetCommandEnabled(command, !!getEnabledControllerForCommand(command));
  } catch (e) {
    console.error(`An error occurred updating the ${command} command: ${e}`);
  }
}

/**
 * Calls `doCommand` on the first controller that returns true for both
 * `supportsCommand` and `isCommandEnabled`.
 *
 * @param {string} command - The command name to pass to controllers.
 * @param {any[]} args - Any number of arguments to pass to the chosen
 *   controller. Note that passing arguments is not part of the `nsIController`
 *   interface and only possible for JS controllers.
 */
function goDoCommand(command, ...args) {
  try {
    let controller = getEnabledControllerForCommand(command);
    if (controller) {
      controller = controller.wrappedJSObject ?? controller;
      controller.doCommand(command, ...args);
    }
  } catch (e) {
    console.error(`An error occurred executing the ${command} command: ${e}`);
  }
}

/**
 * Updates the enabled state of the element with the ID `id`.
 *
 * @param {string} id
 * @param {boolean} enabled
 * @fires {CustomEvent} commandstate - Fired on the window when there is no
 *   command element matching the id. Detail is an object with the command
 *   property containing the id, and the enabled property containing the passed
 *   value.
 */
function goSetCommandEnabled(id, enabled) {
  const node = document.getElementById(id);

  if (node) {
    if (enabled) {
      node.removeAttribute("disabled");
    } else {
      node.setAttribute("disabled", "true");
    }
  } else {
    const commandStateEvent = new CustomEvent("commandstate", {
      detail: { command: id, enabled },
    });
    window.dispatchEvent(commandStateEvent);
  }
}
