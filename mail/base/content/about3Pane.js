/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// mailCommon.js
/* globals commandController, dbViewWrapperListener, nsMsgViewIndex_None */
/* globals gDBView: true, gFolder: true, gViewWrapper: true */

// mailContext.js
/* globals mailContextMenu */

// globalOverlay.js
/* globals goDoCommand */

// mail-offline.js
/* globals MailOfflineMgr */

// junkCommands.js
/* globals analyzeMessagesForJunk deleteJunkInFolder filterFolderForJunk */

// quickFilterBar.js
/* globals quickFilterBar */

// utilityOverlay.js
/* globals validateFileName */

var { DBViewWrapper } = ChromeUtils.import(
  "resource:///modules/DBViewWrapper.jsm"
);
var { FolderTreeProperties } = ChromeUtils.import(
  "resource:///modules/FolderTreeProperties.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { UIDensity } = ChromeUtils.import("resource:///modules/UIDensity.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  FeedUtils: "resource:///modules/FeedUtils.jsm",
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MailE10SUtils: "resource:///modules/MailE10SUtils.jsm",
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.jsm",
});

const XULSTORE_URL = "chrome://messenger/content/messenger.xhtml";

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

const { DEFAULT_COLUMNS } = ChromeUtils.importESModule(
  "chrome://messenger/content/thread-pane-columns.mjs"
);

var folderTree,
  threadTree,
  webBrowser,
  messageBrowser,
  multiMessageBrowser,
  accountCentralBrowser;

window.addEventListener("DOMContentLoaded", async event => {
  if (event.target != document) {
    return;
  }

  UIDensity.registerWindow(window);

  folderTree = document.getElementById("folderTree");

  paneLayout.init();
  folderPaneContextMenu.init();
  await folderPane.init();
  await threadPane.init();

  webBrowser = document.getElementById("webBrowser");
  messageBrowser = document.getElementById("messageBrowser");
  multiMessageBrowser = document.getElementById("multiMessageBrowser");
  accountCentralBrowser = document.getElementById("accountCentralBrowser");

  multiMessageBrowser.docShell.allowDNSPrefetch = false;

  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.all
  );

  // Set up the initial state using information which may have been provided
  // by mailTabs.js, or the saved state from the XUL store, or the defaults.
  restoreState(window.openingState);
  delete window.openingState;

  // Finally, add the folderTree listener and trigger it. Earlier events
  // (triggered by `folderPane.init` and possibly `restoreState`) are ignored
  // to avoid unnecessarily loading the thread tree or Account Central.
  folderTree.addEventListener("select", folderPane);
  folderTree.dispatchEvent(new CustomEvent("select"));

  // Attach the progress listener for the webBrowser. For the messageBrowser this
  // happens in the "aboutMessageLoaded" event mailWindow.js.
  top.contentProgress.addProgressListenerToBrowser(webBrowser);
});

window.addEventListener("unload", () => {
  MailServices.mailSession.RemoveFolderListener(folderListener);
  gViewWrapper?.close();
});

var paneLayout = {
  init() {
    this.folderPaneSplitter = document.getElementById("folderPaneSplitter");
    this.messagePaneSplitter = document.getElementById("messagePaneSplitter");

    for (let [splitter, properties, storeID] of [
      [this.folderPaneSplitter, ["width"], "folderPaneBox"],
      [this.messagePaneSplitter, ["height", "width"], "messagepaneboxwrapper"],
    ]) {
      for (let property of properties) {
        let value = Services.xulStore.getValue(XULSTORE_URL, storeID, property);
        if (value) {
          splitter[property] = value;
        }
      }

      splitter.storeAttr = function(attrName, attrValue) {
        Services.xulStore.setValue(XULSTORE_URL, storeID, attrName, attrValue);
      };

      splitter.addEventListener("splitter-resized", () => {
        if (splitter.resizeDirection == "vertical") {
          splitter.storeAttr("height", splitter.height);
        } else {
          splitter.storeAttr("width", splitter.width);
        }
      });
    }

    this.messagePaneSplitter.addEventListener("splitter-collapsed", () => {
      // Clear any loaded page or messages.
      clearWebPage();
      clearMessage();
      clearMessages();
      this.messagePaneSplitter.storeAttr("collapsed", true);
    });

    this.messagePaneSplitter.addEventListener("splitter-expanded", () => {
      // Load the selected messages.
      threadTree.dispatchEvent(new CustomEvent("select"));
      this.messagePaneSplitter.storeAttr("collapsed", false);
    });

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "layoutPreference",
      "mail.pane_config.dynamic",
      null,
      (name, oldValue, newValue) => this.setLayout(newValue)
    );
    this.setLayout(this.layoutPreference);
  },

  setLayout(preference) {
    document.body.classList.remove(
      "layout-classic",
      "layout-vertical",
      "layout-wide"
    );
    switch (preference) {
      case 1:
        document.body.classList.add("layout-wide");
        this.messagePaneSplitter.resizeDirection = "vertical";
        break;
      case 2:
        document.body.classList.add("layout-vertical");
        this.messagePaneSplitter.resizeDirection = "horizontal";
        break;
      default:
        document.body.classList.add("layout-classic");
        this.messagePaneSplitter.resizeDirection = "vertical";
        break;
    }
  },
};

var folderPaneContextMenu = {
  /**
   * Commands handled by commandController.
   *
   * @type {Object.<string, string>}
   */
  _commands: {
    "folderPaneContext-new": "cmd_newFolder",
    "folderPaneContext-remove": "cmd_deleteFolder",
    "folderPaneContext-rename": "cmd_renameFolder",
    "folderPaneContext-compact": "cmd_compactFolder",
    "folderPaneContext-emptyTrash": "cmd_emptyTrash",
  },

  /**
   * Current state of commandController commands. Set to null to invalidate
   * the states.
   *
   * @type {Object.<string, boolean>|null}
   */
  _commandStates: null,

  init() {
    let folderPaneContext = document.getElementById("folderPaneContext");
    folderPaneContext.addEventListener("popupshowing", this);
    folderPaneContext.addEventListener("command", this);
    folderTree.addEventListener("select", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "popupshowing":
        this.onPopupShowing(event);
        break;
      case "command":
        this.onCommand(event);
        break;
      case "select":
        this._commandStates = null;
        break;
    }
  },

  /**
   * Gets the enabled state of a command. If the state is unknown (because the
   * selected folder has changed) the states of all the commands are worked
   * out together to save unnecessary work.
   *
   * @param {string} command
   */
  getCommandState(command) {
    if (!gFolder) {
      return false;
    }
    if (this._commandStates === null) {
      let {
        canCompact,
        canCreateSubfolders,
        canRename,
        deletable,
        flags,
        isServer,
        isSpecialFolder,
        server,
        URI,
      } = gFolder;
      let isJunk = flags & Ci.nsMsgFolderFlags.Junk;
      let isTrash = isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true);
      let isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
      let serverType = server.type;
      let showNewFolderItem =
        (serverType != "nntp" && canCreateSubfolders) ||
        flags & Ci.nsMsgFolderFlags.Inbox;

      this._commandStates = {
        cmd_newFolder: showNewFolderItem,
        cmd_deleteFolder: isJunk
          ? FolderUtils.canRenameDeleteJunkMail(URI)
          : deletable,
        cmd_renameFolder:
          (!isServer &&
            canRename &&
            !(flags & Ci.nsMsgFolderFlags.SpecialUse)) ||
          isVirtual ||
          (isJunk && FolderUtils.canRenameDeleteJunkMail(URI)),
        cmd_compactFolder:
          !isVirtual &&
          canCompact &&
          gFolder.isCommandEnabled("cmd_compactFolder"),
        cmd_emptyTrash: isTrash,
      };
    }
    return this._commandStates[command];
  },

  onPopupShowing() {
    function showItem(id, show) {
      let item = document.getElementById(id);
      if (item) {
        item.hidden = !show;
      }
    }

    function checkItem(id, checked) {
      let item = document.getElementById(id);
      if (item) {
        // Always convert truthy/falsy to boolean before string.
        item.setAttribute("checked", !!checked);
      }
    }

    // Ask commandController about the commands it controls.
    for (let [id, command] of Object.entries(this._commands)) {
      showItem(id, commandController.isCommandEnabled(command));
    }

    let {
      canCreateSubfolders,
      flags,
      isServer,
      isSpecialFolder,
      server,
    } = gFolder;
    let isJunk = flags & Ci.nsMsgFolderFlags.Junk;
    let isTrash = isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true);
    let isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
    let isRealFolder = !isServer && !isVirtual;
    let serverType = server.type;

    showItem(
      "folderPaneContext-getMessages",
      (isServer && serverType != "none") ||
        (["nntp", "rss"].includes(serverType) && !isTrash && !isVirtual)
    );
    let showPauseAll = isServer && FeedUtils.isFeedFolder(gFolder);
    showItem("folderPaneContext-pauseAllUpdates", showPauseAll);
    if (showPauseAll) {
      let optionsAcct = FeedUtils.getOptionsAcct(server);
      checkItem("folderPaneContext-pauseAllUpdates", !optionsAcct.doBiff);
    }
    let showPaused = !isServer && FeedUtils.getFeedUrlsInFolder(gFolder);
    showItem("folderPaneContext-pauseUpdates", showPaused);
    if (showPaused) {
      let properties = FeedUtils.getFolderProperties(gFolder);
      checkItem(
        "folderPaneContext-pauseUpdates",
        properties.includes("isPaused")
      );
    }

    showItem("folderPaneContext-searchMessages", !isVirtual);
    if (isVirtual) {
      showItem("folderPaneContext-subscribe", false);
    } else if (serverType == "rss" && !isTrash) {
      showItem("folderPaneContext-subscribe", true);
    } else {
      showItem(
        "folderPaneContext-subscribe",
        isServer && ["imap", "nntp"].includes(serverType)
      );
    }
    showItem(
      "folderPaneContext-newsUnsubscribe",
      isRealFolder && serverType == "nntp"
    );

    let showNewFolderItem =
      (serverType != "nntp" && canCreateSubfolders) ||
      flags & Ci.nsMsgFolderFlags.Inbox;
    if (showNewFolderItem) {
      document
        .getElementById("folderPaneContext-new")
        .setAttribute(
          "label",
          messengerBundle.GetStringFromName(
            isServer || flags & Ci.nsMsgFolderFlags.Inbox
              ? "newFolder"
              : "newSubfolder"
          )
        );
    }

    showItem(
      "folderPaneContext-markMailFolderAllRead",
      isRealFolder && serverType != "nntp"
    );
    showItem(
      "folderPaneContext-markNewsgroupAllRead",
      isRealFolder && serverType == "nntp"
    );
    showItem("folderPaneContext-emptyJunk", isJunk);
    showItem(
      "folderPaneContext-sendUnsentMessages",
      flags & Ci.nsMsgFolderFlags.Queue
    );

    showItem("folderPaneContext-favoriteFolder", !isServer);
    if (!isServer) {
      checkItem(
        "folderPaneContext-favoriteFolder",
        flags & Ci.nsMsgFolderFlags.Favorite
      );
    }
    showItem("folderPaneContext-properties", !isServer);
    showItem("folderPaneContext-markAllFoldersRead", isServer);

    showItem("folderPaneContext-settings", isServer);

    let lastItem;
    for (let child of document.getElementById("folderPaneContext").children) {
      if (child.localName == "menuseparator") {
        child.hidden = !lastItem || lastItem.localName == "menuseparator";
      }
      if (!child.hidden) {
        lastItem = child;
      }
    }
    if (lastItem.localName == "menuseparator") {
      lastItem.hidden = true;
    }
  },

  onCommand(event) {
    // If commandController handles this command, ask it to do so.
    if (event.target.id in this._commands) {
      commandController.doCommand(this._commands[event.target.id], event);
      return;
    }

    let topChromeWindow = window.browsingContext.topChromeWindow;
    switch (event.target.id) {
      case "folderPaneContext-getMessages":
        topChromeWindow.MsgGetMessage();
        break;
      case "folderPaneContext-pauseAllUpdates":
        topChromeWindow.MsgPauseUpdates(
          [gFolder],
          event.target.getAttribute("checked") == "true"
        );
        break;
      case "folderPaneContext-pauseUpdates":
        topChromeWindow.MsgPauseUpdates(
          [gFolder],
          event.target.getAttribute("checked") == "true"
        );
        break;
      case "folderPaneContext-openNewTab":
        topChromeWindow.MsgOpenNewTabForFolders([gFolder], {
          event,
          folderPaneVisible: !paneLayout.folderPaneSplitter.isCollapsed,
          messagePaneVisible: !paneLayout.messagePaneSplitter.isCollapsed,
        });
        break;
      case "folderPaneContext-openNewWindow":
        topChromeWindow.MsgOpenNewWindowForFolder(gFolder.URI, -1);
        break;
      case "folderPaneContext-searchMessages":
        commandController.doCommand("cmd_searchMessages");
        break;
      case "folderPaneContext-subscribe":
        topChromeWindow.MsgSubscribe(gFolder);
        break;
      case "folderPaneContext-newsUnsubscribe":
        topChromeWindow.MsgUnsubscribe([gFolder]);
        break;
      case "folderPaneContext-markMailFolderAllRead":
      case "folderPaneContext-markNewsgroupAllRead":
        topChromeWindow.MsgMarkAllRead([gFolder]);
        break;
      case "folderPaneContext-emptyJunk":
        folderPane.emptyJunk(gFolder);
        break;
      case "folderPaneContext-sendUnsentMessages":
        topChromeWindow.SendUnsentMessages();
        break;
      case "folderPaneContext-favoriteFolder":
        gFolder.toggleFlag(Ci.nsMsgFolderFlags.Favorite);
        break;
      case "folderPaneContext-properties":
        folderPane.editFolder(gFolder);
        break;
      case "folderPaneContext-markAllFoldersRead":
        topChromeWindow.MsgMarkAllFoldersRead([gFolder]);
        break;
      case "folderPaneContext-settings":
        folderPane.editFolder(gFolder);
        break;
    }
  },
};

