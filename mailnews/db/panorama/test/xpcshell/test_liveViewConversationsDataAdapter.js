/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the live view adapter for displaying conversations. It only
 * displays one row per conversation, and the rows can't be expanded.
 * Ordering is only allowed by date (ascending or descending).
 */

const { LiveViewConversationsDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/LiveViewDataAdapter.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

const tree = new ListenerTree();

add_setup(async function () {
  await installDBFromFile("db/conversations.sql");
});

/**
 * Tests LiveViewConversationsDataAdapter, when sorted by date, descending.
 */
add_task(async function testDateDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewConversationsDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.ok(!adapter.isContainer(0));
    Assert.equal(adapter.rowAt(0).messageCount, 1);
    Assert.equal(adapter.getCellText(0, "threadId"), "10");
    Assert.ok(!adapter.isContainer(1));
    Assert.equal(adapter.rowAt(1).messageCount, 1);
    Assert.equal(adapter.getCellText(1, "threadId"), "9");
    Assert.ok(!adapter.isContainer(2));
    Assert.equal(adapter.rowAt(2).messageCount, 1);
    Assert.equal(adapter.getCellText(2, "threadId"), "8");
    Assert.ok(!adapter.isContainer(3));
    Assert.equal(adapter.rowAt(3).messageCount, 3);
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    Assert.ok(!adapter.isContainer(4));
    Assert.equal(adapter.rowAt(4).messageCount, 3);
    Assert.equal(adapter.getCellText(4, "threadId"), "7");
    Assert.ok(!adapter.isContainer(5));
    Assert.equal(adapter.rowAt(5).messageCount, 1);
    Assert.equal(adapter.getCellText(5, "threadId"), "1");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test what happens when messages are added or removed.
 */
add_task(async function testAddRemoveDateDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewConversationsDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);

    // Add a message to a thread.

    Assert.equal(adapter.rowAt(3).messageCount, 3);
    Assert.equal(adapter.getCellText(3, "threadId"), 3);

    const added1 = addMessage({
      messageId: "added1@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added1, 11);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 6);
    Assert.ok(!adapter.isContainer(3));
    Assert.equal(adapter.rowAt(3).messageCount, 4);

    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);
    Assert.equal(adapter.getCellText(3, "threadId"), 3);

    // Add a message to a non-thread.

    Assert.equal(adapter.rowAt(1).messageCount, 1);
    Assert.equal(adapter.getCellText(1, "threadId"), 9);

    const added4 = addMessage({
      messageId: "added4@invalid",
      references: ["message9@invalid"],
    });
    Assert.equal(added4, 12);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 6);
    Assert.ok(!adapter.isContainer(1));
    Assert.equal(adapter.rowAt(1).messageCount, 2);

    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);
    Assert.equal(adapter.getCellText(1, "threadId"), 9);

    // Add a message that isn't part of a thread, at the start.

    const added5 = addMessage({
      messageId: "added5@invalid",
      date: "2026-03-03",
    });
    Assert.equal(added5, 13);
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 7);
    Assert.ok(!adapter.isContainer(0));
    Assert.equal(adapter.rowAt(0).messageCount, 1);

    Assert.deepEqual(listMessages(adapter), [13, 10, 9, 8, 6, 4, 1]);
    Assert.equal(adapter.getCellText(0, "threadId"), 13);

    // Add another message that isn't part of a thread, in the middle.

    const added6 = addMessage({
      messageId: "added6@invalid",
      date: "2025-09-07",
    });
    Assert.equal(added6, 14);
    tree.assertRowCountChanged(4, 1);
    Assert.equal(adapter.rowCount, 8);
    Assert.ok(!adapter.isContainer(4));
    Assert.equal(adapter.rowAt(4).messageCount, 1);

    Assert.deepEqual(listMessages(adapter), [13, 10, 9, 8, 14, 6, 4, 1]);
    Assert.equal(adapter.getCellText(4, "threadId"), 14);

    // Add another message that isn't part of a thread, at the end.

    const added7 = addMessage({
      messageId: "added7@invalid",
      date: "1998-03-03",
    });
    Assert.equal(added7, 15);
    tree.assertRowCountChanged(8, 1);
    Assert.equal(adapter.rowCount, 9);
    Assert.ok(!adapter.isContainer(8));
    Assert.equal(adapter.rowAt(8).messageCount, 1);

    Assert.deepEqual(listMessages(adapter), [13, 10, 9, 8, 14, 6, 4, 1, 15]);
    Assert.equal(adapter.getCellText(8, "threadId"), 15);

    // Remove the messages in the order they were added.

    messageDB.removeMessage(added1);
    tree.assertInvalidated(5, 5);
    Assert.ok(!adapter.isContainer(5));
    Assert.equal(adapter.rowAt(5).messageCount, 3);
    Assert.deepEqual(listMessages(adapter), [13, 10, 9, 8, 14, 6, 4, 1, 15]);

    messageDB.removeMessage(added4);
    tree.assertInvalidated(2, 2);
    Assert.ok(!adapter.isContainer(2));
    Assert.equal(adapter.rowAt(2).messageCount, 1);
    Assert.deepEqual(listMessages(adapter), [13, 10, 9, 8, 14, 6, 4, 1, 15]);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(0, -1);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 14, 6, 4, 1, 15]);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(3, -1);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1, 15]);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Tests LiveViewConversationsDataAdapter, when sorted by date, ascending.
 */
