/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functionality for the main application window (aka the 3pane) usually
 * consisting of folder pane, thread pane and message pane.
 */

/* global MozElements */

/* import-globals-from ../../components/im/content/chat-messenger.js */
/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindow.js */
/* import-globals-from threadPane.js */
/* import-globals-from utilityOverlay.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailUtils",
  "resource:///modules/MailUtils.jsm"
);

// Controller object for folder pane.
var FolderPaneController = {
  get notificationBox() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document
          .getElementById("messenger-notification-footer")
          .append(element);
      });
    }
    return this._notificationBox;
  },
};

function UpdateDeleteLabelsFromFolderCommand(folder, command) {
  if (command != "cmd_delete") {
    return;
  }

  if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    goSetMenuValue(command, "valueFolder");
    goSetAccessKey(command, "valueFolderAccessKey");
  } else if (folder.server.type == "nntp") {
    goSetMenuValue(command, "valueNewsgroup");
    goSetAccessKey(command, "valueNewsgroupAccessKey");
  } else {
    goSetMenuValue(command, "valueFolder");
    goSetAccessKey(command, "valueFolderAccessKey");
  }
}

// DefaultController object (handles commands when one of the trees does not have focus)
var DefaultController = {
  /* eslint-disable complexity */
  supportsCommand(command) {
    switch (command) {
      case "cmd_createFilterFromPopup":
      case "cmd_newMessage":
      case "cmd_cancel":
      case "cmd_undoCloseTab":
      case "cmd_undo":
      case "cmd_redo":
      case "cmd_sendUnsentMsgs":
      case "cmd_subscribe":
      case "button_print":
      case "cmd_print":
      case "cmd_saveAsFile":
      case "cmd_saveAsTemplate":
      case "cmd_reload":
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
      case "cmd_getNextNMessages":
      case "cmd_applyFiltersToSelection":
      case "cmd_applyFilters":
      case "cmd_runJunkControls":
      case "cmd_deleteJunk":
      case "button_file":
      case "cmd_settingsOffline":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_stop":
      case "cmd_chat":
        return true;
      case "cmd_downloadFlagged":
      case "cmd_downloadSelected":
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      case "cmd_joinChat":
      case "cmd_addChatBuddy":
      case "cmd_chatStatus":
        return !!chatHandler;

      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_cancel":
        return (
          gFolderDisplay.selectedCount == 1 &&
          gFolderDisplay.selectedMessageIsNews
        );
      case "cmd_createFilterFromPopup":
        return (
          gFolderDisplay.selectedCount == 1 &&
          gFolderDisplay.selectedMessage.folder &&
          gFolderDisplay.selectedMessage.folder.server.canHaveFilters
        );
      case "cmd_saveAsFile":
        return gFolderDisplay.selectedCount > 0;
      case "cmd_saveAsTemplate":
        if (gFolderDisplay.selectedCount > 1) {
          return false;
        } // else fall through
      case "button_print":
      case "cmd_reload":
      case "cmd_applyFiltersToSelection":
        if (!CanComposeMessages()) {
          return false;
        }

        let numSelected = gFolderDisplay.selectedCount;
        if (command == "cmd_applyFiltersToSelection") {
          var whichText = "valueMessage";
          if (numSelected > 1) {
            whichText = "valueSelection";
          }
          goSetMenuValue(command, whichText);
          goSetAccessKey(command, whichText + "AccessKey");
        }
        if (numSelected > 0) {
          if (
            !gFolderDisplay.getCommandStatus(
              Ci.nsMsgViewCommandType.cmdRequiringMsgBody
            )
          ) {
            return false;
          }

          // Check if we have a collapsed thread selected and are summarizing it.
          // If so, selectedIndices.length won't match numSelected. Also check
          // that we're not displaying a message, which handles the case
          // where we failed to summarize the selection and fell back to
          // displaying a message.
          if (
            gFolderDisplay.selectedIndices.length != numSelected &&
            command != "cmd_applyFiltersToSelection" &&
            gDBView &&
            gDBView.currentlyDisplayedMessage == nsMsgViewIndex_None
          ) {
            return false;
          }
          return true;
        }
        return false;
      case "cmd_print":
        return gFolderDisplay.selectedCount >= 1;
      case "cmd_newMessage":
        return CanComposeMessages();
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
        return true;
      case "button_file":
        return gFolderDisplay.selectedCount > 0;
      case "cmd_applyFilters":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.applyFilters
        );
      case "cmd_runJunkControls":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.runJunkControls
        );
      case "cmd_deleteJunk":
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.deleteJunk
        );
      case "cmd_undoCloseTab":
        return document.getElementById("tabmail").recentlyClosedTabs.length > 0;
      case "cmd_stop":
        return window.MsgStatusFeedback._meteorsSpinning;
      case "cmd_undo":
      case "cmd_redo":
        return SetupUndoRedoCommand(command);
      case "cmd_sendUnsentMsgs":
        return IsSendUnsentMsgsEnabled(null);
      case "cmd_subscribe":
        return IsSubscribeEnabled();
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
        return IsGetNewMessagesEnabled();
      case "cmd_getNextNMessages":
        return IsGetNextNMessagesEnabled();
      case "cmd_downloadFlagged":
        return IsFolderSelected() && MailOfflineMgr.isOnline();
      case "cmd_downloadSelected":
        return (
          IsFolderSelected() &&
          MailOfflineMgr.isOnline() &&
          gFolderDisplay.selectedCount > 0
        );
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      case "cmd_settingsOffline":
        return IsAccountOfflineEnabled();
      case "cmd_chat":
        return true;
      case "cmd_joinChat":
      case "cmd_addChatBuddy":
      case "cmd_chatStatus":
        return !!chatHandler;
    }
    return false;
  },

  doCommand(command, aTab) {
    // If the user invoked a key short cut then it is possible that we got here
    // for a command which is really disabled. Kick out if the command should be disabled.
    if (!this.isCommandEnabled(command)) {
      return;
    }

    switch (command) {
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
      case "cmd_newMessage":
        MsgNewMessage(null);
        break;
      case "cmd_createFilterFromPopup":
        break; // This does nothing because the createfilter is invoked from the popupnode oncommand.
      case "cmd_cancel":
        let message = gFolderDisplay.selectedMessage;
        message.folder
          .QueryInterface(Ci.nsIMsgNewsFolder)
          .cancelMessage(message, msgWindow);
        break;
      case "cmd_undoCloseTab":
        document.getElementById("tabmail").undoCloseTab();
        break;
      case "cmd_undo":
        messenger.undo(msgWindow);
        break;
      case "cmd_redo":
        messenger.redo(msgWindow);
        break;
      case "cmd_sendUnsentMsgs":
        // if offline, prompt for sendUnsentMessages
        if (MailOfflineMgr.isOnline()) {
          SendUnsentMessages();
        } else {
          MailOfflineMgr.goOnlineToSendMessages(msgWindow);
        }
        return;
      case "cmd_subscribe":
        MsgSubscribe();
        return;
      case "cmd_print":
        PrintSelectedMessages();
        return;
      case "cmd_saveAsFile":
        MsgSaveAsFile();
        return;
      case "cmd_saveAsTemplate":
        MsgSaveAsTemplate();
        return;
      case "cmd_reload":
        ReloadMessage();
        return;
      case "cmd_stop":
        msgWindow.StopUrls();
        return;
      case "cmd_viewAllHeader":
        MsgViewAllHeaders();
        return;
      case "cmd_viewNormalHeader":
        MsgViewNormalHeaders();
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
        // Even though deleteJunkInFolder returns a value, we don't want to let
        // it get past us
        deleteJunkInFolder();
        return;
      case "cmd_downloadFlagged":
        gFolderDisplay.doCommand(
          Ci.nsMsgViewCommandType.downloadFlaggedForOffline
        );
        break;
      case "cmd_downloadSelected":
        gFolderDisplay.doCommand(
          Ci.nsMsgViewCommandType.downloadSelectedForOffline
        );
        break;
      case "cmd_synchronizeOffline":
        MsgSynchronizeOffline();
        break;
      case "cmd_settingsOffline":
        MailOfflineMgr.openOfflineAccountSettings();
        break;
      case "cmd_chat":
        showChatTab();
        break;
    }
  },
  /* eslint-enable complexity */

  onEvent(event) {
    // on blur events set the menu item texts back to the normal values
    if (event == "blur") {
      goSetMenuValue("cmd_undo", "valueDefault");
      goSetMenuValue("cmd_redo", "valueDefault");
    }
  },
};

