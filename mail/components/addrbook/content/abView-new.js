/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals PROTO_TREE_VIEW */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function ABView(
  directory,
  searchQuery,
  searchString,
  sortColumn,
  sortDirection
) {
  this.__proto__.__proto__ = new PROTO_TREE_VIEW();
  this.directory = directory;
  this.searchString = searchString;

  const directories = directory ? [directory] : MailServices.ab.directories;
  if (searchQuery) {
    this._searchesInProgress = directories.length;
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
  }
  this.sortBy(sortColumn, sortDirection);
}
ABView.nameFormat = Services.prefs.getIntPref(
  "mail.addr_book.lastnamefirst",
  0
);
ABView.NOT_SEARCHING = 0;
ABView.SEARCHING = 1;
ABView.SEARCH_COMPLETE = 2;
ABView.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    "nsITreeView",
    "nsIAbDirSearchListener",
    "nsIObserver",
    "nsISupportsWeakReference",
  ]),

  directory: null,
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
    for (const i of this._tree.selectedIndices) {
      const card = this.getCardFromRow(i);
      let cardSet = directoryMap.get(card.directoryUID);
      if (!cardSet) {
        cardSet = new Set();
        directoryMap.set(card.directoryUID, cardSet);
      }
      cardSet.add(card);
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
  getIndexForUID(uid) {
    return this._rowMap.findIndex(row => row.id == uid);
  },
  sortBy(sortColumn, sortDirection, resort) {
    let selectionExists = false;
    if (this._tree) {
      const { selectedIndices, currentIndex } = this._tree;
      selectionExists = selectedIndices.length;
      // Remember what was selected.
      for (let i = 0; i < this._rowMap.length; i++) {
        this._rowMap[i].wasSelected = selectedIndices.includes(i);
        this._rowMap[i].wasCurrent = currentIndex == i;
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
    if (this._tree) {
      this._tree.reset();
      if (selectionExists) {
        for (let i = 0; i < this._rowMap.length; i++) {
          this._tree.toggleSelectionAtIndex(
            i,
            this._rowMap[i].wasSelected,
            true
          );
        }
        // Can't do this until updating the selection is finished.
        for (let i = 0; i < this._rowMap.length; i++) {
          if (this._rowMap[i].wasCurrent) {
            this._tree.currentIndex = i;
            break;
          }
        }
        this.selectionChanged();
      }
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
  },
  get searchState() {
    if (this._searchesInProgress === undefined) {
      return ABView.NOT_SEARCHING;
    }
    return this._searchesInProgress ? ABView.SEARCHING : ABView.SEARCH_COMPLETE;
  },

  // nsITreeView

  selectionChanged() {},
  setTree(tree) {
    this._tree = tree;
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
      window.browsingContext.topChromeWindow.openDialog(
        "chrome://pippki/content/exceptionDialog.xhtml",
        "",
        "chrome,centerscreen,modal",
        params
      );
      // params.exceptionAdded will be set if the user added an exception.
    }

    this._searchesInProgress--;
    if (!this._searchesInProgress && this._tree) {
      this._tree.dispatchEvent(new CustomEvent("searchstatechange"));
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
      if (this._tree) {
        if (this.sortColumn == "GeneratedName") {
          this.sortBy(this.sortColumn, this.sortDirection, true);
        } else {
          // Remember what was selected.
          const { selectedIndices, currentIndex } = this._tree;
          for (let i = 0; i < this._rowMap.length; i++) {
            this._rowMap[i].wasSelected = selectedIndices.includes(i);
            this._rowMap[i].wasCurrent = currentIndex == i;
          }

          this._tree.reset();
          for (let i = 0; i < this._rowMap.length; i++) {
            this._tree.toggleSelectionAtIndex(
              i,
              this._rowMap[i].wasSelected,
              true
            );
          }
          // Can't do this until updating the selection is finished.
          for (let i = 0; i < this._rowMap.length; i++) {
            if (this._rowMap[i].wasCurrent) {
              this._tree.currentIndex = i;
              break;
            }
          }
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
        const scrollPosition = this._tree?.getFirstVisibleIndex();
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].directory.UID == subject.UID) {
            this._rowMap.splice(i, 1);
            if (this._tree) {
              this._tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this._tree && scrollPosition !== null) {
          this._tree.scrollToIndex(scrollPosition);
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
        if (this._tree) {
          this._tree.rowCountChanged(addIndex, 1);
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
        const scrollPosition = this._tree?.getFirstVisibleIndex();
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (this._rowMap[i].card.UID == subject.UID) {
            this._rowMap.splice(i, 1);
            if (this._tree) {
              this._tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this._tree && scrollPosition !== null) {
          this._tree.scrollToIndex(scrollPosition);
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
        const scrollPosition = this._tree?.getFirstVisibleIndex();
        for (let i = this._rowMap.length - 1; i >= 0; i--) {
          if (
            this._rowMap[i].card.equals(subject) &&
            this._rowMap[i].card.directoryUID == subject.directoryUID
          ) {
            this._rowMap.splice(i, 1);
            if (this._tree) {
              this._tree.rowCountChanged(i, -1);
            }
          }
        }
        if (this._tree && scrollPosition !== null) {
          this._tree.scrollToIndex(scrollPosition);
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
        if (columnID == "addrbook") {
          return MailServices.ab.getDirectoryFromUID(this.card.directoryUID)
            .dirName;
        }
        return "";
      }

      switch (columnID) {
        case "addrbook":
          return this._directory.dirName;
        case "GeneratedName":
          return this.card.generateName(ABView.nameFormat);
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
        case "Addresses": {
          let addresses;
          if (supportsVCard) {
            addresses = vCardProperties
              .getAllValues("adr")
              .map(v => v.join(" ").trim());
          } else {
            addresses = [
              this.formatAddress("Work"),
              this.formatAddress("Home"),
            ];
          }
          return abViewCard.listFormatter.format(addresses.filter(Boolean));
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
    return "";
  },
  get directory() {
    return this._directory;
  },

  /**
   * Creates a string representation of an address from card properties.
   *
   * @param {"Work"|"Home"} prefix
   * @returns {string}
   */
  formatAddress(prefix) {
    return Array.from(
      ["Address", "Address2", "City", "State", "ZipCode", "Country"],
      field => this.card.getProperty(`${prefix}${field}`, "")
    )
      .join(" ")
      .trim();
  },
};
