/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { BrowserUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/BrowserUtils.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);
var { MailE10SUtils } = ChromeUtils.import(
  "resource:///modules/MailE10SUtils.jsm"
);

ChromeUtils.defineESModuleGetters(this, {
  PromiseUtils: "resource://gre/modules/PromiseUtils.sys.mjs",
});

var gContextMenu;

/* globals reporterListener */

function loadRequestedUrl() {
  let browser = document.getElementById("requestFrame");
  browser.addProgressListener(reporterListener, Ci.nsIWebProgress.NOTIFY_ALL);
  browser.addEventListener(
    "DOMWindowClose",
    () => {
      if (browser.getAttribute("allowscriptstoclose") == "true") {
        window.close();
      }
    },
    true
  );
  browser.addEventListener(
    "pagetitlechanged",
    () => gBrowser.updateTitlebar(),
    true
  );

  // This window does double duty. If window.arguments[0] is a string, it's
  // probably being called by browser.identity.launchWebAuthFlowInParent.

  // Otherwise, it's probably being called by browser.windows.create, with an
  // array of URLs to open in tabs. We'll only attempt to open the first,
  // which is consistent with Firefox behaviour.

  if (typeof window.arguments[0] == "string") {
    MailE10SUtils.loadURI(browser, window.arguments[0]);
  } else {
    if (window.arguments[1].wrappedJSObject.allowScriptsToClose) {
      browser.setAttribute("allowscriptstoclose", "true");
    }
    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
    MailE10SUtils.loadURI(
      browser,
      window.arguments[1].wrappedJSObject.tabs[0].tabParams.url
    );
  }
}

// Fake it 'til you make it.
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
  async updateTitlebar() {
    let docTitle =
      browser.browsingContext?.currentWindowGlobal?.documentTitle?.trim() || "";
    if (!docTitle) {
      // If the document title is blank, use the default title.
      docTitle = await document.l10n.formatValue(
        "extension-popup-default-title"
      );
    } else {
      // Let l10n handle the addition of separator and modifier.
      docTitle = await document.l10n.formatValue("extension-popup-title", {
        title: docTitle,
      });
    }

    // Add preface, if defined.
    let docElement = document.documentElement;
    if (docElement.hasAttribute("titlepreface")) {
      docTitle = docElement.getAttribute("titlepreface") + docTitle;
    }

    document.title = docTitle;
    document.dispatchEvent(new Event("extension-window-title-changed"));
  },
  getTabForBrowser(browser) {
    return null;
  },
};

this.__defineGetter__("browser", getBrowser);

function getBrowser() {
  return gBrowser.selectedBrowser;
}

var gBrowserInit = {
  onDOMContentLoaded() {
    let initiallyFocusedElement = document.commandDispatcher.focusedElement;
    let promise = gBrowser.selectedBrowser.isRemoteBrowser
      ? PromiseUtils.defer().promise
      : Promise.resolve();

    promise.then(() => {
      // If focus didn't move while we were waiting, we're okay to move to
      // the browser.
      if (
        document.commandDispatcher.focusedElement == initiallyFocusedElement
      ) {
        gBrowser.selectedBrowser.focus();
      }
      loadRequestedUrl();
    });
  },
};

// The listener of DOMContentLoaded must be set on window, rather than
// document, because the window can go away before the event is fired.
// In that case, we don't want to initialize anything, otherwise we
// may be leaking things because they will never be destroyed after.
window.addEventListener(
  "DOMContentLoaded",
  gBrowserInit.onDOMContentLoaded.bind(gBrowserInit),
  { once: true }
);
