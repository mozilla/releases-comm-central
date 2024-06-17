/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozElements */

// mailCommon.js
/* globals commandController, DBViewWrapper, dbViewWrapperListener,
     nsMsgViewIndex_None, VirtualFolderHelper */
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
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  CalMetronome: "resource:///modules/CalMetronome.sys.mjs",
  FeedUtils: "resource:///modules/FeedUtils.sys.mjs",
  FolderPaneUtils: "resource:///modules/FolderPaneUtils.sys.mjs",
  FolderTreeProperties: "resource:///modules/FolderTreeProperties.sys.mjs",
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
  MailE10SUtils: "resource:///modules/MailE10SUtils.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  SmartMailboxUtils: "resource:///modules/SmartMailboxUtils.sys.mjs",
  TagUtils: "resource:///modules/TagUtils.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
  XULStoreUtils: "resource:///modules/XULStoreUtils.sys.mjs",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

const { ThreadPaneColumns } = ChromeUtils.importESModule(
  "chrome://messenger/content/ThreadPaneColumns.mjs"
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

/**
 * This is called at midnight to have messages grouped by their relative date
 * (such as today, yesterday, etc.) correctly categorized.
 */
function refreshGroupedBySortView() {
  if (gViewWrapper?.showGroupedBySort) {
    folderTree.dispatchEvent(new CustomEvent("select"));
  }
}

/**
 * Update the state of zoom related key bindings, whenever the view changes.
 */
function updateZoomCommands() {
  const commandsToUpdate = [
    "cmd_fullZoomReduce",
    "cmd_fullZoomEnlarge",
    "cmd_fullZoomReset",
    "cmd_fullZoomToggle",
  ];

  for (const command of commandsToUpdate) {
    top.goUpdateCommand(command);
  }
}

window.addEventListener("DOMContentLoaded", async event => {
  if (event.target != document) {
    return;
  }

  // Ensure all the necessary custom elements have been defined.
  await customElements.whenDefined("tree-view-table-row");
  await customElements.whenDefined("folder-tree-row");
  await customElements.whenDefined("thread-row");
  await customElements.whenDefined("thread-card");

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);

  folderTree = document.getElementById("folderTree");
  accountCentralBrowser = document.getElementById("accountCentralBrowser");

  paneLayout.init();
  folderPaneContextMenu.init();
  await folderPane.init();
  await threadPane.init();
  threadPaneHeader.init();
  await messagePane.init();

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

  CalMetronome.on("day", refreshGroupedBySortView);

  updateZoomCommands();
});

