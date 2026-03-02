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

const tree = new ListenerTree();

add_setup(async function () {
  await installDBFromFile("db/conversations.sql");
});

/**
 * Tests LiveViewThreadedDataAdapter, with all of the messages available for
 * all threads.
 */
add_task(async function testDateDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

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
    tree.assertRowCountChanged(4, 2);
    tree.assertInvalidated(3, 3);
    await tree.promiseInvalidated(3, 5);
    Assert.equal(adapter.rowCount, 8);
    // Row 3 is no longer the newest message in thread 3, it's the oldest.
    Assert.equal(adapter.getCellText(3, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    // And the following rows are the rest of the thread, in ascending order.
    Assert.equal(adapter.getCellText(4, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");
    Assert.equal(adapter.getCellText(5, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "3");
    // The next thread is in the right place.
    Assert.equal(adapter.getCellText(6, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "7");

    // Open thread with ID 7, which is at row 6.
    adapter.toggleOpenState(6);
    tree.assertRowCountChanged(7, 2);
    tree.assertInvalidated(6, 6);
    await tree.promiseInvalidated(6, 8);
    Assert.equal(adapter.rowCount, 10);
    // Row 6 is no longer the newest message in thread 7, it's the oldest.
    Assert.equal(adapter.getCellText(6, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "7");
    // And the following rows are the rest of the thread, in ascending order.
    Assert.equal(adapter.getCellText(7, "messageId"), "message2@invalid");
    Assert.equal(adapter.getCellText(7, "threadId"), "7");
    Assert.equal(adapter.getCellText(8, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(8, "threadId"), "7");
    // The next thread is in the right place.
    Assert.equal(adapter.getCellText(9, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(9, "threadId"), "1");

    // Close thread with ID 3, which is at row 3.
    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, -2);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 8);
    // Row 3 is the newest message in thread 3 again.
    Assert.equal(adapter.rowAt(3).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    // The next thread is in the right place.
    Assert.equal(adapter.getCellText(4, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "7");
    Assert.equal(adapter.getCellText(5, "messageId"), "message2@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "7");
    Assert.equal(adapter.getCellText(6, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "7");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Tests the threaded view, but only in a single folder so parts of a thread
 * are missing.
 */
add_task(async function testPartialThread() {
  const liveView = new LiveView();
  liveView.initWithFolder(folderDB.getFolderByPath("server1/folderB"));
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 1);

  try {
    Assert.equal(adapter.rowCount, 2);
    Assert.equal(adapter.getCellText(0, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(1, "messageId"), "message4@invalid");

    adapter.toggleOpenState(0);
    tree.assertRowCountChanged(1, 2);
    tree.assertInvalidated(0, 0);
    await tree.promiseInvalidated(0, 2);
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

/**
 * Test what happens when messages are added or removed.
 */
add_task(async function testAddRemoveDateDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);

    // Add a message to a collapsed thread.

    Assert.equal(adapter.rowAt(3).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "threadId"), "3");

    const added1 = addMessage({
      messageId: "added1@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added1, 11);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(3).rowCount, 3);

    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);
    Assert.equal(adapter.getCellText(3, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, 3);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 9);
    await tree.promiseInvalidated(3, 6);
    Assert.equal(adapter.getCellText(3, "messageId"), "added1@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    Assert.equal(adapter.getCellText(4, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(5, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(6, "messageId"), "message6@invalid");

    // Add a message to an expanded thread.

    const added2 = addMessage({
      messageId: "added2@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added2, 12);
    tree.assertRowCountChanged(3, 1);
    Assert.equal(adapter.rowCount, 10);
    Assert.equal(adapter.rowAt(3).rowCount, 4);

    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 11, 3, 5, 6, 12, 4, 1]);
    Assert.equal(adapter.getCellText(3, "messageId"), "added1@invalid");
    Assert.equal(adapter.getCellText(4, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(5, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(6, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(7, "messageId"), "added2@invalid");
    Assert.equal(adapter.getCellText(7, "threadId"), "3");

    // Collapse the thread.

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, -4);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 6);

    // Add a message to a collapsed thread that has been expanded before.

    const added3 = addMessage({
      messageId: "added3@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added3, 13);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(3).rowCount, 5);

    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);
    Assert.equal(adapter.getCellText(3, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, 5);
    tree.assertInvalidated(3, 3);
    Assert.equal(adapter.rowCount, 11);

    Assert.deepEqual(
      listMessages(adapter),
      [10, 9, 8, 11, 3, 5, 6, 12, 13, 4, 1]
    );

    // Add a message to a non-thread.

    Assert.equal(adapter.rowAt(1).rowCount, 0);
    Assert.equal(adapter.getCellText(1, "threadId"), "9");

    const added4 = addMessage({
      messageId: "added4@invalid",
      references: ["message9@invalid"],
    });
    Assert.equal(added4, 14);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 11);
    Assert.ok(!adapter.rowAt(1).open);
    Assert.equal(adapter.rowAt(1).rowCount, 1);

    Assert.deepEqual(
      listMessages(adapter),
      [10, 9, 8, 11, 3, 5, 6, 12, 13, 4, 1]
    );
    Assert.equal(adapter.getCellText(1, "messageId"), "message9@invalid");

    // Open the thread.

    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, 1);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 12);
    await tree.promiseInvalidated(1, 2);

    Assert.deepEqual(
      listMessages(adapter),
      [10, 14, 9, 8, 11, 3, 5, 6, 12, 13, 4, 1]
    );
    Assert.equal(adapter.getCellText(1, "messageId"), "added4@invalid");
    Assert.equal(adapter.getCellText(2, "messageId"), "message9@invalid");

    // Add a message that isn't part of a thread, at the start.

    const added5 = addMessage({
      messageId: "added5@invalid",
      date: "2026-03-03",
    });
    Assert.equal(added5, 15);
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 13);

    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 11, 3, 5, 6, 12, 13, 4, 1]
    );
    Assert.equal(adapter.getCellText(0, "messageId"), "added5@invalid");

    // Add another message that isn't part of a thread, in the middle.

    const added6 = addMessage({
      messageId: "added6@invalid",
      date: "2025-09-07",
    });
    Assert.equal(added6, 16);
    tree.assertRowCountChanged(5, 1);
    Assert.equal(adapter.rowCount, 14);

    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 16, 11, 3, 5, 6, 12, 13, 4, 1]
    );
    Assert.equal(adapter.getCellText(5, "messageId"), "added6@invalid");

    // Add another message that isn't part of a thread, at the end.

    const added7 = addMessage({
      messageId: "added7@invalid",
      date: "1998-03-03",
    });
    Assert.equal(added7, 17);
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 15);

    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 16, 11, 3, 5, 6, 12, 13, 4, 1, 17]
    );
    Assert.equal(adapter.getCellText(14, "messageId"), "added7@invalid");

    // Remove the messages in the order they were added.

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 16, 3, 5, 6, 12, 13, 4, 1, 17]
    );

    messageDB.removeMessage(added2);
    tree.assertRowCountChanged(9, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 16, 3, 5, 6, 13, 4, 1, 17]
    );

    adapter.toggleOpenState(6);
    tree.assertRowCountChanged(7, -3);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 16, 6, 4, 1, 17]
    );

    messageDB.removeMessage(added3);
    tree.assertInvalidated(6, 6);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 10, 14, 9, 8, 16, 6, 4, 1, 17]
    );

    messageDB.removeMessage(added4);
    tree.assertRowCountChanged(2, -1);
    Assert.deepEqual(listMessages(adapter), [15, 10, 9, 8, 16, 6, 4, 1, 17]);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(0, -1);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 16, 6, 4, 1, 17]);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(3, -1);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1, 17]);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(listMessages(adapter), [10, 9, 8, 6, 4, 1]);
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Tests LiveViewThreadedDataAdapter, when sorted by date, ascending.
 */
