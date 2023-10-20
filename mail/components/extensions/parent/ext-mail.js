/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var { ExtensionError, getInnerWindowID } = ExtensionUtils;
var { defineLazyGetter, makeWidgetId } = ExtensionCommon;

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  ExtensionContent: "resource://gre/modules/ExtensionContent.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
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
  let { defaultConstructor } = ExtensionContent.contentScripts;
  ExtensionContent.contentScripts.defaultConstructor = function (matcher) {
    let script = defaultConstructor.call(this, matcher);

    let { matchesWindowGlobal } = script;
    script.matchesWindowGlobal = function (windowGlobal) {
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
let spaceTracker;
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
  let window = windowTracker.topNormalWindow;
  if (!window) {
    return Promise.reject({ message: "No mail window available" });
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

/**
 * Returns a real file for the given DOM File.
 *
 * @param {File} file - the DOM File
 * @returns {nsIFile}
 */
async function getRealFileForFile(file) {
  if (file.mozFullPath) {
    let realFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    realFile.initWithPath(file.mozFullPath);
    return realFile;
  }

  let pathTempFile = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    file.name.replaceAll(/[/:*?\"<>|]/g, "_"),
    0o600
  );

  let tempFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  tempFile.initWithPath(pathTempFile);
  let extAppLauncher = Cc[
    "@mozilla.org/uriloader/external-helper-app-service;1"
  ].getService(Ci.nsPIExternalAppLauncher);
  extAppLauncher.deleteTemporaryFileOnExit(tempFile);

  let bytes = await new Promise(function (resolve) {
    let reader = new FileReader();
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
 * Class for cached message headers to reduce XPCOM requests and to cache msgHdr
 * of file and attachment messages.
 */
class CachedMsgHeader {
  constructor(msgHdr) {
    this.mProperties = {};

    // Properties needed by convertMessage().
    this.author = null;
    this.subject = "";
    this.recipients = null;
    this.ccList = null;
    this.bccList = null;
    this.messageId = null;
    this.date = 0;
    this.flags = 0;
    this.isRead = false;
    this.isFlagged = false;
    this.messageSize = 0;
    this.folder = null;

    // Additional properties.
    this.accountKey = "";

    if (msgHdr) {
      // Cache all elements which are needed by convertMessage().
      this.author = msgHdr.mime2DecodedAuthor;
      this.subject = msgHdr.mime2DecodedSubject;
      this.recipients = msgHdr.mime2DecodedRecipients;
      this.ccList = msgHdr.ccList;
      this.bccList = msgHdr.bccList;
      this.messageId = msgHdr.messageId;
      this.date = msgHdr.date;
      this.flags = msgHdr.flags;
      this.isRead = msgHdr.isRead;
      this.isFlagged = msgHdr.isFlagged;
      this.messageSize = msgHdr.messageSize;
      this.folder = msgHdr.folder;

      this.mProperties.junkscore = msgHdr.getStringProperty("junkscore");
      this.mProperties.keywords = msgHdr.getStringProperty("keywords");

      if (this.folder) {
        this.messageKey = msgHdr.messageKey;
      } else {
        this.mProperties.dummyMsgUrl = msgHdr.getStringProperty("dummyMsgUrl");
        this.mProperties.dummyMsgLastModifiedTime = msgHdr.getUint32Property(
          "dummyMsgLastModifiedTime"
        );
      }

      // Also cache the additional elements.
      this.accountKey = msgHdr.accountKey;
    }
  }

  getProperty(aProperty) {
    return this.getStringProperty(aProperty);
  }
  setProperty(aProperty, aVal) {
    return this.setStringProperty(aProperty, aVal);
  }
  getStringProperty(aProperty) {
    if (this.mProperties.hasOwnProperty(aProperty)) {
      return this.mProperties[aProperty];
    }
    return "";
  }
  setStringProperty(aProperty, aVal) {
    this.mProperties[aProperty] = aVal;
  }
  getUint32Property(aProperty) {
    if (this.mProperties.hasOwnProperty(aProperty)) {
      return parseInt(this.mProperties[aProperty]);
    }
    return 0;
  }
  setUint32Property(aProperty, aVal) {
    this.mProperties[aProperty] = aVal.toString();
  }
  markHasAttachments(hasAttachments) {}
  get mime2DecodedAuthor() {
    return this.author;
  }
  get mime2DecodedSubject() {
    return this.subject;
  }
  get mime2DecodedRecipients() {
    return this.recipients;
  }
}

/**
 * Returns the WebExtension window type for the given window, or null, if it is
 * not supported.
 *
 * @param {DOMWindow} window - The window to check
 * @returns {[string]} - The WebExtension type of the window
 */
function getWebExtensionWindowType(window) {
  let { documentElement } = window.document;
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
    let type = getWebExtensionWindowType(window);
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
    let { documentElement } = window.document;
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
      for (let nextWin of Services.wm.getEnumerator(null)) {
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
    let builtInSpaces = [
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
            case "contentTab":
              let url = tabInfo.urlbar?.value;
              if (url == "about:accountsettings" || url == "about:addons") {
                // A secondary tab, that is related to this space.
                return 2;
              }
          }
          return 0;
        },
      },
    ];
    for (let builtInSpace of builtInSpaces) {
      this._add(builtInSpace);
    }
  }

  findSpaceForTab(tabInfo) {
    for (let spaceData of this._spaceData.values()) {
      if (spaceData.tabInSpace(tabInfo)) {
        return spaceData;
      }
    }
    return undefined;
  }

  _add(spaceData) {
    let spaceId = this._nextId++;
    let { spaceButtonId } = spaceData;
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
    let spaceButtonId = this._getSpaceButtonId(name, extension);
    return this.fromSpaceButtonId(spaceButtonId);
  }

  /**
   * Get the SpaceData for the space with the given spaceId.
   *
   * @param {integer} spaceId - id of the space as used by the tabs API
   * @returns {SpaceData}
   */
  fromSpaceId(spaceId) {
    let spaceButtonId = this._spaceIds.get(spaceId);
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
    let spaceButtonId = this._getSpaceButtonId(name, extension);
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
    let space = {
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
          onTabTitleChanged(aTab) {},
          onTabClosing(aTab) {},
          onTabPersist(aTab) {
            return aTab._ext.extensionSession;
          },
          onTabRestored(aTab, aState) {
            aTab._ext.extensionSession = aState;
          },
          onTabSwitched(aNewTab, aOldTab) {},
          onTabOpened(aTab) {},
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

    let window = browser.browsingContext.topChromeWindow;
    let tabmail = window.document.getElementById("tabmail");
    let tab = tabmail && tabmail.getTabForBrowser(browser);

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
    let browser = getTabBrowser(nativeTabInfo);
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
    let id = this._tabs.get(nativeTabInfo);
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
   * @param {Event} event - A DOM event to handle.
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

    let tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

    for (let nativeTabInfo of tabmail.tabInfo) {
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

    let tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

    for (let nativeTabInfo of tabmail.tabInfo) {
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
   * @param {NativeTabInfo} nativeTabInfo - The tab info which is being detached.
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
    let window = windowTracker.topWindow;
    let tabmail = window && window.document.getElementById("tabmail");
    return tabmail ? tabmail.selectedTab : window;
  }
}

tabTracker = new TabTracker();
spaceTracker = new SpaceTracker();
windowTracker = new WindowTracker();
Object.assign(global, { tabTracker, spaceTracker, windowTracker });

/**
 * Extension-specific wrapper around a Thunderbird tab. Note that for actual
 * tabs in the main window, some of these methods are overridden by the
 * TabmailTab subclass.
 */
class Tab extends TabBase {
  get spaceId() {
    let tabWindow = getTabWindow(this.nativeTab);
    if (getWebExtensionWindowType(tabWindow) != "normal") {
      return undefined;
    }

    let spaceData = spaceTracker.findSpaceForTab(this.nativeTab);
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
    let result = super.matches(queryInfo, context);

    let type = queryInfo.mailTab ? "mail" : queryInfo.type;
    if (result && type && this.type != type) {
      return false;
    }

    if (result && queryInfo.spaceId && this.spaceId != queryInfo.spaceId) {
      return false;
    }

    return result;
  }

  /** Adds the mailTab property and removes some useless properties from a tab object. */
  convert(fallback) {
    let result = super.convert(fallback);
    result.spaceId = this.spaceId;
    result.type = this.type;
    result.mailTab = result.type == "mail";

    // These properties are not useful to Thunderbird extensions and are not returned.
    for (let key of [
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
          let about3Pane = this.nativeTab.chromeBrowser.contentWindow;
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
      let tabmail = nativeTab.ownerDocument.getElementById("tabmail");
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
        let currentURI = this.nativeTab.browser.currentURI;
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
    let type = getWebExtensionWindowType(this.window);
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
    let { window } = this;
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
    let { tabManager } = this.extension;
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
    let { tabManager } = this.extension;
    return tabManager.getWrapper(this.window);
  }

  /**
   * Retrieves the tab at the given index.
   *
   * @param {number} index - The index to look at
   * @returns {Tab} The wrapped tab at the index
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
   * @param {number} index - The index to look at
   * @returns {Tab} The wrapped tab at the index
   */
  getTabAtIndex(index) {
    let { tabManager } = this.extension;
    let nativeTabInfo = this.tabmail.tabInfo[index];
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
   * @param {integer} tabId - The ID of the tab for which to return a wrapper.
   * @param {*} default_ - The value to return if no tab exists with the given ID.
   * @returns {Tab|*} The wrapped tab, or the default value
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
  canAccessTab(nativeTab) {
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
    let win = context.extension.windowManager.get(windowId, context);
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
      let obs = (observedWindow, topic, data) => {
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
  for (let tabInfo of window.gTabmail.tabInfo) {
    let { chromeBrowser, mode, closed } = tabInfo;
    if (!closed && mode.name == "mail3PaneTab") {
      await new Promise(resolve => {
        if (
          chromeBrowser.contentDocument.readyState == "complete" &&
          chromeBrowser.currentURI.spec == "about:3pane"
        ) {
          resolve();
        } else {
          chromeBrowser.contentWindow.addEventListener(
            "load",
            () => resolve(),
            {
              once: true,
            }
          );
        }
      });
    }
  }

  return window;
}

/**
 * Converts an nsIMsgAccount to a simple object
 *
 * @param {nsIMsgAccount} account
 * @returns {object}
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
    folders = traverseSubfolders(
      account.incomingServer.rootFolder,
      account.key
    ).subFolders;
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
 *
 * @param {nsIMsgAccount} account
 * @param {nsIMsgIdentity} identity
 * @returns {object}
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
 *
 * @returns {string}
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
  return path.split("/").map(decodeURIComponent).join("/");
}

/**
 * Convert a human-friendly path to a folder URI. This function does not assume
 * that the folder referenced exists.
 *
 * @returns {string}
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
        encodeURIComponent(p)
          .replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16))
          // We do not encode "+" chars in folder URIs. Manually convert them
          // back to literal + chars, otherwise folder lookup will fail.
          .replaceAll("%2B", "+")
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
 *     account. The value from nsIMsgDBHdr.accountKey must not be used here.
 * @returns {MailFolder}
 * @see mail/components/extensions/schemas/folders.json
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

  let flags = folder.flags;
  for (let [flag, typeName] of folderTypeMap.entries()) {
    if (flags & flag) {
      folderObject.type = typeName;
      // Exit the loop as soon as an entry was found.
      break;
    }
  }

  return folderObject;
}

/**
 * Converts an nsIMsgFolder and all its subfolders to a simple object for use in
 * API messages.
 *
 * @param {nsIMsgFolder} folder - The folder to convert.
 * @param {string} [accountId] - An optimization to avoid looking up the
 *     account. The value from nsIMsgDBHdr.accountKey must not be used here.
 * @returns {MailFolder}
 * @see mail/components/extensions/schemas/folders.json
 */
function traverseSubfolders(folder, accountId) {
  let f = convertFolder(folder, accountId);
  f.subFolders = [];
  if (folder.hasSubFolders) {
    // Use the same order as used by Thunderbird.
    let subFolders = [...folder.subFolders].sort((a, b) =>
      a.sortOrder == b.sortOrder
        ? a.name.localeCompare(b.name)
        : a.sortOrder - b.sortOrder
    );
    for (let subFolder of subFolders) {
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
 * Checks if the provided dummyMsgUrl belongs to an attached message.
 */
function isAttachedMessageUrl(dummyMsgUrl) {
  try {
    return dummyMsgUrl && new URL(dummyMsgUrl).searchParams.has("part");
  } catch (ex) {
    return false;
  }
}

/**
 * Converts an nsIMsgDBHdr to a simple object for use in messages.
 * This function WILL change as the API develops.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @param {ExtensionData} extension
 *
 * @returns {MessageHeader} MessageHeader object
 *
 * @see /mail/components/extensions/schemas/messages.json
 */
function convertMessage(msgHdr, extension) {
  if (!msgHdr) {
    return null;
  }

  const composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  // Cache msgHdr to reduce XPCOM requests.
  let cachedHdr = new CachedMsgHeader(msgHdr);

  let junkScore = parseInt(cachedHdr.getStringProperty("junkscore"), 10) || 0;
  let tags = (cachedHdr.getStringProperty("keywords") || "")
    .split(" ")
    .filter(MailServices.tags.isValidKey);

  // Getting the size of attached messages does not work consistently. For imap://
  // and mailbox:// messages the returned size in msgHdr.messageSize is 0, and for
  // file:// messages the returned size is always the total file size
  // Be consistent here and always return 0. The user can obtain the message size
  // from the size of the associated attachment file.
  let size = isAttachedMessageUrl(cachedHdr.getStringProperty("dummyMsgUrl"))
    ? 0
    : cachedHdr.messageSize;

  let messageObject = {
    id: messageTracker.getId(cachedHdr),
    date: new Date(Math.round(cachedHdr.date / 1000)),
    author: cachedHdr.mime2DecodedAuthor,
    recipients: cachedHdr.mime2DecodedRecipients
      ? composeFields.splitRecipients(cachedHdr.mime2DecodedRecipients, false)
      : [],
    ccList: cachedHdr.ccList
      ? composeFields.splitRecipients(cachedHdr.ccList, false)
      : [],
    bccList: cachedHdr.bccList
      ? composeFields.splitRecipients(cachedHdr.bccList, false)
      : [],
    subject: cachedHdr.mime2DecodedSubject,
    read: cachedHdr.isRead,
    new: !!(cachedHdr.flags & Ci.nsMsgMessageFlags.New),
    headersOnly: !!(cachedHdr.flags & Ci.nsMsgMessageFlags.Partial),
    flagged: !!cachedHdr.isFlagged,
    junk: junkScore >= gJunkThreshold,
    junkScore,
    headerMessageId: cachedHdr.messageId,
    size,
    tags,
    external: !cachedHdr.folder,
  };
  // convertMessage can be called without providing an extension, if the info is
  // needed for multiple extensions. The caller has to ensure that the folder info
  // is not forwarded to extensions, which do not have the required permission.
  if (
    cachedHdr.folder &&
    (!extension || extension.hasPermission("accountsRead"))
  ) {
    messageObject.folder = convertFolder(cachedHdr.folder);
  }
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
    this._dummyMessageHeaders = new Map();

    // nsIObserver
    Services.obs.addObserver(this, "quit-application-granted");
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

    this._messageOpenListener = {
      registered: false,
      async handleEvent(event) {
        let msgHdr = event.detail;
        // It is not possible to retrieve the dummyMsgHdr of messages opened
        // from file at a later time, track them manually.
        if (
          msgHdr &&
          !msgHdr.folder &&
          msgHdr.getStringProperty("dummyMsgUrl").startsWith("file://")
        ) {
          messageTracker.getId(msgHdr);
        }
      },
    };
    try {
      windowTracker.addListener("MsgLoaded", this._messageOpenListener);
      this._messageOpenListener.registered = true;
    } catch (ex) {
      // Fails during XPCSHELL tests, which mock the WindowWatcher but do not
      // implement registerNotification.
    }
  }

  cleanup() {
    // nsIObserver
    Services.obs.removeObserver(this, "quit-application-granted");
    Services.obs.removeObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.RemoveFolderListener(this);
    // nsIMsgFolderListener
    MailServices.mfn.removeListener(this);
    if (this._messageOpenListener.registered) {
      windowTracker.removeListener("MsgLoaded", this._messageOpenListener);
      this._messageOpenListener.registered = false;
    }
  }

  /**
   * Generates a hash for the given msgIdentifier.
   *
   * @param {*} msgIdentifier
   * @returns {string}
   */
  getHash(msgIdentifier) {
    if (msgIdentifier.folderURI) {
      return `folderURI:${msgIdentifier.folderURI}, messageKey: ${msgIdentifier.messageKey}`;
    }
    return `dummyMsgUrl:${msgIdentifier.dummyMsgUrl}, dummyMsgLastModifiedTime: ${msgIdentifier.dummyMsgLastModifiedTime}`;
  }

  /**
   * Maps the provided message identifier to the given messageTracker id.
   *
   * @param {integer} id - messageTracker id of the message
   * @param {*} msgIdentifier - msgIdentifier of the message
   * @param {nsIMsgDBHdr} [msgHdr] - optional msgHdr of the message, will be
   *   added to the cache if it is a dummy msgHdr (a file or attachment message)
   */
  _set(id, msgIdentifier, msgHdr) {
    let hash = this.getHash(msgIdentifier);
    this._messageIds.set(hash, id);
    this._messages.set(id, msgIdentifier);
    // Keep track of dummy message headers, which do not have a folder property
    // and cannot be retrieved later.
    if (msgHdr && !msgHdr.folder && msgIdentifier.dummyMsgUrl) {
      this._dummyMessageHeaders.set(
        msgIdentifier.dummyMsgUrl,
        msgHdr instanceof Ci.nsIMsgDBHdr ? new CachedMsgHeader(msgHdr) : msgHdr
      );
    }
  }

  /**
   * Lookup the messageTracker id for the given message identifier, return null
   * if not known.
   *
   * @param {*} msgIdentifier - msgIdentifier of the message
   * @returns {integer} The messageTracker id of the message.
   */
  _get(msgIdentifier) {
    let hash = this.getHash(msgIdentifier);
    if (this._messageIds.has(hash)) {
      return this._messageIds.get(hash);
    }
    return null;
  }

  /**
   * Removes the provided message identifier from the messageTracker.
   *
   * @param {*} msgIdentifier - msgIdentifier of the message
   */
  _remove(msgIdentifier) {
    let hash = this.getHash(msgIdentifier);
    let id = this._get(msgIdentifier);
    this._messages.delete(id);
    this._messageIds.delete(hash);
    this._dummyMessageHeaders.delete(msgIdentifier.dummyMsgUrl);
  }

  /**
   * Finds a message in the messageTracker or adds it.
   *
   * @param {nsIMsgDBHdr} - msgHdr of the requested message
   * @returns {integer} The messageTracker id of the message.
   */
  getId(msgHdr) {
    let msgIdentifier;
    if (msgHdr.folder) {
      msgIdentifier = {
        folderURI: msgHdr.folder.URI,
        messageKey: msgHdr.messageKey,
      };
    } else {
      // Normalize the dummyMsgUrl by sorting its parameters and striping them
      // to a minimum.
      let url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
      let parameters = Array.from(url.searchParams, p => p[0]).filter(
        p => !["group", "number", "key", "part"].includes(p)
      );
      for (let parameter of parameters) {
        url.searchParams.delete(parameter);
      }
      url.searchParams.sort();

      msgIdentifier = {
        dummyMsgUrl: url.href,
        dummyMsgLastModifiedTime: msgHdr.getUint32Property(
          "dummyMsgLastModifiedTime"
        ),
      };
    }

    let id = this._get(msgIdentifier);
    if (id) {
      return id;
    }
    id = this._nextId++;

    this._set(id, msgIdentifier, msgHdr);
    return id;
  }

  /**
   * Check if the provided msgIdentifier belongs to a modified file message.
   *
   * @param {*} msgIdentifier - msgIdentifier object of the message
   * @returns {boolean}
   */
  isModifiedFileMsg(msgIdentifier) {
    if (!msgIdentifier.dummyMsgUrl?.startsWith("file://")) {
      return false;
    }

    try {
      let file = Services.io
        .newURI(msgIdentifier.dummyMsgUrl)
        .QueryInterface(Ci.nsIFileURL).file;
      if (!file?.exists()) {
        throw new ExtensionError("File does not exist");
      }
      if (
        msgIdentifier.dummyMsgLastModifiedTime &&
        Math.floor(file.lastModifiedTime / 1000000) !=
          msgIdentifier.dummyMsgLastModifiedTime
      ) {
        throw new ExtensionError("File has been modified");
      }
    } catch (ex) {
      console.error(ex);
      return true;
    }
    return false;
  }

  /**
   * Retrieves a message from the messageTracker. If the message no longer,
   * exists it is removed from the messageTracker.
   *
   * @param {integer} id - messageTracker id of the message
   * @returns {nsIMsgDBHdr} The identifier of the message.
   */
  getMessage(id) {
    let msgIdentifier = this._messages.get(id);
    if (!msgIdentifier) {
      return null;
    }

    if (msgIdentifier.folderURI) {
      let folder = MailServices.folderLookup.getFolderForURL(
        msgIdentifier.folderURI
      );
      if (folder) {
        let msgHdr = folder.msgDatabase.getMsgHdrForKey(
          msgIdentifier.messageKey
        );
        if (msgHdr) {
          return msgHdr;
        }
      }
    } else {
      let msgHdr = this._dummyMessageHeaders.get(msgIdentifier.dummyMsgUrl);
      if (msgHdr && !this.isModifiedFileMsg(msgIdentifier)) {
        return msgHdr;
      }
    }

    this._remove(msgIdentifier);
    return null;
  }

  // nsIFolderListener

  onFolderPropertyFlagChanged(item, property, oldFlag, newFlag) {
    let changes = {};
    switch (property) {
      case "Status":
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.Read) {
          changes.read = item.isRead;
        }
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.New) {
          changes.new = !!(newFlag & Ci.nsMsgMessageFlags.New);
        }
        break;
      case "Flagged":
        changes.flagged = item.isFlagged;
        break;
      case "Keywords":
        {
          let tags = item.getStringProperty("keywords");
          tags = tags ? tags.split(" ") : [];
          changes.tags = tags.filter(MailServices.tags.isValidKey);
        }
        break;
    }
    if (Object.keys(changes).length) {
      this.emit("message-updated", item, changes);
    }
  }

  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
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
   * Finds all folders with new messages in the specified changedFolder and
   * returns those.
   *
   * @see MailNotificationManager._getFirstRealFolderWithNewMail()
   */
  findNewMessages(changedFolder) {
    let folders = changedFolder.descendants;
    folders.unshift(changedFolder);
    for (let folder of folders) {
      let flags = folder.flags;
      if (
        !(flags & Ci.nsMsgFolderFlags.Inbox) &&
        flags & (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual)
      ) {
        // Do not notify if the folder is not Inbox but one of
        // Drafts|Trash|SentMail|Templates|Junk|Archive|Queue or Virtual.
        continue;
      }
      let numNewMessages = folder.getNumNewMessages(false);
      if (!numNewMessages) {
        continue;
      }
      let msgDb = folder.msgDatabase;
      let newMsgKeys = msgDb.getNewList().slice(-numNewMessages);
      if (newMsgKeys.length == 0) {
        continue;
      }
      this.emit(
        "messages-received",
        folder,
        newMsgKeys.map(key => msgDb.getMsgHdrForKey(key))
      );
    }
  }

  // nsIMsgFolderListener

  msgsJunkStatusChanged(messages) {
    for (let msgHdr of messages) {
      let junkScore = parseInt(msgHdr.getStringProperty("junkscore"), 10) || 0;
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
      let oldId = this._get({
        folderURI: newMsgHdr.folder.URI,
        messageKey: oldKey,
      });
      let newId = this._get({
        folderURI: newMsgHdr.folder.URI,
        messageKey: newKey,
      });
      this._set(oldId, { folderURI: newMsgHdr.folder.URI, messageKey: newKey });
      this._set(newId, { folderURI: newMsgHdr.folder.URI, messageKey: oldKey });
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
        let id = this._get({
          folderURI: data.folderURI,
          messageKey: data.oldMessageKey,
        });
        if (id) {
          // Replace tracker entries.
          this._set(id, {
            folderURI: data.folderURI,
            messageKey: data.newMessageKey,
          });
        }
      }
    } else if (topic == "quit-application-granted") {
      this.cleanup();
    }
  }
})();

/**
 * Convenience class to handle message pages.
 */
class MessagePage {
  constructor() {
    this.messages = [];
    this.read = false;
    this._deferredPromise = new Promise(resolve => {
      this._resolveDeferredPromise = resolve;
    });
  }

  get promise() {
    return this._deferredPromise;
  }

  resolvePage() {
    this._resolveDeferredPromise(this.messages);
  }
}

/**
 * Convenience class to keep track of the status of message lists.
 */
class MessageList {
  constructor(extension) {
    this.messageListId = Services.uuid.generateUUID().number.substring(1, 37);
    this.extension = extension;
    this.isDone = false;
    this.pages = [];
    this.autoPaginatorTimeout = null;

    this.addPage();
  }

  addPage() {
    if (this.autoPaginatorTimeout) {
      clearTimeout(this.autoPaginatorTimeout);
      this.autoPaginatorTimeout = null;
    }

    if (this.isDone) {
      return;
    }

    // Adding a page will make this.currentPage point to the new page.
    let previousPage = this.currentPage;

    // If the current page has no messages, there is no need to add a page.
    if (previousPage && previousPage.messages.length == 0) {
      return;
    }

    this.pages.push(new MessagePage());
    // The previous page is finished and can be resolved.
    if (previousPage) {
      previousPage.resolvePage();
    }
  }

  get currentPage() {
    return this.pages.length > 0 ? this.pages[this.pages.length - 1] : null;
  }

  get id() {
    return this.messageListId;
  }

  addMessage(message) {
    if (this.isDone || !this.currentPage) {
      return;
    }
    if (this.currentPage.messages.length >= gMessagesPerPage) {
      this.addPage();
    }

    this.currentPage.messages.push(convertMessage(message, this.extension));

    // Automatically push a new page and return the page with this message after
    // a fixed amount of time, so that small sets of search results are not held
    // back until a full page has been found or the entire search has finished.
    if (!this.autoPaginatorTimeout) {
      this.autoPaginatorTimeout = setTimeout(this.addPage.bind(this), 1000);
    }
  }

  done() {
    if (this.isDone) {
      return;
    }
    this.isDone = true;

    // Resolve the current page.
    if (this.currentPage) {
      this.currentPage.resolvePage();
    }
  }

  async getNextUnreadPage() {
    let page = this.pages.find(p => !p.read);
    if (!page) {
      return null;
    }

    let messages = await page.promise;
    page.read = true;

    return {
      id: this.pages.find(p => !p.read) ? this.id : null,
      messages,
    };
  }
}

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
   * Takes an array or enumerator of messages and returns a Promise for the first
   * page, which will resolve as soon as it is available.
   *
   * @returns {object}
   */
  startList(messages, extension) {
    let messageList = this.createList(extension);
    this._addMessages(messages, messageList);
    return this.getNextPage(messageList);
  },

  /**
   * Add messages to a messageList.
   */
  async _addMessages(messages, messageList) {
    if (messageList.isDone) {
      return;
    }
    if (Array.isArray(messages)) {
      messages = this._createEnumerator(messages);
    }
    while (messages.hasMoreElements()) {
      let next = messages.getNext();
      messageList.addMessage(next.QueryInterface(Ci.nsIMsgDBHdr));
    }
    messageList.done();
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
   *
   * @returns {object}
   */
  createList(extension) {
    let messageList = new MessageList(extension);
    let lists = this._contextLists.get(extension);
    if (!lists) {
      lists = new Map();
      this._contextLists.set(extension, lists);
    }
    lists.set(messageList.id, messageList);
    return messageList;
  },

  /**
   * Returns the messageList object for a given id.
   *
   * @returns {object}
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
   *
   * @returns {object}
   */
  async getNextPage(messageList) {
    let page = await messageList.getNextUnreadPage();
    if (!page) {
      return null;
    }

    // If the page does not have an id, the list has been retrieved completely
    // and can be removed.
    if (!page.id) {
      let lists = this._contextLists.get(messageList.extension);
      if (lists && lists.has(messageList.id)) {
        lists.delete(messageList.id);
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

extensions.on("shutdown", (type, extension) => {
  messageListTracker._contextLists.delete(extension);
});