window.addEventListener("unload", () => {
  CalMetronome.off("day", refreshGroupedBySortView);
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

    for (const [splitter, properties, storeID] of [
      [this.folderPaneSplitter, ["width"], "folderPaneBox"],
      [this.messagePaneSplitter, ["height", "width"], "messagepaneboxwrapper"],
    ]) {
      for (const property of properties) {
        const value = XULStoreUtils.getValue("messenger", storeID, property);
        if (value) {
          splitter[property] = value;
        }
      }

      splitter.storeAttr = function (attrName, attrValue) {
        XULStoreUtils.setValue("messenger", storeID, attrName, attrValue);
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

  /**
   * Keep track of a context clicked folder outside of the current selection
   * range.
   *
   * @type {?nsIMsgFolder}
   */
  _overrideFolder: null,

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
   * unless the menu was opened by right-clicking on another folder, or multiple
   * folders are selected in which case we return the currently active folder.
   *
   * @type {?nsIMsgFolder}
   */
  get activeFolder() {
    return (
      this._overrideFolder ||
      gFolder ||
      MailServices.folderLookup.getFolderForURL(folderTree.selectedRow?.uri)
    );
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
   * @returns {boolean}
   */
  getCommandState(command) {
    const folder = this.activeFolder;
    if (!folder || FolderUtils.isSmartTagsFolder(folder)) {
      return false;
    }

    if (this._commandStates === null) {
      let canCompact,
        isCompactEnabled,
        canCreateSubfolders,
        canRename,
        isServer,
        isNNTP,
        isJunk,
        isVirtual,
        isInbox,
        isSpecialUse,
        canRenameDeleteJunkMail,
        isSmartTagsFolder,
        deletable,
        server,
        URI,
        flags;

      const multiSelection =
        folderTree.selection.size > 1 && !this._overrideFolder;
      if (multiSelection) {
        canCreateSubfolders = false;
        canRename = false;
        isSmartTagsFolder = false;
        isSpecialUse = true;
        isInbox = false;

        // Set some variables to TRUE to help during the folder lookup loop.
        canCompact = true;
        isServer = true;
        deletable = true;
        isNNTP = true;
        isVirtual = true;
        isCompactEnabled = true;
        isJunk = true;
        canRenameDeleteJunkMail = true;

        for (const row of folderTree.selection.values()) {
          const folder = MailServices.folderLookup.getFolderForURL(row.uri);

          // We only care if a folder doesn't support a specific property, so
          // let's update a variable only if it's still truthy.
          canCompact &&= folder.canCompact;
          isServer &&= folder.isServer;
          deletable &&= folder.deletable;
          isNNTP &&= folder.server.type == "nntp";
          isVirtual &&= folder.flags & Ci.nsMsgFolderFlags.Virtual;
          isJunk &&= folder.flags & Ci.nsMsgFolderFlags.Junk;
          canRenameDeleteJunkMail &&= FolderUtils.canRenameDeleteJunkMail(
            folder.URI
          );
          isCompactEnabled &&= folder.isCommandEnabled("cmd_compactFolder");

          // Tiny performance failsafe in case all of the variables are already
          // falsy we can break the loop early.
          if (
            !canCompact &&
            !isServer &&
            !deletable &&
            !isNNTP &&
            !isVirtual &&
            !isJunk &&
            !canRenameDeleteJunkMail &&
            !isCompactEnabled
          ) {
            break;
          }
        }
      } else {
        ({
          canCompact,
          canCreateSubfolders,
          canRename,
          deletable,
          flags,
          isServer,
          server,
          URI,
        } = folder);
        isCompactEnabled = folder.isCommandEnabled("cmd_compactFolder");
        isNNTP = server.type == "nntp";
        isJunk = flags & Ci.nsMsgFolderFlags.Junk;
        isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
        isInbox = flags & Ci.nsMsgFolderFlags.Inbox;
        isSpecialUse = flags & Ci.nsMsgFolderFlags.SpecialUse;
        canRenameDeleteJunkMail = FolderUtils.canRenameDeleteJunkMail(URI);
        isSmartTagsFolder = FolderUtils.isSmartTagsFolder(folder);
      }

      if (isNNTP && !isServer) {
        // `folderPane.deleteFolder` has a special case for this.
        deletable = true;
      }

      this._commandStates = {
        cmd_newFolder: (!isNNTP && canCreateSubfolders) || isInbox,
        cmd_deleteFolder: isJunk ? canRenameDeleteJunkMail : deletable,
        cmd_renameFolder:
          (!isServer && canRename && !isSpecialUse) ||
          isVirtual ||
          (isJunk && canRenameDeleteJunkMail),
        cmd_compactFolder:
          !isVirtual && (isServer || canCompact) && isCompactEnabled,
        cmd_emptyTrash: !isNNTP,
        cmd_properties: !multiSelection && !isServer && !isSmartTagsFolder,
        cmd_toggleFavoriteFolder:
          !multiSelection && !isServer && !isSmartTagsFolder,
      };
    }
    return this._commandStates[command];
  },

  /**
   * Update the visibility of a menuitem.
   *
   * @param {string} id - The id of the menuitem.
   * @param {boolean} show - If the item should be made visible.
   */
  _showMenuItem(id, show) {
    const item = document.getElementById(id);
    if (item) {
      item.hidden = !show;
    }
  },

  /**
   * Update the checked state of a menuitem.
   *
   * @param {string} id - The id of the menuitem.
   * @param {boolean} checked - If the item should be checked.
   */
  _checkMenuItem(id, checked) {
    const item = document.getElementById(id);
    if (item) {
      // Always convert truthy/falsy to boolean before string.
      item.setAttribute("checked", !!checked);
    }
  },

  onPopupShowing(event) {
    if (event.target != this._menupopup) {
      return;
    }

    if (!this._overrideFolder && folderTree.selection.size > 1) {
      this.updatePopupForMultiselection();
      return;
    }

    this.updatePopupForSingleSelection();
  },

  /**
   * Update the visibility of the folder pane popup menuitems based on the
   * state of enabled commands.
   */
  updatePopupCommandStates() {
    // Ask commandController about the commands it controls.
    for (const [id, command] of Object.entries(this._commands)) {
      this._showMenuItem(id, commandController.isCommandEnabled(command));
    }
  },

  /**
   * Update the fluent strings of the context menu items that can be used for
   * both single and multi selection. We pass a fake integer count to get the
   * correct string because we might be showing the context menu for the an
   * override folder that it's outside the current multiselection range, so
   * relying on the actual selection count is not accurate.
   *
   * @param {integer} count - 1 or 2 depending if single or multiselection.
   */
  updateFluentStrings(count) {
    document.l10n.setAttributes(
      document.getElementById("folderPaneContext-markMailFolderAllRead"),
      "folder-pane-context-mark-folder-read",
      { count }
    );
  },

  /**
   * Update the folder pane popup to show only the available actions supported
   * during a single folder selection state.
   */
  updatePopupForSingleSelection() {
    this.updatePopupCommandStates();
    this.updateFluentStrings(1);

    const folder = this.activeFolder;
    const { canCreateSubfolders, flags, isServer, isSpecialFolder, server } =
      folder;
    const isJunk = flags & Ci.nsMsgFolderFlags.Junk;
    const isTrash = isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true);
    const isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
    const isRealFolder = !isServer && !isVirtual;
    const isSmartVirtualFolder = FolderUtils.isSmartVirtualFolder(folder);
    const isSmartTagsFolder = FolderUtils.isSmartTagsFolder(folder);
    const serverType = server.type;

    this._showMenuItem(
      "folderPaneContext-getMessages",
      (isServer && serverType != "none") ||
        (["nntp", "rss"].includes(serverType) && !isTrash && !isVirtual)
    );
    const showPauseAll = isServer && FeedUtils.isFeedFolder(folder);
    this._showMenuItem("folderPaneContext-pauseAllUpdates", showPauseAll);
    if (showPauseAll) {
      const optionsAcct = FeedUtils.getOptionsAcct(server);
      this._checkMenuItem(
        "folderPaneContext-pauseAllUpdates",
        !optionsAcct.doBiff
      );
    }
    const showPaused = !isServer && FeedUtils.getFeedUrlsInFolder(folder);
    this._showMenuItem("folderPaneContext-pauseUpdates", showPaused);
    if (showPaused) {
      const properties = FeedUtils.getFolderProperties(folder);
      this._checkMenuItem(
        "folderPaneContext-pauseUpdates",
        properties.includes("isPaused")
      );
    }

    this._showMenuItem("folderPaneContext-searchMessages", !isVirtual);
    if (isVirtual) {
      this._showMenuItem("folderPaneContext-subscribe", false);
    } else if (serverType == "rss" && !isTrash) {
      this._showMenuItem("folderPaneContext-subscribe", true);
    } else {
      this._showMenuItem(
        "folderPaneContext-subscribe",
        isServer && ["imap", "nntp"].includes(serverType)
      );
    }
    this._showMenuItem(
      "folderPaneContext-newsUnsubscribe",
      isRealFolder && serverType == "nntp"
    );

    const showNewFolderItem =
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

    this._showMenuItem(
      "folderPaneContext-markMailFolderAllRead",
      !isServer && !isSmartTagsFolder && serverType != "nntp"
    );
    this._showMenuItem(
      "folderPaneContext-markNewsgroupAllRead",
      isRealFolder && serverType == "nntp"
    );
    this._showMenuItem(
      "folderPaneContext-emptyTrash",
      isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true)
    );
    this._showMenuItem("folderPaneContext-emptyJunk", isJunk);
    this._showMenuItem(
      "folderPaneContext-sendUnsentMessages",
      flags & Ci.nsMsgFolderFlags.Queue
    );

    this._checkMenuItem(
      "folderPaneContext-favoriteFolder",
      flags & Ci.nsMsgFolderFlags.Favorite
    );
    this._showMenuItem("folderPaneContext-markAllFoldersRead", isServer);

    this._showMenuItem("folderPaneContext-settings", isServer);
    this._showMenuItem("folderPaneContext-filters", isServer);

    this._showMenuItem("folderPaneContext-manageTags", isSmartTagsFolder);

    // If source folder is virtual, allow only "move" within its own server.
    // Don't show "copy" and "again" and don't show "recent" and "favorite".
    // Also, check if this is a top-level smart folder, e.g., virtual "Inbox"
    // in unified folder view or a Tags folder. If so, don't show "move".
    const movePopup = document.getElementById("folderContext-movePopup");
    if (isVirtual) {
      this._showMenuItem("folderPaneContext-copyMenu", false);
      let showMove = true;
      if (isSmartVirtualFolder || isSmartTagsFolder) {
        showMove = false;
      }
      this._showMenuItem("folderPaneContext-moveMenu", showMove);
      if (showMove) {
        const rootURI = MailUtils.getOrCreateFolder(
          this.activeFolder.rootFolder.URI
        );
        movePopup.parentFolder = rootURI;
      }
    } else {
      // Non-virtual. Don't allow move or copy of special use or root folder.
      const okToMoveCopy =
        !isServer &&
        !(flags & Ci.nsMsgFolderFlags.SpecialUse) &&
        serverType != "nntp";
      if (okToMoveCopy) {
        // Set the move menu to show all accounts.
        movePopup.parentFolder = null;
      }
      this._showMenuItem("folderPaneContext-moveMenu", okToMoveCopy);
      this._showMenuItem("folderPaneContext-copyMenu", okToMoveCopy);
    }

    this._refreshMenuSeparator();
  },

  /**
   * Update the folder pane popup to show only the available actions supported
   * during a multiselection state.
   */
  updatePopupForMultiselection() {
    // Hide all menuitems to start from a clean state, except the separators.
    for (const menuitem of this._menupopup.children) {
      if (menuitem.localName == "menuseparator") {
        continue;
      }
      menuitem.hidden = true;
    }

    // Update the command states after we've hidden all the menuitems so we can
    // show only those that are active.
    this.updatePopupCommandStates();
    this.updateFluentStrings(folderTree.selection.size);

    // Hide anything we know for sure we don't need in multiselection.
    this._showMenuItem("folderPaneContext-getMessages", false);
    this._showMenuItem("folderPaneContext-pauseAllUpdates", false);
    this._showMenuItem("folderPaneContext-pauseUpdates", false);
    this._showMenuItem("folderPaneContext-searchMessages", false);
    this._showMenuItem("folderPaneContext-subscribe", false);
    this._showMenuItem("folderPaneContext-newsUnsubscribe", false);
    this._showMenuItem("folderPaneContext-markNewsgroupAllRead", false);
    this._showMenuItem("folderPaneContext-emptyTrash", false);
    this._showMenuItem("folderPaneContext-emptyJunk", false);
    this._showMenuItem("folderPaneContext-sendUnsentMessages", false);
    this._showMenuItem("folderPaneContext-markAllFoldersRead", false);
    this._showMenuItem("folderPaneContext-settings", false);
    this._showMenuItem("folderPaneContext-filters", false);
    this._showMenuItem("folderPaneContext-manageTags", false);

    // Show only the standard commands that don't require special conditions.
    this._showMenuItem("folderPaneContext-openNewTab", true);
    this._showMenuItem("folderPaneContext-openNewWindow", true);
    this._showMenuItem("folderPaneContext-markMailFolderAllRead", true);

    const hasSpecial = [...folderTree.selection.values()].some(row => {
      const folder = MailServices.folderLookup.getFolderForURL(row.uri);
      return (
        folder.isServer ||
        folder.isVirtual ||
        folder.noSelect ||
        folder.flags & Ci.nsMsgFolderFlags.Junk ||
        folder.flags & Ci.nsMsgFolderFlags.Virtual ||
        folder.flags & Ci.nsMsgFolderFlags.SpecialUse ||
        folder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true) ||
        FolderUtils.isSmartVirtualFolder(folder) ||
        FolderUtils.isSmartTagsFolder(folder) ||
        folder.server.type == "nntp"
      );
    });

    // Show the move and copy items only if we don't have any special folder in
    // the selection range.
    this._showMenuItem("folderPaneContext-moveMenu", !hasSpecial);
    this._showMenuItem("folderPaneContext-copyMenu", !hasSpecial);

    this._refreshMenuSeparator();
  },

  /**
   * Ensure that we don't leave an orphan menuseparator in the folder context
   * menu after all the items have been updated.
   */
  _refreshMenuSeparator() {
    let lastItem;
    for (const child of this._menupopup.children) {
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
    const activeFolder = this.activeFolder;
    const selectedRows = [...folderTree.selection.values()];

    // If the currently active folder is not part of the current selection,
    // trigger the command only for that folder.
    if (!selectedRows.some(s => s.uri == activeFolder.URI)) {
      this.triggerCommand(event, activeFolder);
      return;
    }

    // Loop through all currently selected folders and trigger the command for
    // each one of those.
    for (const row of selectedRows) {
      this.triggerCommand(
        event,
        MailServices.folderLookup.getFolderForURL(row.uri)
      );
    }
  },

  /**
   * Trigger the selected command from the context menu.
   *
   * @param {DOMEvent} event
   * @param {nsIMsgFolder} folder
   */
  triggerCommand(event, folder) {
    // If commandController handles this command, ask it to do so.
    if (event.target.id in this._commands) {
      commandController.doCommand(this._commands[event.target.id], folder);
      return;
    }

    const topChromeWindow = window.browsingContext.topChromeWindow;
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
        if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
          topChromeWindow.MsgMarkAllRead(
            VirtualFolderHelper.wrapVirtualFolder(folder).searchFolders
          );
        } else {
          topChromeWindow.MsgMarkAllRead([folder]);
        }
        break;
      case "folderPaneContext-emptyTrash":
        folderPane.emptyTrash(folder);
        break;
      case "folderPaneContext-emptyJunk":
        folderPane.emptyJunk(folder);
        break;
      case "folderPaneContext-sendUnsentMessages":
        goDoCommand("cmd_sendUnsentMsgs");
        break;
      case "folderPaneContext-markAllFoldersRead":
        topChromeWindow.MsgMarkAllFoldersRead([folder]);
        break;
      case "folderPaneContext-settings":
        folderPane.editFolder(folder);
        break;
      case "folderPaneContext-filters":
        topChromeWindow.MsgFilters(undefined, folder);
        break;
      case "folderPaneContext-manageTags":
        goDoCommand("cmd_manageTags");
        break;
      default: {
        // Handle folder context menu items move to, copy to.
        let isMove = !!event.target.closest("#folderPaneContext-moveMenu");
        const isCopy = !!event.target.closest("#folderPaneContext-copyMenu");

        if (!isMove && !isCopy) {
          return;
        }

        const targetFolder = event.target._folder;
        isMove = this.transferFolder(isMove, folder, targetFolder);
        // Save in prefs the target folder URI and if this was a move or copy.
        // This is to fill in the next folder or message context menu item
        // "Move|Copy to <TargetFolderName> Again".
        Services.prefs.setStringPref(
          "mail.last_msg_movecopy_target_uri",
          targetFolder.URI
        );
        Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
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
        const serverRow = folderPane._createServerRow(this.name, server);
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

        const parentRow = folderPane.getRowForFolder(parentFolder, this.name);
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
        const childRow = folderPane._createFolderRow(this.name, childFolder);
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

      _folderTypes: SmartMailboxUtils.getFolderTypes(),

      init() {
        this._smartMailbox = SmartMailboxUtils.getSmartMailbox();

        // Add folders to the UI.
        for (const folderType of this._folderTypes) {
          const folder = this._smartMailbox.getSmartFolder(folderType.name);
          if (!folder) {
            // SmartMailboxUtils.SmartMailbox() failed to create the child folder
            // and printed an error message to the console. No need for additional
            // error handling here.
            continue;
          }

          const row = folderPane._createFolderRow(this.name, folder);
          this.containerList.appendChild(row);
          folderType.folderURI = folder.URI;
          folderType.list = row.childList;

          // Display the searched folders for this type.
          const wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
          for (const searchFolder of wrappedFolder.searchFolders) {
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

      regenerateMode() {
        if (this._smartServer) {
          SmartMailboxUtils.removeAll(true);
        }
        this.init();
      },

      _addSearchedFolder(folderType, parentFolder, childFolder) {
        if (folderType.flag & childFolder.flags) {
          // The folder has the flag for this type.
          const folderRow = folderPane._createFolderRow(
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
        const folderType = this._folderTypes.find(
          ft => ft.folderURI == smartFolder.URI
        );
        if (!folderType) {
          // This virtual folder isn't one of the smart folders. It's probably
          // one of the tags virtual folders.
          return;
        }

        const wrappedFolder =
          VirtualFolderHelper.wrapVirtualFolder(smartFolder);
        const smartFolderRow = folderPane.getRowForFolder(
          smartFolder,
          this.name
        );
        const searchFolderURIs = wrappedFolder.searchFolders.map(sf => sf.URI);
        const serversToCheck = new Set();

        // Remove any rows which may belong to folders that aren't searched.
        for (const row of [...smartFolderRow.querySelectorAll("li")]) {
          if (!searchFolderURIs.includes(row.uri)) {
            row.remove();
            const folder = MailServices.folderLookup.getFolderForURL(row.uri);
            if (folder) {
              serversToCheck.add(folder.server);
            }
          }
        }

        // Add missing rows for folders that are searched.
        const existingRowURIs = Array.from(
          smartFolderRow.querySelectorAll("li"),
          row => row.uri
        );
        for (const searchFolder of wrappedFolder.searchFolders) {
          if (
            searchFolder == smartFolder ||
            existingRowURIs.includes(searchFolder.URI)
          ) {
            continue;
          }
          const existingRow = folderPane.getRowForFolder(
            searchFolder,
            this.name
          );
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
        for (const server of serversToCheck) {
          this.initServer(server);
        }
      },

      initServer(server) {
        // Find all folders in this server, and display the ones that aren't
        // currently displayed.
        const descendants = new Map(
          server.rootFolder.descendants.map(d => [d.URI, d])
        );
        if (!descendants.size) {
          return;
        }
        const remainingFolderURIs = Array.from(descendants.keys());

        // Get a list of folders that already exist in the folder tree.
        const existingRows = this.containerList.getElementsByTagName("li");
        let existingURIs = Array.from(existingRows, li => li.uri);
        do {
          const folderURI = remainingFolderURIs.shift();
          if (existingURIs.includes(folderURI)) {
            continue;
          }
          const folder = descendants.get(folderURI);
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

        const folderType = this._folderTypes.find(ft =>
          childFolder.isSpecialFolder(ft.flag, true)
        );
        if (folderType) {
          const virtualFolder = VirtualFolderHelper.wrapVirtualFolder(
            MailServices.folderLookup.getFolderForURL(folderType.folderURI)
          );
          const searchFolders = virtualFolder.searchFolders;
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
            const folderRow = folderPane._createFolderRow(
              this.name,
              childFolder
            );
            serverRow.insertChildInOrder(folderRow);
            folderPane._addSubFolders(childFolder, folderRow, this.name);
            return;
          }
        }

        // Nothing special about this folder. Add it to the end of the list.
        const folderRow = folderPane._addFolderAndAncestors(
          this.containerList,
          childFolder,
          this.name
        );
        folderPane._addSubFolders(childFolder, folderRow, this.name);
      },

      removeFolder(parentFolder, childFolder) {
        const childRow = folderPane.getRowForFolder(childFolder, this.name);
        if (!childRow) {
          return;
        }
        const parentRow = childRow.parentNode.closest("li");
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
        for (const smartFolderRow of this.containerList.children) {
          if (
            smartFolderRow.dataset.serverKey == this._smartMailbox.server.key
          ) {
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
          const folder = subFolders[i];
          if (folderPane._isGmailFolder(folder)) {
            subFolders.splice(i, 1, ...folder.subFolders);
          }
        }

        subFolders.sort((a, b) => a.compareSortKeys(b));

        for (const folder of subFolders) {
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
          const folderRow = folderPane._createFolderRow(
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
        for (const row of [...this.containerList.querySelectorAll("li")]) {
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
        for (const subFolder of folder.getFoldersWithFlags(
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
        for (const row of [...this.containerList.querySelectorAll("li")]) {
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
        const folders = FolderUtils.getMostRecentFolders(
          MailServices.accounts.allFolders,
          Services.prefs.getIntPref("mail.folder_widget.max_recent"),
          "MRUTime"
        );
        for (const folder of folders) {
          const folderRow = folderPane._createFolderRow(
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
        this._smartMailbox = SmartMailboxUtils.getSmartMailbox();

        for (const tag of MailServices.tags.getAllTags()) {
          try {
            const folder = this._smartMailbox.getTagFolder(tag);
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
       * Update the UI to match changes in a tag. If the tag is no longer
       * valid (i.e. it's been deleted) the row representing it will be
       * removed. If the tag is new, a row for it will be created.
       *
       * @param {string} prefName - The full name of the preference that
       *   changed causing this code to run.
       */
      changeTagFromPrefChange(prefName) {
        const [, , key] = prefName.split(".");
        if (!MailServices.tags.isValidKey(key)) {
          const uri = this._smartMailbox.getTagFolderUriForKey(key);
          folderPane.getRowForFolder(uri)?.remove();
          return;
        }

        const tag = MailServices.tags.getAllTags().find(t => t.key == key);
        const folder = this._smartMailbox.getTagFolder(tag);
        const row = folderPane.getRowForFolder(folder);
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

    this._isCompact = XULStoreUtils.isItemCompact("messenger", "folderTree");
    let activeModes = XULStoreUtils.getValue("messenger", "folderTree", "mode");
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
    Services.obs.addObserver(this, "server-color-changed");
    Services.obs.addObserver(this, "server-color-preview");
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
      XULStoreUtils.isItemHidden("messenger", "folderPaneHeaderBar");
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
    folderPaneGetMessages.hidden = XULStoreUtils.isItemHidden(
      "messenger",
      "folderPaneGetMessages"
    );
    document.getElementById("folderPaneWriteMessage").hidden =
      XULStoreUtils.isItemHidden("messenger", "folderPaneWriteMessage");
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
    Services.obs.removeObserver(this, "server-color-changed");
    Services.obs.removeObserver(this, "server-color-preview");
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
          if (subject.server == this._modes.smart._smartMailbox.server) {
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
      case "server-color-changed":
      case "server-color-preview":
        this._changeServerRow(subject, row => row.setIconColor(data));
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
    this._hideLocalFolders = XULStoreUtils.isItemHidden(
      "messenger",
      "folderPaneLocalFolders"
    );
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
    for (const mode of Object.values(this._modes)) {
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
    const currentModes = this.activeModes;
    const mode = event.target.getAttribute("value");
    const index = this.activeModes.indexOf(mode);

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
    const subMenuCompactBtn = document.querySelector(
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
    for (const item of document.querySelectorAll(".folder-pane-mode")) {
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

    const compactMenuItem = this.folderPaneModeContext.querySelector(
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
  moveFolderModeUp() {
    const currentModes = this.activeModes;
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
  moveFolderModeDown() {
    const currentModes = this.activeModes;
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
    for (const name of Object.keys(this._modes)) {
      this._toggleMode(name, modes.includes(name));
    }
    for (const name of modes) {
      const { container, containerHeader } = this._modes[name];
      containerHeader.hidden = modes.length == 1;
      folderTree.appendChild(container);
    }
    XULStoreUtils.setValue(
      "messenger",
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
    for (const mode of Object.values(this._modes)) {
      if (!mode.active || !mode.canBeCompact) {
        continue;
      }

      mode.containerList.replaceChildren();
      this._initMode(mode);
    }
    XULStoreUtils.setValue("messenger", "folderTree", "compact", value);
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
    const mode = this._modes[modeName];
    if (mode.active == active) {
      return;
    }

    if (!active) {
      mode.container.remove();
      delete mode.container;
      mode.active = false;
      return;
    }

    const container =
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
      try {
        mode.init();
      } catch (e) {
        console.warn(`Error intiating ${mode.name} mode.`, e);
        if (typeof mode.regenerateMode != "function") {
          return;
        }
        mode.containerList.replaceChildren();
        mode.regenerateMode();
      }
    }
    if (typeof mode.initServer != "function") {
      return;
    }

    // `.accounts` is used here because it is ordered, `.allServers` isn't.
    for (const account of MailServices.accounts.accounts) {
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
    const row = document.createElement("li", { is: "folder-tree-row" });
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
    const row = document.createElement("li", { is: "folder-tree-row" });
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
    const row = document.createElement("li", { is: "folder-tree-row" });
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
    const serverKeys = MailServices.accounts.accounts.map(
      a => a.incomingServer.key
    );
    const index = serverKeys.indexOf(serverRow.dataset.serverKey);
    for (const row of list.children) {
      const i = serverKeys.indexOf(row.dataset.serverKey);

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

      if (FolderPaneUtils.nameCollator.compare(row.name, serverRow.name) > 0) {
        return list.insertBefore(serverRow, row);
      }
    }
    return list.appendChild(serverRow);
  },

  _reapplyServerOrder(list) {
    const selected = list.querySelector("li.selected");
    const serverKeys = MailServices.accounts.accounts.map(
      a => a.incomingServer.key
    );
    const serverRows = [...list.children];
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
      const serverRow = folderPane._createServerRow(modeName, folder.server);
      this._insertInServerOrder(containerList, serverRow);
      return serverRow;
    }

    const parentRow = this._addFolderAndAncestors(
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
    const folderRow = folderPane.getRowForFolder(folder, modeName);
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
    const parentFolder = folderPane._getNonGmailParent(folder);
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
      const folder = subFolders[i];
      if (this._isGmailFolder(folder)) {
        subFolders.splice(i, 1, ...folder.subFolders);
      }
    }

    subFolders.sort((a, b) => a.compareSortKeys(b));

    for (const folder of subFolders) {
      if (typeof filterFunction == "function" && !filterFunction(folder)) {
        continue;
      }
      const folderRow = folderPane._createFolderRow(modeName, folder);
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

    const modeNames = modeName ? [modeName] : this.activeModes;
    for (const name of modeNames) {
      const id = FolderPaneUtils.makeRowID(name, folderOrURI);
      // Look in the mode's container. The container may or may not be
      // attached to the document at this point.
      const row = this._modes[name].containerList.querySelector(
        `#${CSS.escape(id)}`
      );
      if (row) {
        return row;
      }
    }

    return null;
  },

  /**
   * Get the first row inside a specifc mode, even if it is hidden.
   *
   * @param {string} modeName
   * @returns {FolderTreeRow}
   */
  getFirstRowForMode(modeName) {
    // Look in the mode's container. The container may or may not be
    // attached to the document at this point.
    return this._modes[modeName].containerList.querySelector("li");
  },

  /**
   * Loop through all currently active modes and call the required function if
   * it exists.
   *
   * @param {string} functionName - The name of the function to call.
   * @param  {...any} args - The list of arguments to pass to the function.
   */
  _forAllActiveModes(functionName, ...args) {
    for (const mode of Object.values(this._modes)) {
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
    for (const row of folderTree.querySelectorAll("li")) {
      if (row.uri == folderOrURI) {
        callback(row);
      }
    }
  },
  /**
   * Perform a function on all rows representing a server.
   *
   * @param {nsIMsgAccount} account - The account that changed.
   * @param {folderRowChangeCallback} callback
   */
  _changeServerRow(account, callback) {
    for (const row of folderTree.querySelectorAll(
      `li[data-server-type][data-server-key="${account.incomingServer.key}"]`
    )) {
      callback(row);
    }
  },

  /**
   * Called when a folder's new messages state changes.
   *
   * @param {nsIMsgFolder} folder
   * @param {boolean} hasNewMessages
   */
  changeNewMessages(folder, hasNewMessages) {
    this._changeRows(folder, row => {
      // Find the nearest visible ancestor and update it.
      let collapsedAncestor = row.parentElement?.closest("li.collapsed");
      while (collapsedAncestor) {
        const next = collapsedAncestor.parentElement?.closest("li.collapsed");
        if (!next) {
          collapsedAncestor.updateNewMessages(hasNewMessages);
          break;
        }
        collapsedAncestor = next;
      }

      // Update the row itself.
      row.updateNewMessages(hasNewMessages);
    });
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
      let collapsedAncestor = row.parentElement?.closest("li.collapsed");
      while (collapsedAncestor) {
        const next = collapsedAncestor.parentElement?.closest("li.collapsed");
        if (!next) {
          collapsedAncestor.updateUnreadMessageCount();
          break;
        }
        collapsedAncestor = next;
      }

      // Update the row itself.
      row.updateUnreadMessageCount();
    });

    if (this._modes.unread.active && !folder.server.hidden) {
      this._modes.unread.changeUnreadCount(folder, newValue);
    }
  },

  /**
   * Called when a folder's total count changes, to update the UI.
   *
   * @param {nsIMsgFolder} folder
   * @param {integer} newValue
   */
  changeTotalCount(folder) {
    this._changeRows(folder, row => {
      // Find the nearest visible ancestor and update it.
      let collapsedAncestor = row.parentElement?.closest("li.collapsed");
      while (collapsedAncestor) {
        const next = collapsedAncestor.parentElement?.closest("li.collapsed");
        if (!next) {
          collapsedAncestor.updateTotalMessageCount();
          break;
        }
        collapsedAncestor = next;
      }

      // Update the row itself.
      row.updateTotalMessageCount();
    });
  },

  /**
   * Called when a server's `prettyName` changes, to update the UI.
   *
   * @param {nsIMsgFolder} folder
   * @param {string} name
   */
  changeServerName(folder, name) {
    for (const row of folderTree.querySelectorAll(
      `li[data-server-key="${folder.server.key}"]`
    )) {
      row.setServerName(name);
    }
  },

  /**
   * Update the UI widget to reflect the real folder size when the "FolderSize"
   * property changes.
   *
   * @param {nsIMsgFolder} folder
   */
  changeFolderSize(folder) {
    if (XULStoreUtils.isItemVisible("messenger", "folderPaneFolderSize")) {
      this._changeRows(folder, row => row.updateSizeCount(false, folder));
    }
  },

  _onSelect() {
    const isSynthetic = gViewWrapper?.isSynthetic;
    threadPane.saveSelection();
    threadPane.hideIgnoredMessageNotification();
    if (!isSynthetic) {
      // Don't clear the message pane for synthetic views, as a message may have
      // already been selected in restoreState().
      messagePane.clearAll();
    }

    const uri = folderTree.selectedRow?.uri;
    if (!uri) {
      gFolder = null;
      return;
    }

    const pageTitle = document.getElementById("about3PaneTitle");
    // Handle multiselection by preventing any message interaction.
    if (folderTree.selection.size > 1) {
      // Only update the title and icon for multiselection once if the previous
      // state was single selection.
      if (!pageTitle.hasAttribute("data-l10n-id")) {
        document.title = "";
        document.l10n.setAttributes(
          document.getElementById("about3PaneTitle"),
          "message-list-placeholder-multiple-folders"
        );
        document.head.querySelector(`link[rel="icon"]`).href =
          FolderUtils.getFolderIcon();
      }

      gViewWrapper?.close();
      messagePane.hideCurrentFindBar();
      gFolder = gDBView = gViewWrapper = threadTree.view = null;
      threadPaneHeader.onFolderSelected();
      this._updateStatusQuota();
      window.dispatchEvent(
        new CustomEvent("folderURIChanged", { bubbles: true })
      );
      return;
    }

    pageTitle.removeAttribute("data-l10n-id");
    gFolder = MailServices.folderLookup.getFolderForURL(uri);

    // Bail out if this is synthetic view, such as a gloda search.
    if (isSynthetic) {
      return;
    }

    document.head.querySelector(`link[rel="icon"]`).href =
      FolderUtils.getFolderIcon(gFolder);

    // Clean up any existing view wrapper. This will invalidate the thread tree.
    gViewWrapper?.close();

    // Hide any currently visible findbar.
    messagePane.hideCurrentFindBar();

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

    const tabListener = () => {
      // Hide the pane if the new tab ain't us.
      quotaPanel.hidden =
        top.window.document.getElementById("tabmail").currentAbout3Pane ==
        this.window;
    };
    const unloadListener = () => {
      top.window.document.removeEventListener("TabSelect", tabListener);
      window.removeEventListener("unload", unloadListener);
    };
    unloadListener();

    // For display on main window panel only include quota names containing
    // "STORAGE" or "MESSAGE". This will exclude unusual quota names containing
    // items like "MAILBOX" and "LEVEL" from the panel bargraph. All quota names
    // will still appear on the folder properties quota window.
    // Note: Quota name is typically something like "User Quota / STORAGE".
    const folderQuota = gFolder
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
    const quotaUsagePercentage = q =>
      Number((100n * BigInt(q.usage)) / BigInt(q.limit));
    const highest = folderQuota.reduce((acc, current) =>
      quotaUsagePercentage(acc) > quotaUsagePercentage(current) ? acc : current
    );
    const percent = quotaUsagePercentage(highest);
    if (
      percent <
      Services.prefs.getIntPref("mail.quota.mainwindow_threshold.show")
    ) {
      quotaPanel.hidden = true;
    } else {
      quotaPanel.hidden = false;
      top.window.document.addEventListener("TabSelect", tabListener);
      window.addEventListener("unload", unloadListener);

      top.window.document
        .getElementById("quotaMeter")
        .setAttribute("value", percent);

      let usage;
      let limit;
      if (/STORAGE/i.test(highest.name)) {
        const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
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

    const popup = document.getElementById("folderPaneContext");

    if (event.button == 2) {
      // Mouse
      if (event.target.closest(".mode-container")) {
        return;
      }
      const row = event.target.closest("li");
      if (!row) {
        return;
      }

      if (![...folderTree.selection.values()].some(s => s.uri == row.uri)) {
        // The right-clicked-on folder is not part of the currently selected
        // list of folders. Tell the context menu to use it instead. This
        // override lasts until the context menu fires a "popuphidden" event.
        folderPaneContextMenu.setOverrideFolder(
          MailServices.folderLookup.getFolderForURL(row.uri)
        );
        row.classList.add("context-menu-target");
      }
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
    } else {
      // Keyboard
      popup.openPopup(folderTree.selectedRow, "after_end", 0, 0, true);
    }

    event.preventDefault();
  },

  _onCollapsed({ target }) {
    if (target.uri) {
      const mode = target.closest("[data-mode]").dataset.mode;
      FolderTreeProperties.setIsExpanded(target.uri, mode, false);
    }
    target.updateUnreadMessageCount();
    target.updateTotalMessageCount();
    target.updateNewMessages();
  },

  _onExpanded({ target }) {
    if (target.uri) {
      const mode = target.closest("[data-mode]").dataset.mode;
      FolderTreeProperties.setIsExpanded(target.uri, mode, true);
    }

    const updateRecursively = row => {
      row.updateUnreadMessageCount();
      row.updateTotalMessageCount();
      row.updateNewMessages();
      if (row.classList.contains("collapsed")) {
        return;
      }
      for (const child of row.childList.children) {
        updateRecursively(child);
      }
    };

    updateRecursively(target);

    // Get server type. IMAP is the only server type that does folder discovery.
    const folder = MailServices.folderLookup.getFolderForURL(target.uri);
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
    const row = event.target.closest(`li[is="folder-tree-row"]`);
    if (!row) {
      event.preventDefault();
      return;
    }

    // If the currently dragged row is not part of the selection map, use it
    // instead of the current selection entries.
    const rows = folderTree.selection.has(folderTree.rows.indexOf(row))
      ? folderTree.selection.values()
      : [row];

    const folders = [];
    let hasServer = false;
    let hasNNTP = false;
    let hasSimpleFolder = false;
    for (const row of rows) {
      const folder = MailServices.folderLookup.getFolderForURL(row.uri);
      folders.push(folder);

      if (folder.isServer) {
        hasServer = true;
        break;
      }

      if (folder.server.type == "nntp") {
        hasNNTP = true;
        continue;
      }

      hasSimpleFolder = true;
    }

    // We don't allow dragging server rows, or mixing folder types.
    if (hasServer || (hasNNTP && hasSimpleFolder)) {
      event.preventDefault();
      return;
    }

    for (const [index, folder] of folders.entries()) {
      event.dataTransfer.mozSetDataAt(
        folder.server.type == "nntp"
          ? "text/x-moz-newsfolder"
          : "text/x-moz-folder",
        folder,
        index
      );
    }
    event.dataTransfer.effectAllowed = hasNNTP ? "move" : "copyMove";
  },

  _onDragOver(event) {
    const copyKey =
      AppConstants.platform == "macosx" ? event.altKey : event.ctrlKey;

    event.dataTransfer.dropEffect = "none";
    event.preventDefault();

    const row = event.target.closest("li");
    this._timedExpand(row);
    if (!row) {
      return;
    }

    const targetFolder = MailServices.folderLookup.getFolderForURL(row.uri);
    if (!targetFolder) {
      return;
    }

    const types = Array.from(event.dataTransfer.mozTypesAt(0));
    if (types.includes("text/x-moz-message")) {
      if (targetFolder.isServer || !targetFolder.canFileMessages) {
        return;
      }
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const msgHdr = top.messenger.msgHdrFromURI(
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

      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const sourceFolder = event.dataTransfer
          .mozGetDataAt("text/x-moz-folder", i)
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
      }
      event.dataTransfer.dropEffect = copyKey ? "copy" : "move";
    } else if (types.includes("application/x-moz-file")) {
      if (targetFolder.isServer || !targetFolder.canFileMessages) {
        return;
      }
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const extFile = event.dataTransfer
          .mozGetDataAt("application/x-moz-file", i)
          .QueryInterface(Ci.nsIFile);
        if (!extFile.isFile() || !/\.eml$/i.test(extFile.leafName)) {
          return;
        }
      }
      event.dataTransfer.dropEffect = "copy";
    } else if (types.includes("text/x-moz-newsfolder")) {
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const folder = event.dataTransfer
          .mozGetDataAt("text/x-moz-newsfolder", i)
          .QueryInterface(Ci.nsIMsgFolder);
        if (
          targetFolder.isServer ||
          targetFolder.server.type != "nntp" ||
          folder == targetFolder ||
          folder.server != targetFolder.server
        ) {
          return;
        }
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
   * Set a timer to expand `row` in 1000ms. If called again before the timer
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
      delete this._expandRow;
      delete this._expandTimer;
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
    }, 1000);
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

    const row = event.target.closest("li");
    if (!row) {
      return;
    }

    const targetFolder = MailServices.folderLookup.getFolderForURL(row.uri);

    const types = Array.from(event.dataTransfer.mozTypesAt(0));
    if (types.includes("text/x-moz-message")) {
      const array = [];
      let sourceFolder;
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const msgHdr = top.messenger.msgHdrFromURI(
          event.dataTransfer.mozGetDataAt("text/x-moz-message", i)
        );
        if (!i) {
          sourceFolder = msgHdr.folder;
        }
        array.push(msgHdr);
      }
      let isMove = event.dataTransfer.dropEffect == "move";
      const isNews = sourceFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
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
      let isMove = event.dataTransfer.dropEffect == "move";
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const sourceFolder = event.dataTransfer
          .mozGetDataAt("text/x-moz-folder", i)
          .QueryInterface(Ci.nsIMsgFolder);

        isMove = folderPaneContextMenu.transferFolder(
          isMove,
          sourceFolder,
          targetFolder
        );
      }
      // Save in prefs the target folder URI and if this was a move or copy.
      // This is to fill in the next folder or message context menu item
      // "Move|Copy to <TargetFolderName> Again".
      Services.prefs.setStringPref(
        "mail.last_msg_movecopy_target_uri",
        targetFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);

      // FIXME! Bug 1896531.
      if (event.dataTransfer.mozItemCount > 1) {
        console.warn(
          "Bug 1896531. Copy and move for multiselection is only partially supported and it might fail."
        );
      }
    } else if (types.includes("application/x-moz-file")) {
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const extFile = event.dataTransfer
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
      const rows = [];
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const folder = event.dataTransfer
          .mozGetDataAt("text/x-moz-newsfolder", i)
          .QueryInterface(Ci.nsIMsgFolder);

        const newsRoot = targetFolder.rootFolder.QueryInterface(
          Ci.nsIMsgNewsFolder
        );
        newsRoot.reorderGroup(folder, targetFolder);
        const mode = row.closest("li[data-mode]").dataset.mode;
        rows.push(this.getRowForFolder(folder, mode));
      }
      setTimeout(() => {
        folderTree.swapSelection(rows);
      });
    } else if (
      types.includes("text/x-moz-url-data") ||
      types.includes("text/x-moz-url")
    ) {
      // This is a potential rss feed. A link image as well as link text url
      // should be handled; try to extract a url from non moz apps as well.
      const feedURI = FeedUtils.getFeedUriFromDataTransfer(event.dataTransfer);
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
      const rootMsgFolder = folder.server.rootMsgFolder;
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
    const title = messengerBundle.GetStringFromName("folderProperties");

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
      try {
        const isIMAP = folder.server.type == "imap";
        let transferInfo = null;
        if (isIMAP) {
          transferInfo = folder.dBTransferInfo;
        }
        folder.closeAndBackupFolderDB("");
        if (isIMAP && transferInfo) {
          folder.dBTransferInfo = transferInfo;
        }
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
    const folder = aFolder;

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
   * @param {nsIMsgFolder} - The folder to delete.
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
      const confirmation = messengerBundle.GetStringFromName(
        "confirmSavedSearchDeleteMessage"
      );
      const title = messengerBundle.GetStringFromName(
        "confirmSavedSearchTitle"
      );
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
        if (ex.result == Cr.NS_ERROR_FILE_NO_DEVICE_SPACE) {
          // folder could not be deleted due to low space
          // outOfDiskSpace message is too restricted to downloading
          // operation so we created a new generic message, outOfDiskSpaceGeneric
          folder.throwAlertMsg("outOfDiskSpaceGeneric", top.msgWindow);
        } else {
          throw ex;
        }
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
    if (FolderUtils.isSmartVirtualFolder(folder)) {
      for (const server of MailServices.accounts.allServers) {
        for (const trash of server.rootFolder.getFoldersWithFlags(
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

    if (FolderUtils.isSmartVirtualFolder(folder)) {
      // This is the unified junk folder.
      const wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
      for (const searchFolder of wrappedFolder.searchFolders) {
        this.emptyJunk(searchFolder, false);
      }
      return;
    }

    // Delete any subfolders this folder might have
    for (const subFolder of folder.subFolders) {
      folder.propagateDelete(subFolder, true);
    }

    const messages = [...folder.messages];
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
    const folder = aParent || top.GetDefaultAccountRootFolder();
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
    const folder = aFolder;

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

    const showPrompt = !Services.prefs.getBoolPref(
      "mailnews." + aCommand + ".dontAskAgain",
      false
    );

    if (showPrompt) {
      const checkbox = { value: false };
      const title = messengerBundle.formatStringFromName(
        aCommand + "FolderTitle",
        [aFolder.prettyName]
      );
      const msg = messengerBundle.GetStringFromName(aCommand + "FolderMessage");
      const ok =
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

  /**
   * Ensure the pane header context menu items are correctly checked.
   */
  updateContextMenuCheckedItems() {
    for (const item of document.querySelectorAll(".folder-pane-option")) {
      switch (item.id) {
        case "folderPaneHeaderToggleGetMessages":
          XULStoreUtils.isItemHidden("messenger", "folderPaneGetMessages")
            ? item.removeAttribute("checked")
            : item.setAttribute("checked", true);
          break;
        case "folderPaneHeaderToggleNewMessage":
          XULStoreUtils.isItemHidden("messenger", "folderPaneWriteMessage")
            ? item.removeAttribute("checked")
            : item.setAttribute("checked", true);
          break;
        case "folderPaneHeaderToggleTotalCount":
          XULStoreUtils.isItemVisible("messenger", "totalMsgCount")
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
          XULStoreUtils.isItemVisible("messenger", "folderPaneFolderSize")
            ? item.setAttribute("checked", true)
            : item.removeAttribute("checked");
          break;
        case "folderPaneHeaderToggleLocalFolders":
          XULStoreUtils.isItemHidden("messenger", "folderPaneLocalFolders")
            ? item.setAttribute("checked", true)
            : item.removeAttribute("checked");
          break;
        default:
          item.removeAttribute("checked");
          break;
      }
    }
  },

  toggleHeaderButton(event, id) {
    const isHidden = !event.target.hasAttribute("checked");
    document.getElementById(id).hidden = isHidden;
    XULStoreUtils.setValue("messenger", id, "hidden", isHidden);
  },

  toggleHeader(hide) {
    document.getElementById("folderPaneHeaderBar").hidden = hide;
    XULStoreUtils.setValue("messenger", "folderPaneHeaderBar", "hidden", hide);
  },

  /**
   * Ensure the folder rows UI elements reflect the state set by the user.
   */
  updateFolderRowUIElements() {
    this.toggleTotalCountBadge();
    this.toggleFolderSizes();
  },

  /**
   * Toggle the total message count badges and update the XULStore.
   */
  toggleTotal(event) {
    const show = event.target.hasAttribute("checked");
    XULStoreUtils.setValue("messenger", "totalMsgCount", "visible", show);
    this.toggleTotalCountBadge();
  },

  toggleTotalCountBadge() {
    const isHidden = !XULStoreUtils.isItemVisible("messenger", "totalMsgCount");
    for (const row of document.querySelectorAll(`li[is="folder-tree-row"]`)) {
      row.toggleTotalCountBadgeVisibility(isHidden);
    }
  },

  /**
   * Toggle the folder size option and update the XULStore.
   */
  toggleFolderSize(event) {
    const show = event.target.hasAttribute("checked");
    XULStoreUtils.setValue(
      "messenger",
      "folderPaneFolderSize",
      "visible",
      show
    );
    this.toggleFolderSizes();
  },

  /**
   * Toggle the folder size info on each folder.
   */
  toggleFolderSizes() {
    const isHidden = !XULStoreUtils.isItemVisible(
      "messenger",
      "folderPaneFolderSize"
    );
    for (const row of document.querySelectorAll(`li[is="folder-tree-row"]`)) {
      row.updateSizeCount(isHidden);
    }
  },

  /**
   * Toggle the hiding of the local folders and update the XULStore.
   */
  toggleLocalFolders(event) {
    const isHidden = event.target.hasAttribute("checked");
    XULStoreUtils.setValue(
      "messenger",
      "folderPaneLocalFolders",
      "hidden",
      isHidden
    );
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
    for (const server of servers) {
      const menuitem = document.createXULElement("menuitem");
      menuitem.classList.add("menuitem-iconic", "server");
      menuitem.dataset.serverKey = server.key;
      menuitem.dataset.serverType = server.type;
      menuitem.dataset.serverSecure = server.isSecure;
      menuitem.label = server.prettyName;
      menuitem.addEventListener("command", () =>
        top.MsgGetMessagesForAccount(server.rootFolder)
      );
      menupopup.appendChild(menuitem);
    }
  },

  get isMultiSelection() {
    return folderTree.selection.size > 1;
  },
};

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
    this.isHidden = XULStoreUtils.isItemHidden("messenger", "threadPaneHeader");
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
      this.displayContext.openPopup(event.target, {
        position: "after_end",
        triggerEvent: event,
      });
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
    document
      .getElementById(
        threadTree.getAttribute("rows") == "thread-row"
          ? "threadPaneTableView"
          : "threadPaneCardsView"
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

    // Update menuitem to reflect sort key.
    for (const menuitem of event.target.querySelectorAll(`[name="sortby"]`)) {
      const sortKey = menuitem.getAttribute("value");
      menuitem.setAttribute(
        "checked",
        gViewWrapper.primarySortColumnId == sortKey
      );
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
    XULStoreUtils.setValue("messenger", "threadPane", "view", view);
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

    XULStoreUtils.setValue(
      "messenger",
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
   * Update the header data when the selected folder changes, or when a
   * synthetic view is created.
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

    this.folderName.textContent = gFolder?.abbreviatedName ?? document.title;
    this.folderName.title = gFolder?.prettyName ?? document.title;
    this.updateMessageCount(
      gFolder?.getTotalMessages(false) || gDBView?.numMsgsInView || 0
    );
    this.updateSelectedCount();
    this.folderName.hidden = false;
    this.folderCount.hidden = false;
  },

  /**
   * Update the total message count in the header.
   *
   * @param {integer} newValue
   */
  updateMessageCount(newValue) {
    if (this.isHidden) {
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

    const count = gDBView?.getSelectedMsgHdrs().length;
    if (count === undefined || count < 2) {
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

  /**
   * Set to true when a scrolling event (presumably by the user) is detected
   * while messages are still loading in a newly created view.
   *
   * @type {boolean}
   */
  scrollDetected: false,

  /**
   * The first detected scrolling event is triggered by creating the view
   * itself. This property is then set to false.
   *
   * @type {boolean}
   */
  isFirstScroll: true,

  columns: ThreadPaneColumns.getDefaultColumns(gFolder),

  cardColumns: ThreadPaneColumns.getDefaultColumnsForCardsView(gFolder),

  async init() {
    await quickFilterBar.init();

    this.setUpTagStyles();
    Services.prefs.addObserver("mailnews.tags.", this);

    Services.obs.addObserver(this, "addrbook-displayname-changed");
    Services.obs.addObserver(this, "custom-column-added");
    Services.obs.addObserver(this, "custom-column-removed");
    Services.obs.addObserver(this, "custom-column-refreshed");

    threadTree = document.getElementById("threadTree");
    this.treeTable = threadTree.table;
    this.treeTable.editable = true;
    this.treeTable.setPopupMenuTemplates([
      "threadPaneApplyColumnMenu",
      "threadPaneApplyViewMenu",
    ]);
    threadPane.updateThreadView(
      XULStoreUtils.getValue("messenger", "threadPane", "view")
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
      this.updateThreadItemSize();
    });
    window.addEventListener("uifontsizechange", () => {
      this.updateThreadItemSize();
    });
    this.updateThreadItemSize();

    ChromeUtils.defineLazyGetter(this, "notificationBox", () => {
      const container = document.getElementById("threadPaneNotificationBox");
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
      this.treeTable.setColumnsWidths("messenger", event);
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
    threadTree.addEventListener("click", this);
    threadTree.addEventListener("dblclick", this);
    threadTree.addEventListener("auxclick", this);
    threadTree.addEventListener("keypress", this);
    threadTree.addEventListener("select", this);
    threadTree.table.body.addEventListener("dragstart", this);
    threadTree.addEventListener("dragover", this);
    threadTree.addEventListener("drop", this);
    threadTree.addEventListener("expanded", this);
    threadTree.addEventListener("collapsed", this);
    threadTree.addEventListener("scroll", this);
    threadTree.addEventListener("showplaceholder", this);
  },

  uninit() {
    Services.prefs.removeObserver("mailnews.tags.", this);
    Services.obs.removeObserver(this, "addrbook-displayname-changed");
    Services.obs.removeObserver(this, "custom-column-added");
    Services.obs.removeObserver(this, "custom-column-removed");
    Services.obs.removeObserver(this, "custom-column-refreshed");
  },

  handleEvent(event) {
    const notOnEmptySpace = event.target !== threadTree;
    switch (event.type) {
      case "click":
        if (notOnEmptySpace && event.target.closest(".tree-button-more")) {
          this._onContextMenu(event);
        }
        break;
      case "contextmenu":
        if (notOnEmptySpace) {
          this._onContextMenu(event);
        }
        break;
      case "dblclick":
        if (notOnEmptySpace) {
          this._onDoubleClick(event);
        }
        break;
      case "auxclick":
        if (event.button == 1 && notOnEmptySpace) {
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
      case "scroll":
        if (this.isFirstScroll) {
          this.isFirstScroll = false;
          break;
        }
        this.scrollDetected = true;
        break;
      case "showplaceholder":
        threadTree.updatePlaceholders([
          folderTree.selection.size > 1
            ? "placeholderMultipleFolders"
            : "placeholderNoMessages",
        ]);
        break;
    }
  },
  observe(subject, topic, data) {
    switch (topic) {
      case "nsPref:changed":
        this.setUpTagStyles();
        break;
      case "addrbook-displayname-changed":
        // This runs the when mail.displayname.version preference observer is
        // notified/the mail.displayname.version number has been updated.
        threadTree.invalidate();
        break;
      case "custom-column-refreshed":
        // Invalidate only the column specified in data.
        threadTree.invalidate(data);
        break;
      case "custom-column-added":
        this.addCustomColumn(data);
        break;
      case "custom-column-removed":
        this.onCustomColumnRemoved(data);
        break;
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

    threadTree.classList.toggle(
      "is-outgoing",
      ThreadPaneColumns.isOutgoing(gFolder)
    );
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
    this.restoreSelection({ notify: false });
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

    if ((event.key == "Backspace" || event.key == "Delete") && event.repeat) {
      // Bail on delete event if there is a repeat event to prevent deleteing
      // multiple messages by mistake from a longer key press.
      event.preventDefault();
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
    if (
      threadTree.selectedIndex < 0 ||
      gDBView.getFlagsAt(threadTree.selectedIndex) & MSG_VIEW_FLAG_DUMMY
    ) {
      return;
    }

    const folder = gFolder || gDBView.hdrForFirstSelectedMessage.folder;
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
  _onSelect() {
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
            const uri = gDBView.getURIForViewIndex(threadTree.selectedIndex);
            messagePane.displayMessage(uri);
            threadPaneHeader.updateSelectedCount();
          }
          break;
        default:
          if (gViewWrapper.showGroupedBySort) {
            const savedIndex = threadTree.currentIndex;
            threadTree.selectedIndices
              .filter(i => gViewWrapper.isExpandedGroupedByHeaderAtIndex(i))
              .forEach(i => threadTree.toggleSelectionAtIndex(i, false, false));
            threadTree.currentIndex = savedIndex;
          }
          messagePane.displayMessages(gDBView.getSelectedMsgHdrs());
          threadPaneHeader.updateSelectedCount();
          break;
      }
    }

    updateZoomCommands();
  },

  /**
   * Handle threadPane drag events.
   */
  _onDragStart(event) {
    const row = event.target.closest(`tr[is^="thread-"]`);
    if (!row || gViewWrapper.isExpandedGroupedByHeaderAtIndex(row.index)) {
      event.preventDefault();
      return;
    }

    let messageURIs = gDBView.getURIsForSelection();
    if (!threadTree.selectedIndices.includes(row.index)) {
      if (gViewWrapper.isGroupedByHeaderAtIndex(row.index)) {
        event.preventDefault();
        return;
      }
      messageURIs = [gDBView.getURIForViewIndex(row.index)];
    }

    let noSubjectString = messengerBundle.GetStringFromName(
      "defaultSaveMessageAsFileName"
    );
    if (noSubjectString.endsWith(".eml")) {
      noSubjectString = noSubjectString.slice(0, -4);
    }
    const longSubjectTruncator = messengerBundle.GetStringFromName(
      "longMsgSubjectTruncator"
    );
    // Clip the subject string to 124 chars to avoid problems on Windows,
    // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
    const maxUncutNameLength = 124;
    const maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
    const messages = new Map();

    for (const [index, uri] of Object.entries(messageURIs)) {
      const msgService = MailServices.messageServiceFromURI(uri);
      const msgHdr = msgService.messageURIToMsgHdr(uri);
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

      // @see https://github.com/eslint/eslint/issues/17807
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (!messages.has(msgFileNameLowerCase)) {
          messages.set(msgFileNameLowerCase, 1);
          break;
        } else {
          const number = messages.get(msgFileNameLowerCase);
          messages.set(msgFileNameLowerCase, number + 1);
          const postfix = "-" + number;
          msgFileName = msgFileName + postfix;
          msgFileNameLowerCase = msgFileNameLowerCase + postfix;
        }
      }

      msgFileName = msgFileName + ".eml";

      // When dragging messages to the filesystem:
      // - Windows fetches application/x-moz-file-promise-url and writes it to
      //     a file.
      // - Linux uses the flavor data provider, if a single message is dragged.
      //     If multiple messages are dragged AND text/x-moz-url exists, it
      //     fetches application/x-moz-file-promise-url and writes it to a file.
      // - MacOS always uses the flavor data provider.

      // text/plain should be unnecessary, but getFlavorData can't get at
      // text/x-moz-message for some reason.
      event.dataTransfer.mozSetDataAt("text/plain", uri, index);
      event.dataTransfer.mozSetDataAt("text/x-moz-message", uri, index);
      event.dataTransfer.mozSetDataAt(
        "text/x-moz-url",
        msgService.getUrlForUri(uri).spec,
        index
      );
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
    const bcr = row.getBoundingClientRect();
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
    const types = Array.from(event.dataTransfer.mozTypesAt(0));
    const targetFolder = gFolder;
    if (types.includes("application/x-moz-file")) {
      if (targetFolder.isServer || !targetFolder.canFileMessages) {
        return;
      }
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const extFile = event.dataTransfer
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
      const extFile = event.dataTransfer
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
    const isRightClick = event.button == 2;
    if (!isRightClick) {
      if (threadTree.selectedIndex < 0) {
        return;
      }
      // Scroll selected row we're triggering the context menu for into view.
      threadTree.scrollToIndex(threadTree.currentIndex, true);
      if (!row) {
        row = threadTree.getRowAtIndex(threadTree.currentIndex);
        // Try again once in the next frame.
        if (!row && !retry) {
          window.requestAnimationFrame(() => this._onContextMenu(event, true));
          return;
        }
      }
    }
    if (!row || gDBView.getFlagsAt(row.index) & MSG_VIEW_FLAG_DUMMY) {
      return;
    }

    mailContextMenu.setAsThreadPaneContextMenu();
    const popup = document.getElementById("mailContext");

    if (isRightClick) {
      if (!gDBView.selection.isSelected(row.index)) {
        // The right-clicked-on row is not selected. Tell the context menu to
        // use it instead. This override lasts until the context menu fires
        // a "popuphidden" event.
        mailContextMenu.setOverrideSelection(row.index);
        row.classList.add("context-menu-target");
      }
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
    } else if (event.target.closest(".tree-button-more")) {
      const moreBtn = event.target.closest(".tree-button-more");
      popup.openPopup(moreBtn, "after_end", 0, 0, true);
    } else {
      popup.openPopup(row, "after_end", 0, 0, true);
    }

    event.preventDefault();
  },

  _flavorDataProvider: {
    QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

    getFlavorData(transferable, flavor) {
      if (flavor !== "application/x-moz-file-promise") {
        return;
      }

      const fileName = {};
      transferable.getTransferData(
        "application/x-moz-file-promise-dest-filename",
        fileName
      );
      fileName.value.QueryInterface(Ci.nsISupportsString);

      const destDir = {};
      transferable.getTransferData(
        "application/x-moz-file-promise-dir",
        destDir
      );
      destDir.value.QueryInterface(Ci.nsIFile);

      const file = destDir.value.clone();
      file.append(fileName.value.data);

      const messageURI = {};
      transferable.getTransferData("text/plain", messageURI);
      messageURI.value.QueryInterface(Ci.nsISupportsString);

      top.messenger.saveAs(messageURI.value.data, true, null, file.path, true);
    },
  },

  _jsTree: {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgJSTree"]),
    _inBatch: 0,
    beginUpdateBatch() {
      this._inBatch++;
    },
    endUpdateBatch() {
      this._inBatch--;
      if (this._inBatch < 0) {
        this._inBatch = 0;
        console.warn("Mismatch in batch processing detected.");
      }
    },
    ensureRowIsVisible(index) {
      if (!this._inBatch) {
        threadTree.scrollToIndex(index, true);
      }
    },
    invalidate() {
      if (!this._inBatch) {
        threadTree.reset();
        if (threadPane) {
          threadPane.isFirstScroll = true;
          threadPane.scrollDetected = false;
          threadPane.scrollToLatestRowIfNoSelection();
        }
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
   * @param {?nsIMsgDBView} view
   */
  setTreeView(view) {
    threadTree.view = gDBView = view;
    // Clear the batch flag. Don't call `endUpdateBatch` as that may change in
    // future leading to unintended consequences.
    this._jsTree._inBatch = false;
    view?.setJSTree(this._jsTree);
  },

  setUpTagStyles() {
    if (this.tagStyle) {
      this.tagStyle.remove();
    }
    this.tagStyle = document.head.appendChild(document.createElement("style"));

    for (const { color, key } of MailServices.tags.getAllTags()) {
      if (!color) {
        continue;
      }
      const selector = MailServices.tags.getSelectorForKey(key);
      const contrast = TagUtils.isColorContrastEnough(color)
        ? "black"
        : "white";
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
  async densityChange() {
    // The class ThreadRow can't be referenced because it's declared in a
    // different scope. But we can get it from customElements.
    const rowClass = customElements.get("thread-row");
    const cardClass = customElements.get("thread-card");
    const currentFontSize = UIFontSize.size;
    const cardRows = 3;
    const cardRowConstant = Math.round(1.43 * cardRows * currentFontSize); // subject line-height * line-height * cardRows * current font-size
    let rowHeight = Math.ceil(currentFontSize * 1.4);
    let lineGap;
    let densityPaddingConstant;
    let cardRowHeight;
    switch (UIDensity.prefValue) {
      case UIDensity.MODE_COMPACT:
        // Calculation based on card components:
        lineGap = 1;
        densityPaddingConstant = 3; // card padding-block + 2 * row padding-block
        cardRowHeight =
          cardRowConstant + lineGap * cardRows + densityPaddingConstant;
        break;
      case UIDensity.MODE_TOUCH:
        rowHeight = rowHeight + 13;
        lineGap = 6;
        densityPaddingConstant = 12; // card padding-block + 2 * row padding-block
        cardRowHeight =
          cardRowConstant + lineGap * cardRows + densityPaddingConstant;
        break;
      default:
        rowHeight = rowHeight + 7;
        lineGap = 3;
        densityPaddingConstant = 7; // card padding-block + 2 * row padding-block
        cardRowHeight =
          cardRowConstant + lineGap * cardRows + densityPaddingConstant;
        break;
    }
    cardClass.ROW_HEIGHT = Math.max(cardRowHeight, 50);
    rowClass.ROW_HEIGHT = Math.max(rowHeight, 18);
  },

  /**
   * Update thread item size in DOM (thread cards and rows).
   */
  async updateThreadItemSize() {
    await this.densityChange();
    threadTree.reset();
  },

  /**
   * Gets the key to use for storing the selection in `_savedSelections` or for
   * retrieving it.
   *
   * @returns {string?} - A string to use as a key, or null. If null, the
   *   selection should not be saved.
   */
  _getSavedSelectionKey() {
    // Synthetic views never share an about:3pane with other views, so it's
    // safe to use any key here.
    if (gViewWrapper?.isSynthetic) {
      return "synthetic";
    }
    if (gFolder && gDBView) {
      return gFolder.URI;
    }
    return null;
  },

  /**
   * Store the current thread tree selection.
   */
  saveSelection() {
    const selectionKey = this._getSavedSelectionKey();
    if (!selectionKey) {
      return;
    }

    const currentIndex = threadTree.currentIndex;
    let currentUri = null;
    if (
      currentIndex != -1 &&
      currentIndex < gDBView.rowCount &&
      !gViewWrapper.isGroupedByHeaderAtIndex(currentIndex)
    ) {
      currentUri = gDBView.getURIForViewIndex(threadTree.currentIndex);
    }
    this._savedSelections.set(selectionKey, {
      currentUri,
      // In views which are "grouped by sort", getting the key for collapsed
      // dummy rows returns the key of the first group member, so we would
      // restore something that wasn't selected. So filter them out.
      selectedUris: threadTree.selectedIndices
        .filter(i => !gViewWrapper.isGroupedByHeaderAtIndex(i))
        .map(gDBView.getURIForViewIndex),
    });
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
   * @param {boolean} [discard=true] - If false, the selection data is kept for
   *   another call of this function.
   * @param {boolean} [notify=true] - Whether a change in "select" event
   *   should be fired.
   * @param {boolean} [expand=true] - Try to expand threads containing selected
   *   messages.
   */
  restoreSelection({ discard = true, notify = true, expand = true } = {}) {
    const selectionKey = this._getSavedSelectionKey();
    if (
      !selectionKey ||
      !this._savedSelections.has(selectionKey) ||
      !threadTree.view
    ) {
      return;
    }

    // Ignore any updates from the gDBView caused by findIndexForMsgURI
    // expanding threads.
    this._jsTree.beginUpdateBatch();

    const { currentUri, selectedUris } =
      this._savedSelections.get(selectionKey);
    const currentIndex = currentUri
      ? gDBView.findIndexForMsgURI(currentUri, expand)
      : nsMsgViewIndex_None;
    const indices = new Set(
      selectedUris
        .map(uri => gDBView.findIndexForMsgURI(uri, expand))
        .filter(i => i != nsMsgViewIndex_None)
    );
    // Set the selection and stop ignoring updates.
    threadTree.setSelectedIndices(indices.values(), true);
    this._jsTree.endUpdateBatch();
    threadTree.onSelectionChanged(false, !notify);

    if (currentIndex == nsMsgViewIndex_None) {
      threadTree.currentIndex = -1;
    } else {
      threadTree.style.scrollBehavior = "auto"; // Avoid smooth scroll.
      threadTree.currentIndex = currentIndex;
      threadTree.style.scrollBehavior = null;
    }

    // To avoid problems with restoreThreadState, do not discard any selection
    // data until explicitly requested.
    if (discard) {
      this._savedSelections.delete(selectionKey);
    }
  },

  /**
   * Scroll to the most relevant end of the tree, but only if no rows are
   * selected.
   */
  scrollToLatestRowIfNoSelection() {
    if (!gDBView || gDBView.selection.count > 0 || gDBView.rowCount <= 0) {
      return;
    }
    if (
      gViewWrapper.sortImpliesTemporalOrdering &&
      gViewWrapper.isSortedAscending
    ) {
      threadTree.scrollToIndex(gDBView.rowCount - 1, true);
    } else {
      threadTree.scrollToIndex(0, true);
    }
  },

  /**
   * Re-collapse threads expanded by nsMsgQuickSearchDBView if necessary.
   */
  ensureThreadStateForQuickSearchView() {
    // nsMsgQuickSearchDBView::SortThreads leaves all threads expanded in any
    // case.
    if (
      gViewWrapper.isSingleFolder &&
      gViewWrapper.search.hasSearchTerms &&
      gViewWrapper.showThreaded &&
      !gViewWrapper._threadExpandAll
    ) {
      window.threadPane.saveSelection();
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
      window.threadPane.restoreSelection();
    }
  },

  /**
   * Set the correct style attributes in the threadTree and, if setState
   * is true, restore the collapsed or expanded state of threads that is being
   * held in gViewWrapper._threadExpandAll.
   *
   * @param {boolean} [setState=true] - Actually set the collapsed/expanded
   *   state.
   */
  restoreThreadState(setState = true) {
    // Early return if the view is not available, eg. in multiselection.
    if (!gViewWrapper) {
      return;
    }

    if (setState) {
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
    }

    threadTree.dataset.showGroupedBySort = gViewWrapper.showGroupedBySort;
  },

  /**
   * Restore the chevron icon indicating the current sort order.
   */
  restoreSortIndicator() {
    if (!gDBView) {
      return;
    }
    this.updateSortIndicator(gViewWrapper.primarySortColumnId);
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
    this.cardColumns = ThreadPaneColumns.getDefaultColumnsForCardsView(gFolder);
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
      this.columns = ThreadPaneColumns.getDefaultColumns(gFolder);
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

  makeCustomColumnCell(column) {
    if (!column?.custom) {
      throw new Error(`Not a custom column: ${column?.id}`);
    }

    const cell = document.createElement("td");
    const columnName = column.id.toLowerCase();
    cell.classList.add(`${columnName}-column`);

    // Default columns have this hardcoded in about3Pane.xhtml.
    cell.dataset.columnName = columnName;
    if (column.icon && column.iconCellDefinitions) {
      cell.classList.add("button-column");
      // Add predefined icons for custom icon columns.
      for (const { id, url, title, alt } of column.iconCellDefinitions) {
        const img = document.createElement("img");
        img.dataset.cellIconId = id;
        img.src = url;
        img.alt = alt || "";
        img.title = title || "";
        img.hidden = true;
        cell.appendChild(img);
      }
    }

    return cell;
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
      this.rowTemplate.content.append(
        ...ThreadPaneColumns.getCustomColumns().map(column =>
          this.makeCustomColumnCell(column)
        )
      );
    }

    // Update the row template to match the column properties.
    for (const column of this.columns) {
      const cell = this.rowTemplate.content.querySelector(
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
    this.treeTable.restoreColumnsWidths("messenger");
  },

  /**
   * Restore the default columns visibility and order and save the change.
   */
  restoreDefaultColumns() {
    this.columns = ThreadPaneColumns.getDefaultColumns(
      gFolder,
      gViewWrapper?.isSynthetic
    );
    this.cardColumns = ThreadPaneColumns.getDefaultColumnsForCardsView(gFolder);
    this.updateClassList();
    this.updateColumns();
    threadTree.reset();
    this.persistColumnStates();
  },

  /**
   * Adds a custom column to the thread pane.
   *
   * @param {string} columnID - uniqe id of the custom column
   */
  addCustomColumn(columnID) {
    const column = ThreadPaneColumns.getColumn(columnID);
    if (this.rowTemplate) {
      this.rowTemplate.content.appendChild(this.makeCustomColumnCell(column));
    }

    this.columns.push(column);
    const columnStates =
      gFolder.msgDatabase.dBFolderInfo.getCharProperty("columnStates");
    if (columnStates) {
      this.applyPersistedColumnsState(JSON.parse(columnStates));
    }

    gViewWrapper?.dbView.addColumnHandler(column.id, column.handler);
    this.updateColumns();
    this.restoreSortIndicator();
    threadTree.reset();
  },

  /**
   * Removes a custom column from the thread pane.
   *
   * @param {string} columnID - uniqe id of the custom column
   */
  onCustomColumnRemoved(columnID) {
    if (this.rowTemplate) {
      this.rowTemplate.content
        .querySelector(`td.${columnID.toLowerCase()}-column`)
        ?.remove();
    }

    this.columns = this.columns.filter(column => column.id != columnID);
    this.updateColumns();
    gViewWrapper?.dbView.removeColumnHandler(columnID);
    threadTree.reset();
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

    const delta = forward ? 1 : -1;
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
    this.updateColumns();
    threadTree.reset();
  },

  /**
   * Update the list of visible columns based on the users' selection.
   *
   * @param {object} data - The detail object of the bubbled event.
   */
  onColumnsVisibilityChanged(data) {
    const column = data.value;
    const checked = data.target.hasAttribute("checked");

    const changedColumn = this.columns.find(c => c.id == column);
    changedColumn.hidden = !checked;

    this.persistColumnStates();
    this.updateColumns(true);
    threadTree.reset();
  },

  /**
   * Save the current visibility of the columns in the folder database.
   */
  persistColumnStates() {
    const newState = {};
    for (const column of this.columns) {
      newState[column.id] = {
        visible: !column.hidden,
        ordinal: column.ordinal,
      };
    }

    if (gViewWrapper.isSynthetic) {
      const syntheticView = gViewWrapper._syntheticView;
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
    const curSortColumnId = gViewWrapper.primarySortColumnId;
    const newSortColumnId = data.column;

    // A click happened on the column that is already used to sort the list.
    if (curSortColumnId == newSortColumnId) {
      if (gViewWrapper.isSortedAscending) {
        sortController.sortDescending();
      } else {
        sortController.sortAscending();
      }
      this.updateSortIndicator(newSortColumnId);
      return;
    }

    if (sortController.sortThreadPane(newSortColumnId)) {
      this.updateSortIndicator(newSortColumnId);
    }
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
    // The column could be a removed custom column.
    if (!column) {
      return;
    }
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
    const [title, message] = await document.l10n.formatValues([
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
    const columnState = {};
    for (const column of this.columns) {
      columnState[column.id] = {
        visible: !column.hidden,
        ordinal: column.ordinal,
      };
    }

    // Swaps "From" and "Recipient" if only one is shown. This is useful for
    // copying an incoming folder's columns to and from an outgoing folder.
    const columStateString = JSON.stringify(columnState);
    let swappedColumnStateString;
    if (columnState.senderCol.visible != columnState.recipientCol.visible) {
      const backedSenderColumn = columnState.senderCol;
      columnState.senderCol = columnState.recipientCol;
      columnState.recipientCol = backedSenderColumn;
      swappedColumnStateString = JSON.stringify(columnState);
    } else {
      swappedColumnStateString = columStateString;
    }

    const currentFolderIsOutgoing = ThreadPaneColumns.isOutgoing(gFolder);

    /**
     * Update the columnStates property of the folder database and forget the
     * reference to prevent memory bloat.
     *
     * @param {nsIMsgFolder} folder - The message folder.
     */
    const commitColumnsState = folder => {
      if (folder.isServer) {
        return;
      }
      // Check if the destination folder we're trying to update matches the same
      // special state of the folder we're getting the column state from.
      const colStateString =
        ThreadPaneColumns.isOutgoing(folder) == currentFolderIsOutgoing
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
    const [title, message] = await document.l10n.formatValues([
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
      if (folder.isServer) {
        return;
      }
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
  async showIgnoredMessageNotification(messages, subthreadOnly) {
    const threadIds = new Set();
    messages.forEach(function (msg) {
      if (!threadIds.has(msg.threadId)) {
        threadIds.add(msg.threadId);
      }
    });

    const buttons = [
      {
        label: messengerBundle.GetStringFromName("learnMoreAboutIgnoreThread"),
        accessKey: messengerBundle.GetStringFromName(
          "learnMoreAboutIgnoreThreadAccessKey"
        ),
        popup: null,
        callback() {
          const url = Services.prefs.getCharPref(
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
        callback() {
          messages.forEach(function (msg) {
            const msgDb = msg.folder.msgDatabase;
            if (subthreadOnly) {
              msgDb.markHeaderKilled(msg, false, null);
            } else if (threadIds.has(msg.threadId)) {
              const thread = msgDb.getThreadContainingMsgHdr(msg);
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
      const ignoredThreadText = messengerBundle.GetStringFromName(
        !subthreadOnly ? "ignoredThreadFeedback" : "ignoredSubthreadFeedback"
      );
      let subj = messages[0].mime2DecodedSubject || "";
      if (subj.length > 45) {
        subj = subj.substring(0, 45) + "…";
      }
      const text = ignoredThreadText.replace("#1", subj);

      await this.notificationBox.appendNotification(
        "ignoreThreadInfo",
        {
          label: text,
          priority: this.notificationBox.PRIORITY_INFO_MEDIUM,
        },
        buttons
      );
    } else {
      const ignoredThreadText = messengerBundle.GetStringFromName(
        !subthreadOnly ? "ignoredThreadsFeedback" : "ignoredSubthreadsFeedback"
      );

      const { PluralForm } = ChromeUtils.importESModule(
        "resource:///modules/PluralForm.sys.mjs"
      );
      const text = PluralForm.get(threadIds.size, ignoredThreadText).replace(
        "#1",
        threadIds.size
      );
      await this.notificationBox.appendNotification(
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
        threadTree.setAttribute("rows", "thread-row");
        threadTree.headerHidden = false;
        break;
      case "cards":
      default:
        threadTree.setAttribute("rows", "thread-card");
        threadTree.headerHidden = true;
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
      webBrowser.docShellIsActive = false;
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
    webBrowser.docShellIsActive = window.tabOrWindow.selected;
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
    // Hide the findbar of webview pane or multimessage pane if opened.
    const switchingMessages = !messageBrowser.hidden;
    if (!switchingMessages) {
      this.hideCurrentFindBar();
    }

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
    // Hide the findbar of webview pane or message pane if opened.
    const switchingThreads = !multiMessageBrowser.hidden;
    if (!switchingThreads) {
      this.hideCurrentFindBar();
    }

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

    const getThreadId = function (message) {
      return gDBView.getThreadContainingMsgHdr(message).getRootHdr().messageKey;
    };

    let oneThread = true;
    const firstThreadId = getThreadId(messages[0]);
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

    if (switchingThreads) {
      const findBar = document.getElementById("multiMessageViewFindToolbar");
      if (findBar && !findBar?.hidden) {
        findBar.onFindAgainCommand(false);
      }
    }
  },

  /**
   * Hide the findbar, in all of messageBrowser, multimessageBrowser,
   * or webBrowser.
   */
  hideCurrentFindBar() {
    // Multi message view.
    const multiFindbar = document.getElementById("multiMessageViewFindToolbar");
    multiFindbar?.clear();
    multiFindbar?.close();

    // Single message view.
    messageBrowser.contentDocument.getElementById("FindToolbar").clear();
    messageBrowser.contentDocument.getElementById("FindToolbar").close();

    // Web Browser view.
    const browserFindbar = document.getElementById("webBrowserFindToolbar");
    browserFindbar?.clear();
    browserFindbar?.close();
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
    messagePaneVisible = !XULStoreUtils.isItemCollapsed(
      "messenger",
      "messagepaneboxwrapper"
    );
  }
  paneLayout.messagePaneSplitter.isCollapsed = !messagePaneVisible;

  if (folderURI) {
    displayFolder(folderURI);
  } else if (syntheticView) {
    // In a synthetic view check if we have a previously edited column layout to
    // restore.
    if ("getPersistedSetting" in syntheticView) {
      const columnsState = syntheticView.getPersistedSetting("columns");
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
    threadPane.restoreSortIndicator();
    threadPaneHeader.onFolderSelected();

    window.dispatchEvent(
      new CustomEvent("folderURIChanged", { bubbles: true })
    );
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
 * Ensures the given row is visible and all its parent folders are expanded.
 * @param {FolderTreeRow} row
 */
function ensureFolderTreeRowIsVisible(row) {
  let collapsedAncestor = row.parentNode.closest("#folderTree li.collapsed");
  while (collapsedAncestor) {
    folderTree.expandRow(collapsedAncestor);
    collapsedAncestor = collapsedAncestor.parentNode.closest(
      "#folderTree li.collapsed"
    );
  }
}

/**
 * Set up the given folder to be selected in the folder pane.
 * @param {nsIMsgFolder|string} folder - The folder to display, or its URI.
 */
function displayFolder(folder) {
  const folderURI = folder instanceof Ci.nsIMsgFolder ? folder.URI : folder;
  if (folderTree.selectedRow?.uri == folderURI) {
    // Already set to display the right folder. Make sure not not to change
    // to the same folder in a different folder mode.
    return;
  }

  const row = folderPane.getRowForFolder(folderURI);
  if (!row) {
    return;
  }

  ensureFolderTreeRowIsVisible(row);
  folderTree.updateSelection(row);
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
  onMessageAdded() {},
  onFolderRemoved(parentFolder, childFolder) {
    // Check if the folder is in the selection range before we remove it.
    const row = folderPane.getRowForFolder(childFolder.URI);
    const notInRange = !folderTree.selection.has(folderTree.rows.indexOf(row));

    folderPane.removeFolder(parentFolder, childFolder);
    if (childFolder == gFolder) {
      gFolder = null;
      gViewWrapper?.close(true);
    }

    // We need to rebuild the selection map if a folder was removed while we had
    // multiple folders selected and it wasn't part of the selection range, to
    // ensure the indices match the rows.
    if (folderTree.selection.size > 1 && notInRange) {
      setTimeout(() => {
        folderTree.swapSelection([...folderTree.selection.values()]);
      });
    }
  },
  onMessageRemoved() {
    if (gViewWrapper?.isSynthetic) {
      window.threadPaneHeader.updateMessageCount(gDBView.numMsgsInView);
    }
  },
  onFolderPropertyChanged() {},
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
        if (gFolder && folder?.URI == gFolder.URI) {
          threadPaneHeader.updateMessageCount(newValue);
        }
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
          for (const f of folder.descendants) {
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
  onFolderPropertyFlagChanged() {},
  onFolderEvent(folder, event) {
    if (event == "RenameCompleted") {
      // If a folder is renamed, we get an `onFolderAdded` notification for
      // the folder but we are not notified about the descendants.
      for (const f of folder.descendants) {
        folderPane.addFolder(f.parent, f);
      }
    }
  },
};

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
  (folder = gFolder) => {
    if (folder) {
      folderPane.deleteFolder(folder);
      return;
    }
    // gFolder is not defined and the folder is null, which means a DELETE
    // keyboard shortcut was triggered for a multiselection. Loop through
    // all currently selected folders and delete them.
    for (const row of folderTree.selection.values()) {
      folder = MailServices.folderLookup.getFolderForURL(row.uri);
      folderPane.deleteFolder(folder);
    }
  },
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
      return;
    }
    folderPane.compactFolder(folder);
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
      !quickFilterBar?.domNode ||
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
      !quickFilterBar?.domNode ||
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
    gViewWrapper.dbView.numSelected > 0
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
        {
          const column = threadPane.columns.find(
            c => c.id == event.target.value
          );
          if (column && this.sortThreadPane(column.id)) {
            threadPane.restoreSortIndicator();
          }
        }
        break;
    }
  },
  sortByThread() {
    threadPane.updateListRole(false);
    gViewWrapper.showThreaded = true;
    this.sortThreadPane("dateCol");
  },
  /**
   * Sorts the thread pane by the provided columnId.
   *
   * @param {string} newSortColumnId
   * @returns {boolean} if sorting was successful
   */
  sortThreadPane(newSortColumnId) {
    const newSortColumn = threadPane.columns.find(
      c => c.sortKey && c.id == newSortColumnId
    );
    if (!newSortColumn) {
      return false;
    }
    const newSortType = Ci.nsMsgViewSortType[newSortColumn.sortKey];

    const grouped = gViewWrapper.showGroupedBySort;
    gViewWrapper._threadExpandAll = Boolean(
      gViewWrapper._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    );

    if (!grouped) {
      threadTree.style.scrollBehavior = "auto"; // Avoid smooth scroll.
      gViewWrapper.sort(newSortColumnId, Ci.nsMsgViewSortOrder.ascending);
      threadTree.style.scrollBehavior = null;
      // Respect user's last expandAll/collapseAll choice, post sort direction change.
      threadPane.restoreThreadState();
      return true;
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
    // Note: this.dbView still remembers the last secondery sort, before group
    // sort was entered. If we do not specify a secondary sort here, dbView.open()
    // will use the new primary sort and the old (!) secondary sort. Let's push
    // the current primary sort as the new secondary sort. The clocking mechanism
    // in DBViewWrapper._createView() will then do the right thing.
    const [curPrimarySort] = gViewWrapper._sort;
    gViewWrapper._sort = [
      [newSortType, Ci.nsMsgViewSortOrder.ascending, newSortColumnId],
      curPrimarySort,
    ];
    gViewWrapper.showGroupedBySort = false;
    gViewWrapper.endViewUpdate();
    return true;
  },
  reverseSortThreadPane() {
    const grouped = gViewWrapper.showGroupedBySort;
    gViewWrapper._threadExpandAll = Boolean(
      gViewWrapper._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    );

    // Grouped By view is special for column click sort direction changes.
    if (grouped) {
      if (gDBView.selection.count) {
        threadPane.saveSelection();
      }

      if (gViewWrapper.isSingleFolder) {
        if (gViewWrapper.isVirtual || gViewWrapper.search.hasSearchTerms) {
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
      if (
        gViewWrapper.isSingleFolder &&
        (gViewWrapper.isVirtual || gViewWrapper.search.hasSearchTerms)
      ) {
        this.groupBySort();
      }
      // Restore Grouped By selection post sort direction change.
      threadPane.restoreSelection();
      // Refresh dummy rows in case of collapseAll.
      threadTree.invalidate();
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
    threadPane.restoreThreadState(!gViewWrapper.isSingleFolder);
  },
  groupBySort() {
    threadPane.updateListRole(false);
    // Similar to reverting grouped-by-sort in this.sortThreadPane(), rebuild
    // the view even for multi-folder search views. These views could
    // technically handle this themselves by just having their view flags set,
    // but they are currently unable to cope with sort types that are invalid
    // in grouped-by-sort (such as bySize).
    gViewWrapper.beginViewUpdate();
    gViewWrapper.showGroupedBySort = true;
    gViewWrapper.endViewUpdate();
    threadPane.restoreThreadState(!gViewWrapper.isSingleFolder);
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
    threadPane.ensureThreadStateForQuickSearchView();
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
    threadPane.ensureThreadStateForQuickSearchView();
    threadTree.style.scrollBehavior = null;
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
    gViewWrapper._threadExpandAll = true;
    threadPane.restoreSelection();
  },
  () => !!gViewWrapper?.dbView
);
commandController.registerCallback(
  "cmd_collapseAllThreads",
  () => {
    threadPane.saveSelection();
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
    gViewWrapper._threadExpandAll = false;
    threadPane.restoreSelection({ expand: false });
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
    const PrintUtils = top.PrintUtils;
    if (!webBrowser.hidden) {
      PrintUtils.startPrintWindow(webBrowser.browsingContext);
      return;
    }
    const uris = gViewWrapper.dbView.getURIsForSelection();
    if (uris.length == 1) {
      if (messageBrowser.hidden) {
        // Load the only message in a hidden browser, then use the print preview UI.
        const messageService = MailServices.messageServiceFromURI(uris[0]);
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
    const ps = PrintUtils.getPrintSettings();
    Cc["@mozilla.org/widget/printdialog-service;1"]
      .getService(Ci.nsIPrintDialogService)
      .showPrintDialog(window, false, ps);
    if (ps.isCancelled) {
      return;
    }
    ps.printSilent = true;

    for (const uri of uris) {
      const messageService = MailServices.messageServiceFromURI(uri);
      await PrintUtils.loadPrintBrowser(messageService.getUrlForUri(uri).spec);
      await PrintUtils.printBrowser.browsingContext.print(ps);
    }
  },
  () => {
    if (!accountCentralBrowser?.hidden) {
      return false;
    }
    if (webBrowser && !webBrowser.hidden) {
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
    // Delaying to an animation frame to avoid synchronously flushing from the
    // context menu.
    window.requestAnimationFrame(() => {
      threadPane.hideIgnoredMessageNotification();
      const folder =
        gViewWrapper.isVirtual && gViewWrapper.isSingleFolder
          ? gViewWrapper._underlyingFolders[0]
          : gFolder;
      if (!folder.msgDatabase.isIgnored(gDBView.keyForFirstSelectedMessage)) {
        threadPane.showIgnoredMessageNotification(
          gDBView.getSelectedMsgHdrs(),
          false
        );
      }
      commandController._navigate(Ci.nsMsgNavigationType.toggleThreadKilled);
      // Invalidation should be unnecessary but the back end doesn't notify us
      // properly and resists attempts to fix this.
      threadTree.reset();
    });
  },
  () => gDBView?.numSelected >= 1 && gFolder && !gViewWrapper.isMultiFolder
);
commandController.registerCallback(
  "cmd_killSubthread",
  () => {
    // Delaying to an animation frame to avoid synchronously flushing from the
    // context menu.
    window.requestAnimationFrame(() => {
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
    });
  },
  () => gDBView?.numSelected >= 1 && gFolder && !gViewWrapper.isMultiFolder
);

/* Forward find commands to about:message if message view is open, otherwise
 * create (if not already created) findbars for web and multi message view
 * and call the attached find commands. We create the findbars inline here
 * because adding them to the HTML initializes and additional Finder, which
 * the findbar then uses, but doesn't attach any event listeners to. This
 * causes the findbar to not update with a result status properly. */
commandController.registerCallback(
  "cmd_find",
  () => {
    if (!this.messageBrowser.hidden) {
      this.messageBrowser.contentWindow.commandController.doCommand("cmd_find");
      return;
    }

    if (!this.multiMessageBrowser.hidden) {
      // Create the findbar for the multi message view if it isn't there.
      if (!document.getElementById("multiMessageViewFindToolbar")) {
        const findbar = document.createXULElement("findbar");
        findbar.setAttribute("id", "multiMessageViewFindToolbar");
        findbar.setAttribute("browserid", "multiMessageBrowser");
        this.multiMessageBrowser.after(findbar);
      }

      document.getElementById("multiMessageViewFindToolbar").onFindCommand();
      return;
    }

    if (!this.webBrowser.hidden) {
      // Create the findbar for the web browser if it isn't there.
      if (!document.getElementById("webBrowserFindToolbar")) {
        const findbar = document.createXULElement("findbar");
        findbar.setAttribute("id", "webBrowserFindToolbar");
        findbar.setAttribute("browserid", "webBrowser");
        this.webBrowser.after(findbar);
      }
      document.getElementById("webBrowserFindToolbar").onFindCommand();
    }
  },
  () => browserPaneVisible()
);
commandController.registerCallback(
  "cmd_findAgain",
  () => {
    if (!this.messageBrowser.hidden) {
      this.messageBrowser.contentWindow.commandController.doCommand(
        "cmd_findAgain"
      );
      return;
    }

    if (!this.multiMessageBrowser.hidden) {
      document
        .getElementById("multiMessageViewFindToolbar")
        .onFindAgainCommand(false);
      return;
    }

    if (!this.webBrowser.hidden) {
      document
        .getElementById("webBrowserFindToolbar")
        .onFindAgainCommand(false);
    }
  },
  () => browserPaneVisible()
);
commandController.registerCallback(
  "cmd_findPrevious",
  () => {
    if (!this.messageBrowser.hidden) {
      this.messageBrowser.contentWindow.commandController.doCommand(
        "cmd_findPrevious"
      );
      return;
    }

    if (!this.multiMessageBrowser.hidden) {
      document
        .getElementById("multiMessageViewFindToolbar")
        .onFindAgainCommand(true);
      return;
    }

    if (!this.webBrowser.hidden) {
      document.getElementById("webBrowserFindToolbar").onFindAgainCommand(true);
    }
  },
  () => browserPaneVisible()
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

/**
 * Helper function that returns true if one of the three browser panes are
 * visible, and false otherwise.
 *
 * @returns {boolean} - Whether a browser pane is visible or not.
 */
function browserPaneVisible() {
  return (
    (webBrowser && !webBrowser.hidden) ||
    (messageBrowser && !messageBrowser.hidden) ||
    (multiMessageBrowser && !multiMessageBrowser.hidden)
  );
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
  () => webBrowser && !webBrowser.busy
);
commandController.registerCallback(
  "cmd_stop",
  () => webBrowser.stop(),
  () => webBrowser && webBrowser.busy
);

// Attachments commands.
for (const command of [
  "cmd_openAllAttachments",
  "cmd_saveAllAttachments",
  "cmd_detachAllAttachments",
  "cmd_deleteAllAttachments",
]) {
  commandController.registerCallback(
    command,
    () => messageBrowser.contentWindow.commandController.doCommand(command),
    () =>
      messageBrowser &&
      !messageBrowser.hidden &&
      messageBrowser.contentWindow.commandController.isCommandEnabled(command)
  );
}
