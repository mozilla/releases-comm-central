/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// mailContext.js
/* globals mailContextMenu */

// about:3pane and about:message must BOTH provide these:

/* globals CrossFolderNavigation */ // msgViewNavigation.js
/* globals displayMessage */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ConversationOpener: "resource:///modules/ConversationOpener.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MessageArchiver: "resource:///modules/MessageArchiver.jsm",
});

const nsMsgViewIndex_None = 0xffffffff;
const nsMsgKey_None = 0xffffffff;

var gDBView, gFolder, gViewWrapper;

var commandController = {
  _composeCommands: {
    cmd_editDraftMsg: Ci.nsIMsgCompType.Draft,
    cmd_newMsgFromTemplate: Ci.nsIMsgCompType.Template,
    cmd_editTemplateMsg: Ci.nsIMsgCompType.EditTemplate,
    cmd_newMessage: Ci.nsIMsgCompType.New,
    cmd_replyGroup: Ci.nsIMsgCompType.ReplyToGroup,
    cmd_replySender: Ci.nsIMsgCompType.ReplyToSender,
    cmd_replyall: Ci.nsIMsgCompType.ReplyAll,
    cmd_replylist: Ci.nsIMsgCompType.ReplyToList,
    cmd_forwardInline: Ci.nsIMsgCompType.ForwardInline,
    cmd_forwardAttachment: Ci.nsIMsgCompType.ForwardAsAttachment,
    cmd_redirect: Ci.nsIMsgCompType.Redirect,
    cmd_editAsNew: Ci.nsIMsgCompType.EditAsNew,
  },
  _navigationCommands: {
    // TODO: Back and forward are broken because they rely on nsIMessenger.
    cmd_goForward: Ci.nsMsgNavigationType.forward,
    cmd_goBack: Ci.nsMsgNavigationType.back,
    cmd_nextUnreadMsg: Ci.nsMsgNavigationType.nextUnreadMessage,
    cmd_nextUnreadThread: Ci.nsMsgNavigationType.nextUnreadThread,
    cmd_nextMsg: Ci.nsMsgNavigationType.nextMessage,
    cmd_nextFlaggedMsg: Ci.nsMsgNavigationType.nextFlagged,
    cmd_previousMsg: Ci.nsMsgNavigationType.previousMessage,
    cmd_previousUnreadMsg: Ci.nsMsgNavigationType.previousUnreadMessage,
    cmd_previousFlaggedMsg: Ci.nsMsgNavigationType.previousFlagged,
  },
  _viewCommands: {
    cmd_toggleRead: Ci.nsMsgViewCommandType.toggleMessageRead,
    cmd_markAsRead: Ci.nsMsgViewCommandType.markMessagesRead,
    cmd_markAsUnread: Ci.nsMsgViewCommandType.markMessagesUnread,
    cmd_markThreadAsRead: Ci.nsMsgViewCommandType.markThreadRead,
    cmd_markAllRead: Ci.nsMsgViewCommandType.markAllRead,
    cmd_markAsNotJunk: Ci.nsMsgViewCommandType.unjunk,
    cmd_watchThread: Ci.nsMsgViewCommandType.toggleThreadWatched,
  },
  _callbackCommands: {
    cmd_openConversation() {
      new ConversationOpener(window).openConversationForMessages(
        gDBView.getSelectedMsgHdrs()
      );
    },
    cmd_reply(event) {
      if (gFolder?.flags & Ci.nsMsgFolderFlags.Newsgroup) {
        commandController.doCommand("cmd_replyGroup", event);
      } else {
        commandController.doCommand("cmd_replySender", event);
      }
    },
    cmd_forward() {
      if (Services.prefs.getIntPref("mail.forward_message_mode", 0) == 0) {
        commandController.doCommand("cmd_forwardAttachment");
      } else {
        commandController.doCommand("cmd_forwardInline");
      }
    },
    cmd_openMessage(event) {
      MailUtils.displayMessages(
        gDBView.getSelectedMsgHdrs(),
        gViewWrapper,
        window.browsingContext.topChromeWindow.document.getElementById(
          "tabmail"
        )
      );
    },
    cmd_tag() {
      // Does nothing, just here to enable/disable the tags sub-menu.
    },
    cmd_tag1: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 1),
    cmd_tag2: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 2),
    cmd_tag3: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 3),
    cmd_tag4: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 4),
    cmd_tag5: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 5),
    cmd_tag6: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 6),
    cmd_tag7: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 7),
    cmd_tag8: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 8),
    cmd_tag9: mailContextMenu._toggleMessageTagKey.bind(mailContextMenu, 9),
    cmd_addTag() {
      mailContextMenu.addTag();
    },
    cmd_manageTags() {
      window.browsingContext.topChromeWindow.openOptionsDialog(
        "paneGeneral",
        "tagsCategory"
      );
    },
    cmd_removeTags() {
      mailContextMenu.removeAllMessageTags();
    },
    cmd_toggleTag(event) {
      mailContextMenu._toggleMessageTag(
        event.target.value,
        event.target.getAttribute("checked") == "true"
      );
    },
    cmd_markReadByDate() {
      window.browsingContext.topChromeWindow.openDialog(
        "chrome://messenger/content/markByDate.xhtml",
        "",
        "chrome,modal,titlebar,centerscreen",
        gFolder
      );
    },
    cmd_markAsFlagged() {
      gViewWrapper.dbView.doCommand(
        gDBView.hdrForFirstSelectedMessage.isFlagged
          ? Ci.nsMsgViewCommandType.unflagMessages
          : Ci.nsMsgViewCommandType.flagMessages
      );
    },
    cmd_markAsJunk() {
      if (
        Services.prefs.getBoolPref("mailnews.ui.junk.manualMarkAsJunkMarksRead")
      ) {
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.markMessagesRead);
      }
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.junk);
    },
    /**
     * Moves the selected messages to the destination folder.
     *
     * @param {nsIMsgFolder} destFolder - the destination folder
     */
    cmd_moveMessage(destFolder) {
      gViewWrapper.dbView.doCommandWithFolder(
        Ci.nsMsgViewCommandType.moveMessages,
        destFolder
      );
      Services.prefs.setCharPref(
        "mail.last_msg_movecopy_target_uri",
        destFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", true);
    },
    /**
     * Copies the selected messages to the destination folder.
     *
     * @param {nsIMsgFolder} destFolder - the destination folder
     */
    cmd_copyMessage(destFolder) {
      if (window.gMessageURI?.startsWith("file:")) {
        let file = Services.io
          .newURI(window.gMessageURI)
          .QueryInterface(Ci.nsIFileURL).file;
        MailServices.copy.copyFileMessage(
          file,
          destFolder,
          null,
          false,
          Ci.nsMsgMessageFlags.Read,
          "",
          null,
          top.msgWindow
        );
      } else {
        gViewWrapper.dbView.doCommandWithFolder(
          Ci.nsMsgViewCommandType.copyMessages,
          destFolder
        );
      }
      Services.prefs.setCharPref(
        "mail.last_msg_movecopy_target_uri",
        destFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", false);
    },
    cmd_archive() {
      let archiver = new MessageArchiver();
      archiver.archiveMessages(gViewWrapper.dbView.getSelectedMsgHdrs());
    },
    cmd_moveToFolderAgain() {
      let folder = MailUtils.getOrCreateFolder(
        Services.prefs.getStringPref("mail.last_msg_movecopy_target_uri")
      );
      if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
        commandController.doCommand("cmd_moveMessage", folder);
      } else {
        commandController.doCommand("cmd_copyMessage", folder);
      }
    },
    cmd_delete() {
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.markMessagesRead);
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
    },
    cmd_shiftDelete() {
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.deleteNoTrash);
    },
    cmd_createFilterFromMenu() {
      let msgHdr = gDBView.hdrForFirstSelectedMessage;
      let emailAddress = MailServices.headerParser.extractHeaderAddressMailboxes(
        msgHdr.author
      );
      if (emailAddress) {
        top.MsgFilters(emailAddress, msgHdr.folder);
      }
    },
    cmd_killThread() {
      // TODO: show notification (ShowIgnoredMessageNotification)
      commandController._navigate(Ci.nsMsgNavigationType.toggleThreadKilled);
    },
    cmd_killSubthread() {
      // TODO: show notification (ShowIgnoredMessageNotification)
      commandController._navigate(Ci.nsMsgNavigationType.toggleSubthreadKilled);
    },
    cmd_viewPageSource() {
      window.browsingContext.topChromeWindow.ViewPageSource(
        gDBView.getURIsForSelection()
      );
    },
    cmd_saveAsFile() {
      top.SaveAsFile(gDBView.getURIsForSelection());
    },
    cmd_saveAsTemplate() {
      top.SaveAsTemplate(gDBView.getURIsForSelection()[0]);
    },
    cmd_applyFilters() {
      let curFilterList = gFolder.getFilterList(top.msgWindow);
      // Create a new filter list and copy over the enabled filters to it.
      // We do this instead of having the filter after the fact code ignore
      // disabled filters because the Filter Dialog filter after the fact
      // code would have to clone filters to allow disabled filters to run,
      // and we don't support cloning filters currently.
      let tempFilterList = MailServices.filters.getTempFilterList(gFolder);
      let numFilters = curFilterList.filterCount;
      // Make sure the temp filter list uses the same log stream.
      tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
      tempFilterList.logStream = curFilterList.logStream;
      let newFilterIndex = 0;
      for (let i = 0; i < numFilters; i++) {
        let curFilter = curFilterList.getFilterAt(i);
        // Only add enabled, UI visible filters that are in the manual context.
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
        [gFolder],
        top.msgWindow
      );
    },
    cmd_applyFiltersToSelection() {
      let selectedMessages = gDBView.getSelectedMsgHdrs();
      if (selectedMessages.length) {
        MailServices.filters.applyFilters(
          Ci.nsMsgFilterType.Manual,
          selectedMessages,
          gFolder,
          top.msgWindow
        );
      }
    },
    cmd_space() {
      // TODO: Implement
    },
    cmd_searchMessages() {
      // We always open a new search dialog for each search command.
      top.openDialog(
        "chrome://messenger/content/SearchDialog.xhtml",
        "_blank",
        "chrome,resizable,status,centerscreen,dialog=no",
        { folder: gFolder }
      );
    },
  },
  _isCallbackEnabled: {},

  registerCallback(name, callback, isEnabled = true) {
    this._callbackCommands[name] = callback;
    this._isCallbackEnabled[name] = isEnabled;
  },

  supportsCommand(command) {
    return (
      command in this._composeCommands ||
      command in this._navigationCommands ||
      command in this._viewCommands ||
      command in this._callbackCommands
    );
  },
  isCommandEnabled(command) {
    let type = typeof this._isCallbackEnabled[command];
    if (type == "function") {
      return this._isCallbackEnabled[command]();
    } else if (type == "boolean") {
      return this._isCallbackEnabled[command];
    }

    switch (command) {
      case "cmd_newMessage":
        // TODO: This shouldn't be here, or should return false if there are no identities.
        return true;
      case "cmd_searchMessages":
        // TODO: This shouldn't be here, or should return false if there are no accounts.
        return true;
    }

    if (!gViewWrapper?.dbView) {
      return false;
    }

    let isDummyMessage = !gFolder;

    if (command in this._navigationCommands) {
      return !isDummyMessage;
    }

    let numSelectedMessages = isDummyMessage ? 1 : gDBView.numSelected;
    let isNewsgroup = gFolder?.isSpecialFolder(
      Ci.nsMsgFolderFlags.Newsgroup,
      true
    );
    let canMove =
      numSelectedMessages >= 1 && !isNewsgroup && gFolder?.canDeleteMessages;

    switch (command) {
      case "cmd_openConversation":
        return gDBView
          .getSelectedMsgHdrs()
          .some(m => ConversationOpener.isMessageIndexed(m));
      case "cmd_reply":
      case "cmd_replySender":
      case "cmd_replyall":
      case "cmd_replylist":
      case "cmd_forward":
      case "cmd_redirect":
      case "cmd_editAsNew":
      case "cmd_viewPageSource":
      case "cmd_saveAsTemplate":
        return numSelectedMessages == 1;
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_copyMessage":
      case "cmd_saveAsFile":
        return numSelectedMessages >= 1;
      case "cmd_openMessage":
      case "cmd_tag":
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
      case "cmd_addTag":
      case "cmd_manageTags":
      case "cmd_removeTags":
      case "cmd_toggleTag":
      case "cmd_toggleRead":
      case "cmd_markReadByDate":
      case "cmd_markAsFlagged":
      case "cmd_moveMessage":
      case "cmd_killThread":
      case "cmd_killSubthread":
      case "cmd_applyFiltersToSelection":
        return numSelectedMessages >= 1 && !isDummyMessage;
      case "cmd_editDraftMsg":
        return (
          numSelectedMessages == 1 &&
          gFolder?.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)
        );
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
        return (
          numSelectedMessages == 1 &&
          gFolder?.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)
        );
      case "cmd_replyGroup":
        return isNewsgroup;
      case "cmd_markAsRead":
        return (
          numSelectedMessages >= 1 &&
          !isDummyMessage &&
          gViewWrapper.dbView.getSelectedMsgHdrs().some(msg => !msg.isRead)
        );
      case "cmd_markAsUnread":
        return (
          numSelectedMessages >= 1 &&
          !isDummyMessage &&
          gViewWrapper.dbView.getSelectedMsgHdrs().some(msg => msg.isRead)
        );
      case "cmd_markThreadAsRead": {
        if (numSelectedMessages != 1 || isDummyMessage) {
          return false;
        }
        let selectedIndex = {};
        gViewWrapper.dbView.selection?.getRangeAt(0, selectedIndex, {});
        return (
          gViewWrapper.dbView.getThreadContainingIndex(selectedIndex.value)
            .numUnreadChildren > 0
        );
      }
      case "cmd_markAllRead":
        return gDBView?.msgFolder?.getNumUnread(false) > 0;
      case "cmd_markAsJunk":
      case "cmd_markAsNotJunk":
        return this._getViewCommandStatus(Ci.nsMsgViewCommandType.junk);
      case "cmd_archive":
        return (
          !isDummyMessage &&
          MessageArchiver.canArchive(
            gDBView.getSelectedMsgHdrs(),
            gViewWrapper.isSingleFolder
          )
        );
      case "cmd_moveToFolderAgain": {
        // Disable "Move to <folder> Again" for news and other read only
        // folders since we can't really move messages from there - only copy.
        let canMoveAgain = numSelectedMessages >= 1;
        if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
          canMoveAgain = canMove;
        }
        if (canMoveAgain) {
          let targetURI = Services.prefs.getStringPref(
            "mail.last_msg_movecopy_target_uri"
          );
          canMoveAgain = targetURI && MailUtils.getExistingFolder(targetURI);
        }
        return canMoveAgain;
      }
      case "cmd_delete":
        return isNewsgroup || canMove;
      case "cmd_shiftDelete":
        return this._getViewCommandStatus(
          Ci.nsMsgViewCommandType.deleteNoTrash
        );
      case "cmd_createFilterFromMenu":
        return (
          numSelectedMessages == 1 &&
          !isDummyMessage &&
          gDBView.hdrForFirstSelectedMessage?.folder?.server.canHaveFilters
        );
      case "cmd_watchThread": {
        let enabledObj = {};
        let checkStatusObj = {};
        gViewWrapper.dbView.getCommandStatus(
          Ci.nsMsgViewCommandType.toggleThreadWatched,
          enabledObj,
          checkStatusObj
        );
        return enabledObj.value;
      }
      case "cmd_applyFilters": {
        return this._getViewCommandStatus(Ci.nsMsgViewCommandType.applyFilters);
      }
    }

    return false;
  },
  doCommand(command, ...args) {
    if (!this.isCommandEnabled(command)) {
      return;
    }

    if (command in this._composeCommands) {
      this._composeMsgByType(this._composeCommands[command], ...args);
      return;
    }

    if (command in this._navigationCommands) {
      this._navigate(this._navigationCommands[command]);
      return;
    }

    if (command in this._viewCommands) {
      if (command.endsWith("Read") || command.endsWith("Unread")) {
        if (window.ClearPendingReadTimer) {
          window.ClearPendingReadTimer();
        } else {
          window.messageBrowser.contentWindow.ClearPendingReadTimer();
        }
      }
      gViewWrapper.dbView.doCommand(this._viewCommands[command]);
      return;
    }

    if (command in this._callbackCommands) {
      this._callbackCommands[command](...args);
    }
  },

  _getViewCommandStatus(commandType) {
    if (!gViewWrapper?.dbView) {
      return false;
    }

    let enabledObj = {};
    let checkStatusObj = {};
    gViewWrapper.dbView.getCommandStatus(
      commandType,
      enabledObj,
      checkStatusObj
    );
    return enabledObj.value;
  },

  /**
   * Calls the ComposeMessage function with the desired type, and proper default
   * based on the event that fired it.
   *
   * @param composeType  the nsIMsgCompType to pass to the function
   * @param event (optional) the event that triggered the call
   */
  _composeMsgByType(composeType, event) {
    // If we're the hidden window, then we're not going to have a gFolderDisplay
    // to work out existing folders, so just use null.
    let msgFolder = gFolder;
    let msgUris = gFolder
      ? gDBView?.getURIsForSelection()
      : [window.gMessageURI];

    if (event && event.shiftKey) {
      window.browsingContext.topChromeWindow.ComposeMessage(
        composeType,
        Ci.nsIMsgCompFormat.OppositeOfDefault,
        msgFolder,
        msgUris
      );
    } else {
      window.browsingContext.topChromeWindow.ComposeMessage(
        composeType,
        Ci.nsIMsgCompFormat.Default,
        msgFolder,
        msgUris
      );
    }
  },

  _navigate(navigationType) {
    let resultKey = {};
    let resultIndex = {};
    let threadIndex = {};
    gViewWrapper.dbView.viewNavigate(
      navigationType,
      resultKey,
      resultIndex,
      threadIndex,
      true
    );

    if (resultIndex.value == nsMsgViewIndex_None) {
      // Not in about:message
      if (window.displayFolder) {
        CrossFolderNavigation(navigationType);
      }
      return;
    }
    if (resultKey.value == nsMsgKey_None) {
      return;
    }

    gViewWrapper.dbView.selection.select(resultIndex.value);
    if (window.threadTree) {
      window.threadTree.scrollToIndex(resultIndex.value);
      window.threadTree.focus();
    }
    displayMessage(gViewWrapper.dbView.URIForFirstSelectedMessage);
  },
};
// Add the controller to this window's controllers, so that built-in commands
// such as cmd_selectAll run our code instead of the default code.
window.controllers.insertControllerAt(0, commandController);

