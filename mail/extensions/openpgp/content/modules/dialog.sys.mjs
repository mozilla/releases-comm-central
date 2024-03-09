/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailWindows: "chrome://openpgp/content/modules/windows.sys.mjs",
});

export var EnigmailDialog = {
  /**
   * Displays a dialog with success/failure information after importing
   * keys.
   *
   * @param win:           nsIWindow - parent window to display modal dialog; can be null
   * @param keyList:       Array of String - imported keyIDs
   *
   * @return: 0-2: button Number pressed
   *          -1: ESC or close window button pressed
   *
   */
  keyImportDlg(win, keyList) {
    var result = {
      value: -1,
      checked: false,
    };

    if (!win) {
      win = lazy.EnigmailWindows.getBestParentWin();
    }

    win.openDialog(
      "chrome://openpgp/content/ui/enigmailKeyImportInfo.xhtml",
      "",
      "chrome,dialog,modal,centerscreen,resizable",
      {
        keyList,
      },
      result
    );

    return result.value;
  },

  /**
   * Asks user to confirm the import of the given public keys.
   * User is allowed to automatically accept new/undecided keys.
   *
   * @param {nsIDOMWindow} parentWindow - Parent window.
   * @param {object[]} keyPreview - Key details. See EnigmailKey.getKeyListFromKeyBlock().
   * @param {EnigmailKeyObj[]} - Array of key objects.
   * @param {object} outputParams - Out parameters.
   * @param {string} outputParams.acceptance contains the decision. If confirmed.
   * @returns {boolean} true if user confirms import
   *
   */
  confirmPubkeyImport(parentWindow, keyPreview, outputParams) {
    const args = {
      keys: keyPreview,
      confirmed: false,
      acceptance: "",
    };

    parentWindow.browsingContext.topChromeWindow.openDialog(
      "chrome://openpgp/content/ui/confirmPubkeyImport.xhtml",
      "",
      "dialog,modal,centerscreen,resizable",
      args
    );

    if (args.confirmed && outputParams) {
      outputParams.acceptance = args.acceptance;
    }
    return args.confirmed;
  },
};
