/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

/**
 * Test cloudfile methods (getAccount, getAllAccounts, updateAccount) and
 * events (onAccountAdded, onAccountDeleted, onFileUpload, onFileUploadAbort,
 * onFileDeleted) without UI interaction.
 */
add_task(async () => {
  async function background() {
    function createCloudfileAccount() {
      let addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount");
      return addListener;
    }

    function removeCloudfileAccount(id) {
      let deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
      browser.test.sendMessage("removeAccount", id);
      return deleteListener;
    }

    function assertAccountsMatch(b, a) {
      browser.test.assertEq(a.id, b.id);
      browser.test.assertEq(a.name, b.name);
      browser.test.assertEq(a.configured, b.configured);
      browser.test.assertEq(a.uploadSizeLimit, b.uploadSizeLimit);
      browser.test.assertEq(a.spaceRemaining, b.spaceRemaining);
      browser.test.assertEq(a.spaceUsed, b.spaceUsed);
      browser.test.assertEq(a.managementUrl, b.managementUrl);
    }

    async function test_account_creation_removal() {
      browser.test.log("test_account_creation_removal");
      // Account creation
      let [createdAccount] = await createCloudfileAccount();
      assertAccountsMatch(createdAccount, {
        id: "account1",
        name: "mochitest",
        configured: false,
        uploadSizeLimit: -1,
        spaceRemaining: -1,
        spaceUsed: -1,
        managementUrl: browser.runtime.getURL("/content/management.html"),
      });

      // Other account creation
      await new Promise((resolve, reject) => {
        function accountListener(account) {
          browser.cloudFile.onAccountAdded.removeListener(accountListener);
          browser.test.fail("Got onAccountAdded for account from other addon");
          reject();
        }

        browser.cloudFile.onAccountAdded.addListener(accountListener);
        browser.test.sendMessage("createAccount", "ext-other-addon");

        // Resolve in the next tick
        setTimeout(() => {
          browser.cloudFile.onAccountAdded.removeListener(accountListener);
          resolve();
        });
      });

      // Account removal
      let [removedAccountId] = await removeCloudfileAccount(createdAccount.id);
      browser.test.assertEq(createdAccount.id, removedAccountId);
    }

    async function test_getters_update() {
      browser.test.log("test_getters_update");
      browser.test.sendMessage("createAccount", "ext-other-addon");

      let [createdAccount] = await createCloudfileAccount();

      // getAccount and getAllAccounts
      let retrievedAccount = await browser.cloudFile.getAccount(
        createdAccount.id
      );
      assertAccountsMatch(createdAccount, retrievedAccount);

      let retrievedAccounts = await browser.cloudFile.getAllAccounts();
      browser.test.assertEq(retrievedAccounts.length, 1);
      assertAccountsMatch(createdAccount, retrievedAccounts[0]);

      // update()
      let changes = {
        configured: true,
        // uploadSizeLimit intentionally left unset
        spaceRemaining: 456,
        spaceUsed: 789,
        managementUrl: "/account.html",
      };

      let changedAccount = await browser.cloudFile.updateAccount(
        retrievedAccount.id,
        changes
      );
      retrievedAccount = await browser.cloudFile.getAccount(createdAccount.id);

      let expected = {
        id: createdAccount.id,
        name: "mochitest",
        configured: true,
        uploadSizeLimit: -1,
        spaceRemaining: 456,
        spaceUsed: 789,
        managementUrl: browser.runtime.getURL("/account.html"),
      };

      assertAccountsMatch(changedAccount, expected);
      assertAccountsMatch(retrievedAccount, expected);

      await removeCloudfileAccount(createdAccount.id);
    }

    async function test_upload_delete() {
      browser.test.log("test_upload_delete");
      let [createdAccount] = await createCloudfileAccount();

      let fileId = await new Promise(resolve => {
        function fileListener(account, { id, name, data }) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(name, "cloudFile1.txt");
          browser.test.assertTrue(data instanceof ArrayBuffer);
          browser.test.assertEq(
            new TextDecoder("utf-8").decode(data),
            "you got the moves!\n"
          );
          setTimeout(() => resolve(id));
          return { url: "https://example.com/" + name };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
      });

      browser.test.log("test upload aborted");
      await new Promise(resolve => {
        async function fileListener(account, { id, name, data }) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);

          // The listener won't return until onFileUploadAbort fires. When that happens,
          // we return an aborted message, which completes the abort cycle.
          await new Promise(resolveAbort => {
            function abortListener(accountAccount, abortId) {
              browser.cloudFile.onFileUploadAbort.removeListener(abortListener);
              browser.test.assertEq(account.id, accountAccount.id);
              browser.test.assertEq(id, abortId);
              resolveAbort();
            }
            browser.cloudFile.onFileUploadAbort.addListener(abortListener);
            browser.test.sendMessage("cancelUpload", createdAccount.id);
          });

          setTimeout(resolve);
          return { aborted: true };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage(
          "uploadFile",
          createdAccount.id,
          "cloudFile2",
          "uploadCancelled"
        );
      });

      browser.test.log("test delete");
      await new Promise(resolve => {
        function fileListener(account, id) {
          browser.cloudFile.onFileDeleted.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(id, fileId);
          setTimeout(resolve);
        }

        browser.cloudFile.onFileDeleted.addListener(fileListener);
        browser.test.sendMessage("deleteFile", createdAccount.id);
      });

      await removeCloudfileAccount(createdAccount.id);
      await new Promise(resolve => setTimeout(resolve));
    }

    // Tests to run
    await test_account_creation_removal();
    await test_getters_update();
    await test_upload_delete();

    browser.test.notifyPass("cloudFile");
  }

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      applications: { gecko: { id: "cloudfile@mochi.test" } },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  let testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };

  let uploads = {};

  extension.onMessage("createAccount", (id = "ext-cloudfile@mochi.test") => {
    cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage("uploadFile", (id, filename, expected = Cr.NS_OK) => {
    let account = cloudFileAccounts.getAccount(id);

    if (typeof expected == "string") {
      expected = cloudFileAccounts.constants[expected];
    }

    account.uploadFile(null, testFiles[filename]).then(
      upload => {
        Assert.equal(Cr.NS_OK, expected);
        uploads[filename] = upload;
      },
      status => {
        Assert.equal(status, expected);
      }
    );
  });

  extension.onMessage("cancelUpload", id => {
    let account = cloudFileAccounts.getAccount(id);
    account.cancelFileUpload(null, testFiles.cloudFile2);
  });

  extension.onMessage("deleteFile", id => {
    let account = cloudFileAccounts.getAccount(id);
    account.deleteFile(null, uploads.cloudFile1.id);
  });

  Assert.ok(!cloudFileAccounts.getProviderForType("ext-cloudfile@mochi.test"));
  await extension.startup();
  Assert.ok(cloudFileAccounts.getProviderForType("ext-cloudfile@mochi.test"));
  Assert.equal(cloudFileAccounts.accounts.length, 1);

  await extension.awaitFinish("cloudFile");
  await extension.unload();

  Assert.ok(!cloudFileAccounts.getProviderForType("ext-cloudfile@mochi.test"));
  Assert.equal(cloudFileAccounts.accounts.length, 0);
});

