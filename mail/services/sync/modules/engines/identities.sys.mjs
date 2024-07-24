/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CryptoWrapper } from "resource://services-sync/record.sys.mjs";
import { SyncEngine, Tracker } from "resource://services-sync/engines.sys.mjs";
import { Utils } from "resource://services-sync/util.sys.mjs";

import { SCORE_INCREMENT_XLARGE } from "resource://services-sync/constants.sys.mjs";

import { CachedStore } from "resource://services-sync/CachedStore.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * IdentityRecord represents the state of an add-on in an application.
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
export function IdentityRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}

IdentityRecord.prototype = {
  _logName: "Record.Identity",
};
Object.setPrototypeOf(IdentityRecord.prototype, CryptoWrapper.prototype);
Utils.deferGetSet(IdentityRecord, "cleartext", [
  "name",
  "fullName",
  "email",
  "incomingServer",
  "outgoingServer",
]);

IdentityRecord.from = function (data) {
  const record = new IdentityRecord(undefined, data.id);
  for (const [key, value] of Object.entries(data)) {
    record.cleartext[key] = value;
  }
  return record;
};

export function IdentitiesEngine(service) {
  SyncEngine.call(this, "Identities", service);
}

IdentitiesEngine.prototype = {
  _storeObj: IdentityStore,
  _trackerObj: IdentityTracker,
  _recordObj: IdentityRecord,
  version: 2,
  syncPriority: 4,

  /*
   * Returns a changeset for this sync. Engine implementations can override this
   * method to bypass the tracker for certain or all changed items.
   */
  async getChangedIDs() {
    return this._tracker.getChangedIDs();
  },
};
Object.setPrototypeOf(IdentitiesEngine.prototype, SyncEngine.prototype);

function IdentityStore(name, engine) {
  CachedStore.call(this, name, engine);
}
IdentityStore.prototype = {
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

    const identity = MailServices.accounts.createIdentity();
    identity.UID = record.id;

    identity.label = record.name;
    identity.fullName = record.fullName;
    identity.email = record.email;

    if (record.incomingServer) {
      const account = MailServices.accounts.accounts.find(
        a => a.incomingServer?.UID == record.incomingServer
      );
      if (account) {
        account.addIdentity(identity);
      } else {
        this._log.warn(
          `Identity is for account ${record.incomingServer}, but it doesn't exist.`
        );
      }
    }

    if (record.outgoingServer) {
      const smtpServer = MailServices.outgoingServer.servers.find(
        s => s.UID == record.outgoingServer
      );
      if (smtpServer) {
        identity.smtpServerKey = smtpServer.key;
      } else {
        this._log.warn(
          `Identity uses SMTP server ${record.outgoingServer}, but it doesn't exist.`
        );
      }
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
    const identity = MailServices.accounts.allIdentities.find(
      i => i.UID == record.id
    );
    if (!identity) {
      this._log.trace("Asked to remove record that doesn't exist, ignoring");
      return;
    }

    for (const server of MailServices.accounts.getServersForIdentity(
      identity
    )) {
      const account = MailServices.accounts.findAccountForServer(server);
      account.removeIdentity(identity);
      // Removing the identity from one account should destroy it.
      // No need to continue.
      return;
    }
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

    const identity = MailServices.accounts.allIdentities.find(
      i => i.UID == record.id
    );
    if (!identity) {
      this._log.trace("Skipping update for unknown item: " + record.id);
      return;
    }

    const incomingServer =
      MailServices.accounts.getServersForIdentity(identity)[0];
    if (incomingServer?.UID != record.incomingServer) {
      throw new Error(
        `Refusing to change incoming server from "${incomingServer?.UID}" to "${record.incomingServer}"`
      );
    }

    identity.label = record.name;
    identity.fullName = record.fullName;
    identity.email = record.email;

    const outgoingServer = MailServices.outgoingServer.servers.find(
      s => s.UID == record.outgoingServer
    );
    identity.smtpServerKey = outgoingServer?.key;
  },

  /**
   * Obtain the set of all known record IDs.
   *
   * @return Object with ID strings as keys and values of true. The values
   *         are ignored.
   */
  async getAllIDs() {
    const ids = await super.getAllIDs();
    for (const i of MailServices.accounts.allIdentities) {
      const servers = MailServices.accounts.getServersForIdentity(i);
      if (servers.find(s => ["imap", "pop3"].includes(s.type))) {
        ids[i.UID] = true;
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
    const record = new IdentityRecord(collection, id);

    const data = await super.getCreateRecordData(id);
    const identity = MailServices.accounts.allIdentities.find(i => i.UID == id);

    // If we don't know about this ID, mark the record as deleted.
    if (!identity && !data) {
      record.deleted = true;
      return record;
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        record.cleartext[key] = value;
      }
    }

    if (identity) {
      record.name = identity.label;
      record.fullName = identity.fullName;
      record.email = identity.email;

      record.incomingServer =
        MailServices.accounts.getServersForIdentity(identity)[0]?.UID;
      if (identity.smtpServerKey) {
        const smtpServer =
          MailServices.outgoingServer.getServerByIdentity(identity);
        record.outgoingServer = smtpServer.UID;
      }

      super.update(record);
    }
    return record;
  },
};
Object.setPrototypeOf(IdentityStore.prototype, CachedStore.prototype);

function IdentityTracker(name, engine) {
  Tracker.call(this, name, engine);
}
IdentityTracker.prototype = {
  _changedIDs: new Set(),
  ignoreAll: false,

  _watchedPrefs: ["useremail", "fullName", "label", "smtpServer"],

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
    Services.prefs.addObserver("mail.identity.", this);
    Services.obs.addObserver(this, "account-identity-added");
    Services.obs.addObserver(this, "account-identity-removed");
  },

  onStop() {
    Services.prefs.removeObserver("mail.account.", this);
    Services.obs.removeObserver(this, "account-identity-added");
    Services.obs.removeObserver(this, "account-identity-removed");
  },

  observe(subject, topic, data) {
    if (this.ignoreAll) {
      return;
    }

    const markAsChanged = identity => {
      if (identity && !this._changedIDs.has(identity.UID)) {
        this._changedIDs.add(identity.UID);
        this.score = SCORE_INCREMENT_XLARGE;
      }
    };

    if (topic == "account-identity-added") {
      markAsChanged(subject.QueryInterface(Ci.nsIMsgIdentity));
      return;
    }
    if (topic == "account-identity-removed") {
      subject.QueryInterface(Ci.nsIMsgIdentity);
      this.engine._store.markDeleted(subject.UID);
      markAsChanged(subject);
      return;
    }

    const idKey = data.split(".")[2];
    const prefName = data.substring(idKey.length + 15);
    if (!this._watchedPrefs.includes(prefName)) {
      return;
    }

    // Don't use .getIdentity because it will create one if it doesn't exist.
    markAsChanged(
      MailServices.accounts.allIdentities.find(i => i.key == idKey)
    );
  },
};
Object.setPrototypeOf(IdentityTracker.prototype, Tracker.prototype);
