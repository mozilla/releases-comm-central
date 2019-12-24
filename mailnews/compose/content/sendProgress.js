/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var nsIMsgCompDeliverMode = Ci.nsIMsgCompDeliverMode;

// dialog is just an array we'll use to store various properties from the dialog document...
var dialog;

// the msgProgress is a nsIMsgProgress object
var msgProgress = null;

// random global variables...
var itsASaveOperation = false;
var gSendProgressStringBundle;

document.addEventListener("dialogcancel", onCancel);

// all progress notifications are done through the nsIWebProgressListener implementation...
var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      // Set no value to progress meter when undetermined.
      dialog.progress.removeAttribute("value");
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      // we are done sending/saving the message...
      // Indicate completion in status area.
      var msg;
      if (itsASaveOperation) {
        msg = gSendProgressStringBundle.getString("messageSaved");
      } else {
        msg = gSendProgressStringBundle.getString("messageSent");
      }
      dialog.status.setAttribute("value", msg);

      // Put progress meter at 100%.
      dialog.progress.setAttribute("value", 100);
      var percentMsg = gSendProgressStringBundle.getFormattedString(
        "percentMsg",
        [100]
      );
      dialog.progressText.setAttribute("value", percentMsg);

      window.close();
    }
  },

  onProgressChange(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {
    // Calculate percentage.
    var percent;
    if (aMaxTotalProgress > 0) {
      percent = Math.round((aCurTotalProgress / aMaxTotalProgress) * 100);
      if (percent > 100) {
        percent = 100;
      }

      // Advance progress meter.
      dialog.progress.value = percent;

      // Update percentage label on progress meter.
      var percentMsg = gSendProgressStringBundle.getFormattedString(
        "percentMsg",
        [percent]
      );
      dialog.progressText.value = percentMsg;
    } else {
      // Progress meter should show no value in this case.
      dialog.progress.removeAttribute("value");
    }
  },

  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {
    // we can ignore this notification
  },

  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    if (aMessage != "") {
      dialog.status.setAttribute("value", aMessage);
    }
  },

  onSecurityChange(aWebProgress, aRequest, state) {
    // we can ignore this notification
  },

  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {
    // we can ignore this notification
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

function onLoad() {
  // Set global variables.
  let subject = "";
  gSendProgressStringBundle = document.getElementById(
    "sendProgressStringBundle"
  );

  msgProgress = window.arguments[0];
  if (!msgProgress) {
    Cu.reportError("Invalid argument to sendProgress.xhtml.");
    window.close();
    return;
  }

  if (window.arguments[1]) {
    let progressParams = window.arguments[1].QueryInterface(
      Ci.nsIMsgComposeProgressParams
    );
    if (progressParams) {
      itsASaveOperation =
        progressParams.deliveryMode != nsIMsgCompDeliverMode.Now;
      subject = progressParams.subject;
    }
  }

  if (subject) {
    let title = itsASaveOperation
      ? "titleSaveMsgSubject"
      : "titleSendMsgSubject";
    document.title = gSendProgressStringBundle.getFormattedString(title, [
      subject,
    ]);
  } else {
    let title = itsASaveOperation ? "titleSaveMsg" : "titleSendMsg";
    document.title = gSendProgressStringBundle.getString(title);
  }

  dialog = {};
  dialog.status = document.getElementById("dialog.status");
  dialog.progress = document.getElementById("dialog.progress");
  dialog.progressText = document.getElementById("dialog.progressText");

  // set our web progress listener on the helper app launcher
  msgProgress.registerListener(progressListener);
}

function onUnload() {
  if (msgProgress) {
    try {
      msgProgress.unregisterListener(progressListener);
      msgProgress = null;
    } catch (e) {}
  }
}

// If the user presses cancel, tell the app launcher and close the dialog...
function onCancel(event) {
  // Cancel app launcher.
  try {
    msgProgress.processCanceledByUser = true;
  } catch (e) {
    return;
  }

  // Don't close up dialog, the backend will close the dialog when everything will be aborted.
  event.preventDefault();
}
