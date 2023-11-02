/* -*- indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gSpacesToolbar */

/* import-globals-from ../../../mailnews/extensions/newsblog/newsblogOverlay.js */
/* import-globals-from contentAreaClick.js */
/* import-globals-from mail3PaneWindowCommands.js */
/* import-globals-from mailCommands.js */
/* import-globals-from mailCore.js */

/* import-globals-from utilityOverlay.js */

/* globals messenger */ // From messageWindow.js
/* globals GetSelectedMsgFolders */ // From messenger.js or messageWindow.js
/* globals MailOfflineMgr */ // From mail-offline.js

/* globals OnTagsChange, currentHeaderData */ // TODO: these aren't real.

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",

  BrowserToolboxLauncher:
    "resource://devtools/client/framework/browser-toolbox/Launcher.sys.mjs",
});
XPCOMUtils.defineLazyModuleGetters(this, {
  MailUtils: "resource:///modules/MailUtils.jsm",
  MimeParser: "resource:///modules/mimeParser.jsm",
  UIDensity: "resource:///modules/UIDensity.jsm",
  UIFontSize: "resource:///modules/UIFontSize.jsm",
});

Object.defineProperty(this, "BrowserConsoleManager", {
  get() {
    const { loader } = ChromeUtils.importESModule(
      "resource://devtools/shared/loader/Loader.sys.mjs"
    );
    return loader.require("devtools/client/webconsole/browser-console-manager")
      .BrowserConsoleManager;
  },
  configurable: true,
  enumerable: true,
});

// the user preference,
// if HTML is not allowed. I assume, that the user could have set this to a
// value > 1 in his prefs.js or user.js, but that the value will not
// change during runtime other than through the MsgBody*() functions below.
var gDisallow_classes_no_html = 1;

/**
 * Disable the new account menu item if the account preference is locked.
 * The other affected areas are the account central, the account manager
 * dialog, and the account provisioner window.
 */
function menu_new_init() {
  // If the account provisioner is pref'd off, we shouldn't display the menu
  // item.
  ShowMenuItem(
    "newCreateEmailAccountMenuItem",
    Services.prefs.getBoolPref("mail.provider.enabled")
  );

  // If we don't have a folder, just get out of here and leave the menu as it is.
  const folder = document.getElementById("tabmail")?.currentTabInfo.folder;
  if (!folder) {
    return;
  }

  if (Services.prefs.prefIsLocked("mail.disable_new_account_addition")) {
    document
      .getElementById("newNewsgroupAccountMenuItem")
      .setAttribute("disabled", "true");
    document
      .getElementById("appmenu_newNewsgroupAccountMenuItem")
      .setAttribute("disabled", "true");
  }

  var isInbox = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Inbox);
  var showNew =
    (folder.canCreateSubfolders ||
      (isInbox && !folder.getFlag(Ci.nsMsgFolderFlags.Virtual))) &&
    document.getElementById("cmd_newFolder").getAttribute("disabled") != "true";
  ShowMenuItem("menu_newFolder", showNew);
  ShowMenuItem("menu_newVirtualFolder", showNew);
  ShowMenuItem("newAccountPopupMenuSeparator", showNew);

  EnableMenuItem(
    "menu_newFolder",
    folder.server.type != "imap" || MailOfflineMgr.isOnline()
  );
  if (showNew) {
    var bundle = document.getElementById("bundle_messenger");
    // Change "New Folder..." menu according to the context.
    SetMenuItemLabel(
      "menu_newFolder",
      bundle.getString(
        folder.isServer || isInbox
          ? "newFolderMenuItem"
          : "newSubfolderMenuItem"
      )
    );
  }

  goUpdateCommand("cmd_newMessage");
}

function goUpdateMailMenuItems(commandset) {
  for (var i = 0; i < commandset.children.length; i++) {
    var commandID = commandset.children[i].getAttribute("id");
    if (commandID) {
      goUpdateCommand(commandID);
    }
  }

  updateCheckedStateForIgnoreAndWatchThreadCmds();
}

/**
 * Update the ignore (sub)thread, and watch thread commands so the menus
 * using them get the checked state set up properly.
 */
function updateCheckedStateForIgnoreAndWatchThreadCmds() {
  let message;

  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
  }

  const folder = message?.folder;

  const killThreadItem = document.getElementById("cmd_killThread");
  if (folder?.msgDatabase.isIgnored(message.messageKey)) {
    killThreadItem.setAttribute("checked", "true");
  } else {
    killThreadItem.removeAttribute("checked");
  }
  const killSubthreadItem = document.getElementById("cmd_killSubthread");
  if (folder && message.flags & Ci.nsMsgMessageFlags.Ignored) {
    killSubthreadItem.setAttribute("checked", "true");
  } else {
    killSubthreadItem.removeAttribute("checked");
  }
  const watchThreadItem = document.getElementById("cmd_watchThread");
  if (folder?.msgDatabase.isWatched(message.messageKey)) {
    watchThreadItem.setAttribute("checked", "true");
  } else {
    watchThreadItem.removeAttribute("checked");
  }
}

function file_init() {
  document.commandDispatcher.updateCommands("create-menu-file");
}

/**
 * Update the menu items visibility in the Edit submenu.
 */
function InitEditMessagesMenu() {
  document.commandDispatcher.updateCommands("create-menu-edit");

  let chromeBrowser, folderTreeActive, folder, folderIsNewsgroup;
  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (tab?.mode.name == "mail3PaneTab") {
    chromeBrowser = tab.chromeBrowser;
    folderTreeActive =
      chromeBrowser.contentDocument.activeElement.id == "folderTree";
    folder = chromeBrowser.contentWindow.gFolder;
    folderIsNewsgroup = folder?.server.type == "nntp";
  } else if (tab?.mode.name == "mailMessageTab") {
    chromeBrowser = tab.chromeBrowser;
  } else {
    chromeBrowser = document.getElementById("messageBrowser");
  }

  const deleteController = getEnabledControllerForCommand("cmd_delete");
  // If the controller is a JS object, it must be one we've implemented,
  // not the built-in controller for textboxes.

  const dbView = chromeBrowser?.contentWindow.gDBView;
  const numSelected = dbView?.numSelected;

  const deleteMenuItem = document.getElementById("menu_delete");
  if (deleteController?.wrappedJSObject && folderTreeActive) {
    const value = folderIsNewsgroup
      ? "menu-edit-unsubscribe-newsgroup"
      : "menu-edit-delete-folder";
    document.l10n.setAttributes(deleteMenuItem, value);
  } else if (deleteController?.wrappedJSObject && numSelected) {
    const message = dbView?.hdrForFirstSelectedMessage;
    let value;
    if (message && message.flags & Ci.nsMsgMessageFlags.IMAPDeleted) {
      value = "menu-edit-undelete-messages";
    } else {
      value = "menu-edit-delete-messages";
    }
    document.l10n.setAttributes(deleteMenuItem, value, { count: numSelected });
  } else {
    document.l10n.setAttributes(deleteMenuItem, "text-action-delete");
  }

  // Initialize the Favorite Folder checkbox in the Edit menu.
  const favoriteFolderMenu = document.getElementById("menu_favoriteFolder");
  if (folder?.getFlag(Ci.nsMsgFolderFlags.Favorite)) {
    favoriteFolderMenu.setAttribute("checked", "true");
  } else {
    favoriteFolderMenu.removeAttribute("checked");
  }

  const propertiesController = getEnabledControllerForCommand("cmd_properties");
  const propertiesMenuItem = document.getElementById("menu_properties");
  if (tab?.mode.name == "mail3PaneTab" && propertiesController) {
    const value = folderIsNewsgroup
      ? "menu-edit-newsgroup-properties"
      : "menu-edit-folder-properties";
    document.l10n.setAttributes(propertiesMenuItem, value);
  } else {
    document.l10n.setAttributes(propertiesMenuItem, "menu-edit-properties");
  }
}

/**
 * Update the menu items visibility in the Find submenu.
 */
function initSearchMessagesMenu() {
  // Show 'Global Search' menu item only when global search is enabled.
  const glodaEnabled = Services.prefs.getBoolPref(
    "mailnews.database.global.indexer.enabled"
  );
  document.getElementById("glodaSearchCmd").hidden = !glodaEnabled;
}

function InitGoMessagesMenu() {
  document.commandDispatcher.updateCommands("create-menu-go");
}

/**
 * This is called every time the view menu popup is displayed (in the main menu
 * bar or in the appmenu).  It is responsible for updating the menu items'
 * state to reflect reality.
 */
