/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file is a much-modified copy of browser/components/extensions/ExtensionPopups.sys.mjs. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
});

import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";

var { DefaultWeakMap, ExtensionError, promiseEvent } = ExtensionUtils;

const REMOTE_PANEL_ID = "webextension-remote-preload-panel";
const POPUP_PANEL_CLASS_NAME = "webextension-popup-panel";
const POPUP_BROWSER_CLASS_NAME = "webextension-popup-browser";

export class BasePopup {
  constructor(
    extension,
    viewNode,
    popupURL,
    browserStyle,
    fixedWidth = false,
    blockParser = false
  ) {
    this.extension = extension;
    this.popupURL = popupURL;
    this.viewNode = viewNode;
    this.browserStyle = browserStyle;
    this.window = viewNode.ownerGlobal;
    this.destroyed = false;
    this.fixedWidth = fixedWidth;
    this.blockParser = blockParser;

    extension.callOnClose(this);

    this.contentReady = new Promise(resolve => {
      this._resolveContentReady = resolve;
    });
    this.contentReadyAndResized = Promise.withResolvers();

    this.window.addEventListener("unload", this);
    this.viewNode.addEventListener("popuphiding", this);
    this.panel.addEventListener("popuppositioned", this, {
      once: true,
      capture: true,
    });

    this.browser = null;
    this.browserLoaded = new Promise((resolve, reject) => {
      this.browserLoadedDeferred = { resolve, reject };
    });
    this.browserReady = this.createBrowser(viewNode, popupURL);

    BasePopup.instances.get(this.window).set(extension, this);
  }

  static for(extension, window) {
    return BasePopup.instances.get(window).get(extension);
  }

  close() {
    this.closePopup();
  }

  destroy() {
    this.extension.forgetOnClose(this);

    this.window.removeEventListener("unload", this);

    this.destroyed = true;
    this.browserLoadedDeferred.reject(new ExtensionError("Popup destroyed"));
    // Ignore unhandled rejections if the "attach" method is not called.
    this.browserLoaded.catch(() => {});

    BasePopup.instances.get(this.window).delete(this.extension);

    return this.browserReady.then(() => {
      if (this.browser) {
        this.destroyBrowser(this.browser, true);
        this.browser.parentNode.remove();
      }
      if (this.stack) {
        this.stack.remove();
      }

      if (this.viewNode) {
        this.viewNode.removeEventListener("popuphiding", this);
        delete this.viewNode.customRectGetter;
      }

      const { panel } = this;
      if (panel) {
        panel.removeEventListener("popuppositioned", this, { capture: true });
      }
      if (panel && panel.id !== REMOTE_PANEL_ID) {
        panel.style.removeProperty("--arrowpanel-background");
        panel.style.removeProperty("--arrowpanel-border-color");
        panel.removeAttribute("remote");
      }

      this.browser = null;
      this.stack = null;
      this.viewNode = null;
    });
  }

  destroyBrowser(browser, finalize = false) {
    const mm = browser.messageManager;
    // If the browser has already been removed from the document, because the
    // popup was closed externally, there will be no message manager here, so
    // just replace our receiveMessage method with a stub.
    if (mm) {
      mm.removeMessageListener("Extension:BrowserBackgroundChanged", this);
      mm.removeMessageListener("Extension:BrowserContentLoaded", this);
      mm.removeMessageListener("Extension:BrowserResized", this);
    } else if (finalize) {
      this.receiveMessage = () => {};
    }
    browser.removeEventListener("pagetitlechanged", this);
    browser.removeEventListener("DOMWindowClose", this);
  }

  get STYLESHEETS() {
    const sheets = [];

    if (this.browserStyle) {
      sheets.push("chrome://browser/content/extension.css");
    }
    if (!this.fixedWidth) {
      sheets.push("chrome://browser/content/extension-popup-panel.css");
    }

    return sheets;
  }

  get panel() {
    let panel = this.viewNode;
    while (panel && panel.localName != "panel") {
      panel = panel.parentNode;
    }
    return panel;
  }

