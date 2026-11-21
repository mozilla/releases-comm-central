/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of Uint32HdrProperty search attribute. Adapted from test_search.js
 */

const { MailSearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailSearchTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

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

add_task(async function testUint32HdrPropertySearch() {
  localAccountUtils.loadLocalMailAccount();

  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    do_get_file("../../../data/bugmail1"),
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    listener,
    null
  );
  await listener.promise;

  for (const test of Tests) {
    test.setup?.();
    await MailSearchTestUtils.assertHitCount(
      localAccountUtils.inboxFolder,
      {
        value: test.value,
        attrib: Ci.nsMsgSearchAttrib.Uint32HdrProperty,
        op: test.op,
        hdrProperty: test.hdrProperty,
      },
      test.count
    );
  }
});
