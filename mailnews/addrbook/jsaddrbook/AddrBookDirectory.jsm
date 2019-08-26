/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["AddrBookDirectory", "closeConnectionTo"];

ChromeUtils.defineModuleGetter(this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");
ChromeUtils.defineModuleGetter(this, "Services", "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "SimpleEnumerator", "resource:///modules/AddrBookUtils.jsm");
ChromeUtils.defineModuleGetter(this, "fixIterator", "resource:///modules/iteratorUtils.jsm");
ChromeUtils.defineModuleGetter(this, "AddrBookCard", "resource:///modules/AddrBookCard.jsm");
ChromeUtils.defineModuleGetter(this, "AddrBookMailingList", "resource:///modules/AddrBookMailingList.jsm");
ChromeUtils.defineModuleGetter(this, "newUID", "resource:///modules/AddrBookUtils.jsm");
ChromeUtils.defineModuleGetter(this, "toXPCOMArray", "resource:///modules/iteratorUtils.jsm");

/* This is where the address book manager creates an nsIAbDirectory. We want
 * to do things differently depending on whether or not the directory is a
 * mailing list, so we do this by abusing javascript prototypes.
 * A non-list directory has bookPrototype, a list directory has a
 * AddrBookMailingList prototype, ultimately created by getting the owner
 * directory and calling addressLists on it. This will make more sense and be
 * a lot neater once we stop using one XPCOM interface for two jobs. */

function AddrBookDirectory() {
}
AddrBookDirectory.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAbDirectory]),
  classID: Components.ID("{e96ee804-0bd3-472f-81a6-8a9d65277ad3}"),

  _query: null,

  init(uri) {
    let index = uri.indexOf("?");
    if (index >= 0) {
      this._query = uri.substring(index + 1);
      uri = uri.substring(0, index);
    }
    if (/\/MailList\d+$/.test(uri)) {
      let parent = MailServices.ab.getDirectory(uri.substring(0, uri.lastIndexOf("/")));
      for (let list of parent.addressLists.enumerate()) {
        list.QueryInterface(Ci.nsIAbDirectory);
        if (list.URI == uri) {
          this.__proto__ = list;
          return;
        }
      }
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    this.__proto__ = bookPrototype;
    this._uri = uri;

    if (!this.dirPrefId) {
      let filename = uri.substring("jsaddrbook://".length);
      for (let child of Services.prefs.getChildList("ldap_2.servers.")) {
        if (child.endsWith(".filename") && Services.prefs.getStringPref(child) == filename) {
          this.dirPrefId = child.substring(0, child.length - ".filename".length);
          break;
        }
      }
      if (!this.dirPrefId) {
        throw Cr.NS_ERROR_UNEXPECTED;
      }
      this.UID;
    }
  },
};

// Keep track of all database connections, and close them at shutdown, since
// nothing else ever tells us to close them.

var connections = new Map();
var closeObserver = {
  observe() {
    for (let connection of connections.values()) {
      connection.close();
    }
    connections.clear();
  },
};
Services.obs.addObserver(closeObserver, "addrbook-reload");
Services.obs.addObserver(closeObserver, "quit-application");

function closeConnectionTo(path) {
  let connection = connections.get(path);
  if (connection) {
    connection.close();
    connections.delete(path);
  }
}

/**
 * Prototype for nsIAbDirectory objects that aren't mailing lists.
 *
 * @implements {nsIAbCollection}
 * @implements {nsIAbDirectory}
 */
