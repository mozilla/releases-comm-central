/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

const { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);

add_task(
  {
    skip_if: () => IS_NNTP || IS_IMAP,
  },
  async function test_folder_isVirtual() {
    const account = createAccount();
    const rootFolder = account.incomingServer.rootFolder;
    const _testFolder = await createSubfolder(rootFolder, "testFolder");
    await createMessages(_testFolder, 12);

    VirtualFolderHelper.createNewVirtualFolder(
      "searchFolder",
      rootFolder,
      [_testFolder],
      "ANY",
      false
    );

    const files = {
      "background.js": async () => {
        // List the content of the normal testFolder, which has 12 messages.
        const rv1 = await browser.folders.query({ name: "testFolder" });
        browser.test.assertEq(
          1,
          rv1.length,
          "Should have found the correct number of folders with name 'testFolder'"
        );
        const [testFolder] = rv1;
        browser.test.assertEq(
          false,
          testFolder.isVirtual,
          "isVirtual should be correct"
        );
        const { messages: testMessages } = await browser.messages.list(
          testFolder.id
        );
        browser.test.assertEq(
          12,
          testMessages.length,
          "Should have found the correct number of messages inside 'testFolder'"
        );

        // List the content of the virtual searchFolder, which should find the
        // 12 messages of the testFolder.
        const rv2 = await browser.folders.query({ name: "searchFolder" });
        browser.test.assertEq(
          1,
          rv2.length,
          "Should have found the correct number of folders with name 'searchFolder'"
        );
        const [searchFolder] = rv2;
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

        // Run a query over the testFolder, which should return 12 messages.
        const { messages: query1 } = await browser.messages.query({
          folderId: testFolder.id,
          autoPaginationTimeout: 0,
        });
        browser.test.assertEq(
          12,
          query1.length,
          "The query over the testFolder should have found the correct number of messages."
        );

        // Run a query over the searchFolder, which should return 12 messages.
        const { messages: query2 } = await browser.messages.query({
          folderId: searchFolder.id,
          autoPaginationTimeout: 0,
        });
        browser.test.assertEq(
          12,
          query2.length,
          "The query over the searchFolder should have found the correct number of messages."
        );

        // Run a query over everything, which should still return only 12 messages, because messages
        // are only reported once.
        const { messages: query3 } = await browser.messages.query({
          autoPaginationTimeout: 0,
        });
        browser.test.assertEq(
          12,
          query3.length,
          "The query over everything should have found the correct number of messages."
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
  }
);
