/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that we do not crash when loading the email bodySearchCrash,
// which was fixed in bug 465805

/* import-globals-from ../../../test/resources/searchTestUtils.js */
load("../../../resources/searchTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var Contains = Ci.nsMsgSearchOp.Contains;
var Body = Ci.nsMsgSearchAttrib.Body;

var Files = [
  "../../../data/bugmail1",
  "../../../data/bodySearchCrash", // Test for bug 465805.
  "../../../data/base64-with-whitespace.eml", // Test for bug 1487421.
];

var Tests = [
  {
    // this number appears in bugmail1
    value: "432710",
    attrib: Body,
    op: Contains,
    count: 1,
  },
  {
    // this appears in base64-with-whitespace.eml
    value: "abcdefghijklmnopqrstuvwxyz",
    attrib: Body,
    op: Contains,
    count: 1,
  },
];

function run_test() {
  // Setup local mail accounts.
  localAccountUtils.loadLocalMailAccount();

  // Get a message into the local filestore. function testBodySearch() continues the testing after the copy.
  do_test_pending();
  copyListener.onStopCopy(null);
  return true;
}

/** @implements {nsIMsgCopyServiceListener} */
var copyListener = {
  onStartCopy() {},
  onProgress() {},
  setMessageKey() {},
  getMessageId() {
    return null;
  },
  onStopCopy() {
    const fileName = Files.shift();
    if (fileName) {
      const file = do_get_file(fileName);
      MailServices.copy.copyFileMessage(
        file,
        localAccountUtils.inboxFolder,
        null,
        false,
        0,
        "",
        copyListener,
        null
      );
    } else {
      testBodySearch();
    }
  },
};

// Runs at completion of copy

// process each test from queue, calls itself upon completion of each search
function testBodySearch() {
  print("Test Body Search");
  var test = Tests.shift();
  if (test) {
    new TestSearch(
      localAccountUtils.inboxFolder,
      test.value,
      test.attrib,
      test.op,
      test.count,
      testBodySearch
    );
  } else {
    do_test_finished();
  }
}
