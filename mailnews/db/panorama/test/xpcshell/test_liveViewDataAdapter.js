/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This is a series of tests to prove that LiveViewDataAdapter has correctly
 * cached messages from the LiveView. We create a list of the message IDs in
 * the adapter's cache (in `listStorage`) and compare it to a known list of
 * IDs. Empty slots in the cache are `undefined` in the list of expected IDs
 * (usually expanded from a new Array to avoid writing out `undefined` many
 * times over).
 *
 * The messages are from data/messages.sql. There are 10 initially.
 */

const { LiveViewDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/LiveViewDataAdapter.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

add_setup(async function () {
  await installDBFromFile("db/messages.sql");
});

/**
 * Test that we have the right values to display on the screen.
 */
add_task(function testColumnContents() {
  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);

  try {
    const row2 = adapter._rowMap.at(2);
    Assert.equal(row2.message.id, 8, "message 8 should be at row 2");
    // We're not going to get into the intricacies of date/time formatting yet.
    // Just check the value is right for sorting.
    Assert.equal(row2.getValue("date"), 1691301720000);
    Assert.equal(row2.getText("sender"), "Edgar Stokes <edgar@stokes.invalid>");
    Assert.equal(row2.getText("subject"), "Balanced static project");
    Assert.equal(row2.getText("flags"), "0");
    Assert.equal(row2.getText("unread"), "1");
    Assert.equal(row2.getText("flagged"), "0");
    Assert.equal(row2.getText("tags"), "$label1");

    const row6 = adapter._rowMap.at(6);
    Assert.equal(row6.message.id, 4, "message 4 should be at row 6");
    Assert.equal(row6.getValue("date"), 1572784496000);
    Assert.equal(row6.getText("sender"), "Eliseo Bauch <eliseo@bauch.invalid>");
    Assert.equal(
      row6.getText("subject"),
      "Proactive intermediate collaboration"
    );
    Assert.equal(row6.getText("flags"), "5");
    Assert.equal(row6.getText("unread"), "0");
    Assert.equal(row6.getText("flagged"), "1");
    Assert.equal(row6.getText("tags"), "");
  } finally {
    adapter.setTree(null);
  }
});

const tree = {
  rowCountChanged(index, delta) {
    this._index = index;
    this._delta = delta;
  },
};

/**
 * Test filling a LiveViewDataAdapter's cache by requesting the messages from
 * the top downwards.
 *
 * @param {string} sortColumn - The column the adapter should be sorting in.
 * @param {string} sortDirection - The direction the adapter should be sorting in.
 * @param {integer[]} idsInOrder - The expected message IDs.
 */
function subtestFillFromTop(sortColumn, sortDirection, idsInOrder) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 4);

  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.deepEqual(
      listStorage(adapter),
      [...new Array(10)],
      "row map should have no messages stored initially"
    );

    Assert.equal(adapter._rowMap.at(0).message.id, idsInOrder[0]);
    Assert.deepEqual(
      listStorage(adapter),
      [...idsInOrder.slice(0, 5), ...new Array(5)],
      "row map should have filled the first five rows"
    );

    Assert.equal(adapter._rowMap.at(5).message.id, idsInOrder[5]);
    Assert.deepEqual(
      listStorage(adapter),
      idsInOrder,
      "row map should have filled the first row"
    );
  } finally {
    adapter.setTree(null);
  }
}

/**
 * Test filling a LiveViewDataAdapter's cache by requesting the messages from
 * the bottom upwards.
 *
 * @param {string} sortColumn - The column the adapter should be sorting in.
 * @param {string} sortDirection - The direction the adapter should be sorting in.
 * @param {integer[]} idsInOrder - The expected message IDs.
 */
function subtestFillFromBottom(sortColumn, sortDirection, idsInOrder) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 4);

  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.deepEqual(
      listStorage(adapter),
      [...new Array(10)],
      "row map should have no messages stored initially"
    );

    Assert.equal(adapter._rowMap.at(9).message.id, idsInOrder[9]);
    Assert.deepEqual(
      listStorage(adapter),
      [...new Array(5), ...idsInOrder.slice(5, 10)],
      "row map should have filled the last five rows"
    );

    Assert.equal(adapter._rowMap.at(0).message.id, idsInOrder[0]);
    Assert.deepEqual(
      listStorage(adapter),
      idsInOrder,
      "row map should have filled the first five rows"
    );
  } finally {
    adapter.setTree(null);
  }
}

/**
 * Tests additions to the cache of a LiveViewDataAdapter
 * - before the first message, which is cached
 * - between two cached messages but not adjacent to either
 * - after the last message, which is cached
 * and removal of the added messages.
 */
