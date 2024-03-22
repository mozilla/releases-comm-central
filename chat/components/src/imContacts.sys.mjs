/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import {
  executeSoon,
  ClassInfo,
  l10nHelper,
} from "resource:///modules/imXPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/contacts.properties")
);

var gDBConnection = null;

function executeAsyncThenFinalize(statement) {
  statement.executeAsync();
  statement.finalize();
}

function getDBConnection() {
  const NS_APP_USER_PROFILE_50_DIR = "ProfD";
  const dbFile = Services.dirsvc.get(NS_APP_USER_PROFILE_50_DIR, Ci.nsIFile);
  dbFile.append("blist.sqlite");

  const conn = Services.storage.openDatabase(dbFile);
  if (!conn.connectionReady) {
    throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
  }

  // Grow blist db in 512KB increments.
  try {
    conn.setGrowthIncrement(512 * 1024, "");
  } catch (e) {
    if (e.result == Cr.NS_ERROR_FILE_TOO_BIG) {
      Services.console.logStringMessage(
        "Not setting growth increment on " +
          "blist.sqlite because the available " +
          "disk space is limited"
      );
    } else {
      throw e;
    }
  }

  // Create tables and indexes.
  [
    "CREATE TABLE IF NOT EXISTS accounts (" +
      "id INTEGER PRIMARY KEY, " +
      "name VARCHAR, " +
      "prpl VARCHAR)",

    "CREATE TABLE IF NOT EXISTS contacts (" +
      "id INTEGER PRIMARY KEY, " +
      "firstname VARCHAR, " +
      "lastname VARCHAR, " +
      "alias VARCHAR)",

    "CREATE TABLE IF NOT EXISTS buddies (" +
      "id INTEGER PRIMARY KEY, " +
      "key VARCHAR NOT NULL, " +
      "name VARCHAR NOT NULL, " +
      "srv_alias VARCHAR, " +
      "position INTEGER, " +
      "icon BLOB, " +
      "contact_id INTEGER)",
    "CREATE INDEX IF NOT EXISTS buddies_contactindex " +
      "ON buddies (contact_id)",

    "CREATE TABLE IF NOT EXISTS tags (" +
      "id INTEGER PRIMARY KEY, " +
      "name VARCHAR UNIQUE NOT NULL, " +
      "position INTEGER)",

    "CREATE TABLE IF NOT EXISTS contact_tag (" +
      "contact_id INTEGER NOT NULL, " +
      "tag_id INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS contact_tag_contactindex " +
      "ON contact_tag (contact_id)",
    "CREATE INDEX IF NOT EXISTS contact_tag_tagindex " +
      "ON contact_tag (tag_id)",

    "CREATE TABLE IF NOT EXISTS account_buddy (" +
      "account_id INTEGER NOT NULL, " +
      "buddy_id INTEGER NOT NULL, " +
      "status VARCHAR, " +
      "tag_id INTEGER)",
    "CREATE INDEX IF NOT EXISTS account_buddy_accountindex " +
      "ON account_buddy (account_id)",
    "CREATE INDEX IF NOT EXISTS account_buddy_buddyindex " +
      "ON account_buddy (buddy_id)",
  ].forEach(conn.executeSimpleSQL);

  return conn;
}

// Wrap all the usage of DBConn inside a transaction that will be
// committed automatically at the end of the event loop spin so that
// we flush buddy list data to disk only once per event loop spin.
var gDBConnWithPendingTransaction = null;
Object.defineProperty(lazy, "DBConn", {
  configurable: true,
  enumerable: true,

  get() {
    if (gDBConnWithPendingTransaction) {
      return gDBConnWithPendingTransaction;
    }

    if (!gDBConnection) {
      gDBConnection = getDBConnection();
      Services.obs.addObserver(function dbClose(aSubject, aTopic) {
        Services.obs.removeObserver(dbClose, aTopic);
        if (gDBConnection) {
          gDBConnection.asyncClose();
          gDBConnection = null;
        }
      }, "profile-before-change");
    }
    gDBConnWithPendingTransaction = gDBConnection;
    gDBConnection.beginTransaction();
    executeSoon(function () {
      gDBConnWithPendingTransaction.commitTransaction();
      gDBConnWithPendingTransaction = null;
    });
    return gDBConnection;
  },
});

class TagsService {
  /**
   * Get the default tag (ie. "Contacts" for en-US).
   *
   * @type {imITag}
   */
  get defaultTag() {
    return this.createTag(lazy._("defaultGroup"));
  }
  /**
   * Creates a new tag or gets an existing tag if one already exists.
   *
   * @param {string} aName - The name of the new tag.
   * @returns {imITag}
   */
  createTag(aName) {
    // If the tag already exists, we don't want to create a duplicate.
    let tag = this.getTagByName(aName);
    if (tag) {
      return tag;
    }

    const statement = lazy.DBConn.createStatement(
      "INSERT INTO tags (name, position) VALUES(:name, 0)"
    );
    try {
      statement.params.name = aName;
      statement.executeStep();
    } finally {
      statement.finalize();
    }

    tag = new Tag(lazy.DBConn.lastInsertRowID, aName);
    Tags.push(tag);
    return tag;
  }
  /**
   * Get an existing tag by (numeric) id. Returns null if not found.
   *
   * @param {number} aId - The numeric tag ID.
   * @returns {?imITag} The tag or null if the tag doesn't exist.
   */
  getTagById = aId => TagsById[aId];
  /**
   * Get an existing tag by name (will do an SQL query). Returns null
   * if not found.
   *
   * @param {string} name - The tag name.
   * @returns {?imITag} The tag or null if the tag doesn't exist.
   */
  getTagByName(aName) {
    const statement = lazy.DBConn.createStatement(
      "SELECT id FROM tags where name = :name"
    );
    statement.params.name = aName;
    try {
      if (!statement.executeStep()) {
        return null;
      }
      return this.getTagById(statement.row.id);
    } finally {
      statement.finalize();
    }
  }
  /**
   * Get an array of all existing tags.
   *
   * @returns {imITag[]}
   */
  getTags() {
    if (Tags.length) {
      Tags.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
    } else {
      this.defaultTag;
    }

    return Tags;
  }

  /**
   * @param {imITag} aTag
   * @returns {boolean}
   */
  isTagHidden = aTag => aTag.id in otherContactsTag._hiddenTags;
  /**
   * @param {imITag} aTag
   */
  hideTag(aTag) {
    otherContactsTag.hideTag(aTag);
  }
  /**
   * @param {imITag} aTag
   */
  showTag(aTag) {
    otherContactsTag.showTag(aTag);
  }
  /**
   * @type {imITag}
   */
  get otherContactsTag() {
    otherContactsTag._initContacts();
    return otherContactsTag;
  }
}

export const tags = new TagsService();