var folderPane = {
  _modes: {
    all: {
      active: false,
      canBeCompact: false,

      initServer(server) {
        let accountRow = folderPane._createServerRow("all", server);
        this.containerList.appendChild(accountRow);
        folderPane._addSubFolders(server.rootFolder, accountRow, "all");
      },

      addFolder(parentFolder, childFolder) {
        FolderTreeProperties.setIsExpanded(childFolder.URI, "all", true);
        if (childFolder.server.hidden) {
          return;
        }
        if (!parentFolder) {
          // TODO: have to find the right position?
          this.containerList.appendChild(
            folderPane._createServerRow("all", childFolder.server)
          );
          return;
        }

        let parentRow = folderPane.getRowForFolder(parentFolder, "all");
        if (!parentRow) {
          console.error("no parentRow for ", parentFolder.URI, childFolder.URI);
        }
        folderTree.expandRow(parentRow);
        let childRow = folderPane._createFolderRow("all", childFolder);
        parentRow.appendChildInOrder(childRow);
      },

      removeFolder(parentFolder, childFolder) {
        folderPane.getRowForFolder(childFolder, "all")?.remove();
      },
    },
    smart: {
      active: false,
      canBeCompact: false,

      _folderTypes: [
        { flag: Ci.nsMsgFolderFlags.Inbox, name: "Inbox" },
        { flag: Ci.nsMsgFolderFlags.Drafts, name: "Drafts" },
        { flag: Ci.nsMsgFolderFlags.Templates, name: "Templates" },
        { flag: Ci.nsMsgFolderFlags.SentMail, name: "Sent" },
        { flag: Ci.nsMsgFolderFlags.Archive, name: "Archives" },
        { flag: Ci.nsMsgFolderFlags.Junk, name: "Junk" },
        { flag: Ci.nsMsgFolderFlags.Trash, name: "Trash" },
        // { flag: Ci.nsMsgFolderFlags.Queue, name: "Outbox" },
      ],

      init() {
        let smartServer = MailServices.accounts.findServer(
          "nobody",
          "smart mailboxes",
          "none"
        );
        if (!smartServer) {
          smartServer = MailServices.accounts.createIncomingServer(
            "nobody",
            "smart mailboxes",
            "none"
          );
          // We don't want the "smart" server/account leaking out into the ui in
          // other places, so set it as hidden.
          smartServer.hidden = true;
          let account = MailServices.accounts.createAccount();
          account.incomingServer = smartServer;
        }
        let smartRoot = smartServer.rootFolder;

        for (let folderType of this._folderTypes) {
          let folder = smartRoot.getChildWithURI(
            `${smartRoot.URI}/${folderType.name}`,
            false,
            true
          );
          if (!folder) {
            try {
              let searchFolders = [];
              for (let server of MailServices.accounts.allServers) {
                for (let f of server.rootFolder.getFoldersWithFlags(
                  folderType.flag
                )) {
                  searchFolders.push(f);
                }
              }

              let wrapper = VirtualFolderHelper.createNewVirtualFolder(
                folderType.name,
                smartRoot,
                searchFolders,
                "ALL",
                true
              );
              folder = wrapper.virtualFolder;
              folder.setFlag(folderType.flag);
            } catch (ex) {
              console.error(ex);
              continue;
            }
          }
          let row = folderPane._createFolderRow("smart", folder);
          this.containerList.appendChild(row);
          folderType.list = row.childList;
        }
      },

      initServer(server) {
        for (let folder of server.rootFolder.subFolders) {
          this.addFolder(server.rootFolder, folder);
        }
      },

      addFolder(parentFolder, childFolder) {
        let flags = childFolder.flags;
        for (let folderType of this._folderTypes) {
          if (flags & folderType.flag) {
            let folderRow = folderPane._createFolderRow(
              "smart",
              childFolder,
              true
            );
            folderType.list?.appendChild(folderRow);
            break;
          }
        }
      },
    },
    unread: {
      active: false,
      canBeCompact: true,

      _unreadFilter(folder) {
        return folder.getNumUnread(true) > 0;
      },

      initServer(server) {
        if (this._unreadFilter(server.rootFolder)) {
          let accountRow = folderPane._createServerRow("unread", server);
          this.containerList.appendChild(accountRow);
          folderPane._addSubFolders(
            server.rootFolder,
            accountRow,
            "unread",
            this._unreadFilter
          );
        }
      },

      removeFolder(parentFolder, childFolder) {
        if (this._unreadFilter(parentFolder)) {
          // If parentFolder has messages, remove childFolder, which doesn't.
          folderPane.getRowForFolder(childFolder, "unread")?.remove();
          return;
        }
        while (parentFolder) {
          if (!parentFolder.parent || this._unreadFilter(parentFolder.parent)) {
            // If parentFolder's parent has messages, remove parentFolder, which doesn't.
            folderPane.getRowForFolder(parentFolder, "unread")?.remove();
            break;
          }
          parentFolder = parentFolder.parent;
        }
      },

      changeUnreadCount(folder, oldValue, newValue) {
        if (newValue === 0) {
          while (folder) {
            if (!folder.parent || this._unreadFilter(folder.parent)) {
              // If this folder's parent has messages, remove this folder, which doesn't.
              folderPane.getRowForFolder(folder, "unread")?.remove();
              break;
            }
            folder = folder.parent;
          }
        } else {
          if (!folderPane.getRowForFolder(folder.rootFolder, "unread")) {
            this.initServer(folder.server);
            return;
          }

          while (folder) {
            let parentRow = folderPane.getRowForFolder(folder.parent, "unread");
            if (parentRow) {
              let folderRow = folderPane._createFolderRow("unread", folder);
              folderPane._addSubFolders(
                folder,
                folderRow,
                "unread",
                this._unreadFilter
              );
              parentRow.appendChildInOrder(folderRow);
              break;
            }
            folder = folder.parent;
          }
        }
      },
    },
    favorite: {
      active: false,
      canBeCompact: true,

      initServer(server) {
        let recurse = parent => {
          for (let folder of parent.subFolders) {
            this.addFolder(parent, folder);
            recurse(folder);
          }
        };
        recurse(server.rootFolder);
      },

      addFolder(parentFolder, childFolder) {
        if (childFolder.flags & Ci.nsMsgFolderFlags.Favorite) {
          let folderRow = folderPane._createFolderRow(
            "favorite",
            childFolder,
            false
          );
          // TODO: In order?
          this.containerList.appendChild(folderRow);
        }
      },

      changeFolderFlag(folder, oldValue, newValue) {
        oldValue &= Ci.nsMsgFolderFlags.Favorite;
        newValue &= Ci.nsMsgFolderFlags.Favorite;

        if (oldValue == newValue) {
          return;
        }

        if (oldValue) {
          folderPane.getRowForFolder(folder, "favorite")?.remove();
        }
        if (newValue) {
          let folderRow = folderPane._createFolderRow(
            "favorite",
            folder,
            false
          );
          // TODO: In order?
          this.containerList.appendChild(folderRow);
        }
      },
    },
    recent: {
      active: false,
      canBeCompact: false,

      init() {
        let folders = FolderUtils.getMostRecentFolders(
          MailServices.accounts.allFolders,
          Services.prefs.getIntPref("mail.folder_widget.max_recent"),
          "MRUTime"
        );
        for (let folder of folders) {
          let folderRow = folderPane._createFolderRow("recent", folder, false);
          this.containerList.appendChild(folderRow);
        }
      },
    },
  },

  async init() {
    await FolderTreeProperties.ready;

    this._modeTemplate = document.getElementById("modeTemplate");
    this._folderTemplate = document.getElementById("folderTemplate");

    this._isCompact =
      Services.xulStore.getValue(XULSTORE_URL, "folderTree", "compact") ===
      "true";
    let activeModes = Services.xulStore.getValue(
      XULSTORE_URL,
      "folderTree",
      "mode"
    );
    activeModes = activeModes.split(",");
    this.activeModes = activeModes;

    folderTree.addEventListener("contextmenu", this);
    folderTree.addEventListener("collapsed", this);
    folderTree.addEventListener("expanded", this);
    folderTree.addEventListener("dragstart", this);
    folderTree.addEventListener("dragover", this);
    folderTree.addEventListener("dragleave", this);
    folderTree.addEventListener("drop", this);

    document.getElementById(
      "folderPaneHeaderBar"
    ).hidden = this.isFolderPaneHeaderHidden();
    document
      .getElementById("folderPaneGetMessages")
      .addEventListener("click", () => {
        top.MsgGetMessagesForAccount();
      });
    document
      .getElementById("folderPaneWriteMessage")
      .addEventListener("click", event => {
        top.MsgNewMessage(event);
      });
    this.moreContext = document.getElementById("folderPaneMoreContext");
    document
      .getElementById("folderPaneMoreButton")
      .addEventListener("click", event => {
        this.moreContext.openPopup(event.target, { triggerEvent: event });
      });

    this.updateWidgets();
  },

  handleEvent(event) {
    switch (event.type) {
      case "select":
        this._onSelect(event);
        break;
      case "contextmenu":
        this._onContextMenu(event);
        break;
      case "collapsed":
        this._onCollapsed(event);
        break;
      case "expanded":
        this._onExpanded(event);
        break;
      case "dragstart":
        this._onDragStart(event);
        break;
      case "dragover":
        this._onDragOver(event);
        break;
      case "dragleave":
        this._clearDropTarget(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
    }
  },

  /**
   * The names of all active modes.
   *
   * @type {string[]}
   */
  get activeModes() {
    return Object.entries(this._modes)
      .filter(([name, mode]) => mode.active)
      .map(([name, mode]) => name);
  },

  set activeModes(modes) {
    modes = modes.filter(m => m in this._modes);
    if (modes.length == 0) {
      modes = ["all"];
    }
    for (let name of Object.keys(this._modes)) {
      this._toggleMode(name, modes.includes(name));
    }
    for (let name of modes) {
      let { container, containerHeader } = this._modes[name];
      containerHeader.hidden = modes.length == 1;
      folderTree.appendChild(container);
    }
    Services.xulStore.setValue(
      XULSTORE_URL,
      "folderTree",
      "mode",
      this.activeModes.join(",")
    );
  },

  /**
   * Do any of the active modes have a compact variant?
   *
   * @type {boolean}
   */
  get canBeCompact() {
    return Object.values(this._modes).some(
      mode => mode.active && mode.canBeCompact
    );
  },

  /**
   * Are compact variants enabled?
   *
   * @type {boolean}
   */
  get isCompact() {
    return this._isCompact;
  },

  set isCompact(value) {
    this._isCompact = value;
    Services.xulStore.setValue(XULSTORE_URL, "folderTree", "compact", value);
  },

  /**
   * Show or hide a folder tree mode.
   *
   * @param {string} modeName
   * @param {boolean} active
   */
  _toggleMode(modeName, active) {
    if (!(modeName in this._modes)) {
      throw new Error(`Unknown folder tree mode: ${modeName}`);
    }
    let mode = this._modes[modeName];
    if (mode.active == active) {
      return;
    }

    if (!active) {
      mode.container.remove();
      delete mode.container;
      mode.active = false;
      return;
    }

    let container = this._modeTemplate.content.firstElementChild.cloneNode(
      true
    );
    container.dataset.mode = modeName;

    mode.container = container;
    mode.containerHeader = container.querySelector(".mode-name");
    mode.containerHeader.textContent = messengerBundle.GetStringFromName(
      `folderPaneModeHeader_${modeName}`
    );
    mode.containerList = container.querySelector("ul");
    if (typeof mode.init == "function") {
      mode.init();
    }
    if (typeof mode.initServer == "function") {
      for (let account of MailServices.accounts.accounts) {
        if (account.incomingServer.type != "im") {
          mode.initServer(account.incomingServer);
        }
      }
    }
    mode.active = true;
  },

  /**
   * Create a FolderTreeRow representing a server.
   *
   * @param {string} modeName - The name of the mode this row belongs to.
   * @param {nsIMsgIncomingServer} server - The server the row represents.
   * @returns {FolderTreeRow}
   */
  _createServerRow(modeName, server) {
    let row = document.createElement("li", { is: "folder-tree-row" });
    row.modeName = modeName;
    row.setServer(server);
    return row;
  },

  /**
   * Create a FolderTreeRow representing a folder.
   *
   * @param {string} modeName - The name of the mode this row belongs to.
   * @param {nsIMsgFolder} folder - The folder the row represents.
   * @param {boolean} useServerName - If true, use the server's name instead
   *   of the folder's name for the label of this row.
   * @returns {FolderTreeRow}
   */
  _createFolderRow(modeName, folder, useServerName) {
    let row = document.createElement("li", { is: "folder-tree-row" });
    row.modeName = modeName;
    row.setFolder(folder, useServerName);
    return row;
  },

  /**
   * @callback folderFilterCallback
   * @param {FolderTreeRow} row
   * @returns {boolean} - True if the folder should be added to the parent row.
   */
  /**
   * Add all subfolders to a row representing a folder. Called recursively,
   * so all descendants are ultimately added.
   *
   * @param {nsIMsgFolder} parentFolder
   * @param {FolderTreeRow} parentRow - The row representing `parentFolder`.
   * @param {string} modeName - The name of the mode this row belongs to.
   * @param {folderFilterCallback} [filterFunction] - Optional callback to add
   *   only some subfolders to the row.
   */
  _addSubFolders(parentFolder, parentRow, modeName, filterFunction) {
    let subFolders = parentFolder.subFolders;
    if (!subFolders.length) {
      return;
    }

    if (parentFolder.isServer) {
      try {
        parentFolder.server.QueryInterface(Ci.nsIImapIncomingServer);
      } catch {
        // Doesn't QI? No big deal.
      }
      if (parentFolder.server.isGMailServer) {
        for (let i = 0; i < subFolders.length; i++) {
          let folder = subFolders[i];
          if (folder.name == "[Gmail]") {
            subFolders.splice(i, 1, ...folder.subFolders);
          }
        }
      }
    }

    subFolders.sort((a, b) => a.compareSortKeys(b));

    for (let folder of subFolders) {
      if (typeof filterFunction == "function" && !filterFunction(folder)) {
        continue;
      }
      let folderRow = folderPane._createFolderRow(modeName, folder);
      this._addSubFolders(folder, folderRow, modeName, filterFunction);
      parentRow.childList.appendChild(folderRow);
    }
  },

  /**
   * Get the first row representing a folder, even if it is hidden.
   *
   * @param {nsIMsgFolder|string} folderOrURI - The folder to find, or its URI.
   * @param {string?} modeName - If given, only look in the folders for this
   *   mode, otherwise look in the whole tree.
   * @returns {FolderTreeRow}
   */
  getRowForFolder(folderOrURI, modeName) {
    if (folderOrURI instanceof Ci.nsIMsgFolder) {
      folderOrURI = folderOrURI.URI;
    }
    let container = modeName ? this._modes[modeName].container : folderTree;
    return [...container.querySelectorAll("li")].find(
      row => row.uri == folderOrURI
    );
  },

  /**
   * Loop through all currently active modes and call the required function if
   * it exists.
   *
   * @param {string} functionName - The name of the function to call.
   * @param  {...any} args - The list of arguments to pass to the function.
   */
  _forAllActiveModes(functionName, ...args) {
    for (let mode of Object.values(this._modes)) {
      if (!mode.active || typeof mode[functionName] != "function") {
        continue;
      }
      try {
        mode[functionName](...args);
      } catch (ex) {
        console.error(ex);
      }
    }
  },

  /**
   * Update the folder pane UI and add rows for all newly created folders.
   *
   * @param {?nsIMsgFolder} parentFolder - The parent of the newly created
   *   folder.
   * @param {nsIMsgFolder} childFolder - The newly created folder.
   */
  addFolder(parentFolder, childFolder) {
    if (!parentFolder) {
      // A server folder was added, so check if we need to update actions.
      this.updateWidgets();
    }
    this._forAllActiveModes("addFolder", parentFolder, childFolder);
  },

  /**
   * Update the folder pane UI and remove rows for all removed folders.
   *
   * @param {?nsIMsgFolder} parentFolder - The parent of the removed folder.
   * @param {nsIMsgFolder} childFolder - The removed folder.
   */
  removeFolder(parentFolder, childFolder) {
    if (!parentFolder) {
      // A server folder was removed, so check if we need to update actions.
      this.updateWidgets();
    }
    this._forAllActiveModes("removeFolder", parentFolder, childFolder);
  },

  /**
   * Update the list of folders if the current mode rely on specific flags.
   *
   * @param {nsIMsgFolder} item - The target folder.
   * @param {nsMsgFolderFlags} oldValue - The old flag value.
   * @param {nsMsgFolderFlags} newValue - The updated flag value.
   */
  changeFolderFlag(item, oldValue, newValue) {
    this._forAllActiveModes("changeFolderFlag", item, oldValue, newValue);
  },

  /**
   * @callback folderRowChangeCallback
   * @param {FolderTreeRow} row
   */
  /**
   * Perform a function on all rows representing a folder.
   *
   * @param {nsIMsgFolder|string} folderOrURI - The folder to change, or its URI.
   * @param {folderRowChangeCallback} callback
   */
  _changeRows(folderOrURI, callback) {
    if (folderOrURI instanceof Ci.nsIMsgFolder) {
      folderOrURI = folderOrURI.URI;
    }
    for (let row of folderTree.querySelectorAll("li")) {
      if (row.uri == folderOrURI) {
        callback(row);
      }
    }
  },

  /**
   * Called when a folder's new messages state changes.
   *
   * @param {nsIMsgFolder} folder
   * @param {boolean} hasNewMessages
   */
  changeNewMessages(folder, hasNewMessages) {
    this._changeRows(folder, row =>
      row.classList.toggle("new-messages", hasNewMessages)
    );
  },

  /**
   * Called when a folder's unread count changes, to update the UI.
   *
   * @param {nsIMsgFolder} folder
   * @param {integer} oldValue
   * @param {integer} newValue
   */
  changeUnreadCount(folder, oldValue, newValue) {
    this._changeRows(folder, row => (row.unreadCount = newValue));

    if (this._modes.unread.active) {
      this._modes.unread.changeUnreadCount(folder, oldValue, newValue);
    }
  },

  _onSelect(event) {
    clearWebPage();
    clearMessage();
    clearMessages();

    let uri = folderTree.rows[folderTree.selectedIndex]?.uri;
    if (!uri) {
      return;
    }

    gFolder = MailServices.folderLookup.getFolderForURL(uri);

    document.head.querySelector(
      `link[rel="icon"]`
    ).href = FolderUtils.getFolderIcon(gFolder);

    // Clean up any existing view wrapper.
    gViewWrapper?.close();
    threadTree.invalidate();

    if (gFolder.isServer) {
      document.title = gFolder.server.prettyName;
      gViewWrapper = gDBView = threadTree.view = null;

      clearWebPage();
      clearMessage();
      clearMessages();

      MailE10SUtils.loadURI(
        accountCentralBrowser,
        `chrome://messenger/content/msgAccountCentral.xhtml?folderURI=${encodeURIComponent(
          gFolder.URI
        )}`
      );
      document.body.classList.add("account-central");
      accountCentralBrowser.hidden = false;
    } else {
      document.title = `${gFolder.name} - ${gFolder.server.prettyName}`;
      document.body.classList.remove("account-central");
      accountCentralBrowser.hidden = true;

      threadPane.restoreColumns();

      gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
      gViewWrapper._viewFlags = Ci.nsMsgViewFlagsType.kThreadedDisplay;
      gViewWrapper.open(gFolder);
      gDBView = gViewWrapper.dbView;

      // Tell the view about the tree. nsITreeView.setTree can't be used because
      // it needs a XULTreeElement and threadTree isn't one. Strictly speaking
      // the shim passed here isn't a tree either (TreeViewListbox can't be made
      // to QI to anything) but it does implement the required methods.
      gViewWrapper.dbView?.setJSTree({
        QueryInterface: ChromeUtils.generateQI(["nsIMsgJSTree"]),
        _inBatch: false,
        beginUpdateBatch() {
          this._inBatch = true;
        },
        endUpdateBatch() {
          this._inBatch = false;
        },
        ensureRowIsVisible(index) {
          if (!this._inBatch) {
            threadTree.scrollToIndex(index);
          }
        },
        invalidate() {
          if (!this._inBatch) {
            threadTree.invalidate();
          }
        },
        invalidateRange(startIndex, endIndex) {
          if (this._inBatch) {
            return;
          }

          for (let index = startIndex; index <= endIndex; index++) {
            threadTree.invalidateRow(index);
          }
        },
        rowCountChanged(index, count) {
          if (!this._inBatch) {
            threadTree.rowCountChanged(index, count);
          }
        },
      });

      threadPane.restoreSortIndicator();
    }

    window.dispatchEvent(
      new CustomEvent("folderURIChanged", { bubbles: true, detail: uri })
    );
  },

  _onContextMenu(event) {
    if (folderTree.selectedIndex == -1) {
      return;
    }

    folderTree.selectedIndex = folderTree.rows.indexOf(
      event.target.closest("li")
    );

    let popup = document.getElementById("folderPaneContext");
    popup.openPopupAtScreen(event.screenX, event.screenY, true);
    event.preventDefault();
  },

  _onCollapsed({ target }) {
    if (target.uri) {
      let mode = target.closest("[data-mode]").dataset.mode;
      FolderTreeProperties.setIsExpanded(target.uri, mode, false);
    }
  },

  _onExpanded({ target }) {
    if (target.uri) {
      let mode = target.closest("[data-mode]").dataset.mode;
      FolderTreeProperties.setIsExpanded(target.uri, mode, true);
    }
  },

  _onDragStart(event) {
    let row = event.target.closest(`li[is="folder-tree-row"]`);
    if (!row) {
      event.preventDefault();
      return;
    }

    let folder = MailServices.folderLookup.getFolderForURL(row.uri);
    if (!folder || folder.isServer || folder.server.type == "nntp") {
      // TODO: Fix NNTP group reordering and enable.
      event.preventDefault();
      return;
    }

    event.dataTransfer.mozSetDataAt("text/x-moz-folder", folder, 0);
    event.dataTransfer.effectAllowed = "copyMove";
  },

  _onDragOver(event) {
    event.dataTransfer.dropEffect = "none";
    event.preventDefault();

    let row = event.target.closest("li");
    if (!row) {
      return;
    }

    let targetFolder = MailServices.folderLookup.getFolderForURL(row.uri);
    if (!targetFolder) {
      return;
    }

    let types = Array.from(event.dataTransfer.mozTypesAt(0));
    if (types.includes("text/x-moz-message")) {
      if (targetFolder.isServer || !targetFolder.canFileMessages) {
        return;
      }
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        let msgHdr = top.messenger.msgHdrFromURI(
          event.dataTransfer.mozGetDataAt("text/x-moz-message", i)
        );
        // Don't allow drop onto original folder.
        if (msgHdr.folder == targetFolder) {
          return;
        }
      }
    } else if (types.includes("text/x-moz-folder")) {
      // If cannot create subfolders then don't allow drop here.
      if (!targetFolder.canCreateSubfolders) {
        return;
      }

      let sourceFolder = event.dataTransfer
        .mozGetDataAt("text/x-moz-folder", 0)
        .QueryInterface(Ci.nsIMsgFolder);

      // Don't allow to drop on itself.
      if (targetFolder == sourceFolder) {
        return;
      }
      // Don't copy within same server.
      if (
        sourceFolder.server == targetFolder.server &&
        event.dataTransfer.dropEffect == "copy"
      ) {
        return;
      }
      // Don't allow immediate child to be dropped onto its parent.
      if (targetFolder == sourceFolder.parent) {
        return;
      }
      // Don't allow dragging of virtual folders across accounts.
      if (
        sourceFolder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
        sourceFolder.server != targetFolder.server
      ) {
        return;
      }
      // Don't allow parent to be dropped on its ancestors.
      if (sourceFolder.isAncestorOf(targetFolder)) {
        return;
      }
      // If there is a folder that can't be renamed, don't allow it to be
      // dropped if it is not to "Local Folders" or is to the same account.
      if (
        !sourceFolder.canRename &&
        (targetFolder.server.type != "none" ||
          sourceFolder.server == targetFolder.server)
      ) {
        return;
      }
    } else {
      return;
    }

    event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";

    this._clearDropTarget();
    row.classList.add("drop-target");
  },

  _clearDropTarget() {
    folderTree.querySelector(".drop-target")?.classList.remove("drop-target");
  },

  _onDrop(event) {
    this._clearDropTarget();
    if (event.dataTransfer.dropEffect == "none") {
      // Somehow this is possible. It should not be possible.
      return;
    }

    let row = event.target.closest("li");
    if (!row) {
      return;
    }

    let targetFolder = MailServices.folderLookup.getFolderForURL(row.uri);

    let types = Array.from(event.dataTransfer.mozTypesAt(0));
    if (types.includes("text/x-moz-message")) {
      let array = [];
      let sourceFolder;
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        let msgHdr = top.messenger.msgHdrFromURI(
          event.dataTransfer.mozGetDataAt("text/x-moz-message", i)
        );
        if (!i) {
          sourceFolder = msgHdr.folder;
        }
        array.push(msgHdr);
      }
      let isMove = event.dataTransfer.dropEffect == "move";
      let isNews = sourceFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
      if (!sourceFolder.canDeleteMessages || isNews) {
        isMove = false;
      }

      Services.prefs.setStringPref(
        "mail.last_msg_movecopy_target_uri",
        targetFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
      // ### ugh, so this won't work with cross-folder views. We would
      // really need to partition the messages by folder.
      MailServices.copy.copyMessages(
        sourceFolder,
        array,
        targetFolder,
        isMove,
        null,
        top.msgWindow,
        true
      );
    } else if (types.includes("text/x-moz-folder")) {
      let sourceFolder = event.dataTransfer
        .mozGetDataAt("text/x-moz-folder", 0)
        .QueryInterface(Ci.nsIMsgFolder);
      MailServices.copy.copyFolder(
        sourceFolder,
        targetFolder,
        sourceFolder.server == targetFolder.server,
        null,
        top.msgWindow
      );
    }

    event.preventDefault();
  },

  /**
   * Opens the dialog to create a new sub-folder, and creates it if the user
   * accepts.
   *
   * @param {?nsIMsgFolder} aParent - The parent for the new subfolder.
   */
  newFolder(aParent) {
    let folder = aParent;

    // Make sure we actually can create subfolders.
    if (!folder?.canCreateSubfolders) {
      // Check if we can create them at the root, otherwise use the default
      // account as root folder.
      let rootMsgFolder = folder.server.rootMsgFolder;
      folder = rootMsgFolder.canCreateSubfolders
        ? rootMsgFolder
        : top.GetDefaultAccountRootFolder();
    }

    if (!folder) {
      return;
    }

    let dualUseFolders = true;
    if (folder.server instanceof Ci.nsIImapIncomingServer) {
      dualUseFolders = folder.server.dualUseFolders;
    }

    function newFolderCallback(aName, aFolder) {
      // createSubfolder can throw an exception, causing the newFolder dialog
      // to not close and wait for another input.
      // TODO: Rewrite this logic and also move the opening of alert dialogs from
      // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
      if (!aName) {
        return;
      }
      aFolder.createSubfolder(aName, top.msgWindow);
      // Don't call the rebuildAfterChange() here as we'll need to wait for the
      // new folder to be properly created before rebuilding the tree.
    }

    window.openDialog(
      "chrome://messenger/content/newFolderDialog.xhtml",
      "",
      "chrome,modal,resizable=no,centerscreen",
      { folder, dualUseFolders, okCallback: newFolderCallback }
    );
  },

  /**
   * Opens the dialog to edit the properties for a folder
   *
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editFolder(aFolder) {
    let folder = aFolder;

    // If this is actually a server, send it off to that controller
    if (folder.isServer) {
      top.MsgAccountManager(null, folder.server);
      return;
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      this.editVirtualFolder(folder);
      return;
    }
    let title = messengerBundle.GetStringFromName("folderProperties");

    // xxx useless param
    function editFolderCallback(aNewName, aOldName, aUri) {
      if (aNewName != aOldName) {
        folder.rename(aNewName, top.msgWindow);
      }
    }

    async function rebuildSummary() {
      if (folder.locked) {
        folder.throwAlertMsg("operationFailedFolderBusy", top.msgWindow);
        return;
      }
      if (folder.supportsOffline) {
        // Remove the offline store, if any.
        await IOUtils.remove(folder.filePath.path, { recursive: true }).catch(
          console.error
        );
      }

      // We may be rebuilding a folder that is not the displayed one.
      // TODO: Close any open views of this folder.

      // Send a notification that we are triggering a database rebuild.
      MailServices.mfn.notifyFolderReindexTriggered(folder);

      folder.msgDatabase.summaryValid = false;

      const msgDB = folder.msgDatabase;
      msgDB.summaryValid = false;
      try {
        folder.closeAndBackupFolderDB("");
      } catch (e) {
        // In a failure, proceed anyway since we're dealing with problems
        folder.ForceDBClosed();
      }
      folder.updateFolder(top.msgWindow);
      // TODO: Reopen closed views.
    }

    window.openDialog(
      "chrome://messenger/content/folderProps.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        serverType: folder.server.type,
        msgWindow: top.msgWindow,
        title,
        okCallback: editFolderCallback,
        name: folder.prettyName,
        rebuildSummaryCallback: rebuildSummary,
        previewSelectedColorCallback() {},
        clearFolderSelectionCallback() {},
        selectFolderCallback() {},
        updateColorCallback() {},
      }
    );
  },

  /**
   * Opens the dialog to rename a particular folder, and does the renaming if
   * the user clicks OK in that dialog
   *
   * @param [aFolder] - The folder to rename, if different than the currently
   *   selected one.
   */
  renameFolder(aFolder) {
    let folder = aFolder;

    function renameCallback(aName, aUri) {
      if (aUri != folder.URI) {
        console.error("got back a different folder to rename!");
      }

      // Actually do the rename.
      folder.rename(aName, top.msgWindow);
    }
    window.openDialog(
      "chrome://messenger/content/renameFolderDialog.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        preselectedURI: folder.URI,
        okCallback: renameCallback,
        name: folder.prettyName,
      }
    );
  },

  /**
   * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
   * if the selected folder/s happen to be nntp.
   *
   * @param [folder] - The folder to delete, if not the selected one.
   */
  deleteFolder(folder) {
    // For newsgroups, "delete" means "unsubscribe".
    if (
      folder.server.type == "nntp" &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
    ) {
      top.MsgUnsubscribe([folder]);
      return;
    }

    const canDelete = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false)
      ? FolderUtils.canRenameDeleteJunkMail(folder.URI)
      : folder.deletable;

    if (!canDelete) {
      throw new Error("Can't delete folder: " + folder.name);
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      let confirmation = messengerBundle.GetStringFromName(
        "confirmSavedSearchDeleteMessage"
      );
      let title = messengerBundle.GetStringFromName("confirmSavedSearchTitle");
      if (
        Services.prompt.confirmEx(
          window,
          title,
          confirmation,
          Services.prompt.STD_YES_NO_BUTTONS +
            Services.prompt.BUTTON_POS_1_DEFAULT,
          "",
          "",
          "",
          "",
          {}
        ) != 0
      ) {
        /* the yes button is in position 0 */
        return;
      }
    }

    try {
      folder.deleteSelf(top.msgWindow);
    } catch (ex) {
      // Ignore known errors from canceled warning dialogs.
      const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
      if (ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
        throw ex;
      }
    }
  },

  /**
   * Prompts the user to confirm and empties the trash for the selected folder.
   * The folder and its children are only emptied if it has the proper Trash flag.
   *
   * @param [aFolder] - The trash folder to empty. If unspecified or not a trash
   *   folder, the currently selected server's trash folder is used.
   */
  emptyTrash(aFolder) {
    let folder = aFolder;
    if (!folder.getFlag(Ci.nsMsgFolderFlags.Trash)) {
      folder = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    }
    if (!folder) {
      return;
    }

    if (!this._checkConfirmationPrompt("emptyTrash", folder)) {
      return;
    }

    // Check if this is a top-level smart folder. If so, we're going
    // to empty all the trash folders.
    if (folder.server.hostName == "smart mailboxes" && folder.parent.isServer) {
      for (let server of MailServices.accounts.allServers) {
        for (let trash of server.rootFolder.getFoldersWithFlags(
          Ci.nsMsgFolderFlags.Trash
        )) {
          trash.emptyTrash(top.msgWindow, null);
        }
      }
    } else {
      folder.emptyTrash(top.msgWindow, null);
    }
  },

  /**
   * Deletes everything (folders and messages) in the selected folder.
   * The folder is only emptied if it has the proper Junk flag.
   *
   * @param [aFolder] - The folder to empty. If unspecified, the currently
   *   selected folder is used, if it is junk.
   */
  emptyJunk(aFolder) {
    let folder = aFolder;

    if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
      return;
    }

    if (!this._checkConfirmationPrompt("emptyJunk", folder)) {
      return;
    }

    // Delete any subfolders this folder might have
    for (let subFolder of folder.subFolders) {
      folder.propagateDelete(subFolder, true, top.msgWindow);
    }

    // Now delete the messages
    folder.deleteMessages(
      [...folder.messages],
      top.msgWindow,
      true,
      false,
      null,
      false
    );
  },

  /**
   * Compacts either particular folder/s, or selected folders.
   *
   * @param [aFolders] - The folders to compact, if different than the currently
   *   selected ones.
   */
  compactFolders(aFolders) {
    let folders = aFolders;
    for (let i = 0; i < folders.length; i++) {
      // Can't compact folders that have just been compacted.
      if (folders[i].server.type != "imap" && !folders[i].expungedBytes) {
        continue;
      }

      folders[i].compact(null, top.msgWindow);
    }
  },

  /**
   * Compacts all folders for accounts that the given folders belong
   * to, or all folders for accounts of the currently selected folders.
   *
   * @param aFolders - (optional) the folders for whose accounts we should
   *   compact all folders, if different than the currently selected ones.
   */
  compactAllFoldersForAccount(aFolders) {
    let folders = aFolders;
    for (let i = 0; i < folders.length; i++) {
      folders[i].compactAll(null, top.msgWindow);
    }
  },

  /**
   * Opens the dialog to create a new virtual folder
   *
   * @param aName - The default name for the new folder.
   * @param aSearchTerms - The search terms associated with the folder.
   * @param aParent - The folder to run the search terms on.
   */
  newVirtualFolder(aName, aSearchTerms, aParent) {
    let folder = aParent || top.GetDefaultAccountRootFolder();
    if (!folder) {
      return;
    }

    let name = folder.prettyName;
    if (aName) {
      name += "-" + aName;
    }

    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        searchTerms: aSearchTerms,
        newFolderName: name,
      }
    );
  },

  editVirtualFolder(aFolder) {
    let folder = aFolder;

    // xxx should pass the folder object
    function editVirtualCallback(aURI) {
      // TODO: we need to reload the folder if it is the currently loaded folder...
    }
    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        editExistingFolder: true,
        onOKCallback: editVirtualCallback,
        msgWindow: top.msgWindow,
        previewSelectedColorCallback() {},
        clearFolderSelectionCallback() {},
        selectFolderCallback() {},
        updateColorCallback() {},
      }
    );
  },

  /**
   * Prompts for confirmation, if the user hasn't already chosen the "don't ask
   * again" option.
   *
   * @param aCommand - The command to prompt for.
   * @param aFolder - The folder for which the confirmation is requested.
   */
  _checkConfirmationPrompt(aCommand, aFolder) {
    // If no folder was specified, reject the operation.
    if (!aFolder) {
      return false;
    }

    let showPrompt = !Services.prefs.getBoolPref(
      "mailnews." + aCommand + ".dontAskAgain",
      false
    );

    if (showPrompt) {
      let checkbox = { value: false };
      let title = messengerBundle.formatStringFromName(
        aCommand + "FolderTitle",
        [aFolder.prettyName]
      );
      let msg = messengerBundle.GetStringFromName(aCommand + "FolderMessage");
      let ok =
        Services.prompt.confirmEx(
          window,
          title,
          msg,
          Services.prompt.STD_YES_NO_BUTTONS,
          null,
          null,
          null,
          messengerBundle.GetStringFromName(aCommand + "DontAsk"),
          checkbox
        ) == 0;
      if (checkbox.value) {
        Services.prefs.setBoolPref(
          "mailnews." + aCommand + ".dontAskAgain",
          true
        );
      }
      if (!ok) {
        return false;
      }
    }
    return true;
  },

  /**
   * Update those UI elements that rely on the presence of a server to function.
   */
  updateWidgets() {
    this._updateGetMessagesWidgets();
    this._updateWriteMessageWidgets();
  },

  _updateGetMessagesWidgets() {
    const canGetMessages = MailServices.accounts.allServers.some(
      s => s.type != "none"
    );
    document.getElementById("folderPaneGetMessages").disabled = !canGetMessages;
  },

  _updateWriteMessageWidgets() {
    const canWriteMessages = MailServices.accounts.allIdentities.length;
    document.getElementById(
      "folderPaneWriteMessage"
    ).disabled = !canWriteMessages;
  },

  isFolderPaneHeaderHidden() {
    return (
      Services.xulStore.getValue(
        XULSTORE_URL,
        "folderPaneHeaderBar",
        "hidden"
      ) == "true"
    );
  },

  toggleHeader(show) {
    document.getElementById("folderPaneHeaderBar").hidden = !show;
    Services.xulStore.setValue(
      XULSTORE_URL,
      "folderPaneHeaderBar",
      "hidden",
      show ? "false" : "true"
    );
  },
};

