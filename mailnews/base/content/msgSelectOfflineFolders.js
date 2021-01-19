/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/folderPane.js */

var gSelectOffline = {
  _treeElement: null,
  _rollbackMap: new Map(),

  load() {
    let oldProps = FtvItem.prototype.getProperties;
    FtvItem.prototype.getProperties = function(aColumn) {
      if (!aColumn || aColumn.id != "syncCol") {
        return oldProps.call(this, aColumn);
      }

      let properties = "syncCol";

      if (this._folder.isServer) {
        return " isServer-true";
      }

      if (this._folder.getFlag(Ci.nsMsgFolderFlags.Offline)) {
        properties += " synchronize-true";
      }

      return properties;
    };

    let modeOffline = {
      __proto__: IFolderTreeMode,

      generateMap(ftv) {
        let filterOffline = function(aFolder) {
          return aFolder.supportsOffline;
        };
        let accounts = gFolderTreeView
          ._sortedAccounts()
          .filter(acct => filterOffline(acct.incomingServer.rootFolder));
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();
        return accounts.map(
          acct => new FtvItem(acct.incomingServer.rootFolder, filterOffline)
        );
      },
    };

    this._treeElement = document.getElementById("synchronizeTree");

    gFolderTreeView.registerFolderTreeMode(
      this._treeElement.getAttribute("mode"),
      modeOffline,
      "Offline Folders"
    );
    gFolderTreeView.load(this._treeElement);
  },

  onKeyPress(aEvent) {
    // For now, only do something on space key.
    if (aEvent.charCode != aEvent.DOM_VK_SPACE) {
      return;
    }

    let selection = this._treeElement.view.selection;
    let start = {};
    let end = {};
    let numRanges = selection.getRangeCount();

    for (let range = 0; range < numRanges; range++) {
      selection.getRangeAt(range, start, end);
      for (let i = start.value; i <= end.value; i++) {
        this._toggle(i);
      }
    }
  },

  onClick(aEvent) {
    // We only care about button 0 (left click) events.
    if (aEvent.button != 0) {
      return;
    }

    // We don't want to toggle when clicking on header or tree (scrollbar) or
    // on treecol.
    if (aEvent.target.nodeName != "treechildren") {
      return;
    }

    let treeCellInfo = this._treeElement.getCellAt(
      aEvent.clientX,
      aEvent.clientY
    );

    if (treeCellInfo.row == -1 || treeCellInfo.col.id != "syncCol") {
      return;
    }

    this._toggle(treeCellInfo.row);
  },

  _toggle(aRow) {
    let folder = gFolderTreeView._rowMap[aRow]._folder;

    if (folder.isServer) {
      return;
    }

    // Save our current state for rollback, if necessary.
    if (!this._rollbackMap.has(folder)) {
      this._rollbackMap.set(
        folder,
        folder.getFlag(Ci.nsMsgFolderFlags.Offline)
      );
    }

    folder.toggleFlag(Ci.nsMsgFolderFlags.Offline);
    gFolderTreeView.clearFolderCacheProperty(folder, "properties");
    gFolderTreeView._tree.invalidateRow(aRow);
  },

  onCancel() {
    for (let [folder, value] of this._rollbackMap) {
      if (value != folder.getFlag(Ci.nsMsgFolderFlags.Offline)) {
        folder.toggleFlag(Ci.nsMsgFolderFlags.Offline);
      }
    }
  },
};

window.addEventListener("load", () => gSelectOffline.load());
window.addEventListener("unload", () => gFolderTreeView.unload());
document.addEventListener("dialogcancel", () => gSelectOffline.onCancel());
