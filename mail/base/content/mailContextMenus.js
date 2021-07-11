/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailWindow.js */
/* import-globals-from nsContextMenu.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var mailtolength = 7;

/**
 * Function to change the highlighted row back to the row that is currently
 * outline/dotted without loading the contents of either rows. This is
 * triggered when the context menu for a given row is hidden/closed
 * (onpopuphiding).
 * @param tree the tree element to restore selection for
 */
function RestoreSelectionWithoutContentLoad(tree) {
  if (gRightMouseButtonSavedSelection) {
    let view = gRightMouseButtonSavedSelection.view;
    // restore the selection
    let transientSelection = gRightMouseButtonSavedSelection.transientSelection;
    let realSelection = gRightMouseButtonSavedSelection.realSelection;
    view.selection = realSelection;
    // replay any calls to adjustSelection, this handles suppression.
    transientSelection.replayAdjustSelectionLog(realSelection);
    // Avoid possible cycle leaks.
    gRightMouseButtonSavedSelection.view = null;
    gRightMouseButtonSavedSelection = null;

    if (tree) {
      tree.invalidate();
    }

    UpdateMailToolbar("RestoreSelectionWithoutContentLoad");
  }
}

/**
 * Function to clear out the global nsContextMenu, and in the case when we
 * were a threadpane context menu, restore the selection so that a right-click
 * on a non-selected row doesn't move the selection.
 * @param event the onpopuphiding event
 */
function mailContextOnPopupHiding(aEvent) {
  // Don't do anything if it's a submenu's onpopuphiding that's just bubbling
  // up to the top.
  if (aEvent.target != aEvent.currentTarget) {
    return;
  }

  let wasInThreadPane = gContextMenu.inThreadPane;
  gContextMenu.hiding();
  gContextMenu = null;
  if (wasInThreadPane && "GetThreadTree" in window) {
    RestoreSelectionWithoutContentLoad(GetThreadTree());
  }
}

function fillMailContextMenu(event) {
  let target = event.target.triggerNode;
  if (target?.localName == "treecol") {
    let treeColPicker = target.parentNode.querySelector("treecolpicker");
    let popup = treeColPicker.querySelector(`menupopup[anonid="popup"]`);
    treeColPicker.buildPopup(popup);
    popup.openPopup(target, "after_start", 0, 0, true);
    return false;
  }

  // If the popupshowing was for a submenu, we don't need to do anything.
  if (event.target != event.currentTarget) {
    return true;
  }

  // No menu on grouped header row currently, any command would be an implied
  // multiselect.
  if (gFolderDisplay.tree) {
    let row = gFolderDisplay.tree.getRowAt(event.clientX, event.clientY);
    if (gFolderDisplay.view.isGroupedByHeaderAtIndex(row)) {
      RestoreSelectionWithoutContentLoad(gFolderDisplay.tree);
      return false;
    }
  }

  goUpdateCommand("cmd_killThread");
  goUpdateCommand("cmd_killSubthread");
  goUpdateCommand("cmd_watchThread");

  goUpdateCommand("cmd_print");

  updateCheckedStateForIgnoreAndWatchThreadCmds();

  // Show "Edit Draft Message" menus only in a drafts folder; otherwise hide them.
  showCommandInSpecialFolder("cmd_editDraftMsg", Ci.nsMsgFolderFlags.Drafts);
  // Show "New Message from Template" and "Edit Template" menus only in a
  // templates folder; otherwise hide them.
  showCommandInSpecialFolder(
    ["cmd_newMsgFromTemplate", "cmd_editTemplateMsg"],
    Ci.nsMsgFolderFlags.Templates
  );

  gContextMenu = new nsContextMenu(event.target, event.shiftKey);
  return gContextMenu.shouldDisplay;
}

/**
 * Set the message id to show as label in the context menu item designated
 * for that purpose.
 */
function FillMessageIdContextMenu(messageIdNode) {
  var msgId = messageIdNode.getAttribute("messageid");
  document
    .getElementById("messageIdContext-messageIdTarget")
    .setAttribute("label", msgId);

  // We don't want to show "Open Message For ID" for the same message
  // we're viewing.
  var currentMsgId = "<" + gFolderDisplay.selectedMessage.messageId + ">";
  document.getElementById("messageIdContext-openMessageForMsgId").hidden =
    currentMsgId == msgId;

  // We don't want to show "Open Browser With Message-ID" for non-nntp messages.
  document.getElementById(
    "messageIdContext-openBrowserWithMsgId"
  ).hidden = !gFolderDisplay.selectedMessageIsNews;
}

