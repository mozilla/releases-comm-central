/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

ChromeUtils.defineLazyGetter(this, "gNotification", () => {
  const container = document.getElementById("browserRequestNotificationBox");
  return new MozElements.NotificationBox(element => {
    element.setAttribute("notificationside", "top");
    container.append(element);
  });
});

const COOKIE_BEHAVIOR_PREF = "network.cookie.cookieBehavior";
const COOKIE_BEHAVIOR_PRIVATE_PREF = "network.cookie.cookieBehavior.pbmode";

var gCookiesBlockedNotified = false;

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
  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {
    const cookiesBlockedBits =
      Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_ALL |
      Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_BY_PERMISSION;
    if (aEvent & cookiesBlockedBits && cookieBlockState().blocked) {
      notifyCookiesBlocked();
    }
  },
};

/**
 * The preference that decides whether this page may use cookies, the way
 * nsICookieManager.getCookieBehavior picks it.
 *
 * @returns {string}
 */
function cookieBehaviorPref() {
  if (!getBrowser().browsingContext.usePrivateBrowsing) {
    return COOKIE_BEHAVIOR_PREF;
  }
  if (
    !Services.prefs.prefHasUserValue(COOKIE_BEHAVIOR_PRIVATE_PREF) &&
    Services.prefs.prefHasUserValue(COOKIE_BEHAVIOR_PREF)
  ) {
    return COOKIE_BEHAVIOR_PREF;
  }
  return COOKIE_BEHAVIOR_PRIVATE_PREF;
}

/**
 * Checks whether this page may use cookies, and whether the user is allowed
 * to change that.
 *
 * @returns {object} `blocked` - the page may not use cookies. `fixable` - the
 *   user may remove everything in the way. `pref` - the setting to turn back
 *   on, if it rejects cookies for this page. `permission` - the exception to
 *   remove, if one blocks the page.
 */
function cookieBlockState() {
  // Not the exact origin: an exception for a parent domain blocks this page
  // too, and that is the one we would have to remove.
  const permission = Services.perms.getPermissionObject(
    getBrowser().contentPrincipal,
    "cookie",
    false
  );
  const exceptionBlocks = permission?.capability == Services.perms.DENY_ACTION;

  // As in StorageAccess.cpp, an exception decides before the setting does.
  const pref = cookieBehaviorPref();
  const settingBlocks =
    (!permission || exceptionBlocks) &&
    Services.prefs.getIntPref(pref) == Ci.nsICookieService.BEHAVIOR_REJECT;

  return {
    blocked: settingBlocks || exceptionBlocks,
    fixable:
      (!exceptionBlocks ||
        permission.expireType != Ci.nsIPermissionManager.EXPIRE_POLICY) &&
      (!settingBlocks || !Services.prefs.prefIsLocked(pref)),
    pref: settingBlocks ? pref : null,
    permission: exceptionBlocks ? permission : null,
  };
}

/**
 * Tells the user that the page cannot use cookies, which is usually why it
 * never finishes loading.
 */
function notifyCookiesBlocked() {
  // The WebExtension popup window shares this code but has no notification box.
  if (
    gCookiesBlockedNotified ||
    !document.getElementById("browserRequestNotificationBox")
  ) {
    return;
  }
  // Events arrive faster than appendNotification adds the element, so this has
  // to be set before the first one returns.
  gCookiesBlockedNotified = true;

  gNotification.appendNotification(
    "cookiesBlocked",
    {
      label: { "l10n-id": "browser-request-cookies-blocked" },
      priority: gNotification.PRIORITY_WARNING_MEDIUM,
    },
    cookieBlockState().fixable
      ? [
          {
            "l10n-id": "browser-request-cookies-accept",
            callback: acceptCookies,
          },
        ]
      : []
  );
}

/**
 * Removes whatever blocks cookies here - the setting for all sites, an
 * exception for this one, or both - and loads the page again.
 */
function acceptCookies() {
  const { pref, permission } = cookieBlockState();

  if (pref) {
    // The value the "Accept cookies from sites" checkbox writes.
    Services.prefs.setIntPref(pref, Ci.nsICookieService.BEHAVIOR_ACCEPT);
  }
  if (permission) {
    Services.perms.removePermission(permission);
  }
  // Another exception, here or on the next site, gets its own notification.
  gCookiesBlockedNotified = false;

  const browser = getBrowser();
  MailE10SUtils.loadURI(browser, browser.currentURI.spec);
}

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

/**
 * @implements {nsIBrowserDOMWindow}
 */
window.browserDOMWindow = new (class nsBrowserAccess {
  QueryInterface = ChromeUtils.generateQI(["nsIBrowserDOMWindow"]);

  _openURIInNewTab(
    aURI,
    aReferrerInfo,
    aIsExternal,
    aOpenWindowInfo = null,
    aTriggeringPrincipal = null,
    aCsp = null,
    aSkipLoad = false,
    aMessageManagerGroup = null
  ) {
    // This is a popup which must not have more than one tab, so open the new tab
    // in the most recent mail window.
    const win = Services.wm.getMostRecentWindow("mail:3pane", true);

    if (!win) {
      // We couldn't find a suitable window, a new one needs to be opened.
      return null;
    }

    const loadInBackground = Services.prefs.getBoolPref(
      "browser.tabs.loadDivertedInBackground"
    );

    const tabmail = win.document.getElementById("tabmail");
    const newTab = tabmail.openTab("contentTab", {
      background: loadInBackground,
      csp: aCsp,
      linkHandler: aMessageManagerGroup,
      openWindowInfo: aOpenWindowInfo,
      referrerInfo: aReferrerInfo,
      skipLoad: aSkipLoad,
      triggeringPrincipal: aTriggeringPrincipal,
      url: aURI ? aURI.spec : "about:blank",
    });

    win.focus();

    return newTab.browser;
  }

  createContentWindow() {
    throw Components.Exception("Not implemented", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  createContentWindowInFrame(aURI, aParams, aWhere, aFlags, aName) {
    // Passing a null-URI to only create the content window,
    // and pass true for aSkipLoad to prevent loading of
    // about:blank
    return this.getContentWindowOrOpenURIInFrame(
      null,
      aParams,
      aWhere,
      aFlags,
      aName,
      true
    );
  }

  openURI() {
    throw Components.Exception("Not implemented", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  openURIInFrame() {
    throw Components.Exception("Not implemented", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  getContentWindowOrOpenURI() {
    throw Components.Exception("Not implemented", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  getContentWindowOrOpenURIInFrame(
    aURI,
    aParams,
    aWhere,
    aFlags,
    aName,
    aSkipLoad
  ) {
    if (aWhere != Ci.nsIBrowserDOMWindow.OPEN_NEWTAB) {
      console.error("openURIInFrame can only open in new tabs");
      return null;
    }

    const isExternal = !!(aFlags & Ci.nsIBrowserDOMWindow.OPEN_EXTERNAL);

    return this._openURIInNewTab(
      aURI,
      aParams.referrerInfo,
      isExternal,
      aParams.openWindowInfo,
      aParams.triggeringPrincipal,
      aParams.csp,
      aSkipLoad,
      aParams.openerBrowser?.getAttribute("messagemanagergroup")
    );
  }

  canClose() {
    return true;
  }

  get tabCount() {
    return 1;
  }
})();
