/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * First test suite for nsAbAutoCompleteSearch - tests searching in address
 * books for autocomplete matches, and checks sort order is correct (without
 * popularity checks).
 */

const ACR = Components.interfaces.nsIAutoCompleteResult;

// Input and results arrays for the autocomplete tests. This are potentially
// more complicated than really required, but it was easier to do them
// on a pattern rather just doing the odd spot check.
//
// Note the expected arrays are in expected sort order as well.
const results = [ { email: "d <ema@foo.invalid>", dirName: kPABData.dirName }, // 0
                  { email: "di <emai@foo.invalid>", dirName: kPABData.dirName }, // 1
                  { email: "dis <email@foo.invalid>", dirName: kPABData.dirName }, // 2
                  { email: "disp <e@foo.invalid>", dirName: kPABData.dirName }, // 3
                  { email: "displ <em@foo.invalid>", dirName: kPABData.dirName }, // 4
                  { email: "DisplayName1 <PrimaryEmail1@test.invalid>", // 5
                    dirName: kCABData.dirName },
                  { email: "t <list>", dirName: kPABData.dirName }, // 6
                  { email: "te <lis>", dirName: kPABData.dirName }, // 7
                  { email: "tes <li>", dirName: kPABData.dirName }, // 8
                   // this contact has a nickname of "abcdef"
                  { email: "test <l>", dirName: kPABData.dirName } // 9
                ];
const firstNames = [ { search: "f",      expected: [5, 0, 1, 2, 3, 4, 9] },
                     { search: "fi",     expected: [5, 0, 1, 3, 4] },
                     { search: "fir",    expected: [5, 0, 1, 4] },
                     { search: "firs",   expected: [5, 0, 1] },
                     { search: "first",  expected: [5, 1] },
                     { search: "firstn", expected: [5] } ];

const lastNames = [ { search: "l",      expected: [6, 7, 8, 9, 5, 0, 1, 2, 3, 4] },
                    { search: "la",     expected: [5, 0, 2, 3, 4] },
                    { search: "las",    expected: [5, 0, 3, 4] },
                    { search: "last",   expected: [5, 0, 4] },
                    { search: "lastn",  expected: [5, 0] },
                    { search: "lastna", expected: [5]} ];

const displayNames = [ { search: "d",      expected: [5, 0, 1, 2, 3, 4, 9] },
                       { search: "di",     expected: [5, 1, 2, 3, 4] },
                       { search: "dis",    expected: [5, 2, 3, 4] },
                       { search: "disp",   expected: [5, 3, 4]},
                       { search: "displ",  expected: [5, 4]},
                       { search: "displa", expected: [5]} ];

const nickNames = [ { search: "n",      expected: [4, 5, 0, 1, 2, 3] },
                    { search: "ni",     expected: [0, 5, 1, 2, 3] },
                    { search: "nic",    expected: [1, 5, 2, 3] },
                    { search: "nick",   expected: [2, 5, 3] },
                    { search: "nickn",  expected: [3, 5] },
                    { search: "nickna", expected: [5] } ];

const emails = [ { search: "e",     expected: [0, 1, 2, 3, 4, 5, 7, 8, 9] },
                 { search: "em",    expected: [0, 1, 2, 4, 5] },
                 { search: "ema",   expected: [0, 1, 2, 5] },
                 { search: "emai",  expected: [1, 2, 5] },
                 { search: "email", expected: [2, 5] } ];

// "l" case tested above
const lists = [ { search: "li", expected: [6, 7, 8, 5, 0, 1, 2, 3, 4] },
                { search: "lis", expected: [6, 7] },
                { search: "list", expected: [6] },
                { search: "t", expected: [6, 7, 8, 9, 5, 0, 1, 4] },
                { search: "te", expected: [7, 8, 9, 5] },
                { search: "tes", expected: [8, 9, 5] },
                { search: "test", expected: [9, 5] },
                { search: "abcdef", expected: [9] } // Bug 441586
              ];

const bothNames = [ { search: "f l",            expected: [5, 0, 1, 2, 3, 4, 9] },
                    { search: "l f",            expected: [5, 0, 1, 2, 3, 4, 9] },
                    { search: "firstn lastna",  expected: [5] },
                    { search: "lastna firstna", expected: [5] } ];

const inputs = [ firstNames, lastNames, displayNames, nickNames, emails,
                 lists, bothNames ];

function acObserver() {}

acObserver.prototype = {
  _search: null,
  _result: null,

  onSearchResult: function (aSearch, aResult) {
    this._search = aSearch;
    this._result = aResult;
  }
};

