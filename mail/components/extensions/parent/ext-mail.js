/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var { ExtensionError } = ExtensionUtils;
var { defineLazyGetter, makeWidgetId } = ExtensionCommon;

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  ExtensionContent: "resource://gre/modules/ExtensionContent.sys.mjs",
});

var { AccountManager, FolderManager } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);

var { MessageListTracker, MessageTracker, MessageManager } =
  ChromeUtils.importESModule("resource:///modules/ExtensionMessages.sys.mjs");

XPCOMUtils.defineLazyGlobalGetters(this, [
  "IOUtils",
  "PathUtils",
  "FileReader",
]);

const MAIN_WINDOW_URI = "chrome://messenger/content/messenger.xhtml";
const POPUP_WINDOW_URI = "chrome://messenger/content/extensionPopup.xhtml";
const COMPOSE_WINDOW_URI =
  "chrome://messenger/content/messengercompose/messengercompose.xhtml";
const MESSAGE_WINDOW_URI = "chrome://messenger/content/messageWindow.xhtml";
const MESSAGE_PROTOCOLS = ["imap", "mailbox", "news", "nntp", "snews"];

const NOTIFICATION_COLLAPSE_TIME = 200;

(function () {
  // Monkey-patch all processes to add the "messenger" alias in all contexts.
  Services.ppmm.loadProcessScript(
    "chrome://messenger/content/processScript.js",
    true
  );

  // This allows scripts to run in the compose document or message display
  // document if and only if the extension has permission.
  const { defaultConstructor } = ExtensionContent.contentScripts;
  ExtensionContent.contentScripts.defaultConstructor = function (matcher) {
    const script = defaultConstructor.call(this, matcher);

    const { matchesWindowGlobal } = script;
    script.matchesWindowGlobal = function (windowGlobal) {
      const { browsingContext, windowContext } = windowGlobal;

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

global.clickModifiersFromEvent = event => {
  const map = {
    shiftKey: "Shift",
    altKey: "Alt",
    metaKey: "Command",
    ctrlKey: "Ctrl",
  };
  const modifiers = Object.keys(map)
    .filter(key => event[key])
    .map(key => map[key]);

  if (event.ctrlKey && AppConstants.platform === "macosx") {
    modifiers.push("MacCtrl");
  }

  return modifiers;
};

global.openOptionsPage = extension => {
  const window = windowTracker.topNormalWindow;
  if (!window) {
    return Promise.reject({ message: "No mail window available" });
  }

  if (extension.manifest.options_ui.open_in_tab) {
    window.switchToTabHavingURI(extension.manifest.options_ui.page, true, {
      triggeringPrincipal: extension.principal,
    });
    return Promise.resolve();
  }

  const viewId = `addons://detail/${encodeURIComponent(
    extension.id
  )}/preferences`;

  return window.openAddonsMgr(viewId);
};

/**
 * Returns a real file for the given DOM File.
 *
 * @param {File} file - the DOM File
 * @returns {nsIFile}
 */
async function getRealFileForFile(file) {
  if (file.mozFullPath) {
    const realFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    realFile.initWithPath(file.mozFullPath);
    return realFile;
  }

  const pathTempFile = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    file.name.replaceAll(/[/:*?\"<>|]/g, "_"),
    0o600
  );

  const tempFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  tempFile.initWithPath(pathTempFile);
  const extAppLauncher = Cc[
    "@mozilla.org/uriloader/external-helper-app-service;1"
  ].getService(Ci.nsPIExternalAppLauncher);
  extAppLauncher.deleteTemporaryFileOnExit(tempFile);

  const bytes = await new Promise(function (resolve) {
    const reader = new FileReader();
    reader.onloadend = function () {
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });

  await IOUtils.write(pathTempFile, bytes);
  return tempFile;
}

/**
 * Gets the window for a tabmail tabInfo.
 *
 * @param {NativeTabInfo} nativeTabInfo - The tabInfo object to get the browser for
 * @returns {Window} - The browser element for the tab
 */
function getTabWindow(nativeTabInfo) {
  return Cu.getGlobalForObject(nativeTabInfo);
}
global.getTabWindow = getTabWindow;

/**
 * Gets the tabmail for a tabmail tabInfo.
 *
 * @param {NativeTabInfo} nativeTabInfo - The tabInfo object to get the browser for
 * @returns {?XULElement} - The browser element for the tab
 */
function getTabTabmail(nativeTabInfo) {
  return getTabWindow(nativeTabInfo).document.getElementById("tabmail");
}
global.getTabTabmail = getTabTabmail;

/**
 * Gets the tab browser for the tabmail tabInfo.
 *
 * @param {NativeTabInfo} nativeTabInfo - The tabInfo object to get the browser for
 * @returns {?XULElement} The browser element for the tab
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
   * @returns {object}
   */
  get(keyObject) {
    if (!this.tabData.has(keyObject)) {
      const data = Object.create(this.getDefaultPrototype(keyObject));
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
ChromeUtils.defineLazyGetter(global, "searchInitialized", () => {
  if (Services.search.isInitialized) {
    return Promise.resolve();
  }
  return ExtensionUtils.promiseObserved(
    "browser-search-service",
    (_, data) => data == "init-complete"
  );
});

/**
 * Returns the WebExtension window type for the given window, or null, if it is
 * not supported.
 *
 * @param {DOMWindow} window - The window to check
 * @returns {[string]} - The WebExtension type of the window
 */
function getWebExtensionWindowType(window) {
  const { documentElement } = window.document;
  if (!documentElement) {
    return null;
  }
  switch (documentElement.getAttribute("windowtype")) {
    case "msgcompose":
      return "messageCompose";
    case "mail:messageWindow":
      return "messageDisplay";
    case "mail:extensionPopup":
      return "popup";
    case "mail:3pane":
      return "normal";
    default:
      return "unknown";
  }
}

/**
 * The window tracker tracks opening and closing Thunderbird windows. Each window has an id, which
 * is mapped to native window objects.
 */
class WindowTracker extends WindowTrackerBase {
  /**
   * Adds a tab progress listener to the given mail window.
   *
   * @param {DOMWindow} window - The mail window to which to add the listener.
   * @param {object} listener - The listener to add
   */
  addProgressListener(window, listener) {
    if (window.contentProgress) {
      window.contentProgress.addListener(listener);
    }
  }

  /**
   * Removes a tab progress listener from the given mail window.
   *
   * @param {DOMWindow} window - The mail window from which to remove the listener.
   * @param {object} listener - The listener to remove
   */
  removeProgressListener(window, listener) {
    if (window.contentProgress) {
      window.contentProgress.removeListener(listener);
    }
  }

  /**
   * Determines if the passed window object is supported by the windows API. The
   * function name is for base class compatibility with toolkit.
   *
   * @param {DOMWindow} window - The window to check
   * @returns {boolean} True, if the window is supported by the windows API
   */
  isBrowserWindow(window) {
    const type = getWebExtensionWindowType(window);
    return !!type && type != "unknown";
  }

  /**
   * Determines if the passed window object is a mail window but not the main
   * window. This is useful to find windows where the window itself is the
   * "nativeTab" object in API terms.
   *
   * @param {DOMWindow} window - The window to check
   * @returns {boolean} True, if the window is a mail window but not the main window
   */
  isSecondaryWindow(window) {
    const { documentElement } = window.document;
    if (!documentElement) {
      return false;
    }

    return ["msgcompose", "mail:messageWindow", "mail:extensionPopup"].includes(
      documentElement.getAttribute("windowtype")
    );
  }

  /**
   * The currently active, or topmost window supported by the API, or null if no
   * supported window is currently open.
   *
   * @property {?DOMWindow} topWindow
   * @readonly
   */
  get topWindow() {
    let win = Services.wm.getMostRecentWindow(null);
    // If we're lucky, this is a window supported by the API and we can return it
    // directly.
    if (win && !this.isBrowserWindow(win)) {
      win = null;
      // This is oldest to newest, so this gets a bit ugly.
      for (const nextWin of Services.wm.getEnumerator(null)) {
        if (this.isBrowserWindow(nextWin)) {
          win = nextWin;
        }
      }
    }
    return win;
  }

  /**
   * The currently active, or topmost window, or null if no window is currently open, that
   * is not private browsing.
   *
   * @property {DOMWindow|null} topWindow
   * @readonly
   */
  get topNonPBWindow() {
    // Thunderbird does not support private browsing, return topWindow.
    return this.topWindow;
  }

  /**
   * The currently active, or topmost, mail window, or null if no mail window is currently open.
   * Will only return the topmost "normal" (i.e., not popup) window.
   *
   * @property {?DOMWindow} topNormalWindow
   * @readonly
   */
  get topNormalWindow() {
    return Services.wm.getMostRecentWindow("mail:3pane");
  }
}

/**
 * Convenience class to keep track of and manage spaces.
 */
class SpaceTracker {
  /**
   * @typedef SpaceData
   * @property {string} name - name of the space as used by the extension
   * @property {integer} spaceId - id of the space as used by the tabs API
   * @property {string} spaceButtonId - id of the button of this space in the
   *   spaces toolbar
   * @property {string} defaultUrl - the url for the default space tab
   * @property {ButtonProperties} buttonProperties
   *   @see mail/components/extensions/schemas/spaces.json
   * @property {ExtensionData} extension - the extension the space belongs to
   */

  constructor() {
    this._nextId = 1;
    this._spaceData = new Map();
    this._spaceIds = new Map();

    // Keep this in sync with the default spaces in gSpacesToolbar.
    const builtInSpaces = [
      {
        name: "mail",
        spaceButtonId: "mailButton",
        tabInSpace: tabInfo =>
          ["folder", "mail3PaneTab", "mailMessageTab"].includes(
            tabInfo.mode.name
          )
            ? 1
            : 0,
      },
      {
        name: "addressbook",
        spaceButtonId: "addressBookButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "addressBookTab" ? 1 : 0),
      },
      {
        name: "calendar",
        spaceButtonId: "calendarButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "calendar" ? 1 : 0),
      },
      {
        name: "tasks",
        spaceButtonId: "tasksButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "tasks" ? 1 : 0),
      },
      {
        name: "chat",
        spaceButtonId: "chatButton",
        tabInSpace: tabInfo => (tabInfo.mode.name == "chat" ? 1 : 0),
      },
      {
        name: "settings",
        spaceButtonId: "settingsButton",
        tabInSpace: tabInfo => {
          switch (tabInfo.mode.name) {
            case "preferencesTab":
              // A primary tab that the open method creates.
              return 1;
            case "contentTab": {
              const url = tabInfo.urlbar?.value;
              if (url == "about:accountsettings" || url == "about:addons") {
                // A secondary tab, that is related to this space.
                return 2;
              }
            }
          }
          return 0;
        },
      },
    ];
    for (const builtInSpace of builtInSpaces) {
      this._add(builtInSpace);
    }
  }

  findSpaceForTab(tabInfo) {
    for (const spaceData of this._spaceData.values()) {
      if (spaceData.tabInSpace(tabInfo)) {
        return spaceData;
      }
    }
    return undefined;
  }

  _add(spaceData) {
    const spaceId = this._nextId++;
    const { spaceButtonId } = spaceData;
    this._spaceData.set(spaceButtonId, { ...spaceData, spaceId });
    this._spaceIds.set(spaceId, spaceButtonId);
    return { ...spaceData, spaceId };
  }

  /**
   * Generate an id of the form <add-on-id>-spacesButton-<spaceId>.
   *
   * @param {string} name - name of the space as used by the extension
   * @param {ExtensionData} extension
   * @returns {string} id of the html element of the spaces toolbar button of
   *   this space
   */
  _getSpaceButtonId(name, extension) {
    return `${makeWidgetId(extension.id)}-spacesButton-${name}`;
  }

  /**
   * Get the SpaceData for the space with the given name for the given extension.
   *
   * @param {string} name - name of the space as used by the extension
   * @param {ExtensionData} extension
   * @returns {SpaceData}
   */
  fromSpaceName(name, extension) {
    const spaceButtonId = this._getSpaceButtonId(name, extension);
    return this.fromSpaceButtonId(spaceButtonId);
  }

  /**
   * Get the SpaceData for the space with the given spaceId.
   *
   * @param {integer} spaceId - id of the space as used by the tabs API
   * @returns {SpaceData}
   */
  fromSpaceId(spaceId) {
    const spaceButtonId = this._spaceIds.get(spaceId);
    return this.fromSpaceButtonId(spaceButtonId);
  }

  /**
   * Get the SpaceData for the space with the given spaceButtonId.
   *
   * @param {string} spaceButtonId - id of the html element of a spaces toolbar
   *   button
   * @returns {SpaceData}
   */
  fromSpaceButtonId(spaceButtonId) {
    if (!spaceButtonId || !this._spaceData.has(spaceButtonId)) {
      return null;
    }
    return this._spaceData.get(spaceButtonId);
  }

  /**
   * Create a new space and return its SpaceData.
   *
   * @param {string} name - name of the space as used by the extension
   * @param {string} defaultUrl - the url for the default space tab
   * @param {ButtonProperties} buttonProperties
   *   @see mail/components/extensions/schemas/spaces.json
   * @param {ExtensionData} extension - the extension the space belongs to
   * @returns {SpaceData}
   */
  async create(name, defaultUrl, buttonProperties, extension) {
    const spaceButtonId = this._getSpaceButtonId(name, extension);
    if (this._spaceData.has(spaceButtonId)) {
      return false;
    }
    return this._add({
      name,
      spaceButtonId,
      tabInSpace: tabInfo => (tabInfo.spaceButtonId == spaceButtonId ? 1 : 0),
      defaultUrl,
      buttonProperties,
      extension,
    });
  }

  /**
   * Return a WebExtension Space object, representing the given spaceData.
   *
   * @param {SpaceData} spaceData
   * @returns {Space} - @see mail/components/extensions/schemas/spaces.json
   */
  convert(spaceData, extension) {
    const space = {
      id: spaceData.spaceId,
      name: spaceData.name,
      isBuiltIn: !spaceData.extension,
      isSelfOwned: spaceData.extension?.id == extension.id,
    };
    if (spaceData.extension && extension.hasPermission("management")) {
      space.extensionId = spaceData.extension.id;
    }
    return space;
  }

  /**
   * Remove a space and its SpaceData from the tracker.
   *
   * @param {SpaceData} spaceData
   */
  remove(spaceData) {
    if (!this._spaceData.has(spaceData.spaceButtonId)) {
      return;
    }
    this._spaceData.delete(spaceData.spaceButtonId);
  }

  /**
   * Update spaceData for a space in the tracker.
   *
   * @param {SpaceData} spaceData
   */
  update(spaceData) {
    if (!this._spaceData.has(spaceData.spaceButtonId)) {
      return;
    }
    this._spaceData.set(spaceData.spaceButtonId, spaceData);
  }

  /**
   * Return the SpaceData of all spaces known to the tracker.
   *
   * @returns {SpaceData[]}
   */
  getAll() {
    return this._spaceData.values();
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

    ExtensionSupport.registerWindowListener("ext-sessions", {
      chromeURLs: [MAIN_WINDOW_URI],
      onLoadWindow(window) {
        window.gTabmail.registerTabMonitor({
          monitorName: "extensionSession",
          onTabTitleChanged() {},
          onTabClosing() {},
          onTabPersist(aTab) {
            return aTab._ext.extensionSession;
          },
          onTabRestored(aTab, aState) {
            aTab._ext.extensionSession = aState;
          },
          onTabSwitched() {},
          onTabOpened() {},
        });
      },
    });
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
   * @param {NativeTabInfo} nativeTabInfo - The tabmail tabInfo for which to return an ID
   * @returns {Integer} The tab's numeric ID
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
   * @param {XULElement} browser - The <browser> element to retrieve for
   * @returns {Integer} The tab's numeric ID
   */
  getBrowserTabId(browser) {
    let id = this._browsers.get(browser.browserId);
    if (id) {
      return id;
    }

    const window = browser.browsingContext.topChromeWindow;
    const tabmail = window.document.getElementById("tabmail");
    const tab = tabmail && tabmail.getTabForBrowser(browser);

    if (tab) {
      id = this.getId(tab);
      this._browsers.set(browser.browserId, id);
      return id;
    }
    if (windowTracker.isSecondaryWindow(window)) {
      return this.getId(window);
    }
    return -1;
  }

  /**
   * Records the tab information for the given tabInfo object.
   *
   * @param {NativeTabInfo} nativeTabInfo - The tab info to record for
   * @param {Integer} id - The tab id to record
   */
  setId(nativeTabInfo, id) {
    this._tabs.set(nativeTabInfo, id);
    const browser = getTabBrowser(nativeTabInfo);
    if (browser) {
      this._browsers.set(browser.browserId, id);
    }
    this._tabIds.set(id, nativeTabInfo);
  }

  /**
   * Function to call when a tab was close, deletes tab information for the tab.
   *
   * @param {Event} event - The event triggering the detroyal
   * @param {{ nativeTabInfo:NativeTabInfo}} - The object containing tab info
   */
  _handleTabDestroyed(event, { nativeTabInfo }) {
    const id = this._tabs.get(nativeTabInfo);
    if (id) {
      this._tabs.delete(nativeTabInfo);
      if (nativeTabInfo.browser) {
        this._browsers.delete(nativeTabInfo.browser.browserId);
      }
      if (this._tabIds.get(id) === nativeTabInfo) {
        this._tabIds.delete(id);
      }
    }
  }

  /**
   * Returns the native tab with the given numeric ID.
   *
   * @param {Integer} tabId - The numeric ID of the tab to return.
   * @param {*} default_ - The value to return if no tab exists with the given ID.
   * @returns {NativeTabInfo} The tab information for the given id.
   */
  getTab(tabId, default_ = undefined) {
    const nativeTabInfo = this._tabIds.get(tabId);
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
   * @param {Event} event - A DOM event to handle.
   */
  handleEvent(event) {
    const nativeTabInfo = event.detail.tabInfo;

    switch (event.type) {
      case "TabOpen": {
        // Save the current tab, since the newly-created tab will likely be
        // active by the time the promise below resolves and the event is
        // dispatched.
        const tabmail = event.target.ownerDocument.getElementById("tabmail");
        const currentTab = tabmail.selectedTab;
        // We need to delay sending this event until the next tick, since the
        // tab does not have its final index when the TabOpen event is dispatched.
        Promise.resolve().then(() => {
          if (event.detail.moving) {
            const srcTabId = this._movingTabs.get(event.detail.moving);
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
          this.emitActivated(nativeTabInfo, event.detail.previousTabInfo);
        });
        break;
    }
  }

  /**
   * A private method which is called whenever a new mail window is opened, and dispatches the
   * necessary events for it.
   *
   * @param {DOMWindow} window - The window being opened.
   */
  _handleWindowOpen(window) {
    if (windowTracker.isSecondaryWindow(window)) {
      this.emit("tab-created", {
        nativeTabInfo: window,
        currentTab: window,
      });
      return;
    }

    const tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

    for (const nativeTabInfo of tabmail.tabInfo) {
      this.emitCreated(nativeTabInfo);
    }
  }

  /**
   * A private method which is called whenever a mail window is closed, and dispatches the necessary
   * events for it.
   *
   * @param {DOMWindow} window - The window being closed.
   */
  _handleWindowClose(window) {
    if (windowTracker.isSecondaryWindow(window)) {
      this.emit("tab-removed", {
        nativeTabInfo: window,
        tabId: this.getId(window),
        windowId: windowTracker.getId(getTabWindow(window)),
        isWindowClosing: true,
      });
      return;
    }

    const tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

    for (const nativeTabInfo of tabmail.tabInfo) {
      this.emitRemoved(nativeTabInfo, true);
    }
  }

  /**
   * Emits a "tab-activated" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo - The tab info which has been activated.
   * @param {NativeTab} previousTabInfo - The previously active tab element.
   */
  emitActivated(nativeTabInfo, previousTabInfo) {
    let previousTabId;
    if (previousTabInfo && !previousTabInfo.closed) {
      previousTabId = this.getId(previousTabInfo);
    }
    this.emit("tab-activated", {
      tabId: this.getId(nativeTabInfo),
      previousTabId,
      windowId: windowTracker.getId(getTabWindow(nativeTabInfo)),
    });
  }

  /**
   * Emits a "tab-attached" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo - The tab info which is being attached.
   */
  emitAttached(nativeTabInfo) {
    const tabId = this.getId(nativeTabInfo);
    const browser = getTabBrowser(nativeTabInfo);
    const tabmail = browser.ownerDocument.getElementById("tabmail");
    const tabIndex = tabmail._getTabContextForTabbyThing(nativeTabInfo)[0];
    const newWindowId = windowTracker.getId(browser.ownerGlobal);

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
   * @param {NativeTabInfo} nativeTabInfo - The tab info which is being detached.
   */
  emitDetached(nativeTabInfo) {
    const tabId = this.getId(nativeTabInfo);
    const browser = getTabBrowser(nativeTabInfo);
    const tabmail = browser.ownerDocument.getElementById("tabmail");
    const tabIndex = tabmail._getTabContextForTabbyThing(nativeTabInfo)[0];
    const oldWindowId = windowTracker.getId(browser.ownerGlobal);

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
   * @param {NativeTabInfo} nativeTabInfo - The tab info which is being created.
   * @param {?NativeTab} currentTab - The tab info for the currently active tab.
   */
  emitCreated(nativeTabInfo, currentTab) {
    this.emit("tab-created", { nativeTabInfo, currentTab });
  }

  /**
   * Emits a "tab-removed" event for the given tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo - The tab info in the window to which the tab is being
   *                                          removed
   * @param {boolean} isWindowClosing - If true, the window with these tabs is closing
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
   * @param {Element} browser - The browser element to check
   * @returns {{ tabId:Integer, windowId:Integer }} The browsing data for the element
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
    const window = windowTracker.topWindow;
    const tabmail = window && window.document.getElementById("tabmail");
    return tabmail ? tabmail.selectedTab : window;
  }
}

/**
 * Extension-specific wrapper around a Thunderbird tab. Note that for actual
 * tabs in the main window, some of these methods are overridden by the
 * TabmailTab subclass.
 */
class Tab extends TabBase {
  get spaceId() {
    const tabWindow = getTabWindow(this.nativeTab);
    if (getWebExtensionWindowType(tabWindow) != "normal") {
      return undefined;
    }

    const spaceData = spaceTracker.findSpaceForTab(this.nativeTab);
    return spaceData?.spaceId ?? undefined;
  }

  /** What sort of tab is this? */
  get type() {
    switch (this.nativeTab.location?.href) {
      case COMPOSE_WINDOW_URI:
        return "messageCompose";
      case MESSAGE_WINDOW_URI:
        return "messageDisplay";
      case POPUP_WINDOW_URI:
        return "content";
      default:
        return null;
    }
  }

  /** Overrides the matches function to enable querying for tab types. */
  matches(queryInfo, context) {
    // If the query includes url or title, but this is a non-browser tab, return
    // false directly.
    if ((queryInfo.url || queryInfo.title) && !this.browser) {
      return false;
    }
    const result = super.matches(queryInfo, context);

    const type = queryInfo.mailTab ? "mail" : queryInfo.type;
    let types = [];
    if (Array.isArray(type)) {
      types = type;
    } else if (type) {
      types.push(type);
    }
    if (result && types.length > 0 && !types.includes(this.type)) {
      return false;
    }

    if (result && queryInfo.spaceId && this.spaceId != queryInfo.spaceId) {
      return false;
    }

    return result;
  }

  /** Adds the mailTab property and removes some useless properties from a tab object. */
  convert(fallback) {
    const result = super.convert(fallback);
    result.spaceId = this.spaceId;
    result.type = this.type;
    result.mailTab = result.type == "mail";

    // These properties are not useful to Thunderbird extensions and are not returned.
    for (const key of [
      "attention",
      "audible",
      "autoDiscardable",
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

  /**
   * This property is a signal of whether any extension has specified a blocker
   * to prevent discarding. Since TB does not support control over discarding,
   * the value should be true.
   */
  get autoDiscardable() {
    return true;
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
    if (!this.browser) {
      return null;
    }
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
    if (this.browser && this.browser.contentPrincipal) {
      return getCookieStoreIdForOriginAttributes(
        this.browser.contentPrincipal.originAttributes
      );
    }

    return DEFAULT_STORE;
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
    let isComplete;
    switch (this.type) {
      case "messageDisplay":
      case "addressBook":
        isComplete = this.browser?.contentDocument?.readyState == "complete";
        break;
      case "mail":
        {
          // If the messagePane is hidden or all browsers are hidden, there is
          // nothing to be loaded and we should return complete.
          const about3Pane = this.nativeTab.chromeBrowser.contentWindow;
          isComplete =
            !about3Pane.paneLayout?.messagePaneVisible ||
            this.browser?.webProgress?.isLoadingDocument === false ||
            (about3Pane.webBrowser?.hidden &&
              about3Pane.messageBrowser?.hidden &&
              about3Pane.multiMessageBrowser?.hidden);
        }
        break;
      case "content":
      case "special":
        isComplete = this.browser?.webProgress?.isLoadingDocument === false;
        break;
      default:
        // All other tabs (chat, task, calendar, messageCompose) do not fire the
        // tabs.onUpdated event (Bug 1827929). Let them always be complete.
        isComplete = true;
    }
    return isComplete ? "complete" : "loading";
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
      const tabmail = nativeTab.ownerDocument.getElementById("tabmail");
      nativeTab = tabmail._getTabContextForTabbyThing(nativeTab)[1];
    }
    super(extension, nativeTab, id);
  }

  /** What sort of tab is this? */
  get type() {
    switch (this.nativeTab.mode.name) {
      case "mail3PaneTab":
        return "mail";
      case "addressBookTab":
        return "addressBook";
      case "mailMessageTab":
        return "messageDisplay";
      case "contentTab": {
        const currentURI = this.nativeTab.browser.currentURI;
        if (currentURI?.schemeIs("about")) {
          switch (currentURI.filePath) {
            case "accountprovisioner":
              return "accountProvisioner";
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
      case "provisionerCheckoutTab":
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
    return this.nativeTab.favIconUrl;
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
    if (this.browser && this.browser.contentTitle) {
      return this.browser.contentTitle;
    }
    // Do we want to be using this.nativeTab.title instead? The difference is
    // that the tabNode label may use defaultTabTitle instead, but do we want to
    // send this out?
    return this.nativeTab.tabNode.getAttribute("label");
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
   * @property {string} type - The type of the window, as defined by the
   *   WebExtension API.
   * @see mail/components/extensions/schemas/windows.json
   * @readonly
   */
  get type() {
    const type = getWebExtensionWindowType(this.window);
    if (!type) {
      throw new ExtensionError(
        "Windows API encountered an invalid window type."
      );
    }
    return type;
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
   * @param {string} titlePreface - The title preface to set
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
   * @param {DOMWindow} window - The window to check
   * @returns {string} "maximized", "minimized", "normal" or "fullscreen"
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
   * Sets the window state for this specific window.
   *
   * @param {string} state - "maximized", "minimized", "normal" or "fullscreen"
   */
  async setState(state) {
    const { window } = this;
    const expectedState = (function () {
      switch (state) {
        case "maximized":
          return window.STATE_MAXIMIZED;
        case "minimized":
        case "docked":
          return window.STATE_MINIMIZED;
        case "normal":
          return window.STATE_NORMAL;
        case "fullscreen":
          return window.STATE_FULLSCREEN;
      }
      throw new ExtensionError(`Unexpected window state: ${state}`);
    })();

    const initialState = window.windowState;
    if (expectedState == initialState) {
      return;
    }

    // We check for window.fullScreen here to make sure to exit fullscreen even
    // if DOM and widget disagree on what the state is. This is a speculative
    // fix for bug 1780876, ideally it should not be needed.
    if (initialState == window.STATE_FULLSCREEN || window.fullScreen) {
      window.fullScreen = false;
    }

    switch (expectedState) {
      case window.STATE_MAXIMIZED:
        window.maximize();
        break;
      case window.STATE_MINIMIZED:
        window.minimize();
        break;

      case window.STATE_NORMAL:
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

      case window.STATE_FULLSCREEN:
        window.fullScreen = true;
        break;

      default:
        throw new ExtensionError(`Unexpected window state: ${state}`);
    }

    if (window.windowState != expectedState) {
      // On Linux, sizemode changes are asynchronous. Some of them might not
      // even happen if the window manager doesn't want to, so wait for a bit
      // instead of forever for a sizemode change that might not ever happen.
      const noWindowManagerTimeout = 2000;

      let onSizeModeChange;
      const promiseExpectedSizeMode = new Promise(resolve => {
        onSizeModeChange = function () {
          if (window.windowState == expectedState) {
            resolve();
          }
        };
        window.addEventListener("sizemodechange", onSizeModeChange);
      });

      await Promise.any([
        promiseExpectedSizeMode,
        new Promise(resolve =>
          window.setTimeout(resolve, noWindowManagerTimeout)
        ),
      ]);
      window.removeEventListener("sizemodechange", onSizeModeChange);
    }

    if (window.windowState != expectedState) {
      console.warn(
        `Window manager refused to set window to state ${expectedState}.`
      );
    }
  }

  /**
   * Retrieves the (relevant) tabs in this window.
   *
   * @yields {Tab}      The wrapped Tab in this window
   */
  *getTabs() {
    const { tabManager } = this.extension;
    yield tabManager.getWrapper(this.window);
  }

  /**
   * Returns an iterator of TabBase objects for the highlighted tab in this
   * window. This is an alias for the active tab.
   *
   * @returns {Iterator<TabBase>}
   */
  *getHighlightedTabs() {
    yield this.activeTab;
  }

  /** Retrieves the active tab in this window */
  get activeTab() {
    const { tabManager } = this.extension;
    return tabManager.getWrapper(this.window);
  }

  /**
   * Retrieves the tab at the given index.
   *
   * @param {number} index - The index to look at
   * @returns {Tab} The wrapped tab at the index
   */
  getTabAtIndex(index) {
    const { tabManager } = this.extension;
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
    const { tabManager } = this.extension;

    for (const nativeTabInfo of this.tabmail.tabInfo) {
      // Only tabs that have a browser element.
      yield tabManager.getWrapper(nativeTabInfo);
    }
  }

  /** Retrieves the active tab in this window */
  get activeTab() {
    const { tabManager } = this.extension;
    const selectedTab = this.tabmail.selectedTab;
    if (selectedTab) {
      return tabManager.getWrapper(selectedTab);
    }
    return null;
  }

  /**
   * Retrieves the tab at the given index.
   *
   * @param {number} index - The index to look at
   * @returns {Tab} The wrapped tab at the index
   */
  getTabAtIndex(index) {
    const { tabManager } = this.extension;
    const nativeTabInfo = this.tabmail.tabInfo[index];
    if (nativeTabInfo) {
      return tabManager.getWrapper(nativeTabInfo);
    }
    return null;
  }
}

/**
 * Manages native tabs, their wrappers, and their dynamic permissions for a particular extension.
 */
class TabManager extends TabManagerBase {
  /**
   * Returns a Tab wrapper for the tab with the given ID.
   *
   * @param {integer} tabId - The ID of the tab for which to return a wrapper.
   * @param {*} default_ - The value to return if no tab exists with the given ID.
   * @returns {Tab|*} The wrapped tab, or the default value
   */
  get(tabId, default_ = undefined) {
    const nativeTabInfo = tabTracker.getTab(tabId, default_);

    if (nativeTabInfo) {
      return this.getWrapper(nativeTabInfo);
    }
    return default_;
  }

  /**
   * If the extension has requested activeTab permission, grant it those permissions for the current
   * inner window in the given native tab.
   *
   * @param {NativeTabInfo} nativeTabInfo - The native tab for which to grant permissions.
   */
  addActiveTabPermission(nativeTabInfo = tabTracker.activeTab) {
    if (nativeTabInfo.browser) {
      super.addActiveTabPermission(nativeTabInfo);
    }
  }

  /**
   * Revoke the extension's activeTab permissions for the current inner window of the given native
   * tab.
   *
   * @param {NativeTabInfo} nativeTabInfo - The native tab for which to revoke permissions.
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
  canAccessTab() {
    return true;
  }

  /**
   * Returns a new Tab instance wrapping the given native tab info.
   *
   * @param {NativeTabInfo} nativeTabInfo - The native tab for which to return a wrapper.
   * @returns {Tab} The wrapped native tab
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
   * @param {Integer} windowId - The ID of the browser window for which to return a wrapper.
   * @param {BaseContext} context - The extension context for which the matching is being performed.
   *                                  Used to determine the current window for relevant properties.
   * @returns {Window} The wrapped window
   */
  get(windowId, context) {
    const window = windowTracker.getWindow(windowId, context);
    return this.getWrapper(window);
  }

  /**
   * Yields an iterator of WindowBase wrappers for each currently existing browser window.
   *
   * @yields {Window}
   */
  *getAll() {
    for (const window of windowTracker.browserWindows()) {
      yield this.getWrapper(window);
    }
  }

  /**
   * Returns a new Window instance wrapping the given mail window.
   *
   * @param {DOMWindow} window - The mail window for which to return a wrapper.
   * @returns {Window} The wrapped window
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

async function waitForMailTabReady(tabInfo) {
  const { chromeBrowser, mode, closed } = tabInfo;
  if (!closed && mode.name == "mail3PaneTab") {
    await new Promise(resolve => {
      if (
        chromeBrowser.contentDocument.readyState == "complete" &&
        chromeBrowser.currentURI.spec == "about:3pane"
      ) {
        resolve();
      } else {
        chromeBrowser.contentWindow.addEventListener("load", () => resolve(), {
          once: true,
        });
      }
    });
  }
}

/**
 * Wait until the normal window identified by the given windowId has finished its
 * delayed startup. Returns its DOMWindow when done. Waits for the top normal
 * window, if no window is specified.
 *
 * @param {*} [context] - a WebExtension context
 * @param {*} [windowId] - a WebExtension window id
 * @returns {DOMWindow}
 */
async function getNormalWindowReady(context, windowId) {
  let window;
  if (windowId) {
    const win = context.extension.windowManager.get(windowId, context);
    if (win.type != "normal") {
      throw new ExtensionError(
        `Window with ID ${windowId} is not a normal window`
      );
    }
    window = win.window;
  } else {
    window = windowTracker.topNormalWindow;
  }

  // Wait for session restore.
  await new Promise(resolve => {
    if (!window.SessionStoreManager._restored) {
      const obs = observedWindow => {
        if (observedWindow != window) {
          return;
        }
        Services.obs.removeObserver(obs, "mail-tabs-session-restored");
        resolve();
      };
      Services.obs.addObserver(obs, "mail-tabs-session-restored");
    } else {
      resolve();
    }
  });

  // Wait for all mail3PaneTab's to have been fully restored and loaded.
  for (const tabInfo of window.gTabmail.tabInfo) {
    await waitForMailTabReady(tabInfo);
  }

  return window;
}

const tabTracker = new TabTracker();
const spaceTracker = new SpaceTracker();
const windowTracker = new WindowTracker();
Object.assign(global, {
  tabTracker,
  spaceTracker,
  windowTracker,
});

const messageTracker = new MessageTracker(windowTracker);
const messageListTracker = new MessageListTracker(messageTracker);
Object.assign(global, {
  messageTracker,
  messageListTracker,
});

extensions.on("startup", (type, extension) => {
  // eslint-disable-line mozilla/balanced-listeners
  if (extension.hasPermission("accountsRead")) {
    defineLazyGetter(
      extension,
      "folderManager",
      () => new FolderManager(extension)
    );
    defineLazyGetter(
      extension,
      "accountManager",
      () => new AccountManager(extension)
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
      () => new MessageManager(extension, messageTracker, messageListTracker)
    );
  }
  defineLazyGetter(extension, "tabManager", () => new TabManager(extension));
  defineLazyGetter(
    extension,
    "windowManager",
    () => new WindowManager(extension)
  );
});

extensions.on("shutdown", (type, extension) => {
  messageListTracker._contextLists.delete(extension);
});
