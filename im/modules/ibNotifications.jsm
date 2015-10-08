/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Notifications"];

Components.utils.import("resource:///modules/imServices.jsm");
Components.utils.import("resource:///modules/imWindows.jsm");
Components.utils.import("resource:///modules/hiddenWindow.jsm");
Components.utils.import("resource:///modules/ibInterruptions.jsm");

var Notifications = {
  get ellipsis () {
    let ellipsis = "[\u2026]";

    try {
      ellipsis =
        Services.prefs.getComplexValue("intl.ellipsis",
                                       Components.interfaces.nsIPrefLocalizedString).data;
    } catch (e) { }
    return ellipsis;
  },

  _showMessageNotification: function (aMessage) {
    // Put the message content into a div node of the hidden HTML window.
    let doc = getHiddenHTMLWindow().document;
    let xhtmlElement = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    xhtmlElement.innerHTML = aMessage.message.replace(/<br>/gi, "<br/>");

    // Convert the div node content to plain text.
    let encoder =
      Components.classes["@mozilla.org/layout/documentEncoder;1?type=text/plain"]
                .createInstance(Components.interfaces.nsIDocumentEncoder);
    encoder.init(doc, "text/plain", 0);
    encoder.setNode(xhtmlElement);
    let messageText = encoder.encodeToString().replace(/\s+/g, " ");

    // Crop the end of the text if needed.
    if (messageText.length > 50)
      messageText = messageText.substr(0, 50) + this.ellipsis;

    // Use the buddy icon if available for the icon of the notification.
    let icon;
    let conv = aMessage.conversation;
    if (!conv.isChat) {
      let buddy = conv.buddy;
      if (buddy)
        icon = buddy.buddyIconFilename;
    }
    if (!icon)
      icon = "chrome://instantbird/skin/newMessage.png";

    // Prepare an observer to focus the conversation if the
    // notification is clicked.
    let observer = {
      observe: function(aSubject, aTopic, aData) {
        if (aTopic == "alertclickcallback")
          Conversations.focusConversation(aMessage.conversation);
      }
    };

    // Handle third person messages
    let name = aMessage.alias || aMessage.who;
    if (messageText.startsWith("/me "))
      messageText = messageText.replace(/^\/me/, name);

    // Finally show the notification!
    Components.classes["@mozilla.org/alerts-service;1"]
              .getService(Components.interfaces.nsIAlertsService)
              .showAlertNotification(icon, name, messageText, true, "", observer);
  },

  init: function() {
    Services.obs.addObserver(Notifications, "new-text", false);
  },

  _notificationPrefName: "messenger.options.notifyOfNewMessages",
  observe: function(aSubject, aTopic, aData) {
    if (aTopic != "new-text")
      return;

    if (!aSubject.incoming || aSubject.system ||
        (aSubject.conversation.isChat && !aSubject.containsNick))
      return;

    if (!Conversations.isConversationWindowFocused() &&
        Services.prefs.getBoolPref(this._notificationPrefName) &&
        Interruptions.requestInterrupt(aTopic, aSubject, "notification"))
      this._showMessageNotification(aSubject);
  }
};
