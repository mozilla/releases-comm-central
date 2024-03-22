/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);

/**
 * Test cloudfile methods (getAccount, getAllAccounts, updateAccount) and
 * events (onAccountAdded, onAccountDeleted, onFileUpload, onFileUploadAbort,
 * onFileDeleted, onFileRename) without UI interaction.
 */
add_task(async function test_without_UI() {
  async function background() {
    function createCloudfileAccount() {
      const addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount");
      return addListener;
    }

    function removeCloudfileAccount(id) {
      const deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
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
      const [createdAccount] = await createCloudfileAccount();
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
        function accountListener() {
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
      const [removedAccountId] = await removeCloudfileAccount(
        createdAccount.id
      );
      browser.test.assertEq(createdAccount.id, removedAccountId);
    }

    async function test_getters_update() {
      browser.test.log("test_getters_update");
      browser.test.sendMessage("createAccount", "ext-other-addon");

      const [createdAccount] = await createCloudfileAccount();

      // getAccount and getAllAccounts
      let retrievedAccount = await browser.cloudFile.getAccount(
        createdAccount.id
      );
      assertAccountsMatch(createdAccount, retrievedAccount);

      const retrievedAccounts = await browser.cloudFile.getAllAccounts();
      browser.test.assertEq(retrievedAccounts.length, 1);
      assertAccountsMatch(createdAccount, retrievedAccounts[0]);

      // update()
      const changes = {
        configured: true,
        // uploadSizeLimit intentionally left unset
        spaceRemaining: 456,
        spaceUsed: 789,
        managementUrl: "/account.html",
      };

      const changedAccount = await browser.cloudFile.updateAccount(
        retrievedAccount.id,
        changes
      );
      retrievedAccount = await browser.cloudFile.getAccount(createdAccount.id);

      const expected = {
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

    async function test_upload_rename_delete() {
      browser.test.log("test_upload_rename_delete");
      const [createdAccount] = await createCloudfileAccount();

      const fileId = await new Promise(resolve => {
        async function fileListener(
          account,
          { id, name, data },
          tab,
          relatedFileInfo
        ) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(name, "cloudFile1.txt");
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(data instanceof File);
          const content = await data.text();
          browser.test.assertEq(content, "you got the moves!\n");
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve(id));
          return { url: "https://example.com/" + name };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
      });

      browser.test.log("test upload error");
      await new Promise(resolve => {
        function fileListener(account, { id }, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve(id));
          return { error: true };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage(
          "uploadFile",
          createdAccount.id,
          "cloudFile2",
          "uploadErr",
          "Upload error."
        );
      });

      browser.test.log("test upload error with message");
      await new Promise(resolve => {
        function fileListener(account, { id }, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve(id));
          return { error: "Service currently unavailable." };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage(
          "uploadFile",
          createdAccount.id,
          "cloudFile2",
          "uploadErrWithCustomMessage",
          "Service currently unavailable."
        );
      });

      browser.test.log("test upload quota error");
      await browser.cloudFile.updateAccount(createdAccount.id, {
        spaceRemaining: 1,
      });
      await window.sendMessage(
        "uploadFileError",
        createdAccount.id,
        "cloudFile2",
        "uploadWouldExceedQuota",
        "Quota error: Can't upload file. Only 1KB left of quota."
      );
      await browser.cloudFile.updateAccount(createdAccount.id, {
        spaceRemaining: -1,
      });

      browser.test.log("test upload file size limit error");
      await browser.cloudFile.updateAccount(createdAccount.id, {
        uploadSizeLimit: 1,
      });
      await window.sendMessage(
        "uploadFileError",
        createdAccount.id,
        "cloudFile2",
        "uploadExceedsFileLimit",
        "Upload error: File size is 19KB and exceeds the file size limit of 1KB"
      );
      await browser.cloudFile.updateAccount(createdAccount.id, {
        uploadSizeLimit: -1,
      });

      browser.test.log("test rename with url update");
      await new Promise(resolve => {
        function fileListener(account, id, newName) {
          browser.cloudFile.onFileRename.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(newName, "cloudFile3.txt");
          setTimeout(() => resolve(id));
          return { url: "https://example.com/" + newName };
        }

        browser.cloudFile.onFileRename.addListener(fileListener);
        browser.test.sendMessage("renameFile", createdAccount.id, fileId, {
          newName: "cloudFile3.txt",
          newUrl: "https://example.com/cloudFile3.txt",
        });
      });

      browser.test.log("test rename without url update");
      await new Promise(resolve => {
        function fileListener(account, id, newName) {
          browser.cloudFile.onFileRename.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(newName, "cloudFile4.txt");
          setTimeout(() => resolve(id));
        }

        browser.cloudFile.onFileRename.addListener(fileListener);
        browser.test.sendMessage("renameFile", createdAccount.id, fileId, {
          newName: "cloudFile4.txt",
          newUrl: "https://example.com/cloudFile3.txt",
        });
      });

      browser.test.log("test rename error");
      await new Promise(resolve => {
        function fileListener(account, id, newName) {
          browser.cloudFile.onFileRename.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(newName, "cloudFile5.txt");
          setTimeout(() => resolve(id));
          return { error: true };
        }

        browser.cloudFile.onFileRename.addListener(fileListener);
        browser.test.sendMessage(
          "renameFile",
          createdAccount.id,
          fileId,
          { newName: "cloudFile5.txt" },
          "renameErr",
          "Rename error."
        );
      });

      browser.test.log("test rename error with message");
      await new Promise(resolve => {
        function fileListener(account, id, newName) {
          browser.cloudFile.onFileRename.removeListener(fileListener);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(newName, "cloudFile5.txt");
          setTimeout(() => resolve(id));
          return { error: "Service currently unavailable." };
        }

        browser.cloudFile.onFileRename.addListener(fileListener);
        browser.test.sendMessage(
          "renameFile",
          createdAccount.id,
          fileId,
          { newName: "cloudFile5.txt" },
          "renameErrWithCustomMessage",
          "Service currently unavailable."
        );
      });

      browser.test.log("test upload aborted");
      await new Promise(resolve => {
        async function fileListener(account, { id }, tab, relatedFileInfo) {
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

          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(resolve);
          return { aborted: true };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage(
          "uploadFile",
          createdAccount.id,
          "cloudFile2",
          "uploadCancelled",
          "Upload cancelled."
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
    await test_upload_rename_delete();

    browser.test.notifyPass("cloudFile");
  }

  const extension = ExtensionTestUtils.loadExtension({
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

  const testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };

  const uploads = {};

  extension.onMessage("createAccount", (id = "ext-cloudfile@mochi.test") => {
    cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage(
    "uploadFileError",
    async (id, filename, expectedErrorStatus, expectedErrorMessage) => {
      const account = cloudFileAccounts.getAccount(id);

      let status;
      try {
        await account.uploadFile(null, testFiles[filename]);
      } catch (ex) {
        status = ex;
      }

      Assert.ok(
        !!status,
        `Upload should have failed for ${testFiles[filename].leafName}`
      );
      Assert.equal(
        status.result,
        cloudFileAccounts.constants[expectedErrorStatus],
        `Error status should be correct for ${testFiles[filename].leafName}`
      );
      Assert.equal(
        status.message,
        expectedErrorMessage,
        `Error message should be correct for ${testFiles[filename].leafName}`
      );
      extension.sendMessage();
    }
  );

  extension.onMessage(
    "uploadFile",
    (id, filename, expectedErrorStatus = Cr.NS_OK, expectedErrorMessage) => {
      const account = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      account.uploadFile(null, testFiles[filename]).then(
        upload => {
          Assert.equal(Cr.NS_OK, expectedErrorStatus);
          uploads[filename] = upload;
        },
        status => {
          Assert.equal(
            status.result,
            expectedErrorStatus,
            `Error status should be correct for ${testFiles[filename].leafName}`
          );
          Assert.equal(
            status.message,
            expectedErrorMessage,
            `Error message should be correct for ${testFiles[filename].leafName}`
          );
        }
      );
    }
  );

  extension.onMessage(
    "renameFile",
    (
      id,
      uploadId,
      { newName, newUrl },
      expectedErrorStatus = Cr.NS_OK,
      expectedErrorMessage
    ) => {
      const account = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      account.renameFile(null, uploadId, newName).then(
        upload => {
          Assert.equal(Cr.NS_OK, expectedErrorStatus);
          Assert.equal(upload.name, newName, "New name should match.");
          Assert.equal(upload.url, newUrl, "New url should match.");
        },
        status => {
          Assert.equal(status.result, expectedErrorStatus);
          Assert.equal(
            status.message,
            expectedErrorMessage,
            `Error message should be correct.`
          );
        }
      );
    }
  );

  extension.onMessage("cancelUpload", id => {
    const account = cloudFileAccounts.getAccount(id);
    account.cancelFileUpload(null, testFiles.cloudFile2);
  });

  extension.onMessage("deleteFile", id => {
    const account = cloudFileAccounts.getAccount(id);
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
 * Test the tab parameter in cloudFile.onFileUpload, cloudFile.onFileDeleted,
 * cloudFile.onFileRename and cloudFile.onFileUploadAbort listeners with UI
 * interaction.
 */
add_task(async function test_compose_window_MV2() {
  const testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };
  const uploads = {};

  async function background() {
    function createCloudfileAccount(id) {
      const addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount", id);
      return addListener;
    }

    function removeCloudfileAccount(id) {
      const deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
      browser.test.sendMessage("removeAccount", id);
      return deleteListener;
    }

    async function test_tab_in_upload_rename_abort_delete_listener(composeTab) {
      browser.test.log("test_upload_delete");
      const [createdAccount] = await createCloudfileAccount(
        "ext-cloudfile@mochi.test"
      );

      const fileId = await new Promise(resolve => {
        async function fileListener(
          uploadAccount,
          { id, name, data },
          tab,
          relatedFileInfo
        ) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);

          browser.test.assertEq(tab.id, composeTab.id);
          browser.test.assertEq(uploadAccount.id, createdAccount.id);
          browser.test.assertEq(name, "cloudFile1.txt");
          // eslint-disable-next-line mozilla/use-isInstance
          browser.test.assertTrue(data instanceof File);
          const content = await data.text();
          browser.test.assertEq(content, "you got the moves!\n");

          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve(id));
          return { url: "https://example.com/" + name };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
      });

      browser.test.log("test rename with Url update");
      await new Promise(resolve => {
        function fileListener(account, id, newName, tab) {
          browser.cloudFile.onFileRename.removeListener(fileListener);
          browser.test.assertEq(tab.id, composeTab.id);
          browser.test.assertEq(account.id, createdAccount.id);
          browser.test.assertEq(newName, "cloudFile3.txt");
          setTimeout(() => resolve(id));
          return { url: "https://example.com/" + newName };
        }

        browser.cloudFile.onFileRename.addListener(fileListener);
        browser.test.sendMessage("renameFile", createdAccount.id, fileId, {
          newName: "cloudFile3.txt",
          newUrl: "https://example.com/cloudFile3.txt",
        });
      });

      browser.test.log("test upload aborted");
      await new Promise(resolve => {
        async function fileListener(
          uploadAccount,
          { id },
          tab,
          relatedFileInfo
        ) {
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

          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(resolve);
          return { aborted: true };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        browser.test.sendMessage(
          "uploadFile",
          createdAccount.id,
          "cloudFile2",
          "uploadCancelled",
          "Upload cancelled."
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

    const [composerTab] = await browser.tabs.query({
      windowType: "messageCompose",
    });
    await test_tab_in_upload_rename_abort_delete_listener(composerTab);

    browser.test.notifyPass("finished");
  }

  const extension = ExtensionTestUtils.loadExtension({
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

  extension.onMessage("createAccount", id => {
    cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage(
    "uploadFile",
    (id, filename, expectedErrorStatus = Cr.NS_OK, expectedErrorMessage) => {
      const cloudFileAccount = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      cloudFileAccount.uploadFile(composeWindow, testFiles[filename]).then(
        upload => {
          Assert.equal(Cr.NS_OK, expectedErrorStatus);
          uploads[filename] = upload;
        },
        status => {
          Assert.equal(
            status.result,
            expectedErrorStatus,
            `Error status should be correct for ${testFiles[filename].leafName}`
          );
          Assert.equal(
            status.message,
            expectedErrorMessage,
            `Error message should be correct for ${testFiles[filename].leafName}`
          );
        }
      );
    }
  );

  extension.onMessage(
    "renameFile",
    (
      id,
      uploadId,
      { newName, newUrl },
      expectedErrorStatus = Cr.NS_OK,
      expectedErrorMessage
    ) => {
      const cloudFileAccount = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      cloudFileAccount.renameFile(composeWindow, uploadId, newName).then(
        upload => {
          Assert.equal(Cr.NS_OK, expectedErrorStatus);
          Assert.equal(upload.name, newName, "New name should match.");
          Assert.equal(upload.url, newUrl, "New url should match.");
        },
        status => {
          Assert.equal(status.result, expectedErrorStatus);
          Assert.equal(
            status.message,
            expectedErrorMessage,
            `Error message should be correct.`
          );
        }
      );
    }
  );

  extension.onMessage("cancelUpload", id => {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);
    cloudFileAccount.cancelFileUpload(composeWindow, testFiles.cloudFile2);
  });

  extension.onMessage("deleteFile", id => {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);
    cloudFileAccount.deleteFile(composeWindow, uploads.cloudFile1.id);
  });

  const account = createAccount();
  addIdentity(account);

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  composeWindow.close();
});

/**
 * Test persistent cloudFile.* events (onFileUpload, onFileDeleted, onFileRename,
 * onFileUploadAbort, onAccountAdded, onAccountDeleted) with UI interaction and
 * background terminations and background restarts.
 */
add_task(async function test_compose_window_MV3_event_page() {
  const testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };
  const uploads = {};

  async function background() {
    let abortResolveCallback;
    // Whenever the extension starts or wakes up, the eventCounter is reset and
    // allows to observe the order of events fired. In case of a wake-up, the
    // first observed event is the one that woke up the background.
    let eventCounter = 0;

    browser.cloudFile.onFileUpload.addListener(
      async (uploadAccount, { id, name, data }, tab, relatedFileInfo) => {
        eventCounter++;
        browser.test.assertEq(
          eventCounter,
          1,
          "onFileUpload should be the wake up event"
        );
        const [{ cloudAccountId, composeTabId, aborting }] =
          await window.sendMessage("getEnvironment");
        browser.test.assertEq(tab.id, composeTabId);
        browser.test.assertEq(uploadAccount.id, cloudAccountId);
        browser.test.assertEq(name, "cloudFile1.txt");
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(data instanceof File);
        const content = await data.text();
        browser.test.assertEq(content, "you got the moves!\n");
        browser.test.assertEq(undefined, relatedFileInfo);

        if (aborting) {
          const abortPromise = new Promise(resolve => {
            abortResolveCallback = resolve;
          });
          browser.test.sendMessage("uploadStarted", id);
          await abortPromise;
          setTimeout(() => {
            browser.test.sendMessage("uploadAborted");
          });
          return { aborted: true };
        }

        setTimeout(() => {
          browser.test.sendMessage("uploadFinished", id);
        });
        return { url: "https://example.com/" + name };
      }
    );

    browser.cloudFile.onFileRename.addListener(
      async (account, id, newName, tab) => {
        eventCounter++;
        browser.test.assertEq(
          eventCounter,
          1,
          "onFileRename should be the wake up event"
        );
        const [{ cloudAccountId, fileId, composeTabId }] =
          await window.sendMessage("getEnvironment");
        browser.test.assertEq(tab.id, composeTabId);
        browser.test.assertEq(account.id, cloudAccountId);
        browser.test.assertEq(id, fileId);
        browser.test.assertEq(newName, "cloudFile3.txt");
        setTimeout(() => {
          browser.test.sendMessage("renameFinished", id);
        });
        return { url: "https://example.com/" + newName };
      }
    );

    browser.cloudFile.onFileDeleted.addListener(async (account, id, tab) => {
      eventCounter++;
      browser.test.assertEq(
        eventCounter,
        1,
        "onFileDeleted should be the wake up event"
      );
      const [{ cloudAccountId, fileId, composeTabId }] =
        await window.sendMessage("getEnvironment");
      browser.test.assertEq(tab.id, composeTabId);
      browser.test.assertEq(account.id, cloudAccountId);
      browser.test.assertEq(id, fileId);
      setTimeout(() => {
        browser.test.sendMessage("deleteFinished");
      });
    });

    browser.cloudFile.onFileUploadAbort.addListener(
      async (account, id, tab) => {
        eventCounter++;
        browser.test.assertEq(
          eventCounter,
          2,
          "onFileUploadAbort should not be the wake up event"
        );
        const [{ cloudAccountId, fileId, composeTabId }] =
          await window.sendMessage("getEnvironment");
        browser.test.assertEq(tab.id, composeTabId);
        browser.test.assertEq(account.id, cloudAccountId);
        browser.test.assertEq(id, fileId);
        abortResolveCallback();
      }
    );

    browser.cloudFile.onAccountAdded.addListener(account => {
      eventCounter++;
      browser.test.assertEq(
        eventCounter,
        1,
        "onAccountAdded should be the wake up event"
      );
      browser.test.sendMessage("accountCreated", account.id);
    });

    browser.cloudFile.onAccountDeleted.addListener(async accountId => {
      eventCounter++;
      browser.test.assertEq(
        eventCounter,
        1,
        "onAccountDeleted should be the wake up event"
      );
      const [{ cloudAccountId }] = await window.sendMessage("getEnvironment");
      browser.test.assertEq(accountId, cloudAccountId);
      browser.test.notifyPass("finished");
    });

    browser.runtime.onInstalled.addListener(async () => {
      eventCounter++;
      const [composeTab] = await browser.tabs.query({
        windowType: "messageCompose",
      });
      await window.sendMessage("setEnvironment", {
        composeTabId: composeTab.id,
      });
      browser.test.sendMessage("installed");
    });

    browser.test.sendMessage("background started");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 3,
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      browser_specific_settings: { gecko: { id: "cloudfile@mochi.test" } },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  function uploadFile(
    id,
    filename,
    expectedErrorStatus = Cr.NS_OK,
    expectedErrorMessage
  ) {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);

    if (typeof expectedErrorStatus == "string") {
      expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
    }

    return cloudFileAccount.uploadFile(composeWindow, testFiles[filename]).then(
      upload => {
        Assert.equal(Cr.NS_OK, expectedErrorStatus);
        uploads[filename] = upload;
      },
      status => {
        Assert.equal(
          status.result,
          expectedErrorStatus,
          `Error status should be correct for ${testFiles[filename].leafName}`
        );
        Assert.equal(
          status.message,
          expectedErrorMessage,
          `Error message should be correct for ${testFiles[filename].leafName}`
        );
      }
    );
  }
  function startUpload(id, filename) {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);
    return cloudFileAccount
      .uploadFile(composeWindow, testFiles[filename])
      .catch(() => {});
  }
  function cancelUpload(id, filename) {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);
    return cloudFileAccount.cancelFileUpload(
      composeWindow,
      testFiles[filename]
    );
  }
  function renameFile(
    id,
    uploadId,
    { newName, newUrl },
    expectedErrorStatus = Cr.NS_OK,
    expectedErrorMessage
  ) {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);

    if (typeof expectedErrorStatus == "string") {
      expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
    }

    return cloudFileAccount.renameFile(composeWindow, uploadId, newName).then(
      upload => {
        Assert.equal(Cr.NS_OK, expectedErrorStatus);
        Assert.equal(upload.name, newName, "New name should match.");
        Assert.equal(upload.url, newUrl, "New url should match.");
      },
      status => {
        Assert.equal(status.result, expectedErrorStatus);
        Assert.equal(
          status.message,
          expectedErrorMessage,
          `Error message should be correct.`
        );
      }
    );
  }
  function deleteFile(id, uploadId) {
    const cloudFileAccount = cloudFileAccounts.getAccount(id);
    return cloudFileAccount.deleteFile(composeWindow, uploadId);
  }

  const environment = {};
  extension.onMessage("setEnvironment", data => {
    if (data.composeTabId) {
      environment.composeTabId = data.composeTabId;
    }
    extension.sendMessage();
  });
  extension.onMessage("getEnvironment", () => {
    extension.sendMessage(environment);
  });

  const account = createAccount();
  addIdentity(account);

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitMessage("installed");
  await extension.awaitMessage("background started");

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "onFileUpload",
      "onFileRename",
      "onFileDeleted",
      "onFileUploadAbort",
      "onAccountAdded",
      "onAccountDeleted",
    ];
    for (const eventName of persistent_events) {
      assertPersistentListeners(extension, "cloudFile", eventName, {
        primed,
      });
    }
  }

  // Verify persistent listener, not yet primed.
  checkPersistentListeners({ primed: false });

  // Create account.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  cloudFileAccounts.createAccount("ext-cloudfile@mochi.test");
  await extension.awaitMessage("background started");
  environment.cloudAccountId = await extension.awaitMessage("accountCreated");
  checkPersistentListeners({ primed: false });

  // Upload.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  uploadFile(environment.cloudAccountId, "cloudFile1");
  await extension.awaitMessage("background started");
  environment.fileId = await extension.awaitMessage("uploadFinished");
  checkPersistentListeners({ primed: false });

  // Rename.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  renameFile(environment.cloudAccountId, environment.fileId, {
    newName: "cloudFile3.txt",
    newUrl: "https://example.com/cloudFile3.txt",
  });
  await extension.awaitMessage("background started");
  await extension.awaitMessage("renameFinished");
  checkPersistentListeners({ primed: false });

  // Delete.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  deleteFile(environment.cloudAccountId, environment.fileId);
  await extension.awaitMessage("background started");
  await extension.awaitMessage("deleteFinished");
  checkPersistentListeners({ primed: false });

  // Aborted upload.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  environment.aborting = true;
  startUpload(environment.cloudAccountId, "cloudFile1");
  await extension.awaitMessage("background started");
  environment.fileId = await extension.awaitMessage("uploadStarted");
  cancelUpload(environment.cloudAccountId, "cloudFile1");
  await extension.awaitMessage("uploadAborted");
  checkPersistentListeners({ primed: false });

  // Remove account.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  cloudFileAccounts.removeAccount(environment.cloudAccountId);
  await extension.awaitMessage("background started");
  checkPersistentListeners({ primed: false });
  await extension.awaitFinish("finished");
  await extension.unload();
  composeWindow.close();
});

/**
 * Test cloudFiles without accounts and removed local files.
 */
add_task(async function test_incomplete_cloudFiles() {
  const testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };
  const uploads = {};
  let cloudFileAccount = null;

  async function background() {
    function createCloudfileAccount(id) {
      const addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount", id);
      return addListener;
    }

    function removeCloudfileAccount(id) {
      const deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
      browser.test.sendMessage("removeAccount", id);
      return deleteListener;
    }

    const [composerTab] = await browser.tabs.query({
      windowType: "messageCompose",
    });

    const [createdAccount] = await createCloudfileAccount(
      "ext-cloudfile@mochi.test"
    );

    await new Promise(resolve => {
      function fileListener(uploadAccount, { id, name }) {
        browser.cloudFile.onFileUpload.removeListener(fileListener);
        setTimeout(() => resolve(id));
        return { url: "https://example.com/" + name };
      }

      browser.cloudFile.onFileUpload.addListener(fileListener);
      browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
    });

    await window.sendMessage("attachAndInvalidate", "cloudFile1");
    const attachments = await browser.compose.listAttachments(composerTab.id);
    const [attachmentId] = attachments
      .filter(e => e.name == "cloudFile1.txt")
      .map(e => e.id);

    await browser.test.assertRejects(
      browser.compose.updateAttachment(composerTab.id, attachmentId, {
        name: "cloudFile3",
      }),
      e => {
        return (
          e.message.startsWith(
            "CloudFile Error: Attachment file not found: "
          ) && e.message.endsWith("cloudFile1.txt_invalid")
        );
      },
      "browser.compose.updateAttachment() should reject, if the local file does not exist."
    );

    await removeCloudfileAccount(createdAccount.id);
    await browser.test.assertRejects(
      browser.compose.updateAttachment(composerTab.id, attachmentId, {
        name: "cloudFile3",
      }),
      `CloudFile Error: Account not found: ${createdAccount.id}`,
      "browser.compose.updateAttachment() should reject, if the account does not exist."
    );

    browser.test.notifyPass("finished");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      permissions: ["compose"],
      applications: { gecko: { id: "cloudfile@mochi.test" } },
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("createAccount", id => {
    cloudFileAccount = cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage("attachAndInvalidate", async filename => {
    const upload = uploads[filename];
    await composeWindow.attachToCloudRepeat(
      uploads[filename],
      cloudFileAccount
    );

    const bucket = composeWindow.document.getElementById("attachmentBucket");
    const item = [...bucket.children].find(
      e => e.attachment.name == upload.name
    );
    Assert.ok(item, "Should have found the attachment item");

    // Invalidate the cloud attachment, simulating a file move/delete.
    item.attachment.url = `${item.attachment.url}_invalid`;
    item.cloudFileAccount.markAsImmutable(item.cloudFileUpload.id);
    extension.sendMessage();
  });

  extension.onMessage(
    "uploadFile",
    (id, filename, expectedErrorStatus = Cr.NS_OK, expectedErrorMessage) => {
      const cloudFileAccount = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      cloudFileAccount.uploadFile(composeWindow, testFiles[filename]).then(
        upload => {
          Assert.equal(Cr.NS_OK, expectedErrorStatus);
          uploads[filename] = upload;
        },
        status => {
          Assert.equal(
            status.result,
            expectedErrorStatus,
            `Error status should be correct for ${testFiles[filename].leafName}`
          );
          Assert.equal(
            status.message,
            expectedErrorMessage,
            `Error message should be correct for ${testFiles[filename].leafName}`
          );
        }
      );
    }
  );

  const account = createAccount();
  addIdentity(account);

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  composeWindow.close();
});

/** Test data_format "File", which is the default if none is specified in the
 * manifest. */
add_task(async function test_file_format() {
  async function background() {
    function createCloudfileAccount() {
      const addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount");
      return addListener;
    }

    function removeCloudfileAccount(id) {
      const deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
      browser.test.sendMessage("removeAccount", id);
      return deleteListener;
    }

    const [createdAccount] = await createCloudfileAccount();

    browser.test.log("test upload");
    await new Promise(resolve => {
      function fileListener(account, { id, name, data }, tab, relatedFileInfo) {
        browser.cloudFile.onFileUpload.removeListener(fileListener);
        browser.test.assertEq(name, "cloudFile1.txt");
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(data instanceof File);
        const reader = new FileReader();
        reader.addEventListener("loadend", () => {
          browser.test.assertEq(reader.result, "you got the moves!\n");
          setTimeout(() => resolve(id));
        });
        reader.readAsText(data);
        browser.test.assertEq(undefined, relatedFileInfo);
        return { url: "https://example.com/" + name };
      }

      browser.cloudFile.onFileUpload.addListener(fileListener);
      browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
    });

    browser.test.log("test upload quota error");
    await browser.cloudFile.updateAccount(createdAccount.id, {
      spaceRemaining: 1,
    });
    await window.sendMessage(
      "uploadFileError",
      createdAccount.id,
      "cloudFile2",
      "uploadWouldExceedQuota",
      "Quota error: Can't upload file. Only 1KB left of quota."
    );
    await browser.cloudFile.updateAccount(createdAccount.id, {
      spaceRemaining: -1,
    });

    browser.test.log("test upload file size limit error");
    await browser.cloudFile.updateAccount(createdAccount.id, {
      uploadSizeLimit: 1,
    });
    await window.sendMessage(
      "uploadFileError",
      createdAccount.id,
      "cloudFile2",
      "uploadExceedsFileLimit",
      "Upload error: File size is 19KB and exceeds the file size limit of 1KB"
    );
    await browser.cloudFile.updateAccount(createdAccount.id, {
      uploadSizeLimit: -1,
    });

    await removeCloudfileAccount(createdAccount.id);
    browser.test.notifyPass("cloudFile");
  }

  const extension = ExtensionTestUtils.loadExtension({
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

  const testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };

  extension.onMessage("createAccount", (id = "ext-cloudfile@mochi.test") => {
    cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage(
    "uploadFileError",
    async (id, filename, expectedErrorStatus, expectedErrorMessage) => {
      const account = cloudFileAccounts.getAccount(id);

      let status;
      try {
        await account.uploadFile(null, testFiles[filename]);
      } catch (ex) {
        status = ex;
      }

      Assert.ok(
        !!status,
        `Upload should have failed for ${testFiles[filename].leafName}`
      );
      Assert.equal(
        status.result,
        cloudFileAccounts.constants[expectedErrorStatus],
        `Error status should be correct for ${testFiles[filename].leafName}`
      );
      Assert.equal(
        status.message,
        expectedErrorMessage,
        `Error message should be correct for ${testFiles[filename].leafName}`
      );
      extension.sendMessage();
    }
  );

  extension.onMessage(
    "uploadFile",
    (id, filename, expectedErrorStatus = Cr.NS_OK, expectedErrorMessage) => {
      const account = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      account.uploadFile(null, testFiles[filename]).then(
        () => {
          Assert.equal(Cr.NS_OK, expectedErrorStatus);
        },
        status => {
          Assert.equal(
            status.result,
            expectedErrorStatus,
            `Error status should be correct for ${testFiles[filename].leafName}`
          );
          Assert.equal(
            status.message,
            expectedErrorMessage,
            `Error message should be correct for ${testFiles[filename].leafName}`
          );
        }
      );
    }
  );

  await extension.startup();
  await extension.awaitFinish("cloudFile");
  await extension.unload();

  Assert.ok(!cloudFileAccounts.getProviderForType("ext-cloudfile@mochi.test"));
  Assert.equal(cloudFileAccounts.accounts.length, 0);
});
