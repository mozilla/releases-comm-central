/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MailServices, PROTO_TREE_VIEW, Services */

function ABView(directory, searchQuery, listener, sortColumn, sortDirection) {
  this.__proto__.__proto__ = new PROTO_TREE_VIEW();
  this.directory = directory;
  this.listener = listener;

  let directories = directory ? [directory] : MailServices.ab.directories;
  if (searchQuery) {
    searchQuery = searchQuery.replace(/^\?+/, "");
    for (let dir of directories) {
      dir.search(searchQuery, this);
    }
  } else {
    for (let dir of directories) {
      for (let card of dir.childCards) {
        this._rowMap.push(new abViewCard(card));
      }
    }
    if (this.listener) {
      this.listener.onCountChanged(this.rowCount);
    }
  }
  this.sortBy(sortColumn, sortDirection);
}
ABView.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    Ci.nsITreeView,
    Ci.nsIAbDirSearchListener,
    Ci.nsIObserver,
    Ci.nsISupportsWeakReference,
  ]),

  directory: null,
  listener: null,
  _notifications: [
    "addrbook-contact-created",
    "addrbook-contact-deleted",
    "addrbook-list-member-added",
    "addrbook-list-member-removed",
  ],

  sortColumn: "",
  sortDirection: "",

  deleteSelectedCards() {
    let directoryMap = new Map();
    for (let i = 0; i < this.selection.getRangeCount(); i++) {
      let start = {};
      let finish = {};
      this.selection.getRangeAt(i, start, finish);
      for (let j = start.value; j <= finish.value; j++) {
        let card = this.getCardFromRow(j);
        let directoryId = card.directoryId.split("&")[0];
        let cardSet = directoryMap.get(directoryId);
        if (!cardSet) {
          cardSet = new Set();
          directoryMap.set(directoryId, cardSet);
        }
        cardSet.add(card);
      }
    }

    for (let [directoryId, cardSet] of directoryMap) {
      let directory;
      if (this.directory && this.directory.isMailList) {
        // Removes cards from the list instead of deleting them.
        directory = this.directory;
      } else {
        directory = MailServices.ab.getDirectoryFromId(directoryId);
      }

      cardSet = [...cardSet];
      directory.deleteCards(cardSet.filter(card => !card.isMailList));
      for (let card of cardSet.filter(card => card.isMailList)) {
        MailServices.ab.deleteAddressBook(card.mailListURI);
      }
    }
  },
  getCardFromRow(row) {
    return this._rowMap[row] ? this._rowMap[row].card : null;
  },
  sortBy(sortColumn, sortDirection, resort) {
    if (sortColumn == this.sortColumn && !resort) {
      if (sortDirection == this.sortDirection) {
        return;
      }
      this._rowMap.reverse();
    } else {
      this._rowMap.sort((a, b) => {
        let aText = a.getText(sortColumn);
        let bText = b.getText(sortColumn);
        if (aText == bText) {
          return 0;
        }
        return aText < bText ? -1 : 1;
      });
    }

    if (this.tree) {
      this.tree.invalidate();
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
  },

  // nsITreeView

  selectionChanged() {
    if (this.listener) {
      this.listener.onSelectionChanged();
    }
  },
  setTree(tree) {
    this.tree = tree;
    for (let topic of this._notifications) {
      if (tree) {
        Services.obs.addObserver(this, topic, true);
      } else {
        Services.obs.removeObserver(this, topic);
      }
    }
  },

  // nsIAbDirSearchListener

  onSearchFoundCard(card) {
    this._rowMap.push(new abViewCard(card));
  },
  onSearchFinished(result, errorMsg) {
    this.sortBy(this.sortColumn, this.sortDirection, true);
    if (this.listener) {
      this.listener.onCountChanged(this.rowCount);
    }
  },

  // nsIObserver

  observe(subject, topic, data) {
    if (this.directory && this.directory.UID != data) {
      // How did we get here?
      return;
    }

    switch (topic) {
      case "addrbook-list-member-added":
        if (!this.directory) {
          break;
        }
      // Falls through.
      case "addrbook-contact-created":
        this._rowMap.push(new abViewCard(subject));
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        break;
      case "addrbook-list-member-removed":
        if (!this.directory) {
          break;
        }
      // Falls through.
      case "addrbook-contact-deleted":
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].card.equals(subject)) {
            this._rowMap.splice(i, 1);
          }
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        break;
    }
  },
};

function abViewCard(card) {
  this.card = card;
}
abViewCard.prototype = {
  getText(columnID) {
    try {
      switch (columnID) {
        case "addrbook": {
          let { directoryId } = this.card;
          return directoryId.substring(directoryId.indexOf("&") + 1);
        }
        case "GeneratedName":
          return this.card.generateName(
            Services.prefs.getIntPref("mail.addr_book.lastnamefirst", 0)
          );
        case "_PhoneticName":
          return this.card.generatePhoneticName(true);
        case "ChatName":
          return this.card.isMailList ? "" : this.card.generateChatName();
        default:
          return this.card.isMailList
            ? ""
            : this.card.getPropertyAsAString(columnID);
      }
    } catch (ex) {
      return "";
    }
  },
  get id() {
    return this.card.UID;
  },
  get open() {
    return false;
  },
  get level() {
    return 0;
  },
  get children() {
    return [];
  },
  getProperties() {
    return this.card.isMailList ? "MailList" : "";
  },
};
