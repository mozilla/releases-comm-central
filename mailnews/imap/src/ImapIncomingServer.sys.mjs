/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { MsgIncomingServer } from "resource:///modules/MsgIncomingServer.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ImapClient: "resource:///modules/ImapClient.sys.mjs",
  ImapCapFlags: "resource:///modules/ImapUtils.sys.mjs",
  ImapUtils: "resource:///modules/ImapUtils.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

/**
 * @extends {MsgIncomingServer}
 * @implements {nsIImapServerSink}
 * @implements {nsIImapIncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsIUrlListener}
 * @implements {nsISupportsWeakReference}
 * @implements {nsISubscribableServer}
 */
export class ImapIncomingServer extends MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIImapServerSink",
    "nsIImapIncomingServer",
    "nsIMsgIncomingServer",
    "nsIUrlListener",
    "nsISupportsWeakReference",
    "nsISubscribableServer",
  ]);

  _logger = lazy.ImapUtils.logger;

  constructor() {
    super();

    this._userAuthenticated = false;

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "imap";
    this.localDatabaseType = "imap";
    this.canBeDefaultServer = true;
    this.canSearchMessages = true;

    // nsISubscribableServer attributes.
    this.supportsSubscribeSearch = false;

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

  /**
   * Most of nsISubscribableServer interfaces are delegated to
   * this._subscribable.
   */
  get _subscribable() {
    if (!this._subscribableServer) {
      this._subscribableServer = Cc[
        "@mozilla.org/messenger/subscribableserver;1"
      ].createInstance(Ci.nsISubscribableServer);
      this._subscribableServer.setIncomingServer(this);
    }
    return this._subscribableServer;
  }

  /** @see nsISubscribableServer */
  get folderView() {
    return this._subscribable.folderView;
  }

  get subscribeListener() {
    return this._subscribable.subscribeListener;
  }

  set subscribeListener(value) {
    this._subscribable.subscribeListener = value;
  }

  set delimiter(value) {
    this._subscribable.delimiter = value;
  }

  subscribeCleanup() {
    this._subscribableServer = null;
  }

  startPopulating(msgWindow, forceToServer, getOnlyNew) {
    this._loadingInSubscribeDialog = true;
    this._subscribable.startPopulating(msgWindow, forceToServer, getOnlyNew);
    this.delimiter = "/";
    this.setShowFullName(false);
    MailServices.imap.getListOfFoldersOnServer(this, msgWindow);
  }

  stopPopulating(msgWindow) {
    this._loadingInSubscribeDialog = false;
    this._subscribable.stopPopulating(msgWindow);
  }

  addTo(name, addAsSubscribed, subscribable, changeIfExists) {
    this._subscribable.addTo(
      name,
      addAsSubscribed,
      subscribable,
      changeIfExists
    );
  }

  subscribe(name) {
    this.subscribeToFolder(name, true);
  }

  unsubscribe(name) {
    this.subscribeToFolder(name, false);
  }

  commitSubscribeChanges() {
    this.performExpand();
  }

  setAsSubscribed(path) {
    this._subscribable.setAsSubscribed(path);
  }

  updateSubscribed() {}

  setState(path, state) {
    return this._subscribable.setState(path, state);
  }

  setShowFullName(showFullName) {
    this._subscribable.setShowFullName(showFullName);
  }

  hasChildren(path) {
    return this._subscribable.hasChildren(path);
  }

  isSubscribed(path) {
    return this._subscribable.isSubscribed(path);
  }

  isSubscribable(path) {
    return this._subscribable.isSubscribable(path);
  }

  getLeafName(path) {
    return this._subscribable.getLeafName(path);
  }

  getFirstChildURI(path) {
    return this._subscribable.getFirstChildURI(path);
  }

  getChildURIs(path) {
    return this._subscribable.getChildURIs(path);
  }

  /** @see nsIUrlListener */
  OnStartRunningUrl() {}

  OnStopRunningUrl(url) {
    switch (url.QueryInterface(Ci.nsIImapUrl).imapAction) {
      case Ci.nsIImapUrl.nsImapDiscoverAllAndSubscribedBoxesUrl:
        this.stopPopulating();
        break;
    }
  }

  /** @see nsIMsgIncomingServer */
  get serverRequiresPasswordForBiff() {
    return !this._userAuthenticated;
  }

  get offlineSupportLevel() {
    const OFFLINE_SUPPORT_LEVEL_UNDEFINED = -1;
    const OFFLINE_SUPPORT_LEVEL_REGULAR = 10;
    const level = this.getIntValue("offline_support_level");
    return level != OFFLINE_SUPPORT_LEVEL_UNDEFINED
      ? level
      : OFFLINE_SUPPORT_LEVEL_REGULAR;
  }

  get constructedPrettyName() {
    const identity = MailServices.accounts.getFirstIdentityForServer(this);
    let email;
    if (identity) {
      email = identity.email;
    } else {
      email = `${this.username}`;
      if (this.hostName) {
        email += `@${this.hostName}`;
      }
    }
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/imapMsgs.properties"
    );
    return bundle.formatStringFromName("imapDefaultAccountName", [email]);
  }

  performBiff(msgWindow) {
    this.performExpand(msgWindow);
  }

  performExpand(msgWindow) {
    this._setFolderToUnverified();
    this.hasDiscoveredFolders = false;
    MailServices.imap.discoverAllFolders(this.rootFolder, this, msgWindow);
  }

  /**
   * Recursively set a folder and its subFolders to unverified state.
   *
   * @param {nsIMsgFolder} folder - The folder to operate on.
   */
  _setFolderToUnverified(folder) {
    if (!folder) {
      this._setFolderToUnverified(this.rootFolder);
      return;
    }

    folder.QueryInterface(
      Ci.nsIMsgImapMailFolder
    ).verifiedAsOnlineFolder = false;
    for (const child of folder.subFolders) {
      this._setFolderToUnverified(child);
    }
  }

  closeCachedConnections() {
    // Close all connections.
    for (const client of this._connections) {
      client.logout();
    }
    // Cancel all waitings in queue.
    for (const resolve of this._connectionWaitingQueue) {
      resolve(false);
    }
    this._connections = [];
  }

  verifyLogon(urlListener, msgWindow) {
    return MailServices.imap.verifyLogon(
      this.rootFolder,
      urlListener,
      msgWindow
    );
  }

  subscribeToFolder(name, subscribe) {
    const folder = this.rootMsgFolder.findSubFolder(name);
    if (subscribe) {
      return MailServices.imap.subscribeFolder(folder, name, null);
    }
    return MailServices.imap.unsubscribeFolder(folder, name, null);
  }

  /** @see nsIImapServerSink */

  /** @type {boolean} - User has authenticated with the server. */
  get userAuthenticated() {
    return this._userAuthenticated;
  }

  set userAuthenticated(value) {
    this._userAuthenticated = value;
    if (value) {
      MailServices.accounts.userNeedsToAuthenticate = false;
    }
  }

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

    if (this.hasDiscoveredFolders && this._loadingInSubscribeDialog) {
      // Populate the subscribe dialog.
      const noSelect = boxFlags & lazy.ImapUtils.FLAG_NO_SELECT;
      this.addTo(
        folderPath,
        this.doingLsub && !noSelect,
        !noSelect,
        this.doingLsub
      );
      return false;
    }

    const slashIndex = folderPath.indexOf("/");
    let token = folderPath;
    let rest = "";
    if (slashIndex > 0) {
      token = folderPath.slice(0, slashIndex);
      rest = folderPath.slice(slashIndex);
    }

    folderPath = (/^inbox/i.test(token) ? "INBOX" : token) + rest;

    let uri = this.rootFolder.URI;
    let parentName = folderPath;
    let parentUri = uri;
    let hasParent = false;
    const lastSlashIndex = folderPath.lastIndexOf("/");
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

    const isNewFolder = !child;
    if (isNewFolder) {
      if (hasParent) {
        const parent = this.rootFolder.getChildWithURI(
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
      this.rootFolder
        .QueryInterface(Ci.nsIMsgImapMailFolder)
        .createClientSubfolderInfo(folderPath, delimiter, boxFlags, false);
      child = this.rootFolder.getChildWithURI(
        uri,
        true,
        /^inbox/i.test(folderPath)
      );
    }
    if (child) {
      const imapFolder = child.QueryInterface(Ci.nsIMsgImapMailFolder);
      imapFolder.verifiedAsOnlineFolder = true;
      imapFolder.hierarchyDelimiter = delimiter;
      if (boxFlags & lazy.ImapUtils.FLAG_IMAP_TRASH) {
        if (this.deleteModel == Ci.nsMsgImapDeleteModels.MoveToTrash) {
          child.setFlag(Ci.nsMsgFolderFlags.Trash);
        }
      }
      imapFolder.boxFlags = boxFlags;
      imapFolder.explicitlyVerify = explicitlyVerify;
      const onlineName = imapFolder.onlineName;
      folderPath = folderPath.replaceAll("/", delimiter);
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
    this.hasDiscoveredFolders = true;
    // No need to verify the root.
    this.rootFolder.QueryInterface(
      Ci.nsIMsgImapMailFolder
    ).verifiedAsOnlineFolder = true;
    const unverified = this._getUnverifiedFolders(this.rootFolder);
    this._logger.debug(
      `discoveryDone, unverified folders count=${unverified.length}.`
    );
    for (const folder of unverified) {
      if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
        // Do not remove virtual folders.
        continue;
      }
      const imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
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
   *
   * @param {nsIMsgFolder} parentFolder - The folder to check.
   * @returns {nsIMsgFolder[]}
   */
  _getUnverifiedFolders(parentFolder) {
    const folders = [];
    const imapFolder = parentFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
    if (!imapFolder.verifiedAsOnlineFolder || imapFolder.explicitlyVerify) {
      folders.push(imapFolder);
    }
    for (const folder of parentFolder.subFolders) {
      folders.push(...this._getUnverifiedFolders(folder));
    }
    return folders;
  }

  /**
   * Returns true if all sub folders are unverified.
   *
   * @param {nsIMsgFolder} parentFolder - The folder to check.
   * @returns {nsIMsgFolder[]}
   */
  _noDescendentsAreVerified(parentFolder) {
    for (const folder of parentFolder.subFolders) {
      const imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
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
    const folder = this._getFolder(oldName).QueryInterface(
      Ci.nsIMsgImapMailFolder
    );
    const index = newName.lastIndexOf("/");
    const parent =
      index > 0 ? this._getFolder(newName.slice(0, index)) : this.rootFolder;
    folder.renameLocal(newName, parent);
    if (parent instanceof Ci.nsIMsgImapMailFolder) {
      try {
        parent.renameClient(msgWindow, folder, oldName, newName);
      } catch (e) {
        this._logger.error("renameClient failed", e);
      }
    }

    this._getFolder(newName).NotifyFolderEvent("RenameCompleted");
  }

  /**
   * Given a canonical folder name, returns the corresponding msg folder.
   *
   * @param {string} name - The canonical folder name, e.g. a/b/c.
   * @returns {nsIMsgFolder} The corresponding msg folder.
   */
  _getFolder(name) {
    return lazy.MailUtils.getOrCreateFolder(this.rootFolder.URI + "/" + name);
  }

  abortQueuedUrls() {}

  setCapability(capabilityFlags) {
    this._capabilityFlags = capabilityFlags;
    if (capabilityFlags & lazy.ImapCapFlags.Gmail) {
      this.isGMailServer = true;
    }
  }

  /** @see nsIImapIncomingServer */
  getCapability() {
    return this._capabilityFlags;
  }

  get deleteModel() {
    return this.getIntValue("delete_model");
  }

  set deleteModel(value) {
    this.setIntValue("delete_model", value);
    const trashFolder = this._getFolder(this.trashFolderName);
    if (trashFolder) {
      if (value == Ci.nsMsgImapDeleteModels.MoveToTrash) {
        trashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);
      } else {
        trashFolder.clearFlag(Ci.nsMsgFolderFlags.Trash);
      }
    }
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
    const flags = folder.flags;

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

    for (const subFolder of folder.subFolders) {
      this.GetNewMessagesForNonInboxFolders(
        subFolder,
        msgWindow,
        forceAllFolders,
        performingBiff
      );
    }
  }

  CloseConnectionForFolder(folder) {
    for (const client of this._connections) {
      if (client.folder == folder) {
        client.logout();
      }
    }
  }

  _capabilities = [];

  set capabilities(value) {
    this._capabilities = value;
    this.setCapability(lazy.ImapCapFlags.stringsToFlags(value));
  }

  // @type {ImapClient[]} - An array of connections.
  _connections = [];
  // @type {Function[]} - An array of Promise.resolve functions.
  _connectionWaitingQueue = [];

  /**
   * Wait for a free connection.
   *
   * @param {nsIMsgFolder} folder - The folder to operate on.
   * @returns {ImapClient}
   */
  async _waitForNextClient(folder) {
    // Wait until a connection is available. canGetNext is false when
    // closeCachedConnections is called.
    const canGetNext = await new Promise(resolve =>
      this._connectionWaitingQueue.push(resolve)
    );
    if (canGetNext) {
      return this._getNextClient(folder);
    }
    return null;
  }

  /**
   * Check if INBOX folder is selected in a connection.
   *
   * @param {ImapClient} client - The client to check.
   * @returns {boolean}
   */
  _isInboxConnection(client) {
    return client.folder?.onlineName.toUpperCase() == "INBOX";
  }

  /**
   * Get a free connection that can be used.
   *
   * @param {nsIMsgFolder} folder - The folder to operate on.
   * @returns {ImapClient}
   */
  async _getNextClient(folder) {
    let client;

    for (client of this._connections) {
      if (folder && client.folder == folder) {
        if (client.busy) {
          // Prevent operating on the same folder in two connections.
          return this._waitForNextClient(folder);
        }
        // If we're idling in the target folder, reuse it.
        client.busy = true;
        return client;
      }
    }

    // Create a new client if the pool is not full.
    if (this._connections.length < this.maximumConnectionsNumber) {
      client = new lazy.ImapClient(this);
      this._connections.push(client);
      client.busy = true;
      return client;
    }

    const freeConnections = this._connections.filter(c => !c.busy);

    // Wait if no free connection.
    if (!freeConnections.length) {
      return this._waitForNextClient(folder);
    }

    // Reuse any free connection if only have one connection or IDLE not used.
    if (
      this.maximumConnectionsNumber <= 1 ||
      !this.useIdle ||
      !this._capabilities.includes("IDLE")
    ) {
      freeConnections[0].busy = true;
      return freeConnections[0];
    }

    // Reuse non-inbox free connection.
    client = freeConnections.find(c => !this._isInboxConnection(c));
    if (client) {
      client.busy = true;
      return client;
    }
    return this._waitForNextClient(folder);
  }

  /**
   * Do some actions with a connection.
   *
   * @param {nsIMsgFolder} folder - The folder to operate on.
   * @param {Function} handler - A callback function to take a ImapClient
   *   instance, and do some actions.
   */
  async withClient(folder, handler) {
    const client = await this._getNextClient(folder);
    if (!client) {
      return;
    }
    const startIdle = async () => {
      if (!this.useIdle || !this._capabilities.includes("IDLE")) {
        return;
      }

      // IDLE is configed and supported, use IDLE to receive server pushes.
      const hasInboxConnection = this._connections.some(c =>
        this._isInboxConnection(c)
      );
      const alreadyIdling =
        client.folder &&
        this._connections.find(
          c => c != client && !c.busy && c.folder == client.folder
        );
      if (!hasInboxConnection) {
        client.selectFolder(
          this.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox)
        );
      } else if (client.folder && !alreadyIdling) {
        client.idle();
      } else if (alreadyIdling) {
        client.folder = null;
      }
    };
    client.onFree = () => {
      client.busy = false;
      const resolve = this._connectionWaitingQueue.shift();
      if (resolve) {
        // Resolve the first waiting in queue.
        resolve(true);
      } else if (client.isOnline) {
        startIdle();
      }
    };
    handler(client);
    client.connect();
  }
}

ImapIncomingServer.prototype.classID = Components.ID(
  "{b02a4e1c-0d9e-498c-8b9d-18917ba9f65b}"
);
