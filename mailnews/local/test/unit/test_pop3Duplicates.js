/**
 * The intent of this file is to test duplicate handling options
 * in the pop3 download code.
 */

const { POP3Pump } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/POP3Pump.sys.mjs"
);
var gPOP3Pump = new POP3Pump();

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];

add_task(async function testDeleteDuplicates() {
  // Set duplicate action to be delete duplicates.
  Services.prefs.setIntPref(
    "mail.server.default.dup_action",
    Ci.nsIMsgIncomingServer.deleteDups
  );
  // add 3 messages, 2 of which are duplicates.
  gPOP3Pump.files = [
    "../../../data/bugmail1",
    "../../../data/draft1",
    "../../../data/bugmail1",
  ];
  await gPOP3Pump.run();

  // get message headers for the inbox folder
  var msgCount = 0;
  for (const hdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
    Assert.equal(hdr.subject, testSubjects[msgCount++]);
  }
  Assert.equal(msgCount, 2);
  gPOP3Pump = null;
});
