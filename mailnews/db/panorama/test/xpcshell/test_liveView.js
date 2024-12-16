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

add_task(function testSort() {
  const liveView = new LiveView();

  liveView.sortDescending = false;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.date),
    [
      new Date("2019-02-01T04:48:00.000Z"),
      new Date("2019-09-14T05:21:00.000Z"),
      new Date("2019-11-02T18:19:00.000Z"),
      new Date("2019-11-03T17:51:00.000Z"),
      new Date("2023-04-10T17:26:00.000Z"),
      new Date("2023-05-13T13:23:00.000Z"),
      new Date("2023-06-26T18:05:00.000Z"),
      new Date("2023-08-06T06:02:00.000Z"),
      new Date("2023-08-14T17:54:00.000Z"),
      new Date("2023-09-14T19:34:00.000Z"),
    ],
    "messages should be in ascending date order"
  );

  liveView.sortDescending = true;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.date),
    [
      new Date("2023-09-14T19:34:00.000Z"),
      new Date("2023-08-14T17:54:00.000Z"),
      new Date("2023-08-06T06:02:00.000Z"),
      new Date("2023-06-26T18:05:00.000Z"),
      new Date("2023-05-13T13:23:00.000Z"),
      new Date("2023-04-10T17:26:00.000Z"),
      new Date("2019-11-03T17:51:00.000Z"),
      new Date("2019-11-02T18:19:00.000Z"),
      new Date("2019-09-14T05:21:00.000Z"),
      new Date("2019-02-01T04:48:00.000Z"),
    ],
    "messages should be in descending date order"
  );
});

add_task(function testListener() {
  const earlierId = addMessage({
    folderId: 2,
    messageId: "earlier-message",
    date: Date.UTC(2024, 11, 31, 12, 31),
    flags: 1,
  });

  const listener = {
    onMessageAdded(message) {
      Assert.ok(
        !this._addedMessage,
        "there should be only one call to onMessageAdded"
      );
      this._addedMessage = message;
    },
    onMessageRemoved(message) {
      Assert.ok(
        !this._removedMessage,
        "there should be only one call to onMessageRemoved"
      );
      this._removedMessage = message;
    },
  };
  const liveView = new LiveView();
  liveView.setListener(listener);

  const addedId = addMessage({
    folderId: 4,
    messageId: "added-message",
    date: Date.UTC(2025, 0, 14, 7, 20),
    tags: "$label4",
  });
  Assert.equal(listener._addedMessage.id, addedId);
  Assert.equal(listener._addedMessage.folderId, 4);
  Assert.equal(listener._addedMessage.messageId, "added-message");
  Assert.equal(
    listener._addedMessage.date.toISOString(),
    "2025-01-14T07:20:00.000Z"
  );
  Assert.equal(listener._addedMessage.sender, "sender");
  Assert.equal(listener._addedMessage.subject, "subject");
  Assert.equal(listener._addedMessage.flags, 0);
  Assert.equal(listener._addedMessage.tags, "$label4");

  messages.removeMessage(earlierId);
  Assert.equal(listener._removedMessage.id, earlierId);
  Assert.equal(listener._removedMessage.folderId, 2);
  Assert.equal(listener._removedMessage.messageId, "earlier-message");
  Assert.equal(
    listener._removedMessage.date.toISOString(),
    "2024-12-31T12:31:00.000Z"
  );
  Assert.equal(listener._removedMessage.sender, "sender");
  Assert.equal(listener._removedMessage.subject, "subject");
  Assert.equal(listener._removedMessage.flags, 1);
  Assert.equal(listener._removedMessage.tags, "");

  liveView.clearListener(listener);
  // If the listener was not cleared these calls would cause failures.
  const laterId = addMessage({ folderId: 3, messageId: "later-message" });
  messages.removeMessage(addedId);
  messages.removeMessage(laterId);
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
