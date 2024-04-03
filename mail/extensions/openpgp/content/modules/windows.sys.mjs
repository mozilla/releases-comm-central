/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
});

export var EnigmailWindows = {
  /**
   * Determine the best possible window to serve as parent window for dialogs.
   *
   * @returns {?window}
   */
  getBestParentWin() {
    let bestFit = null;

    for (const win of Services.wm.getEnumerator(null)) {
      if (win.location.href.search(/\/messenger.xhtml$/) > 0) {
        bestFit = win;
      }
      if (
        !bestFit &&
        win.location.href.search(/\/messengercompose.xhtml$/) > 0
      ) {
        bestFit = win;
      }
    }

    if (!bestFit) {
      bestFit = Services.wm.getEnumerator(null).getNext();
    }

    return bestFit;
  },

  /**
   * If the Key Manager is open, dispatch an event to tell the key
   * manager to refresh the displayed keys
   */
  keyManReloadKeys() {
    for (const win of Services.wm.getEnumerator(null)) {
      if (win.name && win.name == "enigmail:KeyManager") {
        const evt = new Event("reload-keycache", {
          bubbles: true,
          cancelable: false,
        });
        win.dispatchEvent(evt);
        break;
      }
    }
  },

  /**
   * Display the OpenPGP Key Details.
   *
   * @param {?window} win - Parent window for the dialog.
   * @param {string} keyId - The key ID (eg. "0x12345678")
   * @param {boolean} refresh - If true, cache is cleared and the key data is
   *   loaded from the keyring.
   * @returns {boolean} true if keylist needs to be refreshed.
   */
  async openKeyDetails(win, keyId, refresh) {
    if (!win) {
      win = this.getBestParentWin();
    }

    keyId = keyId.replace(/^0x/, "");

    if (refresh) {
      lazy.EnigmailKeyRing.clearCache();
    }

    const resultObj = {
      refresh: false,
    };
    win.openDialog(
      "chrome://openpgp/content/ui/keyDetailsDlg.xhtml",
      "KeyDetailsDialog",
      "dialog,modal,centerscreen,resizable",
      { keyId, modified: lazy.EnigmailKeyRing.clearCache },
      resultObj
    );
    return resultObj.refresh;
  },
};
