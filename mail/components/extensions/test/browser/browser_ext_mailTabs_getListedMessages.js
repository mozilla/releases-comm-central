/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let gMessages, gDefaultAbout3Pane;

/**
 * Generate a minimal MIME message as a string for testing.
 *
 * @param {object} options - Message options.
 * @param {string} options.subject - The message subject.
 * @param {string} options.from - The From address.
 * @param {string} options.to - The To address.
 * @param {Date} options.date - The message date.
 * @param {string} options.messageId - The Message-ID header.
 * @param {string} [options.priority] - The priority
 * @param {integer} [options.size] - A size indicator (not the actual size, but
 *   the final size will be somewhat proportional to this value - working with
 *   actual sizes is difficult due to different line-end-handling depending on
 *   OS and protocols)
 * @returns {string} MIME-formatted message string.
 */
function generateTestMessage({
  subject,
  from,
  to,
  date,
  messageId,
  priority,
  size,
}) {
  const dateStr = date.toUTCString();

  const PRIORITY_MAP = {
    highest: 1,
    high: 2,
    normal: 3,
    low: 4,
    lowest: 5,
  };

  const LOREM_IPSUM =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
    "Nullam vel mollis nisi. In in libero justo. Nunc luctus commodo lacus, " +
    "lacinia fermentum massa mollis at. In condimentum dui eget lorem tempus " +
    "hendrerit. Sed quis sodales est. Vivamus sed mauris nec arcu consequat " +
    "euismod vel sit amet nisi. Pellentesque habitant morbi tristique senectus " +
    "et netus et malesuada fames ac turpis egestas. Nullam ac orci vitae nunc " +
    "aliquet vehicula at a erat. Sed sit amet metus nec dolor dictum volutpat " +
    "id eu sem. Curabitur rhoncus urna vitae leo consectetur, eu posuere mauris " +
    "porttitor. Morbi ac imperdiet enim, et cursus libero.\r\n";

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${dateStr}`,
    `Message-ID: <${messageId}>`,
    PRIORITY_MAP[priority] ? `X-Priority: ${PRIORITY_MAP[priority]}` : null,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
  ];

  return (
    headers.filter(Boolean).join("\r\n") +
    "\r\n\r\n" +
    `This is a test message with message-id: <${messageId}>.\r\n\r\n` +
    LOREM_IPSUM.repeat(size)
  );
}

const TEST_MESSAGE_PARAMETERS = [
  {
    subject: "1",
    from: "carol@example.com",
    to: "bob@example.com",
    date: new Date("2025-02-15T08:00:00Z"),
    messageId: "msg1@example.com",
    spam: false,
    priority: "high",
    flagged: false,
    size: 20,
    tags: ["Work", "Important"],
    // In the UI tags are always ordered based on their keys, to maintain a
    // consistent order independent of the order they were applied. The API
    // returns them in key order as well. The key of the "Important" tag is
    // "$label1" and the key of the "Work" tag is "$label2". When sorting
    // messages by tags, the order is based on the sorted tag arrays as well.
    stored_tags: ["Important", "Work"],
  },
  {
    subject: "2",
    from: "alice@example.com",
    to: "frank@example.com",
    date: new Date("2025-11-02T09:30:00Z"),
    messageId: "msg2@example.com",
    spam: true,
    priority: "normal",
    flagged: true,
    size: 8,
    tags: ["Work"],
  },
  {
    subject: "3",
    from: "grace@example.com",
    to: "dave@example.com",
    date: new Date("2025-06-18T10:15:00Z"),
    messageId: "msg3@example.com",
    spam: false,
    priority: "none",
    flagged: false,
    size: 3,
    tags: ["Personal"],
  },
  {
    subject: "4",
    from: "eve@example.com",
    to: "heidi@example.com",
    date: new Date("2025-08-25T11:45:00Z"),
    messageId: "msg4@example.com",
    spam: false,
    priority: "lowest",
    flagged: true,
    size: 9,
  },
  {
    subject: "5",
    from: "kate@example.com",
    to: "judy@example.com",
    date: new Date("2025-01-05T12:00:00Z"),
    messageId: "msg5@example.com",
    spam: false,
    priority: "none",
    flagged: false,
    size: 5,
  },
  {
    subject: "6",
    from: "ivan@example.com",
    to: "nina@example.com",
    date: new Date("2025-03-12T13:20:00Z"),
    messageId: "msg6@example.com",
    spam: false,
    priority: "high",
    flagged: true,
    size: 16,
    read: true,
    tags: ["Work"],
  },
  {
    subject: "7",
    from: "oliver@example.com",
    to: "leo@example.com",
    date: new Date("2025-10-07T14:40:00Z"),
    messageId: "msg7@example.com",
    spam: false,
    priority: "normal",
    flagged: false,
    size: 11,
  },
  {
    subject: "8",
    from: "mike@example.com",
    to: "paul@example.com",
    date: new Date("2025-04-08T15:50:00Z"),
    messageId: "msg8@example.com",
    spam: false,
    priority: "low",
    flagged: true,
    size: 18,
    tags: ["Important"],
  },
  {
    subject: "9",
    from: "steve@example.com",
    to: "rachel@example.com",
    date: new Date("2025-07-09T16:10:00Z"),
    messageId: "msg9@example.com",
    spam: true,
    priority: "lowest",
    flagged: false,
    size: 17,
    read: true,
  },
  {
    subject: "10",
    from: "quinn@example.com",
    to: "tina@example.com",
    date: new Date("2025-12-10T17:30:00Z"),
    messageId: "msg10@example.com",
    spam: false,
    priority: "highest",
    flagged: true,
    size: 10,
    tags: ["Personal"],
  },
];

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  await createMessages(subFolders[0], 10);

  const testFolder = await createSubfolder(
    account.incomingServer.rootFolder,
    "listFolder"
  );

  for (const params of TEST_MESSAGE_PARAMETERS) {
    await createMessageFromString(testFolder, generateTestMessage(params));
  }

  // Modify the messages so the filters can be checked against them.
  gMessages = [...subFolders[0].messages];
  gMessages.at(-1).markRead(true);
  gMessages.at(-3).markRead(true);
  gMessages.at(-5).markRead(true);
  gMessages.at(-7).markRead(true);
  gMessages.at(-9).markRead(true);

  gDefaultAbout3Pane = document.getElementById("tabmail").currentAbout3Pane;
  gDefaultAbout3Pane.displayFolder(subFolders[0]);
});

add_task(async function test_listed_messages_as_viewed() {
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
    const dbView = gDefaultAbout3Pane.gDBView;
    for (let i = 0; i < dbView.rowCount; i++) {
      actual.push(gMessages.indexOf(dbView.getMsgHdrAt(i)));
    }

    Assert.deepEqual(actual, expected);
    extension.sendMessage();
  });

  extension.onMessage("checkVisibleSubjects", async expected => {
    const actual = [];
    const dbView = gDefaultAbout3Pane.gDBView;
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

add_task(async function test_listed_messages_as_sorted() {
  async function background() {
    const TAGS_MAP = await browser.messages.tags.list();

    const [testParameters] = await window.sendMessage("getTestParameters");
    const [folder] = await browser.folders.query({ name: "listFolder" });
    await browser.mailTabs.update({ displayedFolderId: folder.id });

    const { messages } = await browser.messages.list(folder.id);
    browser.test.assertEq(
      10,
      messages.length,
      "Should find the correct number of messages"
    );

    // Set spam, flagged, read and tags based on testParameters.
    for (let i = 0; i < messages.length; i++) {
      const junk = testParameters[i].spam ?? false;
      const flagged = testParameters[i].flagged ?? false;
      const read = testParameters[i].read ?? false;
      const tags = (testParameters[i].tags || []).map(
        requestedTag => TAGS_MAP.find(t => t.tag == requestedTag).key
      );
      await browser.messages.update(messages[i].id, {
        junk,
        flagged,
        read,
        tags,
      });
      const stored_tags = (
        testParameters[i].stored_tags ||
        testParameters[i].tags ||
        []
      ).map(requestedTag => TAGS_MAP.find(t => t.tag == requestedTag).key);
      await window.waitForCondition(async () => {
        const msg = await browser.messages.get(messages[i].id);
        return (
          msg.read == read &&
          msg.junk == junk &&
          msg.flagged == flagged &&
          msg.tags.join(", ") == stored_tags.join(", ")
        );
      }, `Message should have been updated correctly.`);
    }

    // Expected values for ascending and descending sort are not always the
    // exact inverse of each other because messages with the same sort key
    // retain their relative order.
    /* prettier-ignore */
    const EXPEXTED_SORTS = {
        default: ["1","2","3","4","5","6","7","8","9","10"],
        // Test once that the default sort order is descending.
        date: ["10","2","7","4","9","3","8","6","1","5"],
        date_descending: ["10","2","7","4","9","3","8","6","1","5"],
        date_ascending: ["5","1","6","8","3","9","4","7","2","10"],
        flagged_descending: ["2","4","6","8","10","1","3","5","7","9"],
        flagged_ascending: ["1","3","5","7","9","2","4","6","8","10"],
        junkScore_descending: ["2","9","1","3","4","5","6","7","8","10"],
        junkScore_ascending: ["1","3","4","5","6","7","8","10","2","9"],
        junk_descending: ["2","9","1","3","4","5","6","7","8","10"],
        junk_ascending: ["1","3","4","5","6","7","8","10","2","9"],
        subject_descending: ["9","8","7","6","5","4","3","2","10","1"],
        subject_ascending: ["1","10","2","3","4","5","6","7","8","9"],
        author_descending: ["9","10","7","8","5","6","3","4","1","2"],
        author_ascending: ["2","1","4","3","6","5","8","7","10","9"],
        read_descending: ["6","9","1","2","3","4","5","7","8","10"],
        read_ascending: ["1","2","3","4","5","7","8","10","6","9"],
        tags_descending: ["4","5","7","9","3","10","2","6","1","8"],
        tags_ascending: ["8","1","2","6","3","10","4","5","7","9"],
        size_descending: ["1","8","9","6","7","10","4","2","5","3"],
        size_ascending: ["3","5","2","4","10","7","6","9","8","1"],
        priority_descending: ["10","1","6","2","3","5","7","8","4","9"],
        priority_ascending: ["4","9","8","2","3","5","7","1","6","10"],
        recipients_descending: ["10","9","8","6","7","5","4","2","3","1"],
        recipients_ascending: ["1","3","2","4","5","7","6","8","9","10"],
      };

    // Test all sort types in both directions.
    for (const [sortDefinition, expected] of Object.entries(EXPEXTED_SORTS)) {
      if (expected === null) {
        continue;
      }
      const sortOptions = {};
      const [sortType, sortOrder] = sortDefinition.split("_");
      if (sortType != "default") {
        sortOptions.sortType = sortType;
        if (sortOrder) {
          sortOptions.sortOrder = sortOrder;
        }
      }

      const { messages: sorted } = await browser.messages.list(
        folder.id,
        sortOptions
      );
      window.assertDeepEqual(
        expected,
        sorted.map(msg => msg.subject),
        `Messages should be sorted by ${sortType} ${sortOrder}`
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
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [
        "accountsRead",
        "messagesRead",
        "messagesUpdate",
        "messagesTagsList",
      ],
    },
  });

  extension.onMessage("getTestParameters", () => {
    extension.sendMessage(TEST_MESSAGE_PARAMETERS);
  });

  await extension.startup();
  await extension.awaitFinish("getListedMessages");
  await extension.unload();
});
