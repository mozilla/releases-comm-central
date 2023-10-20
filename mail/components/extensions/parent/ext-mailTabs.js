/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  QuickFilterManager: "resource:///modules/QuickFilterManager.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

var { convertFolder, folderPathToURI } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "gDynamicPaneConfig",
  "mail.pane_config.dynamic",
  0
);

const LAYOUTS = ["standard", "wide", "vertical"];
// From nsIMsgDBView.idl
const SORT_TYPE_MAP = new Map(
  Object.keys(Ci.nsMsgViewSortType).map(key => {
    // Change "byFoo" to "foo".
    let shortKey = key[2].toLowerCase() + key.substring(3);
    return [Ci.nsMsgViewSortType[key], shortKey];
  })
);
const SORT_ORDER_MAP = new Map(
  Object.keys(Ci.nsMsgViewSortOrder).map(key => [
    Ci.nsMsgViewSortOrder[key],
    key,
  ])
);

/**
 * Converts a mail tab to a simple object for use in messages.
 *
 * @returns {object}
 */
function convertMailTab(tab, context) {
  let mailTabObject = {
    id: tab.id,
    windowId: tab.windowId,
    active: tab.active,
    sortType: null,
    sortOrder: null,
    viewType: null,
    layout: LAYOUTS[gDynamicPaneConfig],
    folderPaneVisible: null,
    messagePaneVisible: null,
  };

  let about3Pane = tab.nativeTab.chromeBrowser.contentWindow;
  let { gViewWrapper, paneLayout } = about3Pane;
  mailTabObject.folderPaneVisible = paneLayout.folderPaneVisible;
  mailTabObject.messagePaneVisible = paneLayout.messagePaneVisible;
  mailTabObject.sortType = SORT_TYPE_MAP.get(gViewWrapper?.primarySortType);
  mailTabObject.sortOrder = SORT_ORDER_MAP.get(gViewWrapper?.primarySortOrder);
  if (gViewWrapper?.showGroupedBySort) {
    mailTabObject.viewType = "groupedBySortType";
  } else if (gViewWrapper?.showThreaded) {
    mailTabObject.viewType = "groupedByThread";
  } else {
    mailTabObject.viewType = "ungrouped";
  }
  if (context.extension.hasPermission("accountsRead")) {
    mailTabObject.displayedFolder = convertFolder(about3Pane.gFolder);
  }
  return mailTabObject;
}

/**
 * Listens for changes in the UI to fire events.
 */
var uiListener = new (class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
    this.handleEvent = this.handleEvent.bind(this);
    this.lastSelected = new WeakMap();
  }

  handleEvent(event) {
    let browser = event.target.browsingContext.embedderElement;
    let tabmail = browser.ownerGlobal.top.document.getElementById("tabmail");
    let nativeTab = tabmail.tabInfo.find(
      t =>
        t.chromeBrowser == browser ||
        t.chromeBrowser == browser.browsingContext.parent.embedderElement
    );

    if (nativeTab.mode.name != "mail3PaneTab") {
      return;
    }

    let tabId = tabTracker.getId(nativeTab);
    let tab = tabTracker.getTab(tabId);

    if (event.type == "folderURIChanged") {
      let folderURI = event.detail;
      let folder = MailServices.folderLookup.getFolderForURL(folderURI);
      if (this.lastSelected.get(tab) == folder) {
        return;
      }
      this.lastSelected.set(tab, folder);
      this.emit("folder-changed", tab, folder);
    } else if (event.type == "messageURIChanged") {
      let messages =
        nativeTab.chromeBrowser.contentWindow.gDBView?.getSelectedMsgHdrs();
      if (messages) {
        this.emit("messages-changed", tab, messages);
      }
    }
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      windowTracker.addListener("folderURIChanged", this);
      windowTracker.addListener("messageURIChanged", this);
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      windowTracker.removeListener("folderURIChanged", this);
      windowTracker.removeListener("messageURIChanged", this);
      this.lastSelected = new WeakMap();
    }
  }
})();

