/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookDirectory"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AddrBookCard: "resource:///modules/AddrBookCard.jsm",
  AddrBookMailingList: "resource:///modules/AddrBookMailingList.jsm",
  compareAddressBooks: "resource:///modules/AddrBookUtils.jsm",
  newUID: "resource:///modules/AddrBookUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

/**
 * Abstract base class implementing nsIAbDirectory.
 *
 * @abstract
 * @implements {nsIAbDirectory}
 */
class AddrBookDirectory {
  QueryInterface = ChromeUtils.generateQI(["nsIAbDirectory"]);

  constructor() {
    this._uid = null;
    this._dirName = null;
  }

  _initialized = false;
  init(uri) {
    if (this._initialized) {
      throw new Components.Exception(
        `Directory already initialized: ${uri}`,
        Cr.NS_ERROR_ALREADY_INITIALIZED
      );
    }

    // If this._readOnly is true, the user is prevented from making changes to
    // the contacts. Subclasses may override this (for example to sync with a
    // server) by setting this._overrideReadOnly to true, but must clear it
    // before yielding to another thread (e.g. awaiting a Promise).

    if (this._dirPrefId) {
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "_readOnly",
        `${this.dirPrefId}.readOnly`,
        false
      );
    }

    this._initialized = true;
  }
  async cleanUp() {
    if (!this._initialized) {
      throw new Components.Exception(
        "Directory not initialized",
        Cr.NS_ERROR_NOT_INITIALIZED
      );
    }
  }

  get _prefBranch() {
    if (this.__prefBranch) {
      return this.__prefBranch;
    }
    if (!this._dirPrefId) {
      throw Components.Exception("No dirPrefId!", Cr.NS_ERROR_NOT_AVAILABLE);
    }
    return (this.__prefBranch = Services.prefs.getBranch(
      `${this._dirPrefId}.`
    ));
  }
  /** @abstract */
  get lists() {
    throw new Components.Exception(
      `${this.constructor.name} does not implement lists getter.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  /** @abstract */
  get cards() {
    throw new Components.Exception(
      `${this.constructor.name} does not implement cards getter.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  getCard(uid) {
    let card = new AddrBookCard();
    card.directoryUID = this.UID;
    card._uid = uid;
    card._properties = this.loadCardProperties(uid);
    return card.QueryInterface(Ci.nsIAbCard);
  }
  /** @abstract */
  loadCardProperties(uid) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement loadCardProperties.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  /** @abstract */
  saveCardProperties(card) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement saveCardProperties.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  /** @abstract */
  deleteCard(uid) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement deleteCard.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  /** @abstract */
  saveList(list) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement saveList.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  /** @abstract */
  deleteList(uid) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement deleteList.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /* nsIAbDirectory */

  get readOnly() {
    return this._readOnly;
  }
  get isRemote() {
    return false;
  }
  get isSecure() {
    return false;
  }
  get propertiesChromeURI() {
    return "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";
  }
  get dirPrefId() {
    return this._dirPrefId;
  }
  get dirName() {
    if (this._dirName === null) {
      this._dirName = this.getLocalizedStringValue("description", "");
    }
    return this._dirName;
  }
  set dirName(value) {
    this.setLocalizedStringValue("description", value);
    this._dirName = value;
    Services.obs.notifyObservers(this, "addrbook-directory-updated", "DirName");
  }
  get dirType() {
    return Ci.nsIAbManager.JS_DIRECTORY_TYPE;
  }
  get fileName() {
    return this._fileName;
  }
  get UID() {
    if (!this._uid) {
      if (this._prefBranch.getPrefType("uid") == Services.prefs.PREF_STRING) {
        this._uid = this._prefBranch.getStringPref("uid");
      } else {
        this._uid = newUID();
        this._prefBranch.setStringPref("uid", this._uid);
      }
    }
    return this._uid;
  }
  get URI() {
    return this._uri;
  }
  get position() {
    return this._prefBranch.getIntPref("position", 1);
  }
  get childNodes() {
    let lists = Array.from(
      this.lists.values(),
      list =>
        new AddrBookMailingList(
          list.uid,
          this,
          list.name,
          list.nickName,
          list.description
        ).asDirectory
    );
    lists.sort(compareAddressBooks);
    return lists;
  }
  get childCards() {
    let results = Array.from(
      this.lists.values(),
      list =>
        new AddrBookMailingList(
          list.uid,
          this,
          list.name,
          list.nickName,
          list.description
        ).asCard
    ).concat(Array.from(this.cards.keys(), this.getCard, this));

    return results;
  }
  get supportsMailingLists() {
    return true;
  }

  search(query, string, listener) {
    if (!listener) {
      return;
    }
    if (!query) {
      listener.onSearchFinished(Cr.NS_ERROR_FAILURE, true, null, "");
      return;
    }
    if (query[0] == "?") {
      query = query.substring(1);
    }

    let results = Array.from(
      this.lists.values(),
      list =>
        new AddrBookMailingList(
          list.uid,
          this,
          list.name,
          list.nickName,
          list.description
        ).asCard
    ).concat(Array.from(this.cards.keys(), this.getCard, this));

    // Process the query string into a tree of conditions to match.
    let lispRegexp = /^\((and|or|not|([^\)]*)(\)+))/;
    let index = 0;
    let rootQuery = { children: [], op: "or" };
    let currentQuery = rootQuery;

    while (true) {
      let match = lispRegexp.exec(query.substring(index));
      if (!match) {
        break;
      }
      index += match[0].length;

      if (["and", "or", "not"].includes(match[1])) {
        // For the opening bracket, step down a level.
        let child = {
          parent: currentQuery,
          children: [],
          op: match[1],
        };
        currentQuery.children.push(child);
        currentQuery = child;
      } else {
        let [name, condition, value] = match[2].split(",");
        currentQuery.children.push({
          name,
          condition,
          value: decodeURIComponent(value).toLowerCase(),
        });

        // For each closing bracket except the first, step up a level.
        for (let i = match[3].length - 1; i > 0; i--) {
          currentQuery = currentQuery.parent;
        }
      }
    }

    results = results.filter(card => {
      let properties;
      if (card.isMailList) {
        properties = new Map([
          ["DisplayName", card.displayName],
          ["NickName", card.getProperty("NickName", "")],
          ["Notes", card.getProperty("Notes", "")],
        ]);
      } else {
        properties = card._properties;
      }
      let matches = b => {
        if ("condition" in b) {
          let { name, condition, value } = b;
          if (name == "IsMailList" && condition == "=") {
            return card.isMailList == (value == "true");
          }
          let cardValue = properties.get(name);
          if (!cardValue) {
            return condition == "!ex";
          }
          if (condition == "ex") {
            return true;
          }

          cardValue = cardValue.toLowerCase();
          switch (condition) {
            case "=":
              return cardValue == value;
            case "!=":
              return cardValue != value;
            case "lt":
              return cardValue < value;
            case "gt":
              return cardValue > value;
            case "bw":
              return cardValue.startsWith(value);
            case "ew":
              return cardValue.endsWith(value);
            case "c":
              return cardValue.includes(value);
            case "!c":
              return !cardValue.includes(value);
            case "~=":
            case "regex":
            default:
              return false;
          }
        }
        if (b.op == "or") {
          return b.children.some(bb => matches(bb));
        }
        if (b.op == "and") {
          return b.children.every(bb => matches(bb));
        }
        if (b.op == "not") {
          return !matches(b.children[0]);
        }
        return false;
      };

      return matches(rootQuery);
    }, this);

    for (let card of results) {
      listener.onSearchFoundCard(card);
    }
    listener.onSearchFinished(Cr.NS_OK, true, null, "");
  }
  generateName(generateFormat, bundle) {
    return this.dirName;
  }
  cardForEmailAddress(emailAddress) {
    return (
      this.getCardFromProperty("PrimaryEmail", emailAddress, false) ||
      this.getCardFromProperty("SecondEmail", emailAddress, false)
    );
  }
  /** @abstract */
  getCardFromProperty(property, value, caseSensitive) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement getCardFromProperty.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  /** @abstract */
  getCardsFromProperty(property, value, caseSensitive) {
    throw new Components.Exception(
      `${this.constructor.name} does not implement getCardsFromProperty.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  getMailListFromName(name) {
    for (let list of this.lists.values()) {
      if (list.name.toLowerCase() == name.toLowerCase()) {
        return new AddrBookMailingList(
          list.uid,
          this,
          list.name,
          list.nickName,
          list.description
        ).asDirectory;
      }
    }
    return null;
  }
  deleteDirectory(directory) {
    if (this._readOnly) {
      throw new Components.Exception(
        "Directory is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    let list = this.lists.get(directory.UID);
    list = new AddrBookMailingList(
      list.uid,
      this,
      list.name,
      list.nickName,
      list.description
    );

    this.deleteList(directory.UID);

    Services.obs.notifyObservers(
      list.asDirectory,
      "addrbook-list-deleted",
      this.UID
    );
  }
  hasCard(card) {
    return this.lists.has(card.UID) || this.cards.has(card.UID);
  }
  hasDirectory(dir) {
    return this.lists.has(dir.UID);
  }
  hasMailListWithName(name) {
    return this.getMailListFromName(name) != null;
  }
  addCard(card) {
    return this.dropCard(card, false);
  }
  modifyCard(card) {
    if (this._readOnly && !this._overrideReadOnly) {
      throw new Components.Exception(
        "Directory is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    let oldProperties = this.loadCardProperties(card.UID);
    let changedProperties = new Set(oldProperties.keys());

    for (let { name, value } of card.properties) {
      if (!oldProperties.has(name) && ![null, undefined, ""].includes(value)) {
        changedProperties.add(name);
      } else if (oldProperties.get(name) == value) {
        changedProperties.delete(name);
      }
    }
    changedProperties.delete("LastModifiedDate");

    this.saveCardProperties(card);

    if (changedProperties.size == 0) {
      return;
    }

    // Send the card as it is in this directory, not as passed to this function.
    card = this.getCard(card.UID);
    Services.obs.notifyObservers(card, "addrbook-contact-updated", this.UID);

    let data = {};

    for (let name of changedProperties) {
      data[name] = {
        oldValue: oldProperties.get(name) || null,
        newValue: card.getProperty(name, null),
      };
    }

    Services.obs.notifyObservers(
      card,
      "addrbook-contact-properties-updated",
      JSON.stringify(data)
    );
  }
  deleteCards(cards) {
    if (this._readOnly && !this._overrideReadOnly) {
      throw new Components.Exception(
        "Directory is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    if (cards === null) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_POINTER);
    }

    for (let card of cards) {
      this.deleteCard(card.UID);
      if (this.hasOwnProperty("cards")) {
        this.cards.delete(card.UID);
      }
    }

    for (let card of cards) {
      Services.obs.notifyObservers(card, "addrbook-contact-deleted", this.UID);
      card.directoryUID = null;
    }

    // We could just delete all non-existent cards from list_cards, but a
    // notification should be fired for each one. Let the list handle that.
    for (let list of this.childNodes) {
      list.deleteCards(cards);
    }
  }
  dropCard(card, needToCopyCard) {
    if (this._readOnly && !this._overrideReadOnly) {
      throw new Components.Exception(
        "Directory is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    if (!card.UID) {
      throw new Error("Card must have a UID to be added to this directory.");
    }

    let newCard = new AddrBookCard();
    newCard.directoryUID = this.UID;
    newCard._uid = needToCopyCard ? newUID() : card.UID;

    if (this.hasOwnProperty("cards")) {
      this.cards.set(newCard._uid, new Map());
    }

    for (let { name, value } of card.properties) {
      if (
        [
          "DbRowID",
          "LowercasePrimaryEmail",
          "LowercaseSecondEmail",
          "RecordKey",
          "UID",
        ].includes(name)
      ) {
        // These properties are either stored elsewhere (DbRowID, UID), or no
        // longer needed. Don't store them.
        continue;
      }
      if (card.directoryUID && ["_etag", "_href"].includes(name)) {
        // These properties belong to a different directory. Don't keep them.
        continue;
      }
      newCard.setProperty(name, value);
    }
    this.saveCardProperties(newCard);

    Services.obs.notifyObservers(newCard, "addrbook-contact-created", this.UID);

    return newCard;
  }
  useForAutocomplete(identityKey) {
    return (
      Services.prefs.getBoolPref("mail.enable_autocomplete") &&
      this.getBoolValue("enable_autocomplete", true)
    );
  }
  addMailList(list) {
    if (this._readOnly) {
      throw new Components.Exception(
        "Directory is read-only",
        Cr.NS_ERROR_FAILURE
      );
    }

    if (!list.isMailList) {
      throw Components.Exception(
        "Can't add; not a mail list",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    // Check if the new name is empty.
    if (!list.dirName) {
      throw new Components.Exception(
        `Mail list name must be set; list.dirName=${list.dirName}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }

    // Check if the new name contains 2 spaces.
    if (list.dirName.match("  ")) {
      throw new Components.Exception(
        `Invalid mail list name: ${list.dirName}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }

    // Check if the new name contains the following special characters.
    for (let char of ',;"<>') {
      if (list.dirName.includes(char)) {
        throw new Components.Exception(
          `Invalid mail list name: ${list.dirName}`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
      }
    }

    let newList = new AddrBookMailingList(
      newUID(),
      this,
      list.dirName || "",
      list.listNickName || "",
      list.description || ""
    );
    this.saveList(newList);

    let newListDirectory = newList.asDirectory;
    Services.obs.notifyObservers(
      newListDirectory,
      "addrbook-list-created",
      this.UID
    );
    return newListDirectory;
  }
  editMailListToDatabase(listCard) {
    // Deliberately not implemented, this isn't a mailing list.
    throw Components.Exception(
      "editMailListToDatabase not relevant here",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  copyMailList(srcList) {
    // Deliberately not implemented, this isn't a mailing list.
    throw Components.Exception(
      "copyMailList not relevant here",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  getIntValue(name, defaultValue) {
    return this._prefBranch
      ? this._prefBranch.getIntPref(name, defaultValue)
      : defaultValue;
  }
  getBoolValue(name, defaultValue) {
    return this._prefBranch
      ? this._prefBranch.getBoolPref(name, defaultValue)
      : defaultValue;
  }
  getStringValue(name, defaultValue) {
    return this._prefBranch
      ? this._prefBranch.getStringPref(name, defaultValue)
      : defaultValue;
  }
  getLocalizedStringValue(name, defaultValue) {
    if (!this._prefBranch) {
      return defaultValue;
    }
    if (this._prefBranch.getPrefType(name) == Ci.nsIPrefBranch.PREF_INVALID) {
      return defaultValue;
    }
    try {
      return this._prefBranch.getComplexValue(name, Ci.nsIPrefLocalizedString)
        .data;
    } catch (e) {
      // getComplexValue doesn't work with autoconfig.
      return this._prefBranch.getStringPref(name);
    }
  }
  setIntValue(name, value) {
    this._prefBranch.setIntPref(name, value);
  }
  setBoolValue(name, value) {
    this._prefBranch.setBoolPref(name, value);
  }
  setStringValue(name, value) {
    this._prefBranch.setStringPref(name, value);
  }
  setLocalizedStringValue(name, value) {
    let valueLocal = Cc["@mozilla.org/pref-localizedstring;1"].createInstance(
      Ci.nsIPrefLocalizedString
    );
    valueLocal.data = value;
    this._prefBranch.setComplexValue(
      name,
      Ci.nsIPrefLocalizedString,
      valueLocal
    );
  }
}
