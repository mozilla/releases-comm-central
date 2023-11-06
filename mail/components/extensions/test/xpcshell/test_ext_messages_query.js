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

      const [folder1] = await browser.folders.query({ name: "test1" });
      const [folder2] = await browser.folders.query({ name: "test2" });

      const messages1 = await browser.messages.list(folder1.id);
      browser.test.assertEq(9, messages1.messages.length);
      const messages2 = await browser.messages.list(folder2.id);
      browser.test.assertEq(9, messages2.messages.length);

      // Check all messages are returned.
      const { messages: allMessages } = await browser.messages.query({
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(18, allMessages.length);

      // FIXME: Expose account root folder.
      const rootFolder = { id: `${accountId}://`, accountId, path: "/" };

      // Mark two messages in folder1 as junk.
      await browser.messages.update(messages1.messages[4].id, { junk: true });
      await browser.messages.update(messages1.messages[5].id, { junk: true });

      // Mark a message in folder1 as read and unread again, to force a difference
      // between read and new.
      await browser.messages.update(messages1.messages[2].id, { read: true });
      await window.waitForCondition(async () => {
        const msg = await browser.messages.get(messages1.messages[2].id);
        return msg.read;
      }, `Message should have been marked as read.`);
      await browser.messages.update(messages1.messages[2].id, { read: false });
      await window.waitForCondition(async () => {
        const msg = await browser.messages.get(messages1.messages[2].id);
        return !msg.read;
      }, `Message should have been marked as not read.`);

      // Query messages from test1. No messages from test2 should be returned.
      // We'll use these messages as a reference for further tests.
      const { messages: referenceMessages } = await browser.messages.query({
        folderId: folder1.id,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(9, referenceMessages.length);
      browser.test.assertTrue(
        referenceMessages.every(m => m.folder.path == "/test1")
      );

      // Test includeSubFolders: Default (False).
      const { messages: searchRecursiveDefault } = await browser.messages.query(
        {
          folderId: rootFolder.id,
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
        folderId: rootFolder.id,
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
        folderId: rootFolder.id,
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
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(1, searchAttachmentTrue.length, "attachment: True");

      // Test size query range.
      const { messages: searchSizeRange } = await browser.messages.query({
        size: { min: 400, max: 700 },
        folderId: folder1.id,
        includeSubFolders: true,
        autoPaginationTimeout: 0,
      });
      const expectedSizeRange = referenceMessages.filter(
        m => m.size > 400 && m.size < 700
      );
      browser.test.assertEq(
        expectedSizeRange.length,
        searchSizeRange.length,
        "size range"
      );

      // Test junkScore query : range.
      const { messages: searchJunkScoreRange } = await browser.messages.query({
        junkScore: { min: 50, max: 100 },
        folderId: folder1.id,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(2, searchJunkScoreRange.length, "junk: range");

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
        if (!queryInfo.folderId) {
          queryInfo.folderId = folder1.id;
        }
        browser.test.log("Testing " + JSON.stringify(queryInfo));
        const { messages: actualMessages } = await browser.messages.query({
          ...queryInfo,
          autoPaginationTimeout: 0,
        });

        browser.test.assertEq(
          expectedMessageIndices.length,
          actualMessages.length,
          `Query ${JSON.stringify(
            queryInfo
          )}: Should have received the correct number of messages: ${JSON.stringify(
            actualMessages.map(m => m.id)
          )}`
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

      // Junk query. Only two messages are junk.
      await subtest({ junk: true }, 5, 6);
      await subtest({ junk: false }, 1, 2, 3, 4, 7, 8, 9);

      // New query. Only two messages are not new.
      await subtest({ new: false }, 1, 3);
      await subtest({ new: true }, 2, 4, 5, 6, 7, 8, 9);

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
      await subtest({ folderId: folder2.id, attachment: true }, 18);

      // text in nested html part of multipart/alternative
      await subtest({ folderId: folder2.id, body: "I am HTML!" }, 17);

      // No recipient support for NNTP.
      if (accountType != "nntp") {
        // advanced search on recipients
        await subtest({ folderId: folder2.id, recipients: "karl; heinz" }, 17);
        await subtest(
          {
            folderId: folder2.id,
            recipients: "<friedrich@example.COM>; HEINZ",
          },
          17
        );
        await subtest(
          {
            folderId: folder2.id,
            recipients: "karl <friedrich@example.COM>; HEINZ",
          },
          17
        );
        await subtest({
          folderId: folder2.id,
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