function view_init(event) {
  if (event && event.target.id != "menu_View_Popup") {
    return;
  }

  let accountCentralVisible;
  let folderPaneVisible;
  let message;
  let messagePaneVisible;
  let quickFilterBarVisible;
  let threadPaneHeaderVisible;

  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (tab?.mode.name == "mail3PaneTab") {
    let chromeBrowser;
    ({ chromeBrowser, message } = tab);
    const { paneLayout, quickFilterBar } = chromeBrowser.contentWindow;
    ({ accountCentralVisible, folderPaneVisible, messagePaneVisible } =
      paneLayout);
    quickFilterBarVisible = quickFilterBar.filterer.visible;
    threadPaneHeaderVisible = true;
  } else if (tab?.mode.name == "mailMessageTab") {
    message = tab.message;
    messagePaneVisible = true;
    threadPaneHeaderVisible = false;
  }

  const isFeed = FeedUtils.isFeedMessage(message);

  const qfbMenuItem = document.getElementById(
    "view_toolbars_popup_quickFilterBar"
  );
  if (qfbMenuItem) {
    qfbMenuItem.setAttribute("checked", quickFilterBarVisible);
  }

  const qfbAppMenuItem = document.getElementById("appmenu_quickFilterBar");
  if (qfbAppMenuItem) {
    if (quickFilterBarVisible) {
      qfbAppMenuItem.setAttribute("checked", "true");
    } else {
      qfbAppMenuItem.removeAttribute("checked");
    }
  }

  const messagePaneMenuItem = document.getElementById("menu_showMessage");
  if (!messagePaneMenuItem.hidden) {
    // Hidden in the standalone msg window.
    messagePaneMenuItem.setAttribute(
      "checked",
      accountCentralVisible ? false : messagePaneVisible
    );
    messagePaneMenuItem.disabled = accountCentralVisible;
  }

  const messagePaneAppMenuItem = document.getElementById("appmenu_showMessage");
  if (messagePaneAppMenuItem && !messagePaneAppMenuItem.hidden) {
    // Hidden in the standalone msg window.
    messagePaneAppMenuItem.setAttribute(
      "checked",
      accountCentralVisible ? false : messagePaneVisible
    );
    messagePaneAppMenuItem.disabled = accountCentralVisible;
  }

  const folderPaneMenuItem = document.getElementById("menu_showFolderPane");
  if (!folderPaneMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneMenuItem.setAttribute("checked", folderPaneVisible);
  }

  const folderPaneAppMenuItem = document.getElementById(
    "appmenu_showFolderPane"
  );
  if (!folderPaneAppMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneAppMenuItem.setAttribute("checked", folderPaneVisible);
  }

  const threadPaneMenuItem = document.getElementById(
    "menu_toggleThreadPaneHeader"
  );
  threadPaneMenuItem.setAttribute("disabled", !threadPaneHeaderVisible);

  const threadPaneAppMenuItem = document.getElementById(
    "appmenu_toggleThreadPaneHeader"
  );
  threadPaneAppMenuItem.toggleAttribute("disabled", !threadPaneHeaderVisible);

  // Disable some menus if account manager is showing
  document.getElementById("viewSortMenu").disabled = accountCentralVisible;

  document.getElementById("viewMessageViewMenu").disabled =
    accountCentralVisible;

  document.getElementById("viewMessagesMenu").disabled = accountCentralVisible;

  // Hide the "View > Messages" menu item if the user doesn't have the "Views"
  // (aka "Mail Views") toolbar button in the main toolbar. (See bug 1563789.)
  var viewsToolbarButton = ViewPickerBinding?.isVisible;
  document.getElementById("viewMessageViewMenu").hidden = !viewsToolbarButton;

  // Initialize the Message Body menuitem
  document.getElementById("viewBodyMenu").hidden = isFeed;

  // Initialize the Show Feed Summary menu
  const viewFeedSummary = document.getElementById("viewFeedSummary");
  viewFeedSummary.hidden = !isFeed;

  const viewRssMenuItemIds = [
    "bodyFeedGlobalWebPage",
    "bodyFeedGlobalSummary",
    "bodyFeedPerFolderPref",
  ];
  const checked = FeedMessageHandler.onSelectPref;
  for (const [index, id] of viewRssMenuItemIds.entries()) {
    document.getElementById(id).setAttribute("checked", index == checked);
  }

  // Initialize the View Attachment Inline menu
  var viewAttachmentInline = Services.prefs.getBoolPref(
    "mail.inline_attachments"
  );
  document
    .getElementById("viewAttachmentsInlineMenuitem")
    .setAttribute("checked", viewAttachmentInline);

  document.commandDispatcher.updateCommands("create-menu-view");

  // No need to do anything if we don't have a spaces toolbar like in standalone
  // windows or another non tabmail window.
  const spacesToolbarMenu = document.getElementById("appmenu_spacesToolbar");
  if (spacesToolbarMenu) {
    // Update the spaces toolbar menu items.
    const isSpacesVisible = !gSpacesToolbar.isHidden;
    spacesToolbarMenu.checked = isSpacesVisible;
    document
      .getElementById("viewToolbarsPopupSpacesToolbar")
      .setAttribute("checked", isSpacesVisible);
  }
}

function initUiDensityMenu(event) {
  // Prevent submenus from unnecessarily triggering onViewToolbarsPopupShowing
  // via bubbling of events.
  event.stopImmediatePropagation();

  // Apply the correct mode attribute to the various items.
  document.getElementById("uiDensityCompact").mode = UIDensity.MODE_COMPACT;
  document.getElementById("uiDensityNormal").mode = UIDensity.MODE_NORMAL;
  document.getElementById("uiDensityTouch").mode = UIDensity.MODE_TOUCH;

  // Fetch the currently active identity.
  const currentDensity = UIDensity.prefValue;

  for (const item of event.target.querySelectorAll("menuitem")) {
    if (item.mode == currentDensity) {
      item.setAttribute("checked", "true");
      break;
    }
  }
}

/**
 * Assign the proper mode to the UI density controls in the App Menu and set
 * the correct checked state based on the current density.
 */
function initUiDensityAppMenu() {
  // Apply the correct mode attribute to the various items.
  document.getElementById("appmenu_uiDensityCompact").mode =
    UIDensity.MODE_COMPACT;
  document.getElementById("appmenu_uiDensityNormal").mode =
    UIDensity.MODE_NORMAL;
  document.getElementById("appmenu_uiDensityTouch").mode = UIDensity.MODE_TOUCH;

  // Fetch the currently active identity.
  const currentDensity = UIDensity.prefValue;

  for (const item of document.querySelectorAll(
    "#appMenu-uiDensity-controls > toolbarbutton"
  )) {
    if (item.mode == currentDensity) {
      item.setAttribute("checked", "true");
    } else {
      item.removeAttribute("checked");
    }
  }
}

function InitViewLayoutStyleMenu(event, appmenu) {
  // Prevent submenus from unnecessarily triggering onViewToolbarsPopupShowing
  // via bubbling of events.
  event.stopImmediatePropagation();
  const paneConfig = Services.prefs.getIntPref("mail.pane_config.dynamic");

  const parent = appmenu
    ? event.target.querySelector(".panel-subview-body")
    : event.target;

  const layoutStyleMenuitem = parent.children[paneConfig];
  if (layoutStyleMenuitem) {
    layoutStyleMenuitem.setAttribute("checked", "true");
  }

  if (
    Services.xulStore.getValue(
      "chrome://messenger/content/messenger.xhtml",
      "threadPaneHeader",
      "hidden"
    ) !== "true"
  ) {
    parent
      .querySelector(`[name="threadheader"]`)
      .setAttribute("checked", "true");
  } else {
    parent.querySelector(`[name="threadheader"]`).removeAttribute("checked");
  }
}

/**
 * Called when showing the menu_viewSortPopup menupopup, so it should always
 * be up-to-date.
 */
