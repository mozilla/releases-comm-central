/* -*- Mode: Java; tab-width: 2; c-basic-offset: 2; -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
const {ShellService} = ChromeUtils.import("resource:///modules/ShellService.jsm");
// Needed as this script is also loaded by pref-applicationManager.xul.
const {XPCOMUtils} =
  ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function Startup()
{
  gApplicationsPane.init();
}

XPCOMUtils.defineLazyServiceGetters(this, {
  gCategoryManager: ["@mozilla.org/categorymanager;1", "nsICategoryManager"],
  gHandlerService: ["@mozilla.org/uriloader/handler-service;1", "nsIHandlerService"],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
  gWebContentConverterService: ["@mozilla.org/embeddor.implemented/web-content-handler-registrar;1", "nsIWebContentConverterService"],
});

//****************************************************************************//
// Constants & Enumeration Values

const TYPE_MAYBE_FEED = "application/vnd.mozilla.maybe.feed";
const TYPE_MAYBE_VIDEO_FEED = "application/vnd.mozilla.maybe.video.feed";
const TYPE_MAYBE_AUDIO_FEED = "application/vnd.mozilla.maybe.audio.feed";

/*
 * Preferences where we store handling information about the feed type.
 *
 * browser.feeds.handler
 * - "messenger", "reader" (clarified further using the .default preference),
 *   or "ask" -- indicates the default handler being used to process feeds;
 *   "messenger" is obsolete, use "reader" instead; to specify that the
 *    handler is messenger, set browser.feeds.handler.default to "messenger";
 *
 * browser.feeds.handler.default
 * - "messenger", "client" or "web" -- indicates the chosen feed reader used
 *   to display feeds, either transiently (i.e., when the "use as default"
 *   checkbox is unchecked, corresponds to when browser.feeds.handler=="ask")
 *   or more permanently (i.e., the item displayed in the dropdown in Feeds
 *   preferences)
 *
 * browser.feeds.handler.webservice
 * - the URL of the currently selected web service used to read feeds
 *
 * browser.feeds.handlers.application
 * - nsIFile, stores the current client-side feed reading app if one has
 *   been chosen
 */
const PREF_FEED_SELECTED_APP    = "browser.feeds.handlers.application";
const PREF_FEED_SELECTED_WEB    = "browser.feeds.handlers.webservice";
const PREF_FEED_SELECTED_ACTION = "browser.feeds.handler";
const PREF_FEED_SELECTED_READER = "browser.feeds.handler.default";

const PREF_VIDEO_FEED_SELECTED_APP    = "browser.videoFeeds.handlers.application";
const PREF_VIDEO_FEED_SELECTED_WEB    = "browser.videoFeeds.handlers.webservice";
const PREF_VIDEO_FEED_SELECTED_ACTION = "browser.videoFeeds.handler";
const PREF_VIDEO_FEED_SELECTED_READER = "browser.videoFeeds.handler.default";

const PREF_AUDIO_FEED_SELECTED_APP    = "browser.audioFeeds.handlers.application";
const PREF_AUDIO_FEED_SELECTED_WEB    = "browser.audioFeeds.handlers.webservice";
const PREF_AUDIO_FEED_SELECTED_ACTION = "browser.audioFeeds.handler";
const PREF_AUDIO_FEED_SELECTED_READER = "browser.audioFeeds.handler.default";

// The nsHandlerInfoAction enumeration values in nsIHandlerInfo identify
// the actions the application can take with content of various types.
const kActionChooseApp = -2;
const kActionManageApp = -1;

//****************************************************************************//
// Utilities

function getFileDisplayName(aFile) {
  if (AppConstants.platform == "win" &&
      aFile instanceof Ci.nsILocalFileWin) {
    try {
      return aFile.getVersionInfoField("FileDescription");
    } catch (e) {}
  } else if (AppConstants.platform == "macosx" &&
             aFile instanceof Ci.nsILocalFileMac) {
    try {
      return aFile.bundleDisplayName;
    } catch (e) {}
  }
  return aFile.leafName;
}

function getLocalHandlerApp(aFile) {
  var localHandlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"]
                          .createInstance(Ci.nsILocalHandlerApp);
  localHandlerApp.name = getFileDisplayName(aFile);
  localHandlerApp.executable = aFile;

  return localHandlerApp;
}

/**
 * An enumeration of items in a JS array.
 *
 * FIXME: use ArrayConverter once it lands (bug 380839).
 *
 * @constructor
 */
function ArrayEnumerator(aItems) {
  this._index = 0;
  this._contents = aItems;
}

ArrayEnumerator.prototype = {
  _index: 0,

  hasMoreElements: function() {
    return this._index < this._contents.length;
  },

  getNext: function() {
    return this._contents[this._index++];
  }
};

function isFeedType(t) {
  return t == TYPE_MAYBE_FEED || t == TYPE_MAYBE_VIDEO_FEED || t == TYPE_MAYBE_AUDIO_FEED;
}

//****************************************************************************//
// HandlerInfoWrapper

/**
 * This object wraps nsIHandlerInfo with some additional functionality
 * the Applications prefpane needs to display and allow modification of
 * the list of handled types.
 *
 * We create an instance of this wrapper for each entry we might display
 * in the prefpane, and we compose the instances from various sources,
 * including the handler service.
 *
 * We don't implement all the original nsIHandlerInfo functionality,
 * just the stuff that the prefpane needs.
 *
 * In theory, all of the custom functionality in this wrapper should get
 * pushed down into nsIHandlerInfo eventually.
 */
function HandlerInfoWrapper(aType, aHandlerInfo) {
  this.type = aType;
  this.wrappedHandlerInfo = aHandlerInfo;
}

