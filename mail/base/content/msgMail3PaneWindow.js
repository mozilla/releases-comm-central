/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from ../../components/customizableui/content/panelUI.js */
/* import-globals-from ../../components/newmailaccount/content/accountProvisionerTab.js */
/* import-globals-from ../../components/preferences/preferencesTab.js */
/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from folderPane.js */
/* import-globals-from glodaFacetTab.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailTabs.js */
/* import-globals-from mailWindow.js */
/* import-globals-from messenger-customization.js */
/* import-globals-from quickFilterBar.js */
/* import-globals-from searchBar.js */
/* import-globals-from searchBar.js */
/* import-globals-from specialTabs.js */
/* import-globals-from toolbarIconColor.js */

/* globals loadCalendarComponent */

ChromeUtils.import("resource:///modules/activity/activityModules.jsm");
var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { SessionStoreManager } = ChromeUtils.import(
  "resource:///modules/SessionStoreManager.jsm"
);
var { SummaryFrameManager } = ChromeUtils.import(
  "resource:///modules/SummaryFrameManager.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { MailConstants } = ChromeUtils.import(
  "resource:///modules/MailConstants.jsm"
);
var { Color } = ChromeUtils.import("resource://gre/modules/Color.jsm");
var { TagUtils } = ChromeUtils.import("resource:///modules/TagUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  JSTreeSelection: "resource:///modules/JsTreeSelection.jsm",
  msgDBCacheManager: "resource:///modules/MsgDBCacheManager.jsm",
  PeriodicFilterManager: "resource:///modules/PeriodicFilterManager.jsm",
});

// A stub for tests to avoid test failures caused by the harness expecting
// this to exist.
var NewTabPagePreloading = {
  removePreloadedBrowser() {},
};

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
  LightweightThemeManager: "resource://gre/modules/LightweightThemeManager.jsm",
  CustomizableUI: "resource:///modules/CustomizableUI.jsm",
  ShortcutUtils: "resource://gre/modules/ShortcutUtils.jsm",
});

XPCOMUtils.defineLazyGetter(this, "PopupNotifications", function() {
  let { PopupNotifications } = ChromeUtils.import(
    "resource:///modules/GlobalPopupNotifications.jsm"
  );
  try {
    // Hide all notifications while the URL is being edited and the address bar
    // has focus, including the virtual focus in the results popup.
    // We also have to hide notifications explicitly when the window is
    // minimized because of the effects of the "noautohide" attribute on Linux.
    // This can be removed once bug 545265 and bug 1320361 are fixed.
    let shouldSuppress = () => window.windowState == window.STATE_MINIMIZED;
    return new PopupNotifications(
      document.getElementById("tabmail"),
      document.getElementById("notification-popup"),
      document.getElementById("notification-popup-box"),
      { shouldSuppress }
    );
  } catch (ex) {
    Cu.reportError(ex);
    return null;
  }
});

// Copied from M-C's TelemetryEnvironment.jsm
ChromeUtils.defineModuleGetter(
  this,
  "ctypes",
  "resource://gre/modules/ctypes.jsm"
);
/**
 * Gets the service pack and build information on Windows platforms. The initial version
 * was copied from nsUpdateService.js.
 *
 * @return An object containing the service pack major and minor versions, along with the
 *         build number.
 */
function getWindowsVersionInfo() {
  const UNKNOWN_VERSION_INFO = {
    servicePackMajor: null,
    servicePackMinor: null,
    buildNumber: null,
  };

  if (AppConstants.platform !== "win") {
    return UNKNOWN_VERSION_INFO;
  }

  const BYTE = ctypes.uint8_t;
  const WORD = ctypes.uint16_t;
  const DWORD = ctypes.uint32_t;
  const WCHAR = ctypes.char16_t;
  const BOOL = ctypes.int;

  // This structure is described at:
  // http://msdn.microsoft.com/en-us/library/ms724833%28v=vs.85%29.aspx
  const SZCSDVERSIONLENGTH = 128;
  const OSVERSIONINFOEXW = new ctypes.StructType("OSVERSIONINFOEXW", [
    { dwOSVersionInfoSize: DWORD },
    { dwMajorVersion: DWORD },
    { dwMinorVersion: DWORD },
    { dwBuildNumber: DWORD },
    { dwPlatformId: DWORD },
    { szCSDVersion: ctypes.ArrayType(WCHAR, SZCSDVERSIONLENGTH) },
    { wServicePackMajor: WORD },
    { wServicePackMinor: WORD },
    { wSuiteMask: WORD },
    { wProductType: BYTE },
    { wReserved: BYTE },
  ]);

  let kernel32 = ctypes.open("kernel32");
  try {
    let GetVersionEx = kernel32.declare(
      "GetVersionExW",
      ctypes.winapi_abi,
      BOOL,
      OSVERSIONINFOEXW.ptr
    );
    let winVer = OSVERSIONINFOEXW();
    winVer.dwOSVersionInfoSize = OSVERSIONINFOEXW.size;

    if (0 === GetVersionEx(winVer.address())) {
      throw new Error("Failure in GetVersionEx (returned 0)");
    }

    return {
      servicePackMajor: winVer.wServicePackMajor,
      servicePackMinor: winVer.wServicePackMinor,
      buildNumber: winVer.dwBuildNumber,
    };
  } catch (e) {
    return UNKNOWN_VERSION_INFO;
  } finally {
    kernel32.close();
  }
}

/* This is where functions related to the 3 pane window are kept */

// from MailNewsTypes.h
var nsMsgKey_None = 0xffffffff;
var nsMsgViewIndex_None = 0xffffffff;
var kMailCheckOncePrefName = "mail.startup.enabledMailCheckOnce";

var kStandardPaneConfig = 0;
var kWidePaneConfig = 1;
var kVerticalPaneConfig = 2;

var kNumFolderViews = 4; // total number of folder views

/** widget with id=messagepanebox, initialized by GetMessagePane() */
var gMessagePane;

/** widget with id=messagepaneboxwrapper, initialized by GetMessagePaneWrapper() */
var gMessagePaneWrapper;

var gThreadAndMessagePaneSplitter = null;
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

var gDisplayStartupPage = false;

// The object in charge of managing the mail summary pane
var gSummaryFrameManager;

// the folderListener object
var folderListener = {
  OnItemAdded(parentItem, item) {},

  OnItemRemoved(parentItem, item) {},

  OnItemPropertyChanged(item, property, oldValue, newValue) {},

  OnItemIntPropertyChanged(item, property, oldValue, newValue) {
    if (item == gFolderDisplay.displayedFolder) {
      if (property == "TotalMessages" || property == "TotalUnreadMessages") {
        UpdateStatusMessageCounts(gFolderDisplay.displayedFolder);
      }
    }
  },

  OnItemBoolPropertyChanged(item, property, oldValue, newValue) {},

  OnItemUnicharPropertyChanged(item, property, oldValue, newValue) {},
  OnItemPropertyFlagChanged(item, property, oldFlag, newFlag) {},

  OnItemEvent(folder, event) {
    if (event == "ImapHdrDownloaded") {
      if (folder) {
        var imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
        if (imapFolder) {
          var hdrParser = imapFolder.hdrParser;
          if (hdrParser) {
            var msgHdr = hdrParser.GetNewMsgHdr();
            if (msgHdr) {
              var hdrs = hdrParser.headers;
              if (hdrs && hdrs.includes("X-attachment-size:")) {
                msgHdr.OrFlags(Ci.nsMsgMessageFlags.Attachment);
              }
              if (hdrs && hdrs.includes("X-image-size:")) {
                msgHdr.setStringProperty("imageSize", "1");
              }
            }
          }
        }
      }
    } else if (event == "JunkStatusChanged") {
      HandleJunkStatusChanged(folder);
    }
  },
};

function ServerContainsFolder(server, folder) {
  if (!folder || !server) {
    return false;
  }

  return server.equals(folder.server);
}

function SelectServer(server) {
  gFolderTreeView.selectFolder(server.rootFolder);
}