/**
 * Show a notification in the message pane footer, allowing the user to learn
 * more about the ignore thread feature, and also allowing undo ignore thread.
 * @param aMsgs the messages that were ignore
 * @param aSubThread only boolean indicating if it was ignore subthread or
 *                   ignore thread
 */
function ShowIgnoredMessageNotification(aMsgs, aSubthreadOnly) {
  let notifyBox = FolderPaneController.notificationBox;
  notifyBox.removeTransientNotifications(); // don't want to pile these up

  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );

  let buttons = [
    {
      label: bundle.GetStringFromName("learnMoreAboutIgnoreThread"),
      accessKey: bundle.GetStringFromName(
        "learnMoreAboutIgnoreThreadAccessKey"
      ),
      popup: null,
      callback(aNotificationBar, aButton) {
        let url = Services.prefs.getCharPref(
          "mail.ignore_thread.learn_more_url"
        );
        openContentTab(url);
        return true; // keep notification open
      },
    },
    {
      label: bundle.GetStringFromName(
        !aSubthreadOnly ? "undoIgnoreThread" : "undoIgnoreSubthread"
      ),
      accessKey: bundle.GetStringFromName(
        !aSubthreadOnly
          ? "undoIgnoreThreadAccessKey"
          : "undoIgnoreSubthreadAccessKey"
      ),
      isDefault: true,
      popup: null,
      callback(aNotificationBar, aButton) {
        aMsgs.forEach(function(msg) {
          let msgDb = msg.folder.msgDatabase;
          if (aSubthreadOnly) {
            msgDb.MarkHeaderKilled(msg, false, gDBView);
          } else {
            let thread = msgDb.GetThreadContainingMsgHdr(msg);
            msgDb.MarkThreadIgnored(thread, thread.threadKey, false, gDBView);
          }
        });
        return false; // close notification
      },
    },
  ];

  let threadIds = new Set();
  aMsgs.forEach(function(msg) {
    if (!threadIds.has(msg.threadId)) {
      threadIds.add(msg.threadId);
    }
  });
  let nbrOfThreads = threadIds.size;

  if (nbrOfThreads == 1) {
    let ignoredThreadText = bundle.GetStringFromName(
      !aSubthreadOnly ? "ignoredThreadFeedback" : "ignoredSubthreadFeedback"
    );
    let subj = aMsgs[0].mime2DecodedSubject || "";
    if (subj.length > 45) {
      subj = subj.substring(0, 45) + "…";
    }
    let text = ignoredThreadText.replace("#1", subj);

    notifyBox.appendNotification(
      "ignoreThreadInfo",
      {
        label: text,
        priority: notifyBox.PRIORITY_INFO_MEDIUM,
      },
      null,
      buttons
    );
  } else {
    let ignoredThreadText = bundle.GetStringFromName(
      !aSubthreadOnly ? "ignoredThreadsFeedback" : "ignoredSubthreadsFeedback"
    );
    let text = PluralForm.get(nbrOfThreads, ignoredThreadText).replace(
      "#1",
      nbrOfThreads
    );
    notifyBox.appendNotification(
      "ignoreThreadsInfo",
      {
        label: text,
        priority: notifyBox.PRIORITY_INFO_MEDIUM,
      },
      buttons
    );
  }
}

