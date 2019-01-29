/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function nsAbAutoCompleteMyDomain() {}

nsAbAutoCompleteMyDomain.prototype = {
  classID: Components.ID("{5b259db2-e451-4de9-8a6f-cfba91402973}"),
  QueryInterface: ChromeUtils.generateQI([
      Ci.nsIAutoCompleteSearch]),

  cachedIdKey: "",
  cachedIdentity: null,

  applicableHeaders: new Set(["addr_to", "addr_cc", "addr_bcc", "addr_reply"]),

  startSearch(aString, aSearchParam, aResult, aListener) {
    let params = aSearchParam ? JSON.parse(aSearchParam) : {};
    let applicable = ("type" in params) && this.applicableHeaders.has(params.type);
    const ACR = Ci.nsIAutoCompleteResult;
    var address = null;
    if (applicable && aString && !aString.includes(",")) {
      if (("idKey" in params) && (params.idKey != this.cachedIdKey)) {
        this.cachedIdentity = MailServices.accounts.getIdentity(params.idKey);
        this.cachedIdKey = params.idKey;
      }
      if (this.cachedIdentity.autocompleteToMyDomain)
        address = aString.includes("@") ? aString :
                  this.cachedIdentity.email.replace(/[^@]*/, aString);
    }

    var result = {
      searchString: aString,
      searchResult: address ? ACR.RESULT_SUCCESS : ACR.RESULT_FAILURE,
      defaultIndex: -1,
      errorDescription: null,
      matchCount: address ? 1 : 0,
      getValueAt() { return address; },
      getLabelAt() { return this.getValueAt(); },
      getCommentAt() { return null; },
      getStyleAt() { return "default-match"; },
      getImageAt() { return null; },
      getFinalCompleteValueAt(aIndex) {
        return this.getValueAt(aIndex);
      },
      removeValueAt() {},
    };
    aListener.onSearchResult(this, result);
  },

  stopSearch() {},
};

var components = [nsAbAutoCompleteMyDomain];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
