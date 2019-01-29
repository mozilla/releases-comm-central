/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

// applications.inc.xul
/* globals ICON_URL_APP */

// ------------------------------
// Constants & Enumeration Values

// For CSS. Can be one of "ask", "save", or "feed". If absent, the icon URL
// was set by us to a custom handler icon and CSS should not try to override it.
var APP_ICON_ATTR_NAME = "appHandlerIcon";

var gNodeToObjectMap = new WeakMap();

// CloudFile account tools used by gCloudFileTab.
const {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.js");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

XPCOMUtils.defineLazyServiceGetters(this, {
  gHandlerService: ["@mozilla.org/uriloader/handler-service;1", "nsIHandlerService"],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
});

// ---------
// Utilities

function getDisplayNameForFile(aFile) {
  if (AppConstants.platform == "win") {
    if (aFile instanceof Ci.nsILocalFileWin) {
      try {
        return aFile.getVersionInfoField("FileDescription");
      } catch (ex) {
        // fall through to the file name
      }
    }
  } else if (AppConstants.platform == "macosx") {
    if (aFile instanceof Ci.nsILocalFileMac) {
      try {
        return aFile.bundleDisplayName;
      } catch (ex) {
        // fall through to the file name
      }
    }
  }

  return aFile.leafName;
}

function getLocalHandlerApp(aFile) {
  var localHandlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"]
                          .createInstance(Ci.nsILocalHandlerApp);
  localHandlerApp.name = getDisplayNameForFile(aFile);
  localHandlerApp.executable = aFile;

  return localHandlerApp;
}

// eslint-disable-next-line no-undef
let gHandlerListItemFragment = MozXULElement.parseXULToFragment(`
  <richlistitem>
    <hbox flex="1" equalsize="always">
      <hbox class="typeContainer" flex="1" align="center">
        <image class="typeIcon" width="16" height="16"
               src="moz-icon://goat?size=16"/>
        <label class="typeDescription" flex="1" crop="end"/>
      </hbox>
      <hbox class="actionContainer" flex="1" align="center">
        <image class="actionIcon" width="16" height="16"/>
        <label class="actionDescription" flex="1" crop="end"/>
      </hbox>
      <hbox class="actionsMenuContainer" flex="1">
        <menulist class="actionsMenu" flex="1" crop="end" selectedIndex="1">
          <menupopup/>
        </menulist>
      </hbox>
    </hbox>
  </richlistitem>
`);

/**
 * This is associated to <richlistitem> elements in the handlers view.
 */
class HandlerListItem {
  static forNode(node) {
    return gNodeToObjectMap.get(node);
  }

  constructor(handlerInfoWrapper) {
    this.handlerInfoWrapper = handlerInfoWrapper;
    }

  setOrRemoveAttributes(iterable) {
    for (let [selector, name, value] of iterable) {
      let node = selector ? this.node.querySelector(selector) : this.node;
      if (value) {
        node.setAttribute(name, value);
      } else {
        node.removeAttribute(name);
      }
    }
  }

  connectAndAppendToList(list) {
    list.appendChild(document.importNode(gHandlerListItemFragment, true));
    this.node = list.lastChild;
    gNodeToObjectMap.set(this.node, this);

    this.node.querySelector(".actionsMenu").addEventListener("command",
      event => gApplicationsPane.onSelectAction(event.originalTarget));

    let typeDescription = this.handlerInfoWrapper.typeDescription;
    this.setOrRemoveAttributes([
      [null, "type", this.handlerInfoWrapper.type],
      [".typeContainer", "tooltiptext", typeDescription],
      [".typeDescription", "value", typeDescription],
      [".typeIcon", "src", this.handlerInfoWrapper.smallIcon],
    ]);
    this.refreshAction();
    this.showActionsMenu = false;
  }

  refreshAction() {
    let { actionIconClass, actionDescription } = this.handlerInfoWrapper;
    this.setOrRemoveAttributes([
      [null, APP_ICON_ATTR_NAME, actionIconClass],
      [".actionContainer", "tooltiptext", actionDescription],
      [".actionDescription", "value", actionDescription],
      [".actionIcon", "src", actionIconClass ? null :
                             this.handlerInfoWrapper.actionIcon],
    ]);
  }

  set showActionsMenu(value) {
    this.setOrRemoveAttributes([
      [".actionContainer", "hidden", value],
      [".actionsMenuContainer", "hidden", !value],
    ]);
  }
}

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
 */
class HandlerInfoWrapper {
  constructor(type, handlerInfo) {
    this.type = type;
    this.wrappedHandlerInfo = handlerInfo;
    this.disambiguateDescription = false;
  }

  get description() {
    if (this.wrappedHandlerInfo.description)
      return this.wrappedHandlerInfo.description;

    if (this.primaryExtension) {
      var extension = this.primaryExtension.toUpperCase();
      return document.getElementById("bundlePreferences")
                     .getFormattedString("fileEnding", [extension]);
    }
    return this.type;
  }

  /**
   * Describe, in a human-readable fashion, the type represented by the given
   * handler info object.  Normally this is just the description, but if more
   * than one object presents the same description, "disambiguateDescription"
   * is set and we annotate the duplicate descriptions with the type itself
   * to help users distinguish between those types.
   */
  get typeDescription() {
    if (this.disambiguateDescription) {
      return this._prefsBundle.getFormattedString(
        "typeDetailsWithTypeAndExt", [this.description, this.type]);
    }

    return this.description;
  }

  /**
   * Describe, in a human-readable fashion, the preferred action to take on
   * the type represented by the given handler info object.
   */
  get actionDescription() {
    // alwaysAskBeforeHandling overrides the preferred action, so if that flag
    // is set, then describe that behavior instead.  For most types, this is
    // the "alwaysAsk" string, but for the feed type we show something special.
    if (this.alwaysAskBeforeHandling) {
      return gApplicationsPane._prefsBundle.getString("alwaysAsk");
    }

    switch (this.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        return gApplicationsPane._prefsBundle.getString("saveFile");

      case Ci.nsIHandlerInfo.useHelperApp:
        var preferredApp = this.preferredApplicationHandler;
        var name;
        if (preferredApp instanceof Ci.nsILocalHandlerApp)
          name = getDisplayNameForFile(preferredApp.executable);
        else
          name = preferredApp.name;
        return gApplicationsPane._prefsBundle.getFormattedString("useApp", [name]);

      case Ci.nsIHandlerInfo.handleInternally:
        if (this instanceof InternalHandlerInfoWrapper) {
          return gApplicationsPane._prefsBundle.getFormattedString("previewInApp",
            [gApplicationsPane._brandShortName]);
        }

        // For other types, handleInternally looks like either useHelperApp
        // or useSystemDefault depending on whether or not there's a preferred
        // handler app.
        if (gApplicationsPane.isValidHandlerApp(this.preferredApplicationHandler))
          return this.preferredApplicationHandler.name;

        return this.defaultDescription;

      // XXX Why don't we say the app will handle the type internally?
      // Is it because the app can't actually do that?  But if that's true,
      // then why would a preferredAction ever get set to this value
      // in the first place?

      case Ci.nsIHandlerInfo.useSystemDefault:
        return gApplicationsPane._prefsBundle.getFormattedString("useDefault",
          [this.defaultDescription]);

      default:
        throw new Error(`Unexpected preferredAction: ${this.preferredAction}`);
    }
  }

  get actionIconClass() {
    if (this.alwaysAskBeforeHandling) {
      return "ask";
    }

    switch (this.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        return "save";

      case Ci.nsIHandlerInfo.handleInternally:
        if (this instanceof InternalHandlerInfoWrapper) {
          return "ask";
        }
    }

    return "";
  }

  get actionIcon() {
    switch (this.preferredAction) {
      case Ci.nsIHandlerInfo.useSystemDefault:
        return this.iconURLForSystemDefault;

      case Ci.nsIHandlerInfo.useHelperApp:
        let preferredApp = this.preferredApplicationHandler;
        if (gApplicationsPane.isValidHandlerApp(preferredApp)) {
          return gApplicationsPane._getIconURLForHandlerApp(preferredApp);
        }
      // Explicit fall-through

      // This should never happen, but if preferredAction is set to some weird
      // value, then fall back to the generic application icon.
      default:
        return ICON_URL_APP;
    }
  }

  get iconURLForSystemDefault() {
    // Handler info objects for MIME types on some OSes implement a property bag
    // interface from which we can get an icon for the default app, so if we're
    // dealing with a MIME type on one of those OSes, then try to get the icon.
    if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo &&
        this.wrappedHandlerInfo instanceof Ci.nsIPropertyBag) {
      try {
        let url = this.wrappedHandlerInfo.getProperty("defaultApplicationIconURL");
        if (url) {
          return url + "?size=16";
        }
      } catch (ex) { }
    }

    // If this isn't a MIME type object on an OS that supports retrieving
    // the icon, or if we couldn't retrieve the icon for some other reason,
    // then use a generic icon.
    return ICON_URL_APP;
  }

  get preferredApplicationHandler() {
    return this.wrappedHandlerInfo.preferredApplicationHandler;
  }

  set preferredApplicationHandler(aNewValue) {
    this.wrappedHandlerInfo.preferredApplicationHandler = aNewValue;

    // Make sure the preferred handler is in the set of possible handlers.
    if (aNewValue)
      this.addPossibleApplicationHandler(aNewValue);
  }

  get possibleApplicationHandlers() {
    return this.wrappedHandlerInfo.possibleApplicationHandlers;
  }

  addPossibleApplicationHandler(aNewHandler) {
    var possibleApps = this.possibleApplicationHandlers.enumerate();
    while (possibleApps.hasMoreElements()) {
      if (possibleApps.getNext().equals(aNewHandler))
        return;
    }
    this.possibleApplicationHandlers.appendElement(aNewHandler);
  }

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
  }

  get hasDefaultHandler() {
    return this.wrappedHandlerInfo.hasDefaultHandler;
  }

  get defaultDescription() {
    return this.wrappedHandlerInfo.defaultDescription;
  }

  // What to do with content of this type.
  get preferredAction() {
    // If the action is to use a helper app, but we don't have a preferred
    // handler app, then switch to using the system default, if any; otherwise
    // fall back to saving to disk, which is the default action in nsMIMEInfo.
    // Note: "save to disk" is an invalid value for protocol info objects,
    // but the alwaysAskBeforeHandling getter will detect that situation
    // and always return true in that case to override this invalid value.
    if (this.wrappedHandlerInfo.preferredAction ==
          Ci.nsIHandlerInfo.useHelperApp &&
        !gApplicationsPane.isValidHandlerApp(this.preferredApplicationHandler)) {
      if (this.wrappedHandlerInfo.hasDefaultHandler)
        return Ci.nsIHandlerInfo.useSystemDefault;
      return Ci.nsIHandlerInfo.saveToDisk;
    }

    return this.wrappedHandlerInfo.preferredAction;
  }

  set preferredAction(aNewValue) {
    this.wrappedHandlerInfo.preferredAction = aNewValue;
  }

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
  }

  set alwaysAskBeforeHandling(aNewValue) {
    this.wrappedHandlerInfo.alwaysAskBeforeHandling = aNewValue;
  }

  // The primary file extension associated with this type, if any.
  get primaryExtension() {
    try {
      if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo &&
          this.wrappedHandlerInfo.primaryExtension)
        return this.wrappedHandlerInfo.primaryExtension;
    } catch (ex) {}

    return null;
  }

  // -------
  // Storage

  store() {
    gHandlerService.store(this.wrappedHandlerInfo);
  }

  remove() {
    gHandlerService.remove(this.wrappedHandlerInfo);
  }

  // -----
  // Icons

  get smallIcon() {
    return this._getIcon(16);
  }

  get largeIcon() {
    return this._getIcon(32);
  }

  _getIcon(aSize) {
    if (this.primaryExtension)
      return "moz-icon://goat." + this.primaryExtension + "?size=" + aSize;

    if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo)
      return "moz-icon://goat?size=" + aSize + "&contentType=" + this.type;

    // FIXME: consider returning some generic icon when we can't get a URL for
    // one (for example in the case of protocol schemes).  Filed as bug 395141.
    return null;
  }
}

