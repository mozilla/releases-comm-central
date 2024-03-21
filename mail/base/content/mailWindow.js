/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/contentAreaUtils.js */
/* import-globals-from ../../../../toolkit/content/viewZoomOverlay.js */
/* import-globals-from globalOverlay.js */
/* import-globals-from mail-offline.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messenger.js */
/* import-globals-from utilityOverlay.js */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  appIdleManager: "resource:///modules/AppIdleManager.sys.mjs",
});

XPCOMUtils.defineLazyScriptGetter(
  this,
  "PrintUtils",
  "chrome://messenger/content/printUtils.js"
);

// This file stores variables common to mail windows
var messenger;
var statusFeedback;
var msgWindow;

UIDensity.registerWindow(window);

/**
 * Called by messageWindow.xhtml:onunload,  the 'single message display window'.
 *
 * Also called by messenger.xhtml:onunload's (the 3-pane window inside of tabs
 *  window) unload function, OnUnloadMessenger.
 */
function OnMailWindowUnload() {
  MailOfflineMgr.uninit();

  // all dbview closing is handled by OnUnloadMessenger for the 3-pane (it closes
  //  the tabs which close their views) and OnUnloadMessageWindow for the
  //  standalone message window.

  MailServices.mailSession.RemoveMsgWindow(msgWindow);
  // the tabs have the FolderDisplayWidget close their 'messenger' instances for us

  window.browserDOMWindow = null;

  msgWindow.closeWindow();

  window.MsgStatusFeedback.unload();
  Cc["@mozilla.org/activity-manager;1"]
    .getService(Ci.nsIActivityManager)
    .removeListener(window.MsgStatusFeedback);
}

/**
 * When copying/dragging, convert imap/mailbox URLs of images into data URLs so
 * that the images can be accessed in a paste elsewhere.
 */
function onCopyOrDragStart(e) {
  const browser = getBrowser();
  if (!browser) {
    return;
  }

  // We're only interested if this is in the message content.
  const sourceDoc = browser.contentDocument;
  if (e.target.ownerDocument != sourceDoc) {
    return;
  }
  const sourceURL = sourceDoc.URL;
  const protocol = sourceURL.substr(0, sourceURL.indexOf(":")).toLowerCase();
  if (
    !(
      Services.io.getProtocolHandler(protocol) instanceof
      Ci.nsIMsgMessageFetchPartService
    )
  ) {
    // Can't fetch parts, not a message protocol, don't process.
    return;
  }

  const imgMap = new Map(); // Mapping img.src -> dataURL.

  // For copy, the data of what is to be copied is not accessible at this point.
  // Figure out what images are a) part of the selection and b) visible in
  // the current document. If their source isn't http or data already, convert
  // them to data URLs.

  const selection = sourceDoc.getSelection();
  const draggedImg = selection.isCollapsed ? e.target : null;
  for (const img of sourceDoc.images) {
    if (/^(https?|data):/.test(img.src)) {
      continue;
    }

    if (img.naturalWidth == 0) {
      // Broken/inaccessible image then...
      continue;
    }

    if (!draggedImg && !selection.containsNode(img, true)) {
      continue;
    }

    const style = window.getComputedStyle(img);
    if (style.display == "none" || style.visibility == "hidden") {
      continue;
    }

    // Do not convert if the image is specifically flagged to not snarf.
    if (img.getAttribute("moz-do-not-send") == "true") {
      continue;
    }

    // We don't need to wait for the image to load. If it isn't already loaded
    // in the source document, we wouldn't want it anyway.
    const canvas = sourceDoc.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0, img.width, img.height);

    const type = /\.jpe?g$/i.test(img.src) ? "image/jpg" : "image/png";
    imgMap.set(img.src, canvas.toDataURL(type));
  }

  if (imgMap.size == 0) {
    // Nothing that needs converting!
    return;
  }

  const clonedSelection = draggedImg
    ? draggedImg.cloneNode(false)
    : selection.getRangeAt(0).cloneContents();
  const div = sourceDoc.createElement("div");
  div.appendChild(clonedSelection);

  const images = div.querySelectorAll("img");
  for (const img of images) {
    if (!imgMap.has(img.src)) {
      continue;
    }
    img.src = imgMap.get(img.src);
  }

  const html = div.innerHTML;
  const parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
    Ci.nsIParserUtils
  );
  const plain = parserUtils.convertToPlainText(
    html,
    Ci.nsIDocumentEncoder.OutputForPlainTextClipboardCopy,
    0
  );
  if ("clipboardData" in e) {
    // copy
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", plain);
    e.preventDefault();
  } else if ("dataTransfer" in e) {
    // drag
    e.dataTransfer.setData("text/html", html);
    e.dataTransfer.setData("text/plain", plain);
  }
}

