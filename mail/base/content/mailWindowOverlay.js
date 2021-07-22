/* -*- indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

/* import-globals-from ../../../mailnews/base/content/junkCommands.js */
/* import-globals-from ../../../mailnews/extensions/newsblog/newsblogOverlay.js */
/* import-globals-from commandglue.js */
/* import-globals-from contentAreaClick.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mail3PaneWindowCommands.js */
/* import-globals-from mailCommands.js */
/* import-globals-from mailContextMenus.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindow.js */
/* import-globals-from phishingDetector.js */
/* import-globals-from utilityOverlay.js */

var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
var { GlodaSyntheticView } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaSyntheticView.jsm"
);
var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);
var { TagUtils } = ChromeUtils.import("resource:///modules/TagUtils.jsm");
var { MessageArchiver } = ChromeUtils.import(
  "resource:///modules/MessageArchiver.jsm"
);

var { BrowserToolboxLauncher } = ChromeUtils.import(
  "resource://devtools/client/framework/browser-toolbox/Launcher.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);
var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
Object.defineProperty(this, "BrowserConsoleManager", {
  get() {
    let { loader } = ChromeUtils.import(
      "resource://devtools/shared/Loader.jsm"
    );
    return loader.require("devtools/client/webconsole/browser-console-manager")
      .BrowserConsoleManager;
  },
  configurable: true,
  enumerable: true,
});

var ADDR_DB_LARGE_COMMIT = 1;

var kClassicMailLayout = 0;
var kWideMailLayout = 1;
var kVerticalMailLayout = 2;
var kMailLayoutCommandMap = {
  cmd_viewClassicMailLayout: kClassicMailLayout,
  cmd_viewWideMailLayout: kWideMailLayout,
  cmd_viewVerticalMailLayout: kVerticalMailLayout,
};

// Per message header flags to keep track of whether the user is allowing remote
// content for a particular message.
// if you change or add more values to these constants, be sure to modify
// the corresponding definitions in nsMsgContentPolicy.cpp
var kNoRemoteContentPolicy = 0;
var kBlockRemoteContent = 1;
var kAllowRemoteContent = 2;

// Timer to mark read, if the user has configured the app to mark a message as
// read if it is viewed for more than n seconds.
var gMarkViewedMessageAsReadTimer = null;

// the user preference,
// if HTML is not allowed. I assume, that the user could have set this to a
// value > 1 in his prefs.js or user.js, but that the value will not
// change during runtime other than through the MsgBody*() functions below.
var gDisallow_classes_no_html = 1;

// Used to preview the changes in the UI density when the user hovers or focuses
// on a density menu item.
var gDensityPreviewer = {
  updateUIDensity(mode) {
    gUIDensity.update(mode);
  },

  resetUIDensity() {
    gUIDensity.update();
  },

  setUIDensity(mode) {
    Services.prefs.setIntPref(gUIDensity.uiDensityPref, mode);
  },
};

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

  // If we don't have a gFolderDisplay, just get out of here and leave the menu
  // as it is.
  if (!gFolderDisplay) {
    return;
  }

  let folder = gFolderDisplay.displayedFolder;
  if (!folder) {
    return;
  }

  if (Services.prefs.prefIsLocked("mail.disable_new_account_addition")) {
    document
      .getElementById("newAccountMenuItem")
      .setAttribute("disabled", "true");
    document
      .getElementById("appmenu_newAccountMenuItem")
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
  document
    .getElementById("cmd_killThread")
    .setAttribute("checked", gFolderDisplay.selectedMessageThreadIgnored);
  document
    .getElementById("cmd_killSubthread")
    .setAttribute("checked", gFolderDisplay.selectedMessageSubthreadIgnored);
  document
    .getElementById("cmd_watchThread")
    .setAttribute("checked", gFolderDisplay.selectedMessageThreadWatched);
}

function file_init() {
  document.commandDispatcher.updateCommands("create-menu-file");
}

/**
 * Update the menu items visibility in the Edit submenu.
 */
function InitEditMessagesMenu() {
  goSetMenuValue("cmd_delete", "valueDefault");
  goSetAccessKey("cmd_delete", "valueDefaultAccessKey");
  document.commandDispatcher.updateCommands("create-menu-edit");

  // initialize the favorite Folder checkbox in the edit menu
  let favoriteFolderMenu = document.getElementById("menu_favoriteFolder");
  if (!favoriteFolderMenu.hasAttribute("disabled")) {
    let folders = gFolderTreeView.getSelectedFolders();
    if (folders.length == 1 && !folders[0].isServer) {
      // Adjust the checked state on the menu item.
      favoriteFolderMenu.setAttribute(
        "checked",
        folders[0].getFlag(Ci.nsMsgFolderFlags.Favorite)
      );
      favoriteFolderMenu.hidden = false;
    } else {
      favoriteFolderMenu.hidden = true;
    }
  }
}

/**
 * Update the menu items visibility in the Find submenu.
 */
function initSearchMessagesMenu() {
  // Show 'Global Search' menu item only when global search is enabled.
  let glodaEnabled = Services.prefs.getBoolPref(
    "mailnews.database.global.indexer.enabled"
  );
  document.getElementById("glodaSearchCmd").hidden = !glodaEnabled;
  document.getElementById("appmenu_glodaSearchCmd").hidden = !glodaEnabled;
}

function InitAppFolderViewsMenu() {
  goSetMenuValue("cmd_delete", "valueDefault");
  goSetAccessKey("cmd_delete", "valueDefaultAccessKey");
  document.commandDispatcher.updateCommands("create-menu-edit");

  // Initialize the favorite Folder checkbox in the appmenu menu.
  let favoriteAppFolderMenu = document.getElementById("appmenu_favoriteFolder");
  if (!favoriteAppFolderMenu.hasAttribute("disabled")) {
    let folders = gFolderTreeView.getSelectedFolders();
    if (folders.length == 1 && !folders[0].isServer) {
      // Adjust the checked state on the menu item.
      favoriteAppFolderMenu.setAttribute(
        "checked",
        folders[0].getFlag(Ci.nsMsgFolderFlags.Favorite)
      );
      favoriteAppFolderMenu.hidden = false;
    } else {
      favoriteAppFolderMenu.hidden = true;
    }
  }
}

function InitGoMessagesMenu() {
  document.commandDispatcher.updateCommands("create-menu-go");
}

/**
 * This is called every time the view menu popup is displayed (in the main menu
 * bar or in the appmenu).  It is responsible for updating the menu items'
 * state to reflect reality.
 */
function view_init() {
  let isFeed =
    gFolderDisplay &&
    (FeedUtils.isFeedFolder(gFolderDisplay.displayedFolder) ||
      gFolderDisplay.selectedMessageIsFeed);

  let accountCentralDisplayed = gFolderDisplay.isAccountCentralDisplayed;
  let messagePaneMenuItem = document.getElementById("menu_showMessage");
  if (!messagePaneMenuItem.hidden) {
    // Hidden in the standalone msg window.
    messagePaneMenuItem.setAttribute(
      "checked",
      accountCentralDisplayed ? false : gMessageDisplay.visible
    );
    messagePaneMenuItem.disabled = accountCentralDisplayed;
  }

  let messagePaneAppMenuItem = document.getElementById("appmenu_showMessage");
  if (messagePaneAppMenuItem && !messagePaneAppMenuItem.hidden) {
    // Hidden in the standalone msg window.
    messagePaneAppMenuItem.setAttribute(
      "checked",
      accountCentralDisplayed ? false : gMessageDisplay.visible
    );
    messagePaneAppMenuItem.disabled = accountCentralDisplayed;
  }

  let folderPaneMenuItem = document.getElementById("menu_showFolderPane");
  if (!folderPaneMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneMenuItem.setAttribute(
      "checked",
      gFolderDisplay.folderPaneVisible
    );
  }

  let folderPaneAppMenuItem = document.getElementById("appmenu_showFolderPane");
  if (!folderPaneAppMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneAppMenuItem.setAttribute(
      "checked",
      gFolderDisplay.folderPaneVisible
    );
  }

  let colsEnabled = Services.prefs.getBoolPref("mail.folderpane.showColumns");
  let folderPaneColsMenuItem = document.getElementById(
    "menu_showFolderPaneCols"
  );
  if (!folderPaneColsMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneColsMenuItem.setAttribute("checked", colsEnabled);
  }

  folderPaneColsMenuItem = document.getElementById(
    "appmenu_showFolderPaneCols"
  );
  if (!folderPaneColsMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneColsMenuItem.setAttribute("checked", colsEnabled);
  }

  // Disable some menus if account manager is showing
  document.getElementById("viewSortMenu").disabled = accountCentralDisplayed;

  let appmenuViewSort = document.getElementById("appmenu_viewSortMenu");
  if (appmenuViewSort) {
    appmenuViewSort.disabled = accountCentralDisplayed;
  }

  document.getElementById(
    "viewMessageViewMenu"
  ).disabled = accountCentralDisplayed;

  let appmenuViewMessageView = document.getElementById(
    "appmenu_viewMessageViewMenu"
  );
  if (appmenuViewMessageView) {
    appmenuViewMessageView.disabled = accountCentralDisplayed;
  }

  document.getElementById(
    "viewMessagesMenu"
  ).disabled = accountCentralDisplayed;

  let appmenuViewMessagesMenu = document.getElementById(
    "appmenu_viewMessagesMenu"
  );
  if (appmenuViewMessagesMenu) {
    appmenuViewMessagesMenu.disabled = accountCentralDisplayed;
  }

  // Hide the "View > Messages" menu item if the user doesn't have the "Views"
  // (aka "Mail Views") toolbar button in the main toolbar. (See bug 1563789.)
  var viewsToolbarButton = document.getElementById("mailviews-container");
  document.getElementById("viewMessageViewMenu").hidden = !viewsToolbarButton;
  if (appmenuViewMessageView) {
    appmenuViewMessageView.hidden = !viewsToolbarButton;
  }

  // Initialize the Message Body menuitem
  document.getElementById("viewBodyMenu").hidden = isFeed;

  let appmenuViewBodyMenu = document.getElementById("appmenu_viewBodyMenu");
  if (appmenuViewBodyMenu) {
    appmenuViewBodyMenu.hidden = isFeed;
  }

  // Initialize the Show Feed Summary menu
  let viewFeedSummary = document.getElementById("viewFeedSummary");
  viewFeedSummary.hidden = !isFeed;
  let appmenuViewFeedSummary = document.getElementById(
    "appmenu_viewFeedSummary"
  );
  if (appmenuViewFeedSummary) {
    appmenuViewFeedSummary.hidden = !isFeed;
  }

  let viewRssMenuItemIds = [
    "bodyFeedGlobalWebPage",
    "bodyFeedGlobalSummary",
    "bodyFeedPerFolderPref",
  ];
  let checked = FeedMessageHandler.onSelectPref;
  for (let [index, id] of viewRssMenuItemIds.entries()) {
    document.getElementById(id).setAttribute("checked", index == checked);
  }

  // Initialize the View Attachment Inline menu
  var viewAttachmentInline = Services.prefs.getBoolPref(
    "mail.inline_attachments"
  );
  document
    .getElementById("viewAttachmentsInlineMenuitem")
    .setAttribute("checked", viewAttachmentInline);

  let viewAttachmentInlineMenu = document.getElementById(
    "appmenu_viewAttachmentsInlineMenuitem"
  );
  if (viewAttachmentInlineMenu) {
    viewAttachmentInlineMenu.setAttribute("checked", viewAttachmentInline);
  }

  document.commandDispatcher.updateCommands("create-menu-view");

  // Disable the charset item if there's nothing to enable
  let disableCharsetItems = !gMessageDisplay.displayedMessage;
  document
    .getElementById("repair-text-encoding")
    .setAttribute("disabled", disableCharsetItems);
  let appmenuCharset = document.getElementById("appmenu_charsetRepairMenuitem");
  if (appmenuCharset) {
    appmenuCharset.disabled = disableCharsetItems;
  }
}

function initUiDensityMenu(event) {
  // Prevent submenus from unnecessarily triggering onViewToolbarsPopupShowing
  // via bubbling of events.
  event.stopImmediatePropagation();

  // Apply the correct mode attribute to the various items.
  document.getElementById("uiDensityCompact").mode = gUIDensity.MODE_COMPACT;
  document.getElementById("uiDensityNormal").mode = gUIDensity.MODE_NORMAL;
  document.getElementById("uiDensityTouch").mode = gUIDensity.MODE_TOUCH;

  // Fetch the currently active identity.
  let currentDensity = gUIDensity.getCurrentDensity();

  for (let item of event.target.querySelectorAll("menuitem")) {
    if (item.mode == currentDensity) {
      item.setAttribute("checked", "true");
      break;
    }
  }
}

function initUiDensityAppMenu(event) {
  // Prevent submenus from unnecessarily triggering onViewToolbarsPopupShowing
  // via bubbling of events.
  event.stopImmediatePropagation();

  // Apply the correct mode attribute to the various items.
  document.getElementById("appmenu_uiDensityCompact").mode =
    gUIDensity.MODE_COMPACT;
  document.getElementById("appmenu_uiDensityNormal").mode =
    gUIDensity.MODE_NORMAL;
  document.getElementById("appmenu_uiDensityTouch").mode =
    gUIDensity.MODE_TOUCH;

  // Fetch the currently active identity.
  let currentDensity = gUIDensity.getCurrentDensity();

  for (let item of event.originalTarget.querySelectorAll("toolbarbutton")) {
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
  let paneConfig = Services.prefs.getIntPref("mail.pane_config.dynamic");

  let parent = appmenu
    ? event.target.querySelector(".panel-subview-body")
    : event.target;

  let layoutStyleMenuitem = parent.children[paneConfig];
  if (layoutStyleMenuitem) {
    layoutStyleMenuitem.setAttribute("checked", "true");
  }
}

/**
 * Initialize (check) appropriate folder mode under the View | Folder menu.
 */
function InitViewFolderViewsMenu(event) {
  for (let mode of gFolderTreeView.activeModes) {
    let selected = event.target.querySelector(`[value=${mode}]`);
    if (selected) {
      selected.setAttribute("checked", "true");
    }
  }

  // Check if only the All Folders mode is currently active.
  if (
    gFolderTreeView.activeModes.includes("all") &&
    gFolderTreeView.activeModes.length == 1
  ) {
    event.target.querySelector(`[value="all"]`).disabled = true;
  }

  let compactItem = event.target.querySelector(`[value="compact"]`);
  if (document.getElementById("folderTree").getAttribute("compact") == "true") {
    compactItem.setAttribute("checked", "true");
  }

  // Check if the currently active modes have a compact variation.
  let hasCompact = gFolderTreeView.activeModes.find(
    mode => mode == "favorite" || mode == "unread"
  );
  compactItem.disabled = !hasCompact;
  if (!hasCompact) {
    compactItem.removeAttribute("checked");
  }
}

function setSortByMenuItemCheckState(id, value) {
  var menuitem = document.getElementById(id);
  if (menuitem) {
    menuitem.setAttribute("checked", value);
  }
}

/**
 * Called when showing the menu_viewSortPopup menupopup, so it should always
 * be up-to-date.
 */
function InitViewSortByMenu() {
  var sortType = gFolderDisplay.view.primarySortType;

  setSortByMenuItemCheckState(
    "sortByDateMenuitem",
    sortType == Ci.nsMsgViewSortType.byDate
  );
  setSortByMenuItemCheckState(
    "sortByReceivedMenuitem",
    sortType == Ci.nsMsgViewSortType.byReceived
  );
  setSortByMenuItemCheckState(
    "sortByFlagMenuitem",
    sortType == Ci.nsMsgViewSortType.byFlagged
  );
  setSortByMenuItemCheckState(
    "sortByOrderReceivedMenuitem",
    sortType == Ci.nsMsgViewSortType.byId
  );
  setSortByMenuItemCheckState(
    "sortByPriorityMenuitem",
    sortType == Ci.nsMsgViewSortType.byPriority
  );
  setSortByMenuItemCheckState(
    "sortBySizeMenuitem",
    sortType == Ci.nsMsgViewSortType.bySize
  );
  setSortByMenuItemCheckState(
    "sortByStatusMenuitem",
    sortType == Ci.nsMsgViewSortType.byStatus
  );
  setSortByMenuItemCheckState(
    "sortBySubjectMenuitem",
    sortType == Ci.nsMsgViewSortType.bySubject
  );
  setSortByMenuItemCheckState(
    "sortByUnreadMenuitem",
    sortType == Ci.nsMsgViewSortType.byUnread
  );
  setSortByMenuItemCheckState(
    "sortByTagsMenuitem",
    sortType == Ci.nsMsgViewSortType.byTags
  );
  setSortByMenuItemCheckState(
    "sortByJunkStatusMenuitem",
    sortType == Ci.nsMsgViewSortType.byJunkStatus
  );
  setSortByMenuItemCheckState(
    "sortByFromMenuitem",
    sortType == Ci.nsMsgViewSortType.byAuthor
  );
  setSortByMenuItemCheckState(
    "sortByRecipientMenuitem",
    sortType == Ci.nsMsgViewSortType.byRecipient
  );
  setSortByMenuItemCheckState(
    "sortByAttachmentsMenuitem",
    sortType == Ci.nsMsgViewSortType.byAttachments
  );
  setSortByMenuItemCheckState(
    "sortByCorrespondentMenuitem",
    sortType == Ci.nsMsgViewSortType.byCorrespondent
  );

  var sortOrder = gFolderDisplay.view.primarySortOrder;
  var sortTypeSupportsGrouping = isSortTypeValidForGrouping(sortType);

  setSortByMenuItemCheckState(
    "sortAscending",
    sortOrder == Ci.nsMsgViewSortOrder.ascending
  );
  setSortByMenuItemCheckState(
    "sortDescending",
    sortOrder == Ci.nsMsgViewSortOrder.descending
  );

  var grouped = gFolderDisplay.view.showGroupedBySort;
  var threaded = gFolderDisplay.view.showThreaded;
  var sortThreadedMenuItem = document.getElementById("sortThreaded");
  var sortUnthreadedMenuItem = document.getElementById("sortUnthreaded");

  sortThreadedMenuItem.setAttribute("checked", threaded);
  sortUnthreadedMenuItem.setAttribute("checked", !threaded && !grouped);

  var groupBySortOrderMenuItem = document.getElementById("groupBySort");

  groupBySortOrderMenuItem.setAttribute("disabled", !sortTypeSupportsGrouping);
  groupBySortOrderMenuItem.setAttribute("checked", grouped);
}

function InitAppViewSortByMenu() {
  let sortType = gFolderDisplay.view.primarySortType;

  setSortByMenuItemCheckState(
    "appmenu_sortByDateMenuitem",
    sortType == Ci.nsMsgViewSortType.byDate
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByReceivedMenuitem",
    sortType == Ci.nsMsgViewSortType.byReceived
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByFlagMenuitem",
    sortType == Ci.nsMsgViewSortType.byFlagged
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByOrderReceivedMenuitem",
    sortType == Ci.nsMsgViewSortType.byId
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByPriorityMenuitem",
    sortType == Ci.nsMsgViewSortType.byPriority
  );
  setSortByMenuItemCheckState(
    "appmenu_sortBySizeMenuitem",
    sortType == Ci.nsMsgViewSortType.bySize
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByStatusMenuitem",
    sortType == Ci.nsMsgViewSortType.byStatus
  );
  setSortByMenuItemCheckState(
    "appmenu_sortBySubjectMenuitem",
    sortType == Ci.nsMsgViewSortType.bySubject
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByUnreadMenuitem",
    sortType == Ci.nsMsgViewSortType.byUnread
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByTagsMenuitem",
    sortType == Ci.nsMsgViewSortType.byTags
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByJunkStatusMenuitem",
    sortType == Ci.nsMsgViewSortType.byJunkStatus
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByFromMenuitem",
    sortType == Ci.nsMsgViewSortType.byAuthor
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByRecipientMenuitem",
    sortType == Ci.nsMsgViewSortType.byRecipient
  );
  setSortByMenuItemCheckState(
    "appmenu_sortByAttachmentsMenuitem",
    sortType == Ci.nsMsgViewSortType.byAttachments
  );

  let sortOrder = gFolderDisplay.view.primarySortOrder;
  let sortTypeSupportsGrouping = isSortTypeValidForGrouping(sortType);

  setSortByMenuItemCheckState(
    "appmenu_sortAscending",
    sortOrder == Ci.nsMsgViewSortOrder.ascending
  );
  setSortByMenuItemCheckState(
    "appmenu_sortDescending",
    sortOrder == Ci.nsMsgViewSortOrder.descending
  );

  let grouped = gFolderDisplay.view.showGroupedBySort;
  let threaded = gFolderDisplay.view.showThreaded;
  let sortThreadedMenuItem = document.getElementById("appmenu_sortThreaded");
  let sortUnthreadedMenuItem = document.getElementById(
    "appmenu_sortUnthreaded"
  );

  sortThreadedMenuItem.setAttribute("checked", threaded);
  sortUnthreadedMenuItem.setAttribute("checked", !threaded && !grouped);

  let groupBySortOrderMenuItem = document.getElementById("appmenu_groupBySort");

  groupBySortOrderMenuItem.setAttribute("disabled", !sortTypeSupportsGrouping);
  groupBySortOrderMenuItem.setAttribute("checked", grouped);
}

function isSortTypeValidForGrouping(sortType) {
  return Boolean(
    sortType == Ci.nsMsgViewSortType.byAccount ||
      sortType == Ci.nsMsgViewSortType.byAttachments ||
      sortType == Ci.nsMsgViewSortType.byAuthor ||
      sortType == Ci.nsMsgViewSortType.byCorrespondent ||
      sortType == Ci.nsMsgViewSortType.byDate ||
      sortType == Ci.nsMsgViewSortType.byFlagged ||
      sortType == Ci.nsMsgViewSortType.byLocation ||
      sortType == Ci.nsMsgViewSortType.byPriority ||
      sortType == Ci.nsMsgViewSortType.byReceived ||
      sortType == Ci.nsMsgViewSortType.byRecipient ||
      sortType == Ci.nsMsgViewSortType.byStatus ||
      sortType == Ci.nsMsgViewSortType.bySubject ||
      sortType == Ci.nsMsgViewSortType.byTags ||
      sortType == Ci.nsMsgViewSortType.byCustom
  );
}

function InitViewMessagesMenu() {
  document
    .getElementById("viewAllMessagesMenuItem")
    .setAttribute(
      "checked",
      !gFolderDisplay.view.showUnreadOnly && !gFolderDisplay.view.specialView
    );

  document
    .getElementById("viewUnreadMessagesMenuItem")
    .setAttribute("checked", gFolderDisplay.view.showUnreadOnly);

  document
    .getElementById("viewThreadsWithUnreadMenuItem")
    .setAttribute("checked", gFolderDisplay.view.specialViewThreadsWithUnread);

  document
    .getElementById("viewWatchedThreadsWithUnreadMenuItem")
    .setAttribute(
      "checked",
      gFolderDisplay.view.specialViewWatchedThreadsWithUnread
    );

  document
    .getElementById("viewIgnoredThreadsMenuItem")
    .setAttribute("checked", gFolderDisplay.view.showIgnored);
}

function InitAppmenuViewMessagesMenu() {
  document
    .getElementById("appmenu_viewAllMessagesMenuItem")
    .setAttribute(
      "checked",
      !gFolderDisplay.view.showUnreadOnly && !gFolderDisplay.view.specialView
    );

  document
    .getElementById("appmenu_viewUnreadMessagesMenuItem")
    .setAttribute("checked", gFolderDisplay.view.showUnreadOnly);

  document
    .getElementById("appmenu_viewThreadsWithUnreadMenuItem")
    .setAttribute("checked", gFolderDisplay.view.specialViewThreadsWithUnread);

  document
    .getElementById("appmenu_viewWatchedThreadsWithUnreadMenuItem")
    .setAttribute(
      "checked",
      gFolderDisplay.view.specialViewWatchedThreadsWithUnread
    );

  document
    .getElementById("appmenu_viewIgnoredThreadsMenuItem")
    .setAttribute("checked", gFolderDisplay.view.showIgnored);
}

function InitMessageMenu() {
  var selectedMsg = gFolderDisplay.selectedMessage;
  var isNews = gFolderDisplay.selectedMessageIsNews;
  var isFeed = gFolderDisplay.selectedMessageIsFeed;

  // We show reply to Newsgroups only for news messages.
  document.getElementById("replyNewsgroupMainMenu").hidden = !isNews;

  // For mail messages we say reply. For news we say ReplyToSender.
  document.getElementById("replyMainMenu").hidden = isNews;
  document.getElementById("replySenderMainMenu").hidden = !isNews;

  document.getElementById("menu_cancel").hidden = !isNews;

  // Disable the move and copy menus if there are no messages selected or if
  // the message is a dummy - e.g. opening a message in the standalone window.
  let messageStoredInternally = selectedMsg && !gMessageDisplay.isDummy;
  // Disable the move menu if we can't delete msgs from the folder.
  let canMove =
    messageStoredInternally && gFolderDisplay.canDeleteSelectedMessages;
  document.getElementById("moveMenu").disabled = !canMove;

  // Also disable copy when no folder is loaded (like for .eml files).
  let canCopy =
    selectedMsg &&
    (!gMessageDisplay.isDummy || window.arguments[0].scheme == "file");
  document.getElementById("copyMenu").disabled = !canCopy;

  initMoveToFolderAgainMenu(document.getElementById("moveToFolderAgain"));

  // Disable the Forward As menu item if no message is selected.
  document.getElementById("forwardAsMenu").disabled = !selectedMsg;

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
  let index = FeedMessageHandler.onOpenPref;
  document
    .getElementById("menu_openFeedMessage")
    .children[index].setAttribute("checked", true);

  let openRssMenu = document.getElementById("openFeedMessage");
  openRssMenu.hidden = !isFeed;
  if (winType != "mail:3pane") {
    openRssMenu.hidden = true;
  }

  // Disable mark menu when we're not in a folder.
  document.getElementById("markMenu").disabled = gMessageDisplay.isDummy;

  document.commandDispatcher.updateCommands("create-menu-message");
}

function InitAppMessageMenu() {
  let selectedMsg = gFolderDisplay.selectedMessage;
  let isNews = gFolderDisplay.selectedMessageIsNews;
  let isFeed = gFolderDisplay.selectedMessageIsFeed;

  // We show reply to Newsgroups only for news messages.
  document.getElementById("appmenu_replyNewsgroupMainMenu").hidden = !isNews;

  // For mail messages we say reply. For news we say ReplyToSender.
  document.getElementById("appmenu_replyMainMenu").hidden = isNews;
  document.getElementById("appmenu_replySenderMainMenu").hidden = !isNews;

  document.getElementById("appmenu_cancel").hidden = !isNews;

  // Disable the move and copy menus if there are no messages selected or if
  // the message is a dummy - e.g. opening a message in the standalone window.
  let messageStoredInternally = selectedMsg && !gMessageDisplay.isDummy;
  // Disable the move menu if we can't delete msgs from the folder.
  let canMove =
    messageStoredInternally && gFolderDisplay.canDeleteSelectedMessages;
  document.getElementById("appmenu_moveMenu").disabled = !canMove;

  // Also disable copy when no folder is loaded (like for .eml files).
  let canCopy =
    selectedMsg &&
    (!gMessageDisplay.isDummy || window.arguments[0].scheme == "file");
  document.getElementById("appmenu_copyMenu").disabled = !canCopy;

  initMoveToFolderAgainMenu(
    document.getElementById("appmenu_moveToFolderAgain")
  );

  // Disable the Forward As menu item if no message is selected.
  document.getElementById("appmenu_forwardAsMenu").disabled = !selectedMsg;

  // Disable the Tag menu item if no message is selected or when we're
  // not in a folder.
  document.getElementById(
    "appmenu_tagMenu"
  ).disabled = !messageStoredInternally;

  // Show "Edit Draft Message" menus only in a drafts folder; otherwise hide them.
  showCommandInSpecialFolder("cmd_editDraftMsg", Ci.nsMsgFolderFlags.Drafts);
  // Show "New Message from Template" and "Edit Template" menus only in a
  // templates folder; otherwise hide them.
  showCommandInSpecialFolder(
    ["cmd_newMsgFromTemplate", "cmd_editTemplateMsg"],
    Ci.nsMsgFolderFlags.Templates
  );

  // Initialize the Open Message menuitem.
  let winType = document.documentElement.getAttribute("windowtype");
  if (winType == "mail:3pane") {
    document.getElementById(
      "appmenu_openMessageWindowMenuitem"
    ).hidden = isFeed;
  }

  // Initialize the Open Feed Message handler menu.
  const openFeedView = document
    .getElementById("appMenu-messageOpenFeedView")
    .querySelector(".panel-subview-body");

  openFeedView.childNodes.forEach(node => node.removeAttribute("checked"));
  openFeedView.childNodes[FeedMessageHandler.onOpenPref].setAttribute(
    "checked",
    true
  );

  let openRssMenu = document.getElementById("appmenu_openFeedMessage");
  openRssMenu.hidden = !isFeed;
  if (winType != "mail:3pane") {
    openRssMenu.hidden = true;
  }

  // Disable mark menu when we're not in a folder.
  document.getElementById("appmenu_markMenu").disabled =
    gMessageDisplay.isDummy;
  document.commandDispatcher.updateCommands("create-menu-message");
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
  let msg = gFolderDisplay.selectedMessage;
  let folder = gFolderDisplay.displayedFolder;
  let inSpecialFolder =
    (msg &&
    msg.folder && // Check folder as messages opened from file have none.
      msg.folder.isSpecialFolder(aFolderFlag, true)) ||
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
  let lastFolderURI = Services.prefs.getCharPref(
    "mail.last_msg_movecopy_target_uri"
  );

  if (!lastFolderURI) {
    return;
  }
  let destMsgFolder = MailUtils.getExistingFolder(lastFolderURI);
  if (!destMsgFolder) {
    return;
  }
  let bundle = document.getElementById("bundle_messenger");
  let isMove = Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move");
  let stringName = isMove ? "moveToFolderAgain" : "copyToFolderAgain";
  aMenuItem.label = bundle.getFormattedString(
    stringName,
    [destMsgFolder.prettyName],
    1
  );
  // This gives us moveToFolderAgainAccessKey and copyToFolderAgainAccessKey.
  aMenuItem.accesskey = bundle.getString(stringName + "AccessKey");
}

function InitViewHeadersMenu() {
  const dt = Ci.nsMimeHeaderDisplayTypes;
  var headerchoice = Services.prefs.getIntPref("mail.show_headers");
  document
    .getElementById("cmd_viewAllHeader")
    .setAttribute("checked", headerchoice == dt.AllHeaders);
  document
    .getElementById("cmd_viewNormalHeader")
    .setAttribute("checked", headerchoice == dt.NormalHeaders);
  document.commandDispatcher.updateCommands("create-menu-mark");
}

/**
 * @param headermode {Ci.nsMimeHeaderDisplayTypes}
 */
function AdjustHeaderView(headermode) {
  const all = Ci.nsMimeHeaderDisplayTypes.AllHeaders;
  document
    .getElementById("expandedHeaderView")
    .setAttribute("show_header_mode", headermode == all ? "all" : "normal");
}

function InitViewBodyMenu() {
  // Separate render prefs not implemented for feeds, bug 458606.  Show the
  // checked item for feeds as for the regular pref.
  //  let html_as = Services.prefs.getIntPref("rss.display.html_as");
  //  let prefer_plaintext = Services.prefs.getBoolPref("rss.display.prefer_plaintext");
  //  let disallow_classes = Services.prefs.getIntPref("rss.display.disallow_mime_handlers");

  let html_as = Services.prefs.getIntPref("mailnews.display.html_as");
  let prefer_plaintext = Services.prefs.getBoolPref(
    "mailnews.display.prefer_plaintext"
  );
  let disallow_classes = Services.prefs.getIntPref(
    "mailnews.display.disallow_mime_handlers"
  );
  let isFeed = gFolderDisplay.selectedMessageIsFeed;
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
  let menuIDs = isFeed ? rssIDs : defaultIDs;

  if (disallow_classes > 0) {
    gDisallow_classes_no_html = disallow_classes;
  }
  // else gDisallow_classes_no_html keeps its initial value (see top)

  let AllowHTML_menuitem = document.getElementById(menuIDs[0]);
  let Sanitized_menuitem = document.getElementById(menuIDs[1]);
  let AsPlaintext_menuitem = document.getElementById(menuIDs[2]);
  let AllBodyParts_menuitem = menuIDs[3]
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
    document.getElementById(
      "viewFeedSummarySeparator"
    ).hidden = !FeedMessageHandler.gShowSummary;
  }
}

function InitAppmenuViewBodyMenu() {
  let html_as = Services.prefs.getIntPref("mailnews.display.html_as");
  let prefer_plaintext = Services.prefs.getBoolPref(
    "mailnews.display.prefer_plaintext"
  );
  let disallow_classes = Services.prefs.getIntPref(
    "mailnews.display.disallow_mime_handlers"
  );
  let isFeed = gFolderDisplay.selectedMessageIsFeed;
  const kDefaultIDs = [
    "appmenu_bodyAllowHTML",
    "appmenu_bodySanitized",
    "appmenu_bodyAsPlaintext",
    "appmenu_bodyAllParts",
  ];
  const kRssIDs = [
    "appmenu_bodyFeedSummaryAllowHTML",
    "appmenu_bodyFeedSummarySanitized",
    "appmenu_bodyFeedSummaryAsPlaintext",
  ];
  let menuIDs = isFeed ? kRssIDs : kDefaultIDs;

  if (disallow_classes > 0) {
    gDisallow_classes_no_html = disallow_classes;
  }
  // else gDisallow_classes_no_html keeps its initial value (see top)

  let AllowHTML_menuitem = document.getElementById(menuIDs[0]);
  let Sanitized_menuitem = document.getElementById(menuIDs[1]);
  let AsPlaintext_menuitem = document.getElementById(menuIDs[2]);
  let AllBodyParts_menuitem = menuIDs[3]
    ? document.getElementById(menuIDs[3])
    : null;

  document.getElementById(
    "appmenu_bodyAllParts"
  ).hidden = !Services.prefs.getBoolPref(
    "mailnews.display.show_all_body_parts_menu"
  );

  // Clear all checkmarks.
  AllowHTML_menuitem.removeAttribute("checked");
  Sanitized_menuitem.removeAttribute("checked");
  AsPlaintext_menuitem.removeAttribute("checked");
  if (AllBodyParts_menuitem) {
    AllBodyParts_menuitem.removeAttribute("checked");
  }

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
    AllowHTML_menuitem.hidden = !gShowFeedSummary;
    Sanitized_menuitem.hidden = !gShowFeedSummary;
    AsPlaintext_menuitem.hidden = !gShowFeedSummary;
    document.getElementById(
      "appmenu_viewFeedSummarySeparator"
    ).hidden = !gShowFeedSummary;
  }
}