// TODO move into the tagsService
var Tags = [];
var TagsById = {};

function Tag(aId, aName) {
  this._id = aId;
  this._name = aName;
  this._contacts = [];
  this._observers = [];

  TagsById[this.id] = this;
}
Tag.prototype = {
  __proto__: ClassInfo("imITag", "Tag"),
  get id() {
    return this._id;
  },
  get name() {
    return this._name;
  },
  set name(aNewName) {
    const statement = lazy.DBConn.createStatement(
      "UPDATE tags SET name = :name WHERE id = :id"
    );
    try {
      statement.params.name = aNewName;
      statement.params.id = this._id;
      statement.execute();
    } finally {
      statement.finalize();
    }

    // FIXME move the account buddies if some use this tag as their group
  },
  getContacts() {
    return this._contacts.filter(c => !c._empty);
  },
  _addContact(aContact) {
    this._contacts.push(aContact);
  },
  _removeContact(aContact) {
    const index = this._contacts.indexOf(aContact);
    if (index != -1) {
      this._contacts.splice(index, 1);
    }
  },

  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  },
  removeObserver(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  notifyObservers(aSubject, aTopic, aData) {
    for (const observer of this._observers) {
      observer.observe(aSubject, aTopic, aData);
    }
  },
};

var otherContactsTag = {
  __proto__: ClassInfo(["nsIObserver", "imITag"], "Other Contacts Tag"),
  hiddenTagsPref: "messenger.buddies.hiddenTags",
  _hiddenTags: {},
  _contactsInitialized: false,
  _saveHiddenTagsPref() {
    Services.prefs.setCharPref(
      this.hiddenTagsPref,
      Object.keys(this._hiddenTags).join(",")
    );
  },
  showTag(aTag) {
    const id = aTag.id;
    delete this._hiddenTags[id];
    const contacts = Object.keys(this._contacts).map(id => this._contacts[id]);
    for (const contact of contacts) {
      if (contact.getTags().some(t => t.id == id)) {
        this._removeContact(contact);
      }
    }

    aTag.notifyObservers(aTag, "tag-shown");
    Services.obs.notifyObservers(aTag, "tag-shown");
    this._saveHiddenTagsPref();
  },
  hideTag(aTag) {
    if (aTag.id < 0 || aTag.id in otherContactsTag._hiddenTags) {
      return;
    }

    this._hiddenTags[aTag.id] = aTag;
    if (this._contactsInitialized) {
      this._hideTag(aTag);
    }

    aTag.notifyObservers(aTag, "tag-hidden");
    Services.obs.notifyObservers(aTag, "tag-hidden");
    this._saveHiddenTagsPref();
  },
  _hideTag(aTag) {
    for (const contact of aTag.getContacts()) {
      if (
        !(contact.id in this._contacts) &&
        contact.getTags().every(t => t.id in this._hiddenTags)
      ) {
        this._addContact(contact);
      }
    }
  },
  observe(aSubject, aTopic, aData) {
    aSubject.QueryInterface(Ci.imIContact);
    if (aTopic == "contact-tag-removed" || aTopic == "contact-added") {
      if (
        !(aSubject.id in this._contacts) &&
        !(parseInt(aData) in this._hiddenTags) &&
        aSubject.getTags().every(t => t.id in this._hiddenTags)
      ) {
        this._addContact(aSubject);
      }
    } else if (
      aSubject.id in this._contacts &&
      (aTopic == "contact-removed" ||
        (aTopic == "contact-tag-added" &&
          !(parseInt(aData) in this._hiddenTags)))
    ) {
      this._removeContact(aSubject);
    }
  },

  _initHiddenTags() {
    const pref = Services.prefs.getCharPref(this.hiddenTagsPref);
    if (!pref) {
      return;
    }
    for (const tagId of pref.split(",")) {
      this._hiddenTags[tagId] = TagsById[tagId];
    }
  },
  _initContacts() {
    if (this._contactsInitialized) {
      return;
    }
    this._observers = [];
    this._observer = {
      self: this,
      observe(aSubject, aTopic, aData) {
        if (aTopic == "contact-moved-in" && !(aSubject instanceof Contact)) {
          return;
        }

        this.self.notifyObservers(aSubject, aTopic, aData);
      },
    };
    this._contacts = {};
    this._contactsInitialized = true;
    for (const id in this._hiddenTags) {
      const tag = this._hiddenTags[id];
      this._hideTag(tag);
    }
    Services.obs.addObserver(this, "contact-tag-added");
    Services.obs.addObserver(this, "contact-tag-removed");
    Services.obs.addObserver(this, "contact-added");
    Services.obs.addObserver(this, "contact-removed");
  },

  // imITag implementation
  get id() {
    return -1;
  },
  get name() {
    return "__others__";
  },
  set name(aNewName) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
  },
  getContacts() {
    return Object.keys(this._contacts).map(id => this._contacts[id]);
  },
  _addContact(aContact) {
    this._contacts[aContact.id] = aContact;
    this.notifyObservers(aContact, "contact-moved-in");
    for (const observer of ContactsById[aContact.id]._observers) {
      observer.observe(this, "contact-moved-in", null);
    }
    aContact.addObserver(this._observer);
  },
  _removeContact(aContact) {
    delete this._contacts[aContact.id];
    aContact.removeObserver(this._observer);
    this.notifyObservers(aContact, "contact-moved-out");
    for (const observer of ContactsById[aContact.id]._observers) {
      observer.observe(this, "contact-moved-out", null);
    }
  },

  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  },
  removeObserver(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  notifyObservers(aSubject, aTopic, aData) {
    for (const observer of this._observers) {
      observer.observe(aSubject, aTopic, aData);
    }
  },
};

