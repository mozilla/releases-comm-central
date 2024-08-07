/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * Returns true if the exception passed is one that should cause the cache
 * layer to retry the operation. This is usually a network error or other
 * temporary error.
 *
 * @param {integer} result - The result code to check.
 * @returns {boolean} true, if the result code means server unavailability.
 */
function isUnavailableCode(result) {
  // Stolen from nserror.h
  const NS_ERROR_MODULE_NETWORK = 6;
  function NS_ERROR_GET_MODULE(code) {
    return ((code >> 16) - 0x45) & 0x1fff;
  }

  if (NS_ERROR_GET_MODULE(result) == NS_ERROR_MODULE_NETWORK && !Components.isSuccessCode(result)) {
    // This is a network error, which most likely means we should
    // retry it some time.
    return true;
  }

  // Other potential errors we want to retry with
  switch (result) {
    case Cr.NS_ERROR_NOT_AVAILABLE:
      return true;
    default:
      return false;
  }
}

function calCachedCalendarObserverHelper(home, isCachedObserver) {
  this.home = home;
  this.isCachedObserver = isCachedObserver;
}
calCachedCalendarObserverHelper.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
  isCachedObserver: false,

  onStartBatch() {
    this.home.mObservers.notify("onStartBatch", [this.home]);
  },

  onEndBatch() {
    this.home.mObservers.notify("onEndBatch", [this.home]);
  },

  async onLoad() {
    if (this.isCachedObserver) {
      this.home.mObservers.notify("onLoad", [this.home]);
    } else {
      // start sync action after uncached calendar has been loaded.
      // xxx todo, think about:
      // although onAddItem et al have been called, we need to fire
      // an additional onLoad completing the refresh call (->composite)
      const home = this.home;
      await home.synchronize();
      home.mObservers.notify("onLoad", [home]);
    }
  },

  onAddItem() {
    if (this.isCachedObserver) {
      this.home.mObservers.notify("onAddItem", arguments);
    }
  },

  onModifyItem() {
    if (this.isCachedObserver) {
      this.home.mObservers.notify("onModifyItem", arguments);
    }
  },

  onDeleteItem() {
    if (this.isCachedObserver) {
      this.home.mObservers.notify("onDeleteItem", arguments);
    }
  },

  onError() {
    this.home.mObservers.notify("onError", arguments);
  },

  onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
    if (!this.isCachedObserver) {
      this.home.mObservers.notify("onPropertyChanged", [this.home, aName, aValue, aOldValue]);
    }
  },

  onPropertyDeleting(aCalendar, aName) {
    if (!this.isCachedObserver) {
      this.home.mObservers.notify("onPropertyDeleting", [this.home, aName]);
    }
  },
};

export function calCachedCalendar(uncachedCalendar) {
  this.wrappedJSObject = this;
  this.mSyncQueue = [];
  this.mObservers = new cal.data.ObserverSet(Ci.calIObserver);
  uncachedCalendar.superCalendar = this;
  uncachedCalendar.addObserver(new calCachedCalendarObserverHelper(this, false));
  this.mUncachedCalendar = uncachedCalendar;
  this.setupCachedCalendar();
  if (this.supportsChangeLog) {
    uncachedCalendar.offlineStorage = this.mCachedCalendar;
  }
  this.offlineCachedItems = {};
  this.offlineCachedItemFlags = {};
}