var gApplicationsTabController = {
  mInitialized: false,
  // We default to displaying the Outgoing tab, which is the tab at index 1
  // of the attachmentPrefs tabs.
  mDefaultIndex: 1,

  init() {
    if (this.mInitialized)
      return;

    gApplicationsPane.init();

    this.mTabBox = document.getElementById("attachmentPrefs");

    // If BigFiles is disabled, hide the "Outgoing" tab, and the tab
    // selectors, and bail out.
    if (!Services.prefs.getBoolPref("mail.cloud_files.enabled")) {
      // Default to the first tab, "Incoming"
      this.mTabBox.selectedIndex = 0;
      // Hide the tab selector
      let tabs = document.getElementById("attachmentPrefsTabs");
      tabs.hidden = true;
      this.mInitialized = true;
      return;
    }

    gCloudFileTab.init();
    this.paneSelectionChanged = this.paneSelectionChanged.bind(this);
    window.addEventListener("paneSelected", this.paneSelectionChanged);

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = document.getElementById("mail.preferences.applications.selectedTabIndex");
      this.mTabBox.selectedIndex = preference.value != null ? preference.value : this.mDefaultIndex;
    }

    this.mInitialized = true;
  },

  paneSelectionChanged() {
    gCloudFileTab.init();
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      document.getElementById("mail.preferences.applications.selectedTabIndex")
              .valueFromPreferences = this.mTabBox.selectedIndex;
    }

    gCloudFileTab.init();
  },
};

