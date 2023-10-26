/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozElements */

// mailCommon.js
/* globals commandController, DBViewWrapper, dbViewWrapperListener,
     nsMsgViewIndex_None */
/* globals gDBView: true, gFolder: true, gViewWrapper: true */

// mailContext.js
/* globals mailContextMenu */

// globalOverlay.js
/* globals goDoCommand, goUpdateCommand */

// mail-offline.js
/* globals MailOfflineMgr */

// junkCommands.js
/* globals analyzeMessagesForJunk deleteJunkInFolder filterFolderForJunk */

// quickFilterBar.js
/* globals quickFilterBar */

// utilityOverlay.js
/* globals validateFileName */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { FolderTreeProperties } = ChromeUtils.import(
  "resource:///modules/FolderTreeProperties.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { UIDensity } = ChromeUtils.import("resource:///modules/UIDensity.jsm");
var { UIFontSize } = ChromeUtils.import("resource:///modules/UIFontSize.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  FeedUtils: "resource:///modules/FeedUtils.jsm",
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MailE10SUtils: "resource:///modules/MailE10SUtils.jsm",
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
  TagUtils: "resource:///modules/TagUtils.jsm",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.jsm",
});

const XULSTORE_URL = "chrome://messenger/content/messenger.xhtml";

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

const { getDefaultColumns, getDefaultColumnsForCardsView, isOutgoing } =
  ChromeUtils.importESModule(
    "chrome://messenger/content/thread-pane-columns.mjs"
  );

// As defined in nsMsgDBView.h.
const MSG_VIEW_FLAG_DUMMY = 0x20000000;

/**
 * The TreeListbox widget that displays folders.
 */
var folderTree;
/**
 * The TreeView widget that displays the message list.
 */
var threadTree;
/**
 * A XUL browser that displays web pages when required.
 */
var webBrowser;
/**
 * A XUL browser that displays single messages. This browser always has
 * about:message loaded.
 */
var messageBrowser;
/**
 * A XUL browser that displays summaries of multiple messages or threads.
 * This browser always has multimessageview.xhtml loaded.
 */
var multiMessageBrowser;
/**
 * A XUL browser that displays Account Central when an account's root folder
 * is selected.
 */
var accountCentralBrowser;

window.addEventListener("DOMContentLoaded", async event => {
  if (event.target != document) {
    return;
  }

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);

  folderTree = document.getElementById("folderTree");

  paneLayout.init();
  folderPaneContextMenu.init();
  await folderPane.init();
  await threadPane.init();
  threadPaneHeader.init();
  await messagePane.init();

  accountCentralBrowser = document.getElementById("accountCentralBrowser");

  // Set up the initial state using information which may have been provided
  // by mailTabs.js, or the saved state from the XUL store, or the defaults.
  try {
    // Do this in a try so that errors (e.g. bad data) don't prevent doing the
    // rest of the important 3pane initialization below.
    restoreState(window.openingState);
  } catch (e) {
    console.warn(`Couldn't restore state: ${e.message}`, e);
  }
  delete window.openingState;

  // Finally, add the folderTree listener and trigger it. Earlier events
  // (triggered by `folderPane.init` and possibly `restoreState`) are ignored
  // to avoid unnecessarily loading the thread tree or Account Central.
  folderTree.addEventListener("select", folderPane);
  folderTree.dispatchEvent(new CustomEvent("select"));

  // Attach the progress listener for the webBrowser. For the messageBrowser this
  // happens in the "aboutMessageLoaded" event from aboutMessage.js.
  // For the webBrowser, we can do it here directly.
  top.contentProgress.addProgressListenerToBrowser(webBrowser);

  mailContextMenu.init();
});

