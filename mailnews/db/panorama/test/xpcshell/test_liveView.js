/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

add_task(function testMessageProperties() {
  const liveView = new LiveView();

  const [message] = liveView.selectMessages(1, 2);
  Assert.equal(message.id, 8);
  Assert.equal(message.folderId, 4);
  Assert.equal(message.messageId, "");
  Assert.equal(message.date.toISOString(), "2023-08-06T06:02:00.000Z");
  Assert.equal(message.sender, "");
  Assert.equal(message.subject, "Balanced static project");
  Assert.equal(message.flags, 0);
  Assert.equal(message.tags, "$label1");
});

add_task(function testInitWithFolder() {
  const folderA = folders.getFolderByPath("server/folderA");

  const liveView = new LiveView();
  liveView.initWithFolder(folderA);
  assertInitFails(liveView);

  Assert.equal(
    liveView.countMessages(),
    4,
    "countMessages should return the total number of messages"
  );
  Assert.equal(
    liveView.countUnreadMessages(),
    2,
    "countUnreadMessages should return the number of unread messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [4, 3, 2, 1],
    "selectMessages with no arguments should return all the messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(3), m => m.id),
    [4, 3, 2],
    "selectMessages with a limit argument should only return some of the messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(2, 1), m => m.id),
    [3, 2],
    "selectMessages with both arguments should only return some of the messages"
  );

  assertInitFails(liveView);
});

add_task(function testInitWithFolders() {
  const folderA = folders.getFolderByPath("server/folderA");
  const folderB = folders.getFolderByPath("server/folderB");
  const folderC = folders.getFolderByPath("server/folderC");

  const liveView = new LiveView();
  liveView.initWithFolders([folderA, folderB, folderC]);
  assertInitFails(liveView);

  Assert.equal(
    liveView.countMessages(),
    10,
    "countMessages should return the total number of messages"
  );
  Assert.equal(
    liveView.countUnreadMessages(),
    5,
    "countUnreadMessages should return the number of unread messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    "selectMessages with no arguments should return all the messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(3), m => m.id),
    [10, 9, 8],
    "selectMessages with a limit argument should only return some of the messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(2, 1), m => m.id),
    [9, 8],
    "selectMessages with both arguments should only return some of the messages"
  );

  assertInitFails(liveView);
});

add_task(function testInitWithTag() {
  const liveView = new LiveView();
  liveView.initWithTag("$label1");
  assertInitFails(liveView);

  Assert.equal(
    liveView.countMessages(),
    3,
    "countMessages should return the total number of messages"
  );
  Assert.equal(
    liveView.countUnreadMessages(),
    2,
    "countUnreadMessages should return the number of unread messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [8, 3, 2],
    "selectMessages with no arguments should return all the messages"
  );

  assertInitFails(liveView);
});

function assertInitFails(liveView) {
  const folderA = folders.getFolderByPath("server/folderA");

  Assert.throws(
    () => liveView.initWithFolder(folderA),
    /NS_ERROR_UNEXPECTED/,
    "setting the folder a second time should throw"
  );
  Assert.throws(
    () => liveView.initWithFolders([folderA]),
    /NS_ERROR_UNEXPECTED/,
    "setting the folder a second time should throw"
  );
  Assert.throws(
    () => liveView.initWithTag("$labelX"),
    /NS_ERROR_UNEXPECTED/,
    "setting the folder a second time should throw"
  );
}