var ContactsById = {};
var LastDummyContactId = 0;
function Contact(aId, aAlias) {
  // Assign a negative id to dummy contacts that have a single buddy
  this._id = aId || --LastDummyContactId;
  this._alias = aAlias;
  this._tags = [];
  this._buddies = [];
  this._observers = [];

  ContactsById[this._id] = this;
}
Contact.prototype = {
  __proto__: ClassInfo("imIContact", "Contact"),
  _id: 0,
  get id() {
    return this._id;
  },
  get alias() {
    return this._alias;
  },
  set alias(aNewAlias) {
    this._ensureNotDummy();

    const statement = lazy.DBConn.createStatement(
      "UPDATE contacts SET alias = :alias WHERE id = :id"
    );
    statement.params.alias = aNewAlias;
    statement.params.id = this._id;
    executeAsyncThenFinalize(statement);

    const oldDisplayName = this.displayName;
    this._alias = aNewAlias;
    this._notifyObservers("display-name-changed", oldDisplayName);
    for (const buddy of this._buddies) {
      for (const accountBuddy of buddy._accounts) {
        accountBuddy.serverAlias = aNewAlias;
      }
    }
  },
  _ensureNotDummy() {
    if (this._id >= 0) {
      return;
    }

    // Create a real contact for this dummy contact
    let statement = lazy.DBConn.createStatement(
      "INSERT INTO contacts DEFAULT VALUES"
    );
    try {
      statement.execute();
    } finally {
      statement.finalize();
    }
    delete ContactsById[this._id];
    const oldId = this._id;
    this._id = lazy.DBConn.lastInsertRowID;
    ContactsById[this._id] = this;
    this._notifyObservers("no-longer-dummy", oldId.toString());
    // Update the contact_id for the single existing buddy of this contact
    statement = lazy.DBConn.createStatement(
      "UPDATE buddies SET contact_id = :id WHERE id = :buddy_id"
    );
    statement.params.id = this._id;
    statement.params.buddy_id = this._buddies[0].id;
    executeAsyncThenFinalize(statement);
  },

  getTags() {
    return this._tags;
  },
  addTag(aTag, aInherited) {
    if (this.hasTag(aTag)) {
      return;
    }

    if (!aInherited) {
      this._ensureNotDummy();
      const statement = lazy.DBConn.createStatement(
        "INSERT INTO contact_tag (contact_id, tag_id) " +
          "VALUES(:contactId, :tagId)"
      );
      statement.params.contactId = this.id;
      statement.params.tagId = aTag.id;
      executeAsyncThenFinalize(statement);
    }

    aTag = TagsById[aTag.id];
    this._tags.push(aTag);
    aTag._addContact(this);

    aTag.notifyObservers(this, "contact-moved-in");
    for (const observer of this._observers) {
      observer.observe(aTag, "contact-moved-in", null);
    }
    Services.obs.notifyObservers(this, "contact-tag-added", aTag.id);
  },
  /* Remove a tag from the local tags of the contact. */
  _removeTag(aTag) {
    if (!this.hasTag(aTag) || this._isTagInherited(aTag)) {
      return;
    }

    this._removeContactTagRow(aTag);

    this._tags = this._tags.filter(tag => tag.id != aTag.id);
    aTag = TagsById[aTag.id];
    aTag._removeContact(this);

    aTag.notifyObservers(this, "contact-moved-out");
    for (const observer of this._observers) {
      observer.observe(aTag, "contact-moved-out", null);
    }
    Services.obs.notifyObservers(this, "contact-tag-removed", aTag.id);
  },
  _removeContactTagRow(aTag) {
    const statement = lazy.DBConn.createStatement(
      "DELETE FROM contact_tag " +
        "WHERE contact_id = :contactId " +
        "AND tag_id = :tagId"
    );
    statement.params.contactId = this.id;
    statement.params.tagId = aTag.id;
    executeAsyncThenFinalize(statement);
  },
  hasTag(aTag) {
    return this._tags.some(t => t.id == aTag.id);
  },
  _massMove: false,
  removeTag(aTag) {
    if (!this.hasTag(aTag)) {
      throw new Error(
        "Attempting to remove a tag that the contact doesn't have"
      );
    }
    if (this._tags.length == 1) {
      throw new Error("Attempting to remove the last tag of a contact");
    }

    this._massMove = true;
    const hasTag = this.hasTag.bind(this);
    const newTag = this._tags[this._tags[0].id != aTag.id ? 0 : 1];
    let moved = false;
    this._buddies.forEach(function (aBuddy) {
      aBuddy._accounts.forEach(function (aAccountBuddy) {
        if (aAccountBuddy.tag.id == aTag.id) {
          if (
            aBuddy._accounts.some(
              ab =>
                ab.account.numericId == aAccountBuddy.account.numericId &&
                ab.tag.id != aTag.id &&
                hasTag(ab.tag)
            )
          ) {
            // A buddy that already has an accountBuddy of the same
            // account with another tag of the contact shouldn't be
            // moved to newTag, just remove the accountBuddy
            // associated to the tag we are removing.
            aAccountBuddy.remove();
            moved = true;
          } else {
            try {
              aAccountBuddy.tag = newTag;
              moved = true;
            } catch (e) {
              // Ignore failures. Some protocol plugins may not implement this.
            }
          }
        }
      });
    });
    this._massMove = false;
    if (moved) {
      this._moved(aTag, newTag);
    } else {
      // If we are here, the old tag is not inherited from a buddy, so
      // just remove the local tag.
      this._removeTag(aTag);
    }
  },
  _isTagInherited(aTag) {
    for (const buddy of this._buddies) {
      for (const accountBuddy of buddy._accounts) {
        if (accountBuddy.tag.id == aTag.id) {
          return true;
        }
      }
    }
    return false;
  },
  _moved(aOldTag, aNewTag) {
    if (this._massMove) {
      return;
    }

    // Avoid xpconnect wrappers.
    aNewTag = aNewTag && TagsById[aNewTag.id];
    aOldTag = aOldTag && TagsById[aOldTag.id];

    // Decide what we need to do. Return early if nothing to do.
    const shouldRemove =
      aOldTag && this.hasTag(aOldTag) && !this._isTagInherited(aOldTag);
    const shouldAdd =
      aNewTag && !this.hasTag(aNewTag) && this._isTagInherited(aNewTag);
    if (!shouldRemove && !shouldAdd) {
      return;
    }

    // Apply the changes.
    let tags = this._tags;
    if (shouldRemove) {
      tags = tags.filter(aTag => aTag.id != aOldTag.id);
      aOldTag._removeContact(this);
    }
    if (shouldAdd) {
      tags.push(aNewTag);
      aNewTag._addContact(this);
    }
    this._tags = tags;

    // Finally, notify of the changes.
    if (shouldRemove) {
      aOldTag.notifyObservers(this, "contact-moved-out");
      for (const observer of this._observers) {
        observer.observe(aOldTag, "contact-moved-out", null);
      }
      Services.obs.notifyObservers(this, "contact-tag-removed", aOldTag.id);
    }
    if (shouldAdd) {
      aNewTag.notifyObservers(this, "contact-moved-in");
      for (const observer of this._observers) {
        observer.observe(aNewTag, "contact-moved-in", null);
      }
      Services.obs.notifyObservers(this, "contact-tag-added", aNewTag.id);
    }
    Services.obs.notifyObservers(this, "contact-moved");
  },

  getBuddies() {
    return this._buddies;
  },
  get _empty() {
    return this._buddies.length == 0 || this._buddies.every(b => b._empty);
  },

  mergeContact(aContact) {
    // Avoid merging the contact with itself or merging into an
    // already removed contact.
    if (aContact.id == this.id || !(this.id in ContactsById)) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    this._ensureNotDummy();
    const contact = ContactsById[aContact.id]; // remove XPConnect wrapper

    // Copy all the contact-only tags first, otherwise they would be lost.
    for (const tag of contact.getTags()) {
      if (!contact._isTagInherited(tag)) {
        this.addTag(tag);
      }
    }

    // Adopt each buddy. Removing the last one will delete the contact.
    for (const buddy of contact.getBuddies()) {
      buddy.contact = this;
    }
    this._updatePreferredBuddy();
  },
  moveBuddyBefore(aBuddy, aBeforeBuddy) {
    const buddy = BuddiesById[aBuddy.id]; // remove XPConnect wrapper
    const oldPosition = this._buddies.indexOf(buddy);
    if (oldPosition == -1) {
      throw new Error("aBuddy isn't attached to this contact");
    }

    let newPosition = -1;
    if (aBeforeBuddy) {
      newPosition = this._buddies.indexOf(BuddiesById[aBeforeBuddy.id]);
    }
    if (newPosition == -1) {
      newPosition = this._buddies.length - 1;
    }

    if (oldPosition == newPosition) {
      return;
    }

    this._buddies.splice(oldPosition, 1);
    this._buddies.splice(newPosition, 0, buddy);
    this._updatePositions(
      Math.min(oldPosition, newPosition),
      Math.max(oldPosition, newPosition)
    );
    buddy._notifyObservers("position-changed", String(newPosition));
    this._updatePreferredBuddy(buddy);
  },
  adoptBuddy(aBuddy) {
    if (aBuddy.contact.id == this.id) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    const buddy = BuddiesById[aBuddy.id]; // remove XPConnect wrapper
    buddy.contact = this;
    this._updatePreferredBuddy(buddy);
  },
  _massRemove: false,
  _removeBuddy(aBuddy) {
    if (this._buddies.length == 1) {
      if (this._id > 0) {
        const statement = lazy.DBConn.createStatement(
          "DELETE FROM contacts WHERE id = :id"
        );
        statement.params.id = this._id;
        executeAsyncThenFinalize(statement);
      }
      this._notifyObservers("removed");
      delete ContactsById[this._id];

      for (const tag of this._tags) {
        tag._removeContact(this);
      }
      const statement = lazy.DBConn.createStatement(
        "DELETE FROM contact_tag WHERE contact_id = :id"
      );
      statement.params.id = this._id;
      executeAsyncThenFinalize(statement);

      delete this._tags;
      delete this._buddies;
      delete this._observers;
    } else {
      const index = this._buddies.indexOf(aBuddy);
      if (index == -1) {
        throw new Error("Removing an unknown buddy from contact " + this._id);
      }

      this._buddies = this._buddies.filter(b => b !== aBuddy);

      // If we are actually removing the whole contact, don't bother updating
      // the positions or the preferred buddy.
      if (this._massRemove) {
        return;
      }

      // No position to update if the removed buddy is at the last position.
      if (index < this._buddies.length) {
        this._updatePositions(index);
      }

      if (this._preferredBuddy.id == aBuddy.id) {
        this._updatePreferredBuddy();
      }
    }
  },
  _updatePositions(aIndexBegin, aIndexEnd) {
    if (aIndexEnd === undefined) {
      aIndexEnd = this._buddies.length - 1;
    }
    if (aIndexBegin > aIndexEnd) {
      throw new Error("_updatePositions: Invalid indexes");
    }

    const statement = lazy.DBConn.createStatement(
      "UPDATE buddies SET position = :position WHERE id = :buddyId"
    );
    for (let i = aIndexBegin; i <= aIndexEnd; ++i) {
      statement.params.position = i;
      statement.params.buddyId = this._buddies[i].id;
      statement.executeAsync();
    }
    statement.finalize();
  },

  detachBuddy(aBuddy) {
    // Should return a new contact with the same list of tags.
    const buddy = BuddiesById[aBuddy.id];
    if (buddy.contact.id != this.id) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }
    if (buddy.contact._buddies.length == 1) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }

    // Save the list of tags, it may be destroyed if the buddy was the last one.
    const tags = buddy.contact.getTags();

    // Create a new dummy contact and use it for the detached buddy.
    buddy.contact = new Contact();
    buddy.contact._notifyObservers("added");

    // The first tag was inherited during the contact setter.
    // This will copy the remaining tags.
    for (const tag of tags) {
      buddy.contact.addTag(tag);
    }

    return buddy.contact;
  },
  remove() {
    this._massRemove = true;
    for (const buddy of this._buddies) {
      buddy.remove();
    }
  },

  // imIStatusInfo implementation
  _preferredBuddy: null,
  get preferredBuddy() {
    if (!this._preferredBuddy) {
      this._updatePreferredBuddy();
    }
    return this._preferredBuddy;
  },
  set preferredBuddy(aBuddy) {
    const shouldNotify = this._preferredBuddy != null;
    const oldDisplayName =
      this._preferredBuddy && this._preferredBuddy.displayName;
    this._preferredBuddy = aBuddy;
    if (shouldNotify) {
      this._notifyObservers("preferred-buddy-changed");
    }
    if (oldDisplayName && this._preferredBuddy.displayName != oldDisplayName) {
      this._notifyObservers("display-name-changed", oldDisplayName);
    }
    this._updateStatus();
  },
  // aBuddy indicate which buddy's availability has changed.
  _updatePreferredBuddy(aBuddy) {
    if (aBuddy) {
      aBuddy = BuddiesById[aBuddy.id]; // remove potential XPConnect wrapper

      if (!this._preferredBuddy) {
        this.preferredBuddy = aBuddy;
        return;
      }

      if (aBuddy.id == this._preferredBuddy.id) {
        // The suggested buddy is already preferred, check if its
        // availability has changed.
        if (
          aBuddy.statusType > this._statusType ||
          (aBuddy.statusType == this._statusType &&
            aBuddy.availabilityDetails >= this._availabilityDetails)
        ) {
          // keep the currently preferred buddy, only update the status.
          this._updateStatus();
          return;
        }
        // We aren't sure that the currently preferred buddy should
        // still be preferred. Let's go through the list!
      } else {
        // The suggested buddy is not currently preferred. If it is
        // more available or at a better position, prefer it!
        if (
          aBuddy.statusType > this._statusType ||
          (aBuddy.statusType == this._statusType &&
            (aBuddy.availabilityDetails > this._availabilityDetails ||
              (aBuddy.availabilityDetails == this._availabilityDetails &&
                this._buddies.indexOf(aBuddy) <
                  this._buddies.indexOf(this.preferredBuddy))))
        ) {
          this.preferredBuddy = aBuddy;
        }
        return;
      }
    }

    let preferred;
    // |this._buddies| is ordered by user preference, so in case of
    // equal availability, keep the current value of |preferred|.
    for (const buddy of this._buddies) {
      if (
        !preferred ||
        preferred.statusType < buddy.statusType ||
        (preferred.statusType == buddy.statusType &&
          preferred.availabilityDetails < buddy.availabilityDetails)
      ) {
        preferred = buddy;
      }
    }
    if (
      preferred &&
      (!this._preferredBuddy || preferred.id != this._preferredBuddy.id)
    ) {
      this.preferredBuddy = preferred;
    }
  },
  _updateStatus() {
    const buddy = this._preferredBuddy; // for convenience

    // Decide which notifications should be fired.
    const notifications = [];
    if (
      this._statusType != buddy.statusType ||
      this._availabilityDetails != buddy.availabilityDetails
    ) {
      notifications.push("availability-changed");
    }
    if (
      this._statusType != buddy.statusType ||
      this._statusText != buddy.statusText
    ) {
      notifications.push("status-changed");
      if (this.online && buddy.statusType <= Ci.imIStatusInfo.STATUS_OFFLINE) {
        notifications.push("signed-off");
      }
      if (!this.online && buddy.statusType > Ci.imIStatusInfo.STATUS_OFFLINE) {
        notifications.push("signed-on");
      }
    }

    // Actually change the stored status.
    [this._statusType, this._statusText, this._availabilityDetails] = [
      buddy.statusType,
      buddy.statusText,
      buddy.availabilityDetails,
    ];

    // Fire the notifications.
    notifications.forEach(function (aTopic) {
      this._notifyObservers(aTopic);
    }, this);
  },
  get displayName() {
    return this._alias || this.preferredBuddy.displayName;
  },
  get buddyIconFilename() {
    return this.preferredBuddy.buddyIconFilename;
  },
  _statusType: 0,
  get statusType() {
    return this._statusType;
  },
  get online() {
    return this.statusType > Ci.imIStatusInfo.STATUS_OFFLINE;
  },
  get available() {
    return this.statusType == Ci.imIStatusInfo.STATUS_AVAILABLE;
  },
  get idle() {
    return this.statusType == Ci.imIStatusInfo.STATUS_IDLE;
  },
  get mobile() {
    return this.statusType == Ci.imIStatusInfo.STATUS_MOBILE;
  },
  _statusText: "",
  get statusText() {
    return this._statusText;
  },
  _availabilityDetails: 0,
  get availabilityDetails() {
    return this._availabilityDetails;
  },
  get canSendMessage() {
    return this.preferredBuddy.canSendMessage;
  },
  // XXX should we list the buddies in the tooltip?
  getTooltipInfo() {
    return this.preferredBuddy.getTooltipInfo();
  },
  createConversation() {
    const uiConv = IMServices.conversations.getUIConversationByContactId(
      this.id
    );
    if (uiConv) {
      return uiConv.target;
    }
    return this.preferredBuddy.createConversation();
  },

  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  },
  removeObserver(aObserver) {
    if (!this.hasOwnProperty("_observers")) {
      return;
    }

    this._observers = this._observers.filter(o => o !== aObserver);
  },
  // internal calls + calls from add-ons
  notifyObservers(aSubject, aTopic, aData) {
    for (const observer of this._observers) {
      if ("observe" in observer) {
        // avoid failing on destructed XBL bindings...
        observer.observe(aSubject, aTopic, aData);
      }
    }
    for (const tag of this._tags) {
      tag.notifyObservers(aSubject, aTopic, aData);
    }
    Services.obs.notifyObservers(aSubject, aTopic, aData);
  },
  _notifyObservers(aTopic, aData) {
    this.notifyObservers(this, "contact-" + aTopic, aData);
  },

  // This is called by the imIBuddy implementations.
  _observe(aSubject, aTopic, aData) {
    // Forward the notification.
    this.notifyObservers(aSubject, aTopic, aData);

    const isPreferredBuddy =
      aSubject instanceof Buddy && aSubject.id == this.preferredBuddy.id;
    switch (aTopic) {
      case "buddy-availability-changed":
        this._updatePreferredBuddy(aSubject);
        break;
      case "buddy-status-changed":
        if (isPreferredBuddy) {
          this._updateStatus();
        }
        break;
      case "buddy-display-name-changed":
        if (isPreferredBuddy && !this._alias) {
          this._notifyObservers("display-name-changed", aData);
        }
        break;
      case "buddy-icon-changed":
        if (isPreferredBuddy) {
          this._notifyObservers("icon-changed");
        }
        break;
      case "buddy-added":
        // Currently buddies are always added in dummy empty contacts,
        // later we may want to check this._buddies.length == 1.
        this._notifyObservers("added");
        break;
      case "buddy-removed":
        this._removeBuddy(aSubject);
    }
  },
};

