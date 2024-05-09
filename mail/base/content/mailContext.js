/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// mailCommon.js
/* globals commandController */

// about:3pane and about:message must BOTH provide these:

/* globals goDoCommand */ // globalOverlay.js
/* globals gDBView, gFolder, gViewWrapper, messengerBundle */

/* globals gEncryptedURIService */ // mailCommon.js

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { openLinkExternally, openWebSearch } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  EnigmailURIs: "chrome://openpgp/content/modules/uris.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  PhishingDetector: "resource:///modules/PhishingDetector.sys.mjs",
  TagUtils: "resource:///modules/TagUtils.sys.mjs",

  calendarDeactivator:
    "resource:///modules/calendar/calCalendarDeactivator.sys.mjs",
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

  if (browser.id != "messagepane") {
    return false;
  }

  mailContextMenu.setAsMessagePaneContextMenu(data, target.browsingContext);
  const screenX = data.context.screenXDevPx / window.devicePixelRatio;
  const screenY = data.context.screenYDevPx / window.devicePixelRatio;
  const popup = document.getElementById("mailContext");
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
    "navContext-reply": "cmd_replyall",
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
    "navContext-archive": "cmd_archive",
    "mailContext-archive": "cmd_archive",
    "mailContext-moveToFolderAgain": "cmd_moveToFolderAgain",
    "mailContext-decryptToFolder": "cmd_copyDecryptedTo",
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
    "navContext-markRead": "cmd_markAsRead",
    "mailContext-markRead": "cmd_markAsRead",
    "navContext-markUnread": "cmd_markAsUnread",
    "mailContext-markUnread": "cmd_markAsUnread",
    "mailContext-markThreadAsRead": "cmd_markThreadAsRead",
    "mailContext-markAllRead": "cmd_markAllRead",
    "navContext-markAsJunk": "cmd_markAsJunk",
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
      window.threadPane.restoreSelection({ notify: false });
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

    for (const id of [
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
      const item = document.getElementById(id);
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
    showItem("mailContext-savelink", context.onLink && !context.onMailtoLink);
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

    const searchTheWeb = document.getElementById("mailContext-searchTheWeb");
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
      const item = document.getElementById(id);
      if (item) {
        item.hidden = !show;
      }
    }

    function enableItem(id, enabled) {
      const item = document.getElementById(id);
      item.disabled = !enabled;
    }

    function checkItem(id, checked) {
      const item = document.getElementById(id);
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
    for (const id of [
      "mailContext-openInBrowser",
      "mailContext-recalculateJunkScore",
    ]) {
      showItem(id, false);
    }

    const onSpecialItem =
      this.context?.isContentSelected ||
      this.context?.onCanvas ||
      this.context?.onLink ||
      this.context?.onImage ||
      this.context?.onAudio ||
      this.context?.onVideo ||
      this.context?.onTextInput;

    for (const id of ["mailContext-tags", "mailContext-mark"]) {
      showItem(id, !onSpecialItem);
    }

    // Ask commandController about the commands it controls.
    for (const [id, command] of Object.entries(this._commands)) {
      showItem(
        id,
        !onSpecialItem && commandController.isCommandEnabled(command)
      );
    }
    for (const [id, command] of Object.entries(this._alwaysVisibleCommands)) {
      showItem(id, !onSpecialItem);
      enableItem(id, commandController.isCommandEnabled(command));
    }

    showItem(
      "navContext-delete",
      commandController.isCommandEnabled("cmd_deleteMessage")
    );

    const inAbout3Pane = !!window.threadTree;
    const inThreadTree = !!this.inThreadTree;

    const message =
      gFolder || gViewWrapper.isSynthetic
        ? gDBView?.hdrForFirstSelectedMessage
        : top.messenger.msgHdrFromURI(window.gMessageURI);
    const folder = message?.folder;
    const isDummyMessage = !gViewWrapper.isSynthetic && !folder;

    const numSelectedMessages = isDummyMessage ? 1 : gDBView.numSelected;
    const isNewsgroup = folder?.isSpecialFolder(
      Ci.nsMsgFolderFlags.Newsgroup,
      true
    );
    const canMove =
      numSelectedMessages >= 1 && !isNewsgroup && folder?.canDeleteMessages;
    const canCopy = numSelectedMessages >= 1;

    setSingleSelection("mailContext-openNewTab", inThreadTree);
    setSingleSelection("mailContext-openNewWindow", inThreadTree);
    setSingleSelection(
      "mailContext-openContainingFolder",
      (!isDummyMessage && !inAbout3Pane) || gViewWrapper.isSynthetic
    );
    setSingleSelection("mailContext-forward", !onSpecialItem);
    document.l10n.setAttributes(
      document.getElementById("mailContext-forwardAsAttachment"),
      "mail-context-menu-forward-as-attachment",
      {
        count: numSelectedMessages,
      }
    );
    showItem(
      "mailContext-forwardAsAttachment",
      numSelectedMessages &&
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

    const contextDelete = document.getElementById("navContext-delete");
    contextDelete.setAttribute(
      "active",
      !!(message.flags & Ci.nsMsgMessageFlags.IMAPDeleted)
    );
    document.l10n.setAttributes(
      contextDelete,
      message.flags & Ci.nsMsgMessageFlags.IMAPDeleted
        ? "mail-context-messages-undelete"
        : "mail-context-messages-delete",
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
    for (const child of document.getElementById("mailContext").children) {
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

    const selectionInfo = this.selectionInfo;
    const isContentSelected = selectionInfo
      ? !selectionInfo.docSelectionIsCollapsed
      : false;
    const textSelected = selectionInfo ? selectionInfo.text : "";
    const isTextSelected = !!textSelected.length;

    const tabmail = top.document.getElementById("tabmail");
    const subject = {
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
      case "navContext-delete":
        commandController.doCommand(
          event.shiftKey ? "cmd_shiftDeleteMessage" : "cmd_deleteMessage"
        );
        break;
      // Links
      // case "mailContext-openInBrowser":
      //   this._openInBrowser();
      //   break;
      case "mailContext-openLinkInBrowser":
        // Only called in about:message.
        openLinkExternally(this.context.linkURL);
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
        const addresses = top.getEmail(this.context.linkURL);
        Cc["@mozilla.org/widget/clipboardhelper;1"]
          .getService(Ci.nsIClipboardHelper)
          .copyString(addresses);
        break;
      }

      // Images
      case "mailContext-copyimage":
        goDoCommand("cmd_copyImageContents");
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
        openWebSearch(this.selectionInfo.text);
        break;

      // Open messages in the background.
      case "mailContext-openNewTab":
        top.OpenMessageInNewTab(gDBView.hdrForFirstSelectedMessage, {
          event,
          viewWrapper: gViewWrapper,
          background: true,
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
        const message = gDBView.hdrForFirstSelectedMessage;
        const server = message?.folder?.server;

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
   * @see InitMessageTags()
   */
  _initMessageTags() {
    const parent = document.getElementById("mailContext-tagpopup");
    // Remove any existing non-static items (clear tags list before rebuilding it).
    // There is a separator element above the dynamically added tag elements, so
    // remove dynamically added elements below the separator.
    while (parent.lastElementChild.localName == "menuitem") {
      parent.lastElementChild.remove();
    }

    // Create label and accesskey for the static "remove all tags" item.
    const removeItem = document.getElementById("mailContext-tagRemoveAll");
    removeItem.label = messengerBundle.GetStringFromName(
      "mailnews.tags.remove"
    );

    // Rebuild the list.
    const message = gDBView.hdrForFirstSelectedMessage;
    const currentTags = message
      ? message.getStringProperty("keywords").split(" ")
      : [];
    let index = 1;

    for (const tagInfo of MailServices.tags.getAllTags()) {
      const msgHasTag = currentTags.includes(tagInfo.key);
      if (tagInfo.ordinal.includes("~AUTOTAG") && !msgHasTag) {
        return;
      }

      const item = document.createXULElement("menuitem");
      const accessKey = index < 10 ? index : "";
      if (accessKey !== "") {
        item.accessKey = accessKey;
      }
      item.label = messengerBundle.formatStringFromName(
        "mailnews.tags.format",
        [accessKey, tagInfo.tag]
      );
      item.setAttribute("type", "checkbox");
      if (msgHasTag) {
        item.setAttribute("checked", "true");
      }
      item.value = tagInfo.key;
      item.addEventListener("command", () =>
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
    const selectedMessages = gDBView.getSelectedMsgHdrs();
    if (!selectedMessages.length) {
      return;
    }

    let messages = [];
    const allKeys = MailServices.tags
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
      const msgHdr = selectedMessages[i];
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
    const selectedMessages = gDBView.getSelectedMsgHdrs();
    const toggler = addKey
      ? "addKeywordsToMessages"
      : "removeKeywordsFromMessages";
    let prevHdrFolder = null;
    // this crudely handles cross-folder virtual folders with selected messages
    // that spans folders, by coalescing consecutive msgs in the selection
    // that happen to be in the same folder. nsMsgSearchDBView does this
    // better, but nsIMsgDBView doesn't handle commands with arguments,
    // and (un)tag takes a key argument.
    for (let i = 0; i < selectedMessages.length; ++i) {
      const msgHdr = selectedMessages[i];
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
    const msgHdr = gDBView.hdrForFirstSelectedMessage;
    if (!msgHdr) {
      return;
    }

    const tagArray = MailServices.tags.getAllTags();
    if (keyNumber > tagArray.length) {
      return;
    }

    const key = tagArray[keyNumber - 1].key;
    const curKeys = msgHdr.getStringProperty("keywords").split(" ");
    if (msgHdr.label) {
      curKeys.push("$label" + msgHdr.label);
    }
    const addKey = !curKeys.includes(key);

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
          const key = MailServices.tags.getKeyForTag(name);
          TagUtils.addTagToAllDocumentSheets(key, color);

          this._toggleMessageTag(key, true);
          return true;
        },
      }
    );
  },
};
