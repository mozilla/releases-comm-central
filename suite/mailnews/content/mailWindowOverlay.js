/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {PluralForm} = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
var {FeedUtils} = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
var { FolderUtils } = ChromeUtils.import("resource:///modules/FolderUtils.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.js");

var kClassicMailLayout  = 0;
var kWideMailLayout     = 1;
var kVerticalMailLayout = 2;

var kMouseButtonLeft   = 0;
var kMouseButtonMiddle = 1;
var kMouseButtonRight  = 2;

// Per message header flags to keep track of whether the user is allowing remote
// content for a particular message.
// if you change or add more values to these constants, be sure to modify
// the corresponding definitions in nsMsgContentPolicy.cpp
var kNoRemoteContentPolicy = 0;
var kBlockRemoteContent = 1;
var kAllowRemoteContent = 2;

var kIsAPhishMessage = 0;
var kNotAPhishMessage = 1;

var kMsgForwardAsAttachment = 0;

var gMessengerBundle;
var gOfflineManager;
// Timer to mark read, if the user has configured the app to mark a message as
// read if it is viewed for more than n seconds.
var gMarkViewedMessageAsReadTimer = null;

// The user preference, if HTML is not allowed. Assume, that the user could have
// set this to a value > 1 in their prefs.js or user.js, but that the value will
// not change during runtime other than through the MsgBody*() functions below.
var gDisallow_classes_no_html = 1;

// Disable the File | New | Account... menu item if the account preference is
// locked. Two other affected areas are the account central and the account
// manager dialogs.
function menu_new_init() {
  let folders = GetSelectedMsgFolders();
  if (folders.length != 1)
    return;

  let folder = folders[0];

  if (!gMessengerBundle)
    gMessengerBundle = document.getElementById("bundle_messenger");

  if (Services.prefs.prefIsLocked("mail.disable_new_account_addition"))
    document.getElementById("newAccountMenuItem")
            .setAttribute("disabled", "true");

  let isInbox = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Inbox, false);
  let showNew = folder.canCreateSubfolders ||
                (isInbox && !(folder.flags & Ci.nsMsgFolderFlags.Virtual));
  ShowMenuItem("menu_newFolder", showNew);
  ShowMenuItem("menu_newVirtualFolder", showNew);
  EnableMenuItem("menu_newFolder", folder.server.type != "imap" ||
                                   !Services.io.offline);
  if (showNew) {
    // Change "New Folder..." menu according to the context.
    let label = (folder.isServer || isInbox) ? "newFolderMenuItem" :
                                               "newSubfolderMenuItem";
    SetMenuItemLabel("menu_newFolder", gMessengerBundle.getString(label));
  }
}

function goUpdateMailMenuItems(commandset) {
  for (var i = 0; i < commandset.childNodes.length; i++) {
    var commandID = commandset.childNodes[i].getAttribute("id");
    if (commandID)
      goUpdateCommand(commandID);
  }
}

function file_init() {
  document.commandDispatcher.updateCommands("create-menu-file");
}

function InitEditMessagesMenu() {
  goSetMenuValue("cmd_delete", "valueDefault");
  goSetAccessKey("cmd_delete", "valueDefaultAccessKey");
  document.commandDispatcher.updateCommands("create-menu-edit");

  // initialize the favorite Folder checkbox in the edit menu
  let favoriteFolderMenu = document.getElementById("menu_favoriteFolder");
  if (!favoriteFolderMenu.hasAttribute("disabled")) {
    let folders = GetSelectedMsgFolders();
    if (folders.length == 1 && !folders[0].isServer) {
      let checked = folders[0].getFlag(Ci.nsMsgFolderFlags.Favorite);
      // Adjust the checked state on the menu item.
      favoriteFolderMenu.setAttribute("checked", checked);
      favoriteFolderMenu.hidden = false;
    } else {
      favoriteFolderMenu.hidden = true;
    }
  }
}

function InitGoMessagesMenu() {
  // deactivate the folders in the go menu if we don't have a folderpane
  document.getElementById("goFolderMenu")
          .setAttribute("disabled", IsFolderPaneCollapsed());
  document.commandDispatcher.updateCommands("create-menu-go");
}

function view_init() {
  if (!gMessengerBundle)
    gMessengerBundle = document.getElementById("bundle_messenger");

  var message_menuitem = document.getElementById("menu_showMessagePane");
  if (message_menuitem && !message_menuitem.hidden) {
    message_menuitem.setAttribute("checked", !IsMessagePaneCollapsed());
    message_menuitem.setAttribute("disabled", gAccountCentralLoaded);
  }

  var threadpane_menuitem = document.getElementById("menu_showThreadPane");
  if (threadpane_menuitem && !threadpane_menuitem.hidden) {
    threadpane_menuitem.setAttribute("checked", !IsDisplayDeckCollapsed());
    threadpane_menuitem.setAttribute("disabled", gAccountCentralLoaded);
  }

  var folderPane_menuitem = document.getElementById("menu_showFolderPane");
  if (folderPane_menuitem && !folderPane_menuitem.hidden)
    folderPane_menuitem.setAttribute("checked", !IsFolderPaneCollapsed());

  document.getElementById("viewSortMenu").disabled = gAccountCentralLoaded;
  document.getElementById("viewMessageViewMenu").disabled = gAccountCentralLoaded;
  document.getElementById("viewMessagesMenu").disabled = gAccountCentralLoaded;
  document.getElementById("charsetMenu").disabled = !gMessageDisplay.displayedMessage;

  // Initialize the Message Body menuitem
  let isFeed = gFolderDisplay &&
               ((gFolderDisplay.displayedFolder &&
                 gFolderDisplay.displayedFolder.server.type == "rss") ||
                gFolderDisplay.selectedMessageIsFeed);
  document.getElementById("viewBodyMenu").hidden = isFeed;

  // Initialize the Show Feed Summary menu
  let viewFeedSummary = document.getElementById("viewFeedSummary");
  viewFeedSummary.hidden = !isFeed ||
    document.documentElement.getAttribute("windowtype") != "mail:3pane";

  let viewRssMenuItemIds = ["bodyFeedGlobalWebPage",
                            "bodyFeedGlobalSummary",
                            "bodyFeedPerFolderPref"];
  let checked = FeedMessageHandler.onSelectPref;
  for (let [index, id] of viewRssMenuItemIds.entries()) {
    document.getElementById(id)
            .setAttribute("checked", index == checked);
  }

  // Initialize the Display Attachments Inline menu.
  var viewAttachmentInline = Services.prefs.getBoolPref("mail.inline_attachments");
  document.getElementById("viewAttachmentsInlineMenuitem")
          .setAttribute("checked", viewAttachmentInline);

  document.commandDispatcher.updateCommands("create-menu-view");
}

function InitViewLayoutStyleMenu(event) {
  var paneConfig = Services.prefs.getIntPref("mail.pane_config.dynamic");
  var layoutStyleMenuitem = event.target.childNodes[paneConfig];
  if (layoutStyleMenuitem)
    layoutStyleMenuitem.setAttribute("checked", "true");
}

function setSortByMenuItemCheckState(id, value) {
    var menuitem = document.getElementById(id);
    if (menuitem) {
      menuitem.setAttribute("checked", value);
    }
}

function InitViewSortByMenu() {
  var sortType = gDBView.sortType;

  setSortByMenuItemCheckState("sortByDateMenuitem",
                              sortType == Ci.nsMsgViewSortType.byDate);
  setSortByMenuItemCheckState("sortByReceivedMenuitem",
                              sortType == Ci.nsMsgViewSortType.byReceived);
  setSortByMenuItemCheckState("sortByFlagMenuitem",
                              sortType == Ci.nsMsgViewSortType.byFlagged);
  setSortByMenuItemCheckState("sortByOrderReceivedMenuitem",
                              sortType == Ci.nsMsgViewSortType.byId);
  setSortByMenuItemCheckState("sortByPriorityMenuitem",
                              sortType == Ci.nsMsgViewSortType.byPriority);
  setSortByMenuItemCheckState("sortBySizeMenuitem",
                              sortType == Ci.nsMsgViewSortType.bySize);
  setSortByMenuItemCheckState("sortByStatusMenuitem",
                              sortType == Ci.nsMsgViewSortType.byStatus);
  setSortByMenuItemCheckState("sortBySubjectMenuitem",
                              sortType == Ci.nsMsgViewSortType.bySubject);
  setSortByMenuItemCheckState("sortByUnreadMenuitem",
                              sortType == Ci.nsMsgViewSortType.byUnread);
  setSortByMenuItemCheckState("sortByTagsMenuitem",
                              sortType == Ci.nsMsgViewSortType.byTags);
  setSortByMenuItemCheckState("sortByJunkStatusMenuitem",
                              sortType == Ci.nsMsgViewSortType.byJunkStatus);
  setSortByMenuItemCheckState("sortByFromMenuitem",
                              sortType == Ci.nsMsgViewSortType.byAuthor);
  setSortByMenuItemCheckState("sortByRecipientMenuitem",
                              sortType == Ci.nsMsgViewSortType.byRecipient);
  setSortByMenuItemCheckState("sortByAttachmentsMenuitem",
                              sortType == Ci.nsMsgViewSortType.byAttachments);

  var sortOrder = gDBView.sortOrder;
  var sortTypeSupportsGrouping = (sortType == Ci.nsMsgViewSortType.byAuthor ||
      sortType == Ci.nsMsgViewSortType.byDate ||
      sortType == Ci.nsMsgViewSortType.byReceived ||
      sortType == Ci.nsMsgViewSortType.byPriority ||
      sortType == Ci.nsMsgViewSortType.bySubject ||
      sortType == Ci.nsMsgViewSortType.byTags ||
      sortType == Ci.nsMsgViewSortType.byRecipient ||
      sortType == Ci.nsMsgViewSortType.byFlagged ||
      sortType == Ci.nsMsgViewSortType.byAttachments);

  setSortByMenuItemCheckState("sortAscending",
                              sortOrder == Ci.nsMsgViewSortOrder.ascending);
  setSortByMenuItemCheckState("sortDescending",
                              sortOrder == Ci.nsMsgViewSortOrder.descending);

  var grouped = ((gDBView.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort) != 0);
  var threaded = ((gDBView.viewFlags & Ci.nsMsgViewFlagsType.kThreadedDisplay) != 0 && !grouped);
  var sortThreadedMenuItem = document.getElementById("sortThreaded");
  var sortUnthreadedMenuItem = document.getElementById("sortUnthreaded");

  sortThreadedMenuItem.setAttribute("checked", threaded);
  sortUnthreadedMenuItem.setAttribute("checked", !threaded && !grouped);

  var groupBySortOrderMenuItem = document.getElementById("groupBySort");

  groupBySortOrderMenuItem.setAttribute("disabled", !sortTypeSupportsGrouping);
  groupBySortOrderMenuItem.setAttribute("checked", grouped);
}

function InitViewMessagesMenu() {
  var viewFlags = gDBView ? gDBView.viewFlags : 0;
  var viewType = gDBView ? gDBView.viewType : 0;

  document.getElementById("viewAllMessagesMenuItem").setAttribute("checked",
    (viewFlags & Ci.nsMsgViewFlagsType.kUnreadOnly) == 0 &&
    (viewType == Ci.nsMsgViewType.eShowAllThreads));

  document.getElementById("viewUnreadMessagesMenuItem").setAttribute("checked",
    (viewFlags & Ci.nsMsgViewFlagsType.kUnreadOnly) != 0);

  document.getElementById("viewThreadsWithUnreadMenuItem").setAttribute("checked",
    viewType == Ci.nsMsgViewType.eShowThreadsWithUnread);

  document.getElementById("viewWatchedThreadsWithUnreadMenuItem").setAttribute("checked",
    viewType == Ci.nsMsgViewType.eShowWatchedThreadsWithUnread);

  document.getElementById("viewIgnoredThreadsMenuItem").setAttribute("checked",
    (viewFlags & Ci.nsMsgViewFlagsType.kShowIgnored) != 0);
}

