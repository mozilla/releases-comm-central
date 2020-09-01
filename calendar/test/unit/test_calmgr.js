/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

/**
 * Tests the calICalendarManager interface
 */
function run_test() {
  do_calendar_startup(run_next_test);
}

class CalendarManagerObserver {
  QueryInterface = ChromeUtils.generateQI(["calICalendarManager"]);

  constructor() {
    this.reset();
  }

  reset() {
    this.registered = [];
    this.unregistering = [];
    this.deleting = [];
  }

  check({ unregistering, registered, deleting }) {
    equal(this.unregistering[0], unregistering);
    equal(this.registered[0], registered);
    equal(this.deleting[0], deleting);

    this.reset();
  }

  onCalendarRegistered(calendar) {
    this.registered.push(calendar.id);
  }

  onCalendarUnregistering(calendar) {
    this.unregistering.push(calendar.id);
  }

  onCalendarDeleting(calendar) {
    this.deleting.push(calendar.id);
  }
}

add_test(function test_builtin_registration() {
  function checkCalendarCount(net, rdonly, all) {
    equal(calmgr.networkCalendarCount, net);
    equal(calmgr.readOnlyCalendarCount, rdonly);
    equal(calmgr.calendarCount, all);
  }

  // Initially there should be no calendars.
  let calmgr = cal.getCalendarManager();
  checkCalendarCount(0, 0, 0);

  // Create a local memory calendar, this shouldn't register any calendars.
  let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  checkCalendarCount(0, 0, 0);

  // Register an observer to test it.
  let calmgrObserver = new CalendarManagerObserver();

  let readOnly = false;
  let calendarObserver = cal.createAdapter(Ci.calIObserver, {
    onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
      equal(aCalendar.id, memory.id);
      equal(aName, "readOnly");
      readOnly = aValue;
    },
  });

  memory.addObserver(calendarObserver);
  calmgr.addObserver(calmgrObserver);

  // Register the calendar and check if its counted and observed.
  calmgr.registerCalendar(memory);
  calmgrObserver.check({ registered: memory.id });
  checkCalendarCount(0, 0, 1);

  // The calendar should now have an id.
  notEqual(memory.id, null);

  // And be in the list of calendars.
  equal(memory, calmgr.getCalendarById(memory.id));
  ok(calmgr.getCalendars().some(x => x.id == memory.id));

  // Make it readonly and check if the observer caught it.
  memory.setProperty("readOnly", true);
  equal(readOnly, true);

  // Now unregister it.
  calmgr.unregisterCalendar(memory);
  calmgrObserver.check({ unregistering: memory.id });
  checkCalendarCount(0, 0, 0);

  // The calendar shouldn't be in the list of ids.
  equal(calmgr.getCalendarById(memory.id), null);
  ok(calmgr.getCalendars().every(x => x.id != memory.id));

  // And finally delete it.
  calmgr.removeCalendar(memory, Ci.calICalendarManager.REMOVE_NO_UNREGISTER);
  calmgrObserver.check({ deleting: memory.id });
  checkCalendarCount(0, 0, 0);

  // Now remove the observer again.
  calmgr.removeObserver(calmgrObserver);
  memory.removeObserver(calendarObserver);

  // Check if removing it actually worked.
  calmgr.registerCalendar(memory);
  calmgr.removeCalendar(memory);
  memory.setProperty("readOnly", false);
  calmgrObserver.check({});
  equal(readOnly, true);
  checkCalendarCount(0, 0, 0);

  // We are done now, start the next test.
  run_next_test();
});

