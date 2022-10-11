/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functionality for the main application window (aka the 3pane) usually
 * consisting of folder pane, thread pane and message pane.
 */

const { MailServices } =
  ChromeUtils.import("resource:///modules/MailServices.jsm");

// Controller object for folder pane
var FolderPaneController =
{
  supportsCommand: function(command)
  {
    switch ( command )
    {
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete":
        // Even if the folder pane has focus, don't do a folder delete if
        // we have a selected message, but do a message delete instead.
        // Return false here supportsCommand and let the command fall back
        // to the DefaultController.
        if (Services.prefs.getBoolPref("mailnews.ui.deleteAlwaysSelectedMessages") && (gFolderDisplay.selectedCount != 0))
          return false;
        // else fall through
      //case "cmd_selectAll": the folder pane currently only handles single selection
      case "cmd_cut":
      case "cmd_copy":
      case "cmd_paste":
        return true;

      default:
        return false;
    }
  },

  isCommandEnabled: function(command)
  {
    switch ( command )
    {
      case "cmd_cut":
      case "cmd_copy":
      case "cmd_paste":
        return false;
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete":
      {
        // Make sure the button doesn't show "Undelete" for folders.
        UpdateDeleteToolbarButton(true);
        let folders = GetSelectedMsgFolders();
        if (folders.length) {
          let folder = folders[0];
          // XXX Figure out some better way/place to update the folder labels.
          UpdateDeleteLabelsFromFolderCommand(folder, command);
          return CanDeleteFolder(folder) && folder.isCommandEnabled(command);
        }
        return false;
      }
      default:
        return false;
    }
  },

  doCommand: function(command)
  {
    // if the user invoked a key short cut then it is possible that we got here for a command which is
    // really disabled. kick out if the command should be disabled.
    if (!this.isCommandEnabled(command)) return;

    switch ( command )
    {
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete":
        gFolderTreeController.deleteFolder();
        break;
    }
  },

  onEvent: function(event)
  {
  }
};

function UpdateDeleteLabelsFromFolderCommand(folder, command) {
  if (command != "cmd_delete")
    return;

  if (folder.server.type == "nntp" &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    goSetMenuValue(command, "valueNewsgroup");
    goSetAccessKey(command, "valueNewsgroupAccessKey");
  }
  else {
    goSetMenuValue(command, "valueFolder");
  }
}

