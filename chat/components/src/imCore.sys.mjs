/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import {
  ClassInfo,
  initLogModule,
} from "resource:///modules/imXPCOMUtils.sys.mjs";

var kQuitApplicationGranted = "quit-application-granted";

var kPrefReportIdle = "messenger.status.reportIdle";
var kPrefUserIconFilename = "messenger.status.userIconFileName";
var kPrefUserDisplayname = "messenger.status.userDisplayName";
var kPrefTimeBeforeIdle = "messenger.status.timeBeforeIdle";
var kPrefAwayWhenIdle = "messenger.status.awayWhenIdle";
var kPrefDefaultMessage = "messenger.status.defaultIdleAwayMessage";

var NS_IOSERVICE_GOING_OFFLINE_TOPIC = "network:offline-about-to-go-offline";
var NS_IOSERVICE_OFFLINE_STATUS_TOPIC = "network:offline-status-changed";

const protocols = {
  "prpl-facebook": "@mozilla.org/chat/facebook;1",
  "prpl-gtalk": "@mozilla.org/chat/gtalk;1",
  "prpl-irc": "@mozilla.org/chat/irc;1",
  "prpl-jabber": "@mozilla.org/chat/xmpp;1",
  // prpl-jstest is debug-only
  "prpl-jstest": "@mozilla.org/chat/jstest;1",
  "prpl-matrix": "@mozilla.org/chat/matrix;1",
  "prpl-odnoklassniki": "@mozilla.org/chat/odnoklassniki;1",
  "prpl-twitter": "@mozilla.org/chat/twitter;1",
  "prpl-yahoo": "@mozilla.org/chat/yahoo;1",
};
const BUILT_IN_PROTOCOLS = new Set(Object.keys(protocols));

/**
 * Register a new chat protocol. Does nothing if a protocol with the same ID
 * already exists.
 * This doesn't handle accounts of the protocol ID, since this is intended for
 * tests.
 *
 * @param {string} id - The internal ID of the protocol.
 * @param {string} cid - The contract ID of the protocol.
 */
export function registerProtocol(id, cid) {
  if (protocols.hasOwnProperty(id)) {
    return;
  }
  protocols[id] = cid;
}
/**
 * Remove the registration of a custom chat protocol previously registered with
 * registerProtocol.
 * This doesn't handle accounts of the protocol ID, since this is intended for
 * tests.
 *
 * @param {string} id
 */
export function unregisterProtocol(id) {
  if (BUILT_IN_PROTOCOLS.has(id)) {
    return;
  }
  delete protocols[id];
}

