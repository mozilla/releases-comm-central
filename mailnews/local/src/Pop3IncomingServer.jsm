/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3IncomingServer"];

var { MsgIncomingServer } = ChromeUtils.import(
  "resource:///modules/MsgIncomingServer.jsm"
);

/**
 * @implements {nsIPop3IncomingServer}
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 */
class Pop3IncomingServer extends MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIPop3IncomingServer",
    "nsIMsgIncomingServer",
    "nsISupportsWeakReference",
  ]);

  constructor() {
    super();

    // nsIMsgIncomingServer attributes.
    this.localStoreType = "mailbox";
    this.localDatabaseType = "mailbox";
  }

  /** @see nsIMsgIncomingServer */
  performExpand(msgWindow) {}

  getNewMessages(folder, msgWindow, urlListener) {}
}

Pop3IncomingServer.prototype.classID = Components.ID(
  "{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}"
);
