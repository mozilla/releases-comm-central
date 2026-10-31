/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that copyFileMessage() doesn't take the FeedMsg flag from an
 * X-Mozilla-Status header in the file, but still honours it when the caller
 * asks for it.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const MESSAGE =
  "X-Mozilla-Status: 0040\r\n" +
  "X-Mozilla-Status2: 00000000\r\n" +
  "From: sender@invalid\r\n" +
  "To: recipient@invalid\r\n" +
  "Subject: Not a feed\r\n" +
  "Date: Wed, 28 Oct 2026 12:00:00 +0000\r\n" +
  "Message-ID: <not-a-feed@invalid>\r\n" +
  "Content-Type: text/plain; charset=UTF-8\r\n" +
  "\r\n" +
  "Hello\r\n";

let msgFile;

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();
  const path = PathUtils.join(PathUtils.tempDir, "feedflag.eml");
  await IOUtils.writeUTF8(path, MESSAGE);
  msgFile = await IOUtils.getFile(path);
  registerCleanupFunction(() => IOUtils.remove(path));
});

async function copyFile(flags) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    msgFile,
    localAccountUtils.inboxFolder,
    null,
    false,
    flags,
    "",
    copyListener,
    false
  );
  const { messageKeys } = await copyListener.promise;
  return localAccountUtils.inboxFolder.getMsgHdr(messageKeys[0]);
}

// The file says FeedMsg (X-Mozilla-Status: 0040) but the caller doesn't, so
// the message should not be treated as a feed.
add_task(async function test_feedFlagFromFileIgnored() {
  const hdr = await copyFile(Ci.nsMsgMessageFlags.Read);
  Assert.ok(
    !(hdr.flags & Ci.nsMsgMessageFlags.FeedMsg),
    "FeedMsg flag from the file should not be set"
  );
  Assert.ok(
    hdr.flags & Ci.nsMsgMessageFlags.Read,
    "Read flag passed by the caller should be set"
  );
});

// Same file, but this time the caller explicitly asks for FeedMsg.
add_task(async function test_feedFlagFromCallerKept() {
  const hdr = await copyFile(Ci.nsMsgMessageFlags.FeedMsg);
  Assert.ok(
    hdr.flags & Ci.nsMsgMessageFlags.FeedMsg,
    "FeedMsg flag passed by the caller should be set"
  );
});
