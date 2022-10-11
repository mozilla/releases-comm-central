/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["fetch", "File", "FileReader"]);

XPCOMUtils.defineLazyModuleGetters(this, {
  newUID: "resource:///modules/AddrBookUtils.jsm",
  AddrBookCard: "resource:///modules/AddrBookCard.jsm",
  BANISHED_PROPERTIES: "resource:///modules/VCardUtils.jsm",
  VCardProperties: "resource:///modules/VCardUtils.jsm",
  VCardPropertyEntry: "resource:///modules/VCardUtils.jsm",
  VCardUtils: "resource:///modules/VCardUtils.jsm",
});

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
  "_etag",
  "_href",
  "_vCard",
  "vCard",
  "PhotoName",
  "PhotoURL",
  "PhotoType",
];

/**
 * Reads a DOM File and returns a Promise for its dataUrl.
 *
 * @param {File} file
 * @returns {string}
 */
function getDataUrl(file) {
  return new Promise((resolve, reject) => {
    var reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function() {
      resolve(reader.result);
    };
    reader.onerror = function(error) {
      reject(new Error(error));
    };
  });
}

/**
 * Returns the image type of the given contentType string, or throws if the
 * contentType is not an image type supported by the address book.
 *
 * @param {String} contentType - The contentType of a photo.
 * @returns {String} - Either "png" or "jpeg". Throws otherwise.
 */
function getImageType(contentType) {
  let typeParts = contentType.toLowerCase().split("/");
  if (typeParts[0] != "image" || !["jpeg", "png"].includes(typeParts[1])) {
    throw new Error(`Unsupported image format: ${contentType}`);
  }
  return typeParts[1];
}

/**
 * Adds a PHOTO VCardPropertyEntry for the given photo file.
 *
 * @param {VCardProperties} vCardProperties
 * @param {File} photoFile
 * @returns {VCardPropertyEntry}
 */
async function addVCardPhotoEntry(vCardProperties, photoFile) {
  let dataUrl = await getDataUrl(photoFile);
  if (vCardProperties.getFirstValue("version") == "4.0") {
    vCardProperties.addEntry(
      new VCardPropertyEntry("photo", {}, "url", dataUrl)
    );
  } else {
    // If vCard version is not 4.0, default to 3.0.
    vCardProperties.addEntry(
      new VCardPropertyEntry(
        "photo",
        { encoding: "B", type: getImageType(photoFile.type).toUpperCase() },
        "binary",
        dataUrl.substring(dataUrl.indexOf(",") + 1)
      )
    );
  }
}

/**
 * Returns a DOM File object for the contact photo of the given contact.
 *
 * @param {string} id - The id of the contact
 * @returns {File} The photo of the contact, or null.
 */
async function getPhotoFile(id) {
  let { item } = addressBookCache.findContactById(id);
  let photoUrl = item.photoURL;
  if (!photoUrl) {
    return null;
  }

  try {
    if (photoUrl.startsWith("file://")) {
      let realFile = Services.io.newURI(photoUrl).QueryInterface(Ci.nsIFileURL)
        .file;
      let file = await File.createFromNsIFile(realFile);
      let type = getImageType(file.type);
      // Clone the File object to be able to give it the correct name, matching
      // the dataUrl/webUrl code path below.
      return new File([file], `${id}.${type}`, { type: `image/${type}` });
    }

    // Retrieve dataUrls or webUrls.
    let result = await fetch(photoUrl);
    let type = getImageType(result.headers.get("content-type"));
    let blob = await result.blob();
    return new File([blob], `${id}.${type}`, { type: `image/${type}` });
  } catch (ex) {
    Cu.reportError(`Failed to read photo information for ${id}: ` + ex);
  }

  return null;
}

/**
 * Sets the provided file as the primary photo of the given contact.
 *
 * @param {string} id - The id of the contact
 * @param {File} file - The new photo
 */
