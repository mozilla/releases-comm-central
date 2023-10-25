/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// mailCommon.js
/* globals commandController */

// about:3pane and about:message must BOTH provide these:

/* globals goDoCommand */ // globalOverlay.js
/* globals gDBView, gFolder, gViewWrapper, messengerBundle */

// mailCommon.js
/* globals gEncryptedURIService */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  calendarDeactivator:
    "resource:///modules/calendar/calCalendarDeactivator.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  PhishingDetector: "resource:///modules/PhishingDetector.jsm",
  TagUtils: "resource:///modules/TagUtils.jsm",
});

/**
 * Called by ContextMenuParent if this window is about:3pane, or is
 * about:message but not contained by about:3pane.
 *
 * @returns {boolean} true if this function opened the context menu
 */
function openContextMenu({ data, target }, browser) {
  if (window.browsingContext.parent != window.browsingContext.top) {
    // Not sure how we'd get here, but let's not continue if we do.
    return false;
  }

  if (browser.getAttribute("context") != "mailContext") {
    return false;
  }

  mailContextMenu.setAsMessagePaneContextMenu(data, target.browsingContext);
  let screenX = data.context.screenXDevPx / window.devicePixelRatio;
  let screenY = data.context.screenYDevPx / window.devicePixelRatio;
  let popup = document.getElementById("mailContext");
  popup.openPopupAtScreen(screenX, screenY, true);

  return true;
}

