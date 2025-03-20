/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that getFolderForMsgFolder and getMsgFolderForFolder work.
 */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function testMsgFolders() {
  do_get_profile();
  await loadExistingDB();

  const account = MailServices.accounts.createLocalMailAccount();
  Assert.equal(account.incomingServer.key, "server1");

  const rootMsgFolder = account.incomingServer.rootFolder;
  rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const alphaMsgFolder = rootMsgFolder.createLocalSubfolder("alpha");
  const bravoMsgFolder = rootMsgFolder.createLocalSubfolder("bravo");
  Assert.deepEqual(rootMsgFolder.subFolders, [alphaMsgFolder, bravoMsgFolder]);

  const rootDBFolder = folders.getFolderByPath("server1");
  const alphaDBFolder = folders.getFolderByPath("server1/alpha");
  const bravoDBFolder = folders.getFolderByPath("server1/bravo");
  Assert.deepEqual(rootDBFolder.children, [alphaDBFolder, bravoDBFolder]);

  Assert.equal(folders.getFolderForMsgFolder(rootMsgFolder), rootDBFolder);
  Assert.equal(folders.getFolderForMsgFolder(alphaMsgFolder), alphaDBFolder);
  Assert.equal(folders.getFolderForMsgFolder(bravoMsgFolder), bravoDBFolder);

  Assert.equal(folders.getMsgFolderForFolder(rootDBFolder), rootMsgFolder);
  Assert.equal(folders.getMsgFolderForFolder(alphaDBFolder), alphaMsgFolder);
  Assert.equal(folders.getMsgFolderForFolder(bravoDBFolder), bravoMsgFolder);
});
