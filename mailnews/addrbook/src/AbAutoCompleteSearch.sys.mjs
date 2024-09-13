/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import {
  getSearchTokens,
  getModelQuery,
  modelQueryHasUserValue,
  generateQueryURI,
} from "resource:///modules/ABQueryUtils.sys.mjs";

var ACR = Ci.nsIAutoCompleteResult;

var MAX_ASYNC_RESULTS = 100;

function nsAbAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this.asyncDirectories = [];
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

  getStyleAt() {
    return "local-abook";
  },

  getImageAt() {
    return "";
  },

  getFinalCompleteValueAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  removeValueAt() {},

  // nsIAbAutoCompleteResult

  getCardAt(aIndex) {
    return this._searchResults[aIndex].card;
  },

  getEmailToUse(aIndex) {
    return this._searchResults[aIndex].emailToUse;
  },

  isCompleteResult(aIndex) {
    return this._searchResults[aIndex].isCompleteResult;
  },

  modelQuery: null,
  asyncDirectories: null,

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([
    "nsIAutoCompleteResult",
    "nsIAbAutoCompleteResult",
  ]),
};

export function AbAutoCompleteSearch() {}

AbAutoCompleteSearch.prototype = {
  // This is set from a preference,
  // 0 = no comment column, 1 = name of address book this card came from
  // Other numbers currently unused (hence default to zero)
  _commentColumn: 0,
  _parser: MailServices.headerParser,
  _abManager: MailServices.ab,
  applicableHeaders: new Set(["addr_to", "addr_cc", "addr_bcc", "addr_reply"]),
  _result: null,

  // Private methods

  /**
   * Returns the popularity index for a given card. This takes account of a
   * translation bug whereby Thunderbird 2 stores its values in mork as
   * hexadecimal, and Thunderbird 3 stores as decimal.
   *
   * @param {nsIAbDirectory} aDirectory - The directory that the card is in.
   * @param {nsIAbCard} aCard - The card to return the popularity index for.
   */
  _getPopularityIndex(aDirectory, aCard) {
    const popularityValue = aCard.getProperty("PopularityIndex", "0");
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
          console.error(ex);
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
   * @param {nsIAbCard} aCard - The card whose score is being decided.
   * @param {string} aAddress - Full lower-cased address, including display
   *   name and address.
   * @param {string} aSearchString - Search string provided by user.
   * @returns {integer} a score; a higher score is better than a lower one.
   */
  _getScore(aCard, aAddress, aSearchString) {
    const BEST = 100;

    // We will firstly check if the search term provided by the user
    // is the nick name for the card or at least in the beginning of it.
    const nick = aCard.getProperty("NickName", "").toLocaleLowerCase();
    aSearchString = aSearchString.toLocaleLowerCase();
    if (nick == aSearchString) {
      return BEST + 1;
    }
    if (nick.indexOf(aSearchString) == 0) {
      return BEST;
    }

    // We'll do this case-insensitively and ignore the domain.
    const atIdx = aAddress.lastIndexOf("@");
    if (atIdx != -1) {
      // mail lists don't have an @
      aAddress = aAddress.substr(0, atIdx);
    }
    const idx = aAddress.indexOf(aSearchString);
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
    const prevCh = aAddress.charAt(idx - 1);
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
   * @param {string} searchQuery - The boolean search query to use.
   * @param {string} searchString - The original search string.
   * @param {nsIAbDirectory} directory - An nsIAbDirectory to search.
   * @param {nsIAbAutoCompleteResult} result - The result element to append
   *   results to.
   */
  _searchCards(searchQuery, searchString, directory, result) {
    // Cache this values to save going through xpconnect each time
    const commentColumn = this._commentColumn == 1 ? directory.dirName : "";

    if (searchQuery[0] == "?") {
      searchQuery = searchQuery.substring(1);
    }
    return new Promise(resolve => {
      directory.search(searchQuery, searchString, {
        onSearchFoundCard: card => {
          if (card.isMailList) {
            this._addToResult(commentColumn, directory, card, "", true, result);
          } else {
            let first = true;
            for (const emailAddress of card.emailAddresses) {
              this._addToResult(
                commentColumn,
                directory,
                card,
                emailAddress,
                first,
                result
              );
              first = false;
            }
          }
        },
        onSearchFinished() {
          resolve();
        },
      });
    });
  },

  /**
   * Checks the parent card and email address of an autocomplete results entry
   * from a previous result against the search parameters to see if that entry
   * should still be included in the narrowed-down result.
   *
   * @param {nsIAbCard} aCard - The card to check.
   * @param {string} aEmailToUse - The email address to check against.
   * @param {string[]} aSearchWords - Words in the multi word search string.
   * @returns {boolean} True if the card matches the search parameters,
   *   false otherwise.
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
   * @param {nsIAbDirectory} directory - The directory that the card is in.
   * @param {nsIAbCard} card - The card that could be a duplicate.
   * @param {string} lcEmailAddress - The emailAddress (name/address
   *   combination) to check for duplicates against. Lowercased.
   * @param {nsIAbAutoCompleteResult} currentResults - The current results list.
   */
  _checkDuplicate(directory, card, lcEmailAddress, currentResults) {
    const existingResult = currentResults._collectedValues.get(lcEmailAddress);
    if (!existingResult) {
      return false;
    }

    const popIndex = this._getPopularityIndex(directory, card);
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
   * @param {string} commentColumn - The text to be displayed in the comment
   *   column (if any).
   * @param {nsIAbDirectory} directory - The directory that the card is in.
   * @param {nsIAbCard} card - The card being added to the results.
   * @param {string} emailToUse - The email address from the card that should
   *   be used for this result.
   * @param {boolean} isPrimaryEmail - Is the emailToUse the primary email?
   *   Set to true if it is the case. For mailing lists set it to true.
   * @param {nsIAbAutoCompleteResult} result - The result to add the new entry to.
   */
  _addToResult(
    commentColumn,
    directory,
    card,
    emailToUse,
    isPrimaryEmail,
    result
  ) {
    const mbox = this._parser.makeMailboxObject(
      card.displayName,
      card.isMailList
        ? card.getProperty("Notes", "") || card.displayName
        : emailToUse
    );
    if (!mbox.email) {
      return;
    }

    const emailAddress = mbox.toString();
    const lcEmailAddress = emailAddress.toLocaleLowerCase();

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
      isCompleteResult: true,
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
  async startSearch(aSearchString, aSearchParam, aPreviousResult, aListener) {
    const params = aSearchParam ? JSON.parse(aSearchParam) : {};
    var result = new nsAbAutoCompleteResult(aSearchString);
    if ("type" in params && !this.applicableHeaders.has(params.type)) {
      result.searchResult = ACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    const fullString =
      aSearchString && aSearchString.trim().toLocaleLowerCase();

    // If the search string is empty, or the user hasn't enabled autocomplete,
    // then just return no matches or the result ignored.
    if (!fullString) {
      result.searchResult = ACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    // Array of all the terms from the fullString search query
    // (separated on the basis of spaces or exact terms on the
    // basis of quotes).
    const searchWords = getSearchTokens(fullString);

    // Find out about the comment column
    this._commentColumn = Services.prefs.getIntPref(
      "mail.autoComplete.commentColumn",
      0
    );

    let asyncDirectories = [];

    if (
      aPreviousResult instanceof Ci.nsIAbAutoCompleteResult &&
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
        if (aPreviousResult.isCompleteResult(i)) {
          const card = aPreviousResult.getCardAt(i);
          const email = aPreviousResult.getEmailToUse(i);
          if (this._checkEntry(card, email, searchWords)) {
            // Add matches into the results array. We re-sort as needed later.
            result._searchResults.push({
              value: aPreviousResult.getValueAt(i),
              comment: aPreviousResult.getCommentAt(i),
              card,
              isPrimaryEmail: card.primaryEmail == email,
              emailToUse: email,
              isCompleteResult: true,
              popularity: parseInt(card.getProperty("PopularityIndex", "0")),
              score: this._getScore(
                card,
                aPreviousResult.getValueAt(i).toLocaleLowerCase(),
                fullString
              ),
            });
          }
        }
      }

      asyncDirectories = aPreviousResult.asyncDirectories;
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
      const searchQuery = generateQueryURI(result.modelQuery, searchWords);

      // Now do the searching
      // We're not going to bother searching sub-directories, currently the
      // architecture forces all cards that are in mailing lists to be in ABs as
      // well, therefore by searching sub-directories (aka mailing lists) we're
      // just going to find duplicates.
      for (const dir of this._abManager.directories) {
        // A failure in one address book should no break the whole search.
        try {
          if (dir.useForAutocomplete("idKey" in params ? params.idKey : null)) {
            await this._searchCards(searchQuery, aSearchString, dir, result);
          } else if (dir.dirType == Ci.nsIAbManager.ASYNC_DIRECTORY_TYPE) {
            asyncDirectories.push(dir);
          }
        } catch (ex) {
          console.error(
            new Components.Exception(
              `Exception thrown by ${dir.URI}: ${ex.message}`,
              ex
            )
          );
        }
      }

      result._searchResults = [...result._collectedValues.values()];
      // Make sure a result with direct email match will be the one used.
      for (const sr of result._searchResults) {
        if (sr.emailToUse == fullString.replace(/.*<(.+@.+)>$/, "$1")) {
          sr.score = 100;
        }
      }
    }

    // Sort the results. Scoring may have changed so do it even if this is
    // just filtered previous results. Only local results are sorted,
    // because the autocomplete widget doesn't let us alter the order of
    // results that have already been notified.
    result._searchResults.sort(function (a, b) {
      // Order by 1) descending score, then 2) descending popularity,
      // then 3) any emails that actually match the search string,
      // 4) primary email before secondary for the same card, then
      // 5) by emails sorted alphabetically.
      return (
        b.score - a.score ||
        b.popularity - a.popularity ||
        (b.emailToUse.includes(aSearchString) &&
        !a.emailToUse.includes(aSearchString)
          ? 1
          : 0) ||
        (a.card == b.card && a.isPrimaryEmail ? -1 : 0) ||
        a.value.localeCompare(b.value)
      );
    });

    if (result.matchCount) {
      result.searchResult = ACR.RESULT_SUCCESS;
      result.defaultIndex = 0;
    }

    if (!asyncDirectories.length) {
      // We're done. Just return our result immediately.
      aListener.onSearchResult(this, result);
      return;
    }

    // Let the widget know the sync results we have so far.
    result.searchResult = result.matchCount
      ? ACR.RESULT_SUCCESS_ONGOING
      : ACR.RESULT_NOMATCH_ONGOING;
    aListener.onSearchResult(this, result);

    // Start searching our asynchronous autocomplete directories.
    this._result = result;
    const searches = new Set();
    for (const dir of asyncDirectories) {
      const comment = this._commentColumn == 1 ? dir.dirName : "";
      const cards = [];
      const searchListener = {
        onSearchFoundCard: card => {
          cards.push(card);
        },
        onSearchFinished: (status, isCompleteResult) => {
          if (this._result != result) {
            // The search was aborted, so give up.
            return;
          }
          searches.delete(searchListener);
          if (cards.length) {
            // Avoid overwhelming the UI with excessive results.
            if (cards.length > MAX_ASYNC_RESULTS) {
              cards.length = MAX_ASYNC_RESULTS;
              isCompleteResult = false;
            }
            // We can't guarantee to score the extension's results accurately so
            // we assume that the extension has sorted the results appropriately
            for (const card of cards) {
              const emailToUse = card.primaryEmail;
              const value = MailServices.headerParser
                .makeMailboxObject(card.displayName, emailToUse)
                .toString();
              result._searchResults.push({
                value,
                comment,
                card,
                emailToUse,
                isCompleteResult,
              });
            }
            if (!isCompleteResult) {
              // Next time perform a full search again to get better results.
              result.asyncDirectories.push(dir);
            }
          }
          if (result._searchResults.length) {
            result.searchResult = searches.size
              ? ACR.RESULT_SUCCESS_ONGOING
              : ACR.RESULT_SUCCESS;
            result.defaultIndex = 0;
          } else {
            result.searchResult = searches.size
              ? ACR.RESULT_NOMATCH_ONGOING
              : ACR.RESULT_NOMATCH;
          }
          aListener.onSearchResult(this, result);
        },
      };
      // Keep track of the pending searches so that we know when we've finished.
      searches.add(searchListener);
      dir.search(null, aSearchString, searchListener);
    }
  },

  stopSearch() {
    this._result = null;
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI(["nsIAutoCompleteSearch"]),
};
