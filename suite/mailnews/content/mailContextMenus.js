/* -*- Mode: javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {PluralForm} = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");


//NOTE: gMessengerBundle must be defined and set or this Overlay won't work

/**
 * Function to change the highlighted row back to the row that is currently
 * outline/dotted without loading the contents of either rows. This is
 * triggered when the context menu for a given row is hidden/closed
 * (onpopuphiding).
 * @param tree the tree element to restore selection for
 */
function RestoreSelectionWithoutContentLoad(tree)
{
    // If a delete or move command had been issued, then we should
    // reset gRightMouseButtonDown and gThreadPaneDeleteOrMoveOccurred
    // and return (see bug 142065).
    if(gThreadPaneDeleteOrMoveOccurred)
    {
      gRightMouseButtonDown = false;
      gThreadPaneDeleteOrMoveOccurred = false;
      return;
    }

    var treeSelection = tree.view.selection;

    // make sure that currentIndex is valid so that we don't try to restore
    // a selection of an invalid row.
    if((!treeSelection.isSelected(treeSelection.currentIndex)) &&
       (treeSelection.currentIndex >= 0))
    {
        treeSelection.selectEventsSuppressed = true;
        treeSelection.select(treeSelection.currentIndex);
        treeSelection.selectEventsSuppressed = false;

        // Keep track of which row in the thread pane is currently selected.
        // This is currently only needed when deleting messages.  See
        // declaration of var in msgMail3PaneWindow.js.
        if(tree.id == "threadTree")
          gThreadPaneCurrentSelectedIndex = treeSelection.currentIndex;
    }
    else if(treeSelection.currentIndex < 0)
        // Clear the selection in the case of when a folder has just been
        // loaded where the message pane does not have a message loaded yet.
        // When right-clicking a message in this case and dismissing the
        // popup menu (by either executing a menu command or clicking
        // somewhere else),  the selection needs to be cleared.
        // However, if the 'Delete Message' or 'Move To' menu item has been
        // selected, DO NOT clear the selection, else it will prevent the
        // tree view from refreshing.
        treeSelection.clearSelection();

    // Need to reset gRightMouseButtonDown to false here because
    // TreeOnMouseDown() is only called on a mousedown, not on a key down.
    // So resetting it here allows the loading of messages in the messagepane
    // when navigating via the keyboard or the toolbar buttons *after*
    // the context menu has been dismissed.
    gRightMouseButtonDown = false;
}

/**
 * Function to clear out the global nsContextMenu, and in the case when we
 * are a threadpane context menu, restore the selection so that a right-click
 * on a non-selected row doesn't move the selection.
 * @param aTarget the target of the popup event
 */
function MailContextOnPopupHiding(aTarget, aEvent) {
  // Don't do anything if it's a submenu's onpopuphiding that's just bubbling
  // up to the top.
  if (aEvent.target != aTarget)
    return;

  gContextMenu.hiding();
  gContextMenu = null;
  if (InThreadPane(aTarget))
    RestoreSelectionWithoutContentLoad(GetThreadTree());
}

/**
 * Determines whether the context menu was triggered by a node that's a child
 * of the threadpane by looking for an ancestor node with id="threadTree".
 * @param aTarget the target of the popup event
 * @return true if the popupNode is a child of the threadpane, otherwise false
 */
function InThreadPane(aTarget)
{
  var node = aTarget.triggerNode;
  while (node)
  {
    if (node.id == "threadTree")
      return true;
    node = node.parentNode;
  }
  return false;
}

/**
 * Function to set up the global nsContextMenu, and the mailnews overlay.
 * @param aTarget the target of the popup event
 * @return true always
 */
