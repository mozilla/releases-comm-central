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

    this._groups = [];

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "news";
    this.localDatabaseType = "news";
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
    this._msgWindow = msgWindow;
    this._subscribable.startPopulating(msgWindow, forceToServer, getOnlyNew);
    MailServices.nntp.getListOfGroupsOnServer(this, msgWindow, getOnlyNew);
  }

  stopPopulating(msgWindow) {
    this._subscribable.stopPopulating(msgWindow);
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

  /** @see nsIUrlListener */
  OnStartRunningUrl() {}

  OnStopRunningUrl() {
    this.stopPopulating(this._msgWindow);
  }

  /** @see nsINntpIncomingServer */
  addNewsgroupToList(name) {
    this.addTo(name, false, true, true);
  }
}

NntpIncomingServer.prototype.classID = Components.ID(
  "{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}"
);