var bookPrototype = {
  _nextCardId: null,
  _nextListId: null,
  get _prefBranch() {
    if (!this.dirPrefId) {
      throw Cr.NS_ERROR_NOT_AVAILABLE;
    }
    return Services.prefs.getBranch(`${this.dirPrefId}.`);
  },
  get _dbConnection() {
    let file = FileUtils.getFile("ProfD", [this.fileName]);
    let connection = connections.get(file.path);
    if (!connection) {
      connection = Services.storage.openDatabase(file);
      if (connection.schemaVersion == 0) {
        connection.executeSimpleSQL("PRAGMA journal_mode=WAL");
        connection.executeSimpleSQL(
          "CREATE TABLE cards (uid TEXT PRIMARY KEY, localId INTEGER)");
        connection.executeSimpleSQL(
          "CREATE TABLE properties (card TEXT, name TEXT, value TEXT)");
        connection.executeSimpleSQL(
          "CREATE TABLE lists (uid TEXT PRIMARY KEY, localId INTEGER, name TEXT, nickName TEXT, description TEXT)");
        connection.executeSimpleSQL(
          "CREATE TABLE list_cards (list TEXT, card TEXT, PRIMARY KEY(list, card))");
        connection.schemaVersion = 1;
      }
      connections.set(file.path, connection);
    }

    delete this._dbConnection;
    Object.defineProperty(this, "_dbConnection", {
      enumerable: true,
      value: connection,
      writable: false,
    });
    return connection;
  },
  get _lists() {
    let selectStatement = this._dbConnection.createStatement(
      "SELECT uid, localId, name, nickName, description FROM lists");
    let results = new Map();
    while (selectStatement.executeStep()) {
      results.set(selectStatement.row.uid, {
        uid: selectStatement.row.uid,
        localId: selectStatement.row.localId,
        name: selectStatement.row.name,
        nickName: selectStatement.row.nickName,
        description: selectStatement.row.description,
      });
    }
    selectStatement.finalize();
    return results;
  },
  get _cards() {
    let cardStatement = this._dbConnection.createStatement(
      "SELECT uid, localId FROM cards");
    let results = new Map();
    while (cardStatement.executeStep()) {
      results.set(cardStatement.row.uid, {
        uid: cardStatement.row.uid,
        localId: cardStatement.row.localId,
      });
    }
    cardStatement.finalize();
    return results;
  },

  _getNextCardId() {
    if (this._nextCardId === null) {
      let value = 1;
      let selectStatement = this._dbConnection.createStatement(
        "SELECT MAX(localId) AS localId FROM cards");
      if (selectStatement.executeStep()) {
        value = selectStatement.row.localId + 1;
      }
      this._nextCardId = value;
      selectStatement.finalize();
    }
    return this._nextCardId.toString();
  },
  _getNextListId() {
    if (this._nextListId === null) {
      let value = 1;
      let selectStatement = this._dbConnection.createStatement(
        "SELECT MAX(localId) AS localId FROM lists");
      if (selectStatement.executeStep()) {
        value = selectStatement.row.localId + 1;
      }
      this._nextListId = value;
      selectStatement.finalize();
    }
    return this._nextListId.toString();
  },
  _getCard({ uid, localId = null }) {
    let card = new AddrBookCard();
    card.directoryId = this.uuid;
    card._uid = uid;
    card.localId = localId;
    card._properties = this._loadCardProperties(uid);
    return card.QueryInterface(Ci.nsIAbCard);
  },
  _loadCardProperties(uid) {
    let properties = new Map();
    let propertyStatement = this._dbConnection.createStatement(
      "SELECT name, value FROM properties WHERE card = :card");
    propertyStatement.params.card = uid;
    while (propertyStatement.executeStep()) {
      properties.set(propertyStatement.row.name, propertyStatement.row.value);
    }
    propertyStatement.finalize();
    return properties;
  },
  _saveCardProperties(card) {
    this._dbConnection.beginTransaction();
    let deleteStatement = this._dbConnection.createStatement(
      "DELETE FROM properties WHERE card = :card");
    deleteStatement.params.card = card.UID;
    deleteStatement.execute();
    let insertStatement = this._dbConnection.createStatement(
      "INSERT INTO properties VALUES (:card, :name, :value)");
    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      if (value !== null && value !== undefined && value !== "") {
        insertStatement.params.card = card.UID;
        insertStatement.params.name = name;
        insertStatement.params.value = value;
        insertStatement.execute();
        insertStatement.reset();
      }
    }
    this._dbConnection.commitTransaction();
    deleteStatement.finalize();
    insertStatement.finalize();
  },
  _saveList(list) {
    let replaceStatement = this._dbConnection.createStatement(
      "REPLACE INTO lists (uid, localId, name, nickName, description) " +
      "VALUES (:uid, :localId, :name, :nickName, :description)");
    replaceStatement.params.uid = list._uid;
    replaceStatement.params.localId = list._localId;
    replaceStatement.params.name = list._name;
    replaceStatement.params.nickName = list._nickName;
    replaceStatement.params.description = list._description;
    replaceStatement.execute();
    replaceStatement.finalize();
  },

  /* nsIAbCollection */

  get readOnly() {
    return false;
  },
  get isRemote() {
    return false;
  },
  get isSecure() {
    return false;
  },
  cardForEmailAddress(emailAddress) {
    return this.getCardFromProperty("PrimaryEmail", emailAddress, false) ||
      this.getCardFromProperty("SecondEmail", emailAddress, false);
  },
  getCardFromProperty(property, value, caseSensitive) {
    let sql = caseSensitive ?
      "SELECT card FROM properties WHERE name = :name AND value = :value LIMIT 1" :
      "SELECT card FROM properties WHERE name = :name AND LOWER(value) = LOWER(:value) LIMIT 1";
    let selectStatement = this._dbConnection.createStatement(sql);
    selectStatement.params.name = property;
    selectStatement.params.value = value;
    if (selectStatement.executeStep()) {
      return this._getCard({ uid: selectStatement.row.card });
    }
    selectStatement.finalize();
    return null;
  },
  getCardsFromProperty(property, value, caseSensitive) {
    let sql = caseSensitive ?
      "SELECT card FROM properties WHERE name = :name AND value = :value" :
      "SELECT card FROM properties WHERE name = :name AND LOWER(value) = LOWER(:value)";
    let selectStatement = this._dbConnection.createStatement(sql);
    selectStatement.params.name = property;
    selectStatement.params.value = value;
    let results = [];
    while (selectStatement.executeStep()) {
      results.push(this._getCard({ uid: selectStatement.row.card }));
    }
    selectStatement.finalize();
    return new SimpleEnumerator(results);
  },

  /* nsIAbDirectory */

  get propertiesChromeURI() {
    return "chrome://messenger/content/addressbook/abAddressBookNameDialog.xul";
  },
  get dirName() {
    return this._prefBranch.getStringPref("description", "");
  },
  set dirName(value) {
    let oldValue = this.dirName;
    this._prefBranch.setStringPref("description", value);
    MailServices.ab.notifyItemPropertyChanged(this, "DirName", oldValue, value);
  },
  get dirType() {
    return 101;
  },
  get fileName() {
    if (!this._fileName) {
      this._fileName = this._prefBranch.getStringPref("filename", "");
    }
    return this._fileName;
  },
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
  },
  get URI() {
    return this._uri;
  },
  get position() {
    return this._prefBranch.getIntPref("position", 1);
  },
  get uuid() {
    return `${this.dirPrefId}&${this.dirName}`;
  },
  get childNodes() {
    let lists = Array.from(
      this._lists.values(),
      list => new AddrBookMailingList(list.uid,
                                      this,
                                      list.localId,
                                      list.name,
                                      list.nickName,
                                      list.description).asDirectory
    );
    return new SimpleEnumerator(lists);
  },
  get childCards() {
    let results = Array.from(
      this._lists.values(),
      list => new AddrBookMailingList(list.uid,
                                      this,
                                      list.localId,
                                      list.name,
                                      list.nickName,
                                      list.description).asCard
    ).concat(Array.from(
      this._cards.values(),
      card => this._getCard(card))
    );

    if (this._query) {
      if (!this._processedQuery) {
        // Process the query string into a tree of conditions to match.
        let lispRegexp = /^\((and|or|not|([^\)]*)(\)+))/;
        let index = 0;
        let rootQuery = { children: [], op: "or" };
        let currentQuery = rootQuery;

        while (true) {
          let match = lispRegexp.exec(this._query.substring(index));
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
            currentQuery.children.push(match[2]);

            // For each closing bracket except the first, step up a level.
            for (let i = match[3].length - 1; i > 0; i--) {
              currentQuery = currentQuery.parent;
            }
          }
        }
        this._processedQuery = rootQuery;
      }

      results = results.filter(card => {
        let properties;
        if (card.isMailList) {
          properties = new Map([
            ["DisplayName", card.displayName],
            ["NickName", card.getProperty("NickName")],
            ["Notes", card.getProperty("Notes")],
          ]);
        } else {
          properties = this._loadCardProperties(card.UID);
        }
        let matches = (b) => {
          if (typeof b == "string") {
            let [name, condition, value] = b.split(",");
            if (name == "IsMailList" && condition == "=") {
              return card.isMailList == (value == "TRUE");
            }

            if (!properties.has(name)) {
              return condition == "!ex";
            }
            if (condition == "ex") {
              return true;
            }

            value = decodeURIComponent(value).toLowerCase();
            let cardValue = properties.get(name).toLowerCase();
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
                return !(cardValue.includes(value));
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

        return matches(this._processedQuery);
      }, this);
    }
    return new SimpleEnumerator(results);
  },
  get isQuery() {
    return !!this._query;
  },
  get supportsMailingLists() {
    return true;
  },
  get addressLists() {
    let lists = Array.from(
      this._lists.values(),
      list => new AddrBookMailingList(list.uid,
                                      this,
                                      list.localId,
                                      list.name,
                                      list.nickName,
                                      list.description).asDirectory
    );
    return toXPCOMArray(lists, Ci.nsIMutableArray);
  },

  generateName(generateFormat, bundle) {
    return this.dirName;
  },
  deleteDirectory(directory) {
    let list = this._lists.get(directory.UID);
    list = new AddrBookMailingList(list.uid,
                                   this,
                                   list.localId,
                                   list.name,
                                   list.nickName,
                                   list.description);

    let deleteListStatement = this._dbConnection.createStatement(
      "DELETE FROM lists WHERE uid = :uid");
    deleteListStatement.params.uid = directory.UID;
    deleteListStatement.execute();
    deleteListStatement.finalize();

    this._dbConnection.executeSimpleSQL(
      "DELETE FROM list_cards WHERE list NOT IN (SELECT DISTINCT uid FROM lists)");
    MailServices.ab.notifyDirectoryItemDeleted(this, list.asCard);
    MailServices.ab.notifyDirectoryItemDeleted(list.asDirectory, list.asCard);
    MailServices.ab.notifyDirectoryDeleted(this, directory);
  },
  hasCard(card) {
    return this._lists.has(card.UID) || this._cards.has(card.UID);
  },
  hasDirectory(dir) {
    return this._lists.has(dir.UID);
  },
  hasMailListWithName(name) {
    for (let list of this._lists) {
      if (list.name == name) {
        return true;
      }
    }
    return false;
  },
  addCard(card) {
    return this.dropCard(card, false);
  },
  modifyCard(card) {
    let oldProperties = this._loadCardProperties(card.UID);
    let newProperties = new Map();
    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      newProperties.set(name, value);
    }
    this._saveCardProperties(card);
    for (let [name, oldValue] of oldProperties.entries()) {
      if (!newProperties.has(name)) {
        MailServices.ab.notifyItemPropertyChanged(card, name, oldValue, null);
      }
    }
    for (let [name, newValue] of newProperties.entries()) {
      let oldValue = oldProperties.get(name);
      if (oldValue != newValue) {
        // TODO We can do better than null. But MDB doesn't.
        MailServices.ab.notifyItemPropertyChanged(card, null, null, null);
      }
    }
    Services.obs.notifyObservers(card, "addrbook-contact-updated", this.UID);
  },
  deleteCards(cards) {
    if (cards === null) {
      throw Cr.NS_ERROR_INVALID_POINTER;
    }

    let deleteCardStatement = this._dbConnection.createStatement(
      "DELETE FROM cards WHERE uid = :uid");
    let selectListCardStatement = this._dbConnection.createStatement(
      "SELECT list FROM list_cards WHERE card = :card");
    for (let card of cards.enumerate(Ci.nsIAbCard)) {
      deleteCardStatement.params.uid = card.UID;
      deleteCardStatement.execute();
      deleteCardStatement.reset();
      MailServices.ab.notifyDirectoryItemDeleted(this, card);

      selectListCardStatement.params.card = card.UID;
      while (selectListCardStatement.executeStep()) {
        let list = new AddrBookMailingList(selectListCardStatement.row.list, this);
        list.asDirectory.deleteCards(toXPCOMArray([card], Ci.nsIMutableArray));
      }
    }

    this._dbConnection.executeSimpleSQL(
      "DELETE FROM properties WHERE card NOT IN (SELECT DISTINCT uid FROM cards)");

    deleteCardStatement.finalize();
    selectListCardStatement.finalize();
  },
  dropCard(card, needToCopyCard) {
    let newCard = new AddrBookCard();
    newCard.directoryId = this.uuid;
    newCard.localId = this._getNextCardId().toString();
    newCard._uid = (needToCopyCard || !card.UID) ? newUID() : card.UID;

    let insertStatement = this._dbConnection.createStatement(
      "INSERT INTO cards (uid, localId) VALUES (:uid, :localId)");
    insertStatement.params.uid = newCard.UID;
    insertStatement.params.localId = newCard.localId;
    insertStatement.execute();
    insertStatement.finalize();

    for (let { name, value } of fixIterator(card.properties, Ci.nsIProperty)) {
      newCard.setProperty(name, value);
    }
    this._saveCardProperties(newCard);

    MailServices.ab.notifyDirectoryItemAdded(this, newCard);
    Services.obs.notifyObservers(newCard, "addrbook-contact-created", this.UID);

    return newCard;
  },
  useForAutocomplete(identityKey) {
    return Services.prefs.getBoolPref("mail.enable_autocomplete");
  },
  addMailList(list) {
    if (!list.isMailList) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    let newList = new AddrBookMailingList(newUID(),
                                          this,
                                          this._getNextListId(),
                                          list.dirName || "",
                                          list.listNickName || "",
                                          list.description || "");
    this._saveList(newList);

    let newListDirectory = newList.asDirectory;
    MailServices.ab.notifyDirectoryItemAdded(this, newList.asCard);
    MailServices.ab.notifyDirectoryItemAdded(this, newListDirectory);
    return newListDirectory;
  },
  editMailListToDatabase(listCard) {
    // Deliberately not implemented, this isn't a mailing list.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  copyMailList(srcList) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  createNewDirectory(dirName, uri, type, prefName) {
    // Deliberately not implemented, this isn't the root directory.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  createDirectoryByURI(displayName, uri) {
    // Deliberately not implemented, this isn't the root directory.
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  getIntValue(name, defaultValue) {
    return this._prefBranch.getIntPref(name, defaultValue);
  },
  getBoolValue(name, defaultValue) {
    return this._prefBranch.getBoolPref(name, defaultValue);
  },
  getStringValue(name, defaultValue) {
    return this._prefBranch.getStringPref(name, defaultValue);
  },
  getLocalizedStringValue(name, defaultValue) {
    if (this._prefBranch.getPrefType(name) == Ci.nsIPrefBranch.PREF_INVALID) {
      return defaultValue;
    }
    return this._prefBranch.getComplexValue(name, Ci.nsIPrefLocalizedString).value;
  },
  setIntValue(name, value) {
    this._prefBranch.setIntPref(name, value);
  },
  setBoolValue(name, value) {
    this._prefBranch.setBoolPref(name, value);
  },
  setStringValue(name, value) {
    this._prefBranch.setStringPref(name, value);
  },
  setLocalizedStringValue(name, value) {
    this._prefBranch.setComplexValue(name, Ci.nsIPrefLocalizedString, value);
  },
};
