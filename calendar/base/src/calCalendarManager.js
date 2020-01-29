/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calItemModule.js */

var { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { Preferences } = ChromeUtils.import("resource://gre/modules/Preferences.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var REGISTRY_BRANCH = "calendar.registry.";
var MAX_INT = Math.pow(2, 31) - 1;
var MIN_INT = -MAX_INT;

function calCalendarManager() {
  this.wrappedJSObject = this;
  this.mObservers = new cal.data.ListenerSet(Ci.calICalendarManagerObserver);
  this.mCalendarObservers = new cal.data.ListenerSet(Ci.calIObserver);
}

var calCalendarManagerClassID = Components.ID("{f42585e7-e736-4600-985d-9624c1c51992}");
var calCalendarManagerInterfaces = [Ci.calICalendarManager, Ci.calIStartupService, Ci.nsIObserver];
calCalendarManager.prototype = {
  classID: calCalendarManagerClassID,
  QueryInterface: cal.generateQI(calCalendarManagerInterfaces),
  classInfo: cal.generateCI({
    classID: calCalendarManagerClassID,
    contractID: "@mozilla.org/calendar/manager;1",
    classDescription: "Calendar Manager",
    interfaces: calCalendarManagerInterfaces,
    flags: Ci.nsIClassInfo.SINGLETON,
  }),

  get networkCalendarCount() {
    return this.mNetworkCalendarCount;
  },
  get readOnlyCalendarCount() {
    return this.mReadonlyCalendarCount;
  },
  get calendarCount() {
    return this.mCalendarCount;
  },

  // calIStartupService:
  startup: function(aCompleteListener) {
    AddonManager.addAddonListener(gCalendarManagerAddonListener);
    this.mCache = null;
    this.mCalObservers = null;
    this.mRefreshTimer = {};
    this.setupOfflineObservers();
    this.mNetworkCalendarCount = 0;
    this.mReadonlyCalendarCount = 0;
    this.mCalendarCount = 0;

    Services.obs.addObserver(this, "http-on-modify-request");

    // We only add the observer if the pref is set and only check for the
    // pref on startup to avoid checking for every http request
    if (Services.prefs.getBoolPref("calendar.network.multirealm", false)) {
      Services.obs.addObserver(this, "http-on-examine-response");
    }

    aCompleteListener.onResult(null, Cr.NS_OK);
  },

  shutdown: function(aCompleteListener) {
    for (let id in this.mCache) {
      let calendar = this.mCache[id];
      calendar.removeObserver(this.mCalObservers[calendar.id]);
    }

    this.cleanupOfflineObservers();

    Services.obs.removeObserver(this, "http-on-modify-request");

    AddonManager.removeAddonListener(gCalendarManagerAddonListener);

    // Remove the observer if the pref is set. This might fail when the
    // user flips the pref, but we assume he is going to restart anyway
    // afterwards.
    if (Services.prefs.getBoolPref("calendar.network.multirealm", false)) {
      Services.obs.removeObserver(this, "http-on-examine-response");
    }

    aCompleteListener.onResult(null, Cr.NS_OK);
  },

  setupOfflineObservers: function() {
    Services.obs.addObserver(this, "network:offline-status-changed");
  },

  cleanupOfflineObservers: function() {
    Services.obs.removeObserver(this, "network:offline-status-changed");
  },

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "timer-callback": {
        // Refresh all the calendars that can be refreshed.
        for (let calendar of this.getCalendars()) {
          if (!calendar.getProperty("disabled") && calendar.canRefresh) {
            calendar.refresh();
          }
        }
        break;
      }
      case "network:offline-status-changed": {
        for (let id in this.mCache) {
          let calendar = this.mCache[id];
          if (calendar instanceof calCachedCalendar) {
            calendar.onOfflineStatusChanged(aData == "offline");
          }
        }
        break;
      }
      case "http-on-examine-response": {
        try {
          let channel = aSubject.QueryInterface(Ci.nsIHttpChannel);
          if (channel.notificationCallbacks) {
            // We use the notification callbacks to get the calendar interface,
            // which likely works for our requests since getInterface is called
            // from the calendar provider context.
            let authHeader = channel.getResponseHeader("WWW-Authenticate");
            let calendar = channel.notificationCallbacks.getInterface(Ci.calICalendar);
            if (calendar && !calendar.getProperty("capabilities.realmrewrite.disabled")) {
              // The provider may choose to explicitly disable the
              // rewriting, for example if all calendars on a
              // domain have the same credentials
              let escapedName = calendar.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              authHeader = appendToRealm(authHeader, "(" + escapedName + ")");
              channel.setResponseHeader("WWW-Authenticate", authHeader, false);
            }
          }
        } catch (e) {
          if (e.result != Cr.NS_NOINTERFACE && e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
            throw e;
          }
          // Possible reasons we got here:
          // - Its not a http channel (wtf? Oh well)
          // - The owner is not a calICalendar (looks like its not our deal)
          // - The WWW-Authenticate header is missing (that's ok)
        }
        break;
      }
      case "http-on-modify-request": {
        // Unfortunately, the ability to do this with a general pref has
        // been removed. Calendar servers might still want to know what
        // client is used for access, so add our UA String to each
        // request.
        let httpChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
        try {
          // NOTE: For some reason, this observer call doesn't have
          // the "cal" namespace defined
          let userAgent = httpChannel.getRequestHeader("User-Agent");
          let calUAString = Services.prefs.getStringPref("calendar.useragent.extra", "").trim();

          // Don't add an empty string or an already included token.
          if (calUAString && !userAgent.includes(calUAString)) {
            // User-Agent is not a mergeable header. We need to
            // merge the user agent ourselves.
            httpChannel.setRequestHeader("User-Agent", userAgent + " " + calUAString, false);
          }
        } catch (e) {
          if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
            throw e;
          }
          // We swallow this error since it means the User Agent
          // header is not set. We don't want to force it to be set.
        }
        break;
      }
    }
  },

  alertAndQuit: function() {
    // We want to include the extension name in the error message rather
    // than blaming Thunderbird.
    let hostAppName = cal.l10n.getAnyString("branding", "brand", "brandShortName");
    let calAppName = cal.l10n.getLtnString("brandShortName");
    let errorBoxTitle = cal.l10n.getCalString("tooNewSchemaErrorBoxTitle", [calAppName]);
    let errorBoxText = cal.l10n.getCalString("tooNewSchemaErrorBoxTextLightning", [
      calAppName,
      hostAppName,
    ]);
    let errorBoxButtonLabel = cal.l10n.getCalString("tooNewSchemaButtonRestart", [hostAppName]);

    let promptSvc = Services.prompt;

    let errorBoxButtonFlags =
      promptSvc.BUTTON_POS_0 * promptSvc.BUTTON_TITLE_IS_STRING + promptSvc.BUTTON_POS_0_DEFAULT;

    promptSvc.confirmEx(
      null,
      errorBoxTitle,
      errorBoxText,
      errorBoxButtonFlags,
      errorBoxButtonLabel,
      null, // No second button text
      null, // No third button text
      null, // No checkbox
      { value: false }
    ); // Unnecessary checkbox state

    // Disable Lightning
    AddonManager.getAddonByID("{e2fda1a4-762b-4020-b5ad-a41df1933103}", aAddon => {
      aAddon.userDisabled = true;
      Services.startup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eForceQuit);
    });
  },

  /**
   * calICalendarManager interface
   */
  createCalendar: function(type, uri) {
    try {
      if (!Cc["@mozilla.org/calendar/calendar;1?type=" + type]) {
        // Don't notify the user with an extra dialog if the provider
        // interface is missing.
        return null;
      }
      let calendar = Cc["@mozilla.org/calendar/calendar;1?type=" + type].createInstance(
        Ci.calICalendar
      );
      calendar.uri = uri;
      return calendar;
    } catch (ex) {
      let rc = ex;
      let uiMessage = ex;
      if (ex instanceof Ci.nsIException) {
        rc = ex.result;
        uiMessage = ex.message;
      }
      switch (rc) {
        case Ci.calIErrors.STORAGE_UNKNOWN_SCHEMA_ERROR:
          // For now we alert and quit on schema errors like we've done before:
          this.alertAndQuit();
          return null;
        default:
          uiMessage = cal.l10n.getCalString("unableToCreateProvider", [uri.spec]);
          break;
      }
      // Log the original exception via error console to provide more debug info
      cal.ERROR(ex);

      // Log the possibly translated message via the UI.
      let paramBlock = Cc["@mozilla.org/embedcomp/dialogparam;1"].createInstance(
        Ci.nsIDialogParamBlock
      );
      paramBlock.SetNumberStrings(3);
      paramBlock.SetString(0, uiMessage);
      paramBlock.SetString(1, "0x" + rc.toString(0x10));
      paramBlock.SetString(2, ex);
      Services.ww.openWindow(
        null,
        "chrome://calendar/content/calendar-error-prompt.xhtml",
        "_blank",
        "chrome,dialog=yes,alwaysRaised=yes",
        paramBlock
      );
      return null;
    }
  },

  registerCalendar: function(calendar) {
    this.assureCache();

    // If the calendar is already registered, bail out
    cal.ASSERT(
      !calendar.id || !(calendar.id in this.mCache),
      "[calCalendarManager::registerCalendar] calendar already registered!",
      true
    );

    if (!calendar.id) {
      calendar.id = cal.getUUID();
    }

    Services.prefs.setStringPref(getPrefBranchFor(calendar.id) + "type", calendar.type);
    Services.prefs.setStringPref(getPrefBranchFor(calendar.id) + "uri", calendar.uri.spec);

    if (
      calendar.getProperty("cache.supported") !== false &&
      (calendar.getProperty("cache.enabled") || calendar.getProperty("cache.always"))
    ) {
      calendar = new calCachedCalendar(calendar);
    }

    this.setupCalendar(calendar);
    flushPrefs();

    if (!calendar.getProperty("disabled") && calendar.canRefresh) {
      calendar.refresh();
    }

    this.notifyObservers("onCalendarRegistered", [calendar]);
  },

  setupCalendar: function(calendar) {
    this.mCache[calendar.id] = calendar;

    // Add an observer to track readonly-mode triggers
    let newObserver = new calMgrCalendarObserver(calendar, this);
    calendar.addObserver(newObserver);
    this.mCalObservers[calendar.id] = newObserver;

    // Set up statistics
    if (calendar.getProperty("requiresNetwork") !== false) {
      this.mNetworkCalendarCount++;
    }
    if (calendar.readOnly) {
      this.mReadonlyCalendarCount++;
    }
    this.mCalendarCount++;

    // Set up the refresh timer
    this.setupRefreshTimer(calendar);
  },

  setupRefreshTimer: function(aCalendar) {
    // Add the refresh timer for this calendar
    let refreshInterval = aCalendar.getProperty("refreshInterval");
    if (refreshInterval === null) {
      // Default to 30 minutes, in case the value is missing
      refreshInterval = 30;
    }

    this.clearRefreshTimer(aCalendar);

    if (refreshInterval > 0) {
      this.mRefreshTimer[aCalendar.id] = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

      this.mRefreshTimer[aCalendar.id].initWithCallback(
        new timerCallback(aCalendar),
        refreshInterval * 60000,
        Ci.nsITimer.TYPE_REPEATING_SLACK
      );
    }
  },

  clearRefreshTimer: function(aCalendar) {
    if (aCalendar.id in this.mRefreshTimer && this.mRefreshTimer[aCalendar.id]) {
      this.mRefreshTimer[aCalendar.id].cancel();
      delete this.mRefreshTimer[aCalendar.id];
    }
  },

  unregisterCalendar: function(calendar) {
    this.notifyObservers("onCalendarUnregistering", [calendar]);

    // calendar may be a calICalendar wrapper:
    if (calendar.wrappedJSObject instanceof calCachedCalendar) {
      calendar.wrappedJSObject.onCalendarUnregistering();
    }

    calendar.removeObserver(this.mCalObservers[calendar.id]);
    Services.prefs.deleteBranch(getPrefBranchFor(calendar.id));
    flushPrefs();

    if (this.mCache) {
      delete this.mCache[calendar.id];
    }

    if (calendar.readOnly) {
      this.mReadonlyCalendarCount--;
    }

    if (calendar.getProperty("requiresNetwork") !== false) {
      this.mNetworkCalendarCount--;
    }
    this.mCalendarCount--;

    this.clearRefreshTimer(calendar);
  },

  removeCalendar: function(calendar, mode = 0) {
    const cICM = Ci.calICalendarManager;

    let removeModes = new Set(calendar.getProperty("capabilities.removeModes") || ["unsubscribe"]);
    if (!removeModes.has("unsubscribe") && !removeModes.has("delete")) {
      // Removing is not allowed
      return;
    }

    if (mode & cICM.REMOVE_NO_UNREGISTER && this.mCache && calendar.id in this.mCache) {
      throw new Components.Exception("Can't remove a registered calendar");
    } else if (!(mode & cICM.REMOVE_NO_UNREGISTER)) {
      this.unregisterCalendar(calendar);
    }

    // This observer notification needs to be fired for both unsubscribe
    // and delete, we don't differ this at the moment.
    this.notifyObservers("onCalendarDeleting", [calendar]);

    // For deleting, we also call the deleteCalendar method from the provider.
    if (removeModes.has("delete") && (mode & cICM.REMOVE_NO_DELETE) == 0) {
      let wrappedCalendar = cal.wrapInstance(calendar, Ci.calICalendarProvider);
      if (!wrappedCalendar) {
        throw new Components.Exception("Calendar is missing a provider implementation for delete");
      }

      wrappedCalendar.deleteCalendar(calendar, null);
    }
  },

  getCalendarById: function(aId) {
    if (aId in this.mCache) {
      return this.mCache[aId];
    } else {
      return null;
    }
  },

  getCalendars: function() {
    this.assureCache();
    let calendars = [];
    for (let id in this.mCache) {
      let calendar = this.mCache[id];
      calendars.push(calendar);
    }
    return calendars;
  },

  assureCache: function() {
    if (!this.mCache) {
      this.mCache = {};
      this.mCalObservers = {};

      let allCals = {};
      for (let key of Services.prefs.getChildList(REGISTRY_BRANCH)) {
        // merge down all keys
        allCals[key.substring(0, key.indexOf(".", REGISTRY_BRANCH.length))] = true;
      }

      for (let calBranch in allCals) {
        let id = calBranch.substring(REGISTRY_BRANCH.length);
        let ctype = Services.prefs.getStringPref(calBranch + ".type", null);
        let curi = Services.prefs.getStringPref(calBranch + ".uri", null);

        try {
          if (!ctype || !curi) {
            // sanity check
            Services.prefs.deleteBranch(calBranch + ".");
            continue;
          }

          let uri = Services.io.newURI(curi);
          let calendar = this.createCalendar(ctype, uri);
          if (calendar) {
            calendar.id = id;
            if (calendar.getProperty("auto-enabled")) {
              calendar.deleteProperty("disabled");
              calendar.deleteProperty("auto-enabled");
            }

            if (
              calendar.getProperty("cache.supported") !== false &&
              (calendar.getProperty("cache.enabled") || calendar.getProperty("cache.always"))
            ) {
              calendar = new calCachedCalendar(calendar);
            }
          } else {
            // create dummy calendar that stays disabled for this run:
            calendar = new calDummyCalendar(ctype);
            calendar.id = id;
            calendar.uri = uri;
            // try to enable on next startup if calendar has been enabled:
            if (!calendar.getProperty("disabled")) {
              calendar.setProperty("auto-enabled", true);
            }
            calendar.setProperty("disabled", true);
          }

          this.setupCalendar(calendar);
        } catch (exc) {
          cal.ERROR("Can't create calendar for " + id + " (" + ctype + ", " + curi + "): " + exc);
        }
      }

      // do refreshing in a second step, when *all* calendars are already available
      // via getCalendars():
      for (let id in this.mCache) {
        let calendar = this.mCache[id];
        if (!calendar.getProperty("disabled") && calendar.canRefresh) {
          calendar.refresh();
        }
      }
    }
  },

  getCalendarPref_: function(calendar, name) {
    cal.ASSERT(calendar, "Invalid Calendar!");
    cal.ASSERT(calendar.id !== null, "Calendar id needs to be set!");
    cal.ASSERT(name && name.length > 0, "Pref Name must be non-empty!");

    let branch = getPrefBranchFor(calendar.id) + name;
    let value = Preferences.get(branch, null);

    if (typeof value == "string" && value.startsWith("bignum:")) {
      let converted = Number(value.substr(7));
      if (!isNaN(converted)) {
        value = converted;
      }
    }
    return value;
  },

  setCalendarPref_: function(calendar, name, value) {
    cal.ASSERT(calendar, "Invalid Calendar!");
    cal.ASSERT(calendar.id !== null, "Calendar id needs to be set!");
    cal.ASSERT(name && name.length > 0, "Pref Name must be non-empty!");

    let branch = getPrefBranchFor(calendar.id) + name;

    if (
      typeof value == "number" &&
      (value > MAX_INT || value < MIN_INT || !Number.isInteger(value))
    ) {
      // This is something the preferences service can't store directly.
      // Convert to string and tag it so we know how to handle it.
      value = "bignum:" + value;
    }

    // Delete before to allow pref-type changes, then set the pref.
    Services.prefs.deleteBranch(branch);
    if (value !== null && value !== undefined) {
      Preferences.set(branch, value);
    }
  },

  deleteCalendarPref_: function(calendar, name) {
    cal.ASSERT(calendar, "Invalid Calendar!");
    cal.ASSERT(calendar.id !== null, "Calendar id needs to be set!");
    cal.ASSERT(name && name.length > 0, "Pref Name must be non-empty!");
    Services.prefs.deleteBranch(getPrefBranchFor(calendar.id) + name);
  },

  mObservers: null,
  addObserver: function(aObserver) {
    this.mObservers.add(aObserver);
  },
  removeObserver: function(aObserver) {
    this.mObservers.delete(aObserver);
  },
  notifyObservers: function(functionName, args) {
    this.mObservers.notify(functionName, args);
  },

  mCalendarObservers: null,
  addCalendarObserver: function(aObserver) {
    return this.mCalendarObservers.add(aObserver);
  },
  removeCalendarObserver: function(aObserver) {
    return this.mCalendarObservers.delete(aObserver);
  },
  notifyCalendarObservers: function(functionName, args) {
    this.mCalendarObservers.notify(functionName, args);
  },
};

