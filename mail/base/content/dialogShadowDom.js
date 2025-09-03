/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * When the dialog window loads, add a stylesheet to the shadow DOM of the
 * dialog to style the accept and cancel buttons, etc.
 */
window.addEventListener("load", () => {
  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", "chrome://messenger/skin/themeableDialog.css");
  document.querySelector("dialog").shadowRoot.appendChild(link);
});

/**
 * Wait for the content to load before enabling right-click context menu to
 * select and copy the text.
 */
window.addEventListener(
  "DOMContentLoaded",
  () => {
    if (document.documentElement?.id !== "commonDialogWindow") {
      return;
    }

    function getSelectedText() {
      return window.getSelection?.()?.toString() ?? "";
    }

    // Cache the selection at the start of the context-menu gesture
    // because the selection can be lost by the time the menuitem is clicked.
    let cachedSelectionText = "";
    window.addEventListener(
      "contextmenu",
      () => {
        cachedSelectionText = getSelectedText();
      },
      true
    );

    function copyToClipboard(text) {
      if (!text) {
        return;
      }
      try {
        Cc["@mozilla.org/widget/clipboardhelper;1"]
          .getService(Ci.nsIClipboardHelper)
          .copyString(text);
      } catch {}
    }

    const copyController = {
      supportsCommand(command) {
        return command === "cmd_copy";
      },
      isCommandEnabled(command) {
        if (command === "cmd_copy") {
          return !!(getSelectedText() || cachedSelectionText);
        }
        return false;
      },
      doCommand(command) {
        if (command === "cmd_copy") {
          const text = getSelectedText() || cachedSelectionText;
          copyToClipboard(text);
        }
      },
      onEvent() {},
    };

    window.controllers?.insertControllerAt(0, copyController);
  },
  { once: true }
);
