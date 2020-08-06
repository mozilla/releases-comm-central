/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is where functions related to the print engine are kept */

/* import-globals-from ../../../../toolkit/components/printing/content/printUtils.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

/* globals for a particular window */
var printEngineContractID = "@mozilla.org/messenger/msgPrintEngine;1";
var printEngineWindow;
var printEngine;
var printSettings = null;
var printOpener = null;

/* Functions related to startup */
function OnLoadPrintEngine() {
  PrintEngineCreateGlobals();
  InitPrintEngineWindow();
  printEngine.startPrintOperation(printSettings);
}

function PrintEngineCreateGlobals() {
  /* get the print engine instance */
  printEngine = Cc[printEngineContractID].createInstance();
  printEngine = printEngine.QueryInterface(Ci.nsIMsgPrintEngine);
  printSettings = PrintUtils.getPrintSettings();
  if (printSettings) {
    printSettings.isCancelled = false;
  }
}

var PrintPreviewListener = {
  getPrintPreviewBrowser() {
    var browser = document.getElementById("ppBrowser");
    if (!browser) {
      browser = document.createXULElement("browser");
      browser.setAttribute("id", "ppBrowser");
      browser.setAttribute("flex", "1");
      browser.setAttribute("disablehistory", "true");
      browser.setAttribute("disablesecurity", "true");
      browser.setAttribute("type", "content");
      document.documentElement.appendChild(browser);
    }
    return browser;
  },
  getSourceBrowser() {
    return document.getElementById("content");
  },
  getNavToolbox() {
    return document.getElementById("content");
  },
  onEnter() {
    setPPTitle(document.getElementById("content").contentDocument.title);
    document.getElementById("content").collapsed = true;
    printEngine.showWindow(true);
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

// Pref listener constants
var gStartupPPObserver = {
  observe(subject, topic, prefName) {
    PrintUtils.printPreview(PrintPreviewListener);
  },
};

function ReplaceWithSelection() {
  if (!printOpener.content) {
    return;
  }

  var selection = printOpener.content.getSelection();

  if (selection != "") {
    var range = selection.getRangeAt(0);
    var contents = range.cloneContents();

    var aBody = window.content.document.querySelector("body");

    /* Replace the content of <body> with the users' selection. */
    if (aBody) {
      aBody.innerHTML = "";
      aBody.appendChild(contents);
    }
  }
}

function InitPrintEngineWindow() {
  /* Store the current opener for later access in ReplaceWithSelection() */
  printOpener = opener;

  /* Register the event listener to be able to replace the document
   * content with the user selection when loading is finished.
   */
  document
    .getElementById("content")
    .addEventListener("load", ReplaceWithSelection, true);

  /* Tell the nsIPrintEngine object what window is rendering the email */
  printEngine.setWindow(window);

  /* hide the printEngine window.  see bug #73995 */

  /* See if we got arguments.
   * Window was opened via window.openDialog.  Copy argument
   * and perform compose initialization
   */
  if (window.arguments && window.arguments[0] != null) {
    var numSelected = window.arguments[0];
    var uriArray = window.arguments[1];
    var statusFeedback = window.arguments[2];

    if (window.arguments[3]) {
      printEngine.doPrintPreview = window.arguments[3];
    } else {
      printEngine.doPrintPreview = false;
    }
    printEngine.showWindow(false);

    if (window.arguments.length > 4) {
      printEngine.setMsgType(window.arguments[4]);
    } else {
      printEngine.setMsgType(Ci.nsIMsgPrintEngine.MNAB_START);
    }

    if (window.arguments.length > 5) {
      printEngine.setParentWindow(window.arguments[5]);
    } else {
      printEngine.setParentWindow(null);
    }

    printEngine.setStatusFeedback(statusFeedback);
    printEngine.setStartupPPObserver(gStartupPPObserver);

    if (numSelected > 0) {
      printEngine.setPrintURICount(numSelected);
      for (var i = 0; i < numSelected; i++) {
        printEngine.addPrintURI(uriArray[i]);
      }
    }
  }
}

function ClearPrintEnginePane() {
  if (window.frames.content.location.href != "about:blank") {
    window.frames.content.location.href = "about:blank";
  }
}

function StopUrls() {
  printEngine.stopUrls();
}

function PrintEnginePrint() {
  printEngineWindow = window.openDialog(
    "chrome://messenger/content/msgPrintEngine.xhtml",
    "",
    "chrome,dialog=no,all,centerscreen",
    false
  );
}

function PrintEnginePrintPreview() {
  printEngineWindow = window.openDialog(
    "chrome://messenger/content/msgPrintEngine.xhtml",
    "",
    "chrome,dialog=no,all,centerscreen",
    true
  );
}
