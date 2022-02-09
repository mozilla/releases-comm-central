/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "DownloadPaths",
  "resource://gre/modules/DownloadPaths.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "PromiseUtils",
  "resource://gre/modules/PromiseUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailE10SUtils",
  "resource:///modules/MailE10SUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  clearInterval: "resource://gre/modules/Timer.jsm",
  setInterval: "resource://gre/modules/Timer.jsm",
});

XPCOMUtils.defineLazyGlobalGetters(this, ["IOUtils", "PathUtils"]);

XPCOMUtils.defineLazyGetter(this, "strBundle", function() {
  return Services.strings.createBundle(
    "chrome://global/locale/extensions.properties"
  );
});

var { ExtensionError } = ExtensionUtils;

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "FileReader"]);

// List of tab types supporting print and the required host permissions.
const tabs_supporting_print = {
  mail: "messagesRead",
  messageDisplay: "messagesRead",
  addressBook: "addressBooks",
  content: "activeTab",
};

/**
 * Returns a sanitized filename based on the provided toFileName or the title of
 * the provided tabBrowser.
 *
 * @param {String} toFileName - a file name
 * @param {DOMElement} tabBrowser - a browser
 * @returns {String} The sanitized file name
 */
function getSanitizedFileName(toFileName, tabBrowser) {
  let filename;
  if (toFileName !== null && toFileName != "") {
    filename = toFileName;
  } else if (tabBrowser.contentTitle != "") {
    filename = `${tabBrowser.contentTitle}.pdf`;
  } else {
    let url = new URL(tabBrowser.currentURI.spec);
    let path = decodeURIComponent(url.pathname);
    path = path.replace(/\/$/, "");
    filename = path.split("/").pop();
    if (filename == "") {
      filename = url.hostname;
    }
    filename = `${filename}.pdf`;
  }
  return DownloadPaths.sanitize(filename);
}

/**
 * @typedef {Object} PageSettings
 * @type {Object}
 * @property {integer} paperSizeUnit - The page size unit: 0 = inches, 1 = millimeters. Default: 0.
 * @property {number} paperWidth - The paper width in paper size units. Default: 8.5.
 * @property {number} paperHeight - The paper height in paper size units. Default: 11.0.
 * @property {integer} orientation - The page content orientation: 0 = portrait, 1 = landscape. Default: 0.
 * @property {number} scaling - The page content scaling factor: 1.0 = 100% = normal size. Default: 1.0.
 * @property {boolean} shrinkToFit - Whether the page content should shrink to fit the page width (overrides scaling). Default: true.
 * @property {boolean} showBackgroundColors - Whether the page background colors should be shown. Default: false.
 * @property {boolean} showBackgroundImages - Whether the page background images should be shown. Default: false.
 * @property {number} edgeLeft - The spacing between the left header/footer and the left edge of the paper (inches). Default: 0.
 * @property {number} edgeRight - The spacing between the right header/footer and the right edge of the paper (inches). Default: 0.
 * @property {number} edgeTop - The spacing between the top of the headers and the top edge of the paper (inches). Default: 0.
 * @property {number} edgeBottom - The spacing between the bottom of the footers and the bottom edge of the paper (inches). Default: 0.
 * @property {number} marginLeft - The margin between the page content and the left edge of the paper (inches). Default: 0.5.
 * @property {number} marginRight - The margin between the page content and the right edge of the paper (inches). Default: 0.5.
 * @property {number} marginTop - The margin between the page content and the top edge of the paper (inches). Default: 0.5.
 * @property {number} marginBottom - The margin between the page content and the bottom edge of the paper (inches). Default: 0.5.
 * @property {string} headerLeft - The text for the page's left header. Default: '&T'.
 * @property {string} headerCenter - The text for the page's center header. Default: ''.
 * @property {string} headerRight - The text for the page's right header. Default: '&U'.
 * @property {string} footerLeft - The text for the page's left footer. Default: '&PT'.
 * @property {string} footerCenter - The text for the page's center footer. Default: ''.
 * @property {string} footerRight - The text for the page's right footer. Default: '&D'.
 */

