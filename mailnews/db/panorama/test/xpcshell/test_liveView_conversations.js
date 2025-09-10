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

add_task(async function () {
  const liveView = new LiveView();
  liveView.initWithConversation(1);
  Assert.equal(
    liveView.countMessages(),
    1,
    "countMessages should return the total number of messages"
  );
});

add_task(async function () {
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

add_task(async function () {
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
    [2, 4, 7],
    "selectMessages should return all the messages in sort ascending order"
  );
  Assert.equal(messages[0].threadId, 7);
  Assert.equal(messages[0].threadParent, 7);
  Assert.equal(messages[1].threadId, 7);
  Assert.equal(messages[1].threadParent, 7);
  Assert.equal(messages[2].threadId, 7);
  Assert.equal(messages[2].threadParent, 0);
});
