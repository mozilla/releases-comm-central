/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGetter(this, "AddrBookUtils", function() {
  return ChromeUtils.import("resource:///modules/AddrBookUtils.jsm");
});
XPCOMUtils.defineLazyModuleGetters(this, {
  CardDAVDirectory: "resource:///modules/CardDAVDirectory.jsm",
});
XPCOMUtils.defineLazyGetter(this, "SubDialog", function() {
  const { SubDialogManager } = ChromeUtils.import(
    "resource://gre/modules/SubDialog.jsm"
  );
  return new SubDialogManager({
    dialogStack: document.getElementById("dialogStack"),
    dialogTemplate: document.getElementById("dialogTemplate"),
    dialogOptions: {
      styleSheets: ["chrome://messenger/skin/preferences/dialog.css"],
    },
  });
});

var booksList;

window.addEventListener("load", () => {
  booksList = document.getElementById("books");

  if (booksList.selectedIndex == 0) {
    // Index 0 was selected before we started listening.
    booksList.dispatchEvent(new CustomEvent("select"));
  }
});

// Books

/**
 * The list of address books.
 *
 * @extends {TreeListbox}
 */
class AbTreeListbox extends customElements.get("tree-listbox") {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.setAttribute("is", "ab-tree-listbox");

    this.addEventListener("select", this);
    this.addEventListener("keypress", this);
    this.addEventListener("contextmenu", this);
    this.addEventListener("dragover", this);
    this.addEventListener("drop", this);

    for (let book of MailServices.ab.directories) {
      this.appendChild(this._createBookRow(book));
    }

    this.observer.observe = this.observer.observe.bind(this);
    for (let topic of this.observer._notifications) {
      Services.obs.addObserver(this.observer, topic, true);
    }

