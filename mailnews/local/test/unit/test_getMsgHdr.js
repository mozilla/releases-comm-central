/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that nsIMsgFolder.getMsgHdr() and the nsIMsgDatabase header lookups
 * return null for unknown messages.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_task(async function test_getMsgHdr() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;

    const copyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyFileMessage(
      do_get_file("../../../data/bugmail11"),
      inbox,
      null,
      false,
      0,
      "",
      copyListener,
      false
    );
    const [key] = (await copyListener.promise).messageKeys;

    const msgHdr = inbox.getMsgHdr(key);
    Assert.ok(msgHdr, "The header of an existing message should be returned");
    Assert.equal(msgHdr.messageKey, key, "The header should have the key");

    Assert.equal(
      inbox.getMsgHdr(key + 1000),
      null,
      "No header should be returned for an unknown key"
    );
    Assert.equal(
      inbox.getMsgHdr(0xffffffff),
      null,
      "No header should be returned for nsMsgKey_None"
    );

    const db = inbox.msgDatabase;
    Assert.equal(
      db.getMsgHdrForKey(key),
      msgHdr,
      "The database should return the header for the key"
    );
    Assert.equal(
      db.getMsgHdrForKey(key + 1000),
      null,
      "The database should return no header for an unknown key"
    );
    Assert.equal(
      db.getMsgHdrForMessageID(
        "200804111417.m3BEHTk4030129@mrapp51.mozilla.org"
      ),
      msgHdr,
      "The database should return the header for the Message-ID"
    );
    Assert.equal(
      db.getMsgHdrForMessageID("unknown@example.invalid"),
      null,
      "The database should return no header for an unknown Message-ID"
    );
    Assert.equal(
      db.getMsgHdrForMessageID(""),
      null,
      "The database should return no header for an empty Message-ID"
    );
  } finally {
    localAccountUtils.clearAll();
  }
});
