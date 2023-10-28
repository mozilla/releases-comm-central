/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../utilityOverlay.js */

/* globals saveURL */ // From contentAreaUtils.js
/* globals goUpdateCommand */ // From globalOverlay.js

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { InlineSpellChecker, SpellCheckHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/InlineSpellChecker.sys.mjs"
);
var { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
var { ShortcutUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ShortcutUtils.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailUtils",
  "resource:///modules/MailUtils.jsm"
);
var { E10SUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/E10SUtils.sys.mjs"
);

var gContextMenu;
var gSpellChecker = new InlineSpellChecker();

/** Called by ContextMenuParent.sys.mjs */
function openContextMenu({ data }, browser, actor) {
  if (!browser.hasAttribute("context")) {
    return;
  }

  const wgp = actor.manager;

  if (!wgp.isCurrentGlobal) {
    // Don't display context menus for unloaded documents
    return;
  }

  // NOTE: We don't use `wgp.documentURI` here as we want to use the failed
  // channel URI in the case we have loaded an error page.
  const documentURIObject = wgp.browsingContext.currentURI;

  let frameReferrerInfo = data.frameReferrerInfo;
  if (frameReferrerInfo) {
    frameReferrerInfo = E10SUtils.deserializeReferrerInfo(frameReferrerInfo);
  }

  let linkReferrerInfo = data.linkReferrerInfo;
  if (linkReferrerInfo) {
    linkReferrerInfo = E10SUtils.deserializeReferrerInfo(linkReferrerInfo);
  }

  const frameID = nsContextMenu.WebNavigationFrames.getFrameId(
    wgp.browsingContext
  );

  nsContextMenu.contentData = {
    context: data.context,
    browser,
    actor,
    editFlags: data.editFlags,
    spellInfo: data.spellInfo,
    principal: wgp.documentPrincipal,
    storagePrincipal: wgp.documentStoragePrincipal,
    documentURIObject,
    docLocation: data.docLocation,
    charSet: data.charSet,
    referrerInfo: E10SUtils.deserializeReferrerInfo(data.referrerInfo),
    frameReferrerInfo,
    linkReferrerInfo,
    contentType: data.contentType,
    contentDisposition: data.contentDisposition,
    frameID,
    frameOuterWindowID: frameID,
    frameBrowsingContext: wgp.browsingContext,
    selectionInfo: data.selectionInfo,
    disableSetDesktopBackground: data.disableSetDesktopBackground,
    loginFillInfo: data.loginFillInfo,
    parentAllowsMixedContent: data.parentAllowsMixedContent,
    userContextId: wgp.browsingContext.originAttributes.userContextId,
    webExtContextData: data.webExtContextData,
    cookieJarSettings: wgp.cookieJarSettings,
  };

  // Note: `popup` must be in `document`, but `browser` might be in a
  // different document, such as about:3pane.
  const popup = document.getElementById(browser.getAttribute("context"));
  const context = nsContextMenu.contentData.context;

  // Fill in some values in the context from the WindowGlobalParent actor.
  context.principal = wgp.documentPrincipal;
  context.storagePrincipal = wgp.documentStoragePrincipal;
  context.frameID = frameID;
  context.frameOuterWindowID = wgp.outerWindowId;
  context.frameBrowsingContextID = wgp.browsingContext.id;

  // We don't have access to the original event here, as that happened in
  // another process. Therefore we synthesize a new MouseEvent to propagate the
  // inputSource to the subsequently triggered popupshowing event.
  const newEvent = document.createEvent("MouseEvent");
  const screenX = context.screenXDevPx / window.devicePixelRatio;
  const screenY = context.screenYDevPx / window.devicePixelRatio;
  newEvent.initNSMouseEvent(
    "contextmenu",
    true,
    true,
    null,
    0,
    screenX,
    screenY,
    0,
    0,
    false,
    false,
    false,
    false,
    2,
    null,
    0,
    context.mozInputSource
  );
  popup.openPopupAtScreen(newEvent.screenX, newEvent.screenY, true, newEvent);
}

/**
 * Function to set the global nsContextMenu. Called by popupshowing on browserContext.
 *
 * @param {Event} event - The onpopupshowing event.
 * @returns {boolean}
 */
function browserContextOnShowing(event) {
  if (event.target.id != "browserContext") {
    return true;
  }

  gContextMenu = new nsContextMenu(event.target, event.shiftKey);
  return gContextMenu.shouldDisplay;
}

/**
 * Function to clear out the global nsContextMenu.
 *
 * @param {Event} event - The onpopuphiding event.
 */
function browserContextOnHiding(event) {
  if (event.target.id != "browserContext") {
    return;
  }

  gContextMenu.hiding();
  gContextMenu = null;
}

class nsContextMenu {
  constructor(aXulMenu, aIsShift) {
    this.xulMenu = aXulMenu;

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
    const contextPopup = document.getElementById("browserContext");
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

    this.csp = E10SUtils.deserializeCSP(context.csp);

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
    openDictionaryList();
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
    document
      .getElementById("browserContext-spell-check-enabled")
      .setAttribute("checked", canSpell && gSpellChecker.enabled);

    this.showItem("browserContext-spell-add-to-dictionary", onMisspelling);
    this.showItem("browserContext-spell-undo-add-to-dictionary", showUndo);

    // suggestion list
    this.showItem(
      "browserContext-spell-suggestions-separator",
      onMisspelling || showUndo
    );
    if (onMisspelling) {
      const addMenuItem = document.getElementById(
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
      const dictMenu = document.getElementById(
        "browserContext-spell-dictionaries-menu"
      );
      const dictSep = document.getElementById(
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

    goUpdateGlobalEditMenuItems();

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

    const searchTheWeb = document.getElementById("browserContext-searchTheWeb");
    this.showItem(
      searchTheWeb,
      !this.onPlayableMedia && this.isContentSelected
    );

    if (!searchTheWeb.hidden) {
      const selection = this.textSelected;

      const bundle = document.getElementById("bundle_messenger");
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
    if (AppConstants.platform == "macosx") {
      return;
    }

    let shortcut = document.getElementById(shortcutId);
    if (shortcut) {
      shortcut = ShortcutUtils.prettifyShortcut(shortcut);
    } else {
      // Sidebar doesn't have navigation buttons or shortcuts, but we still
      // want to format the menu item tooltip to remove "$shortcut" string.
      shortcut = "";
    }
    const menuItem = document.getElementById(menuItemId);
    document.l10n.setAttributes(menuItem, l10nId, { shortcut });
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
      goUpdateCommand("Browser:Back");
      goUpdateCommand("Browser:Forward");
      goUpdateCommand("cmd_stop");
      goUpdateCommand("cmd_reload");
    }

    const stopped = document
      .getElementById("cmd_stop")
      .hasAttribute("disabled");
    this.showItem("browserContext-reload", shouldShowNavItems && stopped);
    this.showItem("browserContext-stop", shouldShowNavItems && !stopped);
    this.showItem("browserContext-sep-navigation", shouldShowNavItems);

    if (AppConstants.platform == "macosx") {
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
   * @param  aElem
   *         A DOM node
   * @param  aProp
   *         The desired CSS property
   * @returns the value of the property
   */
  getComputedStyle(aElem, aProp) {
    return aElem.ownerGlobal.getComputedStyle(aElem).getPropertyValue(aProp);
  }

  /**
   * Determine whether the clicked-on link can be saved, and whether it
   * may be saved according to the ScriptSecurityManager.
   *
   * @returns true if the protocol can be persisted and if the target has
   *         permission to link to the URL, false if not
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
    saveURL(
      this.linkURL,
      null,
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
   *
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
   * Set given attribute of specified context-menu item. If the
   * value is null, then it removes the attribute (which works
   * nicely for the disabled attribute).
   *
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
   *
   * @returns the string absolute URL for the clicked-on link
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
   * @returns an nsIURI if possible, or null if not
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
   * @returns a scheme, possibly undefined, or null if there's no linkURI
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
   * @returns true if there is a selection, false if not
   */
  isContentSelection() {
    return !document.commandDispatcher.focusedWindow.getSelection().isCollapsed;
  }

  /**
   * Convert relative URL to absolute, using a provided <base>.
   *
   * @param  aBase
   *         The URL string to use as the base
   * @param  aUrl
   *         The possibly-relative URL string
   * @returns The string absolute URL
   */
  makeURLAbsolute(aBase, aUrl) {
    // Construct nsIURL.
    var baseURI = Services.io.newURI(aBase);

    return Services.io.newURI(baseURI.resolve(aUrl)).spec;
  }

  /**
   * Determine whether a DOM node is a text or password input, or a textarea.
   *
   * @param  aNode
   *         The DOM node to check
   * @returns true for textboxes, false for other elements
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
   * @param {DomElement} element - The separator element.
   * @returns {boolean} True if the separator should be shown, false if not.
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
    const url = this.contentData?.documentURIObject?.spec;
    if (!url) {
      return;
    }
    PlacesUtils.history
      .insert({
        url,
        visits: [
          {
            date: new Date(),
          },
        ],
      })
      .catch(console.error);
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
      .catch(console.error);
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

ChromeUtils.defineESModuleGetters(nsContextMenu, {
  WebNavigationFrames: "resource://gre/modules/WebNavigationFrames.sys.mjs",
});
