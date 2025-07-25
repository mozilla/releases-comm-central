/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { XPCOMUtils } from "resource:///modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  LanguageDetector:
    "resource://gre/modules/translations/LanguageDetector.sys.mjs",
  MailNotificationService:
    "resource:///modules/MailNotificationService.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  MessageArchiver: "resource:///modules/MessageArchiver.sys.mjs",
  WinUnreadBadge: "resource:///modules/WinUnreadBadge.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/messenger.ftl"], true)
);

let audioElementWeak;

const availableActions = [
  {
    action: "mark-as-read",
    l10nId: "mark-as-read-action",
    isValidFor(_message) {
      return true;
    },
    runAction(message) {
      message.folder.markMessagesRead([message], true);
    },
  },
  {
    action: "delete",
    l10nId: "delete-action",
    isValidFor(message) {
      return message.folder.canDeleteMessages;
    },
    runAction(message) {
      message.folder.markMessagesRead([message], true);
      message.folder.deleteMessages([message], null, false, false, null, true);
    },
  },
  {
    action: "mark-as-starred",
    l10nId: "mark-as-starred-action",
    isValidFor(_message) {
      return true;
    },
    runAction(message) {
      message.folder.markMessagesFlagged([message], true);
    },
  },
  {
    action: "mark-as-spam",
    l10nId: "mark-as-spam-action",
    isValidFor(message) {
      return !["nntp", "rss"].includes(message.folder.server.type);
    },
    runAction(message) {
      message.folder.setJunkScoreForMessages(
        [message],
        Ci.nsIJunkMailPlugin.IS_SPAM_SCORE,
        "user",
        -1
      );
      message.folder.performActionsOnJunkMsgs([message], true);
    },
  },
  {
    action: "archive",
    l10nId: "archive-action",
    isValidFor(message) {
      return lazy.MessageArchiver.canArchive([message], true);
    },
    runAction(message) {
      new lazy.MessageArchiver().archiveMessages([message]);
    },
  },
];

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabledActions",
  "mail.biff.alert.enabled_actions",
  "",
  null,
  val => {
    const actions = [];
    for (const name of val.split(",")) {
      const action = availableActions.find(a => a.action == name);
      if (action) {
        if (!action.title) {
          action.title = lazy.l10n.formatValueSync(action.l10nId);
        }
        actions.push(action);
      }
    }
    return actions;
  }
);

/**
 * A module that listens to folder change events, and shows a notification
 * and/or plays a sound if necessary.
 */
