/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.jsm",
  DownloadsCommon: "resource:///modules/DownloadsCommon.jsm",
});

var gDownload;
var gDownloadBundle;

var gDlList;
var gDlStatus;
var gDlListener;
var gDlSize;
var gTimeLeft;
var gProgressMeter;
var gProgressText;
var gCloseWhenDone;

function progressStartup() {
  gDownload = window.arguments[0].wrappedJSObject;
  Downloads.getList(gDownload.source.isPrivate ? Downloads.PRIVATE : Downloads.PUBLIC).then(progressAsyncStartup);
}

function progressAsyncStartup(aList) {
  gDlList = aList;

  // cache elements to save .getElementById() calls
  gDownloadBundle = document.getElementById("dmBundle");
  gDlStatus = document.getElementById("dlStatus");
  gDlSize = document.getElementById("dlSize");
  gTimeLeft = document.getElementById("timeLeft");
  gProgressMeter = document.getElementById("progressMeter");
  gProgressText = document.getElementById("progressText");
  gCloseWhenDone = document.getElementById("closeWhenDone");

  // Insert as first controller on the whole window
  window.controllers.insertControllerAt(0, ProgressDlgController);

  if (gDownload.isPrivate)
    gCloseWhenDone.hidden = true;
  else
    gCloseWhenDone.checked = Services.prefs.getBoolPref("browser.download.progress.closeWhenDone");

  if (gDownload.succeeded) {
    if (gCloseWhenDone.checked && !window.arguments[1])
      window.close();
  }

  var fName = document.getElementById("fileName");
  var fSource = document.getElementById("fileSource");
  fName.label = gDownload.displayName;
  fName.tooltipText = gDownload.target.path;
  var uri = Services.io.newURI(gDownload.source.url);
  var fromString;
  try {
    fromString = uri.host;
  }
  catch (e) { }
  if (!fromString)
    fromString = uri.prePath;
  fSource.label = gDownloadBundle.getFormattedString("fromSource", [fromString]);
  fSource.tooltipText = gDownload.source.url;

  // The DlProgressListener handles progress notifications.
  gDlListener = new DlProgressListener();
  gDlList.addView(gDlListener);

  updateDownload();
  updateButtons();
  window.updateCommands("dlstate-change");
}

function progressShutdown() {
  gDlList.removeView(gDlListener);
  window.controllers.removeController(ProgressDlgController);
  if (!gCloseWhenDone.hidden)
    Services.prefs.setBoolPref("browser.download.progress.closeWhenDone",
                               gCloseWhenDone.checked);
}

function updateDownload() {
  if (gDownload.hasProgress) {
    gProgressText.value = gDownloadBundle.getFormattedString("percentFormat",
                                                             [gDownload.progress]);
    gProgressText.hidden = false;
    gProgressMeter.value = gDownload.progress;
    gProgressMeter.mode = "determined";
  } else {
    gProgressText.hidden = true;
    gProgressMeter.mode = "undetermined";
  }
  if (gDownload.stopped) {
    gProgressMeter.style.opacity = 0.5;
  } else {
    gProgressMeter.style.opacity = 1;
  }
  // Update window title
  let statusString = DownloadsCommon.stateOfDownloadText(gDownload);

  if (gDownload.hasProgress) {
    document.title = gDownloadBundle.getFormattedString("progressTitlePercent",
                                                        [gDownload.progress,
                                                         gDownload.displayName,
                                                         statusString]);
  }
  else {
    document.title = gDownloadBundle.getFormattedString("progressTitle",
                                                        [gDownload.displayName,
                                                         statusString]);
  }

  // download size / transferred bytes
  gDlSize.value = DownloadsCommon.getTransferredBytes(gDownload);

  // time remaining
  gTimeLeft.value = DownloadsCommon.getTimeRemaining(gDownload);

  // download status
  gDlStatus.value = statusString;

}

function updateButtons() {
  document.getElementById("pauseButton").hidden = !ProgressDlgController.isCommandEnabled("cmd_pause");
  document.getElementById("resumeButton").hidden = !ProgressDlgController.isCommandEnabled("cmd_resume");
  document.getElementById("retryButton").hidden = !ProgressDlgController.isCommandEnabled("cmd_retry");
  document.getElementById("cancelButton").hidden = !ProgressDlgController.isCommandEnabled("cmd_cancel");
}

/**
 * DlProgressListener "class" is used to help update download items shown
 * in the progress dialog such as displaying amount transferred, transfer
 * rate, and time left for the download.
 *
 * This class implements the downloadProgressListener interface.
 */
function DlProgressListener() {}

DlProgressListener.prototype = {
  onDownloadChanged: function(aDownload) {
    if (aDownload == gDownload) {
      if (gCloseWhenDone.checked && aDownload.succeeded) {
        window.close();
      }
      updateDownload();
      updateButtons();
      window.updateCommands("dlstate-change");
    }
  },

  onDownloadRemoved: function(aDownload) {
    if (aDownload == gDownload)
      window.close();
  }
};

var ProgressDlgController = {
  supportsCommand: function(aCommand) {
    switch (aCommand) {
      case "cmd_pause":
      case "cmd_resume":
      case "cmd_retry":
      case "cmd_cancel":
      case "cmd_open":
      case "cmd_show":
      case "cmd_openReferrer":
      case "cmd_copyLocation":
        return true;
    }
    return false;
  },

  isCommandEnabled: function(aCommand) {
    switch (aCommand) {
      case "cmd_pause":
        return !gDownload.stopped && gDownload.hasPartialData;
      case "cmd_resume":
        return gDownload.stopped && gDownload.hasPartialData;
      case "cmd_open":
        return gDownload.succeeded && gDownload.target.exists;
      case "cmd_show":
        return gDownload.target.exists;
      case "cmd_cancel":
        return !gDownload.stopped || gDownload.hasPartialData;
      case "cmd_retry":
        return !gDownload.succeeded && gDownload.stopped && !gDownload.hasPartialData;
      case "cmd_openReferrer":
        return !!gDownload.source.referrer;
      case "cmd_copyLocation":
        return true;
      default:
        return false;
    }
  },

  doCommand: function(aCommand) {
    switch (aCommand) {
      case "cmd_pause":
        gDownload.cancel();
        break;
      case "cmd_resume":
      case "cmd_retry":
        gDownload.start();
        break;
      case "cmd_cancel":
        cancelDownload(gDownload);
        break;
      case "cmd_open":
        openDownload(gDownload);
        break;
      case "cmd_show":
        showDownload(gDownload);
        break;
      case "cmd_openReferrer":
        openUILink(gDownload.source.referrer);
        break;
      case "cmd_copyLocation":
        var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"]
                          .getService(Ci.nsIClipboardHelper);
        clipboard.copyString(gDownload.source.url);
        break;
    }
  },

  onEvent: function(aEvent) {
  },

  onCommandUpdate: function() {
    var cmds = ["cmd_pause", "cmd_resume", "cmd_retry", "cmd_cancel",
                "cmd_open", "cmd_show", "cmd_openReferrer", "cmd_copyLocation"];
    for (let command in cmds)
      goUpdateCommand(cmds[command]);
  }
};