function FillMailContextMenu(aTarget, aEvent) {
  // If the popupshowing was for a submenu, we don't need to do anything.
  if (aEvent.target != aTarget)
    return true;

  var inThreadPane = InThreadPane(aTarget);
  gContextMenu = new nsContextMenu(aTarget);

  // Initialize gContextMenuContentData.
  if (aEvent)
    gContextMenu.initContentData(aEvent);

  // Need to call nsContextMenu's initItems to hide what is not used.
  gContextMenu.initItems();

  var numSelected = GetNumSelectedMessages();
  var oneOrMore = (numSelected > 0);
  var single = (numSelected == 1);

  var isNewsgroup = gFolderDisplay.selectedMessageIsNews;

  // Clear the global var used to keep track if a 'Delete Message' or 'Move
  // To' command has been triggered via the thread pane context menu.
  gThreadPaneDeleteOrMoveOccurred = false;

  // Don't show mail items for links/images, just show related items.
  var showMailItems = inThreadPane ||
                      (!gContextMenu.onImage && !gContextMenu.onLink);

  // Select-all and copy are only available in the message-pane
  ShowMenuItem("context-selectall", single && !inThreadPane);
  ShowMenuItem("context-copy", !inThreadPane);

  ShowMenuItem("mailContext-openNewWindow", inThreadPane && single);
  ShowMenuItem("mailContext-openNewTab",    inThreadPane && single);
  ShowMenuItem("mailContext-downloadflagged",
               inThreadPane || (numSelected > 1));
  ShowMenuItem("mailContext-downloadselected",
               inThreadPane || (numSelected > 1));

  ShowMenuItem("mailContext-editAsNew", showMailItems && oneOrMore);
  ShowMenuItem("mailContext-replySender", showMailItems && single);
  ShowMenuItem("mailContext-replyList",
               showMailItems && single && !isNewsgroup && IsListPost());
  ShowMenuItem("mailContext-replyNewsgroup",
               showMailItems && single && isNewsgroup);
  ShowMenuItem("mailContext-replySenderAndNewsgroup",
               showMailItems && single && isNewsgroup);
  ShowMenuItem("mailContext-replyAll", showMailItems && single);
  ShowMenuItem("mailContext-forward", showMailItems && single);
  ShowMenuItem("mailContext-forwardAsAttachment",
               showMailItems && (numSelected > 1));
  ShowMenuItem("mailContext-copyMessageUrl",
               showMailItems && single && isNewsgroup);
  ShowMenuItem("mailContext-archive", showMailItems && oneOrMore &&
               gFolderDisplay.canArchiveSelectedMessages);

  // Set up the move menu. We can't move from newsgroups.
  // Disable move if we can't delete message(s) from this folder.
  var msgFolder = GetLoadedMsgFolder();
  ShowMenuItem("mailContext-moveMenu",
               showMailItems && oneOrMore && !isNewsgroup);
  EnableMenuItem("mailContext-moveMenu",
                 oneOrMore && msgFolder && msgFolder.canDeleteMessages);

  // Copy is available as long as something is selected.
  var canCopy = showMailItems && oneOrMore && (!gMessageDisplay.isDummy ||
                                               window.arguments[0].scheme == "file");
  ShowMenuItem("mailContext-copyMenu", canCopy);
  ShowMenuItem("mailContext-tags", showMailItems && oneOrMore);
  ShowMenuItem("mailContext-mark", showMailItems && oneOrMore);
  ShowMenuItem("mailContext-saveAs", showMailItems && oneOrMore);
  ShowMenuItem("mailContext-printpreview", showMailItems && single);

  ShowMenuItem("mailContext-print", showMailItems);
  EnableMenuItem("mailContext-print", oneOrMore);
  ShowMenuItem("mailContext-delete", showMailItems);
  EnableMenuItem("mailContext-delete", oneOrMore);
  // This function is needed for the case where a folder is just loaded
  // (while there isn't a message loaded in the message pane), a right-click
  // is done in the thread pane.  This function will disable enable the
  // 'Delete Message' menu item.
  goUpdateCommand('cmd_delete');

  ShowMenuItem("context-addemail", gContextMenu.onMailtoLink);
  ShowMenuItem("context-composeemailto", gContextMenu.onMailtoLink);
  ShowMenuItem("context-createfilterfrom", gContextMenu.onMailtoLink);

  // Figure out separators.
  initSeparators();

  return true;
}

/**
 * Hide separators with no active menu items.
 *
 */
function initSeparators() {
  const mailContextSeparators = [
    "mailContext-sep-link", "mailContext-sep-open",
    "mailContext-sep-tags", "mailContext-sep-mark",
    "mailContext-sep-move", "mailContext-sep-print",
    "mailContext-sep-edit", "mailContext-sep-image",
    "mailContext-sep-blockimage", "mailContext-sep-copy",
  ];

  mailContextSeparators.forEach(hideIfAppropriate);
}

