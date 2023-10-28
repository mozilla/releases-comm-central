/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CryptoWrapper } from "resource://services-sync/record.sys.mjs";
import {
  Store,
  SyncEngine,
  Tracker,
} from "resource://services-sync/engines.sys.mjs";
import { Utils } from "resource://services-sync/util.sys.mjs";

import { SCORE_INCREMENT_XLARGE } from "resource://services-sync/constants.sys.mjs";

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const SYNCED_COMMON_PROPERTIES = {
  autocomplete: "enable_autocomplete",
  readOnly: "readOnly",
};

const SYNCED_CARDDAV_PROPERTIES = {
  syncInterval: "carddav.syncinterval",
  url: "carddav.url",
  username: "carddav.username",
};

const SYNCED_LDAP_PROPERTIES = {
  protocolVersion: "protocolVersion",
  authSASLMechanism: "auth.saslmech",
  authDN: "auth.dn",
  uri: "uri",
  maxHits: "maxHits",
};

/**
 * AddressBookRecord represents the state of an add-on in an application.
 *
 * Each add-on has its own record for each application ID it is installed
 * on.
 *
 * The ID of add-on records is a randomly-generated GUID. It is random instead
 * of deterministic so the URIs of the records cannot be guessed and so
 * compromised server credentials won't result in disclosure of the specific
 * add-ons present in a Sync account.
 *
 * The record contains the following fields:
 *
 */
export function AddressBookRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}

AddressBookRecord.prototype = {
  __proto__: CryptoWrapper.prototype,
  _logName: "Record.AddressBook",
};
Utils.deferGetSet(AddressBookRecord, "cleartext", ["name", "type", "prefs"]);

export function AddressBooksEngine(service) {
  SyncEngine.call(this, "AddressBooks", service);
}

AddressBooksEngine.prototype = {
  __proto__: SyncEngine.prototype,
  _storeObj: AddressBookStore,
  _trackerObj: AddressBookTracker,
  _recordObj: AddressBookRecord,
  version: 1,
  syncPriority: 6,

  /*
   * Returns a changeset for this sync. Engine implementations can override this
   * method to bypass the tracker for certain or all changed items.
   */
  async getChangedIDs() {
    return this._tracker.getChangedIDs();
  },
};