/**
 * Represents a single row in the folder tree. The row can be for a server or
 * a folder. Use `folderPane._createServerRow` or `folderPane._createFolderRow`
 * to create rows.
 */
class FolderTreeRow extends HTMLLIElement {
  /**
   * Used for comparing folder names. This matches the collator used in
   * `nsMsgDBFolder::createCollationKeyGenerator`.
   * @type {Intl.Collator}
   */
  static nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });

  /**
   * The name of the folder tree mode this row belongs to.
   * @type {string}
   */
  modeName;
  /**
   * The URI of the folder represented by this row.
   * @type {string}
   */
  uri;
  /**
   * How many times this row is nested. 1 or greater.
   * @type {integer}
   */
  depth;
  /**
   * The sort order of this row's associated folder.
   * @type {integer}
   */
  folderSortOrder;

  /** @type {HTMLSpanElement} */
  nameLabel;
  /** @type {HTMLImageElement} */
  icon;
  /** @type {HTMLSpanElement} */
  unreadCountLabel;
  /** @type {HTMLUListElement} */
  childList;

  constructor() {
    super();
    this.setAttribute("is", "folder-tree-row");
    this.append(folderPane._folderTemplate.content.cloneNode(true));
    this.nameLabel = this.querySelector(".name");
    this.icon = this.querySelector(".icon");
    this.unreadCountLabel = this.querySelector(".unread-count");
    this.childList = this.querySelector("ul");
  }

  connectedCallback() {
    // Set the correct CSS `--depth` variable based on where this row was
    // inserted into the tree.
    let parent = this.parentNode.closest(`li[is="folder-tree-row"]`);
    this.depth = parent ? parent.depth + 1 : 1;
    this.childList.style.setProperty("--depth", this.depth);
  }

  /**
   * The name to display for this folder or server.
   *
   * @type {string}
   */
  get name() {
    return this.nameLabel.textContent;
  }

  set name(value) {
    this.nameLabel.textContent = value;
    this.setAttribute("aria-label", value);
  }

  /**
   * The number of unread messages for this folder.
   *
   * @type {number}
   */
  get unreadCount() {
    return parseInt(this.unreadCountLabel.textContent, 10) || 0;
  }

  set unreadCount(value) {
    this.classList.toggle("unread", value > 0);
    this.unreadCountLabel.textContent = value;
  }

  /**
   * Set some common properties based on the URI for this row.
   * `this.modeName` must be set before calling this function.
   *
   * @param {string} uri
   */
  _setURI(uri) {
    this.id = `${this.modeName}-${btoa(
      MailStringUtils.stringToByteString(uri)
    )}`;
    this.uri = uri;
    if (!FolderTreeProperties.getIsExpanded(uri, this.modeName)) {
      this.classList.add("collapsed");
    }
    let iconColor = FolderTreeProperties.getColor(uri);
    if (iconColor) {
      this.icon.style.setProperty("--icon-color", iconColor);
    }
  }

  /**
   * Set some properties based on the server for this row.
   *
   * @param {nsIMsgIncomingServer} server
   */
  setServer(server) {
    this._setURI(server.rootFolder.URI);
    this.dataset.serverType = server.type;
    this.dataset.serverSecure = server.isSecure;
    this.name = server.prettyName;
  }

  /**
   * Set some properties based on the folder for this row.
   *
   * @param {nsIMsgFolder} folder
   * @param {boolean} useServerName - If true, use the server's name instead
   *   of the folder's name for the label of this row.
   */
  setFolder(folder, useServerName) {
    this._setURI(folder.URI);
    let folderType = FolderUtils.getSpecialFolderString(folder);
    if (folderType != "none") {
      this.dataset.folderType = folderType.toLowerCase();
    }
    this.name = useServerName ? folder.server.prettyName : folder.name;
    this.unreadCount = folder.getNumUnread(false);
    this.folderSortOrder = folder.sortOrder;
    this.setAttribute("draggable", "true");
  }

  /**
   * Add a child row in the correct sort order.
   *
   * @param {FolderTreeRow} newChild
   */
  appendChildInOrder(newChild) {
    let { folderSortOrder, name } = newChild;
    for (let child of this.childList.children) {
      if (folderSortOrder < child.folderSortOrder) {
        this.childList.insertBefore(newChild, child);
        return;
      }
      if (
        folderSortOrder == child.folderSortOrder &&
        FolderTreeRow.nameCollator.compare(name, child.name) < 0
      ) {
        this.childList.insertBefore(newChild, child);
        return;
      }
    }
    this.childList.appendChild(newChild);
  }
}
customElements.define("folder-tree-row", FolderTreeRow, { extends: "li" });

