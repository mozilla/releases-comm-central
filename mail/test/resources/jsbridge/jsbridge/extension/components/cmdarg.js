var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

// CHANGEME: to the chrome URI of your extension or application
var CHROME_URI = "chrome://jsbridge/content/";

// CHANGEME: change the contract id, CID, and category to be unique
// to your application.
var clh_contractID =
  "@mozilla.org/commandlinehandler/general-startup;1?type=jsbridge";

// use uuidgen to generate a unique ID
var clh_CID = Components.ID("{2872d428-14f6-11de-ac86-001f5bd9235c}");

// category names are sorted alphabetically. Typical command-line handlers use a
// category that begins with the letter "m".
var clh_category = "jsbridge";

/**
 * Utility functions
 */

/**
 * Opens a chrome window.
 * @param aChromeURISpec a string specifying the URI of the window to open.
 * @param aArgument an argument to pass to the window (may be null)
 */
function openWindow(aChromeURISpec, aArgument) {
  Services.ww.openWindow(
    null,
    aChromeURISpec,
    "_blank",
    "chrome,menubar,toolbar,status,resizable,dialog=no",
    aArgument
  );
}

/**
 * The XPCOM component that implements nsICommandLineHandler.
 * It also implements nsIFactory to serve as its own singleton factory.
 */
function jsbridgeHandler() {}
jsbridgeHandler.prototype = {
  classID: clh_CID,
  contractID: clh_contractID,
  classDescription: "jsbridgeHandler",
  _xpcom_categories: [
    { category: "command-line-handler", entry: clh_category },
  ],

  /* nsISupports */
  QueryInterface: ChromeUtils.generateQI([
    "nsICommandLineHandler",
    "nsIFactory",
  ]),

  /* nsICommandLineHandler */

  handle(cmdLine) {
    try {
      var server = ChromeUtils.import(
        "chrome://jsbridge/content/modules/server.js"
      );
      var port = cmdLine.handleFlagWithParam("jsbridge", false);
      if (port) {
        server.startServer(parseInt(port));
      } else {
        server.startServer(24242);
      }
    } catch (e) {
      Cu.reportError(
        "incorrect parameter passed to -jsbridge on the command line."
      );
    }
  },

  // CHANGEME: change the help info as appropriate, but
  // follow the guidelines in nsICommandLineHandler.idl
  // specifically, flag descriptions should start at
  // character 24, and lines should be wrapped at
  // 72 characters with embedded newlines,
  // and finally, the string should end with a newline
  helpInfo: "  -jsbridge            Port to run jsbridge on.\n",

  /* nsIFactory */

  createInstance(outer, iid) {
    if (outer != null) {
      throw Cr.NS_ERROR_NO_AGGREGATION;
    }

    return this.QueryInterface(iid);
  },

  lockFactory(lock) {
    /* no-op */
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([jsbridgeHandler]);
