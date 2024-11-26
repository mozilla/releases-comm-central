/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MsgUtils: "resource:///modules/MimeMessageUtils.sys.mjs",
});

const OUTGOING_CONTRACT_ID_PREFIX =
  "@mozilla.org/messenger/outgoing/server;1?type=";

/**
 * The service in charge of creating and referencing all known outgoing message
 * servers.
 *
 * @implements {nsIMsgOutgoingServerService}
 */
export class OutgoingServerService {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgOutgoingServerService"]);

  constructor() {
    this._servers = [];
    this._logger = lazy.MsgUtils.smtpLogger;
  }

  /**
   * @see nsIMsgOutgoingServerService
   */
  get defaultServer() {
    const defaultServerKey = Services.prefs.getCharPref(
      "mail.smtp.defaultserver",
      ""
    );
    if (defaultServerKey) {
      // Get it from the prefs.
      return this.getServerByKey(defaultServerKey);
    }

    // No pref set, so set the first one as default, and return it.
    if (this.servers.length > 0) {
      this.defaultServer = this.servers[0];
      return this.servers[0];
    }
    return null;
  }

  set defaultServer(server) {
    Services.prefs.setCharPref("mail.smtp.defaultserver", server.key);
  }

  get servers() {
    if (!this._servers.length) {
      // Load outgoing servers from prefs.
      this._servers = this._getServerKeys().map(key => this._keyToServer(key));
    }
    return this._servers;
  }

  /**
   * @see nsIMsgOutgoingServerService
   */
  getServerByIdentity(userIdentity) {
    return userIdentity.smtpServerKey
      ? this.getServerByKey(userIdentity.smtpServerKey)
      : this.defaultServer;
  }

  /**
   * @see nsIMsgOutgoingServerService
   */
  getServerByKey(key) {
    return this.servers.find(s => s.key == key);
  }

  /**
   * @see nsIMsgOutgoingServerService
   */
  createServer(type) {
    if (!(OUTGOING_CONTRACT_ID_PREFIX + type in Cc)) {
      // The error thrown when the contract ID is unknown can be a bit cryptic,
      // and can seem to come from an unusual place (the getter for this.servers),
      // so throw something a bit more explicit.
      throw Components.Exception(
        `tried to create an outgoing server with unknown type ${type}`,
        Cr.NS_ERROR_INVALID_ARG
      );
    }

    const serverKeys = this._getServerKeys();
    let i = 1;
    let key;
    do {
      key = `${type}${i++}`;
    } while (serverKeys.includes(key));

    serverKeys.push(key);
    // Set the server's type, which defines which implementation to instantiate.
    Services.prefs.setCharPref(`mail.smtpserver.${key}.type`, type);

    this._saveServerKeys(serverKeys);
    this._servers = []; // Reset to force repopulation of this.servers.
    return this.servers.at(-1);
  }

  /**
   * @see nsIMsgOutgoingServerService
   */
  deleteServer(server) {
    const serverKeys = this._getServerKeys().filter(k => k != server.key);
    this._servers = this.servers.filter(s => s.key != server.key);
    this._saveServerKeys(serverKeys);
    Services.obs.notifyObservers(
      server,
      "message-smtpserver-removed",
      server.key
    );
  }

  /**
   * @see nsIMsgOutgoingServerService
   */
  findServer(username, hostname, type) {
    username = username?.toLowerCase();
    // Note: we don't need to wrap the username in square brackets if it's an
    // IPv6, because nsIURI.host does not include brackets.
    hostname = hostname?.toLowerCase();
    type = type?.toLowerCase();
    return this.servers.find(server => {
      if (
        (username && server.username.toLowerCase() != username) ||
        (hostname && server.serverURI.host.toLowerCase() != hostname) ||
        (type && server.type.toLowerCase() != type)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get all outgoing server keys from prefs.
   *
   * @returns {string[]}
   */
  _getServerKeys() {
    return Services.prefs
      .getCharPref("mail.smtpservers", "")
      .split(",")
      .filter(Boolean);
  }

  /**
   * Save outgoing server keys to prefs.
   *
   * @param {string[]} keys - The key list to save.
   */
  _saveServerKeys(keys) {
    return Services.prefs.setCharPref("mail.smtpservers", keys.join(","));
  }

  /**
   * Create an nsIMsgOutgoingServer from a key.
   *
   * @param {string} key - The key for the outgoing server.
   * @returns {nsIMsgOutgoingServer}
   */
  _keyToServer(key) {
    // Ideally we should be failing early if we can't figure out the type,
    // because we might be trying to configure the server for the wrong
    // protocol. However, We might be currently migrating an old profile that
    // predates this pref being introduced, in which case we'll try to read this
    // pref before the profile migration code has had a chance to set it. In
    // which case, it's likely safe to assume the server's type is SMTP.
    const serverType = Services.prefs.getCharPref(
      `mail.smtpserver.${key}.type`,
      "smtp"
    );

    const server = Cc[OUTGOING_CONTRACT_ID_PREFIX + serverType].createInstance(
      Ci.nsIMsgOutgoingServer
    );
    // Setting the server key will set up all of its other properties by
    // reading them from the prefs.
    server.key = key;
    return server;
  }
}