function AddressBookStore(name, engine) {
  Store.call(this, name, engine);
}
AddressBookStore.prototype = {
  __proto__: Store.prototype,

  _addPrefsToBook(book, record, whichPrefs) {
    for (const [key, realKey] of Object.entries(whichPrefs)) {
      const value = record.prefs[key];
      const type = typeof value;
      if (type == "string") {
        book.setStringValue(realKey, value);
      } else if (type == "number") {
        book.setIntValue(realKey, value);
      } else if (type == "boolean") {
        book.setBoolValue(realKey, value);
      }
    }
  },

  /**
   * Create an item in the store from a record.
   *
   * This is called by the default implementation of applyIncoming(). If using
   * applyIncomingBatch(), this won't be called unless your store calls it.
   *
   * @param record
   *        The store record to create an item from
   */
  async create(record) {
    if (
      ![
        MailServices.ab.LDAP_DIRECTORY_TYPE,
        MailServices.ab.CARDDAV_DIRECTORY_TYPE,
      ].includes(record.type)
    ) {
      return;
    }

    const dirPrefId = MailServices.ab.newAddressBook(
      record.name,
      null,
      record.type,
      record.id
    );
    const book = MailServices.ab.getDirectoryFromId(dirPrefId);

    this._addPrefsToBook(book, record, SYNCED_COMMON_PROPERTIES);
    if (record.type == MailServices.ab.CARDDAV_DIRECTORY_TYPE) {
      this._addPrefsToBook(book, record, SYNCED_CARDDAV_PROPERTIES);
      book.wrappedJSObject.fetchAllFromServer();
    } else if (record.type == MailServices.ab.LDAP_DIRECTORY_TYPE) {
      this._addPrefsToBook(book, record, SYNCED_LDAP_PROPERTIES);
    }
  },

  /**
   * Remove an item in the store from a record.
   *
   * This is called by the default implementation of applyIncoming(). If using
   * applyIncomingBatch(), this won't be called unless your store calls it.
   *
   * @param record
   *        The store record to delete an item from
   */
  async remove(record) {
    const book = MailServices.ab.getDirectoryFromUID(record.id);
    if (!book) {
      this._log.trace("Asked to remove record that doesn't exist, ignoring");
      return;
    }

    const deletedPromise = new Promise(resolve => {
      Services.obs.addObserver(
        {
          observe() {
            Services.obs.removeObserver(this, "addrbook-directory-deleted");
            resolve();
          },
        },
        "addrbook-directory-deleted"
      );
    });
    MailServices.ab.deleteAddressBook(book.URI);
    await deletedPromise;
  },

  /**
   * Update an item from a record.
   *
   * This is called by the default implementation of applyIncoming(). If using
   * applyIncomingBatch(), this won't be called unless your store calls it.
   *
   * @param record
   *        The record to use to update an item from
   */
  async update(record) {
    const book = MailServices.ab.getDirectoryFromUID(record.id);
    if (!book) {
      this._log.trace("Skipping update for unknown item: " + record.id);
      return;
    }
    if (book.dirType != record.type) {
      throw new Components.Exception(
        `Refusing to change book type from ${book.dirType} to ${record.type}`,
        Cr.NS_ERROR_FAILURE
      );
    }

    if (book.dirName != record.name) {
      book.dirName = record.name;
    }
    this._addPrefsToBook(book, record, SYNCED_COMMON_PROPERTIES);
    if (record.type == MailServices.ab.CARDDAV_DIRECTORY_TYPE) {
      this._addPrefsToBook(book, record, SYNCED_CARDDAV_PROPERTIES);
    } else if (record.type == MailServices.ab.LDAP_DIRECTORY_TYPE) {
      this._addPrefsToBook(book, record, SYNCED_LDAP_PROPERTIES);
    }
  },

  /**
   * Determine whether a record with the specified ID exists.
   *
   * Takes a string record ID and returns a booleans saying whether the record
   * exists.
   *
   * @param  id
   *         string record ID
   * @return boolean indicating whether record exists locally
   */
  async itemExists(id) {
    return id in (await this.getAllIDs());
  },

  /**
   * Obtain the set of all known record IDs.
   *
   * @return Object with ID strings as keys and values of true. The values
   *         are ignored.
   */
  async getAllIDs() {
    const ids = {};
    for (const b of MailServices.ab.directories) {
      if (
        [
          MailServices.ab.LDAP_DIRECTORY_TYPE,
          MailServices.ab.CARDDAV_DIRECTORY_TYPE,
        ].includes(b.dirType)
      ) {
        ids[b.UID] = true;
      }
    }
    return ids;
  },

  /**
   * Create a record from the specified ID.
   *
   * If the ID is known, the record should be populated with metadata from
   * the store. If the ID is not known, the record should be created with the
   * delete field set to true.
   *
   * @param  id
   *         string record ID
   * @param  collection
   *         Collection to add record to. This is typically passed into the
   *         constructor for the newly-created record.
   * @return record type for this engine
   */
  async createRecord(id, collection) {
    const record = new AddressBookRecord(collection, id);

    const book = MailServices.ab.getDirectoryFromUID(id);

    // If we don't know about this ID, mark the record as deleted.
    if (!book) {
      record.deleted = true;
      return record;
    }

    record.name = book.dirName;
    record.type = book.dirType;
    record.prefs = {};

    function collectPrefs(prefData) {
      for (let [key, realKey] of Object.entries(prefData)) {
        realKey = `${book.dirPrefId}.${realKey}`;
        switch (Services.prefs.getPrefType(realKey)) {
          case Services.prefs.PREF_STRING:
            record.prefs[key] = Services.prefs.getStringPref(realKey);
            break;
          case Services.prefs.PREF_INT:
            record.prefs[key] = Services.prefs.getIntPref(realKey);
            break;
          case Services.prefs.PREF_BOOL:
            record.prefs[key] = Services.prefs.getBoolPref(realKey);
            break;
        }
      }
    }

    collectPrefs(SYNCED_COMMON_PROPERTIES);

    if (book.dirType == MailServices.ab.CARDDAV_DIRECTORY_TYPE) {
      collectPrefs(SYNCED_CARDDAV_PROPERTIES);
    } else if (book.dirType == MailServices.ab.LDAP_DIRECTORY_TYPE) {
      collectPrefs(SYNCED_LDAP_PROPERTIES);
    }

    return record;
  },
};

function AddressBookTracker(name, engine) {
  Tracker.call(this, name, engine);
}
AddressBookTracker.prototype = {
  __proto__: Tracker.prototype,

  _changedIDs: new Set(),
  _ignoreAll: false,

  async getChangedIDs() {
    const changes = {};
    for (const id of this._changedIDs) {
      changes[id] = 0;
    }
    return changes;
  },

  clearChangedIDs() {
    this._changedIDs.clear();
  },

  get ignoreAll() {
    return this._ignoreAll;
  },

  set ignoreAll(value) {
    this._ignoreAll = value;
  },

  onStart() {
    Services.prefs.addObserver("ldap_2.servers.", this);
    Services.obs.addObserver(this, "addrbook-directory-created");
    Services.obs.addObserver(this, "addrbook-directory-deleted");
  },

  onStop() {
    Services.prefs.removeObserver("ldap_2.servers.", this);
    Services.obs.removeObserver(this, "addrbook-directory-created");
    Services.obs.removeObserver(this, "addrbook-directory-deleted");
  },

  observe(subject, topic, data) {
    if (this._ignoreAll) {
      return;
    }

    let book;
    switch (topic) {
      case "nsPref:changed": {
        const serverKey = data.split(".")[2];
        const prefName = data.substring(serverKey.length + 16);
        if (
          prefName != "description" &&
          !Object.values(SYNCED_COMMON_PROPERTIES).includes(prefName) &&
          !Object.values(SYNCED_CARDDAV_PROPERTIES).includes(prefName) &&
          !Object.values(SYNCED_LDAP_PROPERTIES).includes(prefName)
        ) {
          return;
        }

        book = MailServices.ab.getDirectoryFromId(
          "ldap_2.servers." + serverKey
        );
        break;
      }
      case "addrbook-directory-created":
      case "addrbook-directory-deleted":
        book = subject;
        break;
    }

    if (
      book &&
      [
        MailServices.ab.LDAP_DIRECTORY_TYPE,
        MailServices.ab.CARDDAV_DIRECTORY_TYPE,
      ].includes(book.dirType) &&
      !this._changedIDs.has(book.UID)
    ) {
      this._changedIDs.add(book.UID);
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },
};
