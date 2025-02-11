/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

window.addEventListener("load", loadRequestedUrl);
window.addEventListener("close", reportUserClosed);

/* Magic global things the <browser> and its entourage of logic expect. */
var PopupNotifications = {
  show(browser, id, message) {
    console.warn(
      `Not showing popup notification ${id} with the message ${message}`
    );
  },
};

var gBrowser = {
  get selectedBrowser() {
    return document.getElementById("requestFrame");
  },
  _getAndMaybeCreateDateTimePickerPanel() {
    return this.selectedBrowser.dateTimePicker;
  },
  get webNavigation() {
    return this.selectedBrowser.webNavigation;
  },
  getTabForBrowser() {
    return null;
  },
};

function getBrowser() {
  return gBrowser.selectedBrowser;
}

/* Logic to actually run the login process and window contents */
var reporterListener = {
  _isBusy: false,

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  onStateChange() {},
  onProgressChange() {},
  onLocationChange(
    /* in nsIWebProgress*/ aWebProgress,
    /* in nsIRequest*/ aRequest,
    /* in nsIURI*/ aLocation
  ) {
    if (aWebProgress.isTopLevel) {
      document.getElementById("headerMessage").value = aLocation.spec;
    }
  },
  onStatusChange() {},
  onSecurityChange(
    /* in nsIWebProgress*/ aWebProgress,
    /* in nsIRequest*/ aRequest,
    /* in unsigned long*/ aState
  ) {
    const wpl_security_bits =
      Ci.nsIWebProgressListener.STATE_IS_SECURE |
      Ci.nsIWebProgressListener.STATE_IS_BROKEN |
      Ci.nsIWebProgressListener.STATE_IS_INSECURE;

    const icon = document.getElementById("security-icon");
    switch (aState & wpl_security_bits) {
      case Ci.nsIWebProgressListener.STATE_IS_SECURE:
        icon.setAttribute(
          "src",
          "chrome://messenger/skin/icons/connection-secure.svg"
        );
        // Set alt.
        document.l10n.setAttributes(icon, "content-tab-security-high-icon");
        icon.classList.add("secure-connection-icon");
        break;
      case Ci.nsIWebProgressListener.STATE_IS_BROKEN:
        icon.setAttribute(
          "src",
          "chrome://messenger/skin/icons/connection-insecure.svg"
        );
        document.l10n.setAttributes(icon, "content-tab-security-broken-icon");
        icon.classList.remove("secure-connection-icon");
        break;
      default:
        icon.removeAttribute("src");
        icon.removeAttribute("data-l10n-id");
        icon.removeAttribute("alt");
        icon.classList.remove("secure-connection-icon");
        break;
    }
  },
  onContentBlockingEvent() {},
};

function cancelRequest() {
  reportUserClosed();
  window.close();
}

function reportUserClosed() {
  const request = window.arguments[0]?.wrappedJSObject;
  // Bug 1879038: This is also called for WebExtension popup windows, but they do
  // not send a request.
  if (!request) {
    return;
  }
  request.cancelled();
}

function loadRequestedUrl() {
  UIFontSize.registerWindow(window);
  const request = window.arguments[0]?.wrappedJSObject;
  // Bug 1879038: This is also called for WebExtension popup windows, but they do
  // not send a request.
  if (!request) {
    return;
  }

  var browser = document.getElementById("requestFrame");
  browser.addProgressListener(reporterListener, Ci.nsIWebProgress.NOTIFY_ALL);
  var url = request.url;
  if (url == "") {
    document.getElementById("headerMessage").value = request.promptText;
  } else {
    MailE10SUtils.loadURI(browser, url);
    document.getElementById("headerMessage").value = url;
  }
  request.loaded(window, browser.webProgress);
}
