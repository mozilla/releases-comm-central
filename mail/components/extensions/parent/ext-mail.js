/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyServiceGetter(
  this,
  "uuidGenerator",
  "@mozilla.org/uuid-generator;1",
  "nsIUUIDGenerator"
);

var { ExtensionError, getInnerWindowID } = ExtensionUtils;

var { defineLazyGetter } = ExtensionCommon;

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  ExtensionPageChild: "resource://gre/modules/ExtensionPageChild.jsm",
  ExtensionProcessScript: "resource://gre/modules/ExtensionProcessScript.jsm",
  ExtensionContent: "resource://gre/modules/ExtensionContent.jsm",
  Schemas: "resource://gre/modules/Schemas.jsm",
});

const COMPOSE_WINDOW_URI =
  "chrome://messenger/content/messengercompose/messengercompose.xhtml";

// Inject the |messenger| object as an alias to |browser| in all known contexts. This is a bit
// fragile since it uses monkeypatching. If a test fails, the best way to debug is to search for
// Schemas.exportLazyGetter where it does the injections, add |messenger| alias to those files until
// the test passes again, and then find out why the monkeypatching is not catching it.
(function() {
  let getContext = ExtensionContent.getContext;
  let initExtensionContext = ExtensionContent.initExtensionContext;
  let handleExtensionExecute = ExtensionContent.handleExtensionExecute;
  let initPageChildExtensionContext = ExtensionPageChild.initExtensionContext;

  // This patches constructor of ContentScriptContextChild adding the object to the sandbox
  ExtensionContent.getContext = function(extension, window) {
    let context = getContext.apply(ExtensionContent, arguments);
    if (!("messenger" in context.sandbox)) {
      Schemas.exportLazyGetter(
        context.sandbox,
        "messenger",
        () => context.chromeObj
      );
    }
    return context;
  };

  // This patches extension content within unprivileged pages, so an iframe on a web page that
  // points to a moz-extension:// page exposed via web_accessible_content
  ExtensionContent.initExtensionContext = function(extension, window) {
    let context = extension.getContext(window);
    Schemas.exportLazyGetter(window, "messenger", () => context.chromeObj);

    return initExtensionContext.apply(ExtensionContent, arguments);
  };

  ExtensionContent.handleExtensionExecute = function(
    global,
    target,
    options,
    script
  ) {
    if (
      script.extension.hasPermission("compose") &&
      target.chromeOuterWindowID
    ) {
      let outerWindow = Services.wm.getOuterWindowWithId(
        target.chromeOuterWindowID
      );
      if (outerWindow && outerWindow.location.href == COMPOSE_WINDOW_URI) {
        script.matchesWindow = () => true;
      }
    }
    return handleExtensionExecute.apply(ExtensionContent, [
      global,
      target,
      options,
      script,
    ]);
  };

  // This patches privileged pages such as the background script
  ExtensionPageChild.initExtensionContext = function(extension, window) {
    let retval = initPageChildExtensionContext.apply(
      ExtensionPageChild,
      arguments
    );

    let windowId = getInnerWindowID(window);
    let context = ExtensionPageChild.extensionContexts.get(windowId);

    Schemas.exportLazyGetter(window, "messenger", () => {
      let messengerObj = Cu.createObjectIn(window);
      context.childManager.inject(messengerObj);
      return messengerObj;
    });

    return retval;
  };
})();

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
  } else if (
    ExtensionCommon.instanceOf(target, "XULFrameElement") ||
    ExtensionCommon.instanceOf(target, "HTMLIFrameElement")
  ) {
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

global.clickModifiersFromEvent = event => {
  const map = {
    shiftKey: "Shift",
    altKey: "Alt",
    metaKey: "Command",
    ctrlKey: "Ctrl",
  };
  let modifiers = Object.keys(map)
    .filter(key => event[key])
    .map(key => map[key]);

  if (event.ctrlKey && AppConstants.platform === "macosx") {
    modifiers.push("MacCtrl");
  }

  return modifiers;
};

global.openOptionsPage = extension => {
  let window = windowTracker.topWindow;
  if (!window) {
    return Promise.reject({ message: "No browser window available" });
  }

  if (extension.manifest.options_ui.open_in_tab) {
    window.switchToTabHavingURI(extension.manifest.options_ui.page, true, {
      triggeringPrincipal: extension.principal,
    });
    return Promise.resolve();
  }

  let viewId = `addons://detail/${encodeURIComponent(
    extension.id
  )}/preferences`;

  return window.openAddonsMgr(viewId);
};

global.makeWidgetId = id => {
  id = id.toLowerCase();
  // FIXME: This allows for collisions.
  return id.replace(/[^a-z0-9_-]/g, "_");
};

/**
 * Gets the window for a tabmail tabInfo.
 *
 * @param {NativeTabInfo} nativeTabInfo - The tabInfo object to get the browser for
 * @return {Window} - The browser element for the tab
 */
function getTabWindow(nativeTabInfo) {
  return Cu.getGlobalForObject(nativeTabInfo);
}
global.getTabWindow = getTabWindow;

/**
 * Gets the tabmail for a tabmail tabInfo.
 *
 * @param {NativeTabInfo} nativeTabInfo - The tabInfo object to get the browser for
 * @return {?XULElement} - The browser element for the tab
 */
function getTabTabmail(nativeTabInfo) {
  return getTabWindow(nativeTabInfo).document.getElementById("tabmail");
}
global.getTabTabmail = getTabTabmail;

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

  if (nativeTabInfo.mode) {
    if (nativeTabInfo.mode.getBrowser) {
      return nativeTabInfo.mode.getBrowser(nativeTabInfo);
    }

    if (nativeTabInfo.mode.tabType.getBrowser) {
      return nativeTabInfo.mode.tabType.getBrowser(nativeTabInfo);
    }
  }

  if (nativeTabInfo.ownerGlobal && nativeTabInfo.ownerGlobal.getBrowser) {
    return nativeTabInfo.ownerGlobal.getBrowser();
  }

  return null;
}
global.getTabBrowser = getTabBrowser;

