/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpIncomingServer"];

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CommonUtils: "resource://services-common/utils.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  NntpClient: "resource:///modules/NntpClient.jsm",
});

/**
 * A class to represent a NNTP server.
 *
 * @implements {nsINntpIncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 * @implements {nsISubscribableServer}
 * @implements {nsITreeView}
 * @implements {nsIUrlListener}
 */
class NntpIncomingServer extends MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsINntpIncomingServer",
    "nsIMsgIncomingServer",
    "nsISupportsWeakReference",
    "nsISubscribableServer",
    "nsITreeView",
    "nsIUrlListener",
  ]);

  constructor() {
    super();

    this._subscribed = new Set();
    this._groups = [];

    // @type {NntpClient[]} - An array of connections can be used.
    this._idleConnections = [];
    // @type {NntpClient[]} - An array of connections in use.
    this._busyConnections = [];
    // @type {Function[]} - An array of Promise.resolve functions.
    this._connectionWaitingQueue = [];

    Services.obs.addObserver(this, "profile-before-change");
    // Update newsrc every 5 minutes.
    this._newsrcTimer = lazy.setInterval(() => this.writeNewsrcFile(), 300000);

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "news";
    this.localDatabaseType = "news";
    this.canSearchMessages = true;
    this.sortOrder = 500000000;

    Object.defineProperty(this, "defaultCopiesAndFoldersPrefsToServer", {
      // No Draft/Sent folder on news servers, will point to "Local Folders".
      get: () => false,
    });
    Object.defineProperty(this, "canCreateFoldersOnServer", {
      // No folder creation on news servers.
      get: () => false,
    });
    Object.defineProperty(this, "canFileMessagesOnServer", {
      get: () => false,
    });

    // nsISubscribableServer attributes.
    this.supportsSubscribeSearch = true;

    // nsINntpIncomingServer attributes.
    this.newsrcHasChanged = false;

    // nsINntpIncomingServer attributes that map directly to pref values.
    this._mapAttrsToPrefs([
      ["Bool", "notifyOn", "notify.on"],
      ["Bool", "markOldRead", "mark_old_read"],
      ["Bool", "abbreviate", "abbreviate"],
      ["Bool", "pushAuth", "always_authenticate"],
      ["Bool", "singleSignon"],
      ["Int", "maxArticles", "max_articles"],
    ]);
  }

  observe(subject, topic, data) {
    switch (topic) {
      case "profile-before-change":
        lazy.clearInterval(this._newsrcTimer);
        this.writeNewsrcFile();
    }
  }

  shutdown() {
    super.shutdown();
    lazy.clearInterval(this._newsrcTimer);
    Services.obs.removeObserver(this, "profile-before-change");
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

  subscribeCleanup() {
    this._subscribableServer = null;
  }

  startPopulating(msgWindow, forceToServer, getOnlyNew) {
    this._startPopulating(msgWindow, forceToServer, getOnlyNew);
  }

  stopPopulating(msgWindow) {
    this._subscribable.stopPopulating(msgWindow);
    if (!this._hostInfoLoaded) {
      this._saveHostInfo();
    }
    this.updateSubscribed();
  }

  addTo(name, addAsSubscribed, subscribale, changeIfExists) {
    try {
      this._subscribable.addTo(
        name,
        addAsSubscribed,
        subscribale,
        changeIfExists
      );
      this._groups.push(name);
    } catch (e) {
      // Group names with double dot, like alt.binaries.sounds..mp3.zappa are
      // not working. Bug 1788572.
      console.error(`Failed to add group ${name}. ${e}`);
    }
  }

  subscribe(name) {
    this.subscribeToNewsgroup(name);
  }

  unsubscribe(name) {
    this.rootMsgFolder.propagateDelete(
      this.rootMsgFolder.getChildNamed(name),
      true // delete storage
    );
    this.newsrcHasChanged = true;
  }

  commitSubscribeChanges() {
    this.newsrcHasChanged = true;
    this.writeNewsrcFile();
  }

  setAsSubscribed(path) {
    this._tmpSubscribed.add(path);
    this._subscribable.setAsSubscribed(path);
  }

  updateSubscribed() {
    this._tmpSubscribed = new Set();
    this._subscribed.forEach(path => this.setAsSubscribed(path));
  }

  setState(path, state) {
    const changed = this._subscribable.setState(path, state);
    if (changed) {
      if (state) {
        this._tmpSubscribed.add(path);
      } else {
        this._tmpSubscribed.delete(path);
      }
    }
    return changed;
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

  setSearchValue(value) {
    this._tree?.beginUpdateBatch();
    this._tree?.rowCountChanged(0, -this._searchResult.length);

    const terms = value.toLowerCase().split(" ");
    this._searchResult = this._groups
      .filter(name => {
        name = name.toLowerCase();
        // The group name should contain all the search terms.
        return terms.every(term => name.includes(term));
      })
      .sort();

    this._tree?.rowCountChanged(0, this._searchResult.length);
    this._tree?.endUpdateBatch();
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

  /** @see nsITreeView */
  get rowCount() {
    return this._searchResult.length;
  }

  isContainer(index) {
    return false;
  }

  getCellProperties(row, col) {
    if (
      col.id == "subscribedColumn2" &&
      this._tmpSubscribed.has(this._searchResult[row])
    ) {
      return "subscribed-true";
    }
    if (col.id == "nameColumn2") {
      // Show the news folder icon in the search view.
      return "serverType-nntp";
    }
    return "";
  }

  getCellValue(row, col) {
    if (col.id == "nameColumn2") {
      return this._searchResult[row];
    }
    return "";
  }

  getCellText(row, col) {
    if (col.id == "nameColumn2") {
      return this._searchResult[row];
    }
    return "";
  }

  setTree(tree) {
    this._tree = tree;
  }

  /** @see nsIUrlListener */
  OnStartRunningUrl() {}

  OnStopRunningUrl() {
    this.stopPopulating(this._msgWindow);
  }

  /** @see nsIMsgIncomingServer */
  get serverRequiresPasswordForBiff() {
    return false;
  }

  get filterScope() {
    return Ci.nsMsgSearchScope.newsFilter;
  }

  get searchScope() {
    return Services.io.offline
      ? Ci.nsMsgSearchScope.localNewsBody
      : Ci.nsMsgSearchScope.news;
  }

  get offlineSupportLevel() {
    const OFFLINE_SUPPORT_LEVEL_UNDEFINED = -1;
    const OFFLINE_SUPPORT_LEVEL_EXTENDED = 20;
    const level = this.getIntValue("offline_support_level");
    return level != OFFLINE_SUPPORT_LEVEL_UNDEFINED
      ? level
      : OFFLINE_SUPPORT_LEVEL_EXTENDED;
  }

  performExpand(msgWindow) {
    if (!Services.prefs.getBoolPref("news.update_unread_on_expand", false)) {
      return;
    }

    for (const folder of this.rootFolder.subFolders) {
      folder.getNewMessages(msgWindow, null);
    }
  }

  performBiff(msgWindow) {
    this.performExpand(msgWindow);
  }

  closeCachedConnections() {
    for (const client of [...this._idleConnections, ...this._busyConnections]) {
      client.quit();
    }
    this._idleConnections = [];
    this._busyConnections = [];
  }

  /** @see nsINntpIncomingServer */
  get charset() {
    return this.getCharValue("charset") || "UTF-8";
  }

  set charset(value) {
    this.setCharValue("charset", value);
  }

  get maximumConnectionsNumber() {
    let maxConnections = this.getIntValue("max_cached_connections", 0);
    if (maxConnections > 0) {
      return maxConnections;
    }
    // The default is 2 connections, if the pref value is 0, we use the default.
    // If it's negative, treat it as 1.
    maxConnections = maxConnections == 0 ? 2 : 1;
    this.maximumConnectionsNumber = maxConnections;
    return maxConnections;
  }

  set maximumConnectionsNumber(value) {
    this.setIntValue("max_cached_connections", value);
  }

  get newsrcRootPath() {
    let file = this.getFileValue("mail.newsrc_root-rel", "mail.newsrc_root");
    if (!file) {
      file = Services.dirsvc.get("NewsD", Ci.nsIFile);
      this.setFileValue("mail.newsrc_root-rel", "mail.newsrc_root", file);
    }
    return file;
  }

  set newsrcRootPath(value) {
    this.setFileValue("mail.newsrc_root-rel", "mail.newsrc_root", value);
  }

  get newsrcFilePath() {
    if (!this._newsrcFilePath) {
      this._newsrcFilePath = this.getFileValue(
        "newsrc.file-rel",
        "newsrc.file"
      );
    }
    if (!this._newsrcFilePath) {
      let prefix = "newsrc-";
      let suffix = "";
      if (AppConstants.platform == "win") {
        prefix = "";
        suffix = ".rc";
      }
      this._newsrcFilePath = this.newsrcRootPath;
      this._newsrcFilePath.append(`${prefix}${this.hostName}${suffix}`);
      this._newsrcFilePath.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
      this.newsrcFilePath = this._newsrcFilePath;
    }
    return this._newsrcFilePath;
  }

  set newsrcFilePath(value) {
    this._newsrcFilePath = value;
    if (!this._newsrcFilePath.exists) {
      this._newsrcFilePath.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
    }
    this.setFileValue("newsrc.file-rel", "newsrc.file", this._newsrcFilePath);
  }

  addNewsgroupToList(name) {
    name = new TextDecoder(this.charset).decode(
      lazy.CommonUtils.byteStringToArrayBuffer(name)
    );
    this.addTo(name, false, true, true);
  }

  addNewsgroup(name) {
    this._subscribed.add(name);
  }

  removeNewsgroup(name) {
    this._subscribed.delete(name);
  }

  containsNewsgroup(name) {
    // Get subFolders triggers populating _subscribed if it wasn't set already.
    if (this._subscribed.size == 0) {
      this.rootFolder.QueryInterface(Ci.nsIMsgNewsFolder).subFolders;
    }
    return this._subscribed.has(name);
  }

  subscribeToNewsgroup(name) {
    if (this.containsNewsgroup(name)) {
      return;
    }
    this.rootMsgFolder.createSubfolder(name, null);
  }

  writeNewsrcFile() {
    if (!this.newsrcHasChanged) {
      return;
    }

    const newsFolder = this.rootFolder.QueryInterface(Ci.nsIMsgNewsFolder);
    const lines = [];
    for (let folder of newsFolder.subFolders) {
      folder = folder.QueryInterface(Ci.nsIMsgNewsFolder);
      if (folder.newsrcLine) {
        lines.push(folder.newsrcLine);
      }
    }
    IOUtils.writeUTF8(this.newsrcFilePath.path, lines.join(""));
  }

  findGroup(name) {
    return this.rootMsgFolder
      .findSubFolder(name)
      .QueryInterface(Ci.nsIMsgNewsFolder);
  }

  loadNewsUrl(uri, msgWindow, consumer) {
    if (consumer instanceof Ci.nsIStreamListener) {
      this.withClient(client => {
        client.loadNewsUrl(uri.spec, msgWindow, consumer);
      });
    }
  }

  forgetPassword() {
    const newsFolder = this.rootFolder.QueryInterface(Ci.nsIMsgNewsFolder);
    // Clear password of root folder.
    newsFolder.forgetAuthenticationCredentials();

    // Clear password of all sub folders.
    for (const folder of newsFolder.subFolders) {
      folder.QueryInterface(Ci.nsIMsgNewsFolder);
      folder.forgetAuthenticationCredentials();
    }
  }

  groupNotFound(msgWindow, groupName, opening) {
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/news.properties"
    );
    const result = Services.prompt.confirm(
      msgWindow,
      null,
      bundle.formatStringFromName("autoUnsubscribeText", [
        groupName,
        this.hostName,
      ])
    );
    if (result) {
      this.unsubscribe(groupName);
    }
  }

  _lineSeparator = AppConstants.platform == "win" ? "\r\n" : "\n";

  /**
   * startPopulating as an async function.
   *
   * @see startPopulating
   */
  async _startPopulating(msgWindow, forceToServer, getOnlyNew) {
    this._msgWindow = msgWindow;
    this._subscribable.startPopulating(msgWindow, forceToServer, getOnlyNew);
    this._groups = [];

    this._hostInfoLoaded = false;
    if (!forceToServer) {
      this._hostInfoLoaded = await this._loadHostInfo();
      if (this._hostInfoLoaded) {
        this.stopPopulating(msgWindow);
        return;
      }
    }
    this._hostInfoChanged = !getOnlyNew;
    MailServices.nntp.getListOfGroupsOnServer(this, msgWindow, getOnlyNew);
  }

  /**
   * Try to load groups from hostinfo.dat.
   *
   * @returns {boolean} Returns false if hostinfo.dat doesn't exist or doesn't
   * contain any group.
   */
  async _loadHostInfo() {
    this._hostInfoFile = this.localPath;
    this._hostInfoFile.append("hostinfo.dat");
    if (!this._hostInfoFile.exists()) {
      return false;
    }
    const content = await IOUtils.readUTF8(this._hostInfoFile.path);
    let groupLine = false;
    for (const line of content.split(this._lineSeparator)) {
      if (groupLine) {
        this.addTo(line, false, true, true);
      } else if (line == "begingroups") {
        groupLine = true;
      }
    }
    return this._groups.length;
  }

  /**
   * Save this._groups to hostinfo.dat.
   */
  async _saveHostInfo() {
    if (!this._hostInfoChanged) {
      return;
    }

    const lines = [
      "# News host information file.",
      "# This is a generated file!  Do not edit.",
      "",
      "version=2",
      `newsrcname=${this.hostName}`,
      `lastgroupdate=${Math.floor(Date.now() / 1000)}`,
      "uniqueid=0",
      "",
      "begingroups",
      ...this._groups,
    ];
    await IOUtils.writeUTF8(
      this._hostInfoFile.path,
      lines.join(this._lineSeparator) + this._lineSeparator
    );
  }

  /**
   * Get an idle connection that can be used.
   *
   * @returns {NntpClient}
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
      client = new lazy.NntpClient(this);
      this._busyConnections.push(client);
      return client;
    }
    // Wait until a connection is available.
    await new Promise(resolve => this._connectionWaitingQueue.push(resolve));
    return this._getNextClient();
  }

  /**
   * Do some actions with a connection.
   *
   * @param {Function} handler - A callback function to take a NntpClient
   *   instance, and do some actions.
   */
  async withClient(handler) {
    const client = await this._getNextClient();
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

NntpIncomingServer.prototype.classID = Components.ID(
  "{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}"
);