function UserStatus() {
  this._observers = [];

  if (Services.prefs.getBoolPref(kPrefReportIdle)) {
    this._addIdleObserver();
  }
  Services.prefs.addObserver(kPrefReportIdle, this);

  if (Services.io.offline) {
    this._offlineStatusType = Ci.imIStatusInfo.STATUS_OFFLINE;
  }
  Services.obs.addObserver(this, NS_IOSERVICE_GOING_OFFLINE_TOPIC);
  Services.obs.addObserver(this, NS_IOSERVICE_OFFLINE_STATUS_TOPIC);
}
UserStatus.prototype = {
  __proto__: ClassInfo("imIUserStatusInfo", "User status info"),

  unInit() {
    this._observers = [];
    Services.prefs.removeObserver(kPrefReportIdle, this);
    if (this._observingIdleness) {
      this._removeIdleObserver();
    }
    Services.obs.removeObserver(this, NS_IOSERVICE_GOING_OFFLINE_TOPIC);
    Services.obs.removeObserver(this, NS_IOSERVICE_OFFLINE_STATUS_TOPIC);
  },
  _observingIdleness: false,
  _addIdleObserver() {
    this._observingIdleness = true;
    this._idleService = Cc["@mozilla.org/widget/useridleservice;1"].getService(
      Ci.nsIUserIdleService
    );
    Services.obs.addObserver(this, "im-sent");

    this._timeBeforeIdle = Services.prefs.getIntPref(kPrefTimeBeforeIdle);
    if (this._timeBeforeIdle < 0) {
      this._timeBeforeIdle = 0;
    }
    Services.prefs.addObserver(kPrefTimeBeforeIdle, this);
    if (this._timeBeforeIdle) {
      this._idleService.addIdleObserver(this, this._timeBeforeIdle);
    }
  },
  _removeIdleObserver() {
    if (this._timeBeforeIdle) {
      this._idleService.removeIdleObserver(this, this._timeBeforeIdle);
    }

    Services.prefs.removeObserver(kPrefTimeBeforeIdle, this);
    delete this._timeBeforeIdle;

    Services.obs.removeObserver(this, "im-sent");
    delete this._idleService;
    delete this._observingIdleness;
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      if (aData == kPrefReportIdle) {
        const reportIdle = Services.prefs.getBoolPref(kPrefReportIdle);
        if (reportIdle && !this._observingIdleness) {
          this._addIdleObserver();
        } else if (!reportIdle && this._observingIdleness) {
          this._removeIdleObserver();
        }
      } else if (aData == kPrefTimeBeforeIdle) {
        const timeBeforeIdle = Services.prefs.getIntPref(kPrefTimeBeforeIdle);
        if (timeBeforeIdle != this._timeBeforeIdle) {
          if (this._timeBeforeIdle) {
            this._idleService.removeIdleObserver(this, this._timeBeforeIdle);
          }
          this._timeBeforeIdle = timeBeforeIdle;
          if (this._timeBeforeIdle) {
            this._idleService.addIdleObserver(this, this._timeBeforeIdle);
          }
        }
      } else {
        throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
      }
    } else if (aTopic == NS_IOSERVICE_GOING_OFFLINE_TOPIC) {
      this.offline = true;
    } else if (
      aTopic == NS_IOSERVICE_OFFLINE_STATUS_TOPIC &&
      aData == "online"
    ) {
      this.offline = false;
    } else {
      this._checkIdle();
    }
  },

  _offlineStatusType: Ci.imIStatusInfo.STATUS_AVAILABLE,
  set offline(aOffline) {
    const statusType = this.statusType;
    const statusText = this.statusText;
    if (aOffline) {
      this._offlineStatusType = Ci.imIStatusInfo.STATUS_OFFLINE;
    } else {
      delete this._offlineStatusType;
    }
    if (this.statusType != statusType || this.statusText != statusText) {
      this._notifyObservers("status-changed", this.statusText);
    }
  },

  _idleTime: 0,
  get idleTime() {
    return this._idleTime;
  },
  set idleTime(aIdleTime) {
    this._idleTime = aIdleTime;
    this._notifyObservers("idle-time-changed", aIdleTime);
  },
  _idle: false,
  _idleStatusText: "",
  _idleStatusType: Ci.imIStatusInfo.STATUS_AVAILABLE,
  _checkIdle() {
    const idleTime = Math.floor(this._idleService.idleTime / 1000);
    const idle = this._timeBeforeIdle && idleTime >= this._timeBeforeIdle;
    if (idle == this._idle) {
      return;
    }

    const statusType = this.statusType;
    const statusText = this.statusText;
    this._idle = idle;
    if (idle) {
      this.idleTime = idleTime;
      if (Services.prefs.getBoolPref(kPrefAwayWhenIdle)) {
        this._idleStatusType = Ci.imIStatusInfo.STATUS_AWAY;
        this._idleStatusText = Services.prefs.getComplexValue(
          kPrefDefaultMessage,
          Ci.nsIPrefLocalizedString
        ).data;
      }
    } else {
      this.idleTime = 0;
      delete this._idleStatusType;
      delete this._idleStatusText;
    }
    if (this.statusType != statusType || this.statusText != statusText) {
      this._notifyObservers("status-changed", this.statusText);
    }
  },

  _statusText: "",
  get statusText() {
    return this._statusText || this._idleStatusText;
  },
  _statusType: Ci.imIStatusInfo.STATUS_AVAILABLE,
  get statusType() {
    return Math.min(
      this._statusType,
      this._idleStatusType,
      this._offlineStatusType
    );
  },
  setStatus(aStatus, aMessage) {
    if (aStatus != Ci.imIStatusInfo.STATUS_UNKNOWN) {
      this._statusType = aStatus;
    }
    if (aStatus != Ci.imIStatusInfo.STATUS_OFFLINE) {
      this._statusText = aMessage;
    }
    this._notifyObservers("status-changed", aMessage);
  },

  _getProfileDir: () => Services.dirsvc.get("ProfD", Ci.nsIFile),
  setUserIcon(aIconFile) {
    const folder = this._getProfileDir();

    let newName = "";
    if (aIconFile) {
      // Get the extension (remove trailing dots - invalid Windows extension).
      const ext = aIconFile.leafName.replace(/.*(\.[a-z0-9]+)\.*/i, "$1");
      // newName = userIcon-<timestamp(now)>.<aIconFile.extension>
      newName = "userIcon-" + Math.floor(Date.now() / 1000) + ext;

      // Copy the new icon file to newName in the profile folder.
      aIconFile.copyTo(folder, newName);
    }

    // Get the previous file name before saving the new file name.
    const oldFileName = Services.prefs.getCharPref(kPrefUserIconFilename);
    Services.prefs.setCharPref(kPrefUserIconFilename, newName);

    // Now that the new icon has been copied to the profile directory
    // and the pref value changed, we can remove the old icon. Ignore
    // failures so that we always fire the user-icon-changed notification.
    try {
      if (oldFileName) {
        folder.append(oldFileName);
        if (folder.exists()) {
          folder.remove(false);
        }
      }
    } catch (e) {
      console.error(e);
    }

    this._notifyObservers("user-icon-changed", newName);
  },
  getUserIcon() {
    const filename = Services.prefs.getCharPref(kPrefUserIconFilename);
    if (!filename) {
      // No icon has been set.
      return null;
    }

    const file = this._getProfileDir();
    file.append(filename);

    if (!file.exists()) {
      Services.console.logStringMessage("Invalid userIconFileName preference");
      return null;
    }

    return Services.io.newFileURI(file);
  },

  get displayName() {
    return Services.prefs.getStringPref(kPrefUserDisplayname);
  },
  set displayName(aDisplayName) {
    Services.prefs.setStringPref(kPrefUserDisplayname, aDisplayName);
    this._notifyObservers("user-display-name-changed", aDisplayName);
  },

  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  },
  removeObserver(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  _notifyObservers(aTopic, aData) {
    for (const observer of this._observers) {
      observer.observe(this, aTopic, aData);
    }
  },
};

