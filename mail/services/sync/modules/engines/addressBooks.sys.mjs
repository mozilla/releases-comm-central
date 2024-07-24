/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CryptoWrapper } from "resource://services-sync/record.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { SyncEngine, Tracker } from "resource://services-sync/engines.sys.mjs";
import { SCORE_INCREMENT_XLARGE } from "resource://services-sync/constants.sys.mjs";
import { Utils } from "resource://services-sync/util.sys.mjs";
import { CachedStore } from "resource://services-sync/CachedStore.sys.mjs";

const { LDAP_DIRECTORY_TYPE, CARDDAV_DIRECTORY_TYPE } = Ci.nsIAbManager;

const DIRECTORY_TYPES = [
  [LDAP_DIRECTORY_TYPE, "ldap"],
  [CARDDAV_DIRECTORY_TYPE, "carddav"],
];
function directoryTypeForRecord(number) {
  return DIRECTORY_TYPES.find(dt => dt[0] == number)[1];
}
function directoryTypeForBook(string) {
  return DIRECTORY_TYPES.find(dt => dt[1] == string)[0];
}

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
  _logName: "Record.AddressBook",
};
Object.setPrototypeOf(AddressBookRecord.prototype, CryptoWrapper.prototype);
Utils.deferGetSet(AddressBookRecord, "cleartext", [
  "name",
  "type",
  "url",
  "username",
  "authMethod",
]);

AddressBookRecord.from = function (data) {
  const record = new AddressBookRecord(undefined, data.id);
  for (const [key, value] of Object.entries(data)) {
    record.cleartext[key] = value;
  }
  return record;
};

export function AddressBooksEngine(service) {
  SyncEngine.call(this, "AddressBooks", service);
}

AddressBooksEngine.prototype = {
  _storeObj: AddressBookStore,
  _trackerObj: AddressBookTracker,
  _recordObj: AddressBookRecord,
  version: 2,
  syncPriority: 6,

  /*
   * Returns a changeset for this sync. Engine implementations can override this
   * method to bypass the tracker for certain or all changed items.
   */
  async getChangedIDs() {
    return this._tracker.getChangedIDs();
  },
};
Object.setPrototypeOf(AddressBooksEngine.prototype, SyncEngine.prototype);