// DefaultController object (handles commands when one of the trees does not have focus)
var DefaultController =
{
  supportsCommand: function(command)
  {

    switch ( command )
    {
      case "cmd_createFilterFromPopup":
      case "cmd_archive":
      case "cmd_reply":
      case "button_reply":
      case "cmd_replyList":
      case "cmd_replyGroup":
      case "cmd_replySender":
      case "cmd_replyall":
      case "button_replyall":
      case "cmd_replySenderAndGroup":
      case "cmd_replyAllRecipients":
      case "cmd_forward":
      case "button_forward":
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_editAsNew":
      case "cmd_editDraftMsg":
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
      case "cmd_createFilterFromMenu":
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "button_shiftDelete":
      case "button_junk":
      case "cmd_nextMsg":
      case "button_next":
      case "cmd_nextUnreadMsg":
      case "cmd_nextFlaggedMsg":
      case "cmd_nextUnreadThread":
      case "cmd_previousMsg":
      case "cmd_previousUnreadMsg":
      case "cmd_previousFlaggedMsg":
      case "button_goBack":
      case "cmd_goBack":
      case "button_goForward":
      case "cmd_goForward":
      case "cmd_goStartPage":
      case "cmd_viewAllMsgs":
      case "cmd_viewUnreadMsgs":
      case "cmd_viewThreadsWithUnread":
      case "cmd_viewWatchedThreadsWithUnread":
      case "cmd_viewIgnoredThreads":
      case "cmd_stop":
      case "cmd_undo":
      case "cmd_redo":
      case "cmd_expandAllThreads":
      case "cmd_collapseAllThreads":
      case "cmd_renameFolder":
      case "cmd_sendUnsentMsgs":
      case "cmd_subscribe":
      case "cmd_openMessage":
      case "button_print":
      case "cmd_print":
      case "cmd_printpreview":
      case "cmd_printSetup":
      case "cmd_saveAsFile":
      case "cmd_saveAsTemplate":
      case "cmd_properties":
      case "cmd_viewPageSource":
      case "cmd_setFolderCharset":
      case "cmd_reload":
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
      case "cmd_getNextNMessages":
      case "cmd_find":
      case "cmd_findNext":
      case "cmd_findPrev":
      case "button_search":
      case "cmd_search":
      case "button_mark":
      case "cmd_markAsRead":
      case "cmd_markAsUnread":
      case "cmd_markAllRead":
      case "cmd_markThreadAsRead":
      case "cmd_markReadByDate":
      case "cmd_markAsFlagged":
      case "cmd_markAsJunk":
      case "cmd_markAsNotJunk":
      case "cmd_recalculateJunkScore":
      case "cmd_markAsShowRemote":
      case "cmd_markAsNotPhish":
      case "cmd_displayMsgFilters":
      case "cmd_applyFiltersToSelection":
      case "cmd_applyFilters":
      case "cmd_runJunkControls":
      case "cmd_deleteJunk":
      case "button_file":
      case "cmd_emptyTrash":
      case "cmd_compactFolder":
      case "cmd_settingsOffline":
      case "cmd_selectAll":
      case "cmd_selectThread":
      case "cmd_selectFlagged":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
        return true;
      case "cmd_downloadFlagged":
      case "cmd_downloadSelected":
      case "cmd_synchronizeOffline":
        return !Services.io.offline;
      case "cmd_watchThread":
      case "cmd_killThread":
      case "cmd_killSubthread":
      case "cmd_cancel":
        return gFolderDisplay.selectedMessageIsNews;
      default:
        return false;
    }
  },

  isCommandEnabled: function(command)
  {
    var enabled = new Object();
    enabled.value = false;
    var checkStatus = new Object();

    switch ( command )
    {
      case "cmd_delete":
        UpdateDeleteCommand();
        // fall through
      case "button_delete":
        if (command == "button_delete")
          UpdateDeleteToolbarButton(false);
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.deleteMsg, enabled, checkStatus);
        return enabled.value;
      case "cmd_shiftDelete":
      case "button_shiftDelete":
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.deleteNoTrash, enabled, checkStatus);
        return enabled.value;
      case "cmd_cancel":
        return GetNumSelectedMessages() == 1 &&
               gFolderDisplay.selectedMessageIsNews;
      case "button_junk":
        UpdateJunkToolbarButton();
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.junk, enabled, checkStatus);
        return enabled.value;
      case "cmd_killThread":
      case "cmd_killSubthread":
        return GetNumSelectedMessages() > 0;
      case "cmd_watchThread":
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.toggleThreadWatched, enabled, checkStatus);
        return enabled.value;
      case "cmd_createFilterFromPopup":
      case "cmd_createFilterFromMenu":
        var loadedFolder = GetLoadedMsgFolder();
        if (!(loadedFolder && loadedFolder.server.canHaveFilters))
          return false;   // else fall thru
      case "cmd_saveAsFile":
        return GetNumSelectedMessages() > 0;
      case "cmd_saveAsTemplate":
        var msgFolder = GetSelectedMsgFolders();
        var target = msgFolder[0].server.localStoreType;
        if (GetNumSelectedMessages() == 0 || target == "news")
          return false;   // else fall thru
      case "cmd_reply":
      case "button_reply":
      case "cmd_replyList":
      case "cmd_replyGroup":
      case "cmd_replySender":
      case "cmd_replyall":
      case "button_replyall":
      case "cmd_replySenderAndGroup":
      case "cmd_replyAllRecipients":
      case "cmd_forward":
      case "button_forward":
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_editAsNew":
      case "cmd_editDraftMsg":
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
      case "cmd_openMessage":
      case "button_print":
      case "cmd_print":
      case "cmd_viewPageSource":
      case "cmd_reload":
      case "cmd_applyFiltersToSelection":
        if (command == "cmd_applyFiltersToSelection")
        {
          var whichText = "valueMessage";
          if (GetNumSelectedMessages() > 1)
            whichText = "valueSelection";
          goSetMenuValue(command, whichText);
          goSetAccessKey(command, whichText + "AccessKey");
        }
        if (GetNumSelectedMessages() > 0)
        {
          if (gDBView)
          {
            gDBView.getCommandStatus(nsMsgViewCommandType.cmdRequiringMsgBody, enabled, checkStatus);
            return enabled.value;
          }
        }
        return false;
      case "cmd_printpreview":
        if ( GetNumSelectedMessages() == 1 && gDBView)
        {
           gDBView.getCommandStatus(nsMsgViewCommandType.cmdRequiringMsgBody, enabled, checkStatus);
           return enabled.value;
        }
        return false;
      case "cmd_printSetup":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
        return true;
      case "cmd_markAsFlagged":
      case "button_file":
        return GetNumSelectedMessages() > 0;
      case "cmd_archive":
        return gFolderDisplay.canArchiveSelectedMessages;
      case "cmd_markAsJunk":
      case "cmd_markAsNotJunk":
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.junk, enabled, checkStatus);
        return enabled.value;
      case "cmd_recalculateJunkScore":
        // We're going to take a conservative position here, because we really
        // don't want people running junk controls on folders that are not
        // enabled for junk. The junk type picks up possible dummy message headers,
        // while the runJunkControls will prevent running on XF virtual folders.
        if (gDBView)
        {
          gDBView.getCommandStatus(nsMsgViewCommandType.runJunkControls, enabled, checkStatus);
          if (enabled.value)
            gDBView.getCommandStatus(nsMsgViewCommandType.junk, enabled, checkStatus);
        }
        return enabled.value;
      case "cmd_markAsShowRemote":
        return (GetNumSelectedMessages() > 0 && checkMsgHdrPropertyIsNot("remoteContentPolicy", kAllowRemoteContent));
      case "cmd_markAsNotPhish":
        return (GetNumSelectedMessages() > 0 && checkMsgHdrPropertyIsNot("notAPhishMessage", kNotAPhishMessage));
      case "cmd_displayMsgFilters":
        return MailServices.accounts.accounts.length > 0;
      case "cmd_applyFilters":
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.applyFilters, enabled, checkStatus);
        return enabled.value;
      case "cmd_runJunkControls":
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.runJunkControls, enabled, checkStatus);
        return enabled.value;
      case "cmd_deleteJunk":
        if (gDBView)
          gDBView.getCommandStatus(nsMsgViewCommandType.deleteJunk, enabled, checkStatus);
        return enabled.value;
      case "button_mark":
      case "cmd_markThreadAsRead":
        return GetNumSelectedMessages() > 0;
      case "cmd_markAsRead":
        return CanMarkMsgAsRead(true);
      case "cmd_markAsUnread":
        return CanMarkMsgAsRead(false);
      case "button_next":
        return IsViewNavigationItemEnabled();
      case "cmd_nextMsg":
      case "cmd_nextUnreadMsg":
      case "cmd_nextUnreadThread":
      case "cmd_previousMsg":
      case "cmd_previousUnreadMsg":
        return IsViewNavigationItemEnabled();
      case "button_goBack":
      case "cmd_goBack":
        return gDBView && gDBView.navigateStatus(nsMsgNavigationType.back);
      case "button_goForward":
      case "cmd_goForward":
        return gDBView && gDBView.navigateStatus(nsMsgNavigationType.forward);
      case "cmd_goStartPage":
        return Services.prefs.getBoolPref("mailnews.start_page.enabled") && !IsMessagePaneCollapsed();
      case "cmd_markAllRead":
        return IsFolderSelected() && gDBView && gDBView.msgFolder.getNumUnread(false) > 0;
      case "cmd_markReadByDate":
        return IsFolderSelected();
      case "cmd_find":
      case "cmd_findNext":
      case "cmd_findPrev":
        return IsMessageDisplayedInMessagePane();
        break;
      case "button_search":
      case "cmd_search":
        return MailServices.accounts.accounts.length > 0;
      case "cmd_selectAll":
      case "cmd_selectFlagged":
        return !!gDBView;
      // these are enabled on when we are in threaded mode
      case "cmd_selectThread":
        if (GetNumSelectedMessages() <= 0) return false;
      case "cmd_expandAllThreads":
      case "cmd_collapseAllThreads":
        return gDBView && (gDBView.viewFlags & nsMsgViewFlagsType.kThreadedDisplay);
        break;
      case "cmd_nextFlaggedMsg":
      case "cmd_previousFlaggedMsg":
        return IsViewNavigationItemEnabled();
      case "cmd_viewAllMsgs":
      case "cmd_viewUnreadMsgs":
      case "cmd_viewIgnoredThreads":
        return gDBView;
      case "cmd_viewThreadsWithUnread":
      case "cmd_viewWatchedThreadsWithUnread":
        return gDBView && !(GetSelectedMsgFolders()[0].flags &
                            Ci.nsMsgFolderFlags.Virtual);
      case "cmd_stop":
        return true;
      case "cmd_undo":
      case "cmd_redo":
          return SetupUndoRedoCommand(command);
      case "cmd_renameFolder":
      {
        let folders = GetSelectedMsgFolders();
        return folders.length == 1 && folders[0].canRename &&
               folders[0].isCommandEnabled("cmd_renameFolder");
      }
      case "cmd_sendUnsentMsgs":
        return IsSendUnsentMsgsEnabled(null);
      case "cmd_subscribe":
        return IsSubscribeEnabled();
      case "cmd_properties":
        return IsPropertiesEnabled(command);
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
        return IsGetNewMessagesEnabled();
      case "cmd_getNextNMessages":
        return IsGetNextNMessagesEnabled();
      case "cmd_emptyTrash":
      {
        let folder = GetSelectedMsgFolders()[0];
        return folder && folder.server.canEmptyTrashOnExit ?
                         IsMailFolderSelected() : false;
      }
      case "cmd_compactFolder":
      {
        let folders = GetSelectedMsgFolders();
        let canCompactAll = function canCompactAll(folder) {
          return folder.server.canCompactFoldersOnServer &&
                 !folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
                 folder.isCommandEnabled("cmd_compactFolder");
        }
        return folders && folders.every(canCompactAll);
      }
      case "cmd_setFolderCharset":
        return IsFolderCharsetEnabled();
      case "cmd_downloadFlagged":
        return !Services.io.offline;
      case "cmd_downloadSelected":
        return IsFolderSelected() && !Services.io.offline &&
               GetNumSelectedMessages() > 0;
      case "cmd_synchronizeOffline":
        return !Services.io.offline;
      case "cmd_settingsOffline":
        return IsAccountOfflineEnabled();
      default:
        return false;
    }
    return false;
  },

  doCommand: function(command)
  {
    // if the user invoked a key short cut then it is possible that we got here for a command which is
    // really disabled. kick out if the command should be disabled.
    if (!this.isCommandEnabled(command))
      return;

    switch (command)
    {
      case "button_getNewMessages":
      case "cmd_getNewMessages":
        MsgGetMessage();
        break;
      case "cmd_getMsgsForAuthAccounts":
        MsgGetMessagesForAllAuthenticatedAccounts();
        break;
      case "cmd_getNextNMessages":
        MsgGetNextNMessages();
        break;
      case "cmd_archive":
        MsgArchiveSelectedMessages(null);
        break;
      case "cmd_reply":
        MsgReplyMessage(null);
        break;
      case "cmd_replyList":
        MsgReplyList(null);
        break;
      case "cmd_replyGroup":
        MsgReplyGroup(null);
        break;
      case "cmd_replySender":
        MsgReplySender(null);
        break;
      case "cmd_replyall":
        MsgReplyToAllMessage(null);
        break;
      case "cmd_replySenderAndGroup":
        MsgReplyToSenderAndGroup(null);
        break;
      case "cmd_replyAllRecipients":
        MsgReplyToAllRecipients(null);
        break;
      case "cmd_forward":
        MsgForwardMessage(null);
        break;
      case "cmd_forwardInline":
        MsgForwardAsInline(null);
        break;
      case "cmd_forwardAttachment":
        MsgForwardAsAttachment(null);
        break;
      case "cmd_editAsNew":
        MsgEditMessageAsNew(null);
        break;
      case "cmd_editDraftMsg":
        MsgEditDraftMessage(null);
        break;
      case "cmd_newMsgFromTemplate":
        MsgNewMessageFromTemplate(null);
        break;
      case "cmd_editTemplateMsg":
        MsgEditTemplateMessage(null);
        break;
      case "cmd_createFilterFromMenu":
        MsgCreateFilter();
        break;
      case "cmd_createFilterFromPopup":
        CreateFilter(document.popupNode);
        break;
      case "cmd_delete":
      case "button_delete":
        MsgDeleteMessage(false);
        UpdateDeleteToolbarButton(false);
        break;
      case "cmd_shiftDelete":
      case "button_shiftDelete":
        MsgDeleteMessage(true);
        UpdateDeleteToolbarButton(false);
        break;
      case "cmd_cancel":
        let message = gFolderDisplay.selectedMessage;
        message.folder.QueryInterface(Ci.nsIMsgNewsFolder)
                      .cancelMessage(message, msgWindow);
        break;
      case "cmd_killThread":
        /* kill thread kills the thread and then does a next unread */
        GoNextMessage(nsMsgNavigationType.toggleThreadKilled, true);
        break;
      case "cmd_killSubthread":
        GoNextMessage(nsMsgNavigationType.toggleSubthreadKilled, true);
        break;
      case "cmd_watchThread":
        gDBView.doCommand(nsMsgViewCommandType.toggleThreadWatched);
        break;
      case "button_next":
      case "cmd_nextUnreadMsg":
        GoNextMessage(nsMsgNavigationType.nextUnreadMessage, true);
        break;
      case "cmd_nextUnreadThread":
        GoNextMessage(nsMsgNavigationType.nextUnreadThread, true);
        break;
      case "cmd_nextMsg":
        GoNextMessage(nsMsgNavigationType.nextMessage, false);
        break;
      case "cmd_nextFlaggedMsg":
        GoNextMessage(nsMsgNavigationType.nextFlagged, true);
        break;
      case "cmd_previousMsg":
        GoNextMessage(nsMsgNavigationType.previousMessage, false);
        break;
      case "cmd_previousUnreadMsg":
        GoNextMessage(nsMsgNavigationType.previousUnreadMessage, true);
        break;
      case "cmd_previousFlaggedMsg":
        GoNextMessage(nsMsgNavigationType.previousFlagged, true);
        break;
      case "button_goForward":
      case "cmd_goForward":
        GoNextMessage(nsMsgNavigationType.forward, true);
        break;
      case "button_goBack":
      case "cmd_goBack":
        GoNextMessage(nsMsgNavigationType.back, true);
        break;
      case "cmd_goStartPage":
        HideMessageHeaderPane();
        loadStartPage();
        break;
      case "cmd_viewAllMsgs":
      case "cmd_viewThreadsWithUnread":
      case "cmd_viewWatchedThreadsWithUnread":
      case "cmd_viewUnreadMsgs":
      case "cmd_viewIgnoredThreads":
        SwitchView(command);
        break;
      case "cmd_undo":
        messenger.undo(msgWindow);
        break;
      case "cmd_redo":
        messenger.redo(msgWindow);
        break;
      case "cmd_expandAllThreads":
                gDBView.doCommand(nsMsgViewCommandType.expandAll);
        break;
      case "cmd_collapseAllThreads":
                gDBView.doCommand(nsMsgViewCommandType.collapseAll);
        break;
      case "cmd_renameFolder":
        gFolderTreeController.renameFolder();
        return;
      case "cmd_sendUnsentMsgs":
        MsgSendUnsentMsgs();
        return;
      case "cmd_subscribe":
        MsgSubscribe();
        return;
      case "cmd_openMessage":
        MsgOpenSelectedMessages();
        return;
      case "cmd_printSetup":
        PrintUtils.showPageSetup();
        return;
      case "cmd_print":
        PrintEnginePrint();
        return;
      case "cmd_printpreview":
        PrintEnginePrintPreview();
        return;
      case "cmd_saveAsFile":
        MsgSaveAsFile();
        return;
      case "cmd_saveAsTemplate":
        MsgSaveAsTemplate();
        return;
      case "cmd_viewPageSource":
        MsgViewPageSource();
        return;
      case "cmd_setFolderCharset":
        gFolderTreeController.editFolder();
        return;
      case "cmd_reload":
        ReloadMessage();
        return;
      case "cmd_find":
        MsgFind();
        return;
      case "cmd_findNext":
        MsgFindAgain(false);
        return;
      case "cmd_findPrev":
        MsgFindAgain(true);
        return;
      case "cmd_properties":
        gFolderTreeController.editFolder();
        return;
      case "button_search":
      case "cmd_search":
        MsgSearchMessages();
        return;
      case "button_mark":
        MsgMarkMsgAsRead();
        return;
      case "cmd_markAsRead":
        MsgMarkMsgAsRead(true);
        return;
      case "cmd_markAsUnread":
        MsgMarkMsgAsRead(false);
        return;
      case "cmd_markThreadAsRead":
        MsgMarkThreadAsRead();
        return;
      case "cmd_markAllRead":
        gDBView.doCommand(nsMsgViewCommandType.markAllRead);
        return;
      case "cmd_markReadByDate":
        MsgMarkReadByDate();
        return;
      case "button_junk":
        MsgJunk();
        return;
      case "cmd_stop":
        msgWindow.StopUrls();
        return;
      case "cmd_markAsFlagged":
        MsgMarkAsFlagged();
        return;
      case "cmd_viewAllHeader":
        MsgViewAllHeaders();
        return;
      case "cmd_viewNormalHeader":
        MsgViewNormalHeaders();
        return;
      case "cmd_markAsJunk":
        JunkSelectedMessages(true);
        return;
      case "cmd_markAsNotJunk":
        JunkSelectedMessages(false);
        return;
      case "cmd_recalculateJunkScore":
        analyzeMessagesForJunk();
        return;
      case "cmd_markAsShowRemote":
        LoadMsgWithRemoteContent();
        return;
      case "cmd_markAsNotPhish":
        MsgIsNotAScam();
        return;
      case "cmd_displayMsgFilters":
        MsgFilters(null, null);
        return;
      case "cmd_applyFiltersToSelection":
        MsgApplyFiltersToSelection();
        return;
      case "cmd_applyFilters":
        MsgApplyFilters(null);
        return;
      case "cmd_runJunkControls":
        filterFolderForJunk();
        return;
      case "cmd_deleteJunk":
        deleteJunkInFolder();
        return;
      case "cmd_emptyTrash":
        gFolderTreeController.emptyTrash();
        return;
      case "cmd_compactFolder":
        gFolderTreeController.compactAllFoldersForAccount();
        return;
      case "cmd_downloadFlagged":
        MsgDownloadFlagged();
        break;
      case "cmd_downloadSelected":
        MsgDownloadSelected();
        break;
      case "cmd_synchronizeOffline":
        MsgSynchronizeOffline();
        break;
      case "cmd_settingsOffline":
        MsgSettingsOffline();
        break;
      case "cmd_selectAll":
        // move the focus so the user can delete the newly selected messages, not the folder
        SetFocusThreadPane();
        // if in threaded mode, the view will expand all before selecting all
        gDBView.doCommand(nsMsgViewCommandType.selectAll)
        if (gDBView.numSelected != 1) {
          setTitleFromFolder(gDBView.msgFolder,null);
          ClearMessagePane();
        }
        break;
      case "cmd_selectThread":
        gDBView.doCommand(nsMsgViewCommandType.selectThread);
        break;
      case "cmd_selectFlagged":
        gDBView.doCommand(nsMsgViewCommandType.selectFlagged);
        break;
    }
  },

  onEvent: function(event)
  {
    // on blur events set the menu item texts back to the normal values
    if ( event == 'blur' )
    {
      goSetMenuValue('cmd_undo', 'valueDefault');
      goSetMenuValue('cmd_redo', 'valueDefault');
    }
  }
};

