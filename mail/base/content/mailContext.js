/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gFolder, gMessage, gMessageURI, gViewWrapper, goDoCommand, messengerBundle */ // about3Pane.js

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var LazyModules = {};
XPCOMUtils.defineLazyModuleGetters(LazyModules, {
  MailUtils: "resource:///modules/MailUtils.jsm",
  PlacesUtils: "resource://gre/modules/PlacesUtils.jsm",
  TagUtils: "resource:///modules/TagUtils.jsm",
});

window.addEventListener("DOMContentLoaded", () => {
  if (window.top != window) {
    return;
  }

  mailContextMenu.init();
});

/**
 * Called by ContextMenuParent if this is the top window.
 */
function openContextMenu({ data, target }) {
  if (window.top != window) {
    // Not sure how we'd get here, but let's not continue if we do.
    return;
  }

  // TODO we'll want the context menu in non-mail pages, when they work.
  const MESSAGE_PROTOCOLS = ["imap", "mailbox", "news", "nntp", "snews"];
  if (!MESSAGE_PROTOCOLS.includes(target.browsingContext.currentURI.scheme)) {
    return;
  }

  mailContextMenu.fillMessageContextMenu(data, target.browsingContext);
  let popup = document.getElementById("mailContext");
  popup.openPopupAtScreen(data.context.screenX, data.context.screenY, true);
}

