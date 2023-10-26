/**
 * The intent of this file is to demonstrate a minimal
 * POP3 unit test using the testing file POP3Pump.js
 */
/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];

add_task(async function runPump() {
  // demonstration of access to the local inbox folder
  dump(
    "local inbox folder " + localAccountUtils.inboxFolder.URI + " is loaded\n"
  );
  // demonstration of access to the fake server
  dump("Server " + gPOP3Pump.fakeServer.prettyName + " is loaded\n");

  gPOP3Pump.files = ["../../../data/bugmail1", "../../../data/draft1"];
  await gPOP3Pump.run();

  // get message headers for the inbox folder
  var msgCount = 0;
  for (const hdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
    msgCount++;
    Assert.equal(hdr.subject, testSubjects[msgCount - 1]);
  }
  Assert.equal(msgCount, 2);
  gPOP3Pump = null;
});
