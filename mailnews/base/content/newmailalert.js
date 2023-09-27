/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);

var gAlertListener = null;

// NOTE: We must wait until "load" instead of "DOMContentLoaded" because
// otherwise the window height and width is not set in time for
// window.moveTo.
window.addEventListener("load", onAlertLoad);

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
  const message = document
    .getElementById("bundle_messenger")
    .getString("newMailAlert_message");
  label.value = PluralForm.get(totalNumNewMessages, message)
    .replace("#1", folder.server.rootFolder.prettyName)
    .replace("#2", totalNumNewMessages);

  // <folder-summary> handles rendering of new messages.
  var folderSummaryInfoEl = document.getElementById("folderSummaryInfo");
  folderSummaryInfoEl.maxMsgHdrsInPopup = 6;
  folderSummaryInfoEl.render(folder, newMsgKeys);
}

function onAlertLoad() {
  const dragSession = Cc["@mozilla.org/widget/dragservice;1"]
    .getService(Ci.nsIDragService)
    .getCurrentSession();
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

  if (!document.getElementById("folderSummaryInfo").hasMessages()) {
    closeAlert(); // no mail, so don't bother showing the alert...
    return;
  }

  // resize the alert based on our current content
  const alertTextBox = document.getElementById("alertTextBox");
  const alertImageBox = document.getElementById("alertImageBox");
  alertImageBox.style.minHeight = alertTextBox.scrollHeight + "px";

  // Show in bottom right, offset by 10px.
  // We wait one cycle until the window has resized.
  setTimeout(() => {
    const x = screen.availLeft + screen.availWidth - window.outerWidth - 10;
    const y = screen.availTop + screen.availHeight - window.outerHeight - 10;
    window.moveTo(x, y);
  });

  const openTime = Services.prefs.getIntPref("alerts.totalOpenTime");
  var alertContainer = document.getElementById("alertContainer");
  // Don't fade in if the prefers-reduced-motion is true.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    alertContainer.setAttribute("noanimation", true);
    setTimeout(closeAlert, openTime);
    return;
  }

  alertContainer.addEventListener("animationend", function hideAlert(event) {
    if (event.animationName == "fade-in") {
      alertContainer.removeEventListener("animationend", hideAlert);
      setTimeout(fadeOutAlert, openTime);
    }
  });

  alertContainer.setAttribute("fade-in", true);
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