/**
 * Returns a nsIPrintSettings with default values needed for PDF print, also
 * applying custom user provided settings.
 *
 * @param {String} path - path to a temporary file in the local filesystem to
 *   store the PDF
 * @param {PageSettings} pageSettings - custom page settings
 * @returns {nsIPrintSettings}
 */
function getPDFPrintSettings(path, pageSettings) {
  let psService = Cc["@mozilla.org/gfx/printsettings-service;1"].getService(
    Ci.nsIPrintSettingsService
  );
  let printSettings = psService.newPrintSettings;

  printSettings.printerName = "";
  printSettings.isInitializedFromPrinter = true;
  printSettings.isInitializedFromPrefs = true;

  printSettings.printToFile = true;
  printSettings.toFileName = path;

  printSettings.printSilent = true;

  printSettings.outputFormat = Ci.nsIPrintSettings.kOutputFormatPDF;

  if (pageSettings.paperSizeUnit !== null) {
    printSettings.paperSizeUnit = pageSettings.paperSizeUnit;
  }
  if (pageSettings.paperWidth !== null) {
    printSettings.paperWidth = pageSettings.paperWidth;
  }
  if (pageSettings.paperHeight !== null) {
    printSettings.paperHeight = pageSettings.paperHeight;
  }
  if (pageSettings.orientation !== null) {
    printSettings.orientation = pageSettings.orientation;
  }
  if (pageSettings.scaling !== null) {
    printSettings.scaling = pageSettings.scaling;
  }
  if (pageSettings.shrinkToFit !== null) {
    printSettings.shrinkToFit = pageSettings.shrinkToFit;
  }
  if (pageSettings.showBackgroundColors !== null) {
    printSettings.printBGColors = pageSettings.showBackgroundColors;
  }
  if (pageSettings.showBackgroundImages !== null) {
    printSettings.printBGImages = pageSettings.showBackgroundImages;
  }
  if (pageSettings.edgeLeft !== null) {
    printSettings.edgeLeft = pageSettings.edgeLeft;
  }
  if (pageSettings.edgeRight !== null) {
    printSettings.edgeRight = pageSettings.edgeRight;
  }
  if (pageSettings.edgeTop !== null) {
    printSettings.edgeTop = pageSettings.edgeTop;
  }
  if (pageSettings.edgeBottom !== null) {
    printSettings.edgeBottom = pageSettings.edgeBottom;
  }
  if (pageSettings.marginLeft !== null) {
    printSettings.marginLeft = pageSettings.marginLeft;
  }
  if (pageSettings.marginRight !== null) {
    printSettings.marginRight = pageSettings.marginRight;
  }
  if (pageSettings.marginTop !== null) {
    printSettings.marginTop = pageSettings.marginTop;
  }
  if (pageSettings.marginBottom !== null) {
    printSettings.marginBottom = pageSettings.marginBottom;
  }
  if (pageSettings.headerLeft !== null) {
    printSettings.headerStrLeft = pageSettings.headerLeft;
  }
  if (pageSettings.headerCenter !== null) {
    printSettings.headerStrCenter = pageSettings.headerCenter;
  }
  if (pageSettings.headerRight !== null) {
    printSettings.headerStrRight = pageSettings.headerRight;
  }
  if (pageSettings.footerLeft !== null) {
    printSettings.footerStrLeft = pageSettings.footerLeft;
  }
  if (pageSettings.footerCenter !== null) {
    printSettings.footerStrCenter = pageSettings.footerCenter;
  }
  if (pageSettings.footerRight !== null) {
    printSettings.footerStrRight = pageSettings.footerRight;
  }
  return printSettings;
}

/**
 * A listener that allows waiting until tabs are fully loaded, e.g. off of about:blank.
 */
