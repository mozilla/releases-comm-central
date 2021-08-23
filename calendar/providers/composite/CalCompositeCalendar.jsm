/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalCompositeCalendar"];

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * Calendar specific utility functions
 */
var calIOperationListener = Ci.calIOperationListener;

function calCompositeCalendarObserverHelper(compCalendar) {
  this.compCalendar = compCalendar;
}

calCompositeCalendarObserverHelper.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  onStartBatch(calendar) {
    this.compCalendar.mObservers.notify("onStartBatch", [calendar]);
  },

  onEndBatch(calendar) {
    this.compCalendar.mObservers.notify("onEndBatch", [calendar]);
  },

  onLoad(calendar) {
    this.compCalendar.mObservers.notify("onLoad", [calendar]);
  },

  onAddItem(aItem) {
    this.compCalendar.mObservers.notify("onAddItem", arguments);
  },

  onModifyItem(aNewItem, aOldItem) {
    this.compCalendar.mObservers.notify("onModifyItem", arguments);
  },

  onDeleteItem(aDeletedItem) {
    this.compCalendar.mObservers.notify("onDeleteItem", arguments);
  },

  onError(aCalendar, aErrNo, aMessage) {
    this.compCalendar.mObservers.notify("onError", arguments);
  },

  onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
    this.compCalendar.mObservers.notify("onPropertyChanged", arguments);
  },

  onPropertyDeleting(aCalendar, aName) {
    this.compCalendar.mObservers.notify("onPropertyDeleting", arguments);
  },
};

function CalCompositeCalendar() {
  this.mObserverHelper = new calCompositeCalendarObserverHelper(this);
  this.wrappedJSObject = this;

  this.mCalendars = [];
  this.mCompositeObservers = new cal.data.ObserverSet(Ci.calICompositeObserver);
  this.mObservers = new cal.data.ObserverSet(Ci.calIObserver);
  this.mDefaultCalendar = null;
  this.mStatusObserver = null;
}

