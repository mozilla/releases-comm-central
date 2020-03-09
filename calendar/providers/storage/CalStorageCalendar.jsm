/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalStorageCalendar"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { upgradeDB } = ChromeUtils.import("resource:///modules/calendar/calStorageUpgrade.jsm");
var { CAL_ITEM_FLAG, newDateTime } = ChromeUtils.import(
  "resource:///modules/calendar/calStorageHelpers.jsm"
);

var USECS_PER_SECOND = 1000000;
var kCalICalendar = Ci.calICalendar;
var cICL = Ci.calIChangeLog;

function CalStorageCalendar() {
  this.initProviderBase();
  this.mItemCache = new Map();
  this.mRecEventCache = new Map();
  this.mRecTodoCache = new Map();
}
var calStorageCalendarClassID = Components.ID("{b3eaa1c4-5dfe-4c0a-b62a-b3a514218461}");
var calStorageCalendarInterfaces = [
  Ci.calICalendar,
  Ci.calICalendarProvider,
  Ci.calIOfflineStorage,
  Ci.calISchedulingSupport,
  Ci.calISyncWriteCalendar,
];
CalStorageCalendar.prototype = {
  __proto__: cal.provider.BaseClass.prototype,
  classID: calStorageCalendarClassID,
  QueryInterface: cal.generateQI(calStorageCalendarInterfaces),
  classInfo: cal.generateCI({
    classID: calStorageCalendarClassID,
    contractID: "@mozilla.org/calendar/calendar;1?type=storage",
    classDescription: "Calendar Storage Provider",
    interfaces: calStorageCalendarInterfaces,
  }),

  //
  // private members
  //
  mDB: null,
  mItemCache: null,
  mRecItemCachePromise: null,
  mRecEventCache: null,
  mRecTodoCache: null,
  mLastStatement: null,

  //
  // calICalendarProvider interface
  //
  get prefChromeOverlay() {
    return null;
  },

  get displayName() {
    return cal.l10n.getCalString("storageName");
  },

  createCalendar() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  async deleteCalendar(aCalendar, listener) {
    let stmts = [];
    aCalendar = aCalendar.wrappedJSObject;

    if (this.mDeleteEventExtras) {
      for (let stmt of this.mDeleteEventExtras) {
        stmts.push(this.prepareStatement(stmt));
      }
    }

    if (this.mDeleteTodoExtras) {
      for (let stmt of this.mDeleteTodoExtras) {
        stmts.push(this.prepareStatement(stmt));
      }
    }

    stmts.push(this.prepareStatement(this.mDeleteAllEvents));
    stmts.push(this.prepareStatement(this.mDeleteAllTodos));
    stmts.push(this.prepareStatement(this.mDeleteAllMetaData));

    await this.executeAsync(stmts);

    try {
      if (listener) {
        listener.onDeleteCalendar(aCalendar, Cr.NS_OK, null);
      }
    } catch (ex) {
      this.logError("error calling listener.onDeleteCalendar", ex);
    }
  },

  mRelaxedMode: undefined,
  get relaxedMode() {
    if (this.mRelaxedMode === undefined) {
      this.mRelaxedMode = this.getProperty("relaxedMode");
    }
    return this.mRelaxedMode;
  },

  //
  // calICalendar interface
  //

  getProperty(aName) {
    switch (aName) {
      case "cache.supported":
        return false;
      case "requiresNetwork":
        return false;
      case "capabilities.priority.supported":
        return true;
      case "capabilities.removeModes":
        return ["delete"];
    }
    return this.__proto__.__proto__.getProperty.apply(this, arguments);
  },

  // readonly attribute AUTF8String type;
  get type() {
    return "storage";
  },

  // attribute AUTF8String id;
  get id() {
    return this.__proto__.__proto__.__lookupGetter__("id").call(this);
  },
  set id(val) {
    let id = this.__proto__.__proto__.__lookupSetter__("id").call(this, val);

    if (!this.mDB && this.uri && this.id) {
      // Prepare the database as soon as we have an id and an uri.
      this.prepareInitDB();
    }
    return id;
  },

  // attribute nsIURI uri;
  get uri() {
    return this.__proto__.__proto__.__lookupGetter__("uri").call(this);
  },
  set uri(aUri) {
    // We can only load once
    if (this.uri) {
      throw Cr.NS_ERROR_FAILURE;
    }

    let uri = this.__proto__.__proto__.__lookupSetter__("uri").call(this, aUri);

    if (!this.mDB && this.uri && this.id) {
      // Prepare the database as soon as we have an id and an uri.
      this.prepareInitDB();
    }

    return uri;
  },

  /**
   * Initialize the Database. This should only be called from the uri or id
   * setter and requires those two attributes to be set.
   */
  prepareInitDB() {
    if (this.uri.schemeIs("file")) {
      let fileURL = this.uri.QueryInterface(Ci.nsIFileURL);
      if (!fileURL) {
        throw new Components.Exception("Invalid file", Cr.NS_ERROR_NOT_IMPLEMENTED);
      }
      // open the database
      this.mDB = Services.storage.openDatabase(fileURL.file);
      upgradeDB(this.mDB);
    } else if (this.uri.schemeIs("moz-storage-calendar")) {
      // New style uri, no need for migration here
      let localDB = cal.provider.getCalendarDirectory();
      localDB.append("local.sqlite");

      this.mDB = Services.storage.openDatabase(localDB);
      upgradeDB(this.mDB);
    } else {
      throw new Components.Exception("Invalid Scheme " + this.uri.spec);
    }

    this.initDB();
    Services.obs.addObserver(this, "profile-before-change");
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "profile-before-change") {
      Services.obs.removeObserver(this, "profile-before-change");
      this.shutdownDB();
    }
  },

  /**
   * Takes care of necessary preparations for most of our statements.
   *
   * @param aStmt         The statement to prepare.
   */
  prepareStatement(aStmt) {
    try {
      aStmt.params.cal_id = this.id;
      this.mLastStatement = aStmt;
    } catch (e) {
      this.logError("prepareStatement exception", e);
    }
    return aStmt;
  },

  /**
   * Executes a statement using an item as a parameter.
   *
   * @param aStmt         The statement to execute.
   * @param aIdParam      The name of the parameter referring to the item id.
   * @param aId           The id of the item.
   */
  executeSyncItemStatement(aStmt, aIdParam, aId) {
    try {
      aStmt.params.cal_id = this.id;
      aStmt.params[aIdParam] = aId;
      aStmt.executeStep();
    } catch (e) {
      this.logError("executeSyncItemStatement exception", e);
      throw e;
    } finally {
      aStmt.reset();
    }
  },

  prepareAsyncStatement(aStmts, aStmt) {
    if (!aStmts.has(aStmt)) {
      aStmts.set(aStmt, aStmt.newBindingParamsArray());
    }
    return aStmts.get(aStmt);
  },

  prepareAsyncParams(aArray) {
    let params = aArray.newBindingParams();
    params.bindByName("cal_id", this.id);
    return params;
  },

  prepareItemStatement(aStmts, aStmt, aIdParam, aId) {
    aStmt.params.cal_id = this.id;
    aStmt.params[aIdParam] = aId;
    aStmts.push(aStmt);
  },

  executeAsync(aStmts, aCallback) {
    if (!Array.isArray(aStmts)) {
      aStmts = [aStmts];
    }
    return new Promise((resolve, reject) => {
      this.mDB.executeAsync(aStmts, {
        resultPromises: [],

        handleResult(aResultSet) {
          this.resultPromises.push(this.handleResultInner(aResultSet));
        },
        async handleResultInner(aResultSet) {
          let row = aResultSet.getNextRow();
          while (row) {
            try {
              await aCallback(row);
            } catch (ex) {
              this.handleError(ex);
            }
            if (this.finishCalled) {
              this.logError(
                "Async query completed before all rows consumed. This should never happen."
              );
            }
            row = aResultSet.getNextRow();
          }
        },
        handleError(aError) {
          cal.WARN(aError);
        },
        async handleCompletion(aReason) {
          await Promise.all(this.resultPromises);

          switch (aReason) {
            case Ci.mozIStorageStatementCallback.REASON_FINISHED:
              this.finishCalled = true;
              resolve();
              break;
            case Ci.mozIStorageStatementCallback.REASON_CANCELLED:
              reject(Components.Exception("async statement was cancelled", Cr.NS_ERROR_ABORT));
              break;
            default:
              reject(Components.Exception("error executing async statement", Cr.NS_ERROR_FAILURE));
              break;
          }
        },
      });
    });
  },

  refresh() {
    // no-op
  },

  // void addItem( in calIItemBase aItem, in calIOperationListener aListener );
  addItem(aItem, aListener) {
    let newItem = aItem.clone();
    return this.adoptItem(newItem, aListener);
  },

  // void adoptItem( in calIItemBase aItem, in calIOperationListener aListener );
  async adoptItem(aItem, aListener) {
    if (this.readOnly) {
      this.notifyOperationComplete(
        aListener,
        Ci.calIErrors.CAL_IS_READONLY,
        Ci.calIOperationListener.ADD,
        null,
        "Calendar is readonly"
      );
      return;
    }

    if (aItem.id == null) {
      // is this an error?  Or should we generate an IID?
      aItem.id = cal.getUUID();
    } else {
      let olditem = await this.getItemById(aItem.id);
      if (olditem) {
        if (this.relaxedMode) {
          // we possibly want to interact with the user before deleting
          await this.deleteItemById(aItem.id, true);
        } else {
          this.notifyOperationComplete(
            aListener,
            Ci.calIErrors.DUPLICATE_ID,
            Ci.calIOperationListener.ADD,
            aItem.id,
            "ID already exists for addItem"
          );
          return;
        }
      }
    }

    let parentItem = aItem.parentItem;
    if (parentItem != aItem) {
      parentItem = parentItem.clone();
      parentItem.recurrenceInfo.modifyException(aItem, true);
    }
    parentItem.calendar = this.superCalendar;
    parentItem.makeImmutable();

    await this.flushItem(parentItem, null);

    // notify the listener
    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.ADD,
      aItem.id,
      aItem
    );

    // notify observers
    this.observers.notify("onAddItem", [aItem]);
  },

  // void modifyItem( in calIItemBase aNewItem, in calIItemBase aOldItem, in calIOperationListener aListener );
  // Actually uses doModifyItem
  modifyItem(aNewItem, aOldItem, aListener) {
    let self = this;

    // HACK Just modifying the item would clear the offline flag, we need to
    // retrieve the flag and pass it to the real modify function.
    let offlineJournalFlagListener = {
      onGetResult(calendar, status, opType, id, detail) {},
      onOperationComplete(opcalendar, status, opType, id, offlineFlag) {
        self.doModifyItem(aNewItem, aOldItem, aListener, offlineFlag);
      },
    };
    this.getItemOfflineFlag(aOldItem, offlineJournalFlagListener);
  },

  async doModifyItem(aNewItem, aOldItem, aListener, offlineFlag) {
    let oldOfflineFlag = offlineFlag;
    if (this.readOnly) {
      this.notifyOperationComplete(
        aListener,
        Ci.calIErrors.CAL_IS_READONLY,
        Ci.calIOperationListener.MODIFY,
        null,
        "Calendar is readonly"
      );
      return null;
    }
    if (!aNewItem) {
      throw Cr.NS_ERROR_INVALID_ARG;
    }

    let self = this;
    function reportError(errStr, errId) {
      self.notifyOperationComplete(
        aListener,
        errId ? errId : Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.MODIFY,
        aNewItem.id,
        errStr
      );
      return null;
    }

    if (aNewItem.id == null) {
      // this is definitely an error
      return reportError("ID for modifyItem item is null");
    }

    let modifiedItem = aNewItem.parentItem.clone();
    if (this.getProperty("capabilities.propagate-sequence")) {
      // Ensure the exception, its parent and the other exceptions have the
      // same sequence number, to make sure we can send our changes to the
      // server if the event has been updated via the blue bar
      let newSequence = aNewItem.getProperty("SEQUENCE");
      this._propagateSequence(modifiedItem, newSequence);
    }

    // Ensure that we're looking at the base item if we were given an
    // occurrence.  Later we can optimize this.
    if (aNewItem.parentItem != aNewItem) {
      modifiedItem.recurrenceInfo.modifyException(aNewItem, false);
    }

    // If no old item was passed, then we should overwrite in any case.
    // Pick up the old item from the database and use this as an old item
    // later on.
    if (!aOldItem) {
      aOldItem = await this.getItemById(aNewItem.id);
    }

    if (this.relaxedMode) {
      // We've already filled in the old item above, if this doesn't exist
      // then just take the current item as its old version
      if (!aOldItem) {
        aOldItem = aNewItem;
      }
      aOldItem = aOldItem.parentItem;
    } else {
      let storedOldItem = null;
      if (aOldItem) {
        storedOldItem = await this.getItemById(aOldItem.id);
      }
      if (!aOldItem || !storedOldItem) {
        // no old item found?  should be using addItem, then.
        return reportError("ID does not already exist for modifyItem");
      }
      aOldItem = aOldItem.parentItem;

      if (aOldItem.generation != storedOldItem.generation) {
        return reportError("generation too old for for modifyItem");
      }

      // xxx todo: this only modified master item's generation properties
      //           I start asking myself why we need a separate X-MOZ-GENERATION.
      //           Just for the sake of checking inconsistencies of modifyItem calls?
      if (aOldItem.generation == modifiedItem.generation) {
        // has been cloned and modified
        // Only take care of incrementing the generation if relaxed mode is
        // off. Users of relaxed mode need to take care of this themselves.
        modifiedItem.generation += 1;
      }
    }

    modifiedItem.makeImmutable();
    await this.flushItem(modifiedItem, aOldItem);
    await this.setOfflineJournalFlag(aNewItem, oldOfflineFlag);

    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.MODIFY,
      modifiedItem.id,
      modifiedItem
    );

    // notify observers
    this.observers.notify("onModifyItem", [modifiedItem, aOldItem]);
    return null;
  },

  // void deleteItem( in string id, in calIOperationListener aListener );
  async deleteItem(aItem, aListener) {
    if (this.readOnly) {
      this.notifyOperationComplete(
        aListener,
        Ci.calIErrors.CAL_IS_READONLY,
        Ci.calIOperationListener.DELETE,
        null,
        "Calendar is readonly"
      );
      return;
    }
    if (aItem.parentItem != aItem) {
      aItem.parentItem.recurrenceInfo.removeExceptionFor(aItem.recurrenceId);
      // xxx todo: would we want to support this case? Removing an occurrence currently results
      //           in a modifyItem(parent)
      return;
    }

    if (aItem.id == null) {
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.DELETE,
        null,
        "ID is null for deleteItem"
      );
      return;
    }

    await this.deleteItemById(aItem.id);

    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.DELETE,
      aItem.id,
      aItem
    );

    // notify observers
    this.observers.notify("onDeleteItem", [aItem]);
  },

  // void getItem( in string id, in calIOperationListener aListener );
  async getItem(aId, aListener) {
    if (!aListener) {
      return;
    }

    let item = await this.getItemById(aId);
    if (!item) {
      // querying by id is a valid use case, even if no item is returned:
      this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, aId, null);
      return;
    }

    let item_iid = null;
    if (cal.item.isEvent(item)) {
      item_iid = Ci.calIEvent;
    } else if (cal.item.isToDo(item)) {
      item_iid = Ci.calITodo;
    } else {
      this.notifyOperationComplete(
        aListener,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.GET,
        aId,
        "Can't deduce item type based on QI"
      );
      return;
    }

    aListener.onGetResult(this.superCalendar, Cr.NS_OK, item_iid, null, [item]);

    this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, aId, null);
  },

  // void getItems( in unsigned long aItemFilter, in unsigned long aCount,
  //                in calIDateTime aRangeStart, in calIDateTime aRangeEnd,
  //                in calIOperationListener aListener );
  async getItems(aItemFilter, aCount, aRangeStart, aRangeEnd, aListener) {
    if (!aListener) {
      return;
    }

    let self = this;

    let startTime = -0x7fffffffffffffff;
    // endTime needs to be the max value a PRTime can be
    let endTime = 0x7fffffffffffffff;
    let count = 0;
    if (aRangeStart) {
      startTime = aRangeStart.nativeTime;
    }
    if (aRangeEnd) {
      endTime = aRangeEnd.nativeTime;
    }

    let wantUnrespondedInvitations =
      (aItemFilter & kCalICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION) != 0;
    let superCal;
    try {
      superCal = this.superCalendar.QueryInterface(Ci.calISchedulingSupport);
    } catch (exc) {
      wantUnrespondedInvitations = false;
    }
    function checkUnrespondedInvitation(item) {
      let att = superCal.getInvitedAttendee(item);
      return att && att.participationStatus == "NEEDS-ACTION";
    }

    let wantEvents = (aItemFilter & kCalICalendar.ITEM_FILTER_TYPE_EVENT) != 0;
    let wantTodos = (aItemFilter & kCalICalendar.ITEM_FILTER_TYPE_TODO) != 0;
    let asOccurrences = (aItemFilter & kCalICalendar.ITEM_FILTER_CLASS_OCCURRENCES) != 0;
    let wantOfflineDeletedItems = (aItemFilter & kCalICalendar.ITEM_FILTER_OFFLINE_DELETED) != 0;
    let wantOfflineCreatedItems = (aItemFilter & kCalICalendar.ITEM_FILTER_OFFLINE_CREATED) != 0;
    let wantOfflineModifiedItems = (aItemFilter & kCalICalendar.ITEM_FILTER_OFFLINE_MODIFIED) != 0;

    if (!wantEvents && !wantTodos) {
      // nothing to do
      this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);
      return;
    }

    // HACK because recurring offline events/todos objects don't have offline_journal information
    // Hence we need to update the mRecEventCacheOfflineFlags and  mRecTodoCacheOfflineFlags hash-tables
    // It can be an expensive operation but is only used in Online Reconciliation mode
    if (wantOfflineCreatedItems | wantOfflineDeletedItems | wantOfflineModifiedItems) {
      this.mRecItemCachePromise = null;
    }

    await this.assureRecurringItemCaches();

    let itemCompletedFilter = (aItemFilter & kCalICalendar.ITEM_FILTER_COMPLETED_YES) != 0;
    let itemNotCompletedFilter = (aItemFilter & kCalICalendar.ITEM_FILTER_COMPLETED_NO) != 0;

    function checkCompleted(item) {
      return item.isCompleted ? itemCompletedFilter : itemNotCompletedFilter;
    }

    // sending items to the listener 1 at a time sucks. instead,
    // queue them up.
    // if we ever have more than maxQueueSize items outstanding,
    // call the listener.  Calling with null theItems forces
    // a send and a queue clear.
    let maxQueueSize = 10;
    let queuedItems = [];
    let queuedItemsIID;
    function queueItems(theItems, theIID) {
      // if we're about to start sending a different IID,
      // flush the queue
      if (theIID && queuedItemsIID != theIID) {
        if (queuedItemsIID) {
          queueItems(null);
        }
        queuedItemsIID = theIID;
      }

      if (theItems) {
        queuedItems = queuedItems.concat(theItems);
      }

      if (queuedItems.length != 0 && (!theItems || queuedItems.length > maxQueueSize)) {
        aListener.onGetResult(self.superCalendar, Cr.NS_OK, queuedItemsIID, null, queuedItems);
        queuedItems = [];
      }
    }

    // helper function to handle converting a row to an item,
    // expanding occurrences, and queue the items for the listener
    function handleResultItem(item, theIID, optionalFilterFunc) {
      if (item.recurrenceInfo && item.recurrenceInfo.recurrenceEndDate < startTime) {
        return 0;
      }

      let expandedItems = [];
      if (item.recurrenceInfo && asOccurrences) {
        // If the item is recurring, get all occurrences that fall in
        // the range. If the item doesn't fall into the range at all,
        // this expands to 0 items.
        expandedItems = item.recurrenceInfo.getOccurrences(aRangeStart, aRangeEnd, 0);
        if (wantUnrespondedInvitations) {
          expandedItems = expandedItems.filter(checkUnrespondedInvitation);
        }
      } else if (
        (!wantUnrespondedInvitations || checkUnrespondedInvitation(item)) &&
        cal.item.checkIfInRange(item, aRangeStart, aRangeEnd)
      ) {
        // If no occurrences are wanted, check only the parent item.
        // This will be changed with bug 416975.
        expandedItems = [item];
      }

      if (expandedItems.length) {
        if (optionalFilterFunc) {
          expandedItems = expandedItems.filter(optionalFilterFunc);
        }
        queueItems(expandedItems, theIID);
      }

      return expandedItems.length;
    }

    // check the count and send end if count is exceeded
    function checkCount() {
      if (aCount && count >= aCount) {
        // flush queue
        queueItems(null);

        // send operation complete
        self.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);

        // tell caller we're done
        return true;
      }

      return false;
    }

    // First fetch all the events
    if (wantEvents) {
      let params; // stmt params
      let resultItems = [];
      let requestedOfflineJournal = null;

      if (wantOfflineDeletedItems) {
        requestedOfflineJournal = cICL.OFFLINE_FLAG_DELETED_RECORD;
      } else if (wantOfflineCreatedItems) {
        requestedOfflineJournal = cICL.OFFLINE_FLAG_CREATED_RECORD;
      } else if (wantOfflineModifiedItems) {
        requestedOfflineJournal = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
      }

      // first get non-recurring events that happen to fall within the range
      //
      try {
        this.prepareStatement(this.mSelectNonRecurringEventsByRange);
        params = this.mSelectNonRecurringEventsByRange.params;
        params.range_start = startTime;
        params.range_end = endTime;
        params.start_offset = aRangeStart ? aRangeStart.timezoneOffset * USECS_PER_SECOND : 0;
        params.end_offset = aRangeEnd ? aRangeEnd.timezoneOffset * USECS_PER_SECOND : 0;
        params.offline_journal = requestedOfflineJournal;

        await this.executeAsync(this.mSelectNonRecurringEventsByRange, async row => {
          let event = await this.getEventFromRow(row);
          resultItems.push(event);
        });
      } catch (e) {
        this.logError("Error selecting non recurring events by range!\n", e);
      }

      // Process the non-recurring events:
      for (let evitem of resultItems) {
        count += handleResultItem(evitem, Ci.calIEvent);
        if (checkCount()) {
          return;
        }
      }

      // Process the recurring events from the cache
      for (let [id, evitem] of this.mRecEventCache.entries()) {
        let cachedJournalFlag = this.mRecEventCacheOfflineFlags.get(id);
        // No need to return flagged unless asked i.e. requestedOfflineJournal == cachedJournalFlag
        // Return created and modified offline records if requestedOfflineJournal is null alongwith events that have no flag
        if (
          (requestedOfflineJournal == null &&
            cachedJournalFlag != cICL.OFFLINE_FLAG_DELETED_RECORD) ||
          (requestedOfflineJournal != null && cachedJournalFlag == requestedOfflineJournal)
        ) {
          count += handleResultItem(evitem, Ci.calIEvent);
          if (checkCount()) {
            return;
          }
        }
      }
    }

    // if todos are wanted, do them next
    if (wantTodos) {
      let params; // stmt params
      let resultItems = [];
      let requestedOfflineJournal = null;

      if (wantOfflineCreatedItems) {
        requestedOfflineJournal = cICL.OFFLINE_FLAG_CREATED_RECORD;
      } else if (wantOfflineDeletedItems) {
        requestedOfflineJournal = cICL.OFFLINE_FLAG_DELETED_RECORD;
      } else if (wantOfflineModifiedItems) {
        requestedOfflineJournal = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
      }

      // first get non-recurring todos that happen to fall within the range
      try {
        this.prepareStatement(this.mSelectNonRecurringTodosByRange);
        params = this.mSelectNonRecurringTodosByRange.params;
        params.range_start = startTime;
        params.range_end = endTime;
        params.start_offset = aRangeStart ? aRangeStart.timezoneOffset * USECS_PER_SECOND : 0;
        params.end_offset = aRangeEnd ? aRangeEnd.timezoneOffset * USECS_PER_SECOND : 0;
        params.offline_journal = requestedOfflineJournal;

        await this.executeAsync(this.mSelectNonRecurringTodosByRange, async row => {
          let todo = await this.getTodoFromRow(row);
          resultItems.push(todo);
        });
      } catch (e) {
        this.logError("Error selecting non recurring todos by range", e);
      }

      // process the non-recurring todos:
      for (let todoitem of resultItems) {
        count += handleResultItem(todoitem, Ci.calITodo, checkCompleted);
        if (checkCount()) {
          return;
        }
      }

      // Note: Reading the code, completed *occurrences* seems to be broken, because
      //       only the parent item has been filtered; I fixed that.
      //       Moreover item.todo_complete etc seems to be a leftover...

      // process the recurring todos from the cache
      for (let [id, todoitem] of this.mRecTodoCache.entries()) {
        let cachedJournalFlag = this.mRecTodoCacheOfflineFlags.get(id);
        if (
          (requestedOfflineJournal == null &&
            (cachedJournalFlag == cICL.OFFLINE_FLAG_MODIFIED_RECORD ||
              cachedJournalFlag == cICL.OFFLINE_FLAG_CREATED_RECORD ||
              cachedJournalFlag == null)) ||
          (requestedOfflineJournal != null && cachedJournalFlag == requestedOfflineJournal)
        ) {
          count += handleResultItem(todoitem, Ci.calITodo, checkCompleted);
          if (checkCount()) {
            return;
          }
        }
      }
    }

    // flush the queue
    queueItems(null);

    // and finish
    this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);
  },

  async getItemOfflineFlag(aItem, aListener) {
    let flag = null;
    if (aItem) {
      let query = cal.item.isEvent(aItem) ? this.mSelectEvent : this.mSelectTodo;
      this.prepareStatement(query);
      query.params.id = aItem.id;
      try {
        await this.executeAsync(query, row => {
          flag = row.getResultByName("offline_journal") || null;
        });
      } catch (ex) {
        aListener.onOperationComplete(
          this,
          ex.result,
          Ci.calIOperationListener.GET,
          aItem.id,
          aItem
        );
        return;
      }
    }

    // It is possible that aItem can be null, flag provided should be null in this case
    aListener.onOperationComplete(this, Cr.NS_OK, Ci.calIOperationListener.GET, aItem, flag);
  },

  async setOfflineJournalFlag(aItem, flag) {
    let aID = aItem.id;
    let query = cal.item.isEvent(aItem) ? this.mEditEventOfflineFlag : this.mEditTodoOfflineFlag;
    this.prepareStatement(query);
    query.params.id = aID;
    query.params.offline_journal = flag || null;
    try {
      await this.executeAsync(query);
    } catch (e) {
      this.logError("Error setting offline journal flag for " + aItem.title, e);
    }
  },

  //
  // calIOfflineStorage interface
  //
  async addOfflineItem(aItem, aListener) {
    let newOfflineJournalFlag = cICL.OFFLINE_FLAG_CREATED_RECORD;
    await this.setOfflineJournalFlag(aItem, newOfflineJournalFlag);
    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.ADD,
      aItem.id,
      aItem
    );
  },

  modifyOfflineItem(aItem, aListener) {
    let self = this;
    let opListener = {
      QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
      onGetResult(calendar, status, itemType, detail, items) {},
      async onOperationComplete(calendar, status, opType, id, oldOfflineJournalFlag) {
        let newOfflineJournalFlag = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
        if (
          oldOfflineJournalFlag == cICL.OFFLINE_FLAG_CREATED_RECORD ||
          oldOfflineJournalFlag == cICL.OFFLINE_FLAG_DELETED_RECORD
        ) {
          // Do nothing since a flag of "created" or "deleted" exists
        } else {
          await self.setOfflineJournalFlag(aItem, newOfflineJournalFlag);
        }
        self.notifyOperationComplete(
          aListener,
          Cr.NS_OK,
          Ci.calIOperationListener.MODIFY,
          aItem.id,
          aItem
        );
      },
    };
    this.getItemOfflineFlag(aItem, opListener);
  },

  deleteOfflineItem(aItem, aListener) {
    let self = this;
    let opListener = {
      QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
      onGetResult(calendar, status, itemType, detail, items) {},
      async onOperationComplete(calendar, status, opType, id, oldOfflineJournalFlag) {
        if (oldOfflineJournalFlag) {
          // Delete item if flag is c
          if (oldOfflineJournalFlag == cICL.OFFLINE_FLAG_CREATED_RECORD) {
            await self.deleteItemById(aItem.id);
          } else if (oldOfflineJournalFlag == cICL.OFFLINE_FLAG_MODIFIED_RECORD) {
            await self.setOfflineJournalFlag(aItem, cICL.OFFLINE_FLAG_DELETED_RECORD);
          }
        } else {
          await self.setOfflineJournalFlag(aItem, cICL.OFFLINE_FLAG_DELETED_RECORD);
        }

        self.notifyOperationComplete(
          aListener,
          Cr.NS_OK,
          Ci.calIOperationListener.DELETE,
          aItem.id,
          aItem
        );
        // notify observers
        self.observers.notify("onDeleteItem", [aItem]);
      },
    };
    this.getItemOfflineFlag(aItem, opListener);
  },

  async resetItemOfflineFlag(aItem, aListener) {
    await this.setOfflineJournalFlag(aItem, null);
    this.notifyOperationComplete(
      aListener,
      Cr.NS_OK,
      Ci.calIOperationListener.MODIFY,
      aItem.id,
      aItem
    );
  },

  //
  // database handling
  //

  // database initialization
  // assumes m0DB is valid

  initDB() {
    cal.ASSERT(this.mDB, "Database has not been opened!", true);

    try {
      this.mDB.executeSimpleSQL("PRAGMA journal_mode=WAL");

      this.mSelectEvent = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_events " +
          "WHERE id = :id AND cal_id = :cal_id " +
          " AND recurrence_id IS NULL " +
          "LIMIT 1"
      );

      this.mSelectTodo = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_todos " +
          "WHERE id = :id AND cal_id = :cal_id " +
          " AND recurrence_id IS NULL " +
          "LIMIT 1"
      );

      // The more readable version of the next where-clause is:
      //   WHERE  ((event_end > :range_start OR
      //           (event_end = :range_start AND
      //           event_start = :range_start))
      //          AND event_start < :range_end)
      //
      // but that doesn't work with floating start or end times. The logic
      // is the same though.
      // For readability, a few helpers:
      let floatingEventStart = "event_start_tz = 'floating' AND event_start";
      let nonFloatingEventStart = "event_start_tz != 'floating' AND event_start";
      let floatingEventEnd = "event_end_tz = 'floating' AND event_end";
      let nonFloatingEventEnd = "event_end_tz != 'floating' AND event_end";
      // The query needs to take both floating and non floating into account
      this.mSelectNonRecurringEventsByRange = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_events " +
          "WHERE " +
          " ((" +
          floatingEventEnd +
          " > :range_start + :start_offset) OR " +
          "  (" +
          nonFloatingEventEnd +
          " > :range_start) OR " +
          "  (((" +
          floatingEventEnd +
          " = :range_start + :start_offset) OR " +
          "    (" +
          nonFloatingEventEnd +
          " = :range_start)) AND " +
          "   ((" +
          floatingEventStart +
          " = :range_start + :start_offset) OR " +
          "    (" +
          nonFloatingEventStart +
          " = :range_start)))) " +
          " AND " +
          "  ((" +
          floatingEventStart +
          " < :range_end + :end_offset) OR " +
          "   (" +
          nonFloatingEventStart +
          " < :range_end)) " +
          " AND cal_id = :cal_id AND flags & 16 == 0 AND recurrence_id IS NULL" +
          " AND ((:offline_journal IS NULL " +
          " AND  (offline_journal IS NULL " +
          "  OR   offline_journal != " +
          cICL.OFFLINE_FLAG_DELETED_RECORD +
          ")) " +
          "  OR (offline_journal == :offline_journal))"
      );

      //
      // WHERE (due > rangeStart  AND  (entry IS NULL  OR  entry < rangeEnd)) OR
      //       (due = rangeStart  AND  (entry IS NULL  OR  entry = rangeStart)) OR
      //       (due IS NULL  AND  (entry >= rangeStart  AND  entry < rangeEnd)) OR
      //       (entry IS NULL  AND  (completed > rangeStart  OR  completed IS NULL))
      //
      let floatingTodoEntry = "todo_entry_tz = 'floating' AND todo_entry";
      let nonFloatingTodoEntry = "todo_entry_tz != 'floating' AND todo_entry";
      let floatingTodoDue = "todo_due_tz = 'floating' AND todo_due";
      let nonFloatingTodoDue = "todo_due_tz != 'floating' AND todo_due";
      let floatingCompleted = "todo_completed_tz = 'floating' AND todo_completed";
      let nonFloatingCompleted = "todo_completed_tz != 'floating' AND todo_completed";

      this.mSelectNonRecurringTodosByRange = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_todos " +
          "WHERE " +
          "((((" +
          floatingTodoDue +
          " > :range_start + :start_offset) OR " +
          "   (" +
          nonFloatingTodoDue +
          " > :range_start)) AND " +
          "  ((todo_entry IS NULL) OR " +
          "   ((" +
          floatingTodoEntry +
          " < :range_end + :end_offset) OR " +
          "    (" +
          nonFloatingTodoEntry +
          " < :range_end)))) OR " +
          " (((" +
          floatingTodoDue +
          " = :range_start + :start_offset) OR " +
          "   (" +
          nonFloatingTodoDue +
          " = :range_start)) AND " +
          "  ((todo_entry IS NULL) OR " +
          "   ((" +
          floatingTodoEntry +
          " = :range_start + :start_offset) OR " +
          "    (" +
          nonFloatingTodoEntry +
          " = :range_start)))) OR " +
          " ((todo_due IS NULL) AND " +
          "  (((" +
          floatingTodoEntry +
          " >= :range_start + :start_offset) OR " +
          "    (" +
          nonFloatingTodoEntry +
          " >= :range_start)) AND " +
          "   ((" +
          floatingTodoEntry +
          " < :range_end + :end_offset) OR " +
          "    (" +
          nonFloatingTodoEntry +
          " < :range_end)))) OR " +
          " ((todo_entry IS NULL) AND " +
          "  (((" +
          floatingCompleted +
          " > :range_start + :start_offset) OR " +
          "    (" +
          nonFloatingCompleted +
          " > :range_start)) OR " +
          "   (todo_completed IS NULL)))) " +
          " AND cal_id = :cal_id AND flags & 16 == 0 AND recurrence_id IS NULL " +
          " AND ((:offline_journal IS NULL" +
          " AND  (offline_journal IS NULL" +
          "  OR   offline_journal != " +
          cICL.OFFLINE_FLAG_DELETED_RECORD +
          ")) " +
          "  OR (offline_journal == :offline_journal))"
      );

      this.mSelectEventsWithRecurrence = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_events " +
          " WHERE flags & 16 == 16 " +
          "   AND cal_id = :cal_id AND recurrence_id is NULL"
      );

      this.mSelectTodosWithRecurrence = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_todos " +
          " WHERE flags & 16 == 16 " +
          "   AND cal_id = :cal_id AND recurrence_id IS NULL"
      );

      this.mSelectEventExceptions = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_events " +
          "WHERE id = :id AND cal_id = :cal_id" +
          " AND recurrence_id IS NOT NULL"
      );
      this.mSelectAllEventExceptions = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_events WHERE cal_id = :cal_id AND recurrence_id IS NOT NULL"
      );

      this.mSelectTodoExceptions = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_todos " +
          "WHERE id = :id AND cal_id = :cal_id" +
          " AND recurrence_id IS NOT NULL"
      );
      this.mSelectAllTodoExceptions = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_todos WHERE cal_id = :cal_id AND recurrence_id IS NOT NULL"
      );

      this.mSelectAttendeesForItem = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_attendees " +
          "WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );

      this.mSelectAttendeesForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_attendees " +
          "WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id = :recurrence_id" +
          " AND recurrence_id_tz = :recurrence_id_tz"
      );
      this.mSelectAllAttendees = this.mDB.createAsyncStatement(
        "SELECT item_id, icalString FROM cal_attendees " +
          "WHERE cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );

      this.mSelectPropertiesForItem = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_properties" +
          " WHERE item_id = :item_id" +
          "   AND cal_id = :cal_id" +
          "   AND recurrence_id IS NULL"
      );

      this.mSelectPropertiesForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_properties " +
          "WHERE item_id = :item_id AND cal_id = :cal_id" +
          "  AND recurrence_id = :recurrence_id" +
          "  AND recurrence_id_tz = :recurrence_id_tz"
      );
      this.mSelectAllProperties = this.mDB.createAsyncStatement(
        "SELECT item_id, key, value FROM cal_properties" +
          " WHERE cal_id = :cal_id" +
          "   AND recurrence_id IS NULL"
      );

      this.mSelectRecurrenceForItem = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_recurrence WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mSelectAllRecurrences = this.mDB.createAsyncStatement(
        "SELECT item_id, icalString FROM cal_recurrence WHERE cal_id = :cal_id"
      );

      this.mSelectAttachmentsForItem = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_attachments " +
          "WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );
      this.mSelectAttachmentsForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_attachments" +
          " WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id = :recurrence_id" +
          " AND recurrence_id_tz = :recurrence_id_tz"
      );
      this.mSelectAllAttachments = this.mDB.createAsyncStatement(
        "SELECT item_id, icalString FROM cal_attachments " +
          "WHERE cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );

      this.mSelectRelationsForItem = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_relations " +
          "WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );
      this.mSelectRelationsForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        "SELECT * FROM cal_relations" +
          " WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id = :recurrence_id" +
          " AND recurrence_id_tz = :recurrence_id_tz"
      );
      this.mSelectAllRelations = this.mDB.createAsyncStatement(
        "SELECT item_id, icalString FROM cal_relations " +
          "WHERE cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );

      this.mSelectMetaData = this.mDB.createStatement(
        "SELECT * FROM cal_metadata WHERE item_id = :item_id AND cal_id = :cal_id"
      );

      this.mSelectAllMetaData = this.mDB.createStatement(
        "SELECT * FROM cal_metadata WHERE cal_id = :cal_id"
      );

      this.mSelectAlarmsForItem = this.mDB.createAsyncStatement(
        "SELECT icalString FROM cal_alarms" +
          " WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );

      this.mSelectAlarmsForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        "SELECT icalString FROM cal_alarms" +
          " WHERE item_id = :item_id AND cal_id = :cal_id" +
          " AND recurrence_id = :recurrence_id" +
          " AND recurrence_id_tz = :recurrence_id_tz"
      );
      this.mSelectAllAlarms = this.mDB.createAsyncStatement(
        "SELECT item_id, icalString FROM cal_alarms" +
          " WHERE cal_id = :cal_id" +
          " AND recurrence_id IS NULL"
      );

      // insert statements
      this.mInsertEvent = this.mDB.createAsyncStatement(
        "INSERT INTO cal_events " +
          "  (cal_id, id, time_created, last_modified, " +
          "   title, priority, privacy, ical_status, flags, " +
          "   event_start, event_start_tz, event_end, event_end_tz, event_stamp, " +
          "   recurrence_id, recurrence_id_tz, alarm_last_ack) " +
          "VALUES (:cal_id, :id, :time_created, :last_modified, " +
          "        :title, :priority, :privacy, :ical_status, :flags, " +
          "        :event_start, :event_start_tz, :event_end, :event_end_tz, :event_stamp, " +
          "        :recurrence_id, :recurrence_id_tz, :alarm_last_ack)"
      );

      this.mInsertTodo = this.mDB.createAsyncStatement(
        "INSERT INTO cal_todos " +
          "  (cal_id, id, time_created, last_modified, " +
          "   title, priority, privacy, ical_status, flags, " +
          "   todo_entry, todo_entry_tz, todo_due, todo_due_tz, todo_stamp, " +
          "   todo_completed, todo_completed_tz, todo_complete, " +
          "   recurrence_id, recurrence_id_tz, alarm_last_ack)" +
          "VALUES (:cal_id, :id, :time_created, :last_modified, " +
          "        :title, :priority, :privacy, :ical_status, :flags, " +
          "        :todo_entry, :todo_entry_tz, :todo_due, :todo_due_tz, :todo_stamp, " +
          "        :todo_completed, :todo_completed_tz, :todo_complete, " +
          "        :recurrence_id, :recurrence_id_tz, :alarm_last_ack)"
      );
      this.mInsertProperty = this.mDB.createAsyncStatement(
        "INSERT INTO cal_properties (cal_id, item_id, recurrence_id, recurrence_id_tz, key, value) " +
          "VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :key, :value)"
      );
      this.mInsertAttendee = this.mDB.createAsyncStatement(
        "INSERT INTO cal_attendees " +
          "  (cal_id, item_id, recurrence_id, recurrence_id_tz, icalString) " +
          "VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :icalString)"
      );
      this.mInsertRecurrence = this.mDB.createAsyncStatement(
        "INSERT INTO cal_recurrence " +
          "  (cal_id, item_id, icalString) " +
          "VALUES (:cal_id, :item_id, :icalString)"
      );

      this.mInsertAttachment = this.mDB.createAsyncStatement(
        "INSERT INTO cal_attachments " +
          " (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz) " +
          "VALUES (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)"
      );

      this.mInsertRelation = this.mDB.createAsyncStatement(
        "INSERT INTO cal_relations " +
          " (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz) " +
          "VALUES (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)"
      );

      this.mInsertMetaData = this.mDB.createStatement(
        "INSERT INTO cal_metadata" +
          " (cal_id, item_id, value)" +
          " VALUES (:cal_id, :item_id, :value)"
      );

      this.mInsertAlarm = this.mDB.createAsyncStatement(
        "INSERT INTO cal_alarms " +
          "  (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz) " +
          "VALUES  (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)  "
      );
      // Offline Operations
      this.mEditEventOfflineFlag = this.mDB.createStatement(
        "UPDATE cal_events SET offline_journal = :offline_journal" +
          " WHERE id = :id AND cal_id = :cal_id"
      );

      this.mEditTodoOfflineFlag = this.mDB.createStatement(
        "UPDATE cal_todos SET offline_journal = :offline_journal" +
          " WHERE id = :id AND cal_id = :cal_id"
      );

      // delete statements
      this.mDeleteEvent = this.mDB.createAsyncStatement(
        "DELETE FROM cal_events WHERE id = :id AND cal_id = :cal_id"
      );
      this.mDeleteTodo = this.mDB.createAsyncStatement(
        "DELETE FROM cal_todos WHERE id = :id AND cal_id = :cal_id"
      );
      this.mDeleteAttendees = this.mDB.createAsyncStatement(
        "DELETE FROM cal_attendees WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mDeleteProperties = this.mDB.createAsyncStatement(
        "DELETE FROM cal_properties WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mDeleteRecurrence = this.mDB.createAsyncStatement(
        "DELETE FROM cal_recurrence WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mDeleteAttachments = this.mDB.createAsyncStatement(
        "DELETE FROM cal_attachments WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mDeleteRelations = this.mDB.createAsyncStatement(
        "DELETE FROM cal_relations WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mDeleteMetaData = this.mDB.createStatement(
        "DELETE FROM cal_metadata WHERE item_id = :item_id AND cal_id = :cal_id"
      );
      this.mDeleteAlarms = this.mDB.createAsyncStatement(
        "DELETE FROM cal_alarms WHERE item_id = :item_id AND cal_id = :cal_id"
      );

      // These are only used when deleting an entire calendar
      let extrasTables = [
        "cal_attendees",
        "cal_properties",
        "cal_recurrence",
        "cal_attachments",
        "cal_metadata",
        "cal_relations",
        "cal_alarms",
      ];

      this.mDeleteEventExtras = [];
      this.mDeleteTodoExtras = [];

      for (let table in extrasTables) {
        this.mDeleteEventExtras[table] = this.mDB.createAsyncStatement(
          "DELETE FROM " +
            extrasTables[table] +
            " WHERE item_id IN" +
            "  (SELECT id FROM cal_events WHERE cal_id = :cal_id)" +
            " AND cal_id = :cal_id"
        );
        this.mDeleteTodoExtras[table] = this.mDB.createAsyncStatement(
          "DELETE FROM " +
            extrasTables[table] +
            " WHERE item_id IN" +
            "  (SELECT id FROM cal_todos WHERE cal_id = :cal_id)" +
            " AND cal_id = :cal_id"
        );
      }

      // Note that you must delete the "extras" _first_ using the above two
      // statements, before you delete the events themselves.
      this.mDeleteAllEvents = this.mDB.createAsyncStatement(
        "DELETE from cal_events WHERE cal_id = :cal_id"
      );
      this.mDeleteAllTodos = this.mDB.createAsyncStatement(
        "DELETE from cal_todos WHERE cal_id = :cal_id"
      );

      this.mDeleteAllMetaData = this.mDB.createStatement(
        "DELETE FROM cal_metadata WHERE cal_id = :cal_id"
      );
    } catch (e) {
      this.logError("Error initializing statements.", e);
    }
  },

  shutdownDB() {
    try {
      if (this.mDeleteAlarms) {
        this.mDeleteAlarms.finalize();
      }
      if (this.mDeleteAllEvents) {
        this.mDeleteAllEvents.finalize();
      }
      if (this.mDeleteAllMetaData) {
        this.mDeleteAllMetaData.finalize();
      }
      if (this.mDeleteAllTodos) {
        this.mDeleteAllTodos.finalize();
      }
      if (this.mDeleteAttachments) {
        this.mDeleteAttachments.finalize();
      }
      if (this.mDeleteAttendees) {
        this.mDeleteAttendees.finalize();
      }
      if (this.mDeleteEvent) {
        this.mDeleteEvent.finalize();
      }
      if (this.mDeleteMetaData) {
        this.mDeleteMetaData.finalize();
      }
      if (this.mDeleteProperties) {
        this.mDeleteProperties.finalize();
      }
      if (this.mDeleteRecurrence) {
        this.mDeleteRecurrence.finalize();
      }
      if (this.mDeleteRelations) {
        this.mDeleteRelations.finalize();
      }
      if (this.mDeleteTodo) {
        this.mDeleteTodo.finalize();
      }
      if (this.mEditEventOfflineFlag) {
        this.mEditEventOfflineFlag.finalize();
      }
      if (this.mEditTodoOfflineFlag) {
        this.mEditTodoOfflineFlag.finalize();
      }
      if (this.mInsertAlarm) {
        this.mInsertAlarm.finalize();
      }
      if (this.mInsertAttachment) {
        this.mInsertAttachment.finalize();
      }
      if (this.mInsertAttendee) {
        this.mInsertAttendee.finalize();
      }
      if (this.mInsertEvent) {
        this.mInsertEvent.finalize();
      }
      if (this.mInsertMetaData) {
        this.mInsertMetaData.finalize();
      }
      if (this.mInsertProperty) {
        this.mInsertProperty.finalize();
      }
      if (this.mInsertRecurrence) {
        this.mInsertRecurrence.finalize();
      }
      if (this.mInsertRelation) {
        this.mInsertRelation.finalize();
      }
      if (this.mInsertTodo) {
        this.mInsertTodo.finalize();
      }
      if (this.mSelectAlarmsForItem) {
        this.mSelectAlarmsForItem.finalize();
      }
      if (this.mSelectAlarmsForItemWithRecurrenceId) {
        this.mSelectAlarmsForItemWithRecurrenceId.finalize();
      }
      if (this.mSelectAllAlarms) {
        this.mSelectAllAlarms.finalize();
      }
      if (this.mSelectAllMetaData) {
        this.mSelectAllMetaData.finalize();
      }
      if (this.mSelectAttachmentsForItem) {
        this.mSelectAttachmentsForItem.finalize();
      }
      if (this.mSelectAttachmentsForItemWithRecurrenceId) {
        this.mSelectAttachmentsForItemWithRecurrenceId.finalize();
      }
      if (this.mSelectAllAttachments) {
        this.mSelectAllAttachments.finalize();
      }
      if (this.mSelectAttendeesForItem) {
        this.mSelectAttendeesForItem.finalize();
      }
      if (this.mSelectAttendeesForItemWithRecurrenceId) {
        this.mSelectAttendeesForItemWithRecurrenceId.finalize();
      }
      if (this.mSelectAllAttendees) {
        this.mSelectAllAttendees.finalize();
      }
      if (this.mSelectEvent) {
        this.mSelectEvent.finalize();
      }
      if (this.mSelectEventExceptions) {
        this.mSelectEventExceptions.finalize();
      }
      if (this.mSelectAllEventExceptions) {
        this.mSelectAllEventExceptions.finalize();
      }
      if (this.mSelectEventsWithRecurrence) {
        this.mSelectEventsWithRecurrence.finalize();
      }
      if (this.mSelectMetaData) {
        this.mSelectMetaData.finalize();
      }
      if (this.mSelectNonRecurringEventsByRange) {
        this.mSelectNonRecurringEventsByRange.finalize();
      }
      if (this.mSelectNonRecurringTodosByRange) {
        this.mSelectNonRecurringTodosByRange.finalize();
      }
      if (this.mSelectPropertiesForItem) {
        this.mSelectPropertiesForItem.finalize();
      }
      if (this.mSelectPropertiesForItemWithRecurrenceId) {
        this.mSelectPropertiesForItemWithRecurrenceId.finalize();
      }
      if (this.mSelectAllProperties) {
        this.mSelectAllProperties.finalize();
      }
      if (this.mSelectRecurrenceForItem) {
        this.mSelectRecurrenceForItem.finalize();
      }
      if (this.mSelectAllRecurrences) {
        this.mSelectAllRecurrences.finalize();
      }
      if (this.mSelectRelationsForItem) {
        this.mSelectRelationsForItem.finalize();
      }
      if (this.mSelectRelationsForItemWithRecurrenceId) {
        this.mSelectRelationsForItemWithRecurrenceId.finalize();
      }
      if (this.mSelectAllRelations) {
        this.mSelectAllRelations.finalize();
      }
      if (this.mSelectTodo) {
        this.mSelectTodo.finalize();
      }
      if (this.mSelectTodoExceptions) {
        this.mSelectTodoExceptions.finalize();
      }
      if (this.mSelectAllTodoExceptions) {
        this.mSelectAllTodoExceptions.finalize();
      }
      if (this.mSelectTodosWithRecurrence) {
        this.mSelectTodosWithRecurrence.finalize();
      }
      if (this.mDeleteEventExtras) {
        for (let stmt of this.mDeleteEventExtras) {
          stmt.finalize();
        }
      }
      if (this.mDeleteTodoExtras) {
        for (let stmt of this.mDeleteTodoExtras) {
          stmt.finalize();
        }
      }

      if (this.mDB) {
        this.mDB.asyncClose();
        this.mDB = null;
      }
    } catch (e) {
      cal.ERROR("Error closing storage database: " + e);
    }
  },

  //
  // database reading functions
  //

  // read in the common ItemBase attributes from aDBRow, and stick
  // them on item
  getItemBaseFromRow(row, item) {
    item.calendar = this.superCalendar;
    item.id = row.getResultByName("id");
    if (row.getResultByName("title")) {
      item.title = row.getResultByName("title");
    }
    if (row.getResultByName("priority")) {
      item.priority = row.getResultByName("priority");
    }
    if (row.getResultByName("privacy")) {
      item.privacy = row.getResultByName("privacy");
    }
    if (row.getResultByName("ical_status")) {
      item.status = row.getResultByName("ical_status");
    }

    if (row.getResultByName("alarm_last_ack")) {
      // alarm acks are always in utc
      item.alarmLastAck = newDateTime(row.getResultByName("alarm_last_ack"), "UTC");
    }

    if (row.getResultByName("recurrence_id")) {
      item.recurrenceId = newDateTime(
        row.getResultByName("recurrence_id"),
        row.getResultByName("recurrence_id_tz")
      );
      if ((row.getResultByName("flags") & CAL_ITEM_FLAG.RECURRENCE_ID_ALLDAY) != 0) {
        item.recurrenceId.isDate = true;
      }
    }

    if (row.getResultByName("time_created")) {
      item.setProperty("CREATED", newDateTime(row.getResultByName("time_created"), "UTC"));
    }

    // This must be done last because the setting of any other property
    // after this would overwrite it again.
    if (row.getResultByName("last_modified")) {
      item.setProperty("LAST-MODIFIED", newDateTime(row.getResultByName("last_modified"), "UTC"));
    }
  },

  cacheItem(item) {
    this.mItemCache.set(item.id, item);
    if (item.recurrenceInfo) {
      if (cal.item.isEvent(item)) {
        this.mRecEventCache.set(item.id, item);
      } else {
        this.mRecTodoCache.set(item.id, item);
      }
    }
  },

  mRecEventCacheOfflineFlags: new Map(),
  mRecTodoCacheOfflineFlags: new Map(),
  assureRecurringItemCaches() {
    if (!this.mRecItemCachePromise) {
      this.mRecItemCachePromise = this._assureRecurringItemCaches();
    }
    return this.mRecItemCachePromise;
  },
  async _assureRecurringItemCaches() {
    // build up recurring event and todo cache with its offline flags,
    // because we need that on every query: for recurring items, we need to
    // query database-wide.. yuck
    this.mRecEventCache.clear();
    this.mRecEventCacheOfflineFlags.clear();
    this.mRecTodoCache.clear();
    this.mRecTodoCacheOfflineFlags.clear();

    let events = [];
    let itemsMap = new Map();
    this.prepareStatement(this.mSelectEventsWithRecurrence);
    await this.executeAsync(this.mSelectEventsWithRecurrence, async row => {
      events.push(row);
    });
    for (let row of events) {
      let item_id = row.getResultByName("id");
      this.mItemCache.delete(item_id);
      let item = await this.getEventFromRow(row, false);
      this.mRecEventCache.set(item_id, item);
      this.mRecEventCacheOfflineFlags.set(item_id, row.getResultByName("offline_journal") || null);
      itemsMap.set(item_id, item);
    }

    let todos = [];
    this.prepareStatement(this.mSelectTodosWithRecurrence);
    await this.executeAsync(this.mSelectTodosWithRecurrence, async row => {
      todos.push(row);
    });
    for (let row of todos) {
      let item_id = row.getResultByName("id");
      this.mItemCache.delete(item_id);
      let item = await this.getTodoFromRow(row, false);
      this.mRecTodoCache.set(item_id, item);
      this.mRecTodoCacheOfflineFlags.set(item_id, row.getResultByName("offline_journal") || null);
      itemsMap.set(item_id, item);
    }

    this.prepareStatement(this.mSelectAllAttendees);
    await this.executeAsync(this.mSelectAllAttendees, row => {
      let item = itemsMap.get(row.getResultByName("item_id"));
      if (!item) {
        return;
      }

      let attendee = cal.createAttendee(row.getResultByName("icalString"));
      if (attendee && attendee.id) {
        if (attendee.isOrganizer) {
          item.organizer = attendee;
        } else {
          item.addAttendee(attendee);
        }
      } else {
        cal.WARN(
          "[calStorageCalendar] Skipping invalid attendee for item '" +
            item.title +
            "' (" +
            item.id +
            ")."
        );
      }
    });

    this.prepareStatement(this.mSelectAllProperties);
    await this.executeAsync(this.mSelectAllProperties, row => {
      let item = itemsMap.get(row.getResultByName("item_id"));
      if (!item) {
        return;
      }

      let name = row.getResultByName("key");
      switch (name) {
        case "DURATION":
          // for events DTEND/DUE is enforced by calEvent/calTodo, so suppress DURATION:
          break;
        case "CATEGORIES": {
          let cats = cal.category.stringToArray(row.getResultByName("value"));
          item.setCategories(cats);
          break;
        }
        default:
          item.setProperty(name, row.getResultByName("value"));
          break;
      }
    });

    this.prepareStatement(this.mSelectAllRecurrences);
    await this.executeAsync(this.mSelectAllRecurrences, row => {
      let item = itemsMap.get(row.getResultByName("item_id"));
      if (!item) {
        return;
      }

      let recInfo = item.recurrenceInfo;
      if (!recInfo) {
        recInfo = cal.createRecurrenceInfo(item);
        item.recurrenceInfo = recInfo;
      }

      let ritem = this.getRecurrenceItemFromRow(row);
      recInfo.appendRecurrenceItem(ritem);
    });

    this.prepareStatement(this.mSelectAllEventExceptions);
    await this.executeAsync(this.mSelectAllEventExceptions, async row => {
      let item = itemsMap.get(row.getResultByName("id"));
      if (!item) {
        return;
      }

      let rec = item.recurrenceInfo;
      let exc = await this.getEventFromRow(row, false);
      rec.modifyException(exc, true);
    });

    this.prepareStatement(this.mSelectAllTodoExceptions);
    await this.executeAsync(this.mSelectAllTodoExceptions, async row => {
      let item = itemsMap.get(row.getResultByName("id"));
      if (!item) {
        return;
      }

      let rec = item.recurrenceInfo;
      let exc = await this.getTodoFromRow(row, false);
      rec.modifyException(exc, true);
    });

    this.prepareStatement(this.mSelectAllAttachments);
    await this.executeAsync(this.mSelectAllAttachments, row => {
      let item = itemsMap.get(row.getResultByName("item_id"));
      if (item) {
        item.addAttachment(cal.createAttachment(row.getResultByName("icalString")));
      }
    });

    this.prepareStatement(this.mSelectAllRelations);
    await this.executeAsync(this.mSelectAllRelations, row => {
      let item = itemsMap.get(row.getResultByName("item_id"));
      if (item) {
        item.addRelation(cal.createRelation(row.getResultByName("icalString")));
      }
    });

    this.prepareStatement(this.mSelectAllAlarms);
    await this.executeAsync(this.mSelectAllAlarms, row => {
      let item = itemsMap.get(row.getResultByName("item_id"));
      if (item) {
        item.addAlarm(cal.createAlarm(row.getResultByName("icalString")));
      }
    });

    for (let item of itemsMap.values()) {
      item.makeImmutable();
      this.mItemCache.set(item.id, item);
    }
  },

  async getEventFromRow(row, getAdditionalData = true) {
    let item = this.mItemCache.get(row.getResultByName("id"));
    if (item) {
      return item;
    }

    item = cal.createEvent();
    let flags = row.getResultByName("flags");

    if (row.getResultByName("event_start")) {
      item.startDate = newDateTime(
        row.getResultByName("event_start"),
        row.getResultByName("event_start_tz")
      );
    }
    if (row.getResultByName("event_end")) {
      item.endDate = newDateTime(
        row.getResultByName("event_end"),
        row.getResultByName("event_end_tz")
      );
    }
    if (row.getResultByName("event_stamp")) {
      item.setProperty("DTSTAMP", newDateTime(row.getResultByName("event_stamp"), "UTC"));
    }
    if (flags & CAL_ITEM_FLAG.EVENT_ALLDAY) {
      item.startDate.isDate = true;
      item.endDate.isDate = true;
    }

    // This must be done last to keep the modification time intact.
    this.getItemBaseFromRow(row, item);
    if (getAdditionalData) {
      await this.getAdditionalDataForItem(item, flags);
      item.makeImmutable();
      this.cacheItem(item);
    }
    return item;
  },

  async getTodoFromRow(row, getAdditionalData = true) {
    let item = this.mItemCache.get(row.getResultByName("id"));
    if (item) {
      return item;
    }

    item = cal.createTodo();

    if (row.getResultByName("todo_entry")) {
      item.entryDate = newDateTime(
        row.getResultByName("todo_entry"),
        row.getResultByName("todo_entry_tz")
      );
    }
    if (row.getResultByName("todo_due")) {
      item.dueDate = newDateTime(
        row.getResultByName("todo_due"),
        row.getResultByName("todo_due_tz")
      );
    }
    if (row.getResultByName("todo_stamp")) {
      item.setProperty("DTSTAMP", newDateTime(row.getResultByName("todo_stamp"), "UTC"));
    }
    if (row.getResultByName("todo_completed")) {
      item.completedDate = newDateTime(
        row.getResultByName("todo_completed"),
        row.getResultByName("todo_completed_tz")
      );
    }
    if (row.getResultByName("todo_complete")) {
      item.percentComplete = row.getResultByName("todo_complete");
    }

    // This must be done last to keep the modification time intact.
    this.getItemBaseFromRow(row, item);
    if (getAdditionalData) {
      await this.getAdditionalDataForItem(item, row.getResultByName("flags"));
      item.makeImmutable();
      this.cacheItem(item);
    }
    return item;
  },

  // after we get the base item, we need to check if we need to pull in
  // any extra data from other tables.  We do that here.

  // We used to use mDBTwo for this, so this can be run while a
  // select is executing but this no longer seems to be required.

  async getAdditionalDataForItem(item, flags) {
    // This is needed to keep the modification time intact.
    let savedLastModifiedTime = item.lastModifiedTime;

    if (flags & CAL_ITEM_FLAG.HAS_ATTENDEES) {
      let selectItem = null;
      if (item.recurrenceId == null) {
        selectItem = this.mSelectAttendeesForItem;
      } else {
        selectItem = this.mSelectAttendeesForItemWithRecurrenceId;
        this.setDateParamHelper(selectItem, "recurrence_id", item.recurrenceId);
      }

      try {
        this.prepareStatement(selectItem);
        selectItem.params.item_id = item.id;
        await this.executeAsync(selectItem, row => {
          let attendee = cal.createAttendee(row.getResultByName("icalString"));
          if (attendee && attendee.id) {
            if (attendee.isOrganizer) {
              item.organizer = attendee;
            } else {
              item.addAttendee(attendee);
            }
          } else {
            cal.WARN(
              `[calStorageCalendar] Skipping invalid attendee for item '${item.title}' (${item.id}).`
            );
          }
        });
      } catch (e) {
        this.logError(`Error getting attendees for item '${item.title}' (${item.id})!`, e);
      }
    }

    if (flags & CAL_ITEM_FLAG.HAS_PROPERTIES) {
      let selectItem = null;
      if (item.recurrenceId == null) {
        selectItem = this.mSelectPropertiesForItem;
      } else {
        selectItem = this.mSelectPropertiesForItemWithRecurrenceId;
        this.setDateParamHelper(selectItem, "recurrence_id", item.recurrenceId);
      }

      try {
        this.prepareStatement(selectItem);
        selectItem.params.item_id = item.id;
        await this.executeAsync(selectItem, row => {
          let name = row.getResultByName("key");
          switch (name) {
            case "DURATION":
              // for events DTEND/DUE is enforced by calEvent/calTodo, so suppress DURATION:
              break;
            case "CATEGORIES": {
              let cats = cal.category.stringToArray(row.getResultByName("value"));
              item.setCategories(cats);
              break;
            }
            default:
              item.setProperty(name, row.getResultByName("value"));
              break;
          }
        });
      } catch (e) {
        this.logError(
          "Error getting extra properties for item '" + item.title + "' (" + item.id + ")!",
          e
        );
      }
    }

    if (flags & CAL_ITEM_FLAG.HAS_RECURRENCE) {
      if (item.recurrenceId) {
        throw Cr.NS_ERROR_UNEXPECTED;
      }

      let recInfo = cal.createRecurrenceInfo(item);
      item.recurrenceInfo = recInfo;

      try {
        this.prepareStatement(this.mSelectRecurrenceForItem);
        this.mSelectRecurrenceForItem.params.item_id = item.id;
        await this.executeAsync(this.mSelectRecurrenceForItem, row => {
          let ritem = this.getRecurrenceItemFromRow(row);
          recInfo.appendRecurrenceItem(ritem);
        });
      } catch (e) {
        this.logError(
          "Error getting recurrence for item '" + item.title + "' (" + item.id + ")!",
          e
        );
      }
    }

    if (flags & CAL_ITEM_FLAG.HAS_EXCEPTIONS) {
      // it's safe that we don't run into this branch again for exceptions
      // (getAdditionalDataForItem->get[Event|Todo]FromRow->getAdditionalDataForItem):
      // every excepton has a recurrenceId and isn't flagged as CAL_ITEM_FLAG.HAS_EXCEPTIONS
      if (item.recurrenceId) {
        throw Cr.NS_ERROR_UNEXPECTED;
      }

      let rec = item.recurrenceInfo;

      if (cal.item.isEvent(item)) {
        this.mSelectEventExceptions.params.id = item.id;
        this.prepareStatement(this.mSelectEventExceptions);
        try {
          await this.executeAsync(this.mSelectEventExceptions, async row => {
            let exc = await this.getEventFromRow(row, false);
            rec.modifyException(exc, true);
          });
        } catch (e) {
          this.logError(
            "Error getting exceptions for event '" + item.title + "' (" + item.id + ")!",
            e
          );
        }
      } else if (cal.item.isToDo(item)) {
        this.mSelectTodoExceptions.params.id = item.id;
        this.prepareStatement(this.mSelectTodoExceptions);
        try {
          await this.executeAsync(this.mSelectTodoExceptions, async row => {
            let exc = await this.getTodoFromRow(row, false);
            rec.modifyException(exc, true);
          });
        } catch (e) {
          this.logError(
            "Error getting exceptions for task '" + item.title + "' (" + item.id + ")!",
            e
          );
        }
      } else {
        throw Cr.NS_ERROR_UNEXPECTED;
      }
    }

    if (flags & CAL_ITEM_FLAG.HAS_ATTACHMENTS) {
      let selectAttachment = this.mSelectAttachmentsForItem;
      if (item.recurrenceId != null) {
        selectAttachment = this.mSelectAttachmentsForItemWithRecurrenceId;
        this.setDateParamHelper(selectAttachment, "recurrence_id", item.recurrenceId);
      }
      try {
        this.prepareStatement(selectAttachment);
        selectAttachment.params.item_id = item.id;
        await this.executeAsync(selectAttachment, row => {
          item.addAttachment(cal.createAttachment(row.getResultByName("icalString")));
        });
      } catch (e) {
        this.logError(
          "Error getting attachments for item '" + item.title + "' (" + item.id + ")!",
          e
        );
      }
    }

    if (flags & CAL_ITEM_FLAG.HAS_RELATIONS) {
      let selectRelation = this.mSelectRelationsForItem;
      if (item.recurrenceId != null) {
        selectRelation = this.mSelectRelationsForItemWithRecurrenceId;
        this.setDateParamHelper(selectRelation, "recurrence_id", item.recurrenceId);
      }
      try {
        this.prepareStatement(selectRelation);
        selectRelation.params.item_id = item.id;
        await this.executeAsync(selectRelation, row => {
          item.addRelation(cal.createRelation(row.getResultByName("icalString")));
        });
      } catch (e) {
        this.logError(
          "Error getting relations for item '" + item.title + "' (" + item.id + ")!",
          e
        );
      }
    }

    if (flags & CAL_ITEM_FLAG.HAS_ALARMS) {
      let selectAlarm = this.mSelectAlarmsForItem;
      if (item.recurrenceId != null) {
        selectAlarm = this.mSelectAlarmsForItemWithRecurrenceId;
        this.setDateParamHelper(selectAlarm, "recurrence_id", item.recurrenceId);
      }
      try {
        selectAlarm.params.item_id = item.id;
        this.prepareStatement(selectAlarm);
        await this.executeAsync(selectAlarm, row => {
          item.addAlarm(cal.createAlarm(row.getResultByName("icalString")));
        });
      } catch (e) {
        this.logError("Error getting alarms for item '" + item.title + "' (" + item.id + ")!", e);
      }
    }

    // Restore the saved modification time
    item.setProperty("LAST-MODIFIED", savedLastModifiedTime);
  },

  getRecurrenceItemFromRow(row, item) {
    let ritem;
    let prop = cal.getIcsService().createIcalPropertyFromString(row.getResultByName("icalString"));
    switch (prop.propertyName) {
      case "RDATE":
      case "EXDATE":
        ritem = Cc["@mozilla.org/calendar/recurrence-date;1"].createInstance(Ci.calIRecurrenceDate);
        break;
      case "RRULE":
      case "EXRULE":
        ritem = cal.createRecurrenceRule();
        break;
      default:
        throw new Error("Unknown recurrence item: " + prop.propertyName);
    }

    ritem.icalProperty = prop;
    return ritem;
  },

  //
  // get item from db or from cache with given iid
  //
  async getItemById(aID) {
    await this.assureRecurringItemCaches();

    // cached?
    let item = this.mItemCache.get(aID);
    if (item) {
      return item;
    }

    try {
      // try events first
      this.prepareStatement(this.mSelectEvent);
      this.mSelectEvent.params.id = aID;
      await this.executeAsync(this.mSelectEvent, async row => {
        item = await this.getEventFromRow(row);
      });
    } catch (e) {
      this.logError("Error selecting item by id " + aID + "!", e);
    }

    // try todo if event fails
    if (!item) {
      try {
        this.prepareStatement(this.mSelectTodo);
        this.mSelectTodo.params.id = aID;
        await this.executeAsync(this.mSelectTodo, async row => {
          item = await this.getTodoFromRow(row);
        });
      } catch (e) {
        this.logError("Error selecting item by id " + aID + "!", e);
      }
    }

    return item;
  },

  //
  // database writing functions
  //

  setDateParamHelper(params, entryname, cdt) {
    if (cdt) {
      params.bindByName(entryname, cdt.nativeTime);
      let timezone = cdt.timezone;
      let ownTz = cal.getTimezoneService().getTimezone(timezone.tzid);
      if (ownTz) {
        // if we know that TZID, we use it
        params.bindByName(entryname + "_tz", ownTz.tzid);
      } else if (timezone.icalComponent) {
        // foreign one
        params.bindByName(entryname + "_tz", timezone.icalComponent.serializeToICS());
      } else {
        // timezone component missing
        params.bindByName(entryname + "_tz", "floating");
      }
    } else {
      params.bindByName(entryname, null);
      params.bindByName(entryname + "_tz", null);
    }
  },

  async flushItem(item, olditem) {
    cal.ASSERT(!item.recurrenceId, "no parent item passed!", true);

    await this.deleteItemById(olditem ? olditem.id : item.id, true);
    // Map {mozIStorageStatement -> mozIStorageBindingParamsArray}
    let stmts = new Map();
    this.prepareItem(stmts, item, olditem);
    for (let [stmt, array] of stmts) {
      stmt.bindParameters(array);
    }
    await this.executeAsync([...stmts.keys()]);

    this.cacheItem(item);
  },

  //
  // The prepare* functions prepare the database bits
  // to write the given item type.  They're to return
  // any bits they want or'd into flags, which will be
  // prepared for writing by prepareEvent/prepareTodo.
  //

  prepareItem(stmts, item, olditem) {
    let flags = 0;

    flags |= this.prepareAttendees(stmts, item, olditem);
    flags |= this.prepareRecurrence(stmts, item, olditem);
    flags |= this.prepareProperties(stmts, item, olditem);
    flags |= this.prepareAttachments(stmts, item, olditem);
    flags |= this.prepareRelations(stmts, item, olditem);
    flags |= this.prepareAlarms(stmts, item, olditem);

    if (cal.item.isEvent(item)) {
      this.prepareEvent(stmts, item, olditem, flags);
    } else if (cal.item.isToDo(item)) {
      this.prepareTodo(stmts, item, olditem, flags);
    } else {
      throw Cr.NS_ERROR_UNEXPECTED;
    }
  },

  prepareEvent(stmts, item, olditem, flags) {
    let array = this.prepareAsyncStatement(stmts, this.mInsertEvent);
    let params = this.prepareAsyncParams(array);

    this.setupItemBaseParams(item, olditem, params);

    this.setDateParamHelper(params, "event_start", item.startDate);
    this.setDateParamHelper(params, "event_end", item.endDate);
    let dtstamp = item.stampTime;
    params.bindByName("event_stamp", dtstamp && dtstamp.nativeTime);

    if (item.startDate.isDate) {
      flags |= CAL_ITEM_FLAG.EVENT_ALLDAY;
    }

    params.bindByName("flags", flags);

    array.addParams(params);
  },

  prepareTodo(stmts, item, olditem, flags) {
    let array = this.prepareAsyncStatement(stmts, this.mInsertTodo);
    let params = this.prepareAsyncParams(array);

    this.setupItemBaseParams(item, olditem, params);

    this.setDateParamHelper(params, "todo_entry", item.entryDate);
    this.setDateParamHelper(params, "todo_due", item.dueDate);
    let dtstamp = item.stampTime;
    params.bindByName("todo_stamp", dtstamp && dtstamp.nativeTime);
    this.setDateParamHelper(params, "todo_completed", item.getProperty("COMPLETED"));

    params.bindByName("todo_complete", item.getProperty("PERCENT-COMPLETED"));

    let someDate = item.entryDate || item.dueDate;
    if (someDate && someDate.isDate) {
      flags |= CAL_ITEM_FLAG.EVENT_ALLDAY;
    }

    params.bindByName("flags", flags);

    array.addParams(params);
  },

  setupItemBaseParams(item, olditem, params) {
    params.bindByName("id", item.id);

    this.setDateParamHelper(params, "recurrence_id", item.recurrenceId);

    let tmp = item.getProperty("CREATED");
    params.bindByName("time_created", tmp && tmp.nativeTime);

    tmp = item.getProperty("LAST-MODIFIED");
    params.bindByName("last_modified", tmp && tmp.nativeTime);

    params.bindByName("title", item.getProperty("SUMMARY"));
    params.bindByName("priority", item.getProperty("PRIORITY"));
    params.bindByName("privacy", item.getProperty("CLASS"));
    params.bindByName("ical_status", item.getProperty("STATUS"));

    params.bindByName("alarm_last_ack", item.alarmLastAck && item.alarmLastAck.nativeTime);
  },

  prepareAttendees(stmts, item, olditem) {
    let attendees = item.getAttendees();
    if (item.organizer) {
      attendees = attendees.concat([]);
      attendees.push(item.organizer);
    }
    if (attendees.length > 0) {
      let array = this.prepareAsyncStatement(stmts, this.mInsertAttendee);
      for (let att of attendees) {
        let params = this.prepareAsyncParams(array);
        params.bindByName("item_id", item.id);
        this.setDateParamHelper(params, "recurrence_id", item.recurrenceId);
        params.bindByName("icalString", att.icalString);
        array.addParams(params);
      }

      return CAL_ITEM_FLAG.HAS_ATTENDEES;
    }

    return 0;
  },

  prepareProperty(stmts, item, propName, propValue) {
    let array = this.prepareAsyncStatement(stmts, this.mInsertProperty);
    let params = this.prepareAsyncParams(array);
    params.bindByName("key", propName);
    let wPropValue = cal.wrapInstance(propValue, Ci.calIDateTime);
    if (wPropValue) {
      params.bindByName("value", wPropValue.nativeTime);
    } else {
      try {
        params.bindByName("value", propValue);
      } catch (e) {
        // The storage service throws an NS_ERROR_ILLEGAL_VALUE in
        // case pval is something complex (i.e not a string or
        // number). Swallow this error, leaving the value empty.
        if (e.result != Cr.NS_ERROR_ILLEGAL_VALUE) {
          throw e;
        }
        params.bindByName("value", null);
      }
    }
    params.bindByName("item_id", item.id);
    this.setDateParamHelper(params, "recurrence_id", item.recurrenceId);
    array.addParams(params);
  },

  prepareProperties(stmts, item, olditem) {
    let ret = 0;
    for (let [name, value] of item.properties) {
      ret = CAL_ITEM_FLAG.HAS_PROPERTIES;
      if (item.isPropertyPromoted(name)) {
        continue;
      }
      this.prepareProperty(stmts, item, name, value);
    }

    let cats = item.getCategories();
    if (cats.length > 0) {
      ret = CAL_ITEM_FLAG.HAS_PROPERTIES;
      this.prepareProperty(stmts, item, "CATEGORIES", cal.category.arrayToString(cats));
    }

    return ret;
  },

  prepareRecurrence(stmts, item, olditem) {
    let flags = 0;

    let rec = item.recurrenceInfo;
    if (rec) {
      flags = CAL_ITEM_FLAG.HAS_RECURRENCE;
      let ritems = rec.getRecurrenceItems();
      let array = this.prepareAsyncStatement(stmts, this.mInsertRecurrence);
      for (let ritem of ritems) {
        let params = this.prepareAsyncParams(array);
        params.bindByName("item_id", item.id);
        params.bindByName("icalString", ritem.icalString);
        array.addParams(params);
      }

      let exceptions = rec.getExceptionIds();
      if (exceptions.length > 0) {
        flags |= CAL_ITEM_FLAG.HAS_EXCEPTIONS;

        // we need to serialize each exid as a separate
        // event/todo; setupItemBase will handle
        // writing the recurrenceId for us
        for (let exid of exceptions) {
          let ex = rec.getExceptionFor(exid);
          if (!ex) {
            throw Cr.NS_ERROR_UNEXPECTED;
          }
          this.prepareItem(stmts, ex, null);
        }
      }
    } else if (item.recurrenceId && item.recurrenceId.isDate) {
      flags |= CAL_ITEM_FLAG.RECURRENCE_ID_ALLDAY;
    }

    return flags;
  },

  prepareAttachments(stmts, item, olditem) {
    let attachments = item.getAttachments();
    if (attachments && attachments.length > 0) {
      let array = this.prepareAsyncStatement(stmts, this.mInsertAttachment);
      for (let att of attachments) {
        let params = this.prepareAsyncParams(array);
        this.setDateParamHelper(params, "recurrence_id", item.recurrenceId);
        params.bindByName("item_id", item.id);
        params.bindByName("icalString", att.icalString);

        array.addParams(params);
      }
      return CAL_ITEM_FLAG.HAS_ATTACHMENTS;
    }
    return 0;
  },

  prepareRelations(stmts, item, olditem) {
    let relations = item.getRelations();
    if (relations && relations.length > 0) {
      let array = this.prepareAsyncStatement(stmts, this.mInsertRelation);
      for (let rel of relations) {
        let params = this.prepareAsyncParams(array);
        this.setDateParamHelper(params, "recurrence_id", item.recurrenceId);
        params.bindByName("item_id", item.id);
        params.bindByName("icalString", rel.icalString);

        array.addParams(params);
      }
      return CAL_ITEM_FLAG.HAS_RELATIONS;
    }
    return 0;
  },

  prepareAlarms(stmts, item, olditem) {
    let alarms = item.getAlarms();
    if (alarms.length < 1) {
      return 0;
    }

    let array = this.prepareAsyncStatement(stmts, this.mInsertAlarm);
    for (let alarm of alarms) {
      let params = this.prepareAsyncParams(array);
      this.setDateParamHelper(params, "recurrence_id", item.recurrenceId);
      params.bindByName("item_id", item.id);
      params.bindByName("icalString", alarm.icalString);

      array.addParams(params);
    }

    return CAL_ITEM_FLAG.HAS_ALARMS;
  },

  /**
   * Deletes the item with the given item id.
   *
   * @param aID           The id of the item to delete.
   * @param aIsModify     If true, then leave in metadata for the item
   */
  async deleteItemById(aID, aIsModify) {
    let stmts = [];
    this.prepareItemStatement(stmts, this.mDeleteAttendees, "item_id", aID);
    this.prepareItemStatement(stmts, this.mDeleteProperties, "item_id", aID);
    this.prepareItemStatement(stmts, this.mDeleteRecurrence, "item_id", aID);
    this.prepareItemStatement(stmts, this.mDeleteEvent, "id", aID);
    this.prepareItemStatement(stmts, this.mDeleteTodo, "id", aID);
    this.prepareItemStatement(stmts, this.mDeleteAttachments, "item_id", aID);
    this.prepareItemStatement(stmts, this.mDeleteRelations, "item_id", aID);
    if (!aIsModify) {
      this.prepareItemStatement(stmts, this.mDeleteMetaData, "item_id", aID);
    }
    this.prepareItemStatement(stmts, this.mDeleteAlarms, "item_id", aID);
    await this.executeAsync(stmts);

    this.mItemCache.delete(aID);
    this.mRecEventCache.delete(aID);
    this.mRecTodoCache.delete(aID);
  },

  //
  // calISyncWriteCalendar interface
  //

  setMetaData(id, value) {
    this.executeSyncItemStatement(this.mDeleteMetaData, "item_id", id);
    try {
      this.prepareStatement(this.mInsertMetaData);
      let params = this.mInsertMetaData.params;
      params.item_id = id;
      params.value = value;
      this.mInsertMetaData.executeStep();
    } catch (e) {
      if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
        this.logError("Unknown error!", e);
      } else {
        // The storage service throws an NS_ERROR_ILLEGAL_VALUE in
        // case pval is something complex (i.e not a string or
        // number). Swallow this error, leaving the value empty.
        this.logError("Error setting metadata for id " + id + "!", e);
      }
    } finally {
      this.mInsertMetaData.reset();
    }
  },

  deleteMetaData(id) {
    this.executeSyncItemStatement(this.mDeleteMetaData, "item_id", id);
  },

  getMetaData(id) {
    let query = this.mSelectMetaData;
    let value = null;
    try {
      this.prepareStatement(query);
      query.params.item_id = id;

      if (query.executeStep()) {
        value = query.row.value;
      }
    } catch (e) {
      this.logError("Error getting metadata for id " + id + "!", e);
    } finally {
      query.reset();
    }

    return value;
  },

  _getAllMetaDataResults(key) {
    let query = this.mSelectAllMetaData;
    let results = [];
    try {
      this.prepareStatement(query);
      while (query.executeStep()) {
        results.push(query.row[key]);
      }
    } catch (e) {
      this.logError(`Error getting all metadata ${key == "item_id" ? "IDs" : "values"} ` + e);
    } finally {
      query.reset();
    }
    return results;
  },

  getAllMetaDataIds() {
    return this._getAllMetaDataResults("item_id");
  },

  getAllMetaDataValues() {
    return this._getAllMetaDataResults("value");
  },

  /**
   * Internal logging function that should be called on any database error,
   * it will log as much info as possible about the database context and
   * last statement so the problem can be investigated more easily.
   *
   * @param message           Error message to log.
   * @param exception         Exception that caused the error.
   */
  logError(message, exception) {
    let logMessage = "Message: " + message;
    if (this.mDB) {
      if (this.mDB.connectionReady) {
        logMessage += "\nConnection Ready: " + this.mDB.connectionReady;
      }
      if (this.mDB.lastError) {
        logMessage += "\nLast DB Error Number: " + this.mDB.lastError;
      }
      if (this.mDB.lastErrorString) {
        logMessage += "\nLast DB Error Message: " + this.mDB.lastErrorString;
      }
      if (this.mDB.databaseFile) {
        logMessage += "\nDatabase File: " + this.mDB.databaseFile.path;
      }
      if (this.mDB.lastInsertRowId) {
        logMessage += "\nLast Insert Row Id: " + this.mDB.lastInsertRowId;
      }
      if (this.mDB.transactionInProgress) {
        logMessage += "\nTransaction In Progress: " + this.mDB.transactionInProgress;
      }
    }

    if (this.mLastStatement) {
      logMessage += "\nLast DB Statement: " + this.mLastStatement;
      // Async statements do not allow enumeration of parameters.
      if (this.mLastStatement instanceof Ci.mozIStorageStatement && this.mLastStatement.params) {
        for (let param in this.mLastStatement.params) {
          logMessage +=
            "\nLast Statement param [" + param + "]: " + this.mLastStatement.params[param];
        }
      }
    }

    if (exception) {
      logMessage += "\nException: " + exception;
    }
    cal.ERROR("[calStorageCalendar] " + logMessage + "\n" + cal.STACK(10));
  },
  /**
   * propagate the given sequence in exceptions. It may be needed by some calendar implementations
   */
  _propagateSequence(aItem, newSequence) {
    if (newSequence) {
      aItem.setProperty("SEQUENCE", newSequence);
    } else {
      aItem.deleteProperty("SEQUENCE");
    }
    let rec = aItem.recurrenceInfo;
    if (rec) {
      let exceptions = rec.getExceptionIds();
      if (exceptions.length > 0) {
        for (let exid of exceptions) {
          let ex = rec.getExceptionFor(exid);
          if (newSequence) {
            ex.setProperty("SEQUENCE", newSequence);
          } else {
            ex.deleteProperty("SEQUENCE");
          }
        }
      }
    }
  },
};