function InitMessageMenu() {
  var selectedMsg = gFolderDisplay.selectedMessage;
  var isNews = gFolderDisplay.selectedMessageIsNews;
  var isFeed = gFolderDisplay.selectedMessageIsFeed;

  // We show Reply to Newsgroups only for news messages.
  document.getElementById("replyNewsgroupMainMenu").hidden = !isNews;

  // We show Reply to List only for list posts.
  document.getElementById("replyListMainMenu").hidden = isNews || !IsListPost();

  // For mail messages we say reply. For news we say ReplyToSender.
  document.getElementById("replyMainMenu").hidden = isNews;
  document.getElementById("replySenderMainMenu").hidden = !isNews;

  // We show Reply to Sender and Newsgroup only for news messages.
  document.getElementById("replySenderAndNewsgroupMainMenu").hidden = !isNews;

  // For mail messages we say reply all. For news we say ReplyToAllRecipients.
  document.getElementById("replyallMainMenu").hidden = isNews;
  document.getElementById("replyAllRecipientsMainMenu").hidden = !isNews;

  // We only show Ignore Thread and Watch Thread menu items for news.
  document.getElementById("threadItemsSeparator").hidden = !isNews;
  document.getElementById("killThread").hidden = !isNews;
  document.getElementById("killSubthread").hidden = !isNews;
  document.getElementById("watchThread").hidden = !isNews;
  document.getElementById("menu_cancel").hidden = !isNews;

  // Disable the Move and Copy menus if there are no messages selected.
  // Disable the Move menu if we can't delete messages from the folder.
  var msgFolder = GetLoadedMsgFolder();
  var enableMenuItem = !isNews && selectedMsg &&
                        msgFolder && msgFolder.canDeleteMessages;
  document.getElementById("moveMenu").disabled = !enableMenuItem;

  // Also disable copy when no folder is loaded (like for .eml files).
  var canCopy = selectedMsg && (!gMessageDisplay.isDummy ||
                                window.arguments[0].scheme == "file");
  document.getElementById("copyMenu").disabled = !canCopy;

  // Disable the Forward as/Tag menu items if no message is selected.
  document.getElementById("forwardAsMenu").disabled = !selectedMsg;
  document.getElementById("tagMenu").disabled = !selectedMsg;

  // Show "Edit Draft Message" menus only in a drafts folder;
  // otherwise hide them.
  showCommandInSpecialFolder("cmd_editDraftMsg", Ci.nsMsgFolderFlags.Drafts);
  // Show "New Message from Template" and "Edit Template" menus only in a
  // templates folder; otherwise hide them.
  showCommandInSpecialFolder("cmd_newMsgFromTemplate",
                             Ci.nsMsgFolderFlags.Templates);
  showCommandInSpecialFolder("cmd_editTemplateMsg",
                             Ci.nsMsgFolderFlags.Templates);

  // Initialize the Open Message menuitem
  var winType = document.documentElement.getAttribute("windowtype");
  if (winType == "mail:3pane")
    document.getElementById("openMessageWindowMenuitem").hidden = isFeed;

  // Initialize the Open Feed Message handler menu
  let index = FeedMessageHandler.onOpenPref;
  document.getElementById("menu_openFeedMessage")
          .childNodes[index].setAttribute("checked", true);

  let openRssMenu = document.getElementById("openFeedMessage");
  openRssMenu.hidden = !isFeed;
  if (winType != "mail:3pane")
    openRssMenu.hidden = true;

  // Disable the Mark menu when we're not in a folder.
  document.getElementById("markMenu").disabled = !msgFolder;

  document.commandDispatcher.updateCommands("create-menu-message");
}

/**
 * Show folder-specific menu items only for messages in special folders, e.g.
 * show 'cmd_editDraftMsg' in Drafts folder.
 * show 'cmd_newMsgFromTemplate' in Templates folder.
 *
 * aCommandId   the ID of a command to be shown in folders having aFolderFlag
 * aFolderFlag  the nsMsgFolderFlag that the folder must have to show the
 *              command
 */
function showCommandInSpecialFolder(aCommandId, aFolderFlag) {
  let msg = gFolderDisplay.selectedMessage;
  let folder = gFolderDisplay.displayedFolder;
  // Check msg.folder exists as messages opened from a file have none.
  let inSpecialFolder = (msg &&
                         msg.folder &&
                         msg.folder.isSpecialFolder(aFolderFlag, true)) ||
                        (folder && folder.getFlag(aFolderFlag));
  document.getElementById(aCommandId).setAttribute("hidden", !inSpecialFolder);
  return inSpecialFolder;
}

function InitViewHeadersMenu() {
  var headerchoice =
    Services.prefs.getIntPref("mail.show_headers",
                              Ci.nsMimeHeaderDisplayTypes.NormalHeaders);
  document
    .getElementById("cmd_viewAllHeader")
    .setAttribute("checked",
                  headerchoice == Ci.nsMimeHeaderDisplayTypes.AllHeaders);
  document
    .getElementById("cmd_viewNormalHeader")
    .setAttribute("checked",
                  headerchoice == Ci.nsMimeHeaderDisplayTypes.NormalHeaders);
  document.commandDispatcher.updateCommands("create-menu-mark");
}

function InitViewBodyMenu() {
  // Separate render prefs not implemented for feeds, bug 458606.  Show the
  // checked item for feeds as for the regular pref.
  //  let html_as = Services.prefs.getIntPref("rss.display.html_as");
  //  let prefer_plaintext = Services.prefs.getBoolPref("rss.display.prefer_plaintext");
  //  let disallow_classes = Services.prefs.getIntPref("rss.display.disallow_mime_handlers");

  let html_as = Services.prefs.getIntPref("mailnews.display.html_as");
  let prefer_plaintext = Services.prefs.getBoolPref("mailnews.display.prefer_plaintext");
  let disallow_classes = Services.prefs.getIntPref("mailnews.display.disallow_mime_handlers");
  let isFeed = gFolderDisplay.selectedMessageIsFeed;
  const defaultIDs = ["bodyAllowHTML",
                      "bodySanitized",
                      "bodyAsPlaintext",
                      "bodyAllParts"];
  const rssIDs = ["bodyFeedSummaryAllowHTML",
                  "bodyFeedSummarySanitized",
                  "bodyFeedSummaryAsPlaintext"];
  let menuIDs = isFeed ? rssIDs : defaultIDs;

  if (disallow_classes > 0)
    gDisallow_classes_no_html = disallow_classes;
  // else gDisallow_classes_no_html keeps its inital value (see top)

  let AllowHTML_menuitem = document.getElementById(menuIDs[0]);
  let Sanitized_menuitem = document.getElementById(menuIDs[1]);
  let AsPlaintext_menuitem = document.getElementById(menuIDs[2]);
  let AllBodyParts_menuitem;
  if (!isFeed) {
    AllBodyParts_menuitem = document.getElementById(menuIDs[3]);
    AllBodyParts_menuitem.hidden =
      !Services.prefs.getBoolPref("mailnews.display.show_all_body_parts_menu");
  }

  if (!prefer_plaintext && !html_as && !disallow_classes &&
      AllowHTML_menuitem)
    AllowHTML_menuitem.setAttribute("checked", true);
  else if (!prefer_plaintext && html_as == 3 && disallow_classes > 0 &&
      Sanitized_menuitem)
    Sanitized_menuitem.setAttribute("checked", true);
  else if (prefer_plaintext && html_as == 1 && disallow_classes > 0 &&
      AsPlaintext_menuitem)
    AsPlaintext_menuitem.setAttribute("checked", true);
  else if (!prefer_plaintext && html_as == 4 && !disallow_classes &&
      AllBodyParts_menuitem)
    AllBodyParts_menuitem.setAttribute("checked", true);
  // else (the user edited prefs/user.js) check none of the radio menu items

  if (isFeed) {
    AllowHTML_menuitem.hidden = !FeedMessageHandler.gShowSummary;
    Sanitized_menuitem.hidden = !FeedMessageHandler.gShowSummary;
    AsPlaintext_menuitem.hidden = !FeedMessageHandler.gShowSummary;
    document.getElementById("viewFeedSummarySeparator").hidden = !FeedMessageHandler.gShowSummary;
  }
}

function SetMenuItemLabel(menuItemId, customLabel) {
  var menuItem = document.getElementById(menuItemId);
  if (menuItem)
    menuItem.setAttribute("label", customLabel);
}

function RemoveAllMessageTags() {
  var selectedMessages = gFolderDisplay.selectedMessages;
  if (!selectedMessages.length)
    return;

  var messages = [];
  var tagArray = MailServices.tags.getAllTags();

  var allKeys = "";
  for (let j = 0; j < tagArray.length; ++j) {
    if (j)
      allKeys += " ";
    allKeys += tagArray[j].key;
  }

  var prevHdrFolder = null;
  // this crudely handles cross-folder virtual folders with selected messages
  // that spans folders, by coalescing consecutive messages in the selection
  // that happen to be in the same folder. nsMsgSearchDBView does this better,
  // but nsIMsgDBView doesn't handle commands with arguments, and untag takes a
  // key argument. Furthermore, we only delete legacy labels and known tags,
  // keeping other keywords like (non)junk intact.

  for (let i = 0; i < selectedMessages.length; ++i) {
    var msgHdr = selectedMessages[i];
    msgHdr.label = 0; // remove legacy label
    if (prevHdrFolder != msgHdr.folder) {
      if (prevHdrFolder)
        prevHdrFolder.removeKeywordsFromMessages(messages, allKeys);
      messages = [];
      prevHdrFolder = msgHdr.folder;
    }
    messages.push(msgHdr);
  }
  if (prevHdrFolder)
    prevHdrFolder.removeKeywordsFromMessages(messages, allKeys);
  OnTagsChange();
}

function InitNewMsgMenu(aPopup) {
  var identity = null;
  var folder = GetFirstSelectedMsgFolder();
  if (folder)
    identity = getIdentityForServer(folder.server);
  if (!identity) {
    let defaultAccount = MailServices.accounts.defaultAccount;
    if (defaultAccount)
      identity = defaultAccount.defaultIdentity;
  }

  // If the identity is not found, use the mail.html_compose pref to
  // determine the message compose type (HTML or PlainText).
  var composeHTML = identity ? identity.composeHtml
                             : Services.prefs.getBoolPref("mail.html_compose");
  const kIDs = {true: "button-newMsgHTML", false: "button-newMsgPlain"};
  document.getElementById(kIDs[composeHTML]).setAttribute("default", "true");
  document.getElementById(kIDs[!composeHTML]).removeAttribute("default");
}

function InitMessageReply(aPopup) {
  var isNews = gFolderDisplay.selectedMessageIsNews;
  // For mail messages we say reply. For news we say ReplyToSender.
  // We show Reply to Newsgroups only for news messages.
  aPopup.childNodes[0].hidden = isNews; // Reply
  aPopup.childNodes[1].hidden = isNews || !IsListPost(); // Reply to List
  aPopup.childNodes[2].hidden = !isNews; // Reply to Newsgroup
  aPopup.childNodes[3].hidden = !isNews; // Reply to Sender Only
}

function InitMessageForward(aPopup) {
  var forwardType = Services.prefs.getIntPref("mail.forward_message_mode");

  if (forwardType != kMsgForwardAsAttachment) {
    // forward inline is the first menuitem
    aPopup.firstChild.setAttribute("default", "true");
    aPopup.lastChild.removeAttribute("default");
  } else {
    // attachment is the last menuitem
    aPopup.lastChild.setAttribute("default", "true");
    aPopup.firstChild.removeAttribute("default");
  }
}

function ToggleMessageTagKey(index) {
  // toggle the tag state based upon that of the first selected message
  var msgHdr = gFolderDisplay.selectedMessage;
  if (!msgHdr)
    return;

  var tagArray = MailServices.tags.getAllTags();
  for (var i = 0; i < tagArray.length; ++i) {
    var key = tagArray[i].key;
    if (!--index) {
      // found the key, now toggle its state
      var curKeys = msgHdr.getStringProperty("keywords");
      if (msgHdr.label)
        curKeys += " $label" + msgHdr.label;
      var addKey  = !(" " + curKeys + " ").includes(" " + key + " ");
      ToggleMessageTag(key, addKey);
      return;
    }
  }
}