/**
 * Test the tab parameter in cloudFile.onFileUpload, cloudFile.onFileDeleted and
 * cloudFile.onFileUploadAbort listeners with UI interaction.
 */
add_task(async () => {
  let testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };
  let uploads = {};
  let composeWindow;

  async function background() {
    function createCloudfileAccount(id) {
      let addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount", id);
      return addListener;
    }

    function removeCloudfileAccount(id) {
      let deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
      browser.test.sendMessage("removeAccount", id);
      return deleteListener;
    }

    async function test_tab_in_upload_abort_delete_listener(composeTab) {
      browser.test.log("test_upload_delete");
      let [createdAccount] = await createCloudfileAccount(
        "ext-cloudfile@mochitest"
      );

      let fileId = await new Promise(resolve => {
        function fileListener(uploadAccount, { id, name, data }, tab) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(tab.id, composeTab.id);
          browser.test.assertEq(uploadAccount.id, createdAccount.id);
          browser.test.assertEq(name, "cloudFile1.txt");
          browser.test.assertTrue(data instanceof ArrayBuffer);
          browser.test.assertEq(
            new TextDecoder("utf-8").decode(data),
            "you got the moves!\n"
          );
          setTimeout(() => resolve(id));
          return { url: "https://example.com/" + name };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
      });

      browser.test.log("test upload aborted");
      await new Promise(resolve => {
        async function fileListener(uploadAccount, { id, name, data }, tab) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(tab.id, composeTab.id);

          // The listener won't return until onFileUploadAbort fires. When that happens,
          // we return an aborted message, which completes the abort cycle.
          await new Promise(resolveAbort => {
            function abortListener(abortAccount, abortId, tab) {
              browser.cloudFile.onFileUploadAbort.removeListener(abortListener);
              browser.test.assertEq(tab.id, composeTab.id);
              browser.test.assertEq(uploadAccount.id, abortAccount.id);
              browser.test.assertEq(id, abortId);
              resolveAbort();
            }
            browser.cloudFile.onFileUploadAbort.addListener(abortListener);
            browser.test.sendMessage("cancelUpload", createdAccount.id);
          });

          setTimeout(resolve);
          return { aborted: true };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage(
          "uploadFile",
          createdAccount.id,
          "cloudFile2",
          "uploadCancelled"
        );
      });

      browser.test.log("test delete");
      await new Promise(resolve => {
        function fileListener(deleteAccount, id, tab) {
          browser.cloudFile.onFileDeleted.removeListener(fileListener);
          browser.test.assertEq(tab.id, composeTab.id);
          browser.test.assertEq(deleteAccount.id, createdAccount.id);
          browser.test.assertEq(id, fileId);
          setTimeout(resolve);
        }

        browser.cloudFile.onFileDeleted.addListener(fileListener);
        browser.test.sendMessage("deleteFile", createdAccount.id);
      });

      await removeCloudfileAccount(createdAccount.id);
      await new Promise(resolve => setTimeout(resolve));
    }

    let composerTabs = await browser.tabs.query({
      windowType: "messageCompose",
    });
    await test_tab_in_upload_abort_delete_listener(composerTabs[0]);

    browser.test.notifyPass("finished");
  }

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      applications: { gecko: { id: "cloudfile@mochitest" } },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("createAccount", id => {
    cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage("uploadFile", (id, filename, expected = Cr.NS_OK) => {
    let cloudFileAccount = cloudFileAccounts.getAccount(id);

    if (typeof expected == "string") {
      expected = cloudFileAccounts.constants[expected];
    }

    cloudFileAccount.uploadFile(composeWindow, testFiles[filename]).then(
      upload => {
        Assert.equal(Cr.NS_OK, expected);
        uploads[filename] = upload;
      },
      status => {
        Assert.equal(status, expected, testFiles[filename].leafName);
      }
    );
  });

  extension.onMessage("cancelUpload", id => {
    let cloudFileAccount = cloudFileAccounts.getAccount(id);
    cloudFileAccount.cancelFileUpload(composeWindow, testFiles.cloudFile2);
  });

  extension.onMessage("deleteFile", id => {
    let cloudFileAccount = cloudFileAccounts.getAccount(id);
    cloudFileAccount.deleteFile(composeWindow, uploads.cloudFile1.id);
  });

  let account = createAccount();
  addIdentity(account);

  composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  composeWindow.close();
});

add_task(async () => {
  async function background() {
    await new Promise(resolve => {
      function fileListener(account, { id, name, data }) {
        browser.cloudFile.onFileUpload.removeListener(fileListener);
        browser.test.assertEq(name, "cloudFile1.txt");
        browser.test.assertTrue(data instanceof File);
        let reader = new FileReader();
        reader.addEventListener("loadend", () => {
          browser.test.assertEq(reader.result, "you got the moves!\n");
          setTimeout(() => resolve(id));
        });
        reader.readAsText(data);
        return { url: "https://example.com/" + name };
      }

      browser.cloudFile.onFileUpload.addListener(fileListener);
      browser.test.sendMessage("uploadFile");
    });

    browser.test.notifyPass("cloudFile");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
        data_format: "File",
      },
      applications: { gecko: { id: "cloudfile@mochi.test" } },
    },
  });

  await extension.startup();

  await extension.awaitMessage("uploadFile");
  let id = "ext-cloudfile@mochi.test";
  let account = cloudFileAccounts.createAccount(id);
  await account.uploadFile(
    null,
    new FileUtils.File(getTestFilePath("data/cloudFile1.txt"))
  );

  await extension.awaitFinish("cloudFile");
  cloudFileAccounts.removeAccount(account);

  await extension.unload();
});
