/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const OP_ADD = Ci.calIOperationListener.ADD;
const OP_MODIFY = Ci.calIOperationListener.MODIFY;
const OP_DELETE = Ci.calIOperationListener.DELETE;

let transactionManager = null;

/**
 * CalTransactionManager is used to track user initiated operations on calendar
 * items. These transactions can be undone or repeated when appropriate.
 *
 * This implementation is used instead of nsITransactionManager because better
 * support for async transactions and access to batch transactions is needed
 * which nsITransactionManager does not provide.
 */
export class CalTransactionManager {
  /**
   * Contains transactions executed by the transaction manager than can be
   * undone.
   *
   * @type {CalTransaction}
   */
  undoStack = [];

  /**
   * Contains transactions that have been undone by the transaction manager and
   * can be redone again later if desired.
   *
   * @type {CalTransaction}
   */
  redoStack = [];

  /**
   * Provides a singleton instance of the CalTransactionManager.
   *
   * @returns {CalTransactionManager}
   */
  static getInstance() {
    if (!transactionManager) {
      transactionManager = new CalTransactionManager();
    }
    return transactionManager;
  }

  /**
   * @typedef {object} ExtResponse
   * @property {number} responseMode One of the calIItipItem.autoResponse values.
   */

  /**
   * @typedef {"add" | "modify" | "delete"} Action
   */

  /**
   * Adds a CalTransaction to the internal stack. The transaction will be
   * executed and its resulting Promise returned.
   *
   * @param {CalTransaction} trn - The CalTransaction to add to the stack and
   *                               execute.
   */
  async commit(trn) {
    this.undoStack.push(trn);
    return trn.doTransaction();
  }

  /**
   * Creates and pushes a new CalBatchTransaction onto the internal stack.
   * The created transaction is returned and can be used to combine multiple
   * transactions into one.
   *
   * @returns {CalBatchTrasaction}
   */
  beginBatch() {
    const trn = new CalBatchTransaction();
    this.undoStack.push(trn);
    return trn;
  }

  /**
   * peekUndoStack provides the top transaction on the undo stack (if any)
   * without modifying the stack.
   *
   * @returns {CalTransaction?}
   */
  peekUndoStack() {
    return this.undoStack.at(-1);
  }

  /**
   * Undo the transaction at the top of the undo stack.
   *
   * @throws - NS_ERROR_FAILURE if the undo stack is empty.
   */
  async undo() {
    if (!this.undoStack.length) {
      throw new Components.Exception(
        "CalTransactionManager: undo stack is empty!",
        Cr.NS_ERROR_FAILURE
      );
    }
    const trn = this.undoStack.pop();
    this.redoStack.push(trn);
    return trn.undoTransaction();
  }

  /**
   * Returns true if it is possible to undo the transaction at the top of the
   * undo stack.
   *
   * @returns {boolean}
   */
  canUndo() {
    const trn = this.peekUndoStack();
    return Boolean(trn?.canWrite());
  }

  /**
   * peekRedoStack provides the top transaction on the redo stack (if any)
   * without modifying the stack.
   *
   * @returns {CalTransaction?}
   */
  peekRedoStack() {
    return this.redoStack.at(-1);
  }

  /**
   * Redo the transaction at the top of the redo stack.
   *
   * @throws - NS_ERROR_FAILURE if the redo stack is empty.
   */
  async redo() {
    if (!this.redoStack.length) {
      throw new Components.Exception(
        "CalTransactionManager: redo stack is empty!",
        Cr.NS_ERROR_FAILURE
      );
    }
    const trn = this.redoStack.pop();
    this.undoStack.push(trn);
    return trn.doTransaction();
  }

  /**
   * Returns true if it is possible to redo the transaction at the top of the
   * redo stack.
   *
   * @returns {boolean}
   */
  canRedo() {
    const trn = this.peekRedoStack();
    return Boolean(trn?.canWrite());
  }
}

/**
 * CalTransaction represents a single, atomic user operation on one or more
 * calendar items.
 */
export class CalTransaction {
  /**
   * Indicates whether the calendar of the transaction's target item(s) can be
   * written to.
   *
   * @returns {boolean}
   */
  canWrite() {
    return false;
  }

  /**
   * Executes the transaction.
   */
  async doTransaction() {}

  /**
   * Executes the "undo" action of the transaction.
   */
  async undoTransaction() {}
}

/**
 * CalBatchTransaction is used for batch transactions where multiple transactions
 * treated as one is desired. For example; where the user selects and deletes
 * more than one event.
 */