function CreateMailWindowGlobals() {
  // Create message window object
  // eslint-disable-next-line no-global-assign
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  // get the messenger instance
  // eslint-disable-next-line no-global-assign
  messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
  messenger.setWindow(window, msgWindow);

  window.addEventListener("blur", appIdleManager.onBlur);
  window.addEventListener("focus", appIdleManager.onFocus);

  // Create windows status feedback
  // set the JS implementation of status feedback before creating the c++ one..
  window.MsgStatusFeedback = new nsMsgStatusFeedback();
  // double register the status feedback object as the xul browser window implementation
  window
    .getInterface(Ci.nsIWebNavigation)
    .QueryInterface(Ci.nsIDocShellTreeItem)
    .treeOwner.QueryInterface(Ci.nsIInterfaceRequestor)
    .getInterface(Ci.nsIAppWindow).XULBrowserWindow = window.MsgStatusFeedback;

  window.browserDOMWindow = new nsBrowserAccess();

  // eslint-disable-next-line no-global-assign
  statusFeedback = Cc["@mozilla.org/messenger/statusfeedback;1"].createInstance(
    Ci.nsIMsgStatusFeedback
  );
  statusFeedback.setWrappedStatusFeedback(window.MsgStatusFeedback);

  Cc["@mozilla.org/activity-manager;1"]
    .getService(Ci.nsIActivityManager)
    .addListener(window.MsgStatusFeedback);
}

function toggleCaretBrowsing() {
  const enabledPref = "accessibility.browsewithcaret_shortcut.enabled";
  const warnPref = "accessibility.warn_on_browsewithcaret";
  const caretPref = "accessibility.browsewithcaret";

  if (!Services.prefs.getBoolPref(enabledPref)) {
    return;
  }

  let useCaret = Services.prefs.getBoolPref(caretPref, false);
  const warn = Services.prefs.getBoolPref(warnPref, true);
  if (!warn || useCaret) {
    // Toggle immediately.
    try {
      Services.prefs.setBoolPref(caretPref, !useCaret);
    } catch (ex) {}
    return;
  }

  // Async prompt.
  document.l10n
    .formatValues([
      { id: "caret-browsing-prompt-title" },
      { id: "caret-browsing-prompt-text" },
      { id: "caret-browsing-prompt-check-text" },
    ])
    .then(([title, promptText, checkText]) => {
      const checkValue = { value: false };

      useCaret =
        0 ===
        Services.prompt.confirmEx(
          window,
          title,
          promptText,
          Services.prompt.STD_YES_NO_BUTTONS |
            Services.prompt.BUTTON_POS_1_DEFAULT,
          null,
          null,
          null,
          checkText,
          checkValue
        );

      if (checkValue.value) {
        if (useCaret) {
          try {
            Services.prefs.setBoolPref(warnPref, false);
          } catch (ex) {}
        } else {
          try {
            Services.prefs.setBoolPref(enabledPref, false);
          } catch (ex) {}
        }
      }
      try {
        Services.prefs.setBoolPref(caretPref, useCaret);
      } catch (ex) {}
    });
}