window.addEventListener("unload", () => {
  MailServices.mailSession.RemoveFolderListener(folderListener);
  gViewWrapper?.close();
  folderPane.uninit();
  threadPane.uninit();
  threadPaneHeader.uninit();
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

      splitter.storeAttr = function (attrName, attrValue) {
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
      messagePane.clearAll();
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
    threadPane.updateThreadView(
      Services.xulStore.getValue(XULSTORE_URL, "threadPane", "view")
    );
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

  get accountCentralVisible() {
    return document.body.classList.contains("account-central");
  },
  get folderPaneVisible() {
    return !this.folderPaneSplitter.isCollapsed;
  },
  set folderPaneVisible(visible) {
    this.folderPaneSplitter.isCollapsed = !visible;
  },
  get messagePaneVisible() {
    return !this.messagePaneSplitter?.isCollapsed;
  },
  set messagePaneVisible(visible) {
    this.messagePaneSplitter.isCollapsed = !visible;
  },
};

var folderPaneContextMenu = {
  /**
   * @type {XULPopupElement}
   */
  _menupopup: null,

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
    "folderPaneContext-properties": "cmd_properties",
    "folderPaneContext-favoriteFolder": "cmd_toggleFavoriteFolder",
  },

  /**
   * Current state of commandController commands. Set to null to invalidate
   * the states.
   *
   * @type {Object.<string, boolean>|null}
   */
  _commandStates: null,

  init() {
    this._menupopup = document.getElementById("folderPaneContext");
    this._menupopup.addEventListener("popupshowing", this);
    this._menupopup.addEventListener("popuphidden", this);
    this._menupopup.addEventListener("command", this);
    folderTree.addEventListener("select", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "popupshowing":
        this.onPopupShowing(event);
        break;
      case "popuphidden":
        this.onPopupHidden(event);
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
   * The folder that this context menu is operating on. This will be `gFolder`
   * unless the menu was opened by right-clicking on another folder.
   *
   * @type {nsIMsgFolder}
   */
  get activeFolder() {
    return this._overrideFolder || gFolder;
  },

  /**
   * Override the folder that this context menu should operate on. The effect
   * lasts until `clearOverrideFolder` is called by `onPopupHidden`.
   *
   * @param {nsIMsgFolder} folder
   */
  setOverrideFolder(folder) {
    this._overrideFolder = folder;
    this._commandStates = null;
  },

  /**
   * Clear the overriding folder, and go back to using `gFolder`.
   */
  clearOverrideFolder() {
    this._overrideFolder = null;
    this._commandStates = null;
  },

  /**
   * Gets the enabled state of a command. If the state is unknown (because the
   * selected folder has changed) the states of all the commands are worked
   * out together to save unnecessary work.
   *
   * @param {string} command
   */
  getCommandState(command) {
    let folder = this.activeFolder;
    if (!folder || FolderUtils.isSmartTagsFolder(folder)) {
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
        server,
        URI,
      } = folder;
      let isJunk = flags & Ci.nsMsgFolderFlags.Junk;
      let isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
      let isNNTP = server.type == "nntp";
      if (isNNTP && !isServer) {
        // `folderPane.deleteFolder` has a special case for this.
        deletable = true;
      }
      let isSmartTagsFolder = FolderUtils.isSmartTagsFolder(folder);
      let showNewFolderItem =
        (!isNNTP && canCreateSubfolders) || flags & Ci.nsMsgFolderFlags.Inbox;

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
          (isServer || canCompact) &&
          folder.isCommandEnabled("cmd_compactFolder"),
        cmd_emptyTrash: !isNNTP,
        cmd_properties: !isServer && !isSmartTagsFolder,
        cmd_toggleFavoriteFolder: !isServer && !isSmartTagsFolder,
      };
    }
    return this._commandStates[command];
  },

  onPopupShowing(event) {
    if (event.target != this._menupopup) {
      return;
    }

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

    let folder = this.activeFolder;
    let { canCreateSubfolders, flags, isServer, isSpecialFolder, server } =
      folder;
    let isJunk = flags & Ci.nsMsgFolderFlags.Junk;
    let isTrash = isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true);
    let isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
    let isRealFolder = !isServer && !isVirtual;
    let isSmartTagsFolder = FolderUtils.isSmartTagsFolder(folder);
    let serverType = server.type;

    showItem(
      "folderPaneContext-getMessages",
      (isServer && serverType != "none") ||
        (["nntp", "rss"].includes(serverType) && !isTrash && !isVirtual)
    );
    let showPauseAll = isServer && FeedUtils.isFeedFolder(folder);
    showItem("folderPaneContext-pauseAllUpdates", showPauseAll);
    if (showPauseAll) {
      let optionsAcct = FeedUtils.getOptionsAcct(server);
      checkItem("folderPaneContext-pauseAllUpdates", !optionsAcct.doBiff);
    }
    let showPaused = !isServer && FeedUtils.getFeedUrlsInFolder(folder);
    showItem("folderPaneContext-pauseUpdates", showPaused);
    if (showPaused) {
      let properties = FeedUtils.getFolderProperties(folder);
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
    showItem(
      "folderPaneContext-emptyTrash",
      isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true)
    );
    showItem("folderPaneContext-emptyJunk", isJunk);
    showItem(
      "folderPaneContext-sendUnsentMessages",
      flags & Ci.nsMsgFolderFlags.Queue
    );

    checkItem(
      "folderPaneContext-favoriteFolder",
      flags & Ci.nsMsgFolderFlags.Favorite
    );
    showItem("folderPaneContext-markAllFoldersRead", isServer);

    showItem("folderPaneContext-settings", isServer);

    showItem("folderPaneContext-manageTags", isSmartTagsFolder);

    // If source folder is virtual, allow only "move" within its own server.
    // Don't show "copy" and "again" and don't show "recent" and "favorite".
    // Also, check if this is a top-level smart folder, e.g., virtual "Inbox"
    // in unified folder view or a Tags folder. If so, don't show "move".
    let movePopup = document.getElementById("folderContext-movePopup");
    if (isVirtual) {
      showItem("folderPaneContext-copyMenu", false);
      let folder = this.activeFolder;
      let showMove = true;
      if (
        (folder.server.hostName == "smart mailboxes" &&
          folder.parent.isServer) ||
        isSmartTagsFolder
      ) {
        showMove = false;
      }
      showItem("folderPaneContext-moveMenu", showMove);
      if (showMove) {
        let rootURI = MailUtils.getOrCreateFolder(
          this.activeFolder.rootFolder.URI
        );
        movePopup.parentFolder = rootURI;
      }
    } else {
      // Non-virtual. Don't allow move or copy of special use or root folder.
      let okToMoveCopy = !(isServer || flags & Ci.nsMsgFolderFlags.SpecialUse);
      if (okToMoveCopy) {
        // Set the move menu to show all accounts.
        movePopup.parentFolder = null;
      }
      showItem("folderPaneContext-moveMenu", okToMoveCopy);
      showItem("folderPaneContext-copyMenu", okToMoveCopy);
    }

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

  onPopupHidden(event) {
    if (event.target != this._menupopup) {
      return;
    }

    folderTree
      .querySelector(".context-menu-target")
      ?.classList.remove("context-menu-target");
    this.clearOverrideFolder();
  },

  /**
   * Check if the transfer mode selected from folder context menu is "copy".
   * If "copy" (!isMove) is selected and the copy is within the same server,
   * silently change to mode "move".
   * Do the transfer and return true if moved, false if copied.
   *
   * @param {boolean} isMove
   * @param {nsIMsgFolder} sourceFolder
   * @param {nsIMsgFolder} targetFolder
   */
  transferFolder(isMove, sourceFolder, targetFolder) {
    if (!isMove && sourceFolder.server == targetFolder.server) {
      // Don't allow folder copy within the same server; only move allowed.
      // Can't copy folder intra-server, change to move.
      isMove = true;
    }
    // Do the transfer. A slight delay in calling copyFolder() helps the
    // folder-menupopup chain of items get properly closed so the next folder
    // context popup can occur.
    setTimeout(() =>
      MailServices.copy.copyFolder(
        sourceFolder,
        targetFolder,
        isMove,
        null,
        top.msgWindow
      )
    );
    return isMove;
  },

  onCommand(event) {
    let folder = this.activeFolder;
    // If commandController handles this command, ask it to do so.
    if (event.target.id in this._commands) {
      commandController.doCommand(this._commands[event.target.id], folder);
      return;
    }

    let topChromeWindow = window.browsingContext.topChromeWindow;
    switch (event.target.id) {
      case "folderPaneContext-getMessages":
        topChromeWindow.MsgGetMessage([folder]);
        break;
      case "folderPaneContext-pauseAllUpdates":
        topChromeWindow.MsgPauseUpdates(
          [folder],
          event.target.getAttribute("checked") == "true"
        );
        break;
      case "folderPaneContext-pauseUpdates":
        topChromeWindow.MsgPauseUpdates(
          [folder],
          event.target.getAttribute("checked") == "true"
        );
        break;
      case "folderPaneContext-openNewTab":
        topChromeWindow.MsgOpenNewTabForFolders([folder], {
          event,
          folderPaneVisible: !paneLayout.folderPaneSplitter.isCollapsed,
          messagePaneVisible: !paneLayout.messagePaneSplitter.isCollapsed,
        });
        break;
      case "folderPaneContext-openNewWindow":
        topChromeWindow.MsgOpenNewWindowForFolder(folder.URI, -1);
        break;
      case "folderPaneContext-searchMessages":
        commandController.doCommand("cmd_searchMessages", folder);
        break;
      case "folderPaneContext-subscribe":
        topChromeWindow.MsgSubscribe(folder);
        break;
      case "folderPaneContext-newsUnsubscribe":
        topChromeWindow.MsgUnsubscribe([folder]);
        break;
      case "folderPaneContext-markMailFolderAllRead":
      case "folderPaneContext-markNewsgroupAllRead":
        topChromeWindow.MsgMarkAllRead([folder]);
        break;
      case "folderPaneContext-emptyTrash":
        folderPane.emptyTrash(folder);
        break;
      case "folderPaneContext-emptyJunk":
        folderPane.emptyJunk(folder);
        break;
      case "folderPaneContext-sendUnsentMessages":
        topChromeWindow.SendUnsentMessages();
        break;
      case "folderPaneContext-properties":
        folderPane.editFolder(folder);
        break;
      case "folderPaneContext-markAllFoldersRead":
        topChromeWindow.MsgMarkAllFoldersRead([folder]);
        break;
      case "folderPaneContext-settings":
        folderPane.editFolder(folder);
        break;
      case "folderPaneContext-manageTags":
        goDoCommand("cmd_manageTags");
        break;
      default: {
        // Handle folder context menu items move to, copy to.
        let isMove = false;
        let isCopy = false;
        let targetFolder;
        if (
          document
            .getElementById("folderPaneContext-moveMenu")
            .contains(event.target)
        ) {
          // A move is requested via foldermenu-popup.
          isMove = true;
        } else if (
          document
            .getElementById("folderPaneContext-copyMenu")
            .contains(event.target)
        ) {
          // A copy is requested via foldermenu-popup.
          isCopy = true;
        }
        if (isMove || isCopy) {
          if (!targetFolder) {
            targetFolder = event.target._folder;
          }
          isMove = this.transferFolder(isMove, folder, targetFolder);
          // Save in prefs the target folder URI and if this was a move or
          // copy. This is to fill in the next folder or message context
          // menu item "Move|Copy to <TargetFolderName> Again".
          Services.prefs.setStringPref(
            "mail.last_msg_movecopy_target_uri",
            targetFolder.URI
          );
          Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
        }
        break;
      }
    }
  },
};

var folderPane = {
  _initialized: false,

  /**
   * If the local folders should be hidden.
   * @type {boolean}
   */
  _hideLocalFolders: false,

  _modes: {
    all: {
      name: "all",
      active: false,
      canBeCompact: false,

      initServer(server) {
        let serverRow = folderPane._createServerRow(this.name, server);
        folderPane._insertInServerOrder(this.containerList, serverRow);
        folderPane._addSubFolders(server.rootFolder, serverRow, this.name);
      },

      addFolder(parentFolder, childFolder) {
        FolderTreeProperties.setIsExpanded(childFolder.URI, this.name, true);
        if (
          childFolder.server.hidden ||
          folderPane.getRowForFolder(childFolder, this.name)
        ) {
          // We're not displaying this server, or the folder already exists in
          // the folder tree. Was `addFolder` called twice?
          return;
        }
        if (!parentFolder) {
          folderPane._insertInServerOrder(
            this.containerList,
            folderPane._createServerRow(this.name, childFolder.server)
          );
          return;
        }

        let parentRow = folderPane.getRowForFolder(parentFolder, this.name);
        if (!parentRow) {
          console.error("no parentRow for ", parentFolder.URI, childFolder.URI);
        }
        // To auto-expand non-root imap folders, imap URL "discoverchildren" is
        // triggered -- but actually only occurs if server settings configured
        // to ignore subscriptions. (This also occurs in _onExpanded() for
        // manual folder expansion.)
        if (parentFolder.server.type == "imap" && !parentFolder.isServer) {
          parentFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
          parentFolder.performExpand(top.msgWindow);
        }
        folderTree.expandRow(parentRow);
        let childRow = folderPane._createFolderRow(this.name, childFolder);
        folderPane._addSubFolders(childFolder, childRow, "all");
        parentRow.insertChildInOrder(childRow);
      },

      removeFolder(parentFolder, childFolder) {
        folderPane.getRowForFolder(childFolder, this.name)?.remove();
      },

      changeAccountOrder() {
        folderPane._reapplyServerOrder(this.containerList);
      },
    },
    smart: {
      name: "smart",
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
        this._smartServer = MailServices.accounts.findServer(
          "nobody",
          "smart mailboxes",
          "none"
        );
        if (!this._smartServer) {
          this._smartServer = MailServices.accounts.createIncomingServer(
            "nobody",
            "smart mailboxes",
            "none"
          );
          // We don't want the "smart" server/account leaking out into the ui in
          // other places, so set it as hidden.
          this._smartServer.hidden = true;
          let account = MailServices.accounts.createAccount();
          account.incomingServer = this._smartServer;
        }
        this._smartServer.prettyName =
          messengerBundle.GetStringFromName("unifiedAccountName");
        let smartRoot = this._smartServer.rootFolder.QueryInterface(
          Ci.nsIMsgLocalMailFolder
        );

        let allFlags = 0;
        this._folderTypes.forEach(folderType => (allFlags |= folderType.flag));

        for (let folderType of this._folderTypes) {
          let folder = smartRoot.getChildWithURI(
            `${smartRoot.URI}/${folderType.name}`,
            false,
            true
          );
          if (!folder) {
            try {
              let searchFolders = [];

              function recurse(folder) {
                let subFolders;
                try {
                  subFolders = folder.subFolders;
                } catch (ex) {
                  console.error(
                    new Error(
                      `Unable to access the subfolders of ${folder.URI}`,
                      { cause: ex }
                    )
                  );
                }
                if (!subFolders?.length) {
                  return;
                }

                for (let sf of subFolders) {
                  // Add all of the subfolders except the ones that belong to
                  // a different folder type.
                  if (!(sf.flags & allFlags)) {
                    searchFolders.push(sf);
                    recurse(sf);
                  }
                }
              }

              for (let server of MailServices.accounts.allServers) {
                for (let f of server.rootFolder.getFoldersWithFlags(
                  folderType.flag
                )) {
                  searchFolders.push(f);
                  recurse(f);
                }
              }

              folder = smartRoot.createLocalSubfolder(folderType.name);
              folder.flags |= Ci.nsMsgFolderFlags.Virtual | folderType.flag;

              let msgDatabase = folder.msgDatabase;
              let folderInfo = msgDatabase.dBFolderInfo;

              folderInfo.setCharProperty("searchStr", "ALL");
              folderInfo.setCharProperty(
                "searchFolderUri",
                searchFolders.map(f => f.URI).join("|")
              );
              folderInfo.setUint32Property("searchFolderFlag", folderType.flag);
              folderInfo.setBooleanProperty("searchOnline", true);
              msgDatabase.summaryValid = true;
              msgDatabase.close(true);

              smartRoot.notifyFolderAdded(folder);
            } catch (ex) {
              console.error(ex);
              continue;
            }
          }
          let row = folderPane._createFolderRow(this.name, folder);
          this.containerList.appendChild(row);
          folderType.folderURI = folder.URI;
          folderType.list = row.childList;

          // Display the searched folders for this type.
          let wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
          for (let searchFolder of wrappedFolder.searchFolders) {
            if (searchFolder != folder) {
              this._addSearchedFolder(
                folderType,
                folderPane._getNonGmailParent(searchFolder),
                searchFolder
              );
            }
          }
        }
        MailServices.accounts.saveVirtualFolders();
      },

      _addSearchedFolder(folderType, parentFolder, childFolder) {
        if (folderType.flag & childFolder.flags) {
          // The folder has the flag for this type.
          let folderRow = folderPane._createFolderRow(
            this.name,
            childFolder,
            "server"
          );
          folderPane._insertInServerOrder(folderType.list, folderRow);
          return;
        }

        if (!childFolder.isSpecialFolder(folderType.flag, true)) {
          // This folder is searched by the virtual folder but it hasn't got
          // the flag of this type and no ancestor has the flag of this type.
          // We don't have a good way of displaying it.
          return;
        }

        // The folder is a descendant of one which has the flag.
        let parentRow = folderPane.getRowForFolder(parentFolder, this.name);
        if (!parentRow) {
          // This is awkward: `childFolder` is searched but `parentFolder` is
          // not. Displaying the unsearched folder is probably the least
          // confusing way to handle this situation.
          this._addSearchedFolder(
            folderType,
            folderPane._getNonGmailParent(parentFolder),
            parentFolder
          );
          parentRow = folderPane.getRowForFolder(parentFolder, this.name);
        }
        parentRow.insertChildInOrder(
          folderPane._createFolderRow(this.name, childFolder)
        );
      },

      changeSearchedFolders(smartFolder) {
        let folderType = this._folderTypes.find(
          ft => ft.folderURI == smartFolder.URI
        );
        if (!folderType) {
          // This virtual folder isn't one of the smart folders. It's probably
          // one of the tags virtual folders.
          return;
        }

        let wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(smartFolder);
        let smartFolderRow = folderPane.getRowForFolder(smartFolder, this.name);
        let searchFolderURIs = wrappedFolder.searchFolders.map(sf => sf.URI);
        let serversToCheck = new Set();

        // Remove any rows which may belong to folders that aren't searched.
        for (let row of [...smartFolderRow.querySelectorAll("li")]) {
          if (!searchFolderURIs.includes(row.uri)) {
            row.remove();
            let folder = MailServices.folderLookup.getFolderForURL(row.uri);
            if (folder) {
              serversToCheck.add(folder.server);
            }
          }
        }

        // Add missing rows for folders that are searched.
        let existingRowURIs = Array.from(
          smartFolderRow.querySelectorAll("li"),
          row => row.uri
        );
        for (let searchFolder of wrappedFolder.searchFolders) {
          if (
            searchFolder == smartFolder ||
            existingRowURIs.includes(searchFolder.URI)
          ) {
            continue;
          }
          let existingRow = folderPane.getRowForFolder(searchFolder, this.name);
          if (existingRow) {
            // A row for this folder exists, but not under the smart folder.
            // Remove it and display under the smart folder.
            folderPane._removeFolderAndAncestors(searchFolder, this.name, f =>
              searchFolderURIs.includes(f.URI)
            );
          }
          this._addSearchedFolder(
            folderType,
            folderPane._getNonGmailParent(searchFolder),
            searchFolder
          );
        }

        // For any rows we removed, check they are added back to the tree.
        for (let server of serversToCheck) {
          this.initServer(server);
        }
      },

      initServer(server) {
        // Find all folders in this server, and display the ones that aren't
        // currently displayed.
        let descendants = new Map(
          server.rootFolder.descendants.map(d => [d.URI, d])
        );
        if (!descendants.size) {
          return;
        }
        let remainingFolderURIs = Array.from(descendants.keys());

        // Get a list of folders that already exist in the folder tree.
        let existingRows = this.containerList.getElementsByTagName("li");
        let existingURIs = Array.from(existingRows, li => li.uri);
        do {
          let folderURI = remainingFolderURIs.shift();
          if (existingURIs.includes(folderURI)) {
            continue;
          }
          let folder = descendants.get(folderURI);
          if (folderPane._isGmailFolder(folder)) {
            continue;
          }
          this.addFolder(folderPane._getNonGmailParent(folder), folder);
          // Update the list of existing folders. `existingRows` is a live
          // list, so we don't need to call `getElementsByTagName` again.
          existingURIs = Array.from(existingRows, li => li.uri);
        } while (remainingFolderURIs.length);
      },

      addFolder(parentFolder, childFolder) {
        if (folderPane.getRowForFolder(childFolder, this.name)) {
          // If a row for this folder exists, do nothing.
          return;
        }
        if (!parentFolder) {
          // If this folder is the root folder for a server, do nothing.
          return;
        }
        if (childFolder.server.hidden) {
          // If this folder is from a hidden server, do nothing.
          return;
        }

        let folderType = this._folderTypes.find(ft =>
          childFolder.isSpecialFolder(ft.flag, true)
        );
        if (folderType) {
          let virtualFolder = VirtualFolderHelper.wrapVirtualFolder(
            MailServices.folderLookup.getFolderForURL(folderType.folderURI)
          );
          let searchFolders = virtualFolder.searchFolders;
          if (searchFolders.includes(childFolder)) {
            // This folder is included in the virtual folder, do nothing.
            return;
          }

          if (searchFolders.includes(parentFolder)) {
            // This folder's parent is included in the virtual folder, but the
            // folder itself isn't. Add it to the list of non-special folders.
            // Note that `_addFolderAndAncestors` can't be used here, as that
            // would add the row in the wrong place.
            let serverRow = folderPane.getRowForFolder(
              childFolder.rootFolder,
              this.name
            );
            if (!serverRow) {
              serverRow = folderPane._createServerRow(
                this.name,
                childFolder.server
              );
              folderPane._insertInServerOrder(this.containerList, serverRow);
            }
            let folderRow = folderPane._createFolderRow(this.name, childFolder);
            serverRow.insertChildInOrder(folderRow);
            folderPane._addSubFolders(childFolder, folderRow, this.name);
            return;
          }
        }

        // Nothing special about this folder. Add it to the end of the list.
        let folderRow = folderPane._addFolderAndAncestors(
          this.containerList,
          childFolder,
          this.name
        );
        folderPane._addSubFolders(childFolder, folderRow, this.name);
      },

      removeFolder(parentFolder, childFolder) {
        let childRow = folderPane.getRowForFolder(childFolder, this.name);
        if (!childRow) {
          return;
        }
        let parentRow = childRow.parentNode.closest("li");
        childRow.remove();
        if (
          parentRow.parentNode == this.containerList &&
          parentRow.dataset.serverType &&
          !parentRow.querySelector("li")
        ) {
          parentRow.remove();
        }
      },

      changeAccountOrder() {
        folderPane._reapplyServerOrder(this.containerList);

        for (let smartFolderRow of this.containerList.children) {
          if (smartFolderRow.dataset.serverKey == this._smartServer.key) {
            folderPane._reapplyServerOrder(smartFolderRow.childList);
          }
        }
      },
    },
    unread: {
      name: "unread",
      active: false,
      canBeCompact: true,

      _unreadFilter(folder, includeSubFolders = true) {
        return folder.getNumUnread(includeSubFolders) > 0;
      },

      initServer(server) {
        this.addFolder(null, server.rootFolder);
      },

      _recurseSubFolders(parentFolder) {
        let subFolders;
        try {
          subFolders = parentFolder.subFolders;
        } catch (ex) {
          console.error(
            new Error(
              `Unable to access the subfolders of ${parentFolder.URI}`,
              { cause: ex }
            )
          );
        }
        if (!subFolders?.length) {
          return;
        }

        for (let i = 0; i < subFolders.length; i++) {
          let folder = subFolders[i];
          if (folderPane._isGmailFolder(folder)) {
            subFolders.splice(i, 1, ...folder.subFolders);
          }
        }

        subFolders.sort((a, b) => a.compareSortKeys(b));

        for (let folder of subFolders) {
          if (!this._unreadFilter(folder)) {
            continue;
          }
          if (this._unreadFilter(folder, false)) {
            this._addFolder(folder);
          }
          this._recurseSubFolders(folder);
        }
      },

      addFolder(unused, folder) {
        if (!this._unreadFilter(folder)) {
          return;
        }
        this._addFolder(folder);
        this._recurseSubFolders(folder);
      },

      _addFolder(folder) {
        if (folderPane.getRowForFolder(folder, this.name)) {
          // Don't do anything. `folderPane.changeUnreadCount` already did it.
          return;
        }

        if (!this._unreadFilter(folder, !folderPane._isCompact)) {
          return;
        }

        if (folderPane._isCompact) {
          let folderRow = folderPane._createFolderRow(
            this.name,
            folder,
            "both"
          );
          folderPane._insertInServerOrder(this.containerList, folderRow);
          return;
        }

        folderPane._addFolderAndAncestors(
          this.containerList,
          folder,
          this.name
        );
      },

      removeFolder(parentFolder, childFolder) {
        folderPane._removeFolderAndAncestors(
          childFolder,
          this.name,
          this._unreadFilter
        );

        // If the folder is being moved, `childFolder.parent` is null so the
        // above code won't remove ancestors. Do this now.
        if (!childFolder.parent && parentFolder) {
          folderPane._removeFolderAndAncestors(
            parentFolder,
            this.name,
            this._unreadFilter,
            true
          );
        }

        // Remove any stray rows that might be descendants of `childFolder`.
        for (let row of [...this.containerList.querySelectorAll("li")]) {
          if (row.uri.startsWith(childFolder.URI + "/")) {
            row.remove();
          }
        }
      },

      changeUnreadCount(folder, newValue) {
        if (newValue > 0) {
          this._addFolder(folder);
        }
      },

      changeAccountOrder() {
        folderPane._reapplyServerOrder(this.containerList);
      },
    },
    favorite: {
      name: "favorite",
      active: false,
      canBeCompact: true,

      _favoriteFilter(folder) {
        return folder.flags & Ci.nsMsgFolderFlags.Favorite;
      },

      initServer(server) {
        this.addFolder(null, server.rootFolder);
      },

      addFolder(unused, folder) {
        this._addFolder(folder);
        for (let subFolder of folder.getFoldersWithFlags(
          Ci.nsMsgFolderFlags.Favorite
        )) {
          this._addFolder(subFolder);
        }
      },

      _addFolder(folder) {
        if (
          !this._favoriteFilter(folder) ||
          folderPane.getRowForFolder(folder, this.name)
        ) {
          return;
        }

        if (folderPane._isCompact) {
          folderPane._insertInServerOrder(
            this.containerList,
            folderPane._createFolderRow(this.name, folder, "both")
          );
          return;
        }

        folderPane._addFolderAndAncestors(
          this.containerList,
          folder,
          this.name
        );
      },

      removeFolder(parentFolder, childFolder) {
        folderPane._removeFolderAndAncestors(
          childFolder,
          this.name,
          this._favoriteFilter
        );

        // If the folder is being moved, `childFolder.parent` is null so the
        // above code won't remove ancestors. Do this now.
        if (!childFolder.parent && parentFolder) {
          folderPane._removeFolderAndAncestors(
            parentFolder,
            this.name,
            this._favoriteFilter,
            true
          );
        }

        // Remove any stray rows that might be descendants of `childFolder`.
        for (let row of [...this.containerList.querySelectorAll("li")]) {
          if (row.uri.startsWith(childFolder.URI + "/")) {
            row.remove();
          }
        }
      },

      changeFolderFlag(folder, oldValue, newValue) {
        oldValue &= Ci.nsMsgFolderFlags.Favorite;
        newValue &= Ci.nsMsgFolderFlags.Favorite;

        if (oldValue == newValue) {
          return;
        }

        if (oldValue) {
          if (
            folderPane._isCompact ||
            !folder.getFolderWithFlags(Ci.nsMsgFolderFlags.Favorite)
          ) {
            folderPane._removeFolderAndAncestors(
              folder,
              this.name,
              this._favoriteFilter
            );
          }
        } else {
          this._addFolder(folder);
        }
      },

      changeAccountOrder() {
        folderPane._reapplyServerOrder(this.containerList);
      },
    },
    recent: {
      name: "recent",
      active: false,
      canBeCompact: false,

      init() {
        let folders = FolderUtils.getMostRecentFolders(
          MailServices.accounts.allFolders,
          Services.prefs.getIntPref("mail.folder_widget.max_recent"),
          "MRUTime"
        );
        for (let folder of folders) {
          let folderRow = folderPane._createFolderRow(
            this.name,
            folder,
            "both"
          );
          this.containerList.appendChild(folderRow);
        }
      },

      removeFolder(parentFolder, childFolder) {
        folderPane.getRowForFolder(childFolder)?.remove();
      },
    },
    tags: {
      name: "tags",
      active: false,
      canBeCompact: false,

      init() {
        this._smartServer = MailServices.accounts.findServer(
          "nobody",
          "smart mailboxes",
          "none"
        );
        if (!this._smartServer) {
          this._smartServer = MailServices.accounts.createIncomingServer(
            "nobody",
            "smart mailboxes",
            "none"
          );
          // We don't want the "smart" server/account leaking out into the ui in
          // other places, so set it as hidden.
          this._smartServer.hidden = true;
          let account = MailServices.accounts.createAccount();
          account.incomingServer = this._smartServer;
        }
        this._smartServer.prettyName =
          messengerBundle.GetStringFromName("unifiedAccountName");
        let smartRoot = this._smartServer.rootFolder.QueryInterface(
          Ci.nsIMsgLocalMailFolder
        );
        this._tagsFolder =
          smartRoot.getChildWithURI(`${smartRoot.URI}/tags`, false, false) ??
          smartRoot.createLocalSubfolder("tags");
        this._tagsFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

        for (let tag of MailServices.tags.getAllTags()) {
          try {
            let folder = this._getVirtualFolder(tag);
            this.containerList.appendChild(
              folderPane._createTagRow(this.name, folder, tag)
            );
          } catch (ex) {
            console.error(ex);
          }
        }
        MailServices.accounts.saveVirtualFolders();
      },

      /**
       * Get or create a virtual folder searching messages for `tag`.
       *
       * @param {nsIMsgTag} tag
       * @returns {nsIMsgFolder}
       */
      _getVirtualFolder(tag) {
        let folder = this._tagsFolder.getChildWithURI(
          `${this._tagsFolder.URI}/${encodeURIComponent(tag.key)}`,
          false,
          false
        );
        if (folder) {
          return folder;
        }

        folder = this._tagsFolder.createLocalSubfolder(tag.key);
        folder.flags |= Ci.nsMsgFolderFlags.Virtual;
        folder.prettyName = tag.tag;

        let msgDatabase = folder.msgDatabase;
        let folderInfo = msgDatabase.dBFolderInfo;

        folderInfo.setCharProperty(
          "searchStr",
          `AND (tag,contains,${tag.key})`
        );
        folderInfo.setCharProperty("searchFolderUri", "*");
        folderInfo.setUint32Property(
          "searchFolderFlag",
          Ci.nsMsgFolderFlags.Inbox
        );
        folderInfo.setBooleanProperty("searchOnline", false);
        msgDatabase.summaryValid = true;
        msgDatabase.close(true);

        this._tagsFolder.notifyFolderAdded(folder);
        return folder;
      },

      /**
       * Update the UI to match changes in a tag. If the tag is no longer
       * valid (i.e. it's been deleted) the row representing it will be
       * removed. If the tag is new, a row for it will be created.
       *
       * @param {string} prefName - The full name of the preference that
       *   changed causing this code to run.
       */
      changeTagFromPrefChange(prefName) {
        let [, , key] = prefName.split(".");
        if (!MailServices.tags.isValidKey(key)) {
          let uri = `${this._tagsFolder.URI}/${encodeURIComponent(key)}`;
          folderPane.getRowForFolder(uri)?.remove();
          return;
        }

        let tag = MailServices.tags.getAllTags().find(t => t.key == key);
        let folder = this._getVirtualFolder(tag);
        let row = folderPane.getRowForFolder(folder);
        folder.prettyName = tag.tag;
        if (row) {
          row.name = tag.tag;
          row.icon.style.setProperty("--icon-color", tag.color);
        } else {
          this.containerList.appendChild(
            folderPane._createTagRow(this.name, folder, tag)
          );
        }
      },
    },
  },

  /**
   * Initialize the folder pane if needed.
   * @returns {Promise<void>} when the folder pane is initialized.
   */
  async init() {
    if (this._initialized) {
      return;
    }
    if (window.openingState?.syntheticView) {
      // Just avoid initialising the pane. We won't be using it. The folder
      // listener is still required, because it does other things too.
      MailServices.mailSession.AddFolderListener(
        folderListener,
        Ci.nsIFolderListener.all
      );
      return;
    }

    try {
      // We could be here before `loadPostAccountWizard` loads the virtual
      // folders, and we need them, so do it now.
      MailServices.accounts.loadVirtualFolders();
    } catch (e) {
      console.error(e);
    }

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

    // Don't await anything between the active modes being initialised (the
    // line above) and the listener being added. Otherwise folders may appear
    // while we're not listening.
    MailServices.mailSession.AddFolderListener(
      folderListener,
      Ci.nsIFolderListener.all
    );

    Services.prefs.addObserver("mail.accountmanager.accounts", this);
    Services.prefs.addObserver("mailnews.tags.", this);

    Services.obs.addObserver(this, "folder-color-changed");
    Services.obs.addObserver(this, "folder-color-preview");
    Services.obs.addObserver(this, "search-folders-changed");
    Services.obs.addObserver(this, "folder-properties-changed");

    folderTree.addEventListener("auxclick", this);
    folderTree.addEventListener("contextmenu", this);
    folderTree.addEventListener("collapsed", this);
    folderTree.addEventListener("expanded", this);
    folderTree.addEventListener("dragstart", this);
    folderTree.addEventListener("dragover", this);
    folderTree.addEventListener("dragleave", this);
    folderTree.addEventListener("drop", this);

    document.getElementById("folderPaneHeaderBar").hidden =
      this.isFolderPaneHeaderHidden();
    const folderPaneGetMessages = document.getElementById(
      "folderPaneGetMessages"
    );
    folderPaneGetMessages.addEventListener("click", () => {
      top.MsgGetMessagesForAccount();
    });
    folderPaneGetMessages.addEventListener("contextmenu", event => {
      document
        .getElementById("folderPaneGetMessagesContext")
        .openPopup(event.target, { triggerEvent: event });
    });
    document
      .getElementById("folderPaneWriteMessage")
      .addEventListener("click", event => {
        top.MsgNewMessage(event);
      });
    folderPaneGetMessages.hidden = this.isFolderPaneGetMsgsBtnHidden();
    document.getElementById("folderPaneWriteMessage").hidden =
      this.isFolderPaneNewMsgBtnHidden();
    this.moreContext = document.getElementById("folderPaneMoreContext");
    this.folderPaneModeContext = document.getElementById(
      "folderPaneModeContext"
    );

    document
      .getElementById("folderPaneMoreButton")
      .addEventListener("click", event => {
        this.moreContext.openPopup(event.target, { triggerEvent: event });
      });
    this.subFolderContext = document.getElementById(
      "folderModesContextMenuPopup"
    );
    document
      .getElementById("folderModesContextMenuPopup")
      .addEventListener("click", event => {
        this.subFolderContext.openPopup(event.target, { triggerEvent: event });
      });
    this.updateFolderRowUIElements();
    this.updateWidgets();

    this._initialized = true;
  },

  uninit() {
    if (!this._initialized) {
      return;
    }
    Services.prefs.removeObserver("mail.accountmanager.accounts", this);
    Services.prefs.removeObserver("mailnews.tags.", this);
    Services.obs.removeObserver(this, "folder-color-changed");
    Services.obs.removeObserver(this, "folder-color-preview");
    Services.obs.removeObserver(this, "search-folders-changed");
    Services.obs.removeObserver(this, "folder-properties-changed");
  },

  handleEvent(event) {
    switch (event.type) {
      case "select":
        this._onSelect(event);
        break;
      case "auxclick":
        if (event.button == 1) {
          this._onMiddleClick(event);
        }
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

  observe(subject, topic, data) {
    switch (topic) {
      case "nsPref:changed":
        if (data == "mail.accountmanager.accounts") {
          this._forAllActiveModes("changeAccountOrder");
        } else if (
          data.startsWith("mailnews.tags.") &&
          this._modes.tags.active
        ) {
          // The tags service isn't updated until immediately after the
          // preferences change, so go to the back of the event queue before
          // updating the UI.
          setTimeout(() => this._modes.tags.changeTagFromPrefChange(data));
        }
        break;
      case "search-folders-changed":
        if (this._modes.smart.active) {
          subject.QueryInterface(Ci.nsIMsgFolder);
          if (subject.server == this._modes.smart._smartServer) {
            this._modes.smart.changeSearchedFolders(subject);
          }
        }
        break;
      case "folder-properties-changed":
        this.updateFolderProperties(subject.QueryInterface(Ci.nsIMsgFolder));
        break;
      case "folder-color-changed":
      case "folder-color-preview":
        this._changeRows(subject, row => row.setIconColor(data));
        break;
    }
  },

  /**
   * Whether the folder pane has been initialized.
   *
   * @type {boolean}
   */
  get isInitialized() {
    return this._initialized;
  },

  /**
   * If the local folders are currently hidden.
   *
   * @returns {boolean}
   */
  get hideLocalFolders() {
    this._hideLocalFolders = this.isItemHidden("folderPaneLocalFolders");
    return this._hideLocalFolders;
  },

  /**
   * Reload the folder tree when the option changes.
   *
   * @param {boolean} - True if local folders should be hidden.
   */
  set hideLocalFolders(value) {
    if (value == this._hideLocalFolders) {
      return;
    }

    this._hideLocalFolders = value;
    for (let mode of Object.values(this._modes)) {
      if (!mode.active) {
        continue;
      }
      mode.containerList.replaceChildren();
      this._initMode(mode);
    }
    this.updateFolderRowUIElements();
  },

  /**
   * Toggle the folder modes requested by the user.
   *
   * @param {Event} event - The DOMEvent.
   */
  toggleFolderMode(event) {
    let currentModes = this.activeModes;
    let mode = event.target.getAttribute("value");
    let index = this.activeModes.indexOf(mode);

    if (event.target.hasAttribute("checked")) {
      if (index == -1) {
        currentModes.push(mode);
      }
    } else if (index >= 0) {
      currentModes.splice(index, 1);
    }
    this.activeModes = currentModes;
    this.toggleCompactViewMenuItem();

    if (this.activeModes.length == 1 && this.activeModes.at(0) == "all") {
      this.updateContextCheckedFolderMode();
    }
  },

  toggleCompactViewMenuItem() {
    let subMenuCompactBtn = document.querySelector(
      "#folderPaneMoreContextCompactToggle"
    );
    if (this.canBeCompact) {
      subMenuCompactBtn.removeAttribute("disabled");
      return;
    }
    subMenuCompactBtn.setAttribute("disabled", "true");
  },

  /**
   * Ensure all the folder modes menuitems in the pane header context menu are
   * checked to reflect the currently active modes.
   */
  updateContextCheckedFolderMode() {
    for (let item of document.querySelectorAll(".folder-pane-mode")) {
      if (this.activeModes.includes(item.value)) {
        item.setAttribute("checked", true);
        continue;
      }
      item.removeAttribute("checked");
    }
  },

  /**
   * Ensures all the folder pane mode context menuitems in the folder
   * pane mode context menu are checked to reflect the current compact mode.
   * @param {Event} event - The DOMEvent.
   */
  onFolderPaneModeContextOpening(event) {
    this.mode = event.target.closest("[data-mode]")?.dataset.mode;

    // If folder mode is at the top or the only one,
    // it can't be moved up, so disable "Move Up".
    const moveUpMenuItem = this.folderPaneModeContext.querySelector(
      "#folderPaneModeMoveUp"
    );
    moveUpMenuItem.removeAttribute("disabled");
    // Apply attribute mode to context menu option to allow
    // for sorting later
    if (this.activeModes.at(0) == this.mode) {
      moveUpMenuItem.setAttribute("disabled", "true");
    }

    // If folder mode is at the bottom or the only one,
    // it can't be moved down, so disable "Move Down".
    const moveDownMenuItem = this.folderPaneModeContext.querySelector(
      "#folderPaneModeMoveDown"
    );
    moveDownMenuItem.removeAttribute("disabled");
    // Apply attribute mode to context menu option to allow
    // for sorting later
    if (this.activeModes.at(-1) == this.mode) {
      moveDownMenuItem.setAttribute("disabled", "true");
    }

    let compactMenuItem = this.folderPaneModeContext.querySelector(
      "#compactFolderButton"
    );
    compactMenuItem.removeAttribute("checked");
    compactMenuItem.removeAttribute("disabled");
    if (!this.canModeBeCompact(this.mode)) {
      compactMenuItem.setAttribute("disabled", "true");
      return;
    }
    if (this.isCompact) {
      compactMenuItem.setAttribute("checked", true);
    }
  },

  /**
   * Toggles the compact mode of the active modes that allow it.
   *
   * @param {Event} event - The DOMEvent.
   */
  compactFolderToggle(event) {
    this.isCompact = event.target.hasAttribute("checked");
  },

  /**
   * Moves active folder mode up
   *
   * @param {Event} event - The DOMEvent.
   */
  moveFolderModeUp(event) {
    let currentModes = this.activeModes;
    const mode = this.mode;
    const index = currentModes.indexOf(mode);

    if (index > 0) {
      const prev = currentModes[index - 1];
      currentModes[index - 1] = currentModes[index];
      currentModes[index] = prev;
    }
    this.activeModes = currentModes;
  },

  /**
   * Moves active folder mode down
   *
   * @param {Event} event - The DOMEvent.
   */
  moveFolderModeDown(event) {
    let currentModes = this.activeModes;
    const mode = this.mode;
    const index = currentModes.indexOf(mode);

    if (index < currentModes.length - 1) {
      const next = currentModes[index + 1];
      currentModes[index + 1] = currentModes[index];
      currentModes[index] = next;
    }
    this.activeModes = currentModes;
  },

  /**
   * The names of all active modes.
   *
   * @type {string[]}
   */
  get activeModes() {
    return Array.from(folderTree.children, li => li.dataset.mode);
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
    this.updateFolderRowUIElements();
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
   * Do any of the active modes have a compact variant?
   *
   * @param {string} mode
   * @type {boolean}
   */
  canModeBeCompact(mode) {
    return Object.values(this._modes).some(
      m => m.name == mode && m.active && m.canBeCompact
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
    if (this._isCompact == value) {
      return;
    }
    this._isCompact = value;
    for (let mode of Object.values(this._modes)) {
      if (!mode.active || !mode.canBeCompact) {
        continue;
      }

      mode.containerList.replaceChildren();
      this._initMode(mode);
    }
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

    let container =
      this._modeTemplate.content.firstElementChild.cloneNode(true);
    container.dataset.mode = modeName;

    mode.container = container;
    mode.containerHeader = container.querySelector(".mode-container");
    mode.containerHeader.querySelector(".mode-name").textContent =
      messengerBundle.GetStringFromName(
        modeName == "tags" ? "tag" : `folderPaneModeHeader_${modeName}`
      );
    mode.containerList = container.querySelector("ul");
    this._initMode(mode);
    mode.active = true;
    container.querySelector(".mode-button").addEventListener("click", event => {
      this.onFolderPaneModeContextOpening(event);
      this.folderPaneModeContext.openPopup(event.target, {
        triggerEvent: event,
      });
    });
  },

  /**
   * Initialize a folder mode with all visible accounts.
   *
   * @param {object} mode - One of the folder modes from `folderPane._modes`.
   */
  _initMode(mode) {
    if (typeof mode.init == "function") {
      mode.init();
    }
    if (typeof mode.initServer != "function") {
      return;
    }

    // `.accounts` is used here because it is ordered, `.allServers` isn't.
    for (let account of MailServices.accounts.accounts) {
      // Skip local folders if they're hidden.
      if (
        account.incomingServer.type == "none" &&
        folderPane.hideLocalFolders
      ) {
        continue;
      }
      // Skip IM accounts.
      if (account.incomingServer.type == "im") {
        continue;
      }
      // Skip POP3 accounts that are deferred to another account.
      if (
        account.incomingServer instanceof Ci.nsIPop3IncomingServer &&
        account.incomingServer.deferredToAccount
      ) {
        continue;
      }
      mode.initServer(account.incomingServer);
    }
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
   * @param {"folder"|"server"|"both"} nameStyle
   * @returns {FolderTreeRow}
   */
  _createFolderRow(modeName, folder, nameStyle) {
    let row = document.createElement("li", { is: "folder-tree-row" });
    row.modeName = modeName;
    row.setFolder(folder, nameStyle);
    return row;
  },

  /**
   * Create a FolderTreeRow representing a virtual folder for a tag.
   *
   * @param {string} modeName - The name of the mode this row belongs to.
   * @param {nsIMsgFolder} folder - The virtual folder the row represents.
   * @param {nsIMsgTag} tag - The tag the virtual folder searches for.
   * @returns {FolderTreeRow}
   */
  _createTagRow(modeName, folder, tag) {
    let row = document.createElement("li", { is: "folder-tree-row" });
    row.modeName = modeName;
    row.setFolder(folder);
    row.dataset.tagKey = tag.key;
    row.icon.style.setProperty("--icon-color", tag.color);
    return row;
  },

  /**
   * Add a server row to the given list in the correct sort order.
   *
   * @param {HTMLUListElement} list
   * @param {FolderTreeRow} serverRow
   * @returns {FolderTreeRow}
   */
  _insertInServerOrder(list, serverRow) {
    let serverKeys = MailServices.accounts.accounts.map(
      a => a.incomingServer.key
    );
    let index = serverKeys.indexOf(serverRow.dataset.serverKey);
    for (let row of list.children) {
      let i = serverKeys.indexOf(row.dataset.serverKey);

      if (i > index) {
        return list.insertBefore(serverRow, row);
      }
      if (i < index) {
        continue;
      }

      if (row.folderSortOrder > serverRow.folderSortOrder) {
        return list.insertBefore(serverRow, row);
      }
      if (row.folderSortOrder < serverRow.folderSortOrder) {
        continue;
      }

      if (FolderTreeRow.nameCollator.compare(row.name, serverRow.name) > 0) {
        return list.insertBefore(serverRow, row);
      }
    }
    return list.appendChild(serverRow);
  },

  _reapplyServerOrder(list) {
    let selected = list.querySelector("li.selected");
    let serverKeys = MailServices.accounts.accounts.map(
      a => a.incomingServer.key
    );
    let serverRows = [...list.children];
    serverRows.sort(
      (a, b) =>
        serverKeys.indexOf(a.dataset.serverKey) -
        serverKeys.indexOf(b.dataset.serverKey)
    );
    list.replaceChildren(...serverRows);
    if (selected) {
      setTimeout(() => selected.classList.add("selected"));
    }
  },

  /**
   * Adds a row representing a folder and any missing rows for ancestors of
   * the folder.
   *
   * @param {HTMLUListElement} containerList - The list to add folders to.
   * @param {nsIMsgFolder} folder
   * @param {string} modeName - The name of the mode this row belongs to.
   * @returns {FolderTreeRow}
   */
  _addFolderAndAncestors(containerList, folder, modeName) {
    let folderRow = folderPane.getRowForFolder(folder, modeName);
    if (folderRow) {
      return folderRow;
    }

    if (folder.isServer) {
      let serverRow = folderPane._createServerRow(modeName, folder.server);
      this._insertInServerOrder(containerList, serverRow);
      return serverRow;
    }

    let parentRow = this._addFolderAndAncestors(
      containerList,
      folderPane._getNonGmailParent(folder),
      modeName
    );
    folderRow = folderPane._createFolderRow(modeName, folder);
    parentRow.insertChildInOrder(folderRow);
    return folderRow;
  },

  /**
   * @callback folderFilterCallback
   * @param {FolderTreeRow} row
   * @returns {boolean} - True if the folder should have a row in the tree.
   */
  /**
   * Removes the row representing a folder and the rows for any ancestors of
   * the folder, as long as they don't have other descendants or match
   * `filterFunction`.
   *
   * @param {nsIMsgFolder} folder
   * @param {string} modeName - The name of the mode this row belongs to.
   * @param {folderFilterCallback} [filterFunction] - Optional callback to stop
   *   ascending.
   * @param {boolean=false} childAlreadyGone - Is this function being called
   *   to remove the parent of a row that's already been removed?
   */
  _removeFolderAndAncestors(
    folder,
    modeName,
    filterFunction,
    childAlreadyGone = false
  ) {
    let folderRow = folderPane.getRowForFolder(folder, modeName);
    if (folderPane._isCompact) {
      folderRow?.remove();
      return;
    }

    // If we get to a row for a folder that doesn't exist, or has children
    // other than the one being removed, don't go any further.
    if (
      !folderRow ||
      folderRow.childList.childElementCount > (childAlreadyGone ? 0 : 1)
    ) {
      return;
    }

    // Otherwise, move up the folder tree.
    let parentFolder = folderPane._getNonGmailParent(folder);
    if (
      parentFolder &&
      (typeof filterFunction != "function" || !filterFunction(parentFolder))
    ) {
      this._removeFolderAndAncestors(parentFolder, modeName, filterFunction);
    }

    // Remove the row for this folder.
    folderRow.remove();
  },

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
    let subFolders;
    try {
      subFolders = parentFolder.subFolders;
    } catch (ex) {
      console.error(
        new Error(`Unable to access the subfolders of ${parentFolder.URI}`, {
          cause: ex,
        })
      );
    }
    if (!subFolders?.length) {
      return;
    }

    for (let i = 0; i < subFolders.length; i++) {
      let folder = subFolders[i];
      if (this._isGmailFolder(folder)) {
        subFolders.splice(i, 1, ...folder.subFolders);
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

    let modeNames = modeName ? [modeName] : this.activeModes;
    for (let name of modeNames) {
      let id = FolderTreeRow.makeRowID(name, folderOrURI);
      // Look in the mode's container. The container may or may not be
      // attached to the document at this point.
      let row = this._modes[name].containerList.querySelector(
        `#${CSS.escape(id)}`
      );
      if (row) {
        return row;
      }
    }

    return null;
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
   * We deliberately hide the [Gmail] (or [Google Mail] in some cases) folder
   * from the folder tree. This function determines if a folder is that folder.
   *
   * @param {nsIMsgFolder} folder
   * @returns {boolean}
   */
  _isGmailFolder(folder) {
    return (
      folder?.parent?.isServer &&
      folder.server instanceof Ci.nsIImapIncomingServer &&
      folder.server.isGMailServer &&
      folder.noSelect
    );
  },

  /**
   * If a folder is the [Gmail] folder, returns the parent folder, otherwise
   * returns the given folder.
   *
   * @param {nsIMsgFolder} folder
   * @returns {nsIMsgFolder}
   */
  _getNonGmailFolder(folder) {
    return this._isGmailFolder(folder) ? folder.parent : folder;
  },

  /**
   * Returns the parent folder of a given folder, or if that is the [Gmail]
   * folder returns the grandparent of the given folder.
   *
   * @param {nsIMsgFolder} folder
   * @returns {nsIMsgFolder}
   */
  _getNonGmailParent(folder) {
    return this._getNonGmailFolder(folder.parent);
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

    if (this._isGmailFolder(childFolder)) {
      return;
    }

    parentFolder = this._getNonGmailFolder(parentFolder);
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

    parentFolder = this._getNonGmailFolder(parentFolder);
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
    this._changeRows(item, row => row.setFolderTypeFromFolder(item));
  },

  /**
   * Update the list of folders to reflect current properties.
   *
   * @param {nsIMsgFolder} item - The folder whose data to use.
   */
  updateFolderProperties(item) {
    this._forAllActiveModes("updateFolderProperties", item);
    this._changeRows(item, row => row.setFolderPropertiesFromFolder(item));
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
   * @param {integer} newValue
   */
  changeUnreadCount(folder, newValue) {
    this._changeRows(folder, row => {
      // Find the nearest visible ancestor and update it.
      let collapsedAncestor = row.parentNode.closest("li.collapsed");
      while (collapsedAncestor) {
        let next = collapsedAncestor.parentNode.closest("li.collapsed");
        if (!next) {
          collapsedAncestor.updateUnreadMessageCount();
          break;
        }
        collapsedAncestor = next;
      }

      // Update the row itself.
      row.unreadCount = newValue;
    });

    if (this._modes.unread.active && !folder.server.hidden) {
      this._modes.unread.changeUnreadCount(folder, newValue);
    }
  },

  /**
   * Called when a server's `prettyName` changes, to update the UI.
   *
   * @param {nsIMsgFolder} folder
   * @param {string} name
   */
  changeServerName(folder, name) {
    for (let row of folderTree.querySelectorAll(
      `li[data-server-key="${folder.server.key}"]`
    )) {
      row.setServerName(name);
    }
  },

  /**
   * Called when a folder's unread count changes, to update the UI.
   *
   * @param {nsIMsgFolder} folder
   * @param {integer} newValue
   */
  changeTotalCount(folder, newValue) {
    this._changeRows(folder, row => (row.totalCount = newValue));
  },

  /**
   * Update the UI widget to reflect the real folder size when the "FolderSize"
   * property changes.
   *
   * @param {nsIMsgFolder} folder
   */
  changeFolderSize(folder) {
    if (folderPane.isItemVisible("folderPaneFolderSize")) {
      this._changeRows(folder, row => row.updateSizeCount(false, folder));
    }
  },

  _onSelect(event) {
    const isSynthetic = gViewWrapper?.isSynthetic;
    threadPane.saveSelection();
    threadPane.hideIgnoredMessageNotification();
    if (!isSynthetic) {
      // Don't clear the message pane for synthetic views, as a message may have
      // already been selected in restoreState().
      messagePane.clearAll();
    }

    let uri = folderTree.rows[folderTree.selectedIndex]?.uri;
    if (!uri) {
      gFolder = null;
      return;
    }
    gFolder = MailServices.folderLookup.getFolderForURL(uri);

    // Bail out if this is synthetic view, such as a gloda search.
    if (isSynthetic) {
      return;
    }

    document.head.querySelector(`link[rel="icon"]`).href =
      FolderUtils.getFolderIcon(gFolder);

    // Clean up any existing view wrapper. This will invalidate the thread tree.
    gViewWrapper?.close();

    if (gFolder.isServer) {
      document.title = gFolder.server.prettyName;
      gViewWrapper = gDBView = threadTree.view = null;

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

      quickFilterBar.activeElement = null;
      threadPane.restoreColumns();

      gViewWrapper = new DBViewWrapper(dbViewWrapperListener);

      threadPane.scrollToNewMessage =
        !(gFolder.flags & Ci.nsMsgFolderFlags.Virtual) &&
        gFolder.hasNewMessages &&
        Services.prefs.getBoolPref("mailnews.scroll_to_new_message");
      if (threadPane.scrollToNewMessage) {
        threadPane.forgetSelection(uri);
      }

      gViewWrapper.open(gFolder);

      // At this point `dbViewWrapperListener.onCreatedView` gets called,
      // setting up gDBView and scrolling threadTree to the right end.

      threadPane.updateListRole(
        !gViewWrapper?.showThreaded && !gViewWrapper?.showGroupedBySort
      );
      threadPane.restoreSortIndicator();
      threadPane.restoreSelection();
      threadPaneHeader.onFolderSelected();
    }

    this._updateStatusQuota();

    window.dispatchEvent(
      new CustomEvent("folderURIChanged", { bubbles: true, detail: uri })
    );
  },

  /**
   * Update the quotaPanel to reflect current folder quota status.
   */
  _updateStatusQuota() {
    if (top.window.document.getElementById("status-bar").hidden) {
      return;
    }
    const quotaPanel = top.window.document.getElementById("quotaPanel");
    if (!(gFolder && gFolder instanceof Ci.nsIMsgImapMailFolder)) {
      quotaPanel.hidden = true;
      return;
    }

    let tabListener = event => {
      // Hide the pane if the new tab ain't us.
      quotaPanel.hidden =
        top.window.document.getElementById("tabmail").currentAbout3Pane ==
        this.window;
    };
    top.window.document.removeEventListener("TabSelect", tabListener);

    // For display on main window panel only include quota names containing
    // "STORAGE" or "MESSAGE". This will exclude unusual quota names containing
    // items like "MAILBOX" and "LEVEL" from the panel bargraph. All quota names
    // will still appear on the folder properties quota window.
    // Note: Quota name is typically something like "User Quota / STORAGE".
    let folderQuota = gFolder
      .getQuota()
      .filter(
        quota =>
          quota.name.toUpperCase().includes("STORAGE") ||
          quota.name.toUpperCase().includes("MESSAGE")
      );
    if (!folderQuota.length) {
      quotaPanel.hidden = true;
      return;
    }
    // If folderQuota not empty, find the index of the element with highest
    //  percent usage and determine if it is above the panel display threshold.
    let quotaUsagePercentage = q =>
      Number((100n * BigInt(q.usage)) / BigInt(q.limit));
    let highest = folderQuota.reduce((acc, current) =>
      quotaUsagePercentage(acc) > quotaUsagePercentage(current) ? acc : current
    );
    let percent = quotaUsagePercentage(highest);
    if (
      percent <
      Services.prefs.getIntPref("mail.quota.mainwindow_threshold.show")
    ) {
      quotaPanel.hidden = true;
    } else {
      quotaPanel.hidden = false;
      top.window.document.addEventListener("TabSelect", tabListener);

      top.window.document
        .getElementById("quotaMeter")
        .setAttribute("value", percent);

      let usage;
      let limit;
      if (/STORAGE/i.test(highest.name)) {
        let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
          Ci.nsIMessenger
        );
        usage = messenger.formatFileSize(highest.usage * 1024);
        limit = messenger.formatFileSize(highest.limit * 1024);
      } else {
        usage = highest.usage;
        limit = highest.limit;
      }

      top.window.document.getElementById("quotaLabel").value = `${percent}%`;
      top.window.document.l10n.setAttributes(
        top.window.document.getElementById("quotaLabel"),
        "quota-panel-percent-used",
        { percent, usage, limit }
      );
      if (
        percent <
        Services.prefs.getIntPref("mail.quota.mainwindow_threshold.warning")
      ) {
        quotaPanel.classList.remove("alert-warning", "alert-critical");
      } else if (
        percent <
        Services.prefs.getIntPref("mail.quota.mainwindow_threshold.critical")
      ) {
        quotaPanel.classList.remove("alert-critical");
        quotaPanel.classList.add("alert-warning");
      } else {
        quotaPanel.classList.remove("alert-warning");
        quotaPanel.classList.add("alert-critical");
      }
    }
  },

  _onMiddleClick(event) {
    if (
      event.target.closest(".mode-container") ||
      folderTree.selectedIndex == -1
    ) {
      return;
    }
    const row = event.target.closest("li");
    if (!row) {
      return;
    }

    top.MsgOpenNewTabForFolders(
      [MailServices.folderLookup.getFolderForURL(row.uri)],
      {
        event,
        folderPaneVisible: !paneLayout.folderPaneSplitter.isCollapsed,
        messagePaneVisible: !paneLayout.messagePaneSplitter.isCollapsed,
      }
    );
  },

  _onContextMenu(event) {
    if (folderTree.selectedIndex == -1) {
      return;
    }

    let popup = document.getElementById("folderPaneContext");

    if (event.button == 2) {
      // Mouse
      if (event.target.closest(".mode-container")) {
        return;
      }
      let row = event.target.closest("li");
      if (!row) {
        return;
      }
      if (row.uri != gFolder.URI) {
        // The right-clicked-on folder is not `gFolder`. Tell the context menu
        // to use it instead. This override lasts until the context menu fires
        // a "popuphidden" event.
        folderPaneContextMenu.setOverrideFolder(
          MailServices.folderLookup.getFolderForURL(row.uri)
        );
        row.classList.add("context-menu-target");
      }
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
    } else {
      // Keyboard
      let row = folderTree.getRowAtIndex(folderTree.selectedIndex);
      popup.openPopup(row, "after_end", 0, 0, true);
    }

    event.preventDefault();
  },

  _onCollapsed({ target }) {
    if (target.uri) {
      let mode = target.closest("[data-mode]").dataset.mode;
      FolderTreeProperties.setIsExpanded(target.uri, mode, false);
    }
    target.updateUnreadMessageCount();
    target.updateTotalMessageCount();
  },

  _onExpanded({ target }) {
    if (target.uri) {
      let mode = target.closest("[data-mode]").dataset.mode;
      FolderTreeProperties.setIsExpanded(target.uri, mode, true);
    }
    target.updateUnreadMessageCount();
    target.updateTotalMessageCount();

    // Get server type. IMAP is the only server type that does folder discovery.
    let folder = MailServices.folderLookup.getFolderForURL(target.uri);
    if (folder.server.type == "imap") {
      if (folder.isServer) {
        folder.server.performExpand(top.msgWindow);
      } else {
        folder.QueryInterface(Ci.nsIMsgImapMailFolder);
        folder.performExpand(top.msgWindow);
      }
    }
  },

  _onDragStart(event) {
    let row = event.target.closest(`li[is="folder-tree-row"]`);
    if (!row) {
      event.preventDefault();
      return;
    }

    let folder = MailServices.folderLookup.getFolderForURL(row.uri);
    if (!folder || folder.isServer) {
      event.preventDefault();
      return;
    }
    if (folder.server.type == "nntp") {
      event.dataTransfer.mozSetDataAt("text/x-moz-newsfolder", folder, 0);
      event.dataTransfer.effectAllowed = "move";
      return;
    }

    event.dataTransfer.mozSetDataAt("text/x-moz-folder", folder, 0);
    event.dataTransfer.effectAllowed = "copyMove";
  },

  _onDragOver(event) {
    const copyKey =
      AppConstants.platform == "macosx" ? event.altKey : event.ctrlKey;

    event.dataTransfer.dropEffect = "none";
    event.preventDefault();

    let row = event.target.closest("li");
    this._timedExpand(row);
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
      event.dataTransfer.dropEffect = copyKey ? "copy" : "move";
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
      if (sourceFolder.server == targetFolder.server && copyKey) {
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
      event.dataTransfer.dropEffect = copyKey ? "copy" : "move";
    } else if (types.includes("application/x-moz-file")) {
      if (targetFolder.isServer || !targetFolder.canFileMessages) {
        return;
      }
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        let extFile = event.dataTransfer
          .mozGetDataAt("application/x-moz-file", i)
          .QueryInterface(Ci.nsIFile);
        if (!extFile.isFile() || !/\.eml$/i.test(extFile.leafName)) {
          return;
        }
      }
      event.dataTransfer.dropEffect = "copy";
    } else if (types.includes("text/x-moz-newsfolder")) {
      let folder = event.dataTransfer
        .mozGetDataAt("text/x-moz-newsfolder", 0)
        .QueryInterface(Ci.nsIMsgFolder);
      if (
        targetFolder.isServer ||
        targetFolder.server.type != "nntp" ||
        folder == targetFolder ||
        folder.server != targetFolder.server
      ) {
        return;
      }
      event.dataTransfer.dropEffect = "move";
    } else if (
      types.includes("text/x-moz-url-data") ||
      types.includes("text/x-moz-url")
    ) {
      // Allow subscribing to feeds by dragging an url to a feed account.
      if (
        targetFolder.server.type == "rss" &&
        !targetFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true) &&
        event.dataTransfer.items.length == 1 &&
        FeedUtils.getFeedUriFromDataTransfer(event.dataTransfer)
      ) {
        return;
      }
      event.dataTransfer.dropEffect = "link";
    } else {
      return;
    }

    this._clearDropTarget();
    row.classList.add("drop-target");
  },

  /**
   * Set a timer to expand `row` in 500ms. If called again before the timer
   * expires and with a different row, the timer is cleared and a new one
   * started. If `row` is falsy or isn't collapsed the timer is cleared.
   *
   * @param {?HTMLLIElement} row
   */
  _timedExpand(row) {
    if (this._expandRow == row) {
      return;
    }
    if (this._expandTimer) {
      clearTimeout(this._expandTimer);
    }
    if (!row?.classList.contains("collapsed")) {
      return;
    }
    this._expandRow = row;
    this._expandTimer = setTimeout(() => {
      this._autoExpandedRow = this._expandRow;
      folderTree.expandRow(this._expandRow);
      delete this._expandRow;
      delete this._expandTimer;
    }, 500);
  },

  _clearDropTarget() {
    folderTree.querySelector(".drop-target")?.classList.remove("drop-target");
  },

  _onDrop(event) {
    this._timedExpand();
    if (this._autoExpandedRow) {
      folderTree.collapseRow(this._autoExpandedRow);
      delete this._autoExpandedRow;
    }
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
      if (isMove) {
        dbViewWrapperListener.threadPaneCommandUpdater.updateNextMessageAfterDelete();
      }
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
      let isMove = event.dataTransfer.dropEffect == "move";
      isMove = folderPaneContextMenu.transferFolder(
        isMove,
        sourceFolder,
        targetFolder
      );
      // Save in prefs the target folder URI and if this was a move or copy.
      // This is to fill in the next folder or message context menu item
      // "Move|Copy to <TargetFolderName> Again".
      Services.prefs.setStringPref(
        "mail.last_msg_movecopy_target_uri",
        targetFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
    } else if (types.includes("application/x-moz-file")) {
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        let extFile = event.dataTransfer
          .mozGetDataAt("application/x-moz-file", i)
          .QueryInterface(Ci.nsIFile);
        if (extFile.isFile() && /\.eml$/i.test(extFile.leafName)) {
          MailServices.copy.copyFileMessage(
            extFile,
            targetFolder,
            null,
            false,
            1,
            "",
            null,
            top.msgWindow
          );
        }
      }
    } else if (types.includes("text/x-moz-newsfolder")) {
      let folder = event.dataTransfer
        .mozGetDataAt("text/x-moz-newsfolder", 0)
        .QueryInterface(Ci.nsIMsgFolder);

      let mode = row.closest("li[data-mode]").dataset.mode;
      let newsRoot = targetFolder.rootFolder.QueryInterface(
        Ci.nsIMsgNewsFolder
      );
      newsRoot.reorderGroup(folder, targetFolder);
      setTimeout(
        () => (folderTree.selectedRow = this.getRowForFolder(folder, mode))
      );
    } else if (
      types.includes("text/x-moz-url-data") ||
      types.includes("text/x-moz-url")
    ) {
      // This is a potential rss feed. A link image as well as link text url
      // should be handled; try to extract a url from non moz apps as well.
      let feedURI = FeedUtils.getFeedUriFromDataTransfer(event.dataTransfer);
      FeedUtils.subscribeToFeed(feedURI.spec, targetFolder);
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
   * @param {nsIMsgFolder} [folder] - Folder to edit, if not the selected one.
   * @param {string} [tabID] - Id of initial tab to select in the folder
   *   properties dialog.
   */
  editFolder(folder = gFolder, tabID) {
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

    function editFolderCallback(newName, oldName) {
      if (newName != oldName) {
        folder.rename(newName, top.msgWindow);
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
      if (gFolder == folder) {
        gViewWrapper?.close();
        folder.updateFolder(top.msgWindow);
        folderTree.dispatchEvent(new CustomEvent("select"));
      } else {
        folder.updateFolder(top.msgWindow);
      }
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
        tabID,
        name: folder.prettyName,
        rebuildSummaryCallback: rebuildSummary,
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
          trash.emptyTrash(null);
        }
      }
    } else {
      folder.emptyTrash(null);
    }
  },

  /**
   * Deletes everything (folders and messages) in the selected folder.
   * The folder is only emptied if it has the proper Junk flag.
   *
   * @param {nsIMsgFolder} folder - The folder to empty.
   * @param {boolean} [prompt=true] - If the user should be prompted.
   */
  emptyJunk(folder, prompt = true) {
    if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
      return;
    }

    if (prompt && !this._checkConfirmationPrompt("emptyJunk", folder)) {
      return;
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      // This is the unified junk folder.
      let wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
      for (let searchFolder of wrappedFolder.searchFolders) {
        this.emptyJunk(searchFolder, false);
      }
      return;
    }

    // Delete any subfolders this folder might have
    for (let subFolder of folder.subFolders) {
      folder.propagateDelete(subFolder, true);
    }

    let messages = [...folder.messages];
    if (!messages.length) {
      return;
    }

    // Now delete the messages
    folder.deleteMessages(messages, top.msgWindow, true, false, null, false);
  },

  /**
   * Compacts the given folder.
   *
   * @param {nsIMsgFolder} folder
   */
  compactFolder(folder) {
    // Can't compact folders that have just been compacted.
    if (folder.server.type != "imap" && !folder.expungedBytes) {
      return;
    }

    folder.compact(null, top.msgWindow);
  },

  /**
   * Compacts all folders for the account that the given folder belongs to.
   *
   * @param {nsIMsgFolder} folder
   */
  compactAllFoldersForAccount(folder) {
    folder.rootFolder.compactAll(null, top.msgWindow);
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
      "chrome,modal,centerscreen,resizable=yes",
      {
        folder,
        searchTerms: aSearchTerms,
        newFolderName: name,
      }
    );
  },

  editVirtualFolder(aFolder) {
    let folder = aFolder;

    function editVirtualCallback() {
      if (gFolder == folder) {
        folderTree.dispatchEvent(new CustomEvent("select"));
      }
    }
    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen,resizable=yes",
      {
        folder,
        editExistingFolder: true,
        onOKCallback: editVirtualCallback,
        msgWindow: top.msgWindow,
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
    document.getElementById("folderPaneWriteMessage").disabled =
      !canWriteMessages;
  },

  isFolderPaneGetMsgsBtnHidden() {
    return this.isItemHidden("folderPaneGetMessages");
  },

  isFolderPaneNewMsgBtnHidden() {
    return this.isItemHidden("folderPaneWriteMessage");
  },

  isFolderPaneHeaderHidden() {
    return this.isItemHidden("folderPaneHeaderBar");
  },

  isItemHidden(item) {
    return Services.xulStore.getValue(XULSTORE_URL, item, "hidden") == "true";
  },

  isItemVisible(item) {
    return Services.xulStore.getValue(XULSTORE_URL, item, "visible") == "true";
  },

  /**
   * Ensure the pane header context menu items are correctly checked.
   */
  updateContextMenuCheckedItems() {
    for (let item of document.querySelectorAll(".folder-pane-option")) {
      switch (item.id) {
        case "folderPaneHeaderToggleGetMessages":
          this.isFolderPaneGetMsgsBtnHidden()
            ? item.removeAttribute("checked")
            : item.setAttribute("checked", true);
          break;
        case "folderPaneHeaderToggleNewMessage":
          this.isFolderPaneNewMsgBtnHidden()
            ? item.removeAttribute("checked")
            : item.setAttribute("checked", true);
          break;
        case "folderPaneHeaderToggleTotalCount":
          this.isTotalMsgCountVisible()
            ? item.setAttribute("checked", true)
            : item.removeAttribute("checked");
          break;
        case "folderPaneMoreContextCompactToggle":
          this.isCompact
            ? item.setAttribute("checked", true)
            : item.removeAttribute("checked");
          this.toggleCompactViewMenuItem();
          break;
        case "folderPaneHeaderToggleFolderSize":
          this.isItemVisible("folderPaneFolderSize")
            ? item.setAttribute("checked", true)
            : item.removeAttribute("checked");
          break;
        case "folderPaneHeaderToggleLocalFolders":
          this.isItemHidden("folderPaneLocalFolders")
            ? item.setAttribute("checked", true)
            : item.removeAttribute("checked");
          break;
        default:
          item.removeAttribute("checked");
          break;
      }
    }
  },

  toggleGetMsgsBtn(event) {
    let show = event.target.hasAttribute("checked");
    document.getElementById("folderPaneGetMessages").hidden = !show;

    this.updateXULStoreAttribute("folderPaneGetMessages", "hidden", show);
  },

  toggleNewMsgBtn(event) {
    let show = event.target.hasAttribute("checked");
    document.getElementById("folderPaneWriteMessage").hidden = !show;

    this.updateXULStoreAttribute("folderPaneWriteMessage", "hidden", show);
  },

  toggleHeader(show) {
    document.getElementById("folderPaneHeaderBar").hidden = !show;
    this.updateXULStoreAttribute("folderPaneHeaderBar", "hidden", show);
  },

  updateXULStoreAttribute(element, attribute, value) {
    Services.xulStore.setValue(
      XULSTORE_URL,
      element,
      attribute,
      value ? "false" : "true"
    );
  },

  /**
   * Ensure the folder rows UI elements reflect the state set by the user.
   */
  updateFolderRowUIElements() {
    this.toggleTotalCountBadge();
    this.toggleFolderSizes(this.isItemVisible("folderPaneFolderSize"));
  },

  /**
   * Check XULStore to see if the total message count badges should be hidden.
   */
  isTotalMsgCountVisible() {
    return this.isItemVisible("totalMsgCount");
  },

  /**
   * Toggle the total message count badges and update the XULStore.
   */
  toggleTotal(event) {
    let show = !event.target.hasAttribute("checked");
    this.updateXULStoreAttribute("totalMsgCount", "visible", show);
    this.toggleTotalCountBadge();
  },

  toggleTotalCountBadge() {
    const isHidden = !this.isTotalMsgCountVisible();
    for (let row of document.querySelectorAll(`li[is="folder-tree-row"]`)) {
      row.toggleTotalCountBadgeVisibility(isHidden);
    }
  },

  /**
   * Toggle the folder size option and update the XULStore.
   */
  toggleFolderSize(event) {
    let show = !event.target.hasAttribute("checked");
    this.updateXULStoreAttribute("folderPaneFolderSize", "visible", show);
    this.toggleFolderSizes(!show);
  },

  /**
   * Toggle the folder size info on each folder.
   */
  toggleFolderSizes(visible) {
    const isHidden = !visible;
    for (let row of document.querySelectorAll(`li[is="folder-tree-row"]`)) {
      row.updateSizeCount(isHidden);
    }
  },

  /**
   * Toggle the hiding of the local folders and update the XULStore.
   */
  toggleLocalFolders(event) {
    let isHidden = event.target.hasAttribute("checked");
    this.updateXULStoreAttribute("folderPaneLocalFolders", "hidden", !isHidden);
    folderPane.hideLocalFolders = isHidden;
  },

  /**
   * Populate the "Get Messages" context menu with all available servers that
   * we can fetch data for.
   */
  updateGetMessagesContextMenu() {
    const menupopup = document.getElementById("folderPaneGetMessagesContext");
    while (menupopup.lastElementChild.classList.contains("server")) {
      menupopup.lastElementChild.remove();
    }

    // Get all servers in the proper sorted order.
    const servers = FolderUtils.allAccountsSorted(true)
      .map(a => a.incomingServer)
      .filter(s => s.rootFolder.isServer && s.type != "none");
    for (let server of servers) {
      const menuitem = document.createXULElement("menuitem");
      menuitem.classList.add("menuitem-iconic", "server");
      menuitem.dataset.serverType = server.type;
      menuitem.dataset.serverSecure = server.isSecure;
      menuitem.label = server.prettyName;
      menuitem.addEventListener("command", () =>
        top.MsgGetMessagesForAccount(server.rootFolder)
      );
      menupopup.appendChild(menuitem);
    }
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
   * Creates an identifier unique for the given mode name and folder URI.
   *
   * @param {string} modeName
   * @param {string} uri
   * @returns {string}
   */
  static makeRowID(modeName, uri) {
    return `${modeName}-${btoa(MailStringUtils.stringToByteString(uri))}`;
  }

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
  totalCountLabel;
  /** @type {HTMLSpanElement} */
  folderSizeLabel;
  /** @type {HTMLUListElement} */
  childList;

  constructor() {
    super();
    this.setAttribute("is", "folder-tree-row");
    this.append(folderPane._folderTemplate.content.cloneNode(true));
    this.nameLabel = this.querySelector(".name");
    this.icon = this.querySelector(".icon");
    this.unreadCountLabel = this.querySelector(".unread-count");
    this.totalCountLabel = this.querySelector(".total-count");
    this.folderSizeLabel = this.querySelector(".folder-size");
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
    if (this.name != value) {
      this.nameLabel.textContent = value;
      this.#updateAriaLabel();
    }
  }

  /**
   * Format and set the name label of this row.
   */
  _setName() {
    switch (this._nameStyle) {
      case "server":
        this.name = this._serverName;
        break;
      case "folder":
        this.name = this._folderName;
        break;
      case "both":
        this.name = `${this._folderName} - ${this._serverName}`;
        break;
    }
  }

  /**
   * The number of unread messages for this folder.
   *
   * @type {integer}
   */
  get unreadCount() {
    return parseInt(this.unreadCountLabel.textContent, 10) || 0;
  }

  set unreadCount(value) {
    this.classList.toggle("unread", value > 0);
    // Avoid setting `textContent` if possible, each change notifies the
    // MutationObserver on `folderTree`, and there could be *many* changes.
    let textNode = this.unreadCountLabel.firstChild;
    if (textNode) {
      textNode.nodeValue = value;
    } else {
      this.unreadCountLabel.textContent = value;
    }
    this.#updateAriaLabel();
  }

  /**
   * The total number of messages for this folder.
   *
   * @type {integer}
   */
  get totalCount() {
    return parseInt(this.totalCountLabel.textContent, 10) || 0;
  }

  set totalCount(value) {
    this.classList.toggle("total", value > 0);
    this.totalCountLabel.textContent = value;
    this.#updateAriaLabel();
  }

  /**
   * The folder size for this folder.
   *
   * @type {integer}
   */
  get folderSize() {
    return this.folderSizeLabel.textContent;
  }

  set folderSize(value) {
    this.folderSizeLabel.textContent = value;
    this.#updateAriaLabel();
  }

  #updateAriaLabel() {
    // Collect the various strings and fluent IDs to build the full string for
    // the folder aria-label.
    let ariaLabelPromises = [];
    ariaLabelPromises.push(this.name);

    // If unread messages.
    const count = this.unreadCount;
    if (count > 0) {
      ariaLabelPromises.push(
        document.l10n.formatValue("folder-pane-unread-aria-label", { count })
      );
    }

    // If total messages is visible.
    if (folderPane.isTotalMsgCountVisible()) {
      ariaLabelPromises.push(
        document.l10n.formatValue("folder-pane-total-aria-label", {
          count: this.totalCount,
        })
      );
    }

    if (folderPane.isItemVisible("folderPaneFolderSize")) {
      ariaLabelPromises.push(this.folderSize);
    }

    Promise.allSettled(ariaLabelPromises).then(results => {
      const folderLabel = results
        .map(settledPromise => settledPromise.value ?? "")
        .filter(value => value.trim() != "")
        .join(", ");
      this.setAttribute("aria-label", folderLabel);
      this.title = folderLabel;
    });
  }

  /**
   * Set some common properties based on the URI for this row.
   * `this.modeName` must be set before calling this function.
   *
   * @param {string} uri
   */
  _setURI(uri) {
    this.id = FolderTreeRow.makeRowID(this.modeName, uri);
    this.uri = uri;
    if (!FolderTreeProperties.getIsExpanded(uri, this.modeName)) {
      this.classList.add("collapsed");
    }
    this.setIconColor();
  }

  /**
   * Set the icon color to the given color, or if none is given the value from
   * FolderTreeProperties, or the default.
   *
   * @param {string?} iconColor
   */
  setIconColor(iconColor) {
    if (!iconColor) {
      iconColor = FolderTreeProperties.getColor(this.uri);
    }
    this.icon.style.setProperty("--icon-color", iconColor ?? "");
  }

  /**
   * Set some properties based on the server for this row.
   *
   * @param {nsIMsgIncomingServer} server
   */
  setServer(server) {
    this._setURI(server.rootFolder.URI);
    this.dataset.serverKey = server.key;
    this.dataset.serverType = server.type;
    this.dataset.serverSecure = server.isSecure;
    this._nameStyle = "server";
    this._serverName = server.prettyName;
    this._setName();
    this.setFolderPropertiesFromFolder(server.rootFolder);
  }

  /**
   * Set some properties based on the folder for this row.
   *
   * @param {nsIMsgFolder} folder
   * @param {"folder"|"server"|"both"} nameStyle
   */
  setFolder(folder, nameStyle = "folder") {
    this._setURI(folder.URI);
    this.dataset.serverKey = folder.server.key;
    this.setFolderTypeFromFolder(folder);
    this.setFolderPropertiesFromFolder(folder);
    this._nameStyle = nameStyle;
    this._serverName = folder.server.prettyName;
    this._folderName = folder.abbreviatedName;
    this._setName();
    const isCollapsed = this.classList.contains("collapsed");
    this.unreadCount = folder.getNumUnread(isCollapsed);
    this.totalCount = folder.getTotalMessages(isCollapsed);
    if (folderPane.isItemVisible("folderPaneFolderSize")) {
      this.folderSize = this.formatFolderSize(folder.sizeOnDisk);
    }
    this.folderSortOrder = folder.sortOrder;
    if (folder.noSelect) {
      this.classList.add("noselect-folder");
    } else {
      this.setAttribute("draggable", "true");
    }
  }

  updateUnreadMessageCount() {
    this.unreadCount = MailServices.folderLookup
      .getFolderForURL(this.uri)
      .getNumUnread(this.classList.contains("collapsed"));
  }

  updateTotalMessageCount() {
    const folder = MailServices.folderLookup.getFolderForURL(this.uri);
    this.totalCount = folder.getTotalMessages(
      this.classList.contains("collapsed")
    );
    if (folderPane.isItemVisible("folderPaneFolderSize")) {
      this.updateSizeCount(false, folder);
    }
  }

  updateSizeCount(isHidden, folder = null) {
    this.folderSizeLabel.hidden = isHidden;
    if (!isHidden) {
      folder = folder ?? MailServices.folderLookup.getFolderForURL(this.uri);
      this.folderSize = this.formatFolderSize(folder.sizeOnDisk);
    }
  }

  /**
   * Format the folder file size to display in the folder pane.
   *
   * @param {integer} size - The folder size on disk.
   * @returns {string} - The formatted folder size.
   */
  formatFolderSize(size) {
    return size / 1024 < 1 ? "" : top.messenger.formatFileSize(size, true);
  }

  /**
   * Update the visibility of the total count badge.
   *
   * @param {boolean} isHidden
   */
  toggleTotalCountBadgeVisibility(isHidden) {
    this.totalCountLabel.hidden = isHidden;
    this.#updateAriaLabel();
  }

  /**
   * Sets the folder type property based on the folder for the row.
   *
   * @param {nsIMsgFolder} folder
   */
  setFolderTypeFromFolder(folder) {
    let folderType = FolderUtils.getSpecialFolderString(folder);
    if (folderType != "none") {
      this.dataset.folderType = folderType.toLowerCase();
    }
  }

  /**
   * Sets folder properties based on the folder for the row.
   *
   * @param {nsIMsgFolder} folder
   */
  setFolderPropertiesFromFolder(folder) {
    if (folder.server.type != "rss") {
      return;
    }
    let urls = !folder.isServer ? FeedUtils.getFeedUrlsInFolder(folder) : null;
    if (urls?.length == 1) {
      let url = urls[0];
      this.icon.style = `content: url("page-icon:${url}"); background-image: none;`;
    }
    let props = FeedUtils.getFolderProperties(folder);
    for (let name of ["hasError", "isBusy", "isPaused"]) {
      if (props.includes(name)) {
        this.dataset[name] = "true";
      } else {
        delete this.dataset[name];
      }
    }
  }

  /**
   * Update this row's name label to match the new `prettyName` of the server.
   *
   * @param {string} name
   */
  setServerName(name) {
    this._serverName = name;
    if (this._nameStyle != "folder") {
      this._setName();
    }
  }

  /**
   * Add a child row in the correct sort order.
   *
   * @param {FolderTreeRow} newChild
   * @returns {FolderTreeRow}
   */
  insertChildInOrder(newChild) {
    let { folderSortOrder, name } = newChild;
    for (let child of this.childList.children) {
      if (folderSortOrder < child.folderSortOrder) {
        return this.childList.insertBefore(newChild, child);
      }
      if (
        folderSortOrder == child.folderSortOrder &&
        FolderTreeRow.nameCollator.compare(name, child.name) < 0
      ) {
        return this.childList.insertBefore(newChild, child);
      }
    }
    return this.childList.appendChild(newChild);
  }
}
customElements.define("folder-tree-row", FolderTreeRow, { extends: "li" });

/**
 * Header area of the message list pane.
 */
var threadPaneHeader = {
  /**
   * The header bar element.
   * @type {?HTMLElement}
   */
  bar: null,
  /**
   * The h2 element receiving the folder name.
   * @type {?HTMLHeadElement}
   */
  folderName: null,
  /**
   * The span element receiving the message count.
   * @type {?HTMLSpanElement}
   */
  folderCount: null,
  /**
   * The quick filter toolbar toggle button.
   * @type {?HTMLButtonElement}
   */
  filterButton: null,
  /**
   * The display options button opening the popup.
   * @type {?HTMLButtonElement}
   */
  displayButton: null,
  /**
   * If the header area is hidden.
   * @type {boolean}
   */
  isHidden: false,

  init() {
    this.isHidden =
      Services.xulStore.getValue(XULSTORE_URL, "threadPaneHeader", "hidden") ===
      "true";
    this.bar = document.getElementById("threadPaneHeaderBar");
    this.bar.hidden = this.isHidden;

    this.folderName = document.getElementById("threadPaneFolderName");
    this.folderCount = document.getElementById("threadPaneFolderCount");
    this.selectedCount = document.getElementById("threadPaneSelectedCount");
    this.filterButton = document.getElementById("threadPaneQuickFilterButton");
    this.filterButton.addEventListener("click", () =>
      goDoCommand("cmd_toggleQuickFilterBar")
    );
    window.addEventListener("qfbtoggle", this);
    this.onQuickFilterToggle();

    this.displayButton = document.getElementById("threadPaneDisplayButton");
    this.displayContext = document.getElementById("threadPaneDisplayContext");
    this.displayButton.addEventListener("click", event => {
      this.displayContext.openPopup(event.target, { triggerEvent: event });
    });
  },

  uninit() {
    window.removeEventListener("qfbtoggle", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "qfbtoggle":
        this.onQuickFilterToggle();
        break;
    }
  },

  /**
   * Update the context menu to reflect the currently selected display options.
   *
   * @param {Event} event - The popupshowing DOMEvent.
   */
  updateDisplayContextMenu(event) {
    if (event.target.id != "threadPaneDisplayContext") {
      return;
    }
    const isTableLayout = document.body.classList.contains("layout-table");
    document
      .getElementById(
        isTableLayout ? "threadPaneTableView" : "threadPaneCardsView"
      )
      .setAttribute("checked", "true");
  },

  /**
   * Update the menuitems inside the thread pane sort menupopup.
   *
   * @param {Event} event - The popupshowing DOMEvent.
   */
  updateThreadPaneSortMenu(event) {
    if (event.target.id != "menu_threadPaneSortPopup") {
      return;
    }

    const hiddenColumns = threadPane.columns
      .filter(c => c.hidden)
      .map(c => c.sortKey);

    // Update menuitem to reflect sort key.
    for (const menuitem of event.target.querySelectorAll(`[name="sortby"]`)) {
      const sortKey = menuitem.getAttribute("value");
      menuitem.setAttribute(
        "checked",
        gViewWrapper.primarySortType == Ci.nsMsgViewSortType[sortKey]
      );
      if (hiddenColumns.includes(sortKey)) {
        menuitem.setAttribute("disabled", "true");
      } else {
        menuitem.removeAttribute("disabled");
      }
    }

    // Update sort direction menu items.
    event.target
      .querySelector(`[value="ascending"]`)
      .setAttribute("checked", gViewWrapper.isSortedAscending);
    event.target
      .querySelector(`[value="descending"]`)
      .setAttribute("checked", !gViewWrapper.isSortedAscending);

    // Update the threaded and groupedBy menu items.
    event.target
      .querySelector(`[value="threaded"]`)
      .setAttribute("checked", gViewWrapper.showThreaded);
    event.target
      .querySelector(`[value="unthreaded"]`)
      .setAttribute("checked", gViewWrapper.showUnthreaded);
    event.target
      .querySelector(`[value="group"]`)
      .setAttribute("checked", gViewWrapper.showGroupedBySort);
  },

  /**
   * Change the display view of the message list pane.
   *
   * @param {DOMEvent} event - The click event.
   */
  changePaneView(event) {
    const view = event.target.value;
    Services.xulStore.setValue(XULSTORE_URL, "threadPane", "view", view);
    threadPane.updateThreadView(view);
  },

  /**
   * Update the quick filter button based on the quick filter bar state.
   */
  onQuickFilterToggle() {
    const active = quickFilterBar.filterer.visible;
    this.filterButton.setAttribute("aria-pressed", active.toString());
  },

  /**
   * Toggle the visibility of the message list pane header.
   */
  toggleThreadPaneHeader() {
    this.isHidden = !this.isHidden;
    this.bar.hidden = this.isHidden;

    Services.xulStore.setValue(
      XULSTORE_URL,
      "threadPaneHeader",
      "hidden",
      this.isHidden
    );
    // Trigger a data refresh if we're revealing the header.
    if (!this.isHidden) {
      this.onFolderSelected();
    }
  },

  /**
   * Update the header data when the selected folder changes.
   */
  onFolderSelected() {
    // Bail out if the pane is hidden as we don't need to update anything.
    if (this.isHidden) {
      return;
    }

    // Hide any potential stale data if we don't have a folder.
    if (!gFolder && !gDBView && !gViewWrapper?.isSynthetic) {
      this.folderName.hidden = true;
      this.folderCount.hidden = true;
      this.selectedCount.hidden = true;
      return;
    }

    const folderName = gFolder?.abbreviatedName ?? document.title;
    this.folderName.textContent = folderName;
    this.folderName.title = folderName;
    document.l10n.setAttributes(
      this.folderCount,
      "thread-pane-folder-message-count",
      { count: gFolder?.getTotalMessages(false) || gDBView?.rowCount || 0 }
    );

    this.folderName.hidden = false;
    this.folderCount.hidden = false;
  },

  /**
   * Update the total message count in the header if the value changed for the
   * currently selected folder.
   *
   * @param {nsIMsgFolder} folder - The folder updating the count.
   * @param {integer} newValue
   */
  updateFolderCount(folder, newValue) {
    if (!gFolder || !folder || this.isHidden || folder.URI != gFolder.URI) {
      return;
    }

    document.l10n.setAttributes(
      this.folderCount,
      "thread-pane-folder-message-count",
      { count: newValue }
    );
  },

  /**
   * Count the number of currently selected messages and update the selected
   * message count indicator.
   */
  updateSelectedCount() {
    // Bail out if the pane is hidden as we don't need to update anything.
    if (this.isHidden) {
      return;
    }

    let count = gDBView?.getSelectedMsgHdrs().length;
    if (count < 2) {
      this.selectedCount.hidden = true;
      return;
    }
    document.l10n.setAttributes(
      this.selectedCount,
      "thread-pane-folder-selected-count",
      { count }
    );
    this.selectedCount.hidden = false;
  },
};

var threadPane = {
  /**
   * Non-persistent storage of the last-selected items in each folder.
   * Keys in this map are folder URIs. Values are objects containing an array
   * of the selected messages and the current message. Messages are referenced
   * by message key to account for possible changes in the folder.
   *
   * @type {Map<string, object>}
   */
  _savedSelections: new Map(),

  /**
   * This is set to true in folderPane._onSelect before opening the folder, if
   * new messages have been received and the corresponding preference is set.
   *
   * @type {boolean}
   */
  scrollToNewMessage: false,

  columns: getDefaultColumns(gFolder),

  cardColumns: getDefaultColumnsForCardsView(gFolder),

  async init() {
    quickFilterBar.init();

    this.setUpTagStyles();
    Services.prefs.addObserver("mailnews.tags.", this);

    Services.obs.addObserver(this, "addrbook-displayname-changed");

    // Ensure TreeView and its classes are properly defined.
    await customElements.whenDefined("tree-view-table-row");

    threadTree = document.getElementById("threadTree");
    this.treeTable = threadTree.table;
    this.treeTable.editable = true;
    this.treeTable.setPopupMenuTemplates([
      "threadPaneApplyColumnMenu",
      "threadPaneApplyViewMenu",
    ]);
    threadTree.setAttribute(
      "rows",
      !Services.xulStore.hasValue(XULSTORE_URL, "threadPane", "view") ||
        Services.xulStore.getValue(XULSTORE_URL, "threadPane", "view") ==
          "cards"
        ? "thread-card"
        : "thread-row"
    );

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "selectDelay",
      "mailnews.threadpane_select_delay",
      null,
      (name, oldValue, newValue) => (threadTree.dataset.selectDelay = newValue)
    );
    threadTree.dataset.selectDelay = this.selectDelay;

    window.addEventListener("uidensitychange", () => {
      this.densityChange();
      threadTree.reset();
    });
    this.densityChange();

    XPCOMUtils.defineLazyGetter(this, "notificationBox", () => {
      let container = document.getElementById("threadPaneNotificationBox");
      return new MozElements.NotificationBox(element =>
        container.append(element)
      );
    });

    this.treeTable.addEventListener("shift-column", event => {
      this.onColumnShifted(event.detail);
    });
    this.treeTable.addEventListener("reorder-columns", event => {
      this.onColumnsReordered(event.detail);
    });
    this.treeTable.addEventListener("column-resized", event => {
      this.treeTable.setColumnsWidths(XULSTORE_URL, event);
    });
    this.treeTable.addEventListener("columns-changed", event => {
      this.onColumnsVisibilityChanged(event.detail);
    });
    this.treeTable.addEventListener("sort-changed", event => {
      this.onSortChanged(event.detail);
    });
    this.treeTable.addEventListener("restore-columns", () => {
      this.restoreDefaultColumns();
    });
    this.treeTable.addEventListener("toggle-flag", event => {
      gDBView.applyCommandToIndices(
        event.detail.isFlagged
          ? Ci.nsMsgViewCommandType.unflagMessages
          : Ci.nsMsgViewCommandType.flagMessages,
        [event.detail.index]
      );
    });
    this.treeTable.addEventListener("toggle-unread", event => {
      gDBView.applyCommandToIndices(
        event.detail.isUnread
          ? Ci.nsMsgViewCommandType.markMessagesRead
          : Ci.nsMsgViewCommandType.markMessagesUnread,
        [event.detail.index]
      );
    });
    this.treeTable.addEventListener("toggle-spam", event => {
      gDBView.applyCommandToIndices(
        event.detail.isJunk
          ? Ci.nsMsgViewCommandType.unjunk
          : Ci.nsMsgViewCommandType.junk,
        [event.detail.index]
      );
    });
    this.treeTable.addEventListener("thread-changed", () => {
      sortController.toggleThreaded();
    });
    this.treeTable.addEventListener("request-delete", event => {
      gDBView.applyCommandToIndices(Ci.nsMsgViewCommandType.deleteMsg, [
        event.detail.index,
      ]);
    });

    this.updateClassList();

    threadTree.addEventListener("contextmenu", this);
    threadTree.addEventListener("dblclick", this);
    threadTree.addEventListener("auxclick", this);
    threadTree.addEventListener("keypress", this);
    threadTree.addEventListener("select", this);
    threadTree.table.body.addEventListener("dragstart", this);
    threadTree.addEventListener("dragover", this);
    threadTree.addEventListener("drop", this);
    threadTree.addEventListener("expanded", this);
    threadTree.addEventListener("collapsed", this);
  },

  uninit() {
    Services.prefs.removeObserver("mailnews.tags.", this);
    Services.obs.removeObserver(this, "addrbook-displayname-changed");
  },

  handleEvent(event) {
    switch (event.type) {
      case "contextmenu":
        this._onContextMenu(event);
        break;
      case "dblclick":
        this._onDoubleClick(event);
        break;

      case "auxclick":
        if (event.button == 1) {
          this._onMiddleClick(event);
        }
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
      case "dragover":
        this._onDragOver(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
      case "expanded":
      case "collapsed":
        if (event.detail == threadTree.selectedIndex) {
          // The selected index hasn't changed, but a collapsed row represents
          // multiple messages, so for our purposes the selection has changed.
          threadTree.dispatchEvent(new CustomEvent("select"));
        }
        break;
    }
  },
  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      this.setUpTagStyles();
    } else if (topic == "addrbook-displayname-changed") {
      // This runs the when mail.displayname.version preference observer is
      // notified/the mail.displayname.version number has been updated.
      threadTree.invalidate();
    }
  },

  /**
   * Update the CSS classes of the thread tree based on the current folder.
   */
  updateClassList() {
    if (!gFolder) {
      threadTree.classList.remove("is-outgoing");
      return;
    }

    threadTree.classList.toggle("is-outgoing", isOutgoing(gFolder));
  },

  /**
   * Temporarily select a different index from the actual selection, without
   * visually changing or losing the current selection.
   *
   * @param {integer} index - The index of the clicked row.
   */
  suppressSelect(index) {
    this.saveSelection();
    threadTree._selection.selectEventsSuppressed = true;
    threadTree._selection.select(index);
  },

  /**
   * Clear the selection suppression and restore the previous selection.
   */
  releaseSelection() {
    threadTree._selection.selectEventsSuppressed = true;
    this.restoreSelection(undefined, false);
    threadTree._selection.selectEventsSuppressed = false;
  },

  _onDoubleClick(event) {
    if (event.target.closest("button") || event.target.closest("menupopup")) {
      // Prevent item activation if double click happens on a button inside the
      // row. E.g.: Thread toggle, spam, favorite, etc. or in a menupopup like
      // the column picker.
      return;
    }
    this._onItemActivate(event);
  },

  _onKeyPress(event) {
    if (event.target.closest("thead")) {
      // Bail out if the keypress happens in the table header.
      return;
    }

    if (event.key == "Enter") {
      this._onItemActivate(event);
    }
  },

  _onMiddleClick(event) {
    const row =
      event.target.closest(`tr[is^="thread-"]`) ||
      threadTree.getRowAtIndex(threadTree.currentIndex);

    const isSelected = gDBView.selection.isSelected(row.index);
    if (!isSelected) {
      // The middle-clicked row is not selected. Tell the activate item to use
      // this instead.
      this.suppressSelect(row.index);
    }
    this._onItemActivate(event);
    if (!isSelected) {
      this.releaseSelection();
    }
  },

  _onItemActivate(event) {
    if (gDBView.getFlagsAt(threadTree.selectedIndex) & MSG_VIEW_FLAG_DUMMY) {
      return;
    }

    let folder = gFolder || gDBView.hdrForFirstSelectedMessage.folder;
    if (folder?.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)) {
      commandController.doCommand("cmd_editDraftMsg", event);
    } else if (folder?.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)) {
      commandController.doCommand("cmd_newMsgFromTemplate", event);
    } else {
      commandController.doCommand("cmd_openMessage", event);
    }
  },

  /**
   * Handle threadPane select events.
   */
  _onSelect(event) {
    if (!paneLayout.messagePaneVisible.isCollapsed && gDBView) {
      messagePane.clearWebPage();
      switch (gDBView.numSelected) {
        case 0:
          messagePane.clearMessage();
          messagePane.clearMessages();
          threadPaneHeader.selectedCount.hidden = true;
          break;
        case 1:
          if (
            gDBView.getFlagsAt(threadTree.selectedIndex) & MSG_VIEW_FLAG_DUMMY
          ) {
            messagePane.clearMessage();
            messagePane.clearMessages();
            threadPaneHeader.selectedCount.hidden = true;
          } else {
            let uri = gDBView.getURIForViewIndex(threadTree.selectedIndex);
            messagePane.displayMessage(uri);
            threadPaneHeader.updateSelectedCount();
          }
          break;
        default:
          messagePane.displayMessages(gDBView.getSelectedMsgHdrs());
          threadPaneHeader.updateSelectedCount();
          break;
      }
    }

    // Update the state of the zoom commands, since the view has changed.
    const commandsToUpdate = [
      "cmd_fullZoomReduce",
      "cmd_fullZoomEnlarge",
      "cmd_fullZoomReset",
      "cmd_fullZoomToggle",
    ];
    for (const command of commandsToUpdate) {
      top.goUpdateCommand(command);
    }
  },

  /**
   * Handle threadPane drag events.
   */
  _onDragStart(event) {
    let row = event.target.closest(`tr[is^="thread-"]`);
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

  /**
   * Handle threadPane dragover events.
   */
  _onDragOver(event) {
    if (event.target.closest("thead")) {
      return; // Only allow dropping in the body.
    }
    // Must prevent default. Otherwise dropEffect gets cleared.
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
    let types = Array.from(event.dataTransfer.mozTypesAt(0));
    let targetFolder = gFolder;
    if (types.includes("application/x-moz-file")) {
      if (targetFolder.isServer || !targetFolder.canFileMessages) {
        return;
      }
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        let extFile = event.dataTransfer
          .mozGetDataAt("application/x-moz-file", i)
          .QueryInterface(Ci.nsIFile);
        if (!extFile.isFile() || !/\.eml$/i.test(extFile.leafName)) {
          return;
        }
      }
      event.dataTransfer.dropEffect = "copy";
    }
  },

  /**
   * Handle threadPane drop events.
   */
  _onDrop(event) {
    if (event.target.closest("thead")) {
      return; // Only allow dropping in the body.
    }
    event.preventDefault();
    for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
      let extFile = event.dataTransfer
        .mozGetDataAt("application/x-moz-file", i)
        .QueryInterface(Ci.nsIFile);
      if (extFile.isFile() && /\.eml$/i.test(extFile.leafName)) {
        MailServices.copy.copyFileMessage(
          extFile,
          gFolder,
          null,
          false,
          1,
          "",
          null,
          top.msgWindow
        );
      }
    }
  },

  _onContextMenu(event, retry = false) {
    let row =
      event.target.closest(`tr[is^="thread-"]`) ||
      threadTree.getRowAtIndex(threadTree.currentIndex);
    const isMouse = event.button == 2;
    if (!isMouse && !row) {
      // Scroll selected row we're triggering the context menu for into view.
      threadTree.scrollToIndex(threadTree.currentIndex, true);
      row = threadTree.getRowAtIndex(threadTree.currentIndex);
      // Try again once in the next frame.
      if (!row && !retry) {
        window.requestAnimationFrame(() => this._onContextMenu(event, true));
        return;
      }
    }
    if (!row || gDBView.getFlagsAt(row.index) & MSG_VIEW_FLAG_DUMMY) {
      return;
    }

    mailContextMenu.setAsThreadPaneContextMenu();
    let popup = document.getElementById("mailContext");

    if (isMouse) {
      if (!gDBView.selection.isSelected(row.index)) {
        // The right-clicked-on row is not selected. Tell the context menu to
        // use it instead. This override lasts until the context menu fires
        // a "popuphidden" event.
        mailContextMenu.setOverrideSelection(row.index);
        row.classList.add("context-menu-target");
      }
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
    } else {
      popup.openPopup(row, "after_end", 0, 0, true);
    }

    event.preventDefault();
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

  _jsTree: {
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
        threadTree.scrollToIndex(index, true);
      }
    },
    invalidate() {
      if (!this._inBatch) {
        threadTree.reset();
      }
    },
    invalidateRange(startIndex, endIndex) {
      if (!this._inBatch) {
        threadTree.invalidateRange(startIndex, endIndex);
      }
    },
    rowCountChanged(index, count) {
      if (!this._inBatch) {
        threadTree.rowCountChanged(index, count);
      }
    },
    get currentIndex() {
      return threadTree.currentIndex;
    },
    set currentIndex(index) {
      threadTree.currentIndex = index;
    },
  },

  /**
   * Tell the tree and the view about each other. `nsITreeView.setTree` can't
   * be used because it needs a XULTreeElement and threadTree isn't one.
   * (Strictly speaking the shim passed here isn't a tree either but it does
   * implement the required methods.)
   *
   * @param {nsIMsgDBView} view
   */
  setTreeView(view) {
    threadTree.view = gDBView = view;
    // Clear the batch flag. Don't call `endUpdateBatch` as that may change in
    // future leading to unintended consequences.
    this._jsTree._inBatch = false;
    view.setJSTree(this._jsTree);
  },

  setUpTagStyles() {
    if (this.tagStyle) {
      this.tagStyle.remove();
    }
    this.tagStyle = document.head.appendChild(document.createElement("style"));

    for (let { color, key } of MailServices.tags.getAllTags()) {
      if (!color) {
        continue;
      }
      let selector = MailServices.tags.getSelectorForKey(key);
      let contrast = TagUtils.isColorContrastEnough(color) ? "black" : "white";
      this.tagStyle.sheet.insertRule(
        `tr[data-properties~="${selector}"] {
          --tag-color: ${color};
          --tag-contrast-color: ${contrast};
        }`
      );
    }
  },

  /**
   * Make the list rows density aware.
   */
  densityChange() {
    // The class ThreadRow can't be referenced because it's declared in a
    // different scope. But we can get it from customElements.
    let rowClass = customElements.get("thread-row");
    let cardClass = customElements.get("thread-card");
    switch (UIDensity.prefValue) {
      case UIDensity.MODE_COMPACT:
        rowClass.ROW_HEIGHT = 18;
        cardClass.ROW_HEIGHT = 62;
        break;
      case UIDensity.MODE_TOUCH:
        rowClass.ROW_HEIGHT = 32;
        cardClass.ROW_HEIGHT = 84;
        break;
      default:
        rowClass.ROW_HEIGHT = 26;
        cardClass.ROW_HEIGHT = 74;
        break;
    }
  },

  /**
   * Store the current thread tree selection.
   */
  saveSelection() {
    if (gFolder && gDBView) {
      this._savedSelections.set(gFolder.URI, {
        currentKey: gDBView.getKeyAt(threadTree.currentIndex),
        selectedKeys: threadTree.selectedIndices.map(gDBView.getKeyAt),
      });
    }
  },

  /**
   * Forget any saved selection of the given folder. This is useful if you're
   * going to set the selection after switching to the folder.
   *
   * @param {string} folderURI
   */
  forgetSelection(folderURI) {
    this._savedSelections.delete(folderURI);
  },

  /**
   * Restore the previously saved thread tree selection.
   *
   * @param {boolean} [discard=true] - If false, the selection data should be
   *   kept after restoring the selection, otherwise it is forgotten.
   * @param {boolean} [notify=true] - Whether a change in "select" event
   *   should be fired.
   */
  restoreSelection(discard = true, notify = true) {
    if (!this._savedSelections.has(gFolder?.URI) || !threadTree.view) {
      return;
    }

    let { currentKey, selectedKeys } = this._savedSelections.get(gFolder.URI);
    let currentIndex = nsMsgViewIndex_None;
    let indices = new Set();
    for (let key of selectedKeys) {
      let index = gDBView.findIndexFromKey(key, false);
      if (index != nsMsgViewIndex_None) {
        indices.add(index);
        if (key == currentKey) {
          currentIndex = index;
        }
        continue;
      }

      // The message for this key can't be found. Perhaps the thread it's in
      // has been collapsed? Select the root message in that case.
      try {
        let msgHdr = gFolder.GetMessageHeader(key);
        let thread = gDBView.getThreadContainingMsgHdr(msgHdr);
        let rootMsgHdr = thread.getRootHdr();
        index = gDBView.findIndexOfMsgHdr(rootMsgHdr, false);
        if (index != nsMsgViewIndex_None) {
          indices.add(index);
          if (key == currentKey) {
            currentIndex = index;
          }
        }
      } catch (ex) {
        console.error(ex);
      }
    }
    threadTree.setSelectedIndices(indices.values(), !notify);

    if (currentIndex != nsMsgViewIndex_None) {
      // Do an instant scroll before setting the index to avoid animation.
      threadTree.scrollToIndex(currentIndex, true);
      threadTree.currentIndex = currentIndex;
    }

    if (discard) {
      this._savedSelections.delete(gFolder.URI);
    }
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
    // Always fetch a fresh array of columns for the cards view even if we don't
    // have a folder defined.
    this.cardColumns = getDefaultColumnsForCardsView(gFolder);
    this.updateClassList();

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

    const stringState =
      msgDatabase.dBFolderInfo.getCharProperty("columnStates");
    if (!stringState) {
      // If we don't have a previously saved state, make sure to enforce the
      // default columns for the currently visible folder, otherwise the table
      // layout will maintain whatever state is currently set from the previous
      // folder, which it doesn't reflect reality.
      this.columns = getDefaultColumns(gFolder);
      return;
    }

    this.applyPersistedColumnsState(JSON.parse(stringState));
  },

  /**
   * Update the current columns to match a previously saved state.
   *
   * @param {JSON} columnStates - The parsed JSON of a previously saved state.
   */
  applyPersistedColumnsState(columnStates) {
    this.columns.forEach(c => {
      c.hidden = !columnStates[c.id]?.visible;
      c.ordinal = columnStates[c.id]?.ordinal ?? 0;
    });
    // Sort columns by ordinal.
    this.columns.sort(function (a, b) {
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
    if (!this.rowTemplate) {
      this.rowTemplate = document.getElementById("threadPaneRowTemplate");
    }

    // Update the row template to match the column properties.
    for (let column of this.columns) {
      let cell = this.rowTemplate.content.querySelector(
        `.${column.id.toLowerCase()}-column`
      );
      cell.hidden = column.hidden;
      this.rowTemplate.content.appendChild(cell);
    }

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
    this.columns = getDefaultColumns(gFolder, gViewWrapper?.isSynthetic);
    this.cardColumns = getDefaultColumnsForCardsView(gFolder);
    this.updateClassList();
    this.updateColumns();
    threadTree.reset();
    this.persistColumnStates();
  },

  /**
   * Shift the ordinal of a column by one based on the visible columns.
   *
   * @param {object} data - The detail object of the bubbled event.
   */
  onColumnShifted(data) {
    const column = data.column;
    const forward = data.forward;

    const columnToShift = this.columns.find(c => c.id == column);
    const currentPosition = this.columns.indexOf(columnToShift);

    let delta = forward ? 1 : -1;
    let newPosition = currentPosition + delta;
    // Account for hidden columns to find the correct new position.
    while (this.columns.at(newPosition).hidden) {
      newPosition += delta;
    }

    // Get the column in the current new position before shuffling the array.
    const destinationTH = document.getElementById(
      this.columns.at(newPosition).id
    );

    this.columns.splice(
      newPosition,
      0,
      this.columns.splice(currentPosition, 1)[0]
    );

    // Update the ordinal of the columns to reflect the new positions.
    this.columns.forEach((column, index) => {
      column.ordinal = index;
    });

    this.persistColumnStates();
    this.updateColumns(true);
    threadTree.reset();

    // Swap the DOM elements.
    const originalTH = document.getElementById(column);
    if (forward) {
      destinationTH.after(originalTH);
    } else {
      destinationTH.before(originalTH);
    }
    // Restore the focus so we can continue shifting if needed.
    document.getElementById(`${column}Button`).focus();
  },

  onColumnsReordered(data) {
    this.columns = data.columns;

    this.persistColumnStates();
    this.updateColumns(true);
    threadTree.reset();
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
    threadTree.reset();
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

    if (gViewWrapper.isSynthetic) {
      let syntheticView = gViewWrapper._syntheticView;
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

  /**
   * Hide any notifications about ignored threads.
   */
  hideIgnoredMessageNotification() {
    this.notificationBox.removeTransientNotifications();
  },

  /**
   * Show a notification in the thread pane footer, allowing the user to learn
   * more about the ignore thread feature, and also allowing undo ignore thread.
   *
   * @param {nsIMsgDBHdr[]} messages - The messages being ignored.
   * @param {boolean} subthreadOnly - If true, ignoring only `messages` and
   *   their subthreads, otherwise ignoring the whole thread.
   */
  showIgnoredMessageNotification(messages, subthreadOnly) {
    let threadIds = new Set();
    messages.forEach(function (msg) {
      if (!threadIds.has(msg.threadId)) {
        threadIds.add(msg.threadId);
      }
    });

    let buttons = [
      {
        label: messengerBundle.GetStringFromName("learnMoreAboutIgnoreThread"),
        accessKey: messengerBundle.GetStringFromName(
          "learnMoreAboutIgnoreThreadAccessKey"
        ),
        popup: null,
        callback(aNotificationBar, aButton) {
          let url = Services.prefs.getCharPref(
            "mail.ignore_thread.learn_more_url"
          );
          top.openContentTab(url);
          return true; // Keep notification open.
        },
      },
      {
        label: messengerBundle.GetStringFromName(
          !subthreadOnly ? "undoIgnoreThread" : "undoIgnoreSubthread"
        ),
        accessKey: messengerBundle.GetStringFromName(
          !subthreadOnly
            ? "undoIgnoreThreadAccessKey"
            : "undoIgnoreSubthreadAccessKey"
        ),
        isDefault: true,
        popup: null,
        callback(aNotificationBar, aButton) {
          messages.forEach(function (msg) {
            let msgDb = msg.folder.msgDatabase;
            if (subthreadOnly) {
              msgDb.markHeaderKilled(msg, false, null);
            } else if (threadIds.has(msg.threadId)) {
              let thread = msgDb.getThreadContainingMsgHdr(msg);
              msgDb.markThreadIgnored(
                thread,
                thread.getChildKeyAt(0),
                false,
                null
              );
              threadIds.delete(msg.threadId);
            }
          });
          // Invalidation should be unnecessary but the back end doesn't
          // notify us properly and resists attempts to fix this.
          threadTree.reset();
          threadTree.table.body.focus();
          return false; // Close notification.
        },
      },
    ];

    if (threadIds.size == 1) {
      let ignoredThreadText = messengerBundle.GetStringFromName(
        !subthreadOnly ? "ignoredThreadFeedback" : "ignoredSubthreadFeedback"
      );
      let subj = messages[0].mime2DecodedSubject || "";
      if (subj.length > 45) {
        subj = subj.substring(0, 45) + "…";
      }
      let text = ignoredThreadText.replace("#1", subj);

      this.notificationBox.appendNotification(
        "ignoreThreadInfo",
        {
          label: text,
          priority: this.notificationBox.PRIORITY_INFO_MEDIUM,
        },
        buttons
      );
    } else {
      let ignoredThreadText = messengerBundle.GetStringFromName(
        !subthreadOnly ? "ignoredThreadsFeedback" : "ignoredSubthreadsFeedback"
      );

      const { PluralForm } = ChromeUtils.importESModule(
        "resource:///modules/PluralForm.sys.mjs"
      );
      let text = PluralForm.get(threadIds.size, ignoredThreadText).replace(
        "#1",
        threadIds.size
      );
      this.notificationBox.appendNotification(
        "ignoreThreadsInfo",
        {
          label: text,
          priority: this.notificationBox.PRIORITY_INFO_MEDIUM,
        },
        buttons
      );
    }
  },

  /**
   * Update the display view of the message list. Current supported options are
   * table and cards.
   *
   * @param {string} view - The view type.
   */
  updateThreadView(view) {
    switch (view) {
      case "table":
        document.body.classList.add("layout-table");
        threadTree?.setAttribute("rows", "thread-row");
        break;
      case "cards":
      default:
        document.body.classList.remove("layout-table");
        threadTree?.setAttribute("rows", "thread-card");
        break;
    }
  },

  /**
   * Update the ARIA Role of the tree view table body to properly communicate
   * to assistive techonology the type of list we're rendering and toggles the
   * threaded class on the tree table header.
   *
   * @param {boolean} isListbox - If the list should have a listbox role.
   */
  updateListRole(isListbox) {
    threadTree.table.body.setAttribute(
      "role",
      isListbox ? "listbox" : "treegrid"
    );
    if (isListbox) {
      threadTree.table.header.classList.remove("threaded");
    } else {
      threadTree.table.header.classList.add("threaded");
    }
  },
};

var messagePane = {
  async init() {
    webBrowser = document.getElementById("webBrowser");
    // Attach the progress listener for the webBrowser. For the messageBrowser this
    // happens in the "aboutMessageLoaded" event from aboutMessage.js.
    top.contentProgress.addProgressListenerToBrowser(webBrowser);

    messageBrowser = document.getElementById("messageBrowser");
    messageBrowser.docShell.allowDNSPrefetch = false;

    multiMessageBrowser = document.getElementById("multiMessageBrowser");
    multiMessageBrowser.docShell.allowDNSPrefetch = false;

    if (messageBrowser.contentDocument.readyState != "complete") {
      await new Promise(resolve => {
        messageBrowser.addEventListener("load", () => resolve(), {
          capture: true,
          once: true,
        });
      });
    }

    if (multiMessageBrowser.contentDocument.readyState != "complete") {
      await new Promise(resolve => {
        multiMessageBrowser.addEventListener("load", () => resolve(), {
          capture: true,
          once: true,
        });
      });
    }
  },

  /**
   * Ensure all message pane browsers are blank.
   */
  clearAll() {
    this.clearWebPage();
    this.clearMessage();
    this.clearMessages();
  },

  /**
   * Ensure the web page browser is blank, unless the start page is shown.
   */
  clearWebPage() {
    if (!this._keepStartPageOpen) {
      webBrowser.hidden = true;
      MailE10SUtils.loadAboutBlank(webBrowser);
    }
  },

  /**
   * Display a web page in the web page browser. If `url` is not given, or is
   * "about:blank", the web page browser is cleared and hidden.
   *
   * @param {string} url - The URL to load.
   * @param {object} [params] - Any params to pass to MailE10SUtils.loadURI.
   */
  displayWebPage(url, params) {
    if (!paneLayout.messagePaneVisible) {
      return;
    }
    if (!url || url == "about:blank") {
      this._keepStartPageOpen = false;
      this.clearWebPage();
      return;
    }

    this.clearMessage();
    this.clearMessages();

    MailE10SUtils.loadURI(webBrowser, url, params);
    webBrowser.hidden = false;
  },

  /**
   * Ensure the message browser is not displaying a message.
   */
  clearMessage() {
    messageBrowser.hidden = true;
    messageBrowser.contentWindow.displayMessage();
  },

  /**
   * Display a single message in the message browser. If `messageURI` is not
   * given, the message browser is cleared and hidden.
   *
   * @param {string} messageURI
   */
  displayMessage(messageURI) {
    if (!paneLayout.messagePaneVisible) {
      return;
    }
    if (!messageURI) {
      this.clearMessage();
      return;
    }

    this._keepStartPageOpen = false;
    messagePane.clearWebPage();
    messagePane.clearMessages();

    messageBrowser.contentWindow.displayMessage(messageURI, gViewWrapper);
    messageBrowser.hidden = false;
  },

  /**
   * Ensure the multi-message browser is not displaying messages.
   */
  clearMessages() {
    multiMessageBrowser.hidden = true;
    multiMessageBrowser.contentWindow.gMessageSummary.clear();
  },

  /**
   * Display messages in the multi-message browser. For a single message, use
   * `displayMessage` instead. If `messages` is not given, or an empty array,
   * the multi-message browser is cleared and hidden.
   *
   * @param {nsIMsgDBHdr[]} messages
   */
  displayMessages(messages = []) {
    if (!paneLayout.messagePaneVisible) {
      return;
    }
    if (messages.length == 0) {
      this.clearMessages();
      return;
    }

    this._keepStartPageOpen = false;
    messagePane.clearWebPage();
    messagePane.clearMessage();

    let getThreadId = function (message) {
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
      function (messages) {
        threadTree.selectedIndices = messages
          .map(m => gDBView.findIndexOfMsgHdr(m, true))
          .filter(i => i != nsMsgViewIndex_None);
      }
    );

    multiMessageBrowser.hidden = false;
    window.dispatchEvent(new CustomEvent("MsgsLoaded", { bubbles: true }));
  },

  /**
   * Show the start page in the web page browser. The start page will remain
   * shown until a message is displayed.
   */
  showStartPage() {
    this._keepStartPageOpen = true;
    let url = Services.urlFormatter.formatURLPref("mailnews.start_page.url");
    if (/^mailbox:|^imap:|^pop:|^s?news:|^nntp:/i.test(url)) {
      console.warn(`Can't use ${url} as mailnews.start_page.url`);
      Services.prefs.clearUserPref("mailnews.start_page.url");
      url = Services.urlFormatter.formatURLPref("mailnews.start_page.url");
    }
    messagePane.displayWebPage(url);
  },
};

/**
 * Restore the UI to the given state.
 *
 * @param {boolean} folderPaneVisible - Whether to show the folder pane. If undefined,
 *    the folder pane is shown if a folder URI is provided or we're not restoring to a
 *    synthetic view.
 * @param {boolean} messagePaneVisible - Whether to show the message pane. If undefined,
 *    the message pane is shown as long as its wrapper is not collapsed.
 * @param {?nsIMsgFolder|string} folder - The folder to display, or its URI, if any.
 * @param {?GlodaSyntheticView} syntheticView - The synthetic view to restore to, if any.
 * @param {boolean} first - Whether this is the first call to this function (i.e. we're
 *    setting the state at the start of the application), in which case we want to greet
 *    the user with the start page.
 * @param {?string} title - If any, the title to set.
 */
function restoreState({
  folderPaneVisible,
  messagePaneVisible,
  folderURI,
  syntheticView,
  first = false,
  title = null,
} = {}) {
  if (folderPaneVisible === undefined) {
    folderPaneVisible = folderURI || !syntheticView;
  }
  paneLayout.folderPaneSplitter.isCollapsed = !folderPaneVisible;
  paneLayout.folderPaneSplitter.isDisabled = syntheticView;

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
    // In a synthetic view check if we have a previously edited column layout to
    // restore.
    if ("getPersistedSetting" in syntheticView) {
      let columnsState = syntheticView.getPersistedSetting("columns");
      if (!columnsState) {
        threadPane.restoreDefaultColumns();
        return;
      }

      threadPane.applyPersistedColumnsState(columnsState);
      threadPane.updateColumns();
    } else {
      // Otherwise restore the default synthetic columns.
      threadPane.restoreDefaultColumns();
    }

    gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
    gViewWrapper.openSynthetic(syntheticView);
    gDBView = gViewWrapper.dbView;

    if ("selectedMessage" in syntheticView) {
      threadTree.selectedIndex = gDBView.findIndexOfMsgHdr(
        syntheticView.selectedMessage,
        true
      );
    } else {
      // So that nsMsgSearchDBView::GetHdrForFirstSelectedMessage works from
      // the beginning.
      threadTree.currentIndex = 0;
    }

    document.title = title;
    document.body.classList.remove("account-central");
    accountCentralBrowser.hidden = true;
    threadPaneHeader.onFolderSelected();
  }

  if (
    first &&
    messagePaneVisible &&
    Services.prefs.getBoolPref("mailnews.start_page.enabled")
  ) {
    messagePane.showStartPage();
  }
}

/**
 * Set up the given folder to be selected in the folder pane.
 * @param {nsIMsgFolder|string} folder - The folder to display, or its URI.
 */
function displayFolder(folder) {
  let folderURI = folder instanceof Ci.nsIMsgFolder ? folder.URI : folder;
  if (folderTree.selectedRow?.uri == folderURI) {
    // Already set to display the right folder. Make sure not not to change
    // to the same folder in a different folder mode.
    return;
  }

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

/**
 * Update the thread pane selection if it doesn't already match `msgHdr`.
 * The selected folder will be changed if necessary. If the selection
 * changes, the message pane will also be updated (via a "select" event).
 *
 * @param {nsIMsgDBHdr} msgHdr
 */
function selectMessage(msgHdr) {
  if (
    gDBView?.numSelected == 1 &&
    gDBView.hdrForFirstSelectedMessage == msgHdr
  ) {
    return;
  }

  let index = threadTree.view?.findIndexOfMsgHdr(msgHdr, true);
  // Change to correct folder if needed. We might not be in a folder, or the
  // message might not be found in the current folder.
  if (index === undefined || index === nsMsgViewIndex_None) {
    threadPane.forgetSelection(msgHdr.folder.URI);
    displayFolder(msgHdr.folder.URI);
    index = threadTree.view.findIndexOfMsgHdr(msgHdr, true);
    threadTree.scrollToIndex(index, true);
  }
  threadTree.selectedIndex = index;
}

var folderListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
  onFolderAdded(parentFolder, childFolder) {
    folderPane.addFolder(parentFolder, childFolder);
    folderPane.updateFolderRowUIElements();
  },
  onMessageAdded(parentFolder, msg) {},
  onFolderRemoved(parentFolder, childFolder) {
    folderPane.removeFolder(parentFolder, childFolder);
    if (childFolder == gFolder) {
      gFolder = null;
      gViewWrapper?.close(true);
    }
  },
  onMessageRemoved(parentFolder, msg) {},
  onFolderPropertyChanged(folder, property, oldValue, newValue) {},
  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
    switch (property) {
      case "BiffState":
        folderPane.changeNewMessages(
          folder,
          newValue === Ci.nsIMsgFolder.nsMsgBiffState_NewMail
        );
        break;
      case "FolderFlag":
        folderPane.changeFolderFlag(folder, oldValue, newValue);
        break;
      case "FolderSize":
        folderPane.changeFolderSize(folder);
        break;
      case "TotalUnreadMessages":
        if (oldValue == newValue) {
          break;
        }
        folderPane.changeUnreadCount(folder, newValue);
        break;
      case "TotalMessages":
        if (oldValue == newValue) {
          break;
        }
        folderPane.changeTotalCount(folder, newValue);
        threadPaneHeader.updateFolderCount(folder, newValue);
        break;
    }
  },
  onFolderBoolPropertyChanged(folder, property, oldValue, newValue) {
    switch (property) {
      case "isDeferred":
        if (newValue) {
          folderPane.removeFolder(null, folder);
        } else {
          folderPane.addFolder(null, folder);
          for (let f of folder.descendants) {
            folderPane.addFolder(f.parent, f);
          }
        }
        break;
      case "NewMessages":
        folderPane.changeNewMessages(folder, newValue);
        break;
    }
  },
  onFolderUnicharPropertyChanged(folder, property, oldValue, newValue) {
    switch (property) {
      case "Name":
        if (folder.isServer) {
          folderPane.changeServerName(folder, newValue);
        }
        break;
    }
  },
  onFolderPropertyFlagChanged(folder, property, oldFlag, newFlag) {},
  onFolderEvent(folder, event) {
    if (event == "RenameCompleted") {
      // If a folder is renamed, we get an `onFolderAdded` notification for
      // the folder but we are not notified about the descendants.
      for (let f of folder.descendants) {
        folderPane.addFolder(f.parent, f);
      }
    }
  },
};

/**
 * Custom element for rows in the thread tree.
 */
customElements.whenDefined("tree-view-table-row").then(() => {
  class ThreadRow extends customElements.get("tree-view-table-row") {
    static ROW_HEIGHT = 22;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }

      super.connectedCallback();

      this.setAttribute("draggable", "true");
      this.appendChild(threadPane.rowTemplate.content.cloneNode(true));
    }

    get index() {
      return super.index;
    }

    set index(index) {
      super.index = index;

      let textColumns = [];
      for (let column of threadPane.columns) {
        // No need to update the text of this cell if it's hidden, the selection
        // column, or an icon column that doesn't match a specific flag.
        if (column.hidden || column.icon || column.select) {
          continue;
        }
        textColumns.push(column.id);
      }

      // XPCOM calls here must be keep to a minimum. Collect all of the
      // required data in one go.
      let properties = {};
      let threadLevel = {};
      let cellTexts = this.view.cellDataForColumns(
        index,
        textColumns,
        properties,
        threadLevel
      );

      // Collect the various strings and fluent IDs to build the full string for
      // the message row aria-label.
      let ariaLabelPromises = [];

      const propertiesSet = new Set(properties.value.split(" "));
      const isDummyRow = propertiesSet.has("dummy");

      this.dataset.properties = properties.value.trim();

      for (let column of threadPane.columns) {
        // Skip this column if it's hidden or it's the "select" column, since
        // the selection state is communicated via the aria-activedescendant.
        if (column.hidden || column.select) {
          continue;
        }
        let cell = this.querySelector(`.${column.id.toLowerCase()}-column`);
        let textIndex = textColumns.indexOf(column.id);

        // Special case for the subject column.
        if (column.id == "subjectCol") {
          const div = cell.querySelector(".subject-line");

          // Indent child message of this thread.
          div.style.setProperty(
            "--thread-level",
            gViewWrapper.showGroupedBySort ? 0 : threadLevel.value
          );

          let imageFluentID = this.#getMessageIndicatorString(propertiesSet);
          const image = div.querySelector("img");
          if (imageFluentID && !isDummyRow) {
            document.l10n.setAttributes(image, imageFluentID);
          } else {
            image.removeAttribute("data-l10n-id");
            image.alt = "";
          }

          const span = div.querySelector("span");
          cell.title = span.textContent = cellTexts[textIndex];
          ariaLabelPromises.push(cellTexts[textIndex]);
          continue;
        }

        if (column.id == "threadCol") {
          let buttonL10nId, labelString;
          if (propertiesSet.has("ignore")) {
            buttonL10nId = "tree-list-view-row-ignored-thread-button";
            labelString = "tree-list-view-row-ignored-thread";
          } else if (propertiesSet.has("ignoreSubthread")) {
            buttonL10nId = "tree-list-view-row-ignored-subthread-button";
            labelString = "tree-list-view-row-ignored-subthread";
          } else if (propertiesSet.has("watch")) {
            buttonL10nId = "tree-list-view-row-watched-thread-button";
            labelString = "tree-list-view-row-watched-thread";
          } else if (this.classList.contains("children")) {
            buttonL10nId = "tree-list-view-row-thread-button";
          }

          let button = cell.querySelector("button");
          if (buttonL10nId) {
            document.l10n.setAttributes(button, buttonL10nId);
          }
          if (labelString) {
            ariaLabelPromises.push(document.l10n.formatValue(labelString));
          }
          continue;
        }

        if (column.id == "flaggedCol") {
          let button = cell.querySelector("button");
          if (propertiesSet.has("flagged")) {
            document.l10n.setAttributes(button, "tree-list-view-row-flagged");
            ariaLabelPromises.push(
              document.l10n.formatValue("threadpane-flagged-cell-label")
            );
          } else {
            document.l10n.setAttributes(button, "tree-list-view-row-flag");
          }
          continue;
        }

        if (column.id == "junkStatusCol") {
          let button = cell.querySelector("button");
          if (propertiesSet.has("junk")) {
            document.l10n.setAttributes(button, "tree-list-view-row-spam");
            ariaLabelPromises.push(
              document.l10n.formatValue("threadpane-spam-cell-label")
            );
          } else {
            document.l10n.setAttributes(button, "tree-list-view-row-not-spam");
          }
          continue;
        }

        if (column.id == "unreadButtonColHeader") {
          let button = cell.querySelector("button");
          if (propertiesSet.has("read")) {
            document.l10n.setAttributes(button, "tree-list-view-row-read");
            ariaLabelPromises.push(
              document.l10n.formatValue("threadpane-read-cell-label")
            );
          } else {
            document.l10n.setAttributes(button, "tree-list-view-row-not-read");
            ariaLabelPromises.push(
              document.l10n.formatValue("threadpane-unread-cell-label")
            );
          }
          continue;
        }

        if (column.id == "attachmentCol" && propertiesSet.has("attach")) {
          ariaLabelPromises.push(
            document.l10n.formatValue("threadpane-attachments-cell-label")
          );
          continue;
        }

        if (textIndex >= 0) {
          if (isDummyRow) {
            cell.textContent = "";
            continue;
          }
          cell.textContent = cellTexts[textIndex];
          ariaLabelPromises.push(cellTexts[textIndex]);
        }
      }

      Promise.allSettled(ariaLabelPromises).then(results => {
        this.setAttribute(
          "aria-label",
          results
            .map(settledPromise => settledPromise.value ?? "")
            .filter(value => value.trim() != "")
            .join(", ")
        );
      });
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
  customElements.define("thread-row", ThreadRow, { extends: "tr" });

  class ThreadCard extends customElements.get("tree-view-table-row") {
    static ROW_HEIGHT = 46;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }

      super.connectedCallback();

      this.setAttribute("draggable", "true");

      this.appendChild(
        document
          .getElementById("threadPaneCardTemplate")
          .content.cloneNode(true)
      );

      this.senderLine = this.querySelector(".sender");
      this.subjectLine = this.querySelector(".subject");
      this.dateLine = this.querySelector(".date");
      this.starButton = this.querySelector(".button-star");
      this.tagIcon = this.querySelector(".tag-icon");
    }

    get index() {
      return super.index;
    }

    set index(index) {
      super.index = index;

      // XPCOM calls here must be keep to a minimum. Collect all of the
      // required data in one go.
      let properties = {};
      let threadLevel = {};

      let cellTexts = this.view.cellDataForColumns(
        index,
        threadPane.cardColumns,
        properties,
        threadLevel
      );

      // Collect the various strings and fluent IDs to build the full string for
      // the message row aria-label.
      let ariaLabelPromises = [];

      if (threadLevel.value) {
        properties.value += " thread-children";
      }
      const propertiesSet = new Set(properties.value.split(" "));
      this.dataset.properties = properties.value.trim();

      this.subjectLine.textContent = cellTexts[0];
      this.subjectLine.title = cellTexts[0];
      this.senderLine.textContent = cellTexts[1];
      this.dateLine.textContent = cellTexts[2];
      this.tagIcon.title = cellTexts[3];

      // Follow the layout order.
      ariaLabelPromises.push(cellTexts[1]);
      ariaLabelPromises.push(cellTexts[2]);
      ariaLabelPromises.push(cellTexts[0]);
      ariaLabelPromises.push(cellTexts[3]);

      if (propertiesSet.has("flagged")) {
        document.l10n.setAttributes(
          this.starButton,
          "tree-list-view-row-flagged"
        );
        ariaLabelPromises.push(
          document.l10n.formatValue("threadpane-flagged-cell-label")
        );
      } else {
        document.l10n.setAttributes(this.starButton, "tree-list-view-row-flag");
      }

      if (propertiesSet.has("junk")) {
        ariaLabelPromises.push(
          document.l10n.formatValue("threadpane-spam-cell-label")
        );
      }

      if (propertiesSet.has("read")) {
        ariaLabelPromises.push(
          document.l10n.formatValue("threadpane-read-cell-label")
        );
      }

      if (propertiesSet.has("unread")) {
        ariaLabelPromises.push(
          document.l10n.formatValue("threadpane-unread-cell-label")
        );
      }

      if (propertiesSet.has("attach")) {
        ariaLabelPromises.push(
          document.l10n.formatValue("threadpane-attachments-cell-label")
        );
      }

      Promise.allSettled(ariaLabelPromises).then(results => {
        this.setAttribute(
          "aria-label",
          results
            .map(settledPromise => settledPromise.value ?? "")
            .filter(value => value.trim() != "")
            .join(", ")
        );
      });
    }
  }
  customElements.define("thread-card", ThreadCard, {
    extends: "tr",
  });
});

