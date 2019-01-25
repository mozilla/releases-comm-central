/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

const AB_WINDOW_TYPE = "mail:addressbook";
const AB_WINDOW_URI = "chrome://messenger/content/addressbook/addressbook.xul";

const kPABDirectory = 2; // defined in nsDirPrefs.h

// nsIAbCard.idl contains a list of properties that Thunderbird uses. Extensions are not
// restricted to using only these properties, but the following properties cannot
// be modified by an extension.
const hiddenProperties = [
  "DbRowID", "LowercasePrimaryEmail", "LastModifiedDate",
  "PopularityIndex", "RecordKey", "UID",
];

/**
 * Cache of items in the address book "tree". This cache is
 * completely blown away by most changes, so operations should
 * be as lightweight as possible.
 *
 * @implements {nsIAbListener}
 * @implements {nsIObserver}
 */
var addressBookCache = new class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
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
      get contacts() {
        delete this.contacts;
        this.contacts = [];
        for (let card of directory.childCards) {
          if (!card.isMailList) {
            this.contacts.push(addressBookCache._makeContactNode(card, directory));
          }
        }
        return this.contacts;
      },
      get mailingLists() {
        delete this.mailingLists;
        if (directory.isMailList) {
          return undefined;
        }
        this.mailingLists = [];
        for (let al of directory.addressLists.enumerate()) {
          this.mailingLists.push(addressBookCache._makeDirectoryNode(al, directory));
        }
        return this.mailingLists;
      },
    };
    if (parent) {
      node.parentId = parent.UID;
    }
    return node;
  }
  _rebuild() {
    this._tree = [];
    for (let tld of MailServices.ab.directories) {
      if (!tld.readOnly) {
        this._tree.push(this._makeDirectoryNode(tld));
      }
    }
  }
  get tree() {
    if (!this._tree) {
      this._rebuild();
    }
    return this._tree;
  }
  flush() {
    this._tree = null;
  }
  _findObjectById(type, id) {
    function checkNode(parentNode) {
      if (type == parentNode.type && id == parentNode.id) {
        return parentNode;
      }
      if (type == "contact") {
        return parentNode.contacts.find(c => id == c.id);
      }
      return null;
    }

    for (let node of this.tree) {
      let returnNode = checkNode(node);
      if (returnNode) {
        return returnNode;
      }

      if (type == "addressBook" || !node.mailingLists) {
        continue;
      }

      for (let listNode of node.mailingLists) {
        returnNode = checkNode(listNode);
        if (returnNode) {
          return returnNode;
        }
      }
    }

    throw new ExtensionError(`${type} with id=${id} could not be found.`);
  }
  findAddressBookById(id) {
    return this._findObjectById("addressBook", id);
  }
  findContactById(id) {
    return this._findObjectById("contact", id);
  }
  findMailingListById(id) {
    return this._findObjectById("mailingList", id);
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
      for (let key of ["contacts", "mailingLists"]) {
        if (key in node && node[key]) {
          copy[key] = this.convert(node[key], complete);
        }
      }
    }

    switch (node.type) {
      case "addressBook":
        copy.name = node.item.dirName;
        copy.readOnly = node.item.readOnly;
        break;
      case "contact": {
        copy.properties = {};
        for (let property of node.item.properties) {
          if (!hiddenProperties.includes(property.name)) {
            // WebExtensions complains if we use numbers.
            copy.properties[property.name] = "" + property.value;
          }
        }
        break;
      }
      case "mailingList":
        copy.name = node.item.dirName;
        copy.nickName = node.item.listNickName;
        copy.description = node.item.description;
        break;
    }

    return copy;
  }

  // nsIAbListener
  onItemAdded(parent, item) {
    parent.QueryInterface(Ci.nsIAbDirectory);

    if (item instanceof Ci.nsIAbDirectory) {
      item.QueryInterface(Ci.nsIAbDirectory);
      if (item.isMailList) {
        this.emit("mailing-list-created", this._makeDirectoryNode(item, parent));
      } else {
        this.emit("address-book-created", this._makeDirectoryNode(item));
      }
    } else if (item instanceof Ci.nsIAbCard) {
      item.QueryInterface(Ci.nsIAbCard);
      if (!item.isMailList && parent.isMailList) {
        this.emit("mailing-list-member-added", this._makeContactNode(item, parent));
      }
    }

    this._tree = null;
  }
  // nsIAbListener
  onItemRemoved(parent, item) {
    parent = parent.QueryInterface(Ci.nsIAbDirectory);

    if (item instanceof Ci.nsIAbDirectory) {
      item.QueryInterface(Ci.nsIAbDirectory);
      if (item.isMailList) {
        this.emit("mailing-list-deleted", parent, item);
      } else {
        this.emit("address-book-deleted", item);
      }
    } else if (item instanceof Ci.nsIAbCard) {
      item.QueryInterface(Ci.nsIAbCard);
      if (!item.isMailList) {
        this.emit(parent.isMailList ? "mailing-list-member-removed" : "contact-deleted", parent, item);
      }
    }

    this._tree = null;
  }
  // nsIAbListener
  onItemPropertyChanged(item, property, oldValue, newValue) {
    if (item instanceof Ci.nsIAbDirectory) {
      item.QueryInterface(Ci.nsIAbDirectory);
      if (!item.isMailList) {
        this.emit("address-book-updated", this._makeDirectoryNode(item));
        this._tree = null;
      }
    }
  }

  // nsIObserver
  observe(subject, topic, data) {
    this._tree = null;

    switch (topic) {
      case "addrbook-contact-created": {
        let parentNode = this.findAddressBookById(data);
        this.emit("contact-created", this._makeContactNode(subject, parentNode.item));
        break;
      }
      case "addrbook-contact-updated": {
        let parentNode = this.findAddressBookById(data);
        this.emit("contact-updated", this._makeContactNode(subject, parentNode.item));
        break;
      }
      case "addrbook-list-updated": {
        subject.QueryInterface(Ci.nsIAbDirectory);
        this.emit("mailing-list-updated", this.findMailingListById(subject.UID));
        break;
      }
      case "addrbook-list-member-added": {
        let parentNode = this.findMailingListById(data);
        this.emit("mailing-list-member-added", this._makeContactNode(subject, parentNode.item));
        break;
      }
    }
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      MailServices.ab.addAddressBookListener(this, Ci.nsIAbListener.all);
      Services.obs.addObserver(this, "addrbook-contact-created");
      Services.obs.addObserver(this, "addrbook-contact-updated");
      Services.obs.addObserver(this, "addrbook-list-updated");
      Services.obs.addObserver(this, "addrbook-list-member-added");
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      MailServices.ab.removeAddressBookListener(this);
      Services.obs.removeObserver(this, "addrbook-contact-created");
      Services.obs.removeObserver(this, "addrbook-contact-updated");
      Services.obs.removeObserver(this, "addrbook-list-updated");
      Services.obs.removeObserver(this, "addrbook-list-member-added");
    }
  }
};

