/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Platform-independent code to count new and unread messages and pass the
 *  information to platform-specific notification modules.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * NewMailNotificationService.
 *
 * @implements {mozINewMailNotificationService}
 * @implements {nsIFolderListener}
 * @implements {nsIObserver}
 */
export class NewMailNotificationService {
  QueryInterface = ChromeUtils.generateQI([
    "nsIObserver",
    "nsIFolderListener",
    "mozINewMailNotificationService",
  ]);

  #unreadCount = 0;
  #newCount = 0;
  #listeners = [];
  #log = null;

  constructor() {
    this.#log = console.createInstance({
      prefix: "mail.notification",
      maxLogLevel: "Warn",
      maxLogLevelPref: "mail.notification.loglevel",
    });

    Services.obs.addObserver(this, "profile-before-change");
    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.intPropertyChanged |
        Ci.nsIFolderListener.added |
        Ci.nsIFolderListener.removed |
        Ci.nsIFolderListener.propertyFlagChanged
    );
    if (!this.useNewCountInBadge) {
      let total = 0;
      for (const server of MailServices.accounts.allServers) {
        // Don't bother counting RSS or NNTP servers
        const type = server.type;
        if (type == "rss" || type == "nntp") {
          continue;
        }

        const rootFolder = server.rootFolder;
        if (rootFolder) {
          total += this.countUnread(rootFolder);
        }
      }
      this.#unreadCount = total;
    }
  }

  get useNewCountInBadge() {
    return Services.prefs.getBoolPref(
      "mail.biff.use_new_count_in_badge",
      false
    );
  }

  /** Setter. Used for unit tests. */
  set unreadCount(count) {
    this.#unreadCount = count;
  }

  observe(subject, topic, data) {
    if (topic == "profile-before-change") {
      try {
        MailServices.mailSession.RemoveFolderListener(this);
        Services.obs.removeObserver(this, "profile-before-change");
      } catch (e) {
        this.#log.error("Unable to deregister listeners at shutdown: " + e);
      }
    }
  }

  // Count all the unread messages below the given folder
  countUnread(folder) {
    this.#log.debug(`countUnread for ${folder.URI}`);
    let unreadCount = 0;

    const allFolders = [folder, ...folder.descendants];
    for (const folder of allFolders) {
      if (this.confirmShouldCount(folder)) {
        const count = folder.getNumUnread(false);
        this.#log.debug(`${folder.URI} has ${count} unread`);
        if (count > 0) {
          unreadCount += count;
        }
      }
    }
    return unreadCount;
  }

  /**
   * Filter out special folders and then ask for observers to see if
   * we should monitor unread messages in this folder.
   *
   * @param {nsIMsgFolder} aFolder - The folder we're asking about.
   */
  confirmShouldCount(aFolder) {
    const shouldCount = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    shouldCount.data = true;

    // If it's not a mail folder we don't count it by default
    if (!(aFolder.flags & Ci.nsMsgFolderFlags.Mail)) {
      shouldCount.data = false;
    } else if (aFolder.server?.type == "rss") {
      // For whatever reason, RSS folders have the 'Mail' flag.
      shouldCount.data = false;
    } else if (
      aFolder.flags & Ci.nsMsgFolderFlags.SpecialUse &&
      !(aFolder.flags & Ci.nsMsgFolderFlags.Inbox)
    ) {
      // It's a special folder *other than the inbox*, don't count it by default.
      shouldCount.data = false;
    } else if (aFolder.flags & Ci.nsMsgFolderFlags.Virtual) {
      shouldCount.data = false;
    } else {
      // If we're only counting inboxes and it's not an inbox...
      const onlyCountInboxes = Services.prefs.getBoolPref(
        "mail.notification.count.inbox_only",
        true
      );
      if (onlyCountInboxes && !(aFolder.flags & Ci.nsMsgFolderFlags.Inbox)) {
        shouldCount.data = false;
      }
    }

    this.#log.debug(`${aFolder.URI}: shouldCount=${shouldCount.data}`);
    Services.obs.notifyObservers(
      shouldCount,
      "before-count-unread-for-folder",
      aFolder.URI
    );
    return shouldCount.data;
  }

  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
    try {
      if (property == "FolderSize") {
        return;
      }
      this.#log.trace(
        `Changed int ${property} of ${folder.folderURL}: ${oldValue} -> ${newValue}`
      );
      if (property == "BiffState") {
        this.#biffStateChanged(folder, oldValue, newValue);
      } else if (property == "TotalUnreadMessages") {
        this.#totalUnreadMessagesChanged(folder, oldValue, newValue);
      } else if (property == "NewMailReceived") {
        this.#newMailReceived(folder, oldValue, newValue);
      }
    } catch (error) {
      this.#log.error("onFolderIntPropertyChanged: " + error);
    }
  }

  #biffStateChanged(folder, oldValue, newValue) {
    if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
      if (folder.server && !folder.server.performingBiff) {
        this.#log.debug(
          `${folder.URI} notified, but server not performing biff`
        );
        return;
      }

      // Biff notifications come in for the top level of the server, we need to
      // look for the folder that actually contains the new mail.

      const allFolders = [folder, ...folder.descendants];

      this.#log.debug(`${folder.URI} notified; will check subfolders`);
      let newCount = 0;

      for (const folder of allFolders) {
        if (this.confirmShouldCount(folder)) {
          const folderNew = folder.getNumNewMessages(false);
          this.#log.debug(`${folder.URI}: ${folderNew} new`);
          if (folderNew > 0) {
            newCount += folderNew;
          }
        }
      }
      if (newCount > 0) {
        this.#newCount += newCount;
        this.#log.debug(`${folder.URI}: new mail count ${this.#newCount}`);
        if (this.useNewCountInBadge) {
          this._notifyListeners(
            Ci.mozINewMailNotificationService.count,
            "onCountChanged",
            this.#newCount
          );
        }
      }
    } else if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail) {
      // Dodgy - when any folder tells us it has no mail, clear all unread mail
      this.#newCount = 0;
      this.#log.debug(`${folder.URI}: no new mail`);
      if (this.useNewCountInBadge) {
        this._notifyListeners(
          Ci.mozINewMailNotificationService.count,
          "onCountChanged",
          this.#newCount
        );
      }
    }
  }

  #newMailReceived(folder, oldValue, newValue) {
    if (!this.confirmShouldCount(folder)) {
      return;
    }

    if (!oldValue || oldValue < 0) {
      oldValue = 0;
    }
    this.#newCount += newValue - oldValue;
    this.#log.debug(`#newMailReceived ${folder.URI} - ${this.#newCount} new`);
    if (this.useNewCountInBadge) {
      this._notifyListeners(
        Ci.mozINewMailNotificationService.count,
        "onCountChanged",
        this.#newCount
      );
    }
  }

  #totalUnreadMessagesChanged(folder, oldValue, newValue) {
    if (!this.confirmShouldCount(folder)) {
      return;
    }

    // treat "count unknown" as zero
    if (oldValue < 0) {
      oldValue = 0;
    }
    if (newValue < 0) {
      newValue = 0;
    }

    this.#unreadCount += newValue - oldValue;
    if (!this.useNewCountInBadge) {
      this._notifyListeners(
        Ci.mozINewMailNotificationService.count,
        "onCountChanged",
        this.#unreadCount
      );
    }
  }

  onFolderAdded(parentFolder, child) {
    if (child.rootFolder == child) {
      this.#log.trace(`Added root folder ${child.folderURL}`);
    } else {
      this.#log.trace(
        `Added child folder ${child.folderURL} to ${parentFolder.folderURL}`
      );
    }
  }

  onMessageAdded(parentFolder, msg) {
    if (this.confirmShouldCount(msg.folder)) {
      this.#log.trace(`Added <${msg.messageId}> to ${msg.folder.folderURL}`);
    }
  }

  onFolderPropertyFlagChanged(msg, property, oldFlag, newFlag) {
    if (
      oldFlag & Ci.nsMsgMessageFlags.New &&
      !(newFlag & Ci.nsMsgMessageFlags.New)
    ) {
      this.#log.trace(
        `<${msg.messageId}> marked read in ${msg.folder.folderURL}`
      );
    } else if (newFlag & Ci.nsMsgMessageFlags.New) {
      this.#log.trace(
        `<${msg.messageId}> marked unread in ${msg.folder.folderURL}`
      );
    }
  }

  onFolderRemoved(parentFolder, child) {
    if (child.rootFolder == child) {
      this.#log.trace(`Removed root folder ${child.folderURL}`);
    } else {
      this.#log.trace(
        `Removed child folder ${child.folderURL} from ${parentFolder?.folderURL}`
      );
    }
  }

  onMessageRemoved(parentFolder, msg) {
    if (!msg.isRead) {
      this.#log.trace(
        `Removed unread <${msg.messageId}> from ${msg.folder.folderURL}`
      );
    }
  }

  // Implement mozINewMailNotificationService

  get messageCount() {
    if (this.useNewCountInBadge) {
      return this.#newCount;
    }
    return this.#unreadCount;
  }

  addListener(aListener, flags) {
    for (let i = 0; i < this.#listeners.length; i++) {
      const l = this.#listeners[i];
      if (l.obj === aListener) {
        l.flags = flags;
        return;
      }
    }

    // Ensure that first-time listeners get an accurate mail count.
    if (flags & Ci.mozINewMailNotificationService.count) {
      const count = this.useNewCountInBadge
        ? this.#newCount
        : this.#unreadCount;
      aListener.onCountChanged(count);
    }

    // If we get here, the listener wasn't already in the list
    this.#listeners.push({ obj: aListener, flags });
  }

  removeListener(aListener) {
    for (let i = 0; i < this.#listeners.length; i++) {
      const l = this.#listeners[i];
      if (l.obj === aListener) {
        this.#listeners.splice(i, 1);
        return;
      }
    }
  }

  listenersForFlag(flag) {
    const list = [];
    for (let i = 0; i < this.#listeners.length; i++) {
      const l = this.#listeners[i];
      if (l.flags & flag) {
        list.push(l.obj);
      }
    }
    return list;
  }

  _notifyListeners(flag, func, value) {
    const list = this.listenersForFlag(flag);
    for (let i = 0; i < list.length; i++) {
      list[i][func](value);
    }
  }
}