function InitMsgWindow() {
  // Set the domWindow before setting the status feedback object.
  msgWindow.domWindow = window;
  msgWindow.statusFeedback = statusFeedback;
  MailServices.mailSession.AddMsgWindow(msgWindow);
  msgWindow.rootDocShell.allowAuth = true;
  // Ensure we don't load xul error pages into the main window
  msgWindow.rootDocShell.useErrorPages = false;

  document.addEventListener("dragstart", onCopyOrDragStart, true);

  const keypressListener = {
    handleEvent: event => {
      if (event.defaultPrevented) {
        return;
      }

      switch (event.code) {
        case "F7":
          // shift + F7 is the default DevTools shortcut for the Style Editor.
          if (!event.shiftKey) {
            toggleCaretBrowsing();
          }
          break;
      }
    },
  };
  document.addEventListener("keypress", keypressListener, {
    mozSystemGroup: true,
  });
}

// We're going to implement our status feedback for the mail window in JS now.
// the following contains the implementation of our status feedback object

function nsMsgStatusFeedback() {
  this._statusText = document.getElementById("statusText");
  this._statusPanel = document.getElementById("statusbar-display");
  this._progressBar = document.getElementById("statusbar-icon");
  this._progressBarContainer = document.getElementById(
    "statusbar-progresspanel"
  );
  this._throbber = document.getElementById("throbber-box");
  this._activeProcesses = [];

  // make sure the stop button is accurate from the get-go
  goUpdateCommand("cmd_stop");
}

/**
 * @implements {nsIMsgStatusFeedback}
 * @implements {nsIXULBrowserWindow}
 * @implements {nsIActivityMgrListener}
 * @implements {nsIActivityListener}
 * @implements {nsISupportsWeakReference}
 */