commandController.registerCallback(
  "cmd_newFolder",
  (folder = gFolder) => folderPane.newFolder(folder),
  () => folderPaneContextMenu.getCommandState("cmd_newFolder")
);
commandController.registerCallback("cmd_newVirtualFolder", (folder = gFolder) =>
  folderPane.newVirtualFolder(undefined, undefined, folder)
);
commandController.registerCallback(
  "cmd_deleteFolder",
  (folder = gFolder) => folderPane.deleteFolder(folder),
  () => folderPaneContextMenu.getCommandState("cmd_deleteFolder")
);
commandController.registerCallback(
  "cmd_renameFolder",
  (folder = gFolder) => folderPane.renameFolder(folder),
  () => folderPaneContextMenu.getCommandState("cmd_renameFolder")
);
commandController.registerCallback(
  "cmd_compactFolder",
  (folder = gFolder) => {
    if (folder.isServer) {
      folderPane.compactAllFoldersForAccount(folder);
    } else {
      folderPane.compactFolder(folder);
    }
  },
  () => folderPaneContextMenu.getCommandState("cmd_compactFolder")
);
commandController.registerCallback(
  "cmd_emptyTrash",
  (folder = gFolder) => folderPane.emptyTrash(folder),
  () => folderPaneContextMenu.getCommandState("cmd_emptyTrash")
);
commandController.registerCallback(
  "cmd_properties",
  (folder = gFolder) => folderPane.editFolder(folder),
  () => folderPaneContextMenu.getCommandState("cmd_properties")
);
commandController.registerCallback(
  "cmd_toggleFavoriteFolder",
  (folder = gFolder) => folder.toggleFlag(Ci.nsMsgFolderFlags.Favorite),
  () => folderPaneContextMenu.getCommandState("cmd_toggleFavoriteFolder")
);

