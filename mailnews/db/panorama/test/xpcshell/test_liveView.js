/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests live views are initialised correctly and find the right messages.
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
  await installDBFromFile("db/messages.sql");
});

add_task(function testMessageProperties() {
  const liveView = new LiveView();

  const [message] = liveView.selectMessages(1, 2);
  Assert.equal(message.id, 8);
  Assert.equal(message.folderId, 4);
  Assert.equal(message.messageId, "message8@invalid");
  Assert.equal(message.date.toISOString(), "2023-08-06T06:02:00.000Z");
  Assert.equal(message.sender, "Edgar Stokes <edgar@stokes.invalid>");
  Assert.equal(message.subject, "Balanced static project");
  Assert.equal(message.flags, 0);
  Assert.equal(message.tags, "$label1");
});

add_task(function testInitWithFolder() {
  const folderA = folderDB.getFolderByPath("server1/folderA");

  const liveView = new LiveView();
  Assert.throws(
    () => liveView.initWithFolder(0),
    // NOTE (BenC): LiveView::InitWithFolder(0) returns NS_ERROR_INVALID_ARG,
    // but for some reason it shows up here as NS_ERROR_UNEXPECTED.
    // I'm baffled.
    /NS_ERROR_/,
    "setting with 0 folder should throw"
  );

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
  const folderA = folderDB.getFolderByPath("server1/folderA");
  const folderB = folderDB.getFolderByPath("server1/folderB");
  const folderC = folderDB.getFolderByPath("server1/folderC");

  const liveView = new LiveView();
  Assert.throws(
    () => liveView.initWithFolders([0, folderA]),
    /NS_ERROR_/,
    "initWithFolders should fail if there are any null folderIds"
  );
  Assert.throws(
    () => liveView.initWithFolders([]),
    /NS_ERROR_/,
    "initWithFolders should fail with an empty list"
  );

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

add_task(function testInitWithVirtualFolder() {
  const folderA = folderDB.getFolderByPath("server1/folderA");
  const folderC = folderDB.getFolderByPath("server1/folderC");

  MailServices.accounts.accounts;
  const wrapper = VirtualFolderHelper.createNewVirtualFolder(
    "virtual",
    MailServices.accounts.localFoldersServer.rootFolder,
    [
      folderDB.getMsgFolderForFolder(folderA),
      folderDB.getMsgFolderForFolder(folderC),
    ],
    "AND (subject,contains,ing)",
    false
  );

  const virtualFolder = folderDB.getFolderByPath("server1/virtual");

  let liveView = new LiveView();
  liveView.initWithFolder(virtualFolder);
  assertInitFails(liveView);

  Assert.equal(
    liveView.countMessages(),
    2,
    "countMessages should return the total number of messages"
  );
  Assert.equal(
    liveView.countUnreadMessages(),
    1,
    "countUnreadMessages should return the number of unread messages"
  );
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [6, 1],
    "selectMessages with no arguments should return all the messages"
  );

  assertInitFails(liveView);

  wrapper.searchString = "AND (date,is before,10-May-2023)";
  // TODO: We shouldn't need this. Updating the wrapper should cause the live
  // view to refresh itself.
  liveView = new LiveView();
  liveView.initWithFolder(virtualFolder);

  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [5, 4, 3, 2, 1],
    "selectMessages with no arguments should return all the messages"
  );

  wrapper.searchString =
    "AND (date,is after,1-Jan-2020) AND (date,is before,10-May-2023)";
  liveView = new LiveView();
  liveView.initWithFolder(virtualFolder);

  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [5],
    "selectMessages with no arguments should return all the messages"
  );

  wrapper.searchString =
    "AND (date,is before,01-Jan-2020) OR (date,is after,10-May-2023)";
  liveView = new LiveView();
  liveView.initWithFolder(virtualFolder);

  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.id),
    [10, 9, 8, 7, 6, 4, 3, 2, 1],
    "selectMessages with no arguments should return all the messages"
  );
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

  Assert.equal(liveView.sqlClauseForTests, "TAGS_INCLUDE(tags, ?)");
  Assert.deepEqual(liveView.sqlParamsForTests, "$label1");

  assertInitFails(liveView);
});

