/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains helper methods for dealing with addressbook search URIs.
 */

this.EXPORTED_SYMBOLS = ["getSearchTokens", "generateQueryURI", "encodeABTermValue"];

/**
 * Parse the multiword search string to extract individual search terms
 * (separated on the basis of spaces) or quoted exact phrases to search
 * against multiple fields of the addressbook cards.
 *
 * @param aSearchString The full search string entered by the user.
 *
 * @return an array of separated search terms from the full search string.
 */
function getSearchTokens(aSearchString) {
  let searchString = aSearchString.trim();
  if (searchString == "")
    return [];

  let quotedTerms = [];

  // Split up multiple search words to create a *foo* and *bar* search against
  // search fields, using the OR-search template from modelQuery for each word.
  // If the search query has quoted terms as "foo bar", extract them as is.
  let startIndex;
  while ((startIndex = searchString.indexOf('"')) != -1) {
    let endIndex = searchString.indexOf('"', startIndex + 1);
    if (endIndex == -1)
      endIndex = searchString.length;

    quotedTerms.push(searchString.substring(startIndex + 1, endIndex));
    let query = searchString.substring(0, startIndex);
    if (endIndex < searchString.length)
      query += searchString.substr(endIndex + 1);

    searchString = query.trim();
  }

  let searchWords = [];
  if (searchString.length != 0) {
    searchWords = quotedTerms.concat(searchString.split(/\s+/));
  } else {
    searchWords = quotedTerms;
  }

  return searchWords;
}

/*
 * Given a database model query and a list of search tokens,
 * return query URI.
 *
 * @param aModelQuery database model query
 * @param aSearchWords an array of search tokens.
 *
 * @return query URI.
 */
function generateQueryURI(aModelQuery, aSearchWords) {
  // If there are no search tokens, we simply return an empty string.
  if (!aSearchWords || aSearchWords.length == 0)
    return "";

  let queryURI = "";
  aSearchWords.forEach(searchWord =>
    queryURI += aModelQuery.replace(/@V/g, encodeABTermValue(searchWord)));

  // queryURI has all the (or(...)) searches, link them up with (and(...)).
  queryURI = "?(and" + queryURI + ")";

  return queryURI;
}


/**
 * Encode the string passed as value into an addressbook search term.
 * The '(' and ')' characters are special for the addressbook
 * search query language, but are not escaped in encodeURIComponent()
 * so must be done manually on top of it.
 */
function encodeABTermValue(aString) {
  return encodeURIComponent(aString).replace(/\(/g, "%28").replace(/\)/g, "%29");
}
