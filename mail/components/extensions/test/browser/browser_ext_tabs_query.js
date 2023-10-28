/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testQuery() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // There should be a single mailtab at startup.
        let tabs = await browser.tabs.query({});

        browser.test.assertEq(1, tabs.length, "Found one tab at startup");
        browser.test.assertEq("mail", tabs[0].type, "Tab is mail tab");
        const mailTab = tabs[0];

        // Create a content tab.
        const contentTab = await browser.tabs.create({ url: "test.html" });
        browser.test.assertTrue(
          contentTab.id != mailTab.id,
          "Id of content tab is different from mail tab"
        );

        // Query spaces.
        const spaces = await browser.spaces.query({ id: mailTab.spaceId });
        browser.test.assertEq(1, spaces.length, "Found one matching space");
        browser.test.assertEq(
          "mail",
          spaces[0].name,
          "Space is the mail space"
        );

        // Query for all tabs.
        tabs = await browser.tabs.query({});
        browser.test.assertEq(2, tabs.length, "Found two tabs");

        // Query for the content tab.
        tabs = await browser.tabs.query({ type: "content" });
        browser.test.assertEq(1, tabs.length, "Found one content tab");
        browser.test.assertEq(
          contentTab.id,
          tabs[0].id,
          "Id of content tab is correct"
        );

        // Query for the mail tab using spaceId.
        tabs = await browser.tabs.query({ spaceId: mailTab.spaceId });
        browser.test.assertEq(1, tabs.length, "Found one mail tab");
        browser.test.assertEq(
          mailTab.id,
          tabs[0].id,
          "Id of mail tab is correct"
        );

        // Query for the mail tab using type.
        tabs = await browser.tabs.query({ type: "mail" });
        browser.test.assertEq(1, tabs.length, "Found one mail tab");
        browser.test.assertEq(
          mailTab.id,
          tabs[0].id,
          "Id of mail tab is correct"
        );

        // Query for the mail tab using mailTab.
        tabs = await browser.tabs.query({ mailTab: true });
        browser.test.assertEq(1, tabs.length, "Found one mail tab");
        browser.test.assertEq(
          mailTab.id,
          tabs[0].id,
          "Id of mail tab is correct"
        );

        // Query for the content tab but also using mailTab.
        tabs = await browser.tabs.query({ mailTab: true, type: "content" });
        browser.test.assertEq(1, tabs.length, "Found one mail tab");
        browser.test.assertEq(
          mailTab.id,
          tabs[0].id,
          "Id of mail tab is correct"
        );

        // Query for active tab.
        tabs = await browser.tabs.query({ active: true });
        browser.test.assertEq(1, tabs.length, "Found one mail tab");
        browser.test.assertEq(
          contentTab.id,
          tabs[0].id,
          "Id of mail tab is correct"
        );

        // Query for highlighted tab.
        tabs = await browser.tabs.query({ highlighted: true });
        browser.test.assertEq(1, tabs.length, "Found one mail tab");
        browser.test.assertEq(
          contentTab.id,
          tabs[0].id,
          "Id of mail tab is correct"
        );

        await browser.tabs.remove(contentTab.id);
        browser.test.notifyPass();
      },
      "test.html": "<html><body>I'm a real page!</body></html>",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
