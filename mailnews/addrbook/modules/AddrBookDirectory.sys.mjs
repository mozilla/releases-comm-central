/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddrBookCard: "resource:///modules/AddrBookCard.sys.mjs",
  AddrBookMailingList: "resource:///modules/AddrBookMailingList.sys.mjs",
  BANISHED_PROPERTIES: "resource:///modules/VCardUtils.sys.mjs",
  VCardProperties: "resource:///modules/VCardUtils.sys.mjs",
  compareAddressBooks: "resource:///modules/AddrBookUtils.sys.mjs",
  newUID: "resource:///modules/AddrBookUtils.sys.mjs",
});

/**
 * Abstract base class implementing nsIAbDirectory.
 *
 * @abstract
 * @implements {nsIAbDirectory}
 */
export class AddrBookDirectory {
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
    const card = new lazy.AddrBookCard();
    card.directoryUID = this.UID;
    card._uid = uid;
    card._properties = this.loadCardProperties(uid);
    card._isGoogleCardDAV = this._isGoogleCardDAV;
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
  saveCardProperties(uid, properties) {
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
  /**
   * Create a Map of the properties to record when saving `card`, including
   * any changes we want to make just before saving.
   *
   * @param {nsIAbCard} card
   * @param {?string} uid
   * @returns {Map<string, string>}
   */
  prepareToSaveCard(card, uid) {
    const propertyMap = new Map(
      Array.from(card.properties, p => [p.name, p.value])
    );
    const newProperties = new Map();

    // Get a VCardProperties object for the card.
    let vCardProperties;
    if (card.supportsVCard) {
      vCardProperties = card.vCardProperties;
    } else {
      vCardProperties = lazy.VCardProperties.fromPropertyMap(propertyMap);
    }

    if (uid) {
      // Force the UID to be as passed.
      vCardProperties.clearValues("uid");
      vCardProperties.addValue("uid", uid);
    } else if (vCardProperties.getFirstValue("uid") != card.UID) {
      vCardProperties.clearValues("uid");
      vCardProperties.addValue("uid", card.UID);
    }

    // Collect only the properties we intend to keep.
    for (const [name, value] of propertyMap) {
      if (lazy.BANISHED_PROPERTIES.includes(name)) {
        continue;
      }
      if (value !== null && value !== undefined && value !== "") {
        newProperties.set(name, value);
      }
    }

    // Add the vCard and the properties from it we want to cache.
    newProperties.set("_vCard", vCardProperties.toVCard());

    const displayName = vCardProperties.getFirstValue("fn");
    newProperties.set("DisplayName", displayName || "");

    const flatten = value => {
      if (Array.isArray(value)) {
        return value.join(" ");
      }
      return value;
    };

    const name = vCardProperties.getFirstValue("n");
    if (Array.isArray(name)) {
      newProperties.set("FirstName", flatten(name[1]));
      newProperties.set("LastName", flatten(name[0]));
    }

    const email = vCardProperties.getAllValuesSorted("email");
    if (email[0]) {
      newProperties.set("PrimaryEmail", email[0]);
    }
    if (email[1]) {
      newProperties.set("SecondEmail", email[1]);
    }

    const nickname = vCardProperties.getFirstValue("nickname");
    if (nickname) {
      newProperties.set("NickName", flatten(nickname));
    }

    // Always set the last modified date.
    newProperties.set("LastModifiedDate", "" + Math.floor(Date.now() / 1000));
    return newProperties;
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
        this._uid = lazy.newUID();
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
    const lists = Array.from(
      this.lists.values(),
      list =>
        new lazy.AddrBookMailingList(
          list.uid,
          this,
          list.name,
          list.nickName,
          list.description
        ).asDirectory
    );
    lists.sort(lazy.compareAddressBooks);
    return lists;
  }
  /** @abstract */
  get childCardCount() {
    throw new Components.Exception(
      `${this.constructor.name} does not implement childCardCount getter.`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
  get childCards() {
    const results = Array.from(
      this.lists.values(),
      list =>
        new lazy.AddrBookMailingList(
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
        new lazy.AddrBookMailingList(
          list.uid,
          this,
          list.name,
          list.nickName,
          list.description
        ).asCard
    ).concat(Array.from(this.cards.keys(), this.getCard, this));

    // Process the query string into a tree of conditions to match.
    const lispRegexp = /^\((and|or|not|([^\)]*)(\)+))/;
    let index = 0;
    const rootQuery = { children: [], op: "or" };
    let currentQuery = rootQuery;

    // @see https://github.com/eslint/eslint/issues/17807
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const match = lispRegexp.exec(query.substring(index));
      if (!match) {
        break;
      }
      index += match[0].length;

      if (["and", "or", "not"].includes(match[1])) {
        // For the opening bracket, step down a level.
        const child = {
          parent: currentQuery,
          children: [],
          op: match[1],
        };
        currentQuery.children.push(child);
        currentQuery = child;
      } else {
        const [name, condition, value] = match[2].split(",");
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
      } else if (card._properties.has("_vCard")) {
        try {
          properties = card.vCardProperties.toPropertyMap();
        } catch (ex) {
          // Parsing failed. Skip the vCard and just use the other properties.
          console.error(ex);
          properties = new Map();
        }
        for (const [key, value] of card._properties) {
          if (!properties.has(key)) {
            properties.set(key, value);
          }
        }
      } else {
        properties = card._properties;
      }
      const matches = b => {
        if ("condition" in b) {
          const { name, condition, value } = b;
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

    for (const card of results) {
      listener.onSearchFoundCard(card);
    }
    listener.onSearchFinished(Cr.NS_OK, true, null, "");
  }
  generateName(generateFormat, bundle) {
    return this.dirName;
  }
  cardForEmailAddress(emailAddress) {
    if (!emailAddress) {
      return null;
    }

    // Check the properties. We copy the first two addresses to properties for
    // this purpose, so it should be fast.
    let card = this.getCardFromProperty("PrimaryEmail", emailAddress, false);
    if (card) {
      return card;
    }
    card = this.getCardFromProperty("SecondEmail", emailAddress, false);
    if (card) {
      return card;
    }

    // Nothing so far? Go through all the cards checking all of the addresses.
    // This could be slow.
    emailAddress = emailAddress.toLowerCase();
    for (const [uid, properties] of this.cards) {
      const vCard = properties.get("_vCard");
      // If the vCard string doesn't include the email address, the parsed
      // vCard won't include it either, so don't waste time parsing it.
      if (!vCard?.toLowerCase().includes(emailAddress)) {
        continue;
      }
      card = this.getCard(uid);
      if (card.emailAddresses.some(e => e.toLowerCase() == emailAddress)) {
        return card;
      }
    }

    return null;
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
    for (const list of this.lists.values()) {
      if (list.name.toLowerCase() == name.toLowerCase()) {
        return new lazy.AddrBookMailingList(
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
    list = new lazy.AddrBookMailingList(
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

    const oldProperties = this.loadCardProperties(card.UID);
    const newProperties = this.prepareToSaveCard(card);

    const allProperties = new Set(oldProperties.keys());
    for (const key of newProperties.keys()) {
      allProperties.add(key);
    }

    if (this.hasOwnProperty("cards")) {
      this.cards.set(card.UID, newProperties);
    }
    this.saveCardProperties(card.UID, newProperties);

    const changeData = {};
    for (const name of allProperties) {
      if (name == "LastModifiedDate") {
        continue;
      }

      const oldValue = oldProperties.get(name) || null;
      const newValue = newProperties.get(name) || null;
      if (oldValue != newValue) {
        changeData[name] = { oldValue, newValue };
      }
    }

    // Increment this preference if one or both of these properties change.
    // This will cause the UI to throw away cached values.
    if ("DisplayName" in changeData || "PreferDisplayName" in changeData) {
      Services.prefs.setIntPref(
        "mail.displayname.version",
        Services.prefs.getIntPref("mail.displayname.version", 0) + 1
      );
    }

    // Send the card as it is in this directory, not as passed to this function.
    const newCard = this.getCard(card.UID);
    Services.obs.notifyObservers(newCard, "addrbook-contact-updated", this.UID);

    Services.obs.notifyObservers(
      newCard,
      "addrbook-contact-properties-updated",
      JSON.stringify(changeData)
    );

    // Return the card, even though the interface says not to, because
    // subclasses may want it.
    return newCard;
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

    let updateDisplayNameVersion = false;
    for (const card of cards) {
      updateDisplayNameVersion = updateDisplayNameVersion || card.displayName;
      // TODO: delete photo if there is one
      this.deleteCard(card.UID);
      if (this.hasOwnProperty("cards")) {
        this.cards.delete(card.UID);
      }
    }

    // Increment this preference if one or more cards has a display name.
    // This will cause the UI to throw away cached values.
    if (updateDisplayNameVersion) {
      Services.prefs.setIntPref(
        "mail.displayname.version",
        Services.prefs.getIntPref("mail.displayname.version", 0) + 1
      );
    }

    for (const card of cards) {
      Services.obs.notifyObservers(card, "addrbook-contact-deleted", this.UID);
      card.directoryUID = null;
    }

    // We could just delete all non-existent cards from list_cards, but a
    // notification should be fired for each one. Let the list handle that.
    for (const list of this.childNodes) {
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

    const uid = needToCopyCard ? lazy.newUID() : card.UID;
    const newProperties = this.prepareToSaveCard(card, uid);
    if (card.directoryUID && card.directoryUID != this._uid) {
      // These properties belong to a different directory. Don't keep them.
      newProperties.delete("_etag");
      newProperties.delete("_href");
    }

    if (this.hasOwnProperty("cards")) {
      this.cards.set(uid, newProperties);
    }
    this.saveCardProperties(uid, newProperties);

    // Increment this preference if the card has a display name.
    // This will cause the UI to throw away cached values.
    if (card.displayName) {
      Services.prefs.setIntPref(
        "mail.displayname.version",
        Services.prefs.getIntPref("mail.displayname.version", 0) + 1
      );
    }

    const newCard = this.getCard(uid);
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
    for (const char of ',;"<>') {
      if (list.dirName.includes(char)) {
        throw new Components.Exception(
          `Invalid mail list name: ${list.dirName}`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
      }
    }

    const newList = new lazy.AddrBookMailingList(
      lazy.newUID(),
      this,
      list.dirName || "",
      list.listNickName || "",
      list.description || ""
    );
    this.saveList(newList);

    const newListDirectory = newList.asDirectory;
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
    const valueLocal = Cc["@mozilla.org/pref-localizedstring;1"].createInstance(
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
