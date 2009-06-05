/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

function Conversation(aName, aIsChat)
{
  this.name = aName;
  this.isChat = aIsChat;
}
Conversation.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIConversation) ||
        aIid.equals(this.isChat ? Ci.purpleIConvChat : Ci.purpleIConvIM))
      return this;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  addObserver: function(aObserver) { },
  removeObserver: function() { },
  close: function() null,
  sendTyping: function() null,

  get title() this.name,
    account: {protocol: {name: "Fake Protocol"}, name: "Fake Account"},
  buddy: null,
  typingStage: Ci.purpleIConvIM.NO_TYPING,
  topic: "Fake Conversation",

  setBaseURI: function (aDoc, aURI) {
    Components.classes["@instantbird.org/purple/convim;1"]
              .createInstance(Ci.purpleIConversation)
              .setBaseURI(aDoc, aURI);
  }
};

function Message(aTime, aWho, aMessage, aObject)
{
  this.time = aTime;
  this.alias = aWho;
  this.who = aWho;
  this.message = aMessage;

  if (aObject)
    for (let i in aObject)
      this[i] = aObject[i];
}
Message.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIMessage))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  conversation: null,
  outgoing: false,
  incoming: false,
  system: false,
  autoResponse: false,
  containsNick: false,
  noLog: false,
  error: false,
  delayed: false,
  noFormat: false,
  containsImages: false,
  notification: false,
  noLinkification: false
};

const messagesStylePrefBranch = "messenger.options.messagesStyle.";
const themePref = "theme";
const variantPref = "variant";
const showHeaderPref = "showHeader";

