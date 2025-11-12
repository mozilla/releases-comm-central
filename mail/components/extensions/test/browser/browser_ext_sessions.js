/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function test_sessions_data() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      async function tab_test(tab, value1, value2) {
        // Check that there is no data at the beginning.
        browser.test.assertEq(
          await browser.sessions.getTabValue(tab.id, "aKey"),
          undefined,
          "Value for aKey should not exist"
        );

        // Set some data.
        await browser.sessions.setTabValue(tab.id, "aKey", value1);

        // Check the data is correct.
        browser.test.assertEq(
          await browser.sessions.getTabValue(tab.id, "aKey"),
          value1,
          "Value for aKey should exist"
        );

        // Update data.
        await browser.sessions.setTabValue(tab.id, "aKey", value2);

        // Check the data is correct.
        browser.test.assertEq(
          await browser.sessions.getTabValue(tab.id, "aKey"),
          value2,
          "Value for aKey should exist"
        );

        // Clear data.
        await browser.sessions.removeTabValue(tab.id, "aKey");

        // Check the data is removed.
        browser.test.assertEq(
          await browser.sessions.getTabValue(tab.id, "aKey"),
          undefined,
          "Value for aKey should not exist"
        );
      }

      const [mailTab] = await browser.tabs.query({ mailTab: true });

      const popupWindow = await browser.windows.create({
        url: "https://www.example.com",
        type: "popup",
      });
      const [popupTab] = await browser.tabs.query({ windowId: popupWindow.id });

      const contentTab = await browser.tabs.create({
        url: "https://www.example.com",
      });

      const composeTab = await browser.compose.beginNew();

      await tab_test(mailTab, "1234", "12345");
      await tab_test(popupTab, "abcd", "bcda");
      await tab_test(contentTab, "4321", "54321");
      await tab_test(composeTab, "dcba", "cbad");

      await browser.tabs.remove(popupTab.id);
      await browser.tabs.remove(contentTab.id);
      await browser.tabs.remove(composeTab.id);

      browser.test.notifyPass();
    },
    manifest: {
      manifest_version: 2,
      browser_specific_settings: {
        gecko: {
          id: "sessions@mochi.test",
        },
      },
      permissions: ["tabs", "sessions"],
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
