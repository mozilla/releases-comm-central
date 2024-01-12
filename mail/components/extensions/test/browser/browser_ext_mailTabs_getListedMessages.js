/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let messages;
const about3Pane = document.getElementById("tabmail").currentAbout3Pane;

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);

  // Modify the messages so the filters can be checked against them.

  messages = [...subFolders[0].messages];
  messages.at(-1).markRead(true);
  messages.at(-3).markRead(true);
  messages.at(-5).markRead(true);
  messages.at(-7).markRead(true);
  messages.at(-9).markRead(true);

  about3Pane.displayFolder(subFolders[0]);
});

add_task(async () => {
  async function background() {
    const ids = new Map();

    // Initially all messages are displayed.
    {
      const expected = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
      await window.sendMessage("checkVisible", expected);
      const { messages } = await browser.mailTabs.getListedMessages();
      const subjects = messages.map(m => m.subject);
      await window.sendMessage("checkVisibleSubjects", subjects);
      browser.test.assertEq(
        10,
        subjects.length,
        "Should find the correct number of listed messages"
      );

      // Map id to message idx (the order they have been generated).
      let idx = 9;
      for (const message of messages) {
        ids.set(idx--, message.id);
      }
    }

    // Filter by unread to reduce the number of displayed messages.
    {
      const expected = [8, 6, 4, 2, 0];
      await browser.mailTabs.setQuickFilter({ unread: true });
      await window.sendMessage("checkVisible", expected);
      const { messages } = await browser.mailTabs.getListedMessages();
      const subjects = messages.map(m => m.subject);
      await window.sendMessage("checkVisibleSubjects", subjects);
      browser.test.assertEq(
        5,
        subjects.length,
        "Should find the correct number of listed unread messages"
      );
      window.assertDeepEqual(
        expected.map(e => ids.get(e)),
        messages.map(m => m.id),
        "Should find the correct unread messages listed"
      );
    }

    // Remove filter and change sort order.
    {
      const expected = [3, 1, 9, 4, 7, 2, 8, 5, 6, 0];
      await browser.mailTabs.setQuickFilter({});
      await browser.mailTabs.update({
        sortOrder: "descending",
        sortType: "subject",
      });
      await window.sendMessage("checkVisible", expected);
      const { messages } = await browser.mailTabs.getListedMessages();
      const subjects = messages.map(m => m.subject);
      await window.sendMessage("checkVisibleSubjects", subjects);
      browser.test.assertEq(
        10,
        subjects.length,
        "Should find the correct number of listed re-sorted messages"
      );
      window.assertDeepEqual(
        expected.map(e => ids.get(e)),
        messages.map(m => m.id),
        "Should find the correct unread messages listed"
      );
    }

    browser.test.notifyPass("getListedMessages");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead"],
    },
  });

  extension.onMessage("checkVisible", async expected => {
    const actual = [];
    const dbView = about3Pane.gDBView;
    for (let i = 0; i < dbView.rowCount; i++) {
      actual.push(messages.indexOf(dbView.getMsgHdrAt(i)));
    }

    Assert.deepEqual(actual, expected);
    extension.sendMessage();
  });

  extension.onMessage("checkVisibleSubjects", async expected => {
    const actual = [];
    const dbView = about3Pane.gDBView;
    for (let i = 0; i < dbView.rowCount; i++) {
      actual.push(dbView.getMsgHdrAt(i).subject);
    }

    Assert.deepEqual(actual, expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("getListedMessages");
  await extension.unload();
});
