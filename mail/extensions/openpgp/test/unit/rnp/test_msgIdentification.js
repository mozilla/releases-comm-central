/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that message identities used by the OpenPGP decryption cache
 * distinguish messages from different servers.
 */

"use strict";

const { EnigmailURIs } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/uris.sys.mjs"
);
const { EnigmailSingletons } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/singletons.sys.mjs"
);

function getId(spec) {
  return EnigmailURIs.msgIdentificationFromUrl(Services.io.newURI(spec));
}

function sameMessage(spec1, spec2) {
  const id1 = getId(spec1);
  const id2 = getId(spec2);
  return id1.folder === id2.folder && id1.msgNum === id2.msgNum;
}

add_task(function testImap() {
  const a = "imap://userA@127.0.0.1:1143/fetch%3EUID%3E/INBOX%3E41";

  Assert.equal(getId(a).msgNum, "41", "IMAP UID should be the msgNum");
  Assert.ok(
    sameMessage(a, `${a}?header=filter&emitter=js&examineEncryptedParts=true`),
    "the same IMAP message with a query should have the same identity"
  );
  Assert.ok(
    !sameMessage(a, "imap://userB@127.0.0.1:1143/fetch%3EUID%3E/INBOX%3E41"),
    "IMAP messages of different users should have different identities"
  );
  Assert.ok(
    !sameMessage(a, "imap://userA@127.0.0.1:2143/fetch%3EUID%3E/INBOX%3E41"),
    "IMAP messages on different ports should have different identities"
  );
  Assert.ok(
    !sameMessage(a, "imap://userA@127.0.0.2:1143/fetch%3EUID%3E/INBOX%3E41"),
    "IMAP messages on different hosts should have different identities"
  );
  Assert.ok(
    !sameMessage(a, "imap://userA@127.0.0.1:1143/fetch%3EUID%3E/INBOX%3E42"),
    "IMAP messages with different UIDs should have different identities"
  );
  Assert.ok(
    !sameMessage(a, "imap://userA@127.0.0.1:1143/fetch%3EUID%3E/Archive%3E41"),
    "IMAP messages in different folders should have different identities"
  );
});

add_task(function testNews() {
  const a = "news://news.example.org/msg?group=test.group&key=3510";

  Assert.equal(getId(a).msgNum, "3510", "news key should be the msgNum");
  Assert.ok(
    sameMessage(a, `${a}&header=filter`),
    "the same news message with a query should have the same identity"
  );
  Assert.ok(
    !sameMessage(a, "news://news.example.com/msg?group=test.group&key=3510"),
    "news messages on different servers should have different identities"
  );
});

add_task(function testMailbox() {
  const a = "mailbox:///home/user/profile/Mail/Local%20Folders/Inbox?number=41";

  Assert.ok(
    sameMessage(a, `${a}&part=1.1&filename=test.eml`),
    "the same local message with a query should have the same identity"
  );
  Assert.ok(
    !sameMessage(
      a,
      "mailbox:///home/user/profile/Mail/pop.example.com/Inbox?number=41"
    ),
    "local messages in different folders should have different identities"
  );
});

add_task(function testLastDecryptedMessagePart() {
  EnigmailSingletons.clearLastDecryptedMessage();
  EnigmailSingletons.lastDecryptedMessage.lastMessageURI = getId(
    "imap://userA@127.0.0.1:1143/fetch%3EUID%3E/INBOX%3E41"
  );
  EnigmailSingletons.lastDecryptedMessage.mimePartNumber = "1";

  const idA = getId("imap://userA@127.0.0.1:1143/fetch%3EUID%3E/INBOX%3E41");
  const idB = getId("imap://userB@127.0.0.1:2143/fetch%3EUID%3E/INBOX%3E41");
  Assert.ok(
    EnigmailSingletons.isLastDecryptedMessagePart(idA.folder, idA.msgNum, "1"),
    "the decrypted message should be recognized as the last one"
  );
  Assert.ok(
    !EnigmailSingletons.isLastDecryptedMessagePart(idB.folder, idB.msgNum, "1"),
    "a message from another account should not be recognized as the last one"
  );
  EnigmailSingletons.clearLastDecryptedMessage();
});