/**
 * Expand or collapse the folder pane.
 */
function MsgToggleFolderPane() {
  // Bail without doing anything if we are not a folder tab.
  let currentTabInfo = document.getElementById("tabmail").currentTabInfo;
  if (currentTabInfo.mode.name != "folder") {
    return;
  }

  togglePaneSplitter("folderpane_splitter");
}

/**
 * Expand or collapse the message preview pane.
 */
function MsgToggleMessagePane() {
  // Bail without doing anything if we are not a folder tab.
  let currentTabInfo = document.getElementById("tabmail").currentTabInfo;
  if (currentTabInfo.mode.name != "folder") {
    return;
  }

  togglePaneSplitter("threadpane-splitter");
  ChangeMessagePaneVisibility(IsMessagePaneCollapsed());
  SetFocusThreadPaneIfNotOnMessagePane();
}

function SetMenuItemLabel(menuItemId, customLabel) {
  var menuItem = document.getElementById(menuItemId);
  if (menuItem) {
    menuItem.setAttribute("label", customLabel);
  }
}

/**
 * Update the tooltip of the "Get messages" button to indicate which accounts
 * (usernames) will be fetched if clicked.
 */

function SetGetMsgButtonTooltip() {
  var msgButton = document.getElementById("button-getmsg");
  // The button is not found in the document if isn't on the toolbar but available
  // in the Customize palette. In that case we do not need to update its tooltip.
  if (!msgButton) {
    return;
  }

  var selectedFolders = GetSelectedMsgFolders();
  var folders;
  if (selectedFolders.length) {
    folders = selectedFolders;
  } else {
    folders = [GetDefaultAccountRootFolder()];
  }

  if (!folders[0]) {
    return;
  }

  var bundle = document.getElementById("bundle_messenger");
  var listSeparator = bundle.getString("getMsgButtonTooltip.listSeparator");

  // Push the usernames through a Set() to remove duplicates.
  var names = new Set(folders.map(v => v.server.prettyName));
  var tooltipNames = Array.from(names).join(listSeparator);
  msgButton.tooltipText = bundle.getFormattedString("getMsgButtonTooltip", [
    tooltipNames,
  ]);
}

