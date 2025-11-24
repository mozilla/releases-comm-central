/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the live view adapter for displaying messages in threads.
 */

const { LiveViewThreadedDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/LiveViewDataAdapter.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

add_setup(async function () {
  await installDBFromFile("db/conversations.sql");
});

/**
 * Tests the threaded view, with all of the messages available for all threads.
 */
add_task(async function testThreadedView() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseRowCountChanged(0, 6);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(0).rowCount, 0);
    Assert.equal(adapter.getCellText(0, "messageId"), "message10@invalid");
    Assert.equal(adapter.getCellText(0, "threadId"), "10");
    Assert.equal(adapter.rowAt(1).rowCount, 0);
    Assert.equal(adapter.getCellText(1, "messageId"), "message9@invalid");
    Assert.equal(adapter.getCellText(1, "threadId"), "9");
    Assert.equal(adapter.rowAt(2).rowCount, 0);
    Assert.equal(adapter.getCellText(2, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "8");
    Assert.equal(adapter.rowAt(3).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    Assert.equal(adapter.rowAt(4).rowCount, 2);
    Assert.equal(adapter.getCellText(4, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "7");
    Assert.equal(adapter.rowAt(5).rowCount, 0);
    Assert.equal(adapter.getCellText(5, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "1");

    // Open thread with ID 3, which is at row 3.
    adapter.toggleOpenState(3);
    await tree.promiseRowCountChanged(4, 2);
    await tree
      .promiseInvalidated(3, 3)
      .then(() => tree.promiseInvalidated(3, 5));
    Assert.equal(adapter.rowCount, 8);
    // Row 3 is no longer the newest message in thread 3, it's the oldest.
    Assert.equal(adapter.getCellText(3, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    // And the following rows are the rest of the thread, in ascending order.
    Assert.equal(adapter.getCellText(4, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");
    Assert.equal(adapter.getCellText(5, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "3");
    Assert.equal(adapter.getCellText(6, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "7");
    Assert.equal(adapter.getCellText(7, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(7, "threadId"), "1");

    // Open thread with ID 7, which is at row 6.
    adapter.toggleOpenState(6);
    await tree.promiseRowCountChanged(7, 2);
    await tree
      .promiseInvalidated(6, 6)
      .then(() => tree.promiseInvalidated(6, 8));
    Assert.equal(adapter.rowCount, 10);
    // Row 6 is no longer the newest message in thread 7, it's the oldest.
    Assert.equal(adapter.getCellText(6, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "7");
    // And the following rows are the rest of the thread, in ascending order.
    Assert.equal(adapter.getCellText(7, "messageId"), "message2@invalid");
    Assert.equal(adapter.getCellText(7, "threadId"), "7");
    Assert.equal(adapter.getCellText(8, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(8, "threadId"), "7");
    Assert.equal(adapter.getCellText(9, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(9, "threadId"), "1");

    // Close thread with ID 3, which is at row 3.
    adapter.toggleOpenState(3);
    await tree.promiseRowCountChanged(4, -2);
    await tree.promiseInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 8);
    // Row 3 is the newest message in thread 3 again.
    Assert.equal(adapter.rowAt(3).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    Assert.equal(adapter.getCellText(4, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "7");
    Assert.equal(adapter.getCellText(5, "messageId"), "message2@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "7");
    Assert.equal(adapter.getCellText(6, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "7");
    Assert.equal(adapter.getCellText(7, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(7, "threadId"), "1");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Tests the threaded view, but only in a single folder so parts of a thread
 * are missing.
 */
add_task(async function testThreadedViewPartialThread() {
  const liveView = new LiveView();
  liveView.initWithFolder(folderDB.getFolderByPath("server1/folderB"));
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseRowCountChanged(0, 2);

  try {
    Assert.equal(adapter.rowCount, 2);
    Assert.equal(adapter.getCellText(0, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(1, "messageId"), "message4@invalid");

    adapter.toggleOpenState(0);
    await tree.promiseRowCountChanged(1, 2);
    await tree
      .promiseInvalidated(0, 0)
      .then(() => tree.promiseInvalidated(0, 2));
    Assert.equal(adapter.rowCount, 4);
    Assert.equal(adapter.getCellText(0, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(1, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(2, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(3, "messageId"), "message4@invalid");

    Assert.ok(adapter.isContainerEmpty(3));
  } finally {
    adapter.setTree(null);
  }
});

const tree = {
  rowCountChanged(index, delta) {
    info(`rowCountChanged(${index}, ${delta})`);
    this._index = index;
    this._delta = delta;
    this._rowCountDeferred?.resolve();
  },
  invalidateRow(index) {
    info(`invalidateRow(${index})`);
    this._start = index;
    this._end = index;
    this._invalidateDeferred?.resolve();
  },
  invalidateRange(start, end) {
    info(`invalidateRange(${start}, ${end})`);
    this._start = start;
    this._end = end;
    this._invalidateDeferred?.resolve();
  },

  async promiseRowCountChanged(expectedIndex, expectedDelta) {
    if (this._index === undefined) {
      this._rowCountDeferred = Promise.withResolvers();
      await this._rowCountDeferred.promise;
      delete this._rowCountDeferred;
    }
    this.assertRowCountChanged(expectedIndex, expectedDelta);
  },
  async promiseInvalidated(expectedStart, expectedEnd) {
    if (this._start === undefined) {
      this._invalidateDeferred = Promise.withResolvers();
      await this._invalidateDeferred.promise;
      delete this._invalidateDeferred;
    }
    this.assertInvalidateRange(expectedStart, expectedEnd);
  },
  assertRowCountChanged(expectedIndex, expectedDelta) {
    Assert.equal(this._index, expectedIndex);
    Assert.equal(this._delta, expectedDelta);
    delete this._index;
    delete this._delta;
  },
  assertInvalidateRange(expectedStart, expectedEnd) {
    Assert.equal(this._start, expectedStart);
    Assert.equal(this._end, expectedEnd);
    delete this._start;
    delete this._end;
  },
};