var dbViewWrapperListener = {
  _nextViewIndexAfterDelete: null,

  messenger: null,
  msgWindow: top.msgWindow,
  threadPaneCommandUpdater: {
    QueryInterface: ChromeUtils.generateQI([
      "nsIMsgDBViewCommandUpdater",
      "nsISupportsWeakReference",
    ]),
    updateCommandStatus() {},
    displayMessageChanged(folder, subject, keywords) {},
    updateNextMessageAfterDelete() {
      dbViewWrapperListener._nextViewIndexAfterDelete = gDBView
        ? gDBView.msgToSelectAfterDelete
        : null;
    },
    summarizeSelection() {
      return true;
    },
  },

  get shouldUseMailViews() {
    return false;
  },
  get shouldDeferMessageDisplayUntilAfterServerConnect() {
    return false;
  },
  shouldMarkMessagesReadOnLeavingFolder(msgFolder) {
    return false;
  },
  onFolderLoading(isFolderLoading) {},
  onSearching(isSearching) {},
  onCreatedView() {
    if (window.threadTree) {
      window.threadTree.view = gDBView = gViewWrapper.dbView;
    }
  },
  onDestroyingView(folderIsComingBack) {
    if (!folderIsComingBack && window.threadTree) {
      window.threadTree.view = gDBView = null;
    }
  },
  onLoadingFolder(dbFolderInfo) {
    window.quickFilterBar?.onFolderChanged();
  },
  onDisplayingFolder() {},
  onLeavingFolder() {},
  onMessagesLoaded(all) {
    if (all) {
      window.threadTree?.invalidate();
    }
    window.quickFilterBar?.onMessagesChanged();
  },
  onMailViewChanged() {},
  onSortChanged() {
    window.threadTree?.invalidate();
  },
  onMessagesRemoved() {
    window.quickFilterBar?.onMessagesChanged();

    if (!gDBView || !top) {
      return;
    }

    let rowCount = gDBView.rowCount;

    // There's no messages left.
    if (rowCount == 0) {
      if (location.href == "about:3pane") {
        // In a 3-pane tab, clear the message pane and selection.
        window.threadTree.selectedIndex = -1;
      } else if (parent?.location != "about:3pane") {
        // In a standalone message tab or window, close the tab or window.
        let tabmail = top.document.getElementById("tabmail");
        if (tabmail) {
          tabmail.closeTab(window.tabOrWindow);
        } else {
          top.close();
        }
      }
      this._nextViewIndexAfterDelete = null;
      return;
    }

    if (this._nextViewIndexAfterDelete != null) {
      // Select the next message in the view, based on what we were told in
      // updateNextMessageAfterDelete.
      if (this._nextViewIndexAfterDelete >= rowCount) {
        this._nextViewIndexAfterDelete = rowCount - 1;
      }
      if (this._nextViewIndexAfterDelete > -1) {
        if (location.href == "about:3pane") {
          window.threadTree.selectedIndex = this._nextViewIndexAfterDelete;
        } else if (parent?.location != "about:3pane") {
          gDBView.selection.select(this._nextViewIndexAfterDelete);
          displayMessage(
            gDBView.getURIForViewIndex(this._nextViewIndexAfterDelete)
          );
        }
      }
      this._nextViewIndexAfterDelete = null;
    }
  },
  onMessageRemovalFailed() {},
  onMessageCountsChanged() {
    window.quickFilterBar?.onMessagesChanged();
  },
};
