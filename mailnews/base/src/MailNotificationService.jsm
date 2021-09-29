/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* platform-independent code to count new and unread messages and pass the information to
 * platform-specific notification modules
 *
 * Default logging is at the Warn level. Other possibly interesting messages are
 * at Error, Info and Debug. To configure, set the preferences
 * "mail.notification.loglevel" to the string indicating the level you want.
 */

var EXPORTED_SYMBOLS = ["NewMailNotificationService"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var NMNS = Ci.mozINewMailNotificationService;

var countInboxesPref = "mail.notification.count.inbox_only";
var countNewMessagesPref = "mail.biff.use_new_count_in_badge";

// constructor
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

  // Listen for mail-startup-done to do the rest of our setup after folders are initialized
  Services.obs.addObserver(this, "mail-startup-done");
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
    return Services.prefs.getBoolPref(countNewMessagesPref, false);
  },

  observe(aSubject, aTopic, aData) {
    // Set up to catch updates to unread count
    this._log.info("NMNS_Observe: " + aTopic);

    try {
      if (aTopic == "mail-startup-done") {
        try {
          Services.obs.removeObserver(this, "mail-startup-done");
        } catch (e) {
          this._log.error(
            "NMNS_Observe: unable to deregister mail-startup-done listener: " +
              e
          );
        }
        Services.obs.addObserver(this, "profile-before-change");
        MailServices.mailSession.AddFolderListener(
          this,
          Ci.nsIFolderListener.intPropertyChanged |
            Ci.nsIFolderListener.added |
            Ci.nsIFolderListener.removed |
            Ci.nsIFolderListener.propertyFlagChanged
        );
        this._initUnreadCount();
      } else if (aTopic == "profile-before-change") {
        try {
          MailServices.mailSession.RemoveFolderListener(this);
          Services.obs.removeObserver(this, "profile-before-change");
        } catch (e) {
          this._log.error(
            "NMNS_Observe: unable to deregister listeners at shutdown: " + e
          );
        }
      }
    } catch (error) {
      this._log.error("NMNS_Observe failed: " + error);
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
      this._notifyListeners(NMNS.count, "onCountChanged", total);
    }
  },

  // Count all the unread messages below the given folder
  _countUnread(folder) {
    this._log.trace("NMNS_countUnread: parent folder " + folder.URI);
    let unreadCount = 0;

    let allFolders = [folder, ...folder.descendants];
    for (let folder of allFolders) {
      if (this.confirmShouldCount(folder)) {
        let count = folder.getNumUnread(false);
        this._log.debug(
          "NMNS_countUnread: folder " + folder.URI + ", " + count + " unread"
        );
        if (count > 0) {
          unreadCount += count;
        }
      }
    }
    return unreadCount;
  },

  // Filter out special folders and then ask for observers to see if
  // we should monitor unread messages in this folder
  confirmShouldCount(aFolder) {
    let shouldCount = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    shouldCount.data = true;
    this._log.trace(
      "NMNS_confirmShouldCount: folder " +
        aFolder.URI +
        " flags " +
        aFolder.flags
    );
    let srv = null;

    // If it's not a mail folder we don't count it by default
    if (!(aFolder.flags & Ci.nsMsgFolderFlags.Mail)) {
      shouldCount.data = false;
    } else if ((srv = aFolder.server) && srv.type == "rss") {
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
        let onlyCountInboxes = Services.prefs.getBoolPref(countInboxesPref);
        if (onlyCountInboxes && !(aFolder.flags & Ci.nsMsgFolderFlags.Inbox)) {
          shouldCount.data = false;
        }
      } catch (error) {}
    }

    this._log.trace(
      "NMNS_confirmShouldCount: before observers " + shouldCount.data
    );
    Services.obs.notifyObservers(
      shouldCount,
      "before-count-unread-for-folder",
      aFolder.URI
    );
    this._log.trace(
      "NMNS_confirmShouldCount: after observers " + shouldCount.data
    );

    return shouldCount.data;
  },

  OnItemIntPropertyChanged(folder, property, oldValue, newValue) {
    try {
      if (property == "FolderSize") {
        return;
      }
      this._log.trace(
        "NMNS_OnItemIntPropertyChanged: folder " +
          folder.URI +
          " " +
          property +
          " " +
          oldValue +
          " " +
          newValue
      );
      if (property == "BiffState") {
        this._biffStateChanged(folder, oldValue, newValue);
      } else if (property == "TotalUnreadMessages") {
        this._updateUnreadCount(folder, oldValue, newValue);
      } else if (property == "NewMailReceived") {
        this._newMailReceived(folder, oldValue, newValue);
      }
    } catch (error) {
      this._log.error("NMNS_OnItemIntPropertyChanged: exception " + error);
    }
  },

  _biffStateChanged(folder, oldValue, newValue) {
    if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
      if (folder.server && !folder.server.performingBiff) {
        this._log.debug(
          "NMNS_biffStateChanged: folder " +
            folder.URI +
            " notified, but server not performing biff"
        );
        return;
      }

      // Biff notifications come in for the top level of the server, we need to look for
      // the folder that actually contains the new mail

      let allFolders = [folder, ...folder.descendants];

      this._log.trace(
        "NMNS_biffStateChanged: folder " +
          folder.URI +
          " New mail, " +
          (allFolders.length - 1) +
          " subfolders"
      );
      let newCount = 0;

      for (let folder of allFolders) {
        if (this.confirmShouldCount(folder)) {
          let folderNew = folder.getNumNewMessages(false);
          this._log.debug(
            "NMNS_biffStateChanged: folder " +
              folder.URI +
              " new messages: " +
              folderNew
          );
          if (folderNew > 0) {
            newCount += folderNew;
          }
        }
      }
      if (newCount > 0) {
        this._mNewCount += newCount;
        this._log.debug(
          "NMNS_biffStateChanged: " +
            folder.URI +
            " New mail count " +
            this._mNewCount
        );
        if (this.countNew) {
          this._notifyListeners(NMNS.count, "onCountChanged", this._mNewCount);
        }
      }
    } else if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail) {
      // Dodgy - when any folder tells us it has no mail, clear all unread mail
      this._mNewCount = 0;
      this._log.debug(
        "NMNS_biffStateChanged: " + folder.URI + " New mail count 0"
      );
      if (this.countNew) {
        this._notifyListeners(NMNS.count, "onCountChanged", this._mNewCount);
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
    let oldTotal = this._mNewCount;
    this._mNewCount += newValue - oldValue;
    this._log.debug(
      "NMNS_newMailReceived: " +
        folder.URI +
        " Old folder " +
        oldValue +
        " New folder " +
        newValue +
        " Old total " +
        oldTotal +
        " New total " +
        this._mNewCount
    );
    if (this.countNew) {
      this._notifyListeners(NMNS.count, "onCountChanged", this._mNewCount);
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
      this._log.info(
        "NMNS_updateUnreadCount notifying listeners: unread count " +
          this._mUnreadCount
      );
      this._notifyListeners(NMNS.count, "onCountChanged", this._mUnreadCount);
    }
  },

  OnItemAdded(parentItem, item) {
    if (item instanceof Ci.nsIMsgDBHdr) {
      if (this.confirmShouldCount(item.folder)) {
        this._log.trace(
          "NMNS_OnItemAdded: item " +
            item.folder.getUriForMsg(item) +
            " added to " +
            item.folder.folderURL
        );
      }
    }
  },

  OnItemPropertyFlagChanged(item, property, oldFlag, newFlag) {
    if (item instanceof Ci.nsIMsgDBHdr) {
      if (
        oldFlag & Ci.nsMsgMessageFlags.New &&
        !(newFlag & Ci.nsMsgMessageFlags.New)
      ) {
        this._log.trace(
          "NMNS_OnItemPropertyFlagChanged: item " +
            item.folder.getUriForMsg(item) +
            " marked read"
        );
      } else if (newFlag & Ci.nsMsgMessageFlags.New) {
        this._log.trace(
          "NMNS_OnItemPropertyFlagChanged: item " +
            item.folder.getUriForMsg(item) +
            " marked unread"
        );
      }
    }
  },

  OnItemRemoved(parentItem, item) {
    if (item instanceof Ci.nsIMsgDBHdr && !item.isRead) {
      this._log.trace(
        "NMNS_OnItemRemoved: unread item " +
          item.folder.getUriForMsg(item) +
          " removed from " +
          item.folder.folderURL
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
    this._log.trace(
      "NMNS_addListener: listener " + aListener.toSource + " flags " + flags
    );
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
    this._log.trace("NMNS_removeListener: listener " + aListener.toSource);
    for (let i = 0; i < this._listeners.length; i++) {
      let l = this._listeners[i];
      if (l.obj === aListener) {
        this._listeners.splice(i, 1);
        return;
      }
    }
  },

  _listenersForFlag(flag) {
    this._log.trace(
      "NMNS_listenersForFlag " +
        flag +
        " length " +
        this._listeners.length +
        " " +
        this._listeners.toSource()
    );
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
      this._log.debug(
        "NMNS_notifyListeners " + flag + " " + func + " " + value
      );
      list[i][func](value);
    }
  },
};
