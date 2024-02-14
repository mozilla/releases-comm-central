/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from ../../components/addrbook/content/addressBookTab.js */
/* import-globals-from ../../components/customizableui/content/panelUI.js */
/* import-globals-from ../../components/newmailaccount/content/provisionerCheckout.js */
/* import-globals-from ../../components/preferences/preferencesTab.js */
/* import-globals-from glodaFacetTab.js */
/* import-globals-from mailCore.js */
/* import-globals-from mail-offline.js */
/* import-globals-from mailTabs.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messenger-customization.js */
/* import-globals-from searchBar.js */
/* import-globals-from spacesToolbar.js */
/* import-globals-from specialTabs.js */
/* import-globals-from toolbarIconColor.js */

/* globals CreateMailWindowGlobals, InitMsgWindow, OnMailWindowUnload */ // From mailWindow.js

/* globals loadCalendarComponent */

ChromeUtils.import("resource:///modules/activity/activityModules.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  Color: "resource://gre/modules/Color.sys.mjs",
  MailConsts: "resource:///modules/MailConsts.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  msgDBCacheManager: "resource:///modules/MsgDBCacheManager.jsm",
  PeriodicFilterManager: "resource:///modules/PeriodicFilterManager.jsm",
  SessionStoreManager: "resource:///modules/SessionStoreManager.jsm",
});

ChromeUtils.defineLazyGetter(this, "PopupNotifications", function () {
  const { PopupNotifications } = ChromeUtils.import(
    "resource:///modules/GlobalPopupNotifications.jsm"
  );
  try {
    // Hide all notifications while the URL is being edited and the address bar
    // has focus, including the virtual focus in the results popup.
    // We also have to hide notifications explicitly when the window is
    // minimized because of the effects of the "noautohide" attribute on Linux.
    // This can be removed once bug 545265 and bug 1320361 are fixed.
    const shouldSuppress = () => window.windowState == window.STATE_MINIMIZED;
    return new PopupNotifications(
      document.getElementById("tabmail"),
      document.getElementById("notification-popup"),
      document.getElementById("notification-popup-box"),
      { shouldSuppress }
    );
  } catch (ex) {
    console.error(ex);
    return null;
  }
});

/* This is where functions related to the 3 pane window are kept */

// from MailNewsTypes.h
var kMailCheckOncePrefName = "mail.startup.enabledMailCheckOnce";

/**
 * Tracks whether the right mouse button changed the selection or not.  If the
 * user right clicks on the selection, it stays the same.  If they click outside
 * of it, we alter the selection (but not the current index) to be the row they
 * clicked on.
 *
 * The value of this variable is an object with "view" and "selection" keys
 * and values.  The view value is the view whose selection we saved off, and
 * the selection value is the selection object we saved off.
 */
var gRightMouseButtonSavedSelection = null;
var gNewAccountToLoad = null;

// The object in charge of managing the mail summary pane
var gSummaryFrameManager;

/**
 * Called on startup if there are no accounts.
 */
function verifyOpenAccountHubTab() {
  const suppressDialogs = Services.prefs.getBoolPref(
    "mail.provider.suppress_dialog_on_startup",
    false
  );

  if (suppressDialogs) {
    // Looks like we were in the middle of filling out an account form. We
    // won't display the dialogs in that case.
    Services.prefs.clearUserPref("mail.provider.suppress_dialog_on_startup");
    loadPostAccountWizard();
    return;
  }

  openAccountSetupTab();
}

let _resolveDelayedStartup;
var delayedStartupPromise = new Promise(resolve => {
  _resolveDelayedStartup = resolve;
});