  receiveMessage({ name, data }) {
    switch (name) {
      case "Extension:BrowserBackgroundChanged":
        this.setBackground(data.background);
        break;

      case "Extension:BrowserContentLoaded":
        this.browserLoadedDeferred.resolve();
        break;

      case "Extension:BrowserResized":
        this._resolveContentReady();
        // The final resize is marked as delayed, which is the one we have to wait for.
        if (data.detail == "delayed") {
          this.contentReadyAndResized.resolve();
        }
        if (this.ignoreResizes) {
          this.dimensions = data;
        } else {
          this.resizeBrowser(data);
        }
        break;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "unload":
      case "popuphiding":
        if (!this.destroyed) {
          this.destroy();
        }
        break;
      case "popuppositioned":
        if (!this.destroyed) {
          this.browserLoaded
            .then(() => {
              if (this.destroyed) {
                return;
              }
              // Wait the reflow before asking the popup panel to grab the focus, otherwise
              // `nsFocusManager::SetFocus` may ignore out request because the panel view
              // visibility is still set to `nsViewVisibility_kHide` (waiting the document
              // to be fully flushed makes us sure that when the popup panel grabs the focus
              // nsMenuPopupFrame::LayoutPopup has already been colled and set the frame
              // visibility to `nsViewVisibility_kShow`).
              this.browser.ownerGlobal.promiseDocumentFlushed(() => {
                if (this.destroyed) {
                  return;
                }
                this.browser.messageManager.sendAsyncMessage(
                  "Extension:GrabFocus",
                  {}
                );
              });
            })
            .catch(() => {
              // If the panel closes too fast an exception is raised here and tests will fail.
            });
        }
        break;

      case "pagetitlechanged":
        this.viewNode.setAttribute("aria-label", this.browser.contentTitle);
        break;

      case "DOMWindowClose":
        this.closePopup();
        break;
    }
  }

