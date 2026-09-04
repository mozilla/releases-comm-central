/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

async function saveMessageFromStore(storeID) {
  localAccountUtils.loadLocalMailAccount(storeID);

  const messageService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=mailbox-message"
  ].getService(Ci.nsIMsgMessageService);

  const inFile = do_get_file("data/dot");
  const savedFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  savedFile.append(inFile.leafName + ".eml");
  savedFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  // Not exactly robust RFC5322 parsing, but good enough here.
  const strip_x_moz_headers = function (s) {
    for (const hdr of [
      "X-Mozilla-Status",
      "X-Mozilla-Status2",
      "X-Mozilla-Keys",
    ]) {
      s = s.replace(new RegExp("^" + hdr + ":.*?\r?\n", "gm"), "");
    }
    return s;
  };

  try {
    const inbox = localAccountUtils.inboxFolder;

    // Install a message.
    const copyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyFileMessage(
      inFile,
      inbox,
      null,
      false,
      0,
      "",
      copyListener,
      null
    );
    const copied = await copyListener.promise;

    // Save it out.
    const msgHdr = inbox.GetMessageHeader(copied.messageKeys[0]);
    const storedStream = inbox.getMsgInputStream(msgHdr);
    const storedMessage = NetUtil.readInputStreamToString(
      storedStream,
      storedStream.available()
    );
    storedStream.close();
    const msgUri = inbox.getUriForMsg(msgHdr);
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    messageService.saveMessageToDisk(
      msgUri,
      savedFile,
      promiseUrlListener,
      true,
      null
    );
    await promiseUrlListener.promise;

    const savedMessage = await IOUtils.readUTF8(savedFile.path);
    Assert.equal(
      normalizeLineEndings(savedMessage),
      normalizeLineEndings(storedMessage),
      "Saving should preserve the complete message-store stream apart from line endings"
    );

    Assert.equal(
      strip_x_moz_headers(savedMessage),
      await IOUtils.readUTF8(inFile.path),
      "Saved message should match original apart from added X-Mozilla-* headers"
    );
  } finally {
    // Clean up.
    localAccountUtils.clearAll();
    if (savedFile.exists()) {
      savedFile.remove(false);
    }
  }
}

/**
 * Test bug 460636 - Saving message in local folder as .EML removes starting
 * dot in all lines, and ignores line if single dot only line.
 * Also ensure that saving does not remove the first line of a message.
 */
add_task(async function test_saveMessage_mbox() {
  await saveMessageFromStore("@mozilla.org/msgstore/berkeleystore;1");
});

add_task(async function test_saveMessage_maildir() {
  await saveMessageFromStore("@mozilla.org/msgstore/maildirstore;1");
});
