/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
const { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

let daemon;
let server;
let incomingServer;
let folder;
const literalSizes = [];
const appendedMessages = [];

add_setup(async function () {
  daemon = new ImapDaemon();
  server = makeServer(daemon, "RFC4315", {
    onError(tag, line) {
      const match = /^APPEND\b.*\{(\d+)\+?\}$/i.exec(line);
      if (match) {
        literalSizes.push(Number(match[1]));
      }
      return IMAP_RFC3501_handler.prototype.onError.call(this, tag, line);
    },
    APPEND(args) {
      const message = args.at(-1);
      if (/\r(?!\n)|(?<!\r)\n/.test(message)) {
        return "NO Message contains bare newlines";
      }
      appendedMessages.push(message);
      const response = IMAP_RFC4315_extension.APPEND.call(this, args);
      if (response.startsWith("OK")) {
        // The base handler's encodeURI leaves '#' unescaped in its data URL.
        const mailbox = this._daemon.getMailbox(args[0]);
        mailbox._messages.at(-1)._URI =
          "data:text/plain;base64," + btoa(message);
      }
      return response;
    },
  });
  registerCleanupFunction(() => server.stop());
  incomingServer = createLocalIMAPServer(server.port);
  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
  });

  const folderAdded = PromiseTestUtils.promiseFolderAdded("Imports");
  incomingServer.rootFolder.createSubfolder("Imports", null);
  folder = (await folderAdded).QueryInterface(Ci.nsIMsgImapMailFolder);
  folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
});

/**
 * Hash message bytes without decoding their character set.
 *
 * @param {string} message - The message as a byte string.
 * @returns {string} The base64-encoded SHA-256 digest.
 */
function hashMessage(message) {
  const hash = Cc["@mozilla.org/security/hash;1"].createInstance(
    Ci.nsICryptoHash
  );
  hash.init(Ci.nsICryptoHash.SHA256);
  const bytes = MailStringUtils.byteStringToUint8Array(message);
  hash.update(bytes, bytes.length);
  return hash.finish(true);
}

add_task(async function test_importBugFixtures() {
  // Original attachment 385175 from bug 500479. The expected digest covers
  // CRLF conversion.
  const fixtures = [
    {
      name: "bug500479-bare-newlines.eml",
      messageId: "45CF585D.1030400@nospam.xyz",
      size: 1239,
      digest: "m98il1E3t+yrmiOsz9Ttf8CmB2BRlw5FthsI8BiVzB4=",
    },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    info(`Importing original bug fixture ${fixture.name}`);
    const source = do_get_file(`data/${fixture.name}`);
    const original = MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(source.path)
    );
    await MailUtils.copyFileMessageAsync(source, folder, null);

    Assert.equal(
      appendedMessages.length,
      index + 1,
      "The strict server should accept exactly one APPEND per fixture"
    );
    Assert.equal(
      literalSizes.at(-1),
      fixture.size,
      "APPEND should advertise the prepared message size"
    );
    const appended = appendedMessages.at(-1);
    Assert.equal(
      appended.length,
      fixture.size,
      "The literal should have the advertised size"
    );
    Assert.equal(
      hashMessage(appended),
      fixture.digest,
      "The APPEND literal should contain exactly the expected message bytes"
    );
    const mailbox = daemon.getMailbox("Imports");
    Assert.equal(
      mailbox._messages.at(-1).getText(),
      appended,
      "The destination mailbox should store the complete APPEND literal"
    );

    await MailUtils.updateFolderAsync(folder);
    Assert.equal(
      folder.getTotalMessages(false),
      index + 1,
      "The folder should contain every imported message"
    );
    const header = [...folder.msgDatabase.enumerateMessages()].find(
      msgHdr => msgHdr.messageId === fixture.messageId
    );
    Assert.ok(
      header,
      "The imported message should have its original Message-ID"
    );
    const uri = folder.getUriForMsg(header);
    const listener = new PromiseTestUtils.PromiseStreamListener();
    MailServices.messageServiceFromURI(uri).streamMessage(
      uri,
      listener,
      null,
      null,
      false,
      "",
      false
    );
    const downloaded = await listener.promise;
    Assert.equal(
      hashMessage(downloaded),
      fixture.digest,
      "Reading the imported message should preserve the prepared bytes"
    );
    const unchanged = MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(source.path)
    );
    Assert.equal(
      unchanged,
      original,
      "The original bug fixture should remain unchanged"
    );
  }
});
