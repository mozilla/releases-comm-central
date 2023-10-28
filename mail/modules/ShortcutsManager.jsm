/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Module used to collect all global shortcuts that can (will) be customizable.
 * Use the shortcuts[] array to add global shortcuts that need to work on the
 * whole window. The `context` property allows using the same shortcut for
 * different context. The event handling needs to be defined in the window.
 */

const EXPORTED_SYMBOLS = ["ShortcutsManager"];

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const ShortcutsManager = {
  /**
   * Fluent strings mapping to allow updating strings without changing all the
   * IDs in the shortcuts.ftl file. This is needed because the IDs are
   * dynamically generated.
   *
   * @type {object}
   */
  fluentMapping: {
    "meta-shift-alt-shortcut-key": "meta-shift-alt-shortcut-key2",
    "ctrl-shift-alt-shortcut-key": "ctrl-shift-alt-shortcut-key2",
    "meta-ctrl-shift-alt-shortcut-key": "meta-ctrl-shift-alt-shortcut-key2",
  },

  /**
   * Data set for a shortcut.
   *
   * @typedef {object} Shortcut
   * @property {string} id - The id for this shortcut.
   * @property {string} name - The name of this shortcut. TODO: This should use
   *   fluent to be translatable in the future, once we decide to expose this
   *   array and make it customizable.
   * @property {?string} key - The keyboard key used by this shortcut, or null
   *   if the shortcut is disabled.
   * @property {object} modifiers - The list of modifiers expected by this
   *   shortcut in order to be triggered, organized per platform.
   * @property {string[]} context - An array of strings representing the context
   *   string to filter out duplicated shortcuts, if necessary.
   */
  /**
   * @type {Shortcut[]}
   */
  shortcuts: [
    /* Numbers. */
    {
      id: "space-mail",
      name: "Open the Mail space",
      key: "1",
      modifiers: {
        win: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
        },
        macosx: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        linux: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
      },
      context: [],
    },
    {
      id: "space-addressbook",
      name: "Open the Address Book space",
      key: "2",
      modifiers: {
        win: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
        },
        macosx: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        linux: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
      },
      context: [],
    },
    {
      id: "space-calendar",
      name: "Open the Calendar space",
      key: "3",
      modifiers: {
        win: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
        },
        macosx: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        linux: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
      },
      context: [],
    },
    {
      id: "space-tasks",
      name: "Open the Tasks space",
      key: "4",
      modifiers: {
        win: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
        },
        macosx: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        linux: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
      },
      context: [],
    },
    {
      id: "space-chat",
      name: "Open the Chat space",
      key: "5",
      modifiers: {
        win: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: true,
        },
        macosx: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        linux: {
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
      },
      context: [],
    },
    {
      id: "space-toggle",
      name: "Toggle the Spaces Toolbar",
      key: null, // Disabled shortcut.
      code: null,
      modifiers: {
        win: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        macosx: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        linux: {
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
      },
      context: [],
    },
    /* Characters. */
    /* Special characters. */
  ],

  /**
   * Find the matching shortcut from a keydown DOM Event.
   *
   * @param {Event} event - The keydown DOM Event.
   * @param {?string} context - The context string to filter out duplicated
   *   shortcuts, if necessary.
   * @returns {?Shortcut} - The matching shortcut, or null if nothing matches.
   */
  matches(event, context = null) {
    const found = [];
    for (const shortcut of this.shortcuts) {
      // No need to run any other condition if the base key doesn't match.
      if (shortcut.key != event.key) {
        continue;
      }

      // Skip this key if we require a context not present, or we don't require
      // a context and key has some.
      if (
        (context && !shortcut.context.includes(context)) ||
        (!context && shortcut.context.length)
      ) {
        continue;
      }

      found.push(shortcut);
    }

    if (found.length > 1) {
      // Trigger an error since we don't want to allow multiple shortcuts to
      // run at the same time. If this happens, we got a problem!
      throw new Error(
        `Multiple shortcuts (${found
          .map(f => f.id)
          .join(",")}) are conflicting with the keydown event:\n
         - KEY: ${event.key}\n
         - CTRL: ${event.ctrlKey}\n
         - META: ${event.metaKey}\n
         - SHIFT: ${event.shiftKey}\n
         - ALT: ${event.altKey}\n
         - CONTEXT: ${context}\n`
      );
    }

    if (!found.length) {
      return null;
    }

    const shortcut = found[0];
    const mods = shortcut.modifiers[AppConstants.platform];
    // Return the shortcut if it doesn't require any modifier and no modifier
    // is present in the key press event.
    if (
      !Object.keys(mods).length &&
      !(event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey
    ) {
      return shortcut;
    }

    // Perfectly match all modifiers to prevent false positives.
    return mods.metaKey == event.metaKey &&
      mods.ctrlKey == event.ctrlKey &&
      mods.shiftKey == event.shiftKey &&
      mods.altKey == event.altKey
      ? shortcut
      : null;
  },

  /**
   * Generate a string that will be used to create the fluent ID to visually
   * represent the keyboard shortcut.
   *
   * @param {string} id - The ID of the requested shortcut.
   * @returns {?object} - An object containing the generate shortcut and aria
   *   string, if available.
   * @property {string} localizedShortcut - The shortcut in a human-readable,
   *   localized and platform-specific form.
   * @property {string} ariaKeyShortcuts - The shortcut in a form appropriate
   *   for the aria-keyshortcuts attribute.
   */
  async getShortcutStrings(id) {
    const shortcut = this.shortcuts.find(s => s.id == id);
    if (!shortcut?.key) {
      return null;
    }

    const platform = AppConstants.platform;
    const string = [];
    const aria = [];
    if (shortcut.modifiers[platform].metaKey) {
      string.push("meta");
      aria.push("Meta");
    }

    if (shortcut.modifiers[platform].ctrlKey) {
      string.push("ctrl");
      aria.push("Control");
    }

    if (shortcut.modifiers[platform].shiftKey) {
      string.push("shift");
      aria.push("Shift");
    }

    if (shortcut.modifiers[platform].altKey) {
      string.push("alt");
      aria.push("Alt");
    }
    string.push("shortcut-key");
    aria.push(shortcut.key.toUpperCase());

    // Check if the ID was updated in the fluent file and replace it.
    let stringId = string.join("-");
    stringId = this.fluentMapping[stringId] || stringId;

    const value = await this.l10n.formatValue(stringId, {
      key: shortcut.key.toUpperCase(),
    });

    return { localizedShortcut: value, ariaKeyShortcuts: aria.join("+") };
  },
};

XPCOMUtils.defineLazyGetter(
  ShortcutsManager,
  "l10n",
  () => new Localization(["messenger/shortcuts.ftl"])
);
