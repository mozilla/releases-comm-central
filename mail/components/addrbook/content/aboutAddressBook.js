/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals ABView */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { UIDensity } = ChromeUtils.import("resource:///modules/UIDensity.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGetter(this, "ABQueryUtils", function() {
  return ChromeUtils.import("resource:///modules/ABQueryUtils.jsm");
});
XPCOMUtils.defineLazyGetter(this, "AddrBookUtils", function() {
  return ChromeUtils.import("resource:///modules/AddrBookUtils.jsm");
});
XPCOMUtils.defineLazyModuleGetters(this, {
  AddrBookUtils: "resource:///modules/AddrBookUtils.jsm",
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  CardDAVDirectory: "resource:///modules/CardDAVDirectory.jsm",
  MailE10SUtils: "resource:///modules/MailE10SUtils.jsm",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
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

UIDensity.registerWindow(window);

var booksList;

window.addEventListener("load", () => {
  document
    .getElementById("toolbarCreateBook")
    .addEventListener("command", event => {
      let type = event.target.value || "JS_DIRECTORY_TYPE";
      createBook(Ci.nsIAbManager[type]);
    });
  document
    .getElementById("toolbarCreateContact")
    .addEventListener("command", event => createContact());
  document
    .getElementById("toolbarCreateList")
    .addEventListener("command", event => createList());
  document
    .getElementById("toolbarImport")
    .addEventListener("command", event => importBook());

  document.getElementById("bookContext").addEventListener("command", event => {
    switch (event.target.id) {
      case "bookContextProperties":
        booksList.showPropertiesOfSelected();
        break;
      case "bookContextSynchronize":
        booksList.synchronizeSelected();
        break;
      case "bookContextPrint":
        booksList.printSelected();
        break;
      case "bookContextExport":
        booksList.exportSelected();
        break;
      case "bookContextDelete":
        booksList.deleteSelected();
        break;
      case "bookContextRemove":
        booksList.deleteSelected();
        break;
      case "bookContextStartupDefault":
        if (event.target.hasAttribute("checked")) {
          booksList.setSelectedAsStartupDefault();
        } else {
          booksList.clearStartupDefault();
        }
        break;
    }
  });

  booksList = document.getElementById("books");
  cardsPane.init();
  detailsPane.init();

  // Once the old Address Book has gone away, this should be changed to use
  // UIDs instead of URIs. It's just easier to keep as-is for now.
  let startupURI = Services.prefs.getStringPref(
    "mail.addr_book.view.startupURI",
    ""
  );
  if (startupURI) {
    for (let index = 0; index < booksList.rows.length; index++) {
      let row = booksList.rows[index];
      if (row._book?.URI == startupURI || row._list?.URI == startupURI) {
        booksList.selectedIndex = index;
        break;
      }
    }
  }

  if (booksList.selectedIndex == 0) {
    // Index 0 was selected before we started listening.
    booksList.dispatchEvent(new CustomEvent("select"));
  }

  cardsPane.cardsList.focus();
});

window.addEventListener("unload", () => {
  // Once the old Address Book has gone away, this should be changed to use
  // UIDs instead of URIs. It's just easier to keep as-is for now.
  if (!Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    let pref = "mail.addr_book.view.startupURI";
    if (booksList.selectedIndex === 0) {
      Services.prefs.clearUserPref(pref);
    } else {
      let row = booksList.getRowAtIndex(booksList.selectedIndex);
      let directory = row._book || row._list;
      Services.prefs.setCharPref(pref, directory.URI);
    }
  }
});

/**
 * Show UI to create a new address book of the type specified.
 *
 * @param {integer} [type=Ci.nsIAbManager.JS_DIRECTORY_TYPE] - One of the
 *     nsIAbManager directory type constants.
 */
function createBook(type = Ci.nsIAbManager.JS_DIRECTORY_TYPE) {
  const typeURLs = {
    [Ci.nsIAbManager.LDAP_DIRECTORY_TYPE]:
      "chrome://messenger/content/addressbook/pref-directory-add.xhtml",
    [Ci.nsIAbManager.JS_DIRECTORY_TYPE]:
      "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml",
    [Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE]:
      "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
  };

  let url = typeURLs[type];
  if (!url) {
    throw new Components.Exception(
      `Unexpected type: ${type}`,
      Cr.NS_ERROR_UNEXPECTED
    );
  }

  let params = {};
  SubDialog.open(
    url,
    {
      features: "resizable=no",
      closedCallback: () => {
        if (params.newDirectoryUID) {
          booksList.selectedIndex = booksList.getIndexForUID(
            params.newDirectoryUID
          );
          booksList.focus();
        }
      },
    },
    params
  );
}

/**
 * Show UI to create a new contact in the current address book.
 */
function createContact() {
  if (booksList.selectedIndex === 0) {
    throw new Components.Exception(
      "Cannot modify the All Address Books item",
      Cr.NS_ERROR_UNEXPECTED
    );
  }

  let row = booksList.getRowAtIndex(booksList.selectedIndex);
  let bookUID = row.dataset.book ?? row.dataset.uid;

  if (bookUID) {
    let book = MailServices.ab.getDirectoryFromUID(bookUID);
    if (book.readOnly) {
      throw new Components.Exception(
        "Address book is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }
  }

  detailsPane.currentCard = null;
  detailsPane.editCurrentContact();
  detailsPane.container.hidden = false;
}

/**
 * Show UI to create a new list in the current address book.
 * For now this loads the old list UI, the intention is to replace it.
 */
function createList() {
  if (booksList.selectedIndex === 0) {
    throw new Components.Exception(
      "Cannot modify the All Address Books item",
      Cr.NS_ERROR_UNEXPECTED
    );
  }

  let row = booksList.getRowAtIndex(booksList.selectedIndex);
  let bookUID = row.dataset.book ?? row.dataset.uid;

  let params = {};
  if (bookUID) {
    let book = MailServices.ab.getDirectoryFromUID(bookUID);
    if (book.readOnly) {
      throw new Components.Exception(
        "Address book is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }
    if (!book.supportsMailingLists) {
      throw new Components.Exception(
        "Address book does not support lists",
        Cr.NS_ERROR_FAILURE
      );
    }
    params.selectedAB = book.URI;
  }
  SubDialog.open(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml",
    {
      features: "resizable=no",
      closedCallback: () => {
        if (params.newListUID) {
          booksList.selectedIndex = booksList.getIndexForUID(params.newListUID);
          booksList.focus();
        }
      },
    },
    params
  );
}

/**
 * Import an address book from a file. This shows the generic Thunderbird
 * import wizard, which isn't ideal but better than nothing.
 */
function importBook() {
  let createdDirectory;
  let observer = function(subject) {
    // It might be possible for more than one directory to be imported, select
    // the first one.
    if (!createdDirectory) {
      createdDirectory = subject.QueryInterface(Ci.nsIAbDirectory);
    }
  };

  Services.obs.addObserver(observer, "addrbook-directory-created");
  window.browsingContext.topChromeWindow.toImport();
  Services.obs.removeObserver(observer, "addrbook-directory-created");

  // Select the directory after the import UI closes, so the user sees the change.
  if (createdDirectory) {
    booksList.selectedIndex = booksList.getIndexForUID(createdDirectory.UID);
  }
}

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
    this.addEventListener("collapsed", this);
    this.addEventListener("expanded", this);
    this.addEventListener("keypress", this);
    this.addEventListener("contextmenu", this);
    this.addEventListener("dragover", this);
    this.addEventListener("drop", this);

    for (let book of MailServices.ab.directories) {
      this.appendChild(this._createBookRow(book));
    }

    this._abObserver.observe = this._abObserver.observe.bind(this);
    for (let topic of this._abObserver._notifications) {
      Services.obs.addObserver(this._abObserver, topic, true);
    }

    window.addEventListener("unload", this);
  }

  destroy() {
    this.removeEventListener("select", this);
    this.removeEventListener("collapsed", this);
    this.removeEventListener("expanded", this);
    this.removeEventListener("keypress", this);
    this.removeEventListener("contextmenu", this);
    this.removeEventListener("dragover", this);
    this.removeEventListener("drop", this);

    for (let topic of this._abObserver._notifications) {
      Services.obs.removeObserver(this._abObserver, topic);
    }
  }

  handleEvent(event) {
    super.handleEvent(event);

    switch (event.type) {
      case "select":
        this._onSelect(event);
        break;
      case "collapsed":
        this._onCollapsed(event);
        break;
      case "expanded":
        this._onExpanded(event);
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
    row.id = `book-${book.UID}`;
    row.setAttribute("aria-label", book.dirName);
    if (
      Services.xulStore.getValue("about:addressbook", row.id, "collapsed") ==
      "true"
    ) {
      row.classList.add("collapsed");
    }
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
    row.id = `list-${list.UID}`;
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
    directory.syncWithServer();
  }

  /**
   * Print the selected address book.
   */
  printSelected() {
    if (this.selectedIndex === 0) {
      printHandler.printDirectory();
      return;
    }

    let row = this.rows[this.selectedIndex];
    if (row.classList.contains("listRow")) {
      let book = MailServices.ab.getDirectoryFromUID(row.dataset.book);
      let list = book.childNodes.find(l => l.UID == row.dataset.uid);
      printHandler.printDirectory(list);
    } else {
      let book = MailServices.ab.getDirectoryFromUID(row.dataset.uid);
      printHandler.printDirectory(book);
    }
  }

  /**
   * Export the selected address book to a file.
   */
  exportSelected() {
    if (this.selectedIndex == 0) {
      return;
    }

    let row = this.getRowAtIndex(this.selectedIndex);
    let directory = row._book || row._list;
    AddrBookUtils.exportDirectory(directory);
  }

  /**
   * Prompt the user and delete the selected address book.
   */
  async deleteSelected() {
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

    let action, name, uri;
    if (row.classList.contains("listRow")) {
      action = "delete-lists";
      name = row._list.dirName;
      uri = row._list.URI;
    } else {
      if (
        [
          Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE,
          Ci.nsIAbManager.LDAP_DIRECTORY_TYPE,
        ].includes(row._book.dirType)
      ) {
        action = "remove-remote-book";
      } else {
        action = "delete-book";
      }

      name = row._book.dirName;
      uri = row._book.URI;
    }

    let [title, message] = await document.l10n.formatValues([
      { id: `about-addressbook-confirm-${action}-title`, args: { count: 1 } },
      {
        id: `about-addressbook-confirm-${action}`,
        args: { name, count: 1 },
      },
    ]);

    if (Services.prompt.confirm(window, title, message)) {
      MailServices.ab.deleteAddressBook(uri);
    }
  }

  /**
   * Set the selected directory to be the one opened when the page opens.
   */
  setSelectedAsStartupDefault() {
    // Once the old Address Book has gone away, this should be changed to use
    // UIDs instead of URIs. It's just easier to keep as-is for now.
    Services.prefs.setBoolPref("mail.addr_book.view.startupURIisDefault", true);
    if (this.selectedIndex === 0) {
      Services.prefs.clearUserPref("mail.addr_book.view.startupURI");
      return;
    }

    let row = this.rows[this.selectedIndex];
    let directory = row._book || row._list;
    Services.prefs.setStringPref(
      "mail.addr_book.view.startupURI",
      directory.URI
    );
  }

  /**
   * Clear the directory to be opened when the page opens. Instead, the
   * last-selected directory will be opened.
   */
  clearStartupDefault() {
    Services.prefs.setBoolPref(
      "mail.addr_book.view.startupURIisDefault",
      false
    );
  }

  _onSelect() {
    let row = this.rows[this.selectedIndex];
    if (row.classList.contains("listRow")) {
      cardsPane.displayList(row.dataset.book, row.dataset.uid);
    } else {
      cardsPane.displayBook(row.dataset.uid);
    }

    // Row 0 is the "All Address Books" item. Contacts and lists can't be
    // added here.
    if (this.selectedIndex === 0) {
      document.getElementById("toolbarCreateContact").disabled = true;
      document.getElementById("toolbarCreateList").disabled = true;
    } else {
      let bookUID = row.dataset.book ?? row.dataset.uid;
      let book = MailServices.ab.getDirectoryFromUID(bookUID);

      document.getElementById("toolbarCreateContact").disabled = book.readOnly;
      document.getElementById("toolbarCreateList").disabled =
        book.readOnly || !book.supportsMailingLists;
    }
  }

  _onCollapsed(event) {
    Services.xulStore.setValue(
      "about:addressbook",
      event.target.id,
      "collapsed",
      "true"
    );
  }

  _onExpanded(event) {
    Services.xulStore.removeValue(
      "about:addressbook",
      event.target.id,
      "collapsed"
    );
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

    let popup = document.getElementById("bookContext");
    let synchronizeItem = document.getElementById("bookContextSynchronize");
    let exportItem = document.getElementById("bookContextExport");
    let deleteItem = document.getElementById("bookContextDelete");
    let removeItem = document.getElementById("bookContextRemove");
    let startupDefaultItem = document.getElementById(
      "bookContextStartupDefault"
    );

    let isDefault = Services.prefs.getBoolPref(
      "mail.addr_book.view.startupURIisDefault"
    );

    this.selectedIndex = this.rows.indexOf(row);
    this.focus();
    if (this.selectedIndex === 0) {
      // All Address Books - only the startup default item is relevant.
      for (let item of popup.children) {
        item.hidden = item != startupDefaultItem;
      }

      isDefault =
        isDefault &&
        !Services.prefs.prefHasUserValue("mail.addr_book.view.startupURI");
    } else {
      for (let item of popup.children) {
        item.hidden = false;
      }

      synchronizeItem.hidden = !row.classList.contains("carddav");
      exportItem.hidden = row.classList.contains("remote");

      deleteItem.disabled = row.classList.contains("noDelete");
      deleteItem.hidden = row.classList.contains("carddav");

      removeItem.disabled = row.classList.contains("noDelete");
      removeItem.hidden = !row.classList.contains("carddav");

      let directory = row._book || row._list;
      isDefault =
        isDefault &&
        Services.prefs.getStringPref("mail.addr_book.view.startupURI") ==
          directory.URI;
    }

    if (isDefault) {
      startupDefaultItem.setAttribute("checked", "true");
    } else {
      startupDefaultItem.removeAttribute("checked");
    }

    popup.openPopupAtScreen(event.screenX, event.screenY, true);
    event.preventDefault();
  }

  _abObserver = {
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
          if (cardsPane.cardsList.view.directory?.UID == subject.UID) {
            document.l10n.setAttributes(
              cardsPane.searchInput,
              "about-addressbook-search",
              { name: subject.dirName }
            );
          }
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
            setTimeout(() => {
              this.selectedIndex = 0;
            });
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
            setTimeout(() => childList.remove());
          }
          break;
        }
      }
    },
  };
}
customElements.define("ab-tree-listbox", AbTreeListbox, { extends: "ul" });

// Cards

/**
 * Search field for card list. An HTML port of MozSearchTextbox.
 */
class AbCardSearchInput extends HTMLInputElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this._fireCommand = this._fireCommand.bind(this);

    this.addEventListener("input", this);
    this.addEventListener("keypress", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this._onInput(event);
        break;
      case "keypress":
        this._onKeyPress(event);
        break;
    }
  }

  _onInput() {
    if (this._timer) {
      clearTimeout(this._timer);
    }
    this._timer = setTimeout(this._fireCommand, 500, this);
  }

  _onKeyPress(event) {
    switch (event.key) {
      case "Escape":
        if (this._clearSearch()) {
          event.preventDefault();
          event.stopPropagation();
        }
        break;
      case "Return":
        this._enterSearch();
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }

  _fireCommand() {
    if (this._timer) {
      clearTimeout(this._timer);
    }
    this._timer = null;
    this.dispatchEvent(new CustomEvent("command"));
  }

  _enterSearch() {
    this._fireCommand();
  }

  _clearSearch() {
    if (this.value) {
      this.value = "";
      this._fireCommand();
      return true;
    }
    return false;
  }
}
customElements.define("ab-card-search-input", AbCardSearchInput, {
  extends: "input",
});