function CloseTabOrWindow() {
  let tabmail = document.getElementById("tabmail");
  if (tabmail.tabInfo.length == 1) {
    if (Services.prefs.getBoolPref("mail.tabs.closeWindowWithLastTab")) {
      window.close();
    }
  } else {
    tabmail.removeCurrentTab();
  }
}

function GetNumSelectedMessages() {
  // This global function is only for mailnews/ compatibility.
  return gFolderDisplay.selectedCount;
}

var gLastFocusedElement = null;

function FocusRingUpdate_Mail() {
  if (!gFolderDisplay) {
    return;
  }

  // if the focusedElement is null, we're here on a blur.
  // nsFocusController::Blur() calls nsFocusController::SetFocusedElement(null),
  // which will update any commands listening for "focus".
  // we really only care about nsFocusController::Focus() happens,
  // which calls nsFocusController::SetFocusedElement(element)
  var currentFocusedElement = gFolderDisplay.focusedPane;

  if (currentFocusedElement != gLastFocusedElement) {
    if (currentFocusedElement) {
      currentFocusedElement.setAttribute("focusring", "true");
    }

    if (gLastFocusedElement) {
      gLastFocusedElement.removeAttribute("focusring");
    }

    gLastFocusedElement = currentFocusedElement;
  }
}

