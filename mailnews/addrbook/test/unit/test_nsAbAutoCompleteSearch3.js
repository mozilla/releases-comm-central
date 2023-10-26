/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Third Test suite for nsAbAutoCompleteSearch - test for duplicate elimination
 */

var ACR = Ci.nsIAutoCompleteResult;

var cards = [
  {
    email: "test@foo.invalid",
    displayName: "",
    popularityIndex: 0,
    firstName: "test0",
    value: "test@foo.invalid",
  },
  {
    email: "test@foo.invalid",
    displayName: "",
    popularityIndex: 1,
    firstName: "test1",
    value: "test@foo.invalid",
  },
  {
    email: "abc@foo.invalid",
    displayName: "",
    popularityIndex: 1,
    firstName: "test2",
    value: "abc@foo.invalid",
  },
  {
    email: "foo1@foo.invalid",
    displayName: "d",
    popularityIndex: 0,
    firstName: "first1",
    value: "d <foo1@foo.invalid>",
  },
  {
    email: "foo2@foo.invalid",
    displayName: "di",
    popularityIndex: 1,
    firstName: "first1",
    value: "di <foo2@foo.invalid>",
  },
  {
    email: "foo3@foo.invalid",
    displayName: "dis",
    popularityIndex: 2,
    firstName: "first2",
    value: "dis <foo3@foo.invalid>",
  },
  {
    email: "foo2@foo.invalid",
    displayName: "di",
    popularityIndex: 3,
    firstName: "first2",
    value: "di <foo2@foo.invalid>",
  },
  // this just tests we can search for the special chars '(' and ')', bug 749097
  {
    email: "bracket@not.invalid",
    secondEmail: "h@not.invalid",
    firstName: "Mr.",
    displayName: "Mr. (Bracket)",
    value: "Mr. (Bracket) <bracket@not.invalid>",
    popularityIndex: 2,
  },
  {
    email: "mr@(bracket).not.invalid",
    secondEmail: "bracket@not.invalid",
    firstName: "Mr.",
    displayName: "Mr. Bracket",
    value: "Mr. Bracket <mr@(bracket).not.invalid>",
    popularityIndex: 1,
  },
];

var duplicates = [
  { search: "test", expected: [1, 2] },
  { search: "first", expected: [6, 5, 3] },
  { search: "(bracket)", expected: [7, 8] },
];

add_task(async () => {
  // We set up the cards for this test manually as it is easier to set the
  // popularity index and we don't need many.

  // Ensure all the directories are initialised.
  MailServices.ab.directories;

  const ab = MailServices.ab.getDirectory(kPABData.URI);

  function createAndAddCard(element) {
    var card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );

    card.primaryEmail = element.email;
    card.displayName = element.displayName;
    card.setProperty("PopularityIndex", element.popularityIndex);
    card.firstName = element.firstName;

    ab.addCard(card);
  }

  cards.forEach(createAndAddCard);

  // Test - duplicate elements

  var acs = Cc["@mozilla.org/autocomplete/search;1?name=addrbook"].getService(
    Ci.nsIAutoCompleteSearch
  );

  var obs = new acObserver();

  async function checkInputItem(element, index) {
    print("Search #" + index + ": search=" + element.search);
    const resultPromise = obs.waitForResult();
    acs.startSearch(
      element.search,
      JSON.stringify({ type: "addr_to" }),
      null,
      obs
    );
    await resultPromise;

    for (let i = 0; i < obs._result.matchCount; i++) {
      print("... got " + i + ": " + obs._result.getValueAt(i));
    }

    for (let i = 0; i < element.expected.length; i++) {
      print(
        "... expected " +
          i +
          " (card " +
          element.expected[i] +
          "): " +
          cards[element.expected[i]].value
      );
    }

    Assert.equal(obs._search, acs);
    Assert.equal(obs._result.searchString, element.search);
    Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
    Assert.equal(obs._result.errorDescription, null);
    Assert.equal(obs._result.matchCount, element.expected.length);

    for (let i = 0; i < element.expected.length; ++i) {
      Assert.equal(obs._result.getValueAt(i), cards[element.expected[i]].value);
      Assert.equal(obs._result.getLabelAt(i), cards[element.expected[i]].value);
      Assert.equal(obs._result.getCommentAt(i), "");
      Assert.equal(obs._result.getStyleAt(i), "local-abook");
      Assert.equal(obs._result.getImageAt(i), "");
      obs._result.QueryInterface(Ci.nsIAbAutoCompleteResult);
      Assert.equal(
        obs._result.getCardAt(i).firstName,
        cards[element.expected[i]].firstName
      );
    }
  }

  for (let i = 0; i < duplicates.length; i++) {
    await checkInputItem(duplicates[i], i);
  }
});
