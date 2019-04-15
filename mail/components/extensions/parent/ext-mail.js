/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(
  this, "uuidGenerator", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator"
);

var {
  ExtensionError,
} = ExtensionUtils;

var {
  defineLazyGetter,
} = ExtensionCommon;

let tabTracker;
let windowTracker;

// This function is pretty tightly tied to Extension.jsm.
// Its job is to fill in the |tab| property of the sender.
const getSender = (extension, target, sender) => {
  let tabId = -1;
  if ("tabId" in sender) {
    // The message came from a privileged extension page running in a tab. In
    // that case, it should include a tabId property (which is filled in by the
    // page-open listener below).
    tabId = sender.tabId;
    delete sender.tabId;
  } else if (ExtensionCommon.instanceOf(target, "XULFrameElement") ||
             ExtensionCommon.instanceOf(target, "HTMLIFrameElement")) {
    tabId = tabTracker.getBrowserData(target).tabId;
  }

  if (tabId != null && tabId >= 0) {
    let tab = extension.tabManager.get(tabId, null);
    if (tab) {
      sender.tab = tab.convert();
    }
  }
};

// Used by Extension.jsm.
global.tabGetSender = getSender;

global.makeWidgetId = id => {
  id = id.toLowerCase();
  // FIXME: This allows for collisions.
  return id.replace(/[^a-z0-9_-]/g, "_");
};


/**
 * Gets the tab browser for the tabmail tabInfo.
 *
 * @param {NativeTabInfo} nativeTabInfo     The tabInfo object to get the browser for
 * @return {?XULElement}                    The browser element for the tab
 */
function getTabBrowser(nativeTabInfo) {
  if (!nativeTabInfo) {
    return null;
  }

  if (nativeTabInfo.mode.getBrowser) {
    return nativeTabInfo.mode.getBrowser(nativeTabInfo);
  }

  if (nativeTabInfo.mode.tabType.getBrowser) {
    return nativeTabInfo.mode.tabType.getBrowser(nativeTabInfo);
  }

  return null;
}
global.getTabBrowser = getTabBrowser;

/* global searchInitialized */
// This promise is used to wait for the search service to be initialized.
// None of the code in the WebExtension modules requests that initialization.
// It is assumed that it is started at some point. That might never happen,
// e.g. if the application shuts down before the search service initializes.
XPCOMUtils.defineLazyGetter(global, "searchInitialized", () => {
  if (Services.search.isInitialized) {
    return Promise.resolve();
  }
  return ExtensionUtils.promiseObserved("browser-search-service", (_, data) => data == "init-complete");
});

/**
 * The window tracker tracks opening and closing Thunderbird windows. Each window has an id, which
 * is mapped to native window objects.
 */
class WindowTracker extends WindowTrackerBase {
  /**
   * Adds a tab progress listener to the given mail window.
   *
   * @param {DOMWindow} window      The mail window to which to add the listener.
   * @param {Object} listener       The listener to add
   */
  addProgressListener(window, listener) {
    let tabmail = window.document.getElementById("tabmail");
    tabmail.addTabsProgressListener(listener);
  }

  /**
   * Removes a tab progress listener from the given mail window.
   *
   * @param {DOMWindow} window      The mail window from which to remove the listener.
   * @param {Object} listener       The listener to remove
   */
  removeProgressListener(window, listener) {
    let tabmail = window.document.getElementById("tabmail");
    tabmail.removeTabsProgressListener(listener);
  }

  /**
   * Determines if the passed window object is a mail window. The function name is for base class
   * compatibility with gecko.
   *
   * @param {DOMWindow} window      The window to check
   * @return {Boolean}              True, if the window is a mail window
   */
  isBrowserWindow(window) {
    let { documentElement } = window.document;

    return documentElement.getAttribute("windowtype") === "mail:3pane";
  }

  /**
   * The currently active, or topmost, mail window, or null if no mail window is currently open.
   *
   * @property {?DOMWindow} topWindow
   * @readonly
   */
  get topWindow() {
    return Services.wm.getMostRecentWindow("mail:3pane");
  }

  /**
   * The currently active, or topmost, mail window, or null if no mail window is currently open.
   *
   * @property {DOMWindow|null} topWindow
   * @readonly
   */
  get topNonPBWindow() {
    return Services.wm.getMostRecentWindow("mail:3pane");
  }