async function setPhotoFile(id, file) {
  let node = addressBookCache.findContactById(id);
  let vCardProperties = vCardPropertiesFromCard(node.item);

  try {
    let type = getImageType(file.type);

    // If the contact already has a photoUrl, replace it with the same url type.
    // Otherwise save the photo as a local file, except for CardDAV contacts.
    let photoUrl = node.item.photoURL;
    let parentNode = addressBookCache.findAddressBookById(node.parentId);
    let useFile = photoUrl
      ? photoUrl.startsWith("file://")
      : parentNode.item.dirType != Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE;

    if (useFile) {
      let oldPhotoFile = Services.io
        .newURI(photoUrl)
        .QueryInterface(Ci.nsIFileURL).file;
      let pathPhotoFile = await IOUtils.createUniqueFile(
        PathUtils.join(PathUtils.profileDir, "Photos"),
        `${id}.${type}`,
        0o600
      );

      if (file.mozFullPath) {
        // The file object was created by selecting a real file through a file
        // picker and is directly linked to a local file. Do a low level copy.
        await IOUtils.copy(file.mozFullPath, pathPhotoFile);
      } else {
        // The file object is a data blob. Dump it into a real file.
        let buffer = await file.arrayBuffer();
        await IOUtils.write(pathPhotoFile, new Uint8Array(buffer));
      }

      // Set the PhotoName.
      node.item.setProperty("PhotoName", PathUtils.filename(pathPhotoFile));

      // Delete the old photo file.
      if (oldPhotoFile?.exists()) {
        try {
          await IOUtils.remove(oldPhotoFile.path);
        } catch (ex) {
          Cu.reportError(`Failed to delete old photo file for ${id}: ` + ex);
        }
      }
    } else {
      // Follow the UI and replace the entire entry.
      vCardProperties.clearValues("photo");
      await addVCardPhotoEntry(vCardProperties, file);
    }
    parentNode.item.modifyCard(node.item);
  } catch (ex) {
    throw new ExtensionError(
      `Failed to read new photo information for ${id}: ` + ex
    );
  }
}

/**
 * Gets the VCardProperties of the given card either directly or by reconstructing
 * from a set of flat standard properties.
 *
 * @param {nsIAbCard/AddrBookCard} card
 * @returns {VCardProperties}
 */
function vCardPropertiesFromCard(card) {
  if (card.supportsVCard) {
    return card.vCardProperties;
  }
  return VCardProperties.fromPropertyMap(
    new Map(Array.from(card.properties, p => [p.name, p.value]))
  );
}

/**
 * Creates a new AddrBookCard from a set of flat standard properties.
 *
 * @param {ContactProperties} properties - a key/value properties object
 * @param {string} uid - optional UID for the card
 * @returns {AddrBookCard}
 */
function flatPropertiesToAbCard(properties, uid) {
  // Do not use VCardUtils.propertyMapToVCard().
  let vCard = VCardProperties.fromPropertyMap(
    new Map(Object.entries(properties))
  ).toVCard();
  return VCardUtils.vCardToAbCard(vCard, uid);
}

/**
 * Checks if the given property is a custom contact property, which can be exposed
 * to WebExtensions.
 *
 * @param {string} name - property name
 * @returns {boolean}
 */
function isCustomProperty(name) {
  return (
    !hiddenProperties.includes(name) &&
    !BANISHED_PROPERTIES.includes(name) &&
    name.match(/^\w+$/)
  );
}

/**
 * Adds the provided originalProperties to the card, adjusted by the changes
 * given in updateProperties. All banished properties are skipped and the updated
 * properties must be valid according to isCustomProperty().
 *
 * @param {AddrBookCard} card - a card to receive the provided properties
 * @param {ContactProperties} updateProperties - a key/value object with properties
 *   to update the provided originalProperties
 * @param {nsIProperties} originalProperties - properties to be cloned onto
 *   the provided card
 */
