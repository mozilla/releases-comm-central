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
  await installDB("messages.sqlite");

  registerCleanupFunction(function () {
    // Make sure the LiveView destructor runs, to finalize the SQL statements,
    // even if the test fails.
    Cu.forceGC();
  });
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
  Services.prefs.setIntPref("mail.bufferRows", 4);

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
  Services.prefs.setIntPref("mail.bufferRows", 4);

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
  Services.prefs.setIntPref("mail.bufferRows", 2);

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

    messages.removeMessage(addedBefore);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    Assert.equal(tree._index, 0);
    Assert.equal(tree._delta, -1);

    messages.removeMessage(addedBetween);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    Assert.equal(tree._index, 7);
    Assert.equal(tree._delta, -1);

    messages.removeMessage(addedAfter);
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
  Services.prefs.setIntPref("mail.bufferRows", 2);

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

    messages.removeMessage(addedBefore);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(3),
    ]);
    Assert.equal(tree._index, 3);
    Assert.equal(tree._delta, -1);

    messages.removeMessage(addedAfter);
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
  Services.prefs.setIntPref("mail.bufferRows", 1);

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

    messages.removeMessage(addedSecondGroup1);
    Assert.equal(tree._index, 10);
    Assert.equal(tree._delta, -1);

    messages.removeMessage(addedSecondGroup2);
    Assert.equal(tree._index, 9);
    Assert.equal(tree._delta, -1);

    messages.removeMessage(addedFirstGroup);
    Assert.equal(tree._index, 2);
    Assert.equal(tree._delta, -1);
  } finally {
    adapter.setTree(null);
  }
}

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
    { date: 1700000000000 },
    { date: 1600000000000 },
    { date: 1500000000000 },
  ]);
  subtestAddRemove2("date", "descending", dateDesc, [
    { date: 1700000000000 },
    { date: 1600000000000 },
    { date: 1500000000000 },
  ]);
  subtestAddRemove3("date", "descending", dateDesc, [
    { date: 1692000000000 },
    { date: 1569000000000 },
    { date: 1570000000000 },
  ]);

  subtestAddRemove1("date", "ascending", dateAsc, [
    { date: 1500000000000 },
    { date: 1600000000000 },
    { date: 1700000000000 },
  ]);
  subtestAddRemove2("date", "ascending", dateAsc, [
    { date: 1500000000000 },
    { date: 1684000000000 },
    { date: 1700000000000 },
  ]);
  subtestAddRemove3("date", "ascending", dateAsc, [
    { date: 1570000000000 },
    { date: 1692000000000 },
    { date: 1691900000000 },
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
