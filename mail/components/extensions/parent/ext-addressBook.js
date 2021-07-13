/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);
var { newUID } = ChromeUtils.import("resource:///modules/AddrBookUtils.jsm");

const AB_WINDOW_TYPE = "mail:addressbook";
const AB_WINDOW_URI =
  "chrome://messenger/content/addressbook/addressbook.xhtml";

// nsIAbCard.idl contains a list of properties that Thunderbird uses. Extensions are not
// restricted to using only these properties, but the following properties cannot
// be modified by an extension.
const hiddenProperties = [
  "DbRowID",
  "LowercasePrimaryEmail",
  "LastModifiedDate",
  "PopularityIndex",
  "RecordKey",
  "UID",
];

/**
 * Address book that supports finding cards only for a search (like LDAP).
 * @implements {nsIAbDirectory}
 */
class ExtSearchBook extends AddrBookDirectory {
  constructor(fire, context, args = {}) {
    super();
    this.fire = fire;
    this._readOnly = true;
    this._isSecure = Boolean(args.isSecure);
    this._dirName = String(args.addressBookName ?? context.extension.name);
    this._fileName = "";
    this._uid = String(args.id ?? newUID());
    this._uri = "searchaddr://" + this.UID;
    this.lastModifiedDate = 0;
    this.isMailList = false;
    this.listNickName = "";
    this.description = "";
    this._dirPrefId = "";
  }
  /**
   * @see {AddrBookDirectory}
   */
  get lists() {
    return new Map();
  }
  /**
   * @see {AddrBookDirectory}
   */
  get cards() {
    return new Map();
  }
  // nsIAbDirectory
  get isRemote() {
    return true;
  }
  get isSecure() {
    return this._isSecure;
  }
  getCardFromProperty(aProperty, aValue, aCaseSensitive) {
    return null;
  }
  getCardsFromProperty(aProperty, aValue, aCaseSensitive) {
    return [];
  }
  get dirType() {
    return Ci.nsIAbManager.ASYNC_DIRECTORY_TYPE;
  }
  get position() {
    return 0;
  }
  useForAutocomplete(aIdentityKey) {
    // AddrBookDirectory defaults to true
    return false;
  }
  get supportsMailingLists() {
    return false;
  }
  setLocalizedStringValue(aName, aValue) {}
  async search(aQuery, aSearchString, aListener) {
    try {
      let { results, isCompleteResult } = await this.fire.async(
        addressBookCache.convert(addressBookCache.addressBooks.get(this.UID)),
        aSearchString,
        aQuery
      );
      for (let properties of results) {
        let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
          Ci.nsIAbCard
        );
        card.directoryUID = this.UID;
        for (let [name, value] of Object.entries(properties)) {
          if (!hiddenProperties.includes(name)) {
            card.setProperty(name, value);
          }
        }
        aListener.onSearchFoundCard(card);
      }
      aListener.onSearchFinished(Cr.NS_OK, isCompleteResult, null, "");
    } catch (ex) {
      aListener.onSearchFinished(
        ex.result || Cr.NS_ERROR_FAILURE,
        true,
        null,
        ""
      );
    }
  }
}

/**
 * Cache of items in the address book "tree".
 *
 * @implements {nsIObserver}
 */