// Delete commands, which change behaviour based on the active element.
// Note that `document.activeElement` refers to the active element in *this*
// document regardless of whether this document is the active one.
commandController.registerCallback(
  "cmd_delete",
  () => {
    if (document.activeElement == folderTree) {
      commandController.doCommand("cmd_deleteFolder");
    } else if (!quickFilterBar.domNode.contains(document.activeElement)) {
      commandController.doCommand("cmd_deleteMessage");
    }
  },
  () => {
    if (document.activeElement == folderTree) {
      return commandController.isCommandEnabled("cmd_deleteFolder");
    }
    if (
      !quickFilterBar.domNode ||
      quickFilterBar.domNode.contains(document.activeElement)
    ) {
      return false;
    }
    return commandController.isCommandEnabled("cmd_deleteMessage");
  }
);
commandController.registerCallback(
  "cmd_shiftDelete",
  () => {
    commandController.doCommand("cmd_shiftDeleteMessage");
  },
  () => {
    if (
      document.activeElement == folderTree ||
      !quickFilterBar.domNode ||
      quickFilterBar.domNode.contains(document.activeElement)
    ) {
      return false;
    }
    return commandController.isCommandEnabled("cmd_shiftDeleteMessage");
  }
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
commandController.registerCallback(
  "cmd_toggleThreadPaneHeader",
  () => threadPaneHeader.toggleThreadPaneHeader(),
  () => gFolder && !gFolder.isServer
);
commandController.registerCallback(
  "cmd_toggleFolderPane",
  () => paneLayout.folderPaneSplitter.toggleCollapsed(),
  () => !!gFolder
);
commandController.registerCallback("cmd_toggleMessagePane", () => {
  paneLayout.messagePaneSplitter.toggleCollapsed();
});

commandController.registerCallback(
  "cmd_selectAll",
  () => {
    threadTree.selectAll();
    threadTree.table.body.focus();
  },
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_selectThread",
  () => gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.selectThread),
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_selectFlagged",
  () => gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.selectFlagged),
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
    threadPane.updateListRole(false);
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
      threadTree.style.scrollBehavior = "auto"; // Avoid smooth scroll.
      gViewWrapper.sort(sortType, Ci.nsMsgViewSortOrder.ascending);
      threadTree.style.scrollBehavior = null;
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
      threadPane.updateListRole(true);
      gViewWrapper.showUnthreaded = true;
    } else {
      threadPane.updateListRole(false);
      gViewWrapper.showThreaded = true;
    }
  },
  sortThreaded() {
    threadPane.updateListRole(false);
    gViewWrapper.showThreaded = true;
  },
  groupBySort() {
    threadPane.updateListRole(false);
    gViewWrapper.showGroupedBySort = true;
  },
  sortUnthreaded() {
    threadPane.updateListRole(true);
    gViewWrapper.showUnthreaded = true;
  },
  sortAscending() {
    if (gViewWrapper.showGroupedBySort && gViewWrapper.isSingleFolder) {
      if (gViewWrapper.isSortedDescending) {
        this.reverseSortThreadPane();
      }
      return;
    }

    threadTree.style.scrollBehavior = "auto"; // Avoid smooth scroll.
    gViewWrapper.sortAscending();
    threadTree.style.scrollBehavior = null;
  },
  sortDescending() {
    if (gViewWrapper.showGroupedBySort && gViewWrapper.isSingleFolder) {
      if (gViewWrapper.isSortedAscending) {
        this.reverseSortThreadPane();
      }
      return;
    }

    threadTree.style.scrollBehavior = "auto"; // Avoid smooth scroll.
    gViewWrapper.sortDescending();
    threadTree.style.scrollBehavior = null;
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
  () => !!gDBView
);
commandController.registerCallback(
  "cmd_viewThreadsWithUnread",
  () => SwitchView("cmd_viewThreadsWithUnread"),
  () => gDBView && gFolder && !(gFolder.flags & Ci.nsMsgFolderFlags.Virtual)
);
commandController.registerCallback(
  "cmd_viewWatchedThreadsWithUnread",
  () => SwitchView("cmd_viewWatchedThreadsWithUnread"),
  () => gDBView && gFolder && !(gFolder.flags & Ci.nsMsgFolderFlags.Virtual)
);
commandController.registerCallback(
  "cmd_viewUnreadMsgs",
  () => SwitchView("cmd_viewUnreadMsgs"),
  () => gDBView && gFolder && !(gFolder.flags & Ci.nsMsgFolderFlags.Virtual)
);
commandController.registerCallback(
  "cmd_viewIgnoredThreads",
  () => SwitchView("cmd_viewIgnoredThreads"),
  () => !!gDBView
);

