/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

export function AbAutoCompleteMyDomain() {}

AbAutoCompleteMyDomain.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAutoCompleteSearch"]),

  cachedIdKey: "",
  cachedIdentity: null,

  applicableHeaders: new Set(["addr_to", "addr_cc", "addr_bcc", "addr_reply"]),

  startSearch(aString, aSearchParam, aResult, aListener) {
    const params = aSearchParam ? JSON.parse(aSearchParam) : {};
    const applicable =
      "type" in params && this.applicableHeaders.has(params.type);
    const ACR = Ci.nsIAutoCompleteResult;
    var address = null;
    if (applicable && aString && !aString.includes(",")) {
      if ("idKey" in params && params.idKey != this.cachedIdKey) {
        this.cachedIdentity = MailServices.accounts.getIdentity(params.idKey);
        this.cachedIdKey = params.idKey;
      }
      if (this.cachedIdentity.autocompleteToMyDomain) {
        address = aString.includes("@")
          ? aString
          : this.cachedIdentity.email.replace(/[^@]*/, aString);
      }
    }

    var result = {
      searchString: aString,
      searchResult: address ? ACR.RESULT_SUCCESS : ACR.RESULT_FAILURE,
      defaultIndex: -1,
      errorDescription: null,
      matchCount: address ? 1 : 0,
      getValueAt() {
        return address;
      },
      getLabelAt() {
        return this.getValueAt();
      },
      getCommentAt() {
        return null;
      },
      getStyleAt() {
        return "default-match";
      },
      getImageAt() {
        return null;
      },
      getFinalCompleteValueAt(aIndex) {
        return this.getValueAt(aIndex);
      },
      removeValueAt() {},
    };
    aListener.onSearchResult(this, result);
  },

  stopSearch() {},
};
