/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

/**
 * Tests the calICalendarManager interface
 */
function run_test() {
    do_get_profile();
    // Initialize the floating timezone without actually starting the service.
    cal.getTimezoneService().floating;
    add_test(test_registration);
    add_test(test_calobserver);
    add_test(test_calprefs);
    add_test(test_removeModes);
    cal.getCalendarManager().startup({ onResult: function() {
        run_next_test();
    }});
}

function test_calobserver() {
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
    let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    let memory2 = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    let calcounter, allcounter;

    // These observers will end up counting calls which we will use later on
    let calobs = cal.createAdapter(Components.interfaces.calIObserver, {
        onAddItem: itm => calcounter.addItem++,
        onModifyItem: itm => calcounter.modifyItem++,
        onDeleteItem: itm => calcounter.deleteItem++
    });
    let allobs = cal.createAdapter(Components.interfaces.calIObserver, {
        onAddItem: itm => allcounter.addItem++,
        onModifyItem: itm => allcounter.modifyItem++,
        onDeleteItem: itm => allcounter.deleteItem++
    });

    // Set up counters and observers
    resetCounters();
    calmgr.registerCalendar(memory);
    calmgr.registerCalendar(memory2);
    calmgr.addCalendarObserver(allobs);
    memory.addObserver(calobs);

    // Add an item
    let item = cal.createEvent();
    item.id = cal.getUUID()
    item.startDate = cal.now();
    item.endDate = cal.now();
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
}

function test_registration() {
    function checkCalendarCount(net, rdonly, all) {
        equal(calmgr.networkCalendarCount, net);
        equal(calmgr.readOnlyCalendarCount , rdonly);
        equal(calmgr.calendarCount, all);
    }
    function checkRegistration(reg, unreg, del) {
        equal(registered, reg);
        equal(unregistered, unreg);
        equal(deleted, del);
        registered = false;
        unregistered = false;
        deleted = false;
    }

    // Initially there should be no calendars
    let calmgr = cal.getCalendarManager();
    checkCalendarCount(0, 0, 0);

    // Create a local memory calendar, ths shouldn't register any calendars
    let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    checkCalendarCount(0, 0, 0);

    // Register an observer to test it.
    let registered = false, unregistered = false, deleted = false, readOnly = false;
    let mgrobs = cal.createAdapter(Components.interfaces.calICalendarManagerObserver, {
        onCalendarRegistered: function onCalendarRegistered(aCalendar) {
            if (aCalendar.id == memory.id) registered = true;
        },
        onCalendarUnregistering: function onCalendarUnregistering(aCalendar) {
            if (aCalendar.id == memory.id) unregistered = true;
        },
        onCalendarDeleting: function onCalendarDeleting(aCalendar) {
            if (aCalendar.id == memory.id) deleted = true;
        }
    });
    let calobs = cal.createAdapter(Components.interfaces.calIObserver, {
        onPropertyChanged: function onPropertyChanging(aCalendar, aName, aValue, aOldValue) {
            equal(aCalendar.id, memory.id);
            equal(aName, "readOnly");
            readOnly = aValue;
        }
    });
    memory.addObserver(calobs);
    calmgr.addObserver(mgrobs);

    // Register the calendar and check if its counted and observed
    calmgr.registerCalendar(memory);
    checkRegistration(true, false, false);
    checkCalendarCount(0, 0, 1);

    // The calendar should now have an id
    notEqual(memory.id, null);

    // And be in the list of calendars
    equal(memory, calmgr.getCalendarById(memory.id));
    ok(calmgr.getCalendars({}).some(x => x.id == memory.id));

    // Make it readonly and check if the observer caught it
    memory.setProperty("readOnly", true);
    equal(readOnly, true);

    // Now unregister it
    calmgr.unregisterCalendar(memory);
    checkRegistration(false, true, false);
    checkCalendarCount(0, 0, 0);

    // The calendar shouldn't be in the list of ids
    equal(calmgr.getCalendarById(memory.id), null);
    ok(calmgr.getCalendars({}).every(x => x.id != memory.id));

    // And finally delete it
    calmgr.removeCalendar(memory, Ci.calICalendarManager.REMOVE_NO_UNREGISTER);
    checkRegistration(false, false, true);
    checkCalendarCount(0, 0, 0);

    // Now remove the observer again
    calmgr.removeObserver(mgrobs);
    memory.removeObserver(calobs);

    // Check if removing it actually worked
    calmgr.registerCalendar(memory);
    calmgr.removeCalendar(memory);
    memory.setProperty("readOnly", false);
    checkRegistration(false, false, false);
    equal(readOnly, true);
    checkCalendarCount(0, 0, 0);

    // We are done now, start the next test
    run_next_test();
}

function test_removeModes() {
    function checkCounts(modes, shouldDelete, expectCount, extraFlags=0) {
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
            } else {
                return oldGetProperty.apply(this, arguments);
            }
        };

        let oldDeleteCalendar = memory.wrappedJSObject.deleteCalendar;
        memory.wrappedJSObject.deleteCalendar = function(calendar, listener) {
            deleteCalled = true;
            return oldDeleteCalendar.apply(this, arguments);
        };
    }

    // For better readability
    const SHOULD_DELETE = true, SHOULD_NOT_DELETE = false;
    const cICM = Components.interfaces.calICalendarManager;

    let calmgr = cal.getCalendarManager();
    let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    let baseCalendarCount = calmgr.calendarCount;
    let removeModes = null;
    let deleteCalled = false;

    mockCalendar(memory);

    checkCounts([], SHOULD_NOT_DELETE, 1);
    checkCounts(["unsubscribe"], SHOULD_NOT_DELETE, 0);
    checkCounts(["unsubscribe", "delete"], SHOULD_DELETE, 0);
    checkCounts(["unsubscribe", "delete"], SHOULD_NOT_DELETE, 0, cICM.REMOVE_NO_DELETE);
    checkCounts(["delete"], SHOULD_DELETE, 0);

    run_next_test();
}

function test_calprefs() {
    let prop;
    let calmgr = cal.getCalendarManager();
    let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
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
    memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    memory.id = memid;

    // First test the standard types
    prop = memory.getProperty("stringpref");
    equal(typeof prop, "string");
    equal(prop, "abc")

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
    memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    memory.id = memid;

    calmgr.setCalendarPref_(memory, "boolpref", "kinda true");
    prop = memory.getProperty("boolpref");
    equal(typeof prop, "string");
    equal(prop, "kinda true")

    // Check if unsetting a pref works
    memory.setProperty("intpref", null);
    memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://", null, null));
    memory.id = memid;
    prop = memory.getProperty("intpref");
    ok(prop === null);


    // We are done now, start the next test
    run_next_test();
}
