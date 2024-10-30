/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file is loaded in messenger.xhtml.
/* globals gatherTextUnder, goUpdateGlobalEditMenuItems, makeURLAbsolute, Services */
/* import-globals-from ../../../base/content/widgets/browserPopups.js */

var { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

var gChatContextMenu = null;

function imContextMenu(aXulMenu) {
  this.target = null;
  this.menu = null;
  this.onLink = false;
  this.onMailtoLink = false;
  this.onSaveableLink = false;
  this.link = false;
  this.linkURL = "";
  this.linkURI = null;
  this.linkProtocol = null;
  this.isTextSelected = false;
  this.isContentSelected = false;
  this.shouldDisplay = true;
  this.ellipsis = "\u2026";
  this.initedActions = false;

  try {
    this.ellipsis = Services.prefs.getComplexValue(
      "intl.ellipsis",
      Ci.nsIPrefLocalizedString
    ).data;
  } catch (e) {}

  // Initialize new menu.
  this.initMenu(aXulMenu);
}

// Prototype for nsContextMenu "class."
imContextMenu.prototype = {
  cleanup() {
    nsContextMenu.contentData.browser.browsingContext.currentWindowGlobal
      ?.getActor("ChatAction")
      .reportHide();
    let elt = document.getElementById(
      "context-sep-messageactions"
    ).nextElementSibling;
    // remove the action menuitems added last time we opened the popup
    while (elt && elt.localName != "menuseparator") {
      const tmp = elt.nextElementSibling;
      elt.remove();
      elt = tmp;
    }
  },

  /**
   * Initialize context menu. Shows/hides relevant items. Message actions are
   * handled separately in |initActions| if the actor gets them after this is
   * called.
   *
   * @param {XULMenuPopupElement} aPopup - The popup to initialize on.
   */
  initMenu(aPopup) {
    this.menu = aPopup;

    // Get contextual info.
    this.setTarget();

    this.isTextSelected = this.isTextSelection();
    this.isContentSelected = this.isContentSelection();

    // Initialize (disable/remove) menu items.
    // Open/Save/Send link depends on whether we're in a link.
    var shouldShow = this.onSaveableLink;
    this.showItem("context-openlink", shouldShow);
    this.showItem("context-sep-open", shouldShow);
    this.showItem("context-savelink", shouldShow);

    // Copy depends on whether there is selected text.
    // Enabling this context menu item is now done through the global
    // command updating system
    goUpdateGlobalEditMenuItems();

    this.showItem("context-copy", this.isContentSelected);
    this.showItem("context-selectall", !this.onLink || this.isContentSelected);
    if (!this.initedActions) {
      const actor =
        nsContextMenu.contentData.browser.browsingContext.currentWindowGlobal?.getActor(
          "ChatAction"
        );
      if (actor?.actions) {
        this.initActions(actor.actions);
      } else {
        this.showItem("context-sep-messageactions", false);
      }
    }

    // Copy email link depends on whether we're on an email link.
    this.showItem("context-copyemail", this.onMailtoLink);

    // Copy link location depends on whether we're on a non-mailto link.
    this.showItem("context-copylink", this.onLink && !this.onMailtoLink);
    this.showItem(
      "context-sep-copylink",
      this.onLink && this.isContentSelected
    );
  },

  /**
   * Adds the given message actions to the context menu.
   *
   * @param {Array<string>} actions - Array containing the labels for the
   *   available actions.
   */
  initActions(actions) {
    this.showItem("context-sep-messageactions", actions.length > 0);

    // Display action menu items.
    const sep = document.getElementById("context-sep-messageactions");
    for (const [index, label] of actions.entries()) {
      const menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("label", label);
      menuitem.addEventListener("command", () => {
        nsContextMenu.contentData.browser.browsingContext.currentWindowGlobal
          ?.getActor("ChatAction")
          .sendAsyncMessage("ChatAction:Run", { index });
      });
      sep.parentNode.appendChild(menuitem);
    }
    this.initedActions = true;
  },

  // Set various context menu attributes based on the state of the world.
  setTarget() {
    // Initialize contextual info.
    this.onLink = nsContextMenu.contentData.context.onLink;
    this.linkURL = nsContextMenu.contentData.context.linkURL;
    this.linkURI = this.getLinkURI();
    this.linkProtocol = nsContextMenu.contentData.context.linkProtocol;
    this.linkText = nsContextMenu.contentData.context.linkTextStr;
    this.onMailtoLink = nsContextMenu.contentData.context.onMailtoLink;
    this.onSaveableLink = nsContextMenu.contentData.context.onSaveableLink;
  },

  // Open linked-to URL in a new window.
  openLink(aURI) {
    openLinkExternally(aURI || this.linkURI, {
      addToHistory: false,
      principal: nsContextMenu.contentData.principal,
    });
  },

  // Generate email address and put it on clipboard.
  copyEmail() {
    // Copy the comma-separated list of email addresses only.
    // There are other ways of embedding email addresses in a mailto:
    // link, but such complex parsing is beyond us.
    var url = this.linkURL;
    var qmark = url.indexOf("?");
    var addresses;

    // 7 == length of "mailto:"
    addresses = qmark > 7 ? url.substring(7, qmark) : url.substr(7);

    // Let's try to unescape it using a character set
    // in case the address is not ASCII.
    try {
      var characterSet = this.target.ownerDocument.characterSet;
      addresses = Services.textToSubURI.unEscapeURIForUI(
        characterSet,
        addresses
      );
    } catch (ex) {
      // Do nothing.
    }

    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
      Ci.nsIClipboardHelper
    );
    clipboard.copyString(addresses);
  },

  // ---------
  // Utilities

  // Show/hide one item (specified via name or the item element itself).
  showItem(aItemOrId, aShow) {
    var item =
      aItemOrId.constructor == String
        ? document.getElementById(aItemOrId)
        : aItemOrId;
    if (item) {
      item.hidden = !aShow;
    }
  },

  // Temporary workaround for DOM api not yet implemented by XUL nodes.
  cloneNode(aItem) {
    // Create another element like the one we're cloning.
    var node = document.createXULElement(aItem.tagName);

    // Copy attributes from argument item to the new one.
    var attrs = aItem.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs.item(i);
      node.setAttribute(attr.nodeName, attr.nodeValue);
    }

    // Voila!
    return node;
  },

  getLinkURI() {
    try {
      return Services.io.newURI(this.linkURL);
    } catch (ex) {
      // e.g. empty URL string
    }

    return null;
  },

  // Get selected text. Only display the first 15 chars.
  isTextSelection() {
    // Get 16 characters, so that we can trim the selection if it's greater
    // than 15 chars
    var selectedText = getBrowserSelection(16);

    if (!selectedText) {
      return false;
    }

    if (selectedText.length > 15) {
      selectedText = selectedText.substr(0, 15) + this.ellipsis;
    }

    return true;
  },

  // Returns true if anything is selected.
  isContentSelection() {
    return !document.commandDispatcher.focusedWindow.getSelection().isCollapsed;
  },
};

/**
 * Gets the selected text in the active browser. Leading and trailing
 * whitespace is removed, and consecutive whitespace is replaced by a single
 * space. A maximum of 150 characters will be returned, regardless of the value
 * of aCharLen.
 *
 * @param aCharLen
 *        The maximum number of characters to return.
 */
function getBrowserSelection(aCharLen) {
  // selections of more than 150 characters aren't useful
  const kMaxSelectionLen = 150;
  const charLen = Math.min(aCharLen || kMaxSelectionLen, kMaxSelectionLen);

  var focusedWindow = document.commandDispatcher.focusedWindow;
  var selection = focusedWindow.getSelection().toString();

  if (selection) {
    if (selection.length > charLen) {
      // only use the first charLen important chars. see bug 221361
      var pattern = new RegExp("^(?:\\s*.){0," + charLen + "}");
      pattern.test(selection);
      selection = RegExp.lastMatch;
    }

    selection = selection.trim().replace(/\s+/g, " ");

    if (selection.length > charLen) {
      selection = selection.substr(0, charLen);
    }
  }
  return selection;
}