var gCloudFileTab = {
  _initialized: false,
  _initializationStarted: false,
  _list: null,
  _settings: null,
  _settingsDeck: null,
  _tabpanel: null,
  _accountCache: {},
  _settingsPanelWrap: null,
  _defaultPanel: null,
  _loadingPanel: null,
  _authErrorPanel: null,

  get _strings() {
    return Services.strings
                   .createBundle("chrome://messenger/locale/preferences/applications.properties");
  },

  init() {
    // Because this leads to another document being loaded, do it only when really necessary.
    if (this._initializationStarted) {
      return;
    }
    if (getCurrentPaneID() != "paneApplications") {
      return;
    }
    if (gApplicationsTabController.mTabBox.selectedIndex != 1) {
      return;
    }

    this._initializationStarted = true;
    window.removeEventListener("paneSelected", gApplicationsTabController.paneSelectionChanged);

    this._list = document.getElementById("cloudFileView");
    this._removeAccountButton = document.getElementById("removeCloudFileAccount");
    this._settingsDeck = document.getElementById("cloudFileSettingsDeck");
    this._defaultPanel = document.getElementById("cloudFileDefaultPanel");
    this._settingsPanelWrap = document.getElementById("cloudFileSettingsWrapper");
    this._loadingPanel = document.getElementById("cloudFileLoadingPanel");
    this._authErrorPanel = document.getElementById("cloudFileAuthErrorPanel");

    this.onSelectionChanged = this.onSelectionChanged.bind(this);
    this._list.addEventListener("select", this.onSelectionChanged);
    this.rebuildView();

    if (this._list.itemCount > 0) {
      this._list.selectedIndex = 0;
      this._removeAccountButton.disabled = false;
    }

    window.addEventListener("unload", this, {capture: false, once: true});

    this.updateThreshold();

    this._onProviderRegistered = this._onProviderRegistered.bind(this);
    this._onProviderUnregistered = this._onProviderUnregistered.bind(this);
    cloudFileAccounts.on("providerRegistered", this._onProviderRegistered);
    cloudFileAccounts.on("providerUnregistered", this._onProviderUnregistered);

    this._initialized = true;
  },

  destroy() {
    // Remove any controllers or observers here.
    cloudFileAccounts.off("providerRegistered", this._onProviderRegistered);
    cloudFileAccounts.off("providerUnregistered", this._onProviderUnregistered);
  },

  _onProviderRegistered(event, provider) {
    let accounts = cloudFileAccounts.getAccountsForType(provider.type);
    accounts.sort(this._sortAccounts);

    // Always add newly-enabled accounts to the end of the list, this makes
    // it clearer to users what's happening.
    for (let account of accounts) {
      let item = this.makeRichListItemForAccount(account);
      this._list.appendChild(item);
      if (!(account.accountKey in this._accountCache)) {
        let accountInfo = {
          account,
          listItem: item,
          result: Cr.NS_OK,
        };
        this._accountCache[account.accountKey] = accountInfo;
        this._mapResultToState(item, accountInfo.result);
      }
    }
  },

  _onProviderUnregistered(event, type) {
    for (let item of this._list.children) {
      // If the provider is unregistered, getAccount returns null.
      if (!cloudFileAccounts.getAccount(item.value)) {
        if (item.hasAttribute("selected")) {
          this._settingsDeck.selectedPanel = this._defaultPanel;
        }
        item.remove();
      }
    }
  },

  makeRichListItemForAccount(aAccount) {
    let rli = document.createElement("richlistitem");
    rli.value = aAccount.accountKey;
    rli.setAttribute("value", aAccount.accountKey);
    rli.setAttribute("class", "cloudfileAccount");
    rli.setAttribute("state", "waiting-to-connect");

    if (aAccount.iconClass)
      rli.style.listStyleImage = "url('" + aAccount.iconClass + "')";

    let displayName = cloudFileAccounts.getDisplayName(aAccount.accountKey);
    // Quick and ugly - accountKey:displayName for now
    let status = document.createElement("image");
    status.setAttribute("class", "typeIcon");

    rli.appendChild(status);
    let descr = document.createElement("label");
    descr.setAttribute("value", displayName);
    rli.appendChild(descr);

    // Set the state of the richlistitem, if applicable
    if (aAccount.accountKey in this._accountCache) {
      let result = this._accountCache[aAccount.accountKey].result;
      this._mapResultToState(rli, result);
      this._accountCache[aAccount.accountKey].listItem = rli;
    }

    return rli;
  },

  clearEntries() {
    // Clear the list of entries.
    while (this._list.hasChildNodes())
      this._list.lastChild.remove();
  },

  // Sort the accounts by displayName.
  _sortAccounts(a, b) {
    let aName = cloudFileAccounts.getDisplayName(a.accountKey)
                                 .toLowerCase();
    let bName = cloudFileAccounts.getDisplayName(b.accountKey)
                                 .toLowerCase();

    if (aName < bName)
      return -1;
    if (aName > bName)
      return 1;
    return 0;
  },

  rebuildView() {
    this.clearEntries();
    let accounts = cloudFileAccounts.accounts;

    accounts.sort(this._sortAccounts);

    for (let account of accounts) {
      let rli = this.makeRichListItemForAccount(account);
      this._list.appendChild(rli);
      if (!(account.accountKey in this._accountCache))
        this.requestUserInfoForItem(rli, false);
    }
  },

  requestUserInfoForItem(aItem, aWithUI) {
    let accountKey = aItem.value;
    let account = cloudFileAccounts.getAccount(accountKey);

    let observer = {
      onStopRequest(aRequest, aContext, aStatusCode) {
        gCloudFileTab._accountCache[accountKey].result = aStatusCode;
        gCloudFileTab.onUserInfoRequestDone(accountKey);
      },
      onStartRequest(aRequest, aContext) {
        aItem.setAttribute("state", "connecting");
      },
    };

    let accountInfo = {
      account,
      listItem: aItem,
      result: Cr.NS_ERROR_NOT_AVAILABLE,
    };

    this._accountCache[accountKey] = accountInfo;

    this._settingsDeck.selectedPanel = this._loadingPanel;
    account.refreshUserInfo(aWithUI, observer);
  },

  onUserInfoRequestDone(aAccountKey) {
    this.updateRichListItem(aAccountKey);

    if (this._list.selectedItem &&
        this._list.selectedItem.value == aAccountKey)
      this._showAccountInfo(aAccountKey);
  },

  updateRichListItem(aAccountKey) {
    let accountInfo = this._accountCache[aAccountKey];
    if (!accountInfo)
      return;

    let item = accountInfo.listItem;
    let result = accountInfo.result;
    this._mapResultToState(item, result);
  },

  _mapResultToState(aItem, aResult) {
    let itemState = "no-connection";

    if (aResult == Cr.NS_OK)
      itemState = "connected";
    else if (aResult == Ci.nsIMsgCloudFileProvider.authErr)
      itemState = "auth-error";
    else if (aResult == Cr.NS_ERROR_NOT_AVAILABLE)
      itemState = "no-connection";
    // TODO: What other states are there?

    aItem.setAttribute("state", itemState);
  },

  onSelectionChanged() {
    // Get the selected item
    let selection = this._list.selectedItem;
    this._removeAccountButton.disabled = !selection;
    if (!selection)
      return;

    // The selection tells us the key.  We need the actual
    // provider here.
    let accountKey = selection.value;
    this._showAccountInfo(accountKey);
  },

  _showAccountInfo(aAccountKey) {
    let account = this._accountCache[aAccountKey].account;
    let result = this._accountCache[aAccountKey].result;

    if (result == Cr.NS_ERROR_NOT_AVAILABLE) {
      this._settingsDeck.selectedPanel = this._loadingPanel;
    } else if (result == Cr.NS_OK) {
      this._settingsDeck.selectedPanel = this._settingsPanelWrap;
      this._showAccountManagement(account);
    } else if (result == Ci.nsIMsgCloudFileProvider.authErr) {
      this._settingsDeck.selectedPanel = this._authErrorPanel;
    } else {
      Cu.reportError("Unexpected connection error.");
    }
  },

  _showAccountManagement(aProvider) {
    let url = aProvider.managementURL;
    if (url.startsWith("moz-extension:")) {
      // Assumes there is only one account per provider.
      let account = cloudFileAccounts.getAccountsForType(aProvider.type)[0];
      url += `?accountId=${account.accountKey}`;
    }

    let iframe = document.createElement("iframe");
    iframe.setAttribute("flex", "1");
    // allows keeping dialog background color without hoops
    iframe.setAttribute("transparent", "true");

    let type = url.startsWith("chrome:") ? "chrome" : "content";
    iframe.setAttribute("type", type);
    iframe.setAttribute("src", url);

    // If we have a past iframe, we replace it. Else append
    // to the wrapper.
    if (this._settings)
      this._settings.remove();

    this._settingsPanelWrap.appendChild(iframe);
    this._settings = iframe;

    // When the iframe loads, populate it with the provider.
    this._settings.contentWindow.addEventListener("load", function() {
      try {
        iframe.contentWindow
              .wrappedJSObject
              .onLoadProvider(aProvider);
      } catch (e) {
        Cu.reportError(e);
      }
    }, {capture: false, once: true});
  },

  authSelected() {
    let item = this._list.selectedItem;

    if (!item)
      return;

    this.requestUserInfoForItem(item, true);
  },

  addCloudFileAccount() {
    let accountKey = cloudFileAccounts.addAccountDialog();
    if (!accountKey)
      return;

    this.rebuildView();
    let newItem = this._list.querySelector("richlistitem[value='" + accountKey + "']");
    this._list.selectItem(newItem);
    this._removeAccountButton.disabled = false;
  },

  removeCloudFileAccount() {
    // Get the selected account key
    let selection = this._list.selectedItem;
    if (!selection)
      return;

    let accountKey = selection.value;
    let accountName = cloudFileAccounts.getDisplayName(accountKey);
    // Does the user really want to remove this account?
    let confirmMessage = this._strings
                             .formatStringFromName("dialog_removeAccount",
                                                   [accountName], 1);

    if (Services.prompt.confirm(null, "", confirmMessage)) {
      this._list.clearSelection();
      cloudFileAccounts.removeAccount(accountKey);
      this.rebuildView();
      this._settingsDeck.selectedPanel = this._defaultPanel;
      delete this._accountCache[accountKey];

      this._removeAccountButton.disabled = (this._list.selectedCount == 0);
    }
  },

  handleEvent(aEvent) {
    if (aEvent.type == "unload")
      this.destroy();
  },

  readThreshold() {
    let pref = document.getElementById("mail.compose.big_attachments.threshold_kb");
    return pref.value / 1024;
  },

  writeThreshold() {
    let threshold = document.getElementById("cloudFileThreshold");
    let intValue = parseInt(threshold.value, 10);
    return isNaN(intValue) ? 0 : intValue * 1024;
  },

  updateThreshold() {
    document.getElementById("cloudFileThreshold").disabled =
    !document.getElementById("enableThreshold").checked;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIObserver",
                                          "nsISupportsWeakReference"]),
};