function CopyMessageId(messageId) {
  var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );

  clipboard.copyString(messageId);
}

function GetMessageIdFromNode(messageIdNode, cleanMessageId) {
  var messageId = messageIdNode.getAttribute("messageid");

  // remove < and >
  if (cleanMessageId) {
    messageId = messageId.substring(1, messageId.length - 1);
  }

  return messageId;
}

/**
 * Take the message id from the messageIdNode and use the url defined in the
 * hidden pref "mailnews.messageid_browser.url" to open it in a browser window
 * (%mid is replaced by the message id).
 * @param messageId the message id to open
 */
function OpenBrowserWithMessageId(messageId) {
  var browserURL = Services.prefs.getComplexValue(
    "mailnews.messageid_browser.url",
    Ci.nsIPrefLocalizedString
  ).data;
  browserURL = browserURL.replace(/%mid/, messageId);
  try {
    messenger.launchExternalURL(browserURL);
  } catch (ex) {
    Cu.reportError(
      "Failed to open message-id in browser; browserURL=" + browserURL
    );
  }
}

/**
 * Take the message id from the messageIdNode, search for the corresponding
 * message in all folders starting with the current selected folder, then the
 * current account followed by the other accounts and open corresponding
 * message if found.
 * @param messageId the message id to open
 */