var threadPane = {
  /**
   * The map holding the current selection of the thread tree.
   *
   * @type {?Map}
   */
  _savedSelection: null,

  columns: DEFAULT_COLUMNS.map(column => ({ ...column })),

  async init() {
    // Ensure TreeViewListbox and its classes are properly defined.
    await customElements.whenDefined("tree-view-listrow");

    let tree = document.getElementById("messageThreadTree");
    this.treeTable = tree.table;
    this.treeTable.editable = true;
    threadTree = this.treeTable.listbox;
    this.treeTable.setPopupMenuTemplates([
      "threadPaneApplyColumnMenu",
      "threadPaneApplyViewMenu",
    ]);
    threadTree.id = "threadTree";
    threadTree.setAttribute("rows", "thread-listrow");

    quickFilterBar.init();

    window.addEventListener("uidensitychange", () => {
      this.densityChange();
      threadTree.invalidate();
    });
    this.densityChange();

    // No need to restore the columns state on first load since a folder hasn't
    // been selected yet.
    this.treeTable.setColumns(DEFAULT_COLUMNS);

    // TODO: Switch this dynamically like in the address book.
    document.body.classList.add("layout-table");

    this.treeTable.addEventListener("column-resized", event => {
      this.treeTable.setColumnsWidths(XULSTORE_URL, event);
    });
    this.treeTable.addEventListener("columns-changed", event => {
      this.onColumnsVisibilityChanged(event.detail);
    });
    this.treeTable.addEventListener("sort-changed", event => {
      this.onSortChanged(event.detail);
    });
    this.treeTable.addEventListener("toggle-flag", event => {
      commandController.doCommand("cmd_markAsFlagged", event);
    });
    this.treeTable.addEventListener("toggle-unread", event => {
      commandController.doCommand("cmd_toggleRead", event);
    });
    this.treeTable.addEventListener("toggle-spam", event => {
      if (event.detail.isJunk) {
        commandController.doCommand("cmd_markAsNotJunk", event);
        return;
      }
      commandController.doCommand("cmd_markAsJunk", event);
    });
    this.treeTable.addEventListener("thread-changed", () => {
      sortController.toggleThreaded();
    });
    this.treeTable.addEventListener("request-delete", event => {
      commandController.doCommand("cmd_delete", event);
    });

    threadTree.addEventListener("dblclick", this);
    threadTree.addEventListener("keypress", this);
    threadTree.addEventListener("select", this);
    threadTree.addEventListener("dragstart", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "dblclick":
        this._onDoubleClick(event);
        break;
      case "keypress":
        this._onKeyPress(event);
        break;
      case "select":
        this._onSelect(event);
        break;
      case "dragstart":
        this._onDragStart(event);
        break;
    }
  },

  _onDoubleClick(event) {
    this._onItemActivate(event);
  },

  _onKeyPress(event) {
    if (event.key == "Enter") {
      this._onItemActivate(event);
    }
  },

  _onItemActivate(event) {
    if (gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)) {
      commandController.doCommand("cmd_editDraftMsg", event);
    } else if (gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)) {
      commandController.doCommand("cmd_newMsgFromTemplate", event);
    } else {
      commandController.doCommand("cmd_openMessage", event);
    }
  },

  _onSelect(event) {
    if (paneLayout.messagePaneSplitter.isCollapsed || !gDBView) {
      return;
    }
    clearWebPage();
    switch (gDBView.numSelected) {
      case 0:
        clearMessage();
        clearMessages();
        return;
      case 1:
        let uri = gDBView.getURIForViewIndex(threadTree.selectedIndex);
        displayMessage(uri);
        return;
      default:
        displayMessages(gDBView.getSelectedMsgHdrs());
    }
  },

  _onDragStart(event) {
    let row = event.target.closest(`tr[is="thread-listrow"]`);
    if (!row) {
      event.preventDefault();
      return;
    }

    let messageURIs = gDBView.getURIsForSelection();
    if (!threadTree.selectedIndices.includes(row.index)) {
      messageURIs = [gDBView.getURIForViewIndex(row.index)];
    }

    let noSubjectString = messengerBundle.GetStringFromName(
      "defaultSaveMessageAsFileName"
    );
    if (noSubjectString.endsWith(".eml")) {
      noSubjectString = noSubjectString.slice(0, -4);
    }
    let longSubjectTruncator = messengerBundle.GetStringFromName(
      "longMsgSubjectTruncator"
    );
    // Clip the subject string to 124 chars to avoid problems on Windows,
    // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
    const maxUncutNameLength = 124;
    let maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
    let messages = new Map();

    for (let [index, uri] of Object.entries(messageURIs)) {
      let msgService = MailServices.messageServiceFromURI(uri);
      let msgHdr = msgService.messageURIToMsgHdr(uri);
      let subject = msgHdr.mime2DecodedSubject || "";
      if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
        subject = "Re: " + subject;
      }

      let uniqueFileName;
      // If there is no subject, use a default name.
      // If subject needs to be truncated, add a truncation character to indicate it.
      if (!subject) {
        uniqueFileName = noSubjectString;
      } else {
        uniqueFileName =
          subject.length <= maxUncutNameLength
            ? subject
            : subject.substr(0, maxCutNameLength) + longSubjectTruncator;
      }
      let msgFileName = validateFileName(uniqueFileName);
      let msgFileNameLowerCase = msgFileName.toLocaleLowerCase();

      while (true) {
        if (!messages.has(msgFileNameLowerCase)) {
          messages.set(msgFileNameLowerCase, 1);
          break;
        } else {
          let number = messages.get(msgFileNameLowerCase);
          messages.set(msgFileNameLowerCase, number + 1);
          let postfix = "-" + number;
          msgFileName = msgFileName + postfix;
          msgFileNameLowerCase = msgFileNameLowerCase + postfix;
        }
      }

      msgFileName = msgFileName + ".eml";

      // This type should be unnecessary, but getFlavorData can't get at
      // text/x-moz-message for some reason.
      event.dataTransfer.mozSetDataAt("text/plain", uri, index);
      event.dataTransfer.mozSetDataAt("text/x-moz-message", uri, index);
      event.dataTransfer.mozSetDataAt(
        "text/x-moz-url",
        msgService.getUrlForUri(uri).spec,
        index
      );
      // When dragging messages to the filesystem:
      // - Windows fetches this value and writes it to a file.
      // - Linux does the same if there are multiple files, but for a single
      //     file it uses the flavor data provider below.
      // - MacOS always uses the flavor data provider.
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise-url",
        msgService.getUrlForUri(uri).spec,
        index
      );
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise",
        this._flavorDataProvider,
        index
      );
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise-dest-filename",
        msgFileName.replace(/(.{74}).*(.{10})$/u, "$1...$2"),
        index
      );
    }

    event.dataTransfer.effectAllowed = "copyMove";
    let bcr = row.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      row,
      event.clientX - bcr.x,
      event.clientY - bcr.y
    );
  },

  _flavorDataProvider: {
    QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

    getFlavorData(transferable, flavor, data) {
      if (flavor !== "application/x-moz-file-promise") {
        return;
      }

      let fileName = {};
      transferable.getTransferData(
        "application/x-moz-file-promise-dest-filename",
        fileName
      );
      fileName.value.QueryInterface(Ci.nsISupportsString);

      let destDir = {};
      transferable.getTransferData(
        "application/x-moz-file-promise-dir",
        destDir
      );
      destDir.value.QueryInterface(Ci.nsIFile);

      let file = destDir.value.clone();
      file.append(fileName.value.data);

      let messageURI = {};
      transferable.getTransferData("text/plain", messageURI);
      messageURI.value.QueryInterface(Ci.nsISupportsString);

      top.messenger.saveAs(messageURI.value.data, true, null, file.path, true);
    },
  },

  /**
   * Make the list rows density aware.
   */
  densityChange() {
    // The class ThreadListrow can't be referenced because it's declared in a
    // different scope. But we can get it from customElements.
    let rowClass = customElements.get("thread-listrow");
    switch (UIDensity.prefValue) {
      case UIDensity.MODE_COMPACT:
        rowClass.ROW_HEIGHT = 18;
        break;
      case UIDensity.MODE_TOUCH:
        rowClass.ROW_HEIGHT = 32;
        break;
      default:
        rowClass.ROW_HEIGHT = 22;
        break;
    }
  },

  /**
   * Store the current thread tree selection.
   */
  saveSelection() {
    this._savedSelection = threadTree.selectedIndices.map(gDBView.getKeyAt);
  },

  /**
   * Restore the previously saved thread tree selection.
   */
  restoreSelection() {
    threadTree.selectedIndices = this._savedSelection
      .map(gDBView.findIndexFromKey)
      .filter(i => i != nsMsgViewIndex_None);
    this._savedSelection = null;
  },

  /**
   * Restore the collapsed or expanded state of threads.
   */
  restoreThreadState() {
    if (
      gViewWrapper._threadExpandAll &&
      !(gViewWrapper.dbView.viewFlags & Ci.nsMsgViewFlagsType.kExpandAll)
    ) {
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    }
    if (
      !gViewWrapper._threadExpandAll &&
      gViewWrapper.dbView.viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    ) {
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
    }
  },

  /**
   * Restore the chevron icon indicating the current sort order.
   */
  restoreSortIndicator() {
    if (!gDBView) {
      return;
    }
    this.updateSortIndicator(
      sortController.convertSortTypeToColumnID(gViewWrapper.primarySortType)
    );
  },

  /**
   * Update the columns object and force the refresh of the thread pane to apply
   * the updated state. This is usually called when changing folders.
   */
  restoreColumns() {
    this.restoreColumnsState();
    this.updateColumns();
  },

  /**
   * Restore the visibility and order of the columns for the current folder.
   */
  restoreColumnsState() {
    // Avoid doing anything if no folder has been loaded yet.
    if (!gFolder) {
      return;
    }

    // A missing folder database will throw an error so we need to handle that.
    let msgDatabase;
    try {
      msgDatabase = gFolder.msgDatabase;
    } catch {
      return;
    }

    const stringState = msgDatabase.dBFolderInfo.getCharProperty(
      "columnStates"
    );
    if (!stringState) {
      // If we don't have a previously saved state, make sure to enforce the
      // default columns for the currently visible folder, otherwise the table
      // layout will maintain whatever state is currently set from the previous
      // folder, which it doesn't reflect reality.
      this.columns = DEFAULT_COLUMNS.map(column => ({ ...column }));
      return;
    }

    const columnStates = JSON.parse(stringState);
    this.columns.forEach(c => {
      c.hidden = !columnStates[c.id]?.visible;
      c.ordinal = columnStates[c.id]?.ordinal ?? 0;
    });
    // Sort columns by ordinal.
    this.columns.sort(function(a, b) {
      return a.ordinal - b.ordinal;
    });
  },

  /**
   * Force an update of the thread tree to reflect the columns change.
   *
   * @param {boolean} isSimple - If the columns structure only requires a simple
   *   update and not a full reset of the entire table header.
   */
  updateColumns(isSimple = false) {
    if (isSimple) {
      this.treeTable.updateColumns(this.columns);
    } else {
      // The order of the columns have changed, which warrants a rebuild of the
      // full table header.
      this.treeTable.setColumns(this.columns);
    }
    this.treeTable.restoreColumnsWidths(XULSTORE_URL);
  },

  /**
   * Restore the default columns visibility and order and save the change.
   */
  restoreDefaultColumns() {
    this.columns = DEFAULT_COLUMNS.map(column => ({ ...column }));
    this.updateColumns();
    threadTree.invalidate();
    this.persistColumnStates();
  },

  /**
   * Update the list of visible columns based on the users' selection.
   *
   * @param {object} data - The detail object of the bubbled event.
   */
  onColumnsVisibilityChanged(data) {
    let column = data.value;
    let checked = data.target.hasAttribute("checked");

    let changedColumn = this.columns.find(c => c.id == column);
    changedColumn.hidden = !checked;

    this.persistColumnStates();
    this.updateColumns(true);
    threadTree.invalidate();
  },

  /**
   * Save the current visibility of the columns in the folder database.
   */
  persistColumnStates() {
    let newState = {};
    for (const column of this.columns) {
      newState[column.id] = {
        visible: !column.hidden,
        ordinal: column.ordinal,
      };
    }

    if (gDBView.isSynthetic) {
      let syntheticView = gDBView._syntheticView;
      if ("setPersistedSetting" in syntheticView) {
        syntheticView.setPersistedSetting("columns", newState);
      }
      return;
    }

    if (!gFolder) {
      return;
    }

    // A missing folder database will throw an error so we need to handle that.
    let msgDatabase;
    try {
      msgDatabase = gFolder.msgDatabase;
    } catch {
      return;
    }

    msgDatabase.dBFolderInfo.setCharProperty(
      "columnStates",
      JSON.stringify(newState)
    );
    msgDatabase.commit(Ci.nsMsgDBCommitType.kLargeCommit);
  },

  /**
   * Trigger a sort change when the user clicks on the table header.
   *
   * @param {object} data - The detail of the custom event.
   */
  onSortChanged(data) {
    const sortColumn = sortController.convertSortTypeToColumnID(
      gViewWrapper.primarySortType
    );
    const column = data.column;

    // A click happened on the column that is already used to sort the list.
    if (sortColumn == column) {
      if (gViewWrapper.isSortedAscending) {
        sortController.sortDescending();
      } else {
        sortController.sortAscending();
      }
      this.updateSortIndicator(column);
      return;
    }

    const sortName = this.columns.find(c => c.id == data.column).sortKey;
    sortController.sortThreadPane(sortName);
    this.updateSortIndicator(column);
  },

  /**
   * Update the classes on the table header to reflect the sorting order.
   *
   * @param {string} column - The ID of column affecting the sorting order.
   */
  updateSortIndicator(column) {
    this.treeTable
      .querySelector(".sorting")
      ?.classList.remove("sorting", "ascending", "descending");
    this.treeTable
      .querySelector(`#${column} button`)
      ?.classList.add(
        "sorting",
        gViewWrapper.isSortedAscending ? "ascending" : "descending"
      );
  },

  /**
   * Prompt the user to confirm applying the current columns state to the chosen
   * folder and its children.
   *
   * @param {nsIMsgFolder} folder - The chosen message folder.
   * @param {boolean} [useChildren=false] - If the requested action should be
   *   propagated to the child folders.
   */
  async confirmApplyColumns(folder, useChildren = false) {
    const msgFluentID = useChildren
      ? "apply-current-columns-to-folder-with-children-message"
      : "apply-current-columns-to-folder-message";
    let [title, message] = await document.l10n.formatValues([
      "apply-changes-to-folder-title",
      { id: msgFluentID, args: { name: folder.name } },
    ]);
    if (Services.prompt.confirm(null, title, message)) {
      this._applyColumns(folder, useChildren);
    }
  },

  /**
   * Apply the current columns state to the chosen folder and its children,
   * if specified.
   *
   * @param {nsIMsgFolder} destFolder - The chosen folder.
   * @param {boolean} useChildren - True if the changes should affect the child
   *   folders of the chosen folder.
   */
  _applyColumns(destFolder, useChildren) {
    // Avoid doing anything if no folder has been loaded yet.
    if (!gFolder || !destFolder) {
      return;
    }

    // Get the current state from the columns array, not the saved state in the
    // database in order to make sure we're getting the currently visible state.
    let columnState = {};
    for (const column of this.columns) {
      columnState[column.id] = {
        visible: !column.hidden,
        ordinal: column.ordinal,
      };
    }

    // Swaps "From" and "Recipient" if only one is shown. This is useful for
    // copying an incoming folder's columns to and from an outgoing folder.
    let columStateString = JSON.stringify(columnState);
    let swappedColumnStateString;
    if (columnState.senderCol.visible != columnState.recipientCol.visible) {
      const backedSenderColumn = columnState.senderCol;
      columnState.senderCol = columnState.recipientCol;
      columnState.recipientCol = backedSenderColumn;
      swappedColumnStateString = JSON.stringify(columnState);
    } else {
      swappedColumnStateString = columStateString;
    }

    /**
     * Check if the current folder is a special Outgoing folder.
     *
     * @param {nsIMsgFolder} folder - The message folder.
     * @returns {boolean} True if the folder is Outgoing.
     */
    const isOutgoing = folder => {
      return folder.isSpecialFolder(
        DBViewWrapper.prototype.OUTGOING_FOLDER_FLAGS,
        true
      );
    };

    const currentFolderIsOutgoing = isOutgoing(gFolder);

    /**
     * Update the columnStates property of the folder database and forget the
     * reference to prevent memory bloat.
     *
     * @param {nsIMsgFolder} folder - The message folder.
     */
    const commitColumnsState = folder => {
      // Check if the destination folder we're trying to update matches the same
      // special state of the folder we're getting the column state from.
      const colStateString =
        isOutgoing(folder) == currentFolderIsOutgoing
          ? columStateString
          : swappedColumnStateString;

      folder.msgDatabase.dBFolderInfo.setCharProperty(
        "columnStates",
        colStateString
      );
      folder.msgDatabase.commit(Ci.nsMsgDBCommitType.kLargeCommit);
      // Force the reference to be forgotten.
      folder.msgDatabase = null;
    };

    if (!useChildren) {
      commitColumnsState(destFolder);
      return;
    }

    // Loop through all the child folders and apply the same column state.
    MailUtils.takeActionOnFolderAndDescendents(
      destFolder,
      commitColumnsState
    ).then(() => {
      Services.obs.notifyObservers(
        gViewWrapper.displayedFolder,
        "msg-folder-columns-propagated"
      );
    });
  },

  /**
   * Prompt the user to confirm applying the current view sate to the chosen
   * folder and its children.
   *
   * @param {nsIMsgFolder} folder - The chosen message folder.
   * @param {boolean} [useChildren=false] - If the requested action should be
   *   propagated to the child folders.
   */
  async confirmApplyView(folder, useChildren = false) {
    const msgFluentID = useChildren
      ? "apply-current-view-to-folder-with-children-message"
      : "apply-current-view-to-folder-message";
    let [title, message] = await document.l10n.formatValues([
      { id: "apply-changes-to-folder-title" },
      { id: msgFluentID, args: { name: folder.name } },
    ]);
    if (Services.prompt.confirm(null, title, message)) {
      this._applyView(folder, useChildren);
    }
  },

  /**
   * Apply the current view flags, sorting key, and sorting order to another
   * folder and its children, if specified.
   *
   * @param {nsIMsgFolder} destFolder - The chosen folder.
   * @param {boolean} useChildren - True if the changes should affect the child
   *   folders of the chosen folder.
   */
  _applyView(destFolder, useChildren) {
    const viewFlags = gViewWrapper.dbView.viewFlags;
    const sortType = gViewWrapper.dbView.sortType;
    const sortOrder = gViewWrapper.dbView.sortOrder;

    /**
     * Update the view state flags of the folder database and forget the
     * reference to prevent memory bloat.
     *
     * @param {nsIMsgFolder} folder - The message folder.
     */
    const commitViewState = folder => {
      folder.msgDatabase.dBFolderInfo.viewFlags = viewFlags;
      folder.msgDatabase.dBFolderInfo.sortType = sortType;
      folder.msgDatabase.dBFolderInfo.sortOrder = sortOrder;
      // Null out to avoid memory bloat.
      folder.msgDatabase = null;
    };

    if (!useChildren) {
      commitViewState(destFolder);
      return;
    }

    MailUtils.takeActionOnFolderAndDescendents(
      destFolder,
      commitViewState
    ).then(() => {
      Services.obs.notifyObservers(
        gViewWrapper.displayedFolder,
        "msg-folder-views-propagated"
      );
    });
  },
};