var BuddiesById = {};
function Buddy(aId, aKey, aName, aSrvAlias, aContactId) {
  this._id = aId;
  this._key = aKey;
  this._name = aName;
  if (aSrvAlias) {
    this._srvAlias = aSrvAlias;
  }
  this._accounts = [];
  this._observers = [];

  if (aContactId) {
    this._contact = ContactsById[aContactId];
  }
  // Avoid failure if aContactId was invalid.
  if (!this._contact) {
    this._contact = new Contact(null, null);
  }

  this._contact._buddies.push(this);

  BuddiesById[this._id] = this;
}
Buddy.prototype = {
  __proto__: ClassInfo("imIBuddy", "Buddy"),
  get id() {
    return this._id;
  },
  destroy() {
    for (const ab of this._accounts) {
      ab.unInit();
    }
    delete this._accounts;
    delete this._observers;
    delete this._preferredAccount;
  },
  get protocol() {
    return this._accounts[0].account.protocol;
  },
  get userName() {
    return this._name;
  },
  get normalizedName() {
    return this._key;
  },
  _srvAlias: "",
  _contact: null,
  get contact() {
    return this._contact;
  },
  set contact(aContact) /* not in imIBuddy */ {
    if (aContact.id == this._contact.id) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    this._notifyObservers("moved-out-of-contact");
    this._contact._removeBuddy(this);

    this._contact = aContact;
    this._contact._buddies.push(this);

    // Ensure all the inherited tags are in the new contact.
    for (const accountBuddy of this._accounts) {
      this._contact.addTag(TagsById[accountBuddy.tag.id], true);
    }

    const statement = lazy.DBConn.createStatement(
      "UPDATE buddies SET contact_id = :contactId, " +
        "position = :position " +
        "WHERE id = :buddyId"
    );
    statement.params.contactId = aContact.id > 0 ? aContact.id : 0;
    statement.params.position = aContact._buddies.length - 1;
    statement.params.buddyId = this.id;
    executeAsyncThenFinalize(statement);

    this._notifyObservers("moved-into-contact");
  },
  _hasAccountBuddy(aAccountId, aTagId) {
    for (const ab of this._accounts) {
      if (ab.account.numericId == aAccountId && ab.tag.id == aTagId) {
        return true;
      }
    }
    return false;
  },
  getAccountBuddies() {
    return this._accounts;
  },

  _addAccount(aAccountBuddy, aTag) {
    this._accounts.push(aAccountBuddy);
    const contact = this._contact;
    if (!this._contact._tags.includes(aTag)) {
      this._contact._tags.push(aTag);
      aTag._addContact(contact);
    }

    if (!this._preferredAccount) {
      this._preferredAccount = aAccountBuddy;
    }
  },
  get _empty() {
    return this._accounts.length == 0;
  },

  remove() {
    for (const account of this._accounts) {
      account.remove();
    }
  },

  // imIStatusInfo implementation
  _preferredAccount: null,
  get preferredAccountBuddy() {
    return this._preferredAccount;
  },
  _isPreferredAccount(aAccountBuddy) {
    if (
      aAccountBuddy.account.numericId !=
      this._preferredAccount.account.numericId
    ) {
      return false;
    }

    // In case we have more than one accountBuddy for the same buddy
    // and account (possible if the buddy is in several groups on the
    // server), the protocol plugin may be broken and not update all
    // instances, so ensure we handle the notifications on the instance
    // that is currently being notified of a change:
    this._preferredAccount = aAccountBuddy;

    return true;
  },
  set preferredAccount(aAccount) {
    const oldDisplayName =
      this._preferredAccount && this._preferredAccount.displayName;
    this._preferredAccount = aAccount;
    this._notifyObservers("preferred-account-changed");
    if (
      oldDisplayName &&
      this._preferredAccount.displayName != oldDisplayName
    ) {
      this._notifyObservers("display-name-changed", oldDisplayName);
    }
    this._updateStatus();
  },
  // aAccount indicate which account's availability has changed.
  _updatePreferredAccount(aAccount) {
    if (aAccount) {
      if (
        aAccount.account.numericId == this._preferredAccount.account.numericId
      ) {
        // The suggested account is already preferred, check if its
        // availability has changed.
        if (
          aAccount.statusType > this._statusType ||
          (aAccount.statusType == this._statusType &&
            aAccount.availabilityDetails >= this._availabilityDetails)
        ) {
          // keep the currently preferred account, only update the status.
          this._updateStatus();
          return;
        }
        // We aren't sure that the currently preferred account should
        // still be preferred. Let's go through the list!
      } else {
        // The suggested account is not currently preferred. If it is
        // more available, prefer it!
        if (
          aAccount.statusType > this._statusType ||
          (aAccount.statusType == this._statusType &&
            aAccount.availabilityDetails > this._availabilityDetails)
        ) {
          this.preferredAccount = aAccount;
        }
        return;
      }
    }

    let preferred;
    // TODO take into account the order of the account-manager list.
    for (const account of this._accounts) {
      if (
        !preferred ||
        preferred.statusType < account.statusType ||
        (preferred.statusType == account.statusType &&
          preferred.availabilityDetails < account.availabilityDetails)
      ) {
        preferred = account;
      }
    }
    if (!this._preferredAccount) {
      if (preferred) {
        this.preferredAccount = preferred;
      }
      return;
    }
    if (
      preferred.account.numericId != this._preferredAccount.account.numericId
    ) {
      this.preferredAccount = preferred;
    } else {
      this._updateStatus();
    }
  },
  _updateStatus() {
    const account = this._preferredAccount; // for convenience

    // Decide which notifications should be fired.
    const notifications = [];
    if (
      this._statusType != account.statusType ||
      this._availabilityDetails != account.availabilityDetails
    ) {
      notifications.push("availability-changed");
    }
    if (
      this._statusType != account.statusType ||
      this._statusText != account.statusText
    ) {
      notifications.push("status-changed");
      if (
        this.online &&
        account.statusType <= Ci.imIStatusInfo.STATUS_OFFLINE
      ) {
        notifications.push("signed-off");
      }
      if (
        !this.online &&
        account.statusType > Ci.imIStatusInfo.STATUS_OFFLINE
      ) {
        notifications.push("signed-on");
      }
    }

    // Actually change the stored status.
    [this._statusType, this._statusText, this._availabilityDetails] = [
      account.statusType,
      account.statusText,
      account.availabilityDetails,
    ];

    // Fire the notifications.
    notifications.forEach(function (aTopic) {
      this._notifyObservers(aTopic);
    }, this);
  },
  get displayName() {
    return (
      (this._preferredAccount && this._preferredAccount.displayName) ||
      this._srvAlias ||
      this._name
    );
  },
  get buddyIconFilename() {
    return this._preferredAccount.buddyIconFilename;
  },
  _statusType: 0,
  get statusType() {
    return this._statusType;
  },
  get online() {
    return this.statusType > Ci.imIStatusInfo.STATUS_OFFLINE;
  },
  get available() {
    return this.statusType == Ci.imIStatusInfo.STATUS_AVAILABLE;
  },
  get idle() {
    return this.statusType == Ci.imIStatusInfo.STATUS_IDLE;
  },
  get mobile() {
    return this.statusType == Ci.imIStatusInfo.STATUS_MOBILE;
  },
  _statusText: "",
  get statusText() {
    return this._statusText;
  },
  _availabilityDetails: 0,
  get availabilityDetails() {
    return this._availabilityDetails;
  },
  get canSendMessage() {
    return this._preferredAccount.canSendMessage;
  },
  // XXX should we list the accounts in the tooltip?
  getTooltipInfo() {
    return this._preferredAccount.getTooltipInfo();
  },
  createConversation() {
    return this._preferredAccount.createConversation();
  },

  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  },
  removeObserver(aObserver) {
    if (!this._observers) {
      return;
    }
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  // internal calls + calls from add-ons
  notifyObservers(aSubject, aTopic, aData) {
    try {
      for (const observer of this._observers) {
        observer.observe(aSubject, aTopic, aData);
      }
      this._contact._observe(aSubject, aTopic, aData);
    } catch (e) {
      console.error(e);
    }
  },
  _notifyObservers(aTopic, aData) {
    this.notifyObservers(this, "buddy-" + aTopic, aData);
  },

  // This is called by the prplIAccountBuddy implementations.
  observe(aSubject, aTopic, aData) {
    // Forward the notification.
    this.notifyObservers(aSubject, aTopic, aData);

    switch (aTopic) {
      case "account-buddy-availability-changed":
        this._updatePreferredAccount(aSubject);
        break;
      case "account-buddy-status-changed":
        if (this._isPreferredAccount(aSubject)) {
          this._updateStatus();
        }
        break;
      case "account-buddy-display-name-changed":
        if (this._isPreferredAccount(aSubject)) {
          this._srvAlias =
            this.displayName != this.userName ? this.displayName : "";
          const statement = lazy.DBConn.createStatement(
            "UPDATE buddies SET srv_alias = :srvAlias WHERE id = :buddyId"
          );
          statement.params.buddyId = this.id;
          statement.params.srvAlias = this._srvAlias;
          executeAsyncThenFinalize(statement);
          this._notifyObservers("display-name-changed", aData);
        }
        break;
      case "account-buddy-icon-changed":
        if (this._isPreferredAccount(aSubject)) {
          this._notifyObservers("icon-changed");
        }
        break;
      case "account-buddy-added":
        if (this._accounts.length == 0) {
          // Add the new account in the empty buddy instance.
          // The TagsById hack is to bypass the xpconnect wrapper.
          this._addAccount(aSubject, TagsById[aSubject.tag.id]);
          this._updateStatus();
          this._notifyObservers("added");
        } else {
          this._accounts.push(aSubject);
          this.contact._moved(null, aSubject.tag);
          this._updatePreferredAccount(aSubject);
        }
        break;
      case "account-buddy-removed":
        if (this._accounts.length == 1) {
          const statement = lazy.DBConn.createStatement(
            "DELETE FROM buddies WHERE id = :id"
          );
          try {
            statement.params.id = this.id;
            statement.execute();
          } finally {
            statement.finalize();
          }
          this._notifyObservers("removed");

          delete BuddiesById[this._id];
          this.destroy();
        } else {
          this._accounts = this._accounts.filter(function (ab) {
            return (
              ab.account.numericId != aSubject.account.numericId ||
              ab.tag.id != aSubject.tag.id
            );
          });
          if (
            this._preferredAccount.account.numericId ==
              aSubject.account.numericId &&
            this._preferredAccount.tag.id == aSubject.tag.id
          ) {
            this._preferredAccount = null;
            this._updatePreferredAccount();
          }
          this.contact._moved(aSubject.tag);
        }
        break;
    }
  },
};

