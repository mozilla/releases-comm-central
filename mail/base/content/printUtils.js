/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  SubDialogManager: "resource://gre/modules/SubDialog.sys.mjs",
});

var { MailE10SUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailE10SUtils.sys.mjs"
);

// Load PrintUtils lazily and modify it to suit.
ChromeUtils.defineLazyGetter(this, "PrintUtils", () => {
  const scope = {};
  Services.scriptloader.loadSubScript(
    "chrome://global/content/printUtils.js",
    scope
  );
  scope.PrintUtils.getTabDialogBox = function (browser) {
    if (!browser.tabDialogBox) {
      browser.tabDialogBox = new TabDialogBox(browser);
    }
    return browser.tabDialogBox;
  };
  scope.PrintUtils.createBrowser = function ({
    remoteType,
    initialBrowsingContextGroupId,
    userContextId,
    skipLoad,
    initiallyActive,
  } = {}) {
    const b = document.createXULElement("browser");
    // Use the JSM global to create the permanentKey, so that if the
    // permanentKey is held by something after this window closes, it
    // doesn't keep the window alive.
    b.permanentKey = new (Cu.getGlobalForObject(Services).Object)();

    const defaultBrowserAttributes = {
      maychangeremoteness: "true",
      messagemanagergroup: "browsers",
      type: "content",
    };
    for (const attribute in defaultBrowserAttributes) {
      b.setAttribute(attribute, defaultBrowserAttributes[attribute]);
    }

    if (userContextId) {
      b.setAttribute("usercontextid", userContextId);
    }

    if (remoteType) {
      b.setAttribute("remoteType", remoteType);
      b.setAttribute("remote", "true");
    }

    // Ensure that the browser will be created in a specific initial
    // BrowsingContextGroup. This may change the process selection behaviour
    // of the newly created browser, and is often used in combination with
    // "remoteType" to ensure that the initial about:blank load occurs
    // within the same process as another window.
    if (initialBrowsingContextGroupId) {
      b.setAttribute(
        "initialBrowsingContextGroupId",
        initialBrowsingContextGroupId
      );
    }

    // We set large flex on both containers to allow the devtools toolbox to
    // set a flex attribute. We don't want the toolbox to actually take up free
    // space, but we do want it to collapse when the window shrinks, and with
    // flex=0 it can't. When the toolbox is on the bottom it's a sibling of
    // browserStack, and when it's on the side it's a sibling of
    // browserContainer.
    const stack = document.createXULElement("stack");
    stack.className = "browserStack";
    stack.appendChild(b);

    const browserContainer = document.createXULElement("vbox");
    browserContainer.className = "browserContainer";
    browserContainer.appendChild(stack);

    const browserSidebarContainer = document.createXULElement("hbox");
    browserSidebarContainer.className = "browserSidebarContainer";
    browserSidebarContainer.appendChild(browserContainer);

    // Prevent the superfluous initial load of a blank document
    // if we're going to load something other than about:blank.
    if (skipLoad) {
      b.setAttribute("nodefaultsrc", "true");
    }

    return b;
  };

  scope.PrintUtils.__defineGetter__("printBrowser", () =>
    document.getElementById("hiddenPrintContent")
  );
  scope.PrintUtils.loadPrintBrowser = async function (url) {
    const printBrowser = this.printBrowser;
    if (printBrowser.currentURI?.spec == url) {
      return;
    }

    // The template page hasn't been loaded yet. Do that now.
    await new Promise(resolve => {
      // Store a strong reference to this progress listener.
      printBrowser.progressListener = {
        QueryInterface: ChromeUtils.generateQI([
          "nsIWebProgressListener",
          "nsISupportsWeakReference",
        ]),

        /** nsIWebProgressListener */
        onStateChange(webProgress, request, stateFlags, status) {
          if (
            stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
            printBrowser.currentURI.spec != "about:blank"
          ) {
            printBrowser.webProgress.removeProgressListener(this);
            delete printBrowser.progressListener;
            resolve();
          }
        },
      };

      printBrowser.webProgress.addProgressListener(
        printBrowser.progressListener,
        Ci.nsIWebProgress.NOTIFY_STATE_ALL
      );
      MailE10SUtils.loadURI(printBrowser, url);
    });
  };
  return scope.PrintUtils;
});

/**
 * The TabDialogBox supports opening window dialogs as SubDialogs on the tab and content
 * level. Both tab and content dialogs have their own separate managers.
 * Dialogs will be queued FIFO and cover the web content.
 * Dialogs are closed when the user reloads or leaves the page.
 * While a dialog is open PopupNotifications, such as permission prompts, are
 * suppressed.
 */
