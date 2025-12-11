/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

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

  const X_PRIORITY_MAP = {
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
    X_PRIORITY_MAP[priority] ? `X-Priority: ${X_PRIORITY_MAP[priority]}` : null,
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

add_task(async function test_messages_list_sort() {
  const account = await createAccount();
  const testFolder = await createSubfolder(
    account.incomingServer.rootFolder,
    "testFolder"
  );

  const testMessageParams = [
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
      storedTags: ["Important", "Work"],
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

  for (const params of testMessageParams) {
    await createMessageFromString(testFolder, generateTestMessage(params));
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const TAGS_MAP = new Map(
          (await browser.messages.tags.list()).map(tag => [tag.tag, tag.key])
        );

        const [testParameters] = await window.sendMessage("getTestParameters");
        const [folder] = await browser.folders.query({ name: "testFolder" });
        const { type } = await browser.accounts.get(folder.accountId);
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
          const tags = (testParameters[i].tags || []).map(requestedTag =>
            TAGS_MAP.get(requestedTag)
          );
          await browser.messages.update(messages[i].id, {
            junk,
            flagged,
            read,
            tags,
          });
          const storedTags = (
            testParameters[i].storedTags ||
            testParameters[i].tags ||
            []
          ).map(requestedTag => TAGS_MAP.get(requestedTag));
          await window.waitForCondition(async () => {
            const msg = await browser.messages.get(messages[i].id);
            return (
              msg.read == read &&
              msg.junk == junk &&
              msg.flagged == flagged &&
              msg.tags.join(", ") == storedTags.join(", ")
            );
          }, `Message should have been updated correctly.`);
        }

        // Check some values explicitly.
        const { messages: sorted_default } = await browser.messages.list(
          folder.id
        );
        window.assertDeepEqual(
          [
            {
              subject: "1",
              flagged: false,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "high",
              read: false,
              tags: ["$label1", "$label2"],
            },
            {
              subject: "2",
              flagged: true,
              junk: true,
              junkScore: 100,
              priority: type == "nntp" ? "none" : "normal",
              read: false,
              tags: ["$label2"],
            },
            {
              subject: "3",
              flagged: false,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "none",
              read: false,
              tags: ["$label3"],
            },
            {
              subject: "4",
              flagged: true,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "lowest",
              read: false,
              tags: [],
            },
            {
              subject: "5",
              flagged: false,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "none",
              read: false,
              tags: [],
            },
            {
              subject: "6",
              flagged: true,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "high",
              read: true,
              tags: ["$label2"],
            },
            {
              subject: "7",
              flagged: false,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "normal",
              read: false,
              tags: [],
            },
            {
              subject: "8",
              flagged: true,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "low",
              read: false,
              tags: ["$label1"],
            },
            {
              subject: "9",
              flagged: false,
              junk: true,
              junkScore: 100,
              priority: type == "nntp" ? "none" : "lowest",
              read: true,
              tags: [],
            },
            {
              subject: "10",
              flagged: true,
              junk: false,
              junkScore: 0,
              priority: type == "nntp" ? "none" : "highest",
              read: false,
              tags: ["$label3"],
            },
          ],
          sorted_default.map(msg => ({
            subject: msg.subject,
            flagged: msg.flagged,
            junk: msg.junk,
            junkScore: msg.junkScore,
            priority: msg.priority,
            read: msg.read,
            tags: msg.tags,
          })),
          "Messages should have the default order and the correct values.",
          { strict: true }
        );

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
          // NNTP test server does not report sizes correctly.
          size_descending: type == "nntp" ? null : ["1","8","9","6","7","10","4","2","5","3"],
          size_ascending: type == "nntp" ? null : ["3","5","2","4","10","7","6","9","8","1"],
          // Not populated for NNTP.
          priority_descending: type == "nntp" ? null : ["10","1","6","2","3","5","7","8","4","9"],
          priority_ascending: type == "nntp" ? null : ["4","9","8","2","3","5","7","1","6","10"],
          // Not populated for NNTP.
          recipients_descending: type == "nntp" ? null : ["10","9","8","6","7","5","4","2","3","1"],
          recipients_ascending: type == "nntp" ? null : ["1","3","2","4","5","7","6","8","9","10"],
        };

        // Test all sort types in both directions.
        for (const [sortDefinition, expected] of Object.entries(
          EXPEXTED_SORTS
        )) {
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

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 2,
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
    extension.sendMessage(testMessageParams);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(account);
});
