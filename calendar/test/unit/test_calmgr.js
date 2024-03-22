/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalReadableStreamFactory } = ChromeUtils.importESModule(
  "resource:///modules/CalReadableStreamFactory.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
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
    equal(cal.manager.networkCalendarCount, net);
    equal(cal.manager.readOnlyCalendarCount, rdonly);
    equal(cal.manager.calendarCount, all);
  }

  // Initially there should be no calendars.
  checkCalendarCount(0, 0, 0);

  // Create a local memory calendar, this shouldn't register any calendars.
  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  checkCalendarCount(0, 0, 0);

  // Register an observer to test it.
  const calmgrObserver = new CalendarManagerObserver();

  let readOnly = false;
  const calendarObserver = cal.createAdapter(Ci.calIObserver, {
    onPropertyChanged(aCalendar, aName, aValue) {
      equal(aCalendar.id, memory.id);
      equal(aName, "readOnly");
      readOnly = aValue;
    },
  });

  memory.addObserver(calendarObserver);
  cal.manager.addObserver(calmgrObserver);

  // Register the calendar and check if its counted and observed.
  cal.manager.registerCalendar(memory);
  calmgrObserver.check({ registered: memory.id });
  checkCalendarCount(0, 0, 1);

  // The calendar should now have an id.
  notEqual(memory.id, null);

  // And be in the list of calendars.
  equal(memory, cal.manager.getCalendarById(memory.id));
  ok(cal.manager.getCalendars().some(x => x.id == memory.id));

  // Make it readonly and check if the observer caught it.
  memory.setProperty("readOnly", true);
  equal(readOnly, true);

  // Now unregister it.
  cal.manager.unregisterCalendar(memory);
  calmgrObserver.check({ unregistering: memory.id });
  checkCalendarCount(0, 0, 0);

  // The calendar shouldn't be in the list of ids.
  equal(cal.manager.getCalendarById(memory.id), null);
  ok(cal.manager.getCalendars().every(x => x.id != memory.id));

  // And finally delete it.
  cal.manager.removeCalendar(memory, Ci.calICalendarManager.REMOVE_NO_UNREGISTER);
  calmgrObserver.check({ deleting: memory.id });
  checkCalendarCount(0, 0, 0);

  // Now remove the observer again.
  cal.manager.removeObserver(calmgrObserver);
  memory.removeObserver(calendarObserver);

  // Check if removing it actually worked.
  cal.manager.registerCalendar(memory);
  cal.manager.removeCalendar(memory);
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

    getItems() {
      return CalReadableStreamFactory.createEmptyReadableStream();
    }
  }

  function checkCalendar(expectedCount = 1) {
    const calendars = cal.manager.getCalendars();
    equal(calendars.length, expectedCount);
    const calendar = calendars[0];

    if (expectedCount > 0) {
      notEqual(calendar, null);
    }
    return calendar;
  }

  const calmgrObserver = new CalendarManagerObserver();
  cal.manager.addObserver(calmgrObserver);
  equal(cal.manager.calendarCount, 0);

  // No provider registered.
  let calendar = cal.manager.createCalendar("blm", Services.io.newURI("black-lives-matter://"));
  equal(calendar, null);
  ok(!cal.manager.hasCalendarProvider("blm"));

  // Register dynamic provider.
  cal.manager.registerCalendarProvider("blm", CalendarProvider);
  calendar = cal.manager.createCalendar("blm", Services.io.newURI("black-lives-matter://"));
  notEqual(calendar, null);
  ok(calendar.wrappedJSObject instanceof CalendarProvider);
  ok(cal.manager.hasCalendarProvider("blm"));

  // Register a calendar using it.
  cal.manager.registerCalendar(calendar);
  calendar = checkCalendar();

  const originalId = calendar.id;
  calmgrObserver.check({ registered: originalId });

  // Unregister the provider from under its feet.
  cal.manager.unregisterCalendarProvider("blm");
  calendar = checkCalendar();
  calmgrObserver.check({ unregistering: originalId, registered: originalId });

  equal(calendar.type, "blm");
  equal(calendar.getProperty("force-disabled"), true);
  equal(calendar.id, originalId);

  // Re-register the provider should reactive it.
  cal.manager.registerCalendarProvider("blm", CalendarProvider);
  calendar = checkCalendar();
  calmgrObserver.check({ unregistering: originalId, registered: originalId });

  equal(calendar.type, "blm");
  notEqual(calendar.getProperty("force-disabled"), true);
  equal(calendar.id, originalId);

  // Make sure calendar is loaded from prefs.
  cal.manager.unregisterCalendarProvider("blm");
  calmgrObserver.check({ unregistering: originalId, registered: originalId });

  await new Promise(resolve => cal.manager.shutdown({ onResult: resolve }));
  cal.manager.wrappedJSObject.mCache = null;
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));
  calmgrObserver.check({});

  calendar = checkCalendar();
  equal(calendar.type, "blm");
  equal(calendar.getProperty("force-disabled"), true);
  equal(calendar.id, originalId);

  // Unregister the calendar for cleanup.
  cal.manager.unregisterCalendar(calendar);
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
  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  const memory2 = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  let calcounter, allcounter;

  // These observers will end up counting calls which we will use later on
  const calobs = cal.createAdapter(Ci.calIObserver, {
    onAddItem: () => calcounter.addItem++,
    onModifyItem: () => calcounter.modifyItem++,
    onDeleteItem: () => calcounter.deleteItem++,
  });
  const allobs = cal.createAdapter(Ci.calIObserver, {
    onAddItem: () => allcounter.addItem++,
    onModifyItem: () => allcounter.modifyItem++,
    onDeleteItem: () => allcounter.deleteItem++,
  });

  // Set up counters and observers
  resetCounters();
  cal.manager.registerCalendar(memory);
  cal.manager.registerCalendar(memory2);
  cal.manager.addCalendarObserver(allobs);
  memory.addObserver(calobs);

  // Add an item
  const item = new CalEvent();
  item.id = cal.getUUID();
  item.startDate = cal.dtz.now();
  item.endDate = cal.dtz.now();
  memory.addItem(item);
  checkCounters(1, 0, 0);

  // Modify the item
  const newItem = item.clone();
  newItem.title = "title";
  memory.modifyItem(newItem, item);
  checkCounters(0, 1, 0);

  // Delete the item
  newItem.generation++; // circumvent generation checks for easier code
  memory.deleteItem(newItem);
  checkCounters(0, 0, 1);

  // Now check the same for adding the item to a calendar only observed by the
  // calendar manager. The calcounters should still be 0, but the calendar
  // manager counter should have an item added, modified and deleted
  memory2.addItem(item);
  memory2.modifyItem(newItem, item);
  memory2.deleteItem(newItem);
  checkCounters(0, 0, 0, 1, 1, 1);

  // Remove observers
  memory.removeObserver(calobs);
  cal.manager.removeCalendarObserver(allobs);

  // Make sure removing it actually worked
  memory.addItem(item);
  memory.modifyItem(newItem, item);
  memory.deleteItem(newItem);
  checkCounters(0, 0, 0);

  // We are done now, start the next test
  run_next_test();
});

