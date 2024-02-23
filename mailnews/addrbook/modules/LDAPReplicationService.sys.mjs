/* -*- Mode: JavaScript; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { LDAPListenerBase } = ChromeUtils.import(
  "resource:///modules/LDAPListenerBase.jsm"
);
import { SQLiteDirectory } from "resource:///modules/SQLiteDirectory.sys.mjs";

/**
 * A service to replicate a LDAP directory to a local SQLite db.
 *
 * @implements {nsIAbLDAPReplicationService}
 * @implements {nsILDAPMessageListener}
 */
export class LDAPReplicationService extends LDAPListenerBase {
  QueryInterface = ChromeUtils.generateQI([
    "nsIAbLDAPReplicationService",
    "nsILDAPMessageListener",
  ]);

  /**
   * @see nsIAbLDAPReplicationService
   */
  startReplication(directory, progressListener) {
    this._directory = directory;
    this._listener = progressListener;
    this._attrMap = directory.attributeMap;
    this._count = 0;
    this._cards = [];
    this._connection = Cc[
      "@mozilla.org/network/ldap-connection;1"
    ].createInstance(Ci.nsILDAPConnection);
    this._operation = Cc[
      "@mozilla.org/network/ldap-operation;1"
    ].createInstance(Ci.nsILDAPOperation);

    this._connection.init(
      directory.lDAPURL,
      directory.authDn,
      this,
      null,
      directory.protocolVersion
    );
  }

  /**
   * @see nsIAbLDAPReplicationService
   */
  cancelReplication(directory) {
    this._operation.abandonExt();
    this.done(false);
  }

  /**
   * @see nsIAbLDAPReplicationService
   */
  done(success) {
    this._done(success);
  }

  /**
   * @see nsILDAPMessageListener
   */
  onLDAPMessage(msg) {
    switch (msg.type) {
      case Ci.nsILDAPMessage.RES_BIND:
        this._onLDAPBind(msg);
        break;
      case Ci.nsILDAPMessage.RES_SEARCH_ENTRY:
        this._onLDAPSearchEntry(msg);
        break;
      case Ci.nsILDAPMessage.RES_SEARCH_RESULT:
        this._onLDAPSearchResult(msg);
        break;
      default:
        break;
    }
  }

  /**
   * @see nsILDAPMessageListener
   */
  onLDAPError(status, secInfo, location) {
    this.done(false);
  }

  /**
   * @see LDAPListenerBase
   */
  _actionOnBindSuccess() {
    this._openABForReplicationDir();
    const ldapUrl = this._directory.lDAPURL;
    this._operation.init(this._connection, this, null);
    this._listener.onStateChange(
      null,
      null,
      Ci.nsIWebProgressListener.STATE_START,
      Cr.NS_OK
    );
    this._operation.searchExt(
      ldapUrl.dn,
      ldapUrl.scope,
      ldapUrl.filter,
      ldapUrl.attributes,
      0,
      0
    );
  }

  /**
   * @see LDAPListenerBase
   */
  _actionOnBindFailure() {
    this._done(false);
  }

  /**
   * Handler of nsILDAPMessage.RES_SEARCH_ENTRY message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  async _onLDAPSearchEntry(msg) {
    const newCard = Cc[
      "@mozilla.org/addressbook/cardproperty;1"
    ].createInstance(Ci.nsIAbCard);
    this._attrMap.setCardPropertiesFromLDAPMessage(msg, newCard);
    this._cards.push(newCard);
    this._count++;
    if (this._count % 10 == 0) {
      // inform the listener every 10 entries
      this._listener.onProgressChange(
        null,
        null,
        this._count,
        -1,
        this._count,
        -1
      );
    }
    if (this._count % 100 == 0 && !this._writePromise) {
      // Write to the db to release some memory.
      this._writePromise = this._replicationDB.bulkAddCards(this._cards);
      this._cards = [];
      await this._writePromise;
      this._writePromise = null;
    }
  }

  /**
   * Handler of nsILDAPMessage.RES_SEARCH_RESULT message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  async _onLDAPSearchResult(msg) {
    if (
      msg.errorCode == Ci.nsILDAPErrors.SUCCESS ||
      msg.errorCode == Ci.nsILDAPErrors.SIZELIMIT_EXCEEDED
    ) {
      if (this._writePromise) {
        await this._writePromise;
      }
      await this._replicationDB.bulkAddCards(this._cards);
      this.done(true);
      return;
    }
    this.done(false);
  }

  /**
   * Init a jsaddrbook from the replicationFileName of the current LDAP directory.
   */
  _openABForReplicationDir() {
    this._oldReplicationFileName = this._directory.replicationFileName;
    this._replicationFile = this._directory.replicationFile;
    if (this._replicationFile.exists()) {
      // If the database file already exists, create a new one here, and replace
      // the old file in _done when success.
      this._replicationFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
      // What we need is the unique file name, _replicationDB will create an
      // empty database file.
      this._replicationFile.remove(false);
      // Set replicationFileName to the new db file name, so that _replicationDB
      // works correctly.
      this._directory.replicationFileName = this._replicationFile.leafName;
    }

    this._replicationDB = new SQLiteDirectory();
    this._replicationDB.init(`jsaddrbook://${this._replicationFile.leafName}`);
  }

  /**
   * Clean up depending on whether replication succeeded or failed, emit
   * STATE_STOP event.
   *
   * @param {bool} success - Replication succeeded or failed.
   */
  async _done(success) {
    this._cards = [];
    if (this._replicationDB) {
      // Close the db.
      await this._replicationDB.cleanUp();
    }
    if (success) {
      // Replace the old db file with new db file.
      this._replicationFile.moveTo(null, this._oldReplicationFileName);
    } else if (
      this._replicationFile &&
      this._replicationFile.path != this._oldReplicationFileName
    ) {
      this._replicationFile.remove(false);
    }
    if (this._oldReplicationFileName) {
      // Reset replicationFileName to the old db file name.
      this._directory.replicationFileName = this._oldReplicationFileName;
    }
    this._listener.onStateChange(
      null,
      null,
      Ci.nsIWebProgressListener.STATE_STOP,
      success ? Cr.NS_OK : Cr.NS_ERROR_FAILURE
    );
  }
}

LDAPReplicationService.prototype.classID = Components.ID(
  "{dbe204e8-ae09-11eb-b4c8-a7e4b3e6e82e}"
);
