/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  ExtensionContent: "resource://gre/modules/ExtensionContent.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "gJunkThreshold",
  "mail.adaptivefilters.junk_threshold",
  90
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "gMessagesPerPage",
  "extensions.webextensions.messagesPerPage",
  100
);

const ADDRESS_BOOK_WINDOW_URI =
  "chrome://messenger/content/addressbook/addressbook.xhtml";
const COMPOSE_WINDOW_URI =
  "chrome://messenger/content/messengercompose/messengercompose.xhtml";
const MESSAGE_WINDOW_URI = "chrome://messenger/content/messageWindow.xhtml";
const MESSAGE_PROTOCOLS = ["imap", "mailbox", "news", "nntp", "snews"];

const NOTIFICATION_COLLAPSE_TIME = 200;

(function() {
  // Monkey-patch all processes to add the "messenger" alias in all contexts.
  Services.ppmm.loadProcessScript(
    "chrome://messenger/content/processScript.js",
    true
  );

  // This allows scripts to run in the compose document or message display
  // document if and only if the extension has permission.
  let { defaultConstructor } = ExtensionContent.contentScripts;
  ExtensionContent.contentScripts.defaultConstructor = function(matcher) {
    let script = defaultConstructor.call(this, matcher);

    let { matchesWindowGlobal } = script;
    script.matchesWindowGlobal = function(windowGlobal) {
      let { browsingContext, windowContext } = windowGlobal;

      if (
        browsingContext.topChromeWindow?.location.href == COMPOSE_WINDOW_URI &&
        windowContext.documentPrincipal.isNullPrincipal &&
        windowContext.documentURI?.spec == "about:blank?compose"
      ) {
        return script.extension.hasPermission("compose");
      }

      if (MESSAGE_PROTOCOLS.includes(windowContext.documentURI?.scheme)) {
        return script.extension.hasPermission("messagesModify");
      }

      return matchesWindowGlobal.apply(script, arguments);
    };

    return script;
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

/*
 * Get raw message for a given msgHdr. This is not using aConvertData
 * and therefore also works for nntp/news.
 *
 * @param aMsgHdr The message header to retrieve the raw message for.
 * @return {string} - A Promise for the raw message.
 */
function MsgHdrToRawMessage(msgHdr) {
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let msgUri = msgHdr.folder.generateMessageURI(msgHdr.messageKey);
  let service = messenger.messageServiceFromURI(msgUri);
  return new Promise((resolve, reject) => {
    let streamlistener = {
      _data: [],
      _stream: null,
      onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
        if (!this._stream) {
          this._stream = Cc[
            "@mozilla.org/scriptableinputstream;1"
          ].createInstance(Ci.nsIScriptableInputStream);
          this._stream.init(aInputStream);
        }
        this._data.push(this._stream.read(aCount));
      },
      onStartRequest() {},
      onStopRequest(aRequest, aStatus) {
        if (aStatus == Cr.NS_OK) {
          resolve(this._data.join(""));
        } else {
          Cu.reportError(aStatus);
          reject();
        }
      },
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
    };

    service.streamMessage(
      msgUri,
      streamlistener,
      null, // aMsgWindow
      null, // aUrlListener
      false, // aConvertData
      "" //aAdditionalHeader
    );
  });
}

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
    let id = this._browsers.get(`${browser.browserId}#${browser._activeTabId}`);
    if (id) {
      return id;
    }

    let tabmail = browser.ownerDocument.getElementById("tabmail");
    let tab =
      tabmail &&
      tabmail.tabInfo.find(info => info.tabId == browser._activeTabId);

    if (tab) {
      id = this.getId(tab);
      this._browsers.set(`${browser.browserId}#${tab.tabId}`, id);
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
      this._browsers.set(`${browser.browserId}#${nativeTabInfo.tabId}`, id);
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
      if (nativeTabInfo.browser) {
        this._browsers.delete(
          `${nativeTabInfo.browser.browserId}#${nativeTabInfo.tabId}`
        );
      }
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
        nativeTabInfo: window,
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
 * Extension-specific wrapper around a Thunderbird tab. Note that for actual
 * tabs in the main window, some of these methods are overridden by the
 * TabmailTab subclass.
 */
class Tab extends TabBase {
  /** What sort of tab is this? */
  get type() {
    switch (this.nativeTab.location?.href) {
      case ADDRESS_BOOK_WINDOW_URI:
        return "addressBook";
      case COMPOSE_WINDOW_URI:
        return "messageCompose";
      case MESSAGE_WINDOW_URI:
        return "messageDisplay";
      default:
        return null;
    }
  }

  /** Overrides the matches function to enable querying for tab types. */
  matches(queryInfo, context) {
    let result = super.matches(queryInfo, context);
    let type = queryInfo.mailTab ? "mail" : queryInfo.type;
    return result && (!type || this.type == type);
  }

  /** Adds the mailTab property and removes some useless properties from a tab object. */
  convert(fallback) {
    let result = super.convert(fallback);
    result.type = this.type;
    result.mailTab = result.type == "mail";

    // These properties are not useful to Thunderbird extensions and are not returned.
    for (let key of [
      "attention",
      "audible",
      "cookieStoreId",
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
    if (this.type == "messageCompose") {
      return this.nativeTab.GetCurrentEditorElement();
    }
    if (this.nativeTab.getBrowser) {
      return this.nativeTab.getBrowser();
    }
    return null;
  }

  get innerWindowID() {
    if (this.type == "messageCompose") {
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

  /** Returns false if the current tab does not have a url associated. */
  get matchesHostPermission() {
    if (!this._url) {
      return false;
    }
    return super.matchesHostPermission;
  }

  /** Returns the current URL of this tab, without permission checks. */
  get _url() {
    if (this.type == "messageCompose") {
      return undefined;
    }
    return this.browser?.currentURI?.spec;
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
    return this.browser?.webProgress?.isLoadingDocument
      ? "loading"
      : "complete";
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

  /** What sort of tab is this? */
  get type() {
    switch (this.nativeTab.mode.name) {
      case "folder":
      case "glodaList":
        return "mail";
      case "message":
        return "messageDisplay";
      case "contentTab": {
        let currentURI = this.nativeTab.browser.currentURI;
        if (currentURI?.schemeIs("about")) {
          switch (currentURI.filePath) {
            case "addressbook":
              return "addressBook";
            case "blank":
              return "content";
            default:
              return "special";
          }
        }
        if (currentURI?.schemeIs("chrome")) {
          return "special";
        }
        return "content";
      }
      case "calendar":
      case "calendarEvent":
      case "calendarTask":
      case "tasks":
      case "chat":
        return this.nativeTab.mode.name;
      case "accountProvisionerTab":
      case "glodaFacet":
      case "preferencesTab":
        return "special";
      default:
        // We should not get here, unless a new type is registered with tabmail.
        return null;
    }
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

  /** Returns the tab index. */
  get index() {
    return this.tabmail.tabInfo.indexOf(this.nativeTab);
  }

  /** Returns the active state of the tab. */
  get active() {
    return this.nativeTab == this.tabmail.selectedTab;
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
      // Only tabs that have a browser element.
      yield tabManager.getWrapper(nativeTabInfo);
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
 * Converts an nsIMsgAccount to a simple object
 * @param {nsIMsgAccount} account
 * @return {Object}
 */
function convertAccount(account, includeFolders = true) {
  if (!account) {
    return null;
  }

  account = account.QueryInterface(Ci.nsIMsgAccount);
  let server = account.incomingServer;
  if (server.type == "im") {
    return null;
  }

  let folders = null;
  if (includeFolders) {
    folders = traverseSubfolders(account.incomingServer.rootFolder, account.key)
      .subFolders;
  }

  return {
    id: account.key,
    name: account.incomingServer.prettyName,
    type: account.incomingServer.type,
    folders,
    identities: account.identities.map(identity =>
      convertMailIdentity(account, identity)
    ),
  };
}

/**
 * Converts an nsIMsgIdentity to a simple object for use in messages.
 * @param {nsIMsgAccount} account
 * @param {nsIMsgIdentity} identity
 * @return {Object}
 */
function convertMailIdentity(account, identity) {
  if (!account || !identity) {
    return null;
  }
  identity = identity.QueryInterface(Ci.nsIMsgIdentity);
  return {
    accountId: account.key,
    id: identity.key,
    label: identity.label || "",
    name: identity.fullName || "",
    email: identity.email || "",
    replyTo: identity.replyTo || "",
    organization: identity.organization || "",
    composeHtml: identity.composeHtml,
    signature: identity.htmlSigText || "",
    signatureIsPlainText: !identity.htmlSigFormat,
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
function folderURIToPath(accountId, uri) {
  let server = MailServices.accounts.getAccount(accountId).incomingServer;
  let rootURI = server.rootFolder.URI;
  if (rootURI == uri) {
    return "/";
  }
  // The .URI property of an IMAP folder doesn't have %-encoded characters, but
  // may include literal % chars. Services.io.newURI(uri) applies encodeURI to
  // the returned filePath, but will not encode any literal % chars, which will
  // cause decodeURIComponent to fail (bug 1707408).
  if (server.type == "imap") {
    return uri.substring(rootURI.length);
  }
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
 * Converts an nsIMsgFolder to a simple object for use in API messages.
 *
 * @param {nsIMsgFolder} folder - The folder to convert.
 * @param {string} [accountId] - An optimization to avoid looking up the
 *     account. The value from nsIMsgHdr.accountKey must not be used here.
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
    path: folderURIToPath(accountId, folder.URI),
  };

  for (let [flag, typeName] of folderTypeMap.entries()) {
    if (folder.flags & flag) {
      folderObject.type = typeName;
    }
  }

  return folderObject;
}

/**
 * Converts an nsIMsgFolder and all subfolders to a simple object for use in
 * API messages.
 *
 * @param {nsIMsgFolder} folder - The folder to convert.
 * @param {string} [accountId] - An optimization to avoid looking up the
 *     account. The value from nsIMsgHdr.accountKey must not be used here.
 * @return {Array}
 */
function traverseSubfolders(folder, accountId) {
  let f = convertFolder(folder, accountId);
  f.subFolders = [];
  if (folder.hasSubFolders) {
    for (let subFolder of folder.subFolders) {
      f.subFolders.push(
        traverseSubfolders(subFolder, accountId || f.accountId)
      );
    }
  }
  return f;
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
    junk: junkScore >= gJunkThreshold,
    junkScore,
    headerMessageId: msgHdr.messageId,
    size: msgHdr.messageSize,
  };
  if (extension.hasPermission("accountsRead")) {
    messageObject.folder = convertFolder(msgHdr.folder);
  }
  let tags = msgHdr.getProperty("keywords");
  tags = tags ? tags.split(" ") : [];
  messageObject.tags = tags.filter(MailServices.tags.isValidKey);
  return messageObject;
}

/**
 * A map of numeric identifiers to messages for easy reference.
 *
 * @implements {nsIFolderListener}
 * @implements {nsIMsgFolderListener}
 * @implements {nsIObserver}
 */
var messageTracker = new (class extends EventEmitter {
  constructor() {
    super();
    this._nextId = 1;
    this._messages = new Map();
    this._messageIds = new Map();
    this._listenerCount = 0;
    this._pendingKeyChanges = new Map();

    // nsIObserver
    Services.obs.addObserver(this, "xpcom-shutdown");
    Services.obs.addObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.propertyFlagChanged |
        Ci.nsIFolderListener.intPropertyChanged
    );
    // nsIMsgFolderListener
    MailServices.mfn.addListener(
      this,
      MailServices.mfn.msgsJunkStatusChanged |
        MailServices.mfn.msgsDeleted |
        MailServices.mfn.msgsMoveCopyCompleted |
        MailServices.mfn.msgKeyChanged
    );
  }

  cleanup() {
    // nsIObserver
    Services.obs.removeObserver(this, "xpcom-shutdown");
    Services.obs.removeObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.RemoveFolderListener(this);
    // nsIMsgFolderListener
    MailServices.mfn.removeListener(this);
  }

  /**
   * Maps the provided message identifiers to the given messageTracker id.
   */
  _set(id, folderURI, messageKey) {
    let hash = JSON.stringify([folderURI, messageKey]);
    this._messageIds.set(hash, id);
    this._messages.set(id, {
      folderURI,
      messageKey,
    });
  }

  /**
   * Lookup the messageTracker id for the given message identifiers, return null
   * if not known.
   */
  _get(folderURI, messageKey) {
    let hash = JSON.stringify([folderURI, messageKey]);
    if (this._messageIds.has(hash)) {
      return this._messageIds.get(hash);
    }
    return null;
  }

  /**
   * Removes the provided message identifiers from the messageTracker.
   */
  _remove(folderURI, messageKey) {
    let hash = JSON.stringify([folderURI, messageKey]);
    let id = this._get(folderURI, messageKey);
    this._messages.delete(id);
    this._messageIds.delete(hash);
  }

  /**
   * Finds a message in the messageTracker or adds it.
   * @return {int} The messageTracker id of the message
   */
  getId(msgHdr) {
    let id = this._get(msgHdr.folder.URI, msgHdr.messageKey);
    if (id) {
      return id;
    }
    id = this._nextId++;

    this._set(id, msgHdr.folder.URI, msgHdr.messageKey);
    return id;
  }

  /**
   * Retrieves a message from the messageTracker. If the message no longer,
   * exists it is removed from the messageTracker.
   * @return {nsIMsgHdr} The identifier of the message
   */
  getMessage(id) {
    let value = this._messages.get(id);
    if (!value) {
      return null;
    }

    let folder = MailServices.folderLookup.getFolderForURL(value.folderURI);
    if (folder) {
      let msgHdr = folder.msgDatabase.GetMsgHdrForKey(value.messageKey);
      if (msgHdr) {
        return msgHdr;
      }
    }

    this._remove(value.folderURI, value.messageKey);
    return null;
  }

  // nsIFolderListener

  OnItemPropertyFlagChanged(item, property, oldFlag, newFlag) {
    switch (property) {
      case "Status":
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.Read) {
          this.emit("message-updated", item, { read: item.isRead });
        }
        break;
      case "Flagged":
        this.emit("message-updated", item, { flagged: item.isFlagged });
        break;
      case "Keywords":
        {
          let tags = item.getProperty("keywords");
          tags = tags ? tags.split(" ") : [];
          this.emit("message-updated", item, {
            tags: tags.filter(MailServices.tags.isValidKey),
          });
        }
        break;
    }
  }

  OnItemIntPropertyChanged(folder, property, oldValue, newValue) {
    switch (property) {
      case "BiffState":
        if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
          // The folder argument is a root folder.
          this.findNewMessages(folder);
        }
        break;
      case "NewMailReceived":
        // The folder argument is a real folder.
        this.findNewMessages(folder);
        break;
    }
  }

  /**
   * Finds the first folder with new messages in the specified changedFolder and
   * returns those.
   *
   * @see MailNotificationManager._getFirstRealFolderWithNewMail()
   */
  findNewMessages(changedFolder) {
    let folders = changedFolder.descendants;
    folders.unshift(changedFolder);
    let folder = folders.find(f => {
      let flags = f.flags;
      if (
        !(flags & Ci.nsMsgFolderFlags.Inbox) &&
        flags & (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual)
      ) {
        // Do not notify if the folder is not Inbox but one of
        // Drafts|Trash|SentMail|Templates|Junk|Archive|Queue or Virtual.
        return false;
      }
      return f.getNumNewMessages(false) > 0;
    });

    if (!folder) {
      return;
    }

    let numNewMessages = folder.getNumNewMessages(false);
    let msgDb = folder.msgDatabase;
    let newMsgKeys = msgDb.getNewList().slice(-numNewMessages);
    if (newMsgKeys.length == 0) {
      return;
    }
    this.emit(
      "messages-received",
      newMsgKeys[0].folder,
      newMsgKeys.map(key => msgDb.GetMsgHdrForKey(key))
    );
  }

  // nsIMsgFolderListener

  msgsJunkStatusChanged(messages) {
    for (let msgHdr of messages) {
      let junkScore = parseInt(msgHdr.getProperty("junkscore"), 10) || 0;
      this.emit("message-updated", msgHdr, {
        junk: junkScore >= gJunkThreshold,
      });
    }
  }

  msgsDeleted(deletedMsgs) {
    if (deletedMsgs.length > 0) {
      this.emit("messages-deleted", deletedMsgs);
    }
  }

  msgsMoveCopyCompleted(move, srcMsgs, dstFolder, dstMsgs) {
    if (srcMsgs.length > 0 && dstMsgs.length > 0) {
      let emitMsg = move ? "messages-moved" : "messages-copied";
      this.emit(emitMsg, srcMsgs, dstMsgs);
    }
  }

  msgKeyChanged(oldKey, newMsgHdr) {
    // For IMAP messages there is a delayed update of database keys and if those
    // keys change, the messageTracker needs to update its maps, otherwise wrong
    // messages will be returned. Key changes are replayed in multi-step swaps.
    let newKey = newMsgHdr.messageKey;

    // Replay pending swaps.
    while (this._pendingKeyChanges.has(oldKey)) {
      let next = this._pendingKeyChanges.get(oldKey);
      this._pendingKeyChanges.delete(oldKey);
      oldKey = next;

      // Check if we are left with a no-op swap and exit early.
      if (oldKey == newKey) {
        this._pendingKeyChanges.delete(oldKey);
        return;
      }
    }

    if (oldKey != newKey) {
      // New key swap, log the mirror swap as pending.
      this._pendingKeyChanges.set(newKey, oldKey);

      // Swap tracker entries.
      let oldId = this._get(newMsgHdr.folder.URI, oldKey);
      let newId = this._get(newMsgHdr.folder.URI, newKey);
      this._set(oldId, newMsgHdr.folder.URI, newKey);
      this._set(newId, newMsgHdr.folder.URI, oldKey);
    }
  }

  // nsIObserver

  /**
   * Observer to update message tracker if a message has received a new key due
   * to attachments being removed, which we do not consider to be a new message.
   */
  observe(subject, topic, data) {
    if (topic == "attachment-delete-msgkey-changed") {
      data = JSON.parse(data);

      if (data && data.folderURI && data.oldMessageKey && data.newMessageKey) {
        let id = this._get(data.folderURI, data.oldMessageKey);
        if (id) {
          // Replace tracker entries.
          this._set(id, data.folderURI, data.newMessageKey);
        }
      }
    } else if (topic == "xpcom-shutdown") {
      this.cleanup();
    }
  }
})();

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
  startList(messages, extension) {
    let messageList = this.createList(extension);
    if (Array.isArray(messages)) {
      messages = this._createEnumerator(messages);
    }
    while (messages.hasMoreElements()) {
      let next = messages.getNext();
      messageList.add(next.QueryInterface(Ci.nsIMsgDBHdr));
    }
    messageList.done();
    return this.getNextPage(messageList);
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

  /**
   * Creates and returns a new messageList object.
   * @returns {Object}
   */
  createList(extension) {
    let messageListId = uuidGenerator.generateUUID().number.substring(1, 37);
    let messageList = this._createListObject(messageListId, extension);
    let lists = this._contextLists.get(extension);
    if (!lists) {
      lists = new Map();
      this._contextLists.set(extension, lists);
    }
    lists.set(messageListId, messageList);
    return messageList;
  },

  /**
   * Returns the messageList object for a given id.
   * @returns {Object}
   */
  getList(messageListId, extension) {
    let lists = this._contextLists.get(extension);
    let messageList = lists ? lists.get(messageListId, null) : null;
    if (!messageList) {
      throw new ExtensionError(
        `No message list for id ${messageListId}. Have you reached the end of a list?`
      );
    }
    return messageList;
  },

  /**
   * Returns the first/next message page of the given messageList.
   * @returns {Object}
   */
  async getNextPage(messageList) {
    let messageListId = messageList.id;
    let messages = await messageList.getNextPage();
    if (!messageList.hasMorePages()) {
      let lists = this._contextLists.get(messageList.extension);
      if (lists && lists.has(messageListId)) {
        lists.delete(messageListId);
      }
      messageListId = null;
    }
    return {
      id: messageListId,
      messages,
    };
  },

  _createListObject(messageListId, extension) {
    function getCurrentPage() {
      return pages.length > 0 ? pages[pages.length - 1] : null;
    }

    function addPage() {
      let contents = getCurrentPage();
      let resolvePage = currentPageResolveCallback;

      pages.push([]);
      pagePromises.push(
        new Promise(resolve => {
          currentPageResolveCallback = resolve;
        })
      );

      if (contents && resolvePage) {
        resolvePage(contents);
      }
    }

    let _messageListId = messageListId;
    let _extension = extension;
    let isDone = false;
    let pages = [];
    let pagePromises = [];
    let currentPageResolveCallback = null;
    let readIndex = 0;

    // Add first page.
    addPage();

    return {
      get id() {
        return _messageListId;
      },
      get extension() {
        return _extension;
      },
      add(message) {
        if (isDone) {
          return;
        }
        if (getCurrentPage().length >= gMessagesPerPage) {
          addPage();
        }
        getCurrentPage().push(convertMessage(message, _extension));
      },
      done() {
        if (isDone) {
          return;
        }
        isDone = true;
        currentPageResolveCallback(getCurrentPage());
      },
      hasMorePages() {
        return readIndex < pages.length;
      },
      async getNextPage() {
        if (readIndex >= pages.length) {
          return null;
        }
        const pageContent = await pagePromises[readIndex];
        // Increment readIndex only after pagePromise has resolved, so multiple
        // calls to getNextPage get the same page.
        readIndex++;
        return pageContent;
      },
    };
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
