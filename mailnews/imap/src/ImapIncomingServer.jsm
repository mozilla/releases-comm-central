/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapIncomingServer"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  ImapClient: "resource:///modules/ImapClient.jsm",
  ImapUtils: "resource:///modules/ImapUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
});

/**
 * @implements {nsIImapServerSink}
 * @implements {nsIImapIncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsIUrlListener}
 * @implements {nsISupportsWeakReference}
 */
class ImapIncomingServer extends MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIImapServerSink",
    "nsIImapIncomingServer",
    "nsIMsgIncomingServer",
    "nsIUrlListener",
    "nsISupportsWeakReference",
  ]);

  _logger = lazy.ImapUtils.logger;

  constructor() {
    super();

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "imap";
    this.localDatabaseType = "imap";
    this.canBeDefaultServer = true;

    // nsIImapIncomingServer attributes that map directly to pref values.
    this._mapAttrsToPrefs([
      ["Bool", "allowUTF8Accept", "allow_utf8_accept"],
      ["Bool", "autoSyncOfflineStores", "autosync_offline_stores"],
      ["Bool", "checkAllFoldersForNew", "check_all_folders_for_new"],
      ["Bool", "cleanupInboxOnExit", "cleanup_inbox_on_exit"],
      ["Bool", "downloadBodiesOnGetNewMail", "download_bodies_on_get_new_mail"],
      ["Bool", "dualUseFolders", "dual_use_folders"],
      ["Bool", "fetchByChunks", "fetch_by_chunks"],
      ["Bool", "forceSelect", "force_select_imap"],
      ["Bool", "isGMailServer", "is_gmail"],
      ["Bool", "mimePartsOnDemand", "mime_parts_on_demand"],
      ["Bool", "offlineDownload", "offline_download"],
      ["Bool", "sendID", "send_client_info"],
      ["Bool", "useCompressDeflate", "use_compress_deflate"],
      ["Bool", "useCondStore", "use_condstore"],
      ["Bool", "useIdle", "use_idle"],
      ["Char", "adminUrl", "admin_url"],
      ["Char", "otherUsersNamespace", "namespace.other_users"],
      ["Char", "personalNamespace", "namespace.personal"],
      ["Char", "publicNamespace", "namespace.public"],
      ["Char", "serverIDPref", "serverIDResponse"],
      ["Int", "autoSyncMaxAgeDays", "autosync_max_age_days"],
      ["Int", "timeOutLimits", "timeout"],
    ]);
  }

  /** @see nsIUrlListener */
  OnStartRunningUrl() {}

  OnStopRunningUrl() {}

  /** @see nsIMsgIncomingServer */
  performExpand(msgWindow) {
    this.hasDiscoveredFolders = false;
    MailServices.imap.discoverAllFolders(this.rootFolder, this, msgWindow);
  }

  closeCachedConnections() {
    // Close all connections.
    for (let client of [...this._freeConnections, ...this._busyConnections]) {
      client.logout();
    }
    // Cancel all waitings in queue.
    for (let resolve of this._connectionWaitingQueue) {
      resolve(false);
    }
    this._freeConnections = [];
    this._busyConnections = [];
  }

  /** @see nsIImapServerSink */
  possibleImapMailbox(folderPath, delimiter, boxFlags) {
    let explicitlyVerify = false;

    if (folderPath.endsWith("/")) {
      folderPath = folderPath.slice(0, -1);
      if (!folderPath) {
        throw Components.Exception(
          "Empty folder path",
          Cr.NS_ERROR_INVALID_ARG
        );
      }
      explicitlyVerify = !(boxFlags & lazy.ImapUtils.FLAG_NAMESPACE);
    }

    let slashIndex = folderPath.indexOf("/");
    let token = folderPath;
    let rest = "";
    if (slashIndex > 0) {
      token = folderPath.slice(0, slashIndex);
      rest = folderPath.slice(slashIndex);
    }

    folderPath = (/^inbox/i.test(token) ? "INBOX" : token) + rest;

    let uri = this.serverURI;
    let parentName = folderPath;
    let parentUri = uri;
    let hasParent = false;
    let lastSlashIndex = folderPath.lastIndexOf("/");
    if (lastSlashIndex > 0) {
      parentName = parentName.slice(0, lastSlashIndex);
      hasParent = true;
      parentUri += "/" + parentName;
    }

    if (/^inbox/i.test(folderPath) && delimiter == "|") {
      delimiter = "/";
      this.rootFolder.QueryInterface(
        Ci.nsIMsgImapMailFolder
      ).hierarchyDelimiter = delimiter;
    }

    uri += "/" + folderPath;
    let child = this.rootFolder.getChildWithURI(
      uri,
      true,
      /^inbox/i.test(folderPath)
    );

    let isNewFolder = !child;
    if (isNewFolder) {
      if (hasParent) {
        let parent = this.rootFolder.getChildWithURI(
          parentUri,
          true,
          /^inbox/i.test(parentName)
        );

        if (!parent) {
          this.possibleImapMailbox(
            parentName,
            delimiter,
            lazy.ImapUtils.FLAG_NO_SELECT |
              (boxFlags &
                (lazy.ImapUtils.FLAG_PUBLIC_MAILBOX |
                  lazy.ImapUtils.FLAG_OTHER_USERS_MAILBOX |
                  lazy.ImapUtils.FLAG_PERSONAL_MAILBOX))
          );
        }
      }
      this.rootFolder.createClientSubfolderInfo(
        folderPath,
        delimiter,
        boxFlags,
        false
      );
      child = this.rootFolder.getChildWithURI(
        uri,
        true,
        /^inbox/i.test(folderPath)
      );
    }
    if (child) {
      let imapFolder = child.QueryInterface(Ci.nsIMsgImapMailFolder);
      imapFolder.verifiedAsOnlineFolder = true;
      imapFolder.hierarchyDelimiter = delimiter;
      if (boxFlags & lazy.ImapUtils.FLAG_IMAP_TRASH) {
        if (this.deleteModel == Ci.nsMsgImapDeleteModels.MoveToTrash) {
          child.setFlag(Ci.nsMsgFolderFlags.Trash);
        }
      }
      imapFolder.boxFlags = boxFlags;
      imapFolder.explicitlyVerify = explicitlyVerify;
      let onlineName = imapFolder.onlineName;
      folderPath.replaceAll("/", delimiter);
      if (delimiter != "/") {
        folderPath = decodeURIComponent(folderPath);
      }

      if (boxFlags & lazy.ImapUtils.FLAG_IMAP_INBOX) {
        // GMail gives us a localized name for the inbox but doesn't let
        // us select that localized name.
        imapFolder.onlineName = "INBOX";
      } else if (!onlineName || onlineName != folderPath) {
        imapFolder.onlineName = folderPath;
      }

      child.prettyName = imapFolder.name;
      if (isNewFolder) {
        // Close the db so we don't hold open all the .msf files for new folders.
        child.msgDatabase = null;
      }
    }

    return isNewFolder;
  }

  discoveryDone() {
    // No need to verify the root.
    this.rootFolder.QueryInterface(
      Ci.nsIMsgImapMailFolder
    ).verifiedAsOnlineFolder = true;
    let unverified = this._getUnverifiedFolders(this.rootFolder);
    this._logger.debug(
      `discoveryDone, unverified folders count=${unverified.length}.`
    );
    for (let folder of unverified) {
      if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
        // Do not remove virtual folders.
        continue;
      }
      let imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
      if (
        !this.usingSubscription ||
        imapFolder.explicitlyVerify ||
        (folder.hasSubFolders && this._noDescendentsAreVerified(folder))
      ) {
        imapFolder.explicitlyVerify = false;
        imapFolder.list();
      } else if (folder.parent) {
        imapFolder.removeLocalSelf();
        this._logger.debug(`Removed unverified folder name=${folder.name}`);
      }
    }
  }

  /**
   * Find local folders that do not exist on the server.
   * @param {nsIMsgFolder} parentFolder - The folder to check.
   * @returns {nsIMsgFolder[]}
   */
  _getUnverifiedFolders(parentFolder) {
    let folders = [];
    let imapFolder = parentFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
    if (!imapFolder.verifiedAsOnlineFolder || imapFolder.explicitlyVerify) {
      folders.push(imapFolder);
    }
    for (let folder of parentFolder.subFolders) {
      folders.push(...this._getUnverifiedFolders(folder));
    }
    return folders;
  }

  /**
   * Returns true if all sub folders are unverified.
   * @param {nsIMsgFolder} parentFolder - The folder to check.
   * @returns {nsIMsgFolder[]}
   */
  _noDescendentsAreVerified(parentFolder) {
    for (let folder of parentFolder.subFolders) {
      let imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
      if (
        imapFolder.verifiedAsOnlineFolder ||
        !this._noDescendentsAreVerified(folder)
      ) {
        return false;
      }
    }
    return true;
  }

  onlineFolderRename(msgWindow, oldName, newName) {
    let folder = this._getFolder(oldName).QueryInterface(
      Ci.nsIMsgImapMailFolder
    );
    let index = newName.lastIndexOf("/");
    let parent =
      index > 0 ? this._getFolder(newName.slice(0, index)) : this.rootFolder;
    folder.renameLocal(newName, parent);
    if (parent instanceof Ci.nsIMsgImapMailFolder) {
      parent.renameClient(msgWindow, folder, oldName, newName);
    }

    this._getFolder(newName).NotifyFolderEvent("RenameCompleted");
  }

  /**
   * Given a canonical folder name, returns the corresponding msg folder.
   * @param {string} name - The canonical folder name, e.g. a/b/c.
   * @returns {nsIMsgFolder} The corresponding msg folder.
   */
  _getFolder(name) {
    return lazy.MailUtils.getOrCreateFolder(this.rootFolder.URI + "/" + name);
  }

  abortQueuedUrls() {}

  /** @see nsIImapIncomingServer */
  get deleteModel() {
    return this.getIntValue("delete_model");
  }

  get usingSubscription() {
    return this.getBoolValue("using_subscription");
  }

  get trashFolderName() {
    return this.getUnicharValue("trash_folder_name") || "Trash";
  }

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

  GetNewMessagesForNonInboxFolders(
    folder,
    msgWindow,
    forceAllFolders,
    performingBiff
  ) {
    let flags = folder.flags;

    if (
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).canOpenFolder &&
      ((forceAllFolders &&
        !(
          flags &
          (Ci.nsMsgFolderFlags.Inbox |
            Ci.nsMsgFolderFlags.Trash |
            Ci.nsMsgFolderFlags.Junk |
            Ci.nsMsgFolderFlags.Virtual)
        )) ||
        flags & Ci.nsMsgFolderFlags.CheckNew)
    ) {
      folder.gettingNewMessages = true;
      if (performingBiff) {
        folder.performingBiff = true;
      }
    }

    if (
      Services.prefs.getBoolPref("mail.imap.use_status_for_biff", false) &&
      !MailServices.mailSession.IsFolderOpenInWindow(folder)
    ) {
      folder.updateStatus(this, msgWindow);
    } else {
      folder.updateFolder(msgWindow);
    }

    for (let subFolder of folder.subFolders) {
      this.GetNewMessagesForNonInboxFolders(
        subFolder,
        msgWindow,
        forceAllFolders,
        performingBiff
      );
    }
  }

  CloseConnectionForFolder(folder) {
    for (let client of this._busyConnections) {
      if (client.folder == folder) {
        client.logout();
      }
    }
  }

  _capabilities = [];

  set capabilities(value) {
    this._capabilities = value;
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
      client = new lazy.ImapClient(this);
      this._busyConnections.push(client);
      return client;
    }
    // Wait until a connection is available. canGetNext is false when
    // closeCachedConnections is called.
    let canGetNext = await new Promise(resolve =>
      this._connectionWaitingQueue.push(resolve)
    );
    if (canGetNext) {
      return this._getNextClient();
    }
    return null;
  }

  /**
   * Do some actions with a connection.
   * @param {Function} handler - A callback function to take a ImapClient
   *   instance, and do some actions.
   */
  async withClient(handler) {
    let client = await this._getNextClient();
    if (!client) {
      return;
    }
    client.onDone = async () => {
      this._busyConnections = this._busyConnections.filter(c => c != client);
      this._freeConnections.push(client);
      let resolve = this._connectionWaitingQueue.shift();
      if (resolve) {
        // Resovle the first waiting in queue.
        resolve(true);
      } else if (
        !this._busyConnections.length &&
        this.useIdle &&
        this._capabilities.includes("IDLE")
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
