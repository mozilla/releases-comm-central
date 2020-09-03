/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, openOptionsDialog */

/* import-globals-from ../../../../toolkit/components/printing/content/printUtils.js */
/* import-globals-from mailWindow.js */
/* import-globals-from utilityOverlay.js */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

function saveKeyToFile(content, fileName) {
  let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  picker.init(mail3PaneWindow, fileName, Ci.nsIFilePicker.modeSave);
  picker.defaultString = fileName;
  picker.defaultExtension = "pem";
  picker.appendFilters(Ci.nsIFilePicker.filterAll);
  return new Promise(resolve => {
    picker.open(rv => {
      if (
        rv != Ci.nsIFilePicker.returnOK &&
        rv != Ci.nsIFilePicker.returnReplace
      ) {
        resolve(null);
        return;
      }
      try {
        OS.File.writeAtomic(picker.file.path, decodeURI(content));
        resolve(picker.file);
      } catch (ex) {}
    });
  });
}

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
    if (aWebProgress.DOMWindow == this.mBrowser.contentWindow) {
      // Don't clear the favicon if this onLocationChange was triggered
      // by a pushState or a replaceState. See bug 550565.
      if (
        aWebProgress.isLoadingDocument &&
        !(this.mBrowser.docShell.loadType & Ci.nsIDocShell.LOAD_CMD_PUSHSTATE)
      ) {
        this.mBrowser.mIconURL = null;
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

      // Set the reload command only if this is a report that is coming in about
      // the top-level content location change.
      if (aWebProgress.DOMWindow == this.mBrowser.contentWindow) {
        // Although we're unlikely to be loading about:blank, we'll check it
        // anyway just in case. The second condition is for new tabs, otherwise
        // the reload function is enabled until tab is refreshed.
        this.mTab.reloadEnabled = !(
          (location == "about:blank" && !this.mBrowser.contentWindow.opener) ||
          location == ""
        );
      }
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

    let tabmail = document.getElementById("tabmail");

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
        this.mTab.security.setAttribute("loading", "true");
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
      this.mTab.security.removeAttribute("loading");
      tabmail.setTabBusy(this.mTab, false);
      tabmail.setTabTitle(this.mTab);

      // Set our unit testing variables accordingly
      this.mTab.pageLoading = false;
      this.mTab.pageLoaded = true;

      // If we've finished loading, and we've not had an icon loaded from a
      // link element, then we try using the default icon for the site.
      if (
        aWebProgress.DOMWindow == this.mBrowser.contentWindow &&
        !this.mBrowser.mIconURL
      ) {
        specialTabs.useDefaultIcon(this.mTab);
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
    if (level) {
      this.mTab.security.setAttribute("level", level);
      this.mTab.security.hidden = false;
    } else {
      this.mTab.security.hidden = true;
      this.mTab.security.removeAttribute("level");
    }
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
      this.mProgressListener.onRefreshAttempted(
        aWebProgress,
        aURI,
        aDelay,
        aSameURI
      );
    }
  },
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsIWebProgressListener2",
    "nsISupportsWeakReference",
  ]),
};

var DOMLinkHandler = {
  handleEvent(event) {
    switch (event.type) {
      case "DOMLinkAdded":
        this.onLinkAdded(event);
        break;
    }
  },
  onLinkAdded(event) {
    let link = event.originalTarget;
    let rel = link.rel && link.rel.toLowerCase();
    if (!link || !link.ownerDocument || !rel || !link.href) {
      return;
    }

    if (rel.split(/\s+/).includes("icon")) {
      if (!Services.prefs.getBoolPref("browser.chrome.site_icons")) {
        return;
      }

      let targetDoc = link.ownerDocument;
      let uri = makeURI(link.href, targetDoc.characterSet);

      // Verify that the load of this icon is legal.
      // Some error or special pages can load their favicon.
      // To be on the safe side, only allow chrome:// favicons.
      let isAllowedPage =
        targetDoc.documentURI == "about:home" ||
        ["about:neterror?", "about:blocked?", "about:certerror?"].some(function(
          aStart
        ) {
          targetDoc.documentURI.startsWith(aStart);
        });

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
      let { NetUtil } = ChromeUtils.import(
        "resource://gre/modules/NetUtil.jsm"
      );
      let tmpChannel = NetUtil.newChannel({
        uri,
        loadingNode: targetDoc,
        securityFlags: Ci.nsILoadInfo.SEC_ONLY_FOR_EXPLICIT_CONTENTSEC_CHECK,
        contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
      });
      let tmpLoadInfo = tmpChannel.loadInfo;
      if (
        contentPolicy.shouldLoad(uri, tmpLoadInfo, link.type) !=
        Ci.nsIContentPolicy.ACCEPT
      ) {
        return;
      }

      let tab = document
        .getElementById("tabmail")
        .getBrowserForDocument(targetDoc.defaultView);

      // If we don't have a browser/tab, then don't load the icon.
      if (!tab) {
        return;
      }

      // Just set the url on the browser and we'll display the actual icon
      // when we finish loading the page.
      specialTabs.setTabIcon(tab, link.href);
    }
  },
};

