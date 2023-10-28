/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CryptoWrapper } from "resource://services-sync/record.sys.mjs";
import {
  Store,
  SyncEngine,
  Tracker,
} from "resource://services-sync/engines.sys.mjs";
import { Utils } from "resource://services-sync/util.sys.mjs";

import { SCORE_INCREMENT_XLARGE } from "resource://services-sync/constants.sys.mjs";
import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const SYNCED_PROPERTIES = {
  cacheEnabled: "cache.enabled",
  color: "color",
  displayed: "calendar-main-in-composite",
  disabled: "disabled",
  forceEmailScheduling: "forceEmailScheduling",
  // imipIdentityKey: "imip.identity.key",
  readOnly: "readOnly",
  refreshInterval: "refreshInterval",
  sessionId: "sessionId",
  suppressAlarms: "suppressAlarms",
  username: "username",
};

function shouldSyncCalendar(calendar) {
  if (calendar.type == "caldav") {
    return true;
  }
  if (calendar.type == "ics") {
    return calendar.uri.schemeIs("http") || calendar.uri.schemeIs("https");
  }
  return false;
}

/**
 * CalendarRecord represents the state of an add-on in an application.
 *
 * Each add-on has its own record for each application ID it is installed
 * on.
 *
 * The ID of add-on records is a randomly-generated GUID. It is random instead
 * of deterministic so the URIs of the records cannot be guessed and so
 * compromised server credentials won't result in disclosure of the specific
 * add-ons present in a Sync account.
 *
 * The record contains the following fields:
 *
 */
export function CalendarRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}

CalendarRecord.prototype = {
  __proto__: CryptoWrapper.prototype,
  _logName: "Record.Calendar",
};
Utils.deferGetSet(CalendarRecord, "cleartext", [
  "name",
  "type",
  "uri",
  "prefs",
]);

export function CalendarsEngine(service) {
  SyncEngine.call(this, "Calendars", service);
}

CalendarsEngine.prototype = {
  __proto__: SyncEngine.prototype,
  _storeObj: CalendarStore,
  _trackerObj: CalendarTracker,
  _recordObj: CalendarRecord,
  version: 1,
  syncPriority: 6,

  /*
   * Returns a changeset for this sync. Engine implementations can override this
   * method to bypass the tracker for certain or all changed items.
   */
  async getChangedIDs() {
    return this._tracker.getChangedIDs();
  },
};