// we have this incoming server listener in case we need to
// alter the folder pane selection when a server is removed
// or changed (currently, when the real username or real hostname change)
var gThreePaneIncomingServerListener = {
  onServerLoaded(server) {},
  onServerUnloaded(server) {
    let defaultAccount = accountManager.defaultAccount;
    if (!defaultAccount) {
      // If there is no default server we have nothing to do.
      return;
    }

    let defaultServer = defaultAccount.incomingServer;
    var selectedFolders = GetSelectedMsgFolders();
    for (var i = 0; i < selectedFolders.length; i++) {
      if (ServerContainsFolder(server, selectedFolders[i])) {
        SelectServer(defaultServer);
        // we've made a new selection, we're done
        return;
      }
    }

    // if nothing is selected at this point, better go select the default
    // this could happen if nothing was selected when the server was removed
    selectedFolders = GetSelectedMsgFolders();
    if (selectedFolders.length == 0) {
      SelectServer(defaultServer);
    }
  },
  onServerChanged(server) {
    // if the current selected folder is on the server that changed
    // and that server is an imap or news server,
    // we need to update the selection.
    // on those server types, we'll be reconnecting to the server
    // and our currently selected folder will need to be reloaded
    // or worse, be invalid.
    if (server.type != "imap" && server.type != "nntp") {
      return;
    }

    var selectedFolders = GetSelectedMsgFolders();
    for (var i = 0; i < selectedFolders.length; i++) {
      // if the selected item is a server, we don't have to update
      // the selection
      if (
        !selectedFolders[i].isServer &&
        ServerContainsFolder(server, selectedFolders[i])
      ) {
        SelectServer(server);
        // we've made a new selection, we're done
        return;
      }
    }
  },
};

// aMsgWindowInitialized: false if we are calling from the onload handler, otherwise true
function UpdateMailPaneConfig(aMsgWindowInitialized) {
  const dynamicIds = ["messagesBox", "mailContent", "threadPaneBox"];
  const layouts = ["standard", "wide", "vertical"];
  var layoutView = Services.prefs.getIntPref("mail.pane_config.dynamic");
  // Ensure valid value; hard fail if not.
  layoutView = dynamicIds[layoutView] ? layoutView : kStandardPaneConfig;
  var desiredId = dynamicIds[layoutView];
  document
    .getElementById("mailContent")
    .setAttribute("layout", layouts[layoutView]);
  var messagePaneBoxWrapper = GetMessagePaneWrapper();
  if (messagePaneBoxWrapper.parentNode.id != desiredId) {
    ClearAttachmentList();
    var hdrToolbox = document.getElementById("header-view-toolbox");
    var hdrToolbar = document.getElementById("header-view-toolbar");
    var firstPermanentChild = hdrToolbar.firstPermanentChild;
    var lastPermanentChild = hdrToolbar.lastPermanentChild;
    var messagePaneSplitter = GetThreadAndMessagePaneSplitter();
    var desiredParent = document.getElementById(desiredId);

    // Here the message pane including the header pane is moved to the
    // new layout by the appendChild() method below.  As described in bug
    // 519956 only elements in the DOM tree are copied to the new place
    // whereas javascript class variables of DOM tree elements get lost.
    // In this case the ToolboxPalette first/lastPermanentChild
    // are removed which results in the message header pane not being
    // customizable any more.  A workaround for this problem is to clone
    // them first and add them to the DOM tree after the message pane has
    // been moved.
    var cloneToolboxPalette;

    if (hdrToolbox.palette) {
      cloneToolboxPalette = hdrToolbox.palette.cloneNode(true);
    }

    // The find bar needs disconnecting before the browser it is attached to.
    // Due to its position in the DOM, this doesn't happen.
    document.getElementById("FindToolbar").destroy();

    let footerBox = desiredParent.lastElementChild;
    if (footerBox && footerBox.id == "messenger-notification-footer") {
      desiredParent.insertBefore(messagePaneSplitter, footerBox);
      desiredParent.insertBefore(messagePaneBoxWrapper, footerBox);
    } else {
      desiredParent.appendChild(messagePaneSplitter);
      desiredParent.appendChild(messagePaneBoxWrapper);
    }

    // Reconnect the message pane's web progress listener.
    let messagePane = document.getElementById("messagepane");
    if (messagePane._progressListener) {
      messagePane.webProgress.addProgressListener(
        messagePane._progressListener,
        Ci.nsIWebProgress.NOTIFY_ALL
      );
    }

    if (msgWindow) {
      // Reassigning statusFeedback adds a progress listener to the new docShell.
      // eslint-disable-next-line no-self-assign
      msgWindow.statusFeedback = msgWindow.statusFeedback;
    }
    hdrToolbox.palette = cloneToolboxPalette;
    hdrToolbar = document.getElementById("header-view-toolbar");
    hdrToolbar.firstPermanentChild = firstPermanentChild;
    hdrToolbar.lastPermanentChild = lastPermanentChild;
    messagePaneSplitter.setAttribute(
      "orient",
      desiredParent.getAttribute("orient")
    );
    if (aMsgWindowInitialized) {
      messenger.setWindow(null, null);
      messenger.setWindow(window, msgWindow);
      // Hack to make sure that the message is re-displayed
      // with the correct charset.
      setTimeout(ReloadMessage);
    }

    // The quick filter bar gets badly lied to due to standard XUL/XBL problems,
    //  so we need to generate synthetic notifications after a delay on those
    //  nodes that care about overflow.  The 'lie' comes in the form of being
    //  given (at startup) an overflow event with a tiny clientWidth (100), then
    //  a more tiny resize event (clientWidth = 32), then a resize event that
    //  claims the entire horizontal space is allocated to us
    //  (clientWidth = 1036).  It would appear that when the messagepane's XBL
    //  binding (or maybe the splitter's?) finally activates, the quick filter
    //  pane gets resized down without any notification.
    // Our solution tries to be generic and help out any code with an onoverflow
    //  handler.  We will also generate an onresize notification if it turns out
    //  that onoverflow is not appropriate (and such a handler is registered).
    //  This does require that XUL attributes were used to register the handlers
    //  rather than addEventListener.
    // The choice of the delay is basically a kludge because something like 10ms
    //  may be insufficient to ensure we get enqueued after whatever triggers
    //  the layout discontinuity.  (We need to wait for a paint to happen to
    //  trigger the XBL binding, and then there may be more complexities...)
    setTimeout(function() {
      let threadPaneBox = document.getElementById("threadPaneBox");
      let overflowNodes = threadPaneBox.querySelectorAll("[onoverflow]");

      for (let iNode = 0; iNode < overflowNodes.length; iNode++) {
        let node = overflowNodes[iNode];

        if (node.scrollWidth > node.clientWidth) {
          let e = document.createEvent("HTMLEvents");
          e.initEvent("overflow", false, false);
          node.dispatchEvent(e);
        } else if (node.onresize) {
          let e = document.createEvent("HTMLEvents");
          e.initEvent("resize", false, false);
          node.dispatchEvent(e);
        }
      }
    }, 1500);
  }
}

var MailPrefObserver = {
  observe(subject, topic, prefName) {
    // verify that we're changing the mail pane config pref
    if (topic == "nsPref:changed") {
      if (prefName == "mail.pane_config.dynamic") {
        UpdateMailPaneConfig(true);
      } else if (prefName == "mail.showCondensedAddresses") {
        var currentDisplayNameVersion;
        var threadTree = document.getElementById("threadTree");

        currentDisplayNameVersion = Services.prefs.getIntPref(
          "mail.displayname.version"
        );

        Services.prefs.setIntPref(
          "mail.displayname.version",
          ++currentDisplayNameVersion
        );

        // refresh the thread pane
        threadTree.invalidate();
      } else if (prefName == "mail.openpgp.enable") {
        if (
          MailConstants.MOZ_OPENPGP &&
          Services.prefs.getBoolPref("mail.openpgp.enable")
        ) {
          initOpenPGPIfEnabled(); // mail window related init
        }
      }
    }
  },
};

/**
 * Theme observer to deal with the ui.systemUsesDarkTheme preferences when
 * switching between default, light, and dark theme.
 */