    window.addEventListener("unload", this);
  }

  destroy() {
    this.removeEventListener("select", this);
    this.removeEventListener("keypress", this);
    this.removeEventListener("contextmenu", this);
    this.removeEventListener("dragover", this);
    this.removeEventListener("drop", this);

    for (let topic of this.observer._notifications) {
      Services.obs.removeObserver(this.observer, topic);
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "select":
        this._onSelect(event);
        break;
      case "keypress":
        this._onKeyPress(event);
        break;
      case "contextmenu":
        this._onContextMenu(event);
        break;
      case "dragover":
        this._onDragOver(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
      case "unload":
        this.destroy();
        break;
    }
  }

  _createBookRow(book) {
    let row = document
      .getElementById("bookRow")
      .content.firstElementChild.cloneNode(true);
    row.setAttribute("aria-label", book.dirName);
    if (book.isRemote) {
      row.classList.add("remote");
    }
    if (book.readOnly) {
      row.classList.add("readOnly");
    }
    if (
      ["ldap_2.servers.history", "ldap_2.servers.pab"].includes(book.dirPrefId)
    ) {
      row.classList.add("noDelete");
    }
    if (book.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE) {
      row.classList.add("carddav");
    }
    row.dataset.uid = book.UID;
    row._book = book;
    row.querySelector("span").textContent = book.dirName;

    for (let list of book.childNodes) {
      row.querySelector("ul").appendChild(this._createListRow(book.UID, list));
    }
    return row;
  }

  _createListRow(bookUID, list) {
    let row = document
      .getElementById("listRow")
      .content.firstElementChild.cloneNode(true);
    row.setAttribute("aria-label", list.dirName);
    row.dataset.uid = list.UID;
    row.dataset.book = bookUID;
    row._list = list;
    row.querySelector("span").textContent = list.dirName;
    return row;
  }

  /**
   * Get the index of the row representing a book or list.
   *
   * @param {string|null} uid - The UID of the book or list to find, or null
   *     for All Address Books.
   * @returns {integer} - Index of the book or list.
   */
  getIndexForUID(uid) {
    if (!uid) {
      return 0;
    }
    return this.rows.findIndex(r => r.dataset.uid == uid);
  }

  /**
   * Get the row representing a book or list.
   *
   * @param {string|null} uid - The UID of the book or list to find, or null
   *     for All Address Books.
   * @returns {HTMLLIElement} - Row of the book or list.
   */
  getRowForUID(uid) {
    if (!uid) {
      return this.firstElementChild;
    }
    return this.querySelector(`li[data-uid="${uid}"]`);
  }

  /**
   * Show UI to modify the selected address book or list.
   */
  showPropertiesOfSelected() {
    if (this.selectedIndex === 0) {
      throw new Components.Exception(
        "Cannot modify the All Address Books item",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    let row = this.rows[this.selectedIndex];

    if (row.classList.contains("listRow")) {
      let book = MailServices.ab.getDirectoryFromUID(row.dataset.book);
      let list = book.childNodes.find(l => l.UID == row.dataset.uid);

      SubDialog.open(
        "chrome://messenger/content/addressbook/abEditListDialog.xhtml",
        { features: "resizable=no" },
        { listURI: list.URI }
      );
      return;
    }

    let book = MailServices.ab.getDirectoryFromUID(row.dataset.uid);

    SubDialog.open(
      book.propertiesChromeURI,
      { features: "resizable=no" },
      { selectedDirectory: book }
    );
  }

  /**
   * Synchronize the selected address book. (CardDAV only.)
   */
  synchronizeSelected() {
    let row = this.rows[this.selectedIndex];
    if (!row.classList.contains("carddav")) {
      throw new Components.Exception(
        "Attempting to synchronize a non-CardDAV book.",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    let directory = MailServices.ab.getDirectoryFromUID(row.dataset.uid);
    directory = CardDAVDirectory.forFile(directory.fileName);
    directory.updateAllFromServer();
  }

  /**
   * Prompt the user and delete the selected address book.
   */
  deleteSelected() {
    if (this.selectedIndex === 0) {
      throw new Components.Exception(
        "Cannot delete the All Address Books item",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    let row = this.rows[this.selectedIndex];
    if (row.classList.contains("noDelete")) {
      throw new Components.Exception(
        "Refusing to delete a built-in address book",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    // TODO: Upgrade this code which comes from the old address book.
    // TODO: Handle removal of the book assigned to collect addresses.
    let abBundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );

    if (row.classList.contains("listRow")) {
      let book = MailServices.ab.getDirectoryFromUID(row.dataset.book);
      let list = book.childNodes.find(l => l.UID == row.dataset.uid);
      let title = abBundle.GetStringFromName(
        "confirmDeleteThisMailingListTitle"
      );
      let message = abBundle.GetStringFromName("confirmDeleteThisMailingList");
      message = message.replace("#1", list.dirName);

      if (Services.prompt.confirm(window, title, message)) {
        book.deleteDirectory(list);
      }
    } else {
      let book = MailServices.ab.getDirectoryFromUID(row.dataset.uid);
      let title = abBundle.GetStringFromName(
        "confirmDeleteThisAddressbookTitle"
      );
      let message = abBundle.GetStringFromName("confirmDeleteThisAddressbook");
      message = message.replace("#1", book.dirName);

      if (Services.prompt.confirm(window, title, message)) {
        MailServices.ab.deleteAddressBook(book.URI);
      }
    }
  }

  _onSelect() {
    // To be implemented.
  }

  _onKeyPress(event) {
    if (event.altKey || event.metaKey || event.shiftKey) {
      return;
    }

    switch (event.key) {
      case "Delete":
        this.deleteSelected();
        break;
    }
  }

  _onContextMenu(event) {
    this._showContextMenu(event);
  }

  _onDragOver(event) {
    let cards = event.dataTransfer.mozGetDataAt("moz/abcard-array", 0);
    if (!cards) {
      return;
    }
    if (cards.some(c => c.isMailList)) {
      return;
    }

    // TODO: Handle dropping a vCard here.

    let row = event.target.closest("li");
    if (!row || row.classList.contains("readOnly")) {
      return;
    }

    let rowIsList = row.classList.contains("listRow");
    event.dataTransfer.effectAllowed = rowIsList ? "link" : "copyMove";

    if (rowIsList) {
      let bookUID = row.dataset.book;
      for (let card of cards) {
        if (card.directoryUID != bookUID) {
          return;
        }
      }
      event.dataTransfer.dropEffect = "link";
    } else {
      let bookUID = row.dataset.uid;
      for (let card of cards) {
        // Prevent dropping a card where it already is.
        if (card.directoryUID == bookUID) {
          return;
        }
      }
      event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
    }

    event.preventDefault();
  }

  _onDrop(event) {
    let cards = event.dataTransfer.mozGetDataAt("moz/abcard-array", 0);
    let row = event.target.closest("li");

    if (row.classList.contains("listRow")) {
      for (let card of cards) {
        row._list.addCard(card);
      }
    } else if (event.dataTransfer.dropEffect == "copy") {
      for (let card of cards) {
        row._book.dropCard(card, true);
      }
    } else {
      let booksMap = new Map();
      for (let card of cards) {
        row._book.dropCard(card, false);
        let bookSet = booksMap.get(card.directoryUID);
        if (!bookSet) {
          bookSet = new Set();
          booksMap.set(card.directoryUID, bookSet);
        }
        bookSet.add(card);
      }
      for (let [uid, bookSet] of booksMap) {
        MailServices.ab.getDirectoryFromUID(uid).deleteCards([...bookSet]);
      }
    }

    event.preventDefault();
  }

  _showContextMenu(event) {
    let row = event.target.closest("li");
    if (!row) {
      return;
    }

    this.selectedIndex = this.rows.indexOf(row);
    this.focus();
    if (this.selectedIndex === 0) {
      return;
    }

    document.getElementById(
      "bookContextDelete"
    ).disabled = row.classList.contains("noDelete");
    document.getElementById(
      "bookContextSynchronize"
    ).hidden = !row.classList.contains("carddav");

    let popup = document.getElementById("bookContext");
    popup.openPopupAtScreen(event.screenX, event.screenY, true);
    event.preventDefault();
  }

  observer = {
    QueryInterface: ChromeUtils.generateQI([
      "nsIObserver",
      "nsISupportsWeakReference",
    ]),

    _notifications: [
      "addrbook-directory-created",
      "addrbook-directory-updated",
      "addrbook-directory-deleted",
      "addrbook-list-created",
      "addrbook-list-updated",
      "addrbook-list-deleted",
    ],

    // Bound to `booksList`.
    observe(subject, topic, data) {
      subject.QueryInterface(Ci.nsIAbDirectory);

      // Remember what was selected.
      let selectedUID = this.getRowAtIndex(this.selectedIndex).dataset.uid;
      switch (topic) {
        case "addrbook-directory-created": {
          let row = this._createBookRow(subject);
          let next = this.children[1];
          while (next) {
            if (
              AddrBookUtils.compareAddressBooks(
                subject,
                MailServices.ab.getDirectoryFromUID(next.dataset.uid)
              ) < 0
            ) {
              break;
            }
            next = next.nextElementSibling;
          }
          this.insertBefore(row, next);
          break;
        }
        case "addrbook-directory-updated":
        case "addrbook-list-updated": {
          let row = this.getRowForUID(subject.UID);
          row.querySelector(".bookRow-name, .listRow-name").textContent =
            subject.dirName;
          row.setAttribute("aria-label", subject.dirName);
          break;
        }
        case "addrbook-directory-deleted": {
          let row = this.getRowForUID(subject.UID);
          row.remove();
          if (
            row.classList.contains("selected") ||
            row.querySelector("li.selected")
          ) {
            // Select "All Address Books".
            selectedUID = null;
          }
          break;
        }
        case "addrbook-list-created": {
          let row = this.getRowForUID(data);
          let childList = row.querySelector("ul");
          if (!childList) {
            childList = row.appendChild(document.createElement("ul"));
          }

          let listRow = this._createListRow(data, subject);
          let next = childList.firstElementChild;
          while (next) {
            if (AddrBookUtils.compareAddressBooks(subject, next._list) < 0) {
              break;
            }
            next = next.nextElementSibling;
          }
          childList.insertBefore(listRow, next);
          break;
        }
        case "addrbook-list-deleted": {
          let row = this.getRowForUID(data);
          let childList = row.querySelector("ul");
          let listRow = childList.querySelector(`[data-uid="${subject.UID}"]`);
          listRow.remove();
          if (childList.childElementCount == 0) {
            childList.remove();
          }
          if (listRow.classList.contains("selected")) {
            // Select the containing book.
            selectedUID = data;
          }
          break;
        }
      }
      // Restore the right selected index, which might've changed by rows
      // being added or removed.
      this.selectedIndex = this.getIndexForUID(selectedUID);
    },
  };
}
customElements.define("ab-tree-listbox", AbTreeListbox, { extends: "ul" });
