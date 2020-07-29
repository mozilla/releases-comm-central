/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gFolderDisplay, gFolderTreeView, MsgOpenNewWindowForMessage */

let { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);

add_task(async () => {
  let extension = ExtensionTestUtils.loadExtension({
    async background() {
      function waitForEvent(eventName) {
        return new Promise(resolve => {
          let listener = arg1 => {
            browser.windows[eventName].removeListener(listener);
            resolve(arg1);
          };
          browser.windows[eventName].addListener(listener);
        });
      }

      // Address book window.

      let createdWindowPromise = waitForEvent("onCreated");
      await browser.addressBooks.openUI();
      let createdWindow = await createdWindowPromise;
      browser.test.assertEq("addressBook", createdWindow.type);

      let windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("addressBook", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      // These three properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);
      browser.test.assertEq(undefined, windowDetail.tabs[0].url);

      let removedWindowPromise = waitForEvent("onRemoved");
      await browser.addressBooks.closeUI();
      await removedWindowPromise;

      // Message compose window.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew();
      createdWindow = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("messageCompose", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      // These three properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);
      browser.test.assertEq(undefined, windowDetail.tabs[0].url);

      removedWindowPromise = waitForEvent("onRemoved");
      await browser.tabs.remove(windowDetail.tabs[0].id);
      await removedWindowPromise;

      // Message display window.

      createdWindowPromise = waitForEvent("onCreated");
      browser.test.sendMessage("openMessage");
      createdWindow = await createdWindowPromise;
      browser.test.assertEq("messageDisplay", createdWindow.type);

      windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("messageDisplay", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      // These three properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);
      browser.test.assertEq(undefined, windowDetail.tabs[0].url);

      removedWindowPromise = waitForEvent("onRemoved");
      browser.test.sendMessage("closeMessage");
      await removedWindowPromise;

      browser.test.notifyPass();
    },
    manifest: {
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

  gFolderTreeView.selectFolder(subFolders.test1);
  gFolderDisplay.selectViewIndex(0);

  await extension.startup();

  await extension.awaitMessage("openMessage");
  let newWindowPromise = BrowserTestUtils.domWindowOpened();
  MsgOpenNewWindowForMessage();
  let newWindow = await newWindowPromise;

  await extension.awaitMessage("closeMessage");
  newWindow.close();

  await extension.awaitFinish();
  await extension.unload();
});
