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
  window.controllers.appendController(commandController);
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

    // let canArchive = true;
    let numSelectedMessages = window.gViewWrapper
      ? gViewWrapper.dbView.selection.count
      : 1;
    let isNewsgroup = gFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
    let canMove =
      numSelectedMessages >= 1 && !isNewsgroup && gFolder?.canDeleteMessages;
    let canCopy = numSelectedMessages >= 1;

    setSingleSelection(
      "mailContext-editDraftMsg",
      gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)
    );
    setSingleSelection(
      "mailContext-newMsgFromTemplate",
      gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)
    );
    setSingleSelection(
      "mailContext-editTemplateMsg",
      gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)
    );
    setSingleSelection("mailContext-openNewTab");
    setSingleSelection("mailContext-openNewWindow");
    // setSingleSelection(
    //   "mailContext-openConversation",
    //   gConversationOpener.isSelectedMessageIndexed()
    // );
    // setSingleSelection("mailContext-openContainingFolder");
    setSingleSelection("mailContext-replyNewsgroup", isNewsgroup);
    setSingleSelection("mailContext-replySender");
    setSingleSelection("mailContext-replyAll");
    setSingleSelection("mailContext-replyList");
    setSingleSelection("mailContext-forward");
    setSingleSelection("mailContext-forwardAsMenu");
    showItem("mailContext-multiForwardAsAttachment", numSelectedMessages > 1);
    setSingleSelection("mailContext-redirect");
    setSingleSelection("mailContext-editAsNew");
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
    window.browsingContext.topChromeWindow.initMoveToFolderAgainMenu(
      document.getElementById("mailContext-moveToFolderAgain")
    );
    showItem("mailContext-moveToFolderAgain", canMoveAgain);

    // setSingleSelection("mailContext-calendar-convert-menu");
    showItem("mailContext-delete", isNewsgroup || canMove);
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

      // Drafts/templates
      case "mailContext-editDraftMsg":
        commandController.doCommand("cmd_editDraftMsg", event);
        break;
      case "mailContext-newMsgFromTemplate":
        commandController.doCommand("cmd_newMsgFromTemplate", event);
        break;
      case "mailContext-editTemplateMsg":
        commandController.doCommand("cmd_editTemplateMsg", event);
        break;

      // Open messages
      case "mailContext-openNewTab":
        topChromeWindow.OpenMessageInNewTab(gMessage, event);
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

      // Reply/forward/redirect
      case "mailContext-replyNewsgroup":
        commandController.doCommand("cmd_replyGroup", event);
        break;
      case "mailContext-replySender":
        commandController.doCommand("cmd_replySender", event);
        break;
      case "mailContext-replyAll":
        commandController.doCommand("cmd_replyall", event);
        break;
      case "mailContext-replyList":
        commandController.doCommand("cmd_replylist", event);
        break;
      case "mailContext-forward":
        commandController.doCommand("cmd_forward");
        break;
      case "mailContext-forwardAsInline":
        commandController.doCommand("cmd_forwardInline");
        break;

      // Forward As sub-menu
      case "mailContext-forwardAsAttachment":
      case "mailContext-multiForwardAsAttachment":
        commandController.doCommand("cmd_forwardAttachment");
        break;

      case "mailContext-redirect":
        commandController.doCommand("cmd_redirect");
        break;
      case "mailContext-editAsNew":
        commandController.doCommand("cmd_editAsNew");
        break;

      // "Tags" sub-menu
      case "mailContext-addNewTag":
        goDoCommand("cmd_addTag");
        break;
      case "mailContext-manageTags":
        goDoCommand("cmd_manageTags");
        break;
      case "mailContext-tagRemoveAll":
        goDoCommand("cmd_removeTags");
        break;

      // "Mark" sub-menu
      case "mailContext-markRead":
        goDoCommand("cmd_markAsRead");
        break;
      case "mailContext-markUnread":
        goDoCommand("cmd_markAsUnread");
        break;
      case "mailContext-markThreadAsRead":
        goDoCommand("cmd_markThreadAsRead");
        break;
      case "mailContext-markReadByDate":
        goDoCommand("cmd_markReadByDate");
        break;
      case "mailContext-markAllRead":
        goDoCommand("cmd_markAllRead");
        break;
      case "mailContext-markFlagged":
        goDoCommand("cmd_markAsFlagged");
        break;
      case "mailContext-markAsJunk":
        goDoCommand("cmd_markAsJunk");
        break;
      case "mailContext-markAsNotJunk":
        goDoCommand("cmd_markAsNotJunk");
        break;
      // case "mailContext-recalculateJunkScore":
      //   goDoCommand("cmd_recalculateJunkScore");
      //   break;

      // Move/copy/archive/convert/delete
      // (Move and Copy sub-menus are handled in the default case.)
      // case "mailContext-copyMessageUrl":
      //   CopyMessageUrl();
      //   break;
      // case "mailContext-archive":
      //   MsgArchiveSelectedMessages(event);
      //   break;

      case "mailcontext-moveToFolderAgain":
        goDoCommand("cmd_moveToFolderAgain");
        break;

      // Calendar Convert sub-menu
      // case "mailContext-calendar-convert-event-menuitem":
      //   calendarExtract.extractFromEmail(true);
      //   break;
      // case "mailContext-calendar-convert-task-menuitem":
      //   calendarExtract.extractFromEmail(false);
      //   break;

      case "mailContext-delete":
        goDoCommand("cmd_delete");
        break;

      // Threads
      // case "mailContext-ignoreThread":
      //   goDoCommand("cmd_killThread");
      //   break;
      // case "mailContext-ignoreSubthread":
      //   goDoCommand("cmd_killSubthread");
      //   break;
      // case "mailContext-watchThread":
      //   goDoCommand("cmd_watchThread");
      //   break;

      // Save/print/download
      case "mailContext-saveAs":
        window.browsingContext.topChromeWindow.SaveAsFile([gMessageURI]);
        break;
      // case "mailContext-print":
      //   goDoCommand("cmd_print");
      //   break;
      // case "mailContext-downloadSelected":
      //   goDoCommand("cmd_downloadSelected");
      //   break;

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
  _commands: [
    "cmd_reply",
    "cmd_forward",
    "cmd_addTag",
    "cmd_manageTags",
    "cmd_removeTags",
    "cmd_markReadByDate",
    "cmd_markAllRead",
    "cmd_markAsFlagged",
    "cmd_markAsJunk",
    // "cmd_recalculateJunkScore",
    "cmd_moveToFolderAgain",
    "cmd_delete",
    // "cmd_killThread",
    // "cmd_killSubthread",
    // "cmd_watchThread",
    // "cmd_print",
    // "cmd_downloadSelected",
  ],
  supportsCommand(command) {
    return (
      command in this._composeCommands ||
      command in this._viewCommands ||
      this._commands.includes(command)
    );
  },
  isCommandEnabled(command) {
    return true;
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

    let topChromeWindow = window.browsingContext.topChromeWindow;
    switch (command) {
      case "cmd_reply":
        if (gFolder.flags & Ci.nsMsgFolderFlags.Newsgroup) {
          this.doCommand("cmd_replyGroup", event);
        } else {
          this.doCommand("cmd_replySender", event);
        }
        break;
      case "cmd_forward":
        if (Services.prefs.getIntPref("mail.forward_message_mode", 0) == 0) {
          this.doCommand("cmd_forwardAttachment");
        } else {
          this.doCommand("cmd_forwardInline");
        }
        break;
      case "cmd_addTag":
        mailContextMenu.addTag();
        break;
      case "cmd_manageTags":
        topChromeWindow.openOptionsDialog("paneGeneral", "tagsCategory");
        break;
      case "cmd_removeTags":
        mailContextMenu.removeAllMessageTags();
        break;
      case "cmd_markReadByDate":
        topChromeWindow.openDialog(
          "chrome://messenger/content/markByDate.xhtml",
          "",
          "chrome,modal,titlebar,centerscreen",
          gFolder
        );
        break;
      case "cmd_markAsFlagged":
        if (gMessage.isFlagged) {
          gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.unflagMessages);
        } else {
          gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.flagMessages);
        }
        break;
      case "cmd_markAsJunk":
        if (
          Services.prefs.getBoolPref(
            "mailnews.ui.junk.manualMarkAsJunkMarksRead"
          )
        ) {
          gViewWrapper.dbView.doCommand(
            Ci.nsMsgViewCommandType.markMessagesRead
          );
        }
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.junk);
        break;
      // case "cmd_recalculateJunkScore":
      //   break;
      case "cmd_moveToFolderAgain":
        let folder = LazyModules.MailUtils.getOrCreateFolder(
          Services.prefs.getCharPref("mail.last_msg_movecopy_target_uri")
        );
        if (Services.prefs.getBoolPref("mail.last_msg_movecopy_was_move")) {
          mailContextMenu.moveMessage(folder);
        } else {
          mailContextMenu.copyMessage(folder);
        }
        break;
      case "cmd_delete":
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.markMessagesRead);
        gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
        break;
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
