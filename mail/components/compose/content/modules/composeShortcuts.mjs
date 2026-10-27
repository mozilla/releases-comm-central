/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { ShortcutsManager } = ChromeUtils.importESModule(
  "resource:///modules/ShortcutsManager.sys.mjs"
);

/** @import {Shortcut, ShortcutStrings} from "resource:///modules/ShortcutsManager.sys.mjs" */

const BUTTONS = { "send-message": ["button-send"] };
const MENUITEMS = { "send-message": ["menu-item-send-now"] };

export const ComposeShortcuts = {
  setup() {
    setupShortcutStrings();
    setupEventListener();
  },

  /**
   * Checks the existence of a shortcut and updates the button elements
   * associated with it.
   *
   * @param {string} stringId
   */
  async refreshButtonShortcut(stringId) {
    const shortcut = await ShortcutsManager.getShortcutStrings(stringId);
    if (!shortcut) {
      return;
    }

    await setButtonsShortcuts(BUTTONS[stringId], shortcut);
  },
};

/**
 * Use the ShortcutsManager to set up all keyboard shortcuts for the toolbar
 * buttons.
 */
async function setupShortcutStrings() {
  for (const [string, ids] of Object.entries(BUTTONS)) {
    const shortcut = await ShortcutsManager.getShortcutStrings(string);
    if (!shortcut) {
      continue;
    }

    await setButtonsShortcuts(ids, shortcut);
  }

  for (const [string, ids] of Object.entries(MENUITEMS)) {
    const shortcut = await ShortcutsManager.getShortcutStrings(string);
    if (!shortcut) {
      continue;
    }

    await setMenuitemShortcuts(ids, shortcut);
  }
}

/**
 * Set the shortcuts for button elements.
 *
 * @param {string[]} ids
 * @param {ShortcutStrings} shortcut
 */
async function setButtonsShortcuts(ids, shortcut) {
  for (const id of ids) {
    const button = document.getElementById(id);
    if (!button) {
      continue;
    }

    await document.l10n.translateElements([button]);

    // FIXME: This is a XUL toolbar button. Later to be converted to an HTML
    // customizable toolbar button to properly show shortcuts and title.
    document.l10n.setAttributes(button, "toolbar-button-shortcut-string", {
      label: button.label,
      shortcut: shortcut.localizedShortcut,
      tooltiptext: button.getAttribute("tooltiptext"),
    });
  }
}

/**
 * Set the shortcuts for menuitem elements.
 *
 * @param {string[]} ids
 * @param {ShortcutStrings} shortcut
 */
async function setMenuitemShortcuts(ids, shortcut) {
  for (const id of ids) {
    const menuitem = document.getElementById(id);
    if (!menuitem) {
      continue;
    }

    await document.l10n.translateElements([menuitem]);

    document.l10n.setAttributes(menuitem, "menuitem-shortcut-attributes", {
      label: menuitem.label,
      accesskey: menuitem.accessKey || "",
      shortcut: shortcut.localizedShortcut,
    });
  }
}

/**
 * Sets up the keydown and keyup events to intercept shortcuts.
 */
function setupEventListener() {
  // The shortcut matched on keydown, to be triggered when its key is released.
  // Matching on keydown makes the shortcut independent of the order in which
  // the keys are released, as the modifiers might already be up on keyup.
  let pendingShortcut = null;

  window.addEventListener("keydown", event => {
    if (event.repeat) {
      return;
    }
    // Unique variation for macOS in case the metaKey is used for shortcuts.
    // macOS doesn't fire any keyboard key on `keyup` if the metaKey is pressed,
    // therefore we need to trigger the shortcut on keydown.
    // This workaround can be removed if bug 1299553 is fixed in core.
    if (AppConstants.platform == "macosx" && event.metaKey) {
      pendingShortcut = null;
      if (event.key != "Meta") {
        dispatchShortcutEvent(
          event,
          ShortcutsManager.matches(event, "compose")
        );
      }
      return;
    }
    pendingShortcut = ShortcutsManager.matches(event, "compose");
  });

  window.addEventListener("keyup", event => {
    if (
      !pendingShortcut ||
      event.key.toLowerCase() != pendingShortcut.key.toLowerCase()
    ) {
      // Ignore other keys being released, e.g. the modifiers released before
      // the shortcut key.
      return;
    }
    const shortcut = pendingShortcut;
    pendingShortcut = null;
    dispatchShortcutEvent(event, shortcut);
  });

  window.addEventListener("blur", () => {
    pendingShortcut = null;
  });
}

/**
 * Dispatch the proper event for a matched keyboard shortcut.
 *
 * @param {KeyboardEvent} event
 * @param {?Shortcut} shortcut - The matched shortcut, if any.
 */
function dispatchShortcutEvent(event, shortcut) {
  // Bail out if no shortcut matches or it has been disabled.
  if (!shortcut) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  switch (shortcut.id) {
    case "send-message":
      window.dispatchEvent(new CustomEvent("send-message", { bubbles: true }));
      break;
    default:
      break;
  }
}
