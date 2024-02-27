/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MailServices, PROTO_TREE_VIEW, Services */

function ABView(
  directory,
  searchQuery,
  searchString,
  listener,
  sortColumn,
  sortDirection
) {
  this.__proto__.__proto__ = new PROTO_TREE_VIEW();
  this.directory = directory;
  this.listener = listener;

  const directories = directory ? [directory] : MailServices.ab.directories;
  if (searchQuery) {
    searchQuery = searchQuery.replace(/^\?+/, "");
    for (const dir of directories) {
      dir.search(searchQuery, searchString, this);
    }
  } else {
    for (const dir of directories) {
      for (const card of dir.childCards) {
        this._rowMap.push(new abViewCard(card, dir));
      }
    }
    if (this.listener) {
      this.listener.onCountChanged(this.rowCount);
    }
  }
  this.sortBy(sortColumn, sortDirection);
}
ABView.nameFormat = Services.prefs.getIntPref(
  "mail.addr_book.lastnamefirst",
  0
);
ABView.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    "nsITreeView",
    "nsIAbDirSearchListener",
    "nsIObserver",
    "nsISupportsWeakReference",
  ]),

  directory: null,
  listener: null,
  _notifications: [
    "addrbook-directory-deleted",
    "addrbook-directory-invalidated",
    "addrbook-contact-created",
    "addrbook-contact-updated",
    "addrbook-contact-deleted",
    "addrbook-list-created",
    "addrbook-list-updated",
    "addrbook-list-deleted",
    "addrbook-list-member-added",
    "addrbook-list-member-removed",
  ],

  sortColumn: "",
  sortDirection: "",
  collator: new Intl.Collator(undefined, { numeric: true }),

  deleteSelectedCards() {
    const directoryMap = new Map();
    for (let i = 0; i < this.selection.getRangeCount(); i++) {
      const start = {};
      const finish = {};
      this.selection.getRangeAt(i, start, finish);
      for (let j = start.value; j <= finish.value; j++) {
        const card = this.getCardFromRow(j);
        let cardSet = directoryMap.get(card.directoryUID);
        if (!cardSet) {
          cardSet = new Set();
          directoryMap.set(card.directoryUID, cardSet);
        }
        cardSet.add(card);
      }
    }

    for (let [directoryUID, cardSet] of directoryMap) {
      let directory;
      if (this.directory && this.directory.isMailList) {
        // Removes cards from the list instead of deleting them.
        directory = this.directory;
      } else {
        directory = MailServices.ab.getDirectoryFromUID(directoryUID);
      }

      cardSet = [...cardSet];
      directory.deleteCards(cardSet.filter(card => !card.isMailList));
      for (const card of cardSet.filter(card => card.isMailList)) {
        MailServices.ab.deleteAddressBook(card.mailListURI);
      }
    }
  },
  getCardFromRow(row) {
    return this._rowMap[row] ? this._rowMap[row].card : null;
  },
  getDirectoryFromRow(row) {
    return this._rowMap[row] ? this._rowMap[row].directory : null;
  },
  sortBy(sortColumn, sortDirection, resort) {
    // Remember what was selected.
    const selection = this.selection;
    if (selection) {
      for (let i = 0; i < this._rowMap.length; i++) {
        this._rowMap[i].wasSelected = selection.isSelected(i);
        this._rowMap[i].wasCurrent = selection.currentIndex == i;
      }
    }

    // Do the sort.
    if (sortColumn == this.sortColumn && !resort) {
      if (sortDirection == this.sortDirection) {
        return;
      }
      this._rowMap.reverse();
    } else {
      this._rowMap.sort((a, b) => {
        const aText = a.getText(sortColumn);
        const bText = b.getText(sortColumn);
        if (sortDirection == "descending") {
          return this.collator.compare(bText, aText);
        }
        return this.collator.compare(aText, bText);
      });
    }

    // Restore what was selected.
    if (selection) {
      selection.selectEventsSuppressed = true;
      for (let i = 0; i < this._rowMap.length; i++) {
        if (this._rowMap[i].wasSelected != selection.isSelected(i)) {
          selection.toggleSelect(i);
        }
      }
      // Can't do this until updating the selection is finished.
      for (let i = 0; i < this._rowMap.length; i++) {
        if (this._rowMap[i].wasCurrent) {
          selection.currentIndex = i;
          break;
        }
      }
      this.selectionChanged();
      selection.selectEventsSuppressed = false;
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
    for (const topic of this._notifications) {
      if (tree) {
        Services.obs.addObserver(this, topic, true);
      } else {
        try {
          Services.obs.removeObserver(this, topic);
        } catch (ex) {
          // `this` might not be a valid observer.
        }
      }
    }
    Services.prefs.addObserver("mail.addr_book.lastnamefirst", this, true);
  },

  // nsIAbDirSearchListener

  onSearchFoundCard(card) {
    // Instead of duplicating the insertion code below, just call it.
    this.observe(card, "addrbook-contact-created", this.directory?.UID);
  },
  onSearchFinished(status, complete, secInfo, location) {
    // Special handling for Bad Cert errors.
    let offerCertException = false;
    try {
      // If code is not an NSS error, getErrorClass() will fail.
      const nssErrorsService = Cc[
        "@mozilla.org/nss_errors_service;1"
      ].getService(Ci.nsINSSErrorsService);
      const errorClass = nssErrorsService.getErrorClass(status);
      if (errorClass == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        offerCertException = true;
      }
    } catch (ex) {}

    if (offerCertException) {
      // Give the user the option of adding an exception for the bad cert.
      const params = {
        exceptionAdded: false,
        securityInfo: secInfo,
        prefetchCert: true,
        location,
      };
      window.openDialog(
        "chrome://pippki/content/exceptionDialog.xhtml",
        "",
        "chrome,centerscreen,modal",
        params
      );
      // params.exceptionAdded will be set if the user added an exception.
    }
  },

  // nsIObserver

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      ABView.nameFormat = Services.prefs.getIntPref(
        "mail.addr_book.lastnamefirst",
        0
      );
      for (const card of this._rowMap) {
        delete card._getTextCache.GeneratedName;
      }
      if (this.tree) {
        if (this.sortColumn == "GeneratedName") {
          this.sortBy(this.sortColumn, this.sortDirection, true);
        } else {
          this.tree.invalidate(this.tree.columns.GeneratedName);
        }
      }
      return;
    }

    if (this.directory && data && this.directory.UID != data) {
      return;
    }

    // If we make it here, we're in the root directory, or the right directory.

    switch (topic) {
      case "addrbook-directory-deleted": {
        if (this.directory) {
          break;
        }

        subject.QueryInterface(Ci.nsIAbDirectory);
        const scrollPosition = this.tree?.getFirstVisibleRow();
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].directory.UID == subject.UID) {
            this._rowMap.splice(i, 1);
            if (this.tree) {
              this.tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        if (this.tree && scrollPosition !== null) {
          this.tree.scrollToRow(scrollPosition);
        }
        break;
      }
      case "addrbook-directory-invalidated":
        subject.QueryInterface(Ci.nsIAbDirectory);
        if (subject == this.directory) {
          this._rowMap.length = 0;
          for (const card of this.directory.childCards) {
            this._rowMap.push(new abViewCard(card, this.directory));
          }
          this.sortBy(this.sortColumn, this.sortDirection, true);
          if (this.listener) {
            this.listener.onCountChanged(this.rowCount);
          }
        }
        break;
      case "addrbook-list-created": {
        const parentDir = MailServices.ab.getDirectoryFromUID(data);
        // `subject` is an nsIAbDirectory, make it the matching card instead.
        subject.QueryInterface(Ci.nsIAbDirectory);
        for (const card of parentDir.childCards) {
          if (card.UID == subject.UID) {
            subject = card;
            break;
          }
        }
      }
      // Falls through.
      case "addrbook-list-member-added":
      case "addrbook-contact-created": {
        if (topic == "addrbook-list-member-added" && !this.directory) {
          break;
        }

        subject.QueryInterface(Ci.nsIAbCard);
        const viewCard = new abViewCard(subject);
        const sortText = viewCard.getText(this.sortColumn);
        let addIndex = null;
        for (let i = 0; addIndex === null && i < this._rowMap.length; i++) {
          const comparison = this.collator.compare(
            sortText,
            this._rowMap[i].getText(this.sortColumn)
          );
          if (
            (comparison < 0 && this.sortDirection == "ascending") ||
            (comparison >= 0 && this.sortDirection == "descending")
          ) {
            addIndex = i;
          }
        }
        if (addIndex === null) {
          addIndex = this._rowMap.length;
        }
        this._rowMap.splice(addIndex, 0, viewCard);
        if (this.tree) {
          this.tree.rowCountChanged(addIndex, 1);
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        break;
      }
      case "addrbook-list-updated": {
        let parentDir = this.directory;
        if (!parentDir) {
          parentDir = MailServices.ab.getDirectoryFromUID(data);
        }
        // `subject` is an nsIAbDirectory, make it the matching card instead.
        subject.QueryInterface(Ci.nsIAbDirectory);
        for (const card of parentDir.childCards) {
          if (card.UID == subject.UID) {
            subject = card;
            break;
          }
        }
      }
      // Falls through.
      case "addrbook-contact-updated": {
        subject.QueryInterface(Ci.nsIAbCard);
        let needsSort = false;
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (
            this._rowMap[i].card.equals(subject) &&
            this._rowMap[i].card.directoryUID == subject.directoryUID
          ) {
            this._rowMap.splice(i, 1, new abViewCard(subject));
            needsSort = true;
          }
        }
        if (needsSort) {
          this.sortBy(this.sortColumn, this.sortDirection, true);
        }
        break;
      }

      case "addrbook-list-deleted": {
        subject.QueryInterface(Ci.nsIAbDirectory);
        const scrollPosition = this.tree?.getFirstVisibleRow();
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].card.UID == subject.UID) {
            this._rowMap.splice(i, 1);
            if (this.tree) {
              this.tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        if (this.tree && scrollPosition !== null) {
          this.tree.scrollToRow(scrollPosition);
        }
        break;
      }
      case "addrbook-list-member-removed":
        if (!this.directory) {
          break;
        }
      // Falls through.
      case "addrbook-contact-deleted": {
        subject.QueryInterface(Ci.nsIAbCard);
        const scrollPosition = this.tree?.getFirstVisibleRow();
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (
            this._rowMap[i].card.equals(subject) &&
            this._rowMap[i].card.directoryUID == subject.directoryUID
          ) {
            this._rowMap.splice(i, 1);
            if (this.tree) {
              this.tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this.listener) {
          this.listener.onCountChanged(this.rowCount);
        }
        if (this.tree && scrollPosition !== null) {
          this.tree.scrollToRow(scrollPosition);
        }
        break;
      }
    }
  },
};

