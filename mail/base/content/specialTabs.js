/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, openOptionsDialog */

/* import-globals-from utilityOverlay.js */

/* globals ZoomManager */ // From viewZoomOverlay.js
/* globals PrintUtils */ // From printUtils.js

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

function tabProgressListener(aTab, aStartsBlank) {
  this.mTab = aTab;
  this.mBrowser = aTab.browser;
  this.mBlank = aStartsBlank;
  this.mProgressListener = null;
}

tabProgressListener.prototype = {
  mTab: null,
  mBrowser: null,
  mBlank: null,
  mProgressListener: null,

  // cache flags for correct status bar update after tab switching
  mStateFlags: 0,
  mStatus: 0,
  mMessage: "",

  // count of open requests (should always be 0 or 1)
  mRequestCount: 0,

  addProgressListener(aProgressListener) {
    this.mProgressListener = aProgressListener;
  },

  onProgressChange(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {
    if (this.mProgressListener) {
      this.mProgressListener.onProgressChange(
        aWebProgress,
        aRequest,
        aCurSelfProgress,
        aMaxSelfProgress,
        aCurTotalProgress,
        aMaxTotalProgress
      );
    }
  },
  onProgressChange64(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {
    if (this.mProgressListener) {
      this.mProgressListener.onProgressChange64(
        aWebProgress,
        aRequest,
        aCurSelfProgress,
        aMaxSelfProgress,
        aCurTotalProgress,
        aMaxTotalProgress
      );
    }
  },
  onLocationChange(aWebProgress, aRequest, aLocationURI, aFlags) {
    if (this.mProgressListener) {
      this.mProgressListener.onLocationChange(
        aWebProgress,
        aRequest,
        aLocationURI,
        aFlags
      );
    }
    // onLocationChange is called for both the top-level content
    // and the subframes.
    if (aWebProgress.isTopLevel) {
      // Don't clear the favicon if this onLocationChange was triggered
      // by a pushState or a replaceState. See bug 550565.
      if (
        aWebProgress.isLoadingDocument &&
        !(aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_PUSHSTATE) &&
        !(aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)
      ) {
        this.mTab.favIconUrl = null;
      }

      var location = aLocationURI ? aLocationURI.spec : "";
      if (aLocationURI && !aLocationURI.schemeIs("about")) {
        this.mTab.backButton.disabled = !this.mBrowser.canGoBack;
        this.mTab.forwardButton.disabled = !this.mBrowser.canGoForward;
        this.mTab.urlbar.value = location;
        this.mTab.root.removeAttribute("collapsed");
      } else {
        this.mTab.root.setAttribute("collapsed", "false");
      }

      // Although we're unlikely to be loading about:blank, we'll check it
      // anyway just in case. The second condition is for new tabs, otherwise
      // the reload function is enabled until tab is refreshed.
      this.mTab.reloadEnabled = !(
        (location == "about:blank" && !this.mBrowser.browsingContext.opener) ||
        location == ""
      );
    }
  },
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (this.mProgressListener) {
      this.mProgressListener.onStateChange(
        aWebProgress,
        aRequest,
        aStateFlags,
        aStatus
      );
    }

    if (!aRequest) {
      return;
    }

    const tabmail = document.getElementById("tabmail");

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      this.mRequestCount++;
    } else if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      // Since we (try to) only handle STATE_STOP of the last request,
      // the count of open requests should now be 0.
      this.mRequestCount = 0;
    }

    if (
      aStateFlags & Ci.nsIWebProgressListener.STATE_START &&
      aStateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK
    ) {
      if (!this.mBlank) {
        this.mTab.title = specialTabs.contentTabType.loadingTabString;
        this.mTab.securityIcon.setLoading(true);
        tabmail.setTabBusy(this.mTab, true);
        tabmail.setTabTitle(this.mTab);
      }

      // Set our unit testing variables accordingly
      this.mTab.pageLoading = true;
      this.mTab.pageLoaded = false;
    } else if (
      aStateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
      aStateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK
    ) {
      this.mBlank = false;
      this.mTab.securityIcon.setLoading(false);
      tabmail.setTabBusy(this.mTab, false);
      this.mTab.title = this.mTab.browser.contentTitle;
      tabmail.setTabTitle(this.mTab);

      // Set our unit testing variables accordingly
      this.mTab.pageLoading = false;
      this.mTab.pageLoaded = true;

      // If we've finished loading, and we've not had an icon loaded from a
      // link element, then we try using the default icon for the site.
      if (aWebProgress.isTopLevel && !this.mTab.favIconUrl) {
        specialTabs.useDefaultFavIcon(this.mTab);
      }
    }
  },
  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    if (this.mProgressListener) {
      this.mProgressListener.onStatusChange(
        aWebProgress,
        aRequest,
        aStatus,
        aMessage
      );
    }
  },
  onSecurityChange(aWebProgress, aRequest, aState) {
    if (this.mProgressListener) {
      this.mProgressListener.onSecurityChange(aWebProgress, aRequest, aState);
    }

    const wpl = Ci.nsIWebProgressListener;
    const wpl_security_bits =
      wpl.STATE_IS_SECURE | wpl.STATE_IS_BROKEN | wpl.STATE_IS_INSECURE;
    let level = "";
    switch (aState & wpl_security_bits) {
      case wpl.STATE_IS_SECURE:
        level = "high";
        break;
      case wpl.STATE_IS_BROKEN:
        level = "broken";
        break;
    }
    this.mTab.securityIcon.setSecurityLevel(level);
  },
  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {
    if (this.mProgressListener) {
      this.mProgressListener.onContentBlockingEvent(
        aWebProgress,
        aRequest,
        aEvent
      );
    }
  },
  onRefreshAttempted(aWebProgress, aURI, aDelay, aSameURI) {
    if (this.mProgressListener) {
      return this.mProgressListener.onRefreshAttempted(
        aWebProgress,
        aURI,
        aDelay,
        aSameURI
      );
    }
    return true;
  },
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsIWebProgressListener2",
    "nsISupportsWeakReference",
  ]),
};