let tabListener = {
  tabReadyInitialized: false,
  tabReadyPromises: new WeakMap(),
  initializingTabs: new WeakSet(),

  /**
   * Initialize the progress listener for tab ready changes.
   */
  initTabReady() {
    if (!this.tabReadyInitialized) {
      windowTracker.addListener("progress", this);

      this.tabReadyInitialized = true;
    }
  },

  /**
   * Web Progress listener method for the location change.
   *
   * @param {Element} browser               The browser element that caused the change
   * @param {nsIWebProgress} webProgress    The web progress for the location change
   * @param {nsIRequest} request            The xpcom request for this change
   * @param {nsIURI} locationURI            The target uri
   * @param {Integer} flags                 The web progress flags for this change
   */
  onLocationChange(browser, webProgress, request, locationURI, flags) {
    if (webProgress && webProgress.isTopLevel) {
      let tabmail = browser.ownerDocument.getElementById("tabmail");
      let nativeTabInfo = tabmail.getTabForBrowser(browser);

      // Now we are certain that the first page in the tab was loaded.
      this.initializingTabs.delete(nativeTabInfo);

      // browser.innerWindowID is now set, resolve the promises if any.
      let deferred = this.tabReadyPromises.get(nativeTabInfo);
      if (deferred) {
        deferred.resolve(nativeTabInfo);
        this.tabReadyPromises.delete(nativeTabInfo);
      }
    }
  },

  /**
   * Promise that the given tab completes loading.
   *
   * @param {NativeTabInfo} nativeTabInfo       The tabInfo describing the tab
   * @return {Promise<NativeTabInfo>}           Resolves when the tab completes loading
   */
  awaitTabReady(nativeTabInfo) {
    let deferred = this.tabReadyPromises.get(nativeTabInfo);
    if (!deferred) {
      deferred = PromiseUtils.defer();
      let browser = getTabBrowser(nativeTabInfo);
      if (
        !this.initializingTabs.has(nativeTabInfo) &&
        (browser.innerWindowID ||
          ["about:blank", "about:blank?compose"].includes(
            browser.currentURI.spec
          ))
      ) {
        deferred.resolve(nativeTabInfo);
      } else {
        this.initTabReady();
        this.tabReadyPromises.set(nativeTabInfo, deferred);
      }
    }
    return deferred.promise;
  },
};

// Attributes and properties used in the TabsUpdateFilterManager.
const allAttrs = new Set(["favIconUrl", "title"]);
const allProperties = new Set(["favIconUrl", "status", "title"]);
const restricted = new Set(["url", "favIconUrl", "title"]);

/**
 * An EventManager for the tabs.onUpdated listener.
 */