  /**
   * The currently active, or topmost, mail window, or null if no mail window is currently open.
   * Will only return the topmost "normal" (i.e., not popup) window.
   *
   * @property {?DOMWindow} topNormalWindow
   * @readonly
   */
  get topNormalWindow() {
    let win = null;

    win = Services.wm.getMostRecentWindow("mail:3pane", true);

    // If we're lucky, this isn't a popup, and we can just return this.
    if (win && win.document.documentElement.getAttribute("chromehidden")) {
      win = null;
      let windowList = Services.wm.getEnumerator("mail:3pane", true);
      // This is oldest to newest, so this gets a bit ugly.
      while (windowList.hasMoreElements()) {
        let nextWin = windowList.getNext();
        if (!nextWin.document.documentElement.getAttribute("chromehidden")) {
          win = nextWin;
        }
      }
    }

    return win;
  }
}

/**
 * An event manager API provider which listens for a DOM event in any mail
 * window, and calls the given listener function whenever an event is received.
 * That listener function receives a `fire` object, which it can use to dispatch
 * events to the extension, and a DOM event object.
 *
 * @param {BaseContext} context
 *        The extension context which the event manager belongs to.
 * @param {string} name
 *        The API name of the event manager, e.g.,"runtime.onMessage".
 * @param {string} event
 *        The name of the DOM event to listen for.
 * @param {function} listener
 *        The listener function to call when a DOM event is received.
 */
global.WindowEventManager = class extends EventManager {
  constructor({ context, name, event, listener }) {
    super({
      context,
      name,
      listener: (fire) => {
        let listener2 = listener.bind(null, fire);

        windowTracker.addListener(event, listener2);
        return () => {
          windowTracker.removeListener(event, listener2);
        };
      },
    });
  }
};

/**
 * Tracks the opening and closing of tabs and maps them between their numeric WebExtension ID and
 * the native tab info objects.
 */
class TabTracker extends TabTrackerBase {
  constructor() {
    super();

    this._tabs = new WeakMap();
    this._browsers = new WeakMap();
    this._tabIds = new Map();
    this._nextId = 1;
    this._movingTabs = new Map();

    this._handleTabDestroyed = this._handleTabDestroyed.bind(this);
  }

  /**
   * Initialize tab tracking listeners the first time that an event listener is added.
   */
  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this._handleWindowOpen = this._handleWindowOpen.bind(this);
    this._handleWindowClose = this._handleWindowClose.bind(this);

    windowTracker.addListener("TabClose", this);
    windowTracker.addListener("TabOpen", this);
    windowTracker.addListener("TabSelect", this);
    windowTracker.addOpenListener(this._handleWindowOpen);
    windowTracker.addCloseListener(this._handleWindowClose);

