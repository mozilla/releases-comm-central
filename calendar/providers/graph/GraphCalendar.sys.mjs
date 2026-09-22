/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";
import { CalEvent } from "resource:///modules/CalEvent.sys.mjs";
import { GraphProvider } from "./GraphProvider.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "calendar",
    maxLogLevel: "Warn",
    maxLogLevelPref: "calendar.loglevel",
  });
});

/**
 * GraphCalendar class implementing calICalendar
 */
export class GraphCalendar extends cal.provider.BaseClass {
  QueryInterface = ChromeUtils.generateQI(["calICalendar", "IGraphCalendar"]);

  /**
   * @type {calICalendar}
   */
  #memoryCalendar;

  /**
   * @type {GraphCalendarObserver}
   */
  #observer;

  /**
   * @type {calIOperation | null}
   */
  #syncOperation;

  /**
   * @type {string}
   */
  syncStateToken;

  /**
   * Constructor for GraphCalendar.
   */
  constructor() {
    super();
    this.initProviderBase();
    this.#memoryCalendar = null;
    this.#observer = null;
    this.#syncOperation = null;
    this.syncStateToken = "";

    // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2058691
    // We use a transient memory calendar because we're just retrieving the full
    // list of calendar events. When we move to updating persistent storage,
    // we'll want something persistent here.
    this.resetMemoryCalendar();
  }

  resetMemoryCalendar() {
    this.#memoryCalendar = Cc["@mozilla.org/calendar/calendar;1?type=memory"].createInstance(
      Ci.calICalendar
    );

