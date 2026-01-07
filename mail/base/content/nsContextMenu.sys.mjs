/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// about:3pane and about:message must BOTH provide these:

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { openLinkExternally } from "resource:///modules/LinkHelper.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  ShortcutUtils: "resource://gre/modules/ShortcutUtils.sys.mjs",
});

var gSpellChecker;

export class nsContextMenu {
  constructor(aXulMenu, aIsShift) {
    this.window = aXulMenu.ownerGlobal;
    this.document = aXulMenu.ownerDocument;

    this.xulMenu = aXulMenu;

    gSpellChecker = this.window.gSpellChecker;

    // Get contextual info.
    this.setContext();

    if (!this.shouldDisplay) {
      return;
    }

    this.isContentSelected =
      !this.selectionInfo || !this.selectionInfo.docSelectionIsCollapsed;

    if (!aIsShift) {
      // The rest of this block sends menu information to WebExtensions.
      const subject = {
        menu: aXulMenu,
        tab: this.document.getElementById("tabmail")
          ? this.document.getElementById("tabmail").currentTabInfo
          : this.window,
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
        webExtBrowserType: this.webExtBrowserType,
        webExtContextData: this.contentData
          ? this.contentData.webExtContextData
          : undefined,
      };

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
    const contextPopup = this.document.getElementById("browserContext");
    for (const item of contextPopup.children) {
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

    // Assign what's _possibly_ needed from `context` sent by ContextMenuChild.sys.mjs
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

    this.csp = lazy.E10SUtils.deserializeCSP(context.csp);

    if (!this.contentData) {
      return;
    }

    this.browser = this.contentData.browser;
    if (this.browser && this.browser.currentURI.spec == "about:blank") {
      this.shouldDisplay = false;
      return;
    }
    this.selectionInfo = this.contentData.selectionInfo;
    this.actor = this.contentData.actor;

    this.textSelected = this.selectionInfo?.text;
    this.isTextSelected = !!this.textSelected?.length;

    this.webExtBrowserType = this.browser.getAttribute(
      "webextension-view-type"
    );

    if (context.shouldInitInlineSpellCheckerUINoChildren) {
      gSpellChecker.initFromRemote(
        this.contentData.spellInfo,
        this.actor.manager
      );
    }

    if (this.contentData.spellInfo) {
      this.spellSuggestions = this.contentData.spellInfo.spellSuggestions;
    }

    if (context.shouldInitInlineSpellCheckerUIWithChildren) {
      gSpellChecker.initFromRemote(
        this.contentData.spellInfo,
        this.actor.manager
      );
      const canSpell = gSpellChecker.canSpellCheck && this.canSpellCheck;
      this.showItem("browserContext-spell-check-enabled", canSpell);
      this.showItem("browserContext-spell-separator", canSpell);
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
    this.initSpellingItems();
    this.initSeparators();
  }
  addDictionaries() {
    this.window.openDictionaryList();
  }
  initSpellingItems() {
    const canSpell =
      gSpellChecker.canSpellCheck &&
      !gSpellChecker.initialSpellCheckPending &&
      this.canSpellCheck;
    const showDictionaries = canSpell && gSpellChecker.enabled;
    const onMisspelling = gSpellChecker.overMisspelling;
    const showUndo = canSpell && gSpellChecker.canUndo();
    this.showItem("browserContext-spell-check-enabled", canSpell);
    this.showItem("browserContext-spell-separator", canSpell);
    this.document
      .getElementById("browserContext-spell-check-enabled")
      .toggleAttribute("checked", canSpell && gSpellChecker.enabled);

    this.showItem("browserContext-spell-add-to-dictionary", onMisspelling);
    this.showItem("browserContext-spell-undo-add-to-dictionary", showUndo);

    // suggestion list
    this.showItem(
      "browserContext-spell-suggestions-separator",
      onMisspelling || showUndo
    );
    if (onMisspelling) {
      const addMenuItem = this.document.getElementById(
        "browserContext-spell-add-to-dictionary"
      );
      const suggestionCount = gSpellChecker.addSuggestionsToMenu(
        addMenuItem.parentNode,
        addMenuItem,
        this.spellSuggestions
      );
      this.showItem(
        "browserContext-spell-no-suggestions",
        suggestionCount == 0
      );
    } else {
      this.showItem("browserContext-spell-no-suggestions", false);
    }

    // dictionary list
    this.showItem("browserContext-spell-dictionaries", showDictionaries);
    if (canSpell) {
      const dictMenu = this.document.getElementById(
        "browserContext-spell-dictionaries-menu"
      );
      const dictSep = this.document.getElementById(
        "browserContext-spell-language-separator"
      );
      const count = gSpellChecker.addDictionaryListToMenu(dictMenu, dictSep);
      this.showItem(dictSep, count > 0);
      this.showItem("browserContext-spell-add-dictionaries-main", false);
    } else if (this.onSpellcheckable) {
      // when there is no spellchecker but we might be able to spellcheck
      // add the add to dictionaries item. This will ensure that people
      // with no dictionaries will be able to download them
      this.showItem(
        "browserContext-spell-language-separator",
        showDictionaries
      );
      this.showItem(
        "browserContext-spell-add-dictionaries-main",
        showDictionaries
      );
    } else {
      this.showItem("browserContext-spell-add-dictionaries-main", false);
    }
  }
  initSaveItems() {
    this.showItem("browserContext-savelink", this.onSaveableLink);
    this.showItem("browserContext-saveimage", this.onLoadedImage);
  }
  initClipboardItems() {
    // Copy depends on whether there is selected text.
    // Enabling this context menu item is now done through the global
    // command updating system.

    this.window.goUpdateGlobalEditMenuItems();

    this.showItem("browserContext-cut", this.onTextInput);
    this.showItem(
      "browserContext-copy",
      !this.onPlayableMedia && (this.isContentSelected || this.onTextInput)
    );
    this.showItem("browserContext-paste", this.onTextInput);

    this.showItem("browserContext-undo", this.onTextInput);
    // Select all not available in the thread pane or on playable media.
    this.showItem("browserContext-selectall", !this.onPlayableMedia);
    this.showItem("browserContext-copyemail", this.onMailtoLink);
    this.showItem("browserContext-copylink", this.onLink && !this.onMailtoLink);
    this.showItem("browserContext-copyimage", this.onImage);

    this.showItem("browserContext-composeemailto", this.onMailtoLink);
    this.showItem("browserContext-addemail", this.onMailtoLink);

    const searchTheWeb = this.document.getElementById(
      "browserContext-searchTheWeb"
    );
    this.showItem(
      searchTheWeb,
      !this.onPlayableMedia && this.isContentSelected
    );

    if (!searchTheWeb.hidden) {
      const selection = this.textSelected;

      const bundle = this.document.getElementById("bundle_messenger");
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
    const onMedia = this.onVideo || this.onAudio;
    // Several mutually exclusive items.... play/pause, mute/unmute, show/hide
    this.showItem("browserContext-media-play", onMedia && this.target.paused);
    this.showItem("browserContext-media-pause", onMedia && !this.target.paused);
    this.showItem("browserContext-media-mute", onMedia && !this.target.muted);
    this.showItem("browserContext-media-unmute", onMedia && this.target.muted);
    if (onMedia) {
      const hasError =
        this.target.error != null ||
        this.target.networkState == this.target.NETWORK_NO_SOURCE;
      this.setItemAttr("browserContext-media-play", "disabled", hasError);
      this.setItemAttr("browserContext-media-pause", "disabled", hasError);
      this.setItemAttr("browserContext-media-mute", "disabled", hasError);
      this.setItemAttr("browserContext-media-unmute", "disabled", hasError);
    }
  }
  initBackForwardMenuItemTooltip(menuItemId, l10nId, shortcutId) {
    // On macOS regular menuitems are used and the shortcut isn't added.
    if (
      AppConstants.platform == "macosx" &&
      Services.prefs.getBoolPref("widget.macos.native-context-menus", true)
    ) {
      return;
    }

    let shortcut = this.document.getElementById(shortcutId);
    if (shortcut) {
      shortcut = lazy.ShortcutUtils.prettifyShortcut(shortcut);
    } else {
      // Sidebar doesn't have navigation buttons or shortcuts, but we still
      // want to format the menu item tooltip to remove "$shortcut" string.
      shortcut = "";
    }
    const menuItem = this.document.getElementById(menuItemId);
    this.document.l10n.setAttributes(menuItem, l10nId, { shortcut });
  }
  initBrowserItems() {
    // Work out if we are a context menu on a special item e.g. an image, link
    // etc.
    const onSpecialItem =
      this.isContentSelected ||
      this.onCanvas ||
      this.onLink ||
      this.onImage ||
      this.onAudio ||
      this.onVideo ||
      this.onTextInput;

    // Internal about:* pages should not show nav items.
    const shouldShowNavItems =
      !onSpecialItem && this.browser.currentURI.scheme != "about";

    // Ensure these commands are updated with their current status.
    if (shouldShowNavItems) {
      this.window.goUpdateCommand("Browser:Back");
      this.window.goUpdateCommand("Browser:Forward");
      this.window.goUpdateCommand("cmd_stop");
      this.window.goUpdateCommand("cmd_reload");
    }

    const stopped = this.document
      .getElementById("cmd_stop")
      .hasAttribute("disabled");
    this.showItem("browserContext-reload", shouldShowNavItems && stopped);
    this.showItem("browserContext-stop", shouldShowNavItems && !stopped);
    this.showItem("browserContext-sep-navigation", shouldShowNavItems);

    if (
      AppConstants.platform == "macosx" &&
      Services.prefs.getBoolPref("widget.macos.native-context-menus", true)
    ) {
      this.showItem("browserContext-back", shouldShowNavItems);
      this.showItem("browserContext-forward", shouldShowNavItems);
    } else {
      this.showItem("context-navigation", shouldShowNavItems);

      this.initBackForwardMenuItemTooltip(
        "browserContext-back",
        "content-tab-menu-back",
        "key_goBackKb"
      );
      this.initBackForwardMenuItemTooltip(
        "browserContext-forward",
        "content-tab-menu-forward",
        "key_goForwardKb"
      );
    }

    // Only show open in browser if we're not on a special item and we're not
    // on an about: or chrome: protocol - for these protocols the browser is
    // unlikely to show the same thing as we do (if at all), so therefore don't
    // offer the option.
    this.showItem(
      "browserContext-openInBrowser",
      !onSpecialItem &&
        ["http", "https"].includes(this.contentData?.documentURIObject?.scheme)
    );

    // Only show browserContext-openLinkInBrowser if we're on a link and it isn't
    // a mailto link.
    this.showItem(
      "browserContext-openLinkInBrowser",
      this.onLink && ["http", "https"].includes(this.linkProtocol)
    );
  }
  initSeparators() {
    const separators = Array.from(
      this.xulMenu.querySelectorAll(":scope > menuseparator")
    );
    let lastShownSeparator = null;
    for (const separator of separators) {
      let shouldShow = this.shouldShowSeparator(separator);
      if (
        !shouldShow &&
        lastShownSeparator &&
        separator.classList.contains("webextension-group-separator")
      ) {
        // The separator for the WebExtension elements group must be shown, hide
        // the last shown menu separator instead.
        lastShownSeparator.hidden = true;
        shouldShow = true;
      }
      if (shouldShow) {
        lastShownSeparator = separator;
      }
      separator.hidden = !shouldShow;
    }
    this.checkLastSeparator(this.xulMenu);
  }

  /**
   * Get a computed style property for an element.
   *
   * @param {Node} aElem - A DOM node.
   * @param {string} aProp - The desired CSS property.
   * @returns {string} the value of the property.
   */
  getComputedStyle(aElem, aProp) {
    return aElem.ownerGlobal.getComputedStyle(aElem).getPropertyValue(aProp);
  }

  /**
   * Determine whether the clicked-on link can be saved, and whether it
   * may be saved according to the ScriptSecurityManager.
   *
   * @returns {boolean} true if the protocol can be persisted and if the
   *   target has permission to link to the URL, false if not.
   */
  isLinkSaveable() {
    try {
      Services.scriptSecurityManager.checkLoadURIWithPrincipal(
        this.target.nodePrincipal,
        this.linkURI,
        Ci.nsIScriptSecurityManager.STANDARD
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
    this.window.saveURL(
      this.linkURL,
      null,
      this.linkTextStr,
      null,
      true,
      null,
      null,
      null,
      this.document
    );
  }

  /**
   * Save a clicked-on image.
   */
  saveImage() {
    this.window.saveURL(
      this.imageInfo.currentSrc,
      null,
      null,
      "SaveImageTitle",
      false,
      null,
      null,
      null,
      this.document
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
   *
   * @param {Node|string} aItemOrId - A DOM node or the id of a DOM node.
   * @param {boolean} aShow - true to show, false to hide.
   */
  showItem(aItemOrId, aShow) {
    var item =
      aItemOrId.constructor == String
        ? this.document.getElementById(aItemOrId)
        : aItemOrId;
    if (item) {
      item.hidden = !aShow;
    }
  }

  /**
   * Set a DOM node's disabled property by passing in the node's id or the
   * element itself.
   *
   * @param {Node|string} aItemOrId - A DOM node or the id of a DOM node.
   * @param {boolean} aEnabled - true to enable the element, false to disable.
   */
  enableItem(aItemOrId, aEnabled) {
    var item =
      aItemOrId.constructor == String
        ? this.document.getElementById(aItemOrId)
        : aItemOrId;
    item.disabled = !aEnabled;
  }

  /**
   * Set given attribute of specified context-menu item. If the
   * value is null, then it removes the attribute (which works
   * nicely for the disabled attribute).
   *
   * @param {string} aId - The id of an element.
   * @param {string} aAttr - The attribute name.
   * @param {?string} aVal - The value to set the attribute to, or null to
   *   remove the attribute.
   */
  setItemAttr(aId, aAttr, aVal) {
    var elem = this.document.getElementById(aId);
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
   *
   * @returns {string} the string absolute URL for the clicked-on link.
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
   *
   * @returns {?nsIURI} an nsIURI if possible, or null if not.
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
   *
   * @returns {?string} a scheme, possibly undefined, or null if there's no linkURI
   */
  getLinkProtocol() {
    if (this.linkURI) {
      return this.linkURI.scheme; // Can be |undefined|.
    }

    return null;
  }

  /**
   * Get the text of the clicked-on link.
   *
   * @returns {string}
   */
  linkText() {
    return this.linkTextStr;
  }

  /**
   * Determines whether the focused window has something selected.
   *
   * @returns {boolean} true if there is a selection, false if not
   */
  isContentSelection() {
    return !this.document.commandDispatcher.focusedthis.window.getSelection()
      .isCollapsed;
  }

  /**
   * Convert relative URL to absolute, using a provided <base>.
   *
   * @param {string} aBase - The URL string to use as the base.
   * @param {string} aUrl - The possibly-relative URL string.
   * @returns {string} The string absolute URL.
   */
  makeURLAbsolute(aBase, aUrl) {
    // Construct nsIURL.
    var baseURI = Services.io.newURI(aBase);

    return Services.io.newURI(baseURI.resolve(aUrl)).spec;
  }

  /**
   * Determine whether a DOM node is a text or password input, or a textarea.
   *
   * @param {Node} aNode - The DOM node to check.
   * @returns {boolean} true for textboxes, false for other elements
   */
  isTargetATextBox(aNode) {
    if (HTMLInputElement.isInstance(aNode)) {
      return aNode.type == "text" || aNode.type == "password";
    }

    return HTMLTextAreaElement.isInstance(aNode);
  }

  /**
   * Determine whether a separator should be shown based on whether
   * there are any non-hidden items between it and the previous separator.
   *
   * @param {Element} element - The separator element.
   * @returns {boolean} true if the separator should be shown, false if not.
   */
  shouldShowSeparator(element) {
    if (element) {
      let sibling = element.previousElementSibling;
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
   * @param {Element} aPopup - The menu to check.
   */
  checkLastSeparator(aPopup) {
    let sibling = aPopup.lastElementChild;
    while (sibling) {
      if (!sibling.hidden) {
        if (sibling.localName == "menuseparator") {
          // If we got here then the item is a menuseparator and everything
          // below it hidden.
          sibling.toggleAttribute("hidden", true);
          return;
        }
        return;
      }
      sibling = sibling.previousElementSibling;
    }
  }

  openInBrowser() {
    const url = this.contentData?.documentURIObject?.spec;
    if (!url) {
      return;
    }
    openLinkExternally(url);
  }

  openLinkInBrowser() {
    openLinkExternally(this.linkURI);
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

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(nsContextMenu, {
  WebNavigationFrames: "resource://gre/modules/WebNavigationFrames.sys.mjs",
});
