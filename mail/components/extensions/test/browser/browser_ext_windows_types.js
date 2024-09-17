/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  const files = {
    "background.js": async () => {
      // Message compose window.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      let [createdWindow] = await createdWindowPromise;
      browser.test.assertEq("messageCompose", createdWindow.type);

      let windowDetail = await browser.windows.get(createdWindow.id, {
        populate: true,
      });
      browser.test.assertEq("messageCompose", windowDetail.type);
      browser.test.assertEq(1, windowDetail.tabs.length);
      browser.test.assertEq("messageCompose", windowDetail.tabs[0].type);
      // These three properties should not be present, but not fail either.
      browser.test.assertEq(undefined, windowDetail.tabs[0].favIconUrl);
      browser.test.assertEq(undefined, windowDetail.tabs[0].title);
      browser.test.assertEq(undefined, windowDetail.tabs[0].url);

      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
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
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks", "tabs"],
    },
  });

  const account = createAccount();
  addIdentity(account);
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 1);

  await extension.startup();

  await extension.awaitMessage("openMessage");
  const newWindow = await openMessageInWindow(
    [...subFolders.test1.messages][0]
  );

  await extension.awaitMessage("closeMessage");
  newWindow.close();

  await extension.awaitFinish();
  await extension.unload();
});

add_task(async function test_tabs_of_second_tabmail() {
  const files = {
    "background.js": async () => {
      const testWindow = await browser.windows.create({ type: "normal" });
      browser.test.assertEq("normal", testWindow.type);

      const tabs = await browser.tabs.query({ windowId: testWindow.id });
      browser.test.assertEq(1, tabs.length);
      browser.test.assertEq("mail", tabs[0].type);

      await browser.windows.remove(testWindow.id);

      browser.test.notifyPass();
    },
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["background.js"] },
    },
  });

  const account = createAccount();
  addIdentity(account);
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 1);

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
