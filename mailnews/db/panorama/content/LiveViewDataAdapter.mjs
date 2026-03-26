/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "collator", () => new Intl.Collator());
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
 * @implements {nsILiveViewListener}
 */
export class LiveViewDataAdapter extends TreeDataAdapter {
  QueryInterface = ChromeUtils.generateQI(["nsILiveViewListener"]);

  _liveView;
  _sortComparator = comparators.date;

  /**
   * @param {nsILiveView} liveView
   * @param {nsILiveView_Grouping} [grouping=Ci.nsILiveView.UNTHREADED] -
   *   set to Ci.nsILiveView.THREADED for one row only per thread.
   */
  constructor(liveView, grouping = Ci.nsILiveView.UNTHREADED) {
    super();
    liveView.grouping = grouping;
    liveView.setListener(this);
    this._liveView = liveView;
  }

  /**
   * Extends TreeDataAdapter.setTree so that references are cleaned up when
   * the tree changes.
   *
   * @param {TreeView} tree
   */
  setTree(tree) {
    if (!tree) {
      this._liveView.clearListener(this);
      this._liveView = null;
      this._rowMap.length = 0;
      this._clearFlatRowCache();
    }
    super.setTree(tree);
  }

  async sortBy(sortColumn, sortDirection, _resort = false) {
    if (!(sortColumn in columns)) {
      sortColumn = "date";
    }
    if (!["ascending", "descending"].includes(sortDirection)) {
      sortDirection = "descending";
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this._sortComparator = comparators[sortColumn];
    this._liveView.sortColumn = columns[sortColumn];
    this._liveView.sortDescending = sortDirection == "descending";

    this._rowMap.length = 0;
    this._rowMap.length = await this._liveView.countMessages();
    await this._liveView.selectMessages();
  }

  /**
   * Creates a data row for the given message. Overriden by subclasses to
   * produce different effects.
   *
   * @param {Message} message
   * @returns {LiveViewDataRow}
   */
  _setUpRow(message) {
    return new LiveViewDataRow(message);
  }

  /**
   * Compare two messages for ordering their rows.
   *
   * @param {Message} a - A message object.
   * @param {Message} b - A message object.
   * @returns {boolean} - True if message A should be above message B.
   */
  _compareMessages(a, b) {
    if (this.sortDirection == "descending") {
      [a, b] = [b, a];
    }
    return this._sortComparator(a, b);
  }

  onMessageAdded(message) {
    const newRow = this._setUpRow(message);
    let added = false;
    this._rowMap.forEach((row, index) => {
      if (added) {
        return;
      }
      if (this._compareMessages(message, row.message)) {
        // The new message goes above row.
        if (index == 0 || this._rowMap[index - 1]) {
          // The new message goes immediately above row.
          this._rowMap.splice(index, 0, newRow);
        }
        this._clearFlatRowCache();
        this._tree?.rowCountChanged(index, 1);
        added = true;
      }
    });
    if (!added) {
      // The new message goes after all the others.
      this._rowMap.push(newRow);
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(this._rowMap.length - 1, 1);
    }
  }

  onMessageRemoved(message) {
    let removed = false;
    this._rowMap.forEach((row, index) => {
      if (removed || !row) {
        return;
      }
      if (message.id == row.message.id) {
        // The removed message was this one.
        this._rowMap.splice(index, 1);
        this._clearFlatRowCache();
        this._tree?.rowCountChanged(index, -1);
        removed = true;
      }
    });
  }

  onSelectedChunk(messages, startIndex, endIndex) {
    for (let index = startIndex; index <= endIndex; index++) {
      const message = messages[index];
      const row = this._setUpRow(message);
      row.setSize = this._rowMap.length;
      row.posInSet = index;
      row.liveView = this._liveView;
      this._rowMap[index] = row;
    }

    // We can get away with this because all rows are top level rows.
    // If we open one, _flatRowCache gets replaced.
    this._flatRowCache = this._rowMap;
    this._tree?.invalidateRange(startIndex, endIndex);
  }
}

/**
 * Adapts message data from nsILiveView for display in a TreeView. This class
 * lists messages grouped by thread. Threads are lazily loaded when the root
 * message is expanded.
 *
 * @augments {TreeDataAdapter}
 */
export class LiveViewThreadedDataAdapter extends LiveViewDataAdapter {
  /**
   * A map of thread identifiers to `LiveViewThreadDataRow`s.
   *
   * @type {Map<number, LiveViewThreadDataRow>}
   */
  #threads = new Map();

  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super(liveView, Ci.nsILiveView.THREADED);
  }

