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

add_task(async function testKeywordSearch() {
  localAccountUtils.loadLocalMailAccount();

  // test that validity table terms are valid

  // offline mail table
  MailSearchTestUtils.assertValidity(offlineMail, Contains, Keywords, true);
  MailSearchTestUtils.assertValidity(
    offlineMail,
    DoesntContain,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(offlineMail, Is, Keywords, true);
  MailSearchTestUtils.assertValidity(offlineMail, Isnt, Keywords, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsEmpty, Keywords, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsntEmpty, Keywords, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsBefore, Keywords, false);

  // offline mail filter table
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    Contains,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    DoesntContain,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, Is, Keywords, true);
  MailSearchTestUtils.assertValidity(offlineMailFilter, Isnt, Keywords, true);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsEmpty,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsntEmpty,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsBefore,
    Keywords,
    false
  );

  // online mail
  MailSearchTestUtils.assertValidity(onlineMail, Contains, Keywords, true);
  MailSearchTestUtils.assertValidity(onlineMail, DoesntContain, Keywords, true);
  MailSearchTestUtils.assertValidity(onlineMail, Is, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMail, Isnt, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsEmpty, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsntEmpty, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsBefore, Keywords, false);

  // online mail filter
  MailSearchTestUtils.assertValidity(
    onlineMailFilter,
    Contains,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(
    onlineMailFilter,
    DoesntContain,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(onlineMailFilter, Is, Keywords, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, Isnt, Keywords, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsEmpty, Keywords, true);
  MailSearchTestUtils.assertValidity(
    onlineMailFilter,
    IsntEmpty,
    Keywords,
    true
  );
  MailSearchTestUtils.assertValidity(
    onlineMailFilter,
    IsBefore,
    Keywords,
    false
  );

  // news
  MailSearchTestUtils.assertValidity(news, Contains, Keywords, false);
  MailSearchTestUtils.assertValidity(news, DoesntContain, Keywords, false);
  MailSearchTestUtils.assertValidity(news, Is, Keywords, false);
  MailSearchTestUtils.assertValidity(news, Isnt, Keywords, false);
  MailSearchTestUtils.assertValidity(news, IsEmpty, Keywords, false);
  MailSearchTestUtils.assertValidity(news, IsntEmpty, Keywords, false);
  MailSearchTestUtils.assertValidity(news, IsBefore, Keywords, false);

  // delete any existing tags
  const tagArray = MailServices.tags.getAllTags();
  for (var i = 0; i < tagArray.length; i++) {
    MailServices.tags.deleteKey(tagArray[i].key);
  }

  // add as valid tags Tag1 and Tag4
  MailServices.tags.addTagForKey(Tag1, Tag1, null, null);
  MailServices.tags.addTagForKey(Tag4, Tag4, null, null);

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
    hdr.setStringProperty("keywords", test.msgTag);
    await MailSearchTestUtils.assertHitCount(
      localAccountUtils.inboxFolder,
      { value: test.testTag, attrib: Keywords, op: test.op },
      test.count
    );
  }
});
