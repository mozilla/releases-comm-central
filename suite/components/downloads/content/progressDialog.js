/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");

XPCOMUtils.defineLazyScriptGetter(this, "DownloadsCommon",
                                  "resource:///modules/DownloadsCommon.jsm");

var gDownload;
var gDownloadBundle;
var gTkDlBundle;

var gDlList;
var gDlStatus;
var gDlListener;
var gDlSize;
var gTimeElapsed;
var gProgressMeter;
var gProgressText;
var gCloseWhenDone;

var gLastSec = Infinity;
var gDlActive = false;

function progressStartup() {
  gDownload = window.arguments[0].wrappedJSObject;
  Downloads.getList(gDownload.source.isPrivate ? Downloads.PRIVATE : Downloads.PUBLIC).then(progressAsyncStartup);
}

function progressAsyncStartup(aList) {
  gDlList = aList;

  // cache elements to save .getElementById() calls
  gDownloadBundle = document.getElementById("dmBundle");
  gTkDlBundle = document.getElementById("tkdlBundle");
  gDlStatus = document.getElementById("dlStatus");
  gDlSize = document.getElementById("dlSize");
  gTimeElapsed = document.getElementById("timeElapsed");
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
  let statusString = DownloadsCommon.stateOfDownloadText(gDownloadBundle);

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

  // download size
  var transfer = DownloadUtils.getTransferTotal(gDownload.currentBytes,
                                                gDownload.totalBytes);
  if (!gDownload.stopped) {
    var [rate, unit] = DownloadUtils.convertByteUnits(gDownload.speed);
    var dlSpeed = gDownloadBundle.getFormattedString("speedFormat", [rate, unit]);
    gDlSize.value = gDownloadBundle.getFormattedString("sizeSpeed",
                                                       [transfer, dlSpeed]);
  }
  else
    gDlSize.value = transfer;

  // download status
  if (!gDownload.stopped) {
    // Calculate the time remaining if we have valid values
    var seconds = (gDownload.speed > 0) && (gDownload.totalBytes > 0)
                  ? (gDownload.totalBytes - gDownload.currentBytes) / gDownload.speed
                  : -1;
    var [timeLeft, newLast] = DownloadUtils.getTimeLeft(seconds, gLastSec);
    gLastSec = newLast;
  }

  let state = DownloadsCommon.stateOfDownload(gDownload);
  switch (state) {
    case DownloadsCommon.DOWNLOAD_BLOCKED_PARENTAL: // Parental Controls
      gDlStatus.value = gTkDlBundle.getString("stateBlocked");
      break;
    case DownloadsCommon.DOWNLOAD_BLOCKED_POLICY:   // Security Zone Policy
      gDlStatus.value = gTkDlBundle.getString("stateBlockedPolicy");
      break;
    case DownloadsCommon.DOWNLOAD_DIRTY:            // possible virus/spyware
      gDlStatus.value = gTkDlBundle.getString("stateDirty");
      break;
    default:
      if (gDlActive)
        gDlStatus.value = gDownloadBundle.getFormattedString("statusActive",
                                                             [statusString, timeLeft]);
      else
        gDlStatus.value = statusString;
      break;
  }

  // time elapsed
  if (gDownload.startTime && gDownload.endTime && (gDownload.endTime > gDownload.startTime)) {
    var seconds = (gDownload.endTime - gDownload.startTime) / 1000;
    var [time1, unit1, time2, unit2] =
      DownloadUtils.convertTimeUnits(seconds);
    if (seconds < 3600 || time2 == 0)
      gTimeElapsed.value = gDownloadBundle.getFormattedString("timeElapsedSingle", [time1, unit1]);
    else
      gTimeElapsed.value = gDownloadBundle.getFormattedString("timeElapsedDouble", [time1, unit1, time2, unit2]);
  }
  else {
    gTimeElapsed.value = "";
  }
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
 * This class implements the nsIDownloadProgressListener interface.
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
        openUILink(gDownload.referrer.spec);
        break;
      case "cmd_copyLocation":
        var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"]
                          .getService(Ci.nsIClipboardHelper);
        clipboard.copyString(gDownload.source.spec);
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