function subtestAddRemove1(
  sortColumn,
  sortDirection,
  idsInOrder,
  messagesToAdd
) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 2);

  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.at(0).message.id, idsInOrder[0]);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(7),
    ]);

    Assert.equal(adapter._rowMap.at(9).message.id, idsInOrder[9]);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
    ]);

    adapter.setTree(tree);

    const addedBefore = addMessage(messagesToAdd[0]);
    Assert.deepEqual(listStorage(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
    ]);
    Assert.equal(tree._index, 0);
    Assert.equal(tree._delta, 1);

    const addedBetween = addMessage(messagesToAdd[1]);
    Assert.deepEqual(listStorage(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
    ]);
    Assert.equal(tree._index, 8);
    Assert.equal(tree._delta, 1);

    const addedAfter = addMessage(messagesToAdd[2]);
    Assert.deepEqual(listStorage(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    Assert.equal(tree._index, 12);
    Assert.equal(tree._delta, 1);

    messageDB.removeMessage(addedBefore);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    Assert.equal(tree._index, 0);
    Assert.equal(tree._delta, -1);

    messageDB.removeMessage(addedBetween);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    Assert.equal(tree._index, 7);
    Assert.equal(tree._delta, -1);

    messageDB.removeMessage(addedAfter);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
    ]);
    Assert.equal(tree._index, 10);
    Assert.equal(tree._delta, -1);
  } finally {
    adapter.setTree(null);
  }
}

/**
 * Tests additions to the cache of a LiveViewDataAdapter
 * - before but not adjacent to a cached message
 * - after but not adjacent to a cached message
 * and removal of the added messages.
 */
function subtestAddRemove2(
  sortColumn,
  sortDirection,
  idsInOrder,
  messagesToAdd
) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 2);

  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.at(5).message.id, idsInOrder[5]);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(2),
    ]);

    adapter.setTree(tree);

    const addedBefore = addMessage(messagesToAdd[0]);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(4),
      ...idsInOrder.slice(3, 8),
      ...new Array(2),
    ]);
    Assert.equal(tree._index, 3);
    Assert.equal(tree._delta, 1);

    const addedAfter = addMessage(messagesToAdd[2]);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(4),
      ...idsInOrder.slice(3, 8),
      ...new Array(3),
    ]);
    Assert.equal(tree._index, 11);
    Assert.equal(tree._delta, 1);

    messageDB.removeMessage(addedBefore);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(3),
    ]);
    Assert.equal(tree._index, 3);
    Assert.equal(tree._delta, -1);

    messageDB.removeMessage(addedAfter);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(2),
    ]);
    Assert.equal(tree._index, 10);
    Assert.equal(tree._delta, -1);
  } finally {
    adapter.setTree(null);
  }
}

/**
 * Tests additions to the cache of a LiveViewDataAdapter
 * - inside a group of cached messages
 * - inside a second group of cached messages
 * - immediately above the previously added message in the second group
 * and removal of the added messages.
 */
function subtestAddRemove3(
  sortColumn,
  sortDirection,
  idsInOrder,
  messagesToAdd
) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 1);

  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.at(2).message.id, idsInOrder[2]);
    Assert.equal(adapter._rowMap.at(7).message.id, idsInOrder[7]);
    Assert.deepEqual(listStorage(adapter), [
      undefined,
      ...idsInOrder.slice(1, 4),
      ...new Array(2),
      ...idsInOrder.slice(6, 9),
      undefined,
    ]);

    adapter.setTree(tree);

    const addedFirstGroup = addMessage(messagesToAdd[0]);
    Assert.deepEqual(listStorage(adapter), [
      undefined,
      idsInOrder[1],
      addedFirstGroup,
      ...idsInOrder.slice(2, 4),
      ...new Array(2),
      ...idsInOrder.slice(6, 9),
      undefined,
    ]);
    Assert.equal(tree._index, 2);
    Assert.equal(tree._delta, 1);

    const addedSecondGroup1 = addMessage(messagesToAdd[1]);
    Assert.deepEqual(listStorage(adapter), [
      undefined,
      idsInOrder[1],
      addedFirstGroup,
      ...idsInOrder.slice(2, 4),
      ...new Array(2),
      ...idsInOrder.slice(6, 8),
      addedSecondGroup1,
      idsInOrder[8],
      undefined,
    ]);
    Assert.equal(tree._index, 9);
    Assert.equal(tree._delta, 1);

    const addedSecondGroup2 = addMessage(messagesToAdd[2]);
    Assert.deepEqual(listStorage(adapter), [
      undefined,
      idsInOrder[1],
      addedFirstGroup,
      ...idsInOrder.slice(2, 4),
      ...new Array(2),
      ...idsInOrder.slice(6, 8),
      addedSecondGroup2,
      addedSecondGroup1,
      idsInOrder[8],
      undefined,
    ]);
    Assert.equal(tree._index, 9);
    Assert.equal(tree._delta, 1);

    messageDB.removeMessage(addedSecondGroup1);
    Assert.equal(tree._index, 10);
    Assert.equal(tree._delta, -1);

    messageDB.removeMessage(addedSecondGroup2);
    Assert.equal(tree._index, 9);
    Assert.equal(tree._delta, -1);

    messageDB.removeMessage(addedFirstGroup);
    Assert.equal(tree._index, 2);
    Assert.equal(tree._delta, -1);
  } finally {
    adapter.setTree(null);
  }
}

