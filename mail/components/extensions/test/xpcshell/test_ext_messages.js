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
    account = createAccount();
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
    Services.prefs.setBoolPref(
      "extensions.webextensions.warnings-as-errors",
      false
    );
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref(
        "extensions.webextensions.warnings-as-errors"
      );
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
  async function test_pagination() {
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
    const account2 = createAccount();
    account2.addIdentity(MailServices.accounts.createIdentity());
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

add_task(
  {
    // This is basically a unit test for the MessageList implementation and does
    // not need to be tested for IMAP and NNTP individually.
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_list_auto_early_page_return() {
    const files = {
      "background.js": async () => {
        const [folder] = await window.waitForMessage();

        let page = await browser.messages.list(folder);
        const listId = page.id;
        // This test uses 10 messages per page. The first page should have been
        // returned before all 99 messages have been added to 10 pages.
        // Aborting the list prevents further additions. Therefore, we should not
        // be able to receive all 10 pages.
        browser.messages.abortList(listId);

        browser.test.assertEq(
          36,
          listId.length,
          "The listId should have the correct length"
        );
        browser.test.assertEq(
          10,
          page.messages.length,
          "The page should have the correct number of messages"
        );

        // Search for the last page.
        let pageCount = 1;
        while (page.id) {
          pageCount++;
          browser.test.assertEq(
            listId,
            page.id,
            "The listId should be correct"
          );
          page = await browser.messages.continueList(listId);
        }

        browser.test.assertEq(
          2,
          pageCount,
          "Should have received only 2 pages."
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
        permissions: ["accountsRead", "messagesRead"],
      },
    });

    Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);

    await extension.startup();
    extension.sendMessage({ accountId: account.key, path: "/Trash" });
    await extension.awaitFinish("finished");
    await extension.unload();

    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  }
);

add_task(
  {
    // This is basically a unit test for the MessageList implementation and does
    // not need to be tested for IMAP and NNTP individually.
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_query_auto_early_page_return() {
    const files = {
      "background.js": async () => {
        const [folder] = await window.waitForMessage();

        let page = await browser.messages.query({
          folder,
          messagesPerPage: 10,
        });
        const listId = page.id;
        // This test uses 10 messages per page. The first page should have been
        // returned before all 99 messages have been added to 10 pages.
        // Aborting the list prevents further additions. Therefore, we should not
        // be able to receive all 10 pages.
        browser.messages.abortList(listId);

        browser.test.assertEq(
          36,
          listId.length,
          "The listId should have the correct length"
        );
        browser.test.assertEq(
          10,
          page.messages.length,
          "The page should have the correct number of messages"
        );

        // Search for the last page.
        let pageCount = 1;
        while (page.id) {
          pageCount++;
          browser.test.assertEq(
            listId,
            page.id,
            "The listId should be correct"
          );
          page = await browser.messages.continueList(listId);
        }

        browser.test.assertEq(
          2,
          pageCount,
          "Should have received only 2 pages."
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
        permissions: ["accountsRead", "messagesRead"],
      },
    });

    await extension.startup();
    extension.sendMessage({ accountId: account.key, path: "/Trash" });
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    // This is basically a unit test for the MessageQuery implementation and does
    // not need to be tested for IMAP and NNTP individually.
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_query_auto_pagination() {
    const files = {
      "schema.json": [
        {
          namespace: "PaginationTest",
          functions: [
            {
              name: "throttledQuery",
              type: "function",
              async: true,
              parameters: [
                {
                  type: "object",
                  name: "queryInfo",
                  properties: {
                    folder: {
                      $ref: "folders.MailFolder",
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
      "implementation.js": () => {
        var { ExtensionCommon } = ChromeUtils.importESModule(
          "resource://gre/modules/ExtensionCommon.sys.mjs"
        );
        var { MessageQuery } = ChromeUtils.importESModule(
          "resource:///modules/ExtensionMessages.sys.mjs"
        );
        this.PaginationTest = class extends ExtensionCommon.ExtensionAPI {
          getAPI(context) {
            const { extension } = context;
            const { messageManager } = extension;
            const messageListTracker = messageManager._messageListTracker;

            return {
              PaginationTest: {
                async throttledQuery(queryInfo) {
                  let msgCounter = 1;
                  const messageDelays = new Map();
                  messageDelays.set(2, 1500);
                  messageDelays.set(6, 1500);

                  const messageQuery = new MessageQuery(
                    queryInfo,
                    messageListTracker,
                    extension,
                    async () => {
                      // This is a dummy checkSearchCriteriaFn().
                      const delay = messageDelays.get(msgCounter) || 0;
                      if (delay) {
                        console.log(
                          `Simulating a prolonged synchronous search for message #${msgCounter}`
                        );
                        const start = Date.now();
                        while (Date.now() - start < delay) {
                          // No Op.
                        }
                      }
                      msgCounter++;
                      return true;
                    }
                  );
                  return messageQuery.startSearch();
                },
              },
            };
          }
        };
      },
      "background.js": async () => {
        const [folder] = await window.waitForMessage();

        // Test the auto-pagination mechanism and the ability to retrieve pages
        // as soon as they are available.
        // If the search process happens to be purely synchronous (determined by
        // queryInfo), the execution flow will not return to the WebExtension
        // before the entire messages-add-process has finished. We therefore
        // interrupt the synchronous execution in MessageQuery.searchMessages()
        // after new pages have been added and allow pending callbacks on the call
        // stack to be processed.
        //
        // This test will return 99 messages, but will need 1500ms to find the
        // 2nd and 6th message. The auto-pagination after the default 1000ms will
        // create early pages and the enforced interruption will allow the
        // WebExtension to receive the pages before the entire message-add-process
        // has finished.
        const firstPage = await browser.PaginationTest.throttledQuery({
          folder,
        });
        const firstPageCreationTime = Date.now();
        const listId = firstPage.id;
        browser.test.assertEq(
          36,
          listId.length,
          "The listId should have the correct length"
        );
        browser.test.assertEq(
          2,
          firstPage.messages.length,
          "The first page should be correct"
        );

        const secondPage = await browser.messages.continueList(listId);
        const secondPageCreationTime = Date.now();
        browser.test.assertEq(
          listId,
          secondPage.id,
          "The listId should be correct"
        );
        browser.test.assertEq(
          4,
          secondPage.messages.length,
          "The second page should be correct"
        );

        const thirdPage = await browser.messages.continueList(listId);
        browser.test.assertEq(
          null,
          thirdPage.id,
          "The listId should be correct"
        );
        browser.test.assertEq(
          93,
          thirdPage.messages.length,
          "The third page should be correct"
        );

        browser.test.assertTrue(
          secondPageCreationTime - firstPageCreationTime > 1000,
          `secondPageCreationTime - firstPageCreationTime > 1000: ${
            secondPageCreationTime - firstPageCreationTime
          }`
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
        permissions: ["accountsRead", "messagesRead"],
        experiment_apis: {
          PaginationTest: {
            schema: "schema.json",
            parent: {
              scopes: ["addon_parent"],
              paths: [["PaginationTest"]],
              script: "implementation.js",
            },
          },
        },
      },
    });

    await extension.startup();
    extension.sendMessage({ accountId: account.key, path: "/Trash" });
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    // This is basically a unit test for the MessageQuery implementation and does
    // not need to be tested for IMAP and NNTP individually.
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_query_auto_pagination_custom_timeout() {
    const files = {
      "schema.json": [
        {
          namespace: "PaginationTest",
          functions: [
            {
              name: "throttledQuery",
              type: "function",
              async: true,
              parameters: [
                {
                  type: "object",
                  name: "queryInfo",
                  properties: {
                    folder: {
                      $ref: "folders.MailFolder",
                    },
                    autoPaginationTimeout: {
                      type: "integer",
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
      "implementation.js": () => {
        var { ExtensionCommon } = ChromeUtils.importESModule(
          "resource://gre/modules/ExtensionCommon.sys.mjs"
        );
        var { MessageQuery } = ChromeUtils.importESModule(
          "resource:///modules/ExtensionMessages.sys.mjs"
        );
        this.PaginationTest = class extends ExtensionCommon.ExtensionAPI {
          getAPI(context) {
            const { extension } = context;
            const { messageManager } = extension;
            const messageListTracker = messageManager._messageListTracker;

            return {
              PaginationTest: {
                async throttledQuery(queryInfo) {
                  let msgCounter = 1;
                  const messageDelays = new Map();
                  messageDelays.set(2, 500);
                  messageDelays.set(6, 500);

                  const messageQuery = new MessageQuery(
                    queryInfo,
                    messageListTracker,
                    extension,
                    async () => {
                      // This is a dummy checkSearchCriteriaFn().
                      const delay = messageDelays.get(msgCounter) || 0;
                      if (delay) {
                        console.log(
                          `Simulating a prolonged synchronous search for message #${msgCounter}`
                        );
                        const start = Date.now();
                        while (Date.now() - start < delay) {
                          // No Op.
                        }
                      }
                      msgCounter++;
                      return true;
                    }
                  );
                  return messageQuery.startSearch();
                },
              },
            };
          }
        };
      },
      "background.js": async () => {
        const [folder] = await window.waitForMessage();

        // This test will return 99 messages, but will need 500ms to find the
        // 2nd and 6th message. The auto-pagination after the custom 250ms will
        // create early pages and the enforced interruption will allow the
        // WebExtension to receive the pages before the entire message-add-process
        // has finished.
        const firstPage = await browser.PaginationTest.throttledQuery({
          folder,
          autoPaginationTimeout: 250,
        });
        const firstPageCreationTime = Date.now();
        const listId = firstPage.id;
        browser.test.assertEq(
          36,
          listId.length,
          "The listId should have the correct length"
        );
        browser.test.assertEq(
          2,
          firstPage.messages.length,
          "The first page should be correct"
        );

        const secondPage = await browser.messages.continueList(listId);
        const secondPageCreationTime = Date.now();
        browser.test.assertEq(
          listId,
          secondPage.id,
          "The listId should be correct"
        );
        browser.test.assertEq(
          4,
          secondPage.messages.length,
          "The second page should be correct"
        );

        const thirdPage = await browser.messages.continueList(listId);
        browser.test.assertEq(
          null,
          thirdPage.id,
          "The listId should be correct"
        );
        browser.test.assertEq(
          93,
          thirdPage.messages.length,
          "The second page should be correct"
        );

        browser.test.assertTrue(
          secondPageCreationTime - firstPageCreationTime > 250,
          `secondPageCreationTime - firstPageCreationTime > 250: ${
            secondPageCreationTime - firstPageCreationTime
          }`
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
        permissions: ["accountsRead", "messagesRead"],
        experiment_apis: {
          PaginationTest: {
            schema: "schema.json",
            parent: {
              scopes: ["addon_parent"],
              paths: [["PaginationTest"]],
              script: "implementation.js",
            },
          },
        },
      },
    });

    await extension.startup();
    extension.sendMessage({ accountId: account.key, path: "/Trash" });
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    // This is basically a unit test for the MessageQuery implementation and does
    // not need to be tested for IMAP and NNTP individually.
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_query_disabled_auto_pagination() {
    const files = {
      "schema.json": [
        {
          namespace: "PaginationTest",
          functions: [
            {
              name: "throttledQuery",
              type: "function",
              async: true,
              parameters: [
                {
                  type: "object",
                  name: "queryInfo",
                  properties: {
                    folder: {
                      $ref: "folders.MailFolder",
                    },
                    autoPaginationTimeout: {
                      type: "integer",
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
      "implementation.js": () => {
        var { ExtensionCommon } = ChromeUtils.importESModule(
          "resource://gre/modules/ExtensionCommon.sys.mjs"
        );
        var { MessageQuery } = ChromeUtils.importESModule(
          "resource:///modules/ExtensionMessages.sys.mjs"
        );
        this.PaginationTest = class extends ExtensionCommon.ExtensionAPI {
          getAPI(context) {
            const { extension } = context;
            const { messageManager } = extension;
            const messageListTracker = messageManager._messageListTracker;

            return {
              PaginationTest: {
                async throttledQuery(queryInfo) {
                  let msgCounter = 1;
                  const messageDelays = new Map();
                  messageDelays.set(2, 500);
                  messageDelays.set(6, 500);
                  messageDelays.set(10, 500);
                  messageDelays.set(30, 500);

                  const messageQuery = new MessageQuery(
                    queryInfo,
                    messageListTracker,
                    extension,
                    async () => {
                      // This is a dummy checkSearchCriteriaFn().
                      const delay = messageDelays.get(msgCounter) || 0;
                      if (delay) {
                        console.log(
                          `Simulating a prolonged synchronous search for message #${msgCounter}`
                        );
                        const start = Date.now();
                        while (Date.now() - start < delay) {
                          // No Op.
                        }
                      }
                      msgCounter++;
                      return true;
                    }
                  );
                  return messageQuery.startSearch();
                },
              },
            };
          }
        };
      },
      "background.js": async () => {
        const [folder] = await window.waitForMessage();

        // This test will return 99 messages, but will need 500ms to find the
        // 2nd, 6th, 10th and 30th message. Since auto-pagination is disabled,
        // the query will return a single page with all messages after the entire
        // message-add-process has finished.
        const firstPage = await browser.PaginationTest.throttledQuery({
          folder,
          autoPaginationTimeout: 0,
        });
        browser.test.assertEq(
          null,
          firstPage.id,
          "The listId should not be present"
        );
        browser.test.assertEq(
          99,
          firstPage.messages.length,
          "The first page should be correct"
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
        permissions: ["accountsRead", "messagesRead"],
        experiment_apis: {
          PaginationTest: {
            schema: "schema.json",
            parent: {
              scopes: ["addon_parent"],
              paths: [["PaginationTest"]],
              script: "implementation.js",
            },
          },
        },
      },
    });

    await extension.startup();
    extension.sendMessage({ accountId: account.key, path: "/Trash" });
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    // This is basically a unit test for the MessageQuery implementation and does
    // not need to be tested for IMAP and NNTP individually.
    skip_if: () => IS_IMAP || IS_NNTP,
  },
  async function test_query_returnMessageListId() {
    const files = {
      "schema.json": [
        {
          namespace: "PaginationTest",
          functions: [
            {
              name: "throttledQuery",
              type: "function",
              async: true,
              parameters: [
                {
                  type: "object",
                  name: "queryInfo",
                  properties: {
                    folder: {
                      $ref: "folders.MailFolder",
                    },
                    autoPaginationTimeout: {
                      type: "integer",
                    },
                    returnMessageListId: {
                      type: "boolean",
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
      "implementation.js": () => {
        var { ExtensionCommon } = ChromeUtils.importESModule(
          "resource://gre/modules/ExtensionCommon.sys.mjs"
        );
        var { MessageQuery } = ChromeUtils.importESModule(
          "resource:///modules/ExtensionMessages.sys.mjs"
        );
        this.PaginationTest = class extends ExtensionCommon.ExtensionAPI {
          getAPI(context) {
            const { extension } = context;
            const { messageManager } = extension;
            const messageListTracker = messageManager._messageListTracker;

            return {
              PaginationTest: {
                async throttledQuery(queryInfo) {
                  let msgCounter = 1;
                  const searchResults = new Map();
                  searchResults.set(6, true);
                  searchResults.set(55, true);

                  const messageQuery = new MessageQuery(
                    queryInfo,
                    messageListTracker,
                    extension,
                    async () => {
                      // This is a dummy checkSearchCriteriaFn().
                      const result = searchResults.has(msgCounter);
                      console.log(
                        `Simulating a prolonged synchronous search for message #${msgCounter}`
                      );
                      const start = Date.now();
                      while (Date.now() - start < 20) {
                        // No Op.
                      }
                      msgCounter++;
                      return result;
                    }
                  );
                  return messageQuery.startSearch();
                },
              },
            };
          }
        };
      },
      "background.js": async () => {
        const [folder] = await window.waitForMessage();

        // This test will return message #6 and message #55, and will need 20ms
        // to check each of the 99 messages in the specified folder.
        // Since autoPagination is disabled and returnMessageListId is enabled,
        // the query should return the listId immediately, and one page with two
        // messages after all 99 messages have been processed.
        const listId = await browser.PaginationTest.throttledQuery({
          folder,
          autoPaginationTimeout: 0,
          returnMessageListId: true,
        });
        const listCreationTime = Date.now();
        browser.test.assertEq(
          36,
          listId.length,
          "The listId should have the correct length"
        );

        const firstPage = await browser.messages.continueList(listId);
        const firstPageCreationTime = Date.now();
        browser.test.assertEq(
          null,
          firstPage.id,
          "The listId should be correct"
        );
        browser.test.assertEq(
          2,
          firstPage.messages.length,
          "The page should be correct"
        );

        browser.test.assertTrue(
          firstPageCreationTime - listCreationTime >= 1980,
          `secondPageCreationTime - firstPageCreationTime >= 99*20 = 1980: ${
            firstPageCreationTime - listCreationTime
          }`
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
        permissions: ["accountsRead", "messagesRead"],
        experiment_apis: {
          PaginationTest: {
            schema: "schema.json",
            parent: {
              scopes: ["addon_parent"],
              paths: [["PaginationTest"]],
              script: "implementation.js",
            },
          },
        },
      },
    });

    await extension.startup();
    extension.sendMessage({ accountId: account.key, path: "/Trash" });
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);
