/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function test_query() {
  const account1 = createAccount();
  const account2 = createAccount("none");

  const subFolders = {
    test1: await createSubfolder(account1.incomingServer.rootFolder, "test1"),
    test2: await createSubfolder(account1.incomingServer.rootFolder, "test2"),
    test3: await createSubfolder(account2.incomingServer.rootFolder, "test3"),
    test4: await createSubfolder(account2.incomingServer.rootFolder, "test4"),
  };
  await createMessages(subFolders.test1, 1);
  await createMessages(subFolders.test2, 2);
  await createMessages(subFolders.test3, 4);
  await createMessages(subFolders.test4, 8);

  const files = {
    "background.js": async () => {
      const [folder1] = await browser.folders.query({ name: "test1" });
      const [folder2] = await browser.folders.query({ name: "test2" });
      const [folder3] = await browser.folders.query({ name: "test3" });
      const [folder4] = await browser.folders.query({ name: "test4" });

      // Get messages per folder.
      const msgs = {};
      for (const folderId of [folder1.id, folder2.id, folder3.id, folder4.id]) {
        const { messages } = await browser.messages.list(folderId);
        msgs[folderId] = messages.map(message => message.id);
      }
      browser.test.assertEq(
        1,
        msgs[folder1.id].length,
        "/test1 messages should be ok"
      );
      browser.test.assertEq(
        2,
        msgs[folder2.id].length,
        "/test2 messages should be ok"
      );
      browser.test.assertEq(
        4,
        msgs[folder3.id].length,
        "/test3 messages should be ok"
      );
      browser.test.assertEq(
        8,
        msgs[folder4.id].length,
        "/test4 messages should be ok"
      );

      // Check accounts of folders.
      browser.test.assertTrue(
        folder1.accountId == folder2.accountId,
        "The /test1 and /test2 folders should be from the same account"
      );
      browser.test.assertTrue(
        folder3.accountId == folder4.accountId,
        "The /test3 and /test4 folders should be from the same account"
      );
      browser.test.assertTrue(
        folder1.accountId != folder3.accountId,
        "The /test1 and /test3 folders should not be from the same account"
      );

      // Test query().
      const TESTS = [
        {
          description: "#1 (single folderId)",
          queryInfo: {
            folderId: folder1.id,
          },
          expected: msgs[folder1.id],
        },
        {
          description: "#2 (single folderId as array)",
          queryInfo: {
            folderId: [folder2.id],
          },
          expected: msgs[folder2.id],
        },
        {
          description: "#3 (multiple folderIds)",
          queryInfo: {
            folderId: [folder1.id, folder2.id],
          },
          expected: [...msgs[folder1.id], ...msgs[folder2.id]],
        },
        {
          description: "#4 (multiple folderIds, but flipped)",
          queryInfo: {
            folderId: [folder4.id, folder1.id],
          },
          expected: [...msgs[folder4.id], ...msgs[folder1.id]],
        },
        {
          description: "#5 (single accountId)",
          queryInfo: {
            accountId: folder1.accountId,
          },
          expected: [...msgs[folder1.id], ...msgs[folder2.id]],
        },
        {
          description: "#6 (single accountId as array)",
          queryInfo: {
            accountId: [folder3.accountId],
          },
          expected: [...msgs[folder3.id], ...msgs[folder4.id]],
        },
        {
          description: "#7 (multiple accountIds)",
          queryInfo: {
            accountId: [folder1.accountId, folder3.accountId],
          },
          expected: [
            ...msgs[folder1.id],
            ...msgs[folder2.id],
            ...msgs[folder3.id],
            ...msgs[folder4.id],
          ],
        },
        {
          description: "#8 (multiple accountIds, but flipped)",
          queryInfo: {
            accountId: [folder3.accountId, folder1.accountId],
          },
          expected: [
            ...msgs[folder3.id],
            ...msgs[folder4.id],
            ...msgs[folder1.id],
            ...msgs[folder2.id],
          ],
        },
        {
          description: "#9 (folderIds and accountId, with supression)",
          queryInfo: {
            accountId: [folder3.accountId],
            folderId: [folder3.id, folder1.id],
          },
          expected: [...msgs[folder3.id]],
        },
        {
          description: "#10 (folderIds and accountId, without supression)",
          queryInfo: {
            accountId: [folder3.accountId],
            folderId: [folder3.id, folder4.id],
          },
          expected: [...msgs[folder3.id], ...msgs[folder4.id]],
        },
      ];
      for (const test of TESTS) {
        const rv = await browser.messages.query(test.queryInfo);
        window.assertDeepEqual(
          test.expected,
          rv.messages.map(message => message.id),
          `Result for test ${test.description} should be as expected`,
          { strict: true }
        );
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "messagesUpdate"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
