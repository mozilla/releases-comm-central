/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalTransactionManager", "CalTransaction"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const OP_ADD = Ci.calIOperationListener.ADD;
const OP_MODIFY = Ci.calIOperationListener.MODIFY;
const OP_DELETE = Ci.calIOperationListener.DELETE;

let transactionManager = null;

/**
 * CalTransactionManager is designed to handle nsITransactions regarding the
 * calendar.
 */
class CalTransactionManager {
  /**
   * Indicates whether batch mode as described in nsITransactionManager is active.
   * @type {boolean}
   */
  batchActive = false;

  /**
   * Contains the CalTransactions that are part of the batch when batch mode is
   * active.
   * @type {CalTransaction[]}
   */
  batchTransactions = [];

  /**
   * A reference to the transaction manager for calendar operations.
   * @type {nsITransactionManager}
   */
  transactionManager = Cc["@mozilla.org/transactionmanager;1"].createInstance(
    Ci.nsITransactionManager
  );

  /**
   * Provides a singleton instance of CalTransactionManger.
   * @return {CalTransactionManager}
   */
  static getInstance() {
    if (!transactionManager) {
      transactionManager = new CalTransactionManager();
    }
    return transactionManager;
  }

  _checkWritable(transaction) {
    // If the transaction is null it is possible the last transaction was a
    // batch transaction. Check the transactions we cached because
    // nsITransactionManager does not provide a way to query them all.
    return !transaction && this.batchTransactions.length
      ? this.batchTransactions.every(trn => trn.wrappedJSObject.canWrite())
      : transaction.wrappedJSObject.canWrite();
  }

  /**
   * @typedef {Object} ExtResponse
   * @property {number} responseMode One of the calIItipItem.autoResponse values.
   */

  /**
   * @param {string} action                     The action to execute. This can
   *                                            be one of:
   *                                             * add     Adds an item
   *                                             * modify  Modfifies an item
   *                                             * delete  Deletes an item
   *                                             * move    Move an item from one calendar to
   *                                                       the next. With this operation,
   *                                                       calendar is the calendar that the
   *                                                       event should be moved to.
   * @param {calICalendar} calendar             The Calendar to execute the transaction on.
   * @param {calIItemBase} item                 The changed item for this transaction.
   *                                            This item should be immutable.
   * @param {calIItemBase} oldItem              The item in its original form.
   *                                            Only needed for modify.
   * @param {CalTransactionObserver} [observer] The observer to call when the
   *                                            transaction has completed.
   * @param {ExtResponse} [extResponse]         Object to provide additional
   *                                            parameters to prepare an itip
   *                                            message.
   */
  createAndCommitTxn(action, item, calendar, oldItem, observer, extResponse) {
    let txn = new CalObservableTransaction(
      CalTransaction.createTransaction(action, item, calendar, oldItem, extResponse),
      observer
    );
    if (this.batchActive) {
      // nsITransactionManager.peek(Undo|Redo)Stack can return null if a batch
      // transaction is at the top of the stack. To avoid being mislead by this,
      // keep track of the members of a batch transaction.
      this.batchTransactions.push(txn);
    }
    this.transactionManager.doTransaction(txn);
  }

  /**
   * Signals the transaction manager that a series of transactions are going
   * to be performed, but that, for the purposes of undo and redo, they should
   * all be regarded as a single transaction. See also
   * nsITransactionManager::beginBatch
   */
  beginBatch() {
    this.transactionManager.beginBatch(null);
    this.batchActive = true;
    this.batchTransactions = [];
  }

  /**
   * Ends the batch transaction in process. See also
   * nsITransactionManager::endBatch
   */
  endBatch() {
    this.transactionManager.endBatch(false);
    this.batchActive = false;
  }

  /**
   * Undo the last transaction in the transaction manager's stack
   */
  undo() {
    this.transactionManager.undoTransaction();
  }

  /**
   * Returns true if it is possible to undo a transaction at this time
   * @return {boolean}
   */
  canUndo() {
    return (
      this.transactionManager.numberOfUndoItems > 0 &&
      this._checkWritable(this.transactionManager.peekUndoStack())
    );
  }

  /**
   * Redo the last transaction
   */
  redo() {
    this.transactionManager.redoTransaction();
  }

