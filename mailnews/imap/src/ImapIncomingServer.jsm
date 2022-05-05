/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapIncomingServer"];

var { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);
var { ImapClient } = ChromeUtils.import("resource:///modules/ImapClient.jsm");

/**
 * @implements {nsIImapIncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 */
class ImapIncomingServer extends MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIImapIncomingServer",
    "nsIMsgIncomingServer",
    "nsISupportsWeakReference",
  ]);

  constructor() {
    super();

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "imap";
    this.localDatabaseType = "imap";

    // nsIImapIncomingServer attributes that map directly to pref values.
    this._mapAttrsToPrefs([
      ["Char", "forceSelect", "force_select"],
      ["Char", "adminUrl", "admin_url"],
      ["Bool", "dualUseFolders", "dual_use_folders"],
      ["Bool", "cleanupInboxOnExit", "cleanup_inbox_on_exit"],
      ["Bool", "offlineDownload", "offline_download"],
      ["Bool", "downloadBodiesOnGetNewMail", "download_bodies_on_get_new_mail"],
      ["Bool", "autoSyncOfflineStores", "autosync_offline_stores"],
      ["Bool", "useIdle", "use_idle"],
      ["Bool", "checkAllFoldersForNew", "check_all_folders_for_new"],
      ["Bool", "useCondStore", "use_condstore"],
      ["Bool", "isGMailServer", "is_gmail"],
      ["Bool", "useCompressDeflate", "use_compress_deflate"],
      ["Bool", "allowUTF8Accept", "allow_utf8_accept"],
      ["Int", "autoSyncMaxAgeDays", "autosync_max_age_days"],
    ]);
  }

  /** @see nsIImapIncomingServer */
  get maximumConnectionsNumber() {
    let maxConnections = this.getIntValue("max_cached_connections", 0);
    if (maxConnections > 0) {
      return maxConnections;
    }
    // The default is 5 connections, if the pref value is 0, we use the default.
    // If it's negative, treat it as 1.
    maxConnections = maxConnections == 0 ? 5 : 1;
    this.maximumConnectionsNumber = maxConnections;
    return maxConnections;
  }

  set maximumConnectionsNumber(value) {
    this.setIntValue("max_cached_connections", value);
  }

  get wrappedJSObject() {
    return this;
  }

  _capabilitites = [];

  set capabilities(value) {
    this._capabilitites = value;
  }

  _passwordPromise = null;

  /**
   * Show a password prompt. If a prompt is currently shown, just wait for it.
   * @param {string} message - The text inside the prompt.
   * @param {string} title - The title of the prompt.
   * @param {nsIMsgWindow} - The associated msg window.
   */
  async getPasswordFromAuthPrompt(message, title, msgWindow) {
    if (this._passwordPromise) {
      await this._passwordPromise;
      return this.password;
    }
    let deferred = {};
    this._passwordPromise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });
    try {
      this.getPasswordWithUI(message, title, msgWindow);
    } catch (e) {
      deferred.reject(e);
      throw e;
    } finally {
      this._passwordPromise = null;
    }
    deferred.resolve();
    return this.password;
  }

  // @type {ImapClient[]} - An array of connections can be used.
  _freeConnections = [];
  // @type {ImapClient[]} - An array of connections in use.
  _busyConnections = [];
  // @type {Function[]} - An array of Promise.resolve functions.
  _connectionWaitingQueue = [];

  /**
   * Get an free connection that can be used.
   * @returns {ImapClient}
   */
  async _getNextClient() {
    if (this._idling) {
      // End IDLE because we are sending a new request.
      this._idling = false;
      this._busyConnections[0].endIdle();
    }

    // The newest connection is the least likely to have timed out.
    let client = this._freeConnections.pop();
    if (client) {
      this._busyConnections.push(client);
      return client;
    }
    if (
      this._freeConnections.length + this._busyConnections.length <
      this.maximumConnectionsNumber
    ) {
      // Create a new client if the pool is not full.
      client = new ImapClient(this);
      this._busyConnections.push(client);
      return client;
    }
    // Wait until a connection is available.
    await new Promise(resolve => this._connectionWaitingQueue.push(resolve));
    return this._getNextClient();
  }

  /**
   * Do some actions with a connection.
   * @param {Function} handler - A callback function to take a ImapClient
   *   instance, and do some actions.
   */
  async withClient(handler) {
    let client = await this._getNextClient();
    client.onDone = async () => {
      this._busyConnections = this._busyConnections.filter(c => c != client);
      this._freeConnections.push(client);
      let resolve = this._connectionWaitingQueue.shift();
      if (resolve) {
        // Resovle the first waiting in queue.
        resolve();
      } else if (
        !this._busyConnections.length &&
        this.useIdle &&
        this._capabilitites.includes("IDLE")
      ) {
        // Nothing in queue and IDLE is configed and supported, use IDLE to
        // receive server pushes.
        this._idling = true;
        this._freeConnections = this._freeConnections.filter(c => c != client);
        this._busyConnections.push(client);
        client.idle();
      }
    };
    handler(client);
    client.connect();
  }
}

ImapIncomingServer.prototype.classID = Components.ID(
  "{b02a4e1c-0d9e-498c-8b9d-18917ba9f65b}"
);
