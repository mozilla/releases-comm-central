/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals PROTO_TREE_VIEW */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

window.addEventListener("DOMContentLoaded", () => {
  gSelectVirtual.load();
});

var gFolderTreeView = new PROTO_TREE_VIEW();

var gSelectVirtual = {
  _treeElement: null,
  _selectedList: new Set(),

  load() {
    if (window.arguments[0].searchFolderURIs) {
      const srchFolderUriArray =
        window.arguments[0].searchFolderURIs.split("|");
      for (const uri of srchFolderUriArray) {
        this._selectedList.add(MailUtils.getOrCreateFolder(uri));
      }
    }

    // Add the top level of the folder tree.
    for (const account of FolderUtils.allAccountsSorted(true)) {
      const server = account.incomingServer;
      if (
        server instanceof Ci.nsIPop3IncomingServer &&
        server.deferredToAccount
      ) {
        continue;
      }

      gFolderTreeView._rowMap.push(new FolderRow(server.rootFolder));
    }

    // Recursively expand the tree to show all selected folders.
    function expandToSelected(row, i) {
      hiddenFolders.delete(row._folder);
      for (const folder of hiddenFolders) {
        if (row._folder.isAncestorOf(folder)) {
          gFolderTreeView.toggleOpenState(i);
          for (let j = row.children.length - 1; j >= 0; j--) {
            expandToSelected(row.children[j], i + j + 1);
          }
          break;
        }
      }
    }

    const hiddenFolders = new Set(gSelectVirtual._selectedList);
    for (let i = gFolderTreeView.rowCount - 1; i >= 0; i--) {
      expandToSelected(gFolderTreeView._rowMap[i], i);
    }

    this._treeElement = document.getElementById("folderPickerTree");
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
    if (treeCellInfo.row == -1 || treeCellInfo.col.id != "selectedCol") {
      return;
    }

    this._toggle(treeCellInfo.row);
  },

  _toggle(aRow) {
    const folder = gFolderTreeView._rowMap[aRow]._folder;
    if (this._selectedList.has(folder)) {
      this._selectedList.delete(folder);
    } else {
      this._selectedList.add(folder);
    }

    gFolderTreeView._tree.invalidateRow(aRow);
  },

  onAccept() {
    // XXX We should just pass the folder objects around...
    const uris = [...this._selectedList.values()]
      .map(folder => folder.URI)
      .join("|");

    if (window.arguments[0].okCallback) {
      window.arguments[0].okCallback(uris);
    }
  },
};

document.addEventListener("dialogaccept", () => gSelectVirtual.onAccept());

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
        // From folderUtils.sys.mjs.
        properties = FolderUtils.getFolderProperties(this._folder, this.open);
        break;
      case "selectedCol":
        properties = "selectedColumn";
        if (gSelectVirtual._selectedList.has(this._folder)) {
          properties += " selected-true";
        }
        break;
    }
    return properties;
  }

  get children() {
    if (this._children === null) {
      this._children = [];
      for (const subFolder of this._folder.subFolders) {
        if (!subFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
          this._children.push(new FolderRow(subFolder, this));
        }
      }
      this._children.sort((a, b) => a._folder.compareSortKeys(b._folder));
    }
    return this._children;
  }
}