HandlerInfoWrapper.prototype = {
  // The wrapped nsIHandlerInfo object.  In general, this object is private,
  // but there are a couple cases where callers access it directly for things
  // we haven't (yet?) implemented, so we make it a public property.
  wrappedHandlerInfo: null,


  //**************************************************************************//
  // nsIHandlerInfo

  // The MIME type or protocol scheme.
  type: null,

  get description() {
    if (this.wrappedHandlerInfo.description)
      return this.wrappedHandlerInfo.description;

    if (this.primaryExtension) {
      var extension = this.primaryExtension.toUpperCase();
      return gApplicationsPane._prefsBundle.getFormattedString("fileEnding",
                                                               [extension]);
    }

    return this.type;
  },

  get preferredApplicationHandler() {
    return this.wrappedHandlerInfo.preferredApplicationHandler;
  },

  set preferredApplicationHandler(aNewValue) {
    this.wrappedHandlerInfo.preferredApplicationHandler = aNewValue;

    // Make sure the preferred handler is in the set of possible handlers.
    if (aNewValue)
      this.addPossibleApplicationHandler(aNewValue);
  },

  get possibleApplicationHandlers() {
    return this.wrappedHandlerInfo.possibleApplicationHandlers;
  },

  addPossibleApplicationHandler(aNewHandler) {
    var possibleApps = this.possibleApplicationHandlers.enumerate();
    while (possibleApps.hasMoreElements()) {
      if (possibleApps.getNext().equals(aNewHandler))
        return;
    }
    this.possibleApplicationHandlers.appendElement(aNewHandler);
  },

  removePossibleApplicationHandler(aHandler) {
    var defaultApp = this.preferredApplicationHandler;
    if (defaultApp && aHandler.equals(defaultApp)) {
      // If the app we remove was the default app, we must make sure
      // it won't be used anymore
      this.alwaysAskBeforeHandling = true;
      this.preferredApplicationHandler = null;
    }

    var handlers = this.possibleApplicationHandlers;
    for (var i = 0; i < handlers.length; ++i) {
      var handler = handlers.queryElementAt(i, Ci.nsIHandlerApp);
      if (handler.equals(aHandler)) {
        handlers.removeElementAt(i);
        break;
      }
    }
  },

  get hasDefaultHandler() {
    return this.wrappedHandlerInfo.hasDefaultHandler;
  },

  get defaultDescription() {
    return this.wrappedHandlerInfo.defaultDescription;
  },

  // What to do with content of this type.
  get preferredAction() {
    // If the action is to use a helper app, but we don't have a preferred
    // handler app, then switch to using the system default, if any; otherwise
    // fall back to saving to disk, which is the default action in nsMIMEInfo.
    // Note: "save to disk" is an invalid value for protocol info objects,
    // but the alwaysAskBeforeHandling getter will detect that situation
    // and always return true in that case to override this invalid value.
    if (this.wrappedHandlerInfo.preferredAction == Ci.nsIHandlerInfo.useHelperApp &&
        !gApplicationsPane.isValidHandlerApp(this.preferredApplicationHandler)) {
      return this.wrappedHandlerInfo.hasDefaultHandler ?
             Ci.nsIHandlerInfo.useSystemDefault :
             Ci.nsIHandlerInfo.saveToDisk;
    }

    return this.wrappedHandlerInfo.preferredAction;
  },

  set preferredAction(aNewValue) {
    this.wrappedHandlerInfo.preferredAction = aNewValue;
  },

  get alwaysAskBeforeHandling() {
    // If this is a protocol type and the preferred action is "save to disk",
    // which is invalid for such types, then return true here to override that
    // action.  This could happen when the preferred action is to use a helper
    // app, but the preferredApplicationHandler is invalid, and there isn't
    // a default handler, so the preferredAction getter returns save to disk
    // instead.
    if (!(this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) &&
        this.preferredAction == Ci.nsIHandlerInfo.saveToDisk)
      return true;

    return this.wrappedHandlerInfo.alwaysAskBeforeHandling;
  },

  set alwaysAskBeforeHandling(aNewValue) {
    this.wrappedHandlerInfo.alwaysAskBeforeHandling = aNewValue;
  },


  //**************************************************************************//
  // nsIMIMEInfo

  // The primary file extension associated with this type, if any.
  get primaryExtension() {
    try {
      if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo &&
          this.wrappedHandlerInfo.primaryExtension)
        return this.wrappedHandlerInfo.primaryExtension;
    } catch(ex) {}

    return null;
  },

  //**************************************************************************//
  // Storage

  store() {
    gHandlerService.store(this.wrappedHandlerInfo);
  },


  //**************************************************************************//
  // Icons

  get smallIcon() {
    return this._getIcon(16);
  },

  get largeIcon() {
    return this._getIcon(32);
  },

  _getIcon(aSize) {
    if (this.primaryExtension)
      return "moz-icon://goat." + this.primaryExtension + "?size=" + aSize;

    if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo)
      return "moz-icon://goat?size=" + aSize + "&contentType=" + this.type;

    // We're falling back to a generic icon when we can't get a URL for one
    // (for example in the case of protocol schemes).
    return null;
  },

  // The type class is used for setting icons through CSS for types that don't
  // explicitly set their icons.
  typeClass: "unknown"

};


//****************************************************************************//
// Feed Handler Info

/**
 * This object implements nsIHandlerInfo for the feed types.  It's a separate
 * object because we currently store handling information for the feed type
 * in a set of preferences rather than the nsIHandlerService-managed datastore.
 *
 * This object inherits from HandlerInfoWrapper in order to get functionality
 * that isn't special to the feed type.
 *
 * XXX Should we inherit from HandlerInfoWrapper?  After all, we override
 * most of that wrapper's properties and methods, and we have to dance around
 * the fact that the wrapper expects to have a wrappedHandlerInfo, which we
 * don't provide.
 */

function FeedHandlerInfo(aMIMEType) {
  HandlerInfoWrapper.call(this, aMIMEType, null);
}

