/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the live view adapter for displaying messages grouped by sort.
 */

const { LiveViewGroupedDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/LiveViewDataAdapter.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

add_setup(async function () {
  await installDBFromFile("db/sortGroups.sql");
});

add_task(async function testByDateDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.setTree(tree);
  adapter.sortBy("date", "descending");
  await tree.promiseRowCountChanged(0, 7);
  Assert.equal(liveView.sortColumn, Ci.nsILiveView.DATE);
  Assert.ok(liveView.sortDescending);

  try {
    Assert.equal(adapter.rowCount, 7);
    Assert.equal(adapter.getCellText(0, "subject"), "2023");
    Assert.equal(adapter.rowAt(0).rowCount, 1);
    Assert.equal(adapter.getCellText(1, "subject"), "2021");
    Assert.equal(adapter.rowAt(1).rowCount, 1);
    Assert.equal(adapter.getCellText(2, "subject"), "2017");
    Assert.equal(adapter.rowAt(2).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "subject"), "2016");
    Assert.equal(adapter.rowAt(3).rowCount, 4);
    Assert.equal(adapter.getCellText(4, "subject"), "2015");
    Assert.equal(adapter.rowAt(4).rowCount, 2);
    Assert.equal(adapter.getCellText(5, "subject"), "2013");
    Assert.equal(adapter.rowAt(5).rowCount, 2);
    Assert.equal(adapter.getCellText(6, "subject"), "2011");
    Assert.equal(adapter.rowAt(6).rowCount, 1);

    adapter.toggleOpenState(0);
    await tree.promiseRowCountChanged(1, 1);
    await tree.promiseInvalidate(0, 1);
    Assert.equal(adapter.rowCount, 8);
    Assert.equal(adapter.getCellText(0, "subject"), "2023");
    Assert.equal(adapter.getCellText(1, "messageId"), "message13@invalid"); // 2023-02-19
    Assert.equal(adapter.getCellText(2, "subject"), "2021");

    adapter.toggleOpenState(4);
    await tree.promiseRowCountChanged(5, 4);
    await tree.promiseInvalidate(4, 8);
    Assert.equal(adapter.rowCount, 12);
    Assert.equal(adapter.getCellText(4, "subject"), "2016");
    Assert.equal(adapter.getCellText(5, "messageId"), "message7@invalid"); // 2016-09-29
    Assert.equal(adapter.getCellText(6, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(7, "messageId"), "message11@invalid"); // 2016-05-21
    Assert.equal(adapter.getCellText(8, "messageId"), "message10@invalid"); // 2016-02-19
  } finally {
    adapter.setTree(null);
  }
});

add_task(async function testByDateAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.sortBy("date", "ascending");
  adapter.setTree(tree);
  await tree.promiseRowCountChanged(0, 7);
  Assert.equal(liveView.sortColumn, Ci.nsILiveView.DATE);
  Assert.ok(!liveView.sortDescending);

  try {
    Assert.equal(adapter.rowCount, 7);
    Assert.equal(adapter.getCellText(0, "subject"), "2011");
    Assert.equal(adapter.rowAt(0).rowCount, 1);
    Assert.equal(adapter.getCellText(1, "subject"), "2013");
    Assert.equal(adapter.rowAt(1).rowCount, 2);
    Assert.equal(adapter.getCellText(2, "subject"), "2015");
    Assert.equal(adapter.rowAt(2).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "subject"), "2016");
    Assert.equal(adapter.rowAt(3).rowCount, 4);
    Assert.equal(adapter.getCellText(4, "subject"), "2017");
    Assert.equal(adapter.rowAt(4).rowCount, 2);
    Assert.equal(adapter.getCellText(5, "subject"), "2021");
    Assert.equal(adapter.rowAt(5).rowCount, 1);
    Assert.equal(adapter.getCellText(6, "subject"), "2023");
    Assert.equal(adapter.rowAt(6).rowCount, 1);

    adapter.toggleOpenState(6);
    await tree.promiseRowCountChanged(7, 1);
    await tree.promiseInvalidate(6, 7);
    Assert.equal(adapter.rowCount, 8);
    Assert.equal(adapter.getCellText(6, "subject"), "2023");
    Assert.equal(adapter.getCellText(7, "messageId"), "message13@invalid"); // 2023-02-19

    adapter.toggleOpenState(3);
    await tree.promiseRowCountChanged(4, 4);
    await tree.promiseInvalidate(3, 7);
    Assert.equal(adapter.rowCount, 12);
    Assert.equal(adapter.getCellText(3, "subject"), "2016");
    Assert.equal(adapter.getCellText(4, "messageId"), "message10@invalid"); // 2016-02-19
    Assert.equal(adapter.getCellText(5, "messageId"), "message11@invalid"); // 2016-05-21
    Assert.equal(adapter.getCellText(6, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(7, "messageId"), "message7@invalid"); // 2016-09-29
  } finally {
    adapter.setTree(null);
  }
});