    /* eslint-disable mozilla/balanced-listeners */
    this.on("tab-detached", this._handleTabDestroyed);
    this.on("tab-removed", this._handleTabDestroyed);
    /* eslint-enable mozilla/balanced-listeners */
  }

  /**
   * Returns the numeric ID for the given native tab.
   *
   * @param {NativeTabInfo} nativeTabInfo       The tabmail tabInfo for which to return an ID
   * @return {Integer}                          The tab's numeric ID
   */
  getId(nativeTabInfo) {
    let id = this._tabs.get(nativeTabInfo);
    if (id) {
      return id;
    }

    this.init();

    id = this._nextId++;
    this.setId(nativeTabInfo, id);
    return id;
  }

  /**
   * Returns the tab id corresponding to the given browser element.
   *
   * @param {XULElement} browser        The <browser> element to retrieve for
   * @return {Integer}                  The tab's numeric ID
   */
  getBrowserTabId(browser) {
    let id = this._browsers.get(browser);
    if (id) {
      return id;
    }

    let tabmail = browser.ownerDocument.getElementById("tabmail");
    let tab = tabmail && tabmail.tabInfo.find(info => getTabBrowser(info) == browser);

    if (tab) {
      id = this.getId(tab);
      this._browsers.set(browser, id);
      return id;
    }
    return -1;
  }

  /**
   * Records the tab information for the given tabInfo object.
   *
   * @param {NativeTabInfo} nativeTabInfo       The tab info to record for
   * @param {Integer} id                        The tab id to record
   */
  setId(nativeTabInfo, id) {
    this._tabs.set(nativeTabInfo, id);
    let browser = getTabBrowser(nativeTabInfo);
    if (browser) {
      this._browsers.set(browser, id);
    }
    this._tabIds.set(id, nativeTabInfo);
  }

  /**
   * Function to call when a tab was close, deletes tab information for the tab.
   *
   * @param {Event} event                  The event triggering the detroyal
   * @param {{ nativeTabInfo:NativeTabInfo}}  The object containing tab info
   */
  _handleTabDestroyed(event, { nativeTabInfo }) {
    let id = this._tabs.get(nativeTabInfo);
    if (id) {
      this._tabs.delete(nativeTabInfo);
      if (this._tabIds.get(id) === nativeTabInfo) {
        this._tabIds.delete(id);
      }
    }
  }

  /**
   * Returns the native tab with the given numeric ID.
   *
   * @param {Integer} tabId     The numeric ID of the tab to return.
   * @param {*} default_        The value to return if no tab exists with the given ID.
   * @return {NativeTabInfo}    The tab information for the given id.
   */
  getTab(tabId, default_ = undefined) {
    let nativeTabInfo = this._tabIds.get(tabId);
    if (nativeTabInfo) {
      return nativeTabInfo;
    }
    if (default_ !== undefined) {
      return default_;
    }
    throw new ExtensionError(`Invalid tab ID: ${tabId}`);
  }

  /**
   * Handles load events for recently-opened windows, and adds additional
   * listeners which may only be safely added when the window is fully loaded.
   *
   * @param {Event} event       A DOM event to handle.
   */
  handleEvent(event) {
    let nativeTabInfo = event.detail.tabInfo;
    if (!getTabBrowser(nativeTabInfo)) {
      // We don't care about events for tabs that don't have a browser
      return;
    }

    switch (event.type) {
      case "TabOpen": {
        // Save the current tab, since the newly-created tab will likely be
        // active by the time the promise below resolves and the event is
        // dispatched.
        let tabmail = event.target.ownerDocument.getElementById("tabmail");
        let currentTab = tabmail.selectedTab;

        // We need to delay sending this event until the next tick, since the
        // tab does not have its final index when the TabOpen event is dispatched.
        Promise.resolve().then(() => {
          if (event.detail.moving) {
            let srcTabId = this._movingTabs.get(event.detail.moving);
            this.setId(nativeTabInfo, srcTabId);
            this._movingTabs.delete(event.detail.moving);

            this.emitAttached(nativeTabInfo);
          } else {
            this.emitCreated(nativeTabInfo, currentTab);
          }
        });
        break;
      }

      case "TabClose": {
        if (event.detail.moving) {
          this._movingTabs.set(event.detail.moving, this.getId(nativeTabInfo));
          this.emitDetached(nativeTabInfo);
        } else {
          this.emitRemoved(nativeTabInfo, false);
        }
        break;
      }

      case "TabSelect":
        // Because we are delaying calling emitCreated above, we also need to
        // delay sending this event because it shouldn't fire before onCreated.
        Promise.resolve().then(() => {
          this.emitActivated(nativeTabInfo);
        });
        break;
    }
  }

  /**
   * A private method which is called whenever a new mail window is opened, and dispatches the
   * necessary events for it.
   *
   * @param {DOMWindow} window      The window being opened.
   */
  _handleWindowOpen(window) {
    let tabmail = window.document.getElementById("tabmail");
    for (let nativeTabInfo of tabmail.tabInfo) {
      if (!getTabBrowser(nativeTabInfo)) {
        continue;
      }
      this.emitCreated(nativeTabInfo);
    }
  }

  /**
   * A private method which is called whenever a mail window is closed, and dispatches the necessary
   * events for it.
   *
   * @param {DOMWindow} window      The window being closed.
   */
  _handleWindowClose(window) {
    let tabmail = window.document.getElementById("tabmail");
    for (let nativeTabInfo of tabmail.tabInfo) {
      if (!getTabBrowser(nativeTabInfo)) {
        continue;
      }
      this.emitRemoved(nativeTabInfo, true);
    }
  }

  /**
   * Emits a "tab-activated" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo   The tab info which has been activated.
   */
  emitActivated(nativeTabInfo) {
    let browser = getTabBrowser(nativeTabInfo);

    this.emit("tab-activated", {
      tabId: this.getId(nativeTabInfo),
      windowId: windowTracker.getId(browser.ownerGlobal),
    });
  }

  /**
   * Emits a "tab-attached" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo   The tab info which is being attached.
   */
  emitAttached(nativeTabInfo) {
    let tabId = this.getId(nativeTabInfo);
    let browser = getTabBrowser(nativeTabInfo);
    let tabmail = browser.ownerDocument.getElementById("tabmail");
    let tabIndex = tabmail._getTabContextForTabbyThing(nativeTabInfo)[0];
    let newWindowId = windowTracker.getId(browser.ownerGlobal);

    this.emit("tab-attached", { nativeTabInfo, tabId, newWindowId, newPosition: tabIndex });
  }

  /**
   * Emits a "tab-detached" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo   The tab info which is being detached.
   */
  emitDetached(nativeTabInfo) {
    let tabId = this.getId(nativeTabInfo);
    let browser = getTabBrowser(nativeTabInfo);
    let tabmail = browser.ownerDocument.getElementById("tabmail");
    let tabIndex = tabmail._getTabContextForTabbyThing(nativeTabInfo)[0];
    let oldWindowId = windowTracker.getId(browser.ownerGlobal);

    this.emit("tab-detached", { nativeTabInfo, tabId, oldWindowId, oldPosition: tabIndex });
  }

  /**
   * Emits a "tab-created" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo   The tab info which is being created.
   * @param {?NativeTab} currentTab         The tab info for the currently active tab.
   */
  emitCreated(nativeTabInfo, currentTab) {
    this.emit("tab-created", { nativeTabInfo, currentTab });
  }

  /**
   * Emits a "tab-removed" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo   The tab info in the window to which the tab is being
   *                                          removed
   * @param {Boolean} isWindowClosing       If true, the window with these tabs is closing
   */
  emitRemoved(nativeTabInfo, isWindowClosing) {
    let browser = getTabBrowser(nativeTabInfo);
    let windowId = windowTracker.getId(browser.ownerGlobal);
    let tabId = this.getId(nativeTabInfo);

    this.emit("tab-removed", { nativeTabInfo, tabId, windowId, isWindowClosing });
  }

  /**
   * Returns tab id and window id for the given browser element.
   *
   * @param {Element} browser                       The browser element to check
   * @return {{ tabId:Integer, windowId:Integer }}  The browsing data for the element
   */
  getBrowserData(browser) {
    return {
      tabId: this.getBrowserTabId(browser),
      windowId: windowTracker.getId(browser.ownerGlobal),
    };
  }

  /**
   * Returns the active tab info for the given window
   *
   * @property {?NativeTabInfo} activeTab       The active tab
   * @readonly
   */
  get activeTab() {
    let window = windowTracker.topWindow;
    let tabmail = window && window.document.getElementById("tabmail");
    return tabmail ? tabmail.selectedTab : null;
  }
}