class ContactsService {
  initContacts() {
    let statement = lazy.DBConn.createStatement("SELECT id, name FROM tags");
    try {
      while (statement.executeStep()) {
        Tags.push(new Tag(statement.getInt32(0), statement.getUTF8String(1)));
      }
    } finally {
      statement.finalize();
    }

    statement = lazy.DBConn.createStatement("SELECT id, alias FROM contacts");
    try {
      while (statement.executeStep()) {
        new Contact(statement.getInt32(0), statement.getUTF8String(1));
      }
    } finally {
      statement.finalize();
    }

    statement = lazy.DBConn.createStatement(
      "SELECT contact_id, tag_id FROM contact_tag"
    );
    try {
      while (statement.executeStep()) {
        const contact = ContactsById[statement.getInt32(0)];
        const tag = TagsById[statement.getInt32(1)];
        contact._tags.push(tag);
        tag._addContact(contact);
      }
    } finally {
      statement.finalize();
    }

    statement = lazy.DBConn.createStatement(
      "SELECT id, key, name, srv_alias, contact_id FROM buddies ORDER BY position"
    );
    try {
      while (statement.executeStep()) {
        new Buddy(
          statement.getInt32(0),
          statement.getUTF8String(1),
          statement.getUTF8String(2),
          statement.getUTF8String(3),
          statement.getInt32(4)
        );
        // FIXME is there a way to enforce that all AccountBuddies of a Buddy have the same protocol?
      }
    } finally {
      statement.finalize();
    }

    statement = lazy.DBConn.createStatement(
      "SELECT account_id, buddy_id, tag_id FROM account_buddy"
    );
    try {
      while (statement.executeStep()) {
        const accountId = statement.getInt32(0);
        const buddyId = statement.getInt32(1);
        const tagId = statement.getInt32(2);

        const account = IMServices.accounts.getAccountByNumericId(accountId);
        // If the account was deleted without properly cleaning up the
        // account_buddy, skip loading this account buddy.
        if (!account) {
          continue;
        }

        if (!BuddiesById.hasOwnProperty(buddyId)) {
          console.error(
            "Corrupted database: account_buddy entry for account " +
              accountId +
              " and tag " +
              tagId +
              " references unknown buddy with id " +
              buddyId
          );
          continue;
        }

        const buddy = BuddiesById[buddyId];
        if (buddy._hasAccountBuddy(accountId, tagId)) {
          console.error(
            "Corrupted database: duplicated account_buddy entry: " +
              "account_id = " +
              accountId +
              ", buddy_id = " +
              buddyId +
              ", tag_id = " +
              tagId
          );
          continue;
        }

        const tag = TagsById[tagId];
        try {
          buddy._addAccount(account.loadBuddy(buddy, tag), tag);
        } catch (e) {
          console.error(e);
          dump(e + "\n");
        }
      }
    } finally {
      statement.finalize();
    }
    otherContactsTag._initHiddenTags();
  }
  unInitContacts() {
    Tags = [];
    TagsById = {};
    // Avoid shutdown leaks caused by references to native components
    // implementing prplIAccountBuddy.
    for (const buddyId in BuddiesById) {
      const buddy = BuddiesById[buddyId];
      buddy.destroy();
    }
    BuddiesById = {};
    ContactsById = {};
  }