var addressBookCache = new (class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
    this.flush();
  }
  _makeContactNode(contact, parent) {
    contact.QueryInterface(Ci.nsIAbCard);
    return {
      id: contact.UID,
      parentId: parent.UID,
      type: "contact",
      item: contact,
    };
  }
  _makeDirectoryNode(directory, parent = null) {
    directory.QueryInterface(Ci.nsIAbDirectory);
    let node = {
      id: directory.UID,
      type: directory.isMailList ? "mailingList" : "addressBook",
      item: directory,
    };
    if (parent) {
      node.parentId = parent.UID;
    }
    return node;
  }
  _populateListContacts(mailingList) {
    mailingList.contacts = new Map();
    for (let contact of mailingList.item.childCards) {
      let newNode = this._makeContactNode(contact, mailingList.item);
      mailingList.contacts.set(newNode.id, newNode);
    }
  }
  getListContacts(mailingList) {
    if (!mailingList.contacts) {
      this._populateListContacts(mailingList);
    }
    return [...mailingList.contacts.values()];
  }
  _populateContacts(addressBook) {
    addressBook.contacts = new Map();
    for (let contact of addressBook.item.childCards) {
      if (!contact.isMailList) {
        let newNode = this._makeContactNode(contact, addressBook.item);
        this._contacts.set(newNode.id, newNode);
        addressBook.contacts.set(newNode.id, newNode);
      }
    }
  }
  getContacts(addressBook) {
    if (!addressBook.contacts) {
      this._populateContacts(addressBook);
    }
    return [...addressBook.contacts.values()];
  }
  _populateMailingLists(parent) {
    parent.mailingLists = new Map();
    for (let mailingList of parent.item.childNodes) {
      let newNode = this._makeDirectoryNode(mailingList, parent.item);
      this._mailingLists.set(newNode.id, newNode);
      parent.mailingLists.set(newNode.id, newNode);
    }
  }
  getMailingLists(parent) {
    if (!parent.mailingLists) {
      this._populateMailingLists(parent);
    }
    return [...parent.mailingLists.values()];
  }
  get addressBooks() {
    if (!this._addressBooks) {
      this._addressBooks = new Map();
      for (let tld of MailServices.ab.directories) {
        this._addressBooks.set(tld.UID, this._makeDirectoryNode(tld));
      }
    }
    return this._addressBooks;
  }
  flush() {
    this._contacts = new Map();
    this._mailingLists = new Map();
    this._addressBooks = null;
  }
  findAddressBookById(id) {
    let addressBook = this.addressBooks.get(id);
    if (addressBook) {
      return addressBook;
    }
    throw new ExtensionUtils.ExtensionError(
      `addressBook with id=${id} could not be found.`
    );
  }
  findMailingListById(id) {
    if (this._mailingLists.has(id)) {
      return this._mailingLists.get(id);
    }
    for (let addressBook of this.addressBooks.values()) {
      if (!addressBook.mailingLists) {
        this._populateMailingLists(addressBook);
        if (addressBook.mailingLists.has(id)) {
          return addressBook.mailingLists.get(id);
        }
      }
    }
    throw new ExtensionUtils.ExtensionError(
      `mailingList with id=${id} could not be found.`
    );
  }
  findContactById(id, bookHint) {
    if (this._contacts.has(id)) {
      return this._contacts.get(id);
    }
    if (bookHint && !bookHint.contacts) {
      this._populateContacts(bookHint);
      if (bookHint.contacts.has(id)) {
        return bookHint.contacts.get(id);
      }
    }
    for (let addressBook of this.addressBooks.values()) {
      if (!addressBook.contacts) {
        this._populateContacts(addressBook);
        if (addressBook.contacts.has(id)) {
          return addressBook.contacts.get(id);
        }
      }
    }
    throw new ExtensionUtils.ExtensionError(
      `contact with id=${id} could not be found.`
    );
  }
  convert(node, complete) {
    if (node === null) {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(i => this.convert(i, complete));
    }

    let copy = {};
    for (let key of ["id", "parentId", "type"]) {
      if (key in node) {
        copy[key] = node[key];
      }
    }

    if (complete) {
      if (node.type == "addressBook") {
        copy.mailingLists = this.convert(this.getMailingLists(node), true);
        copy.contacts = this.convert(this.getContacts(node), true);
      }
      if (node.type == "mailingList") {
        copy.contacts = this.convert(this.getListContacts(node), true);
      }
    }

    switch (node.type) {
      case "addressBook":
        copy.name = node.item.dirName;
        copy.readOnly = node.item.readOnly;
        copy.remote = node.item.isRemote;
        break;
      case "contact": {
        copy.properties = {};
        for (let property of node.item.properties) {
          if (!hiddenProperties.includes(property.name)) {
            switch (property.value) {
              case undefined:
              case null:
              case "":
                // If someone sets a property to one of these values,
                // the property will be deleted from the database.
                // However, the value still appears in the notification,
                // so we ignore it here.
                continue;
            }
            // WebExtensions complains if we use numbers.
            copy.properties[property.name] = "" + property.value;
          }
        }
        let parentNode;
        try {
          parentNode = this.findAddressBookById(node.parentId);
        } catch (ex) {
          // Parent might be a mailing list.
          parentNode = this.findMailingListById(node.parentId);
        }
        copy.readOnly = parentNode.item.readOnly;
        copy.remote = parentNode.item.isRemote;
        break;
      }
      case "mailingList":
        copy.name = node.item.dirName;
        copy.nickName = node.item.listNickName;
        copy.description = node.item.description;
        let parentNode = this.findAddressBookById(node.parentId);
        copy.readOnly = parentNode.item.readOnly;
        copy.remote = parentNode.item.isRemote;
        break;
    }

    return copy;
  }

  // nsIObserver
  _notifications = [
    "addrbook-directory-created",
    "addrbook-directory-updated",
    "addrbook-directory-deleted",
    "addrbook-contact-created",
    "addrbook-contact-properties-updated",
    "addrbook-contact-deleted",
    "addrbook-list-created",
    "addrbook-list-updated",
    "addrbook-list-deleted",
    "addrbook-list-member-added",
    "addrbook-list-member-removed",
  ];

  observe(subject, topic, data) {
    switch (topic) {
      case "addrbook-directory-created": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        let newNode = this._makeDirectoryNode(subject);
        if (this._addressBooks) {
          this._addressBooks.set(newNode.id, newNode);
        }

        this.emit("address-book-created", newNode);
        break;
      }
      case "addrbook-directory-updated": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        this.emit("address-book-updated", this._makeDirectoryNode(subject));
        break;
      }
      case "addrbook-directory-deleted": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        let uid = subject.UID;
        if (this._addressBooks?.has(uid)) {
          let parentNode = this._addressBooks.get(uid);
          if (parentNode.contacts) {
            for (let id of parentNode.contacts.keys()) {
              this._contacts.delete(id);
            }
          }
          if (parentNode.mailingLists) {
            for (let id of parentNode.mailingLists.keys()) {
              this._mailingLists.delete(id);
            }
          }
          this._addressBooks.delete(uid);
        }

        this.emit("address-book-deleted", uid);
        break;
      }
      case "addrbook-contact-created": {
        subject.QueryInterface(Ci.nsIAbCard);

        let parent = MailServices.ab.getDirectoryFromUID(data);
        let newNode = this._makeContactNode(subject, parent);
        if (this._addressBooks?.has(data)) {
          let parentNode = this._addressBooks.get(data);
          if (parentNode.contacts) {
            parentNode.contacts.set(newNode.id, newNode);
          }
          this._contacts.set(newNode.id, newNode);
        }

        this.emit("contact-created", newNode);
        break;
      }
      case "addrbook-contact-properties-updated": {
        subject.QueryInterface(Ci.nsIAbCard);

        let parentUID = subject.directoryUID;
        let parent = MailServices.ab.getDirectoryFromUID(parentUID);
        let newNode = this._makeContactNode(subject, parent);
        if (this._addressBooks?.has(parentUID)) {
          let parentNode = this._addressBooks.get(parentUID);
          if (parentNode.contacts) {
            parentNode.contacts.set(newNode.id, newNode);
            this._contacts.set(newNode.id, newNode);
          }
          if (parentNode.mailingLists) {
            for (let mailingList of parentNode.mailingLists.values()) {
              if (
                mailingList.contacts &&
                mailingList.contacts.has(newNode.id)
              ) {
                mailingList.contacts.get(newNode.id).item = subject;
              }
            }
          }
        }

        this.emit("contact-updated", newNode, JSON.parse(data));
        break;
      }
      case "addrbook-contact-deleted": {
        subject.QueryInterface(Ci.nsIAbCard);

        let uid = subject.UID;
        this._contacts.delete(uid);
        if (this._addressBooks?.has(data)) {
          let parentNode = this._addressBooks.get(data);
          if (parentNode.contacts) {
            parentNode.contacts.delete(uid);
          }
        }

        this.emit("contact-deleted", data, uid);
        break;
      }
      case "addrbook-list-created": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        let parent = MailServices.ab.getDirectoryFromUID(data);
        let newNode = this._makeDirectoryNode(subject, parent);
        if (this._addressBooks?.has(data)) {
          let parentNode = this._addressBooks.get(data);
          if (parentNode.mailingLists) {
            parentNode.mailingLists.set(newNode.id, newNode);
          }
          this._mailingLists.set(newNode.id, newNode);
        }

        this.emit("mailing-list-created", newNode);
        break;
      }
      case "addrbook-list-updated": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        let listNode = this.findMailingListById(subject.UID);
        listNode.item = subject;

        this.emit("mailing-list-updated", listNode);
        break;
      }
      case "addrbook-list-deleted": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        let uid = subject.UID;
        this._mailingLists.delete(uid);
        if (this._addressBooks?.has(data)) {
          let parentNode = this._addressBooks.get(data);
          if (parentNode.mailingLists) {
            parentNode.mailingLists.delete(uid);
          }
        }

        this.emit("mailing-list-deleted", data, uid);
        break;
      }
      case "addrbook-list-member-added": {
        subject.QueryInterface(Ci.nsIAbCard);

        let parentNode = this.findMailingListById(data);
        let newNode = this._makeContactNode(subject, parentNode.item);
        if (
          this._mailingLists.has(data) &&
          this._mailingLists.get(data).contacts
        ) {
          this._mailingLists.get(data).contacts.set(newNode.id, newNode);
        }
        this.emit("mailing-list-member-added", newNode);
        break;
      }
      case "addrbook-list-member-removed": {
        subject.QueryInterface(Ci.nsIAbCard);

        let uid = subject.UID;
        if (this._mailingLists.has(data)) {
          let parentNode = this._mailingLists.get(data);
          if (parentNode.contacts) {
            parentNode.contacts.delete(uid);
          }
        }

        this.emit("mailing-list-member-removed", data, uid);
        break;
      }
    }
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      for (let topic of this._notifications) {
        Services.obs.addObserver(this, topic);
      }
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      for (let topic of this._notifications) {
        Services.obs.removeObserver(this, topic);
      }

      this.flush();
    }
  }
})();

