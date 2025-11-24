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
add_task(async function testColumnContents() {
  const { adapter, tree } = await setUpAdapter("date", "descending");

  try {
    // Trigger getting some messages from the live view. This is an async call
    // so the values will be undefined initially, then once the async call
    // resolves invalidateRange will be called.
    Assert.strictEqual(adapter._rowMap.rowAt(2).message, undefined);
    await tree.promiseInvalidateRange(0, 9);

    const row2 = adapter._rowMap.rowAt(2);
    Assert.equal(row2.message.id, 8, "message 8 should be at row 2");
    // We're not going to get into the intricacies of date/time formatting yet.
    // Just check the value is right for sorting.
    Assert.equal(row2.getValue("date"), 1691301720000);
    // FIXME: Address formatting is temporarily disabled.
    // Assert.equal(row2.getText("sender"), "Edgár Stokes <edgar@stokes.invalid>");
    Assert.equal(row2.getText("subject"), "Balanced static project déjà vu");
    Assert.equal(row2.getText("flags"), "0");
    Assert.equal(row2.getText("unread"), "1");
    Assert.equal(row2.getText("flagged"), "0");
    Assert.equal(row2.getText("tags"), "$label1");

    const row6 = adapter._rowMap.rowAt(6);
    Assert.equal(row6.message.id, 4, "message 4 should be at row 6");
    Assert.equal(row6.getValue("date"), 1572784496000);
    // FIXME: Address formatting is temporarily disabled.
    // Assert.equal(row6.getText("sender"), "Eliseo Bauch <eliseo@bauch.invalid>");
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

class ListenerTree {
  rowCountChanged(index, delta) {
    info(`rowCountChanged(${index}, ${delta})`);
    Assert.strictEqual(this._index, undefined);
    Assert.strictEqual(this._start, undefined);
    this._index = index;
    this._delta = delta;
    this._rowCountDeferred?.resolve();
  }
  invalidateRange(start, end) {
    info(`invalidateRange(${start}, ${end})`);
    Assert.strictEqual(this._index, undefined);
    Assert.strictEqual(this._start, undefined);
    this._start = start;
    this._end = end;
    this._invalidateDeferred?.resolve();
  }
  reset() {
    info(`reset()`);
    Assert.ok(false, "reset() should not be called in this test");
  }

  async promiseRowCountChanged(expectedIndex, expectedDelta) {
    Assert.ok(!this._rowCountDeferred);
    Assert.ok(!this._invalidateDeferred);
    if (this._index === undefined) {
      this._rowCountDeferred = Promise.withResolvers();
      await this._rowCountDeferred.promise;
      delete this._rowCountDeferred;
    }
    this.assertRowCountChanged(expectedIndex, expectedDelta);
  }
  async promiseInvalidateRange(expectedStart, expectedEnd) {
    Assert.ok(!this._rowCountDeferred);
    Assert.ok(!this._invalidateDeferred);
    if (this._start === undefined) {
      this._invalidateDeferred = Promise.withResolvers();
      await this._invalidateDeferred.promise;
      delete this._invalidateDeferred;
    }
    this.assertInvalidateRange(expectedStart, expectedEnd);
  }
  assertRowCountChanged(expectedIndex, expectedDelta) {
    Assert.equal(this._index, expectedIndex);
    Assert.equal(this._delta, expectedDelta);
    delete this._index;
    delete this._delta;
  }
  assertInvalidateRange(expectedStart, expectedEnd) {
    Assert.equal(this._start, expectedStart);
    Assert.equal(this._end, expectedEnd);
    delete this._start;
    delete this._end;
  }
}

async function setUpAdapter(sortColumn, sortDirection) {
  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);
  const tree = new ListenerTree();
  adapter.setTree(tree);
  await tree.promiseRowCountChanged(0, 10);
  return { adapter, tree };
}

/**
 * Test filling a LiveViewDataAdapter's cache by requesting the messages from
 * the top downwards.
 *
 * @param {string} sortColumn - The column the adapter should be sorting in.
 * @param {string} sortDirection - The direction the adapter should be sorting in.
 * @param {integer[]} idsInOrder - The expected message IDs.
 */
async function subtestFillFromTop(sortColumn, sortDirection, idsInOrder) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 4);

  const { adapter, tree } = await setUpAdapter(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.deepEqual(
      listStorage(adapter),
      [...new Array(10)],
      "row map should have no messages stored initially"
    );

    Assert.strictEqual(adapter._rowMap.rowAt(0).message, undefined);
    await tree.promiseInvalidateRange(0, 4);
    Assert.equal(adapter._rowMap.rowAt(0).message.id, idsInOrder[0]);
    Assert.deepEqual(
      listStorage(adapter),
      [...idsInOrder.slice(0, 5), ...new Array(5)],
      "row map should have filled the first five rows"
    );

    Assert.strictEqual(adapter._rowMap.rowAt(5).message, undefined);
    await tree.promiseInvalidateRange(5, 9);
    Assert.equal(adapter._rowMap.rowAt(5).message.id, idsInOrder[5]);
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
async function subtestFillFromBottom(sortColumn, sortDirection, idsInOrder) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 4);

  const { adapter, tree } = await setUpAdapter(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.deepEqual(
      listStorage(adapter),
      [...new Array(10)],
      "row map should have no messages stored initially"
    );

    Assert.strictEqual(adapter._rowMap.rowAt(9).message, undefined);
    await tree.promiseInvalidateRange(5, 9);
    Assert.equal(adapter._rowMap.rowAt(9).message.id, idsInOrder[9]);
    Assert.deepEqual(
      listStorage(adapter),
      [...new Array(5), ...idsInOrder.slice(5, 10)],
      "row map should have filled the last five rows"
    );

    Assert.strictEqual(adapter._rowMap.rowAt(0).message, undefined);
    await tree.promiseInvalidateRange(0, 4);
    Assert.equal(adapter._rowMap.rowAt(0).message.id, idsInOrder[0]);
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
async function subtestAddRemove1(
  sortColumn,
  sortDirection,
  idsInOrder,
  messagesToAdd
) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 2);

  const { adapter, tree } = await setUpAdapter(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.strictEqual(adapter._rowMap.rowAt(0).message, undefined);
    await tree.promiseInvalidateRange(0, 2);
    Assert.equal(adapter._rowMap.rowAt(0).message.id, idsInOrder[0]);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(7),
    ]);

    Assert.strictEqual(adapter._rowMap.rowAt(9).message, undefined);
    await tree.promiseInvalidateRange(7, 9);
    Assert.equal(adapter._rowMap.rowAt(9).message.id, idsInOrder[9]);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
    ]);

    const addedBefore = addMessage(messagesToAdd[0]);
    Assert.deepEqual(listStorage(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
    ]);
    tree.assertRowCountChanged(0, 1);

    const addedBetween = addMessage(messagesToAdd[1]);
    Assert.deepEqual(listStorage(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
    ]);
    tree.assertRowCountChanged(8, 1);

    const addedAfter = addMessage(messagesToAdd[2]);
    Assert.deepEqual(listStorage(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    tree.assertRowCountChanged(12, 1);

    messageDB.removeMessage(addedBefore);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(5),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    tree.assertRowCountChanged(0, -1);

    messageDB.removeMessage(addedBetween);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
      addedAfter,
    ]);
    tree.assertRowCountChanged(7, -1);

    messageDB.removeMessage(addedAfter);
    Assert.deepEqual(listStorage(adapter), [
      ...idsInOrder.slice(0, 3),
      ...new Array(4),
      ...idsInOrder.slice(7, 10),
    ]);
    tree.assertRowCountChanged(10, -1);
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
async function subtestAddRemove2(
  sortColumn,
  sortDirection,
  idsInOrder,
  messagesToAdd
) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 2);

  const { adapter, tree } = await setUpAdapter(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.strictEqual(adapter._rowMap.rowAt(5).message, undefined);
    await tree.promiseInvalidateRange(3, 7);
    Assert.equal(adapter._rowMap.rowAt(5).message.id, idsInOrder[5]);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(2),
    ]);

    const addedBefore = addMessage(messagesToAdd[0]);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(4),
      ...idsInOrder.slice(3, 8),
      ...new Array(2),
    ]);
    tree.assertRowCountChanged(3, 1);

    const addedAfter = addMessage(messagesToAdd[2]);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(4),
      ...idsInOrder.slice(3, 8),
      ...new Array(3),
    ]);
    tree.assertRowCountChanged(11, 1);

    messageDB.removeMessage(addedBefore);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(3),
    ]);
    tree.assertRowCountChanged(3, -1);

    messageDB.removeMessage(addedAfter);
    Assert.deepEqual(listStorage(adapter), [
      ...new Array(3),
      ...idsInOrder.slice(3, 8),
      ...new Array(2),
    ]);
    tree.assertRowCountChanged(10, -1);
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
async function subtestAddRemove3(
  sortColumn,
  sortDirection,
  idsInOrder,
  messagesToAdd
) {
  Services.prefs.setIntPref("mail.panorama.bufferRows", 1);

  const { adapter, tree } = await setUpAdapter(sortColumn, sortDirection);

  try {
    Assert.equal(adapter._rowMap.length, 10);
    Assert.equal(adapter.rowCount, 10);

    Assert.strictEqual(adapter._rowMap.rowAt(2).message, undefined);
    await tree.promiseInvalidateRange(1, 3);
    Assert.equal(adapter._rowMap.rowAt(2).message.id, idsInOrder[2]);

    Assert.strictEqual(adapter._rowMap.rowAt(7).message, undefined);
    await tree.promiseInvalidateRange(6, 8);
    Assert.equal(adapter._rowMap.rowAt(7).message.id, idsInOrder[7]);
    Assert.deepEqual(listStorage(adapter), [
      undefined,
      ...idsInOrder.slice(1, 4),
      ...new Array(2),
      ...idsInOrder.slice(6, 9),
      undefined,
    ]);

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
    tree.assertRowCountChanged(2, 1);

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
    tree.assertRowCountChanged(9, 1);

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
    tree.assertRowCountChanged(9, 1);

    messageDB.removeMessage(addedSecondGroup1);
    tree.assertRowCountChanged(10, -1);

    messageDB.removeMessage(addedSecondGroup2);
    tree.assertRowCountChanged(9, -1);

    messageDB.removeMessage(addedFirstGroup);
    tree.assertRowCountChanged(2, -1);
  } finally {
    adapter.setTree(null);
  }
}

