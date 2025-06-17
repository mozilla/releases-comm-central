/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Platform-independent code to count new and unread messages and pass the
 *  information to platform-specific notification modules.
 */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * Keeps track of the number of unread or new messages for display on the
 * taskbar/dock icon badge.
 *
 * @deprecated This code will be folded into MailNotificationManager eventually.
 *
 * @implements {nsIFolderListener}
 * @implements {nsIObserver}
 */
export const MailNotificationService = new (class {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver", "nsIFolderListener"]);

  #unreadCount = 0;
  #newCount = 0;
  #listeners = new Set();
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

  observe(subject, topic) {
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
    for (const candidateFolder of allFolders) {
      if (this.confirmShouldCount(candidateFolder)) {
        const count = candidateFolder.getNumUnread(false);
        this.#log.debug(`${candidateFolder.URI} has ${count} unread`);
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
   * @param {nsIMsgFolder} folder - The folder we're asking about.
   */
  confirmShouldCount(folder) {
    const shouldCount = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    shouldCount.data = true;

    // If it's not a mail folder we don't count it by default
    if (!(folder.flags & Ci.nsMsgFolderFlags.Mail)) {
      shouldCount.data = false;
    } else if (folder.server?.type == "rss") {
      // For whatever reason, RSS folders have the 'Mail' flag.
      shouldCount.data = false;
    } else if (
      folder.flags & Ci.nsMsgFolderFlags.SpecialUse &&
      !(folder.flags & Ci.nsMsgFolderFlags.Inbox)
    ) {
      // It's a special folder *other than the inbox*, don't count it by default.
      shouldCount.data = false;
    } else if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
      shouldCount.data = false;
    } else {
      // If we're only counting inboxes and it's not an inbox...
      const onlyCountInboxes = Services.prefs.getBoolPref(
        "mail.notification.count.inbox_only",
        true
      );
      if (onlyCountInboxes && !(folder.flags & Ci.nsMsgFolderFlags.Inbox)) {
        shouldCount.data = false;
      }
    }

    this.#log.debug(`${folder.URI}: shouldCount=${shouldCount.data}`);
    Services.obs.notifyObservers(
      shouldCount,
      "before-count-unread-for-folder",
      folder.URI
    );
    return shouldCount.data;
  }

  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
    try {
      if (property == "FolderSize") {
        return;
      }
      this.#log.trace(
        `Changed int ${property} of ${folder.URI}: ${oldValue} -> ${newValue}`
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

      for (const candidateFolder of allFolders) {
        if (this.confirmShouldCount(candidateFolder)) {
          const folderNew = candidateFolder.getNumNewMessages(false);
          this.#log.debug(`${candidateFolder.URI}: ${folderNew} new`);
          if (folderNew > 0) {
            newCount += folderNew;
          }
        }
      }
      if (newCount > 0) {
        this.#newCount += newCount;
        this.#log.debug(`${folder.URI}: new mail count ${this.#newCount}`);
        if (this.useNewCountInBadge) {
          this._notifyListeners(this.#newCount);
        }
      }
    } else if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail) {
      // Dodgy - when any folder tells us it has no mail, clear all unread mail
      this.#newCount = 0;
      this.#log.debug(`${folder.URI}: no new mail`);
      if (this.useNewCountInBadge) {
        this._notifyListeners(this.#newCount);
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
      this._notifyListeners(this.#newCount);
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
      this._notifyListeners(this.#unreadCount);
    }
  }

  onFolderAdded(parentFolder, child) {
    if (child.rootFolder == child) {
      this.#log.trace(`Added root folder ${child.URI}`);
    } else {
      this.#log.trace(`Added child folder ${child.URI} to ${parentFolder.URI}`);
    }
  }

  onMessageAdded(parentFolder, msg) {
    if (this.confirmShouldCount(msg.folder)) {
      this.#log.trace(`Added <${msg.messageId}> to ${msg.folder.URI}`);
    }
  }

  onFolderPropertyFlagChanged(msg, property, oldFlag, newFlag) {
    if (
      oldFlag & Ci.nsMsgMessageFlags.New &&
      !(newFlag & Ci.nsMsgMessageFlags.New)
    ) {
      this.#log.trace(`<${msg.messageId}> marked read in ${msg.folder.URI}`);
    } else if (newFlag & Ci.nsMsgMessageFlags.New) {
      this.#log.trace(`<${msg.messageId}> marked unread in ${msg.folder.URI}`);
    }
  }

  onFolderRemoved(parentFolder, child) {
    if (child.rootFolder == child) {
      this.#log.trace(`Removed root folder ${child.URI}`);
    } else {
      this.#log.trace(
        `Removed child folder ${child.URI} from ${parentFolder?.URI}`
      );
    }
  }

  onMessageRemoved(parentFolder, msg) {
    if (!msg.isRead) {
      this.#log.trace(
        `Removed unread <${msg.messageId}> from ${msg.folder.URI}`
      );
    }
  }

  get messageCount() {
    if (this.useNewCountInBadge) {
      return this.#newCount;
    }
    return this.#unreadCount;
  }

  /**
   * @typedef {object} NewMailListener
   * @property {Function} onCountChanged - Called when the number of
   *   interesting messages has changed. The number of messages is passed
   *   as an argument.
   */

  /**
   * Register a listener to receive callbacks when the count or list of
   * notification-worthy messages changes.
   *
   * @param {NewMailListener} listener
   */
  addListener(listener) {
    if (this.#listeners.has(listener)) {
      return;
    }

    // Ensure that first-time listeners get an accurate mail count.
    const count = this.useNewCountInBadge ? this.#newCount : this.#unreadCount;
    listener.onCountChanged(count);

    // If we get here, the listener wasn't already in the list
    this.#listeners.add(listener);
  }

  /**
   * Remove a listener from the service.
   *
   * @param {NewMailListener} listener - The listener to remove.
   */
  removeListener(listener) {
    this.#listeners.delete(listener);
  }

  /**
   * Get existing listeners.
   *
   * @returns {NewMailListener[]}
   */
  get listeners() {
    return Array.from(this.#listeners);
  }

  _notifyListeners(value) {
    for (const listener of this.listeners) {
      listener.onCountChanged(value);
    }
  }
})();
