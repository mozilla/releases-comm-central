/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalStorageCalendar"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { upgradeDB } = ChromeUtils.import("resource:///modules/calendar/calStorageUpgrade.jsm");
var { CalStorageModel } = ChromeUtils.import("resource:///modules/calendar/CalStorageModel.jsm");
var { CalStorageDatabase } = ChromeUtils.import(
  "resource:///modules/calendar/CalStorageDatabase.jsm"
);

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
  mStorageDb: null,
  mModel: null,
  mItemCache: null,
  mRecItemCachePromise: null,
  mRecEventCache: null,
  mRecTodoCache: null,

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
      this.mStorageDb.logError("error calling listener.onDeleteCalendar", ex);
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

    if (!this.mStorageDb && this.uri && this.id) {
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

    if (!this.mStorageDb && this.uri && this.id) {
      // Prepare the database as soon as we have an id and an uri.
      this.prepareInitDB();
    }
  },

  // attribute mozIStorageAsyncConnection db;
  get db() {
    return this.mStorageDb.db;
  },

  /**
   * Initialize the Database. This should generally only be called from the
   * uri or id setter and requires those two attributes to be set. It may also
   * be called again when the schema version of the database is newer than
   * the version expected by this version of Thunderbird.
   */
  prepareInitDB() {
    this.mStorageDb = CalStorageDatabase.connect(this.uri, this.id);
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
    // Hence we need to update the mRecEventCacheOfflineFlags and mRecTodoCacheOfflineFlags hash-tables
    // It can be an expensive operation but is only used in Online Reconciliation mode
    if (
      (query.filters.wantOfflineCreatedItems ||
        query.filters.wantOfflineDeletedItems ||
        query.filters.wantOfflineModifiedItems) &&
      this.mRecItemCachePromise
    ) {
      // If there's an existing Promise and it's not complete, wait for it - something else is
      // already waiting and we don't want to break that by throwing away the caches. If it IS
      // complete, we'll continue immediately.
      await this.mRecItemCachePromise;
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
  // assumes this.mStorageDb is valid

  initDB() {
    cal.ASSERT(this.mStorageDb, "Database has not been opened!", true);

    try {
      this.mStorageDb.executeSimpleSQL("PRAGMA journal_mode=WAL");
      this.mStorageDb.executeSimpleSQL("PRAGMA cache_size=-10240"); // 10 MiB
      this.mModel = new CalStorageModel(this.mStorageDb, this);
    } catch (e) {
      this.mStorageDb.logError("Error initializing statements.", e);
    }
  },

  shutdownDB() {
    try {
      this.mModel.finalize();
      if (this.mStorageDb) {
        this.mStorageDb.close();
        this.mStorageDb = null;
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
