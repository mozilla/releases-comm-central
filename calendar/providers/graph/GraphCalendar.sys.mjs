/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * GraphCalendar class implementing calICalendar
 */
export class GraphCalendar extends cal.provider.BaseClass {
  QueryInterface = ChromeUtils.generateQI(["calICalendar"]);

  /**
   * Constructor for GraphCalendar.
   */
  constructor() {
    super();
    this.initProviderBase();
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
    return false;
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
   * @param {number} _itemFilter - Filter flags
   * @param {number} _count - Max items to return
   * @param {calIDateTime} _rangeStart - Range start time
   * @param {calIDateTime} _rangeEnd - Range end time (exclusive)
   * @returns {ReadableStream<calIItemBase>}
   */
  getItems(_itemFilter, _count, _rangeStart, _rangeEnd) {
    throw new Components.Exception("getItems", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get items as array.
   *
   * @param {number} _itemFilter - Filter flags
   * @param {number} _count - Max items to return
   * @param {calIDateTime} _rangeStart - Range start time
   * @param {calIDateTime} _rangeEndEx - Range end time (exclusive)
   * @returns {Promise<Array<calIItemBase>>}
   */
  async getItemsAsArray(_itemFilter, _count, _rangeStart, _rangeEndEx) {
    throw new Components.Exception("getItemsAsArray", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Refresh the calendar.
   *
   * @returns {calIOperation}
   */
  async refresh() {}

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
