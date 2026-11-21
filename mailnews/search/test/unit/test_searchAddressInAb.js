/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Testing of to, cc, toorcc in addressbook search features added in bug 187768
// Added testing of AllAddresses from bug 310359

const { MailSearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailSearchTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// add address book setup
const { kPABData, loadABFile } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/AddrBookTestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var ABUri = kPABData.URI;

var IsntInAB = Ci.nsMsgSearchOp.IsntInAB;
var IsInAB = Ci.nsMsgSearchOp.IsInAB;
var IsBefore = Ci.nsMsgSearchOp.IsBefore; // control entry that is not enabled
var Is = Ci.nsMsgSearchOp.Is;
var Isnt = Ci.nsMsgSearchOp.Isnt;

var offlineMail = Ci.nsMsgSearchScope.offlineMail;
var onlineMail = Ci.nsMsgSearchScope.onlineMail;
var offlineMailFilter = Ci.nsMsgSearchScope.offlineMailFilter;
var onlineMailFilter = Ci.nsMsgSearchScope.onlineMailFilter;
var news = Ci.nsMsgSearchScope.news; // control entry that is not enabled

var Sender = Ci.nsMsgSearchAttrib.Sender;
var To = Ci.nsMsgSearchAttrib.To;
var CCopy = Ci.nsMsgSearchAttrib.CC;
var ToOrCC = Ci.nsMsgSearchAttrib.ToOrCC;
var AllAddresses = Ci.nsMsgSearchAttrib.AllAddresses;
var Keywords = Ci.nsMsgSearchAttrib.Keywords; // control entry that is not enabled

/*
 * The address available in the test address book is "PrimaryEmail1@test.invalid"
 * Test emails may also include the address "invalid@example.com"
 *
 *
 * Map of test email contents: (P is "Prim...", I is "inva.." address, N is none)
 *
 *
 *  Email      From       To      CC    BCC
 *    1         P         I       I     N
 *    2         P         P       P     N
 *    3         I         P       I     N
 *    4         I         I       P     N
 *    5         P         I       P     N
 *    6         I         I,P     P,I   N
 *    7         I         I       I     P
 *    8         I         P       P     N
 *
 */

var Tests = [
  {
    value: ABUri,
    attrib: Sender,
    op: IsInAB,
    count: 3,
  },
  {
    value: ABUri,
    attrib: To,
    op: IsInAB,
    count: 4,
  },
  {
    value: ABUri,
    attrib: ToOrCC,
    op: IsInAB,
    count: 6,
  },
  {
    value: ABUri,
    attrib: AllAddresses,
    op: IsInAB,
    count: 8,
  },
  {
    value: ABUri,
    attrib: CCopy,
    op: IsInAB,
    count: 5,
  },
  {
    value: ABUri,
    attrib: Sender,
    op: IsntInAB,
    count: 5,
  },
  {
    value: ABUri,
    attrib: To,
    op: IsntInAB,
    count: 5,
  },
  {
    value: ABUri,
    attrib: ToOrCC,
    op: IsntInAB,
    count: 6,
  },
  {
    value: ABUri,
    attrib: AllAddresses,
    op: IsntInAB,
    count: 7,
  },
  {
    value: ABUri,
    attrib: CCopy,
    op: IsntInAB,
    count: 4,
  },
  {
    value: "PrimaryEmail1@test.invalid",
    attrib: AllAddresses,
    op: Is,
    count: 8,
  },
  {
    value: "PrimaryEmail1@test.invalid",
    attrib: AllAddresses,
    op: Isnt,
    count: 0,
  },
  {
    value: "invalid@example.com",
    attrib: AllAddresses,
    op: Is,
    count: 7,
  },
  {
    value: "invalid@example.com",
    attrib: AllAddresses,
    op: Isnt,
    count: 1,
  },
  {
    value: "PrimaryEmail1@test.invalid",
    attrib: ToOrCC,
    op: Is,
    count: 6,
  },
  {
    value: "PrimaryEmail1@test.invalid",
    attrib: ToOrCC,
    op: Isnt,
    count: 2,
  },
  {
    value: "invalid@example.com",
    attrib: ToOrCC,
    op: Is,
    count: 6,
  },
  {
    value: "invalid@example.com",
    attrib: ToOrCC,
    op: Isnt,
    count: 2,
  },
];

var Files = [
  "../../../data/bugmail1",
  "../../../data/bugmail2",
  "../../../data/bugmail3",
  "../../../data/bugmail4",
  "../../../data/bugmail5",
  "../../../data/bugmail6",
  "../../../data/bugmail7",
  "../../../data/bugmail8",
];

add_task(async function testAbSearch() {
  // Setup local mail accounts.
  localAccountUtils.loadLocalMailAccount();

  loadABFile(
    do_get_file("../../../addrbook/test/unit/data/cardForEmail.sql"),
    kPABData.fileName
  );

  // test that validity table terms are valid

  // offline mail table
  MailSearchTestUtils.assertValidity(offlineMail, IsInAB, Sender, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsInAB, To, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsInAB, ToOrCC, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsInAB, AllAddresses, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsInAB, CCopy, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(offlineMail, IsntInAB, Sender, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsntInAB, To, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsntInAB, ToOrCC, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsntInAB, AllAddresses, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsntInAB, CCopy, true);
  MailSearchTestUtils.assertValidity(offlineMail, IsntInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(offlineMail, IsBefore, Sender, false);
  MailSearchTestUtils.assertValidity(offlineMail, IsBefore, To, false);
  MailSearchTestUtils.assertValidity(offlineMail, IsBefore, ToOrCC, false);
  MailSearchTestUtils.assertValidity(
    offlineMail,
    IsBefore,
    AllAddresses,
    false
  );
  MailSearchTestUtils.assertValidity(offlineMail, IsBefore, CCopy, false);
  MailSearchTestUtils.assertValidity(offlineMail, IsBefore, Keywords, false);
  MailSearchTestUtils.assertValidity(offlineMail, Is, AllAddresses, true);
  MailSearchTestUtils.assertValidity(offlineMail, Isnt, AllAddresses, true);

  // offline mail filter table
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsInAB, Sender, true);
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsInAB, To, true);
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsInAB, ToOrCC, true);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsInAB,
    AllAddresses,
    true
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsInAB, CCopy, true);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsInAB,
    Keywords,
    false
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsntInAB, Sender, true);
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsntInAB, To, true);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsntInAB,
    AllAddresses,
    true
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsntInAB, ToOrCC, true);
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsntInAB, CCopy, true);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsntInAB,
    Keywords,
    false
  );
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsBefore,
    Sender,
    false
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsBefore, To, false);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsBefore,
    ToOrCC,
    false
  );
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsBefore,
    AllAddresses,
    false
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, IsBefore, CCopy, false);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    IsBefore,
    Keywords,
    false
  );
  MailSearchTestUtils.assertValidity(offlineMailFilter, Is, AllAddresses, true);
  MailSearchTestUtils.assertValidity(
    offlineMailFilter,
    Isnt,
    AllAddresses,
    true
  );

  // online mail
  MailSearchTestUtils.assertValidity(onlineMail, IsInAB, Sender, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsInAB, To, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsInAB, ToOrCC, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsInAB, CCopy, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsntInAB, Sender, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsntInAB, To, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsntInAB, ToOrCC, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsntInAB, CCopy, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsntInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsBefore, Sender, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsBefore, To, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsBefore, ToOrCC, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsBefore, CCopy, false);
  MailSearchTestUtils.assertValidity(onlineMail, IsBefore, Keywords, false);

  // online mail filter
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsInAB, Sender, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsInAB, To, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsInAB, ToOrCC, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsInAB, CCopy, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsntInAB, Sender, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsntInAB, To, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsntInAB, ToOrCC, true);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsntInAB, CCopy, true);
  MailSearchTestUtils.assertValidity(
    onlineMailFilter,
    IsntInAB,
    Keywords,
    false
  );
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsBefore, Sender, false);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsBefore, To, false);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsBefore, ToOrCC, false);
  MailSearchTestUtils.assertValidity(onlineMailFilter, IsBefore, CCopy, false);
  MailSearchTestUtils.assertValidity(
    onlineMailFilter,
    IsBefore,
    Keywords,
    false
  );

  // news
  MailSearchTestUtils.assertValidity(news, IsInAB, Sender, false);
  MailSearchTestUtils.assertValidity(news, IsInAB, To, false);
  MailSearchTestUtils.assertValidity(news, IsInAB, ToOrCC, false);
  MailSearchTestUtils.assertValidity(news, IsInAB, CCopy, false);
  MailSearchTestUtils.assertValidity(news, IsInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(news, IsntInAB, Sender, false);
  MailSearchTestUtils.assertValidity(news, IsntInAB, To, false);
  MailSearchTestUtils.assertValidity(news, IsntInAB, ToOrCC, false);
  MailSearchTestUtils.assertValidity(news, IsntInAB, CCopy, false);
  MailSearchTestUtils.assertValidity(news, IsntInAB, Keywords, false);
  MailSearchTestUtils.assertValidity(news, IsBefore, Sender, false);
  MailSearchTestUtils.assertValidity(news, IsBefore, To, false);
  MailSearchTestUtils.assertValidity(news, IsBefore, ToOrCC, false);
  MailSearchTestUtils.assertValidity(news, IsBefore, CCopy, false);
  MailSearchTestUtils.assertValidity(news, IsBefore, Keywords, false);

  // Get a message into the local filestore. function testAbSearch() continues the testing after the copy.
  await copyFileMessages(Files);

  for (const test of Tests) {
    await MailSearchTestUtils.assertHitCount(
      localAccountUtils.inboxFolder,
      test,
      test.count
    );
  }
});

const EmptyAddressFiles = [
  "../../../data/bugmail9",
  "../../../data/bugmail391717-malformed-from",
  "../../../data/bugmail391717-missing-from",
  "../../../data/bugmail391717-empty-to",
  "../../../data/bugmail391717-missing-to",
];

add_task(async function testEmptyAddresses() {
  await copyFileMessages(EmptyAddressFiles);

  for (const [attrib, op, count] of [
    [Sender, IsntInAB, 8],
    [Sender, IsInAB, 5],
    [To, IsntInAB, 7],
    [To, IsInAB, 7],
    [AllAddresses, IsntInAB, 7],
  ]) {
    await MailSearchTestUtils.assertHitCount(
      localAccountUtils.inboxFolder,
      { value: ABUri, attrib, op },
      count
    );
  }
});

/**
 * Copy message files into the local inbox, one after the other.
 *
 * @param {string[]} fileNames - Paths relative to the test file.
 */
async function copyFileMessages(fileNames) {
  for (const fileName of fileNames) {
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
    await listener.promise;
  }
}
