/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3IncomingServer"];

var { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const POP3_AUTH_MECH_UNDEFINED = 0x200;

/**
 * @implements {nsIPop3IncomingServer}
 * @implements {nsILocalMailIncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 */
class Pop3IncomingServer extends MsgIncomingServer {
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
    this.downloadMessagesAtStartup = true;
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
      ["Bool", "dotFix", "dot_fix"],
      ["Bool", "deleteByAgeFromServer", "delete_by_age_from_server"],
      ["Bool", "deferGetNewMail", "defer_get_new_mail"],
      ["Int", "numDaysToLeaveOnServer", "num_days_to_leave_on_server"],
    ]);
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

    let incomingServer = MailServices.accounts.getAccount(
      this.deferredToAccount
    ).incomingServer;
    if (incomingServer == this) {
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

  performExpand(msgWindow) {}

  getNewMessages(folder, msgWindow, urlListener) {
    let inbox = this.rootMsgFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Inbox
    );
    if (!this.deferredToAccount) {
      let deferredServers = this._getDeferedServers(folder.server);
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

  /** @see nsILocalMailIncomingServer */
  createDefaultMailboxes() {
    for (let name of ["Inbox", "Trash"]) {
      if (!this.rootFolder.containsChildNamed(name)) {
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
  _capFlags = POP3_AUTH_MECH_UNDEFINED;

  get pop3CapabilityFlags() {
    return this._capFlags;
  }

  set pop3CapabilityFlags(value) {
    this._capFlags = value;
  }

  get deferredToAccount() {
    let accountKey = this.getCharValue("deferred_to_account");
    if (!accountKey) {
      return "";
    }

    let account = MailServices.accounts.getAccount(accountKey);
    // If currently deferred to an invalid or hidden server, change to defer to
    // the local folders inbox.
    if (!account || !account.incomingServer || account.incomingServer.hidden) {
      let localAccount;
      try {
        localAccount = MailServices.accounts.FindAccountForServer(
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

    let wasDeferred = Boolean(this.deferredToAccount);
    this.setCharValue("deferred_to_account", accountKey);

    // If isDeferred state has changed, send notification.
    if (Boolean(accountKey) != wasDeferred) {
      let folderListenerManager = MailServices.mailSession.QueryInterface(
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
  }

  downloadMailFromServers(servers, msgWindow, folder, urlListener) {
    let server = servers.shift();
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
   * @param {nsIMsgIncomingServer} dstServer - The server that others servers
   *   are deferred to.
   */
  _getDeferedServers(dstServer) {
    let dstAccount = MailServices.accounts.FindAccountForServer(dstServer);
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
