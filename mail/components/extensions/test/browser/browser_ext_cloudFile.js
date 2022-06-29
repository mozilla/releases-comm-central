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
 * onFileDeleted, onFileRename) without UI interaction.
 */
add_task(async function test_without_UI() {
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

    async function test_upload_rename_delete() {
      browser.test.log("test_upload_rename_delete");
      let [createdAccount] = await createCloudfileAccount();

      let fileId = await new Promise(resolve => {
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
          let content = await data.text();
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
        function fileListener(
          account,
          { id, name, data },
          tab,
          relatedFileInfo
        ) {
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
        function fileListener(
          account,
          { id, name, data },
          tab,
          relatedFileInfo
        ) {
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
        async function fileListener(
          account,
          { id, name, data },
          tab,
          relatedFileInfo
        ) {
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

  extension.onMessage(
    "uploadFileError",
    async (id, filename, expectedErrorStatus, expectedErrorMessage) => {
      let account = cloudFileAccounts.getAccount(id);

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
      let account = cloudFileAccounts.getAccount(id);

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
      let account = cloudFileAccounts.getAccount(id);

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
 * Test the tab parameter in cloudFile.onFileUpload, cloudFile.onFileDeleted,
 * cloudFile.onFileRename and cloudFile.onFileUploadAbort listeners with UI
 * interaction.
 */
add_task(async function test_compose_window() {
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

    async function test_tab_in_upload_rename_abort_delete_listener(composeTab) {
      browser.test.log("test_upload_delete");
      let [createdAccount] = await createCloudfileAccount(
        "ext-cloudfile@mochi.test"
      );

      let fileId = await new Promise(resolve => {
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
          let content = await data.text();
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
          { id, name, data },
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

    let [composerTab] = await browser.tabs.query({
      windowType: "messageCompose",
    });
    await test_tab_in_upload_rename_abort_delete_listener(composerTab);

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
      let cloudFileAccount = cloudFileAccounts.getAccount(id);

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
      let cloudFileAccount = cloudFileAccounts.getAccount(id);

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

/**
 * Test cloudFiles without accounts and removed local files.
 */
add_task(async function test_incomplete_cloudFiles() {
  let testFiles = {
    cloudFile1: new FileUtils.File(getTestFilePath("data/cloudFile1.txt")),
    cloudFile2: new FileUtils.File(getTestFilePath("data/cloudFile2.txt")),
  };
  let uploads = {};
  let composeWindow;
  let cloudFileAccount = null;

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

    let [composerTab] = await browser.tabs.query({
      windowType: "messageCompose",
    });

    let [createdAccount] = await createCloudfileAccount(
      "ext-cloudfile@mochi.test"
    );

    await new Promise(resolve => {
      function fileListener(
        uploadAccount,
        { id, name, data },
        tab,
        relatedFileInfo
      ) {
        browser.cloudFile.onFileUpload.removeListener(fileListener);
        setTimeout(() => resolve(id));
        return { url: "https://example.com/" + name };
      }

      browser.cloudFile.onFileUpload.addListener(fileListener);
      browser.test.sendMessage("uploadFile", createdAccount.id, "cloudFile1");
    });

    await window.sendMessage("attachAndInvalidate", "cloudFile1");
    let attachments = await browser.compose.listAttachments(composerTab.id);
    let [attachmentId] = attachments
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
      `CloudFile Error: Account not found: account7`,
      "browser.compose.updateAttachment() should reject, if the local file does not exist."
    );

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
    let upload = uploads[filename];
    await composeWindow.attachToCloudRepeat(
      uploads[filename],
      cloudFileAccount
    );

    let bucket = composeWindow.document.getElementById("attachmentBucket");
    let item = [...bucket.children].find(e => e.attachment.name == upload.name);
    Assert.ok(item, "Should have found the attachment item");

    // Invalidate the cloud attachment, simulating a file move/delete.
    item.attachment.url = `${item.attachment.url}_invalid`;
    item.cloudFileAccount.markAsImmutable(item.cloudFileUpload.id);
    extension.sendMessage();
  });

  extension.onMessage(
    "uploadFile",
    (id, filename, expectedErrorStatus = Cr.NS_OK, expectedErrorMessage) => {
      let cloudFileAccount = cloudFileAccounts.getAccount(id);

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

  let account = createAccount();
  addIdentity(account);

  composeWindow = await openComposeWindow(account);
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
      let addListener = window.waitForEvent("cloudFile.onAccountAdded");
      browser.test.sendMessage("createAccount");
      return addListener;
    }

    function removeCloudfileAccount(id) {
      let deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
      browser.test.sendMessage("removeAccount", id);
      return deleteListener;
    }

    let [createdAccount] = await createCloudfileAccount();

    browser.test.log("test upload");
    await new Promise(resolve => {
      function fileListener(account, { id, name, data }, tab, relatedFileInfo) {
        browser.cloudFile.onFileUpload.removeListener(fileListener);
        browser.test.assertEq(name, "cloudFile1.txt");
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(data instanceof File);
        let reader = new FileReader();
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

  extension.onMessage("createAccount", (id = "ext-cloudfile@mochi.test") => {
    cloudFileAccounts.createAccount(id);
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage(
    "uploadFileError",
    async (id, filename, expectedErrorStatus, expectedErrorMessage) => {
      let account = cloudFileAccounts.getAccount(id);

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
      let account = cloudFileAccounts.getAccount(id);

      if (typeof expectedErrorStatus == "string") {
        expectedErrorStatus = cloudFileAccounts.constants[expectedErrorStatus];
      }

      account.uploadFile(null, testFiles[filename]).then(
        upload => {
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
