/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/contentAreaUtils.js */
/* import-globals-from ../../../../toolkit/content/globalOverlay.js */
/* import-globals-from ../../../../toolkit/content/viewZoomOverlay.js */
/* import-globals-from commandglue.js */
/* import-globals-from mail-offline.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from msgHdrView.js */
/* import-globals-from msgMail3PaneWindow.js */
/* import-globals-from utilityOverlay.js */

// From netError.js
/* globals retryThis */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { appIdleManager } = ChromeUtils.import(
  "resource:///modules/AppIdleManager.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { Log4Moz } = ChromeUtils.import("resource:///modules/gloda/Log4moz.jsm");
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");

// This file stores variables common to mail windows
var messenger;
var statusFeedback;
var msgWindow;

var accountManager;

var gContextMenu;
var gMailWindowLog = Log4Moz.getConfiguredLogger(
  "mailWindow",
  Log4Moz.Level.Debug,
  Log4Moz.Level.Debug,
  Log4Moz.Level.Debug
);

/**
 * Called by messageWindow.xhtml:onunload,  the 'single message display window'.
 *
 * Also called by messenger.xhtml:onunload's (the 3-pane window inside of tabs
 *  window) unload function, OnUnloadMessenger.
 */
function OnMailWindowUnload() {
  MailOfflineMgr.uninit();
  ClearPendingReadTimer();

  // all dbview closing is handled by OnUnloadMessenger for the 3-pane (it closes
  //  the tabs which close their views) and OnUnloadMessageWindow for the
  //  standalone message window.

  MailServices.mailSession.RemoveMsgWindow(msgWindow);
  // the tabs have the FolderDisplayWidget close their 'messenger' instances for us

  window.browserDOMWindow = null;

  msgWindow.closeWindow();

  msgWindow.msgHeaderSink = null;
  msgWindow.notificationCallbacks = null;
  gDBView = null; // eslint-disable-line no-global-assign
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
  let browser = getBrowser();
  if (!browser) {
    return;
  }
  let sourceDoc = browser.contentDocument;
  if (e.target.ownerDocument != sourceDoc) {
    return; // We're only interested if this is in the message content.
  }

  let imgMap = new Map(); // Mapping img.src -> dataURL.

  // For copy, the data of what is to be copied is not accessible at this point.
  // Figure out what images are a) part of the selection and b) visible in
  // the current document. If their source isn't http or data already, convert
  // them to data URLs.

  let selection = sourceDoc.getSelection();
  let draggedImg = selection.isCollapsed ? e.target : null;
  for (let img of sourceDoc.images) {
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

    let style = window.getComputedStyle(img);
    if (style.display == "none" || style.visibility == "hidden") {
      continue;
    }

    // Do not convert if the image is specifically flagged to not snarf.
    if (img.getAttribute("moz-do-not-send") == "true") {
      continue;
    }

    // We don't need to wait for the image to load. If it isn't already loaded
    // in the source document, we wouldn't want it anyway.
    let canvas = sourceDoc.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0, img.width, img.height);

    let type = /\.jpe?g$/i.test(img.src) ? "image/jpg" : "image/png";
    imgMap.set(img.src, canvas.toDataURL(type));
  }

  if (imgMap.size == 0) {
    // Nothing that needs converting!
    return;
  }

  let clonedSelection = draggedImg
    ? draggedImg.cloneNode(false)
    : selection.getRangeAt(0).cloneContents();
  let div = sourceDoc.createElement("div");
  div.appendChild(clonedSelection);

  let images = div.querySelectorAll("img");
  for (let img of images) {
    if (!imgMap.has(img.src)) {
      continue;
    }
    img.src = imgMap.get(img.src);
  }

  let html = div.innerHTML;
  let parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
    Ci.nsIParserUtils
  );
  let plain = parserUtils.convertToPlainText(
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
  // get the messenger instance
  // eslint-disable-next-line no-global-assign
  messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

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

  statusFeedback = Cc["@mozilla.org/messenger/statusfeedback;1"].createInstance(
    Ci.nsIMsgStatusFeedback
  );
  statusFeedback.setWrappedStatusFeedback(window.MsgStatusFeedback);

  Cc["@mozilla.org/activity-manager;1"]
    .getService(Ci.nsIActivityManager)
    .addListener(window.MsgStatusFeedback);

  // Create message window object
  // eslint-disable-next-line no-global-assign
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );

  accountManager = MailServices.accounts;
}

