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
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
  MailE10SUtils: "resource:///modules/MailE10SUtils.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  repairMbox: "resource:///modules/MboxRepair.sys.mjs",
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
 * HTML body element handling the general layout of the about3pane.
 */
var paneLayout;

/**
 * HTML element handling the swap between message, multimessage, and browser
 * XUL views.
 */
var messagePane;

/**
 * A Promise with resolvers, indicating if DOMContentLoaded has finished.
 */
var hasDOMContentLoaded = Promise.withResolvers();

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
  await customElements.whenDefined("pane-layout");
  await customElements.whenDefined("message-pane");
  await customElements.whenDefined("tree-view-table-row");
  await customElements.whenDefined("folder-tree-row");
  await customElements.whenDefined("thread-row");
  await customElements.whenDefined("thread-card");
  await customElements.whenDefined("tree-view");
  await customElements.whenDefined("tree-listbox");

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);

  messagePane = document.getElementById("messagePane");
  messagePane.addEventListener("request-count-update", threadPaneHeader);
  messagePane.addEventListener("show-single-message", threadPane);

  paneLayout = document.getElementById("paneLayout");
  paneLayout.addEventListener("request-message-clear", messagePane);
  paneLayout.addEventListener("request-message-selection", threadPane);

  folderTree = document.getElementById("folderTree");
  accountCentralBrowser = document.getElementById("accountCentralBrowser");

  folderPaneContextMenu.init();
  await folderPane.init();
  await threadPane.init();
  threadPaneHeader.init();
  await messagePane.isReady();
  webBrowser = messagePane.webBrowser;
  messageBrowser = messagePane.messageBrowser;
  multiMessageBrowser = messagePane.multiMessageBrowser;

  // Attach the progress listener for the webBrowser. For the messageBrowser this
  // happens in the "aboutMessageLoaded" event from aboutMessage.js.
  // For the webBrowser, we can do it here directly.
  top.contentProgress.addProgressListenerToBrowser(webBrowser);

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

  // Delay initial folder selection until after the message list's resize
  // observer has had a chance to respond to layout changes. Otherwise we
  // might end up scrolling to the wrong part of the list.
  await new Promise(resolve => setTimeout(resolve));
  folderTree.dispatchEvent(new CustomEvent("select"));

  mailContextMenu.init();

  CalMetronome.on("day", refreshGroupedBySortView);

  updateZoomCommands();

  // Update the state of the about:3pane being fully loaded.
  hasDOMContentLoaded.resolve();
});

window.addEventListener("unload", () => {
  CalMetronome.off("day", refreshGroupedBySortView);
  MailServices.mailSession.RemoveFolderListener(folderListener);
  MailServices.mailSession.removeUserFeedbackListener(userFeedbackListener);
  gViewWrapper?.close();
  folderPane.uninit();
  threadPane.uninit();
  threadPaneHeader.uninit();
});

