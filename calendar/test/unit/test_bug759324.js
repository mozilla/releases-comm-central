/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const storage = getStorageCal();

/**
 * Checks if the capabilities.propagate-sequence feature of the storage calendar
 * still works
 */
add_task(async function testBug759324() {
  storage.setProperty("capabilities.propagate-sequence", "true");

  const str = [
    "BEGIN:VEVENT",
    "UID:recItem",
    "SEQUENCE:3",
    "RRULE:FREQ=WEEKLY",
    "DTSTART:20120101T010101Z",
    "END:VEVENT",
  ].join("\r\n");

  const item = createEventFromIcalString(str);
  const rid = cal.createDateTime("20120101T010101Z");
  const rec = item.recurrenceInfo.getOccurrenceFor(rid);
  rec.title = "changed";
  item.recurrenceInfo.modifyException(rec, true);

  do_test_pending();

  const addedItem = await storage.addItem(item);
  addedItem.QueryInterface(Ci.calIEvent);
  const seq = addedItem.getProperty("SEQUENCE");
  const occ = addedItem.recurrenceInfo.getOccurrenceFor(rid);

  equal(seq, 3);
  equal(occ.getProperty("SEQUENCE"), seq);

  const changedItem = addedItem.clone();
  changedItem.setProperty("SEQUENCE", parseInt(seq, 10) + 1);

  checkModifiedItem(rid, await storage.modifyItem(changedItem, addedItem));
});

async function checkModifiedItem(rid, changedItem) {
  changedItem.QueryInterface(Ci.calIEvent);
  const seq = changedItem.getProperty("SEQUENCE");
  const occ = changedItem.recurrenceInfo.getOccurrenceFor(rid);

  equal(seq, 4);
  equal(occ.getProperty("SEQUENCE"), seq);

  // Now check with the pref off
  storage.deleteProperty("capabilities.propagate-sequence");

  const changedItem2 = changedItem.clone();
  changedItem2.setProperty("SEQUENCE", parseInt(seq, 10) + 1);

  checkNormalItem(rid, await storage.modifyItem(changedItem2, changedItem));
}

function checkNormalItem(rid, changedItem) {
  changedItem.QueryInterface(Ci.calIEvent);
  const seq = changedItem.getProperty("SEQUENCE");
  const occ = changedItem.recurrenceInfo.getOccurrenceFor(rid);

  equal(seq, 5);
  equal(occ.getProperty("SEQUENCE"), 4);
  completeTest();
}

function completeTest() {
  do_test_finished();
}
