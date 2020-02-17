/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let account = createAccount();
  addIdentity(account);
  let rootFolder = account.incomingServer.rootFolder;

  window.gFolderTreeView.selectFolder(rootFolder);
  await new Promise(resolve => executeSoon(resolve));

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      async function checkProperty(property, expectedDefault, ...expected) {
        browser.test.log(
          `${property}: ${expectedDefault}, ${expected.join(", ")}`
        );

        browser.test.assertEq(
          expectedDefault,
          await browser.browserAction[property]({})
        );
        for (let i = 0; i < 3; i++) {
          browser.test.assertEq(
            expected[i],
            await browser.browserAction[property]({ tabId: tabIDs[i] })
          );
        }

        await new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
          browser.test.sendMessage("checkProperty", property, expected);
        });
      }

      let tabs = await browser.mailTabs.query({});
      let tabIDs = tabs.map(t => t.id);

      await checkProperty("isEnabled", true, true, true, true);
      await browser.browserAction.disable();
      await checkProperty("isEnabled", false, false, false, false);
      await browser.browserAction.enable(tabIDs[0]);
      await checkProperty("isEnabled", false, true, false, false);
      await browser.browserAction.enable();
      await checkProperty("isEnabled", true, true, true, true);
      await browser.browserAction.disable();
      await checkProperty("isEnabled", false, true, false, false);
      await browser.browserAction.disable(tabIDs[0]);
      await checkProperty("isEnabled", false, false, false, false);
      await browser.browserAction.enable();
      await checkProperty("isEnabled", true, false, true, true);

      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );
      await browser.browserAction.setTitle({ tabId: tabIDs[2], title: "tab2" });
      await checkProperty("getTitle", "default", "default", "default", "tab2");
      await browser.browserAction.setTitle({ title: "new" });
      await checkProperty("getTitle", "new", "new", "new", "tab2");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: "tab1" });
      await checkProperty("getTitle", "new", "new", "tab1", "tab2");
      await browser.browserAction.setTitle({ tabId: tabIDs[2], title: null });
      await checkProperty("getTitle", "new", "new", "tab1", "new");
      await browser.browserAction.setTitle({ title: null });
      await checkProperty("getTitle", "default", "default", "tab1", "default");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: null });
      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );

      await browser.tabs.remove(tabIDs[0]);
      await browser.tabs.remove(tabIDs[1]);
      await browser.tabs.remove(tabIDs[2]);
      browser.test.notifyPass("finished");
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      browser_action: {
        default_title: "default",
      },
    },
  });

  await extension.startup();

  let tabmail = document.getElementById("tabmail");
  tabmail.openTab("folder", { folder: rootFolder, background: false });
  tabmail.openTab("folder", { folder: rootFolder, background: false });

  let mailTabs = tabmail.tabInfo;
  is(mailTabs.length, 3);

  let button = document.getElementById(
    "test1_mochi_test-browserAction-toolbarbutton"
  );

  extension.onMessage("checkProperty", async (property, expected) => {
    for (let i = 0; i < 3; i++) {
      tabmail.switchToTab(mailTabs[i]);
      await new Promise(resolve => requestAnimationFrame(resolve));
      switch (property) {
        case "isEnabled":
          is(button.disabled, !expected[i], `button ${i} enabled state`);
          break;
        case "getTitle":
          is(button.getAttribute("label"), expected[i], `button ${i} label`);
          break;
      }
    }

    extension.sendMessage();
  });

  await extension.awaitFinish("finished");
  await extension.unload();

  tabmail.closeTab(mailTabs[2]);
  tabmail.closeTab(mailTabs[1]);
  is(tabmail.tabInfo.length, 1);
});