  /**
   * Returns true if it is possible to redo a transaction at this time
   * @return {boolean}
   */
  canRedo() {
    return (
      this.transactionManager.numberOfRedoItems > 0 &&
      this._checkWritable(this.transactionManager.peekRedoStack())
    );
  }
}

/**
 * CalTransaction is the base nsITransaction implementation used to make
 * calendar modifications undoable/redoable.
 *
 * @implements nsITransaction
 */
class CalTransaction {
  /**
   * @type {CalTransaction}
   */
  wrappedJSObject = this;

  /**
   * @type {Function}
   */
  QueryInterface = ChromeUtils.generateQI(["nsITransaction"]);

  /**
   * @type {boolean}
   */
  isTransient = false;

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
    this.item = item;
    this.calendar = calendar;
    this.oldItem = oldItem;
    this.extResponse = extResponse;
  }

  /**
   * Creates a CalTransaction instance based on the action desired.
   * @param {string} action             - One of "add","modify" or "delete"
   * @param {calIItemBase} item         - The item the operation is taking place on.
   * @param {calICalendar} calendar     - The target calendar for the operation.
   * @param {calIItemBase} [oldItem]    - The old item (for modifications).
   * @param {ExtResponse} [extResponse] - Passed to checkAndSend().
   */
  static createTransaction(action, item, calendar, oldItem, extResponse) {
    switch (action) {
      case "add":
        return new CalAddTransaction(item, calendar, oldItem, extResponse);
      case "modify":
        return new CalModifyTransaction(item, calendar, oldItem, extResponse);
      case "delete":
        return new CalDeleteTransaction(item, calendar, oldItem, extResponse);
      default:
        throw new Components.Exception(
          `Invalid action specified "${action}"`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
    }
  }

  _dispatch(opType, item, oldItem) {
    cal.itip.checkAndSend(opType, item, oldItem, this.extResponse);
  }

  /**
   * Checks whether the calendar of the transaction's target item can be written to.
   * @return {boolean}
   */
  canWrite() {
    if (itemWritable(this.item)) {
      return this instanceof CalModifyTransaction ? itemWritable(this.oldItem) : true;
    }
    return false;
  }

  doTransaction() {}

  undoTransaction() {}

  redoTransaction() {
    this.doTransaction();
  }

  merge(aTransaction) {
    // No support for merging
    return false;
  }
}

/**
 * CalAddTransaction handles undo/redo for additions.
 */
class CalAddTransaction extends CalTransaction {
  async doTransaction() {
    let item = await this.calendar.addItem(this.item);
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
 * CalModifyTransaction handles undo/redo for modifications.
 */
class CalModifyTransaction extends CalTransaction {
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
 * CalDeleteTransaction handles undo/redo for deletions.
 */
class CalDeleteTransaction extends CalTransaction {
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
 * Observer for CalTransaction execution.
 * @type {Object} CalTransactionObserver
 * @property {CalTransactionObserverHandler?} onTransctionComplete
 */

/**
 * @callback CalTransactionObserverHandler
 * @param {calIItemBase} item
 * @param {calIItemBase?} oldItem
 */

/**
 * CalObservableTransaction allows a transaction's undo/redo execution to be
 * observed by other objects. This is needed because the actual execution
 * transaction execution takes place in lower level code and is more or less
 * opaque to scripts.
 */
class CalObservableTransaction extends CalTransaction {
  /**
   * @type {CalTransaction}
   */
  _transaction;

  /**
   * @type {CalTransactionObserver}
   */
  _observer;

  /**
   * @param {CalTransaction} transaction
   * @param {CalTransactionObserver} observer
   */
  constructor(transaction, observer) {
    super(null, null, null, null);
    this._transaction = transaction;
    this._observer = observer;
  }

  canWrite() {
    return this._transaction.canWrite();
  }

  async doTransaction() {
    await this._transaction.doTransaction();
    this?._observer?.onTransactionComplete(this._transaction.item, this._transaction.oldItem);
  }

  async undoTransaction() {
    await this._transaction.undoTransaction();
    this?._observer?.onTransactionComplete(this._transaction.item, this._transaction.oldItem);
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
