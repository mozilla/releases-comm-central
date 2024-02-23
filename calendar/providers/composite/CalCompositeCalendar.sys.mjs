/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

var { CalReadableStreamFactory } = ChromeUtils.import(
  "resource:///modules/CalReadableStreamFactory.jsm"
);

/**
 * Calendar specific utility functions
 */

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

export function CalCompositeCalendar() {
  this.mObserverHelper = new calCompositeCalendarObserverHelper(this);
  this.wrappedJSObject = this;

  this.mCalendars = [];
  this.mCompositeObservers = new cal.data.ObserverSet(Ci.calICompositeObserver);
  this.mObservers = new cal.data.ObserverSet(Ci.calIObserver);
  this.mDefaultCalendar = null;
  this.mStatusObserver = null;
}

var calCompositeCalendarClassID = Components.ID("{aeff788d-63b0-4996-91fb-40a7654c6224}");
var calCompositeCalendarInterfaces = ["calICalendar", "calICompositeCalendar"];
CalCompositeCalendar.prototype = {
  classID: calCompositeCalendarClassID,
  QueryInterface: ChromeUtils.generateQI(calCompositeCalendarInterfaces),

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
      for (const calendar of this.mCalendars) {
        this.removeCalendar(calendar);
      }
    }

    this.mPrefPrefix = aPrefPrefix;
    this.mActivePref = aPrefPrefix + "-in-composite";
    this.mDefaultPref = aPrefPrefix + "-default";
    const cals = cal.manager.getCalendars();

    cals.forEach(function (calendar) {
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
    const id = aCalendar.id;
    const newCalendars = this.mCalendars.filter(calendar => calendar.id != id);
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
    for (const calendar of this.mCalendars) {
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
    const wrappedCObserver = cal.wrapInstance(aObserver, Ci.calICompositeObserver);
    if (wrappedCObserver) {
      this.mCompositeObservers.add(wrappedCObserver);
    }
    this.mObservers.add(aObserver);
  },

  // void removeObserver( in calIObserver observer );
  removeObserver(aObserver) {
    const wrappedCObserver = cal.wrapInstance(aObserver, Ci.calICompositeObserver);
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
    for (const calendar of this.enabledCalendars) {
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

  // Promise<calIItemBase> modifyItem( in calIItemBase aNewItem, in calIItemBase aOldItem)
  async modifyItem(aNewItem, aOldItem) {
    cal.ASSERT(aNewItem.calendar, "Composite can't modify item with null calendar", true);
    cal.ASSERT(aNewItem.calendar != this, "Composite can't modify item with this calendar", true);

    return aNewItem.calendar.modifyItem(aNewItem, aOldItem);
  },

  // Promise<void> deleteItem(in calIItemBase aItem);
  async deleteItem(aItem) {
    cal.ASSERT(aItem.calendar, "Composite can't delete item with null calendar", true);
    cal.ASSERT(aItem.calendar != this, "Composite can't delete item with this calendar", true);

    return aItem.calendar.deleteItem(aItem);
  },

  // Promise<calIItemBase> addItem(in calIItemBase aItem);
  addItem(aItem) {
    return this.mDefaultCalendar.addItem(aItem);
  },

  // Promise<calIItemBase|null> getItem(in string aId);
  async getItem(aId) {
    for (const calendar of this.enabledCalendars) {
      const item = await calendar.getItem(aId);
      if (item) {
        return item;
      }
    }
    return null;
  },

  // ReadableStream<calItemBase> getItems(in unsigned long itemFilter,
  //                                      in unsigned long count,
  //                                      in calIDateTime rangeStart,
  //                                      in calIDateTime rangeEnd)
  getItems(itemFilter, count, rangeStart, rangeEnd) {
    // If there are no calendars return early.
    const enabledCalendars = this.enabledCalendars;
    if (enabledCalendars.length == 0) {
      return CalReadableStreamFactory.createEmptyReadableStream();
    }
    if (this.mStatusObserver) {
      if (this.mStatusObserver.spinning == Ci.calIStatusObserver.NO_PROGRESS) {
        this.mStatusObserver.startMeteors(Ci.calIStatusObserver.UNDETERMINED_PROGRESS, -1);
      }
    }

    const compositeCal = this;
    return CalReadableStreamFactory.createBoundedReadableStream(
      count,
      CalReadableStreamFactory.defaultQueueSize,
      {
        iterators: [],
        async start(controller) {
          for (const calendar of enabledCalendars) {
            const iterator = cal.iterate.streamValues(
              calendar.getItems(itemFilter, count, rangeStart, rangeEnd)
            );
            this.iterators.push(iterator);
            for await (const items of iterator) {
              controller.enqueue(items);
            }

            if (compositeCal.statusDisplayed) {
              compositeCal.mStatusObserver.calendarCompleted(calendar);
            }
          }
          if (compositeCal.statusDisplayed) {
            compositeCal.mStatusObserver.stopMeteors();
          }
          controller.close();
        },

        async cancel(reason) {
          for (const iterator of this.iterators) {
            await iterator.cancel(reason);
          }
          if (compositeCal.statusDisplayed) {
            compositeCal.mStatusObserver.stopMeteors();
          }
        },
      }
    );
  },

  // Promise<calItemBase[]> getItemsAsArray(in unsigned long itemFilter,
  //                                        in unsigned long count,
  //                                        in calIDateTime rangeStart,
  //                                        in calIDateTime rangeEnd)
  async getItemsAsArray(itemFilter, count, rangeStart, rangeEnd) {
    return cal.iterate.streamToArray(this.getItems(itemFilter, count, rangeStart, rangeEnd));
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
