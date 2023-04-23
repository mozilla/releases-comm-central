/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { create_folder } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

add_setup(async () => {
  let folder = await create_folder("AttachmentA");

  await createMessageFromFile(
    folder,
    getTestFilePath("messages/attachedMessageSample.eml")
  );
});

add_task(async function testOpenAttachment() {
  let files = {
    "background.js": async () => {
      let { messages } = await browser.messages.query({
        headerMessageId: "sample.eml@mime.sample",
      });

      let tabPromise = window.waitForEvent("tabs.onCreated");
      let messagePromise = window.waitForEvent(
        "messageDisplay.onMessageDisplayed"
      );

      let tab = await browser.mailTabs.getCurrent();
      await browser.messages.openAttachment(
        messages[0].id,
        // Open the eml attachment.
        "1.2",
        tab.id
      );

      let [msgTab] = await tabPromise;
      let [openedMsgTab, message] = await messagePromise;

      browser.test.assertEq(
        msgTab.id,
        openedMsgTab.id,
        "The opened tab should match the onMessageDisplayed event tab"
      );
      browser.test.assertEq(
        message.headerMessageId,
        "sample-attached.eml@mime.sample",
        "Should have opened the correct message"
      );

      await browser.tabs.remove(msgTab.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [
        "accountsRead",
        "messagesRead",
        "messagesMove",
        "messagesDelete",
      ],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