  /**
   * @param {number} aId
   * @returns {imIContact}
   */
  getContactById = aId => ContactsById[aId];
  /**
   * Get an array of all existing contacts.
   *
   * @returns {imIContact[]}
   */
  getContacts() {
    return Object.keys(ContactsById)
      .filter(id => !ContactsById[id]._empty)
      .map(id => ContactsById[id]);
  }
  /**
   * @param {number} aId
   * @returns {imIBuddy}
   */
  getBuddyById = aId => BuddiesById[aId];
  /**
   * @param {string} aNormalizedName
   * @param {prplIProtocol} aPrpl
   * @returns {?imIBuddy}
   */
  getBuddyByNameAndProtocol(aNormalizedName, aPrpl) {
    const statement = lazy.DBConn.createStatement(
      "SELECT b.id FROM buddies b " +
        "JOIN account_buddy ab ON buddy_id = b.id " +
        "JOIN accounts a ON account_id = a.id " +
        "WHERE b.key = :buddyName and a.prpl = :prplId"
    );
    statement.params.buddyName = aNormalizedName;
    statement.params.prplId = aPrpl.id;
    try {
      if (!statement.executeStep()) {
        return null;
      }
      return BuddiesById[statement.row.id];
    } finally {
      statement.finalize();
    }
  }
  /**
   * @param {string} aNormalizedName
   * @param {imIAccount} aAccount
   * @returns {?prplIAccountBuddy}
   */
  getAccountBuddyByNameAndAccount(aNormalizedName, aAccount) {
    const buddy = this.getBuddyByNameAndProtocol(
      aNormalizedName,
      aAccount.protocol
    );
    if (buddy) {
      const id = aAccount.id;
      for (const accountBuddy of buddy.getAccountBuddies()) {
        if (accountBuddy.account.id == id) {
          return accountBuddy;
        }
      }
    }
    return null;
  }