/**
 * Hide a separator based on whether there are any non-hidden items between
 * it and the previous separator.
 *
 * @param aID  The id of the separator element.
 */
function hideIfAppropriate(aID) {
  let separator = document.getElementById(aID);

  function hasAVisibleNextSibling(aNode) {
    let sibling = aNode.nextSibling;
    while (sibling) {
      if (sibling.getAttribute("hidden") != "true" &&
          sibling.localName != "menuseparator")
        return true;
      sibling = sibling.nextSibling;
    }
    return false;
  }

  let sibling = separator.previousSibling;
  while (sibling) {
    if (sibling.getAttribute("hidden") != "true") {
      ShowMenuItem(aID, sibling.localName != "menuseparator" &&
                        hasAVisibleNextSibling(separator));
      return;
    }
    sibling = sibling.previousSibling;
  }
  ShowMenuItem(aID, false);
}

function FolderPaneOnPopupHiding()
{
  RestoreSelectionWithoutContentLoad(document.getElementById("folderTree"));
}

function FillFolderPaneContextMenu()
{
  // Do not show menu if rows are selected.
  let folders = gFolderTreeView.getSelectedFolders();
  let numSelected = folders.length;
  if (!numSelected)
    return false;

  function checkIsVirtualFolder(folder) {
    return folder.getFlag(Ci.nsMsgFolderFlags.Virtual);
  }
  let haveAnyVirtualFolders = folders.some(checkIsVirtualFolder);

  function checkIsServer(folder) {
    return folder.isServer;
  }
  let selectedServers = folders.filter(checkIsServer);

  let folder = folders[0];
  let isServer = folder.isServer;
  let serverType = folder.server.type;
  let specialFolder = haveAnyVirtualFolders ? "Virtual" :
                                              getSpecialFolderString(folder);

  function checkCanSubscribeToFolder(folder) {
    if (checkIsVirtualFolder(folder))
      return false;

    // All feed account folders, besides Trash, are subscribable.
    if (folder.server.type == "rss" &&
        !folder.getFlag(Ci.nsMsgFolderFlags.Trash))
      return true;

    // We only want the subscribe item on the account nodes.
    if (!folder.isServer)
      return false;

    return folder.server.type == "nntp" ||
           folder.server.type == "imap";
  }
  let haveOnlySubscribableFolders = folders.every(checkCanSubscribeToFolder);

  function checkIsNewsgroup(folder) {
    return !folder.isServer && folder.server.type == "nntp" &&
           !folder.getFlag(Ci.nsMsgFolderFlags.Virtual);
  }
  let haveOnlyNewsgroups = folders.every(checkIsNewsgroup);

  function checkIsMailFolder(folder) {
    return !folder.isServer && folder.server.type != "nntp";
  }
  let haveOnlyMailFolders = folders.every(checkIsMailFolder);

  function checkCanGetMessages(folder) {
    return (folder.isServer && (folder.server.type != "none")) ||
            checkIsNewsgroup(folder) ||
            ((folder.server.type == "rss") &&
             !folder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true) &&
             !checkIsVirtualFolder(folder));
  }
  let selectedFoldersThatCanGetMessages = folders.filter(checkCanGetMessages);

  // --- Set up folder properties / account settings menu item.
  if (numSelected != 1) {
    ShowMenuItem("folderPaneContext-settings", false);
    ShowMenuItem("folderPaneContext-properties", false);
  }
  else if (selectedServers.length != 1) {
    ShowMenuItem("folderPaneContext-settings", false);
    ShowMenuItem("folderPaneContext-properties", true);
  }
  else {
    ShowMenuItem("folderPaneContext-properties", false);
    ShowMenuItem("folderPaneContext-settings", true);
  }

  // --- Set up the get messages menu item.
  // Show if only servers, or it's only newsgroups/feeds. We could mix,
  // but it gets messy for situations where both server and a folder
  // on the server are selected.
  let showGet = selectedFoldersThatCanGetMessages.length == numSelected;
  ShowMenuItem("folderPaneContext-getMessages", showGet);
  if (showGet) {
    if (selectedServers.length > 0 &&
        selectedServers.length == selectedFoldersThatCanGetMessages.length) {
      SetMenuItemLabel("folderPaneContext-getMessages",
                       gMessengerBundle.getString("getMessagesFor"));
    }
    else {
      SetMenuItemLabel("folderPaneContext-getMessages",
                       gMessengerBundle.getString("getMessages"));
    }
  }

  // --- Setup the Mark All Folders Read menu item.
  // Show only in case the server item is selected.
  ShowMenuItem("folderPaneContext-markAllFoldersRead",
               selectedServers.length > 0);

  // --- Set up new sub/folder menu item.
  let isInbox = specialFolder == "Inbox";
  let showNew =
    (numSelected == 1) &&
    ((serverType != "nntp" && folder.canCreateSubfolders) || isInbox);
  ShowMenuItem("folderPaneContext-new", showNew);
  if (showNew) {
    EnableMenuItem("folderPaneContext-new",
                   serverType != "imap" || !Services.io.offline);
    let label = (isServer || isInbox) ? "newFolder" : "newSubfolder";
    SetMenuItemLabel("folderPaneContext-new",
                     gMessengerBundle.getString(label));
  }

  // --- Set up rename menu item.
  let canRename = (numSelected == 1) && !isServer && folder.canRename &&
                  (specialFolder == "none" || specialFolder == "Virtual" ||
                   (specialFolder == "Junk" &&
                    CanRenameDeleteJunkMail(folder.URI)));
  ShowMenuItem("folderPaneContext-rename", canRename);
  if (canRename) {
    EnableMenuItem("folderPaneContext-rename",
                   !isServer && folder.isCommandEnabled("cmd_renameFolder"));
    SetMenuItemLabel("folderPaneContext-rename",
                     gMessengerBundle.getString("renameFolder"));
  }

  // --- Set up the delete folder menu item.
  function checkCanDeleteFolder(folder) {
    if (folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false))
      return CanRenameDeleteJunkMail(folder.URI);
    return folder.deletable;
  }
  let haveOnlyDeletableFolders = folders.every(checkCanDeleteFolder);
  ShowMenuItem("folderPaneContext-remove",
               haveOnlyDeletableFolders && numSelected == 1);
  if (haveOnlyDeletableFolders && numSelected == 1)
    SetMenuItemLabel("folderPaneContext-remove",
                     gMessengerBundle.getString("removeFolder"));

  function checkIsDeleteEnabled(folder) {
    return folder.isCommandEnabled("cmd_delete");
  }
  let haveOnlyDeleteEnabledFolders = folders.every(checkIsDeleteEnabled);
  EnableMenuItem("folderPaneContext-remove", haveOnlyDeleteEnabledFolders);

  // --- Set up the compact folder menu item.
  function checkCanCompactFolder(folder) {
    return folder.canCompact &&
           !folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
           folder.isCommandEnabled("cmd_compactFolder");
  }
  let haveOnlyCompactableFolders = folders.every(checkCanCompactFolder);
  ShowMenuItem("folderPaneContext-compact", haveOnlyCompactableFolders);
  if (haveOnlyCompactableFolders)
    SetMenuItemLabel("folderPaneContext-compact",
                     PluralForm.get(numSelected, gMessengerBundle.getString("compactFolders")));

  function checkIsCompactEnabled(folder) {
    return folder.isCommandEnabled("cmd_compactFolder");
  }
  let haveOnlyCompactEnabledFolders = folders.every(checkIsCompactEnabled);
  EnableMenuItem("folderPaneContext-compact", haveOnlyCompactEnabledFolders);

  // --- Set up favorite folder menu item.
  let showFavorite = (numSelected == 1) && !isServer;
  ShowMenuItem("folderPaneContext-favoriteFolder", showFavorite);
  if (showFavorite) {
    // Adjust the checked state on the menu item.
    document.getElementById("folderPaneContext-favoriteFolder")
            .setAttribute("checked",
                          folder.getFlag(Ci.nsMsgFolderFlags.Favorite));
  }

  // --- Set up the empty trash menu item.
  ShowMenuItem("folderPaneContext-emptyTrash",
               numSelected == 1 && specialFolder == "Trash");

  // --- Set up the empty junk menu item.
  ShowMenuItem("folderPaneContext-emptyJunk",
               numSelected == 1 && specialFolder == "Junk");

  // --- Set up the send unsent messages menu item.
  let showSendUnsentMessages = numSelected == 1 && specialFolder == "Outbox";
  ShowMenuItem("folderPaneContext-sendUnsentMessages", showSendUnsentMessages);
  if (showSendUnsentMessages)
    EnableMenuItem("folderPaneContext-sendUnsentMessages",
                   IsSendUnsentMsgsEnabled(folder));

  // --- Set up the subscribe menu item.
  ShowMenuItem("folderPaneContext-subscribe",
               numSelected == 1 && haveOnlySubscribableFolders);

  // --- Set up the unsubscribe menu item.
  ShowMenuItem("folderPaneContext-newsUnsubscribe", haveOnlyNewsgroups);

  // --- Set up the mark newsgroup/s read menu item.
  ShowMenuItem("folderPaneContext-markNewsgroupAllRead", haveOnlyNewsgroups);
  SetMenuItemLabel("folderPaneContext-markNewsgroupAllRead",
                   PluralForm.get(numSelected, gMessengerBundle.getString("markNewsgroupRead")));

  // --- Set up the mark folder/s read menu item.
  ShowMenuItem("folderPaneContext-markMailFolderAllRead",
               haveOnlyMailFolders && !haveAnyVirtualFolders);
  SetMenuItemLabel("folderPaneContext-markMailFolderAllRead",
                   PluralForm.get(numSelected, gMessengerBundle.getString("markFolderRead")));

  // Set up the search menu item.
  ShowMenuItem("folderPaneContext-searchMessages",
               numSelected == 1 && !haveAnyVirtualFolders);
  goUpdateCommand('cmd_search');

  ShowMenuItem("folderPaneContext-openNewWindow", numSelected == 1);
  ShowMenuItem("folderPaneContext-openNewTab", numSelected == 1);

  // Hide / Show our menu separators based on the menu items we are showing.
  hideIfAppropriate("folderPaneContext-sep1");
  hideIfAppropriate("folderPaneContext-sep-edit");
  hideIfAppropriate("folderPaneContext-sep4");

  return true;
}

