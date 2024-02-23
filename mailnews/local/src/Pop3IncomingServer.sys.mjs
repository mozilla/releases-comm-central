/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  Pop3Client: "resource:///modules/Pop3Client.jsm",
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
        return this.downloadMailFromServers(
          [...deferredServers, this],
          msgWindow,
          inbox,
          urlListener
        );
      }
    }
    return MailServices.pop3.GetNewMail(msgWindow, urlListener, inbox, this);
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

  getNewMail(msgWindow, urlListener, inbox) {
    return MailServices.pop3.GetNewMail(msgWindow, urlListener, inbox, this);
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
      MailServices.pop3.GetNewMail(
        msgWindow,
        {
          OnStartRunningUrl() {},
          OnStopRunningUrl: () => {
            // Call GetNewMail for the next server only after it is finished for
            // the current server.
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
}

Pop3IncomingServer.prototype.classID = Components.ID(
  "{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}"
);