class TabsUpdateFilterEventManager extends EventManager {
  constructor({ context }) {
    let { extension } = context;
    let { tabManager } = extension;

    let register = (fire, filterProps) => {
      let filter = { ...filterProps };
      if (filter.urls) {
        filter.urls = new MatchPatternSet(filter.urls);
      }
      let needsModified = true;
      if (filter.properties) {
        // Default is to listen for all events.
        needsModified = filter.properties.some(prop => allAttrs.has(prop));
        filter.properties = new Set(filter.properties);
      } else {
        filter.properties = allProperties;
      }

      function sanitize(changeInfo) {
        let result = {};
        let nonempty = false;
        let hasTabs = extension.hasPermission("tabs");
        for (let prop in changeInfo) {
          if (hasTabs || !restricted.has(prop)) {
            nonempty = true;
            result[prop] = changeInfo[prop];
          }
        }
        return nonempty && result;
      }

      function getWindowID(windowId) {
        if (windowId === WindowBase.WINDOW_ID_CURRENT) {
          return windowTracker.getId(windowTracker.topWindow);
        }
        return windowId;
      }

      function matchFilters(tab, changed) {
        if (!filterProps) {
          return true;
        }
        if (filter.tabId != null && tab.id != filter.tabId) {
          return false;
        }
        if (
          filter.windowId != null &&
          tab.windowId != getWindowID(filter.windowId)
        ) {
          return false;
        }
        if (filter.urls) {
          // We check permission first because tab.uri is null if !hasTabPermission.
          return tab.hasTabPermission && filter.urls.matches(tab.uri);
        }
        return true;
      }

      let fireForTab = (tab, changed) => {
        if (!matchFilters(tab, changed)) {
          return;
        }

        let changeInfo = sanitize(changed);
        if (changeInfo) {
          fire.async(tab.id, changeInfo, tab.convert());
        }
      };

      let listener = event => {
        let changeInfo = {};
        let tab = tabManager.getWrapper(event.detail.tabInfo);
        let changed = event.detail.changed;
        if (
          changed.includes("favIconUrl") &&
          filter.properties.has("favIconUrl")
        ) {
          changeInfo.favIconUrl = tab.favIconUrl;
        }
        if (changed.includes("label") && filter.properties.has("title")) {
          changeInfo.title = tab.title;
        }

        fireForTab(tab, changeInfo);
      };

      let statusListener = ({ browser, status, url }) => {
        let tabmail = browser.ownerDocument.getElementById("tabmail");
        let nativeTabInfo = tabmail.getTabForBrowser(browser);
        if (nativeTabInfo) {
          let changed = { status };
          if (url) {
            changed.url = url;
          }

          fireForTab(tabManager.getWrapper(nativeTabInfo), changed);
        }
      };

      if (needsModified) {
        windowTracker.addListener("TabAttrModified", listener);
      }

      if (filter.properties.has("status")) {
        windowTracker.addListener("status", statusListener);
      }

      return () => {
        if (needsModified) {
          windowTracker.removeListener("TabAttrModified", listener);
        }
        if (filter.properties.has("status")) {
          windowTracker.removeListener("status", statusListener);
        }
      };
    };

    super({
      context,
      name: "tabs.onUpdated",
      register,
    });
  }

  addListener(callback, filter) {
    let { extension } = this.context;
    if (
      filter &&
      filter.urls &&
      !extension.hasPermission("tabs") &&
      !extension.hasPermission("activeTab")
    ) {
      Cu.reportError(
        'Url filtering in tabs.onUpdated requires "tabs" or "activeTab" permission.'
      );
      return false;
    }
    return super.addListener(callback, filter);
  }
}