  // These 3 functions are called by the protocol plugins when
  // synchronizing the buddy list with the server stored list,
  // or after user operations have been performed.

  /**
   * @param {prplIAccountBuddy} aAccountBuddy
   */
  accountBuddyAdded(aAccountBuddy) {
    const account = aAccountBuddy.account;
    const normalizedName = aAccountBuddy.normalizedName;
    let buddy = this.getBuddyByNameAndProtocol(
      normalizedName,
      account.protocol
    );
    if (!buddy) {
      const statement = lazy.DBConn.createStatement(
        "INSERT INTO buddies " +
          "(key, name, srv_alias, position) " +
          "VALUES(:key, :name, :srvAlias, 0)"
      );
      try {
        const name = aAccountBuddy.userName;
        const srvAlias = aAccountBuddy.serverAlias;
        statement.params.key = normalizedName;
        statement.params.name = name;
        statement.params.srvAlias = srvAlias;
        statement.execute();
        buddy = new Buddy(
          lazy.DBConn.lastInsertRowID,
          normalizedName,
          name,
          srvAlias,
          0
        );
      } finally {
        statement.finalize();
      }
    }

    // Initialize the 'buddy' field of the prplIAccountBuddy instance.
    aAccountBuddy.buddy = buddy;

    // Ensure we aren't storing a duplicate entry.
    const accountId = account.numericId;
    const tagId = aAccountBuddy.tag.id;
    if (buddy._hasAccountBuddy(accountId, tagId)) {
      console.error(
        "Attempting to store a duplicate account buddy " +
          normalizedName +
          ", account id = " +
          accountId +
          ", tag id = " +
          tagId
      );
      return;
    }

    // Store the new account buddy.
    const statement = lazy.DBConn.createStatement(
      "INSERT INTO account_buddy " +
        "(account_id, buddy_id, tag_id) " +
        "VALUES(:accountId, :buddyId, :tagId)"
    );
    try {
      statement.params.accountId = accountId;
      statement.params.buddyId = buddy.id;
      statement.params.tagId = tagId;
      statement.execute();
    } finally {
      statement.finalize();
    }

    // Fire the notifications.
    buddy.observe(aAccountBuddy, "account-buddy-added");
  }
  /**
   * @param {prplIAccountBuddy} aAccountBuddy
   */
  accountBuddyRemoved(aAccountBuddy) {
    const buddy = aAccountBuddy.buddy;
    const statement = lazy.DBConn.createStatement(
      "DELETE FROM account_buddy " +
        "WHERE account_id = :accountId AND " +
        "buddy_id = :buddyId AND " +
        "tag_id = :tagId"
    );
    try {
      statement.params.accountId = aAccountBuddy.account.numericId;
      statement.params.buddyId = buddy.id;
      statement.params.tagId = aAccountBuddy.tag.id;
      statement.execute();
    } finally {
      statement.finalize();
    }

    buddy.observe(aAccountBuddy, "account-buddy-removed");
  }
  /**
   * @param {prplIAccountBuddy} aAccountBuddy
   * @param {imITag} aOldTag
   * @param {imITag} aNewTag
   */
  accountBuddyMoved(aAccountBuddy, aOldTag, aNewTag) {
    const buddy = aAccountBuddy.buddy;
    const statement = lazy.DBConn.createStatement(
      "UPDATE account_buddy " +
        "SET tag_id = :newTagId " +
        "WHERE account_id = :accountId AND " +
        "buddy_id = :buddyId AND " +
        "tag_id = :oldTagId"
    );
    try {
      statement.params.accountId = aAccountBuddy.account.numericId;
      statement.params.buddyId = buddy.id;
      statement.params.oldTagId = aOldTag.id;
      statement.params.newTagId = aNewTag.id;
      statement.execute();
    } finally {
      statement.finalize();
    }

    const contact = ContactsById[buddy.contact.id];

    // aNewTag is now inherited by the contact from an account buddy, so avoid
    // keeping direct tag <-> contact links in the contact_tag table.
    contact._removeContactTagRow(aNewTag);

    buddy.observe(aAccountBuddy, "account-buddy-moved");
    contact._moved(aOldTag, aNewTag);
  }