tabTracker = new TabTracker();
windowTracker = new WindowTracker();
Object.assign(global, { tabTracker, windowTracker });

/**
 * Extension-specific wrapper around a Thunderbird tab.
 */
class Tab extends TabBase {
  constructor(extension, nativeTab, id) {
    if (nativeTab.localName == "tab") {
      let tabmail = nativeTab.ownerDocument.getElementById("tabmail");
      nativeTab = tabmail._getTabContextForTabbyThing(nativeTab)[1];
    }
    super(extension, nativeTab, id);
  }

  /** Returns true if this tab is a 3-pane tab. */
  get mailTab() {
    return this.nativeTab.mode.type == "folder";
  }

  /** Overrides the matches function to enable querying for 3-pane tabs. */
  matches(queryInfo, context) {
    let result = super.matches(queryInfo, context);
    return result && (!queryInfo.mailTab || this.mailTab);
  }

  /** Adds the mailTab property and removes some useless properties from a tab object. */
  convert(fallback) {
    let result = super.convert(fallback);
    result.mailTab = this.mailTab;

    // These properties are not useful to Thunderbird extensions and are not returned.
    for (let key of [
      "attention",
      "audible",
      "discarded",
      "hidden",
      "incognito",
      "isArticle",
      "isInReaderMode",
      "lastAccessed",
      "mutedInfo",
      "pinned",
      "sharingState",
      "successorTabId",
    ]) {
      delete result[key];
    }

    return result;
  }

  /** Returns the XUL browser for the tab. */
  get browser() {
    return getTabBrowser(this.nativeTab);
  }

  /** Returns the tabmail element for the tab. */
  get tabmail() {
    return this.browser.ownerDocument.getElementById("tabmail");
  }

  /** Returns the frame loader for the tab. */
  get frameLoader() {
    // If we don't have a frameLoader yet, just return a dummy with no width and
    // height.
    return super.frameLoader || { lazyWidth: 0, lazyHeight: 0 };
  }

  /** Returns the favIcon, without permission checks. */
  get _favIconUrl() {
    return this.browser.mIconURL;
  }

  /** Returns the last accessed time. */
  get lastAccessed() {
    return 0;
  }

  /** Returns the audible state. */
  get audible() {
    return false;
  }

  /** Returns the cookie store id. */
  get cookieStoreId() {
    return 0;
  }

  /** Returns the discarded state. */
  get discarded() {
    return false;
  }

  /** Returns the tab height. */
  get height() {
    return this.frameLoader.lazyHeight;
  }

  /** Returns hidden status. */
  get hidden() {
    return false;
  }

