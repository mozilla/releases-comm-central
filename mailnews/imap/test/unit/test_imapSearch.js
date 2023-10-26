/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Tests traditional (non-gloda) search on IMAP folders.
 * Derived from a combination of test_imapPump.js and test_search.js
 * Original author: Kent James <kent@caspia.com>
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// headers we will store in db
// set value of headers we want parsed into the db
Services.prefs.setCharPref(
  "mailnews.customDBHeaders",
  "x-spam-status oneliner twoliner threeliner nospace withspace"
);
Assert.equal(
  Services.prefs.getCharPref("mailnews.customDBHeaders"),
  "x-spam-status oneliner twoliner threeliner nospace withspace"
);

// set customHeaders, which post-bug 363238 should get added to the db. Note that all headers but the last
//  seem to end in colon.
Services.prefs.setCharPref(
  "mailnews.customHeaders",
  "x-uidl: x-bugzilla-watch-reason: x-bugzilla-component: received: x-spam-checker-version"
);

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail12"; // message file used as the test message

/*
/*
 * Testing of general mail search features.
 *
 * This tests some search attributes not tested by other specific tests,
 * e.g., test_searchTag.js or test_searchJunk.js
 */
/* import-globals-from ../../../test/resources/searchTestUtils.js */
load("../../../resources/searchTestUtils.js");

var Isnt = Ci.nsMsgSearchOp.Isnt;
var Is = Ci.nsMsgSearchOp.Is;
var Contains = Ci.nsMsgSearchOp.Contains;
var BeginsWith = Ci.nsMsgSearchOp.BeginsWith;
var EndsWith = Ci.nsMsgSearchOp.EndsWith;

var OtherHeader = Ci.nsMsgSearchAttrib.OtherHeader;
var From = Ci.nsMsgSearchAttrib.Sender;
var Subject = Ci.nsMsgSearchAttrib.Subject;

var searchTests = [
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
];

add_setup(async function () {
  setupIMAPPump();

  // don't use offline store
  IMAPPump.inbox.clearFlag(Ci.nsMsgFolderFlags.Offline);

  // Load imap message.
  IMAPPump.mailbox.addMessage(
    new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
  );
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
});

// process each test from queue, calls itself upon completion of each search
add_task(async function testSearch() {
  while (searchTests.length) {
    const test = searchTests.shift();
    if (test.dbHeader) {
      // Test of a custom db header.
      const customValue = mailTestUtils
        .firstMsgHdr(IMAPPump.inbox)
        .getStringProperty(test.dbHeader);
      Assert.equal(customValue, test.testString);
    } else {
      await new Promise(resolve => {
        new TestSearch(
          IMAPPump.inbox,
          test.testString,
          test.testAttribute,
          test.op,
          test.count,
          resolve,
          null,
          test.customHeader ? test.customHeader : "X-Bugzilla-Watch-Reason"
        );
      });
    }
  }
});

// Cleanup at end
add_task(function endTest() {
  teardownIMAPPump();
});

/*
 * helper function
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
