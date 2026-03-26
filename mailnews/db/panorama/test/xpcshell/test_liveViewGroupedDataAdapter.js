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

const tree = new ListenerTree();

add_setup(async function () {
  await installDBFromFile("db/sortGroups.sql");
});

/**
 * Test LiveViewGroupedDataAdapter when sorted by date, descending.
 */
add_task(async function testDateDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.setTree(tree);
  adapter.sortBy("date", "descending");
  await tree.promiseInvalidated(0, 6);
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
    tree.assertRowCountChanged(1, 1);
    tree.assertInvalidated(0, 0);
    await tree.promiseInvalidated(0, 1);
    Assert.equal(adapter.rowCount, 8);
    Assert.equal(adapter.getCellText(0, "subject"), "2023");
    Assert.equal(adapter.getCellText(1, "messageId"), "message13@invalid"); // 2023-02-19
    Assert.equal(adapter.getCellText(2, "subject"), "2021");

    adapter.toggleOpenState(4);
    tree.assertRowCountChanged(5, 4);
    tree.assertInvalidated(4, 4);
    await tree.promiseInvalidated(4, 8);
    Assert.equal(adapter.rowCount, 12);
    Assert.equal(adapter.getCellText(4, "subject"), "2016");
    Assert.equal(adapter.getCellText(5, "messageId"), "message7@invalid"); // 2016-09-29
    Assert.equal(adapter.getCellText(6, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(7, "messageId"), "message11@invalid"); // 2016-05-21
    Assert.equal(adapter.getCellText(8, "messageId"), "message10@invalid"); // 2016-02-19

    // A message inside an open group.

    const added1 = addMessage({
      date: "2016-03-15",
      messageId: "added1@invalid",
    });
    tree.assertRowCountChanged(4, 1);
    Assert.equal(adapter.rowCount, 13);
    Assert.equal(adapter.getCellText(4, "subject"), "2016");
    Assert.equal(adapter.getCellText(5, "messageId"), "message7@invalid"); // 2016-09-29
    Assert.equal(adapter.getCellText(6, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(7, "messageId"), "message11@invalid"); // 2016-05-21
    Assert.equal(adapter.getCellText(8, "messageId"), "added1@invalid"); // 2016-03-15
    Assert.equal(adapter.getCellText(9, "messageId"), "message10@invalid"); // 2016-02-19

    // A message inside a closed group.

    const added2 = addMessage({
      date: "2017-06-06",
      messageId: "added2@invalid",
    });
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 13);

    // Open the group.

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, 3);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 16);
    await tree.promiseInvalidated(3, 6);
    Assert.equal(adapter.getCellText(3, "subject"), "2017");
    Assert.equal(adapter.getCellText(4, "messageId"), "message8@invalid"); // 2017-09-15
    Assert.equal(adapter.getCellText(5, "messageId"), "added2@invalid"); // 2017-06-06
    Assert.equal(adapter.getCellText(6, "messageId"), "message6@invalid"); // 2017-05-10

    // Close the group.

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, -3);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 13);

    // A message inside a previously open group.

    const added3 = addMessage({
      date: "2017-12-01",
      messageId: "added3@invalid",
    });
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 13);

    // Open the group, check the messages, close the group.

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, 4);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 17);

    Assert.equal(adapter.getCellText(3, "subject"), "2017");
    Assert.equal(adapter.getCellText(4, "messageId"), "added3@invalid"); // 2017-12-01
    Assert.equal(adapter.getCellText(5, "messageId"), "message8@invalid"); // 2017-09-15
    Assert.equal(adapter.getCellText(6, "messageId"), "added2@invalid"); // 2017-06-06
    Assert.equal(adapter.getCellText(7, "messageId"), "message6@invalid"); // 2017-05-10

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, -4);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 13);

    // A message inside a year group that doesn't yet exist.

    const added4 = addMessage({
      date: "2024-07-27",
      messageId: "added4@invalid",
    });
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 14);
    Assert.equal(adapter.getCellText(0, "subject"), "2024");

    // A message inside the "future" group, that doesn't yet exist.

    const now = Date.now();
    const added5 = addMessage({
      date: new Date(now + 3600000).toISOString(),
      messageId: "added5@invalid",
    });
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 15);
    Assert.equal(adapter.getCellText(0, "subject"), "Future");

    // A message inside the "today" group, that doesn't yet exist.

    const added6 = addMessage({
      date: new Date().toISOString(),
      messageId: "added6@invalid",
    });
    tree.assertRowCountChanged(1, 1);
    Assert.equal(adapter.rowCount, 16);
    Assert.equal(adapter.getCellText(1, "subject"), "Today");

    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, 1);
    tree.assertInvalidated(1, 1);
    await tree.promiseInvalidated(1, 2);
    Assert.equal(adapter.getCellText(1, "subject"), "Today");
    Assert.equal(adapter.getCellText(2, "messageId"), "added6@invalid");

    // A message inside the "yesterday" group, that doesn't yet exist.

    const added7 = addMessage({
      date: new Date(now - 86400000).toISOString(),
      messageId: "added7@invalid",
    });
    tree.assertRowCountChanged(3, 1);
    Assert.equal(adapter.rowCount, 18);
    Assert.equal(adapter.getCellText(3, "subject"), "Yesterday");

    // A message inside the "last 7 days" group, that doesn't yet exist.

    const added8 = addMessage({
      date: new Date(now - 86400000 * 3).toISOString(),
      messageId: "added8@invalid",
    });
    tree.assertRowCountChanged(4, 1);
    Assert.equal(adapter.rowCount, 19);
    Assert.equal(adapter.getCellText(4, "subject"), "Last 7 Days");

    // A message inside the "last 14 days" group, that doesn't yet exist.

    const added9 = addMessage({
      date: new Date(now - 86400000 * 11).toISOString(),
      messageId: "added9@invalid",
    });
    tree.assertRowCountChanged(5, 1);
    Assert.equal(adapter.rowCount, 20);
    Assert.equal(adapter.getCellText(5, "subject"), "Last 14 Days");

    // A message inside an old year group that doesn't yet exist.

    const added10 = addMessage({
      date: "1995-01-01",
      messageId: "added10@invalid",
    });
    tree.assertRowCountChanged(20, 1);
    Assert.equal(adapter.rowCount, 21);
    Assert.equal(adapter.getCellText(20, "subject"), "1995");

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(15, -1);
    Assert.equal(adapter.rowCount, 20);

    messageDB.removeMessage(added2);
    tree.assertInvalidated(10, 10);
    Assert.equal(adapter.rowCount, 20);

    messageDB.removeMessage(added3);
    tree.assertInvalidated(10, 10);
    Assert.equal(adapter.rowCount, 20);

    messageDB.removeMessage(added4);
    tree.assertRowCountChanged(6, -1);
    Assert.equal(adapter.rowCount, 19);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(0, -1);
    Assert.equal(adapter.rowCount, 18);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(0, -2);
    Assert.equal(adapter.rowCount, 16);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(0, -1);
    Assert.equal(adapter.rowCount, 15);

    messageDB.removeMessage(added8);
    tree.assertRowCountChanged(0, -1);
    Assert.equal(adapter.rowCount, 14);

    messageDB.removeMessage(added9);
    tree.assertRowCountChanged(0, -1);
    Assert.equal(adapter.rowCount, 13);

    messageDB.removeMessage(added10);
    tree.assertRowCountChanged(12, -1);
    Assert.equal(adapter.rowCount, 12);
    console.log(adapter._flatRowCache.map(r => r.texts.messageId ?? r.group));
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test LiveViewGroupedDataAdapter when sorted by date, ascending.
 */
