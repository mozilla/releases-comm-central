/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * GraphCalendar class implementing calICalendar
 */
export default class GraphCalendar {
  QueryInterface = ChromeUtils.generateQI(["calICalendar"]);

  /** @type {string} */
  #id;
  /** @type {string} */
  #name;
  /** @type {nsIURI} */
  #uri;
  /** @type {boolean} */
  #readOnly;
  /** @type {boolean} */
  #transientProperties;
  /** @type {[calIObserver]} */
  #observers;

  /**
   * Constructor for GraphCalendar.
   *
   * @param {string} aUri - The URI at which the calendar is located.
   * @param {string} aId - Calendar unique identifier
   * @param {string} aName - Calendar display name
   * @param {Object} options - Calendar options
   */
  constructor(aUri, aId, aName, options) {
    this.#id = aId;
    this.#name = aName;
    this.#uri = Services.io.newURI(aUri);
    this.#readOnly = true;
    this.#transientProperties = false;

    this.#observers = [];
  }

  /**
   * Get or set the calendar id.
   * @returns {string}
   */
  get id() {
    return this.#id;
  }

  set id(value) {
    this.#id = value;
  }

  /**
   * Get or set the calendar name.
   * @returns {string}
   */
  get name() {
    return this.#name;
  }

  set name(value) {
    this.#name = value;
  }

  /**
   * Get the calendar type.
   * @returns {string}
   */
  get type() {
    return "graph";
  }

  /**
   * Get the provider ID.
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

  set superCalendar(value) {
    throw Exception(Cr.NS_ERROR_ILLEGAL_ARGUMENT);
  }

  /**
   * Get or set the calendar URI.
   * @returns {nsIURI}
   */
  get uri() {
    return this.#uri;
  }

  set uri(value) {
    this.#uri = value;
  }

  /**
   * Get or set read-only flag.
   *
   * @returns {boolean}
   */
  get readOnly() {
    return this.#readOnly;
  }

  set readOnly(value) {
    this.#readOnly = value;
  }

  /**
   * Get transient properties flag.
   *
   * @returns {boolean}
   */
  get transientProperties() {
    return this.#transientProperties;
  }

  set transientProperties(value) {
    this.#transientProperties = value;
  }

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
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get a calendar property.
   *
   * @param {string} aName - Property name
   * @returns {nsIVariant} Property value
   */
  getProperty(aName) {
    return null;
  }

  /**
   * Set a calendar property.
   *
   * @param {string} aName - Property name
   * @param {nsIVariant} aValue - Property value
   */
  setProperty(aName, aValue) {}

  /**
   * Delete a calendar property.
   *
   * @param {string} aName - Property name
   */
  deleteProperty(aName) {}

  /**
   * Add an observer.
   *
   * @param {calIObserver} observer - Observer object
   */
  addObserver(observer) {
    if (!this.#observers.includes(observer)) {
      this.#observers.push(observer);
    }
  }

  /**
   * Remove an observer.
   *
   * @param {calIObserver} observer - Observer object
   */
  removeObserver(observer) {
    const index = this.#observers.indexOf(observer);
    if (index > -1) {
      this.#observers.splice(index, 1);
    }
  }

  /**
   * Add an item to the calendar.
   *
   * @param {calIItemBase} aItem - Item to add
   * @returns {Promise<calIItemBase>}
   */
  async addItem(aItem) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Adopt an item (without cloning).
   *
   * @param {calIItemBase} aItem - Item to adopt
   * @returns {Promise<calIItemBase>}
   */
  async adoptItem(aItem) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Modify an existing item.
   *
   * @param {calIItemBase} aNewItem - New item version
   * @param {calIItemBase} aOldItem - Old item version
   * @returns {Promise<calIItemBase>}
   */
  async modifyItem(aNewItem, aOldItem) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Delete an item.
   *
   * @param {calIItemBase} aItem - Item to delete
   * @returns {Promise<void>}
   */
  async deleteItem(aItem) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get a single item by ID.
   *
   * @param {string} aId - Item UID
   * @returns {Promise<calIItemBase|null>}
   */
  async getItem(aId) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get items with filters.
   *
   * @param {number} aItemFilter - Filter flags
   * @param {number} aCount - Max items to return
   * @param {calIDateTime} aRangeStart - Range start time
   * @param {calIDateTime} aRangeEndEx - Range end time (exclusive)
   * @returns {ReadableStream<calIItemBase>}
   */
  getItems(aItemFilter, aCount, aRangeStart, aRangeEndEx) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Get items as array.
   *
   * @param {number} aItemFilter - Filter flags
   * @param {number} aCount - Max items to return
   * @param {calIDateTime} aRangeStart - Range start time
   * @param {calIDateTime} aRangeEndEx - Range end time (exclusive)
   * @returns {Promise<Array<calIItemBase>>}
   */
  async getItemsAsArray(aItemFilter, aCount, aRangeStart, aRangeEndEx) {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Refresh the calendar.
   *
   * @returns {calIOperation}
   */
  async refresh() {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * Start batch mode.
   */
  startBatch() {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  /**
   * End batch mode.
   */
  endBatch() {
    throw new Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }
}
