/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsAbAutoCompleteSearch
 */

var ACR = Ci.nsIAutoCompleteResult;

function acObserver() {}

acObserver.prototype = {
  _search: null,
  _result: null,

  onSearchResult(aSearch, aResult) {
    this._search = aSearch;
    this._result = aResult;
  },
};

function run_test() {
  // Test - Create a new search component

  var acs = Cc["@mozilla.org/autocomplete/search;1?name=mydomain"].getService(
    Ci.nsIAutoCompleteSearch
  );

  var obs = new acObserver();
  const obsNews = new acObserver();
  const obsFollowup = new acObserver();

  // Set up an identity in the account manager with the default settings
  const identity = MailServices.accounts.createIdentity();

  // Initially disable autocomplete
  identity.autocompleteToMyDomain = false;
  identity.email = "myemail@foo.invalid";

  // Set up autocomplete parameters
  const params = JSON.stringify({ idKey: identity.key, type: "addr_to" });
  const paramsNews = JSON.stringify({
    idKey: identity.key,
    type: "addr_newsgroups",
  });
  const paramsFollowup = JSON.stringify({
    idKey: identity.key,
    type: "addr_followup",
  });

  // Test - Valid search - this should return no results (autocomplete disabled)
  acs.startSearch("test", params, null, obs);

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "test");
  Assert.equal(obs._result.searchResult, ACR.RESULT_FAILURE);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);

  // Now enable autocomplete for this identity
  identity.autocompleteToMyDomain = true;

  // Test - Search with empty string

  acs.startSearch(null, params, null, obs);

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, null);
  Assert.equal(obs._result.searchResult, ACR.RESULT_FAILURE);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);

  acs.startSearch("", params, null, obs);

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "");
  Assert.equal(obs._result.searchResult, ACR.RESULT_FAILURE);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);

  // Test - Check ignoring result with comma

  acs.startSearch("a,b", params, null, obs);

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "a,b");
  Assert.equal(obs._result.searchResult, ACR.RESULT_FAILURE);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 0);

  // Test - Check returning search string with @ sign

  acs.startSearch("a@b", params, null, obs);

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "a@b");
  Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 1);

  Assert.equal(obs._result.getValueAt(0), "a@b");
  Assert.equal(obs._result.getLabelAt(0), "a@b");
  Assert.equal(obs._result.getCommentAt(0), null);
  Assert.equal(obs._result.getStyleAt(0), "default-match");
  Assert.equal(obs._result.getImageAt(0), null);

  // No autocomplete for addr_newsgroups!
  acs.startSearch("a@b", paramsNews, null, obsNews);
  Assert.ok(obsNews._result == null || obsNews._result.matchCount == 0);

  // No autocomplete for addr_followup!
  acs.startSearch("a@b", paramsFollowup, null, obsFollowup);
  Assert.ok(obsFollowup._result == null || obsFollowup._result.matchCount == 0);

  // Test - Add default domain

  acs.startSearch("test1", params, null, obs);

  Assert.equal(obs._search, acs);
  Assert.equal(obs._result.searchString, "test1");
  Assert.equal(obs._result.searchResult, ACR.RESULT_SUCCESS);
  Assert.equal(obs._result.errorDescription, null);
  Assert.equal(obs._result.matchCount, 1);

  Assert.equal(obs._result.getValueAt(0), "test1@foo.invalid");
  Assert.equal(obs._result.getLabelAt(0), "test1@foo.invalid");
  Assert.equal(obs._result.getCommentAt(0), null);
  Assert.equal(obs._result.getStyleAt(0), "default-match");
  Assert.equal(obs._result.getImageAt(0), null);
}