nsMsgStatusFeedback.prototype = {
  // Document elements.
  _statusText: null,
  _statusPanel: null,
  _progressBar: null,
  _progressBarContainer: null,
  _throbber: null,

  // Member variables.
  _startTimeoutID: null,
  _stopTimeoutID: null,
  // How many start meteors have been requested.
  _startRequests: 0,
  _meteorsSpinning: false,
  _defaultStatusText: "",
  _progressBarVisible: false,
  _activeProcesses: null,
  _statusFeedbackProgress: -1,
  _statusLastShown: 0,
  _lastStatusText: null,

  // unload - call to remove links to listeners etc.
  unload() {
    // Remove listeners for any active processes we have hooked ourselves into.
    this._activeProcesses.forEach(function (element) {
      element.removeListener(this);
    }, this);
  },

  // nsIXULBrowserWindow implementation.
  setJSStatus(status) {
    if (status.length > 0) {
      this.showStatusString(status);
    }
  },

  /*
   * Set the statusbar display for hovered links, from browser.js.
   *
   * @param {String} url - The href to display.
   * @param {Element} anchorElt - Element.
   */
  setOverLink(url, anchorElt) {
    if (url) {
      url = Services.textToSubURI.unEscapeURIForUI(url);

      // Encode bidirectional formatting characters.
      // (RFC 3987 sections 3.2 and 4.1 paragraph 6)
      url = url.replace(
        /[\u200e\u200f\u202a\u202b\u202c\u202d\u202e]/g,
        encodeURIComponent
      );
    }

    if (!document.getElementById("status-bar").hidden) {
      this._statusText.value = url;
    } else {
      // Statusbar invisible: Show link in statuspanel instead.
      // TODO: consider porting the Firefox implementation of LinkTargetDisplay.
      this._statusPanel.label = url;
    }
  },

  // Called before links are navigated to to allow us to retarget them if needed.
  onBeforeLinkTraversal(originalTarget, linkURI, linkNode, isAppTab) {
    return originalTarget;
  },

  // Called by BrowserParent::RecvShowTooltip, needed for tooltips in content tabs.
  showTooltip(xDevPix, yDevPix, tooltip, direction, browser) {
    if (
      Cc["@mozilla.org/widget/dragservice;1"]
        .getService(Ci.nsIDragService)
        .getCurrentSession()
    ) {
      return;
    }

    const elt = document.getElementById("remoteBrowserTooltip");
    elt.label = tooltip;
    elt.style.direction = direction;
    elt.openPopupAtScreen(
      xDevPix / window.devicePixelRatio,
      yDevPix / window.devicePixelRatio,
      false,
      null
    );
  },

  // Called by BrowserParent::RecvHideTooltip, needed for tooltips in content tabs.
  hideTooltip() {
    const elt = document.getElementById("remoteBrowserTooltip");
    elt.hidePopup();
  },

  getTabCount() {
    const tabmail = document.getElementById("tabmail");
    // messageWindow.xhtml does not have multiple tabs.
    return tabmail ? tabmail.tabs.length : 1;
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIMsgStatusFeedback",
    "nsIXULBrowserWindow",
    "nsIActivityMgrListener",
    "nsIActivityListener",
    "nsISupportsWeakReference",
  ]),

  // nsIMsgStatusFeedback implementation.
  showStatusString(statusText) {
    if (!statusText) {
      statusText = this._defaultStatusText;
    } else {
      this._defaultStatusText = "";
    }
    // Let's make sure the display doesn't flicker.
    const timeBetweenDisplay = 500;
    const now = Date.now();
    if (now - this._statusLastShown > timeBetweenDisplay) {
      // Cancel any pending status message. The timeout is not guaranteed
      // to run within timeBetweenDisplay milliseconds.
      this._lastStatusText = null;

      this._statusLastShown = now;
      if (this._statusText.value != statusText) {
        this._statusText.value = statusText;
      }
    } else {
      if (this._lastStatusText !== null) {
        // There's already a pending display. Replace it.
        this._lastStatusText = statusText;
        return;
      }
      // Arrange for this to be shown in timeBetweenDisplay milliseconds.
      this._lastStatusText = statusText;
      setTimeout(() => {
        if (this._lastStatusText !== null) {
          this._statusLastShown = Date.now();
          if (this._statusText.value != this._lastStatusText) {
            this._statusText.value = this._lastStatusText;
          }
          this._lastStatusText = null;
        }
      }, timeBetweenDisplay);
    }
  },

  setStatusString(status) {
    if (status.length > 0) {
      this._defaultStatusText = status;
      this._statusText.value = status;
    }
  },

  _startMeteors() {
    this._meteorsSpinning = true;
    this._startTimeoutID = null;

    // Turn progress meter on.
    this.updateProgress();

    // Start the throbber.
    if (this._throbber) {
      this._throbber.setAttribute("busy", true);
    }

    document.querySelector(".throbber")?.classList.add("busy");

    // Update the stop button
    goUpdateCommand("cmd_stop");
  },

  startMeteors() {
    this._startRequests++;
    // If we don't already have a start meteor timeout pending
    // and the meteors aren't spinning, then kick off a start.
    if (
      !this._startTimeoutID &&
      !this._meteorsSpinning &&
      "MsgStatusFeedback" in window
    ) {
      this._startTimeoutID = setTimeout(
        () => window.MsgStatusFeedback._startMeteors(),
        500
      );
    }

    // Since we are going to start up the throbber no sense in processing
    // a stop timeout...
    if (this._stopTimeoutID) {
      clearTimeout(this._stopTimeoutID);
      this._stopTimeoutID = null;
    }
  },

  _stopMeteors() {
    this.showStatusString(this._defaultStatusText);

    // stop the throbber
    if (this._throbber) {
      this._throbber.setAttribute("busy", false);
    }

    document.querySelector(".throbber")?.classList.remove("busy");

    this._meteorsSpinning = false;
    this._stopTimeoutID = null;

    // Turn progress meter off.
    this._statusFeedbackProgress = -1;
    this.updateProgress();

    // Update the stop button
    goUpdateCommand("cmd_stop");
  },

  stopMeteors() {
    if (this._startRequests > 0) {
      this._startRequests--;
    }

    // If we are going to be starting the meteors, cancel the start.
    if (this._startRequests == 0 && this._startTimeoutID) {
      clearTimeout(this._startTimeoutID);
      this._startTimeoutID = null;
    }

    // If we have no more pending starts and we don't have a stop timeout
    // already in progress AND the meteors are currently running then fire a
    // stop timeout to shut them down.
    if (
      this._startRequests == 0 &&
      !this._stopTimeoutID &&
      this._meteorsSpinning &&
      "MsgStatusFeedback" in window
    ) {
      this._stopTimeoutID = setTimeout(
        () => window.MsgStatusFeedback._stopMeteors(),
        500
      );
    }
  },

  showProgress(percentage) {
    this._statusFeedbackProgress = percentage;
    this.updateProgress();
  },

  updateProgress() {
    if (this._meteorsSpinning) {
      // In this function, we expect that the maximum for each progress is 100,
      // i.e. we are dealing with percentages. Hence we can combine several
      // processes running at the same time.
      let currentProgress = 0;
      let progressCount = 0;

      // For each activity that is in progress, get its status.

      this._activeProcesses.forEach(function (element) {
        if (
          element.state == Ci.nsIActivityProcess.STATE_INPROGRESS &&
          element.percentComplete != -1
        ) {
          currentProgress += element.percentComplete;
          ++progressCount;
        }
      });

      // Add the generic progress that's fed to the status feedback object if
      // we've got one.
      if (this._statusFeedbackProgress != -1) {
        currentProgress += this._statusFeedbackProgress;
        ++progressCount;
      }

      let percentage = 0;
      if (progressCount) {
        percentage = currentProgress / progressCount;
      }

      if (!percentage) {
        this._progressBar.removeAttribute("value");
      } else {
        this._progressBar.value = percentage;
        this._progressBar.label = Math.round(percentage) + "%";
      }
      if (!this._progressBarVisible) {
        this._progressBarContainer.removeAttribute("collapsed");
        this._progressBarVisible = true;
      }
    } else {
      // Stop the bar spinning as we're not doing anything now.
      this._progressBar.value = 0;
      this._progressBar.label = "";

      if (this._progressBarVisible) {
        this._progressBarContainer.collapsed = true;
        this._progressBarVisible = false;
      }
    }
  },

  // nsIActivityMgrListener
  onAddedActivity(aID, aActivity) {
    // ignore Gloda activity for status bar purposes
    if (aActivity.initiator == Gloda) {
      return;
    }
    if (aActivity instanceof Ci.nsIActivityEvent) {
      this.showStatusString(aActivity.displayText);
    } else if (aActivity instanceof Ci.nsIActivityProcess) {
      this._activeProcesses.push(aActivity);
      aActivity.addListener(this);
      this.startMeteors();
    }
  },

  onRemovedActivity(aID) {
    this._activeProcesses = this._activeProcesses.filter(function (element) {
      if (element.id == aID) {
        element.removeListener(this);
        this.stopMeteors();
        return false;
      }
      return true;
    }, this);
  },

  // nsIActivityListener
  onStateChanged(aActivity, aOldState) {},

  onProgressChanged(
    aActivity,
    aStatusText,
    aWorkUnitsCompleted,
    aTotalWorkUnits
  ) {
    const index = this._activeProcesses.indexOf(aActivity);

    // Iterate through the list trying to find the first active process, but
    // only go as far as our process.
    for (var i = 0; i < index; ++i) {
      if (
        this._activeProcesses[i].status ==
        Ci.nsIActivityProcess.STATE_INPROGRESS
      ) {
        break;
      }
    }

    // If the found activity was the same as our activity, update the status
    // text.
    if (i == index) {
      // Use the display text if we haven't got any status text. I'm assuming
      // that the status text will be generally what we want to see on the
      // status bar.
      this.showStatusString(aStatusText ? aStatusText : aActivity.displayText);
    }

    this.updateProgress();
  },

  onHandlerChanged(aActivity) {},
};

