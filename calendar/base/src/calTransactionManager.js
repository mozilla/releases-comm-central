/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function calTransactionManager() {
  this.wrappedJSObject = this;
  if (!this.transactionManager) {
    this.transactionManager = Cc["@mozilla.org/transactionmanager;1"].createInstance(
      Ci.nsITransactionManager
    );
  }
}

calTransactionManager.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calITransactionManager]),
  classID: Components.ID("{1d529847-d292-4222-b066-b8b17a794d62}"),

  transactionManager: null,
  createAndCommitTxn: function(aAction, aItem, aCalendar, aOldItem, aListener, aExtResponse) {
    let txn = new calTransaction(aAction, aItem, aCalendar, aOldItem, aListener, aExtResponse);
    this.transactionManager.doTransaction(txn);
  },

  beginBatch: function() {
    this.transactionManager.beginBatch(null);
  },

  endBatch: function() {
    this.transactionManager.endBatch(false);
  },

  checkWritable: function(transaction) {
    function checkItem(item) {
      return (
        item &&
        item.calendar &&
        cal.acl.isCalendarWritable(item.calendar) &&
        cal.acl.userCanAddItemsToCalendar(item.calendar)
      );
    }

    let trans = transaction && transaction.wrappedJSObject;
    return trans && checkItem(trans.mItem) && checkItem(trans.mOldItem);
  },

  undo: function() {
    this.transactionManager.undoTransaction();
  },

  canUndo: function() {
    return (
      this.transactionManager.numberOfUndoItems > 0 &&
      this.checkWritable(this.transactionManager.peekUndoStack())
    );
  },

  redo: function() {
    this.transactionManager.redoTransaction();
  },

  canRedo: function() {
    return (
      this.transactionManager.numberOfRedoItems > 0 &&
      this.checkWritable(this.transactionManager.peekRedoStack())
    );
  },
};

function calTransaction(aAction, aItem, aCalendar, aOldItem, aListener, aExtResponse) {
  this.wrappedJSObject = this;
  this.mAction = aAction;
  this.mItem = aItem;
  this.mCalendar = aCalendar;
  this.mOldItem = aOldItem;
  this.mListener = aListener;
  this.mExtResponse = aExtResponse;
}

var calTransactionClassID = Components.ID("{fcb54c82-2fb9-42cb-bf44-1e197a55e520}");
var calTransactionInterfaces = [Ci.nsITransaction, Ci.calIOperationListener];
calTransaction.prototype = {
  classID: calTransactionClassID,
  QueryInterface: ChromeUtils.generateQI(calTransactionInterfaces),

  mAction: null,
  mCalendar: null,
  mItem: null,
  mOldItem: null,
  mOldCalendar: null,
  mListener: null,
  mIsDoTransaction: false,
  mExtResponse: null,

  onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
    if (Components.isSuccessCode(aStatus)) {
      cal.itip.checkAndSend(
        aOperationType,
        aDetail,
        this.mIsDoTransaction ? this.mOldItem : this.mItem,
        this.mExtResponse
      );

      if (
        aOperationType == Ci.calIOperationListener.ADD ||
        aOperationType == Ci.calIOperationListener.MODIFY
      ) {
        if (this.mIsDoTransaction) {
          this.mItem = aDetail;
        } else {
          this.mOldItem = aDetail;
        }
      }
    }
    if (this.mListener) {
      this.mListener.onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail);
    }
  },

  onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aItems) {
    if (this.mListener) {
      this.mListener.onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems);
    }
  },

  doTransaction: function() {
    this.mIsDoTransaction = true;
    switch (this.mAction) {
      case "add":
        this.mCalendar.addItem(this.mItem, this);
        break;
      case "modify":
        if (this.mItem.calendar.id == this.mOldItem.calendar.id) {
          this.mCalendar.modifyItem(
            cal.itip.prepareSequence(this.mItem, this.mOldItem),
            this.mOldItem,
            this
          );
        } else {
          let self = this;
          let addListener = {
            onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
              self.onOperationComplete(...arguments);
              if (Components.isSuccessCode(aStatus)) {
                self.mOldItem.calendar.deleteItem(self.mOldItem, self);
              }
            },
          };

          this.mOldCalendar = this.mOldItem.calendar;
          this.mCalendar.addItem(this.mItem, addListener);
        }
        break;
      case "delete":
        this.mCalendar.deleteItem(this.mItem, this);
        break;
      default:
        throw new Components.Exception("Invalid action specified", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
  },

  undoTransaction: function() {
    this.mIsDoTransaction = false;
    switch (this.mAction) {
      case "add":
        this.mCalendar.deleteItem(this.mItem, this);
        break;
      case "modify":
        if (this.mOldItem.calendar.id == this.mItem.calendar.id) {
          this.mCalendar.modifyItem(
            cal.itip.prepareSequence(this.mOldItem, this.mItem),
            this.mItem,
            this
          );
        } else {
          this.mCalendar.deleteItem(this.mItem, this);
          this.mOldCalendar.addItem(this.mOldItem, this);
        }
        break;
      case "delete":
        this.mCalendar.addItem(this.mItem, this);
        break;
      default:
        throw new Components.Exception("Invalid action specified", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
  },

  redoTransaction: function() {
    this.doTransaction();
  },

  isTransient: false,

  merge: function(aTransaction) {
    // No support for merging
    return false;
  },
};
