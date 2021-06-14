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

var gAlertListener = null;
var gOrigin = 0; // Default value: alert from bottom right.
var gDragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

function prefillAlertInfo() {
  // unwrap all the args....
  // arguments[0] --> The real nsIMsgFolder with new mail.
  // arguments[1] --> The keys of new messages.
  // arguments[2] --> The nsIObserver to receive window closed event.
  let [folder, newMsgKeys, listener] = window.arguments;
  newMsgKeys = newMsgKeys.wrappedJSObject;
  gAlertListener = listener.QueryInterface(Ci.nsIObserver);

  // Generate an account label string based on the root folder.
  var label = document.getElementById("alertTitle");
  var totalNumNewMessages = newMsgKeys.length;
  let message = document
    .getElementById("bundle_messenger")
    .getString("newMailAlert_message");
  label.value = PluralForm.get(totalNumNewMessages, message)
    .replace("#1", folder.server.rootFolder.prettyName)
    .replace("#2", totalNumNewMessages);

  // <folder-summary> handles rendering of new messages.
  var folderSummaryInfoEl = document.getElementById("folderSummaryInfo");
  folderSummaryInfoEl.maxMsgHdrsInPopup = gNumNewMsgsToShowInAlert;
  folderSummaryInfoEl.render(folder, newMsgKeys);
}

function onAlertLoad() {
  let dragSession = gDragService.getCurrentSession();
  if (dragSession && dragSession.sourceNode) {
    // If a drag session is active, adjusting this window's dimensions causes
    // the drag session to be abruptly terminated. To avoid interrupting the
    // user, wait until the drag is finished and then set up and show the alert.
    dragSession.sourceNode.addEventListener("dragend", () => doOnAlertLoad());
  } else {
    doOnAlertLoad();
  }
}

function doOnAlertLoad() {
  prefillAlertInfo();

  gOpenTime = Services.prefs.getIntPref("alerts.totalOpenTime");

  // bogus call to make sure the window is moved offscreen until we are ready for it.
  resizeAlert(true);

  // Let the JS thread unwind, to give layout
  // a chance to recompute the styles and widths for our alert text.
  setTimeout(showAlert, 0);
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
  gAlertListener.observe(null, "newmailalert-closed", "");
}