add_task(function testSort() {
  const liveView = new LiveView();

  liveView.sortDescending = false;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.date.toISOString()),
    [
      "2019-02-01T00:00:00.000Z",
      "2019-09-14T00:00:00.000Z",
      "2019-11-02T00:00:00.000Z",
      "2019-11-03T12:34:56.000Z",
      "2023-04-10T00:00:00.000Z",
      "2023-05-13T00:00:00.000Z",
      "2023-06-26T00:00:00.000Z",
      "2023-08-06T06:02:00.000Z",
      "2023-08-14T00:00:00.000Z",
      "2023-09-14T00:00:00.000Z",
    ],
    "messages should be in ascending date order"
  );

  liveView.sortDescending = true;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.date.toISOString()),
    [
      "2023-09-14T00:00:00.000Z",
      "2023-08-14T00:00:00.000Z",
      "2023-08-06T06:02:00.000Z",
      "2023-06-26T00:00:00.000Z",
      "2023-05-13T00:00:00.000Z",
      "2023-04-10T00:00:00.000Z",
      "2019-11-03T12:34:56.000Z",
      "2019-11-02T00:00:00.000Z",
      "2019-09-14T00:00:00.000Z",
      "2019-02-01T00:00:00.000Z",
    ],
    "messages should be in descending date order"
  );

  liveView.sortColumn = Ci.nsILiveView.SUBJECT;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.subject),
    [
      "Virtual solution-oriented knowledge user",
      "Universal 5th generation conglomeration",
      "Streamlined bandwidth-monitored help-desk",
      "Self-enabling clear-thinking archive",
      "Proactive intermediate collaboration",
      "Networked even-keeled forecast",
      "Fundamental empowering pricing structure",
      "Enterprise-wide mission-critical middleware",
      "Distributed mobile access",
      "Balanced static project",
    ],
    "messages should be in descending subject order"
  );

  liveView.sortDescending = false;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.subject),
    [
      "Balanced static project",
      "Distributed mobile access",
      "Enterprise-wide mission-critical middleware",
      "Fundamental empowering pricing structure",
      "Networked even-keeled forecast",
      "Proactive intermediate collaboration",
      "Self-enabling clear-thinking archive",
      "Streamlined bandwidth-monitored help-desk",
      "Universal 5th generation conglomeration",
      "Virtual solution-oriented knowledge user",
    ],
    "messages should be in ascending subject order"
  );

  liveView.sortColumn = Ci.nsILiveView.SENDER;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.sender),
    [
      "Abe Koepp <abe@koepp.invalid>",
      "Christian Murray <christian@murray.invalid>",
      "Edgar Stokes <edgar@stokes.invalid>",
      "Eliseo Bauch <eliseo@bauch.invalid>",
      "Frederick Rolfson <frederick@rolfson.invalid>",
      "Hope Bosco <hope@bosco.invalid>",
      "Kip Mann <kip@mann.invalid>",
      "Lydia Rau <lydia@rau.invalid>",
      "Neal Jast <neal@jast.invalid>",
      "Tara White <tara@white.invalid>",
    ],
    "messages should be in ascending sender order"
  );

  liveView.sortDescending = true;
  Assert.deepEqual(
    Array.from(liveView.selectMessages(), m => m.sender),
    [
      "Tara White <tara@white.invalid>",
      "Neal Jast <neal@jast.invalid>",
      "Lydia Rau <lydia@rau.invalid>",
      "Kip Mann <kip@mann.invalid>",
      "Hope Bosco <hope@bosco.invalid>",
      "Frederick Rolfson <frederick@rolfson.invalid>",
      "Eliseo Bauch <eliseo@bauch.invalid>",
      "Edgar Stokes <edgar@stokes.invalid>",
      "Christian Murray <christian@murray.invalid>",
      "Abe Koepp <abe@koepp.invalid>",
    ],
    "messages should be in descending sender order"
  );

  liveView.sortColumn = Ci.nsILiveView.READ_FLAG;
  Assert.deepEqual(
    Array.from(
      liveView.selectMessages(),
      m => m.flags & Ci.nsMsgMessageFlags.Read
    ),
    [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    "messages should be sorted with unread messages last"
  );

  liveView.sortDescending = false;
  Assert.deepEqual(
    Array.from(
      liveView.selectMessages(),
      m => m.flags & Ci.nsMsgMessageFlags.Read
    ),
    [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    "messages should be sorted with unread messages first"
  );

  liveView.sortColumn = Ci.nsILiveView.MARKED_FLAG;
  Assert.deepEqual(
    Array.from(
      liveView.selectMessages(),
      m => m.flags & Ci.nsMsgMessageFlags.Marked
    ),
    [4, 4, 4, 0, 0, 0, 0, 0, 0, 0],
    "messages should be sorted with flagged messages first"
  );

  liveView.sortDescending = true;
  Assert.deepEqual(
    Array.from(
      liveView.selectMessages(),
      m => m.flags & Ci.nsMsgMessageFlags.Marked
    ),
    [0, 0, 0, 0, 0, 0, 0, 4, 4, 4],
    "messages should be sorted with flagged messages last"
  );
});

add_task(function testListener() {
  const earlierId = addMessage({
    folderId: 2,
    messageId: "earlier-message",
    date: "2024-12-31T12:31:00Z",
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
    date: "2025-01-14T07:20:00Z",
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

  messageDB.removeMessage(earlierId);
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
  messageDB.removeMessage(addedId);
  messageDB.removeMessage(laterId);
});

function assertInitFails(liveView) {
  const folderA = folderDB.getFolderByPath("server1/folderA");

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
