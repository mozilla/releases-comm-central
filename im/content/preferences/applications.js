/*
# -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

//****************************************************************************//
// Constants & Enumeration Values

/*
#ifdef MOZ_WIDGET_GTK
*/
var ICON_URL_APP      = "moz-icon://dummy.exe?size=16";
/*
#else
*/
var ICON_URL_APP      = "chrome://instantbird/skin/preferences/application.png";
/*
#endif
*/

// For CSS. Can be one of "ask" or "save". If absent, the icon URL
// was set by us to a custom handler icon and CSS should not try to override it.
var APP_ICON_ATTR_NAME = "appHandlerIcon";

//****************************************************************************//
// Utilities

function getDisplayNameForFile(aFile) {
/*
#ifdef XP_WIN
*/
  if (aFile instanceof Ci.nsILocalFileWin) {
    try {
      return aFile.getVersionInfoField("FileDescription"); 
    }
    catch(ex) {
      // fall through to the file name
    }
  }
/*
#endif
#ifdef XP_MACOSX
*/
  if (aFile instanceof Ci.nsILocalFileMac) {
    try {
      return aFile.bundleDisplayName;
    }
    catch(ex) {
      // fall through to the file name
    }
  }
/*
#endif
*/

  return Services.io.newFileURI(aFile).QueryInterface(Ci.nsIURL).fileName;
}

