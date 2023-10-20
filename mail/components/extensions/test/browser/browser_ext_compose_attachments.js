/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

const { ExtensionUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionUtils.sys.mjs"
);

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

let account = createAccount();
let defaultIdentity = addIdentity(account);

function findWindow(subject) {
  let windows = Array.from(Services.wm.getEnumerator("msgcompose"));
  return windows.find(win => {
    let composeFields = win.GetComposeDetails();
    return composeFields.subject == subject;
  });
}

var MockCompleteGenericSendMessage = {
  register() {
    // For every compose window that opens, replace the function which does the
    // actual sending with one that only records when it has been called.
    MockCompleteGenericSendMessage._didTryToSendMessage = false;
    ExtensionSupport.registerWindowListener("MockCompleteGenericSendMessage", {
      chromeURLs: [
        "chrome://messenger/content/messengercompose/messengercompose.xhtml",
      ],
      onLoadWindow(window) {
        window.CompleteGenericSendMessage = function (msgType) {
          let items = [...window.gAttachmentBucket.itemChildren];
          for (let item of items) {
            if (item.attachment.sendViaCloud && item.cloudFileAccount) {
              item.cloudFileAccount.markAsImmutable(item.cloudFileUpload.id);
            }
          }
          Services.obs.notifyObservers(
            {
              composeWindow: window,
            },
            "mail:composeSendProgressStop"
          );
        };
      },
    });
  },

  unregister() {
    ExtensionSupport.unregisterWindowListener("MockCompleteGenericSendMessage");
  },
};

