/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests live views are initialised correctly and find the right messages,
 * when we're dealing with conversations. This is a separate test file because
 * it uses different database content.
 */

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

add_setup(async function () {
  const profile = new ProfileCreator(do_get_profile());
  const server = profile.addLocalServer();
  await server.rootFolder.addMailFolder("folderA");
  await server.rootFolder.addMailFolder("folderB");
  await server.rootFolder.addMailFolder("folderC");
  await installDBFromFile("db/conversations.sql");
});

/**
 * A thread of one message.
 */
add_task(async function testSingleMessage() {
  const liveView = new LiveView();
  liveView.initWithConversation(1);
  Assert.equal(
    liveView.countMessages(),
    1,
    "countMessages should return the total number of messages"
  );
});

/**
 * Test a thread of messages that got added to the database in the order they
 * were written.
 */
add_task(async function testThreadInOrder() {
  const liveView = new LiveView();
  liveView.initWithConversation(3);
  Assert.equal(
    liveView.countMessages(),
    3,
    "countMessages should return the total number of messages"
  );
  const messages = liveView.selectMessages();
  Assert.deepEqual(
    Array.from(messages, m => m.id),
    [3, 5, 6],
    "selectMessages should return all the messages in sort ascending order"
  );
  Assert.equal(messages[0].threadId, 3);
  Assert.equal(messages[0].threadParent, 0);
  Assert.equal(messages[1].threadId, 3);
  Assert.equal(messages[1].threadParent, 3);
  Assert.equal(messages[2].threadId, 3);
  Assert.equal(messages[2].threadParent, 5);
});

/**
 * Test a thread of messages that got added to the database out of the order
 * they were written. The root message arrived after the replies.
 */
add_task(async function testThreadOutOfOrder() {
  const liveView = new LiveView();
  liveView.initWithConversation(7);
  Assert.equal(
    liveView.countMessages(),
    3,
    "countMessages should return the total number of messages"
  );
  const messages = liveView.selectMessages();
  Assert.deepEqual(
    Array.from(messages, m => m.id),
    [7, 2, 4],
    "selectMessages should return all the messages in sort ascending order"
  );
  Assert.equal(messages[0].threadId, 7);
  Assert.equal(messages[0].threadParent, 0);
  Assert.equal(messages[1].threadId, 7);
  Assert.equal(messages[1].threadParent, 7);
  Assert.equal(messages[2].threadId, 7);
  Assert.equal(messages[2].threadParent, 7);
});

/**
 * Test a live view in threads-only mode.
 */
add_task(async function testThreadsOnly() {
  const liveView = new LiveView();
  liveView.grouping = Ci.nsILiveView.THREADED;

  Assert.equal(
    liveView.countMessages(),
    6,
    "countMessages should only count threads"
  );
  Assert.equal(
    liveView.countUnreadMessages(),
    0,
    "countUnreadMessages should only count threads"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [10, 9, 8, 6, 4, 1],
    "selectMessages should only return threads"
  );

  liveView.sortDescending = false;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [1, 4, 6, 8, 9, 10],
    "selectMessages should only return threads"
  );
});
