/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is where functions related to the print engine are kept */

/* import-globals-from ../../../../toolkit/components/printing/content/printUtils.js */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  setTimeout: "resource://gre/modules/Timer.jsm",
  clearTimeout: "resource://gre/modules/Timer.jsm",
  MailE10SUtils: "resource:///modules/MailE10SUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

/* globals for a particular window */
var printSettings = null;
var uriArray;
var doPrintPreview;
var nextUriIndex = 0;

/* Functions related to startup */
function OnLoadPrintEngine() {
  PrintEngineCreateGlobals();
  InitPrintEngineWindow();

  addProgressListener();
  // Load the first URI.
  loadNext();
}

function PrintEngineCreateGlobals() {
  // This is needed so that we can handle OPEN_PRINT_BROWSER.
  window.browserDOMWindow = window.opener.browserDOMWindow;

  printSettings = PrintUtils.getPrintSettings();
  if (printSettings) {
    // Do not show message uri or data uri.
    printSettings.docURL = " ";
  }

  // argument 0: numSelected
  uriArray = window.arguments[1];
  // argument 2: statusFeedback
  doPrintPreview = window.arguments[3];
}

function addProgressListener() {
  getSourceBrowser().webProgress.addProgressListener(
    {
      loadingStarted: false,
      timer: null,
      QueryInterface: ChromeUtils.generateQI([
        "nsIWebProgressListener",
        "nsISupportsWeakReference",
      ]),
      onStateChange(progress, request, state, nsresult) {
        if (state & Ci.nsIWebProgressListener.STATE_START) {
          this.loadingStarted = true;
          this.timer = setTimeout(() => {
            if (this.loadingStarted) {
              this.loadingStarted = false;
              // Start print even when some remote contents are still loading.
              startPrint();
            }
          }, 10000);
        } else if (state & Ci.nsIWebProgressListener.STATE_STOP) {
          if (this.loadingStarted) {
            this.loadingStarted = false;
            clearTimeout(this.timer);
            // Start print when an URI is loaded.
            startPrint();
          }
        }
      },
    },
    Ci.nsIWebProgress.NOTIFY_STATE_ALL
  );
}

function getSourceBrowser() {
  return document.getElementById("content");
}

var PrintPreviewListener = {
  getPrintPreviewBrowser() {
    var sourceBrowser = getSourceBrowser();
    var remoteType = sourceBrowser.remoteType;
    var browser = document.getElementById("ppBrowser");
    if (!browser) {
      browser = document.createXULElement("browser");
      browser.setAttribute("id", "ppBrowser");
      browser.setAttribute("flex", "1");
      browser.setAttribute("disablehistory", "true");
      browser.setAttribute("disablesecurity", "true");
      browser.setAttribute("type", "content");
      browser.setAttribute(
        "initialBrowsingContextGroupId",
        this.getSourceBrowser().browsingContext.group.id
      );
      if (remoteType) {
        browser.setAttribute("remote", "true");
        browser.setAttribute("remoteType", remoteType);
      }
      document.documentElement.appendChild(browser);
    }
    return browser;
  },
  getSourceBrowser,
  getNavToolbox() {
    return document.getElementById("content");
  },
  onEnter() {
    let sourceBrowser = getSourceBrowser();
    setPPTitle(sourceBrowser.browsingContext.currentWindowGlobal.documentTitle);
    sourceBrowser.collapsed = true;
    showWindow(true);
  },
  onExit() {
    window.close();
  },
};

function setPPTitle(aTitle) {
  let title = aTitle;
  let gBrandBundle = document.getElementById("bundle_brand");
  let msgBundle = document.getElementById("bundle_messenger");
  let brandStr = gBrandBundle.getString("brandShortName");
  if (brandStr) {
    title = msgBundle.getFormattedString("PreviewTitle", [title, brandStr]);
  }
  document.title = title;
}

function InitPrintEngineWindow() {
  let sourceBrowser = getSourceBrowser();
  // Register the event listener to be able to replace the document
  // content with the user selection when loading is finished.
  if (window.opener.content) {
    sourceBrowser.addEventListener(
      "load",
      () => {
        var selection = window.opener.content.getSelection();

        if (selection && !selection.isCollapsed) {
          var range = selection.getRangeAt(0);
          var contents = range.cloneContents();

          var aBody = window.content.document.querySelector("body");

          /* Replace the content of <body> with the users' selection. */
          if (aBody) {
            aBody.innerHTML = "";
            aBody.appendChild(contents);
          }
        }
      },
      true
    );
  }
  sourceBrowser.docShell.charset = "UTF-8";

  showWindow(false);
}

/**
 * Set the visibility of the current msgPrintEngine.xhtml dialog window.
 */
function showWindow(visibility) {
  window.docShell.treeOwner.QueryInterface(
    Ci.nsIBaseWindow
  ).visibility = visibility;
}

/**
 * Load a uri into sourceBrowser. When the uri is loaded, onStateChange will be
 * called.
 */
function loadNext() {
  let uri = uriArray[nextUriIndex++];
  if (!uri) {
    window.close();
    return;
  }

  if (
    (uri.startsWith("data:") ||
      uri.startsWith("blob:") ||
      uri == "about:blank") &&
    !uri.includes("type=application/x-message-display")
  ) {
    // Calendar, address book or other links.
    MailE10SUtils.loadURI(getSourceBrowser(), uri);
  } else {
    // Message uri.
    let messenger = Cc["@mozilla.org/messenger;1"].getService(Ci.nsIMessenger);
    let msgSvc = messenger.messageServiceFromURI(uri);
    let out = {};
    msgSvc.DisplayMessageForPrinting(
      uri,
      getSourceBrowser().docShell,
      null,
      null,
      out
    );
  }
}

/**
 * Start print or print preview.
 */
async function startPrint() {
  if (doPrintPreview) {
    // Print preview.
    PrintPreviewListener.getPrintPreviewBrowser();
    PrintUtils.printPreview(PrintPreviewListener);
  } else {
    // Print.
    if (nextUriIndex == 1) {
      // Only show the print dialog for the first URI.
      try {
        let svc = Cc[
          "@mozilla.org/embedcomp/printingprompt-service;1"
        ].getService(Ci.nsIPrintingPromptService);
        svc.showPrintDialog(window, printSettings);
      } catch (e) {
        if (e.result != Cr.NS_ERROR_ABORT) {
          // NS_ERROR_ABORT means cancelled by user.
          console.error(e);
        }
        window.close();
        return;
      }
    }
    printSettings.printSilent = true;
    try {
      await PrintUtils.printWindow(
        getSourceBrowser().browsingContext,
        printSettings
      );
    } catch (e) {
      console.error(e);
      window.close();
      return;
    }
    loadNext();
  }
}