add_task(async function test_dynamic_registration() {
  class CalendarProvider extends cal.provider.BaseClass {
    QueryInterface = ChromeUtils.generateQI(["calICalendar"]);
    type = "blm";

    constructor() {
      super();
      this.initProviderBase();
    }

    getItems(itemFilter, count, rangeStart, rangeEnd, listener) {
      this.notifyOperationComplete(listener, Cr.NS_OK, Ci.calIOperationListener.GET, null, null);
    }
  }

  function checkCalendar(expectedCount = 1) {
    let calendars = calmgr.getCalendars();
    equal(calendars.length, expectedCount);
    let calendar = calendars[0];

    if (expectedCount > 0) {
      notEqual(calendar, null);
    }
    return calendar;
  }

  let calmgr = cal.getCalendarManager();
  let calmgrObserver = new CalendarManagerObserver();
  calmgr.addObserver(calmgrObserver);
  equal(calmgr.calendarCount, 0);

  // No provider registered.
  let calendar = calmgr.createCalendar("blm", Services.io.newURI("black-lives-matter://"));
  equal(calendar, null);
  ok(!calmgr.hasCalendarProvider("blm"));

  // Register dynamic provider.
  calmgr.registerCalendarProvider("blm", CalendarProvider);
  calendar = calmgr.createCalendar("blm", Services.io.newURI("black-lives-matter://"));
  notEqual(calendar, null);
  ok(calendar.wrappedJSObject instanceof CalendarProvider);
  ok(calmgr.hasCalendarProvider("blm"));

  // Register a calendar using it.
  calmgr.registerCalendar(calendar);
  calendar = checkCalendar();

  let originalId = calendar.id;
  calmgrObserver.check({ registered: originalId });

  // Unregister the provider from under its feet.
  calmgr.unregisterCalendarProvider("blm");
  calendar = checkCalendar();
  calmgrObserver.check({ unregistering: originalId, registered: originalId });

  equal(calendar.type, "blm");
  equal(calendar.getProperty("force-disabled"), true);
  equal(calendar.id, originalId);

  // Re-register the provider should reactive it.
  calmgr.registerCalendarProvider("blm", CalendarProvider);
  calendar = checkCalendar();
  calmgrObserver.check({ unregistering: originalId, registered: originalId });

  equal(calendar.type, "blm");
  notEqual(calendar.getProperty("force-disabled"), true);
  equal(calendar.id, originalId);

  // Make sure calendar is loaded from prefs.
  calmgr.unregisterCalendarProvider("blm");
  calmgrObserver.check({ unregistering: originalId, registered: originalId });

  await new Promise(resolve => calmgr.shutdown({ onResult: resolve }));
  calmgr.wrappedJSObject.mCache = null;
  await new Promise(resolve => calmgr.startup({ onResult: resolve }));
  calmgrObserver.check({});

  calendar = checkCalendar();
  equal(calendar.type, "blm");
  equal(calendar.getProperty("force-disabled"), true);
  equal(calendar.id, originalId);

  // Unregister the calendar for cleanup.
  calmgr.unregisterCalendar(calendar);
  checkCalendar(0);
  calmgrObserver.check({ unregistering: originalId });
});

add_test(function test_calobserver() {
  function checkCounters(add, modify, del, alladd, allmodify, alldel) {
    equal(calcounter.addItem, add);
    equal(calcounter.modifyItem, modify);
    equal(calcounter.deleteItem, del);
    equal(allcounter.addItem, alladd === undefined ? add : alladd);
    equal(allcounter.modifyItem, allmodify === undefined ? modify : allmodify);
    equal(allcounter.deleteItem, alldel === undefined ? del : alldel);
    resetCounters();
  }
  function resetCounters() {
    calcounter = { addItem: 0, modifyItem: 0, deleteItem: 0 };
    allcounter = { addItem: 0, modifyItem: 0, deleteItem: 0 };
  }

  // First of all we need a local calendar to work on and some variables
  let calmgr = cal.getCalendarManager();
  let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  let memory2 = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  let calcounter, allcounter;

  // These observers will end up counting calls which we will use later on
  let calobs = cal.createAdapter(Ci.calIObserver, {
    onAddItem: () => calcounter.addItem++,
    onModifyItem: () => calcounter.modifyItem++,
    onDeleteItem: () => calcounter.deleteItem++,
  });
  let allobs = cal.createAdapter(Ci.calIObserver, {
    onAddItem: () => allcounter.addItem++,
    onModifyItem: () => allcounter.modifyItem++,
    onDeleteItem: () => allcounter.deleteItem++,
  });

  // Set up counters and observers
  resetCounters();
  calmgr.registerCalendar(memory);
  calmgr.registerCalendar(memory2);
  calmgr.addCalendarObserver(allobs);
  memory.addObserver(calobs);

  // Add an item
  let item = new CalEvent();
  item.id = cal.getUUID();
  item.startDate = cal.dtz.now();
  item.endDate = cal.dtz.now();
  memory.addItem(item, null);
  checkCounters(1, 0, 0);

  // Modify the item
  let newItem = item.clone();
  newItem.title = "title";
  memory.modifyItem(newItem, item, null);
  checkCounters(0, 1, 0);

  // Delete the item
  newItem.generation++; // circumvent generation checks for easier code
  memory.deleteItem(newItem, null);
  checkCounters(0, 0, 1);

  // Now check the same for adding the item to a calendar only observed by the
  // calendar manager. The calcounters should still be 0, but the calendar
  // manager counter should have an item added, modified and deleted
  memory2.addItem(item, null);
  memory2.modifyItem(newItem, item, null);
  memory2.deleteItem(newItem, null);
  checkCounters(0, 0, 0, 1, 1, 1);

  // Remove observers
  memory.removeObserver(calobs);
  calmgr.removeCalendarObserver(allobs);

  // Make sure removing it actually worked
  memory.addItem(item, null);
  memory.modifyItem(newItem, item, null);
  memory.deleteItem(newItem, null);
  checkCounters(0, 0, 0);

  // We are done now, start the next test
  run_next_test();
});

