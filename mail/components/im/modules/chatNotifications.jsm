/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Notifications"];
var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/hiddenWindow.jsm");
Cu.import("resource:///modules/StringBundle.js");
Cu.import("resource://gre/modules/PluralForm.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

// Time in seconds: it is the minimum time of inactivity
// needed to show the bundled notification.
var kTimeToWaitForMoreMsgs = 3;

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

  // Holds the first direct message of a bundle while we wait for further
  // messages from the same sender to arrive.
  _heldMessage: null,
  // Number of messages to be bundled in the notification (excluding
  // _heldMessage).
  _msgCounter: 0,
  // Time the last message was received.
  _lastMessageTime: 0,
  // Sender of the last message.
  _lastMessageSender: null,
  // timeout Id for the set timeout for showing notification.
  _timeoutId: null,

  _showMessageNotification: function(aMessage, aCounter = 0) {
    // We are about to show the notification, so let's play the notification sound.
    // We play the sound if the user is away from TB window or even away from chat tab.
    if (!Services.focus.activeWindow ||
        Services.wm.getMostRecentWindow("mail:3pane").document
                .getElementById("tabmail").currentTabInfo.mode.name != "chat")
      Services.obs.notifyObservers(aMessage, "play-chat-notification-sound", false);

    // If TB window has focus, there's no need to show the notification..
    if (Services.wm.getMostRecentWindow("mail:3pane").document.hasFocus()) {
      this._heldMessage = null;
      this._msgCounter = 0;
      return;
    }

    let bundle = new StringBundle("chrome://messenger/locale/chat.properties");
    let messageText, icon, name;
    let notificationContent = Services.prefs.getIntPref("mail.chat.notification_info");
    // 0 - show all the info,
    // 1 - show only the sender not the message,
    // 2 - show no details about the message being notified.
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
        if (messageText.length > 50) {
          messageText = messageText.substr(0, 50);
          if (aCounter == 0)
            messageText = messageText + this.ellipsis;
        }

        // If there are more messages being bundled, add the count string.
        // ellipsis is a part of bundledMessagePreview so we don't include it here.
        if (aCounter > 0) {
          let bundledMessage = bundle.getFormattedString("bundledMessagePreview", [messageText], 1);
          messageText = PluralForm.get(aCounter, bundledMessage).replace("#1", aCounter);
        }
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

    // Show the notification!
    Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService)
      .showAlertNotification(icon, name, messageText, true, "", this);

    this._heldMessage = null;
    this._msgCounter = 0;
  },

  init: function() {
    Services.obs.addObserver(Notifications, "new-directed-incoming-message", false);
    Services.obs.addObserver(Notifications, "alertclickcallback", false);
  },

  _notificationPrefName: "mail.chat.show_desktop_notifications",
  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "new-directed-incoming-message" &&
        Services.prefs.getBoolPref(this._notificationPrefName)) {
      // If this is the first message, we show the notification and
      // store the sender's name.
      let sender = aSubject.who || aSubject.alias;
      if (this._lastMessageSender == null) {
        this._lastMessageSender = sender;
        this._lastMessageTime = aSubject.time;
        this._showMessageNotification(aSubject);
      } else if ((this._lastMessageSender != sender) ||
                 (aSubject.time > this._lastMessageTime + kTimeToWaitForMoreMsgs)) {
        // If the sender is not the same as the previous sender or the
        // time elapsed since the last message is greater than kTimeToWaitForMoreMsgs,
        // we show the held notification and set timeout for the message just arrived.
        if (this._heldMessage) {
          // if the time for the current message is greater than _lastMessageTime by
          // more than kTimeToWaitForMoreMsgs, this will not happen since the notification will
          // have already been dispatched.
          clearTimeout(this._timeoutId);
          this._showMessageNotification(this._heldMessage, this._msgCounter);
        }
        this._lastMessageSender = sender;
        this._lastMessageTime = aSubject.time;
        this._showMessageNotification(aSubject);
      } else if (this._lastMessageSender == sender &&
                 this._lastMessageTime + kTimeToWaitForMoreMsgs >= aSubject.time) {
        // If the sender is same as the previous sender and the time elapsed since the
        // last held message is less than kTimeToWaitForMoreMsgs, we increase the held messages
        // counter and update the last message's arrival time.
        this._lastMessageTime = aSubject.time;
        if (!this._heldMessage)
          this._heldMessage = aSubject;
        else
          this._msgCounter++;

        clearTimeout(this._timeoutId);
        this._timeoutId = setTimeout(function() {
            Notifications._showMessageNotification(Notifications._heldMessage,
                                                   Notifications._msgCounter)
          }, kTimeToWaitForMoreMsgs * 1000);
      }
    } else if (aTopic == "alertclickcallback") {
      // If there is a timeout set, clear it.
      clearTimeout(this._timeoutId);
      this._heldMessage = null;
      this._msgCounter = 0;
      this._lastMessageTime = 0;
      this._lastMessageSender = null;
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