var gMailInit = {
  onBeforeInitialXULLayout() {
    // Set a sane starting width/height for all resolutions on new profiles.
    // Do this before the window loads.
    if (!document.documentElement.hasAttribute("width")) {
      const TARGET_WIDTH = 1280;
      const defaultWidth = Math.min(screen.availWidth * 0.9, TARGET_WIDTH);
      const defaultHeight = screen.availHeight;

      document.documentElement.setAttribute("width", defaultWidth);
      document.documentElement.setAttribute("height", defaultHeight);

      // On small screens, default to maximized state.
      if (defaultWidth < TARGET_WIDTH) {
        document.documentElement.setAttribute("sizemode", "maximized");
      }
      // Make sure we're safe at the left/top edge of screen
      document.documentElement.setAttribute("screenX", screen.availLeft);
      document.documentElement.setAttribute("screenY", screen.availTop);
    }

    // Run menubar initialization first, to avoid TabsInTitlebar code picking
    // up mutations from it and causing a reflow.
    AutoHideMenubar.init();
    TabsInTitlebar.init();

    // Call this after we set attributes that might change toolbars' computed
    // text color.
    ToolbarIconColor.init();
  },

  /**
   * Called on startup to initialize various parts of the main window.
   * Most of this should be moved out into _delayedStartup or only
   * initialized when needed.
   */
  onLoad() {
    CreateMailWindowGlobals();

    if (!Services.policies.isAllowed("devtools")) {
      const devtoolsMenu = document.getElementById("devtoolsMenu");
      if (devtoolsMenu) {
        devtoolsMenu.hidden = true;
      }
    }

    // - initialize tabmail system
    // Do this before loadPostAccountWizard since that code selects the first
    //  folder for display, and we want gFolderDisplay setup and ready to handle
    //  that event chain.
    // Also, we definitely need to register the tab type prior to the call to
    //  specialTabs.openSpecialTabsOnStartup below.
    const tabmail = document.getElementById("tabmail");
    if (tabmail) {
      // mailTabType is defined in mailTabs.js
      tabmail.registerTabType(mailTabType);
      // glodaFacetTab* in glodaFacetTab.js
      tabmail.registerTabType(glodaFacetTabType);
      tabmail.registerTabMonitor(GlodaSearchBoxTabMonitor);
      tabmail.openFirstTab();
    }

    // This also registers the contentTabType ("contentTab")
    specialTabs.openSpecialTabsOnStartup();
    tabmail.registerTabType(addressBookTabType);
    tabmail.registerTabType(preferencesTabType);
    // provisionerCheckoutTabType is defined in provisionerCheckout.js
    tabmail.registerTabType(provisionerCheckoutTabType);

    // Depending on the pref, hide/show the gloda toolbar search widgets.
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "gGlodaEnabled",
      "mailnews.database.global.indexer.enabled",
      true,
      (pref, oldVal, newVal) => {
        for (const widget of document.querySelectorAll(
          ".gloda-search-widget"
        )) {
          widget.hidden = !newVal;
        }
      }
    );
    for (const widget of document.querySelectorAll(".gloda-search-widget")) {
      widget.hidden = !this.gGlodaEnabled;
    }

    window.addEventListener("AppCommand", HandleAppCommandEvent, true);

    this._boundDelayedStartup = this._delayedStartup.bind(this);
    window.addEventListener("MozAfterPaint", this._boundDelayedStartup);

    // Listen for the messages sent to the main 3 pane window.
    window.addEventListener("message", this._onMessageReceived);
  },

  _cancelDelayedStartup() {
    window.removeEventListener("MozAfterPaint", this._boundDelayedStartup);
    this._boundDelayedStartup = null;
  },

  /**
   * Handle the messages sent via postMessage() method to the main 3 pane
   * window.
   *
   * @param {Event} event - The message event.
   */
  _onMessageReceived(event) {
    switch (event.data) {
      case "account-created":
      case "account-created-in-backend":
      case "account-created-from-provisioner":
        // Set the pref to false in case it was previously changed.
        Services.prefs.setBoolPref("app.use_without_mail_account", false);
        loadPostAccountWizard();

        // Always update the mail UI to guarantee all the panes are visible even
        // if the mail tab is not the currently active tab.
        updateMailPaneUI();
        break;

      case "account-setup-closed":
        // The user closed the account setup after a successful run. Make sure
        // to focus on the primary mail tab.
        switchToMailTab();
        gSpacesToolbar.onLoad();
        // Trigger the integration dialog if necessary.
        showSystemIntegrationDialog();
        break;

      case "account-setup-dismissed":
        // The user closed the account setup before completing it. Be sure to
        // initialize the few important areas we need.
        if (!gSpacesToolbar.isLoaded) {
          loadPostAccountWizard();
        }
        break;

      case "open-account-setup-tab":
        openAccountSetupTab();
        break;
      default:
        break;
    }
  },

  /**
   * Delayed startup happens after the first paint of the window. Anything
   * that can be delayed until after paint, should be to help give the
   * illusion that Thunderbird is starting faster.
   *
   * Note: this only runs for the main 3 pane window.
   */
  _delayedStartup() {
    this._cancelDelayedStartup();

    MailOfflineMgr.init();

    BondOpenPGP.init();

    PanelUI.init();
    gExtensionsNotifications.init();

    Services.search.init();

    PeriodicFilterManager.setupFiltering();
    msgDBCacheManager.init();

    this.delayedStartupFinished = true;
    _resolveDelayedStartup(window);
    Services.obs.notifyObservers(window, "browser-delayed-startup-finished");

    // Notify observer to resolve the browserStartupPromise, which is used for the
    // delayed background startup of WebExtensions.
    Services.obs.notifyObservers(window, "extensions-late-startup");

    this._loadComponentsAtStartup();
  },

  /**
   * Load all the necessary components to make Thunderbird usable before
   * checking for existing accounts.
   */
  async _loadComponentsAtStartup() {
    updateTroubleshootMenuItem();
    // The calendar component needs to be loaded before restoring any tabs.
    await loadCalendarComponent();

    // Don't trigger the existing account verification if the user wants to use
    // Thunderbird without an email account.
    if (!Services.prefs.getBoolPref("app.use_without_mail_account", false)) {
      // Load the Mail UI only if we already have at least one account configured
      // otherwise the verifyExistingAccounts will trigger the account wizard.
      if (verifyExistingAccounts()) {
        switchToMailTab();
        await loadPostAccountWizard();
      }
    } else {
      // Run the tabs restore method here since we're skipping the loading of
      // the Mail UI which would have taken care of this to properly handle
      // opened folders or messages in tabs.
      await atStartupRestoreTabs(false);
      gSpacesToolbar.onLoad();
    }

    // Show the end of year donation appeal page.
    if (this.shouldShowEOYDonationAppeal()) {
      // Add a timeout to prevent opening the browser immediately at startup.
      setTimeout(this.showEOYDonationAppeal, 2000);
    }
  },

  /**
   * Called by messenger.xhtml:onunload, the 3-pane window inside of tabs window.
   *  It's being unloaded!  Right now!
   */
  onUnload() {
    Services.obs.notifyObservers(window, "mail-unloading-messenger");

    if (gRightMouseButtonSavedSelection) {
      // Avoid possible cycle leaks.
      gRightMouseButtonSavedSelection.view = null;
      gRightMouseButtonSavedSelection = null;
    }

    SessionStoreManager.unloadingWindow(window);
    TabsInTitlebar.uninit();
    ToolbarIconColor.uninit();
    gSpacesToolbar.onUnload();

    document.getElementById("tabmail")._teardown();

    OnMailWindowUnload();
  },

  /**
   * Check if we can trigger the opening of the donation appeal page.
   *
   * @returns {boolean} - True if the donation appeal page should be opened.
   */
  shouldShowEOYDonationAppeal() {
    const currentEOY = Services.prefs.getIntPref("app.donation.eoy.version", 1);
    const viewedEOY = Services.prefs.getIntPref(
      "app.donation.eoy.version.viewed",
      0
    );

    // True if the user never saw the donation appeal, this is not a new
    // profile (since users are already prompted to donate after downloading),
    // and we're not running tests.
    return (
      viewedEOY < currentEOY &&
      !specialTabs.shouldShowPolicyNotification() &&
      !Cu.isInAutomation
    );
  },

  /**
   * Open the end of year appeal in a new web browser page. We don't open this
   * in a tab due to the complexity of the donation site, and we don't want to
   * handle that inside Thunderbird.
   */
  showEOYDonationAppeal() {
    const url = Services.prefs.getStringPref("app.donation.eoy.url");
    const protocolSvc = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService);
    protocolSvc.loadURI(Services.io.newURI(url));

    const currentEOY = Services.prefs.getIntPref("app.donation.eoy.version", 1);
    Services.prefs.setIntPref("app.donation.eoy.version.viewed", currentEOY);
  },
};