// Sort by date.

const dateDesc = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const dateAsc = dateDesc.toReversed();

add_task(function testDateFillFromTop() {
  subtestFillFromTop("date", "descending", dateDesc);
  subtestFillFromTop("date", "ascending", dateAsc);
});

add_task(function testDateFillFromBottom() {
  subtestFillFromBottom("date", "descending", dateDesc);
  subtestFillFromBottom("date", "ascending", dateAsc);
});

add_task(function testDateAddRemove() {
  subtestAddRemove1("date", "descending", dateDesc, [
    { date: "2023-11-14" },
    { date: "2020-09-13" },
    { date: "2017-07-14" },
  ]);
  subtestAddRemove2("date", "descending", dateDesc, [
    { date: "2023-11-14" },
    { date: "2020-09-13" },
    { date: "2017-07-14" },
  ]);
  subtestAddRemove3("date", "descending", dateDesc, [
    { date: "2023-08-14" },
    { date: "2019-09-20" },
    { date: "2019-10-02" },
  ]);

  subtestAddRemove1("date", "ascending", dateAsc, [
    { date: "2017-07-14" },
    { date: "2020-09-13" },
    { date: "2023-11-14" },
  ]);
  subtestAddRemove2("date", "ascending", dateAsc, [
    { date: "2017-07-14" },
    { date: "2023-05-13" },
    { date: "2023-11-14" },
  ]);
  subtestAddRemove3("date", "ascending", dateAsc, [
    { date: "2019-10-02" },
    { date: "2023-08-13" },
    { date: "2023-08-12" },
  ]);
});

// Sort by subject.

const subjectDesc = [9, 5, 3, 6, 4, 2, 1, 7, 10, 8];
const subjectAsc = subjectDesc.toReversed();

add_task(function testSubjectFillFromTop() {
  subtestFillFromTop("subject", "descending", subjectDesc);
  subtestFillFromTop("subject", "ascending", subjectAsc);
});

add_task(function testSubjectFillFromBottom() {
  subtestFillFromBottom("subject", "descending", subjectDesc);
  subtestFillFromBottom("subject", "ascending", subjectAsc);
});

add_task(function testSubjectAddRemove() {
  subtestAddRemove1("subject", "descending", subjectDesc, [
    { subject: "Visionary optimizing benchmark" },
    { subject: "Innovative discrete success" },
    { subject: "Balanced mission-critical encryption" },
  ]);
  subtestAddRemove2("subject", "descending", subjectDesc, [
    { subject: "Visionary optimizing benchmark" },
    { subject: "Innovative discrete success" },
    { subject: "Balanced mission-critical encryption" },
  ]);
  subtestAddRemove3("subject", "descending", subjectDesc, [
    { subject: "Total bi-directional knowledge base" },
    { subject: "Down-sized 3rd generation core" },
    { subject: "Enhanced client-driven projection" },
  ]);

  subtestAddRemove1("subject", "ascending", subjectAsc, [
    { subject: "Balanced mission-critical encryption" },
    { subject: "Innovative discrete success" },
    { subject: "Visionary optimizing benchmark" },
  ]);
  subtestAddRemove2("subject", "ascending", subjectAsc, [
    { subject: "Balanced mission-critical encryption" },
    { subject: "Robust real-time interface" },
    { subject: "Visionary optimizing benchmark" },
  ]);
  subtestAddRemove3("subject", "ascending", subjectAsc, [
    { subject: "Enhanced client-driven projection" },
    { subject: "Total optimal product" },
    { subject: "Switchable contextually-based implementation" },
  ]);
});

/**
 * Convert the message cache of `adapter` to an array of message IDs. Empty
 * slots in the cache are `undefined` in the returned array.
 *
 * @param {LiveViewDataAdapter} adapter
 * @returns {integer[]}
 */
function listStorage(adapter) {
  const ids = [];
  for (let i = 0; i < adapter._rowMap.length; i++) {
    if (adapter._rowMap._hasMessageAt(i)) {
      ids.push(adapter._rowMap.at(i).message.id);
    } else {
      ids.push(undefined);
    }
  }
  return ids;
}
