/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var {
  getSearchTokens,
  getModelQuery,
  modelQueryHasUserValue,
  generateQueryURI,
} = ChromeUtils.import("resource:///modules/ABQueryUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var ACR = Ci.nsIAutoCompleteResult;
var nsIAbAutoCompleteResult = Ci.nsIAbAutoCompleteResult;

function nsAbAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this._searchResults = []; // final results
  this.searchString = aSearchString;
  this._collectedValues = new Map(); // temporary unsorted results
  // Get model query from pref; this will return mail.addr_book.autocompletequery.format.phonetic
  // if mail.addr_book.show_phonetic_fields == true
  this.modelQuery = getModelQuery("mail.addr_book.autocompletequery.format");
  // check if the currently active model query has been modified by user
  this._modelQueryHasUserValue = modelQueryHasUserValue(
    "mail.addr_book.autocompletequery.format"
  );
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

  getValueAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getLabelAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  getCommentAt(aIndex) {
    return this._searchResults[aIndex].comment;
  },

  getStyleAt(aIndex) {
    return "local-abook";
  },

  getImageAt(aIndex) {
    return "";
  },

  getFinalCompleteValueAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  removeValueAt(aRowIndex, aRemoveFromDB) {},

  // nsIAbAutoCompleteResult

  getCardAt(aIndex) {
    return this._searchResults[aIndex].card;
  },

  getEmailToUse(aIndex) {
    return this._searchResults[aIndex].emailToUse;
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([ACR, nsIAbAutoCompleteResult]),
};

function nsAbAutoCompleteSearch() {}

nsAbAutoCompleteSearch.prototype = {
  // For component registration
  classID: Components.ID("2f946df9-114c-41fe-8899-81f10daf4f0c"),

  // This is set from a preference,
  // 0 = no comment column, 1 = name of address book this card came from
  // Other numbers currently unused (hence default to zero)
  _commentColumn: 0,
  _parser: MailServices.headerParser,
  _abManager: MailServices.ab,
  applicableHeaders: new Set(["addr_to", "addr_cc", "addr_bcc", "addr_reply"]),

  // Private methods

  /**
   * Returns the popularity index for a given card. This takes account of a
   * translation bug whereby Thunderbird 2 stores its values in mork as
   * hexadecimal, and Thunderbird 3 stores as decimal.
   *
   * @param aDirectory  The directory that the card is in.
   * @param aCard       The card to return the popularity index for.
   */
  _getPopularityIndex(aDirectory, aCard) {
    let popularityValue = aCard.getProperty("PopularityIndex", "0");
    let popularityIndex = parseInt(popularityValue);

    // If we haven't parsed it the first time round, parse it as hexadecimal
    // and repair so that we don't have to keep repairing.
    if (isNaN(popularityIndex)) {
      popularityIndex = parseInt(popularityValue, 16);

      // If its still NaN, just give up, we shouldn't ever get here.
      if (isNaN(popularityIndex)) {
        popularityIndex = 0;
      }

      // Now store this change so that we're not changing it each time around.
      if (!aDirectory.readOnly) {
        aCard.setProperty("PopularityIndex", popularityIndex);
        try {
          aDirectory.modifyCard(aCard);
        } catch (ex) {
          Cu.reportError(ex);
        }
      }
    }
    return popularityIndex;
  },

  /**
   * Gets the score of the (full) address, given the search input. We want
   * results that match the beginning of a "word" in the result to score better
   * than a result that matches only in the middle of the word.
   *
   * @param aCard - the card whose score is being decided
   * @param aAddress - full lower-cased address, including display name and address
   * @param aSearchString - search string provided by user
   * @return a score; a higher score is better than a lower one
   */
  _getScore(aCard, aAddress, aSearchString) {
    const BEST = 100;
    // First check whether the search string matches the email for the card
    const addressStartIdx = aAddress.indexOf("<") + 1;
    const address = aAddress.substr(addressStartIdx, aAddress.length - 1);
    if (address == aSearchString) {
      return BEST + 1;
    }

    // Then check if the search term provided by the user is
    // the nick name for the card or at least in the beginning of it.
    let nick = aCard.getProperty("NickName", "").toLocaleLowerCase();
    aSearchString = aSearchString.toLocaleLowerCase();
    if (nick == aSearchString) {
      return BEST + 1;
    }
    if (nick.indexOf(aSearchString) == 0) {
      return BEST;
    }

    // We'll do this case-insensitively and ignore the domain.
    let atIdx = aAddress.lastIndexOf("@");
    if (atIdx != -1) {
      // mail lists don't have an @
      aAddress = aAddress.substr(0, atIdx);
    }
    let idx = aAddress.indexOf(aSearchString);
    if (idx == 0) {
      return BEST;
    }
    if (idx == -1) {
      return 0;
    }

    // We want to treat firstname, lastname and word boundary(ish) parts of
    // the email address the same. E.g. for "John Doe (:xx) <jd.who@example.com>"
    // all of these should score the same: "John", "Doe", "xx",
    // ":xx", "jd", "who".
    let prevCh = aAddress.charAt(idx - 1);
    if (/[ :."'(\-_<&]/.test(prevCh)) {
      return BEST;
    }

    // The match was inside a word -> we don't care about the position.
    return 0;
  },

  /**
   * Searches cards in the given directory. If a card is matched (and isn't
   * a mailing list) then the function will add a result for each email address
   * that exists.
   *
   * @param searchQuery  The boolean search query to use.
   * @param directory    An nsIAbDirectory to search.
   * @param result       The result element to append results to.
   */
  _searchCards(searchQuery, directory, result) {
    let childCards;
    try {
      childCards = this._abManager.getDirectory(directory.URI + searchQuery)
        .childCards;
    } catch (e) {
      Cu.reportError(
        "Error running addressbook query '" + searchQuery + "': " + e
      );
      return;
    }

    // Cache this values to save going through xpconnect each time
    var commentColumn = this._commentColumn == 1 ? directory.dirName : "";

    // Now iterate through all the cards.
    while (childCards.hasMoreElements()) {
      var card = childCards.getNext();

      if (card instanceof Ci.nsIAbCard) {
        if (card.isMailList) {
          this._addToResult(commentColumn, directory, card, "", true, result);
        } else {
          let email = card.primaryEmail;
          if (email) {
            this._addToResult(
              commentColumn,
              directory,
              card,
              email,
              true,
              result
            );
          }

          email = card.getProperty("SecondEmail", "");
          if (email) {
            this._addToResult(
              commentColumn,
              directory,
              card,
              email,
              false,
              result
            );
          }
        }
      }
    }
  },

  /**
   * Checks the parent card and email address of an autocomplete results entry
   * from a previous result against the search parameters to see if that entry
   * should still be included in the narrowed-down result.
   *
   * @param aCard        The card to check.
   * @param aEmailToUse  The email address to check against.
   * @param aSearchWords Array of words in the multi word search string.
   * @return             True if the card matches the search parameters, false
   *                     otherwise.
   */
  _checkEntry(aCard, aEmailToUse, aSearchWords) {
    // Joining values of many fields in a single string so that a single
    // search query can be fired on all of them at once. Separating them
    // using spaces so that field1=> "abc" and field2=> "def" on joining
    // shouldn't return true on search for "bcd".
    // Note: This should be constructed from model query pref using
    // getModelQuery("mail.addr_book.autocompletequery.format")
    // but for now we hard-code the default value equivalent of the pref here
    // or else bail out before and reconstruct the full c++ query if the pref
    // has been customized (modelQueryHasUserValue), so that we won't get here.
    let cumulativeFieldText =
      aCard.displayName +
      " " +
      aCard.firstName +
      " " +
      aCard.lastName +
      " " +
      aEmailToUse +
      " " +
      aCard.getProperty("NickName", "");
    if (aCard.isMailList) {
      cumulativeFieldText += " " + aCard.getProperty("Notes", "");
    }
    cumulativeFieldText = cumulativeFieldText.toLocaleLowerCase();

    return aSearchWords.every(String.prototype.includes, cumulativeFieldText);
  },

  /**
   * Checks to see if an emailAddress (name/address) is a duplicate of an
   * existing entry already in the results. If the emailAddress is found, it
   * will remove the existing element if the popularity of the new card is
   * higher than the previous card.
   *
   * @param directory       The directory that the card is in.
   * @param card            The card that could be a duplicate.
   * @param lcEmailAddress  The emailAddress (name/address combination) to check
   *                        for duplicates against. Lowercased.
   * @param currentResults  The current results list.
   */
  _checkDuplicate(directory, card, lcEmailAddress, currentResults) {
    let existingResult = currentResults._collectedValues.get(lcEmailAddress);
    if (!existingResult) {
      return false;
    }

    let popIndex = this._getPopularityIndex(directory, card);
    // It's a duplicate, is the new one more popular?
    if (popIndex > existingResult.popularity) {
      // Yes it is, so delete this element, return false and allow
      // _addToResult to sort the new element into the correct place.
      currentResults._collectedValues.delete(lcEmailAddress);
      return false;
    }
    // Not more popular, but still a duplicate. Return true and _addToResult
    // will just forget about it.
    return true;
  },

  /**
   * Adds a card to the results list if it isn't a duplicate. The function will
   * order the results by popularity.
   *
   * @param commentColumn  The text to be displayed in the comment column
   *                       (if any).
   * @param directory      The directory that the card is in.
   * @param card           The card being added to the results.
   * @param emailToUse     The email address from the card that should be used
   *                       for this result.
   * @param isPrimaryEmail Is the emailToUse the primary email? Set to true if
   *                       it is the case. For mailing lists set it to true.
   * @param result         The result to add the new entry to.
   */
  _addToResult(
    commentColumn,
    directory,
    card,
    emailToUse,
    isPrimaryEmail,
    result
  ) {
    let mbox = this._parser.makeMailboxObject(
      card.displayName,
      card.isMailList
        ? card.getProperty("Notes", "") || card.displayName
        : emailToUse
    );
    if (!mbox.email) {
      return;
    }

    let emailAddress = mbox.toString();
    let lcEmailAddress = emailAddress.toLocaleLowerCase();

    // If it is a duplicate, then just return and don't add it. The
    // _checkDuplicate function deals with it all for us.
    if (this._checkDuplicate(directory, card, lcEmailAddress, result)) {
      return;
    }

    result._collectedValues.set(lcEmailAddress, {
      value: emailAddress,
      comment: commentColumn,
      card,
      isPrimaryEmail,
      emailToUse,
      popularity: this._getPopularityIndex(directory, card),
      score: this._getScore(card, lcEmailAddress, result.searchString),
    });
  },

  // nsIAutoCompleteSearch

  /**
   * Starts a search based on the given parameters.
   *
   * @see nsIAutoCompleteSearch for parameter details.
   *
   * It is expected that aSearchParam contains the identity (if any) to use
   * for determining if an address book should be autocompleted against.
   */
  startSearch(aSearchString, aSearchParam, aPreviousResult, aListener) {
    let params = aSearchParam ? JSON.parse(aSearchParam) : {};
    var result = new nsAbAutoCompleteResult(aSearchString);
    if ("type" in params && !this.applicableHeaders.has(params.type)) {
      result.searchResult = ACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    let fullString = aSearchString && aSearchString.trim().toLocaleLowerCase();

    // If the search string is empty, or contains a comma, or the user
    // hasn't enabled autocomplete, then just return no matches or the
    // result ignored.
    // The comma check is so that we don't autocomplete against the user
    // entering multiple addresses.
    if (!fullString || aSearchString.includes(",")) {
      result.searchResult = ACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    // Array of all the terms from the fullString search query
    // (separated on the basis of spaces or exact terms on the
    // basis of quotes).
    let searchWords = getSearchTokens(fullString);

    // Find out about the comment column
    this._commentColumn = Services.prefs.getIntPref(
      "mail.autoComplete.commentColumn",
      0
    );

    if (
      aPreviousResult instanceof nsIAbAutoCompleteResult &&
      aSearchString.startsWith(aPreviousResult.searchString) &&
      aPreviousResult.searchResult == ACR.RESULT_SUCCESS &&
      !result._modelQueryHasUserValue &&
      result.modelQuery == aPreviousResult.modelQuery
    ) {
      // We have successful previous matches, and model query has not changed since
      // previous search, therefore just iterate through the list of previous result
      // entries and reduce as appropriate (via _checkEntry function).
      // Test for model query change is required: when reverting back from custom to
      // default query, result._modelQueryHasUserValue==false, but we must bail out.
      // Todo: However, if autocomplete model query has been customized, we fall
      // back to using the full query again instead of reducing result list in js;
      // The full query might be less performant as it's fired against entire AB,
      // so we should try morphing the query for js. We can't use the _checkEntry
      // js query yet because it is hardcoded (mimic default model query).
      // At least we now allow users to customize their autocomplete model query...
      for (let i = 0; i < aPreviousResult.matchCount; ++i) {
        let card = aPreviousResult.getCardAt(i);
        let email = aPreviousResult.getEmailToUse(i);
        if (this._checkEntry(card, email, searchWords)) {
          // Add matches into the results array. We re-sort as needed later.
          result._searchResults.push({
            value: aPreviousResult.getValueAt(i),
            comment: aPreviousResult.getCommentAt(i),
            card,
            isPrimaryEmail: card.primaryEmail == email,
            emailToUse: email,
            popularity: parseInt(card.getProperty("PopularityIndex", "0")),
            score: this._getScore(
              card,
              aPreviousResult.getValueAt(i).toLocaleLowerCase(),
              fullString
            ),
          });
        }
      }
    } else {
      // Construct the search query from pref; using a query means we can
      // optimise on running the search through c++ which is better for string
      // comparisons (_checkEntry is relatively slow).
      // When user's fullstring search expression is a multiword query, search
      // for each word separately so that each result contains all the words
      // from the fullstring in the fields of the addressbook card
      // (see bug 558931 for explanations).
      // Use helper method to split up search query to multi-word search
      // query against multiple fields.
      let searchWords = getSearchTokens(fullString);
      let searchQuery = generateQueryURI(result.modelQuery, searchWords);

      // Now do the searching
      let allABs = this._abManager.directories;

      // We're not going to bother searching sub-directories, currently the
      // architecture forces all cards that are in mailing lists to be in ABs as
      // well, therefore by searching sub-directories (aka mailing lists) we're
      // just going to find duplicates.
      while (allABs.hasMoreElements()) {
        let dir = allABs.getNext();
        if (
          dir instanceof Ci.nsIAbDirectory &&
          dir.useForAutocomplete("idKey" in params ? params.idKey : null)
        ) {
          this._searchCards(searchQuery, dir, result);
        }
      }

      result._searchResults = [...result._collectedValues.values()];
    }

    // Sort the results. Scoring may have changed so do it even if this is
    // just filtered previous results.
    result._searchResults.sort(function(a, b) {
      // Order by 1) descending score, then 2) descending popularity,
      // then 3) primary email before secondary for the same card, then
      // 4) by emails sorted alphabetically.
      return (
        b.score - a.score ||
        b.popularity - a.popularity ||
        (a.card == b.card && a.isPrimaryEmail ? -1 : 0) ||
        a.value.localeCompare(b.value)
      );
    });

    if (result.matchCount) {
      result.searchResult = ACR.RESULT_SUCCESS;
      result.defaultIndex = 0;
    }

    aListener.onSearchResult(this, result);
  },

  stopSearch() {},

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([Ci.nsIAutoCompleteSearch]),
};

// Module

var components = [nsAbAutoCompleteSearch];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