this.addressBook = class extends ExtensionAPI {
  getAPI(context) {
    return {
      addressBooks: {
        async openUI() {
          let topWindow = Services.wm.getMostRecentWindow(AB_WINDOW_TYPE);
          if (!topWindow) {
            // TODO: wait until window is loaded before resolving
            topWindow = Services.ww.openWindow(null, AB_WINDOW_URI, "_blank", "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar", null);
          }
          topWindow.focus();
        },
        async closeUI() {
          for (let win of Services.wm.getEnumerator(AB_WINDOW_TYPE)) {
            win.close();
          }
        },

        list(complete = false) {
          return addressBookCache.convert(addressBookCache.tree, complete);
        },
        get(id, complete = false) {
          return addressBookCache.convert(addressBookCache.findAddressBookById(id), complete);
        },
        create({ name }) {
          let dirName = MailServices.ab.newAddressBook(name, "", kPABDirectory);
          let directory = MailServices.ab.getDirectoryFromId(dirName);
          return directory.UID;
        },
        update(id, { name }) {
          let node = addressBookCache.findAddressBookById(id);
          node.item.dirName = name;
        },
        delete(id) {
          let node = addressBookCache.findAddressBookById(id);
          MailServices.ab.deleteAddressBook(node.item.URI);
        },

        onCreated: new EventManager({
          context,
          name: "addressBooks.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("address-book-created", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("address-book-created", listener);
              addressBookCache.decrementListeners();
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
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("address-book-updated", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "addressBooks.onDeleted",
          register: fire => {
            let listener = (event, item) => {
              fire.sync(item.UID);
            };

            addressBookCache.on("address-book-deleted", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("address-book-deleted", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
      },
      contacts: {
        list(parentId) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(parentNode.contacts, false);
        },
        get(id) {
          return addressBookCache.convert(addressBookCache.findContactById(id), false);
        },
        create(parentId, properties) {
          let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
          for (let [name, value] of Object.entries(properties)) {
            if (!hiddenProperties.includes(name)) {
              card.setProperty(name, value);
            }
          }
          let parentNode = addressBookCache.findAddressBookById(parentId);
          let newCard = parentNode.item.addCard(card);
          return newCard.UID;
        },
        update(id, properties) {
          let node = addressBookCache.findContactById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);

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

          let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
          cardArray.appendElement(node.item);
          parentNode.item.deleteCards(cardArray);
        },

        onCreated: new EventManager({
          context,
          name: "contacts.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("contact-created", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("contact-created", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "contacts.onUpdated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("contact-updated", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("contact-updated", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "contacts.onDeleted",
          register: fire => {
            let listener = (event, parent, item) => {
              fire.sync(parent.UID, item.UID);
            };

            addressBookCache.on("contact-deleted", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("contact-deleted", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
      },
      mailingLists: {
        list(parentId) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(parentNode.mailingLists, false);
        },
        get(id) {
          return addressBookCache.convert(addressBookCache.findMailingListById(id), false);
        },
        create(parentId, { name, nickName, description }) {
          let mailList = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
          mailList.isMailList = true;
          mailList.dirName = name;
          mailList.listNickName = (nickName === null) ? "" : nickName;
          mailList.description = (description === null) ? "" : description;

          let parentNode = addressBookCache.findAddressBookById(parentId);
          let newMailList = parentNode.item.addMailList(mailList);
          return newMailList.UID;
        },
        update(id, { name, nickName, description }) {
          let node = addressBookCache.findMailingListById(id);
          node.item.dirName = name;
          node.item.listNickName = (nickName === null) ? "" : nickName;
          node.item.description = (description === null) ? "" : description;
          node.item.editMailListToDatabase(null);
        },
        delete(id) {
          let node = addressBookCache.findMailingListById(id);
          MailServices.ab.deleteAddressBook(node.item.URI);
        },

        listMembers(id) {
          let node = addressBookCache.findMailingListById(id);
          return addressBookCache.convert(node.contacts, false);
        },
        addMember(id, contactId) {
          let node = addressBookCache.findMailingListById(id);
          let contactNode = addressBookCache.findContactById(contactId);
          node.item.addCard(contactNode.item);
        },
        removeMember(id, contactId) {
          let node = addressBookCache.findMailingListById(id);
          let contactNode = addressBookCache.findContactById(contactId);

          let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
          cardArray.appendElement(contactNode.item);
          node.item.deleteCards(cardArray);
        },

        onCreated: new EventManager({
          context,
          name: "mailingLists.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-created", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("mailing-list-created", listener);
              addressBookCache.decrementListeners();
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
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("mailing-list-updated", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "mailingLists.onDeleted",
          register: fire => {
            let listener = (event, parent, item) => {
              fire.sync(parent.UID, item.UID);
            };

            addressBookCache.on("mailing-list-deleted", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("mailing-list-deleted", listener);
              addressBookCache.decrementListeners();
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
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("mailing-list-member-added", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
        onMemberRemoved: new EventManager({
          context,
          name: "mailingLists.onMemberRemoved",
          register: fire => {
            let listener = (event, parent, item) => {
              fire.sync(parent.UID, item.UID);
            };

            addressBookCache.on("mailing-list-member-removed", listener);
            addressBookCache.incrementListeners();
            return () => {
              addressBookCache.off("mailing-list-member-removed", listener);
              addressBookCache.decrementListeners();
            };
          },
        }).api(),
      },
    };
  }
};
