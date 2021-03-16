/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MailNotificationManager"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  WinUnreadBadge: "resource:///modules/WinUnreadBadge.jsm",
});

XPCOMUtils.defineLazyGetter(
  this,
  "l10n",
  () => new Localization(["messenger/messenger.ftl"])
);

/**
 * A module that listens to folder change events, and show notifications for new
 * mails if necessary.
 */
class MailNotificationManager {
  QueryInterface = ChromeUtils.generateQI([
    "nsIObserver",
    "nsIFolderListener",
    "mozINewMailListener",
  ]);

  constructor() {
    this._unreadChatCount = 0;
    this._unreadMailCount = 0;

    this._logger = console.createInstance({
      prefix: "mail.notification",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mail.notification.loglevel",
    });
    this._bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    try {
      this._osIntegration = Cc[
        "@mozilla.org/messenger/osintegration;1"
      ].getService(Ci.nsIMessengerOSIntegration);
    } catch (e) {
      // We don't have OS integration on all platforms.
    }
    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.intPropertyChanged
    );

    if (["macosx", "win"].includes(AppConstants.platform)) {
      // We don't have indicator for unread count on Linux yet.
      Cc["@mozilla.org/newMailNotificationService;1"]
        .getService(Ci.mozINewMailNotificationService)
        .addListener(this, Ci.mozINewMailNotificationService.count);
      Services.obs.addObserver(this, "unread-im-count-changed");
    }

