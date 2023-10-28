/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals msgWindow */ // From mailWindow.js

var MailOfflineMgr = {
  offlineManager: null,
  offlineBundle: null,

  init() {
    Services.obs.addObserver(this, "network:offline-status-changed");

    this.offlineManager = Cc[
      "@mozilla.org/messenger/offline-manager;1"
    ].getService(Ci.nsIMsgOfflineManager);
    this.offlineBundle = Services.strings.createBundle(
      "chrome://messenger/locale/offline.properties"
    );

    // initialize our offline state UI
    this.updateOfflineUI(!this.isOnline());
  },

  uninit() {
    Services.obs.removeObserver(this, "network:offline-status-changed");
  },

  /**
   * @returns true if we are online
   */
  isOnline() {
    return !Services.io.offline;
  },

  /**
   * Toggles the online / offline state, initiated by the user. Depending on user settings
   * we may prompt the user to send unsent messages when going online or to download messages for
   * offline use when going offline.
   */
  toggleOfflineStatus() {
    // the offline manager(goOnline and synchronizeForOffline) actually does the dirty work of
    // changing the offline state with the networking service.
    if (!this.isOnline()) {
      // We do the go online stuff in our listener for the online state change.
      Services.io.offline = false;
      // resume managing offline status now that we are going back online.
      Services.io.manageOfflineStatus =
        Services.prefs.getBoolPref("offline.autoDetect");
    } else {
      // going offline
      // Stop automatic management of the offline status since the user has
      // decided to go offline.
      Services.io.manageOfflineStatus = false;
      var prefDownloadMessages = Services.prefs.getIntPref(
        "offline.download.download_messages"
      );
      // 0 == Ask, 1 == Always Download, 2 == Never Download
      var downloadForOfflineUse =
        (prefDownloadMessages == 0 &&
          this.confirmDownloadMessagesForOfflineUse()) ||
        prefDownloadMessages == 1;
      this.offlineManager.synchronizeForOffline(
        downloadForOfflineUse,
        downloadForOfflineUse,
        false,
        true,
        msgWindow
      );
    }
  },

  observe(aSubject, aTopic, aState) {
    if (aTopic == "network:offline-status-changed") {
      this.mailOfflineStateChanged(aState == "offline");
    }
  },

  /**
   * @returns true if there are unsent messages
   */
  haveUnsentMessages() {
    return Cc["@mozilla.org/messengercompose/sendlater;1"]
      .getService(Ci.nsIMsgSendLater)
      .hasUnsentMessages();
  },

  /**
   * open the offline panel in the account manager for the currently loaded
   * account.
   */
  openOfflineAccountSettings() {
    window.parent.MsgAccountManager("am-offline.xhtml");
  },

  /**
   * Prompt the user about going online to send unsent messages, and then send them
   * if appropriate. Puts the app back into online mode.
   *
   * @param aMsgWindow the msg window to be used when going online
   */
  goOnlineToSendMessages(aMsgWindow) {
    const goOnlineToSendMsgs = Services.prompt.confirm(
      window,
      this.offlineBundle.GetStringFromName("sendMessagesOfflineWindowTitle1"),
      this.offlineBundle.GetStringFromName("sendMessagesOfflineLabel1")
    );

    if (goOnlineToSendMsgs) {
      this.offlineManager.goOnline(
        true /* send unsent messages*/,
        false,
        aMsgWindow
      );
    }
  },

  /**
   * Prompts the user to confirm sending of unsent messages. This is different from
   * goOnlineToSendMessages which involves going online to send unsent messages.
   *
   * @returns true if the user wants to send unsent messages
   */
  confirmSendUnsentMessages() {
    const alwaysAsk = { value: true };
    const sendUnsentMessages =
      Services.prompt.confirmEx(
        window,
        this.offlineBundle.GetStringFromName("sendMessagesWindowTitle1"),
        this.offlineBundle.GetStringFromName("sendMessagesLabel2"),
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
          Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
        this.offlineBundle.GetStringFromName("sendMessagesNow2"),
        this.offlineBundle.GetStringFromName("processMessagesLater2"),
        null,
        this.offlineBundle.GetStringFromName("sendMessagesCheckboxLabel1"),
        alwaysAsk
      ) == 0;

    // if the user changed the ask me setting then update the global pref based on their yes / no answer
    if (!alwaysAsk.value) {
      Services.prefs.setIntPref(
        "offline.send.unsent_messages",
        sendUnsentMessages ? 1 : 2
      );
    }

    return sendUnsentMessages;
  },

  /**
   * Should we send unsent messages? Based on the value of
   * offline.send.unsent_messages, this method may prompt the user.
   *
   * @returns true if we should send unsent messages
   */
  shouldSendUnsentMessages() {
    var sendUnsentWhenGoingOnlinePref = Services.prefs.getIntPref(
      "offline.send.unsent_messages"
    );
    if (sendUnsentWhenGoingOnlinePref == 2) {
      // never send
      return false;
    } else if (this.haveUnsentMessages()) {
      // if we we have unsent messages, then honor the offline.send.unsent_messages pref.
      if (
        (sendUnsentWhenGoingOnlinePref == 0 &&
          this.confirmSendUnsentMessages()) ||
        sendUnsentWhenGoingOnlinePref == 1
      ) {
        return true;
      }
    }
    return false;
  },

  /**
   * Prompts the user to download messages for offline use before going offline.
   * May update the value of offline.download.download_messages
   *
   * @returns true if the user wants to download messages for offline use.
   */
  confirmDownloadMessagesForOfflineUse() {
    const alwaysAsk = { value: true };
    const downloadMessages =
      Services.prompt.confirmEx(
        window,
        this.offlineBundle.GetStringFromName("downloadMessagesWindowTitle1"),
        this.offlineBundle.GetStringFromName("downloadMessagesLabel1"),
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
          Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
        this.offlineBundle.GetStringFromName("downloadMessagesNow2"),
        this.offlineBundle.GetStringFromName("processMessagesLater2"),
        null,
        this.offlineBundle.GetStringFromName("downloadMessagesCheckboxLabel1"),
        alwaysAsk
      ) == 0;

    // if the user changed the ask me setting then update the global pref based on their yes / no answer
    if (!alwaysAsk.value) {
      Services.prefs.setIntPref(
        "offline.download.download_messages",
        downloadMessages ? 1 : 2
      );
    }
    return downloadMessages;
  },

  /**
   *  Get New Mail When Offline
   *  Prompts the user about going online in order to download new messages.
   *  Based on the response, will move us back to online mode.
   *
   * @returns true if the user confirms going online.
   */
  getNewMail() {
    const goOnline = Services.prompt.confirm(
      window,
      this.offlineBundle.GetStringFromName("getMessagesOfflineWindowTitle1"),
      this.offlineBundle.GetStringFromName("getMessagesOfflineLabel1")
    );

    if (goOnline) {
      this.offlineManager.goOnline(
        this.shouldSendUnsentMessages(),
        false /* playbackOfflineImapOperations */,
        msgWindow
      );
    }
    return goOnline;
  },

  /**
   * Private helper method to update the state of the Offline menu item
   * and the offline status bar indicator
   */
  updateOfflineUI(aIsOffline) {
    document
      .getElementById("goOfflineMenuItem")
      .setAttribute("checked", aIsOffline);
    var statusBarPanel = document.getElementById("offline-status");
    if (aIsOffline) {
      statusBarPanel.setAttribute("offline", "true");
      statusBarPanel.setAttribute(
        "tooltiptext",
        this.offlineBundle.GetStringFromName("offlineTooltip")
      );
    } else {
      statusBarPanel.removeAttribute("offline");
      statusBarPanel.setAttribute(
        "tooltiptext",
        this.offlineBundle.GetStringFromName("onlineTooltip")
      );
    }
  },

  /**
   * private helper method called whenever we detect a change to the offline state
   */
  mailOfflineStateChanged(aGoingOffline) {
    this.updateOfflineUI(aGoingOffline);
    if (!aGoingOffline) {
      const prefSendUnsentMessages = Services.prefs.getIntPref(
        "offline.send.unsent_messages"
      );
      // 0 == Ask, 1 == Always Send, 2 == Never Send
      const sendUnsentMessages =
        (prefSendUnsentMessages == 0 &&
          this.haveUnsentMessages() &&
          this.confirmSendUnsentMessages()) ||
        prefSendUnsentMessages == 1;
      this.offlineManager.goOnline(sendUnsentMessages, true, msgWindow);
    }
  },
};