/**
 * Called at startup to verify if we have ny existing account, even if invalid,
 * and if not, it will trigger the Account Hub in a tab.
 *
 * @returns {boolean} - True if we have at least one existing account.
 */
function verifyExistingAccounts() {
  try {
    // Migrate quoting preferences from global to per account. This function
    // returns true if it had to migrate, which we will use to mean this is a
    // just migrated or new profile.
    let newProfile = migrateGlobalQuotingPrefs(
      MailServices.accounts.allIdentities
    );

    // If there are no accounts, or all accounts are "invalid" then kick off the
    // account migration. Or if this is a new (to Mozilla) profile. MCD can set
    // up accounts without the profile being used yet.
    if (newProfile) {
      // Check if MCD is configured. If not, say this is not a new profile so
      // that we don't accidentally remigrate non MCD profiles.
      var adminUrl = Services.prefs.getCharPref(
        "autoadmin.global_config_url",
        ""
      );
      if (!adminUrl) {
        newProfile = false;
      }
    }

    const accounts = MailServices.accounts.accounts;
    const invalidAccounts = getInvalidAccounts(accounts);
    // Trigger the new account configuration wizard only if we don't have any
    // existing account, not even if we have at least one invalid account.
    if (
      (newProfile && !accounts.length) ||
      accounts.length == invalidAccounts.length ||
      (invalidAccounts.length > 0 &&
        invalidAccounts.length == accounts.length &&
        invalidAccounts[0])
    ) {
      verifyOpenAccountHubTab();
      return false;
    }

    let localFoldersExists;
    try {
      localFoldersExists = MailServices.accounts.localFoldersServer;
    } catch (ex) {
      localFoldersExists = false;
    }

    // We didn't trigger the account configuration wizard, so we need to verify
    // that local folders exists.
    if (!localFoldersExists && requireLocalFoldersAccount()) {
      MailServices.accounts.createLocalMailAccount();
    }

    return true;
  } catch (ex) {
    dump(`Error verifying accounts: ${ex}`);
    return false;
  }
}