var contentTabBaseType = {
  // List of URLs that will receive special treatment when opened in a tab.
  // Note that about:preferences is loaded via a different mechanism.
  inContentWhitelist: [
    "about:addons",
    "about:blank",
    "about:profiles",
    "about:certificate?*",
    "about:*",
  ],

  // Code to run if a particular document is loaded in a tab.
  // The array members (functions) are for the respective document URLs
  // as specified in inContentWhitelist.
  inContentOverlays: [
    // about:addons
    function(aDocument, aTab) {
      Services.scriptloader.loadSubScript(
        "chrome://messenger/content/aboutAddonsExtra.js",
        aDocument.defaultView
      );
    },

    // Let's not mess with about:blank.
    null,

    // about:profiles
    function(aDocument, aTab) {
      // Need a timeout to let the script run to create the needed buttons.
      setTimeout(() => {
        for (let button of aDocument.querySelectorAll(
          `[data-l10n-id="profiles-launch-profile"]`
        )) {
          document.l10n.setAttributes(button, "profiles-launch-profile-plain");
        }
      }, 500);
    },

    // about:certificate
    function(aDocument, aTab) {
      // Need a timeout to let the script run to create the needed links.
      setTimeout(() => {
        let downloadLinks = aDocument
          .querySelector("certificate-section")
          .shadowRoot.querySelector(".miscellaneous")
          .shadowRoot.querySelector(".download")
          .shadowRoot.querySelectorAll(".download-link");
        for (let link of downloadLinks) {
          link.addEventListener("click", event => {
            let content = link.getAttribute("href").split(",");
            saveKeyToFile(content[1], link.getAttribute("download"));
          });
        }
      }, 1000);
    },

    // Other about:* pages.
    function(aDocument, aTab) {
      // Provide context menu for about:* pages.
      aTab.browser.setAttribute("context", "aboutPagesContext");
    },
  ],

  shouldSwitchTo({ contentPage: aContentPage, duplicate: aDuplicate }) {
    if (aDuplicate) {
      return -1;
    }

    let tabmail = document.getElementById("tabmail");
    let tabInfo = tabmail.tabInfo;

    // Remove any anchors - especially for the about: pages, we just want
    // to re-use the same tab.
    let regEx = new RegExp("#.*");

    let contentUrl = aContentPage.replace(regEx, "");

    for (
      let selectedIndex = 0;
      selectedIndex < tabInfo.length;
      ++selectedIndex
    ) {
      if (
        tabInfo[selectedIndex].mode.name == this.name &&
        tabInfo[selectedIndex].browser.currentURI.spec.replace(regEx, "") ==
          contentUrl
      ) {
        // Ensure we go to the correct location on the page.
        tabInfo[selectedIndex].browser.setAttribute("src", aContentPage);
        return selectedIndex;
      }
    }
    return -1;
  },

  closeTab(aTab) {
    aTab.browser.removeEventListener(
      "DOMTitleChanged",
      aTab.titleListener,
      true
    );
    aTab.browser.removeEventListener(
      "DOMWindowClose",
      aTab.closeListener,
      true
    );
    aTab.browser.removeEventListener("DOMLinkAdded", DOMLinkHandler);
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
  },

  getBrowser(aTab) {
    return aTab.browser;
  },

  _setUpLoadListener(aTab) {
    let self = this;

    function onLoad(aEvent) {
      let doc = aEvent.originalTarget;
      let url = doc.defaultView.location.href;

      // If this document has an overlay defined, run it now.
      let ind = self.inContentWhitelist.indexOf(url);
      if (ind < 0) {
        // about:certificate?<certid> like URLs.
        ind = self.inContentWhitelist.indexOf(url.replace(/\?.*/, "?*"));
      }
      if (ind < 0) {
        // Try a wildcard.
        ind = self.inContentWhitelist.indexOf(url.replace(/:.*/, ":*"));
      }
      if (ind >= 0) {
        let overlayFunction = self.inContentOverlays[ind];
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
    function onDOMTitleChanged(aEvent) {
      aTab.title = aTab.browser.contentTitle;
      document.getElementById("tabmail").setTabTitle(aTab);
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.titleListener = onDOMTitleChanged;
    // Add the listener.
    aTab.browser.addEventListener("DOMTitleChanged", aTab.titleListener, true);
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

  supportsCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      case "cmd_stop":
      case "cmd_reload":
        // XXX print preview not currently supported - bug 497994 to implement.
        // case "cmd_printpreview":
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
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
        // XXX print preview not currently supported - bug 497994 to implement.
        // case "cmd_printpreview":
        return true;
      case "cmd_reload":
        return aTab.reloadEnabled;
      case "cmd_stop":
        return aTab.busy;
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
      case "cmd_printSetup":
        PrintUtils.showPageSetup();
        break;
      case "cmd_print":
        let browser = this.getBrowser(aTab);
        PrintUtils.printWindow(browser.browsingContext);
        break;
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
      //  PrintUtils.printPreview();
      //  break;
      case "cmd_stop":
        aTab.browser.stop();
        break;
      case "cmd_reload":
        aTab.browser.reload();
        break;
    }
  },
};

var specialTabs = {
  _kAboutRightsVersion: 1,
  get _protocolSvc() {
    delete this._protocolSvc;
    return (this._protocolSvc = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService));
  },

  get mFaviconService() {
    delete this.mFaviconService;
    return (this.mFaviconService = Cc[
      "@mozilla.org/browser/favicon-service;1"
    ].getService(Ci.nsIFaviconService));
  },

  get msgNotificationBar() {
    delete this.msgNotificationBar;

    let newNotificationBox = new MozElements.NotificationBox(element => {
      element.setAttribute("flex", "1");
      element.setAttribute("notificationside", "bottom");
      document.getElementById("messenger-notification-bottom").append(element);
    });

    return (this.msgNotificationBar = newNotificationBox);
  },

  /**
   * We use an html image node to test the favicon, errors are well returned.
   * Returning a url for nsITreeView.getImageSrc() will not indicate any
   * error, and setAndFetchFaviconForPage() can't be used to detect
   * failed icons due to Bug 740457. This also ensures 301 Moved or
   * redirected urls will work (they won't otherwise in getImageSrc).
   *
   * @param  function successFunc - caller's success function.
   * @param  function errorFunc   - caller's error function.
   * @param  string iconUrl       - url to load.
   * @return HTMLImageElement imageNode
   */
  loadFaviconImageNode(successFunc, errorFunc, iconUrl) {
    let HTMLNS = "http://www.w3.org/1999/xhtml";
    let imageNode = document.createElementNS(HTMLNS, "img");
    imageNode.style.visibility = "collapse";
    imageNode.addEventListener("load", event => successFunc(event, iconUrl), {
      capture: false,
      once: true,
    });
    imageNode.addEventListener("error", event => errorFunc(event, iconUrl), {
      capture: false,
      once: true,
    });
    imageNode.src = iconUrl;
    return imageNode;
  },

  /**
   * Favicon request timeout, 20 seconds.
   */
  REQUEST_TIMEOUT: 20 * 1000,

  /**
   * Get the favicon by parsing for <link rel=""> with "icon" from the page's
   * dom <head>.
   *
   * @param  string aUrl          - a url from whose homepage to get a favicon.
   * @param  function aCallback   - callback.
   */
  getFaviconFromPage(aUrl, aCallback) {
    let url, uri;
    try {
      url = Services.io.newURI(aUrl).prePath;
      uri = Services.io.newURI(url);
    } catch (ex) {
      if (aCallback) {
        aCallback("");
      }
      return;
    }

    let onLoadSuccess = aEvent => {
      let iconUri = Services.io.newURI(aEvent.target.src);
      specialTabs.mFaviconService.setAndFetchFaviconForPage(
        uri,
        iconUri,
        false,
        specialTabs.mFaviconService.FAVICON_LOAD_NON_PRIVATE,
        null,
        Services.scriptSecurityManager.getSystemPrincipal()
      );

      if (aCallback) {
        aCallback(iconUri.spec);
      }
    };

    let onDownloadError = aEvent => {
      if (aCallback) {
        aCallback("");
      }
    };

    let onDownload = aEvent => {
      let request = aEvent.target;
      let dom = request.response;
      if (
        request.status != 200 ||
        ChromeUtils.getClassName(dom) !== "HTMLDocument"
      ) {
        onDownloadError(aEvent);
        return;
      }

      let iconUri;
      let linkNode = dom.head.querySelector(
        'link[rel="shortcut icon"],link[rel="icon"]'
      );
      let href = linkNode ? linkNode.href : null;
      try {
        iconUri = Services.io.newURI(href);
      } catch (ex) {
        onDownloadError(aEvent);
        return;
      }

      specialTabs.loadFaviconImageNode(
        onLoadSuccess,
        onDownloadError,
        iconUri.spec
      );
    };

    let request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "document";
    request.onload = onDownload;
    request.onerror = onDownloadError;
    request.timeout = this.REQUEST_TIMEOUT;
    request.ontimeout = onDownloadError;
    request.send(null);
  },

  // This will open any special tabs if necessary on startup.
  openSpecialTabsOnStartup() {
    let tabmail = document.getElementById("tabmail");

    tabmail.registerTabType(this.contentTabType);
    tabmail.registerTabType(this.chromeTabType);

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
        maxTabs: 10,
      },
    },

    /**
     * This is the internal function used by content tabs to open a new tab. To
     * open a contentTab, use specialTabs.openTab("contentTab", aArgs)
     *
     * @param aArgs The options that content tabs accept.
     * @param aArgs.contentPage A string that holds the URL that is to be opened
     * @param aArgs.openWindowInfo The opener window
     * @param aArgs.clickHandler The click handler for that content tab. See the
     *  "Content Tabs" article on MDC.
     * @param aArgs.onLoad A function that takes an Event and a DOMNode. It is
     *  called when the content page is done loading. The first argument is the
     *  load event, and the second argument is the xul:browser that holds the
     *  contentPage. You can access the inner tab's window object by accessing
     *  the second parameter's contentWindow property.
     */
    openTab(aTab, aArgs) {
      if (!("contentPage" in aArgs)) {
        throw new Error("contentPage must be specified");
      }

      // First clone the page and set up the basics.
      let clone = document
        .getElementById("contentTab")
        .firstElementChild.cloneNode(true);

      clone.setAttribute("id", "contentTab" + this.lastBrowserId);
      clone.setAttribute("collapsed", false);

      let toolbox = clone.firstElementChild;
      toolbox.setAttribute("id", "contentTabToolbox" + this.lastBrowserId);
      toolbox.firstElementChild.setAttribute(
        "id",
        "contentTabToolbar" + this.lastBrowserId
      );

      aTab.linkedBrowser = aTab.browser = document.createXULElement("browser");
      aTab.browser.setAttribute("id", "contentTabBrowser" + this.lastBrowserId);
      aTab.browser.setAttribute("type", "content");
      aTab.browser.setAttribute("flex", "1");
      aTab.browser.setAttribute("autocompletepopup", "PopupAutoComplete");
      aTab.browser.setAttribute("datetimepicker", "DateTimePickerPanel");
      aTab.browser.setAttribute("context", "mailContext");
      aTab.browser.setAttribute("messagemanagergroup", "browsers");
      aTab.browser.setAttribute(
        "oncontextmenu",
        "return mailContextOnContextMenu(event);"
      );
      aTab.browser.openWindowInfo = aArgs.openWindowInfo || null;
      clone.querySelector("stack").appendChild(aTab.browser);

      if (aArgs.skipLoad) {
        clone.querySelector("browser").setAttribute("nodefaultsrc", "true");
      }
      aTab.panel.setAttribute("id", "contentTabWrapper" + this.lastBrowserId);
      aTab.panel.appendChild(clone);
      aTab.root = clone;

      // Start setting up the browser.
      aTab.toolbar = aTab.panel.querySelector(".contentTabToolbar");
      aTab.backButton = aTab.toolbar.querySelector(".back-btn");
      aTab.backButton.addEventListener("command", () => aTab.browser.goBack());
      aTab.forwardButton = aTab.toolbar.querySelector(".forward-btn");
      aTab.forwardButton.addEventListener("command", () =>
        aTab.browser.goForward()
      );
      aTab.security = aTab.toolbar.querySelector(".contentTabSecurity");
      aTab.urlbar = aTab.toolbar.querySelector(".contentTabUrlbar > input");
      aTab.urlbar.value = aArgs.contentPage;

      ExtensionParent.apiManager.emit(
        "extension-browser-inserted",
        aTab.browser
      );

      // As we're opening this tab, showTab may not get called, so set
      // the type according to if we're opening in background or not.
      let background = "background" in aArgs && aArgs.background;
      aTab.browser.setAttribute("type", "content");
      if (background) {
        aTab.browser.removeAttribute("primary");
      } else {
        aTab.browser.setAttribute("primary", "true");
      }

      aTab.clickHandler =
        "clickHandler" in aArgs && aArgs.clickHandler
          ? aArgs.clickHandler
          : "specialTabs.defaultClickHandler(event);";
      aTab.browser.setAttribute("onclick", aTab.clickHandler);

      // Set this attribute so that when favicons fail to load, we remove the
      // image attribute and just show the default tab icon.
      aTab.tabNode.setAttribute("onerror", "this.removeAttribute('image');");

      aTab.browser.addEventListener("DOMLinkAdded", DOMLinkHandler);

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
      let filter = Cc[
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
        let params = {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        };
        aTab.browser.loadURI(aArgs.contentPage, params);
      }

      this.lastBrowserId++;
    },
    tryCloseTab(aTab) {
      let docShell = aTab.browser.docShell;
      // If we have a docshell, a contentViewer, and it forbids us from closing
      // the tab, then we return false, which means, we can't close the tab. All
      // other cases return true.
      return !(
        docShell &&
        docShell.contentViewer &&
        !docShell.contentViewer.permitUnload()
      );
    },
    persistTab(aTab) {
      if (aTab.browser.currentURI.spec == "about:blank") {
        return null;
      }

      let onClick = aTab.clickHandler;

      return {
        tabURI: aTab.browser.currentURI.spec,
        clickHandler: onClick ? onClick : null,
      };
    },
    restoreTab(aTabmail, aPersistedState) {
      let tab = aTabmail.openTab("contentTab", {
        contentPage: aPersistedState.tabURI,
        clickHandler: aPersistedState.clickHandler,
        duplicate: aPersistedState.duplicate,
        background: true,
      });
      if (aPersistedState.tabURI == "about:addons") {
        // Also in `openAddonsMgr` in mailCore.js.
        tab.browser.droppedLinkHandler = event =>
          tab.browser.contentWindow.gDragDrop.onDrop(event);
      }
      if (aPersistedState.tabURI == "about:accountsettings") {
        tab.tabNode.setAttribute("type", "accountManager");
      }
    },
  },

  /**
   * Shows the what's new page in the system browser if we should.
   * Will update the mstone pref to a new version if needed.
   * @see {BrowserContentHandler.needHomepageOverride}
   */
  showWhatsNewPage() {
    let old_mstone = Services.prefs.getCharPref(
      "mailnews.start_page_override.mstone",
      ""
    );

    let mstone = Services.appinfo.version;
    if (mstone != old_mstone) {
      Services.prefs.setCharPref("mailnews.start_page_override.mstone", mstone);
    }

    let update = Cc["@mozilla.org/updates/update-manager;1"].getService(
      Ci.nsIUpdateManager
    ).activeUpdate;

    if (update && Services.vc.compare(update.appVersion, old_mstone) > 0) {
      let overridePage = Services.urlFormatter.formatURLPref(
        "mailnews.start_page.override_url"
      );
      overridePage = this.getPostUpdateOverridePage(update, overridePage);
      overridePage = overridePage.replace("%OLD_VERSION%", old_mstone);
      if (overridePage) {
        openLinkExternally(overridePage);
      }
    }
  },

  /**
   * Gets the override page for the first run after the application has been
   * updated.
   * @param {nsIUpdate} update - The nsIUpdate for the update that has been applied.
   * @param {string} defaultOverridePage - The default override page.
   * @returns {string} The override page.
   */
  getPostUpdateOverridePage(update, defaultOverridePage) {
    update = update.QueryInterface(Ci.nsIWritablePropertyBag);
    let actions = update.getProperty("actions");
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
    let dataSubmissionEnabled = Services.prefs.getBoolPref(
      "datareporting.policy.dataSubmissionEnabled",
      true
    );
    let dataSubmissionPolicyBypassNotification = Services.prefs.getBoolPref(
      "datareporting.policy.dataSubmissionPolicyBypassNotification",
      false
    );
    let dataSubmissionPolicyAcceptedVersion = Services.prefs.getIntPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion",
      0
    );
    let currentPolicyVersion = Services.prefs.getIntPref(
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
      let firstRunURL = Services.prefs.getStringPref(
        "datareporting.policy.firstRunURL"
      );
      document.getElementById("tabmail").openTab("contentTab", {
        contentPage: firstRunURL,
        clickHandler: "specialTabs.aboutClickHandler(event);",
        background: true,
      });
    } catch (e) {
      // Show the infobar if it fails to show the privacy policy in the new tab.
      this.showTelemetryNotification();
    }
    let currentPolicyVersion = Services.prefs.getIntPref(
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

  showTelemetryNotification() {
    let brandBundle = Services.strings.createBundle(
      "chrome://branding/locale/brand.properties"
    );
    let telemetryBundle = Services.strings.createBundle(
      "chrome://messenger/locale/telemetry.properties"
    );

    let productName = brandBundle.GetStringFromName("brandFullName");
    let serverOwner = Services.prefs.getCharPref(
      "toolkit.telemetry.server_owner"
    );
    let telemetryText = telemetryBundle.formatStringFromName("telemetryText", [
      productName,
      serverOwner,
    ]);

    // TODO: sync up this bar with Firefox:
    // https://searchfox.org/mozilla-central/rev/227f22acef5c4865503bde9f835452bf38332c8e/browser/locales/en-US/chrome/browser/browser.properties#697-698
    let buttons = [
      {
        label: telemetryBundle.GetStringFromName("telemetryLinkLabel"),
        popup: null,
        callback: () => {
          openOptionsDialog("panePrivacy", "privacyDataCollectionCategory");
        },
      },
    ];

    let notification = this.msgNotificationBar.appendNotification(
      telemetryText,
      "telemetry",
      null,
      this.msgNotificationBar.PRIORITY_INFO_LOW,
      buttons
    );
    notification.persistence = 3; // arbitrary number, just so bar sticks around for a bit
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
        callback(aNotificationBar, aButton) {
          // Show the about:rights tab
          document.getElementById("tabmail").openTab("contentTab", {
            contentPage: "about:rights",
            clickHandler: "specialTabs.aboutClickHandler(event);",
          });
        },
      },
    ];

    let notifyRightsText = await document.l10n.formatValue(
      "about-rights-notification-text"
    );
    var box = this.msgNotificationBar.appendNotification(
      notifyRightsText,
      "about-rights",
      null,
      this.msgNotificationBar.PRIORITY_INFO_LOW,
      buttons
    );
    // arbitrary number, just so bar sticks around for a bit
    box.persistence = 3;

    // Set the pref to say we've displayed the notification.
    Services.prefs.setIntPref("mail.rights.version", this._kAboutRightsVersion);
  },

  /**
   * Handles links when displaying about: pages. Anything that is an about:
   * link can be loaded internally, other links are redirected to an external
   * browser.
   */
  aboutClickHandler(aEvent) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!aEvent.isTrusted || aEvent.defaultPrevented || aEvent.button) {
      return true;
    }

    let href = hRefForClickEvent(aEvent, true)[0];
    if (href) {
      let uri = makeURI(href);
      if (
        !this._protocolSvc.isExposedProtocol(uri.scheme) ||
        uri.schemeIs("http") ||
        uri.schemeIs("https")
      ) {
        aEvent.preventDefault();
        openLinkExternally(href);
      }
    }
    return false;
  },

  /**
   * The default click handler for content tabs. Any clicks on links will get
   * redirected to an external browser - effectively keeping the user on one
   * page.
   */
  defaultClickHandler(aEvent) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!aEvent.isTrusted || aEvent.defaultPrevented || aEvent.button) {
      return true;
    }

    let href = hRefForClickEvent(aEvent, true)[0];

    // We've explicitly allowed http, https and about as additional exposed
    // protocols in our default prefs, so these are the ones we need to check
    // for here.
    if (href) {
      let uri = makeURI(href);
      if (
        !this._protocolSvc.isExposedProtocol(uri.scheme) ||
        uri.schemeIs("http") ||
        uri.schemeIs("https") ||
        uri.schemeIs("about")
      ) {
        aEvent.preventDefault();
        openLinkExternally(href);
      }
    }
    return false;
  },

  /**
   * A site click handler for extensions to use. This does its best to limit
   * loading of links that match the regexp to within the content tab it applies
   * to within Thunderbird. Links that do not match the regexp will be loaded
   * in the external browser.
   *
   * Note: Due to the limitations of http and the possibility for redirects, if
   * sites change or use javascript, this function may not be able to ensure the
   * contentTab stays "within" a site. Extensions using this function should
   * consider this when implementing the extension.
   *
   * @param aEvent      The onclick event that is being handled.
   * @param aSiteRegexp A regexp to match against to determine if the link
   *                    clicked on should be loaded within the browser or not.
   */
  siteClickHandler(aEvent, aSiteRegexp) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!aEvent.isTrusted || aEvent.defaultPrevented || aEvent.button) {
      return true;
    }

    let href = hRefForClickEvent(aEvent, true)[0];

    // We've explicitly allowed http, https and about as additional exposed
    // protocols in our default prefs, so these are the ones we need to check
    // for here.
    if (href) {
      let uri = makeURI(href);
      if (
        aEvent.target.ownerDocument.location.href ==
          "chrome://mozapps/content/extensions/aboutaddons.html" &&
        uri.schemeIs("addons")
      ) {
        // Prevent internal AOM links showing the "open link" dialog.
        aEvent.preventDefault();
      } else if (
        !this._protocolSvc.isExposedProtocol(uri.scheme) ||
        ((uri.schemeIs("http") ||
          uri.schemeIs("https") ||
          uri.schemeIs("about")) &&
          !aSiteRegexp.test(uri.spec))
      ) {
        aEvent.preventDefault();
        openLinkExternally(href);
      }
    }
    return false;
  },

  chromeTabType: {
    name: "chromeTab",
    perTabPanel: "vbox",
    lastBrowserId: 0,
    get loadingTabString() {
      delete this.loadingTabString;
      return (this.loadingTabString = document
        .getElementById("bundle_messenger")
        .getString("loadingTab"));
    },

    modes: {
      chromeTab: {
        type: "chromeTab",
        maxTabs: 10,
      },
    },

    shouldSwitchTo: ({ chromePage: x }) =>
      contentTabBaseType.shouldSwitchTo({ contentPage: x }),

    /**
     * This is the internal function used by chrome tabs to open a new tab. To
     * open a chromeTab, use specialTabs.openTab("chromeTab", aArgs)
     *
     * @param aArgs The options that chrome tabs accept.
     * @param aArgs.chromePage A string that holds the URL that is to be opened
     * @param aArgs.clickHandler The click handler for that chrome tab. See the
     *  "Content Tabs" article on MDC.
     * @param aArgs.onLoad A function that takes an Event and a DOMNode. It is
     *  called when the chrome page is done loading. The first argument is the
     *  load event, and the second argument is the xul:browser that holds the
     *  chromePage. You can access the inner tab's window object by accessing
     *  the second parameter's chromeWindow property.
     */
    openTab(aTab, aArgs) {
      if (!("chromePage" in aArgs)) {
        throw new Error("chromePage must be specified");
      }

      // First clone the page and set up the basics.
      let clone = document
        .getElementById("chromeTab")
        .firstElementChild.cloneNode(true);

      clone.setAttribute("id", "chromeTab" + this.lastBrowserId);
      clone.setAttribute("collapsed", false);

      let toolbox = clone.firstElementChild;
      toolbox.setAttribute("id", "chromeTabToolbox" + this.lastBrowserId);
      toolbox.firstElementChild.setAttribute(
        "id",
        "chromeTabToolbar" + this.lastBrowserId
      );

      aTab.panel.setAttribute("id", "chromeTabWrapper" + this.lastBrowserId);
      aTab.panel.appendChild(clone);

      // Start setting up the browser.
      aTab.browser = aTab.panel.querySelector("browser");

      aTab.browser.setAttribute(
        "onclick",
        "clickHandler" in aArgs && aArgs.clickHandler
          ? aArgs.clickHandler
          : "specialTabs.defaultClickHandler(event);"
      );

      // Set this attribute so that when favicons fail to load, we remove the
      // image attribute and just show the default tab icon.
      aTab.tabNode.setAttribute("onerror", "this.removeAttribute('image');");

      aTab.browser.addEventListener("DOMLinkAdded", DOMLinkHandler);

      aTab.browser.setAttribute("id", "chromeTabBrowser" + this.lastBrowserId);

      // Now set up the listeners.
      this._setUpTitleListener(aTab);
      this._setUpCloseWindowListener(aTab);
      if ("onLoad" in aArgs) {
        aTab.browser.addEventListener(
          "load",
          function _chromeTab_onLoad(event) {
            aArgs.onLoad(event, aTab.browser);
            aTab.browser.removeEventListener("load", _chromeTab_onLoad, true);
          },
          true
        );
      }

      // Now start loading the content.
      aTab.title = this.loadingTabString;
      let params = {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      };
      aTab.browser.loadURI(aArgs.chromePage, params);

      this.lastBrowserId++;
    },
    tryCloseTab(aTab) {
      let docShell = aTab.browser.docShell;
      // If we have a docshell, a contentViewer, and it forbids us from closing
      // the tab, then we return false, which means, we can't close the tab. All
      // other cases return true.
      return !(
        docShell &&
        docShell.contentViewer &&
        !docShell.contentViewer.permitUnload()
      );
    },
    closeTab(aTab) {
      aTab.browser.removeEventListener("load", aTab.loadListener, true);
      aTab.browser.removeEventListener(
        "DOMTitleChanged",
        aTab.titleListener,
        true
      );
      aTab.browser.removeEventListener(
        "DOMWindowClose",
        aTab.closeListener,
        true
      );
      aTab.browser.removeEventListener("DOMLinkAdded", DOMLinkHandler);
      aTab.browser.destroy();
    },
    saveTabState(aTab) {},
    showTab(aTab) {},
    persistTab(aTab) {
      if (aTab.browser.currentURI.spec == "about:blank") {
        return null;
      }

      let onClick = aTab.browser.getAttribute("onclick");

      return {
        tabURI: aTab.browser.currentURI.spec,
        clickHandler: onClick ? onClick : null,
      };
    },
    restoreTab(aTabmail, aPersistedState) {
      aTabmail.openTab("chromeTab", {
        chromePage: aPersistedState.tabURI,
        clickHandler: aPersistedState.clickHandler,
        background: true,
      });
    },
    onTitleChanged(aTab) {
      aTab.title = aTab.browser.contentDocument.title;
    },
    supportsCommand(aCommand, aTab) {
      switch (aCommand) {
        case "cmd_fullZoomReduce":
        case "cmd_fullZoomEnlarge":
        case "cmd_fullZoomReset":
        case "cmd_fullZoomToggle":
        case "cmd_printSetup":
        case "cmd_print":
        case "button_print":
          // XXX print preview not currently supported - bug 497994 to implement.
          // case "cmd_printpreview":
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
        case "cmd_printSetup":
        case "cmd_print":
        case "button_print":
          // XXX print preview not currently supported - bug 497994 to implement.
          // case "cmd_printpreview":
          return true;
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
        case "cmd_printSetup":
          PrintUtils.showPageSetup();
          break;
        case "cmd_print":
          let browser = this.getBrowser(aTab);
          PrintUtils.printWindow(browser.browsingContext);
          break;
        // XXX print preview not currently supported - bug 497994 to implement.
        // case "cmd_printpreview":
        //  PrintUtils.printPreview();
        //  break;
      }
    },
    getBrowser(aTab) {
      return aTab.browser;
    },
    // Internal function used to set up the title listener on a content tab.
    _setUpTitleListener(aTab) {
      function onDOMTitleChanged(aEvent) {
        document.getElementById("tabmail").setTabTitle(aTab);
      }
      // Save the function we'll use as listener so we can remove it later.
      aTab.titleListener = onDOMTitleChanged;
      // Add the listener.
      aTab.browser.addEventListener(
        "DOMTitleChanged",
        aTab.titleListener,
        true
      );
    },
    /**
     * Internal function used to set up the close window listener on a content
     * tab.
     */
    _setUpCloseWindowListener(aTab) {
      function onDOMWindowClose(aEvent) {
        try {
          if (!aEvent.isTrusted) {
            return;
          }

          // Redirect any window.close events to closing the tab. As a 3-pane tab
          // must be open, we don't need to worry about being the last tab open.
          document.getElementById("tabmail").closeTab(aTab);
          aEvent.preventDefault();
        } catch (e) {
          logException(e);
        }
      }
      // Save the function we'll use as listener so we can remove it later.
      aTab.closeListener = onDOMWindowClose;
      // Add the listener.
      aTab.browser.addEventListener("DOMWindowClose", aTab.closeListener, true);
    },
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
   * If the web page is just an image, then we'll use the image itself it it
   * isn't too big.
   * Otherwise we'll use the site's favicon.ico if prefs allow us to.
   */
  useDefaultIcon(aTab) {
    var docURIObject = aTab.browser.contentDocument.documentURIObject;
    var icon = null;
    if (aTab.browser.contentDocument instanceof ImageDocument) {
      if (Services.prefs.getBoolPref("browser.chrome.site_icons")) {
        let sz = Services.prefs.getIntPref(
          "browser.chrome.image_icons.max_size"
        );
        try {
          let req = aTab.browser.contentDocument.imageRequest;
          if (
            req &&
            req.image &&
            req.image.width <= sz &&
            req.image.height <= sz
          ) {
            icon = aTab.browser.currentURI.spec;
          }
        } catch (e) {}
      }
    } else if (this._shouldLoadFavIcon(docURIObject)) {
      // Use documentURIObject in the check for shouldLoadFavIcon so that we do
      // the right thing with about:-style error pages.
      icon = docURIObject.prePath + "/favicon.ico";
    }

    specialTabs.setTabIcon(aTab, icon);
  },

  /**
   * This sets the specified tab to load and display the given icon for the
   * page shown in the browser. It is assumed that the preferences have already
   * been checked before calling this function apprioriately.
   *
   * @param aTab  The tab to set the icon for.
   * @param aIcon A string based URL of the icon to try and load.
   */
  setTabIcon(aTab, aIcon) {
    if (aIcon && this.mFaviconService) {
      this.mFaviconService.setAndFetchFaviconForPage(
        aTab.browser.currentURI,
        makeURI(aIcon),
        false,
        this.mFaviconService.FAVICON_LOAD_NON_PRIVATE,
        null,
        aTab.browser.contentPrincipal
      );
    }

    // Save this off so we know about it later,
    aTab.browser.mIconURL = aIcon;
    // and display the new icon.
    document.getElementById("tabmail").setTabIcon(aTab, aIcon);
  },
};

let documentObserver = {
  observe(document) {
    if (
      !document.location ||
      document.location.href !=
        "chrome://mozapps/content/extensions/aboutaddons.html"
    ) {
      return;
    }

    Services.scriptloader.loadSubScript(
      "chrome://messenger/content/aboutAddonsExtra.js",
      document.defaultView
    );
  },
};
Services.obs.addObserver(documentObserver, "chrome-document-interactive");