function InitViewSortByMenu() {
  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (tab?.mode.name != "mail3PaneTab") {
    return;
  }

  const { gViewWrapper, threadPane } = tab.chromeBrowser.contentWindow;
  if (!gViewWrapper?.dbView) {
    return;
  }

  const { primarySortType, primarySortOrder, showGroupedBySort, showThreaded } =
    gViewWrapper;
  const hiddenColumns = threadPane.columns
    .filter(c => c.hidden)
    .map(c => c.sortKey);

  const isSortTypeValidForGrouping = [
    Ci.nsMsgViewSortType.byAccount,
    Ci.nsMsgViewSortType.byAttachments,
    Ci.nsMsgViewSortType.byAuthor,
    Ci.nsMsgViewSortType.byCorrespondent,
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortType.byFlagged,
    Ci.nsMsgViewSortType.byLocation,
    Ci.nsMsgViewSortType.byPriority,
    Ci.nsMsgViewSortType.byReceived,
    Ci.nsMsgViewSortType.byRecipient,
    Ci.nsMsgViewSortType.byStatus,
    Ci.nsMsgViewSortType.bySubject,
    Ci.nsMsgViewSortType.byTags,
    Ci.nsMsgViewSortType.byCustom,
  ].includes(primarySortType);

  const setSortItemAttrs = function (id, sortKey) {
    const menuItem = document.getElementById(id);
    menuItem.setAttribute(
      "checked",
      primarySortType == Ci.nsMsgViewSortType[sortKey]
    );
    if (hiddenColumns.includes(sortKey)) {
      menuItem.setAttribute("disabled", "true");
    } else {
      menuItem.removeAttribute("disabled");
    }
  };

  setSortItemAttrs("sortByDateMenuitem", "byDate");
  setSortItemAttrs("sortByReceivedMenuitem", "byReceived");
  setSortItemAttrs("sortByFlagMenuitem", "byFlagged");
  setSortItemAttrs("sortByOrderReceivedMenuitem", "byId");
  setSortItemAttrs("sortByPriorityMenuitem", "byPriority");
  setSortItemAttrs("sortBySizeMenuitem", "bySize");
  setSortItemAttrs("sortByStatusMenuitem", "byStatus");
  setSortItemAttrs("sortBySubjectMenuitem", "bySubject");
  setSortItemAttrs("sortByUnreadMenuitem", "byUnread");
  setSortItemAttrs("sortByTagsMenuitem", "byTags");
  setSortItemAttrs("sortByJunkStatusMenuitem", "byJunkStatus");
  setSortItemAttrs("sortByFromMenuitem", "byAuthor");
  setSortItemAttrs("sortByRecipientMenuitem", "byRecipient");
  setSortItemAttrs("sortByAttachmentsMenuitem", "byAttachments");
  setSortItemAttrs("sortByCorrespondentMenuitem", "byCorrespondent");

  document
    .getElementById("sortAscending")
    .setAttribute(
      "checked",
      primarySortOrder == Ci.nsMsgViewSortOrder.ascending
    );
  document
    .getElementById("sortDescending")
    .setAttribute(
      "checked",
      primarySortOrder == Ci.nsMsgViewSortOrder.descending
    );

  document.getElementById("sortThreaded").setAttribute("checked", showThreaded);
  document
    .getElementById("sortUnthreaded")
    .setAttribute("checked", !showThreaded && !showGroupedBySort);

  const groupBySortOrderMenuItem = document.getElementById("groupBySort");
  groupBySortOrderMenuItem.setAttribute(
    "disabled",
    !isSortTypeValidForGrouping
  );
  groupBySortOrderMenuItem.setAttribute("checked", showGroupedBySort);
}

function InitViewMessagesMenu() {
  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (!["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    return;
  }

  const viewWrapper = tab.chromeBrowser.contentWindow.gViewWrapper;

  document
    .getElementById("viewAllMessagesMenuItem")
    .setAttribute(
      "checked",
      !viewWrapper || (!viewWrapper.showUnreadOnly && !viewWrapper.specialView)
    );

  document
    .getElementById("viewUnreadMessagesMenuItem")
    .setAttribute("checked", !!viewWrapper?.showUnreadOnly);

  document
    .getElementById("viewThreadsWithUnreadMenuItem")
    .setAttribute("checked", !!viewWrapper?.specialViewThreadsWithUnread);

  document
    .getElementById("viewWatchedThreadsWithUnreadMenuItem")
    .setAttribute(
      "checked",
      !!viewWrapper?.specialViewWatchedThreadsWithUnread
    );

  document
    .getElementById("viewIgnoredThreadsMenuItem")
    .setAttribute("checked", !!viewWrapper?.showIgnored);
}

function InitMessageMenu() {
  const tab = document.getElementById("tabmail")?.currentTabInfo;
  let message, folder;
  let isDummy;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    ({ message, folder } = tab);
    isDummy = message && !folder;
  } else {
    message = document.getElementById("messageBrowser")?.contentWindow.gMessage;
    isDummy = !message?.folder;
  }

  const isNews = message?.folder?.flags & Ci.nsMsgFolderFlags.Newsgroup;
  const isFeed = message && FeedUtils.isFeedMessage(message);

  // We show reply to Newsgroups only for news messages.
  document.getElementById("replyNewsgroupMainMenu").hidden = !isNews;

  // For mail messages we say reply. For news we say ReplyToSender.
  document.getElementById("replyMainMenu").hidden = isNews;
  document.getElementById("replySenderMainMenu").hidden = !isNews;

  document.getElementById("menu_cancel").hidden =
    !isNews || !getEnabledControllerForCommand("cmd_cancel");

  // Disable the move menu if there are no messages selected or if
  // the message is a dummy - e.g. opening a message in the standalone window.
  const messageStoredInternally = message && !isDummy;
  // Disable the move menu if we can't delete msgs from the folder.
  const canMove =
    messageStoredInternally && !isNews && message.folder.canDeleteMessages;

  document.getElementById("moveMenu").disabled = !canMove;

  document.getElementById("copyMenu").disabled = !message;

  initMoveToFolderAgainMenu(document.getElementById("moveToFolderAgain"));

  // Disable the Forward As menu item if no message is selected.
  document.getElementById("forwardAsMenu").disabled = !message;

  // Disable the Attachments menu if no message is selected and we don't have
  // any attachment.
  const aboutMessage =
    document.getElementById("tabmail")?.currentAboutMessage ||
    document.getElementById("messageBrowser")?.contentWindow;
  document.getElementById("msgAttachmentMenu").disabled =
    !message || !aboutMessage?.currentAttachments.length;

  // Disable the Tag menu item if no message is selected or when we're
  // not in a folder.
  document.getElementById("tagMenu").disabled = !messageStoredInternally;

  // Show "Edit Draft Message" menus only in a drafts folder; otherwise hide them.
  showCommandInSpecialFolder("cmd_editDraftMsg", Ci.nsMsgFolderFlags.Drafts);
  // Show "New Message from Template" and "Edit Template" menus only in a
  // templates folder; otherwise hide them.
  showCommandInSpecialFolder(
    ["cmd_newMsgFromTemplate", "cmd_editTemplateMsg"],
    Ci.nsMsgFolderFlags.Templates
  );

  // Initialize the Open Message menuitem
  var winType = document.documentElement.getAttribute("windowtype");
  if (winType == "mail:3pane") {
    document.getElementById("openMessageWindowMenuitem").hidden = isFeed;
  }

  // Initialize the Open Feed Message handler menu
  const index = FeedMessageHandler.onOpenPref;
  document
    .getElementById("menu_openFeedMessage")
    .children[index].setAttribute("checked", true);

  const openRssMenu = document.getElementById("openFeedMessage");
  openRssMenu.hidden = !isFeed;
  if (winType != "mail:3pane") {
    openRssMenu.hidden = true;
  }

  // Disable mark menu when we're not in a folder.
  document.getElementById("markMenu").disabled = !folder || folder.isServer;

  document.commandDispatcher.updateCommands("create-menu-message");

  for (const id of ["killThread", "killSubthread", "watchThread"]) {
    const item = document.getElementById(id);
    const command = document.getElementById(item.getAttribute("command"));
    if (command.hasAttribute("checked")) {
      item.setAttribute("checked", command.getAttribute("checked"));
    } else {
      item.removeAttribute("checked");
    }
  }
}

/**
 * Show folder-specific menu items only for messages in special folders, e.g.
 * show 'cmd_editDraftMsg' in Drafts folder, or
 * show 'cmd_newMsgFromTemplate' in Templates folder.
 *
 * aCommandIds  single ID string of command or array of IDs of commands
 *              to be shown in folders having aFolderFlag
 * aFolderFlag  the nsMsgFolderFlag that the folder must have to show the command
 */