/**
 * Returns the browser element of the current tab.
 * The zoom manager, view source and possibly some other functions still rely
 * on the getBrowser function.
 */
function getBrowser() {
  const tabmail = document.getElementById("tabmail");
  return tabmail ? tabmail.getBrowserForSelectedTab() : null;
}

// Given the server, open the twisty and the set the selection
// on inbox of that server.
// prompt if offline.
function OpenInboxForServer(server) {
  // TODO: Reimplement this or fix the caller?
}

/** Update state of zoom type (text vs. full) menu item. */
function UpdateFullZoomMenu() {
  const cmdItem = document.getElementById("cmd_fullZoomToggle");
  cmdItem.setAttribute("checked", !ZoomManager.useFullZoom);
}

window.addEventListener("DoZoomEnlargeBy10", event =>
  ZoomManager.scrollZoomEnlarge(event.target)
);

window.addEventListener("DoZoomReduceBy10", event =>
  ZoomManager.scrollReduceEnlarge(event.target)
);

function nsBrowserAccess() {}

nsBrowserAccess.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"]),

  _openURIInNewTab(
    aURI,
    aReferrerInfo,
    aIsExternal,
    aOpenWindowInfo = null,
    aTriggeringPrincipal = null,
    aCsp = null,
    aSkipLoad = false,
    aMessageManagerGroup = null
  ) {
    let win, needToFocusWin;

    // Try the current window. If we're in a popup, fall back on the most
    // recent browser window.
    if (!window.document.documentElement.getAttribute("chromehidden")) {
      win = window;
    } else {
      win = getMostRecentMailWindow();
      needToFocusWin = true;
    }

    if (!win) {
      // we couldn't find a suitable window, a new one needs to be opened.
      return null;
    }

    const loadInBackground = Services.prefs.getBoolPref(
      "browser.tabs.loadDivertedInBackground"
    );

    const tabmail = win.document.getElementById("tabmail");
    const newTab = tabmail.openTab("contentTab", {
      background: loadInBackground,
      csp: aCsp,
      linkHandler: aMessageManagerGroup,
      openWindowInfo: aOpenWindowInfo,
      referrerInfo: aReferrerInfo,
      skipLoad: aSkipLoad,
      triggeringPrincipal: aTriggeringPrincipal,
      url: aURI ? aURI.spec : "about:blank",
    });

    if (needToFocusWin || (!loadInBackground && aIsExternal)) {
      win.focus();
    }

    return newTab.browser;
  },

  createContentWindow(
    aURI,
    aOpenWindowInfo,
    aWhere,
    aFlags,
    aTriggeringPrincipal,
    aCsp
  ) {
    return this.getContentWindowOrOpenURI(
      null,
      aOpenWindowInfo,
      aWhere,
      aFlags,
      aTriggeringPrincipal,
      aCsp,
      true
    );
  },

  createContentWindowInFrame(aURI, aParams, aWhere, aFlags, aName) {
    // Passing a null-URI to only create the content window,
    // and pass true for aSkipLoad to prevent loading of
    // about:blank
    return this.getContentWindowOrOpenURIInFrame(
      null,
      aParams,
      aWhere,
      aFlags,
      aName,
      true
    );
  },

  openURI(aURI, aOpenWindowInfo, aWhere, aFlags, aTriggeringPrincipal, aCsp) {
    if (!aURI) {
      throw Components.Exception(
        "openURI should only be called with a valid URI",
        Cr.NS_ERROR_FAILURE
      );
    }
    return this.getContentWindowOrOpenURI(
      aURI,
      aOpenWindowInfo,
      aWhere,
      aFlags,
      aTriggeringPrincipal,
      aCsp,
      false
    );
  },

  openURIInFrame(aURI, aParams, aWhere, aFlags, aName) {
    return this.getContentWindowOrOpenURIInFrame(
      aURI,
      aParams,
      aWhere,
      aFlags,
      aName,
      false
    );
  },

  getContentWindowOrOpenURI(
    aURI,
    aOpenWindowInfo,
    aWhere,
    aFlags,
    aTriggeringPrincipal,
    aCsp,
    aSkipLoad
  ) {
    if (aWhere == Ci.nsIBrowserDOMWindow.OPEN_PRINT_BROWSER) {
      const browser =
        PrintUtils.handleStaticCloneCreatedForPrint(aOpenWindowInfo);
      return browser ? browser.browsingContext : null;
    }

    const isExternal = !!(aFlags & Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL);

    if (aOpenWindowInfo && isExternal) {
      throw Components.Exception(
        "nsBrowserAccess.openURI did not expect aOpenWindowInfo to be " +
          "passed if the context is OPEN_EXTERNAL.",
        Cr.NS_ERROR_FAILURE
      );
    }

    if (isExternal && aURI && aURI.schemeIs("chrome")) {
      Services.console.logStringMessage(
        "use -chrome command-line option to load external chrome urls\n"
      );
      return null;
    }

    const ReferrerInfo = Components.Constructor(
      "@mozilla.org/referrer-info;1",
      "nsIReferrerInfo",
      "init"
    );

    let referrerInfo;
    if (aFlags & Ci.nsIBrowserDOMWindow.OPEN_NO_REFERRER) {
      referrerInfo = new ReferrerInfo(Ci.nsIReferrerInfo.EMPTY, false, null);
    } else if (
      aOpenWindowInfo &&
      aOpenWindowInfo.parent &&
      aOpenWindowInfo.parent.window
    ) {
      referrerInfo = new ReferrerInfo(
        aOpenWindowInfo.parent.window.document.referrerInfo.referrerPolicy,
        true,
        makeURI(aOpenWindowInfo.parent.window.location.href)
      );
    } else {
      referrerInfo = new ReferrerInfo(Ci.nsIReferrerInfo.EMPTY, true, null);
    }

    if (aWhere != Ci.nsIBrowserDOMWindow.OPEN_NEWTAB) {
      Services.console.logStringMessage(
        "Opening a URI in something other than a new tab is not supported, opening in new tab instead"
      );
    }

    const browser = this._openURIInNewTab(
      aURI,
      referrerInfo,
      isExternal,
      aOpenWindowInfo,
      aTriggeringPrincipal,
      aCsp,
      aSkipLoad,
      aOpenWindowInfo?.openerBrowser?.getAttribute("messagemanagergroup")
    );

    return browser ? browser.browsingContext : null;
  },

  getContentWindowOrOpenURIInFrame(
    aURI,
    aParams,
    aWhere,
    aFlags,
    aName,
    aSkipLoad
  ) {
    if (aWhere == Ci.nsIBrowserDOMWindow.OPEN_PRINT_BROWSER) {
      return PrintUtils.handleStaticCloneCreatedForPrint(
        aParams.openWindowInfo
      );
    }

    if (aWhere != Ci.nsIBrowserDOMWindow.OPEN_NEWTAB) {
      Services.console.logStringMessage(
        "Error: openURIInFrame can only open in new tabs or print"
      );
      return null;
    }

    const isExternal = !!(aFlags & Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL);

    return this._openURIInNewTab(
      aURI,
      aParams.referrerInfo,
      isExternal,
      aParams.openWindowInfo,
      aParams.triggeringPrincipal,
      aParams.csp,
      aSkipLoad,
      aParams.openerBrowser?.getAttribute("messagemanagergroup")
    );
  },

  canClose() {
    return true;
  },

  get tabCount() {
    const tabmail = document.getElementById("tabmail");
    // messageWindow.xhtml does not have multiple tabs.
    return tabmail ? tabmail.tabInfo.length : 1;
  },
};

