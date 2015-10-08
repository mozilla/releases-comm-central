/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ['localAccountUtils'];

// MailServices
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var CC = Components.Constructor;

// Local Mail Folders. Requires prior setup of profile directory

var localAccountUtils = {
  inboxFolder: undefined,
  incomingServer: undefined,
  rootFolder: undefined,
  msgAccount: undefined,

  _localAccountInitialized: false,
  _mailboxStoreContractID: undefined,

  pluggableStores: ["@mozilla.org/msgstore/berkeleystore;1",
                    "@mozilla.org/msgstore/maildirstore;1"],

  clearAll: function() {
    this._localAccountInitialized = false;
    if (this.msgAccount)
      MailServices.accounts.removeAccount(this.msgAccount);
    this.incomingServer = undefined;
    this.msgAccount = undefined;
    this.inboxFolder = undefined;
    this.rootFolder = undefined;
  },

  loadLocalMailAccount: function(storeID) {
    if ((storeID && storeID == this._mailboxStoreContractID) ||
        (!storeID && this._localAccountInitialized))
      return;

    this.clearAll();
    if (storeID)
      Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                                 storeID);

    this._mailboxStoreContractID = storeID;
    MailServices.accounts.createLocalMailAccount();

    this.incomingServer = MailServices.accounts.localFoldersServer;
    this.msgAccount = MailServices.accounts.FindAccountForServer(
      this.incomingServer);

    this.rootFolder = this.incomingServer.rootMsgFolder
                        .QueryInterface(Ci.nsIMsgLocalMailFolder);

    // Note: Inbox is not created automatically when there is no deferred server,
    // so we need to create it.
    this.inboxFolder = this.rootFolder.createLocalSubfolder("Inbox")
                         .QueryInterface(Ci.nsIMsgLocalMailFolder);
    // a local inbox should have a Mail flag!
    this.inboxFolder.setFlag(Ci.nsMsgFolderFlags.Mail);

    // Force an initialization of the Inbox folder database.
    var folderName = this.inboxFolder.prettiestName;

    this._localAccountInitialized = true;
  },

  /**
   * Create an nsIMsgIncomingServer and an nsIMsgAccount to go with it.
   *
   * @param aType The type of the server (pop3, imap etc).
   * @param aPort The port the server is on.
   * @param aUsername The username for the server.
   * @param aPassword The password for the server.
   * @return The newly-created nsIMsgIncomingServer.
   */
  create_incoming_server: function(aType, aPort, aUsername, aPassword) {
    let serverAndAccount = localAccountUtils.
      create_incoming_server_and_account(aType, aPort, aUsername, aPassword);
    return serverAndAccount.server;
  },

  /**
   * Create an nsIMsgIncomingServer and an nsIMsgAccount to go with it.
   *
   * @param aType The type of the server (pop3, imap etc).
   * @param aPort The port the server is on.
   * @param aUsername The username for the server.
   * @param aPassword The password for the server.
   * @return An object with the newly-created nsIMsgIncomingServer as the
             "server" property and the newly-created nsIMsgAccount as the
             "account" property.
   */
  create_incoming_server_and_account: function (aType, aPort, aUsername, aPassword) {
    let server = MailServices.accounts.createIncomingServer(aUsername, "localhost",
                                                            aType);
    server.port = aPort;
    if (aUsername != null)
      server.username = aUsername;
    if (aPassword != null)
      server.password = aPassword;

    server.valid = false;

    let account = MailServices.accounts.createAccount();
    account.incomingServer = server;
    if (aType == "pop3") {
      // Several tests expect that mail is deferred to the local folders account,
      // so do that.
      this.loadLocalMailAccount();
      server.QueryInterface(Ci.nsIPop3IncomingServer);
      server.deferredToAccount = this.msgAccount.key;
    }
    server.valid = true;

    return {server: server, account: account};
  },

  /**
   * Create an outgoing nsISmtpServer with the given parameters.
   *
   * @param aPort The port the server is on.
   * @param aUsername The username for the server
   * @param aPassword The password for the server
   * @return The newly-created nsISmtpServer.
   */
  create_outgoing_server: function(aPort, aUsername, aPassword) {
    let server = MailServices.smtp.createServer();
    server.hostname = "localhost";
    server.port = aPort;
    server.authMethod = Ci.nsMsgAuthMethod.none;
    return server;
  },

  /**
   * Associate the given outgoing server with the given incoming server's account.
   *
   * @param aIncoming The incoming server (nsIMsgIncomingServer) or account
   *                  (nsIMsgAccount) to associate.
   * @param aOutgoingServer The outgoing server (nsISmtpServer) to associate.
   * @param aSetAsDefault Whether to set the outgoing server as the default for
   *                      the incoming server's account.
   */
  associate_servers: function(aIncoming, aOutgoingServer, aSetAsDefault) {
    let identity = MailServices.accounts.createIdentity();
    identity.smtpServerKey = aOutgoingServer.key;

    if (aIncoming instanceof Ci.nsIMsgIncomingServer)
      aIncoming = MailServices.accounts.FindAccountForServer(aIncoming);
    aIncoming.addIdentity(identity);
    if (aSetAsDefault)
      aIncoming.defaultIdentity = identity;
  }
};
