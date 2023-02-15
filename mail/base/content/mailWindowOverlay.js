/* -*- indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gSpacesToolbar */

/* import-globals-from ../../../mailnews/extensions/newsblog/newsblogOverlay.js */
/* import-globals-from commandglue.js */
/* import-globals-from contentAreaClick.js */
/* import-globals-from mail3PaneWindowCommands.js */
/* import-globals-from mailCommands.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindow.js */
/* import-globals-from utilityOverlay.js */

/* globals OnTagsChange, currentHeaderData */ // TODO: these aren't real.

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  BrowserToolboxLauncher:
    "resource://devtools/client/framework/browser-toolbox/Launcher.sys.mjs",
});
XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MimeParser: "resource:///modules/mimeParser.jsm",
});

Object.defineProperty(this, "BrowserConsoleManager", {
  get() {
    let { loader } = ChromeUtils.importESModule(
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
  let folder = document.getElementById("tabmail")?.currentTabInfo.folder;
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

  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
  }

  let folder = message?.folder;

  document
    .getElementById("cmd_killThread")
    .setAttribute("checked", folder?.msgDatabase.isIgnored(message.messageKey));
  document
    .getElementById("cmd_killSubthread")
    .setAttribute(
      "checked",
      folder && message.flags & Ci.nsMsgMessageFlags.Ignored
    );
  document
    .getElementById("cmd_watchThread")
    .setAttribute("checked", folder?.msgDatabase.isWatched(message.messageKey));
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
    // TODO: Reimplement this as a command.
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
}

function InitAppFolderViewsMenu() {
  goSetMenuValue("cmd_delete", "valueDefault");
  goSetAccessKey("cmd_delete", "valueDefaultAccessKey");
  document.commandDispatcher.updateCommands("create-menu-edit");

  // Initialize the favorite Folder checkbox in the appmenu menu.
  let favoriteAppFolderMenu = document.getElementById("appmenu_favoriteFolder");
  if (!favoriteAppFolderMenu.hasAttribute("disabled")) {
    // TODO: Reimplement this as a command.
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
  let accountCentralDisplayed;
  let folderDisplayVisible;
  let message;
  let messageDisplayVisible;

  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (tab?.mode.name == "mail3PaneTab") {
    ({
      accountCentralVisible: accountCentralDisplayed,
      folderPaneVisible: folderDisplayVisible,
      message,
      messagePaneVisible: messageDisplayVisible,
    } = tab);
  } else if (tab?.mode.name == "mailMessageTab") {
    message = tab.message;
    messageDisplayVisible = true;
  }

  let isFeed = FeedUtils.isFeedMessage(message);

  let messagePaneMenuItem = document.getElementById("menu_showMessage");
  if (!messagePaneMenuItem.hidden) {
    // Hidden in the standalone msg window.
    messagePaneMenuItem.setAttribute(
      "checked",
      accountCentralDisplayed ? false : messageDisplayVisible
    );
    messagePaneMenuItem.disabled = accountCentralDisplayed;
  }

  let messagePaneAppMenuItem = document.getElementById("appmenu_showMessage");
  if (messagePaneAppMenuItem && !messagePaneAppMenuItem.hidden) {
    // Hidden in the standalone msg window.
    messagePaneAppMenuItem.setAttribute(
      "checked",
      accountCentralDisplayed ? false : messageDisplayVisible
    );
    messagePaneAppMenuItem.disabled = accountCentralDisplayed;
  }

  let folderPaneMenuItem = document.getElementById("menu_showFolderPane");
  if (!folderPaneMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneMenuItem.setAttribute("checked", folderDisplayVisible);
  }

  let folderPaneAppMenuItem = document.getElementById("appmenu_showFolderPane");
  if (!folderPaneAppMenuItem.hidden) {
    // Hidden in the standalone msg window.
    folderPaneAppMenuItem.setAttribute("checked", folderDisplayVisible);
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

  document.getElementById(
    "viewMessageViewMenu"
  ).disabled = accountCentralDisplayed;

  document.getElementById(
    "viewMessagesMenu"
  ).disabled = accountCentralDisplayed;

  // Hide the "View > Messages" menu item if the user doesn't have the "Views"
  // (aka "Mail Views") toolbar button in the main toolbar. (See bug 1563789.)
  var viewsToolbarButton = document.getElementById("mailviews-container");
  document.getElementById("viewMessageViewMenu").hidden = !viewsToolbarButton;

  // Initialize the Message Body menuitem
  document.getElementById("viewBodyMenu").hidden = isFeed;

  // Initialize the Show Feed Summary menu
  let viewFeedSummary = document.getElementById("viewFeedSummary");
  viewFeedSummary.hidden = !isFeed;

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

  document.commandDispatcher.updateCommands("create-menu-view");

  // No need to do anything if we don't have a spaces toolbar like in standalone
  // windows or another non tabmail window.
  let spacesToolbarMenu = document.getElementById("appmenu_spacesToolbar");
  if (spacesToolbarMenu) {
    // Update the spaces toolbar menu items.
    let isSpacesVisible = !gSpacesToolbar.isHidden;
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
  let currentDensity = UIDensity.prefValue;

  for (let item of event.target.querySelectorAll("menuitem")) {
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
  let currentDensity = UIDensity.prefValue;

  for (let item of document.querySelectorAll(
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
 * Called when showing the menu_viewSortPopup menupopup, so it should always
 * be up-to-date.
 */
function InitViewSortByMenu() {
  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (tab?.mode.name != "mail3PaneTab") {
    return;
  }

  let { gViewWrapper, threadPane } = tab.chromeBrowser.contentWindow;
  if (!gViewWrapper?.dbView) {
    return;
  }

  let {
    primarySortType,
    primarySortOrder,
    showGroupedBySort,
    showThreaded,
  } = gViewWrapper;
  let hiddenColumns = threadPane.columns
    .filter(c => c.hidden)
    .map(c => c.sortKey);

  let isSortTypeValidForGrouping = [
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

  let setSortItemAttrs = function(id, sortKey) {
    let menuItem = document.getElementById(id);
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

  let groupBySortOrderMenuItem = document.getElementById("groupBySort");
  groupBySortOrderMenuItem.setAttribute(
    "disabled",
    !isSortTypeValidForGrouping
  );
  groupBySortOrderMenuItem.setAttribute("checked", showGroupedBySort);
}

function InitViewMessagesMenu() {
  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (!["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    return;
  }

  let viewWrapper = tab.chromeBrowser.contentWindow.gViewWrapper;

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
  let message;

  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
  }

  let isNews = message?.folder?.flags & Ci.nsMsgFolderFlags.Newsgroup;
  let isFeed = message && FeedUtils.isFeedMessage(message);
  let isDummy = message?.folder == null;

  // We show reply to Newsgroups only for news messages.
  document.getElementById("replyNewsgroupMainMenu").hidden = !isNews;

  // For mail messages we say reply. For news we say ReplyToSender.
  document.getElementById("replyMainMenu").hidden = isNews;
  document.getElementById("replySenderMainMenu").hidden = !isNews;

  document.getElementById("menu_cancel").hidden = !isNews;

  // Disable the move menu if there are no messages selected or if
  // the message is a dummy - e.g. opening a message in the standalone window.
  let messageStoredInternally = message && !isDummy;
  // Disable the move menu if we can't delete msgs from the folder.
  let canMove =
    messageStoredInternally && !isNews && message.folder.canDeleteMessages;

  document.getElementById("moveMenu").disabled = !canMove;

  document.getElementById("copyMenu").disabled = !message;

  initMoveToFolderAgainMenu(document.getElementById("moveToFolderAgain"));

  // Disable the Forward As menu item if no message is selected.
  document.getElementById("forwardAsMenu").disabled = !message;

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
  document.getElementById("markMenu").disabled = isDummy;

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
  let folder, message;

  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    ({ message, folder } = tab);
  } else if (tab?.mode.tabType.name == "mail") {
    ({ displayedFolder: folder, selectedMessage: message } = tab.folderDisplay);
  }

  let inSpecialFolder =
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
  let lastFolderURI = Services.prefs.getStringPref(
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

/**
 * Update the "Show Header" menu items to reflect the current pref.
 */
function InitViewHeadersMenu() {
  let dt = Ci.nsMimeHeaderDisplayTypes;
  let headerchoice = Services.prefs.getIntPref("mail.show_headers");
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

  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
  }

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
  let isFeed = FeedUtils.isFeedMessage(message);
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
    ).hidden = !gShowFeedSummary;
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

  let message;

  let tab = document.getElementById("tabmail")?.currentTabInfo;
  if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
    message = tab.message;
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
    let item = parent.ownerDocument.createXULElement(elementName);
    SetMessageTagLabel(item, index + 1, tagInfo.tag);

    if (removeKey) {
      item.setAttribute("checked", "true");
    }
    item.setAttribute("value", tagInfo.key);
    item.setAttribute("type", "checkbox");
    item.addEventListener("command", function(event) {
      let tab = document.getElementById("tabmail")?.currentTabInfo;
      if (["mail3PaneTab", "mailMessageTab"].includes(tab?.mode.name)) {
        tab.chromeBrowser.contentWindow.commandController.doCommand(
          "cmd_toggleTag",
          event
        );
      }
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

/**
 * Refresh the contents of the recently closed tags popup menu/panel.
 * Used for example for appmenu/Go/Recently_Closed_Tabs panel.
 *
 * @param {Element} parent - Parent element that will contain the menu items.
 * @param {string} [elementName] - Type of menu item, e.g. "menuitem", "toolbarbutton".
 * @param {string} [classes] - Classes to set on the menu items.
 * @param {string} [separatorName] - Type of separator, e.g. "menuseparator", "toolbarseparator".
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

    item.addEventListener("command", goRestoreAllTabs);

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
/*
TODO: Fix and enable this code.
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
    newMenuItem.addEventListener("command", event => {
      NavigateToUri(event.target);
      event.stopPropagation();
    });
    menuPopup.appendChild(newMenuItem);
    if (!(relPos % 20)) {
      break;
    }
  }
}
*/
/**
 * This is triggered by the history navigation menu options, as created by
 *  populateHistoryMenu above.
 */
/*
TODO: Fix and enable this code.
function NavigateToUri(target) {
  var historyIndex = target.getAttribute("value");
  var msgUri = messenger.getMsgUriAtNavigatePos(historyIndex);
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
  // TODO: Reimplement the rest of this or throw out the feature altogether.
}

function forwardToolbarMenu_init(menuPopup) {
  populateHistoryMenu(menuPopup, false);
}
*/
function InitMessageMark() {
  // TODO: Fix or remove this function.
  // document
  //   .getElementById("cmd_markAsFlagged")
  //   .setAttribute("checked", SelectedMessagesAreFlagged());

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

function MsgGetMessage() {
  // if offline, prompt for getting messages
  if (MailOfflineMgr.isOnline() || MailOfflineMgr.getNewMail()) {
    GetFolderMessages();
  }
}

function MsgPauseUpdates(selectedFolders = GetSelectedMsgFolders(), pause) {
  // Pause single feed folder subscription updates, or all account updates if
  // folder is the account folder.
  let folder = selectedFolders.length ? selectedFolders[0] : null;
  if (!FeedUtils.isFeedFolder(folder)) {
    return;
  }

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
    for (let server of MailServices.accounts.allServers) {
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
  let msgFolder = document.getElementById("tabmail")?.currentTabInfo.folder;

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

function CanComposeMessages() {
  return MailServices.accounts.allIdentities.length > 0;
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

  let tabmail = document.getElementById("tabmail");
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

/**
 * Save the given string to a file, then open it as an .eml file.
 *
 * @param {string} data - The message
 */
function MsgOpenMessageFromString(data) {
  let tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tempFile.append("subPart.eml");
  tempFile.createUnique(0, 0o600);

  let outputStream = Cc[
    "@mozilla.org/network/file-output-stream;1"
  ].createInstance(Ci.nsIFileOutputStream);
  outputStream.init(tempFile, 2, 0x200, false); // open as "write only"
  outputStream.write(data, data.length);
  outputStream.close();

  // Delete file on exit, because Windows locks the file
  let extAppLauncher = Cc[
    "@mozilla.org/uriloader/external-helper-app-service;1"
  ].getService(Ci.nsPIExternalAppLauncher);
  extAppLauncher.deleteTemporaryFileOnExit(tempFile);

  let url = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler)
    .newFileURI(tempFile);

  MsgOpenEMLFile(tempFile, url);
}

function MsgOpenNewWindowForMessage(aMsgHdr, aView) {
  // We need to tell the window about our current view so that it can clone it.
  // This enables advancing through the messages, etc.
  window.openDialog(
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
  // TODO: Reimplement or fix the callers.
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
  let selectedServers = selectedFolders.filter(folder => folder.isServer);
  if (!selectedServers.length) {
    return;
  }

  let bundle = document.getElementById("bundle_messenger");
  if (
    !Services.prompt.confirm(
      window,
      bundle.getString("confirmMarkAllFoldersReadTitle"),
      bundle.getString("confirmMarkAllFoldersReadMessage")
    )
  ) {
    return;
  }

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
    // Try to determine the folder from the selected message.
    if (gDBView) {
      // Here we face a decision. If the message has been moved to a different
      // account, then a single filter cannot work for both manual and incoming
      // scope. So we will create the filter based on its existing location,
      // which will make it work properly in manual scope. This is the best
      // solution for POP3 with global inbox (as then both manual and incoming
      // filters work correctly), but may not be what IMAP users who filter to a
      // local folder really want.
      try {
        // TODO: Fix this.
        // folder = gFolderDisplay.selectedMessage.folder;
      } catch (ex) {}
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
  for (let server of MailServices.accounts.allServers) {
    if (server.type == "none") {
      continue;
    }
    return true;
  }
  return false;
}

function IsGetNextNMessagesEnabled() {
  let selectedFolders = GetSelectedMsgFolders();
  let folder = selectedFolders.length ? selectedFolders[0] : null;

  let menuItem = document.getElementById("menu_getnextnmsg");
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

    for (let server of MailServices.accounts.allServers) {
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
  return false;
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
  InitAppFolderViewsMenu();
  document.commandDispatcher.updateCommands("create-menu-tasks");
  UIFontSize.updateAppMenuButton(window);
  initUiDensityAppMenu();
}

/**
 * Generate menu items that open a preferences dialog/tab for an installed addon,
 * and add them to a menu popup. E.g. in the appmenu or Tools menu > addon prefs.
 *
 * @param {Element} parent - The element (e.g. menupopup) to populate.
 * @param {string} [elementName] - The kind of menu item elements to create (e.g. "toolbarbutton").
 * @param {string} [classes] - Classes for menu item elements with no icon.
 * @param {string} [iconClasses] - Classes for menu item elements with an icon.
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
