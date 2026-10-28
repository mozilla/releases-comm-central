/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that nsIMsgFolder.getMsgHdr() returns null for unknown keys.
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
      null
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
  } finally {
    localAccountUtils.clearAll();
  }
});