function showCommandInSpecialFolder(aCommandIds, aFolderFlag) {
  let folder, message;

  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    ({ message, folder } = tab);
  } else if (tab?.mode.tabType.name == "mail") {
    ({ displayedFolder: folder, selectedMessage: message } = tab.folderDisplay);
  }

  const inSpecialFolder =
    message?.folder?.isSpecialFolder(aFolderFlag, true) ||
    (folder && folder.getFlag(aFolderFlag));
  if (typeof aCommandIds === "string") {
    aCommandIds = [aCommandIds];
  }

  aCommandIds.forEach(cmdId =>
    document.getElementById(cmdId).setAttribute("hidden", !inSpecialFolder)
  );
}

/**
 * Initializes the menu item aMenuItem to show either "Move" or "Copy" to
 * folder again, based on the value of mail.last_msg_movecopy_target_uri.
 * The menu item label and accesskey are adjusted to include the folder name.
 *
 * @param aMenuItem the menu item to adjust
 */
function initMoveToFolderAgainMenu(aMenuItem) {
  const lastFolderURI = Services.prefs.getStringPref(
    "mail.last_msg_movecopy_target_uri"
  );

  if (!lastFolderURI) {
    return;
  }
  const destMsgFolder = MailUtils.getExistingFolder(lastFolderURI);
  if (!destMsgFolder) {
    return;
  }
  const bundle = document.getElementById("bundle_messenger");
  const isMove = Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move");
  const stringName = isMove ? "moveToFolderAgain" : "copyToFolderAgain";
  aMenuItem.label = bundle.getFormattedString(
    stringName,
    [destMsgFolder.prettyName],
    1
  );
  // This gives us moveToFolderAgainAccessKey and copyToFolderAgainAccessKey.
  aMenuItem.accesskey = bundle.getString(stringName + "AccessKey");
}

/**
 * Update the "Show Header" menu items to reflect the current pref.
 */
function InitViewHeadersMenu() {
  const dt = Ci.nsMimeHeaderDisplayTypes;
  const headerchoice = Services.prefs.getIntPref("mail.show_headers");
  document
    .getElementById("cmd_viewAllHeader")
    .setAttribute("checked", headerchoice == dt.AllHeaders);
  document
    .getElementById("cmd_viewNormalHeader")
    .setAttribute("checked", headerchoice == dt.NormalHeaders);
  document.commandDispatcher.updateCommands("create-menu-mark");
}

function InitViewBodyMenu() {
  let message;

  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
  }

  // Separate render prefs not implemented for feeds, bug 458606.  Show the
  // checked item for feeds as for the regular pref.
  //  let html_as = Services.prefs.getIntPref("rss.display.html_as");
  //  let prefer_plaintext = Services.prefs.getBoolPref("rss.display.prefer_plaintext");
  //  let disallow_classes = Services.prefs.getIntPref("rss.display.disallow_mime_handlers");
  const html_as = Services.prefs.getIntPref("mailnews.display.html_as");
  const prefer_plaintext = Services.prefs.getBoolPref(
    "mailnews.display.prefer_plaintext"
  );
  const disallow_classes = Services.prefs.getIntPref(
    "mailnews.display.disallow_mime_handlers"
  );
  const isFeed = FeedUtils.isFeedMessage(message);
  const defaultIDs = [
    "bodyAllowHTML",
    "bodySanitized",
    "bodyAsPlaintext",
    "bodyAllParts",
  ];
  const rssIDs = [
    "bodyFeedSummaryAllowHTML",
    "bodyFeedSummarySanitized",
    "bodyFeedSummaryAsPlaintext",
  ];
  const menuIDs = isFeed ? rssIDs : defaultIDs;

  if (disallow_classes > 0) {
    gDisallow_classes_no_html = disallow_classes;
  }
  // else gDisallow_classes_no_html keeps its initial value (see top)

  const AllowHTML_menuitem = document.getElementById(menuIDs[0]);
  const Sanitized_menuitem = document.getElementById(menuIDs[1]);
  const AsPlaintext_menuitem = document.getElementById(menuIDs[2]);
  const AllBodyParts_menuitem = menuIDs[3]
    ? document.getElementById(menuIDs[3])
    : null;

  document.getElementById("bodyAllParts").hidden = !Services.prefs.getBoolPref(
    "mailnews.display.show_all_body_parts_menu"
  );

  if (
    !prefer_plaintext &&
    !html_as &&
    !disallow_classes &&
    AllowHTML_menuitem
  ) {
    AllowHTML_menuitem.setAttribute("checked", true);
  } else if (
    !prefer_plaintext &&
    html_as == 3 &&
    disallow_classes > 0 &&
    Sanitized_menuitem
  ) {
    Sanitized_menuitem.setAttribute("checked", true);
  } else if (
    prefer_plaintext &&
    html_as == 1 &&
    disallow_classes > 0 &&
    AsPlaintext_menuitem
  ) {
    AsPlaintext_menuitem.setAttribute("checked", true);
  } else if (
    !prefer_plaintext &&
    html_as == 4 &&
    !disallow_classes &&
    AllBodyParts_menuitem
  ) {
    AllBodyParts_menuitem.setAttribute("checked", true);
  }
  // else (the user edited prefs/user.js) check none of the radio menu items

  if (isFeed) {
    AllowHTML_menuitem.hidden = !FeedMessageHandler.gShowSummary;
    Sanitized_menuitem.hidden = !FeedMessageHandler.gShowSummary;
    AsPlaintext_menuitem.hidden = !FeedMessageHandler.gShowSummary;
    document.getElementById("viewFeedSummarySeparator").hidden =
      !gShowFeedSummary;
  }
}

function ShowMenuItem(id, showItem) {
  document.getElementById(id).hidden = !showItem;
}

function EnableMenuItem(id, enableItem) {
  document.getElementById(id).disabled = !enableItem;
}

function SetMenuItemLabel(menuItemId, customLabel) {
  var menuItem = document.getElementById(menuItemId);
  if (menuItem) {
    menuItem.setAttribute("label", customLabel);
  }
}

/**
 * Refresh the contents of the tag popup menu/panel.
 * Used for example for appmenu/Message/Tag panel.
 *
 * @param {Element} parent - Parent element that will contain the menu items.
 * @param {string} [elementName] - Type of menu item, e.g. "menuitem", "toolbarbutton".
 * @param {string} [classes] - Classes to set on the menu items.
 */
function InitMessageTags(parent, elementName = "menuitem", classes) {
  function SetMessageTagLabel(menuitem, index, name) {
    // if a <key> is defined for this tag, use its key as the accesskey
    // (the key for the tag at index n needs to have the id key_tag<n>)
    const shortcutkey = document.getElementById("key_tag" + index);
    const accesskey = shortcutkey ? shortcutkey.getAttribute("key") : "  ";
    if (accesskey != "  ") {
      menuitem.setAttribute("accesskey", accesskey);
      menuitem.setAttribute("acceltext", accesskey);
    }
    const label = document
      .getElementById("bundle_messenger")
      .getFormattedString("mailnews.tags.format", [accesskey, name]);
    menuitem.setAttribute("label", label);
  }

  let message;

  const tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
  } else {
    message = document.getElementById("messageBrowser")?.contentWindow.gMessage;
  }

  const tagArray = MailServices.tags.getAllTags();
  const elementNameUpperCase = elementName.toUpperCase();

  // Remove any existing non-static items (clear tags list before rebuilding it).
  // There is a separator element above the dynamically added tag elements, so
  // remove dynamically added elements below the separator.
  while (
    parent.lastElementChild.tagName.toUpperCase() == elementNameUpperCase
  ) {
    parent.lastChild.remove();
  }

  // Create label and accesskey for the static "remove all tags" item.
  const tagRemoveLabel = document
    .getElementById("bundle_messenger")
    .getString("mailnews.tags.remove");
  SetMessageTagLabel(
    parent.lastElementChild.previousElementSibling,
    0,
    tagRemoveLabel
  );

  // Rebuild the list.
  const curKeys = message.getStringProperty("keywords");

  tagArray.forEach((tagInfo, index) => {
    const removeKey = ` ${curKeys} `.includes(` ${tagInfo.key} `);

    if (tagInfo.ordinal.includes("~AUTOTAG") && !removeKey) {
      return;
    }
    // TODO We want to either remove or "check" the tags that already exist.
    const item = parent.ownerDocument.createXULElement(elementName);
    SetMessageTagLabel(item, index + 1, tagInfo.tag);

    if (removeKey) {
      item.setAttribute("checked", "true");
    }
    item.setAttribute("value", tagInfo.key);
    item.setAttribute("type", "checkbox");
    item.addEventListener("command", function (event) {
      goDoCommand("cmd_toggleTag", event);
    });

    if (tagInfo.color) {
      item.setAttribute("style", `color: ${tagInfo.color};`);
    }
    if (classes) {
      item.setAttribute("class", classes);
    }
    parent.appendChild(item);
  });
}