this.tabs = class extends ExtensionAPI {
  getAPI(context) {
    let { extension } = context;
    let { tabManager } = extension;

    /**
     * Gets the tab for the given tab id, or the active tab if the id is null.
     *
     * @param {?Integer} tabId          The tab id to get
     * @return {Tab}                    The matching tab, or the active tab
     */
    function getTabOrActive(tabId) {
      if (tabId) {
        return tabTracker.getTab(tabId);
      }
      return tabTracker.activeTab;
    }

    /**
     * Promise that the tab with the given tab id is ready.
     *
     * @param {Integer} tabId       The tab id to check
     * @return {Promise<NativeTabInfo>}     Resolved when the loading is complete
     */
    async function promiseTabWhenReady(tabId) {
      let tab;
      if (tabId === null) {
        tab = tabManager.getWrapper(tabTracker.activeTab);
      } else {
        tab = tabManager.get(tabId);
      }

      await tabListener.awaitTabReady(tab.nativeTab);

      return tab;
    }

    return {
      tabs: {
        onActivated: new EventManager({
          context,
          name: "tabs.onActivated",
          register: fire => {
            let listener = (eventName, event) => {
              fire.async(event);
            };

            tabTracker.on("tab-activated", listener);
            return () => {
              tabTracker.off("tab-activated", listener);
            };
          },
        }).api(),

        onCreated: new EventManager({
          context,
          name: "tabs.onCreated",
          register: fire => {
            let listener = (eventName, event) => {
              fire.async(
                tabManager.convert(event.nativeTabInfo, event.currentTab)
              );
            };

            tabTracker.on("tab-created", listener);
            return () => {
              tabTracker.off("tab-created", listener);
            };
          },
        }).api(),

        onAttached: new EventManager({
          context,
          name: "tabs.onAttached",
          register: fire => {
            let listener = (eventName, event) => {
              fire.async(event.tabId, {
                newWindowId: event.newWindowId,
                newPosition: event.newPosition,
              });
            };

            tabTracker.on("tab-attached", listener);
            return () => {
              tabTracker.off("tab-attached", listener);
            };
          },
        }).api(),

        onDetached: new EventManager({
          context,
          name: "tabs.onDetached",
          register: fire => {
            let listener = (eventName, event) => {
              fire.async(event.tabId, {
                oldWindowId: event.oldWindowId,
                oldPosition: event.oldPosition,
              });
            };

            tabTracker.on("tab-detached", listener);
            return () => {
              tabTracker.off("tab-detached", listener);
            };
          },
        }).api(),

        onRemoved: new EventManager({
          context,
          name: "tabs.onRemoved",
          register: fire => {
            let listener = (eventName, event) => {
              fire.async(event.tabId, {
                windowId: event.windowId,
                isWindowClosing: event.isWindowClosing,
              });
            };

            tabTracker.on("tab-removed", listener);
            return () => {
              tabTracker.off("tab-removed", listener);
            };
          },
        }).api(),

        onMoved: new EventManager({
          context,
          name: "tabs.onMoved",
          register: fire => {
            let moveListener = event => {
              let nativeTab = event.target;
              let nativeTabInfo = event.detail.tabInfo;
              let tabmail = nativeTab.ownerDocument.getElementById("tabmail");

              fire.async(tabTracker.getId(nativeTabInfo), {
                windowId: windowTracker.getId(nativeTab.ownerGlobal),
                fromIndex: event.detail.idx,
                toIndex: tabmail.tabInfo.indexOf(nativeTabInfo),
              });
            };

            windowTracker.addListener("TabMove", moveListener);
            return () => {
              windowTracker.removeListener("TabMove", moveListener);
            };
          },
        }).api(),

        onUpdated: new TabsUpdateFilterEventManager({ context }).api(),

        async create(createProperties) {
          let window = await new Promise((resolve, reject) => {
            let window =
              createProperties.windowId === null
                ? windowTracker.topNormalWindow
                : windowTracker.getWindow(createProperties.windowId, context);
            let { gMailInit } = window;
            if (!gMailInit || !gMailInit.delayedStartupFinished) {
              let obs = (finishedWindow, topic, data) => {
                if (finishedWindow != window) {
                  return;
                }
                Services.obs.removeObserver(
                  obs,
                  "mail-delayed-startup-finished"
                );
                resolve(window);
              };
              Services.obs.addObserver(obs, "mail-delayed-startup-finished");
            } else {
              resolve(window);
            }
          });
          let tabmail = window.document.getElementById("tabmail");

          let url;
          if (createProperties.url) {
            url = context.uri.resolve(createProperties.url);

            if (!context.checkLoadURL(url, { dontReportErrors: true })) {
              return Promise.reject({ message: `Illegal URL: ${url}` });
            }
          }

          let currentTab = tabmail.selectedTab;

          let active = true;
          if (createProperties.active) {
            active = createProperties.active;
          }

          tabListener.initTabReady();

          let nativeTabInfo = tabmail.openTab("contentTab", {
            url: url || "about:blank",
            linkHandler: null,
            background: !active,
            initialBrowsingContextGroupId:
              context.extension.policy.browsingContextGroupId,
            principal: context.extension.principal,
          });

          if (createProperties.index) {
            tabmail.moveTabTo(nativeTabInfo, createProperties.index);
            tabmail.updateCurrentTab();
          }

          if (createProperties.url && createProperties.url !== "about:blank") {
            // Mark tabs as initializing, so operations like `executeScript` wait until the
            // requested URL is loaded.
            tabListener.initializingTabs.add(nativeTabInfo);
          }

          return tabManager.convert(nativeTabInfo, currentTab);
        },

        async remove(tabs) {
          if (!Array.isArray(tabs)) {
            tabs = [tabs];
          }

          for (let tabId of tabs) {
            let nativeTabInfo = tabTracker.getTab(tabId);
            if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
              nativeTabInfo.close();
              continue;
            }
            let tabmail = getTabTabmail(nativeTabInfo);
            tabmail.closeTab(nativeTabInfo);
          }
        },

        async update(tabId, updateProperties) {
          let nativeTabInfo = getTabOrActive(tabId);
          if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
            throw new ExtensionError(
              "tabs.update is not applicable to this tab."
            );
          }
          let tabmail = getTabTabmail(nativeTabInfo);

          if (updateProperties.url) {
            let browser = getTabBrowser(nativeTabInfo);
            if (!browser) {
              throw new ExtensionError("Cannot set a URL for this tab.");
            }
            let url = context.uri.resolve(updateProperties.url);

            if (!context.checkLoadURL(url, { dontReportErrors: true })) {
              return Promise.reject({ message: `Illegal URL: ${url}` });
            }

            let options = {
              flags: updateProperties.loadReplace
                ? Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY
                : Ci.nsIWebNavigation.LOAD_FLAGS_NONE,
              triggeringPrincipal: context.principal,
            };
            MailE10SUtils.loadURI(browser, url, options);
          }

          if (updateProperties.active) {
            if (updateProperties.active) {
              tabmail.selectedTab = nativeTabInfo;
            } else {
              // Not sure what to do here? Which tab should we select?
            }
          }

          return tabManager.convert(nativeTabInfo);
        },

        async reload(tabId, reloadProperties) {
          let nativeTabInfo = getTabOrActive(tabId);
          if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
            throw new ExtensionError(
              "tabs.reload is not applicable to this tab."
            );
          }
          let browser = getTabBrowser(nativeTabInfo);

          let flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
          if (reloadProperties && reloadProperties.bypassCache) {
            flags |= Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
          }
          browser.reloadWithFlags(flags);
        },

        async get(tabId) {
          return tabManager.get(tabId).convert();
        },

        getCurrent() {
          let tabData;
          if (context.tabId) {
            tabData = tabManager.get(context.tabId).convert();
          }
          return Promise.resolve(tabData);
        },

        async query(queryInfo) {
          if (!extension.hasPermission("tabs")) {
            if (queryInfo.url !== null || queryInfo.title !== null) {
              return Promise.reject({
                message:
                  'The "tabs" permission is required to use the query API with the "url" or "title" parameters',
              });
            }
          }

          // Make ext-tabs-base happy since it does a strict check.
          queryInfo.cookieStoreId = null;
          queryInfo.screen = null;

          return Array.from(tabManager.query(queryInfo, context), tab =>
            tab.convert()
          );
        },

        async executeScript(tabId, details) {
          let tab = await promiseTabWhenReady(tabId);
          return tab.executeScript(context, details);
        },

        async insertCSS(tabId, details) {
          let tab = await promiseTabWhenReady(tabId);
          return tab.insertCSS(context, details);
        },

        async removeCSS(tabId, details) {
          let tab = await promiseTabWhenReady(tabId);
          return tab.removeCSS(context, details);
        },

        async move(tabIds, moveProperties) {
          let tabsMoved = [];
          if (!Array.isArray(tabIds)) {
            tabIds = [tabIds];
          }

          let destinationWindow = null;
          if (moveProperties.windowId !== null) {
            destinationWindow = windowTracker.getWindow(
              moveProperties.windowId
            );
            // Fail on an invalid window.
            if (!destinationWindow) {
              return Promise.reject({
                message: `Invalid window ID: ${moveProperties.windowId}`,
              });
            }
          }

          /*
            Indexes are maintained on a per window basis so that a call to
              move([tabA, tabB], {index: 0})
                -> tabA to 0, tabB to 1 if tabA and tabB are in the same window
              move([tabA, tabB], {index: 0})
                -> tabA to 0, tabB to 0 if tabA and tabB are in different windows
          */
          let indexMap = new Map();
          let lastInsertion = new Map();

          let tabs = tabIds.map(tabId => tabTracker.getTab(tabId));
          for (let nativeTabInfo of tabs) {
            if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
              throw new ExtensionError(
                "tabs.move is not applicable to this tab."
              );
            }

            // If the window is not specified, use the window from the tab.
            let browser = getTabBrowser(nativeTabInfo);

            let srcwindow = browser.ownerGlobal;
            let tgtwindow = destinationWindow || browser.ownerGlobal;
            let tgttabmail = tgtwindow.document.getElementById("tabmail");
            let srctabmail = srcwindow.document.getElementById("tabmail");

            // If we are not moving the tab to a different window, and the window
            // only has one tab, do nothing.
            if (srcwindow == tgtwindow && srctabmail.tabInfo.length === 1) {
              continue;
            }

            let insertionPoint =
              indexMap.get(tgtwindow) || moveProperties.index;
            // If the index is -1 it should go to the end of the tabs.
            if (insertionPoint == -1) {
              insertionPoint = tgttabmail.tabInfo.length;
            }

            let tabPosition = srctabmail.tabInfo.indexOf(nativeTabInfo);

            // If this is not the first tab to be inserted into this window and
            // the insertion point is the same as the last insertion and
            // the tab is further to the right than the current insertion point
            // then you need to bump up the insertion point. See bug 1323311.
            if (
              lastInsertion.has(tgtwindow) &&
              lastInsertion.get(tgtwindow) === insertionPoint &&
              tabPosition > insertionPoint
            ) {
              insertionPoint++;
              indexMap.set(tgtwindow, insertionPoint);
            }

            if (srcwindow == tgtwindow) {
              // If the window we are moving is the same, just move the tab.
              tgttabmail.moveTabTo(nativeTabInfo, insertionPoint);
            } else {
              // If the window we are moving the tab in is different, then move the tab
              // to the new window.
              srctabmail.replaceTabWithWindow(
                nativeTabInfo,
                tgtwindow,
                insertionPoint
              );
              nativeTabInfo =
                tgttabmail.tabInfo[insertionPoint] ||
                tgttabmail.tabInfo[tgttabmail.tabInfo.length - 1];
            }
            lastInsertion.set(tgtwindow, tabPosition);
            tabsMoved.push(nativeTabInfo);
          }

          return tabsMoved.map(nativeTabInfo =>
            tabManager.convert(nativeTabInfo)
          );
        },

        duplicate(tabId) {
          let nativeTabInfo = tabTracker.getTab(tabId);
          if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
            throw new ExtensionError(
              "tabs.duplicate is not applicable to this tab."
            );
          }
          let browser = getTabBrowser(nativeTabInfo);
          let tabmail = browser.ownerDocument.getElementById("tabmail");

          // This is our best approximation of duplicating tabs. It might produce unreliable results
          let state = tabmail.persistTab(nativeTabInfo);
          let mode = tabmail.tabModes[state.mode];
          state.state.duplicate = true;

          if (mode.tabs.length && mode.tabs.length == mode.maxTabs) {
            throw new ExtensionError(
              `Maximum number of ${state.mode} tabs reached`
            );
          } else {
            tabmail.restoreTab(state);
            return tabManager.convert(mode.tabs[mode.tabs.length - 1]);
          }
        },

        print() {
          let nativeTabInfo = getTabOrActive(null);
          let tabType = tabManager.wrapTab(nativeTabInfo).type;
          if (!tabs_supporting_print[tabType]) {
            throw new ExtensionError(
              "tabs.print() is not applicable to this tab."
            );
          }

          let tabBrowser = getTabBrowser(nativeTabInfo);
          let { PrintUtils } = getTabWindow(nativeTabInfo);
          PrintUtils.startPrintWindow(tabBrowser.browsingContext);
        },

        saveAsPDF(pageSettings) {
          let nativeTabInfo = getTabOrActive(null);
          let tabType = tabManager.wrapTab(nativeTabInfo).type;
          if (!tabs_supporting_print[tabType]) {
            throw new ExtensionError(
              "tabs.saveAsPDF() is not applicable to this tab."
            );
          }

          let tabBrowser = getTabBrowser(nativeTabInfo);
          let filename = getSanitizedFileName(
            pageSettings.toFileName,
            tabBrowser
          );

          let picker = Cc["@mozilla.org/filepicker;1"].createInstance(
            Ci.nsIFilePicker
          );
          let title = strBundle.GetStringFromName(
            "saveaspdf.saveasdialog.title"
          );

          picker.init(tabBrowser.ownerGlobal, title, Ci.nsIFilePicker.modeSave);
          picker.appendFilter("PDF", "*.pdf");
          picker.defaultExtension = "pdf";
          picker.defaultString = filename;

          return new Promise(resolve => {
            picker.open(function(retval) {
              if (retval == 0 || retval == 2) {
                // OK clicked (retval == 0) or replace confirmed (retval == 2)

                // Workaround: When trying to replace an existing file that is
                // open in another application (i.e. a locked file), the print
                // progress listener is never called. This workaround ensures
                // that a correct status is always returned.
                try {
                  let fstream = Cc[
                    "@mozilla.org/network/file-output-stream;1"
                  ].createInstance(Ci.nsIFileOutputStream);
                  // ioflags = write|create|truncate, file permissions = rw-rw-rw-
                  fstream.init(picker.file, 0x2a, 0o666, 0);
                  fstream.close();
                } catch (e) {
                  resolve(retval == 0 ? "not_saved" : "not_replaced");
                  return;
                }

                let printSettings = getPDFPrintSettings(
                  picker.file.path,
                  pageSettings
                );

                tabBrowser.browsingContext
                  .print(printSettings)
                  .then(() => resolve(retval == 0 ? "saved" : "replaced"))
                  .catch(() =>
                    resolve(retval == 0 ? "not_saved" : "not_replaced")
                  );
              } else {
                // Cancel clicked (retval == 1)
                resolve("canceled");
              }
            });
          });
        },

        async getAsPDF(pageSettings, tabId) {
          let nativeTabInfo = getTabOrActive(tabId);
          let tabType = tabManager.wrapTab(nativeTabInfo).type;
          // Check for required host permissions.
          if (tabs_supporting_print[tabType]) {
            if (!extension.hasPermission(tabs_supporting_print[tabType])) {
              throw new ExtensionError(
                `tabs.getAsPDF() requires the ${tabs_supporting_print[tabType]} permission to get the content this tab as PDF.`
              );
            }
          } else {
            throw new ExtensionError(
              "tabs.getAsPDF() is not applicable to this tab."
            );
          }

          let tabBrowser = getTabBrowser(nativeTabInfo);
          let filename = getSanitizedFileName(
            pageSettings.toFileName,
            tabBrowser
          );

          let pathTempDir = await PathUtils.getTempDir();
          let pathTempFile = await IOUtils.createUniqueFile(
            pathTempDir,
            "PrintToPDF.pdf",
            0o666
          );

          let tempFile = Cc["@mozilla.org/file/local;1"].createInstance(
            Ci.nsIFile
          );
          tempFile.initWithPath(pathTempFile);
          let extAppLauncher = Cc["@mozilla.org/mime;1"].getService(
            Ci.nsPIExternalAppLauncher
          );
          extAppLauncher.deleteTemporaryFileOnExit(tempFile);

          let printSettings = getPDFPrintSettings(pathTempFile, pageSettings);
          await tabBrowser.browsingContext.print(printSettings);

          // Bug 1603739 - With e10s enabled the promise returned by print() resolves
          // too early, which means the file hasn't been completely written.
          await new Promise(resolve => {
            const DELAY_CHECK_FILE_COMPLETELY_WRITTEN = 100;

            let lastSize = 0;
            const timerId = setInterval(async () => {
              const fileInfo = await IOUtils.stat(pathTempFile);
              if (lastSize > 0 && fileInfo.size == lastSize) {
                clearInterval(timerId);
                resolve();
              }
              lastSize = fileInfo.size;
            }, DELAY_CHECK_FILE_COMPLETELY_WRITTEN);
          });

          return File.createFromNsIFile(tempFile, { name: filename });
        },
      },
    };
  }
};