function ToggleMessageTagMenu(target) {
  var key    = target.getAttribute("value");
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
  for (let i = 0; i < selectedMessages.length; ++i) {
    var msgHdr = selectedMessages[i];
    if (msgHdr.label) {
      // Since we touch all these messages anyway, migrate the label now.
      // If we don't, the thread tree won't always show the correct tag state,
      // because resetting a label doesn't update the tree anymore...
      msgHdr.folder.addKeywordsToMessages([msgHdr], "$label" + msgHdr.label);
      msgHdr.label = 0; // remove legacy label
    }
    if (prevHdrFolder != msgHdr.folder) {
      if (prevHdrFolder)
        prevHdrFolder[toggler](messages, key);
      messages = [];
      prevHdrFolder = msgHdr.folder;
    }
    messages.push(msgHdr);
  }
  if (prevHdrFolder)
    prevHdrFolder[toggler](messages, key);
  OnTagsChange();
}

function SetMessageTagLabel(menuitem, index, name) {
  // if a <key> is defined for this tag, use its key as the accesskey
  // (the key for the tag at index n needs to have the id key_tag<n>)
  var shortcutkey = document.getElementById("key_tag" + index);
  var accesskey = shortcutkey ? shortcutkey.getAttribute("key") : "";
  if (accesskey)
    menuitem.setAttribute("accesskey", accesskey);
  var label = gMessengerBundle.getFormattedString("mailnews.tags.format",
                                                  [accesskey, name]);
  menuitem.setAttribute("label", label);
}

function InitMessageTags(menuPopup) {
  var tagArray = MailServices.tags.getAllTags();
  var tagCount = tagArray.length;

  // remove any existing non-static entries...
  var menuseparator = menuPopup.lastChild.previousSibling;
  for (var i = menuPopup.childNodes.length; i > 4; --i)
    menuseparator.previousSibling.remove();

  // hide double menuseparator
  menuseparator.previousSibling.hidden = !tagCount;

  // create label and accesskey for the static remove item
  var tagRemoveLabel = gMessengerBundle.getString("mailnews.tags.remove");
  SetMessageTagLabel(menuPopup.firstChild, 0, tagRemoveLabel);

  // now rebuild the list
  var msgHdr = gFolderDisplay.selectedMessage;
  var curKeys = msgHdr.getStringProperty("keywords");
  if (msgHdr.label)
    curKeys += " $label" + msgHdr.label;
  for (var i = 0; i < tagCount; ++i) {
    var taginfo = tagArray[i];
    var removeKey = (" " + curKeys + " ").includes(" " + taginfo.key + " ");
    if (taginfo.ordinal.includes("~AUTOTAG") && !removeKey)
      continue;

    // TODO we want to either remove or "check" the tags that already exist
    var newMenuItem = document.createElement("menuitem");
    SetMessageTagLabel(newMenuItem, i + 1, taginfo.tag);
    newMenuItem.setAttribute("value", taginfo.key);
    newMenuItem.setAttribute("type", "checkbox");
    newMenuItem.setAttribute("checked", removeKey);
    newMenuItem.setAttribute("oncommand", "ToggleMessageTagMenu(event.target);");
    var color = taginfo.color;
    if (color)
      newMenuItem.setAttribute("class", "lc-" + color.substr(1));
    menuPopup.insertBefore(newMenuItem, menuseparator);
  }
}

function InitBackToolbarMenu(menuPopup) {
  PopulateHistoryMenu(menuPopup, -1);
}

function InitForwardToolbarMenu(menuPopup) {
  PopulateHistoryMenu(menuPopup, 1);
}

function PopulateHistoryMenu(menuPopup, navOffset) {
  // remove existing entries
  while (menuPopup.hasChildNodes())
    menuPopup.lastChild.remove();

  let startPos = messenger.navigatePos;
  let historyArray = messenger.getNavigateHistory();
  let maxPos = historyArray.length / 2; // Array consists of pairs.
  if (GetLoadedMessage())
    startPos += navOffset;

  // starting from the current entry, march through history until we reach
  // the array border or our menuitem limit
  for (var i = startPos, itemCount = 0;
       (i >= 0) && (i < maxPos) && (itemCount < 25);
       i += navOffset, ++itemCount) {
    var menuText = "";
    let folder = MailUtils.getFolderForURI(historyArray[i * 2 + 1]);
    if (!IsCurrentLoadedFolder(folder))
      menuText += folder.prettyName + ": ";

    var msgHdr = messenger.msgHdrFromURI(historyArray[i * 2]);
    var subject = "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe)
      subject = "Re: ";
    if (msgHdr.mime2DecodedSubject)
       subject += msgHdr.mime2DecodedSubject;
    if (subject)
      menuText += subject + " - ";
    menuText += msgHdr.mime2DecodedAuthor;

    var newMenuItem = document.createElement("menuitem");
    newMenuItem.setAttribute("label", menuText);
    newMenuItem.setAttribute("value", i - startPos);
    newMenuItem.folder = folder;
    menuPopup.appendChild(newMenuItem);
  }
}

function NavigateToUri(target) {
  var historyIndex = target.getAttribute("value");
  var msgUri = messenger.getMsgUriAtNavigatePos(historyIndex);
  let msgHdrKey = messenger.msgHdrFromURI(msgUri).messageKey;
  messenger.navigatePos += Number(historyIndex);
  if (target.folder.URI == GetThreadPaneFolder().URI) {
    gDBView.selectMsgByKey(msgHdrKey);
  } else {
    gStartMsgKey = msgHdrKey;
    SelectMsgFolder(target.folder);
  }
}

function InitMessageMark() {
  document.getElementById("cmd_markAsFlagged")
          .setAttribute("checked", SelectedMessagesAreFlagged());

  document.commandDispatcher.updateCommands("create-menu-mark");
}

function UpdateJunkToolbarButton() {
  var junkButtonDeck = document.getElementById("junk-deck");
  // Wallpaper over Bug 491676 by using the attribute instead of the property.
  junkButtonDeck.setAttribute("selectedIndex", SelectedMessagesAreJunk() ? 1 : 0);
}

function UpdateDeleteToolbarButton(aFolderPaneHasFocus) {
  var deleteButtonDeck = document.getElementById("delete-deck");
  var selectedIndex = 0;

  // Never show "Undelete" in the 3-pane for folders, when delete would
  // apply to the selected folder.
  if (!aFolderPaneHasFocus && SelectedMessagesAreDeleted())
    selectedIndex = 1;

  // Wallpaper over Bug 491676 by using the attribute instead of the property.
  deleteButtonDeck.setAttribute("selectedIndex", selectedIndex);
}

function UpdateDeleteCommand() {
  var value = "value";
  if (SelectedMessagesAreDeleted())
    value += "IMAPDeleted";
  if (GetNumSelectedMessages() < 2)
    value += "Message";
  else
    value += "Messages";
  goSetMenuValue("cmd_delete", value);
  goSetAccessKey("cmd_delete", value + "AccessKey");
}

function SelectedMessagesAreDeleted() {
  var firstSelectedMessage = gFolderDisplay.selectedMessage;
  return firstSelectedMessage &&
         (firstSelectedMessage.flags &
          Ci.nsMsgMessageFlags.IMAPDeleted);
}

function SelectedMessagesAreJunk() {
  var firstSelectedMessage = gFolderDisplay.selectedMessage;
  if (!firstSelectedMessage)
    return false;

  var junkScore = firstSelectedMessage.getStringProperty("junkscore");
  return (junkScore != "") && (junkScore != "0");
}

function SelectedMessagesAreRead() {
  let messages = gFolderDisplay.selectedMessages;
  if (messages.length == 0)
    return undefined;
  if (messages.every(function(msg) { return msg.isRead; }))
    return true;
  if (messages.every(function(msg) { return !msg.isRead; }))
    return false;
  return undefined;
}

function SelectedMessagesAreFlagged() {
  var firstSelectedMessage = gFolderDisplay.selectedMessage;
  return firstSelectedMessage && firstSelectedMessage.isFlagged;
}

function getMsgToolbarMenu_init() {
    document.commandDispatcher.updateCommands("create-menu-getMsgToolbar");
}

function GetFirstSelectedMsgFolder() {
  var selectedFolders = GetSelectedMsgFolders();
  return (selectedFolders.length > 0) ? selectedFolders[0] : null;
}

function GetInboxFolder(server) {
  try {
    var rootMsgFolder = server.rootMsgFolder;

    // Now find Inbox.
    return rootMsgFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  } catch (ex) {
    dump(ex + "\n");
  }
  return null;
}

function GetMessagesForInboxOnServer(server) {
  var inboxFolder = GetInboxFolder(server);

  // If the server doesn't support an inbox it could be an RSS server or
  // some other server type, just use the root folder and the server
  // implementation can figure out what to do.
  if (!inboxFolder)
    inboxFolder = server.rootFolder;

  GetNewMsgs(server, inboxFolder);
}

function MsgGetMessage() {
  // if offline, prompt for getting messages
  if (DoGetNewMailWhenOffline())
    GetFolderMessages();
}

function MsgGetMessagesForAllServers(defaultServer) {
  MailTasksGetMessagesForAllServers(true, msgWindow, defaultServer);
}

/**
  * Get messages for all those accounts which have the capability
  * of getting messages and have session password available i.e.,
  * curretnly logged in accounts.
  * if offline, prompt for getting messages.
  */
function MsgGetMessagesForAllAuthenticatedAccounts() {
  if (DoGetNewMailWhenOffline())
    MailTasksGetMessagesForAllServers(false, msgWindow, null);
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

  if (DoGetNewMailWhenOffline())
    GetMessagesForInboxOnServer(aFolder.server);
}

// if offline, prompt for getNextNMessages
function MsgGetNextNMessages() {
  if (DoGetNewMailWhenOffline()) {
    var folder = GetFirstSelectedMsgFolder();
    if (folder)
      GetNextNMessages(folder);
  }
}

function MsgDeleteMessage(aReallyDelete) {
  // If the user deletes a message before its mark as read timer goes off,
  // we should mark it as read (unless the user changed the pref). This
  // ensures that we clear the biff indicator from the system tray when
  // the user deletes the new message.
  if (Services.prefs.getBoolPref("mailnews.ui.deleteMarksRead"))
    MarkSelectedMessagesRead(true);
  SetNextMessageAfterDelete();

  // determine if we're using the IMAP delete model
  var server = GetFirstSelectedMsgFolder().server;
  const kIMAPDelete = Ci.nsMsgImapDeleteModels.IMAPDelete;
  var imapDeleteModelUsed = server instanceof Ci.nsIImapIncomingServer &&
                            server.deleteModel == kIMAPDelete;

  // execute deleteNoTrash only if IMAP delete model is not used
  if (aReallyDelete && !imapDeleteModelUsed)
    gDBView.doCommand(nsMsgViewCommandType.deleteNoTrash);
  else
    gDBView.doCommand(nsMsgViewCommandType.deleteMsg);
}

/**
 * Copies the selected messages to the destination folder
 * @param aDestFolder  the destination folder
 */
function MsgCopyMessage(aDestFolder) {
  if (gMessageDisplay.isDummy) {
    let file = window.arguments[0].QueryInterface(Ci.nsIFileURL).file;
    MailServices.copy.copyFileMessage(file, aDestFolder, null, false,
                                      Ci.nsMsgMessageFlags.Read,
                                      "", null, msgWindow);
  } else {
    gDBView.doCommandWithFolder(nsMsgViewCommandType.copyMessages, aDestFolder);
  }
}

/**
 * Moves the selected messages to the destination folder
 * @param aDestFolder  the destination folder
 */
function MsgMoveMessage(aDestFolder) {
  SetNextMessageAfterDelete();
  gDBView.doCommandWithFolder(nsMsgViewCommandType.moveMessages, aDestFolder);
}

/**
 * Calls the ComposeMessage function with the desired type and proper default
 * based on the event that fired it.
 *
 * @param aCompType  The nsIMsgCompType to pass to the function.
 * @param aEvent (optional) The event that triggered the call.
 * @param aFormat (optional) Override the message format.
 */
function ComposeMsgByType(aCompType, aEvent, aFormat) {
  var format = aFormat || ((aEvent && aEvent.shiftKey) ? msgComposeFormat.OppositeOfDefault : msgComposeFormat.Default);

  ComposeMessage(aCompType,
                 format,
                 GetFirstSelectedMsgFolder(),
                 gFolderDisplay ? gFolderDisplay.selectedMessageUris : null);
}