add_task(async function testDateAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewConversationsDataAdapter(liveView);
  adapter.sortBy("date", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.ok(!adapter.isContainer(0));
    Assert.equal(adapter.rowAt(0).messageCount, 1);
    Assert.equal(adapter.getCellText(0, "threadId"), "1");
    Assert.ok(!adapter.isContainer(1));
    Assert.equal(adapter.rowAt(1).messageCount, 3);
    Assert.equal(adapter.getCellText(1, "threadId"), "7");
    Assert.ok(!adapter.isContainer(2));
    Assert.equal(adapter.rowAt(2).messageCount, 3);
    Assert.equal(adapter.getCellText(2, "threadId"), "3");
    Assert.ok(!adapter.isContainer(3));
    Assert.equal(adapter.rowAt(3).messageCount, 1);
    Assert.equal(adapter.getCellText(3, "threadId"), "8");
    Assert.ok(!adapter.isContainer(4));
    Assert.equal(adapter.rowAt(4).messageCount, 1);
    Assert.equal(adapter.getCellText(4, "threadId"), "9");
    Assert.ok(!adapter.isContainer(5));
    Assert.equal(adapter.rowAt(5).messageCount, 1);
    Assert.equal(adapter.getCellText(5, "threadId"), "10");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test what happens when messages are added or removed.
 */
add_task(async function testAddRemoveDateAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewConversationsDataAdapter(liveView);
  adapter.sortBy("date", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);

    // Add a message to a thread.

    Assert.equal(adapter.rowAt(2).messageCount, 3);
    Assert.equal(adapter.getCellText(2, "threadId"), 3);

    const added1 = addMessage({
      messageId: "added1@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added1, 11);
    tree.assertInvalidated(2, 2);
    Assert.equal(adapter.rowCount, 6);
    Assert.ok(!adapter.isContainer(2));
    Assert.equal(adapter.rowAt(2).messageCount, 4);

    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);
    Assert.equal(adapter.getCellText(2, "threadId"), 3);

    // Add a message to a non-thread.

    Assert.equal(adapter.rowAt(4).messageCount, 1);
    Assert.equal(adapter.getCellText(4, "threadId"), 9);

    const added4 = addMessage({
      messageId: "added4@invalid",
      references: ["message9@invalid"],
    });
    Assert.equal(added4, 12);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 6);
    Assert.ok(!adapter.isContainer(4));
    Assert.equal(adapter.rowAt(4).messageCount, 2);

    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);
    Assert.equal(adapter.getCellText(4, "threadId"), 9);

    // Add a message that isn't part of a thread, at the end.

    const added5 = addMessage({
      messageId: "added5@invalid",
      date: "2026-03-03",
    });
    Assert.equal(added5, 13);
    tree.assertRowCountChanged(6, 1);
    Assert.equal(adapter.rowCount, 7);
    Assert.ok(!adapter.isContainer(6));
    Assert.equal(adapter.rowAt(6).messageCount, 1);

    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10, 13]);
    Assert.equal(adapter.getCellText(6, "threadId"), 13);

    // Add another message that isn't part of a thread, in the middle.

    const added6 = addMessage({
      messageId: "added6@invalid",
      date: "2025-09-07",
    });
    Assert.equal(added6, 14);
    tree.assertRowCountChanged(3, 1);
    Assert.equal(adapter.rowCount, 8);
    Assert.ok(!adapter.isContainer(3));
    Assert.equal(adapter.rowAt(3).messageCount, 1);

    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 14, 8, 9, 10, 13]);
    Assert.equal(adapter.getCellText(3, "threadId"), 14);

    // Add another message that isn't part of a thread, at the start.

    const added7 = addMessage({
      messageId: "added7@invalid",
      date: "1998-03-03",
    });
    Assert.equal(added7, 15);
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 9);
    Assert.ok(!adapter.isContainer(0));
    Assert.equal(adapter.rowAt(0).messageCount, 1);

    Assert.deepEqual(listMessages(adapter), [15, 1, 4, 6, 14, 8, 9, 10, 13]);
    Assert.equal(adapter.getCellText(0, "threadId"), 15);

    // Remove the messages in the order they were added.

    messageDB.removeMessage(added1);
    tree.assertInvalidated(3, 3);
    Assert.ok(!adapter.isContainer(3));
    Assert.equal(adapter.rowAt(3).messageCount, 3);
    Assert.deepEqual(listMessages(adapter), [15, 1, 4, 6, 14, 8, 9, 10, 13]);

    messageDB.removeMessage(added4);
    tree.assertInvalidated(6, 6);
    Assert.ok(!adapter.isContainer(6));
    Assert.equal(adapter.rowAt(6).messageCount, 1);
    Assert.deepEqual(listMessages(adapter), [15, 1, 4, 6, 14, 8, 9, 10, 13]);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(8, -1);
    Assert.deepEqual(listMessages(adapter), [15, 1, 4, 6, 14, 8, 9, 10]);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(4, -1);
    Assert.deepEqual(listMessages(adapter), [15, 1, 4, 6, 8, 9, 10]);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(0, -1);
    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test that only sort by date is allowed.
 */
add_task(async function testSortColumn() {
  const liveView = new LiveView();
  const adapter = new LiveViewConversationsDataAdapter(liveView);

  try {
    await adapter.sortBy("subject", "descending");
    Assert.equal(adapter.sortColumn, "date");
    Assert.equal(adapter.sortDirection, "descending");

    await adapter.sortBy("subject", "ascending");
    Assert.equal(adapter.sortColumn, "date");
    Assert.equal(adapter.sortDirection, "ascending");

    await adapter.sortBy("sender", "ascending");
    Assert.equal(adapter.sortColumn, "date");
    Assert.equal(adapter.sortDirection, "ascending");

    await adapter.sortBy("flagged", "descending");
    Assert.equal(adapter.sortColumn, "date");
    Assert.equal(adapter.sortDirection, "descending");

    await adapter.sortBy();
    Assert.equal(adapter.sortColumn, "date");
    Assert.equal(adapter.sortDirection, "descending");
  } finally {
    adapter.setTree(null);
  }
});
