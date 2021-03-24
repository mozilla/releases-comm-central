/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);

// Copied from nsILookAndFeel.h, see comments on eIntID_AlertNotificationOrigin.
var NS_ALERT_LEFT = 2;
var NS_ALERT_TOP = 4;

var gNumNewMsgsToShowInAlert = 6;
var gOpenTime = 4000; // total time the alert should stay up once we are done animating.

var gPendingPreviewFetchRequests = 0;
var gOrigin = 0; // Default value: alert from bottom right.

function prefillAlertInfo() {
  // unwrap all the args....
  // arguments[0] --> The nsIMsgFolder with new mail
  var rootFolder = window.arguments[0];

  // Generate an account label string based on the root folder.
  var label = document.getElementById("alertTitle");
  var totalNumNewMessages = rootFolder.getNumNewMessages(true);
  let message = document
    .getElementById("bundle_messenger")
    .getString("newMailAlert_message");
  label.value = PluralForm.get(totalNumNewMessages, message)
    .replace("#1", rootFolder.prettyName)
    .replace("#2", totalNumNewMessages);

  // This is really the root folder and we have to walk through the list to
  // find the real folder that has new mail in it...:(
  var folderSummaryInfoEl = document.getElementById("folderSummaryInfo");
  folderSummaryInfoEl.maxMsgHdrsInPopup = gNumNewMsgsToShowInAlert;
  for (let folder of rootFolder.descendants) {
    if (folder.hasNewMessages) {
      let notify =
        // Any folder which is an inbox or ...
        folder.getFlag(Ci.nsMsgFolderFlags.Inbox) ||
        // any non-special or non-virtual folder. In other words, we don't
        // notify for Drafts|Trash|SentMail|Templates|Junk|Archive|Queue or virtual.
        !(
          folder.flags &
          (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual)
        );

      if (notify) {
        var asyncFetch = {};
        folderSummaryInfoEl.parseFolder(
          folder,
          new urlListener(folder),
          asyncFetch
        );
        if (asyncFetch.value) {
          gPendingPreviewFetchRequests++;
        }
      }
    }
  }
}

function urlListener(aFolder) {
  this.mFolder = aFolder;
}

urlListener.prototype = {
  OnStartRunningUrl(aUrl) {},

  OnStopRunningUrl(aUrl, aExitCode) {
    let folderSummaryInfoEl = document.getElementById("folderSummaryInfo");
    folderSummaryInfoEl.parseFolder(this.mFolder, null, {});
    gPendingPreviewFetchRequests--;

    // when we are done running all of our urls for fetching the preview text,
    // start the alert.
    if (!gPendingPreviewFetchRequests) {
      showAlert();
    }
  },
};

function onAlertLoad() {
  prefillAlertInfo();

  gOpenTime = Services.prefs.getIntPref("alerts.totalOpenTime");

  // bogus call to make sure the window is moved offscreen until we are ready for it.
  resizeAlert(true);

  // if we aren't waiting to fetch preview text, then go ahead and
  // start showing the alert.
  if (!gPendingPreviewFetchRequests) {
    // Let the JS thread unwind, to give layout
    // a chance to recompute the styles and widths for our alert text.
    setTimeout(showAlert, 0);
  }
}

// If the user initiated the alert, show it right away, otherwise start opening the alert with
// the fade effect.
function showAlert() {
  if (!document.getElementById("folderSummaryInfo").hasMessages()) {
    closeAlert(); // no mail, so don't bother showing the alert...
    return;
  }

  // resize the alert based on our current content
  resizeAlert(false);

  var alertContainer = document.getElementById("alertContainer");
  // Don't fade in if the prefers-reduced-motion is true.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    alertContainer.setAttribute("noanimation", true);
    setTimeout(closeAlert, gOpenTime);
    return;
  }

  alertContainer.addEventListener("animationend", function hideAlert(event) {
    if (event.animationName == "fade-in") {
      alertContainer.removeEventListener("animationend", hideAlert);
      setTimeout(fadeOutAlert, gOpenTime);
    }
  });

  alertContainer.setAttribute("fade-in", true);
}

function resizeAlert(aMoveOffScreen) {
  var alertTextBox = document.getElementById("alertTextBox");
  var alertImageBox = document.getElementById("alertImageBox");
  alertImageBox.style.minHeight = alertTextBox.scrollHeight + "px";

  sizeToContent();

  // leftover hack to get the window properly hidden when we first open it
  if (aMoveOffScreen) {
    window.outerHeight = 1;
  }

  // Determine position
  var x =
    gOrigin & NS_ALERT_LEFT
      ? screen.availLeft
      : screen.availLeft + screen.availWidth - window.outerWidth;
  var y =
    gOrigin & NS_ALERT_TOP
      ? screen.availTop
      : screen.availTop + screen.availHeight - window.outerHeight;

  // Offset the alert by 10 pixels from the edge of the screen
  y += gOrigin & NS_ALERT_TOP ? 10 : -10;
  x += gOrigin & NS_ALERT_LEFT ? 10 : -10;

  window.moveTo(x, y);
}

function fadeOutAlert() {
  var alertContainer = document.getElementById("alertContainer");
  alertContainer.addEventListener("animationend", function fadeOut(event) {
    if (event.animationName == "fade-out") {
      alertContainer.removeEventListener("animationend", fadeOut);
      closeAlert();
    }
  });
  alertContainer.setAttribute("fade-out", true);
}

function closeAlert() {
  window.close();
}