function restoreState({
  folderPaneVisible,
  messagePaneVisible,
  folderURI,
  syntheticView,
  first = false,
} = {}) {
  if (folderPaneVisible === undefined) {
    folderPaneVisible = folderURI || !syntheticView;
  }
  paneLayout.folderPaneSplitter.isCollapsed = !folderPaneVisible;

  if (messagePaneVisible === undefined) {
    messagePaneVisible =
      Services.xulStore.getValue(
        XULSTORE_URL,
        "messagepaneboxwrapper",
        "collapsed"
      ) !== "true";
  }
  paneLayout.messagePaneSplitter.isCollapsed = !messagePaneVisible;

  if (folderURI) {
    displayFolder(folderURI);
  } else if (syntheticView) {
    // TODO: Move this.
    gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
    gViewWrapper._viewFlags = 1;
    gViewWrapper.openSynthetic(syntheticView);
    gDBView = gViewWrapper.dbView;

    document.body.classList.remove("account-central");
    accountCentralBrowser.hidden = true;
    threadPane.restoreColumns();
  }

  if (first && Services.prefs.getBoolPref("mailnews.start_page.enabled")) {
    commandController.doCommand("cmd_goStartPage");
  }
}

function displayFolder(folderURI) {
  let row = folderPane.getRowForFolder(folderURI);
  if (!row) {
    return;
  }

  let collapsedAncestor = row.parentNode.closest("#folderTree li.collapsed");
  while (collapsedAncestor) {
    folderTree.expandRow(collapsedAncestor);
    collapsedAncestor = collapsedAncestor.parentNode.closest(
      "#folderTree li.collapsed"
    );
  }
  folderTree.selectedRow = row;
}