/**
 * Called from the extensions manager to open an add-on options XUL document.
 * Only the "open in tab" option is supported, so that's what we'll do here.
 */
function switchToTabHavingURI(aURI, aOpenNew, aOpenParams = {}) {
  const tabmail = document.getElementById("tabmail");
  let matchingIndex = -1;
  if (tabmail) {
    // about:preferences should be opened through openPreferencesTab().
    if (aURI == "about:preferences") {
      openPreferencesTab();
      return true;
    }

    const openURI = makeURI(aURI);
    const tabInfo = tabmail.tabInfo;

    // Check if we already have the same URL open in a content tab.
    for (let tabIndex = 0; tabIndex < tabInfo.length; tabIndex++) {
      if (tabInfo[tabIndex].mode.name == "contentTab") {
        const browserFunc =
          tabInfo[tabIndex].mode.getBrowser ||
          tabInfo[tabIndex].mode.tabType.getBrowser;
        if (browserFunc) {
          const browser = browserFunc.call(
            tabInfo[tabIndex].mode.tabType,
            tabInfo[tabIndex]
          );
          if (browser.currentURI.equals(openURI)) {
            matchingIndex = tabIndex;
            break;
          }
        }
      }
    }
  }

  // Open the found matching tab.
  if (tabmail && matchingIndex > -1) {
    tabmail.switchToTab(matchingIndex);
    return true;
  }

  if (aOpenNew) {
    tabmail.openTab("contentTab", { ...aOpenParams, url: aURI });
  }

  return false;
}