function MsgNewMessage(aEvent) {
  var mode = aEvent && aEvent.target.getAttribute("mode");
  ComposeMsgByType(msgComposeType.New, aEvent, mode && msgComposeFormat[mode]);
}

function MsgReplyMessage(aEvent) {
  if (gFolderDisplay.selectedMessageIsNews)
    MsgReplyGroup(aEvent);
  else if (!gFolderDisplay.selectedMessageIsFeed)
    MsgReplySender(aEvent);
}

function MsgReplyList(aEvent) {
  ComposeMsgByType(msgComposeType.ReplyToList, aEvent);
}

function MsgReplyGroup(aEvent) {
  ComposeMsgByType(msgComposeType.ReplyToGroup, aEvent);
}

function MsgReplySender(aEvent) {
  ComposeMsgByType(msgComposeType.ReplyToSender, aEvent);
}

function MsgReplyToAllMessage(aEvent) {
  var loadedFolder = GetLoadedMsgFolder();
  var server = loadedFolder.server;

  if (server && server.type == "nntp")
    MsgReplyToSenderAndGroup(aEvent);
  else
    MsgReplyToAllRecipients(aEvent);
}

function MsgReplyToAllRecipients(aEvent) {
  ComposeMsgByType(msgComposeType.ReplyAll, aEvent);
}

function MsgReplyToSenderAndGroup(aEvent) {
  ComposeMsgByType(msgComposeType.ReplyToSenderAndGroup, aEvent);
}


// Message Archive function

function BatchMessageMover() {
  this._batches = {};
  this._currentKey = null;
  this._dstFolderParent = null;
  this._dstFolderName = null;
}

BatchMessageMover.prototype =
{
  archiveMessages(aMsgHdrs) {
    if (!aMsgHdrs.length)
      return;

    // We need to get the index of the message to select after archiving
    // completes but reset the global variable to prevent the DBview from
    // updating the selection; we'll do it manually at the end of
    // processNextBatch.
    SetNextMessageAfterDelete();
    this.messageToSelectAfterWereDone = gNextMessageViewIndexAfterDelete;
    gNextMessageViewIndexAfterDelete = -2;

    for (let i = 0; i < aMsgHdrs.length; ++i) {
      let msgHdr = aMsgHdrs[i];
      let server = msgHdr.folder.server;
      let msgDate = new Date(msgHdr.date / 1000); // convert date to JS date object
      let msgYear = msgDate.getFullYear().toString();
      let monthFolderName = msgYear + "-" + (msgDate.getMonth() + 1).toString().padStart(2, "0");

      let archiveFolderUri;
      let archiveGranularity;
      let archiveKeepFolderStructure;
      if (server.type == "rss") {
        // RSS servers don't have an identity so we special case the archives URI.
        archiveFolderUri = server.serverURI + "/Archives";
        archiveGranularity =
          Services.prefs.getIntPref("mail.identity.default.archive_granularity");
        archiveKeepFolderStructure =
          Services.prefs.getBoolPref("mail.identity.default.archive_keep_folder_structure");
      } else {
        let identity = GetIdentityForHeader(msgHdr,
          Ci.nsIMsgCompType.ReplyAll);
        archiveFolderUri = identity.archiveFolder;
        archiveGranularity = identity.archiveGranularity;
        archiveKeepFolderStructure = identity.archiveKeepFolderStructure;
      }
      let archiveFolder = MailUtils.getFolderForURI(archiveFolderUri, false);

      let copyBatchKey = msgHdr.folder.URI + "\0" + monthFolderName;
      if (!(copyBatchKey in this._batches))
        this._batches[copyBatchKey] = [msgHdr.folder,
                                       archiveFolderUri,
                                       archiveGranularity,
                                       archiveKeepFolderStructure,
                                       msgYear,
                                       monthFolderName];
      this._batches[copyBatchKey].push(msgHdr);
    }

    MailServices.mfn.addListener(this, MailServices.mfn.folderAdded);

    // Now we launch the code iterating over all message copies, one in turn.
    this.processNextBatch();
  },

  processNextBatch() {
    for (let key in this._batches) {
      this._currentBatch = this._batches[key];
      delete this._batches[key];
      return this.filterBatch();
    }

    // all done
    MailServices.mfn.removeListener(this);

    // We're just going to select the message now.
    let treeView = gDBView.QueryInterface(Ci.nsITreeView);
    treeView.selection.select(this.messageToSelectAfterWereDone);
    treeView.selectionChanged();

  },

  filterBatch() {
    let batch = this._currentBatch;
    // Apply filters to this batch.
    let msgs = batch.slice(6);
    let srcFolder = batch[0];
    MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.Archive,
      msgs, srcFolder, msgWindow, this);
     // continues with onStopOperation
  },

  onStopOperation(aResult) {
    if (!Components.isSuccessCode(aResult)) {
      Cu.reportError("Archive filter failed: " + aResult);
      // We don't want to effectively disable archiving because a filter
      // failed, so we'll continue after reporting the error.
    }
    // Now do the default archive processing
    this.continueBatch();
  },

  // continue processing of default archive operations
  continueBatch() {
    let batch = this._currentBatch;
    let [srcFolder, archiveFolderUri, granularity, keepFolderStructure, msgYear, msgMonth] = batch;
    let msgs = batch.slice(6);

    let moveArray = [];
    // Don't move any items that the filter moves or deleted
    for (let item of msgs) {
      if (srcFolder.msgDatabase.ContainsKey(item.messageKey) &&
          !(srcFolder.getProcessingFlags(item.messageKey) &
            Ci.nsMsgProcessingFlags.FilterToMove)) {
        moveArray.push(item);
      }
    }

    if (moveArray.length == 0)
      return this.processNextBatch(); // continue processing

    let archiveFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
    let dstFolder = archiveFolder;
    // For folders on some servers (e.g. IMAP), we need to create the
    // sub-folders asynchronously, so we chain the urls using the listener
    // called back from createStorageIfMissing. For local,
    // createStorageIfMissing is synchronous.
    let isAsync = archiveFolder.server.protocolInfo.foldersCreatedAsync;
    if (!archiveFolder.parent) {
      archiveFolder.setFlag(Ci.nsMsgFolderFlags.Archive);
      archiveFolder.createStorageIfMissing(this);
      if (isAsync)
        return; // continues with OnStopRunningUrl
    }
    if (!archiveFolder.canCreateSubfolders)
      granularity = Ci.nsIMsgIdentity.singleArchiveFolder;
    if (granularity >= Ci.nsIMsgIdentity.perYearArchiveFolders) {
      archiveFolderUri += "/" + msgYear;
      dstFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
      if (!dstFolder.parent) {
        dstFolder.createStorageIfMissing(this);
        if (isAsync)
          return; // continues with OnStopRunningUrl
      }
    }
    if (granularity >= Ci.nsIMsgIdentity.perMonthArchiveFolders) {
      archiveFolderUri += "/" + msgMonth;
      dstFolder = MailUtils.getFolderForURI(archiveFolderUri, false);
      if (!dstFolder.parent) {
        dstFolder.createStorageIfMissing(this);
        if (isAsync)
          return; // continues with OnStopRunningUrl
      }
    }

    // Create the folder structure in Archives.
    // For imap folders, we need to create the sub-folders asynchronously,
    // so we chain the actions using the listener called back from
    // createSubfolder. For local, createSubfolder is synchronous.
    if (archiveFolder.canCreateSubfolders && keepFolderStructure) {
      // Collect in-order list of folders of source folder structure,
      // excluding top-level INBOX folder
      let folderNames = [];
      let rootFolder = srcFolder.server.rootFolder;
      let inboxFolder = GetInboxFolder(srcFolder.server);
      let folder = srcFolder;
      while (folder != rootFolder && folder != inboxFolder) {
        folderNames.unshift(folder.name);
        folder = folder.parent;
      }
      // Determine Archive folder structure.
      for (let i = 0; i < folderNames.length; ++i) {
        let folderName = folderNames[i];
        if (!dstFolder.containsChildNamed(folderName)) {
          // Create Archive sub-folder (IMAP: async).
          if (isAsync) {
            this._dstFolderParent = dstFolder;
            this._dstFolderName = folderName;
          }
          dstFolder.createSubfolder(folderName, msgWindow);
          if (isAsync)
            return; // continues with folderAdded
        }
        dstFolder = dstFolder.getChildNamed(folderName);
      }
    }

    if (dstFolder != srcFolder) {
      // Make sure the target folder is visible in the folder tree.
      EnsureFolderIndex(gFolderTreeView, dstFolder);

      let isNews = srcFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;

      // If the source folder doesn't support deleting messages, we
      // make archive a copy, not a move.
      MailServices.copy.copyMessages(srcFolder, moveArray, dstFolder,
                                     srcFolder.canDeleteMessages && !isNews,
                                     this, msgWindow, true);
      return; // continues with OnStopCopy
    }
    return this.processNextBatch();
  },


  // This also implements nsIUrlListener, but we only care about the
  // OnStopRunningUrl (createStorageIfMissing callback).
  OnStartRunningUrl(aUrl) {
  },
  OnStopRunningUrl(aUrl, aExitCode) {
    // This will always be a create folder url, afaik.
    if (Components.isSuccessCode(aExitCode))
      this.continueBatch();
    else {
      Cu.reportError("Archive failed to create folder: " + aExitCode);
      this._batches = null;
      this.processNextBatch(); // for cleanup and exit
    }
  },

  // This also implements nsIMsgCopyServiceListener, but we only care
  // about the OnStopCopy (copyMessages callback).
  OnStartCopy() {
  },
  OnProgress(aProgress, aProgressMax) {
  },
  SetMessageKey(aKey) {
  },
  GetMessageId() {
  },
  OnStopCopy(aStatus) {
    if (Components.isSuccessCode(aStatus)) {
      return this.processNextBatch();
    }

      Cu.reportError("Archive failed to copy: " + aStatus);
      this._batches = null;
      this.processNextBatch(); // for cleanup and exit

  },

  // This also implements nsIMsgFolderListener, but we only care about the
  // folderAdded (createSubfolder callback).
  folderAdded(aFolder) {
    // Check that this is the folder we're interested in.
    if (aFolder.parent == this._dstFolderParent &&
        aFolder.name == this._dstFolderName) {
      this._dstFolderParent = null;
      this._dstFolderName = null;
      this.continueBatch();
    }
  },

  QueryInterface(aIID) {
    if (aIID.equals(Ci.nsIUrlListener) ||
        aIID.equals(Ci.nsIMsgCopyServiceListener) ||
        aIID.equals(Ci.nsIMsgFolderListener) ||
        aIID.equals(Ci.nsIMsgOperationListener) ||
        aIID.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  }
}

function MsgArchiveSelectedMessages(aEvent) {
  let batchMover = new BatchMessageMover();
  batchMover.archiveMessages(gFolderDisplay.selectedMessages);
}


function MsgForwardMessage(event) {
  var forwardType = Services.prefs.getIntPref("mail.forward_message_mode");

  // mail.forward_message_mode could be 1, if the user migrated from 4.x
  // 1 (forward as quoted) is obsolete, so we treat is as forward inline
  // since that is more like forward as quoted then forward as attachment
  if (forwardType == kMsgForwardAsAttachment)
    MsgForwardAsAttachment(event);
  else
    MsgForwardAsInline(event);
}

function MsgForwardAsAttachment(event) {
  ComposeMsgByType(msgComposeType.ForwardAsAttachment, event);
}

function MsgForwardAsInline(event) {
  ComposeMsgByType(msgComposeType.ForwardInline, event);
}

function MsgEditMessageAsNew(aEvent) {
  ComposeMsgByType(msgComposeType.EditAsNew, aEvent);
}

function MsgEditDraftMessage(aEvent) {
  ComposeMsgByType(msgComposeType.Draft, aEvent);
}

function MsgNewMessageFromTemplate(aEvent) {
  ComposeMsgByType(msgComposeType.Template, aEvent);
}

function MsgEditTemplateMessage(aEvent) {
  ComposeMsgByType(msgComposeType.EditTemplate, aEvent);
}