function MsgCloseTabOrWindow()
{
  var tabmail = GetTabMail();
  if (tabmail.tabInfo.length > 1)
    tabmail.removeCurrentTab();
  else
    window.close();
}

function GetNumSelectedMessages()
{
  return gDBView ? gDBView.numSelected : 0;
}

var gLastFocusedElement=null;

function FocusRingUpdate_Mail()
{
  // If the focusedElement is null, we're here on a blur.
  // nsFocusController::Blur() calls nsFocusController::SetFocusedElement(null),
  // which will update any commands listening for "focus".
  // we really only care about nsFocusController::Focus() happens,
  // which calls nsFocusController::SetFocusedElement(element)
  var currentFocusedElement = gFolderDisplay.focusedPane;

  if (currentFocusedElement != gLastFocusedElement) {
    if (currentFocusedElement)
      currentFocusedElement.setAttribute("focusring", "true");

    if (gLastFocusedElement)
      gLastFocusedElement.removeAttribute("focusring");

    gLastFocusedElement = currentFocusedElement;

    // since we just changed the pane with focus we need to update the toolbar to reflect this
    // XXX TODO
    // can we optimize
    // and just update cmd_delete and button_delete?
    UpdateMailToolbar("focus");
  }
}

function SetupCommandUpdateHandlers()
{
  // folder pane
  var widget = document.getElementById("folderTree");
  if (widget)
    widget.controllers.appendController(FolderPaneController);
}