function CalendarStore(name, engine) {
  Store.call(this, name, engine);
}
CalendarStore.prototype = {
  __proto__: Store.prototype,

  /**
   * Create an item in the store from a record.
   *
   * This is called by the default implementation of applyIncoming(). If using
   * applyIncomingBatch(), this won't be called unless your store calls it.
   *
   * @param record
   *        The store record to create an item from
   */
  async create(record) {
    if (!["caldav", "ics"].includes(record.type)) {
      return;
    }

    const calendar = cal.manager.createCalendar(
      record.type,
      Services.io.newURI(record.uri)
    );
    calendar.name = record.name;

    for (const [key, realKey] of Object.entries(SYNCED_PROPERTIES)) {
      if (key in record.prefs) {
        calendar.setProperty(realKey, record.prefs[key]);
      }
    }

    // Set this *after* the properties so it can pick up the session ID or username.
    calendar.id = record.id;
    cal.manager.registerCalendar(calendar);
    if (!calendar.getProperty("disabled")) {
      calendar.refresh();
    }
  },

  /**
   * Remove an item in the store from a record.
   *
   * This is called by the default implementation of applyIncoming(). If using
   * applyIncomingBatch(), this won't be called unless your store calls it.
   *
   * @param record
   *        The store record to delete an item from
   */
  async remove(record) {
    const calendar = cal.manager.getCalendarById(record.id);
    if (!calendar) {
      this._log.trace("Asked to remove record that doesn't exist, ignoring");
      return;
    }
    cal.manager.removeCalendar(calendar);
  },

  /**
   * Update an item from a record.
   *
   * This is called by the default implementation of applyIncoming(). If using
   * applyIncomingBatch(), this won't be called unless your store calls it.
   *
   * @param record
   *        The record to use to update an item from
   */
  async update(record) {
    const calendar = cal.manager.getCalendarById(record.id);
    if (!calendar) {
      this._log.trace("Skipping update for unknown item: " + record.id);
      return;
    }
    if (calendar.type != record.type) {
      throw new Components.Exception(
        `Refusing to change calendar type from ${calendar.type} to ${record.type}`,
        Cr.NS_ERROR_FAILURE
      );
    }
    if (calendar.getProperty("cache.enabled") != record.prefs.cacheEnabled) {
      throw new Components.Exception(
        `Refusing to change the cache setting`,
        Cr.NS_ERROR_FAILURE
      );
    }

    calendar.name = record.name;
    if (calendar.uri.spec != record.uri) {
      calendar.uri = Services.io.newURI(record.uri); // Should this be allowed?
    }
    for (const [key, realKey] of Object.entries(SYNCED_PROPERTIES)) {
      if (key in record.prefs) {
        calendar.setProperty(realKey, record.prefs[key]);
      } else if (calendar.getProperty(key)) {
        // Only delete properties if they exist. Otherwise bad things happen.
        calendar.deleteProperty(realKey);
      }
    }
  },

  /**
   * Determine whether a record with the specified ID exists.
   *
   * Takes a string record ID and returns a booleans saying whether the record
   * exists.
   *
   * @param  id
   *         string record ID
   * @return boolean indicating whether record exists locally
   */
  async itemExists(id) {
    return id in (await this.getAllIDs());
  },

  /**
   * Obtain the set of all known record IDs.
   *
   * @return Object with ID strings as keys and values of true. The values
   *         are ignored.
   */
  async getAllIDs() {
    const ids = {};
    for (const c of cal.manager.getCalendars()) {
      if (shouldSyncCalendar(c)) {
        ids[c.id] = true;
      }
    }
    return ids;
  },

  /**
   * Create a record from the specified ID.
   *
   * If the ID is known, the record should be populated with metadata from
   * the store. If the ID is not known, the record should be created with the
   * delete field set to true.
   *
   * @param  id
   *         string record ID
   * @param  collection
   *         Collection to add record to. This is typically passed into the
   *         constructor for the newly-created record.
   * @return record type for this engine
   */
  async createRecord(id, collection) {
    const record = new CalendarRecord(collection, id);

    const calendar = cal.manager.getCalendarById(id);

    // If we don't know about this ID, mark the record as deleted.
    if (!calendar) {
      record.deleted = true;
      return record;
    }

    record.name = calendar.name;
    record.type = calendar.type;
    record.uri = calendar.uri.spec;
    record.prefs = {};

    for (const [key, realKey] of Object.entries(SYNCED_PROPERTIES)) {
      const value = calendar.getProperty(realKey);
      if (value !== null) {
        record.prefs[key] = value;
      }
    }

    return record;
  },
};

function CalendarTracker(name, engine) {
  Tracker.call(this, name, engine);
}
CalendarTracker.prototype = {
  __proto__: Tracker.prototype,

  QueryInterface: cal.generateQI([
    "calICalendarManagerObserver",
    "nsIObserver",
  ]),

  _changedIDs: new Set(),
  _ignoreAll: false,

  async getChangedIDs() {
    const changes = {};
    for (const id of this._changedIDs) {
      changes[id] = 0;
    }
    return changes;
  },

  clearChangedIDs() {
    this._changedIDs.clear();
  },

  get ignoreAll() {
    return this._ignoreAll;
  },

  set ignoreAll(value) {
    this._ignoreAll = value;
  },

  onStart() {
    Services.prefs.addObserver("calendar.registry.", this);
    cal.manager.addObserver(this);
  },

  onStop() {
    Services.prefs.removeObserver("calendar.registry.", this);
    cal.manager.removeObserver(this);
  },

  observe(subject, topic, data) {
    if (this._ignoreAll) {
      return;
    }

    const id = data.split(".")[2];
    const prefName = data.substring(id.length + 19);
    if (
      prefName != "name" &&
      !Object.values(SYNCED_PROPERTIES).includes(prefName)
    ) {
      return;
    }

    const calendar = cal.manager.getCalendarById(id);
    if (calendar && shouldSyncCalendar(calendar) && !this._changedIDs.has(id)) {
      this._changedIDs.add(id);
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },

  onCalendarRegistered(calendar) {
    if (this._ignoreAll) {
      return;
    }

    if (shouldSyncCalendar(calendar)) {
      this._changedIDs.add(calendar.id);
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },
  onCalendarUnregistering(calendar) {},
  onCalendarDeleting(calendar) {
    if (this._ignoreAll) {
      return;
    }

    if (shouldSyncCalendar(calendar)) {
      this._changedIDs.add(calendar.id);
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },
};
