/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Platform-independent code to count new and unread messages and pass the
 *  information to platform-specific notification modules.
 */

var EXPORTED_SYMBOLS = ["NewMailNotificationService"];

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * Constructor.
 * @implements {mozINewMailNotificationService}
 * @implements {nsIFolderListener}
 * @implements {nsIObserver}
 */
function NewMailNotificationService() {
  this._mUnreadCount = 0;
  this._mNewCount = 0;
  this._listeners = [];
  this.wrappedJSObject = this;

  this._log = console.createInstance({
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
  this._initUnreadCount();
}

NewMailNotificationService.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsIFolderListener",
    "mozINewMailNotificationService",
  ]),

  _mUnreadCount: 0,
  _mNewCount: 0,
  _listeners: null,
  _log: null,

  get countNew() {
    return Services.prefs.getBoolPref(
      "mail.biff.use_new_count_in_badge",
      false
    );
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "profile-before-change") {
      try {
        MailServices.mailSession.RemoveFolderListener(this);
        Services.obs.removeObserver(this, "profile-before-change");
      } catch (e) {
        this._log.error("unable to deregister listeners at shutdown: " + e);
      }
    }
  },

  _initUnreadCount() {
    let total = 0;
    for (let server of MailServices.accounts.allServers) {
      this._log.debug(
        "NMNS_initUnread: server " + server.prettyName + " type " + server.type
      );
      // Don't bother counting RSS or NNTP servers
      let type = server.type;
      if (type == "rss" || type == "nntp") {
        continue;
      }

      let rootFolder = server.rootFolder;
      if (rootFolder) {
        total += this._countUnread(rootFolder);
      }
    }
    this._mUnreadCount = total;
    if (!this.countNew) {
      this._log.info(
        "NMNS_initUnread notifying listeners: " +
          total +
          " total unread messages"
      );
      this._notifyListeners(
        Ci.mozINewMailNotificationService.count,
        "onCountChanged",
        total
      );
    }
  },

  // Count all the unread messages below the given folder
  _countUnread(folder) {
    this._log.debug(`_countUnread for ${folder.URI}`);
    let unreadCount = 0;

    let allFolders = [folder, ...folder.descendants];
    for (let folder of allFolders) {
      if (this.confirmShouldCount(folder)) {
        let count = folder.getNumUnread(false);
        this._log.debug(`${folder.URI} has ${count} unread`);
        if (count > 0) {
          unreadCount += count;
        }
      }
    }
    return unreadCount;
  },

  /**
   * Filter out special folders and then ask for observers to see if
   * we should monitor unread messages in this folder.
   * @param {nsIMsgFolder} aFolder - The folder we're asking about.
   */
  confirmShouldCount(aFolder) {
    let shouldCount = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
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
      try {
        // If we can't get this pref, just leave it as the default
        let onlyCountInboxes = Services.prefs.getBoolPref(
          "mail.notification.count.inbox_only"
        );
        if (onlyCountInboxes && !(aFolder.flags & Ci.nsMsgFolderFlags.Inbox)) {
          shouldCount.data = false;
        }
      } catch (error) {}
    }

    this._log.debug(`${aFolder.URI}: shouldCount=${shouldCount.data}`);
    Services.obs.notifyObservers(
      shouldCount,
      "before-count-unread-for-folder",
      aFolder.URI
    );
    return shouldCount.data;
  },

  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
    try {
      if (property == "FolderSize") {
        return;
      }
      this._log.trace(
        `Changed int ${property} of ${folder.folderURL}: ${oldValue} -> ${newValue}`
      );
      if (property == "BiffState") {
        this._biffStateChanged(folder, oldValue, newValue);
      } else if (property == "TotalUnreadMessages") {
        this._updateUnreadCount(folder, oldValue, newValue);
      } else if (property == "NewMailReceived") {
        this._newMailReceived(folder, oldValue, newValue);
      }
    } catch (error) {
      this._log.error("onFolderIntPropertyChanged: exception " + error);
    }
  },

  _biffStateChanged(folder, oldValue, newValue) {
    if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
      if (folder.server && !folder.server.performingBiff) {
        this._log.debug(
          `${folder.URI} notified, but server not performing biff`
        );
        return;
      }

      // Biff notifications come in for the top level of the server, we need to
      // look for the folder that actually contains the new mail.

      let allFolders = [folder, ...folder.descendants];

      this._log.debug(`${folder.URI} notified; will check subfolders`);
      let newCount = 0;

      for (let folder of allFolders) {
        if (this.confirmShouldCount(folder)) {
          let folderNew = folder.getNumNewMessages(false);
          this._log.debug(`${folder.URI}: ${folderNew} new`);
          if (folderNew > 0) {
            newCount += folderNew;
          }
        }
      }
      if (newCount > 0) {
        this._mNewCount += newCount;
        this._log.debug(`${folder.URI}: new mail count ${this._mNewCount}`);
        if (this.countNew) {
          this._notifyListeners(
            Ci.mozINewMailNotificationService.count,
            "onCountChanged",
            this._mNewCount
          );
        }
      }
    } else if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail) {
      // Dodgy - when any folder tells us it has no mail, clear all unread mail
      this._mNewCount = 0;
      this._log.debug(`${folder.URI}: no new mail`);
      if (this.countNew) {
        this._notifyListeners(
          Ci.mozINewMailNotificationService.count,
          "onCountChanged",
          this._mNewCount
        );
      }
    }
  },

  _newMailReceived(folder, oldValue, newValue) {
    if (!this.confirmShouldCount(folder)) {
      return;
    }

    if (!oldValue || oldValue < 0) {
      oldValue = 0;
    }
    this._mNewCount += newValue - oldValue;
    this._log.debug(`_newMailReceived ${folder.URI} - ${this._mNewCount} new`);
    if (this.countNew) {
      this._notifyListeners(
        Ci.mozINewMailNotificationService.count,
        "onCountChanged",
        this._mNewCount
      );
    }
  },

  _updateUnreadCount(folder, oldValue, newValue) {
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

    this._mUnreadCount += newValue - oldValue;
    if (!this.countNew) {
      this._notifyListeners(
        Ci.mozINewMailNotificationService.count,
        "onCountChanged",
        this._mUnreadCount
      );
    }
  },

  onFolderAdded(parentFolder, child) {
    if (child.rootFolder == child) {
      this._log.trace(`Added root folder ${child.folderURL}`);
    } else {
      this._log.trace(
        `Added child folder ${child.folderURL} to ${parentFolder.folderURL}`
      );
    }
  },

  onMessageAdded(parentFolder, msg) {
    if (this.confirmShouldCount(msg.folder)) {
      this._log.trace(`Added <${msg.messageId}> to ${msg.folder.folderURL}`);
    }
  },

  onFolderPropertyFlagChanged(msg, property, oldFlag, newFlag) {
    if (
      oldFlag & Ci.nsMsgMessageFlags.New &&
      !(newFlag & Ci.nsMsgMessageFlags.New)
    ) {
      this._log.trace(
        `<${msg.messageId}> marked read in ${msg.folder.folderURL}`
      );
    } else if (newFlag & Ci.nsMsgMessageFlags.New) {
      this._log.trace(
        `<${msg.messageId}> marked unread in ${msg.folder.folderURL}`
      );
    }
  },

  onFolderRemoved(parentFolder, child) {
    if (child.rootFolder == child) {
      this._log.trace(`Removed root folder ${child.folderURL}`);
    } else {
      this._log.trace(
        `Removed child folder ${child.folderURL} from ${parentFolder?.folderURL}`
      );
    }
  },

  onMessageRemoved(parentFolder, msg) {
    if (!msg.isRead) {
      this._log.trace(
        `Removed unread <${msg.messageId}> from ${msg.folder.folderURL}`
      );
    }
  },

  // Implement mozINewMailNotificationService

  get messageCount() {
    if (this.countNew) {
      return this._mNewCount;
    }
    return this._mUnreadCount;
  },

  addListener(aListener, flags) {
    for (let i = 0; i < this._listeners.length; i++) {
      let l = this._listeners[i];
      if (l.obj === aListener) {
        l.flags = flags;
        return;
      }
    }
    // If we get here, the listener wasn't already in the list
    this._listeners.push({ obj: aListener, flags });
  },

  removeListener(aListener) {
    for (let i = 0; i < this._listeners.length; i++) {
      let l = this._listeners[i];
      if (l.obj === aListener) {
        this._listeners.splice(i, 1);
        return;
      }
    }
  },

  _listenersForFlag(flag) {
    let list = [];
    for (let i = 0; i < this._listeners.length; i++) {
      let l = this._listeners[i];
      if (l.flags & flag) {
        list.push(l.obj);
      }
    }
    return list;
  },

  _notifyListeners(flag, func, value) {
    let list = this._listenersForFlag(flag);
    for (let i = 0; i < list.length; i++) {
      list[i][func](value);
    }
  },
};
