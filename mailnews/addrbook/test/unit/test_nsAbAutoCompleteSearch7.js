/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests for nsAbAutoCompleteSearch - tests searching in address
 * books for autocomplete matches, and checks sort order is correct
 * according to scores.
 */

var ACR = Ci.nsIAutoCompleteResult;

// Input and results arrays for the autocomplete tests.

// Note the expected arrays are in expected sort order as well.

var results = [
  { email: "Tomas Doe <tomez.doe@foo.invalid>" }, // 0
  { email: "Tomas Doe <tomez.doe@foo2.invalid>" }, // 1
  { email: "Tomas Doe <tomez.doe@b.example.com>" }, // 2
  { email: "Tomas Doe <tomez.doe@a.example.com>" }, // 3
  { email: "Tomek Smith <tomek@example.com>" }, // 4
];

var inputs = [
  [
    { search: "t", expected: [2, 3, 0, 1, 4] },
    { search: "tom", expected: [0, 1, 2, 3, 4] },
    { search: "tomek", expected: [4] },
  ],
];

var PAB_CARD_DATA = [
  {
    FirstName: "Tomas",
    LastName: "Doe",
    DisplayName: "Tomas Doe",
    NickName: "tom",
    PrimaryEmail: "tomez.doe@foo.invalid",
    SecondEmail: "tomez.doe@foo2.invalid",
    PreferDisplayName: true,
    PopularityIndex: 10,
    // Poison the card data with an unparseable birthday. This will cause the
    // vCard parser to throw an exception, but it should be caught and the
    // search should carry on as normal.
    BirthDay: 25,
    BirthMonth: 9,
    BirthYear: "NaN",
  },
  {
    FirstName: "Tomas",
    LastName: "Doe",
    DisplayName: "Tomas Doe",
    PrimaryEmail: "tomez.doe@b.example.com",
    SecondEmail: "tomez.doe@a.example.com",
    PreferDisplayName: true,
    PopularityIndex: 200,
  },
  {
    FirstName: "Tomek",
    LastName: "Smith",
    DisplayName: "Tomek Smith",
    PrimaryEmail: "tomek@example.com",
    PreferDisplayName: true,
    PopularityIndex: 3,
  },
];

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
  setupAddressBookData(kPABData.URI, PAB_CARD_DATA, []);

  // Test - Create a new search component

  var acs = Cc["@mozilla.org/autocomplete/search;1?name=addrbook"].getService(
    Ci.nsIAutoCompleteSearch
  );

  var obs = new acObserver();

  const param = JSON.stringify({ type: "addr_to" });

  // Now check multiple matches
  async function checkInputItem(element, index) {
    const prevRes = obs._result;
    print("Search #" + index + ": search=" + element.search);
    const resultPromise = obs.waitForResult();
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
      Assert.equal(obs._result.getCommentAt(i), "");
      Assert.equal(obs._result.getStyleAt(i), "local-abook");
      Assert.equal(obs._result.getImageAt(i), "");
    }
  }

  for (const inputSet of inputs) {
    for (let i = 0; i < inputSet.length; i++) {
      await checkInputItem(inputSet[i], i);
    }
  }
});