add_task(async function test_file_attachments() {
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
        let data = await browser.compose.getAttachmentFile(attachment.id);
        // eslint-disable-next-line mozilla/use-isInstance
        browser.test.assertTrue(data instanceof File);
        browser.test.assertEq(size, data.size);
      };

      let checkUI = async (composeTab, ...expected) => {
        let attachments = await browser.compose.listAttachments(composeTab.id);
        browser.test.assertEq(expected.length, attachments.length);
        for (let i = 0; i < expected.length; i++) {
          browser.test.assertEq(expected[i].id, attachments[i].id);
          browser.test.assertEq(expected[i].size, attachments[i].size);
        }
        let details = await browser.compose.getComposeDetails(composeTab.id);
        return window.sendMessage("checkUI", details, expected);
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

      let file1 = new File(["File number one!"], "file1.txt", {
        type: "application/vnd.regify",
      });
      let file2 = new File(
        ["File number two? Yes, this is number two."],
        "file2.txt"
      );
      let file3 = new File(["I'm pretending to be file two."], "file3.txt");
      let composeTab = await browser.compose.beginNew({
        subject: "Message #1",
      });

      await checkUI(composeTab);

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

      await checkUI(composeTab, {
        id: attachment1.id,
        name: "file1.txt",
        size: file1.size,
        contentType: "application/vnd.regify",
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
        composeTab,
        {
          id: attachment1.id,
          name: "file1.txt",
          size: file1.size,
          contentType: "application/vnd.regify",
        },
        { id: attachment2.id, name: "this is file2.txt", size: file2.size }
      );

      // Change an attachment.

      let changed2 = await browser.compose.updateAttachment(
        composeTab.id,
        attachment2.id,
        {
          name: "file2 with a new name.txt",
        }
      );
      browser.test.assertEq("file2 with a new name.txt", changed2.name);
      browser.test.assertEq(41, changed2.size);
      await checkData(changed2, file2.size);

      await checkUI(
        composeTab,
        {
          id: attachment1.id,
          name: "file1.txt",
          size: file1.size,
          contentType: "application/vnd.regify",
        },
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
        composeTab,
        {
          id: attachment1.id,
          name: "file1.txt",
          size: file1.size,
          contentType: "application/vnd.regify",
        },
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

      await checkUI(composeTab, {
        id: attachment2.id,
        name: "file2 with a new name.txt",
        size: file3.size,
      });

      // Convert the second attachment to a cloudFile attachment.

      await new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(1, fileInfo.id);
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve());
          return {
            url: "https://cloud.provider.net/1",
            templateInfo: {
              download_limit: "2",
              service_name: "Superior Mochitest Service",
            },
          };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        // Conversion/upload is not yet supported via WebExt API.
        browser.test.sendMessage(
          "convertFile",
          createdAccount.id,
          "file2 with a new name.txt"
        );
      });

      // File retrieved by WebExt API should still be the real file.
      await checkData(attachment2, 30);

      // UI should show both file size.
      await checkUI(composeTab, {
        id: attachment2.id,
        name: "file2 with a new name.txt",
        size: file3.size,
        htmlSize: 4536,
      });

      // Rename the second/cloud attachment.

      await browser.test.assertRejects(
        browser.compose.updateAttachment(composeTab.id, attachment2.id, {
          name: "cloud file2 with a new name.txt",
        }),
        "Rename error: Missing cloudFile.onFileRename listener for compose.attachments@mochi.test",
        "Provider should reject for missing rename support"
      );

      function cloudFileRenameListener(account, id) {
        browser.cloudFile.onFileRename.removeListener(cloudFileRenameListener);
        browser.test.assertEq(1, id);
        return { url: "https://cloud.provider.net/2" };
      }
      browser.cloudFile.onFileRename.addListener(cloudFileRenameListener);

      let changed4 = await browser.compose.updateAttachment(
        composeTab.id,
        attachment2.id,
        {
          name: "cloud file2 with a new name.txt",
        }
      );
      browser.test.assertEq("cloud file2 with a new name.txt", changed4.name);
      browser.test.assertEq(30, changed4.size);

      await checkUI(composeTab, {
        id: attachment2.id,
        name: "cloud file2 with a new name.txt",
        size: file3.size,
        htmlSize: 4554,
      });

      // File retrieved by WebExt API should still be the real file.
      await checkData(changed4, 30);

      // Update the second/cloud attachment.

      await browser.test.assertRejects(
        browser.compose.updateAttachment(composeTab.id, attachment2.id, {
          file: file2,
        }),
        "Upload error: Missing cloudFile.onFileUpload listener for compose.attachments@mochi.test (or it is not returning url or aborted)",
        "Provider should reject due to upload errors"
      );

      function cloudFileUploadListener(
        account,
        fileInfo,
        tab,
        relatedFileInfo
      ) {
        browser.cloudFile.onFileUpload.removeListener(cloudFileUploadListener);
        browser.test.assertEq(3, fileInfo.id);
        browser.test.assertEq("cloud file2 with a new name.txt", fileInfo.name);
        browser.test.assertEq(1, relatedFileInfo.id);
        browser.test.assertEq(
          "cloud file2 with a new name.txt",
          relatedFileInfo.name
        );
        browser.test.assertTrue(
          relatedFileInfo.dataChanged,
          `data should have changed`
        );
        browser.test.assertEq(
          "2",
          relatedFileInfo.templateInfo.download_limit,
          "templateInfo download_limit should be correct"
        );
        browser.test.assertEq(
          "Superior Mochitest Service",
          relatedFileInfo.templateInfo.service_name,
          "templateInfo service_name should be correct"
        );
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

      await checkUI(composeTab);

      await browser.tabs.remove(composeTab.id);
      browser.test.assertEq(0, listener.events.length);

      await removeCloudfileAccount(createdAccount.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );

  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      applications: { gecko: { id: "compose.attachments@mochi.test" } },
    },
  });

  extension.onMessage("checkUI", (details, expected) => {
    let composeWindow = findWindow(details.subject);
    let composeDocument = composeWindow.document;

    let bucket = composeDocument.getElementById("attachmentBucket");
    Assert.equal(bucket.itemCount, expected.length);

    let totalSize = 0;
    for (let i = 0; i < expected.length; i++) {
      let item = bucket.itemChildren[i];
      let { name, size, htmlSize, contentType } = expected[i];
      totalSize += htmlSize ? htmlSize : size;

      let displaySize = messenger.formatFileSize(size);
      if (htmlSize) {
        displaySize = `${messenger.formatFileSize(htmlSize)} (${displaySize})`;
        Assert.equal(
          item.cloudHtmlFileSize,
          htmlSize,
          "htmlSize should be correct."
        );
      }

      if (contentType) {
        Assert.equal(
          item.attachment.contentType,
          contentType,
          "contentType should be correct."
        );
      }

      Assert.equal(
        item.querySelector(".attachmentcell-name").textContent +
          item.querySelector(".attachmentcell-extension").textContent,
        name,
        "Displayed name should be correct."
      );
      Assert.equal(
        item.querySelector(".attachmentcell-size").textContent,
        displaySize,
        "Displayed size should be correct."
      );
    }

    let bucketTotal = composeDocument.getElementById("attachmentBucketSize");
    if (totalSize == 0) {
      Assert.equal(bucketTotal.textContent, "");
    } else {
      Assert.equal(
        bucketTotal.textContent,
        messenger.formatFileSize(totalSize),
        "Total size should match."
      );
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

    composeWindow.convertListItemsToCloudAttachment([attachmentItem], account);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_compose_attachments() {
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
        let data = await browser.compose.getAttachmentFile(attachment.id);
        browser.test.assertTrue(
          // eslint-disable-next-line mozilla/use-isInstance
          data instanceof File,
          "Returned file obj should be a File instance."
        );
        browser.test.assertEq(
          size,
          data.size,
          "Reported size should be correct."
        );
        browser.test.assertEq(
          attachment.name,
          data.name,
          "Name of the File object should match the name of the attachment."
        );
      };

      let checkUI = async (composeTab, ...expected) => {
        let attachments = await browser.compose.listAttachments(composeTab.id);
        browser.test.assertEq(
          expected.length,
          attachments.length,
          "Number of found attachments should be correct."
        );
        for (let i = 0; i < expected.length; i++) {
          browser.test.assertEq(expected[i].id, attachments[i].id);
          browser.test.assertEq(expected[i].size, attachments[i].size);
        }
        let details = await browser.compose.getComposeDetails(composeTab.id);
        return window.sendMessage("checkUI", details, expected);
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

      async function cloneAttachment(
        attachment,
        composeTab,
        name = attachment.name
      ) {
        let clone;

        // If the name is not changed, try to pass in the full object.
        if (name == attachment.name) {
          clone = await browser.compose.addAttachment(
            composeTab.id,
            attachment
          );
        } else {
          clone = await browser.compose.addAttachment(composeTab.id, {
            id: attachment.id,
            name,
          });
        }

        browser.test.assertEq(name, clone.name);
        browser.test.assertEq(attachment.size, clone.size);
        await checkData(clone, attachment.size);

        let [, added] = await listener.checkEvent(
          "onAttachmentAdded",
          { id: composeTab.id },
          { id: clone.id, name }
        );
        await checkData(added, attachment.size);
        return clone;
      }

      let [createdAccount] = await createCloudfileAccount();

      let file1 = new File(["File number one!"], "file1.txt");
      let file2 = new File(
        ["File number two? Yes, this is number two."],
        "file2.txt"
      );

      // -----------------------------------------------------------------------

      let composeTab1 = await browser.compose.beginNew({
        subject: "Message #2",
      });
      await checkUI(composeTab1);

      // Add an attachment to composeTab1.

      let tab1_attachment1 = await browser.compose.addAttachment(
        composeTab1.id,
        {
          file: file1,
        }
      );
      browser.test.assertEq("file1.txt", tab1_attachment1.name);
      browser.test.assertEq(16, tab1_attachment1.size);
      await checkData(tab1_attachment1, file1.size);

      let [, tab1_added1] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab1.id },
        { id: tab1_attachment1.id, name: "file1.txt" }
      );
      await checkData(tab1_added1, file1.size);

      await checkUI(composeTab1, {
        id: tab1_attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      // Add another attachment to composeTab1.

      let tab1_attachment2 = await browser.compose.addAttachment(
        composeTab1.id,
        {
          file: file2,
          name: "this is file2.txt",
        }
      );
      browser.test.assertEq("this is file2.txt", tab1_attachment2.name);
      browser.test.assertEq(41, tab1_attachment2.size);
      await checkData(tab1_attachment2, file2.size);

      let [, tab1_added2] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab1.id },
        { id: tab1_attachment2.id, name: "this is file2.txt" }
      );
      await checkData(tab1_added2, file2.size);

      await checkUI(
        composeTab1,
        { id: tab1_attachment1.id, name: "file1.txt", size: file1.size },
        { id: tab1_attachment2.id, name: "this is file2.txt", size: file2.size }
      );

      // Convert the second attachment to a cloudFile attachment.

      await new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(1, fileInfo.id);
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/1" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        // Conversion/upload is not yet supported via WebExt API.
        browser.test.sendMessage(
          "convertFile",
          createdAccount.id,
          "this is file2.txt"
        );
      });

      await checkUI(
        composeTab1,
        {
          id: tab1_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab1_attachment2.id,
          name: "this is file2.txt",
          size: 41,
          htmlSize: 4300,
          contentLocation: "https://cloud.provider.net/1",
        }
      );

      // -----------------------------------------------------------------------

      // Create a second compose window and clone both attachments from tab1. The
      // second one should be cloned as a cloud attachment, having no size and the
      // correct contentLocation. Both attachments will be renamed while cloning.

      // The cloud file rename should be handled as a new file upload, because
      // the same url is used in tab1. The original attachment should be passed
      // as relatedFileInfo.
      let tab2_uploadPromise = new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(2, fileInfo.id);
          browser.test.assertEq("this is renamed file2.txt", fileInfo.name);
          browser.test.assertEq(1, relatedFileInfo.id);
          browser.test.assertEq("this is file2.txt", relatedFileInfo.name);
          browser.test.assertFalse(
            relatedFileInfo.dataChanged,
            `data should not have changed`
          );
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/2" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
      });

      let composeTab2 = await browser.compose.beginNew({
        subject: "Message #3",
      });
      let tab2_attachment1 = await cloneAttachment(
        tab1_attachment1,
        composeTab2,
        "I want to be called file3.txt"
      );
      await checkUI(composeTab2, {
        id: tab2_attachment1.id,
        name: "I want to be called file3.txt",
        size: file1.size,
      });

      let tab2_attachment2 = await cloneAttachment(
        tab1_attachment2,
        composeTab2,
        "this is renamed file2.txt"
      );

      await checkUI(
        composeTab2,
        {
          id: tab2_attachment1.id,
          name: "I want to be called file3.txt",
          size: file1.size,
        },
        {
          id: tab2_attachment2.id,
          name: "this is renamed file2.txt",
          size: 41,
          htmlSize: 4324,
          contentLocation: "https://cloud.provider.net/2",
        }
      );

      await tab2_uploadPromise;

      // -----------------------------------------------------------------------

      // Create a 3rd compose window and clone both attachments from tab1. The
      // second one should be cloned as cloud attachment, having no size and the
      // correct contentLocation. Files are not renamed this time, so there should
      // not be an upload request (which would fail without upload listener), as
      // we simply re-attach the cloudFileUpload data.

      let composeTab3 = await browser.compose.beginNew({
        subject: "Message #4",
      });
      let tab3_attachment1 = await cloneAttachment(
        tab1_attachment1,
        composeTab3
      );
      await checkUI(composeTab3, {
        id: tab3_attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      let tab3_attachment2 = await cloneAttachment(
        tab1_attachment2,
        composeTab3
      );

      await checkUI(
        composeTab3,
        {
          id: tab3_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab3_attachment2.id,
          name: "this is file2.txt",
          size: 41,
          htmlSize: 4300,
          contentLocation: "https://cloud.provider.net/1",
        }
      );

      // Rename the cloned cloud attachments of tab3. It should trigger a new
      // upload, to not invalidate the original url still used in tab1.

      let tab3_uploadPromise = new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(3, fileInfo.id);
          browser.test.assertEq(
            "That is going to be interesting.txt",
            fileInfo.name
          );
          browser.test.assertEq(1, relatedFileInfo.id);
          browser.test.assertEq("this is file2.txt", relatedFileInfo.name);
          browser.test.assertFalse(
            relatedFileInfo.dataChanged,
            `data should not have changed`
          );
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/3" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
      });

      let tab3_changed2 = await browser.compose.updateAttachment(
        composeTab3.id,
        tab3_attachment2.id,
        {
          name: "That is going to be interesting.txt",
        }
      );
      browser.test.assertEq(
        "That is going to be interesting.txt",
        tab3_changed2.name
      );
      browser.test.assertEq(41, tab3_changed2.size);
      await checkData(tab3_changed2, file2.size);

      await checkUI(
        composeTab3,
        {
          id: tab3_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab3_attachment2.id,
          name: "That is going to be interesting.txt",
          size: 41,
          htmlSize: 4354,
          contentLocation: "https://cloud.provider.net/3",
        }
      );

      await tab3_uploadPromise;

      // -----------------------------------------------------------------------

      // Open a 4th compose window and directly clone attachment1 and attachment2,
      // renaming both. This should trigger a new file upload.

      let tab4_uploadPromise = new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(4, fileInfo.id);
          browser.test.assertEq(
            "I got renamed too, how crazy is that!.txt",
            fileInfo.name
          );
          browser.test.assertEq(1, relatedFileInfo.id);
          browser.test.assertEq("this is file2.txt", relatedFileInfo.name);
          browser.test.assertFalse(
            relatedFileInfo.dataChanged,
            `data should not have changed`
          );
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/4" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
      });

      let tab4_details = { subject: "Message #5" };
      tab4_details.attachments = [
        Object.assign({}, tab1_attachment1),
        Object.assign({}, tab1_attachment2),
      ];
      tab4_details.attachments[0].name = "I got renamed.txt";
      tab4_details.attachments[1].name =
        "I got renamed too, how crazy is that!.txt";
      let composeTab4 = await browser.compose.beginNew(tab4_details);

      // In this test we need to manually request the id of the added attachments.
      let [tab4_attachment1, tab4_attachment2] =
        await browser.compose.listAttachments(composeTab4.id);

      let [, addedReClone1] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab4.id },
        { id: tab4_attachment1.id, name: "I got renamed.txt" }
      );
      await checkData(addedReClone1, file1.size);
      let [, addedReClone2] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab4.id },
        {
          id: tab4_attachment2.id,
          name: "I got renamed too, how crazy is that!.txt",
        }
      );
      await checkData(addedReClone2, file2.size);

      await checkUI(
        composeTab4,
        {
          id: tab4_attachment1.id,
          name: "I got renamed.txt",
          size: file1.size,
        },
        {
          id: tab4_attachment2.id,
          name: "I got renamed too, how crazy is that!.txt",
          size: 41,
          htmlSize: 4372,
          contentLocation: "https://cloud.provider.net/4",
        }
      );

      await tab4_uploadPromise;

      // -----------------------------------------------------------------------

      // Open a 5th compose window and directly clone attachment1 and attachment2
      // from tab1.

      let tab5_details = { subject: "Message #6" };
      tab5_details.attachments = [tab1_attachment1, tab1_attachment2];
      let composeTab5 = await browser.compose.beginNew(tab5_details);

      // In this test we need to manually request the id of the added attachments.
      let [tab5_attachment1, tab5_attachment2] =
        await browser.compose.listAttachments(composeTab5.id);

      await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab5.id },
        { id: tab5_attachment1.id, name: "file1.txt" }
      );
      await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab5.id },
        { id: tab5_attachment2.id, name: "this is file2.txt" }
      );

      // Delete the cloud attachment2 in tab1, which should not trigger a cloud
      // delete, as the url is still used in tab5.

      function fileListener(account, id, tab) {
        browser.test.fail(
          `The onFileDeleted listener should not fire for deleting a cloud file which is still used in another tab.`
        );
      }
      browser.cloudFile.onFileDeleted.addListener(fileListener);

      await browser.compose.removeAttachment(
        composeTab1.id,
        tab1_attachment2.id
      );
      await listener.checkEvent(
        "onAttachmentRemoved",
        { id: composeTab1.id },
        tab1_attachment2.id
      );
      browser.cloudFile.onFileDeleted.removeListener(fileListener);

      // Renaming cloud attachment2 in tab5 should now be a simple rename, as the
      // url is not used anywhere anymore.

      let tab5_renamePromise = new Promise(resolve => {
        function fileListener() {
          browser.cloudFile.onFileRename.removeListener(fileListener);
          setTimeout(() => resolve());
        }
        browser.cloudFile.onFileRename.addListener(fileListener);
      });

      await browser.compose.updateAttachment(
        composeTab5.id,
        tab5_attachment2.id,
        {
          name: "I am the only one left.txt",
        }
      );
      await tab5_renamePromise;

      // Delete the cloud attachment2 in tab5, which now should trigger a cloud
      // delete.

      let tab5_deletePromise = new Promise(resolve => {
        function fileListener(account, id, tab) {
          browser.cloudFile.onFileDeleted.removeListener(fileListener);
          setTimeout(() => resolve(id));
        }
        browser.cloudFile.onFileDeleted.addListener(fileListener);
      });

      await browser.compose.removeAttachment(
        composeTab5.id,
        tab5_attachment2.id
      );
      await listener.checkEvent(
        "onAttachmentRemoved",
        { id: composeTab5.id },
        tab5_attachment2.id
      );
      await tab5_deletePromise;

      // Clean up

      await browser.tabs.remove(composeTab5.id);
      await browser.tabs.remove(composeTab4.id);
      await browser.tabs.remove(composeTab3.id);
      await browser.tabs.remove(composeTab2.id);
      await browser.tabs.remove(composeTab1.id);
      browser.test.assertEq(0, listener.events.length);

      await removeCloudfileAccount(createdAccount.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );

  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      applications: { gecko: { id: "compose.attachments@mochi.test" } },
    },
  });

  extension.onMessage("checkUI", (details, expected) => {
    let composeWindow = findWindow(details.subject);
    let composeDocument = composeWindow.document;

    let bucket = composeDocument.getElementById("attachmentBucket");
    Assert.equal(bucket.itemCount, expected.length);

    let totalSize = 0;
    for (let i = 0; i < expected.length; i++) {
      let item = bucket.itemChildren[i];
      let { name, size, htmlSize, contentLocation } = expected[i];
      totalSize += htmlSize ? htmlSize : size;

      let displaySize = messenger.formatFileSize(size);
      if (htmlSize) {
        displaySize = `${messenger.formatFileSize(htmlSize)} (${displaySize})`;
        Assert.equal(
          item.cloudHtmlFileSize,
          htmlSize,
          "htmlSize should be correct."
        );
      }

      // size and name are checked against the displayed values, contentLocation
      // is checked against the associated attachment.

      if (contentLocation) {
        Assert.equal(
          item.attachment.contentLocation,
          contentLocation,
          "contentLocation for cloud files should be correct."
        );
        Assert.equal(
          item.attachment.sendViaCloud,
          true,
          "sendViaCloud for cloud files should be correct."
        );
      } else {
        Assert.equal(
          item.attachment.contentLocation,
          "",
          "contentLocation for cloud files should be correct."
        );
        Assert.equal(
          item.attachment.sendViaCloud,
          false,
          "sendViaCloud for cloud files should be correct."
        );
      }

      Assert.equal(
        item.querySelector(".attachmentcell-name").textContent +
          item.querySelector(".attachmentcell-extension").textContent,
        name,
        "Name should be correct."
      );
      Assert.equal(
        item.querySelector(".attachmentcell-size").textContent,
        displaySize,
        "Displayed size should be correct."
      );
    }

    let bucketTotal = composeDocument.getElementById("attachmentBucketSize");
    if (totalSize == 0) {
      Assert.equal(bucketTotal.textContent, "");
    } else {
      Assert.equal(
        bucketTotal.textContent,
        messenger.formatFileSize(totalSize)
      );
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

    composeWindow.convertListItemsToCloudAttachment([attachmentItem], account);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_compose_attachments_immutable() {
  MockCompleteGenericSendMessage.register();

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
        let data = await browser.compose.getAttachmentFile(attachment.id);
        browser.test.assertTrue(
          // eslint-disable-next-line mozilla/use-isInstance
          data instanceof File,
          "Returned file obj should be a File instance."
        );
        browser.test.assertEq(
          size,
          data.size,
          "Reported size should be correct."
        );
        browser.test.assertEq(
          attachment.name,
          data.name,
          "Name of the File object should match the name of the attachment."
        );
      };

      let checkUI = async (composeTab, ...expected) => {
        let attachments = await browser.compose.listAttachments(composeTab.id);
        browser.test.assertEq(
          expected.length,
          attachments.length,
          "Number of found attachments should be correct."
        );
        for (let i = 0; i < expected.length; i++) {
          browser.test.assertEq(expected[i].id, attachments[i].id);
          browser.test.assertEq(expected[i].size, attachments[i].size);
        }
        let details = await browser.compose.getComposeDetails(composeTab.id);
        return window.sendMessage("checkUI", details, expected);
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

      async function cloneAttachment(
        attachment,
        composeTab,
        name = attachment.name
      ) {
        let clone;

        // If the name is not changed, try to pass in the full object.
        if (name == attachment.name) {
          clone = await browser.compose.addAttachment(
            composeTab.id,
            attachment
          );
        } else {
          clone = await browser.compose.addAttachment(composeTab.id, {
            id: attachment.id,
            name,
          });
        }

        browser.test.assertEq(name, clone.name);
        browser.test.assertEq(attachment.size, clone.size);
        await checkData(clone, attachment.size);

        let [, added] = await listener.checkEvent(
          "onAttachmentAdded",
          { id: composeTab.id },
          { id: clone.id, name }
        );
        await checkData(added, attachment.size);
        return clone;
      }

      let [createdAccount] = await createCloudfileAccount();

      let file1 = new File(["File number one!"], "file1.txt");
      let file2 = new File(
        ["File number two? Yes, this is number two."],
        "file2.txt"
      );

      // -----------------------------------------------------------------------

      let composeTab1 = await browser.compose.beginNew({
        to: "user@inter.net",
        subject: "Test",
      });
      await checkUI(composeTab1);

      // Add an attachment to composeTab1.

      let tab1_attachment1 = await browser.compose.addAttachment(
        composeTab1.id,
        {
          file: file1,
        }
      );
      browser.test.assertEq("file1.txt", tab1_attachment1.name);
      browser.test.assertEq(16, tab1_attachment1.size);
      await checkData(tab1_attachment1, file1.size);

      let [, tab1_added1] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab1.id },
        { id: tab1_attachment1.id, name: "file1.txt" }
      );
      await checkData(tab1_added1, file1.size);

      await checkUI(composeTab1, {
        id: tab1_attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      // Add another attachment to composeTab1.

      let tab1_attachment2 = await browser.compose.addAttachment(
        composeTab1.id,
        {
          file: file2,
          name: "this is file2.txt",
        }
      );
      browser.test.assertEq("this is file2.txt", tab1_attachment2.name);
      browser.test.assertEq(41, tab1_attachment2.size);
      await checkData(tab1_attachment2, file2.size);

      let [, tab1_added2] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab1.id },
        { id: tab1_attachment2.id, name: "this is file2.txt" }
      );
      await checkData(tab1_added2, file2.size);

      await checkUI(
        composeTab1,
        { id: tab1_attachment1.id, name: "file1.txt", size: file1.size },
        { id: tab1_attachment2.id, name: "this is file2.txt", size: file2.size }
      );

      // Convert the second attachment to a cloudFile attachment.

      await new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(1, fileInfo.id);
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/1" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        // Conversion/upload is not yet supported via WebExt API.
        browser.test.sendMessage(
          "convertFile",
          createdAccount.id,
          "this is file2.txt"
        );
      });

      await checkUI(
        composeTab1,
        {
          id: tab1_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab1_attachment2.id,
          name: "this is file2.txt",
          size: 41,
          htmlSize: 4300,
          contentLocation: "https://cloud.provider.net/1",
        }
      );

      // -----------------------------------------------------------------------

      // Create a second compose window and clone both attachments from tab1. The
      // second one should be cloned as a cloud attachment, having no size and the
      // correct contentLocation.

      let composeTab2 = await browser.compose.beginNew({
        subject: "Message #7",
      });
      let tab2_attachment1 = await cloneAttachment(
        tab1_attachment1,
        composeTab2
      );
      await checkUI(composeTab2, {
        id: tab2_attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      let tab2_attachment2 = await cloneAttachment(
        tab1_attachment2,
        composeTab2,
        "this is file2.txt"
      );

      await checkUI(
        composeTab2,
        {
          id: tab2_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab2_attachment2.id,
          name: "this is file2.txt",
          size: 41,
          htmlSize: 4300,
          contentLocation: "https://cloud.provider.net/1",
        }
      );

      // Send the message and have its attachment marked as immutable.
      await browser.compose.sendMessage(composeTab1.id, { mode: "sendNow" });
      await browser.tabs.remove(composeTab1.id);

      // Delete the cloud attachment2 in tab2, which should not trigger a cloud
      // delete, as the url has been marked as immutable by sending the message
      // in tab1.

      function fileListener(account, id, tab) {
        browser.test.fail(
          `The onFileDeleted listener should not fire for deleting a cloud file marked as immutable.`
        );
      }
      browser.cloudFile.onFileDeleted.addListener(fileListener);

      await browser.compose.removeAttachment(
        composeTab2.id,
        tab2_attachment2.id
      );
      await listener.checkEvent(
        "onAttachmentRemoved",
        { id: composeTab2.id },
        tab2_attachment2.id
      );

      // Clean up

      await browser.tabs.remove(composeTab2.id);
      browser.test.assertEq(0, listener.events.length);

      await removeCloudfileAccount(createdAccount.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );

  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "compose.send", "messagesRead"],
      applications: { gecko: { id: "compose.attachments@mochi.test" } },
    },
  });

  extension.onMessage("checkUI", (details, expected) => {
    let composeWindow = findWindow(details.subject);
    let composeDocument = composeWindow.document;

    let bucket = composeDocument.getElementById("attachmentBucket");
    Assert.equal(bucket.itemCount, expected.length);

    let totalSize = 0;
    for (let i = 0; i < expected.length; i++) {
      let item = bucket.itemChildren[i];
      let { name, size, htmlSize, contentLocation } = expected[i];
      totalSize += htmlSize ? htmlSize : size;

      let displaySize = messenger.formatFileSize(size);
      if (htmlSize) {
        displaySize = `${messenger.formatFileSize(htmlSize)} (${displaySize})`;
        Assert.equal(
          item.cloudHtmlFileSize,
          htmlSize,
          "htmlSize should be correct."
        );
      }

      // size and name are checked against the displayed values, contentLocation
      // is checked against the associated attachment.

      if (contentLocation) {
        Assert.equal(
          item.attachment.contentLocation,
          contentLocation,
          "contentLocation for cloud files should be correct."
        );
        Assert.equal(
          item.attachment.sendViaCloud,
          true,
          "sendViaCloud for cloud files should be correct."
        );
      } else {
        Assert.equal(
          item.attachment.contentLocation,
          "",
          "contentLocation for cloud files should be correct."
        );
        Assert.equal(
          item.attachment.sendViaCloud,
          false,
          "sendViaCloud for cloud files should be correct."
        );
      }

      Assert.equal(
        item.querySelector(".attachmentcell-name").textContent +
          item.querySelector(".attachmentcell-extension").textContent,
        name,
        "Name should be correct."
      );
      Assert.equal(
        item.querySelector(".attachmentcell-size").textContent,
        displaySize,
        "Displayed size should be correct."
      );
    }

    let bucketTotal = composeDocument.getElementById("attachmentBucketSize");
    if (totalSize == 0) {
      Assert.equal(bucketTotal.textContent, "");
    } else {
      Assert.equal(
        bucketTotal.textContent,
        messenger.formatFileSize(totalSize)
      );
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

    composeWindow.convertListItemsToCloudAttachment([attachmentItem], account);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  MockCompleteGenericSendMessage.unregister();
});

add_task(async function test_compose_attachments_no_reuse() {
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
        let data = await browser.compose.getAttachmentFile(attachment.id);
        browser.test.assertTrue(
          // eslint-disable-next-line mozilla/use-isInstance
          data instanceof File,
          "Returned file obj should be a File instance."
        );
        browser.test.assertEq(
          size,
          data.size,
          "Reported size should be correct."
        );
        browser.test.assertEq(
          attachment.name,
          data.name,
          "Name of the File object should match the name of the attachment."
        );
      };

      let checkUI = async (composeTab, ...expected) => {
        let attachments = await browser.compose.listAttachments(composeTab.id);
        browser.test.assertEq(
          expected.length,
          attachments.length,
          "Number of found attachments should be correct."
        );
        for (let i = 0; i < expected.length; i++) {
          browser.test.assertEq(expected[i].id, attachments[i].id);
          browser.test.assertEq(expected[i].size, attachments[i].size);
        }
        let details = await browser.compose.getComposeDetails(composeTab.id);
        return window.sendMessage("checkUI", details, expected);
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

      async function cloneAttachment(
        attachment,
        composeTab,
        name = attachment.name
      ) {
        let clone;

        // If the name is not changed, try to pass in the full object.
        if (name == attachment.name) {
          clone = await browser.compose.addAttachment(
            composeTab.id,
            attachment
          );
        } else {
          clone = await browser.compose.addAttachment(composeTab.id, {
            id: attachment.id,
            name,
          });
        }

        browser.test.assertEq(name, clone.name);
        browser.test.assertEq(attachment.size, clone.size);
        await checkData(clone, attachment.size);

        let [, added] = await listener.checkEvent(
          "onAttachmentAdded",
          { id: composeTab.id },
          { id: clone.id, name }
        );
        await checkData(added, attachment.size);
        return clone;
      }

      let [createdAccount] = await createCloudfileAccount();

      let file1 = new File(["File number one!"], "file1.txt");
      let file2 = new File(
        ["File number two? Yes, this is number two."],
        "file2.txt"
      );

      // -----------------------------------------------------------------------

      let composeTab1 = await browser.compose.beginNew({
        subject: "Message #8",
      });
      await checkUI(composeTab1);

      // Add an attachment to composeTab1.

      let tab1_attachment1 = await browser.compose.addAttachment(
        composeTab1.id,
        {
          file: file1,
        }
      );
      browser.test.assertEq("file1.txt", tab1_attachment1.name);
      browser.test.assertEq(16, tab1_attachment1.size);
      await checkData(tab1_attachment1, file1.size);

      let [, tab1_added1] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab1.id },
        { id: tab1_attachment1.id, name: "file1.txt" }
      );
      await checkData(tab1_added1, file1.size);

      await checkUI(composeTab1, {
        id: tab1_attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      // Add another attachment to composeTab1.

      let tab1_attachment2 = await browser.compose.addAttachment(
        composeTab1.id,
        {
          file: file2,
          name: "this is file2.txt",
        }
      );
      browser.test.assertEq("this is file2.txt", tab1_attachment2.name);
      browser.test.assertEq(41, tab1_attachment2.size);
      await checkData(tab1_attachment2, file2.size);

      let [, tab1_added2] = await listener.checkEvent(
        "onAttachmentAdded",
        { id: composeTab1.id },
        { id: tab1_attachment2.id, name: "this is file2.txt" }
      );
      await checkData(tab1_added2, file2.size);

      await checkUI(
        composeTab1,
        { id: tab1_attachment1.id, name: "file1.txt", size: file1.size },
        { id: tab1_attachment2.id, name: "this is file2.txt", size: file2.size }
      );

      // Convert the second attachment to a cloudFile attachment.

      await new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(1, fileInfo.id);
          browser.test.assertEq(undefined, relatedFileInfo);
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/1" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
        // Conversion/upload is not yet supported via WebExt API.
        browser.test.sendMessage(
          "convertFile",
          createdAccount.id,
          "this is file2.txt"
        );
      });

      await checkUI(
        composeTab1,
        {
          id: tab1_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab1_attachment2.id,
          name: "this is file2.txt",
          size: 41,
          htmlSize: 4300,
          contentLocation: "https://cloud.provider.net/1",
        }
      );

      // -----------------------------------------------------------------------

      // Create a second compose window and clone both attachments from tab1. The
      // second one should be cloned as a cloud attachment, having no size and the
      // correct contentLocation.
      // Attachments are not renamed, but since reuse_uploads is disabled, a new
      // upload request must be issued. The original attachment should be passed
      // as relatedFileInfo.
      let tab2_uploadPromise = new Promise(resolve => {
        function fileListener(account, fileInfo, tab, relatedFileInfo) {
          browser.cloudFile.onFileUpload.removeListener(fileListener);
          browser.test.assertEq(2, fileInfo.id);
          browser.test.assertEq("this is file2.txt", fileInfo.name);
          browser.test.assertEq(1, relatedFileInfo.id);
          browser.test.assertEq("this is file2.txt", relatedFileInfo.name);
          browser.test.assertFalse(
            relatedFileInfo.dataChanged,
            `data should not have changed`
          );
          setTimeout(() => resolve());
          return { url: "https://cloud.provider.net/2" };
        }

        browser.cloudFile.onFileUpload.addListener(fileListener);
      });

      let composeTab2 = await browser.compose.beginNew({
        subject: "Message #9",
      });
      let tab2_attachment1 = await cloneAttachment(
        tab1_attachment1,
        composeTab2
      );
      await checkUI(composeTab2, {
        id: tab2_attachment1.id,
        name: "file1.txt",
        size: file1.size,
      });

      let tab2_attachment2 = await cloneAttachment(
        tab1_attachment2,
        composeTab2,
        "this is file2.txt"
      );

      await checkUI(
        composeTab2,
        {
          id: tab2_attachment1.id,
          name: "file1.txt",
          size: file1.size,
        },
        {
          id: tab2_attachment2.id,
          name: "this is file2.txt",
          size: 41,
          htmlSize: 4300,
          contentLocation: "https://cloud.provider.net/2",
        }
      );

      await tab2_uploadPromise;

      await browser.tabs.remove(composeTab2.id);
      await browser.tabs.remove(composeTab1.id);
      browser.test.assertEq(0, listener.events.length);

      await removeCloudfileAccount(createdAccount.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );

  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      cloud_file: {
        name: "mochitest",
        management_url: "/content/management.html",
        reuse_uploads: false,
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      applications: { gecko: { id: "compose.attachments@mochi.test" } },
    },
  });

  extension.onMessage("checkUI", (details, expected) => {
    let composeWindow = findWindow(details.subject);
    let composeDocument = composeWindow.document;

    let bucket = composeDocument.getElementById("attachmentBucket");
    Assert.equal(bucket.itemCount, expected.length);

    let totalSize = 0;
    for (let i = 0; i < expected.length; i++) {
      let item = bucket.itemChildren[i];
      let { name, size, htmlSize, contentLocation } = expected[i];
      totalSize += htmlSize ? htmlSize : size;

      let displaySize = messenger.formatFileSize(size);
      if (htmlSize) {
        displaySize = `${messenger.formatFileSize(htmlSize)} (${displaySize})`;
        Assert.equal(
          item.cloudHtmlFileSize,
          htmlSize,
          "htmlSize should be correct."
        );
      }

      // size and name are checked against the displayed values, contentLocation
      // is checked against the associated attachment.

      if (contentLocation) {
        Assert.equal(
          item.attachment.contentLocation,
          contentLocation,
          "contentLocation for cloud files should be correct."
        );
        Assert.equal(
          item.attachment.sendViaCloud,
          true,
          "sendViaCloud for cloud files should be correct."
        );
      } else {
        Assert.equal(
          item.attachment.contentLocation,
          "",
          "contentLocation for cloud files should be correct."
        );
        Assert.equal(
          item.attachment.sendViaCloud,
          false,
          "sendViaCloud for cloud files should be correct."
        );
      }

      Assert.equal(
        item.querySelector(".attachmentcell-name").textContent +
          item.querySelector(".attachmentcell-extension").textContent,
        name,
        "Name should be correct."
      );
      Assert.equal(
        item.querySelector(".attachmentcell-size").textContent,
        displaySize,
        "Displayed size should be correct."
      );
    }

    let bucketTotal = composeDocument.getElementById("attachmentBucketSize");
    if (totalSize == 0) {
      Assert.equal(bucketTotal.textContent, "");
    } else {
      Assert.equal(
        bucketTotal.textContent,
        messenger.formatFileSize(totalSize)
      );
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

    composeWindow.convertListItemsToCloudAttachment([attachmentItem], account);
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

add_task(async function test_attachment_MV3_event_pages() {
  let files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, the eventCounter is reset and
      // allows to observe the order of events fired. In case of a wake-up, the
      // first observed event is the one that woke up the background.
      let eventCounter = 0;

      browser.compose.onAttachmentAdded.addListener(async (tab, attachment) => {
        browser.test.sendMessage("attachment added", {
          eventCount: ++eventCounter,
          attachment,
        });
      });

      browser.compose.onAttachmentRemoved.addListener(
        async (tab, attachmentId) => {
          browser.test.sendMessage("attachment removed", {
            eventCount: ++eventCounter,
            attachmentId,
          });
        }
      );

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "messagesRead"],
      browser_specific_settings: {
        gecko: { id: "compose.attachment@mochi.test" },
      },
    },
  });

  async function addAttachment(ordinal) {
    let attachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    attachment.name = `${ordinal}.txt`;
    attachment.url = `data:text/plain,I'm the ${ordinal} attachment!`;
    attachment.size = attachment.url.length - 16;

    await composeWindow.AddAttachments([attachment]);
    return attachment;
  }

  async function removeAttachment(attachment) {
    let item =
      composeWindow.gAttachmentBucket.findItemForAttachment(attachment);
    await composeWindow.RemoveAttachments([item]);
  }

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "compose.onAttachmentAdded",
      "compose.onAttachmentRemoved",
    ];

    for (let event of persistent_events) {
      let [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });

  // Trigger events without terminating the background first.

  let rawFirstAttachment = await addAttachment("first");
  let addedFirst = await extension.awaitMessage("attachment added");
  Assert.equal(
    "first.txt",
    rawFirstAttachment.name,
    "Created attachment should be correct"
  );
  Assert.equal(
    "first.txt",
    addedFirst.attachment.name,
    "Attachment returned by onAttachmentAdded should be correct"
  );
  Assert.equal(1, addedFirst.eventCount, "Event counter should be correct");

  await removeAttachment(rawFirstAttachment);

  let removedFirst = await extension.awaitMessage("attachment removed");
  Assert.equal(
    addedFirst.attachment.id,
    removedFirst.attachmentId,
    "Attachment id returned by onAttachmentRemoved should be correct"
  );
  Assert.equal(2, removedFirst.eventCount, "Event counter should be correct");

  // Terminate background and re-trigger onAttachmentAdded event.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });

  let rawSecondAttachment = await addAttachment("second");
  let addedSecond = await extension.awaitMessage("attachment added");
  Assert.equal(
    "second.txt",
    rawSecondAttachment.name,
    "Created attachment should be correct"
  );
  Assert.equal(
    "second.txt",
    addedSecond.attachment.name,
    "Attachment returned by onAttachmentAdded should be correct"
  );
  Assert.equal(1, addedSecond.eventCount, "Event counter should be correct");

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listeners should no longer be primed.
  checkPersistentListeners({ primed: false });

  // Terminate background and re-trigger onAttachmentRemoved event.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });

  await removeAttachment(rawSecondAttachment);
  let removedSecond = await extension.awaitMessage("attachment removed");
  Assert.equal(
    addedSecond.attachment.id,
    removedSecond.attachmentId,
    "Attachment id returned by onAttachmentRemoved should be correct"
  );
  Assert.equal(1, removedSecond.eventCount, "Event counter should be correct");

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listeners should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();
  composeWindow.close();
});