function getLocalHandlerApp(aFile) {
  var localHandlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"].
                        createInstance(Ci.nsILocalHandlerApp);
  localHandlerApp.name = getDisplayNameForFile(aFile);
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

//****************************************************************************//
// HandlerInfoWrapper

/**
 * This object wraps nsIHandlerInfo with some additional functionality
 * the Applications prefpane needs to display and allow modification of
 * the list of handled types.
 * 
 * We create an instance of this wrapper for each entry we might display
 * in the prefpane, and we compose the instances from the handler service.
 *
 * We don't implement all the original nsIHandlerInfo functionality,
 * just the stuff that the prefpane needs.
 * 
 * In theory, all of the custom functionality in this wrapper should get
 * pushed down into nsIHandlerInfo eventually.
 */
function HandlerInfoWrapper(aType, aHandlerInfo) {
  this._type = aType;
  this.wrappedHandlerInfo = aHandlerInfo;
}

HandlerInfoWrapper.prototype = {
  // The wrapped nsIHandlerInfo object.  In general, this object is private,
  // but there are a couple cases where callers access it directly for things
  // we haven't (yet?) implemented, so we make it a public property.
  wrappedHandlerInfo: null,


  //**************************************************************************//
  // Convenience Utils

  _handlerSvc: Cc["@mozilla.org/uriloader/handler-service;1"].
               getService(Ci.nsIHandlerService),

  _categoryMgr: Cc["@mozilla.org/categorymanager;1"].
                getService(Ci.nsICategoryManager),

  element: function(aID) {
    return document.getElementById(aID);
  },


  //**************************************************************************//
  // nsIHandlerInfo

  // The MIME type or protocol scheme.
  _type: null,
  get type() {
    return this._type;
  },

  get description() {
    if (this.wrappedHandlerInfo.description)
      return this.wrappedHandlerInfo.description;

    if (this.primaryExtension) {
      var extension = this.primaryExtension.toUpperCase();
      return this.element("bundlePreferences").getFormattedString("fileEnding",
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

  addPossibleApplicationHandler: function(aNewHandler) {
    var possibleApps = this.possibleApplicationHandlers.enumerate();
    while (possibleApps.hasMoreElements()) {
      if (possibleApps.getNext().equals(aNewHandler))
        return;
    }
    this.possibleApplicationHandlers.appendElement(aNewHandler, false);
  },

  removePossibleApplicationHandler: function(aHandler) {
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
      if (this.wrappedHandlerInfo.hasDefaultHandler)
        return Ci.nsIHandlerInfo.useSystemDefault;
      else
        return Ci.nsIHandlerInfo.saveToDisk;
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

  store: function() {
    this._handlerSvc.store(this.wrappedHandlerInfo);
  },


  //**************************************************************************//
  // Icons

  get smallIcon() {
    return this._getIcon(16);
  },

  get largeIcon() {
    return this._getIcon(32);
  },

  _getIcon: function(aSize) {
    if (this.primaryExtension)
      return "moz-icon://goat." + this.primaryExtension + "?size=" + aSize;

    if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo)
      return "moz-icon://goat?size=" + aSize + "&contentType=" + this.type;

    // FIXME: consider returning some generic icon when we can't get a URL for
    // one (for example in the case of protocol schemes).  Filed as bug 395141.
    return null;
  }

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

  _mimeSvc      : Cc["@mozilla.org/mime;1"].
                  getService(Ci.nsIMIMEService),

  _helperAppSvc : Cc["@mozilla.org/uriloader/external-helper-app-service;1"].
                  getService(Ci.nsIExternalHelperAppService),

  _handlerSvc   : Cc["@mozilla.org/uriloader/handler-service;1"].
                  getService(Ci.nsIHandlerService),


  //**************************************************************************//
  // Initialization & Destruction

  init: function() {
    // Initialize shortcuts to some commonly accessed elements & values.
    this._brandShortName =
      document.getElementById("bundleBrand").getString("brandShortName");
    this._prefsBundle = document.getElementById("bundlePreferences");
    this._list = document.getElementById("handlersView");
    this._filter = document.getElementById("filter");

    // Listen for window unload so we can remove our preference observers.
    window.addEventListener("unload", this);

    // Figure out how we should be sorting the list.  We persist sort settings
    // across sessions, so we can't assume the default sort column/direction.
    // XXX should we be using the XUL sort service instead?
    if (document.getElementById("actionColumn").hasAttribute("sortDirection")) {
      this._sortColumn = document.getElementById("actionColumn");
      // The typeColumn element always has a sortDirection attribute,
      // either because it was persisted or because the default value
      // from the xul file was used.  If we are sorting on the other
      // column, we should remove it.
      document.getElementById("typeColumn").removeAttribute("sortDirection");
    }
    else 
      this._sortColumn = document.getElementById("typeColumn");

    // Load the data and build the list of handlers.
    // By doing this in a timeout, we let the preferences dialog resize itself
    // to an appropriate size before we add a bunch of items to the list.
    // Otherwise, if there are many items, and the Applications prefpane
    // is the one that gets displayed when the user first opens the dialog,
    // the dialog might stretch too much in an attempt to fit them all in.
    // XXX Shouldn't we perhaps just set a max-height on the richlistbox?
    var _delayedPaneLoad = function(self) {
      self._loadData();
      self._rebuildVisibleTypes();
      self._sortVisibleTypes();
      self._rebuildView();

      // Notify observers that the UI is now ready
      Services.obs.notifyObservers(window, "app-handler-pane-loaded", null);
    };
    setTimeout(_delayedPaneLoad, 0, this);
  },

  destroy: function() {
    window.removeEventListener("unload", this, false);
  },


  //**************************************************************************//
  // nsISupports

  QueryInterface: function(aIID) {
    if (aIID.equals(Ci.nsIObserver) ||
        aIID.equals(Ci.nsIDOMEventListener ||
        aIID.equals(Ci.nsISupports)))
      return this;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },


  //**************************************************************************//
  // nsIObserver

  observe: function (aSubject, aTopic, aData) {
    // Rebuild the list when there are changes to preferences that influence
    // whether or not to show certain entries in the list.
    if (aTopic == "nsPref:changed" && !this._storingAction) {
      // All the prefs we observe can affect what we display, so we rebuild
      // the view when any of them changes.
      this._rebuildView();
    }
  },


  //**************************************************************************//
  // nsIDOMEventListener

  handleEvent: function(aEvent) {
    if (aEvent.type == "unload") {
      this.destroy();
    }
  },


  //**************************************************************************//
  // Composed Model Construction

  _loadData: function() {
    this._loadApplicationHandlers();
  },

  /**
   * Load the set of handlers defined by the application datastore.
   */
  _loadApplicationHandlers: function() {
    var wrappedHandlerInfos = this._handlerSvc.enumerate();
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

      handlerInfoWrapper.handledOnlyByPlugin = false;
    }
  },


  //**************************************************************************//
  // View Construction

  _rebuildVisibleTypes: function() {
    // Reset the list of visible types and the visible type description counts.
    this._visibleTypes = [];
    this._visibleTypeDescriptionCount = {};

    for (let type in this._handledTypes) {
      let handlerInfo = this._handledTypes[type];

      // Hide types handled only by plugins.
      if (handlerInfo.handledOnlyByPlugin)
        continue;

      // We couldn't find any reason to exclude the type, so include it.
      this._visibleTypes.push(handlerInfo);

      if (handlerInfo.description in this._visibleTypeDescriptionCount)
        this._visibleTypeDescriptionCount[handlerInfo.description]++;
      else
        this._visibleTypeDescriptionCount[handlerInfo.description] = 1;
    }
  },

  _rebuildView: function() {
    // Clear the list of entries.
    while (this._list.childNodes.length > 1)
      this._list.lastChild.remove();

    var visibleTypes = this._visibleTypes;

    // If the user is filtering the list, then only show matching types.
    if (this._filter.value)
      visibleTypes = visibleTypes.filter(this._matchesFilter, this);

    for each (let visibleType in visibleTypes) {
      let item = document.createElement("richlistitem");
      item.setAttribute("type", visibleType.type);
      item.setAttribute("typeDescription", this._describeType(visibleType));
      if (visibleType.smallIcon)
        item.setAttribute("typeIcon", visibleType.smallIcon);
      item.setAttribute("actionDescription",
                        this._describePreferredAction(visibleType));

      if (!this._setIconClassForPreferredAction(visibleType, item)) {
        item.setAttribute("actionIcon",
                          this._getIconURLForPreferredAction(visibleType));
      }

      this._list.appendChild(item);
    }

    this._selectLastSelectedType();
  },

  _matchesFilter: function(aType) {
    var filterValue = this._filter.value.toLowerCase();
    return this._describeType(aType).toLowerCase().indexOf(filterValue) != -1 ||
           this._describePreferredAction(aType).toLowerCase().indexOf(filterValue) != -1;
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
  _describeType: function(aHandlerInfo) {
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
  _describePreferredAction: function(aHandlerInfo) {
    // alwaysAskBeforeHandling overrides the preferred action, so if that flag
    // is set, then describe that behavior instead.  This is
    // the "alwaysAsk" string.
    if (aHandlerInfo.alwaysAskBeforeHandling)
      return this._prefsBundle.getString("alwaysAsk");

    switch (aHandlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        return this._prefsBundle.getString("saveFile");

      case Ci.nsIHandlerInfo.useHelperApp:
        var preferredApp = aHandlerInfo.preferredApplicationHandler;
        var name;
        if (preferredApp instanceof Ci.nsILocalHandlerApp)
          name = getDisplayNameForFile(preferredApp.executable);
        else
          name = preferredApp.name;
        return this._prefsBundle.getFormattedString("useApp", [name]);

      case Ci.nsIHandlerInfo.handleInternally:
        // handleInternally looks like either useHelperApp
        // or useSystemDefault depending on whether or not there's a preferred
        // handler app.
        if (this.isValidHandlerApp(aHandlerInfo.preferredApplicationHandler))
          return aHandlerInfo.preferredApplicationHandler.name;

        return aHandlerInfo.defaultDescription;

        // XXX Why don't we say the app will handle the type internally?
        // Is it because the app can't actually do that?  But if that's true,
        // then why would a preferredAction ever get set to this value
        // in the first place?

      case Ci.nsIHandlerInfo.useSystemDefault:
        return this._prefsBundle.getFormattedString("useDefault",
                                                    [aHandlerInfo.defaultDescription]);
    }
  },

  _selectLastSelectedType: function() {
    var lastSelectedType = this._list.getAttribute("lastSelectedType");
    if (!lastSelectedType)
      return;

    var item = this._list.getElementsByAttribute("type", lastSelectedType)[0];
    if (!item)
      return;

    this._list.selectedItem = item;
  },

  /**
   * Whether or not the given handler app is valid.
   *
   * @param aHandlerApp {nsIHandlerApp} the handler app in question
   *
   * @returns {boolean} whether or not it's valid
   */
  isValidHandlerApp: function(aHandlerApp) {
    if (!aHandlerApp)
      return false;

    if (aHandlerApp instanceof Ci.nsILocalHandlerApp)
      return this._isValidHandlerExecutable(aHandlerApp.executable);

    if (aHandlerApp instanceof Ci.nsIWebHandlerApp)
      return aHandlerApp.uriTemplate;

    if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo)
      return aHandlerApp.uri;

    return false;
  },

  _isValidHandlerExecutable: function(aExecutable) {
    return aExecutable &&
           aExecutable.exists() &&
           aExecutable.isExecutable() &&
// XXXben - we need to compare this with the running instance executable
//          just don't know how to do that via script...
// XXXmano TBD: can probably add this to nsIShellService
#ifdef XP_WIN
#expand    aExecutable.leafName != "__MOZ_APP_NAME__.exe";
#else
#ifdef XP_MACOSX
#expand    aExecutable.leafName != "__MOZ_MACBUNDLE_NAME__.app";
#else
#expand    aExecutable.leafName != "__MOZ_APP_NAME__-bin";
#endif
#endif
  },

  /**
   * Rebuild the actions menu for the selected entry.  Gets called by
   * the richlistitem constructor when an entry in the list gets selected.
   */
  rebuildActionsMenu: function() {
    var typeItem = this._list.selectedItem;
    var handlerInfo = this._handledTypes[typeItem.type];
    var menu =
      document.getAnonymousElementByAttribute(typeItem, "class", "actionsMenu");
    var menuPopup = menu.menupopup;

    // Clear out existing items.
    while (menuPopup.hasChildNodes())
      menuPopup.lastChild.remove();

    {
      var askMenuItem = document.createElement("menuitem");
      askMenuItem.setAttribute("alwaysAsk", "true");
      let label = this._prefsBundle.getString("alwaysAsk");
      askMenuItem.setAttribute("label", label);
      askMenuItem.setAttribute("tooltiptext", label);
      askMenuItem.setAttribute(APP_ICON_ATTR_NAME, "ask");
      menuPopup.appendChild(askMenuItem);
    }

    // Create a menu item for saving to disk.
    // Note: this option isn't available to protocol types, since we don't know
    // what it means to save a URL having a certain scheme to disk.
    if ((handlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo)) {
      var saveMenuItem = document.createElement("menuitem");
      saveMenuItem.setAttribute("action", Ci.nsIHandlerInfo.saveToDisk);
      let label = this._prefsBundle.getString("saveFile");
      saveMenuItem.setAttribute("label", label);
      saveMenuItem.setAttribute("tooltiptext", label);
      saveMenuItem.setAttribute(APP_ICON_ATTR_NAME, "save");
      menuPopup.appendChild(saveMenuItem);
    }

    // Add a separator to distinguish these items from the helper app items
    // that follow them.
    let menuItem = document.createElement("menuseparator");
    menuPopup.appendChild(menuItem);

    // Create a menu item for the OS default application, if any.
    if (handlerInfo.hasDefaultHandler) {
      var defaultMenuItem = document.createElement("menuitem");
      defaultMenuItem.setAttribute("action", Ci.nsIHandlerInfo.useSystemDefault);
      let label = this._prefsBundle.getFormattedString("useDefault",
                                                       [handlerInfo.defaultDescription]);
      defaultMenuItem.setAttribute("label", label);
      defaultMenuItem.setAttribute("tooltiptext", handlerInfo.defaultDescription);
      defaultMenuItem.setAttribute("image", this._getIconURLForSystemDefault(handlerInfo));

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
      menuItem.setAttribute("action", Ci.nsIHandlerInfo.useHelperApp);
      let label;
      if (possibleApp instanceof Ci.nsILocalHandlerApp)
        label = getDisplayNameForFile(possibleApp.executable);
      else
        label = possibleApp.name;
      label = this._prefsBundle.getFormattedString("useApp", [label]);
      menuItem.setAttribute("label", label);
      menuItem.setAttribute("tooltiptext", label);
      menuItem.setAttribute("image", this._getIconURLForHandlerApp(possibleApp));

      // Attach the handler app object to the menu item so we can use it
      // to make changes to the datastore when the user selects the item.
      menuItem.handlerApp = possibleApp;

      menuPopup.appendChild(menuItem);
      possibleAppMenuItems.push(menuItem);
    }

    // Create a menu item for selecting a local application.
#ifdef XP_WIN
    // On Windows, selecting an application to open another application
    // would be meaningless so we special case executables.
    var executableType = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService)
                                                  .getTypeFromExtension("exe");
    if (handlerInfo.type != executableType)
#endif
    {
      let menuItem = document.createElement("menuitem");
      menuItem.setAttribute("oncommand", "gApplicationsPane.chooseApp(event)");
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
      menuItem.setAttribute("oncommand", "gApplicationsPane.manageApp(event)");
      menuItem.setAttribute("label", this._prefsBundle.getString("manageApp"));
      menuPopup.appendChild(menuItem);
    }

    // Select the item corresponding to the preferred action.  If the always
    // ask flag is set, it overrides the preferred action.  Otherwise we pick
    // the item identified by the preferred action (when the preferred action
    // is to use a helper app, we have to pick the specific helper app item).
    if (handlerInfo.alwaysAskBeforeHandling)
      menu.selectedItem = askMenuItem;
    else switch (handlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.handleInternally:
        menu.selectedItem = internalMenuItem;
        break;
      case Ci.nsIHandlerInfo.useSystemDefault:
        menu.selectedItem = defaultMenuItem;
        break;
      case Ci.nsIHandlerInfo.useHelperApp:
        if (preferredApp)
          menu.selectedItem = 
            possibleAppMenuItems.filter(v => v.handlerApp.equals(preferredApp))[0];
        break;
      case Ci.nsIHandlerInfo.saveToDisk:
        menu.selectedItem = saveMenuItem;
        break;
    }
  },


  //**************************************************************************//
  // Sorting & Filtering

  _sortColumn: null,

  /**
   * Sort the list when the user clicks on a column header.
   */
  sort: function (event) {
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
  _sortVisibleTypes: function() {
    if (!this._sortColumn)
      return;

    var t = this;

    function sortByType(a, b) {
      return t._describeType(a).toLowerCase().
             localeCompare(t._describeType(b).toLowerCase());
    }

    function sortByAction(a, b) {
      return t._describePreferredAction(a).toLowerCase().
             localeCompare(t._describePreferredAction(b).toLowerCase());
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

  /**
   * Filter the list when the user enters a filter term into the filter field.
   */
  filter: function() {
    this._rebuildView();
  },

  focusFilterBox: function() {
    this._filter.focus();
    this._filter.select();
  },


  //**************************************************************************//
  // Changes

  onSelectAction: function(aActionItem) {
    this._storingAction = true;

    try {
      this._storeAction(aActionItem);
    }
    finally {
      this._storingAction = false;
    }
  },

  _storeAction: function(aActionItem) {
    var typeItem = this._list.selectedItem;
    var handlerInfo = this._handledTypes[typeItem.type];

    if (aActionItem.hasAttribute("alwaysAsk")) {
      handlerInfo.alwaysAskBeforeHandling = true;
    }
    else if (aActionItem.hasAttribute("action")) {
      let action = parseInt(aActionItem.getAttribute("action"));

      // Set the preferred application handler.
      // We leave the existing preferred app in the list when we set
      // the preferred action to something other than useHelperApp so that
      // legacy datastores that don't have the preferred app in the list
      // of possible apps still include the preferred app in the list of apps
      // the user can choose to handle the type.
      if (action == Ci.nsIHandlerInfo.useHelperApp)
        handlerInfo.preferredApplicationHandler = aActionItem.handlerApp;

      // Set the "always ask" flag.
      handlerInfo.alwaysAskBeforeHandling = false;

      // Set the preferred action.
      handlerInfo.preferredAction = action;
    }

    handlerInfo.store();

    // Make sure the handler info object is flagged to indicate that there is
    // now some user configuration for the type.
    handlerInfo.handledOnlyByPlugin = false;

    // Update the action label and image to reflect the new preferred action.
    typeItem.setAttribute("actionDescription",
                          this._describePreferredAction(handlerInfo));
    if (!this._setIconClassForPreferredAction(handlerInfo, typeItem)) {
      typeItem.setAttribute("actionIcon",
                            this._getIconURLForPreferredAction(handlerInfo));
    }
  },

  manageApp: function(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var typeItem = this._list.selectedItem;
    var handlerInfo = this._handledTypes[typeItem.type];

    document.documentElement.openSubDialog("chrome://instantbird/content/preferences/applicationManager.xul",
                                           "", handlerInfo);

    // Rebuild the actions menu so that we revert to the previous selection,
    // or "Always ask" if the previous default application has been removed
    this.rebuildActionsMenu();

    // update the richlistitem too. Will be visible when selecting another row
    typeItem.setAttribute("actionDescription",
                          this._describePreferredAction(handlerInfo));
    if (!this._setIconClassForPreferredAction(handlerInfo, typeItem)) {
      typeItem.setAttribute("actionIcon",
                            this._getIconURLForPreferredAction(handlerInfo));
    }
  },

  chooseApp: function(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerApp;

#ifdef XP_WIN
    var params = {};
    var handlerInfo = this._handledTypes[this._list.selectedItem.type];
    params.mimeInfo = handlerInfo.wrappedHandlerInfo;
    params.title         = this._prefsBundle.getString("fpTitleChooseApp");
    params.description   = handlerInfo.description;
    params.filename      = null;
    params.handlerApp    = null;

    window.openDialog("chrome://global/content/appPicker.xul", null,
                      "chrome,modal,centerscreen,titlebar,dialog=yes",
                      params);

    if (params.handlerApp && 
        params.handlerApp.executable && 
        params.handlerApp.executable.isFile()) {
      handlerApp = params.handlerApp;

      // Add the app to the type's list of possible handlers.
      handlerInfo.addPossibleApplicationHandler(handlerApp);
    }
#else
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    var winTitle = this._prefsBundle.getString("fpTitleChooseApp");
    fp.init(window, winTitle, Ci.nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterApps);

    // Prompt the user to pick an app.  If they pick one, and it's a valid
    // selection, then add it to the list of possible handlers.
    if (fp.show() == Ci.nsIFilePicker.returnOK && fp.file &&
        this._isValidHandlerExecutable(fp.file)) {
      handlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"].
                   createInstance(Ci.nsILocalHandlerApp);
      handlerApp.name = getDisplayNameForFile(fp.file);
      handlerApp.executable = fp.file;

      // Add the app to the type's list of possible handlers.
      let handlerInfo = this._handledTypes[this._list.selectedItem.type];
      handlerInfo.addPossibleApplicationHandler(handlerApp);
    }
#endif

    // Rebuild the actions menu whether the user picked an app or canceled.
    // If they picked an app, we want to add the app to the menu and select it.
    // If they canceled, we want to go back to their previous selection.
    this.rebuildActionsMenu();

    // If the user picked a new app from the menu, select it.
    if (handlerApp) {
      let typeItem = this._list.selectedItem;
      let actionsMenu =
        document.getAnonymousElementByAttribute(typeItem, "class", "actionsMenu");
      let menuItems = actionsMenu.menupopup.childNodes;
      for (let i = 0; i < menuItems.length; i++) {
        let menuItem = menuItems[i];
        if (menuItem.handlerApp && menuItem.handlerApp.equals(handlerApp)) {
          actionsMenu.selectedIndex = i;
          this.onSelectAction(menuItem);
          break;
        }
      }
    }
  },

  // Mark which item in the list was last selected so we can reselect it
  // when we rebuild the list or when the user returns to the prefpane.
  onSelectionChanged: function() {
    if (this._list.selectedItem)
      this._list.setAttribute("lastSelectedType",
                              this._list.selectedItem.getAttribute("type"));
  },

  _setIconClassForPreferredAction: function(aHandlerInfo, aElement) {
    // If this returns true, the attribute that CSS sniffs for was set to something
    // so you shouldn't manually set an icon URI.
    // This removes the existing actionIcon attribute if any, even if returning false.
    aElement.removeAttribute("actionIcon");

    if (aHandlerInfo.alwaysAskBeforeHandling) {
      aElement.setAttribute(APP_ICON_ATTR_NAME, "ask");
      return true;
    }

    switch (aHandlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        aElement.setAttribute(APP_ICON_ATTR_NAME, "save");
        return true;

      case Ci.nsIHandlerInfo.handleInternally:
        break;
    }
    aElement.removeAttribute(APP_ICON_ATTR_NAME);
    return false;
  },

  _getIconURLForPreferredAction: function(aHandlerInfo) {
    switch (aHandlerInfo.preferredAction) {
      case Ci.nsIHandlerInfo.useSystemDefault:
        return this._getIconURLForSystemDefault(aHandlerInfo);

      case Ci.nsIHandlerInfo.useHelperApp:
        let preferredApp = aHandlerInfo.preferredApplicationHandler;
        if (this.isValidHandlerApp(preferredApp))
          return this._getIconURLForHandlerApp(preferredApp);
        break;

      // This should never happen, but if preferredAction is set to some weird
      // value, then fall back to the generic application icon.
      default:
        return ICON_URL_APP;
    }
  },

  _getIconURLForHandlerApp: function(aHandlerApp) {
    if (aHandlerApp instanceof Ci.nsILocalHandlerApp)
      return this._getIconURLForFile(aHandlerApp.executable);

    if (aHandlerApp instanceof Ci.nsIWebHandlerApp)
      return this._getIconURLForWebApp(aHandlerApp.uriTemplate);

    if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo)
      return this._getIconURLForWebApp(aHandlerApp.uri);

    // We know nothing about other kinds of handler apps.
    return "";
  },

  _getIconURLForFile: function(aFile) {
    var fph = Services.io.getProtocolHandler("file").
              QueryInterface(Ci.nsIFileProtocolHandler);
    var urlSpec = fph.getURLSpecFromFile(aFile);

    return "moz-icon://" + urlSpec + "?size=16";
  },

  _getIconURLForWebApp: function(aWebAppURITemplate) {
    var uri = Services.io.newURI(aWebAppURITemplate, null, null);

    // Unfortunately we can't use the favicon service to get the favicon,
    // because the service looks in the annotations table for a record with
    // the exact URL we give it, and users won't have such records for URLs
    // they don't visit, and users won't visit the web app's URL template,
    // they'll only visit URLs derived from that template (i.e. with %s
    // in the template replaced by the URL of the content being handled).

    if (/^https?/.test(uri.scheme) && Services.prefs.getBoolPref("browser.chrome.favicons"))
      return uri.prePath + "/favicon.ico";

    return "";
  },

  _getIconURLForSystemDefault: function(aHandlerInfo) {
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
    return ICON_URL_APP;
  }

};
