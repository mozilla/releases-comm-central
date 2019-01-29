const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var nsIAppShellService    = Ci.nsIAppShellService;
var nsISupports           = Ci.nsISupports;
var nsICategoryManager    = Ci.nsICategoryManager;
var nsIComponentRegistrar = Ci.nsIComponentRegistrar;
var nsICommandLine        = Ci.nsICommandLine;
var nsICommandLineHandler = Ci.nsICommandLineHandler;
var nsIFactory            = Ci.nsIFactory;
var nsIModule             = Ci.nsIModule;
var nsIWindowWatcher      = Ci.nsIWindowWatcher;

// CHANGEME: to the chrome URI of your extension or application
var CHROME_URI = "chrome://jsbridge/content/";

// CHANGEME: change the contract id, CID, and category to be unique
// to your application.
var clh_contractID = "@mozilla.org/commandlinehandler/general-startup;1?type=jsbridge";

// use uuidgen to generate a unique ID
var clh_CID = Components.ID("{2872d428-14f6-11de-ac86-001f5bd9235c}");

// category names are sorted alphabetically. Typical command-line handlers use a
// category that begins with the letter "m".
var clh_category = "jsbridge";

var aConsoleService = Cc["@mozilla.org/consoleservice;1"].
     getService(Ci.nsIConsoleService);

/**
 * Utility functions
 */

/**
 * Opens a chrome window.
 * @param aChromeURISpec a string specifying the URI of the window to open.
 * @param aArgument an argument to pass to the window (may be null)
 */
function openWindow(aChromeURISpec, aArgument)
{
  var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].
    getService(Ci.nsIWindowWatcher);
  ww.openWindow(null, aChromeURISpec, "_blank",
                "chrome,menubar,toolbar,status,resizable,dialog=no",
                aArgument);
}

/**
 * The XPCOM component that implements nsICommandLineHandler.
 * It also implements nsIFactory to serve as its own singleton factory.
 */
function jsbridgeHandler() {
}
jsbridgeHandler.prototype = {
  classID: clh_CID,
  contractID: clh_contractID,
  classDescription: "jsbridgeHandler",
  _xpcom_categories: [{category: "command-line-handler", entry: clh_category}],

  /* nsISupports */
  QueryInterface: ChromeUtils.generateQI(["nsICommandLineHandler",
                                          "nsIFactory"]),

  /* nsICommandLineHandler */

  handle : function clh_handle(cmdLine)
  {
    try {
      var port = cmdLine.handleFlagWithParam("jsbridge", false);
      if (port) {
        var server = {};
        ChromeUtils.import("chrome://jsbridge/content/modules/server.js", server);
        server.startServer(parseInt(port));
      } else {
        var server = {};
        ChromeUtils.import("chrome://jsbridge/content/modules/server.js", server);
        server.startServer(24242);
      }
    }
    catch (e) {
      Cu.reportError("incorrect parameter passed to -jsbridge on the command line.");
    }

  },

  // CHANGEME: change the help info as appropriate, but
  // follow the guidelines in nsICommandLineHandler.idl
  // specifically, flag descriptions should start at
  // character 24, and lines should be wrapped at
  // 72 characters with embedded newlines,
  // and finally, the string should end with a newline
  helpInfo : "  -jsbridge            Port to run jsbridge on.\n",

  /* nsIFactory */

  createInstance : function clh_CI(outer, iid)
  {
    if (outer != null)
      throw Cr.NS_ERROR_NO_AGGREGATION;

    return this.QueryInterface(iid);
  },

  lockFactory : function clh_lock(lock)
  {
    /* no-op */
  }
};

/**
 * XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
 * XPCOMUtils.generateNSGetModule is for Mozilla 1.9.1 (Firefox 3.5).
 */
var NSGetFactory = XPCOMUtils.generateNSGetFactory ? XPCOMUtils.generateNSGetFactory([jsbridgeHandler])
                                                     : undefined;
var NSGetModule = !XPCOMUtils.generateNSGetFactory ? XPCOMUtils.generateNSGetModule([jsbridgeHandler])
                                                     : undefined;
