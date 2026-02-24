/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { FolderSelectionDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/FolderSelectionDataAdapter.mjs",
  { global: "current" }
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

ChromeUtils.importESModule(
  "chrome://messenger/content/checkbox-tree-table-row.mjs",
  { global: "current" }
);

ChromeUtils.defineESModuleGetters(this, {
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

window.addEventListener("DOMContentLoaded", () => {
  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);
});
window.addEventListener("load", () => {
  gSelectVirtual.load();
});

var gSelectVirtual = {
  _treeElement: null,

  async load() {
    const selectedFolders = new Set();
    if (window.arguments[0].searchFolderURIs) {
      const srchFolderUriArray =
        window.arguments[0].searchFolderURIs.split("|");
      for (const uri of srchFolderUriArray) {
        selectedFolders.add(MailUtils.getOrCreateFolder(uri));
      }
    }

    const adapter = new FolderSelectionDataAdapter();
    adapter.selectedFolders = selectedFolders;

    await customElements.whenDefined("checkbox-tree-table-row");
    this._treeElement = document.getElementById("folderPickerTree");
    this._treeElement.setAttribute("rows", "checkbox-tree-table-row");
    this._treeElement.headerHidden = true;

    this._treeElement.view = adapter;
  },

  onAccept() {
    const uris = Array.from(
      this._treeElement.view.selectedFolders,
      folder => folder.URI
    ).join("|");

    if (window.arguments[0].okCallback) {
      window.arguments[0].okCallback(uris);
    }
  },
};

document.addEventListener("dialogaccept", () => gSelectVirtual.onAccept());
