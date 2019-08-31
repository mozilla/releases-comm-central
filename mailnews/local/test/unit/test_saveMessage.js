/*
 * Test bug 460636 - Saving message in local folder as .EML removes starting dot in all lines, and ignores line if single dot only line.
 */

var { IOUtils } = ChromeUtils.import("resource:///modules/IOUtils.js");

var MSG_LINEBREAK = "\r\n";
var dot = do_get_file("data/dot");
var saveFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
saveFile.append(dot.leafName + ".eml");
saveFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

function run_test() {
  registerCleanupFunction(teardown);
  do_test_pending();
  do_timeout(10000, function() {
    do_throw(
      "SaveMessageToDisk did not complete within 10 seconds" +
        "(incorrect messageURI?). ABORTING."
    );
  });
  copyFileMessageInLocalFolder(dot, 0, "", null, save_message);
}

function save_message(aMessageHeaderKeys, aStatus) {
  let headerKeys = aMessageHeaderKeys;
  Assert.notEqual(headerKeys, null);

  let message = localAccountUtils.inboxFolder.GetMessageHeader(headerKeys[0]);
  let msgURI = localAccountUtils.inboxFolder.getUriForMsg(message);
  let messageService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=mailbox-message"
  ].getService(Ci.nsIMsgMessageService);
  messageService.SaveMessageToDisk(
    msgURI,
    saveFile,
    false,
    UrlListener,
    {},
    true,
    null
  );
}

function check_each_line(aExpectedLines, aActualLines) {
  let expectedStrings = aExpectedLines.split(MSG_LINEBREAK);
  let actualStrings = aActualLines.split(MSG_LINEBREAK);

  expectedStrings.shift();
  Assert.equal(expectedStrings.length, actualStrings.length);
  for (let line = 0; line < expectedStrings.length; line++) {
    Assert.equal(expectedStrings[line], actualStrings[line]);
  }
}

var UrlListener = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    Assert.equal(aExitCode, 0);
    check_each_line(
      IOUtils.loadFileToString(dot),
      IOUtils.loadFileToString(saveFile)
    );
    do_test_finished();
  },
};

function teardown() {
  if (saveFile.exists()) {
    saveFile.remove(false);
  }
}
