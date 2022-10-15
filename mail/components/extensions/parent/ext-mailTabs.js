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
 * Sets the displayed folder in the given tab.
 *
 * @param {Tab} tab - The tab where the displayed folder should be set.
 * @param {nsIMsgFolder} folder - The folder to be displayed.
 */
function setDisplayedFolder(tab, folder) {
  if (tab.active) {
    let treeView = Cu.getGlobalForObject(tab.nativeTab).gFolderTreeView;
    treeView.selectFolder(folder);
  } else {
    tab.nativeTab.folderDisplay.showFolderUri(folder.URI);
  }
}

/**
 * Converts a mail tab to a simle object for use in messages.
 * @return {Object}
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

  let nativeTab = tab.nativeTab;
  mailTabObject.folderPaneVisible = nativeTab.folderPaneVisible;
  mailTabObject.messagePaneVisible = nativeTab.messagePaneVisible;
  mailTabObject.sortType = SORT_TYPE_MAP.get(nativeTab.sort.type);
  mailTabObject.sortOrder = SORT_ORDER_MAP.get(nativeTab.sort.order);
  if (nativeTab.sort.grouped) {
    mailTabObject.viewType = "groupedBySortType";
  } else if (nativeTab.sort.threaded) {
    mailTabObject.viewType = "groupedByThread";
  } else {
    mailTabObject.viewType = "ungrouped";
  }
  if (context.extension.hasPermission("accountsRead")) {
    mailTabObject.displayedFolder = convertFolder(nativeTab.folder);
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
    let tab = tabTracker.activeTab;
    if (event.target.id == "folderTree") {
      let folder = tab.folderDisplay.displayedFolder;
      if (this.lastSelected.get(tab) == folder) {
        return;
      }
      this.lastSelected.set(tab, folder);
      this.emit("folder-changed", tab, folder);
      return;
    }
    if (event.target.id == "threadTree") {
      this.emit(
        "messages-changed",
        tab,
        tab.folderDisplay.view.dbView.getSelectedMsgHdrs()
      );
    }
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      windowTracker.addListener("select", this);
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      windowTracker.removeListener("select", this);
      this.lastSelected = new WeakMap();
    }
  }
})();

this.mailTabs = class extends ExtensionAPI {
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
      let tab;
      if (tabId) {
        tab = tabManager.get(tabId);
      } else {
        tab = tabManager.wrapTab(tabTracker.activeTab);
        tabId = tab.id;
      }

      if (tab && tab.type == "mail") {
        return tab;
      }
      throw new ExtensionError(`Invalid mail tab ID: ${tabId}`);
    }

    return {
      mailTabs: {
        async query({ active, currentWindow, lastFocusedWindow, windowId }) {
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
          let tab = getTabOrActive(tabId);
          return convertMailTab(tab, context);
        },
        async getCurrent() {
          try {
            let tab = getTabOrActive();
            return convertMailTab(tab, context);
          } catch (e) {
            // Do not throw, if the active tab is not a mail tab, but return undefined.
            return undefined;
          }
        },

        async update(tabId, args) {
          let tab = getTabOrActive(tabId);
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
            let uri = folderPathToURI(
              displayedFolder.accountId,
              displayedFolder.path
            );
            about3Pane.restoreState({
              folderURI: uri,
            });
            let folder = MailServices.folderLookup.getFolderForURL(uri);
            if (!folder) {
              throw new ExtensionError(
                `Folder "${displayedFolder.path}" for account ` +
                  `"${displayedFolder.accountId}" not found.`
              );
            }
            setDisplayedFolder(tab, folder);
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

          if (nativeTab.mode.name == "mail3PaneTab") {
            if (typeof folderPaneVisible == "boolean") {
              nativeTab.folderPaneVisible = folderPaneVisible;
            }
            if (typeof messagePaneVisible == "boolean") {
              nativeTab.messagePaneVisible = messagePaneVisible;
            }
          }
        },

        async getSelectedMessages(tabId) {
          let tab = getTabOrActive(tabId);
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

          let tab = getTabOrActive(tabId);
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
            setDisplayedFolder(tab, refFolder);
          }
          tab.nativeTab.folderDisplay.selectMessages(msgHdrs, true);
        },

        async setQuickFilter(tabId, state) {
          let tab = getTabOrActive(tabId);
          let nativeTab = tab.nativeTab;
          let window = Cu.getGlobalForObject(nativeTab);

          let filterer;
          if (tab.active) {
            filterer = window.QuickFilterBarMuxer.activeFilterer;
          } else {
            filterer = nativeTab._ext.quickFilter;
          }
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
            let value = null;
            if (state[name] !== null) {
              value = state[name];
            }
            if (value === null) {
              delete filterer.filterValues[key];
            } else {
              filterer.filterValues[key] = value;
            }
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

          if (tab.active) {
            window.QuickFilterBarMuxer.deferredUpdateSearch();
            window.QuickFilterBarMuxer.reflectFiltererState(
              filterer,
              window.gFolderDisplay
            );
          }
          // Inactive tabs are updated when they become active, except the search doesn't. :(
        },

        onDisplayedFolderChanged: new EventManager({
          context,
          name: "mailTabs.onDisplayedFolderChanged",
          register: fire => {
            let listener = (event, tab, folder) => {
              fire.sync(tabManager.convert(tab), convertFolder(folder));
            };

            uiListener.on("folder-changed", listener);
            uiListener.incrementListeners();
            return () => {
              uiListener.off("folder-changed", listener);
              uiListener.decrementListeners();
            };
          },
        }).api(),

        onSelectedMessagesChanged: new EventManager({
          context,
          name: "mailTabs.onSelectedMessagesChanged",
          register: fire => {
            let listener = async (event, tab, messages) => {
              let page = await messageListTracker.startList(
                messages,
                extension
              );
              fire.sync(tabManager.convert(tab), page);
            };

            uiListener.on("messages-changed", listener);
            uiListener.incrementListeners();
            return () => {
              uiListener.off("messages-changed", listener);
              uiListener.decrementListeners();
            };
          },
        }).api(),
      },
    };
  }
};
