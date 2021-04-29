/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
var { ExtensionError } = ExtensionUtils;

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
        let needed = [];
        if (event.type == "TabAttrModified") {
          let changed = event.detail.changed;
          if (
            changed.includes("image") &&
            filter.properties.has("favIconUrl")
          ) {
            needed.push("favIconUrl");
          }
          if (changed.includes("label") && filter.properties.has("title")) {
            needed.push("title");
          }
        }

        let tab = tabManager.getWrapper(event.detail.tabInfo);

        let changeInfo = {};
        for (let prop of needed) {
          changeInfo[prop] = tab[prop];
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
      },
    };
  }
};
