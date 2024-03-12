/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of custom search features.
 *
 */
/* import-globals-from ../../../test/resources/searchTestUtils.js */
load("../../../resources/searchTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var kCustomId = "xpcomtest@mozilla.org#test";
var gHdr;

var Tests = [
  {
    setValue: "iamgood",
    testValue: "iamnotgood",
    op: Ci.nsMsgSearchOp.Is,
    count: 0,
  },
  {
    setValue: "iamgood",
    testValue: "iamgood",
    op: Ci.nsMsgSearchOp.Is,
    count: 1,
  },
];

// nsIMsgSearchCustomTerm object
var customTerm = {
  id: kCustomId,
  name: "term name",
  getEnabled(scope, op) {
    return (
      scope == Ci.nsMsgSearchScope.offlineMail && op == Ci.nsMsgSearchOp.Is
    );
  },
  getAvailable(scope, op) {
    return (
      scope == Ci.nsMsgSearchScope.offlineMail && op == Ci.nsMsgSearchOp.Is
    );
  },
  getAvailableOperators(scope) {
    return [Ci.nsMsgSearchOp.Is];
  },
  match(msgHdr, searchValue, searchOp) {
    switch (searchOp) {
      case Ci.nsMsgSearchOp.Is:
        if (msgHdr.getStringProperty("theTestProperty") == searchValue) {
          return true;
        }
    }
    return false;
  },
};

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  MailServices.filters.addCustomTerm(customTerm);

  var copyListener = {
    OnStartCopy() {},
    OnProgress(aProgress, aProgressMax) {},
    SetMessageKey(aKey) {
      gHdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    },
    SetMessageId(aMessageId) {},
    OnStopCopy(aStatus) {
      doTest();
    },
  };

  // Get a message into the local filestore.
  // function testSearch() continues the testing after the copy.
  const bugmail1 = do_get_file("../../../data/bugmail1");
  do_test_pending();

  MailServices.copy.copyFileMessage(
    bugmail1,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
}

function doTest() {
  const test = Tests.shift();
  if (test) {
    gHdr.setStringProperty("theTestProperty", test.setValue);
    new TestSearch(
      localAccountUtils.inboxFolder,
      test.testValue,
      Ci.nsMsgSearchAttrib.Custom,
      test.op,
      test.count,
      doTest,
      kCustomId
    );
  } else {
    gHdr = null;
    do_test_finished();
  }
}
