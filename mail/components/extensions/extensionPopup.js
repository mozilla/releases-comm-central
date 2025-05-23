/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { getContentPrincipalWithProtocolPermission } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { BrowserUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/BrowserUtils.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var gContextMenu;

/* globals reporterListener */

/**
 * @implements {nsICommandController}
 */
var contentController = {
  commands: {
    cmd_reload: {
      isEnabled() {
        return !contentProgress.busy;
      },
      doCommand() {
        document.getElementById("requestFrame").reload();
      },
    },
    cmd_stop: {
      isEnabled() {
        return contentProgress.busy;
      },
      doCommand() {
        document.getElementById("requestFrame").stop();
      },
    },
    "Browser:Back": {
      isEnabled() {
        return gBrowser.canGoBack;
      },
      doCommand() {
        gBrowser.goBack();
      },
    },
    "Browser:Forward": {
      isEnabled() {
        return gBrowser.canGoForward;
      },
      doCommand() {
        gBrowser.goForward();
      },
    },
  },

  supportsCommand(command) {
    return command in this.commands;
  },
  isCommandEnabled(command) {
    if (!this.supportsCommand(command)) {
      return false;
    }
    const cmd = this.commands[command];
    return cmd.isEnabled();
  },
  doCommand(command) {
    if (!this.supportsCommand(command)) {
      return;
    }
    const cmd = this.commands[command];
    if (!cmd.isEnabled()) {
      return;
    }
    cmd.doCommand();
  },
  onEvent() {},
};

function loadRequestedUrl() {
  const extBrowser = document.getElementById("requestFrame");
  extBrowser.addProgressListener(
    reporterListener,
    Ci.nsIWebProgress.NOTIFY_ALL
  );
  extBrowser.addEventListener(
    "DOMWindowClose",
    () => {
      if (extBrowser.getAttribute("allowscriptstoclose") == "true") {
        window.close();
      }
    },
    true
  );
  extBrowser.addEventListener(
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
    const url = window.arguments[0];
    const uri = Services.io.newURI(url);
    MailE10SUtils.loadURI(extBrowser, url, {
      triggeringPrincipal: getContentPrincipalWithProtocolPermission(uri),
    });
  } else {
    const createData = window.arguments[1].wrappedJSObject;
    const tabParams = createData.tabs[0].tabParams;
    const uri = Services.io.newURI(tabParams.url);

    // moz-extension:// urls default to allowScriptsToClose = true
    const defaultScriptsToClose = uri.scheme == "moz-extension";

    if (createData.allowScriptsToClose ?? defaultScriptsToClose) {
      extBrowser.setAttribute("allowscriptstoclose", "true");
    }
    if (tabParams.userContextId) {
      extBrowser.setAttribute("usercontextid", tabParams.userContextId);
    }
    if (createData.linkHandler) {
      extBrowser.setAttribute("messagemanagergroup", createData.linkHandler);
    }

    ExtensionParent.apiManager.emit("extension-browser-inserted", extBrowser);
    MailE10SUtils.loadURI(extBrowser, tabParams.url, {
      triggeringPrincipal: createData.triggeringPrincipal,
    });
  }
}

// Fake it 'til you make it.
var gBrowser = {
  get canGoBack() {
    return this.selectedBrowser.canGoBack;
  },

  get canGoForward() {
    return this.selectedBrowser.canGoForward;
  },

  goForward(requireUserInteraction) {
    return this.selectedBrowser.goForward(requireUserInteraction);
  },

  goBack(requireUserInteraction) {
    return this.selectedBrowser.goBack(requireUserInteraction);
  },

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
    const docElement = document.documentElement;
    if (docElement.hasAttribute("titlepreface")) {
      docTitle = docElement.getAttribute("titlepreface") + docTitle;
    }

    document.title = docTitle;
  },
  getTabForBrowser() {
    return null;
  },
};

this.__defineGetter__("browser", getBrowser);

function getBrowser() {
  return gBrowser.selectedBrowser;
}

