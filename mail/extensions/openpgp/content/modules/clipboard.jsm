/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailClipboard"];

// Import the Services module for future use, if we're not in
// a browser window where it's already loaded.
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Create a constructor for the built-in transferable class
const nsTransferable = Components.Constructor(
  "@mozilla.org/widget/transferable;1",
  "nsITransferable"
);

// Create a wrapper to construct an nsITransferable instance and set its source to the given window, when necessary
function Transferable(source) {
  let res = nsTransferable();
  if ("init" in res) {
    // When passed a Window object, find a suitable privacy context for it.
    if (source instanceof Ci.nsIDOMWindow) {
      source = source.docShell
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIWebNavigation);
    }

    res.init(source);
  }
  return res;
}

var EnigmailClipboard = {
  /**
   * Get the content string of a clipboard
   *
   * @param window       : nsIWindow or nsIDOMWindow of caller
   * @param clipBoardType: Number - clipboard type according to nsIClipboard
   *
   * @return String - content of clipBoard
   */

  getClipboardContent(window, clipBoardType) {
    if (!window) {
      throw new Error("window is a required parameter");
    }

    let clipBoard = Services.clipboard;
    let data = {};
    let cBoardContent = "";

    if (
      clipBoardType !== clipBoard.kSelectionClipboard ||
      clipBoard.supportsSelectionClipboard()
    ) {
      try {
        let transferable = Transferable(window);
        transferable.addDataFlavor("text/unicode");
        clipBoard.getData(transferable, clipBoardType);
        let flavour = {};
        transferable.getAnyTransferData(flavour, data);
        cBoardContent = data.value.QueryInterface(Ci.nsISupportsString).data;
      } catch (ex) {
        console.debug(ex);
      }
    }
    return cBoardContent;
  },

  /**
   * Set the global (and if available, the selection clipboard)
   *
   * @param str: String - data to set
   * @param clipBoardType: Number - clipboard type according to nsIClipboard.
   *             If not provided, the global plus the selection clipboard will be used
   *
   * @return Boolean: true - success / false - failure
   */
  setClipboardContent(str, clipBoardType) {
    let useClipboard = clipBoardType;
    if (clipBoardType === undefined) {
      useClipboard = Ci.nsIClipboard.kGlobalClipboard;
    }
    try {
      let clipBoard = Services.clipboard;
      let clipBoardHlp = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
        Ci.nsIClipboardHelper
      );
      clipBoardHlp.copyStringToClipboard(str, useClipboard);
      if (
        clipBoard.supportsSelectionClipboard() &&
        (useClipboard === Ci.nsIClipboard.kSelectionClipboard ||
          clipBoardType === undefined)
      ) {
        clipBoardHlp.copyStringToClipboard(
          str,
          Ci.nsIClipboard.kSelectionClipboard
        );
      }
    } catch (ex) {
      return false;
    }
    return true;
  },
};