function clearWebPage() {
  displayWebPage();
}

function clearMessage() {
  displayMessage();
}

function clearMessages() {
  displayMessages();
}

function displayWebPage(url, params) {
  if (!url || url == "about:blank") {
    MailE10SUtils.loadAboutBlank(webBrowser);
    webBrowser.hidden = true;
    return;
  }

  clearMessage();
  clearMessages();

  MailE10SUtils.loadURI(webBrowser, url, params);
  webBrowser.hidden = false;
}

async function displayMessage(messageURI) {
  if (messageBrowser.contentDocument.readyState != "complete") {
    await new Promise(resolve =>
      messageBrowser.contentWindow.addEventListener("load", resolve, {
        once: true,
      })
    );
  }
  messageBrowser.contentWindow.displayMessage(messageURI);
  if (!messageURI) {
    messageBrowser.hidden = true;
    return;
  }

  clearWebPage();
  clearMessages();

  messageBrowser.hidden = false;
}

async function displayMessages(messages = []) {
  if (multiMessageBrowser.contentDocument.readyState != "complete") {
    await new Promise(r =>
      multiMessageBrowser.contentWindow.addEventListener("load", r, {
        once: true,
      })
    );
  }
  if (messages.length == 0) {
    multiMessageBrowser.hidden = true;
    multiMessageBrowser.contentWindow.gMessageSummary.clear();
    return;
  }

  clearWebPage();
  clearMessage();

  let getThreadId = function(message) {
    return gDBView.getThreadContainingMsgHdr(message).getRootHdr().messageKey;
  };

  let oneThread = true;
  let firstThreadId = getThreadId(messages[0]);
  for (let i = 1; i < messages.length; i++) {
    if (getThreadId(messages[i]) != firstThreadId) {
      oneThread = false;
      break;
    }
  }

  multiMessageBrowser.contentWindow.gMessageSummary.summarize(
    oneThread ? "thread" : "multipleselection",
    messages,
    gDBView,
    function(messages) {
      threadTree.selectedIndices = messages
        .map(m => gDBView.findIndexOfMsgHdr(m, true))
        .filter(i => i != nsMsgViewIndex_None);
    }
  );
  multiMessageBrowser.hidden = false;
  window.dispatchEvent(new CustomEvent("MsgsLoaded", { bubbles: true }));
}

var folderListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
  onFolderAdded(parentFolder, childFolder) {
    folderPane.addFolder(parentFolder, childFolder);
  },
  onMessageAdded(parentFolder, msg) {},
  onFolderRemoved(parentFolder, childFolder) {
    folderPane.removeFolder(parentFolder, childFolder);
    if (childFolder == gFolder) {
      gFolder = null;
      gViewWrapper?.close(true);
    }
  },
  onMessageRemoved(parentFolder, msg) {
    if (parentFolder == gFolder) {
      threadTree.invalidate();
    }
  },
  onFolderPropertyChanged(item, property, oldValue, newValue) {},
  onFolderIntPropertyChanged(item, property, oldValue, newValue) {
    switch (property) {
      case "BiffState":
        folderPane.changeNewMessages(
          item,
          newValue === Ci.nsIMsgFolder.nsMsgBiffState_NewMail
        );
        break;
      case "FolderFlag":
        folderPane.changeFolderFlag(item, oldValue, newValue);
        break;
      case "TotalUnreadMessages":
        folderPane.changeUnreadCount(item, oldValue, newValue);
        break;
    }
  },
  onFolderBoolPropertyChanged(item, property, oldValue, newValue) {
    switch (property) {
      case "NewMessages":
        folderPane.changeNewMessages(item, newValue);
        break;
    }
  },
  onFolderUnicharPropertyChanged(item, property, oldValue, newValue) {},
  onFolderPropertyFlagChanged(item, property, oldFlag, newFlag) {},
  onFolderEvent(folder, event) {},
};

/**
 * Custom element for rows in the thread tree.
 */
customElements.whenDefined("tree-view-listrow").then(() => {
  class ThreadListrow extends customElements.get("tree-view-listrow") {
    static ROW_HEIGHT = 22;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }

      super.connectedCallback();

      this.setAttribute("draggable", "true");

      for (let column of threadPane.columns) {
        const cell = document.createElement("td");

        if (column.hidden) {
          cell.hidden = true;
        }

        if (column.id == "subjectCol") {
          cell.appendChild(
            document
              .getElementById("threadPaneSubjectCellTemplate")
              .content.cloneNode(true)
          );
        }

        // Handle the special case for the thread column.
        if (column.thread) {
          cell.classList.add("tree-view-row-thread");
          const img = document.createElement("img");
          img.src = "";
          document.l10n.setAttributes(img, "tree-list-view-row-thread");
          cell.appendChild(img);
        }

        if (column.id == "attachmentCol") {
          const img = document.createElement("img");
          img.src = "";
          document.l10n.setAttributes(img, "tree-list-view-row-attach");
          cell.appendChild(img);
        }

        // Handle the special case for the flagged star column.
        if (column.star) {
          cell.classList.add("tree-view-row-flag");
          const button = document.createElement("button");
          button.type = "button";
          button.tabIndex = -1;
          button.classList.add("button-flat", "tree-button-flag");

          const img = button.appendChild(document.createElement("img"));
          img.src = "";
          img.alt = "";

          cell.appendChild(button);
        }

        // Handle the special case for the unread column.
        if (column.unread) {
          cell.classList.add("tree-view-row-unread");
          const button = document.createElement("button");
          button.type = "button";
          button.tabIndex = -1;
          button.classList.add("button-flat", "tree-button-unread");

          const img = button.appendChild(document.createElement("img"));
          img.src = "";
          img.alt = "";

          cell.appendChild(button);
        }

        // Handle the special case for the spam column.
        if (column.spam) {
          cell.classList.add("tree-view-row-spam");
          const button = document.createElement("button");
          button.type = "button";
          button.tabIndex = -1;
          button.classList.add("button-flat", "tree-button-spam");

          const img = button.appendChild(document.createElement("img"));
          img.src = "";
          img.alt = "";

          cell.appendChild(button);
        }

        // Handle the special case of the delete column.
        if (column.delete) {
          cell.classList.add("tree-view-row-delete");
          const button = document.createElement("button");
          button.type = "button";
          button.tabIndex = -1;
          button.classList.add("button-flat", "tree-button-delete");
          document.l10n.setAttributes(button, "tree-list-view-row-delete");

          const img = button.appendChild(document.createElement("img"));
          img.src = "";
          img.alt = "";

          cell.appendChild(button);
        }

        this.appendChild(cell).classList.add(
          `${column.id.toLowerCase()}-column`
        );
      }

      this.addEventListener("contextmenu", event => {
        if (threadTree.selectedIndex == -1) {
          return;
        }

        mailContextMenu.emptyMessageContextMenu();
        let popup = document.getElementById("mailContext");
        popup.openPopupAtScreen(event.screenX, event.screenY, true);
        event.preventDefault();
      });
    }

    get index() {
      return super.index;
    }

    set index(index) {
      super.index = index;

      // Always set the subject line as aria-label even if the column is hidden.
      const subjectLine = this.view.cellTextForColumn(index, "subjectCol");
      this.setAttribute("aria-label", subjectLine);

      const properties = this.view.getRowProperties(index).trim();
      const propertiesSet = new Set(properties.split(" "));
      this.dataset.properties = properties;

      for (let column of threadPane.columns) {
        if (column.hidden) {
          continue;
        }

        let cell = this.querySelector(`.${column.id.toLowerCase()}-column`);

        // Special case for the subject column.
        if (column.id == "subjectCol") {
          const div = cell.querySelector(".subject-line");
          // Indent child message of this thread.
          div.style.setProperty("--thread-level", this.view.getLevel(index));

          let imageFluentID = this.#getMessageIndicatorString(propertiesSet);
          const image = div.querySelector("img");
          if (imageFluentID) {
            document.l10n.setAttributes(image, imageFluentID);
          } else {
            image.removeAttribute("data-l10n-id");
            image.alt = "";
          }

          const span = div.querySelector("span");
          span.textContent = subjectLine;
          continue;
        }

        if (column.id == "flaggedCol") {
          document.l10n.setAttributes(
            cell.querySelector("button"),
            propertiesSet.has("flagged")
              ? "tree-list-view-row-flagged"
              : "tree-list-view-row-flag"
          );
        }

        if (column.id == "junkStatusCol") {
          document.l10n.setAttributes(
            cell.querySelector("button"),
            propertiesSet.has("junk")
              ? "tree-list-view-row-spam"
              : "tree-list-view-row-not-spam"
          );
        }

        // No need to update the text of this cell if it's the selection or an
        // icon column.
        if (column.icon || column.select) {
          continue;
        }

        cell.textContent = this.view.cellTextForColumn(index, column.id);
      }
    }

    /**
     * Find the fluent ID matching the current message state.
     *
     * @param {Set} propertiesSet - The Set() of properties for the row.
     * @returns {?string} - The fluent ID string if we found one, otherwise null.
     */
    #getMessageIndicatorString(propertiesSet) {
      // Bail out early if this is a new message since it can't be anything else.
      if (propertiesSet.has("new")) {
        return "threadpane-message-new";
      }

      const isReplied = propertiesSet.has("replied");
      const isForwarded = propertiesSet.has("forwarded");
      const isRedirected = propertiesSet.has("redirected");

      if (isReplied && !isForwarded && !isRedirected) {
        return "threadpane-message-replied";
      }

      if (isRedirected && !isForwarded && !isReplied) {
        return "threadpane-message-redirected";
      }

      if (isForwarded && !isReplied && !isRedirected) {
        return "threadpane-message-forwarded";
      }

      if (isReplied && isForwarded && !isRedirected) {
        return "threadpane-message-replied-forwarded";
      }

      if (isReplied && isRedirected && !isForwarded) {
        return "threadpane-message-replied-redirected";
      }

      if (isForwarded && isRedirected && !isReplied) {
        return "threadpane-message-forwarded-redirected";
      }

      if (isReplied && isForwarded && isRedirected) {
        return "threadpane-message-replied-forwarded-redirected";
      }

      return null;
    }
  }
  customElements.define("thread-listrow", ThreadListrow, { extends: "tr" });
});

commandController.registerCallback(
  "cmd_newFolder",
  () => folderPane.newFolder(gFolder),
  () => folderPaneContextMenu.getCommandState("cmd_newFolder")
);
commandController.registerCallback("cmd_newVirtualFolder", () =>
  folderPane.newVirtualFolder(undefined, undefined, gFolder)
);
commandController.registerCallback(
  "cmd_deleteFolder",
  () => folderPane.deleteFolder(gFolder),
  () => folderPaneContextMenu.getCommandState("cmd_deleteFolder")
);
commandController.registerCallback(
  "cmd_renameFolder",
  () => folderPane.renameFolder(gFolder),
  () => folderPaneContextMenu.getCommandState("cmd_renameFolder")
);
commandController.registerCallback(
  "cmd_compactFolder",
  () => folderPane.compactFolders([gFolder]),
  () => folderPaneContextMenu.getCommandState("cmd_compactFolder")
);
commandController.registerCallback(
  "cmd_emptyTrash",
  () => folderPane.emptyTrash(gFolder),
  () => folderPaneContextMenu.getCommandState("cmd_emptyTrash")
);

commandController.registerCallback("cmd_viewClassicMailLayout", () =>
  Services.prefs.setIntPref("mail.pane_config.dynamic", 0)
);
commandController.registerCallback("cmd_viewWideMailLayout", () =>
  Services.prefs.setIntPref("mail.pane_config.dynamic", 1)
);
commandController.registerCallback("cmd_viewVerticalMailLayout", () =>
  Services.prefs.setIntPref("mail.pane_config.dynamic", 2)
);
commandController.registerCallback("cmd_toggleFolderPane", () => {
  paneLayout.folderPaneSplitter.toggleCollapsed();
});
commandController.registerCallback("cmd_toggleMessagePane", () => {
  paneLayout.messagePaneSplitter.toggleCollapsed();
});

commandController.registerCallback(
  "cmd_selectAll",
  () => {
    gDBView.selection.selectAll();
  },
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_selectThread",
  () => {
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.selectThread);
  },
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_selectFlagged",
  () => {
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.selectFlagged);
  },
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_downloadFlagged",
  () =>
    gViewWrapper.dbView.doCommand(
      Ci.nsMsgViewCommandType.downloadFlaggedForOffline
    ),
  () => gFolder && !gFolder.isServer && MailOfflineMgr.isOnline()
);
commandController.registerCallback(
  "cmd_downloadSelected",
  () =>
    gViewWrapper.dbView.doCommand(
      Ci.nsMsgViewCommandType.downloadSelectedForOffline
    ),
  () =>
    gFolder &&
    !gFolder.isServer &&
    MailOfflineMgr.isOnline() &&
    gViewWrapper.dbView.selectedCount > 0
);