var mailContextMenu = {
  /**
   * @type {XULPopupElement}
   */
  _menupopup: null,

  // Commands handled by commandController.
  _commands: {
    "mailContext-editDraftMsg": "cmd_editDraftMsg",
    "mailContext-newMsgFromTemplate": "cmd_newMsgFromTemplate",
    "mailContext-editTemplateMsg": "cmd_editTemplateMsg",
    "mailContext-openConversation": "cmd_openConversation",
    "mailContext-replyNewsgroup": "cmd_replyGroup",
    "mailContext-replySender": "cmd_replySender",
    "mailContext-replyAll": "cmd_replyall",
    "mailContext-replyList": "cmd_replylist",
    "mailContext-forward": "cmd_forward",
    "mailContext-forwardAsInline": "cmd_forwardInline",
    "mailContext-forwardAsAttachment": "cmd_forwardAttachment",
    "mailContext-multiForwardAsAttachment": "cmd_forwardAttachment",
    "mailContext-redirect": "cmd_redirect",
    "mailContext-cancel": "cmd_cancel",
    "mailContext-editAsNew": "cmd_editAsNew",
    "mailContext-addNewTag": "cmd_addTag",
    "mailContext-manageTags": "cmd_manageTags",
    "mailContext-tagRemoveAll": "cmd_removeTags",
    "mailContext-markReadByDate": "cmd_markReadByDate",
    "mailContext-markFlagged": "cmd_markAsFlagged",
    "mailContext-archive": "cmd_archive",
    "mailContext-moveToFolderAgain": "cmd_moveToFolderAgain",
    "mailContext-decryptToFolder": "cmd_copyDecryptedTo",
    "mailContext-delete": "cmd_deleteMessage",
    "mailContext-ignoreThread": "cmd_killThread",
    "mailContext-ignoreSubthread": "cmd_killSubthread",
    "mailContext-watchThread": "cmd_watchThread",
    "mailContext-saveAs": "cmd_saveAsFile",
    "mailContext-print": "cmd_print",
    "mailContext-downloadSelected": "cmd_downloadSelected",
  },

  // More commands handled by commandController, except these ones get
  // disabled instead of hidden.
  _alwaysVisibleCommands: {
    "mailContext-markRead": "cmd_markAsRead",
    "mailContext-markUnread": "cmd_markAsUnread",
    "mailContext-markThreadAsRead": "cmd_markThreadAsRead",
    "mailContext-markAllRead": "cmd_markAllRead",
    "mailContext-markAsJunk": "cmd_markAsJunk",
    "mailContext-markAsNotJunk": "cmd_markAsNotJunk",
    "mailContext-recalculateJunkScore": "cmd_recalculateJunkScore",
  },

  /**
   * If we have overridden the selection for the context menu.
   *
   * @see `setOverrideSelection`
   * @type {boolean}
   */
  _selectionIsOverridden: false,

  init() {
    this._menupopup = document.getElementById("mailContext");
    this._menupopup.addEventListener("popupshowing", this);
    this._menupopup.addEventListener("popuphidden", this);
    this._menupopup.addEventListener("command", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "popupshowing":
        this.onPopupShowing(event);
        break;
      case "popuphidden":
        this.onPopupHidden(event);
        break;
      case "command":
        this.onCommand(event);
        break;
    }
  },

  onPopupShowing(event) {
    if (event.target == this._menupopup) {
      this.fillMailContextMenu(event);
    }
  },

  onPopupHidden(event) {
    if (event.target == this._menupopup) {
      this.clearOverrideSelection();
    }
  },

  onCommand(event) {
    this.onMailContextMenuCommand(event);
  },

  /**
   * Override the selection that this context menu should operate on. The
   * effect lasts until `clearOverrideSelection` is called by `onPopupHidden`.
   *
   * @param {integer} index - The index of the row to use as selection.
   */
  setOverrideSelection(index) {
    this._selectionIsOverridden = true;
    window.threadPane.saveSelection();
    window.threadTree._selection.selectEventsSuppressed = true;
    window.threadTree._selection.select(index);
  },

  /**
   * Has the real selection been overridden by a right-click on a message that
   * wasn't selected?
   *
   * @type {boolean}
   */
  get selectionIsOverridden() {
    return this._selectionIsOverridden;
  },

  /**
   * Clear the overriding selection, and go back to the previous selection.
   */
  clearOverrideSelection() {
    if (!window.threadTree) {
      return;
    }
    if (this._selectionIsOverridden) {
      window.threadTree._selection.selectEventsSuppressed = true;
      window.threadPane.restoreSelection(undefined, false);
      this._selectionIsOverridden = false;
      window.threadTree.invalidate();
    }
    window.threadTree
      .querySelector(".context-menu-target")
      ?.classList.remove("context-menu-target");
    window.threadTree._selection.selectEventsSuppressed = false;
    window.threadTree.table.body.focus();
  },

  setAsThreadPaneContextMenu() {
    delete this.browsingContext;
    delete this.context;
    delete this.selectionInfo;
    this.inThreadTree = true;

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

  setAsMessagePaneContextMenu({ context, selectionInfo }, browsingContext) {
    function showItem(id, show) {
      let item = document.getElementById(id);
      if (item) {
        item.hidden = !show;
      }
    }

    delete this.inThreadTree;
    this.browsingContext = browsingContext;
    this.context = context;
    this.selectionInfo = selectionInfo;

    // showItem("mailContext-openInBrowser", false);
    showItem(
      "mailContext-openLinkInBrowser",
      context.onLink && !context.onMailtoLink
    );
    showItem("mailContext-copylink", context.onLink && !context.onMailtoLink);
    showItem("mailContext-savelink", context.onLink);
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

    function checkItem(id, checked) {
      let item = document.getElementById(id);
      if (item) {
        // Convert truthy/falsy to boolean before string.
        item.setAttribute("checked", !!checked);
      }
    }

    function setSingleSelection(id, show = true) {
      showItem(id, numSelectedMessages == 1 && show);
      enableItem(id, numSelectedMessages == 1);
    }

    // Hide things that don't work yet.
    for (let id of [
      "mailContext-openInBrowser",
      "mailContext-recalculateJunkScore",
    ]) {
      showItem(id, false);
    }

    let onSpecialItem =
      this.context?.isContentSelected ||
      this.context?.onCanvas ||
      this.context?.onLink ||
      this.context?.onImage ||
      this.context?.onAudio ||
      this.context?.onVideo ||
      this.context?.onTextInput;

    for (let id of ["mailContext-tags", "mailContext-mark"]) {
      showItem(id, !onSpecialItem);
    }

    // Ask commandController about the commands it controls.
    for (let [id, command] of Object.entries(this._commands)) {
      showItem(
        id,
        !onSpecialItem && commandController.isCommandEnabled(command)
      );
    }
    for (let [id, command] of Object.entries(this._alwaysVisibleCommands)) {
      showItem(id, !onSpecialItem);
      enableItem(id, commandController.isCommandEnabled(command));
    }

    let inAbout3Pane = !!window.threadTree;
    let inThreadTree = !!this.inThreadTree;

    let message =
      gFolder || gViewWrapper.isSynthetic
        ? gDBView?.hdrForFirstSelectedMessage
        : top.messenger.msgHdrFromURI(window.gMessageURI);
    let folder = message?.folder;
    let isDummyMessage = !gViewWrapper.isSynthetic && !folder;

    let numSelectedMessages = isDummyMessage ? 1 : gDBView.numSelected;
    let isNewsgroup = folder?.isSpecialFolder(
      Ci.nsMsgFolderFlags.Newsgroup,
      true
    );
    let canMove =
      numSelectedMessages >= 1 && !isNewsgroup && folder?.canDeleteMessages;
    let canCopy = numSelectedMessages >= 1;

    setSingleSelection("mailContext-openNewTab", inThreadTree);
    setSingleSelection("mailContext-openNewWindow", inThreadTree);
    setSingleSelection(
      "mailContext-openContainingFolder",
      (!isDummyMessage && !inAbout3Pane) || gViewWrapper.isSynthetic
    );
    setSingleSelection("mailContext-forward", !onSpecialItem);
    setSingleSelection("mailContext-forwardAsMenu", !onSpecialItem);
    showItem(
      "mailContext-multiForwardAsAttachment",
      numSelectedMessages > 1 &&
        commandController.isCommandEnabled("cmd_forwardAttachment")
    );

    if (isDummyMessage) {
      showItem("mailContext-tags", false);
    } else {
      showItem("mailContext-tags", true);
      this._initMessageTags();
    }

    showItem("mailContext-mark", !isDummyMessage);
    checkItem("mailContext-markFlagged", message?.isFlagged);

    setSingleSelection("mailContext-copyMessageUrl", !!isNewsgroup);
    // Disable move if we can't delete message(s) from this folder.
    showItem("mailContext-moveMenu", canMove && !onSpecialItem);
    showItem("mailContext-copyMenu", canCopy && !onSpecialItem);

    top.initMoveToFolderAgainMenu(
      document.getElementById("mailContext-moveToFolderAgain")
    );

    // Show only if a message is actively selected in the DOM.
    // extractFromEmail can't work on dummy messages.
    showItem(
      "mailContext-calendar-convert-menu",
      numSelectedMessages == 1 &&
        !isDummyMessage &&
        calendarDeactivator.isCalendarActivated
    );

    document.l10n.setAttributes(
      document.getElementById("mailContext-delete"),
      message.flags & Ci.nsMsgMessageFlags.IMAPDeleted
        ? "mail-context-undelete-messages"
        : "mail-context-delete-messages",
      {
        count: numSelectedMessages,
      }
    );

    checkItem(
      "mailContext-ignoreThread",
      folder?.msgDatabase.isIgnored(message?.messageKey)
    );
    checkItem(
      "mailContext-ignoreSubthread",
      folder && message.flags & Ci.nsMsgMessageFlags.Ignored
    );
    checkItem(
      "mailContext-watchThread",
      folder?.msgDatabase.isWatched(message?.messageKey)
    );

    showItem(
      "mailContext-downloadSelected",
      window.threadTree && numSelectedMessages > 1
    );

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

    // The rest of this block sends menu information to WebExtensions.

    let selectionInfo = this.selectionInfo;
    let isContentSelected = selectionInfo
      ? !selectionInfo.docSelectionIsCollapsed
      : false;
    let textSelected = selectionInfo ? selectionInfo.text : "";
    let isTextSelected = !!textSelected.length;

    let tabmail = top.document.getElementById("tabmail");
    let subject = {
      menu: event.target,
      tab: tabmail ? tabmail.currentTabInfo : top,
      isContentSelected,
      isTextSelected,
      onTextInput: this.context?.onTextInput,
      onLink: this.context?.onLink,
      onImage: this.context?.onImage,
      onEditable: this.context?.onEditable,
      srcUrl: this.context?.mediaURL,
      linkText: this.context?.linkTextStr,
      linkUrl: this.context?.linkURL,
      selectionText: isTextSelected ? selectionInfo.fullText : undefined,
      pageUrl: this.browsingContext?.currentURI?.spec,
    };

    if (inThreadTree) {
      subject.displayedFolder = folder;
      subject.selectedMessages = gDBView.getSelectedMsgHdrs();
    }

    subject.context = subject;
    subject.wrappedJSObject = subject;

    Services.obs.notifyObservers(subject, "on-prepare-contextmenu");
    Services.obs.notifyObservers(subject, "on-build-contextmenu");
  },

  onMailContextMenuCommand(event) {
    // If commandController handles this command, ask it to do so.
    if (event.target.id in this._commands) {
      commandController.doCommand(this._commands[event.target.id], event);
      return;
    }
    if (event.target.id in this._alwaysVisibleCommands) {
      commandController.doCommand(
        this._alwaysVisibleCommands[event.target.id],
        event
      );
      return;
    }

    switch (event.target.id) {
      // Links
      // case "mailContext-openInBrowser":
      //   this._openInBrowser();
      //   break;
      case "mailContext-openLinkInBrowser":
        // Only called in about:message.
        top.openLinkExternally(this.context.linkURL);
        break;
      case "mailContext-copylink":
        goDoCommand("cmd_copyLink");
        break;
      case "mailContext-savelink":
        top.saveURL(
          this.context.linkURL, // URL
          null, // originalURL
          this.context.linkTextStr, // fileName
          null, // filePickerTitleKey
          true, // shouldBypassCache
          false, // skipPrompt
          null, // referrerInfo
          null, // cookieJarSettings
          this.browsingContext.window.document, // sourceDocument
          null, // isContentWindowPrivate,
          Services.scriptSecurityManager.getSystemPrincipal() // principal
        );
        break;
      case "mailContext-reportPhishingURL":
        PhishingDetector.reportPhishingURL(this.context.linkURL);
        break;
      case "mailContext-addemail":
        top.addEmail(this.context.linkURL);
        break;
      case "mailContext-composeemailto":
        top.composeEmailTo(
          this.context.linkURL,
          gFolder
            ? MailServices.accounts.getFirstIdentityForServer(gFolder.server)
            : null
        );
        break;
      case "mailContext-copyemail": {
        let addresses = top.getEmail(this.context.linkURL);
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
        top.saveURL(
          this.context.imageInfo.currentSrc, // URL
          null, // originalURL
          this.context.linkTextStr, // fileName
          "SaveImageTitle", // filePickerTitleKey
          true, // shouldBypassCache
          false, // skipPrompt
          null, // referrerInfo
          null, // cookieJarSettings
          this.browsingContext.window?.document, // sourceDocument
          null, // isContentWindowPrivate,
          Services.scriptSecurityManager.getSystemPrincipal() // principal
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
        top.openWebSearch(this.selectionInfo.text);
        break;

      // Open messages
      case "mailContext-openNewTab":
        top.OpenMessageInNewTab(gDBView.hdrForFirstSelectedMessage, {
          event,
          viewWrapper: gViewWrapper,
        });
        break;
      case "mailContext-openNewWindow":
        top.MsgOpenNewWindowForMessage(
          gDBView.hdrForFirstSelectedMessage,
          gViewWrapper
        );
        break;
      case "mailContext-openContainingFolder":
        MailUtils.displayMessageInFolderTab(gDBView.hdrForFirstSelectedMessage);
        break;

      // Move/copy/archive/convert/delete
      // (Move and Copy sub-menus are handled in the default case.)
      case "mailContext-copyMessageUrl": {
        let message = gDBView.hdrForFirstSelectedMessage;
        let server = message?.folder?.server;

        if (!server) {
          return;
        }

        // TODO let backend construct URL and return as attribute
        let url =
          server.socketType == Ci.nsMsgSocketType.SSL ? "snews://" : "news://";
        url += server.hostName + ":" + server.port + "/" + message.messageId;

        Cc["@mozilla.org/widget/clipboardhelper;1"]
          .getService(Ci.nsIClipboardHelper)
          .copyString(url);
        break;
      }

      // Calendar Convert sub-menu
      case "mailContext-calendar-convert-event-menuitem":
        top.calendarExtract.extractFromEmail(
          gDBView.hdrForFirstSelectedMessage,
          true
        );
        break;
      case "mailContext-calendar-convert-task-menuitem":
        top.calendarExtract.extractFromEmail(
          gDBView.hdrForFirstSelectedMessage,
          false
        );
        break;

      // Save/print/download
      default: {
        if (
          document.getElementById("mailContext-moveMenu").contains(event.target)
        ) {
          commandController.doCommand("cmd_moveMessage", event.target._folder);
        } else if (
          document.getElementById("mailContext-copyMenu").contains(event.target)
        ) {
          commandController.doCommand("cmd_copyMessage", event.target._folder);
        } else if (
          document
            .getElementById("mailContext-decryptToFolder")
            .contains(event.target)
        ) {
          commandController.doCommand(
            "cmd_copyDecryptedTo",
            event.target._folder
          );
        }
        break;
      }
    }
  },

  // Tags sub-menu

  /**
   * Refresh the contents of the tag popup menu/panel.
   * Used for example for appmenu/Message/Tag panel.
   *
   * @param {Element} parent - Parent element that will contain the menu items.
   * @param {string} [elementName] - Type of menu item, e.g. "menuitem", "toolbarbutton".
   * @param {string} [classes] - Classes to set on the menu items.
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
    let message = gDBView.hdrForFirstSelectedMessage;
    let currentTags = message
      ? message.getStringProperty("keywords").split(" ")
      : [];
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
      item.value = tagInfo.key;
      item.addEventListener("command", event =>
        this._toggleMessageTag(
          tagInfo.key,
          item.getAttribute("checked") == "true"
        )
      );
      if (tagInfo.color) {
        item.style.color = tagInfo.color;
      }
      parent.appendChild(item);

      index++;
    }
  },

  removeAllMessageTags() {
    let selectedMessages = gDBView.getSelectedMsgHdrs();
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
    let selectedMessages = gDBView.getSelectedMsgHdrs();
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

  /**
   * Toggle the state of a message tag on the selected messages (based on the
   * state of the first selected message, like for starring).
   *
   * @param {number} keyNumber - The number (1 through 9) associated with the tag.
   */
  _toggleMessageTagKey(keyNumber) {
    let msgHdr = gDBView.hdrForFirstSelectedMessage;
    if (!msgHdr) {
      return;
    }

    let tagArray = MailServices.tags.getAllTags();
    if (keyNumber > tagArray.length) {
      return;
    }

    let key = tagArray[keyNumber - 1].key;
    let curKeys = msgHdr.getStringProperty("keywords").split(" ");
    if (msgHdr.label) {
      curKeys.push("$label" + msgHdr.label);
    }
    let addKey = !curKeys.includes(key);

    this._toggleMessageTag(key, addKey);
  },

  addTag() {
    top.openDialog(
      "chrome://messenger/content/newTagDialog.xhtml",
      "",
      "chrome,titlebar,modal,centerscreen",
      {
        result: "",
        okCallback: (name, color) => {
          MailServices.tags.addTag(name, color, "");
          let key = MailServices.tags.getKeyForTag(name);
          TagUtils.addTagToAllDocumentSheets(key, color);

          this._toggleMessageTag(key, true);
          return true;
        },
      }
    );
  },
};