add_task(async function testDateAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.sortBy("date", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 6);
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
    tree.assertRowCountChanged(7, 1);
    tree.assertInvalidated(6, 6);
    await tree.promiseInvalidated(6, 7);
    Assert.equal(adapter.rowCount, 8);
    Assert.equal(adapter.getCellText(6, "subject"), "2023");
    Assert.equal(adapter.getCellText(7, "messageId"), "message13@invalid"); // 2023-02-19

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, 4);
    tree.assertInvalidated(3, 3);
    await tree.promiseInvalidated(3, 7);
    Assert.equal(adapter.rowCount, 12);
    Assert.equal(adapter.getCellText(3, "subject"), "2016");
    Assert.equal(adapter.getCellText(4, "messageId"), "message10@invalid"); // 2016-02-19
    Assert.equal(adapter.getCellText(5, "messageId"), "message11@invalid"); // 2016-05-21
    Assert.equal(adapter.getCellText(6, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(7, "messageId"), "message7@invalid"); // 2016-09-29

    // A message inside an open group.

    const added1 = addMessage({
      date: "2016-03-15",
      messageId: "added1@invalid",
    });
    tree.assertRowCountChanged(3, 1);
    Assert.equal(adapter.rowCount, 13);
    Assert.equal(adapter.getCellText(3, "subject"), "2016");
    Assert.equal(adapter.getCellText(4, "messageId"), "message10@invalid"); // 2016-02-19
    Assert.equal(adapter.getCellText(5, "messageId"), "added1@invalid"); // 2016-03-15
    Assert.equal(adapter.getCellText(6, "messageId"), "message11@invalid"); // 2016-05-21
    Assert.equal(adapter.getCellText(7, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(8, "messageId"), "message7@invalid"); // 2016-09-29

    // A message inside a closed group.

    const added2 = addMessage({
      date: "2017-06-06",
      messageId: "added2@invalid",
    });
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 13);

    // Open the group.

    adapter.toggleOpenState(9);
    tree.assertRowCountChanged(10, 3);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 16);
    await tree.promiseInvalidated(9, 12);
    Assert.equal(adapter.getCellText(9, "subject"), "2017");
    Assert.equal(adapter.getCellText(10, "messageId"), "message6@invalid"); // 2017-05-10
    Assert.equal(adapter.getCellText(11, "messageId"), "added2@invalid"); // 2017-06-06
    Assert.equal(adapter.getCellText(12, "messageId"), "message8@invalid"); // 2017-09-15

    // Close the group.

    adapter.toggleOpenState(9);
    tree.assertRowCountChanged(10, -3);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 13);

    // A message inside a previously open group.

    const added3 = addMessage({
      date: "2017-12-01",
      messageId: "added3@invalid",
    });
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 13);

    // Open the group, check the messages, close the group.

    adapter.toggleOpenState(9);
    tree.assertRowCountChanged(10, 4);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 17);

    Assert.equal(adapter.getCellText(9, "subject"), "2017");
    Assert.equal(adapter.getCellText(10, "messageId"), "message6@invalid"); // 2017-05-10
    Assert.equal(adapter.getCellText(11, "messageId"), "added2@invalid"); // 2017-06-06
    Assert.equal(adapter.getCellText(12, "messageId"), "message8@invalid"); // 2017-09-15
    Assert.equal(adapter.getCellText(13, "messageId"), "added3@invalid"); // 2017-12-01

    adapter.toggleOpenState(9);
    tree.assertRowCountChanged(10, -4);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 13);

    // A message inside a year group that doesn't yet exist.

    const added4 = addMessage({
      date: "2024-07-27",
      messageId: "added4@invalid",
    });
    tree.assertRowCountChanged(13, 1);
    Assert.equal(adapter.rowCount, 14);
    Assert.equal(adapter.getCellText(13, "subject"), "2024");

    // A message inside the "future" group, that doesn't yet exist.

    const now = Date.now();
    const added5 = addMessage({
      date: new Date(now + 3600000).toISOString(),
      messageId: "added5@invalid",
    });
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 15);
    Assert.equal(adapter.getCellText(14, "subject"), "Future");

    // A message inside the "today" group, that doesn't yet exist.

    const added6 = addMessage({
      date: new Date().toISOString(),
      messageId: "added6@invalid",
    });
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 16);
    Assert.equal(adapter.getCellText(14, "subject"), "Today");

    adapter.toggleOpenState(14);
    tree.assertRowCountChanged(15, 1);
    tree.assertInvalidated(14, 14);
    await tree.promiseInvalidated(14, 15);
    Assert.equal(adapter.getCellText(14, "subject"), "Today");
    Assert.equal(adapter.getCellText(15, "messageId"), "added6@invalid");

    // A message inside the "yesterday" group, that doesn't yet exist.

    const added7 = addMessage({
      date: new Date(now - 86400000).toISOString(),
      messageId: "added7@invalid",
    });
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 18);
    Assert.equal(adapter.getCellText(14, "subject"), "Yesterday");

    // A message inside the "last 7 days" group, that doesn't yet exist.

    const added8 = addMessage({
      date: new Date(now - 86400000 * 3).toISOString(),
      messageId: "added8@invalid",
    });
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 19);
    Assert.equal(adapter.getCellText(14, "subject"), "Last 7 Days");

    // A message inside the "last 14 days" group, that doesn't yet exist.

    const added9 = addMessage({
      date: new Date(now - 86400000 * 11).toISOString(),
      messageId: "added9@invalid",
    });
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 20);
    Assert.equal(adapter.getCellText(14, "subject"), "Last 14 Days");

    // A message inside an old year group that doesn't yet exist.

    const added10 = addMessage({
      date: "1995-01-01",
      messageId: "added10@invalid",
    });
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 21);
    Assert.equal(adapter.getCellText(0, "subject"), "1995");

    console.log(adapter._flatRowCache.map(r => r.texts.messageId ?? r.group));
    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(6, -1);
    Assert.equal(adapter.rowCount, 20);

    messageDB.removeMessage(added2);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 20);

    messageDB.removeMessage(added3);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 20);

    messageDB.removeMessage(added4);
    tree.assertRowCountChanged(13, -1);
    Assert.equal(adapter.rowCount, 19);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(18, -1);
    Assert.equal(adapter.rowCount, 18);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(16, -2);
    Assert.equal(adapter.rowCount, 16);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(15, -1);
    Assert.equal(adapter.rowCount, 15);

    messageDB.removeMessage(added8);
    tree.assertRowCountChanged(14, -1);
    Assert.equal(adapter.rowCount, 14);

    messageDB.removeMessage(added9);
    tree.assertRowCountChanged(13, -1);
    Assert.equal(adapter.rowCount, 13);

    messageDB.removeMessage(added10);
    tree.assertRowCountChanged(0, -1);
    Assert.equal(adapter.rowCount, 12);
    console.log(adapter._flatRowCache.map(r => r.texts.messageId ?? r.group));
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test LiveViewGroupedDataAdapter when sorted by subject, descending.
 */
