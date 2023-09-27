/**
 * Test bug 460636 - Saving message in local folder as .EML removes starting dot in all lines, and ignores line if single dot only line.
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var MSG_LINEBREAK = "\r\n";
var dot = do_get_file("data/dot");
var saveFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
saveFile.append(dot.leafName + ".eml");
saveFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

// Strip the extra X-Mozilla- headers which are slipped in to messages
// as they are written to local folders. Not exactly robust RFC5322 parsing,
// but enough to handle this test.
function strip_x_moz_headers(s) {
  // List to make sure headers show up when grepping codebase.
  for (const hdr of [
    "X-Mozilla-Status",
    "X-Mozilla-Status2",
    "X-Mozilla-Keys",
  ]) {
    s = s.replace(new RegExp("^" + hdr + ":.*?\r?\n", "gm"), "");
  }
  return s;
}

function run_test() {
  registerCleanupFunction(teardown);
  do_test_pending();
  do_timeout(10000, function () {
    do_throw(
      "SaveMessageToDisk did not complete within 10 seconds" +
        "(incorrect messageURI?). ABORTING."
    );
  });
  copyFileMessageInLocalFolder(dot, 0, "", null, save_message);
}

async function save_message(aMessageHeaderKeys, aStatus) {
  const headerKeys = aMessageHeaderKeys;
  Assert.notEqual(headerKeys, null);

  const message = localAccountUtils.inboxFolder.GetMessageHeader(headerKeys[0]);
  const msgURI = localAccountUtils.inboxFolder.getUriForMsg(message);
  const messageService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=mailbox-message"
  ].getService(Ci.nsIMsgMessageService);
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  messageService.SaveMessageToDisk(
    msgURI,
    saveFile,
    false,
    promiseUrlListener,
    {},
    true,
    null
  );
  await promiseUrlListener.promise;
  let savedMsg = await IOUtils.readUTF8(saveFile.path);
  savedMsg = strip_x_moz_headers(savedMsg);
  check_each_line(await IOUtils.readUTF8(dot.path), savedMsg);
  do_test_finished();
}

function check_each_line(aExpectedLines, aActualLines) {
  const expectedStrings = aExpectedLines.split(MSG_LINEBREAK);
  const actualStrings = aActualLines.split(MSG_LINEBREAK);

  Assert.equal(expectedStrings.length, actualStrings.length);
  for (let line = 0; line < expectedStrings.length; line++) {
    Assert.equal(expectedStrings[line], actualStrings[line]);
  }
}

function teardown() {
  if (saveFile.exists()) {
    saveFile.remove(false);
  }
}
