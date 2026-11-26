/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests connecting to an POP3 server for the first time. Checks that folders
 * and messages are correctly written to the database and the filesystem.
 */

add_setup(async function () {
  // Create an empty profile on the filesystem.

  do_get_profile();
  loadExistingDB();

  // Create the account.

  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "pop3"
  );
  account.incomingServer.setBoolValue("leave_on_server", true);
  account.addIdentity(MailServices.accounts.createIdentity());

  // Calculate the sizes of the messages so that we can check recorded values
  // later. This would be a lot easier if we were consistent on line endings.
  // These sizes will remain constant as long as MessageGenerator isn't
  // changed and we don't change the header block or fix the line endings.

  const HEADER_BLOCK_SIZE = IS_WINDOWS ? 191 : 186;
  let message0 = synMessages[0].toMessageString();
  let message1 = synMessages[1].toMessageString();
  if (!IS_WINDOWS) {
    message0 = message0.replaceAll("\r", "");
    message1 = message1.replaceAll("\r", "");
  }
  size0 = HEADER_BLOCK_SIZE + message0.length + LINE_ENDING.length;
  size1 = HEADER_BLOCK_SIZE + message1.length + LINE_ENDING.length;
  Assert.equal(size0, IS_WINDOWS ? 449 : 435, "sanity check message 0 size");
  Assert.equal(size1, IS_WINDOWS ? 465 : 451, "sanity check message 1 size");

  // Normalize the profile path, for comparison with other paths which are
  // normalized (e.g. including the "/private" prefix on macOS).

  profileDir = PathUtils.normalize(PathUtils.profileDir);
});

add_task(async function () {
  await checkServer(["server1/Inbox", "server1/Trash"]);
  Assert.deepEqual(
    folderListener.foldersAdded,
    ["server1", "server1/Inbox", "server1/Trash"],
    "initial folders added"
  );
  folderListener.foldersAdded.length = 0;
});

add_task(async function () {
  await checkInbox([]);
});

add_task(async function () {
  await downloadMessagesFromServer();
  Assert.deepEqual(folderListener.foldersAdded, [], "no further folders added");
  Assert.deepEqual(folderListener.foldersDeleted, [], "no folders removed");
  Assert.deepEqual(
    folderListener.messagesAdded,
    ["0@made.up.invalid", "1@made.up.invalid"],
    "messages added"
  );
});