function ShowMenuItem(id, showItem)
{
  var item = document.getElementById(id);
  if(item && item.hidden != "true")
    item.hidden = !showItem;
}

function EnableMenuItem(id, enableItem)
{
  var item = document.getElementById(id);
  if(item)
  {
    var enabled = (item.getAttribute('disabled') !='true');
    if(enableItem != enabled)
    {
      item.setAttribute('disabled', enableItem ? '' : 'true');
    }
  }
}

function SetMenuItemLabel(id, label)
{
  var item = document.getElementById(id);
  if(item)
    item.setAttribute('label', label);
}

function SetMenuItemAccessKey(id, accessKey)
{
  var item = document.getElementById(id);
  if(item)
    item.setAttribute('accesskey', accessKey);
}

// message pane context menu helper methods
function AddContact(aEmailAddressNode)
{
  if (aEmailAddressNode)
    AddEmailToAddressBook(aEmailAddressNode.getAttribute("emailAddress"),
                          aEmailAddressNode.getAttribute("displayName"));
}

function AddEmailToAddressBook(primaryEmail, displayName)
{
    window.openDialog("chrome://messenger/content/addressbook/abNewCardDialog.xul",
                      "", "chrome,resizable=no,titlebar,modal,centerscreen",
                      {primaryEmail:primaryEmail, displayName:displayName});
}