function equalMessage(msg1, msg2) {
  if (
    msg1.GetString(0) == msg2.GetString(0) &&
    msg1.GetString(1) == msg2.GetString(1) &&
    msg1.GetString(2) == msg2.GetString(2)
  ) {
    return true;
  }
  return false;
}

function calMgrCalendarObserver(calendar, calMgr) {
  this.calendar = calendar;
  // We compare this to determine if the state actually changed.
  this.storedReadOnly = calendar.readOnly;
  this.announcedMessages = [];
  this.calMgr = calMgr;
}

calMgrCalendarObserver.prototype = {
  calendar: null,
  storedReadOnly: null,
  calMgr: null,

  QueryInterface: ChromeUtils.generateQI([Ci.nsIWindowMediatorListener, Ci.calIObserver]),

  // calIObserver:
  onStartBatch: function() {
    return this.calMgr.notifyCalendarObservers("onStartBatch", arguments);
  },
  onEndBatch: function() {
    return this.calMgr.notifyCalendarObservers("onEndBatch", arguments);
  },
  onLoad: function(calendar) {
    return this.calMgr.notifyCalendarObservers("onLoad", arguments);
  },
  onAddItem: function(aItem) {
    return this.calMgr.notifyCalendarObservers("onAddItem", arguments);
  },
  onModifyItem: function(aNewItem, aOldItem) {
    return this.calMgr.notifyCalendarObservers("onModifyItem", arguments);
  },
  onDeleteItem: function(aDeletedItem) {
    return this.calMgr.notifyCalendarObservers("onDeleteItem", arguments);
  },
  onError: function(aCalendar, aErrNo, aMessage) {
    this.calMgr.notifyCalendarObservers("onError", arguments);
    this.announceError(aCalendar, aErrNo, aMessage);
  },

  onPropertyChanged: function(aCalendar, aName, aValue, aOldValue) {
    this.calMgr.notifyCalendarObservers("onPropertyChanged", arguments);
    switch (aName) {
      case "requiresNetwork":
        this.calMgr.mNetworkCalendarCount += aValue ? 1 : -1;
        break;
      case "readOnly":
        this.calMgr.mReadonlyCalendarCount += aValue ? 1 : -1;
        break;
      case "refreshInterval":
        this.calMgr.setupRefreshTimer(aCalendar);
        break;
      case "cache.enabled":
        this.changeCalendarCache(...arguments);
        break;
      case "disabled":
        if (!aValue && aCalendar.canRefresh) {
          aCalendar.refresh();
        }
        break;
    }
  },

  changeCalendarCache: function(aCalendar, aName, aValue, aOldValue) {
    const cICM = Ci.calICalendarManager;
    aOldValue = aOldValue || false;
    aValue = aValue || false;

    // hack for bug 1182264 to deal with calendars, which have set cache.enabled, but in fact do
    // not support caching (like storage calendars) - this also prevents enabling cache again
    if (aCalendar.getProperty("cache.supported") === false) {
      if (aCalendar.getProperty("cache.enabled") === true) {
        aCalendar.deleteProperty("cache.enabled");
      }
      return;
    }

    if (aOldValue != aValue) {
      // Try to find the current sort order
      let sortOrderPref = Services.prefs.getStringPref("calendar.list.sortOrder", "").split(" ");
      let initialSortOrderPos = null;
      for (let i = 0; i < sortOrderPref.length; ++i) {
        if (sortOrderPref[i] == aCalendar.id) {
          initialSortOrderPos = i;
        }
      }
      // Enabling or disabling cache on a calendar re-creates
      // it so the registerCalendar call can wrap/unwrap the
      // calCachedCalendar facade saving the user the need to
      // restart Thunderbird and making sure a new Id is used.
      this.calMgr.removeCalendar(aCalendar, cICM.REMOVE_NO_DELETE);
      let newCal = this.calMgr.createCalendar(aCalendar.type, aCalendar.uri);
      newCal.name = aCalendar.name;

      // TODO: if properties get added this list will need to be adjusted,
      // ideally we should add a "getProperties" method to calICalendar.idl
      // to retrieve all non-transient properties for a calendar.
      let propsToCopy = [
        "color",
        "disabled",
        "auto-enabled",
        "cache.enabled",
        "refreshInterval",
        "suppressAlarms",
        "calendar-main-in-composite",
        "calendar-main-default",
        "readOnly",
        "imip.identity.key",
      ];
      for (let prop of propsToCopy) {
        newCal.setProperty(prop, aCalendar.getProperty(prop));
      }

      if (initialSortOrderPos != null) {
        newCal.setProperty("initialSortOrderPos", initialSortOrderPos);
      }
      this.calMgr.registerCalendar(newCal);
    } else if (aCalendar.wrappedJSObject instanceof calCachedCalendar) {
      // any attempt to switch this flag will reset the cached calendar;
      // could be useful for users in case the cache may be corrupted.
      aCalendar.wrappedJSObject.setupCachedCalendar();
    }
  },

  onPropertyDeleting: function(aCalendar, aName) {
    this.onPropertyChanged(aCalendar, aName, false, true);
  },

  // Error announcer specific functions
  announceError: function(aCalendar, aErrNo, aMessage) {
    let paramBlock = Cc["@mozilla.org/embedcomp/dialogparam;1"].createInstance(
      Ci.nsIDialogParamBlock
    );
    let props = Services.strings.createBundle("chrome://calendar/locale/calendar.properties");
    let errMsg;
    paramBlock.SetNumberStrings(3);
    if (!this.storedReadOnly && this.calendar.readOnly) {
      // Major errors change the calendar to readOnly
      errMsg = props.formatStringFromName("readOnlyMode", [this.calendar.name]);
    } else if (!this.storedReadOnly && !this.calendar.readOnly) {
      // Minor errors don't, but still tell the user something went wrong
      errMsg = props.formatStringFromName("minorError", [this.calendar.name]);
    } else {
      // The calendar was already in readOnly mode, but still tell the user
      errMsg = props.formatStringFromName("stillReadOnlyError", [this.calendar.name]);
    }

    // When possible, change the error number into its name, to
    // make it slightly more readable.
    let errCode = "0x" + aErrNo.toString(16);
    const calIErrors = Ci.calIErrors;
    // Check if it is worth enumerating all the error codes.
    if (aErrNo & calIErrors.ERROR_BASE) {
      for (let err in calIErrors) {
        if (calIErrors[err] == aErrNo) {
          errCode = err;
        }
      }
    }

    let message;
    switch (aErrNo) {
      case calIErrors.CAL_UTF8_DECODING_FAILED:
        message = props.GetStringFromName("utf8DecodeError");
        break;
      case calIErrors.ICS_MALFORMEDDATA:
        message = props.GetStringFromName("icsMalformedError");
        break;
      case calIErrors.MODIFICATION_FAILED:
        errMsg = cal.l10n.getCalString("errorWriting2", [aCalendar.name]);
        message = cal.l10n.getCalString("errorWritingDetails");
        if (aMessage) {
          message = aMessage + "\n" + message;
        }
        break;
      default:
        message = aMessage;
    }

    paramBlock.SetString(0, errMsg);
    paramBlock.SetString(1, errCode);
    paramBlock.SetString(2, message);

    this.storedReadOnly = this.calendar.readOnly;
    let errorCode = cal.l10n.getCalString("errorCode", [errCode]);
    let errorDescription = cal.l10n.getCalString("errorDescription", [message]);
    let summary = errMsg + " " + errorCode + ". " + errorDescription;

    // Log warnings in error console.
    // Report serious errors in both error console and in prompt window.
    if (aErrNo == calIErrors.MODIFICATION_FAILED) {
      Cu.reportError(summary);
      this.announceParamBlock(paramBlock);
    } else {
      cal.WARN(summary);
    }
  },

  announceParamBlock: function(paramBlock) {
    function awaitLoad(event) {
      promptWindow.addEventListener("unload", awaitUnload, { capture: false, once: true });
    }
    let awaitUnload = event => {
      // unloaded (user closed prompt window),
      // remove paramBlock and unload listener.
      try {
        // remove the message that has been shown from
        // the list of all announced messages.
        this.announcedMessages = this.announcedMessages.filter(msg => {
          return !equalMessage(msg, paramBlock);
        });
      } catch (e) {
        Cu.reportError(e);
      }
    };

    // silently don't do anything if this message already has been
    // announced without being acknowledged.
    if (this.announcedMessages.some(equalMessage.bind(null, paramBlock))) {
      return;
    }

    // this message hasn't been announced recently, remember the details of
    // the message for future reference.
    this.announcedMessages.push(paramBlock);

    // Will remove paramBlock from announced messages when promptWindow is
    // closed.  (Closing fires unloaded event, but promptWindow is also
    // unloaded [to clean it?] before loading, so wait for detected load
    // event before detecting unload event that signifies user closed this
    // prompt window.)
    let promptUrl = "chrome://calendar/content/calendar-error-prompt.xhtml";
    let features = "chrome,dialog=yes,alwaysRaised=yes";
    let promptWindow = Services.ww.openWindow(null, promptUrl, "_blank", features, paramBlock);
    promptWindow.addEventListener("load", awaitLoad, { capture: false, once: true });
  },
};

