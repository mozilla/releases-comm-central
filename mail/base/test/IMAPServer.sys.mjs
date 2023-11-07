/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  IMAP_GMAIL_extension,
  IMAP_RFC2197_extension,
  IMAP_RFC2342_extension,
  IMAP_RFC3348_extension,
  IMAP_RFC3501_handler,
  IMAP_RFC4315_extension,
  ImapDaemon,
  ImapMessage,
  mixinExtension,
} = ChromeUtils.import("resource://testing-common/mailnews/Imapd.jsm");
const { nsMailServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);
const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

/**
 * A simple IMAP server for testing purposes.
 */
export class IMAPServer {
  constructor(testScope, username) {
    this.testScope = testScope;
    this.username = username;
    this.open();
  }

  open() {
    this.daemon = new ImapDaemon();
    this.server = new nsMailServer(
      daemon => new IMAP_RFC3501_handler(daemon, { username: this.username }),
      this.daemon
    );
    this.server.start();

    this.testScope.registerCleanupFunction(() => this.close());
  }

  close() {
    this.server.stop();
  }

  get port() {
    return this.server.port;
  }

  /**
   * @param {string} group
   * @param {SyntheticMessage[]} messages
   */
  addMessages(folder, messages) {
    const fakeFolder = this.daemon.getMailbox(folder.name);
    messages.forEach(message => {
      if (typeof message != "string") {
        message = message.toMessageString();
      }
      const msgURI = Services.io.newURI(
        "data:text/plain;base64," + btoa(message)
      );
      const imapMsg = new ImapMessage(msgURI.spec, fakeFolder.uidnext++, []);
      fakeFolder.addMessage(imapMsg);
    });

    return new Promise(resolve =>
      mailTestUtils.updateFolderAndNotify(folder, resolve)
    );
  }
}

/**
 * A simple IMAP server, with Gmail extensions and default folders, for
 * testing purposes.
 */
export class GmailServer extends IMAPServer {
  open() {
    this.daemon = new ImapDaemon();
    this.daemon.getMailbox("INBOX").specialUseFlag = "\\Inbox";
    this.daemon.getMailbox("INBOX").subscribed = true;
    this.daemon.createMailbox("Trash", {
      flags: ["\\Trash"],
      subscribed: true,
    });
    this.daemon.createMailbox("[Gmail]", {
      flags: ["\\NoSelect"],
      subscribed: true,
    });
    this.daemon.createMailbox("[Gmail]/All Mail", {
      flags: ["\\Archive"],
      subscribed: true,
      specialUseFlag: "\\AllMail",
    });
    this.server = new nsMailServer(daemon => {
      const handler = new IMAP_RFC3501_handler(daemon);
      mixinExtension(handler, IMAP_GMAIL_extension);
      mixinExtension(handler, IMAP_RFC2197_extension);
      mixinExtension(handler, IMAP_RFC2342_extension);
      mixinExtension(handler, IMAP_RFC3348_extension);
      mixinExtension(handler, IMAP_RFC4315_extension);
      return handler;
    }, this.daemon);
    this.server.start();

    this.testScope.registerCleanupFunction(() => this.close());
  }
}
