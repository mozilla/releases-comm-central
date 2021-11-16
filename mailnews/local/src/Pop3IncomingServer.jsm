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
  }

  /** @see nsIMsgIncomingServer */
  performExpand(msgWindow) {}

  getNewMessages(folder, msgWindow, urlListener) {
    let inbox = this.rootMsgFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Inbox
    );
    return MailServices.pop3.GetNewMail(msgWindow, urlListener, inbox, this);
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
}

Pop3IncomingServer.prototype.classID = Components.ID(
  "{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}"
);