FeedHandlerInfo.prototype = {
  __proto__: HandlerInfoWrapper.prototype,

  //**************************************************************************//
  // nsIHandlerInfo

  get description() {
    return gApplicationsPane._prefsBundle.getString(this.typeClass);
  },

  get preferredApplicationHandler() {
    switch (document.getElementById(this._prefSelectedReader).value) {
      case "client":
        var file = document.getElementById(this._prefSelectedApp).value;
        if (file)
          return getLocalHandlerApp(file);

        return null;

      case "web":
        var uri = document.getElementById(this._prefSelectedWeb).value;
        if (!uri)
          return null;
        return gWebContentConverterService.getWebContentHandlerByURI(this.type, uri);

      case "messenger":
      default:
        // When the pref is set to messenger, we handle feeds internally,
        // we don't forward them to a local or web handler app, so there is
        // no preferred handler.
        return null;
    }
  },

  set preferredApplicationHandler(aNewValue) {
    if (aNewValue instanceof Ci.nsILocalHandlerApp) {
      document.getElementById(this._prefSelectedApp).value = aNewValue.executable;
      document.getElementById(this._prefSelectedReader).value = "client";
    }
    else if (aNewValue instanceof Ci.nsIWebContentHandlerInfo) {
      document.getElementById(this._prefSelectedWeb).value = aNewValue.uri;
      document.getElementById(this._prefSelectedReader).value = "web";
      // Make the web handler be the new "auto handler" for feeds.
      // Note: we don't have to unregister the auto handler when the user picks
      // a non-web handler (local app, RSS News & Blogs, etc.) because the service
      // only uses the "auto handler" when the selected reader is a web handler.
      // We also don't have to unregister it when the user turns on "always ask"
      // (i.e. preview in browser), since that also overrides the auto handler.
      gWebContentConverterService.setAutoHandler(this.type, aNewValue);
    }
  },

  _possibleApplicationHandlers: null,

  get possibleApplicationHandlers() {
    if (this._possibleApplicationHandlers)
      return this._possibleApplicationHandlers;

    // A minimal implementation of nsIMutableArray.  It only supports the two
    // methods its callers invoke, namely appendElement, nsIArray::enumerate
    // and nsIArray::indexOf.
    this._possibleApplicationHandlers = {
      _inner: [],
      _removed: [],

      QueryInterface: XPCOMUtils.generateQI([Ci.nsIMutableArray, Ci.nsIArray]),

      get length() {
        return this._inner.length;
      },

      enumerate: function() {
        return new ArrayEnumerator(this._inner);
      },

      indexOf: function indexOf(startIndex, element) {
        return this._inner.indexOf(element, startIndex);
      },

      appendElement: function(aHandlerApp) {
        this._inner.push(aHandlerApp);
      },

      removeElementAt: function(aIndex) {
        this._removed.push(this._inner[aIndex]);
        this._inner.splice(aIndex, 1);
      },

      queryElementAt: function(aIndex, aInterface) {
        return this._inner[aIndex].QueryInterface(aInterface);
      },
    };

    // Add the selected local app if it's different from the OS default handler.
    // Unlike for other types, we can store only one local app at a time for the
    // feed type, since we store it in a preference that historically stores
    // only a single path.  But we display all the local apps the user chooses
    // while the prefpane is open, only dropping the list when the user closes
    // the prefpane, for maximum usability and consistency with other types.
    var preferredAppFile = document.getElementById(this._prefSelectedApp).value;
    if (preferredAppFile) {
      let preferredApp = getLocalHandlerApp(preferredAppFile);
      let defaultApp = this._defaultApplicationHandler;
      if (!defaultApp || !defaultApp.equals(preferredApp))
        this._possibleApplicationHandlers.appendElement(preferredApp);
    }

    // Add the registered web handlers.  There can be any number of these.
    var webHandlers = gWebContentConverterService.getContentHandlers(this.type);
    for (let webHandler of webHandlers)
      this._possibleApplicationHandlers.appendElement(webHandler);

    return this._possibleApplicationHandlers;
  },

  __defaultApplicationHandler: undefined,
  get _defaultApplicationHandler() {
    if (this.__defaultApplicationHandler !== undefined)
      return this.__defaultApplicationHandler;

    var defaultFeedReader = null;
    try {
      defaultFeedReader = ShellService.defaultFeedReader;
    }
    catch(ex) {
      // no default reader
    }

    if (defaultFeedReader) {
      let handlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"]
                         .createInstance(Ci.nsIHandlerApp);
      handlerApp.name = getFileDisplayName(defaultFeedReader);
      handlerApp.QueryInterface(Ci.nsILocalHandlerApp);
      handlerApp.executable = defaultFeedReader;

      this.__defaultApplicationHandler = handlerApp;
    }
    else {
      this.__defaultApplicationHandler = null;
    }

    return this.__defaultApplicationHandler;
  },

  get hasDefaultHandler() {
    try {
      if (ShellService.defaultFeedReader)
        return true;
    }
    catch(ex) {
      // no default reader
    }

    return false;
  },

  get defaultDescription() {
    if (this.hasDefaultHandler)
      return this._defaultApplicationHandler.name;

    // Should we instead return null?
    return "";
  },

  // What to do with content of this type.
  get preferredAction() {
    switch (document.getElementById(this._prefSelectedAction).value) {

      case "reader": {
        let preferredApp = this.preferredApplicationHandler;
        let defaultApp = this._defaultApplicationHandler;

        // If we have a valid preferred app, return useSystemDefault if it's
        // the default app; otherwise return useHelperApp.
        if (gApplicationsPane.isValidHandlerApp(preferredApp)) {
          if (defaultApp && defaultApp.equals(preferredApp))
            return Ci.nsIHandlerInfo.useSystemDefault;

          return Ci.nsIHandlerInfo.useHelperApp;
        }

        // The pref is set to "reader", but we don't have a valid preferred app.
        // What do we do now?  Not sure this is the best option (perhaps we
        // should direct the user to the default app, if any), but for now let's
        // direct the user to live bookmarks.
        return Ci.nsIHandlerInfo.handleInternally;
      }

      // If the action is "ask", then alwaysAskBeforeHandling will override
      // the action, so it doesn't matter what we say it is, it just has to be
      // something that doesn't cause the controller to hide the type.
      case "ask":
      case "messenger":
      default:
        return Ci.nsIHandlerInfo.handleInternally;
    }
  },

  set preferredAction(aNewValue) {
    switch (aNewValue) {

      case Ci.nsIHandlerInfo.handleInternally:
        document.getElementById(this._prefSelectedReader).value = "messenger";
        break;

      case Ci.nsIHandlerInfo.useHelperApp:
        document.getElementById(this._prefSelectedAction).value = "reader";
        // The controller has already set preferredApplicationHandler
        // to the new helper app.
        break;

      case Ci.nsIHandlerInfo.useSystemDefault:
        document.getElementById(this._prefSelectedAction).value = "reader";
        this.preferredApplicationHandler = this._defaultApplicationHandler;
        break;
    }
  },

  get alwaysAskBeforeHandling() {
    return document.getElementById(this._prefSelectedAction).value == "ask";
  },

  set alwaysAskBeforeHandling(aNewValue) {
    if (aNewValue)
      document.getElementById(this._prefSelectedAction).value = "ask";
    else
      document.getElementById(this._prefSelectedAction).value = "reader";
  },

  // Whether or not we are currently storing the action selected by the user.
  // We use this to suppress notification-triggered updates to the list when
  // we make changes that may spawn such updates, specifically when we change
  // the action for the feed type, which results in feed preference updates,
  // which spawn "pref changed" notifications that would otherwise cause us
  // to rebuild the view unnecessarily.
  _storingAction: false,


  //**************************************************************************//
  // nsIMIMEInfo

  primaryExtension: "xml",


  //**************************************************************************//
  // Storage

  // Changes to the preferred action and handler take effect immediately
  // (we write them out to the preferences right as they happen),
  // so we when the controller calls store() after modifying the handlers,
  // the only thing we need to store is the removal of possible handlers
  // XXX Should we hold off on making the changes until this method gets called?
  store() {
    for (let app of this._possibleApplicationHandlers._removed) {
      if (app instanceof Ci.nsILocalHandlerApp) {
        let pref = document.getElementById(PREF_FEED_SELECTED_APP);
        var preferredAppFile = pref.value;
        if (preferredAppFile) {
          let preferredApp = getLocalHandlerApp(preferredAppFile);
          if (app.equals(preferredApp))
            pref.reset();
        }
      }
      else {
        app.QueryInterface(Ci.nsIWebContentHandlerInfo);
        gWebContentConverterService.removeContentHandler(app.contentType,
                                                         app.uri);
      }
    }
    this._possibleApplicationHandlers._removed = [];
  },


  //**************************************************************************//
  // Icons

  smallIcon: null,

  largeIcon: null,

  // The type class is used for setting icons through CSS for types that don't
  // explicitly set their icons.
  typeClass: "webFeed",
};

var feedHandlerInfo = {
  __proto__: new FeedHandlerInfo(TYPE_MAYBE_FEED),
  _prefSelectedApp: PREF_FEED_SELECTED_APP,
  _prefSelectedWeb: PREF_FEED_SELECTED_WEB,
  _prefSelectedAction: PREF_FEED_SELECTED_ACTION,
  _prefSelectedReader: PREF_FEED_SELECTED_READER,
  typeClass: "webFeed",
};

var videoFeedHandlerInfo = {
  __proto__: new FeedHandlerInfo(TYPE_MAYBE_VIDEO_FEED),
  _prefSelectedApp: PREF_VIDEO_FEED_SELECTED_APP,
  _prefSelectedWeb: PREF_VIDEO_FEED_SELECTED_WEB,
  _prefSelectedAction: PREF_VIDEO_FEED_SELECTED_ACTION,
  _prefSelectedReader: PREF_VIDEO_FEED_SELECTED_READER,
  typeClass: "videoPodcastFeed",
};

