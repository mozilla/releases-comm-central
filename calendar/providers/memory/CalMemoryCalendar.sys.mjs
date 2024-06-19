/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { CalReadableStreamFactory } from "resource:///modules/CalReadableStreamFactory.sys.mjs";

var cICL = Ci.calIChangeLog;
const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));
export function CalMemoryCalendar() {
  this.initProviderBase();
  this.initMemoryCalendar();
}

var calMemoryCalendarClassID = Components.ID("{bda0dd7f-0a2f-4fcf-ba08-5517e6fbf133}");
var calMemoryCalendarInterfaces = [
  "calICalendar",
  "calISchedulingSupport",
  "calIOfflineStorage",
  "calISyncWriteCalendar",
  "calICalendarProvider",
];
CalMemoryCalendar.prototype = {
  __proto__: cal.provider.BaseClass.prototype,
  classID: calMemoryCalendarClassID,
  QueryInterface: cal.generateQI(calMemoryCalendarInterfaces),
  classInfo: cal.generateCI({
    classID: calMemoryCalendarClassID,
    contractID: "@mozilla.org/calendar/calendar;1?type=memory",
    classDescription: "Calendar Memory Provider",
    interfaces: calMemoryCalendarInterfaces,
  }),

  mItems: null,
  mOfflineFlags: null,
  mObservers: null,
  mMetaData: null,

  initMemoryCalendar() {
    this.mObservers = new cal.data.ObserverSet(Ci.calIObserver);
    this.mItems = {};
    this.mOfflineFlags = {};
    this.mMetaData = new Map();
  },

  //
  // calICalendarProvider interface
  //

  get displayName() {
    return lazy.l10n.formatValueSync("memory-name");
  },

  get shortName() {
    return this.displayName;
  },

  deleteCalendar(calendar, listener) {
    calendar = calendar.wrappedJSObject;
    calendar.mItems = {};
    calendar.mMetaData = new Map();

    try {
      listener.onDeleteCalendar(calendar, Cr.NS_OK, null);
    } catch (ex) {
      // Don't bail out if the listener fails
    }
  },

  detectCalendars() {
    throw Components.Exception(
      "CalMemoryCalendar does not implement detectCalendars",
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
      case "requiresNetwork":
        return false;
      case "capabilities.priority.supported":
        return true;
      case "removemodes":
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
    return "memory";
  },

  // Promise<calIItemBase> addItem(in calIItemBase aItem);
  async addItem(aItem) {
    const newItem = aItem.clone();
    return this.adoptItem(newItem);
  },

  // Promise<calIItemBase> adoptItem(in calIItemBase aItem);
  async adoptItem(aItem) {
    if (this.readOnly) {
      throw Ci.calIErrors.CAL_IS_READONLY;
    }
    if (aItem.id == null && aItem.isMutable) {
      aItem.id = cal.getUUID();
    }

    if (aItem.id == null) {
      this.notifyOperationComplete(
        null,
        Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.ADD,
        aItem.id,
        "Can't set ID on non-mutable item to addItem"
      );
      return Promise.reject(
        new Components.Exception("Can't set ID on non-mutable item to addItem", Cr.NS_ERROR_FAILURE)
      );
    }

    // Lines below are commented because of the offline bug 380060, the
    // memory calendar cannot assume that a new item should not have an ID.
    // calCachedCalendar could send over an item with an id.

    /*
        if (this.mItems[aItem.id] != null) {
            if (this.relaxedMode) {
                // we possibly want to interact with the user before deleting
                delete this.mItems[aItem.id];
            } else {
                this.notifyOperationComplete(aListener,
                                             Ci.calIErrors.DUPLICATE_ID,
                                             Ci.calIOperationListener.ADD,
                                             aItem.id,
                                             "ID already exists for addItem");
                return;
            }
        }
        */

    let parentItem = aItem.parentItem;
    if (parentItem != aItem) {
      parentItem = parentItem.clone();
      parentItem.recurrenceInfo.modifyException(aItem, true);
    }
    parentItem.calendar = this.superCalendar;

    parentItem.makeImmutable();
    this.mItems[aItem.id] = parentItem;

    // notify observers
    this.mObservers.notify("onAddItem", [aItem]);

    return aItem;
  },

  // Promise<calIItemBase> modifyItem(in calIItemBase aNewItem, in calIItemBase aOldItem)
  async modifyItem(aNewItem, aOldItem) {
    if (this.readOnly) {
      throw Ci.calIErrors.CAL_IS_READONLY;
    }
    if (!aNewItem) {
      throw Components.Exception("aNewItem must be set", Cr.NS_ERROR_INVALID_ARG);
    }

    const reportError = (errStr, errId = Cr.NS_ERROR_FAILURE) => {
      this.notifyOperationComplete(
        null,
        errId,
        Ci.calIOperationListener.MODIFY,
        aNewItem.id,
        errStr
      );
      return Promise.reject(new Components.Exception(errStr, errId));
    };

    if (!aNewItem.id) {
      // this is definitely an error
      return reportError("ID for modifyItem item is null");
    }

    const modifiedItem = aNewItem.parentItem.clone();
    if (aNewItem.parentItem != aNewItem) {
      modifiedItem.recurrenceInfo.modifyException(aNewItem, false);
    }

    // If no old item was passed, then we should overwrite in any case.
    // Pick up the old item from our items array and use this as an old item
    // later on.
    if (!aOldItem) {
      aOldItem = this.mItems[aNewItem.id];
    }

    if (this.relaxedMode) {
      // We've already filled in the old item above, if this doesn't exist
      // then just take the current item as its old version
      if (!aOldItem) {
        aOldItem = modifiedItem;
      }
      aOldItem = aOldItem.parentItem;
    } else if (!this.relaxedMode) {
      if (!aOldItem || !this.mItems[aNewItem.id]) {
        // no old item found?  should be using addItem, then.
        return reportError(
          "ID for modifyItem doesn't exist, is null, or is from different calendar"
        );
      }

      // do the old and new items match?
      if (aOldItem.id != modifiedItem.id) {
        return reportError("item ID mismatch between old and new items");
      }

      aOldItem = aOldItem.parentItem;
      const storedOldItem = this.mItems[aOldItem.id];

      // compareItems is not suitable here. See bug 418805.
      // Cannot compare here due to bug 380060
      if (!cal.item.compareContent(storedOldItem, aOldItem)) {
        return reportError(
          "old item mismatch in modifyItem. storedId:" +
            storedOldItem.icalComponent +
            " old item:" +
            aOldItem.icalComponent
        );
      }
      // offline bug

      if (aOldItem.generation != storedOldItem.generation) {
        return reportError("generation mismatch in modifyItem");
      }

      if (aOldItem.generation == modifiedItem.generation) {
        // has been cloned and modified
        // Only take care of incrementing the generation if relaxed mode is
        // off. Users of relaxed mode need to take care of this themselves.
        modifiedItem.generation += 1;
      }
    }

    modifiedItem.makeImmutable();
    this.mItems[modifiedItem.id] = modifiedItem;

    this.notifyOperationComplete(
      null,
      Cr.NS_OK,
      Ci.calIOperationListener.MODIFY,
      modifiedItem.id,
      modifiedItem
    );

    // notify observers
    this.mObservers.notify("onModifyItem", [modifiedItem, aOldItem]);
    return modifiedItem;
  },

  // Promise<void> deleteItem(in calIItemBase item);
  async deleteItem(item) {
    const onError = async (message, exception) => {
      this.notifyOperationComplete(
        null,
        exception,
        Ci.calIOperationListener.DELETE,
        item.id,
        message
      );
      return Promise.reject(new Components.Exception(message, exception));
    };

    if (this.readOnly) {
      return onError("Calendar is readonly", Ci.calIErrors.CAL_IS_READONLY);
    }

    if (item.id == null) {
      return onError("ID is null in deleteItem", Cr.NS_ERROR_FAILURE);
    }

    let oldItem;
    if (this.relaxedMode) {
      oldItem = item;
    } else {
      oldItem = this.mItems[item.id];
      if (oldItem.generation != item.generation) {
        return onError("generation mismatch in deleteItem", Cr.NS_ERROR_FAILURE);
      }
    }

    delete this.mItems[item.id];
    this.mMetaData.delete(item.id);

    this.notifyOperationComplete(null, Cr.NS_OK, Ci.calIOperationListener.DELETE, item.id, item);
    // notify observers
    this.mObservers.notify("onDeleteItem", [oldItem]);
    return null;
  },

  // Promise<calIItemBase|null> getItem(in string id);
  async getItem(aId) {
    return this.mItems[aId] || null;
  },

  // ReadableStream<calIItemBase> getItems(in unsigned long itemFilter,
  //                                       in unsigned long count,
  //                                       in calIDateTime rangeStart,
  //                                       in calIDateTime rangeEnd)
  getItems(itemFilter, count, rangeStart, rangeEnd) {
    const calICalendar = Ci.calICalendar;

    let itemsFound = [];

    //
    // filters
    //

    let wantUnrespondedInvitations =
      (itemFilter & calICalendar.ITEM_FILTER_REQUEST_NEEDS_ACTION) != 0;
    let superCal;
    try {
      superCal = this.superCalendar.QueryInterface(Ci.calISchedulingSupport);
    } catch (exc) {
      wantUnrespondedInvitations = false;
    }
    function checkUnrespondedInvitation(item) {
      const att = superCal.getInvitedAttendee(item);
      return att && att.participationStatus == "NEEDS-ACTION";
    }

    // item base type
    const wantEvents = (itemFilter & calICalendar.ITEM_FILTER_TYPE_EVENT) != 0;
    const wantTodos = (itemFilter & calICalendar.ITEM_FILTER_TYPE_TODO) != 0;
    if (!wantEvents && !wantTodos) {
      // bail.
      return CalReadableStreamFactory.createEmptyReadableStream();
    }

    // completed?
    const itemCompletedFilter = (itemFilter & calICalendar.ITEM_FILTER_COMPLETED_YES) != 0;
    const itemNotCompletedFilter = (itemFilter & calICalendar.ITEM_FILTER_COMPLETED_NO) != 0;
    function checkCompleted(item) {
      item.QueryInterface(Ci.calITodo);
      return item.isCompleted ? itemCompletedFilter : itemNotCompletedFilter;
    }

    // return occurrences?
    const itemReturnOccurrences = (itemFilter & calICalendar.ITEM_FILTER_CLASS_OCCURRENCES) != 0;

    rangeStart = cal.dtz.ensureDateTime(rangeStart);
    rangeEnd = cal.dtz.ensureDateTime(rangeEnd);
    let startTime = -9223372036854775000;
    if (rangeStart) {
      startTime = rangeStart.nativeTime;
    }

    let requestedFlag = 0;
    if ((itemFilter & calICalendar.ITEM_FILTER_OFFLINE_CREATED) != 0) {
      requestedFlag = cICL.OFFLINE_FLAG_CREATED_RECORD;
    } else if ((itemFilter & calICalendar.ITEM_FILTER_OFFLINE_MODIFIED) != 0) {
      requestedFlag = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
    } else if ((itemFilter & calICalendar.ITEM_FILTER_OFFLINE_DELETED) != 0) {
      requestedFlag = cICL.OFFLINE_FLAG_DELETED_RECORD;
    }

    const matchOffline = function (itemFlag, reqFlag) {
      // Same as storage calendar sql query. For comparison:
      // reqFlag is :offline_journal (parameter),
      // itemFlag is offline_journal (field value)
      // ...
      // AND (:offline_journal IS NULL
      // AND  (offline_journal IS NULL
      //  OR   offline_journal != ${cICL.OFFLINE_FLAG_DELETED_RECORD}))
      //  OR offline_journal == :offline_journal

      return (
        (!reqFlag && (!itemFlag || itemFlag != cICL.OFFLINE_FLAG_DELETED_RECORD)) ||
        itemFlag == reqFlag
      );
    };

    const self = this;
    return CalReadableStreamFactory.createBoundedReadableStream(
      count,
      CalReadableStreamFactory.defaultQueueSize,
      {
        async start(controller) {
          return new Promise(resolve => {
            cal.iterate.forEach(
              self.mItems,
              ([, item]) => {
                const isEvent_ = item.isEvent();
                if (isEvent_) {
                  if (!wantEvents) {
                    return cal.iterate.forEach.CONTINUE;
                  }
                } else if (!wantTodos) {
                  return cal.iterate.forEach.CONTINUE;
                }

                const hasItemFlag = item.id in self.mOfflineFlags;
                const itemFlag = hasItemFlag ? self.mOfflineFlags[item.id] : 0;

                // If the offline flag doesn't match, skip the item
                if (!matchOffline(itemFlag, requestedFlag)) {
                  return cal.iterate.forEach.CONTINUE;
                }

                if (itemReturnOccurrences && item.recurrenceInfo) {
                  if (item.recurrenceInfo.recurrenceEndDate < startTime) {
                    return cal.iterate.forEach.CONTINUE;
                  }

                  let startDate = rangeStart;
                  if (!rangeStart && item.isTodo()) {
                    startDate = item.entryDate;
                  }
                  let occurrences = item.recurrenceInfo.getOccurrences(
                    startDate,
                    rangeEnd,
                    count ? count - itemsFound.length : 0
                  );
                  if (wantUnrespondedInvitations) {
                    occurrences = occurrences.filter(checkUnrespondedInvitation);
                  }
                  if (!isEvent_) {
                    occurrences = occurrences.filter(checkCompleted);
                  }
                  itemsFound = itemsFound.concat(occurrences);
                } else if (
                  (!wantUnrespondedInvitations || checkUnrespondedInvitation(item)) &&
                  (isEvent_ || checkCompleted(item)) &&
                  cal.item.checkIfInRange(item, rangeStart, rangeEnd)
                ) {
                  // This needs fixing for recurring items, e.g. DTSTART of parent may occur before rangeStart.
                  // This will be changed with bug 416975.
                  itemsFound.push(item);
                }
                if (controller.maxTotalItemsReached) {
                  return cal.iterate.forEach.BREAK;
                }
                return cal.iterate.forEach.CONTINUE;
              },
              () => {
                controller.enqueue(itemsFound);
                controller.close();
                resolve();
              }
            );
          });
        },
      }
    );
  },

  //
  // calIOfflineStorage interface
  //
  async addOfflineItem(aItem) {
    this.mOfflineFlags[aItem.id] = cICL.OFFLINE_FLAG_CREATED_RECORD;
  },

  async modifyOfflineItem(aItem) {
    const oldFlag = this.mOfflineFlags[aItem.id];
    if (
      oldFlag != cICL.OFFLINE_FLAG_CREATED_RECORD &&
      oldFlag != cICL.OFFLINE_FLAG_DELETED_RECORD
    ) {
      this.mOfflineFlags[aItem.id] = cICL.OFFLINE_FLAG_MODIFIED_RECORD;
    }

    this.notifyOperationComplete(null, Cr.NS_OK, Ci.calIOperationListener.MODIFY, aItem.id, aItem);
    return aItem;
  },

  async deleteOfflineItem(aItem) {
    const oldFlag = this.mOfflineFlags[aItem.id];
    if (oldFlag == cICL.OFFLINE_FLAG_CREATED_RECORD) {
      delete this.mItems[aItem.id];
      delete this.mOfflineFlags[aItem.id];
    } else {
      this.mOfflineFlags[aItem.id] = cICL.OFFLINE_FLAG_DELETED_RECORD;
    }

    // notify observers
    this.observers.notify("onDeleteItem", [aItem]);
  },

  async getItemOfflineFlag(aItem) {
    return aItem && aItem.id in this.mOfflineFlags ? this.mOfflineFlags[aItem.id] : null;
  },

  async resetItemOfflineFlag(aItem) {
    delete this.mOfflineFlags[aItem.id];
  },

  //
  // calISyncWriteCalendar interface
  //
  setMetaData(id, value) {
    this.mMetaData.set(id, value);
  },
  deleteMetaData(id) {
    this.mMetaData.delete(id);
  },
  getMetaData(id) {
    return this.mMetaData.get(id);
  },
  getAllMetaDataIds() {
    return [...this.mMetaData.keys()];
  },
  getAllMetaDataValues() {
    return [...this.mMetaData.values()];
  },
};