/**
 * Switch the view to the first Mail tab if the currently selected tab is not
 * the first Mail tab.
 */
function switchToMailTab() {
  const tabmail = document.getElementById("tabmail");
  if (tabmail?.selectedTab.mode.name != "folder") {
    tabmail.switchToTab(0);
  }
}

/**
 * Trigger the initialization of the entire UI. Called after the okCallback of
 * the emailWizard during a first run, or directly from the accountProvisioner
 * in case a user configures a new email account on first run.
 */
async function loadPostAccountWizard() {
  InitMsgWindow();

  MailServices.accounts.setSpecialFolders();

  try {
    MailServices.accounts.loadVirtualFolders();
  } catch (e) {
    console.error(e);
  }

  // Init the mozINewMailListener service (MailNotificationManager) before
  // any new mails are fetched.
  // MailNotificationManager triggers mozINewMailNotificationService
  // init as well.
  Cc["@mozilla.org/mail/notification-manager;1"].getService(
    Ci.mozINewMailListener
  );

  // Restore the previous folder selection before shutdown, or select the first
  // inbox folder of a newly created account.
  await selectFirstFolder();

  gSpacesToolbar.onLoad();
}

/**
 * Check if we need to show the system integration dialog before notifying the
 * application that the startup process is completed.
 */
function showSystemIntegrationDialog() {
  // Check the shell service.
  let shellService;
  try {
    shellService = Cc["@mozilla.org/mail/shell-service;1"].getService(
      Ci.nsIShellService
    );
  } catch (ex) {}
  const defaultAccount = MailServices.accounts.defaultAccount;

  // Load the search integration module.
  const { SearchIntegration } = ChromeUtils.import(
    "resource:///modules/SearchIntegration.jsm"
  );

  // Show the default client dialog only if
  // EITHER: we have at least one account, and we aren't already the default
  // for mail,
  // OR: we have the search integration module, the OS version is suitable,
  // and the first run hasn't already been completed.
  // Needs to be shown outside the he normal load sequence so it doesn't appear
  // before any other displays, in the wrong place of the screen.
  if (
    (shellService &&
      defaultAccount &&
      shellService.shouldCheckDefaultClient &&
      !shellService.isDefaultClient(true, Ci.nsIShellService.MAIL)) ||
    (SearchIntegration &&
      !SearchIntegration.osVersionTooLow &&
      !SearchIntegration.osComponentsNotRunning &&
      !SearchIntegration.firstRunDone)
  ) {
    window.openDialog(
      "chrome://messenger/content/systemIntegrationDialog.xhtml",
      "SystemIntegration",
      "modal,centerscreen,chrome,resizable=no"
    );
    // On Windows, there seems to be a delay between setting TB as the
    // default client, and the isDefaultClient check succeeding.
    if (shellService.isDefaultClient(true, Ci.nsIShellService.MAIL)) {
      Services.obs.notifyObservers(window, "mail:setAsDefault");
    }
  }
}

