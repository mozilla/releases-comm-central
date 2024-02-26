/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// MailServices
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// Local Mail Folders. Requires prior setup of profile directory

export var localAccountUtils = {
  inboxFolder: undefined,
  incomingServer: undefined,
  rootFolder: undefined,
  msgAccount: undefined,

  _localAccountInitialized: false,
  _mailboxStoreContractID: undefined,

  pluggableStores: [
    "@mozilla.org/msgstore/berkeleystore;1",
    "@mozilla.org/msgstore/maildirstore;1",
  ],

  clearAll() {
    this._localAccountInitialized = false;
    if (this.msgAccount) {
      MailServices.accounts.removeAccount(this.msgAccount);
    }
    this.incomingServer = undefined;
    this.msgAccount = undefined;
    this.inboxFolder = undefined;
    this.rootFolder = undefined;
  },

  loadLocalMailAccount(storeID) {
    if (
      (storeID && storeID == this._mailboxStoreContractID) ||
      (!storeID && this._localAccountInitialized)
    ) {
      return;
    }

    this.clearAll();
    if (storeID) {
      Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);
    }

    this._mailboxStoreContractID = storeID;

    this.msgAccount = MailServices.accounts.createLocalMailAccount();
    this.incomingServer = this.msgAccount.incomingServer;

    this.rootFolder = this.incomingServer.rootMsgFolder.QueryInterface(
      Ci.nsIMsgLocalMailFolder
    );

    // Note: Inbox is not created automatically when there is no deferred server,
    // so we need to create it.
    this.inboxFolder = this.rootFolder
      .createLocalSubfolder("Inbox")
      .QueryInterface(Ci.nsIMsgLocalMailFolder);
    // a local inbox should have a Mail flag!
    this.inboxFolder.setFlag(Ci.nsMsgFolderFlags.Mail);

    // Force an initialization of the Inbox folder database.
    this.inboxFolder.prettyName;

    this._localAccountInitialized = true;
  },

  /**
   * Create an nsIMsgIncomingServer and an nsIMsgAccount to go with it.
   *
   * @param {string} aType - The type of the server (pop3, imap etc).
   * @param {integer} aPort - The port the server is on.
   * @param {string} aUsername - The username for the server.
   * @param {string} aPassword - The password for the server.
   * @param {string} aHostname - The hostname for the server (defaults to localhost).
   * @returns {nsIMsgIncomingServer} The newly-created nsIMsgIncomingServer.
   */
  create_incoming_server(
    aType,
    aPort,
    aUsername,
    aPassword,
    aHostname = "localhost"
  ) {
    const serverAndAccount =
      localAccountUtils.create_incoming_server_and_account(
        aType,
        aPort,
        aUsername,
        aPassword,
        aHostname
      );
    return serverAndAccount.server;
  },

  /**
   * Create an nsIMsgIncomingServer and an nsIMsgAccount to go with it.
   * There are no identities created for the account.
   *
   * @param {string} aType - The type of the server (pop3, imap etc).
   * @param {integer} aPort - The port the server is on.
   * @param {string} aUsername - The username for the server.
   * @param {string} aPassword - The password for the server.
   * @param {string} aHostname - The hostname for the server (defaults to localhost).
   * @returns {object} object
   * @returns {nsIMsgIncomingServer} object.server Created server
   * @returns {nsIMsgAccount} object.account Created account
   */
  create_incoming_server_and_account(
    aType,
    aPort,
    aUsername,
    aPassword,
    aHostname = "localhost"
  ) {
    const server = MailServices.accounts.createIncomingServer(
      aUsername,
      aHostname,
      aType
    );
    server.port = aPort;
    if (aUsername != null) {
      server.username = aUsername;
    }
    if (aPassword != null) {
      server.password = aPassword;
    }

    server.valid = false;

    const account = MailServices.accounts.createAccount();
    account.incomingServer = server;
    if (aType == "pop3") {
      // Several tests expect that mail is deferred to the local folders account,
      // so do that.
      this.loadLocalMailAccount();
      server.QueryInterface(Ci.nsIPop3IncomingServer);
      server.deferredToAccount = this.msgAccount.key;
    }
    server.valid = true;

    return { server, account };
  },

  /**
   * Create an outgoing nsISmtpServer with the given parameters.
   *
   * @param {integer} aPort - The port the server is on.
   * @param {string} aUsername - The username for the server
   * @param {string} aPassword - The password for the server
   * @param {string} [aHostname=localhost] - The hostname for the server.
   * @returns {nsISmtpServer} The newly-created nsISmtpServer.
   */
  create_outgoing_server(aPort, aUsername, aPassword, aHostname = "localhost") {
    const server = MailServices.smtp.createServer();
    server.hostname = aHostname;
    server.port = aPort;
    server.authMethod = Ci.nsMsgAuthMethod.none;
    return server;
  },

  /**
   * Associate the given outgoing server with the given account.
   * It does so by creating a new identity in the account using the given outgoing
   * server.
   *
   * @param {nsIMsgAccount} aIncoming - The account to associate.
   * @param {nsISmtpServer} aOutgoingServer - The outgoing server to associate.
   * @param {bool} aSetAsDefault - Whether to set the outgoing server as the
   *   default for the account.
   */
  associate_servers(aIncoming, aOutgoingServer, aSetAsDefault = false) {
    if (!(aIncoming instanceof Ci.nsIMsgAccount)) {
      throw new Error("aIncoming isn't an account");
    }

    const identity = MailServices.accounts.createIdentity();
    identity.smtpServerKey = aOutgoingServer.key;

    aIncoming.addIdentity(identity);

    if (aSetAsDefault) {
      aIncoming.defaultIdentity = identity;
    }
  },
};
