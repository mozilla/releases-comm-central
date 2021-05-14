/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from folderDisplay.js */
/* import-globals-from mailTabs.js */
/* import-globals-from mailWindow.js */
/* import-globals-from messageDisplay.js */
/* import-globals-from utilityOverlay.js */

var { InlineSpellChecker, SpellCheckHelper } = ChromeUtils.import(
  "resource://gre/modules/InlineSpellChecker.jsm"
);
var { PlacesUtils } = ChromeUtils.import(
  "resource://gre/modules/PlacesUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { E10SUtils } = ChromeUtils.import("resource://gre/modules/E10SUtils.jsm");

var gSpellChecker = new InlineSpellChecker();

/** Called by ContextMenuParent.jsm */
function openContextMenu({ data }, browser, actor) {
  if (!browser.hasAttribute("context")) {
    return;
  }

  let spellInfo = data.spellInfo;
  let frameReferrerInfo = data.frameReferrerInfo;
  let linkReferrerInfo = data.linkReferrerInfo;
  let principal = data.principal;
  let storagePrincipal = data.storagePrincipal;

  let documentURIObject = makeURI(
    data.docLocation,
    data.charSet,
    makeURI(data.baseURI)
  );

  if (frameReferrerInfo) {
    frameReferrerInfo = E10SUtils.deserializeReferrerInfo(frameReferrerInfo);
  }

  if (linkReferrerInfo) {
    linkReferrerInfo = E10SUtils.deserializeReferrerInfo(linkReferrerInfo);
  }

  nsContextMenu.contentData = {
    context: data.context,
    browser,
    actor,
    editFlags: data.editFlags,
    spellInfo,
    principal,
    storagePrincipal,
    documentURIObject,
    docLocation: data.docLocation,
    charSet: data.charSet,
    referrerInfo: E10SUtils.deserializeReferrerInfo(data.referrerInfo),
    frameReferrerInfo,
    linkReferrerInfo,
    contentType: data.contentType,
    contentDisposition: data.contentDisposition,
    frameID: data.frameID,
    frameOuterWindowID: data.frameID,
    frameBrowsingContext: BrowsingContext.get(data.frameBrowsingContextID),
    selectionInfo: data.selectionInfo,
    disableSetDesktopBackground: data.disableSetDesktopBackground,
    loginFillInfo: data.loginFillInfo,
    parentAllowsMixedContent: data.parentAllowsMixedContent,
    userContextId: data.userContextId,
    webExtContextData: data.webExtContextData,
  };

  let popup = browser.ownerDocument.getElementById(
    browser.getAttribute("context")
  );
  let context = nsContextMenu.contentData.context;

  // We don't have access to the original event here, as that happened in
  // another process. Therefore we synthesize a new MouseEvent to propagate the
  // inputSource to the subsequently triggered popupshowing event.
  var newEvent = document.createEvent("MouseEvent");
  newEvent.initNSMouseEvent(
    "contextmenu",
    true,
    true,
    null,
    0,
    context.screenX,
    context.screenY,
    0,
    0,
    false,
    false,
    false,
    false,
    0,
    null,
    0,
    context.mozInputSource
  );
  popup.openPopupAtScreen(newEvent.screenX, newEvent.screenY, true, newEvent);
}

/** Called by a popupshowing event via fillMailContextMenu x3. */
class nsContextMenu {
  constructor(aXulMenu, aIsShift) {
    this.xulMenu = aXulMenu;

    // Get contextual info.
    this.setContext();

    if (!this.shouldDisplay) {
      return;
    }

    // Message Related Items
    this.inAMessage = false;
    this.inThreadPane = false;
    this.inStandaloneWindow = false;
    this.numSelectedMessages = 0;
    this.isNewsgroup = false;
    this.hideMailItems = false;

    this.isContentSelected =
      !this.selectionInfo || !this.selectionInfo.docSelectionIsCollapsed;

    this.setMessageTargets();

    if (!aIsShift) {
      // The rest of this block sends menu information to WebExtensions.
      let subject = {
        menu: aXulMenu,
        tab: document.getElementById("tabmail")
          ? document.getElementById("tabmail").currentTabInfo
          : window,
        timeStamp: this.timeStamp,
        isContentSelected: this.isContentSelected,
        inFrame: this.inFrame,
        isTextSelected: this.isTextSelected,
        onTextInput: this.onTextInput,
        onLink: this.onLink,
        onImage: this.onImage,
        onVideo: this.onVideo,
        onAudio: this.onAudio,
        onCanvas: this.onCanvas,
        onEditable: this.onEditable,
        onSpellcheckable: this.onSpellcheckable,
        onPassword: this.onPassword,
        srcUrl: this.mediaURL,
        frameUrl: this.contentData ? this.contentData.docLocation : undefined,
        pageUrl: this.browser ? this.browser.currentURI.spec : undefined,
        linkText: this.linkTextStr,
        linkUrl: this.linkURL,
        selectionText: this.isTextSelected
          ? this.selectionInfo.fullText
          : undefined,
        frameId: this.frameID,
        webExtContextData: this.contentData
          ? this.contentData.webExtContextData
          : undefined,
      };

      if (this.inThreadPane) {
        subject.displayedFolder = gFolderDisplay.view.displayedFolder;
        subject.selectedMessages = gFolderDisplay.selectedMessages;
      }

      subject.wrappedJSObject = subject;
      Services.obs.notifyObservers(subject, "on-build-contextmenu");
    }

    // Reset after "on-build-contextmenu" notification in case selection was
    // changed during the notification.
    this.isContentSelected =
      !this.selectionInfo || !this.selectionInfo.docSelectionIsCollapsed;
    this.initItems();

    // If all items in the menu are hidden, set this.shouldDisplay to false
    // so that the callers know to not even display the empty menu.
    let contextPopup = document.getElementById("mailContext");
    for (let item of contextPopup.children) {
      if (!item.hidden) {
        return;
      }
    }

    // All items must have been hidden.
    this.shouldDisplay = false;
  }

  setContext() {
    let context = Object.create(null);

    if (nsContextMenu.contentData) {
      this.contentData = nsContextMenu.contentData;
      context = this.contentData.context;
      nsContextMenu.contentData = null;
    }

    this.shouldDisplay = !this.contentData || context.shouldDisplay;
    this.timeStamp = context.timeStamp;

    // Assign what's _possibly_ needed from `context` sent by ContextMenuChild.jsm
    // Keep this consistent with the similar code in ContextMenu's _setContext
    this.bgImageURL = context.bgImageURL;
    this.imageDescURL = context.imageDescURL;
    this.imageInfo = context.imageInfo;
    this.mediaURL = context.mediaURL;

    this.canSpellCheck = context.canSpellCheck;
    this.hasBGImage = context.hasBGImage;
    this.hasMultipleBGImages = context.hasMultipleBGImages;
    this.isDesignMode = context.isDesignMode;
    this.inFrame = context.inFrame;
    this.inPDFViewer = context.inPDFViewer;
    this.inSrcdocFrame = context.inSrcdocFrame;
    this.inSyntheticDoc = context.inSyntheticDoc;

    this.link = context.link;
    this.linkDownload = context.linkDownload;
    this.linkProtocol = context.linkProtocol;
    this.linkTextStr = context.linkTextStr;
    this.linkURL = context.linkURL;
    this.linkURI = this.getLinkURI(); // can't send; regenerate

    this.onAudio = context.onAudio;
    this.onCanvas = context.onCanvas;
    this.onCompletedImage = context.onCompletedImage;
    this.onCTPPlugin = context.onCTPPlugin;
    this.onDRMMedia = context.onDRMMedia;
    this.onPiPVideo = context.onPiPVideo;
    this.onEditable = context.onEditable;
    this.onImage = context.onImage;
    this.onKeywordField = context.onKeywordField;
    this.onLink = context.onLink;
    this.onLoadedImage = context.onLoadedImage;
    this.onMailtoLink = context.onMailtoLink;
    this.onMozExtLink = context.onMozExtLink;
    this.onNumeric = context.onNumeric;
    this.onPassword = context.onPassword;
    this.onSaveableLink = context.onSaveableLink;
    this.onSpellcheckable = context.onSpellcheckable;
    this.onTextInput = context.onTextInput;
    this.onVideo = context.onVideo;

    this.target = context.target;
    this.targetIdentifier = context.targetIdentifier;

    this.principal = context.principal;
    this.storagePrincipal = context.storagePrincipal;
    this.frameID = context.frameID;
    this.frameOuterWindowID = context.frameOuterWindowID;
    this.frameBrowsingContext = BrowsingContext.get(
      context.frameBrowsingContextID
    );

    this.inSyntheticDoc = context.inSyntheticDoc;
    this.inAboutDevtoolsToolbox = context.inAboutDevtoolsToolbox;

    // Everything after this isn't sent directly from ContextMenu
    if (this.target) {
      this.ownerDoc = this.target.ownerDocument;
    }

    this.csp = E10SUtils.deserializeCSP(context.csp);

    if (this.contentData) {
      this.browser = this.contentData.browser;
      if (this.browser && this.browser.currentURI.spec == "about:blank") {
        this.shouldDisplay = false;
        return;
      }
      this.selectionInfo = this.contentData.selectionInfo;
      this.actor = this.contentData.actor;
    }

    this.textSelected = this.selectionInfo?.text;
    this.isTextSelected = !!this.textSelected?.length;

    if (context.shouldInitInlineSpellCheckerUINoChildren) {
      gSpellChecker.initFromRemote(
        this.contentData.spellInfo,
        this.actor.manager
      );
    }

    if (context.shouldInitInlineSpellCheckerUIWithChildren) {
      gSpellChecker.initFromRemote(
        this.contentData.spellInfo,
        this.actor.manager
      );
      let canSpell = gSpellChecker.canSpellCheck && this.canSpellCheck;
      this.showItem("mailContext-spell-check-enabled", canSpell);
      this.showItem("mailContext-spell-separator", canSpell);
    }
  }

  hiding() {
    if (this.actor) {
      this.actor.hiding();
    }

    this.contentData = null;
    gSpellChecker.clearSuggestionsFromMenu();
    gSpellChecker.clearDictionaryListFromMenu();
    gSpellChecker.uninit();
  }

  initItems() {
    this.initSaveItems();
    this.initClipboardItems();
    this.initMediaPlayerItems();
    this.initBrowserItems();
    this.initMessageItems();
    this.initSpellingItems();
    this.initSeparators();
  }
  addDictionaries() {
    openDictionaryList();
  }
  initSpellingItems() {
    let canSpell =
      gSpellChecker.canSpellCheck &&
      !gSpellChecker.initialSpellCheckPending &&
      this.canSpellCheck;
    let showDictionaries = canSpell && gSpellChecker.enabled;
    let onMisspelling = gSpellChecker.overMisspelling;
    let showUndo = canSpell && gSpellChecker.canUndo();
    this.showItem("mailContext-spell-check-enabled", canSpell);
    this.showItem("mailContext-spell-separator", canSpell);
    document
      .getElementById("mailContext-spell-check-enabled")
      .setAttribute("checked", canSpell && gSpellChecker.enabled);

    this.showItem("mailContext-spell-add-to-dictionary", onMisspelling);
    this.showItem("mailContext-spell-undo-add-to-dictionary", showUndo);

    // suggestion list
    this.showItem(
      "mailContext-spell-suggestions-separator",
      onMisspelling || showUndo
    );
    if (onMisspelling) {
      let addMenuItem = document.getElementById(
        "mailContext-spell-add-to-dictionary"
      );
      let suggestionCount = gSpellChecker.addSuggestionsToMenu(
        addMenuItem.parentNode,
        addMenuItem,
        5
      );
      this.showItem("mailContext-spell-no-suggestions", suggestionCount == 0);
    } else {
      this.showItem("mailContext-spell-no-suggestions", false);
    }

    // dictionary list
    this.showItem("mailContext-spell-dictionaries", showDictionaries);
    if (canSpell) {
      let dictMenu = document.getElementById(
        "mailContext-spell-dictionaries-menu"
      );
      let dictSep = document.getElementById(
        "mailContext-spell-language-separator"
      );
      let count = gSpellChecker.addDictionaryListToMenu(dictMenu, dictSep);
      this.showItem(dictSep, count > 0);
      this.showItem("mailContext-spell-add-dictionaries-main", false);
    } else if (this.onSpellcheckable) {
      // when there is no spellchecker but we might be able to spellcheck
      // add the add to dictionaries item. This will ensure that people
      // with no dictionaries will be able to download them
      this.showItem("mailContext-spell-language-separator", showDictionaries);
      this.showItem(
        "mailContext-spell-add-dictionaries-main",
        showDictionaries
      );
    } else {
      this.showItem("mailContext-spell-add-dictionaries-main", false);
    }
  }
  initSaveItems() {
    this.showItem("mailContext-savelink", this.onSaveableLink);
    this.showItem("mailContext-saveimage", this.onLoadedImage);
  }
  initClipboardItems() {
    // Copy depends on whether there is selected text.
    // Enabling this context menu item is now done through the global
    // command updating system.

    goUpdateGlobalEditMenuItems();

    this.showItem("mailContext-cut", !this.inAMessage && this.onTextInput);
    this.showItem(
      "mailContext-copy",
      !this.inThreadPane &&
        !this.onPlayableMedia &&
        (this.isContentSelected || this.onTextInput)
    );
    this.showItem("mailContext-paste", !this.inAMessage && this.onTextInput);

    this.showItem("mailContext-undo", !this.inAMessage && this.onTextInput);
    // Select all not available in the thread pane or on playable media.
    this.showItem(
      "mailContext-selectall",
      !this.inThreadPane && !this.onPlayableMedia
    );
    this.showItem("mailContext-copyemail", this.onMailtoLink);
    this.showItem("mailContext-copylink", this.onLink && !this.onMailtoLink);
    this.showItem("mailContext-copyimage", this.onImage);

    this.showItem(
      "mailContext-composeemailto",
      this.onMailtoLink && !this.inThreadPane
    );
    this.showItem(
      "mailContext-addemail",
      this.onMailtoLink && !this.inThreadPane
    );

    let searchTheWeb = document.getElementById("mailContext-searchTheWeb");
    this.showItem(
      searchTheWeb,
      !this.inThreadPane && !this.onPlayableMedia && this.isContentSelected
    );

    if (!searchTheWeb.hidden) {
      let selection = document.commandDispatcher.focusedWindow
        .getSelection()
        .toString();

      let bundle = document.getElementById("bundle_messenger");
      let key = "openSearch.label";
      let abbrSelection;
      if (selection.length > 15) {
        key += ".truncated";
        abbrSelection = selection.slice(0, 15);
      } else {
        abbrSelection = selection;
      }

      searchTheWeb.label = bundle.getFormattedString(key, [
        Services.search.defaultEngine.name,
        abbrSelection,
      ]);
      searchTheWeb.value = selection;
    }
  }
  initMediaPlayerItems() {
    let onMedia = this.onVideo || this.onAudio;
    // Several mutually exclusive items.... play/pause, mute/unmute, show/hide
    this.showItem("mailContext-media-play", onMedia && this.target.paused);
    this.showItem("mailContext-media-pause", onMedia && !this.target.paused);
    this.showItem("mailContext-media-mute", onMedia && !this.target.muted);
    this.showItem("mailContext-media-unmute", onMedia && this.target.muted);
    if (onMedia) {
      let hasError =
        this.target.error != null ||
        this.target.networkState == this.target.NETWORK_NO_SOURCE;
      this.setItemAttr("mailContext-media-play", "disabled", hasError);
      this.setItemAttr("mailContext-media-pause", "disabled", hasError);
      this.setItemAttr("mailContext-media-mute", "disabled", hasError);
      this.setItemAttr("mailContext-media-unmute", "disabled", hasError);
    }
  }
  initBrowserItems() {
    // Work out if we are a context menu on a special item e.g. an image, link
    // etc.
    let notOnSpecialItem = !(
      this.inAMessage ||
      this.isContentSelected ||
      this.onCanvas ||
      this.onLink ||
      this.onImage ||
      this.onAudio ||
      this.onVideo ||
      this.onTextInput
    );
    // Ensure these commands are updated with their current status.
    if (notOnSpecialItem) {
      goUpdateCommand("cmd_stop");
      goUpdateCommand("cmd_reload");
    }

    // These only needs showing if we're not on something special.
    this.showItem("mailContext-stop", notOnSpecialItem);
    this.showItem("mailContext-reload", notOnSpecialItem);

    let loadedProtocol = "";
    if (this.target && this.target.ownerGlobal?.top.location) {
      loadedProtocol = this.target.ownerGlobal?.top.location.protocol;
    }

    // Only show open in browser if we're not on a special item and we're not
    // on an about: or chrome: protocol - for these protocols the browser is
    // unlikely to show the same thing as we do (if at all), so therefore don't
    // offer the option.
    this.showItem(
      "mailContext-openInBrowser",
      notOnSpecialItem && ["http:", "https:"].includes(loadedProtocol)
    );

    // Only show mailContext-openLinkInBrowser if we're on a link and it isn't
    // a mailto link.
    this.showItem(
      "mailContext-openLinkInBrowser",
      this.onLink && ["http", "https"].includes(this.linkProtocol)
    );
  }
  /* eslint-disable complexity */
  initMessageItems() {
    // If we're not in a message related tab, we're just going to bulk hide most
    // items as this simplifies the logic below.
    if (!this.inAMessage) {
      const messageTabSpecificItems = [
        "mailContext-openNewWindow",
        "threadPaneContext-openNewTab",
        "mailContext-openConversation",
        "mailContext-openContainingFolder",
        "mailContext-archive",
        "mailContext-replySender",
        "mailContext-replyNewsgroup",
        "mailContext-replyAll",
        "mailContext-replyList",
        "mailContext-forward",
        "mailContext-forwardAsMenu",
        "mailContext-multiForwardAsAttachment",
        "mailContext-redirect",
        "mailContext-editAsNew",
        "mailContext-editDraftMsg",
        "mailContext-newMsgFromTemplate",
        "mailContext-editTemplateMsg",
        "mailContext-copyMessageUrl",
        "mailContext-moveMenu",
        "mailContext-copyMenu",
        "mailContext-moveToFolderAgain",
        "mailContext-ignoreThread",
        "mailContext-ignoreSubthread",
        "mailContext-watchThread",
        "mailContext-tags",
        "mailContext-mark",
        "mailContext-saveAs",
        "mailContext-print",
        "mailContext-delete",
        "downloadSelected",
        "mailContext-reportPhishingURL",
        "mailContext-calendar-convert-menu",
      ];
      for (let i = 0; i < messageTabSpecificItems.length; ++i) {
        this.showItem(messageTabSpecificItems[i], false);
      }
      return;
    }

    let canMove = gFolderDisplay.canDeleteSelectedMessages;

    // Show the Open in New Window and New Tab options if there is exactly one
    // message selected.
    this.showItem(
      "mailContext-openNewWindow",
      this.numSelectedMessages == 1 && this.inThreadPane
    );
    this.showItem(
      "threadPaneContext-openNewTab",
      this.numSelectedMessages == 1 && this.inThreadPane
    );

    this.showItem(
      "mailContext-openConversation",
      this.numSelectedMessages == 1 &&
        this.inThreadPane &&
        gConversationOpener.isSelectedMessageIndexed()
    );
    this.showItem(
      "mailContext-openContainingFolder",
      !gFolderDisplay.folderPaneVisible && this.numSelectedMessages == 1
    );

    this.setSingleSelection("mailContext-replySender");
    this.setSingleSelection("mailContext-replyNewsgroup", this.isNewsgroup);
    this.setSingleSelection("mailContext-replyAll");
    this.setSingleSelection("mailContext-replyList");
    this.setSingleSelection("mailContext-forward");
    this.setSingleSelection("mailContext-forwardAsMenu");
    this.setSingleSelection("mailContext-redirect");
    this.setSingleSelection("mailContext-editAsNew");
    this.setSingleSelection(
      "mailContext-editDraftMsg",
      !document.getElementById("cmd_editDraftMsg").hidden
    );
    this.setSingleSelection(
      "mailContext-newMsgFromTemplate",
      !document.getElementById("cmd_newMsgFromTemplate").hidden
    );
    this.setSingleSelection(
      "mailContext-editTemplateMsg",
      !document.getElementById("cmd_editTemplateMsg").hidden
    );

    this.showItem(
      "mailContext-multiForwardAsAttachment",
      this.numSelectedMessages > 1 && this.inThreadPane && !this.hideMailItems
    );

    this.setSingleSelection("mailContext-copyMessageUrl", this.isNewsgroup);

    let msgModifyItems =
      this.numSelectedMessages > 0 &&
      !this.hideMailItems &&
      !this.onPlayableMedia &&
      !(this.numSelectedMessages == 1 && gMessageDisplay.isDummy);
    let canArchive = gFolderDisplay.canArchiveSelectedMessages;

    this.showItem(
      "mailContext-archive",
      canMove && msgModifyItems && canArchive
    );

    // Set up the move menu. We can't move from newsgroups.
    this.showItem("mailContext-moveMenu", msgModifyItems && !this.isNewsgroup);

    // disable move if we can't delete message(s) from this folder
    this.enableItem("mailContext-moveMenu", canMove && !this.onPlayableMedia);

    // Copy is available as long as something is selected.
    let canCopy =
      msgModifyItems ||
      (gMessageDisplay.isDummy && window.arguments[0].scheme == "file");
    this.showItem("mailContext-copyMenu", canCopy);

    this.showItem("mailContext-moveToFolderAgain", msgModifyItems);
    if (msgModifyItems) {
      initMoveToFolderAgainMenu(
        document.getElementById("mailContext-moveToFolderAgain")
      );
      goUpdateCommand("cmd_moveToFolderAgain");
    }

    this.showItem("mailContext-tags", msgModifyItems);

    this.showItem("mailContext-mark", msgModifyItems);

    this.showItem(
      "mailContext-ignoreThread",
      !this.inStandaloneWindow &&
        this.numSelectedMessages >= 1 &&
        !this.hideMailItems &&
        !this.onPlayableMedia
    );

    this.showItem(
      "mailContext-ignoreSubthread",
      !this.inStandaloneWindow &&
        this.numSelectedMessages >= 1 &&
        !this.hideMailItems &&
        !this.onPlayableMedia
    );

    this.showItem(
      "mailContext-watchThread",
      !this.inStandaloneWindow &&
        this.numSelectedMessages > 0 &&
        !this.hideMailItems &&
        !this.onPlayableMedia
    );

    this.showItem("mailContext-afterWatchThread", !this.inStandaloneWindow);

    this.showItem(
      "mailContext-saveAs",
      this.numSelectedMessages > 0 &&
        !this.hideMailItems &&
        !gMessageDisplay.isDummy &&
        !this.onPlayableMedia
    );

    // XXX Not quite modifying the message, but the same rules apply at the
    // moment as we can't print non-message content from the message pane yet.
    this.showItem("mailContext-print", msgModifyItems);

    this.showItem(
      "mailContext-delete",
      msgModifyItems && (this.isNewsgroup || canMove)
    );

    // This function is needed for the case where a folder is just loaded (while
    // there isn't a message loaded in the message pane), a right-click is done
    // in the thread pane. This function will disable enable the 'Delete
    // Message' menu item.
    goUpdateCommand("cmd_delete");

    this.showItem(
      "downloadSelected",
      this.numSelectedMessages > 1 && !this.hideMailItems
    );

    this.showItem(
      "mailContext-reportPhishingURL",
      !this.inThreadPane && this.onLink && !this.onMailtoLink
    );

    this.setSingleSelection("mailContext-calendar-convert-menu");
  }
  /* eslint-enable complexity */
  initSeparators() {
    const mailContextSeparators = [
      "mailContext-sep-open-browser",
      "mailContext-sep-link",
      "mailContext-sep-open",
      "mailContext-sep-open2",
      "mailContext-sep-reply",
      "paneContext-afterMove",
      "mailContext-sep-afterTagAddNew",
      "mailContext-sep-afterTagRemoveAll",
      "mailContext-sep-afterMarkAllRead",
      "mailContext-sep-afterMarkFlagged",
      "mailContext-sep-afterMarkMenu",
      "mailContext-afterWatchThread",
      "mailContext-sep-edit",
      "mailContext-sep-editTemplate",
      "mailContext-sep-copy",
      "mailContext-sep-reportPhishing",
      "mailContext-sep-undo",
      "mailContext-sep-clipboard",
      "mailContext-spell-suggestions-separator",
      "mailContext-spell-separator",
    ];
    mailContextSeparators.forEach(this.hideIfAppropriate, this);

    this.checkLastSeparator(this.xulMenu);
  }

  setMessageTargets() {
    if (this.browser) {
      this.inAMessage = ["imap", "mailbox", "news", "snews"].includes(
        this.browser.currentURI.scheme
      );
      this.inThreadPane = false;
      if (!this.inAMessage) {
        this.inStandaloneWindow = true;
        this.numSelectedMessages = 0;
        this.isNewsgroup = false;
        this.hideMailItems = true;
        return;
      }
    } else {
      this.inThreadPane = true;
    }

    this.inAMessage = true;
    this.inStandaloneWindow = false;
    this.numSelectedMessages = gFolderDisplay.selectedCount;
    this.isNewsgroup = gFolderDisplay.selectedMessageIsNews;
    // Don't show mail items for links/images, just show related items.
    this.hideMailItems = !this.inThreadPane && (this.onImage || this.onLink);
  }

  /**
   * Get a computed style property for an element.
   * @param  aElem
   *         A DOM node
   * @param  aProp
   *         The desired CSS property
   * @return the value of the property
   */
  getComputedStyle(aElem, aProp) {
    return aElem.ownerGlobal.getComputedStyle(aElem).getPropertyValue(aProp);
  }

  /**
   * Determine whether the clicked-on link can be saved, and whether it
   * may be saved according to the ScriptSecurityManager.
   * @return true if the protocol can be persisted and if the target has
   *         permission to link to the URL, false if not
   */
  isLinkSaveable() {
    try {
      const nsIScriptSecurityManager = Ci.nsIScriptSecurityManager;
      Services.scriptSecurityManager.checkLoadURIWithPrincipal(
        this.target.nodePrincipal,
        this.linkURI,
        nsIScriptSecurityManager.STANDARD
      );
    } catch (e) {
      // Don't save things we can't link to.
      return false;
    }

    // We don't do the Right Thing for news/snews yet, so turn them off
    // until we do.
    return (
      this.linkProtocol &&
      !(
        this.linkProtocol == "mailto" ||
        this.linkProtocol == "javascript" ||
        this.linkProtocol == "news" ||
        this.linkProtocol == "snews"
      )
    );
  }

  /**
   * Save URL of clicked-on link.
   */
  saveLink() {
    saveURL(
      this.linkURL,
      this.linkTextStr,
      null,
      true,
      null,
      null,
      null,
      document
    );
  }

  /**
   * Save a clicked-on image.
   */
  saveImage() {
    saveURL(
      this.imageInfo.currentSrc,
      null,
      "SaveImageTitle",
      false,
      null,
      null,
      null,
      document
    );
  }

  /**
   * Extract email addresses from a mailto: link and put them on the
   * clipboard.
   */
  copyEmail() {
    // Copy the comma-separated list of email addresses only.
    // There are other ways of embedding email addresses in a mailto:
    // link, but such complex parsing is beyond us.

    const kMailToLength = 7; // length of "mailto:"

    var url = this.linkURL;
    var qmark = url.indexOf("?");
    var addresses;

    if (qmark > kMailToLength) {
      addresses = url.substring(kMailToLength, qmark);
    } else {
      addresses = url.substr(kMailToLength);
    }

    // Let's try to unescape it using a character set.
    try {
      addresses = Services.textToSubURI.unEscapeURIForUI(addresses);
    } catch (ex) {
      // Do nothing.
    }

    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
      Ci.nsIClipboardHelper
    );
    clipboard.copyString(addresses);
  }

  // ---------
  // Utilities

  /**
   * Set a DOM node's hidden property by passing in the node's id or the
   * element itself.
   * @param aItemOrId
   *        a DOM node or the id of a DOM node
   * @param aShow
   *        true to show, false to hide
   */
  showItem(aItemOrId, aShow) {
    var item =
      aItemOrId.constructor == String
        ? document.getElementById(aItemOrId)
        : aItemOrId;
    if (item) {
      item.hidden = !aShow;
    }
  }

  /**
   * Set a DOM node's disabled property by passing in the node's id or the
   * element itself.
   *
   * @param aItemOrId  A DOM node or the id of a DOM node
   * @param aEnabled   True to enable the element, false to disable.
   */
  enableItem(aItemOrId, aEnabled) {
    var item =
      aItemOrId.constructor == String
        ? document.getElementById(aItemOrId)
        : aItemOrId;
    item.disabled = !aEnabled;
  }

  /**
   * Most menu items are visible if there's 1 or 0 messages selected, and
   * enabled if there's exactly one selected. Handle those here.
   * Exception: playable media is selected, in which case, don't show them.
   *
   * @param aID   the id of the element to display/enable
   * @param aShow (optional)  an additional criteria to evaluate when we
   *              decide whether to display the element. If false, we'll hide
   *              the item no matter what messages are selected.
   */
  setSingleSelection(aID, aShow) {
    let show = aShow != undefined ? aShow : true;
    this.showItem(
      aID,
      this.numSelectedMessages == 1 &&
        !this.hideMailItems &&
        show &&
        !this.onPlayableMedia
    );
    this.enableItem(aID, this.numSelectedMessages == 1);
  }

  /**
   * Set given attribute of specified context-menu item. If the
   * value is null, then it removes the attribute (which works
   * nicely for the disabled attribute).
   * @param  aId
   *         The id of an element
   * @param  aAttr
   *         The attribute name
   * @param  aVal
   *         The value to set the attribute to, or null to remove the attribute
   */
  setItemAttr(aId, aAttr, aVal) {
    var elem = document.getElementById(aId);
    if (elem) {
      if (aVal == null) {
        // null indicates attr should be removed.
        elem.removeAttribute(aAttr);
      } else {
        // Set attr=val.
        elem.setAttribute(aAttr, aVal);
      }
    }
  }

  /**
   * Get an absolute URL for clicked-on link, from the href property or by
   * resolving an XLink URL by hand.
   * @return the string absolute URL for the clicked-on link
   */
  getLinkURL() {
    if (this.link.href) {
      return this.link.href;
    }
    var href = this.link.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!href || href.trim() == "") {
      // Without this we try to save as the current doc,
      // for example, HTML case also throws if empty.
      throw new Error("Empty href");
    }
    href = this.makeURLAbsolute(this.link.baseURI, href);
    return href;
  }

  /**
   * Generate a URI object from the linkURL spec
   * @return an nsIURI if possible, or null if not
   */
  getLinkURI() {
    try {
      return Services.io.newURI(this.linkURL);
    } catch (ex) {
      // e.g. empty URL string
    }
    return null;
  }

  /**
   * Get the scheme for the clicked-on linkURI, if present.
   * @return a scheme, possibly undefined, or null if there's no linkURI
   */
  getLinkProtocol() {
    if (this.linkURI) {
      return this.linkURI.scheme; // Can be |undefined|.
    }

    return null;
  }

  /**
   * Get the text of the clicked-on link.
   * @returns {string}
   */
  linkText() {
    return this.linkTextStr;
  }

  /**
   * Determines whether the focused window has something selected.
   * @return true if there is a selection, false if not
   */
  isContentSelection() {
    return !document.commandDispatcher.focusedWindow.getSelection().isCollapsed;
  }

  /**
   * Convert relative URL to absolute, using a provided <base>.
   * @param  aBase
   *         The URL string to use as the base
   * @param  aUrl
   *         The possibly-relative URL string
   * @return The string absolute URL
   */
  makeURLAbsolute(aBase, aUrl) {
    // Construct nsIURL.
    var baseURI = Services.io.newURI(aBase);

    return Services.io.newURI(baseURI.resolve(aUrl)).spec;
  }

  /**
   * Determine whether a DOM node is a text or password input, or a textarea.
   * @param  aNode
   *         The DOM node to check
   * @return true for textboxes, false for other elements
   */
  isTargetATextBox(aNode) {
    if (aNode instanceof HTMLInputElement) {
      return aNode.type == "text" || aNode.type == "password";
    }

    return aNode instanceof HTMLTextAreaElement;
  }

  /**
   * Hide a separator based on whether there are any non-hidden items between
   * it and the previous separator.
   *
   * @param aSeparatorID  The id of the separator element.
   */
  hideIfAppropriate(aSeparatorID) {
    this.showItem(aSeparatorID, this.shouldShowSeparator(aSeparatorID));
  }

  /**
   * Determine whether a separator should be shown based on whether
   * there are any non-hidden items between it and the previous separator.
   * @param  aSeparatorID
   *         The id of the separator element
   * @return true if the separator should be shown, false if not
   */
  shouldShowSeparator(aSeparatorID) {
    var separator = document.getElementById(aSeparatorID);
    if (separator) {
      var sibling = separator.previousElementSibling;
      while (sibling && sibling.localName != "menuseparator") {
        if (!sibling.hidden) {
          return true;
        }
        sibling = sibling.previousElementSibling;
      }
    }
    return false;
  }

  /**
   * Ensures that there isn't a separator shown at the bottom of the menu.
   *
   * @param aPopup  The menu to check.
   */
  checkLastSeparator(aPopup) {
    let sibling = aPopup.lastElementChild;
    while (sibling) {
      if (!sibling.hidden) {
        if (sibling.localName == "menuseparator") {
          // If we got here then the item is a menuseparator and everything
          // below it hidden.
          sibling.setAttribute("hidden", true);
          return;
        }
        return;
      }
      sibling = sibling.previousElementSibling;
    }
  }

  openInBrowser() {
    let url = this.target.ownerGlobal?.top.location.href;
    PlacesUtils.history
      .insert({
        url,
        visits: [
          {
            date: new Date(),
          },
        ],
      })
      .catch(Cu.reportError);
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(url));
  }

  openLinkInBrowser() {
    PlacesUtils.history
      .insert({
        url: this.linkURL,
        visits: [
          {
            date: new Date(),
          },
        ],
      })
      .catch(Cu.reportError);
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(this.linkURI);
  }

  mediaCommand(command) {
    var media = this.target;

    switch (command) {
      case "play":
        media.play();
        break;
      case "pause":
        media.pause();
        break;
      case "mute":
        media.muted = true;
        break;
      case "unmute":
        media.muted = false;
        break;
      // XXX hide controls & show controls don't work in emails as Javascript is
      // disabled. May want to consider later for RSS feeds.
    }
  }
}