// Called from <msgMail3PaneWindow.js>.
function UnloadCommandUpdateHandlers()
{
  var widget = document.getElementById("folderTree");
  if (widget)
    widget.controllers.removeController(FolderPaneController);
}

function IsSendUnsentMsgsEnabled(folderResource)
{
  var msgSendLater =
    Cc["@mozilla.org/messengercompose/sendlater;1"]
      .getService(Ci.nsIMsgSendLater);

  // If we're currently sending unsent msgs, disable this cmd.
  if (msgSendLater.sendingMessages)
    return false;

  if (folderResource &&
      folderResource instanceof Ci.nsIMsgFolder) {
    // If unsentMsgsFolder is non-null, it is the "Outbox" folder.
    // We're here because we've done a right click on the "Outbox"
    // folder (context menu), so we can use the folder and return true/false
    // straight away.
    return folderResource.getTotalMessages(false) > 0;
  }

  // Otherwise, we don't know where we are, so use the current identity and
  // find out if we have messages or not via that.
  let identity = null;
  let folders = GetSelectedMsgFolders();
  if (folders.length > 0)
    identity = getIdentityForServer(folders[0].server);

  if (!identity) {
    let defaultAccount = MailServices.accounts.defaultAccount;
    if (defaultAccount)
      identity = defaultAccount.defaultIdentity;

    if (!identity)
      return false;
  }

  return msgSendLater.hasUnsentMessages(identity);
}