  /**
   * Creates a data row for the given thread. This version creates a
   * `LiveViewThreadDataRow`.
   *
   * @param {Message} message
   * @returns {LiveViewDataRow}
   */
  _setUpRow(message) {
    const row = new LiveViewThreadDataRow(message, this._liveView);
    this.#threads.set(message.threadId, row);
    return row;
  }

  onMessageAdded(message) {
    let threadRow = this.#threads.get(message.threadId);
    if (threadRow) {
      threadRow.addChild(this, this.indexOf(threadRow), message);
    } else {
      threadRow = this._setUpRow({ ...message, messageCount: 1 });
      let added = false;
      this._rowMap.forEach((row, index) => {
        if (added) {
          return;
        }
        if (this._compareMessages(message, row.thread)) {
          // The new message goes above row.
          if (index == 0 || this._rowMap[index - 1]) {
            // The new message goes immediately above row.
            this._rowMap.splice(index, 0, threadRow);
          }
          added = true;
        }
      });
      if (!added) {
        // The new message goes after all the others.
        this._rowMap.push(threadRow);
      }
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(this.indexOf(threadRow), 1);
    }
  }

  onMessageRemoved(message) {
    const threadRow = this.#threads.get(message.threadId);
    if (!threadRow) {
      // This shouldn't happen.
      return;
    }
    const threadRowIndex = this.indexOf(threadRow);
    if (threadRow.children.length == 0) {
      this._rowMap.splice(this._rowMap.indexOf(threadRow), 1);
      this.#threads.delete(message.threadId);
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(threadRowIndex, -1);
      return;
    }
    threadRow.removeChild(this, threadRowIndex, message);
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
   * A map of thread identifiers to `LiveViewDataRow`s.
   *
   * @type {Map<number, LiveViewDataRow>}
   */
  #threads = new Map();

  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super(liveView, Ci.nsILiveView.THREADED);
  }

  async sortBy(sortColumn, sortDirection) {
    // Only sorting by date is allowed.
    await super.sortBy("date", sortDirection);
  }

  /**
   * Creates a data row for the given message. This version creates a
   * `LiveViewDataRow` that doesn't have children (as the children won't be
   * displayed), but does maintain a count of the children so that the row can
   * be removed if the count drops to zero.
   *
   * @param {Message} message
   * @returns {LiveViewDataRow}
   */
  _setUpRow(message) {
    const row = new LiveViewDataRow(message);
    row.messageCount = message.messageCount;
    this.#threads.set(message.threadId, row);
    return row;
  }

  onMessageAdded(message) {
    const threadRow = this.#threads.get(message.threadId);
    if (threadRow) {
      threadRow.messageCount++;
      this._tree?.invalidateRow(this.indexOf(threadRow));
      return;
    }
    message.messageCount = 1;
    super.onMessageAdded(message);
  }

