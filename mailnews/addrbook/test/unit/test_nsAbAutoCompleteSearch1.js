/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * First test suite for nsAbAutoCompleteSearch - tests searching in address
 * books for autocomplete matches, and checks sort order is correct (without
 * popularity checks).
 */

var ACR = Ci.nsIAutoCompleteResult;

// Input and results arrays for the autocomplete tests. This are potentially
// more complicated than really required, but it was easier to do them
// on a pattern rather just doing the odd spot check.
//
// Note the expected arrays are in expected sort order as well.
var results = [
  { email: "d <ema@foo.invalid>", dirName: kPABData.dirName }, // 0
  { email: "di <emai@foo.invalid>", dirName: kPABData.dirName }, // 1
  { email: "dis <email@foo.invalid>", dirName: kPABData.dirName }, // 2
  { email: "disp <e@foo.invalid>", dirName: kPABData.dirName }, // 3
  { email: "displ <em@foo.invalid>", dirName: kPABData.dirName }, // 4
  {
    email: "DisplayName1 <PrimaryEmail1@test.invalid>", // 5
    dirName: kCABData.dirName,
  },
  { email: "t <list>", dirName: kPABData.dirName }, // 6
  { email: "te <lis>", dirName: kPABData.dirName }, // 7
  { email: "tes <li>", dirName: kPABData.dirName }, // 8
  // this contact has a nickname of "abcdef"
  { email: "test <l>", dirName: kPABData.dirName }, // 9
  { email: "doh, james <DohJames@foo.invalid>", dirName: kPABData.dirName }, // 10
];
var firstNames = [
  { search: "f", expected: [0, 1, 2, 3, 4, 5, 10, 9] },
  { search: "fi", expected: [0, 1, 3, 4, 5] },
  { search: "fir", expected: [0, 1, 4, 5] },
  { search: "firs", expected: [0, 1, 5] },
  { search: "first", expected: [1, 5] },
  { search: "firstn", expected: [5] },
];

var lastNames = [
  { search: "l", expected: [6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 10] },
  { search: "la", expected: [0, 2, 3, 4, 5] },
  { search: "las", expected: [0, 3, 4, 5] },
  { search: "last", expected: [0, 4, 5] },
  { search: "lastn", expected: [0, 5] },
  { search: "lastna", expected: [5] },
];

var displayNames = [
  { search: "d", expected: [0, 1, 2, 3, 4, 5, 10, 9] },
  { search: "di", expected: [1, 2, 3, 4, 5] },
  { search: "dis", expected: [2, 3, 4, 5] },
  { search: "disp", expected: [3, 4, 5] },
  { search: "displ", expected: [4, 5] },
  { search: "displa", expected: [5] },
  { search: "doh,", expected: [10] },
];

var nickNames = [
  { search: "n", expected: [4, 0, 1, 2, 3, 5, 10] },
  { search: "ni", expected: [0, 1, 2, 3, 5] },
  { search: "nic", expected: [1, 2, 3, 5] },
  { search: "nick", expected: [2, 3, 5] },
  { search: "nickn", expected: [3, 5] },
  { search: "nickna", expected: [5] },
];

var emails = [
  { search: "e", expected: [0, 1, 2, 3, 4, 5, 10, 7, 8, 9] },
  { search: "em", expected: [0, 1, 2, 4, 5] },
  { search: "ema", expected: [0, 1, 2, 5] },
  { search: "emai", expected: [1, 2, 5] },
  { search: "email", expected: [2, 5] },
];

// "l" case tested above
var lists = [
  { search: "li", expected: [6, 7, 8, 0, 1, 2, 3, 4, 5, 10] },
  { search: "lis", expected: [6, 7] },
  { search: "list", expected: [6] },
  { search: "t", expected: [6, 7, 8, 9, 5, 0, 1, 4] },
  { search: "te", expected: [7, 8, 9, 5] },
  { search: "tes", expected: [8, 9, 5] },
  { search: "test", expected: [9, 5] },
  { search: "abcdef", expected: [9] }, // Bug 441586
];

var bothNames = [
  { search: "f l", expected: [0, 1, 2, 3, 4, 5, 10, 9] },
  { search: "l f", expected: [0, 1, 2, 3, 4, 5, 10, 9] },
  { search: "firstn lastna", expected: [5] },
  { search: "lastna firstna", expected: [5] },
];

var inputs = [
  firstNames,
  lastNames,
  displayNames,
  nickNames,
  emails,
  lists,
  bothNames,
];