calCachedCalendar.prototype = {
  /* eslint-disable mozilla/use-chromeutils-generateqi */
  QueryInterface(aIID) {
    if (aIID.equals(Ci.calISchedulingSupport) && this.mUncachedCalendar.QueryInterface(aIID)) {
      // check whether uncached calendar supports it:
      return this;
    } else if (aIID.equals(Ci.calICalendar) || aIID.equals(Ci.nsISupports)) {
      return this;
    }
    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  },
  /* eslint-enable mozilla/use-chromeutils-generateqi */

  mCachedCalendar: null,
  mCachedObserver: null,
  mUncachedCalendar: null,
  mObservers: null,
  mSuperCalendar: null,
  offlineCachedItems: null,
  offlineCachedItemFlags: null,

  onCalendarUnregistering() {
    if (this.mCachedCalendar) {
      const self = this;
      this.mCachedCalendar.removeObserver(this.mCachedObserver);
      // TODO put changes into a different calendar and delete
      // afterwards.

      const listener = {
        onDeleteCalendar() {
          self.mCachedCalendar = null;
        },
      };

      this.mCachedCalendar
        .QueryInterface(Ci.calICalendarProvider)
        .deleteCalendar(this.mCachedCalendar, listener);
    }
  },

  setupCachedCalendar() {
    try {
      if (this.mCachedCalendar) {
        // this is actually a resetupCachedCalendar:
        // Although this doesn't really follow the spec, we know the
        // storage calendar's deleteCalendar method is synchronous.
        // TODO put changes into a different calendar and delete
        // afterwards.
        this.mCachedCalendar
          .QueryInterface(Ci.calICalendarProvider)
          .deleteCalendar(this.mCachedCalendar, null);
        if (this.supportsChangeLog) {
          // start with full sync:
          this.mUncachedCalendar.resetLog();
        }
      } else {
        const calType = Services.prefs.getStringPref("calendar.cache.type", "storage");
        // While technically, the above deleteCalendar should delete the
        // whole calendar, this is nothing more than deleting all events
        // todos and properties. Therefore the initialization can be
        // skipped.
        const cachedCalendar = Cc[
          "@mozilla.org/calendar/calendar;1?type=" + calType
        ].createInstance(Ci.calICalendar);
        switch (calType) {
          case "memory": {
            if (this.supportsChangeLog) {
              // start with full sync:
              this.mUncachedCalendar.resetLog();
            }
            break;
          }
          case "storage": {
            const file = cal.provider.getCalendarDirectory();
            file.append("cache.sqlite");
            cachedCalendar.uri = Services.io.newFileURI(file);
            cachedCalendar.id = this.id;
            break;
          }
          default: {
            throw new Error("unsupported cache calendar type: " + calType);
          }
        }
        cachedCalendar.transientProperties = true;
        // Forward the disabled property to the storage calendar so that it
        // stops interacting with the file system. Other properties have no
        // useful effect on the storage calendar, so don't forward them.
        cachedCalendar.setProperty("disabled", this.getProperty("disabled"));
        cachedCalendar.setProperty("relaxedMode", true);
        cachedCalendar.superCalendar = this;
        if (!this.mCachedObserver) {
          this.mCachedObserver = new calCachedCalendarObserverHelper(this, true);
        }
        cachedCalendar.addObserver(this.mCachedObserver);
        this.mCachedCalendar = cachedCalendar;
      }
    } catch (exc) {
      console.error(exc);
    }
  },

  async getOfflineAddedItems() {
    this.offlineCachedItems = {};
    for await (const items of cal.iterate.streamValues(
      this.mCachedCalendar.getItems(
        Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_CREATED,
        0,
        null,
        null
      )
    )) {
      for (const item of items) {
        this.offlineCachedItems[item.hashId] = item;
        this.offlineCachedItemFlags[item.hashId] = Ci.calIChangeLog.OFFLINE_FLAG_CREATED_RECORD;
      }
    }
  },

  async getOfflineModifiedItems() {
    for await (const items of cal.iterate.streamValues(
      this.mCachedCalendar.getItems(
        Ci.calICalendar.ITEM_FILTER_OFFLINE_MODIFIED | Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
        0,
        null,
        null
      )
    )) {
      for (const item of items) {
        this.offlineCachedItems[item.hashId] = item;
        this.offlineCachedItemFlags[item.hashId] = Ci.calIChangeLog.OFFLINE_FLAG_MODIFIED_RECORD;
      }
    }
  },

  async getOfflineDeletedItems() {
    for await (const items of cal.iterate.streamValues(
      this.mCachedCalendar.getItems(
        Ci.calICalendar.ITEM_FILTER_OFFLINE_DELETED | Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
        0,
        null,
        null
      )
    )) {
      for (const item of items) {
        this.offlineCachedItems[item.hashId] = item;
        this.offlineCachedItemFlags[item.hashId] = Ci.calIChangeLog.OFFLINE_FLAG_DELETED_RECORD;
      }
    }
  },

  mPendingSync: null,
  async synchronize() {
    if (!this.mPendingSync) {
      this.mPendingSync = this._doSynchronize().catch(console.error);
    }
    return this.mPendingSync;
  },
  async _doSynchronize() {
    const clearPending = () => {
      this.mPendingSync = null;
    };

    if (this.getProperty("disabled")) {
      clearPending();
      return;
    }

    if (this.offline) {
      clearPending();
      return;
    }

    if (this.supportsChangeLog) {
      await new Promise((resolve, reject) => {
        const spec = this.uri.spec;
        cal.LOG("[calCachedCalendar] Doing changelog based sync for calendar " + spec);
        const opListener = {
          onResult(operation, result) {
            if (!operation || !operation.isPending) {
              const status = operation ? operation.status : Cr.NS_OK;
              clearPending();
              if (!Components.isSuccessCode(status)) {
                reject(
                  "[calCachedCalendar] replay action failed: " +
                    (operation && operation.id ? operation.id : "<unknown>") +
                    ", uri=" +
                    spec +
                    ", result=" +
                    result +
                    ", operation=" +
                    operation
                );
                return;
              }
              cal.LOG("[calCachedCalendar] replayChangesOn finished.");
              resolve();
            }
          },
        };
        this.mUncachedCalendar.replayChangesOn(opListener);
      });
      return;
    }

    cal.LOG("[calCachedCalendar] Doing full sync for calendar " + this.uri.spec);

    await this.getOfflineAddedItems();
    await this.getOfflineModifiedItems();
    await this.getOfflineDeletedItems();

    // TODO instead of deleting the calendar and creating a new
    // one, maybe we want to do a "real" sync between the
    // existing local calendar and the remote calendar.
    this.setupCachedCalendar();

    const modifiedTimes = {};
    try {
      for await (const items of cal.iterate.streamValues(
        this.mUncachedCalendar.getItems(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null)
      )) {
        for (const item of items) {
          // Adding items recd from the Memory Calendar
          // These may be different than what the cache has
          modifiedTimes[item.id] = item.lastModifiedTime;
          this.mCachedCalendar.addItem(item);
        }
      }
    } catch (e) {
      await this.playbackOfflineItems();
      this.mCachedObserver.onLoad(this.mCachedCalendar);
      clearPending();
      throw e; // Do not swallow this error.
    }

    await new Promise(resolve => {
      cal.iterate.forEach(
        this.offlineCachedItems,
        item => {
          switch (this.offlineCachedItemFlags[item.hashId]) {
            case Ci.calIChangeLog.OFFLINE_FLAG_CREATED_RECORD:
              // Created items are not present on the server, so its safe to adopt them
              this.adoptOfflineItem(item.clone());
              break;
            case Ci.calIChangeLog.OFFLINE_FLAG_MODIFIED_RECORD:
              // Two Cases Here:
              if (item.id in modifiedTimes) {
                // The item is still on the server, we just retrieved it in the listener above.
                if (item.lastModifiedTime.compare(modifiedTimes[item.id]) < 0) {
                  // The item on the server has been modified, ask to overwrite
                  cal.WARN(
                    "[calCachedCalendar] Item '" +
                      item.title +
                      "' at the server seems to be modified recently."
                  );
                  this.promptOverwrite("modify", item, null);
                } else {
                  // Our item is newer, just modify the item
                  this.modifyOfflineItem(item, null);
                }
              } else {
                // The item has been deleted from the server, ask if it should be added again
                cal.WARN(
                  "[calCachedCalendar] Item '" + item.title + "' has been deleted from the server"
                );
                if (cal.provider.promptOverwrite("modify", item, null)) {
                  this.adoptOfflineItem(item.clone());
                }
              }
              break;
            case Ci.calIChangeLog.OFFLINE_FLAG_DELETED_RECORD:
              if (item.id in modifiedTimes) {
                // The item seems to exist on the server...
                if (item.lastModifiedTime.compare(modifiedTimes[item.id]) < 0) {
                  // ...and has been modified on the server. Ask to overwrite
                  cal.WARN(
                    "[calCachedCalendar] Item '" +
                      item.title +
                      "' at the server seems to be modified recently."
                  );
                  this.promptOverwrite("delete", item, null);
                } else {
                  // ...and has not been modified. Delete it now.
                  this.deleteOfflineItem(item);
                }
              } else {
                // Item has already been deleted from the server, no need to change anything.
              }
              break;
          }
        },
        async () => {
          this.offlineCachedItems = {};
          this.offlineCachedItemFlags = {};
          await this.playbackOfflineItems();
          clearPending();
          resolve();
        }
      );
    });
  },

  onOfflineStatusChanged(aNewState) {
    if (aNewState) {
      // Going offline: (XXX get items before going offline?) => we may ask the user to stay online a bit longer
    } else if (!this.getProperty("disabled") && this.getProperty("refreshInterval") != "0") {
      // Going online (start replaying changes to the remote calendar).
      // Don't do this if the calendar is disabled or set to manual updates only.
      this.refresh();
    }
  },

  // aOldItem is already in the cache
  async promptOverwrite(aMethod, aItem, aOldItem) {
    const overwrite = cal.provider.promptOverwrite(aMethod, aItem);
    if (overwrite) {
      if (aMethod == "modify") {
        await this.modifyOfflineItem(aItem, aOldItem);
      } else {
        await this.deleteOfflineItem(aItem);
      }
    }
  },

  /*
   * Asynchronously performs playback operations of items added, modified, or deleted offline
   *
   * @param aPlaybackType     (optional) The starting operation type. This function will be
   *                          called recursively through playback operations in the order of
   *                          add, modify, delete. By default playback will start with the add
   *                          operation. Valid values for this parameter are defined as
   *                          OFFLINE_FLAG_XXX constants in the calIChangeLog interface.
   */
  async playbackOfflineItems(aPlaybackType) {
    const self = this;
    const storage = this.mCachedCalendar.QueryInterface(Ci.calIOfflineStorage);

    let itemQueue = [];
    let debugOp;
    let nextCallback;
    let uncachedOp;
    let filter;

    aPlaybackType = aPlaybackType || Ci.calIChangeLog.OFFLINE_FLAG_CREATED_RECORD;
    switch (aPlaybackType) {
      case Ci.calIChangeLog.OFFLINE_FLAG_CREATED_RECORD:
        debugOp = "add";
        nextCallback = this.playbackOfflineItems.bind(
          this,
          Ci.calIChangeLog.OFFLINE_FLAG_MODIFIED_RECORD
        );
        uncachedOp = item => this.mUncachedCalendar.addItem(item);
        filter = Ci.calICalendar.ITEM_FILTER_OFFLINE_CREATED;
        break;
      case Ci.calIChangeLog.OFFLINE_FLAG_MODIFIED_RECORD:
        debugOp = "modify";
        nextCallback = this.playbackOfflineItems.bind(
          this,
          Ci.calIChangeLog.OFFLINE_FLAG_DELETED_RECORD
        );
        uncachedOp = item => this.mUncachedCalendar.modifyItem(item, item);
        filter = Ci.calICalendar.ITEM_FILTER_OFFLINE_MODIFIED;
        break;
      case Ci.calIChangeLog.OFFLINE_FLAG_DELETED_RECORD:
        debugOp = "delete";
        uncachedOp = item => this.mUncachedCalendar.deleteItem(item);
        filter = Ci.calICalendar.ITEM_FILTER_OFFLINE_DELETED;
        break;
      default:
        cal.ERROR("[calCachedCalendar] Invalid playback type: " + aPlaybackType);
        return;
    }

    async function popItemQueue() {
      if (!itemQueue || itemQueue.length == 0) {
        // no items left in the queue, move on to the next operation
        if (nextCallback) {
          await nextCallback();
        }
      } else {
        // perform operation on the next offline item in the queue
        const item = itemQueue.pop();
        let error = null;
        try {
          await uncachedOp(item);
        } catch (e) {
          error = e;
          cal.ERROR(
            "[calCachedCalendar] Could not perform playback operation " +
              debugOp +
              " for item " +
              (item.title || " (none) ") +
              ": " +
              e
          );
        }
        if (!error) {
          if (aPlaybackType == Ci.calIChangeLog.OFFLINE_FLAG_DELETED_RECORD) {
            self.mCachedCalendar.deleteItem(item);
          } else {
            storage.resetItemOfflineFlag(item);
          }
        } else {
          // If the playback action could not be performed, then there
          // is no need for further action. The item still has the
          // offline flag, so it will be taken care of next time.
          cal.WARN(
            "[calCachedCalendar] Unable to perform playback action " +
              debugOp +
              " to the server, will try again next time (" +
              item.id +
              "," +
              error +
              ")"
          );
        }

        // move on to the next item in the queue
        await popItemQueue();
      }
    }

    itemQueue = itemQueue.concat(
      await this.mCachedCalendar.getItemsAsArray(
        Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | filter,
        0,
        null,
        null
      )
    );

    if (this.offline) {
      cal.LOG("[calCachedCalendar] back to offline mode, reconciliation aborted");
    } else {
      cal.LOG(
        "[calCachedCalendar] Performing playback operation " +
          debugOp +
          " on " +
          itemQueue.length +
          " items to " +
          self.name
      );
      // start the first operation
      await popItemQueue();
    }
  },

  get superCalendar() {
    return (this.mSuperCalendar && this.mSuperCalendar.superCalendar) || this;
  },
  set superCalendar(val) {
    this.mSuperCalendar = val;
  },

  get offline() {
    return Services.io.offline;
  },
  get supportsChangeLog() {
    return cal.wrapInstance(this.mUncachedCalendar, Ci.calIChangeLog) != null;
  },

  get canRefresh() {
    // enable triggering sync using the reload button
    return true;
  },

  get supportsScheduling() {
    return this.mUncachedCalendar.supportsScheduling;
  },

  getSchedulingSupport() {
    return this.mUncachedCalendar.getSchedulingSupport();
  },

  getProperty(aName) {
    switch (aName) {
      case "cache.enabled":
        if (this.mUncachedCalendar.getProperty("cache.always")) {
          return true;
        }
        break;
    }

    return this.mUncachedCalendar.getProperty(aName);
  },
  setProperty(aName, aValue) {
    if (aName == "disabled") {
      // Forward the disabled property to the storage calendar so that it
      // stops interacting with the file system. Other properties have no
      // useful effect on the storage calendar, so don't forward them.
      this.mCachedCalendar.setProperty(aName, aValue);
    }
    this.mUncachedCalendar.setProperty(aName, aValue);
  },
  async refresh() {
    if (this.offline) {
      this.downstreamRefresh();
    } else if (this.supportsChangeLog) {
      /* we first ensure that any remaining offline items are reconciled with the calendar server */
      await this.playbackOfflineItems();
      await this.downstreamRefresh();
    } else {
      this.downstreamRefresh();
    }
  },
  async downstreamRefresh() {
    if (this.mUncachedCalendar.canRefresh && !this.offline) {
      this.mUncachedCalendar.refresh(); // will trigger synchronize once the calendar is loaded
      return;
    }
    await this.synchronize();
    // fire completing onLoad for this refresh call
    this.mCachedObserver.onLoad(this.mCachedCalendar);
  },

  addObserver(aObserver) {
    this.mObservers.add(aObserver);
  },
  removeObserver(aObserver) {
    this.mObservers.delete(aObserver);
  },

  async addItem(item) {
    return this.adoptItem(item.clone());
  },

  async adoptItem(item) {
    return new Promise((resolve, reject) => {
      this.doAdoptItem(item, (calendar, status, opType, id, detail) => {
        if (!Components.isSuccessCode(status)) {
          return reject(new Components.Exception(detail, status));
        }
        return resolve(detail);
      });
    });
  },

  /**
   * The function form of calIOperationListener.onOperationComplete used where
   * the whole interface is not needed.
   *
   * @callback OnOperationCompleteHandler
   *
   * @param {calICalendar} calendar
   * @param {number} status
   * @param {number} operationType
   * @param {string} id
   * @param {calIItem|Error} detail
   */

  /**
   * Keeps track of pending callbacks injected into the uncached calendar during
   * adopt or modify operations. This is done to ensure we remove the correct
   * callback when multiple operations occur at once.
   *
   * @type {OnOperationComplateHandler[]}
   */
  _injectedCallbacks: [],

  /**
   * Executes the actual addition of the item using either the cached or uncached
   * calendar depending on offline state. A separate method is used here to
   * preserve the order of the "onAddItem" event.
   *
   * @param {calIItem} item
   * @param {OnOperationCompleteHandler} listener
   */
  doAdoptItem(item, listener) {
    // Forwarding add/modify/delete to the cached calendar using the calIObserver
    // callbacks would be advantageous, because the uncached provider could implement
    // a true push mechanism firing without being triggered from within the program.
    // But this would mean the uncached provider fires on the passed
    // calIOperationListener, e.g. *before* it fires on calIObservers
    // (because that order is undefined). Firing onOperationComplete before onAddItem et al
    // would result in this facade firing onOperationComplete even though the modification
    // hasn't yet been performed on the cached calendar (which happens in onAddItem et al).
    // Result is that we currently stick to firing onOperationComplete if the cached calendar
    // has performed the modification, see below:

    const onSuccess = item =>
      listener(item.calendar, Cr.NS_OK, Ci.calIOperationListener.ADD, item.id, item);
    const onError = e =>
      listener(
        item.calendar,
        e.result || Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.ADD,
        item.id,
        e
      );

    if (this.offline) {
      // If we are offline, don't even try to add the item
      this.adoptOfflineItem(item).then(onSuccess, onError);
    } else {
      // Otherwise ask the provider to add the item now.

      // Expected to be called in the context of the uncached calendar's adoptItem()
      // so this adoptItem() call returns first. This is a needed hack to keep the
      // cached calendar's "onAddItem" event firing before the endBatch() call of
      // the uncached calendar.
      // @implements {OnOperationCompleteHandler}
      const adoptItemCallback = async (calendar, status, opType, id, detail) => {
        if (isUnavailableCode(status)) {
          // The item couldn't be added to the (remote) location,
          // this is like being offline. Add the item to the cached
          // calendar instead.
          cal.LOG(
            `[calCachedCalendar] Calendar ${calendar.name}' is unavailable, adding item offline`
          );
          await this.adoptOfflineItem(item).then(onSuccess, onError);
        } else if (Components.isSuccessCode(status)) {
          // On success, add the item to the cache.
          await this.mCachedCalendar.addItem(detail).then(onSuccess, onError);
        } else {
          // Either an error occurred or this is a successful add
          // to a cached calendar. Forward the call to the listener
          listener(this, status, opType, id, detail);
        }
        this.mUncachedCalendar.wrappedJSObject._cachedAdoptItemCallback = null;
        this._injectedCallbacks = this._injectedCallbacks.filter(cb => cb != adoptItemCallback);
      };

      // Store the callback so we can remove the correct one later.
      this._injectedCallbacks.push(adoptItemCallback);

      this.mUncachedCalendar.wrappedJSObject._cachedAdoptItemCallback = adoptItemCallback;
      this.mUncachedCalendar.adoptItem(item).catch(e => {
        adoptItemCallback(
          item.calendar,
          e.result || Cr.NS_ERROR_FAILURE,
          Ci.calIOperationListener.ADD,
          item.id,
          e
        );
      });
    }
  },

  /**
   * Adds an item to the cached (storage) calendar.
   *
   * @param {calIItem} item
   * @returns {calIItem}
   */
  async adoptOfflineItem(item) {
    const adoptedItem = await this.mCachedCalendar.adoptItem(item);
    await this.mCachedCalendar.QueryInterface(Ci.calIOfflineStorage).addOfflineItem(adoptedItem);
    return adoptedItem;
  },

  async modifyItem(newItem, oldItem) {
    return new Promise((resolve, reject) => {
      this.doModifyItem(newItem, oldItem, (calendar, status, opType, id, detail) => {
        if (!Components.isSuccessCode(status)) {
          return reject(new Components.Exception(detail, status));
        }
        return resolve(detail);
      });
    });
  },

  /**
   * Executes the actual modification of the item using either the cached or
   * uncached calendar depending on offline state. A separate method is used here
   * to preserve the order of the "onModifyItem" event.
   *
   * @param {calIItem} newItem
   * @param {calIItem} oldItem
   * @param {OnOperationCompleteHandler} listener
   */
  doModifyItem(newItem, oldItem, listener) {
    const onSuccess = item =>
      listener(item.calendar, Cr.NS_OK, Ci.calIOperationListener.MODIFY, item.id, item);
    const onError = e =>
      listener(
        oldItem.calendar,
        e.result || Cr.NS_ERROR_FAILURE,
        Ci.calIOperationListener.MODIFY,
        oldItem.id,
        e
      );

    // Forwarding add/modify/delete to the cached calendar using the calIObserver
    // callbacks would be advantageous, because the uncached provider could implement
    // a true push mechanism firing without being triggered from within the program.
    // But this would mean the uncached provider fires on the passed
    // calIOperationListener, e.g. *before* it fires on calIObservers
    // (because that order is undefined). Firing onOperationComplete before onAddItem et al
    // would result in this facade firing onOperationComplete even though the modification
    // hasn't yet been performed on the cached calendar (which happens in onAddItem et al).
    // Result is that we currently stick to firing onOperationComplete if the cached calendar
    // has performed the modification, see below: */

    // Expected to be called in the context of the uncached calendar's modifyItem()
    // so this modifyItem() call returns first. This is a needed hack to keep the
    // cached calendar's "onModifyItem" event firing before the endBatch() call of
    // the uncached calendar.
    const modifyItemCallback = async (calendar, status, opType, id, detail) => {
      // Returned Promise only available through wrappedJSObject.
      if (isUnavailableCode(status)) {
        // The item couldn't be modified at the (remote) location,
        // this is like being offline. Add the item to the cache
        // instead.
        cal.LOG(
          "[calCachedCalendar] Calendar " +
            calendar.name +
            " is unavailable, modifying item offline"
        );
        await this.modifyOfflineItem(newItem, oldItem).then(onSuccess, onError);
      } else if (Components.isSuccessCode(status)) {
        // On success, modify the item in the cache
        await this.mCachedCalendar.modifyItem(detail, oldItem).then(onSuccess, onError);
      } else {
        // This happens on error, forward the error through the listener
        listener(this, status, opType, id, detail);
      }
      this._injectedCallbacks = this._injectedCallbacks.filter(cb => cb != modifyItemCallback);
    };

    // First of all, we should find out if the item to modify is
    // already an offline item or not.
    if (this.offline) {
      // If we are offline, don't even try to modify the item
      this.modifyOfflineItem(newItem, oldItem).then(onSuccess, onError);
    } else {
      // Otherwise, get the item flags and further process the item.
      this.mCachedCalendar.getItemOfflineFlag(oldItem).then(offline_flag => {
        if (
          offline_flag == Ci.calIChangeLog.OFFLINE_FLAG_CREATED_RECORD ||
          offline_flag == Ci.calIChangeLog.OFFLINE_FLAG_MODIFIED_RECORD
        ) {
          // The item is already offline, just modify it in the cache
          this.modifyOfflineItem(newItem, oldItem).then(onSuccess, onError);
        } else {
          // Not an offline item, attempt to modify using provider

          // This is a needed hack to keep the cached calendar's "onModifyItem" event
          // firing before the endBatch() call of the uncached calendar. It is called
          // in mUncachedCalendar's modifyItem() method.
          this.mUncachedCalendar.wrappedJSObject._cachedModifyItemCallback = modifyItemCallback;

          // Store the callback so we can remove the correct one later.
          this._injectedCallbacks.push(modifyItemCallback);

          this.mUncachedCalendar.modifyItem(newItem, oldItem).catch(e => {
            modifyItemCallback(
              oldItem.calendar,
              e.result || Cr.NS_ERROR_FAILURE,
              Ci.calIOperationListener.MODIFY,
              oldItem.id,
              e
            );
          });
        }
      });
    }
  },

  /**
   * Modifies an item in the cached calendar.
   *
   * @param {calIItem} newItem
   * @param {calIItem} oldItem
   * @returns {calIItem}
   */
  async modifyOfflineItem(newItem, oldItem) {
    const modifiedItem = await this.mCachedCalendar.modifyItem(newItem, oldItem);
    await this.mCachedCalendar
      .QueryInterface(Ci.calIOfflineStorage)
      .modifyOfflineItem(modifiedItem);
    return modifiedItem;
  },

  async deleteItem(item) {
    // First of all, we should find out if the item to delete is
    // already an offline item or not.
    if (this.offline) {
      // If we are offline, don't even try to delete the item
      await this.deleteOfflineItem(item);
    } else {
      // Otherwise, get the item flags, the listener will further
      // process the item.
      const offline_flag = await this.mCachedCalendar.getItemOfflineFlag(item);
      if (
        offline_flag == Ci.calIChangeLog.OFFLINE_FLAG_CREATED_RECORD ||
        offline_flag == Ci.calIChangeLog.OFFLINE_FLAG_MODIFIED_RECORD
      ) {
        // The item is already offline, just mark it deleted it in
        // the cache
        await this.deleteOfflineItem(item);
      } else {
        try {
          // Not an offline item, attempt to delete using provider
          await this.mUncachedCalendar.deleteItem(item);

          // On success, delete the item from the cache
          await this.mCachedCalendar.deleteItem(item);

          // Also, remove any meta data associated with the item
          try {
            this.mCachedCalendar.QueryInterface(Ci.calISyncWriteCalendar).deleteMetaData(item.id);
          } catch (e) {
            cal.LOG("[calCachedCalendar] Offline storage doesn't support metadata");
          }
        } catch (e) {
          if (isUnavailableCode(e.result)) {
            // The item couldn't be deleted at the (remote) location,
            // this is like being offline. Mark the item deleted in the
            // cache instead.
            cal.LOG(
              "[calCachedCalendar] Calendar " +
                item.calendar.name +
                " is unavailable, deleting item offline"
            );
            await this.deleteOfflineItem(item);
          }
        }
      }
    }
  },

  async deleteOfflineItem(item) {
    /* We do not delete the item from the cache, as we will need it when reconciling the cache content and the server content. */
    return this.mCachedCalendar.QueryInterface(Ci.calIOfflineStorage).deleteOfflineItem(item);
  },
};
(function () {
  function defineForwards(proto, targetName, functions, getters, gettersAndSetters) {
    function defineForwardGetter(attr) {
      proto.__defineGetter__(attr, function () {
        return this[targetName][attr];
      });
    }
    function defineForwardGetterAndSetter(attr) {
      defineForwardGetter(attr);
      proto.__defineSetter__(attr, function (value) {
        return (this[targetName][attr] = value);
      });
    }
    function defineForwardFunction(funcName) {
      proto[funcName] = function (...args) {
        const obj = this[targetName];
        return obj[funcName](...args);
      };
    }
    functions.forEach(defineForwardFunction);
    getters.forEach(defineForwardGetter);
    gettersAndSetters.forEach(defineForwardGetterAndSetter);
  }

  defineForwards(
    calCachedCalendar.prototype,
    "mUncachedCalendar",
    ["deleteProperty", "isInvitation", "getInvitedAttendee", "canNotify"],
    ["providerID", "type", "aclManager", "aclEntry"],
    ["id", "name", "uri", "readOnly"]
  );
  defineForwards(
    calCachedCalendar.prototype,
    "mCachedCalendar",
    ["getItem", "getItems", "getItemsAsArray", "startBatch", "endBatch"],
    [],
    []
  );
})();