/**
 * Properly select the starting folder or message header if we have one.
 */
async function selectFirstFolder() {
  let startFolderURI = null;
  let startMsgHdr = null;

  if ("arguments" in window && window.arguments.length > 0) {
    let arg0 = window.arguments[0];
    // If the argument is a string, it is folder URI.
    if (typeof arg0 == "string") {
      startFolderURI = arg0;
    } else if (arg0) {
      // arg0 is an object
      if ("wrappedJSObject" in arg0 && arg0.wrappedJSObject) {
        arg0 = arg0.wrappedJSObject;
      }
      startMsgHdr = "msgHdr" in arg0 ? arg0.msgHdr : null;
    }
  }

  // Don't try to be smart with this because we need the loadStartFolder()
  // method to run even if startFolderURI is null otherwise our UI won't
  // properly restore.
  if (startMsgHdr) {
    await loadStartMsgHdr(startMsgHdr);
  } else {
    await loadStartFolder(startFolderURI);
  }
}

function HandleAppCommandEvent(evt) {
  evt.stopPropagation();
  switch (evt.command) {
    case "Back":
      goDoCommand("cmd_goBack");
      break;
    case "Forward":
      goDoCommand("cmd_goForward");
      break;
    case "Stop":
      msgWindow.StopUrls();
      break;
    case "Bookmarks":
      toAddressBook();
      break;
    case "Home":
    case "Reload":
    default:
      break;
  }
}

/**
 * Called by the session store manager periodically and at shutdown to get
 * the state of this window for persistence.
 */
function getWindowStateForSessionPersistence() {
  const tabmail = document.getElementById("tabmail");
  const tabsState = tabmail.persistTabs();
  return { type: "3pane", tabs: tabsState };
}

/**
 * Attempt to restore the previous tab states.
 *
 * @param {boolean} aDontRestoreFirstTab - If this is true, the first tab will
 *   not be restored, and will continue to retain focus at the end. This is
 *   needed if the window was opened with a folder or a message as an argument.
 * @returns true if the restoration was successful, false otherwise.
 */
async function atStartupRestoreTabs(aDontRestoreFirstTab) {
  const state = await SessionStoreManager.loadingWindow(window);
  if (state) {
    const tabsState = state.tabs;
    const tabmail = document.getElementById("tabmail");
    try {
      tabmail.restoreTabs(tabsState, aDontRestoreFirstTab);
    } catch (e) {
      console.error(e);
    }
  }

  // It's now safe to load extra Tabs.
  loadExtraTabs();

  // Note: The tabs have not finished loading at this point.
  SessionStoreManager._restored = true;
  Services.obs.notifyObservers(window, "mail-tabs-session-restored");

  return !!state;
}

/**
 * Loads and restores tabs upon opening a window by evaluating window.arguments[1].
 *
 * The type of the object is specified by it's action property. It can be
 * either "restore" or "open". "restore" invokes tabmail.restoreTab() for each
 * item in the tabs array. While "open" invokes tabmail.openTab() for each item.
 *
 * In case a tab can't be restored it will fail silently
 *
 * the object need at least the following properties:
 *
 * {
 *   action = "restore" | "open"
 *   tabs = [];
 * }
 *
 */
