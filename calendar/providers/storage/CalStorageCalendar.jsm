/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalStorageCalendar"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { upgradeDB } = ChromeUtils.import("resource:///modules/calendar/calStorageUpgrade.jsm");
var { CalStorageModel } = ChromeUtils.import("resource:///modules/calendar/CalStorageModel.jsm");

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
  "calICalendar",
  "calICalendarProvider",
  "calIOfflineStorage",
  "calISchedulingSupport",
  "calISyncWriteCalendar",
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
  mModel: null,

  //
  // calICalendarProvider interface
  //

  get displayName() {
    return cal.l10n.getCalString("storageName");
  },

  get shortName() {
    return "SQLite";
  },

  async deleteCalendar(aCalendar, listener) {
    await this.mModel.deleteCalendar(aCalendar);
    try {
      if (listener) {
        listener.onDeleteCalendar(aCalendar, Cr.NS_OK, null);
      }
    } catch (ex) {
      this.mModel.logError("error calling listener.onDeleteCalendar", ex);
    }
  },

  detectCalendars() {
    throw Components.Exception(
      "calStorageCalendar does not implement detectCalendars",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
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

  get supportsScheduling() {
    return true;
  },

  getSchedulingSupport() {
    return this;
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
    this.__proto__.__proto__.__lookupSetter__("id").call(this, val);

    if (!this.mDB && this.uri && this.id) {
      // Prepare the database as soon as we have an id and an uri.
      this.prepareInitDB();
    }
  },

  // attribute nsIURI uri;
  get uri() {
    return this.__proto__.__proto__.__lookupGetter__("uri").call(this);
  },
  set uri(aUri) {
    // We can only load once
    if (this.uri) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    this.__proto__.__proto__.__lookupSetter__("uri").call(this, aUri);

    if (!this.mDB && this.uri && this.id) {
      // Prepare the database as soon as we have an id and an uri.
      this.prepareInitDB();
    }
  },

  // attribute mozIStorageAsyncConnection db;
  get db() {
    return this.mDB;
  },

  /**
   * Initialize the Database. This should generally only be called from the
   * uri or id setter and requires those two attributes to be set. It may also
   * be called again when the schema version of the database is newer than
   * the version expected by this version of Thunderbird.
   */
  prepareInitDB() {
    if (this.uri.schemeIs("file")) {
      let fileURL = this.uri.QueryInterface(Ci.nsIFileURL);

      if (!fileURL) {
        throw new Components.Exception("Invalid file", Cr.NS_ERROR_NOT_IMPLEMENTED);
      }
      // open the database
      this.mDB = Services.storage.openDatabase(fileURL.file);
    } else if (this.uri.schemeIs("moz-storage-calendar")) {
      // New style uri, no need for migration here
      let localDB = cal.provider.getCalendarDirectory();
      localDB.append("local.sqlite");

      if (!localDB.exists()) {
        // This can happen with a database upgrade and the "too new schema" situation.
        localDB.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o700);
      }

      this.mDB = Services.storage.openDatabase(localDB);
    } else {
      throw new Components.Exception("Invalid Scheme " + this.uri.spec);
    }

    upgradeDB(this);
  },

  afterUpgradeDB() {
    this.initDB();
    Services.obs.addObserver(this, "profile-before-change");
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "profile-before-change") {
      Services.obs.removeObserver(this, "profile-before-change");
      this.shutdownDB();
    }
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
          await this.mModel.deleteItemById(aItem.id, true);
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

    await this.mModel.addItem(parentItem);

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
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
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
    await this.mModel.updateItem(modifiedItem, aOldItem);
    await this.mModel.setOfflineJournalFlag(aNewItem, oldOfflineFlag);

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

    await this.mModel.deleteItemById(aItem.id);

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
    if (item.isEvent()) {
      item_iid = Ci.calIEvent;
    } else if (item.isTodo()) {
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

    let query = {
      rangeStart: aRangeStart,
      rangeEnd: aRangeEnd,
      filters: {
        wantUnrespondedInvitations:
          ((aItemFilter & kCalICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION) != 0) &
          this.superCalendar.supportsScheduling,
        wantEvents: (aItemFilter & kCalICalendar.ITEM_FILTER_TYPE_EVENT) != 0,
        wantTodos: (aItemFilter & kCalICalendar.ITEM_FILTER_TYPE_TODO) != 0,
        asOccurrences: (aItemFilter & kCalICalendar.ITEM_FILTER_CLASS_OCCURRENCES) != 0,
        wantOfflineDeletedItems: (aItemFilter & kCalICalendar.ITEM_FILTER_OFFLINE_DELETED) != 0,
        wantOfflineCreatedItems: (aItemFilter & kCalICalendar.ITEM_FILTER_OFFLINE_CREATED) != 0,
        wantOfflineModifiedItems: (aItemFilter & kCalICalendar.ITEM_FILTER_OFFLINE_MODIFIED) != 0,
        itemCompletedFilter: (aItemFilter & kCalICalendar.ITEM_FILTER_COMPLETED_YES) != 0,
        itemNotCompletedFilter: (aItemFilter & kCalICalendar.ITEM_FILTER_COMPLETED_NO) != 0,
      },
      count: aCount,
    };

    if ((!query.filters.wantEvents && !query.filters.wantTodos) || this.getProperty("disabled")) {
      // nothing to do
      this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);
      return;
    }

    // HACK because recurring offline events/todos objects don't have offline_journal information
    // Hence we need to update the mRecEventCacheOfflineFlags and  mRecTodoCacheOfflineFlags hash-tables
    // It can be an expensive operation but is only used in Online Reconciliation mode
    if (
      query.filters.wantOfflineCreatedItems |
      query.filters.wantOfflineDeletedItems |
      query.filters.wantOfflineModifiedItems
    ) {
      this.mRecItemCachePromise = null;
    }

    await this.assureRecurringItemCaches();

    await this.mModel.getItems(query, (items, queuedItemsIID) => {
      aListener.onGetResult(this.superCalendar, Cr.NS_OK, queuedItemsIID, null, items);
    });

    // and finish
    this.notifyOperationComplete(aListener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);
  },

  async getItemOfflineFlag(aItem, aListener) {
    let flag = null;
    if (aItem) {
      try {
        flag = await this.mModel.getItemOfflineFlag(aItem);
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

  //
  // calIOfflineStorage interface
  //
  async addOfflineItem(aItem, aListener) {
    let newOfflineJournalFlag = cICL.OFFLINE_FLAG_CREATED_RECORD;
    await this.mModel.setOfflineJournalFlag(aItem, newOfflineJournalFlag);
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
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      onGetResult(calendar, status, itemType, detail, items) {},
      async onOperationComplete(calendar, status, opType, id, oldOfflineJournalFlag) {
        let newOfflineJournalFlag = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
        if (
          oldOfflineJournalFlag == cICL.OFFLINE_FLAG_CREATED_RECORD ||
          oldOfflineJournalFlag == cICL.OFFLINE_FLAG_DELETED_RECORD
        ) {
          // Do nothing since a flag of "created" or "deleted" exists
        } else {
          await self.mModel.setOfflineJournalFlag(aItem, newOfflineJournalFlag);
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
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      onGetResult(calendar, status, itemType, detail, items) {},
      async onOperationComplete(calendar, status, opType, id, oldOfflineJournalFlag) {
        if (oldOfflineJournalFlag) {
          // Delete item if flag is c
          if (oldOfflineJournalFlag == cICL.OFFLINE_FLAG_CREATED_RECORD) {
            await self.mModel.deleteItemById(aItem.id);
          } else if (oldOfflineJournalFlag == cICL.OFFLINE_FLAG_MODIFIED_RECORD) {
            await self.mModel.setOfflineJournalFlag(aItem, cICL.OFFLINE_FLAG_DELETED_RECORD);
          }
        } else {
          await self.mModel.setOfflineJournalFlag(aItem, cICL.OFFLINE_FLAG_DELETED_RECORD);
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
    await this.mModel.setOfflineJournalFlag(aItem, null);
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
  // assumes this.mDB is valid

  initDB() {
    cal.ASSERT(this.mDB, "Database has not been opened!", true);

    try {
      this.mDB.executeSimpleSQL("PRAGMA journal_mode=WAL");
      this.mDB.executeSimpleSQL("PRAGMA cache_size=-10240"); // 10 MiB
      this.mModel = new CalStorageModel(this.mDB, this);

      this.mSelectEvent = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_events
          WHERE id = :id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL
          LIMIT 1`
      );

      this.mSelectTodo = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_todos
          WHERE id = :id 
            AND cal_id = :cal_id
            AND recurrence_id IS NULL
          LIMIT 1`
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
      // The query needs to take both floating and non floating into account.
      this.mSelectNonRecurringEventsByRange = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_events 
         WHERE
          ((${floatingEventEnd} > :range_start + :start_offset) OR 
           (${nonFloatingEventEnd} > :range_start) OR
           (((${floatingEventEnd} = :range_start + :start_offset) OR
             (${nonFloatingEventEnd} = :range_start)) AND
            ((${floatingEventStart} = :range_start + :start_offset) OR
             (${nonFloatingEventStart} = :range_start)))) 
          AND
           ((${floatingEventStart} < :range_end + :end_offset) OR
            (${nonFloatingEventStart} < :range_end))
          AND cal_id = :cal_id AND flags & 16 == 0 AND recurrence_id IS NULL
          AND ((:offline_journal IS NULL
          AND  (offline_journal IS NULL
           OR   offline_journal != ${cICL.OFFLINE_FLAG_DELETED_RECORD}))
           OR (offline_journal == :offline_journal))`
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
        `SELECT * FROM cal_todos
         WHERE
          ((((${floatingTodoDue} > :range_start + :start_offset) OR
             (${nonFloatingTodoDue} > :range_start)) AND
            ((todo_entry IS NULL) OR
             ((${floatingTodoEntry} < :range_end + :end_offset) OR
              (${nonFloatingTodoEntry} < :range_end)))) OR
           (((${floatingTodoDue} = :range_start + :start_offset) OR
             (${nonFloatingTodoDue} = :range_start)) AND
            ((todo_entry IS NULL) OR
             ((${floatingTodoEntry} = :range_start + :start_offset) OR
              (${nonFloatingTodoEntry} = :range_start)))) OR
           ((todo_due IS NULL) AND
            (((${floatingTodoEntry} >= :range_start + :start_offset) OR
              (${nonFloatingTodoEntry} >= :range_start)) AND
             ((${floatingTodoEntry} < :range_end + :end_offset) OR
              (${nonFloatingTodoEntry} < :range_end)))) OR
           ((todo_entry IS NULL) AND
            (((${floatingCompleted} > :range_start + :start_offset) OR
              (${nonFloatingCompleted} > :range_start)) OR
             (todo_completed IS NULL))))
          AND cal_id = :cal_id AND flags & 16 == 0 AND recurrence_id IS NULL
          AND ((:offline_journal IS NULL
          AND  (offline_journal IS NULL
           OR   offline_journal != ${cICL.OFFLINE_FLAG_DELETED_RECORD}))
           OR (offline_journal == :offline_journal))`
      );

      this.mSelectEventsWithRecurrence = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_events
          WHERE flags & 16 == 16
            AND cal_id = :cal_id 
            AND recurrence_id is NULL`
      );

      this.mSelectTodosWithRecurrence = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_todos
          WHERE flags & 16 == 16
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectEventExceptions = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_events
          WHERE id = :id
            AND cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
      );
      this.mSelectAllEventExceptions = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_events
          WHERE cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
      );

      this.mSelectTodoExceptions = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_todos
          WHERE id = :id
            AND cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
      );
      this.mSelectAllTodoExceptions = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_todos 
          WHERE cal_id = :cal_id
            AND recurrence_id IS NOT NULL`
      );

      this.mSelectAttendeesForItem = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_attendees
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectAttendeesForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_attendees
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
      );
      this.mSelectAllAttendees = this.mDB.createAsyncStatement(
        `SELECT item_id, icalString FROM cal_attendees
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectPropertiesForItem = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_properties
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );
      this.mSelectPropertiesForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_properties
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
      );
      this.mSelectAllProperties = this.mDB.createAsyncStatement(
        `SELECT item_id, key, value FROM cal_properties
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectParametersForItem = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_parameters
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );
      this.mSelectParametersForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_parameters
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
      );
      this.mSelectAllParameters = this.mDB.createAsyncStatement(
        `SELECT item_id, key1, key2, value FROM cal_parameters
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectRecurrenceForItem = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_recurrence
          WHERE item_id = :item_id
            AND cal_id = :cal_id`
      );
      this.mSelectAllRecurrences = this.mDB.createAsyncStatement(
        `SELECT item_id, icalString FROM cal_recurrence
          WHERE cal_id = :cal_id`
      );

      this.mSelectAttachmentsForItem = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_attachments
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );
      this.mSelectAttachmentsForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_attachments
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
      );
      this.mSelectAllAttachments = this.mDB.createAsyncStatement(
        `SELECT item_id, icalString FROM cal_attachments
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectRelationsForItem = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_relations
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );
      this.mSelectRelationsForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        `SELECT * FROM cal_relations
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
      );
      this.mSelectAllRelations = this.mDB.createAsyncStatement(
        `SELECT item_id, icalString FROM cal_relations
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectMetaData = this.mDB.createStatement(
        `SELECT * FROM cal_metadata
          WHERE item_id = :item_id
            AND cal_id = :cal_id`
      );

      this.mSelectAllMetaData = this.mDB.createStatement(
        `SELECT * FROM cal_metadata
          WHERE cal_id = :cal_id`
      );

      this.mSelectAlarmsForItem = this.mDB.createAsyncStatement(
        `SELECT icalString FROM cal_alarms
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      this.mSelectAlarmsForItemWithRecurrenceId = this.mDB.createAsyncStatement(
        `SELECT icalString FROM cal_alarms
          WHERE item_id = :item_id
            AND cal_id = :cal_id
            AND recurrence_id = :recurrence_id
            AND recurrence_id_tz = :recurrence_id_tz`
      );
      this.mSelectAllAlarms = this.mDB.createAsyncStatement(
        `SELECT item_id, icalString FROM cal_alarms
          WHERE cal_id = :cal_id
            AND recurrence_id IS NULL`
      );

      // insert statements
      this.mInsertEvent = this.mDB.createAsyncStatement(
        `INSERT INTO cal_events
           (cal_id, id, time_created, last_modified,
            title, priority, privacy, ical_status, flags,
            event_start, event_start_tz, event_end, event_end_tz, event_stamp,
            recurrence_id, recurrence_id_tz, alarm_last_ack)
         VALUES (:cal_id, :id, :time_created, :last_modified,
                 :title, :priority, :privacy, :ical_status, :flags,
                 :event_start, :event_start_tz, :event_end, :event_end_tz, :event_stamp,
                 :recurrence_id, :recurrence_id_tz, :alarm_last_ack)`
      );

      this.mInsertTodo = this.mDB.createAsyncStatement(
        `INSERT INTO cal_todos
           (cal_id, id, time_created, last_modified,
            title, priority, privacy, ical_status, flags,
            todo_entry, todo_entry_tz, todo_due, todo_due_tz, todo_stamp,
            todo_completed, todo_completed_tz, todo_complete,
            recurrence_id, recurrence_id_tz, alarm_last_ack)
         VALUES (:cal_id, :id, :time_created, :last_modified,
                 :title, :priority, :privacy, :ical_status, :flags,
                 :todo_entry, :todo_entry_tz, :todo_due, :todo_due_tz, :todo_stamp,
                 :todo_completed, :todo_completed_tz, :todo_complete,
                 :recurrence_id, :recurrence_id_tz, :alarm_last_ack)`
      );
      this.mInsertProperty = this.mDB.createAsyncStatement(
        `INSERT INTO cal_properties (cal_id, item_id, recurrence_id, recurrence_id_tz, key, value)
         VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :key, :value)`
      );
      this.mInsertParameter = this.mDB.createAsyncStatement(
        `INSERT INTO cal_parameters (cal_id, item_id, recurrence_id, recurrence_id_tz, key1, key2, value)
         VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :key1, :key2, :value)`
      );
      this.mInsertAttendee = this.mDB.createAsyncStatement(
        `INSERT INTO cal_attendees
           (cal_id, item_id, recurrence_id, recurrence_id_tz, icalString)
         VALUES (:cal_id, :item_id, :recurrence_id, :recurrence_id_tz, :icalString)`
      );
      this.mInsertRecurrence = this.mDB.createAsyncStatement(
        `INSERT INTO cal_recurrence
           (cal_id, item_id, icalString)
         VALUES (:cal_id, :item_id, :icalString)`
      );

      this.mInsertAttachment = this.mDB.createAsyncStatement(
        `INSERT INTO cal_attachments
           (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz)
         VALUES (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)`
      );

      this.mInsertRelation = this.mDB.createAsyncStatement(
        `INSERT INTO cal_relations
           (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz)
         VALUES (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)`
      );

      this.mInsertMetaData = this.mDB.createStatement(
        `INSERT INTO cal_metadata
           (cal_id, item_id, value)
         VALUES (:cal_id, :item_id, :value)`
      );

      this.mInsertAlarm = this.mDB.createAsyncStatement(
        `INSERT INTO cal_alarms
           (cal_id, item_id, icalString, recurrence_id, recurrence_id_tz)
         VALUES  (:cal_id, :item_id, :icalString, :recurrence_id, :recurrence_id_tz)`
      );
      // Offline Operations
      this.mEditEventOfflineFlag = this.mDB.createStatement(
        `UPDATE cal_events SET offline_journal = :offline_journal
          WHERE id = :id
            AND cal_id = :cal_id`
      );

      this.mEditTodoOfflineFlag = this.mDB.createStatement(
        `UPDATE cal_todos SET offline_journal = :offline_journal
          WHERE id = :id
            AND cal_id = :cal_id`
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
      this.mDeleteParameters = this.mDB.createAsyncStatement(
        "DELETE FROM cal_parameters WHERE item_id = :item_id AND cal_id = :cal_id"
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
        "cal_parameters",
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
          `DELETE FROM ${extrasTables[table]}
            WHERE item_id IN
             (SELECT id FROM cal_events WHERE cal_id = :cal_id)
            AND cal_id = :cal_id`
        );
        this.mDeleteTodoExtras[table] = this.mDB.createAsyncStatement(
          `DELETE FROM ${extrasTables[table]}
            WHERE item_id IN
             (SELECT id FROM cal_todos WHERE cal_id = :cal_id)
            AND cal_id = :cal_id`
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
      this.mModel.logError("Error initializing statements.", e);
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
      if (this.mDeleteParameters) {
        this.mDeleteParameters.finalize();
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
      if (this.mInsertParameter) {
        this.mInsertParameter.finalize();
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
      if (this.mSelectParametersForItem) {
        this.mSelectParametersForItem.finalize();
      }
      if (this.mSelectParametersForItemWithRecurrenceId) {
        this.mSelectParametersForItemWithRecurrenceId.finalize();
      }
      if (this.mSelectAllParameters) {
        this.mSelectAllParameters.finalize();
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

  cacheItem(item) {
    if (item.recurrenceId) {
      // Do not cache recurring item instances. See bug 1686466.
      return;
    }
    this.mItemCache.set(item.id, item);
    if (item.recurrenceInfo) {
      if (item.isEvent()) {
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
      this.mRecItemCachePromise = this.mModel.assureRecurringItemCaches();
    }
    return this.mRecItemCachePromise;
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

    return this.mModel.getItemById(aID);
  },

  //
  // for items that were cached or stored in previous versions,
  // put Google's HTML description in the right place
  //
  fixGoogleCalendarDescriptionIfNeeded(item) {
    if (item.id && item.id.endsWith("@google.com")) {
      let description = item.getProperty("DESCRIPTION");
      if (description) {
        let altrep = item.getPropertyParameter("DESCRIPTION", "ALTREP");
        if (!altrep) {
          cal.view.fixGoogleCalendarDescription(item);
        }
      }
    }
  },

  //
  // calISyncWriteCalendar interface
  //

  setMetaData(id, value) {
    this.mModel.deleteMetaDataById(id);
    this.mModel.addMetaData(id, value);
  },

  deleteMetaData(id) {
    this.mModel.deleteMetaDataById(id);
  },

  getMetaData(id) {
    return this.mModel.getMetaData(id);
  },

  getAllMetaDataIds() {
    return this.mModel.getAllMetaData("item_id");
  },

  getAllMetaDataValues() {
    return this.mModel.getAllMetaData("value");
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
