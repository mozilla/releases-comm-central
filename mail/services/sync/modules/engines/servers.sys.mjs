/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CachedStore } from "resource://services-sync/CachedStore.sys.mjs";
import { CryptoWrapper } from "resource://services-sync/record.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { SCORE_INCREMENT_XLARGE } from "resource://services-sync/constants.sys.mjs";
import { SyncEngine, Tracker } from "resource://services-sync/engines.sys.mjs";
import { Utils } from "resource://services-sync/util.sys.mjs";

// Mappings between Ci.nsMsgSocketType types and Sync types.
const SOCKET_TYPES = [
  [Ci.nsMsgSocketType.plain, "plain"],
  [Ci.nsMsgSocketType.trySTARTTLS, "tryStartTLS"],
  [Ci.nsMsgSocketType.alwaysSTARTTLS, "alwaysStartTLS"],
  [Ci.nsMsgSocketType.SSL, "tls"],
];
function socketTypeForRecord(number) {
  return SOCKET_TYPES.find(st => st[0] == number)[1];
}
function socketTypeForServer(string) {
  return SOCKET_TYPES.find(st => st[1] == string)[0];
}

// Mappings between Ci.nsMsgAuthMethod types and Sync types.
// We deliberately don't support some auth types.
const AUTH_METHODS = [
  [Ci.nsMsgAuthMethod.passwordCleartext, "passwordCleartext"],
  [Ci.nsMsgAuthMethod.passwordEncrypted, "passwordEncrypted"],
  [Ci.nsMsgAuthMethod.GSSAPI, "gssapi"],
  [Ci.nsMsgAuthMethod.NTLM, "ntlm"],
  [Ci.nsMsgAuthMethod.External, "tlsCertificate"],
  [Ci.nsMsgAuthMethod.OAuth2, "oAuth2"],
];
function authMethodForRecord(number) {
  return AUTH_METHODS.find(am => am[0] == number)[1];
}
function authMethodForServer(string) {
  return AUTH_METHODS.find(am => am[1] == string)[0];
}

/**
 * ServerRecord represents the state of an add-on in an application.
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
export function ServerRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}

ServerRecord.prototype = {
  _logName: "Record.Server",
};
Object.setPrototypeOf(ServerRecord.prototype, CryptoWrapper.prototype);
Utils.deferGetSet(ServerRecord, "cleartext", [
  "name",
  "type",
  "location",
  "socketType",
  "authMethod",
  "username",
]);

ServerRecord.from = function (data) {
  const record = new ServerRecord(undefined, data.id);
  for (const [key, value] of Object.entries(data)) {
    record.cleartext[key] = value;
  }
  return record;
};

export function ServersEngine(service) {
  SyncEngine.call(this, "Servers", service);
}

ServersEngine.prototype = {
  _storeObj: ServerStore,
  _trackerObj: ServerTracker,
  _recordObj: ServerRecord,
  version: 2,
  syncPriority: 3,

  /*
   * Returns a changeset for this sync. Engine implementations can override this
   * method to bypass the tracker for certain or all changed items.
   */
  async getChangedIDs() {
    return this._tracker.getChangedIDs();
  },
};
Object.setPrototypeOf(ServersEngine.prototype, SyncEngine.prototype);

