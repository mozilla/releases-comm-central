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
ChromeUtils.defineLazyGetter(lazy, "dateGroupLabels", () => {
  // FIXME: We don't have a way to pass L10n IDs to the tree-view widget.
  const l10n = new Localization(["messenger/messenger.ftl"], true);
  return {
    [Ci.nsILiveView.DATE_GROUP_FUTURE]: l10n.formatValueSync(
      "message-group-future-date"
    ),
    [Ci.nsILiveView.DATE_GROUP_TODAY]: l10n.formatValueSync(
      "message-group-today"
    ),
    [Ci.nsILiveView.DATE_GROUP_YESTERDAY]: l10n.formatValueSync(
      "message-group-yesterday"
    ),
    [Ci.nsILiveView.DATE_GROUP_LAST_SEVEN_DAYS]: l10n.formatValueSync(
      "message-group-last-seven-days"
    ),
    [Ci.nsILiveView.DATE_GROUP_LAST_FOURTEEN_DAYS]: l10n.formatValueSync(
      "message-group-last-fourteen-days"
    ),
  };
});
ChromeUtils.defineLazyGetter(
  lazy,
  "yearFormatter",
  () => new Intl.DateTimeFormat(undefined, { year: "numeric" })
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
 * Adapts message data from nsILiveView for display in a TreeView. This class
 * lists messages as a flat list.
 *
 * @augments {TreeDataAdapter}
 */
export class LiveViewDataAdapter extends TreeDataAdapter {
  /**
   * @param {nsILiveView} liveView
   * @param {nsILiveView_Grouping} [grouping=Ci.nsILiveView.UNTHREADED] -
   *   set to Ci.nsILiveView.THREADED for one row only per thread.
   */
  constructor(liveView, grouping = Ci.nsILiveView.UNTHREADED) {
    super();
    liveView.grouping = grouping;
    this._rowMap = new LiveViewRowMap(liveView, this);
  }

  /**
   * The number of visible rows. Overrides TreeDataAdapter because _rowMap is
   * overridden.
   *
   * @returns {integer}
   */
  get rowCount() {
    return this._rowMap.length;
  }

  /**
   * Get the row at a given row index, accounting for open rows. Overrides
   * TreeDataAdapter because _rowMap is overridden.
   *
   * @param {number} rowIndex - A non-negative integer.
   * @returns {?TreeDataRow}
   */
  rowAt(rowIndex) {
    return this._rowMap.rowAt(rowIndex);
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
    if (!(sortColumn in columns)) {
      sortColumn = "date";
    }
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

  /**
   * @param {nsILiveView} liveView
   * @param {LiveViewDataAdapter} dataAdapter
   */
  constructor(liveView, dataAdapter) {
    this.#liveView = liveView;
    this.#dataAdapter = dataAdapter;
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
  async resetRows() {
    const oldLength = this.#rows.length;
    this.#rows.length = 0;
    this.#dataAdapter._clearFlatRowCache();
    this.#dataAdapter._tree?.rowCountChanged(0, -oldLength);
    this.#rows.length = await this.#liveView.countMessages();
    this.#dataAdapter._clearFlatRowCache();
    this.#dataAdapter._tree?.rowCountChanged(0, this.#rows.length);
  }

  /**
   * Get a row from the cache, or call the LiveView to get some messages for
   * the cache, then return the row.
   *
   * @param {number} index - A non-negative integer.
   * @returns {LiveViewDataRow}
   */
  rowAt(index) {
    if (index in this.#rows) {
      return this.#rows[index];
    }

    // Work out which rows to collect from the database.
    const fillMin = Math.max(0, index - lazy.bufferRows);
    const fillMax = Math.min(this.#rows.length - 1, index + lazy.bufferRows);
    let start = index;
    while (start > fillMin && !this.#rows[start - 1]) {
      start--;
    }
    let end = index;
    while (end < fillMax && !this.#rows[end]) {
      end++;
    }

    // Temporarily add empty rows, so that we don't accidentally end up here
    // again while fetching from the database.
    for (let i = start; i <= end; i++) {
      this.#rows[i] = new TreeDataRow();
    }

    // Fetch the rows. Do not await this call, we must return synchronously.
    this.#liveView.selectMessages(end - start + 1, start).then(messages => {
      if (!this.#dataAdapter) {
        // This dataAdapter expired while waiting.
        return;
      }
      let i = start;
      for (const message of messages) {
        this.#rows[i++] = new LiveViewDataRow(message);
      }
      this.#dataAdapter._tree?.invalidateRange(start, end);
    });

    return this.#rows[index];
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
    if (!(sortColumn in columns)) {
      sortColumn = "date";
    }
    this.#liveView.sortColumn = columns[sortColumn];
    this.#sortDescending = this.#liveView.sortDescending =
      sortDirection == "descending";
    this.#sortComparator = comparators[sortColumn];
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
 * Adapts message data from nsILiveView for display in a TreeView. This class
 * is like LiveViewDataAdapter but lists conversations instead of messages.
 * It's also like LiveViewThreadedDataAdapter but without the option to expand
 * thread rows.
 *
 * @augments {LiveViewDataAdapter}
 */
export class LiveViewConversationsDataAdapter extends LiveViewDataAdapter {
  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super(liveView, Ci.nsILiveView.THREADED);
  }
}

/**
 * Adapts message data from nsILiveView for display in a TreeView. This class
 * lists messages grouped by thread. Threads are lazily loaded when the root
 * message is expanded.
 *
 * @augments {TreeDataAdapter}
 */
export class LiveViewThreadedDataAdapter extends TreeDataAdapter {
  #liveView;

  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super();
    this.#liveView = liveView;
    liveView.grouping = Ci.nsILiveView.THREADED;
  }

  async #getTopLevelRows() {
    const lengthBefore = this.rowCount;
    this._rowMap.length = 0;
    if (lengthBefore) {
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(0, -lengthBefore);
    }

    const conversations = await this.#liveView.selectMessages();
    const callback = async () => {
      let y = 0;
      for (const conversation of conversations) {
        const row = new LiveViewDataRow(conversation);
        row.liveView = this.#liveView;
        row.threadId = conversation.threadId;
        row.children.length = conversation.messageCount - 1;
        this._rowMap.push(row);
        if (globalThis.scheduler && ++y == 250) {
          // Yield the main thread to maintain responsiveness. But not too often.
          y = 0;
          await globalThis.scheduler.yield();
        }
      }
    };
    if (globalThis.scheduler) {
      await globalThis.scheduler.postTask(callback, {
        priority: "user-blocking",
      });
    } else {
      // This is an XPCShell test.
      await callback();
    }

    this._clearFlatRowCache();
    this._tree?.rowCountChanged(0, this.rowCount);
  }

  sortBy(sortColumn, sortDirection, _resort = false) {
    if (!(sortColumn in columns)) {
      sortColumn = "date";
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.#liveView.sortColumn = columns[sortColumn];
    this.#liveView.sortDescending = sortDirection == "descending";
    this.#getTopLevelRows();
  }
}

/**
 * A class representing a row in a TreeView.
 *
 * @augments {TreeDataRow}
 */
class LiveViewDataRow extends TreeDataRow {
  /**
   * The message to display when this row is open. Only available after
   * `ensureChildren` has fetched the child messages.
   *
   * @type {Message}
   */
  #openMessage;

  /**
   * The message to display when this row is closed. Only available after
   * `ensureChildren` has fetched the child messages.
   *
   * @type {Message}
   */
  #closedMessage;

  /**
   * @param {Message} message
   */
  constructor(message) {
    super();
    this.#initFromMessage(message);
  }

  /**
   * Set up this row based on the values from `message`.
   *
   * @param {Message} message
   */
  #initFromMessage(message) {
    this.texts = {
      ...message,
      date: lazy.dateFormatter.format(message.date),
      // Invert the read flag for unread messages.
      unread: !(message.flags & Ci.nsMsgMessageFlags.Read),
      flagged: !!(message.flags & Ci.nsMsgMessageFlags.Marked),
    };
    this.values = { date: message.date.valueOf() };
    this.message = message;
  }

  /**
   * Trigger loading of the child rows – it is an async function but you
   * should not wait for it. This is called before `open` is set.
   *
   * @param {TreeDataAdapter} dataAdapter - The adapter this row belongs to.
   * @param {number} rootIndex - The current index of this row in the view.
   */
  async ensureChildren(dataAdapter, rootIndex) {
    if (this.children.length == 0 || this.children[0] !== undefined) {
      return;
    }

    const messages = await this.liveView.selectMessagesInGroup(this.threadId);
    this.#openMessage = messages[0];
    // Don't overwrite this if for some weird reason we get here twice.
    this.#closedMessage ??= this.message;

    for (let i = 0; i < this.children.length; i++) {
      const message = messages[i + 1];
      this.children[i] = new LiveViewDataRow(message);
      this.children[i].parent = this;
      this.children[i].level = this.level + 1;
    }
    if (this.open) {
      this.#initFromMessage(this.#openMessage);
      // Notify the tree that the content is ready and it should redraw the rows.
      dataAdapter._clearFlatRowCache();
      dataAdapter._tree?.invalidateRange(
        rootIndex,
        rootIndex + this.children.length
      );
    }
  }

  /**
   * Whether or not this row is open (its children are visible).
   *
   * @type {boolean}
   */
  get open() {
    return this._open;
  }

  set open(value) {
    this._open = value;

    // Swap the contents of this row depending on whether it is open or not.
    if (value) {
      if (this.#openMessage) {
        this.#initFromMessage(this.#openMessage);
      }
    } else if (this.#closedMessage) {
      this.#initFromMessage(this.#closedMessage);
    }
  }
}

/**
 * Adapts message data from nsILiveView for display in a TreeView. This class
 * lists messages grouped by the current sort column. Each group contains a
 * dummy header row. Groups are lazily loaded when the dummy row is expanded.
 * Check for the "dummy" property to know if a row is a dummy row.
 *
 * @augments {TreeDataAdapter}
 */
export class LiveViewGroupedDataAdapter extends TreeDataAdapter {
  #liveView;

  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super();
    this.#liveView = liveView;
    liveView.grouping = Ci.nsILiveView.GROUPED_BY_SORT;
  }

  #getTopLevelRows() {
    const lengthBefore = this.rowCount;
    if (lengthBefore) {
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(0, -lengthBefore);
    }
    this.#liveView.selectMessages().then(groups => {
      this._rowMap = groups.map(group => {
        const row = new LiveViewGroupedDataRow(this.#liveView, group);
        row.liveView = this.#liveView;
        row.children.length = group.messageCount;
        return row;
      });
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(0, this.rowCount);
    });
  }

  sortBy(sortColumn, sortDirection, _resort = false) {
    // Only some columns are allowed for this grouping. Reject others.
    if (!["date", "subject", "sender", "recipients"].includes(sortColumn)) {
      sortColumn = "date";
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.#liveView.sortColumn = columns[sortColumn];
    this.#liveView.sortDescending = sortDirection == "descending";
    this.#getTopLevelRows();
  }
}