var gBrowserInit = {
  onDOMContentLoaded() {
    // This needs setting up before we create the first remote browser.
    window.docShell.treeOwner
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIAppWindow).XULBrowserWindow = window.XULBrowserWindow;

    window.tryToClose = () => {
      if (window.onclose()) {
        window.close();
      }
    };

    window.onclose = () => {
      const { permitUnload } = gBrowser.selectedBrowser.permitUnload();
      return permitUnload;
    };

    const initiallyFocusedElement = document.commandDispatcher.focusedElement;
    const promise = gBrowser.selectedBrowser.isRemoteBrowser
      ? Promise.withResolvers().promise
      : Promise.resolve();

    contentProgress.addListener({
      onStateChange(_browser, webProgress, _request, stateFlags, statusCode) {
        if (!webProgress.isTopLevel) {
          return;
        }

        let status;
        if (stateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) {
          if (stateFlags & Ci.nsIWebProgressListener.STATE_START) {
            status = "loading";
          } else if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
            status = "complete";
          }
        } else if (
          stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
          statusCode == Cr.NS_BINDING_ABORTED
        ) {
          status = "complete";
        }

        contentProgress.busy = status == "loading";
      },
    });
    contentProgress.addProgressListenerToBrowser(gBrowser.selectedBrowser);

    top.controllers.appendController(contentController);

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

  isAdoptingTab() {
    // Required for compatibility with toolkit's ext-webNavigation.js
    return false;
  },
};

/**
 * @implements {nsIXULBrowserWindow}
 */
var XULBrowserWindow = {
  // Used in mailWindows to show the link in the status bar, but popup windows
  // do not have one. Do nothing here.
  setOverLink() {},

  // Called before links are navigated to to allow us to retarget them if needed.
  onBeforeLinkTraversal(originalTarget) {
    return originalTarget;
  },

  // Called by BrowserParent::RecvShowTooltip.
  showTooltip(xDevPix, yDevPix, tooltip, direction) {
    if (
      Cc["@mozilla.org/widget/dragservice;1"]
        .getService(Ci.nsIDragService)
        .getCurrentSession()
    ) {
      return;
    }

    const elt = document.getElementById("remoteBrowserTooltip");
    elt.label = tooltip;
    elt.style.direction = direction;
    elt.openPopupAtScreen(
      xDevPix / window.devicePixelRatio,
      yDevPix / window.devicePixelRatio,
      false,
      null
    );
  },

  // Called by BrowserParent::RecvHideTooltip.
  hideTooltip() {
    const elt = document.getElementById("remoteBrowserTooltip");
    elt.hidePopup();
  },

  getTabCount() {
    // Popup windows have a single tab.
    return 1;
  },
};

/**
 * Combines all nsIWebProgress notifications from all content browsers in this
 * window and reports them to the registered listeners.
 *
 * @see WindowTracker (ext-mail.js)
 * @see StatusListener, WindowTrackerBase (ext-tabs-base.js)
 */
var contentProgress = {
  _listeners: new Set(),
  busy: false,

  addListener(listener) {
    this._listeners.add(listener);
  },

  removeListener(listener) {
    this._listeners.delete(listener);
  },

  callListeners(method, args) {
    for (const listener of this._listeners.values()) {
      if (method in listener) {
        try {
          listener[method](...args);
        } catch (e) {
          console.error(e);
        }
      }
    }
  },

  /**
   * Ensure that `browser` has a ProgressListener attached to it.
   *
   * @param {Browser} browser
   */
  // eslint-disable-next-line no-shadow
  addProgressListenerToBrowser(browser) {
    if (browser?.webProgress && !browser._progressListener) {
      browser._progressListener = new contentProgress.ProgressListener(browser);
      browser.webProgress.addProgressListener(
        browser._progressListener,
        Ci.nsIWebProgress.NOTIFY_ALL
      );
    }
  },

  // @implements {nsIWebProgressListener}
  // @implements {nsIWebProgressListener2}
  ProgressListener: class {
    QueryInterface = ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsIWebProgressListener2",
      "nsISupportsWeakReference",
    ]);

    /**
     * @param {Browser} b
     */
    constructor(b) {
      this.browser = b;
    }

    callListeners(method, args) {
      args.unshift(this.browser);
      contentProgress.callListeners(method, args);
    }

    onProgressChange(...args) {
      this.callListeners("onProgressChange", args);
    }

    onProgressChange64(...args) {
      this.callListeners("onProgressChange64", args);
    }

    onLocationChange(...args) {
      this.callListeners("onLocationChange", args);
    }

    onStateChange(...args) {
      this.callListeners("onStateChange", args);
    }

    onStatusChange(...args) {
      this.callListeners("onStatusChange", args);
    }

    onSecurityChange(...args) {
      this.callListeners("onSecurityChange", args);
    }

    onContentBlockingEvent(...args) {
      this.callListeners("onContentBlockingEvent", args);
    }

    onRefreshAttempted(...args) {
      return this.callListeners("onRefreshAttempted", args);
    }
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