function getMsgToolbarMenu_init() {
  document.commandDispatcher.updateCommands("create-menu-getMsgToolbar");
}

function InitMessageMark() {
  const tab = document.getElementById("tabmail")?.currentTabInfo;
  const flaggedItem = document.getElementById("markFlaggedMenuItem");
  if (tab?.message?.isFlagged) {
    flaggedItem.setAttribute("checked", "true");
  } else {
    flaggedItem.removeAttribute("checked");
  }

  document.commandDispatcher.updateCommands("create-menu-mark");
}

function GetFirstSelectedMsgFolder() {
  try {
    var selectedFolders = GetSelectedMsgFolders();
  } catch (e) {
    console.error(e);
  }
  return selectedFolders.length > 0 ? selectedFolders[0] : null;
}

function GetMessagesForInboxOnServer(server) {
  var inboxFolder = MailUtils.getInboxFolder(server);

  // If the server doesn't support an inbox it could be an RSS server or some
  // other server type. Just use the root folder and the server implementation
  // can figure out what to do.
  if (!inboxFolder) {
    inboxFolder = server.rootFolder;
  }

  GetNewMsgs(server, inboxFolder);
}

function MsgGetMessage(folders) {
  // if offline, prompt for getting messages
  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    GetFolderMessages(folders);
  }
}

function MsgPauseUpdates(selectedFolders = GetSelectedMsgFolders(), pause) {
  // Pause single feed folder subscription updates, or all account updates if
  // folder is the account folder.
  const folder = selectedFolders.length ? selectedFolders[0] : null;
  if (!FeedUtils.isFeedFolder(folder)) {
    return;
  }

  FeedUtils.pauseFeedFolderUpdates(folder, pause, true);
  Services.obs.notifyObservers(folder, "folder-properties-changed");
}

function MsgGetMessagesForAllServers(defaultServer) {
  // now log into any server
  try {
    // Array of arrays of servers for a particular folder.
    var pop3DownloadServersArray = [];
    // Parallel array of folders to download to...
    var localFoldersToDownloadTo = [];
    var pop3Server;
    for (const server of MailServices.accounts.allServers) {
      if (server.protocolInfo.canLoginAtStartUp && server.loginAtStartUp) {
        if (
          defaultServer &&
          defaultServer.equals(server) &&
          !defaultServer.isDeferredTo &&
          defaultServer.rootFolder == defaultServer.rootMsgFolder
        ) {
          // skip, already opened
        } else if (server.type == "pop3" && server.downloadOnBiff) {
          CoalesceGetMsgsForPop3ServersByDestFolder(
            server,
            pop3DownloadServersArray,
            localFoldersToDownloadTo
          );
          pop3Server = server.QueryInterface(Ci.nsIPop3IncomingServer);
        } else {
          // Check to see if there are new messages on the server
          server.performBiff(msgWindow);
        }
      }
    }
    for (let i = 0; i < pop3DownloadServersArray.length; ++i) {
      // Any ol' pop3Server will do - the serversArray specifies which servers
      // to download from.
      pop3Server.downloadMailFromServers(
        pop3DownloadServersArray[i],
        msgWindow,
        localFoldersToDownloadTo[i],
        null
      );
    }
  } catch (ex) {
    dump(ex + "\n");
  }
}

/**
 * Get messages for all those accounts which have the capability
 * of getting messages and have session password available i.e.,
 * currently logged in accounts.
 * if offline, prompt for getting messages.
 */
function MsgGetMessagesForAllAuthenticatedAccounts() {
  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    GetMessagesForAllAuthenticatedAccounts();
  }
}

/**
 * Get messages for the account selected from Menu dropdowns.
 * if offline, prompt for getting messages.
 *
 * @param aFolder (optional) a folder in the account for which messages should
 *                           be retrieved.  If null, all accounts will be used.
 */
function MsgGetMessagesForAccount(aFolder) {
  if (!aFolder) {
    goDoCommand("cmd_getNewMessages");
    return;
  }

  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    var server = aFolder.server;
    GetMessagesForInboxOnServer(server);
  }
}

// if offline, prompt for getNextNMessages
function MsgGetNextNMessages() {
  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    GetNextNMessages(GetFirstSelectedMsgFolder());
  }
}

function MsgNewMessage(event) {
  const msgFolder = document.getElementById("tabmail")?.currentTabInfo.folder;

  if (event?.shiftKey) {
    ComposeMessage(
      Ci.nsIMsgCompType.New,
      Ci.nsIMsgCompFormat.OppositeOfDefault,
      msgFolder,
      []
    );
  } else {
    ComposeMessage(
      Ci.nsIMsgCompType.New,
      Ci.nsIMsgCompFormat.Default,
      msgFolder,
      []
    );
  }
}

/** Open subscribe window. */
function MsgSubscribe(folder) {
  var preselectedFolder = folder || GetFirstSelectedMsgFolder();

  if (FeedUtils.isFeedFolder(preselectedFolder)) {
    // Open feed subscription dialog.
    openSubscriptionsDialog(preselectedFolder);
  } else {
    // Open IMAP/NNTP subscription dialog.
    Subscribe(preselectedFolder);
  }
}

/**
 * Show a confirmation dialog - check if the user really want to unsubscribe
 * from the given newsgroup/s.
 *
 * @folders an array of newsgroup folders to unsubscribe from
 * @returns true if the user said it's ok to unsubscribe
 */
function ConfirmUnsubscribe(folders) {
  var bundle = document.getElementById("bundle_messenger");
  var titleMsg = bundle.getString("confirmUnsubscribeTitle");
  var dialogMsg =
    folders.length == 1
      ? bundle.getFormattedString(
          "confirmUnsubscribeText",
          [folders[0].name],
          1
        )
      : bundle.getString("confirmUnsubscribeManyText");

  return Services.prompt.confirm(window, titleMsg, dialogMsg);
}

/**
 * Unsubscribe from selected or passed in newsgroup/s.
 * @param {nsIMsgFolder[]} selectedFolders - The folders to unsubscribe.
 */
function MsgUnsubscribe(folders) {
  if (!ConfirmUnsubscribe(folders)) {
    return;
  }

  for (let i = 0; i < folders.length; i++) {
    const subscribableServer = folders[i].server.QueryInterface(
      Ci.nsISubscribableServer
    );
    subscribableServer.unsubscribe(folders[i].name);
    subscribableServer.commitSubscribeChanges();
  }
}

function MsgOpenNewWindowForFolder(folderURI, msgKeyToSelect) {
  window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "chrome,all,dialog=no",
    folderURI,
    msgKeyToSelect
  );
}

/**
 * UI-triggered command to open the currently selected folder(s) in new tabs.
 *
 * @param {nsIMsgFolder[]} folders - Folders to open in new tabs.
 * @param {object} [tabParams] - Parameters to pass to the new tabs.
 */
function MsgOpenNewTabForFolders(folders, tabParams = {}) {
  if (tabParams.background === undefined) {
    tabParams.background = Services.prefs.getBoolPref(
      "mail.tabs.loadInBackground"
    );
    if (tabParams.event?.shiftKey) {
      tabParams.background = !tabParams.background;
    }
  }

  const tabmail = document.getElementById("tabmail");
  for (let i = 0; i < folders.length; i++) {
    tabmail.openTab("mail3PaneTab", {
      ...tabParams,
      folderURI: folders[i].URI,
    });
  }
}

function MsgOpenFromFile() {
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  var bundle = document.getElementById("bundle_messenger");
  var filterLabel = bundle.getString("EMLFiles");
  var windowTitle = bundle.getString("OpenEMLFiles");

  fp.init(window, windowTitle, Ci.nsIFilePicker.modeOpen);
  fp.appendFilter(filterLabel, "*.eml");

  // Default or last filter is "All Files".
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    MailUtils.openEMLFile(window, fp.file, fp.fileURL);
  });
}

function MsgOpenNewWindowForMessage(aMsgHdr, aView) {
  // We need to tell the window about our current view so that it can clone it.
  // This enables advancing through the messages, etc.
  return window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    aMsgHdr,
    aView
  );
}

/**
 * Display the given message in an existing folder tab.
 *
 * @param aMsgHdr The message header to display.
 */