function MsgComposeDraftMessage() {
  ComposeMsgByType(msgComposeType.Draft, null, msgComposeFormat.Default);
}

function MsgCreateFilter() {
  // retrieve Sender direct from selected message's headers
  var msgHdr = gFolderDisplay.selectedMessage;
  var emailAddress =
    MailServices.headerParser.extractHeaderAddressMailboxes(msgHdr.author);
  var accountKey = msgHdr.accountKey;
  var folder;
  if (accountKey.length > 0) {
    var account = accountManager.getAccount(accountKey);
    if (account) {
      server = account.incomingServer;
      if (server)
        folder = server.rootFolder;
    }
  }
  if (!folder)
    folder = GetFirstSelectedMsgFolder();

    if (emailAddress)
     top.MsgFilters(emailAddress, folder);
}

function MsgSubscribe(folder) {
  var preselectedFolder = folder || GetFirstSelectedMsgFolder();

  if (preselectedFolder && preselectedFolder.server.type == "rss")
    openSubscriptionsDialog(preselectedFolder); // open feed subscription dialog
  else
    Subscribe(preselectedFolder); // open imap/nntp subscription dialog
}

/**
 * Show a confirmation dialog - check if the user really want to unsubscribe
 * from the given newsgroup/s.
 * @folders an array of newsgroup folders to unsubscribe from
 * @return true if the user said it's ok to unsubscribe
 */
function ConfirmUnsubscribe(folders) {
  if (!gMessengerBundle)
      gMessengerBundle = document.getElementById("bundle_messenger");

  let titleMsg = gMessengerBundle.getString("confirmUnsubscribeTitle");
  let dialogMsg = (folders.length == 1) ?
    gMessengerBundle.getFormattedString("confirmUnsubscribeText",
                                        [folders[0].name], 1) :
    gMessengerBundle.getString("confirmUnsubscribeManyText");

  return Services.prompt.confirm(window, titleMsg, dialogMsg);
}

/**
 * Unsubscribe from selected or passed in newsgroup/s.
 * @param newsgroups (optional param) the newsgroup folders to unsubscribe from
 */
function MsgUnsubscribe(newsgroups) {
  let folders = newsgroups || GetSelectedMsgFolders();
  if (!ConfirmUnsubscribe(folders))
    return;

  for (let folder of folders) {
    let subscribableServer =
      folder.server.QueryInterface(Ci.nsISubscribableServer);
    subscribableServer.unsubscribe(folder.name);
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
  SaveAsTemplate(gFolderDisplay.selectedMessageUris);
}

function MsgOpenFromFile() {
  var fp = Cc["@mozilla.org/filepicker;1"]
             .createInstance(Ci.nsIFilePicker);

  var filterLabel = gMessengerBundle.getString("EMLFiles");
  var windowTitle = gMessengerBundle.getString("OpenEMLFiles");

  fp.init(window, windowTitle, Ci.nsIFilePicker.modeOpen);
  fp.appendFilter(filterLabel, "*.eml; *.msg");

  // Default or last filter is "All Files".
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    let uri = fp.fileURL.QueryInterface(Ci.nsIURL);
    uri.query = "type=application/x-message-display";

    window.openDialog("chrome://messenger/content/messageWindow.xul", "_blank",
                      "all,chrome,dialog=no,status,toolbar", uri);
  });
}

function MsgOpenNewWindowForFolder(folderURI, msgKeyToSelect) {
  let mailWindowService = Cc["@mozilla.org/messenger/windowservice;1"]
                            .getService(Ci.nsIMessengerWindowService);
  if (!mailWindowService)
    return;

  if (folderURI) {
    mailWindowService.openMessengerWindowWithUri("mail:3pane", folderURI,
                                                 msgKeyToSelect);
    return;
  }

  // If there is a right-click happening, GetSelectedMsgFolders()
  // will tell us about it (while the selection's currentIndex would reflect
  // the node that was selected/displayed before the right-click.)
  for (let folder of GetSelectedMsgFolders()) {
    mailWindowService.openMessengerWindowWithUri("mail:3pane", folder.URI,
                                                 msgKeyToSelect);
  }
}

function MsgOpenSelectedMessages() {
  // Toggle message body (feed summary) and content-base url in message pane or
  // load in browser, per pref, otherwise open summary or web page in new window
  // or tab, per that pref.
  if (gFolderDisplay.selectedMessageIsFeed) {
    let msgHdr = gFolderDisplay.selectedMessage;
    if (document.documentElement.getAttribute("windowtype") == "mail:3pane" &&
        FeedMessageHandler.onOpenPref == FeedMessageHandler.kOpenToggleInMessagePane) {
      let showSummary = FeedMessageHandler.shouldShowSummary(msgHdr, true);
      FeedMessageHandler.setContent(msgHdr, showSummary);
      FeedMessageHandler.onSelectPref =
        showSummary ? FeedMessageHandler.kSelectOverrideSummary :
                      FeedMessageHandler.kSelectOverrideWebPage;
      return;
    }
    if (FeedMessageHandler.onOpenPref == FeedMessageHandler.kOpenLoadInBrowser) {
      setTimeout(FeedMessageHandler.loadWebPage, 20, msgHdr, {browser: true});
      return;
    }
  }

  var dbView = GetDBView();
  var indices = GetSelectedIndices(dbView);
  var numMessages = indices.length;

  // This is a radio type button pref, currently with only 2 buttons.
  // We need to keep the pref type as 'bool' for backwards compatibility
  // with 4.x migrated prefs.  For future radio button(s), please use another
  // pref (either 'bool' or 'int' type) to describe it.
  //
  // mailnews.reuse_message_window values:
  //    false: open new standalone message window for each message
  //    true : reuse existing standalone message window for each message
  if (Services.prefs.getBoolPref("mailnews.reuse_message_window") &&
      numMessages == 1 &&
      MsgOpenSelectedMessageInExistingWindow())
    return;

  var openWindowWarning = Services.prefs.getIntPref("mailnews.open_window_warning");
  if ((openWindowWarning > 1) && (numMessages >= openWindowWarning)) {
    InitPrompts();
    if (!gMessengerBundle)
        gMessengerBundle = document.getElementById("bundle_messenger");
    var title = gMessengerBundle.getString("openWindowWarningTitle");
    var text = PluralForm.get(numMessages,
      gMessengerBundle.getString("openWindowWarningConfirmation"))
                         .replace("#1", numMessages);
    if (!Services.prompt.confirm(window, title, text))
      return;
  }

  for (var i = 0; i < numMessages; i++) {
    MsgOpenNewWindowForMessage(dbView.getURIForViewIndex(indices[i]), dbView.getFolderForViewIndex(indices[i]).URI);
  }
}

function MsgOpenSelectedMessageInExistingWindow() {
  var windowID = Services.wm.getMostRecentWindow("mail:messageWindow");
  if (!windowID)
    return false;

  try {
      var messageURI = gDBView.URIForFirstSelectedMessage;
      var msgHdr = gDBView.hdrForFirstSelectedMessage;

      // Reset the window's message uri and folder uri vars, and
      // update the command handlers to what's going to be used.
      // This has to be done before the call to CreateView().
      windowID.gCurrentMessageUri = messageURI;
      windowID.gCurrentFolderUri = msgHdr.folder.URI;
      windowID.UpdateMailToolbar("MsgOpenExistingWindowForMessage");

      // even if the folder uri's match, we can't use the existing view
      // (msgHdr.folder.URI == windowID.gCurrentFolderUri)
      // the reason is quick search and mail views.
      // see bug #187673
      //
      // for the sake of simplicity,
      // let's always call CreateView(gDBView)
      // which will clone gDBView
      windowID.CreateView(gDBView);
      windowID.OnLoadMessageWindowDelayed(false);

      // bring existing window to front
      windowID.focus();
      return true;
  } catch (ex) {
      dump("reusing existing standalone message window failed: " + ex + "\n");
  }
  return false;
}

function MsgOpenSearch(aSearchStr, aEvent) {
  // If you change /suite/navigator/navigator.js->BrowserSearch::loadSearch()
  // make sure you make corresponding changes here.
  var submission = Services.search.defaultEngine.getSubmission(aSearchStr);
  if (!submission)
    return;

  var newTabPref = Services.prefs.getBoolPref("browser.search.opentabforcontextsearch");
  var where = newTabPref ? aEvent && aEvent.shiftKey ? "tabshifted" : "tab" : "window";
  openUILinkIn(submission.uri.spec, where, null, submission.postData);
}

function MsgOpenNewWindowForMessage(messageUri, folderUri) {
  if (!messageUri)
    messageUri = gFolderDisplay.selectedMessageUri;

  if (!folderUri)
      // Use GetSelectedMsgFolders() to find out which message to open
      // instead of gDBView.getURIForViewIndex(currentIndex).  This is
      // required because on a right-click, the currentIndex value will be
      // different from the actual row that is highlighted.
      // GetSelectedMsgFolders() will return the message that is
      // highlighted.
      folderUri = GetSelectedMsgFolders()[0].URI;

  // be sure to pass in the current view....
  if (messageUri && folderUri) {
      window.openDialog( "chrome://messenger/content/messageWindow.xul", "_blank", "all,chrome,dialog=no,status,toolbar", messageUri, folderUri, gDBView );
  }
}

function CloseMailWindow() {
  window.close();
}

function MsgJunk() {
  MsgJunkMailInfo(true);
  JunkSelectedMessages(!SelectedMessagesAreJunk());
}

/**
 * Checks if the selected messages can be marked as read or unread
 *
 * @param read true if trying to mark messages as read, false otherwise
 * @return true if the chosen operation can be performed
 */
function CanMarkMsgAsRead(read) {
  return SelectedMessagesAreRead() != read;
}

/**
 * Marks the selected messages as read or unread
 *
 * @param read true if trying to mark messages as read, false if marking unread,
 *        undefined if toggling the read status
 */
function MsgMarkMsgAsRead(read) {
  if (read == undefined)
    read = !SelectedMessagesAreRead();
  MarkSelectedMessagesRead(read);
}

function MsgMarkAsFlagged() {
  MarkSelectedMessagesFlagged(!SelectedMessagesAreFlagged());
}

function MsgMarkReadByDate() {
  window.openDialog("chrome://messenger/content/markByDate.xul", "",
                    "chrome,modal,titlebar,centerscreen",
                    GetLoadedMsgFolder());
}

function MsgMarkAllRead() {
  let folders = GetSelectedMsgFolders();
  for (let folder of folders)
    folder.markAllMessagesRead(msgWindow);
}

function MsgDownloadFlagged() {
  gDBView.doCommand(nsMsgViewCommandType.downloadFlaggedForOffline);
}

function MsgDownloadSelected() {
  gDBView.doCommand(nsMsgViewCommandType.downloadSelectedForOffline);
}

function MsgMarkThreadAsRead() {
  ClearPendingReadTimer();
  gDBView.doCommand(nsMsgViewCommandType.markThreadRead);
}

function MsgViewPageSource() {
    ViewPageSource(gFolderDisplay.selectedMessageUris);
}

var gFindInstData;
function getFindInstData() {
  if (!gFindInstData) {
    gFindInstData = new nsFindInstData();
    gFindInstData.browser = getMessageBrowser();
    gFindInstData.rootSearchWindow = window.top.content;
    gFindInstData.currentSearchWindow = window.top.content;
  }
  return gFindInstData;
}

function MsgFind() {
  findInPage(getFindInstData());
}

function MsgFindAgain(reverse) {
  findAgainInPage(getFindInstData(), reverse);
}

function MsgCanFindAgain() {
  return canFindAgainInPage();
}

/**
 * Go through each selected server and mark all its folders read.
 */
function MsgMarkAllFoldersRead() {
  if (!Services.prompt.confirm(window,
                               gMessengerBundle.getString("confirmMarkAllFoldersReadTitle"),
                               gMessengerBundle.getString("confirmMarkAllFoldersReadMessage"))) {
    return;
  }

  const selectedFolders = GetSelectedMsgFolders();
  if (selectedFolders) {
    const selectedServers = selectedFolders.filter(folder => folder.isServer);

    selectedServers.forEach(function(server) {
      for (let folder of server.rootFolder.descendants) {
        folder.markAllMessagesRead(msgWindow);
      }
    });
  }
}