add_task(async function testSubjectDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.sortBy("subject", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 7);
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
    tree.assertRowCountChanged(8, 5);
    tree.assertInvalidated(7, 7);
    await tree.promiseInvalidated(7, 12);
    Assert.equal(adapter.rowCount, 13);
    Assert.equal(subjectAt(7), "Automated uniform internet solution");
    Assert.equal(adapter.getCellText(8, "messageId"), "message8@invalid"); // 2017-09-15
    Assert.equal(adapter.getCellText(9, "messageId"), "message6@invalid"); // 2017-05-10
    Assert.equal(adapter.getCellText(10, "messageId"), "message7@invalid"); // 2016-09-29
    Assert.equal(adapter.getCellText(11, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(12, "messageId"), "message12@invalid"); // 2011-10-10

    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, 2);
    tree.assertInvalidated(1, 1);
    await tree.promiseInvalidated(1, 3);
    Assert.equal(adapter.rowCount, 15);
    Assert.equal(subjectAt(1), "Organized 3rd generation alliance");
    Assert.equal(adapter.getCellText(2, "messageId"), "message13@invalid"); // 2023-02-19
    Assert.equal(adapter.getCellText(3, "messageId"), "message1@invalid"); // 2013-09-15
    Assert.equal(subjectAt(4), "Open-architected radical system engine");

    adapter.toggleOpenState(9);
    tree.assertRowCountChanged(10, -5);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 10);

    // A message inside an open group.

    const added1 = addMessage({
      subject: "Organized 3rd generation alliance",
      messageId: "added1@invalid",
    });
    tree.assertRowCountChanged(1, 1);
    Assert.equal(adapter.rowCount, 11);
    Assert.equal(subjectAt(1), "Organized 3rd generation alliance");
    Assert.equal(adapter.getCellText(2, "messageId"), "added1@invalid"); // Now
    Assert.equal(adapter.getCellText(3, "messageId"), "message13@invalid"); // 2023-02-19
    Assert.equal(adapter.getCellText(4, "messageId"), "message1@invalid"); // 2013-09-15

    // A message inside a closed group.

    const added2 = addMessage({
      subject: "Automated uniform internet solution",
      messageId: "added2@invalid",
    });
    tree.assertInvalidated(10, 10);
    Assert.equal(adapter.rowCount, 11);

    // A message inside a subject group that doesn't yet exist.

    const added3 = addMessage({
      subject: "Multi-layered dynamic policy",
      messageId: "added3@invalid",
    });
    tree.assertRowCountChanged(7, 1);
    Assert.equal(adapter.rowCount, 12);
    Assert.equal(
      adapter.getCellText(7, "subject"),
      "Multi-layered dynamic policy"
    );

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(2, -1);
    Assert.equal(adapter.rowCount, 11);

    messageDB.removeMessage(added2);
    tree.assertInvalidated(10, 10);
    Assert.equal(adapter.rowCount, 11);

    messageDB.removeMessage(added3);
    tree.assertRowCountChanged(6, -1);
    Assert.equal(adapter.rowCount, 10);
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test LiveViewGroupedDataAdapter when sorted by subject, ascending.
 */