/**
 * Manages tab-specific and window-specific context data, and dispatches
 * tab select events across all windows.
 */
global.TabContext = class extends EventEmitter {
  /**
   * @param {Function} getDefaultPrototype
   *        Provides the prototype of the context value for a tab or window when there is none.
   *        Called with a XULElement or ChromeWindow argument.
   *        Should return an object or null.
   */
  constructor(getDefaultPrototype) {
    super();
    this.getDefaultPrototype = getDefaultPrototype;
    this.tabData = new WeakMap();
  }

  /**
   * Returns the context data associated with `keyObject`.
   *
   * @param {XULElement|ChromeWindow} keyObject
   *        Browser tab or browser chrome window.
   * @returns {Object}
   */
  get(keyObject) {
    if (!this.tabData.has(keyObject)) {
      let data = Object.create(this.getDefaultPrototype(keyObject));
      this.tabData.set(keyObject, data);
    }

    return this.tabData.get(keyObject);
  }

  /**
   * Clears the context data associated with `keyObject`.
   *
   * @param {XULElement|ChromeWindow} keyObject
   *        Browser tab or browser chrome window.
   */
  clear(keyObject) {
    this.tabData.delete(keyObject);
  }
};

/* global searchInitialized */
// This promise is used to wait for the search service to be initialized.
// None of the code in the WebExtension modules requests that initialization.
// It is assumed that it is started at some point. That might never happen,
// e.g. if the application shuts down before the search service initializes.
XPCOMUtils.defineLazyGetter(global, "searchInitialized", () => {
  if (Services.search.isInitialized) {
    return Promise.resolve();
  }
  return ExtensionUtils.promiseObserved(
    "browser-search-service",
    (_, data) => data == "init-complete"
  );
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
    if (tabmail) {
      tabmail.addTabsProgressListener(listener);
    }
  }

  /**
   * Removes a tab progress listener from the given mail window.
   *
   * @param {DOMWindow} window      The mail window from which to remove the listener.
   * @param {Object} listener       The listener to remove
   */
  removeProgressListener(window, listener) {
    let tabmail = window.document.getElementById("tabmail");
    if (tabmail) {
      tabmail.removeTabsProgressListener(listener);
    }
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

    return [
      "mail:3pane",
      "mail:addressbook",
      "msgcompose",
      "mail:messageWindow",
      "mail:extensionPopup",
    ].includes(documentElement.getAttribute("windowtype"));
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
      // This is oldest to newest, so this gets a bit ugly.
      for (let nextWin of Services.wm.getEnumerator("mail:3pane", true)) {
        if (!nextWin.document.documentElement.getAttribute("chromehidden")) {
          win = nextWin;
        }
      }
    }

    return win;
  }
}

/**
 * Tracks the opening and closing of tabs and maps them between their numeric WebExtension ID and
 * the native tab info objects.
 */
