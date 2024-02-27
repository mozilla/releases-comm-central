/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  MailUtils: "resource:///modules/MailUtils.jsm",
  WinUnreadBadge: "resource:///modules/WinUnreadBadge.jsm",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/messenger.ftl"])
);

/**
 * A module that listens to folder change events, and show notifications for new
 * mails if necessary.
 */
export class MailNotificationManager {
  QueryInterface = ChromeUtils.generateQI([
    "nsIObserver",
    "nsIFolderListener",
    "mozINewMailListener",
  ]);

  constructor() {
    this._systemAlertAvailable = true;
    this._unreadChatCount = 0;
    this._unreadMailCount = 0;
    // @type {Map<nsIMsgFolder, number>} - A map of folder and its last biff time.
    this._folderBiffTime = new Map();
    // @type {Set<nsIMsgFolder>} - A set of folders to show alert for.
    this._pendingFolders = new Set();

    this._logger = console.createInstance({
      prefix: "mail.notification",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mail.notification.loglevel",
    });
    this._bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.intPropertyChanged
    );

    // Ensure that OS integration is defined before we attempt to initialize the
    // system tray icon.
    ChromeUtils.defineLazyGetter(this, "_osIntegration", () => {
      try {
        return Cc["@mozilla.org/messenger/osintegration;1"].getService(
          Ci.nsIMessengerOSIntegration
        );
      } catch (e) {
        // We don't have OS integration on all platforms.
        return null;
      }
    });

    if (["macosx", "win"].includes(AppConstants.platform)) {
      // We don't have indicator for unread count on Linux yet.
      Cc["@mozilla.org/newMailNotificationService;1"]
        .getService(Ci.mozINewMailNotificationService)
        .addListener(this, Ci.mozINewMailNotificationService.count);

      Services.obs.addObserver(this, "unread-im-count-changed");
      Services.obs.addObserver(this, "profile-before-change");
    }

    if (AppConstants.platform == "macosx") {
      Services.obs.addObserver(this, "new-directed-incoming-message");
    }