var previewObserver = {
  buildThemeList: function() {
    let themeList =
      Components.classes["@mozilla.org/extensions/manager;1"]
                .getService(Components.interfaces.nsIExtensionManager)
                .getItemList(Components.interfaces.nsIUpdateItem.TYPE_EXTENSION, {})
                .filter(function(item) /^messagestyle-/.test(item.id));
    let createMenuItem = function(aItem) {
      let item = document.createElement("menuitem");
      item.setAttribute("label", aItem.name);
      item.setAttribute("value",
                        aItem.id.replace(/^messagestyle-([^@]+)@.*/, "$1"));
      return item;
    };
    let menulist = document.getElementById("themename");
    let popup = menulist.appendChild(document.createElement("menupopup"));
    let menuitem = document.createElement("menuitem");
    let defaultText = document.getElementById("messageStyleBundle")
                              .getString("default");
    menuitem.setAttribute("label", defaultText);
    menuitem.setAttribute("value", "default");
    popup.appendChild(menuitem);
    popup.appendChild(document.createElement("menuseparator"));
    themeList.map(createMenuItem)
             .forEach(function (e) { popup.appendChild(e); });
  },
  load: function() {
    previewObserver.buildThemeList();
    previewObserver.prefs =
      Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService)
                .getBranch(messagesStylePrefBranch);

    // load the stylesheet through the style sheet service to workaround
    // a security restriction in 1.9b2+ (bug 397791)
    var sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
                        .getService(Components.interfaces.nsIStyleSheetService);
    var uri = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService)
                        .newURI("chrome://instantbird/skin/conv.css", null, null);
    if (!sss.sheetRegistered(uri, sss.USER_SHEET))
      sss.loadAndRegisterSheet(uri, sss.USER_SHEET);

    var browser = document.getElementById("browser");
    browser.docShell.allowJavascript = false;

    Components.utils.import("resource://app/modules/imContentSink.jsm");
    Components.utils.import("resource://app/modules/imSmileys.jsm");
    Components.utils.import("resource://app/modules/imThemes.jsm");

    let makeDate = function(aDateString) {
      let array = aDateString.split(":");
      return (new Date(2009, 11, 8, array[0], array[1], array[2])) / 1000;
    };
    let bundle = document.getElementById("messageStyleBundle");
    let msg = {};
    ["nick1", "buddy1", "nick2", "buddy2",
     "message1", "message2", "message3"].forEach(function(aText) {
      msg[aText] = bundle.getString(aText);
    });
    let conv = new Conversation(msg.nick2);
    conv.messages = [
      new Message(makeDate("10:42:22"), msg.nick1, msg.message1, {outgoing: true, conversation: conv, who: msg.buddy1}),
      new Message(makeDate("10:42:25"), msg.nick1, msg.message2, {outgoing: true, conversation: conv, who: msg.buddy1}),
      new Message(makeDate("10:43:01"), msg.nick2, msg.message3, {incoming: true, conversation: conv, who: msg.buddy2})
    ];
    previewObserver.conv = conv;

    let menulist = document.getElementById("themename").value =
      previewObserver.prefs.getCharPref(themePref);
    document.getElementById("showHeaderCheckbox").checked =
      previewObserver.prefs.getBoolPref(showHeaderPref);
    previewObserver.displayCurrentTheme();
  },
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.nsISupportsWeakReference) ||
        aIid.equals(Components.interfaces.nsIWebProgressListener))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  showHeaderChanged: function() {
    let newValue = document.getElementById("showHeaderCheckbox").checked;
    previewObserver.prefs.setBoolPref(showHeaderPref, newValue);
    this.theme.showHeader = newValue;
    this.reloadPreview();
  },

  currentThemeChanged: function() {
    let currentTheme = document.getElementById("themename").value;
    if (!currentTheme)
      return;

    previewObserver.prefs.setCharPref(themePref, currentTheme);
    previewObserver.prefs.setCharPref(variantPref, "default");
    this.displayCurrentTheme();
  },

  currentVariantChanged: function() {
    let variant = document.getElementById("themevariant").value;
    if (!variant)
      return;

    previewObserver.prefs.setCharPref(variantPref, variant);
    this.theme.variant = variant;
    this.reloadPreview();
  },

  displayCurrentTheme: function() {
    this.theme = getCurrentTheme();
    let menulist = document.getElementById("themevariant");
    if (menulist.firstChild)
      menulist.removeChild(menulist.firstChild);
    let popup = menulist.appendChild(document.createElement("menupopup"));
    let variants = getThemeVariants(this.theme);

    let defaultVariant = "";
    if (("DefaultVariant" in this.theme.metadata) &&
        variants.indexOf(this.theme.metadata.DefaultVariant) != -1)
      defaultVariant = this.theme.metadata.DefaultVariant;

    let defaultText = defaultVariant;
    if (!defaultText && ("DisplayNameForNoVariant" in this.theme.metadata))
      defaultText = this.theme.metadata.DisplayNameForNoVariant;
    // if the name in the metadata is 'Default', use the localized version
    if (!defaultText || defaultText.toLowerCase() == "default")
      defaultText = document.getElementById("messageStyleBundle")
                            .getString("default");

    let menuitem = document.createElement("menuitem");
    menuitem.setAttribute("label", defaultText);
    menuitem.setAttribute("value", "default");
    popup.appendChild(menuitem);
    popup.appendChild(document.createElement("menuseparator"));

    variants.forEach(function(aVariantName) {
      if (aVariantName != defaultVariant) {
        let menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label", aVariantName);
        menuitem.setAttribute("value", aVariantName);
        popup.appendChild(menuitem);
      }
    });
    menulist.value = this.theme.variant;

    // disable the variant menulist if there's no variant, or only one
    // which is the default
    menulist.disabled = variants.length == 0 ||
                        variants.length == 1 && defaultVariant;

    document.getElementById("showHeaderCheckbox").disabled =
      !this.theme.html.hasOwnProperty("header");

    this.reloadPreview();
  },

  reloadPreview: function() {
    let browser = document.getElementById("browser");
    browser.addProgressListener(previewObserver);
    browser.reload();
  },

  _addMsg: function(aMsg) {
    var conv = aMsg.conversation;

    let doc = document.getElementById("browser").contentDocument;
    let msg = cleanupImMarkup(doc, aMsg.message);
    if (!aMsg.noLinkification) {
      msg = Components.classes["@mozilla.org/txttohtmlconv;1"]
                      .getService(Ci.mozITXTToHTMLConv)
                      .scanHTML(msg, 2)
                      .replace(/&amp;(apos|quot);/g, "&$1;");
    }
    aMsg.message = smileImMarkup(doc, msg.replace(/\n/g, "<br/>"));
    let next = isNextMessage(this.theme, aMsg, this._lastMessage);
    let html = getHTMLForMessage(aMsg, this.theme, next);
    let elt = doc.getElementsByTagName("body")[0];
    let shouldScroll = this.lastElement ||
                       elt.scrollHeight <= elt.scrollTop + elt.clientHeight + 10;
    let newElt = insertHTMLForMessage(html, doc, next);
    if (shouldScroll) {
      newElt.scrollIntoView(true);
      this.lastElement = newElt;
      this.scrollingIntoView = true;
    }
    this._lastMessage = aMsg;
  },

  onStateChange: function(aProgress, aRequest, aStateFlags, aStatus) {
    const WPL = Components.interfaces.nsIWebProgressListener;
    if ((aStateFlags & WPL.STATE_IS_DOCUMENT) &&
        (aStateFlags & WPL.STATE_STOP)) {
      var browser = document.getElementById("browser");
      browser.removeProgressListener(this);
      try {
        initHTMLDocument(this.conv, this.theme, browser.contentDocument);
        this.conv.messages.forEach(this._addMsg, this);
      } catch(e) {dump(e + "\n");}
    }
  },

  onProgressChange: function(aProgress, aRequest, aCurSelf, aMaxSelf, aCurTotal, aMaxTotal) {},
  onLocationChange: function(aProgress, aRequest, aLocation) {},
  onStatusChange: function(aProgress, aRequest, aStatus, aMessage) {},
  onSecurityChange: function(aProgress, aRequest, aState) {}
};

this.addEventListener("load", previewObserver.load, false);
