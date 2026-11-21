/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Testing of search by junk percent and junk score origin

const { MailSearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailSearchTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var IsGreaterThan = Ci.nsMsgSearchOp.IsGreaterThan;
var IsLessThan = Ci.nsMsgSearchOp.IsLessThan;
var Is = Ci.nsMsgSearchOp.Is;
var Isnt = Ci.nsMsgSearchOp.Isnt;
var IsEmpty = Ci.nsMsgSearchOp.IsEmpty;
var IsntEmpty = Ci.nsMsgSearchOp.IsntEmpty;

var offlineMail = Ci.nsMsgSearchScope.offlineMail;

var JunkScoreOrigin = Ci.nsMsgSearchAttrib.JunkScoreOrigin;
var JunkPercent = Ci.nsMsgSearchAttrib.JunkPercent;
var JunkStatus = Ci.nsMsgSearchAttrib.JunkStatus;

var fileName = "../../../data/bugmail1";

/*
 * The search for junkpercent is defined as the effective value,
 * while the "junkpercent" database term is always the result
 * from the bayes filter. This is optimized to make views that
 * rely on junk percent search work with the best value for junk
 * percent, while allowing junk percent from the bayes filter
 * to be saved for analysis.
 *
 * This means that the search for "junk percent" only uses the
 * database junkpercent value if junkscoreorigin is "plugin".
 * Otherwise, it uses junkstatus (if set) or defaults to 0
 * (not junk) if the message is unclassified.
 */

var Tests = [
  {
    // test empty junk status
    junkScore: false,
    testValue: 90,
    attrib: JunkStatus,
    op: IsEmpty,
    count: 1,
  },
  {
    junkScore: false,
    testValue: 90,
    attrib: JunkStatus,
    op: IsntEmpty,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkStatus,
    op: IsntEmpty,
    count: 1,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkStatus,
    op: IsEmpty,
    count: 0,
  },
  {
    junkScore: "100",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkStatus,
    op: IsntEmpty,
    count: 1,
  },
  {
    junkScore: "100",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkStatus,
    op: IsEmpty,
    count: 0,
  },
  {
    // Use junkpercent from database
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkPercent,
    op: IsGreaterThan,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkPercent,
    op: IsLessThan,
    count: 1,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 90,
    attrib: JunkPercent,
    op: Is,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "90",
    testValue: 10,
    attrib: JunkPercent,
    op: IsGreaterThan,
    count: 1,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "90",
    testValue: 10,
    attrib: JunkPercent,
    op: IsLessThan,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "10",
    testValue: 10,
    attrib: JunkPercent,
    op: Is,
    count: 1,
  },
  {
    // values set by user, use junkscore not junkpercent
    junkScore: "0",
    junkScoreOrigin: "user",
    junkPercent: "90",
    testValue: 50,
    attrib: JunkPercent,
    op: IsGreaterThan,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "user",
    junkPercent: "90",
    testValue: 50,
    attrib: JunkPercent,
    op: IsLessThan,
    count: 1,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "user",
    junkPercent: "90",
    testValue: 50,
    attrib: JunkPercent,
    op: Is,
    count: 0,
  },
  {
    junkScore: "100",
    junkScoreOrigin: "user",
    junkPercent: "10",
    testValue: 50,
    attrib: JunkPercent,
    op: IsGreaterThan,
    count: 1,
  },
  {
    junkScore: "100",
    junkScoreOrigin: "user",
    junkPercent: "10",
    testValue: 50,
    attrib: JunkPercent,
    op: IsLessThan,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "user",
    junkPercent: "90",
    testValue: 0,
    attrib: JunkPercent,
    op: Is,
    count: 1,
  },
  {
    // default to 0 when nothing set
    junkScore: "",
    junkScoreOrigin: "",
    junkPercent: "",
    testValue: 0,
    attrib: JunkPercent,
    op: Is,
    count: 1,
  },
  {
    // junkscoreorigin search tests
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "50",
    testValue: "plugin",
    attrib: JunkScoreOrigin,
    op: Is,
    count: 1,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "plugin",
    junkPercent: "50",
    testValue: "plugin",
    attrib: JunkScoreOrigin,
    op: Isnt,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "filter",
    junkPercent: "50",
    testValue: "plugin",
    attrib: JunkScoreOrigin,
    op: Is,
    count: 0,
  },
  {
    junkScore: "0",
    junkScoreOrigin: "filter",
    junkPercent: "50",
    testValue: "plugin",
    attrib: JunkScoreOrigin,
    op: Isnt,
    count: 1,
  },
];

add_task(async function testJunkSearch() {
  localAccountUtils.loadLocalMailAccount();

  // test that validity table terms are valid

  // offline mail table
  MailSearchTestUtils.assertValidity(offlineMail, Is, JunkPercent, true);
  MailSearchTestUtils.assertValidity(offlineMail, Isnt, JunkPercent, false);
  MailSearchTestUtils.assertValidity(
    offlineMail,
    IsGreaterThan,
    JunkPercent,
    true
  );
  MailSearchTestUtils.assertValidity(
    offlineMail,
    IsLessThan,
    JunkPercent,
    true
  );

  MailSearchTestUtils.assertValidity(offlineMail, Is, JunkScoreOrigin, true);
  MailSearchTestUtils.assertValidity(offlineMail, Isnt, JunkScoreOrigin, true);
  MailSearchTestUtils.assertValidity(
    offlineMail,
    IsGreaterThan,
    JunkScoreOrigin,
    false
  );
  MailSearchTestUtils.assertValidity(
    offlineMail,
    IsLessThan,
    JunkScoreOrigin,
    false
  );

  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    do_get_file(fileName),
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
    if (test.junkScore) {
      hdr.setStringProperty("junkpercent", test.junkPercent);
      hdr.setStringProperty("junkscoreorigin", test.junkScoreOrigin);
      hdr.setStringProperty("junkscore", test.junkScore);
    }
    await MailSearchTestUtils.assertHitCount(
      localAccountUtils.inboxFolder,
      { value: test.testValue, attrib: test.attrib, op: test.op },
      test.count
    );
  }
});
