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

const purpleIConversation = Components.interfaces.purpleIConversation;
const purpleIConvIM = Components.interfaces.purpleIConvIM;
const purpleIConvChat = Components.interfaces.purpleIConvChat;

function Conversation(aName, aIsChat)
{
  this.name = aName;
  this.isChat = aIsChat;
}
Conversation.prototype = {
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIConversation) ||
        aIid.equals(this.isChat ? purpleIConvChat : purpleIConvIM))
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
  typingStage: purpleIConvIM.NO_TYPING,
  topic: "Fake Conversation",

  setBaseURI: function (aDoc, aURI) {
    Components.classes["@instantbird.org/purple/convim;1"]
              .createInstance(purpleIConversation)
              .setBaseURI(aDoc, aURI);
  }
};

function Message(aTime, aWho, aMessage, aObject)
{
  this.id = ++Message.prototype._lastId;
  this.time = aTime;
  this.alias = aWho;
  this.who = aWho;
  this.message = aMessage;
  this.originalMessage = aMessage;

  if (aObject)
    for (let i in aObject)
      this[i] = aObject[i];
}
Message.prototype = {
  _lastId: 0,
  QueryInterface: function(aIid) {
    if (aIid.equals(Components.interfaces.nsISupports) ||
        aIid.equals(Components.interfaces.purpleIMessage))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  reset: function m_reset() {
    this.message = this.originalMessage;
  },
  conversation: null,
  color: "",
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

var previewObserver = {
  buildThemeList: function() {
    let themeList =
      Components.classes["@mozilla.org/extensions/manager;1"]
                .getService(Components.interfaces.nsIExtensionManager)
                .getItemList(Components.interfaces.nsIUpdateItem.TYPE_EXTENSION, {})
                .filter(function(item) /^messagestyle-/.test(item.id))
                .sort(function(item1, item2) {
                  let name1 = item1.name.toLowerCase();
                  let name2 = item2.name.toLowerCase();
                  return name1 < name2 ? -1 : name1 > name2 ? 1 : 0;
                });

    let menulist = document.getElementById("themename");
    if (!themeList.length)
      return;

    document.getElementById("nomessagestyles-menuitem").setAttribute("hidden", "true");

    themeList.forEach(function(aItem) {
      menulist.appendItem(aItem.name,
                          aItem.id.replace(/^messagestyle-([^@]+)@.*/, "$1"));
    });
  },
  _loaded: false,
  load: function() {
    previewObserver.buildThemeList();

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

    let themeName = document.getElementById("themename");
    if (themeName.value && !themeName.selectedItem)
      themeName.value = themeName.value;
    previewObserver.browser = document.getElementById("previewbrowser");
    document.getElementById("showHeaderCheckbox")
            .addEventListener("CheckboxStateChange",
                              previewObserver.showHeaderChanged, false);
    previewObserver.displayTheme(themeName.value);
    this._loaded = true;
  },

  showHeaderChanged: function() {
    if (!previewObserver._loaded)
      return;

    previewObserver.theme.showHeader = this.checked;
    previewObserver.reloadPreview();
  },

  currentThemeChanged: function() {
    if (!this._loaded)
      return;

    let currentTheme = document.getElementById("themename").value;
    if (!currentTheme)
      return;

    this.displayTheme(currentTheme);
  },

  _ignoreVariantChange: false,
  currentVariantChanged: function() {
    if (!this._loaded || this._ignoreVariantChange)
      return;

    let variant = document.getElementById("themevariant").value;
    if (!variant)
      return;

    this.theme.variant = variant;
    this.reloadPreview();
  },

  displayTheme: function(aTheme) {
    try {
      this.theme = getThemeByName(aTheme);
    }
    catch(e) {
      document.getElementById("previewDeck").selectedIndex = 0;
      return;
    }

    let menulist = document.getElementById("themevariant");
    if (menulist.firstChild)
      menulist.removeChild(menulist.firstChild);
    let popup = menulist.appendChild(document.createElement("menupopup"));
    let variants = getThemeVariants(this.theme);

    let defaultVariant = "";
    if (("DefaultVariant" in this.theme.metadata) &&
        variants.indexOf(this.theme.metadata.DefaultVariant) != -1)
      defaultVariant = this.theme.metadata.DefaultVariant.replace(/_/g, " ");

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
        menuitem.setAttribute("label", aVariantName.replace(/_/g, " "));
        menuitem.setAttribute("value", aVariantName);
        popup.appendChild(menuitem);
      }
    });
    this._ignoreVariantChange = true;
    if (!this._loaded)
      menulist.value = this.theme.variant = menulist.value;
    else {
      menulist.value = this.theme.variant; // (reset to "default")
      document.getElementById("paneThemes").userChangedValue(menulist);
    }
    this._ignoreVariantChange = false;

    // disable the variant menulist if there's no variant, or only one
    // which is the default
    menulist.disabled = variants.length == 0 ||
                        variants.length == 1 && defaultVariant;

    document.getElementById("showHeaderCheckbox").disabled =
      !this.theme.html.hasOwnProperty("header");

    this.reloadPreview();
    document.getElementById("previewDeck").selectedIndex = 1;
  },

  reloadPreview: function() {
    this.conv.messages.forEach(function (m) { m.reset(); });
    this.browser.init(this.conv);
    this.browser._theme = this.theme;
    Components.classes["@mozilla.org/observer-service;1"]
              .getService(Components.interfaces.nsIObserverService)
              .addObserver(this, "conversation-loaded", false);
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic != "conversation-loaded" || aSubject != this.browser)
      return;

    // Display all queued messages. Use a timeout so that message text
    // modifiers can be added with observers for this notification.
    setTimeout(function(aSelf) {
      aSelf.conv.messages.forEach(aSelf.browser.appendMessage, aSelf.browser);
    }, 0, this);

    Components.classes["@mozilla.org/observer-service;1"]
              .getService(Components.interfaces.nsIObserverService)
              .removeObserver(this, "conversation-loaded");
  }
};