  createBrowser(viewNode, popupURL = null) {
    const document = viewNode.ownerDocument;

    const stack = document.createXULElement("stack");
    stack.setAttribute("class", "webextension-popup-stack");

    const browser = document.createXULElement("browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("messagemanagergroup", "webext-browsers");
    browser.setAttribute("class", POPUP_BROWSER_CLASS_NAME);
    browser.setAttribute("webextension-view-type", "popup");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    browser.setAttribute("context", "browserContext");
    browser.setAttribute("autocompletepopup", "PopupAutoComplete");
    browser.setAttribute("selectmenulist", "ContentSelectDropdown");
    browser.setAttribute("constrainpopups", "false");
    browser.setAttribute("datetimepicker", "DateTimePickerPanel");
    browser.setAttribute("nodefaultsrc", "true");
    browser.setAttribute("maychangeremoteness", "true");

    // Ensure the browser will initially load in the same group as other
    // browsers from the same extension.
    browser.setAttribute(
      "initialBrowsingContextGroupId",
      this.extension.policy.browsingContextGroupId
    );

    if (this.extension.remote) {
      browser.setAttribute("remote", "true");
      browser.setAttribute("remoteType", this.extension.remoteType);
    }

    // We only need flex sizing for the sake of the slide-in sub-views of the
    // main menu panel, so that the browser occupies the full width of the view,
    // and also takes up any extra height that's available to it.
    browser.setAttribute("flex", "1");
    stack.setAttribute("flex", "1");

    // Note: When using noautohide panels, the popup manager will add width and
    // height attributes to the panel, breaking our resize code, if the browser
    // starts out smaller than 30px by 10px. This isn't an issue now, but it
    // will be if and when we popup debugging.

    this.browser = browser;
    this.stack = stack;

    let readyPromise;
    if (this.extension.remote) {
      readyPromise = promiseEvent(browser, "XULFrameLoaderCreated");
    } else {
      readyPromise = promiseEvent(browser, "load");
    }

    stack.appendChild(browser);
    viewNode.appendChild(stack);

    if (!this.extension.remote) {
      // FIXME: bug 1494029 - this code used to rely on the browser binding
      // accessing browser.contentWindow. This is a stopgap to continue doing
      // that, but we should get rid of it in the long term.
      browser.contentWindow; // eslint-disable-line no-unused-expressions
    }

    // eslint-disable-next-line no-shadow
    const setupBrowser = browser => {
      const mm = browser.messageManager;
      mm.addMessageListener("Extension:BrowserBackgroundChanged", this);
      mm.addMessageListener("Extension:BrowserContentLoaded", this);
      mm.addMessageListener("Extension:BrowserResized", this);
      browser.addEventListener("pagetitlechanged", this);
      browser.addEventListener("DOMWindowClose", this);

      lazy.ExtensionParent.apiManager.emit(
        "extension-browser-inserted",
        browser
      );
      return browser;
    };

    const initBrowser = () => {
      setupBrowser(browser);
      const mm = browser.messageManager;

      mm.loadFrameScript(
        "chrome://extensions/content/ext-browser-content.js",
        false,
        true
      );

      mm.sendAsyncMessage("Extension:InitBrowser", {
        allowScriptsToClose: true,
        blockParser: this.blockParser,
        fixedWidth: this.fixedWidth,
        maxWidth: 800,
        maxHeight: 600,
        stylesheets: this.STYLESHEETS,
      });
    };

    browser.addEventListener("DidChangeBrowserRemoteness", initBrowser); // eslint-disable-line mozilla/balanced-listeners

    if (!popupURL) {
      // For remote browsers, we can't do any setup until the frame loader is
      // created. Non-remote browsers get a message manager immediately, so
      // there's no need to wait for the load event.
      if (this.extension.remote) {
        return readyPromise.then(() => setupBrowser(browser));
      }
      return setupBrowser(browser);
    }

    return readyPromise.then(() => {
      initBrowser();
      browser.fixupAndLoadURIString(popupURL, {
        triggeringPrincipal: this.extension.principal,
      });
    });
  }

  unblockParser() {
    this.browserReady.then(() => {
      if (this.destroyed) {
        return;
      }
      this.browser.messageManager.sendAsyncMessage("Extension:UnblockParser");
    });
  }

  resizeBrowser({ width, height, detail }) {
    if (this.fixedWidth) {
      // Figure out how much extra space we have on the side of the panel
      // opposite the arrow.
      const side = this.panel.getAttribute("side") == "top" ? "bottom" : "top";
      const maxHeight = this.viewHeight + this.extraHeight[side];

      height = Math.min(height, maxHeight);
      this.browser.style.height = `${height}px`;

      // Used by the panelmultiview code to figure out sizing without reparenting
      // (which would destroy the browser and break us).
      this.lastCalculatedInViewHeight = Math.max(height, this.viewHeight);
    } else {
      this.browser.style.width = `${width}px`;
      this.browser.style.minWidth = `${width}px`;
      this.browser.style.height = `${height}px`;
      this.browser.style.minHeight = `${height}px`;
    }

    const event = new this.window.CustomEvent("WebExtPopupResized", { detail });
    this.browser.dispatchEvent(event);
  }

  setBackground(background) {
    // Panels inherit the applied theme (light, dark, etc) and there is a high
    // likelihood that most extension authors will not have tested with a dark theme.
    // If they have not set a background-color, we force it to white to ensure visibility
    // of the extension content. Passing `null` should be treated the same as no argument,
    // which is why we can't use default parameters here.
    if (!background) {
      background = "#fff";
    }
    if (this.panel.id != "widget-overflow") {
      this.panel.style.setProperty("--arrowpanel-background", background);
    }
    if (background == "#fff") {
      // Set a usable default color that work with the default background-color.
      this.panel.style.setProperty(
        "--arrowpanel-border-color",
        "hsla(210,4%,10%,.15)"
      );
    }
    this.background = background;
  }
}

export class ViewPopup extends BasePopup {
  constructor(
    extension,
    window,
    popupURL,
    browserStyle,
    fixedWidth,
    blockParser
  ) {
    const document = window.document;

    const createPanel = remote => {
      const panel = document.createXULElement("panel");
      panel.setAttribute("type", "arrow");
      panel.setAttribute("class", `panel-no-padding ${POPUP_PANEL_CLASS_NAME}`);
      if (remote) {
        panel.setAttribute("remote", "true");
        panel.id = REMOTE_PANEL_ID;
      }
      panel.setAttribute("neverhidden", "true");

      document.getElementById("mainPopupSet").appendChild(panel);
      return panel;
    };

    // Firefox creates a temporary panel to hold the browser while it pre-loads
    // its content (starting on mouseover already). That panel will never be shown,
    // but the browser's docShell will be swapped with the browser in the real
    // panel when it's ready.
    // See https://searchfox.org/mozilla-central/rev/dbef1a2f75798fb0136b7428d959c8feb09ad5d1/browser/components/extensions/ExtensionPopups.sys.mjs#572)

    // NOTE: Thunderbird does not pre-load the popup and really uses the created
    //       panel/browser when displaying the popup to the user.

    // Remove any existing panel, to prevent content from a previously shown panel
    // to bleed into the new panel.
    document
      .querySelectorAll(`.${POPUP_PANEL_CLASS_NAME}`)
      .forEach(panel => panel.remove());

    // Remove any leftover webextension popup browser/stack.
    document
      .querySelectorAll(`.${POPUP_BROWSER_CLASS_NAME}`)
      .forEach(browser => browser.parentNode.remove());

    const panel = createPanel(extension.remote);
    super(extension, panel, popupURL, browserStyle, fixedWidth, blockParser);

    this.ignoreResizes = true;
  }

  destroy() {
    return super.destroy().then(() => {
      // Remove the browser/stack.
      if (this.browser) {
        this.browser.parentNode.remove();
        this.browser = null;
      }
    });
  }

  closePopup() {
    this.viewNode.hidePopup();
  }
}

/**
 * A map of active popups for a given browser window.
 *
 * WeakMap[window -> WeakMap[Extension -> BasePopup]]
 */
BasePopup.instances = new DefaultWeakMap(() => new WeakMap());
