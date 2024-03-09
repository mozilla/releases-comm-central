/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { XPCOMUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/XPCOMUtils.sys.mjs"
  );

  ChromeUtils.defineESModuleGetters(this, {
    ShortcutsManager: "resource:///modules/ShortcutsManager.sys.mjs",
  });

  function setupShortcuts() {
    // Set up all dedicated shortcuts.
    setupSpacesShortcuts();

    // Set up the event listener.
    setupEventListener();
  }

  /**
   * Use the ShortcutManager to set up all keyboard shortcuts for the spaces
   * toolbar buttons.
   */
  async function setupSpacesShortcuts() {
    // Set up all shortcut strings for the various spaces buttons.
    const buttons = {
      "space-toggle": ["collapseButton", "spacesToolbarReveal"],
      "space-mail": ["mailButton"],
      "space-addressbook": ["addressBookButton"],
      "space-calendar": ["calendarButton"],
      "space-tasks": ["tasksButton"],
      "space-chat": ["chatButton"],
    };
    for (const [string, ids] of Object.entries(buttons)) {
      const shortcut = await ShortcutsManager.getShortcutStrings(string);
      if (!shortcut) {
        continue;
      }

      for (const id of ids) {
        const button = document.getElementById(id);
        button.setAttribute("aria-label", button.title);
        document.l10n.setAttributes(button, "button-shortcut-string", {
          title: button.title,
          shortcut: shortcut.localizedShortcut,
        });
        button.setAttribute("aria-keyshortcuts", shortcut.ariaKeyShortcuts);
      }
    }

    // Set up all shortcut strings for the various spaces menuitems.
    const menuitems = {
      "space-toggle": ["spacesPopupButtonReveal"],
      "space-mail": ["spacesPopupButtonMail"],
      "space-addressbook": ["spacesPopupButtonAddressBook"],
      "space-calendar": [
        "spacesPopupButtonCalendar",
        "calMenuSwitchToCalendar",
      ],
      "space-tasks": ["spacesPopupButtonTasks", "calMenuSwitchToTask"],
      "space-chat": ["spacesPopupButtonChat", "menu_goChat"],
    };
    for (const [string, ids] of Object.entries(menuitems)) {
      const shortcut = await ShortcutsManager.getShortcutStrings(string);
      if (!shortcut) {
        continue;
      }

      for (const id of ids) {
        const menuitem = document.getElementById(id);
        if (!menuitem.label) {
          await document.l10n.translateElements([menuitem]);
        }
        document.l10n.setAttributes(menuitem, "menuitem-shortcut-string", {
          label: menuitem.label,
          shortcut: shortcut.localizedShortcut,
        });
      }
    }
  }

  /**
   * Set up the keydown event to intercept shortcuts.
   */
  function setupEventListener() {
    const tabmail = document.getElementById("tabmail");

    window.addEventListener("keydown", event => {
      const shortcut = ShortcutsManager.matches(event);
      // FIXME: Temporarily ignore numbers coming from the Numpad to prevent
      // hijacking Alt characters typing in Windows. This can be removed once
      // we implement customizable shortcuts.
      if (!shortcut || event.location == 3) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      switch (shortcut.id) {
        case "space-toggle":
          window.gSpacesToolbar.toggleToolbar(!window.gSpacesToolbar.isHidden);
          break;
        case "space-mail":
        case "space-addressbook":
        case "space-calendar":
        case "space-tasks":
        case "space-chat": {
          const space = window.gSpacesToolbar.spaces.find(
            space => space.name == shortcut.id.replace("space-", "")
          );
          window.gSpacesToolbar.openSpace(tabmail, space);
          break;
        }
      }
    });
  }

  window.addEventListener("load", setupShortcuts);
}