add_task(async function testSubjectAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewGroupedDataAdapter(liveView);
  adapter.sortBy("subject", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 7);
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
    tree.assertRowCountChanged(1, 5);
    tree.assertInvalidated(0, 0);
    await tree.promiseInvalidated(0, 5);
    Assert.equal(adapter.rowCount, 13);
    Assert.equal(subjectAt(0), "Automated uniform internet solution");
    Assert.equal(adapter.getCellText(1, "messageId"), "message8@invalid"); // 2017-09-15
    Assert.equal(adapter.getCellText(2, "messageId"), "message6@invalid"); // 2017-05-10
    Assert.equal(adapter.getCellText(3, "messageId"), "message7@invalid"); // 2016-09-29
    Assert.equal(adapter.getCellText(4, "messageId"), "message5@invalid"); // 2016-09-14
    Assert.equal(adapter.getCellText(5, "messageId"), "message12@invalid"); // 2011-10-10
    Assert.equal(subjectAt(6), "Down-sized disintermediate solution");

    adapter.toggleOpenState(11);
    tree.assertRowCountChanged(12, 2);
    tree.assertInvalidated(11, 11);
    await tree.promiseInvalidated(11, 13);
    Assert.equal(adapter.rowCount, 15);
    Assert.equal(subjectAt(11), "Organized 3rd generation alliance");
    Assert.equal(adapter.getCellText(12, "messageId"), "message13@invalid"); // 2023-02-19
    Assert.equal(adapter.getCellText(13, "messageId"), "message1@invalid"); // 2013-09-15
    Assert.equal(subjectAt(14), "Reduced directional secured line");

    adapter.toggleOpenState(0);
    tree.assertRowCountChanged(1, -5);
    tree.assertInvalidated(0, 0);
    Assert.equal(adapter.rowCount, 10);

    // A message inside an open group.

    const added1 = addMessage({
      subject: "Organized 3rd generation alliance",
      messageId: "added1@invalid",
    });
    tree.assertRowCountChanged(6, 1);
    Assert.equal(adapter.rowCount, 11);
    Assert.equal(subjectAt(6), "Organized 3rd generation alliance");
    Assert.equal(adapter.getCellText(7, "messageId"), "added1@invalid"); // Now
    Assert.equal(adapter.getCellText(8, "messageId"), "message13@invalid"); // 2023-02-19
    Assert.equal(adapter.getCellText(9, "messageId"), "message1@invalid"); // 2013-09-15

    // A message inside a closed group.

    const added2 = addMessage({
      subject: "Automated uniform internet solution",
      messageId: "added2@invalid",
    });
    tree.assertInvalidated(0, 0);
    Assert.equal(adapter.rowCount, 11);

    // A message inside a subject group that doesn't yet exist.

    const added3 = addMessage({
      subject: "Multi-layered dynamic policy",
      messageId: "added3@invalid",
    });
    tree.assertRowCountChanged(4, 1);
    Assert.equal(adapter.rowCount, 12);
    Assert.equal(
      adapter.getCellText(4, "subject"),
      "Multi-layered dynamic policy"
    );

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(8, -1);
    Assert.equal(adapter.rowCount, 11);

    messageDB.removeMessage(added2);
    tree.assertInvalidated(0, 0);
    Assert.equal(adapter.rowCount, 11);

    messageDB.removeMessage(added3);
    tree.assertRowCountChanged(4, -1);
    Assert.equal(adapter.rowCount, 10);
  } finally {
    adapter.setTree(null);
  }
});
