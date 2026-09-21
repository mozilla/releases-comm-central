/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { ShortcutsManager } = ChromeUtils.importESModule(
  "resource:///modules/ShortcutsManager.sys.mjs"
);

const BUTTONS = { "send-message": ["button-send"] };
const MENUITEMS = { "send-message": ["menu-item-send-now"] };
const isMACOS = AppConstants.platform == "macosx";

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
 * @param {object} shortcut
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
 * @param {object} shortcut
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
 * Sets up the keyup event to intercept shortcuts.
 */
function setupEventListener() {
  // Unique variation for macOS in case the metaKey is used for shortcuts.
  // macOS doesn't fire any keyboard key on `keyup` if the metaKey is pressed,
  // therefore we need to listen to the keydown event.
  // This workaround can be removed if bug 1299553 is fixed in core.
  window.addEventListener("keydown", event => {
    if (!isMACOS || !event.metaKey || event.key === "Meta") {
      // Bail out if we're not on macOS or the metaKey is not pressed.
      return;
    }
    dispatchShortcutEvent(event);
  });

  window.addEventListener("keyup", event => {
    if (isMACOS && event.metaKey) {
      // Bail out if we're on macOS and the metaKey is pressed, because we can't
      // handle any keyup. This is also needed for the tests since the
      // { accelKey: true } of the EventUtils.synthesizeKey() is not bound by
      // the macOS metaKey issue.
      return;
    }
    dispatchShortcutEvent(event);
  });
}

/**
 * Process the keyboard shortcut event and dispatch the proper event if found.
 *
 * @param {KeyboardEvent} event
 */
function dispatchShortcutEvent(event) {
  const shortcut = ShortcutsManager.matches(event, "compose");
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