function IsSendUnsentMsgsEnabled(unsentMsgsFolder) {
  // If no account has been configured, there are no messages for sending.
  if (MailServices.accounts.accounts.length == 0) {
    return false;
  }

  var msgSendlater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );

  // If we're currently sending unsent msgs, disable this cmd.
  if (msgSendlater.sendingMessages) {
    return false;
  }

  if (unsentMsgsFolder) {
    // If unsentMsgsFolder is non-null, it is the "Unsent Messages" folder.
    // We're here because we've done a right click on the "Unsent Messages"
    // folder (context menu), so we can use the folder and return true/false
    // straight away.
    return unsentMsgsFolder.getTotalMessages(false) > 0;
  }

  // Otherwise, we don't know where we are, so use the current identity and
  // find out if we have messages or not via that.
  let identity;
  let folders = GetSelectedMsgFolders();
  if (folders.length > 0) {
    [identity] = MailUtils.getIdentityForServer(folders[0].server);
  }

  if (!identity) {
    let defaultAccount = MailServices.accounts.defaultAccount;
    if (defaultAccount) {
      identity = defaultAccount.defaultIdentity;
    }

    if (!identity) {
      return false;
    }
  }

  return msgSendlater.hasUnsentMessages(identity);
}

/**
 * Determine whether there exists any server for which to show the Subscribe dialog.
 */
function IsSubscribeEnabled() {
  // If there are any IMAP or News servers, we can show the dialog any time and
  // it will properly show those.
  for (let server of MailServices.accounts.allServers) {
    if (server.type == "imap" || server.type == "nntp") {
      return true;
    }
  }

  // RSS accounts use a separate Subscribe dialog that we can only show when
  // such an account is selected.
  let preselectedFolder = GetFirstSelectedMsgFolder();
  if (preselectedFolder && preselectedFolder.server.type == "rss") {
    return true;
  }

  return false;
}

function IsFolderCharsetEnabled() {
  return IsFolderSelected();
}

function IsPropertiesEnabled(command) {
  var folders = GetSelectedMsgFolders();
  if (!folders.length) {
    return false;
  }
  var folder = folders[0];

  // when servers are selected it should be "Edit | Properties..."
  if (folder.isServer) {
    goSetMenuValue(command, "valueGeneric");
  } else if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    goSetMenuValue(command, "valueFolder");
  } else {
    goSetMenuValue(
      command,
      isNewsURI(folder.URI) ? "valueNewsgroup" : "valueFolder"
    );
  }

  return folders.length == 1;
}

function IsViewNavigationItemEnabled() {
  return IsFolderSelected();
}

function IsFolderSelected() {
  var folders = GetSelectedMsgFolders();
  return folders.length == 1 && !folders[0].isServer;
}