    if (AppConstants.platform == "win") {
      Services.obs.addObserver(this, "windows-refresh-badge-tray");
      Services.prefs.addObserver("mail.biff.show_badge", this);
      Services.prefs.addObserver("mail.biff.show_tray_icon_always", this);
    }
  }

  observe(subject, topic, data) {
    switch (topic) {
      case "alertclickcallback": {
        // Display the associated message when an alert is clicked.
        const msgHdr = Cc["@mozilla.org/messenger;1"]
          .getService(Ci.nsIMessenger)
          .msgHdrFromURI(data);
        lazy.MailUtils.displayMessageInFolderTab(msgHdr, true);
        return;
      }
      case "unread-im-count-changed":
        this._logger.log(
          `Unread chat count changed to ${this._unreadChatCount}`
        );
        this._unreadChatCount = parseInt(data, 10) || 0;
        this._updateUnreadCount();
        return;
      case "new-directed-incoming-messenger":
        this._animateDockIcon();
        return;
      case "windows-refresh-badge-tray":
        this._updateUnreadCount();
        return;
      case "profile-before-change":
        this._osIntegration?.onExit();
        return;
      case "newmailalert-closed":
        // newmailalert.xhtml is closed, try to show the next queued folder.
        this._customizedAlertShown = false;
        this._showCustomizedAlert();
        return;
      case "nsPref:changed":
        if (
          data == "mail.biff.show_badge" ||
          data == "mail.biff.show_tray_icon_always"
        ) {
          this._updateUnreadCount();
        }
    }
  }

  /**
   * Following are nsIFolderListener interfaces. Do nothing about them.
   */
  onFolderAdded() {}
  onMessageAdded() {}
  onFolderRemoved() {}
  onMessageRemoved() {}
  onFolderPropertyChanged() {}
  /**
   * The only nsIFolderListener interface we care about.
   *
   * @see nsIFolderListener
   */
  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
    if (!Services.prefs.getBoolPref("mail.biff.show_alert")) {
      return;
    }

    this._logger.debug(
      `onFolderIntPropertyChanged; property=${property}: ${oldValue} => ${newValue}, folder.URI=${folder.URI}`
    );

    switch (property) {
      case "BiffState":
        if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
          // The folder argument is a root folder.
          this._fillAlertInfo(folder);
        }
        break;
      case "NewMailReceived":
        // The folder argument is a real folder.
        this._fillAlertInfo(folder);
        break;
    }
  }
  onFolderBoolPropertyChanged() {}
  onFolderUnicharPropertyChanged() {}
  onFolderPropertyFlagChanged() {}
  onFolderEvent() {}

  /**
   * @see mozINewMailNotificationService
   */
  onCountChanged(count) {
    this._logger.log(`Unread mail count changed to ${count}`);
    this._unreadMailCount = count;
    this._updateUnreadCount();
  }

  /**
   * Show an alert according to the changed folder.
   *
   * @param {nsIMsgFolder} changedFolder - The folder that emitted the change
   *   event, can be a root folder or a real folder.
   */
  async _fillAlertInfo(changedFolder) {
    const folder = this._getFirstRealFolderWithNewMail(changedFolder);
    if (!folder) {
      return;
    }

    const newMsgKeys = this._getNewMsgKeysNotNotified(folder);
    const numNewMessages = newMsgKeys.length;
    if (!numNewMessages) {
      return;
    }

    this._logger.debug(
      `Filling alert info; folder.URI=${folder.URI}, numNewMessages=${numNewMessages}`
    );
    const firstNewMsgHdr = folder.msgDatabase.getMsgHdrForKey(newMsgKeys[0]);

    const title = this._getAlertTitle(folder, numNewMessages);
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
   *
   * @param {nsIMsgFolder} changedFolder - The folder that emitted the change event.
   * @returns {nsIMsgFolder} The first real folder.
   */
  _getFirstRealFolderWithNewMail(changedFolder) {
    const folders = changedFolder.descendants;
    folders.unshift(changedFolder);

    for (const folder of folders) {
      const flags = folder.flags;
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
   *
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
   *
   * @param {nsIMsgFolder} folder - The changed folder.
   * @param {nsIMsgHdr} msgHdr - The nsIMsgHdr of the first new messages.
   * @returns {string} The alert body.
   */
  async _getAlertBody(folder, msgHdr) {
    await new Promise((resolve, reject) => {
      const isAsync = folder.fetchMsgPreviewText([msgHdr.messageKey], {
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

    const subject = Services.prefs.getBoolPref("mail.biff.alert.show_subject")
      ? msgHdr.mime2DecodedSubject
      : "";
    let author = "";
    if (Services.prefs.getBoolPref("mail.biff.alert.show_sender")) {
      const addressObjects = MailServices.headerParser.makeFromDisplayAddress(
        msgHdr.mime2DecodedAuthor
      );
      const { name, email } = addressObjects[0] || {};
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
    const showPreview = Services.prefs.getBoolPref(
      "mail.biff.alert.show_preview"
    );
    if (showPreview) {
      const previewLength = Services.prefs.getIntPref(
        "mail.biff.alert.preview_length",
        40
      );
      const preview = msgHdr
        .getStringProperty("preview")
        .slice(0, previewLength);
      if (preview) {
        alertBody += (alertBody ? "\n" : "") + preview;
      }
    }
    return alertBody;
  }

  /**
   * Show the alert.
   *
   * @param {nsIMsgHdr} msgHdr - The nsIMsgHdr of the first new messages.
   * @param {string} title - The alert title.
   * @param {string} body - The alert body.
   */
  _showAlert(msgHdr, title, body) {
    const folder = msgHdr.folder;

    // Try to use system alert first.
    if (
      Services.prefs.getBoolPref("mail.biff.use_system_alert", true) &&
      this._systemAlertAvailable
    ) {
      const alertsService = Cc[
        "@mozilla.org/system-alerts-service;1"
      ].getService(Ci.nsIAlertsService);
      const cookie = folder.generateMessageURI(msgHdr.messageKey);
      try {
        const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
          Ci.nsIAlertNotification
        );
        alert.init(
          cookie, // name
          "chrome://messenger/skin/icons/new-mail-alert.png",
          title,
          body,
          true, // clickable
          cookie
        );
        alertsService.showAlert(alert, this);
        return;
      } catch (e) {
        this._logger.error(e);
        this._systemAlertAvailable = false;
      }
    }

    // The use_system_alert pref is false or showAlert somehow failed, use the
    // customized alert window.
    this._showCustomizedAlert(folder);
  }

  /**
   * Show a customized alert window (newmailalert.xhtml), if there is already
   * one showing, do not show another one, because the newer one will block the
   * older one. Instead, save the folder and newMsgKeys to this._pendingFolders.
   *
   * @param {nsIMsgFolder} [folder] - The folder containing new messages.
   */
  _showCustomizedAlert(folder) {
    if (this._customizedAlertShown) {
      // Queue the folder.
      this._pendingFolders.add(folder);
      return;
    }
    if (!folder) {
      // Get the next folder from the queue.
      folder = this._pendingFolders.keys().next().value;
      if (!folder) {
        return;
      }
      this._pendingFolders.delete(folder);
    }

    const newMsgKeys = this._getNewMsgKeysNotNotified(folder);
    if (!newMsgKeys.length) {
      // No NEW message in the current folder, try the next queued folder.
      this._showCustomizedAlert();
      return;
    }

    const args = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    args.appendElement(folder);
    args.appendElement({
      wrappedJSObject: newMsgKeys,
    });
    args.appendElement(this);
    Services.ww.openWindow(
      null,
      "chrome://messenger/content/newmailalert.xhtml",
      "_blank",
      "chrome,dialog,titlebar=no,alert=yes",
      args
    );
    this._customizedAlertShown = true;
    this._folderBiffTime.set(folder, Date.now());
  }

  /**
   * Get all NEW messages from a folder that we received after last biff time.
   *
   * @param {nsIMsgFolder} folder - The message folder to check.
   * @returns {number[]} An array of message keys.
   */
  _getNewMsgKeysNotNotified(folder) {
    const msgDb = folder.msgDatabase;
    const lastBiffTime = this._folderBiffTime.get(folder) || 0;
    return msgDb
      .getNewList()
      .slice(-folder.getNumNewMessages(false))
      .filter(key => {
        const msgHdr = msgDb.getMsgHdrForKey(key);
        return msgHdr.dateInSeconds * 1000 > lastBiffTime;
      });
  }

  async _updateUnreadCount() {
    if (this._updatingUnreadCount) {
      // _updateUnreadCount can be triggered faster than we finish rendering the
      // badge. When that happens, set a flag and return.
      this._pendingUpdate = true;
      return;
    }
    this._updatingUnreadCount = true;

    this._logger.debug(
      `Update unreadMailCount=${this._unreadMailCount}, unreadChatCount=${this._unreadChatCount}`
    );
    let count = this._unreadMailCount + this._unreadChatCount;
    let tooltip = "";
    if (AppConstants.platform == "win") {
      if (!Services.prefs.getBoolPref("mail.biff.show_badge", true)) {
        count = 0;
      }
      if (count > 0) {
        tooltip = await lazy.l10n.formatValue("unread-messages-os-tooltip", {
          count,
        });
      }
      await lazy.WinUnreadBadge.updateUnreadCount(count, tooltip);
    }
    this._osIntegration?.updateUnreadCount(count, tooltip);

    this._updatingUnreadCount = false;
    if (this._pendingUpdate) {
      // There was at least one _updateUnreadCount call while we were rendering
      // the badge. Render one more time will ensure the badge reflects the
      // current state.
      this._pendingUpdate = false;
      this._updateUnreadCount();
    }
  }

  _animateDockIcon() {
    if (Services.prefs.getBoolPref("mail.biff.animate_dock_icon", false)) {
      Services.wm.getMostRecentWindow("mail:3pane")?.getAttention();
    }
  }
}
