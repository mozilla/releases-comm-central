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

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "news";
    this.localDatabaseType = "news";

    // nsISubscribableServer attributes.
    this.supportsSubscribeSearch = true;
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

  getCellProperties(row, col) {
    if (col.id == "subscribedColumn2") {
      // TODO: return "subscribed-true" if subscribed
    }
    if (col.id == "nameColumn2") {
      // Show the news folder icon in the search view.
      return "serverType-nntp";
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

  /** @see nsINntpIncomingServer */
  addNewsgroupToList(name) {
    this.addTo(name, false, true, true);
  }

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
    let separator = AppConstants.platform == "win" ? "\r\n" : "\n";
    for (let line of content.split(separator)) {
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
    let separator = AppConstants.platform == "win" ? "\r\n" : "\n";
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
      lines.join(separator) + separator
    );
  }
}

NntpIncomingServer.prototype.classID = Components.ID(
  "{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}"
);
