/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

var kACR = Ci.nsIAutoCompleteResult;
var kSupportedTypes = new Set(["addr_newsgroups", "addr_followup"]);

function NewsAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this._searchResults = [];
  this.searchString = aSearchString;
}

NewsAutoCompleteResult.prototype = {
  _searchResults: null,

  // nsIAutoCompleteResult

  searchString: null,
  searchResult: kACR.RESULT_NOMATCH,
  defaultIndex: -1,
  errorDescription: null,

  get matchCount() {
    return this._searchResults.length;
  },

  getValueAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getLabelAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getCommentAt(aIndex) {
    return this._searchResults[aIndex].comment;
  },

  getStyleAt() {
    return "subscribed-news-abook";
  },

  getImageAt() {
    return "";
  },

  getFinalCompleteValueAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  removeValueAt() {},

  // nsISupports

  QueryInterface: ChromeUtils.generateQI(["nsIAutoCompleteResult"]),
};

export function NewsAutoCompleteSearch() {}

NewsAutoCompleteSearch.prototype = {
  // For component registration
  classDescription: "Newsgroup Autocomplete",

  cachedAccountKey: "",
  cachedServer: null,

  /**
   * Find the newsgroup server associated with the given accountKey.
   *
   * @param accountKey  The key of the account.
   * @returns The incoming news server (or null if one does not exist).
   */
  _findServer(accountKey) {
    const account = MailServices.accounts.getAccount(accountKey);

    if (account.incomingServer.type == "nntp") {
      return account.incomingServer;
    }
    return null;
  },

  // nsIAutoCompleteSearch
  startSearch(aSearchString, aSearchParam, aPreviousResult, aListener) {
    const params = aSearchParam ? JSON.parse(aSearchParam) : {};
    const result = new NewsAutoCompleteResult(aSearchString);
    if (
      !("type" in params) ||
      !("accountKey" in params) ||
      !kSupportedTypes.has(params.type)
    ) {
      result.searchResult = kACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    if ("accountKey" in params && params.accountKey != this.cachedAccountKey) {
      this.cachedAccountKey = params.accountKey;
      this.cachedServer = this._findServer(params.accountKey);
    }

    if (this.cachedServer) {
      for (const curr of this.cachedServer.rootFolder.subFolders) {
        if (curr.prettyName.includes(aSearchString)) {
          result._searchResults.push({
            value: curr.prettyName,
            comment: this.cachedServer.prettyName,
          });
        }
      }
    }

    if (result.matchCount) {
      result.searchResult = kACR.RESULT_SUCCESS;
      // If the user does not select anything, use the first entry:
      result.defaultIndex = 0;
    }
    aListener.onSearchResult(this, result);
  },

  stopSearch() {},

  // nsISupports

  QueryInterface: ChromeUtils.generateQI(["nsIAutoCompleteSearch"]),
};