  /** Returns the tab index. */
  get index() {
    return this.tabmail.tabInfo.filter(info => getTabBrowser(info)).indexOf(this.nativeTab);
  }

  /** Returns information about the muted state of the tab. */
  get mutedInfo() {
    return { muted: false };
  }

  /** Returns information about the sharing state of the tab. */
  get sharingState() {
    return { camera: false, microphone: false, screen: false };
  }

  /** Returns the pinned state of the tab. */
  get pinned() {
    return false;
  }

  /** Returns the active state of the tab. */
  get active() {
    return this.nativeTab == this.tabmail.selectedTab;
  }

  /** Returns the highlighted state of the tab. */
  get highlighted() {
    return this.active;
  }

  /** Returns the selected state of the tab. */
  get selected() {
    return this.active;
  }

  /** Returns the loading status of the tab. */
  get status() {
    return this.browser.webProgress.isLoadingDocument ? "loading" : "complete";
  }

  /** Returns the title of the tab, without permission checks. */
  get _title() {
    let tabNode = this.tabmail._getTabContextForTabbyThing(this.nativeTab)[2];
    return tabNode.getAttribute("label");
  }

  /** Returns the width of the tab. */
  get width() {
    return this.frameLoader.lazyWidth;
  }

  /** Returns the native window object of the tab. */
  get window() {
    return this.browser.ownerGlobal;
  }

  /** Returns the window id of the tab. */
  get windowId() {
    return windowTracker.getId(this.window);
  }

  /** Returns the attention state of the tab. */
  get attention() {
    return false;
  }

  /** Returns the article state of the tab. */
  get isArticle() {
    return false;
  }

  /** Returns the reader mode state of the tab. */
  get isInReaderMode() {
    return false;
  }

  /** Returns the id of the successor tab of the tab. */
  get successorTabId() {
    return -1;
  }
}

/**
 * Extension-specific wrapper around a Thunderbird window.
 */
class Window extends WindowBase {
  /**
   * Update the geometry of the mail window.
   *
   * @param {Object} options
   *        An object containing new values for the window's geometry.
   * @param {integer} [options.left]
   *        The new pixel distance of the left side of the mail window from
   *        the left of the screen.
   * @param {integer} [options.top]
   *        The new pixel distance of the top side of the mail window from
   *        the top of the screen.
   * @param {integer} [options.width]
   *        The new pixel width of the window.
   * @param {integer} [options.height]
   *        The new pixel height of the window.
   */
  updateGeometry(options) {
    let { window } = this;

    if (options.left !== null || options.top !== null) {
      let left = options.left === null ? window.screenX : options.left;
      let top = options.top === null ? window.screenY : options.top;
      window.moveTo(left, top);
    }

    if (options.width !== null || options.height !== null) {
      let width = options.width === null ? window.outerWidth : options.width;
      let height = options.height === null ? window.outerHeight : options.height;
      window.resizeTo(width, height);
    }
  }

  /** Returns the tabmail element for the tab. */
  get tabmail() {
    return this.window.document.getElementById("tabmail");
  }

  /** Returns the title of the tab, without permission checks. */
  get _title() {
    return this.window.document.title;
  }

  /** Returns the title of the tab, checking tab permissions. */
  get title() {
    // Thunderbird can have an empty active tab while a window is loading
    if (this.activeTab && this.activeTab.hasTabPermission) {
      return this._title;
    }
    return null;
  }

  /**
   * Sets the title preface of the window.
   *
   * @param {String} titlePreface       The title preface to set
   */
  setTitlePreface(titlePreface) {
    this.window.document.documentElement.setAttribute("titlepreface", titlePreface);
  }

  /** Gets the foucsed state of the window. */
  get focused() {
    return this.window.document.hasFocus();
  }

  /** Gets the top position of the window. */
  get top() {
    return this.window.screenY;
  }

  /** Gets the left position of the window. */
  get left() {
    return this.window.screenX;
  }

  /** Gets the width of the window. */
  get width() {
    return this.window.outerWidth;
  }

  /** Gets the height of the window. */
  get height() {
    return this.window.outerHeight;
  }

  /** Gets the private browsing status of the window. */
  get incognito() {
    return false;
  }

  /** Checks if the window is considered always on top. */
  get alwaysOnTop() {
    return this.xulWindow.zLevel >= Ci.nsIXULWindow.raisedZ;
  }

  /** Checks if the window was the last one focused. */
  get isLastFocused() {
    return this.window === windowTracker.topWindow;
  }

