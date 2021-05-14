/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/addrbook/content/abDragDrop.js */
/* import-globals-from abCommon.js */

/**
 * This file contains our implementation for various addressbook trees.  It
 * depends on jsTreeView.js being loaded before this script is loaded.
 */

var { compareAddressBooks } = ChromeUtils.import(
  "resource:///modules/AddrBookUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * Each abDirTreeItem corresponds to one row in the tree view.
 */
function abDirTreeItem(aDirectory) {
  this._directory = aDirectory;
}

abDirTreeItem.prototype = {
  get directory() {
    return this._directory;
  },

  getText() {
    return this._directory.dirName;
  },

  get id() {
    return this._directory.URI;
  },

  get uid() {
    return this._directory.UID;
  },

  _open: false,
  get open() {
    return this._open;
  },

  _level: 0,
  get level() {
    return this._level;
  },

  _children: null,
  get children() {
    if (!this._children) {
      this._children = [];
      let dirs;
      if (this._directory.URI == kAllDirectoryRoot + "?") {
        dirs = MailServices.ab.directories;
      } else {
        dirs = this._directory.childNodes;
      }

      for (let dir of dirs) {
        var abItem = new abDirTreeItem(dir);
        if (
          gDirectoryTreeView &&
          this.id == kAllDirectoryRoot + "?" &&
          abItem instanceof Ci.nsIAbLDAPDirectory
        ) {
          gDirectoryTreeView.hasRemoteAB = true;
        }

        this._children.push(abItem);
        this._children[this._children.length - 1]._level = this._level + 1;
        this._children[this._children.length - 1]._parent = this;
      }
    }
    return this._children;
  },

  getProperties() {
    let properties = [];
    if (this._directory.isMailList) {
      properties.push("IsMailList-true");
    }
    if (this._directory.isRemote) {
      properties.push("IsRemote-true");
    }
    if (this._directory.isSecure) {
      properties.push("IsSecure-true");
    }
    return properties.join(" ");
  },
};

/**
 * Our actual implementation of nsITreeView.
 */
function directoryTreeView() {}
directoryTreeView.prototype = {
  __proto__: new PROTO_TREE_VIEW(),
  QueryInterface: ChromeUtils.generateQI([
    "nsITreeView",
    "nsIObserver",
    "nsISupportsWeakReference",
  ]),

  hasRemoteAB: false,

  _notifications: [
    "addrbook-directory-created",
    "addrbook-directory-updated",
    "addrbook-directory-deleted",
    "addrbook-list-created",
    "addrbook-list-updated",
    "addrbook-list-deleted",
    "addrbook-reloaded",
  ],

  /**
   * Init the tree view.
   *
   * @param {XULTreeElement} aTree - The element to init.
   * @param {string} [aJSONFile] - The persistent-open-state JSON file; directoryTree.json
   */
  async init(aTree, aJSONFile = null) {
    if (aJSONFile) {
      // Parse our persistent-open-state json file
      let spec = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        aJSONFile
      );
      try {
        this._persistOpenMap = await IOUtils.readJSON(spec);
      } catch (ex) {
        if (!["NotFoundError"].includes(ex.name)) {
          Cu.reportError(ex);
        }
      }
    }

    this._rebuild();
    aTree.view = this;

    for (let topic of this._notifications) {
      Services.obs.addObserver(this, topic, true);
    }
  },

  async shutdown(aJSONFile) {
    // Write out the persistOpenMap to our JSON file
    if (aJSONFile) {
      // Write out our json file...
      let spec = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        aJSONFile
      );
      await IOUtils.writeJSON(spec, this._persistOpenMap);
    }
  },

  // Override the dnd methods for those functions in abDragDrop.js
  canDrop(aIndex, aOrientation, dataTransfer) {
    return abDirTreeObserver.canDrop(aIndex, aOrientation, dataTransfer);
  },

  drop(aRow, aOrientation, dataTransfer) {
    abDirTreeObserver.onDrop(aRow, aOrientation, dataTransfer);
  },

  getDirectoryAtIndex(aIndex) {
    return this._rowMap[aIndex]._directory;
  },

  // Override jsTreeView's isContainer, since we want to be able
  // to react to drag-drop events for all items in the directory
  // tree.
  isContainer(aIndex) {
    return true;
  },

  /**
   * Returns true if the selected directory is inline-editable.
   * @param {int} aRow - the row index of the selected dir/mail list.
   * @param {int} aCol - not used a directories are represented as rows only.
   */
  isEditable(aRow, aCol) {
    let selectedDirectory = this.getDirectoryAtIndex(aRow);

    // Prevent the renaming of Personal Address Book, Collected Addresses
    // and All Address Books directories.
    if (
      !selectedDirectory ||
      selectedDirectory.URI == kAllDirectoryRoot + "?" ||
      selectedDirectory.URI == kPersonalAddressbookURI ||
      selectedDirectory.URI == kCollectedAddressbookURI
    ) {
      return false;
    }
    return true;
  },

  /**
   * Saves the new name  dir/mail list.
   * @param {int} aRow - the row index of the selected  dir/mail list.
   * @param {int} aCol - not used a directories are represented as rows only.
   * @param {string} aValue - the new name of dir/mail list to be saved.
   */
  setCellText(aRow, aCol, aValue) {
    let selectedDirectory = this.getDirectoryAtIndex(aRow);
    let newName = aValue.trim();

    // Check if the new name is empty.
    if (newName.length == 0) {
      return;
    }

    // Mailists requires to call the backend to update its name.
    if (selectedDirectory.isMailList) {
      // Check if the new name contains 2 spaces.
      if (newName.match("  ")) {
        return;
      }

      // Check if the new name contains the following special characters.
      for (let char of ',;"<>') {
        if (newName.includes(char)) {
          return;
        }
      }

      // Prevent duplicate names but allow case change in case canonical name is the same.
      let canonicalNewListName = newName.toLowerCase();
      let canonicalOldListName = selectedDirectory.dirName.toLowerCase();
      if (
        canonicalNewListName != canonicalOldListName &&
        MailServices.ab.mailListNameExists(newName)
      ) {
        return;
      }

      selectedDirectory.dirName = newName;
      selectedDirectory.editMailListToDatabase(null);
    } else {
      // Do not allow an already existing name.
      if (MailServices.ab.directoryNameExists(newName)) {
        return;
      }

      /* Name is unique, set value */
      selectedDirectory.dirName = newName;
    }
  },

  /**
   * NOTE: This function will result in indeterminate rows being selected.
   *       Callers should take care to re-select a desired row after calling
   *       this function.
   */
  _rebuild() {
    var oldCount = this._rowMap.length;
    this._rowMap = [];

    // Make an entry for All Address Books.
    let rootAB = {
      QueryInterface: ChromeUtils.generateQI(["nsIAbDirectory"]),

      dirName: gAddressBookBundle.getString("allAddressBooks"),
      isMailList: false,
      isRemote: false,
      isSecure: false,
      URI: kAllDirectoryRoot + "?",

      get childNodes() {
        return MailServices.ab.directories;
      },

      get propertiesChromeURI() {
        return "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";
      },
    };
    this._rowMap.push(new abDirTreeItem(rootAB));

    if (this._tree) {
      this._tree.rowCountChanged(0, this._rowMap.length - oldCount);
    }

    this._restoreOpenStates();
  },

  getIndexForId(id) {
    return this._rowMap.findIndex(r => r.id == id);
  },

  getIndexForUID(uid) {
    return this._rowMap.findIndex(r => r.uid == uid);
  },

  observe(subject, topic, data) {
    // Test-only reload of the address book manager.
    if (topic == "addrbook-reloaded") {
      this._rebuild();
      selectStartupViewDirectory();
      return;
    }
    if (!this._tree) {
      return;
    }

    subject.QueryInterface(Ci.nsIAbDirectory);

    switch (topic) {
      case "addrbook-directory-created":
      case "addrbook-list-created": {
        let parentIndex = 0;
        if (!this.isContainerOpen(0)) {
          this.toggleOpenState(0);
        }
        if (data) {
          parentIndex = this.getIndexForUID(data);
          if (!parentIndex) {
            // This should never happen, but just in case, return.
            break;
          }
          if (!this.isContainerOpen(parentIndex)) {
            this.toggleOpenState(parentIndex);
          }
        }
        let parentItem = this._rowMap[parentIndex];

        let newItem = new abDirTreeItem(subject);
        newItem._level = parentItem.level + 1;

        let newIndex = null;
        for (let childItem of parentItem.children.reverse()) {
          if (compareAddressBooks(subject, childItem.directory) < 0) {
            newIndex = this.getIndexForId(childItem.id);
          }
        }
        if (newIndex === null) {
          newIndex = this._rowMap.findIndex(
            (row, index) => index > parentIndex && row.level == parentItem.level
          );
          if (newIndex < 0) {
            newIndex = this._rowMap.length;
          }
        }

        this._rowMap.splice(newIndex, 0, newItem);
        delete parentItem._children;
        if (this._tree) {
          this._tree.rowCountChanged(newIndex, 1);
        }
        break;
      }
      case "addrbook-directory-updated":
      case "addrbook-list-updated": {
        let index = this.getIndexForId(subject.URI);
        if (index >= 0) {
          this._rowMap[index]._directory = subject;
          this._tree.invalidateRow(index);
        }
        break;
      }
      case "addrbook-directory-deleted":
      case "addrbook-list-deleted": {
        let parentIndex = 0;
        if (data) {
          parentIndex = this.getIndexForUID(data);
          if (!parentIndex) {
            // An ancestor is probably closed.
            break;
          }
        }
        let parentItem = this._rowMap[parentIndex];

        let removedIndex = this.getIndexForId(subject.URI);
        if (!removedIndex) {
          // An ancestor is probably closed.
          break;
        }
        let removedItem = this._rowMap[removedIndex];
        if (
          this.selection &&
          this.selection.currentIndex >= removedIndex &&
          this.selection.currentIndex <=
            removedIndex + removedItem.children.length
        ) {
          this.selection.select(parentIndex);
        }
        this._rowMap.splice(removedIndex, 1 + removedItem.children.length);
        delete parentItem._children;
        if (this._tree) {
          this._tree.rowCountChanged(
            removedIndex,
            -1 - removedItem.children.length
          );
        }
        break;
      }
    }
  },
};

var gDirectoryTreeView = new directoryTreeView();