add_test(function test_removeModes() {
  function checkCounts(modes, shouldDelete, expectCount, extraFlags = 0) {
    if (calmgr.calendarCount == baseCalendarCount) {
      calmgr.registerCalendar(memory);
      equal(calmgr.calendarCount, baseCalendarCount + 1);
    }
    deleteCalled = false;
    removeModes = modes;

    calmgr.removeCalendar(memory, extraFlags);
    equal(calmgr.calendarCount, baseCalendarCount + expectCount);
    equal(deleteCalled, shouldDelete);
  }
  function mockCalendar(memory) {
    let oldGetProperty = memory.wrappedJSObject.getProperty;
    memory.wrappedJSObject.getProperty = function(name) {
      if (name == "capabilities.removeModes") {
        return removeModes;
      }
      return oldGetProperty.apply(this, arguments);
    };

    let oldDeleteCalendar = memory.wrappedJSObject.deleteCalendar;
    memory.wrappedJSObject.deleteCalendar = function(calendar, listener) {
      deleteCalled = true;
      return oldDeleteCalendar.apply(this, arguments);
    };
  }

  // For better readability
  const SHOULD_DELETE = true,
    SHOULD_NOT_DELETE = false;

  let calmgr = cal.getCalendarManager();
  let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  let baseCalendarCount = calmgr.calendarCount;
  let removeModes = null;
  let deleteCalled = false;

  mockCalendar(memory);

  checkCounts([], SHOULD_NOT_DELETE, 1);
  checkCounts(["unsubscribe"], SHOULD_NOT_DELETE, 0);
  checkCounts(["unsubscribe", "delete"], SHOULD_DELETE, 0);
  checkCounts(
    ["unsubscribe", "delete"],
    SHOULD_NOT_DELETE,
    0,
    Ci.calICalendarManager.REMOVE_NO_DELETE
  );
  checkCounts(["delete"], SHOULD_DELETE, 0);

  run_next_test();
});

add_test(function test_calprefs() {
  let prop;
  let calmgr = cal.getCalendarManager();
  let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  calmgr.registerCalendar(memory);
  let memid = memory.id;

  // First set a few values, one of each relevant type
  memory.setProperty("stringpref", "abc");
  memory.setProperty("boolpref", true);
  memory.setProperty("intpref", 123);
  memory.setProperty("bigintpref", 1394548721296);
  memory.setProperty("floatpref", 0.5);

  // Before checking the value, reinitialize the memory calendar with the
  // same id to make sure the pref value isn't just cached
  memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = memid;

  // First test the standard types
  prop = memory.getProperty("stringpref");
  equal(typeof prop, "string");
  equal(prop, "abc");

  prop = memory.getProperty("boolpref");
  equal(typeof prop, "boolean");
  equal(prop, true);

  prop = memory.getProperty("intpref");
  equal(typeof prop, "number");
  equal(prop, 123);

  // These two are a special case test for bug 979262
  prop = memory.getProperty("bigintpref");
  equal(typeof prop, "number");
  equal(prop, 1394548721296);

  prop = memory.getProperty("floatpref");
  equal(typeof prop, "number");
  equal(prop, 0.5);

  // Check if changing pref types works. We need to reset the calendar again
  // because retrieving the value just cached it again.
  memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = memid;

  calmgr.setCalendarPref_(memory, "boolpref", "kinda true");
  prop = memory.getProperty("boolpref");
  equal(typeof prop, "string");
  equal(prop, "kinda true");

  // Check if unsetting a pref works
  memory.setProperty("intpref", null);
  memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = memid;
  prop = memory.getProperty("intpref");
  ok(prop === null);

  // We are done now, start the next test
  run_next_test();
});