function MsgFilters(emailAddress, folder) {
  if (!folder)
    folder = GetFirstSelectedMsgFolder();
  var args;
  if (emailAddress) {
    // Prefill the filterEditor with the emailAddress.
    args = {filterList: folder.getEditableFilterList(msgWindow), filterName: emailAddress};
    window.openDialog("chrome://messenger/content/FilterEditor.xul", "",
                      "chrome, modal, resizable,centerscreen,dialog", args);

    // If the user hits ok in the filterEditor dialog we set args.refresh=true
    // there and we check this here in args to show filterList dialog.
    // We also received the filter created via args.newFilter.
    if ("refresh" in args && args.refresh) {
       args = { refresh: true, folder, filter: args.newFilter };
       MsgFilterList(args);
    }
  } else // just launch filterList dialog
  {
    args = { refresh: false, folder };
    MsgFilterList(args);
  }
}

function MsgApplyFilters() {
  var preselectedFolder = GetFirstSelectedMsgFolder();

  var curFilterList = preselectedFolder.getFilterList(msgWindow);
  // create a new filter list and copy over the enabled filters to it.
  // We do this instead of having the filter after the fact code ignore
  // disabled filters because the Filter Dialog filter after the fact
  // code would have to clone filters to allow disabled filters to run,
  // and we don't support cloning filters currently.
  var tempFilterList =
    MailServices.filters.getTempFilterList(preselectedFolder);
  var numFilters = curFilterList.filterCount;
  // make sure the temp filter list uses the same log stream
  tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
  tempFilterList.logStream = curFilterList.logStream;
  var newFilterIndex = 0;
  for (var i = 0; i < numFilters; i++) {
    var curFilter = curFilterList.getFilterAt(i);
    // only add enabled, UI visibile filters that are in the manual context
    if (curFilter.enabled && !curFilter.temporary &&
        (curFilter.filterType & Ci.nsMsgFilterType.Manual)) {
      tempFilterList.insertFilterAt(newFilterIndex, curFilter);
      newFilterIndex++;
    }
  }
  MailServices.filters.applyFiltersToFolders(tempFilterList,
                                             [preselectedFolder],
                                             msgWindow);
}

function MsgApplyFiltersToSelection() {
  var folder = gDBView.msgFolder;
  var indices = GetSelectedIndices(gDBView);
  if (indices && indices.length) {
    var selectedMsgs = [];
    for (var i = 0; i < indices.length; i++) {
      try {
        // Getting the URI will tell us if the item is real or a dummy header
        var uri = gDBView.getURIForViewIndex(indices[i]);
        if (uri) {
          var msgHdr = folder.GetMessageHeader(gDBView.getKeyAt(indices[i]));
          if (msgHdr)
            selectedMsgs.push(msgHdr);
        }
      } catch (ex) {}
    }

    MailServices.filters.applyFilters(Ci.nsMsgFilterType.Manual, selectedMsgs,
                                      folder, msgWindow);
  }
}

function ChangeMailLayout(newLayout) {
  Services.prefs.setIntPref("mail.pane_config.dynamic", newLayout);
}

function MsgViewAllHeaders() {
  Services.prefs.setIntPref("mail.show_headers",
                            Ci.nsMimeHeaderDisplayTypes.AllHeaders);
}

function MsgViewNormalHeaders() {
  Services.prefs.setIntPref("mail.show_headers",
                            Ci.nsMimeHeaderDisplayTypes.NormalHeaders);
}

function MsgBodyAllowHTML() {
  ChangeMsgBodyDisplay(false, 0, 0);
}

function MsgBodySanitized() {
  ChangeMsgBodyDisplay(false, 3, gDisallow_classes_no_html);
}

function MsgBodyAsPlaintext() {
  ChangeMsgBodyDisplay(true, 1, gDisallow_classes_no_html);
}

function MsgBodyAllParts() {
  ChangeMsgBodyDisplay(false, 4, 0);
}

function ChangeMsgBodyDisplay(plaintext, html, mime) {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", plaintext);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", mime);
  Services.prefs.setIntPref("mailnews.display.html_as", html);
}

function MsgFeedBodyRenderPrefs(plaintext, html, mime) {
  // Separate render prefs not implemented for feeds, bug 458606.
  //  Services.prefs.setBoolPref("rss.display.prefer_plaintext", plaintext);
  //  Services.prefs.setIntPref("rss.display.disallow_mime_handlers", mime);
  //  Services.prefs.setIntPref("rss.display.html_as", html)

  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", plaintext);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", mime);
  Services.prefs.setIntPref("mailnews.display.html_as", html);
}

function ToggleInlineAttachment(target) {
  var viewInline = !Services.prefs.getBoolPref("mail.inline_attachments");
  Services.prefs.setBoolPref("mail.inline_attachments", viewInline);
  target.setAttribute("checked", viewInline ? "true" : "false");
}

function MsgStop() {
    StopUrls();
}

function MsgSendUnsentMsgs() {
  // if offline, prompt for sendUnsentMessages
  if (!Services.io.offline) {
    SendUnsentMessages();
  } else {
    var option = PromptMessagesOffline("send");
    if (option == 0) {
      if (!gOfflineManager)
        GetOfflineMgrService();
      gOfflineManager.goOnline(false /* sendUnsentMessages */,
                               false /* playbackOfflineImapOperations */,
                               msgWindow);
      SendUnsentMessages();
    }
  }
}

function PrintEnginePrintInternal(aDoPrintPreview, aMsgType) {
  var messageList = gFolderDisplay.selectedMessageUris;
  if (!messageList) {
    dump("PrintEnginePrint(): No messages selected.\n");
    return false;
  }

  window.openDialog("chrome://messenger/content/msgPrintEngine.xul", "",
                    "chrome,dialog=no,all,centerscreen",
                    messageList.length, messageList, statusFeedback,
                    aDoPrintPreview, aMsgType);
  return true;

}

function PrintEnginePrint() {
  return PrintEnginePrintInternal(false, Ci.nsIMsgPrintEngine.MNAB_PRINT_MSG);
}

function PrintEnginePrintPreview() {
  return PrintEnginePrintInternal(true, Ci.nsIMsgPrintEngine.MNAB_PRINTPREVIEW_MSG);
}

// Kept for add-on compatibility.
function SelectFolder(folderUri) {
  SelectMsgFolder(MailUtils.getFolderForURI(folderUri));
}

function IsMailFolderSelected() {
  var selectedFolders = GetSelectedMsgFolders();
  var folder = selectedFolders.length ? selectedFolders[0] : null;
  return folder && folder.server.type != "nntp";
}

function IsGetNewMessagesEnabled() {
  // users don't like it when the "Get Msgs" button is disabled
  // so let's never do that.
  // we'll just handle it as best we can in GetFolderMessages()
  // when they click "Get Msgs" and
  // Local Folders or a news server is selected
  // see bugs #89404 and #111102
  return true;
}

function IsGetNextNMessagesEnabled() {
  var selectedFolders = GetSelectedMsgFolders();
  var folder = selectedFolders.length ? selectedFolders[0] : null;

  var menuItem = document.getElementById("menu_getnextnmsg");
  if (folder && !folder.isServer &&
      folder.server instanceof Ci.nsINntpIncomingServer) {
    var menuLabel = PluralForm.get(folder.server.maxArticles,
      gMessengerBundle.getString("getNextNewsMessages"))
                              .replace("#1", folder.server.maxArticles);
    menuItem.setAttribute("label", menuLabel);
    menuItem.removeAttribute("hidden");
    return true;
  }

  menuItem.setAttribute("hidden", "true");
  return false;
}

function SetUpToolbarButtons(uri) {
  let deleteButton = document.getElementById("button-delete");
  let replyAllButton = document.getElementById("button-replyall");

  // Eventually, we might want to set up the toolbar differently for imap,
  // pop, and news. For now, just tweak it based on if it is news or not.
  let forNews = isNewsURI(uri);

  deleteButton.hidden = forNews;
  if (forNews) {
    replyAllButton.setAttribute("type", "menu-button");
    replyAllButton.setAttribute("tooltiptext",
                                replyAllButton.getAttribute("tooltiptextnews"));
  } else {
    replyAllButton.removeAttribute("type");
    replyAllButton.setAttribute("tooltiptext",
                                replyAllButton.getAttribute("tooltiptextmail"));
  }
}

function getMessageBrowser() {
  return document.getElementById("messagepane");
}

// The zoom manager, view source and possibly some other functions still rely
// on the getBrowser function.
function getBrowser() {
  return GetTabMail() ? GetTabMail().getBrowserForSelectedTab() :
                        getMessageBrowser();
}

function MsgSynchronizeOffline() {
  window.openDialog("chrome://messenger/content/msgSynchronize.xul", "",
                    "centerscreen,chrome,modal,titlebar,resizable",
                    {msgWindow});
}

function MsgOpenAttachment() {}
function MsgUpdateMsgCount() {}
function MsgImport() {}
function MsgSynchronize() {}
function MsgGetSelectedMsg() {}
function MsgGetFlaggedMsg() {}
function MsgSelectThread() {}
function MsgShowFolders() {}
function MsgShowLocationbar() {}
function MsgViewAttachInline() {}
function MsgWrapLongLines() {}
function MsgIncreaseFont() {}
function MsgDecreaseFont() {}
function MsgShowImages() {}
function MsgRefresh() {}
function MsgViewPageInfo() {}
function MsgFirstUnreadMessage() {}
function MsgFirstFlaggedMessage() {}
function MsgAddSenderToAddressBook() {}
function MsgAddAllToAddressBook() {}

function SpaceHit(event) {
  var contentWindow = document.commandDispatcher.focusedWindow;
  if (contentWindow.top == window)
    contentWindow = content;
  else if (document.commandDispatcher.focusedElement &&
           !hrefAndLinkNodeForClickEvent(event))
    return;
  var rssiframe = content.document.getElementById("_mailrssiframe");

  // If we are displaying an RSS article, we really want to scroll
  // the nested iframe.
  if (contentWindow == content && rssiframe)
    contentWindow = rssiframe.contentWindow;

  if (event && event.shiftKey) {
    // if at the start of the message, go to the previous one
    if (contentWindow.scrollY > 0)
      contentWindow.scrollByPages(-1);
    else if (Services.prefs.getBoolPref("mail.advance_on_spacebar"))
      goDoCommand("cmd_previousUnreadMsg");
  } else {
    // if at the end of the message, go to the next one
    if (contentWindow.scrollY < contentWindow.scrollMaxY)
      contentWindow.scrollByPages(1);
    else if (Services.prefs.getBoolPref("mail.advance_on_spacebar"))
      goDoCommand("cmd_nextUnreadMsg");
  }
}

function IsAccountOfflineEnabled() {
  var selectedFolders = GetSelectedMsgFolders();

  if (selectedFolders && (selectedFolders.length == 1))
      return selectedFolders[0].supportsOffline;

  return false;
}

function DoGetNewMailWhenOffline() {
  if (!Services.io.offline)
    return true;

  if (PromptMessagesOffline("get") == 0) {
    var sendUnsent = false;
    if (this.CheckForUnsentMessages != undefined && CheckForUnsentMessages()) {
      sendUnsent =
        Services.prefs.getIntPref("offline.send.unsent_messages") == 1 ||
        Services.prompt.confirmEx(
          window,
          gOfflinePromptsBundle.getString("sendMessagesOfflineWindowTitle"),
          gOfflinePromptsBundle.getString("sendMessagesLabel2"),
          Services.prompt.BUTTON_TITLE_IS_STRING *
            (Services.prompt.BUTTON_POS_0 + Services.prompt.BUTTON_POS_1),
          gOfflinePromptsBundle.getString("sendMessagesSendButtonLabel"),
          gOfflinePromptsBundle.getString("sendMessagesNoSendButtonLabel"),
          null, null, {value: false}) == 0;
    }
    if (!gOfflineManager)
      GetOfflineMgrService();
    gOfflineManager.goOnline(sendUnsent /* sendUnsentMessages */,
                             false /* playbackOfflineImapOperations */,
                             msgWindow);
    return true;
  }
  return false;
}

