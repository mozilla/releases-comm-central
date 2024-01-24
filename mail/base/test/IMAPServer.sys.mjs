/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import * as ImapD from "resource://testing-common/mailnews/Imapd.sys.mjs";

const { IMAP_RFC3501_handler, ImapDaemon, ImapMessage, mixinExtension } = ImapD;
import { nsMailServer } from "resource://testing-common/mailnews/Maild.sys.mjs";

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

/**
 * A simple IMAP server for testing purposes.
 */
export class IMAPServer {
  constructor(testScope, options = {}) {
    this.testScope = testScope;
    this.options = options;
    this.open(options.extensions);
  }

  open(extensions = []) {
    if (!this.daemon) {
      this.daemon = new ImapDaemon();
    }
    this.server = new nsMailServer(daemon => {
      const handler = new IMAP_RFC3501_handler(daemon, this.options);
      if (this.options.offerStartTLS) {
        // List startTLS as a capability, even though we don't support it.
        handler.kCapabilities.push("STARTTLS");
      }
      for (const ext of extensions) {
        mixinExtension(handler, ImapD[`IMAP_${ext}_extension`]);
      }
      return handler;
    }, this.daemon);
    this.server.tlsCert = this.options.tlsCert;
    this.server.start();
    dump(`IMAP server at localhost:${this.server.port} opened\n`);

    this.testScope.registerCleanupFunction(() => {
      this.close();
      dump(`IMAP server at localhost:${this.server.port} closed\n`);
    });
  }

  close() {
    this.server.stop();
  }

  get port() {
    return this.server.port;
  }

  /**
   * @param {nsIMsgFolder} folder
   * @param {SyntheticMessage[]} messages
   * @param {boolean} [update=true] - Whether the client should update the
   *   folder immediately
   * @returns {Promise} - Resolves immediately if `update` is false, otherwise
   *   resolves when `folder` has been updated
   */
  addMessages(folder, messages, update = true) {
    const fakeFolder = this.daemon.getMailbox(folder.name);
    messages.forEach(message => {
      if (typeof message != "string") {
        message = message.toMessageString();
      }

      const imapMsg = new ImapMessage(
        "data:text/plain;base64," + btoa(message),
        fakeFolder.uidnext++,
        []
      );
      fakeFolder.addMessage(imapMsg);
    });

    if (update) {
      return new Promise(resolve =>
        mailTestUtils.updateFolderAndNotify(folder, resolve)
      );
    }
    return Promise.resolve();
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
    super.open(["GMAIL", "RFC2197", "RFC2342", "RFC3348", "RFC4315"]);
  }
}

/**
 * A simple IMAP server, with RFC2087 extension, for testing purposes.
 */
export class QuotaServer extends IMAPServer {
  open() {
    super.open(["RFC2087"]);
  }

  setQuota(folder, name, usage, limit) {
    const mailbox = this.daemon.getMailbox(folder.name);
    mailbox.quota = mailbox.quota ?? {};
    if (limit) {
      mailbox.quota[name] = { usage, limit };
    } else {
      delete mailbox.quota[name];
    }
  }
}