// -------------------
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

  // Map whose keys are string descriptions and values are references to the
  // first visible HandlerInfoWrapper that has this description. We use this
  // to determine whether or not to annotate descriptions with their types to
  // distinguish duplicate descriptions from each other.
  _visibleDescriptions: new Map(),

  // -----------------------------------
  // Convenience & Performance Shortcuts

  // These get defined by init().
  _brandShortName: null,
  _prefsBundle: null,
  _list: null,
  _filter: null,

  // ----------------------------
  // Initialization & Destruction

  init() {
    // Initialize shortcuts to some commonly accessed elements & values.
    this._brandShortName =
      document.getElementById("bundleBrand").getString("brandShortName");
    this._prefsBundle = document.getElementById("bundlePreferences");
    this._list = document.getElementById("handlersView");
    this._filter = document.getElementById("filter");

    // Figure out how we should be sorting the list.  We persist sort settings
    // across sessions, so we can't assume the default sort column/direction.
    // XXX should we be using the XUL sort service instead?
    this._sortColumn = document.getElementById("typeColumn");
    if (document.getElementById("actionColumn").hasAttribute("sortDirection")) {
      this._sortColumn = document.getElementById("actionColumn");
      // The typeColumn element always has a sortDirection attribute,
      // either because it was persisted or because the default value
      // from the xul file was used.  If we are sorting on the other
      // column, we should remove it.
      document.getElementById("typeColumn").removeAttribute("sortDirection");
    }

    // By doing this in a timeout, we let the preferences dialog resize itself
    // to an appropriate size before we add a bunch of items to the list.
    // Otherwise, if there are many items, and the Applications prefpane
    // is the one that gets displayed when the user first opens the dialog,
    // the dialog might stretch too much in an attempt to fit them all in.
    // XXX Shouldn't we perhaps just set a max-height on the richlistbox?
    var _delayedPaneLoad = function(self) {
      self._initListEventHandlers();
      self._loadData();
      self._rebuildVisibleTypes();
      self._sortVisibleTypes();
      self._rebuildView();

      // Notify observers that the UI is now ready
      Services.obs.notifyObservers(window, "app-handler-pane-loaded");
    };
    setTimeout(_delayedPaneLoad, 0, this);
  },

  // ---------------------------
  // Composed Model Construction

  _loadData() {
    this._loadApplicationHandlers();
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
      if (type in this._handledTypes) {
        handlerInfoWrapper = this._handledTypes[type];
      } else {
        handlerInfoWrapper = new HandlerInfoWrapper(type, wrappedHandlerInfo);
        this._handledTypes[type] = handlerInfoWrapper;
      }
    }
  },

  // -----------------
  // View Construction

  selectedHandlerListItem: null,

  _initListEventHandlers() {
    this._list.addEventListener("select", event => {
      if (event.target != this._list) {
        return;
      }

      let handlerListItem = this._list.selectedItem &&
                            HandlerListItem.forNode(this._list.selectedItem);
      if (this.selectedHandlerListItem == handlerListItem) {
        return;
      }

      if (this.selectedHandlerListItem) {
        this.selectedHandlerListItem.showActionsMenu = false;
      }
      this.selectedHandlerListItem = handlerListItem;
      if (handlerListItem) {
        this.rebuildActionsMenu();
        handlerListItem.showActionsMenu = true;
      }
    });
  },

  _rebuildVisibleTypes() {
    // Reset the list of visible types and the visible type description.
    this._visibleTypes.length = 0;
    this._visibleDescriptions.clear();

    for (let type in this._handledTypes) {
      let handlerInfo = this._handledTypes[type];

      // We couldn't find any reason to exclude the type, so include it.
      this._visibleTypes.push(handlerInfo);

      let otherHandlerInfo = this._visibleDescriptions
                                 .get(handlerInfo.description);
      if (!otherHandlerInfo) {
        // This is the first type with this description that we encountered
        // while rebuilding the _visibleTypes array this time. Make sure the
        // flag is reset so we won't add the type to the description.
        handlerInfo.disambiguateDescription = false;
        this._visibleDescriptions.set(handlerInfo.description, handlerInfo);
      } else {
        // There is at least another type with this description. Make sure we
        // add the type to the description on both HandlerInfoWrapper objects.
        handlerInfo.disambiguateDescription = true;
        otherHandlerInfo.disambiguateDescription = true;
      }
    }
  },

  _rebuildView() {
    let lastSelectedType = this.selectedHandlerListItem &&
                           this.selectedHandlerListItem.handlerInfoWrapper.type;
    this.selectedHandlerListItem = null;

    // Clear the list of entries.
    while (this._list.childNodes.length > 1)
      this._list.lastChild.remove();
    var visibleTypes = this._visibleTypes;

    // If the user is filtering the list, then only show matching types.
    if (this._filter.value)
      visibleTypes = visibleTypes.filter(this._matchesFilter, this);

    for (let visibleType of visibleTypes) {
      let item = new HandlerListItem(visibleType);
      item.connectAndAppendToList(this._list);

      if (visibleType.type === lastSelectedType) {
        this._list.selectedItem = item.node;
      }
    }
  },

  _matchesFilter(aType) {
    var filterValue = this._filter.value.toLowerCase();
    return aType.typeDescription.toLowerCase().includes(filterValue) ||
           aType.actionDescription.toLowerCase().includes(filterValue);
  },

 /**
  * Get the details for the type represented by the given handler info
  * object.
  *
  * @param aHandlerInfo {nsIHandlerInfo} the type to get the extensions for.
  * @return {string} the extensions for the type
  */
  _typeDetails(aHandlerInfo) {
    let exts = [];
    if (aHandlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) {
      let extIter = aHandlerInfo.wrappedHandlerInfo.getFileExtensions();
      while (extIter.hasMore()) {
        let ext = "." + extIter.getNext();
        if (!exts.includes(ext))
          exts.push(ext);
      }
    }
    exts.sort();
    exts = exts.join(", ");
    if (this._visibleDescriptions.has(aHandlerInfo.description)) {
      if (exts)
        return this._prefsBundle.getFormattedString("typeDetailsWithTypeAndExt",
                                                    [aHandlerInfo.type,
                                                     exts]);
      return this._prefsBundle.getFormattedString("typeDetailsWithTypeOrExt",
                                                  [ aHandlerInfo.type]);
    }
    if (exts)
      return this._prefsBundle.getFormattedString("typeDetailsWithTypeOrExt",
                                                  [exts]);
    return exts;
  },

  /**
   * Whether or not the given handler app is valid.
   * @param aHandlerApp {nsIHandlerApp} the handler app in question
   * @return {boolean} whether or not it's valid
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

    return false;
  },

  _isValidHandlerExecutable(aExecutable) {
    let isExecutable = aExecutable &&
                       aExecutable.exists() &&
                       aExecutable.isExecutable();
// XXXben - we need to compare this with the running instance executable
//          just don't know how to do that via script...
// XXXmano TBD: can probably add this to nsIShellService
    if (AppConstants.platform == "win")
      return isExecutable && (aExecutable.leafName != (AppConstants.MOZ_APP_NAME + ".exe"));

    if (AppConstants.platform == "macosx")
      return isExecutable && (aExecutable.leafName != AppConstants.MOZ_MACBUNDLE_NAME);

    return isExecutable && (aExecutable.leafName != (AppConstants.MOZ_APP_NAME + "-bin"));
  },

  /**
   * Rebuild the actions menu for the selected entry.  Gets called by
   * the richlistitem constructor when an entry in the list gets selected.
   */
  rebuildActionsMenu() {
    var typeItem = this._list.selectedItem;

    if (!typeItem)
      return;

    var handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;
    var menu = typeItem.querySelector(".actionsMenu");
    var menuPopup = menu.menupopup;

    // Clear out existing items.
    while (menuPopup.hasChildNodes())
      menuPopup.lastChild.remove();

    var askMenuItem = document.createElement("menuitem");
    askMenuItem.setAttribute("alwaysAsk", "true");
    {
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
      defaultMenuItem.setAttribute("image", handlerInfo.iconURLForSystemDefault);

      menuPopup.appendChild(defaultMenuItem);
    }

    // Create menu items for possible handlers.
    let preferredApp = handlerInfo.preferredApplicationHandler;
    let possibleApps = handlerInfo.possibleApplicationHandlers.enumerate();
    var possibleAppMenuItems = [];
    while (possibleApps.hasMoreElements()) {
      let possibleApp = possibleApps.getNext();
      if (!gApplicationsPane.isValidHandlerApp(possibleApp))
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
      menuItem.setAttribute("image", gApplicationsPane
                            ._getIconURLForHandlerApp(possibleApp));

      // Attach the handler app object to the menu item so we can use it
      // to make changes to the datastore when the user selects the item.
      menuItem.handlerApp = possibleApp;

      menuPopup.appendChild(menuItem);
      possibleAppMenuItems.push(menuItem);
    }

    // Create a menu item for selecting a local application.
    let createItem = true;
    if (AppConstants.platform == "win") {
      // On Windows, selecting an application to open another application
      // would be meaningless so we special case executables.
      var executableType = Cc["@mozilla.org/mime;1"]
                             .getService(Ci.nsIMIMEService)
                             .getTypeFromExtension("exe");
      if (handlerInfo.type == executableType)
        createItem = false;
    }

    if (createItem) {
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

    menuItem = document.createElement("menuseparator");
    menuPopup.appendChild(menuItem);
    menuItem = document.createElement("menuitem");
    menuItem.setAttribute("oncommand", "gApplicationsPane.confirmDelete(event)");
    menuItem.setAttribute("label", this._prefsBundle.getString("delete"));
    menuPopup.appendChild(menuItem);

    // Select the item corresponding to the preferred action.  If the always
    // ask flag is set, it overrides the preferred action.  Otherwise we pick
    // the item identified by the preferred action (when the preferred action
    // is to use a helper app, we have to pick the specific helper app item).
    if (handlerInfo.alwaysAskBeforeHandling) {
      menu.selectedItem = askMenuItem;
    } else {
      switch (handlerInfo.preferredAction) {
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
    }
    // menu.selectedItem may be null if the preferredAction is
    // useSystemDefault, but handlerInfo.hasDefaultHandler returns false.
    // For now, we'll just use the askMenuItem to avoid ugly exceptions.
    menu.previousSelectedItem = menu.selectedItem || askMenuItem;
  },

  // -------------------
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

    function sortByType(a, b) {
      return a.typeDescription.toLowerCase()
              .localeCompare(b.typeDescription.toLowerCase());
    }

    function sortByAction(a, b) {
      return a.actionDescription.toLowerCase()
              .localeCompare(b.actionDescription.toLowerCase());
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

  focusFilterBox() {
    this._filter.focus();
    this._filter.select();
  },

  // -------
  // Changes

  // Whether or not we are currently storing the action selected by the user.
  // We use this to suppress notification-triggered updates to the list when
  // we make changes that may spawn such updates, specifically when we change
  // the action for the feed type, which results in feed preference updates,
  // which spawn "pref changed" notifications that would otherwise cause us
  // to rebuild the view unnecessarily.
  _storingAction: false,

  onSelectAction(aActionItem) {
    this._storingAction = true;

    let typeItem = this._list.selectedItem;
    let menu = typeItem.querySelector(".actionsMenu");
    menu.previousSelectedItem = aActionItem;
    try {
      this._storeAction(aActionItem);
    } finally {
      this._storingAction = false;
    }
  },

  _storeAction(aActionItem) {
    var handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;

    if (aActionItem.hasAttribute("alwaysAsk")) {
      handlerInfo.alwaysAskBeforeHandling = true;
    } else if (aActionItem.hasAttribute("action")) {
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

    // Update the action label and image to reflect the new preferred action.
    this.selectedHandlerListItem.refreshAction();
  },

  manageApp(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;

    let closingCallback = () => {
      // Rebuild the actions menu so that we revert to the previous selection,
      // or "Always ask" if the previous default application has been removed.
      this.rebuildActionsMenu();

      // Update the richlistitem too. Will be visible when selecting another row.
      this.selectedHandlerListItem.refreshAction();
    };

    gSubDialog.open(
      "chrome://messenger/content/preferences/applicationManager.xul",
      "resizable=no", handlerInfo, closingCallback);
  },

  chooseApp(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerApp;
    let onSelectionDone = function() {
      // Rebuild the actions menu whether the user picked an app or canceled.
      // If they picked an app, we want to add the app to the menu and select it.
      // If they canceled, we want to go back to their previous selection.
      this.rebuildActionsMenu();

      // If the user picked a new app from the menu, select it.
      if (handlerApp) {
        let typeItem = this._list.selectedItem;
        let actionsMenu = typeItem.querySelector(".actionsMenu");
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
    }.bind(this);

    if (AppConstants.platform == "win") {
      let params = {};
      let handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;

      params.mimeInfo = handlerInfo.wrappedHandlerInfo;

      params.title         = this._prefsBundle.getString("fpTitleChooseApp");
      params.description   = handlerInfo.description;
      params.filename      = null;
      params.handlerApp    = null;

      function closingCallback() {
        if (params.handlerApp &&
            params.handlerApp.executable &&
            params.handlerApp.executable.isFile()) {
          handlerApp = params.handlerApp;

          // Add the app to the type's list of possible handlers.
          handlerInfo.addPossibleApplicationHandler(handlerApp);
        }
        onSelectionDone();
      }

      gSubDialog.open("chrome://global/content/appPicker.xul",
                      "resizable=no", params, closingCallback);
    } else {
      const nsIFilePicker = Ci.nsIFilePicker;
      let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
      let winTitle = this._prefsBundle.getString("fpTitleChooseApp");
      fp.init(window, winTitle, nsIFilePicker.modeOpen);
      fp.appendFilters(nsIFilePicker.filterApps);

      // Prompt the user to pick an app.  If they pick one, and it's a valid
      // selection, then add it to the list of possible handlers.

      fp.open(rv => {
        if (rv == nsIFilePicker.returnOK && fp.file &&
            this._isValidHandlerExecutable(fp.file)) {
          handlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"]
                         .createInstance(Ci.nsILocalHandlerApp);
          handlerApp.name = getDisplayNameForFile(fp.file);
          handlerApp.executable = fp.file;

          // Add the app to the type's list of possible handlers.
          let handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;
          handlerInfo.addPossibleApplicationHandler(handlerApp);
        }
        onSelectionDone();
      });
    }
  },

  confirmDelete(aEvent) {
    aEvent.stopPropagation();
    if (Services.prompt.confirm(null,
                                this._prefsBundle.getString("confirmDeleteTitle"),
                                this._prefsBundle.getString("confirmDeleteText"))) {
      this.onDelete(aEvent);
    } else {
      // They hit cancel, so return them to the previously selected item.
      let typeItem = this._list.selectedItem;
      let menu = typeItem.querySelector(".actionsMenu");
      menu.selectedItem = menu.previousSelectedItem;
    }
  },

  onDelete(aEvent) {
    // We want to delete if either the request came from the confirmDelete
    // method (which is the only thing that populates the aEvent parameter),
    // or we've hit the delete/backspace key while the list has focus.
    if ((aEvent || document.commandDispatcher.focusedElement == this._list) &&
        this._list.selectedIndex != -1) {
      let typeItem = this._list.getItemAtIndex(this._list.selectedIndex);
      let handlerInfo = this._handledTypes[typeItem.type];
      let index = this._visibleTypes.indexOf(handlerInfo);
      if (index != -1)
        this._visibleTypes.splice(index, 1);
      handlerInfo.remove();
      delete this._handledTypes[typeItem.type];
      typeItem.remove();
    }
  },

  _getIconURLForHandlerApp(aHandlerApp) {
    if (aHandlerApp instanceof Ci.nsILocalHandlerApp)
      return this._getIconURLForFile(aHandlerApp.executable);

    if (aHandlerApp instanceof Ci.nsIWebHandlerApp)
      return this._getIconURLForWebApp(aHandlerApp.uriTemplate);

    if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo)
      return this._getIconURLForWebApp(aHandlerApp.uri);

    // We know nothing about other kinds of handler apps.
    return "";
  },

  _getIconURLForFile(aFile) {
    let urlSpec = Services.io.getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler)
      .getURLSpecFromFile(aFile);

    return "moz-icon://" + urlSpec + "?size=16";
  },

  _getIconURLForWebApp(aWebAppURITemplate) {
    var uri = Services.io.newURI(aWebAppURITemplate);

    // Unfortunately we can't use the favicon service to get the favicon,
    // because the service looks in the annotations table for a record with
    // the exact URL we give it, and users won't have such records for URLs
    // they don't visit, and users won't visit the web app's URL template,
    // they'll only visit URLs derived from that template (i.e. with %s
    // in the template replaced by the URL of the content being handled).

    if (/^https?/.test(uri.scheme))
      return uri.prePath + "/favicon.ico";

    return /^https?/.test(uri.scheme) ? uri.resolve("/favicon.ico") : "";
  },
};

/**
 * InternalHandlerInfoWrapper provides a basic mechanism to create an internal
 * mime type handler that can be enabled/disabled in the applications preference
 * menu.
 */
class InternalHandlerInfoWrapper extends HandlerInfoWrapper {
  constructor(mimeType) {
    super(mimeType, gMIMEService.getFromTypeAndExtension(mimeType, null));
  }

  // Override store so we so we can notify any code listening for registration
  // or unregistration of this handler.
  store() {
    super.store();
    Services.obs.notifyObservers(null, this._handlerChanged);
  }

  get enabled() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  }

  get description() {
    return gApplicationsPane._prefsBundle.getString(this._appPrefLabel);
  }
}
