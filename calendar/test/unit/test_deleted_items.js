/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Promise.jsm");

function run_test() {
    do_get_profile();
    // Initialize the floating timezone without actually starting the service.
    cal.getTimezoneService().floating;
    let delmgr = Components.classes["@mozilla.org/calendar/deleted-items-manager;1"]
                           .getService(Components.interfaces.calIDeletedItems);
    delmgr.observe(null, "profile-after-change", null);

    cal.getCalendarManager().startup({ onResult: function() {
        run_next_test();
    }});
}

function check_delmgr_call(aFunc) {
    const mISSC = Components.interfaces.mozIStorageStatementCallback;
    let delmgr = Components.classes["@mozilla.org/calendar/deleted-items-manager;1"]
                           .getService(Components.interfaces.calIDeletedItems);
    return new Promise(function(resolve, reject) {
        delmgr.wrappedJSObject.completedNotifier.handleCompletion = (aReason) => {
            if (aReason == mISSC.REASON_FINISHED) {
                resolve();
            } else {
                reject(aReason);
            };
        };
        aFunc();
    });
}

add_task(function test_deleted_items() {
    let calmgr = cal.getCalendarManager();
    let delmgr = Components.classes["@mozilla.org/calendar/deleted-items-manager;1"]
                           .getService(Components.interfaces.calIDeletedItems);
    // No items have been deleted, retrieving one should return null.
    equal(delmgr.getDeletedDate("random"), null);
    equal(delmgr.getDeletedDate("random", "random"), null);

    // Make sure the cache is initially flushed and that this doesn't throw an
    // error.
    yield check_delmgr_call(() => delmgr.flush());

    let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-storage-calendar://", null, null));
    calmgr.registerCalendar(memory);

    let item = cal.createEvent();
    item.id = "test-item-1";
    item.startDate = cal.now();
    item.endDate = cal.now();

    // Add the item, it still shouldn't be in the deleted database.
    yield check_delmgr_call(() => memory.addItem(item, null));
    equal(delmgr.getDeletedDate(item.id), null);
    equal(delmgr.getDeletedDate(item.id, memory.id), null);

    // We need to stop time so we have something to compare with.
    let referenceDate = cal.createDateTime("20120726T112045"); referenceDate.timezone = cal.calendarDefaultTimezone();
    let futureDate = cal.createDateTime("20380101T000000");  futureDate.timezone = cal.calendarDefaultTimezone();
    let useFutureDate = false;
    let oldNowFunction = cal.now;
    cal.now = function test_specific_now() {
        return (useFutureDate ? futureDate : referenceDate).clone();
    }

    // Deleting an item should trigger it being marked for deletion.
    yield check_delmgr_call(() => memory.deleteItem(item, null));

    // Now check if it was deleted at our reference date.
    let deltime = delmgr.getDeletedDate(item.id);
    notEqual(deltime, null);
    equal(deltime.compare(referenceDate), 0);

    // The same with the calendar.
    deltime = delmgr.getDeletedDate(item.id, memory.id);
    notEqual(deltime, null);
    equal(deltime.compare(referenceDate), 0);

    // Item should not be found in other calendars.
    equal(delmgr.getDeletedDate(item.id, "random"), null);

    // Check if flushing works, we need to travel time for that.
    useFutureDate = true;
    yield check_delmgr_call(() => delmgr.flush());
    equal(delmgr.getDeletedDate(item.id), null);
    equal(delmgr.getDeletedDate(item.id, memory.id), null);

    // Start over with our past time.
    useFutureDate = false;

    // Add, delete, add. Item should no longer be deleted.
    yield check_delmgr_call(() => memory.addItem(item, null));
    equal(delmgr.getDeletedDate(item.id), null);
    yield check_delmgr_call(() => memory.deleteItem(item, null));
    equal(delmgr.getDeletedDate(item.id).compare(referenceDate), 0);
    yield check_delmgr_call(() => memory.addItem(item, null));
    equal(delmgr.getDeletedDate(item.id), null);

    // Revert now function, in case more tests are written.
    cal.now = oldNowFunction;
});
