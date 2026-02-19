/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { ExtensionsUI } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionsUI.sys.mjs"
);

let account, rootFolder, subFolders;

add_setup(
  {
    skip_if: () => IS_NNTP,
  },
  async function setup() {
    account = await createAccount();
    rootFolder = account.incomingServer.rootFolder;
    subFolders = {
      test3: await createSubfolder(rootFolder, "test3"),
      test4: await createSubfolder(rootFolder, "test4"),
      trash: rootFolder.getChildNamed("Trash"),
    };
    await createMessages(subFolders.trash, 99);
    await createMessages(subFolders.test4, 1);

    // There are a couple of deprecated properties in MV3, which we still want to
    // test in MV2 but also report to the user. By default, tests throw when
    // deprecated properties are used.
    ExtensionTestUtils.failOnSchemaWarnings(false);
    registerCleanupFunction(async () => {
      ExtensionTestUtils.failOnSchemaWarnings(true);
    });
    await new Promise(resolve => executeSoon(resolve));
  }
);

add_task(async function non_canonical_permission_description_mapping() {
  const { msgs } = ExtensionsUI._buildStrings({
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
  async function test_standard_pagination() {
    const files = {
      "background.js": async () => {
        // Test a response of 99 messages at 10 messages per page.
        const [folder] = await window.waitForMessage();
        let page = await browser.messages.list(folder);
        browser.test.assertEq(36, page.id.length);
        browser.test.assertEq(10, page.messages.length);

        const originalPageId = page.id;
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
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
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
  async function test_delete_without_permission() {
    const files = {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();
        const { folders } = await browser.accounts.get(accountId);
        const testFolder4 = folders.find(f => f.name == "test4");

        const { messages: folder4Messages } =
          await browser.messages.list(testFolder4);

        // Try to delete a message.
        await browser.test.assertThrows(
          () =>
            browser.messages.delete([folder4Messages[0].id], {
              deletePermanently: true,
            }),
          `browser.messages.delete is not a function`,
          "Should reject deleting without proper permission"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        browser_specific_settings: {
          gecko: { id: "messages.delete@mochi.test" },
        },
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
  async function test_move_and_copy_without_permission() {
    const files = {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();
        const { folders } = await browser.accounts.get(accountId);
        const testFolder4 = folders.find(f => f.name == "test4");
        const testFolder3 = folders.find(f => f.name == "test3");

        const { messages: folder4Messages } =
          await browser.messages.list(testFolder4);

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
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        browser_specific_settings: {
          gecko: { id: "messages.move@mochi.test" },
        },
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
add_task(
  {
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_archive() {
    const account2 = await createAccount();
    addIdentity(account2);
    const inbox2 = await createSubfolder(
      account2.incomingServer.rootFolder,
      "test"
    );
    await createMessages(inbox2, 15);

    let month = 10;
    for (const message of inbox2.messages) {
      message.date = new Date(2018, month++, 15) * 1000;
    }

    const files = {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();

        const accountBefore = await browser.accounts.get(accountId);
        browser.test.assertEq(3, accountBefore.folders.length);
        browser.test.assertEq("/test", accountBefore.folders[2].path);

        const messagesBefore = await browser.messages.list(
          accountBefore.folders[2]
        );
        browser.test.assertEq(15, messagesBefore.messages.length);
        await browser.messages.archive(messagesBefore.messages.map(m => m.id));

        const accountAfter = await browser.accounts.get(accountId);
        browser.test.assertEq(4, accountAfter.folders.length);
        browser.test.assertEq("/test", accountAfter.folders[3].path);
        browser.test.assertEq("/Archives", accountAfter.folders[0].path);
        browser.test.assertEq(3, accountAfter.folders[0].subFolders.length);
        browser.test.assertEq(
          "/Archives/2018",
          accountAfter.folders[0].subFolders[0].path
        );
        browser.test.assertEq(
          "/Archives/2019",
          accountAfter.folders[0].subFolders[1].path
        );
        browser.test.assertEq(
          "/Archives/2020",
          accountAfter.folders[0].subFolders[2].path
        );

        const messagesAfter = await browser.messages.list(
          accountAfter.folders[3]
        );
        browser.test.assertEq(0, messagesAfter.messages.length);

        const messages2018 = await browser.messages.list(
          accountAfter.folders[0].subFolders[0]
        );
        browser.test.assertEq(2, messages2018.messages.length);

        const messages2019 = await browser.messages.list(
          accountAfter.folders[0].subFolders[1]
        );
        browser.test.assertEq(12, messages2019.messages.length);

        const messages2020 = await browser.messages.list(
          accountAfter.folders[0].subFolders[2]
        );
        browser.test.assertEq(1, messages2020.messages.length);

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["accountsRead", "messagesMove", "messagesRead"],
      },
    });

    await extension.startup();
    extension.sendMessage(account2.key);
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);