var PAB_CARD_DATA = [
  {
    FirstName: "firs",
    LastName: "lastn",
    DisplayName: "d",
    NickName: "ni",
    PrimaryEmail: "ema@foo.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
  {
    FirstName: "first",
    LastName: "l",
    DisplayName: "di",
    NickName: "nic",
    PrimaryEmail: "emai@foo.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
  {
    FirstName: "f",
    LastName: "la",
    DisplayName: "dis",
    NickName: "nick",
    PrimaryEmail: "email@foo.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
  {
    FirstName: "fi",
    LastName: "las",
    DisplayName: "disp",
    NickName: "nickn",
    PrimaryEmail: "e@foo.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
  {
    FirstName: "fir",
    LastName: "last",
    DisplayName: "displ",
    NickName: "n",
    PrimaryEmail: "em@foo.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
  {
    FirstName: "Doh",
    LastName: "James",
    DisplayName: "doh, james",
    NickName: "j",
    PrimaryEmail: "DohJames@foo.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
];

var PAB_LIST_DATA = [
  {
    dirName: "t",
    listNickName: null,
    description: "list",
  },
  {
    dirName: "te",
    listNickName: null,
    description: "lis",
  },
  {
    dirName: "tes",
    listNickName: null,
    description: "li",
  },
  {
    dirName: "test",
    listNickName: "abcdef",
    description: "l",
  },
];

var CAB_CARD_DATA = [
  {
    FirstName: "FirstName1",
    LastName: "LastName1",
    DisplayName: "DisplayName1",
    NickName: "NickName1",
    PrimaryEmail: "PrimaryEmail1@test.invalid",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
  {
    FirstName: "Empty",
    LastName: "Email",
    DisplayName: "Empty Email",
    PreferDisplayName: true,
    PopularityIndex: 0,
  },
];

var CAB_LIST_DATA = [];

function setupAddressBookData(aDirURI, aCardData, aMailListData) {
  const ab = MailServices.ab.getDirectory(aDirURI);

  // Getting all directories ensures we create all ABs because mailing
  // lists need help initialising themselves
  MailServices.ab.directories;

  for (const card of ab.childCards) {
    ab.dropCard(card, false);
  }

  aCardData.forEach(function (cd) {
    const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    for (var prop in cd) {
      card.setProperty(prop, cd[prop]);
    }
    ab.addCard(card);
  });

  aMailListData.forEach(function (ld) {
    const list = Cc[
      "@mozilla.org/addressbook/directoryproperty;1"
    ].createInstance(Ci.nsIAbDirectory);
    list.isMailList = true;
    for (var prop in ld) {
      list[prop] = ld[prop];
    }
    ab.addMailList(list);
  });
}

add_task(async () => {
  // Set up addresses for in the personal address book.
  setupAddressBookData(kPABData.URI, PAB_CARD_DATA, PAB_LIST_DATA);
  // ... and collected addresses address book.
  setupAddressBookData(kCABData.URI, CAB_CARD_DATA, CAB_LIST_DATA);

  // Test - Create a new search component

  var acs = Cc["@mozilla.org/autocomplete/search;1?name=addrbook"].getService(
    Ci.nsIAutoCompleteSearch
  );

  var obs = new acObserver();
  const obsNews = new acObserver();
  const obsFollowup = new acObserver();

  // Test - Check disabling of autocomplete

  Services.prefs.setBoolPref("mail.enable_autocomplete", false);

  const param = JSON.stringify({ type: "addr_to" });
  const paramNews = JSON.stringify({ type: "addr_newsgroups" });
  const paramFollowup = JSON.stringify({ type: "addr_followup" });

  let resultPromise = obs.waitForResult();
  acs.startSearch("abc", param, null, obs);
  await resultPromise;

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "abc");
  Assert.equal(obs._result.searchResult, ACR.RESULT_NOMATCH);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);

  // Test - Check Enabling of autocomplete, but with empty string.

  Services.prefs.setBoolPref("mail.enable_autocomplete", true);

  resultPromise = obs.waitForResult();
  acs.startSearch(null, param, null, obs);
  await resultPromise;

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, null);
  Assert.equal(obs._result.searchResult, ACR.RESULT_IGNORED);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);
  Assert.equal(obs._result.defaultIndex, -1);

  // Test - No matches

  resultPromise = obs.waitForResult();
  acs.startSearch("asjdkljdgfjglkfg", param, null, obs);
  await resultPromise;

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "asjdkljdgfjglkfg");
  Assert.equal(obs._result.searchResult, ACR.RESULT_NOMATCH);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);
  Assert.equal(obs._result.defaultIndex, -1);

  // Test - Matches

  // Basic quick-check
  resultPromise = obs.waitForResult();
  acs.startSearch("email", param, null, obs);
  await resultPromise;

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "email");
  Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 2);
  Assert.equal(obs._result.defaultIndex, 0);

  Assert.equal(obs._result.getValueAt(0), "dis <email@foo.invalid>");
  Assert.equal(obs._result.getLabelAt(0), "dis <email@foo.invalid>");
  Assert.equal(obs._result.getCommentAt(0), "");
  Assert.equal(obs._result.getStyleAt(0), "local-abook");
  Assert.equal(obs._result.getImageAt(0), "");

  // quick-check that nothing is found for addr_newsgroups
  resultPromise = obsNews.waitForResult();
  acs.startSearch("email", paramNews, null, obsNews);
  await resultPromise;
  Assert.ok(obsNews._result == null || obsNews._result.matchCount == 0);

  // quick-check that nothing is found for  addr_followup
  resultPromise = obsFollowup.waitForResult();
  acs.startSearch("a@b", paramFollowup, null, obsFollowup);
  await resultPromise;
  Assert.ok(obsFollowup._result == null || obsFollowup._result.matchCount == 0);

  // Now quick-check with the address book name in the comment column.
  Services.prefs.setIntPref("mail.autoComplete.commentColumn", 1);

  resultPromise = obs.waitForResult();
  acs.startSearch("email", param, null, obs);
  await resultPromise;

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "email");
  Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 2);
  Assert.equal(obs._result.defaultIndex, 0);

  Assert.equal(obs._result.getValueAt(0), "dis <email@foo.invalid>");
  Assert.equal(obs._result.getLabelAt(0), "dis <email@foo.invalid>");
  Assert.equal(obs._result.getCommentAt(0), kPABData.dirName);
  Assert.equal(obs._result.getStyleAt(0), "local-abook");
  Assert.equal(obs._result.getImageAt(0), "");

  // Check input with different case
  resultPromise = obs.waitForResult();
  acs.startSearch("EMAIL", param, null, obs);
  await resultPromise;

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "EMAIL");
  Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 2);
  Assert.equal(obs._result.defaultIndex, 0);

  Assert.equal(obs._result.getValueAt(0), "dis <email@foo.invalid>");
  Assert.equal(obs._result.getLabelAt(0), "dis <email@foo.invalid>");
  Assert.equal(obs._result.getCommentAt(0), kPABData.dirName);
  Assert.equal(obs._result.getStyleAt(0), "local-abook");
  Assert.equal(obs._result.getImageAt(0), "");

  // Now check multiple matches
  async function checkInputItem(element, index) {
    const prevRes = obs._result;
    print("Search #" + index + ": search=" + element.search);
    resultPromise = obs.waitForResult();
    acs.startSearch(element.search, param, prevRes, obs);
    await resultPromise;

    for (let i = 0; i < obs._result.matchCount; i++) {
      print("... got " + i + ": " + obs._result.getValueAt(i));
    }

    for (let i = 0; i < element.expected.length; i++) {
      print(
        "... expected " +
          i +
          " (result " +
          element.expected[i] +
          "): " +
          results[element.expected[i]].email
      );
    }

    Assert.equal(obs._search, acs);
    Assert.equal(obs._result.searchString, element.search);
    Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
    Assert.equal(obs._result.errorDescription, null);
    Assert.equal(obs._result.matchCount, element.expected.length);
    Assert.equal(obs._result.defaultIndex, 0);

    for (let i = 0; i < element.expected.length; ++i) {
      Assert.equal(
        obs._result.getValueAt(i),
        results[element.expected[i]].email
      );
      Assert.equal(
        obs._result.getLabelAt(i),
        results[element.expected[i]].email
      );
      Assert.equal(
        obs._result.getCommentAt(i),
        results[element.expected[i]].dirName
      );
      Assert.equal(obs._result.getStyleAt(i), "local-abook");
      Assert.equal(obs._result.getImageAt(i), "");
    }
  }

  for (const inputSet of inputs) {
    for (let i = 0; i < inputSet.length; i++) {
      await checkInputItem(inputSet[i], i);
    }
  }

  // Test - Popularity Index
  print("Checking by popularity index:");
  const pab = MailServices.ab.getDirectory(kPABData.URI);

  for (const card of pab.childCards) {
    if (card.isMailList) {
      continue;
    }

    switch (card.displayName) {
      case "dis": // 2
      case "disp": // 3
        card.setProperty("PopularityIndex", 4);
        break;
      case "displ": // 4
        card.setProperty("PopularityIndex", 5);
        break;
      case "d": // 0
        card.setProperty("PopularityIndex", 1);
        break;
      case "di": // 1
        card.setProperty("PopularityIndex", 20);
        break;
      default:
        break;
    }

    pab.modifyCard(card);
  }

  const popularitySearch = [
    { search: "d", expected: [1, 4, 2, 3, 0, 5, 10, 9] },
    { search: "di", expected: [1, 4, 2, 3, 5] },
    { search: "dis", expected: [4, 2, 3, 5] },
    { search: "disp", expected: [4, 3, 5] },
    { search: "displ", expected: [4, 5] },
    { search: "displa", expected: [5] },
  ];

  for (let i = 0; i < popularitySearch.length; i++) {
    await checkInputItem(popularitySearch[i], i);
  }
});
