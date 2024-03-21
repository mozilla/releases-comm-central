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

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const SYNCED_IDENTITY_PROPERTIES = {
  attachSignature: "attach_signature",
  attachVCard: "attach_vcard",
  autoQuote: "auto_quote",
  catchAll: "catchAll",
  catchAllHint: "catchAllHint",
  composeHtml: "compose_html",
  email: "useremail",
  escapedVCard: "escapedVCard",
  fullName: "fullName",
  htmlSigFormat: "htmlSigFormat",
  htmlSigText: "htmlSigText",
  label: "label",
  organization: "organization",
  replyOnTop: "reply_on_top",
  replyTo: "reply_to",
  sigBottom: "sig_bottom",
  sigOnForward: "sig_on_fwd",
  sigOnReply: "sig_on_reply",
};

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
  __proto__: CryptoWrapper.prototype,
  _logName: "Record.Identity",
};
Utils.deferGetSet(IdentityRecord, "cleartext", ["accounts", "prefs", "smtpID"]);

export function IdentitiesEngine(service) {
  SyncEngine.call(this, "Identities", service);
}

IdentitiesEngine.prototype = {
  __proto__: SyncEngine.prototype,
  _storeObj: IdentityStore,
  _trackerObj: IdentityTracker,
  _recordObj: IdentityRecord,
  version: 1,
  syncPriority: 4,

  /*
   * Returns a changeset for this sync. Engine implementations can override this
   * method to bypass the tracker for certain or all changed items.
   */
  async getChangedIDs() {
    return this._tracker.getChangedIDs();
  },
};

function IdentityStore(name, engine) {
  Store.call(this, name, engine);
}
IdentityStore.prototype = {
  __proto__: Store.prototype,

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
    const identity = MailServices.accounts.createIdentity();
    identity.UID = record.id;

    for (const key of Object.keys(SYNCED_IDENTITY_PROPERTIES)) {
      if (key in record.prefs) {
        identity[key] = record.prefs[key];
      }
    }

    if (record.smtpID) {
      const smtpServer = MailServices.smtp.servers.find(
        s => s.UID == record.smtpID
      );
      if (smtpServer) {
        identity.smtpServerKey = smtpServer.key;
      } else {
        this._log.warn(
          `Identity uses SMTP server ${record.smtpID}, but it doesn't exist.`
        );
      }
    }

    for (const { id, isDefault } of record.accounts) {
      const account = MailServices.accounts.accounts.find(
        a => a.incomingServer?.UID == id
      );
      if (account) {
        account.addIdentity(identity);
        if (isDefault) {
          account.defaultIdentity = identity;
        }
      } else {
        this._log.warn(`Identity is for account ${id}, but it doesn't exist.`);
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
    const identity = MailServices.accounts.allIdentities.find(
      i => i.UID == record.id
    );
    if (!identity) {
      this._log.trace("Skipping update for unknown item: " + record.id);
      return;
    }

    for (const key of Object.keys(SYNCED_IDENTITY_PROPERTIES)) {
      if (key in record.prefs) {
        identity[key] = record.prefs[key];
      }
    }

    if (record.smtpID) {
      const smtpServer = MailServices.smtp.servers.find(
        s => s.UID == record.smtpID
      );
      if (smtpServer) {
        identity.smtpServerKey = smtpServer.key;
      } else {
        this._log.warn(
          `Identity uses SMTP server ${record.smtpID}, but it doesn't exist.`
        );
      }
    } else {
      identity.smtpServerKey = null;
    }

    for (const { id, isDefault } of record.accounts) {
      const account = MailServices.accounts.accounts.find(
        a => a.incomingServer?.UID == id
      );
      if (account) {
        if (!account.identities.includes(identity)) {
          account.addIdentity(identity);
        }
        if (isDefault && account.defaultIdentity != identity) {
          account.defaultIdentity = identity;
        }
      } else {
        this._log.warn(`Identity is for account ${id}, but it doesn't exist.`);
      }
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

    const identity = MailServices.accounts.allIdentities.find(i => i.UID == id);

    // If we don't know about this ID, mark the record as deleted.
    if (!identity) {
      record.deleted = true;
      return record;
    }

    record.accounts = [];
    for (const server of MailServices.accounts.getServersForIdentity(
      identity
    )) {
      const account = MailServices.accounts.findAccountForServer(server);
      if (account) {
        record.accounts.push({
          id: server.UID,
          isDefault: account.defaultIdentity == identity,
        });
      }
    }

    record.prefs = {};
    for (const key of Object.keys(SYNCED_IDENTITY_PROPERTIES)) {
      record.prefs[key] = identity[key];
    }

    if (identity.smtpServerKey) {
      const smtpServer = MailServices.smtp.getServerByIdentity(identity);
      record.smtpID = smtpServer.UID;
    }

    return record;
  },
};

function IdentityTracker(name, engine) {
  Tracker.call(this, name, engine);
}
IdentityTracker.prototype = {
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
    Services.prefs.addObserver("mail.identity.", this);
    Services.obs.addObserver(this, "account-identity-added");
    Services.obs.addObserver(this, "account-identity-removed");
    Services.obs.addObserver(this, "account-default-identity-changed");
  },

  onStop() {
    Services.prefs.removeObserver("mail.account.", this);
    Services.obs.removeObserver(this, "account-identity-added");
    Services.obs.removeObserver(this, "account-identity-removed");
    Services.obs.removeObserver(this, "account-default-identity-changed");
  },

  observe(subject, topic, data) {
    if (this._ignoreAll) {
      return;
    }

    const markAsChanged = identity => {
      if (identity && !this._changedIDs.has(identity.UID)) {
        this._changedIDs.add(identity.UID);
        this.score = SCORE_INCREMENT_XLARGE;
      }
    };

    if (
      ["account-identity-added", "account-identity-removed"].includes(topic)
    ) {
      markAsChanged(subject.QueryInterface(Ci.nsIMsgIdentity));
      return;
    }

    if (topic == "account-default-identity-changed") {
      // The default identity has changed, update the default identity and
      // the previous one, which will now be second on the list.
      const [newDefault, oldDefault] = Services.prefs
        .getStringPref(`mail.account.${data}.identities`)
        .split(",");
      if (newDefault) {
        markAsChanged(MailServices.accounts.getIdentity(newDefault));
      }
      if (oldDefault) {
        markAsChanged(MailServices.accounts.getIdentity(oldDefault));
      }
      return;
    }

    const idKey = data.split(".")[2];
    const prefName = data.substring(idKey.length + 15);
    if (
      prefName != "smtpServer" &&
      !Object.values(SYNCED_IDENTITY_PROPERTIES).includes(prefName)
    ) {
      return;
    }

    // Don't use .getIdentity because it will create one if it doesn't exist.
    markAsChanged(
      MailServices.accounts.allIdentities.find(i => i.key == idKey)
    );
  },
};
