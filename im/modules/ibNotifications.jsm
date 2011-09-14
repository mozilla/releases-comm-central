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

const EXPORTED_SYMBOLS = ["Notifications"];

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

    // Finally show the notification!
    Components.classes["@mozilla.org/alerts-service;1"]
              .getService(Components.interfaces.nsIAlertsService)
              .showAlertNotification(icon, aMessage.alias || aMessage.who,
                                     messageText, true, "", observer);
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
