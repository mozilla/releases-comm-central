/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

let transactionManager = null;

/**
 * Records calendar changes as transactions that the user can undo or redo.
 * Each transaction performs one change, such as an event edit. Undo calls the
 * transaction's reverse operation. A batch groups changes into one Undo step.
 *
 * Calendar writes can finish later through promises. This manager supports
 * those asynchronous writes and access to batches, unlike nsITransactionManager.
 */
export class CalTransactionManager {
  /**
   * Contains transactions available for Undo, including work still pending.
   * A failed commit removes its own transaction before reporting the error.
   *
   * @type {CalTransaction[]}
   */
  undoStack = [];

  /**
   * Contains transactions that have been undone by the transaction manager and
   * can be redone again later if desired.
   *
   * @type {CalTransaction[]}
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
   * Adds and executes a transaction. Removes the transaction if execution fails.
   * Keeps other transactions available for Undo.
   *
   * @param {CalTransaction} trn - The CalTransaction to add to the stack and
   *                               execute.
   * @returns {Promise<void>} Resolves after the transaction finishes. Removing
   *   a failure from this stack does not reverse partial provider writes.
   * @throws If the transaction fails.
   */
  async commit(trn) {
    this.undoStack.push(trn);

    try {
      return await trn.doTransaction();
    } catch (error) {
      // A later transaction can finish while this transaction is pending.
      // Remove this transaction by identity instead of removing the last entry.
      const index = this.undoStack.indexOf(trn);
      if (index != -1) {
        this.undoStack.splice(index, 1);
      }

      throw error;
    }
  }

  /**
   * Creates and pushes a new CalBatchTransaction onto the internal stack.
   * The created transaction is returned and can be used to combine multiple
   * transactions into one.
   *
   * @returns {CalBatchTransaction} The new batch stored as one Undo entry.
   */
  beginBatch() {
    const trn = new CalBatchTransaction();
    this.undoStack.push(trn);
    return trn;
  }

  /**
   * Returns the index of the last Undo entry that is not an empty batch.
   *
   * @returns {number} The entry index, or -1 if no entry remains.
   */
  #getUndoTransactionIndex() {
    // Keep empty batches in place because callers can add members later.
    // Pending members are already in the batch and must not be skipped.
    for (let index = this.undoStack.length - 1; index >= 0; index--) {
      const trn = this.undoStack[index];

      if (trn instanceof CalBatchTransaction && !trn.transactions.length) {
        continue;
      }

      return index;
    }

    return -1;
  }

  /**
   * Returns the last Undo entry that is not an empty batch, without changing
   * the stack.
   *
   * @returns {CalTransaction?}
   */
  peekUndoStack() {
    return this.undoStack[this.#getUndoTransactionIndex()];
  }

  /**
   * Undoes the last Undo entry that is not an empty batch.
   *
   * @throws - NS_ERROR_FAILURE if no non-empty Undo entry remains.
   */
  async undo() {
    const index = this.#getUndoTransactionIndex();

    if (index == -1) {
      throw new Components.Exception(
        "CalTransactionManager: undo stack is empty!",
        Cr.NS_ERROR_FAILURE
      );
    }

    const [trn] = this.undoStack.splice(index, 1);

    this.redoStack.push(trn);

    return trn.undoTransaction();
  }

  /**
   * Returns true if the last Undo entry that is not an empty batch is writable.
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
   * Redoes the transaction at the top of the redo stack. Removes the transaction
   * from Undo history if execution fails.
   *
   * @throws - NS_ERROR_FAILURE if the redo stack is empty.
   * @throws If the transaction fails.
   */
  async redo() {
    if (!this.redoStack.length) {
      throw new Components.Exception(
        "CalTransactionManager: redo stack is empty!",
        Cr.NS_ERROR_FAILURE
      );
    }

    const trn = this.redoStack.pop();

    return this.commit(trn);
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
 * Defines an operation on one or more calendar items and its reverse operation.
 * A transaction can use several provider writes. A failed transaction can leave
 * earlier writes in place.
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
 * Groups transactions into one Undo step, such as deletion of several events.
 * Each member still performs its own provider writes.
 */
export class CalBatchTransaction extends CalTransaction {
  /**
   * Stores the transactions that belong to the batch.
   *
   * @type {CalTransaction[]}
   */
  transactions = [];

  /**
   * Adds and executes a transaction in this batch. Removes failed transactions
   * while keeping successful transactions available for Undo.
   *
   * @param {CalTransaction} trn - The transaction to execute.
   * @returns {Promise<void>} Resolves after the transaction finishes.
   * @throws If the transaction fails.
   */
  async commit(trn) {
    this.transactions.push(trn);

    try {
      return await trn.doTransaction();
    } catch (error) {
      // Other batch members can finish before this failure reaches the caller.
      const index = this.transactions.indexOf(trn);
      if (index != -1) {
        this.transactions.splice(index, 1);
      }

      throw error;
    }
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
    this._dispatch(Ci.calIOperationListener.ADD, item, this.oldItem);
    this.item = item;
  }

  async undoTransaction() {
    await this.calendar.deleteItem(this.item);
    this._dispatch(Ci.calIOperationListener.DELETE, this.item, this.item);
    this.oldItem = this.item;
  }
}

/**
 * CalModifyTransaction handles modifications.
 */
export class CalModifyTransaction extends CalBaseTransaction {
  /**
   * Applies an edit or move and sends client scheduling messages.
   *
   * @returns {Promise<void>} Resolves after the edit or move succeeds.
   * @throws If the calendar edit or move fails.
   */
  async doTransaction() {
    let item;

    if (this.item.calendar.id == this.oldItem.calendar.id) {
      item = await this.calendar.modifyItem(
        cal.itip.prepareSequence(this.item, this.oldItem),
        this.oldItem
      );
      this._dispatch(Ci.calIOperationListener.MODIFY, item, this.oldItem);
    } else {
      this.oldCalendar = this.oldItem.calendar;
      item = await this.calendar.addItem(this.item);

      // A remote calendar can delete the source and then lose the response.
      // Keep the destination if deletion rejects; it may be the only copy.
      await this.oldItem.calendar.deleteItem(this.oldItem);

      // Scheduling messages are invitations, updates, or cancellations.
      // Send client scheduling messages only after both move operations succeed.
      this._dispatch(Ci.calIOperationListener.ADD, item, this.oldItem);
      this._dispatch(Ci.calIOperationListener.DELETE, this.oldItem, this.oldItem);
    }

    this.item = item;
  }

  async undoTransaction() {
    if (this.oldItem.calendar.id == this.item.calendar.id) {
      await this.calendar.modifyItem(cal.itip.prepareSequence(this.oldItem, this.item), this.item);
      this._dispatch(Ci.calIOperationListener.MODIFY, this.oldItem, this.oldItem);
    } else {
      await this.calendar.deleteItem(this.item);
      this._dispatch(Ci.calIOperationListener.DELETE, this.item, this.item);
      await this.oldCalendar.addItem(this.oldItem);
      this._dispatch(Ci.calIOperationListener.ADD, this.oldItem, this.item);
    }
  }
}

/**
 * CalDeleteTransaction handles deletions.
 */
export class CalDeleteTransaction extends CalBaseTransaction {
  async doTransaction() {
    await this.calendar.deleteItem(this.item);
    this._dispatch(Ci.calIOperationListener.DELETE, this.item, this.oldItem);
  }

  async undoTransaction() {
    await this.calendar.addItem(this.item);
    this._dispatch(Ci.calIOperationListener.ADD, this.item, this.item);
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
