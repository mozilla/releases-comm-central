/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_sessions_data() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const [mailTab] = await browser.tabs.query({ mailTab: true });
      const contentTab = await browser.tabs.create({
        url: "https://www.example.com",
      });

      // Check that there is no data at the beginning.
      browser.test.assertEq(
        await browser.sessions.getTabValue(mailTab.id, "aKey"),
        undefined,
        "Value for aKey should not exist"
      );
      browser.test.assertEq(
        await browser.sessions.getTabValue(contentTab.id, "aKey"),
        undefined,
        "Value for aKey should not exist"
      );

      // Set some data.
      await browser.sessions.setTabValue(mailTab.id, "aKey", "1234");
      await browser.sessions.setTabValue(contentTab.id, "aKey", "4321");

      // Check the data is correct.
      browser.test.assertEq(
        await browser.sessions.getTabValue(mailTab.id, "aKey"),
        "1234",
        "Value for aKey should exist"
      );
      browser.test.assertEq(
        await browser.sessions.getTabValue(contentTab.id, "aKey"),
        "4321",
        "Value for aKey should exist"
      );

      // Update data.
      await browser.sessions.setTabValue(mailTab.id, "aKey", "12345");
      await browser.sessions.setTabValue(contentTab.id, "aKey", "54321");

      // Check the data is correct.
      browser.test.assertEq(
        await browser.sessions.getTabValue(mailTab.id, "aKey"),
        "12345",
        "Value for aKey should exist"
      );
      browser.test.assertEq(
        await browser.sessions.getTabValue(contentTab.id, "aKey"),
        "54321",
        "Value for aKey should exist"
      );

      // Clear data.
      await browser.sessions.removeTabValue(mailTab.id, "aKey");
      await browser.sessions.removeTabValue(contentTab.id, "aKey");

      // Check the data is removed.
      browser.test.assertEq(
        await browser.sessions.getTabValue(mailTab.id, "aKey"),
        undefined,
        "Value for aKey should not exist"
      );
      browser.test.assertEq(
        await browser.sessions.getTabValue(contentTab.id, "aKey"),
        undefined,
        "Value for aKey should not exist"
      );

      await browser.tabs.remove(contentTab.id);
      browser.test.notifyPass();
    },
    manifest: {
      manifest_version: 2,
      browser_specific_settings: {
        gecko: {
          id: "sessions@mochi.test",
        },
      },
      permissions: ["tabs"],
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
