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
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "bufferRows",
  "mail.panorama.bufferRows",
  9
);

ChromeUtils.defineLazyGetter(
  lazy,
  "collator",
  () => new Intl.Collator(undefined, { sensitivity: "base" })
);
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
 * Represents a message in the message database. These fields are not live.
 *
 * @typedef {object} Message
 * @property {integer} id - Identifier in the messages database.
 * @property {integer} folderId - Identifier of the containing folder.
 * @property {string} messageId - The Message-ID header.
 * @property {Date} date - Value of the Date header.
 * @property {string} sender
 * @property {string} recipients
 * @property {string} subject
 * @property {integer} flags
 * @property {string} tags - A space-separated list of nsIMsgTag keys.
 */

/**
 * Adapts message data from nsILiveView for display in a TreeView.
 *
 * @augments {TreeDataAdapter}
 */
export class LiveViewDataAdapter extends TreeDataAdapter {
  constructor(liveView) {
    super();
    this._rowMap = new LiveViewRowMap(liveView, this);
  }

  /**
   * Overrides TreeDataAdapter.sortBy. If the sorting changes, LiveViewRowMap
   * will flush its cache and inform the LiveView, so messages will be fetched
   * again in the new order.
   *
   * @param {string} sortColumn
   * @param {"ascending"|"descending"} sortDirection
   * @param {boolean} [_resort=false] - If true, the rows will be sorted again,
   *   even if `sortColumn` and `sortDirection` match the current sort.
   */
  sortBy(sortColumn, sortDirection, _resort = false) {
    this._rowMap.sortBy(sortColumn, sortDirection);
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this._tree?.reset();
  }

  /**
   * Extends TreeDataAdapter.setTree so that references are cleaned up when
   * the tree changes.
   *
   * @param {TreeView} tree
   */
  setTree(tree) {
    if (!tree) {
      this._rowMap.cleanup();
      this._rowMap = null;
    }
    super.setTree(tree);
  }
}

/**
 * A map of column names to nsILiveView_SortColumn constants.
 */
const columns = {
  date: Ci.nsILiveView.DATE,
  subject: Ci.nsILiveView.SUBJECT,
  sender: Ci.nsILiveView.SENDER,
  recipients: Ci.nsILiveView.RECIPIENTS,
  unread: Ci.nsILiveView.READ_FLAG,
  flagged: Ci.nsILiveView.MARKED_FLAG,
};

/**
 * Compare two messages for ordering their rows.
 *
 * @typedef {Function} Comparator
 * @param {Message} a - A message object.
 * @param {Message} b - A message object.
 * @returns {boolean} - True if message A should be above message B.
 */

/**
 * Get a comparator that can be used to put messages in alphabetical order.
 *
 * @param {string} property - The message property to be used for ordering.
 * @returns {Comparator} - A function that accepts two messages, A and B, and
 *   returns true if message A is ahead of message B in the alphabet.
 */
function getTextComparator(property) {
  return (a, b) => lazy.collator.compare(a[property], b[property]) < 0;
}

/**
 * A map of column names to comparators for ordering.
 */
const comparators = {
  date: (a, b) => a.date < b.date,
  subject: getTextComparator("subject"),
  sender: getTextComparator("sender"),
  recipients: getTextComparator("recipients"),
  // Unread messages come first, but the flag is for read messages.
  unread: (a, b) =>
    (a.flags & Ci.nsMsgMessageFlags.Read) <
    (b.flags & Ci.nsMsgMessageFlags.Read),
  flagged: (a, b) =>
    (a.flags & Ci.nsMsgMessageFlags.Marked) >
    (b.flags & Ci.nsMsgMessageFlags.Marked),
};

/**
 * A lazily-filled collection of `LiveViewDataRow`s pretending to be an array.
 * If a row not already in the collection is requested then it and
 * `lazy.bufferRows` rows on either side are fetched from the database.
 *
 * @implements {nsILiveViewListener}
 */
class LiveViewRowMap {
  QueryInterface = ChromeUtils.generateQI(["nsILiveViewListener"]);

  #liveView = null;
  #dataAdapter = null;
  /**
   * A sparse array a slot for each message in the `LiveView`.
   */
  #rows = [];
  #sortDescending = true;
  #sortComparator = comparators.date;

