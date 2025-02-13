/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

add_task(async function test_folder_isVirtual() {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const _testFolder1 = await createSubfolder(rootFolder, "testFolder1");
  const _testFolder2 = await createSubfolder(rootFolder, "testFolder2");
  await createMessages(_testFolder1, 6);
  await createMessages(_testFolder2, 6);

  VirtualFolderHelper.createNewVirtualFolder(
    "searchFolder",
    rootFolder,
    [_testFolder1, _testFolder2],
    "ANY",
    false
  );

  const files = {
    "background.js": async () => {
      for (const testFolderName of ["testFolder1", "testFolder2"]) {
        // List the content of the normal test folders, which have 6 messages each.
        const rv = await browser.folders.query({ name: testFolderName });
        browser.test.assertEq(
          1,
          rv.length,
          `Should have found the correct number of folders with name '${testFolderName}'`
        );
        const [testFolder] = rv;
        browser.test.assertEq(
          false,
          testFolder.isVirtual,
          "isVirtual should be correct"
        );
        const { messages: testMessages } = await browser.messages.list(
          testFolder.id
        );
        browser.test.assertEq(
          6,
          testMessages.length,
          `Should have found the correct number of messages inside '${testFolderName}'`
        );

        // Run a query over the test folder, which should return 6 messages each.
        const { messages: queryMessages } = await browser.messages.query({
          folderId: testFolder.id,
          autoPaginationTimeout: 0,
        });
        browser.test.assertEq(
          6,
          queryMessages.length,
          "The query over the testFolder should have found the correct number of messages."
        );
      }

      // List the content of the virtual searchFolder, which should find the
      // 12 messages of all  test folders.
      const rv = await browser.folders.query({ name: "searchFolder" });
      browser.test.assertEq(
        1,
        rv.length,
        "Should have found the correct number of folders with name 'searchFolder'"
      );
      const [searchFolder] = rv;
      browser.test.assertEq(
        true,
        searchFolder.isVirtual,
        "isVirtual should be correct"
      );
      const { messages: searchedMessages } = await browser.messages.list(
        searchFolder.id
      );
      browser.test.assertEq(
        12,
        searchedMessages.length,
        "Should have found the correct number of messages inside 'searchFolder'"
      );

      // Run a query over the searchFolder, which should return 12 messages.
      const { messages: queryMessages } = await browser.messages.query({
        folderId: searchFolder.id,
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(
        12,
        queryMessages.length,
        "The query over the searchFolder should have found the correct number of messages."
      );

      // Run a query over everything, which should still return only 12 messages,
      // because messages are only reported once.
      const { messages: allMessages } = await browser.messages.query({
        autoPaginationTimeout: 0,
      });
      browser.test.assertEq(
        12,
        allMessages.length,
        "The query over everything should have found the correct number of messages."
      );

      // Folder queries.
      const isVirtualFalseQuery = await browser.folders.query({
        isVirtual: false,
      });
      window.assertDeepEqual(
        ["/testFolder1", "/testFolder2"],
        isVirtualFalseQuery.map(f => f.path).filter(f => f.includes("Folder")),
        "The isVirtual=false query should return the correct result",
        { strict: true }
      );

      const isVirtualTrueQuery = await browser.folders.query({
        isVirtual: true,
      });
      window.assertDeepEqual(
        ["/searchFolder"],
        isVirtualTrueQuery.map(f => f.path),
        "The isVirtual=true query should return the correct result",
        { strict: true }
      );

      // The /searchFolder should not expose its search folders as subfolders.
      const subFolders = await browser.folders.getSubFolders(searchFolder.id);
      browser.test.assertEq(
        0,
        subFolders.length,
        "The /searchFolder should not expose its search folders as subfolders"
      );

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