var audioFeedHandlerInfo = {
  __proto__: new FeedHandlerInfo(TYPE_MAYBE_AUDIO_FEED),
  _prefSelectedApp: PREF_AUDIO_FEED_SELECTED_APP,
  _prefSelectedWeb: PREF_AUDIO_FEED_SELECTED_WEB,
  _prefSelectedAction: PREF_AUDIO_FEED_SELECTED_ACTION,
  _prefSelectedReader: PREF_AUDIO_FEED_SELECTED_READER,
  typeClass: "audioPodcastFeed",
};


//****************************************************************************//
// Prefpane Controller

var gApplicationsPane = {
  // The set of types the app knows how to handle.  A hash of HandlerInfoWrapper
  // objects, indexed by type.
  _handledTypes: {},

  // The list of types we can show, sorted by the sort column/direction.
  // An array of HandlerInfoWrapper objects.  We build this list when we first
  // load the data and then rebuild it when users change a pref that affects
  // what types we can show or change the sort column/direction.
  // Note: this isn't necessarily the list of types we *will* show; if the user
  // provides a filter string, we'll only show the subset of types in this list
  // that match that string.
  _visibleTypes: [],

  // A count of the number of times each visible type description appears.
  // We use these counts to determine whether or not to annotate descriptions
  // with their types to distinguish duplicate descriptions from each other.
  // A hash of integer counts, indexed by string description.
  _visibleTypeDescriptionCount: {},


  //**************************************************************************//
  // Convenience & Performance Shortcuts

  // These get defined by init().
  _brandShortName : null,
  _prefsBundle    : null,
  _list           : null,
  _filter         : null,


  //**************************************************************************//
  // Initialization & Destruction

  init() {
    // Initialize shortcuts to some commonly accessed elements & values.
    this._brandShortName =
      document.getElementById("bundleBrand").getString("brandShortName");
    this._prefsBundle = document.getElementById("bundlePrefApplications");
    this._list = document.getElementById("handlersView");
    this._filter = document.getElementById("filter");

    // Observe preferences that influence what we display so we can rebuild
    // the view when they change.
    Services.prefs.addObserver(PREF_FEED_SELECTED_APP, this);
    Services.prefs.addObserver(PREF_FEED_SELECTED_WEB, this);
    Services.prefs.addObserver(PREF_FEED_SELECTED_ACTION, this);

    Services.prefs.addObserver(PREF_VIDEO_FEED_SELECTED_APP, this);
    Services.prefs.addObserver(PREF_VIDEO_FEED_SELECTED_WEB, this);
    Services.prefs.addObserver(PREF_VIDEO_FEED_SELECTED_ACTION, this);

    Services.prefs.addObserver(PREF_AUDIO_FEED_SELECTED_APP, this);
    Services.prefs.addObserver(PREF_AUDIO_FEED_SELECTED_WEB, this);
    Services.prefs.addObserver(PREF_AUDIO_FEED_SELECTED_ACTION, this);

    // Listen for window unload so we can remove our preference observers.
    window.addEventListener("unload", this);

    // Listen for user events on the listbox and its children
    this._list.addEventListener("select", this);
    this._list.addEventListener("command", this);

    // Figure out how we should be sorting the list.  We persist sort settings
    // across sessions, so we can't assume the default sort column/direction.
    this._sortColumn = document.getElementById("typeColumn");
    if (document.getElementById("actionColumn").hasAttribute("sortDirection")) {
      this._sortColumn = document.getElementById("actionColumn");
      // The typeColumn element always has a sortDirection attribute,
      // either because it was persisted or because the default value
      // from the xul file was used.  If we are sorting on the other
      // column, we should remove it.
      document.getElementById("typeColumn").removeAttribute("sortDirection");
    }

    // Load the data and build the list of handlers.
    this._loadData();
    this._rebuildVisibleTypes();
    this._sortVisibleTypes();
    this._rebuildView();

    // Notify observers that the UI is now ready
    Services.obs.notifyObservers(window, "app-handler-pane-loaded");
  },

  destroy() {
    this._list.removeEventListener("command", this);
    this._list.removeEventListener("select", this);
    window.removeEventListener("unload", this);
    Services.prefs.removeObserver(PREF_FEED_SELECTED_APP, this);
    Services.prefs.removeObserver(PREF_FEED_SELECTED_WEB, this);
    Services.prefs.removeObserver(PREF_FEED_SELECTED_ACTION, this);

    Services.prefs.removeObserver(PREF_VIDEO_FEED_SELECTED_APP, this);
    Services.prefs.removeObserver(PREF_VIDEO_FEED_SELECTED_WEB, this);
    Services.prefs.removeObserver(PREF_VIDEO_FEED_SELECTED_ACTION, this);

    Services.prefs.removeObserver(PREF_AUDIO_FEED_SELECTED_APP, this);
    Services.prefs.removeObserver(PREF_AUDIO_FEED_SELECTED_WEB, this);
    Services.prefs.removeObserver(PREF_AUDIO_FEED_SELECTED_ACTION, this);
  },


  //**************************************************************************//
  // nsISupports

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  //**************************************************************************//
  // nsIObserver

  observe(aSubject, aTopic, aData) {
    // Rebuild the list when there are changes to preferences that influence
    // whether or not to show certain entries in the list.
    if (aTopic == "nsPref:changed" && !this._storingAction) {
      // All the prefs we observe can affect what we display, so we rebuild
      // the view when any of them changes.
      this._rebuildView();
    }
  },


  //**************************************************************************//
  // EventListener

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "unload":
        this.destroy();
        break;
      case "select":
        if (this._list.selectedItem)
          this._list.setAttribute("lastSelectedType",
                                  this._list.selectedItem.type);
        break;
      case "command":
        var target = aEvent.originalTarget;
        switch (target.localName) {
          case "listitem":
            if (!this._list.disabled &&
                target.type == this._list.getAttribute("lastSelectedType"))
              this._list.selectedItem = target;
            break;
          case "listcell":
            this.rebuildActionsMenu();
            break;
          case "menuitem":
            switch (parseInt(target.value)) {
              case kActionChooseApp:
                this.chooseApp();
                break;
              case kActionManageApp:
                this.manageApp();
                break;
              default:
                this.onSelectAction(target);
                break;
            }
            break;
        }
    }
  },


  //**************************************************************************//
  // Composed Model Construction

  _loadData() {
    this._loadFeedHandler();
    this._loadApplicationHandlers();
  },

  _loadFeedHandler() {
    this._handledTypes[TYPE_MAYBE_FEED] = feedHandlerInfo;

    this._handledTypes[TYPE_MAYBE_VIDEO_FEED] = videoFeedHandlerInfo;

    this._handledTypes[TYPE_MAYBE_AUDIO_FEED] = audioFeedHandlerInfo;
  },

  /**
   * Load the set of handlers defined by the application datastore.
   */
  _loadApplicationHandlers() {
    var wrappedHandlerInfos = gHandlerService.enumerate();
    while (wrappedHandlerInfos.hasMoreElements()) {
      let wrappedHandlerInfo =
        wrappedHandlerInfos.getNext().QueryInterface(Ci.nsIHandlerInfo);
      let type = wrappedHandlerInfo.type;

      let handlerInfoWrapper;
      if (type in this._handledTypes)
        handlerInfoWrapper = this._handledTypes[type];
      else {
        handlerInfoWrapper = new HandlerInfoWrapper(type, wrappedHandlerInfo);
        this._handledTypes[type] = handlerInfoWrapper;
      }
    }
  },


  //**************************************************************************//
  // View Construction

  _rebuildVisibleTypes() {
    // Reset the list of visible types and the visible type description counts.
    this._visibleTypes = [];
    this._visibleTypeDescriptionCount = {};

    for (let type in this._handledTypes) {
      let handlerInfo = this._handledTypes[type];

      // We couldn't find any reason to exclude the type, so include it.
      this._visibleTypes.push(handlerInfo);

      if (handlerInfo.description in this._visibleTypeDescriptionCount)
        this._visibleTypeDescriptionCount[handlerInfo.description]++;
      else
        this._visibleTypeDescriptionCount[handlerInfo.description] = 1;
    }
  },

  _rebuildView() {
    // Clear the list of entries (the first 2 elements are <listcols> and
    // <listhead>, they should never get removed).
    while (this._list.childNodes.length > 2)
      this._list.lastChild.remove();

    var visibleTypes = this._visibleTypes;

    // If the user is filtering the list, then only show matching types.
    if (this._filter.value)
      visibleTypes = visibleTypes.filter(this._matchesFilter, this);

    for (let visibleType of visibleTypes) {
      let item = document.createElement("listitem");
      item.setAttribute("allowevents", "true");
      item.setAttribute("type", visibleType.type);
      item.setAttribute("typeDescription", this._describeType(visibleType));
      if (visibleType.smallIcon)
        item.setAttribute("typeIcon", visibleType.smallIcon);
      else
        item.setAttribute("typeClass", visibleType.typeClass);
      item.setAttribute("actionDescription",
                        this._describePreferredAction(visibleType));

      if (!this._setIconClassForPreferredAction(visibleType, item)) {
        var sysIcon = this._getIconURLForPreferredAction(visibleType);
        if (sysIcon)
          item.setAttribute("actionIcon", sysIcon);
        else
          item.setAttribute("appHandlerIcon", "app");
      }

      this._list.appendChild(item);
    }
  },

  _matchesFilter(aType) {
    var filterValue = this._filter.value.toLowerCase();
    return this._describeType(aType).toLowerCase().includes(filterValue) ||
      this._describePreferredAction(aType).toLowerCase().includes(filterValue);
  },

  /**
   * Describe, in a human-readable fashion, the type represented by the given
   * handler info object.  Normally this is just the description provided by
   * the info object, but if more than one object presents the same description,
   * then we annotate the duplicate descriptions with the type itself to help
   * users distinguish between those types.
   *
   * @param aHandlerInfo {nsIHandlerInfo} the type being described
   * @returns {string} a description of the type
   */
  _describeType(aHandlerInfo) {
    if (this._visibleTypeDescriptionCount[aHandlerInfo.description] > 1)
      return this._prefsBundle.getFormattedString("typeDescriptionWithType",
                                                  [aHandlerInfo.description,
                                                   aHandlerInfo.type]);

    return aHandlerInfo.description;
  },

  /**
   * Describe, in a human-readable fashion, the preferred action to take on
   * the type represented by the given handler info object.
   *
   * XXX Should this be part of the HandlerInfoWrapper interface?  It would
   * violate the separation of model and view, but it might make more sense
   * nonetheless (f.e. it would make sortTypes easier).
   *
   * @param aHandlerInfo {nsIHandlerInfo} the type whose preferred action
   *                                      is being described
   * @returns {string} a description of the action
   */
  _describePreferredAction(aHandlerInfo) {
    // alwaysAskBeforeHandling overrides the preferred action, so if that flag
    // is set, then describe that behavior instead.  For most types, this is
    // the "alwaysAsk" string, but for the feed type we show something special.
    if (aHandlerInfo.alwaysAskBeforeHandling) {
      if (isFeedType(aHandlerInfo.type))
        return this._prefsBundle.getFormattedString("previewInApp",
                                                    [this._brandShortName]);
      return this._prefsBundle.getString("alwaysAsk");
    }

    // The nsHandlerInfoAction enumeration values in nsIHandlerInfo identify
    // the actions the application can take with content of various types.
    // But since we've stopped support for plugins, there's no value
    // identifying the "use plugin" action, so we use this constant instead.
    const kActionUsePlugin = -3;

    switch (aHandlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        return this._prefsBundle.getString("saveFile");

      case Ci.nsIHandlerInfo.useHelperApp:
        var preferredApp = aHandlerInfo.preferredApplicationHandler;
        var name = (preferredApp instanceof Ci.nsILocalHandlerApp) ?
                   getFileDisplayName(preferredApp.executable) :
                   preferredApp.name;
        return this._prefsBundle.getFormattedString("useApp", [name]);

      case Ci.nsIHandlerInfo.handleInternally:
        // For the feed type, handleInternally means News & Blogs.
        if (isFeedType(aHandlerInfo.type))
          return this._prefsBundle.getFormattedString("addNewsBlogsInApp",
                                                      [this._brandShortName]);

        // For other types, handleInternally looks like either useHelperApp
        // or useSystemDefault depending on whether or not there's a preferred
        // handler app.
        return (this.isValidHandlerApp(aHandlerInfo.preferredApplicationHandler)) ?
               aHandlerInfo.preferredApplicationHandler.name :
               aHandlerInfo.defaultDescription;

        // XXX Why don't we say the app will handle the type internally?
        // Is it because the app can't actually do that?  But if that's true,
        // then why would a preferredAction ever get set to this value
        // in the first place?

      case Ci.nsIHandlerInfo.useSystemDefault:
        return this._prefsBundle.getFormattedString("useDefault",
                                                    [aHandlerInfo.defaultDescription]);

      // We no longer support plugins, select "ask" instead:
      case kActionUsePlugin:
        return this._prefsBundle.getString("alwaysAsk");
    }
    // we should never end up here but do a return to end up with a value
    return null;
  },

  /**
   * Whether or not the given handler app is valid.
   *
   * @param aHandlerApp {nsIHandlerApp} the handler app in question
   *
   * @returns {boolean} whether or not it's valid
   */
  isValidHandlerApp(aHandlerApp) {
    if (!aHandlerApp)
      return false;

    if (aHandlerApp instanceof Ci.nsILocalHandlerApp)
      return this._isValidHandlerExecutable(aHandlerApp.executable);

    if (aHandlerApp instanceof Ci.nsIWebHandlerApp)
      return aHandlerApp.uriTemplate;

    if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo)
      return aHandlerApp.uri;
 
    if (aHandlerApp instanceof Ci.nsIGIOMimeApp)
      return aHandlerApp.command;

    return false;
  },

  _isValidHandlerExecutable(aExecutable) {
    var file = Services.dirsvc.get("XREExeF",
                                   Ci.nsIFile);
    return aExecutable &&
           aExecutable.exists() &&
           aExecutable.isExecutable() &&
           aExecutable.leafName != file.leafName;
  },

  /**
   * Rebuild the actions menu for the selected entry. Gets called by
   * the listcell constructor when an entry in the list gets selected.
   * Note that this would not work from onselect on the listbox because
   * the XBL needs to be applied _before_ calling this function!
   */
  rebuildActionsMenu() {
    var typeItem = this._list.selectedItem;
    var handlerInfo = this._handledTypes[typeItem.type];
    var cell =
      document.getAnonymousElementByAttribute(typeItem, "anonid", "action-cell");
    var menu =
      document.getAnonymousElementByAttribute(cell, "anonid", "action-menu");
    var menuPopup = menu.menupopup;

    // Clear out existing items.
    while (menuPopup.hasChildNodes())
      menuPopup.lastChild.remove();

    {
      let askMenuItem = document.createElement("menuitem");
      askMenuItem.setAttribute("class", "handler-action");
      askMenuItem.setAttribute("value", Ci.nsIHandlerInfo.alwaysAsk);
      let label;
      if (isFeedType(handlerInfo.type))
        label = this._prefsBundle.getFormattedString("previewInApp",
                                                     [this._brandShortName]);
      else
        label = this._prefsBundle.getString("alwaysAsk");
      askMenuItem.setAttribute("label", label);
      askMenuItem.setAttribute("tooltiptext", label);
      askMenuItem.setAttribute("appHandlerIcon", "ask");
      menuPopup.appendChild(askMenuItem);
    }

    // Create a menu item for saving to disk.
    // Note: this option isn't available to protocol types, since we don't know
    // what it means to save a URL having a certain scheme to disk, nor is it
    // available to feeds, since the feed code doesn't implement the capability.
    if ((handlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) &&
        !isFeedType(handlerInfo.type)) {
      let saveMenuItem = document.createElement("menuitem");
      saveMenuItem.setAttribute("class", "handler-action");
      saveMenuItem.setAttribute("value", Ci.nsIHandlerInfo.saveToDisk);
      let label = this._prefsBundle.getString("saveFile");
      saveMenuItem.setAttribute("label", label);
      saveMenuItem.setAttribute("tooltiptext", label);
      saveMenuItem.setAttribute("appHandlerIcon", "save");
      menuPopup.appendChild(saveMenuItem);
    }

    // If this is the feed type, add a News & Blogs item.
    if (isFeedType(handlerInfo.type)) {
      let internalMenuItem = document.createElement("menuitem");
      internalMenuItem.setAttribute("class", "handler-action");
      internalMenuItem.setAttribute("value", Ci.nsIHandlerInfo.handleInternally);
      let label = this._prefsBundle.getFormattedString("addNewsBlogsInApp",
                                                       [this._brandShortName]);
      internalMenuItem.setAttribute("label", label);
      internalMenuItem.setAttribute("tooltiptext", label);
      internalMenuItem.setAttribute("appHandlerIcon", "feed");
      menuPopup.appendChild(internalMenuItem);
    }

    // Add a separator to distinguish these items from the helper app items
    // that follow them.
    let menuSeparator = document.createElement("menuseparator");
    menuPopup.appendChild(menuSeparator);

    // Create a menu item for the OS default application, if any.
    if (handlerInfo.hasDefaultHandler) {
      let defaultMenuItem = document.createElement("menuitem");
      defaultMenuItem.setAttribute("class", "handler-action");
      defaultMenuItem.setAttribute("value", Ci.nsIHandlerInfo.useSystemDefault);
      let label = this._prefsBundle.getFormattedString("useDefault",
                                                       [handlerInfo.defaultDescription]);
      defaultMenuItem.setAttribute("label", label);
      defaultMenuItem.setAttribute("tooltiptext", handlerInfo.defaultDescription);
      let sysIcon = this._getIconURLForSystemDefault(handlerInfo);
      if (sysIcon)
        defaultMenuItem.setAttribute("image", sysIcon);
      else
        defaultMenuItem.setAttribute("appHandlerIcon", "app");

      menuPopup.appendChild(defaultMenuItem);
    }

    // Create menu items for possible handlers.
    let preferredApp = handlerInfo.preferredApplicationHandler;
    let possibleApps = handlerInfo.possibleApplicationHandlers.enumerate();
    var possibleAppMenuItems = [];
    while (possibleApps.hasMoreElements()) {
      let possibleApp = possibleApps.getNext();
      if (!this.isValidHandlerApp(possibleApp))
        continue;

      let menuItem = document.createElement("menuitem");
      menuItem.setAttribute("class", "handler-action");
      menuItem.setAttribute("value", Ci.nsIHandlerInfo.useHelperApp);
      let label;
      if (possibleApp instanceof Ci.nsILocalHandlerApp)
        label = getFileDisplayName(possibleApp.executable);
      else
        label = possibleApp.name;
      label = this._prefsBundle.getFormattedString("useApp", [label]);
      menuItem.setAttribute("label", label);
      menuItem.setAttribute("tooltiptext", label);
      let sysIcon = this._getIconURLForHandlerApp(possibleApp);
      if (sysIcon)
        menuItem.setAttribute("image", sysIcon);
      else
        menuItem.setAttribute("appHandlerIcon", "app");

      // Attach the handler app object to the menu item so we can use it
      // to make changes to the datastore when the user selects the item.
      menuItem.handlerApp = possibleApp;

      menuPopup.appendChild(menuItem);
      possibleAppMenuItems.push(menuItem);
    }

// Add gio handlers
    if (Cc["@mozilla.org/gio-service;1"]) {
      let gIOSvc = Cc["@mozilla.org/gio-service;1"]
                     .getService(Ci.nsIGIOService);
      var gioApps = gIOSvc.getAppsForURIScheme(typeItem.type);
      let enumerator = gioApps.enumerate();
      let possibleHandlers = handlerInfo.possibleApplicationHandlers;
      while (enumerator.hasMoreElements()) {
        let handler = enumerator.getNext().QueryInterface(Ci.nsIHandlerApp);
        // OS handler share the same name, it's most likely the same app, skipping...
        if (handler.name == handlerInfo.defaultDescription) {
          continue;
        }
        // Check if the handler is already in possibleHandlers
        let appAlreadyInHandlers = false;
        for (let i = possibleHandlers.length - 1; i >= 0; --i) {
          let app = possibleHandlers.queryElementAt(i, Ci.nsIHandlerApp);
          // nsGIOMimeApp::Equals is able to compare with Ci.nsILocalHandlerApp
          if (handler.equals(app)) {
            appAlreadyInHandlers = true;
            break;
          }
        }
        if (!appAlreadyInHandlers) {
          let menuItem = document.createElement("menuitem");
          menuItem.setAttribute("action", Ci.nsIHandlerInfo.useHelperApp);
          let label = this._prefsBundle.getFormattedString("useApp", [handler.name]);
          menuItem.setAttribute("label", label);
          menuItem.setAttribute("tooltiptext", label);
          menuItem.setAttribute("image", this._getIconURLForHandlerApp(handler));

          // Attach the handler app object to the menu item so we can use it
          // to make changes to the datastore when the user selects the item.
          menuItem.handlerApp = handler;

          menuPopup.appendChild(menuItem);
          possibleAppMenuItems.push(menuItem);
        }
      }
    }

    // Create a menu item for selecting a local application.
    let canOpenWithOtherApp = true;
    if (AppConstants.platform == "win") {
      // On Windows, selecting an application to open another application
      // would be meaningless so we special case executables.
      let executableType = gMIMEService.getTypeFromExtension("exe");
      canOpenWithOtherApp = handlerInfo.type != executableType;
    }
    if (canOpenWithOtherApp)
    {
      let menuItem = document.createElement("menuitem");
      menuItem.setAttribute("class", "handler-action");
      menuItem.setAttribute("value", kActionChooseApp);
      let label = this._prefsBundle.getString("useOtherApp");
      menuItem.setAttribute("label", label);
      menuItem.setAttribute("tooltiptext", label);
      menuPopup.appendChild(menuItem);
    }

    // Create a menu item for managing applications.
    if (possibleAppMenuItems.length) {
      let menuItem = document.createElement("menuseparator");
      menuPopup.appendChild(menuItem);
      menuItem = document.createElement("menuitem");
      menuItem.setAttribute("class", "handler-action");
      menuItem.setAttribute("value", kActionManageApp);
      menuItem.setAttribute("label", this._prefsBundle.getString("manageApp"));
      menuPopup.appendChild(menuItem);
    }

    // Select the item corresponding to the preferred action.  If the always
    // ask flag is set, it overrides the preferred action.  Otherwise we pick
    // the item identified by the preferred action (when the preferred action
    // is to use a helper app, we have to pick the specific helper app item).
    if (handlerInfo.alwaysAskBeforeHandling)
      menu.value = Ci.nsIHandlerInfo.alwaysAsk;
    else if (handlerInfo.preferredAction == Ci.nsIHandlerInfo.useHelperApp &&
             preferredApp)
      menu.selectedItem =
        possibleAppMenuItems.filter(v => v.handlerApp.equals(preferredApp))[0];
    else
      menu.value = handlerInfo.preferredAction;
  },


  //**************************************************************************//
  // Sorting & Filtering

  _sortColumn: null,

  /**
   * Sort the list when the user clicks on a column header.
   */
  sort(event) {
    var column = event.target;

    // If the user clicked on a new sort column, remove the direction indicator
    // from the old column.
    if (this._sortColumn && this._sortColumn != column)
      this._sortColumn.removeAttribute("sortDirection");

    this._sortColumn = column;

    // Set (or switch) the sort direction indicator.
    if (column.getAttribute("sortDirection") == "ascending")
      column.setAttribute("sortDirection", "descending");
    else
      column.setAttribute("sortDirection", "ascending");

    this._sortVisibleTypes();
    this._rebuildView();
  },

  /**
   * Sort the list of visible types by the current sort column/direction.
   */
  _sortVisibleTypes() {
    if (!this._sortColumn)
      return;

    var t = this;

    function sortByType(a, b) {
      return t._describeType(a).toLowerCase()
              .localeCompare(t._describeType(b).toLowerCase());
    }

    function sortByAction(a, b) {
      return t._describePreferredAction(a).toLowerCase()
              .localeCompare(t._describePreferredAction(b).toLowerCase());
    }

    switch (this._sortColumn.getAttribute("value")) {
      case "type":
        this._visibleTypes.sort(sortByType);
        break;
      case "action":
        this._visibleTypes.sort(sortByAction);
        break;
    }

    if (this._sortColumn.getAttribute("sortDirection") == "descending")
      this._visibleTypes.reverse();
  },


  //**************************************************************************//
  // Changes

  onSelectAction(aActionItem) {
    this._storingAction = true;

    try {
      this._storeAction(aActionItem);
    }
    finally {
      this._storingAction = false;
    }
  },

  _storeAction(aActionItem) {
    var typeItem = this._list.selectedItem;
    var handlerInfo = this._handledTypes[typeItem.type];

    let action = parseInt(aActionItem.getAttribute("value"));

    // Set the preferred application handler.
    // We leave the existing preferred app in the list when we set
    // the preferred action to something other than useHelperApp so that
    // legacy datastores that don't have the preferred app in the list
    // of possible apps still include the preferred app in the list of apps
    // the user can choose to handle the type.
    if (action == Ci.nsIHandlerInfo.useHelperApp)
      handlerInfo.preferredApplicationHandler = aActionItem.handlerApp;

    // Set the preferred action.
    handlerInfo.preferredAction = action;

    // Set the "always ask" flag.
    handlerInfo.alwaysAskBeforeHandling = action == Ci.nsIHandlerInfo.alwaysAsk;

    handlerInfo.store();

    // Make sure the handler info object is flagged to indicate that there is
    // now some user configuration for the type.

    // Update the action label and image to reflect the new preferred action.
    typeItem.setAttribute("actionDescription",
                          this._describePreferredAction(handlerInfo));
    if (!this._setIconClassForPreferredAction(handlerInfo, typeItem)) {
      var sysIcon = this._getIconURLForPreferredAction(handlerInfo);
      if (sysIcon)
        typeItem.setAttribute("actionIcon", sysIcon);
      else
        typeItem.setAttribute("appHandlerIcon", "app");
    }
  },

  manageApp() {
    var typeItem = this._list.selectedItem;
    var handlerInfo = this._handledTypes[typeItem.type];

    document.documentElement.openSubDialog("chrome://communicator/content/pref/pref-applicationManager.xul",
                                           "", handlerInfo);

    // Rebuild the actions menu so that we revert to the previous selection,
    // or "Always ask" if the previous default application has been removed
    this.rebuildActionsMenu();

    // update the listitem too. Will be visible when selecting another row
    typeItem.setAttribute("actionDescription",
                          this._describePreferredAction(handlerInfo));
    if (!this._setIconClassForPreferredAction(handlerInfo, typeItem)) {
      var sysIcon = this._getIconURLForPreferredAction(handlerInfo);
      if (sysIcon)
        typeItem.setAttribute("actionIcon", sysIcon);
      else
        typeItem.setAttribute("appHandlerIcon", "app");
    }
  },

  handlerApp: null,

  finishChooseApp() {
    if (this.handlerApp) {
      // Add the app to the type's list of possible handlers.
      let handlerInfo = this._handledTypes[this._list.selectedItem.type];
      handlerInfo.addPossibleApplicationHandler(this.handlerApp);
    }

    // Rebuild the actions menu whether the user picked an app or canceled.
    // If they picked an app, we want to add the app to the menu and select it.
    // If they canceled, we want to go back to their previous selection.
    this.rebuildActionsMenu();

    // If the user picked a new app from the menu, select it.
    if (this.handlerApp) {
      var actionsCell =
        document.getAnonymousElementByAttribute(this._list.selectedItem,
                                               "anonid", "action-cell");
      var actionsMenu =
        document.getAnonymousElementByAttribute(actionsCell,
                                                "anonid", "action-menu");
      let menuItems = actionsMenu.menupopup.childNodes;
      for (let i = 0; i < menuItems.length; i++) {
        let menuItem = menuItems[i];
        if (menuItem.handlerApp &&
            menuItem.handlerApp.equals(this.handlerApp)) {
          actionsMenu.selectedIndex = i;
          this.onSelectAction(menuItem);
          break;
        }
      }
    }
  },

  chooseApp() {
    this.handlerApp = null;

    if (AppConstants.platform == "win") {
      let params = {};
      let handlerInfo = this._handledTypes[this._list.selectedItem.type];

      if (isFeedType(handlerInfo.type)) {
        // MIME info will be null, create a temp object.
        params.mimeInfo =
            gMIMEService.getFromTypeAndExtension(handlerInfo.type,
                                                 handlerInfo.primaryExtension);
      } else {
        params.mimeInfo = handlerInfo.wrappedHandlerInfo;
      }

      params.title         = this._prefsBundle.getString("fpTitleChooseApp");
      params.description   = handlerInfo.description;
      params.filename      = null;
      params.handlerApp    = null;

      window.openDialog("chrome://global/content/appPicker.xul", null,
                        "chrome,modal,centerscreen,titlebar,dialog=yes",
                        params);

      if (this.isValidHandlerApp(params.handlerApp)) {
        this.handlerApp = params.handlerApp;
      }
      this.finishChooseApp();
    } else if (Services.prefs.getBoolPref("browser.download.useAppChooser", true) && ("@mozilla.org/applicationchooser;1" in Cc)) {
      let mimeInfo;
      let handlerInfo = this._handledTypes[this._list.selectedItem.type];
      if (isFeedType(handlerInfo.type)) {
        // MIME info will be null, create a temp object.
        mimeInfo =
            gMIMEService.getFromTypeAndExtension(handlerInfo.type,
                                                 handlerInfo.primaryExtension);
      } else {
        mimeInfo = handlerInfo.wrappedHandlerInfo;
      }

      var appChooser = Cc["@mozilla.org/applicationchooser;1"]
                         .createInstance(Ci.nsIApplicationChooser);
      appChooser.init(window, this._prefsBundle.getString("fpTitleChooseApp"));
      var contentTypeDialogObj = this;
      let appChooserCallback = function appChooserCallback_done(aResult) {
        if (aResult) {
          contentTypeDialogObj.handlerApp = aResult.QueryInterface(Ci.nsILocalHandlerApp);
        }
        contentTypeDialogObj.finishChooseApp();
      };
      appChooser.open(mimeInfo.MIMEType, appChooserCallback);
      // The finishChooseApp is called from appChooserCallback
    } else {
      let fp = Cc["@mozilla.org/filepicker;1"]
                 .createInstance(Ci.nsIFilePicker);
      let winTitle = this._prefsBundle.getString("fpTitleChooseApp");
      fp.init(window, winTitle, Ci.nsIFilePicker.modeOpen);
      fp.appendFilters(Ci.nsIFilePicker.filterApps);

      // Prompt the user to pick an app.  If they pick one, and it's a valid
      // selection, then add it to the list of possible handlers.
      fp.open(rv => {
        if (rv == Ci.nsIFilePicker.returnOK && fp.file &&
            this._isValidHandlerExecutable(fp.file)) {
          let handlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"]
                             .createInstance(Ci.nsILocalHandlerApp);
          handlerApp.name = getFileDisplayName(fp.file);
          handlerApp.executable = fp.file;
          this.handlerApp = handlerApp;
        }
        this.finishChooseApp();
      });
    }
  },

  _setIconClassForPreferredAction(aHandlerInfo, aElement) {
    // If this returns true, the attribute that CSS sniffs for was set to something
    // so you shouldn't manually set an icon URI.
    // This removes the existing actionIcon attribute if any, even if returning false.
    aElement.removeAttribute("actionIcon");

    if (aHandlerInfo.alwaysAskBeforeHandling) {
      aElement.setAttribute("appHandlerIcon", "ask");
      return true;
    }

    switch (aHandlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        aElement.setAttribute("appHandlerIcon", "save");
        return true;

      case Ci.nsIHandlerInfo.handleInternally:
        if (isFeedType(aHandlerInfo.type)) {
          aElement.setAttribute("appHandlerIcon", "feed");
          return true;
        }
        break;
    }
    aElement.removeAttribute("appHandlerIcon");
    return false;
  },

  _getIconURLForPreferredAction(aHandlerInfo) {
    switch (aHandlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.useSystemDefault:
        return this._getIconURLForSystemDefault(aHandlerInfo);

      case Ci.nsIHandlerInfo.useHelperApp:
        let preferredApp = aHandlerInfo.preferredApplicationHandler;
        if (this.isValidHandlerApp(preferredApp))
          return this._getIconURLForHandlerApp(preferredApp);
        break;
    }
    // This should never happen, but if preferredAction is set to some weird
    // value, then fall back to the generic application icon.
    return null;
  },

  _getIconURLForHandlerApp(aHandlerApp) {
    if (aHandlerApp instanceof Ci.nsILocalHandlerApp)
      return this._getIconURLForFile(aHandlerApp.executable);

    if (Services.prefs.getBoolPref("browser.chrome.favicons")) { // q.v. Bug 514671
      if (aHandlerApp instanceof Ci.nsIWebHandlerApp)
        return this._getIconURLForWebApp(aHandlerApp.uriTemplate);

      if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo)
        return this._getIconURLForWebApp(aHandlerApp.uri);
    }

    // We know nothing about other kinds of handler apps.
    return "";
  },

  _getIconURLForFile(aFile) {
    var fph = Services.io.getProtocolHandler("file")
                         .QueryInterface(Ci.nsIFileProtocolHandler);
    var urlSpec = fph.getURLSpecFromFile(aFile);

    return "moz-icon://" + urlSpec + "?size=16";
  },

  _getIconURLForWebApp(aWebAppURITemplate) {
    var uri = Services.io.newURI(aWebAppURITemplate);

    // Unfortunately we need to use favicon.ico here, but we don't know
    // about any other possibility to retrieve an icon for the web app/site
    // without loading a specific full URL and parsing it for a possible
    // shortcut icon.

    return /^https?/.test(uri.scheme) ? uri.resolve("/favicon.ico") : "";
  },

  _getIconURLForSystemDefault(aHandlerInfo) {
    // Handler info objects for MIME types on some OSes implement a property bag
    // interface from which we can get an icon for the default app, so if we're
    // dealing with a MIME type on one of those OSes, then try to get the icon.
    if ("wrappedHandlerInfo" in aHandlerInfo) {
      let wrappedHandlerInfo = aHandlerInfo.wrappedHandlerInfo;

      if (wrappedHandlerInfo instanceof Ci.nsIMIMEInfo &&
          wrappedHandlerInfo instanceof Ci.nsIPropertyBag) {
        try {
          let url = wrappedHandlerInfo.getProperty("defaultApplicationIconURL");
          if (url)
            return url + "?size=16";
        }
        catch(ex) {}
      }
    }

    // If this isn't a MIME type object on an OS that supports retrieving
    // the icon, or if we couldn't retrieve the icon for some other reason,
    // then use a generic icon.
    return null;
  }

};