  constructor(liveView, dataAdapter) {
    this.#liveView = liveView;
    this.#dataAdapter = dataAdapter;
    this.resetRows();
    liveView.setListener(this);
  }

  /**
   * Clear references and the message cache.
   */
  cleanup() {
    this.#liveView.clearListener();
    this.#liveView = null;
    this.#dataAdapter = null;
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

  /**
   * Compare two messages for ordering their rows.
   *
   * @param {Message} a - A message object.
   * @param {Message} b - A message object.
   * @returns {boolean} - True if message A should be above message B.
   */
  #compareMessages(a, b) {
    if (this.#sortDescending) {
      [a, b] = [b, a];
    }
    return this.#sortComparator(a, b);
  }

  /**
   * Flush the row cache and update the sort column and direction.
   *
   * @param {string} sortColumn
   * @param {"ascending"|"descending"} sortDirection
   */
  sortBy(sortColumn, sortDirection) {
    this.#liveView.sortColumn = columns[sortColumn] ?? columns.date;
    this.#sortDescending = this.#liveView.sortDescending =
      sortDirection == "descending";
    this.#sortComparator = comparators[sortColumn] ?? comparators.date;
    this.resetRows();
  }

  // nsILiveViewListener implementation.

  /**
   * A message matching the live view's filters was added to the database.
   *
   * @param {Message} message - The added message.
   */
  onMessageAdded(message) {
    // Iterate over the rows array looking for a place to add the message.
    // The `forEach` loop will visit only indices with values, which is fast,
    // but unfortunately we can't return early from it.
    let added = false;
    this.#rows.forEach((value, key) => {
      if (added || !value) {
        return;
      }
      if (this.#compareMessages(message, value.message)) {
        // The new message goes above i.
        if (key == 0 || this.#rows[key - 1]) {
          // The new message goes immediately above i.
          this.#rows.splice(key, 0, new LiveViewDataRow(message));
        } else {
          // The new message goes somewhere above this one, but we don't know where.
          this.#rows.splice(key, 0, undefined);
        }
        this.#dataAdapter._tree?.rowCountChanged(key, 1);
        added = true;
      }
    });
    if (!added) {
      // The new message goes after all the others.
      if (this.#rows.at(-1)) {
        // We have a last row, add another.
        this.#rows.push(new LiveViewDataRow(message));
      } else {
        this.#rows.length++;
      }
      this.#dataAdapter._tree?.rowCountChanged(this.#rows.length - 1, 1);
    }
  }

  /**
   * A message matching the live view's filters was removed from the database.
   *
   * @param {Message} message - The removed message.
   */
  onMessageRemoved(message) {
    // Iterate over the rows array looking for the message to remove.
    // The `forEach` loop will visit only indices with values, which is fast,
    // but unfortunately we can't return early from it.
    let removed = false;
    this.#rows.forEach((value, key) => {
      if (removed || !value) {
        return;
      }
      if (message.id == value.message.id) {
        // The removed message was this one.
        this.#rows.splice(key, 1);
        this.#dataAdapter._tree?.rowCountChanged(key, -1);
        removed = true;
      } else if (this.#compareMessages(message, value.message)) {
        // The removed message was above this one.
        this.#rows.splice(key - 1, 1);
        this.#dataAdapter._tree?.rowCountChanged(key - 1, -1);
        removed = true;
      }
    });
    if (!removed) {
      // The removed message was after all the others.
      this.#rows.length--;
      this.#dataAdapter._tree?.rowCountChanged(this.#rows.length, -1);
    }
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
      {
        ...message,
        date: lazy.dateFormatter.format(message.date),
        // Invert the read flag for unread messages.
        unread: !(message.flags & Ci.nsMsgMessageFlags.Read),
        flagged: !!(message.flags & Ci.nsMsgMessageFlags.Marked),
      },
      { date: message.date.valueOf() },
      ""
    );
    this.message = message;
  }

  /**
   * The actual text to display in the tree for the given column.
   *
   * @param {string} columnID
   * @returns {string}
   */
  getText(columnID) {
    return this.texts[columnID];
  }

  /**
   * The string or numeric value for the given column, to be used when
   * comparing rows for sorting.
   *
   * @param {string} columnID
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
