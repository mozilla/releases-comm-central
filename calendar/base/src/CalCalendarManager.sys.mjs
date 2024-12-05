/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line no-shadow
import { AddonManager } from "resource://gre/modules/AddonManager.sys.mjs";
import { Preferences } from "resource://gre/modules/Preferences.sys.mjs";
import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";
import { calCachedCalendar } from "resource:///modules/CalCachedCalendar.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

var REGISTRY_BRANCH = "calendar.registry.";
var MAX_INT = Math.pow(2, 31) - 1;
var MIN_INT = -MAX_INT;

export function CalCalendarManager() {
  this.wrappedJSObject = this;
  this.mObservers = new cal.data.ListenerSet(Ci.calICalendarManagerObserver);
  this.mCalendarObservers = new cal.data.ListenerSet(Ci.calIObserver);

  this.providerImplementations = {};
}
const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

var calCalendarManagerClassID = Components.ID("{f42585e7-e736-4600-985d-9624c1c51992}");
var calCalendarManagerInterfaces = [Ci.calICalendarManager, Ci.calIStartupService, Ci.nsIObserver];
CalCalendarManager.prototype = {
  classID: calCalendarManagerClassID,
  QueryInterface: cal.generateQI(["calICalendarManager", "calIStartupService", "nsIObserver"]),
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
  startup(aCompleteListener) {
    AddonManager.addAddonListener(gCalendarManagerAddonListener);
    this.mCache = null;
    this.mCalObservers = null;
    this.mRefreshTimer = {};
    this.setupOfflineObservers();
    this.mNetworkCalendarCount = 0;
    this.mReadonlyCalendarCount = 0;
    this.mCalendarCount = 0;

    // We only add the observer if the pref is set and only check for the
    // pref on startup to avoid checking for every http request
    if (Services.prefs.getBoolPref("calendar.network.multirealm", false)) {
      Services.obs.addObserver(this, "http-on-examine-response");
    }

    aCompleteListener.onResult(null, Cr.NS_OK);
  },

  shutdown(aCompleteListener) {
    for (const id in this.mCache) {
      const calendar = this.mCache[id];
      calendar.removeObserver(this.mCalObservers[calendar.id]);
    }

    this.cleanupOfflineObservers();

    AddonManager.removeAddonListener(gCalendarManagerAddonListener);

    // Remove the observer if the pref is set. This might fail when the
    // user flips the pref, but we assume he is going to restart anyway
    // afterwards.
    if (Services.prefs.getBoolPref("calendar.network.multirealm", false)) {
      Services.obs.removeObserver(this, "http-on-examine-response");
    }

    aCompleteListener.onResult(null, Cr.NS_OK);
  },

  setupOfflineObservers() {
    Services.obs.addObserver(this, "network:offline-status-changed");
  },

  cleanupOfflineObservers() {
    Services.obs.removeObserver(this, "network:offline-status-changed");
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "timer-callback": {
        // Refresh all the calendars that can be refreshed.
        for (const calendar of this.getCalendars()) {
          maybeRefreshCalendar(calendar);
        }
        break;
      }
      case "network:offline-status-changed": {
        for (const id in this.mCache) {
          const calendar = this.mCache[id];
          if (calendar instanceof calCachedCalendar) {
            calendar.onOfflineStatusChanged(aData == "offline");
          }
        }
        break;
      }
      case "http-on-examine-response": {
        try {
          const channel = aSubject.QueryInterface(Ci.nsIHttpChannel);
          if (channel.notificationCallbacks) {
            // We use the notification callbacks to get the calendar interface, which likely works
            // for our requests since getInterface is called from the calendar provider context.
            let authHeader = channel.getResponseHeader("WWW-Authenticate");
            const calendar = channel.notificationCallbacks.getInterface(Ci.calICalendar);
            if (calendar && !calendar.getProperty("capabilities.realmrewrite.disabled")) {
              // The provider may choose to explicitly disable the rewriting, for example if all
              // calendars on a domain have the same credentials
              const escapedName = calendar.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
    }
  },

  /**
   * calICalendarManager interface
   */
  createCalendar(type, uri) {
    try {
      let calendar;
      if (Cc["@mozilla.org/calendar/calendar;1?type=" + type]) {
        calendar = Cc["@mozilla.org/calendar/calendar;1?type=" + type].createInstance(
          Ci.calICalendar
        );
      } else if (this.providerImplementations[type]) {
        const CalendarProvider = this.providerImplementations[type];
        calendar = new CalendarProvider();
        if (calendar.QueryInterface) {
          calendar = calendar.QueryInterface(Ci.calICalendar);
        }
      } else {
        // Don't notify the user with an extra dialog if the provider interface is missing.
        return null;
      }

      calendar.uri = uri;
      return calendar;
    } catch (ex) {
      let rc = ex;
      if (ex instanceof Ci.nsIException) {
        rc = ex.result;
      }

      const uiMessage = lazy.l10n.formatValueSync("unable-to-create-provider", {
        location: uri.spec,
      });

      // Log the original exception via error console to provide more debug info
      cal.ERROR(ex);

      // Log the possibly translated message via the UI.
      const paramBlock = Cc["@mozilla.org/embedcomp/dialogparam;1"].createInstance(
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

  /**
   * Creates a calendar and takes care of initial setup, including enabled/disabled properties and
   * cached calendars. If the provider doesn't exist, returns a dummy calendar that is
   * force-disabled.
   *
   * @param {string} id - The calendar id.
   * @param {string} ctype - The calendar type. See {@link calICalendar#type}.
   * @param {string} uri - The calendar uri.
   * @returns {calICalendar} The initialized calendar or dummy calendar.
   */
  initializeCalendar(id, ctype, uri) {
    let calendar = this.createCalendar(ctype, uri);
    if (calendar) {
      calendar.id = id;
      if (calendar.getProperty("auto-enabled")) {
        calendar.deleteProperty("disabled");
        calendar.deleteProperty("auto-enabled");
      }

      calendar = maybeWrapCachedCalendar(calendar);
    } else {
      // Create dummy calendar that stays disabled for this run.
      calendar = new calDummyCalendar(ctype);
      calendar.id = id;
      calendar.uri = uri;
      // Try to enable on next startup if calendar has been enabled.
      if (!calendar.getProperty("disabled")) {
        calendar.setProperty("auto-enabled", true);
      }
      calendar.setProperty("disabled", true);
    }

    return calendar;
  },

  /**
   * Update calendar registrations for the given type. If the provider is missing then the calendars
   * are replaced with a dummy calendar, and vice versa.
   *
   * @param {string} type - The calendar type to update. See {@link calICalendar#type}.
   * @param {boolean} [clearCache=false] - If true, the calendar cache is also cleared.
   */
  updateDummyCalendarRegistration(type, clearCache = false) {
    const hasImplementation = !!this.providerImplementations[type];

    const calendars = Object.values(this.mCache).filter(calendar => {
      // Calendars backed by providers despite missing provider implementation, or dummy calendars
      // despite having a provider implementation.
      const isDummyCalendar = calendar instanceof calDummyCalendar;
      return calendar.type == type && hasImplementation == isDummyCalendar;
    });
    this.updateCalendarRegistration(calendars, clearCache);
  },

  /**
   * Update the calendar registrations for the given set of calendars. This essentially unregisters
   * the calendar, then sets it up again using id, type and uri. This is similar to what happens on
   * startup.
   *
   * @param {calICalendar[]} calendars - The calendars to update.
   * @param {boolean} [clearCache=false] - If true, the calendar cache is also cleared.
   */
  updateCalendarRegistration(calendars, clearCache = false) {
    const sortOrderPref = Services.prefs.getStringPref("calendar.list.sortOrder", "").split(" ");
    const sortOrder = {};
    for (let i = 0; i < sortOrderPref.length; i++) {
      sortOrder[sortOrderPref[i]] = i;
    }

    const needsRefresh = [];
    for (const calendar of calendars) {
      try {
        this.notifyObservers("onCalendarUnregistering", [calendar]);
        this.unsetupCalendar(calendar, clearCache);

        const replacement = this.initializeCalendar(calendar.id, calendar.type, calendar.uri);
        replacement.setProperty("initialSortOrderPos", sortOrder[calendar.id]);

        this.setupCalendar(replacement);
        needsRefresh.push(replacement);
      } catch (e) {
        cal.ERROR(
          `Can't create calendar for ${calendar.id} (${calendar.type}, ${calendar.uri.spec}): ${e}`
        );
      }
    }

    // Do this in a second pass so that all provider calendars are available.
    for (const calendar of needsRefresh) {
      maybeRefreshCalendar(calendar);
      this.notifyObservers("onCalendarRegistered", [calendar]);
    }
  },

  /**
   * Register a calendar provider with the given JavaScript implementation.
   *
   * @param {string} type - The calendar type string, see {@link calICalendar#type}.
   * @param {object} impl - The class that implements calICalendar.
   */
  registerCalendarProvider(type, impl) {
    this.assureCache();

    cal.ASSERT(
      !this.providerImplementations.hasOwnProperty(type),
      "[CalCalendarManager::registerCalendarProvider] provider already exists",
      true
    );

    this.providerImplementations[type] = impl;
    this.updateDummyCalendarRegistration(type);
  },

  /**
   * Unregister a calendar provider by type. Already registered calendars will be replaced by a
   * dummy calendar that is force-disabled.
   *
   * @param {string} type - The calendar type string, see {@link calICalendar#type}.
   * @param {boolean} temporary - If true, cached calendars will not be cleared.
   */
  unregisterCalendarProvider(type, temporary = false) {
    cal.ASSERT(
      this.providerImplementations.hasOwnProperty(type),
      "[CalCalendarManager::unregisterCalendarProvider] provider doesn't exist or is builtin",
      true
    );
    delete this.providerImplementations[type];
    this.updateDummyCalendarRegistration(type, !temporary);
  },

  /**
   * Checks if a calendar provider has been dynamically registered with the given type. This does
   * not check for the built-in XPCOM providers.
   *
   * @param {string} type - The calendar type string, see {@link calICalendar#type}.
   * @returns {boolean} True, if the calendar provider type is registered.
   */
  hasCalendarProvider(type) {
    return !!this.providerImplementations[type];
  },

  registerCalendar(calendar) {
    this.assureCache();

    // If the calendar is already registered, bail out
    cal.ASSERT(
      !calendar.id || !(calendar.id in this.mCache),
      "[CalCalendarManager::registerCalendar] calendar already registered!",
      true
    );

    if (!calendar.id) {
      calendar.id = cal.getUUID();
    }

    Services.prefs.setStringPref(getPrefBranchFor(calendar.id) + "type", calendar.type);
    Services.prefs.setStringPref(getPrefBranchFor(calendar.id) + "uri", calendar.uri.spec);

    calendar = maybeWrapCachedCalendar(calendar);

    this.setupCalendar(calendar);
    flushPrefs();

    maybeRefreshCalendar(calendar);
    this.notifyObservers("onCalendarRegistered", [calendar]);
  },

  /**
   * Sets up a calendar, this is the initialization required during calendar registration. See
   * {@link #unsetupCalendar} to revert these steps.
   *
   * @param {calICalendar} calendar - The calendar to set up.
   */
  setupCalendar(calendar) {
    this.mCache[calendar.id] = calendar;

    // Add an observer to track readonly-mode triggers
    const newObserver = new calMgrCalendarObserver(calendar, this);
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

  /**
   * Reverts the calendar registration setup steps from {@link #setupCalendar}.
   *
   * @param {calICalendar} calendar - The calendar to undo setup for.
   * @param {boolean} [clearCache=false] - If true, the cache is cleared for this calendar.
   */
  unsetupCalendar(calendar, clearCache = false) {
    if (this.mCache) {
      delete this.mCache[calendar.id];
    }

    if (clearCache && calendar.wrappedJSObject instanceof calCachedCalendar) {
      calendar.wrappedJSObject.onCalendarUnregistering();
    }

    calendar.removeObserver(this.mCalObservers[calendar.id]);

    if (calendar.readOnly) {
      this.mReadonlyCalendarCount--;
    }

    if (calendar.getProperty("requiresNetwork") !== false) {
      this.mNetworkCalendarCount--;
    }
    this.mCalendarCount--;

    this.clearRefreshTimer(calendar);
  },

  setupRefreshTimer(aCalendar) {
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

  clearRefreshTimer(aCalendar) {
    if (aCalendar.id in this.mRefreshTimer && this.mRefreshTimer[aCalendar.id]) {
      this.mRefreshTimer[aCalendar.id].cancel();
      delete this.mRefreshTimer[aCalendar.id];
    }
  },

  unregisterCalendar(calendar) {
    this.notifyObservers("onCalendarUnregistering", [calendar]);
    this.unsetupCalendar(calendar, true);

    deletePrefBranch(calendar.id);
    flushPrefs();
  },

  removeCalendar(calendar, mode = 0) {
    const cICM = Ci.calICalendarManager;

    const removeModes = new Set(
      calendar.getProperty("capabilities.removeModes") || ["unsubscribe"]
    );
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
      const wrappedCalendar = calendar.QueryInterface(Ci.calICalendarProvider);
      wrappedCalendar.deleteCalendar(calendar, null);
    }
  },

  getCalendarById(aId) {
    if (aId in this.mCache) {
      return this.mCache[aId];
    }
    return null;
  },

  getCalendars() {
    this.assureCache();
    const calendars = [];
    for (const id in this.mCache) {
      const calendar = this.mCache[id];
      calendars.push(calendar);
    }
    return calendars;
  },

  /**
   * Load calendars from the pref branch, if they haven't already been loaded. The calendar
   * instances will end up in mCache and are refreshed when complete.
   */
  assureCache() {
    if (this.mCache) {
      return;
    }

    this.mCache = {};
    this.mCalObservers = {};

    const allCals = {};
    for (const key of Services.prefs.getChildList(REGISTRY_BRANCH)) {
      // merge down all keys
      allCals[key.substring(0, key.indexOf(".", REGISTRY_BRANCH.length))] = true;
    }

    for (const calBranch in allCals) {
      const id = calBranch.substring(REGISTRY_BRANCH.length);
      const ctype = Services.prefs.getStringPref(calBranch + ".type", null);
      const curi = Services.prefs.getStringPref(calBranch + ".uri", null);

      try {
        if (!ctype || !curi) {
          // sanity check
          deletePrefBranch(id);
          continue;
        }

        const uri = Services.io.newURI(curi);
        const calendar = this.initializeCalendar(id, ctype, uri);
        this.setupCalendar(calendar);
      } catch (exc) {
        cal.ERROR(`Can't create calendar for ${id} (${ctype}, ${curi}): ${exc}`);
      }
    }

    let shouldResyncGoogleCalDav = false;
    if (!Services.prefs.prefHasUserValue("calendar.caldav.googleResync")) {
      // Some users' calendars got into a bad state due to Google rate-limit
      // problems so this code triggers a full resync.
      shouldResyncGoogleCalDav = true;
    }

    // do refreshing in a second step, when *all* calendars are already available
    // via getCalendars():
    for (const calendar of Object.values(this.mCache)) {
      let delay = 0;

      // The special-casing of ICS here is a very ugly hack. We can delay most
      // cached calendars without an issue, but the ICS implementation has two
      // properties which make that dangerous in its case:
      //
      // 1) ICS files can only be written whole cloth. Since it's a plain file,
      // we need to know the entire contents of what we want to write.
      //
      // 2) It is backed by a memory calendar which it regards as its source of
      // truth, and the backing calendar is only populated on a refresh.
      //
      // The combination of these two means that any update to the ICS calendar
      // before the memory calendar is populated will erase everything in the
      // calendar (except potentially the added item if that's what we're
      // doing). A 15 second window for data loss-inducing updates isn't huge,
      // but it's more than we should bet on.
      //
      // Why not fix this a different way? Trying to populate the memory
      // calendar outside of a refresh causes the caching calendar to get
      // confused about event ownership and identity, leading to bogus observer
      // notifications and potential duplication of events in some parts of the
      // interface. Having the ICS calendar refresh itself internally can cause
      // disabled calendars to behave improperly, since calendars don't actually
      // enforce their own disablement and may not know if they're disabled
      // until after we try to refresh. Having the ICS calendar ensure it has
      // refreshed itself before trying to make updates would require a fair bit
      // of refactoring in its processing queue and, while it should probably
      // happen, fingers crossed we can rework the provider architecture to make
      // many of these problems less of an issue first.
      const canDelay = calendar.getProperty("cache.enabled") && calendar.type != "ics";

      if (canDelay) {
        // If the calendar is cached, we don't need to refresh it RIGHT NOW, so let's wait a
        // while and let other things happen first.
        delay = 15000;

        if (
          shouldResyncGoogleCalDav &&
          calendar.type == "caldav" &&
          calendar.uri.prePath == "https://apidata.googleusercontent.com"
        ) {
          cal.LOG(`CalDAV: Resetting sync token of ${calendar.name} to perform a full resync`);
          const calDavCalendar = calendar.wrappedJSObject.mUncachedCalendar.wrappedJSObject;
          calDavCalendar.mWebdavSyncToken = null;
          calDavCalendar.saveCalendarProperties();
        }
      }
      setTimeout(() => maybeRefreshCalendar(calendar), delay);
    }

    if (shouldResyncGoogleCalDav) {
      // Record the fact that we've scheduled a resync, so that we only do it once.
      // Store the date instead of a boolean because we might want to use this again some day.
      Services.prefs.setIntPref("calendar.caldav.googleResync", Date.now() / 1000);
    }
  },

  getCalendarPref_(calendar, name) {
    cal.ASSERT(calendar, "Invalid Calendar!");
    cal.ASSERT(calendar.id !== null, "Calendar id needs to be set!");
    cal.ASSERT(name && name.length > 0, "Pref Name must be non-empty!");

    const branch = getPrefBranchFor(calendar.id) + name;
    let value = Preferences.get(branch, null);

    if (typeof value == "string" && value.startsWith("bignum:")) {
      const converted = Number(value.substr(7));
      if (!isNaN(converted)) {
        value = converted;
      }
    }
    return value;
  },

  setCalendarPref_(calendar, name, value) {
    cal.ASSERT(calendar, "Invalid Calendar!");
    cal.ASSERT(calendar.id !== null, "Calendar id needs to be set!");
    cal.ASSERT(name && name.length > 0, "Pref Name must be non-empty!");

    const branch = getPrefBranchFor(calendar.id) + name;

    if (
      typeof value == "number" &&
      (value > MAX_INT || value < MIN_INT || !Number.isInteger(value))
    ) {
      // This is something the preferences service can't store directly.
      // Convert to string and tag it so we know how to handle it.
      value = "bignum:" + value;
    }

    // Delete before to allow pref-type changes, then set the pref.
    Services.prefs.clearUserPref(branch);
    if (value !== null && value !== undefined) {
      Preferences.set(branch, value);
    }
  },

  deleteCalendarPref_(calendar, name) {
    cal.ASSERT(calendar, "Invalid Calendar!");
    cal.ASSERT(calendar.id !== null, "Calendar id needs to be set!");
    cal.ASSERT(name && name.length > 0, "Pref Name must be non-empty!");
    Services.prefs.clearUserPref(getPrefBranchFor(calendar.id) + name);
  },

  mObservers: null,
  addObserver(aObserver) {
    this.mObservers.add(aObserver);
  },
  removeObserver(aObserver) {
    this.mObservers.delete(aObserver);
  },
  notifyObservers(functionName, args) {
    this.mObservers.notify(functionName, args);
  },

  mCalendarObservers: null,
  addCalendarObserver(aObserver) {
    return this.mCalendarObservers.add(aObserver);
  },
  removeCalendarObserver(aObserver) {
    return this.mCalendarObservers.delete(aObserver);
  },
  notifyCalendarObservers(functionName, args) {
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

  QueryInterface: ChromeUtils.generateQI(["nsIWindowMediatorListener", "calIObserver"]),

  // calIObserver:
  onStartBatch() {
    return this.calMgr.notifyCalendarObservers("onStartBatch", arguments);
  },
  onEndBatch() {
    return this.calMgr.notifyCalendarObservers("onEndBatch", arguments);
  },
  onLoad() {
    return this.calMgr.notifyCalendarObservers("onLoad", arguments);
  },
  onAddItem() {
    return this.calMgr.notifyCalendarObservers("onAddItem", arguments);
  },
  onModifyItem() {
    return this.calMgr.notifyCalendarObservers("onModifyItem", arguments);
  },
  onDeleteItem() {
    return this.calMgr.notifyCalendarObservers("onDeleteItem", arguments);
  },
  onError(aCalendar, aErrNo, aMessage) {
    this.calMgr.notifyCalendarObservers("onError", arguments);
    this.announceError(aCalendar, aErrNo, aMessage);
  },

  onPropertyChanged(aCalendar, aName, aValue) {
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

  changeCalendarCache(aCalendar, aName, aValue, aOldValue) {
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
      const sortOrderPref = Services.prefs.getStringPref("calendar.list.sortOrder", "").split(" ");
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
      this.calMgr.removeCalendar(aCalendar, Ci.calICalendarManager.REMOVE_NO_DELETE);
      const newCal = this.calMgr.createCalendar(aCalendar.type, aCalendar.uri);
      newCal.name = aCalendar.name;

      // TODO: if properties get added this list will need to be adjusted,
      // ideally we should add a "getProperties" method to calICalendar.idl
      // to retrieve all non-transient properties for a calendar.
      const propsToCopy = [
        "color",
        "disabled",
        "forceEmailScheduling",
        "auto-enabled",
        "cache.enabled",
        "refreshInterval",
        "suppressAlarms",
        "calendar-main-in-composite",
        "calendar-main-default",
        "readOnly",
        "imip.identity.key",
        "username",
      ];
      for (const prop of propsToCopy) {
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

  onPropertyDeleting(aCalendar, aName) {
    this.onPropertyChanged(aCalendar, aName, false, true);
  },

  // Error announcer specific functions
  announceError(aCalendar, aErrNo, aMessage) {
    const paramBlock = Cc["@mozilla.org/embedcomp/dialogparam;1"].createInstance(
      Ci.nsIDialogParamBlock
    );
    let errMsg;
    paramBlock.SetNumberStrings(3);
    if (!this.storedReadOnly && this.calendar.readOnly) {
      // Major errors change the calendar to readOnly
      errMsg = lazy.l10n.formatValueSync("read-only-mode", { name: this.calendar.name });
    } else if (!this.storedReadOnly && !this.calendar.readOnly) {
      // Minor errors don't, but still tell the user something went wrong
      errMsg = lazy.l10n.formatValueSync("minor-error", { name: this.calendar.name });
    } else {
      // The calendar was already in readOnly mode, but still tell the user
      errMsg = lazy.l10n.formatValueSync("still-read-only-error", { name: this.calendar.name });
    }

    // When possible, change the error number into its name, to
    // make it slightly more readable.
    let errCode = "0x" + aErrNo.toString(16);
    const calIErrors = Ci.calIErrors;
    // Check if it is worth enumerating all the error codes.
    if (aErrNo & calIErrors.ERROR_BASE) {
      for (const err in calIErrors) {
        if (calIErrors[err] == aErrNo) {
          errCode = err;
        }
      }
    }

    let message;
    switch (aErrNo) {
      case calIErrors.CAL_UTF8_DECODING_FAILED:
        message = lazy.l10n.formatValueSync("utf8-decode-error");
        break;
      case calIErrors.ICS_MALFORMEDDATA:
        message = lazy.l10n.formatValueSync("ics-malformed-error");
        break;
      case calIErrors.MODIFICATION_FAILED:
        errMsg = lazy.l10n.formatValueSync("error-writing2", { name: aCalendar.name });
        message = lazy.l10n.formatValueSync("error-writing-details");
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
    const errorCode = lazy.l10n.formatValueSync("error-code", { errorCode: errCode });
    const errorDescription = lazy.l10n.formatValueSync("error-description", {
      errorDescription: message,
    });
    const summary = errMsg + " " + errorCode + ". " + errorDescription;

    // Log warnings in error console.
    // Report serious errors in both error console and in prompt window.
    if (aErrNo == calIErrors.MODIFICATION_FAILED) {
      console.error(summary);
      this.announceParamBlock(paramBlock);
    } else {
      cal.WARN(summary);
    }
  },

  announceParamBlock(paramBlock) {
    function awaitLoad() {
      promptWindow.addEventListener("unload", awaitUnload, { capture: false, once: true });
    }
    const awaitUnload = () => {
      // unloaded (user closed prompt window),
      // remove paramBlock and unload listener.
      try {
        // remove the message that has been shown from
        // the list of all announced messages.
        this.announcedMessages = this.announcedMessages.filter(msg => {
          return !equalMessage(msg, paramBlock);
        });
      } catch (e) {
        console.error(e);
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
    const promptUrl = "chrome://calendar/content/calendar-error-prompt.xhtml";
    const features = "chrome,dialog=yes,alwaysRaised=yes";
    const promptWindow = Services.ww.openWindow(null, promptUrl, "_blank", features, paramBlock);
    promptWindow.addEventListener("load", awaitLoad, { capture: false, once: true });
  },
};

function calDummyCalendar(type) {
  this.initProviderBase();
  this.type = type;
}
calDummyCalendar.prototype = {
  __proto__: cal.provider.BaseClass.prototype,

  getProperty(aName) {
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
 * Removes a calendar from the preferences.
 *
 * @param {string} id - ID of the calendar to remove.
 */
function deletePrefBranch(id) {
  for (const prefName of Services.prefs.getChildList(getPrefBranchFor(id))) {
    Services.prefs.clearUserPref(prefName);
  }
}

/**
 * Helper to refresh a calendar, if it can be refreshed and isn't disabled.
 *
 * @param {calICalendar} calendar - The calendar to refresh.
 */
function maybeRefreshCalendar(calendar) {
  if (!calendar.getProperty("disabled") && calendar.canRefresh) {
    const refreshInterval = calendar.getProperty("refreshInterval");
    if (refreshInterval != "0") {
      calendar.refresh();
    }
  }
}

/**
 * Wrap a calendar using {@link calCachedCalendar}, if the cache is supported and enabled.
 * Otherwise just return the passed in calendar.
 *
 * @param {calICalendar} calendar - The calendar to potentially wrap.
 * @returns {calICalendar} The potentially wrapped calendar.
 */
function maybeWrapCachedCalendar(calendar) {
  if (
    calendar.getProperty("cache.supported") !== false &&
    (calendar.getProperty("cache.enabled") || calendar.getProperty("cache.always"))
  ) {
    calendar = new calCachedCalendar(calendar);
  }
  return calendar;
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
  this.notify = function () {
    if (!aCalendar.getProperty("disabled") && aCalendar.canRefresh) {
      aCalendar.refresh();
    }
  };
}

var gCalendarManagerAddonListener = {
  onDisabling(aAddon) {
    if (!this.queryUninstallProvider(aAddon)) {
      // If the addon should not be disabled, then re-enable it.
      aAddon.userDisabled = false;
    }
  },

  onUninstalling(aAddon) {
    if (!this.queryUninstallProvider(aAddon)) {
      // If the addon should not be uninstalled, then cancel the uninstall.
      aAddon.cancelUninstall();
    }
  },

  queryUninstallProvider(aAddon) {
    const uri = "chrome://calendar/content/calendar-providerUninstall-dialog.xhtml";
    const features = "chrome,titlebar,resizable,modal";
    const affectedCalendars = cal.manager
      .getCalendars()
      .filter(calendar => calendar.providerID == aAddon.id);
    if (!affectedCalendars.length) {
      // If no calendars are affected, then everything is fine.
      return true;
    }

    const args = { shouldUninstall: false, extension: aAddon };

    // Now find a window. The best choice would be the most recent
    // addons window, otherwise the most recent calendar window, or we
    // create a new toplevel window.
    const win =
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
      const match = remain.match(/(.*?)(\\*)"/);
      idx += match[0].length;

      isEscaped = match[2].length % 2 == 0;
      if (!isEscaped) {
        remain = remain.substr(match[0].length);
      }
    }
    return authHeader.substr(0, idx - 1) + " " + appendStr + authHeader.substr(idx - 1);
  }
  return authHeader;
}