  /**
   * Returns the window state for the given window.
   *
   * @param {DOMWindow} window      The window to check
   * @return {String}               "maximized", "minimized", "normal" or "fullscreen"
   */
  static getState(window) {
    const STATES = {
      [window.STATE_MAXIMIZED]: "maximized",
      [window.STATE_MINIMIZED]: "minimized",
      [window.STATE_NORMAL]: "normal",
    };
    let state = STATES[window.windowState];
    if (window.fullScreen) {
      state = "fullscreen";
    }
    return state;
  }

  /** Returns the window state for this specific window. */
  get state() {
    return Window.getState(this.window);
  }

  /**
   * Sets the window state for this speific window.
   *
   * @param {String} state          "maximized", "minimized", "normal" or "fullscreen"
   */
  set state(state) {
    let { window } = this;
    if (state !== "fullscreen" && window.fullScreen) {
      window.fullScreen = false;
    }

    switch (state) {
      case "maximized":
        window.maximize();
        break;

      case "minimized":
      case "docked":
        window.minimize();
        break;

      case "normal":
        // Restore sometimes returns the window to its previous state, rather
        // than to the "normal" state, so it may need to be called anywhere from
        // zero to two times.
        window.restore();
        if (window.windowState !== window.STATE_NORMAL) {
          window.restore();
        }
        if (window.windowState !== window.STATE_NORMAL) {
          // And on OS-X, where normal vs. maximized is basically a heuristic,
          // we need to cheat.
          window.sizeToContent();
        }
        break;

      case "fullscreen":
        window.fullScreen = true;
        break;

      default:
        throw new Error(`Unexpected window state: ${state}`);
    }
  }

  /**
   * Retrieves the (relevant) tabs in this window.
   *
   * @yields {Tab}      The wrapped Tab in this window
   */
  * getTabs() {
    let { tabManager } = this.extension;

    for (let nativeTabInfo of this.tabmail.tabInfo) {
      if (getTabBrowser(nativeTabInfo)) {
        // Only tabs that have a browser element
        yield tabManager.getWrapper(nativeTabInfo);
      }
    }
  }

  /** Retrieves the active tab in this window */
  get activeTab() {
    let { tabManager } = this.extension;
    let selectedTab = this.tabmail.selectedTab;
    if (selectedTab) {
      return tabManager.getWrapper(selectedTab);
    }
    return null;
  }

  /**
   * Retrieves the tab at the given index.
   *
   * @param {Number} index      The index to look at
   * @return {Tab}              The wrapped tab at the index
   */
  getTabAtIndex(index) {
    let { tabManager } = this.extension;
    let nativeTabInfo = this.tabmail.tabInfo.filter(info => getTabBrowser(info))[index];
    if (nativeTabInfo) {
      return tabManager.getWrapper(nativeTabInfo);
    }
    return null;
  }
}

Object.assign(global, { Tab, Window });

/**
 * Manages native tabs, their wrappers, and their dynamic permissions for a particular extension.
 */
class TabManager extends TabManagerBase {
  /**
   * Returns a Tab wrapper for the tab with the given ID.
   *
   * @param {integer} tabId     The ID of the tab for which to return a wrapper.
   * @param {*} default_        The value to return if no tab exists with the given ID.
   * @return {Tab|*}            The wrapped tab, or the default value
   */
  get(tabId, default_ = undefined) {
    let nativeTabInfo = tabTracker.getTab(tabId, default_);

    if (nativeTabInfo) {
      return this.getWrapper(nativeTabInfo);
    }
    return default_;
  }

  /**
   * If the extension has requested activeTab permission, grant it those permissions for the current
   * inner window in the given native tab.
   *
   * @param {NativeTabInfo} nativeTabInfo       The native tab for which to grant permissions.
   */
  addActiveTabPermission(nativeTabInfo = tabTracker.activeTab) {
    super.addActiveTabPermission(nativeTabInfo);
  }

  /**
   * Revoke the extension's activeTab permissions for the current inner window of the given native
   * tab.
   *
   * @param {NativeTabInfo} nativeTabInfo       The native tab for which to revoke permissions.
   */
  revokeActiveTabPermission(nativeTabInfo = tabTracker.activeTab) {
    super.revokeActiveTabPermission(nativeTabInfo);
  }

  /**
   * Determines access using extension context.
   *
   * @param {NativeTab} nativeTab
   *        The tab to check access on.
   * @returns {boolean}
   *        True if the extension has permissions for this tab.
   */
  canAccessTab(nativeTab) {
    return true;
  }

  /**
   * Returns a new Tab instance wrapping the given native tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo       The native tab for which to return a wrapper.
   * @return {Tab}                              The wrapped native tab
   */
  wrapTab(nativeTabInfo) {
    return new Tab(this.extension, nativeTabInfo, tabTracker.getId(nativeTabInfo));
  }
}

