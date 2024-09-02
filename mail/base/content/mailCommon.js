/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// mailContext.js
/* globals mailContextMenu */

// msgViewNavigation.js
/* globals CrossFolderNavigation */

// about3pane.js
/* globals ThreadPaneColumns */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  ConversationOpener: "resource:///modules/ConversationOpener.sys.mjs",
  DBViewWrapper: "resource:///modules/DBViewWrapper.sys.mjs",

  EnigmailPersistentCrypto:
    "chrome://openpgp/content/modules/persistentCrypto.sys.mjs",

  EnigmailURIs: "chrome://openpgp/content/modules/uris.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  MessageArchiver: "resource:///modules/MessageArchiver.sys.mjs",
  TreeSelection: "chrome://messenger/content/TreeSelection.mjs",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gEncryptedURIService",
  "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1",
  "nsIEncryptedSMIMEURIsService"
);

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
    cmd_cancel() {
      gFolder
        .QueryInterface(Ci.nsIMsgNewsFolder)
        .cancelMessage(gDBView.hdrForFirstSelectedMessage, top.msgWindow);
    },
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
    cmd_forward(event) {
      if (Services.prefs.getIntPref("mail.forward_message_mode", 0) == 0) {
        commandController.doCommand("cmd_forwardAttachment", event);
      } else {
        commandController.doCommand("cmd_forwardInline", event);
      }
    },
    cmd_openMessage(event) {
      const forceTab = event?.button == 1;
      MailUtils.displayMessages(
        gDBView.getSelectedMsgHdrs(),
        gViewWrapper,
        top.document.getElementById("tabmail"),
        forceTab,
        event?.shiftKey
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
      if (parent.location.href == "about:3pane") {
        // If we're in about:message inside about:3pane, it's the parent
        // window that needs to advance to the next message.
        parent.commandController.doCommand("cmd_moveMessage", destFolder);
        return;
      }
      dbViewWrapperListener.threadPaneCommandUpdater.updateNextMessageAfterDelete();
      gViewWrapper.dbView.doCommandWithFolder(
        Ci.nsMsgViewCommandType.moveMessages,
        destFolder
      );
      Services.prefs.setStringPref(
        "mail.last_msg_movecopy_target_uri",
        destFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", true);
    },
    async cmd_copyDecryptedTo(destFolder) {
      const msgHdrs = gDBView.getSelectedMsgHdrs();
      if (!msgHdrs || msgHdrs.length === 0) {
        return;
      }

      const total = msgHdrs.length;
      let failures = 0;
      for (const msgHdr of msgHdrs) {
        await EnigmailPersistentCrypto.cryptMessage(
          msgHdr,
          destFolder.URI,
          false, // not moving
          false
        ).catch(() => {
          failures++;
        });
      }

      if (failures) {
        const info = await document.l10n.formatValue(
          "decrypt-and-copy-failures-multiple",
          {
            failures,
            total,
          }
        );
        Services.prompt.alert(null, document.title, info);
      }
    },
    /**
     * Copies the selected messages to the destination folder.
     *
     * @param {nsIMsgFolder} destFolder - the destination folder
     */
    cmd_copyMessage(destFolder) {
      if (window.gMessageURI?.startsWith("file:")) {
        const file = Services.io
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
      Services.prefs.setStringPref(
        "mail.last_msg_movecopy_target_uri",
        destFolder.URI
      );
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", false);
    },
    cmd_archive() {
      if (parent.location.href == "about:3pane") {
        // If we're in about:message inside about:3pane, it's the parent
        // window that needs to advance to the next message.
        parent.commandController.doCommand("cmd_archive");
        return;
      }
      dbViewWrapperListener.threadPaneCommandUpdater.updateNextMessageAfterDelete();
      const archiver = new MessageArchiver();
      // The instance of nsITransactionManager to use here is tied to msgWindow. Set
      // this property so the operation can be undone if requested.
      archiver.msgWindow = top.msgWindow;
      // Archive the selected message(s).
      archiver.archiveMessages(gViewWrapper.dbView.getSelectedMsgHdrs());
    },
    cmd_moveToFolderAgain() {
      if (parent.location.href == "about:3pane") {
        // If we're in about:message inside about:3pane, it's the parent
        // window that needs to advance to the next message.
        parent.commandController.doCommand("cmd_moveToFolderAgain");
        return;
      }
      const folder = MailUtils.getOrCreateFolder(
        Services.prefs.getStringPref("mail.last_msg_movecopy_target_uri")
      );
      if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
        dbViewWrapperListener.threadPaneCommandUpdater.updateNextMessageAfterDelete();
        commandController.doCommand("cmd_moveMessage", folder);
      } else {
        commandController.doCommand("cmd_copyMessage", folder);
      }
    },
    cmd_deleteMessage() {
      if (parent.location.href == "about:3pane") {
        // If we're in about:message inside about:3pane, it's the parent
        // window that needs to advance to the next message.
        parent.commandController.doCommand("cmd_deleteMessage");
        return;
      }
      if (!MailUtils.confirmDelete(false, gDBView, gFolder)) {
        return;
      }
      dbViewWrapperListener.threadPaneCommandUpdater.updateNextMessageAfterDelete();
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
    },
    cmd_shiftDeleteMessage() {
      if (parent.location.href == "about:3pane") {
        // If we're in about:message inside about:3pane, it's the parent
        // window that needs to advance to the next message.
        parent.commandController.doCommand("cmd_shiftDeleteMessage");
        return;
      }
      if (!MailUtils.confirmDelete(true, gDBView, gFolder)) {
        return;
      }
      dbViewWrapperListener.threadPaneCommandUpdater.updateNextMessageAfterDelete();
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.deleteNoTrash);
    },
    cmd_createFilterFromMenu() {
      const msgHdr = gDBView.hdrForFirstSelectedMessage;
      const emailAddress =
        MailServices.headerParser.extractHeaderAddressMailboxes(msgHdr.author);
      if (emailAddress) {
        top.MsgFilters(emailAddress, msgHdr.folder);
      }
    },
    cmd_viewPageSource() {
      const uris = window.gMessageURI
        ? [window.gMessageURI]
        : gDBView.getURIsForSelection();
      for (const uri of uris) {
        // Now, we need to get a URL from a URI
        let url = MailServices.mailSession.ConvertMsgURIToMsgURL(
          uri,
          top.msgWindow
        );

        // Strip out the message-display parameter to ensure that attached emails
        // display the message source, not the processed HTML.
        url = url.replace(/type=application\/x-message-display&?/, "");
        window.openDialog(
          "chrome://messenger/content/viewSource.xhtml",
          "_blank",
          "all,dialog=no",
          { URL: url }
        );
      }
    },
    cmd_saveAsFile() {
      const uris = window.gMessageURI
        ? [window.gMessageURI]
        : gDBView.getURIsForSelection();
      top.SaveAsFile(uris);
    },
    cmd_saveAsTemplate() {
      top.SaveAsTemplate(gDBView.getURIsForSelection()[0]);
    },
    cmd_applyFilters() {
      const curFilterList = gFolder.getFilterList(top.msgWindow);
      // Create a new filter list and copy over the enabled filters to it.
      // We do this instead of having the filter after the fact code ignore
      // disabled filters because the Filter Dialog filter after the fact
      // code would have to clone filters to allow disabled filters to run,
      // and we don't support cloning filters currently.
      const tempFilterList = MailServices.filters.getTempFilterList(gFolder);
      const numFilters = curFilterList.filterCount;
      // Make sure the temp filter list uses the same log stream.
      tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
      tempFilterList.logStream = curFilterList.logStream;
      let newFilterIndex = 0;
      for (let i = 0; i < numFilters; i++) {
        const curFilter = curFilterList.getFilterAt(i);
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
      const selectedMessages = gDBView.getSelectedMsgHdrs();
      if (selectedMessages.length) {
        MailServices.filters.applyFilters(
          Ci.nsMsgFilterType.Manual,
          selectedMessages,
          gFolder,
          top.msgWindow
        );
      }
    },
    cmd_space(event) {
      let messagePaneBrowser;
      if (window.messageBrowser) {
        messagePaneBrowser =
          window.messageBrowser.contentWindow.getMessagePaneBrowser();
      } else {
        messagePaneBrowser = window.getMessagePaneBrowser();
      }
      const contentWindow = messagePaneBrowser.contentWindow;

      if (event?.shiftKey) {
        // If at the start of the message, go to the previous one.
        if (contentWindow?.scrollY > 0) {
          contentWindow.scrollByPages(-1);
        } else if (Services.prefs.getBoolPref("mail.advance_on_spacebar")) {
          top.goDoCommand("cmd_previousUnreadMsg");
        }
      } else if (
        Math.ceil(contentWindow?.scrollY) < contentWindow?.scrollMaxY
      ) {
        // If at the end of the message, go to the next one.
        contentWindow.scrollByPages(1);
      } else if (Services.prefs.getBoolPref("mail.advance_on_spacebar")) {
        top.goDoCommand("cmd_nextUnreadMsg");
      }
    },
    cmd_searchMessages(folder = gFolder) {
      // We always open a new search dialog for each search command.
      top.openDialog(
        "chrome://messenger/content/SearchDialog.xhtml",
        "_blank",
        "chrome,resizable,status,centerscreen,dialog=no",
        { folder }
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
  // eslint-disable-next-line complexity
  isCommandEnabled(command) {
    const type = typeof this._isCallbackEnabled[command];
    if (type == "function") {
      return this._isCallbackEnabled[command]();
    } else if (type == "boolean") {
      return this._isCallbackEnabled[command];
    }

    const hasIdentities = MailServices.accounts.allIdentities.length;
    switch (command) {
      case "cmd_newMessage":
        return hasIdentities;
      case "cmd_searchMessages":
        // TODO: This shouldn't be here, or should return false if there are no accounts.
        return true;
      case "cmd_space":
      case "cmd_manageTags":
        return true;
    }

    if (!gViewWrapper?.dbView) {
      return false;
    }

    const isDummyMessage = !gViewWrapper.isSynthetic && !gFolder;

    if (["cmd_goBack", "cmd_goForward"].includes(command)) {
      const activeMessageHistory = (
        window.messageBrowser?.contentWindow ?? window
      ).messageHistory;
      const relPos = command === "cmd_goBack" ? -1 : 1;
      if (relPos === -1 && activeMessageHistory.canPop(0)) {
        return !isDummyMessage;
      }
      return !isDummyMessage && activeMessageHistory.canPop(relPos);
    }

    if (command in this._navigationCommands) {
      return !isDummyMessage;
    }

    const numSelectedMessages = isDummyMessage
      ? 1
      : Number(gDBView?.numSelected);

    // Evaluate these properties only if needed, not once for each command.
    const folder = () => {
      if (gFolder) {
        return gFolder;
      }
      if (gDBView?.numSelected >= 1) {
        return gDBView.hdrForFirstSelectedMessage?.folder;
      }
      return null;
    };
    const isNewsgroup = () =>
      folder()?.isSpecialFolder(Ci.nsMsgFolderFlags.Newsgroup, true);
    const canMove = () =>
      numSelectedMessages >= 1 &&
      (folder()?.canDeleteMessages || gViewWrapper.isSynthetic) &&
      !gViewWrapper.isExpandedGroupedByHeaderAtIndex(
        gDBView.viewIndexForFirstSelectedMsg
      );

    switch (command) {
      case "cmd_cancel":
        if (numSelectedMessages == 1 && isNewsgroup()) {
          // Ensure author of message matches own identity
          const author = gDBView.hdrForFirstSelectedMessage.mime2DecodedAuthor;
          return MailServices.accounts
            .getIdentitiesForServer(folder().server)
            .some(id => id.fullAddress == author);
        }
        return false;
      case "cmd_openConversation":
        return (
          // This (instead of numSelectedMessages) is necessary to be able to
          // also open a collapsed thread in conversation.
          gDBView.selection.count == 1 &&
          ConversationOpener.isMessageIndexed(
            gDBView.hdrForFirstSelectedMessage
          )
        );
      case "cmd_replylist":
        if (
          !mailContextMenu.selectionIsOverridden &&
          hasIdentities &&
          numSelectedMessages == 1
        ) {
          return (window.messageBrowser?.contentWindow ?? window)
            .currentHeaderData?.["list-post"];
        }
        return false;
      case "cmd_viewPageSource":
      case "cmd_saveAsTemplate":
        return numSelectedMessages == 1;
      case "cmd_reply":
      case "cmd_replySender":
      case "cmd_replyall":
      case "cmd_forward":
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_redirect":
      case "cmd_editAsNew":
        return (
          hasIdentities &&
          (numSelectedMessages == 1 ||
            (numSelectedMessages > 1 &&
              // Exclude collapsed threads.
              numSelectedMessages == gDBView.selection.count))
        );
      case "cmd_copyMessage":
      case "cmd_saveAsFile":
        return numSelectedMessages >= 1;
      case "cmd_openMessage":
        return (
          (location.href == "about:3pane" ||
            parent.location.href == "about:3pane") &&
          numSelectedMessages >= 1 &&
          !isDummyMessage
        );
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
      case "cmd_removeTags":
      case "cmd_toggleTag":
      case "cmd_toggleRead":
      case "cmd_markAsFlagged":
      case "cmd_applyFiltersToSelection":
        return numSelectedMessages >= 1 && !isDummyMessage;
      case "cmd_copyDecryptedTo": {
        let showDecrypt = numSelectedMessages > 1;
        if (numSelectedMessages == 1 && !isDummyMessage) {
          const msgURI = gDBView.URIForFirstSelectedMessage;
          if (msgURI) {
            showDecrypt =
              EnigmailURIs.isEncryptedUri(msgURI) ||
              gEncryptedURIService.isEncrypted(msgURI);
          }
        }
        return showDecrypt;
      }
      case "cmd_editDraftMsg":
        return (
          numSelectedMessages >= 1 &&
          folder()?.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)
        );
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
        return (
          numSelectedMessages >= 1 &&
          folder()?.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)
        );
      case "cmd_replyGroup":
        return isNewsgroup();
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
        if (numSelectedMessages == 0 || isDummyMessage) {
          return false;
        }
        const sel = gViewWrapper.dbView.selection;
        for (let i = 0; i < sel.getRangeCount(); i++) {
          const start = {};
          const end = {};
          sel.getRangeAt(i, start, end);
          for (let j = start.value; j <= end.value; j++) {
            if (
              gViewWrapper.dbView.getThreadContainingIndex(j)
                .numUnreadChildren > 0
            ) {
              return true;
            }
          }
        }
        return false;
      }
      case "cmd_markReadByDate":
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
      case "cmd_moveMessage": {
        return canMove();
      }
      case "cmd_moveToFolderAgain": {
        // Disable "Move to <folder> Again" for news and other read only
        // folders since we can't really move messages from there - only copy.
        let canMoveAgain = numSelectedMessages >= 1;
        if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
          canMoveAgain = canMove() && !isNewsgroup();
        }
        if (canMoveAgain) {
          const targetURI = Services.prefs.getStringPref(
            "mail.last_msg_movecopy_target_uri"
          );
          canMoveAgain = targetURI && MailUtils.getExistingFolder(targetURI);
        }
        return !!canMoveAgain;
      }
      case "cmd_deleteMessage":
        return canMove();
      case "cmd_shiftDeleteMessage":
        return this._getViewCommandStatus(
          Ci.nsMsgViewCommandType.deleteNoTrash
        );
      case "cmd_createFilterFromMenu":
        return (
          numSelectedMessages == 1 &&
          !isDummyMessage &&
          folder()?.server.canHaveFilters
        );
      case "cmd_watchThread": {
        const enabledObj = {};
        const checkStatusObj = {};
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
      if (parent.location.href == "about:3pane") {
        // If we're in about:message inside about:3pane, it's the parent
        // window that needs to advance to the next message.
        parent.commandController.doCommand(command, ...args);
      } else {
        this._navigate(this._navigationCommands[command]);
      }
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

    const enabledObj = {};
    const checkStatusObj = {};
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
    const msgFolder = gFolder;
    const msgUris =
      gFolder || gViewWrapper.isSynthetic
        ? gDBView?.getURIsForSelection()
        : [window.gMessageURI];

    let messagePaneBrowser;
    let autodetectCharset;
    let selection;
    if (!mailContextMenu.selectionIsOverridden) {
      if (window.messageBrowser) {
        if (!window.messageBrowser.hidden) {
          messagePaneBrowser =
            window.messageBrowser.contentWindow.getMessagePaneBrowser();
          autodetectCharset =
            window.messageBrowser.contentWindow.autodetectCharset;
        }
      } else {
        messagePaneBrowser = window.getMessagePaneBrowser();
        autodetectCharset = window.autodetectCharset;
      }
      selection = messagePaneBrowser?.contentWindow?.getSelection();
    }

    if (event && event.shiftKey) {
      window.browsingContext.topChromeWindow.ComposeMessage(
        composeType,
        Ci.nsIMsgCompFormat.OppositeOfDefault,
        msgFolder,
        msgUris,
        selection,
        autodetectCharset
      );
    } else {
      window.browsingContext.topChromeWindow.ComposeMessage(
        composeType,
        Ci.nsIMsgCompFormat.Default,
        msgFolder,
        msgUris,
        selection,
        autodetectCharset
      );
    }
  },

  _navigate(navigationType) {
    if (
      [Ci.nsMsgNavigationType.back, Ci.nsMsgNavigationType.forward].includes(
        navigationType
      )
    ) {
      const { messageHistory } = window.messageBrowser?.contentWindow ?? window;
      const noCurrentMessage = messageHistory.canPop(0);
      let relativePosition = -1;
      if (navigationType === Ci.nsMsgNavigationType.forward) {
        relativePosition = 1;
      } else if (noCurrentMessage) {
        relativePosition = 0;
      }
      const newMessageURI = messageHistory.pop(relativePosition)?.messageURI;
      if (!newMessageURI) {
        return;
      }
      const msgHdr =
        MailServices.messageServiceFromURI(newMessageURI).messageURIToMsgHdr(
          newMessageURI
        );
      if (msgHdr) {
        if (window.threadPane) {
          window.selectMessage(msgHdr);
        } else {
          window.displayMessage(newMessageURI);
        }
      }
      return;
    }

    const resultKey = { value: nsMsgKey_None };
    const resultIndex = { value: nsMsgViewIndex_None };
    const threadIndex = {};

    let expandCurrentThread = false;
    const currentIndex = window.threadTree
      ? window.threadTree.currentIndex
      : -1;
    let addedRowsByViewNavigate = 0;

    // If we're doing next unread, and a collapsed thread is selected, and
    // the top level message is unread, just set the result manually to
    // the top level message, without using viewNavigate.
    if (
      navigationType == Ci.nsMsgNavigationType.nextUnreadMessage &&
      currentIndex != -1 &&
      gViewWrapper.isCollapsedThreadAtIndex(currentIndex) &&
      !(
        gViewWrapper.dbView.getFlagsAt(currentIndex) & Ci.nsMsgMessageFlags.Read
      )
    ) {
      expandCurrentThread = true;
      resultIndex.value = currentIndex;
      resultKey.value = gViewWrapper.dbView.getKeyAt(currentIndex);
    } else {
      const countBefore = gViewWrapper.dbView.rowCount;
      gViewWrapper.dbView.viewNavigate(
        navigationType,
        resultKey,
        resultIndex,
        threadIndex,
        true
      );
      addedRowsByViewNavigate = gViewWrapper.dbView.rowCount - countBefore;
      if (resultIndex.value == nsMsgViewIndex_None) {
        if (CrossFolderNavigation(navigationType)) {
          this._navigate(navigationType);
        }
        return;
      }
      if (resultKey.value == nsMsgKey_None) {
        return;
      }
    }

    if (window.threadTree) {
      if (
        gDBView.selection.count == 1 &&
        window.threadTree.selectedIndex == resultIndex.value &&
        !expandCurrentThread
      ) {
        return;
      }
      const addedRows = Math.max(
        addedRowsByViewNavigate,
        window.threadTree.expandRowAtIndex(resultIndex.value)
      );
      // Do an instant scroll before setting the index to avoid animation.
      window.threadTree.scrollToIndex(resultIndex.value, true);
      window.threadTree.selectedIndex = resultIndex.value;
      // If the thread index has not been determined by viewNavigate(), its
      // return value will be 0.
      const firstIndex =
        threadIndex.value > 0 ? threadIndex.value : resultIndex.value;
      // Scroll the thread to the most reasonable position.
      window.threadTree.scrollExpandedRowIntoView(
        resultIndex.value,
        addedRows,
        false,
        firstIndex
      );
      // Focus the thread tree, unless the message pane has focus.
      if (
        Services.focus.focusedWindow !=
        window.messageBrowser.contentWindow?.getMessagePaneBrowser()
          .contentWindow
      ) {
        // There's something strange going on here – calling `focus`
        // immediately can cause the scroll position to return to where it was
        // before changing folders, which starts a cascade of "scroll" events
        // until the tree scrolls to the top.
        setTimeout(() => window.threadTree.table.body.focus());
      }
    } else {
      if (window.gMessage.messageKey == resultKey.value) {
        return;
      }

      gViewWrapper.dbView.selection.select(resultIndex.value);
      window.displayMessage(
        gViewWrapper.dbView.URIForFirstSelectedMessage,
        gViewWrapper
      );
    }
  },
};
// Add the controller to this window's controllers, so that built-in commands
// such as cmd_selectAll run our code instead of the default code.
window.controllers.insertControllerAt(0, commandController);

var dbViewWrapperListener = {
  _allMessagesLoaded: false,
  _nextViewIndexAfterDelete: null,

  messenger: null,
  msgWindow: top.msgWindow,
  threadPaneCommandUpdater: {
    QueryInterface: ChromeUtils.generateQI([
      "nsIMsgDBViewCommandUpdater",
      "nsISupportsWeakReference",
    ]),
    updateCommandStatus() {},
    displayMessageChanged() {},
    updateNextMessageAfterDelete() {
      dbViewWrapperListener._nextViewIndexAfterDelete = gDBView
        ? gDBView.msgToSelectAfterDelete
        : null;
    },
    summarizeSelection() {
      return true;
    },
    selectedMessageRemoved() {
      // We need to invalidate the tree, but this method could get called
      // multiple times, so we won't invalidate until we get to the end of the
      // event loop.
      if (this._timeout) {
        return;
      }
      this._timeout = setTimeout(() => {
        dbViewWrapperListener.onMessagesRemoved();
        window.threadTree?.invalidate();
        delete this._timeout;
      });
    },
  },

  get allMessagesLoaded() {
    return this._allMessagesLoaded;
  },
  get shouldUseMailViews() {
    return !!top.ViewPickerBinding?.isVisible;
  },
  get shouldDeferMessageDisplayUntilAfterServerConnect() {
    return false;
  },

  /**
   * Let the viewWrapper know if it should mark the messages read when leaving
   * the provided folder.
   *
   * TODO: Consider retiring this in favor of an folders.onLeavingFolder API
   * event (or something similar) that add-ons could hook into.
   *
   * @param {nsIMsgFolder} msgFolder
   * @returns {boolean} true if we should mark this folder as read when leaving
   *   it.
   */
  shouldMarkMessagesReadOnLeavingFolder(msgFolder) {
    return Services.prefs.getBoolPref(
      `mailnews.mark_message_read.${msgFolder.server.type}`,
      false
    );
  },
  onFolderLoading() {},
  onSearching() {},
  onCreatedView() {
    this._allMessagesLoaded = false;

    if (!window.threadTree || !gViewWrapper) {
      return;
    }

    for (const col of ThreadPaneColumns.getCustomColumns()) {
      gViewWrapper.dbView.addColumnHandler(col.id, col.handler);
    }
    window.threadPane.setTreeView(gViewWrapper.dbView);
    window.threadPane.restoreSortIndicator();
    window.threadPane.restoreThreadState(gViewWrapper.isSingleFolder);
    window.threadPane.isFirstScroll = true;
    window.threadPane.scrollDetected = false;
    window.threadPane.scrollToLatestRowIfNoSelection();
  },
  onDestroyingView(folderIsComingBack) {
    this._allMessagesLoaded = false;

    if (!window.threadTree) {
      return;
    }

    if (folderIsComingBack) {
      // We'll get a new view of the same folder (e.g. with a quick filter) -
      // try to preserve the selection.
      window.threadPane.saveSelection();
      return;
    }
    gDBView?.setJSTree(null);
    window.threadPane.setTreeView(null);
  },
  onLoadingFolder() {
    window.quickFilterBar?.onFolderChanged();
  },
  onDisplayingFolder() {},
  onLeavingFolder() {},
  /**
   * @param {boolean} all - Whether all messages have now been loaded.
   *   When false, expect that updateFolder or a search will soon come along
   *   with another load. The all==false case is needed for good perceived
   *   performance. Updating the folder can take seconds during which you
   *   would otherwise not be able to see the message list for the folder, which
   *   may or may not really change once we get the update from the server.
   */
  onMessagesLoaded(all) {
    this._allMessagesLoaded = all;

    if (!window.threadPane) {
      return;
    }

    if (all) {
      window.threadPane.restoreThreadState(
        gViewWrapper?.search.hasSearchTerms || gViewWrapper?.isSynthetic
      );
    }

    // Try to restore what was selected. Keep the saved selection (if there is
    // one) until we have all of the messages. This will also reveal selected
    // messages in collapsed threads.
    window.threadPane.restoreSelection({ discard: all });

    if (all || gViewWrapper.search.hasSearchTerms) {
      let newMessageFound = false;
      if (window.threadPane.scrollToNewMessage) {
        try {
          const index = gDBView.findIndexOfMsgHdr(
            gFolder.firstNewMessage,
            true
          );
          if (index != nsMsgViewIndex_None) {
            window.threadTree.scrollToIndex(index, true);
            newMessageFound = true;
          }
        } catch (ex) {
          console.error(ex);
        }
        window.threadPane.scrollToNewMessage = false;
      }
      window.threadTree.reset();
      if (!newMessageFound && !window.threadPane.scrollDetected) {
        window.threadPane.scrollToLatestRowIfNoSelection();
      }
    }
    // To be consistent with the behavior in saved searches, update the message
    // count in synthetic views when a quick filter term is entered or cleared.
    if (gViewWrapper?.isSynthetic) {
      window.threadPaneHeader.updateMessageCount(
        gViewWrapper.dbView.numMsgsInView
      );
    }
    window.quickFilterBar?.onMessagesChanged();
  },
  onMailViewChanged() {
    window.dispatchEvent(new CustomEvent("MailViewChanged"));
  },
  onSortChanged() {
    // If there is no selection, scroll to the most relevant end.
    window.threadPane?.scrollToLatestRowIfNoSelection();
  },
  onMessagesRemoved() {
    window.quickFilterBar?.onMessagesChanged();

    if (!gDBView || (!gFolder && !gViewWrapper?.isSynthetic)) {
      // This can't be a notification about the message currently displayed.
      return;
    }

    const rowCount = gDBView.rowCount;

    // There's no messages left.
    if (rowCount == 0) {
      if (location.href == "about:3pane") {
        // In a 3-pane tab, clear the message pane and selection.
        window.threadTree.selectedIndex = -1;
      } else if (parent?.location != "about:3pane") {
        // In a standalone message tab or window, close the tab or window.
        const tabmail = top.document.getElementById("tabmail");
        if (tabmail) {
          tabmail.closeTab(window.tabOrWindow);
        } else {
          top.close();
        }
      }
      this._nextViewIndexAfterDelete = null;
      return;
    }

    if (
      this._nextViewIndexAfterDelete != null &&
      this._nextViewIndexAfterDelete != nsMsgViewIndex_None
    ) {
      // Select the next message in the view, based on what we were told in
      // updateNextMessageAfterDelete.
      if (this._nextViewIndexAfterDelete >= rowCount) {
        this._nextViewIndexAfterDelete = rowCount - 1;
      }
      if (
        this._nextViewIndexAfterDelete > -1 &&
        !mailContextMenu.selectionIsOverridden
      ) {
        if (location.href == "about:3pane") {
          // A "select" event should fire here, but setting the selected index
          // might not fire it. OTOH, we want it to fire only once, so see if
          // the event is fired, and if not, fire it.
          let eventFired = false;
          const onSelect = () => (eventFired = true);

          window.threadTree.addEventListener("select", onSelect, {
            once: true,
          });
          window.threadTree.selectedIndex = this._nextViewIndexAfterDelete;
          window.threadTree.removeEventListener("select", onSelect);

          if (!eventFired) {
            window.threadTree.dispatchEvent(new CustomEvent("select"));
          }
        } else if (parent?.location != "about:3pane") {
          if (
            Services.prefs.getBoolPref("mail.close_message_window.on_delete")
          ) {
            // Bail out early if this is about a partial POP3 message that has
            // just been completed and reloaded.
            if (document.body.classList.contains("completed-message")) {
              document.body.classList.remove("completed-message");
              return;
            }
            // Close the tab or window if the displayed message is deleted.
            const tabmail = top.document.getElementById("tabmail");
            if (tabmail) {
              tabmail.closeTab(window.tabOrWindow);
            } else {
              top.close();
            }
            return;
          }
          gDBView.selection.select(this._nextViewIndexAfterDelete);
          window.displayMessage(
            gDBView.getURIForViewIndex(this._nextViewIndexAfterDelete),
            gViewWrapper
          );
        }
      }
      this._nextViewIndexAfterDelete = null;
    }
  },
  onMessageRemovalFailed() {
    this._nextViewIndexAfterDelete = null;
  },
  onMessageCountsChanged() {
    window.quickFilterBar?.onMessagesChanged();
  },
};