/**
 * A row in the list of cards.
 *
 * @extends {TreeViewListrow}
 */
class AbCardListrow extends customElements.get("tree-view-listrow") {
  static ROW_HEIGHT = 46;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.setAttribute("draggable", "true");
    this.name = this.appendChild(document.createElement("div"));
    this.name.classList.add("name");
    this.address = this.appendChild(document.createElement("div"));
    this.address.classList.add("address");
  }

  get index() {
    return super.index;
  }

  set index(index) {
    super.index = index;
    let props = this.view.getRowProperties(index);
    if (props) {
      this.classList.add(props);
    }
    this.name.textContent = this.view.getCellText(index, {
      id: "GeneratedName",
    });
    this.address.textContent = this.view.getCellText(index, {
      id: "PrimaryEmail",
    });
    this.setAttribute("aria-label", this.name.textContent);
  }
}
customElements.define("ab-card-listrow", AbCardListrow);

var cardsPane = {
  searchInput: null,

  cardsList: null,

  init() {
    this.searchInput = document.getElementById("searchInput");
    this.sortButton = document.getElementById("sortButton");
    this.sortContext = document.getElementById("sortContext");
    this.cardsList = document.getElementById("cards");
    this.cardContext = document.getElementById("cardContext");

    let nameFormat = Services.prefs.getIntPref(
      "mail.addr_book.lastnamefirst",
      0
    );
    this.sortContext
      .querySelector(`[name="format"][value="${nameFormat}"]`)
      ?.setAttribute("checked", "true");

    let sortColumn = Services.xulStore.getValue(
      "about:addressbook",
      "cards",
      "sortColumn"
    );
    let sortDirection = Services.xulStore.getValue(
      "about:addressbook",
      "cards",
      "sortDirection"
    );
    if (sortColumn && sortDirection) {
      this.sortContext
        .querySelector(`[name="sort"][value="${sortColumn} ${sortDirection}"]`)
        ?.setAttribute("checked", "true");
    }

    this.searchInput.addEventListener("command", this);
    this.sortButton.addEventListener("click", this);
    this.sortContext.addEventListener("command", this);
    this.cardsList.addEventListener("select", this);
    this.cardsList.addEventListener("keypress", this);
    this.cardsList.addEventListener("dragstart", this);
    this.cardsList.addEventListener("contextmenu", this);
    this.cardContext.addEventListener("command", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "command":
        this._onCommand(event);
        break;
      case "click":
        this._onClick(event);
        break;
      case "select":
        this._onSelect(event);
        break;
      case "keypress":
        this._onKeyPress(event);
        break;
      case "dragstart":
        this._onDragStart(event);
        break;
      case "contextmenu":
        this._onContextMenu(event);
        break;
    }
  },

  /**
   * Gets an address book query string based on the value of the search input.
   *
   * @returns {string}
   */
  getQuery() {
    if (!this.searchInput.value) {
      return null;
    }

    let searchWords = ABQueryUtils.getSearchTokens(this.searchInput.value);
    let queryURIFormat = ABQueryUtils.getModelQuery(
      "mail.addr_book.quicksearchquery.format"
    );
    return ABQueryUtils.generateQueryURI(queryURIFormat, searchWords);
  },

  /**
   * Display an address book, or all address books.
   *
   * @param {string|null} uid - The UID of the book or list to display, or null
   *     for All Address Books.
   */
  displayBook(uid) {
    let book = uid ? MailServices.ab.getDirectoryFromUID(uid) : null;
    if (book) {
      document.l10n.setAttributes(
        this.searchInput,
        "about-addressbook-search",
        { name: book.dirName }
      );
    } else {
      document.l10n.setAttributes(
        this.searchInput,
        "about-addressbook-search-all"
      );
    }
    let sortColumn =
      Services.xulStore.getValue("about:addressbook", "cards", "sortColumn") ||
      "GeneratedName";
    let sortDirection =
      Services.xulStore.getValue(
        "about:addressbook",
        "cards",
        "sortDirection"
      ) || "ascending";
    this.cardsList.view = new ABView(
      book,
      this.getQuery(),
      this.searchInput.value,
      null,
      sortColumn,
      sortDirection
    );

    detailsPane.displayContact(null);
  },

  /**
   * Display a list.
   *
   * @param {bookUID} uid - The UID of the address book containing the list.
   * @param {string} uid - The UID of the list to display.
   */
  displayList(bookUID, uid) {
    let book = MailServices.ab.getDirectoryFromUID(bookUID);
    let list = book.childNodes.find(l => l.UID == uid);
    document.l10n.setAttributes(this.searchInput, "about-addressbook-search", {
      name: list.dirName,
    });
    this.cardsList.view = this.cardsList.view = new ABView(
      list,
      this.getQuery(),
      this.searchInput.value,
      null,
      "GeneratedName",
      "ascending"
    );

    detailsPane.displayContact(null);
  },

  /**
   * Set the name format to be displayed.
   *
   * @param {integer} format - One of the nsIAbCard.GENERATE_* constants.
   */
  setNameFormat(event) {
    // ABView will detect this change and update automatically.
    Services.prefs.setIntPref(
      "mail.addr_book.lastnamefirst",
      event.target.value
    );
  },

  /**
   * Change the sort order of the cards being displayed.
   *
   * @param {Event} event - The oncommand event that triggered this sort.
   */
  sortCards(event) {
    let [column, direction] = event.target.value.split(" ");
    this.cardsList.view.sortBy(column, direction);

    Services.xulStore.setValue(
      "about:addressbook",
      "cards",
      "sortColumn",
      column
    );
    Services.xulStore.setValue(
      "about:addressbook",
      "cards",
      "sortDirection",
      direction
    );
  },

  /**
   * Start a new message to the given addresses.
   *
   * @param {string[]} addresses
   */
  writeTo(addresses) {
    let params = Cc[
      "@mozilla.org/messengercompose/composeparams;1"
    ].createInstance(Ci.nsIMsgComposeParams);
    params.type = Ci.nsIMsgCompType.New;
    params.format = Ci.nsIMsgCompFormat.Default;
    params.composeFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    params.composeFields.to = addresses.join(",");
    MailServices.compose.OpenComposeWindowWithParams(null, params);
  },

  /**
   * Start a new message to the selected contact(s) and/or mailing list(s).
   */
  writeToSelected() {
    let selectedAddresses = [];

    for (let index of this.cardsList.selectedIndicies) {
      let card = this.cardsList.view.getCardFromRow(index);

      let email;
      if (card.isMailList) {
        email = card.getProperty("Notes", "") || card.displayName;
      } else {
        email = card.emailAddresses[0];
      }

      if (email) {
        selectedAddresses.push(
          MailServices.headerParser.makeMimeAddress(card.displayName, email)
        );
      }
    }

    this.writeTo(selectedAddresses);
  },

  /**
   * Print delete the selected card(s).
   */
  printSelected() {
    let selectedCards = [];

    for (let index of this.cardsList.selectedIndicies) {
      let card = this.cardsList.view.getCardFromRow(index);
      selectedCards.push(card);
    }

    printHandler.printCards(selectedCards);
  },

  _canDeleteSelected() {
    if (this.cardsList.view.directory?.readOnly) {
      return false;
    }

    let seenDirectories = new Set();
    for (let index of this.cardsList.selectedIndicies) {
      let { directoryUID } = this.cardsList.view.getCardFromRow(index);
      if (seenDirectories.has(directoryUID)) {
        continue;
      }
      if (MailServices.ab.getDirectoryFromUID(directoryUID).readOnly) {
        return false;
      }
      seenDirectories.add(directoryUID);
    }
    return true;
  },

  /**
   * Prompt the user and delete the selected card(s).
   */
  async deleteSelected() {
    if (!this._canDeleteSelected()) {
      return;
    }

    let selectedLists = [];
    let selectedContacts = [];

    for (let index of this.cardsList.selectedIndicies) {
      let card = this.cardsList.view.getCardFromRow(index);
      if (card.isMailList) {
        selectedLists.push(card);
      } else {
        selectedContacts.push(card);
      }
    }

    if (selectedLists.length + selectedContacts.length == 0) {
      return;
    }

    // Determine strings for smart and context-sensitive user prompts
    // for confirming deletion.
    let action, name, list;
    let count = selectedLists.length + selectedContacts.length;
    let selectedDir = this.cardsList.view.directory;

    if (selectedLists.length && selectedContacts.length) {
      action = "delete-mixed";
    } else if (selectedLists.length) {
      action = "delete-lists";
      name = selectedLists[0].displayName;
    } else {
      let nameFormatFromPref = Services.prefs.getIntPref(
        "mail.addr_book.lastnamefirst"
      );
      name = selectedContacts[0].generateName(nameFormatFromPref);
      if (selectedDir && selectedDir.isMailList) {
        action = "remove-contacts";
        list = selectedDir.dirName;
      } else {
        action = "delete-contacts";
      }
    }

    let [title, message] = await document.l10n.formatValues([
      { id: `about-addressbook-confirm-${action}-title`, args: { count } },
      {
        id: `about-addressbook-confirm-${action}`,
        args: { count, name, list },
      },
    ]);

    // Finally, show our smart confirmation message, and act upon it!
    if (!Services.prompt.confirm(window, title, message)) {
      // Deletion cancelled by user.
      return;
    }

    // Delete cards from address books or mailing lists.
    this.cardsList.view.deleteSelectedCards();
  },

  _onContextMenu(event) {
    this._showContextMenu(event);
  },

  _showContextMenu(event) {
    let row = event.target.closest("ab-card-listrow");
    if (!row) {
      return;
    }
    if (!this.cardsList.selectedIndicies.includes(row.index)) {
      this.cardsList.selectedIndex = row.index;
    }

    this.cardsList.focus();

    let writeMenuItem = document.getElementById("cardContextWrite");
    let writeMenu = document.getElementById("cardContextWriteMenu");
    let writeMenuSeparator = document.getElementById(
      "cardContextWriteSeparator"
    );
    if (this.cardsList.selectedIndicies.length == 1) {
      let card = this.cardsList.view.getCardFromRow(
        this.cardsList.selectedIndex
      );
      if (card.isMailList) {
        writeMenuItem.hidden = writeMenuSeparator.hidden = false;
        writeMenu.hidden = true;
      } else {
        let addresses = card.emailAddresses;

        if (addresses.length == 0) {
          writeMenuItem.hidden = writeMenu.hidden = writeMenuSeparator.hidden = true;
        } else if (addresses.length == 1) {
          writeMenuItem.hidden = writeMenuSeparator.hidden = false;
          writeMenu.hidden = true;
        } else {
          while (writeMenu.menupopup.lastChild) {
            writeMenu.menupopup.lastChild.remove();
          }

          for (let address of addresses) {
            let menuitem = document.createXULElement("menuitem");
            menuitem.classList.add("subviewbutton");
            menuitem.label = MailServices.headerParser.makeMimeAddress(
              card.displayName,
              address
            );
            menuitem.addEventListener("command", () =>
              this.writeTo([menuitem.label])
            );
            writeMenu.menupopup.appendChild(menuitem);
          }

          writeMenuItem.hidden = true;
          writeMenu.hidden = writeMenuSeparator.hidden = false;
        }
      }
    } else {
      writeMenuItem.hidden = false;
      writeMenu.hidden = true;
    }

    let deleteItem = document.getElementById("cardContextDelete");
    let removeItem = document.getElementById("cardContextRemove");

    let inMailList = this.cardsList.view.directory?.isMailList;
    deleteItem.hidden = inMailList;
    removeItem.hidden = !inMailList;
    deleteItem.disabled = removeItem.disabled = !this._canDeleteSelected();

    this.cardContext.openPopupAtScreen(event.screenX, event.screenY, true);
    event.preventDefault();
  },

  _onCommand(event) {
    if (event.target == this.searchInput) {
      this.cardsList.view = new ABView(
        this.cardsList.view.directory,
        this.getQuery(),
        this.searchInput.value,
        undefined,
        this.cardsList.view.sortColumn,
        this.cardsList.view.sortDirection
      );
      return;
    }

    switch (event.target.id) {
      case "cardContextWrite":
        this.writeToSelected();
        return;
      case "cardContextPrint":
        this.printSelected();
        return;
      case "cardContextDelete":
        this.deleteSelected();
        return;
      case "cardContextRemove":
        this.deleteSelected();
        return;
    }

    if (event.target.getAttribute("name") == "format") {
      this.setNameFormat(event);
    }
    if (event.target.getAttribute("name") == "sort") {
      this.sortCards(event);
    }
  },

  _onClick(event) {
    this.sortContext.openPopup(this.sortButton, { triggerEvent: event });
    event.preventDefault();
  },

  _onSelect(event) {
    detailsPane.displayContact(
      this.cardsList.view.getCardFromRow(this.cardsList.selectedIndex)
    );
  },

  _onKeyPress(event) {
    if (event.altKey || event.metaKey || event.shiftKey) {
      return;
    }

    switch (event.key) {
      case "Delete":
        this.deleteSelected();
        break;
    }
  },

  _onDragStart(event) {
    function makeMimeAddressFromCard(card) {
      if (!card) {
        return "";
      }

      let email;
      if (card.isMailList) {
        let directory = MailServices.ab.getDirectory(card.mailListURI);
        email = directory.description || card.displayName;
      } else {
        email = card.emailAddresses[0];
      }
      return MailServices.headerParser.makeMimeAddress(card.displayName, email);
    }

    let row = event.target.closest("ab-card-listrow");
    if (!row) {
      event.preventDefault();
      return;
    }

    let indicies = this.cardsList.selectedIndicies;
    if (indicies.length === 0) {
      event.preventDefault();
      return;
    }
    let cards = indicies.map(index =>
      this.cardsList.view.getCardFromRow(index)
    );

    let addresses = cards.map(makeMimeAddressFromCard);
    event.dataTransfer.mozSetDataAt("moz/abcard-array", cards, 0);
    event.dataTransfer.setData("text/x-moz-address", addresses);
    event.dataTransfer.setData("text/unicode", addresses);

    let card = this.cardsList.view.getCardFromRow(row.index);
    if (card && card.displayName && !card.isMailList) {
      try {
        // A card implementation may throw NS_ERROR_NOT_IMPLEMENTED.
        // Don't break drag-and-drop if that happens.
        let vCard = card.translateTo("vcard");
        event.dataTransfer.setData("text/vcard", decodeURIComponent(vCard));
        event.dataTransfer.setData(
          "application/x-moz-file-promise-dest-filename",
          card.displayName + ".vcf"
        );
        event.dataTransfer.setData(
          "application/x-moz-file-promise-url",
          "data:text/vcard," + vCard
        );
        event.dataTransfer.setData(
          "application/x-moz-file-promise",
          this._flavorDataProvider
        );
      } catch (ex) {
        Cu.reportError(ex);
      }
    }

    event.dataTransfer.effectAllowed = "all";
    let bcr = row.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      row,
      event.clientX - bcr.x,
      event.clientY - bcr.y
    );
  },

  _flavorDataProvider: {
    QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

    getFlavorData(aTransferable, aFlavor, aData) {
      if (aFlavor == "application/x-moz-file-promise") {
        let primitive = {};
        aTransferable.getTransferData("text/vcard", primitive);
        let vCard = primitive.value.QueryInterface(Ci.nsISupportsString).data;
        aTransferable.getTransferData(
          "application/x-moz-file-promise-dest-filename",
          primitive
        );
        let leafName = primitive.value.QueryInterface(Ci.nsISupportsString)
          .data;
        aTransferable.getTransferData(
          "application/x-moz-file-promise-dir",
          primitive
        );
        let localFile = primitive.value.QueryInterface(Ci.nsIFile).clone();
        localFile.append(leafName);

        let ofStream = Cc[
          "@mozilla.org/network/file-output-stream;1"
        ].createInstance(Ci.nsIFileOutputStream);
        ofStream.init(localFile, -1, -1, 0);
        let converter = Cc[
          "@mozilla.org/intl/converter-output-stream;1"
        ].createInstance(Ci.nsIConverterOutputStream);
        converter.init(ofStream, null);
        converter.writeString(vCard);
        converter.close();

        aData.value = localFile;
      }
    },
  },
};