commandController.registerCallback("cmd_goStartPage", () => {
  // This is a user-triggered command, they must want to see the page, so show
  // the message pane if it's hidden.
  paneLayout.messagePaneSplitter.expand();
  messagePane.showStartPage();
});
commandController.registerCallback(
  "cmd_print",
  async () => {
    let PrintUtils = top.PrintUtils;
    if (!webBrowser.hidden) {
      PrintUtils.startPrintWindow(webBrowser.browsingContext);
      return;
    }
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
          messageBrowser.contentWindow.getMessagePaneBrowser().browsingContext,
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
    if (!accountCentralBrowser.hidden) {
      return false;
    }
    if (!webBrowser.hidden) {
      return true;
    }
    return gDBView && gDBView.numSelected > 0;
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

commandController.registerCallback(
  "cmd_killThread",
  () => {
    threadPane.hideIgnoredMessageNotification();
    if (!gFolder.msgDatabase.isIgnored(gDBView.keyForFirstSelectedMessage)) {
      threadPane.showIgnoredMessageNotification(
        gDBView.getSelectedMsgHdrs(),
        false
      );
    }
    commandController._navigate(Ci.nsMsgNavigationType.toggleThreadKilled);
    // Invalidation should be unnecessary but the back end doesn't notify us
    // properly and resists attempts to fix this.
    threadTree.reset();
  },
  () => gDBView?.numSelected >= 1 && (gFolder || gViewWrapper.isSynthetic)
);
commandController.registerCallback(
  "cmd_killSubthread",
  () => {
    threadPane.hideIgnoredMessageNotification();
    if (!gDBView.hdrForFirstSelectedMessage.isKilled) {
      threadPane.showIgnoredMessageNotification(
        gDBView.getSelectedMsgHdrs(),
        true
      );
    }
    commandController._navigate(Ci.nsMsgNavigationType.toggleSubthreadKilled);
    // Invalidation should be unnecessary but the back end doesn't notify us
    // properly and resists attempts to fix this.
    threadTree.reset();
  },
  () => gDBView?.numSelected >= 1 && (gFolder || gViewWrapper.isSynthetic)
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

/**
 * Helper function for the zoom commands, which returns the browser that is
 * currently visible in the message pane or null if no browser is visible.
 *
 * @returns {?XULElement} - A XUL browser or null.
 */
function visibleMessagePaneBrowser() {
  if (webBrowser && !webBrowser.hidden) {
    return webBrowser;
  }

  if (messageBrowser && !messageBrowser.hidden) {
    // If the message browser is the one visible, actually return the
    // element showing the message's content, since that's the one zoom
    // commands should apply to.
    return messageBrowser.contentDocument.getElementById("messagepane");
  }

  if (multiMessageBrowser && !multiMessageBrowser.hidden) {
    return multiMessageBrowser;
  }

  return null;
}

// Zoom.
commandController.registerCallback(
  "cmd_fullZoomReduce",
  () => top.ZoomManager.reduce(visibleMessagePaneBrowser()),
  () => visibleMessagePaneBrowser() != null
);
commandController.registerCallback(
  "cmd_fullZoomEnlarge",
  () => top.ZoomManager.enlarge(visibleMessagePaneBrowser()),
  () => visibleMessagePaneBrowser() != null
);
commandController.registerCallback(
  "cmd_fullZoomReset",
  () => top.ZoomManager.reset(visibleMessagePaneBrowser()),
  () => visibleMessagePaneBrowser() != null
);
commandController.registerCallback(
  "cmd_fullZoomToggle",
  () => top.ZoomManager.toggleZoom(visibleMessagePaneBrowser()),
  () => visibleMessagePaneBrowser() != null
);

// Browser commands.
commandController.registerCallback(
  "Browser:Back",
  () => webBrowser.goBack(),
  () => webBrowser?.canGoBack
);
commandController.registerCallback(
  "Browser:Forward",
  () => webBrowser.goForward(),
  () => webBrowser?.canGoForward
);
commandController.registerCallback(
  "cmd_reload",
  () => webBrowser.reload(),
  () => !webBrowser.busy
);
commandController.registerCallback(
  "cmd_stop",
  () => webBrowser.stop(),
  () => webBrowser.busy
);

// Attachments commands.
for (let command of [
  "cmd_openAllAttachments",
  "cmd_saveAllAttachments",
  "cmd_detachAllAttachments",
  "cmd_deleteAllAttachments",
]) {
  commandController.registerCallback(
    command,
    () => messageBrowser.contentWindow.commandController.doCommand(command),
    () =>
      !messageBrowser.hidden &&
      messageBrowser.contentWindow.commandController.isCommandEnabled(command)
  );
}
