/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Notifications"];
const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/hiddenWindow.jsm");
Cu.import("resource:///modules/StringBundle.js");

var Notifications = {
  get ellipsis () {
    let ellipsis = "[\u2026]";

    try {
      ellipsis =
        Services.prefs.getComplexValue("intl.ellipsis",
                                       Ci.nsIPrefLocalizedString).data;
    } catch (e) { }
    return ellipsis;
  },

  _showMessageNotification: function (aMessage) {
    let messageText, icon, name;
    let notificationContent = Services.prefs.getIntPref("mail.chat.notification_info");
    switch (notificationContent) {
      case 0:
        let parser = Cc["@mozilla.org/xmlextras/domparser;1"].createInstance(Ci.nsIDOMParser);
        let doc = parser.parseFromString(aMessage.message, "text/html");
        let body = doc.querySelector("body");
        let encoder =
          Cc["@mozilla.org/layout/documentEncoder;1?type=text/plain"]
           .createInstance(Ci.nsIDocumentEncoder);
        encoder.init(doc, "text/plain", 0);
        encoder.setNode(body);
        messageText = encoder.encodeToString().replace(/\s+/g, " ");

        // Crop the end of the text if needed.
        if (messageText.length > 50)
          messageText = messageText.substr(0, 50) + this.ellipsis;
      case 1:
        // Use the buddy icon if available for the icon of the notification.
        let conv = aMessage.conversation;
        if (!conv.isChat) {
          let buddy = conv.buddy;
          if (buddy)
            icon = buddy.buddyIconFilename;
        }

        // Handle third person messages
        name = aMessage.alias || aMessage.who;
        if (messageText && messageText.startsWith("/me "))
          messageText = messageText.replace(/^\/me/, name);
      case 2:
        if (!icon)
          icon = "chrome://messenger/skin/userIcon.png";

        if (!messageText) {
          let bundle = new StringBundle("chrome://messenger/locale/chat.properties");
          messageText = bundle.get("messagePreview");
        }
    }

    // If the TB window doesn't have the focus, show the notification!
    if (!Services.wm.getMostRecentWindow("mail:3pane").document.hasFocus()) {
      Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService)
        .showAlertNotification(icon, name, messageText, true, "", this);
    }
  },

  init: function() {
    Services.obs.addObserver(Notifications, "new-directed-incoming-message", false);
    Services.obs.addObserver(Notifications, "alertclickcallback", false);
  },

  _notificationPrefName: "mail.chat.show_desktop_notifications",
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "new-directed-incoming-message") {
      if (Services.prefs.getBoolPref(this._notificationPrefName))
        this._showMessageNotification(aSubject);
    } else if (aTopic == "alertclickcallback") {
      // Focus the conversation if the notification is clicked.
      let mainWindow = Services.wm.getMostRecentWindow("mail:3pane");
      if (mainWindow) {
        mainWindow.focus();
        mainWindow.showChatTab();
      } else {
        window.openDialog("chrome://messenger/content/", "_blank",
                          "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
                          null, {tabType: "chat", tabParams: {}});
      }
    }
  }
};
