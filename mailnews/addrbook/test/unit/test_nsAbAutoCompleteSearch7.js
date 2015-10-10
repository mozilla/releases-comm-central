/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests for nsAbAutoCompleteSearch - tests searching in address
 * books for autocomplete matches, and checks sort order is correct
 * according to scores.
 */

var ACR = Components.interfaces.nsIAutoCompleteResult;

// Input and results arrays for the autocomplete tests.

// Note the expected arrays are in expected sort order as well.

var results =  [
  { email: "Tomas Doe <tomez.doe@foo.invalid>" }, // 0
  { email: "Tomas Doe <tomez.doe@foo2.invalid>" }, // 1
  { email: "Tomas Doe <tomez.doe@b.example.com>" }, // 2
  { email: "Tomas Doe <tomez.doe@a.example.com>" }, // 3
  { email: "Tomek Smith <tomek@example.com>" } // 4
]

var inputs = [
  [
    { search: "t",            expected: [2, 3, 0, 1, 4] },
    { search: "tom",          expected: [0, 1, 2, 3, 4] },
    { search: "tomek",        expected: [4] }
  ]
];

function acObserver() {}

acObserver.prototype = {
  _search: null,
  _result: null,

  onSearchResult: function (aSearch, aResult) {
    this._search = aSearch;
    this._result = aResult;
  }
};

var PAB_CARD_DATA = [
  {
    "FirstName": "Tomas",
    "LastName": "Doe",
    "DisplayName": "Tomas Doe",
    "NickName": "tom",
    "PrimaryEmail": "tomez.doe@foo.invalid",
    "SecondEmail": "tomez.doe@foo2.invalid",
    "PreferDisplayName": true,
    "PopularityIndex": 10
  },
  {
    "FirstName": "Tomas",
    "LastName": "Doe",
    "DisplayName": "Tomas Doe",
    "PrimaryEmail": "tomez.doe@b.example.com",
    "SecondEmail": "tomez.doe@a.example.com",
    "PreferDisplayName": true,
    "PopularityIndex": 200
  },
  {
    "FirstName": "Tomek",
    "LastName": "Smith",
    "DisplayName": "Tomek Smith",
    "PrimaryEmail": "tomek@example.com",
    "PreferDisplayName": true,
    "PopularityIndex": 3
  }
];

var ABMDB_PREFIX = "moz-abmdbdirectory://";

function setupAddressBookData(aDirURI, aCardData, aMailListData) {
  let ab = MailServices.ab.getDirectory(aDirURI);

  // Getting all directories ensures we create all ABs because mailing
  // lists need help initialising themselves
  MailServices.ab.directories;

  let childCards0 = ab.childCards;
  while (childCards0.hasMoreElements()) {
    let c = childCards0.getNext().QueryInterface(Components.interfaces.nsIAbCard);
    ab.dropCard(c, false);
  }

  aCardData.forEach(function(cd) {
    let card = Components.classes["@mozilla.org/addressbook/cardproperty;1"]
      .createInstance(Components.interfaces.nsIAbCard);
    for (var prop in cd) {
      card.setProperty(prop, cd[prop]);
    }
    ab.addCard(card);
  });

  aMailListData.forEach(function(ld) {
    let list = Components.classes["@mozilla.org/addressbook/directoryproperty;1"]
      .createInstance(Components.interfaces.nsIAbDirectory);
    list.isMailList = true;
    for (var prop in ld) {
      list[prop] = ld[prop];
    }
    ab.addMailList(list);
  });

  let childCards = ab.childCards;
  while (childCards.hasMoreElements()) {
    let c = childCards.getNext().QueryInterface(Components.interfaces.nsIAbCard);
  }
}

function run_test() {
  // Set up addresses for in the personal address book.
  setupAddressBookData(kPABData.URI, PAB_CARD_DATA, []);

  // Test - Create a new search component

  var acs = Components.classes["@mozilla.org/autocomplete/search;1?name=addrbook"]
    .getService(Components.interfaces.nsIAutoCompleteSearch);

  var obs = new acObserver();
  let obsNews = new acObserver();
  let obsFollowup = new acObserver();

  let param = JSON.stringify({ type: "addr_to" });

  // Now check multiple matches
  function checkInputItem(element, index, array) {
    let prevRes = obs._result;
    print("Search #" + index + ": search=" + element.search);
    acs.startSearch(element.search, param, prevRes, obs);

    for (var i = 0; i < obs._result.matchCount; i++) {
      print("... got " + i + ": " + obs._result.getValueAt(i));
    }
    for (var i = 0; i < element.expected.length; i++) {
      print("... expected " + i + " (result " + element.expected[i] + "): " +
            results[element.expected[i]].email);
    }

    do_check_eq(obs._search, acs);
    do_check_eq(obs._result.searchString, element.search);
    do_check_eq(obs._result.searchResult, ACR.RESULT_SUCCESS);
    do_check_eq(obs._result.errorDescription, null);
    do_check_eq(obs._result.matchCount, element.expected.length);
    do_check_eq(obs._result.defaultIndex, 0);

    for (var i = 0; i < element.expected.length; ++i) {
      do_check_eq(obs._result.getValueAt(i), results[element.expected[i]].email);
      do_check_eq(obs._result.getLabelAt(i), results[element.expected[i]].email);
      do_check_eq(obs._result.getCommentAt(i), "");
      do_check_eq(obs._result.getStyleAt(i), "local-abook");
      do_check_eq(obs._result.getImageAt(i), "");
    }
  }
  function checkInputSet(element, index, array) {
    element.forEach(checkInputItem);
  }

  inputs.forEach(checkInputSet);
};
