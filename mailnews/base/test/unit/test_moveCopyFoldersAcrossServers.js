/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const generator = new MessageGenerator();
let imapSrcServer, imapDestServer;
let ewsSrcServer, ewsDestServer;

add_setup(async function () {
  imapSrcServer = await ServerTestUtils.createServer({
    type: "imap",
    options: { username: "imapSrc" },
  });
  imapDestServer = await ServerTestUtils.createServer({
    type: "imap",
    options: { username: "imapDest" },
  });
  ewsSrcServer = await ServerTestUtils.createServer({
    type: "ews",
    options: { username: "ewsSrc" },
  });
  ewsDestServer = await ServerTestUtils.createServer({
    type: "ews",
    options: { username: "ewsDest" },
  });

  const srcRoots = [];
  const destRoots = [];

  srcRoots.push(await createServer("localSrc", "none"));
  destRoots.push(await createServer("localDest", "none"));
  srcRoots.push(await createServer("pop3Src", "pop3"));
  destRoots.push(await createServer("pop3Dest", "pop3"));
  srcRoots.push(await createServer("imapSrc", "imap", imapSrcServer.port));
  destRoots.push(await createServer("imapDest", "imap", imapDestServer.port));
  srcRoots.push(await createServer("ewsSrc", "ews", ewsSrcServer.port));
  destRoots.push(await createServer("ewsDest", "ews", ewsDestServer.port));

  for (const srcRoot of srcRoots) {
    for (const destRoot of destRoots) {
      const moveName = `move_from_${srcRoot.server.type}_to_${destRoot.server.type}`;
      const moveSrcFolder = await createFolder(srcRoot, moveName);
      await addMessages(moveSrcFolder, 10);
      const moveSrcSubfolder = await createFolder(moveSrcFolder, "subfolder");
      await addMessages(moveSrcSubfolder, 3);

      const copyName = `copy_from_${srcRoot.server.type}_to_${destRoot.server.type}`;
      const copySrcFolder = await createFolder(srcRoot, copyName);
      await addMessages(copySrcFolder, 7);
      const copySrcSubfolder = await createFolder(copySrcFolder, "subfolder");
      await addMessages(copySrcSubfolder, 2);

      // Hack to give the added tasks names.
      const testObj = {
        async [moveName]() {
          await subtestMove(moveSrcFolder, destRoot);
        },
        async [copyName]() {
          await subtestCopy(copySrcFolder, destRoot);
        },
      };
      add_task(testObj[moveName]);
      add_task(testObj[copyName]);
    }
  }
});

/**
 * Set up a new incoming server.
 *
 * @param {string} username
 * @param {string} type
 * @param {number} port
 * @returns {nsIMsgIncomingServer}
 */
async function createServer(username, type, port) {
  const incomingServer = MailServices.accounts.createIncomingServer(
    username,
    "localhost",
    type
  );
  if (port) {
    incomingServer.port = port;
    incomingServer.password = "password";
  }
  if (type == "ews") {
    incomingServer.setStringValue(
      "ews_url",
      `http://localhost:${port}/EWS/Exchange.asmx`
    );
    incomingServer.performExpand(null);
  }

  const account = MailServices.accounts.createAccount();
  account.incomingServer = incomingServer;
  return incomingServer.rootFolder;
}

/**
 * Create a new folder.
 *
 * @param {nsIMsgFolder} parent
 * @param {string} name
 * @returns {nsIMsgFolder}
 */
async function createFolder(parent, name) {
  const addedPromise = PromiseTestUtils.promiseFolderAdded(name);
  parent.createSubfolder(name, null);
  return await addedPromise;
}

/**
 * Add messages to a folder.
 *
 * @param {nsIMsgFolder} folder
 * @param {number} count
 */
async function addMessages(folder, count) {
  const messages = generator.makeMessages({ count });
  if (["none", "pop3"].includes(folder.server.type)) {
    folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
    folder.addMessageBatch(messages.map(message => message.toMessageString()));
  }
  if (folder.server.type == "imap") {
    await imapSrcServer.addMessages(folder, messages);
  }
  if (folder.server.type == "ews") {
    ewsSrcServer.addMessages(folder.getStringProperty("ewsId"), messages);
    const listener = new PromiseTestUtils.PromiseUrlListener();
    folder.server.getNewMessages(folder, null, listener);
    await listener.promise;
  }
}