function loadExtraTabs() {
  if (!("arguments" in window) || window.arguments.length < 2) {
    return;
  }

  let tab = window.arguments[1];
  if (!tab || typeof tab != "object") {
    return;
  }

  if ("wrappedJSObject" in tab) {
    tab = tab.wrappedJSObject;
  }

  const tabmail = document.getElementById("tabmail");

  // we got no action, so suppose its "legacy" code
  if (!("action" in tab)) {
    if ("tabType" in tab) {
      tabmail.openTab(tab.tabType, tab.tabParams);
    }
    return;
  }

  if (!("tabs" in tab)) {
    return;
  }

  // this is used if a tab is detached to a new window.
  if (tab.action == "restore") {
    for (let i = 0; i < tab.tabs.length; i++) {
      tabmail.restoreTab(tab.tabs[i]);
    }

    // we currently do not support opening in background or opening a
    // special position. So select the last tab opened.
    tabmail.switchToTab(tabmail.tabInfo[tabmail.tabInfo.length - 1]);
    return;
  }

  if (tab.action == "open") {
    for (let i = 0; i < tab.tabs.length; i++) {
      if ("tabType" in tab.tabs[i]) {
        tabmail.openTab(tab.tabs[i].tabType, tab.tabs[i].tabParams);
      }
    }
  }
}

/**
 * Loads the given message header at window open. Exactly one out of this and
 * |loadStartFolder| should be called.
 *
 * @param aStartMsgHdr The message header to load at window open
 */
async function loadStartMsgHdr(aStartMsgHdr) {
  const mailStartupObserver = {
    observe() {
      MsgDisplayMessageInFolderTab(aStartMsgHdr);
      Services.obs.removeObserver(this, "mail-startup-done");
    },
  };
  Services.obs.addObserver(mailStartupObserver, "mail-startup-done");
  // We'll just clobber the default tab
  await atStartupRestoreTabs(true);
}

async function loadStartFolder(initialUri) {
  var defaultServer = null;
  var startFolder;
  var isLoginAtStartUpEnabled = false;

  // If a URI was explicitly specified, we'll just clobber the default tab
  let loadFolder = !(await atStartupRestoreTabs(!!initialUri));

  if (initialUri) {
    loadFolder = true;
  }

  // First get default account
  try {
    if (initialUri) {
      startFolder = MailUtils.getOrCreateFolder(initialUri);
    } else {
      const defaultAccount = MailServices.accounts.defaultAccount;
      if (!defaultAccount) {
        return;
      }

      defaultServer = defaultAccount.incomingServer;
      var rootMsgFolder = defaultServer.rootMsgFolder;

      startFolder = rootMsgFolder;

      // Enable check new mail once by turning checkmail pref 'on' to bring
      // all users to one plane. This allows all users to go to Inbox. User can
      // always go to server settings panel and turn off "Check for new mail at startup"
      if (!Services.prefs.getBoolPref(kMailCheckOncePrefName)) {
        Services.prefs.setBoolPref(kMailCheckOncePrefName, true);
        defaultServer.loginAtStartUp = true;
      }

      // Get the user pref to see if the login at startup is enabled for default account
      isLoginAtStartUpEnabled = defaultServer.loginAtStartUp;

      // Get Inbox only if login at startup is enabled.
      if (isLoginAtStartUpEnabled) {
        // now find Inbox
        var inboxFolder = rootMsgFolder.getFolderWithFlags(
          Ci.nsMsgFolderFlags.Inbox
        );
        if (!inboxFolder) {
          return;
        }

        startFolder = inboxFolder;
      }
    }

    // it is possible we were given an initial uri and we need to subscribe or try to add
    // the folder. i.e. the user just clicked on a news folder they aren't subscribed to from a browser
    // the news url comes in here.

    // Perform biff on the server to check for new mail, except for imap
    // or a pop3 account that is deferred or deferred to,
    // or the case where initialUri is non-null (non-startup)
    if (
      !initialUri &&
      isLoginAtStartUpEnabled &&
      !defaultServer.isDeferredTo &&
      defaultServer.rootFolder == defaultServer.rootMsgFolder
    ) {
      defaultServer.performBiff(msgWindow);
    }
    if (loadFolder) {
      const tab = document.getElementById("tabmail")?.tabInfo[0];
      tab.chromeBrowser.addEventListener(
        "load",
        () => (tab.folder = startFolder),
        true
      );
    }
  } catch (ex) {
    console.error(ex);
  }

  MsgGetMessagesForAllServers(defaultServer);

  if (MailOfflineMgr.isOnline()) {
    // Check if we shut down offline, and restarted online, in which case
    // we may have offline events to playback. Since this is not a pref
    // the user should set, it's not in mailnews.js, so we need a try catch.
    const playbackOfflineEvents = Services.prefs.getBoolPref(
      "mailnews.playback_offline",
      false
    );
    if (playbackOfflineEvents) {
      Services.prefs.setBoolPref("mailnews.playback_offline", false);
      MailOfflineMgr.offlineManager.goOnline(false, true, msgWindow);
    }

    // If appropriate, send unsent messages. This may end up prompting the user,
    // so we need to get it out of the flow of the normal load sequence.
    setTimeout(function () {
      if (MailOfflineMgr.shouldSendUnsentMessages()) {
        SendUnsentMessages();
      }
    }, 0);
  }
}