var calCompositeCalendarClassID = Components.ID("{aeff788d-63b0-4996-91fb-40a7654c6224}");
var calCompositeCalendarInterfaces = [
  "calICalendarProvider",
  "calICalendar",
  "calICompositeCalendar",
];
CalCompositeCalendar.prototype = {
  classID: calCompositeCalendarClassID,
  QueryInterface: ChromeUtils.generateQI(calCompositeCalendarInterfaces),

  //
  // calICalendarProvider interface
  //
  get prefChromeOverlay() {
    return null;
  },

  get displayName() {
    return cal.l10n.getCalString("compositeName");
  },

  get shortName() {
    return this.displayName();
  },

  createCalendar() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  deleteCalendar(calendar, listener) {
    // You shouldn't be able to delete from the composite calendar.
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  //
  // calICompositeCalendar interface
  //

  mCalendars: null,
  mDefaultCalendar: null,
  mPrefPrefix: null,
  mDefaultPref: null,
  mActivePref: null,

  get enabledCalendars() {
    return this.mCalendars.filter(e => !e.getProperty("disabled"));
  },

  set prefPrefix(aPrefPrefix) {
    if (this.mPrefPrefix) {
      for (let calendar of this.mCalendars) {
        this.removeCalendar(calendar);
      }
    }
    this.mPrefPrefix = aPrefPrefix;
    this.mActivePref = aPrefPrefix + "-in-composite";
    this.mDefaultPref = aPrefPrefix + "-default";
    let mgr = cal.getCalendarManager();
    let cals = mgr.getCalendars();

    cals.forEach(function(calendar) {
      if (calendar.getProperty(this.mActivePref)) {
        this.addCalendar(calendar);
      }
      if (calendar.getProperty(this.mDefaultPref)) {
        this.setDefaultCalendar(calendar, false);
      }
    }, this);
  },

  get prefPrefix() {
    return this.mPrefPrefix;
  },

  addCalendar(aCalendar) {
    cal.ASSERT(aCalendar.id, "calendar does not have an id!", true);

    // check if the calendar already exists
    if (this.getCalendarById(aCalendar.id)) {
      return;
    }

    // add our observer helper
    aCalendar.addObserver(this.mObserverHelper);

    this.mCalendars.push(aCalendar);
    if (this.mPrefPrefix) {
      aCalendar.setProperty(this.mActivePref, true);
    }
    this.mCompositeObservers.notify("onCalendarAdded", [aCalendar]);

    // if we have no default calendar, we need one here
    if (this.mDefaultCalendar == null && !aCalendar.getProperty("disabled")) {
      this.setDefaultCalendar(aCalendar, false);
    }
  },

  removeCalendar(aCalendar) {
    let id = aCalendar.id;
    let newCalendars = this.mCalendars.filter(calendar => calendar.id != id);
    if (newCalendars.length != this.mCalendars) {
      this.mCalendars = newCalendars;
      if (this.mPrefPrefix) {
        aCalendar.deleteProperty(this.mActivePref);
        aCalendar.deleteProperty(this.mDefaultPref);
      }
      aCalendar.removeObserver(this.mObserverHelper);
      this.mCompositeObservers.notify("onCalendarRemoved", [aCalendar]);
    }
  },

  getCalendarById(aId) {
    for (let calendar of this.mCalendars) {
      if (calendar.id == aId) {
        return calendar;
      }
    }
    return null;
  },

  getCalendars() {
    return this.mCalendars;
  },

  get defaultCalendar() {
    return this.mDefaultCalendar;
  },

  setDefaultCalendar(calendar, usePref) {
    // Don't do anything if the passed calendar is the default calendar
    if (calendar && this.mDefaultCalendar && this.mDefaultCalendar.id == calendar.id) {
      return;
    }
    if (usePref && this.mPrefPrefix) {
      if (this.mDefaultCalendar) {
        this.mDefaultCalendar.deleteProperty(this.mDefaultPref);
      }
      // if not null set the new calendar as default in the preferences
      if (calendar) {
        calendar.setProperty(this.mDefaultPref, true);
      }
    }
    this.mDefaultCalendar = calendar;
    this.mCompositeObservers.notify("onDefaultCalendarChanged", [calendar]);
  },

  set defaultCalendar(calendar) {
    this.setDefaultCalendar(calendar, true);
  },

  //
  // calICalendar interface
  //
  // Write operations here are forwarded to either the item's
  // parent calendar, or to the default calendar if one is set.
  // Get operations are sent to each calendar.
  //

  get id() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  set id(id) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  get superCalendar() {
    // There shouldn't be a superCalendar for the composite
    return this;
  },
  set superCalendar(val) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  // this could, at some point, return some kind of URI identifying
  // all the child calendars, thus letting us create nifty calendar
  // trees.
  get uri() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  set uri(val) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  get readOnly() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  set readOnly(bool) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  get canRefresh() {
    return true;
  },

  get name() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  set name(val) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  get type() {
    return "composite";
  },

  getProperty(aName) {
    return this.mDefaultCalendar.getProperty(aName);
  },

  get supportsScheduling() {
    return false;
  },

  getSchedulingSupport() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  setProperty(aName, aValue) {
    return this.mDefaultCalendar.setProperty(aName, aValue);
  },

  deleteProperty(aName) {
    return this.mDefaultCalendar.deleteProperty(aName);
  },

  // void addObserver( in calIObserver observer );
  mCompositeObservers: null,
  mObservers: null,
  addObserver(aObserver) {
    let wrappedCObserver = cal.wrapInstance(aObserver, Ci.calICompositeObserver);
    if (wrappedCObserver) {
      this.mCompositeObservers.add(wrappedCObserver);
    }
    this.mObservers.add(aObserver);
  },

  // void removeObserver( in calIObserver observer );
  removeObserver(aObserver) {
    let wrappedCObserver = cal.wrapInstance(aObserver, Ci.calICompositeObserver);
    if (wrappedCObserver) {
      this.mCompositeObservers.delete(wrappedCObserver);
    }
    this.mObservers.delete(aObserver);
  },

  refresh() {
    if (this.mStatusObserver) {
      this.mStatusObserver.startMeteors(
        Ci.calIStatusObserver.DETERMINED_PROGRESS,
        this.mCalendars.length
      );
    }
    for (let calendar of this.enabledCalendars) {
      try {
        if (calendar.canRefresh) {
          calendar.refresh();
        }
      } catch (e) {
        cal.ASSERT(false, e);
      }
    }
    // send out a single onLoad for this composite calendar,
    // although e.g. the ics provider will trigger another
    // onLoad asynchronously; we cannot rely on every calendar
    // sending an onLoad:
    this.mObservers.notify("onLoad", [this]);
  },

  // void modifyItem( in calIItemBase aNewItem, in calIItemBase aOldItem, in calIOperationListener aListener );
  modifyItem(aNewItem, aOldItem, aListener) {
    cal.ASSERT(aNewItem.calendar, "Composite can't modify item with null calendar", true);
    cal.ASSERT(aNewItem.calendar != this, "Composite can't modify item with this calendar", true);

    return aNewItem.calendar.modifyItem(aNewItem, aOldItem, aListener);
  },

  // void deleteItem( in string id, in calIOperationListener aListener );
  deleteItem(aItem, aListener) {
    cal.ASSERT(aItem.calendar, "Composite can't delete item with null calendar", true);
    cal.ASSERT(aItem.calendar != this, "Composite can't delete item with this calendar", true);

    return aItem.calendar.deleteItem(aItem, aListener);
  },

  // void addItem( in calIItemBase aItem, in calIOperationListener aListener );
  addItem(aItem, aListener) {
    return this.mDefaultCalendar.addItem(aItem, aListener);
  },

  // void getItem( in string aId, in calIOperationListener aListener );
  getItem(aId, aListener) {
    let enabledCalendars = this.enabledCalendars;
    let cmpListener = new calCompositeGetListenerHelper(this, aListener);
    for (let calendar of enabledCalendars) {
      try {
        cmpListener.opGroup.add(calendar.getItem(aId, cmpListener));
      } catch (exc) {
        cal.ASSERT(false, exc);
      }
    }
    return cmpListener.opGroup;
  },

  // void getItems( in unsigned long aItemFilter, in unsigned long aCount,
  //                in calIDateTime aRangeStart, in calIDateTime aRangeEnd,
  //                in calIOperationListener aListener );
  getItems(aItemFilter, aCount, aRangeStart, aRangeEnd, aListener) {
    // If there are no calendars, then we just call onOperationComplete
    let enabledCalendars = this.enabledCalendars;
    if (enabledCalendars.length == 0) {
      aListener.onOperationComplete(this, Cr.NS_OK, calIOperationListener.GET, null, null);
      return null;
    }
    if (this.mStatusObserver) {
      if (this.mStatusObserver.spinning == Ci.calIStatusObserver.NO_PROGRESS) {
        this.mStatusObserver.startMeteors(Ci.calIStatusObserver.UNDETERMINED_PROGRESS, -1);
      }
    }
    let cmpListener = new calCompositeGetListenerHelper(this, aListener, aCount);

    for (let calendar of enabledCalendars) {
      try {
        cmpListener.opGroup.add(
          calendar.getItems(aItemFilter, aCount, aRangeStart, aRangeEnd, cmpListener)
        );
      } catch (exc) {
        cal.ASSERT(false, exc);
      }
    }
    return cmpListener.opGroup;
  },

  startBatch() {
    this.mCompositeObservers.notify("onStartBatch", [this]);
  },
  endBatch() {
    this.mCompositeObservers.notify("onEndBatch", [this]);
  },

  get statusDisplayed() {
    if (this.mStatusObserver) {
      return this.mStatusObserver.spinning != Ci.calIStatusObserver.NO_PROGRESS;
    }
    return false;
  },

  setStatusObserver(aStatusObserver, aWindow) {
    this.mStatusObserver = aStatusObserver;
    if (this.mStatusObserver) {
      this.mStatusObserver.initialize(aWindow);
    }
  },
};

// composite listener helper
function calCompositeGetListenerHelper(aCompositeCalendar, aRealListener, aMaxItems) {
  this.wrappedJSObject = this;
  this.mCompositeCalendar = aCompositeCalendar;
  this.mNumQueries = aCompositeCalendar.enabledCalendars.length;
  this.mRealListener = aRealListener;
  this.mMaxItems = aMaxItems;
}

calCompositeGetListenerHelper.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),

  mNumQueries: 0,
  mRealListener: null,
  mOpGroup: null,
  mReceivedCompletes: 0,
  mFinished: false,
  mMaxItems: 0,
  mItemsReceived: 0,

  get opGroup() {
    if (!this.mOpGroup) {
      this.mOpGroup = new cal.data.OperationGroup(() => {
        let listener = this.mRealListener;
        this.mRealListener = null;
        if (listener) {
          listener.onOperationComplete(
            this,
            Ci.calIErrors.OPERATION_CANCELLED,
            calIOperationListener.GET,
            null,
            null
          );
          if (this.mCompositeCalendar.statusDisplayed) {
            this.mCompositeCalendar.mStatusObserver.stopMeteors();
          }
        }
      });
    }
    return this.mOpGroup;
  },

  onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
    if (!this.mRealListener) {
      // has been cancelled, ignore any providers firing on this...
      return;
    }
    if (this.mFinished) {
      dump("+++ calCompositeGetListenerHelper.onOperationComplete: called with mFinished == true!");
      return;
    }
    if (this.mCompositeCalendar.statusDisplayed) {
      this.mCompositeCalendar.mStatusObserver.calendarCompleted(aCalendar);
    }
    if (!Components.isSuccessCode(aStatus)) {
      // proxy this to a onGetResult
      // XXX - do we want to give the real calendar? or this?
      // XXX - get rid of iid param
      this.mRealListener.onGetResult(aCalendar, aStatus, Ci.nsISupports, aDetail, []);
    }

    this.mReceivedCompletes++;
    if (this.mReceivedCompletes == this.mNumQueries) {
      if (this.mCompositeCalendar.statusDisplayed) {
        this.mCompositeCalendar.mStatusObserver.stopMeteors();
      }
      // we're done here.
      this.mFinished = true;
      this.opGroup.notifyCompleted();
      this.mRealListener.onOperationComplete(this, aStatus, calIOperationListener.GET, null, null);
    }
  },

  onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
    if (!this.mRealListener) {
      // has been cancelled, ignore any providers firing on this...
      return;
    }
    if (this.mFinished) {
      dump("+++ calCompositeGetListenerHelper.onGetResult: called with mFinished == true!");
      return;
    }

    // ignore if we have a max and we're past it
    if (this.mMaxItems && this.mItemsReceived >= this.mMaxItems) {
      return;
    }

    let itemsCount = aItems.length;

    if (
      Components.isSuccessCode(aStatus) &&
      this.mMaxItems &&
      this.mItemsReceived + itemsCount > this.mMaxItems
    ) {
      // this will blow past the limit
      itemsCount = this.mMaxItems - this.mItemsReceived;
      aItems = aItems.slice(0, itemsCount);
    }

    // send GetResults to the real listener
    this.mRealListener.onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems);
    this.mItemsReceived += itemsCount;
  },
};