/**
 * Combines all nsIWebProgress notifications from all content browsers in this
 * window and reports them to the registered listeners.
 *
 * @see WindowTracker (ext-mail.js)
 * @see StatusListener, WindowTrackerBase (ext-tabs-base.js)
 */
var contentProgress = {
  _listeners: new Set(),

  addListener(listener) {
    this._listeners.add(listener);
  },

  removeListener(listener) {
    this._listeners.delete(listener);
  },

  callListeners(method, args) {
    for (const listener of this._listeners.values()) {
      if (method in listener) {
        try {
          listener[method](...args);
        } catch (e) {
          console.error(e);
        }
      }
    }
  },

  /**
   * Ensure that `browser` has a ProgressListener attached to it.
   *
   * @param {Browser} browser
   */
  addProgressListenerToBrowser(browser) {
    if (browser?.webProgress && !browser._progressListener) {
      browser._progressListener = new contentProgress.ProgressListener(browser);
      browser.webProgress.addProgressListener(
        browser._progressListener,
        Ci.nsIWebProgress.NOTIFY_ALL
      );
    }
  },

  // @implements {nsIWebProgressListener}
  // @implements {nsIWebProgressListener2}
  ProgressListener: class {
    QueryInterface = ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsIWebProgressListener2",
      "nsISupportsWeakReference",
    ]);

    constructor(browser) {
      this.browser = browser;
    }

    callListeners(method, args) {
      if (this.browser.hidden) {
        // Ignore events from hidden browsers. This should avoid confusion in
        // about:3pane, where multiple browsers could send events.
        return;
      }
      args.unshift(this.browser);
      contentProgress.callListeners(method, args);
    }

    onProgressChange(...args) {
      this.callListeners("onProgressChange", args);
    }

    onProgressChange64(...args) {
      this.callListeners("onProgressChange64", args);
    }

    onLocationChange(...args) {
      this.callListeners("onLocationChange", args);
    }

    onStateChange(...args) {
      this.callListeners("onStateChange", args);
    }

    onStatusChange(...args) {
      this.callListeners("onStatusChange", args);
    }

    onSecurityChange(...args) {
      this.callListeners("onSecurityChange", args);
    }

    onContentBlockingEvent(...args) {
      this.callListeners("onContentBlockingEvent", args);
    }

    onRefreshAttempted(...args) {
      return this.callListeners("onRefreshAttempted", args);
    }
  },
};

window.addEventListener("aboutMessageLoaded", event => {
  // Add a progress listener to any about:message content browser that comes
  // along. This often happens after the tab is opened so the usual mechanism
  // doesn't work. It also works for standalone message windows.
  contentProgress.addProgressListenerToBrowser(
    event.target.getMessagePaneBrowser()
  );
  // Also add a copy listener so we can process images.
  event.target.document.addEventListener("copy", onCopyOrDragStart, true);
});

// Listener to correctly set the busy flag on the webBrowser in about:3pane. All
// other content tabs are handled by tabmail.js.
contentProgress.addListener({
  onStateChange(browser, webProgress, request, stateFlags, statusCode) {
    // Skip if this is not the webBrowser in about:3pane.
    if (browser.id != "webBrowser") {
      return;
    }
    let status;
    if (stateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) {
      if (stateFlags & Ci.nsIWebProgressListener.STATE_START) {
        status = "loading";
      } else if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        status = "complete";
      }
    } else if (
      stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
      statusCode == Cr.NS_BINDING_ABORTED
    ) {
      status = "complete";
    }
    browser.busy = status == "loading";
  },
});