this.mailTabs = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onDisplayedFolderChanged({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event, tab, folder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(tabManager.convert(tab), convertFolder(folder));
      }
      uiListener.on("folder-changed", listener);
      uiListener.incrementListeners();
      return {
        unregister: () => {
          uiListener.off("folder-changed", listener);
          uiListener.decrementListeners();
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onSelectedMessagesChanged({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event, tab, messages) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        let page = await messageListTracker.startList(messages, extension);
        fire.sync(tabManager.convert(tab), page);
      }
      uiListener.on("messages-changed", listener);
      uiListener.incrementListeners();
      return {
        unregister: () => {
          uiListener.off("messages-changed", listener);
          uiListener.decrementListeners();
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  getAPI(context) {
    let { extension } = context;
    let { tabManager } = extension;

    /**
     * Gets the tab for the given tab id, or the active tab if the id is null.
     *
     * @param {?Integer} tabId - The tab id to get
     * @returns {Tab} The matching tab, or the active tab
     */
    async function getTabOrActive(tabId) {
      let tab;
      if (tabId) {
        tab = tabManager.get(tabId);
      } else {
        tab = tabManager.wrapTab(tabTracker.activeTab);
        tabId = tab.id;
      }

      if (tab && tab.type == "mail") {
        let windowId = windowTracker.getId(getTabWindow(tab.nativeTab));
        // Before doing anything with the mail tab, ensure its outer window is
        // fully loaded.
        await getNormalWindowReady(context, windowId);
        return tab;
      }
      throw new ExtensionError(`Invalid mail tab ID: ${tabId}`);
    }

    /**
     * Set the currently displayed folder in the given tab.
     * @param {NativeTabInfo} nativeTabInfo
     * @param {nsIMsgFolder} folder
     * @param {boolean} restorePreviousSelection - Select the previously selected
     *   messages of the folder, after it has been set.
     */
    async function setFolder(nativeTabInfo, folder, restorePreviousSelection) {
      let about3Pane = nativeTabInfo.chromeBrowser.contentWindow;
      if (!nativeTabInfo.folder || nativeTabInfo.folder.URI != folder.URI) {
        await new Promise(resolve => {
          let listener = event => {
            if (event.detail == folder.URI) {
              about3Pane.removeEventListener("folderURIChanged", listener);
              resolve();
            }
          };
          about3Pane.addEventListener("folderURIChanged", listener);
          if (restorePreviousSelection) {
            about3Pane.restoreState({
              folderURI: folder.URI,
            });
          } else {
            about3Pane.threadPane.forgetSelection(folder.URI);
            nativeTabInfo.folder = folder;
          }
        });
      }
    }

    return {
      mailTabs: {
        async query({ active, currentWindow, lastFocusedWindow, windowId }) {
          await getNormalWindowReady();
          return Array.from(
            tabManager.query(
              {
                active,
                currentWindow,
                lastFocusedWindow,
                mailTab: true,
                windowId,

                // All of these are needed for tabManager to return every tab we want.
                cookieStoreId: null,
                index: null,
                screen: null,
                title: null,
                url: null,
                windowType: null,
              },
              context
            ),
            tab => convertMailTab(tab, context)
          );
        },

        async get(tabId) {
          let tab = await getTabOrActive(tabId);
          return convertMailTab(tab, context);
        },
        async getCurrent() {
          try {
            let tab = await getTabOrActive();
            return convertMailTab(tab, context);
          } catch (e) {
            // Do not throw, if the active tab is not a mail tab, but return undefined.
            return undefined;
          }
        },

        async update(tabId, args) {
          let tab = await getTabOrActive(tabId);
          let { nativeTab } = tab;
          let about3Pane = nativeTab.chromeBrowser.contentWindow;

          let {
            displayedFolder,
            layout,
            folderPaneVisible,
            messagePaneVisible,
            sortOrder,
            sortType,
            viewType,
          } = args;

          if (displayedFolder) {
            if (!extension.hasPermission("accountsRead")) {
              throw new ExtensionError(
                'Updating the displayed folder requires the "accountsRead" permission'
              );
            }

            let folderUri = folderPathToURI(
              displayedFolder.accountId,
              displayedFolder.path
            );
            let folder = MailServices.folderLookup.getFolderForURL(folderUri);
            if (!folder) {
              throw new ExtensionError(
                `Folder "${displayedFolder.path}" for account ` +
                  `"${displayedFolder.accountId}" not found.`
              );
            }
            await setFolder(nativeTab, folder, true);
          }

          if (sortType) {
            // Change "foo" to "byFoo".
            sortType = "by" + sortType[0].toUpperCase() + sortType.substring(1);
            if (
              sortType in Ci.nsMsgViewSortType &&
              sortOrder &&
              sortOrder in Ci.nsMsgViewSortOrder
            ) {
              about3Pane.gViewWrapper.sort(
                Ci.nsMsgViewSortType[sortType],
                Ci.nsMsgViewSortOrder[sortOrder]
              );
            }
          }

          switch (viewType) {
            case "groupedBySortType":
              about3Pane.gViewWrapper.showGroupedBySort = true;
              break;
            case "groupedByThread":
              about3Pane.gViewWrapper.showThreaded = true;
              break;
            case "ungrouped":
              about3Pane.gViewWrapper.showUnthreaded = true;
              break;
          }

          // Layout applies to all folder tabs.
          if (layout) {
            Services.prefs.setIntPref(
              "mail.pane_config.dynamic",
              LAYOUTS.indexOf(layout)
            );
          }

          if (typeof folderPaneVisible == "boolean") {
            about3Pane.paneLayout.folderPaneVisible = folderPaneVisible;
          }
          if (typeof messagePaneVisible == "boolean") {
            about3Pane.paneLayout.messagePaneVisible = messagePaneVisible;
          }
        },

        async getSelectedMessages(tabId) {
          let tab = await getTabOrActive(tabId);
          let dbView = tab.nativeTab.chromeBrowser.contentWindow?.gDBView;
          let messageList = dbView ? dbView.getSelectedMsgHdrs() : [];
          return messageListTracker.startList(messageList, extension);
        },

        async setSelectedMessages(tabId, messageIds) {
          if (
            !extension.hasPermission("messagesRead") ||
            !extension.hasPermission("accountsRead")
          ) {
            throw new ExtensionError(
              'Using mailTabs.setSelectedMessages() requires the "accountsRead" and the "messagesRead" permission'
            );
          }

          let tab = await getTabOrActive(tabId);
          let refFolder, refMsgId;
          let msgHdrs = [];
          for (let messageId of messageIds) {
            let msgHdr = messageTracker.getMessage(messageId);
            if (!refFolder) {
              refFolder = msgHdr.folder;
              refMsgId = messageId;
            }
            if (msgHdr.folder == refFolder) {
              msgHdrs.push(msgHdr);
            } else {
              throw new ExtensionError(
                `Message ${refMsgId} and message ${messageId} are not in the same folder, cannot select them both.`
              );
            }
          }

          if (refFolder) {
            await setFolder(tab.nativeTab, refFolder, false);
          }
          let about3Pane = tab.nativeTab.chromeBrowser.contentWindow;
          about3Pane.threadTree.selectedIndices = msgHdrs.map(
            about3Pane.gViewWrapper.getViewIndexForMsgHdr,
            about3Pane.gViewWrapper
          );
        },

        async setQuickFilter(tabId, state) {
          let tab = await getTabOrActive(tabId);
          let nativeTab = tab.nativeTab;
          let about3Pane = nativeTab.chromeBrowser.contentWindow;

          let filterer = about3Pane.quickFilterBar.filterer;
          filterer.clear();

          // Map of QuickFilter state names to possible WebExtensions state names.
          let stateMap = {
            unread: "unread",
            starred: "flagged",
            addrBook: "contact",
            attachment: "attachment",
          };

          filterer.visible = state.show !== false;
          for (let [key, name] of Object.entries(stateMap)) {
            filterer.setFilterValue(key, state[name]);
          }

          if (state.tags) {
            filterer.filterValues.tags = {
              mode: "OR",
              tags: {},
            };
            for (let tag of MailServices.tags.getAllTags()) {
              filterer.filterValues.tags[tag.key] = null;
            }
            if (typeof state.tags == "object") {
              filterer.filterValues.tags.mode =
                state.tags.mode == "any" ? "OR" : "AND";
              for (let [key, value] of Object.entries(state.tags.tags)) {
                filterer.filterValues.tags.tags[key] = value;
              }
            }
          }
          if (state.text) {
            filterer.filterValues.text = {
              states: {
                recipients: state.text.recipients || false,
                sender: state.text.author || false,
                subject: state.text.subject || false,
                body: state.text.body || false,
              },
              text: state.text.text,
            };
          }

          about3Pane.quickFilterBar.updateSearch();
        },

        onDisplayedFolderChanged: new EventManager({
          context,
          module: "mailTabs",
          event: "onDisplayedFolderChanged",
          extensionApi: this,
        }).api(),

        onSelectedMessagesChanged: new EventManager({
          context,
          module: "mailTabs",
          event: "onSelectedMessagesChanged",
          extensionApi: this,
        }).api(),
      },
    };
  }
};
