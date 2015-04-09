/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/ibTagMenu.jsm");

var gContextMenu = null;

function nsContextMenu(aXulMenu, aBrowser) {
  this.target            = null;
  this.browser           = null;
  this.conv              = null;
  this.menu              = null;
  this.tagMenu           = null;
  this.onLink            = false;
  this.onMailtoLink      = false;
  this.onSaveableLink    = false;
  this.link              = false;
  this.linkURL           = "";
  this.linkURI           = null;
  this.linkProtocol      = null;
  this.onNick            = false;
  this.nick              = "";
  this.isNickOpenConv    = false;
  this.isNickShowLogs    = false;
  this.isNickAddContact  = false;
  this.isTextSelected    = false;
  this.isContentSelected = false;
  this.shouldDisplay     = true;

  try {
    this.ellipsis =
      Services.prefs.getComplexValue("intl.ellipsis",
                                     Ci.nsIPrefLocalizedString).data;
  } catch (e) {
    this.ellipsis = "\u2026";
  }

  // Initialize new menu.
  this.initMenu(aXulMenu, aBrowser);
}

// Prototype for nsContextMenu "class."
nsContextMenu.prototype = {
  cleanup: function() {
    let elt = document.getElementById("context-sep-selectall").nextSibling;
    // remove the action menuitems added last time we opened the popup
    while (elt && elt.localName != "menuseparator") {
      let tmp = elt.nextSibling;
      elt.remove();
      elt = tmp;
    }
  },

  // Initialize context menu.
  initMenu: function CM_initMenu(aPopup, aBrowser) {
    this.menu = aPopup;
    this.browser = aBrowser;
    this.conv = this.browser._conv;

    // Get contextual info.
    let node = document.popupNode;
    if (node.localName == "listbox") {
      // Clicked the participant list, but not a listitem.
      this.shouldDisplay = false;
      return;
    }
    this.setTarget(node);

    let isParticipantList = node.localName == "listitem";
    let nickActions = this.getNickActions(isParticipantList);
    this.onNick = nickActions.some(action => action.visible);
    if (isParticipantList && !this.onNick) {
      // If we're in the participant list, there will be no other entries.
      this.shouldDisplay = false;
      return;
    }

    let actions = [];
    while (node) {
      if (node._originalMsg) {
        let msg = node._originalMsg;
        actions = msg.getActions();
        break;
      }
      node = node.parentNode;
    }

    this.isTextSelected = this.isTextSelection();
    this.isContentSelected = this.isContentSelection();

    // Initialize (disable/remove) menu items.
    // Open/Save/Send link depends on whether we're in a link.
    let shouldShow = this.onSaveableLink;
    this.showItem("context-openlink", shouldShow);
    this.showItem("context-sep-open", shouldShow);
    this.showItem("context-savelink", shouldShow);

    this.showItem("context-searchselect", this.isTextSelected);
    this.showItem("context-searchselect-with", this.isTextSelected);

    // Copy depends on whether there is selected text.
    // Enabling this context menu item is now done through the global
    // command updating system
    goUpdateGlobalEditMenuItems();

    this.showItem("context-copy", this.isContentSelected);
    this.showItem("context-selectall", (!this.onNick && !this.onLink) ||
                                       this.isContentSelected);
    this.showItem("context-sep-selectall", actions.length);
    this.showItem("context-sep-messageactions", this.isTextSelected);

    // Copy email link depends on whether we're on an email link.
    this.showItem("context-copyemail", this.onMailtoLink);

    // Copy link location depends on whether we're on a non-mailto link.
    this.showItem("context-copylink", this.onLink && !this.onMailtoLink);
    this.showItem("context-sep-copylink", this.onLink && this.isContentSelected);

    // Display nick menu items.
    let isNonNickItems = this.isContentSelected || this.isTextSelected ||
                         this.onLink || actions.length;
    this.showItem("context-sep-nick", this.onNick && isNonNickItems);
    for (let action of nickActions)
      this.showItem(action.id, action.visible);

    if (this.onNick) {
      let elt = document.getElementById("context-nick-showlogs");
      // Start disabled, then enable if we have logs.
      elt.setAttribute("disabled", true);
      this.getLogsForNick(this.nick).then(aLogs => {
        if (aLogs && aLogs.hasMoreElements())
          elt.removeAttribute("disabled");
      });
    }

    // Display action menu items.
    let before = document.getElementById("context-sep-messageactions");
    for each (let action in actions) {
      let menuitem = document.createElement("menuitem");
      menuitem.setAttribute("label", action.label);
      menuitem.setAttribute("oncommand", "this.action.run();");
      menuitem.action = action;
      before.parentNode.insertBefore(menuitem, before);
    }
  },

  getLogsForNick: function(aNick) {
    let account = this.conv.account;
    // We need the normalizedName of private conversations opened
    // with a chatBuddy.
    let normalizedName =
      account.normalize(this.conv.target.getNormalizedChatBuddyName(aNick));
    return Services.logs.getLogsForAccountAndName(account,
                                                  normalizedName, true);
  },
  getNickActions: function(aIsParticipantList) {
    let bundle = document.getElementById("bundle_instantbird");
    let nick = this.nick;
    let actions = [];
    let addAction = function(aId, aVisible) {
      let domId = "context-nick-" + aId.toLowerCase();
      let stringId = "contextmenu.nick" + aId;
      if (!aIsParticipantList)
        stringId += ".withNick";
      document.getElementById(domId).label =
        bundle.getFormattedString(stringId, [nick]);
      actions.push({id: domId, visible: aVisible});
    };

    // Special-case twitter. XXX Drop this when twitter DMs work.
    let isTwitter = this.conv.account.protocol.id == "prpl-twitter";

    addAction("OpenConv", this.onNick && !isTwitter);
    addAction("ShowLogs", this.onNick);

    let isAddContact = this.onNick && !isTwitter;
    if (isAddContact) {
      let account = this.conv.account;
      isAddContact = false;
      // We don't want to support adding chatBuddies as contacts if we are not
      // sure the normalizedChatBuddyName is enough information to add a contact.
      // This is a problem e.g. for XMPP MUCs. We require at least that the
      // normalizedChatBuddyName of the nick is normalized like a normalizedName
      // for contacts.
      let normalizedNick = this.conv.target.getNormalizedChatBuddyName(nick);
      if (normalizedNick == account.normalize(normalizedNick) &&
          !Services.contacts.getAccountBuddyByNameAndAccount(normalizedNick, account))
        isAddContact = true;
    }
    addAction("AddContact", isAddContact);
    if (isAddContact) {
      this.tagMenu = new TagMenu(this, window, "context-nick-addcontact",
                                 this.nickAddContact, this.nickAddContact);
    }

    return actions;
  },
  nickOpenConv: function() {
    let name = this.conv.target.getNormalizedChatBuddyName(this.nick);
    let newConv = this.conv.account.createConversation(name);
    Conversations.focusConversation(newConv);
  },
  nickAddContact: function(aTag) {
    return this.conv.account.addBuddy(aTag, this.nick);
  },
  nickShowLogs: function() {
    let nick = this.nick;
    this.getLogsForNick(nick).then(aLogs => {
      if (!aLogs || !aLogs.hasMoreElements())
        return;
      window.openDialog("chrome://instantbird/content/viewlog.xul",
                        "Logs", "chrome,resizable", {logs: aLogs}, nick);
    });
  },

  // Set various context menu attributes based on the state of the world.
  setTarget: function(aNode) {
    // Remember the node that was clicked.
    this.target = aNode;

    // Check if we are in the participant list.
    if (this.target.localName == "listitem") {
      this.onNick = true;
      this.nick = this.target.label;
      return;
    }

    // First, do checks for nodes that never have children.
    // Second, bubble out, looking for items of interest that can have childen.
    // Always pick the innermost link, background image, etc.
    const XMLNS = "http://www.w3.org/XML/1998/namespace";
    var elem = this.target;
    while (elem) {
      if (elem.nodeType == Node.ELEMENT_NODE) {
        // Link?
        if (!this.onLink &&
             ((elem instanceof HTMLAnchorElement && elem.href) ||
              (elem instanceof HTMLAreaElement && elem.href) ||
              elem instanceof HTMLLinkElement ||
              elem.getAttributeNS("http://www.w3.org/1999/xlink", "type") == "simple")) {

          // Target is a link or a descendant of a link.
          this.onLink = true;

          // xxxmpc: this is kind of a hack to work around a Gecko bug (see bug 266932)
          // we're going to walk up the DOM looking for a parent link node,
          // this shouldn't be necessary, but we're matching the existing behaviour for left click
          var realLink = elem;
          var parent = elem;
          while ((parent = parent.parentNode) &&
                 (parent.nodeType == Node.ELEMENT_NODE)) {
            try {
              if ((parent instanceof HTMLAnchorElement && parent.href) ||
                  (parent instanceof HTMLAreaElement && parent.href) ||
                  parent instanceof HTMLLinkElement ||
                  parent.getAttributeNS("http://www.w3.org/1999/xlink", "type") == "simple")
                realLink = parent;
            } catch (e) { }
          }

          // Remember corresponding element.
          this.link = realLink;
          this.linkURL = this.getLinkURL();
          this.linkURI = this.getLinkURI();
          this.linkProtocol = this.getLinkProtocol();
          this.onMailtoLink = (this.linkProtocol == "mailto");
          this.onSaveableLink = this.isLinkSaveable(this.link);
        }

        // Nick?
        if (!this.onNick && this.conv.isChat &&
            (elem.classList.contains("ib-nick") || elem.classList.contains("ib-sender"))) {
          this.nick = elem.textContent;
          this.onNick = true;
        }
      }

      elem = elem.parentNode;
    }
  },

  // Returns true if clicked-on link targets a resource that can be saved.
  isLinkSaveable: function(aLink) {
    return this.linkProtocol && !(
             this.linkProtocol == "mailto"     ||
             this.linkProtocol == "javascript" ||
             this.linkProtocol == "news"       ||
             this.linkProtocol == "snews"      );
  },

  openEngineManager: function() {
    var window = Services.wm.getMostRecentWindow("Browser:SearchManager");
    if (window)
      window.focus();
    else {
      openDialog("chrome://instantbird/content/engineManager.xul",
                 "_blank", "chrome,dialog,modal,centerscreen");
    }
  },

  buildSearchEngineList: function() {
    let popup = document.getElementById("context-popup-searchselect-with");
    // remove the menuitems added last time we opened the popup
    while (popup.firstChild && popup.firstChild.localName != "menuseparator")
      popup.firstChild.remove();

    let engines = Services.search.getVisibleEngines({});

    for (let i = engines.length - 1; i >= 0; --i) {
      let menuitem = document.createElement("menuitem");
      let name = engines[i].name;
      menuitem.setAttribute("label", name);
      menuitem.setAttribute("class", "menuitem-iconic");
      if (engines[i].iconURI)
        menuitem.setAttribute("src", engines[i].iconURI.spec);
      popup.insertBefore(menuitem, popup.firstChild);
      menuitem.engine = engines[i];
    }
  },

  searchSelectionWith: function(aEvent) {
    var engine = aEvent.originalTarget.engine;
    if (engine)
      this.searchSelection(engine);
  },

  searchSelection: function(aEngine) {
    if (!aEngine) {
      aEngine = Services.search.defaultEngine;
    }

    var submission = aEngine.getSubmission(getBrowserSelection(), null);
    // getSubmission can return null if the engine doesn't have a URL
    // with a text/html response type.  This is unlikely (since
    // SearchService._addEngineToStore() should fail for such an engine),
    // but let's be on the safe side.
    if (!submission)
      return;

    this.openLink(submission.uri);
  },

  // Open linked-to URL in a new window.
  openLink: function(aURI) {
    Cc["@mozilla.org/uriloader/external-protocol-service;1"].
    getService(Ci.nsIExternalProtocolService).
    loadURI(aURI || this.linkURI, window);
  },

  // Generate email address and put it on clipboard.
  copyEmail: function() {
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
      const textToSubURI = Cc["@mozilla.org/intl/texttosuburi;1"].
                           getService(Ci.nsITextToSubURI);
      addresses = textToSubURI.unEscapeURIForUI(characterSet, addresses);
    }
    catch(ex) {
      // Do nothing.
    }

    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].
                    getService(Ci.nsIClipboardHelper);
    clipboard.copyString(addresses);
  },

  ///////////////
  // Utilities //
  ///////////////

  // Show/hide one item (specified via name or the item element itself).
  showItem: function(aItemOrId, aShow) {
    var item = aItemOrId.constructor == String ?
      document.getElementById(aItemOrId) : aItemOrId;
    if (item)
      item.hidden = !aShow;
  },

  // Temporary workaround for DOM api not yet implemented by XUL nodes.
  cloneNode: function(aItem) {
    // Create another element like the one we're cloning.
    var node = document.createElement(aItem.tagName);

    // Copy attributes from argument item to the new one.
    var attrs = aItem.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs.item(i);
      node.setAttribute(attr.nodeName, attr.nodeValue);
    }

    // Voila!
    return node;
  },

  // Generate fully qualified URL for clicked-on link.
  getLinkURL: function() {
    var href = this.link.href;
    if (href)
      return href;

    href = this.link.getAttributeNS("http://www.w3.org/1999/xlink",
                                    "href");

    if (!href || !href.match(/\S/)) {
      // Without this we try to save as the current doc,
      // for example, HTML case also throws if empty
      throw "Empty href";
    }

    return makeURLAbsolute(this.link.baseURI, href);
  },

  getLinkURI: function() {
    try {
      return Services.io.newURI(this.linkURL, null, null);
    }
    catch (ex) {
     // e.g. empty URL string
    }

    return null;
  },

  getLinkProtocol: function() {
    if (this.linkURI)
      return this.linkURI.scheme; // can be |undefined|

    return null;
  },

  // Get text of link.
  linkText: function() {
    var text = gatherTextUnder(this.link);
    if (!text || !text.match(/\S/)) {
      text = this.link.getAttribute("title");
      if (!text || !text.match(/\S/)) {
        text = this.link.getAttribute("alt");
        if (!text || !text.match(/\S/))
          text = this.linkURL;
      }
    }

    return text;
  },

  // Get selected text. Only display the first 15 chars.
  isTextSelection: function() {
    // Get 16 characters, so that we can trim the selection if it's greater
    // than 15 chars
    var selectedText = getBrowserSelection(16);

    if (!selectedText)
      return false;

    if (selectedText.length > 15)
      selectedText = selectedText.substr(0,15) + this.ellipsis;

    var engine = Services.search.defaultEngine;
    if (!engine)
      return false;

    // format "Search <engine> for <selection>" string to show in menu
    var bundle = document.getElementById("bundle_instantbird");
    var menuLabel = bundle.getFormattedString("contextMenuSearchText",
                                              [engine.name,
                                               selectedText]);
    document.getElementById("context-searchselect").label = menuLabel;
    document.getElementById("context-searchselect").accessKey =
      bundle.getString("contextMenuSearchText.accesskey");
    menuLabel = bundle.getFormattedString("contextMenuSearchWith",
                                          [selectedText]);
    document.getElementById("context-searchselect-with").label = menuLabel;

    return true;
  },

  // Returns true if anything is selected.
  isContentSelection: function() {
    return !document.commandDispatcher.focusedWindow.getSelection().isCollapsed;
  }
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

    selection = selection.replace(/^\s+/, "")
                         .replace(/\s+$/, "")
                         .replace(/\s+/g, " ");

    if (selection.length > charLen)
      selection = selection.substr(0, charLen);
  }
  return selection;
}
