/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of custom search features.
 *
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

var kCustomId = "xpcomtest@mozilla.org#test";
var kFailingId = "xpcomtest@mozilla.org#failing";

var Tests = [
  {
    customId: kCustomId,
    setValue: "iamgood",
    testValue: "iamnotgood",
    op: Ci.nsMsgSearchOp.Is,
    count: 0,
  },
  {
    customId: kCustomId,
    setValue: "iamgood",
    testValue: "iamgood",
    op: Ci.nsMsgSearchOp.Is,
    count: 1,
  },
  // A custom term that fails must not count as a match, even for a message
  // whose value would otherwise satisfy it.
  {
    customId: kFailingId,
    setValue: "iamgood",
    testValue: "iamgood",
    op: Ci.nsMsgSearchOp.Is,
    count: 0,
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
  getAvailableOperators() {
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

// nsIMsgSearchCustomTerm object whose match() always fails. Note that
// XPConnect zeroes the retval before the call, so the false result comes from
// there rather than from the caller's error handling.
var failingTerm = {
  id: kFailingId,
  name: "failing term name",
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
  getAvailableOperators() {
    return [Ci.nsMsgSearchOp.Is];
  },
  match() {
    throw new Components.Exception("custom term failure", Cr.NS_ERROR_FAILURE);
  },
};

add_task(async function testCustomTermSearch() {
  localAccountUtils.loadLocalMailAccount();
  MailServices.filters.addCustomTerm(customTerm);
  MailServices.filters.addCustomTerm(failingTerm);

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
  const { messageKeys } = await listener.promise;
  const hdr = localAccountUtils.inboxFolder.getMsgHdr(messageKeys[0]);

  for (const test of Tests) {
    hdr.setStringProperty("theTestProperty", test.setValue);
    await MailSearchTestUtils.assertHitCount(
      localAccountUtils.inboxFolder,
      {
        value: test.testValue,
        attrib: Ci.nsMsgSearchAttrib.Custom,
        op: test.op,
        customId: test.customId,
      },
      test.count
    );
  }
});
