/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "Services", "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");
ChromeUtils.defineModuleGetter(this, "QuickFilterManager",
                               "resource:///modules/QuickFilterManager.jsm");

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
  Object.keys(Ci.nsMsgViewSortOrder).map(key => [Ci.nsMsgViewSortOrder[key], key])
);

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
    layout: LAYOUTS[Services.prefs.getIntPref("mail.pane_config.dynamic")],
    folderPaneVisible: null,
    messagePaneVisible: null,
  };

  let nativeTab = tab.nativeTab;
  let { folderDisplay } = nativeTab;
  if (folderDisplay.view.displayedFolder) {
    let { folderPaneVisible, messagePaneVisible } = nativeTab.mode.persistTab(nativeTab);
    mailTabObject.sortType = SORT_TYPE_MAP.get(folderDisplay.view.primarySortType);
    mailTabObject.sortOrder = SORT_ORDER_MAP.get(folderDisplay.view.primarySortOrder);
    mailTabObject.folderPaneVisible = folderPaneVisible;
    mailTabObject.messagePaneVisible = messagePaneVisible;
  }
  if (context.extension.hasPermission("accountsRead")) {
    mailTabObject.displayedFolder = convertFolder(folderDisplay.displayedFolder);
  }
  return mailTabObject;
}

/**
 * Listens for changes in the UI to fire events.
 */
var uiListener = new class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
    this.handleSelect = this.handleSelect.bind(this);
    this.lastSelected = new WeakMap();
  }

  handleSelect(event) {
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
      this.emit("messages-changed", tab, tab.folderDisplay.view.dbView.getSelectedMsgHdrs());
    }
  }

  addListenersToWindow(window) {
    window.addEventListener("select", uiListener.handleSelect);
  }
  removeListenersFromWindow(window) {
    window.removeEventListener("select", uiListener.handleSelect);
  }
  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      for (let window of windowTracker.browserWindows()) {
        this.addListenersToWindow(window);
      }
      windowTracker.addOpenListener(this.addListenersToWindow);
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      for (let window of windowTracker.browserWindows()) {
        this.removeListenersFromWindow(window);
      }
      windowTracker.removeOpenListener(this.addListenersToWindow);
      this.lastSelected = new WeakMap();
    }
  }
};