function run_test() {
  // Copy the data files into place
  var testAB = do_get_file("data/autocomplete.mab");

  testAB.copyTo(do_get_profile(), kPABData.fileName);

  testAB = do_get_file("data/autocomplete2.mab");

  testAB.copyTo(do_get_profile(), kCABData.fileName);

  // Test - Create a new search component

  var acs = Components.classes["@mozilla.org/autocomplete/search;1?name=addrbook"]
    .getService(Components.interfaces.nsIAutoCompleteSearch);

  var obs = new acObserver();
  let obsNews = new acObserver();
  let obsFollowup = new acObserver();

  // Test - Check disabling of autocomplete

  Services.prefs.setBoolPref("mail.enable_autocomplete", false);

  let param = JSON.stringify({ type: "addr_to"  });
  let paramNews = JSON.stringify({ type: "addr_newsgroups"  });
  let paramFollowup = JSON.stringify({ type: "addr_followup"  });

  acs.startSearch("abc", param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, "abc");
  do_check_eq(obs._result.searchResult, ACR.RESULT_NOMATCH);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 0);

  // Test - Check Enabling of autocomplete, but with empty string.

  Services.prefs.setBoolPref("mail.enable_autocomplete", true);

  acs.startSearch(null, param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, null);
  do_check_eq(obs._result.searchResult, ACR.RESULT_IGNORED);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 0);
  do_check_eq(obs._result.defaultIndex, -1);

  // Test - Check ignoring result with comma

  acs.startSearch("a,b", param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, "a,b");
  do_check_eq(obs._result.searchResult, ACR.RESULT_IGNORED);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 0);
  do_check_eq(obs._result.defaultIndex, -1);

  // Test - No matches

  acs.startSearch("asjdkljdgfjglkfg", param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, "asjdkljdgfjglkfg");
  do_check_eq(obs._result.searchResult, ACR.RESULT_NOMATCH);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 0);
  do_check_eq(obs._result.defaultIndex, -1);

  // Test - Matches

  // Basic quick-check
  acs.startSearch("email", param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, "email");
  do_check_eq(obs._result.searchResult, ACR.RESULT_SUCCESS);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 2);
  do_check_eq(obs._result.defaultIndex, 0);

  do_check_eq(obs._result.getValueAt(0), "dis <email@foo.invalid>");
  do_check_eq(obs._result.getLabelAt(0), "dis <email@foo.invalid>");
  do_check_eq(obs._result.getCommentAt(0), "");
  do_check_eq(obs._result.getStyleAt(0), "local-abook");
  do_check_eq(obs._result.getImageAt(0), "");

  // quick-check that nothing is found for addr_newsgroups
  acs.startSearch("email", paramNews, null, obsNews);
  do_check_true(obsNews._result == null || obsNews._result.matchCount == 0);

  // quick-check that nothing is found for  addr_followup
  acs.startSearch("a@b", paramFollowup, null, obsFollowup);
  do_check_true(obsFollowup._result == null || obsFollowup._result.matchCount == 0);

  // Now quick-check with the address book name in the comment column.
  Services.prefs.setIntPref("mail.autoComplete.commentColumn", 1);

  acs.startSearch("email", param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, "email");
  do_check_eq(obs._result.searchResult, ACR.RESULT_SUCCESS);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 2);
  do_check_eq(obs._result.defaultIndex, 0);

  do_check_eq(obs._result.getValueAt(0), "dis <email@foo.invalid>");
  do_check_eq(obs._result.getLabelAt(0), "dis <email@foo.invalid>");
  do_check_eq(obs._result.getCommentAt(0), kPABData.dirName);
  do_check_eq(obs._result.getStyleAt(0), "local-abook");
  do_check_eq(obs._result.getImageAt(0), "");

  // Check input with different case
  acs.startSearch("EMAIL", param, null, obs);

  do_check_eq(obs._search, acs);
  do_check_eq(obs._result.searchString, "EMAIL");
  do_check_eq(obs._result.searchResult, ACR.RESULT_SUCCESS);
  do_check_eq(obs._result.errorDescription, null);
  do_check_eq(obs._result.matchCount, 2);
  do_check_eq(obs._result.defaultIndex, 0);

  do_check_eq(obs._result.getValueAt(0), "dis <email@foo.invalid>");
  do_check_eq(obs._result.getLabelAt(0), "dis <email@foo.invalid>");
  do_check_eq(obs._result.getCommentAt(0), kPABData.dirName);
  do_check_eq(obs._result.getStyleAt(0), "local-abook");
  do_check_eq(obs._result.getImageAt(0), "");


  // Now check multiple matches
  function checkInputItem(element, index, array) {
    print("Search #" + index + ": search=" + element.search);
    acs.startSearch(element.search, param, null, obs);

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
      do_check_eq(obs._result.getCommentAt(i), results[element.expected[i]].dirName);
      do_check_eq(obs._result.getStyleAt(i), "local-abook");
      do_check_eq(obs._result.getImageAt(i), "");
    }
  }
  function checkInputSet(element, index, array) {
    element.forEach(checkInputItem);
  }

  inputs.forEach(checkInputSet);


  // Test - Popularity Index
  print("Checking by popularity index:");
  let pab = MailServices.ab.getDirectory(kPABData.URI);

  var childCards = pab.childCards;

  while (childCards.hasMoreElements()) {
    var card = childCards.getNext().QueryInterface(Ci.nsIAbCard);

    if (card.isMailList)
      continue;

    switch (card.displayName) {
    case "dis":
    case "disp":
      card.setProperty("PopularityIndex", 4);
      break;
    case "displ":
      card.setProperty("PopularityIndex", 5);
      break;
    case "d":
      card.setProperty("PopularityIndex", 1);
      break;
    case "di":
      card.setProperty("PopularityIndex", 20);
      break;
    default:
      break;
    }

    pab.modifyCard(card);
  }

  const popularitySearch = [ { search: "d",      expected: [1, 4, 2, 3, 0, 5, 9] },
                             { search: "di",     expected: [1, 4, 2, 3, 5] },
                             { search: "dis",    expected: [4, 2, 3, 5] },
                             { search: "disp",   expected: [4, 3, 5] },
                             { search: "displ",  expected: [4, 5] },
                             { search: "displa", expected: [5] } ];

  popularitySearch.forEach(checkInputItem);
};