// prompt for getting/sending messages when offline
function PromptMessagesOffline(aPrefix) {
  InitPrompts();
  var checkValue = {value: false};
  return Services.prompt.confirmEx(
      window,
      gOfflinePromptsBundle.getString(aPrefix + "MessagesOfflineWindowTitle"),
      gOfflinePromptsBundle.getString(aPrefix + "MessagesOfflineLabel"),
      (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) +
      (Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1),
      gOfflinePromptsBundle.getString(aPrefix + "MessagesOfflineGoButtonLabel"),
      null, null, null, checkValue);
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

  var folders = (selectedFolders.length) ? selectedFolders
                                         : [defaultAccountRootFolder];

  if (!folders[0]) {
    return;
  }

  for (let folder of folders) {
    var serverType = folder.server.type;
    if (folder.isServer && (serverType == "nntp")) {
      // If we're doing "get msgs" on a news server,
      // update unread counts on this server.
      folder.server.performExpand(msgWindow);
    } else if (serverType == "none") {
      // If "Local Folders" is selected and the user does "Get Msgs" and
      // LocalFolders is not deferred to, get new mail for the default account
      //
      // XXX TODO
      // Should shift click get mail for all (authenticated) accounts?
      // see bug #125885.
      if (!folder.server.isDeferredTo) {
        if (!defaultAccountRootFolder) {
          continue;
        }
        GetNewMsgs(defaultAccountRootFolder.server, defaultAccountRootFolder);
      } else {
        GetNewMsgs(folder.server, folder);
      }
    } else {
      GetNewMsgs(folder.server, folder);
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

  // Whenever we do get new messages, clear the old new messages.
  folder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  folder.clearNewMessages();
  server.getNewMessages(folder, msgWindow, null);
}

function SendUnsentMessages() {
  let msgSendlater = Cc["@mozilla.org/messengercompose/sendlater;1"]
                       .getService(Ci.nsIMsgSendLater);

  let allIdentities = MailServices.accounts.allIdentities;
  for (let currentIdentity of allIdentities) {
    let msgFolder = msgSendlater.getUnsentMessagesFolder(currentIdentity);
    if (msgFolder) {
      let numMessages = msgFolder.getTotalMessages(false /* include subfolders */);
      if (numMessages > 0) {
        msgSendlater.statusFeedback = statusFeedback;
        msgSendlater.sendUnsentMessages(currentIdentity);
        // Right now, all identities point to the same unsent messages
        // folder, so to avoid sending multiple copies of the
        // unsent messages, we only call messenger.SendUnsentMessages() once
        // see bug #89150 for details
        break;
      }
    }
  }
}

function CommandUpdate_UndoRedo() {
  EnableMenuItem("menu_undo", SetupUndoRedoCommand("cmd_undo"));
  EnableMenuItem("menu_redo", SetupUndoRedoCommand("cmd_redo"));
}

function SetupUndoRedoCommand(command) {
  // If we have selected a server, and are viewing account central
  // there is no loaded folder.
  var loadedFolder = GetLoadedMsgFolder();
  if (!loadedFolder || !loadedFolder.server.canUndoDeleteOnServer)
    return false;

  var canUndoOrRedo = false;
  var txnType = 0;

  if (command == "cmd_undo") {
    canUndoOrRedo = messenger.canUndo();
    txnType = messenger.getUndoTransactionType();
  } else {
    canUndoOrRedo = messenger.canRedo();
    txnType = messenger.getRedoTransactionType();
  }

  if (canUndoOrRedo) {
    switch (txnType) {
      default:
      case Ci.nsIMessenger.eUnknown:
        goSetMenuValue(command, "valueDefault");
        break;
      case Ci.nsIMessenger.eDeleteMsg:
        goSetMenuValue(command, "valueDeleteMsg");
        break;
      case Ci.nsIMessenger.eMoveMsg:
        goSetMenuValue(command, "valueMoveMsg");
        break;
      case Ci.nsIMessenger.eCopyMsg:
        goSetMenuValue(command, "valueCopyMsg");
        break;
      case Ci.nsIMessenger.eMarkAllMsg:
        goSetMenuValue(command, "valueUnmarkAllMsgs");
        break;
    }
  } else {
    goSetMenuValue(command, "valueDefault");
  }
  return canUndoOrRedo;
}

function HandleJunkStatusChanged(folder) {
  // This might be the stand alone window, open to a message that was
  // and attachment (or on disk), in which case, we want to ignore it.
  var loadedMessage = GetLoadedMessage();
  if (!loadedMessage ||
      /type=application\/x-message-display/.test(loadedMessage) ||
      !IsCurrentLoadedFolder(folder))
    return;

  // If multiple message are selected and we change the junk status
  // we don't want to show the junk bar (since the message pane is blank).
  var msgHdr = null;
  if (GetNumSelectedMessages() == 1)
    msgHdr = messenger.msgHdrFromURI(loadedMessage);

  var junkBarWasDisplayed = gMessageNotificationBar.isShowingJunkNotification();
  gMessageNotificationBar.setJunkMsg(msgHdr);

  // Only reload message if junk bar display state has changed.
  if (msgHdr && junkBarWasDisplayed != gMessageNotificationBar.isShowingJunkNotification()) {
    // We may be forcing junk mail to be rendered with sanitized html.
    // In that scenario, we want to reload the message if the status has just
    // changed to not junk.
    var sanitizeJunkMail = Services.prefs.getBoolPref("mail.spam.display.sanitize");

    // Only bother doing this if we are modifying the html for junk mail...
    if (sanitizeJunkMail) {
      let junkScore = msgHdr.getStringProperty("junkscore");
      let isJunk = (junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE);

      // If the current row isn't going to change, reload to show sanitized or
      // unsanitized. Otherwise we wouldn't see the reloaded version anyway.

      // XXX: need to special handle last message in view, for imap mark as deleted

      // 1) When marking as non-junk, the msg would move back to the inbox.
      // 2) When marking as junk, the msg will move or delete, if manualMark is set.
      // 3) Marking as junk in the junk folder just changes the junk status.
      if ((!isJunk && folder.isSpecialFolder(Ci.nsMsgFolderFlags.Inbox)) ||
          (isJunk && !folder.server.spamSettings.manualMark) ||
          (isJunk && folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk)))
        ReloadMessage();
    }
  }
}

var gMessageNotificationBar =
{
  get mStringBundle() {
    delete this.mStringBundle;

    return this.mStringBundle = document.getElementById("bundle_messenger");
  },

  get mBrandBundle() {
    delete this.mBrandBundle;

    return this.mBrandBundle = document.getElementById("bundle_brand");
  },

  get mMsgNotificationBar() {
    delete this.mMsgNotificationBar;

    return this.mMsgNotificationBar = document.getElementById("messagepanebox");
  },

  setJunkMsg(aMsgHdr) {
    let isJunk = false;
    if (aMsgHdr) {
      let junkScore = aMsgHdr.getStringProperty("junkscore");
      isJunk = ((junkScore != "") && (junkScore != "0"));
    }

    goUpdateCommand("button_junk");

    if (isJunk) {
      if (!this.isShowingJunkNotification()) {
        let brandName = this.mBrandBundle.getString("brandShortName");
        let junkBarMsg = this.mStringBundle.getFormattedString("junkBarMessage",
                                                            [brandName]);

        let buttons = [{
          label: this.mStringBundle.getString("junkBarInfoButton"),
          accessKey: this.mStringBundle.getString("junkBarInfoButtonKey"),
          popup: null,
          callback() {
            MsgJunkMailInfo(false);
            return true;
          }
        },
        {
          label: this.mStringBundle.getString("junkBarButton"),
          accessKey: this.mStringBundle.getString("junkBarButtonKey"),
          popup: null,
          callback() {
            JunkSelectedMessages(false);
            return true;
          }
        }];
        this.mMsgNotificationBar.appendNotification(junkBarMsg, "junkContent",
          null, this.mMsgNotificationBar.PRIORITY_WARNING_HIGH, buttons);
        this.mMsgNotificationBar.collapsed = false;
      }
    }
  },

  remoteOrigins: null,

  isShowingJunkNotification() {
    return !!this.mMsgNotificationBar.getNotificationWithValue("junkContent");
  },

  setRemoteContentMsg(aMsgHdr, aContentURI, aCanOverride) {
    // remoteOrigins is a Set of all blockable Origins.
    if (!this.remoteOrigins)
      this.remoteOrigins = new Set();

    var origin = aContentURI.spec;
    try {
      origin = aContentURI.scheme + "://" + aContentURI.hostPort;
    }
    // No hostport so likely a special url. Try to use the whole url and see
    // what comes of it.
    catch (e) { }

    this.remoteOrigins.add(origin);

    if (this.mMsgNotificationBar.getNotificationWithValue("remoteContent"))
      return;

    var headerParser = MailServices.headerParser;
    // update the allow remote content for sender string
    var mailbox = headerParser.extractHeaderAddressMailboxes(aMsgHdr.author);
    var emailAddress = mailbox || aMsgHdr.author;
    var displayName = headerParser.extractFirstName(aMsgHdr.mime2DecodedAuthor);
    var brandName = this.mBrandBundle.getString("brandShortName");
    var remoteContentMsg = this.mStringBundle
                               .getFormattedString("remoteContentBarMessage",
                                                   [brandName]);
    var buttons = [{
      label: this.mStringBundle.getString("remoteContentPrefLabel"),
      accessKey: this.mStringBundle.getString("remoteContentPrefAccesskey"),
      popup: "remoteContentOptions"
    }];

    this.mMsgNotificationBar
        .appendNotification(remoteContentMsg,
                            "remoteContent",
                            null,
                            this.mMsgNotificationBar.PRIORITY_WARNING_MEDIUM,
                            (aCanOverride ? buttons : []));
  },

  // aUrl is the nsIURI for the message currently loaded in the message pane
  setPhishingMsg(aUrl) {
    // if we've explicitly marked this message as not being an email scam, then don't
    // bother checking it with the phishing detector.
    var phishingMsg = false;

    if (!checkMsgHdrPropertyIsNot("notAPhishMessage", kIsAPhishMessage))
      phishingMsg = isMsgEmailScam(aUrl);

    var oldNotif = this.mMsgNotificationBar.getNotificationWithValue("phishingContent");
    if (phishingMsg) {
      if (!oldNotif) {
        let brandName = this.mBrandBundle.getString("brandShortName");
        let phishingMsgNote = this.mStringBundle.getFormattedString("phishingBarMessage",
                                                                    [brandName]);

        let buttons = [{
          label: this.mStringBundle.getString("phishingBarIgnoreButton"),
          accessKey: this.mStringBundle.getString("phishingBarIgnoreButtonKey"),
          popup: null,
          callback() {
            MsgIsNotAScam();
          }
        }];

        this.mMsgNotificationBar.appendNotification(phishingMsgNote, "phishingContent",
           null, this.mMsgNotificationBar.PRIORITY_CRITICAL_MEDIUM, buttons);
      }
    }
   },

  setMDNMsg(aMdnGenerator, aMsgHeader, aMimeHdr) {
    this.mdnGenerator = aMdnGenerator;
    // Return receipts can be RFC 3798 "Disposition-Notification-To",
    // or non-standard "Return-Receipt-To".
    var mdnHdr = aMimeHdr.extractHeader("Disposition-Notification-To", false) ||
                 aMimeHdr.extractHeader("Return-Receipt-To", false); // not
    var fromHdr = aMimeHdr.extractHeader("From", false);

    var mdnAddr = MailServices.headerParser
                              .extractHeaderAddressMailboxes(mdnHdr);
    var fromAddr = MailServices.headerParser
                               .extractHeaderAddressMailboxes(fromHdr);

    var authorName = MailServices.headerParser
                                 .extractFirstName(aMsgHeader.mime2DecodedAuthor)
                                 || aMsgHeader.author;

    var barMsg;
    // If the return receipt doesn't go to the sender address, note that in the
    // notification.
    if (mdnAddr != fromAddr)
      barMsg = this.mStringBundle.getFormattedString("mdnBarMessageAddressDiffers",
                                         [authorName, mdnAddr]);
    else
      barMsg = this.mStringBundle.getFormattedString("mdnBarMessageNormal", [authorName]);

    var oldNotif = this.mMsgNotificationBar.getNotificationWithValue("mdnContent");
    if (!oldNotif) {
      let buttons = [{
        label: this.mStringBundle.getString("mdnBarSendReqButton"),
        accessKey: this.mStringBundle.getString("mdnBarSendReqButtonKey"),
        popup: null,
        callback: SendMDNResponse
      },
      {
        label: this.mStringBundle.getString("mdnBarIgnoreButton"),
        accessKey: this.mStringBundle.getString("mdnBarIgnoreButtonKey"),
        popup: null,
        callback: IgnoreMDNResponse
      }];

      this.mMsgNotificationBar.appendNotification(barMsg, "mdnContent",
        null, this.mMsgNotificationBar.PRIORITY_INFO_MEDIUM, buttons);
    }
  },

  clearMsgNotifications() {
  }
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
  var origins = [...gMessageNotificationBar.remoteOrigins];

  var addresses = {};
  MailServices.headerParser.parseHeadersWithArray(
    gMessageDisplay.displayedMessage.author, addresses, {}, {});
  var authorEmailAddress = addresses.value[0];

  var emailURI = Services.io.newURI(
    "chrome://messenger/content/email=" + authorEmailAddress);
  var principal = Services.scriptSecurityManager
                          .createCodebasePrincipal(emailURI, {});
  // Put author email first in the menu.
  origins.unshift(principal.origin);

  // Out with the old...
  let childNodes = aEvent.target.querySelectorAll(".allow-remote-uri");
  for (let child of childNodes)
    child.remove();

  var messengerBundle = gMessageNotificationBar.mStringBundle;
  var separator = document.getElementById("remoteContentSettingsMenuSeparator")

  // ... and in with the new.
  for (let origin of origins) {
    let menuitem = document.createElement("menuitem");
    let host = origin.replace("chrome://messenger/content/email=", "");
    let hostString = messengerBundle.getFormattedString("remoteContentAllow", [host]);
    menuitem.setAttribute("label", hostString);
    menuitem.setAttribute("value", origin);
    menuitem.setAttribute("class", "allow-remote-uri");
    aEvent.target.insertBefore(menuitem, separator);
  }
}

/**
 * Add privileges to display remote content for the given uri.
 * @param aItem |Node| Item that was selected. The origin
 *        is extracted and converted to a uri and used to add
 *        permissions for the site.
 */
function allowRemoteContentForURI(aItem) {

  var origin = aItem.getAttribute("value");

  if (!origin)
    return;

  let uri = Services.io.newURI(origin);
  Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);

  ReloadMessage();
}