add_test(function test_removeModes() {
  function checkCounts(modes, shouldDelete, expectCount, extraFlags = 0) {
    if (cal.manager.calendarCount == baseCalendarCount) {
      cal.manager.registerCalendar(memory);
      equal(cal.manager.calendarCount, baseCalendarCount + 1);
    }
    deleteCalled = false;
    removeModes = modes;

    cal.manager.removeCalendar(memory, extraFlags);
    equal(cal.manager.calendarCount, baseCalendarCount + expectCount);
    equal(deleteCalled, shouldDelete);
  }
  function mockCalendar(memory) {
    const oldGetProperty = memory.wrappedJSObject.getProperty;
    memory.wrappedJSObject.getProperty = function (name) {
      if (name == "capabilities.removeModes") {
        return removeModes;
      }
      return oldGetProperty.apply(this, arguments);
    };

    const oldDeleteCalendar = memory.wrappedJSObject.deleteCalendar;
    memory.wrappedJSObject.deleteCalendar = function () {
      deleteCalled = true;
      return oldDeleteCalendar.apply(this, arguments);
    };
  }

  // For better readability
  const SHOULD_DELETE = true,
    SHOULD_NOT_DELETE = false;

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  const baseCalendarCount = cal.manager.calendarCount;
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
  let memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  cal.manager.registerCalendar(memory);
  const memid = memory.id;

  // First set a few values, one of each relevant type
  memory.setProperty("stringpref", "abc");
  memory.setProperty("boolpref", true);
  memory.setProperty("intpref", 123);
  memory.setProperty("bigintpref", 1394548721296);
  memory.setProperty("floatpref", 0.5);

  // Before checking the value, reinitialize the memory calendar with the
  // same id to make sure the pref value isn't just cached
  memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
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
  memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = memid;

  cal.manager.setCalendarPref_(memory, "boolpref", "kinda true");
  prop = memory.getProperty("boolpref");
  equal(typeof prop, "string");
  equal(prop, "kinda true");

  // Check if unsetting a pref works
  memory.setProperty("intpref", null);
  memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = memid;
  prop = memory.getProperty("intpref");
  Assert.strictEqual(prop, null);

  // We are done now, start the next test
  run_next_test();
});
