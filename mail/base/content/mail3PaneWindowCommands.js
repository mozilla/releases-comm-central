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
/* import-globals-from mailCore.js */
/* import-globals-from mailWindow.js */
/* import-globals-from utilityOverlay.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.importESModule(
  "resource://gre/modules/PluralForm.sys.mjs"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailUtils",
  "resource:///modules/MailUtils.jsm"
);

// DefaultController object (handles commands when one of the trees does not have focus)
var DefaultController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_newMessage":
      case "cmd_undoCloseTab":
      case "cmd_undo":
      case "cmd_redo":
      case "cmd_sendUnsentMsgs":
      case "cmd_subscribe":
      case "button_getNewMessages":
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
      case "cmd_getNextNMessages":
      case "cmd_settingsOffline":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_stop":
      case "cmd_chat":
        return true;
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
    if (document.getElementById("tabmail").globalOverlay) {
      return false;
    }
    switch (command) {
      case "cmd_newMessage":
        return CanComposeMessages();
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
        return true;
      case "cmd_undoCloseTab":
        return document.getElementById("tabmail").recentlyClosedTabs.length > 0;
      case "cmd_stop":
        return window.MsgStatusFeedback?._meteorsSpinning;
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
      case "cmd_stop":
        msgWindow.StopUrls();
        return;
      case "cmd_viewAllHeader":
        MsgViewAllHeaders();
        return;
      case "cmd_viewNormalHeader":
        MsgViewNormalHeaders();
        return;
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

  onEvent(event) {
    // on blur events set the menu item texts back to the normal values
    if (event == "blur") {
      goSetMenuValue("cmd_undo", "valueDefault");
      goSetMenuValue("cmd_redo", "valueDefault");
    }
  },
};
// This is the highest priority controller. It's followed by
// tabmail.tabController and calendarController, then whatever Gecko adds.
window.controllers.insertControllerAt(0, DefaultController);

function CloseTabOrWindow() {
  let tabmail = document.getElementById("tabmail");
  if (tabmail.globalOverlay) {
    return;
  }
  if (tabmail.tabInfo.length == 1) {
    if (Services.prefs.getBoolPref("mail.tabs.closeWindowWithLastTab")) {
      window.close();
    }
  } else {
    tabmail.removeCurrentTab();
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

/**
 * Cycle through the various panes in the 3pane window.
 *
 * @param {Event} event - The keypress DOMEvent.
 */
function SwitchPaneFocus(event) {
  let tabmail = document.getElementById("tabmail");
  // Should not move the focus around when the entire window is covered with
  // something else.
  if (tabmail.globalOverlay) {
    return;
  }
  // First, build an array of panes to cycle through based on our current state.
  // This will usually be something like [threadPane, messagePane, folderPane].
  let panes = [];
  let focusedElement = document.activeElement;

  let spacesElement = !gSpacesToolbar.isHidden
    ? gSpacesToolbar.focusButton
    : document.getElementById("spacesPinnedButton");
  panes.push(spacesElement);

  let toolbar = document.getElementById("unifiedToolbar");
  if (!toolbar.hidden) {
    // Prioritise the search bar, otherwise use the first available button.
    let toolbarElement =
      toolbar.querySelector("global-search-bar") ||
      toolbar.querySelector("li:not([hidden]) button, #button-appmenu");
    if (toolbarElement) {
      panes.push(toolbarElement);
      if (toolbar.matches(":focus-within") && focusedElement != spacesElement) {
        focusedElement = toolbarElement;
      }
    }
  }

  let { currentTabInfo } = tabmail;
  switch (currentTabInfo.mode.name) {
    case "mail3PaneTab": {
      let {
        chromeBrowser,
        folderPaneVisible,
        messagePaneVisible,
      } = currentTabInfo;
      let { contentWindow, contentDocument } = chromeBrowser;
      let {
        folderTree,
        threadTree,
        webBrowser,
        messageBrowser,
        multiMessageBrowser,
        accountCentralBrowser,
      } = contentWindow;

      if (folderPaneVisible) {
        panes.push(folderTree);
      }

      if (accountCentralBrowser.hidden) {
        panes.push(threadTree.table.body);
      } else {
        panes.push(accountCentralBrowser);
      }

      if (messagePaneVisible) {
        if (!webBrowser.hidden) {
          panes.push(webBrowser);
        } else if (!messageBrowser.hidden) {
          panes.push(messageBrowser.contentWindow.getMessagePaneBrowser());
        } else if (!multiMessageBrowser.hidden) {
          panes.push(multiMessageBrowser);
        }
      }

      if (focusedElement == chromeBrowser) {
        focusedElement = contentDocument.activeElement;
        if (focusedElement == messageBrowser) {
          focusedElement = messageBrowser.contentWindow.getMessagePaneBrowser();
        }
      }
      break;
    }
    case "mailMessageTab": {
      let { content } = currentTabInfo.chromeBrowser.contentWindow;
      panes.push(content);
      if (focusedElement == currentTabInfo.chromeBrowser) {
        focusedElement = content;
      }
      break;
    }
    case "addressBookTab": {
      let {
        booksList,
        cardsPane,
        detailsPane,
      } = currentTabInfo.browser.contentWindow;

      if (detailsPane.isEditing) {
        panes.push(currentTabInfo.browser);
      } else {
        let targets = [
          booksList,
          cardsPane.searchInput,
          cardsPane.cardsList.table.body,
        ];
        if (!detailsPane.node.hidden && !detailsPane.editButton.hidden) {
          targets.push(detailsPane.editButton);
        }

        if (focusedElement == currentTabInfo.browser) {
          focusedElement = targets.find(t => t.matches(":focus-within"));
        }
        panes.push(...targets);
      }
      break;
    }
    default:
      if (currentTabInfo.browser) {
        panes.push(currentTabInfo.browser);
      }
      break;
  }

  // Find our focused element in the array.
  let focusedElementIndex = panes.indexOf(focusedElement);
  if (event.shiftKey) {
    focusedElementIndex--;
    if (focusedElementIndex < 0) {
      focusedElementIndex = panes.length - 1;
    }
  } else if (focusedElementIndex == -1) {
    focusedElementIndex = 0;
  } else {
    focusedElementIndex++;
    if (focusedElementIndex == panes.length) {
      focusedElementIndex = 0;
    }
  }

  if (panes[focusedElementIndex]) {
    panes[focusedElementIndex].focus();
  }
}

// Override F6 handling for remote browsers, and use our own logic to
// determine the element to focus.
addEventListener(
  "keypress",
  function(event) {
    if (event.key == "F6" && Services.focus.focusedElement?.isRemoteBrowser) {
      event.preventDefault();
      SwitchPaneFocus(event);
    }
  },
  true
);
