/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests migrating the messages from a summary file into the new database.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

add_setup(async function () {
  const profile = new ProfileCreator(do_get_profile());
  const server = await profile.addLocalServer();
  await server.rootFolder.addMailFolder("test", {
    summary: do_get_file("data/migration.msf"),
    mbox: do_get_file("data/migration"),
  });

  loadExistingDB();
  MailServices.accounts.accounts;
});

add_task(async function () {
  const testFolder =
    MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("test");
  Assert.equal(testFolder.getTotalMessages(false), 0);

  await database.migrateFolderDatabase(testFolder);
  const messages = Array.from(testFolder.messages);
  // There are three messages in the mbox and summary files, one is deleted.
  Assert.equal(messages.length, 2);

  Assert.equal(messages[0].messageKey, 1);
  Assert.equal(
    messages[0].date,
    new Date("2000-07-01T23:06:00Z").valueOf() * 1000
  );
  Assert.equal(messages[0].author, '"Cicero Kutch" <cicero.kutch@invalid>');
  // Temporarily disabled, bug 2019183.
  // Assert.equal(messages[0].recipients, "Renée Alsom <renee.alsom@invalid>");
  Assert.equal(messages[0].subject, "Secured value-added orchestration");
  Assert.equal(messages[0].flags, Ci.nsMsgMessageFlags.Read);
  Assert.equal(messages[0].getStringProperty("keywords"), "$label5");
  Assert.equal(messages[0].storeToken, "0");
  Assert.equal(messages[0].messageSize, 0x242);
  Assert.equal(messages[0].threadId, 1);
  Assert.equal(messages[0].threadParent, 0);

  Assert.equal(messages[1].messageKey, 2);
  Assert.equal(
    messages[1].date,
    new Date("2022-09-13T05:40:00Z").valueOf() * 1000
  );
  Assert.equal(messages[1].author, '"Zoë Yundt" <zoe.yundt@invalid>');
  Assert.equal(messages[1].subject, "Intuitive full-range analyzer");
  Assert.equal(messages[1].recipients, "");
  Assert.equal(messages[1].flags, 0);
  Assert.equal(messages[1].getStringProperty("keywords"), "");
  Assert.equal(messages[1].storeToken, "1143");
  Assert.equal(messages[1].messageSize, 0x177);
  Assert.equal(messages[1].threadId, 2);
  Assert.equal(messages[1].threadParent, 0);
});
