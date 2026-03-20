/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gAlertListener = null;

let prefillPromise;

window.addEventListener("DOMContentLoaded", () => {
  // Start prefilling the alert info as early as possible and let it run in
  // the background.
  prefillPromise = prefillAlertInfo();
  prefillPromise.catch(() => {}); // Rejection handled in doOnAlertLoad.
});

window.addEventListener("load", onAlertLoad);

async function prefillAlertInfo() {
  // unwrap all the args....
  // arguments[0] --> The real nsIMsgFolder with new mail.
  // arguments[1] --> The keys of new messages.
  // arguments[2] --> The nsIObserver to receive window closed event.
  let [folder, newMsgKeys, listener] = window.arguments;
  newMsgKeys = newMsgKeys.wrappedJSObject;
  gAlertListener = listener.QueryInterface(Ci.nsIObserver);

  const alertTitle = document.getElementById("alertTitle");
  document.l10n.setAttributes(alertTitle, "new-mail-alert-message", {
    count: newMsgKeys.length,
    account: folder.server.rootFolder.localizedName,
  });
  // Wait for Fluent to explicitly translate the title so it's in the DOM
  await document.l10n.translateElements([alertTitle]);

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
    dragSession.sourceNode.addEventListener(
      "dragend",
      () => doOnAlertLoad().catch(console.error),
      { once: true }
    );
  } else {
    doOnAlertLoad().catch(console.error);
  }
}

async function doOnAlertLoad() {
  // Wait for the early translation to finish.
  await prefillPromise;

  if (!document.getElementById("folderSummaryInfo").hasMessages()) {
    closeAlert(); // no mail, so don't bother showing the alert...
    return;
  }

  // resize the alert based on our current content
  const alertTextBox = document.getElementById("alertTextBox");
  const alertImageBox = document.getElementById("alertImageBox");
  alertImageBox.style.minHeight = alertTextBox.scrollHeight + "px";

  const snapToCorner = () => {
    const x = screen.availLeft + screen.availWidth - window.outerWidth - 10;
    const y = screen.availTop + screen.availHeight - window.outerHeight - 10;
    window.moveTo(x, y);
  };

  // Pre-snap the window immediately to prevent the OS from flashing its
  // native shell in the top-left corner. We capture the initial dimensions
  // only after this move, ensuring our baseline accounts for any OS-level
  // DPI scaling adjustments triggered by moving to a different monitor.
  snapToCorner();
  const initialWidth = window.outerWidth;
  const initialHeight = window.outerHeight;

  await new Promise(resolve => {
    let resizeHandled = false;
    let snapPending = false;
    // We must declare this before assigning it so the onResize closure can
    // capture it.
    // eslint-disable-next-line prefer-const
    let fallbackTimer;

    const onResize = () => {
      if (
        window.outerWidth === initialWidth &&
        window.outerHeight === initialHeight
      ) {
        // Ignore stray layout events.
        return;
      }

      if (snapPending) {
        // Prevent an infinite layout loop. If moving the window triggers an OS
        // DPI-scaling resize, throttling to one move per frame breaks the cycle
        // and allows the native window manager to settle.
        return;
      }

      snapPending = true;

      // Wait for the browser's native rendering cycle to settle before moving.
      window.requestAnimationFrame(() => {
        // We deliberately do not remove this listener. It acts as a permanent
        // anchor, keeping the notification pinned to the corner if the OS
        // resizes it again.
        snapToCorner();
        snapPending = false;

        // Only resolve the promise and clear the timer on the first real resize.
        if (!resizeHandled) {
          clearTimeout(fallbackTimer);
          resizeHandled = true;
          resolve();
        }
      });
    };

    window.addEventListener("resize", onResize);

    // The fallback timer ensures the promise doesn't hang forever if the OS
    // window manager swallows the resize event or takes too long to render.
    fallbackTimer = setTimeout(() => {
      if (resizeHandled) {
        return;
      }

      resizeHandled = true;
      snapToCorner();
      resolve();
    }, 100);
  });

  // Give the OS accessibility layer a moment to register the alert region
  // before uncloaking its content. Removing aria-hidden forces screen readers
  // (JAWS, NVDA, Orca) to announce the fully populated text.
  setTimeout(() => {
    if (!alertTextBox.isConnected) {
      return;
    }
    alertTextBox.removeAttribute("aria-hidden");
  }, 150);

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