function OpenMessageInNewTab(msgHdr, tabParams = {}) {
  if (!msgHdr) {
    return null;
  }

  if (tabParams.background === undefined) {
    tabParams.background = Services.prefs.getBoolPref(
      "mail.tabs.loadInBackground"
    );
    if (tabParams.event?.shiftKey) {
      tabParams.background = !tabParams.background;
    }
  }

  const tabmail = document.getElementById("tabmail");
  return tabmail.openTab("mailMessageTab", {
    ...tabParams,
    messageURI: msgHdr.folder.getUriForMsg(msgHdr),
  });
}

function GetSelectedMsgFolders() {
  const tabInfo = document.getElementById("tabmail")?.currentTabInfo;
  if (tabInfo?.mode.name == "mail3PaneTab") {
    const folder = tabInfo.folder;
    if (folder) {
      return [folder];
    }
  }
  return [];
}

function SelectFolder(folderUri) {
  // TODO: Replace this.
}

function ReloadMessage() {}

function messageFlavorDataProvider() {}

messageFlavorDataProvider.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

  getFlavorData(aTransferable, aFlavor, aData) {
    if (aFlavor !== "application/x-moz-file-promise") {
      return;
    }
    const fileUriPrimitive = {};
    aTransferable.getTransferData(
      "application/x-moz-file-promise-url",
      fileUriPrimitive
    );

    const fileUriStr = fileUriPrimitive.value.QueryInterface(
      Ci.nsISupportsString
    );
    const fileUri = Services.io.newURI(fileUriStr.data);
    const fileUrl = fileUri.QueryInterface(Ci.nsIURL);
    const fileName = fileUrl.fileName.replace(/(.{74}).*(.{10})$/u, "$1...$2");

    const destDirPrimitive = {};
    aTransferable.getTransferData(
      "application/x-moz-file-promise-dir",
      destDirPrimitive
    );
    const destDirectory = destDirPrimitive.value.QueryInterface(Ci.nsIFile);
    const file = destDirectory.clone();
    file.append(fileName);

    const messageUriPrimitive = {};
    aTransferable.getTransferData("text/x-moz-message", messageUriPrimitive);
    const messageUri = messageUriPrimitive.value.QueryInterface(
      Ci.nsISupportsString
    );

    const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    messenger.saveAs(
      messageUri.data,
      true,
      null,
      decodeURIComponent(file.path),
      true
    );
  },
};

