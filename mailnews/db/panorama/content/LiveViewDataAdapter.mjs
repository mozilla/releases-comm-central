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
// eslint-disable-next-line no-unused-vars
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
      this._liveView = null;
      this._rowMap.length = 0;
      this._clearFlatRowCache();
    }
    super.setTree(tree);
  }

  async #getTopLevelRows() {
    this._rowMap.length = 0;
    this._rowMap.length = await this._liveView.countMessages();
    await this._liveView.selectMessages();
  }

  sortBy(sortColumn, sortDirection, _resort = false) {
    if (!(sortColumn in columns)) {
      sortColumn = "date";
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this._liveView.sortColumn = columns[sortColumn];
    this._liveView.sortDescending = sortDirection == "descending";
    this.#getTopLevelRows();
  }

  onMessageAdded() {}

  onMessageRemoved() {}

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

  _setUpRow(message) {
    return new LiveViewDataRow(message);
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
export class LiveViewThreadedDataAdapter extends LiveViewDataAdapter {
  /**
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super(liveView, Ci.nsILiveView.THREADED);
  }

  _setUpRow(conversation) {
    const row = new LiveViewDataRow(conversation);
    row.liveView = this._liveView;
    row.threadId = conversation.threadId;
    row.children.length = conversation.messageCount - 1;
    return row;
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
   * @param {nsILiveView} liveView
   */
  constructor(liveView) {
    super(liveView, Ci.nsILiveView.GROUPED_BY_SORT);
  }

  _setUpRow(group) {
    const row = new LiveViewGroupedHeaderRow(this._liveView, group);
    row.children.length = group.messageCount;
    return row;
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
 * A dummy header row for the grouped-by-sort view.
 *
 * @augments {TreeDataRow}
 */
class LiveViewGroupedHeaderRow extends TreeDataRow {
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