function OpenMessageForMessageId(messageId) {
  let startServer = msgWindow.openFolder.server;

  window.setCursor("wait");
  let { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
  let messageHeader = MailUtils.getMsgHdrForMsgId(messageId, startServer);
  window.setCursor("auto");

  // if message id was found open corresponding message
  // else show error message
  if (messageHeader) {
    OpenMessageByHeader(
      messageHeader,
      Services.prefs.getBoolPref("mailnews.messageid.openInNewWindow")
    );
  } else {
    let messageIdStr = "<" + messageId + ">";
    let bundle = document.getElementById("bundle_messenger");
    let errorTitle = bundle.getString("errorOpenMessageForMessageIdTitle");
    let errorMessage = bundle.getFormattedString(
      "errorOpenMessageForMessageIdMessage",
      [messageIdStr]
    );

    Services.prompt.alert(window, errorTitle, errorMessage);
  }
}

function OpenMessageByHeader(messageHeader, openInNewWindow) {
  var folder = messageHeader.folder;
  var folderURI = folder.URI;

  if (openInNewWindow) {
    window.openDialog(
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      messageHeader
    );
  } else {
    if (msgWindow.openFolder != folderURI) {
      gFolderTreeView.selectFolder(folder);
    }

    var tree = null;
    let wintype = document.documentElement.getAttribute("windowtype");
    if (wintype != "mail:messageWindow") {
      tree = GetThreadTree();
      tree.view.selection.clearSelection();
    }

    try {
      gDBView.selectMsgByKey(messageHeader.messageKey);
    } catch (e) {
      // message not in the thread pane
      try {
        goDoCommand("cmd_viewAllMsgs");
        gDBView.selectMsgByKey(messageHeader.messageKey);
      } catch (e) {
        dump(
          "select messagekey " +
            messageHeader.messageKey +
            " failed in folder " +
            folder.URI
        );
      }
    }

    if (tree && tree.currentIndex != -1) {
      tree.ensureRowIsVisible(tree.currentIndex);
    }
  }
}

function folderPaneOnPopupHiding() {
  RestoreSelectionWithoutContentLoad(document.getElementById("folderTree"));
}

/* eslint-disable complexity */
function fillFolderPaneContextMenu(aEvent) {
  let target = aEvent.target.triggerNode;
  // If a column header was clicked, show the column picker.
  if (target.localName == "treecol") {
    let treeColPicker = target.parentNode.querySelector("treecolpicker");
    let popup = treeColPicker.querySelector(`menupopup[anonid="popup"]`);
    treeColPicker.buildPopup(popup);
    popup.openPopup(target, "after_start", 0, 0, true);
    return false;
  }

  var bundle = document.getElementById("bundle_messenger");
  var folders = gFolderTreeView.getSelectedFolders();

  // Do not show the context menu if no rows are selected.
  if (!folders.length) {
    // Force the restore of the previously selected folder to avoid making the
    // tree unresponsive if the right click happens on a Mode Header.
    RestoreSelectionWithoutContentLoad(gFolderDisplay.tree);
    return false;
  }

  var numSelected = folders.length;

  function checkIsVirtualFolder(folder) {
    return folder.getFlag(Ci.nsMsgFolderFlags.Virtual);
  }
  var haveAnyVirtualFolders = folders.some(checkIsVirtualFolder);

  function checkIsServer(folder) {
    return folder.isServer;
  }
  var selectedServers = folders.filter(checkIsServer);

  let specialFolder;
  if (numSelected == 1) {
    specialFolder = haveAnyVirtualFolders
      ? "Virtual"
      : getSpecialFolderString(folders[0]);
  }

  function checkCanSubscribeToFolder(folder) {
    if (checkIsVirtualFolder(folder)) {
      return false;
    }

    // All feed account folders, besides Trash, are subscribable.
    if (
      folder.server.type == "rss" &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Trash)
    ) {
      return true;
    }

    // We only want the subscribe item on the account nodes.
    if (!folder.isServer) {
      return false;
    }

    return folder.server.type == "nntp" || folder.server.type == "imap";
  }
  var haveOnlySubscribableFolders = folders.every(checkCanSubscribeToFolder);

  function checkIsNewsgroup(folder) {
    return (
      !folder.isServer &&
      folder.server.type == "nntp" &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
    );
  }
  var haveOnlyNewsgroups = folders.every(checkIsNewsgroup);

  function checkIsMailFolder(folder) {
    return !folder.isServer && folder.server.type != "nntp";
  }
  var haveOnlyMailFolders = folders.every(checkIsMailFolder);

  function checkCanGetMessages(folder) {
    return (
      (folder.isServer && folder.server.type != "none") ||
      checkIsNewsgroup(folder) ||
      (folder.server.type == "rss" &&
        !folder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true) &&
        !checkIsVirtualFolder(folder))
    );
  }
  var selectedFoldersThatCanGetMessages = folders.filter(checkCanGetMessages);

  // --- Set up folder properties / account settings menu item.
  if (numSelected != 1) {
    ShowMenuItem("folderPaneContext-settings", false);
    ShowMenuItem("folderPaneContext-properties", false);
  } else if (selectedServers.length != 1) {
    ShowMenuItem("folderPaneContext-settings", false);
    ShowMenuItem("folderPaneContext-properties", true);
  } else {
    ShowMenuItem("folderPaneContext-properties", false);
    ShowMenuItem("folderPaneContext-settings", true);
  }

  // --- Set up the get messages menu item.
  // Show if only servers, or it's only newsgroups/feeds. We could mix,
  // but it gets messy for situations where both server and a folder
  // on the server are selected.
  ShowMenuItem(
    "folderPaneContext-getMessages",
    (selectedServers.length > 0 &&
      selectedFoldersThatCanGetMessages.length == numSelected &&
      selectedServers.length == selectedFoldersThatCanGetMessages.length) ||
      selectedFoldersThatCanGetMessages.length == numSelected
  );

  // --- Setup the Mark All Folders Read menu item.
  // Show only in case the server item is selected.
  ShowMenuItem(
    "folderPaneContext-markAllFoldersRead",
    selectedServers.length > 0
  );

  // --- Set up the pause all updates menu item.
  // Show only if a feed server.
  let showPausedAll =
    numSelected == 1 &&
    folders[0].isServer &&
    FeedUtils.isFeedFolder(folders[0]);
  ShowMenuItem("folderPaneContext-pauseAllUpdates", showPausedAll);
  // Adjust the checked state on the menu item.
  if (showPausedAll) {
    let menuitem = document.getElementById("folderPaneContext-pauseAllUpdates");
    let optionsAcct = FeedUtils.getOptionsAcct(folders[0].server);
    menuitem.setAttribute("checked", !optionsAcct.doBiff);
  }

  // --- Set up the pause single folder subscription updates menu item.
  // Show only if a feed folder. A folder without feeds, even though it may
  // have subfolders, is not eligible.
  let showPaused =
    numSelected == 1 &&
    !folders[0].isServer &&
    FeedUtils.getFeedUrlsInFolder(folders[0]);
  ShowMenuItem("folderPaneContext-pauseUpdates", showPaused);
  // Adjust the checked state on the menu item.
  if (showPaused) {
    let menuitem = document.getElementById("folderPaneContext-pauseUpdates");
    let properties = FeedUtils.getFolderProperties(folders[0]);
    let paused = properties.includes("isPaused");
    menuitem.setAttribute("checked", paused);
  }
  ShowMenuItem("folderPaneContext-sepPause", showPausedAll || showPaused);

  // --- Set up new sub/folder menu item.
  if (numSelected == 1) {
    let showNewFolderItem =
      (folders[0].server.type != "nntp" && folders[0].canCreateSubfolders) ||
      specialFolder == "Inbox";
    ShowMenuItem("folderPaneContext-new", showNewFolderItem);
    // XXX: Can't offline imap create folders nowadays?
    EnableMenuItem(
      "folderPaneContext-new",
      folders[0].server.type != "imap" || MailOfflineMgr.isOnline()
    );
    if (showNewFolderItem) {
      if (folders[0].isServer || specialFolder == "Inbox") {
        SetMenuItemLabel(
          "folderPaneContext-new",
          bundle.getString("newFolder")
        );
      } else {
        SetMenuItemLabel(
          "folderPaneContext-new",
          bundle.getString("newSubfolder")
        );
      }
    }
  } else {
    ShowMenuItem("folderPaneContext-new", false);
  }

  // --- Set up rename menu item.
  if (numSelected == 1) {
    ShowMenuItem(
      "folderPaneContext-rename",
      (!folders[0].isServer &&
        folders[0].canRename &&
        specialFolder == "none") ||
        specialFolder == "Virtual" ||
        (specialFolder == "Junk" && CanRenameDeleteJunkMail(folders[0].URI))
    );
    EnableMenuItem(
      "folderPaneContext-rename",
      !folders[0].isServer && folders[0].isCommandEnabled("cmd_renameFolder")
    );
  } else {
    ShowMenuItem("folderPaneContext-rename", false);
  }

  // --- Set up the delete folder menu item.
  function checkCanDeleteFolder(folder) {
    if (folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false)) {
      return CanRenameDeleteJunkMail(folder.URI);
    }
    return folder.deletable;
  }
  var haveOnlyDeletableFolders = folders.every(checkCanDeleteFolder);
  ShowMenuItem(
    "folderPaneContext-remove",
    haveOnlyDeletableFolders && numSelected == 1
  );

  function checkIsDeleteEnabled(folder) {
    return folder.isCommandEnabled("cmd_delete");
  }
  var haveOnlyDeleteEnabledFolders = folders.every(checkIsDeleteEnabled);
  EnableMenuItem("folderPaneContext-remove", haveOnlyDeleteEnabledFolders);

  // --- Set up the compact folder menu item.
  function checkCanCompactFolder(folder) {
    return (
      folder.canCompact &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
      folder.isCommandEnabled("cmd_compactFolder")
    );
  }
  var haveOnlyCompactableFolders = folders.every(checkCanCompactFolder);
  ShowMenuItem("folderPaneContext-compact", haveOnlyCompactableFolders);

  function checkIsCompactEnabled(folder) {
    return folder.isCommandEnabled("cmd_compactFolder");
  }
  var haveOnlyCompactEnabledFolders = folders.every(checkIsCompactEnabled);
  EnableMenuItem("folderPaneContext-compact", haveOnlyCompactEnabledFolders);

  // --- Set up favorite folder menu item.
  ShowMenuItem(
    "folderPaneContext-favoriteFolder",
    numSelected == 1 && !folders[0].isServer
  );
  if (numSelected == 1 && !folders[0].isServer) {
    // Adjust the checked state on the menu item.
    document
      .getElementById("folderPaneContext-favoriteFolder")
      .setAttribute(
        "checked",
        folders[0].getFlag(Ci.nsMsgFolderFlags.Favorite)
      );
  }

  // --- Set up the empty trash menu item.
  ShowMenuItem(
    "folderPaneContext-emptyTrash",
    numSelected == 1 && specialFolder == "Trash"
  );

  // --- Set up the empty junk menu item.
  ShowMenuItem(
    "folderPaneContext-emptyJunk",
    numSelected == 1 && specialFolder == "Junk"
  );

  // --- Set up the send unsent messages menu item.
  ShowMenuItem(
    "folderPaneContext-sendUnsentMessages",
    numSelected == 1 && specialFolder == "Outbox"
  );
  EnableMenuItem(
    "folderPaneContext-sendUnsentMessages",
    IsSendUnsentMsgsEnabled(folders[0])
  );

  // --- Set up the subscribe menu item.
  ShowMenuItem(
    "folderPaneContext-subscribe",
    numSelected == 1 && haveOnlySubscribableFolders
  );

  // --- Set up the unsubscribe menu item.
  ShowMenuItem("folderPaneContext-newsUnsubscribe", haveOnlyNewsgroups);

  // --- Set up the mark newsgroup/s read menu item.
  ShowMenuItem("folderPaneContext-markNewsgroupAllRead", haveOnlyNewsgroups);
  SetMenuItemLabel(
    "folderPaneContext-markNewsgroupAllRead",
    PluralForm.get(numSelected, bundle.getString("markNewsgroupRead"))
  );

  // --- Set up the mark folder/s read menu item.
  ShowMenuItem(
    "folderPaneContext-markMailFolderAllRead",
    haveOnlyMailFolders && !haveAnyVirtualFolders
  );
  SetMenuItemLabel(
    "folderPaneContext-markMailFolderAllRead",
    PluralForm.get(numSelected, bundle.getString("markFolderRead"))
  );

  // Set up the search menu item.
  ShowMenuItem(
    "folderPaneContext-searchMessages",
    numSelected == 1 && !haveAnyVirtualFolders
  );
  goUpdateCommand("cmd_search");

  // handle our separators
  function hideIfAppropriate(aID) {
    var separator = document.getElementById(aID);
    var sibling = separator.previousElementSibling;
    while (sibling) {
      if (!sibling.hidden) {
        ShowMenuItem(
          aID,
          sibling.localName != "menuseparator" &&
            hasAVisibleNextSibling(separator)
        );
        return;
      }
      sibling = sibling.previousElementSibling;
    }
    ShowMenuItem(aID, false);
  }

  // Hide / Show our menu separators based on the menu items we are showing.
  ShowMenuItem("folderPaneContext-sep1", selectedServers.length == 0);
  hideIfAppropriate("folderPaneContext-sep1");
  hideIfAppropriate("folderPaneContext-sep2");
  hideIfAppropriate("folderPaneContext-sep3");
  hideIfAppropriate("folderPaneContext-sep4");

  return true;
}
/* eslint-enable complexity */

