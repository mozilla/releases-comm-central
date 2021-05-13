var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { TestUtils } = ChromeUtils.import(
  "resource://testing-common/TestUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

// Ensure the profile directory is set up
do_get_profile();

// Import the required setup scripts.
/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});

function promiseDirectoryRemoved(uri) {
  let removePromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(uri);
  return removePromise;
}

function acObserver() {}
acObserver.prototype = {
  _search: null,
  _result: null,
  _resolve: null,

  onSearchResult(aSearch, aResult) {
    this._search = aSearch;
    this._result = aResult;
    this._resolve();
  },

  waitForResult() {
    return new Promise(resolve => {
      this._resolve = resolve;
    });
  },
};

// Somehow profile-after-change is not triggered in xpcshell tests, here we
// manually run the getService, so that correct ldap modules are loaded
// according to the pref values.
Cc["@mozilla.org/addressbook/ldap-module-loader;1"].getService();