function MsgDisplayMessageInFolderTab(aMsgHdr) {
  const tabmail = document.getElementById("tabmail");
  tabmail.switchToTab(0);
  tabmail.currentAbout3Pane.selectMessage(aMsgHdr);
}

function MsgMarkAllRead(folders) {
  for (let i = 0; i < folders.length; i++) {
    folders[i].markAllMessagesRead(msgWindow);
  }
}

/**
 * Go through each selected server and mark all its folders read.
 *
 * @param {nsIMsgFolder[]} selectedFolders - Folders in the servers to be
 *   marked as read.
 */
function MsgMarkAllFoldersRead(selectedFolders) {
  const selectedServers = selectedFolders.filter(folder => folder.isServer);
  if (!selectedServers.length) {
    return;
  }

  const bundle = document.getElementById("bundle_messenger");
  if (
    !Services.prompt.confirm(
      window,
      bundle.getString("confirmMarkAllFoldersReadTitle"),
      bundle.getString("confirmMarkAllFoldersReadMessage")
    )
  ) {
    return;
  }

  selectedServers.forEach(function (server) {
    for (const folder of server.rootFolder.descendants) {
      folder.markAllMessagesRead(msgWindow);
    }
  });
}

/**
 * Opens the filter list.
 * If an email address was passed, first a new filter is offered for creation
 * with the data prefilled.
 *
 * @param {?string} emailAddress - An email address to use as value in the first
 *   search term.
 * @param {?nsIMsgFolder} folder - The filter will be created in this folder's
 *   filter list.
 * @param {?string} fieldName - Search field string, from
 *   nsMsgSearchTerm.cpp::SearchAttribEntryTable.
 */
function MsgFilters(emailAddress, folder, fieldName) {
  // Don't trigger anything if there are no accounts configured. This is to
  // disable potential triggers via shortcuts.
  if (MailServices.accounts.accounts.length == 0) {
    return;
  }

  if (!folder) {
    const chromeBrowser =
      document.getElementById("tabmail")?.currentTabInfo.chromeBrowser ||
      document.getElementById("messageBrowser");
    const dbView = chromeBrowser?.contentWindow?.gDBView;
    // Try to determine the folder from the selected message.
    if (dbView?.numSelected) {
      // Here we face a decision. If the message has been moved to a different
      // account, then a single filter cannot work for both manual and incoming
      // scope. So we will create the filter based on its existing location,
      // which will make it work properly in manual scope. This is the best
      // solution for POP3 with global inbox (as then both manual and incoming
      // filters work correctly), but may not be what IMAP users who filter to a
      // local folder really want.
      folder = dbView.hdrForFirstSelectedMessage.folder;
    }
    if (!folder) {
      folder = GetFirstSelectedMsgFolder();
    }
  }
  let args;
  if (emailAddress) {
    // We have to do prefill filter so we are going to launch the filterEditor
    // dialog and prefill that with the emailAddress.
    args = {
      filterList: folder.getEditableFilterList(msgWindow),
      filterName: emailAddress,
    };
    // Set the field name to prefill in the filter, if one was specified.
    if (fieldName) {
      args.fieldName = fieldName;
    }

    window.openDialog(
      "chrome://messenger/content/FilterEditor.xhtml",
      "",
      "chrome, modal, resizable,centerscreen,dialog=yes",
      args
    );

    // If the user hits OK in the filterEditor dialog we set args.refresh=true
    // there and we check this here in args to show filterList dialog.
    // We also received the filter created via args.newFilter.
    if ("refresh" in args && args.refresh) {
      args = { refresh: true, folder, filter: args.newFilter };
      MsgFilterList(args);
    }
  } else {
    // Just launch filterList dialog.
    args = { refresh: false, folder };
    MsgFilterList(args);
  }
}

function MsgViewAllHeaders() {
  Services.prefs.setIntPref(
    "mail.show_headers",
    Ci.nsMimeHeaderDisplayTypes.AllHeaders
  );
}

function MsgViewNormalHeaders() {
  Services.prefs.setIntPref(
    "mail.show_headers",
    Ci.nsMimeHeaderDisplayTypes.NormalHeaders
  );
}

function MsgBodyAllowHTML() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 0);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", 0);
}

function MsgBodySanitized() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 3);
  Services.prefs.setIntPref(
    "mailnews.display.disallow_mime_handlers",
    gDisallow_classes_no_html
  );
}

function MsgBodyAsPlaintext() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);
  Services.prefs.setIntPref("mailnews.display.html_as", 1);
  Services.prefs.setIntPref(
    "mailnews.display.disallow_mime_handlers",
    gDisallow_classes_no_html
  );
}

function MsgBodyAllParts() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 4);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", 0);
}

function MsgFeedBodyRenderPrefs(plaintext, html, mime) {
  // Separate render prefs not implemented for feeds, bug 458606.
  //  Services.prefs.setBoolPref("rss.display.prefer_plaintext", plaintext);
  //  Services.prefs.setIntPref("rss.display.html_as", html);
  //  Services.prefs.setIntPref("rss.display.disallow_mime_handlers", mime);

  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", plaintext);
  Services.prefs.setIntPref("mailnews.display.html_as", html);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", mime);
  // Reload only if showing rss summary; menuitem hidden if web page..
}

function ToggleInlineAttachment(target) {
  var viewAttachmentInline = !Services.prefs.getBoolPref(
    "mail.inline_attachments"
  );
  Services.prefs.setBoolPref("mail.inline_attachments", viewAttachmentInline);
  target.setAttribute("checked", viewAttachmentInline ? "true" : "false");
}

function IsGetNewMessagesEnabled() {
  for (const server of MailServices.accounts.allServers) {
    if (server.type == "none") {
      continue;
    }
    return true;
  }
  return false;
}

function IsGetNextNMessagesEnabled() {
  const selectedFolders = GetSelectedMsgFolders();
  const folder = selectedFolders.length ? selectedFolders[0] : null;

  const menuItem = document.getElementById("menu_getnextnmsg");
  if (
    folder &&
    !folder.isServer &&
    folder.server instanceof Ci.nsINntpIncomingServer
  ) {
    menuItem.label = PluralForm.get(
      folder.server.maxArticles,
      document
        .getElementById("bundle_messenger")
        .getString("getNextNewsMessages")
    ).replace("#1", folder.server.maxArticles);
    menuItem.removeAttribute("hidden");
    return true;
  }

  menuItem.setAttribute("hidden", "true");
  return false;
}

function MsgSynchronizeOffline() {
  window.openDialog(
    "chrome://messenger/content/msgSynchronize.xhtml",
    "",
    "centerscreen,chrome,modal,titlebar,resizable=yes",
    { msgWindow }
  );
}

function IsAccountOfflineEnabled() {
  var selectedFolders = GetSelectedMsgFolders();

  if (selectedFolders && selectedFolders.length == 1) {
    return selectedFolders[0].supportsOffline;
  }
  return false;
}

function GetDefaultAccountRootFolder() {
  var account = MailServices.accounts.defaultAccount;
  if (account) {
    return account.incomingServer.rootMsgFolder;
  }

  return null;
}

/**
 * Check for new messages for all selected folders, or for the default account
 * in case no folders are selected.
 */
function GetFolderMessages(selectedFolders = GetSelectedMsgFolders()) {
  var defaultAccountRootFolder = GetDefaultAccountRootFolder();

  // if nothing selected, use the default
  var folders = selectedFolders.length
    ? selectedFolders
    : [defaultAccountRootFolder];

  if (!folders[0]) {
    return;
  }

  for (var i = 0; i < folders.length; i++) {
    var serverType = folders[i].server.type;
    if (folders[i].isServer && serverType == "nntp") {
      // If we're doing "get msgs" on a news server.
      // Update unread counts on this server.
      folders[i].server.performExpand(msgWindow);
    } else if (folders[i].isServer && serverType == "imap") {
      GetMessagesForInboxOnServer(folders[i].server);
    } else if (serverType == "none") {
      // If "Local Folders" is selected and the user does "Get Msgs" and
      // LocalFolders is not deferred to, get new mail for the default account
      //
      // XXX TODO
      // Should shift click get mail for all (authenticated) accounts?
      // see bug #125885.
      if (!folders[i].server.isDeferredTo) {
        if (!defaultAccountRootFolder) {
          continue;
        }
        GetNewMsgs(defaultAccountRootFolder.server, defaultAccountRootFolder);
      } else {
        GetNewMsgs(folders[i].server, folders[i]);
      }
    } else {
      GetNewMsgs(folders[i].server, folders[i]);
    }
  }
}