/**
 * Determine whether there exists any server for which to show the Subscribe dialog.
 */
function IsSubscribeEnabled()
{
  // If there are any IMAP or News servers, we can show the dialog any time and
  // it will properly show those.
  for (let server of accountManager.allServers) {
    if (server.type == "imap" || server.type == "nntp")
      return true;
  }

  // RSS accounts use a separate Subscribe dialog that we can only show when
  // such an account is selected.
  let preselectedFolder = GetFirstSelectedMsgFolder();
  if (preselectedFolder && preselectedFolder.server.type == "rss")
    return true;

  return false;
}

function IsFolderCharsetEnabled()
{
  return IsFolderSelected();
}

function IsPropertiesEnabled(command)
{
  let folders = GetSelectedMsgFolders();
  if (!folders.length)
    return false;

  let folder = folders[0];
  // When servers are selected, it should be "Edit | Properties...".
  if (folder.isServer) {
    goSetMenuValue(command, "valueGeneric");
  } else if (folder.server.type == "nntp" &&
             !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    goSetMenuValue(command, "valueNewsgroup");
  } else {
    goSetMenuValue(command, "valueFolder");
  }

  return folders.length == 1;
}

function IsViewNavigationItemEnabled()
{
  return IsFolderSelected();
}

function IsFolderSelected()
{
  let folders = GetSelectedMsgFolders();
  return folders.length == 1 && !folders[0].isServer;
}

