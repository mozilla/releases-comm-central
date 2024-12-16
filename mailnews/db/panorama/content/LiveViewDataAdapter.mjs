/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";

const lazy = {};
/**
 * When getting a row from the database, also get (at most) this many rows
 * before and after it. Override this to get more or fewer rows for testing.
 *
 * TODO: Raise this number before release.
 */
XPCOMUtils.defineLazyPreferenceGetter(lazy, "bufferRows", "mail.bufferRows", 9);

ChromeUtils.defineLazyGetter(
  lazy,
  "dateFormatter",
  () =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
      hourCycle: "h23",
    })
);

/**
 * Adapts message data from nsILiveView for display in a TreeView.
 *
 * @augments {TreeDataAdapter}
 */
export class LiveViewDataAdapter extends TreeDataAdapter {
  constructor(liveView) {
    super();
    this._rowMap = new LiveViewRowMap(liveView);
  }

  setTree(tree) {
    if (!tree) {
      this._rowMap.cleanup();
      this._rowMap = null;
    }
    super.setTree(tree);
  }
}

/**
 * A lazily-filled collection of `LiveViewDataRow`s pretending to be an array.
 * If a row not already in the collection is requested then it and
 * `lazy.bufferRows` rows on either side are fetched from the database.
 */
class LiveViewRowMap {
  QueryInterface = ChromeUtils.generateQI(["nsILiveViewListener"]);

  #liveView = null;
  /**
   * A sparse array a slot for each message in the `LiveView`.
   */
  #rows = [];

  constructor(liveView) {
    this.#liveView = liveView;
    this.resetRows();
  }

  /**
   * Clear references and the message cache.
   */
  cleanup() {
    this.#liveView = null;
    this.#rows.length = 0;
  }

  /**
   * Empty the row cache then set its size to the row count.
   */
  resetRows() {
    this.#rows.length = 0;
    this.#rows.length = this.#liveView.countMessages();
  }

  /**
   * Get a row from the cache, or call the LiveView to get some messages for
   * the cache, then return the row.
   *
   * @param {integer} index
   * @returns {LiveViewDataRow}
   */
  at(index) {
    const row = this.#rows.at(index);
    if (row) {
      return row;
    }

    // Work out which rows to collect from the database.
    const fillMin = Math.max(0, index - lazy.bufferRows);
    const fillMax = Math.min(this.#rows.length - 1, index + lazy.bufferRows);
    let start = index;
    while (start > fillMin && !this.#rows.at(start - 1)) {
      start--;
    }
    let end = index;
    while (end < fillMax && !this.#rows.at(end)) {
      end++;
    }

    // Fetch the rows.
    for (const message of this.#liveView.selectMessages(
      end - start + 1,
      start
    )) {
      this.#rows[start++] = new LiveViewDataRow(message);
    }

    return this.#rows.at(index);
  }

  /**
   * The number of rows in the LiveView.
   *
   * @returns {integer}
   */
  get length() {
    return this.#rows.length;
  }

  /**
   * If there is a cached row at `index`. For testing purposes only.
   *
   * @param {integer} index
   * @returns {boolean}
   */
  _hasMessageAt(index) {
    return !!this.#rows.at(index);
  }
}

/**
 * A class representing a row in a TreeView.
 *
 * @augments {TreeDataRow}
 */
export class LiveViewDataRow extends TreeDataRow {
  constructor(message) {
    super(
      { ...message, date: lazy.dateFormatter.format(message.date) },
      { date: message.date.valueOf() },
      ""
    );
    this.message = message;
  }

  /**
   * The actual text to display in the tree for the given column.
   *
   * @param {columnID} columnID
   * @returns {string}
   */
  getText(columnID) {
    return this.texts[columnID];
  }

  /**
   * The string or numeric value for the given column, to be used when
   * comparing rows for sorting.
   *
   * @param {columnID} columnID
   * @returns {string|number}
   */
  getValue(columnID) {
    return this.values[columnID];
  }

  /**
   * Properties of the row. Usually a space-separated list that gets assigned
   * to an element's attribute and matched with CSS selectors.
   *
   * @returns {string}
   */
  getProperties() {
    return this.properties;
  }

  /**
   * Overrides TreeDataRow.appendRow to prevent it working.
   */
  appendRow() {
    throw new Error("LiveViewDataRow.appendRow is not supported");
  }
}
