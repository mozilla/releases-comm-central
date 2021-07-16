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
var { ExtensionsUI } = ChromeUtils.import(
  "resource:///modules/ExtensionsUI.jsm"
);

let account, rootFolder, subFolders;
add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function setup() {
    account = createAccount();
    rootFolder = account.incomingServer.rootFolder;
    subFolders = {
      test0: await createSubfolder(rootFolder, "test0"),
      test1: await createSubfolder(rootFolder, "test1"),
      test2: await createSubfolder(rootFolder, "test2"),
      test3: await createSubfolder(rootFolder, "test3"),
      test4: await createSubfolder(rootFolder, "test4"),
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
    await createMessages(subFolders.test4, 1);
  }
);

add_task(async function non_canonical_permission_description_mapping() {
  let { msgs } = ExtensionsUI._buildStrings({
    addon: { name: "FakeExtension" },
    permissions: {
      origins: [],
      permissions: ["accountsRead", "messagesMove"],
    },
  });
  equal(2, msgs.length, "Correct amount of descriptions");
  equal(
    "See your mail accounts, their identities and their folders",
    msgs[0],
    "Correct description for accountsRead"
  );
  equal(
    "Copy or move your email messages (including moving them to the trash folder)",
    msgs[1],
    "Correct description for messagesMove"
  );
});

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_pagination() {
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
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_update() {
    let files = {
      "background.js": async () => {
        function newUpdatePromise(numberOfEventsToCollapse = 1) {
          return new Promise(resolve => {
            let seenEvents = {};
            const listener = (msg, props) => {
              if (!seenEvents.hasOwnProperty(msg.id)) {
                seenEvents[msg.id] = {
                  counts: 0,
                  props: {},
                };
              }

              seenEvents[msg.id].counts++;
              for (let prop of Object.keys(props)) {
                seenEvents[msg.id].props[prop] = props[prop];
              }

              if (seenEvents[msg.id].counts == numberOfEventsToCollapse) {
                browser.messages.onUpdated.removeListener(listener);
                resolve({ msg, props: seenEvents[msg.id].props });
              }
            };
            browser.messages.onUpdated.addListener(listener);
          });
        }

        let tags = await browser.messages.listTags();
        let [data] = await window.waitForMessage();
        let messageList = await browser.messages.list(data.folder);
        browser.test.assertEq(1, messageList.messages.length);
        let message = messageList.messages[0];
        browser.test.assertFalse(message.flagged);
        browser.test.assertFalse(message.read);
        browser.test.assertFalse(message.junk);
        browser.test.assertEq(0, message.junkScore);
        browser.test.assertEq(0, message.tags.length);
        browser.test.assertEq(data.size, message.size);
        browser.test.assertEq("99@made.up.invalid", message.headerMessageId);

        // Test that setting flagged works.
        let updatePromise = newUpdatePromise();
        await browser.messages.update(message.id, { flagged: true });
        let updateInfo = await updatePromise;
        browser.test.assertEq(message.id, updateInfo.msg.id);
        window.assertDeepEqual({ flagged: true }, updateInfo.props);
        await window.sendMessage("flagged");

        // Test that setting read works.
        updatePromise = newUpdatePromise();
        await browser.messages.update(message.id, { read: true });
        updateInfo = await updatePromise;
        browser.test.assertEq(message.id, updateInfo.msg.id);
        window.assertDeepEqual({ read: true }, updateInfo.props);
        await window.sendMessage("read");

        // Test that setting junk works.
        updatePromise = newUpdatePromise();
        await browser.messages.update(message.id, { junk: true });
        updateInfo = await updatePromise;
        browser.test.assertEq(message.id, updateInfo.msg.id);
        window.assertDeepEqual({ junk: true }, updateInfo.props);
        await window.sendMessage("junk");

        // Test that setting one tag works.
        updatePromise = newUpdatePromise();
        await browser.messages.update(message.id, { tags: [tags[0].key] });
        updateInfo = await updatePromise;
        browser.test.assertEq(message.id, updateInfo.msg.id);
        window.assertDeepEqual({ tags: [tags[0].key] }, updateInfo.props);
        await window.sendMessage("tags1");

        // Test that setting two tags works. We get 3 events: one removing tags0,
        // one adding tags1 and one adding tags2. updatePromise is waiting for
        // the third one before resolving.
        updatePromise = newUpdatePromise(3);
        await browser.messages.update(message.id, {
          tags: [tags[1].key, tags[2].key],
        });
        updateInfo = await updatePromise;
        browser.test.assertEq(message.id, updateInfo.msg.id);
        window.assertDeepEqual(
          { tags: [tags[1].key, tags[2].key] },
          updateInfo.props
        );
        await window.sendMessage("tags2");

        // Test that unspecified properties aren't changed.
        let listenerCalls = 0;
        const listenerFunc = (msg, props) => {
          listenerCalls++;
        };
        browser.messages.onUpdated.addListener(listenerFunc);
        await browser.messages.update(message.id, {});
        await window.sendMessage("empty");
        // Check if the no-op update call triggered a listener.
        await new Promise(resolve => setTimeout(resolve));
        browser.messages.onUpdated.removeListener(listenerFunc);
        browser.test.assertEq(
          0,
          listenerCalls,
          "Not expecting listener callbacks on no-op updates."
        );

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
        updatePromise = newUpdatePromise(5);
        await browser.messages.update(message.id, {
          flagged: false,
          read: false,
          junk: false,
          tags: [],
        });
        updateInfo = await updatePromise;
        window.assertDeepEqual(
          {
            flagged: false,
            read: false,
            junk: false,
            tags: [],
          },
          updateInfo.props
        );
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
    extension.sendMessage({
      folder: { accountId: account.key, path: "/test0" },
      size: message.messageSize,
    });

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
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_move_copy_delete() {
    let files = {
      "background.js": async () => {
        async function checkMessagesInFolder(expectedKeys, folder) {
          let expectedSubjects = expectedKeys.map(k => messages[k].subject);
          browser.test.log("expected: " + expectedSubjects);
          let { messages: actualMessages } = await browser.messages.list(
            folder
          );
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

        function newMovePromise(numberOfEventsToCollapse = 1) {
          return new Promise(resolve => {
            let seenEvents = 0;
            let seenSrcMsgs = [];
            let seenDstMsgs = [];
            const listener = (srcMsgs, dstMsgs) => {
              seenEvents++;
              seenSrcMsgs.push(...srcMsgs.messages);
              seenDstMsgs.push(...dstMsgs.messages);
              if (seenEvents == numberOfEventsToCollapse) {
                browser.messages.onMoved.removeListener(listener);
                resolve({ srcMsgs: seenSrcMsgs, dstMsgs: seenDstMsgs });
              }
            };
            browser.messages.onMoved.addListener(listener);
          });
        }

        function newCopyPromise(numberOfEventsToCollapse = 1) {
          return new Promise(resolve => {
            let seenEvents = 0;
            let seenSrcMsgs = [];
            let seenDstMsgs = [];
            const listener = (srcMsgs, dstMsgs) => {
              seenEvents++;
              seenSrcMsgs.push(...srcMsgs.messages);
              seenDstMsgs.push(...dstMsgs.messages);
              if (seenEvents == numberOfEventsToCollapse) {
                browser.messages.onCopied.removeListener(listener);
                resolve({ srcMsgs: seenSrcMsgs, dstMsgs: seenDstMsgs });
              }
            };
            browser.messages.onCopied.addListener(listener);
          });
        }

        function newDeletePromise(numberOfEventsToCollapse = 1) {
          return new Promise(resolve => {
            let seenEvents = 0;
            let seenMsgs = [];
            const listener = msgs => {
              seenEvents++;
              seenMsgs.push(...msgs.messages);
              if (seenEvents == numberOfEventsToCollapse) {
                browser.messages.onDeleted.removeListener(listener);
                resolve(seenMsgs);
              }
            };
            browser.messages.onDeleted.addListener(listener);
          });
        }

        async function checkEventInformation(
          infoPromise,
          expected,
          messages,
          dstFolder
        ) {
          let eventInfo = await infoPromise;
          browser.test.assertEq(eventInfo.srcMsgs.length, expected.length);
          browser.test.assertEq(eventInfo.dstMsgs.length, expected.length);
          for (let msg of expected) {
            let idx = eventInfo.srcMsgs.findIndex(
              e => e.id == messages[msg].id
            );
            browser.test.assertEq(
              eventInfo.srcMsgs[idx].subject,
              messages[msg].subject
            );
            browser.test.assertEq(
              eventInfo.dstMsgs[idx].subject,
              messages[msg].subject
            );
            browser.test.assertEq(
              eventInfo.dstMsgs[idx].folder.path,
              dstFolder.path
            );
          }
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
        let movePromise = newMovePromise();
        await browser.messages.move([messages.Red.id], testFolder2);
        await checkEventInformation(
          movePromise,
          ["Red"],
          messages,
          testFolder2
        );
        await checkMessagesInFolder(
          ["Green", "Blue", "My", "Happy"],
          testFolder1
        );
        await checkMessagesInFolder(["Red"], testFolder2);
        browser.test.log(JSON.stringify(messages)); // 106, 102, 103, 104, 105

        // And back again.
        movePromise = newMovePromise();
        await browser.messages.move([messages.Red.id], testFolder1);
        await checkEventInformation(
          movePromise,
          ["Red"],
          messages,
          testFolder1
        );
        await checkMessagesInFolder(
          ["Red", "Green", "Blue", "My", "Happy"],
          testFolder1
        );
        await checkMessagesInFolder([], testFolder2);
        browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 103, 105

        // Move two messages to another folder.
        movePromise = newMovePromise();
        await browser.messages.move(
          [messages.Green.id, messages.My.id],
          testFolder2
        );
        await checkEventInformation(
          movePromise,
          ["Green", "My"],
          messages,
          testFolder2
        );
        await checkMessagesInFolder(["Red", "Blue", "Happy"], testFolder1);
        await checkMessagesInFolder(["Green", "My"], testFolder2);
        browser.test.log(JSON.stringify(messages)); // 101, 107, 103, 108, 105

        // Move one back again.
        movePromise = newMovePromise();
        await browser.messages.move([messages.My.id], testFolder1);
        await checkEventInformation(movePromise, ["My"], messages, testFolder1);
        await checkMessagesInFolder(
          ["Red", "Blue", "My", "Happy"],
          testFolder1
        );
        await checkMessagesInFolder(["Green"], testFolder2);
        browser.test.log(JSON.stringify(messages)); // 101, 107, 103, 104, 105

        // Move messages from different folders to a third folder. We collapse
        // the two events (one for each source folder).
        movePromise = newMovePromise(2);
        await browser.messages.move(
          [messages.Green.id, messages.My.id],
          testFolder3
        );
        await checkEventInformation(
          movePromise,
          ["Green", "My"],
          messages,
          testFolder3
        );
        await checkMessagesInFolder(["Red", "Blue", "Happy"], testFolder1);
        await checkMessagesInFolder([], testFolder2);
        await checkMessagesInFolder(["Green", "My"], testFolder3);
        browser.test.log(JSON.stringify(messages)); // 101, 109, 103, 110, 105

        // The following tests should not trigger move events.
        let listenerCalls = 0;
        const listenerFunc = () => {
          listenerCalls++;
        };
        browser.messages.onMoved.addListener(listenerFunc);

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

        // Check that no move event was triggered.
        browser.messages.onMoved.removeListener(listenerFunc);
        browser.test.assertEq(0, listenerCalls);

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
        let copyPromise = newCopyPromise();
        await browser.messages.copy([messages.Happy.id], testFolder2);
        await checkEventInformation(
          copyPromise,
          ["Happy"],
          messages,
          testFolder2
        );
        await checkMessagesInFolder(
          ["Red", "Green", "Blue", "My", "Happy"],
          testFolder1
        );
        let { messages: folder2Messages } = await browser.messages.list(
          testFolder2
        );
        browser.test.assertEq(1, folder2Messages.length);
        browser.test.assertEq(
          messages.Happy.subject,
          folder2Messages[0].subject
        );
        browser.test.assertTrue(folder2Messages[0].id != messages.Happy.id);
        browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 104, 105, 111

        // Delete the copied message.
        let deletePromise = newDeletePromise();
        await browser.messages.delete([folder2Messages[0].id], true);
        // Check if the delete information is correct.
        let deleteLog = await deletePromise;
        browser.test.assertEq(1, deleteLog.length);
        browser.test.assertEq(folder2Messages[0].id, deleteLog[0].id);
        // Check if the message was deleted.
        await checkMessagesInFolder(
          ["Red", "Green", "Blue", "My", "Happy"],
          testFolder1
        );
        await checkMessagesInFolder([], testFolder2);
        await checkMessagesInFolder([], testFolder3);
        browser.test.log(JSON.stringify(messages)); // 101, 102, 103, 104, 105

        // Move a message to the trash.
        movePromise = newMovePromise();
        browser.test.log("this is the other failing bit");
        await browser.messages.move([messages.Green.id], trashFolder);
        await checkEventInformation(
          movePromise,
          ["Green"],
          messages,
          trashFolder
        );
        await checkMessagesInFolder(
          ["Red", "Blue", "My", "Happy"],
          testFolder1
        );
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
        permissions: [
          "accountsRead",
          "messagesMove",
          "messagesRead",
          "messagesDelete",
        ],
      },
    });

    Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 1000);

    await extension.startup();
    extension.sendMessage(account.key);
    await extension.awaitFinish("finished");
    await extension.unload();

    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_delete_without_permission() {
    let files = {
      "background.js": async () => {
        let [accountId] = await window.waitForMessage();
        let { folders } = await browser.accounts.get(accountId);
        let testFolder4 = folders.find(f => f.name == "test4");

        let { messages: folder4Messages } = await browser.messages.list(
          testFolder4
        );

        // Try to delete a message.
        await browser.test.assertThrows(
          () => browser.messages.delete([folder4Messages[0].id], true),
          `browser.messages.delete is not a function`,
          "Should reject deleting without proper permission"
        );

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
    extension.sendMessage(account.key);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_move_anc_copy_without_permission() {
    let files = {
      "background.js": async () => {
        let [accountId] = await window.waitForMessage();
        let { folders } = await browser.accounts.get(accountId);
        let testFolder4 = folders.find(f => f.name == "test4");
        let testFolder3 = folders.find(f => f.name == "test3");

        let { messages: folder4Messages } = await browser.messages.list(
          testFolder4
        );

        // Try to move a message.
        await browser.test.assertRejects(
          browser.messages.move([folder4Messages[0].id], testFolder3),
          `Using messages.move() requires the "accountsRead" and the "messagesMove" permission`,
          "Should reject move without proper permission"
        );

        // Try to copy a message.
        await browser.test.assertRejects(
          browser.messages.copy([folder4Messages[0].id], testFolder3),
          `Using messages.copy() requires the "accountsRead" and the "messagesMove" permission`,
          "Should reject copy without proper permission"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    let extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["messagesRead", "accountsRead"],
      },
    });

    await extension.startup();
    extension.sendMessage(account.key);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

// The IMAP fakeserver just can't handle this.
add_task({ skip_if: () => IS_IMAP || IS_NNTP }, async function test_archive() {
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
});