var mailContextMenu = {
  // Commands handled by commandController.
  _commandMap: {
    "mailContext-editDraftMsg": "cmd_editDraftMsg",
    "mailContext-newMsgFromTemplate": "cmd_newMsgFromTemplate",
    "mailContext-editTemplateMsg": "cmd_editTemplateMsg",
    "mailContext-replyNewsgroup": "cmd_replyGroup",
    "mailContext-replySender": "cmd_replySender",
    "mailContext-replyAll": "cmd_replyall",
    "mailContext-replyList": "cmd_replylist",
    "mailContext-forward": "cmd_forward",
    "mailContext-forwardAsInline": "cmd_forwardInline",
    "mailContext-forwardAsAttachment": "cmd_forwardAttachment",
    "mailContext-multiForwardAsAttachment": "cmd_forwardAttachment",
    "mailContext-redirect": "cmd_redirect",
    "mailContext-editAsNew": "cmd_editAsNew",
    "mailContext-addNewTag": "cmd_addTag",
    "mailContext-manageTags": "cmd_manageTags",
    "mailContext-tagRemoveAll": "cmd_removeTags",
    "mailContext-markRead": "cmd_markAsRead",
    "mailContext-markUnread": "cmd_markAsUnread",
    "mailContext-markThreadAsRead": "cmd_markThreadAsRead",
    "mailContext-markReadByDate": "cmd_markReadByDate",
    "mailContext-markAllRead": "cmd_markAllRead",
    "mailContext-markFlagged": "cmd_markAsFlagged",
    "mailContext-markAsJunk": "cmd_markAsJunk",
    "mailContext-markAsNotJunk": "cmd_markAsNotJunk",
    // "mailContext-recalculateJunkScore": "cmd_recalculateJunkScore",
    "mailcontext-moveToFolderAgain": "cmd_moveToFolderAgain",
    "mailContext-delete": "cmd_delete",
    // "mailContext-ignoreThread": "cmd_killThread",
    // "mailContext-ignoreSubthread": "cmd_killSubthread",
    // "mailContext-watchThread": "cmd_watchThread",
    // "mailContext-print": "cmd_print",
    // "mailContext-downloadSelected": "cmd_downloadSelected",
  },

  init() {
    let mailContext = document.getElementById("mailContext");
    mailContext.addEventListener("popupshowing", event => {
      if (event.target == mailContext) {
        this.fillMailContextMenu();
      }
    });
    mailContext.addEventListener("command", event =>
      this.onMailContextMenuCommand(event)
    );
  },

  emptyMessageContextMenu() {
    delete this.browsingContext;
    delete this.context;
    delete this.selectionInfo;

    for (let id of [
      "mailContext-openInBrowser",
      "mailContext-openLinkInBrowser",
      "mailContext-copylink",
      "mailContext-savelink",
      "mailContext-reportPhishingURL",
      "mailContext-addemail",
      "mailContext-composeemailto",
      "mailContext-copyemail",
      "mailContext-copyimage",
      "mailContext-saveimage",
      "mailContext-copy",
      "mailContext-selectall",
      "mailContext-searchTheWeb",
    ]) {
      document.getElementById(id).hidden = true;
    }
  },

  fillMessageContextMenu({ context, selectionInfo }, browsingContext) {
    function showItem(id, show) {
      let item = document.getElementById(id);
      if (item) {
        item.hidden = !show;
      }
    }

    this.browsingContext = browsingContext;
    this.context = context;
    this.selectionInfo = selectionInfo;

    // showItem("mailContext-openInBrowser", false);
    showItem(
      "mailContext-openLinkInBrowser",
      context.onLink && !context.onMailtoLink
    );
    showItem("mailContext-copylink", context.onLink && !context.onMailtoLink);
    // showItem("mailContext-savelink", false);
    showItem(
      "mailContext-reportPhishingURL",
      context.onLink && !context.onMailtoLink
    );
    showItem("mailContext-addemail", context.onMailtoLink);
    showItem("mailContext-composeemailto", context.onMailtoLink);
    showItem("mailContext-copyemail", context.onMailtoLink);
    showItem("mailContext-copyimage", context.onImage);
    showItem("mailContext-saveimage", context.onLoadedImage);
    showItem(
      "mailContext-copy",
      selectionInfo && !selectionInfo.docSelectionIsCollapsed
    );
    showItem("mailContext-selectall", true);
    showItem(
      "mailContext-searchTheWeb",
      selectionInfo && !selectionInfo.docSelectionIsCollapsed
    );

    let searchTheWeb = document.getElementById("mailContext-searchTheWeb");
    if (!searchTheWeb.hidden) {
      let key = "openSearch.label";
      let abbrSelection;
      if (selectionInfo.text.length > 15) {
        key += ".truncated";
        abbrSelection = selectionInfo.text.slice(0, 15);
      } else {
        abbrSelection = selectionInfo.text;
      }

      searchTheWeb.label = messengerBundle.formatStringFromName(key, [
        Services.search.defaultEngine.name,
        abbrSelection,
      ]);
    }
  },

  fillMailContextMenu(event) {
    function showItem(id, show) {
      let item = document.getElementById(id);
      if (item) {
        item.hidden = !show;
      }
    }

    function enableItem(id, enabled) {
      let item = document.getElementById(id);
      item.disabled = !enabled;
    }

    function setSingleSelection(id, show = true) {
      showItem(id, numSelectedMessages == 1 && show);
      enableItem(id, numSelectedMessages == 1);
    }

    // Hide things that don't work yet.
    for (let id of [
      "mailContext-openInBrowser",
      "mailContext-savelink",
      "mailContext-openConversation",
      "mailContext-openContainingFolder",
      "mailContext-recalculateJunkScore",
      "mailContext-copyMessageUrl",
      "mailContext-archive",
      "mailContext-calendar-convert-menu",
      "mailContext-ignoreThread",
      "mailContext-ignoreSubthread",
      "mailContext-watchThread",
      "mailContext-print",
      "mailContext-downloadSelected",
    ]) {
      showItem(id, false);
    }

    // Ask commandController about the commands it controls.
    for (let [id, command] of Object.entries(this._commandMap)) {
      showItem(id, commandController.isCommandEnabled(command));
    }

    // let canArchive = true;
    let numSelectedMessages = gViewWrapper.dbView.selection.count;
    let isNewsgroup = gFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
    let canMove =
      numSelectedMessages >= 1 && !isNewsgroup && gFolder?.canDeleteMessages;
    let canCopy = numSelectedMessages >= 1;

    setSingleSelection("mailContext-openNewTab");
    setSingleSelection("mailContext-openNewWindow");
    // setSingleSelection(
    //   "mailContext-openConversation",
    //   gConversationOpener.isSelectedMessageIndexed()
    // );
    // setSingleSelection("mailContext-openContainingFolder");
    setSingleSelection("mailContext-forwardAsMenu");
    this._initMessageTags();
    this._initMessageMark();
    // setSingleSelection("mailContext-copyMessageUrl", isNewsgroup);
    // showItem(
    //   "mailContext-archive",
    //   canMove && numSelectedMessages > 0 && canArchive
    // );
    // Disable move if we can't delete message(s) from this folder.
    showItem("mailContext-moveMenu", canMove);
    showItem("mailContext-copyMenu", canCopy);

    window.browsingContext.topChromeWindow.initMoveToFolderAgainMenu(
      document.getElementById("mailContext-moveToFolderAgain")
    );

    // setSingleSelection("mailContext-calendar-convert-menu");
    document.l10n.setAttributes(
      document.getElementById("mailContext-delete"),
      "mail-context-delete-messages",
      { count: numSelectedMessages }
    );
    // showItem("mailContext-ignoreThread", numSelectedMessages >= 1);
    // showItem("mailContext-ignoreSubthread", numSelectedMessages >= 1);
    // showItem("mailContext-downloadSelected", numSelectedMessages > 1);

    let lastItem;
    for (let child of document.getElementById("mailContext").children) {
      if (child.localName == "menuseparator") {
        child.hidden = !lastItem || lastItem.localName == "menuseparator";
      }
      if (!child.hidden) {
        lastItem = child;
      }
    }
    if (lastItem.localName == "menuseparator") {
      lastItem.hidden = true;
    }
  },

  onMailContextMenuCommand(event) {
    // If commandController handles this command, ask it to do so.
    if (event.target.id in this._commandMap) {
      commandController.doCommand(this._commandMap[event.target.id], event);
      return;
    }

    let topChromeWindow = window.browsingContext.topChromeWindow;
    switch (event.target.id) {
      // Links
      // case "mailContext-openInBrowser":
      //   this._openInBrowser();
      //   break;
      case "mailContext-openLinkInBrowser":
        this._openLinkInBrowser();
        break;
      case "mailContext-copylink":
        goDoCommand("cmd_copyLink");
        break;
      // case "mailContext-savelink":
      //   topChromeWindow.saveURL(
      //     this.context.linkURL,
      //     this.context.linkTextStr,
      //     null,
      //     true,
      //     null,
      //     null,
      //     null,
      //     this.browsingContext.window.document
      //   );
      //   break;
      case "mailContext-reportPhishingURL":
        topChromeWindow.gPhishingDetector.reportPhishingURL(
          this.context.linkURL
        );
        break;
      case "mailContext-addemail":
        topChromeWindow.addEmail(this.context.linkURL);
        break;
      case "mailContext-composeemailto":
        topChromeWindow.composeEmailTo(
          this.context.linkURL,
          MailServices.accounts.getFirstIdentityForServer(gFolder.server)
        );
        break;
      case "mailContext-copyemail": {
        let addresses = topChromeWindow.getEmail(this.context.linkURL);
        Cc["@mozilla.org/widget/clipboardhelper;1"]
          .getService(Ci.nsIClipboardHelper)
          .copyString(addresses);
        break;
      }

      // Images
      case "mailContext-copyimage":
        goDoCommand("cmd_copyImage");
        break;
      case "mailContext-saveimage":
        topChromeWindow.saveURL(
          this.context.imageInfo.currentSrc,
          null,
          "SaveImageTitle",
          false,
          null,
          null,
          null,
          this.browsingContext.window.document
        );
        break;

      // Edit
      case "mailContext-copy":
        goDoCommand("cmd_copy");
        break;
      case "mailContext-selectall":
        goDoCommand("cmd_selectAll");
        break;

      // Search
      case "mailContext-searchTheWeb":
        topChromeWindow.openWebSearch(this.selectionInfo.text);
        break;

      // Open messages
      case "mailContext-openNewTab":
        topChromeWindow.OpenMessageInNewTab(gMessage, {
          event,
          viewWrapper: gViewWrapper,
        });
        break;
      case "mailContext-openNewWindow":
        topChromeWindow.MsgOpenNewWindowForMessage(gMessage, gViewWrapper);
        break;
      // case "mailContext-openConversation":
      //   gConversationOpener.openConversationForMessages(gFolderDisplay.selectedMessages);
      //   break;
      // case "mailContext-openContainingFolder":
      //   MailUtils.displayMessageInFolderTab(gMessage);
      //   break;

      // Move/copy/archive/convert/delete
      // (Move and Copy sub-menus are handled in the default case.)
      // case "mailContext-copyMessageUrl":
      //   CopyMessageUrl();
      //   break;
      // case "mailContext-archive":
      //   MsgArchiveSelectedMessages(event);
      //   break;

      // Calendar Convert sub-menu
      // case "mailContext-calendar-convert-event-menuitem":
      //   calendarExtract.extractFromEmail(true);
      //   break;
      // case "mailContext-calendar-convert-task-menuitem":
      //   calendarExtract.extractFromEmail(false);
      //   break;

      // Save/print/download
      case "mailContext-saveAs":
        window.browsingContext.topChromeWindow.SaveAsFile([gMessageURI]);
        break;

      default: {
        let closestMenu = event.target.closest("menu");
        if (closestMenu?.id == "mailContext-moveMenu") {
          this.moveMessage(event.target.gFolder);
        } else if (closestMenu?.id == "mailContext-copyMenu") {
          this.copyMessage(event.target.gFolder);
        }
        break;
      }
    }
  },

  _openLinkInBrowser() {
    LazyModules.PlacesUtils.history
      .insert({
        url: this.context.linkURL,
        visits: [
          {
            date: new Date(),
          },
        ],
      })
      .catch(Cu.reportError);
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(this.context.linkURL));
  },

  // Tags sub-menu

  /**
   * Refresh the contents of the tag popup menu/panel.
   * Used for example for appmenu/Message/Tag panel.
   *
   * @param {Element} parent          Parent element that will contain the menu items.
   * @param {string} [elementName]    Type of menu item, e.g. "menuitem", "toolbarbutton".
   * @param {string} [classes]        Classes to set on the menu items.
   */
  _initMessageTags() {
    let parent = document.getElementById("mailContext-tagpopup");
    // Remove any existing non-static items (clear tags list before rebuilding it).
    // There is a separator element above the dynamically added tag elements, so
    // remove dynamically added elements below the separator.
    while (parent.lastElementChild.localName == "menuitem") {
      parent.lastElementChild.remove();
    }

    // Create label and accesskey for the static "remove all tags" item.
    let removeItem = document.getElementById("mailContext-tagRemoveAll");
    removeItem.label = messengerBundle.GetStringFromName(
      "mailnews.tags.remove"
    );

    // Rebuild the list.
    let currentTags = gMessage.getStringProperty("keywords").split(" ");
    let index = 1;

    for (let tagInfo of MailServices.tags.getAllTags()) {
      let msgHasTag = currentTags.includes(tagInfo.key);
      if (tagInfo.ordinal.includes("~AUTOTAG") && !msgHasTag) {
        return;
      }

      let item = document.createXULElement("menuitem");
      item.accessKey = index < 10 ? index : "";
      item.label = messengerBundle.formatStringFromName(
        "mailnews.tags.format",
        [item.accessKey, tagInfo.tag]
      );
      item.setAttribute("type", "checkbox");
      if (msgHasTag) {
        item.setAttribute("checked", "true");
      }
      item.setAttribute("value", tagInfo.key);
      item.addEventListener("command", event =>
        this._toggleMessageTag(
          tagInfo.key,
          item.getAttribute("checked") == "true"
        )
      );
      if (tagInfo.color) {
        item.setAttribute("style", `color: ${tagInfo.color};`);
      }
      parent.appendChild(item);

      index++;
    }
  },

  removeAllMessageTags() {
    let selectedMessages = [gMessage];
    if (!selectedMessages.length) {
      return;
    }

    let messages = [];
    let allKeys = MailServices.tags
      .getAllTags()
      .map(t => t.key)
      .join(" ");
    let prevHdrFolder = null;

    // This crudely handles cross-folder virtual folders with selected
    // messages that spans folders, by coalescing consecutive messages in the
    // selection that happen to be in the same folder. nsMsgSearchDBView does
    // this better, but nsIMsgDBView doesn't handle commands with arguments,
    // and untag takes a key argument. Furthermore, we only delete known tags,
    // keeping other keywords like (non)junk intact.
    for (let i = 0; i < selectedMessages.length; ++i) {
      let msgHdr = selectedMessages[i];
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
  },

  _toggleMessageTag(key, addKey) {
    let messages = [];
    let selectedMessages = [gMessage];
    let toggler = addKey
      ? "addKeywordsToMessages"
      : "removeKeywordsFromMessages";
    let prevHdrFolder = null;
    // this crudely handles cross-folder virtual folders with selected messages
    // that spans folders, by coalescing consecutive msgs in the selection
    // that happen to be in the same folder. nsMsgSearchDBView does this
    // better, but nsIMsgDBView doesn't handle commands with arguments,
    // and (un)tag takes a key argument.
    for (let i = 0; i < selectedMessages.length; ++i) {
      let msgHdr = selectedMessages[i];
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
  },

  addTag() {
    window.browsingContext.topChromeWindow.openDialog(
      "chrome://messenger/content/newTagDialog.xhtml",
      "",
      "chrome,titlebar,modal,centerscreen",
      {
        result: "",
        okCallback(name, color) {
          MailServices.tags.addTag(name, color, "");
          let key = MailServices.tags.getKeyForTag(name);
          LazyModules.TagUtils.addTagToAllDocumentSheets(key, color);

          try {
            this._toggleMessageTag(key, true);
          } catch (ex) {
            return false;
          }
          return true;
        },
      }
    );
  },

  // Mark sub-menu

  _initMessageMark() {
    let selectedIndex = {};
    gViewWrapper.dbView.selection.getRangeAt(0, selectedIndex, {});

    document.getElementById("mailContext-markRead").disabled = gMessage.isRead;
    document.getElementById(
      "mailContext-markUnread"
    ).disabled = !gMessage.isRead;
    document.getElementById("mailContext-markThreadAsRead").disabled =
      gViewWrapper.dbView.getThreadContainingIndex(selectedIndex.value)
        .numUnreadChildren == 0;
    document
      .getElementById("mailContext-markFlagged")
      .setAttribute("checked", gMessage.isFlagged);

    let enabledObj = {};
    let checkStatusObj = {};
    gViewWrapper.dbView.getCommandStatus(
      Ci.nsMsgViewCommandType.junk,
      enabledObj,
      checkStatusObj
    );
    document.getElementById(
      "mailContext-markAsJunk"
    ).disabled = !enabledObj.value;
    document.getElementById(
      "mailContext-markAsNotJunk"
    ).disabled = !enabledObj.value;

    // gViewWrapper.dbView.getCommandStatus(
    //   Ci.nsMsgViewCommandType.runJunkControls,
    //   enabledObj,
    //   checkStatusObj
    // );
    // document.getElementById(
    //   "mailContext-recalculateJunkScore"
    // ).disabled = !enabledObj.value;
  },

  // Move/copy

  /**
   * Moves the selected messages to the destination folder
   * @param destFolder  the destination folder
   */
  moveMessage(destFolder) {
    // gFolderDisplay.hintAboutToDeleteMessages();
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
   * Copies the selected messages to the destination folder
   * @param destFolder  the destination folder
   */
  copyMessage(destFolder) {
    gViewWrapper.dbView.doCommandWithFolder(
      Ci.nsMsgViewCommandType.copyMessages,
      destFolder
    );
    Services.prefs.setCharPref(
      "mail.last_msg_movecopy_target_uri",
      destFolder.URI
    );
    Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", false);
  },
};

var commandController = {
  _composeCommands: {
    cmd_editDraftMsg: Ci.nsIMsgCompType.Draft,
    cmd_newMsgFromTemplate: Ci.nsIMsgCompType.Template,
    cmd_editTemplateMsg: Ci.nsIMsgCompType.EditTemplate,
    cmd_replyGroup: Ci.nsIMsgCompType.ReplyToGroup,
    cmd_replySender: Ci.nsIMsgCompType.ReplyToSender,
    cmd_replyall: Ci.nsIMsgCompType.ReplyAll,
    cmd_replylist: Ci.nsIMsgCompType.ReplyToList,
    cmd_forwardInline: Ci.nsIMsgCompType.ForwardInline,
    cmd_forwardAttachment: Ci.nsIMsgCompType.ForwardAsAttachment,
    cmd_redirect: Ci.nsIMsgCompType.Redirect,
    cmd_editAsNew: Ci.nsIMsgCompType.EditAsNew,
  },
  _viewCommands: {
    cmd_toggleRead: Ci.nsMsgViewCommandType.toggleMessageRead,
    cmd_markAsRead: Ci.nsMsgViewCommandType.markMessagesRead,
    cmd_markAsUnread: Ci.nsMsgViewCommandType.markMessagesUnread,
    cmd_markThreadAsRead: Ci.nsMsgViewCommandType.markThreadRead,
    cmd_markAllRead: Ci.nsMsgViewCommandType.markAllRead,
    cmd_markAsNotJunk: Ci.nsMsgViewCommandType.unjunk,
  },
  _callbackCommands: {
    cmd_reply: event => {
      if (gFolder.flags & Ci.nsMsgFolderFlags.Newsgroup) {
        this.doCommand("cmd_replyGroup", event);
      } else {
        this.doCommand("cmd_replySender", event);
      }
    },
    cmd_forward: () => {
      if (Services.prefs.getIntPref("mail.forward_message_mode", 0) == 0) {
        this.doCommand("cmd_forwardAttachment");
      } else {
        this.doCommand("cmd_forwardInline");
      }
    },
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
    cmd_markReadByDate() {
      window.browsingContext.topChromeWindow.openDialog(
        "chrome://messenger/content/markByDate.xhtml",
        "",
        "chrome,modal,titlebar,centerscreen",
        gFolder
      );
    },
    cmd_markAsFlagged() {
      if (gMessage.isFlagged) {
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.unflagMessages);
      } else {
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.flagMessages);
      }
    },
    cmd_markAsJunk() {
      if (
        Services.prefs.getBoolPref("mailnews.ui.junk.manualMarkAsJunkMarksRead")
      ) {
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.markMessagesRead);
      }
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.junk);
    },
    // cmd_recalculateJunkScore() {},
    cmd_moveToFolderAgain() {
      let folder = LazyModules.MailUtils.getOrCreateFolder(
        Services.prefs.getCharPref("mail.last_msg_movecopy_target_uri")
      );
      if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
        mailContextMenu.moveMessage(folder);
      } else {
        mailContextMenu.copyMessage(folder);
      }
    },
    cmd_delete() {
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.markMessagesRead);
      gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
    },
    // cmd_killThread() {},
    // cmd_killSubthread() {},
    // cmd_watchThread() {},
    // cmd_print() {},
    // cmd_downloadSelected() {},
  },
  _isCallbackEnabled: {},

  registerCallback(name, callback, isEnabled = true) {
    this._callbackCommands[name] = callback;
    this._isCallbackEnabled[name] = isEnabled;
  },

  supportsCommand(command) {
    return (
      command in this._composeCommands ||
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

    let numSelectedMessages = gViewWrapper.dbView.selection.count;
    let isNewsgroup = gFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
    let canMove =
      numSelectedMessages >= 1 && !isNewsgroup && gFolder?.canDeleteMessages;

    switch (command) {
      case "cmd_reply":
      case "cmd_replySender":
      case "cmd_replyall":
      case "cmd_replylist":
      case "cmd_forward":
      case "cmd_redirect":
      case "cmd_editAsNew":
        return numSelectedMessages == 1;
      case "cmd_forwardInline":
      case "cmd_forwardAttachment":
      case "cmd_addTag":
      case "cmd_manageTags":
      case "cmd_removeTags":
      case "cmd_toggleRead":
      case "cmd_markAsRead":
      case "cmd_markAsUnread":
      case "cmd_markThreadAsRead":
      case "cmd_markReadByDate":
      case "cmd_markAllRead":
      case "cmd_markAsFlagged":
      case "cmd_markAsJunk":
      case "cmd_markAsNotJunk":
        return numSelectedMessages >= 1;
      case "cmd_editDraftMsg":
        return (
          numSelectedMessages == 1 &&
          gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)
        );
      case "cmd_newMsgFromTemplate":
      case "cmd_editTemplateMsg":
        return (
          numSelectedMessages == 1 &&
          gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)
        );
      case "cmd_replyGroup":
        return isNewsgroup;
      case "cmd_moveToFolderAgain": {
        // Disable "Move to <folder> Again" for news and other read only
        // folders since we can't really move messages from there - only copy.
        let canMoveAgain = numSelectedMessages >= 1;
        if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
          canMoveAgain = canMove;
        }
        if (canMoveAgain) {
          let targetURI = Services.prefs.getCharPref(
            "mail.last_msg_movecopy_target_uri"
          );
          canMoveAgain =
            targetURI && LazyModules.MailUtils.getExistingFolder(targetURI);
        }
        return canMoveAgain;
      }
      case "cmd_delete":
        return isNewsgroup || canMove;
    }

    return false;
  },
  doCommand(command, event) {
    if (!this.isCommandEnabled(command)) {
      return;
    }

    if (command in this._composeCommands) {
      this._composeMsgByType(this._composeCommands[command], event);
      return;
    }

    if (command in this._viewCommands) {
      gViewWrapper.dbView.doCommand(this._viewCommands[command]);
      return;
    }

    if (command in this._callbackCommands) {
      this._callbackCommands[command](event);
    }
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
    let msgUris = gMessageURI ? [gMessageURI] : [];

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
};

/**
 * Dummy DBViewWrapperListener so that we can have a DBViewWrapper. Some of
 * this will no doubt need to be filled in later.
 */
var dbViewWrapperListener = {
  messenger: null,
  msgWindow: null,
  threadPaneCommandUpdater: null,

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
  onCreatedView() {},
  onDestroyingView(folderIsComingBack) {},
  onLoadingFolder(dbFolderInfo) {},
  onDisplayingFolder() {},
  onLeavingFolder() {},
  onMessagesLoaded(all) {},
  onMailViewChanged() {},
  onSortChanged() {},
  onMessagesRemoved() {},
  onMessageRemovalFailed() {},
  onMessageCountsChanged() {},
};
