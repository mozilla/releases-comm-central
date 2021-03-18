/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);
var { TestUtils } = ChromeUtils.import(
  "resource://testing-common/TestUtils.jsm"
);

let account, rootFolder, subFolders;
add_task(async function setup() {
  account = createAccount();
  rootFolder = account.incomingServer.rootFolder;
  subFolders = {
    test0: await createSubfolder(rootFolder, "test0"),
    test1: await createSubfolder(rootFolder, "test1"),
    test2: await createSubfolder(rootFolder, "test2"),
    test3: await createSubfolder(rootFolder, "test3"),
    trash: rootFolder.getChildNamed("Trash"),
  };
  await createMessages(subFolders.trash, 99);
  await createMessages(subFolders.test0, 1);
  // 100 messages must be created before this line or test_move_copy_delete will break.
  await createMessages(subFolders.test1, 5);
  subFolders.test0.addKeywordsToMessages(
    [[...subFolders.test0.messages][0]],
    "testkeyword"
  );
});

add_task(async function test_pagination() {
  let files = {
    "background.js": async () => {
      // Test a response of 99 messages at 10 messages per page.
      let [folder] = await window.waitForMessage();
      let page = await browser.messages.list(folder);
      browser.test.assertEq(36, page.id.length);
      browser.test.assertEq(10, page.messages.length);

      let originalPageId = page.id;
      let numPages = 1;
      let numMessages = 10;
      while (page.id) {
        page = await browser.messages.continueList(page.id);
        browser.test.assertTrue(page.messages.length > 0);
        numPages++;
        numMessages += page.messages.length;
        if (numMessages < 99) {
          browser.test.assertEq(originalPageId, page.id);
        } else {
          browser.test.assertEq(null, page.id);
        }
      }
      browser.test.assertEq(10, numPages);
      browser.test.assertEq(99, numMessages);

      browser.test.assertRejects(
        browser.messages.continueList(originalPageId),
        /No message list for id .*\. Have you reached the end of a list\?/
      );

      await window.sendMessage("setPref");

      // Do the same test, but with the default 100 messages per page.
      page = await browser.messages.list(folder);
      browser.test.assertEq(null, page.id);
      browser.test.assertEq(99, page.messages.length);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);

  await extension.startup();
  extension.sendMessage({ accountId: account.key, path: "/Trash" });

  await extension.awaitMessage("setPref");
  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_update() {
  let files = {
    "background.js": async () => {
      let tags = await browser.messages.listTags();
      let [folder] = await window.waitForMessage();
      let messageList = await browser.messages.list(folder);
      browser.test.assertEq(1, messageList.messages.length);
      let message = messageList.messages[0];
      browser.test.assertFalse(message.flagged);
      browser.test.assertFalse(message.read);
      browser.test.assertFalse(message.junk);
      browser.test.assertEq(0, message.junkScore);
      browser.test.assertEq(0, message.tags.length);
      browser.test.assertEq("99@made.up.invalid", message.headerMessageId);

      // Test that setting flagged works.
      await browser.messages.update(message.id, { flagged: true });
      await window.sendMessage("flagged");

      // Test that setting read works.
      await browser.messages.update(message.id, { read: true });
      await window.sendMessage("read");

      // Test that setting junk works.
      await browser.messages.update(message.id, { junk: true });
      await window.sendMessage("junk");

      // Test that setting one tag works.
      await browser.messages.update(message.id, { tags: [tags[0].key] });
      await window.sendMessage("tags1");

      // Test that setting two tags works.
      await browser.messages.update(message.id, {
        tags: [tags[1].key, tags[2].key],
      });
      await window.sendMessage("tags2");

      // Test that unspecified properties aren't changed.
      await browser.messages.update(message.id, {});
      await window.sendMessage("empty");

      message = await browser.messages.get(message.id);
      browser.test.assertTrue(message.flagged);
      browser.test.assertTrue(message.read);
      browser.test.assertTrue(message.junk);
      browser.test.assertEq(100, message.junkScore);
      browser.test.assertEq(2, message.tags.length);
      browser.test.assertEq(tags[1].key, message.tags[0]);
      browser.test.assertEq(tags[2].key, message.tags[1]);
      browser.test.assertEq("99@made.up.invalid", message.headerMessageId);

      // Test that clearing properties works.
      await browser.messages.update(message.id, {
        flagged: false,
        read: false,
        junk: false,
        tags: [],
      });
      await window.sendMessage("clear");

      message = await browser.messages.get(message.id);
      browser.test.assertFalse(message.flagged);
      browser.test.assertFalse(message.read);
      browser.test.assertFalse(message.junk);
      browser.test.assertEq(0, message.junkScore);
      browser.test.assertEq(0, message.tags.length);
      browser.test.assertEq("99@made.up.invalid", message.headerMessageId);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  let message = [...subFolders.test0.messages][0];
  ok(!message.isFlagged);
  ok(!message.isRead);
  equal(message.getProperty("keywords"), "testkeyword");

  await extension.startup();
  extension.sendMessage({ accountId: account.key, path: "/test0" });

  await extension.awaitMessage("flagged");
  await TestUtils.waitForCondition(() => message.isFlagged);
  extension.sendMessage();

  await extension.awaitMessage("read");
  await TestUtils.waitForCondition(() => message.isRead);
  extension.sendMessage();

  await extension.awaitMessage("junk");
  await TestUtils.waitForCondition(
    () => message.getStringProperty("junkscore") == 100
  );
  extension.sendMessage();

  await extension.awaitMessage("tags1");
  if (IS_IMAP) {
    // Only IMAP sets the junk/nonjunk keyword.
    await TestUtils.waitForCondition(
      () => message.getProperty("keywords") == "testkeyword junk $label1"
    );
  } else {
    await TestUtils.waitForCondition(
      () => message.getProperty("keywords") == "testkeyword $label1"
    );
  }
  extension.sendMessage();

  await extension.awaitMessage("tags2");
  if (IS_IMAP) {
    await TestUtils.waitForCondition(
      () =>
        message.getProperty("keywords") == "testkeyword junk $label2 $label3"
    );
  } else {
    await TestUtils.waitForCondition(
      () => message.getProperty("keywords") == "testkeyword $label2 $label3"
    );
  }
  extension.sendMessage();

  await extension.awaitMessage("empty");
  await TestUtils.waitForCondition(() => message.isFlagged);
  await TestUtils.waitForCondition(() => message.isRead);
  if (IS_IMAP) {
    await TestUtils.waitForCondition(
      () =>
        message.getProperty("keywords") == "testkeyword junk $label2 $label3"
    );
  } else {
    await TestUtils.waitForCondition(
      () => message.getProperty("keywords") == "testkeyword $label2 $label3"
    );
  }
  extension.sendMessage();

  await extension.awaitMessage("clear");
  await TestUtils.waitForCondition(() => !message.isFlagged);
  await TestUtils.waitForCondition(() => !message.isRead);
  await TestUtils.waitForCondition(
    () => message.getStringProperty("junkscore") == 0
  );
  if (IS_IMAP) {
    await TestUtils.waitForCondition(
      () => message.getProperty("keywords") == "testkeyword nonjunk"
    );
  } else {
    await TestUtils.waitForCondition(
      () => message.getProperty("keywords") == "testkeyword"
    );
  }
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_move_copy_delete() {
  let files = {
    "background.js": async () => {
      async function checkMessagesInFolder(expectedKeys, folder) {
        let expectedSubjects = expectedKeys.map(k => messages[k].subject);
        browser.test.log("expected: " + expectedSubjects);
        let { messages: actualMessages } = await browser.messages.list(folder);
        browser.test.log("actual: " + actualMessages.map(m => m.subject));

        browser.test.assertEq(expectedSubjects.length, actualMessages.length);
        for (let m of actualMessages) {
          browser.test.assertTrue(
            expectedSubjects.includes(m.subject),
            `${m.subject} at ${m.id}`
          );
          messages[m.subject.split(" ")[0]].id = m.id;
        }

        // Return the messages for convenience.
        return actualMessages;
      }

      let [accountId] = await window.waitForMessage();
      let { folders } = await browser.accounts.get(accountId);
      let testFolder1 = folders.find(f => f.name == "test1");
      let testFolder2 = folders.find(f => f.name == "test2");
      let testFolder3 = folders.find(f => f.name == "test3");
      let trashFolder = folders.find(f => f.name == "Trash");

      let { messages: folder1Messages } = await browser.messages.list(
        testFolder1
      );

      // Since the ID of a message changes when it is moved, track by subject.
      let messages = {};
      for (let m of folder1Messages) {
        messages[m.subject.split(" ")[0]] = { id: m.id, subject: m.subject };
      }

      // To help with debugging, output the IDs of our five messages.
      // Conveniently at this point we know the messages should be numbered 101-105,
      // (since we used 100 messages in the previous two tests) so I've put the
      // expected values in comments.
      browser.test.log(JSON.stringify(messages));

      // Move one message to another folder.
      await browser.messages.move([messages.Red.id], testFolder2);
      await checkMessagesInFolder(
        ["Green", "Blue", "My", "Happy"],
        testFolder1
      );
      await checkMessagesInFolder(["Red"], testFolder2);
      browser.test.log(JSON.stringify(messages)); // 106, 102, 103, 104, 105

      // And back again.
      await browser.messages.move([messages.Red.id], testFolder1);
      await checkMessagesInFolder(
        ["Red", "Green", "Blue", "My", "Happy"],
        testFolder1
      );
      await checkMessagesInFolder([], testFolder2);
      browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 103, 105

      // Move two messages to another folder.
      await browser.messages.move(
        [messages.Green.id, messages.My.id],
        testFolder2
      );
      await checkMessagesInFolder(["Red", "Blue", "Happy"], testFolder1);
      await checkMessagesInFolder(["Green", "My"], testFolder2);
      browser.test.log(JSON.stringify(messages)); // 101, 107, 103, 108, 105

      // Move one back again.
      await browser.messages.move([messages.My.id], testFolder1);
      await checkMessagesInFolder(["Red", "Blue", "My", "Happy"], testFolder1);
      await checkMessagesInFolder(["Green"], testFolder2);
      browser.test.log(JSON.stringify(messages)); // 101, 107, 103, 104, 105

      // Move messages from different folders to a third folder.
      await browser.messages.move(
        [messages.Green.id, messages.My.id],
        testFolder3
      );
      await checkMessagesInFolder(["Red", "Blue", "Happy"], testFolder1);
      await checkMessagesInFolder([], testFolder2);
      await checkMessagesInFolder(["Green", "My"], testFolder3);
      browser.test.log(JSON.stringify(messages)); // 101, 109, 103, 110, 105

      // Move a message to the folder it's already in.
      await browser.messages.move([messages.Green.id], testFolder3);
      await checkMessagesInFolder(["Green", "My"], testFolder3);
      browser.test.log(JSON.stringify(messages)); // 101, 109, 103, 110, 105

      // Move no messages.
      await browser.messages.move([], testFolder3);
      await checkMessagesInFolder(["Red", "Blue", "Happy"], testFolder1);
      await checkMessagesInFolder([], testFolder2);
      await checkMessagesInFolder(["Green", "My"], testFolder3);
      browser.test.log(JSON.stringify(messages)); // 101, 109, 103, 110, 105

      // Move a non-existent message.
      await browser.messages.move([9999], testFolder1);
      await checkMessagesInFolder(["Red", "Blue", "Happy"], testFolder1);
      browser.test.log(JSON.stringify(messages)); // 101, 109, 103, 110, 105

      // Move to a non-existent folder.
      await browser.test.assertRejects(
        browser.messages.move([messages.Red.id], {
          accountId,
          path: "/missing",
        }),
        /Unexpected error moving messages/,
        "something should happen"
      );

      // Put everything back where it was at the start of the test.
      await browser.messages.move(
        Object.values(messages).map(m => m.id),
        testFolder1
      );
      await checkMessagesInFolder(
        ["Red", "Green", "Blue", "My", "Happy"],
        testFolder1
      );
      await checkMessagesInFolder([], testFolder2);
      await checkMessagesInFolder([], testFolder3);

      // Copy one message to another folder.
      await browser.messages.copy([messages.Happy.id], testFolder2);
      await checkMessagesInFolder(
        ["Red", "Green", "Blue", "My", "Happy"],
        testFolder1
      );
      let { messages: folder2Messages } = await browser.messages.list(
        testFolder2
      );
      browser.test.assertEq(1, folder2Messages.length);
      browser.test.assertEq(messages.Happy.subject, folder2Messages[0].subject);
      browser.test.assertTrue(folder2Messages[0].id != messages.Happy.id);
      browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 104, 105, 111

      // Delete the copied message.
      await browser.messages.delete([folder2Messages[0].id], true);
      await checkMessagesInFolder(
        ["Red", "Green", "Blue", "My", "Happy"],
        testFolder1
      );
      await checkMessagesInFolder([], testFolder2);
      await checkMessagesInFolder([], testFolder3);
      browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 104, 105

      // Move a message to the trash.
      browser.test.log("this is the other failing bit");
      await browser.messages.move([messages.Green.id], trashFolder);
      await checkMessagesInFolder(["Red", "Blue", "My", "Happy"], testFolder1);
      await checkMessagesInFolder([], testFolder2);
      await checkMessagesInFolder([], testFolder3);

      let { messages: trashFolderMessages } = await browser.messages.list(
        trashFolder
      );
      browser.test.assertTrue(
        trashFolderMessages.find(m => m.subject == messages.Green.subject)
      );
      browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 104

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesMove", "messagesRead"],
    },
  });

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 1000);

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();

  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  cleanUpAccount(account);
});

// The IMAP fakeserver just can't handle this.
add_task({ skip_if: () => IS_IMAP }, async function test_archive() {
  let account2 = createAccount();
  account2.addIdentity(MailServices.accounts.createIdentity());
  let inbox2 = await createSubfolder(
    account2.incomingServer.rootFolder,
    "test"
  );
  await createMessages(inbox2, 15);

  let month = 10;
  for (let message of inbox2.messages) {
    message.date = new Date(2018, month++, 15) * 1000;
  }

  let files = {
    "background.js": async () => {
      let [accountId] = await window.waitForMessage();

      let accountBefore = await browser.accounts.get(accountId);
      browser.test.assertEq(3, accountBefore.folders.length);
      browser.test.assertEq("/test", accountBefore.folders[2].path);

      let messagesBefore = await browser.messages.list(
        accountBefore.folders[2]
      );
      browser.test.assertEq(15, messagesBefore.messages.length);
      await browser.messages.archive(messagesBefore.messages.map(m => m.id));

      let accountAfter = await browser.accounts.get(accountId);
      browser.test.assertEq(4, accountAfter.folders.length);
      browser.test.assertEq("/test", accountAfter.folders[2].path);
      browser.test.assertEq("/Archives", accountAfter.folders[3].path);
      browser.test.assertEq(3, accountAfter.folders[3].subFolders.length);
      browser.test.assertEq(
        "/Archives/2018",
        accountAfter.folders[3].subFolders[0].path
      );
      browser.test.assertEq(
        "/Archives/2019",
        accountAfter.folders[3].subFolders[1].path
      );
      browser.test.assertEq(
        "/Archives/2020",
        accountAfter.folders[3].subFolders[2].path
      );

      let messagesAfter = await browser.messages.list(accountAfter.folders[2]);
      browser.test.assertEq(0, messagesAfter.messages.length);

      let messages2018 = await browser.messages.list(
        accountAfter.folders[3].subFolders[0]
      );
      browser.test.assertEq(2, messages2018.messages.length);

      let messages2019 = await browser.messages.list(
        accountAfter.folders[3].subFolders[1]
      );
      browser.test.assertEq(12, messages2019.messages.length);

      let messages2020 = await browser.messages.list(
        accountAfter.folders[3].subFolders[2]
      );
      browser.test.assertEq(1, messages2020.messages.length);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesMove", "messagesRead"],
    },
  });

  await extension.startup();
  extension.sendMessage(account2.key);
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account2);
});