function ServerStore(name, engine) {
  CachedStore.call(this, name, engine);
}
ServerStore.prototype = {
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

    if (!["imap", "pop3", "smtp"].includes(record.type)) {
      this._log.trace(
        `Skipping creation of unknown item type ("${record.type}"): ${record.id}`
      );
      return;
    }

    const [, hostname, port] = /^(.*):(\d+)$/.exec(record.location);

    if (record.type == "smtp") {
      const smtpServer = MailServices.outgoingServer.createServer("smtp");
      smtpServer.QueryInterface(Ci.nsISmtpServer);
      smtpServer.UID = record.id;
      smtpServer.description = record.name;
      smtpServer.hostname = hostname;
      smtpServer.port = port;
      smtpServer.socketType = socketTypeForServer(record.socketType);
      smtpServer.authMethod = authMethodForServer(record.authMethod);
      smtpServer.username = record.username;
      return;
    }

    try {
      // Ensure there is a local mail account...
      MailServices.accounts.localFoldersServer;
    } catch {
      // ... if not, make one.
      MailServices.accounts.createLocalMailAccount();
    }

    const server = MailServices.accounts.createIncomingServer(
      record.username,
      hostname,
      record.type
    );
    server.UID = record.id;
    server.prettyName = record.name;
    server.port = port;
    server.socketType = socketTypeForServer(record.socketType);
    server.authMethod = authMethodForServer(record.authMethod);

    const account = MailServices.accounts.createAccount();
    account.incomingServer = server;
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

    const smtpServer = MailServices.outgoingServer.servers.find(
      s => s.UID == record.id
    );
    if (smtpServer) {
      MailServices.outgoingServer.deleteServer(smtpServer);
      return;
    }

    const server = MailServices.accounts.allServers.find(
      s => s.UID == record.id
    );
    if (!server) {
      this._log.trace("Asked to remove record that doesn't exist, ignoring");
      return;
    }

    const account = MailServices.accounts.findAccountForServer(server);
    if (account) {
      MailServices.accounts.removeAccount(account, true);
    } else {
      MailServices.accounts.removeIncomingServer(server, true);
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

    const server =
      MailServices.outgoingServer.servers.find(s => s.UID == record.id) ||
      MailServices.accounts.allServers.find(s => s.UID == record.id);

    if (!server || !["imap", "pop3", "smtp"].includes(server.type)) {
      this._log.trace(`Skipping update for unknown item: ${record.id}`);
      return;
    }
    if (record.type != server.type) {
      throw new Error(
        `Refusing to change server type from "${server.type}" to "${record.type}"`
      );
    }

    const [, hostname, port] = /^(.*):(\d+)$/.exec(record.location);

    if (server.type == "smtp") {
      server.QueryInterface(Ci.nsISmtpServer);
      server.description = record.name;
      server.hostname = hostname;
    } else {
      server.prettyName = record.name;
      server.hostName = hostname;
    }

    server.port = port;
    server.socketType = socketTypeForServer(record.socketType);
    server.authMethod = authMethodForServer(record.authMethod);
    server.username = record.username;
  },

  /**
   * Obtain the set of all known record IDs.
   *
   * @return Object with ID strings as keys and values of true. The values
   *         are ignored.
   */
  async getAllIDs() {
    const ids = await super.getAllIDs();
    for (const s of MailServices.outgoingServer.servers) {
      ids[s.UID] = true;
    }
    for (const s of MailServices.accounts.allServers) {
      if (
        ["imap", "pop3"].includes(s.type) &&
        authMethodForRecord(s.authMethod)
      ) {
        ids[s.UID] = true;
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
    const record = new ServerRecord(collection, id);

    const data = await super.getCreateRecordData(id);
    const server =
      MailServices.outgoingServer.servers.find(s => s.UID == id) ||
      MailServices.accounts.allServers.find(s => s.UID == id);

    // If we don't know about this ID, mark the record as deleted.
    if (!server && !data) {
      record.deleted = true;
      return record;
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        record.cleartext[key] = value;
      }
    }

    if (server) {
      record.type = server.type;
      record.socketType = socketTypeForRecord(server.socketType);
      record.authMethod = authMethodForRecord(server.authMethod);
      record.username = server.username;

      if (server.type == "smtp") {
        server.QueryInterface(Ci.nsISmtpServer);
        record.name = server.description;
        record.location = `${server.hostname}:${server.port}`;
      } else {
        record.name = server.prettyName;
        record.location = `${server.hostName}:${server.port}`;
      }

      super.update(record);
    }
    return record;
  },
};
Object.setPrototypeOf(ServerStore.prototype, CachedStore.prototype);

function ServerTracker(name, engine) {
  Tracker.call(this, name, engine);
}
ServerTracker.prototype = {
  _changedIDs: new Set(),
  ignoreAll: false,

  _watchedIncomingPrefs: [
    "name",
    "hostname",
    "port",
    "socketType",
    "authMethod",
    "userName",
  ],
  _watchedOutgoingPrefs: [
    "description",
    "hostname",
    "port",
    "try_ssl",
    "authMethod",
    "username",
  ],

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
    Services.prefs.addObserver("mail.server.", this);
    Services.prefs.addObserver("mail.smtpserver.", this);
    Services.obs.addObserver(this, "message-server-removed");
    Services.obs.addObserver(this, "message-smtpserver-removed");
  },

  onStop() {
    Services.prefs.removeObserver("mail.server.", this);
    Services.prefs.removeObserver("mail.smtpserver.", this);
    Services.obs.removeObserver(this, "message-server-removed");
    Services.obs.removeObserver(this, "message-smtpserver-removed");
  },

  observe(subject, topic, data) {
    if (this.ignoreAll) {
      return;
    }

    let server;
    if (topic == "message-server-removed") {
      server = subject.QueryInterface(Ci.nsIMsgIncomingServer);
      this.engine._store.markDeleted(server.UID);
    } else if (topic == "message-smtpserver-removed") {
      server = subject.QueryInterface(Ci.nsISmtpServer);
      this.engine._store.markDeleted(server.UID);
    } else {
      const [, group, serverKey] = data.split(".", 3);
      const prefName = data.substring(group.length + serverKey.length + 7);
      if (group == "server") {
        if (!this._watchedIncomingPrefs.includes(prefName)) {
          return;
        }

        // Don't use getIncomingServer or it'll throw if the server doesn't exist.
        server = MailServices.accounts.allServers.find(s => s.key == serverKey);
        if (!["imap", "pop3"].includes(server?.type)) {
          return;
        }
      } else if (group == "smtpserver") {
        if (!this._watchedOutgoingPrefs.includes(prefName)) {
          return;
        }

        server = MailServices.outgoingServer.getServerByKey(serverKey);
      }
    }

    if (server && !this._changedIDs.has(server.UID)) {
      this._changedIDs.add(server.UID);
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },
};
Object.setPrototypeOf(ServerTracker.prototype, Tracker.prototype);
