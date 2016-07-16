/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Checks if the capabilities.propagate-sequence feature of the storage calendar
 * still works
 */
function run_test() {
    let storage = getStorageCal();

    storage.setProperty("capabilities.propagate-sequence", "true");

    let str = ["BEGIN:VEVENT",
               "UID:recItem",
               "SEQUENCE:3",
               "RRULE:FREQ=WEEKLY",
               "DTSTART:20120101T010101Z",
               "END:VEVENT"].join("\r\n");

    let item = createEventFromIcalString(str);
    let rid = cal.createDateTime("20120101T010101Z");
    let rec = item.recurrenceInfo.getOccurrenceFor(rid);
    rec.title = "changed";
    item.recurrenceInfo.modifyException(rec, true);

    do_test_pending();
    storage.addItem(item, { onOperationComplete: checkAddedItem });

    function checkAddedItem(calendar, status, opType, id, addedItem) {
        let seq = addedItem.getProperty("SEQUENCE");
        let occ = addedItem.recurrenceInfo.getOccurrenceFor(rid);

        equal(seq, 3);
        equal(occ.getProperty("SEQUENCE"), seq);

        let changedItem = addedItem.clone();
        changedItem.setProperty("SEQUENCE", parseInt(seq, 10) + 1);

        storage.modifyItem(changedItem, addedItem, { onOperationComplete: checkModifiedItem });
    }

    function checkModifiedItem(calendar, status, opType, id, changedItem) {
        let seq = changedItem.getProperty("SEQUENCE");
        let occ = changedItem.recurrenceInfo.getOccurrenceFor(rid);

        equal(seq, 4);
        equal(occ.getProperty("SEQUENCE"), seq);

        // Now check with the pref off
        storage.deleteProperty("capabilities.propagate-sequence");

        let changedItem2 = changedItem.clone();
        changedItem2.setProperty("SEQUENCE", parseInt(seq, 10) + 1);

        storage.modifyItem(changedItem2, changedItem, { onOperationComplete: checkNormalItem });
    }

    function checkNormalItem(calendar, status, opType, id, changedItem) {
        let seq = changedItem.getProperty("SEQUENCE");
        let occ = changedItem.recurrenceInfo.getOccurrenceFor(rid);

        equal(seq, 5);
        equal(occ.getProperty("SEQUENCE"), 4);
        completeTest();
    }

    function completeTest() {
        do_test_finished();
    }
}