function IsMessageDisplayedInMessagePane()
{
  return (!IsMessagePaneCollapsed() && (GetNumSelectedMessages() > 0));
}

function SetFocusThreadPaneIfNotOnMessagePane()
{
  var focusedElement = gFolderDisplay.focusedPane;

  if((focusedElement != GetThreadTree()) &&
     (focusedElement != GetMessagePane()))
     SetFocusThreadPane();
}

function SwitchPaneFocus(event)
{
  var folderTree = document.getElementById("folderTree");
  var threadTree = GetThreadTree();
  var messagePane = GetMessagePane();

  var folderPaneCollapsed = document.getElementById("folderPaneBox").collapsed;

  // Although internally this is actually a four-pane window, it is presented as
  // a three-pane -- the search pane is more of a toolbar.  So, shift among the
  // three main panes.

  var focusedElement = gFolderDisplay.focusedPane;
  if (focusedElement == null)       // focus not on one of the main three panes?
    focusedElement = threadTree;    // treat as if on thread tree

  if (event && event.shiftKey)
  {
    // Reverse traversal: Message -> Thread -> Folder -> Message
    if (focusedElement == threadTree && !folderPaneCollapsed)
      folderTree.focus();
    else if (focusedElement != messagePane && !IsMessagePaneCollapsed())
      SetFocusMessagePane();
    else
      threadTree.focus();
  }
  else
  {
    // Forward traversal: Folder -> Thread -> Message -> Folder
    if (focusedElement == threadTree && !IsMessagePaneCollapsed())
      SetFocusMessagePane();
    else if (focusedElement != folderTree && !folderPaneCollapsed)
      folderTree.focus();
    else
      threadTree.focus();
  }
}