/**
 * Manages native browser windows and their wrappers for a particular extension.
 */
class WindowManager extends WindowManagerBase {
  /**
   * Returns a Window wrapper for the mail window with the given ID.
   *
   * @param {Integer} windowId      The ID of the browser window for which to return a wrapper.
   * @param {BaseContext} context   The extension context for which the matching is being performed.
   *                                  Used to determine the current window for relevant properties.
   * @return {Window}               The wrapped window
   */
  get(windowId, context) {
    let window = windowTracker.getWindow(windowId, context);
    return this.getWrapper(window);
  }

  /**
   * Yields an iterator of WindowBase wrappers for each currently existing browser window.
   *
   * @yields {Window}
   */
  * getAll() {
    for (let window of windowTracker.browserWindows()) {
      yield this.getWrapper(window);
    }
  }

  /**
   * Returns a new Window instance wrapping the given mail window.
   *
   * @param {DOMWindow} window      The mail window for which to return a wrapper.
   * @returns {Window}              The wrapped window
   */
  wrapWindow(window) {
    return new Window(this.extension, window, windowTracker.getId(window));
  }
}

/**
 * The following functions turn nsIMsgFolder references into more human-friendly forms.
 * A folder can be referenced with the account key, and the path to the folder in that account.
 */

/**
 * Convert a folder URI to a human-friendly path.
 * @return {String}
 */
function folderURIToPath(uri) {
  let path = Services.io.newURI(uri).filePath;
  return path.split("/").map(decodeURIComponent).join("/");
}

/**
 * Convert a human-friendly path to a folder URI. This function does not assume that the
 * folder referenced exists.
 * @return {String}
 */
function folderPathToURI(accountId, path) {
  let rootURI = MailServices.accounts.getAccount(accountId).incomingServer.rootFolder.URI;
  if (path == "/") {
    return rootURI;
  }
  return rootURI + path.split("/").map(encodeURIComponent).join("/");
}

const folderTypeMap = new Map([
  [Ci.nsMsgFolderFlags.Inbox, "inbox"],
  [Ci.nsMsgFolderFlags.Drafts, "drafts"],
  [Ci.nsMsgFolderFlags.SentMail, "sent"],
  [Ci.nsMsgFolderFlags.Trash, "trash"],
  [Ci.nsMsgFolderFlags.Templates, "templates"],
  [Ci.nsMsgFolderFlags.Archive, "archives"],
  [Ci.nsMsgFolderFlags.Junk, "junk"],
  [Ci.nsMsgFolderFlags.Queue, "outbox"],
]);

/**
 * Converts an nsIMsgFolder to a simple object for use in messages.
 * @return {Object}
 */
function convertFolder(folder, accountId) {
  if (!folder) {
    return null;
  }
  if (!accountId) {
    let server = folder.server;
    let account = MailServices.accounts.FindAccountForServer(server);
    accountId = account.key;
  }

  let folderObject = {
    accountId,
    name: folder.prettyName,
    path: folderURIToPath(folder.URI),
  };

  for (let [flag, typeName] of folderTypeMap.entries()) {
    if (folder.flags & flag) {
      folderObject.type = typeName;
    }
  }

  return folderObject;
}

class FolderManager {
  constructor(extension) {
    this.extension = extension;
  }

  convert(folder, accountId) {
    return convertFolder(folder, accountId);
  }

  get(accountId, path) {
    return MailServices.folderLookup.getFolderForURL(folderPathToURI(accountId, path));
  }
}

/**
 * Converts an nsIMsgHdr to a simle object for use in messages.
 * This function WILL change as the API develops.
 * @return {Object}
 */
function convertMessage(msgHdr, extension) {
  if (!msgHdr) {
    return null;
  }

  let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                        .createInstance(Ci.nsIMsgCompFields);

  let messageObject = {
    id: messageTracker.getId(msgHdr),
    date: new Date(msgHdr.dateInSeconds * 1000),
    author: msgHdr.mime2DecodedAuthor,
    recipients: composeFields.splitRecipients(msgHdr.mime2DecodedRecipients, false, {}),
    ccList: composeFields.splitRecipients(msgHdr.ccList, false, {}),
    bccList: composeFields.splitRecipients(msgHdr.bccList, false, {}),
    subject: msgHdr.mime2DecodedSubject,
    read: msgHdr.isRead,
    flagged: msgHdr.isFlagged,
  };
  if (extension.hasPermission("accountsRead")) {
    messageObject.folder = convertFolder(msgHdr.folder, msgHdr.accountKey);
  }
  let tags = msgHdr.getProperty("keywords");
  messageObject.tags = tags ? tags.split(" ") : [];
  return messageObject;
}

