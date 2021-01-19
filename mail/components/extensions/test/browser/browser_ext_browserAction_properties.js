/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let account = createAccount();
  addIdentity(account);
  let rootFolder = account.incomingServer.rootFolder;

  let files = {
    "background.js": async () => {
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

        await window.sendMessage(whichTest, property, expected);
      }

      let tabs = await browser.mailTabs.query({});
      browser.test.assertEq(3, tabs.length);
      let tabIDs = tabs.map(t => t.id);

      let whichTest = "checkProperty";

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

      // Check that properties are updated without switching tabs. We might be
      // relying on the tab switch to update the properties.

      // Tab 0's enabled state doesn't reflect the default any more, so we
      // can't just run the code above again.

      browser.test.log("checkPropertyCurrent");
      whichTest = "checkPropertyCurrent";

      await checkProperty("isEnabled", true, false, true, true);
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
      await browser.browserAction.setTitle({ tabId: tabIDs[0], title: "tab0" });
      await checkProperty("getTitle", "default", "tab0", "default", "default");
      await browser.browserAction.setTitle({ title: "new" });
      await checkProperty("getTitle", "new", "tab0", "new", "new");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: "tab1" });
      await checkProperty("getTitle", "new", "tab0", "tab1", "new");
      await browser.browserAction.setTitle({ tabId: tabIDs[0], title: null });
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

      await browser.tabs.remove(tabIDs[1]);
      await browser.tabs.remove(tabIDs[2]);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_properties@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      browser_action: {
        default_title: "default",
      },
    },
  });

  let tabmail = document.getElementById("tabmail");
  tabmail.openTab("folder", { folder: rootFolder, background: false });
  tabmail.openTab("folder", { folder: rootFolder, background: false });

  let mailTabs = tabmail.tabInfo;
  is(mailTabs.length, 3);
  tabmail.switchToTab(mailTabs[0]);

  await extension.startup();

  let button = document.getElementById(
    "browser_action_properties_mochi_test-browserAction-toolbarbutton"
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

    tabmail.switchToTab(mailTabs[0]);
    extension.sendMessage();
  });

  extension.onMessage("checkPropertyCurrent", async (property, expected) => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    switch (property) {
      case "isEnabled":
        is(button.disabled, !expected[0], `button 0 enabled state`);
        break;
      case "getTitle":
        is(button.getAttribute("label"), expected[0], `button 0 label`);
        break;
    }

    extension.sendMessage();
  });

  await extension.awaitFinish("finished");
  await extension.unload();

  tabmail.closeTab(mailTabs[2]);
  tabmail.closeTab(mailTabs[1]);
  is(tabmail.tabInfo.length, 1);
});