/**
 * Handles tab icons for parent process browsers. The DOMLinkAdded event won't
 * fire for child process browsers, that is handled by LinkHandlerParent.
 */
var DOMLinkHandler = {
  handleEvent(event) {
    switch (event.type) {
      case "DOMLinkAdded":
      case "DOMLinkChanged":
        this.onLinkAdded(event);
        break;
    }
  },
  onLinkAdded(event) {
    const link = event.target;
    const rel = link.rel && link.rel.toLowerCase();
    if (!link || !link.ownerDocument || !rel || !link.href) {
      return;
    }

    if (rel.split(/\s+/).includes("icon")) {
      if (!Services.prefs.getBoolPref("browser.chrome.site_icons")) {
        return;
      }

      const targetDoc = link.ownerDocument;

      const uri = Services.io.newURI(link.href, targetDoc.characterSet);

      // Verify that the load of this icon is legal.
      // Some error or special pages can load their favicon.
      // To be on the safe side, only allow chrome:// favicons.
      const isAllowedPage =
        targetDoc.documentURI == "about:home" ||
        ["about:neterror?", "about:blocked?", "about:certerror?"].some(
          function (aStart) {
            targetDoc.documentURI.startsWith(aStart);
          }
        );

      if (!isAllowedPage || !uri.schemeIs("chrome")) {
        // Be extra paraniod and just make sure we're not going to load
        // something we shouldn't. Firefox does this, so we're doing the same.
        try {
          Services.scriptSecurityManager.checkLoadURIWithPrincipal(
            targetDoc.nodePrincipal,
            uri,
            Ci.nsIScriptSecurityManager.DISALLOW_SCRIPT
          );
        } catch (ex) {
          return;
        }
      }

      try {
        var contentPolicy = Cc[
          "@mozilla.org/layout/content-policy;1"
        ].getService(Ci.nsIContentPolicy);
      } catch (e) {
        // Refuse to load if we can't do a security check.
        return;
      }

      // Security says okay, now ask content policy. This is probably trying to
      // ensure that the image loaded always obeys the content policy. There
      // may have been a chance that it was cached and we're trying to load it
      // direct from the cache and not the normal route.
      const { NetUtil } = ChromeUtils.importESModule(
        "resource://gre/modules/NetUtil.sys.mjs"
      );
      const tmpChannel = NetUtil.newChannel({
        uri,
        loadingNode: targetDoc,
        securityFlags: Ci.nsILoadInfo.SEC_ONLY_FOR_EXPLICIT_CONTENTSEC_CHECK,
        contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
      });
      const tmpLoadInfo = tmpChannel.loadInfo;
      if (
        contentPolicy.shouldLoad(uri, tmpLoadInfo, link.type) !=
        Ci.nsIContentPolicy.ACCEPT
      ) {
        return;
      }

      const tab = document
        .getElementById("tabmail")
        .getBrowserForDocument(targetDoc.defaultView);

      // If we don't have a browser/tab, then don't load the icon.
      if (!tab) {
        return;
      }

      // Just set the url on the browser and we'll display the actual icon
      // when we finish loading the page.
      specialTabs.setFavIcon(tab, link.href);
    }
  },
};