var sortController = {
  handleCommand(event) {
    switch (event.target.value) {
      case "ascending":
        this.sortAscending();
        threadPane.restoreSortIndicator();
        break;
      case "descending":
        this.sortDescending();
        threadPane.restoreSortIndicator();
        break;
      case "threaded":
        this.sortThreaded();
        break;
      case "unthreaded":
        this.sortUnthreaded();
        break;
      case "group":
        this.groupBySort();
        break;
      default:
        if (event.target.value in Ci.nsMsgViewSortType) {
          this.sortThreadPane(event.target.value);
          threadPane.restoreSortIndicator();
        }
        break;
    }
  },
  sortByThread() {
    gViewWrapper.showThreaded = true;
    this.sortThreadPane("byDate");
  },
  sortThreadPane(sortName) {
    let sortType = Ci.nsMsgViewSortType[sortName];
    let grouped = gViewWrapper.showGroupedBySort;
    gViewWrapper._threadExpandAll = Boolean(
      gViewWrapper._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    );

    if (!grouped) {
      gViewWrapper.sort(sortType, Ci.nsMsgViewSortOrder.ascending);
      // Respect user's last expandAll/collapseAll choice, post sort direction change.
      threadPane.restoreThreadState();
      return;
    }

    // legacy behavior dictates we un-group-by-sort if we were.  this probably
    //  deserves a UX call...

    // For non virtual folders, do not ungroup (which sorts by the going away
    // sort) and then sort, as it's a double sort.
    // For virtual folders, which are rebuilt in the backend in a grouped
    // change, create a new view upfront rather than applying viewFlags. There
    // are oddities just applying viewFlags, for example changing out of a
    // custom column grouped xfvf view with the threads collapsed works (doesn't)
    // differently than other variations.
    // So, first set the desired sortType and sortOrder, then set viewFlags in
    // batch mode, then apply it all (open a new view) with endViewUpdate().
    gViewWrapper.beginViewUpdate();
    gViewWrapper._sort = [[sortType, Ci.nsMsgViewSortOrder.ascending]];
    gViewWrapper.showGroupedBySort = false;
    gViewWrapper.endViewUpdate();

    // Virtual folders don't persist viewFlags well in the back end,
    // due to a virtual folder being either 'real' or synthetic, so make
    // sure it's done here.
    if (gViewWrapper.isVirtual) {
      gViewWrapper.dbView.viewFlags = gViewWrapper.viewFlags;
    }
  },
  reverseSortThreadPane() {
    let grouped = gViewWrapper.showGroupedBySort;
    gViewWrapper._threadExpandAll = Boolean(
      gViewWrapper._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    );

    // Grouped By view is special for column click sort direction changes.
    if (grouped) {
      if (gDBView.selection.count) {
        threadPane.saveSelection();
      }

      if (gViewWrapper.isSingleFolder) {
        if (gViewWrapper.isVirtual) {
          gViewWrapper.showGroupedBySort = false;
        } else {
          // Must ensure rows are collapsed and kExpandAll is unset.
          gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
        }
      }
    }

    if (gViewWrapper.isSortedAscending) {
      gViewWrapper.sortDescending();
    } else {
      gViewWrapper.sortAscending();
    }

    // Restore Grouped By state post sort direction change.
    if (grouped) {
      if (gViewWrapper.isVirtual && gViewWrapper.isSingleFolder) {
        this.groupBySort();
      }
      // Restore Grouped By selection post sort direction change.
      threadPane.restoreSelection();
    }
    threadPane.restoreThreadState();
  },
  toggleThreaded() {
    if (gViewWrapper.showThreaded) {
      gViewWrapper.showUnthreaded = true;
    } else {
      gViewWrapper.showThreaded = true;
    }
  },
  sortThreaded() {
    gViewWrapper.showThreaded = true;
  },
  groupBySort() {
    gViewWrapper.showGroupedBySort = true;
  },
  sortUnthreaded() {
    gViewWrapper.showUnthreaded = true;
  },
  sortAscending() {
    if (gViewWrapper.showGroupedBySort && gViewWrapper.isSingleFolder) {
      if (gViewWrapper.isSortedDescending) {
        this.reverseSortThreadPane();
      }
      return;
    }

    gViewWrapper.sortAscending();
  },
  sortDescending() {
    if (gViewWrapper.showGroupedBySort && gViewWrapper.isSingleFolder) {
      if (gViewWrapper.isSortedAscending) {
        this.reverseSortThreadPane();
      }
      return;
    }

    gViewWrapper.sortDescending();
  },
  convertSortTypeToColumnID(sortKey) {
    let columnID;

    // Hack to turn this into an integer, if it was a string.
    // It would be a string if it came from XULStore.json.
    sortKey = sortKey - 0;

    switch (sortKey) {
      // In the case of None, we default to the date column. This appears to be
      // the case in such instances as Global search, so don't complain about
      // it.
      case Ci.nsMsgViewSortType.byNone:
      case Ci.nsMsgViewSortType.byDate:
        columnID = "dateCol";
        break;
      case Ci.nsMsgViewSortType.byReceived:
        columnID = "receivedCol";
        break;
      case Ci.nsMsgViewSortType.byAuthor:
        columnID = "senderCol";
        break;
      case Ci.nsMsgViewSortType.byRecipient:
        columnID = "recipientCol";
        break;
      case Ci.nsMsgViewSortType.bySubject:
        columnID = "subjectCol";
        break;
      case Ci.nsMsgViewSortType.byLocation:
        columnID = "locationCol";
        break;
      case Ci.nsMsgViewSortType.byAccount:
        columnID = "accountCol";
        break;
      case Ci.nsMsgViewSortType.byUnread:
        columnID = "unreadButtonColHeader";
        break;
      case Ci.nsMsgViewSortType.byStatus:
        columnID = "statusCol";
        break;
      case Ci.nsMsgViewSortType.byTags:
        columnID = "tagsCol";
        break;
      case Ci.nsMsgViewSortType.bySize:
        columnID = "sizeCol";
        break;
      case Ci.nsMsgViewSortType.byPriority:
        columnID = "priorityCol";
        break;
      case Ci.nsMsgViewSortType.byFlagged:
        columnID = "flaggedCol";
        break;
      case Ci.nsMsgViewSortType.byThread:
        columnID = "threadCol";
        break;
      case Ci.nsMsgViewSortType.byId:
        columnID = "idCol";
        break;
      case Ci.nsMsgViewSortType.byJunkStatus:
        columnID = "junkStatusCol";
        break;
      case Ci.nsMsgViewSortType.byAttachments:
        columnID = "attachmentCol";
        break;
      case Ci.nsMsgViewSortType.byCustom:
        // TODO: either change try() catch to if (property exists) or restore
        // the getColumnHandler() check.
        try {
          // getColumnHandler throws an error when the ID is not handled
          columnID = gDBView.curCustomColumn;
        } catch (e) {
          // error - means no handler
          dump(
            "ConvertSortTypeToColumnID: custom sort key but no handler for column '" +
              columnID +
              "'\n"
          );
          columnID = "dateCol";
        }
        break;
      case Ci.nsMsgViewSortType.byCorrespondent:
        columnID = "correspondentCol";
        break;
      default:
        dump("unsupported sort key: " + sortKey + "\n");
        columnID = "dateCol";
        break;
    }
    return columnID;
  },
};

commandController.registerCallback(
  "cmd_sort",
  event => sortController.handleCommand(event),
  () => !!gViewWrapper?.dbView
);

commandController.registerCallback(
  "cmd_expandAllThreads",
  () => {
    threadPane.saveSelection();
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    threadPane.restoreSelection();
  },
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_collapseAllThreads",
  () => {
    threadPane.saveSelection();
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
    // TODO: this reopens threads containing a selected message.
    threadPane.restoreSelection();
  },
  () => !!gViewWrapper?.dbView
);

function SwitchView(command) {
  // when switching thread views, we might be coming out of quick search
  // or a message view.
  // first set view picker to all
  if (gViewWrapper.mailViewIndex != 0) {
    // MailViewConstants.kViewItemAll
    gViewWrapper.setMailView(0);
  }

  switch (command) {
    // "All" threads and "Unread" threads don't change threading state
    case "cmd_viewAllMsgs":
      gViewWrapper.showUnreadOnly = false;
      break;
    case "cmd_viewUnreadMsgs":
      gViewWrapper.showUnreadOnly = true;
      break;
    // "Threads with Unread" and "Watched Threads with Unread" force threading
    case "cmd_viewWatchedThreadsWithUnread":
      gViewWrapper.specialViewWatchedThreadsWithUnread = true;
      break;
    case "cmd_viewThreadsWithUnread":
      gViewWrapper.specialViewThreadsWithUnread = true;
      break;
    // "Ignored Threads" toggles 'ignored' inclusion --
    //   but it also resets 'With Unread' views to 'All'
    case "cmd_viewIgnoredThreads":
      gViewWrapper.showIgnored = !gViewWrapper.showIgnored;
      break;
  }
}

commandController.registerCallback(
  "cmd_viewAllMsgs",
  () => SwitchView("cmd_viewAllMsgs"),
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_viewThreadsWithUnread",
  () => SwitchView("cmd_viewThreadsWithUnread"),
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_viewWatchedThreadsWithUnread",
  () => SwitchView("cmd_viewWatchedThreadsWithUnread"),
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_viewUnreadMsgs",
  () => SwitchView("cmd_viewUnreadMsgs"),
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_viewIgnoredThreads",
  () => SwitchView("cmd_viewIgnoredThreads"),
  () => !!gViewWrapper?.dbView
);

commandController.registerCallback("cmd_goStartPage", () =>
  displayWebPage(Services.urlFormatter.formatURLPref("mailnews.start_page.url"))
);
commandController.registerCallback(
  "cmd_print",
  async () => {
    let PrintUtils = top.PrintUtils;
    let uris = gViewWrapper.dbView.getURIsForSelection();
    if (uris.length == 1) {
      if (messageBrowser.hidden) {
        // Load the only message in a hidden browser, then use the print preview UI.
        let messageService = MailServices.messageServiceFromURI(uris[0]);
        await PrintUtils.loadPrintBrowser(
          messageService.getUrlForUri(uris[0]).spec
        );
        PrintUtils.startPrintWindow(
          PrintUtils.printBrowser.browsingContext,
          {}
        );
      } else {
        PrintUtils.startPrintWindow(
          messageBrowser.contentWindow.content.browsingContext,
          {}
        );
      }
      return;
    }

    // Multiple messages. Get the printer settings, then load the messages into
    // a hidden browser and print them one at a time.
    let ps = PrintUtils.getPrintSettings();
    Cc["@mozilla.org/widget/printdialog-service;1"]
      .getService(Ci.nsIPrintDialogService)
      .showPrintDialog(window, false, ps);
    if (ps.isCancelled) {
      return;
    }
    ps.printSilent = true;

    for (let uri of uris) {
      let messageService = MailServices.messageServiceFromURI(uri);
      await PrintUtils.loadPrintBrowser(messageService.getUrlForUri(uri).spec);
      await PrintUtils.printBrowser.browsingContext.print(ps);
    }
  },
  () => {
    return Boolean(gViewWrapper);
  }
);
commandController.registerCallback(
  "cmd_recalculateJunkScore",
  () => analyzeMessagesForJunk(),
  () => {
    // We're going to take a conservative position here, because we really
    // don't want people running junk controls on folders that are not
    // enabled for junk. The junk type picks up possible dummy message headers,
    // while the runJunkControls will prevent running on XF virtual folders.
    return (
      commandController._getViewCommandStatus(Ci.nsMsgViewCommandType.junk) &&
      commandController._getViewCommandStatus(
        Ci.nsMsgViewCommandType.runJunkControls
      )
    );
  }
);
commandController.registerCallback(
  "cmd_runJunkControls",
  () => filterFolderForJunk(gFolder),
  () =>
    commandController._getViewCommandStatus(
      Ci.nsMsgViewCommandType.runJunkControls
    )
);
commandController.registerCallback(
  "cmd_deleteJunk",
  () => deleteJunkInFolder(gFolder),
  () =>
    commandController._getViewCommandStatus(Ci.nsMsgViewCommandType.deleteJunk)
);

// Forward these commands directly to about:message.
commandController.registerCallback(
  "cmd_find",
  () =>
    this.messageBrowser.contentWindow.commandController.doCommand("cmd_find"),
  () => !this.messageBrowser.hidden
);
commandController.registerCallback(
  "cmd_findAgain",
  () =>
    this.messageBrowser.contentWindow.commandController.doCommand(
      "cmd_findAgain"
    ),
  () => !this.messageBrowser.hidden
);
commandController.registerCallback(
  "cmd_findPrevious",
  () =>
    this.messageBrowser.contentWindow.commandController.doCommand(
      "cmd_findPrevious"
    ),
  () => !this.messageBrowser.hidden
);
