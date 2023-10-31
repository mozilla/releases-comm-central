/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function test_query() {
  const account = createAccount();

  const textAttachment = {
    body: "textAttachment",
    filename: "test.txt",
    contentType: "text/plain",
  };

  const subFolders = {
    test1: await createSubfolder(account.incomingServer.rootFolder, "test1"),
    test2: await createSubfolder(account.incomingServer.rootFolder, "test2"),
  };
  await createMessages(subFolders.test1, { count: 9, age_incr: { days: 2 } });

  const messages = [...subFolders.test1.messages];
  // NB: Here, the messages are zero-indexed. In the test they're one-indexed.
  subFolders.test1.markMessagesRead([messages[0]], true);
  subFolders.test1.markMessagesFlagged([messages[1]], true);
  subFolders.test1.markMessagesFlagged([messages[6]], true);

  subFolders.test1.addKeywordsToMessages(messages.slice(0, 1), "notATag");
  subFolders.test1.addKeywordsToMessages(messages.slice(2, 4), "$label2");
  subFolders.test1.addKeywordsToMessages(messages.slice(3, 6), "$label3");

  addIdentity(account, messages[5].author.replace(/.*<(.*)>/, "$1"));
  // No recipient support for NNTP.
  if (account.incomingServer.type != "nntp") {
    addIdentity(account, messages[2].recipients.replace(/.*<(.*)>/, "$1"));
  }

  await createMessages(subFolders.test2, { count: 7, age_incr: { days: 2 } });
  // Email with multipart/alternative.
  await createMessageFromFile(
    subFolders.test2,
    do_get_file("messages/alternative.eml").path
  );

  await createMessages(subFolders.test2, {
    count: 1,
    subject: "1 text attachment",
    attachments: [textAttachment],
  });

  const files = {
    "background.js": async () => {
      const [accountId] = await window.waitForMessage();
      const _account = await browser.accounts.get(accountId);
      const accountType = _account.type;

      const messages1 = await browser.messages.list({
        accountId,
        path: "/test1",
      });
      browser.test.assertEq(9, messages1.messages.length);
      const messages2 = await browser.messages.list({
        accountId,
        path: "/test2",
      });
      browser.test.assertEq(9, messages2.messages.length);

      // Check all messages are returned.
      const { messages: allMessages } = await browser.messages.query({
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(18, allMessages.length);

      const folder1 = { accountId, path: "/test1" };
      const folder2 = { accountId, path: "/test2" };
      const rootFolder = { accountId, path: "/" };

      // Query messages from test1. No messages from test2 should be returned.
      // We'll use these messages as a reference for further tests.
      const { messages: referenceMessages } = await browser.messages.query({
        folder: folder1,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(9, referenceMessages.length);
      browser.test.assertTrue(
        referenceMessages.every(m => m.folder.path == "/test1")
      );

      // Test includeSubFolders: Default (False).
      const { messages: searchRecursiveDefault } = await browser.messages.query(
        {
          folder: rootFolder,
          autoPaginationTimeout: 0,
        }
      );
      browser.test.assertEq(
        0,
        searchRecursiveDefault.length,
        "includeSubFolders: Default"
      );

      // Test includeSubFolders: True.
      const { messages: searchRecursiveTrue } = await browser.messages.query({
        folder: rootFolder,
        includeSubFolders: true,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(
        18,
        searchRecursiveTrue.length,
        "includeSubFolders: True"
      );

      // Test includeSubFolders: False.
      const { messages: searchRecursiveFalse } = await browser.messages.query({
        folder: rootFolder,
        includeSubFolders: false,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(
        0,
        searchRecursiveFalse.length,
        "includeSubFolders: False"
      );

      // Test attachment query: False.
      const { messages: searchAttachmentFalse } = await browser.messages.query({
        attachment: false,
        includeSubFolders: true,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(
        17,
        searchAttachmentFalse.length,
        "attachment: False"
      );

      // Test attachment query: Range.
      const { messages: searchAttachmentRange } = await browser.messages.query({
        attachment: { min: 1, max: 2 },
        includeSubFolders: true,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(
        1,
        searchAttachmentRange.length,
        "attachment: Range"
      );

      // Test attachment query: True.
      const { messages: searchAttachmentTrue } = await browser.messages.query({
        attachment: true,
        includeSubFolders: true,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(1, searchAttachmentTrue.length, "attachment: True");

      // Dump the reference messages to the console for easier debugging.
      browser.test.log("Reference messages:");
      for (const m of referenceMessages) {
        const date = m.date.toISOString().substring(0, 10);
        const author = m.author.replace(/"(.*)".*/, "$1").padEnd(16, " ");
        // No recipient support for NNTP.
        const recipients =
          accountType == "nntp"
            ? ""
            : m.recipients[0].replace(/(.*) <.*>/, "$1").padEnd(16, " ");
        browser.test.log(
          `[${m.id}] ${date} From: ${author} To: ${recipients} Subject: ${m.subject}`
        );
      }

      const subtest = async function (queryInfo, ...expectedMessageIndices) {
        if (!queryInfo.folder) {
          queryInfo.folder = folder1;
        }
        browser.test.log("Testing " + JSON.stringify(queryInfo));
        const { messages: actualMessages } = await browser.messages.query({
          ...queryInfo,
          autoPaginationTimeout: 0,
        });

        browser.test.assertEq(
          expectedMessageIndices.length,
          actualMessages.length,
          "Correct number of messages"
        );
        for (const index of expectedMessageIndices) {
          // browser.test.log(`Looking for message ${index}`);
          if (!actualMessages.some(am => am.id == index)) {
            browser.test.fail(`Message ${index} was not returned`);
            browser.test.log(
              "These messages were returned: " + actualMessages.map(am => am.id)
            );
          }
        }
      };

      // Date range query. The messages are 0 days old, 2 days old, 4 days old, etc..
      const today = new Date();
      const date1 = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 5
      );
      const date2 = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 11
      );
      await subtest({ fromDate: today });
      await subtest({ fromDate: date1 }, 1, 2, 3);
      await subtest({ fromDate: date2 }, 1, 2, 3, 4, 5, 6);
      await subtest({ toDate: date1 }, 4, 5, 6, 7, 8, 9);
      await subtest({ toDate: date2 }, 7, 8, 9);
      await subtest({ fromDate: date1, toDate: date2 });
      await subtest({ fromDate: date2, toDate: date1 }, 4, 5, 6);

      // Unread query. Only message 1 has been read.
      await subtest({ unread: false }, 1);
      await subtest({ unread: true }, 2, 3, 4, 5, 6, 7, 8, 9);

      // Flagged query. Messages 2 and 7 are flagged.
      await subtest({ flagged: true }, 2, 7);
      await subtest({ flagged: false }, 1, 3, 4, 5, 6, 8, 9);

      // Subject query.
      let keyword = referenceMessages[1].subject.split(" ")[1];
      await subtest({ subject: keyword }, 2);
      await subtest({ fullText: keyword }, 2);

      // Author query.
      keyword = referenceMessages[2].author.replace('"', "").split(" ")[0];
      await subtest({ author: keyword }, 3);
      await subtest({ fullText: keyword }, 3);

      // Recipients query.
      // No recipient support for NNTP.
      if (accountType != "nntp") {
        keyword = referenceMessages[7].recipients[0].split(" ")[0];
        await subtest({ recipients: keyword }, 8);
        await subtest({ fullText: keyword }, 8);
        await subtest({ body: keyword }, 8);
      }

      // From Me and To Me. These use the identities added to account.
      await subtest({ fromMe: true }, 6);
      // No recipient support for NNTP.
      if (accountType != "nntp") {
        await subtest({ toMe: true }, 3);
      }

      // Tags query.
      await subtest({ tags: { mode: "any", tags: { notATag: true } } });
      await subtest({ tags: { mode: "any", tags: { $label2: true } } }, 3, 4);
      await subtest(
        { tags: { mode: "any", tags: { $label3: true } } },
        4,
        5,
        6
      );
      await subtest(
        { tags: { mode: "any", tags: { $label2: true, $label3: true } } },
        3,
        4,
        5,
        6
      );
      await subtest({
        tags: { mode: "all", tags: { $label1: true, $label2: true } },
      });
      await subtest(
        { tags: { mode: "all", tags: { $label2: true, $label3: true } } },
        4
      );
      await subtest(
        { tags: { mode: "any", tags: { $label2: false, $label3: false } } },
        1,
        2,
        7,
        8,
        9
      );
      await subtest(
        { tags: { mode: "all", tags: { $label2: false, $label3: false } } },
        1,
        2,
        3,
        5,
        6,
        7,
        8,
        9
      );

      // headerMessageId query
      await subtest({ headerMessageId: "0@made.up.invalid" }, 1);
      await subtest({ headerMessageId: "7@made.up.invalid" }, 8);
      await subtest({ headerMessageId: "8@made.up.invalid" }, 9);
      await subtest({ headerMessageId: "unknown@made.up.invalid" });

      // attachment query
      await subtest({ folder: folder2, attachment: true }, 18);

      // text in nested html part of multipart/alternative
      await subtest({ folder: folder2, body: "I am HTML!" }, 17);

      // No recipient support for NNTP.
      if (accountType != "nntp") {
        // advanced search on recipients
        await subtest({ folder: folder2, recipients: "karl; heinz" }, 17);
        await subtest(
          { folder: folder2, recipients: "<friedrich@example.COM>; HEINZ" },
          17
        );
        await subtest(
          {
            folder: folder2,
            recipients: "karl <friedrich@example.COM>; HEINZ",
          },
          17
        );
        await subtest({
          folder: folder2,
          recipients: "Heinz <friedrich@example.COM>; Karl",
        });
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();
});

registerCleanupFunction(() => {
  // Make sure any open address book database is given a chance to close.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );
});