// Details

var detailsPane = {
  /** These properties are displayed exactly as-is. */
  PLAIN_CONTACT_FIELDS: [
    "FirstName",
    "LastName",
    "PhoneticFirstName",
    "PhoneticLastName",
    "DisplayName",
    "NickName",
    "PrimaryEmail",
    "SecondEmail",
    "PreferMailFormat",
    "WorkPhone",
    "HomePhone",
    "FaxNumber",
    "PagerNumber",
    "CellularNumber",
    "HomeAddress",
    "HomeAddress2",
    "HomeCity",
    "HomeState",
    "HomeZipCode",
    "HomeCountry",
    "WebPage2",
    "WorkAddress",
    "WorkAddress2",
    "WorkCity",
    "WorkState",
    "WorkZipCode",
    "WorkCountry",
    "BirthDay",
    "BirthMonth",
    "BirthYear",
    "Custom1",
    "Custom2",
    "Custom3",
    "Custom4",
    "Notes",
  ],

  container: null,

  editButton: null,

  photo: null,

  currentCard: null,

  init() {
    this.container = document.getElementById("detailsPane");
    this.editButton = document.getElementById("editButton");
    this.cancelEditButton = document.getElementById("cancelEditButton");
    this.saveEditButton = document.getElementById("saveEditButton");

    this.editButton.addEventListener("click", this);
    this.cancelEditButton.addEventListener("click", this);
    this.saveEditButton.addEventListener("click", this);

    // Photo. TODO: Complete this.

    this.photo = document.getElementById("photo");
    this.photo.addEventListener("dragover", this);
    this.photo.addEventListener("drop", this);

    // Set up phonetic name fields if required.

    if (
      Services.prefs.getComplexValue(
        "mail.addr_book.show_phonetic_fields",
        Ci.nsIPrefLocalizedString
      ).data != "true"
    ) {
      for (let field of document.querySelectorAll(".phonetic")) {
        field.hidden = true;
      }
    }

    // Generate display name automatically.

    this.firstName = document.getElementById("FirstName");
    this.lastName = document.getElementById("LastName");
    this.displayName = document.getElementById("DisplayName");

    this.firstName.addEventListener("input", () => this.generateDisplayName());
    this.lastName.addEventListener("input", () => this.generateDisplayName());
    this.displayName.addEventListener("input", () => {
      this.displayName._dirty = !!this.displayName.value;
    });

    // Set up birthday fields.

    this.birthMonth = document.getElementById("BirthMonth");
    this.birthDay = document.getElementById("BirthDay");
    this.birthYear = document.getElementById("BirthYear");
    this.age = document.getElementById("Age");

    let formatter = Intl.DateTimeFormat(undefined, { month: "long" });
    for (let m = 1; m <= 12; m++) {
      let option = document.createElement("option");
      option.setAttribute("value", m);
      option.setAttribute("label", formatter.format(new Date(2000, m - 1, 2)));
      this.birthMonth.appendChild(option);
    }

    formatter = Intl.DateTimeFormat(undefined, { day: "numeric" });
    for (let d = 1; d <= 31; d++) {
      let option = document.createElement("option");
      option.setAttribute("value", d);
      option.setAttribute("label", formatter.format(new Date(2000, 0, d)));
      this.birthDay.appendChild(option);
    }

    this.birthDay.addEventListener("change", () => this.calculateAge());
    this.birthMonth.addEventListener("change", () => this.calculateAge());
    this.birthYear.addEventListener("change", () => this.calculateAge());
    this.age.addEventListener("change", () => this.calculateYear());
  },

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this._onClick(event);
        break;
      case "dragover":
        this._onDragOver(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
    }
  },

  /**
   * Show a read-only representation of a card in the details pane.
   *
   * @param {nsIAbCard?} card - The card to display. This should not be a
   *     mailing list card. Pass null to hide the details pane.
   */
  displayContact(card) {
    this.currentCard = card;
    if (!card || card.isMailList) {
      this.container.hidden = true;
      return;
    }

    document.querySelector("h1").textContent = card.generateName(
      ABView.nameFormat
    );

    for (let [section, fields] of Object.entries({
      emailAddresses: ["PrimaryEmail", "SecondEmail"],
      phoneNumbers: [
        "WorkPhone",
        "HomePhone",
        "FaxNumber",
        "PagerNumber",
        "CellularNumber",
      ],
    })) {
      let list = document.getElementById(section);
      while (list.lastChild) {
        list.lastChild.remove();
      }
      for (let field of fields) {
        let value = card.getProperty(field, "");
        if (value) {
          list.appendChild(document.createElement("li")).textContent = value;
        }
      }
      list.parentNode.previousElementSibling.classList.toggle(
        "noValue",
        !list.childElementCount
      );
    }

    for (let prefix of ["Home", "Work"]) {
      let list = document.getElementById(`${prefix.toLowerCase()}Addresses`);
      while (list.lastChild) {
        list.lastChild.remove();
      }

      let address = "";
      for (let field of [
        "Address",
        "Address2",
        "City",
        "State",
        "ZipCode",
        "Country",
      ]) {
        let value = card.getProperty(`${prefix}${field}`, "");
        if (address) {
          address += field == "ZipCode" ? " " : ", ";
        }
        address += value;
      }
      if (address) {
        list.appendChild(document.createElement("li")).textContent = address;
      }
      list.parentNode.previousElementSibling.classList.toggle(
        "noValue",
        !address
      );
    }

    let photoName = card.getProperty("PhotoName", "");
    if (photoName) {
      let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("Photos");
      file.append(photoName);
      document.querySelector("#photo").style.backgroundImage = `url("${
        Services.io.newFileURI(file).spec
      }")`;
    } else {
      document.querySelector("#photo").style.backgroundImage = null;
    }

    let book = MailServices.ab.getDirectoryFromUID(card.directoryUID);
    this.editButton.disabled = book.readOnly;

    this.container.classList.remove("isEditing");
    this.container.scrollTo(0, 0);
    this.container.hidden = false;
  },

  /**
   * Show controls for editing the currently displayed card.
   */
  editCurrentContact() {
    let card = this.currentCard;

    if (!card) {
      document.querySelector("h1").textContent = "";
    }

    for (let field of this.PLAIN_CONTACT_FIELDS) {
      document.getElementById(field).value = card
        ? card.getProperty(field, "")
        : "";
    }

    this.displayName._dirty = !!this.displayName.value;

    document.getElementById("preferDisplayName").checked =
      // getProperty may return a "1" or "0" string, we want a boolean
      // eslint-disable-next-line mozilla/no-compare-against-boolean-literals
      card ? card.getProperty("PreferDisplayName", true) == true : true;

    this.calculateAge();

    this.container.classList.add("isEditing");
    this.container.scrollTo(0, 0);
  },

  /**
   * Save the currently displayed card.
   */
  saveCurrentContact() {
    let card = this.currentCard;
    let book;
    if (card) {
      book = MailServices.ab.getDirectoryFromUID(card.directoryUID);
    } else {
      card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
        Ci.nsIAbCard
      );

      let row = booksList.getRowAtIndex(booksList.selectedIndex);
      let bookUID = row.dataset.book ?? row.dataset.uid;

      if (bookUID) {
        book = MailServices.ab.getDirectoryFromUID(bookUID);
      }
    }
    if (!book || book.readOnly) {
      throw new Components.Exception(
        "Address book is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    for (let field of this.PLAIN_CONTACT_FIELDS) {
      card.setProperty(field, document.getElementById(field).value ?? null);
    }

    card.setProperty(
      "PreferDisplayName",
      document.getElementById("preferDisplayName").checked
    );

    // TODO: Save photo.

    if (!card.directoryUID) {
      card = book.addCard(card);
      cardsPane.cardsList.selectedIndex = cardsPane.cardsList.view.getIndexForUID(
        card.UID
      );
      cardsPane.cardsList.focus();
    } else {
      book.modifyCard(card);
    }
    this.displayContact(card);
  },

  /**
   * If the display name field is empty, generate a name from the first and
   * last name fields.
   */
  generateDisplayName() {
    if (
      !Services.prefs.getBoolPref("mail.addr_book.displayName.autoGeneration")
    ) {
      // Do nothing if generation is disabled.
      return;
    }

    if (this.displayName._dirty) {
      // Don't modify the field if it already has a value, unless the value
      // was set by this function.
      return;
    }

    if (this.firstName.value) {
      if (!this.lastName.value) {
        this.displayName.value = this.firstName.value;
        return;
      }
    } else {
      if (this.lastName.value) {
        this.displayName.value = this.lastName.value;
      } else {
        this.displayName.value = "";
      }
      return;
    }

    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );
    let lastNameFirst = Services.prefs.getComplexValue(
      "mail.addr_book.displayName.lastnamefirst",
      Ci.nsIPrefLocalizedString
    ).data;
    if (lastNameFirst === "true") {
      this.displayName.value = bundle.formatStringFromName("lastFirstFormat", [
        this.lastName.value,
        this.firstName.value,
      ]);
    } else {
      this.displayName.value = bundle.formatStringFromName("firstLastFormat", [
        this.firstName.value,
        this.lastName.value,
      ]);
    }
  },

  /**
   * Disable the 29th, 30th and 31st days in a month where appropriate.
   */
  setDisabledMonthDays() {
    let month = this.birthMonth.value;
    let year = this.birthYear.value;

    if (!isNaN(year) && year >= 1 && year <= 9999) {
      this.birthDay.children[29].disabled = year % 4 != 0 && month == "2";
    }
    this.birthDay.children[30].disabled = month == "2";
    this.birthDay.children[31].disabled = ["2", "4", "6", "9", "11"].includes(
      month
    );

    if (this.birthDay.options[this.birthDay.selectedIndex].disabled) {
      this.birthDay.value = "";
    }
  },

  /**
   * Calculate the contact's age based on their birth date.
   */
  calculateAge() {
    this.setDisabledMonthDays();

    let month = this.birthMonth.value;
    let day = this.birthDay.value;
    let year = this.birthYear.value;
    this.age.value = "";

    if (isNaN(year) || year < 1 || year > 9999 || month == "" || day == "") {
      return;
    }

    month--; // Date object months are 0-indexed.
    let today = new Date();
    let age = today.getFullYear() - year;
    if (
      month > today.getMonth() ||
      (month == today.getMonth() && day > today.getDate())
    ) {
      age--;
    }
    if (age >= 0) {
      this.age.value = age;
    }
  },

  /**
   * Calculate the contact's birth year based on their age.
   */
  calculateYear() {
    let age = this.age.value;
    if (isNaN(age)) {
      return;
    }

    let today = new Date();
    let year = today.getFullYear() - age;

    let month = this.birthMonth.value;
    if (month != "") {
      month--; // Date object months are 0-indexed.
      let day = this.birthDay.value;
      if (
        month > today.getMonth() ||
        (month == today.getMonth() && day > today.getDate())
      ) {
        year--;
      }
    }
    this.birthYear.value = year;
    this.setDisabledMonthDays();
  },

  _onClick(event) {
    switch (event.target.id) {
      case "editButton":
        this.editCurrentContact();
        break;
      case "cancelEditButton":
        this.displayContact(this.currentCard);
        break;
      case "saveEditButton":
        this.saveCurrentContact();
        break;
    }
  },

  _onDragOver(event) {
    if (
      event.dataTransfer.files.length > 0 &&
      ["image/jpeg", "image/png"].includes(event.dataTransfer.files[0].type)
    ) {
      event.dataTransfer.dropEffect = "move";
      this.photo._dragged = event.dataTransfer.files[0];
      event.preventDefault();
    }
  },

  _onDrop() {
    if (this.photo._dragged) {
      this.photo.style.backgroundImage = `url("${URL.createObjectURL(
        this.photo._dragged
      )}")`;
    }
  },
};

