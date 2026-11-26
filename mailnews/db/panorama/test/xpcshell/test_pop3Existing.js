/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests connecting to an POP3 server from a profile that was already
 * configured. The profile at the start of this test should match the profile
 * after running test_pop3New.js.
 */

add_setup(async function () {
  // Create a populated profile on the filesystem.

  const profile = new ProfileCreator(do_get_profile());
  const server = profile.addServer("user", "test.test", "pop3");
  server.isMaildirStore = STORE_TYPE == "maildir";
  server.prefBranch.setBoolPref("leave_on_server", true);
  server.addIdentity();

  // Add the local storage formatting around the message. The X- headers will
  // be slightly out of order (the X-Mozilla-Status headers will be added
  // first) but it doesn't matter for this test.

  const headerBlock =
    "X-Account-Key: account1\r\n" +
    "X-UIDL: UIDL1\r\n" +
    "X-Mozilla-Keys:                                                                                 \r\n";
  let message0 = headerBlock + synMessages[0].toMessageString() + "\r\n";
  let message1 = headerBlock + synMessages[1].toMessageString() + "\r\n";
  if (!IS_WINDOWS) {
    message0 = message0.replaceAll("\r", "");
    message1 = message1.replaceAll("\r", "");
  }

  // Write the messages to disk. These sizes will remain constant as long as
  // MessageGenerator isn't changed and we don't change the header block or
  // fix the line endings.

  const inbox = await server.rootFolder.addMailFolder("Inbox");
  ({ size: size0, storeToken: storeToken0 } = await inbox.addMessage(message0));
  ({ size: size1, storeToken: storeToken1 } = await inbox.addMessage(message1));
  Assert.equal(size0, IS_WINDOWS ? 449 : 435, "sanity check message 0 size");
  Assert.equal(size1, IS_WINDOWS ? 465 : 451, "sanity check message 1 size");

  await IOUtils.writeUTF8(
    PathUtils.join(PathUtils.parent(inbox.mailFilePath), "popstate.dat"),
    `*test.test user${LINE_ENDING}k UIDL1 1794532232${LINE_ENDING}k UIDL2 1794532232`
  );

  // Install the database data. This should match what would be there at the
  // end of test_pop3New.js.

  let sql = await IOUtils.readUTF8(do_get_file("db/pop3.sql").path);
  sql = sql.replaceAll("DATE_0", synMessages[0].date.valueOf() / 1000);
  sql = sql.replace("STORE_TOKEN_0", storeToken0);
  sql = sql.replace("SIZE_0", size0);
  sql = sql.replaceAll("DATE_1", synMessages[1].date.valueOf() / 1000);
  sql = sql.replace("STORE_TOKEN_1", storeToken1);
  sql = sql.replace("SIZE_1", size1);
  installDB(sql);

  // Normalize the profile path, for comparison with other paths which are
  // normalized (e.g. including the "/private" prefix on macOS).

  profileDir = PathUtils.normalize(PathUtils.profileDir);
});

add_task(async function () {
  await checkServer(["server1/Inbox", "server1/Trash"]);
});

add_task(async function () {
  await checkInbox([storeToken0, storeToken1]);
});

add_task(async function () {
  await downloadMessagesFromServer();
  Assert.deepEqual(folderListener.foldersAdded, [], "no folders added");
  Assert.deepEqual(folderListener.foldersDeleted, [], "no folders removed");
  Assert.deepEqual(folderListener.messagesAdded, [], "no messages added");
});