function calDummyCalendar(type) {
  this.initProviderBase();
  this.type = type;
}
calDummyCalendar.prototype = {
  __proto__: cal.provider.BaseClass.prototype,

  getProperty: function(aName) {
    switch (aName) {
      case "force-disabled":
        return true;
      default:
        return this.__proto__.__proto__.getProperty.apply(this, arguments);
    }
  },
};

function getPrefBranchFor(id) {
  return REGISTRY_BRANCH + id + ".";
}

/**
 * Helper function to flush the preferences file. If the application crashes
 * after a calendar has been created using the prefs registry, then the calendar
 * won't show up. Writing the prefs helps counteract.
 */
function flushPrefs() {
  Services.prefs.savePrefFile(null);
}

/**
 * Callback object for the refresh timer. Should be called as an object, i.e
 * let foo = new timerCallback(calendar);
 *
 * @param aCalendar     The calendar to refresh on notification
 */
function timerCallback(aCalendar) {
  this.notify = function(aTimer) {
    if (!aCalendar.getProperty("disabled") && aCalendar.canRefresh) {
      aCalendar.refresh();
    }
  };
}

var gCalendarManagerAddonListener = {
  onDisabling: function(aAddon, aNeedsRestart) {
    if (!this.queryUninstallProvider(aAddon)) {
      // If the addon should not be disabled, then re-enable it.
      aAddon.userDisabled = false;
    }
  },

  onUninstalling: function(aAddon, aNeedsRestart) {
    if (!this.queryUninstallProvider(aAddon)) {
      // If the addon should not be uninstalled, then cancel the uninstall.
      aAddon.cancelUninstall();
    }
  },

  queryUninstallProvider: function(aAddon) {
    const uri = "chrome://calendar/content/calendar-providerUninstall-dialog.xhtml";
    const features = "chrome,titlebar,resizable,modal";
    let calMgr = cal.getCalendarManager();
    let affectedCalendars = calMgr
      .getCalendars()
      .filter(calendar => calendar.providerID == aAddon.id);
    if (!affectedCalendars.length) {
      // If no calendars are affected, then everything is fine.
      return true;
    }

    let args = { shouldUninstall: false, extension: aAddon };

    // Now find a window. The best choice would be the most recent
    // addons window, otherwise the most recent calendar window, or we
    // create a new toplevel window.
    let win =
      Services.wm.getMostRecentWindow("Extension:Manager") || cal.window.getCalendarWindow();
    if (win) {
      win.openDialog(uri, "CalendarProviderUninstallDialog", features, args);
    } else {
      // Use the window watcher to open a parentless window.
      Services.ww.openWindow(null, uri, "CalendarProviderUninstallWindow", features, args);
    }

    // Now that we are done, check if the dialog was accepted or canceled.
    return args.shouldUninstall;
  },
};

function appendToRealm(authHeader, appendStr) {
  let isEscaped = false;
  let idx = authHeader.search(/realm="(.*?)(\\*)"/);
  if (idx > -1) {
    let remain = authHeader.substr(idx + 7);
    idx += 7;
    while (remain.length && !isEscaped) {
      let match = remain.match(/(.*?)(\\*)"/);
      idx += match[0].length;

      isEscaped = match[2].length % 2 == 0;
      if (!isEscaped) {
        remain = remain.substr(match[0].length);
      }
    }
    return authHeader.substr(0, idx - 1) + " " + appendStr + authHeader.substr(idx - 1);
  } else {
    return authHeader;
  }
}