function RemoveAllMessageTags() {
  var selectedMessages = gFolderDisplay.selectedMessages;
  if (!selectedMessages.length) {
    return;
  }

  let messages = [];
  let tagArray = MailServices.tags.getAllTags();

  var allKeys = "";
  for (var j = 0; j < tagArray.length; ++j) {
    if (j) {
      allKeys += " ";
    }
    allKeys += tagArray[j].key;
  }

  var prevHdrFolder = null;
  // this crudely handles cross-folder virtual folders with selected messages
  // that spans folders, by coalescing consecutive messages in the selection
  // that happen to be in the same folder. nsMsgSearchDBView does this better,
  // but nsIMsgDBView doesn't handle commands with arguments, and untag takes a
  // key argument. Furthermore, we only delete legacy labels and known tags,
  // keeping other keywords like (non)junk intact.

  for (var i = 0; i < selectedMessages.length; ++i) {
    var msgHdr = selectedMessages[i];
    msgHdr.label = 0; // remove legacy label
    if (prevHdrFolder != msgHdr.folder) {
      if (prevHdrFolder) {
        prevHdrFolder.removeKeywordsFromMessages(messages, allKeys);
      }
      messages = [];
      prevHdrFolder = msgHdr.folder;
    }
    messages.push(msgHdr);
  }
  if (prevHdrFolder) {
    prevHdrFolder.removeKeywordsFromMessages(messages, allKeys);
  }
  OnTagsChange();
}

/**
 * Toggle the state of a message tag on the selected messages (based on the
 * state of the first selected message, like for starring).
 *
 * @param keyNumber the number (1 through 9) associated with the tag
 */
function ToggleMessageTagKey(keyNumber) {
  let msgHdr = gFolderDisplay.selectedMessage;
  if (!msgHdr) {
    return;
  }

  let tagArray = MailServices.tags.getAllTags();
  if (keyNumber > tagArray.length) {
    return;
  }

  let key = tagArray[keyNumber - 1].key;
  let curKeys = msgHdr.getStringProperty("keywords").split(" ");
  if (msgHdr.label) {
    curKeys.push("$label" + msgHdr.label);
  }
  let addKey = !curKeys.includes(key);

  ToggleMessageTag(key, addKey);
}

function ToggleMessageTagMenu(target) {
  var key = target.getAttribute("value");
  var addKey = target.getAttribute("checked") == "true";
  ToggleMessageTag(key, addKey);
}

function ToggleMessageTag(key, addKey) {
  var messages = [];
  var selectedMessages = gFolderDisplay.selectedMessages;
  var toggler = addKey ? "addKeywordsToMessages" : "removeKeywordsFromMessages";
  var prevHdrFolder = null;
  // this crudely handles cross-folder virtual folders with selected messages
  // that spans folders, by coalescing consecutive msgs in the selection
  // that happen to be in the same folder. nsMsgSearchDBView does this
  // better, but nsIMsgDBView doesn't handle commands with arguments,
  // and (un)tag takes a key argument.
  for (var i = 0; i < selectedMessages.length; ++i) {
    var msgHdr = selectedMessages[i];
    if (msgHdr.label) {
      // Since we touch all these messages anyway, migrate the label now.
      // If we don't, the thread tree won't always show the correct tag state,
      // because resetting a label doesn't update the tree anymore...
      msgHdr.folder.addKeywordsToMessages([msgHdr], "$label" + msgHdr.label);
      msgHdr.label = 0; // remove legacy label
    }
    if (prevHdrFolder != msgHdr.folder) {
      if (prevHdrFolder) {
        prevHdrFolder[toggler](messages, key);
      }
      messages = [];
      prevHdrFolder = msgHdr.folder;
    }
    messages.push(msgHdr);
  }
  if (prevHdrFolder) {
    prevHdrFolder[toggler](messages, key);
  }
  OnTagsChange();
}

function AddTag() {
  var args = { result: "", okCallback: AddTagCallback };
  window.openDialog(
    "chrome://messenger/content/newTagDialog.xhtml",
    "",
    "chrome,titlebar,modal,centerscreen",
    args
  );
}

function ManageTags() {
  openOptionsDialog("paneGeneral", "tagsCategory");
}

function AddTagCallback(name, color) {
  MailServices.tags.addTag(name, color, "");
  let key = MailServices.tags.getKeyForTag(name);
  TagUtils.addTagToAllDocumentSheets(key, color);

  try {
    ToggleMessageTag(key, true);
  } catch (ex) {
    return false;
  }
  return true;
}

function SetMessageTagLabel(menuitem, index, name) {
  // if a <key> is defined for this tag, use its key as the accesskey
  // (the key for the tag at index n needs to have the id key_tag<n>)
  let shortcutkey = document.getElementById("key_tag" + index);
  let accesskey = shortcutkey ? shortcutkey.getAttribute("key") : "  ";
  if (accesskey != "  ") {
    menuitem.setAttribute("accesskey", accesskey);
    menuitem.setAttribute("acceltext", accesskey);
  }
  let label = document
    .getElementById("bundle_messenger")
    .getFormattedString("mailnews.tags.format", [accesskey, name]);
  menuitem.setAttribute("label", label);
}

/**
 * Refresh the contents of the tag popup menu/panel.
 * Used for example for appmenu/Message/Tag panel.
 *
 * @param {Element} parent          Parent element that will contain the menu items.
 * @param {string} [elementName]    Type of menu item, e.g. "menuitem", "toolbarbutton".
 * @param {string} [classes]        Classes to set on the menu items.
 */