add_task(async function testDateAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(0).rowCount, 0);
    Assert.equal(adapter.getCellText(0, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(0, "threadId"), "1");
    Assert.equal(adapter.rowAt(1).rowCount, 2);
    Assert.equal(adapter.getCellText(1, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(1, "threadId"), "7");
    Assert.equal(adapter.rowAt(2).rowCount, 2);
    Assert.equal(adapter.getCellText(2, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "3");
    Assert.equal(adapter.rowAt(3).rowCount, 0);
    Assert.equal(adapter.getCellText(3, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "8");
    Assert.equal(adapter.rowAt(4).rowCount, 0);
    Assert.equal(adapter.getCellText(4, "messageId"), "message9@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "9");
    Assert.equal(adapter.rowAt(5).rowCount, 0);
    Assert.equal(adapter.getCellText(5, "messageId"), "message10@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "10");

    // Open thread with ID 3, which is at row 2.
    adapter.toggleOpenState(2);
    tree.assertRowCountChanged(3, 2);
    tree.assertInvalidated(2, 2);
    await tree.promiseInvalidated(2, 4);
    Assert.equal(adapter.rowCount, 8);
    // Row 2 is no longer the newest message in thread 3, it's the oldest.
    Assert.equal(adapter.getCellText(2, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "3");
    // And the following rows are the rest of the thread, in ascending order.
    Assert.equal(adapter.getCellText(3, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "3");
    Assert.equal(adapter.getCellText(4, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");
    // The next thread is in the right place.
    Assert.equal(adapter.getCellText(5, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "8");

    // Open thread with ID 7, which is at row 1.
    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, 2);
    tree.assertInvalidated(1, 1);
    await tree.promiseInvalidated(1, 3);
    Assert.equal(adapter.rowCount, 10);
    // Row 1 is no longer the newest message in thread 7, it's the oldest.
    Assert.equal(adapter.getCellText(1, "messageId"), "message7@invalid");
    Assert.equal(adapter.getCellText(1, "threadId"), "7");
    // And the following rows are the rest of the thread, in ascending order.
    Assert.equal(adapter.getCellText(2, "messageId"), "message2@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "7");
    Assert.equal(adapter.getCellText(3, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "7");
    // The next thread is in the right place.
    Assert.equal(adapter.getCellText(4, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");

    // Close thread with ID 3, which is at row 4.
    adapter.toggleOpenState(4);
    tree.assertRowCountChanged(5, -2);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 8);
    // Row 4 is the newest message in thread 3 again.
    Assert.equal(adapter.rowAt(4).rowCount, 2);
    Assert.equal(adapter.getCellText(4, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");
    // The next thread is in the right place.
    Assert.equal(adapter.getCellText(5, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "8");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test what happens when messages are added or removed.
 */
add_task(async function testAddRemoveDateAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("date", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);

    // Add a message to a collapsed thread.

    Assert.equal(adapter.rowAt(2).rowCount, 2);
    Assert.equal(adapter.getCellText(2, "threadId"), "3");

    const added1 = addMessage({
      messageId: "added1@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added1, 11);
    tree.assertInvalidated(2, 2);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(2).rowCount, 3);

    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);
    Assert.equal(adapter.getCellText(2, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(2);
    tree.assertRowCountChanged(3, 3);
    tree.assertInvalidated(2, 2);
    Assert.equal(adapter.rowCount, 9);
    await tree.promiseInvalidated(2, 5);
    Assert.equal(adapter.getCellText(2, "messageId"), "added1@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "3");
    Assert.equal(adapter.getCellText(3, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(4, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(5, "messageId"), "message6@invalid");

    // Add a message to an expanded thread.

    const added2 = addMessage({
      messageId: "added2@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added2, 12);
    tree.assertRowCountChanged(2, 1);
    Assert.equal(adapter.rowCount, 10);
    Assert.equal(adapter.rowAt(2).rowCount, 4);

    Assert.deepEqual(listMessages(adapter), [1, 4, 11, 3, 5, 6, 12, 8, 9, 10]);
    Assert.equal(adapter.getCellText(2, "messageId"), "added1@invalid");
    Assert.equal(adapter.getCellText(3, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(4, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(5, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(6, "messageId"), "added2@invalid");
    Assert.equal(adapter.getCellText(6, "threadId"), "3");

    // Collapse the thread.

    adapter.toggleOpenState(2);
    tree.assertRowCountChanged(3, -4);
    tree.assertInvalidated(2, 2);
    Assert.equal(adapter.rowCount, 6);

    // Add a message to a collapsed thread that has been expanded before.

    const added3 = addMessage({
      messageId: "added3@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added3, 13);
    tree.assertInvalidated(2, 2);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(2).rowCount, 5);

    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);
    Assert.equal(adapter.getCellText(2, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(2);
    tree.assertRowCountChanged(3, 5);
    tree.assertInvalidated(2, 2);
    Assert.equal(adapter.rowCount, 11);

    Assert.deepEqual(
      listMessages(adapter),
      [1, 4, 11, 3, 5, 6, 12, 13, 8, 9, 10]
    );

    // Add a message to a non-thread.

    Assert.equal(adapter.rowAt(9).rowCount, 0);
    Assert.equal(adapter.getCellText(9, "threadId"), "9");

    const added4 = addMessage({
      messageId: "added4@invalid",
      references: ["message9@invalid"],
    });
    Assert.equal(added4, 14);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 11);
    Assert.ok(!adapter.rowAt(9).open);
    Assert.equal(adapter.rowAt(9).rowCount, 1);

    Assert.deepEqual(
      listMessages(adapter),
      [1, 4, 11, 3, 5, 6, 12, 13, 8, 9, 10]
    );
    Assert.equal(adapter.getCellText(9, "messageId"), "message9@invalid");

    // Open the thread.

    adapter.toggleOpenState(9);
    tree.assertRowCountChanged(10, 1);
    tree.assertInvalidated(9, 9);
    Assert.equal(adapter.rowCount, 12);
    await tree.promiseInvalidated(9, 10);

    Assert.deepEqual(
      listMessages(adapter),
      [1, 4, 11, 3, 5, 6, 12, 13, 8, 14, 9, 10]
    );
    Assert.equal(adapter.getCellText(9, "messageId"), "added4@invalid");
    Assert.equal(adapter.getCellText(10, "messageId"), "message9@invalid");

    // Add a message that isn't part of a thread, at the end.

    const added5 = addMessage({
      messageId: "added5@invalid",
      date: "2026-03-03",
    });
    Assert.equal(added5, 15);
    tree.assertRowCountChanged(12, 1);
    Assert.equal(adapter.rowCount, 13);

    Assert.deepEqual(
      listMessages(adapter),
      [1, 4, 11, 3, 5, 6, 12, 13, 8, 14, 9, 10, 15]
    );
    Assert.equal(adapter.getCellText(12, "messageId"), "added5@invalid");

    // Add another message that isn't part of a thread, in the middle.

    const added6 = addMessage({
      messageId: "added6@invalid",
      date: "2025-09-07",
    });
    Assert.equal(added6, 16);
    tree.assertRowCountChanged(8, 1);
    Assert.equal(adapter.rowCount, 14);

    Assert.deepEqual(
      listMessages(adapter),
      [1, 4, 11, 3, 5, 6, 12, 13, 16, 8, 14, 9, 10, 15]
    );
    Assert.equal(adapter.getCellText(8, "messageId"), "added6@invalid");

    // Add another message that isn't part of a thread, at the start.

    const added7 = addMessage({
      messageId: "added7@invalid",
      date: "1998-03-03",
    });
    Assert.equal(added7, 17);
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 15);

    Assert.deepEqual(
      listMessages(adapter),
      [17, 1, 4, 11, 3, 5, 6, 12, 13, 16, 8, 14, 9, 10, 15]
    );
    Assert.equal(adapter.getCellText(0, "messageId"), "added7@invalid");

    // Remove the messages in the order they were added.

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(3, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 1, 4, 3, 5, 6, 12, 13, 16, 8, 14, 9, 10, 15]
    );

    messageDB.removeMessage(added2);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 1, 4, 3, 5, 6, 13, 16, 8, 14, 9, 10, 15]
    );

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, -3);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 1, 4, 6, 16, 8, 14, 9, 10, 15]
    );

    messageDB.removeMessage(added3);
    tree.assertInvalidated(3, 3);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 1, 4, 6, 16, 8, 14, 9, 10, 15]
    );

    messageDB.removeMessage(added4);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(listMessages(adapter), [17, 1, 4, 6, 16, 8, 9, 10, 15]);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(8, -1);
    Assert.deepEqual(listMessages(adapter), [17, 1, 4, 6, 16, 8, 9, 10]);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(4, -1);
    Assert.deepEqual(listMessages(adapter), [17, 1, 4, 6, 8, 9, 10]);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(0, -1);
    Assert.deepEqual(listMessages(adapter), [1, 4, 6, 8, 9, 10]);
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Tests LiveViewThreadedDataAdapter, when sorted by subject, descending.
 */
add_task(async function testSubjectDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("subject", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(0).rowCount, 0);
    Assert.equal(adapter.getCellText(0, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(0, "threadId"), "8");
    Assert.equal(adapter.rowAt(1).rowCount, 2);
    Assert.equal(adapter.getCellText(1, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(1, "threadId"), "3");
    Assert.equal(adapter.rowAt(2).rowCount, 2);
    Assert.equal(adapter.getCellText(2, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "7");
    Assert.equal(adapter.rowAt(3).rowCount, 0);
    Assert.equal(adapter.getCellText(3, "messageId"), "message10@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "10");
    Assert.equal(adapter.rowAt(4).rowCount, 0);
    Assert.equal(adapter.getCellText(4, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "1");
    Assert.equal(adapter.rowAt(5).rowCount, 0);
    Assert.equal(adapter.getCellText(5, "messageId"), "message9@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "9");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test what happens when messages are added or removed.
 */
add_task(async function testAddRemoveSubjectDescending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("subject", "descending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.deepEqual(listMessages(adapter), [8, 6, 4, 10, 1, 9]);

    // Add a message to a collapsed thread.

    Assert.equal(adapter.rowAt(1).rowCount, 2);
    Assert.equal(adapter.getCellText(1, "threadId"), "3");

    const added1 = addMessage({
      messageId: "added1@invalid",
      subject: "It really doesn't matter",
      references: ["message3@invalid"],
    });
    Assert.equal(added1, 11);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(1).rowCount, 3);

    Assert.deepEqual(listMessages(adapter), [8, 6, 4, 10, 1, 9]);
    Assert.equal(adapter.getCellText(1, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, 3);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 9);
    await tree.promiseInvalidated(1, 4);
    Assert.equal(adapter.getCellText(1, "messageId"), "added1@invalid");
    Assert.equal(adapter.getCellText(1, "threadId"), "3");
    Assert.equal(adapter.getCellText(2, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(3, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(4, "messageId"), "message6@invalid");

    // Add a message to an expanded thread.

    const added2 = addMessage({
      messageId: "added2@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added2, 12);
    tree.assertRowCountChanged(1, 1);
    Assert.equal(adapter.rowCount, 10);
    Assert.equal(adapter.rowAt(1).rowCount, 4);

    Assert.deepEqual(listMessages(adapter), [8, 11, 3, 5, 6, 12, 4, 10, 1, 9]);

    // Collapse the thread.

    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, -4);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 6);

    // Add a message to a collapsed thread that has been expanded before.

    const added3 = addMessage({
      messageId: "added3@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added3, 13);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(1).rowCount, 5);

    Assert.deepEqual(listMessages(adapter), [8, 6, 4, 10, 1, 9]);
    Assert.equal(adapter.getCellText(1, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(1);
    tree.assertRowCountChanged(2, 5);
    tree.assertInvalidated(1, 1);
    Assert.equal(adapter.rowCount, 11);

    Assert.deepEqual(
      listMessages(adapter),
      [8, 11, 3, 5, 6, 12, 13, 4, 10, 1, 9]
    );

    // Add a message to a non-thread.

    Assert.equal(adapter.rowAt(10).rowCount, 0);
    Assert.equal(adapter.getCellText(10, "threadId"), "9");

    const added4 = addMessage({
      messageId: "added4@invalid",
      references: ["message9@invalid"],
    });
    Assert.equal(added4, 14);
    tree.assertInvalidated(10, 10);
    Assert.equal(adapter.rowCount, 11);
    Assert.ok(!adapter.rowAt(10).open);
    Assert.equal(adapter.rowAt(10).rowCount, 1);

    Assert.deepEqual(
      listMessages(adapter),
      [8, 11, 3, 5, 6, 12, 13, 4, 10, 1, 9]
    );
    Assert.equal(adapter.getCellText(10, "messageId"), "message9@invalid");

    // Open the thread.

    adapter.toggleOpenState(10);
    tree.assertRowCountChanged(11, 1);
    tree.assertInvalidated(10, 10);
    Assert.equal(adapter.rowCount, 12);
    await tree.promiseInvalidated(10, 11);

    Assert.deepEqual(
      listMessages(adapter),
      [8, 11, 3, 5, 6, 12, 13, 4, 10, 1, 14, 9]
    );
    Assert.equal(adapter.getCellText(10, "messageId"), "added4@invalid");
    Assert.equal(adapter.getCellText(11, "messageId"), "message9@invalid");

    // Add a message that isn't part of a thread, at the start.

    const added5 = addMessage({
      messageId: "added5@invalid",
      subject: "Team-oriented context-sensitive monitoring",
      date: "2026-03-03",
    });
    Assert.equal(added5, 15);
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 13);

    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 11, 3, 5, 6, 12, 13, 4, 10, 1, 14, 9]
    );
    Assert.equal(adapter.getCellText(0, "messageId"), "added5@invalid");

    // Add another message that isn't part of a thread, in the middle.

    const added6 = addMessage({
      messageId: "added6@invalid",
      subject: "Networked even-keeled application",
      date: "2025-09-07",
    });
    Assert.equal(added6, 16);
    tree.assertRowCountChanged(2, 1);
    Assert.equal(adapter.rowCount, 14);

    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 16, 11, 3, 5, 6, 12, 13, 4, 10, 1, 14, 9]
    );
    Assert.equal(adapter.getCellText(2, "messageId"), "added6@invalid");

    // Add another message that isn't part of a thread, at the end.

    const added7 = addMessage({
      messageId: "added7@invalid",
      subject: "Cross-platform tertiary open architecture",
      date: "1998-03-03",
    });
    Assert.equal(added7, 17);
    tree.assertRowCountChanged(14, 1);
    Assert.equal(adapter.rowCount, 15);

    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 16, 11, 3, 5, 6, 12, 13, 4, 10, 1, 14, 9, 17]
    );
    Assert.equal(adapter.getCellText(14, "messageId"), "added7@invalid");

    // Remove the messages in the order they were added.

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(3, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 16, 3, 5, 6, 12, 13, 4, 10, 1, 14, 9, 17]
    );

    messageDB.removeMessage(added2);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 16, 3, 5, 6, 13, 4, 10, 1, 14, 9, 17]
    );

    adapter.toggleOpenState(3);
    tree.assertRowCountChanged(4, -3);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 16, 6, 4, 10, 1, 14, 9, 17]
    );

    messageDB.removeMessage(added3);
    tree.assertInvalidated(3, 3);
    Assert.deepEqual(
      listMessages(adapter),
      [15, 8, 16, 6, 4, 10, 1, 14, 9, 17]
    );

    messageDB.removeMessage(added4);
    tree.assertRowCountChanged(7, -1);
    Assert.deepEqual(listMessages(adapter), [15, 8, 16, 6, 4, 10, 1, 9, 17]);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(0, -1);
    Assert.deepEqual(listMessages(adapter), [8, 16, 6, 4, 10, 1, 9, 17]);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(1, -1);
    Assert.deepEqual(listMessages(adapter), [8, 6, 4, 10, 1, 9, 17]);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(listMessages(adapter), [8, 6, 4, 10, 1, 9]);
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Tests LiveViewThreadedDataAdapter, when sorted by subject, ascending.
 */
add_task(async function testSubjectAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("subject", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(0).rowCount, 0);
    Assert.equal(adapter.getCellText(0, "messageId"), "message9@invalid");
    Assert.equal(adapter.getCellText(0, "threadId"), "9");
    Assert.equal(adapter.rowAt(1).rowCount, 0);
    Assert.equal(adapter.getCellText(1, "messageId"), "message1@invalid");
    Assert.equal(adapter.getCellText(1, "threadId"), "1");
    Assert.equal(adapter.rowAt(2).rowCount, 0);
    Assert.equal(adapter.getCellText(2, "messageId"), "message10@invalid");
    Assert.equal(adapter.getCellText(2, "threadId"), "10");
    Assert.equal(adapter.rowAt(3).rowCount, 2);
    Assert.equal(adapter.getCellText(3, "messageId"), "message4@invalid");
    Assert.equal(adapter.getCellText(3, "threadId"), "7");
    Assert.equal(adapter.rowAt(4).rowCount, 2);
    Assert.equal(adapter.getCellText(4, "messageId"), "message6@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");
    Assert.equal(adapter.rowAt(5).rowCount, 0);
    Assert.equal(adapter.getCellText(5, "messageId"), "message8@invalid");
    Assert.equal(adapter.getCellText(5, "threadId"), "8");
  } finally {
    adapter.setTree(null);
  }
});

/**
 * Test what happens when messages are added or removed.
 */
add_task(async function testAddRemoveSubjectAscending() {
  const liveView = new LiveView();
  const adapter = new LiveViewThreadedDataAdapter(liveView);
  adapter.sortBy("subject", "ascending");
  adapter.setTree(tree);
  await tree.promiseInvalidated(0, 5);

  try {
    Assert.equal(adapter.rowCount, 6);
    Assert.deepEqual(listMessages(adapter), [9, 1, 10, 4, 6, 8]);

    // Add a message to a collapsed thread.

    Assert.equal(adapter.rowAt(4).rowCount, 2);
    Assert.equal(adapter.getCellText(4, "threadId"), "3");

    const added1 = addMessage({
      messageId: "added1@invalid",
      subject: "It really doesn't matter",
      references: ["message3@invalid"],
    });
    Assert.equal(added1, 11);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(4).rowCount, 3);

    Assert.deepEqual(listMessages(adapter), [9, 1, 10, 4, 6, 8]);
    Assert.equal(adapter.getCellText(4, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(4);
    tree.assertRowCountChanged(5, 3);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 9);
    await tree.promiseInvalidated(4, 7);
    Assert.equal(adapter.getCellText(4, "messageId"), "added1@invalid");
    Assert.equal(adapter.getCellText(4, "threadId"), "3");
    Assert.equal(adapter.getCellText(5, "messageId"), "message3@invalid");
    Assert.equal(adapter.getCellText(6, "messageId"), "message5@invalid");
    Assert.equal(adapter.getCellText(7, "messageId"), "message6@invalid");

    // Add a message to an expanded thread.

    const added2 = addMessage({
      messageId: "added2@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added2, 12);
    tree.assertRowCountChanged(4, 1);
    Assert.equal(adapter.rowCount, 10);
    Assert.equal(adapter.rowAt(4).rowCount, 4);

    Assert.deepEqual(listMessages(adapter), [9, 1, 10, 4, 11, 3, 5, 6, 12, 8]);

    // Collapse the thread.

    adapter.toggleOpenState(4);
    tree.assertRowCountChanged(5, -4);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 6);

    // Add a message to a collapsed thread that has been expanded before.

    const added3 = addMessage({
      messageId: "added3@invalid",
      references: ["message3@invalid"],
    });
    Assert.equal(added3, 13);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 6);
    Assert.equal(adapter.rowAt(4).rowCount, 5);

    Assert.deepEqual(listMessages(adapter), [9, 1, 10, 4, 6, 8]);
    Assert.equal(adapter.getCellText(4, "messageId"), "message6@invalid");

    // Expand the thread.

    adapter.toggleOpenState(4);
    tree.assertRowCountChanged(5, 5);
    tree.assertInvalidated(4, 4);
    Assert.equal(adapter.rowCount, 11);

    Assert.deepEqual(
      listMessages(adapter),
      [9, 1, 10, 4, 11, 3, 5, 6, 12, 13, 8]
    );

    // Add a message to a non-thread.

    Assert.equal(adapter.rowAt(0).rowCount, 0);
    Assert.equal(adapter.getCellText(0, "threadId"), "9");

    const added4 = addMessage({
      messageId: "added4@invalid",
      references: ["message9@invalid"],
    });
    Assert.equal(added4, 14);
    tree.assertInvalidated(0, 0);
    Assert.equal(adapter.rowCount, 11);
    Assert.ok(!adapter.rowAt(0).open);
    Assert.equal(adapter.rowAt(0).rowCount, 1);

    Assert.deepEqual(
      listMessages(adapter),
      [9, 1, 10, 4, 11, 3, 5, 6, 12, 13, 8]
    );
    Assert.equal(adapter.getCellText(0, "messageId"), "message9@invalid");

    // Open the thread.

    adapter.toggleOpenState(0);
    tree.assertRowCountChanged(1, 1);
    tree.assertInvalidated(0, 0);
    Assert.equal(adapter.rowCount, 12);
    await tree.promiseInvalidated(0, 1);

    Assert.deepEqual(
      listMessages(adapter),
      [14, 9, 1, 10, 4, 11, 3, 5, 6, 12, 13, 8]
    );
    Assert.equal(adapter.getCellText(0, "messageId"), "added4@invalid");
    Assert.equal(adapter.getCellText(1, "messageId"), "message9@invalid");

    // Add a message that isn't part of a thread, at the end.

    const added5 = addMessage({
      messageId: "added5@invalid",
      subject: "Team-oriented context-sensitive monitoring",
      date: "2026-03-03",
    });
    Assert.equal(added5, 15);
    tree.assertRowCountChanged(12, 1);
    Assert.equal(adapter.rowCount, 13);

    Assert.deepEqual(
      listMessages(adapter),
      [14, 9, 1, 10, 4, 11, 3, 5, 6, 12, 13, 8, 15]
    );
    Assert.equal(adapter.getCellText(12, "messageId"), "added5@invalid");

    // Add another message that isn't part of a thread, in the middle.

    const added6 = addMessage({
      messageId: "added6@invalid",
      subject: "Networked even-keeled application",
      date: "2025-09-07",
    });
    Assert.equal(added6, 16);
    tree.assertRowCountChanged(11, 1);
    Assert.equal(adapter.rowCount, 14);

    Assert.deepEqual(
      listMessages(adapter),
      [14, 9, 1, 10, 4, 11, 3, 5, 6, 12, 13, 16, 8, 15]
    );
    Assert.equal(adapter.getCellText(11, "messageId"), "added6@invalid");

    // Add another message that isn't part of a thread, at the start.

    const added7 = addMessage({
      messageId: "added7@invalid",
      subject: "Cross-platform tertiary open architecture",
      date: "1998-03-03",
    });
    Assert.equal(added7, 17);
    tree.assertRowCountChanged(0, 1);
    Assert.equal(adapter.rowCount, 15);

    Assert.deepEqual(
      listMessages(adapter),
      [17, 14, 9, 1, 10, 4, 11, 3, 5, 6, 12, 13, 16, 8, 15]
    );
    Assert.equal(adapter.getCellText(0, "messageId"), "added7@invalid");

    // Remove the messages in the order they were added.

    messageDB.removeMessage(added1);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 14, 9, 1, 10, 4, 3, 5, 6, 12, 13, 16, 8, 15]
    );

    messageDB.removeMessage(added2);
    tree.assertRowCountChanged(9, -1);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 14, 9, 1, 10, 4, 3, 5, 6, 13, 16, 8, 15]
    );

    adapter.toggleOpenState(6);
    tree.assertRowCountChanged(7, -3);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 14, 9, 1, 10, 4, 6, 16, 8, 15]
    );

    messageDB.removeMessage(added3);
    tree.assertInvalidated(6, 6);
    Assert.deepEqual(
      listMessages(adapter),
      [17, 14, 9, 1, 10, 4, 6, 16, 8, 15]
    );

    messageDB.removeMessage(added4);
    tree.assertRowCountChanged(1, -1);
    Assert.deepEqual(listMessages(adapter), [17, 9, 1, 10, 4, 6, 16, 8, 15]);

    messageDB.removeMessage(added5);
    tree.assertRowCountChanged(8, -1);
    Assert.deepEqual(listMessages(adapter), [17, 9, 1, 10, 4, 6, 16, 8]);

    messageDB.removeMessage(added6);
    tree.assertRowCountChanged(6, -1);
    Assert.deepEqual(listMessages(adapter), [17, 9, 1, 10, 4, 6, 8]);

    messageDB.removeMessage(added7);
    tree.assertRowCountChanged(0, -1);
    Assert.deepEqual(listMessages(adapter), [9, 1, 10, 4, 6, 8]);
  } finally {
    adapter.setTree(null);
  }
});