var contentTabBaseType = {
  // List of URLs that will receive special treatment when opened in a tab.
  // Note that about:preferences is loaded via a different mechanism.
  inContentWhitelist: [
    "about:addons",
    "about:addressbook",
    "about:blank",
    "about:profiles",
    "about:*",
  ],

  // Code to run if a particular document is loaded in a tab.
  // The array members (functions) are for the respective document URLs
  // as specified in inContentWhitelist.
  inContentOverlays: [
    // about:addons
    function (aDocument) {
      Services.scriptloader.loadSubScript(
        "chrome://messenger/content/aboutAddonsExtra.js",
        aDocument.defaultView
      );
    },

    // about:addressbook provides its own context menu.
    function (aDocument, aTab) {
      aTab.browser.removeAttribute("context");
    },

    // Let's not mess with about:blank.
    null,

    // about:profiles
    function (aDocument) {
      const win = aDocument.defaultView;
      // Need a timeout to let the script run to create the needed buttons.
      win.setTimeout(() => {
        win.MozXULElement.insertFTLIfNeeded("messenger/aboutProfilesExtra.ftl");
        for (const button of aDocument.querySelectorAll(
          `[data-l10n-id="profiles-launch-profile"]`
        )) {
          win.document.l10n.setAttributes(
            button,
            "profiles-launch-profile-plain"
          );
        }
      }, 500);
    },

    // Other about:* pages.
    function (aDocument, aTab) {
      // Provide context menu for about:* pages.
      aTab.browser.setAttribute("context", "aboutPagesContext");
    },
  ],

  shouldSwitchTo({ url, duplicate }) {
    if (duplicate) {
      return -1;
    }

    const tabmail = document.getElementById("tabmail");
    const tabInfo = tabmail.tabInfo;
    let uri;

    try {
      uri = Services.io.newURI(url);
    } catch (ex) {
      return -1;
    }

    for (
      let selectedIndex = 0;
      selectedIndex < tabInfo.length;
      ++selectedIndex
    ) {
      // Reuse the same tab, if only the anchors differ - especially for the
      // about: pages, we just want to re-use the same tab.
      if (
        tabInfo[selectedIndex].mode.name == this.name &&
        tabInfo[selectedIndex].browser.currentURI?.specIgnoringRef ==
          uri.specIgnoringRef
      ) {
        // Go to the correct location on the page, but only if it's not the
        // current location. This should NOT cause the page to reload.
        if (tabInfo[selectedIndex].browser.currentURI.spec != uri.spec) {
          MailE10SUtils.loadURI(tabInfo[selectedIndex].browser, uri.spec);
        }
        return selectedIndex;
      }
    }
    return -1;
  },

  closeTab(aTab) {
    aTab.browser.removeEventListener(
      "pagetitlechanged",
      aTab.titleListener,
      true
    );
    aTab.browser.removeEventListener(
      "DOMWindowClose",
      aTab.closeListener,
      true
    );
    aTab.browser.removeEventListener("DOMLinkAdded", DOMLinkHandler);
    aTab.browser.removeEventListener("DOMLinkChanged", DOMLinkHandler);
    aTab.browser.webProgress.removeProgressListener(aTab.filter);
    aTab.filter.removeProgressListener(aTab.progressListener);
    aTab.browser.destroy();
  },

  saveTabState(aTab) {
    aTab.browser.setAttribute("type", "content");
    aTab.browser.removeAttribute("primary");
  },

  showTab(aTab) {
    aTab.browser.setAttribute("type", "content");
    aTab.browser.setAttribute("primary", "true");
    if (aTab.browser.currentURI.spec.startsWith("about:preferences")) {
      aTab.browser.contentDocument.documentElement.focus();
    }
  },

  getBrowser(aTab) {
    return aTab.browser;
  },

  _setUpLoadListener(aTab) {
    const self = this;

    function onLoad(aEvent) {
      const doc = aEvent.target;
      const url = doc.defaultView.location.href;

      // If this document has an overlay defined, run it now.
      let ind = self.inContentWhitelist.indexOf(url);
      if (ind < 0) {
        // Try a wildcard.
        ind = self.inContentWhitelist.indexOf(url.replace(/:.*/, ":*"));
      }
      if (ind >= 0) {
        const overlayFunction = self.inContentOverlays[ind];
        if (overlayFunction) {
          overlayFunction(doc, aTab);
        }
      }
    }

    aTab.loadListener = onLoad;
    aTab.browser.addEventListener("load", aTab.loadListener, true);
  },

  // Internal function used to set up the title listener on a content tab.
  _setUpTitleListener(aTab) {
    function onDOMTitleChanged() {
      aTab.title = aTab.browser.contentTitle;
      document.getElementById("tabmail").setTabTitle(aTab);
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.titleListener = onDOMTitleChanged;
    // Add the listener.
    aTab.browser.addEventListener("pagetitlechanged", aTab.titleListener, true);
  },

  /**
   * Internal function used to set up the close window listener on a content
   * tab.
   */
  _setUpCloseWindowListener(aTab) {
    function onDOMWindowClose(aEvent) {
      if (!aEvent.isTrusted) {
        return;
      }

      // Redirect any window.close events to closing the tab. As a 3-pane tab
      // must be open, we don't need to worry about being the last tab open.
      document.getElementById("tabmail").closeTab(aTab);
      aEvent.preventDefault();
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.closeListener = onDOMWindowClose;
    // Add the listener.
    aTab.browser.addEventListener("DOMWindowClose", aTab.closeListener, true);
  },

  supportsCommand(aCommand) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_print":
      case "button_print":
      case "cmd_stop":
      case "cmd_reload":
      case "Browser:Back":
      case "Browser:Forward":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
        return true;
      case "cmd_print":
      case "button_print": {
        const uri = aTab.browser?.currentURI;
        if (!uri || !uri.schemeIs("about")) {
          return true;
        }
        return [
          "addressbook",
          "certificate",
          "crashes",
          "credits",
          "license",
          "profiles",
          "support",
          "telemetry",
        ].includes(uri.filePath);
      }
      case "cmd_reload":
        return aTab.reloadEnabled;
      case "cmd_stop":
        return aTab.busy;
      case "Browser:Back":
        return aTab.browser?.canGoBack;
      case "Browser:Forward":
        return aTab.browser?.canGoForward;
      default:
        return false;
    }
  },

  doCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_find":
        aTab.findbar.onFindCommand();
        break;
      case "cmd_findAgain":
        aTab.findbar.onFindAgainCommand(false);
        break;
      case "cmd_findPrevious":
        aTab.findbar.onFindAgainCommand(true);
        break;
      case "cmd_print":
        PrintUtils.startPrintWindow(this.getBrowser(aTab).browsingContext, {});
        break;
      case "cmd_stop":
        aTab.browser.stop();
        break;
      case "cmd_reload":
        aTab.browser.reload();
        break;
      case "Browser:Back":
        specialTabs.browserBack();
        break;
      case "Browser:Forward":
        specialTabs.browserForward();
        break;
    }
  },
};

