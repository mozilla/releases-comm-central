/**
 * The intent of this file is to test temp file handling when
 * downloading multiple pop3 messages with quarantining turned on.
 *
 * Original author: David Bienvenu <dbienvenu@mozilla.com>
 */

const { POP3Pump } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/POP3Pump.sys.mjs"
);
var gPOP3Pump = new POP3Pump();

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];

add_task(async function testTempFileHandling() {
  Services.prefs.setBoolPref("mailnews.downloadToTempFile", true);
  const expectedFiles = createExpectedTemporaryFiles(2);
  // add 2 messages
  gPOP3Pump.files = ["../../../data/bugmail1", "../../../data/draft1"];
  await gPOP3Pump.run();

  dump("temp file path = " + expectedFiles[0].path + "\n");
  dump("temp file path = " + expectedFiles[1].path + "\n");
  for (const expectedFile of expectedFiles) {
    Assert.ok(!expectedFile.exists());
  }

  // get message headers for the inbox folder
  var msgCount = 0;
  for (const hdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
    Assert.equal(hdr.subject, testSubjects[msgCount++]);
  }
  Assert.equal(msgCount, 2);
  gPOP3Pump = null;
});

function createExpectedTemporaryFiles(numFiles) {
  function createTemporaryFile() {
    const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
    file.append("newmsg");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    return file;
  }

  const expectedFiles = [];
  for (let i = 0; i < numFiles; i++) {
    expectedFiles.push(createTemporaryFile());
  }

  for (const expectedFile of expectedFiles) {
    expectedFile.remove(false);
  }

  return expectedFiles;
}
