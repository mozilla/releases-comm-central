/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { PluralForm } from "resource:///modules/PluralForm.sys.mjs";

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { ChatIcons } from "resource:///modules/chatIcons.sys.mjs";

// Time in seconds: it is the minimum time of inactivity
// needed to show the bundled notification.
var kTimeToWaitForMoreMsgs = 3;

export var Notifications = {
  get ellipsis() {
    let ellipsis = "[\u2026]";

    try {
      ellipsis = Services.prefs.getComplexValue(
        "intl.ellipsis",
        Ci.nsIPrefLocalizedString
      ).data;
    } catch (e) {}
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

  _showMessageNotification(aMessage, aCounter = 0) {
    // We are about to show the notification, so let's play the notification sound.
    // We play the sound if the user is away from TB window or even away from chat tab.
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (
      !Services.focus.activeWindow ||
      win.document.getElementById("tabmail").currentTabInfo.mode.name != "chat"
    ) {
      Services.obs.notifyObservers(aMessage, "play-chat-notification-sound");
    }

    // If TB window has focus, there's no need to show the notification..
    if (win && win.document.hasFocus()) {
      this._heldMessage = null;
      this._msgCounter = 0;
      return;
    }

    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/chat.properties"
    );
    let messageText, icon, name;
    const notificationContent = Services.prefs.getIntPref(
      "mail.chat.notification_info"
    );
    // 0 - show all the info,
    // 1 - show only the sender not the message,
    // 2 - show no details about the message being notified.
    switch (notificationContent) {
      case 0: {
        const parser = new DOMParser();
        const doc = parser.parseFromString(
          aMessage.displayMessage,
          "text/html"
        );
        const body = doc.querySelector("body");
        const encoder = Cu.createDocumentEncoder("text/plain");
        encoder.init(doc, "text/plain", 0);
        encoder.setNode(body);
        messageText = encoder.encodeToString().replace(/\s+/g, " ");

        // Crop the end of the text if needed.
        if (messageText.length > 50) {
          messageText = messageText.substr(0, 50);
          if (aCounter == 0) {
            messageText = messageText + this.ellipsis;
          }
        }

        // If there are more messages being bundled, add the count string.
        // ellipsis is a part of bundledMessagePreview so we don't include it here.
        if (aCounter > 0) {
          const bundledMessage = bundle.formatStringFromName(
            "bundledMessagePreview",
            [messageText]
          );
          messageText = PluralForm.get(aCounter, bundledMessage).replace(
            "#1",
            aCounter
          );
        }
      }
      // Falls through
      case 1: {
        // Use the buddy icon if available for the icon of the notification.
        const conv = aMessage.conversation;
        icon = conv.convIconFilename;
        if (!icon && !conv.isChat) {
          icon = conv.buddy?.buddyIconFilename;
        }

        // Handle third person messages
        name = aMessage.alias || aMessage.who;
        if (messageText && aMessage.action) {
          messageText = name + " " + messageText;
        }
      }
      // Falls through
      case 2: {
        if (!icon) {
          icon = ChatIcons.fallbackUserIconURI;
        }

        if (!messageText) {
          const chatBundle = Services.strings.createBundle(
            "chrome://messenger/locale/chat.properties"
          );
          messageText = chatBundle.GetStringFromName("messagePreview");
        }
      }
    }

    const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
      Ci.nsIAlertNotification
    );
    alert.init(
      "", // name
      icon,
      name, // title
      messageText,
      true // clickable
    );
    // Show the notification!
    Cc["@mozilla.org/alerts-service;1"]
      .getService(Ci.nsIAlertsService)
      .showAlert(alert, (subject, topic) => {
        if (topic != "alertclickcallback") {
          return;
        }

        // If there is a timeout set, clear it.
        clearTimeout(this._timeoutId);
        this._heldMessage = null;
        this._msgCounter = 0;
        this._lastMessageTime = 0;
        this._lastMessageSender = null;
        // Focus the conversation if the notification is clicked.
        const uiConv = IMServices.conversations.getUIConversation(
          aMessage.conversation
        );
        const mainWindow = Services.wm.getMostRecentWindow("mail:3pane");
        if (mainWindow) {
          mainWindow.focus();
          mainWindow.showChatTab();
          mainWindow.chatHandler.focusConversation(uiConv);
        } else {
          const args = Cc["@mozilla.org/array;1"].createInstance(
            Ci.nsIMutableArray
          );
          args.appendElement(null);
          args.appendElement({
            tabType: "chat",
            tabParams: { convType: "focus", conv: uiConv },
          });
          Services.ww.openWindow(
            null,
            "chrome://messenger/content/messenger.xhtml",
            "_blank",
            "chrome,dialog=no,all",
            args
          );
        }
        if (AppConstants.platform == "macosx") {
          Cc["@mozilla.org/widget/macdocksupport;1"]
            .getService(Ci.nsIMacDockSupport)
            .activateApplication(true);
        }
      });

    this._heldMessage = null;
    this._msgCounter = 0;
  },

  init() {
    Services.obs.addObserver(Notifications, "new-otr-verification-request");
    Services.obs.addObserver(Notifications, "new-directed-incoming-message");
    Services.obs.addObserver(Notifications, "alertclickcallback");
  },

  _notificationPrefName: "mail.chat.show_desktop_notifications",
  observe(aSubject, aTopic) {
    if (!Services.prefs.getBoolPref(this._notificationPrefName)) {
      return;
    }

    switch (aTopic) {
      case "new-directed-incoming-message": {
        // If this is the first message, we show the notification and
        // store the sender's name.
        const sender = aSubject.who || aSubject.alias;
        if (this._lastMessageSender == null) {
          this._lastMessageSender = sender;
          this._lastMessageTime = aSubject.time;
          this._showMessageNotification(aSubject);
        } else if (
          this._lastMessageSender != sender ||
          aSubject.time > this._lastMessageTime + kTimeToWaitForMoreMsgs
        ) {
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
        } else if (
          this._lastMessageSender == sender &&
          this._lastMessageTime + kTimeToWaitForMoreMsgs >= aSubject.time
        ) {
          // If the sender is same as the previous sender and the time elapsed since the
          // last held message is less than kTimeToWaitForMoreMsgs, we increase the held messages
          // counter and update the last message's arrival time.
          this._lastMessageTime = aSubject.time;
          if (!this._heldMessage) {
            this._heldMessage = aSubject;
          } else {
            this._msgCounter++;
          }

          clearTimeout(this._timeoutId);
          this._timeoutId = setTimeout(() => {
            this._showMessageNotification(this._heldMessage, this._msgCounter);
          }, kTimeToWaitForMoreMsgs * 1000);
        }
        break;
      }
      case "new-otr-verification-request": {
        // If the Chat tab is not focused, play the sounds and update the icon
        // counter, and show the counter in the buddy richlistitem.
        const win = Services.wm.getMostRecentWindow("mail:3pane");
        if (
          !Services.focus.activeWindow ||
          win.document.getElementById("tabmail").currentTabInfo.mode.name !=
            "chat"
        ) {
          Services.obs.notifyObservers(
            aSubject,
            "play-chat-notification-sound"
          );
        }
        break;
      }
    }
  },
};