/**
 * @implements {nsIObserver}
 */
class CoreService {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  /**
   * @type {?imIUserStatusInfo}
   * @readonly
   */
  globalUserStatus = null;

  _initialized = false;
  /**
   * @type {boolean}
   * @readonly
   */
  get initialized() {
    return this._initialized;
  }
  /**
   * This will emit a prpl-init notification. After this point the 'initialized'
   * attribute will be 'true' and it's safe to access the services for accounts,
   * contacts, conversations and commands.
   */
  init() {
    if (this._initialized) {
      return;
    }

    initLogModule("core", this);

    Services.obs.addObserver(this, kQuitApplicationGranted);
    this._initialized = true;

    IMServices.cmd.initCommands();
    this._protos = {};

    this.globalUserStatus = new UserStatus();
    this.globalUserStatus.addObserver({
      observe(aSubject, aTopic, aData) {
        Services.obs.notifyObservers(aSubject, aTopic, aData);
      },
    });

    // Make sure logger has registered its observers.
    IMServices.logs;
    IMServices.accounts.initAccounts();
    IMServices.contacts.initContacts();
    IMServices.conversations.initConversations();
    Services.obs.notifyObservers(null, "prpl-init");

    // Wait with automatic connections until the password service
    // is available.
    if (
      IMServices.accounts.autoLoginStatus ==
      IMServices.accounts.AUTOLOGIN.ENABLED
    ) {
      Services.logins.initializationPromise.then(() => {
        IMServices.accounts.processAutoLogin();
      });
    }
  }
  observe(aObject, aTopic) {
    if (aTopic == kQuitApplicationGranted) {
      this.quit();
    }
  }
  /**
   * This will emit a prpl-quit notification. This is the last opportunity to
   * use the aforementioned services before they are uninitialized.
   */
  quit() {
    if (!this._initialized) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }

    Services.obs.removeObserver(this, kQuitApplicationGranted);
    Services.obs.notifyObservers(null, "prpl-quit");

    IMServices.conversations.unInitConversations();
    IMServices.accounts.unInitAccounts();
    IMServices.contacts.unInitContacts();
    IMServices.cmd.unInitCommands();

    this.globalUserStatus.unInit();
    delete this.globalUserStatus;
    delete this._protos;
    delete this._initialized;
  }

  /**
   * Returns the available protocols.
   *
   * @returns {prplIProtocol[]}
   */
  getProtocols() {
    if (!this._initialized) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }

    return (
      Object.keys(protocols)
        // If the preference is set to disable this prpl, don't show it in the
        // full list of protocols.
        .filter(protocolId => {
          const pref = `chat.prpls.${protocolId}.disable`;
          return (
            Services.prefs.getPrefType(pref) != Services.prefs.PREF_BOOL ||
            !Services.prefs.getBoolPref(pref)
          );
        })
        .map(protocolId => this.getProtocolById(protocolId))
        .filter(Boolean)
    );
  }

  /**
   *
   * @param {string} aPrplId
   * @returns {prplIProtocol}
   */
  getProtocolById(aPrplId) {
    if (!this._initialized) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }

    if (this._protos.hasOwnProperty(aPrplId)) {
      return this._protos[aPrplId];
    }

    if (
      !protocols.hasOwnProperty(aPrplId) ||
      (aPrplId === "prpl-jstest" && !AppConstants.DEBUG)
    ) {
      return null; // no protocol registered for this id.
    }

    const cid = protocols[aPrplId];

    let proto = null;
    try {
      proto = Cc[cid].createInstance(Ci.prplIProtocol);
    } catch (e) {
      // This is a real error, the protocol is registered and failed to init.
      const error = "failed to create an instance of " + cid + ": " + e;
      dump(error + "\n");
      console.error(error);
    }
    if (!proto) {
      return null;
    }

    try {
      proto.init(aPrplId);
    } catch (e) {
      console.error("Could not initialize protocol " + aPrplId + ": " + e);
      return null;
    }

    this._protos[aPrplId] = proto;
    return proto;
  }
}

export const core = new CoreService();