/**
 * Cycle through the various panes in the 3pane window.
 *
 * @param {Event} event - The keypress DOMEvent.
 */
function SwitchPaneFocus(event) {
  // TODO: If we're going to keep this it should account for other tab types,
  // and somehow get the tabs to do focus cycling themselves. (Address Book
  // already does this.)

  // First, build an array of panes to cycle through based on our current state.
  // This will usually be something like [threadPane, messagePane, folderPane].
  let panes = [];
  let focusedElement;
  let spacesElement = !gSpacesToolbar.isHidden
    ? gSpacesToolbar.focusButton
    : document.getElementById("spacesPinnedButton");

  let { currentTabInfo } = document.getElementById("tabmail");
  if (currentTabInfo.mode.name == "mail3PaneTab") {
    let { browser, folderPaneVisible, messagePaneVisible } = currentTabInfo;
    let {
      document: contentDocument,
      folderTree,
      threadTree,
      webBrowser,
      messageBrowser,
      multiMessageBrowser,
      accountCentralBrowser,
    } = browser.contentWindow;

    panes.push(spacesElement);

    if (folderPaneVisible) {
      panes.push(folderTree);
    }

    if (accountCentralBrowser.hidden) {
      panes.push(threadTree);
    } else {
      panes.push(accountCentralBrowser);
    }

    if (messagePaneVisible) {
      for (let browser of [webBrowser, messageBrowser, multiMessageBrowser]) {
        if (!browser.hidden) {
          panes.push(browser);
        }
      }
    }

    focusedElement = contentDocument.activeElement;
  } else {
    return;
  }

  // Find our focused element in the array. If focus is not on one of the main
  // panes (it's probably on the toolbar), then act as if it's on the thread
  // tree.
  let focusedElementIndex = panes.indexOf(focusedElement);
  if (focusedElementIndex == -1) {
    focusedElementIndex = 0;
  }

  if (event.shiftKey) {
    focusedElementIndex--;
    if (focusedElementIndex == -1) {
      focusedElementIndex = panes.length - 1;
    }
  } else {
    focusedElementIndex++;
    if (focusedElementIndex == panes.length) {
      focusedElementIndex = 0;
    }
  }

  panes[focusedElementIndex].focus();
}

/** Check if this is a folder the user is allowed to delete. */
function CanDeleteFolder(folder) {
  if (folder.isServer) {
    return false;
  }

  var specialFolder = FolderUtils.getSpecialFolderString(folder);

  if (
    specialFolder == "Inbox" ||
    specialFolder == "Trash" ||
    specialFolder == "Drafts" ||
    specialFolder == "Sent" ||
    specialFolder == "Templates" ||
    specialFolder == "Outbox" ||
    (specialFolder == "Junk" &&
      !FolderUtils.canRenameDeleteJunkMail(folder.URI))
  ) {
    return false;
  }

  return true;
}

/** Prints the messages selected in the thread pane. */
async function PrintSelectedMessages() {
  if (gFolderDisplay.selectedCount == 1) {
    if (
      gMessageDisplay.visible &&
      gFolderDisplay.selectedMessage == gMessageDisplay.displayedMessage
    ) {
      // Use the already displayed message and print preview UI if we can.
      let messagePaneBrowser = document.getElementById("messagepane");
      PrintUtils.startPrintWindow(messagePaneBrowser.browsingContext, {});
    } else {
      // Load the only message in a hidden browser, then use the print preview UI.
      let uri = gFolderDisplay.selectedMessageUris[0];
      let messageService = messenger.messageServiceFromURI(uri);
      await PrintUtils.loadPrintBrowser(messageService.getUrlForUri(uri).spec);
      PrintUtils.startPrintWindow(PrintUtils.printBrowser.browsingContext, {});
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

  for (let uri of gFolderDisplay.selectedMessageUris) {
    let messageService = messenger.messageServiceFromURI(uri);
    await PrintUtils.loadPrintBrowser(messageService.getUrlForUri(uri).spec);
    await PrintUtils.printBrowser.browsingContext.print(ps);
  }
}
