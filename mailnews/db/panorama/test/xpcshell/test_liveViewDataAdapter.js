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

const dateDesc = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

add_task(function testDateFillFromTop() {
  subtestFillFromTop("date", "descending", dateDesc);
});

add_task(function testDateFillFromBottom() {
  subtestFillFromBottom("date", "descending", dateDesc);
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