function addProperties(card, updateProperties, originalProperties) {
  let updates = Object.entries(updateProperties).filter(e =>
    isCustomProperty(e[0])
  );
  let mergedProperties = originalProperties
    ? new Map([
        ...Array.from(originalProperties, p => [p.name, p.value]),
        ...updates,
      ])
    : new Map(updates);

  for (let [name, value] of mergedProperties) {
    if (
      !BANISHED_PROPERTIES.includes(name) &&
      value != "" &&
      value != null &&
      value != undefined
    ) {
      card.setProperty(name, value);
    }
  }
}

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
  get childCardCount() {
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
        await addressBookCache.convert(
          addressBookCache.addressBooks.get(this.UID)
        ),
        aSearchString,
        aQuery
      );
      for (let resultData of results) {
        let card;
        // A specified vCard is winning over any individual standard property.
        if (resultData.vCard) {
          try {
            card = VCardUtils.vCardToAbCard(resultData.vCard);
          } catch (ex) {
            throw new ExtensionError(
              `Invalid vCard data: ${resultData.vCard}.`
            );
          }
        } else {
          card = flatPropertiesToAbCard(resultData);
        }
        // Add custom properties to the property bag.
        addProperties(card, resultData);
        card.directoryUID = this.UID;
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
  async convert(node, complete) {
    if (node === null) {
      return node;
    }
    if (Array.isArray(node)) {
      let cards = await Promise.allSettled(
        node.map(i => this.convert(i, complete))
      );
      return cards.filter(card => card.value).map(card => card.value);
    }

    let copy = {};
    for (let key of ["id", "parentId", "type"]) {
      if (key in node) {
        copy[key] = node[key];
      }
    }

    if (complete) {
      if (node.type == "addressBook") {
        copy.mailingLists = await this.convert(
          this.getMailingLists(node),
          true
        );
        copy.contacts = await this.convert(this.getContacts(node), true);
      }
      if (node.type == "mailingList") {
        copy.contacts = await this.convert(this.getListContacts(node), true);
      }
    }

    switch (node.type) {
      case "addressBook":
        copy.name = node.item.dirName;
        copy.readOnly = node.item.readOnly;
        copy.remote = node.item.isRemote;
        break;
      case "contact": {
        // Clone the vCardProperties of this contact, so we can manipulate them
        // for the WebExtension, but do not actually change the stored data.
        let vCardProperties = vCardPropertiesFromCard(node.item).clone();
        copy.properties = {};

        // Build a flat property list from vCardProperties.
        for (let [name, value] of vCardProperties.toPropertyMap()) {
          copy.properties[name] = "" + value;
        }

        // Return all other exposed properties stored in the nodes property bag.
        for (let property of Array.from(node.item.properties).filter(e =>
          isCustomProperty(e.name)
        )) {
          copy.properties[property.name] = "" + property.value;
        }

        // If this card has no photo vCard entry, but a local photo, add it to its vCard: Thunderbird
        // does not store photos of local address books in the internal _vCard property, to reduce
        // the amount of data stored in its database.
        let photoName = node.item.getProperty("PhotoName", "");
        let vCardPhoto = vCardProperties.getFirstValue("photo");
        if (!vCardPhoto && photoName) {
          try {
            let realPhotoFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
            realPhotoFile.append("Photos");
            realPhotoFile.append(photoName);
            let photoFile = await File.createFromNsIFile(realPhotoFile);
            await addVCardPhotoEntry(vCardProperties, photoFile);
          } catch (ex) {
            Cu.reportError(
              `Failed to read photo information for ${node.id}: ` + ex
            );
          }
        }

        // Add the vCard.
        copy.properties.vCard = vCardProperties.toVCard();

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
  close() {
    addressBookCache.decrementListeners();
  }

  getAPI(context) {
    context.callOnClose(this);
    addressBookCache.incrementListeners();

    return {
      addressBooks: {
        async openUI() {
          let messengerWindow = windowTracker.topNormalWindow;
          let abWindow = await messengerWindow.toAddressBook();
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
            let listener = async (event, node) => {
              fire.sync(await addressBookCache.convert(node));
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
            let listener = async (event, node) => {
              fire.sync(await addressBookCache.convert(node));
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
        async getPhoto(id) {
          return getPhotoFile(id);
        },
        async setPhoto(id, file) {
          return setPhotoFile(id, file);
        },
        create(parentId, id, createData) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot create a contact in a read-only address book"
            );
          }

          let card;
          // A specified vCard is winning over any individual standard property.
          if (createData.vCard) {
            try {
              card = VCardUtils.vCardToAbCard(createData.vCard, id);
            } catch (ex) {
              throw new ExtensionError(
                `Invalid vCard data: ${createData.vCard}.`
              );
            }
          } else {
            card = flatPropertiesToAbCard(createData, id);
          }
          // Add custom properties to the property bag.
          addProperties(card, createData);

          // Check if the new card has an enforced UID.
          if (card.vCardProperties.getFirstValue("uid")) {
            let duplicateExists = false;
            try {
              // Second argument is only a hint, all address books are checked.
              addressBookCache.findContactById(card.UID, parentId);
              duplicateExists = true;
            } catch (ex) {
              // Do nothing. We want this to throw because no contact was found.
            }
            if (duplicateExists) {
              throw new ExtensionError(`Duplicate contact id: ${card.UID}`);
            }
          }

          let newCard = parentNode.item.addCard(card);
          return newCard.UID;
        },
        update(id, updateData) {
          let node = addressBookCache.findContactById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot modify a contact in a read-only address book"
            );
          }

          // A specified vCard is winning over any individual standard property.
          // While a vCard is replacing the entire contact, specified standard
          // properties only update single entries (setting a value to null
          // clears it / promotes the next value of the same kind).
          let card;
          if (updateData.vCard) {
            let vCardUID;
            try {
              card = new AddrBookCard();
              card.UID = node.item.UID;
              card.setProperty(
                "_vCard",
                VCardUtils.translateVCard21(updateData.vCard)
              );
              vCardUID = card.vCardProperties.getFirstValue("uid");
            } catch (ex) {
              throw new ExtensionError(
                `Invalid vCard data: ${updateData.vCard}.`
              );
            }
            if (vCardUID && vCardUID != node.item.UID) {
              throw new ExtensionError(
                `The card's UID ${node.item.UID} may not be changed: ${updateData.vCard}.`
              );
            }
          } else {
            // Get the current vCardProperties, build a propertyMap and create
            // vCardParsed which allows to identify all currently exposed entries
            // based on the typeName used in VCardUtils.jsm (e.g. adr.work).
            let vCardProperties = vCardPropertiesFromCard(node.item);
            let vCardParsed = VCardUtils._parse(vCardProperties.entries);
            let propertyMap = vCardProperties.toPropertyMap();

            // Save the old exposed state.
            let oldProperties = VCardProperties.fromPropertyMap(propertyMap);
            let oldParsed = VCardUtils._parse(oldProperties.entries);
            // Update the propertyMap.
            for (let [name, value] of Object.entries(updateData)) {
              propertyMap.set(name, value);
            }
            // Save the new exposed state.
            let newProperties = VCardProperties.fromPropertyMap(propertyMap);
            let newParsed = VCardUtils._parse(newProperties.entries);

            // Evaluate the differences and update the still existing entries,
            // mark removed items for deletion.
            let deleteLog = [];
            for (let typeName of oldParsed.keys()) {
              if (typeName == "version") {
                continue;
              }
              for (let idx = 0; idx < oldParsed.get(typeName).length; idx++) {
                if (
                  newParsed.has(typeName) &&
                  idx < newParsed.get(typeName).length
                ) {
                  let originalIndex = vCardParsed.get(typeName)[idx].index;
                  let newEntryIndex = newParsed.get(typeName)[idx].index;
                  vCardProperties.entries[originalIndex] =
                    newProperties.entries[newEntryIndex];
                  // Mark this item as handled.
                  newParsed.get(typeName)[idx] = null;
                } else {
                  deleteLog.push(vCardParsed.get(typeName)[idx].index);
                }
              }
            }

            // Remove entries which have been marked for deletion.
            for (let deleteIndex of deleteLog.sort((a, b) => a < b)) {
              vCardProperties.entries.splice(deleteIndex, 1);
            }

            // Add new entries.
            for (let typeName of newParsed.keys()) {
              if (typeName == "version") {
                continue;
              }
              for (let newEntry of newParsed.get(typeName)) {
                if (newEntry) {
                  vCardProperties.addEntry(
                    newProperties.entries[newEntry.index]
                  );
                }
              }
            }

            // Create a new card with the original UID from the updated vCardProperties.
            card = VCardUtils.vCardToAbCard(
              vCardProperties.toVCard(),
              node.item.UID
            );
          }

          // Clone original properties and update custom properties.
          addProperties(card, updateData, node.item.properties);

          parentNode.item.modifyCard(card);
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
            let listener = async (event, node) => {
              fire.sync(await addressBookCache.convert(node));
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
            let listener = async (event, node, changes) => {
              let filteredChanges = {};
              // Find changes in flat properties stored in the vCard.
              if (changes.hasOwnProperty("_vCard")) {
                let oldVCardProperties = VCardProperties.fromVCard(
                  changes._vCard.oldValue
                ).toPropertyMap();
                let newVCardProperties = VCardProperties.fromVCard(
                  changes._vCard.newValue
                ).toPropertyMap();
                for (let [name, value] of oldVCardProperties) {
                  if (newVCardProperties.get(name) != value) {
                    filteredChanges[name] = {
                      oldValue: value,
                      newValue: newVCardProperties.get(name) ?? null,
                    };
                  }
                }
                for (let [name, value] of newVCardProperties) {
                  if (
                    !filteredChanges.hasOwnProperty(name) &&
                    oldVCardProperties.get(name) != value
                  ) {
                    filteredChanges[name] = {
                      oldValue: oldVCardProperties.get(name) ?? null,
                      newValue: value,
                    };
                  }
                }
              }
              for (let [name, value] of Object.entries(changes)) {
                if (
                  !filteredChanges.hasOwnProperty(name) &&
                  isCustomProperty(name)
                ) {
                  filteredChanges[name] = value;
                }
              }
              fire.sync(await addressBookCache.convert(node), filteredChanges);
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
            let listener = async (event, node) => {
              fire.sync(await addressBookCache.convert(node));
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
            let listener = async (event, node) => {
              fire.sync(await addressBookCache.convert(node));
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
            let listener = async (event, node) => {
              fire.sync(await addressBookCache.convert(node));
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
