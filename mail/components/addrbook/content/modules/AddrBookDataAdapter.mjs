/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";

export class AddrBookDataAdapter extends TreeDataAdapter {
  QueryInterface = ChromeUtils.generateQI([
    "nsIAbDirSearchListener",
    "nsIObserver",
    "nsISupportsWeakReference",
  ]);

  static nameFormat = Services.prefs.getIntPref(
    "mail.addr_book.lastnamefirst",
    0
  );
  static NOT_SEARCHING = 0;
  static SEARCHING = 1;
  static SEARCH_COMPLETE = 2;

  constructor(directory, searchQuery, searchString, sortColumn, sortDirection) {
    super();
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
          this._rowMap.push(new AddrBookDataRow(card, dir));
        }
      }
    }
    this.sortBy(sortColumn, sortDirection);
  }

  directory = null;
  #notifications = [
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
  ];

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
      for (const card of cardSet) {
        if (card.isMailList) {
          MailServices.ab.deleteAddressBook(card.mailListURI);
        }
      }
    }
  }
  getCardFromRow(row) {
    return this._rowMap[row] ? this._rowMap[row].card : null;
  }
  getDirectoryFromRow(row) {
    return this._rowMap[row] ? this._rowMap[row].directory : null;
  }
  getIndexForUID(uid) {
    return this._rowMap.findIndex(row => row.card.UID == uid);
  }
  get searchState() {
    if (this._searchesInProgress === undefined) {
      return AddrBookDataAdapter.NOT_SEARCHING;
    }
    return this._searchesInProgress
      ? AddrBookDataAdapter.SEARCHING
      : AddrBookDataAdapter.SEARCH_COMPLETE;
  }

  // nsITreeView

  setTree(tree) {
    super.setTree(tree);

    for (const topic of this.#notifications) {
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
  }

  // nsIAbDirSearchListener

  onSearchFoundCard(card) {
    // Instead of duplicating the insertion code below, just call it.
    this.observe(card, "addrbook-contact-created", this.directory?.UID);
  }
  onSearchFinished(resultStatus, complete, secInfo, requestLocation) {
    // Special handling for Bad Cert errors.
    let offerCertException = false;
    try {
      // If code is not an NSS error, getErrorClass() will fail.
      const nssErrorsService = Cc[
        "@mozilla.org/nss_errors_service;1"
      ].getService(Ci.nsINSSErrorsService);
      const errorClass = nssErrorsService.getErrorClass(resultStatus);
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
        location: requestLocation,
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
  }

  // nsIObserver

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      if (data != "mail.addr_book.lastnamefirst") {
        return;
      }
      AddrBookDataAdapter.nameFormat = Services.prefs.getIntPref(data, 0);
      for (const card of this._rowMap) {
        card.forgetCachedName();
      }
      if (this._tree) {
        if (this.sortColumn == "GeneratedName") {
          this.sortBy(this.sortColumn, this.sortDirection, true);
        } else {
          this._tree.reset();
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
            this._rowMap.push(new AddrBookDataRow(card, this.directory));
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
        const viewCard = new AddrBookDataRow(subject);
        const sortText = viewCard.getText(this.sortColumn);
        let addIndex = null;
        for (let i = 0; addIndex === null && i < this._rowMap.length; i++) {
          const comparison = TreeDataAdapter.collator.compare(
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
            this._rowMap.splice(i, 1, new AddrBookDataRow(subject));
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
  }
}

/**
 * Representation of a card, used as a table row in AddrBookDataAdapter.
 *
 * @param {nsIAbCard} card - contact or mailing list card for this row.
 * @param {nsIAbDirectory} [directoryHint] - the directory containing card,
 *     if available (this is a performance optimization only).
 */
class AddrBookDataRow extends TreeDataRow {
  static listFormatter = new Services.intl.ListFormat(
    Services.appinfo.name == "xpcshell" ? "en-US" : undefined,
    { type: "unit" }
  );

  #getTextCache = {};
  card = null;
  directory = null;

  constructor(card, directoryHint) {
    super();
    this.card = card;
    if (directoryHint) {
      this.directory = directoryHint;
    } else {
      this.directory = MailServices.ab.getDirectoryFromUID(
        this.card.directoryUID
      );
    }
    this.properties = this.card.isMailList ? "mailing-list" : "";
  }

  #getText(columnID) {
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
          return this.directory.dirName;
        case "GeneratedName":
          return this.card.generateName(AddrBookDataAdapter.nameFormat);
        case "EmailAddresses":
          return AddrBookDataRow.listFormatter.format(this.card.emailAddresses);
        case "PhoneNumbers": {
          let phoneNumbers;
          if (supportsVCard) {
            phoneNumbers = vCardProperties.getAllValuesSorted("tel");
          } else {
            phoneNumbers = [
              getProperty("WorkPhone", ""),
              getProperty("HomePhone", ""),
              getProperty("CellularNumber", ""),
              getProperty("FaxNumber", ""),
              getProperty("PagerNumber", ""),
            ];
          }
          return AddrBookDataRow.listFormatter.format(
            phoneNumbers.filter(Boolean)
          );
        }
        case "Addresses": {
          let addresses;
          if (supportsVCard) {
            addresses = vCardProperties
              .getAllValuesSorted("adr")
              .map(v => v.filter(Boolean).join(" ").trim());
          } else {
            addresses = [
              this.#formatAddress("Work"),
              this.#formatAddress("Home"),
            ];
          }
          return AddrBookDataRow.listFormatter.format(
            addresses.filter(Boolean)
          );
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
  }
  getText(columnID) {
    if (!Object.hasOwn(this.#getTextCache, columnID)) {
      this.#getTextCache[columnID] = this.#getText(columnID)?.trim() ?? "";
    }
    return this.#getTextCache[columnID];
  }
  forgetCachedName() {
    delete this.#getTextCache.GeneratedName;
  }

  /**
   * Creates a string representation of an address from card properties.
   *
   * @param {"Work"|"Home"} prefix
   * @returns {string}
   */
  #formatAddress(prefix) {
    return Array.from(
      ["Address", "Address2", "City", "State", "ZipCode", "Country"],
      field => this.card.getProperty(`${prefix}${field}`, "")
    )
      .join(" ")
      .trim();
  }
}
