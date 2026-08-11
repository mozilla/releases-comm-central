/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";
import { CalEvent } from "resource:///modules/CalEvent.sys.mjs";
import { GraphProvider } from "./GraphProvider.sys.mjs";

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
   * Constructor for GraphCalendar.
   */
  constructor() {
    super();
    this.initProviderBase();
    this.#memoryCalendar = null;
    this.#observer = null;

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

  set superCalendar(value) {}

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
    // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2052326 We're
    // currently using a transient client per refresh, but when we start sharing
    // clients to unify error handling and connection throttling, we'll need to
    // obtain a reference to a shared client here.
    const client = GraphProvider.getAndInitializeClient(
      this.username,
      this.location
    ).graphCalendarClient;
    const listener = new EventSyncListener(this, client);
    client.syncCalendarEvents(this.id, listener);
    this.#observer.onLoad(this);
    return listener;
  }

  /**
   * Start batch mode.
   */
  startBatch() {
    throw new Components.Exception("startBatch", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * End batch mode.
   */
  endBatch() {
    throw new Components.Exception("endBatch", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }
}

class EventSyncListener {
  QueryInterface = ChromeUtils.generateQI(["IGraphCalendarEventListener", "calIOperation"]);

  #calendar = null;
  #client = null;
  #isPending = true;
  #status = Cr.NS_ERROR_UNEXPECTED;

  constructor(calendar, client) {
    this.#calendar = calendar;
    this.#client = client;
    this.#isPending = true;
  }

  onEventPresent(id, title, startDateTime, endDateTime) {
    const newEvent = new CalEvent();
    newEvent.id = id;
    newEvent.title = title;
    // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2058697
    // Right now, we're assuming all times coming from Graph are UTC.
    // We need to handle different time zone specifications coming from graph
    newEvent.startDate = cal.dtz.fromRFC3339(startDateTime, cal.dtz.UTC);
    newEvent.endDate = cal.dtz.fromRFC3339(endDateTime, cal.dtz.UTC);
    this.#calendar.memoryCalendar.addItem(newEvent);
    this.#calendar.notifyOperationComplete(
      null,
      Cr.NS_OK,
      Ci.calIOperationListener.ADD,
      null,
      null
    );
  }

  onComplete(status) {
    this.#calendar.notifyOperationComplete(null, status, Ci.calIOperationListener.ADD, null, null);
    const exchangeClient = this.#client.QueryInterface(Ci.IExchangeClient);
    exchangeClient.shutdown();
    this.#status = status;
    this.#isPending = false;
  }

  get id() {
    return "fixme";
  }

  get isPending() {
    return this.#isPending;
  }

  get status() {
    return this.#status;
  }

  cancel(_status) {
    // No-op;
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

  onError(aCalendar, aErrNo, aMessage) {
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