  onMessageRemoved(message) {
    const threadRow = this.#threads.get(message.threadId);
    if (!threadRow) {
      // This shouldn't happen.
      return;
    }
    const threadRowIndex = this.indexOf(threadRow);
    threadRow.messageCount--;
    if (threadRow.messageCount == 0) {
      this._rowMap.splice(this._rowMap.indexOf(threadRow), 1);
      this.#threads.delete(message.threadId);
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(threadRowIndex, -1);
    } else {
      this._tree?.invalidateRow(threadRowIndex);
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
export class LiveViewGroupedDataAdapter extends LiveViewDataAdapter {
  /**
   * Finds the appropriate date group for a given date.
   *
   * @see `GroupedByDateFunction`
   * @param {Date} date
   * @returns {number} A year or nsILiveView.DATE_GROUP_* constant.
   */
  static getDateGroup(date) {
    const now = new Date();
    // A message from the future! (And a half-hour grace period for weirdness
    // like clock skew.)
    if (date > now.valueOf() + 1800000) {
      return Ci.nsILiveView.DATE_GROUP_FUTURE;
    }

    // Today, actually since midnight last night.
    now.setHours(0);
    now.setMinutes(0);
    now.setSeconds(0);
    now.setMilliseconds(0);
    if (date > now) {
      return Ci.nsILiveView.DATE_GROUP_TODAY;
    }

    // Since midnight yesterday.
    now.setDate(now.getDate() - 1);
    if (date > now) {
      return Ci.nsILiveView.DATE_GROUP_YESTERDAY;
    }

    // "7 Days Ago", actually since 6 days before midnight last night.
    now.setDate(now.getDate() - 5);
    if (date > now) {
      return Ci.nsILiveView.DATE_GROUP_LAST_SEVEN_DAYS;
    }

    // "14 Days Ago", actually since 13 days before midnight last night.
    now.setDate(now.getDate() - 7);
    if (date > now) {
      return Ci.nsILiveView.DATE_GROUP_LAST_FOURTEEN_DAYS;
    }

    // Older than all the special groups, just use the year number.
    return date.getFullYear();
  }

  /**
   * A map of group identifiers to `LiveViewGroupedHeaderRow`s.
   *
   * @type {Map<(number|string), LiveViewGroupedHeaderRow>}
   */
  #groups = new Map();

  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super(liveView, Ci.nsILiveView.GROUPED_BY_SORT);
  }

  /**
   * Creates a data row for the given thread. This version creates a
   * `LiveViewGroupedHeaderRow`.
   *
   * @param {Message} message
   * @returns {LiveViewDataRow}
   */
  _setUpRow(message) {
    const row = new LiveViewGroupedHeaderRow(message, this._liveView);
    this.#groups.set(row.group, row);
    return row;
  }

  /**
   * Compare two messages for ordering their rows. Unlike the superclass, this
   * is only used for ordering messages within a group, and the order is
   * always date, descending unless the adapter's order is date, ascending.
   *
   * @param {Message} a - A message object.
   * @param {Message} b - A message object.
   * @returns {boolean} - True if message A should be above message B.
   */
  _compareMessages(a, b) {
    if (this.sortColumn == "date" && this.sortDirection == "ascending") {
      [a, b] = [b, a];
    }
    return comparators.date(a, b);
  }

  onMessageAdded(message) {
    let groupField = this.sortColumn;
    let comparator = (a, b) => lazy.collator.compare(a, b) < 0;
    if (this._liveView.sortColumn == Ci.nsILiveView.DATE) {
      message.dateGroup = LiveViewGroupedDataAdapter.getDateGroup(message.date);
      groupField = "dateGroup";
      comparator = (a, b) => a < b;
    }
    const groupValue = message[groupField];

    let groupRow = this.#groups.get(groupValue);
    if (groupRow) {
      groupRow.addChild(this, this.indexOf(groupRow), message);
      return;
    }

    groupRow = this._setUpRow({ [groupField]: groupValue, messageCount: 1 });
    const isAscending = this.sortDirection == "ascending";
    const index = this._rowMap.findIndex(
      r => comparator(groupValue, r.group) == isAscending
    );
    if (index == -1) {
      this._rowMap.push(groupRow);
    } else {
      this._rowMap.splice(index, 0, groupRow);
    }
    this._clearFlatRowCache();
    this._tree?.rowCountChanged(this.indexOf(groupRow), 1);
  }

  onMessageRemoved(message) {
    let groupField = this.sortColumn;
    if (this._liveView.sortColumn == Ci.nsILiveView.DATE) {
      message.dateGroup = LiveViewGroupedDataAdapter.getDateGroup(message.date);
      groupField = "dateGroup";
    }

    const groupRow = this.#groups.get(message[groupField]);
    if (!groupRow) {
      // This shouldn't happen.
      return;
    }

    if (groupRow.children.length == 1) {
      const index = this.indexOf(groupRow);
      this._rowMap.splice(this._rowMap.indexOf(groupRow), 1);
      this.#groups.delete(message[groupField]);
      this._clearFlatRowCache();
      this._tree?.rowCountChanged(index, groupRow.open ? -2 : -1);
      return;
    }

    groupRow.removeChild(this, this.indexOf(groupRow), message);
  }
}

/**
 * A class representing a row in a TreeView.
 *
 * @augments {TreeDataRow}
 */
class LiveViewDataRow extends TreeDataRow {
  /**
   * @param {Message} message
   */
  constructor(message) {
    super();
    this._initFromMessage(message);
  }

  /**
   * Set up this row based on the values from `message`.
   *
   * @param {Message} message
   */
  _initFromMessage(message) {
    ChromeUtils.defineLazyGetter(this, "texts", () => {
      return {
        ...message,
        date: lazy.dateFormatter.format(message.date),
        // Invert the read flag for unread messages.
        unread: !(message.flags & Ci.nsMsgMessageFlags.Read),
        flagged: !!(message.flags & Ci.nsMsgMessageFlags.Marked),
      };
    });
    this.values = { date: message.date.valueOf() };
    this.message = message;
  }
}

/**
 * A class representing a row in a TreeView. Like LiveViewDataRow, but capable
 * of having child rows.
 *
 * @augments {LiveViewDataRow}
 */
class LiveViewThreadDataRow extends LiveViewDataRow {
  /**
   * @type {nsILiveView}
   */
  #liveView;

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
   * @param {nsILiveView} liveView
   */
  constructor(message, liveView) {
    super(message);
    this.thread = message;
    this.children.length = message.messageCount - 1;
    this.#liveView = liveView;
    this.#closedMessage = message;
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

    const messages = await this.#liveView.selectMessagesInGroup(
      this.thread.threadId
    );
    this.#openMessage = messages[0];

    for (let i = 0; i < this.children.length; i++) {
      const message = messages[i + 1];
      this.children[i] = new LiveViewDataRow(message);
      this.children[i].parent = this;
      this.children[i].level = this.level + 1;
    }
    if (this.open) {
      this._initFromMessage(this.#openMessage);
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
        this._initFromMessage(this.#openMessage);
      }
    } else if (this.#closedMessage) {
      this._initFromMessage(this.#closedMessage);
    }
  }

  /**
   * Add a new LiveViewDataRow to this row's children, updating the tree as
   * necessary. TODO: correctly order the children.
   *
   * @param {TreeDataAdapter} dataAdapter
   * @param {number} rootIndex - The index of this row in the adapter's rows.
   * @param {Message} message
   */
  addChild(dataAdapter, rootIndex, message) {
    if (this.open) {
      this.children.push(new LiveViewDataRow(message));
      dataAdapter._clearFlatRowCache();
      dataAdapter._tree?.rowCountChanged(rootIndex, 1);
      // Adding a row will invalidate all those below it.
    } else {
      if (this.children[0] === undefined) {
        this.children.length++;
      } else {
        this.children.push(new LiveViewDataRow(message));
      }
      dataAdapter._tree?.invalidateRow(rootIndex);
    }
  }

  /**
   * Remove a row from this row's children, updating the tree as necessary.
   *
   * @param {TreeDataAdapter} dataAdapter
   * @param {number} rootIndex - This index of this row in the adapter's rows.
   * @param {Message} message
   */
  removeChild(dataAdapter, rootIndex, message) {
    if (this.message.id == message.id) {
      this.#openMessage = this.children.shift().message;
      this._initFromMessage(this.#openMessage);
      if (this.open) {
        dataAdapter._clearFlatRowCache();
        dataAdapter._tree?.rowCountChanged(rootIndex, -1);
      } else {
        dataAdapter._tree?.invalidateRow(rootIndex);
      }
      return;
    }

    if (this.children[0] === undefined) {
      this.children.length--;
      if (this.open) {
        dataAdapter._clearFlatRowCache();
        dataAdapter._tree?.rowCountChanged(rootIndex, -1);
      } else {
        dataAdapter._tree?.invalidateRow(rootIndex);
      }
    }
    const childIndex = this.children.findIndex(
      r => r?.message.id == message.id
    );
    if (childIndex > -1) {
      const childFlatIndex = this.open ? rootIndex + 1 + childIndex : -1;
      this.children.splice(childIndex, 1);
      if (childFlatIndex > -1) {
        dataAdapter._clearFlatRowCache();
        dataAdapter._tree?.rowCountChanged(childFlatIndex, -1);
      }
    }
  }
}

/**
 * A dummy header row for the grouped-by-sort view.
 *
 * @augments {TreeDataRow}
 */
class LiveViewGroupedHeaderRow extends TreeDataRow {
  /**
   * @type {nsILiveView}
   */
  #liveView;

  /**
   * @param {Message} message
   * @param {nsILiveView} liveView
   */
  constructor(message, liveView) {
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
    this.children.length = message.messageCount;
    this.#liveView = liveView;
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

    const messages = await this.#liveView.selectMessagesInGroup(this.group);
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

  /**
   * Add a new LiveViewDataRow to this row's children, updating the tree as
   * necessary.
   *
   * @param {TreeDataAdapter} dataAdapter
   * @param {number} rootIndex - The index of this row in the adapter's rows.
   * @param {Message} message
   */
  addChild(dataAdapter, rootIndex, message) {
    if (!this.open && this.children[0] === undefined) {
      // This row has never been opened. We know how many children it has, but
      // we don't have the children. Now there's another child, expand the
      // array that will hold them.
      this.children.length++;
      dataAdapter._tree?.invalidateRow(rootIndex);
      return;
    }
    // TODO: This should be done with a faster operation, e.g. a binary search,
    // but it's good enough for now while we work on correctness.
    this.children.push(new LiveViewDataRow(message));
    this.children.sort((a, b) =>
      dataAdapter._compareMessages(a.message, b.message)
    );
    if (this.open) {
      dataAdapter._clearFlatRowCache();
      dataAdapter._tree?.rowCountChanged(rootIndex, 1);
      // Adding a row will invalidate all those below it.
    } else {
      dataAdapter._tree?.invalidateRow(rootIndex);
    }
  }

  /**
   * Remove a row from this row's children, updating the tree as necessary.
   *
   * @param {TreeDataAdapter} dataAdapter
   * @param {number} rootIndex - This index of this row in the adapter's rows.
   * @param {Message} message
   */
  removeChild(dataAdapter, rootIndex, message) {
    if (this.children[0] === undefined) {
      // This row has never been opened. We know how many children it has, but
      // we don't have the children. Now a child has been removed, shrink the
      // array that will hold them.
      this.children.length--;
      if (this.open) {
        dataAdapter._clearFlatRowCache();
        dataAdapter._tree?.rowCountChanged(rootIndex, -1);
      } else {
        dataAdapter._tree?.invalidateRow(rootIndex);
      }
    }
    const childIndex = this.children.findIndex(
      r => r?.message.id == message.id
    );
    if (childIndex > -1) {
      const childFlatIndex = this.open ? rootIndex + 1 + childIndex : -1;
      this.children.splice(childIndex, 1);
      if (childFlatIndex == -1) {
        dataAdapter._tree?.invalidateRow(rootIndex);
      } else {
        dataAdapter._clearFlatRowCache();
        dataAdapter._tree?.rowCountChanged(childFlatIndex, -1);
      }
    }
  }
}