/**
 * Representation of a card, used as a table row in ABView.
 *
 * @param {nsIAbCard} card - contact or mailing list card for this row.
 * @param {nsIAbDirectory} [directoryHint] - the directory containing card,
 *     if available (this is a performance optimization only).
 */
function abViewCard(card, directoryHint) {
  this.card = card;
  this._getTextCache = {};
  if (directoryHint) {
    this._directory = directoryHint;
  } else {
    this._directory = MailServices.ab.getDirectoryFromUID(
      this.card.directoryUID
    );
  }
}
abViewCard.listFormatter = new Services.intl.ListFormat(
  Services.appinfo.name == "xpcshell" ? "en-US" : undefined,
  { type: "unit" }
);
abViewCard.prototype = {
  _getText(columnID) {
    try {
      const { getProperty, supportsVCard, vCardProperties } = this.card;

      if (this.card.isMailList) {
        if (columnID == "GeneratedName") {
          return this.card.displayName;
        }
        if (["NickName", "Notes"].includes(columnID)) {
          return getProperty(columnID, "");
        }
        return "";
      }

      switch (columnID) {
        case "addrbook":
        case "Addrbook":
          return this._directory.dirName;
        case "GeneratedName":
          return this.card.generateName(ABView.nameFormat);
        case "_PhoneticName":
          return this.card.generatePhoneticName(true);
        case "ChatName":
          return this.card.isMailList ? "" : this.card.generateChatName();
        case "EmailAddresses":
          return abViewCard.listFormatter.format(this.card.emailAddresses);
        case "PhoneNumbers": {
          let phoneNumbers;
          if (supportsVCard) {
            phoneNumbers = vCardProperties.getAllValues("tel");
          } else {
            phoneNumbers = [
              getProperty("WorkPhone", ""),
              getProperty("HomePhone", ""),
              getProperty("CellularNumber", ""),
              getProperty("FaxNumber", ""),
              getProperty("PagerNumber", ""),
            ];
          }
          return abViewCard.listFormatter.format(phoneNumbers.filter(Boolean));
        }
        case "JobTitle":
        case "Title":
          if (supportsVCard) {
            return vCardProperties.getFirstValue("title");
          }
          return getProperty("JobTitle", "");
        case "Department":
          if (supportsVCard) {
            const vCardValue = vCardProperties.getFirstValue("org");
            if (Array.isArray(vCardValue)) {
              return vCardValue[1] || "";
            }
            return "";
          }
          return getProperty(columnID, "");
        case "Company":
        case "Organization":
          if (supportsVCard) {
            const vCardValue = vCardProperties.getFirstValue("org");
            if (Array.isArray(vCardValue)) {
              return vCardValue[0] || "";
            }
            return vCardValue;
          }
          return getProperty("Company", "");
        case "NickName":
          if (supportsVCard) {
            return vCardProperties.getFirstValue("nickname");
          }
          return getProperty(columnID, "");
        default:
          return getProperty(columnID, "");
      }
    } catch (ex) {
      return "";
    }
  },
  getText(columnID) {
    if (!(columnID in this._getTextCache)) {
      this._getTextCache[columnID] = this._getText(columnID)?.trim() ?? "";
    }
    return this._getTextCache[columnID];
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
  get directory() {
    return this._directory;
  },
};