function SetFocusThreadPane()
{
  var threadTree = GetThreadTree();
  threadTree.focus();
}

function SetFocusMessagePane()
{
  // XXX hack: to clear the focus on the previous element first focus
  // on the message pane element then focus on the main content window
  GetMessagePane().focus();
  GetMessagePaneFrame().focus();
}

//
// This function checks if the configured junk mail can be renamed or deleted.
//
function CanRenameDeleteJunkMail(aFolderUri)
{
  if (!aFolderUri)
    return false;

  // Go through junk mail settings for all servers and see if the folder is set/used by anyone.
  try
  {
    var allServers = accountManager.allServers;

    for (var i = 0; i < allServers.length; i++)
    {
      var currentServer =
        allServers.queryElementAt(i, Ci.nsIMsgIncomingServer);
      var settings = currentServer.spamSettings;
      // If junk mail control or move junk mail to folder option is disabled then
      // allow the folder to be removed/renamed since the folder is not used in this case.
      if (!settings.level || !settings.moveOnSpam)
        continue;
      if (settings.spamFolderURI == aFolderUri)
        return false;
    }
  }
  catch(ex)
  {
      dump("Can't get all servers\n");
  }
  return true;
}

/** Check if this is a folder the user is allowed to delete. */
function CanDeleteFolder(folder) {
  if (folder.isServer)
    return false;

  var specialFolder = FolderUtils.getSpecialFolderString(folder);

  if (specialFolder == "Inbox" || specialFolder == "Trash" ||
      specialFolder == "Drafts" || specialFolder == "Sent" ||
      specialFolder == "Templates" || specialFolder == "Outbox" ||
      (specialFolder == "Junk" && !CanRenameDeleteJunkMail(folder.URI)))
    return false;

  return true;
}