add_task(async function testBySubjectDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.sortBy("subject", "descending");
  adapter.setTree(tree);
  await tree.promiseRowCountChanged(0, 8);
  Assert.equal(liveView.sortColumn, Ci.nsILiveView.SUBJECT);
  Assert.ok(liveView.sortDescending);

  try {
    const subjectAt = index => adapter.getCellText(index, "subject");
    Assert.equal(adapter.rowCount, 8);
    Assert.equal(subjectAt(0), "Reduced directional secured line");
    Assert.equal(adapter.rowAt(0).rowCount, 1);
    Assert.equal(subjectAt(1), "Organized 3rd generation alliance");
    Assert.equal(adapter.rowAt(1).rowCount, 2);
    Assert.equal(subjectAt(2), "Open-architected radical system engine");
    Assert.equal(adapter.rowAt(2).rowCount, 1);
    Assert.equal(subjectAt(3), "Object-based disintermediate analyzer");
    Assert.equal(adapter.rowAt(3).rowCount, 1);
    Assert.equal(subjectAt(4), "Intuitive 24/7 hardware");
    Assert.equal(adapter.rowAt(4).rowCount, 1);
    Assert.equal(subjectAt(5), "Expanded disintermediate service-desk");
    Assert.equal(adapter.rowAt(5).rowCount, 1);
    Assert.equal(subjectAt(6), "Down-sized disintermediate solution");
    Assert.equal(adapter.rowAt(6).rowCount, 1);
    Assert.equal(subjectAt(7), "Automated uniform internet solution");
    Assert.equal(adapter.rowAt(7).rowCount, 5);

    adapter.toggleOpenState(7);
    await tree.promiseRowCountChanged(8, 5);
    await tree.promiseInvalidate(7, 12);
    Assert.equal(adapter.rowCount, 13);
    Assert.equal(subjectAt(7), "Automated uniform internet solution");
    // FIXME: Order not defined in code. Currently using insertion order.
    Assert.equal(adapter.getCellText(8, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(9, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(10, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(11, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(12, "messageId"), "message12@invalid");

    adapter.toggleOpenState(1);
    await tree.promiseRowCountChanged(2, 2);
    await tree.promiseInvalidate(1, 3);
    Assert.equal(adapter.rowCount, 15);
    Assert.equal(subjectAt(1), "Organized 3rd generation alliance");
    Assert.equal(adapter.getCellText(2, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(3, "messageId"), "message13@invalid");
    Assert.equal(subjectAt(4), "Open-architected radical system engine");
  } finally {
    adapter.setTree(null);
  }
});

add_task(async function testBySubjectAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.sortBy("subject", "ascending");
  adapter.setTree(tree);
  await tree.promiseRowCountChanged(0, 8);
  Assert.equal(liveView.sortColumn, Ci.nsILiveView.SUBJECT);
  Assert.ok(!liveView.sortDescending);

  try {
    const subjectAt = index => adapter.getCellText(index, "subject");
    Assert.equal(adapter.rowCount, 8);
    Assert.equal(subjectAt(0), "Automated uniform internet solution");
    Assert.equal(adapter.rowAt(0).rowCount, 5);
    Assert.equal(subjectAt(1), "Down-sized disintermediate solution");
    Assert.equal(adapter.rowAt(1).rowCount, 1);
    Assert.equal(subjectAt(2), "Expanded disintermediate service-desk");
    Assert.equal(adapter.rowAt(2).rowCount, 1);
    Assert.equal(subjectAt(3), "Intuitive 24/7 hardware");
    Assert.equal(adapter.rowAt(3).rowCount, 1);
    Assert.equal(subjectAt(4), "Object-based disintermediate analyzer");
    Assert.equal(adapter.rowAt(4).rowCount, 1);
    Assert.equal(subjectAt(5), "Open-architected radical system engine");
    Assert.equal(adapter.rowAt(5).rowCount, 1);
    Assert.equal(subjectAt(6), "Organized 3rd generation alliance");
    Assert.equal(adapter.rowAt(6).rowCount, 2);
    Assert.equal(subjectAt(7), "Reduced directional secured line");
    Assert.equal(adapter.rowAt(7).rowCount, 1);

    adapter.toggleOpenState(0);
    await tree.promiseRowCountChanged(1, 5);
    await tree.promiseInvalidate(0, 5);
    Assert.equal(adapter.rowCount, 13);
    Assert.equal(subjectAt(0), "Automated uniform internet solution");
    // FIXME: Order not defined in code. Currently using insertion order.
    Assert.equal(adapter.getCellText(1, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(2, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(3, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(4, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(5, "messageId"), "message12@invalid");
    Assert.equal(subjectAt(6), "Down-sized disintermediate solution");

    adapter.toggleOpenState(11);
    await tree.promiseRowCountChanged(12, 2);
    await tree.promiseInvalidate(11, 13);
    Assert.equal(adapter.rowCount, 15);
    Assert.equal(subjectAt(11), "Organized 3rd generation alliance");
    Assert.equal(adapter.getCellText(12, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(13, "messageId"), "message13@invalid");
    Assert.equal(subjectAt(14), "Reduced directional secured line");
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
  async promiseInvalidate(expectedStart, expectedEnd) {
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