    if (AppConstants.platform == "macosx") {
      Services.obs.addObserver(this, "new-directed-incoming-message");
    }
    if (AppConstants.platform == "win") {
      Services.obs.addObserver(this, "window-restored-from-tray");
    }
  }

  observe(subject, topic, data) {
    if (topic == "alertclickcallback") {
      // Display the associated message when an alert is clicked.
      let msgHdr = Cc["@mozilla.org/messenger;1"]
        .getService(Ci.nsIMessenger)
        .msgHdrFromURI(data);
      MailUtils.displayMessageInFolderTab(msgHdr);
    } else if (topic == "unread-im-count-changed") {
      this._logger.log(`Unread chat count changed to ${this._unreadChatCount}`);
      this._unreadChatCount = parseInt(data, 10) || 0;
      this._updateUnreadCount();
    } else if (topic == "new-directed-incoming-messenger") {
      this._animateDockIcon();
    } else if (topic == "window-restored-from-tray") {
      this._updateUnreadCount();
    }
  }

  /**
   * Following are nsIFolderListener interfaces. Do nothing about them.
   */
  OnItemAdded() {}

  OnItemRemoved() {}

  OnItemPropertyChanged() {}

  OnItemBoolPropertyChanged() {}

  OnItemUnicharPropertyChanged() {}

  OnItemPropertyFlagChanged() {}

  OnItemEvent() {}

  /**
   * The only nsIFolderListener interface we care about.
   * @see nsIFolderListener
   */
  OnItemIntPropertyChanged(folder, property, oldValue, newValue) {
    if (!Services.prefs.getBoolPref("mail.biff.show_alert")) {
      return;
    }

    if (
      property == "BiffState" &&
      newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail
    ) {
      // The folder argument is a root folder.
      this._fillAlertInfo(folder);
    } else if (property == "NewMailReceived") {
      // The folder argument is a real folder.
      this._fillAlertInfo(folder);
    }
  }

  /**
   * @see mozINewMailNotificationService
   */
  onCountChanged(count) {
    this._logger.log(`Unread mail count changed to ${this._unreadMailCount}`);
    this._unreadMailCount = count;
    this._updateUnreadCount();
  }

  /**
   * Show an alert according the changed folder.
   * @param {nsIMsgFolder} changedFolder - The folder that emitted the change
   *   event, can be a root folder or a real folder.
   */
  async _fillAlertInfo(changedFolder) {
    let folder = this._getFirstRealFolderWithNewMail(changedFolder);
    if (!folder) {
      return;
    }

    let numNewMessages = folder.getNumNewMessages(false);
    let msgDb = folder.msgDatabase;
    let newMsgKeys = msgDb.getNewList().slice(-numNewMessages);
    if (newMsgKeys.length == 0) {
      return;
    }
    let firstNewMsgHdr = msgDb.GetMsgHdrForKey(newMsgKeys[0]);

    let title = this._getAlertTitle(folder, numNewMessages);
    let body;
    try {
      body = await this._getAlertBody(folder, firstNewMsgHdr);
    } catch (e) {
      this._logger.error(e);
    }
    if (!title || !body) {
      return;
    }
    this._showAlert(firstNewMsgHdr, title, body);
    this._animateDockIcon();
  }

  /**
   * Iterate the subfolders of changedFolder, return the first real folder with
   * new mail.
   * @param {nsIMsgFolder} changedFolder - The folder that emiited the change event.
   * @returns {nsIMsgFolder} The first real folder.
   */
  _getFirstRealFolderWithNewMail(changedFolder) {
    let folders = changedFolder.descendants;
    if (folders.length == 0) {
      folders = [changedFolder];
    }
    for (let folder of folders) {
      let flags = folder.flags;
      if (
        !(flags & Ci.nsMsgFolderFlags.Inbox) &&
        flags & (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual)
      ) {
        // Do not notify if the folder is not Inbox but one of
        // Drafts|Trash|SentMail|Templates|Junk|Archive|Queue or Virtual.
        continue;
      }

      if (folder.getNumNewMessages(false) > 0) {
        return folder;
      }
    }
    return null;
  }

  /**
   * Get the title for the alert.
   * @param {nsIMsgFolder} folder - The changed folder.
   * @param {number} numNewMessages - The count of new messages.
   * @returns {string} The alert title.
   */
  _getAlertTitle(folder, numNewMessages) {
    return this._bundle.formatStringFromName(
      numNewMessages == 1
        ? "newMailNotification_message"
        : "newMailNotification_messages",
      [folder.server.prettyName, numNewMessages.toString()]
    );
  }

  /**
   * Get the body for the alert.
   * @param {nsIMsgFolder} folder - The changed folder.
   * @param {nsIMsgHdr} msgHdr - The nsIMsgHdr of the first new messages.
   * @returns {string} The alert body.
   */
  async _getAlertBody(folder, msgHdr) {
    await new Promise((resolve, reject) => {
      let isAsync = folder.fetchMsgPreviewText([msgHdr.messageKey], false, {
        OnStartRunningUrl() {},
        // @see nsIUrlListener
        OnStopRunningUrl(url, exitCode) {
          Components.isSuccessCode(exitCode) ? resolve() : reject();
        },
      });
      if (!isAsync) {
        resolve();
      }
    });

    let alertBody = "";

    let subject = Services.prefs.getBoolPref("mail.biff.alert.show_subject")
      ? msgHdr.mime2DecodedSubject
      : "";
    let author = "";
    if (Services.prefs.getBoolPref("mail.biff.alert.show_sender")) {
      let addressObjects = MailServices.headerParser.makeFromDisplayAddress(
        msgHdr.mime2DecodedAuthor
      );
      let { name, email } = addressObjects[0] || {};
      author = name || email;
    }
    if (subject && author) {
      alertBody += this._bundle.formatStringFromName(
        "newMailNotification_messagetitle",
        [subject, author]
      );
    } else if (subject) {
      alertBody += subject;
    } else if (author) {
      alertBody += author;
    }
    let showPreview = Services.prefs.getBoolPref(
      "mail.biff.alert.show_preview"
    );
    if (showPreview) {
      let previewLength = Services.prefs.getIntPref(
        "mail.biff.alert.preview_length",
        40
      );
      let preview = msgHdr.getProperty("preview").slice(0, previewLength);
      if (preview) {
        alertBody += (alertBody ? "\n" : "") + preview;
      }
    }
    return alertBody;
  }

  /**
   * Show the alert.
   * @param {nsIMsgHdr} msgHdr - The nsIMsgHdr of the first new messages.
   * @param {string} title - The alert title.
   * @param {string} body - The alert body.
   */
  _showAlert(msgHdr, title, body) {
    let folder = msgHdr.folder;

    // Try to use system alert first.
    if (Services.prefs.getBoolPref("mail.biff.use_system_alert", true)) {
      let alertsService = Cc["@mozilla.org/system-alerts-service;1"].getService(
        Ci.nsIAlertsService
      );
      let cookie = folder.generateMessageURI(msgHdr.messageKey);
      try {
        alertsService.showAlertNotification(
          "chrome://messenger/skin/icons/new-mail-alert.png",
          title,
          body,
          true,
          cookie,
          this
        );
        return;
      } catch (e) {}
    }

    // The use_system_alert pref is false or showAlertNotification somehow
    // failed, use the customized alert window.
    Services.ww.openWindow(
      null,
      "chrome://messenger/content/newmailalert.xhtml",
      "_blank",
      "chrome,dialog=yes,titlebar=no,popup=yes",
      folder.server.rootFolder
    );
  }

  async _updateUnreadCount() {
    this._logger.debug(
      `Update unreadMailCount=${this._unreadMailCount}, unreadChatCount=${this._unreadChatCount}`
    );
    let count = this._unreadMailCount + this._unreadChatCount;
    let tooltip = "";
    if (AppConstants.platform == "win") {
      if (count > 0) {
        tooltip = await l10n.formatValue("unread-messages-os-tooltip", {
          count,
        });
      }
      WinUnreadBadge.updateUnreadCount(count, tooltip);
    }
    this._osIntegration?.updateUnreadCount(count, tooltip);
  }

  _animateDockIcon() {
    if (Services.prefs.getBoolPref("mail.biff.animate_dock_icon", false)) {
      Services.wm.getMostRecentWindow("mail:3pane")?.getAttention();
    }
  }
}
