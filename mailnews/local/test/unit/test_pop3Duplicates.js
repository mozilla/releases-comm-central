/**
 * The intent of this file is to test duplicate handling options
 * in the pop3 download code.
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];

function run_test() {
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
  gPOP3Pump.onDone = continueTest;
  do_test_pending();
  gPOP3Pump.run();
}

function continueTest() {
  // get message headers for the inbox folder
  var msgCount = 0;
  for (const hdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
    Assert.equal(hdr.subject, testSubjects[msgCount++]);
  }
  Assert.equal(msgCount, 2);
  gPOP3Pump = null;
  do_test_finished();
}
