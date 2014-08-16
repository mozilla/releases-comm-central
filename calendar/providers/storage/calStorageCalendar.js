/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://calendar/modules/calProviderUtils.jsm");
Components.utils.import("resource://calendar/modules/calStorageUpgrade.jsm");
Components.utils.import("resource://calendar/modules/calStorageHelpers.jsm");

const USECS_PER_SECOND = 1000000;
const cIC = Components.interfaces.calICalendar;
const cICL = Components.interfaces.calIChangeLog;
const mISC = Components.interfaces.mozIStorageConnection;
const cIOL = Components.interfaces.calIOperationListener;
const cIE = Components.interfaces.calIErrors;
const mISS = Components.interfaces.mozIStorageStatement;

/**
 * Implements the storage calendar, used for local calendars and the offline cache
 */
function calStorageCalendar() {
    this.initProviderBase();
    this.mItemCache = {};
    this.mFlagCache = {};
    this.mRecEventCache = {};
    this.mRecTodoCache = {};
    this.mRecEventCacheOfflineFlags = {};
    this.mRecTodoCacheOfflineFlags = {};
}
const calStorageCalendarClassID = Components.ID("{b3eaa1c4-5dfe-4c0a-b62a-b3a514218461}");
const calStorageCalendarInterfaces = [
    Components.interfaces.calICalendar,
    Components.interfaces.calICalendarProvider,
    Components.interfaces.calIOfflineStorage,
    Components.interfaces.calISchedulingSupport,
    Components.interfaces.calISyncWriteCalendar,
];
calStorageCalendar.prototype = {
    __proto__: cal.ProviderBase.prototype,
    classID: calStorageCalendarClassID,
    QueryInterface: XPCOMUtils.generateQI(calStorageCalendarInterfaces),
    classInfo: XPCOMUtils.generateCI({
        classID: calStorageCalendarClassID,
        contractID: "@mozilla.org/calendar/calendar;1?type=storage",
        classDescription: "Calendar Storage Provider",
        interfaces: calStorageCalendarInterfaces
    }),

    //
    // private members
    //
    mDB: null,
    mItemCache: null,
    mFlagCache: null,
    mRecItemCacheInited: false,
    mRecEventCache: null,
    mRecTodoCache: null,
    mRecEventCacheOfflineFlags: null,
    mRecTodoCacheOfflineFlags : null,
    mLastStatement: null,

    //
    // calICalendarProvider interface
    //
    get prefChromeOverlay() null,
    get displayName() cal.calGetString("calendar", "storageName"),
    createCalendar: function cSC_createCalendar() {
        throw NS_ERROR_NOT_IMPLEMENTED;
    },

    deleteCalendar: function cSC_deleteCalendar(aCalendar, listener) {
        let self = aCalendar.wrappedJSObject;

        let deleteItems = self.runCalendarStatement(self.mDeleteAllItems, "Error deleting all events").completionPromise;
        let deleteMeta = self.runCalendarStatement(self.mDeleteAllMetaData, "Error deleting all metadata").completionPromise;

        Promise.all([deleteItems, deleteMeta]).then(() => {
            try {
                if (listener) {
                    listener.onDeleteCalendar(aCalendar, Components.results.NS_OK, null);
                }
            } catch (ex) {
                cal.ERROR("error calling listener.onDeleteCalender: " + ex);
            }
        }, (aReason) => {
            listener.onDeleteCalendar(aCalendar, Components.results.NS_ERROR_FAILURE, aReason);
        });
    },

    mRelaxedMode: undefined,
    get relaxedMode() {
        if (this.mRelaxedMode === undefined) {
            this.mRelaxedMode = this.getProperty("relaxedMode");
        }
        return this.mRelaxedMode;
    },

    // calICalendar interface
    getProperty: function cSC_getProperty(aName) {
        switch (aName) {
            case "cache.supported":
                return false;
            case "requiresNetwork":
                return false;
        }
        return this.__proto__.__proto__.getProperty.apply(this, arguments);
    },

    get type() "storage",

    get id() this.__proto__.__proto__.__lookupGetter__("id").call(this),
    set id(val) {
        let id = this.__proto__.__proto__.__lookupSetter__("id").call(this, val);

        if (!this.mDB && this.uri && this.id) {
            // Prepare the database as soon as we have an id and an uri.
            this.prepareInitDB();
        }
        return id;
    },

    get uri() this.__proto__.__proto__.__lookupGetter__("uri").call(this),
    set uri(aUri) {
        // We can only load once
        if (this.uri) {
            throw Components.results.NS_ERROR_FAILURE;
        }

        let uri = this.__proto__.__proto__.__lookupSetter__("uri").call(this, aUri);

        if (!this.mDB && this.uri && this.id) {
            // Prepare the database as soon as we have an id and an uri.
            this.prepareInitDB();
        }

        return uri;
    },

    refresh: function cSC_refresh() {},

    addItem: function cSC_addItem(aItem, aListener) {
        let newItem = aItem.clone();
        return this.adoptItem(newItem, aListener);
    },

    adoptItem: function cSC_adoptItem(aItem, aListener) {
        let self = this;
        function notifyListener(message, status=Components.results.NS_ERROR_FAILURE) {
            self.notifyOperationComplete(aListener, status, cIOL.ADD, aItem.id, message);
        }

        Task.spawn(function*() {
            if (self.readOnly) {
                throw Components.Exception("Calendar is readonly", cIE.CAL_IS_READONLY);
            } else if (aItem.id == null) {
                aItem.id = cal.getUUID();
            }
            let olditem = yield self.getItemById(aItem.id);
            if (olditem && !self.relaxedMode) {
                throw Components.Exception("ID already exists for addItem", cIE.DUPLIATE_ID);
            }

            let parentItem = aItem.parentItem;
            if (parentItem != aItem) {
                parentItem = parentItem.clone();
                parentItem.recurrenceInfo.modifyException(aItem, true);
            }
            parentItem.calendar = self.superCalendar;
            yield self.writeItem(parentItem);
            return aItem;
        }).then((aItem) => {
            // Notify the listener and observers
            notifyListener(aItem, Components.results.NS_OK);
            self.observers.notify("onAddItem", [aItem]);
        }, (ex) => {
            notifyListener(ex.message, ex.result);
        });
    },

    modifyItem: function cSC_modifyItem(aNewItem, aOldItem, aListener) {
        let self = this;
        let oldItem, modifiedItem;

        function notifyListener(message, status=Components.results.NS_ERROR_FAILURE) {
            let id = (modifiedItem ? modifiedItem.id : aNewItem.id);
            self.notifyOperationComplete(aListener, status, cIOL.MODIFY, id, message);
        }

        Task.spawn(function*() {
            if (self.readOnly) {
                throw Components.Exception("Calendar is readonly", cIE.CAL_IS_READONLY);
            } else if (aNewItem.id == null) {
                throw Components.Exception("ID for modifyItem item is null");
            }

            modifiedItem = aNewItem.parentItem.clone();
            if (self.getProperty("capabilities.propagate-sequence")) {
                // Ensure the exception, its parent and the other exceptions have the
                // same sequence number, to make sure we can send our changes to the
                // server if the event has been updated via the blue bar
                let newSequence = aNewItem.getProperty("SEQUENCE");
                self._propagateSequence(modifiedItem, newSequence);
            }

            // Ensure that we're looking at the base item if we were given an
            // occurrence.  Later we can optimize this.
            if (aNewItem.parentItem != aNewItem) {
                modifiedItem.recurrenceInfo.modifyException(aNewItem, false);
            }

            // If no old item was passed, then we should overwrite in any case.
            // Pick up the old item from the database and use this as an old item
            // later on.
            let id = (aOldItem ? aOldItem.id : aNewItem.id);
            let item = yield self.getItemById(id);
            let foundOldItem = item;
            if (self.relaxedMode) {
                if (!foundOldItem) {
                    foundOldItem = aNewItem;
                }
            } else {
                if (!foundOldItem) {
                    throw Components.Exception("ID does not already exist for modifyItem");
                } else if (aOldItem && aOldItem.generation != foundOldItem.generation) {
                    throw Components.Exception("generation too old for modifyItem");
                }

                if (foundOldItem.generation == modifiedItem.generation) { // has been cloned and modified
                    // Only take care of incrementing the generation if relaxed mode is
                    // off. Users of relaxed mode need to take care of this themselves.
                    modifiedItem.generation += 1;
                }
            }
            oldItem = foundOldItem.parentItem;
            yield self.writeItem(modifiedItem);
        }).then((aItem) => {
            // Notify the listener and observers
            notifyListener(modifiedItem, Components.results.NS_OK);
            self.observers.notify("onModifyItem", [modifiedItem, oldItem]);
        }, (ex) => {
            notifyListener(ex.message, ex.result);
        });
    },

    deleteItem: function cSC_deleteItem(aItem, aListener) {
        if (this.readOnly) {
            this.notifyOperationComplete(aListener, cIE.CAL_IS_READONLY,
                                         cIOL.DELETE, aItem.id, "Calendar is readonly");

            return;
        }

        this.deleteItemById(aItem.id).then((item) => {
            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.DELETE, aItem.id, aItem);
            this.observers.notify("onDeleteItem", [aItem]);
        }, (aReason) => {
            // The promise was rejected, notify that the operation failed
            this.notifyOperationComplete(aListener, Componenets.results.NS_ERROR_FAILURE,
                                         cIOL.DELETE, aItem.id, "deleteItem failed to resolve promise");
        });
        return null;
    },

    getItem: function cSC_getItem(aId, aListener) {
        this.getItemById(aId).then((item) => {
            if (item) {
                let item_iid = null;
                if (cal.isEvent(item)) {
                    item_iid = Components.interfaces.calIEvent;
                } else if (cal.isToDo(item)) {
                    item_iid = Components.interfaces.calITodo;
                } else {
                    this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                                 cIOL.GET, aId, "Can't deduce item type based on QI");
                    return;
                }

                aListener.onGetResult(this.superCalendar,
                                      Components.results.NS_OK,
                                      item_iid, null,
                                      1, [item]);
            }

            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.GET, aId, null);
        }, (aReason) => {
            this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                         cIOL.GET, aId, "getItem failed to resolve promise");
        });
        return null;
    },

    getItems: function cSC_getItems(aItemFilter, aCount,
                                    aRangeStart, aRangeEnd, aListener) {
        let self = this;

        let startTime = aRangeStart ? aRangeStart.nativeTime : -0x7fffffffffffffff;
        let endTime = aRangeEnd ? aRangeEnd.nativeTime : 0x7fffffffffffffff;

        let wantEvents = ((aItemFilter & cIC.ITEM_FILTER_TYPE_EVENT) != 0);
        let wantTodos = ((aItemFilter & cIC.ITEM_FILTER_TYPE_TODO) != 0);
        let asOccurrences = ((aItemFilter & cIC.ITEM_FILTER_CLASS_OCCURRENCES) != 0);
        let itemCompletedFilter = ((aItemFilter & cIC.ITEM_FILTER_COMPLETED_YES) != 0);
        let itemNotCompletedFilter = ((aItemFilter & cIC.ITEM_FILTER_COMPLETED_NO) != 0);
        let wantOfflineDeletedItems = ((aItemFilter & cIC.ITEM_FILTER_OFFLINE_DELETED) != 0);
        let wantOfflineCreatedItems = ((aItemFilter & cIC.ITEM_FILTER_OFFLINE_CREATED) != 0);
        let wantOfflineModifiedItems = ((aItemFilter & cIC.ITEM_FILTER_OFFLINE_MODIFIED) != 0);
        let wantUnrespondedInvitations = ((aItemFilter & cIC.ITEM_FILTER_REQUEST_NEEDS_ACTION) != 0);
        let superCal;
        try {
            superCal = this.superCalendar.QueryInterface(Components.interfaces.calISchedulingSupport);
        } catch (exc) {
            wantUnrespondedInvitations = false;
        }

        let offline_journal = null;
        if (wantOfflineDeletedItems) {
            offline_journal = cICL.OFFLINE_FLAG_DELETED_RECORD;
        } else if (wantOfflineCreatedItems) {
            offline_journal = cICL.OFFLINE_FLAG_CREATED_RECORD;
        } else if (wantOfflineModifiedItems) {
            offline_journal = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
        }

        // HACK because recurring offline events/todos objects dont have offline_journal information
        // Hence we need to update the mRecEventCacheOfflineFlags and  mRecTodoCacheOfflineFlags hash-tables
        // It can be an expensive operation but is only used in Online Reconciliation mode
        // TODO still needed?
        if (wantOfflineCreatedItems | wantOfflineDeletedItems | wantOfflineModifiedItems) {
            this.mRecItemCacheInited = false;
        }

        let queue = new itemQueue(aCount);
        queue.unleash = function(items) {
            try {
                aListener.onGetResult(self.superCalendar,
                                      Components.results.NS_OK,
                                      Components.interfaces.calIItemBase,
                                      null, items.length, items);
            } catch (e) {
                cal.ERROR("Error calling listener: " + e + "\nListener: " + aListener.toSource());
                throw e;
            }
        };

        function expandItems(item, optionalFilterFunc) {
            let expandedItems = [];
            if (item.recurrenceInfo && asOccurrences) {
                // If the item is recurring, get all ocurrences that fall in
                // the range. If the item doesn't fall into the range at all,
                // this expands to 0 items.
                expandedItems = item.recurrenceInfo.getOccurrences(aRangeStart, aRangeEnd, 0, {});
            } else if (cal.checkIfInRange(item, aRangeStart, aRangeEnd)) {
                // If no occurrences are wanted, check only the parent item.
                // This will be changed with bug 416975.
                expandedItems = [ item ];
            }

            function filterItems(item) {
                let att = superCal && superCal.getInvitedAttendee(item);
                let isUnresponded = (att && (att.participationStatus == "NEEDS-ACTION"));
                return ((wantUnrespondedInvitations && !isUnresponded) ||
                        (!optionalFilterFunc || optionalFilterFunc(item)));
            }

            return expandedItems.filter(filterItems);
        }

        function setParams(stmt, params) {
                params.range_start = startTime;
                params.range_end = endTime;
                params.start_offset = aRangeStart ? aRangeStart.timezoneOffset * USECS_PER_SECOND : 0;
                params.end_offset = aRangeEnd ? aRangeEnd.timezoneOffset * USECS_PER_SECOND : 0;
                params.offline_journal = offline_journal;
        }

        let processItems = Task.async(function*(query, action) {
            while (!query.isComplete) {
                let resultSet;
                while ((resultSet = yield query.promiseResult())) {
                    for (let row = resultSet.getNextRow(); row; row = resultSet.getNextRow()) {
                        let rowItem = action(row.getResultByName("icalString"));
                        rowItem.calendar = this.superCalendar;
                        queue.enqueue(expandItems(rowItem));
                    }
                    queue.finish();
                }
            }
        }).bind(this);

        function checkTaskCompleted(item) {
            return (item.isCompleted ? itemCompletedFilter : itemNotCompletedFilter);
        }

        function offline_journal_matches(cachedFlag) {
            return (offline_journal == null && cachedFlag != cICL.OFFLINE_FLAG_DELETED_RECORD) ||
                   (offline_journal != null && cachedFlag == offline_journal);
        }

        return Task.spawn(function*() {
            if (!wantEvents && !wantTodos) {
                return;
            }

            yield self.assureRecurringItemCaches();

            // First fetch all the events
            if (wantEvents) {
                stmt = self.mSelectNonRecurringEventsByRange;
                setParams(stmt, stmt.params);

                // First get non-recurring events that happen to fall within the range
                let selectEvents = self.runCalendarStatement(stmt, "Error selecting non-recurring events in the range");

                yield processItems(selectEvents, cal.createEvent.bind(cal));

                // Process the recurring events from the cache
                for (let itemId in self.mRecEventCache) {
                    let item = yield self.getCachedItem(itemId);
                    let cachedFlag = self.mFlagCache[itemId];
                    // No need to return flagged unless asked i.e.
                    // offline_journal == cachedFlag Return created and
                    // modified offline records if offline_journal is null
                    // alongwith events that have no flag
                    if (offline_journal_matches(cachedFlag)) {
                        if (queue.enqueue(expandItems(item))) {
                            break;
                        }
                    }
                }
            }
            // if todos are wanted, do them next
            if (wantTodos) {
                stmt = self.mSelectNonRecurringTodosByRange;
                setParams(stmt, stmt.params);

                let selectTodos = self.runCalendarStatement(stmt, "Error selecting non-recurring events in the range");

                yield processItems(selectTodos, cal.createTodo.bind(cal));

                // Process the recurring events from the cache
                for (let itemId in self.mRecTodoCache) {
                    let item = yield self.getCachedItem(itemId);
                    let cachedFlag = self.mFlagCache[itemId];
                    if (offline_flag_matches(cachedFlag)) {
                        let expandedItems = expandItems(item, checkTaskCompleted);
                        if (queue.enqueue(expandedItems)) {
                            break;
                        }
                    }
                }
            }
        }).then(() => {
            queue.finish();
            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.GET, null, null);
        }, (aReason) => {
            this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                         cIOL.GET, null, "Failed to getItems");
        });
    },

    getItemOfflineFlag: function cSC_getOfflineJournalFlag(aItem, aListener) {
        this.promiseItemOfflineFlag(aItem).then((aFlag) => {
            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.GET, aItem && aItem.id, aFlag);
        }, (aReason) => {
            this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                         cIOL.GET, aItem && aItem.id, aReason);
        });
    },

    promiseItemOfflineFlag: Task.async(function*(aItem) {
        let flag = null;
        if (aItem) {
            let selectItemBase = this.runItemStatement(this.mSelectItemBase, aItem.id, "Error getting offline flag");
            let row = yield selectItemBase.promiseOneRow();
            if (row) {
                flag = row.getResultByName("offline_journal");
            }
        }
        return flag;
    }),

    setItemOfflineFlag: Task.async(function*(aItem, flag) {
        stmt = this.mEditItemOfflineFlag;
        stmt.params.offline_journal = flag || null;
        return this.runItemStatement(stmt, aItem.id, "Error setting offline flag for " + aItem.id).completionPromise;
    }),

    // calIOfflineStorage interface
    addOfflineItem: function(aItem, aListener) {
        this.setItemOfflineFlag(aItem, cICL.OFFLINE_FLAG_CREATED_RECORD).then(() => {
            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.ADD, aItem.id, aItem);
        }, () => {
            this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                         cIOL.ADD, aItem.id, "Failed to add offline item");
        });
    },

    modifyOfflineItem: Task.async(function*(aItem, aListener) {
        let oldOfflineJournalFlag = yield this.promiseItemOfflineFlag(aItem);
        if (oldOfflineJournalFlag != cICL.OFFLINE_FLAG_CREATED_RECORD &&
            oldOfflineJournalFlag != cICL.OFFLINE_FLAG_DELETED_RECORD) {
            // Only set the modified flag if the item doesn't already
            // have an offline flag
            this.setItemOfflineFlag(aItem, cICL.OFFLINE_FLAG_MODIFIED_RECORD).then(() => {
                this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                             cIOL.MODIFY, aItem.id, aItem);
            }, () => {
                this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                 cIOL.MODIFY, aItem.id, "Failed to modify offline item");
            });
        } else {
            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.MODIFY, aItem.id, aItem);
        }
    }),

    deleteOfflineItem: Task.async(function*(aItem, aListener) {
        let oldOfflineJournalFlag = yield this.promiseItemOfflineFlag(aItem);
        if (oldOfflineJournalFlag == cICL.OFFLINE_FLAG_CREATED_RECORD) {
            // If the item was created offline, we can just delete it again
            try {
                let item = yield this.deleteItemById(aItem.id);
                this.observers.notify("onDeleteItem", [aItem]);
                this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                             cIOL.DELETE, aItem.id, aItem);
            } catch (e) {
                cal.ERROR("Failed to delete offline item: " + e);
                this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                            cIOL.DELETE, aItem.id, "Failed to delete offline item: " + e);
            }
        } else {
            // Otherwise we need to mark it deleted
            yield this.setItemOfflineFlag(aItem, cICL.OFFLINE_FLAG_DELETED_RECORD);
        }
    }),

    resetItemOfflineFlag: Task.async(function*(aItem, aListener) {
        this.setItemOfflineFlag(aItem, null).then(() => {
            this.notifyOperationComplete(aListener, Components.results.NS_OK,
                                         cIOL.MODIFY, aItem.id, aItem);
        }, (aError) => {
            this.notifyOperationComplete(aListener, Components.results.NS_ERROR_FAILURE,
                                         cIOL.MODIFY, aItem.id, "Failed to reset the offline flag");
        });
    }),

    /**
     * Initialize the Database. This should only be called from the uri or id
     * setter and requires those two attributes to be set.
     */
    prepareInitDB: function cSC_prepareInitDB() {
        if (this.uri.schemeIs("file")) {
            let fileURL = this.uri.QueryInterface(Components.interfaces.nsIFileURL);
            if (!fileURL) {
                throw new Components.Exception("Invalid file", Components.results.NS_ERROR_NOT_IMPLEMENTED);
            }
            // open the database
            this.mDB = Services.storage.openDatabase(fileURL.file);
            this.mDB.executeSimpleSQL("PRAGMA journal_mode=WAL");
            upgradeDB(this.mDB);

        } else if (this.uri.schemeIs("moz-profile-calendar")) {
            // This is an old-style moz-profile-calendar. It requires some
            // migration steps.

            let localDB = cal.getCalendarDirectory();
            localDB.append("local.sqlite");
            this.mDB = Services.storage.openDatabase(localDB);

            // If needed, migrate the storage.sdb to local.sqlite
            migrateStorageSDB();

            // Now that we are through, set the database to the new local.sqlite
            // and start the upgraders.
            upgradeDB(this.mDB);


            migrateURLFormat(this.mDB, this);
        } else if (this.uri.schemeIs("moz-storage-calendar")) {
            // New style uri, no need for migration here
            let localDB = cal.getCalendarDirectory();
            localDB.append("local.sqlite");

            this.mDB = Services.storage.openDatabase(localDB);
            upgradeDB(this.mDB);
        } else {
            throw new Components.Exception("Invalid Scheme " + this.uri.spec);
        }

        if (this.mDB) {
            // Make sure to close the database on quit
            let self = this;
            function closeDB() {
                if (self.mDB) {
                    self.mDB.asyncClose();
                    self.mDB = null;
                }
            }
            cal.addObserver(closeDB, "profile-before-change", true);
        }

        this.initDB();
        Services.obs.addObserver(this, "profile-before-change", false);
    },

    observe: function cSC_observe(aSubject, aTopic, aData) {
        if (aTopic == "profile-before-change") {
            Services.obs.removeObserver(this, "profile-before-change");
            this.shutdownDB();
        }
    },

    initDB: function cSC_initDB() {
        cal.ASSERT(this.mDB, "Database has not been opened!", true);

        try {
            // We are going to use foreign keys in this database
            this.mDB.executeSimpleSQL("PRAGMA foreign_keys = on");

            this.mSelectItemBase = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base" +
                " WHERE item_id = :item_id AND cal_id = :cal_id"
            );
            this.mSelectEvent = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base AS b, cal_events AS e" +
                " WHERE b.item_id = :item_id AND b.cal_id = :cal_id" +
                "   AND b.item_id = e.id AND b.cal_id = e.cal_id" +
                " LIMIT 1"
            );

            this.mSelectTodo = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base AS b, cal_todos AS t" +
                " WHERE b.item_id = :item_id AND b.cal_id = :cal_id" +
                "   AND b.item_id = t.id AND b.cal_id = t.cal_id" +
                " LIMIT 1"
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
            var floatingEventStart = "event_start_tz = 'floating' AND event_start"
            var nonFloatingEventStart = "event_start_tz != 'floating' AND event_start"
            var floatingEventEnd = "event_end_tz = 'floating' AND event_end"
            var nonFloatingEventEnd = "event_end_tz != 'floating' AND event_end"
            // The query needs to take both floating and non floating into account
            this.mSelectNonRecurringEventsByRange = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base AS b, cal_events AS e " +
                "WHERE " +
                " (("+floatingEventEnd+" > :range_start + :start_offset) OR " +
                "  ("+nonFloatingEventEnd+" > :range_start) OR " +
                "  ((("+floatingEventEnd+" = :range_start + :start_offset) OR " +
                "    ("+nonFloatingEventEnd+" = :range_start)) AND " +
                "   (("+floatingEventStart+" = :range_start + :start_offset) OR " +
                "    ("+nonFloatingEventStart+" = :range_start)))) " +
                " AND " +
                "  (("+floatingEventStart+" < :range_end + :end_offset) OR " +
                "   ("+nonFloatingEventStart+" < :range_end)) " +
                " AND b.cal_id = :cal_id AND flags & 16 == 0" +
                " AND b.cal_id = e.cal_id AND b.item_id = e.id" +
                " AND ((:offline_journal IS NULL " +
                " AND  (offline_journal IS NULL " +
                "  OR   offline_journal != " + cICL.OFFLINE_FLAG_DELETED_RECORD + ")) " +
                "  OR (offline_journal == :offline_journal))"
                );

            //
            // WHERE (due > rangeStart  AND  (entry IS NULL  OR  entry < rangeEnd)) OR
            //       (due = rangeStart  AND  (entry IS NULL  OR  entry = rangeStart)) OR
            //       (due IS NULL  AND  (entry >= rangeStart  AND  entry < rangeEnd)) OR
            //       (entry IS NULL  AND  (completed > rangeStart  OR  completed IS NULL))
            //
            var floatingTodoEntry = "todo_entry_tz = 'floating' AND todo_entry";
            var nonFloatingTodoEntry = "todo_entry_tz != 'floating' AND todo_entry";
            var floatingTodoDue = "todo_due_tz = 'floating' AND todo_due";
            var nonFloatingTodoDue = "todo_due_tz != 'floating' AND todo_due";
            var floatingCompleted = "todo_completed_tz = 'floating' AND todo_completed";
            var nonFloatingCompleted = "todo_completed_tz != 'floating' AND todo_completed";

            this.mSelectNonRecurringTodosByRange = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base AS b, cal_todos AS t " +
                "WHERE " +
                "(((("+floatingTodoDue+" > :range_start + :start_offset) OR " +
                "   ("+nonFloatingTodoDue+" > :range_start)) AND " +
                "  ((todo_entry IS NULL) OR " +
                "   (("+floatingTodoEntry+" < :range_end + :end_offset) OR " +
                "    ("+nonFloatingTodoEntry+" < :range_end)))) OR " +
                " ((("+floatingTodoDue+" = :range_start + :start_offset) OR " +
                "   ("+nonFloatingTodoDue+" = :range_start)) AND " +
                "  ((todo_entry IS NULL) OR " +
                "   (("+floatingTodoEntry+" = :range_start + :start_offset) OR " +
                "    ("+nonFloatingTodoEntry+" = :range_start)))) OR " +
                " ((todo_due IS NULL) AND " +
                "  ((("+floatingTodoEntry+" >= :range_start + :start_offset) OR " +
                "    ("+nonFloatingTodoEntry+" >= :range_start)) AND " +
                "   (("+floatingTodoEntry+" < :range_end + :end_offset) OR " +
                "    ("+nonFloatingTodoEntry+" < :range_end)))) OR " +
                " ((todo_entry IS NULL) AND " +
                "  ((("+floatingCompleted+" > :range_start + :start_offset) OR " +
                "    ("+nonFloatingCompleted+" > :range_start)) OR " +
                "   (todo_completed IS NULL)))) " +
                " AND b.cal_id = :cal_id AND flags & 16 == 0" +
                " AND b.cal_id = t.cal_id AND b.item_id = t.id" +
                " AND ((:offline_journal IS NULL" +
                " AND  (offline_journal IS NULL" +
                "  OR   offline_journal != " + cICL.OFFLINE_FLAG_DELETED_RECORD + ")) " +
                "  OR (offline_journal == :offline_journal))"
            );

            this.mSelectEventsWithFlag = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base AS b,cal_events AS e " +
                " WHERE (flags & :flag) != 0" +
                "   AND b.cal_id = :cal_id" +
                "   AND b.cal_id = e.cal_id AND b.item_id = e.id"
            );

            this.mSelectTodosWithFlag = this.mDB.createAsyncStatement(
                "SELECT * FROM cal_item_base AS b,cal_todos AS t " +
                " WHERE (flags & :flag) != 0" +
                "   AND b.cal_id = :cal_id" +
                "   AND b.cal_id = t.cal_id AND b.item_id = t.id"
            );

            this.mSelectMetaData = this.mDB.createStatement(
                "SELECT * FROM cal_metadata"
                + " WHERE item_id = :item_id AND cal_id = :cal_id");

            this.mSelectAllMetaData = this.mDB.createStatement(
                "SELECT * FROM cal_metadata"
                + " WHERE cal_id = :cal_id");

            // Insert statements
            this.mInsertBaseItem = this.mDB.createAsyncStatement(
                "INSERT OR REPLACE INTO cal_item_base" +
                "       (cal_id, item_id, componentType, flags, icalString) " +
                "VALUES (:cal_id, :item_id, :componentType, :flags, :icalString) "
            );
            this.mInsertEvent = this.mDB.createAsyncStatement(
                "INSERT OR REPLACE INTO cal_events " +
                "       (cal_id, id, event_start, event_start_tz," +
                "        event_end, event_end_tz) " +
                "VALUES (:cal_id, :item_id, :event_start, :event_start_tz," +
                "        :event_end, :event_end_tz)"
            );
            this.mInsertTodo = this.mDB.createAsyncStatement(
                "INSERT OR REPLACE INTO cal_todos " +
                "       (cal_id, id, todo_entry, todo_entry_tz, todo_due," +
                "        todo_due_tz, todo_completed, todo_completed_tz) " +
                "VALUES (:cal_id, :item_id, :todo_entry, :todo_entry_tz," +
                "        :todo_due, :todo_due_tz, :todo_completed," +
                "        :todo_completed_tz)"
            );

            this.mSetMetaData = this.mDB.createStatement(
                "INSERT OR REPLACE INTO cal_metadata" +
                "                       (cal_id, item_id, value)" +
                "                VALUES (:cal_id, :item_id, :value)"
            );

            // Delete statements
            this.mDeleteItem = this.mDB.createAsyncStatement(
                "DELETE FROM cal_item_base" +
                " WHERE cal_id = :cal_id AND item_id = :item_id"
            );
            this.mDeleteMetaData = this.mDB.createStatement(
                "DELETE FROM cal_metadata" +
                " WHERE cal_id = :cal_id AND item_id = :item_id"
            );
            this.mDeleteAllItems = this.mDB.createStatement(
                "DELETE FROM cal_item_base WHERE cal_id = :cal_id"
            );

            this.mDeleteAllMetaData = this.mDB.createStatement(
                "DELETE FROM cal_metadata WHERE cal_id = :cal_id"
            );

            // Offline Operations
            this.mEditItemOfflineFlag = this.mDB.createStatement(
                "UPDATE cal_item_base SET offline_journal = :offline_journal" +
                " WHERE item_id = :item_id AND cal_id = :cal_id"
            );
        } catch (e) {
            this.logError("Error initializing statements.", e);
        }
    },

    shutdownDB: function cSC_shutdownDB() {
        try {
            if (this.mDeleteAlarms) { this.mDeleteAlarms.finalize(); }
            if (this.mDeleteAllEvents) { this.mDeleteAllEvents.finalize(); }
            if (this.mDeleteAllMetaData) { this.mDeleteAllMetaData.finalize(); }
            if (this.mDeleteAllTodos) { this.mDeleteAllTodos.finalize(); }
            if (this.mDeleteAttachments) { this.mDeleteAttachments.finalize(); }
            if (this.mDeleteAttendees) { this.mDeleteAttendees.finalize(); }
            if (this.mDeleteEvent) { this.mDeleteEvent.finalize(); }
            if (this.mDeleteMetaData) { this.mDeleteMetaData.finalize(); }
            if (this.mDeleteProperties) { this.mDeleteProperties.finalize(); }
            if (this.mDeleteRecurrence) { this.mDeleteRecurrence.finalize(); }
            if (this.mDeleteRelations) { this.mDeleteRelations.finalize(); }
            if (this.mDeleteTodo) { this.mDeleteTodo.finalize(); }
            if (this.mEditEventOfflineFlag) { this.mEditEventOfflineFlag.finalize(); }
            if (this.mEditTodoOfflineFlag) { this.mEditTodoOfflineFlag.finalize(); }
            if (this.mInsertAlarm) { this.mInsertAlarm.finalize(); }
            if (this.mInsertAttachment) { this.mInsertAttachment.finalize(); }
            if (this.mInsertAttendee) { this.mInsertAttendee.finalize(); }
            if (this.mInsertEvent) { this.mInsertEvent.finalize(); }
            if (this.mInsertMetaData) { this.mInsertMetaData.finalize(); }
            if (this.mInsertProperty) { this.mInsertProperty.finalize(); }
            if (this.mInsertRecurrence) { this.mInsertRecurrence.finalize(); }
            if (this.mInsertRelation) { this.mInsertRelation.finalize(); }
            if (this.mInsertTodo) { this.mInsertTodo.finalize(); }
            if (this.mSelectAlarmsForItem) { this.mSelectAlarmsForItem.finalize(); }
            if (this.mSelectAlarmsForItemWithRecurrenceId) { this.mSelectAlarmsForItemWithRecurrenceId.finalize(); }
            if (this.mSelectAllMetaData) { this.mSelectAllMetaData.finalize(); }
            if (this.mSelectAttachmentsForItem) { this.mSelectAttachmentsForItem.finalize(); }
            if (this.mSelectAttachmentsForItemWithRecurrenceId) { this.mSelectAttachmentsForItemWithRecurrenceId.finalize(); }
            if (this.mSelectAttendeesForItem) { this.mSelectAttendeesForItem.finalize(); }
            if (this.mSelectAttendeesForItemWithRecurrenceId) { this.mSelectAttendeesForItemWithRecurrenceId.finalize(); }
            if (this.mSelectEvent) { this.mSelectEvent.finalize(); }
            if (this.mSelectEventExceptions) { this.mSelectEventExceptions.finalize(); }
            if (this.mSelectEventsWithRecurrence) { this.mSelectEventsWithRecurrence.finalize(); }
            if (this.mSelectMetaData) { this.mSelectMetaData.finalize(); }
            if (this.mSelectNonRecurringEventsByRange) { this.mSelectNonRecurringEventsByRange.finalize(); }
            if (this.mSelectNonRecurringTodosByRange) { this.mSelectNonRecurringTodosByRange.finalize(); }
            if (this.mSelectPropertiesForItem) { this.mSelectPropertiesForItem.finalize(); }
            if (this.mSelectPropertiesForItemWithRecurrenceId) { this.mSelectPropertiesForItemWithRecurrenceId.finalize(); }
            if (this.mSelectRecurrenceForItem) { this.mSelectRecurrenceForItem.finalize(); }
            if (this.mSelectRelationsForItem) { this.mSelectRelationsForItem.finalize(); }
            if (this.mSelectRelationsForItemWithRecurrenceId) { this.mSelectRelationsForItemWithRecurrenceId.finalize(); }
            if (this.mSelectTodo) { this.mSelectTodo.finalize(); }
            if (this.mSelectTodoExceptions) { this.mSelectTodoExceptions.finalize(); }
            if (this.mSelectTodosWithRecurrence) { this.mSelectTodosWithRecurrence.finalize(); }
            if (this.mDeleteEventExtras) {
                for each (let stmt in this.mDeleteEventExtras) { stmt.finalize(); }
            }
            if (this.mDeleteTodoExtras) {
                for each (let stmt in this.mDeleteTodoExtras) { stmt.finalize(); }
            }

            if (this.mDB) { this.mDB.asyncClose(); this.mDB = null; }
        } catch (e) {
            cal.ERROR("Error closing storage database: " + e);
        }
    },

    //
    // database reading functions
    //

    cacheItem: function cSC_cacheItem(item, flag) {
        this.mItemCache[item.id] = item;
        if (item.recurrenceInfo) {
            if (cal.isEvent(item)) {
                this.mRecEventCache[item.id] = item.id;
            } else if (cal.isToDo(item)) {
                this.mRecTodoCache[item.id] = item.id;
            }
        }

        if (flag !== undefined) {
            this.mFlagCache[item.id] = flag;
        }
    },
    uncacheItem: function(aId) {
        delete this.mItemCache[aId];
        delete this.mFlagCache[aId];
        delete this.mRecEventCache[aId];
        delete this.mRecTodoCache[aId];
    },

    getCachedItem: function(aId) {
        return this.mItemCache[aId];
    },

    runStatement: function runStatement(stmt, errorMsg, synchronous, observer) {
        this.mLastStatement = stmt;
        let self = this;
        let statements;
        if (Array.isArray(stmt)) {
            statements = stmt;
        } else {
            statements = [stmt];
        }
        if (!synchronous) {
            let runner = {
                completion: Promise.defer(),
                complete: false,
                deferredArray: [Promise.defer()],
                completePromises: [],

                promiseResult: function promiseResult() {
                    if (this.completePromises.length) {
                        return this.completePromises.shift();
                    } else if (!this.pendingDeferred) {
                        this.pendingDeferred = Promise.defer();
                        return this.pendingDeferred.promise;
                    } else {
                        cal.ERROR("Attempt to retrieve pending deferred twice: " + cal.STACK(10));
                    }
                },

                promiseOneRow: function() {
                  return runner.promiseResult().then((result) => {
                    return result ? result.getNextRow() : null;
                  });
                },

                get isComplete() this.complete,
                get completionPromise() this.completion.promise,

                resolveWithValue: function resolveWithValue(value) {
                    if (this.pendingDeferred) {
                        this.pendingDeferred.resolve(value);
                        this.pendingDeferred = null;
                    } else {
                        this.completePromises.push(Promise.resolve(value));
                    }
                },

                resolveNull: function resolveNull() {
                    this.complete = true;
                    this.resolveWithValue(null);
                    this.completion.resolve();
                },

                rejectPromise: function rejectPromise(aError) {
                    this.deferred.reject(aError);
                    this.complete = true;
                    if (this.pendingDeferred) {
                        this.pendingDeferred.reject(aError);
                    } else {
                        this.completedPromises.push(Promise.reject(aError));
                    }
                    this.completion.reject();
                }
            };

            let stmtObserver = {
                handleResult: function(aResultSet) {
                    runner.resolveWithValue(aResultSet);
                },
                handleError: function(aError) {
                    self.logError(errorMsg, aError);
                    runner.rejectPromise(aError);
                },
                handleCompletion: function(aReason) {
                    if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED) {
                        return this.handleError("Query cancelled or aborted: " + aReason);
                    }
                    runner.resolveNull();
                },
            };
            this.mDB.executeAsync(statements, statements.length, stmtObserver);
            return runner;
        } else {
            if ("handleInit" in observer) {
                for (let stmt of statements) {
                    observer.handleInit.call(this, stmt.params, stmt);
                }
            }

            if ("handleResult" in observer || "handleRow" in observer || "handleCompletion" in observer) {
                for (let stmt of statements) {
                    try {
                        while (stmt.executeStep()) {
                            observer.handleRow(stmt.row);
                        }
                    } catch (e) {
                        this.logError("Error executing statement", e);
                        if ("handleError" in observer) {
                            observer.handleError.call(sef, e);
                        }
                    } finally {
                        stmt.reset();
                    }

                    if ("handleCompletion" in observer) {
                        observer.handleCompletion.call(self);
                    }
                }
            } else {
                // Otherwise just fire and forget
                for (let stmt of statements) {
                    stmt.execute();
                }
            }
        }
    },

    runCalendarStatement: function runCalendarStatement(stmt, errorMsg, synchronous) {
        let statements;
        if (Array.isArray(stmt)) {
            statements = stmt;
        } else {
            statements = [stmt];
        }

        for (let stmt of statements) {
            stmt.params.cal_id = this.id;
        }
        return this.runStatement(stmt, errorMsg, synchronous);
    },

    runItemStatement: function(stmt, itemId, errorMsg, synchronous) {
        let statements;
        if (Array.isArray(stmt)) {
            statements = stmt;
        } else {
            statements = [stmt];
        }

        for (let stmt of statements) {
            stmt.params.cal_id = this.id;
            stmt.params.item_id = itemId;
        }
        return this.runStatement(statements, errorMsg, synchronous);
    },

    runSyncCalendarStatement: function runCalendarStatement(stmt, observer, errorMsg) {
        let handleInitInner = observer.handleInit;
        observer.handleInit = function(params) {
            params.cal_id = this.id;
            if (handleInitInner) {
                handleInitInner.apply(this, arguments);
            }
        };
        this.runStatement(stmt, errorMsg, true, observer);
    },

    runSyncItemStatement: function(stmt, itemId, observer, errorMsg) {
       let handleInitInner = observer.handleInit;
       observer.handleInit = function(params) {
            params.cal_id = this.id;
            params.item_id = itemId;
            if (handleInitInner) {
                handleInitInner.apply(this, arguments);
            }
        };
        this.runStatement(stmt, errorMsg, true, observer);
    },

    assureRecurringItemCaches: Task.async(function*() {
        let processItems = Task.async(function*(query, action) {
            while (!query.isComplete) {
                let resultSet;
                while ((resultSet = yield query.promiseResult())) {
                    for (let row = resultSet.getNextRow(); row; row = resultSet.getNextRow()) {
                        let item = action(row.getResultByName("icalString"));
                        item.calendar = this.superCalendar;
                        this.cacheItem(item, row.getResultByName("offline_journal"));
                    }
                }
            }
        }).bind(this);

        if (this.mRecItemCacheInited) {
            return Promise.resolve();
        } else {
            // build up recurring event and todo cache with its offline flags,
            // because we need that on every query: for recurring items, we need to
            // query database-wide... yuck
            if (this.mRecEventCache) {
                for (let id in this.mRecEventCache) {
                    this.uncacheItem(id);
                }
            }

            if (this.mRecTodoCache) {
                for (let id in this.mRecTodoCache) {
                    this.uncacheItem(id);
                }
            }

            this.mRecEventCache = {};
            this.mRecTodoCache = {};

            let stmt = this.mSelectEventsWithFlag;
            stmt.params.flag = CAL_ITEM_FLAG.HAS_RECURRENCE;

            let selectEvents = this.runCalendarStatement(this.mSelectEventsWithFlag, "Error selecting events with recurrence");

            yield processItems(selectEvents, cal.createEvent.bind(cal));

            stmt = this.mSelectTodosWithFlag;
            stmt.params.flag = CAL_ITEM_FLAG.HAS_RECURRENCE;

            let selectTodos = this.runCalendarStatement(this.mSelectTodosWithFlag, "Error selecting todos with recurrence");

            yield processItems(selectTodos, cal.createTodo.bind(cal));

            this.mRecItemCacheInited = true;
        }
    }),

    getItemById: Task.async(function*(aId) {
        yield this.assureRecurringItemCaches();

        let item = this.getCachedItem(aId);
        if (item) {
            return item;
        } else {
            let runner = this.runItemStatement(this.mSelectEvent, aId, "Error selecting item by id " + aId);
            let row = yield runner.promiseOneRow();
            if (row) {
                item = cal.createEvent(row.getResultByName("icalString"));
                item.calendar = this.superCalendar;
            } else {
                runner = this.runItemStatement(this.mSelectTodo, aId, "Error selecting item by id " + aId);
                row = yield runner.promiseOneRow();
                if (row) {
                    item = cal.createTodo(row.getResultByName("icalString"));
                    item.calendar = this.superCalendar;
                }
            }
            return item;
        }
    }),

    //
    // database writing functions
    //

    indexEvent: function cSC_indexEvent(item, params) {
        setDateParamHelper(params, "event_start", item.startDate);
        setDateParamHelper(params, "event_end", item.endDate);
    },

    indexTodo: function cSC_indexTodo(item, params) {
        setDateParamHelper(params, "todo_entry", item.entryDate);
        setDateParamHelper(params, "todo_due", item.dueDate);
        setDateParamHelper(params, "todo_completed", item.getProperty("COMPLETED"));
    },

    indexBaseItem: function(item, params) {
        let f = CAL_ITEM_FLAG;
        let rinfo = item.recurrenceInfo;
        params.icalString = item.icalString;
        params.flags =
            (item.getAttendees({}).length ? f.HAS_ATTENDEES : 0) |
            (item.startDate && item.startDate.isDate ? f.EVENT_ALLDAY : 0) |
            (rinfo ? f.HAS_RECURRENCE : 0) |
            (rinfo && rinfo.getExceptionIds({}).length ? f.HAS_EXCEPTIONS : 0) |
            (item.getAttachments({}).length ? f.HAS_ATTACHMENTS : 0) |
            (item.getRelations({}).length ? f.HAS_RELATIONS : 0) |
            (item.getAlarms({}).length ? f.HAS_ALARMS : 0);

        if (cal.isEvent(item)) {
            params.componentType = "VEVENT";
        } else if (cal.isToDo(item)) {
            params.componentType = "VTODO";
        }
    },

    writeItem: function cSC_writeItem(item) {
        let statements = [this.mInsertBaseItem];
        this.indexBaseItem(item, this.mInsertBaseItem.params);

        if (cal.isEvent(item)) {
            statements.push(this.mInsertEvent);
            this.indexEvent(item, this.mInsertEvent.params);
        } else if (cal.isToDo(item)) {
            statements.push(this.mInsertTodo);
            this.indexTodo(item, this.mInsertTodo.params);
        } else {
            throw Components.results.NS_ERROR_UNEXPECTED;
        }

        return this.runItemStatement(statements, item.id, "Error inserting item").completionPromise.then(() => {
            this.cacheItem(item);
        }, (aReason) => {
            cal.ERROR("Failed to write item: " + aReason);
        });
    },

    /**
     * Deletes the item with the given item id.
     *
     * @param aID           The id of the item to delete.
     * @param aIsModify     If true, then leave in metadata for the item
     */
    deleteItemById: function cSC_deleteItemById(aId) {
        let statements = [this.mDeleteItem, this.mDeleteMetaData];

        return this.runItemStatement(statements, aId, "Failed to delete item by ID").completionPromise.then(() => {
            this.uncacheItem(aId);
        }, () => {
            cal.ERROR("Failed to deleteItemById: " + aReason);
        });
    },

    //
    // calISyncWriteCalendar interface
    //

    setMetaData: function cSC_setMetaData(id, value) {
        this.runSyncItemStatement(this.mSetMetaData, id, {
            handleInit: function(params) {
                try {
                    params.value = value;
                } catch (e if e.result == Components.results.NS_ERROR_ILLEGAL_VALUE) {
                    // The storage service throws an NS_ERROR_ILLEGAL_VALUE in case
                    // pval is something complex (i.e not a string or number).
                    // Swallow this error, leaving the value empty.
                }
            }
        }, "Error setting metadata for " + id);
    },

    deleteMetaData: function cSC_deleteMetaData(aId) {
        this.runSyncItemStatement(this.mDeleteMetaData, aId, {},
                                  "Error deleting metadata");
    },

    getMetaData: function cSC_getMetaData(aId) {
        let value = null;
        this.runSyncItemStatement(this.mSelectMetaData, aId, {
            handleRow: function(row) {
                value = row.value;
            }
        }, "Error getting metadata for id " + aId);

        return value;
    },

    getAllMetaData: function cSC_getAllMetaData(out_count,
                                                out_ids,
                                                out_values) {
        let ids = [], values = [];
        this.runSyncCalendarStatement(this.mSelectAllMetaData, {
            handleRow: function(row) {
                ids.push(row.item_id);
                values.push(row.value);
            }
        }, "Error getting all metadata!");

        out_count.value = ids.length;
        out_ids.value = ids;
        out_values.value = values;
    },

    /**
     * Internal logging function that should be called on any database error,
     * it will log as much info as possible about the database context and
     * last statement so the problem can be investigated more easilly.
     *
     * @param message           Error message to log.
     * @param exception         Exception that caused the error.
     */
    logError: function cSC_logError(message, exception) {
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
            if (this.mLastStatement instanceof mISS && this.mLastStatement.params) {
                for (let param in this.mLastStatement.params) {
                    logMessage += "\nLast Statement param [" + param + "]: " + this.mLastStatement.params[param];
                }
            }
        }

        if (exception) {
            if (typeof exception == "object" && "lineNumber" in exception && "fileName" in exception) {
                exception = exception.fileName + ":" + exception.lineNumber + ":" + exception;
            }
            if (exception instanceof Components.interfaces.mozIStorageError) {
                exception = exception.result + ":" + exception.message + ":" + exception;
            }
            logMessage += "\nException: " + exception;
        }
        cal.ERROR("[calStorageCalendar] " + logMessage + "\n" + cal.STACK(10));
    },

    /**
     * propagate the given sequence in exceptions. It may be needed by some
     * calendar implementations.
     */
    _propagateSequence: function cSC__propagateSequence(aItem, newSequence) {
        if (newSequence) {
            aItem.setProperty("SEQUENCE", newSequence);
        } else {
            aItem.deleteProperty("SEQUENCE");
        }
        let rec = aItem.recurrenceInfo;
        if (rec) {
            let exceptions = rec.getExceptionIds({});
            if (exceptions.length > 0) {
                for each (exid in exceptions) {
                    let ex = rec.getExceptionFor(exid);
                    if (newSequence) {
                        ex.setProperty("SEQUENCE", newSequence);
                    } else {
                        ex.deleteProperty("SEQUENCE");
                    }
                }
            }
        }
    }
};

/** Module Registration */
let NSGetFactory = XPCOMUtils.generateNSGetFactory([calStorageCalendar]);