function InitMsgWindow() {
  msgWindow.windowCommands = new nsMsgWindowCommands();
  // set the domWindow before setting the status feedback and header sink objects
  msgWindow.domWindow = window;
  msgWindow.statusFeedback = statusFeedback;
  msgWindow.msgHeaderSink = messageHeaderSink;
  MailServices.mailSession.AddMsgWindow(msgWindow);
  let messagepane = document.getElementById("messagepane");
  messagepane.docShell.allowAuth = false;
  messagepane.docShell.allowDNSPrefetch = false;
  msgWindow.rootDocShell.allowAuth = true;
  msgWindow.rootDocShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
  // Ensure we don't load xul error pages into the main window
  msgWindow.rootDocShell.useErrorPages = false;

  document.addEventListener("copy", onCopyOrDragStart, true);
  document.addEventListener("dragstart", onCopyOrDragStart, true);
  // Override Retry button to prevent unwanted url loads, see bug 1411748.
  messagepane.addEventListener("DOMContentLoaded", event => {
    if (!event.target.documentURI.startsWith("about:neterror?")) {
      return;
    }
    let button = event.target.getElementById("errorTryAgain");
    button.removeEventListener("click", function() {
      retryThis(this);
    });
    button.addEventListener("click", function() {
      ReloadMessage();
    });
  });

  // Run menubar initialization first, to avoid TabsInTitlebar code picking
  // up mutations from it and causing a reflow.
  if (AppConstants.platform != "macosx") {
    AutoHideMenubar.init();
  }
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
  _defaultStatusText: null,
  _progressBarVisible: false,
  _activeProcesses: null,
  _statusFeedbackProgress: -1,

  // unload - call to remove links to listeners etc.
  unload() {
    // Remove listeners for any active processes we have hooked ourselves into.
    this._activeProcesses.forEach(function(element) {
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
   * @param {String} url        - The href to display.
   * @param {Element} anchorElt - Element.
   */
  setOverLink(url, anchorElt) {
    if (url) {
      url = Services.textToSubURI.unEscapeURIForUI("UTF-8", url);

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
    this._statusText.value = statusText;
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

      this._activeProcesses.forEach(function(element) {
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
    this._activeProcesses = this._activeProcesses.filter(function(element) {
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
    let index = this._activeProcesses.indexOf(aActivity);

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

function nsMsgWindowCommands() {}

nsMsgWindowCommands.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgWindowCommands"]),

  selectFolder(folderUri) {
    gFolderTreeView.selectFolder(MailUtils.getOrCreateFolder(folderUri));
  },

  selectMessage(messageUri) {
    let msgHdr = messenger.msgHdrFromURI(messageUri);
    gFolderDisplay.selectMessage(msgHdr);
  },

  clearMsgPane() {
    // This call happens as part of a display decision made by the nsMsgDBView
    //  instance.  Strictly speaking, we don't want this.  I think davida's
    //  patch will change this, so we can figure it out after that lands if
    //  there are issues.
    ClearMessagePane();
  },
};

/**
 * Loads the mail start page.
 */
function loadStartPage(aForce) {
  // If the preference isn't enabled, then don't load anything.
  if (!aForce && !Services.prefs.getBoolPref("mailnews.start_page.enabled")) {
    return;
  }

  gMessageNotificationBar.clearMsgNotifications();
  let startpage = Services.urlFormatter.formatURLPref(
    "mailnews.start_page.url"
  );
  if (startpage) {
    try {
      let uri = Services.uriFixup.createFixupURI(startpage, 0);
      GetMessagePaneFrame().location.href = uri.spec;
    } catch (e) {
      Cu.reportError(e);
    }
  } else {
    GetMessagePaneFrame().location.href = "about:blank";
  }
}

/**
 * Returns the browser element of the current tab.
 * The zoom manager, view source and possibly some other functions still rely
 * on the getBrowser function.
 */
function getBrowser() {
  let tabmail = document.getElementById("tabmail");
  return tabmail ? tabmail.getBrowserForSelectedTab() : getMessagePaneBrowser();
}

/**
 * Returns the browser element of the message pane.
 */
function getMessagePaneBrowser() {
  return document.getElementById("messagepane");
}

/**
 * This function is global and expected by toolkit to get the notification box
 * for the browser for use with items like password manager.
 */
function getNotificationBox(aWindow) {
  var tabmail = document.getElementById("tabmail");
  var tabInfo = tabmail.tabInfo;

  for (var i = 0; i < tabInfo.length; ++i) {
    var browserFunc =
      tabInfo[i].mode.getBrowser || tabInfo[i].mode.tabType.getBrowser;
    if (browserFunc) {
      var possBrowser = browserFunc.call(tabInfo[i].mode.tabType, tabInfo[i]);
      if (
        possBrowser &&
        possBrowser.contentWindow == aWindow &&
        possBrowser.parentNode.tagName == "notificationbox"
      ) {
        return possBrowser.parentNode;
      }
    }
  }
  return null;
}

// Given the server, open the twisty and the set the selection
// on inbox of that server.
// prompt if offline.
function OpenInboxForServer(server) {
  gFolderTreeView.selectFolder(MailUtils.getInboxFolder(server));

  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    if (server.type != "imap") {
      GetMessagesForInboxOnServer(server);
    }
  }
}

/** Update state of zoom type (text vs. full) menu item. */
function UpdateFullZoomMenu() {
  let cmdItem = document.getElementById("cmd_fullZoomToggle");
  cmdItem.setAttribute("checked", !ZoomManager.useFullZoom);
}

// TODO: Add new error handling that uses this code. See bug 1547096.
function InformUserOfCertError(socketInfo, secInfo, targetSite) {
  let params = {
    exceptionAdded: false,
    securityInfo: secInfo,
    prefetchCert: true,
    location: targetSite,
  };
  window.openDialog(
    "chrome://pippki/content/exceptionDialog.xhtml",
    "",
    "chrome,centerscreen,modal",
    params
  );
}

function nsBrowserAccess() {}

nsBrowserAccess.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"]),

  // The following function may be called during account creation, it is called by
  // the test browser_newmailaccount.js::test_window_open_link_opening_behaviour.
  createContentWindow(
    aURI,
    aOpener,
    aWhere,
    aFlags,
    aTriggeringPrincipal = null,
    aCsp = null
  ) {
    return this.getContentWindowOrOpenURI(
      null,
      aOpener,
      aWhere,
      aFlags,
      aTriggeringPrincipal,
      aCsp,
      true
    );
  },

  openURI(
    aURI,
    aOpener,
    aWhere,
    aFlags,
    aTriggeringPrincipal = null,
    aCsp = null
  ) {
    if (!aURI) {
      Cu.reportError("openURI should only be called with a valid URI");
      throw Cr.NS_ERROR_FAILURE;
    }
    return this.getContentWindowOrOpenURI(
      aURI,
      aOpener,
      aWhere,
      aFlags,
      aTriggeringPrincipal,
      aCsp,
      false
    );
  },

  getContentWindowOrOpenURI(
    aURI,
    aOpener,
    aWhere,
    aFlags,
    aTriggeringPrincipal,
    aCsp,
    aSkipLoad
  ) {
    const nsIBrowserDOMWindow = Ci.nsIBrowserDOMWindow;
    let isExternal = !!(aFlags & nsIBrowserDOMWindow.OPEN_EXTERNAL);
    if (isExternal && aURI && aURI.schemeIs("chrome")) {
      Services.console.logStringMessage(
        "use -chrome command-line option to load external chrome urls\n"
      );
      return null;
    }

    let loadflags = isExternal
      ? Ci.nsIWebNavigation.LOAD_FLAGS_FROM_EXTERNAL
      : Ci.nsIWebNavigation.LOAD_FLAGS_NONE;

    if (aWhere != nsIBrowserDOMWindow.OPEN_NEWTAB) {
      Services.console.logStringMessage(
        "Opening a URI in something other than a new tab is not supported, opening in new tab instead"
      );
    }

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
      throw new Error("Couldn't get a suitable window for openURI");
    }

    let loadInBackground = Services.prefs.getBoolPref(
      "browser.tabs.loadDivertedInBackground"
    );

    let tabmail = win.document.getElementById("tabmail");
    let clickHandler = null;
    let browser = tabmail.getBrowserForDocument(window.content);
    if (browser) {
      clickHandler = browser.clickHandler;
    }

    let newTab = tabmail.openTab("contentTab", {
      contentPage: "about:blank",
      background: loadInBackground,
      opener: aOpener,
      clickHandler,
      skipLoad: aSkipLoad,
    });

    let docShell = newTab.browser.docShell;
    let newWindow = docShell.domWindow;
    let browsingContext = docShell.browsingContext;
    try {
      if (aURI) {
        let referrer = null;
        if (aOpener) {
          let location = aOpener.location;
          referrer = Services.io.newURI(location);
        }
        newWindow
          .getInterface(Ci.nsIWebNavigation)
          .loadURI(
            aURI.spec,
            loadflags,
            referrer,
            null,
            null,
            aTriggeringPrincipal
          );
      }
      if (needToFocusWin || (!loadInBackground && isExternal)) {
        newWindow.focus();
      }
    } catch (e) {}
    return browsingContext;
  },

  isTabContentWindow(aWindow) {
    return false;
  },
};

function MailSetCharacterSet(aEvent) {
  if (aEvent.target.hasAttribute("charset")) {
    msgWindow.mailCharacterSet = aEvent.target.getAttribute("charset");
    msgWindow.charsetOverride = true;
    gMessageDisplay.keyForCharsetOverride =
      "messageKey" in gMessageDisplay.displayedMessage
        ? gMessageDisplay.displayedMessage.messageKey
        : null;
  }
  messenger.setDocumentCharset(msgWindow.mailCharacterSet);
}

/**
 * Called from the extensions manager to open an add-on options XUL document.
 * Only the "open in tab" option is supported, so that's what we'll do here.
 */
function switchToTabHavingURI(aURI, aOpenNew, aOpenParams) {
  let tabmail = document.getElementById("tabmail");
  let matchingIndex = -1;
  if (tabmail) {
    // about:preferences should be opened through openPreferencesTab().
    if (aURI == "about:preferences") {
      openPreferencesTab();
      return true;
    }

    let openURI = makeURI(aURI);
    let tabInfo = tabmail.tabInfo;

    // Check if we already have the same URL open in a content tab.
    for (let tabIndex = 0; tabIndex < tabInfo.length; tabIndex++) {
      if (tabInfo[tabIndex].mode.name == "contentTab") {
        let browserFunc =
          tabInfo[tabIndex].mode.getBrowser ||
          tabInfo[tabIndex].mode.tabType.getBrowser;
        if (browserFunc) {
          let browser = browserFunc.call(
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
    // Open a new tab, keeping links from the new tab in Thunderbird if the regexp is set.
    if (aOpenParams && "handlerRegExp" in aOpenParams) {
      openContentTab(aURI, "tab", aOpenParams.handlerRegExp);
    } else {
      openContentTab(aURI, "tab");
    }
  }

  return false;
}
