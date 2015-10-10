/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Tests for for nsAbAutoCompleteSearch scoring.
 */

var ACR = Components.interfaces.nsIAutoCompleteResult;

var cards = [
  { // 0
    email: "jd.who@example.com", displayName: "John Doe (:xx)",
    popularityIndex: 0, firstName: "John", value: "John Doe (:xx) <jd.who@example.com>"
  },

  { // 1
    email: "janey_who@example.com", displayName: "Jane Doe",
    popularityIndex: 0, value: "Jane Doe <janey_who@example.com>"
  },

  { // 2
    email: "pf@example.com", displayName: "Paul \"Shitbreak\" Finch",
    popularityIndex: 0, value: "Paul \"Shitbreak\" Finch <pf@example.com>"
  },

  { // 3
    email: "js@example.com", displayName: "Janine (Stifflers Mom)",
    popularityIndex: 0, value: "Janine (Stifflers Mom) <js@example.com>"
  },

  { // 4
    email: "ex0@example.com", displayName: "Ajden",
    popularityIndex: 0, value: "Ajden <ex0@example.com>"
  },

  { // 5
    email: "5@example.com", displayName: "Foxx",
    popularityIndex: 0, value: "Foxx <5@example.com>"
  },

  { // 6
    email: "6@example.com", displayName: "thewho",
    popularityIndex: 0, value: "thewho <6@example.com>"
  },

  { // 7
    email: "7@example.com", displayName: "fakeshit",
    popularityIndex: 0, value: "fakeshit <7@example.com>"
  },

  { // 8
    email: "8@example.com", displayName: "mastiff",
    popularityIndex: 0, value: "mastiff <8@example.com>"
  },

  { // 9
    email: "9@example.com", displayName: "anyjohn",
    popularityIndex: 0, value: "anyjohn <9@example.com>"
  },

  { // 10
    email: "10@example.com", displayName: "däsh l18n",
    popularityIndex: 0, value: "däsh l18n <10@example.com>"
  },

  { // 11
    email: "11@example.com", displayName: "paul mary",
    popularityIndex: 0, firstName: "paul", lastName: "mary meyer",
    value: "paul mary <11@example.com>"
  },

  { // 12
    email: "12@example.com", displayName: "paul meyer",
    popularityIndex: 0, firstName: "paul", lastName: "mary meyer",
    value: "paul meyer <12@example.com>"
  },

  { // 13
    email: "13@example.com", displayName: "mr iron man (exp dev)",
    popularityIndex: 0, firstName: "iron", lastName: "man",
    value: "mr iron man (exp dev) <13@example.com>"
  },

  { // 14
    email: "14@example.com", displayName: "michael",
    popularityIndex: 0, nickName: "short",
    value: "michael <14@example.com>"
  },

  { // 15
    email: "15@example.com", displayName: "good boy",
    popularityIndex: 0, nickName: "sh",
    value: "good boy <15@example.com>"
  },

  { // 16
    email: "16@example.com", displayName: "sherlock holmes",
    popularityIndex: 0, value: "sherlock holmes <16@example.com>"
  }
];

var inputs = [
  { search: "john", expected: [0, 9] },
  { search: "doe", expected: [1, 0] },
  { search: "jd", expected: [0, 4] },
  { search: "who", expected: [1, 0, 6] },
  { search: "xx", expected: [0, 5] },
  { search: "jan", expected: [1, 3] },
  // expecting nickname to score highest.
  { search: "sh", expected: [15, 14, 2, 16, 10, 7] },
  { search: "st", expected: [3,8] },
  { search: "paul mary", expected: [11, 12] },
  { search: "\"paul mary\"", expected: [11] },
  { search: "\"iron man\" mr \"exp dev\"", expected: [13] },
  { search: "short", expected: [14] }
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

function run_test()
{
  // We set up the cards for this test manually as it is easier to set the
  // popularity index and we don't need many.

  // Ensure all the directories are initialised.
  MailServices.ab.directories;

  let ab = MailServices.ab.getDirectory(kPABData.URI);

  function createAndAddCard(element) {
    var card = Cc["@mozilla.org/addressbook/cardproperty;1"]
                 .createInstance(Ci.nsIAbCard);

    card.primaryEmail = element.email;
    card.displayName = element.displayName;
    card.setProperty("PopularityIndex", element.popularityIndex);
    card.firstName = element.firstName;
    card.lastName = element.lastName;
    if ("nickName" in element)
      card.setProperty("NickName", element.nickName);

    ab.addCard(card);
  }

  cards.forEach(createAndAddCard);

  // Test - duplicate elements

  var acs = Components.classes["@mozilla.org/autocomplete/search;1?name=addrbook"]
    .getService(Components.interfaces.nsIAutoCompleteSearch);

  var obs = new acObserver();

  function checkInputItem(element, index, array) {
    print("Search #" + index + ": search=" + element.search);
    acs.startSearch(element.search, JSON.stringify({ type: "addr_to"  }), null, obs);

    for (var i = 0; i < obs._result.matchCount; i++) {
      print("... got " + i + ": " + obs._result.getValueAt(i));
    }

    for (var i = 0; i < element.expected.length; i++) {
      print("... expected " + i + " (card " + element.expected[i] + "): " +
            cards[element.expected[i]].value);
    }

    do_check_eq(obs._search, acs);
    do_check_eq(obs._result.searchString, element.search);
    do_check_eq(obs._result.searchResult, ACR.RESULT_SUCCESS);
    do_check_eq(obs._result.errorDescription, null);
    do_check_eq(obs._result.matchCount, element.expected.length);

    for (var i = 0; i < element.expected.length; ++i) {
      do_check_eq(obs._result.getValueAt(i), cards[element.expected[i]].value);
      do_check_eq(obs._result.getLabelAt(i), cards[element.expected[i]].value);
    }
  }

  inputs.forEach(checkInputItem);
}