class TabDialogBox {
  constructor(browser) {
    this._weakBrowserRef = Cu.getWeakReference(browser);

    // Create parent element for tab dialogs
    const template = document.getElementById("dialogStackTemplate");
    this.dialogStack = template.content.cloneNode(true).firstElementChild;
    this.dialogStack.classList.add("tab-prompt-dialog");

    while (browser.ownerDocument != document) {
      // Find an ancestor <browser> in this document so that we can locate the
      // print preview appropriately.
      browser = browser.ownerGlobal.browsingContext.embedderElement;
    }

    // This differs from Firefox by using a specific ancestor <stack> rather
    // than the parent of the <browser>, so that a larger area of the screen
    // is used for the preview.
    this.printPreviewStack = document.querySelector(".printPreviewStack");
    if (this.printPreviewStack && this.printPreviewStack.contains(browser)) {
      this.printPreviewStack.appendChild(this.dialogStack);
    } else {
      this.printPreviewStack = this.browser.parentNode;
      this.browser.parentNode.insertBefore(
        this.dialogStack,
        this.browser.nextElementSibling
      );
    }

    // Initially the stack only contains the template
    const dialogTemplate = this.dialogStack.firstElementChild;

    // Create dialog manager for prompts at the tab level.
    this._tabDialogManager = new SubDialogManager({
      dialogStack: this.dialogStack,
      dialogTemplate,
      orderType: SubDialogManager.ORDER_QUEUE,
      allowDuplicateDialogs: true,
      dialogOptions: {
        consumeOutsideClicks: false,
      },
    });
  }

  /**
   * Open a dialog on tab or content level.
   *
   * @param {string} aURL - URL of the dialog to load in the tab box.
   * @param {object} [aOptions]
   * @param {string} [aOptions.features] - Comma separated list of window
   *   features.
   * @param {boolean} [aOptions.allowDuplicateDialogs] - Whether to allow
   *   showing multiple dialogs with aURL at the same time. If false calls for
   *   duplicate dialogs will be dropped.
   * @param {string} [aOptions.sizeTo] - Pass "available" to stretch dialog to
   *   roughly content size.
   * @param {boolean} [aOptions.keepOpenSameOriginNav] - By default dialogs are
   *   aborted on any navigation.
   *   Set to true to keep the dialog open for same origin navigation.
   * @param {number} [aOptions.modalType] - The modal type to create the dialog for.
   *   By default, we show the dialog for tab prompts.
   * @returns {object} [result] Returns an object { closedPromise, dialog }.
   * @returns {Promise} [result.closedPromise] Resolves once the dialog has been closed.
   * @returns {SubDialog} [result.dialog] A reference to the opened SubDialog.
   */
  open(
    aURL,
    {
      features = null,
      allowDuplicateDialogs = true,
      sizeTo,
      keepOpenSameOriginNav,
      modalType = null,
      allowFocusCheckbox = false,
    } = {},
    ...aParams
  ) {
    let resolveClosed;
    const closedPromise = new Promise(resolve => (resolveClosed = resolve));
    // Get the dialog manager to open the prompt with.
    const dialogManager =
      modalType === Ci.nsIPrompt.MODAL_TYPE_CONTENT
        ? this.getContentDialogManager()
        : this._tabDialogManager;
    const hasDialogs =
      this._tabDialogManager.hasDialogs ||
      this._contentDialogManager?.hasDialogs;

    if (!hasDialogs) {
      this._onFirstDialogOpen();
    }

    const closingCallback = event => {
      if (!hasDialogs) {
        this._onLastDialogClose();
      }

      if (allowFocusCheckbox && !event.detail?.abort) {
        this.maybeSetAllowTabSwitchPermission(event.target);
      }
    };

    if (modalType == Ci.nsIPrompt.MODAL_TYPE_CONTENT) {
      sizeTo = "limitheight";
    }

    // Open dialog and resolve once it has been closed
    const dialog = dialogManager.open(
      aURL,
      {
        features,
        allowDuplicateDialogs,
        sizeTo,
        closingCallback,
        closedCallback: resolveClosed,
      },
      ...aParams
    );

    // Marking the dialog externally, instead of passing it as an option.
    // The SubDialog(Manager) does not care about navigation.
    // dialog can be null here if allowDuplicateDialogs = false.
    if (dialog) {
      dialog._keepOpenSameOriginNav = keepOpenSameOriginNav;
    }
    return { closedPromise, dialog };
  }

