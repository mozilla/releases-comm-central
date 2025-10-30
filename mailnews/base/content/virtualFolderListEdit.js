/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { FolderSelectionDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/FolderSelectionDataAdapter.mjs"
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

    await customElements.whenDefined("auto-tree-view");
    this._treeElement = document.getElementById("folderPickerTree");
    this._treeElement.setAttribute("rows", "auto-tree-view-table-row");
    this._treeElement.headerHidden = true;
    this._treeElement.defaultColumns = [
      {
        id: "name",
        sortable: false,
        twisty: true,
        cellIcon: true,
      },
      {
        id: "folderSelected",
        sortable: false,
        checkbox: "folderSelected",
      },
    ];
    this._treeElement.addEventListener("keypress", this);

    this._treeElement.view = adapter;
  },

  handleEvent(event) {
    // For now, only do something on space key.
    if (event.key != " " || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const view = this._treeElement.view;
    const shouldSelect = !view
      .rowAt(this._treeElement.currentIndex)
      ?.hasProperty("folderSelected");
    for (const index of this._treeElement.selectedIndices) {
      view.rowAt(index).toggleProperty("folderSelected", shouldSelect);
      this._treeElement.invalidateRow(index);
    }
    event.preventDefault();
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