// Sort by date.

const dateDesc = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const dateAsc = dateDesc.toReversed();

add_task(async function testDateFillFromTop() {
  await subtestFillFromTop("date", "descending", dateDesc);
  await subtestFillFromTop("date", "ascending", dateAsc);
});

add_task(async function testDateFillFromBottom() {
  await subtestFillFromBottom("date", "descending", dateDesc);
  await subtestFillFromBottom("date", "ascending", dateAsc);
});

add_task(async function testDateAddRemove() {
  await subtestAddRemove1("date", "descending", dateDesc, [
    { date: "2023-11-14" },
    { date: "2020-09-13" },
    { date: "2017-07-14" },
  ]);
  await subtestAddRemove2("date", "descending", dateDesc, [
    { date: "2023-11-14" },
    { date: "2020-09-13" },
    { date: "2017-07-14" },
  ]);
  await subtestAddRemove3("date", "descending", dateDesc, [
    { date: "2023-08-14" },
    { date: "2019-09-20" },
    { date: "2019-10-02" },
  ]);

  await subtestAddRemove1("date", "ascending", dateAsc, [
    { date: "2017-07-14" },
    { date: "2020-09-13" },
    { date: "2023-11-14" },
  ]);
  await subtestAddRemove2("date", "ascending", dateAsc, [
    { date: "2017-07-14" },
    { date: "2023-05-13" },
    { date: "2023-11-14" },
  ]);
  await subtestAddRemove3("date", "ascending", dateAsc, [
    { date: "2019-10-02" },
    { date: "2023-08-13" },
    { date: "2023-08-12" },
  ]);
});

