/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of general mail search features.
 *
 * This tests some search attributes not tested by other specific tests,
 * e.g., test_searchTag.js or test_searchJunk.js
 */
/* import-globals-from ../../../test/resources/searchTestUtils.js */
load("../../../resources/searchTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var Isnt = Ci.nsMsgSearchOp.Isnt;
var Is = Ci.nsMsgSearchOp.Is;
var Contains = Ci.nsMsgSearchOp.Contains;
var DoesntContain = Ci.nsMsgSearchOp.DoesntContain;
var BeginsWith = Ci.nsMsgSearchOp.BeginsWith;
var EndsWith = Ci.nsMsgSearchOp.EndsWith;
var IsBefore = Ci.nsMsgSearchOp.IsBefore; // control entry not enabled
var IsAfter = Ci.nsMsgSearchOp.IsAfter;
var IsHigherThan = Ci.nsMsgSearchOp.IsHigherThan;
var IsLowerThan = Ci.nsMsgSearchOp.IsLowerThan;

var OtherHeader = Ci.nsMsgSearchAttrib.OtherHeader;
var From = Ci.nsMsgSearchAttrib.Sender;
var Subject = Ci.nsMsgSearchAttrib.Subject;
var Priority = Ci.nsMsgSearchAttrib.Priority;
var SDate = Ci.nsMsgSearchAttrib.Date;

var Tests = [
  // test the To: header
  {
    testString: "PrimaryEmail1@test.invalid",
    testAttribute: From,
    op: Is,
    count: 1,
  },
  {
    testString: "PrimaryEmail1@test.invalid",
    testAttribute: From,
    op: Isnt,
    count: 0,
  },
  {
    testString: "PrimaryEmail",
    testAttribute: From,
    op: BeginsWith,
    count: 1,
  },
  {
    testString: "invalid",
    testAttribute: From,
    op: BeginsWith,
    count: 0,
  },
  {
    testString: "invalid",
    testAttribute: From,
    op: EndsWith,
    count: 1,
  },
  {
    testString: "Primary",
    testAttribute: From,
    op: EndsWith,
    count: 0,
  },
  {
    testString: "QAContact",
    testAttribute: OtherHeader,
    op: BeginsWith,
    count: 1,
  },
  {
    testString: "filters",
    testAttribute: OtherHeader,
    op: BeginsWith,
    count: 0,
  },
  {
    testString: "mail.bugs",
    testAttribute: OtherHeader,
    op: EndsWith,
    count: 1,
  },
  {
    testString: "QAContact",
    testAttribute: OtherHeader,
    op: EndsWith,
    count: 0,
  },
  {
    testString: "QAcontact filters@mail.bugs",
    testAttribute: OtherHeader,
    op: Is,
    count: 1,
  },
  {
    testString: "filters@mail.bugs",
    testAttribute: OtherHeader,
    op: Is,
    count: 0,
  },
  {
    testString: "QAcontact filters@mail.bugs",
    testAttribute: OtherHeader,
    op: Isnt,
    count: 0,
  },
  {
    testString: "QAcontact",
    testAttribute: OtherHeader,
    op: Isnt,
    count: 1,
  },
  {
    testString: "filters",
    testAttribute: OtherHeader,
    op: Contains,
    count: 1,
  },
  {
    testString: "foobar",
    testAttribute: OtherHeader,
    op: Contains,
    count: 0,
  },
  // test header with multiple occurrences
  {
    testString: "one value",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "second",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "third value for test purposes",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "multiline value that needs to be handled.",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "one value",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header",
    count: 0,
  },
  {
    testString: "second",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header",
    count: 0,
  },
  {
    testString: "third value for test purposes",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header",
    count: 0,
  },
  {
    testString: "multiline value that needs to be handled.",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header",
    count: 0,
  },
  {
    testString: "one",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "second",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "purposes",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "value",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "that needs to be",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "fifth",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "is the end my",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "the end",
    testAttribute: OtherHeader,
    op: EndsWith,
    customHeader: "X-Duplicated-Header",
    count: 0,
  },
  {
    testString: "handled.",
    testAttribute: OtherHeader,
    op: EndsWith,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "one value",
    testAttribute: OtherHeader,
    op: EndsWith,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "third",
    testAttribute: OtherHeader,
    op: BeginsWith,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "This is",
    testAttribute: OtherHeader,
    op: BeginsWith,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },

  {
    testString: "nothing",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header",
    count: 0,
  },
  {
    testString: "nothing",
    testAttribute: OtherHeader,
    op: DoesntContain,
    customHeader: "X-Duplicated-Header",
    count: 1,
  },
  {
    testString: "this header tests DB string properties",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header-DB",
    count: 1,
  },
  {
    testString: "which can be handled",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header-DB",
    count: 1,
  },
  {
    testString: "differently than X-Duplicated-Header, so better test it",
    testAttribute: OtherHeader,
    op: Is,
    customHeader: "X-Duplicated-Header-DB",
    count: 1,
  },
  {
    testString: "this header tests DB string properties",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header-DB",
    count: 0,
  },
  {
    testString: "which can be handled",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header-DB",
    count: 0,
  },
  {
    testString: "differently than X-Duplicated-Header, so better test it",
    testAttribute: OtherHeader,
    op: Isnt,
    customHeader: "X-Duplicated-Header-DB",
    count: 0,
  },
  {
    testString: "than X-Duplicated-Header,",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Duplicated-Header-DB",
    count: 1,
  },
  {
    testString: "than X-Duplicated-Header, so",
    testAttribute: OtherHeader,
    op: DoesntContain,
    customHeader: "X-Duplicated-Header-DB",
    count: 0,
  },
  // test accumulation of received header
  {
    // only in first received
    testString: "caspiaco",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "Received",
    count: 1,
  },
  {
    // only in second
    testString: "webapp01.sj.mozilla.com",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "received",
    count: 1,
  },
  {
    // in neither
    testString: "not there",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "received",
    count: 0,
  },
  {
    // not on first line of received
    testString: "m47LtAFJ007547",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "received",
    count: 1,
  },
  // test multiple line arbitrary headers
  {
    // in the first line
    testString: "SpamAssassin 3.2.3",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Spam-Checker-Version",
    count: 1,
  },
  {
    // in the second line
    testString: "host29.example.com",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Spam-Checker-Version",
    count: 1,
  },
  {
    // spans two lines with space
    testString: "on host29.example.com",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "X-Spam-Checker-Version",
    count: 1,
  },
  // subject spanning several lines
  {
    // on the first line
    testString: "A filter will",
    testAttribute: Subject,
    op: Contains,
    count: 1,
  },
  {
    testString: "I do not exist",
    testAttribute: Subject,
    op: Contains,
    count: 0,
  },
  {
    // on the second line
    testString: "this message",
    testAttribute: Subject,
    op: Contains,
    count: 1,
  },
  {
    // spanning second and third line
    testString: "over many",
    testAttribute: Subject,
    op: Contains,
    count: 1,
  },
  // tests of custom headers db values
  {
    testString: "a one line header",
    dbHeader: "oneliner",
  },
  {
    testString: "a two line header",
    dbHeader: "twoliner",
  },
  {
    testString: "a three line header with lotsa space and tabs",
    dbHeader: "threeliner",
  },
  {
    testString: "I have no space",
    dbHeader: "nospace",
  },
  {
    testString: "too much space",
    dbHeader: "withspace",
  },
  // tests of custom db headers in a search
  {
    testString: "one line",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "oneliner",
    count: 1,
  },
  {
    testString: "two line header",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "twoliner",
    count: 1,
  },
  {
    testString: "three line header with lotsa",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "threeliner",
    count: 1,
  },
  {
    testString: "I have no space",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "nospace",
    count: 1,
  },
  {
    testString: "too much space",
    testAttribute: OtherHeader,
    op: Contains,
    customHeader: "withspace",
    count: 1,
  },
  // test for priority
  {
    testString: Ci.nsMsgPriority.lowest,
    testAttribute: Priority,
    op: IsHigherThan,
    count: 1,
  },
  {
    testString: Ci.nsMsgPriority.low,
    testAttribute: Priority,
    op: Is,
    count: 1,
  },
  {
    testString: Ci.nsMsgPriority.normal,
    testAttribute: Priority,
    op: IsLowerThan,
    count: 1,
  },
  {
    testString: Ci.nsMsgPriority.lowest,
    testAttribute: Priority,
    op: Isnt,
    count: 1,
  },
  {
    testString: Ci.nsMsgPriority.low,
    testAttribute: Priority,
    op: Isnt,
    count: 0,
  },

  // tests of Date header
  // The internal value of date in the search is PRTime (nanoseconds since Epoch).
  // Date().getTime() returns milliseconds since Epoch.
  // The dates used here are tailored for the ../../../data/bugmail12 message.
  {
    testString: new Date("Wed, 7 May 2008 14:55:10 -0700").getTime() * 1000,
    testAttribute: SDate,
    op: Is,
    count: 1,
  },
  {
    testString: new Date("Thu, 8 May 2008 14:55:10 -0700").getTime() * 1000,
    testAttribute: SDate,
    op: IsBefore,
    count: 1,
  },
  {
    testString: new Date("Tue, 6 May 2008 14:55:10 -0700").getTime() * 1000,
    testAttribute: SDate,
    op: IsAfter,
    count: 1,
  },
  {
    testString: new Date("Tue, 6 May 2008 14:55:10 -0700").getTime() * 1000,
    testAttribute: SDate,
    op: Isnt,
    count: 1,
  },
  {
    // check bug 248808
    testString: new Date("Wed, 7 May 2008 14:55:10 -0700").getTime() * 1000,
    testAttribute: SDate,
    op: IsBefore,
    count: 0,
  },
  {
    testString: new Date("Wed, 7 May 2008 14:55:10 -0700").getTime() * 1000,
    testAttribute: SDate,
    op: IsAfter,
    count: 0,
  },
];

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  var copyListener = {
    OnStartCopy() {},
    OnProgress() {},
    SetMessageKey() {},
    SetMessageId() {},
    OnStopCopy() {
      testSearch();
    },
  };

  // set value of headers we want parsed into the db
  Services.prefs.setCharPref(
    "mailnews.customDBHeaders",
    "oneLiner twoLiner threeLiner noSpace withSpace X-Duplicated-Header-DB"
  );
  // Get a message into the local filestore. function testSearch() continues
  // the testing after the copy.
  var bugmail12 = do_get_file("../../../data/bugmail12");
  do_test_pending();
  MailServices.copy.copyFileMessage(
    bugmail12,
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
  if (test && test.dbHeader) {
    //  test of a custom db header
    dump("testing dbHeader " + test.dbHeader + "\n");
    const customValue = mailTestUtils
      .firstMsgHdr(localAccountUtils.inboxFolder)
      .getStringProperty(test.dbHeader);
    Assert.equal(customValue, test.testString);
    do_timeout(0, testSearch);
  } else if (test) {
    dump("testing for string '" + test.testString + "'\n");
    new TestSearch(
      localAccountUtils.inboxFolder,
      test.testString,
      test.testAttribute,
      test.op,
      test.count,
      testSearch,
      null,
      test.customHeader ? test.customHeader : "X-Bugzilla-Watch-Reason"
    );
  } else {
    do_test_finished();
  }
}