function AddressBookStore(name, engine) {
  CachedStore.call(this, name, engine);
}
AddressBookStore.prototype = {
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
    await super.create(record);

    if (!["carddav", "ldap"].includes(record.type)) {
      this._log.trace(
        `Skipping creation of unknown item type ("${record.type}"): ${record.id}`
      );
      return;
    }

    const type = directoryTypeForBook(record.type);
    const dirPrefId = MailServices.ab.newAddressBook(
      record.name,
      null,
      type,
      record.id
    );
    const book = MailServices.ab.getDirectoryFromId(dirPrefId);

    if (type == CARDDAV_DIRECTORY_TYPE) {
      book.setStringValue("carddav.url", record.url);
      book.setStringValue("carddav.username", record.username);
      book.wrappedJSObject.fetchAllFromServer().catch(console.error);
    } else if (type == LDAP_DIRECTORY_TYPE) {
      book.QueryInterface(Ci.nsIAbLDAPDirectory);
      book.lDAPURL = Services.io.newURI(record.url);
      book.authDn = record.username;
      book.saslMechanism = record.authMethod == "gssapi" ? "GSSAPI" : "";
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
    await super.remove(record);
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
    await super.update(record);

    const book = MailServices.ab.getDirectoryFromUID(record.id);
    if (!book) {
      this._log.trace("Skipping update for unknown item: " + record.id);
      return;
    }

    const type = directoryTypeForBook(record.type);
    if (book.dirType != type) {
      throw new Components.Exception(
        `Refusing to change book type from "${directoryTypeForRecord(
          book.dirType
        )}" to "${record.type}"`,
        Cr.NS_ERROR_FAILURE
      );
    }
    if (type == CARDDAV_DIRECTORY_TYPE) {
      const currentURL = book.getStringValue("carddav.url", "");
      if (record.url != currentURL) {
        throw new Components.Exception(
          `Refusing to change book URL from "${currentURL}" to "${record.url}"`,
          Cr.NS_ERROR_FAILURE
        );
      }
      book.setStringValue("carddav.username", record.username);
    } else if (type == LDAP_DIRECTORY_TYPE) {
      book.QueryInterface(Ci.nsIAbLDAPDirectory);
      book.lDAPURL = Services.io.newURI(record.url);
      book.authDn = record.username;
      book.saslMechanism = record.authMethod == "gssapi" ? "GSSAPI" : "";
    }

    book.dirName = record.name;
  },

  /**
   * Obtain the set of all known record IDs.
   *
   * @return Object with ID strings as keys and values of true. The values
   *         are ignored.
   */
  async getAllIDs() {
    const ids = await super.getAllIDs();
    for (const b of MailServices.ab.directories) {
      if ([LDAP_DIRECTORY_TYPE, CARDDAV_DIRECTORY_TYPE].includes(b.dirType)) {
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

    const data = await super.getCreateRecordData(id);
    const book = MailServices.ab.getDirectoryFromUID(id);

    // If we don't know about this ID, mark the record as deleted.
    if (!book && !data) {
      record.deleted = true;
      return record;
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        record.cleartext[key] = value;
      }
    }

    if (book) {
      record.name = book.dirName;
      record.type = directoryTypeForRecord(book.dirType);

      if (book.dirType == CARDDAV_DIRECTORY_TYPE) {
        record.url = book.getStringValue("carddav.url", "");
        record.username = book.getStringValue("carddav.username", "");
      } else if (book.dirType == LDAP_DIRECTORY_TYPE) {
        book.QueryInterface(Ci.nsIAbLDAPDirectory);
        record.url = book.lDAPURL.spec;
        if (book.authDn) {
          record.authMethod =
            book.saslMechanism == "GSSAPI" ? "gssapi" : "passwordCleartext";
          record.username = book.authDn;
        } else {
          delete record.authMethod;
          delete record.username;
        }
      }

      super.update(record);
    }
    return record;
  },
};
Object.setPrototypeOf(AddressBookStore.prototype, CachedStore.prototype);

function AddressBookTracker(name, engine) {
  Tracker.call(this, name, engine);
}
AddressBookTracker.prototype = {
  _changedIDs: new Set(),
  ignoreAll: false,

  _watchedCardDAVPrefs: ["description", "carddav.url", "carddav.username"],
  _watchedLDAPPrefs: ["description", "uri", "auth.dn", "auth.saslmech"],

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
    if (this.ignoreAll) {
      return;
    }

    let book;
    switch (topic) {
      case "nsPref:changed": {
        const serverKey = data.split(".")[2];
        const prefName = data.substring(serverKey.length + 16);

        book = MailServices.ab.getDirectoryFromId(
          "ldap_2.servers." + serverKey
        );
        if (
          !book ||
          (book.dirType == CARDDAV_DIRECTORY_TYPE &&
            !this._watchedCardDAVPrefs.includes(prefName)) ||
          (book.dirType == LDAP_DIRECTORY_TYPE &&
            !this._watchedLDAPPrefs.includes(prefName))
        ) {
          return;
        }
        break;
      }
      case "addrbook-directory-created":
        book = subject;
        break;
      case "addrbook-directory-deleted":
        book = subject;
        this.engine._store.markDeleted(book.UID);
        break;
    }

    if (
      book &&
      [LDAP_DIRECTORY_TYPE, CARDDAV_DIRECTORY_TYPE].includes(book.dirType) &&
      !this._changedIDs.has(book.UID)
    ) {
      this._changedIDs.add(book.UID);
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },
};
Object.setPrototypeOf(AddressBookTracker.prototype, Tracker.prototype);