var TabsInTitlebar = {
  init() {
    this._readPref();
    Services.prefs.addObserver(this._drawInTitlePref, this);

    window.addEventListener("resolutionchange", this);
    window.addEventListener("resize", this);

    this._initialized = true;
    this.update();
  },

  allowedBy(condition, allow) {
    if (allow) {
      if (condition in this._disallowed) {
        delete this._disallowed[condition];
        this.update();
      }
    } else if (!(condition in this._disallowed)) {
      this._disallowed[condition] = null;
      this.update();
    }
  },

  get systemSupported() {
    let isSupported = false;
    switch (AppConstants.MOZ_WIDGET_TOOLKIT) {
      case "windows":
      case "cocoa":
        isSupported = true;
        break;
      case "gtk":
        isSupported = window.matchMedia("(-moz-gtk-csd-available)");
        break;
    }
    delete this.systemSupported;
    return (this.systemSupported = isSupported);
  },

  get enabled() {
    return document.documentElement.getAttribute("tabsintitlebar") == "true";
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      this._readPref();
    }
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "resolutionchange":
        if (aEvent.target == window) {
          this.update();
        }
        break;
      case "resize":
        // The spaces toolbar needs special styling for the fullscreen mode.
        gSpacesToolbar.onWindowResize();
        if (window.fullScreen || aEvent.target != window) {
          break;
        }
        // We use resize events because the window is not ready after
        // sizemodechange events. However, we only care about the event when
        // the sizemode is different from the last time we updated the
        // appearance of the tabs in the titlebar.
        const sizemode = document.documentElement.getAttribute("sizemode");
        if (this._lastSizeMode == sizemode) {
          break;
        }
        const oldSizeMode = this._lastSizeMode;
        this._lastSizeMode = sizemode;
        // Don't update right now if we are leaving fullscreen, since the UI is
        // still changing in the consequent "fullscreen" event. Code there will
        // call this function again when everything is ready.
        // See browser-fullScreen.js: FullScreen.toggle and bug 1173768.
        if (oldSizeMode == "fullscreen") {
          break;
        }
        this.update();
        break;
    }
  },

  _initialized: false,
  _disallowed: {},
  _drawInTitlePref: "mail.tabs.drawInTitlebar",
  _lastSizeMode: null,

  _readPref() {
    // check is only true when drawInTitlebar=true
    const check = Services.prefs.getBoolPref(this._drawInTitlePref);
    this.allowedBy("pref", check);
  },

  update() {
    if (!this._initialized || window.fullScreen) {
      return;
    }

    let allowed =
      this.systemSupported && Object.keys(this._disallowed).length == 0;

    if (
      document.documentElement.getAttribute("chromehidden")?.includes("toolbar")
    ) {
      // Don't draw in titlebar in case of a popup window.
      allowed = false;
    }

    if (allowed) {
      document.documentElement.setAttribute("tabsintitlebar", "true");
      if (AppConstants.platform == "macosx") {
        document.documentElement.setAttribute("chromemargin", "0,-1,-1,-1");
        document.documentElement.removeAttribute("drawtitle");
      } else {
        document.documentElement.setAttribute("chromemargin", "0,2,2,2");
      }
    } else {
      document.documentElement.removeAttribute("tabsintitlebar");
      document.documentElement.removeAttribute("chromemargin");
      if (AppConstants.platform == "macosx") {
        document.documentElement.setAttribute("drawtitle", "true");
      }
    }
  },

  uninit() {
    this._initialized = false;
    Services.prefs.removeObserver(this._drawInTitlePref, this);
  },
};

var BrowserAddonUI = {
  async promptRemoveExtension(addon) {
    const { name } = addon;
    const [title, btnTitle] = await document.l10n.formatValues([
      {
        id: "addon-removal-title",
        args: { name },
      },
      {
        id: "addon-removal-confirmation-button",
      },
    ]);
    const {
      BUTTON_TITLE_IS_STRING: titleString,
      BUTTON_TITLE_CANCEL: titleCancel,
      BUTTON_POS_0,
      BUTTON_POS_1,
      confirmEx,
    } = Services.prompt;
    const btnFlags = BUTTON_POS_0 * titleString + BUTTON_POS_1 * titleCancel;
    let message = null;

    if (!Services.prefs.getBoolPref("prompts.windowPromptSubDialog", false)) {
      message = await document.l10n.formatValue(
        "addon-removal-confirmation-message",
        {
          name,
        }
      );
    }

    const checkboxState = { value: false };
    const result = confirmEx(
      window,
      title,
      message,
      btnFlags,
      btnTitle,
      /* button1 */ null,
      /* button2 */ null,
      /* checkboxMessage */ null,
      checkboxState
    );

    return { remove: result === 0, report: false };
  },

  async removeAddon(addonId) {
    const addon = addonId && (await AddonManager.getAddonByID(addonId));
    if (!addon || !(addon.permissions & AddonManager.PERM_CAN_UNINSTALL)) {
      return;
    }

    const { remove, report } = await this.promptRemoveExtension(addon);

    if (remove) {
      await addon.uninstall(report);
    }
  },
};
