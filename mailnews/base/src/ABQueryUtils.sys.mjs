/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains helper methods for dealing with addressbook search URIs.
 */

/**
 * Parse the multiword search string to extract individual search terms
 * (separated on the basis of spaces) or quoted exact phrases to search
 * against multiple fields of the addressbook cards.
 *
 * @param {string} aSearchString - The full search string entered by the user.
 *
 * @returns {Array} Array of separated search terms from the full search string.
 */
export function getSearchTokens(aSearchString) {
  // Trim leading and trailing whitespace and comma(s) to prevent empty search
  // words when splitting unquoted parts of search string below.
  let searchString = aSearchString
    .replace(/^[,\s]+/, "")
    .replace(/[,\s]+$/, "");
  if (searchString == "") {
    return [];
  }

  const quotedTerms = [];

  // Split up multiple search words to create a *foo* and *bar* search against
  // search fields, using the OR-search template from modelQuery for each word.
  // If the search query has quoted terms like "foo bar", extract them as is.
  let startIndex;
  while ((startIndex = searchString.indexOf('"')) != -1) {
    let endIndex = searchString.indexOf('"', startIndex + 1);
    if (endIndex == -1) {
      endIndex = searchString.length;
    }

    quotedTerms.push(searchString.substring(startIndex + 1, endIndex));
    let query = searchString.substring(0, startIndex);
    if (endIndex < searchString.length) {
      query += searchString.substr(endIndex + 1);
    }

    searchString = query.trim();
  }

  let searchWords = [];
  if (searchString.length != 0) {
    // Split non-quoted search terms on whitespace and comma(s): Allow flexible
    // incremental searches, and prevent false negatives for |Last, First| with
    // |View > Show Name As > Last, First|, where comma is not found in data.
    searchWords = quotedTerms.concat(searchString.split(/[,\s]+/));
  } else {
    searchWords = quotedTerms;
  }

  return searchWords;
}

/**
 * For AB quicksearch or recipient autocomplete, get the normal or phonetic model
 * query URL part from prefs, allowing users to customize these searches.
 *
 * @param {string} aBasePrefName - The full pref name of default, non-phonetic
 *   model query, e.g. mail.addr_book.quicksearchquery.format. If phonetic
 *   search is used, corresponding pref must exist:
 *   e.g. mail.addr_book.quicksearchquery.format.phonetic
 * @returns {boolean} depending on mail.addr_book.show_phonetic_fields pref,
 *   the value of aBasePrefName or aBasePrefName + ".phonetic"
 */
export function getModelQuery(aBasePrefName) {
  let modelQuery = "";
  if (
    Services.prefs.getComplexValue(
      "mail.addr_book.show_phonetic_fields",
      Ci.nsIPrefLocalizedString
    ).data == "true"
  ) {
    modelQuery = Services.prefs.getCharPref(aBasePrefName + ".phonetic");
  } else {
    modelQuery = Services.prefs.getCharPref(aBasePrefName);
  }
  // remove leading "?" to migrate existing customized values for mail.addr_book.quicksearchquery.format
  // todo: could this be done in a once-off migration at install time to avoid repetitive calls?
  if (modelQuery.startsWith("?")) {
    modelQuery = modelQuery.slice(1);
  }
  return modelQuery;
}

/**
 * Check if the currently used pref with the model query was customized by user.
 *
 * @param {string} aBasePrefName - The full pref name of default, non-phonetic
 *   model query, e.g. mail.addr_book.quicksearchquery.format
 *   If phonetic search is used, corresponding pref must exist:
 *   e.g. mail.addr_book.quicksearchquery.format.phonetic
 * @returns {boolean} true or false
 */
export function modelQueryHasUserValue(aBasePrefName) {
  if (
    Services.prefs.getComplexValue(
      "mail.addr_book.show_phonetic_fields",
      Ci.nsIPrefLocalizedString
    ).data == "true"
  ) {
    return Services.prefs.prefHasUserValue(aBasePrefName + ".phonetic");
  }
  return Services.prefs.prefHasUserValue(aBasePrefName);
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
export function generateQueryURI(aModelQuery, aSearchWords) {
  // If there are no search tokens, we simply return an empty string.
  if (!aSearchWords || aSearchWords.length == 0) {
    return "";
  }

  let queryURI = "";
  aSearchWords.forEach(
    searchWord =>
      (queryURI += aModelQuery.replace(/@V/g, encodeABTermValue(searchWord)))
  );

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
export function encodeABTermValue(aString) {
  return encodeURIComponent(aString)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}