function InitMessageTags(parent, elementName = "menuitem", classes) {
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
  const msgHdr = gFolderDisplay.selectedMessage;
  const suffix = msgHdr.label ? " $label" + msgHdr.label : "";
  const curKeys = msgHdr.getStringProperty("keywords") + suffix;

  tagArray.forEach((tagInfo, index) => {
    const removeKey = ` ${curKeys} `.includes(` ${tagInfo.key} `);

    if (tagInfo.ordinal.includes("~AUTOTAG") && !removeKey) {
      return;
    }
    // TODO We want to either remove or "check" the tags that already exist.
    let item = document.createXULElement(elementName);
    SetMessageTagLabel(item, index + 1, tagInfo.tag);

    if (removeKey) {
      item.setAttribute("checked", "true");
    }
    item.setAttribute("value", tagInfo.key);
    item.setAttribute("type", "checkbox");
    item.setAttribute("oncommand", "ToggleMessageTagMenu(event.target);");

    if (tagInfo.color) {
      item.setAttribute("style", `color: ${tagInfo.color};`);
    }
    if (classes) {
      item.setAttribute("class", classes);
    }
    parent.appendChild(item);
  });
}

/**
 * Refresh the contents of the recently closed tags popup menu/panel.
 * Used for example for appmenu/Go/Recently_Closed_Tabs panel.
 *
 * @param {Element} parent          Parent element that will contain the menu items.
 * @param {string} [elementName]    Type of menu item, e.g. "menuitem", "toolbarbutton".
 * @param {string} [classes]        Classes to set on the menu items.
 * @param {string} [separatorName]  Type of separator, e.g. "menuseparator", "toolbarseparator".
 */
function InitRecentlyClosedTabsPopup(
  parent,
  elementName = "menuitem",
  classes,
  separatorName = "menuseparator"
) {
  const tabs = document.getElementById("tabmail").recentlyClosedTabs;

  // Show Popup only when there are restorable tabs.
  if (!tabs.length) {
    return false;
  }

  // Clear the list.
  while (parent.hasChildNodes()) {
    parent.lastChild.remove();
  }

  // Insert menu items to rebuild the recently closed tab list.
  tabs.forEach((tab, index) => {
    const item = document.createXULElement(elementName);
    item.setAttribute("label", tab.title);
    item.setAttribute(
      "oncommand",
      `document.getElementById("tabmail").undoCloseTab(${index});`
    );
    if (classes) {
      item.setAttribute("class", classes);
    }

    if (index == 0) {
      item.setAttribute("key", "key_undoCloseTab");
    }
    parent.appendChild(item);
  });

  // Only show "Restore All Tabs" if there is more than one tab to restore.
  if (tabs.length > 1) {
    parent.appendChild(document.createXULElement(separatorName));

    const item = document.createXULElement(elementName);
    item.setAttribute(
      "label",
      document.getElementById("bundle_messenger").getString("restoreAllTabs")
    );

    item.setAttribute("oncommand", "goRestoreAllTabs();");

    if (classes) {
      item.setAttribute("class", classes);
    }
    parent.appendChild(item);
  }

  return true;
}

function goRestoreAllTabs() {
  let tabmail = document.getElementById("tabmail");

  let len = tabmail.recentlyClosedTabs.length;

  while (len--) {
    document.getElementById("tabmail").undoCloseTab();
  }
}

function backToolbarMenu_init(menuPopup) {
  populateHistoryMenu(menuPopup, true);
}

function getMsgToolbarMenu_init() {
  document.commandDispatcher.updateCommands("create-menu-getMsgToolbar");
}

var gNavDebug = false;
function navDebug(str) {
  if (gNavDebug) {
    dump(str);
  }
}

function populateHistoryMenu(menuPopup, isBackMenu) {
  // remove existing entries
  while (menuPopup.hasChildNodes()) {
    menuPopup.lastChild.remove();
  }
  let historyArray = messenger.getNavigateHistory();
  let curPos = messenger.navigatePos * 2;
  navDebug(
    "curPos = " +
      curPos +
      " historyArray.length = " +
      historyArray.length +
      "\n"
  );
  var folder;
  var newMenuItem;
  if (gFolderDisplay.selectedMessage) {
    if (!isBackMenu) {
      curPos += 2;
    } else {
      curPos -= 2;
    }
  }

  // For populating the back menu, we want the most recently visited
  // messages first in the menu. So we go backward from curPos to 0.
  // For the forward menu, we want to go forward from curPos to the end.
  var relPos = 0;
  for (
    var i = curPos;
    isBackMenu ? i >= 0 : i < historyArray.length;
    i += isBackMenu ? -2 : 2
  ) {
    navDebug("history[" + i + "] = " + historyArray[i] + "\n");
    navDebug("history[" + i + "] = " + historyArray[i + 1] + "\n");
    folder = MailServices.folderLookup.getFolderForURL(historyArray[i + 1]);
    if (!folder) {
      // Where did the folder go?
      continue;
    }
    navDebug(
      "folder URI = " + folder.URI + " pretty name " + folder.prettyName + "\n"
    );

    var menuText = "";
    var msgHdr;
    try {
      msgHdr = messenger.msgHdrFromURI(historyArray[i]);
    } catch (ex) {
      // Let's just ignore this history entry.
      continue;
    }
    var msgSubject = msgHdr.mime2DecodedSubject;
    var msgAuthor = msgHdr.mime2DecodedAuthor;

    if (!msgAuthor && !msgSubject) {
      // Avoid empty entries in the menu. The message was most likely (re)moved.
      continue;
    }

    // If the message was not being displayed via the current folder, prepend
    //  the folder name.  We do not need to check underlying folders for
    //  virtual folders because 'folder' is the display folder, not the
    //  underlying one.
    if (folder != gFolderDisplay.displayedFolder) {
      menuText = folder.prettyName + " - ";
    }

    var subject = "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
      subject = "Re: ";
    }
    if (msgSubject) {
      subject += msgSubject;
    }
    if (subject) {
      menuText += subject + " - ";
    }

    menuText += msgAuthor;
    newMenuItem = document.createXULElement("menuitem");
    newMenuItem.setAttribute("label", menuText);
    relPos += isBackMenu ? -1 : 1;
    newMenuItem.setAttribute("value", relPos);
    newMenuItem.folder = folder;
    newMenuItem.setAttribute(
      "oncommand",
      "NavigateToUri(event.target); event.stopPropagation();"
    );
    menuPopup.appendChild(newMenuItem);
    if (!(relPos % 20)) {
      break;
    }
  }
}

/**
 * This is triggered by the history navigation menu options, as created by
 *  populateHistoryMenu above.
 */
function NavigateToUri(target) {
  var historyIndex = target.getAttribute("value");
  var msgUri = messenger.getMsgUriAtNavigatePos(historyIndex);
  var folder = target.folder;
  var msgHdr = messenger.msgHdrFromURI(msgUri);
  navDebug(
    "navigating from " +
      messenger.navigatePos +
      " by " +
      historyIndex +
      " to " +
      msgUri +
      "\n"
  );

  // this "- 0" seems to ensure that historyIndex is treated as an int, not a string.
  messenger.navigatePos += historyIndex - 0;

  if (gFolderDisplay.displayedFolder != folder) {
    if (gFolderTreeView) {
      gFolderTreeView.selectFolder(folder);
    } else {
      gFolderDisplay.show(folder);
    }
  }
  gFolderDisplay.selectMessage(msgHdr);
}

function forwardToolbarMenu_init(menuPopup) {
  populateHistoryMenu(menuPopup, false);
}

function InitMessageMark() {
  document
    .getElementById("cmd_markAsFlagged")
    .setAttribute("checked", SelectedMessagesAreFlagged());

  document.commandDispatcher.updateCommands("create-menu-mark");
}

function UpdateJunkToolbarButton() {
  let junkButton = document.getElementById("button-isJunk");
  if (!junkButton) {
    return;
  }

  if (SelectedMessagesAreJunk()) {
    document.l10n.setAttributes(junkButton, "toolbar-not-junk-button");
  } else {
    document.l10n.setAttributes(junkButton, "toolbar-junk-button");
  }
}

/**
 * Should the reply command/button be enabled?
 *
 * @return whether the reply command/button should be enabled.
 */
function IsReplyEnabled() {
  // If we're in an rss item, we never want to Reply, because there's
  // usually no-one useful to reply to.
  return !gFolderDisplay.selectedMessageIsFeed;
}

/**
 * Should the reply-all command/button be enabled?
 *
 * @return whether the reply-all command/button should be enabled.
 */
function IsReplyAllEnabled() {
  if (gFolderDisplay.selectedMessageIsNews) {
    // If we're in a news item, we always want ReplyAll, because we can
    // reply to the sender and the newsgroup.
    return true;
  }
  if (gFolderDisplay.selectedMessageIsFeed) {
    // If we're in an rss item, we never want to ReplyAll, because there's
    // usually no-one useful to reply to.
    return false;
  }

  let msgHdr = gFolderDisplay.selectedMessage;

  let addresses = msgHdr.author + "," + msgHdr.recipients + "," + msgHdr.ccList;

  // If we've got any BCCed addresses (because we sent the message), add
  // them as well.
  if ("bcc" in currentHeaderData) {
    addresses += currentHeaderData.bcc.headerValue;
  }

  // Check to see if my email address is in the list of addresses.
  let [myIdentity] = MailUtils.getIdentityForHeader(msgHdr);
  let myEmail = myIdentity ? myIdentity.email : null;
  // We aren't guaranteed to have an email address, so guard against that.
  let imInAddresses =
    myEmail && addresses.toLowerCase().includes(myEmail.toLowerCase());

  // Now, let's get the number of unique addresses.
  let uniqueAddresses = MailServices.headerParser.removeDuplicateAddresses(
    addresses,
    ""
  );
  let numAddresses = MailServices.headerParser.parseEncodedHeader(
    uniqueAddresses
  ).length;

  // I don't want to count my address in the number of addresses to reply
  // to, since I won't be emailing myself.
  if (imInAddresses) {
    numAddresses--;
  }

  // ReplyAll is enabled if there is more than 1 person to reply to.
  return numAddresses > 1;
}

/**
 * Should the reply-list command/button be enabled?
 *
 * @return whether the reply-list command/button should be enabled.
 */
function IsReplyListEnabled() {
  // ReplyToList is enabled if there is a List-Post header
  // with the correct format.
  let listPost = currentHeaderData["list-post"];
  if (!listPost) {
    return false;
  }

  // XXX: Once Bug 496914 provides a parser, we should use that instead.
  // Until then, we need to keep the following regex in sync with the
  // listPost parsing in nsMsgCompose.cpp's
  // QuotingOutputStreamListener::OnStopRequest.
  return /<mailto:.+>/.test(listPost.headerValue);
}

/**
 * Update the enabled/disabled states of the Reply, Reply-All, and
 * Reply-List buttons.  (After this function runs, one of the buttons
 * should be shown, and the others should be hidden.)
 */
function UpdateReplyButtons() {
  // If we have no message, because we're being called from
  // MailToolboxCustomizeDone before someone selected a message, then just
  // return.
  if (!gFolderDisplay.selectedMessage) {
    return;
  }

  let buttonToShow;
  if (gFolderDisplay.selectedMessageIsNews) {
    // News messages always default to the "followup" dual-button.
    buttonToShow = "followup";
  } else if (gFolderDisplay.selectedMessageIsFeed) {
    // RSS items hide all the reply buttons.
    buttonToShow = null;
  } else if (IsReplyListEnabled()) {
    // Mail messages show the "reply" button (not the dual-button) and
    // possibly the "reply all" and "reply list" buttons.
    buttonToShow = "replyList";
  } else if (IsReplyAllEnabled()) {
    buttonToShow = "replyAll";
  } else {
    buttonToShow = "reply";
  }

  let smartReplyButton = document.getElementById("hdrSmartReplyButton");
  if (smartReplyButton) {
    let replyButton = document.getElementById("hdrReplyButton");
    let replyAllButton = document.getElementById("hdrReplyAllButton");
    let replyListButton = document.getElementById("hdrReplyListButton");
    let followupButton = document.getElementById("hdrFollowupButton");

    replyButton.hidden = buttonToShow != "reply";
    replyAllButton.hidden = buttonToShow != "replyAll";
    replyListButton.hidden = buttonToShow != "replyList";
    followupButton.hidden = buttonToShow != "followup";
  }

  let replyToSenderButton = document.getElementById("hdrReplyToSenderButton");
  if (replyToSenderButton) {
    if (gFolderDisplay.selectedMessageIsFeed) {
      replyToSenderButton.hidden = true;
    } else if (smartReplyButton) {
      replyToSenderButton.hidden = buttonToShow == "reply";
    } else {
      replyToSenderButton.hidden = false;
    }
  }

  goUpdateCommand("button_reply");
  goUpdateCommand("button_replyall");
  goUpdateCommand("button_replylist");
  goUpdateCommand("button_followup");
}

function UpdateDeleteToolbarButton() {
  let buttonMarkDeleted = document.getElementById("button-mark-deleted");

  // Never show "Undelete" in the 3-pane for folders, when delete would
  // apply to the selected folder.
  if (!buttonMarkDeleted) {
    return;
  }

  if (
    gFolderDisplay.focusedPane == document.getElementById("folderTree") &&
    gFolderDisplay.selectedCount == 0
  ) {
    document.l10n.setAttributes(buttonMarkDeleted, "toolbar-delete-button");
  } else if (SelectedMessagesAreDeleted()) {
    document.l10n.setAttributes(buttonMarkDeleted, "toolbar-undelete-button");
  } else {
    document.l10n.setAttributes(buttonMarkDeleted, "toolbar-delete-button");
  }
}
function UpdateDeleteCommand() {
  var value = "value";
  if (SelectedMessagesAreDeleted()) {
    value += "IMAPDeleted";
  }
  if (gFolderDisplay.selectedCount < 2) {
    value += "Message";
  } else {
    value += "Messages";
  }
  goSetMenuValue("cmd_delete", value);
  goSetAccessKey("cmd_delete", value + "AccessKey");
}

function SelectedMessagesAreDeleted() {
  let firstSelectedMessage = gFolderDisplay.selectedMessage;
  return (
    firstSelectedMessage &&
    firstSelectedMessage.flags & Ci.nsMsgMessageFlags.IMAPDeleted
  );
}

function SelectedMessagesAreJunk() {
  try {
    var junkScore = gFolderDisplay.selectedMessage.getStringProperty(
      "junkscore"
    );
    return junkScore != "" && junkScore != "0";
  } catch (ex) {
    return false;
  }
}

