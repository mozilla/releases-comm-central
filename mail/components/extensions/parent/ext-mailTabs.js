/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  QuickFilterManager: "resource:///modules/QuickFilterManager.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

var { getFolder } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);
var { ThreadPaneColumns } = ChromeUtils.importESModule(
  "chrome://messenger/content/thread-pane-columns.mjs"
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
    const shortKey = key[2].toLowerCase() + key.substring(3);
    return [Ci.nsMsgViewSortType[key], shortKey];
  })
);
const SORT_ORDER_MAP = new Map(
  Object.keys(Ci.nsMsgViewSortOrder).map(key => [
    Ci.nsMsgViewSortOrder[key],
    key,
  ])
);

const nsMsgViewIndex_None = 0xffffffff;

/**
 * Converts a mail tab to a simple object for use in messages.
 *
 * @returns {object}
 */
function convertMailTab(tab, context) {
  const about3Pane = tab.nativeTab.chromeBrowser.contentWindow;
  const { gViewWrapper, paneLayout } = about3Pane;

  // The API uses "unified" instead of "smart".
  const fixApiModeName = name => (name == "smart" ? "unified" : name);

  const mailTabObject = {
    id: tab.id,
    windowId: tab.windowId,
    active: tab.active,
    sortType: null,
    sortOrder: null,
    viewType: null,
    layout: LAYOUTS[gDynamicPaneConfig],
    folderPaneVisible: null,
    messagePaneVisible: null,
    folderMode: fixApiModeName(about3Pane.folderTree.selectedRow.modeName),
    folderModesEnabled: about3Pane.folderPane.activeModes.map(fixApiModeName),
  };

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
    mailTabObject.displayedFolder = context.extension.folderManager.convert(
      about3Pane.gFolder
    );
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
    const browser = event.target.browsingContext.embedderElement;
    const tabmail = browser.ownerGlobal.top.document.getElementById("tabmail");
    const nativeTab = tabmail.tabInfo.find(
      t =>
        t.chromeBrowser == browser ||
        t.chromeBrowser == browser.browsingContext.parent.embedderElement
    );

    if (nativeTab.mode.name != "mail3PaneTab") {
      return;
    }

    const tabId = tabTracker.getId(nativeTab);
    const tab = tabTracker.getTab(tabId);

    if (event.type == "folderURIChanged") {
      const folderURI = event.detail;
      const folder = MailServices.folderLookup.getFolderForURL(folderURI);
      if (this.lastSelected.get(tab) == folder) {
        return;
      }
      this.lastSelected.set(tab, folder);
      this.emit("folder-changed", tab, folder);
    } else if (event.type == "messageURIChanged") {
      const messages =
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

    onDisplayedFolderChanged({ fire }) {
      const { extension } = this;
      const { tabManager, folderManager } = extension;
      async function listener(event, tab, folder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.sync(tabManager.convert(tab), folderManager.convert(folder));
      }
      uiListener.on("folder-changed", listener);
      uiListener.incrementListeners();
      return {
        unregister: () => {
          uiListener.off("folder-changed", listener);
          uiListener.decrementListeners();
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onSelectedMessagesChanged({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event, tab, messages) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        const page = await messageListTracker.startList(messages, extension);
        fire.sync(tabManager.convert(tab), page);
      }
      uiListener.on("messages-changed", listener);
      uiListener.incrementListeners();
      return {
        unregister: () => {
          uiListener.off("messages-changed", listener);
          uiListener.decrementListeners();
        },
        convert(newFire) {
          fire = newFire;
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
    async function getTabOrActive(tabId) {
      let tab;
      if (tabId) {
        tab = tabManager.get(tabId);
      } else {
        tab = tabManager.wrapTab(tabTracker.activeTab);
        tabId = tab.id;
      }

      if (tab && tab.type == "mail") {
        const windowId = windowTracker.getId(getTabWindow(tab.nativeTab));
        // Before doing anything with the mail tab, ensure its outer window is
        // fully loaded.
        await getNormalWindowReady(context, windowId);
        return tab;
      }
      throw new ExtensionError(`Invalid mail tab ID: ${tabId}`);
    }

    /**
     * Set the currently selected folder row in the given tab.
     *
     * @param {Window} about3Pane
     * @param {FolderTreeRow} row
     * @param {boolean} [clearPreviousSelection] - Clears the previously selected
     *   messages of the folder, after it has been set.
     */
    async function selectFolderRow(about3Pane, row, clearPreviousSelection) {
      const curRow = about3Pane.folderTree.selectedRow;
      // Bail out, if invalid row, or row already selected.
      if (
        !row?.modeName ||
        !row?.uri ||
        (row.modeName == curRow?.modeName && row.uri == curRow?.uri)
      ) {
        return;
      }

      // Make sure the row is actually visible.
      about3Pane.ensureFolderTreeRowIsVisible(row);

      if (clearPreviousSelection) {
        about3Pane.threadPane.forgetSelection(row.uri);
      }

      await new Promise(resolve => {
        const listener = event => {
          if (event.detail == row.uri) {
            about3Pane.removeEventListener("folderURIChanged", listener);
            resolve();
          }
        };
        about3Pane.addEventListener("folderURIChanged", listener);
        about3Pane.folderTree.selectedRow = row;
      });
    }

    /**
     * Update the given tab.
     *
     * @param {NativeTab} nativeTab
     * @param {MailTabProperties} properties
     *
     * @see mail/components/extensions/schemas/mailTabs.json
     */
    async function updateMailTab(nativeTab, properties) {
      const about3Pane = nativeTab.chromeBrowser.contentWindow;
      const selectedFolder = about3Pane.gFolder;

      // Thunderbird uses "smart" instead of "unified".
      const fixTbModeName = name => (name == "unified" ? "smart" : name);

      const {
        displayedFolder,
        layout,
        folderPaneVisible,
        messagePaneVisible,
        sortOrder,
        sortType,
        viewType,
        folderModesEnabled,
        folderMode,
      } = properties;

      const curFolderMode = about3Pane.folderTree.selectedRow.modeName;
      const curFolderModes = about3Pane.folderPane.activeModes;
      const newFolderMode = folderMode ? fixTbModeName(folderMode) : null;
      let newFolderModes = folderModesEnabled
        ? folderModesEnabled.map(fixTbModeName)
        : null;

      // Switching to a folder pane mode should always enable it, if needed.
      if (
        newFolderMode &&
        !newFolderModes &&
        !curFolderModes.includes(newFolderMode)
      ) {
        newFolderModes = [...curFolderModes, newFolderMode];
      }
      if (
        newFolderMode &&
        newFolderModes &&
        !newFolderModes.includes(newFolderMode)
      ) {
        newFolderModes.push(newFolderMode);
      }

      if (newFolderModes) {
        about3Pane.folderPane.activeModes = newFolderModes;
        // TODO: How to properly wait for the updated modes?
        await new Promise(r => about3Pane.setTimeout(r));

        // If the current mode got disabled, and neither newFolderMode nor
        // displayFolder are specified, attempt to select the same folder in
        // one of the other enabled folder modes.
        if (
          !newFolderModes.includes(curFolderMode) &&
          !newFolderMode &&
          !displayedFolder
        ) {
          let row = about3Pane.folderPane.getRowForFolder(selectedFolder);
          // Fallback to the first entry.
          if (!row) {
            row = about3Pane.folderTree.getRowAtIndex(0);
          }
          await selectFolderRow(about3Pane, row);
        }
      }

      if (!displayedFolder && newFolderMode) {
        let row = about3Pane.folderPane.getRowForFolder(
          selectedFolder,
          newFolderMode
        );
        // Fallback to the first entry of newFolderMode.
        if (!row) {
          row = about3Pane.folderPane.getFirstRowForMode(newFolderMode);
        }
        await selectFolderRow(about3Pane, row);
      }

      if (displayedFolder) {
        let row;
        const { folder } = getFolder(displayedFolder);
        // Must stay within the requested folder mode. Otherwise fallback to any
        // of the other enabled folder modes.
        if (newFolderMode) {
          row = about3Pane.folderPane.getRowForFolder(folder, newFolderMode);
          if (!row) {
            throw new ExtensionError(
              `Requested folder is not viewable in the requested folder mode`
            );
          }
        } else {
          row = about3Pane.folderPane.getRowForFolder(folder, curFolderMode);
          if (!row) {
            row = about3Pane.folderPane.getRowForFolder(folder);
          }
          if (!row) {
            throw new ExtensionError(
              `Requested folder is not viewable in any of the enabled folder modes`
            );
          }
        }
        await selectFolderRow(about3Pane, row);
      }

      const getColumnId = sortKey => {
        if (sortKey == "byNone") {
          return "idCol";
        }

        // TODO: Allow to specify *which* custom column. Evaluate to use
        // columnIds here as well.
        if (sortKey == "byCustom") {
          const customColumn = about3Pane.gViewWrapper.dbView.curCustomColumn;
          if (
            ThreadPaneColumns.getDefaultColumns().some(
              c => c.custom && c.id == customColumn
            )
          ) {
            return customColumn;
          }
          dump(
            `updateMailTab: custom sort type but no handler for column: ${customColumn} \n`
          );
          return null;
        }

        const column = ThreadPaneColumns.getDefaultColumns().find(
          c => !c.custom && c.sortKey == sortKey
        );
        if (!column) {
          return null;
        }
        return column.id;
      };

      if (sortType) {
        const sortColumnId = getColumnId(
          // Change "foo" to "byFoo".
          "by" + sortType[0].toUpperCase() + sortType.substring(1)
        );

        if (sortColumnId && sortOrder && sortOrder in Ci.nsMsgViewSortOrder) {
          about3Pane.gViewWrapper.sort(
            sortColumnId,
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

      const tab = tabManager.wrapTab(nativeTab);
      return convertMailTab(tab, context);
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
          const tab = await getTabOrActive(tabId);
          return convertMailTab(tab, context);
        },
        async getCurrent() {
          try {
            const tab = await getTabOrActive();
            return convertMailTab(tab, context);
          } catch (e) {
            // Do not throw, if the active tab is not a mail tab, but return undefined.
            return undefined;
          }
        },

        async create(properties) {
          // Set those properties here already, which can be defined before opening
          // the new tab. All other properties will be applied via an update after
          // the tab has been created.
          const tabParams = {};

          // Set folderURI parameter.
          if (properties.displayedFolder) {
            if (!extension.hasPermission("accountsRead")) {
              throw new ExtensionError(
                'Setting the displayed folder requires the "accountsRead" permission'
              );
            }
            const { folder } = getFolder(properties.displayedFolder);
            tabParams.folderURI = folder.URI;
            delete properties.displayedFolder;
          }

          // Set pane visibility parameters.
          if (properties.folderPaneVisible != null) {
            tabParams.folderPaneVisible = properties.folderPaneVisible;
            delete properties.folderPaneVisible;
          }
          if (properties.messagePaneVisible != null) {
            tabParams.messagePaneVisible = properties.messagePaneVisible;
            delete properties.messagePaneVisible;
          }

          const window = await getNormalWindowReady();
          const nativeTab = window.gTabmail.openTab("mail3PaneTab", tabParams);
          await waitForMailTabReady(nativeTab);
          return updateMailTab(nativeTab, properties);
        },

        async update(tabId, properties) {
          if (properties.displayedFolder) {
            if (!extension.hasPermission("accountsRead")) {
              throw new ExtensionError(
                'Updating the displayed folder requires the "accountsRead" permission'
              );
            }
          }
          const tab = await getTabOrActive(tabId);
          const { nativeTab } = tab;
          return updateMailTab(nativeTab, properties);
        },

        async getListedMessages(tabId) {
          const addListedMessages = async (dbView, messageList) => {
            for (let i = 0; i < dbView.rowCount; i++) {
              await messageList.addMessage(dbView.getMsgHdrAt(i));
            }
            messageList.done();
          };

          const tab = await getTabOrActive(tabId);
          const dbView = tab.nativeTab.chromeBrowser.contentWindow?.gDBView;
          if (dbView) {
            // The view could contain a lot of messages and looping over them
            // could take some time. Do not create a static list which pushes
            // all messages at once into the list, but push messages as soon as
            // they are known and return pages as soon as they are filled. This
            // is the same mechanism used for queries.
            const messageList = messageListTracker.createList(extension);
            setTimeout(() => addListedMessages(dbView, messageList));
            return messageListTracker.getNextPage(messageList);
          }

          return messageListTracker.startList([], extension);
        },

        async getSelectedMessages(tabId) {
          const tab = await getTabOrActive(tabId);
          const dbView = tab.nativeTab.chromeBrowser.contentWindow?.gDBView;
          const messageList = dbView ? dbView.getSelectedMsgHdrs() : [];
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

          const tab = await getTabOrActive(tabId);
          const about3Pane = tab.nativeTab.chromeBrowser.contentWindow;
          let selectedIndices = [];

          if (messageIds.length > 0) {
            const getIndices = msgHdrs => {
              try {
                return msgHdrs
                  .map(
                    about3Pane.gViewWrapper.getViewIndexForMsgHdr,
                    about3Pane.gViewWrapper
                  )
                  .filter(idx => idx != nsMsgViewIndex_None);
              } catch (ex) {
                // Something went wrong, probably no current view.
                return [];
              }
            };

            const msgHdrs = messageIds
              .map(id => extension.messageManager.get(id))
              .filter(Boolean);
            const foundIndices = getIndices(msgHdrs);
            const allInCurrentView = foundIndices.length == msgHdrs.length;
            const allInSameFolder = msgHdrs.every(
              hdr => hdr.folder == msgHdrs[0].folder
            );

            if (!allInCurrentView && !allInSameFolder) {
              throw new ExtensionError(
                `Requested messages are not in the same folder and are also not in the current view, cannot select all of them at the same time`
              );
            }

            // Only enforce folder switch, if the messages are not already in the
            // current view.
            if (allInCurrentView) {
              selectedIndices = foundIndices;
            } else {
              // Stay within the current folderMode, if possible.
              const curFolderMode = about3Pane.folderTree.selectedRow.modeName;
              let row = about3Pane.folderPane.getRowForFolder(
                msgHdrs[0].folder,
                curFolderMode
              );
              // Fallback to any other of the enabled folder modes.
              if (!row) {
                row = about3Pane.folderPane.getRowForFolder(msgHdrs[0].folder);
              }
              if (!row) {
                throw new ExtensionError(
                  `Folder of the requested message(s) is not viewable in any of the enabled folder modes`
                );
              }
              await selectFolderRow(about3Pane, row, true);
              // Update indices after switching the folder.
              selectedIndices = getIndices(msgHdrs);
            }
          }

          about3Pane.threadTree.selectedIndices = selectedIndices;
          if (selectedIndices.length > 0) {
            about3Pane.threadTree.scrollToIndex(selectedIndices[0], true);
          }
        },

        async setQuickFilter(tabId, state) {
          const tab = await getTabOrActive(tabId);
          const nativeTab = tab.nativeTab;
          const about3Pane = nativeTab.chromeBrowser.contentWindow;

          const filterer = about3Pane.quickFilterBar.filterer;
          const oldSearchTerm = filterer.filterValues.text.text;
          filterer.clear();

          // Map of QuickFilter state names to possible WebExtensions state names.
          const stateMap = {
            unread: "unread",
            starred: "flagged",
            addrBook: "contact",
            attachment: "attachment",
          };

          filterer.visible = state.show !== false;
          for (const [key, name] of Object.entries(stateMap)) {
            filterer.setFilterValue(key, state[name]);
            about3Pane.quickFilterBar.updateFiltersSettings(key, state[name]);
          }

          // Filters we have to manually set the state of, since it is generated
          // in onCommand for the UI based input.
          if (state.tags) {
            filterer.filterValues.tags = {
              mode: "OR",
              tags: {},
            };
            for (const tag of MailServices.tags.getAllTags()) {
              filterer.filterValues.tags[tag.key] = null;
            }
            if (typeof state.tags == "object") {
              filterer.filterValues.tags.mode =
                state.tags.mode == "any" ? "OR" : "AND";
              for (const [key, value] of Object.entries(state.tags.tags)) {
                filterer.filterValues.tags.tags[key] = value;
              }
            }
          }
          if (state.text) {
            const states = {
              recipients: state.text.recipients || false,
              sender: state.text.author || false,
              subject: state.text.subject || false,
              body: state.text.body || false,
            };
            if (
              about3Pane.document
                .getElementById("qfb-qs-textbox")
                .overrideSearchTerm(state.text.text)
            ) {
              filterer.filterValues.text = {
                states,
                text: state.text.text,
              };
              about3Pane.document.getElementById(
                "quick-filter-bar-filter-text-bar"
              ).hidden = !state.text.text;
            } else {
              filterer.filterValues.text = {
                states,
                text: oldSearchTerm,
              };
            }
          }

          about3Pane.quickFilterBar.reflectFiltererState();
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
