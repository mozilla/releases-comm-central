/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailDialog"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
});

var EnigmailDialog = {
  /**
   *  Display a "open file" or "save file" dialog
   *
   *  win:              nsIWindow - parent window
   *  title:            String    - window title
   *  displayDir:       String    - optional: directory to be displayed
   *  save:             Boolean   - true = Save file / false = Open file
   *  multiple:         Boolean   - true = Select multiple files / false = Select single file
   *  defaultExtension: String    - optional: extension for the type of files to work with, e.g. "asc"
   *  defaultName:      String    - optional: filename, incl. extension, that should be suggested to
   *                                the user as default, e.g. "keys.asc"
   *  filterPairs:      Array     - optional: [title, extension], e.g. ["Pictures", "*.jpg; *.png"]
   *
   *  return value:     nsIFile object, or array of nsIFile objects,
   *                    representing the file(s) to load or save
   */
  filePicker(
    win,
    title,
    displayDir,
    save,
    multiple,
    defaultExtension,
    defaultName,
    filterPairs
  ) {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance();
    filePicker = filePicker.QueryInterface(Ci.nsIFilePicker);

    const open = multiple
      ? Ci.nsIFilePicker.modeOpenMultiple
      : Ci.nsIFilePicker.modeOpen;
    const mode = save ? Ci.nsIFilePicker.modeSave : open;

    filePicker.init(win, title, mode);
    if (displayDir) {
      var localFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );

      try {
        localFile.initWithPath(displayDir);
        filePicker.displayDirectory = localFile;
      } catch (ex) {}
    }

    if (defaultExtension) {
      filePicker.defaultExtension = defaultExtension;
    }

    if (defaultName) {
      filePicker.defaultString = defaultName;
    }

    let nfilters = 0;
    if (filterPairs && filterPairs.length) {
      nfilters = filterPairs.length / 2;
    }

    for (let index = 0; index < nfilters; index++) {
      filePicker.appendFilter(
        filterPairs[2 * index],
        filterPairs[2 * index + 1]
      );
    }

    filePicker.appendFilters(Ci.nsIFilePicker.filterAll);

    const inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(
      Ci.nsIJSInspector
    );
    const files = [];
    filePicker.open(res => {
      if (
        res != Ci.nsIFilePicker.returnOK &&
        res != Ci.nsIFilePicker.returnReplace
      ) {
        inspector.exitNestedEventLoop();
        return;
      }

      // Loop through multiple selected files only if the dialog was triggered
      // to open files and the `multiple` boolean variable is true.
      if (!save && multiple) {
        for (const file of filePicker.files) {
          // XXX: for some reason QI is needed on Mac.
          files.push(file.QueryInterface(Ci.nsIFile));
        }
      } else {
        files.push(filePicker.file);
      }

      inspector.exitNestedEventLoop();
    });

    inspector.enterNestedEventLoop(0); // wait for async process to terminate

    return multiple ? files : files[0];
  },

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