function SelectedMessagesAreRead() {
  let messages = gFolderDisplay.selectedMessages;
  if (messages.length == 0) {
    return undefined;
  }
  if (
    messages.every(function(msg) {
      return msg.isRead;
    })
  ) {
    return true;
  }
  if (
    messages.every(function(msg) {
      return !msg.isRead;
    })
  ) {
    return false;
  }
  return undefined;
}

function SelectedMessagesAreFlagged() {
  let firstSelectedMessage = gFolderDisplay.selectedMessage;
  return firstSelectedMessage && firstSelectedMessage.isFlagged;
}

function GetFirstSelectedMsgFolder() {
  try {
    var selectedFolders = GetSelectedMsgFolders();
  } catch (e) {
    Cu.reportError(e);
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

function MsgGetMessage() {
  // if offline, prompt for getting messages
  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    GetFolderMessages();
  }
}

function MsgPauseUpdates(aMenuitem) {
  // Pause single feed folder subscription updates, or all account updates if
  // folder is the account folder.
  let selectedFolders = GetSelectedMsgFolders();
  let folder = selectedFolders.length ? selectedFolders[0] : null;
  if (!FeedUtils.isFeedFolder(folder)) {
    return;
  }

  let pause = aMenuitem.getAttribute("checked") == "true";
  FeedUtils.pauseFeedFolderUpdates(folder, pause, true);
}

function MsgGetMessagesForAllServers(defaultServer) {
  // now log into any server
  try {
    // Array of arrays of servers for a particular folder.
    var pop3DownloadServersArray = [];
    // Parallel array of folders to download to...
    var localFoldersToDownloadTo = [];
    var pop3Server;
    for (let server of accountManager.allServers) {
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

function MsgDeleteMessage(reallyDelete, fromToolbar) {
  // If from the toolbar, return right away if this is a news message
  // only allow cancel from the menu:  "Edit | Cancel / Delete Message".
  if (fromToolbar && gFolderDisplay.view.isNewsFolder) {
    return;
  }

  gFolderDisplay.hintAboutToDeleteMessages();
  if (reallyDelete) {
    gDBView.doCommand(Ci.nsMsgViewCommandType.deleteNoTrash);
  } else {
    gDBView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
  }
}

/**
 * Copies the selected messages to the destination folder
 * @param aDestFolder  the destination folder
 */
function MsgCopyMessage(aDestFolder) {
  if (gMessageDisplay.isDummy) {
    let file = window.arguments[0].QueryInterface(Ci.nsIFileURL).file;
    MailServices.copy.copyFileMessage(
      file,
      aDestFolder,
      null,
      false,
      Ci.nsMsgMessageFlags.Read,
      "",
      null,
      msgWindow
    );
  } else {
    gDBView.doCommandWithFolder(
      Ci.nsMsgViewCommandType.copyMessages,
      aDestFolder
    );
  }

  Services.prefs.setCharPref(
    "mail.last_msg_movecopy_target_uri",
    aDestFolder.URI
  );
  Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", false);
}

/**
 * Moves the selected messages to the destination folder
 * @param aDestFolder  the destination folder
 */
function MsgMoveMessage(aDestFolder) {
  gFolderDisplay.hintAboutToDeleteMessages();
  gDBView.doCommandWithFolder(
    Ci.nsMsgViewCommandType.moveMessages,
    aDestFolder
  );
  Services.prefs.setCharPref(
    "mail.last_msg_movecopy_target_uri",
    aDestFolder.URI
  );
  Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", true);
}

/**
 * Calls the ComposeMessage function with the desired type, and proper default
 * based on the event that fired it.
 *
 * @param aCompType  the nsIMsgCompType to pass to the function
 * @param aEvent (optional) the event that triggered the call
 */
function composeMsgByType(aCompType, aEvent) {
  // If we're the hidden window, then we're not going to have a gFolderDisplay
  // to work out existing folders, so just use null.
  let msgFolder = gFolderDisplay ? GetFirstSelectedMsgFolder() : null;
  let msgUris = gFolderDisplay ? gFolderDisplay.selectedMessageUris : null;

  if (aEvent && aEvent.shiftKey) {
    ComposeMessage(
      aCompType,
      Ci.nsIMsgCompFormat.OppositeOfDefault,
      msgFolder,
      msgUris
    );
  } else {
    ComposeMessage(aCompType, Ci.nsIMsgCompFormat.Default, msgFolder, msgUris);
  }
}

function MsgNewMessage(event) {
  composeMsgByType(Ci.nsIMsgCompType.New, event);
}

function CanComposeMessages() {
  return MailServices.accounts.allIdentities.length > 0;
}

function MsgReplyMessage(event) {
  if (gFolderDisplay.selectedMessageIsNews) {
    MsgReplyGroup(event);
  } else {
    MsgReplySender(event);
  }
}

function MsgReplySender(event) {
  composeMsgByType(Ci.nsIMsgCompType.ReplyToSender, event);
}

function MsgReplyGroup(event) {
  composeMsgByType(Ci.nsIMsgCompType.ReplyToGroup, event);
}

function MsgReplyToAllMessage(event) {
  composeMsgByType(Ci.nsIMsgCompType.ReplyAll, event);
}

function MsgReplyToListMessage(event) {
  composeMsgByType(Ci.nsIMsgCompType.ReplyToList, event);
}

/**
 * Archives the selected messages
 *
 * @param event the event that caused us to call this function
 */
function MsgArchiveSelectedMessages(event) {
  let archiver = new MessageArchiver();
  archiver.folderDisplay = gFolderDisplay;
  archiver.msgWindow = msgWindow;
  archiver.archiveMessages(gFolderDisplay.selectedMessages);
}

function MsgForwardMessage(event) {
  var forwardType = Services.prefs.getIntPref("mail.forward_message_mode", 0);

  // mail.forward_message_mode could be 1, if the user migrated from 4.x
  // 1 (forward as quoted) is obsolete, so we treat is as forward inline
  // since that is more like forward as quoted then forward as attachment
  if (forwardType == 0) {
    MsgForwardAsAttachment(event);
  } else {
    MsgForwardAsInline(event);
  }
}

function MsgForwardAsAttachment(event) {
  composeMsgByType(Ci.nsIMsgCompType.ForwardAsAttachment, event);
}

function MsgForwardAsInline(event) {
  composeMsgByType(Ci.nsIMsgCompType.ForwardInline, event);
}

function MsgRedirectMessage(event) {
  composeMsgByType(Ci.nsIMsgCompType.Redirect, event);
}

function MsgEditMessageAsNew(aEvent) {
  composeMsgByType(Ci.nsIMsgCompType.EditAsNew, aEvent);
}

function MsgEditDraftMessage(aEvent) {
  composeMsgByType(Ci.nsIMsgCompType.Draft, aEvent);
}

function MsgNewMessageFromTemplate(aEvent) {
  composeMsgByType(Ci.nsIMsgCompType.Template, aEvent);
}

function MsgEditTemplateMessage(aEvent) {
  composeMsgByType(Ci.nsIMsgCompType.EditTemplate, aEvent);
}

function MsgComposeDraftMessage() {
  ComposeMessage(
    Ci.nsIMsgCompType.Draft,
    Ci.nsIMsgCompFormat.Default,
    gFolderDisplay.displayedFolder,
    gFolderDisplay.selectedMessageUris
  );
}

function MsgCreateFilter() {
  // retrieve Sender direct from selected message's headers
  var msgHdr = gFolderDisplay.selectedMessage;
  let emailAddress = MailServices.headerParser.extractHeaderAddressMailboxes(
    msgHdr.author
  );
  if (emailAddress) {
    top.MsgFilters(emailAddress, msgHdr.folder);
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
 * @folders an array of newsgroup folders to unsubscribe from
 * @return true if the user said it's ok to unsubscribe
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
 * @param newsgroups (optional param) the newsgroup folders to unsubscribe from
 */
function MsgUnsubscribe(newsgroups) {
  var folders = newsgroups || gFolderTreeView.getSelectedFolders();
  if (!ConfirmUnsubscribe(folders)) {
    return;
  }

  for (let i = 0; i < folders.length; i++) {
    let subscribableServer = folders[i].server.QueryInterface(
      Ci.nsISubscribableServer
    );
    subscribableServer.unsubscribe(folders[i].name);
    subscribableServer.commitSubscribeChanges();
  }
}

function ToggleFavoriteFolderFlag() {
  var folder = GetFirstSelectedMsgFolder();
  folder.toggleFlag(Ci.nsMsgFolderFlags.Favorite);
}

function MsgSaveAsFile() {
  SaveAsFile(gFolderDisplay.selectedMessageUris);
}

function MsgSaveAsTemplate() {
  if (gFolderDisplay.selectedCount == 1) {
    SaveAsTemplate(gFolderDisplay.selectedMessageUris[0]);
  }
}

function MsgOpenNewWindowForFolder(folderURI, msgKeyToSelect) {
  if (folderURI) {
    window.openDialog(
      "chrome://messenger/content/messenger.xhtml",
      "_blank",
      "chrome,all,dialog=no",
      folderURI,
      msgKeyToSelect
    );
    return;
  }

  // If there is a right-click happening, gFolderTreeView.getSelectedFolders()
  // will tell us about it (while the selection's currentIndex would reflect
  // the node that was selected/displayed before the right-click.)
  let selectedFolders = gFolderTreeView.getSelectedFolders();
  for (let i = 0; i < selectedFolders.length; i++) {
    window.openDialog(
      "chrome://messenger/content/messenger.xhtml",
      "_blank",
      "chrome,all,dialog=no",
      selectedFolders[i].URI,
      msgKeyToSelect
    );
  }
}

/**
 * UI-triggered command to open the currently selected folder(s) in new tabs.
 * @param aBackground [optional] if true, then the folder tab is opened in the
 *                    background. If false or not given, then the folder tab is
 *                    opened in the foreground.
 */
function MsgOpenNewTabForFolder(aBackground) {
  // If there is a right-click happening, gFolderTreeView.getSelectedFolders()
  // will tell us about it (while the selection's currentIndex would reflect
  // the node that was selected/displayed before the right-click.)
  let selectedFolders = gFolderTreeView.getSelectedFolders();
  for (let i = 0; i < selectedFolders.length; i++) {
    document.getElementById("tabmail").openTab("folder", {
      folder: selectedFolders[i],
      background: aBackground,
    });
  }
}

function MsgOpenSelectedMessages() {
  // Toggle message body (feed summary) and content-base url in message pane or
  // load in browser, per pref, otherwise open summary or web page in new window
  // or tab, per that pref.
  if (
    gFolderDisplay.treeSelection &&
    gFolderDisplay.treeSelection.count == 1 &&
    gFolderDisplay.selectedMessageIsFeed
  ) {
    let msgHdr = gFolderDisplay.selectedMessage;
    if (
      document.documentElement.getAttribute("windowtype") == "mail:3pane" &&
      FeedMessageHandler.onOpenPref ==
        FeedMessageHandler.kOpenToggleInMessagePane
    ) {
      let showSummary = FeedMessageHandler.shouldShowSummary(msgHdr, true);
      FeedMessageHandler.setContent(msgHdr, showSummary);
      return;
    }
    if (
      FeedMessageHandler.onOpenPref == FeedMessageHandler.kOpenLoadInBrowser
    ) {
      setTimeout(FeedMessageHandler.loadWebPage, 20, msgHdr, { browser: true });
      return;
    }
  }

  // This is somewhat evil. If we're in a 3pane window, we'd have a tabmail
  // element and would pass it in here, ensuring that if we open tabs, we use
  // this tabmail to open them. If we aren't, then we wouldn't, so
  // displayMessages would look for a 3pane window and open tabs there.
  MailUtils.displayMessages(
    gFolderDisplay.selectedMessages,
    gFolderDisplay.view,
    document.getElementById("tabmail")
  );
}

function MsgOpenFromFile() {
  const nsIFilePicker = Ci.nsIFilePicker;
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

  var bundle = document.getElementById("bundle_messenger");
  var filterLabel = bundle.getString("EMLFiles");
  var windowTitle = bundle.getString("OpenEMLFiles");

  fp.init(window, windowTitle, nsIFilePicker.modeOpen);
  fp.appendFilter(filterLabel, "*.eml");

  // Default or last filter is "All Files".
  fp.appendFilters(nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    MsgOpenEMLFile(fp.file, fp.fileURL);
  });
}

/**
 * Open the given .eml file.
 */
function MsgOpenEMLFile(aFile, aURL) {
  let url = aURL
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  let fstream = null;
  let headers = new Map();
  // Read this eml and extract its headers to check for X-Unsent.
  try {
    fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
      Ci.nsIFileInputStream
    );
    fstream.init(aFile, -1, 0, 0);
    let data = NetUtil.readInputStreamToString(fstream, fstream.available());
    headers = MimeParser.extractHeaders(data);
  } catch (e) {
    // Ignore errors on reading the eml or extracting its headers. The test for
    // the X-Unsent header below will fail and the message window will take care
    // of any error handling.
  } finally {
    if (fstream) {
      fstream.close();
    }
  }

  if (headers.get("X-Unsent") == "1") {
    let msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
      Ci.nsIMsgWindow
    );
    MailServices.compose.OpenComposeWindow(
      null,
      {},
      url.spec,
      Ci.nsIMsgCompType.Draft,
      Ci.nsIMsgCompFormat.Default,
      null,
      headers.get("from"),
      msgWindow
    );
  } else {
    window.openDialog(
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      url
    );
  }
}

function MsgOpenNewWindowForMessage(aMsgHdr) {
  // no message header provided?  get the selected message (this will give us
  //  the right-click selected message if that's what is going down.)
  if (!aMsgHdr) {
    aMsgHdr = gFolderDisplay.selectedMessage;
  }

  // (there might not have been a selected message, so check...)
  if (aMsgHdr) {
    // we also need to tell the window about our current view so that it can
    //  clone it.  This enables advancing through the messages, etc.
    window.openDialog(
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      aMsgHdr,
      gFolderDisplay.view
    );
  }
}

/**
 * Display the given message in an existing folder tab.
 *
 * @param aMsgHdr The message header to display.
 */
function MsgDisplayMessageInFolderTab(aMsgHdr) {
  // Look for a folder tab
  let tabmail = document.getElementById("tabmail");
  let folderTab = tabmail.getTabInfoForCurrentOrFirstModeInstance(
    tabmail.tabModes.folder
  );
  let folderDisplay = folderTab.folderDisplay;
  let folder = gFolderTreeView.getFolderForMsgHdr(aMsgHdr);

  // XXX Yuck. We really need to have the tabmail be able to handle an extra
  // param with data to send to showTab, and to have the folder display have
  // a |selectFolderAndMessage| method that handles most of the messiness.
  folderDisplay.selectMessageComingUp();

  // Switch to the tab
  tabmail.switchToTab(folderTab);

  // We don't want to drop view filters at first
  if (
    folderDisplay.view.getViewIndexForMsgHdr(aMsgHdr, false) !=
    nsMsgViewIndex_None
  ) {
    folderDisplay.selectMessage(aMsgHdr);
  } else {
    if (
      folderDisplay.displayedFolder != folder ||
      folderDisplay.view.isVirtual
    ) {
      // Force select the folder
      folderDisplay.show(folder);
      gFolderTreeView.selectFolder(folder, true);
    }

    // Force select the message
    folderDisplay.selectMessage(aMsgHdr, true);
  }
}

function MsgJunk() {
  MsgJunkMailInfo(true);
  JunkSelectedMessages(!SelectedMessagesAreJunk());
}

/**
 * Update the "mark as junk" button in the message header area.
 */
function UpdateJunkButton() {
  // The junk message should slave off the selected message, as the preview pane
  //  may not be visible
  let hdr = gFolderDisplay.selectedMessage;
  // But only the message display knows if we are dealing with a dummy.
  if (!hdr || gMessageDisplay.isDummy) {
    // .eml file
    return;
  }
  let junkScore = hdr.getStringProperty("junkscore");
  let hideJunk = junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;
  if (!gFolderDisplay.getCommandStatus(Ci.nsMsgViewCommandType.junk)) {
    hideJunk = true;
  }
  if (document.getElementById("hdrJunkButton")) {
    document.getElementById("hdrJunkButton").disabled = hideJunk;
  }
}

/**
 * Checks if the selected messages can be marked as read or unread
 *
 * @param markingRead true if trying to mark messages as read, false otherwise
 * @return true if the chosen operation can be performed
 */
function CanMarkMsgAsRead(markingRead) {
  return (
    gFolderDisplay.selectedCount > 0 && SelectedMessagesAreRead() != markingRead
  );
}

/**
 * Marks the selected messages as read or unread
 *
 * @param read true if trying to mark messages as read, false if marking unread,
 *        undefined if toggling the read status
 */
function MsgMarkMsgAsRead(read) {
  if (read == undefined) {
    read = !gFolderDisplay.selectedMessage.isRead;
  }
  MarkSelectedMessagesRead(read);
}

function MsgMarkAsFlagged() {
  MarkSelectedMessagesFlagged(!SelectedMessagesAreFlagged());
}

function MsgMarkReadByDate() {
  window.openDialog(
    "chrome://messenger/content/markByDate.xhtml",
    "",
    "chrome,modal,titlebar,centerscreen",
    gFolderDisplay.displayedFolder
  );
}

function MsgMarkAllRead() {
  let folders = gFolderTreeView.getSelectedFolders();
  for (let i = 0; i < folders.length; i++) {
    folders[i].markAllMessagesRead(msgWindow);
  }
}

/**
 * Go through each selected server and mark all its folders read.
 */
function MsgMarkAllFoldersRead() {
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

  const selectedFolders = gFolderTreeView.getSelectedFolders();
  const selectedServers = selectedFolders.filter(folder => folder.isServer);

  selectedServers.forEach(function(server) {
    for (let folder of server.rootFolder.descendants) {
      folder.markAllMessagesRead(msgWindow);
    }
  });
}

/**
 * Opens the filter list.
 * If an email address was passed, first a new filter is offered for creation
 * with the data prefilled.
 *
 * @param emailAddress  An email address to use as value in the first search term.
 * @param folder        The filter will be created in this folder's filter list.
 * @param fieldName     Search field string, from nsMsgSearchTerm.cpp::SearchAttribEntryTable.
 */
function MsgFilters(emailAddress, folder, fieldName) {
  if (!folder) {
    // Try to determine the folder from the selected message.
    if (gDBView) {
      /*
       * Here we face a decision. If the message has been moved to a
       *  different account, then a single filter cannot work for both
       *  manual and incoming scope. So we will create the filter based
       *  on its existing location, which will make it work properly in
       *  manual scope. This is the best solution for POP3 with global
       *  inbox (as then both manual and incoming filters work correctly),
       *  but may not be what IMAP users who filter to a local folder
       *  really want.
       */
      try {
        folder = gFolderDisplay.selectedMessage.folder;
      } catch (ex) {}
    }
    if (!folder) {
      folder = GetFirstSelectedMsgFolder();
    }
  }
  var args;
  if (emailAddress) {
    // We have to do prefill filter so we are going to launch the
    // filterEditor dialog and prefill that with the emailAddress.
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
    // just launch filterList dialog
    args = { refresh: false, folder };
    MsgFilterList(args);
  }
}

function MsgApplyFilters() {
  let preselectedFolder = GetFirstSelectedMsgFolder();

  let curFilterList = preselectedFolder.getFilterList(msgWindow);
  // create a new filter list and copy over the enabled filters to it.
  // We do this instead of having the filter after the fact code ignore
  // disabled filters because the Filter Dialog filter after the fact
  // code would have to clone filters to allow disabled filters to run,
  // and we don't support cloning filters currently.
  let tempFilterList = MailServices.filters.getTempFilterList(
    preselectedFolder
  );
  let numFilters = curFilterList.filterCount;
  // make sure the temp filter list uses the same log stream
  tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
  tempFilterList.logStream = curFilterList.logStream;
  let newFilterIndex = 0;
  for (let i = 0; i < numFilters; i++) {
    let curFilter = curFilterList.getFilterAt(i);
    // only add enabled, UI visible filters that are in the manual context
    if (
      curFilter.enabled &&
      !curFilter.temporary &&
      curFilter.filterType & Ci.nsMsgFilterType.Manual
    ) {
      tempFilterList.insertFilterAt(newFilterIndex, curFilter);
      newFilterIndex++;
    }
  }
  MailServices.filters.applyFiltersToFolders(
    tempFilterList,
    [preselectedFolder],
    msgWindow
  );
}

function MsgApplyFiltersToSelection() {
  // bail if we're dealing with a dummy header
  if (gMessageDisplay.isDummy) {
    return;
  }

  var selectedMessages = gFolderDisplay.selectedMessages;
  if (selectedMessages.length) {
    MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.Manual,
      selectedMessages,
      gFolderDisplay.displayedFolder,
      msgWindow
    );
  }
}

function ChangeMailLayout(newLayout) {
  Services.prefs.setIntPref("mail.pane_config.dynamic", newLayout);
}

function ChangeMailLayoutForCommand(aCommand) {
  ChangeMailLayout(kMailLayoutCommandMap[aCommand]);
}

function MsgViewAllHeaders() {
  const mode = Ci.nsMimeHeaderDisplayTypes.AllHeaders;
  Services.prefs.setIntPref("mail.show_headers", mode); // 2
  AdjustHeaderView(mode);
  ReloadMessage();
}

function MsgViewNormalHeaders() {
  const mode = Ci.nsMimeHeaderDisplayTypes.NormalHeaders;
  Services.prefs.setIntPref("mail.show_headers", mode); // 1
  AdjustHeaderView(mode);
  ReloadMessage();
}

function MsgBodyAllowHTML() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 0);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", 0);
  ReloadMessage();
}

