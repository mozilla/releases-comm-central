/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals PROTO_TREE_VIEW */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
});

var gFolderTreeView = new PROTO_TREE_VIEW();

var gSelectOffline = {
  _treeElement: null,
  _rollbackMap: new Map(),

  load() {
    for (const account of FolderUtils.allAccountsSorted(true)) {
      const server = account.incomingServer;
      if (
        server instanceof Ci.nsIPop3IncomingServer &&
        server.deferredToAccount
      ) {
        continue;
      }
      if (!server.rootFolder.supportsOffline) {
        continue;
      }

      gFolderTreeView._rowMap.push(new FolderRow(server.rootFolder));
    }

    this._treeElement = document.getElementById("synchronizeTree");
    // TODO: Expand relevant rows.
    this._treeElement.view = gFolderTreeView;
  },

  onKeyPress(aEvent) {
    // For now, only do something on space key.
    if (aEvent.charCode != aEvent.DOM_VK_SPACE) {
      return;
    }

    const selection = this._treeElement.view.selection;
    const start = {};
    const end = {};
    const numRanges = selection.getRangeCount();

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

    const treeCellInfo = this._treeElement.getCellAt(
      aEvent.clientX,
      aEvent.clientY
    );

    if (treeCellInfo.row == -1 || treeCellInfo.col.id != "syncCol") {
      return;
    }

    this._toggle(treeCellInfo.row);
  },

  _toggle(aRow) {
    const folder = gFolderTreeView._rowMap[aRow]._folder;

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
    gFolderTreeView._tree.invalidateRow(aRow);
  },

  onCancel() {
    for (const [folder, value] of this._rollbackMap) {
      if (value != folder.getFlag(Ci.nsMsgFolderFlags.Offline)) {
        folder.toggleFlag(Ci.nsMsgFolderFlags.Offline);
      }
    }
  },
};

window.addEventListener("load", () => gSelectOffline.load());
document.addEventListener("dialogcancel", () => gSelectOffline.onCancel());

/**
 * A tree row representing a single folder.
 */
class FolderRow {
  constructor(folder, parent = null) {
    this._folder = folder;
    this._open = false;
    this._level = parent ? parent.level + 1 : 0;
    this._parent = parent;
    this._children = null;
  }

  get id() {
    return this._folder.URI;
  }

  get text() {
    return this.getText("folderNameCol");
  }

  getText(aColName) {
    switch (aColName) {
      case "folderNameCol":
        return this._folder.abbreviatedName;
      default:
        return "";
    }
  }

  get open() {
    return this._open;
  }

  get level() {
    return this._level;
  }

  getProperties(column) {
    let properties = "";
    switch (column?.id) {
      case "folderNameCol":
        // From folderUtils.jsm.
        properties = FolderUtils.getFolderProperties(this._folder, this.open);
        break;
      case "syncCol":
        if (this._folder.isServer) {
          return "isServer-true";
        }
        properties = "syncCol";
        if (this._folder.getFlag(Ci.nsMsgFolderFlags.Offline)) {
          properties += " synchronize-true";
        }
        break;
    }
    return properties;
  }

  get children() {
    if (this._children === null) {
      this._children = [];
      for (const subFolder of this._folder.subFolders) {
        if (subFolder.supportsOffline) {
          this._children.push(new FolderRow(subFolder, this));
        }
      }
      this._children.sort((a, b) => a._folder.compareSortKeys(b._folder));
    }
    return this._children;
  }
}
