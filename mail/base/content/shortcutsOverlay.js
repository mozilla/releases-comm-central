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
    setupShortcutStrings();

    // Set up the event listener.
    setupEventListener();
  }

  /**
   * Use the ShortcutManager to set up all keyboard shortcuts for the spaces
   * toolbar buttons.
   */
  async function setupShortcutStrings() {
    // Set up all shortcut strings for the various buttons.
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
        if (!button) {
          continue;
        }

        button.setAttribute("aria-label", button.title);
        document.l10n.setAttributes(button, "button-shortcut-string", {
          title: button.title,
          shortcut: shortcut.localizedShortcut,
        });
        button.setAttribute("aria-keyshortcuts", shortcut.ariaKeyShortcuts);
      }
    }

    // Set up all shortcut strings for the various menuitems.
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
      // Tools.
      "search-messages": ["searchMailCmd", "appmenu_searchCmd"],
    };
    for (const [string, ids] of Object.entries(menuitems)) {
      const shortcut = await ShortcutsManager.getShortcutStrings(string);
      if (!shortcut) {
        continue;
      }

      for (const id of ids) {
        const menuitem = document.getElementById(id);
        if (!menuitem) {
          continue;
        }

        if (!menuitem.label) {
          await document.l10n.translateElements([menuitem]);
        }
        document.l10n.setAttributes(menuitem, "menuitem-shortcut-attributes", {
          label: menuitem.label,
          accesskey: menuitem.accessKey || "",
          shortcut: shortcut.localizedShortcut,
        });

        // TODO: Temporary workaround for toolbarbutton since they're not
        // compatible with fluent shortcut args. We should update the appmenu
        // and convert all those toolbar buttons into button + label like
        // Firefox is doing.
        if (menuitem.nodeName == "toolbarbutton") {
          menuitem.setAttribute("shortcut", shortcut.localizedShortcut);
        }
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
      if (!shortcut || event.location == 3 || tabmail.globalOverlay) {
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
            s => s.name == shortcut.id.replace("space-", "")
          );
          window.gSpacesToolbar.openSpace(tabmail, space);
          break;
        }
        case "search-messages":
          window.searchAllMessages();
          break;
      }
    });
  }

  window.addEventListener("load", setupShortcuts);
}

/**
 * Load the shortcuts-container custom element if it's not already defined and
 * open the container modal dialog.
 */
async function openCustomizableShortcuts() {
  let element = document.querySelector("shortcuts-container");
  // If we don't already have the element import it and append it to the DOM.
  if (!element) {
    await import(
      "chrome://messenger/content/customizableshortcuts/shortcuts-container.mjs"
    );
    element = document.createElement("shortcuts-container");
    document.body.appendChild(element);
  }
  element.open();
}
