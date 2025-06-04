/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/**
 * Test bug 460636 - Saving message in local folder as .EML removes starting
 * dot in all lines, and ignores line if single dot only line.
 */
add_task(async function test_saveMessage() {
  localAccountUtils.loadLocalMailAccount();

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
    const msgUri = inbox.getUriForMsg(msgHdr);
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    messageService.saveMessageToDisk(
      msgUri,
      savedFile,
      false,
      promiseUrlListener,
      true,
      null
    );
    await promiseUrlListener.promise;

    // Check output against the original message, accounting for added
    // X-Mozilla-* headers.
    let got = await IOUtils.readUTF8(savedFile.path);
    got = strip_x_moz_headers(got);
    const expect = await IOUtils.readUTF8(inFile.path);
    Assert.equal(got, expect, "Saved message should match original");
  } finally {
    // Clean up.
    localAccountUtils.clearAll();
    if (savedFile.exists()) {
      savedFile.remove(false);
    }
  }
});
