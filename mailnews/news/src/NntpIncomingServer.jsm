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
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
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

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "news";
    this.localDatabaseType = "news";

    // nsISubscribableServer attributes.
    this.supportsSubscribeSearch = true;

    // nsINntpIncomingServer attributes.
    this.newsrcHasChanged = false;
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

  /** @see nsINntpIncomingServer */
  get newsrcFilePath() {
    if (!this._newsrcFilePath) {
      this._newsrcFilePath = this.getFileValue(
        "newsrc.file-rel",
        "newsrc.file"
      );
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
    return this.rootMsgFolder.findSubFolder(name);
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
        this.addNewsgroupToList(line);
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
}

NntpIncomingServer.prototype.classID = Components.ID(
  "{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}"
);
