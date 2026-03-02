/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This is a series of tests to prove that LiveViewDataAdapter has correctly
 * cached messages from the LiveView. We create a list of the message IDs in
 * the adapter's cache (in `listMessages`) and compare it to a known list of
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
  const { adapter } = await setUpAdapter("date", "descending");

  try {
    const row2 = adapter.rowAt(2);
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

    const row6 = adapter.rowAt(6);
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

async function setUpAdapter(sortColumn, sortDirection) {
  const liveView = new LiveView();
  const adapter = new LiveViewDataAdapter(liveView);
  adapter.sortBy(sortColumn, sortDirection);
  const tree = new ListenerTree();
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 9);
  return { adapter, tree };
}

/**
 * Test what happens when messages are added or removed.
 */
async function subtestAddRemove(
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

    Assert.deepEqual(listMessages(adapter), idsInOrder);

    const addedBefore = addMessage(messagesToAdd[0]);
    Assert.deepEqual(listMessages(adapter), [addedBefore, ...idsInOrder]);
    tree.assertRowCountChanged(0, 1);

    const addedBetween = addMessage(messagesToAdd[1]);
    const countBefore = sortDirection == "descending" ? 6 : 4;
    Assert.deepEqual(listMessages(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, countBefore),
      addedBetween,
      ...idsInOrder.slice(countBefore, 10),
    ]);
    tree.assertRowCountChanged(countBefore + 1, 1);

    const addedAfter = addMessage(messagesToAdd[2]);
    Assert.deepEqual(listMessages(adapter), [
      addedBefore,
      ...idsInOrder.slice(0, countBefore),
      addedBetween,
      ...idsInOrder.slice(countBefore, 10),
      addedAfter,
    ]);
    tree.assertRowCountChanged(12, 1);

    messageDB.removeMessage(addedBefore);
    Assert.deepEqual(listMessages(adapter), [
      ...idsInOrder.slice(0, countBefore),
      addedBetween,
      ...idsInOrder.slice(countBefore, 10),
      addedAfter,
    ]);
    tree.assertRowCountChanged(0, -1);

    messageDB.removeMessage(addedBetween);
    Assert.deepEqual(listMessages(adapter), [...idsInOrder, addedAfter]);
    tree.assertRowCountChanged(countBefore, -1);

    messageDB.removeMessage(addedAfter);
    Assert.deepEqual(listMessages(adapter), idsInOrder);
    tree.assertRowCountChanged(10, -1);
  } finally {
    adapter.setTree(null);
  }
}

// Sort by date.

const dateDesc = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const dateAsc = dateDesc.toReversed();

/**
 * Test LiveViewDataAdapter, when sorted by date, descending.
 */
add_task(async function testAddRemoveDateDescending() {
  await subtestAddRemove("date", "descending", dateDesc, [
    { date: "2023-11-14" },
    { date: "2020-09-13" },
    { date: "2017-07-14" },
  ]);
});

/**
 * Test LiveViewDataAdapter, when sorted by date, ascending.
 */
add_task(async function testAddRemoveDateAscending() {
  await subtestAddRemove("date", "ascending", dateAsc, [
    { date: "2017-07-14" },
    { date: "2020-09-13" },
    { date: "2023-11-14" },
  ]);
});

// Sort by subject.

const subjectDesc = [9, 5, 3, 6, 4, 2, 1, 7, 10, 8];
const subjectAsc = subjectDesc.toReversed();

/**
 * Test LiveViewDataAdapter, when sorted by subject, descending.
 */
add_task(async function testAddRemoveSubjectDescending() {
  await subtestAddRemove("subject", "descending", subjectDesc, [
    { subject: "Visionary optimizing benchmark" },
    { subject: "Innovative discrete success" },
    { subject: "Balanced mission-critical encryption" },
  ]);
});

/**
 * Test LiveViewDataAdapter, when sorted by subject, ascending.
 */
add_task(async function testAddRemoveSubjectAscending() {
  await subtestAddRemove("subject", "ascending", subjectAsc, [
    { subject: "Balanced mission-critical encryption" },
    { subject: "Innovative discrete success" },
    { subject: "Visionary optimizing benchmark" },
  ]);
});
