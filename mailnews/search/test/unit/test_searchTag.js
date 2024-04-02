/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of tag search features.
 *
 * Specifically tests changes implemented in bug 217034
 * Does not do comprehensive testing.
 *
 */
/* import-globals-from ../../../test/resources/searchTestUtils.js */
load("../../../resources/searchTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var Isnt = Ci.nsMsgSearchOp.Isnt;
var Is = Ci.nsMsgSearchOp.Is;
var IsEmpty = Ci.nsMsgSearchOp.IsEmpty;
var IsntEmpty = Ci.nsMsgSearchOp.IsntEmpty;
var Contains = Ci.nsMsgSearchOp.Contains;
var DoesntContain = Ci.nsMsgSearchOp.DoesntContain;
var IsBefore = Ci.nsMsgSearchOp.IsBefore; // control entry not enabled

var offlineMail = Ci.nsMsgSearchScope.offlineMail;
var onlineMail = Ci.nsMsgSearchScope.onlineMail;
var offlineMailFilter = Ci.nsMsgSearchScope.offlineMailFilter;
var onlineMailFilter = Ci.nsMsgSearchScope.onlineMailFilter;
var news = Ci.nsMsgSearchScope.news; // control entry not enabled

var Keywords = Ci.nsMsgSearchAttrib.Keywords;

// test tags
var Tag1 = "istag";
var Tag2 = "notistag";
var Tag3 = "istagnot";
var Tag4 = "istagtoo";
var Tag1Tag4 = Tag1 + " " + Tag4;
var Tag1Tag3 = Tag1 + " " + Tag3;
var Tag1Tag1 = Tag1 + " " + Tag1;

var Tests = [
  // Message has a single valid tag
  // test the valid tag
  {
    msgTag: Tag1,
    testTag: Tag1,
    op: Is,
    count: 1,
  },
  {
    msgTag: Tag1,
    testTag: Tag1,
    op: Isnt,
    count: 0,
  },
  {
    msgTag: Tag1,
    testTag: Tag1,
    op: Contains,
    count: 1,
  },
  {
    msgTag: Tag1,
    testTag: Tag1,
    op: DoesntContain,
    count: 0,
  },
  {
    msgTag: Tag1,
    testTag: Tag1,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1,
    testTag: Tag1,
    op: IsntEmpty,
    count: 1,
  },
  // test an invalid tag, should act like empty
  {
    msgTag: Tag2,
    testTag: Tag1,
    op: Contains,
    count: 0,
  },
  {
    msgTag: Tag2,
    testTag: Tag1,
    op: DoesntContain,
    count: 1,
  },
  {
    msgTag: Tag2,
    testTag: Tag1,
    op: Is,
    count: 0,
  },
  {
    msgTag: Tag2,
    testTag: Tag1,
    op: Isnt,
    count: 1,
  },
  {
    msgTag: Tag2,
    testTag: Tag1,
    op: IsEmpty,
    count: 1,
  },
  {
    msgTag: Tag2,
    testTag: Tag1,
    op: IsntEmpty,
    count: 0,
  },
  // Message has two valid tags
  // test first tag
  {
    msgTag: Tag1Tag4,
    testTag: Tag1,
    op: Is,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag1,
    op: Isnt,
    count: 1,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag1,
    op: Contains,
    count: 1,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag1,
    op: DoesntContain,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag1,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag1,
    op: IsntEmpty,
    count: 1,
  },
  // test second tag
  {
    msgTag: Tag1Tag4,
    testTag: Tag4,
    op: Is,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag4,
    op: Isnt,
    count: 1,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag4,
    op: Contains,
    count: 1,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag4,
    op: DoesntContain,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag4,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag4,
    op: IsntEmpty,
    count: 1,
  },
  // test tag not in message
  {
    msgTag: Tag1Tag4,
    testTag: Tag2,
    op: Is,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag2,
    op: Isnt,
    count: 1,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag2,
    op: Contains,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag2,
    op: DoesntContain,
    count: 1,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag2,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1Tag4,
    testTag: Tag2,
    op: IsntEmpty,
    count: 1,
  },
  // empty message
  {
    msgTag: "",
    testTag: Tag2,
    op: Is,
    count: 0,
  },
  {
    msgTag: "",
    testTag: Tag2,
    op: Isnt,
    count: 1,
  },
  {
    msgTag: "",
    testTag: Tag2,
    op: Contains,
    count: 0,
  },
  {
    msgTag: "",
    testTag: Tag2,
    op: DoesntContain,
    count: 1,
  },
  {
    msgTag: "",
    testTag: Tag2,
    op: IsEmpty,
    count: 1,
  },
  {
    msgTag: "",
    testTag: Tag2,
    op: IsntEmpty,
    count: 0,
  },
  // message with two tags, only one is valid
  // test with the single valid tag
  {
    msgTag: Tag1Tag3,
    testTag: Tag1,
    op: Is,
    count: 1,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag1,
    op: Isnt,
    count: 0,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag1,
    op: Contains,
    count: 1,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag1,
    op: DoesntContain,
    count: 0,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag1,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag1,
    op: IsntEmpty,
    count: 1,
  },
  // test with a tag not in the message
  {
    msgTag: Tag1Tag3,
    testTag: Tag2,
    op: Is,
    count: 0,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag2,
    op: Isnt,
    count: 1,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag2,
    op: Contains,
    count: 0,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag2,
    op: DoesntContain,
    count: 1,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag2,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1Tag3,
    testTag: Tag2,
    op: IsntEmpty,
    count: 1,
  },
  // Message has a duplicated tag
  // test the tag
  {
    msgTag: Tag1Tag1,
    testTag: Tag1,
    op: Is,
    count: 1,
  },
  {
    msgTag: Tag1Tag1,
    testTag: Tag1,
    op: Isnt,
    count: 0,
  },
  {
    msgTag: Tag1Tag1,
    testTag: Tag1,
    op: Contains,
    count: 1,
  },
  {
    msgTag: Tag1Tag1,
    testTag: Tag1,
    op: DoesntContain,
    count: 0,
  },
  {
    msgTag: Tag1Tag1,
    testTag: Tag1,
    op: IsEmpty,
    count: 0,
  },
  {
    msgTag: Tag1Tag1,
    testTag: Tag1,
    op: IsntEmpty,
    count: 1,
  },
];

var hdr;

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  // test that validity table terms are valid

  // offline mail table
  testValidityTable(offlineMail, Contains, Keywords, true);
  testValidityTable(offlineMail, DoesntContain, Keywords, true);
  testValidityTable(offlineMail, Is, Keywords, true);
  testValidityTable(offlineMail, Isnt, Keywords, true);
  testValidityTable(offlineMail, IsEmpty, Keywords, true);
  testValidityTable(offlineMail, IsntEmpty, Keywords, true);
  testValidityTable(offlineMail, IsBefore, Keywords, false);

  // offline mail filter table
  testValidityTable(offlineMailFilter, Contains, Keywords, true);
  testValidityTable(offlineMailFilter, DoesntContain, Keywords, true);
  testValidityTable(offlineMailFilter, Is, Keywords, true);
  testValidityTable(offlineMailFilter, Isnt, Keywords, true);
  testValidityTable(offlineMailFilter, IsEmpty, Keywords, true);
  testValidityTable(offlineMailFilter, IsntEmpty, Keywords, true);
  testValidityTable(offlineMailFilter, IsBefore, Keywords, false);

  // online mail
  testValidityTable(onlineMail, Contains, Keywords, true);
  testValidityTable(onlineMail, DoesntContain, Keywords, true);
  testValidityTable(onlineMail, Is, Keywords, false);
  testValidityTable(onlineMail, Isnt, Keywords, false);
  testValidityTable(onlineMail, IsEmpty, Keywords, false);
  testValidityTable(onlineMail, IsntEmpty, Keywords, false);
  testValidityTable(onlineMail, IsBefore, Keywords, false);

  // online mail filter
  testValidityTable(onlineMailFilter, Contains, Keywords, true);
  testValidityTable(onlineMailFilter, DoesntContain, Keywords, true);
  testValidityTable(onlineMailFilter, Is, Keywords, true);
  testValidityTable(onlineMailFilter, Isnt, Keywords, true);
  testValidityTable(onlineMailFilter, IsEmpty, Keywords, true);
  testValidityTable(onlineMailFilter, IsntEmpty, Keywords, true);
  testValidityTable(onlineMailFilter, IsBefore, Keywords, false);

  // news
  testValidityTable(news, Contains, Keywords, false);
  testValidityTable(news, DoesntContain, Keywords, false);
  testValidityTable(news, Is, Keywords, false);
  testValidityTable(news, Isnt, Keywords, false);
  testValidityTable(news, IsEmpty, Keywords, false);
  testValidityTable(news, IsntEmpty, Keywords, false);
  testValidityTable(news, IsBefore, Keywords, false);

  // delete any existing tags
  const tagArray = MailServices.tags.getAllTags();
  for (var i = 0; i < tagArray.length; i++) {
    MailServices.tags.deleteKey(tagArray[i].key);
  }

  // add as valid tags Tag1 and Tag4
  MailServices.tags.addTagForKey(Tag1, Tag1, null, null);
  MailServices.tags.addTagForKey(Tag4, Tag4, null, null);

  /** @implements {nsIMsgCopyServiceListener} */
  var copyListener = {
    onStartCopy() {},
    onProgress() {},
    setMessageKey(aKey) {
      hdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    },
    getMessageId() {
      return null;
    },
    onStopCopy() {
      testKeywordSearch();
    },
  };

  // Get a message into the local filestore. function testKeywordSearch() continues the testing after the copy.
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
function testKeywordSearch() {
  var test = Tests.shift();
  if (test) {
    hdr.setStringProperty("keywords", test.msgTag);
    new TestSearch(
      localAccountUtils.inboxFolder,
      test.testTag,
      Ci.nsMsgSearchAttrib.Keywords,
      test.op,
      test.count,
      testKeywordSearch
    );
  } else {
    hdr = null;
    do_test_finished();
  }
}