/**
 * Gets new messages for the given server, for the given folder.
 *
 * @param server which nsIMsgIncomingServer to check for new messages
 * @param folder which nsIMsgFolder folder to check for new messages
 */
function GetNewMsgs(server, folder) {
  // Note that for Global Inbox folder.server != server when we want to get
  // messages for a specific account.

  // Whenever we do get new messages, clear the old new messages.
  folder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  folder.clearNewMessages();
  server.getNewMessages(folder, msgWindow, new TransportErrorUrlListener());
}

function InformUserOfCertError(secInfo, targetSite) {
  const params = {
    exceptionAdded: false,
    securityInfo: secInfo,
    prefetchCert: true,
    location: targetSite,
  };
  window.openDialog(
    "chrome://pippki/content/exceptionDialog.xhtml",
    "",
    "chrome,centerscreen,modal",
    params
  );
}

/**
 * A listener to be passed to the url object of the server request being issued
 * to detect the bad server certificates.
 *
 * @implements {nsIUrlListener}
 */
function TransportErrorUrlListener() {}

TransportErrorUrlListener.prototype = {
  OnStartRunningUrl(url) {},

  OnStopRunningUrl(url, exitCode) {
    if (Components.isSuccessCode(exitCode)) {
      return;
    }
    const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
      Ci.nsINSSErrorsService
    );
    try {
      const errorClass = nssErrorsService.getErrorClass(exitCode);
      if (errorClass == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        const mailNewsUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
        const secInfo = mailNewsUrl.failedSecInfo;
        InformUserOfCertError(secInfo, url.asciiHostPort);
      }
    } catch (e) {
      // It's not an NSS error.
    }
  },

  // nsISupports
  QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),
};

function SendUnsentMessages() {
  const msgSendlater = Cc[
    "@mozilla.org/messengercompose/sendlater;1"
  ].getService(Ci.nsIMsgSendLater);

  for (const identity of MailServices.accounts.allIdentities) {
    const msgFolder = msgSendlater.getUnsentMessagesFolder(identity);
    if (msgFolder) {
      const numMessages = msgFolder.getTotalMessages(
        false /* include subfolders */
      );
      if (numMessages > 0) {
        msgSendlater.sendUnsentMessages(identity);
        // Right now, all identities point to the same unsent messages
        // folder, so to avoid sending multiple copies of the
        // unsent messages, we only call messenger.SendUnsentMessages() once.
        // See bug #89150 for details.
        break;
      }
    }
  }
}

function CoalesceGetMsgsForPop3ServersByDestFolder(
  currentServer,
  pop3DownloadServersArray,
  localFoldersToDownloadTo
) {
  var inboxFolder = currentServer.rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  // coalesce the servers that download into the same folder...
  var index = localFoldersToDownloadTo.indexOf(inboxFolder);
  if (index == -1) {
    if (inboxFolder) {
      inboxFolder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
      inboxFolder.clearNewMessages();
    }
    localFoldersToDownloadTo.push(inboxFolder);
    index = pop3DownloadServersArray.length;
    pop3DownloadServersArray.push([]);
  }
  pop3DownloadServersArray[index].push(currentServer);
}

function GetMessagesForAllAuthenticatedAccounts() {
  // now log into any server
  try {
    // Array of arrays of servers for a particular folder.
    var pop3DownloadServersArray = [];
    // parallel array of folders to download to...
    var localFoldersToDownloadTo = [];
    var pop3Server;

    for (const server of MailServices.accounts.allServers) {
      if (
        server.protocolInfo.canGetMessages &&
        !server.passwordPromptRequired
      ) {
        if (server.type == "pop3") {
          CoalesceGetMsgsForPop3ServersByDestFolder(
            server,
            pop3DownloadServersArray,
            localFoldersToDownloadTo
          );
          pop3Server = server.QueryInterface(Ci.nsIPop3IncomingServer);
        } else {
          // get new messages on the server for imap or rss
          GetMessagesForInboxOnServer(server);
        }
      }
    }
    for (let i = 0; i < pop3DownloadServersArray.length; ++i) {
      // any ol' pop3Server will do - the serversArray specifies which servers to download from
      pop3Server.downloadMailFromServers(
        pop3DownloadServersArray[i],
        msgWindow,
        localFoldersToDownloadTo[i],
        null
      );
    }
  } catch (ex) {
    dump(ex + "\n");
  }
}

function CommandUpdate_UndoRedo() {
  EnableMenuItem("menu_undo", SetupUndoRedoCommand("cmd_undo"));
  EnableMenuItem("menu_redo", SetupUndoRedoCommand("cmd_redo"));
}

function SetupUndoRedoCommand(command) {
  const folder = document.getElementById("tabmail")?.currentTabInfo.folder;
  if (!folder?.server.canUndoDeleteOnServer) {
    return false;
  }

  let canUndoOrRedo = false;
  let txnType;
  try {
    if (command == "cmd_undo") {
      canUndoOrRedo = messenger.canUndo();
      txnType = messenger.getUndoTransactionType();
    } else {
      canUndoOrRedo = messenger.canRedo();
      txnType = messenger.getRedoTransactionType();
    }
  } catch (ex) {
    // If this fails, assume we can't undo or redo.
    console.error(ex);
  }

  if (canUndoOrRedo) {
    const commands = {
      [Ci.nsIMessenger.eUnknown]: "valueDefault",
      [Ci.nsIMessenger.eDeleteMsg]: "valueDeleteMsg",
      [Ci.nsIMessenger.eMoveMsg]: "valueMoveMsg",
      [Ci.nsIMessenger.eCopyMsg]: "valueCopyMsg",
      [Ci.nsIMessenger.eMarkAllMsg]: "valueUnmarkAllMsgs",
    };
    goSetMenuValue(command, commands[txnType]);
  } else {
    goSetMenuValue(command, "valueDefault");
  }

  return canUndoOrRedo;
}

/**
 * Focus the gloda global search input box on current tab, or,
 * if the search box is not available, open a new gloda search tab
 * (with its search box focused).
 */
function QuickSearchFocus() {
  // Default to focusing the search box on the current tab
  let newTab = false;
  let searchInput;
  const tabmail = document.getElementById("tabmail");
  // Tabmail should never be undefined.
  if (!tabmail || tabmail.globalOverlay) {
    return;
  }

  switch (tabmail.currentTabInfo.mode.name) {
    case "glodaFacet":
      // If we're currently viewing a Gloda tab, drill down to find the
      // built-in search input, and select that.
      searchInput = tabmail.currentTabInfo.panel.querySelector(
        ".remote-gloda-search"
      );
      break;
    default:
      searchInput = document.querySelector(
        "#unifiedToolbarContent .search-bar global-search-bar"
      );
      break;
  }

  if (!searchInput) {
    // If searchInput is not found on current tab (e.g. removed by user),
    // use a new tab.
    newTab = true;
  } else {
    // The searchInput element exists on current tab.
    // However, via toolbar customization, it can be in different places:
    // Toolbars, tab bar, menu bar, etc. If the containing elements are hidden,
    // searchInput will also be hidden, so clientHeight and clientWidth of the
    // searchbox or one of its parents will typically be zero and we can test
    // for that. If searchInput is hidden, use a new tab.
    let element = searchInput;
    while (element) {
      if (element.clientHeight == 0 || element.clientWidth == 0) {
        newTab = true;
      }
      element = element.parentElement;
    }
  }

  if (!newTab) {
    // Focus and select global search box on current tab.
    if (searchInput.select) {
      searchInput.select();
    } else {
      searchInput.focus();
    }
  } else {
    // Open a new global search tab (with focus on its global search box)
    tabmail.openTab("glodaFacet");
  }
}

/**
 * Open a new gloda search tab, with its search box focused.
 */
function openGlodaSearchTab() {
  document.getElementById("tabmail").openTab("glodaFacet");
}

function MsgSearchAddresses() {
  var args = { directory: null };
  OpenOrFocusWindow(
    args,
    "mailnews:absearch",
    "chrome://messenger/content/addressbook/abSearchDialog.xhtml"
  );
}

function MsgFilterList(args) {
  OpenOrFocusWindow(
    args,
    "mailnews:filterlist",
    "chrome://messenger/content/FilterListDialog.xhtml"
  );
}

function OpenOrFocusWindow(args, windowType, chromeURL) {
  var desiredWindow = Services.wm.getMostRecentWindow(windowType);

  if (desiredWindow) {
    desiredWindow.focus();
    if ("refresh" in args && args.refresh) {
      desiredWindow.refresh(args);
    }
  } else {
    window.openDialog(
      chromeURL,
      "",
      "chrome,resizable,status,centerscreen,dialog=no",
      args
    );
  }
}

