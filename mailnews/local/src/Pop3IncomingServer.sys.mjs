/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MsgIncomingServer } from "resource:///modules/MsgIncomingServer.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Pop3Client: "resource:///modules/Pop3Client.sys.mjs",
});

/**
 * @implements {nsIPop3IncomingServer}
 * @implements {nsILocalMailIncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 */
export class Pop3IncomingServer extends MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIPop3IncomingServer",
    "nsILocalMailIncomingServer",
    "nsIMsgIncomingServer",
    "nsISupportsWeakReference",
  ]);

  // @type {Boolean} - A flag to indicate that a client run is in progress.
  static #_busyConnections = false;
  // @type {Function[]} - An array of Promise.resolve functions used as a queue.
  static #_connectionWaitingQueue = [];

  constructor() {
    super();

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "mailbox";
    this.localDatabaseType = "mailbox";
    this.canBeDefaultServer = true;

    Object.defineProperty(this, "canCreateFoldersOnServer", {
      get: () => !this.deferredToAccount,
    });
    Object.defineProperty(this, "canFileMessagesOnServer", {
      get: () => !this.deferredToAccount,
    });

    // nsIPop3IncomingServer attributes that map directly to pref values.
    this._mapAttrsToPrefs([
      ["Bool", "leaveMessagesOnServer", "leave_on_server"],
      ["Bool", "headersOnly", "headers_only"],
      ["Bool", "deleteMailLeftOnServer", "delete_mail_left_on_server"],
      ["Bool", "deleteByAgeFromServer", "delete_by_age_from_server"],
      ["Bool", "deferGetNewMail", "defer_get_new_mail"],
      ["Int", "numDaysToLeaveOnServer", "num_days_to_leave_on_server"],
    ]);

    // @type {Map<string,string>} - A map from uidl to status.
    this._uidlsToMark = new Map();
  }

  /** @see nsIMsgIncomingServer */
  get rootMsgFolder() {
    if (this._rootMsgFolder) {
      return this._rootMsgFolder;
    }

    if (!this.deferredToAccount) {
      this._rootMsgFolder = this.rootFolder;
      return this._rootMsgFolder;
    }

    const incomingServer = MailServices.accounts.getAccount(
      this.deferredToAccount
    ).incomingServer;
    if (incomingServer.equals(this)) {
      // Make sure we're not deferred to ourself.
      throw Components.Exception(
        `${incomingServer.prettyName} cannot be deferred to itself`,
        Cr.NS_ERROR_FAILURE
      );
    }

    this._rootMsgFolder = incomingServer.rootMsgFolder;
    return this._rootMsgFolder;
  }

  get canSearchMessages() {
    return this.canFileMessagesOnServer;
  }

  getNewMessages(folder, msgWindow, urlListener) {
    const inbox = this.rootMsgFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Inbox
    );
    if (!this.deferredToAccount) {
      const deferredServers = this._getDeferedServers(folder.server);
      if (deferredServers.length) {
        // If other servers are deferred to this server, get new mail for them
        // as well.
        this.downloadMailFromServers(
          [...deferredServers, this],
          msgWindow,
          inbox,
          urlListener
        );
        return;
      }
    }
    // Occurs on get new mail for a single server.
    MailServices.pop3.GetNewMail(msgWindow, urlListener, inbox, this);
  }

  verifyLogon(urlListener, msgWindow) {
    return MailServices.pop3.verifyLogon(this, urlListener, msgWindow);
  }

  performBiff(msgWindow) {
    this.performingBiff = true;
    const inbox = this.rootMsgFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Inbox
    );
    const urlListener = inbox.QueryInterface(Ci.nsIUrlListener);
    // Occurs on biff for an individual server.
    if (this.downloadOnBiff) {
      MailServices.pop3.GetNewMail(msgWindow, urlListener, inbox, this);
    } else {
      MailServices.pop3.CheckForNewMail(msgWindow, urlListener, inbox, this);
    }
  }

  /** @see nsILocalMailIncomingServer */
  createDefaultMailboxes() {
    for (const name of ["Inbox", "Trash"]) {
      const folderUri = this.rootFolder.URI + "/" + name;
      // Check by URI instead of by name, because folder name can be localized.
      if (!this.rootFolder.getChildWithURI(folderUri, false, false)) {
        this.msgStore.createFolder(this.rootFolder, name);
      }
    }
  }

  setFlagsOnDefaultMailboxes() {
    this.rootFolder
      .QueryInterface(Ci.nsIMsgLocalMailFolder)
      // POP3 account gets an inbox, but no queue (unsent messages).
      .setFlagsOnDefaultMailboxes(
        Ci.nsMsgFolderFlags.SpecialUse & ~Ci.nsMsgFolderFlags.Queue
      );
  }

  // This is called when "Get Selected Messages" menu item is used to
  // to fetch full messages that previously had only the headers downloaded.
  getNewMail(msgWindow, urlListener, inbox) {
    MailServices.pop3.GetNewMail(msgWindow, urlListener, inbox, this);
  }

  /** @see nsIPop3IncomingServer */
  get deferredToAccount() {
    let accountKey = this.getCharValue("deferred_to_account");
    if (!accountKey) {
      return "";
    }

    const account = MailServices.accounts.getAccount(accountKey);
    // If currently deferred to an invalid or hidden server, change to defer to
    // the local folders inbox.
    if (!account || !account.incomingServer || account.incomingServer.hidden) {
      let localAccount;
      try {
        localAccount = MailServices.accounts.findAccountForServer(
          MailServices.accounts.localFoldersServer
        );
      } catch (e) {
        // MailServices.accounts.localFoldersServer throws if no Local Folders.
        return "";
      }
      accountKey = localAccount.key;
      this.setCharValue("deferred_to_account", accountKey);
    }

    return accountKey;
  }

  set deferredToAccount(accountKey) {
    this._rootMsgFolder = null;

    const wasDeferred = Boolean(this.deferredToAccount);
    this.setCharValue("deferred_to_account", accountKey);

    // If isDeferred state has changed, send notification.
    if (Boolean(accountKey) != wasDeferred) {
      const folderListenerManager = MailServices.mailSession.QueryInterface(
        Ci.nsIFolderListener
      );
      folderListenerManager.onFolderBoolPropertyChanged(
        this.rootFolder,
        "isDeferred",
        wasDeferred,
        !wasDeferred
      );
      folderListenerManager.onFolderBoolPropertyChanged(
        this.rootFolder,
        "CanFileMessages",
        !wasDeferred,
        wasDeferred
      );
    }

    if (!accountKey) {
      return;
    }
    // Check if we are deferred to the local folders, and create INBOX if needed.
    const server = MailServices.accounts.getAccount(accountKey).incomingServer;
    if (server instanceof Ci.nsILocalMailIncomingServer) {
      // Check by URI instead of by name, because folder name can be localized.
      if (
        !this.rootFolder.getChildWithURI(
          `${this.rootFolder.URI}/Inbox`,
          false,
          false
        )
      ) {
        server.rootFolder.createSubfolder("Inbox", null);
      }
    }
  }

  addUidlToMark(uidl, mark) {
    // @see nsIMsgLocalMailFolder
    const POP3_DELETE = 1;
    const POP3_FETCH_BODY = 2;
    let status = "k";
    if (mark == POP3_DELETE) {
      status = "d";
    } else if (mark == POP3_FETCH_BODY) {
      status = "f";
    }
    this._uidlsToMark.set(uidl, status);
  }

  markMessages() {
    if (!this._uidlsToMark.size) {
      return;
    }

    const client = this.runningClient || new lazy.Pop3Client(this);
    // Pass a clone of this._uidlsToMark to client.markMessages, because
    // this._uidlsToMark may be changed before markMessages finishes.
    client.markMessages(new Map(this._uidlsToMark));
    this._uidlsToMark = new Map();
  }

  downloadMailFromServers(servers, msgWindow, folder, urlListener) {
    const server = servers.shift();
    if (!server) {
      urlListener?.OnStopRunningUrl(null, Cr.NS_OK);
      return;
    }

    // If server != folder.server, it means server is deferred to folder.server,
    // so if server.deferGetNewMail is false, no need to call GetNewMail.
    if (server == folder.server || server.deferGetNewMail) {
      // This recursive loop occurs on check new mail at startup and when
      // getting new mail for all servers.
      MailServices.pop3.GetNewMail(
        msgWindow,
        {
          OnStartRunningUrl() {},
          OnStopRunningUrl: () => {
            // Call GetNewMail for the next server only after it is finished for
            // the current server.
            // Note: this doesn't actually serialize the connections/clients
            this.downloadMailFromServers(
              servers,
              msgWindow,
              folder,
              urlListener
            );
          },
        },
        folder,
        server
      );
      return;
    }
    this.downloadMailFromServers(servers, msgWindow, folder, urlListener);
  }

  /**
   * Get all the servers that defer to the passed in server.
   *
   * @param {nsIMsgIncomingServer} dstServer - The server that others servers
   *   are deferred to.
   */
  _getDeferedServers(dstServer) {
    const dstAccount = MailServices.accounts.findAccountForServer(dstServer);
    if (!dstAccount) {
      return [];
    }
    return MailServices.accounts.allServers.filter(
      server =>
        server instanceof Ci.nsIPop3IncomingServer &&
        server.deferredToAccount == dstAccount.key
    );
  }

  /**
   * Construct and return a new client. If a client is not now running, this
   * will immediately return a new client. Otherwise it waits for the running
   * client to finish.
   *
   * @returns {Pop3Client}
   */
  async _getNewClient() {
    if (Pop3IncomingServer.#_busyConnections) {
      // Wait until the running client is done
      await new Promise(resolve =>
        Pop3IncomingServer.#_connectionWaitingQueue.push(resolve)
      );
    }
    Pop3IncomingServer.#_busyConnections = true;
    return new lazy.Pop3Client(this);
  }

  /**
   * Used to initiate a Pop3 service run and setup the specialized
   * handler functions needed for the service. This will construct a new
   * Pop3 client instance, define the needed handler sequence and functions,
   * connect to the server via network and trigger the client to do a sequence
   * of steps to complete the service run and then disconnect from the server.
   * This also ensures that only one service run occurs at a time when there are
   * more than one Pop3 account.
   *
   * @param {Function} handler - A callback function with Pop3Client instance
   *   as a parameter. Provides initialization needed before connection to
   *   the server and any handler functions needed by the client to perform
   *   the service.
   */
  async withClient(handler) {
    const client = await this._getNewClient();
    // This handler function is needed for all client service runs.
    client.onFree = () => {
      Pop3IncomingServer.#_busyConnections = false;
      // Resolve the promised wait for the previous client run.
      Pop3IncomingServer.#_connectionWaitingQueue.shift()?.();
    };
    // Specialized client handler sequence provided by the caller.
    handler(client);
    // Connect to pop3 server and perform the service run.
    client.connect();
  }
}

Pop3IncomingServer.prototype.classID = Components.ID(
  "{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}"
);
