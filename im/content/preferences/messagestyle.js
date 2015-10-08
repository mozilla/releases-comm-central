/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var jsProtoHelper = {};
Components.utils.import("resource:///modules/jsProtoHelper.jsm", jsProtoHelper);

function Conversation(aName) {
  this._name = aName;
  this._observers = [];
  let now = new Date();
  this._date = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                        10, 42, 22) * 1000;
}
Conversation.prototype = {
  __proto__: jsProtoHelper.GenericConvIMPrototype,
  account: {protocol: {name: "Fake Protocol"},
            alias: "", name: "Fake Account",
            statusInfo: Services.core.globalUserStatus}
};

function Message(aWho, aMessage, aObject) {
  this._init(aWho, aMessage, aObject);
}
Message.prototype = {
  __proto__: jsProtoHelper.GenericMessagePrototype,
  get displayMessage() { return this.originalMessage; }
};

// Message style tooltips use this.
function getBrowser() { return document.getElementById("previewbrowser"); }

var previewObserver = {
  _loaded: false,
  load: function() {
    gThemePane.buildThemeList("messagestyle");

    let makeDate = function(aDateString) {
      let array = aDateString.split(":");
      let now = new Date();
      return (new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                       array[0], array[1], array[2])) / 1000;
    };
    let bundle = document.getElementById("themesBundle");
    let msg = {};
    ["nick1", "buddy1", "nick2", "buddy2",
     "message1", "message2", "message3"].forEach(function(aText) {
      msg[aText] = bundle.getString(aText);
    });
    let conv = new Conversation(msg.nick2);
    conv.messages = [
      new Message(msg.buddy1, msg.message1, {outgoing: true, _alias: msg.nick1, time: makeDate("10:42:22"), _conversation: conv}),
      new Message(msg.buddy1, msg.message2, {outgoing: true, _alias: msg.nick1, time: makeDate("10:42:25"), _conversation: conv}),
      new Message(msg.buddy2, msg.message3, {incoming: true, _alias: msg.nick2, time: makeDate("10:43:01"), _conversation: conv})
    ];
    previewObserver.conv = conv;

    let themeName = document.getElementById("messagestyle-themename");
    if (themeName.value && !themeName.selectedItem)
      themeName.value = themeName.value;
    previewObserver.browser = document.getElementById("previewbrowser");
    document.getElementById("showHeaderCheckbox")
            .addEventListener("CheckboxStateChange",
                              previewObserver.showHeaderChanged);
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

    let currentTheme = document.getElementById("messagestyle-themename").value;
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
      menulist.firstChild.remove();
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
      defaultText = document.getElementById("themesBundle").getString("default");

    let menuitem = document.createElement("menuitem");
    menuitem.setAttribute("label", defaultText);
    menuitem.setAttribute("value", "default");
    popup.appendChild(menuitem);
    popup.appendChild(document.createElement("menuseparator"));

    variants.sort().forEach(function(aVariantName) {
      let displayName = aVariantName.replace(/_/g, " ");
      if (displayName != defaultVariant) {
        let menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label", displayName);
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
    this.browser.init(this.conv);
    this.browser._theme = this.theme;
    Services.obs.addObserver(this, "conversation-loaded", false);
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic != "conversation-loaded" || aSubject != this.browser)
      return;

    // We want to avoid the convbrowser trying to scroll to the last
    // added message, as that causes the entire pref pane to jump up
    // (bug 1179943). Therefore, we override the method convbrowser
    // uses to determine if there are further messages pending to be
    // added. The +1 ensures no scroll occurs after we add the last
    // message here.
    this.browser._autoScrollEnabled = false;
    this.browser.getPendingMessagesCount =
      () => previewObserver.conv.messages.length + 1;

    // Display all queued messages. Use a timeout so that message text
    // modifiers can be added with observers for this notification.
    setTimeout(function() {
      for (let message of previewObserver.conv.messages)
        aSubject.appendMessage(message, false);
    }, 0);

    Services.obs.removeObserver(this, "conversation-loaded");
  }
};