  _onFirstDialogOpen() {
    this.browser?.onFirstPrintDialogOpened?.();
    for (const element of this.printPreviewStack.children) {
      if (element != this.dialogStack) {
        element.setAttribute("tabDialogShowing", true);
      }
    }

    // Register listeners
    this._lastPrincipal = this.browser.contentPrincipal;
    if ("addProgressListener" in this.browser) {
      this.browser.addProgressListener(this, Ci.nsIWebProgress.NOTIFY_LOCATION);
    }
  }

  _onLastDialogClose() {
    this.browser?.onLastPrintDialogClosed?.();
    for (const element of this.printPreviewStack.children) {
      if (element != this.dialogStack) {
        element.removeAttribute("tabDialogShowing");
      }
    }

    // Clean up listeners
    if ("removeProgressListener" in this.browser) {
      this.browser.removeProgressListener(this);
    }
    this._lastPrincipal = null;
  }

  _buildContentPromptDialog() {
    const template = document.getElementById("dialogStackTemplate");
    const contentDialogStack =
      template.content.cloneNode(true).firstElementChild;
    contentDialogStack.classList.add("content-prompt-dialog");

    // Create a dialog manager for content prompts.
    const tabPromptDialog =
      this.browser.parentNode.querySelector(".tab-prompt-dialog");
    this.browser.parentNode.insertBefore(contentDialogStack, tabPromptDialog);

    const contentDialogTemplate = contentDialogStack.firstElementChild;
    this._contentDialogManager = new SubDialogManager({
      dialogStack: contentDialogStack,
      dialogTemplate: contentDialogTemplate,
      orderType: SubDialogManager.ORDER_QUEUE,
      allowDuplicateDialogs: true,
      dialogOptions: {
        consumeOutsideClicks: false,
      },
    });
  }

  handleEvent(event) {
    if (event.type !== "TabClose") {
      return;
    }
    this.abortAllDialogs();
  }

  abortAllDialogs() {
    this._tabDialogManager.abortDialogs();
    this._contentDialogManager?.abortDialogs();
  }

  focus() {
    // Prioritize focusing the dialog manager for tab prompts
    if (this._tabDialogManager._dialogs.length) {
      this._tabDialogManager.focusTopDialog();
      return;
    }
    this._contentDialogManager?.focusTopDialog();
  }

  /**
   * If the user navigates away or refreshes the page, close all dialogs for
   * the current browser.
   */
  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {
    if (
      !aWebProgress.isTopLevel ||
      aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
    ) {
      return;
    }

    // Dialogs can be exempt from closing on same origin location change.
    let filterFn;

    // Test for same origin location change
    if (
      this._lastPrincipal?.isSameOrigin(
        aLocation,
        this.browser.browsingContext.usePrivateBrowsing
      )
    ) {
      filterFn = dialog => !dialog._keepOpenSameOriginNav;
    }

    this._lastPrincipal = this.browser.contentPrincipal;

    this._tabDialogManager.abortDialogs(filterFn);
    this._contentDialogManager?.abortDialogs(filterFn);
  }

  get tab() {
    return document.getElementById("tabmail").getTabForBrowser(this.browser);
  }

  get browser() {
    const browser = this._weakBrowserRef.get();
    if (!browser) {
      throw new Error("Stale dialog box! The associated browser is gone.");
    }
    return browser;
  }

  getTabDialogManager() {
    return this._tabDialogManager;
  }

  getContentDialogManager() {
    if (!this._contentDialogManager) {
      this._buildContentPromptDialog();
    }
    return this._contentDialogManager;
  }

  onNextPromptShowAllowFocusCheckboxFor(principal) {
    this._allowTabFocusByPromptPrincipal = principal;
  }

  /**
   * Sets the "focus-tab-by-prompt" permission for the dialog.
   */
  maybeSetAllowTabSwitchPermission(dialog) {
    const checkbox = dialog.querySelector("checkbox");

    if (checkbox.checked) {
      Services.perms.addFromPrincipal(
        this._allowTabFocusByPromptPrincipal,
        "focus-tab-by-prompt",
        Services.perms.ALLOW_ACTION
      );
    }

    // Don't show the "allow tab switch checkbox" for subsequent prompts.
    this._allowTabFocusByPromptPrincipal = null;
  }
}

TabDialogBox.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsIWebProgressListener",
  "nsISupportsWeakReference",
]);