function initAppMenuPopup() {
  file_init();
  view_init();
  InitGoMessagesMenu();
  menu_new_init();
  CommandUpdate_UndoRedo();
  document.commandDispatcher.updateCommands("create-menu-tasks");
  UIFontSize.updateAppMenuButton(window);
  initUiDensityAppMenu();

  document.getElementById("appmenu_FolderViews").disabled =
    document.getElementById("tabmail").currentTabInfo.mode.name !=
    "mail3PaneTab";
}

function openNewCardDialog() {
  toAddressBook({ action: "create" });
}

/**
 * Opens Address Book tab and triggers address book creation dialog defined
 * type.
 *
 * @param {?string}[type = "JS"] type - The address book type needing creation.
 */
function openNewABDialog(type = "JS") {
  toAddressBook({ action: `create_ab_${type}` });
}

/**
 * Verifies we have the attachments in order to populate the menupopup.
 * Resets the popup to be populated.
 *
 *  @param {DOMEvent} event - The popupshowing event.
 */
function fillAttachmentListPopup(event) {
  if (event.target.id != "attachmentMenuList") {
    return;
  }

  const popup = event.target;

  // Clear out the old menupopup.
  while (popup.firstElementChild?.localName == "menu") {
    popup.firstElementChild?.remove();
  }

  const aboutMessage =
    document.getElementById("tabmail")?.currentAboutMessage ||
    document.getElementById("messageBrowser")?.contentWindow;
  if (!aboutMessage) {
    return;
  }

  const attachments = aboutMessage.currentAttachments;
  for (const [index, attachment] of attachments.entries()) {
    addAttachmentToPopup(aboutMessage, popup, attachment, index);
  }
  aboutMessage.goUpdateAttachmentCommands();
}

/**
 * Add each attachment to the menupop up before the menuseparator and create
 * a submenu with the attachments' options (open, save, detach and delete).
 *
 * @param {?Window} aboutMessage - The current message on the message pane.
 * @param {XULPopupElement} popup - #attachmentMenuList menupopup.
 * @param {AttachmentInfo} attachment - The file attached to the email.
 * @param {integer} attachmentIndex - The attachment's index.
 */
function addAttachmentToPopup(
  aboutMessage,
  popup,
  attachment,
  attachmentIndex
) {
  let item = document.createXULElement("menu");

  function getString(aName) {
    return document.getElementById("bundle_messenger").getString(aName);
  }

  // Insert the item just before the separator. The separator is the 2nd to
  // last element in the popup.
  item.classList.add("menu-iconic");
  item.setAttribute("image", getIconForAttachment(attachment));

  const separator = popup.querySelector("menuseparator");

  // We increment the attachmentIndex here since we only use it for the
  // label and accesskey attributes, and we want the accesskeys for the
  // attachments list in the menu to be 1-indexed.
  attachmentIndex++;

  const displayName = SanitizeAttachmentDisplayName(attachment);
  const label = document
    .getElementById("bundle_messenger")
    .getFormattedString("attachmentDisplayNameFormat", [
      attachmentIndex,
      displayName,
    ]);
  item.setAttribute("crop", "center");
  item.setAttribute("label", label);
  item.setAttribute("accesskey", attachmentIndex % 10);

  // Each attachment in the list gets its own menupopup with options for
  // saving, deleting, detaching, etc.
  let menupopup = document.createXULElement("menupopup");
  menupopup = item.appendChild(menupopup);

  item = popup.insertBefore(item, separator);

  if (attachment.isExternalAttachment) {
    if (!attachment.hasFile) {
      item.classList.add("notfound");
    } else {
      // The text-link class must be added to the <label> and have a <menu>
      // hover rule. Adding to <menu> makes hover overflow the underline to
      // the popup items.
      const label = item.children[1];
      label.classList.add("text-link");
    }
  }

  if (attachment.isDeleted) {
    item.classList.add("notfound");
  }

  const detached = attachment.isExternalAttachment;
  const deleted = !attachment.hasFile;
  const canDetach =
    aboutMessage?.CanDetachAttachments() && !deleted && !detached;

  if (deleted) {
    // We can't do anything with a deleted attachment, so just return.
    item.disabled = true;
    return;
  }

  // Create the "open" menu item
  let menuitem = document.createXULElement("menuitem");
  menuitem.attachment = attachment;
  menuitem.addEventListener("command", () =>
    attachment.open(aboutMessage.browsingContext)
  );
  menuitem.setAttribute("label", getString("openLabel"));
  menuitem.setAttribute("accesskey", getString("openLabelAccesskey"));
  menuitem.setAttribute("disabled", deleted);
  menuitem = menupopup.appendChild(menuitem);

  // Create the "save" menu item
  menuitem = document.createXULElement("menuitem");
  menuitem.attachment = attachment;
  menuitem.addEventListener("command", () => attachment.save(messenger));
  menuitem.setAttribute("label", getString("saveLabel"));
  menuitem.setAttribute("accesskey", getString("saveLabelAccesskey"));
  menuitem.setAttribute("disabled", deleted);
  menuitem = menupopup.appendChild(menuitem);

  // Create the "detach" menu item
  menuitem = document.createXULElement("menuitem");
  menuitem.attachment = attachment;
  menuitem.addEventListener("command", () =>
    attachment.detach(messenger, true)
  );
  menuitem.setAttribute("label", getString("detachLabel"));
  menuitem.setAttribute("accesskey", getString("detachLabelAccesskey"));
  menuitem.setAttribute("disabled", !canDetach);
  menuitem = menupopup.appendChild(menuitem);

  // Create the "delete" menu item
  menuitem = document.createXULElement("menuitem");
  menuitem.attachment = attachment;
  menuitem.addEventListener("command", () =>
    attachment.detach(messenger, false)
  );
  menuitem.setAttribute("label", getString("deleteLabel"));
  menuitem.setAttribute("accesskey", getString("deleteLabelAccesskey"));
  menuitem.setAttribute("disabled", !canDetach);
  menuitem = menupopup.appendChild(menuitem);

  // Create the "open containing folder" menu item, for existing detached only.
  if (attachment.isFileAttachment) {
    const menuseparator = document.createXULElement("menuseparator");
    menupopup.appendChild(menuseparator);
    menuitem = document.createXULElement("menuitem");
    menuitem.attachment = attachment;
    menuitem.setAttribute("oncommand", "this.attachment.openFolder();");
    menuitem.setAttribute("label", getString("openFolderLabel"));
    menuitem.setAttribute("accesskey", getString("openFolderLabelAccesskey"));
    menuitem.setAttribute("disabled", !attachment.hasFile);
    menuitem = menupopup.appendChild(menuitem);
  }
}

/**
 * Return the string of the corresponding type of attachment's icon.
 *
 * @param {AttachmentInfo} attachment - The file attached to the email.
 * @returns {string}
 */
function getIconForAttachment(attachment) {
  return attachment.isDeleted
    ? "chrome://messenger/skin/icons/attachment-deleted.svg"
    : `moz-icon://${attachment.name}?size=16&amp;contentType=${attachment.contentType}`;
}

/**
 * Opens the Address Book to add the email address from the given mailto: URL.
 *
 * @param {string} url
 */
function addEmail(url) {
  const addresses = getEmail(url);
  toAddressBook({
    action: "create",
    address: addresses,
  });
}

/**
 * Extracts email address(es) from the given mailto: URL.
 *
 * @param {string} url
 * @returns {string}
 */
function getEmail(url) {
  const mailtolength = 7;
  const qmark = url.indexOf("?");
  let addresses;

  if (qmark > mailtolength) {
    addresses = url.substring(mailtolength, qmark);
  } else {
    addresses = url.substr(mailtolength);
  }
  // Let's try to unescape it using a character set
  try {
    addresses = Services.textToSubURI.unEscapeURIForUI(addresses);
  } catch (ex) {
    // Do nothing.
  }
  return addresses;
}

/**
 * Begins composing an email to the address from the given mailto: URL.
 *
 * @param {string} linkURL
 * @param {nsIMsgIdentity} [identity] - The identity to use, otherwise the
 *   default identity is used.
 */
function composeEmailTo(linkURL, identity) {
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  fields.to = getEmail(linkURL);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  if (identity) {
    params.identity = identity;
  }
  params.composeFields = fields;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}