function MsgBodySanitized() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 3);
  Services.prefs.setIntPref(
    "mailnews.display.disallow_mime_handlers",
    gDisallow_classes_no_html
  );
  ReloadMessage();
}

function MsgBodyAsPlaintext() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);
  Services.prefs.setIntPref("mailnews.display.html_as", 1);
  Services.prefs.setIntPref(
    "mailnews.display.disallow_mime_handlers",
    gDisallow_classes_no_html
  );
  ReloadMessage();
}

function MsgBodyAllParts() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 4);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", 0);
  ReloadMessage();
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
  ReloadMessage();
}

function ToggleInlineAttachment(target) {
  var viewAttachmentInline = !Services.prefs.getBoolPref(
    "mail.inline_attachments"
  );
  Services.prefs.setBoolPref("mail.inline_attachments", viewAttachmentInline);
  target.setAttribute("checked", viewAttachmentInline ? "true" : "false");
  ReloadMessage();
}

function IsMailFolderSelected() {
  var selectedFolders = GetSelectedMsgFolders();
  var folder = selectedFolders.length ? selectedFolders[0] : null;
  return folder && folder.server.type != "nntp";
}

function IsGetNewMessagesEnabled() {
  for (let server of accountManager.allServers) {
    if (server.type == "none") {
      continue;
    }
    return true;
  }
  return false;
}

function IsGetNextNMessagesEnabled() {
  var selectedFolders = GetSelectedMsgFolders();
  var folder = selectedFolders.length ? selectedFolders[0] : null;

  var menuItem = document.getElementById("menu_getnextnmsg");
  var appMenuItem = document.getElementById("appmenu_getNextNMsgs");
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
    if (appMenuItem) {
      appMenuItem.label = menuItem.label;
      appMenuItem.removeAttribute("hidden");
    }
    return true;
  }

  menuItem.setAttribute("hidden", "true");
  if (appMenuItem) {
    appMenuItem.setAttribute("hidden", "true");
  }
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

function SpaceHit(event) {
  // If focus is in chrome, we want to scroll the content window, unless
  // the focus is on an important chrome button like the otherActionsButton
  // popup; if focus is on a non-link content element like a button, bail so we
  // don't scroll when the element is going to do something else.

  var contentWindow = document.commandDispatcher.focusedWindow;
  let focusedElement = document.commandDispatcher.focusedElement;

  if (!gMessageDisplay.singleMessageDisplay) {
    contentWindow = document.getElementById("multimessage").contentWindow;
  } else if (contentWindow.top == window) {
    // These elements should always take priority over scrolling.
    const importantElements = ["otherActionsButton", "attachmentToggle"];
    contentWindow = window.content;
    if (focusedElement && importantElements.includes(focusedElement.id)) {
      return;
    }
  } else if (focusedElement && !hRefForClickEvent(event)[0]) {
    return;
  }

  if (!contentWindow) {
    return;
  }

  var rssiframe = contentWindow.document.getElementById("_mailrssiframe");
  // If we are displaying an RSS article, we really want to scroll
  // the nested iframe.
  if (contentWindow == window.content && rssiframe) {
    contentWindow = rssiframe.contentWindow;
  }

  if (event && event.shiftKey) {
    // if at the start of the message, go to the previous one
    if (contentWindow.scrollY > 0) {
      contentWindow.scrollByPages(-1);
    } else if (Services.prefs.getBoolPref("mail.advance_on_spacebar")) {
      goDoCommand("cmd_previousUnreadMsg");
    }
  } else if (contentWindow.scrollY < contentWindow.scrollMaxY) {
    // if at the end of the message, go to the next one
    contentWindow.scrollByPages(1);
  } else if (Services.prefs.getBoolPref("mail.advance_on_spacebar")) {
    goDoCommand("cmd_nextUnreadMsg");
  }
}

function IsAccountOfflineEnabled() {
  var selectedFolders = GetSelectedMsgFolders();

  if (selectedFolders && selectedFolders.length == 1) {
    return selectedFolders[0].supportsOffline;
  }
  return false;
}

function GetDefaultAccountRootFolder() {
  var account = accountManager.defaultAccount;
  if (account) {
    return account.incomingServer.rootMsgFolder;
  }

  return null;
}

/**
 * Check for new messages for all selected folders, or for the default account
 * in case no folders are selected.
 */