function ShowMenuItem(id, showItem) {
  document.getElementById(id).hidden = !showItem;
}

function EnableMenuItem(id, enableItem) {
  document.getElementById(id).disabled = !enableItem;
}

function SetMenuItemLabel(id, label) {
  document.getElementById(id).setAttribute("label", label);
}

// helper function used by shouldShowSeparator
function hasAVisibleNextSibling(aNode) {
  var sibling = aNode.nextElementSibling;
  while (sibling) {
    if (!sibling.hidden && sibling.localName != "menuseparator") {
      return true;
    }
    sibling = sibling.nextElementSibling;
  }
  return false;
}

function IsMenuItemShowing(menuID) {
  var item = document.getElementById(menuID);
  if (item) {
    return item.hidden != "true";
  }
  return false;
}

// message pane context menu helper methods
function addEmail() {
  var url = gContextMenu.linkURL;
  var addresses = getEmail(url);
  window.openDialog(
    "chrome://messenger/content/addressbook/abNewCardDialog.xhtml",
    "",
    "chrome,resizable=no,titlebar,modal,centerscreen",
    { primaryEmail: addresses }
  );
}

function composeEmailTo() {
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  fields.to = getEmail(gContextMenu.linkURL);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  if (gFolderDisplay.displayedFolder) {
    params.identity = accountManager.getFirstIdentityForServer(
      gFolderDisplay.displayedFolder.server
    );
  }
  params.composeFields = fields;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

// Extracts email address from url string
function getEmail(url) {
  var qmark = url.indexOf("?");
  var addresses;

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

function CopyMessageUrl() {
  try {
    var hdr = gDBView.hdrForFirstSelectedMessage;
    var server = hdr.folder.server;

    // TODO let backend construct URL and return as attribute
    var url =
      server.socketType == Ci.nsMsgSocketType.SSL ? "snews://" : "news://";
    url += server.hostName + ":" + server.port + "/" + hdr.messageId;

    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
      Ci.nsIClipboardHelper
    );
    clipboard.copyString(url);
  } catch (ex) {
    dump("ex=" + ex + "\n");
  }
}
