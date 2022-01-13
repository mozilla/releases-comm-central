/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

addIdentity(createAccount());

add_task(async function() {
  let files = {
    "background.js": async () => {
      let listener = {
        events: [],
        currentPromise: null,

        pushEvent(...args) {
          browser.test.log(JSON.stringify(args));
          this.events.push(args);
          if (this.currentPromise) {
            let p = this.currentPromise;
            this.currentPromise = null;
            p.resolve();
          }
        },
        async checkEvent(expectedEvent, ...expectedArgs) {
          if (this.events.length == 0) {
            await new Promise(resolve => (this.currentPromise = { resolve }));
          }
          let [actualEvent, ...actualArgs] = this.events.shift();
          browser.test.assertEq(expectedEvent, actualEvent);
          browser.test.assertEq(expectedArgs.length, actualArgs.length);

          for (let i = 0; i < expectedArgs.length; i++) {
            browser.test.assertEq(typeof expectedArgs[i], typeof actualArgs[i]);
            if (typeof expectedArgs[i] == "object") {
              for (let key of Object.keys(expectedArgs[i])) {
                browser.test.assertEq(expectedArgs[i][key], actualArgs[i][key]);
              }
            } else {
              browser.test.assertEq(expectedArgs[i], actualArgs[i]);
            }
          }

          return actualArgs;
        },
      };
      browser.compose.onAttachmentAdded.addListener((...args) =>
        listener.pushEvent("onAttachmentAdded", ...args)
      );
      browser.compose.onAttachmentRemoved.addListener((...args) =>
        listener.pushEvent("onAttachmentRemoved", ...args)
      );

      let checkData = async (attachment, size) => {
        browser.test.assertEq("function", typeof attachment.getFile);
        let data = await attachment.getFile();
        browser.test.assertTrue(data instanceof File);
        browser.test.assertEq(size, data.size);
      };

      let checkUI = async (...expected) => {
        let attachments = await browser.compose.listAttachments(composeTab.id);
        browser.test.assertEq(expected.length, attachments.length);
        for (let i = 0; i < expected.length; i++) {
          browser.test.assertEq(expected[i].id, attachments[i].id);
        }

        return window.sendMessage("checkUI", expected);
      };

      let createCloudfileAccount = () => {
        let addListener = window.waitForEvent("cloudFile.onAccountAdded");
        browser.test.sendMessage("createAccount");
        return addListener;
      };

      let removeCloudfileAccount = id => {
        let deleteListener = window.waitForEvent("cloudFile.onAccountDeleted");
        browser.test.sendMessage("removeAccount", id);
        return deleteListener;
      };

      let [createdAccount] = await createCloudfileAccount();

      let file1 = new File(["File number one!"], "file1.txt");
      let file2 = new File(
        ["File number two? Yes, this is number two."],
        "file2.txt"
      );
      let file3 = new File(["I'm pretending to be file two."], "file3.txt");
      let composeTab = await browser.compose.beginNew();

      await checkUI();

      // Add an attachment.

      let attachment1 = await browser.compose.addAttachment(composeTab.id, {
        file: file1,
      });
      browser.test.assertEq("file1.txt", attachment1.name);
      browser.test.assertEq(16, attachment1.size);
      await checkData(attachment1, file1.size);

      let [, added1] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab.id },
        { id: attachment1.id, name: "file1.txt" }
      );
      await checkData(added1, file1.size);

      await checkUI({
        id: attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      // Add another attachment.

      let attachment2 = await browser.compose.addAttachment(composeTab.id, {
        file: file2,
        name: "this is file2.txt",
      });
      browser.test.assertEq("this is file2.txt", attachment2.name);
      browser.test.assertEq(41, attachment2.size);
      await checkData(attachment2, file2.size);

      let [, added2] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab.id },
        { id: attachment2.id, name: "this is file2.txt" }
      );
      await checkData(added2, file2.size);

      await checkUI(
        { id: attachment1.id, name: "file1.txt", size: file1.size },
        { id: attachment2.id, name: "this is file2.txt", size: file2.size }
      );

      // Change an attachment.

      let changed2 = await browser.compose.updateAttachment(
        composeTab.id,
        attachment2.id,
        { name: "file2 with a new name.txt" }
      );
      browser.test.assertEq("file2 with a new name.txt", changed2.name);
      browser.test.assertEq(41, changed2.size);
      await checkData(changed2, file2.size);

      await checkUI(
        { id: attachment1.id, name: "file1.txt", size: file1.size },
        {
          id: attachment2.id,
          name: "file2 with a new name.txt",
          size: file2.size,
        }
      );

      let changed3 = await browser.compose.updateAttachment(
        composeTab.id,
        attachment2.id,
        { file: file3 }
      );
      browser.test.assertEq("file2 with a new name.txt", changed3.name);
      browser.test.assertEq(30, changed3.size);
      await checkData(changed3, file3.size);

      await checkUI(
        { id: attachment1.id, name: "file1.txt", size: file1.size },
        {
          id: attachment2.id,
          name: "file2 with a new name.txt",
          size: file3.size,
        }
      );

      // Remove the first/local attachment.

      await browser.compose.removeAttachment(composeTab.id, attachment1.id);
      await listener.checkEvent(
        "onAttachmentRemoved",
        { id: composeTab.id },
        attachment1.id
      );

      await checkUI({
        id: attachment2.id,
        name: "file2 with a new name.txt",
        size: file3.size,
      });

      // Convert the second attachment to a cloudFile attachment.

      await new Promise(resolve => {
        function fileListener(account, { id, name, data }) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/1" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        // Conversion/upload is not yet supported via WebExt API.
        browser.test.sendMessage(
          "convertFile",
          createdAccount.id,
          "file2 with a new name.txt"
        );
      });

      // Rename the second/cloud attachment.

      await browser.test.assertRejects(
        browser.compose.updateAttachment(composeTab.id, attachment2.id, {
          name: "cloud file2 with a new name.txt",
        }),
        "Rename error: Missing cloudFile.onFileRename listener for compose.attachments@mochi.test",
        "Provider should reject for missing rename support"
      );

      function cloudFileRenameListener() {
        browser.cloudFile.onFileRename.removeListener(cloudFileRenameListener);
        return { url: "https://cloud.provider.net/2" };
      }
      browser.cloudFile.onFileRename.addListener(cloudFileRenameListener);

      let changed4 = await browser.compose.updateAttachment(
        composeTab.id,
        attachment2.id,
        { name: "cloud file2 with a new name.txt" }
      );
      browser.test.assertEq("cloud file2 with a new name.txt", changed4.name);
      browser.test.assertEq(30, changed4.size);
      await checkData(changed4, file3.size);

      // Update the second/cloud attachment.

      await browser.test.assertRejects(
        browser.compose.updateAttachment(composeTab.id, attachment2.id, {
          file: file2,
        }),
        "Upload error: Missing cloudFile.onFileUpload listener for compose.attachments@mochi.test (or it is not returning url or aborted)",
        "Provider should reject due to upload errors"
      );

      function cloudFileUploadListener() {
        browser.cloudFile.onFileUpload.removeListener(cloudFileUploadListener);
        return { url: "https://cloud.provider.net/3" };
      }
      browser.cloudFile.onFileUpload.addListener(cloudFileUploadListener);

      let changed5 = await browser.compose.updateAttachment(
        composeTab.id,
        attachment2.id,
        { file: file2 }
      );
      browser.test.assertEq("cloud file2 with a new name.txt", changed5.name);
      browser.test.assertEq(41, changed5.size);
      await checkData(changed5, file2.size);

      // Remove the second/cloud attachment.

      await browser.compose.removeAttachment(composeTab.id, attachment2.id);

      await listener.checkEvent(
        "onAttachmentRemoved",
        { id: composeTab.id },
        attachment2.id
      );

      await checkUI();

      await browser.tabs.remove(composeTab.id);
      browser.test.assertEq(0, listener.events.length);

      await removeCloudfileAccount(createdAccount.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
        data_format: "ArrayBuffer",
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      applications: { gecko: { id: "compose.attachments@mochi.test" } },
    },
  });

  extension.onMessage("checkUI", expected => {
    let composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    let composeDocument = composeWindow.document;

    let bucket = composeDocument.getElementById("attachmentBucket");
    Assert.equal(bucket.itemCount, expected.length);

    let totalSize = 0;
    for (let i = 0; i < expected.length; i++) {
      let { name, size } = expected[i];
      totalSize += size;

      let item = bucket.itemChildren[i];
      Assert.equal(
        item.querySelector(".attachmentcell-name").textContent +
          item.querySelector(".attachmentcell-extension").textContent,
        name
      );
      Assert.equal(
        item.querySelector(".attachmentcell-size").textContent,
        `${size} bytes`
      );
    }

    let bucketTotal = composeDocument.getElementById("attachmentBucketSize");
    if (totalSize == 0) {
      Assert.equal(bucketTotal.textContent, "");
    } else {
      Assert.equal(bucketTotal.textContent, `${totalSize} bytes`);
    }

    extension.sendMessage();
  });

  extension.onMessage("createAccount", () => {
    cloudFileAccounts.createAccount("ext-compose.attachments@mochi.test");
  });

  extension.onMessage("removeAccount", id => {
    cloudFileAccounts.removeAccount(id);
  });

  extension.onMessage("convertFile", (cloudFileAccountId, attachmentName) => {
    let composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    let composeDocument = composeWindow.document;
    let bucket = composeDocument.getElementById("attachmentBucket");
    let account = cloudFileAccounts.getAccount(cloudFileAccountId);

    let attachmentItem = bucket.itemChildren.find(
      item => item.attachment && item.attachment.name == attachmentName
    );

    composeWindow.UpdateAttachment(attachmentItem, {
      cloudFileAccount: account,
    });
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_without_permission() {
  let files = {
    "background.js": async () => {
      // Try to use onAttachmentAdded.
      await browser.test.assertThrows(
        () => browser.compose.onAttachmentAdded.addListener(),
        /browser\.compose\.onAttachmentAdded is undefined/,
        "Should reject listener without proper permission"
      );

      // Try to use onAttachmentRemoved.
      await browser.test.assertThrows(
        () => browser.compose.onAttachmentRemoved.addListener(),
        /browser\.compose\.onAttachmentRemoved is undefined/,
        "Should reject listener without proper permission"
      );

      // Try to use listAttachments.
      await browser.test.assertThrows(
        () => browser.compose.listAttachments(),
        `browser.compose.listAttachments is not a function`,
        "Should reject function without proper permission"
      );

      // Try to use addAttachment.
      await browser.test.assertThrows(
        () => browser.compose.addAttachment(),
        `browser.compose.addAttachment is not a function`,
        "Should reject function without proper permission"
      );

      // Try to use updateAttachment.
      await browser.test.assertThrows(
        () => browser.compose.updateAttachment(),
        `browser.compose.updateAttachment is not a function`,
        "Should reject function without proper permission"
      );

      // Try to use removeAttachment.
      await browser.test.assertThrows(
        () => browser.compose.removeAttachment(),
        `browser.compose.removeAttachment is not a function`,
        "Should reject function without proper permission"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