function GetFolderMessages() {
  var selectedFolders = GetSelectedMsgFolders();
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
      // If we're doing "get msgs" on a news server,
      // update unread counts on this server.
      folders[i].server.performExpand(msgWindow);
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
 * @param server which nsIMsgIncomingServer to check for new messages
 * @param folder which nsIMsgFolder folder to check for new messages
 */
function GetNewMsgs(server, folder) {
  // Note that for Global Inbox folder.server != server when we want to get
  // messages for a specific account.

  const nsIMsgFolder = Ci.nsIMsgFolder;
  // Whenever we do get new messages, clear the old new messages.
  folder.biffState = nsIMsgFolder.nsMsgBiffState_NoMail;
  folder.clearNewMessages();
  server.getNewMessages(folder, msgWindow, new TransportErrorUrlListener());
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
    let nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
      Ci.nsINSSErrorsService
    );
    try {
      let errorClass = nssErrorsService.getErrorClass(exitCode);
      if (errorClass == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
        let mailNewsUrl = url.QueryInterface(Ci.nsIMsgMailNewsUrl);
        let secInfo = mailNewsUrl.failedSecInfo;
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
  let msgSendlater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );

  for (let identity of MailServices.accounts.allIdentities) {
    let msgFolder = msgSendlater.getUnsentMessagesFolder(identity);
    if (msgFolder) {
      let numMessages = msgFolder.getTotalMessages(
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

    for (let server of accountManager.allServers) {
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
  // If we have selected a server, and are viewing account central
  // there is no loaded folder.
  var loadedFolder = gFolderDisplay.displayedFolder;
  if (!loadedFolder || !loadedFolder.server.canUndoDeleteOnServer) {
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
    Cu.reportError(ex);
  }

  if (canUndoOrRedo) {
    var commands = [
      "valueDefault",
      "valueDeleteMsg",
      "valueMoveMsg",
      "valueCopyMsg",
      "valueUnmarkAllMsgs",
    ];
    goSetMenuValue(command, commands[txnType]);
  } else {
    goSetMenuValue(command, "valueDefault");
  }
  return canUndoOrRedo;
}

/**
 * Triggered by the global JunkStatusChanged notification, we handle updating
 *  the message display if our displayed message might have had its junk status
 *  change.  This primarily entails updating the notification bar (that thing
 *  that appears above the message and says "this message might be junk") and
 *  (potentially) reloading the message because junk status affects the form of
 *  HTML display used (sanitized vs not).
 * When our tab implementation is no longer multiplexed (reusing the same
 *  display widget), this must be moved into the MessageDisplayWidget or
 *  otherwise be scoped to the tab.
 */
function HandleJunkStatusChanged(folder) {
  // We have nothing to do (and should bail) if:
  // - There is no currently displayed message.
  // - The displayed message is an .eml file from disk or an attachment.
  // - The folder that has had a junk change is not backing the display folder.

  // This might be the stand alone window, open to a message that was
  // and attachment (or on disk), in which case, we want to ignore it.
  if (
    !gMessageDisplay.displayedMessage ||
    gMessageDisplay.isDummy ||
    gFolderDisplay.displayedFolder != folder
  ) {
    return;
  }

  // If multiple message are selected and we change the junk status
  // we don't want to show the junk bar (since the message pane is blank).
  let msgHdr =
    gFolderDisplay.selectedCount == 1 ? gMessageDisplay.displayedMessage : null;
  let junkBarWasDisplayed = gMessageNotificationBar.isShowingJunkNotification();
  gMessageNotificationBar.setJunkMsg(msgHdr);

  // Only reload message if junk bar display state has changed.
  if (
    msgHdr &&
    junkBarWasDisplayed != gMessageNotificationBar.isShowingJunkNotification()
  ) {
    // We may be forcing junk mail to be rendered with sanitized html.
    // In that scenario, we want to reload the message if the status has just
    // changed to not junk.
    var sanitizeJunkMail = Services.prefs.getBoolPref(
      "mail.spam.display.sanitize"
    );

    // Only bother doing this if we are modifying the html for junk mail....
    if (sanitizeJunkMail) {
      let junkScore = msgHdr.getStringProperty("junkscore");
      let isJunk = junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;

      // If the current row isn't going to change, reload to show sanitized or
      // unsanitized. Otherwise we wouldn't see the reloaded version anyway.
      // 1) When marking as non-junk from the Junk folder, the msg would move
      //    back to the Inbox -> no reload needed
      //    When marking as non-junk from a folder other than the Junk folder,
      //    the message isn't moved back to Inbox -> reload needed
      //    (see nsMsgDBView::DetermineActionsForJunkChange)
      // 2) When marking as junk, the msg will move or delete, if manualMark is set.
      // 3) Marking as junk in the junk folder just changes the junk status.
      if (
        (!isJunk && !folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk)) ||
        (isJunk && !folder.server.spamSettings.manualMark) ||
        (isJunk && folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk))
      ) {
        ReloadMessage();
      }
    }
  }
}

/**
 * Object to handle message related notifications that are showing in a
 * notificationbox above the message content.
 */
var gMessageNotificationBar = {
  get stringBundle() {
    delete this.stringBundle;
    return (this.stringBundle = document.getElementById("bundle_messenger"));
  },

  get brandBundle() {
    delete this.brandBundle;
    return (this.brandBundle = document.getElementById("bundle_brand"));
  },

  get msgNotificationBar() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "top");
        document.getElementById("mail-notification-top").append(element);
      });
    }
    return this._notificationBox;
  },

  setJunkMsg(aMsgHdr) {
    goUpdateCommand("button_junk");

    let brandName = this.brandBundle.getString("brandShortName");
    let junkBarMsg = this.stringBundle.getFormattedString("junkBarMessage", [
      brandName,
    ]);

    let junkScore = aMsgHdr ? aMsgHdr.getStringProperty("junkscore") : "";
    if (junkScore == "" || junkScore == Ci.nsIJunkMailPlugin.IS_HAM_SCORE) {
      // not junk -> just close the notificaion then, if one was showing
      let item = this.msgNotificationBar.getNotificationWithValue(
        "junkContent"
      );
      if (item) {
        this.msgNotificationBar.removeNotification(item, true);
      }
      return;
    }

    let buttons = [
      {
        label: this.stringBundle.getString("junkBarInfoButton"),
        accessKey: this.stringBundle.getString("junkBarInfoButtonKey"),
        popup: null,
        callback(aNotification, aButton) {
          MsgJunkMailInfo(false);
          return true; // keep notification open
        },
      },
      {
        label: this.stringBundle.getString("junkBarButton"),
        accessKey: this.stringBundle.getString("junkBarButtonKey"),
        popup: null,
        callback(aNotification, aButton) {
          JunkSelectedMessages(false);
          // Return true (=don't close) since changing junk status will fire a
          // JunkStatusChanged notification which will make the junk bar go away
          // for this message -> no notification to close anymore -> trying to
          // close would just fail.
          return true;
        },
      },
    ];

    if (!this.isShowingJunkNotification()) {
      this.msgNotificationBar.appendNotification(
        junkBarMsg,
        "junkContent",
        "chrome://messenger/skin/icons/junk.svg",
        this.msgNotificationBar.PRIORITY_WARNING_HIGH,
        buttons
      );
    }
  },

  isShowingJunkNotification() {
    return !!this.msgNotificationBar.getNotificationWithValue("junkContent");
  },

  setRemoteContentMsg(aMsgHdr, aContentURI, aCanOverride) {
    // update the allow remote content for sender string
    let brandName = this.brandBundle.getString("brandShortName");
    let remoteContentMsg = this.stringBundle.getFormattedString(
      "remoteContentBarMessage",
      [brandName]
    );

    let buttonLabel = this.stringBundle.getString(
      AppConstants.platform == "win"
        ? "remoteContentPrefLabel"
        : "remoteContentPrefLabelUnix"
    );
    let buttonAccesskey = this.stringBundle.getString(
      AppConstants.platform == "win"
        ? "remoteContentPrefAccesskey"
        : "remoteContentPrefAccesskeyUnix"
    );

    let buttons = [
      {
        label: buttonLabel,
        accessKey: buttonAccesskey,
        popup: "remoteContentOptions",
        callback() {},
      },
    ];

    // The popup value is a space separated list of all the blocked origins.
    let popup = document.getElementById("remoteContentOptions");
    let principal = Services.scriptSecurityManager.createContentPrincipal(
      aContentURI,
      {}
    );
    let origins = popup.value ? popup.value.split(" ") : [];
    if (!origins.includes(principal.origin)) {
      origins.push(principal.origin);
    }
    popup.value = origins.join(" ");

    if (!this.isShowingRemoteContentNotification()) {
      let notification = this.msgNotificationBar.appendNotification(
        remoteContentMsg,
        "remoteContent",
        "chrome://messenger/skin/icons/remote-blocked.svg",
        this.msgNotificationBar.PRIORITY_WARNING_MEDIUM,
        aCanOverride ? buttons : []
      );

      notification.buttonContainer.firstElementChild.classList.add(
        "button-menu-list"
      );
    }
  },

  isShowingRemoteContentNotification() {
    return !!this.msgNotificationBar.getNotificationWithValue("remoteContent");
  },

  setPhishingMsg() {
    let phishingMsgNote = this.stringBundle.getString("phishingBarMessage");

    let buttonLabel = this.stringBundle.getString(
      AppConstants.platform == "win"
        ? "phishingBarPrefLabel"
        : "phishingBarPrefLabelUnix"
    );
    let buttonAccesskey = this.stringBundle.getString(
      AppConstants.platform == "win"
        ? "phishingBarPrefAccesskey"
        : "phishingBarPrefAccesskeyUnix"
    );

    let buttons = [
      {
        label: buttonLabel,
        accessKey: buttonAccesskey,
        popup: "phishingOptions",
        callback(aNotification, aButton) {},
      },
    ];

    if (!this.isShowingPhishingNotification()) {
      let notification = this.msgNotificationBar.appendNotification(
        phishingMsgNote,
        "maybeScam",
        "chrome://messenger/skin/icons/phishing.svg",
        this.msgNotificationBar.PRIORITY_CRITICAL_MEDIUM,
        buttons
      );

      notification.buttonContainer.firstElementChild.classList.add(
        "button-menu-list"
      );
    }
  },

  isShowingPhishingNotification() {
    return !!this.msgNotificationBar.getNotificationWithValue("maybeScam");
  },

  setMDNMsg(aMdnGenerator, aMsgHeader, aMimeHdr) {
    this.mdnGenerator = aMdnGenerator;
    // Return receipts can be RFC 3798 or not.
    let mdnHdr =
      aMimeHdr.extractHeader("Disposition-Notification-To", false) ||
      aMimeHdr.extractHeader("Return-Receipt-To", false); // not
    let fromHdr = aMimeHdr.extractHeader("From", false);

    let mdnAddr = MailServices.headerParser.extractHeaderAddressMailboxes(
      mdnHdr
    );
    let fromAddr = MailServices.headerParser.extractHeaderAddressMailboxes(
      fromHdr
    );

    let authorName =
      MailServices.headerParser.extractFirstName(
        aMsgHeader.mime2DecodedAuthor
      ) || aMsgHeader.author;

    // If the return receipt doesn't go to the sender address, note that in the
    // notification.
    let mdnBarMsg =
      mdnAddr != fromAddr
        ? this.stringBundle.getFormattedString("mdnBarMessageAddressDiffers", [
            authorName,
            mdnAddr,
          ])
        : this.stringBundle.getFormattedString("mdnBarMessageNormal", [
            authorName,
          ]);

    let buttons = [
      {
        label: this.stringBundle.getString("mdnBarSendReqButton"),
        accessKey: this.stringBundle.getString("mdnBarSendReqButtonKey"),
        popup: null,
        callback(aNotification, aButton) {
          SendMDNResponse();
          return false; // close notification
        },
      },
      {
        label: this.stringBundle.getString("mdnBarIgnoreButton"),
        accessKey: this.stringBundle.getString("mdnBarIgnoreButtonKey"),
        popup: null,
        callback(aNotification, aButton) {
          IgnoreMDNResponse();
          return false; // close notification
        },
      },
    ];

    this.msgNotificationBar.appendNotification(
      mdnBarMsg,
      "mdnRequested",
      null,
      this.msgNotificationBar.PRIORITY_INFO_MEDIUM,
      buttons
    );
  },

  setDraftEditMessage() {
    let msgHdr = gFolderDisplay.selectedMessage;
    if (!msgHdr || !msgHdr.folder) {
      return;
    }

    if (msgHdr.folder.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)) {
      let draftMsgNote = this.stringBundle.getString("draftMessageMsg");

      let buttons = [
        {
          label: this.stringBundle.getString("draftMessageButton"),
          accessKey: this.stringBundle.getString("draftMessageButtonKey"),
          popup: null,
          callback(aNotification, aButton) {
            MsgComposeDraftMessage();
            return true; // keep notification open
          },
        },
      ];

      this.msgNotificationBar.appendNotification(
        draftMsgNote,
        "draftMsgContent",
        null,
        this.msgNotificationBar.PRIORITY_INFO_HIGH,
        buttons
      );
    }
  },

  clearMsgNotifications() {
    this.msgNotificationBar.removeAllNotifications(true);
  },
};

/**
 * LoadMsgWithRemoteContent
 *   Reload the current message, allowing remote content
 */
function LoadMsgWithRemoteContent() {
  // we want to get the msg hdr for the currently selected message
  // change the "remoteContentBar" property on it
  // then reload the message

  setMsgHdrPropertyAndReload("remoteContentPolicy", kAllowRemoteContent);
  window.content.focus();
}

/**
 * Populate the remote content options for the current message.
 */
function onRemoteContentOptionsShowing(aEvent) {
  let origins = aEvent.target.value ? aEvent.target.value.split(" ") : [];

  let addresses = MailServices.headerParser.parseEncodedHeader(
    gMessageDisplay.displayedMessage.author
  );
  addresses = addresses.slice(0, 1);
  // If there is an author's email, put it also in the menu.
  let adrCount = addresses.length;
  if (adrCount > 0) {
    let authorEmailAddress = addresses[0].email;
    let authorEmailAddressURI = Services.io.newURI(
      "chrome://messenger/content/email=" + authorEmailAddress
    );
    let mailPrincipal = Services.scriptSecurityManager.createContentPrincipal(
      authorEmailAddressURI,
      {}
    );
    origins.push(mailPrincipal.origin);
  }

  let messengerBundle = document.getElementById("bundle_messenger");

  // Out with the old...
  let children = aEvent.target.children;
  for (let i = children.length - 1; i >= 0; i--) {
    if (children[i].getAttribute("class") == "allow-remote-uri") {
      children[i].remove();
    }
  }

  let urlSepar = document.getElementById("remoteContentAllMenuSeparator");

  // ... and in with the new.
  for (let origin of origins) {
    let menuitem = document.createXULElement("menuitem");
    menuitem.setAttribute(
      "label",
      messengerBundle.getFormattedString("remoteAllowResource", [
        origin.replace("chrome://messenger/content/email=", ""),
      ])
    );
    menuitem.setAttribute("value", origin);
    menuitem.setAttribute("class", "allow-remote-uri");
    menuitem.setAttribute("oncommand", "allowRemoteContentForURI(this.value);");
    if (origin.startsWith("chrome://messenger/content/email=")) {
      aEvent.target.appendChild(menuitem);
    } else {
      aEvent.target.insertBefore(menuitem, urlSepar);
    }
  }

  let URLcount = origins.length - adrCount;
  let allowAllItem = document.getElementById("remoteContentOptionAllowAll");
  let allURLLabel = messengerBundle.getString("remoteAllowAll");
  allowAllItem.label = PluralForm.get(URLcount, allURLLabel).replace(
    "#1",
    URLcount
  );

  allowAllItem.collapsed = URLcount < 2;
  document.getElementById(
    "remoteContentOriginsMenuSeparator"
  ).collapsed = urlSepar.collapsed = allowAllItem.collapsed && adrCount == 0;
}

/**
 * Add privileges to display remote content for the given uri.
 *
 * @param aUriSpec |String| uri for the site to add permissions for.
 * @param aReload  Reload the message display after allowing the URI.
 */
function allowRemoteContentForURI(aUriSpec, aReload = true) {
  let uri = Services.io.newURI(aUriSpec);
  Services.perms.addFromPrincipal(
    Services.scriptSecurityManager.createContentPrincipal(uri, {}),
    "image",
    Services.perms.ALLOW_ACTION
  );
  if (aReload) {
    ReloadMessage();
  }
}

/**
 * Add privileges to display remote content for the given uri.
 *
 * @param aListNode  The menulist element containing the URIs to allow.
 */
