/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of Uint32HdrProperty search attribute. Adapted from test_search.js
 */

/* import-globals-from ../../../test/resources/searchTestUtils.js */
load("../../../resources/searchTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var Isnt = Ci.nsMsgSearchOp.Isnt;
var Is = Ci.nsMsgSearchOp.Is;
var IsGreaterThan = Ci.nsMsgSearchOp.IsGreaterThan;
var IsLessThan = Ci.nsMsgSearchOp.IsLessThan;

var Tests = [
  // test a property that does not exist
  {
    hdrProperty: "idonotexist",
    op: Is,
    value: 1,
    count: 0,
  },
  {
    hdrProperty: "idonotexist",
    op: Isnt,
    value: 1,
    count: 1,
  },
  // add a property and test its value
  {
    setup: function setupProperty() {
      for (const msgHdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
        msgHdr.setUint32Property("iam23", 23);
      }
    },
    hdrProperty: "iam23",
    op: Is,
    value: 23,
    count: 1,
  },
  {
    hdrProperty: "iam23",
    op: Isnt,
    value: 23,
    count: 0,
  },
  {
    hdrProperty: "iam23",
    op: Is,
    value: 17,
    count: 0,
  },
  {
    hdrProperty: "iam23",
    op: Isnt,
    value: 17,
    count: 1,
  },
  {
    hdrProperty: "iam23",
    op: IsGreaterThan,
    value: 25,
    count: 0,
  },
  {
    hdrProperty: "iam23",
    op: IsLessThan,
    value: 25,
    count: 1,
  },
  {
    hdrProperty: "iam23",
    op: IsGreaterThan,
    value: 17,
    count: 1,
  },
  {
    hdrProperty: "iam23",
    op: IsLessThan,
    value: 17,
    count: 0,
  },
];

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  var copyListener = {
    OnStartCopy() {},
    OnProgress(aProgress, aProgressMax) {},
    SetMessageKey(aKey) {},
    SetMessageId(aMessageId) {},
    OnStopCopy(aStatus) {
      testSearch();
    },
  };

  // Get a message into the local filestore. function testSearch() continues
  // the testing after the copy.
  var bugmail1 = do_get_file("../../../data/bugmail1");
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

// process each test from queue, calls itself upon completion of each search
function testSearch() {
  var test = Tests.shift();
  if (test) {
    if (test.setup) {
      test.setup();
    }
    new TestSearch(
      localAccountUtils.inboxFolder,
      test.value,
      Ci.nsMsgSearchAttrib.Uint32HdrProperty,
      test.op,
      test.count,
      testSearch,
      null,
      null,
      test.hdrProperty
    );
  } else {
    do_test_finished();
  }
}