/**
 * Displays fine-grained, per-site permissions for remote content.
 */
function editRemoteContentSettings() {
  toDataManager("|permissions");
  if (!Services.prefs.getBoolPref("browser.preferences.instantApply"))
    ReloadMessage();
}

/**
 *  msgHdrForCurrentMessage
 *   Returns the msg hdr associated with the current loaded message.
 */
function msgHdrForCurrentMessage() {
  var msgURI = GetLoadedMessage();
  return (msgURI && !(/type=application\/x-message-display/.test(msgURI))) ? messenger.msgHdrFromURI(msgURI) : null;
}

function MsgIsNotAScam() {
  // we want to get the msg hdr for the currently selected message
  // change the "isPhishingMsg" property on it
  // then reload the message

  setMsgHdrPropertyAndReload("notAPhishMessage", kNotAPhishMessage);
}

function setMsgHdrPropertyAndReload(aProperty, aValue) {
  // we want to get the msg hdr for the currently selected message
  // change the appropiate property on it then reload the message

  var msgHdr = msgHdrForCurrentMessage();
  if (msgHdr) {
    msgHdr.setUint32Property(aProperty, aValue);
    ReloadMessage();
  }
}

function checkMsgHdrPropertyIsNot(aProperty, aValue) {
  // we want to get the msg hdr for the currently selected message,
  // get the appropiate property on it and then test against value.

  var msgHdr = msgHdrForCurrentMessage();
  return (msgHdr && msgHdr.getUint32Property(aProperty) != aValue);
}

/**
 * Mark a specified message as read.
 * @param msgHdr header (nsIMsgDBHdr) of the message to mark as read
 */
function MarkMessageAsRead(msgHdr) {
  ClearPendingReadTimer();
  msgHdr.folder.markMessagesRead([msgHdr], true);
}

function ClearPendingReadTimer() {
  if (gMarkViewedMessageAsReadTimer) {
    clearTimeout(gMarkViewedMessageAsReadTimer);
    gMarkViewedMessageAsReadTimer = null;
  }
}

function OnMsgParsed(aUrl) {
  gMessageNotificationBar.setPhishingMsg(aUrl);

  // notify anyone (e.g., extensions) who's interested in when a message is loaded.
  var msgURI = GetLoadedMessage();
  Services.obs.notifyObservers(msgWindow.msgHeaderSink,
                               "MsgMsgDisplayed", msgURI);

  // scale any overflowing images
  var doc = getMessageBrowser().contentDocument;
  var imgs = doc.getElementsByTagName("img");
  for (var img of imgs) {
    if (img.className == "moz-attached-image" &&
        img.naturalWidth > doc.body.clientWidth) {
      if (img.hasAttribute("shrinktofit"))
        img.setAttribute("isshrunk", "true");
      else
        img.setAttribute("overflowing", "true");
    }
  }
}

function OnMsgLoaded(aUrl) {
  if (!aUrl)
    return;

  // nsIMsgMailNewsUrl.folder throws an error when opening .eml files.
  var folder;
  try {
    folder = aUrl.folder;
  } catch (ex) {}

  var msgURI = GetLoadedMessage();

  if (!folder || !msgURI)
    return;

  // If we are in the middle of a delete or move operation, make sure that
  // if the user clicks on another message then that message stays selected
  // and the selection does not "snap back" to the message chosen by
  // SetNextMessageAfterDelete() when the operation completes (bug 243532).
  var wintype = document.documentElement.getAttribute("windowtype");
  gNextMessageViewIndexAfterDelete = -2;

  var msgHdr = msgHdrForCurrentMessage();
  gMessageNotificationBar.setJunkMsg(msgHdr);
  // Reset the blocked origins so we can populate it again for this message.
  // Reset to null so it's only a Set if there's something in the Set.
  gMessageNotificationBar.remoteOrigins = null;

  var markReadAutoMode = Services.prefs.getBoolPref("mailnews.mark_message_read.auto");

  // We just finished loading a message. If messages are to be marked as read
  // automatically, set a timer to mark the message is read after n seconds
  // where n can be configured by the user.
  if (msgHdr && !msgHdr.isRead && markReadAutoMode) {
    let markReadOnADelay = Services.prefs.getBoolPref("mailnews.mark_message_read.delay");
    // Only use the timer if viewing using the 3-pane preview pane and the
    // user has set the pref.
    if (markReadOnADelay && wintype == "mail:3pane") // 3-pane window
    {
      ClearPendingReadTimer();
      let markReadDelayTime = Services.prefs.getIntPref("mailnews.mark_message_read.delay.interval");
      if (markReadDelayTime == 0)
        MarkMessageAsRead(msgHdr);
      else
        gMarkViewedMessageAsReadTimer = setTimeout(MarkMessageAsRead,
                                                   markReadDelayTime * 1000,
                                                   msgHdr);
    } else // standalone msg window
    {
      MarkMessageAsRead(msgHdr);
    }
  }

  // See if MDN was requested but has not been sent.
  HandleMDNResponse(aUrl);
}

/*
 * This function handles all mdn response generation (ie, imap and pop).
 * For pop the msg uid can be 0 (ie, 1st msg in a local folder) so no
 * need to check uid here. No one seems to set mimeHeaders to null so
 * no need to check it either.
 */
function HandleMDNResponse(aUrl) {
  if (!aUrl)
    return;

  var msgFolder = aUrl.folder;
  var msgHdr = gFolderDisplay.selectedMessage;
  if (!msgFolder || !msgHdr || gFolderDisplay.selectedMessageIsNews)
    return;

  // if the message is marked as junk, do NOT attempt to process a return receipt
  // in order to better protect the user
  if (SelectedMessagesAreJunk())
    return;

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
  if (msgId.split(":")[0] == "md5") {
    var mimeMsgId = mimeHdr.extractHeader("Message-Id", false);
    if (mimeMsgId)
      msgHdr.messageId = mimeMsgId;
  }

  // After a msg is downloaded it's already marked READ at this point so we must check if
  // the msg has a "Disposition-Notification-To" header and no MDN report has been sent yet.
  if (msgHdr.flags & Ci.nsMsgMessageFlags.MDNReportSent)
    return;

  var DNTHeader = mimeHdr.extractHeader("Disposition-Notification-To", false);
  var oldDNTHeader = mimeHdr.extractHeader("Return-Receipt-To", false);
  if (!DNTHeader && !oldDNTHeader)
    return;

  // Everything looks good so far, let's generate the MDN response.
  var mdnGenerator = Cc["@mozilla.org/messenger-mdn/generator;1"]
                       .createInstance(Ci.nsIMsgMdnGenerator);
  var askUser = mdnGenerator.process(Ci.nsIMsgMdnGenerator.eDisplayed,
                                     msgWindow,
                                     msgFolder,
                                     msgHdr.messageKey,
                                     mimeHdr,
                                     false);
  if (askUser)
    gMessageNotificationBar.setMDNMsg(mdnGenerator, msgHdr, mimeHdr);
}

function SendMDNResponse() {
  gMessageNotificationBar.mdnGenerator.userAgreed();
}

function IgnoreMDNResponse() {
  gMessageNotificationBar.mdnGenerator.userDeclined();
}

/**
 * Opens a search window with the given folder, or the displayed one if none is
 * chosen.
 *
 * @param [aFolder] the folder to open the search window for, if different from
 *                  the displayed one
 */
function MsgSearchMessages(aFolder) {
  let folder = aFolder || gFolderDisplay.displayedFolder;
  OpenOrFocusWindow({ folder }, "mailnews:search",
                    "chrome://messenger/content/SearchDialog.xul");
}

function MsgJunkMailInfo(aCheckFirstUse) {
  if (aCheckFirstUse) {
    if (!Services.prefs.getBoolPref("mailnews.ui.junk.firstuse"))
      return;
    Services.prefs.setBoolPref("mailnews.ui.junk.firstuse", false);

    // Check to see if this is an existing profile where the user has started
    // using the junk mail feature already.
    if (MailServices.junk.userHasClassified)
      return;
  }

  var desiredWindow = Services.wm.getMostRecentWindow("mailnews:junkmailinfo");

  if (desiredWindow)
    desiredWindow.focus();
  else
    window.openDialog("chrome://messenger/content/junkMailInfo.xul", "mailnews:junkmailinfo", "centerscreen,resizeable=no,titlebar,chrome,modal", null);
}

function MsgSearchAddresses() {
  var args = { directory: null };
  OpenOrFocusWindow(args, "mailnews:absearch", "chrome://messenger/content/ABSearchDialog.xul");
}

function MsgFilterList(args) {
  OpenOrFocusWindow(args, "mailnews:filterlist", "chrome://messenger/content/FilterListDialog.xul");
}

function OpenOrFocusWindow(args, windowType, chromeURL) {
  var desiredWindow = Services.wm.getMostRecentWindow(windowType);

  if (desiredWindow) {
    desiredWindow.focus();
    if ("refresh" in args && args.refresh)
      desiredWindow.refresh(args);
  } else
    window.openDialog(chromeURL, "", "chrome,resizable,status,centerscreen,dialog=no", args);
}

function getMailToolbox() {
  return document.getElementById("mail-toolbox");
}

function MailToolboxCustomizeInit() {
  toolboxCustomizeInit("mail-menubar");
}

function MailToolboxCustomizeDone(aToolboxChanged) {
  toolboxCustomizeDone("mail-menubar", getMailToolbox(), aToolboxChanged);

  // Make sure the folder location picker is initialized.
  let folderContainer = document.getElementById("folder-location-container");
  if (folderContainer &&
      folderContainer.parentNode.localName != "toolbarpalette") {
    FolderPaneSelectionChange();
  }
}

function MailToolboxCustomizeChange(event) {
  toolboxCustomizeChange(getMailToolbox(), event);
}