function allowRemoteContentForAll(aListNode) {
  let uriNodes = aListNode.querySelectorAll(".allow-remote-uri");
  for (let uriNode of uriNodes) {
    if (!uriNode.value.startsWith("chrome://messenger/content/email=")) {
      allowRemoteContentForURI(uriNode.value, false);
    }
  }
  ReloadMessage();
}

/**
 * Displays fine-grained, per-site preferences for remote content.
 */
function editRemoteContentSettings() {
  openOptionsDialog("panePrivacy", "privacyCategory");
}

/**
 *  Set the msg hdr flag to ignore the phishing warning and reload the message.
 */
function IgnorePhishingWarning() {
  // This property should really be called skipPhishingWarning or something
  // like that, but it's too late to change that now.
  // This property is used to suppress the phishing bar for the message.
  setMsgHdrPropertyAndReload("notAPhishMessage", 1);
}

/**
 *  Open the preferences dialog to allow disabling the scam feature.
 */
function OpenPhishingSettings() {
  openOptionsDialog("panePrivacy", "privacySecurityCategory");
}

function setMsgHdrPropertyAndReload(aProperty, aValue) {
  // we want to get the msg hdr for the currently selected message
  // change the appropriate property on it then reload the message
  var msgHdr = gMessageDisplay.displayedMessage;
  if (msgHdr) {
    msgHdr.setUint32Property(aProperty, aValue);
    ReloadMessage();
  }
}

/**
 * Mark a specified message as read.
 * @param msgHdr header (nsIMsgDBHdr) of the message to mark as read
 */
function MarkMessageAsRead(msgHdr) {
  ClearPendingReadTimer();
  msgHdr.folder.markMessagesRead([msgHdr], true);
  reportMsgRead({ isNewRead: true });
}

function ClearPendingReadTimer() {
  if (gMarkViewedMessageAsReadTimer) {
    clearTimeout(gMarkViewedMessageAsReadTimer);
    gMarkViewedMessageAsReadTimer = null;
  }
}

// this is called when layout is actually finished rendering a
// mail message. OnMsgLoaded is called when libmime is done parsing the message
function OnMsgParsed(aUrl) {
  // browser doesn't do this, but I thought it could be a useful thing to test out...
  // If the find bar is visible and we just loaded a new message, re-run
  // the find command. This means the new message will get highlighted and
  // we'll scroll to the first word in the message that matches the find text.
  var findBar = document.getElementById("FindToolbar");
  if (!findBar.hidden) {
    findBar.onFindAgainCommand(false);
  }

  // Run the phishing detector on the message if it hasn't been marked as not
  // a scam already.
  var msgHdr = gMessageDisplay.displayedMessage;
  if (msgHdr && !msgHdr.getUint32Property("notAPhishMessage")) {
    gPhishingDetector.analyzeMsgForPhishingURLs(aUrl);
  }

  // Notify anyone (e.g., extensions) who's interested in when a message is loaded.
  let selectedMessageUris = gFolderDisplay.selectedMessageUris;
  let msgURI = selectedMessageUris ? selectedMessageUris[0] : null;
  Services.obs.notifyObservers(
    msgWindow.msgHeaderSink,
    "MsgMsgDisplayed",
    msgURI
  );

  let browser = getMessagePaneBrowser();
  let doc = browser && browser.contentDocument ? browser.contentDocument : null;

  // Rewrite any anchor elements' href attribute to reflect that the loaded
  // document is a mailnews url. This will cause docShell to scroll to the
  // element in the document rather than opening the link externally.
  let links = doc && doc.links ? doc.links : [];
  for (let linkNode of links) {
    if (!linkNode.hash) {
      continue;
    }

    // We have a ref fragment which may reference a node in this document.
    // Ensure html in mail anchors work as expected.
    let anchorId = linkNode.hash.replace("#", "");
    // Continue if an id (html5) or name attribute value for the ref is not
    // found in this document.
    let selector = "#" + anchorId + ", [name='" + anchorId + "']";
    try {
      if (!linkNode.ownerDocument.querySelector(selector)) {
        continue;
      }
    } catch (ex) {
      continue;
    }

    // Then check if the href url matches the document baseURL.
    if (
      makeURI(linkNode.href).specIgnoringRef !=
      makeURI(linkNode.baseURI).specIgnoringRef
    ) {
      continue;
    }

    // Finally, if the document url is a message url, and the anchor href is
    // http, it needs to be adjusted so docShell finds the node.
    let messageURI = makeURI(linkNode.ownerDocument.URL);
    if (
      messageURI instanceof Ci.nsIMsgMailNewsUrl &&
      linkNode.href.startsWith("http")
    ) {
      linkNode.href = messageURI.specIgnoringRef + linkNode.hash;
    }
  }

  // Scale any overflowing images, exclude http content.
  let imgs = doc && !doc.URL.startsWith("http") ? doc.images : [];
  for (let img of imgs) {
    if (
      img.clientWidth - doc.body.offsetWidth >= 0 &&
      (img.clientWidth <= img.naturalWidth || !img.naturalWidth)
    ) {
      img.setAttribute("overflowing", "true");
    }

    // This is the default case for images when a message is loaded.
    img.setAttribute("shrinktofit", "true");
  }
}

function OnMsgLoaded(aUrl) {
  if (!aUrl || gMessageDisplay.isDummy) {
    return;
  }

  var msgHdr = gMessageDisplay.displayedMessage;
  window.dispatchEvent(new CustomEvent("MsgLoaded", { detail: msgHdr }));

  var wintype = document.documentElement.getAttribute("windowtype");

  gMessageNotificationBar.setJunkMsg(msgHdr);

  goUpdateCommand("button_delete");

  var markReadAutoMode = Services.prefs.getBoolPref(
    "mailnews.mark_message_read.auto"
  );

  // We just finished loading a message. If messages are to be marked as read
  // automatically, set a timer to mark the message is read after n seconds
  // where n can be configured by the user.
  if (msgHdr && !msgHdr.isRead && markReadAutoMode) {
    let markReadOnADelay = Services.prefs.getBoolPref(
      "mailnews.mark_message_read.delay"
    );

    // Only use the timer if viewing using the 3-pane preview pane and the
    // user has set the pref.
    if (markReadOnADelay && wintype == "mail:3pane") {
      // 3-pane window
      ClearPendingReadTimer();
      let markReadDelayTime = Services.prefs.getIntPref(
        "mailnews.mark_message_read.delay.interval"
      );
      if (markReadDelayTime == 0) {
        MarkMessageAsRead(msgHdr);
      } else {
        gMarkViewedMessageAsReadTimer = setTimeout(
          MarkMessageAsRead,
          markReadDelayTime * 1000,
          msgHdr
        );
      }
    } else {
      // standalone msg window
      MarkMessageAsRead(msgHdr);
    }
  }

  // See if MDN was requested but has not been sent.
  HandleMDNResponse(aUrl);

  // Reset the blocked hosts so we can populate it again for this message.
  document.getElementById("remoteContentOptions").value = "";
}

/**
 * This function handles all mdn response generation (ie, imap and pop).
 * For pop the msg uid can be 0 (ie, 1st msg in a local folder) so no
 * need to check uid here. No one seems to set mimeHeaders to null so
 * no need to check it either.
 */
function HandleMDNResponse(aUrl) {
  if (!aUrl) {
    return;
  }

  var msgFolder = aUrl.folder;
  var msgHdr = gFolderDisplay.selectedMessage;
  if (!msgFolder || !msgHdr || gFolderDisplay.selectedMessageIsNews) {
    return;
  }

  // if the message is marked as junk, do NOT attempt to process a return receipt
  // in order to better protect the user
  if (SelectedMessagesAreJunk()) {
    return;
  }

  var mimeHdr;

  try {
    mimeHdr = aUrl.mimeHeaders;
  } catch (ex) {
    return;
  }

  // If we didn't get the message id when we downloaded the message header,
  // we cons up an md5: message id. If we've done that, we'll try to extract
  // the message id out of the mime headers for the whole message.
  var msgId = msgHdr.messageId;
  if (msgId.startsWith("md5:")) {
    var mimeMsgId = mimeHdr.extractHeader("Message-Id", false);
    if (mimeMsgId) {
      msgHdr.messageId = mimeMsgId;
    }
  }

  // After a msg is downloaded it's already marked READ at this point so we must check if
  // the msg has a "Disposition-Notification-To" header and no MDN report has been sent yet.
  if (msgHdr.flags & Ci.nsMsgMessageFlags.MDNReportSent) {
    return;
  }

  var DNTHeader = mimeHdr.extractHeader("Disposition-Notification-To", false);
  var oldDNTHeader = mimeHdr.extractHeader("Return-Receipt-To", false);
  if (!DNTHeader && !oldDNTHeader) {
    return;
  }

  // Everything looks good so far, let's generate the MDN response.
  var mdnGenerator = Cc[
    "@mozilla.org/messenger-mdn/generator;1"
  ].createInstance(Ci.nsIMsgMdnGenerator);
  const MDN_DISPOSE_TYPE_DISPLAYED = 0;
  let askUser = mdnGenerator.process(
    MDN_DISPOSE_TYPE_DISPLAYED,
    msgWindow,
    msgFolder,
    msgHdr.messageKey,
    mimeHdr,
    false
  );
  if (askUser) {
    gMessageNotificationBar.setMDNMsg(mdnGenerator, msgHdr, mimeHdr);
  }
}

function SendMDNResponse() {
  gMessageNotificationBar.mdnGenerator.userAgreed();
}

function IgnoreMDNResponse() {
  gMessageNotificationBar.mdnGenerator.userDeclined();
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
  let tabmail = document.getElementById("tabmail");
  if (!tabmail) {
    // This should never happen.
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
    case "chat":
      searchInput = document.getElementById("IMSearchInput");
      break;
    default:
      searchInput = document.getElementById("searchInput");
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
    searchInput.select();
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

/**
 * Opens a search window with the given folder, or the displayed one if none is
 * chosen.
 *
 * @param [aFolder] the folder to open the search window for, if different from
 *                  the displayed one
 */
function MsgSearchMessages(aFolder) {
  // We always open a new search dialog for each search command
  window.openDialog(
    "chrome://messenger/content/SearchDialog.xhtml",
    "_blank",
    "chrome,resizable,status,centerscreen,dialog=no",
    {
      folder:
        aFolder ||
        gFolderDisplay.displayedFolder ||
        gFolderTreeView.getSelectedFolders()[0],
    }
  );
}

function MsgJunkMailInfo(aCheckFirstUse) {
  if (aCheckFirstUse) {
    if (!Services.prefs.getBoolPref("mailnews.ui.junk.firstuse")) {
      return;
    }
    Services.prefs.setBoolPref("mailnews.ui.junk.firstuse", false);

    // check to see if this is an existing profile where the user has started using
    // the junk mail feature already
    if (MailServices.junk.userHasClassified) {
      return;
    }
  }

  var desiredWindow = Services.wm.getMostRecentWindow("mailnews:junkmailinfo");

  if (desiredWindow) {
    desiredWindow.focus();
  } else {
    window.openDialog(
      "chrome://messenger/content/junkMailInfo.xhtml",
      "mailnews:junkmailinfo",
      "centerscreen,resizable=no,titlebar,chrome,modal",
      null
    );
  }
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
  InitAppFolderViewsMenu();
  document.commandDispatcher.updateCommands("create-menu-tasks");
}

/**
 * Generate menu items that open a preferences dialog/tab for an installed addon,
 * and add them to a menu popup. E.g. in the appmenu or Tools menu > addon prefs.
 *
 * @param {Element} parent        The element (e.g. menupopup) to populate.
 * @param {string} [elementName]  The kind of menu item elements to create (e.g. "toolbarbutton").
 * @param {string} [classes]      Classes for menu item elements with no icon.
 * @param {string} [iconClasses]  Classes for menu item elements with an icon.
 */
async function initAddonPrefsMenu(
  parent,
  elementName = "menuitem",
  classes,
  iconClasses = "menuitem-iconic"
) {
  // Starting at the bottom, clear all menu items until we hit
  // "no add-on prefs", which is the only disabled element. Above this element
  // there may be further items that we want to preserve.
  let noPrefsElem = parent.querySelector('[disabled="true"]');
  while (parent.lastChild != noPrefsElem) {
    parent.lastChild.remove();
  }

  // Enumerate all enabled addons with URL to XUL document with prefs.
  let addonsFound = [];
  for (let addon of await AddonManager.getAddonsByTypes(["extension"])) {
    if (addon.userDisabled || addon.appDisabled || addon.softDisabled) {
      continue;
    }
    if (addon.optionsURL) {
      if (addon.optionsType == 5) {
        addonsFound.push({
          addon,
          optionsURL: `addons://detail/${encodeURIComponent(
            addon.id
          )}/preferences`,
          optionsOpenInAddons: true,
        });
      } else if (addon.optionsType === null || addon.optionsType == 3) {
        addonsFound.push({
          addon,
          optionsURL: addon.optionsURL,
          optionsOpenInTab: addon.optionsType == 3,
        });
      }
    }
  }

  // Populate the menu with addon names and icons.
  // Note: Having the following code in the getAddonsByTypes() async callback
  // above works on Windows and Linux but doesn't work on Mac, see bug 1419145.
  if (addonsFound.length > 0) {
    addonsFound.sort((a, b) => a.addon.name.localeCompare(b.addon.name));
    for (let {
      addon,
      optionsURL,
      optionsOpenInTab,
      optionsOpenInAddons,
    } of addonsFound) {
      let newItem = document.createXULElement(elementName);
      newItem.setAttribute("label", addon.name);
      newItem.setAttribute("value", optionsURL);
      if (optionsOpenInTab) {
        newItem.setAttribute("optionsType", "tab");
      } else if (optionsOpenInAddons) {
        newItem.setAttribute("optionsType", "addons");
      }
      let iconURL = addon.iconURL || addon.icon64URL;
      if (iconURL) {
        newItem.setAttribute("class", iconClasses);
        newItem.setAttribute("image", iconURL);
      } else if (classes) {
        newItem.setAttribute("class", classes);
      }
      parent.appendChild(newItem);
    }
    noPrefsElem.setAttribute("collapsed", "true");
  } else {
    // Only show message that there are no addons with prefs.
    noPrefsElem.setAttribute("collapsed", "false");
  }
}

function openNewCardDialog() {
  window.openDialog(
    "chrome://messenger/content/addressbook/abNewCardDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen"
  );
}