class PermissionedEventManager extends EventManager {
  constructor({ permission, context, name, register }) {
    super({ context, name, register });
    this.permission = permission;
  }
  addListener(callback) {
    let { extension } = this.context;
    if (!extension.hasPermission(this.permission)) {
      throw new ExtensionError(
        `The "${this.permission}" permission is required to use ${this.name}.`
      );
    }
    return super.addListener(callback);
  }
}

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

      if (tab && tab.mailTab) {
        return tab;
      }
      throw new ExtensionError(`Invalid mail tab ID: ${tabId}`);
    }

    return {
      mailTabs: {
        async query({ active, currentWindow, lastFocusedWindow, windowId }) {
          return Array.from(tabManager.query({
            active,
            currentWindow,
            lastFocusedWindow,
            mailTab: true,
            windowId,

            // All of these are needed for tabManager to return every tab we want.
            index: null,
            screen: null,
            windowType: null,
          }, context), (tab) => convertMailTab(tab, context));
        },

        async update(tabId, args) {
          let tab = getTabOrActive(tabId);
          let window = tab.window;

          let {
            displayedFolder,
            layout,
            folderPaneVisible,
            messagePaneVisible,
            sortOrder,
            sortType,
          } = args;

          if (displayedFolder && extension.hasPermission("accountsRead")) {
            let uri = folderPathToURI(displayedFolder.accountId, displayedFolder.path);
            if (tab.active) {
              let treeView = Cu.getGlobalForObject(tab.nativeTab).gFolderTreeView;
              let folder = MailServices.folderLookup.getFolderForURL(uri);
              if (folder) {
                treeView.selectFolder(folder);
              } else {
                throw new ExtensionError(
                  `Folder "${displayedFolder.path}" for account ` +
                  `"${displayedFolder.accountId}" not found.`
                );
              }
            } else {
              tab.nativeTab.folderDisplay.showFolderUri(uri);
            }
          }

          if (sortType) {
            // Change "foo" to "byFoo".
            sortType = "by" + sortType[0].toUpperCase() + sortType.substring(1);
            if (sortType in Ci.nsMsgViewSortType &&
                sortOrder && sortOrder in Ci.nsMsgViewSortOrder) {
              tab.nativeTab.folderDisplay.view.sort(Ci.nsMsgViewSortType[sortType],
                                                    Ci.nsMsgViewSortOrder[sortOrder]);
            }
          }

          // Layout applies to all folder tabs.
          if (layout) {
            Services.prefs.setIntPref("mail.pane_config.dynamic", LAYOUTS.indexOf(layout));
          }

          if (typeof folderPaneVisible == "boolean") {
            if (tab.active) {
              let document = window.document;
              let folderPaneSplitter = document.getElementById("folderpane_splitter");
              folderPaneSplitter.setAttribute("state", folderPaneVisible ? "open" : "collapsed");
            } else {
              tab.nativeTab.folderDisplay.folderPaneVisible = folderPaneVisible;
            }
          }

          if (typeof messagePaneVisible == "boolean") {
            if (tab.active) {
              if (messagePaneVisible == window.IsMessagePaneCollapsed()) {
                window.MsgToggleMessagePane();
              }
            } else {
              tab.nativeTab.messageDisplay._visible = messagePaneVisible;
              if (!messagePaneVisible) {
                // Prevent the messagePane from showing if a message is selected.
                tab.nativeTab.folderDisplay._aboutToSelectMessage = true;
              }
            }
          }
        },

        async getSelectedMessages(tabId) {
          if (!extension.hasPermission("messagesRead")) {
            throw new ExtensionError(
              `The "messagesRead" permission is required to use mailTabs.getSelectedMessages.`
            );
          }

          let tab = getTabOrActive(tabId);
          let { folderDisplay } = tab.nativeTab;
          let messageList = folderDisplay.view.dbView.getSelectedMsgHdrs();
          return messageListTracker.startList(messageList, extension);
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

          filterer.visible = (state.show !== false);
          for (let s of ["unread", "starred", "contact", "attachment"]) {
            let key = (s == "contact") ? "addrBook" : s;
            let value = state[s];
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
            for (let tag of MailServices.tags.getAllTags({})) {
              filterer.filterValues.tags[tag.key] = null;
            }
            if (typeof state.tags == "object") {
              filterer.filterValues.tags.mode = (state.tags.mode == "any") ? "OR" : "AND";
              for (let [key, value] of Object.entries(state.tags.tags)) {
                filterer.filterValues.tags.tags[key] = value;
              }
            }
          }
          if (state.text) {
            filterer.filterValues.text = {
              states: {
                recipients: state.text.recipients || false,
                sender: state.text.sender || false,
                subject: state.text.subject || false,
                body: state.text.body || false,
              },
              text: state.text.text,
            };
          }

          if (tab.active) {
            window.QuickFilterBarMuxer.deferredUpdateSearch();
            window.QuickFilterBarMuxer.reflectFiltererState(filterer, window.gFolderDisplay);
          }
          // Inactive tabs are updated when they become active, except the search doesn't. :(
        },

        onDisplayedFolderChanged: new PermissionedEventManager({
          permission: "accountsRead",
          context,
          name: "mailTabs.onDisplayedFolderChanged",
          register: (fire) => {
            let listener = (event, tab, folder) => {
              fire.sync(tabTracker.getId(tab), convertFolder(folder));
            };

            uiListener.on("folder-changed", listener);
            uiListener.incrementListeners();
            return () => {
              uiListener.off("folder-changed", listener);
              uiListener.decrementListeners();
            };
          },
        }).api(),

        onSelectedMessagesChanged: new PermissionedEventManager({
          permission: "messagesRead",
          context,
          name: "mailTabs.onSelectedMessagesChanged",
          register: (fire) => {
            let listener = (event, tab, messages) => {
              fire.sync(tabTracker.getId(tab), messageListTracker.startList(messages, extension));
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