var ThemePrefObserver = {
  observe(subject, topic, prefName) {
    // Verify that we're changing the correct pref.
    if (topic == "nsPref:changed" && prefName == "extensions.activeThemeID") {
      // We need to force a light theme before removing the pref in order to
      // deal with the issue of the Default Theme not triggering any color
      // update. We remove the pref to run our conditions on a clean state.
      Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
      Services.prefs.clearUserPref("ui.systemUsesDarkTheme");

      // Bail out if we're not on Linux and the current Thunderbird theme is not
      // the default, to allow the OS theme to properly handle the color scheme.
      if (
        AppConstants.platform != "linux" &&
        Services.prefs.getCharPref("extensions.activeThemeID", "") ==
          "default-theme@mozilla.org"
      ) {
        return;
      }

      let mainWindow = document.getElementById("messengerWindow");
      if (!mainWindow) {
        return;
      }

      if (mainWindow.getAttribute("lwt-tree-brighttext") == "true") {
        // The theme requires a light text, so we trigger the dark mode.
        Services.prefs.setIntPref("ui.systemUsesDarkTheme", 1);
        return;
      }

      // The theme doesn't require light text, so we keep trigger a light mode.
      Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
    }
  },
};

/**
 * Called on startup if there are no accounts.
 */
function verifyOpenAccountHubTab() {
  let suppressDialogs = Services.prefs.getBoolPref(
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

  // Collapse the Folder Pane since no account is currently present.
  document.getElementById("folderPaneBox").collapsed = true;
  document.getElementById("folderpane_splitter").collapsed = true;

  openAccountSetupTab();
}

function initOpenPGPIfEnabled() {
  let hideItems = true;

  BondOpenPGP.init();

  try {
    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.isEnabled()) {
      Enigmail.msg.messengerStartup.bind(Enigmail.msg);
      Enigmail.msg.messengerStartup();
      Enigmail.hdrView.hdrViewLoad.bind(Enigmail.hdrView);
      Enigmail.hdrView.hdrViewLoad();
      hideItems = false;
    }
  } catch (ex) {
    console.log(ex);
  }

  for (let item of document.querySelectorAll(".openpgp-item")) {
    item.hidden = hideItems;
  }
}