/**
 * Class that wraps the content page loading/security icon.
 */
// Ideally, this could be moved into a sub-class for content tabs.
class SecurityIcon {
  constructor(icon) {
    this.icon = icon;
    this.loading = false;
    this.securityLevel = "";
    this.updateIcon();
  }

  /**
   * Set whether the page is loading.
   *
   * @param {boolean} loading - Whether the page is loading.
   */
  setLoading(loading) {
    if (this.loading !== loading) {
      this.loading = loading;
      this.updateIcon();
    }
  }

  /**
   * Set the security level of the page.
   *
   * @param {"high"|"broken"|""} - The security level for the page, or empty if
   *   it is to be ignored.
   */
  setSecurityLevel(securityLevel) {
    if (this.securityLevel !== securityLevel) {
      this.securityLevel = securityLevel;
      this.updateIcon();
    }
  }

  updateIcon() {
    let src;
    let srcSet;
    let l10nId;
    let secure = false;
    if (this.loading) {
      src = "chrome://messenger/skin/icons/spinning.svg";
      l10nId = "content-tab-page-loading-icon";
    } else {
      switch (this.securityLevel) {
        case "high":
          secure = true;
          src = "chrome://messenger/skin/icons/connection-secure.svg";
          l10nId = "content-tab-security-high-icon";
          break;
        case "broken":
          src = "chrome://messenger/skin/icons/connection-insecure.svg";
          l10nId = "content-tab-security-broken-icon";
          break;
      }
    }
    if (srcSet) {
      this.icon.setAttribute("srcset", srcSet);
    } else {
      this.icon.removeAttribute("srcset");
    }
    if (src) {
      this.icon.setAttribute("src", src);
      // Set alt.
      document.l10n.setAttributes(this.icon, l10nId);
    } else {
      this.icon.removeAttribute("src");
      this.icon.removeAttribute("data-l10n-id");
      this.icon.removeAttribute("alt");
    }
    this.icon.classList.toggle("secure-connection-icon", secure);
  }
}

