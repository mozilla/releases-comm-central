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
  _idleConnections = [];
  // @type {ImapClient[]} - An array of connections in use.
  _busyConnections = [];
  // @type {Function[]} - An array of Promise.resolve functions.
  _connectionWaitingQueue = [];

  /**
   * Get an idle connection that can be used.
   * @returns {ImapClient}
   */
  async _getNextClient() {
    // The newest connection is the least likely to have timed out.
    let client = this._idleConnections.pop();
    if (client) {
      this._busyConnections.push(client);
      return client;
    }
    if (
      this._idleConnections.length + this._busyConnections.length <
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
    client.onIdle = () => {
      this._busyConnections = this._busyConnections.filter(c => c != client);
      this._idleConnections.push(client);
      // Resovle the first waiting in queue.
      this._connectionWaitingQueue.shift()?.();
    };
    handler(client);
    client.connect();
  }
}

ImapIncomingServer.prototype.classID = Components.ID(
  "{b02a4e1c-0d9e-498c-8b9d-18917ba9f65b}"
);