var gMailInit = {
  onBeforeInitialXULLayout() {
    // Set a sane starting width/height for all resolutions on new profiles.
    // Do this before the window loads.
    if (!document.documentElement.hasAttribute("width")) {
      // Prefer 1024xfull height.
      let defaultHeight = screen.availHeight;
      let defaultWidth = screen.availWidth <= 1024 ? screen.availWidth : 1024;

      // On small screens, default to maximized state.
      if (defaultHeight <= 600) {
        document.documentElement.setAttribute("sizemode", "maximized");
      }

      document.documentElement.setAttribute("width", defaultWidth);
      document.documentElement.setAttribute("height", defaultHeight);
      // Make sure we're safe at the left/top edge of screen
      document.documentElement.setAttribute("screenX", screen.availLeft);
      document.documentElement.setAttribute("screenY", screen.availTop);
    }

    // Run menubar initialization first, to avoid TabsInTitlebar code picking
    // up mutations from it and causing a reflow.
    AutoHideMenubar.init();
    TabsInTitlebar.init();

    if (AppConstants.platform == "win") {
      // On Win8 set an attribute when the window frame color is too dark for black text.
      if (
        window.matchMedia("(-moz-os-version: windows-win8)").matches &&
        window.matchMedia("(-moz-windows-default-theme)").matches
      ) {
        let { Windows8WindowFrameColor } = ChromeUtils.import(
          "resource:///modules/Windows8WindowFrameColor.jsm"
        );
        let windowFrameColor = new Color(...Windows8WindowFrameColor.get());
        // Default to black for foreground text.
        if (!windowFrameColor.isContrastRatioAcceptable(new Color(0, 0, 0))) {
          document.documentElement.setAttribute("darkwindowframe", "true");
        }
      } else if (AppConstants.isPlatformAndVersionAtLeast("win", "10")) {
        // 17763 is the build number of Windows 10 version 1809
        if (getWindowsVersionInfo().buildNumber < 17763) {
          document.documentElement.setAttribute(
            "always-use-accent-color-for-window-border",
            ""
          );
        }
      }
    }

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
    TagUtils.loadTagsIntoCSS(document);

    // update the pane config before we exit onload otherwise the user may see a flicker if we poke the document
    // in delayedOnLoadMessenger...
    UpdateMailPaneConfig(false);

    Services.prefs.addObserver("mail.pane_config.dynamic", MailPrefObserver);
    Services.prefs.addObserver("mail.showCondensedAddresses", MailPrefObserver);
    Services.prefs.addObserver("mail.openpgp.enable", MailPrefObserver);
    Services.prefs.addObserver("extensions.activeThemeID", ThemePrefObserver);

    CreateMailWindowGlobals();
    GetMessagePaneWrapper().collapsed = true;

    if (!Services.policies.isAllowed("devtools")) {
      let devtoolsMenu = document.getElementById("devtoolsMenu");
      if (devtoolsMenu) {
        devtoolsMenu.hidden = true;
      }
      let appmenu_devtoolsMenu = document.getElementById(
        "appmenu_devtoolsMenu"
      );
      if (appmenu_devtoolsMenu) {
        appmenu_devtoolsMenu.hidden = true;
      }
    }

    // - initialize tabmail system
    // Do this before loadPostAccountWizard since that code selects the first
    //  folder for display, and we want gFolderDisplay setup and ready to handle
    //  that event chain.
    // Also, we definitely need to register the tab type prior to the call to
    //  specialTabs.openSpecialTabsOnStartup below.
    let tabmail = document.getElementById("tabmail");
    if (tabmail) {
      // mailTabType is defined in mailTabs.js
      tabmail.registerTabType(mailTabType);
      // glodaFacetTab* in glodaFacetTab.js
      tabmail.registerTabType(glodaFacetTabType);
      QuickFilterBarMuxer._init();
      tabmail.registerTabMonitor(GlodaSearchBoxTabMonitor);
      tabmail.registerTabMonitor(statusMessageCountsMonitor);
      tabmail.openFirstTab();
    }

    // This also registers the contentTabType ("contentTab")
    specialTabs.openSpecialTabsOnStartup();
    preferencesTabType.initialize();
    // accountProvisionerTabType is defined in accountProvisionerTab.js
    tabmail.registerTabType(accountProvisionerTabType);

    // Set up the summary frame manager to handle loading pages in the
    // multi-message pane
    gSummaryFrameManager = new SummaryFrameManager(
      document.getElementById("multimessage")
    );

    // Depending on the pref, hide/show the gloda toolbar search widgets.
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "gGlodaEnabled",
      "mailnews.database.global.indexer.enabled",
      true,
      (pref, oldVal, newVal) => {
        for (let widget of document.querySelectorAll(".gloda-search-widget")) {
          widget.hidden = !newVal;
        }
      }
    );
    for (let widget of document.querySelectorAll(".gloda-search-widget")) {
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
      case "account-setup-cancelled":
      case "account-created-in-backend":
      case "account-created-from-provisioner":
        // If the gFolderTreeView was never initialized it means we're in a
        // first run scenario and we need to load the full UI.
        if (!gFolderTreeView.isInited) {
          loadPostAccountWizard();
        }

        // Always update the mail UI to guarantee all the panes are visible even
        // if the mail tab is not the currently active tab.
        updateMailPaneUI();
        break;

      case "account-setup-closed":
        // The user closed the account setup after a successful run. Make sure
        // to focus on the primary mail tab.
        switchToMailTab();
        // Trigger the integration dialog if necessary.
        showSystemIntegrationDialog();
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

    initOpenPGPIfEnabled();

    PanelUI.init();
    gUIDensity.init();
    gExtensionsNotifications.init();

    Services.search.init();

    PeriodicFilterManager.setupFiltering();
    msgDBCacheManager.init();

    this.delayedStartupFinished = true;
    Services.obs.notifyObservers(window, "mail-delayed-startup-finished");

    // Load the entire UI only if we already have at least one account available
    // otherwise the verifyExistingAccounts will trigger the account wizard.
    if (verifyExistingAccounts()) {
      switchToMailTab();
      loadPostAccountWizard();
    }
  },

  /**
   * Called by messenger.xhtml:onunload, the 3-pane window inside of tabs window.
   *  It's being unloaded!  Right now!
   */
  onUnload() {
    Services.obs.notifyObservers(window, "mail-unloading-messenger");
    accountManager.removeIncomingServerListener(
      gThreePaneIncomingServerListener
    );
    Services.prefs.removeObserver("mail.pane_config.dynamic", MailPrefObserver);
    Services.prefs.removeObserver(
      "mail.showCondensedAddresses",
      MailPrefObserver
    );
    Services.prefs.removeObserver("mail.openpgp.enable", MailPrefObserver);
    Services.prefs.removeObserver(
      "extensions.activeThemeID",
      ThemePrefObserver
    );

    if (gRightMouseButtonSavedSelection) {
      // Avoid possible cycle leaks.
      gRightMouseButtonSavedSelection.view = null;
      gRightMouseButtonSavedSelection = null;
    }

    gUIDensity.uninit();
    SessionStoreManager.unloadingWindow(window);
    TabsInTitlebar.uninit();
    ToolbarIconColor.uninit();

    document.getElementById("tabmail")._teardown();
    MailServices.mailSession.RemoveFolderListener(folderListener);
    gPhishingDetector.shutdown();

    // FIX ME - later we will be able to use onload from the overlay
    OnUnloadMsgHeaderPane();

    UnloadPanes();
    OnMailWindowUnload();
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

    let accounts = MailServices.accounts.accounts;
    let invalidAccounts = getInvalidAccounts(accounts);
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
    if (!localFoldersExists) {
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
  let tabmail = document.getElementById("tabmail");
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
  messenger.setWindow(window, msgWindow);

  await initPanes();
  MigrateJunkMailSettings();
  MigrateFolderViews();
  MigrateOpenMessageBehavior();
  const { MailMigrator } = ChromeUtils.import(
    "resource:///modules/MailMigrator.jsm"
  );
  MailMigrator.migratePostAccountWizard();

  accountManager.setSpecialFolders();

  try {
    accountManager.loadVirtualFolders();
  } catch (e) {
    Cu.reportError(e);
  }
  accountManager.addIncomingServerListener(gThreePaneIncomingServerListener);

  gPhishingDetector.init();

  // Add to session before trying to load the start folder otherwise the
  // listeners aren't set up correctly.
  AddToSession();

  // Check if Thunderbird was launched in safe mode.
  if (Services.appinfo.inSafeMode) {
    let safeMode = document.getElementById("helpTroubleshootMode");
    document.l10n.setAttributes(safeMode, "menu-help-exit-troubleshoot-mode");

    let appSafeMode = document.getElementById("appmenu_troubleshootMode");
    document.l10n.setAttributes(
      appSafeMode,
      "appmenu-help-exit-troubleshoot-mode"
    );
  }

  // Load the message header pane.
  OnLoadMsgHeaderPane();

  // Set focus to the Thread Pane the first time the window is opened.
  SetFocusThreadPane();

  // Initialize the customizeDone method on the customizeable toolbar.
  let toolbox = document.getElementById("mail-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeMailToolbar");
  };

  // Restore the previous folder selection before shutdown, or select the first
  // inbox folder of a newly created account.
  selectFirstFolder();

  // All core modal dialogs are done, the user can now interact with the 3-pane
  // window.
  Services.obs.notifyObservers(window, "mail-startup-done");

  // Idle dispatch the telemetry reports.
  Services.tm.idleDispatchToMainThread(() => {
    reportAccountTypes();
    reportAddressBookTypes();
    reportAccountSizes();
  });
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
  let defaultAccount = accountManager.defaultAccount;

  // Load the search integration module.
  let { SearchIntegration } = ChromeUtils.import(
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
function selectFirstFolder() {
  let startFolderURI = null;
  let startMsgHdr = null;

  if ("arguments" in window && window.arguments.length > 0) {
    let arg0 = window.arguments[0];
    // If the argument is a string, it is either a folder URI or a feed URI.
    if (typeof arg0 == "string") {
      // Filter out any feed urls that came in as arguments to the new window.
      if (arg0.toLowerCase().startsWith("feed:")) {
        let feedHandler = Cc[
          "@mozilla.org/newsblog-feed-downloader;1"
        ].getService(Ci.nsINewsBlogFeedDownloader);
        if (feedHandler) {
          feedHandler.subscribeToFeed(arg0, null, msgWindow);
        }
      } else {
        startFolderURI = arg0;
      }
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
    Services.tm.dispatchToMainThread(() => loadStartMsgHdr(startMsgHdr));
  } else {
    Services.tm.dispatchToMainThread(() => loadStartFolder(startFolderURI));
  }
}

/**
 * Report account types to telemetry. For im accounts, use `im_protocol` as
 * scalar key name.
 */
function reportAccountTypes() {
  // Init all count with 0, so that when an account was set up before but
  // removed now, we reset it in telemetry report.
  let report = {
    pop3: 0,
    imap: 0,
    nntp: 0,
    exchange: 0,
    rss: 0,
    none: 0,
    im_gtalk: 0,
    im_irc: 0,
    im_jabber: 0,
    im_matrix: 0,
    im_odnoklassniki: 0,
  };
  for (let account of MailServices.accounts.accounts) {
    let type = account.incomingServer.type;
    if (type === "im") {
      let protocol =
        account.incomingServer.wrappedJSObject.imAccount.protocol
          .normalizedName;
      type = `im_${protocol}`;
    }
    // It's still possible to report other types not explicitly specified due to
    // account types that used to exist, but no longer -- e.g. im_yahoo.
    if (!report[type]) {
      report[type] = 0;
    }
    report[type]++;
  }
  for (let [type, count] of Object.entries(report)) {
    Services.telemetry.keyedScalarSet("tb.account.count", type, count);
  }
}

/**
 * Report size on disk and messages count of each type of folder to telemetry.
 */
function reportAccountSizes() {
  for (let server of MailServices.accounts.allServers) {
    if (
      server instanceof Ci.nsIPop3IncomingServer &&
      server.deferredToAccount
    ) {
      // Skip deferred accounts
      continue;
    }

    for (let folder of server.rootFolder.descendants) {
      let key =
        [
          "Inbox",
          "Drafts",
          "Trash",
          "SentMail",
          "Templates",
          "Junk",
          "Archive",
          "Queue",
        ].find(x => folder.getFlag(Ci.nsMsgFolderFlags[x])) || "Other";
      let totalMessages = folder.getTotalMessages(false);
      if (totalMessages > 0) {
        Services.telemetry.keyedScalarAdd(
          "tb.account.size_on_disk",
          key,
          folder.sizeOnDisk
        );
        Services.telemetry.keyedScalarAdd(
          "tb.account.total_messages",
          key,
          folder.getTotalMessages(false)
        );
        Services.telemetry.keyedScalarAdd(
          "tb.account.size_on_disk",
          "Total",
          folder.sizeOnDisk
        );
        Services.telemetry.keyedScalarAdd(
          "tb.account.total_messages",
          "Total",
          folder.getTotalMessages(false)
        );
      }
    }
  }
}

/**
 * Report addressbook count and contact count to telemetry, keyed by addressbook
 * type. Type is one of ["jsaddrbook", "jscarddav", "moz-abldapdirectory"], see
 * AddrBookManager.jsm for more details.
 *
 * NOTE: We didn't use `dir.dirType` because it's just an integer, instead we
 * use the scheme of `dir.URI` as the type.
 */
function reportAddressBookTypes() {
  let report = {};
  for (let dir of MailServices.ab.directories) {
    let type = dir.URI.split(":")[0];

    if (!report[type]) {
      report[type] = { count: 0, contactCount: 0 };
    }
    report[type].count++;

    // Ignore LDAP contacts for now.
    if (type !== "moz-abldapdirectory") {
      report[type].contactCount += dir.childCards.filter(
        c => !c.isMailList
      ).length;
    }
  }

  for (let [type, { count, contactCount }] of Object.entries(report)) {
    Services.telemetry.keyedScalarSet(
      "tb.addressbook.addressbook_count",
      type,
      count
    );
    Services.telemetry.keyedScalarSet(
      "tb.addressbook.contact_count",
      type,
      contactCount
    );
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
    case "Search":
      goDoCommand("cmd_search");
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
 * Look for another 3-pane window.
 */
function FindOther3PaneWindow() {
  for (let win of Services.wm.getEnumerator("mail:3pane")) {
    if (win != window) {
      return win;
    }
  }
  return null;
}

/**
 * Called by the session store manager periodically and at shutdown to get
 * the state of this window for persistence.
 */
function getWindowStateForSessionPersistence() {
  let tabmail = document.getElementById("tabmail");
  let tabsState = tabmail.persistTabs();
  return { type: "3pane", tabs: tabsState };
}

/**
 * Attempt to restore our tab states.  This should only be called by
 * |loadStartFolder| or |loadStartMsgHdr|.
 *
 * @param aDontRestoreFirstTab If this is true, the first tab will not be
 *                             restored, and will continue to retain focus at
 *                             the end. This is needed if the window was opened
 *                             with a folder or a message as an argument.
 *
 * @return true if the restoration was successful, false otherwise.
 */
async function atStartupRestoreTabs(aDontRestoreFirstTab) {
  // The calendar component needs to be loaded before restoring any calendar tabs.
  await loadCalendarComponent();

  let state = await SessionStoreManager.loadingWindow(window);
  if (state) {
    let tabsState = state.tabs;
    let tabmail = document.getElementById("tabmail");
    tabmail.restoreTabs(tabsState, aDontRestoreFirstTab);
  }

  // it's now safe to load extra Tabs.
  Services.tm.dispatchToMainThread(loadExtraTabs);
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

  let tabmail = document.getElementById("tabmail");

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
  // We'll just clobber the default tab
  await atStartupRestoreTabs(true);

  MsgDisplayMessageInFolderTab(aStartMsgHdr);
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
      let defaultAccount = accountManager.defaultAccount;
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
      try {
        gFolderTreeView.selectFolder(startFolder);
      } catch (ex) {
        // This means we tried to select a folder that isn't in the current
        // view. Just select the first one in the view then.
        if (gFolderTreeView._rowMap.length) {
          gFolderTreeView.selectFolder(gFolderTreeView._rowMap[0]._folder);
        }
      }
    }
  } catch (ex) {
    // this is the case where we're trying to auto-subscribe to a folder.
    if (initialUri && !startFolder.parent) {
      // hack to force display of thread pane.
      if (IsMessagePaneCollapsed) {
        MsgToggleMessagePane();
      }
      messenger.loadURL(window, initialUri);
      return;
    }

    Cu.reportError(ex);
  }

  MsgGetMessagesForAllServers(defaultServer);

  if (MailOfflineMgr.isOnline()) {
    // Check if we shut down offline, and restarted online, in which case
    // we may have offline events to playback. Since this is not a pref
    // the user should set, it's not in mailnews.js, so we need a try catch.
    let playbackOfflineEvents = Services.prefs.getBoolPref(
      "mailnews.playback_offline",
      false
    );
    if (playbackOfflineEvents) {
      Services.prefs.setBoolPref("mailnews.playback_offline", false);
      MailOfflineMgr.offlineManager.goOnline(false, true, msgWindow);
    }

    // If appropriate, send unsent messages. This may end up prompting the user,
    // so we need to get it out of the flow of the normal load sequence.
    setTimeout(function() {
      if (MailOfflineMgr.shouldSendUnsentMessages()) {
        SendUnsentMessages();
      }
    }, 0);
  }
}

function AddToSession() {
  var nsIFolderListener = Ci.nsIFolderListener;
  var notifyFlags =
    nsIFolderListener.intPropertyChanged | nsIFolderListener.event;
  MailServices.mailSession.AddFolderListener(folderListener, notifyFlags);
}

/**
 * Initialize all the panes composing the main UI. Folder pane, Message thread
 * pane, and Message view pane.
 */
async function initPanes() {
  await gFolderTreeView.load(
    document.getElementById("folderTree"),
    "folderTree.json"
  );
  var folderTree = document.getElementById("folderTree");
  folderTree.addEventListener("click", FolderPaneOnClick, true);
  folderTree.addEventListener("mousedown", TreeOnMouseDown, true);
  var threadTree = document.getElementById("threadTree");
  threadTree.addEventListener("click", ThreadTreeOnClick, true);

  OnLoadThreadPane();
  SetupCommandUpdateHandlers();

  for (let browser of ["messagepane", "multimessage"]) {
    let element = document.getElementById(browser);
    if (!element) {
      continue;
    }
    element.addEventListener(
      "DoZoomEnlargeBy10",
      () => {
        ZoomManager.scrollZoomEnlarge(element);
      },
      true
    );
    element.addEventListener(
      "DoZoomReduceBy10",
      () => {
        ZoomManager.scrollReduceEnlarge(element);
      },
      true
    );
  }
}

function UnloadPanes() {
  var threadTree = document.getElementById("threadTree");
  threadTree.removeEventListener("click", ThreadTreeOnClick, true);
  var folderTree = document.getElementById("folderTree");
  folderTree.removeEventListener("click", FolderPaneOnClick, true);
  folderTree.removeEventListener("mousedown", TreeOnMouseDown, true);
  gFolderTreeView.unload("folderTree.json");
  UnloadCommandUpdateHandlers();
}

function OnLoadThreadPane() {
  // Use an observer to watch the columns element so that we get a notification
  // whenever attributes on the columns change.
  let observer = new MutationObserver(function(mutations) {
    gFolderDisplay.hintColumnsChanged();
  });
  observer.observe(document.getElementById("threadCols"), {
    attributes: true,
    subtree: true,
    attributeFilter: ["hidden", "ordinal"],
  });
}

/* Functions for accessing particular parts of the window*/
function GetMessagePane() {
  if (!gMessagePane) {
    gMessagePane = document.getElementById("messagepanebox");
  }
  return gMessagePane;
}

function GetMessagePaneWrapper() {
  if (!gMessagePaneWrapper) {
    gMessagePaneWrapper = document.getElementById("messagepaneboxwrapper");
  }
  return gMessagePaneWrapper;
}

function getMailToolbox() {
  return document.getElementById("mail-toolbox");
}

function FindInSidebar(currentWindow, id) {
  var item = currentWindow.document.getElementById(id);
  if (item) {
    return item;
  }

  for (var i = 0; i < currentWindow.frames.length; ++i) {
    var frameItem = FindInSidebar(currentWindow.frames[i], id);
    if (frameItem) {
      return frameItem;
    }
  }

  return null;
}

function GetThreadAndMessagePaneSplitter() {
  if (!gThreadAndMessagePaneSplitter) {
    gThreadAndMessagePaneSplitter = document.getElementById(
      "threadpane-splitter"
    );
  }
  return gThreadAndMessagePaneSplitter;
}

function IsMessagePaneCollapsed() {
  return (
    document.getElementById("threadpane-splitter").getAttribute("state") ==
    "collapsed"
  );
}

function ClearThreadPaneSelection() {
  gFolderDisplay.clearSelection();
}

function ClearMessagePane() {
  // hide the message header view AND the message pane...
  HideMessageHeaderPane();
  gMessageNotificationBar.clearMsgNotifications();
  ClearPendingReadTimer();

  try {
    // Tell messenger to stop loading a message, if it is doing so.
    messenger.abortPendingOpenURL();
    // This can fail because cloning imap URI's can fail if the username
    // has been cleared by docshell/base/nsDefaultURIFixup.cpp.
    let messagePane = getMessagePaneBrowser();
    // If we don't do this check, no one else does and we do a non-trivial
    // amount of work.  So do the check.
    if (messagePane.currentURI?.spec != "about:blank") {
      // Don't use MailE10SUtils.loadURI here. about:blank can load in
      // remote and non-remote browsers.
      messagePane.loadURI("about:blank", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
  } catch (ex) {
    Cu.reportError(ex); // error clearing message pane
  }
}

/**
 * When right-clicks happen, we do not want to corrupt the underlying
 * selection.  The right-click is a transient selection.  So, unless the
 * user is right-clicking on the current selection, we create a new
 * selection object (thanks to JSTreeSelection) and set that as the
 * current/transient selection.
 *
 * It is up you to call RestoreSelectionWithoutContentLoad to clean up when we
 * are done.
 *
 * @param aSingleSelect Should the selection we create be a single selection?
 *     This is relevant if the row being clicked on is already part of the
 *     selection.  If it is part of the selection and !aSingleSelect, then we
 *     leave the selection as is.  If it is part of the selection and
 *     aSingleSelect then we create a transient single-row selection.
 */
function ChangeSelectionWithoutContentLoad(event, tree, aSingleSelect) {
  var treeSelection = tree.view.selection;

  var row = tree.getRowAt(event.clientX, event.clientY);
  // Only do something if:
  // - the row is valid
  // - it's not already selected (or we want a single selection)
  if (row >= 0 && (aSingleSelect || !treeSelection.isSelected(row))) {
    // Check if the row is exactly the existing selection.  In that case
    //  there is no need to create a bogus selection.
    if (treeSelection.count == 1) {
      let minObj = {};
      treeSelection.getRangeAt(0, minObj, {});
      if (minObj.value == row) {
        event.stopPropagation();
        return;
      }
    }

    let transientSelection = new JSTreeSelection(tree);
    transientSelection.logAdjustSelectionForReplay();

    gRightMouseButtonSavedSelection = {
      // Need to clear out this reference later.
      view: tree.view,
      realSelection: treeSelection,
      transientSelection,
    };

    var saveCurrentIndex = treeSelection.currentIndex;

    // tell it to log calls to adjustSelection
    // attach it to the view
    tree.view.selection = transientSelection;
    // Don't generate any selection events! (we never set this to false, because
    //  that would generate an event, and we never need one of those from this
    //  selection object.
    transientSelection.selectEventsSuppressed = true;
    transientSelection.select(row);
    transientSelection.currentIndex = saveCurrentIndex;
    tree.ensureRowIsVisible(row);
  }
  event.stopPropagation();
}

function TreeOnMouseDown(event) {
  // Detect right mouse click and change the highlight to the row
  // where the click happened without loading the message headers in
  // the Folder or Thread Pane.
  // Same for middle click, which will open the folder/message in a tab.
  if (event.button == 2 || event.button == 1) {
    // We want a single selection if this is a middle-click (button 1)
    ChangeSelectionWithoutContentLoad(
      event,
      event.target.parentNode,
      event.button == 1
    );
  }
}

function FolderPaneContextMenuNewTab(event) {
  var bgLoad = Services.prefs.getBoolPref("mail.tabs.loadInBackground");
  if (event.shiftKey) {
    bgLoad = !bgLoad;
  }
  MsgOpenNewTabForFolder(bgLoad);
}

function FolderPaneOnClick(event) {
  var folderTree = document.getElementById("folderTree");

  // Middle click on a folder opens the folder in a tab
  if (
    event.button == 1 &&
    event.target.localName != "slider" &&
    event.target.localName != "scrollbarbutton"
  ) {
    FolderPaneContextMenuNewTab(event);
    RestoreSelectionWithoutContentLoad(folderTree);
  } else if (event.button == 0) {
    var treeCellInfo = folderTree.getCellAt(event.clientX, event.clientY);
    if (treeCellInfo.row == -1) {
      if (event.target.localName == "treecol") {
        // clicking on the name column in the folder pane should not sort
        event.stopPropagation();
      }
    } else if (
      event.target.localName == "slider" ||
      event.target.localName == "scrollbarbutton"
    ) {
      event.stopPropagation();
    }
  }
}

function OpenMessageInNewTab(event) {
  if (!gFolderDisplay.selectedMessage) {
    return;
  }
  var bgLoad = Services.prefs.getBoolPref("mail.tabs.loadInBackground");
  if (event.shiftKey) {
    bgLoad = !bgLoad;
  }

  document.getElementById("tabmail").openTab("message", {
    msgHdr: gFolderDisplay.selectedMessage,
    viewWrapperToClone: gFolderDisplay.view,
    background: bgLoad,
  });
}

function OpenContainingFolder() {
  if (!gFolderDisplay.selectedMessage) {
    return;
  }

  MailUtils.displayMessageInFolderTab(gFolderDisplay.selectedMessage);
}

function ThreadTreeOnClick(event) {
  var threadTree = document.getElementById("threadTree");

  // Middle click on a message opens the message in a tab
  if (
    event.button == 1 &&
    event.target.localName != "slider" &&
    event.target.localName != "scrollbarbutton"
  ) {
    OpenMessageInNewTab(event);
    RestoreSelectionWithoutContentLoad(threadTree);
  }
}

function GetSelectedMsgFolders() {
  return gFolderTreeView.getSelectedFolders();
}

function SelectFolder(folderUri) {
  gFolderTreeView.selectFolder(MailUtils.getOrCreateFolder(folderUri));
}

function ReloadMessage() {
  if (!gFolderDisplay.selectedMessage) {
    return;
  }

  let view = gFolderDisplay.view.dbView;
  if (view) {
    view.reloadMessage();
  }
}

// Some of the per account junk mail settings have been
// converted to global prefs. Let's try to migrate some
// of those settings from the default account.
function MigrateJunkMailSettings() {
  var junkMailSettingsVersion = Services.prefs.getIntPref("mail.spam.version");
  if (!junkMailSettingsVersion) {
    // Get the default account, check to see if we have values for our
    // globally migrated prefs.
    let defaultAccount = accountManager.defaultAccount;
    if (defaultAccount) {
      // we only care about
      var prefix = "mail.server." + defaultAccount.incomingServer.key + ".";
      if (Services.prefs.prefHasUserValue(prefix + "manualMark")) {
        Services.prefs.setBoolPref(
          "mail.spam.manualMark",
          Services.prefs.getBoolPref(prefix + "manualMark")
        );
      }
      if (Services.prefs.prefHasUserValue(prefix + "manualMarkMode")) {
        Services.prefs.setIntPref(
          "mail.spam.manualMarkMode",
          Services.prefs.getIntPref(prefix + "manualMarkMode")
        );
      }
      if (Services.prefs.prefHasUserValue(prefix + "spamLoggingEnabled")) {
        Services.prefs.setBoolPref(
          "mail.spam.logging.enabled",
          Services.prefs.getBoolPref(prefix + "spamLoggingEnabled")
        );
      }
      if (Services.prefs.prefHasUserValue(prefix + "markAsReadOnSpam")) {
        Services.prefs.setBoolPref(
          "mail.spam.markAsReadOnSpam",
          Services.prefs.getBoolPref(prefix + "markAsReadOnSpam")
        );
      }
    }
    // bump the version so we don't bother doing this again.
    Services.prefs.setIntPref("mail.spam.version", 1);
  }
}

// The first time a user runs a build that supports folder views, pre-populate the favorite folders list
// with the existing INBOX folders.
function MigrateFolderViews() {
  var folderViewsVersion = Services.prefs.getIntPref(
    "mail.folder.views.version"
  );
  if (!folderViewsVersion) {
    for (let server of accountManager.allServers) {
      if (server) {
        let inbox = MailUtils.getInboxFolder(server);
        if (inbox) {
          inbox.setFlag(Ci.nsMsgFolderFlags.Favorite);
        }
      }
    }
    Services.prefs.setIntPref("mail.folder.views.version", 1);
  }
}

// Do a one-time migration of the old mailnews.reuse_message_window pref to the
// newer mail.openMessageBehavior. This does the migration only if the old pref
// is defined.
function MigrateOpenMessageBehavior() {
  let openMessageBehaviorVersion = Services.prefs.getIntPref(
    "mail.openMessageBehavior.version"
  );
  if (!openMessageBehaviorVersion) {
    // Don't touch this if it isn't defined
    if (
      Services.prefs.getPrefType("mailnews.reuse_message_window") ==
      Ci.nsIPrefBranch.PREF_BOOL
    ) {
      if (Services.prefs.getBoolPref("mailnews.reuse_message_window")) {
        Services.prefs.setIntPref(
          "mail.openMessageBehavior",
          MailConsts.OpenMessageBehavior.EXISTING_WINDOW
        );
      } else {
        Services.prefs.setIntPref(
          "mail.openMessageBehavior",
          MailConsts.OpenMessageBehavior.NEW_TAB
        );
      }
    }

    Services.prefs.setIntPref("mail.openMessageBehavior.version", 1);
  }
}

function ThreadPaneOnDragStart(aEvent) {
  if (aEvent.target.localName != "treechildren") {
    return;
  }

  let messageUris = gFolderDisplay.selectedMessageUris;
  if (!messageUris) {
    return;
  }

  gFolderDisplay.hintAboutToDeleteMessages();
  let messengerBundle = document.getElementById("bundle_messenger");
  let noSubjectString = messengerBundle.getString(
    "defaultSaveMessageAsFileName"
  );
  if (noSubjectString.endsWith(".eml")) {
    noSubjectString = noSubjectString.slice(0, -4);
  }
  let longSubjectTruncator = messengerBundle.getString(
    "longMsgSubjectTruncator"
  );
  // Clip the subject string to 124 chars to avoid problems on Windows,
  // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
  const maxUncutNameLength = 124;
  let maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
  let messages = new Map();
  for (let [index, msgUri] of messageUris.entries()) {
    let msgService = messenger.messageServiceFromURI(msgUri);
    let msgHdr = msgService.messageURIToMsgHdr(msgUri);
    let subject = msgHdr.mime2DecodedSubject || "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
      subject = "Re: " + subject;
    }

    let uniqueFileName;
    // If there is no subject, use a default name.
    // If subject needs to be truncated, add a truncation character to indicate it.
    if (!subject) {
      uniqueFileName = noSubjectString;
    } else {
      uniqueFileName =
        subject.length <= maxUncutNameLength
          ? subject
          : subject.substr(0, maxCutNameLength) + longSubjectTruncator;
    }
    let msgFileName = validateFileName(uniqueFileName);
    let msgFileNameLowerCase = msgFileName.toLocaleLowerCase();

    while (true) {
      if (!messages[msgFileNameLowerCase]) {
        messages[msgFileNameLowerCase] = 1;
        break;
      } else {
        let postfix = "-" + messages[msgFileNameLowerCase];
        messages[msgFileNameLowerCase]++;
        msgFileName = msgFileName + postfix;
        msgFileNameLowerCase = msgFileNameLowerCase + postfix;
      }
    }

    msgFileName = msgFileName + ".eml";

    let msgUrl = msgService.getUrlForUri(msgUri);

    aEvent.dataTransfer.mozSetDataAt("text/x-moz-message", msgUri, index);
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-url", msgUrl.spec, index);
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-url",
      msgUrl.spec + "?fileName=" + encodeURIComponent(msgFileName),
      index
    );
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise",
      new messageFlavorDataProvider(),
      index
    );
  }

  aEvent.dataTransfer.effectAllowed = "copyMove";
  aEvent.dataTransfer.addElement(aEvent.target);
}

function messageFlavorDataProvider() {}

messageFlavorDataProvider.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

  getFlavorData(aTransferable, aFlavor, aData) {
    if (aFlavor !== "application/x-moz-file-promise") {
      return;
    }
    let fileUriPrimitive = {};
    aTransferable.getTransferData(
      "application/x-moz-file-promise-url",
      fileUriPrimitive
    );

    let fileUriStr = fileUriPrimitive.value.QueryInterface(
      Ci.nsISupportsString
    );
    let fileUri = Services.io.newURI(fileUriStr.data);
    let fileUrl = fileUri.QueryInterface(Ci.nsIURL);
    let fileName = fileUrl.fileName;

    let destDirPrimitive = {};
    aTransferable.getTransferData(
      "application/x-moz-file-promise-dir",
      destDirPrimitive
    );
    let destDirectory = destDirPrimitive.value.QueryInterface(Ci.nsIFile);
    let file = destDirectory.clone();
    file.append(fileName);

    let messageUriPrimitive = {};
    aTransferable.getTransferData("text/x-moz-message", messageUriPrimitive);
    let messageUri = messageUriPrimitive.value.QueryInterface(
      Ci.nsISupportsString
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

/**
 * Returns a new filename that is guaranteed to not be in the Set
 * of existing names.
 *
 * Example use:
 *   suggestUniqueFileName("testname", ".txt", new Set("testname", "testname1"))
 *   returns "testname2.txt"
 * Does not check file system for existing files.
 *
 * @param aIdentifier     proposed filename
 * @param aType           extension
 * @param aExistingNames  a Set of names already in use
 */
function suggestUniqueFileName(aIdentifier, aType, aExistingNames) {
  let suffix = 1;
  let base = validateFileName(aIdentifier);
  let suggestion = base + aType;
  while (true) {
    if (!aExistingNames.has(suggestion)) {
      break;
    }

    suggestion = base + suffix + aType;
    suffix++;
  }

  return suggestion;
}

function ThreadPaneOnDragOver(aEvent) {
  let ds = Cc["@mozilla.org/widget/dragservice;1"]
    .getService(Ci.nsIDragService)
    .getCurrentSession();
  ds.canDrop = false;
  if (!gFolderDisplay.displayedFolder.canFileMessages) {
    return;
  }

  let dt = aEvent.dataTransfer;
  if (Array.from(dt.mozTypesAt(0)).includes("application/x-moz-file")) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", 0);
    if (!extFile) {
      return;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
        ds.canDrop = true;
      }
    }
  }
}

function ThreadPaneOnDrop(aEvent) {
  let dt = aEvent.dataTransfer;
  for (let i = 0; i < dt.mozItemCount; i++) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", i);
    if (!extFile) {
      continue;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
        MailServices.copy.copyFileMessage(
          extFile,
          gFolderDisplay.displayedFolder,
          null,
          false,
          1,
          "",
          null,
          msgWindow
        );
      }
    }
  }
}

var TabsInTitlebar = {
  init() {
    this._readPref();
    Services.prefs.addObserver(this._drawInTitlePref, this);
    Services.prefs.addObserver(this._autoHidePref, this);

    // We need to update the appearance of the titlebar when the menu changes
    // from the active to the inactive state. We can't, however, rely on
    // DOMMenuBarInactive, because the menu fires this event and then removes
    // the inactive attribute after an event-loop spin.
    //
    // Because updating the appearance involves sampling the heights and margins
    // of various elements, it's important that the layout be more or less
    // settled before updating the titlebar. So instead of listening to
    // DOMMenuBarActive and DOMMenuBarInactive, we use a MutationObserver to
    // watch the "invalid" attribute directly.
    let menu = document.getElementById("mail-toolbar-menubar2");
    this._menuObserver = new MutationObserver(this._onMenuMutate);
    this._menuObserver.observe(menu, { attributes: true });

    let sizeMode = document.getElementById("messengerWindow");
    this._sizeModeObserver = new MutationObserver(this._onSizeModeMutate);
    this._sizeModeObserver.observe(sizeMode, { attributes: true });

    window.addEventListener("resolutionchange", this);
    window.addEventListener("resize", this);

    gDragSpaceObserver.init();

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
        if (window.fullScreen || aEvent.target != window) {
          break;
        }
        // We use resize events because the window is not ready after
        // sizemodechange events. However, we only care about the event when
        // the sizemode is different from the last time we updated the
        // appearance of the tabs in the titlebar.
        let sizemode = document.documentElement.getAttribute("sizemode");
        if (this._lastSizeMode == sizemode) {
          break;
        }
        let oldSizeMode = this._lastSizeMode;
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

  _onMenuMutate(aMutations) {
    for (let mutation of aMutations) {
      if (
        mutation.attributeName == "inactive" ||
        mutation.attributeName == "autohide"
      ) {
        TabsInTitlebar.update();
        return;
      }
    }
  },

  _onSizeModeMutate(aMutations) {
    for (let mutation of aMutations) {
      if (mutation.attributeName == "sizemode") {
        TabsInTitlebar.update();
        return;
      }
    }
  },

  _initialized: false,
  _disallowed: {},
  _drawInTitlePref: "mail.tabs.drawInTitlebar",
  _autoHidePref: "mail.tabs.autoHide",
  _lastSizeMode: null,

  _readPref() {
    // check is only true when drawInTitlebar=true and autoHide=false
    let check =
      Services.prefs.getBoolPref(this._drawInTitlePref) &&
      !Services.prefs.getBoolPref(this._autoHidePref);
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

    this._layOutTitlebar(allowed);
  },

  _layOutTitlebar(drawInTitlebar) {
    let $ = id => document.getElementById(id);
    let rect = ele => ele.getBoundingClientRect();
    let verticalMargins = cstyle =>
      parseFloat(cstyle.marginBottom) + parseFloat(cstyle.marginTop);

    let titlebar = $("titlebar");
    let menubar = $("mail-toolbar-menubar2");

    // Calculate the LW-backgroundBox height to place the images correctly.
    let root = $("messengerWindow");
    let bgBox = $("LW-background-box");
    if (root.getAttribute("lwtheme")) {
      let bgBoxHeight =
        rect($("navigation-toolbox")).height + rect($("mail-toolbox")).height;
      bgBox.style.height = bgBoxHeight + "px";
    } else {
      bgBox.style.removeProperty("height");
    }

    if (!drawInTitlebar) {
      // Reset styles that might have been modified:
      titlebar.style.marginBottom = "";
      menubar.style.paddingBottom = "";
      return;
    }

    let titlebarContent = $("titlebar-content");
    let titlebarButtons = $("titlebar-buttonbox");

    // Reset the custom titlebar height if the menubar is shown,
    // because we will want to calculate its original height.
    let buttonsShouldMatchTabHeight =
      AppConstants.isPlatformAndVersionAtLeast("win", "10.0") ||
      AppConstants.platform == "linux";
    if (
      buttonsShouldMatchTabHeight &&
      (menubar.getAttribute("inactive") != "true" ||
        menubar.getAttribute("autohide") != "true")
    ) {
      titlebarButtons.style.removeProperty("height");
    }

    // Try to avoid reflows in this code by calculating dimensions first and
    // then later set the properties affecting layout together in a batch.

    // Get the height of the tabs toolbar:
    let fullTabsHeight = rect($("tabs-toolbar")).height;

    // Buttons first:
    let captionButtonsBoxWidth = rect(titlebarButtons).width;

    let menuHeight, fullMenuHeight, menuStyles;
    if (AppConstants.platform == "macosx") {
      // No need to look up the menubar stuff on OS X:
      menuHeight = 0;
      fullMenuHeight = 0;
    } else {
      // Otherwise, get the height and margins separately for the menubar
      menuHeight = rect(menubar).height;
      menuStyles = window.getComputedStyle(menubar);
      fullMenuHeight = verticalMargins(menuStyles) + menuHeight;
    }

    // And get the height of what's in the titlebar:
    let titlebarContentHeight = rect(titlebarContent).height;

    // Begin setting CSS properties which will cause a reflow

    // Adjust the window controls to span the entire
    // tab strip height if we're not showing a menu bar.
    if (buttonsShouldMatchTabHeight && !menuHeight) {
      titlebarContentHeight = fullTabsHeight;
      titlebarButtons.style.height = titlebarContentHeight + "px";
    }

    // If the menubar is around (menuHeight is non-zero), try to adjust
    // its full height (i.e. including margins) to match the titlebar,
    // by changing the menubar's bottom padding
    if (menuHeight) {
      // Calculate the difference between the titlebar's height and that of the menubar
      let menuTitlebarDelta = titlebarContentHeight - fullMenuHeight;
      let paddingBottom;
      // The titlebar is bigger:
      if (menuTitlebarDelta > 0) {
        fullMenuHeight += menuTitlebarDelta;
        // If there is already padding on the menubar, we need to add that
        // to the difference so the total padding is correct:
        if ((paddingBottom = menuStyles.paddingBottom)) {
          menuTitlebarDelta += parseFloat(paddingBottom);
        }
        menubar.style.paddingBottom = menuTitlebarDelta + "px";
        // The menubar is bigger, but has bottom padding we can remove:
      } else if (
        menuTitlebarDelta < 0 &&
        (paddingBottom = menuStyles.paddingBottom)
      ) {
        let existingPadding = parseFloat(paddingBottom);
        // menuTitlebarDelta is negative; work out what's left, but don't set negative padding:
        let desiredPadding = Math.max(0, existingPadding + menuTitlebarDelta);
        menubar.style.paddingBottom = desiredPadding + "px";
        // We've changed the menu height now:
        fullMenuHeight += desiredPadding - existingPadding;
      }
    }

    // Next, we calculate how much we need to stretch the titlebar down to
    // go all the way to the bottom of the tab strip, if necessary.
    let tabAndMenuHeight = fullTabsHeight + fullMenuHeight;

    if (tabAndMenuHeight > titlebarContentHeight) {
      // We need to increase the titlebar content's outer height (ie including margins)
      // to match the tab and menu height:
      let extraMargin = tabAndMenuHeight - titlebarContentHeight;
      if (AppConstants.platform != "macosx") {
        titlebarContent.style.marginBottom = extraMargin + "px";
      }

      titlebarContentHeight += extraMargin;
    } else {
      titlebarContent.style.removeProperty("margin-bottom");
    }

    // Then add a negative margin to the titlebar, so that the following elements
    // will overlap it by the greater of the titlebar height or the tabstrip+menu.
    let maxTitlebarOrTabsHeight = Math.max(
      titlebarContentHeight,
      tabAndMenuHeight
    );
    titlebar.style.marginBottom = "-" + maxTitlebarOrTabsHeight + "px";

    // Finally, size the placeholders:
    this._sizePlaceholder("caption-buttons", captionButtonsBoxWidth);
  },

  _sizePlaceholder(type, width) {
    document
      .querySelectorAll(".titlebar-placeholder[type='" + type + "']")
      .forEach(function(node) {
        node.style.width = width + "px";
      });
  },

  uninit() {
    this._initialized = false;
    gDragSpaceObserver.uninit();
    Services.prefs.removeObserver(this._drawInTitlePref, this);
    Services.prefs.removeObserver(this._autoHidePref, this);
    this._menuObserver.disconnect();
  },
};

/* Draw */
function onTitlebarMaxClick() {
  if (window.windowState == window.STATE_MAXIMIZED) {
    window.restore();
  } else {
    window.maximize();
  }
}

// Adds additional drag space to the window by listening to
// the corresponding preference.
var gDragSpaceObserver = {
  pref: "mail.tabs.extraDragSpace",

  init() {
    Services.prefs.addObserver(this.pref, this);
    this.observe();
  },

  uninit() {
    Services.prefs.removeObserver(this.pref, this);
  },

  observe() {
    if (Services.prefs.getBoolPref(this.pref)) {
      document.documentElement.setAttribute("extradragspace", "true");
    } else {
      document.documentElement.removeAttribute("extradragspace");
    }
    TabsInTitlebar.update();
  },
};

var BrowserAddonUI = {
  async promptRemoveExtension(addon) {
    let { name } = addon;
    let [title, btnTitle] = await document.l10n.formatValues([
      {
        id: "addon-removal-title",
        args: { name },
      },
      {
        id: "addon-removal-confirmation-button",
      },
    ]);
    let {
      BUTTON_TITLE_IS_STRING: titleString,
      BUTTON_TITLE_CANCEL: titleCancel,
      BUTTON_POS_0,
      BUTTON_POS_1,
      confirmEx,
    } = Services.prompt;
    let btnFlags = BUTTON_POS_0 * titleString + BUTTON_POS_1 * titleCancel;
    let message = null;

    if (!Services.prefs.getBoolPref("prompts.windowPromptSubDialog", false)) {
      message = await document.l10n.formatValue(
        "addon-removal-confirmation-message",
        {
          name,
        }
      );
    }

    let checkboxState = { value: false };
    let result = confirmEx(
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
    let addon = addonId && (await AddonManager.getAddonByID(addonId));
    if (!addon || !(addon.permissions & AddonManager.PERM_CAN_UNINSTALL)) {
      return;
    }

    let { remove, report } = await this.promptRemoveExtension(addon);

    if (remove) {
      await addon.uninstall(report);
    }
  },
};
