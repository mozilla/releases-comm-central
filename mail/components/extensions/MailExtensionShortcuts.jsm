/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* exported MailExtensionShortcuts */
const EXPORTED_SYMBOLS = ["MailExtensionShortcuts"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "ExtensionParent",
  "resource://gre/modules/ExtensionParent.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "ExtensionShortcuts",
  "resource://gre/modules/ExtensionShortcuts.jsm"
);

XPCOMUtils.defineLazyGetter(this, "browserActionFor", () => {
  return ExtensionParent.apiManager.global.browserActionFor;
});

XPCOMUtils.defineLazyGetter(this, "composeActionFor", () => {
  return ExtensionParent.apiManager.global.composeActionFor;
});

XPCOMUtils.defineLazyGetter(this, "messageDisplayActionFor", () => {
  return ExtensionParent.apiManager.global.messageDisplayActionFor;
});

const EXECUTE_BROWSER_ACTION = "_execute_browser_action";
const EXECUTE_MSG_DISPLAY_ACTION = "_execute_message_display_action";
const EXECUTE_COMPOSE_ACTION = "_execute_compose_action";

class MailExtensionShortcuts extends ExtensionShortcuts {
  /**
   * Builds a XUL Key element and attaches an onCommand listener which
   * emits a command event with the provided name when fired.
   *
   * @param {Document} doc The XUL document.
   * @param {string} name The name of the command.
   * @param {string} shortcut The shortcut provided in the manifest.
   * @see https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/key
   *
   * @returns {Document} The newly created Key element.
   */
  buildKey(doc, name, shortcut) {
    let keyElement = this.buildKeyFromShortcut(doc, name, shortcut);

    // We need to have the attribute "oncommand" for the "command" listener to fire,
    // and it is currently ignored when set to the empty string.
    keyElement.setAttribute("oncommand", "//");

    /* eslint-disable mozilla/balanced-listeners */
    // We remove all references to the key elements when the extension is shutdown,
    // therefore the listeners for these elements will be garbage collected.
    keyElement.addEventListener("command", event => {
      let action;
      if (name == EXECUTE_BROWSER_ACTION) {
        action = browserActionFor(this.extension);
      } else if (name == EXECUTE_COMPOSE_ACTION) {
        action = composeActionFor(this.extension);
      } else if (name == EXECUTE_MSG_DISPLAY_ACTION) {
        action = messageDisplayActionFor(this.extension);
      } else {
        this.extension.tabManager.addActiveTabPermission();
        this.onCommand(name);
        return;
      }
      if (action) {
        let win = event.target.ownerGlobal;
        action.triggerAction(win);
      }
    });
    /* eslint-enable mozilla/balanced-listeners */

    return keyElement;
  }
}
