/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

// nsAbLDAPAutoCompleteResult
// Derived from nsIAbAutoCompleteResult, provides a LDAP specific result
// implementation.

function nsAbLDAPAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this._searchResults = [];
  this.searchString = aSearchString;
}

nsAbLDAPAutoCompleteResult.prototype = {
  _searchResults: null,
  _commentColumn: "",

  // nsIAutoCompleteResult

  searchString: null,
  searchResult: Ci.nsIAutoCompleteResult.RESULT_NOMATCH,
  defaultIndex: -1,
  errorDescription: null,

  get matchCount() {
    return this._searchResults.length;
  },

  getLabelAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  getValueAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getCommentAt() {
    return this._commentColumn;
  },

  getStyleAt() {
    return this.searchResult == Ci.nsIAutoCompleteResult.RESULT_FAILURE
      ? "remote-err"
      : "remote-abook";
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

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([
    "nsIAutoCompleteResult",
    "nsIAbAutoCompleteResult",
  ]),
};

export function AbLDAPAutoCompleteSearch() {
  Services.obs.addObserver(this, "quit-application");
  this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
}

AbLDAPAutoCompleteSearch.prototype = {
  // A short-lived LDAP directory cache.
  // To avoid recreating components as the user completes, we maintain the most
  // recently used address book, nsAbLDAPDirectoryQuery and search context.
  // However the cache is discarded if it has not been used for a minute.
  // This is done to avoid problems with LDAP sessions timing out and hanging.
  _query: null,
  _book: null,
  _attributes: null,
  _context: -1,
  _timer: null,

  // The current search result.
  _result: null,
  // The listener to pass back results to.
  _listener: null,

  _parser: MailServices.headerParser,

  applicableHeaders: new Set(["addr_to", "addr_cc", "addr_bcc", "addr_reply"]),

  // Private methods

  _checkDuplicate(card, emailAddress) {
    var lcEmailAddress = emailAddress.toLocaleLowerCase();

    return this._result._searchResults.some(function (result) {
      return result.value.toLocaleLowerCase() == lcEmailAddress;
    });
  },

  _addToResult(card, address) {
    const mbox = this._parser.makeMailboxObject(
      card.displayName,
      card.isMailList
        ? card.getProperty("Notes", "") || card.displayName
        : address
    );
    if (!mbox.email) {
      return;
    }

    const emailAddress = mbox.toString();

    // If it is a duplicate, then just return and don't add it. The
    // _checkDuplicate function deals with it all for us.
    if (this._checkDuplicate(card, emailAddress)) {
      return;
    }

    // Find out where to insert the card.
    var insertPosition = 0;

    // Next sort on full address
    while (
      insertPosition < this._result._searchResults.length &&
      emailAddress > this._result._searchResults[insertPosition].value
    ) {
      ++insertPosition;
    }

    this._result._searchResults.splice(insertPosition, 0, {
      value: emailAddress,
      card,
    });
  },

  // nsIObserver

  observe(subject, topic) {
    if (topic == "quit-application") {
      Services.obs.removeObserver(this, "quit-application");
    } else if (topic != "timer-callback") {
      return;
    }

    // Force the individual query items to null, so that the memory
    // gets collected straight away.
    this.stopSearch();
    this._book = null;
    this._context = -1;
    this._query = null;
    this._attributes = null;
  },

  // nsIAutoCompleteSearch

  startSearch(aSearchString, aParam, aPreviousResult, aListener) {
    const params = JSON.parse(aParam) || {};
    const applicable =
      !("type" in params) || this.applicableHeaders.has(params.type);

    this._result = new nsAbLDAPAutoCompleteResult(aSearchString);
    aSearchString = aSearchString.toLocaleLowerCase();

    // If the search string isn't value, or contains a comma, or the user
    // hasn't enabled autocomplete, then just return no matches / or the
    // result ignored.
    // The comma check is so that we don't autocomplete against the user
    // entering multiple addresses.
    if (!applicable || !aSearchString || aSearchString.includes(",")) {
      this._result.searchResult = Ci.nsIAutoCompleteResult.RESULT_IGNORED;
      aListener.onSearchResult(this, this._result);
      return;
    }

    // The rules here: If the current identity has a directoryServer set, then
    // use that, otherwise, try the global preference instead.
    var acDirURI = null;
    var identity;

    if ("idKey" in params) {
      try {
        identity = MailServices.accounts.getIdentity(params.idKey);
      } catch (ex) {
        console.error(
          "Couldn't get specified identity, " +
            "falling back to global settings"
        );
      }
    }

    // Does the current identity override the global preference?
    if (identity && identity.overrideGlobalPref) {
      acDirURI = identity.directoryServer;
    } else if (Services.prefs.getBoolPref("ldap_2.autoComplete.useDirectory")) {
      // Try the global one
      acDirURI = Services.prefs.getCharPref(
        "ldap_2.autoComplete.directoryServer"
      );
    }

    if (!acDirURI || Services.io.offline) {
      // No directory to search or we are offline, send a no match and return.
      aListener.onSearchResult(this, this._result);
      return;
    }

    this.stopSearch();

    // If we don't already have a cached query for this URI, build a new one.
    acDirURI = "moz-abldapdirectory://" + acDirURI;
    if (!this._book || this._book.URI != acDirURI) {
      this._query = Cc[
        "@mozilla.org/addressbook/ldap-directory-query;1"
      ].createInstance(Ci.nsIAbDirectoryQuery);
      this._book = MailServices.ab
        .getDirectory(acDirURI)
        .QueryInterface(Ci.nsIAbLDAPDirectory);

      // Create a minimal map just for the display name and primary email.
      this._attributes = Cc[
        "@mozilla.org/addressbook/ldap-attribute-map;1"
      ].createInstance(Ci.nsIAbLDAPAttributeMap);
      this._attributes.setAttributeList(
        "DisplayName",
        this._book.attributeMap.getAttributeList("DisplayName", {}),
        true
      );
      this._attributes.setAttributeList(
        "PrimaryEmail",
        this._book.attributeMap.getAttributeList("PrimaryEmail", {}),
        true
      );
      this._attributes.setAttributeList(
        "SecondEmail",
        this._book.attributeMap.getAttributeList("SecondEmail", {}),
        true
      );
    }

    this._result._commentColumn = this._book.dirName;
    this._listener = aListener;
    this._timer.init(this, 60000, Ci.nsITimer.TYPE_ONE_SHOT);

    var args = Cc[
      "@mozilla.org/addressbook/directory/query-arguments;1"
    ].createInstance(Ci.nsIAbDirectoryQueryArguments);

    var filterTemplate = this._book.getStringValue(
      "autoComplete.filterTemplate",
      ""
    );

    // Use default value when preference is not set or it contains empty string
    if (!filterTemplate) {
      filterTemplate =
        "(|(cn=*%v1*%v2-*)(mail=*%v*)(givenName=*%v1*)(sn=*%v*))";
    }

    // Create filter from filter template and search string
    var ldapSvc = Cc["@mozilla.org/network/ldap-service;1"].getService(
      Ci.nsILDAPService
    );
    var filter = ldapSvc.createFilter(
      1024,
      filterTemplate,
      "",
      "",
      "",
      aSearchString
    );
    if (!filter) {
      throw new Error(
        "Filter string is empty, check if filterTemplate variable is valid in prefs.js."
      );
    }
    args.typeSpecificArg = this._attributes;
    args.querySubDirectories = true;
    args.filter = filter;

    // Start the actual search
    this._context = this._query.doQuery(
      this._book,
      args,
      this,
      this._book.maxHits,
      0
    );
  },

  stopSearch() {
    if (this._listener) {
      this._query.stopQuery(this._context);
      this._listener = null;
    }
  },

  // nsIAbDirSearchListener

  onSearchFinished(status) {
    if (!this._listener) {
      return;
    }

    if (status == Cr.NS_OK) {
      if (this._result.matchCount) {
        this._result.searchResult = Ci.nsIAutoCompleteResult.RESULT_SUCCESS;
        this._result.defaultIndex = 0;
      } else {
        this._result.searchResult = Ci.nsIAutoCompleteResult.RESULT_NOMATCH;
      }
    } else {
      this._result.searchResult = Ci.nsIAutoCompleteResult.RESULT_FAILURE;
      this._result.defaultIndex = 0;
    }
    //    const long queryResultStopped  = 2;
    //    const long queryResultError    = 3;
    this._listener.onSearchResult(this, this._result);
    this._listener = null;
  },

  onSearchFoundCard(aCard) {
    if (!this._listener) {
      return;
    }

    for (const emailAddress of aCard.emailAddresses) {
      this._addToResult(aCard, emailAddress);
    }

    /* XXX autocomplete doesn't expect you to rearrange while searching
    if (this._result.matchCount) {
      this._result.searchResult = Ci.nsIAutoCompleteResult.RESULT_SUCCESS_ONGOING;
    } else {
      this._result.searchResult = Ci.nsIAutoCompleteResult.RESULT_NOMATCH_ONGOING;
    }
    this._listener.onSearchResult(this, this._result);
    */
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsIAutoCompleteSearch",
    "nsIAbDirSearchListener",
  ]),
};