export class CalBatchTransaction extends CalTransaction {
  /**
   * Stores the transactions that belong to the batch.
   *
   * @type {CalTransaction[]}
   */
  transactions = [];

  /**
   * Similar to the CalTransactionManager method except the transaction will be
   * added to the batch.
   */
  async commit(trn) {
    this.transactions.push(trn);
    return trn.doTransaction();
  }

  canWrite() {
    return Boolean(this.transactions.length && this.transactions.every(trn => trn.canWrite()));
  }

  async doTransaction() {
    for (const trn of this.transactions) {
      await trn.doTransaction();
    }
  }

  async undoTransaction() {
    for (const trn of this.transactions.slice().reverse()) {
      await trn.undoTransaction();
    }
  }
}

/**
 * CalBaseTransaction serves as the base for add/modify/delete operations.
 */
class CalBaseTransaction extends CalTransaction {
  /**
   * @type {calICalendar}
   */
  calendar = null;

  /**
   * @type {calIItemBase}
   */
  item = null;

  /**
   * @type {calIItemBase}
   */
  oldItem = null;

  /**
   * @type {calICalendar}
   */
  oldCalendar = null;

  /**
   * @type {ExtResponse}
   */
  extResponse = null;

  /**
   * @private
   * @param {calIItemBase} item
   * @param {calICalendar} calendar
   * @param {calIItemBase?} oldItem
   * @param {object?} extResponse
   */
  constructor(item, calendar, oldItem, extResponse) {
    super();
    this.item = item;
    this.calendar = calendar;
    this.oldItem = oldItem;
    this.extResponse = extResponse;
  }

  _dispatch(opType, item, oldItem) {
    cal.itip.checkAndSend(opType, item, oldItem, this.extResponse);
  }

  canWrite() {
    if (itemWritable(this.item)) {
      return this instanceof CalModifyTransaction ? itemWritable(this.oldItem) : true;
    }
    return false;
  }
}

/**
 * CalAddTransaction handles additions.
 */
export class CalAddTransaction extends CalBaseTransaction {
  async doTransaction() {
    const item = await this.calendar.addItem(this.item);
    this._dispatch(OP_ADD, item, this.oldItem);
    this.item = item;
  }

  async undoTransaction() {
    await this.calendar.deleteItem(this.item);
    this._dispatch(OP_DELETE, this.item, this.item);
    this.oldItem = this.item;
  }
}

/**
 * CalModifyTransaction handles modifications.
 */
export class CalModifyTransaction extends CalBaseTransaction {
  async doTransaction() {
    let item;
    if (this.item.calendar.id == this.oldItem.calendar.id) {
      item = await this.calendar.modifyItem(
        cal.itip.prepareSequence(this.item, this.oldItem),
        this.oldItem
      );
      this._dispatch(OP_MODIFY, item, this.oldItem);
    } else {
      this.oldCalendar = this.oldItem.calendar;
      item = await this.calendar.addItem(this.item);
      this._dispatch(OP_ADD, item, this.oldItem);
      await this.oldItem.calendar.deleteItem(this.oldItem);
      this._dispatch(OP_DELETE, this.oldItem, this.oldItem);
    }
    this.item = item;
  }

  async undoTransaction() {
    if (this.oldItem.calendar.id == this.item.calendar.id) {
      await this.calendar.modifyItem(cal.itip.prepareSequence(this.oldItem, this.item), this.item);
      this._dispatch(OP_MODIFY, this.oldItem, this.oldItem);
    } else {
      await this.calendar.deleteItem(this.item);
      this._dispatch(OP_DELETE, this.item, this.item);
      await this.oldCalendar.addItem(this.oldItem);
      this._dispatch(OP_ADD, this.oldItem, this.item);
    }
  }
}

/**
 * CalDeleteTransaction handles deletions.
 */
export class CalDeleteTransaction extends CalBaseTransaction {
  async doTransaction() {
    await this.calendar.deleteItem(this.item);
    this._dispatch(OP_DELETE, this.item, this.oldItem);
  }

  async undoTransaction() {
    await this.calendar.addItem(this.item);
    this._dispatch(OP_ADD, this.item, this.item);
  }
}

/**
 * Checks whether an item's calendar can be written to.
 *
 * @param {calIItemBase} item
 */
function itemWritable(item) {
  return (
    item &&
    item.calendar &&
    cal.acl.isCalendarWritable(item.calendar) &&
    cal.acl.userCanAddItemsToCalendar(item.calendar)
  );
}