export const MailNotificationManager = new (class {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver", "nsIFolderListener"]);

  get availableActions() {
    for (const action of availableActions) {
      if (!action.title) {
        action.title = lazy.l10n.formatValueSync(action.l10nId);
      }
    }
    return availableActions;
  }
  get enabledActions() {
    return lazy.enabledActions;
  }

  init() {
    this._unreadChatCount = 0;
    this._unreadMailCount = 0;
    // @type {Map<string, number>} - A map of folder URIs and the date of the
    //   newest message a notification has been shown for.
    this._folderNewestNotifiedTime = new Map();
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
    this._osIntegration;

    if (["macosx", "win"].includes(AppConstants.platform)) {
      // We don't have indicator for unread count on Linux yet.
      lazy.MailNotificationService.addListener(this);

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
        audioElementWeak?.deref()?.pause();
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
    this._logger.debug(
      `onFolderIntPropertyChanged; property=${property}: ${oldValue} => ${newValue}, folder.URI=${folder.URI}`
    );

    switch (property) {
      case "BiffState":
        if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
          // The folder argument is a root folder.
          this._notifyNewMail(folder);
        }
        break;
      case "NewMailReceived":
        // The folder argument is a real folder.
        this._notifyNewMail(folder);
        break;
    }
  }
  onFolderBoolPropertyChanged() {}
  onFolderPropertyFlagChanged() {}
  onFolderEvent() {}

  /**
   * @see MailNotificationService
   */
  onCountChanged(count) {
    this._logger.log(`Unread mail count changed to ${count}`);
    this._unreadMailCount = count;
    this._updateUnreadCount();
  }

  get _osIntegration() {
    try {
      return Cc["@mozilla.org/messenger/osintegration;1"].getService(
        Ci.nsIMessengerOSIntegration
      );
    } catch (e) {
      // We don't have OS integration on all platforms, i.e. 32-bit Linux.
      return null;
    }
  }

  /**
   * Show an alert according to the changed folder and/or play a sound.
   *
   * @param {nsIMsgFolder} changedFolder - The folder that emitted the change
   *   event, can be a root folder or a real folder.
   */
  async _notifyNewMail(changedFolder) {
    const folder = this._getFirstRealFolderWithNewMail(changedFolder);
    if (!folder) {
      return;
    }

    const newMsgKeys = this._getNewMsgKeysNotNotified(folder);
    const numNewMessages = newMsgKeys.length;
    if (!numNewMessages) {
      return;
    }

    if (Services.prefs.getBoolPref("mail.biff.show_alert")) {
      this._fillAlertInfo(folder, newMsgKeys, numNewMessages);
    }

    // If the OS is in Do Not Disturb mode, don't play a sound.
    if (this._osIntegration?.isInDoNotDisturbMode) {
      this._logger.debug("The operating system is in do-not-disturb mode");
      return;
    }

    const prefBranch = Services.prefs.getBranch(
      folder.server.type == "rss"
        ? "mail.feed.play_sound"
        : "mail.biff.play_sound"
    );
    if (prefBranch.getBoolPref("")) {
      MailNotificationManager.playSound(prefBranch);
    }
  }

  /**
   * Play the user's notification sound. If a sound is already playing, it
   * will be stopped.
   *
   * @param {nsIPrefBranch} prefBranch - The relevant preferences for the
   *   sound to be played (i.e. `mail.*.play_sound`).
   */
  playSound(prefBranch) {
    // Play the system sound.
    if (prefBranch.getIntPref(".type") == 0) {
      Cc["@mozilla.org/sound;1"]
        .createInstance(Ci.nsISound)
        .playEventSound(Ci.nsISound.EVENT_NEW_MAIL_RECEIVED);
      return;
    }

    // Play a custom sound.
    const url = prefBranch.getStringPref(".url");
    if (!url.startsWith("file://")) {
      return;
    }

    let audioElement = audioElementWeak?.deref();
    if (audioElement && audioElement.src != url) {
      // A sound, that isn't the one we want, is already playing. Stop it.
      audioElement.pause();
      audioElement = null;
    }
    if (!audioElement) {
      // Create a new audio element for playing the sound.
      const win = Services.wm.getMostRecentWindow("mail:3pane");
      if (!win) {
        return;
      }
      audioElement = new win.Audio();
      if (Cu.isInAutomation) {
        audioElement.onended = function () {
          Services.obs.notifyObservers(
            audioElement,
            "notification-audio-ended"
          );
        };
      }
      audioElement.src = url;
      audioElementWeak = new WeakRef(audioElement);
    }

    // Go to the start and play the sound.
    audioElement.currentTime = 0;
    audioElement.play();
  }

  async _fillAlertInfo(folder, newMsgKeys, numNewMessages) {
    this._logger.debug(
      `Filling alert info; folder.URI=${folder.URI}, numNewMessages=${numNewMessages}`
    );
    if (Services.prefs.getBoolPref("mail.biff.use_system_alert", true)) {
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

      this._showAlert(firstNewMsgHdr, title, body, numNewMessages);
      this._saveNotificationTime(folder, newMsgKeys);
    } else {
      this._showCustomizedAlert(folder);
    }

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

      if (this._getNewMsgKeysNotNotified(folder).length > 0) {
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
   * @param {nsIMsgDBHdr} msgHdr - The nsIMsgHdr of the first new messages.
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
      let preview = msgHdr.getStringProperty("preview");
      if (preview) {
        // Try to detect the language of the preview, but only use it if the
        // detector is confident of the result. Otherwise use the app language.
        let { language, confident } =
          await lazy.LanguageDetector.detectLanguage(preview);
        if (!confident) {
          language = undefined;
        }

        // Break the preview into words and keep all words that start before
        // the desired length is reached.
        const segmenter = new Intl.Segmenter(language, { granularity: "word" });
        for (const segment of segmenter.segment(preview)) {
          if (segment.index > previewLength && segment.isWordLike) {
            preview = preview.substring(0, segment.index).trimEnd() + "…";
            break;
          }
        }
        alertBody += (alertBody ? "\n\n" : "") + preview;
      }
    }
    return alertBody;
  }

  /**
   * Show the alert.
   *
   * @param {nsIMsgDBHdr} msgHdr - The nsIMsgHdr of the first new messages.
   * @param {string} title - The alert title.
   * @param {string} body - The alert body.
   * @param {number} numNewMessages - The count of new messages.
   */
  _showAlert(msgHdr, title, body, numNewMessages) {
    const folder = msgHdr.folder;

    const alertsService = Cc["@mozilla.org/system-alerts-service;1"].getService(
      Ci.nsIAlertsService
    );
    const cookie = folder.generateMessageURI(msgHdr.messageKey);

    const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
      Ci.nsIAlertNotification
    );
    alert.init(
      cookie,
      // Don't add an icon on macOS, the app icon is already shown.
      AppConstants.platform == "macosx"
        ? ""
        : "chrome://branding/content/icon48.png",
      title,
      body,
      true /* text clickable */,
      cookie
    );
    if (numNewMessages == 1) {
      alert.actions = lazy.enabledActions.filter(action =>
        action.isValidFor(msgHdr)
      );
    }
    alertsService.showAlert(alert, (subject, topic) => {
      if (topic != "alertclickcallback") {
        return;
      }
      if (subject?.QueryInterface(Ci.nsIAlertAction)) {
        Glean.mail.notificationUsedActions[subject.action].add(1);
        availableActions
          .find(a => a.action == subject.action)
          .runAction(msgHdr);
        return;
      }
      // Display the associated message when an alert is clicked.
      lazy.MailUtils.displayMessageInFolderTab(msgHdr, true);
    });
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
    this._saveNotificationTime(folder, newMsgKeys);
  }

  /**
   * Get all NEW messages from a folder that are newer than the newest message
   * in the folder we had a notification about.
   *
   * @param {nsIMsgFolder} folder - The message folder to check.
   * @returns {nsMsgKey[]} An array of message keys.
   */
  _getNewMsgKeysNotNotified(folder) {
    if (folder.getNumNewMessages(false) == 0) {
      return [];
    }

    const msgDb = folder.msgDatabase;
    const newestNotifiedTime =
      this._folderNewestNotifiedTime.get(folder.URI) || 0;
    return msgDb
      .getNewList()
      .slice(-folder.getNumNewMessages(false))
      .filter(key => {
        const msgHdr = msgDb.getMsgHdrForKey(key);
        return msgHdr.dateInSeconds > newestNotifiedTime;
      });
  }

  /**
   * Record the time of the newest new message in the folder, so that we never
   * notify about it again.
   *
   * @param {nsIMsgFolder} folder
   * @param {nsMsgKey[]} newMsgKeys - As returned by _getNewMsgKeysNotNotified.
   */
  _saveNotificationTime(folder, newMsgKeys) {
    let newestNotifiedTime = 0;
    for (const msgKey of newMsgKeys) {
      const msgHdr = folder.msgDatabase.getMsgHdrForKey(msgKey);
      newestNotifiedTime = Math.max(newestNotifiedTime, msgHdr.dateInSeconds);
    }
    this._folderNewestNotifiedTime.set(folder.URI, newestNotifiedTime);
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
})();
