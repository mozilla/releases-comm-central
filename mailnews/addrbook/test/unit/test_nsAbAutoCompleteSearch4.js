/*
 * Fourth Test suite for nsAbAutoCompleteSearch - test for second email address.
 */

var ACR = Ci.nsIAutoCompleteResult;

var cards = [
  // Basic tests for primary and secondary emails.
  {
    email: "primary@test.invalid",
    secondEmail: "second@test.invalid",
    firstName: "",
  },
  {
    email: "test1@test.invalid",
    secondEmail: "test2@test.invalid",
    firstName: "firstName",
  },
  {
    email: "bar1@test.invalid",
    secondEmail: "bar2@test.invalid",
    firstName: "sweet",
  },
  {
    email: "boo1@test.invalid",
    secondEmail: "boo2@test.invalid",
    firstName: "sample",
  },
  {
    email: "name@test.invalid",
    secondEmail: "thename@test.invalid",
    firstName: "thename",
  },
  // Test to check correct sorting of primary and secondary emails.
  {
    email: "foo_b@test.invalid",
    secondEmail: "foo_a@test.invalid",
    displayName: "sortbasic",
  },
  {
    email: "d@test.invalid",
    secondEmail: "e@test.invalid",
    displayName: "testsort",
  },
  {
    email: "c@test.invalid",
    secondEmail: "a@test.invalid",
    displayName: "testsort",
  },
  // "2testsort" does the same as "testsort" but turns the cards around to
  // ensure the order is always consistent.
  {
    email: "c@test.invalid",
    secondEmail: "a@test.invalid",
    displayName: "2testsort",
  },
  {
    email: "d@test.invalid",
    secondEmail: "e@test.invalid",
    displayName: "2testsort",
  },
  {
    email: "g@test.invalid",
    secondEmail: "f@test.invalid",
    displayName: "3testsort",
    popularityIndex: 3,
  },
  {
    email: "j@test.invalid",
    secondEmail: "h@test.invalid",
    displayName: "3testsort",
    popularityIndex: 5,
  },
  // Add a contact that matches, but has no email. Should not show up.
  { displayName: "primaryX" },
];

// These are for the initial search
var searches = [
  "primary",
  "second",
  "firstName",
  "thename",
  "sortbasic",
  "testsort",
  "2testsort",
  "3testsort",
];

var expectedResults = [
  ["primary@test.invalid", "second@test.invalid"], // searching for primary/second returns
  [
    "second@test.invalid", // both the emails as the new search query
    "primary@test.invalid",
  ], // looks in both the fields.
  ["test1@test.invalid", "test2@test.invalid"],
  ["thename@test.invalid", "name@test.invalid"],
  ["sortbasic <foo_b@test.invalid>", "sortbasic <foo_a@test.invalid>"],
  [
    "testsort <c@test.invalid>",
    "testsort <a@test.invalid>",
    "testsort <d@test.invalid>",
    "testsort <e@test.invalid>",
    "3testsort <j@test.invalid>",
    "3testsort <h@test.invalid>",
    "3testsort <g@test.invalid>",
    "3testsort <f@test.invalid>",
    "2testsort <c@test.invalid>",
    "2testsort <a@test.invalid>",
    "2testsort <d@test.invalid>",
    "2testsort <e@test.invalid>",
  ],
  [
    "2testsort <c@test.invalid>",
    "2testsort <a@test.invalid>",
    "2testsort <d@test.invalid>",
    "2testsort <e@test.invalid>",
  ],
  [
    "3testsort <j@test.invalid>",
    "3testsort <h@test.invalid>",
    "3testsort <g@test.invalid>",
    "3testsort <f@test.invalid>",
  ],
];

// These are for subsequent searches - reducing the number of results.
var reductionSearches = ["b", "bo", "boo2"];

var reductionExpectedResults = [
  [
    "bar1@test.invalid",
    "bar2@test.invalid",
    "boo1@test.invalid",
    "boo2@test.invalid",
    "sortbasic <foo_b@test.invalid>",
    "sortbasic <foo_a@test.invalid>",
  ],
  ["boo1@test.invalid", "boo2@test.invalid"],
  ["boo2@test.invalid"],
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
    if ("secondEmail" in element) {
      card.setProperty("SecondEmail", element.secondEmail);
    }
    card.displayName = element.displayName;
    if ("popularityIndex" in element) {
      card.setProperty("PopularityIndex", element.popularityIndex);
    }
    card.firstName = element.firstName;

    ab.addCard(card);
  }

  cards.forEach(createAndAddCard);

  var acs = Cc["@mozilla.org/autocomplete/search;1?name=addrbook"].getService(
    Ci.nsIAutoCompleteSearch
  );

  var obs = new acObserver();

  print("Checking Initial Searches");

  async function checkSearch(element, index) {
    print("Search #" + index + ": search=" + element);
    const resultPromise = obs.waitForResult();
    acs.startSearch(
      element,
      JSON.stringify({ type: "addr_to", idKey: "" }),
      null,
      obs
    );
    await resultPromise;

    for (let i = 0; i < obs._result.matchCount; i++) {
      print("... got " + i + ": " + obs._result.getValueAt(i));
    }

    Assert.equal(obs._search, acs);
    Assert.equal(obs._result.searchString, element);
    Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
    Assert.equal(obs._result.errorDescription, null);
    Assert.equal(obs._result.matchCount, expectedResults[index].length);

    for (let i = 0; i < expectedResults[index].length; ++i) {
      Assert.equal(obs._result.getValueAt(i), expectedResults[index][i]);
      Assert.equal(obs._result.getLabelAt(i), expectedResults[index][i]);
      Assert.equal(obs._result.getCommentAt(i), "");
      Assert.equal(obs._result.getStyleAt(i), "local-abook");
      Assert.equal(obs._result.getImageAt(i), "");
      obs._result.QueryInterface(Ci.nsIAbAutoCompleteResult);
    }
  }

  for (let i = 0; i < searches.length; i++) {
    await checkSearch(searches[i], i);
  }

  print("Checking Reduction of Search Results");

  var lastResult = null;

  async function checkReductionSearch(element, index) {
    const resultPromise = obs.waitForResult();
    acs.startSearch(
      element,
      JSON.stringify({ type: "addr_to", idKey: "" }),
      lastResult,
      obs
    );
    await resultPromise;

    Assert.equal(obs._search, acs);
    Assert.equal(obs._result.searchString, element);
    Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
    Assert.equal(obs._result.errorDescription, null);
    Assert.equal(
      obs._result.matchCount,
      reductionExpectedResults[index].length
    );

    for (var i = 0; i < reductionExpectedResults[index].length; ++i) {
      Assert.equal(
        obs._result.getValueAt(i),
        reductionExpectedResults[index][i]
      );
      Assert.equal(
        obs._result.getLabelAt(i),
        reductionExpectedResults[index][i]
      );
      Assert.equal(obs._result.getCommentAt(i), "");
      Assert.equal(obs._result.getStyleAt(i), "local-abook");
      Assert.equal(obs._result.getImageAt(i), "");
      obs._result.QueryInterface(Ci.nsIAbAutoCompleteResult);
    }
    lastResult = obs._result;
  }

  for (let i = 0; i < reductionSearches.length; i++) {
    await checkReductionSearch(reductionSearches[i], i);
  }
});
