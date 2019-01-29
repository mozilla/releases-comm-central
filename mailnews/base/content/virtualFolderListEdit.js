/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");

var gSelectVirtual = {
  _treeElement: null,
  _selectedList: new Set(),

  load: function() {
    if (window.arguments[0].searchFolderURIs) {
      let srchFolderUriArray = window.arguments[0].searchFolderURIs.split('|');
      for (let uri of srchFolderUriArray) {
        this._selectedList.add(MailUtils.getOrCreateFolder(uri));
      }
    }

    // Now tweak the folder tree for our purposes here.
    let oldProps = ftvItem.prototype.getProperties;
    ftvItem.prototype.getProperties = function(aColumn) {
      if (!aColumn || aColumn.id != "selectedCol")
        return oldProps.call(this, aColumn);

      let properties = "selectedColumn";
      if (gSelectVirtual._selectedList.has(this._folder))
        properties += " selected-true";

      return properties;
    }

    let modeVirtual = {
      __proto__: IFolderTreeMode,

      generateMap: function(ftv) {
        let accounts = gFolderTreeView._sortedAccounts();
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();
        let filterVirtual = function(aFolder) {
          return !aFolder.getFlag(Ci.nsMsgFolderFlags.Virtual);
        }
        return accounts.map(acct => new ftvItem(acct.incomingServer.rootFolder,
                                                filterVirtual));
      }
    };
    this._treeElement = document.getElementById("folderPickerTree");

    gFolderTreeView.registerFolderTreeMode(this._treeElement.getAttribute("mode"),
                                           modeVirtual, "Virtual Folders");
    gFolderTreeView.load(this._treeElement);
  },

  onKeyPress: function(aEvent) {
    // For now, only do something on space key.
    if (aEvent.charCode != aEvent.DOM_VK_SPACE)
      return;

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

  onClick: function(aEvent) {
    // We only care about button 0 (left click) events.
    if (aEvent.button != 0)
      return;

    let treeCellInfo = this._treeElement.getCellAt(aEvent.clientX, aEvent.clientY);
    if (treeCellInfo.row == -1 || treeCellInfo.col.id != "selectedCol")
      return;

    this._toggle(treeCellInfo.row);
  },

  _toggle: function(aRow) {
    let folder = gFolderTreeView._rowMap[aRow]._folder;
    if (this._selectedList.has(folder))
      this._selectedList.delete(folder);
    else
      this._selectedList.add(folder);

    gFolderTreeView._tree.invalidateRow(aRow);
  },

  onAccept: function() {
    gFolderTreeView.unload();
    // XXX We should just pass the folder objects around...
    let uris = [...this._selectedList.values()].map(folder => folder.URI).join("|");

    if (window.arguments[0].okCallback)
      window.arguments[0].okCallback(uris);
  },

  onCancel: function() {
    gFolderTreeView.unload();
  }
};