/**
 * Check that a destination server (if any) has had the messages copied to it.
 *
 * @param {nsIMsgFolder} folder
 * @param {number} expectedCount
 */
function checkMessagesOnServer(folder, expectedCount) {
  if (folder?.server.type == "imap") {
    Assert.equal(
      imapDestServer.getMessagesInFolder(folder).length,
      expectedCount,
      `there should be ${expectedCount} messages on the server`
    );
  }
  if (folder?.server.type == "ews") {
    Assert.equal(
      ewsDestServer.getItemsInFolder(folder.getStringProperty("ewsId")).length,
      expectedCount,
      `there should be ${expectedCount} messages on the server`
    );
  }
}

/**
 * Move `folder` from its current parent to `newParent`.
 *
 * @param {nsIMsgFolder} folder
 * @param {nsIMsgFolder} newParent
 */
async function subtestMove(folder, newParent) {
  info(
    `Moving a folder from ${folder.server.type} to ${newParent.server.type}`
  );

  const folderName = folder.name;
  const srcParent = folder.parent;
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(folder, newParent, true, copyListener, null);
  await copyListener.promise;
  // Ensure the operation has finished. The copy listener promise resolves when
  // the target folder is moved, but subfolder operations may still be going.
  await new Promise(resolve => do_timeout(250, resolve));

  Assert.ok(
    srcParent.getChildNamed(folderName),
    "the moved folder should still exist in the source parent folder"
  ); // IS it okay, really? Bug 1957032.

  const destFolder = newParent.getChildNamed(folderName);
  Assert.ok(
    destFolder,
    "the moved folder should have been created on the destination parent folder"
  );
  Assert.equal(
    destFolder.getTotalMessages(false),
    10,
    "the moved folder should still contain the messages"
  );
  checkMessagesOnServer(destFolder, 10);

  const destSubfolder = destFolder.getChildNamed("subfolder");
  Assert.ok(
    destSubfolder,
    "the moved subfolder should have been created on the destination server"
  );
  await TestUtils.waitForCondition(
    () => destSubfolder.getTotalMessages(false) == 3,
    "the moved subfolder should still contain the messages"
  );
  checkMessagesOnServer(destSubfolder, 3);
}

/**
 * Copy `folder` from its current parent to `newParent`.
 *
 * @param {nsIMsgFolder} folder
 * @param {nsIMsgFolder} newParent
 */
async function subtestCopy(folder, newParent) {
  info(
    `Copying a folder from ${folder.server.type} to ${newParent.server.type}`
  );

  const folderName = folder.name;
  const srcParent = folder.parent;
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(folder, newParent, false, copyListener, null);
  await copyListener.promise;
  // Ensure the operation has finished. The copy listener promise resolves when
  // the target folder is copied, but subfolder operations may still be going.
  await new Promise(resolve => do_timeout(250, resolve));

  const srcFolder = srcParent.getChildNamed(folderName);
  Assert.ok(
    srcFolder,
    "the copied folder should still exist in the source parent folder"
  );
  Assert.equal(
    srcFolder.getTotalMessages(false),
    7,
    "the messages should still exist on the source server"
  );

  const srcSubfolder = srcFolder.getChildNamed("subfolder");
  Assert.ok(
    srcSubfolder,
    "the subfolder should still exist on the source server "
  );
  Assert.equal(
    srcSubfolder.getTotalMessages(false),
    2,
    "the subfolder's messages should still exist on the source server"
  );

  const destFolder = newParent.getChildNamed(folderName);
  Assert.ok(
    destFolder,
    "the copied folder should have been created on the destination parent folder"
  );
  Assert.equal(
    destFolder.getTotalMessages(false),
    7,
    "the copied folder should contain a copy of the messages"
  );
  checkMessagesOnServer(destFolder, 7);

  const destSubfolder = destFolder.getChildNamed("subfolder");
  Assert.ok(
    destSubfolder,
    "the copied subfolder should have been created on the destination server"
  );
  await TestUtils.waitForCondition(
    () => destSubfolder.getTotalMessages(false) == 2,
    "the copied subfolder should contain a copy of the subfolder's messages"
  );

  checkMessagesOnServer(destSubfolder, 2);
}
