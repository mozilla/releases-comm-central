/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Just a stub test to prove that the messages database works.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let folder;
const generator = new MessageGenerator();

add_setup(function () {
  do_get_profile();
  loadExistingDB();
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder = rootFolder.createLocalSubfolder("test");
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
});

add_task(function () {
  const generatedMessage = generator.makeMessage({
    cc: generator.makeNamesAndAddresses(1),
  });
  const addedMessage = folder.addMessage(generatedMessage.toMessageString());
  const folderId = folders.getFolderForMsgFolder(folder).id;

  // Check the added message's properties match the input properties.

  Assert.equal(addedMessage.messageKey, 1);
  Assert.equal(addedMessage.folder, folder);
  Assert.equal(addedMessage.threadId, 1);
  Assert.equal(addedMessage.threadParent, 0);
  Assert.equal(
    `<${addedMessage.messageId}>`,
    generatedMessage.headers["Message-Id"]
  );
  Assert.equal(
    addedMessage.date,
    new Date(generatedMessage.headers.Date).valueOf() * 1000
  );
  Assert.equal(addedMessage.author, generatedMessage.headers.From);
  Assert.equal(addedMessage.recipients, generatedMessage.headers.To.join());
  Assert.equal(addedMessage.ccList, generatedMessage.headers.Cc.join());
  Assert.equal(addedMessage.bccList, "");
  Assert.equal(addedMessage.subject, generatedMessage.subject);
  Assert.equal(addedMessage.flags, 0);
  Assert.equal(addedMessage.getStringProperty("keywords"), "");

  // Special case for tags/keywords: set via nsIMsgDBHdr.SetStringProperty(),
  // but actually stored in the 'tags' column in 'messages'.
  addedMessage.setStringProperty("keywords", "foo bar");

  // Check that we saved everything in the database.

  let stmt = database.connectionForTests.createStatement(
    "SELECT * FROM messages"
  );
  stmt.executeStep();
  Assert.equal(stmt.row.id, 1); // This is the first message added.
  Assert.equal(stmt.row.folderId, folderId);
  Assert.equal(stmt.row.threadId, 1);
  Assert.equal(stmt.row.threadParent, 0);
  Assert.equal(stmt.row.messageId, addedMessage.messageId);
  Assert.equal(stmt.row.date, addedMessage.date);
  Assert.equal(stmt.row.sender, addedMessage.author);
  Assert.equal(stmt.row.recipients, addedMessage.recipients);
  Assert.equal(stmt.row.ccList, addedMessage.ccList);
  Assert.equal(stmt.row.bccList, addedMessage.bccList);
  Assert.equal(stmt.row.subject, addedMessage.subject);
  Assert.equal(stmt.row.flags, addedMessage.flags);
  Assert.equal(stmt.row.tags, "foo bar"); // "keywords"
  stmt.finalize();

  stmt = database.connectionForTests.createStatement(
    "SELECT * FROM message_properties"
  );
  stmt.executeStep();
  Assert.equal(stmt.row.id, 1); // This is the first message added.
  Assert.equal(stmt.row.name, "storeToken");
  Assert.equal(stmt.row.value, "0");
  Assert.equal(stmt.executeStep(), true);
  Assert.equal(stmt.row.id, 1);
  Assert.equal(stmt.row.name, "messageSize");
  Assert.equal(stmt.row.value, 303);
  Assert.equal(stmt.executeStep(), false); // no "keywords".

  stmt.finalize();
});
