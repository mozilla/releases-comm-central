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

var gSelectOffline = {
  _treeElement: null,
  _offlineBefore: null,

  async load() {
    let adapter;
    if (window.arguments) {
      adapter = new FolderSelectionDataAdapter(window.arguments[0][0]);
      adapter.selectedFolders = this._offlineBefore = new Set(
        window.arguments[0][0].rootFolder.getFoldersWithFlags(
          Ci.nsMsgFolderFlags.Offline
        )
      );
    } else {
      const servers = [];
      this._offlineBefore = new Set();
      for (const account of FolderUtils.allAccountsSorted(true)) {
        const server = account.incomingServer;
        if (
          server instanceof Ci.nsIPop3IncomingServer &&
          server.deferredToAccount
        ) {
          continue;
        }
        if (server.rootFolder.supportsOffline) {
          servers.push(server);
          for (const folder of server.rootFolder.getFoldersWithFlags(
            Ci.nsMsgFolderFlags.Offline
          )) {
            this._offlineBefore.add(folder);
          }
        }
      }
      adapter = new FolderSelectionDataAdapter(servers);
      adapter.selectedFolders = this._offlineBefore;
    }

    await customElements.whenDefined("auto-tree-view");
    this._treeElement = document.getElementById("synchronizeTree");
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
    const offlineAfter = this._treeElement.view.selectedFolders;
    for (const folder of offlineAfter.difference(this._offlineBefore)) {
      folder.setFlag(Ci.nsMsgFolderFlags.Offline);
    }
    for (const folder of this._offlineBefore.difference(offlineAfter)) {
      folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    }
  },
};

window.addEventListener("DOMContentLoaded", () => {
  UIDensity.registerWindow(window);
  // Already registered for UIFontSize by about:accountsettings.
});
window.addEventListener("load", () => gSelectOffline.load());
document.addEventListener("dialogaccept", () => gSelectOffline.onAccept());
