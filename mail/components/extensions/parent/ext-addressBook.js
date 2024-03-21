/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { AddrBookDirectory } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookDirectory.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["fetch", "File", "FileReader"]);

ChromeUtils.defineESModuleGetters(this, {
  AddrBookCard: "resource:///modules/AddrBookCard.sys.mjs",
  BANISHED_PROPERTIES: "resource:///modules/VCardUtils.sys.mjs",
  VCardProperties: "resource:///modules/VCardUtils.sys.mjs",
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
  VCardUtils: "resource:///modules/VCardUtils.sys.mjs",
  newUID: "resource:///modules/AddrBookUtils.sys.mjs",
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
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function (error) {
      reject(new ExtensionError(error));
    };
  });
}

/**
 * Returns the image type of the given contentType string, or throws if the
 * contentType is not an image type supported by the address book.
 *
 * @param {string} contentType - The contentType of a photo.
 * @returns {string} - Either "png" or "jpeg". Throws otherwise.
 */
function getImageType(contentType) {
  const typeParts = contentType.toLowerCase().split("/");
  if (typeParts[0] != "image" || !["jpeg", "png"].includes(typeParts[1])) {
    throw new ExtensionError(`Unsupported image format: ${contentType}`);
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
  const dataUrl = await getDataUrl(photoFile);
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
  const { item } = addressBookCache.findContactById(id);
  const photoUrl = item.photoURL;
  if (!photoUrl) {
    return null;
  }

  try {
    if (photoUrl.startsWith("file://")) {
      const realFile = Services.io
        .newURI(photoUrl)
        .QueryInterface(Ci.nsIFileURL).file;
      const file = await File.createFromNsIFile(realFile);
      const type = getImageType(file.type);
      // Clone the File object to be able to give it the correct name, matching
      // the dataUrl/webUrl code path below.
      return new File([file], `${id}.${type}`, { type: `image/${type}` });
    }

    // Retrieve dataUrls or webUrls.
    const result = await fetch(photoUrl);
    const type = getImageType(result.headers.get("content-type"));
    const blob = await result.blob();
    return new File([blob], `${id}.${type}`, { type: `image/${type}` });
  } catch (ex) {
    console.error(`Failed to read photo information for ${id}: ` + ex);
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
  const node = addressBookCache.findContactById(id);
  const vCardProperties = vCardPropertiesFromCard(node.item);

  try {
    const type = getImageType(file.type);

    // If the contact already has a photoUrl, replace it with the same url type.
    // Otherwise save the photo as a local file, except for CardDAV contacts.
    const photoUrl = node.item.photoURL;
    const parentNode = addressBookCache.findAddressBookById(node.parentId);
    const useFile = photoUrl
      ? photoUrl.startsWith("file://")
      : parentNode.item.dirType != Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE;

    if (useFile) {
      let oldPhotoFile;
      if (photoUrl) {
        try {
          oldPhotoFile = Services.io
            .newURI(photoUrl)
            .QueryInterface(Ci.nsIFileURL).file;
        } catch (ex) {
          console.error(`Ignoring invalid photoUrl ${photoUrl}: ` + ex);
        }
      }
      const pathPhotoFile = await IOUtils.createUniqueFile(
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
        const buffer = await file.arrayBuffer();
        await IOUtils.write(pathPhotoFile, new Uint8Array(buffer));
      }

      // Set the PhotoName.
      node.item.setProperty("PhotoName", PathUtils.filename(pathPhotoFile));

      // Delete the old photo file.
      if (oldPhotoFile?.exists()) {
        try {
          await IOUtils.remove(oldPhotoFile.path);
        } catch (ex) {
          console.error(`Failed to delete old photo file for ${id}: ` + ex);
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
  const vCard = VCardProperties.fromPropertyMap(
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
  const updates = Object.entries(updateProperties).filter(e =>
    isCustomProperty(e[0])
  );
  const mergedProperties = originalProperties
    ? new Map([
        ...Array.from(originalProperties, p => [p.name, p.value]),
        ...updates,
      ])
    : new Map(updates);

  for (const [name, value] of mergedProperties) {
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
 *
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
      if (this.fire.wakeup) {
        await this.fire.wakeup();
      }
      const { results, isCompleteResult } = await this.fire.async(
        await addressBookCache.convert(
          addressBookCache.addressBooks.get(this.UID)
        ),
        aSearchString,
        aQuery
      );
      for (const resultData of results) {
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
    const node = {
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
    for (const contact of mailingList.item.childCards) {
      const newNode = this._makeContactNode(contact, mailingList.item);
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
    for (const contact of addressBook.item.childCards) {
      if (!contact.isMailList) {
        const newNode = this._makeContactNode(contact, addressBook.item);
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
    for (const mailingList of parent.item.childNodes) {
      const newNode = this._makeDirectoryNode(mailingList, parent.item);
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
      for (const tld of MailServices.ab.directories) {
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
    const addressBook = this.addressBooks.get(id);
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
    for (const addressBook of this.addressBooks.values()) {
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
    for (const addressBook of this.addressBooks.values()) {
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
      const cards = await Promise.allSettled(
        node.map(i => this.convert(i, complete))
      );
      return cards.filter(card => card.value).map(card => card.value);
    }

    const copy = {};
    for (const key of ["id", "parentId", "type"]) {
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
        const vCardProperties = vCardPropertiesFromCard(node.item).clone();
        copy.properties = {};

        // Build a flat property list from vCardProperties.
        for (const [name, value] of vCardProperties.toPropertyMap()) {
          copy.properties[name] = "" + value;
        }

        // Return all other exposed properties stored in the nodes property bag.
        for (const property of Array.from(node.item.properties).filter(e =>
          isCustomProperty(e.name)
        )) {
          copy.properties[property.name] = "" + property.value;
        }

        // If this card has no photo vCard entry, but a local photo, add it to its vCard: Thunderbird
        // does not store photos of local address books in the internal _vCard property, to reduce
        // the amount of data stored in its database.
        const photoName = node.item.getProperty("PhotoName", "");
        const vCardPhoto = vCardProperties.getFirstValue("photo");
        if (!vCardPhoto && photoName) {
          try {
            const realPhotoFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
            realPhotoFile.append("Photos");
            realPhotoFile.append(photoName);
            const photoFile = await File.createFromNsIFile(realPhotoFile);
            await addVCardPhotoEntry(vCardProperties, photoFile);
          } catch (ex) {
            console.error(
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
      case "mailingList": {
        copy.name = node.item.dirName;
        copy.nickName = node.item.listNickName;
        copy.description = node.item.description;
        const parentNode = this.findAddressBookById(node.parentId);
        copy.readOnly = parentNode.item.readOnly;
        copy.remote = parentNode.item.isRemote;
        break;
      }
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

        const newNode = this._makeDirectoryNode(subject);
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

        const uid = subject.UID;
        if (this._addressBooks?.has(uid)) {
          const parentNode = this._addressBooks.get(uid);
          if (parentNode.contacts) {
            for (const id of parentNode.contacts.keys()) {
              this._contacts.delete(id);
            }
          }
          if (parentNode.mailingLists) {
            for (const id of parentNode.mailingLists.keys()) {
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

        const parent = MailServices.ab.getDirectoryFromUID(data);
        const newNode = this._makeContactNode(subject, parent);
        if (this._addressBooks?.has(data)) {
          const parentNode = this._addressBooks.get(data);
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

        const parentUID = subject.directoryUID;
        const parent = MailServices.ab.getDirectoryFromUID(parentUID);
        const newNode = this._makeContactNode(subject, parent);
        if (this._addressBooks?.has(parentUID)) {
          const parentNode = this._addressBooks.get(parentUID);
          if (parentNode.contacts) {
            parentNode.contacts.set(newNode.id, newNode);
            this._contacts.set(newNode.id, newNode);
          }
          if (parentNode.mailingLists) {
            for (const mailingList of parentNode.mailingLists.values()) {
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

        const uid = subject.UID;
        this._contacts.delete(uid);
        if (this._addressBooks?.has(data)) {
          const parentNode = this._addressBooks.get(data);
          if (parentNode.contacts) {
            parentNode.contacts.delete(uid);
          }
        }

        this.emit("contact-deleted", data, uid);
        break;
      }
      case "addrbook-list-created": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        const parent = MailServices.ab.getDirectoryFromUID(data);
        const newNode = this._makeDirectoryNode(subject, parent);
        if (this._addressBooks?.has(data)) {
          const parentNode = this._addressBooks.get(data);
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

        const listNode = this.findMailingListById(subject.UID);
        listNode.item = subject;

        this.emit("mailing-list-updated", listNode);
        break;
      }
      case "addrbook-list-deleted": {
        subject.QueryInterface(Ci.nsIAbDirectory);

        const uid = subject.UID;
        this._mailingLists.delete(uid);
        if (this._addressBooks?.has(data)) {
          const parentNode = this._addressBooks.get(data);
          if (parentNode.mailingLists) {
            parentNode.mailingLists.delete(uid);
          }
        }

        this.emit("mailing-list-deleted", data, uid);
        break;
      }
      case "addrbook-list-member-added": {
        subject.QueryInterface(Ci.nsIAbCard);

        const parentNode = this.findMailingListById(data);
        const newNode = this._makeContactNode(subject, parentNode.item);
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

        const uid = subject.UID;
        if (this._mailingLists.has(data)) {
          const parentNode = this._mailingLists.get(data);
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
      for (const topic of this._notifications) {
        Services.obs.addObserver(this, topic);
      }
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      for (const topic of this._notifications) {
        Services.obs.removeObserver(this, topic);
      }

      this.flush();
    }
  }
})();

this.addressBook = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    // addressBooks.*
    onAddressBookCreated({ context, fire }) {
      const listener = async (event, node) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(await addressBookCache.convert(node));
      };
      addressBookCache.on("address-book-created", listener);
      return {
        unregister: () => {
          addressBookCache.off("address-book-created", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onAddressBookUpdated({ context, fire }) {
      const listener = async (event, node) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(await addressBookCache.convert(node));
      };
      addressBookCache.on("address-book-updated", listener);
      return {
        unregister: () => {
          addressBookCache.off("address-book-updated", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onAddressBookDeleted({ context, fire }) {
      const listener = async (event, itemUID) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(itemUID);
      };
      addressBookCache.on("address-book-deleted", listener);
      return {
        unregister: () => {
          addressBookCache.off("address-book-deleted", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },

    // contacts.*
    onContactCreated({ context, fire }) {
      const listener = async (event, node) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(await addressBookCache.convert(node));
      };
      addressBookCache.on("contact-created", listener);
      return {
        unregister: () => {
          addressBookCache.off("contact-created", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onContactUpdated({ context, fire }) {
      const listener = async (event, node, changes) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        const filteredChanges = {};
        // Find changes in flat properties stored in the vCard.
        if (changes.hasOwnProperty("_vCard")) {
          const oldVCardProperties = VCardProperties.fromVCard(
            changes._vCard.oldValue
          ).toPropertyMap();
          const newVCardProperties = VCardProperties.fromVCard(
            changes._vCard.newValue
          ).toPropertyMap();
          for (const [name, value] of oldVCardProperties) {
            if (newVCardProperties.get(name) != value) {
              filteredChanges[name] = {
                oldValue: value,
                newValue: newVCardProperties.get(name) ?? null,
              };
            }
          }
          for (const [name, value] of newVCardProperties) {
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
        for (const [name, value] of Object.entries(changes)) {
          if (!filteredChanges.hasOwnProperty(name) && isCustomProperty(name)) {
            filteredChanges[name] = value;
          }
        }
        fire.sync(await addressBookCache.convert(node), filteredChanges);
      };
      addressBookCache.on("contact-updated", listener);
      return {
        unregister: () => {
          addressBookCache.off("contact-updated", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onContactDeleted({ context, fire }) {
      const listener = async (event, parentUID, itemUID) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(parentUID, itemUID);
      };
      addressBookCache.on("contact-deleted", listener);
      return {
        unregister: () => {
          addressBookCache.off("contact-deleted", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },

    // mailingLists.*
    onMailingListCreated({ context, fire }) {
      const listener = async (event, node) => {
        fire.sync(await addressBookCache.convert(node));
      };
      addressBookCache.on("mailing-list-created", listener);
      return {
        unregister: () => {
          addressBookCache.off("mailing-list-created", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMailingListUpdated({ context, fire }) {
      const listener = async (event, node) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(await addressBookCache.convert(node));
      };
      addressBookCache.on("mailing-list-updated", listener);
      return {
        unregister: () => {
          addressBookCache.off("mailing-list-updated", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMailingListDeleted({ context, fire }) {
      const listener = async (event, parentUID, itemUID) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(parentUID, itemUID);
      };
      addressBookCache.on("mailing-list-deleted", listener);
      return {
        unregister: () => {
          addressBookCache.off("mailing-list-deleted", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMemberAdded({ context, fire }) {
      const listener = async (event, node) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(await addressBookCache.convert(node));
      };
      addressBookCache.on("mailing-list-member-added", listener);
      return {
        unregister: () => {
          addressBookCache.off("mailing-list-member-added", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMemberRemoved({ context, fire }) {
      const listener = async (event, parentUID, itemUID) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(parentUID, itemUID);
      };
      addressBookCache.on("mailing-list-member-removed", listener);
      return {
        unregister: () => {
          addressBookCache.off("mailing-list-member-removed", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  constructor(...args) {
    super(...args);
    addressBookCache.incrementListeners();
  }

  onShutdown() {
    addressBookCache.decrementListeners();
  }

  getAPI(context) {
    const { extension } = context;
    const { tabManager } = extension;

    return {
      addressBooks: {
        async openUI() {
          const messengerWindow = windowTracker.topNormalWindow;
          const abWindow = await messengerWindow.toAddressBook();
          await new Promise(resolve => abWindow.setTimeout(resolve));
          const abTab = messengerWindow.document
            .getElementById("tabmail")
            .tabInfo.find(t => t.mode.name == "addressBookTab");
          return tabManager.convert(abTab);
        },
        async closeUI() {
          for (const win of Services.wm.getEnumerator("mail:3pane")) {
            const tabmail = win.document.getElementById("tabmail");
            for (const tab of tabmail.tabInfo.slice()) {
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
          const dirName = MailServices.ab.newAddressBook(
            name,
            "",
            Ci.nsIAbManager.JS_DIRECTORY_TYPE
          );
          const directory = MailServices.ab.getDirectoryFromId(dirName);
          return directory.UID;
        },
        update(id, { name }) {
          const node = addressBookCache.findAddressBookById(id);
          node.item.dirName = name;
        },
        async delete(id) {
          const node = addressBookCache.findAddressBookById(id);
          const deletePromise = new Promise(resolve => {
            const listener = () => {
              addressBookCache.off("address-book-deleted", listener);
              resolve();
            };
            addressBookCache.on("address-book-deleted", listener);
          });
          MailServices.ab.deleteAddressBook(node.item.URI);
          await deletePromise;
        },

        // The module name is addressBook as defined in ext-mail.json.
        onCreated: new EventManager({
          context,
          module: "addressBook",
          event: "onAddressBookCreated",
          extensionApi: this,
        }).api(),
        onUpdated: new EventManager({
          context,
          module: "addressBook",
          event: "onAddressBookUpdated",
          extensionApi: this,
        }).api(),
        onDeleted: new EventManager({
          context,
          module: "addressBook",
          event: "onAddressBookDeleted",
          extensionApi: this,
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
              const dir = new ExtSearchBook(fire, context, args);
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
          const parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(
            addressBookCache.getContacts(parentNode),
            false
          );
        },
        async quickSearch(parentId, queryInfo) {
          const { getSearchTokens, getModelQuery, generateQueryURI } =
            ChromeUtils.importESModule(
              "resource:///modules/ABQueryUtils.sys.mjs"
            );

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

          const searchWords = getSearchTokens(searchString);
          if (searchWords.length == 0) {
            return [];
          }
          const searchFormat = getModelQuery(
            "mail.addr_book.quicksearchquery.format"
          );
          const searchQuery = generateQueryURI(searchFormat, searchWords);

          let booksToSearch;
          if (parentId == null) {
            booksToSearch = [...addressBookCache.addressBooks.values()];
          } else {
            booksToSearch = [addressBookCache.findAddressBookById(parentId)];
          }

          const results = [];
          const promises = [];
          for (const book of booksToSearch) {
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
          const parentNode = addressBookCache.findAddressBookById(parentId);
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

          const newCard = parentNode.item.addCard(card);
          return newCard.UID;
        },
        update(id, updateData) {
          const node = addressBookCache.findContactById(id);
          const parentNode = addressBookCache.findAddressBookById(
            node.parentId
          );
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
            // based on the typeName used in VCardUtils.sys.mjs (e.g. adr.work).
            const vCardProperties = vCardPropertiesFromCard(node.item);
            const vCardParsed = VCardUtils._parse(vCardProperties.entries);
            const propertyMap = vCardProperties.toPropertyMap();

            // Save the old exposed state.
            const oldProperties = VCardProperties.fromPropertyMap(propertyMap);
            const oldParsed = VCardUtils._parse(oldProperties.entries);
            // Update the propertyMap.
            for (const [name, value] of Object.entries(updateData)) {
              propertyMap.set(name, value);
            }
            // Save the new exposed state.
            const newProperties = VCardProperties.fromPropertyMap(propertyMap);
            const newParsed = VCardUtils._parse(newProperties.entries);

            // Evaluate the differences and update the still existing entries,
            // mark removed items for deletion.
            const deleteLog = [];
            for (const typeName of oldParsed.keys()) {
              if (typeName == "version") {
                continue;
              }
              for (let idx = 0; idx < oldParsed.get(typeName).length; idx++) {
                if (
                  newParsed.has(typeName) &&
                  idx < newParsed.get(typeName).length
                ) {
                  const originalIndex = vCardParsed.get(typeName)[idx].index;
                  const newEntryIndex = newParsed.get(typeName)[idx].index;
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
            for (const deleteIndex of deleteLog.sort((a, b) => a < b)) {
              vCardProperties.entries.splice(deleteIndex, 1);
            }

            // Add new entries.
            for (const typeName of newParsed.keys()) {
              if (typeName == "version") {
                continue;
              }
              for (const newEntry of newParsed.get(typeName)) {
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
          const node = addressBookCache.findContactById(id);
          const parentNode = addressBookCache.findAddressBookById(
            node.parentId
          );
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot delete a contact in a read-only address book"
            );
          }

          parentNode.item.deleteCards([node.item]);
        },

        // The module name is addressBook as defined in ext-mail.json.
        onCreated: new EventManager({
          context,
          module: "addressBook",
          event: "onContactCreated",
          extensionApi: this,
        }).api(),
        onUpdated: new EventManager({
          context,
          module: "addressBook",
          event: "onContactUpdated",
          extensionApi: this,
        }).api(),
        onDeleted: new EventManager({
          context,
          module: "addressBook",
          event: "onContactDeleted",
          extensionApi: this,
        }).api(),
      },
      mailingLists: {
        list(parentId) {
          const parentNode = addressBookCache.findAddressBookById(parentId);
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
          const parentNode = addressBookCache.findAddressBookById(parentId);
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot create a mailing list in a read-only address book"
            );
          }
          const mailList = Cc[
            "@mozilla.org/addressbook/directoryproperty;1"
          ].createInstance(Ci.nsIAbDirectory);
          mailList.isMailList = true;
          mailList.dirName = name;
          mailList.listNickName = nickName === null ? "" : nickName;
          mailList.description = description === null ? "" : description;

          const newMailList = parentNode.item.addMailList(mailList);
          return newMailList.UID;
        },
        update(id, { name, nickName, description }) {
          const node = addressBookCache.findMailingListById(id);
          const parentNode = addressBookCache.findAddressBookById(
            node.parentId
          );
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
          const node = addressBookCache.findMailingListById(id);
          const parentNode = addressBookCache.findAddressBookById(
            node.parentId
          );
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot delete a mailing list in a read-only address book"
            );
          }
          parentNode.item.deleteDirectory(node.item);
        },

        listMembers(id) {
          const node = addressBookCache.findMailingListById(id);
          return addressBookCache.convert(
            addressBookCache.getListContacts(node),
            false
          );
        },
        addMember(id, contactId) {
          const node = addressBookCache.findMailingListById(id);
          const parentNode = addressBookCache.findAddressBookById(
            node.parentId
          );
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot add to a mailing list in a read-only address book"
            );
          }
          const contactNode = addressBookCache.findContactById(contactId);
          node.item.addCard(contactNode.item);
        },
        removeMember(id, contactId) {
          const node = addressBookCache.findMailingListById(id);
          const parentNode = addressBookCache.findAddressBookById(
            node.parentId
          );
          if (parentNode.item.readOnly) {
            throw new ExtensionUtils.ExtensionError(
              "Cannot remove from a mailing list in a read-only address book"
            );
          }
          const contactNode = addressBookCache.findContactById(contactId);

          node.item.deleteCards([contactNode.item]);
        },

        // The module name is addressBook as defined in ext-mail.json.
        onCreated: new EventManager({
          context,
          module: "addressBook",
          event: "onMailingListCreated",
          extensionApi: this,
        }).api(),
        onUpdated: new EventManager({
          context,
          module: "addressBook",
          event: "onMailingListUpdated",
          extensionApi: this,
        }).api(),
        onDeleted: new EventManager({
          context,
          module: "addressBook",
          event: "onMailingListDeleted",
          extensionApi: this,
        }).api(),
        onMemberAdded: new EventManager({
          context,
          module: "addressBook",
          event: "onMemberAdded",
          extensionApi: this,
        }).api(),
        onMemberRemoved: new EventManager({
          context,
          module: "addressBook",
          event: "onMemberRemoved",
          extensionApi: this,
        }).api(),
      },
    };
  }
};