var folderPaneContextMenu = {
  /**
   * @type {XULPopupElement}
   */
  _menupopup: null,

  /**
   * Commands handled by commandController.
   *
   * @type {object} - An object {Object.<string, string>}
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
   * @type {object} - An object {Object.<string, boolean>|null}
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
    if (
      !this.activeFolder ||
      FolderUtils.isSmartTagsFolder(this.activeFolder)
    ) {
      return false;
    }

    if (this._commandStates !== null) {
      return this._commandStates[command];
    }

    let canCompact;
    let isCompactEnabled;
    let canCreateSubfolders;
    let canRename;
    let isServer;
    let isNNTP;
    let isJunk;
    let isVirtual;
    let isInbox;
    let isSpecialUse;
    let canRenameDeleteJunkMail;
    let isSmartTagsFolder;
    let deletable;
    let server;
    let URI;
    let flags;
    let online;

    const multiSelection =
      folderTree.selection.size > 1 && !this._overrideFolder;
    if (multiSelection) {
      canCreateSubfolders = false;
      canRename = false;
      isSmartTagsFolder = false;
      isSpecialUse = true;
      isInbox = false;

      // Set some variables to TRUE to help during the folder lookup loop.
      online = true;
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

        online &&= !Services.io.offline && !folder.server.offlineSupportLevel;

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
      } = this.activeFolder);
      online =
        !Services.io.offline || !this.activeFolder.server.offlineSupportLevel;
      isCompactEnabled =
        this.activeFolder.isCommandEnabled("cmd_compactFolder");
      isNNTP = server.type == "nntp";
      isJunk = flags & Ci.nsMsgFolderFlags.Junk;
      isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
      isInbox = flags & Ci.nsMsgFolderFlags.Inbox;
      isSpecialUse = flags & Ci.nsMsgFolderFlags.SpecialUse;
      canRenameDeleteJunkMail = FolderUtils.canRenameDeleteJunkMail(URI);
      isSmartTagsFolder = FolderUtils.isSmartTagsFolder(this.activeFolder);
    }

    if (isNNTP && !isServer) {
      // `folderPane.deleteFolder` has a special case for this.
      deletable = true;
    }

    this._commandStates = {
      cmd_newFolder: online && ((!isNNTP && canCreateSubfolders) || isInbox),
      cmd_deleteFolder:
        online && (isJunk ? canRenameDeleteJunkMail : deletable),
      cmd_renameFolder:
        online &&
        ((!isServer && canRename && !isSpecialUse) ||
          isVirtual ||
          (isJunk && canRenameDeleteJunkMail)),
      cmd_compactFolder:
        !isVirtual && !isNNTP && (isServer || canCompact) && isCompactEnabled,
      cmd_emptyTrash: online && !isNNTP,
      cmd_properties: !multiSelection && !isServer && !isSmartTagsFolder,
      cmd_toggleFavoriteFolder:
        !multiSelection && !isServer && !isSmartTagsFolder,
    };
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
    const hasNoSearchTerms = () => {
      if (!isVirtual) {
        return true;
      }
      const wrapper = VirtualFolderHelper.wrapVirtualFolder(folder);
      const noSearchTerms = ["", "ALL"].includes(wrapper.searchString);
      wrapper.cleanUpMessageDatabase();
      return noSearchTerms;
    };

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
      !isServer &&
        !isSmartTagsFolder &&
        hasNoSearchTerms() &&
        serverType != "nntp"
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

    this._showMenuItem("folderPaneContext-resetSort", isServer);

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
        const rootURI = MailUtils.getOrCreateFolder(folder.rootFolder.URI);
        movePopup.parentFolder = rootURI;
      }
    } else {
      // Non-virtual. Don't allow move or copy of special use or root folder.
      const okToMoveCopy =
        !isServer &&
        !(flags & Ci.nsMsgFolderFlags.SpecialUse) &&
        serverType != "nntp" &&
        (!Services.io.offline || !folder.server.offlineSupportLevel);
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
    this._showMenuItem("folderPaneContext-resetSort", false);

    // Show only the standard commands that don't require special conditions.
    this._showMenuItem("folderPaneContext-openNewTab", true);
    this._showMenuItem("folderPaneContext-openNewWindow", true);
    this._showMenuItem("folderPaneContext-markMailFolderAllRead", true);

    const folders = [...folderTree.selection.values()].map(row =>
      MailServices.folderLookup.getFolderForURL(row.uri)
    );
    const hasSpecial = folders.some(folder => {
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
    const online =
      !Services.io.offline || folders.every(f => !f.server.offlineSupportLevel);

    // Show the move and copy items only if we don't have any special folder in
    // the selection range.
    this._showMenuItem("folderPaneContext-moveMenu", !hasSpecial && online);
    this._showMenuItem("folderPaneContext-copyMenu", !hasSpecial && online);

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
   * Do the folder transfer, move or copy.
   *
   * @param {boolean} isMove
   * @param {nsIMsgFolder} sourceFolder
   * @param {nsIMsgFolder} targetFolder
   * @param {nsIMsgCopyServiceListener} [listener]
   */
  transferFolder(isMove, sourceFolder, targetFolder, listener = null) {
    // Do the transfer. A slight delay in calling copyFolder() helps the
    // folder-menupopup chain of items get properly closed so the next folder
    // context popup can occur.
    setTimeout(() =>
      MailServices.copy.copyFolder(
        sourceFolder,
        targetFolder,
        isMove,
        listener,
        top.msgWindow
      )
    );
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
        topChromeWindow.searchAllMessages(folder);
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
      case "folderPaneContext-resetSort":
        folderPane.clearUserSortOrder(folder);
        break;
      default: {
        // Handle folder context menu items move to, copy to.
        const isMove = !!event.target.closest("#folderPaneContext-moveMenu");
        const isCopy = !!event.target.closest("#folderPaneContext-copyMenu");

        if (!isMove && !isCopy) {
          return;
        }

        const targetFolder = event.target._folder;
        this.transferFolder(isMove, folder, targetFolder);
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
  /**
   * If the folder pane has been initialized.
   *
   * @type {boolean}
   */
  _initialized: false,

  /**
   * The drop indicator used when manually sorting folders.
   *
   * @type {?HTMLImageElement}
   */
  _dropIndicator: null,

  /**
   * If the local folders should be hidden.
   *
   * @type {boolean}
   */
  _hideLocalFolders: false,

  _autoExpandedRows: [],

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
        // Prevent "Empty Trash on Exit" for POP3 accounts from changing the
        // collapsed state when the trash folder is replaced by an empty one.
        if (MailServices.accounts.shutdownInProgress) {
          return;
        }
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
          // Likely, the folder got created before the account root folder was
          // associated with any server. Should make sure the server is
          // assigned to an account before creating folders on the server.
          throw new Error(`No parentRow for ${parentFolder.URI}`);
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
        if (this._smartMailbox) {
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
        const subFolders = folderPane._getSubFolders(parentFolder);

        subFolders.sort(FolderUtils.compareFolders);

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
          const folder = this._smartMailbox.getTagFolder(tag);
          if (!folder) {
            continue;
          }
          this.containerList.appendChild(
            folderPane._createTagRow(this.name, folder, tag)
          );
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
        if (!folder) {
          return;
        }

        const row = folderPane.getRowForFolder(folder);
        folder.name = tag.tag;
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
   *
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

    this._dropIndicator = document.getElementById("dropIndicator");
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
    MailServices.mailSession.addUserFeedbackListener(userFeedbackListener);

    Services.prefs.addObserver("mail.accountmanager.accounts", this);
    Services.prefs.addObserver("mailnews.tags.", this);

    Services.obs.addObserver(this, "folder-color-changed");
    Services.obs.addObserver(this, "folder-color-preview");
    Services.obs.addObserver(this, "server-color-changed");
    Services.obs.addObserver(this, "server-color-preview");
    Services.obs.addObserver(this, "search-folders-changed");
    Services.obs.addObserver(this, "folder-properties-changed");
    Services.obs.addObserver(this, "folder-needs-repair");
    Services.obs.addObserver(this, "folder-strings-changed");
    Services.obs.addObserver(this, "server-connection-succeeded");

    folderTree.addEventListener("auxclick", this);
    folderTree.addEventListener("contextmenu", this);
    folderTree.addEventListener("collapsed", this);
    folderTree.addEventListener("expanded", this);
    folderTree.addEventListener("dragstart", this);
    folderTree.addEventListener("dragover", this);
    folderTree.addEventListener("dragleave", this);
    folderTree.addEventListener("drop", this);
    folderTree.addEventListener("dragend", this);

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
    Services.obs.removeObserver(this, "folder-needs-repair");
    Services.obs.removeObserver(this, "folder-strings-changed");
    Services.obs.removeObserver(this, "server-connection-succeeded");
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
        this._onDragLeave(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
      case "dragend":
        this._onDragEnd(event);
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
      case "folder-needs-repair": {
        const folder = subject.QueryInterface(Ci.nsIMsgFolder);
        console.warn("caught folder-needs-repair for " + folder.URI);
        this.rebuildFolderSummary(folder);
        break;
      }
      case "folder-strings-changed":
        for (const row of folderTree.querySelectorAll(
          `li[is="folder-tree-row"]:not([data-server-type])`
        )) {
          row.updateFolderNames();
        }
        break;
      case "server-connection-succeeded": {
        let server;
        try {
          server = MailServices.accounts.findServerByURI(subject);
        } catch (ex) {
          console.error(ex);
          return;
        }
        folderPane._changeRows(server.rootFolder, row =>
          row.classList.remove("tls-error")
        );
        break;
      }
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
   * @param {boolean} value - True if local folders should be hidden.
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
   *
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
   * @param {Event} _event - The DOMEvent.
   */
  moveFolderModeUp(_event) {
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
   * @param {Event} _event - The DOMEvent.
   */
  moveFolderModeDown(_event) {
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
        console.warn(`Error initiating ${mode.name} mode.`, e);
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

    if (mode.name == "favorite") {
      // Add favorite unified folders as well.
      const smartServer = MailServices.accounts.findServer(
        "nobody",
        "smart mailboxes",
        "none"
      );
      if (smartServer) {
        mode.initServer(smartServer);
      }
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
    row.setFolder(
      folder,
      nameStyle,
      this._isCompact && this._modes[modeName].canBeCompact
    );
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

      if (
        FolderUtils.folderNameCollator.compare(row.name, serverRow.name) > 0
      ) {
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
   * @param {boolean} [childAlreadyGone=false] - Is this function being called
   *   to remove the parent of a row that's already been removed?
   */
  _removeFolderAndAncestors(
    folder,
    modeName,
    filterFunction,
    childAlreadyGone = false
  ) {
    // This may be the parent of the folder actually removed. Do not proceed
    // if it matches the mode.
    if (childAlreadyGone && filterFunction?.(folder)) {
      return;
    }

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
    if (parentFolder && !filterFunction?.(parentFolder)) {
      this._removeFolderAndAncestors(parentFolder, modeName, filterFunction);
    }

    // Remove the row for this folder.
    folderRow.remove();

    const parentRow = folderPane.getRowForFolder(parentFolder, modeName);
    if (parentRow?.childList.childElementCount == 0) {
      folderTree.expandRow(parentRow);
    }
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
    const subFolders = this._getSubFolders(parentFolder);

    subFolders.sort(FolderUtils.compareFolders);

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
   * Get the first row inside a specific mode, even if it is hidden.
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
   * @param {nsIMsgFolder} folder - The target folder.
   * @param {nsMsgFolderFlags} oldValue - The old flag value.
   * @param {nsMsgFolderFlags} newValue - The updated flag value.
   */
  changeFolderFlag(folder, oldValue, newValue) {
    this._forAllActiveModes("changeFolderFlag", folder, oldValue, newValue);
    this._changeRows(folder, row => {
      row.setFolderTypeFromFolder(folder);
      row.updateFolderNames(folder);
    });
  },

  /**
   * Update the list of folders to reflect current properties.
   *
   * @param {nsIMsgFolder} folder - The folder whose data to use.
   */
  updateFolderProperties(folder) {
    this._forAllActiveModes("updateFolderProperties", folder);
    this._changeRows(folder, row => row.setFolderPropertiesFromFolder(folder));
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
      document.title = `${gFolder.localizedName} - ${gFolder.server.prettyName}`;
      document.body.classList.remove("account-central");
      accountCentralBrowser.hidden = true;

      threadPane.restoreColumns();

      gViewWrapper = new DBViewWrapper(dbViewWrapperListener);

      threadPane.scrollToNewMessage =
        !(gFolder.flags & Ci.nsMsgFolderFlags.Virtual) &&
        gFolder.hasNewMessages &&
        Services.prefs.getBoolPref("mailnews.scroll_to_new_message");
      if (threadPane.scrollToNewMessage) {
        threadPane.forgetSavedSelection(uri);
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
    const draggedRow = event.target.closest(`li[is="folder-tree-row"]`);
    if (!draggedRow) {
      event.preventDefault();
      return;
    }

    // If the currently dragged row is not part of the selection map, use it
    // instead of the current selection entries.
    const rows = folderTree.selection.has(folderTree.rows.indexOf(draggedRow))
      ? [...folderTree.selection.values()]
      : [draggedRow];

    const folders = rows.map(row =>
      MailServices.folderLookup.getFolderForURL(row.uri)
    );

    // We don't allow dragging server rows, or mixing folder types.
    if (
      folders.some(f => f.isServer || f.server.type != folders[0].server.type)
    ) {
      event.preventDefault();
      return;
    }
    // We don't allow dragging non-local folders while offline.
    if (
      Services.io.offline &&
      folders.some(f => f.server.offlineSupportLevel)
    ) {
      event.preventDefault();
      return;
    }

    for (const row of rows) {
      row.classList.add("drag-target");
    }

    for (const [index, folder] of folders.entries()) {
      event.dataTransfer.mozSetDataAt("text/x-moz-folder", folder, index);
    }
    event.dataTransfer.effectAllowed = folders.some(
      f => f.server.type == "nntp"
    )
      ? "move"
      : "copyMove";
  },

  _onDragOver(event) {
    const systemDropEffect = event.dataTransfer.dropEffect;

    event.dataTransfer.dropEffect = "none";
    event.preventDefault();

    const row = event.target.closest("li");
    this._timedExpand(row);
    if (!row) {
      return;
    }
    this._clearCollapseTimer();

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
      event.dataTransfer.dropEffect =
        systemDropEffect == "copy" ? "copy" : "move";
    } else if (types.includes("text/x-moz-folder")) {
      let allowReorderOnly = !targetFolder.canCreateSubfolders;
      let moveWithinSameServer = systemDropEffect == "move";
      for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
        const sourceFolder = event.dataTransfer
          .mozGetDataAt("text/x-moz-folder", i)
          .QueryInterface(Ci.nsIMsgFolder);

        // Don't allow to drop on itself.
        if (targetFolder == sourceFolder) {
          return;
        }
        const sameServer = sourceFolder.server == targetFolder.server;
        // Don't allow immediate child to be dropped onto its parent.
        if (targetFolder == sourceFolder.parent) {
          return;
        }
        // Don't allow dragging of virtual folders across accounts.
        if (sourceFolder.getFlag(Ci.nsMsgFolderFlags.Virtual) && !sameServer) {
          return;
        }
        // Don't allow parent to be dropped on its ancestors.
        if (sourceFolder.isAncestorOf(targetFolder)) {
          return;
        }
        // If there is a folder that can't be renamed, don't allow it to be
        // dropped if it is not to "Local Folders" or is to the same account.
        const noRenamePossible =
          !sourceFolder.canRename &&
          (targetFolder.server.type != "none" || sameServer);
        // Don't allow to drop on different hierarchy.
        if (noRenamePossible && sourceFolder.parent != targetFolder.parent) {
          return;
        }
        // If in the same hierarchy, allow only reordering.
        allowReorderOnly ||= noRenamePossible;
        moveWithinSameServer &&= sameServer;
      }

      // Evaluate the ability to reorder folders.
      // * Let's keep it simple. Don't allow "insert" when dragging multiple
      //   folders.
      // * Also, only allow it in "all" mode. Otherwise there is ambiguity.
      if (
        moveWithinSameServer &&
        !targetFolder.isServer &&
        event.dataTransfer.mozItemCount == 1 &&
        row.modeName == "all"
      ) {
        const {
          targetCenter,
          quarterOfHeight,
          targetTop,
          targetBottom,
          targetInline,
        } = this._calculateElementPosition(row);
        if (event.clientY < targetCenter - quarterOfHeight) {
          // Insert before the target.
          this._clearDropTarget();
          this._dropIndicator.show(targetTop, targetInline);
          event.dataTransfer.dropEffect = "move";
          return;
        }
        if (
          event.clientY > targetCenter + quarterOfHeight &&
          (!row.classList.contains("children") ||
            row.classList.contains("collapsed"))
        ) {
          // Insert after the target.
          this._clearDropTarget();
          this._dropIndicator.show(targetBottom, targetInline);
          event.dataTransfer.dropEffect = "move";
          return;
        }
      }

      if (allowReorderOnly) {
        return;
      }

      event.dataTransfer.dropEffect =
        systemDropEffect == "copy" ? "copy" : "move";
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

  _onDragLeave(event) {
    this._timedExpand();
    this._setCollapseTimer();
    this._clearDropTarget(event);
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
      this._autoExpandedRows.push(this._expandRow);
      folderTree.expandRow(this._expandRow);
      delete this._expandRow;
      delete this._expandTimer;
    }, 1000);
  },

  /**
   * Set a timer to collapse all auto-expanded rows in 1000ms.
   */
  _setCollapseTimer() {
    this._collapseTimer = setTimeout(() => {
      this._collapseAutoExpandedRows();
      delete this._collapseTimer;
    }, 1000);
  },

  /**
   * Clear the timer to collapse all auto-expanded rows..
   */
  _clearCollapseTimer() {
    if (this._collapseTimer) {
      clearTimeout(this._collapseTimer);
      delete this._collapseTimer;
    }
  },

  /**
   * Clear the visual indicators for drag and drop operations on the folder
   * pane.
   */
  _clearDropTarget() {
    folderTree.querySelector(".drop-target")?.classList.remove("drop-target");
    this._dropIndicator.hide();
  },

  /**
   * Clear the visual indicators for drag and drop operations on the folder
   * pane.
   */
  _clearDragTarget() {
    for (const row of folderTree.querySelectorAll(".drag-target")) {
      row.classList.remove("drag-target");
    }
  },

  _collapseAutoExpandedRows() {
    while (this._autoExpandedRows.length) {
      for (const row of this._autoExpandedRows) {
        folderTree.collapseRow(row);
      }
      this._autoExpandedRows.length = 0;
      this._clearCollapseTimer();
    }
  },

  /**
   * @typedef {object} ElementPosition
   * @property {number} targetCenter - The center value of the element relative
   *   to the parent container.
   * @property {number} quarterOfHeight - The 1/4 of height of the element.
   * @property {number} targetTop - The top value of the element relative
   *   to the parent container.
   * @property {number} targetBottom - The bottom value of the element relative
   *   to the parent container.
   * @property {number} targetInline - The inline value of folder icon relative
   *   to the parent container.
   */
  /**
   * Calculate the needed values to properly position a drop target during
   * folders reordering.
   *
   * @param {FolderTreeRow} row
   * @returns {ElementPosition}
   */
  _calculateElementPosition(row) {
    const targetElement = row.querySelector(".container") ?? row;
    const targetRect = targetElement.getBoundingClientRect();
    // Include the top border width for the position since this could be changed
    // by themes or userChrome.
    const targetTop = targetRect.top + targetElement.clientTop;
    // Add 1/2 of the top border to the bottom value in order to account for the
    // half a pixel shift that can manifest between 2 elements with borders.
    const targetBottom =
      targetTop + targetElement.offsetHeight + targetElement.clientTop / 2;
    const targetCenter = targetTop + targetElement.offsetHeight / 2;
    const quarterOfHeight = targetElement.offsetHeight / 4;

    const iconRect = targetElement
      .querySelector(".icon")
      .getBoundingClientRect();
    const targetInline =
      document.dir == "rtl" ? targetRect.right - iconRect.right : iconRect.left;

    return {
      targetCenter,
      quarterOfHeight,
      targetTop,
      targetBottom,
      targetInline,
    };
  },

  _onDrop(event) {
    this._timedExpand();
    this._clearDropTarget();
    this._clearDragTarget();
    this._autoExpandedRows.length = 0;
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
      const rows = [];
      const isMove = event.dataTransfer.dropEffect == "move";
      if (event.dataTransfer.mozItemCount == 1) {
        // Only one folder was dragged and dropped.
        // If the dropped Y-coordinate is near the center of the targetFolder,
        // simply move it into the targetFolder. Otherwise, reorder the dropped
        // folder above or below the targetFolder.

        const sourceFolder = event.dataTransfer
          .mozGetDataAt("text/x-moz-folder", 0)
          .QueryInterface(Ci.nsIMsgFolder);

        let destinationFolder = targetFolder;

        let isReordering = false;
        let insertAfter = false;
        // Only allow moving a folder in "all" mode, otherwise it would be
        // impossible to reorder folders unambiguously.
        if (
          isMove &&
          targetFolder.parent &&
          sourceFolder.server == targetFolder.server &&
          !targetFolder.isServer &&
          row.modeName == "all"
        ) {
          const { targetCenter, quarterOfHeight } =
            this._calculateElementPosition(row);
          const upperElementEnd =
            event.clientY < targetCenter - quarterOfHeight;
          const lowerElementEndWithoutChildren =
            event.clientY > targetCenter + quarterOfHeight &&
            (!row.classList.contains("children") ||
              row.classList.contains("collapsed"));
          isReordering = upperElementEnd || lowerElementEndWithoutChildren;
          insertAfter = lowerElementEndWithoutChildren;
          if (isReordering) {
            // To insert the sourceFolder before or after the targetFolder,
            // we have to transfer sourceFolder to the parent of targetFolder
            // as a sibling of targetFolder. If it is the same as the current
            // parent, there is no need to perform the transferFolder, so let
            // destinationFolder be null.
            destinationFolder =
              targetFolder.parent != sourceFolder.parent
                ? targetFolder.parent
                : null;
          }
        }

        if (destinationFolder) {
          // Move sourceFolder to a different parent.

          // Reset the sort order of sourceFolder before moving it.
          sourceFolder.userSortOrder = Ci.nsIMsgFolder.NO_SORT_VALUE;
          // Start the move. This is done in an asynchronous process, so order
          // them in the listener that will be called when the move is complete.
          folderPaneContextMenu.transferFolder(
            isMove,
            sourceFolder,
            destinationFolder,
            isReordering
              ? new ReorderFolderListener(
                  sourceFolder,
                  targetFolder,
                  insertAfter
                )
              : null
          );

          // Save in prefs the destination folder URI and if this was a move
          // or copy.
          // This is to fill in the next folder or message context menu item
          // "Move|Copy to <DestinationFolderName> Again".
          Services.prefs.setStringPref(
            "mail.last_msg_movecopy_target_uri",
            destinationFolder.URI
          );
        } else if (isReordering) {
          // Reorder within current siblings.
          this.insertFolder(sourceFolder, targetFolder, insertAfter);
          if (folderTree.selection.has(folderTree.rows.indexOf(row))) {
            rows.push(this.getRowForFolder(sourceFolder.URI, row.modeName));
          }
        }
        Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
      } else {
        // FIXME! Bug 1896531.
        console.warn(
          "Bug 1896531. Copy and move for multiselection is only partially supported and it might fail."
        );

        for (let i = 0; i < event.dataTransfer.mozItemCount; i++) {
          const sourceFolder = event.dataTransfer
            .mozGetDataAt("text/x-moz-folder", i)
            .QueryInterface(Ci.nsIMsgFolder);

          folderPaneContextMenu.transferFolder(
            isMove,
            sourceFolder,
            targetFolder
          );
          rows.push(this.getRowForFolder(sourceFolder.URI, row.modeName));
        }
        // Save in prefs the target folder URI and if this was a move or copy.
        // This is to fill in the next folder or message context menu item
        // "Move|Copy to <TargetFolderName> Again".
        Services.prefs.setStringPref(
          "mail.last_msg_movecopy_target_uri",
          targetFolder.URI
        );
        Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
      }
      this.swapFolderSelection(rows);
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

  _onDragEnd(event) {
    this._clearDragTarget();
    this._clearDropTarget();
    if (event.dataTransfer.dropEffect != "none") {
      return;
    }
    folderPane._timedExpand();
    folderPane._collapseAutoExpandedRows();
  },

  /**
   * Opens the dialog to create a new sub-folder, and creates it if the user
   * accepts.
   *
   * @param {nsIMsgFolder} folder - The parent for the new subfolder.
   */
  newFolder(folder) {
    // Make sure we actually can create subfolders.
    if (!folder.canCreateSubfolders) {
      // Check if we can create them at the root, otherwise use the default
      // account as root folder.
      const rootMsgFolder = folder.server.rootMsgFolder;
      folder = rootMsgFolder.canCreateSubfolders
        ? rootMsgFolder
        : top.GetDefaultAccountRootFolder();
    }

    let dualUseFolders = true;
    if (folder.server instanceof Ci.nsIImapIncomingServer) {
      dualUseFolders = folder.server.dualUseFolders;
    }

    /**
     * Callback executed when the user selects OK in the create folder dialog.
     *
     * @param {string} subfolderName
     * @param {nsIMsgFolder} parentFolder
     */
    const newFolderOkCallback = async (subfolderName, parentFolder) => {
      // TODO: Rewrite this logic and also move the opening of alert dialogs from
      // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
      if (!subfolderName) {
        return;
      }

      const promiseNewFolder = new Promise(resolve => {
        const listener = {
          folderAdded: addedFolder => {
            if (addedFolder.localizedName == subfolderName) {
              MailServices.mfn.removeListener(listener);
              resolve(addedFolder);
            }
          },
        };
        MailServices.mfn.addListener(
          listener,
          Ci.nsIMsgFolderNotificationService.folderAdded
        );
      });
      parentFolder.createSubfolder(subfolderName, top.msgWindow);
      const newFolder = await promiseNewFolder;
      if (!parentFolder.isServer) {
        // Inherit view/sort/columns from parent folder.
        const parentInfo = parentFolder.msgDatabase.dBFolderInfo;
        const newInfo = newFolder.msgDatabase.dBFolderInfo;
        newInfo.viewFlags = parentInfo.viewFlags;
        newInfo.sortType = parentInfo.sortType;
        newInfo.sortOrder = parentInfo.sortOrder;
        newInfo.setCharProperty(
          "columnStates",
          parentInfo.getCharProperty("columnStates")
        );
      }
      newFolder.updateTimestamps(true);
    };

    window.openDialog(
      "chrome://messenger/content/newFolderDialog.xhtml",
      "",
      "chrome,modal,resizable=no,centerscreen",
      { folder, dualUseFolders, okCallback: newFolderOkCallback }
    );
  },

  async rebuildFolderSummary(folder) {
    if (folder.locked) {
      folder.throwAlertMsg("operationFailedFolderBusy", top.msgWindow);
      return;
    }
    if (folder.supportsOffline) {
      // Remove the offline store, if any.
      await IOUtils.remove(folder.filePath.path, { recursive: true }).catch(
        console.error
      );
    } else if (
      Services.prefs.getCharPref(
        `mail.server.${folder.server.key}.storeContractID`
      ) == "@mozilla.org/msgstore/berkeleystore;1"
    ) {
      // For local mbox, fix classic MacOS line endings.
      try {
        folder.acquireSemaphore(folder, "folderPane.rebuildFolderSummary");
        await repairMbox(folder.filePath.path);
      } catch (e) {
        console.warn(`Repair mbox FAILED; ${e.message}`);
      } finally {
        folder.releaseSemaphore(folder, "folderPane.rebuildFolderSummary");
      }
    }

    // The following notification causes all DBViewWrappers that include
    // this folder to rebuild their views.
    MailServices.mfn.notifyFolderReindexTriggered(folder);

    folder.msgDatabase.summaryValid = false;
    try {
      let transferInfo = null;
      switch (folder.server.type) {
        case "imap":
          transferInfo = folder.dBTransferInfo.QueryInterface(
            Ci.nsIWritablePropertyBag2
          );
          transferInfo.setPropertyAsACString("numMsgs", "0");
          transferInfo.setPropertyAsACString("numNewMsgs", "0");
          // Reset UID validity so that nsImapMailFolder::UpdateImapMailboxInfo
          // will recognize that a folder repair is in progress.
          transferInfo.setPropertyAsACString("UIDValidity", "-1"); // == kUidUnknown
          break;
        case "ews":
          // Reset the sync state token so that the next sync will download the
          // message list again.
          folder.setStringProperty("ewsSyncStateToken", "");
          break;
      }

      folder.closeAndBackupFolderDB("");
      if (folder.server.type == "imap" && transferInfo) {
        folder.dBTransferInfo = transferInfo;
      }
    } catch (e) {
      // In a failure, proceed anyway since we're dealing with problems
      folder.ForceDBClosed();
    }
    folder.updateFolder(top.msgWindow);
    folder.msgDatabase.commit(Ci.nsMsgDBCommitType.kCompressCommit);
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

    // If the main window has been closed by the user, make sure that the
    // folder properties dialog is removed as well,
    let folderPropertiesDialog = null;
    const onMainWindowUnload = () => {
      folderPropertiesDialog.close();
    };
    window.addEventListener("unload", onMainWindowUnload);

    // Save the focus and freeze the about3Pane.
    const prevFocusedElement = document.activeElement;
    document.documentElement.setAttribute("inert", "true");

    function editFolderCallback(newName, oldName) {
      if (newName != oldName) {
        folder.rename(newName, top.msgWindow);
      }
    }

    function unloadDialogCallback() {
      // Unfreeze about3Pane and restore focus.
      document.documentElement.removeAttribute("inert");
      prevFocusedElement?.focus();
      window.removeEventListener("unload", onMainWindowUnload);
    }

    folderPropertiesDialog = window.openDialog(
      "chrome://messenger/content/folderProps.xhtml",
      "",
      "chrome,dependent,centerscreen",
      {
        folder,
        serverType: folder.server.type,
        msgWindow: top.msgWindow,
        title,
        okCallback: editFolderCallback,
        tabID,
        name: folder.localizedName,
        rebuildSummaryCallback: this.rebuildFolderSummary,
        unloadCallback: unloadDialogCallback,
      }
    );
  },

  /**
   * Opens the dialog to rename a particular folder, and does the renaming if
   * the user clicks OK in that dialog
   *
   * @param {nsIMsgFolder} [aFolder] - The folder to rename, if different than
   *   the currently selected one.
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
        name: folder.localizedName,
      }
    );
  },

  /**
   * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
   * if the selected folder/s happen to be nntp.
   *
   * @param {nsIMsgFolder} folder - The folder to delete.
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
      throw new Error("Can't delete folder: " + folder.localizedName);
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
   * @param {nsIMsgFolder} [aFolder] - The trash folder to empty. If unspecified
   *   or not a trash folder, the currently selected server's trash folder is used.
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
   * @param {string} aName - The default name for the new folder.
   * @param {nsIMsgSearchTerm[]} aSearchTerms - The search terms associated
   *   with the folder.
   * @param {nsIMsgFolder} aParent - The folder to run the search terms on.
   */
  newVirtualFolder(aName, aSearchTerms, aParent) {
    const folder = aParent || top.GetDefaultAccountRootFolder();
    if (!folder) {
      return;
    }

    let name = folder.localizedName;
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

  /**
   * @param {nsIMsgFolder} aFolder
   */
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
   * @param {string} aCommand - The command to prompt for.
   * @param {nsIMsgFolder} aFolder - The folder for which the confirmation is requested.
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
        [aFolder.localizedName]
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

  /**
   * Find all first level subfolders of a parent folder and skip the Gmail ghost
   * folder.
   *
   * @param {nsIMsgFolder} parentFolder
   * @returns {nsIMsgFolder[]} - Array of found folders.
   */
  _getSubFolders(parentFolder) {
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
      return [];
    }

    for (let i = 0; i < subFolders.length; i++) {
      const folder = subFolders[i];
      if (this._isGmailFolder(folder)) {
        subFolders.splice(i, 1, ...folder.subFolders);
      }
    }

    return subFolders;
  },

  /**
   * Clear any previously applied custom sort order to all the child folders of
   * a parent.
   *
   * @param {nsIMsgFolder} parentFolder
   */
  clearUserSortOrder(parentFolder) {
    const folders = [];
    for (const folder of this._getSubFolders(parentFolder)) {
      if (folder.userSortOrder == Ci.nsIMsgFolder.NO_SORT_VALUE) {
        continue;
      }

      folder.userSortOrder = Ci.nsIMsgFolder.NO_SORT_VALUE;
      folders.push(folder);

      if (folder.hasSubFolders) {
        this.clearUserSortOrder(folder);
      }
    }

    for (const changedFolder of folders) {
      this.setOrderToRowInAllModes(changedFolder, changedFolder.sortOrder);
      this.refreshFolderPaneUI(changedFolder);
    }

    window.dispatchEvent(
      new CustomEvent("folder-sort-order-restored", { bubbles: true })
    );
  },

  /**
   * Set folder sort order to rows for the folder.
   *
   * @param {nsIMsgFolder} folder
   * @param {integer} order
   */
  setOrderToRowInAllModes(folder, order) {
    for (const name of this.activeModes) {
      const row = folderPane.getRowForFolder(folder, name);
      if (row) {
        row.folderSortOrder = order;
      }
    }
  },

  /**
   * Set the sort order for the new folder added to the folder group.
   *
   * @param {nsIMsgFolder} parentFolder
   * @param {nsIMsgFolder} newFolder
   */
  setSortOrderOnNewFolder(parentFolder, newFolder) {
    if (newFolder.userSortOrder != Ci.nsIMsgFolder.NO_SORT_VALUE) {
      return;
    }
    const subFolders = parentFolder?.subFolders ?? [];
    const maxOrderValue = Math.max(
      -1,
      ...subFolders
        .filter(folder => folder.userSortOrder != Ci.nsIMsgFolder.NO_SORT_VALUE)
        .map(folder => folder.userSortOrder)
    );
    if (maxOrderValue == -1) {
      // None of the sibling folders have a sort order value (i.e. this group of
      // folders has never been manually sorted). In this case, the natural
      // order should still be used.
      return;
    }
    // The group has already been ordered. In this case, insert the new folder
    // before the first folder that is further ahead of it in the natural order.
    const sibling = subFolders
      // Exclude special folders so new folders don't get created before them.
      .filter(folder => !(folder.flags & Ci.nsMsgFolderFlags.SpecialUse))
      .sort(FolderUtils.compareFolders)
      .find(
        folder =>
          FolderUtils.folderNameCollator.compare(
            folder.localizedName,
            newFolder.localizedName
          ) > 0
      );
    if (sibling) {
      folderPane.insertFolder(newFolder, sibling, false);
      return;
    }
    // Place the new folder at the bottom.
    const newOrder = maxOrderValue + 1;
    newFolder.userSortOrder = newOrder; // Update DB
    this.setOrderToRowInAllModes(newFolder, newOrder); // Update row info.
  },

  /**
   * Insert a folder before/after the target and reorder siblings.
   * Note: Valid only in "all" mode.
   *
   * @param {nsIMsgFolder} folder
   * @param {nsIMsgFolder} target
   * @param {boolean} insertAfter
   */
  insertFolder(folder, target, insertAfter) {
    let subFolders = [];
    try {
      subFolders = target.parent.subFolders;
    } catch (ex) {
      console.error(
        `Unable to access the subfolders of ${target.parent.URI}`,
        ex
      );
    }

    // Considering the case of a folder inserted between folders with the same
    // order value X, the order of the inserted folder must be (X+1), even if
    // it is inserted before the target. And the order of subsequent folders
    // must be increased by 2.
    const targetOrder = target.sortOrder;
    let folderOrder = targetOrder + 1;
    // Start at the end, so we can stop once we've reached the insertion point.
    const folders = subFolders
      .filter(sf => sf != folder)
      .sort(FolderUtils.compareFolders)
      .reverse();
    const targetIndex = folders.indexOf(target);
    let needsSpace = true;
    // Check if we need to create space to insert the folder into.
    if (targetIndex > -1) {
      // If we're inserting the folder after the target and the existing folder
      // after the target (before because of the reverse above) already has a
      // bigger sort order than what we'll be inserting at, we don't need to
      // increase the sort of the folders after. Of course if there's no folder
      // after the target, we can just append the folder and don't need to
      // increase any indexes.
      if (
        insertAfter &&
        (targetIndex == 0 ||
          folders.at(targetIndex - 1).sortOrder > folderOrder)
      ) {
        needsSpace = false;
        // If we're inserting before the target and the existing folder before
        // the target has a sort order smaller than what we'll be inserting at,
        // we don't need to increase the sort order of any folder after our
        // insertion point, since there is already a sort order space. Readjust
        // the expected order for our folder to fit there instead. The special
        // case here is if we're inserting at the very beginning and the target
        // (which would currently be the first folder, last because reverse) has
        // a sort order bigger than zero, meaning we can fit in front of it
        // without incrementing the sort order of all other folders.
      } else if (
        !insertAfter &&
        targetOrder > 0 &&
        (targetIndex + 1 === folders.length ||
          folders.at(targetIndex + 1).sortOrder < targetOrder - 1)
      ) {
        needsSpace = false;
        folderOrder = targetOrder - 1;
      }
    }
    if (needsSpace) {
      for (const sibling of folders) {
        // If we've reached the target and we're inserting after it, we've done
        // all the necessary moving.
        if (insertAfter && sibling == target) {
          break;
        }
        // This will sometimes make the hole one index bigger than needed,
        // however this didn't seem like useful complexity for the gains.
        const order = sibling.sortOrder + 2;
        sibling.userSortOrder = order; // Update DB
        folderPane.setOrderToRowInAllModes(sibling, order); // Update row info.
        // If we're inserting before the target and we've just updated the target
        // we can now insert the folder itself.
        if (!insertAfter && sibling == target) {
          break;
        }
      }
    }
    folder.userSortOrder = folderOrder; // Update DB.
    folderPane.setOrderToRowInAllModes(folder, folderOrder); // Update row info.

    this.refreshFolderPaneUI(folder);
  },

  /**
   * Refresh the folder pane UI to ensure that the recently moved folders are
   * properly sorted.
   *
   * @param {nsIMsgFolder} folder
   */
  refreshFolderPaneUI(folder) {
    // Update folder pane UI.
    const movedFolderURI = folder.URI;
    for (const name of this.activeModes) {
      // Find a parent UI element of folder in this mode.
      // Note that the parent folder on the DB may not be the parent UI element
      // (as is the case with Gmail). So we find the parent UI element by
      // querying the CSS selector.
      const rowToMove = folderPane.getRowForFolder(folder, name);
      const id = FolderPaneUtils.makeRowID(name, movedFolderURI);
      const listRow = folderPane._modes[name].containerList.querySelector(
        `li[is="folder-tree-row"]:has(>ul>li#${CSS.escape(id)})`
      );
      if (listRow) {
        listRow.insertChildInOrder(rowToMove);
      }
    }
  },

  get isMultiSelection() {
    return folderTree.selection.size > 1;
  },

  /**
   * Wrap the swap selection around a timeout to make sure we run this after any
   * other operation like folder move.
   *
   * @param {HTMLLIElement[]} rows - The array of rows to select.
   */
  swapFolderSelection(rows) {
    setTimeout(() => {
      folderTree.swapSelection(rows);
    });
  },
};

/**
 * Class responsible for the the UI reorder of the folders after the backend
 * operation has been completed.
 */
class ReorderFolderListener {
  constructor(sourceFolder, targetFolder, insertAfter) {
    this.sourceFolder = sourceFolder;
    this.targetFolder = targetFolder;
    this.insertAfter = insertAfter;
  }

  onStopCopy() {
    // Do reorder within new siblings (all children of new parent).
    const movedFolder = MailServices.copy.getArrivedFolder(this.sourceFolder);
    if (!movedFolder) {
      return;
    }
    folderPane.insertFolder(movedFolder, this.targetFolder, this.insertAfter);
  }
}

/**
 * Header area of the message list pane.
 */
var threadPaneHeader = {
  /**
   * The header bar element.
   *
   * @type {?HTMLElement}
   */
  bar: null,
  /**
   * The h2 element receiving the folder name.
   *
   * @type {?HTMLElement}
   */
  folderName: null,
  /**
   * The span element receiving the message count.
   *
   * @type {?HTMLSpanElement}
   */
  folderCount: null,
  /**
   * The quick filter toolbar toggle button.
   *
   * @type {?HTMLButtonElement}
   */
  filterButton: null,
  /**
   * The display options button opening the popup.
   *
   * @type {?HTMLButtonElement}
   */
  displayButton: null,
  /**
   * If the header area is hidden.
   *
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
      case "request-count-update":
        this.updateSelectedCount();
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
    this.folderName.title = gFolder?.localizedName ?? document.title;
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
    Services.prefs.addObserver("mail.threadpane.table.horizontal_scroll", this);
    Services.prefs.addObserver("mail.threadpane.listview", this);

    Services.obs.addObserver(this, "addrbook-displayname-changed");
    Services.obs.addObserver(this, "custom-column-added");
    Services.obs.addObserver(this, "custom-column-removed");
    Services.obs.addObserver(this, "custom-column-refreshed");
    Services.obs.addObserver(this, "global-view-flags-changed");
    Services.obs.addObserver(this, "folder-strings-changed");

    threadTree = document.getElementById("threadTree");
    if (!threadTree.table) {
      // It's possible we're here after tree-view is defined but before
      // connectedCallback has fired on threadTree. Wait for that to happen.
      await new Promise(resolve => {
        new MutationObserver((mutations, observer) => {
          if (threadTree.table) {
            observer.disconnect();
            resolve();
          }
        }).observe(threadTree, { childList: true });
      });
    }
    this.treeTable = threadTree.table;
    this.treeTable.editable = true;
    this.treeTable.isHorizontalScroll = Services.prefs.getBoolPref(
      "mail.threadpane.table.horizontal_scroll",
      false
    );

    this.treeTable.setPopupMenuTemplates([
      "threadPaneApplyColumnMenu",
      "threadPaneApplyViewMenu",
    ]);
    threadPane.updateThreadView();

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "selectDelay",
      "mailnews.threadpane_select_delay",
      null,
      (name, oldValue, newValue) => (threadTree.dataset.selectDelay = newValue)
    );
    threadTree.dataset.selectDelay = this.selectDelay;

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "rowCount",
      "mail.threadpane.cardsview.rowcount",
      3,
      () => this.updateThreadItemSize(),
      prefVal => Math.min(Math.max(2, prefVal), 3)
    );

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
    threadTree.addEventListener("dragend", this);
    threadTree.addEventListener("expanded", this);
    threadTree.addEventListener("collapsed", this);
    threadTree.addEventListener("scroll", this);
    threadTree.addEventListener("showplaceholder", this);
  },

  uninit() {
    Services.prefs.removeObserver("mailnews.tags.", this);
    Services.prefs.removeObserver(
      "mail.threadpane.table.horizontal_scroll",
      this
    );
    Services.prefs.removeObserver("mail.threadpane.listview", this);
    Services.obs.removeObserver(this, "addrbook-displayname-changed");
    Services.obs.removeObserver(this, "custom-column-added");
    Services.obs.removeObserver(this, "custom-column-removed");
    Services.obs.removeObserver(this, "custom-column-refreshed");
    Services.obs.removeObserver(this, "global-view-flags-changed");
    Services.obs.removeObserver(this, "folder-strings-changed");
  },

  handleEvent(event) {
    const notOnEmptySpace = event.target !== threadTree;
    switch (event.type) {
      case "show-single-message":
        threadTree.selectedIndices = event.detail.messages;
        break;
      case "request-message-selection":
        threadTree.dispatchEvent(new CustomEvent("select"));
        break;
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
      case "dragend":
        this._onDragEnd(event);
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
        if (data == "mail.threadpane.table.horizontal_scroll") {
          this.treeTable.isHorizontalScroll = Services.prefs.getBoolPref(
            "mail.threadpane.table.horizontal_scroll",
            false
          );
          // Only call a columns refresh if a folder is selected. We can skip
          // this since we already set the isHorizontalScroll variable and it
          // will be used next time the user selects a folder.
          if (gFolder) {
            this.treeTable.updateColumns(this.columns);
          }
          break;
        }

        if (data.startsWith("mailnews.tags.")) {
          this.setUpTagStyles();
          break;
        }

        if (data == "mail.threadpane.listview") {
          this.updateThreadView();
          this.updateThreadItemSize();
        }
        break;
      case "addrbook-displayname-changed":
      case "custom-column-refreshed":
        // addrbook-displayname-changed: This runs when mail.displayname.version
        // preference observer is notified or the number of the
        // mail.displayname.version preference has been updated.
        // custom-column-refreshed: This used to refresh just the column,
        // but now that filling the cells happens asynchronously, that's too
        // complicated, so it's better to invalidate the whole thing. Kept for
        // add-on compatibility.
        threadTree.invalidate();
        break;
      case "custom-column-added":
        this.addCustomColumn(data);
        break;
      case "custom-column-removed":
        this.onCustomColumnRemoved(data);
        break;
      case "global-view-flags-changed":
        // Global view flags have changed. Reload the currently selected message
        // list to avoid showing a stale configuration. We could be smart here
        // and check if the currently selected folder is part of the modified
        // folders but forcing a selection is inexpensive and straightforward.
        folderTree.dispatchEvent(new CustomEvent("select"));
        break;
      case "folder-strings-changed":
        threadTree.invalidate();
        threadPaneHeader.onFolderSelected();
        if (gFolder && !gFolder.isServer) {
          document.title = `${gFolder.localizedName} - ${gFolder.server.prettyName}`;
        }
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
      // Bail on delete event if there is a repeat event to prevent deleting
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
    if (
      !dbViewWrapperListener.allMessagesLoaded &&
      !this._selectionIsBeingRestored
    ) {
      // The user selected something, stop restoring a saved selection.
      this.forgetSavedSelection();
    }
    if (paneLayout.messagePaneVisible.isCollapsed) {
      updateZoomCommands();
      return;
    }

    const numSelected = gDBView?.numSelected || 0;

    // Prevent Grouped By Sort header rows and messages from being selected
    // simultaneously.
    if (
      gViewWrapper?.showGroupedBySort &&
      numSelected > 0 &&
      threadTree.selectedIndices.length > 1
    ) {
      const savedIndex = threadTree.currentIndex;
      threadTree.selectedIndices
        .filter(i => gViewWrapper.isExpandedGroupedByHeaderAtIndex(i))
        .forEach(i => threadTree.toggleSelectionAtIndex(i, false, false));
      threadTree.currentIndex = savedIndex;
    }

    switch (numSelected) {
      case 0:
        messagePane.displayMessage();
        break;
      case 1: {
        if (
          gDBView.getFlagsAt(threadTree.selectedIndex) & MSG_VIEW_FLAG_DUMMY
        ) {
          messagePane.displayMessage();
          break;
        }

        const uri = gDBView.getURIForViewIndex(threadTree.selectedIndex);
        messagePane.displayMessage(uri);
        break;
      }
      default:
        messagePane.displayMessages(gDBView.getSelectedMsgHdrs());
        break;
    }

    updateZoomCommands();
  },

  /**
   * Handle threadPane drag events.
   */
  _onDragStart(event) {
    const row = event.target.closest(`tr[is^="thread-"]`);
    const alreadySelected =
      row && threadTree.selectedIndices.includes(row.index);
    if (
      !row ||
      gViewWrapper.isExpandedGroupedByHeaderAtIndex(row.index) ||
      (!alreadySelected && (event.ctrlKey || event.shiftKey))
    ) {
      event.preventDefault();
      threadTree.ensureCorrectFocus();
      return;
    }

    if (!alreadySelected) {
      threadTree.selectedIndex = row.index;
    }
    const messageURIs = gDBView.getURIsForSelection();

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
      const msgUrlSpec = msgService.getUrlForUri(uri).spec;
      event.dataTransfer.mozSetDataAt("text/x-moz-url", msgUrlSpec, index);
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise-url",
        msgUrlSpec,
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

  /**
   * Handle threadPane drag end events.
   */
  _onDragEnd(event) {
    if (event.dataTransfer.dropEffect != "none") {
      return;
    }
    folderPane._timedExpand();
    folderPane._collapseAutoExpandedRows();
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
        // Try again after the scroll happens.
        if (!row && !retry) {
          threadTree.addEventListener(
            "scroll",
            () => this._onContextMenu(event, true),
            { once: true }
          );
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
      document.body.style.setProperty(`--tag-${key}-backcolor`, color);
      document.body.style.setProperty(`--tag-${key}-forecolor`, contrast);
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
    // subject line-height * this.rowCount * current font-size.
    const cardRowConstant = Math.round(1.5 * this.rowCount * currentFontSize);
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
          cardRowConstant + lineGap * this.rowCount + densityPaddingConstant;
        break;
      case UIDensity.MODE_TOUCH:
        rowHeight = rowHeight + 13;
        lineGap = 6;
        densityPaddingConstant = 12; // card padding-block + 2 * row padding-block
        cardRowHeight =
          cardRowConstant + lineGap * this.rowCount + densityPaddingConstant;
        break;
      default:
        rowHeight = rowHeight + 7;
        lineGap = 3;
        densityPaddingConstant = 7; // card padding-block + 2 * row padding-block
        cardRowHeight =
          cardRowConstant + lineGap * this.rowCount + densityPaddingConstant;
        break;
    }
    cardClass.ROW_HEIGHT = Math.max(cardRowHeight, 40);
    rowClass.ROW_HEIGHT = Math.max(rowHeight, 18);
  },

  /**
   * Update thread item size in DOM (thread cards and rows).
   */
  async updateThreadItemSize() {
    threadTree.classList.toggle("cards-row-compact", this.rowCount === 2);
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
      rowCount: gDBView.rowCount,
    });
  },

  /**
   * Forget any saved selection of the given folder. This is useful if you're
   * going to set the selection after switching to the folder.
   *
   * @param {string} [selectionKey] - A folder's URI if given, or whatever is
   *   currently being displayed.
   */
  forgetSavedSelection(selectionKey = this._getSavedSelectionKey()) {
    this._savedSelections.delete(selectionKey);
  },

  /**
   * Restore the previously saved thread tree selection.
   *
   * @param {object} [options={}] - Options.
   * @param {boolean} [options.discard=true] - If false, the selection data is
   *   kept for another call of this function.
   * @param {boolean} [options.notify=true] - Whether a change in "select" event
   *   should be fired and the current index should be scrolled into view.
   * @param {boolean} [options.expand=true] - Try to expand threads containing
   *   selected messages.
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

    // Remember what was selected before restoring the selection.
    const indicesBefore = threadTree.selectedIndices;

    // Ignore any updates from the gDBView caused by findIndexForMsgURI
    // expanding threads.
    this._jsTree.beginUpdateBatch();

    const selection = this._savedSelections.get(selectionKey);
    const currentIndex = selection.currentUri
      ? gDBView.findIndexForMsgURI(selection.currentUri, expand)
      : nsMsgViewIndex_None;
    const indices = new Set(
      selection.selectedUris
        .map(uri => gDBView.findIndexForMsgURI(uri, expand))
        .filter(i => i != nsMsgViewIndex_None)
    );
    // Set the selection and stop ignoring updates.
    threadTree.setSelectedIndices(indices.values(), true);
    this._jsTree.endUpdateBatch();

    // If any of these conditions are true, the selection changed. If not,
    // the selection didn't change. Don't tell the tree about it, and
    // definitely don't fire a "select" event and cause any selected message
    // to be reloaded (again).
    const selectionDidChange =
      gDBView.rowCount != selection.rowCount ||
      indices.size != indicesBefore.length ||
      indicesBefore.some(i => !indices.has(i));
    this._selectionIsBeingRestored = true;
    threadTree.onSelectionChanged(false, !notify || !selectionDidChange);
    this._selectionIsBeingRestored = false;

    if (currentIndex == nsMsgViewIndex_None) {
      threadTree.currentIndex = -1;
    } else if (notify) {
      threadTree.style.scrollBehavior = "auto"; // Avoid smooth scroll.
      threadTree.currentIndex = currentIndex;
      threadTree.style.scrollBehavior = null;
    } else {
      // Don't scroll at all.
      threadTree._selection.currentIndex = currentIndex;
      threadTree._updateCurrentIndexClasses();
    }

    // To avoid problems with restoreThreadState, do not discard any selection
    // data until explicitly requested.
    if (discard) {
      this._savedSelections.delete(selectionKey);
    } else {
      // Update the count for next time restoreSelection is called.
      selection.rowCount = gDBView.rowCount;
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
    if (!gViewWrapper?.dbView) {
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
      for (const customColumn of ThreadPaneColumns.getCustomColumns()) {
        if (this.columns.find(c => c.id == customColumn.id)) {
          this.rowTemplate.content.appendChild(
            this.makeCustomColumnCell(customColumn)
          );
        } else {
          this.addCustomColumn(customColumn.id, false);
        }
      }
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
      this.restoreSortIndicator();
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
   * @param {string} columnID - Unique id of the custom column.
   * @param {boolean} [update=true] - If the thread tree should be updated
   *   as a result of this function.
   */
  addCustomColumn(columnID, update = true) {
    const column = ThreadPaneColumns.getColumn(columnID);
    if (this.rowTemplate) {
      this.rowTemplate.content.appendChild(this.makeCustomColumnCell(column));
    }

    this.columns.push(column);
    const columnStates =
      gFolder?.msgDatabase?.dBFolderInfo?.getCharProperty("columnStates");
    if (columnStates) {
      this.applyPersistedColumnsState(JSON.parse(columnStates));
    }

    gViewWrapper?.dbView.addColumnHandler(column.id, column.handler);
    if (update && this.rowTemplate) {
      // If update is false, we're being called by updateColumns.
      // If rowTemplate is falsy, the message list has never loaded and
      // updateColumns will be called soon.
      this.updateColumns();
      this.restoreSortIndicator();
      threadTree.reset();
    }
  },

  /**
   * Removes a custom column from the thread pane.
   *
   * @param {string} columnID - unique id of the custom column
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
    this.columns.forEach((col, index) => {
      col.ordinal = index;
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
      { id: msgFluentID, args: { name: folder.localizedName } },
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
   * Prompt the user to confirm applying the current view state to the chosen
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
      { id: msgFluentID, args: { name: folder.localizedName } },
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
              msgDb.markKilled(msg.messageKey, false, null);
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
   */
  updateThreadView() {
    switch (Services.prefs.getIntPref("mail.threadpane.listview", 0)) {
      case 1:
        // Table view.
        threadTree.setAttribute("rows", "thread-row");
        threadTree.headerHidden = false;
        break;
      case 0:
      default:
        // Cards view.
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

/**
 * Restore the UI to the given state.
 *
 * @param {object} [options={}] - Options.
 * @param {boolean} options.folderPaneVisible - Whether to show the folder pane.
 *   If undefined, the folder pane is shown if a folder URI is provided or we're
 *   not restoring to a synthetic view.
 * @param {boolean} options.messagePaneVisible - Whether to show the message
 *   pane. If undefined, the message pane is shown as long as its wrapper is
 *   not collapsed.
 * @param {?nsIMsgFolder|string} options.folderURI - The folder to display,
 *   or its URI, if any.
 * @param {?GlodaSyntheticView} options.syntheticView - The synthetic view to
 *   restore to, if any.
 * @param {boolean} options.first - Whether this is the first call to this
 *   function (i.e. we're setting the state at the start of the application),
 *   in which case we want to greet the user with the start page.
 * @param {?string} options.title - If any, the title to set.
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
 *
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
 *
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
 * If necessary, the selected folder will be changed and/or the Quick Filter
 * will be cleared. If the selection changes, the message pane will also be
 * updated (via a "select" event).
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

  let index;
  const foundIndexOfMsgHdrInView = () => {
    index = gDBView?.findIndexOfMsgHdr(msgHdr, true);
    return index != undefined && index != nsMsgViewIndex_None;
  };

  if (!foundIndexOfMsgHdrInView()) {
    if (gFolder && gFolder.URI == msgHdr.folder.URI) {
      // The message might not match the current Quick Filter term.
      goDoCommand("cmd_resetQuickFilterBar");
      if (!foundIndexOfMsgHdrInView()) {
        return;
      }
    } else {
      threadPane.forgetSavedSelection(msgHdr.folder.URI);
      displayFolder(msgHdr.folder.URI);
      if (!foundIndexOfMsgHdrInView()) {
        // Quick Filter might be in sticky mode and still active.
        goDoCommand("cmd_resetQuickFilterBar");
        if (!foundIndexOfMsgHdrInView()) {
          return;
        }
      }
    }
    threadTree.scrollToIndex(index, true);
  }
  threadTree.selectedIndex = index;
}

var folderListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
  onFolderAdded(parentFolder, childFolder) {
    folderPane.setSortOrderOnNewFolder(parentFolder, childFolder);
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
      // Clean up the display if the deleted folder was being displayed. At this
      // point, `DBViewWrapper._folderDeleted` has already cleaned up `gDBView`.
      gFolder = null;
      gViewWrapper?.close(true);
      threadPaneHeader.onFolderSelected();
      threadPane._onSelect(); // Ensure no message is displayed.
    }

    // We need to rebuild the selection map if a folder was removed while we had
    // multiple folders selected and it wasn't part of the selection range, to
    // ensure the indices match the rows.
    if (folderTree.selection.size > 1 && notInRange) {
      // Wrap this in a timeout to ensure we don't get stale values from a
      // selection that still carries deleted rows.
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
  onFolderPropertyChanged(folder, property, oldValue, newValue) {
    switch (property) {
      case "Name":
        if (folder.isServer) {
          folderPane.changeServerName(folder, newValue);
        }
        break;
    }
  },
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

var userFeedbackListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
  onAlert() {
    return false;
  },
  async onCertError(securityInfo, uri) {
    let server;
    try {
      server = MailServices.accounts.findServerByURI(uri);
    } catch (ex) {
      console.error(ex);
      return;
    }

    let errorString;
    const errorArgs = { hostname: uri.host };

    switch (securityInfo?.overridableErrorCategory) {
      case Ci.nsITransportSecurityInfo.ERROR_DOMAIN:
        errorString = "cert-error-inline-domain-mismatch";
        break;
      case Ci.nsITransportSecurityInfo.ERROR_TIME: {
        const cert = securityInfo.serverCert;
        const notBefore = cert.validity.notBefore / 1000;
        const notAfter = cert.validity.notAfter / 1000;
        const formatter = new Intl.DateTimeFormat();

        if (notBefore && Date.now() < notAfter) {
          errorString = "cert-error-inline-not-yet-valid";
          errorArgs["not-before"] = formatter.format(new Date(notBefore));
        } else {
          errorString = "cert-error-inline-expired";
          errorArgs["not-after"] = formatter.format(new Date(notAfter));
        }
        break;
      }
      default:
        errorString = "cert-error-inline-untrusted-default";
        break;
    }

    window.MozXULElement.insertFTLIfNeeded("messenger/certError.ftl");

    folderPane._changeRows(server.rootFolder, row => {
      row.classList.add("tls-error");
      document.l10n.setAttributes(row.statusIcon, errorString, errorArgs);
      // Click handler set directly (rather than as a listener) so that we
      // don't have to mess around clearing previous handlers.
      row.statusIcon.onclick = () =>
        top.MsgAccountManager("am-server.xhtml", server);
    });
  },
};

/* Commands Controller */
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

commandController.registerCallback("cmd_threadPaneViewCards", () => {
  Services.prefs.setIntPref("mail.threadpane.listview", 0);
});
commandController.registerCallback("cmd_threadPaneViewTable", () => {
  Services.prefs.setIntPref("mail.threadpane.listview", 1);
});
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
  () => gViewWrapper?.dbView && !gViewWrapper.showGroupedBySort
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
    gViewWrapper?.dbView?.numSelected > 0
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
    gViewWrapper._sort = [
      [newSortType, Ci.nsMsgViewSortOrder.ascending, newSortColumnId],
    ];
    gViewWrapper.showGroupedBySort = false;
    gViewWrapper.endViewUpdate();
    // Virtual folders don't persist viewFlags well in the back end,
    // due to a virtual folder being either 'real' or synthetic, so make
    // sure it's done here.
    if (gViewWrapper.isVirtual) {
      gViewWrapper.dbView.viewFlags = gViewWrapper._viewFlags;
    }

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
    // Virtual folders don't persist viewFlags well in the back end,
    // due to a virtual folder being either 'real' or synthetic, so make
    // sure it's done here.
    if (gViewWrapper.isVirtual) {
      gViewWrapper.dbView.viewFlags = gViewWrapper._viewFlags;
    }
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
  if (gViewWrapper.specialView) {
    // Switching to a special view resets all search terms, so we need to
    // reflect this in the quick filter bar.
    goDoCommand("cmd_resetQuickFilterBar");
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
    if (messagePane.isWebBrowserVisible()) {
      PrintUtils.startPrintWindow(webBrowser.browsingContext);
      return;
    }
    const uris = gViewWrapper.dbView.getURIsForSelection();
    if (uris.length == 1) {
      if (!messagePane.isMessageBrowserVisible()) {
        // Load the only message in a hidden browser, then use the print preview UI.
        const messageService = MailServices.messageServiceFromURI(uris[0]);
        await PrintUtils.loadPrintBrowser(
          messageService.getUrlForUri(uris[0]).spec
        );
        PrintUtils.startPrintWindow(
          PrintUtils.printBrowser.browsingContext,
          {}
        );
        return;
      }

      PrintUtils.startPrintWindow(
        messageBrowser.contentWindow.getMessagePaneBrowser().browsingContext,
        {}
      );
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
    if (messagePane.isWebBrowserVisible()) {
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
  () => gViewWrapper?.dbView?.rowCount > 0
);
commandController.registerCallback(
  "cmd_deleteJunk",
  () => deleteJunkInFolder(gFolder),
  () => gViewWrapper?.dbView?.rowCount > 0 && gFolder?.canDeleteMessages
);

commandController.registerCallback(
  "cmd_killThread",
  () => {
    threadPane.hideIgnoredMessageNotification();
    const folder =
      gViewWrapper.isVirtual && gViewWrapper.isSingleFolder
        ? gViewWrapper._underlyingFolders[0]
        : gFolder;
    if (
      !folder.msgDatabase.isIgnored(
        gDBView.hdrForFirstSelectedMessage?.messageKey
      )
    ) {
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
  () =>
    gDBView?.numSelected >= 1 &&
    gFolder &&
    !gViewWrapper.isMultiFolder &&
    !gViewWrapper.showGroupedBySort
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
  () =>
    gDBView?.numSelected >= 1 &&
    gFolder &&
    !gViewWrapper.isMultiFolder &&
    !gViewWrapper?.showGroupedBySort
);

/* Forward find commands to about:message if message view is open, otherwise
 * create (if not already created) findbars for web and multi message view
 * and call the attached find commands. We create the findbars inline here
 * because adding them to the HTML initializes and additional Finder, which
 * the findbar then uses, but doesn't attach any event listeners to. This
 * causes the findbar to not update with a result status properly. */
commandController.registerCallback(
  "cmd_find",
  () => messagePane.onFindCommand(),
  () => messagePane.browserPaneVisible()
);
commandController.registerCallback(
  "cmd_findAgain",
  () => messagePane.onFindAgainCommand(),
  () => messagePane.browserPaneVisible()
);
commandController.registerCallback(
  "cmd_findPrevious",
  () => messagePane.onFindPreviousCommand(),
  () => messagePane.browserPaneVisible()
);

// Zoom.
commandController.registerCallback(
  "cmd_fullZoomReduce",
  () => top.ZoomManager.reduce(messagePane.visibleMessagePaneBrowser()),
  () => !!messagePane.visibleMessagePaneBrowser()
);
commandController.registerCallback(
  "cmd_fullZoomEnlarge",
  () => top.ZoomManager.enlarge(messagePane.visibleMessagePaneBrowser()),
  () => !!messagePane.visibleMessagePaneBrowser()
);
commandController.registerCallback(
  "cmd_fullZoomReset",
  () => top.ZoomManager.reset(messagePane.visibleMessagePaneBrowser()),
  () => !!messagePane.visibleMessagePaneBrowser()
);
commandController.registerCallback(
  "cmd_fullZoomToggle",
  () => top.ZoomManager.toggleZoom(messagePane.visibleMessagePaneBrowser()),
  () => !!messagePane.visibleMessagePaneBrowser()
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
    () => messagePane.doMessageBrowserCommand(command),
    () =>
      messagePane.isMessageBrowserVisible() &&
      messagePane.isMessageBrowserCommandEnabled(command)
  );
}
