/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// dialog is just an array we'll use to store various properties from the dialog document...
var dialog;

// the msgProgress is a nsIMsgProgress object
var msgProgress = null;

// random global variables...
var itsASaveOperation = false;
var gBundle;

window.addEventListener("DOMContentLoaded", onLoad);
window.addEventListener("unload", onUnload);
document.addEventListener("dialogcancel", onCancel);

// all progress notifications are done through the nsIWebProgressListener implementation...
var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      // Set progress meter to show indeterminate.
      dialog.progress.removeAttribute("value");
      dialog.progressText.value = "";
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      if (Components.isSuccessCode(aStatus)) {
        // we are done sending/saving the message...
        // Indicate completion in status area.
        let msg;
        if (itsASaveOperation) {
          msg = gBundle.GetStringFromName("messageSaved");
        } else {
          msg = gBundle.GetStringFromName("messageSent");
        }
        dialog.status.setAttribute("value", msg);

        // Put progress meter at 100%.
        dialog.progress.setAttribute("value", 100);
        dialog.progressText.setAttribute(
          "value",
          gBundle.formatStringFromName("percentMsg", [100])
        );
      }

      // Note: Without some delay closing the window the "msg" string above may
      // never be visible. Example: setTimeout(() => window.close(), 1000);
      // Windows requires other delays. The delays also cause test failures.
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
      dialog.progressText.value = gBundle.formatStringFromName("percentMsg", [
        percent,
      ]);
    } else {
      // Have progress meter show indeterminate with denominator <= 0.
      dialog.progress.removeAttribute("value");
      dialog.progressText.value = "";
    }
  },

  onLocationChange() {
    // we can ignore this notification
  },

  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    if (aMessage != "") {
      dialog.status.setAttribute("value", aMessage);
    }
  },

  onSecurityChange() {
    // we can ignore this notification
  },

  onContentBlockingEvent() {
    // we can ignore this notification
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

function onLoad() {
  // Set global variables.
  gBundle = Services.strings.createBundle(
    "chrome://messenger/locale/messengercompose/sendProgress.properties"
  );

  msgProgress = window.arguments[0];
  if (!msgProgress) {
    console.error("Invalid argument to sendProgress.xhtml.");
    window.close();
    return;
  }

  let subject = "";
  if (window.arguments[1]) {
    const progressParams = window.arguments[1].QueryInterface(
      Ci.nsIMsgComposeProgressParams
    );
    if (progressParams) {
      itsASaveOperation =
        progressParams.deliveryMode != Ci.nsIMsgCompDeliverMode.Now;
      subject = progressParams.subject;
    }
  }

  if (subject) {
    const title = itsASaveOperation
      ? "titleSaveMsgSubject"
      : "titleSendMsgSubject";
    document.title = gBundle.formatStringFromName(title, [subject]);
  } else {
    const title = itsASaveOperation ? "titleSaveMsg" : "titleSendMsg";
    document.title = gBundle.GetStringFromName(title);
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