class TabTracker extends TabTrackerBase {
  constructor() {
    super();

    this._tabs = new WeakMap();
    this._browsers = new Map();
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
    let id = this._browsers.get(`${browser.id}#${browser._activeTabId}`);
    if (id) {
      return id;
    }

    let tabmail = browser.ownerDocument.getElementById("tabmail");
    let tab =
      tabmail &&
      tabmail.tabInfo.find(info => info.tabId == browser._activeTabId);

    if (tab) {
      id = this.getId(tab);
      this._browsers.set(`${browser.id}#${tab.tabId}`, id);
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
      this._browsers.set(`${browser.id}#${nativeTabInfo.tabId}`, id);
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
      this._browsers.delete(
        `${nativeTabInfo.browser.id}#${nativeTabInfo.tabId}`
      );
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
    if (
      [
        "mail:addressbook",
        "msgcompose",
        "mail:messageWindow",
        "mail:extensionPopup",
      ].includes(window.document.documentElement.getAttribute("windowtype"))
    ) {
      this.emit("tab-created", {
        nativeTabInfo: window,
        currentTab: window,
      });
      return;
    }

    let tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

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
    if (
      [
        "mail:addressbook",
        "msgcompose",
        "mail:messageWindow",
        "mail:extensionPopup",
      ].includes(window.document.documentElement.getAttribute("windowtype"))
    ) {
      this.emit("tab-removed", {
        window,
        tabId: this.getId(window),
        windowId: windowTracker.getId(getTabWindow(window)),
        isWindowClosing: true,
      });
      return;
    }

    let tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

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
    this.emit("tab-activated", {
      tabId: this.getId(nativeTabInfo),
      windowId: windowTracker.getId(getTabWindow(nativeTabInfo)),
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

    this.emit("tab-attached", {
      nativeTabInfo,
      tabId,
      newWindowId,
      newPosition: tabIndex,
    });
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

    this.emit("tab-detached", {
      nativeTabInfo,
      tabId,
      oldWindowId,
      oldPosition: tabIndex,
    });
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
    this.emit("tab-removed", {
      nativeTabInfo,
      tabId: this.getId(nativeTabInfo),
      windowId: windowTracker.getId(getTabWindow(nativeTabInfo)),
      isWindowClosing,
    });
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
  /** Returns true if this tab is a 3-pane tab. */
  get isMailTab() {
    return false;
  }

  /** Returns true if this tab is a compose window "tab". */
  get isComposeTab() {
    return (
      this.nativeTab.location &&
      this.nativeTab.location.href == COMPOSE_WINDOW_URI
    );
  }

  /** Overrides the matches function to enable querying for 3-pane tabs. */
  matches(queryInfo, context) {
    let result = super.matches(queryInfo, context);
    return result && (!queryInfo.mailTab || this.isMailTab);
  }

  /** Adds the mailTab property and removes some useless properties from a tab object. */
  convert(fallback) {
    let result = super.convert(fallback);
    result.mailTab = this.isMailTab;

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

  /** Always returns false. This feature doesn't exist in Thunderbird. */
  get _incognito() {
    return false;
  }

  /** Returns the XUL browser for the tab. */
  get browser() {
    if (this.isComposeTab) {
      return this.nativeTab.GetCurrentEditorElement();
    }
    if (this.nativeTab.getBrowser) {
      return this.nativeTab.getBrowser();
    }
    return null;
  }

  get innerWindowID() {
    if (this.isComposeTab) {
      return this.browser.contentWindow.windowUtils.currentInnerWindowID;
    }
    return super.innerWindowID;
  }

  /** Returns the frame loader for the tab. */
  get frameLoader() {
    // If we don't have a frameLoader yet, just return a dummy with no width and
    // height.
    return super.frameLoader || { lazyWidth: 0, lazyHeight: 0 };
  }

  /** Returns the current URL of this tab, without permission checks. */
  get _url() {
    if (this.isComposeTab) {
      return undefined;
    }
    return this.browser ? this.browser.currentURI.spec : null;
  }

  /** Returns the current title of this tab, without permission checks. */
  get _title() {
    if (this.browser && this.browser.contentTitle) {
      return this.browser.contentTitle;
    }
    return this.nativeTab.label;
  }

  /** Returns the favIcon, without permission checks. */
  get _favIconUrl() {
    return null;
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
    return 0;
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
    return true;
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
    return "complete";
  }

  /** Returns the width of the tab. */
  get width() {
    return this.frameLoader.lazyWidth;
  }

  /** Returns the native window object of the tab. */
  get window() {
    return this.nativeTab;
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

class TabmailTab extends Tab {
  constructor(extension, nativeTab, id) {
    if (nativeTab.localName == "tab") {
      let tabmail = nativeTab.ownerDocument.getElementById("tabmail");
      nativeTab = tabmail._getTabContextForTabbyThing(nativeTab)[1];
    }
    super(extension, nativeTab, id);
  }

  /** Returns the XUL browser for the tab. */
  get browser() {
    return getTabBrowser(this.nativeTab);
  }

  /** Returns the favIcon, without permission checks. */
  get _favIconUrl() {
    return this.browser?.mIconURL;
  }

  /** Returns the tabmail element for the tab. */
  get tabmail() {
    return getTabTabmail(this.nativeTab);
  }

  /** Returns true if this tab is a 3-pane tab. */
  get isMailTab() {
    return ["folder", "glodaList"].includes(this.nativeTab.mode.name);
  }

  /** Returns the tab index. */
  get index() {
    return this.tabmail.tabInfo.indexOf(this.nativeTab);
  }

  /** Returns the active state of the tab. */
  get active() {
    return this.nativeTab == this.tabmail.selectedTab;
  }

  /** Returns the loading status of the tab. */
  get status() {
    if (this.browser && this.browser.webProgress) {
      return this.browser.webProgress.isLoadingDocument
        ? "loading"
        : "complete";
    }
    return "complete";
  }

  /** Returns the title of the tab, without permission checks. */
  get _title() {
    let [, , tabNode] = this.tabmail._getTabContextForTabbyThing(
      this.nativeTab
    );
    return tabNode.getAttribute("label");
  }

  /** Returns the native window object of the tab. */
  get window() {
    return this.tabmail.ownerGlobal;
  }
}

/**
 * Extension-specific wrapper around a Thunderbird window.
 */
class Window extends WindowBase {
  /**
   * @property {string} type
   *        The type of the window, as defined by the WebExtension API. May be
   *        either "normal" or "popup".
   *        @readonly
   */
  get type() {
    switch (this.window.document.documentElement.getAttribute("windowtype")) {
      case "mail:addressbook":
        return "addressBook";
      case "msgcompose":
        return "messageCompose";
      case "mail:messageWindow":
        return "messageDisplay";
      default:
        return super.type;
    }
  }

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
      let height =
        options.height === null ? window.outerHeight : options.height;
      window.resizeTo(width, height);
    }
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
    this.window.document.documentElement.setAttribute(
      "titlepreface",
      titlePreface
    );
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
    return this.appWindow.zLevel >= Ci.nsIAppWindow.raisedZ;
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
  *getTabs() {
    let { tabManager } = this.extension;
    yield tabManager.getWrapper(this.window);
  }

  /** Retrieves the active tab in this window */
  get activeTab() {
    let { tabManager } = this.extension;
    return tabManager.getWrapper(this.window);
  }

  /**
   * Retrieves the tab at the given index.
   *
   * @param {Number} index      The index to look at
   * @return {Tab}              The wrapped tab at the index
   */
  getTabAtIndex(index) {
    let { tabManager } = this.extension;
    if (index == 0) {
      return tabManager.getWrapper(this.window);
    }
    return null;
  }
}

class TabmailWindow extends Window {
  /** Returns the tabmail element for the tab. */
  get tabmail() {
    return this.window.document.getElementById("tabmail");
  }

  /**
   * Retrieves the (relevant) tabs in this window.
   *
   * @yields {Tab}      The wrapped Tab in this window
   */
  *getTabs() {
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
    let nativeTabInfo = this.tabmail.tabInfo.filter(info =>
      getTabBrowser(info)
    )[index];
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
    let tabClass = TabmailTab;
    if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
      tabClass = Tab;
    }
    return new tabClass(
      this.extension,
      nativeTabInfo,
      tabTracker.getId(nativeTabInfo)
    );
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
  *getAll() {
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
    let windowClass = Window;
    if (
      window.document.documentElement.getAttribute("windowtype") == "mail:3pane"
    ) {
      windowClass = TabmailWindow;
    }
    return new windowClass(this.extension, window, windowTracker.getId(window));
  }
}

/**
 * Converts an nsIMsgIdentity to a simple object for use in messages.
 * @param {nsIMsgAccount} account
 * @param {nsIMsgIdentity} identity
 * @return {Object}
 */
function convertMailIdentity(account, identity) {
  identity = identity.QueryInterface(Ci.nsIMsgIdentity);
  return {
    accountId: account.key,
    id: identity.key,
    label: identity.label,
    name: identity.fullName,
    email: identity.email,
    replyTo: identity.replyTo,
    organization: identity.organization,
  };
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
  return path
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

/**
 * Convert a human-friendly path to a folder URI. This function does not assume that the
 * folder referenced exists.
 * @return {String}
 */
function folderPathToURI(accountId, path) {
  let server = MailServices.accounts.getAccount(accountId).incomingServer;
  let rootURI = server.rootFolder.URI;
  if (path == "/") {
    return rootURI;
  }
  // The .URI property of an IMAP folder doesn't have %-encoded characters.
  // If encoded here, the folder lookup service won't find the folder.
  if (server.type == "imap") {
    return rootURI + path;
  }
  return (
    rootURI +
    path
      .split("/")
      .map(p =>
        encodeURIComponent(p).replace(
          /[!'()*]/g,
          c => "%" + c.charCodeAt(0).toString(16)
        )
      )
      .join("/")
  );
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
    return MailServices.folderLookup.getFolderForURL(
      folderPathToURI(accountId, path)
    );
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

  let composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let junkScore = parseInt(msgHdr.getProperty("junkscore"), 10) || 0;
  let junkThreshold = Services.prefs.getIntPref(
    "mail.adaptivefilters.junk_threshold"
  );

  let messageObject = {
    id: messageTracker.getId(msgHdr),
    date: new Date(msgHdr.dateInSeconds * 1000),
    author: msgHdr.mime2DecodedAuthor,
    recipients: composeFields.splitRecipients(
      msgHdr.mime2DecodedRecipients,
      false
    ),
    ccList: composeFields.splitRecipients(msgHdr.ccList, false),
    bccList: composeFields.splitRecipients(msgHdr.bccList, false),
    subject: msgHdr.mime2DecodedSubject,
    read: msgHdr.isRead,
    flagged: msgHdr.isFlagged,
    junk: junkScore >= junkThreshold,
    junkScore,
  };
  if (extension.hasPermission("accountsRead")) {
    messageObject.folder = convertFolder(msgHdr.folder, msgHdr.accountKey);
  }
  let tags = msgHdr.getProperty("keywords");
  tags = tags ? tags.split(" ") : [];
  messageObject.tags = tags.filter(MailServices.tags.isValidKey);
  return messageObject;
}

/**
 * A map of numeric identifiers to messages for easy reference.
 */
var messageTracker = {
  _nextId: 1,
  _messages: new Map(),
  _messageIds: new Map(),

  /**
   * Finds a message in the map or adds it to the map.
   * @return {int} The identifier of the message
   */
  getId(msgHdr) {
    // Using stringify avoids potential issues with unexpected characters.
    // This hash could be anything as long as it is unique for each
    // [folder, message] combination.
    let hash = JSON.stringify([msgHdr.folder.URI, msgHdr.messageId]);
    if (this._messageIds.has(hash)) {
      return this._messageIds.get(hash);
    }
    let id = this._nextId++;
    this._messages.set(id, {
      folderURI: msgHdr.folder.URI,
      messageId: msgHdr.messageId,
    });
    this._messageIds.set(hash, id);
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

    let hash = JSON.stringify([value.folderURI, value.messageId]);
    this._messages.delete(id);
    this._messageIds.delete(hash);
    return null;
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
    let messageCount = Services.prefs.getIntPref(
      "extensions.webextensions.messagesPerPage",
      100
    );
    let page = [];
    let i = 0;
    while (i < messageCount && messageList.hasMoreElements()) {
      let next = messageList.getNext();
      if (next) {
        page.push(next.QueryInterface(Ci.nsIMsgDBHdr));
        i++;
      }
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

extensions.on("startup", (type, extension) => {
  // eslint-disable-line mozilla/balanced-listeners
  if (extension.hasPermission("accountsRead")) {
    defineLazyGetter(
      extension,
      "folderManager",
      () => new FolderManager(extension)
    );
  }
  if (extension.hasPermission("addressBooks")) {
    defineLazyGetter(extension, "addressBookManager", () => {
      if (!("addressBookCache" in this)) {
        extensions.loadModule("addressBook");
      }
      return {
        findAddressBookById: this.addressBookCache.findAddressBookById.bind(
          this.addressBookCache
        ),
        findContactById: this.addressBookCache.findContactById.bind(
          this.addressBookCache
        ),
        findMailingListById: this.addressBookCache.findMailingListById.bind(
          this.addressBookCache
        ),
        convert: this.addressBookCache.convert.bind(this.addressBookCache),
      };
    });
  }
  if (extension.hasPermission("messagesRead")) {
    defineLazyGetter(
      extension,
      "messageManager",
      () => new MessageManager(extension)
    );
  }
  defineLazyGetter(extension, "tabManager", () => new TabManager(extension));
  defineLazyGetter(
    extension,
    "windowManager",
    () => new WindowManager(extension)
  );
});