// Printing

var printHandler = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  printDirectory(directory) {
    let title = directory ? directory.dirName : document.title;

    let cards;
    if (directory) {
      cards = directory.childCards;
    } else {
      cards = [];
      for (let directory of MailServices.ab.directories) {
        cards = cards.concat(directory.childCards);
      }
    }

    this._printCards(title, cards);
  },

  printCards(cards) {
    this._printCards(document.title, cards);
  },

  _printCards(title, cards) {
    let collator = new Intl.Collator(undefined, { numeric: true });
    let nameFormat = Services.prefs.getIntPref(
      "mail.addr_book.lastnamefirst",
      0
    );

    cards.sort((a, b) => {
      let aName = a.generateName(nameFormat);
      let bName = b.generateName(nameFormat);
      return collator.compare(aName, bName);
    });

    let xml = "";
    for (let card of cards) {
      if (card.isMailList) {
        continue;
      }

      xml += `<separator/>\n${card.translateTo("xml")}\n<separator/>\n`;
    }

    this._printURL(
      URL.createObjectURL(
        new File(
          [
            `<?xml version="1.0"?>`,
            `<?xml-stylesheet type="text/css" href="chrome://messagebody/skin/abPrint.css"?>`,
            `<directory>`,
            `<title xmlns="http://www.w3.org/1999/xhtml">${title}</title>`,
            xml,
            `</directory>`,
          ],
          "text/xml"
        )
      )
    );
  },

  _printURL(url) {
    let stack = window.browsingContext.topFrameElement.parentNode;
    this._browser = stack.querySelector("browser.aboutAddressBookPrint");

    if (!this._browser) {
      this._browser = stack.ownerDocument.createXULElement("browser");
      this._browser.classList.add("aboutAddressBookPrint");
      this._browser.setAttribute("type", "content");
      this._browser.setAttribute("hidden", "true");
      this._browser.setAttribute("remote", "true");

      stack.appendChild(this._browser);
    }

    this._browser.webProgress.addProgressListener(
      this,
      Ci.nsIWebProgress.NOTIFY_STATE_ALL
    );

    MailE10SUtils.loadURI(this._browser, url);
  },

  /** nsIWebProgressListener */
  onStateChange(webProgress, request, stateFlags, status) {
    if (
      stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
      this._browser.currentURI.spec != "about:blank"
    ) {
      let topWindow = window.browsingContext.topChromeWindow;
      topWindow.PrintUtils.startPrintWindow(this._browser.browsingContext, {});
      this._browser.webProgress.removeProgressListener(this);
    }
  },
};