/**
 * A map of numeric identifiers to messages for easy reference.
 */
var messageTracker = {
  _nextId: 1,
  _messages: new Map(),

  /**
   * Finds a message in the map or adds it to the map.
   * @return {int} The identifier of the message
   */
  getId(msgHdr) {
    for (let [key, value] of this._messages.entries()) {
      if (value.folderURI == msgHdr.folder.URI && value.messageId == msgHdr.messageId) {
        return key;
      }
    }
    let id = this._nextId++;
    this.setId(msgHdr, id);
    return id;
  },

  /**
   * Retrieves a message from the map. If the message no longer exists,
   * it is removed from the map.
   * @return {nsIMsgHdr} The identifier of the message
   */
  getMessage(id) {
    let value = this._messages.get(id);
    if (!value) {
      return null;
    }

    let folder = MailServices.folderLookup.getFolderForURL(value.folderURI);
    if (folder) {
      let msgHdr = folder.msgDatabase.getMsgHdrForMessageID(value.messageId);
      if (msgHdr) {
        return msgHdr;
      }
    }

    this._messages.delete(id);
    return null;
  },

  /**
   * Adds a message to the map.
   */
  setId(msgHdr, id) {
    this._messages.set(id, { folderURI: msgHdr.folder.URI, messageId: msgHdr.messageId });
  },
};

/**
 * Tracks lists of messages so that an extension can consume them in chunks.
 * Any WebExtensions method that could return multiple messages should instead call
 * messageListTracker.startList and return the results, which contain the first
 * chunk. Further chunks can be fetched by the extension calling
 * browser.messages.continueList. Chunk size is controlled by a pref.
 */
var messageListTracker = {
  _contextLists: new WeakMap(),

  /**
   * Takes an array or enumerator of messages and returns the first chunk.
   * @returns {Object}
   */
  startList(messageList, extension) {
    if (Array.isArray(messageList)) {
      messageList = this._createEnumerator(messageList);
    }
    let firstPage = this._getNextPage(messageList);
    let messageListId = null;
    if (messageList.hasMoreElements()) {
      messageListId = uuidGenerator.generateUUID().number.substring(1, 37);
      let lists = this._contextLists.get(extension);
      if (!lists) {
        lists = new Map();
        this._contextLists.set(extension, lists);
      }
      lists.set(messageListId, messageList);
    }

    return {
      id: messageListId,
      messages: firstPage.map(message => convertMessage(message, extension)),
    };
  },

  /**
   * Returns any subsequent chunk of messages.
   * @returns {Object}
   */
  continueList(messageListId, extension) {
    let lists = this._contextLists.get(extension);
    let messageList = lists ? lists.get(messageListId, null) : null;
    if (!messageList) {
      throw new ExtensionError(
        `No message list for id ${messageListId}. Have you reached the end of a list?`
      );
    }

    let nextPage = this._getNextPage(messageList);
    if (!messageList.hasMoreElements()) {
      lists.delete(messageListId);
      messageListId = null;
    }
    return {
      id: messageListId,
      messages: nextPage.map(message => convertMessage(message, extension)),
    };
  },

  _createEnumerator(array) {
    let current = 0;
    return {
      hasMoreElements() {
        return current < array.length;
      },
      getNext() {
        return array[current++];
      },
    };
  },

  _getNextPage(messageList) {
    let messageCount = Services.prefs.getIntPref("extensions.webextensions.messagesPerPage", 100);
    let page = [];
    for (let i = 0; i < messageCount && messageList.hasMoreElements(); i++) {
      page.push(messageList.getNext().QueryInterface(Ci.nsIMsgDBHdr));
    }
    return page;
  },
};

class MessageManager {
  constructor(extension) {
    this.extension = extension;
  }

  convert(msgHdr) {
    return convertMessage(msgHdr, this.extension);
  }

  get(id) {
    return messageTracker.getMessage(id);
  }

  startMessageList(messageList) {
    return messageListTracker.startList(messageList, this.extension);
  }
}

extensions.on("startup", (type, extension) => { // eslint-disable-line mozilla/balanced-listeners
  if (extension.hasPermission("accountsRead")) {
    defineLazyGetter(extension, "folderManager", () => new FolderManager(extension));
  }
  if (extension.hasPermission("messagesRead")) {
    defineLazyGetter(extension, "messageManager", () => new MessageManager(extension));
  }
  defineLazyGetter(extension, "tabManager", () => new TabManager(extension));
  defineLazyGetter(extension, "windowManager", () => new WindowManager(extension));
});
