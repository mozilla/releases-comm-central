/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpIncomingServer"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  CommonUtils: "resource://services-common/utils.js",
  Services: "resource://gre/modules/Services.jsm",
  clearInterval: "resource://gre/modules/Timer.jsm",
  setInterval: "resource://gre/modules/Timer.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  NntpClient: "resource:///modules/NntpClient.jsm",
});

/**
 * A class to represent a NNTP server.
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
    this._newsrcTimer = setInterval(() => this.writeNewsrcFile(), 300000);

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "news";
    this.localDatabaseType = "news";

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
        clearInterval(this._newsrcTimer);
        this.writeNewsrcFile();
    }
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
    this._groups.push(name);
    this._subscribable.addTo(
      name,
      addAsSubscribed,
      subscribale,
      changeIfExists
    );
  }

  subscribe(name) {
    this.subscribeToNewsgroup(name);
  }

  unsubscribe(name) {
    this.rootMsgFolder.propagateDelete(
      this.rootMsgFolder.getChildNamed(name),
      true, // delete storage
      null
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
    // this._tmpSubscribed = new Set(this._subscribed);
    this._tmpSubscribed = new Set();
    this._subscribed.forEach(path => this.setAsSubscribed(path));
  }

  setState(path, state) {
    let changed = this._subscribable.setState(path, state);
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

    value = value.toLowerCase();
    this._searchResult = this._groups
      .filter(name => name.toLowerCase().includes(value))
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
  performExpand(msgWindow) {
    if (!Services.prefs.getBoolPref("news.update_unread_on_expand", false)) {
      return;
    }

    for (let folder of this.rootFolder.subFolders) {
      folder.getNewMessages(msgWindow, null);
    }
  }

  performBiff(msgWindow) {
    this.performExpand(msgWindow);
  }

  closeCachedConnections() {
    for (let client of [...this._idleConnections, ...this._busyConnections]) {
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
      CommonUtils.byteStringToArrayBuffer(name)
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

    let newsFolder = this.rootFolder.QueryInterface(Ci.nsIMsgNewsFolder);
    let lines = [];
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
    let newsFolder = this.rootFolder.QueryInterface(Ci.nsIMsgNewsFolder);
    // Clear password of root folder.
    newsFolder.forgetAuthenticationCredentials();

    // Clear password of all sub folders.
    for (let folder of newsFolder.subFolders) {
      folder.QueryInterface(Ci.nsIMsgNewsFolder);
      folder.forgetAuthenticationCredentials();
    }
  }

  _lineSeparator = AppConstants.platform == "win" ? "\r\n" : "\n";

  /**
   * startPopulating as an async function.
   * @see startPopulating
   */
  async _startPopulating(msgWindow, forceToServer, getOnlyNew) {
    this._msgWindow = msgWindow;
    this._subscribable.startPopulating(msgWindow, forceToServer, getOnlyNew);
    this._groups = [];

    if (!forceToServer) {
      this._hostInfoLoaded = await this._loadHostInfo();
      if (this._hostInfoLoaded) {
        this.stopPopulating(msgWindow);
        return;
      }
    }
    this._hostInfoChanged = true;
    MailServices.nntp.getListOfGroupsOnServer(this, msgWindow, getOnlyNew);
  }

  /**
   * Try to load groups from hostinfo.dat.
   * @returns {boolean} Returns false if hostinfo.dat doesn't exist or doesn't
   * contain any group.
   */
  async _loadHostInfo() {
    this._hostInfoFile = this.localPath;
    this._hostInfoFile.append("hostinfo.dat");
    if (!this._hostInfoFile.exists()) {
      return false;
    }
    let content = await IOUtils.readUTF8(this._hostInfoFile.path);
    let groupLine = false;
    for (let line of content.split(this._lineSeparator)) {
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

    let lines = [
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

  get wrappedJSObject() {
    return this;
  }

  /**
   * Get an idle connection that can be used.
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
      client = new NntpClient(this);
      this._busyConnections.push(client);
      return client;
    }
    // Wait until a connection is available.
    await new Promise(resolve => this._connectionWaitingQueue.push(resolve));
    return this._getNextClient();
  }

  /**
   * Do some actions with a connection.
   * @param {Function} handler - A callback function to take a NntpClient
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

NntpIncomingServer.prototype.classID = Components.ID(
  "{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}"
);