var specialTabs = {
  _kAboutRightsVersion: 1,
  get _protocolSvc() {
    delete this._protocolSvc;
    return (this._protocolSvc = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService));
  },

  get msgNotificationBar() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document
          .getElementById("messenger-notification-bottom")
          .append(element);
      });
    }
    return this._notificationBox;
  },

  // This will open any special tabs if necessary on startup.
  openSpecialTabsOnStartup() {
    const tabmail = document.getElementById("tabmail");

    tabmail.registerTabType(this.contentTabType);

    this.showWhatsNewPage();

    // Show the about rights notification if we need to.
    if (this.shouldShowAboutRightsNotification()) {
      this.showAboutRightsNotification();
    }
    if (this.shouldShowPolicyNotification()) {
      // Do it on a timeout to workaround that open in background do not work when called too early.
      setTimeout(this.showPolicyNotification, 10000);
    }
  },

  /**
   * A tab to show content pages.
   */
  contentTabType: {
    __proto__: contentTabBaseType,
    name: "contentTab",
    perTabPanel: "vbox",
    lastBrowserId: 0,
    get loadingTabString() {
      delete this.loadingTabString;
      return (this.loadingTabString = document
        .getElementById("bundle_messenger")
        .getString("loadingTab"));
    },

    modes: {
      contentTab: {
        type: "contentTab",
      },
    },

    /**
     * This is the internal function used by content tabs to open a new tab. To
     * open a contentTab, use specialTabs.openTab("contentTab", aArgs)
     *
     * @param {object} aArgs - The options that content tabs accept.
     * @param {string} aArgs.url - The URL that is to be opened
     * @param {nsIOpenWindowInfo} [aArgs.openWindowInfo] - The opener window
     * @param {"single-site"|"single-page"|null} [aArgs.linkHandler="single-site"]
     *     Restricts navigation in the browser to be opened:
     *     - "single-site" allows only URLs in the same domain as
     *     aArgs.url (including subdomains).
     *     - "single-page" allows only URLs matching aArgs.url.
     *     - `null` applies no such restrictions.
     *     All other links are sent to an external browser.
     * @param {Function} [aArgs.onLoad] - A function that takes an Event and a
     *     DOMNode. It is called when the content page is done loading. The
     *     first argument is the load event, and the second argument is the
     *     xul:browser that holds the page. You can access the inner tab's
     *     window object by accessing the second parameter's contentWindow
     *     property.
     */
    openTab(aTab, aArgs) {
      if (!("url" in aArgs)) {
        throw new Error("url must be specified");
      }

      // First clone the page and set up the basics.
      const clone = document
        .getElementById("contentTab")
        .firstElementChild.cloneNode(true);

      clone.setAttribute("id", "contentTab" + this.lastBrowserId);
      clone.setAttribute("collapsed", false);

      const toolbox = clone.firstElementChild;
      toolbox.setAttribute("id", "contentTabToolbox" + this.lastBrowserId);
      toolbox.firstElementChild.setAttribute(
        "id",
        "contentTabToolbar" + this.lastBrowserId
      );

      aTab.linkedBrowser = aTab.browser = document.createXULElement("browser");
      aTab.browser.setAttribute("id", "contentTabBrowser" + this.lastBrowserId);
      aTab.browser.setAttribute("type", "content");
      aTab.browser.setAttribute("manualactiveness", "true");
      aTab.browser.setAttribute("flex", "1");
      aTab.browser.setAttribute("autocompletepopup", "PopupAutoComplete");
      aTab.browser.setAttribute("context", "browserContext");
      aTab.browser.setAttribute("maychangeremoteness", "true");
      aTab.browser.setAttribute("onclick", "return contentAreaClick(event);");
      aTab.browser.openWindowInfo = aArgs.openWindowInfo || null;
      clone.querySelector("stack").appendChild(aTab.browser);

      if (aArgs.skipLoad) {
        clone.querySelector("browser").setAttribute("nodefaultsrc", "true");
        // If a new tab is opened via a click on a link with target="_blank", we
        // get here via createContentWindowInFrame(). The remoteness must be set
        // before aTab.panel.appendChild(clone), otherwise the browser will get
        // a docShell, which runs into a MOZ_ASSERT later (see Bug 1770105).
        // We must ensure the context is a parent window that is already
        // marked as remote (see Bug 1843741)
        if (aArgs.openWindowInfo?.isRemote) {
          aTab.browser.setAttribute("remote", "true");
        }
      }
      if (aArgs.userContextId) {
        aTab.browser.setAttribute("usercontextid", aArgs.userContextId);
      }

      // Ensure the browser will initially load in the same group as other
      // browsers from the same extension.
      if (aArgs.initialBrowsingContextGroupId) {
        aTab.browser.setAttribute(
          "initialBrowsingContextGroupId",
          aArgs.initialBrowsingContextGroupId
        );
      }

      aTab.panel.setAttribute("id", "contentTabWrapper" + this.lastBrowserId);
      aTab.panel.appendChild(clone);
      aTab.root = clone;

      ExtensionParent.apiManager.emit(
        "extension-browser-inserted",
        aTab.browser
      );

      // For pdf.js use the aboutPagesContext context menu.
      if (aArgs.url.includes("type=application/pdf")) {
        aTab.browser.setAttribute("context", "aboutPagesContext");
      }

      // Start setting up the browser.
      aTab.toolbar = aTab.panel.querySelector(".contentTabToolbar");
      aTab.backButton = aTab.toolbar.querySelector(".back-btn");
      aTab.backButton.addEventListener("command", () => aTab.browser.goBack());
      aTab.forwardButton = aTab.toolbar.querySelector(".forward-btn");
      aTab.forwardButton.addEventListener("command", () =>
        aTab.browser.goForward()
      );
      aTab.securityIcon = new SecurityIcon(
        aTab.toolbar.querySelector(".contentTabSecurity")
      );
      aTab.urlbar = aTab.toolbar.querySelector(".contentTabUrlInput");
      aTab.urlbar.value = aArgs.url;

      // As we're opening this tab, showTab may not get called, so set
      // the type according to if we're opening in background or not.
      const background = "background" in aArgs && aArgs.background;
      if (background) {
        aTab.browser.removeAttribute("primary");
      } else {
        aTab.browser.setAttribute("primary", "true");
      }

      if (aArgs.linkHandler == "single-page") {
        aTab.browser.setAttribute("messagemanagergroup", "single-page");
      } else if (aArgs.linkHandler === null) {
        aTab.browser.setAttribute("messagemanagergroup", "browsers");
      } else {
        aTab.browser.setAttribute("messagemanagergroup", "single-site");
      }

      aTab.browser.addEventListener("DOMLinkAdded", DOMLinkHandler);
      aTab.browser.addEventListener("DOMLinkChanged", DOMLinkHandler);

      // Now initialise the find bar.
      aTab.findbar = document.createXULElement("findbar");
      aTab.findbar.setAttribute(
        "browserid",
        "contentTabBrowser" + this.lastBrowserId
      );
      clone.appendChild(aTab.findbar);

      // Default to reload being disabled.
      aTab.reloadEnabled = false;

      // Now set up the listeners.
      this._setUpLoadListener(aTab);
      this._setUpTitleListener(aTab);
      this._setUpCloseWindowListener(aTab);

      /**
       * Override the browser custom element's version, which returns gBrowser.
       */
      aTab.browser.getTabBrowser = function () {
        return document.getElementById("tabmail");
      };

      if ("onLoad" in aArgs) {
        aTab.browser.addEventListener(
          "load",
          function _contentTab_onLoad(event) {
            aArgs.onLoad(event, aTab.browser);
            aTab.browser.removeEventListener("load", _contentTab_onLoad, true);
          },
          true
        );
      }

      // Create a filter and hook it up to our browser
      const filter = Cc[
        "@mozilla.org/appshell/component/browser-status-filter;1"
      ].createInstance(Ci.nsIWebProgress);
      aTab.filter = filter;
      aTab.browser.webProgress.addProgressListener(
        filter,
        Ci.nsIWebProgress.NOTIFY_ALL
      );

      // Wire up a progress listener to the filter for this browser
      aTab.progressListener = new tabProgressListener(aTab, false);

      filter.addProgressListener(
        aTab.progressListener,
        Ci.nsIWebProgress.NOTIFY_ALL
      );

      if ("onListener" in aArgs) {
        aArgs.onListener(aTab.browser, aTab.progressListener);
      }

      // Initialize our unit testing variables.
      aTab.pageLoading = false;
      aTab.pageLoaded = false;

      // Now start loading the content.
      aTab.title = this.loadingTabString;

      if (!aArgs.skipLoad) {
        MailE10SUtils.loadURI(aTab.browser, aArgs.url, {
          csp: aArgs.csp,
          referrerInfo: aArgs.referrerInfo,
          triggeringPrincipal: aArgs.triggeringPrincipal,
        });
      }

      this.lastBrowserId++;
    },
    tryCloseTab(aTab) {
      const { permitUnload } = aTab.browser.permitUnload();
      return permitUnload;
    },
    persistTab(aTab) {
      if (aTab.browser.currentURI.spec == "about:blank") {
        return null;
      }

      // Extension pages of temporarily installed extensions cannot be restored.
      if (
        aTab.browser.currentURI.scheme == "moz-extension" &&
        WebExtensionPolicy.getByHostname(aTab.browser.currentURI.host)
          ?.temporarilyInstalled
      ) {
        return null;
      }

      return {
        tabURI: aTab.browser.currentURI.spec,
        linkHandler: aTab.browser.getAttribute("messagemanagergroup"),
        userContextId: `${
          aTab.browser.getAttribute("usercontextid") ||
          Ci.nsIScriptSecurityManager.DEFAULT_USER_CONTEXT_ID
        }`,
      };
    },
    restoreTab(aTabmail, aPersistedState) {
      const tab = aTabmail.openTab("contentTab", {
        background: true,
        duplicate: aPersistedState.duplicate,
        linkHandler: aPersistedState.linkHandler,
        url: aPersistedState.tabURI,
        userContextId: aPersistedState.userContextId,
      });

      if (aPersistedState.tabURI == "about:addons") {
        // Also in `openAddonsMgr` in mailCore.js.
        tab.browser.droppedLinkHandler = event =>
          tab.browser.contentWindow.gDragDrop.onDrop(event);
      }
    },
  },

  /**
   * Shows the what's new page in the system browser if we should.
   * Will update the mstone pref to a new version if needed.
   *
   * @see {BrowserContentHandler.needHomepageOverride}
   */
  async showWhatsNewPage() {
    const old_mstone = Services.prefs.getCharPref(
      "mailnews.start_page_override.mstone",
      ""
    );

    const mstone = Services.appinfo.version;
    if (mstone != old_mstone) {
      Services.prefs.setCharPref("mailnews.start_page_override.mstone", mstone);
    }

    if (AppConstants.MOZ_UPDATER) {
      const um = Cc["@mozilla.org/updates/update-manager;1"].getService(
        Ci.nsIUpdateManager
      );
      const update = await um.lastUpdateInstalled();

      if (
        update &&
        Services.vc.compare(update.appVersion, old_mstone) > 0 &&
        Services.vc.compare(update.appVersion, mstone) <= 0
      ) {
        let overridePage = Services.urlFormatter.formatURLPref(
          "mailnews.start_page.override_url"
        );
        overridePage = this.getPostUpdateOverridePage(update, overridePage);
        overridePage = overridePage.replace("%OLD_VERSION%", old_mstone);
        if (overridePage) {
          openLinkExternally(overridePage);
        }
      }
    }
  },

  /**
   * Gets the override page for the first run after the application has been
   * updated.
   *
   * @param {nsIUpdate} update - The nsIUpdate for the update that has been applied.
   * @param {string} defaultOverridePage - The default override page.
   * @returns {string} The override page.
   */
  getPostUpdateOverridePage(update, defaultOverridePage) {
    update = update.QueryInterface(Ci.nsIWritablePropertyBag);
    const actions = update.getProperty("actions");
    // When the update doesn't specify actions fallback to the original behavior
    // of displaying the default override page.
    if (!actions) {
      return defaultOverridePage;
    }

    // The existence of silent or the non-existence of showURL in the actions both
    // mean that an override page should not be displayed.
    if (actions.includes("silent") || !actions.includes("showURL")) {
      return "";
    }

    // If a policy was set to not allow the update.xml-provided
    // URL to be used, use the default fallback (which will also
    // be provided by the policy).
    if (!Services.policies.isAllowed("postUpdateCustomPage")) {
      return defaultOverridePage;
    }

    return update.getProperty("openURL") || defaultOverridePage;
  },

  /**
   * Looks at the existing prefs and determines if we should show the policy or not.
   */
  shouldShowPolicyNotification() {
    const dataSubmissionEnabled = Services.prefs.getBoolPref(
      "datareporting.policy.dataSubmissionEnabled",
      true
    );
    const dataSubmissionPolicyBypassNotification = Services.prefs.getBoolPref(
      "datareporting.policy.dataSubmissionPolicyBypassNotification",
      false
    );
    const dataSubmissionPolicyAcceptedVersion = Services.prefs.getIntPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
      0
    );
    const currentPolicyVersion = Services.prefs.getIntPref(
      "datareporting.policy.currentPolicyVersion",
      1
    );
    if (
      !AppConstants.MOZ_DATA_REPORTING ||
      !dataSubmissionEnabled ||
      dataSubmissionPolicyBypassNotification
    ) {
      return false;
    }
    if (dataSubmissionPolicyAcceptedVersion >= currentPolicyVersion) {
      return false;
    }
    return true;
  },

  showPolicyNotification() {
    try {
      const firstRunURL = Services.prefs.getStringPref(
        "datareporting.policy.firstRunURL"
      );
      document.getElementById("tabmail").openTab("contentTab", {
        background: true,
        url: firstRunURL,
      });
    } catch (e) {
      // Show the infobar if it fails to show the privacy policy in the new tab.
      this.showTelemetryNotification();
    }
    const currentPolicyVersion = Services.prefs.getIntPref(
      "datareporting.policy.currentPolicyVersion",
      1
    );
    Services.prefs.setIntPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
      currentPolicyVersion
    );
    Services.prefs.setStringPref(
      "datareporting.policy.dataSubmissionPolicyNotifiedTime",
      new Date().getTime().toString()
    );
  },

  async showTelemetryNotification() {
    const brandBundle = Services.strings.createBundle(
      "chrome://branding/locale/brand.properties"
    );
    const telemetryBundle = Services.strings.createBundle(
      "chrome://messenger/locale/telemetry.properties"
    );

    const productName = brandBundle.GetStringFromName("brandFullName");
    const serverOwner = Services.prefs.getCharPref(
      "toolkit.telemetry.server_owner"
    );
    const telemetryText = telemetryBundle.formatStringFromName(
      "telemetryText",
      [productName, serverOwner]
    );

    // TODO: sync up this bar with Firefox:
    // https://searchfox.org/mozilla-central/rev/227f22acef5c4865503bde9f835452bf38332c8e/browser/locales/en-US/chrome/browser/browser.properties#697-698
    const buttons = [
      {
        label: telemetryBundle.GetStringFromName("telemetryLinkLabel"),
        popup: null,
        callback: () => {
          openOptionsDialog("panePrivacy", "privacyDataCollectionCategory");
        },
      },
    ];

    const notification = await this.msgNotificationBar.appendNotification(
      "telemetry",
      {
        label: telemetryText,
        priority: this.msgNotificationBar.PRIORITY_INFO_LOW,
      },
      buttons
    );
    // Arbitrary number, just so bar sticks around for a bit.
    notification.persistence = 3;
  },

  /**
   * Looks at the existing prefs and determines if we should show about:rights
   * or not.
   *
   * This is controlled by two prefs:
   *
   *   mail.rights.override
   *     If this pref is set to false, always show the about:rights
   *     notification.
   *     If this pref is set to true, never show the about:rights notification.
   *     If the pref doesn't exist, then we fallback to checking
   *     mail.rights.version.
   *
   *   mail.rights.version
   *     If this pref isn't set or the value is less than the current version
   *     then we show the about:rights notification.
   */
  shouldShowAboutRightsNotification() {
    try {
      return !Services.prefs.getBoolPref("mail.rights.override");
    } catch (e) {}

    return (
      Services.prefs.getIntPref("mail.rights.version") <
      this._kAboutRightsVersion
    );
  },

  async showAboutRightsNotification() {
    var rightsBundle = Services.strings.createBundle(
      "chrome://messenger/locale/aboutRights.properties"
    );

    var buttons = [
      {
        label: rightsBundle.GetStringFromName("buttonLabel"),
        accessKey: rightsBundle.GetStringFromName("buttonAccessKey"),
        popup: null,
        callback() {
          // Show the about:rights tab
          document.getElementById("tabmail").openTab("contentTab", {
            url: "about:rights",
          });
        },
      },
    ];

    const notifyRightsText = await document.l10n.formatValue(
      "about-rights-notification-text"
    );
    const notification = await this.msgNotificationBar.appendNotification(
      "about-rights",
      {
        label: notifyRightsText,
        priority: this.msgNotificationBar.PRIORITY_INFO_LOW,
      },
      buttons
    );
    // Arbitrary number, just so bar sticks around for a bit.
    notification.persistence = 3;

    // Set the pref to say we've displayed the notification.
    Services.prefs.setIntPref("mail.rights.version", this._kAboutRightsVersion);
  },

  /**
   * Determine if we should load fav icons or not.
   *
   * @param aURI  An nsIURI containing the current url.
   */
  _shouldLoadFavIcon(aURI) {
    return (
      aURI &&
      Services.prefs.getBoolPref("browser.chrome.site_icons") &&
      Services.prefs.getBoolPref("browser.chrome.favicons") &&
      "schemeIs" in aURI &&
      (aURI.schemeIs("http") || aURI.schemeIs("https"))
    );
  },

  /**
   * Tries to use the default favicon for a webpage for the specified tab.
   * We'll use the site's favicon.ico if prefs allow us to.
   */
  useDefaultFavIcon(aTab) {
    // Use documentURI in the check for shouldLoadFavIcon so that we do the
    // right thing with about:-style error pages.
    const docURIObject = aTab.browser.documentURI;
    let icon = null;
    if (this._shouldLoadFavIcon(docURIObject)) {
      icon = docURIObject.prePath + "/favicon.ico";
    }

    this.setFavIcon(aTab, icon);
  },

  /**
   * This sets the specified tab to load and display the given icon for the
   * page shown in the browser. It is assumed that the preferences have already
   * been checked before calling this function appropriately.
   *
   * @param aTab  The tab to set the icon for.
   * @param aIcon A string based URL of the icon to try and load.
   */
  async setFavIcon(aTab, aIcon) {
    if (aIcon) {
      const iconURI = Services.io.newURI(aIcon);
      await MailUtils.setFaviconForPage(aTab.browser.currentURI, iconURI);
    }
    document
      .getElementById("tabmail")
      .setTabFavIcon(
        aTab,
        aIcon,
        "chrome://messenger/skin/icons/new/compact/draft.svg"
      );
  },

  browserForward() {
    const tabmail = document.getElementById("tabmail");
    if (
      !["contentTab", "mail3PaneTab"].includes(
        tabmail?.currentTabInfo.mode.name
      )
    ) {
      return;
    }
    const browser = tabmail.getBrowserForSelectedTab();
    if (!browser) {
      return;
    }
    if (browser.webNavigation) {
      browser.webNavigation.goForward();
    }
  },

  browserBack() {
    const tabmail = document.getElementById("tabmail");
    if (
      !["contentTab", "mail3PaneTab"].includes(
        tabmail?.currentTabInfo.mode.name
      )
    ) {
      return;
    }
    const browser = tabmail.getBrowserForSelectedTab();
    if (!browser) {
      return;
    }
    if (browser.webNavigation) {
      browser.webNavigation.goBack();
    }
  },
};
