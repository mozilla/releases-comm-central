/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  PromiseUtils: "resource://gre/modules/PromiseUtils.sys.mjs",
});
ChromeUtils.defineModuleGetter(
  this,
  "MailE10SUtils",
  "resource:///modules/MailE10SUtils.jsm"
);

var { ExtensionError } = ExtensionUtils;

/**
 * A listener that allows waiting until tabs are fully loaded, e.g. off of about:blank.
 */
const tabListener = {
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
   * @param {Element} browser - The browser element that caused the change
   * @param {nsIWebProgress} webProgress - The web progress for the location change
   * @param {nsIRequest} request - The xpcom request for this change
   * @param {nsIURI} locationURI - The target uri
   * @param {Integer} flags - The web progress flags for this change
   */
  onLocationChange(browser, webProgress, request, locationURI, flags) {
    if (webProgress && webProgress.isTopLevel) {
      const window = browser.ownerGlobal.top;
      const tabmail = window.document.getElementById("tabmail");
      const nativeTabInfo = tabmail
        ? tabmail.getTabForBrowser(browser)
        : window;

      // Now we are certain that the first page in the tab was loaded.
      this.initializingTabs.delete(nativeTabInfo);

      // browser.innerWindowID is now set, resolve the promises if any.
      const deferred = this.tabReadyPromises.get(nativeTabInfo);
      if (deferred) {
        deferred.resolve(nativeTabInfo);
        this.tabReadyPromises.delete(nativeTabInfo);
      }
    }
  },

  /**
   * Promise that the given tab completes loading.
   *
   * @param {NativeTabInfo} nativeTabInfo - the tabInfo describing the tab
   * @returns {Promise<NativeTabInfo>} - resolves when the tab completes loading
   */
  awaitTabReady(nativeTabInfo) {
    let deferred = this.tabReadyPromises.get(nativeTabInfo);
    if (!deferred) {
      deferred = PromiseUtils.defer();
      const browser = getTabBrowser(nativeTabInfo);
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

const hasWebHandlerApp = protocol => {
  const protoInfo = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService)
    .getProtocolHandlerInfo(protocol);
  const appHandlers = protoInfo.possibleApplicationHandlers;
  for (let i = 0; i < appHandlers.length; i++) {
    const handler = appHandlers.queryElementAt(i, Ci.nsISupports);
    if (handler instanceof Ci.nsIWebHandlerApp) {
      return true;
    }
  }
  return false;
};

// Attributes and properties used in the TabsUpdateFilterManager.
const allAttrs = new Set(["favIconUrl", "title"]);
const allProperties = new Set(["favIconUrl", "status", "title"]);
const restricted = new Set(["url", "favIconUrl", "title"]);

this.tabs = class extends ExtensionAPIPersistent {
  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    for (const window of Services.wm.getEnumerator("mail:3pane")) {
      const tabmail = window.document.getElementById("tabmail");
      for (let i = tabmail.tabInfo.length; i > 0; i--) {
        const nativeTabInfo = tabmail.tabInfo[i - 1];
        const uri = nativeTabInfo.browser?.browsingContext.currentURI;
        if (
          uri &&
          uri.scheme == "moz-extension" &&
          uri.host == this.extension.uuid
        ) {
          tabmail.closeTab(nativeTabInfo);
        }
      }
    }
  }

  tabEventRegistrar({ tabEvent, listener }) {
    const { extension } = this;
    const { tabManager } = extension;
    return ({ context, fire }) => {
      const listener2 = async (eventName, event, ...args) => {
        if (!tabManager.canAccessTab(event.nativeTab)) {
          return;
        }
        if (fire.wakeup) {
          await fire.wakeup();
        }
        listener({ context, fire, event }, ...args);
      };
      tabTracker.on(tabEvent, listener2);
      return {
        unregister() {
          tabTracker.off(tabEvent, listener2);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    };
  }

  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called) (handled by tabEventRegistrar).

    onActivated: this.tabEventRegistrar({
      tabEvent: "tab-activated",
      listener: ({ context, fire, event }) => {
        const { tabId, windowId, previousTabId } = event;
        fire.async({ tabId, windowId, previousTabId });
      },
    }),

    onCreated: this.tabEventRegistrar({
      tabEvent: "tab-created",
      listener: ({ context, fire, event }) => {
        const { extension } = this;
        const { tabManager } = extension;
        fire.async(tabManager.convert(event.nativeTabInfo, event.currentTab));
      },
    }),

    onAttached: this.tabEventRegistrar({
      tabEvent: "tab-attached",
      listener: ({ context, fire, event }) => {
        fire.async(event.tabId, {
          newWindowId: event.newWindowId,
          newPosition: event.newPosition,
        });
      },
    }),

    onDetached: this.tabEventRegistrar({
      tabEvent: "tab-detached",
      listener: ({ context, fire, event }) => {
        fire.async(event.tabId, {
          oldWindowId: event.oldWindowId,
          oldPosition: event.oldPosition,
        });
      },
    }),

    onRemoved: this.tabEventRegistrar({
      tabEvent: "tab-removed",
      listener: ({ context, fire, event }) => {
        fire.async(event.tabId, {
          windowId: event.windowId,
          isWindowClosing: event.isWindowClosing,
        });
      },
    }),

    onMoved({ context, fire }) {
      const { tabManager } = this.extension;
      const moveListener = async event => {
        const nativeTab = event.target;
        const nativeTabInfo = event.detail.tabInfo;
        const tabmail = nativeTab.ownerDocument.getElementById("tabmail");
        if (tabManager.canAccessTab(nativeTab)) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          fire.async(tabTracker.getId(nativeTabInfo), {
            windowId: windowTracker.getId(nativeTab.ownerGlobal),
            fromIndex: event.detail.idx,
            toIndex: tabmail.tabInfo.indexOf(nativeTabInfo),
          });
        }
      };

      windowTracker.addListener("TabMove", moveListener);
      return {
        unregister() {
          windowTracker.removeListener("TabMove", moveListener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },

    onUpdated({ context, fire }, [filterProps]) {
      const filter = { ...filterProps };
      const scheduledEvents = [];

      if (
        filter &&
        filter.urls &&
        !this.extension.hasPermission("tabs") &&
        !this.extension.hasPermission("activeTab")
      ) {
        console.error(
          'Url filtering in tabs.onUpdated requires "tabs" or "activeTab" permission.'
        );
        return false;
      }

      if (filter.urls) {
        // TODO: Consider following M-C
        // Use additional parameter { restrictSchemes: false }.
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

      function sanitize(tab, changeInfo) {
        const result = {};
        let nonempty = false;
        for (const prop in changeInfo) {
          // In practice, changeInfo contains at most one property from
          // restricted. Therefore it is not necessary to cache the value
          // of tab.hasTabPermission outside the loop.
          // Unnecessarily accessing tab.hasTabPermission can cause bugs, see
          // https://bugzilla.mozilla.org/show_bug.cgi?id=1694699#c21
          if (tab.hasTabPermission || !restricted.has(prop)) {
            nonempty = true;
            result[prop] = changeInfo[prop];
          }
        }
        return nonempty && result;
      }

      function getWindowID(windowId) {
        if (windowId === WindowBase.WINDOW_ID_CURRENT) {
          // TODO: Consider following M-C
          // Use windowTracker.getTopWindow(context).
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

      const fireForTab = async (tab, changed) => {
        if (!matchFilters(tab, changed)) {
          return;
        }

        const changeInfo = sanitize(tab, changed);
        if (changeInfo) {
          const tabInfo = tab.convert();
          // TODO: Consider following M-C
          // Use tabTracker.maybeWaitForTabOpen(nativeTab).then(() => {}).

          // Using a FIFO to keep order of events, in case the last one
          // gets through without being placed on the async callback stack.
          scheduledEvents.push([tab.id, changeInfo, tabInfo]);
          if (fire.wakeup) {
            await fire.wakeup();
          }
          fire.async(...scheduledEvents.shift());
        }
      };

      const listener = event => {
        /* TODO: Consider following M-C
        // Ignore any events prior to TabOpen and events that are triggered while
        // tabs are swapped between windows.
        if (event.originalTarget.initializingTab) {
          return;
        }
        if (!extension.canAccessWindow(event.originalTarget.ownerGlobal)) {
          return;
        }
        */

        const changeInfo = {};
        const { extension } = this;
        const { tabManager } = extension;
        const tab = tabManager.getWrapper(event.detail.tabInfo);
        const changed = event.detail.changed;
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

      const statusListener = ({ browser, status, url }) => {
        const { extension } = this;
        const { tabManager } = extension;
        const tabId = tabTracker.getBrowserTabId(browser);
        if (tabId != -1) {
          const changed = { status };
          if (url) {
            changed.url = url;
          }
          fireForTab(tabManager.get(tabId), changed);
        }
      };

      if (needsModified) {
        windowTracker.addListener("TabAttrModified", listener);
      }

      if (filter.properties.has("status")) {
        windowTracker.addListener("status", statusListener);
      }

      return {
        unregister() {
          if (needsModified) {
            windowTracker.removeListener("TabAttrModified", listener);
          }
          if (filter.properties.has("status")) {
            windowTracker.removeListener("status", statusListener);
          }
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  getAPI(context) {
    const { extension } = context;
    const { tabManager } = extension;

    /**
     * Gets the tab for the given tab id, or the active tab if the id is null.
     *
     * @param {?Integer} tabId - The tab id to get
     * @returns {Tab} The matching tab, or the active tab
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
     * @param {Integer} tabId - The tab id to check
     * @returns {Promise<NativeTabInfo>} Resolved when the loading is complete
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
          module: "tabs",
          event: "onActivated",
          extensionApi: this,
        }).api(),

        onCreated: new EventManager({
          context,
          module: "tabs",
          event: "onCreated",
          extensionApi: this,
        }).api(),

        onAttached: new EventManager({
          context,
          module: "tabs",
          event: "onAttached",
          extensionApi: this,
        }).api(),

        onDetached: new EventManager({
          context,
          module: "tabs",
          event: "onDetached",
          extensionApi: this,
        }).api(),

        onRemoved: new EventManager({
          context,
          module: "tabs",
          event: "onRemoved",
          extensionApi: this,
        }).api(),

        onMoved: new EventManager({
          context,
          module: "tabs",
          event: "onMoved",
          extensionApi: this,
        }).api(),

        onUpdated: new EventManager({
          context,
          module: "tabs",
          event: "onUpdated",
          extensionApi: this,
        }).api(),

        async create(createProperties) {
          const window = await getNormalWindowReady(
            context,
            createProperties.windowId
          );
          const tabmail = window.document.getElementById("tabmail");
          let url;
          if (createProperties.url) {
            url = context.uri.resolve(createProperties.url);

            if (!context.checkLoadURL(url, { dontReportErrors: true })) {
              return Promise.reject({ message: `Illegal URL: ${url}` });
            }
          }

          let userContextId =
            Services.scriptSecurityManager.DEFAULT_USER_CONTEXT_ID;
          if (createProperties.cookieStoreId) {
            userContextId = getUserContextIdForCookieStoreId(
              extension,
              createProperties.cookieStoreId
            );
          }

          const currentTab = tabmail.selectedTab;
          const active = createProperties.active ?? true;
          tabListener.initTabReady();

          const nativeTabInfo = tabmail.openTab("contentTab", {
            url: url || "about:blank",
            linkHandler: "single-site",
            background: !active,
            initialBrowsingContextGroupId:
              context.extension.policy.browsingContextGroupId,
            principal: context.extension.principal,
            duplicate: true,
            userContextId,
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

          for (const tabId of tabs) {
            const nativeTabInfo = tabTracker.getTab(tabId);
            if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
              nativeTabInfo.close();
              continue;
            }
            const tabmail = getTabTabmail(nativeTabInfo);
            tabmail.closeTab(nativeTabInfo);
          }
        },

        async update(tabId, updateProperties) {
          const nativeTabInfo = getTabOrActive(tabId);
          const tab = tabManager.getWrapper(nativeTabInfo);
          const tabmail = getTabTabmail(nativeTabInfo);

          if (updateProperties.url) {
            const url = context.uri.resolve(updateProperties.url);
            if (!context.checkLoadURL(url, { dontReportErrors: true })) {
              return Promise.reject({ message: `Illegal URL: ${url}` });
            }

            let uri;
            try {
              uri = Services.io.newURI(url);
            } catch (e) {
              throw new ExtensionError(`Url "${url}" seems to be malformed.`);
            }

            // http(s): urls, moz-extension: urls and self-registered protocol
            // handlers are actually loaded into the tab (and change its url).
            // All other urls are forwarded to the external protocol handler and
            // do not change the current tab.
            const isContentUrl =
              /((^blob:)|(^https:)|(^http:)|(^moz-extension:))/i.test(url);
            const isWebExtProtocolUrl =
              /((^ext\+[a-z]+:)|(^web\+[a-z]+:))/i.test(url) &&
              hasWebHandlerApp(uri.scheme);

            if (isContentUrl || isWebExtProtocolUrl) {
              if (tab.type != "content" && tab.type != "mail") {
                throw new ExtensionError(
                  isContentUrl
                    ? "Loading a content url is only supported for content tabs and mail tabs."
                    : "Loading a registered WebExtension protocol handler url is only supported for content tabs and mail tabs."
                );
              }

              const options = {
                flags: updateProperties.loadReplace
                  ? Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY
                  : Ci.nsIWebNavigation.LOAD_FLAGS_NONE,
                triggeringPrincipal: context.principal,
              };

              if (tab.type == "mail") {
                // The content browser in about:3pane.
                nativeTabInfo.chromeBrowser.contentWindow.messagePane.displayWebPage(
                  url,
                  options
                );
              } else {
                const browser = getTabBrowser(nativeTabInfo);
                if (!browser) {
                  throw new ExtensionError("Cannot set a URL for this tab.");
                }
                MailE10SUtils.loadURI(browser, url, options);
              }
            } else {
              // Send unknown URLs schema to the external protocol handler.
              // This does not change the current tab.
              Cc["@mozilla.org/uriloader/external-protocol-service;1"]
                .getService(Ci.nsIExternalProtocolService)
                .loadURI(uri);
            }
          }

          // A tab can only be set to be active. To set it inactive, another tab
          // has to be set as active.
          if (tabmail && updateProperties.active) {
            tabmail.selectedTab = nativeTabInfo;
          }

          return tabManager.convert(nativeTabInfo);
        },

        async reload(tabId, reloadProperties) {
          const nativeTabInfo = getTabOrActive(tabId);
          const tab = tabManager.getWrapper(nativeTabInfo);

          const isContentMailTab =
            tab.type == "mail" &&
            !nativeTabInfo.chromeBrowser.contentWindow.webBrowser.hidden;
          if (tab.type != "content" && !isContentMailTab) {
            throw new ExtensionError(
              "Reloading is only supported for tabs displaying a content page."
            );
          }

          const browser = getTabBrowser(nativeTabInfo);

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
          const tab = await promiseTabWhenReady(tabId);
          return tab.executeScript(context, details);
        },

        async insertCSS(tabId, details) {
          const tab = await promiseTabWhenReady(tabId);
          return tab.insertCSS(context, details);
        },

        async removeCSS(tabId, details) {
          const tab = await promiseTabWhenReady(tabId);
          return tab.removeCSS(context, details);
        },

        async move(tabIds, moveProperties) {
          const tabsMoved = [];
          if (!Array.isArray(tabIds)) {
            tabIds = [tabIds];
          }

          let destinationWindow = null;
          if (moveProperties.windowId !== null) {
            destinationWindow = await getNormalWindowReady(
              context,
              moveProperties.windowId
            );
          }

          /*
            Indexes are maintained on a per window basis so that a call to
              move([tabA, tabB], {index: 0})
                -> tabA to 0, tabB to 1 if tabA and tabB are in the same window
              move([tabA, tabB], {index: 0})
                -> tabA to 0, tabB to 0 if tabA and tabB are in different windows
          */
          const indexMap = new Map();
          const lastInsertion = new Map();

          const tabs = tabIds.map(tabId => ({
            nativeTabInfo: tabTracker.getTab(tabId),
            tabId,
          }));
          for (let { nativeTabInfo, tabId } of tabs) {
            if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
              return Promise.reject({
                message: `Tab with ID ${tabId} does not belong to a normal window`,
              });
            }

            // If the window is not specified, use the window from the tab.
            const browser = getTabBrowser(nativeTabInfo);

            const srcwindow = browser.ownerGlobal;
            const tgtwindow = destinationWindow || browser.ownerGlobal;
            const tgttabmail = tgtwindow.document.getElementById("tabmail");
            const srctabmail = srcwindow.document.getElementById("tabmail");

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

            const tabPosition = srctabmail.tabInfo.indexOf(nativeTabInfo);

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
          const nativeTabInfo = tabTracker.getTab(tabId);
          if (nativeTabInfo instanceof Ci.nsIDOMWindow) {
            throw new ExtensionError(
              "tabs.duplicate is not applicable to this tab."
            );
          }
          const browser = getTabBrowser(nativeTabInfo);
          const tabmail = browser.ownerDocument.getElementById("tabmail");

          // This is our best approximation of duplicating tabs. It might produce unreliable results
          const state = tabmail.persistTab(nativeTabInfo);
          const mode = tabmail.tabModes[state.mode];
          state.state.duplicate = true;

          if (mode.tabs.length && mode.tabs.length == mode.maxTabs) {
            throw new ExtensionError(
              `Maximum number of ${state.mode} tabs reached.`
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
