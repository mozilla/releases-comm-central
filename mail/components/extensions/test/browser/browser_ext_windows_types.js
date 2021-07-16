/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);

add_task(async () => {
  let files = {
    "background.js": async () => {
      // Address book window.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.addressBooks.openUI();
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("addressBook", createdWindow.type);

      let windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("addressBook", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      browser.test.assertEq("addressBook", windowDetail.tabs[0].type);
      // These three properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);
      browser.test.assertEq(undefined, windowDetail.tabs[0].url);

      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      await browser.addressBooks.closeUI();
      await removedWindowPromise;

      // Message compose window.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("messageCompose", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      browser.test.assertEq("messageCompose", windowDetail.tabs[0].type);
      // These three properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);
      browser.test.assertEq(undefined, windowDetail.tabs[0].url);

      removedWindowPromise = window.waitForEvent("windows.onRemoved");
      await browser.tabs.remove(windowDetail.tabs[0].id);
      await removedWindowPromise;

      // Message display window.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      browser.test.sendMessage("openMessage");
      [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageDisplay", createdWindow.type);

      windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("messageDisplay", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      browser.test.assertEq("messageDisplay", windowDetail.tabs[0].type);
      browser.test.assertEq("about:blank", windowDetail.tabs[0].url);
      // These properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);

      removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.test.sendMessage("closeMessage");
      await removedWindowPromise;

      browser.test.notifyPass();
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks", "tabs"],
    },
  });

  let account = createAccount();
  addIdentity(account);
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  let subFolders = {};
  for (let folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 1);

  await extension.startup();

  await extension.awaitMessage("openMessage");
  let newWindow = await openMessageInWindow([...subFolders.test1.messages][0]);

  await extension.awaitMessage("closeMessage");
  newWindow.close();

  await extension.awaitFinish();
  await extension.unload();
});