    this.#memoryCalendar.superCalendar = this;
    this.#observer = new GraphCalendarObserver(this);
    this.#memoryCalendar.addObserver(this.#observer); // XXX Not removed
  }

  get memoryCalendar() {
    return this.#memoryCalendar;
  }

  get username() {
    return this.getProperty("username");
  }

  set username(username) {
    this.setProperty("username", username);
  }

  get location() {
    return this.getProperty("location");
  }

  set location(location) {
    this.setProperty("location", location);
  }

  /**
   * Get the calendar type.
   *
   * @returns {string}
   */
  get type() {
    return "graph";
  }

  /**
   * Get the provider ID.
   *
   * @returns {string}
   */
  get providerID() {
    return null;
  }

  /**
   * Get the super calendar.
   *
   * @returns {calICalendar}
   */
  get superCalendar() {
    return this;
  }

  set superCalendar(_value) {}

  /**
   * Get whether refresh is supported.
   *
   * @returns {boolean}
   */
  get canRefresh() {
    return true;
  }

  /**
   * Get scheduling support.
   *
   * @returns {boolean}
   */
  get supportsScheduling() {
    return false;
  }

  /**
   * Get scheduling support object.
   *
   * @returns {calISchedulingSupport}
   */
  getSchedulingSupport() {
    throw new Components.Exception("getSchedulingSupport", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Add an item to the calendar.
   *
   * @param {calIItemBase} _item - Item to add
   * @returns {Promise<calIItemBase>}
   */
  async addItem(_item) {
    throw new Components.Exception("addItem", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Adopt an item (without cloning).
   *
   * @param {calIItemBase} _item - Item to adopt
   * @returns {Promise<calIItemBase>}
   */
  async adoptItem(_item) {
    throw new Components.Exception("adoptItem", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Modify an existing item.
   *
   * @param {calIItemBase} _newItem - New item version
   * @param {calIItemBase} _oldItem - Old item version
   * @returns {Promise<calIItemBase>}
   */
  async modifyItem(_newItem, _oldItem) {
    throw new Components.Exception("modifyItem", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Delete an item.
   *
   * @param {calIItemBase} _item - Item to delete
   * @returns {Promise<void>}
   */
  async deleteItem(_item) {
    throw new Components.Exception("deleteItem", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get a single item by ID.
   *
   * @param {string} _id - Item UID
   * @returns {Promise<calIItemBase|null>}
   */
  async getItem(_id) {
    throw new Components.Exception("getItem", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get items with filters.
   *
   * @param {number} itemFilter - Filter flags
   * @param {number} count - Max items to return
   * @param {calIDateTime} rangeStart - Range start time
   * @param {calIDateTime} rangeEnd - Range end time (exclusive)
   * @returns {ReadableStream<calIItemBase>}
   */
  getItems(itemFilter, count, rangeStart, rangeEnd) {
    return this.#memoryCalendar.getItems(itemFilter, count, rangeStart, rangeEnd);
  }

  /**
   * Get items as array.
   *
   * @param {number} itemFilter - Filter flags
   * @param {number} count - Max items to return
   * @param {calIDateTime} rangeStart - Range start time
   * @param {calIDateTime} rangeEndEx - Range end time (exclusive)
   * @returns {Promise<Array<calIItemBase>>}
   */
  async getItemsAsArray(itemFilter, count, rangeStart, rangeEndEx) {
    return this.#memoryCalendar.getItemsAsArray(itemFilter, count, rangeStart, rangeEndEx);
  }

  /**
   * Refresh the calendar.
   *
   * @returns {calIOperation}
   */
  refresh() {
    if (this.#syncOperation?.isPending) {
      return this.#syncOperation;
    }

    // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2052326 We're
    // currently using a transient client per refresh, but when we start sharing
    // clients to unify error handling and connection throttling, we'll need to
    // obtain a reference to a shared client here.
    const client = GraphProvider.getAndInitializeClient(
      this.username,
      this.location
    ).graphCalendarClient;
    const listener = new EventSyncListener(this, client);
    this.#syncOperation = listener;
    this.startBatch();

    try {
      client.syncCalendarEvents(this.id, listener, this.syncStateToken);
    } catch (error) {
      listener.onComplete(error?.result ?? Cr.NS_ERROR_FAILURE);
    }
    return listener;
  }

  /**
   * Notify this calendar that a refresh has completed.
   *
   * @param {number} status - A Components.results result
   * @param {*} errorDetail - Error information to pass to
   *   `notifyOperationComplete`
   */
  notifyRefreshComplete(status, errorDetail) {
    this.#syncOperation = null;
    this.notifyOperationComplete(null, status, Ci.calIOperationListener.GET, null, errorDetail);
    this.#observer.onLoad(this);
  }
}

class EventSyncListener extends cal.data.OperationGroup {
  QueryInterface = ChromeUtils.generateQI(["IGraphCalendarEventListener", "calIOperation"]);

  #calendar = null;
  #client = null;

  /**
   * Resolves after all the queued changes for this sync have finished.
   *
   * @type {Promise<void>}
   */
  #pendingChanges = Promise.resolve();

  /**
   * Stores the first error encountered as #pendingChanges apply. Once set,
   * prevents further changes from attempting.
   */
  #pendingError = null;

  /**
   * The sync state token from this sync. This isn't committed back to the
   * calendar until the local operations have all succeeded.
   *
   * @type {string | null}
   */
  #nextSyncStateToken = null;

  constructor(calendar, client) {
    super();
    this.#calendar = calendar;
    this.#client = client;
  }

  #queueChange(callback) {
    this.#pendingChanges = this.#pendingChanges.then(async () => {
      if (this.#pendingError) {
        return;
      }

      try {
        await callback();
      } catch (error) {
        this.#pendingError = error;
      }
    });
  }

  onEventPresent(id, title, startDateTime, endDateTime) {
    this.#queueChange(async () => {
      const oldEvent = await this.#calendar.memoryCalendar.getItem(id);
      const newEvent = oldEvent?.clone() ?? new CalEvent();
      newEvent.id = id;
      newEvent.title = title;
      // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2058697
      // Right now, we're assuming all times coming from Graph are UTC.
      // We need to handle different time zone specifications coming from graph
      newEvent.startDate = cal.dtz.fromRFC3339(startDateTime, cal.dtz.UTC);
      newEvent.endDate = cal.dtz.fromRFC3339(endDateTime, cal.dtz.UTC);

      if (oldEvent) {
        await this.#calendar.memoryCalendar.modifyItem(newEvent, oldEvent);
      } else {
        await this.#calendar.memoryCalendar.addItem(newEvent);
      }
    });
  }

  onEventDeleted(id) {
    this.#queueChange(async () => {
      const eventToDelete = await this.#calendar.memoryCalendar.getItem(id);
      if (eventToDelete) {
        await this.#calendar.memoryCalendar.deleteItem(eventToDelete);
      }
      // No else/error case, to be more lenient with items deleted in prior
      // partially successful syncs that are being retried.
    });
  }

  onSyncStateTokenChanged(syncStateToken) {
    this.#nextSyncStateToken = syncStateToken;
  }

  onComplete(status) {
    // Do the pending work in an async context.
    void this.#finish(status).catch(error => {
      lazy.log.error("Unexpected rejection from Graph sync #finish", error);
    });
  }

  async #finish(status) {
    let finalStatus = status;
    let errorDetail = null;

    if (!Components.isSuccessCode(status) && !this.#pendingError) {
      this.#pendingError = { result: status, message: "protocol handler encountered an error" };
    }

    try {
      await this.#pendingChanges;
      if (this.#pendingError) {
        throw this.#pendingError;
      }

      if (Components.isSuccessCode(status)) {
        if (!this.#nextSyncStateToken) {
          throw new Components.Exception(
            "Successful delta sync without a delta link",
            Cr.NS_ERROR_UNEXPECTED
          );
        }
        this.#calendar.syncStateToken = this.#nextSyncStateToken;
      }
    } catch (error) {
      finalStatus = error.result || Cr.NS_ERROR_FAILURE;
      errorDetail = error;
    }

    this.#calendar.endBatch();
    this.notifyCompleted(finalStatus);

    try {
      this.#client.QueryInterface(Ci.IExchangeClient).shutdown();
    } catch (error) {
      lazy.log.error("Failed to shut down Graph calendar client", error);
    }

    try {
      this.#calendar.notifyRefreshComplete(finalStatus, errorDetail);
    } catch (error) {
      lazy.log.error("Failed to notify Graph refresh listener", error);
    }
  }

  cancel(_status) {
    // No-op; the Rust implementation doesn't currently support cancellation.
  }
}

/**
 * @implements {calIObserver}
 */
class GraphCalendarObserver {
  #calendar = null;

  constructor(calendar) {
    this.#calendar = calendar;
  }

  onStartBatch(aCalendar) {
    this.#calendar.observers.notify("onStartBatch", [aCalendar]);
  }

  onEndBatch(aCalendar) {
    this.#calendar.observers.notify("onEndBatch", [aCalendar]);
  }

  onLoad(aCalendar) {
    this.#calendar.observers.notify("onLoad", [aCalendar]);
  }

  onAddItem(aItem) {
    this.#calendar.observers.notify("onAddItem", [aItem]);
  }

  onModifyItem(aNewItem, aOldItem) {
    this.#calendar.observers.notify("onModifyItem", [aNewItem, aOldItem]);
  }

  onDeleteItem(aDeletedItem) {
    this.#calendar.observers.notify("onDeleteItem", [aDeletedItem]);
  }

  onError(_aCalendar, aErrNo, aMessage) {
    this.#calendar.readOnly = true;
    this.#calendar.notifyError(aErrNo, aMessage);
  }

  onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
    this.#calendar.observers.notify("onPropertyChanged", [aCalendar, aName, aValue, aOldValue]);
  }

  onPropertyDeleting(aCalendar, aName) {
    this.#calendar.observers.notify("onPropertyDeleting", [aCalendar, aName]);
  }
}