this.addressBook = class extends ExtensionAPI {
  onShutdown() {
    addressBookCache.decrementListeners();
  }

  getAPI(context) {
    addressBookCache.incrementListeners();

    return {
      addressBooks: {
        async openUI() {
          let messengerWindow = windowTracker.topNormalWindow;
          let abWindow = await messengerWindow.toAddressBook();

          if (abWindow.document.readyState != "complete") {
            await new Promise(resolve =>
              abWindow.addEventListener("load", resolve, { once: true })
            );
          }

          return new Promise(resolve => abWindow.setTimeout(resolve));
        },
        async closeUI() {
          for (let win of Services.wm.getEnumerator("mail:3pane")) {
            let tabmail = win.document.getElementById("tabmail");
            for (let tab of tabmail.tabInfo.slice()) {
              if (tab.browser?.currentURI.spec == "about:addressbook") {
                tabmail.closeTab(tab);
              }
            }
          }
          for (let win of Services.wm.getEnumerator(AB_WINDOW_TYPE)) {
            win.close();
          }
        },

        list(complete = false) {
          return addressBookCache.convert(
            [...addressBookCache.addressBooks.values()],
            complete
          );
        },
        get(id, complete = false) {
          return addressBookCache.convert(
            addressBookCache.findAddressBookById(id),
            complete
          );
        },
        create({ name }) {
          let dirName = MailServices.ab.newAddressBook(
            name,
            "",
            Ci.nsIAbManager.JS_DIRECTORY_TYPE
          );
          let directory = MailServices.ab.getDirectoryFromId(dirName);
          return directory.UID;
        },
        update(id, { name }) {
          let node = addressBookCache.findAddressBookById(id);
          node.item.dirName = name;
        },
        async delete(id) {
          let node = addressBookCache.findAddressBookById(id);
          let deletePromise = new Promise(resolve => {
            let listener = () => {
              addressBookCache.off("address-book-deleted", listener);
              resolve();
            };
            addressBookCache.on("address-book-deleted", listener);
          });
          MailServices.ab.deleteAddressBook(node.item.URI);
          await deletePromise;
        },

        onCreated: new EventManager({
          context,
          name: "addressBooks.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("address-book-created", listener);
            return () => {
              addressBookCache.off("address-book-created", listener);
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "addressBooks.onUpdated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("address-book-updated", listener);
            return () => {
              addressBookCache.off("address-book-updated", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "addressBooks.onDeleted",
          register: fire => {
            let listener = (event, itemUID) => {
              fire.sync(itemUID);
            };

            addressBookCache.on("address-book-deleted", listener);
            return () => {
              addressBookCache.off("address-book-deleted", listener);
            };
          },
        }).api(),
        provider: {
          onSearchRequest: new EventManager({
            context,
            name: "addressBooks.provider.onSearchRequest",
            register: (fire, args) => {
              if (addressBookCache.addressBooks.has(args.id)) {
                throw new ExtensionUtils.ExtensionError(
                  `addressBook with id=${args.id} already exists.`
                );
              }
              let dir = new ExtSearchBook(fire, context, args);
              dir.init();
              MailServices.ab.addAddressBook(dir);
              return () => {
                MailServices.ab.deleteAddressBook(dir.URI);
              };
            },
          }).api(),
        },
      },
      contacts: {
        list(parentId) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(
            addressBookCache.getContacts(parentNode),
            false
          );
        },
        async quickSearch(parentId, queryInfo) {
          const {
            getSearchTokens,
            getModelQuery,
            generateQueryURI,
          } = ChromeUtils.import("resource:///modules/ABQueryUtils.jsm");

          let searchString;
          if (typeof queryInfo == "string") {
            searchString = queryInfo;
            queryInfo = {
              includeRemote: true,
              includeLocal: true,
              includeReadOnly: true,
              includeReadWrite: true,
            };
          } else {
            searchString = queryInfo.searchString;
          }

          let searchWords = getSearchTokens(searchString);
          if (searchWords.length == 0) {
            return [];
          }
          let searchFormat = getModelQuery(
            "mail.addr_book.quicksearchquery.format"
          );
          let searchQuery = generateQueryURI(searchFormat, searchWords);

          let booksToSearch;
          if (parentId == null) {
            booksToSearch = [...addressBookCache.addressBooks.values()];
          } else {
            booksToSearch = [addressBookCache.findAddressBookById(parentId)];
          }

          let results = [];
          let promises = [];
          for (let book of booksToSearch) {
            if (
              (book.item.isRemote && !queryInfo.includeRemote) ||
              (!book.item.isRemote && !queryInfo.includeLocal) ||
              (book.item.readOnly && !queryInfo.includeReadOnly) ||
              (!book.item.readOnly && !queryInfo.includeReadWrite)
            ) {
              continue;
            }
            promises.push(
              new Promise(resolve => {
                book.item.search(searchQuery, searchString, {
                  onSearchFinished(status, complete, secInfo, location) {
                    resolve();
                  },
                  onSearchFoundCard(contact) {
                    if (contact.isMailList) {
                      return;
                    }
                    results.push(
                      addressBookCache._makeContactNode(contact, book.item)
                    );
                  },
                });
              })
            );
          }
          await Promise.all(promises);

          return addressBookCache.convert(results, false);
        },
        get(id) {
          return addressBookCache.convert(
            addressBookCache.findContactById(id),
            false
          );
        },
        create(parentId, id, properties) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot create a contact in a read-only address book"
            );
          }
          let card = Cc[
            "@mozilla.org/addressbook/cardproperty;1"
          ].createInstance(Ci.nsIAbCard);
          for (let [name, value] of Object.entries(properties)) {
            if (!hiddenProperties.includes(name)) {
              card.setProperty(name, value);
            }
          }
          if (id) {
            let duplicateExists = false;
            try {
              // Second argument is only a hint, all address books are checked.
              addressBookCache.findContactById(id, parentId);
              duplicateExists = true;
            } catch (ex) {
              // Do nothing. We want this to throw because no contact was found.
            }
            if (duplicateExists) {
              throw new ExtensionError(`Duplicate contact id: ${id}`);
            }
            card.UID = id;
          }
          let newCard = parentNode.item.addCard(card);
          return newCard.UID;
        },
        update(id, properties) {
          let node = addressBookCache.findContactById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot modify a contact in a read-only address book"
            );
          }

          for (let [name, value] of Object.entries(properties)) {
            if (!hiddenProperties.includes(name)) {
              node.item.setProperty(name, value);
            }
          }
          parentNode.item.modifyCard(node.item);
        },
        delete(id) {
          let node = addressBookCache.findContactById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot delete a contact in a read-only address book"
            );
          }

          parentNode.item.deleteCards([node.item]);
        },

        onCreated: new EventManager({
          context,
          name: "contacts.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("contact-created", listener);
            return () => {
              addressBookCache.off("contact-created", listener);
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "contacts.onUpdated",
          register: fire => {
            let listener = (event, node, changes) => {
              let filteredChanges = {};
              for (let [key, value] of Object.entries(changes)) {
                if (!hiddenProperties.includes(key) && key.match(/^\w+$/)) {
                  filteredChanges[key] = value;
                }
              }
              fire.sync(addressBookCache.convert(node), filteredChanges);
            };

            addressBookCache.on("contact-updated", listener);
            return () => {
              addressBookCache.off("contact-updated", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "contacts.onDeleted",
          register: fire => {
            let listener = (event, parentUID, itemUID) => {
              fire.sync(parentUID, itemUID);
            };

            addressBookCache.on("contact-deleted", listener);
            return () => {
              addressBookCache.off("contact-deleted", listener);
            };
          },
        }).api(),
      },
      mailingLists: {
        list(parentId) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(
            addressBookCache.getMailingLists(parentNode),
            false
          );
        },
        get(id) {
          return addressBookCache.convert(
            addressBookCache.findMailingListById(id),
            false
          );
        },
        create(parentId, { name, nickName, description }) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot create a mailing list in a read-only address book"
            );
          }
          let mailList = Cc[
            "@mozilla.org/addressbook/directoryproperty;1"
          ].createInstance(Ci.nsIAbDirectory);
          mailList.isMailList = true;
          mailList.dirName = name;
          mailList.listNickName = nickName === null ? "" : nickName;
          mailList.description = description === null ? "" : description;

          let newMailList = parentNode.item.addMailList(mailList);
          return newMailList.UID;
        },
        update(id, { name, nickName, description }) {
          let node = addressBookCache.findMailingListById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot modify a mailing list in a read-only address book"
            );
          }
          node.item.dirName = name;
          node.item.listNickName = nickName === null ? "" : nickName;
          node.item.description = description === null ? "" : description;
          node.item.editMailListToDatabase(null);
        },
        delete(id) {
          let node = addressBookCache.findMailingListById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot delete a mailing list in a read-only address book"
            );
          }
          parentNode.item.deleteDirectory(node.item);
        },

        listMembers(id) {
          let node = addressBookCache.findMailingListById(id);
          return addressBookCache.convert(
            addressBookCache.getListContacts(node),
            false
          );
        },
        addMember(id, contactId) {
          let node = addressBookCache.findMailingListById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot add to a mailing list in a read-only address book"
            );
          }
          let contactNode = addressBookCache.findContactById(contactId);
          node.item.addCard(contactNode.item);
        },
        removeMember(id, contactId) {
          let node = addressBookCache.findMailingListById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot remove from a mailing list in a read-only address book"
            );
          }
          let contactNode = addressBookCache.findContactById(contactId);

          node.item.deleteCards([contactNode.item]);
        },

        onCreated: new EventManager({
          context,
          name: "mailingLists.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-created", listener);
            return () => {
              addressBookCache.off("mailing-list-created", listener);
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "mailingLists.onUpdated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-updated", listener);
            return () => {
              addressBookCache.off("mailing-list-updated", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "mailingLists.onDeleted",
          register: fire => {
            let listener = (event, parentUID, itemUID) => {
              fire.sync(parentUID, itemUID);
            };

            addressBookCache.on("mailing-list-deleted", listener);
            return () => {
              addressBookCache.off("mailing-list-deleted", listener);
            };
          },
        }).api(),
        onMemberAdded: new EventManager({
          context,
          name: "mailingLists.onMemberAdded",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-member-added", listener);
            return () => {
              addressBookCache.off("mailing-list-member-added", listener);
            };
          },
        }).api(),
        onMemberRemoved: new EventManager({
          context,
          name: "mailingLists.onMemberRemoved",
          register: fire => {
            let listener = (event, parentUID, itemUID) => {
              fire.sync(parentUID, itemUID);
            };

            addressBookCache.on("mailing-list-member-removed", listener);
            return () => {
              addressBookCache.off("mailing-list-member-removed", listener);
            };
          },
        }).api(),
      },
    };
  }
};