/**
 * A dummy header row for the grouped-by-sort view.
 *
 * @augments {TreeDataRow}
 */
class LiveViewGroupedDataRow extends TreeDataRow {
  /**
   * @param {nsILiveView} liveView
   * @param {Message} message
   */
  constructor(liveView, message) {
    let label, group;
    switch (liveView.sortColumn) {
      case Ci.nsILiveView.DATE:
        label =
          lazy.dateGroupLabels[message.dateGroup] ??
          // The value is a year. Format it for locales that display
          // differently e.g. Japanese ("2025年").
          lazy.yearFormatter.format(new Date(message.dateGroup, 0, 15));
        group = message.dateGroup;
        break;
      case Ci.nsILiveView.SUBJECT:
        label = group = message.subject;
        break;
      case Ci.nsILiveView.SENDER:
        label = group = message.sender;
        break;
      case Ci.nsILiveView.RECIPIENTS:
        label = group = message.recipients;
        break;
    }
    super({ subject: label }, { date: message.dateGroup }, ["dummy"]);
    this.group = group;
  }

  /**
   * Trigger loading of the child rows – it is an async function but you
   * should not wait for it. This is called before `open` is set.
   *
   * @param {TreeDataAdapter} dataAdapter - The adapter this row belongs to.
   * @param {number} rootIndex - The current index of this row in the view.
   */
  async ensureChildren(dataAdapter, rootIndex) {
    if (this.children.length == 0 || this.children[0] !== undefined) {
      return;
    }

    const messages = await this.liveView.selectMessagesInGroup(this.group);
    for (let i = 0; i < this.children.length; i++) {
      const message = messages[i];
      this.children[i] = new LiveViewDataRow(message);
      this.children[i].parent = this;
      this.children[i].level = this.level + 1;
    }
    if (this.open) {
      // Notify the tree that the content is ready and it should redraw the rows.
      dataAdapter._clearFlatRowCache();
      dataAdapter._tree?.invalidateRange(
        rootIndex,
        rootIndex + this.children.length
      );
    }
  }
}