// Sort by subject.

const subjectDesc = [9, 5, 3, 6, 4, 2, 1, 7, 10, 8];
const subjectAsc = subjectDesc.toReversed();

add_task(async function testSubjectFillFromTop() {
  await subtestFillFromTop("subject", "descending", subjectDesc);
  await subtestFillFromTop("subject", "ascending", subjectAsc);
});

add_task(async function testSubjectFillFromBottom() {
  await subtestFillFromBottom("subject", "descending", subjectDesc);
  await subtestFillFromBottom("subject", "ascending", subjectAsc);
});

add_task(async function testSubjectAddRemove() {
  await subtestAddRemove1("subject", "descending", subjectDesc, [
    { subject: "Visionary optimizing benchmark" },
    { subject: "Innovative discrete success" },
    { subject: "Balanced mission-critical encryption" },
  ]);
  await subtestAddRemove2("subject", "descending", subjectDesc, [
    { subject: "Visionary optimizing benchmark" },
    { subject: "Innovative discrete success" },
    { subject: "Balanced mission-critical encryption" },
  ]);
  await subtestAddRemove3("subject", "descending", subjectDesc, [
    { subject: "Total bi-directional knowledge base" },
    { subject: "Down-sized 3rd generation core" },
    { subject: "Enhanced client-driven projection" },
  ]);

  await subtestAddRemove1("subject", "ascending", subjectAsc, [
    { subject: "Balanced mission-critical encryption" },
    { subject: "Innovative discrete success" },
    { subject: "Visionary optimizing benchmark" },
  ]);
  await subtestAddRemove2("subject", "ascending", subjectAsc, [
    { subject: "Balanced mission-critical encryption" },
    { subject: "Robust real-time interface" },
    { subject: "Visionary optimizing benchmark" },
  ]);
  await subtestAddRemove3("subject", "ascending", subjectAsc, [
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
      ids.push(adapter._rowMap.rowAt(i).message.id);
    } else {
      ids.push(undefined);
    }
  }
  return ids;
}