  // These methods are called by the AccountService
  // to keep the accounts table in sync with accounts stored in the
  // preferences.

  /**
   * Called when an account is created or loaded to store the new
   * account or ensure it doesn't conflict with an existing account
   * (to detect database corruption).
   * Will throw if a stored account has the id aId but a different
   * username or prplId.
   *
   * @param {number} aId
   * @param {string} aUserName
   * @param {string} aPrplId
   */
  storeAccount(aId, aUserName, aPrplId) {
    let statement = lazy.DBConn.createStatement(
      "SELECT name, prpl FROM accounts WHERE id = :id"
    );
    statement.params.id = aId;
    try {
      if (statement.executeStep()) {
        if (
          statement.getUTF8String(0) == aUserName &&
          statement.getUTF8String(1) == aPrplId
        ) {
          // The account is already stored correctly.
          return;
        }
        throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED); // Corrupted database?!?
      }
    } finally {
      statement.finalize();
    }

    // Actually store the account.
    statement = lazy.DBConn.createStatement(
      "INSERT INTO accounts (id, name, prpl) " +
        "VALUES(:id, :userName, :prplId)"
    );
    try {
      statement.params.id = aId;
      statement.params.userName = aUserName;
      statement.params.prplId = aPrplId;
      statement.execute();
    } finally {
      statement.finalize();
    }
  }
  /**
   * Check if an account id already exists in the database.
   *
   * @param {number} aId
   * @returns {boolean}
   */
  accountIdExists(aId) {
    const statement = lazy.DBConn.createStatement(
      "SELECT id FROM accounts WHERE id = :id"
    );
    try {
      statement.params.id = aId;
      return statement.executeStep();
    } finally {
      statement.finalize();
    }
  }
  /**
   * Called when deleting an account to remove it from blist.sqlite.
   *
   * @param {number} aId
   */
  forgetAccount(aId) {
    let statement = lazy.DBConn.createStatement(
      "DELETE FROM accounts WHERE id = :accountId"
    );
    try {
      statement.params.accountId = aId;
      statement.execute();
    } finally {
      statement.finalize();
    }

    // removing the account from the accounts table is not enough,
    // we need to remove all the associated account_buddy entries too
    statement = lazy.DBConn.createStatement(
      "DELETE FROM account_buddy WHERE account_id = :accountId"
    );
    try {
      statement.params.accountId = aId;
      statement.execute();
    } finally {
      statement.finalize();
    }
  }
}

export const contacts = new ContactsService();