function EditContact(aEmailAddressNode)
{
  if (aEmailAddressNode.cardDetails.card)
  {
    window.openDialog("chrome://messenger/content/addressbook/abEditCardDialog.xul",
                      "", "chrome,resizable=no,modal,titlebar,centerscreen",
                      { abURI: aEmailAddressNode.cardDetails.book.URI,
                        card: aEmailAddressNode.cardDetails.card });
  }
}

/**
 * SendMailToNode takes the email address title button, extracts the email address
 * we stored in there and opens a compose window with that address.
 *
 * @param addressNode  a node which has a "fullAddress" attribute
 * @param aEvent       the event object when user triggers the menuitem
 */
function SendMailToNode(emailAddressNode, aEvent)
{
  if (emailAddressNode)
    SendMailTo(emailAddressNode.getAttribute("fullAddress"), aEvent);
}

function SendMailTo(fullAddress, aEvent)
{
  var fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                 .createInstance(Ci.nsIMsgCompFields);
  var params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                 .createInstance(Ci.nsIMsgComposeParams);

  var headerParser = MailServices.headerParser;
  var addresses = headerParser.makeFromDisplayAddress(fullAddress);
  fields.to = headerParser.makeMimeHeader([addresses[0]]);
  params.type = Ci.nsIMsgCompType.New;

  // If aEvent is passed, check if Shift key was pressed for composition in
  // non-default format (HTML vs. plaintext).
  params.format = (aEvent && aEvent.shiftKey) ?
    Ci.nsIMsgCompFormat.OppositeOfDefault :
    Ci.nsIMsgCompFormat.Default;

  params.identity = accountManager.getFirstIdentityForServer(GetLoadedMsgFolder().server);
  params.composeFields = fields;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

/**
 * Takes the email address, extracts the address/name
 * we stored in there and copies it to the clipboard.
 *
 * @param addressNode  a node which has an "emailAddress"
 *                     attribute
 * @param aIncludeName when true, also copy the name onto the clipboard,
 *                     otherwise only the email address
 */
function CopyEmailAddress(emailAddressNode, aIncludeName = false)
{
  if (emailAddressNode) {
    let address = emailAddressNode.getAttribute(aIncludeName ? "fullAddress"
                                                             : "emailAddress");
    CopyString(address);
  }
}

// show the message id in the context menu
function FillMessageIdContextMenu(messageIdNode)
{
  var msgId = messageIdNode.getAttribute("messageid");
  document.getElementById("messageIdContext-messageIdTarget")
          .setAttribute("label", msgId);

  // We don't want to show "Open Message For ID" for the same message
  // we're viewing.
  var currentMsgId = "<" + gFolderDisplay.selectedMessage.messageId + ">";
  document.getElementById("messageIdContext-openMessageForMsgId")
          .hidden = (currentMsgId == msgId);

  // We don't want to show "Open Browser With Message-ID" for non-nntp messages.
  document.getElementById("messageIdContext-openBrowserWithMsgId")
          .hidden = !gFolderDisplay.selectedMessageIsNews;
}

function GetMessageIdFromNode(messageIdNode, cleanMessageId)
{
  var messageId  = messageIdNode.getAttribute("messageid");

  // remove < and >
  if (cleanMessageId)
    messageId = messageId.substring(1, messageId.length - 1);

  return messageId;
}

// take the message id from the messageIdNode and use the
// url defined in the hidden pref "mailnews.messageid_browser.url"
// to open it in a browser window (%mid is replaced by the message id)
function OpenBrowserWithMessageId(messageId)
{
  var browserURL = GetLocalizedStringPref("mailnews.messageid_browser.url");
  if (browserURL)
    openAsExternal(browserURL.replace(/%mid/, messageId));
}

// take the message id from the messageIdNode, search for the
// corresponding message in all folders starting with the current
// selected folder, then the current account followed by the other
// accounts and open corresponding message if found
function OpenMessageForMessageId(messageId)
{
  var startServer = gDBView.msgFolder.server;
  var messageHeader;

  window.setCursor("wait");

  // first search in current folder for message id
  var messageHeader = CheckForMessageIdInFolder(gDBView.msgFolder, messageId);

  // if message id not found in current folder search in all folders
  if (!messageHeader)
  {
    messageHeader = SearchForMessageIdInSubFolder(startServer.rootFolder, messageId);

    for (let currentServer of MailServices.accounts.allServers)
    {
      if (currentServer && startServer != currentServer &&
          currentServer.canSearchMessages && !currentServer.isDeferredTo)
      {
        messageHeader = SearchForMessageIdInSubFolder(currentServer.rootFolder, messageId);
      }
    }
  }
  window.setCursor("auto");

  // if message id was found open corresponding message
  // else show error message
  if (messageHeader)
    OpenMessageByHeader(messageHeader, Services.prefs.getBoolPref("mailnews.messageid.openInNewWindow"));
  else
  {
    var messageIdStr = "<" + messageId + ">";
    var errorTitle   = gMessengerBundle.getString("errorOpenMessageForMessageIdTitle");
    var errorMessage = gMessengerBundle.getFormattedString("errorOpenMessageForMessageIdMessage",
                                                           [messageIdStr]);
    Services.prompt.alert(window, errorTitle, errorMessage);
  }
}

function OpenMessageByHeader(messageHeader, openInNewWindow)
{
  var folder    = messageHeader.folder;
  var folderURI = folder.URI;

  if (openInNewWindow)
  {
    var messageURI = folder.getUriForMsg(messageHeader);

    window.openDialog("chrome://messenger/content/messageWindow.xul",
                      "_blank", "all,chrome,dialog=no,status,toolbar",
                      messageURI, folderURI, null);
  }
  else
  {
    if (msgWindow.openFolder != folderURI)
      gFolderTreeView.selectFolder(folder)

    var tree = null;
    var wintype = document.documentElement.getAttribute('windowtype');
    if (wintype != "mail:messageWindow")
    {
      tree = GetThreadTree();
      tree.view.selection.clearSelection();
    }

    try
    {
      gDBView.selectMsgByKey(messageHeader.messageKey);
    }
    catch(e)
    { // message not in the thread pane
      try
      {
        goDoCommand("cmd_viewAllMsgs");
        gDBView.selectMsgByKey(messageHeader.messageKey);
      }
      catch(e)
      {
         dump("select messagekey " + messageHeader.messageKey +
              " failed in folder " + folder.URI);
      }
    }

    if (tree && tree.currentIndex != -1)
      tree.treeBoxObject.ensureRowIsVisible(tree.currentIndex);
  }
}

// search for message by message id in given folder and its subfolders
// return message header if message was found
function SearchForMessageIdInSubFolder(folder, messageId)
{
  var messageHeader;

  // search in folder
  if (!folder.isServer)
    messageHeader = CheckForMessageIdInFolder(folder, messageId);

  // search subfolders recursively
  for (let currentFolder of folder.subFolders) {
    // search in current folder
    messageHeader = CheckForMessageIdInFolder(currentFolder, messageId);

    // search in its subfolder
    if (!messageHeader && currentFolder.hasSubFolders)
      messageHeader = SearchForMessageIdInSubFolder(currentFolder, messageId);
  }

  return messageHeader;
}

// check folder for corresponding message to given message id
// return message header if message was found
function CheckForMessageIdInFolder(folder, messageId)
{
  var messageDatabase = folder.msgDatabase;
  var messageHeader;

  try
  {
    messageHeader = messageDatabase.getMsgHdrForMessageID(messageId);
  }
  catch (ex)
  {
    dump("Failed to find message-id in folder!");
  }

  if (!MailServices.mailSession.IsFolderOpenInWindow(folder) &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Inbox))
  {
    folder.msgDatabase = null;
  }

  return messageHeader;
}

// CreateFilter opens the Message Filters and Filter Rules dialogs.
//The Filter Rules dialog has focus. The window is prefilled with filtername <email address>
//Sender condition is selected and the value is prefilled <email address>
function CreateFilter(emailAddressNode)
{
  if (emailAddressNode)
    CreateFilterFromMail(emailAddressNode.getAttribute("emailAddress"));
}

function CreateFilterFromMail(emailAddress)
{
  if (emailAddress)
    top.MsgFilters(emailAddress, GetFirstSelectedMsgFolder());
}

function CopyMessageUrl()
{
  try
  {
    var hdr = gDBView.hdrForFirstSelectedMessage;
    var server = hdr.folder.server;

    // TODO let backend construct URL and return as attribute
    var url = (server.socketType == Ci.nsMsgSocketType.SSL) ?
              "snews://" : "news://";
    url += server.hostName + ":" + server.port + "/" + hdr.messageId;
    CopyString(url);
  }
  catch (ex)
  {
    dump("ex="+ex+"\n");
  }
}

function CopyString(aString)
{
  Cc["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Ci.nsIClipboardHelper)
    .copyString(aString);
}
