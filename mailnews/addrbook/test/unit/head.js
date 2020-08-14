var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
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

function promiseDirectoryRemoved() {
  return new Promise(resolve => {
    let observer = {
      observe() {
        Services.obs.removeObserver(observer, "addrbook-directory-deleted");
        resolve();
      },
    };
    Services.obs.addObserver(observer, "addrbook-directory-deleted");
  });
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
