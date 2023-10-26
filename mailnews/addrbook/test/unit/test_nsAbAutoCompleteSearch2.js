/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Second Test suite for nsAbAutoCompleteSearch - test follow-on lookup after
 * a previous search.
 *
 * We run this test without address books, constructing manually ourselves,
 * so that we can ensure that we're not getting the data out of the address
 * books.
 */

var { getModelQuery } = ChromeUtils.import(
  "resource:///modules/ABQueryUtils.jsm"
);

// taken from nsAbAutoCompleteSearch.js
var ACR = Ci.nsIAutoCompleteResult;

function nsAbAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this._searchResults = [];
  this.searchString = aSearchString;
  this.modelQuery = getModelQuery("mail.addr_book.autocompletequery.format");
  this.asyncDirectories = [];
}

nsAbAutoCompleteResult.prototype = {
  _searchResults: null,

  // nsIAutoCompleteResult

  modelQuery: null,
  searchString: null,
  searchResult: ACR.RESULT_NOMATCH,
  defaultIndex: -1,
  errorDescription: null,

  get matchCount() {
    return this._searchResults.length;
  },

  getValueAt: function getValueAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getLabelAt: function getLabelAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  getCommentAt: function getCommentAt(aIndex) {
    return this._searchResults[aIndex].comment;
  },

  getStyleAt: function getStyleAt(aIndex) {
    return "local-abook";
  },

  getImageAt: function getImageAt(aIndex) {
    return "";
  },

  getFinalCompleteValueAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  removeValueAt: function removeValueAt(aRowIndex, aRemoveFromDB) {},

  // nsIAbAutoCompleteResult

  getCardAt: function getCardAt(aIndex) {
    return this._searchResults[aIndex].card;
  },

  getEmailToUse: function getEmailToUse(aIndex) {
    // For this test we can just use the primary email here.
    return this._searchResults[aIndex].card.primaryEmail;
  },

  isCompleteResult: function isCompleteResult(aIndex) {
    // For this test we claim all results are complete.
    return true;
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([
    "nsIAutoCompleteResult",
    "nsIAbAutoCompleteResult",
  ]),
};

function createCard(chars, popularity) {
  var card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );

  card.firstName = "firstName".slice(0, chars);
  card.lastName = "lastName".slice(0, chars);
  card.displayName = "displayName".slice(0, chars);
  card.primaryEmail = "email".slice(0, chars) + "@foo.invalid";
  card.setProperty("NickName", "nickName".slice(0, chars));

  return card;
}

var results = [
  { email: "d <e@foo.invalid>", dirName: kPABData.dirName },
  { email: "di <em@foo.invalid>", dirName: kPABData.dirName },
  { email: "dis <ema@foo.invalid>", dirName: kPABData.dirName },
];

var firstNames = [
  { search: "fi", expected: [1, 2] },
  { search: "fir", expected: [2] },
];

var lastNames = [
  { search: "la", expected: [1, 2] },
  { search: "las", expected: [2] },
];

var inputs = [firstNames, lastNames];

add_task(async () => {
  // Test - Create a new search component

  var acs = Cc["@mozilla.org/autocomplete/search;1?name=addrbook"].getService(
    Ci.nsIAutoCompleteSearch
  );

  var obs = new acObserver();

  // Ensure we've got the comment column set up for extra checking.
  Services.prefs.setIntPref("mail.autoComplete.commentColumn", 1);

  // Make up the last autocomplete result
  var lastResult = new nsAbAutoCompleteResult();

  lastResult.searchString = "";
  lastResult.searchResult = ACR.RESULT_SUCCESS;
  lastResult.defaultIndex = 0;
  lastResult.errorDescription = null;
  for (let i = 0; i < results.length; ++i) {
    lastResult._searchResults.push({
      value: results[i].email,
      comment: results[i].dirName,
      card: createCard(i + 1, 0),
    });
  }

  // Test - Matches

  // Now check multiple matches
  async function checkInputItem(element, index) {
    const resultPromise = obs.waitForResult();
    acs.startSearch(
      element.search,
      JSON.stringify({ type: "addr_to", idKey: "" }),
      lastResult,
      obs
    );
    await resultPromise;

    Assert.equal(obs._search, acs);
    Assert.equal(obs._result.searchString, element.search);
    Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
    Assert.equal(obs._result.errorDescription, null);
    Assert.equal(obs._result.matchCount, element.expected.length);

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
});
