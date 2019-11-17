/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailClipboard"];

// Import the Services module for future use, if we're not in
// a browser window where it's already loaded.
const Services = ChromeUtils.import('resource://gre/modules/Services.jsm').Services;


// Create a constructor for the built-in supports-string class.
const nsSupportsString = Components.Constructor("@mozilla.org/supports-string;1", "nsISupportsString");

function SupportsString(str) {
  // Create an instance of the supports-string class
  var res = nsSupportsString();

  // Store the JavaScript string that we want to wrap in the new nsISupportsString object
  res.data = str;
  return res;
}

// Create a constructor for the built-in transferable class
const nsTransferable = Components.Constructor("@mozilla.org/widget/transferable;1", "nsITransferable");

// Create a wrapper to construct an nsITransferable instance and set its source to the given window, when necessary
function Transferable(source) {
  let res = nsTransferable();
  if ('init' in res) {
    // When passed a Window object, find a suitable privacy context for it.
    if (source instanceof Ci.nsIDOMWindow)
      source = source.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation);

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

  getClipboardContent: function(window, clipBoardType) {
    if (!window) throw "erorr - window must not be null";

    let clipBoard = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
    let data = {};
    let cBoardContent = "";

    if (clipBoardType !== clipBoard.kSelectionClipboard || clipBoard.supportsSelectionClipboard()) {
      try {
        let transferable = Transferable(window);
        transferable.addDataFlavor("text/unicode");
        clipBoard.getData(transferable, clipBoardType);
        let flavour = {};
        let length = {};
        transferable.getAnyTransferData(flavour, data, length);
        cBoardContent = data.value.QueryInterface(Ci.nsISupportsString).data;
      }
      catch (ex) {}
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
  setClipboardContent: function(str, clipBoardType) {
    let useClipboard = clipBoardType;
    if (clipBoardType === undefined) {
      useClipboard = Ci.nsIClipboard.kGlobalClipboard;
    }
    try {
      let clipBoard = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
      let clipBoardHlp = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
      clipBoardHlp.copyStringToClipboard(str, useClipboard);
      if (clipBoard.supportsSelectionClipboard() &&
        (useClipboard === Ci.nsIClipboard.kSelectionClipboard || clipBoardType === undefined)) {
        clipBoardHlp.copyStringToClipboard(str, Ci.nsIClipboard.kSelectionClipboard);
      }
    }
    catch (ex) {
      return false;
    }
    return true;
  }
};
