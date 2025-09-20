/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { AddrBookDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/addressbook/AddrBookDataAdapter.mjs",
  { global: "current" }
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.importESModule("chrome://messenger/content/contact-avatar.mjs", {
  global: "current",
});
ChromeUtils.defineLazyGetter(this, "ABQueryUtils", function () {
  return ChromeUtils.importESModule("resource:///modules/ABQueryUtils.sys.mjs");
});
ChromeUtils.defineLazyGetter(this, "ICAL", function () {
  return ChromeUtils.importESModule("resource:///modules/calendar/Ical.sys.mjs")
    .default;
});

ChromeUtils.defineESModuleGetters(this, {
  AddrBookCard: "resource:///modules/AddrBookCard.sys.mjs",
  AddrBookUtils: "resource:///modules/AddrBookUtils.sys.mjs",
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalMetronome: "resource:///modules/CalMetronome.sys.mjs",
  CardDAVDirectory: "resource:///modules/CardDAVDirectory.sys.mjs",
  GlodaMsgSearcher: "resource:///modules/gloda/GlodaMsgSearcher.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
  VCardProperties: "resource:///modules/VCardUtils.sys.mjs",
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
  XULStoreUtils: "resource:///modules/XULStoreUtils.sys.mjs",
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(this, "SubDialog", function () {
  const { SubDialogManager } = ChromeUtils.importESModule(
    "resource://gre/modules/SubDialog.sys.mjs"
  );
  return new SubDialogManager({
    dialogStack: document.getElementById("dialogStack"),
    dialogTemplate: document.getElementById("dialogTemplate"),
    dialogOptions: {
      styleSheets: [
        "chrome://messenger/skin/preferences/dialog.css",
        "chrome://messenger/skin/shared/preferences/subdialog.css",
        "chrome://messenger/skin/abFormFields.css",
      ],
      consumeOutsideClicks: false,
      resizeCallback: ({ frame }) => {
        UIFontSize.registerWindow(frame.contentWindow);
        updateAbCommands();

        // Resize the dialog to fit the content with edited font size.
        requestAnimationFrame(() => {
          const dialogs = frame.ownerGlobal.SubDialog._dialogs;
          const dialog = dialogs.find(
            d => d._frame.contentDocument == frame.contentDocument
          );
          if (dialog) {
            UIFontSize.resizeSubDialog(dialog);
          }
        });
      },
    },
  });
});

UIDensity.registerWindow(window);
UIFontSize.registerWindow(window);

var booksList;

/**
 * UID of address book to select during load if any is desired. Gets set to
 * false once initial load is complete.
 *
 * @type {string|boolean|undefined}
 */
let initialAddressBook;

window.addEventListener("load", () => {
  document
    .getElementById("booksPaneCreateBook")
    .addEventListener("click", event => {
      if (Services.prefs.getBoolPref("mail.accounthub.addressbook.enabled")) {
        window.browsingContext.topChromeWindow.openAccountHub("ADDRESS_BOOK");
        return;
      }

      document
        .getElementById("booksPaneCreateBookContext")
        .openPopup(event.target, {
          position: "after_start",
          triggerEvent: event,
        });
    });
  document
    .getElementById("booksPaneCreateContact")
    .addEventListener("click", () => createContact());
  document
    .getElementById("booksPaneCreateList")
    .addEventListener("click", () => createList());

  document
    .getElementById("booksPaneCreateBookContext")
    .addEventListener("command", event => {
      switch (event.target.id) {
        case "booksPaneContextCreateBook":
          createBook(Ci.nsIAbManager.JS_DIRECTORY_TYPE);
          break;
        case "booksPaneContextCreateDav":
          createBook(Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE);
          break;
        case "booksPaneContextCreateLdap":
          createBook(Ci.nsIAbManager.LDAP_DIRECTORY_TYPE);
          break;
      }
    });
  document
    .getElementById("booksPaneImport")
    .addEventListener("click", () => importBook());

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
  photoDialog.init();

  setKeyboardShortcuts();

  // Once the old Address Book has gone away, this should be changed to use
  // UIDs instead of URIs. It's just easier to keep as-is for now.
  const startupURI = Services.prefs.getStringPref(
    "mail.addr_book.view.startupURI",
    ""
  );
  if (initialAddressBook) {
    booksList.selectedIndex = booksList.getIndexForUID(initialAddressBook);
  } else if (startupURI) {
    for (let index = 0; index < booksList.rows.length; index++) {
      const row = booksList.rows[index];
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

  cardsPane.searchInput.focus();

  window.dispatchEvent(new CustomEvent("about-addressbook-ready"));
  initialAddressBook = false;
});

window.addEventListener("unload", () => {
  // Once the old Address Book has gone away, this should be changed to use
  // UIDs instead of URIs. It's just easier to keep as-is for now.
  if (!Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
    const pref = "mail.addr_book.view.startupURI";
    if (booksList.selectedIndex === 0) {
      Services.prefs.clearUserPref(pref);
    } else {
      const row = booksList.getRowAtIndex(booksList.selectedIndex);
      const directory = row._book || row._list;
      Services.prefs.setCharPref(pref, directory.URI);
    }
  }

  // Disconnect the view (if there is one) and tree, so that the view cleans
  // itself up and stops listening for observer service notifications.
  cardsPane.cardsList.view = null;
  detailsPane.uninit();
});

window.addEventListener("keypress", event => {
  // Prevent scrolling of the html tag when space is used.
  if (
    event.key == " " &&
    detailsPane.isEditing &&
    document.activeElement.tagName == "body"
  ) {
    event.preventDefault();
  }
});

/**
 * Add a keydown document event listener for international keyboard shortcuts.
 */
async function setKeyboardShortcuts() {
  const [newContactKey] = await document.l10n.formatValues([
    { id: "about-addressbook-new-contact-key" },
  ]);

  document.addEventListener("keydown", event => {
    if (
      !(AppConstants.platform == "macosx" ? event.metaKey : event.ctrlKey) ||
      ["Shift", "Control", "Meta"].includes(event.key)
    ) {
      return;
    }

    // Always use lowercase to compare the key and avoid OS inconsistencies:
    // For Cmd/Ctrl+Shift+A, on Mac, key = "a" vs. on Windows/Linux, key = "A".
    switch (event.key.toLowerCase()) {
      // Always prevent the default behavior of the keydown if we intercepted
      // the key in order to avoid triggering OS specific shortcuts.
      case newContactKey.toLowerCase(): {
        // Ctrl/Cmd+n.
        event.preventDefault();
        if (!detailsPane.isEditing) {
          createContact();
        }
        break;
      }
    }
  });
}

/**
 * Show UI to create a new address book of the type specified.
 *
 * @param {integer} [type=Ci.nsIAbManager.JS_DIRECTORY_TYPE] - One of the
 *   nsIAbManager directory type constants.
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

  const url = typeURLs[type];
  if (!url) {
    throw new Components.Exception(
      `Unexpected type: ${type}`,
      Cr.NS_ERROR_UNEXPECTED
    );
  }

  const params = {};
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
        updateAbCommands();
      },
    },
    params
  );
}

/**
 * Display the addressbook for a given UID
 *
 * @param {string} UID - The UID for the address book.
 */
async function displayAddressBook(UID) {
  if (initialAddressBook !== false) {
    initialAddressBook = UID;
    return;
  }
  booksList.selectedIndex = booksList.getIndexForUID(UID);
  if (booksList.selectedIndex == 0) {
    // Index 0 was selected before we started listening.
    booksList.dispatchEvent(new CustomEvent("select"));
  }

  cardsPane.searchInput.focus();
}

/**
 * Show UI to create a new contact in the current address book.
 */
function createContact() {
  const row = booksList.getRowAtIndex(booksList.selectedIndex);
  const bookUID = row.dataset.book ?? row.dataset.uid;

  if (bookUID) {
    const book = MailServices.ab.getDirectoryFromUID(bookUID);
    if (book.readOnly) {
      throw new Components.Exception(
        "Address book is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }
  }

  detailsPane.editNewContact();
}

/**
 * Show UI to create a new list in the current address book.
 * For now this loads the old list UI, the intention is to replace it.
 *
 * @param {nsIAbCard[]} cards - The contacts, if any, to add to the list.
 */
function createList(cards) {
  const row = booksList.getRowAtIndex(booksList.selectedIndex);
  const bookUID = row.dataset.book ?? row.dataset.uid;

  const params = { cards };
  if (bookUID) {
    const book = MailServices.ab.getDirectoryFromUID(bookUID);
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
        updateAbCommands();
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
  const observer = function (subject) {
    // It might be possible for more than one directory to be imported, select
    // the first one.
    if (!createdDirectory) {
      createdDirectory = subject.QueryInterface(Ci.nsIAbDirectory);
    }
  };

  Services.obs.addObserver(observer, "addrbook-directory-created");
  window.browsingContext.topChromeWindow.toImport("addressBook");
  Services.obs.removeObserver(observer, "addrbook-directory-created");

  // Select the directory after the import UI closes, so the user sees the change.
  if (createdDirectory) {
    booksList.selectedIndex = booksList.getIndexForUID(createdDirectory.UID);
  }
}

/**
 * Sets the total count for the current selected address book at the bottom
 * of the address book view.
 */
async function updateAddressBookCount() {
  const cardCount = document.getElementById("cardCount");
  const { rowCount: count, directory } = cardsPane.cardsList.view;

  if (directory) {
    document.l10n.setAttributes(cardCount, "about-addressbook-card-count", {
      name: directory.dirName,
      count,
    });
  } else {
    document.l10n.setAttributes(cardCount, "about-addressbook-card-count-all", {
      count,
    });
  }
}

/**
 * Update the shared splitter between the cardsPane and detailsPane in order to
 * properly set its properties to handle the correct pane based on the layout.
 *
 * @param {boolean} isTableLayout - If the current body layout is a table.
 */
function updateSharedSplitter(isTableLayout) {
  const splitter = document.getElementById("sharedSplitter");
  splitter.resizeDirection = isTableLayout ? "vertical" : "horizontal";
  splitter.resizeElement = document.getElementById(
    isTableLayout ? "detailsPane" : "cardsPane"
  );

  splitter.isCollapsed =
    document.getElementById("detailsPane").hidden && isTableLayout;
}

/**
 * Update all commands that are affected by the contents of the address book
 * tab.
 */
function updateAbCommands() {
  const { topChromeWindow } = window.browsingContext;
  topChromeWindow.goUpdateCommand("cmd_createAddressBook");
  topChromeWindow.goUpdateCommand("cmd_createAddressBookCARDDAV");
  topChromeWindow.goUpdateCommand("cmd_createAddressBookLDAP");
  topChromeWindow.goUpdateCommand("cmd_createList");
  topChromeWindow.goUpdateCommand("cmd_newCard");
}

// Books

customElements.whenDefined("tree-listbox").then(() => {
  /**
   * The list of address books.
   *
   * @augments {TreeListbox}
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
      this.addEventListener("dragleave", this);
      this.addEventListener("drop", this);

      for (const book of MailServices.ab.directories) {
        this.appendChild(this._createBookRow(book));
      }

      this._abObserver.observe = this._abObserver.observe.bind(this);
      for (const topic of this._abObserver._notifications) {
        Services.obs.addObserver(this._abObserver, topic, true);
      }

      window.addEventListener("unload", this);

      // Add event listener to update the total count of the selected address
      // book.
      this.addEventListener("select", () => {
        updateAddressBookCount();
      });

      // Row 0 is the "All Address Books" item.
      document.body.classList.toggle(
        "all-ab-selected",
        this.selectedIndex === 0
      );
    }

    destroy() {
      this.removeEventListener("select", this);
      this.removeEventListener("collapsed", this);
      this.removeEventListener("expanded", this);
      this.removeEventListener("keypress", this);
      this.removeEventListener("contextmenu", this);
      this.removeEventListener("dragover", this);
      this.removeEventListener("dragleave", this);
      this.removeEventListener("drop", this);

      for (const topic of this._abObserver._notifications) {
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
        case "dragleave":
          this._clearDropTarget(event);
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
      const row = document
        .getElementById("bookRow")
        .content.firstElementChild.cloneNode(true);
      row.id = `book-${book.UID}`;
      row.setAttribute("aria-label", book.dirName);
      row.title = book.dirName;
      if (XULStoreUtils.isItemCollapsed("addressBook", row.id)) {
        row.classList.add("collapsed");
      }
      if (book.isRemote) {
        row.classList.add("remote");
      }
      if (book.readOnly) {
        row.classList.add("readOnly");
      }
      if (
        ["ldap_2.servers.history", "ldap_2.servers.pab"].includes(
          book.dirPrefId
        )
      ) {
        row.classList.add("noDelete");
      }
      if (book.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE) {
        row.classList.add("carddav");
      }
      row.dataset.uid = book.UID;
      row._book = book;
      row.querySelector("span").textContent = book.dirName;

      for (const list of book.childNodes) {
        row
          .querySelector("ul")
          .appendChild(this._createListRow(book.UID, list));
      }
      return row;
    }

    _createListRow(bookUID, list) {
      const row = document
        .getElementById("listRow")
        .content.firstElementChild.cloneNode(true);
      row.id = `list-${list.UID}`;
      row.setAttribute("aria-label", list.dirName);
      row.title = list.dirName;
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
     *   for All Address Books.
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
     *   for All Address Books.
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

      const row = this.getRowAtIndex(this.selectedIndex);

      if (row.classList.contains("listRow")) {
        const book = MailServices.ab.getDirectoryFromUID(row.dataset.book);
        const list = book.childNodes.find(l => l.UID == row.dataset.uid);

        SubDialog.open(
          "chrome://messenger/content/addressbook/abMailListDialog.xhtml",
          { features: "resizable=no", closedCallback: updateAbCommands },
          { listURI: list.URI }
        );
        return;
      }

      const book = MailServices.ab.getDirectoryFromUID(row.dataset.uid);

      SubDialog.open(
        book.propertiesChromeURI,
        { features: "resizable=no", closedCallback: updateAbCommands },
        { selectedDirectory: book }
      );
    }

    /**
     * Synchronize the selected address book. (CardDAV only.)
     */
    synchronizeSelected() {
      const row = this.getRowAtIndex(this.selectedIndex);
      if (!row.classList.contains("carddav")) {
        throw new Components.Exception(
          "Attempting to synchronize a non-CardDAV book.",
          Cr.NS_ERROR_UNEXPECTED
        );
      }

      let directory = MailServices.ab.getDirectoryFromUID(row.dataset.uid);
      directory = CardDAVDirectory.forFile(directory.fileName);
      directory.syncWithServer().then(() => {
        updateAddressBookCount();
      });
    }

    /**
     * Print the selected address book.
     */
    printSelected() {
      if (this.selectedIndex === 0) {
        printHandler.printDirectory();
        return;
      }

      const row = this.getRowAtIndex(this.selectedIndex);
      if (row.classList.contains("listRow")) {
        const book = MailServices.ab.getDirectoryFromUID(row.dataset.book);
        const list = book.childNodes.find(l => l.UID == row.dataset.uid);
        printHandler.printDirectory(list);
      } else {
        const book = MailServices.ab.getDirectoryFromUID(row.dataset.uid);
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

      const row = this.getRowAtIndex(this.selectedIndex);
      const directory = row._book || row._list;
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

      const row = this.getRowAtIndex(this.selectedIndex);
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

      const [title, message] = await document.l10n.formatValues([
        { id: `about-addressbook-confirm-${action}-title`, args: { count: 1 } },
        {
          id: `about-addressbook-confirm-${action}`,
          args: { name, count: 1 },
        },
      ]);

      if (
        Services.prompt.confirmEx(
          window,
          title,
          message,
          Ci.nsIPromptService.STD_YES_NO_BUTTONS,
          null,
          null,
          null,
          null,
          {}
        ) === 0
      ) {
        MailServices.ab.deleteAddressBook(uri);
      }
    }

    /**
     * Set the selected directory to be the one opened when the page opens.
     */
    setSelectedAsStartupDefault() {
      // Once the old Address Book has gone away, this should be changed to use
      // UIDs instead of URIs. It's just easier to keep as-is for now.
      Services.prefs.setBoolPref(
        "mail.addr_book.view.startupURIisDefault",
        true
      );
      if (this.selectedIndex === 0) {
        Services.prefs.clearUserPref("mail.addr_book.view.startupURI");
        return;
      }

      const row = this.getRowAtIndex(this.selectedIndex);
      const directory = row._book || row._list;
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

    /**
     * @returns {boolean} True if a new contact can be created in the current
     *   address book.
     */
    canCreateContact() {
      if (this.selectedIndex === 0) {
        return true;
      }
      const row = this.getRowAtIndex(this.selectedIndex);
      if (!row) {
        return false;
      }
      const bookUID = row.dataset.book ?? row.dataset.uid;
      const book = MailServices.ab.getDirectoryFromUID(bookUID);
      return !book.readOnly;
    }

    /**
     * @returns {boolean} True if a new list can be created in the current
     *   address book.
     */
    canCreateList() {
      if (this.selectedIndex === 0) {
        return true;
      }
      const row = this.getRowAtIndex(this.selectedIndex);
      if (!row) {
        return false;
      }
      const bookUID = row.dataset.book ?? row.dataset.uid;
      const book = MailServices.ab.getDirectoryFromUID(bookUID);
      return !book.readOnly && book.supportsMailingLists;
    }

    _onSelect() {
      const row = this.getRowAtIndex(this.selectedIndex);
      if (row.classList.contains("listRow")) {
        cardsPane.displayList(row.dataset.book, row.dataset.uid);
      } else {
        cardsPane.displayBook(row.dataset.uid);
      }

      window.browsingContext.topChromeWindow.goUpdateCommand("cmd_newCard");
      window.browsingContext.topChromeWindow.goUpdateCommand("cmd_createList");

      // Row 0 is the "All Address Books" item.
      if (this.selectedIndex === 0) {
        document.getElementById("booksPaneCreateContact").disabled = false;
        document.getElementById("booksPaneCreateList").disabled = false;
        document.body.classList.add("all-ab-selected");
        return;
      }

      const bookUID = row.dataset.book ?? row.dataset.uid;
      const book = MailServices.ab.getDirectoryFromUID(bookUID);

      document.getElementById("booksPaneCreateContact").disabled =
        book.readOnly;
      document.getElementById("booksPaneCreateList").disabled =
        book.readOnly || !book.supportsMailingLists;
      document.body.classList.remove("all-ab-selected");
    }

    _onCollapsed(event) {
      XULStoreUtils.setValue("addressBook", event.target.id, "collapsed", true);
    }

    _onExpanded(event) {
      XULStoreUtils.removeValue("addressBook", event.target.id, "collapsed");
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

    _onClick(event) {
      super._onClick(event);

      // Only handle left-clicks. Right-clicking on the menu button will cause
      // the menu to appear anyway, and other buttons can be ignored.
      if (
        event.button !== 0 ||
        !event.target.closest(".bookRow-menu, .listRow-menu")
      ) {
        return;
      }

      this._showContextMenu(event);
    }

    _onContextMenu(event) {
      this._showContextMenu(event);
    }

    _onDragOver(event) {
      const cards = event.dataTransfer.mozGetDataAt("moz/abcard-array", 0);
      if (!cards) {
        return;
      }
      if (cards.some(c => c.isMailList)) {
        return;
      }

      // TODO: Handle dropping a vCard here.

      const row = event.target.closest("li");
      if (!row || row.classList.contains("readOnly")) {
        return;
      }

      const rowIsList = row.classList.contains("listRow");
      event.dataTransfer.effectAllowed = rowIsList ? "link" : "copyMove";

      if (rowIsList) {
        const bookUID = row.dataset.book;
        for (const card of cards) {
          if (card.directoryUID != bookUID) {
            return;
          }
        }
        event.dataTransfer.dropEffect = "link";
      } else {
        const bookUID = row.dataset.uid;
        for (const card of cards) {
          // Prevent dropping a card where it already is.
          if (card.directoryUID == bookUID) {
            return;
          }
        }
      }

      this._clearDropTarget();
      row.classList.add("drop-target");

      event.preventDefault();
    }

    _clearDropTarget() {
      this.querySelector(".drop-target")?.classList.remove("drop-target");
    }

    _onDrop(event) {
      this._clearDropTarget();
      if (event.dataTransfer.dropEffect == "none") {
        // Somehow this is possible. It should not be possible.
        return;
      }

      const cards = event.dataTransfer.mozGetDataAt("moz/abcard-array", 0);
      const row = event.target.closest("li");

      if (row.classList.contains("listRow")) {
        for (const card of cards) {
          row._list.addCard(card);
        }
      } else if (event.dataTransfer.dropEffect == "copy") {
        for (const card of cards) {
          row._book.dropCard(card, true);
        }
      } else {
        const booksMap = new Map();
        const bookUID = row.dataset.uid;
        for (const card of cards) {
          if (bookUID == card.directoryUID) {
            continue;
          }
          row._book.dropCard(card, false);
          let bookSet = booksMap.get(card.directoryUID);
          if (!bookSet) {
            bookSet = new Set();
            booksMap.set(card.directoryUID, bookSet);
          }
          bookSet.add(card);
        }
        for (const [uid, bookSet] of booksMap) {
          MailServices.ab.getDirectoryFromUID(uid).deleteCards([...bookSet]);
        }
      }

      event.preventDefault();
    }

    _showContextMenu(event) {
      const row =
        event.target == this
          ? this.getRowAtIndex(this.selectedIndex)
          : event.target.closest("li");
      if (!row) {
        return;
      }

      const popup = document.getElementById("bookContext");
      const synchronizeItem = document.getElementById("bookContextSynchronize");
      const exportItem = document.getElementById("bookContextExport");
      const deleteItem = document.getElementById("bookContextDelete");
      const removeItem = document.getElementById("bookContextRemove");
      const startupDefaultItem = document.getElementById(
        "bookContextStartupDefault"
      );

      let isDefault = Services.prefs.getBoolPref(
        "mail.addr_book.view.startupURIisDefault"
      );

      this.selectedIndex = this.rows.indexOf(row);
      this.focus();
      if (this.selectedIndex === 0) {
        // All Address Books - only the startup default item is relevant.
        for (const item of popup.children) {
          item.hidden = item != startupDefaultItem;
        }

        isDefault =
          isDefault &&
          !Services.prefs.prefHasUserValue("mail.addr_book.view.startupURI");
      } else {
        for (const item of popup.children) {
          item.hidden = false;
        }

        document.l10n.setAttributes(
          document.getElementById("bookContextProperties"),
          row.classList.contains("listRow")
            ? "about-addressbook-books-context-edit-list"
            : "about-addressbook-books-context-properties"
        );

        synchronizeItem.hidden = !row.classList.contains("carddav");
        exportItem.hidden = row.classList.contains("remote");

        deleteItem.disabled = row.classList.contains("noDelete");
        deleteItem.hidden = row.classList.contains("carddav");

        removeItem.disabled = row.classList.contains("noDelete");
        removeItem.hidden = !row.classList.contains("carddav");

        const directory = row._book || row._list;
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

      if (event.type == "contextmenu" && event.button == 2) {
        // This is a right-click. Open where it happened.
        popup.openPopupAtScreen(event.screenX, event.screenY, true);
      } else {
        // This is a click on the menu button, or the context menu key was
        // pressed. Open near the menu button.
        popup.openPopup(
          row.querySelector(".bookRow-container, .listRow-container"),
          {
            triggerEvent: event,
            position: "end_before",
            x: -26,
            y: 30,
          }
        );
      }
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
        "addrbook-directory-request-start",
        "addrbook-directory-request-end",
        "addrbook-list-created",
        "addrbook-list-updated",
        "addrbook-list-deleted",
      ],

      // Bound to `booksList`.
      observe(subject, topic, data) {
        subject.QueryInterface(Ci.nsIAbDirectory);

        switch (topic) {
          case "addrbook-directory-created": {
            const row = this._createBookRow(subject);
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
            const row = this.getRowForUID(subject.UID);
            row.querySelector(".bookRow-name, .listRow-name").textContent =
              subject.dirName;
            row.setAttribute("aria-label", subject.dirName);
            if (cardsPane.cardsList.view.directory?.UID == subject.UID) {
              document.l10n.setAttributes(
                cardsPane.searchInput,
                "about-addressbook-search2",
                { name: subject.dirName }
              );
            }
            break;
          }
          case "addrbook-directory-deleted": {
            this.getRowForUID(subject.UID).remove();
            break;
          }
          case "addrbook-directory-request-start":
            this.getRowForUID(data).classList.add("requesting");
            break;
          case "addrbook-directory-request-end":
            this.getRowForUID(data).classList.remove("requesting");
            break;
          case "addrbook-list-created": {
            const row = this.getRowForUID(data);
            let childList = row.querySelector("ul");
            if (!childList) {
              childList = row.appendChild(document.createElement("ul"));
            }

            const listRow = this._createListRow(data, subject);
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
            const row = this.getRowForUID(data);
            const childList = row.querySelector("ul");
            const listRow = childList.querySelector(
              `[data-uid="${subject.UID}"]`
            );
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
});

// Cards

customElements.whenDefined("tree-view-table-row").then(() => {
  /**
   * A row in the list of cards.
   *
   * @augments {TreeViewTableRow}
   */
  class AbCardRow extends customElements.get("tree-view-table-row") {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }

      super.connectedCallback();

      this.setAttribute("draggable", "true");
      this.classList.add("card-layout");

      this.cell = document.createElement("td");

      const container = this.cell.appendChild(document.createElement("div"));
      container.classList.add("card-container");

      this.avatar = container.appendChild(
        document.createElement("contact-avatar")
      );
      const dataContainer = container.appendChild(
        document.createElement("div")
      );
      dataContainer.classList.add("ab-card-row-data");

      this.firstLine = dataContainer.appendChild(document.createElement("p"));
      this.firstLine.classList.add("ab-card-first-line");
      this.name = this.firstLine.appendChild(document.createElement("span"));
      this.name.classList.add("name");

      const secondLine = dataContainer.appendChild(document.createElement("p"));
      secondLine.classList.add("ab-card-second-line");
      this.address = secondLine.appendChild(document.createElement("span"));
      this.address.classList.add("address");

      this.appendChild(this.cell);
    }

    /**
     * Generate the layout for the current card.
     *
     * NOTE: This element could be recycled, make sure you set or clear all
     * properties.
     */
    fillRow() {
      super.fillRow();

      const card = this.view.getCardFromRow(this._index);
      this.name.textContent = this.view.getCellText(
        this._index,
        "GeneratedName"
      );

      // Add the address book name for All Address Books if in the sort Context
      // Address Book is checked. This is done for the list view only.
      if (
        document.getElementById("books").selectedIndex == "0" &&
        document
          .getElementById("sortContext")
          .querySelector(`menuitem[value="addrbook"]`)
          .getAttribute("checked") === "true"
      ) {
        let addressBookName = this.querySelector(".address-book-name");
        if (!addressBookName) {
          addressBookName = document.createElement("span");
          addressBookName.classList.add("address-book-name");
          this.firstLine.appendChild(addressBookName);
        }
        addressBookName.textContent = this.view.getCellText(
          this._index,
          "addrbook"
        );
      } else {
        this.querySelector(".address-book-name")?.remove();
      }

      this.address.textContent = !card.isMailList ? card.primaryEmail : "";
      this.classList.toggle("mail-list-row", card.isMailList);
      this.avatar.setData({ card, recipient: this.name.textContent });

      this.cell.setAttribute("aria-label", this.name.textContent);
    }
  }
  customElements.define("ab-card-row", AbCardRow, { extends: "tr" });

  /**
   * A row in the table list of cards.
   *
   * @augments {TreeViewTableRow}
   */
  class AbTableCardRow extends customElements.get("tree-view-table-row") {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }

      super.connectedCallback();

      this.setAttribute("draggable", "true");
      this.classList.add("table-layout");

      for (const column of cardsPane.COLUMNS) {
        this.appendChild(document.createElement("td")).classList.add(
          `${column.id.toLowerCase()}-column`
        );
      }
    }

    /**
     * Generate the layout for the current card.
     *
     * NOTE: This element could be recycled, make sure you set or clear all
     * properties.
     */
    fillRow() {
      super.fillRow();

      const card = this.view.getCardFromRow(this._index);
      this.classList.toggle("mail-list-card", card.isMailList);

      for (const column of cardsPane.COLUMNS) {
        const cell = this.querySelector(`.${column.id.toLowerCase()}-column`);
        if (!column.hidden) {
          cell.textContent = this.view.getCellText(this._index, column.id);
          continue;
        }

        cell.hidden = true;
      }

      this.setAttribute("aria-label", this.firstElementChild.textContent);
    }
  }
  customElements.define("ab-table-card-row", AbTableCardRow, {
    extends: "tr",
  });
});

var cardsPane = {
  /**
   * The array of columns for the table layout.
   *
   * @type {Array<object>}
   */
  COLUMNS: [
    {
      id: "GeneratedName",
      l10n: {
        header: "about-addressbook-column-header-generatedname2",
        menuitem: "about-addressbook-column-label-generatedname2",
      },
    },
    {
      id: "EmailAddresses",
      l10n: {
        header: "about-addressbook-column-header-emailaddresses2",
        menuitem: "about-addressbook-column-label-emailaddresses2",
      },
    },
    {
      id: "NickName",
      l10n: {
        header: "about-addressbook-column-header-nickname2",
        menuitem: "about-addressbook-column-label-nickname2",
      },
      hidden: true,
    },
    {
      id: "PhoneNumbers",
      l10n: {
        header: "about-addressbook-column-header-phonenumbers2",
        menuitem: "about-addressbook-column-label-phonenumbers2",
      },
    },
    {
      id: "Addresses",
      l10n: {
        header: "about-addressbook-column-header-addresses2",
        menuitem: "about-addressbook-column-label-addresses2",
      },
    },
    {
      id: "Title",
      l10n: {
        header: "about-addressbook-column-header-title2",
        menuitem: "about-addressbook-column-label-title2",
      },
      hidden: true,
    },
    {
      id: "Department",
      l10n: {
        header: "about-addressbook-column-header-department2",
        menuitem: "about-addressbook-column-label-department2",
      },
      hidden: true,
    },
    {
      id: "Organization",
      l10n: {
        header: "about-addressbook-column-header-organization2",
        menuitem: "about-addressbook-column-label-organization2",
      },
      hidden: true,
    },
    {
      id: "addrbook",
      l10n: {
        header: "about-addressbook-column-header-addrbook2",
        menuitem: "about-addressbook-column-label-addrbook2",
      },
      hidden: true,
    },
  ],

  /**
   * Make the list rows density aware.
   */
  densityChange() {
    const rowClass = customElements.get("ab-card-row");
    const tableRowClass = customElements.get("ab-table-card-row");
    let densitySpacing;
    let cardMinHeight;
    let rowMinHeight;
    switch (UIDensity.prefValue) {
      case UIDensity.MODE_COMPACT:
        densitySpacing = 0;
        cardMinHeight = 40;
        rowMinHeight = 18;
        break;
      case UIDensity.MODE_TOUCH:
        densitySpacing = 12;
        cardMinHeight = 68;
        rowMinHeight = 32;
        break;
      default:
        densitySpacing = 6;
        cardMinHeight = 52;
        rowMinHeight = 22;
        break;
    }
    const currentFontSize = UIFontSize.size;
    // Font-size * line-height * 2 rows and padding + density.
    const cardRowHeight = Math.ceil(
      currentFontSize * 1.4 * 2.5 + densitySpacing
    );
    rowClass.ROW_HEIGHT = Math.max(cardRowHeight, cardMinHeight);
    // Font-size * line-height.
    const tableRowHeight = Math.ceil(currentFontSize * 1.2);
    tableRowClass.ROW_HEIGHT = Math.max(tableRowHeight, rowMinHeight);
    this.cardsList.reset();
  },

  searchInput: null,

  cardsList: null,

  init() {
    this.searchInput = document.getElementById("searchInput");
    this.displayButton = document.getElementById("displayButton");
    this.sortContext = document.getElementById("sortContext");
    this.cardContext = document.getElementById("cardContext");

    this.cardsList = document.getElementById("cards");
    this.table = this.cardsList.table;
    this.table.editable = true;
    this.table.setBodyID("cardsBody");
    this.cardsList.setAttribute("rows", "ab-card-row");

    this.toggleLayout(
      XULStoreUtils.getValue("addressBook", "cardsPane", "layout") == "table"
    );

    const nameFormat = Services.prefs.getIntPref(
      "mail.addr_book.lastnamefirst",
      0
    );
    this.sortContext
      .querySelector(`[name="format"][value="${nameFormat}"]`)
      ?.setAttribute("checked", "true");

    let columns = XULStoreUtils.getValue("addressBook", "cards", "columns");
    if (columns) {
      columns = columns.split(",");
      for (const column of cardsPane.COLUMNS) {
        column.hidden = !columns.includes(column.id);
      }
    }

    this.table.setColumns(cardsPane.COLUMNS);
    this.table.restoreColumnsWidths("addressBook");

    // Only add the address book toggle to the filter button outside the table
    // layout view. All other toggles are only for a table context.
    const abColumn = cardsPane.COLUMNS.find(c => c.id == "addrbook");
    const menuitem = this.sortContext.insertBefore(
      document.createXULElement("menuitem"),
      this.sortContext.querySelector("menuseparator:last-of-type")
    );
    menuitem.setAttribute("type", "checkbox");
    menuitem.setAttribute("name", "toggle");
    menuitem.setAttribute("value", abColumn.id);
    menuitem.setAttribute("closemenu", "none");
    if (abColumn.l10n?.menuitem) {
      document.l10n.setAttributes(menuitem, abColumn.l10n.menuitem);
    }
    if (!abColumn.hidden) {
      menuitem.setAttribute("checked", "true");
    }

    menuitem.addEventListener("command", () =>
      this._onColumnsChanged({ target: menuitem, value: abColumn.id })
    );

    this.searchInput.addEventListener("autocomplete", this);
    this.searchInput.addEventListener("search", this);
    this.displayButton.addEventListener("click", this);
    this.sortContext.addEventListener("command", this);
    this.table.addEventListener("columns-changed", this);
    this.table.addEventListener("sort-changed", this);
    this.table.addEventListener("column-resized", this);
    this.cardsList.addEventListener("select", this);
    this.cardsList.addEventListener("keydown", this);
    this.cardsList.addEventListener("dblclick", this);
    this.cardsList.addEventListener("dragstart", this);
    this.cardsList.addEventListener("contextmenu", this);
    this.cardsList.addEventListener("rowcountchange", () => {
      if (
        document.activeElement == this.cardsList &&
        this.cardsList.view.rowCount == 0
      ) {
        this.searchInput.focus();
      }
    });
    this.cardsList.addEventListener("searchstatechange", () =>
      this._updatePlaceholder()
    );
    this.cardContext.addEventListener("command", this);

    window.addEventListener("uidensitychange", () => cardsPane.densityChange());
    window.addEventListener("uifontsizechange", () =>
      cardsPane.densityChange()
    );
    customElements
      .whenDefined("ab-table-card-row")
      .then(() => cardsPane.densityChange());

    document
      .getElementById("placeholderCreateContact")
      .addEventListener("click", () => createContact());
  },

  handleEvent(event) {
    switch (event.type) {
      case "autocomplete":
        this._onAutocomplete(event);
        break;
      case "search":
        event.preventDefault();
        break;
      case "command":
        this._onCommand(event);
        break;
      case "click":
        this._onClick(event);
        break;
      case "select":
        this._onSelect(event);
        break;
      case "keydown":
        this._onKeyDown(event);
        break;
      case "dblclick":
        this._onDoubleClick(event);
        break;
      case "dragstart":
        this._onDragStart(event);
        break;
      case "contextmenu":
        this._onContextMenu(event);
        break;
      case "columns-changed":
        this._onColumnsChanged(event.detail);
        break;
      case "sort-changed":
        this._onSortChanged(event);
        break;
      case "column-resized":
        this._onColumnResized(event);
        break;
    }
  },

  /**
   * Store the resized column value in the xul store.
   *
   * @param {DOMEvent} event - The dom event bubbling from the resized action.
   */
  _onColumnResized(event) {
    this.table.setColumnsWidths("addressBook", event);
  },

  _onSortChanged(event) {
    const { sortColumn, sortDirection } = this.cardsList.view;
    const column = event.detail.column;
    this.sortRows(
      column,
      sortColumn == column && sortDirection == "ascending"
        ? "descending"
        : "ascending"
    );
  },

  _onColumnsChanged(data) {
    const column = data.value;
    const checked = data.target.hasAttribute("checked");

    for (const columnDef of cardsPane.COLUMNS) {
      if (columnDef.id == column) {
        columnDef.hidden = !checked;
        break;
      }
    }

    this.table.updateColumns(cardsPane.COLUMNS);
    this.cardsList.reset();

    XULStoreUtils.setValue(
      "addressBook",
      "cards",
      "columns",
      cardsPane.COLUMNS.filter(c => !c.hidden)
        .map(c => c.id)
        .join(",")
    );
  },

  /**
   * Switch between list and table layouts.
   *
   * @param {?boolean} isTableLayout - Use table layout if `true` or list
   *   layout if `false`. If unspecified, switch layouts.
   */
  toggleLayout(isTableLayout) {
    isTableLayout = document.body.classList.toggle(
      "layout-table",
      isTableLayout
    );

    updateSharedSplitter(isTableLayout);

    this.cardsList.setAttribute(
      "rows",
      isTableLayout ? "ab-table-card-row" : "ab-card-row"
    );
    this.cardsList.headerHidden = !isTableLayout;
    this.cardsList.setSpacersColspan(
      isTableLayout ? cardsPane.COLUMNS.filter(c => !c.hidden).length : 0
    );
    if (isTableLayout) {
      this.sortContext
        .querySelector("#sortContextTableLayout")
        .setAttribute("checked", "true");
    } else {
      this.sortContext
        .querySelector("#sortContextTableLayout")
        .removeAttribute("checked");
    }

    if (this.cardsList.selectedIndex > -1) {
      this.cardsList.scrollToIndex(this.cardsList.selectedIndex);
    }
    XULStoreUtils.setValue(
      "addressBook",
      "cardsPane",
      "layout",
      isTableLayout ? "table" : "list"
    );
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

    const searchWords = ABQueryUtils.getSearchTokens(this.searchInput.value);
    const queryURIFormat = ABQueryUtils.getModelQuery(
      "mail.addr_book.quicksearchquery.format"
    );
    return ABQueryUtils.generateQueryURI(queryURIFormat, searchWords);
  },

  /**
   * Display an address book, or all address books.
   *
   * @param {string|null} uid - The UID of the book or list to display, or null
   *   for All Address Books.
   */
  displayBook(uid) {
    const book = uid ? MailServices.ab.getDirectoryFromUID(uid) : null;
    if (book) {
      document.l10n.setAttributes(
        this.searchInput,
        "about-addressbook-search2",
        { name: book.dirName }
      );
    } else {
      document.l10n.setAttributes(
        this.searchInput,
        "about-addressbook-search-all2"
      );
    }
    const sortColumn =
      XULStoreUtils.getValue("addressBook", "cards", "sortColumn") ||
      "GeneratedName";
    const sortDirection =
      XULStoreUtils.getValue("addressBook", "cards", "sortDirection") ||
      "ascending";
    this.cardsList.view = new AddrBookDataAdapter(
      book,
      this.getQuery(),
      this.searchInput.value,
      sortColumn,
      sortDirection
    );
    this.sortRows(sortColumn, sortDirection);
    this._updatePlaceholder();

    detailsPane.displayCards();
  },

  /**
   * Display a list.
   *
   * @param {bookUID} bookUID - The UID of the address book containing the list.
   * @param {string} uid - The UID of the list to display.
   */
  displayList(bookUID, uid) {
    const book = MailServices.ab.getDirectoryFromUID(bookUID);
    const list = book.childNodes.find(l => l.UID == uid);
    document.l10n.setAttributes(this.searchInput, "about-addressbook-search2", {
      name: list.dirName,
    });
    const sortColumn =
      XULStoreUtils.getValue("addressBook", "cards", "sortColumn") ||
      "GeneratedName";
    const sortDirection =
      XULStoreUtils.getValue("addressBook", "cards", "sortDirection") ||
      "ascending";
    this.cardsList.view = new AddrBookDataAdapter(
      list,
      this.getQuery(),
      this.searchInput.value,
      sortColumn,
      sortDirection
    );
    this.sortRows(sortColumn, sortDirection);
    this._updatePlaceholder();

    detailsPane.displayCards();
  },

  get selectedCards() {
    return this.cardsList.selectedIndices.map(i =>
      this.cardsList.view.getCardFromRow(i)
    );
  },

  /**
   * Display the right message in the cards list placeholder. The placeholder
   * is only visible if there are no cards in the list, but it's kept
   * up-to-date at all times, so we don't have to keep track of the size of
   * the list.
   */
  _updatePlaceholder() {
    const { directory, searchState } = this.cardsList.view;

    let idsToShow;
    switch (searchState) {
      case AddrBookDataAdapter.NOT_SEARCHING:
        if (directory?.isRemote && !Services.io.offline) {
          idsToShow = ["placeholderSearchOnly"];
        } else {
          idsToShow = ["placeholderEmptyBook"];
          if (!directory?.readOnly && !directory?.isMailList) {
            idsToShow.push("placeholderCreateContact");
          }
        }
        break;
      case AddrBookDataAdapter.SEARCHING:
        idsToShow = ["placeholderSearching"];
        break;
      case AddrBookDataAdapter.SEARCH_COMPLETE:
        idsToShow = ["placeholderNoSearchResults"];
        break;
    }

    this.cardsList.updatePlaceholders(idsToShow);
  },

  /**
   * Set the name format to be displayed.
   *
   * @param {Event} event - Event whose value is one of the
   *   nsIAbCard.GENERATE_* constants.
   */
  setNameFormat(event) {
    // AddrBookDataAdapter will detect this change and update automatically.
    Services.prefs.setIntPref(
      "mail.addr_book.lastnamefirst",
      event.target.value
    );
  },

  /**
   * Change the sort order of the rows being displayed. If `column` and
   * `direction` match the existing values no sorting occurs but the UI items
   * are always updated.
   *
   * @param {string} column
   * @param {"ascending"|"descending"} direction
   */
  sortRows(column, direction) {
    // Uncheck the sort button menu item for the previously sorted column, if
    // there is one, then check the sort button menu item for the column to be
    // sorted.
    this.sortContext
      .querySelector(`[name="sort"][checked]`)
      ?.removeAttribute("checked");
    this.sortContext
      .querySelector(`[name="sort"][value="${column} ${direction}"]`)
      ?.setAttribute("checked", "true");

    // Unmark the header of previously sorted column, then mark the header of
    // the column to be sorted.
    this.table
      .querySelector(".sorting")
      ?.classList.remove("sorting", "ascending", "descending");
    this.table
      .querySelector(`#${column} button`)
      ?.classList.add("sorting", direction);

    if (
      this.cardsList.view.sortColumn == column &&
      this.cardsList.view.sortDirection == direction
    ) {
      return;
    }

    this.cardsList.view.sortBy(column, direction);

    XULStoreUtils.setValue("addressBook", "cards", "sortColumn", column);
    XULStoreUtils.setValue("addressBook", "cards", "sortDirection", direction);
  },

  /**
   * Start a new message to the given addresses.
   *
   * @param {string[]} addresses
   */
  writeTo(addresses) {
    const params = Cc[
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
    const selectedAddresses = [];

    for (const card of this.selectedCards) {
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
    const selectedCards = this.selectedCards;
    if (selectedCards.length) {
      // Some cards are selected. Print them.
      printHandler.printCards(selectedCards);
    } else if (this.cardsList.view.searchString) {
      // Nothing's selected, so print everything. But this is a search, so we
      // can't just print the selected book/list.
      const allCards = [];
      for (let i = 0; i < this.cardsList.view.rowCount; i++) {
        allCards.push(this.cardsList.view.getCardFromRow(i));
      }
      printHandler.printCards(allCards);
    } else {
      // Nothing's selected, so print the selected book/list.
      booksList.printSelected();
    }
  },

  /**
   * Export the selected mailing list to a file.
   */
  exportSelected() {
    const card = this.selectedCards[0];
    if (!card || !card.isMailList) {
      return;
    }
    const row = booksList.getRowForUID(card.UID);
    AddrBookUtils.exportDirectory(row._list);
  },

  _canModifySelected() {
    if (this.cardsList.view.directory?.readOnly) {
      return false;
    }

    const seenDirectories = new Set();
    for (const index of this.cardsList.selectedIndices) {
      const { directoryUID } = this.cardsList.view.getCardFromRow(index);
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
    if (!this._canModifySelected()) {
      return;
    }

    const selectedLists = [];
    const selectedContacts = [];

    for (const index of this.cardsList.selectedIndices) {
      const card = this.cardsList.view.getCardFromRow(index);
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
    const count = selectedLists.length + selectedContacts.length;
    const selectedDir = this.cardsList.view.directory;

    if (selectedLists.length && selectedContacts.length) {
      action = "delete-mixed";
    } else if (selectedLists.length) {
      action = "delete-lists";
      name = selectedLists[0].displayName;
    } else {
      const nameFormatFromPref = Services.prefs.getIntPref(
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

    // Adjust strings to match translations.
    let actionString;
    switch (action) {
      case "delete-contacts":
        actionString =
          count > 1 ? "delete-contacts-multi" : "delete-contacts-single";
        break;
      case "remove-contacts":
        actionString =
          count > 1 ? "remove-contacts-multi" : "remove-contacts-single";
        break;
      default:
        actionString = action;
        break;
    }

    const [title, message] = await document.l10n.formatValues([
      { id: `about-addressbook-confirm-${action}-title`, args: { count } },
      {
        id: `about-addressbook-confirm-${actionString}`,
        args: { count, name, list },
      },
    ]);

    // Finally, show our smart confirmation message, and act upon it!
    if (
      Services.prompt.confirmEx(
        window,
        title,
        message,
        Ci.nsIPromptService.STD_YES_NO_BUTTONS,
        null,
        null,
        null,
        null,
        {}
      ) !== 0
    ) {
      // Deletion cancelled by user.
      return;
    }

    // TODO: Setting the index should be unnecessary.
    const indexAfterDelete = this.cardsList.currentIndex;
    // Delete cards from address books or mailing lists.
    this.cardsList.view.deleteSelectedCards();
    this.cardsList.currentIndex = Math.min(
      indexAfterDelete,
      this.cardsList.view.rowCount - 1
    );
  },

  _onContextMenu(event) {
    this._showContextMenu(event);
  },

  _showContextMenu(event) {
    let row;
    if (event.target == this.cardsList.table.body) {
      row = this.cardsList.getRowAtIndex(this.cardsList.currentIndex);
    } else {
      row = event.target.closest(
        `tr[is="ab-card-row"], tr[is="ab-table-card-row"]`
      );
    }
    if (!row) {
      return;
    }
    if (!this.cardsList.selectedIndices.includes(row.index)) {
      this.cardsList.selectedIndex = row.index;
      // Re-fetch the row in case it was replaced.
      row = this.cardsList.getRowAtIndex(this.cardsList.currentIndex);
    }

    this.cardsList.table.body.focus();

    const writeMenuItem = document.getElementById("cardContextWrite");
    const writeMenu = document.getElementById("cardContextWriteMenu");
    const writeMenuSeparator = document.getElementById(
      "cardContextWriteSeparator"
    );
    const editItem = document.getElementById("cardContextEdit");
    // Always reset the edit item to its default string.
    document.l10n.setAttributes(
      editItem,
      "about-addressbook-books-context-edit"
    );
    const exportItem = document.getElementById("cardContextExport");
    if (this.cardsList.selectedIndices.length == 1) {
      const card = this.cardsList.view.getCardFromRow(
        this.cardsList.selectedIndex
      );
      if (card.isMailList) {
        writeMenuItem.hidden = writeMenuSeparator.hidden = false;
        writeMenu.hidden = true;
        editItem.hidden = !this._canModifySelected();
        document.l10n.setAttributes(
          editItem,
          "about-addressbook-books-context-edit-list"
        );
        exportItem.hidden = false;
      } else {
        const addresses = card.emailAddresses;

        if (addresses.length == 0) {
          writeMenuItem.hidden =
            writeMenu.hidden =
            writeMenuSeparator.hidden =
              true;
        } else if (addresses.length == 1) {
          writeMenuItem.hidden = writeMenuSeparator.hidden = false;
          writeMenu.hidden = true;
        } else {
          while (writeMenu.menupopup.lastChild) {
            writeMenu.menupopup.lastChild.remove();
          }

          for (const address of addresses) {
            const menuitem = document.createXULElement("menuitem");
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

        editItem.hidden = !this._canModifySelected();
        exportItem.hidden = true;
      }
    } else {
      writeMenuItem.hidden = false;
      writeMenu.hidden = true;
      editItem.hidden = true;
      exportItem.hidden = true;
    }

    const deleteItem = document.getElementById("cardContextDelete");
    const removeItem = document.getElementById("cardContextRemove");

    const inMailList = this.cardsList.view.directory?.isMailList;
    deleteItem.hidden = inMailList;
    removeItem.hidden = !inMailList;
    deleteItem.disabled = removeItem.disabled = !this._canModifySelected();

    if (event.type == "contextmenu" && event.button == 2) {
      // This is a right-click. Open where it happened.
      this.cardContext.openPopupAtScreen(event.screenX, event.screenY, true);
    } else {
      // This is a context menu key press. Open near the middle of the row.
      this.cardContext.openPopup(row, {
        triggerEvent: event,
        position: "overlap",
        x: row.clientWidth / 2,
        y: row.clientHeight / 2,
      });
    }
    event.preventDefault();
  },

  _onAutocomplete() {
    this.cardsList.view = new AddrBookDataAdapter(
      this.cardsList.view.directory,
      this.getQuery(),
      this.searchInput.value,
      this.cardsList.view.sortColumn,
      this.cardsList.view.sortDirection
    );
    this._updatePlaceholder();
    detailsPane.displayCards();
  },

  _onCommand(event) {
    switch (event.target.id) {
      case "sortContextTableLayout":
        this.toggleLayout(event.target.getAttribute("checked") === "true");
        break;
      case "cardContextWrite":
        this.writeToSelected();
        return;
      case "cardContextEdit":
        detailsPane.editCurrent();
        return;
      case "cardContextPrint":
        this.printSelected();
        return;
      case "cardContextExport":
        this.exportSelected();
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
      const [column, direction] = event.target.value.split(" ");
      this.sortRows(column, direction);
    }
  },

  _onClick(event) {
    if (event.target.closest("button") == this.displayButton) {
      this.sortContext.openPopup(this.displayButton, { triggerEvent: event });
      event.preventDefault();
    }
  },

  _onSelect() {
    detailsPane.displayCards(this.selectedCards);
  },

  _onKeyDown(event) {
    if (event.altKey || event.shiftKey) {
      return;
    }

    let modifier = event.ctrlKey;
    let antiModifier = event.metaKey;
    if (AppConstants.platform == "macosx") {
      [modifier, antiModifier] = [antiModifier, modifier];
    }
    if (antiModifier) {
      return;
    }

    switch (event.key) {
      case "a":
        if (modifier) {
          this.cardsList.view.selection.selectAll();
          this.cardsList.dispatchEvent(new CustomEvent("select"));
          event.preventDefault();
        }
        break;
      case "Delete":
        if (!modifier) {
          this.deleteSelected();
          event.preventDefault();
        }
        break;
      case "Enter":
        if (!modifier) {
          if (this.cardsList.currentIndex >= 0) {
            this._activateRow(this.cardsList.currentIndex);
          }
          event.preventDefault();
        }
        break;
    }
  },

  _onDoubleClick(event) {
    if (
      event.button != 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const row = event.target.closest(
      `tr[is="ab-card-row"], tr[is="ab-table-card-row"]`
    );
    if (row) {
      this._activateRow(row.index);
    }
    event.preventDefault();
  },

  /**
   * "Activate" the row by opening the corresponding card for editing. This will
   * necessarily change the selection to the given index.
   *
   * @param {number} index - The index of the row to activate.
   */
  _activateRow(index) {
    if (detailsPane.isEditing) {
      return;
    }
    // Change selection to just the target.
    this.cardsList.selectedIndex = index;
    // We expect the selection to change the detailsPane immediately.
    detailsPane.editCurrent();
  },

  _onDragStart(event) {
    function makeMimeAddressFromCard(card) {
      if (!card) {
        return "";
      }

      let email;
      if (card.isMailList) {
        const directory = MailServices.ab.getDirectory(card.mailListURI);
        email = directory.description || card.displayName;
      } else {
        email = card.emailAddresses[0];
      }
      if (!email) {
        return "";
      }
      return MailServices.headerParser.makeMimeAddress(card.displayName, email);
    }

    const row = event.target.closest(
      `tr[is="ab-card-row"], tr[is="ab-table-card-row"]`
    );
    if (!row) {
      event.preventDefault();
      return;
    }

    let indices = this.cardsList.selectedIndices;
    if (!indices.includes(row.index)) {
      indices = [row.index];
    }
    const cards = indices.map(index =>
      this.cardsList.view.getCardFromRow(index)
    );

    // When dragging cards to the filesystem:
    // - Windows fetches application/x-moz-file-promise-url and writes it to
    //     a file.
    // - Linux uses the flavor data provider, if a single card is dragged.
    //     If multiple cards are dragged AND text/x-moz-url exists, it fetches
    //     application/x-moz-file-promise-url and writes it to a file.
    // - MacOS always uses the flavor data provider.

    const addresses = cards.map(makeMimeAddressFromCard).join(",");
    event.dataTransfer.mozSetDataAt("moz/abcard-array", cards, 0);
    event.dataTransfer.setData("text/x-moz-address", addresses);
    event.dataTransfer.setData("text/plain", addresses);

    let transferIndex = 0;
    for (const card of cards) {
      if (!card?.displayName || card.isMailList) {
        continue;
      }
      try {
        // A card implementation may throw NS_ERROR_NOT_IMPLEMENTED.
        // Don't break drag-and-drop if that happens.
        const vCard = card.toVCard();

        // This is a huge hack. text/x-moz-url must be present or Linux won't
        // attempt to drag to the filesystem. It doesn't actually _use_ this
        // value, instead it fetches application/x-moz-file-promise-url.
        event.dataTransfer.mozSetDataAt(
          "text/x-moz-url",
          URL.createObjectURL(new Blob([vCard])),
          transferIndex
        );
        event.dataTransfer.mozSetDataAt("text/vcard", vCard, transferIndex);
        event.dataTransfer.mozSetDataAt(
          "application/x-moz-file-promise-dest-filename",
          `${card.displayName}.vcf`.replace(/(.{74}).*(.{10})$/u, "$1...$2"),
          transferIndex
        );
        event.dataTransfer.mozSetDataAt(
          "application/x-moz-file-promise-url",
          "data:text/vcard," + encodeURIComponent(vCard),
          transferIndex
        );
        event.dataTransfer.mozSetDataAt(
          "application/x-moz-file-promise",
          this._flavorDataProvider,
          transferIndex
        );
        transferIndex++;
      } catch (ex) {
        console.error(ex);
      }
    }

    event.dataTransfer.effectAllowed = "all";
    const bcr = row.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      row,
      event.clientX - bcr.x,
      event.clientY - bcr.y
    );
  },

  _flavorDataProvider: {
    QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

    getFlavorData(transferable, flavor, data) {
      if (flavor == "application/x-moz-file-promise") {
        const primitive = {};
        transferable.getTransferData("text/vcard", primitive);
        const vCard = primitive.value.QueryInterface(Ci.nsISupportsString).data;
        transferable.getTransferData(
          "application/x-moz-file-promise-dest-filename",
          primitive
        );
        const leafName = primitive.value.QueryInterface(
          Ci.nsISupportsString
        ).data;
        transferable.getTransferData(
          "application/x-moz-file-promise-dir",
          primitive
        );
        const localFile = primitive.value.QueryInterface(Ci.nsIFile).clone();
        localFile.append(leafName);

        const ofStream = Cc[
          "@mozilla.org/network/file-output-stream;1"
        ].createInstance(Ci.nsIFileOutputStream);
        ofStream.init(localFile, -1, -1, 0);
        const converter = Cc[
          "@mozilla.org/intl/converter-output-stream;1"
        ].createInstance(Ci.nsIConverterOutputStream);
        converter.init(ofStream, null);
        converter.writeString(vCard);
        converter.close();

        data.value = localFile;
      }
    },
  },
};

/**
 * Object holding the contact view pane to show all vcard info and handle data
 * changes and mutations between the view and edit state of a contact.
 */
var detailsPane = {
  currentCard: null,

  dirtyFields: new Set(),

  _notifications: [
    "addrbook-contact-created",
    "addrbook-contact-updated",
    "addrbook-contact-deleted",
    "addrbook-list-updated",
    "addrbook-list-deleted",
    "addrbook-list-member-removed",
  ],

  init() {
    const booksSplitter = document.getElementById("booksSplitter");
    const booksSplitterWidth = XULStoreUtils.getValue(
      "addressBook",
      "booksSplitter",
      "width"
    );
    if (booksSplitterWidth) {
      booksSplitter.width = booksSplitterWidth;
    }
    booksSplitter.addEventListener("splitter-resized", () =>
      XULStoreUtils.setValue(
        "addressBook",
        "booksSplitter",
        "width",
        booksSplitter.width
      )
    );

    const isTableLayout = document.body.classList.contains("layout-table");
    updateSharedSplitter(isTableLayout);

    this.splitter = document.getElementById("sharedSplitter");
    const sharedSplitterWidth = XULStoreUtils.getValue(
      "addressBook",
      "sharedSplitter",
      "width"
    );
    if (sharedSplitterWidth) {
      this.splitter.width = sharedSplitterWidth;
    }
    const sharedSplitterHeight = XULStoreUtils.getValue(
      "addressBook",
      "sharedSplitter",
      "height"
    );
    if (sharedSplitterHeight) {
      this.splitter.height = sharedSplitterHeight;
    }
    this.splitter.addEventListener("splitter-resized", () => {
      if (isTableLayout) {
        XULStoreUtils.setValue(
          "addressBook",
          "sharedSplitter",
          "height",
          this.splitter.height
        );
        return;
      }
      XULStoreUtils.setValue(
        "addressBook",
        "sharedSplitter",
        "width",
        this.splitter.width
      );
    });

    this.node = document.getElementById("detailsPane");
    this.actions = document.getElementById("detailsActions");
    this.writeButton = document.getElementById("detailsWriteButton");
    this.eventButton = document.getElementById("detailsEventButton");
    this.searchButton = document.getElementById("detailsSearchButton");
    this.newListButton = document.getElementById("detailsNewListButton");
    this.editButton = document.getElementById("editButton");
    this.selectedCardsSection = document.getElementById("selectedCards");
    this.form = document.getElementById("editContactForm");
    this.vCardEdit = this.form.querySelector("vcard-edit");
    this.deleteButton = document.getElementById("detailsDeleteButton");
    this.addContactBookList = document.getElementById("addContactBookList");
    this.cancelEditButton = document.getElementById("cancelEditButton");
    this.saveEditButton = document.getElementById("saveEditButton");

    this.actions.addEventListener("click", this);
    document.getElementById("detailsFooter").addEventListener("click", this);

    const photoImage = document.getElementById("viewContactPhoto");
    photoImage.addEventListener("error", () => {
      if (!detailsPane.currentCard) {
        return;
      }

      const vCard = detailsPane.currentCard.getProperty("_vCard", "");
      const match = /^PHOTO.*/im.exec(vCard);
      if (match) {
        console.warn(
          `Broken contact photo, vCard data starts with: ${match[0]}`
        );
      } else {
        console.warn(`Broken contact photo, source is: ${photoImage.src}`);
      }
    });

    this.form.addEventListener("input", event => {
      const { type, checked, value, _originalValue } = event.target;
      let changed;
      if (type == "checkbox") {
        changed = checked != _originalValue;
      } else {
        changed = value != _originalValue;
      }
      if (changed) {
        this.dirtyFields.add(event.target);
      } else {
        this.dirtyFields.delete(event.target);
      }

      // If there are no dirty fields, clear the flag, otherwise set it.
      this.isDirty = this.dirtyFields.size > 0;
    });
    this.form.addEventListener("keydown", event => {
      // Prevent scrolling of the html tag when space is used on a button or
      // checkbox.
      if (
        event.key == " " &&
        ["button", "checkbox"].includes(document.activeElement.type)
      ) {
        event.preventDefault();
      }

      if (event.key != "Escape") {
        return;
      }

      event.preventDefault();
      this.form.reset();
    });
    this.form.addEventListener("reset", async event => {
      event.preventDefault();
      if (this.isDirty) {
        const [title, message] = await document.l10n.formatValues([
          { id: `about-addressbook-unsaved-changes-prompt-title` },
          { id: `about-addressbook-unsaved-changes-prompt` },
        ]);

        const buttonPressed = Services.prompt.confirmEx(
          window,
          title,
          message,
          Ci.nsIPrompt.BUTTON_TITLE_SAVE * Ci.nsIPrompt.BUTTON_POS_0 +
            Ci.nsIPrompt.BUTTON_TITLE_CANCEL * Ci.nsIPrompt.BUTTON_POS_1 +
            Ci.nsIPrompt.BUTTON_TITLE_DONT_SAVE * Ci.nsIPrompt.BUTTON_POS_2,
          null,
          null,
          null,
          null,
          {}
        );
        if (buttonPressed === 0) {
          // Don't call this.form.submit, the submit event won't fire.
          this.validateBeforeSaving();
          return;
        } else if (buttonPressed === 1) {
          return;
        }
      }
      this.isEditing = false;
      if (this.currentCard) {
        // Refresh the card from the book to get exactly what was saved.
        const book = MailServices.ab.getDirectoryFromUID(
          this.currentCard.directoryUID
        );
        const card = book.childCards.find(c => c.UID == this.currentCard.UID);
        this.displayContact(card);
        if (this._focusOnCardsList) {
          cardsPane.cardsList.table.body.focus();
        } else {
          this.editButton.focus();
        }
      } else {
        this.displayCards(cardsPane.selectedCards);
        if (this._focusOnCardsList) {
          cardsPane.cardsList.table.body.focus();
        } else {
          cardsPane.searchInput.focus();
        }
      }
    });
    this.form.addEventListener("submit", event => {
      event.preventDefault();
      this.validateBeforeSaving();
    });

    this.photoInput = document.getElementById("photoInput");
    // NOTE: We put the paste handler on the button parent because the
    // html:button will not be targeted by the paste event.
    this.photoInput.addEventListener("paste", photoDialog);
    this.photoInput.addEventListener("dragover", photoDialog);
    this.photoInput.addEventListener("drop", photoDialog);

    const photoButton = document.getElementById("photoButton");
    photoButton.addEventListener("click", () => {
      if (this._photoDetails.sourceURL) {
        photoDialog.showWithURL(
          this._photoDetails.sourceURL,
          this._photoDetails.cropRect,
          true
        );
      } else {
        photoDialog.showEmpty();
      }
    });

    this.cancelEditButton.addEventListener("keypress", event => {
      // Prevent scrolling of the html tag when space is used on this button.
      if (event.key == " ") {
        event.preventDefault();
      }
    });
    this.saveEditButton.addEventListener("keypress", event => {
      // Prevent scrolling of the html tag when space is used on this button.
      if (event.key == " ") {
        event.preventDefault();
      }
    });

    for (const topic of this._notifications) {
      Services.obs.addObserver(this, topic);
    }
  },

  uninit() {
    for (const topic of this._notifications) {
      Services.obs.removeObserver(this, topic);
    }
  },

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this._onClick(event);
        break;
    }
  },

  async observe(subject, topic, data) {
    const hadFocus =
      this.node.contains(document.activeElement) ||
      document.activeElement == document.body;

    switch (topic) {
      case "addrbook-contact-created":
        subject.QueryInterface(Ci.nsIAbCard);
        updateAddressBookCount();
        if (
          !this.currentCard ||
          this.currentCard.directoryUID != data ||
          this.currentCard.UID != subject.getProperty("_originalUID", "")
        ) {
          break;
        }

        // The card being displayed had its UID changed by the server. Select
        // the new card to display it. (If we're already editing the new card
        // when the server responds, that's just tough luck.)
        this.isEditing = false;
        cardsPane.cardsList.selectedIndex =
          cardsPane.cardsList.view.getIndexForUID(subject.UID);
        break;
      case "addrbook-contact-updated":
        subject.QueryInterface(Ci.nsIAbCard);
        if (
          !this.currentCard ||
          this.currentCard.directoryUID != data ||
          !this.currentCard.equals(subject)
        ) {
          break;
        }

        // If there's editing in progress, we could attempt to update the
        // editing interface with the changes, which is difficult, or alert
        // the user. For now, changes will be overwritten if the edit is saved.

        if (!this.isEditing) {
          this.displayContact(subject);
        }
        break;
      case "addrbook-contact-deleted":
      case "addrbook-list-member-removed": {
        subject.QueryInterface(Ci.nsIAbCard);
        updateAddressBookCount();

        const directoryUID =
          topic == "addrbook-contact-deleted"
            ? this.currentCard?.directoryUID
            : cardsPane.cardsList.view.directory?.UID;
        if (directoryUID == data && this.currentCard?.equals(subject)) {
          // The card being displayed was deleted.
          this.isEditing = false;
          this.displayCards();

          if (hadFocus) {
            // Ensure this happens *after* the view handles this notification.
            Services.tm.dispatchToMainThread(() => {
              if (cardsPane.cardsList.view.rowCount == 0) {
                cardsPane.searchInput.focus();
              } else {
                cardsPane.cardsList.table.body.focus();
              }
            });
          }
        } else if (!this.selectedCardsSection.hidden) {
          for (const li of this.selectedCardsSection.querySelectorAll("li")) {
            if (li._card.equals(subject)) {
              // A selected card was deleted.
              this.displayCards(cardsPane.selectedCards);
              break;
            }
          }
        }
        break;
      }
      case "addrbook-list-updated":
        subject.QueryInterface(Ci.nsIAbDirectory);
        if (this.currentList && this.currentList.mailListURI == subject.URI) {
          this.displayList(this.currentList);
        }
        break;
      case "addrbook-list-deleted":
        subject.QueryInterface(Ci.nsIAbDirectory);
        if (this.currentList && this.currentList.mailListURI == subject.URI) {
          // The list being displayed was deleted.
          this.displayCards();

          if (hadFocus) {
            if (cardsPane.cardsList.view.rowCount == 0) {
              cardsPane.searchInput.focus();
            } else {
              cardsPane.cardsList.table.body.focus();
            }
          }
        } else if (!this.selectedCardsSection.hidden) {
          for (const li of this.selectedCardsSection.querySelectorAll("li")) {
            if (
              li._card.directoryUID == data &&
              li._card.mailListURI == subject.URI
            ) {
              // A selected list was deleted.
              this.displayCards(cardsPane.selectedCards);
              break;
            }
          }
        }
        break;
    }
  },

  /**
   * Is a card being edited?
   *
   * @type {boolean}
   */
  get isEditing() {
    return document.body.classList.contains("is-editing");
  },

  set isEditing(editing) {
    if (editing == this.isEditing) {
      return;
    }

    document.body.classList.toggle("is-editing", editing);
    updateAbCommands();

    // Remove these elements from (or add them back to) the tab focus cycle.
    for (const id of ["booksPane", "cardsPane"]) {
      document.getElementById(id).inert = editing;
    }

    if (editing) {
      this.addContactBookList.hidden = !!this.currentCard;
      this.addContactBookList.previousElementSibling.hidden =
        !!this.currentCard;

      const book = booksList
        .getRowAtIndex(booksList.selectedIndex)
        .closest(".bookRow")._book;
      if (book) {
        // TODO: convert this to UID.
        this.addContactBookList.value = book.URI;
      }
    } else {
      this.isDirty = false;
    }
  },

  /**
   * If a card is being edited, has any field changed?
   *
   * @type {boolean}
   */
  get isDirty() {
    return this.isEditing && document.body.classList.contains("is-dirty");
  },

  set isDirty(dirty) {
    if (!dirty) {
      this.dirtyFields.clear();
    }
    document.body.classList.toggle("is-dirty", this.isEditing && dirty);
  },

  clearDisplay() {
    this.currentCard = null;
    this.currentList = null;

    for (const section of document.querySelectorAll(
      "#viewContact :is(.contact-header, .list-header, .selection-header), #detailsBody > section"
    )) {
      section.hidden = true;
    }
  },

  displayCards(cards = []) {
    if (this.isEditing) {
      return;
    }

    this.clearDisplay();

    if (cards.length == 0) {
      this.node.hidden = true;
      this.splitter.isCollapsed =
        document.body.classList.contains("layout-table");
      return;
    }
    if (cards.length == 1) {
      if (cards[0].isMailList) {
        this.displayList(cards[0]);
      } else {
        this.displayContact(cards[0]);
      }
      return;
    }

    const contacts = cards.filter(c => !c.isMailList);
    const contactsWithAddresses = contacts.filter(c => c.primaryEmail);
    const lists = cards.filter(c => c.isMailList);

    document.querySelector("#viewContact .selection-header").hidden = false;
    let headerString;
    if (contacts.length) {
      if (lists.length) {
        headerString = "about-addressbook-selection-mixed-header2";
      } else {
        headerString = "about-addressbook-selection-contacts-header2";
      }
    } else {
      headerString = "about-addressbook-selection-lists-header2";
    }
    document.l10n.setAttributes(
      document.getElementById("viewSelectionCount"),
      headerString,
      { count: cards.length }
    );

    this.writeButton.hidden = contactsWithAddresses.length + lists.length == 0;
    this.eventButton.hidden =
      !contactsWithAddresses.length ||
      !cal.manager
        .getCalendars()
        .filter(cal.acl.isCalendarWritable)
        .filter(cal.acl.userCanAddItemsToCalendar).length;
    this.searchButton.hidden = true;
    this.newListButton.hidden = contactsWithAddresses.length == 0;
    this.editButton.hidden = true;

    this.actions.hidden = this.writeButton.hidden;

    const list = this.selectedCardsSection.querySelector("ul");
    list.replaceChildren();
    const template =
      document.getElementById("selectedCard").content.firstElementChild;
    for (const card of cards) {
      const li = list.appendChild(template.cloneNode(true));
      li._card = card;
      const avatar = li.querySelector("contact-avatar");
      const name = li.querySelector(".name");
      const address = li.querySelector(".address");

      if (!card.isMailList) {
        name.textContent = card.generateName(AddrBookDataAdapter.nameFormat);
        address.textContent = card.primaryEmail;
      } else {
        name.textContent = card.displayName;
      }
      avatar.setData({ card });
    }
    this.selectedCardsSection.hidden = false;

    this.node.hidden = this.splitter.isCollapsed = false;
    document.getElementById("viewContact").scrollTo(0, 0);
  },

  /**
   * Show a read-only representation of a card in the details pane.
   *
   * @param {nsIAbCard?} card - The card to display. This should not be a
   *   mailing list card. Pass null to hide the details pane.
   */
  displayContact(card) {
    if (this.isEditing) {
      return;
    }

    this.clearDisplay();
    if (!card || card.isMailList) {
      return;
    }
    this.currentCard = card;

    this.fillContactDetails(document.getElementById("viewContact"), card);
    document.getElementById("viewContactPhoto").hidden = document.querySelector(
      "#viewContact .contact-headings"
    ).hidden = false;
    document.querySelector("#viewContact .contact-header").hidden = false;

    this.writeButton.hidden = this.searchButton.hidden = !card.primaryEmail;
    this.eventButton.hidden =
      !card.primaryEmail ||
      !cal.manager
        .getCalendars()
        .filter(cal.acl.isCalendarWritable)
        .filter(cal.acl.userCanAddItemsToCalendar).length;
    this.newListButton.hidden = true;

    const book = MailServices.ab.getDirectoryFromUID(card.directoryUID);
    this.editButton.hidden = book.readOnly;
    this.actions.hidden = this.writeButton.hidden && this.editButton.hidden;

    this.isEditing = false;
    this.node.hidden = this.splitter.isCollapsed = false;
    document.getElementById("viewContact").scrollTo(0, 0);
  },

  /**
   * Sanitize the link if linkifying is not desired (based on href value).
   *
   * @param {HTMLAnchorElement} anchor
   * @returns {HTMLAnchorElement|Text} sanitized anchor
   */
  _sanitizeHref(anchor) {
    if (!URL.canParse(anchor.href)) {
      return document.createTextNode(anchor.textContent);
    }
    const scheme = new URL(anchor.href).protocol.slice(0, -1);
    // Of all our exposed protocols, only allow linking to a few select.
    if (/^(mailto|http?s|s?news|nntp)$/.test(scheme)) {
      return anchor;
    }
    const externalProtoclService = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService);
    if (externalProtoclService.isExposedProtocol(scheme)) {
      // No business linking to e.g. data:, about:, imap:
      return document.createTextNode(anchor.textContent);
    }
    return anchor;
  },

  /**
   * Set all the values for displaying a contact.
   *
   * @param {HTMLElement} element - The element to fill, either the on-screen
   *   contact display or a clone of the printing template.
   * @param {nsIAbCard} card - The card to display. This should not be a
   *   mailing list card.
   */
  fillContactDetails(element, card) {
    const vCardProperties = card.supportsVCard
      ? card.vCardProperties
      : VCardProperties.fromPropertyMap(
          new Map(card.properties.map(p => [p.name, p.value]))
        );

    element.querySelector(".contact-photo").src =
      card.photoURL || "chrome://messenger/skin/icons/new/compact/user.svg";
    element.querySelector(".contact-heading-name").textContent =
      card.generateName(AddrBookDataAdapter.nameFormat);
    const nickname = element.querySelector(".contact-heading-nickname");
    const nicknameValue = vCardProperties.getFirstValue("nickname");
    nickname.hidden = !nicknameValue;
    nickname.textContent = nicknameValue;
    element.querySelector(".contact-heading-email").textContent =
      card.primaryEmail;

    const template = document.getElementById("entryItem");
    const createEntryItem = function (name) {
      const li = template.content.firstElementChild.cloneNode(true);
      if (name) {
        document.l10n.setAttributes(
          li.querySelector(".entry-type"),
          `about-addressbook-entry-name-${name}`
        );
      }
      return li;
    };
    const setEntryType = function (li, entry, allowed = ["work", "home"]) {
      if (!entry.params.type) {
        return;
      }
      const lowerTypes = Array.isArray(entry.params.type)
        ? entry.params.type.map(t => t.toLowerCase())
        : [entry.params.type.toLowerCase()];
      const lowerType = lowerTypes.find(t => allowed.includes(t));
      if (!lowerType) {
        return;
      }

      document.l10n.setAttributes(
        li.querySelector(".entry-type"),
        `about-addressbook-entry-type-${lowerType}`
      );
    };

    let section = element.querySelector(".details-email-addresses");
    let list = section.querySelector("ul.entry-list");
    list.replaceChildren();
    for (const entry of vCardProperties.getAllEntries("email")) {
      const li = list.appendChild(createEntryItem());
      setEntryType(li, entry);
      const addr = MailServices.headerParser.makeMimeAddress(
        card.displayName,
        entry.value
      );
      const a = document.createElement("a");
      a.href = "mailto:" + encodeURIComponent(addr);
      a.textContent = entry.value;
      li.querySelector(".entry-value").appendChild(a);
    }
    section.hidden = list.childElementCount == 0;

    section = element.querySelector(".details-phone-numbers");
    list = section.querySelector("ul.entry-list");
    list.replaceChildren();
    for (const entry of vCardProperties.getAllEntries("tel")) {
      const li = list.appendChild(createEntryItem());
      setEntryType(li, entry, ["work", "home", "fax", "cell", "pager"]);
      const a = document.createElement("a");
      // Handle tel: uri, some other scheme, or plain text number.
      const number = entry.value.replace(/^[a-z\+]{3,}:/, "");
      const scheme = entry.value.split(/([a-z\+]{3,}):/)[1] || "tel";
      a.href = `${scheme}:${number.replaceAll(/[^\d\+]/g, "")}`;
      a.textContent = number;
      li.querySelector(".entry-value").appendChild(this._sanitizeHref(a));
    }
    section.hidden = list.childElementCount == 0;

    section = element.querySelector(".details-addresses");
    list = section.querySelector("ul.entry-list");
    list.replaceChildren();
    for (const entry of vCardProperties.getAllEntries("adr")) {
      const parts = entry.value.flat();
      // Put extended address after street address.
      parts[2] = parts.splice(1, 1, parts[2])[0];

      const li = list.appendChild(createEntryItem());
      setEntryType(li, entry);
      const span = li.querySelector(".entry-value");
      for (const part of parts.filter(Boolean)) {
        if (span.firstChild) {
          span.appendChild(document.createElement("br"));
        }
        span.appendChild(document.createTextNode(part));
      }
    }
    section.hidden = list.childElementCount == 0;

    section = element.querySelector(".details-notes");
    const note = vCardProperties.getFirstValue("note");
    if (note) {
      section.querySelector("div").textContent = note;
      section.hidden = false;
    } else {
      section.hidden = true;
    }

    section = element.querySelector(".details-websites");
    list = section.querySelector("ul.entry-list");
    list.replaceChildren();

    for (const entry of vCardProperties.getAllEntries("url")) {
      const value = entry.value;
      if (!URL.canParse(value)) {
        continue;
      }

      const li = list.appendChild(createEntryItem());
      setEntryType(li, entry);
      const a = document.createElement("a");
      a.href = value;
      const url = new URL(value);
      a.textContent =
        url.pathname == "/" && !url.search
          ? url.host
          : `${url.host}${url.pathname}${url.search}`;
      li.querySelector(".entry-value").appendChild(this._sanitizeHref(a));
    }
    section.hidden = list.childElementCount == 0;

    section = element.querySelector(".details-instant-messaging");
    list = section.querySelector("ul.entry-list");
    list.replaceChildren();

    this._screenNamesToIMPPs(card);
    for (const entry of vCardProperties.getAllEntries("impp")) {
      const li = list.appendChild(createEntryItem());
      let url;
      try {
        url = new URL(entry.value);
      } catch (e) {
        li.querySelector(".entry-value").textContent = entry.value;
        continue;
      }
      const a = document.createElement("a");
      a.href = entry.value;
      a.target = "_blank";
      a.textContent = url.toString();
      li.querySelector(".entry-value").append(this._sanitizeHref(a));
    }
    section.hidden = list.childElementCount == 0;

    section = element.querySelector(".details-other-info");
    list = section.querySelector("ul.entry-list");
    list.replaceChildren();

    const formatDate = function (date) {
      try {
        date = ICAL.VCardTime.fromDateAndOrTimeString(date);
      } catch (ex) {
        console.error(ex);
        return "";
      }
      if (date.year && date.month && date.day) {
        return new Services.intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(new Date(date.year, date.month - 1, date.day));
      }
      if (date.year && date.month) {
        return new Services.intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "long",
        }).format(new Date(date.year, date.month - 1, 1));
      }
      if (date.year) {
        return date.year;
      }
      if (date.month && date.day) {
        return new Services.intl.DateTimeFormat(undefined, {
          month: "long",
          day: "numeric",
        }).format(new Date(2024, date.month - 1, date.day));
      }
      if (date.month) {
        return new Services.intl.DateTimeFormat(undefined, {
          month: "long",
        }).format(new Date(2024, date.month - 1, 1));
      }
      if (date.day) {
        return date.day;
      }
      return "";
    };

    const bday = vCardProperties.getFirstValue("bday");
    if (bday) {
      const value = formatDate(bday);
      if (value) {
        const li = list.appendChild(createEntryItem("birthday"));
        li.querySelector(".entry-value").textContent = value;
      }
    }

    const anniversary = vCardProperties.getFirstValue("anniversary");
    if (anniversary) {
      const value = formatDate(anniversary);
      if (value) {
        const li = list.appendChild(createEntryItem("anniversary"));
        li.querySelector(".entry-value").textContent = value;
      }
    }

    const title = vCardProperties.getFirstValue("title");
    if (title) {
      const li = list.appendChild(createEntryItem("title"));
      li.querySelector(".entry-value").textContent = title;
    }

    const role = vCardProperties.getFirstValue("role");
    if (role) {
      const li = list.appendChild(createEntryItem("role"));
      li.querySelector(".entry-value").textContent = role;
    }

    const org = vCardProperties.getFirstValue("org");
    if (Array.isArray(org)) {
      const li = list.appendChild(createEntryItem("organization"));
      const span = li.querySelector(".entry-value");
      for (const part of org.filter(Boolean).reverse()) {
        if (span.firstChild) {
          span.append(" • ");
        }
        span.appendChild(document.createTextNode(part));
      }
    } else if (org) {
      const li = list.appendChild(createEntryItem("organization"));
      li.querySelector(".entry-value").textContent = org;
    }

    const tz = vCardProperties.getFirstValue("tz");
    if (tz) {
      const li = list.appendChild(createEntryItem("time-zone"));
      try {
        li.querySelector(".entry-value").textContent =
          cal.timezoneService.getTimezone(tz).displayName;
      } catch {
        li.querySelector(".entry-value").textContent = tz;
      }
      li.querySelector(".entry-value").appendChild(
        document.createElement("br")
      );

      const time = document.createElement("span", { is: "active-time" });
      time.setAttribute("tz", tz);
      li.querySelector(".entry-value").appendChild(time);
    }

    for (const key of ["custom1", "custom2", "custom3", "custom4"]) {
      const value = vCardProperties.getFirstValue(`x-${key}`);
      if (value) {
        const li = list.appendChild(createEntryItem(key));
        li.querySelector(".entry-type").style.setProperty(
          "white-space",
          "nowrap"
        );
        li.querySelector(".entry-value").textContent = value;
      }
    }

    section.hidden = list.childElementCount == 0;
  },

  /**
   * Show this given contact photo in the edit form.
   *
   * @param {?string} url - The URL of the photo to display, or null to
   *   display none.
   */
  showEditPhoto(url) {
    this.photoInput.querySelector(".contact-photo").src =
      url || "chrome://messenger/skin/icons/new/compact/user.svg";
  },

  /**
   * Store the given photo details to save later, and display the photo in the
   * edit form.
   *
   * @param {?object} details - The photo details to save, or null to remove the
   *   photo.
   * @param {Blob} details.blob - The image blob of the photo to save.
   * @param {string} details.sourceURL - The image basis of the photo, before
   *   cropping.
   * @param {DOMRect} details.cropRect - The cropping rectangle for the photo.
   */
  setPhoto(details) {
    this._photoChanged = true;
    this._photoDetails = details || {};
    this.showEditPhoto(
      details?.blob ? URL.createObjectURL(details.blob) : null
    );
    this.dirtyFields.add(this.photoInput);
    this.isDirty = true;
  },

  /**
   * Show controls for editing a new card.
   *
   * @param {?string} vCard - A vCard containing properties for the new card.
   */
  async editNewContact(vCard) {
    this.currentCard = null;
    this.editCurrentContact(vCard);
    if (!vCard) {
      this.vCardEdit.contactNameHeading.textContent =
        await document.l10n.formatValue("about-addressbook-new-contact-header");
    }
  },

  /**
   * Takes old nsIAbCard chat names and put them on the card as IMPP URIs.
   *
   * @param {nsIAbCard?} card - The card to change.
   */
  _screenNamesToIMPPs(card) {
    if (!card.supportsVCard) {
      return;
    }

    const existingIMPPValues = card.vCardProperties.getAllValues("impp");
    for (const key of [
      "_GoogleTalk",
      "_AimScreenName",
      "_Yahoo",
      "_Skype",
      "_QQ",
      "_MSN",
      "_ICQ",
      "_JabberId",
      "_IRC",
    ]) {
      let value = card.getProperty(key, "");
      if (!value) {
        continue;
      }
      switch (key) {
        case "_GoogleTalk":
          value = `gtalk:chat?jid=${value}`;
          break;
        case "_AimScreenName":
          value = `aim:goim?screenname=${value}`;
          break;
        case "_Yahoo":
          value = `ymsgr:sendIM?${value}`;
          break;
        case "_Skype":
          value = `skype:${value}`;
          break;
        case "_QQ":
          value = `mqq://${value}`;
          break;
        case "_MSN":
          value = `msnim:chat?contact=${value}`;
          break;
        case "_ICQ":
          value = `icq:message?uin=${value}`;
          break;
        case "_JabberId":
          value = `xmpp:${value}`;
          break;
        case "_IRC": {
          // Guess host, in case we have an irc account configured.
          const host =
            IMServices.accounts
              .getAccounts()
              .find(a => a.protocol.normalizedName == "irc")
              ?.name.split("@", 2)[1] || "irc.example.org";
          value = `ircs://${host}/${value},isuser`;
          break;
        }
      }
      if (!existingIMPPValues.includes(value)) {
        card.vCardProperties.addEntry(
          new VCardPropertyEntry(`impp`, {}, "uri", value)
        );
      }
    }
  },

  /**
   * Show controls for editing the currently displayed card.
   *
   * @param {?string} vCard - A vCard containing properties for a new card.
   */
  editCurrentContact(vCard) {
    let card = this.currentCard;
    this.deleteButton.hidden = !card;
    if (card && card.supportsVCard) {
      this._screenNamesToIMPPs(card);
      this.vCardEdit.vCardProperties = card.vCardProperties;
    } else {
      this.vCardEdit.vCardString = vCard ?? "";
      card = new AddrBookCard();
      card.setProperty("_vCard", vCard);
    }

    this.showEditPhoto(card?.photoURL);
    this._photoDetails = { sourceURL: card?.photoURL };
    this._photoChanged = false;
    this.isEditing = true;
    this.node.hidden = this.splitter.isCollapsed = false;
    this.form.querySelector(".contact-details-scroll").scrollTo(0, 0);
    // If we enter editing directly from the cards list we want to return to it
    // once we are done.
    this._focusOnCardsList =
      document.activeElement == cardsPane.cardsList.table.body;
    this.vCardEdit.setFocus();
  },

  /**
   * Edit the currently displayed contact or list.
   */
  editCurrent() {
    // The editButton is disabled if the book is readOnly.
    if (this.editButton.hidden) {
      return;
    }
    if (this.currentCard) {
      this.editCurrentContact();
    } else if (this.currentList) {
      SubDialog.open(
        "chrome://messenger/content/addressbook/abMailListDialog.xhtml",
        { features: "resizable=no", closedCallback: updateAbCommands },
        { listURI: this.currentList.mailListURI }
      );
    }
  },

  /**
   * Properly handle a failed form validation.
   */
  handleInvalidForm() {
    // FIXME: Drop this in favor of an inline notification with fluent strings.
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );
    Services.prompt.alert(
      window,
      bundle.GetStringFromName("cardRequiredDataMissingTitle"),
      bundle.GetStringFromName("cardRequiredDataMissingMessage")
    );
  },

  /**
   * Make sure the data is valid before saving the contact.
   */
  validateBeforeSaving() {
    // Make sure the minimum required data is present.
    if (!this.vCardEdit.checkMinimumRequirements()) {
      this.handleInvalidForm();
      return;
    }

    // Make sure the dates are filled properly.
    if (!this.vCardEdit.validateDates()) {
      // Simply return as the validateDates() will handle focus and visual cue.
      return;
    }

    // Extra validation for any form field that has validatity requirements
    // set on them (through pattern etc.).
    if (!this.form.checkValidity()) {
      this.form.querySelector("input:invalid").focus();
      return;
    }

    this.saveCurrentContact();
  },

  /**
   * Save the currently displayed card.
   */
  async saveCurrentContact() {
    let card = this.currentCard;
    let book;

    if (card) {
      book = MailServices.ab.getDirectoryFromUID(card.directoryUID);
    } else {
      card = new AddrBookCard();

      // TODO: convert this to UID.
      book = MailServices.ab.getDirectory(this.addContactBookList.value);
      if (book.getBoolValue("carddav.vcard3", false)) {
        // This is a CardDAV book, and the server discards photos unless the
        // vCard 3 format is used. Since we know this is a new card, setting
        // the version here won't cause a problem.
        this.vCardEdit.vCardProperties.addValue("version", "3.0");
      }
    }
    if (!book || book.readOnly) {
      throw new Components.Exception(
        "Address book is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    // Tell vcard-edit to read the input fields. Setting the _vCard property
    // MUST happen before accessing `card.vCardProperties` or creating new
    // cards will fail.
    this.vCardEdit.saveVCard();
    card.setProperty("_vCard", this.vCardEdit.vCardString);

    // Old screen names should by now be on the vCard. Delete them.
    for (const key of [
      "_GoogleTalk",
      "_AimScreenName",
      "_Yahoo",
      "_Skype",
      "_QQ",
      "_MSN",
      "_ICQ",
      "_JabberId",
      "_IRC",
    ]) {
      card.deleteProperty(key);
    }

    // No photo or a new photo. Delete the old one.
    if (this._photoChanged) {
      const oldLeafName = card.getProperty("PhotoName", "");
      if (oldLeafName) {
        const oldPath = PathUtils.join(
          PathUtils.profileDir,
          "Photos",
          oldLeafName
        );
        await IOUtils.remove(oldPath);

        card.setProperty("PhotoName", "");
        card.setProperty("PhotoType", "");
        card.setProperty("PhotoURI", "");
      }
      if (card.supportsVCard) {
        for (const entry of card.vCardProperties.getAllEntries("photo")) {
          card.vCardProperties.removeEntry(entry);
        }
      }
    }

    // Save the new photo.
    if (this._photoChanged && this._photoDetails.blob) {
      if (book.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE) {
        const reader = new FileReader();
        await new Promise(resolve => {
          reader.onloadend = resolve;
          reader.readAsDataURL(this._photoDetails.blob);
        });
        if (card.vCardProperties.getFirstValue("version") == "4.0") {
          card.vCardProperties.addEntry(
            new VCardPropertyEntry("photo", {}, "uri", reader.result)
          );
        } else {
          card.vCardProperties.addEntry(
            new VCardPropertyEntry(
              "photo",
              { encoding: "B" },
              "binary",
              reader.result.substring(reader.result.indexOf(",") + 1)
            )
          );
        }
      } else {
        const leafName = `${AddrBookUtils.newUID()}.jpg`;
        const path = PathUtils.join(PathUtils.profileDir, "Photos", leafName);
        const buffer = await this._photoDetails.blob.arrayBuffer();
        await IOUtils.write(path, new Uint8Array(buffer));
        card.setProperty("PhotoName", leafName);
      }
    }
    this._photoChanged = false;
    this.isEditing = false;

    if (!card.directoryUID) {
      card = book.addCard(card);
      cardsPane.cardsList.selectedIndex =
        cardsPane.cardsList.view.getIndexForUID(card.UID);
      // The selection change will update the UI.
    } else {
      book.modifyCard(card);
      // The addrbook-contact-updated notification will update the UI.
    }

    if (this._focusOnCardsList) {
      cardsPane.cardsList.table.body.focus();
    } else {
      this.editButton.focus();
    }
  },

  /**
   * Delete the currently displayed card.
   */
  async deleteCurrentContact() {
    const card = this.currentCard;
    const book = MailServices.ab.getDirectoryFromUID(card.directoryUID);

    if (!book) {
      throw new Components.Exception(
        "Card doesn't have a book to delete from",
        Cr.NS_ERROR_FAILURE
      );
    }

    if (book.readOnly) {
      throw new Components.Exception(
        "Address book is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    const name = card.displayName;
    const [title, message] = await document.l10n.formatValues([
      {
        id: "about-addressbook-confirm-delete-contacts-title",
        args: { count: 1 },
      },
      {
        id: "about-addressbook-confirm-delete-contacts-single",
        args: { name },
      },
    ]);

    if (
      Services.prompt.confirmEx(
        window,
        title,
        message,
        Ci.nsIPromptService.STD_YES_NO_BUTTONS,
        null,
        null,
        null,
        null,
        {}
      ) === 0
    ) {
      // TODO: Setting the index should be unnecessary.
      const indexAfterDelete = cardsPane.cardsList.currentIndex;
      book.deleteCards([card]);
      cardsPane.cardsList.currentIndex = Math.min(
        indexAfterDelete,
        cardsPane.cardsList.view.rowCount - 1
      );
      // The addrbook-contact-deleted notification will update the details pane UI.
    }
  },

  displayList(listCard) {
    if (this.isEditing) {
      return;
    }

    this.clearDisplay();
    if (!listCard || !listCard.isMailList) {
      return;
    }
    this.currentList = listCard;

    const listDirectory = MailServices.ab.getDirectory(listCard.mailListURI);

    document.querySelector("#viewContact .list-header").hidden = false;
    document.querySelector("#viewContact .list-header > h1").textContent =
      `${listDirectory.dirName}`;

    const cards = Array.from(listDirectory.childCards, card => {
      return {
        name: card.generateName(AddrBookDataAdapter.nameFormat),
        email: card.primaryEmail,
        photoURL: card.photoURL,
      };
    });
    const { sortColumn, sortDirection } = cardsPane.cardsList.view;
    const key = sortColumn == "EmailAddresses" ? "email" : "name";
    const collator = new Intl.Collator(undefined, { numeric: true });
    cards.sort((a, b) => {
      if (sortDirection == "descending") {
        [b, a] = [a, b];
      }
      return collator.compare(a[key], b[key]);
    });

    const list = this.selectedCardsSection.querySelector("ul");
    list.replaceChildren();
    const template =
      document.getElementById("selectedCard").content.firstElementChild;
    for (const card of cards) {
      const li = list.appendChild(template.cloneNode(true));
      li._card = card;
      const avatar = li.querySelector("contact-avatar");
      const name = li.querySelector(".name");
      const address = li.querySelector(".address");
      avatar.setData({ card });
      name.textContent = card.name;
      address.textContent = card.email;
    }
    this.selectedCardsSection.hidden = list.childElementCount == 0;

    const book = MailServices.ab.getDirectoryFromUID(listCard.directoryUID);
    this.writeButton.hidden = list.childElementCount == 0;
    this.eventButton.hidden = this.writeButton.hidden;
    this.searchButton.hidden = true;
    this.newListButton.hidden = true;
    this.editButton.hidden = book.readOnly;

    this.actions.hidden = this.writeButton.hidden && this.editButton.hidden;

    this.node.hidden = this.splitter.isCollapsed = false;
    document.getElementById("viewContact").scrollTo(0, 0);
  },

  _onClick(event) {
    const selectedContacts = cardsPane.selectedCards.filter(
      card => !card.isMailList && card.primaryEmail
    );

    switch (event.target.id) {
      case "detailsWriteButton":
        cardsPane.writeToSelected();
        break;
      case "detailsEventButton": {
        let contacts;
        if (this.currentList) {
          const directory = MailServices.ab.getDirectory(
            this.currentList.mailListURI
          );
          contacts = directory.childCards;
        } else {
          contacts = selectedContacts;
        }
        const attendees = contacts.map(card => {
          const attendee = new CalAttendee();
          attendee.id = `mailto:${card.primaryEmail}`;
          attendee.commonName = card.displayName;
          return attendee;
        });
        if (attendees.length) {
          window.browsingContext.topChromeWindow.createEventWithDialog(
            null,
            null,
            null,
            null,
            null,
            false,
            attendees
          );
        }
        break;
      }
      case "detailsSearchButton":
        if (this.currentCard.primaryEmail) {
          const searchString = this.currentCard.emailAddresses.join(" ");
          window.browsingContext.topChromeWindow.tabmail.openTab("glodaFacet", {
            searcher: new GlodaMsgSearcher(null, searchString, false),
          });
        }
        break;
      case "detailsNewListButton":
        if (selectedContacts.length) {
          createList(selectedContacts);
        }
        break;
      case "editButton":
        this.editCurrent();
        break;
      case "detailsDeleteButton":
        this.deleteCurrentContact();
        break;
    }
  },
};

var photoDialog = {
  /**
   * The ratio of pixels in the source image to pixels in the preview.
   *
   * @type {number}
   */
  _scale: null,

  /**
   * The square to which the image will be cropped, in preview pixels.
   *
   * @type {DOMRect}
   */
  _cropRect: null,

  /**
   * The bounding rectangle of the image in the preview, in preview pixels.
   * Cached for efficiency.
   *
   * @type {DOMRect}
   */
  _previewRect: null,

  init() {
    this._dialog = document.getElementById("photoDialog");
    this._dialog.saveButton = this._dialog.querySelector(".accept");
    this._dialog.cancelButton = this._dialog.querySelector(".cancel");
    this._dialog.discardButton = this._dialog.querySelector(".extra1");

    this._dropTarget = this._dialog.querySelector("#photoDropTarget");
    this._svg = this._dialog.querySelector("svg");
    this._preview = this._svg.querySelector("image");
    this._cropMask = this._svg.querySelector("path");
    this._dragRect = this._svg.querySelector("rect");
    this._corners = this._svg.querySelectorAll("rect.corner");

    this._dialog.addEventListener("dragover", this);
    this._dialog.addEventListener("drop", this);
    this._dialog.addEventListener("paste", this);
    this._dropTarget.addEventListener("click", event => {
      if (event.button != 0) {
        return;
      }
      this._showFilePicker();
    });
    this._dropTarget.addEventListener("keydown", event => {
      if (event.key != " " && event.key != "Enter") {
        return;
      }
      this._showFilePicker();
    });

    class Mover {
      constructor(element) {
        element.addEventListener("mousedown", this);
      }

      handleEvent(event) {
        if (event.type == "mousedown") {
          if (event.buttons != 1) {
            return;
          }
          this.onMouseDown(event);
          window.addEventListener("mousemove", this);
          window.addEventListener("mouseup", this);
        } else if (event.type == "mousemove") {
          if (event.buttons != 1) {
            // The button was released and we didn't get a mouseup event, or the
            // button(s) pressed changed. Either way, stop dragging.
            this.onMouseUp();
            return;
          }
          this.onMouseMove(event);
        } else {
          this.onMouseUp(event);
        }
      }

      onMouseUp() {
        delete this._dragPosition;
        window.removeEventListener("mousemove", this);
        window.removeEventListener("mouseup", this);
      }
    }

    new (class extends Mover {
      onMouseDown(event) {
        this._dragPosition = {
          x: event.clientX - photoDialog._cropRect.x,
          y: event.clientY - photoDialog._cropRect.y,
        };
      }

      onMouseMove(event) {
        photoDialog._cropRect.x = Math.min(
          Math.max(0, event.clientX - this._dragPosition.x),
          photoDialog._previewRect.width - photoDialog._cropRect.width
        );
        photoDialog._cropRect.y = Math.min(
          Math.max(0, event.clientY - this._dragPosition.y),
          photoDialog._previewRect.height - photoDialog._cropRect.height
        );
        photoDialog._redrawCropRect();
      }
    })(this._dragRect);

    class CornerMover extends Mover {
      constructor(element, xEdge, yEdge) {
        super(element);
        this.xEdge = xEdge;
        this.yEdge = yEdge;
      }

      onMouseDown(event) {
        this._dragPosition = {
          x: event.clientX - photoDialog._cropRect[this.xEdge],
          y: event.clientY - photoDialog._cropRect[this.yEdge],
        };
      }

      onMouseMove(event) {
        const { width, height } = photoDialog._previewRect;
        const { top, right, bottom, left } = photoDialog._cropRect;
        let { x, y } = this._dragPosition;

        // New coordinates of the dragged corner, constrained to the image size.
        x = Math.max(0, Math.min(width, event.clientX - x));
        y = Math.max(0, Math.min(height, event.clientY - y));

        // New size based on the dragged corner and a minimum size of 80px.
        const newWidth = this.xEdge == "right" ? x - left : right - x;
        const newHeight = this.yEdge == "bottom" ? y - top : bottom - y;
        const newSize = Math.max(80, Math.min(newWidth, newHeight));

        photoDialog._cropRect.width = newSize;
        if (this.xEdge == "left") {
          photoDialog._cropRect.x = right - photoDialog._cropRect.width;
        }
        photoDialog._cropRect.height = newSize;
        if (this.yEdge == "top") {
          photoDialog._cropRect.y = bottom - photoDialog._cropRect.height;
        }
        photoDialog._redrawCropRect();
      }
    }

    new CornerMover(this._corners[0], "left", "top");
    new CornerMover(this._corners[1], "right", "top");
    new CornerMover(this._corners[2], "right", "bottom");
    new CornerMover(this._corners[3], "left", "bottom");

    this._dialog.saveButton.addEventListener("click", () => this._save());
    this._dialog.cancelButton.addEventListener("click", () => this._cancel());
    this._dialog.discardButton.addEventListener("click", () => this._discard());
  },

  _setState(state) {
    if (state == "preview") {
      this._dropTarget.hidden = true;
      this._svg.toggleAttribute("hidden", false);
      this._dialog.saveButton.disabled = false;
      return;
    }

    this._dropTarget.classList.toggle("drop-target", state == "target");
    this._dropTarget.classList.toggle("drop-loading", state == "loading");
    this._dropTarget.classList.toggle("drop-error", state == "error");
    document.l10n.setAttributes(
      this._dropTarget.querySelector(".label"),
      `about-addressbook-photo-drop-${state}`
    );

    this._dropTarget.hidden = false;
    this._svg.toggleAttribute("hidden", true);
    this._dialog.saveButton.disabled = true;
  },

  /**
   * Show the photo dialog, with no displayed image.
   */
  showEmpty() {
    this._setState("target");

    if (!this._dialog.open) {
      this._dialog.discardButton.hidden = true;
      this._dialog.showModal();
    }
  },

  /**
   * Show the photo dialog, with `file` as the displayed image.
   *
   * @param {File} file
   */
  showWithFile(file) {
    this.showWithURL(URL.createObjectURL(file));
  },

  /**
   * Show the photo dialog, with `URL` as the displayed image and (optionally)
   * a pre-set crop rectangle
   *
   * @param {string} url - The URL of the image.
   * @param {?DOMRect} cropRect - The rectangle used to crop the image.
   * @param {boolean} [showDiscard=false] - Whether to show a discard button
   *   when opening the dialog.
   */
  showWithURL(url, cropRect, showDiscard = false) {
    // Load the image from the URL, to figure out the scale factor.
    const img = document.createElement("img");
    img.addEventListener("load", () => {
      const PREVIEW_SIZE = 500;

      const { naturalWidth, naturalHeight } = img;
      this._scale = Math.max(
        1,
        img.naturalWidth / PREVIEW_SIZE,
        img.naturalHeight / PREVIEW_SIZE
      );

      const previewWidth = naturalWidth / this._scale;
      const previewHeight = naturalHeight / this._scale;
      const smallDimension = Math.min(previewWidth, previewHeight);

      this._previewRect = new DOMRect(0, 0, previewWidth, previewHeight);
      if (cropRect) {
        this._cropRect = DOMRect.fromRect(cropRect);
      } else {
        this._cropRect = new DOMRect(
          (this._previewRect.width - smallDimension) / 2,
          (this._previewRect.height - smallDimension) / 2,
          smallDimension,
          smallDimension
        );
      }

      this._preview.setAttribute("href", url);
      this._preview.setAttribute("width", previewWidth);
      this._preview.setAttribute("height", previewHeight);

      this._svg.setAttribute("width", previewWidth + 20);
      this._svg.setAttribute("height", previewHeight + 20);
      this._svg.setAttribute(
        "viewBox",
        `-10 -10 ${previewWidth + 20} ${previewHeight + 20}`
      );

      this._redrawCropRect();
      this._setState("preview");
      this._dialog.saveButton.focus();
    });
    img.addEventListener("error", () => this._setState("error"));
    img.src = url;

    this._setState("loading");

    if (!this._dialog.open) {
      this._dialog.discardButton.hidden = !showDiscard;
      this._dialog.showModal();
    }
  },

  /**
   * Resize the crop controls to match the current _cropRect.
   */
  _redrawCropRect() {
    const { top, right, bottom, left, width, height } = this._cropRect;

    this._cropMask.setAttribute(
      "d",
      `M0 0H${this._previewRect.width}V${this._previewRect.height}H0Z M${left} ${top}V${bottom}H${right}V${top}Z`
    );

    this._dragRect.setAttribute("x", left);
    this._dragRect.setAttribute("y", top);
    this._dragRect.setAttribute("width", width);
    this._dragRect.setAttribute("height", height);

    this._corners[0].setAttribute("x", left - 10);
    this._corners[0].setAttribute("y", top - 10);
    this._corners[1].setAttribute("x", right - 30);
    this._corners[1].setAttribute("y", top - 10);
    this._corners[2].setAttribute("x", right - 30);
    this._corners[2].setAttribute("y", bottom - 30);
    this._corners[3].setAttribute("x", left - 10);
    this._corners[3].setAttribute("y", bottom - 30);
  },

  /**
   * Crop, shrink, convert the image to a JPEG, then assign it to the photo
   * element and close the dialog. Doesn't save the JPEG to disk, that happens
   * when (if) the contact is saved.
   */
  async _save() {
    const DOUBLE_SIZE = 600;
    const FINAL_SIZE = 300;

    let source = this._preview;
    let { x, y, width, height } = this._cropRect;
    x *= this._scale;
    y *= this._scale;
    width *= this._scale;
    height *= this._scale;

    // If the image is much larger than our target size, draw an intermediate
    // version at twice the size first. This produces better-looking results.
    if (width > DOUBLE_SIZE) {
      const canvas1 = document.createElement("canvas");
      canvas1.width = canvas1.height = DOUBLE_SIZE;
      const context1 = canvas1.getContext("2d");
      context1.drawImage(
        source,
        x,
        y,
        width,
        height,
        0,
        0,
        DOUBLE_SIZE,
        DOUBLE_SIZE
      );

      source = canvas1;
      x = y = 0;
      width = height = DOUBLE_SIZE;
    }

    const canvas2 = document.createElement("canvas");
    canvas2.width = canvas2.height = FINAL_SIZE;
    const context2 = canvas2.getContext("2d");
    context2.drawImage(
      source,
      x,
      y,
      width,
      height,
      0,
      0,
      FINAL_SIZE,
      FINAL_SIZE
    );

    const blob = await new Promise(resolve =>
      canvas2.toBlob(resolve, "image/jpeg")
    );

    detailsPane.setPhoto({
      blob,
      sourceURL: this._preview.getAttribute("href"),
      cropRect: DOMRect.fromRect(this._cropRect),
    });

    this._dialog.close();
  },

  /**
   * Just close the dialog.
   */
  _cancel() {
    this._dialog.close();
  },

  /**
   * Throw away the contact's existing photo, and close the dialog. Doesn't
   * remove the existing photo from disk, that happens when (if) the contact
   * is saved.
   */
  _discard() {
    this._dialog.close();
    detailsPane.setPhoto(null);
  },

  handleEvent(event) {
    switch (event.type) {
      case "dragover":
        this._onDragOver(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
      case "paste":
        this._onPaste(event);
        break;
    }
  },

  /**
   * Gets the first image file from a DataTransfer object, or null if there
   * are no image files in the object.
   *
   * @param {DataTransfer} dataTransfer
   * @returns {File|null}
   */
  _getUseableFile(dataTransfer) {
    if (
      dataTransfer.files.length &&
      dataTransfer.files[0].type.startsWith("image/")
    ) {
      return dataTransfer.files[0];
    }
    return null;
  },

  /**
   * Gets the first image file from a DataTransfer object, or null if there
   * are no image files in the object.
   *
   * @param {DataTransfer} dataTransfer
   * @returns {string|null}
   */
  _getUseableURL(dataTransfer) {
    const data = dataTransfer.getData("text/plain");

    return data.startsWith("https://") ? data : null;
  },

  _onDragOver(event) {
    if (
      this._getUseableFile(event.dataTransfer) ||
      this._getUseableURL(event.clipboardData)
    ) {
      event.dataTransfer.dropEffect = "move";
      event.preventDefault();
    }
  },

  _onDrop(event) {
    const file = this._getUseableFile(event.dataTransfer);
    if (file) {
      this.showWithFile(file);
      event.preventDefault();
    } else {
      const url = this._getUseableURL(event.clipboardData);
      if (url) {
        this.showWithURL(url);
        event.preventDefault();
      }
    }
  },

  _onPaste(event) {
    const file = this._getUseableFile(event.clipboardData);
    if (file) {
      this.showWithFile(file);
    } else {
      const url = this._getUseableURL(event.clipboardData);
      if (url) {
        this.showWithURL(url);
      }
    }
    event.preventDefault();
  },

  /**
   * Show a file picker to choose an image.
   */
  async _showFilePicker() {
    const title = await document.l10n.formatValue(
      "about-addressbook-photo-filepicker-title"
    );

    const picker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    picker.init(
      window.browsingContext.topChromeWindow.browsingContext,
      title,
      Ci.nsIFilePicker.modeOpen
    );
    picker.appendFilters(Ci.nsIFilePicker.filterImages);
    const result = await new Promise(resolve => picker.open(resolve));

    if (result != Ci.nsIFilePicker.returnOK) {
      return;
    }

    this.showWithFile(await File.createFromNsIFile(picker.file));
  },
};

// Printing

var printHandler = {
  printDirectory(directory) {
    const title = directory ? directory.dirName : document.title;

    const cards = directory
      ? directory.childCards
      : MailServices.ab.directories.reduce(
          (t, d) => t.concat(d.childCards),
          []
        );

    this._printCards(title, cards);
  },

  printCards(cards) {
    this._printCards(document.title, cards);
  },

  async _printCards(title, cards) {
    const collator = new Intl.Collator(undefined, { numeric: true });
    const nameFormat = Services.prefs.getIntPref(
      "mail.addr_book.lastnamefirst",
      0
    );

    cards.sort((a, b) => {
      const aName = a.generateName(nameFormat);
      const bName = b.generateName(nameFormat);
      return collator.compare(aName, bName);
    });

    const printDocument = document.implementation.createHTMLDocument();
    printDocument.title = title;
    printDocument.head
      .appendChild(printDocument.createElement("meta"))
      .setAttribute("charset", "utf-8");
    const link = printDocument.head.appendChild(
      printDocument.createElement("link")
    );
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", "chrome://messagebody/skin/abPrint.css");

    const printTemplate = document.getElementById("printTemplate");

    for (const card of cards) {
      if (card.isMailList) {
        continue;
      }

      const div = printDocument.createElement("div");
      div.append(printTemplate.content.cloneNode(true));
      detailsPane.fillContactDetails(div, card);
      const photo = div.querySelector(".contact-photo");
      if (photo.src.startsWith("chrome:")) {
        photo.hidden = true;
      }
      await document.l10n.translateFragment(div);
      printDocument.body.appendChild(div);
    }

    const html = new XMLSerializer().serializeToString(printDocument);
    this._printURL(URL.createObjectURL(new File([html], "text/html")));
  },

  async _printURL(url) {
    const topWindow = window.browsingContext.topChromeWindow;
    await topWindow.PrintUtils.loadPrintBrowser(url);
    topWindow.PrintUtils.startPrintWindow(
      topWindow.PrintUtils.printBrowser.browsingContext,
      {}
    );
  },
};

/**
 * A span that displays the current time in a given time zone.
 * The time is updated every minute.
 */
class ActiveTime extends HTMLSpanElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;
    this.setAttribute("is", "active-time");

    try {
      this.formatter = new Services.intl.DateTimeFormat(undefined, {
        timeZone: this.getAttribute("tz"),
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      // DateTimeFormat will throw if the time zone is unknown.
      // If it does this will just be an empty span.
      return;
    }
    this.update = this.update.bind(this);
    this.update();

    CalMetronome.on("minute", this.update);
    window.addEventListener("unload", this, { once: true });
  }

  disconnectedCallback() {
    CalMetronome.off("minute", this.update);
  }

  handleEvent() {
    CalMetronome.off("minute", this.update);
  }

  update() {
    this.textContent = this.formatter.format(new Date());
  }
}
customElements.define("active-time", ActiveTime, { extends: "span" });
