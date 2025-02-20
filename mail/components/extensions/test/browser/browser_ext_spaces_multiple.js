/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load subscript shared with all spaces tests.
Services.scriptloader.loadSubScript(
  new URL("head_spaces.js", gTestPath).href,
  this
);

// Load a second extension parallel to the standard space test, which creates
// two additional spaces.
async function test_query({ permissions }) {
  async function query_background() {
    function verify(description, expected, spaces) {
      browser.test.assertEq(
        expected.length,
        spaces.length,
        `${description}: Should find the correct number of spaces`
      );
      window.assertDeepEqual(
        spaces,
        expected,
        `${description}: Should find the correct spaces`
      );
    }

    async function query(queryInfo, expected) {
      const spaces =
        queryInfo === null
          ? await browser.spaces.query()
          : await browser.spaces.query(queryInfo);
      verify(`Query ${JSON.stringify(queryInfo)}`, expected, spaces);
    }

    const builtIn = [
      {
        id: 1,
        name: "mail",
        isBuiltIn: true,
        isSelfOwned: false,
      },
      {
        id: 2,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "addressbook",
      },
      {
        id: 3,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "calendar",
      },
      {
        id: 4,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "tasks",
      },
      {
        id: 5,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "chat",
      },
      {
        id: 6,
        isBuiltIn: true,
        isSelfOwned: false,
        name: "settings",
      },
    ];

    await window.sendMessage("checkTabs", { openSpacesUrls: [] });
    const [{ other_1, other_11, permissions: perms }] =
      await window.sendMessage("getConfig");
    const hasManagement = perms && perms.includes("management");

    // Verify space_1 from other extension.
    const expected_other_1 = {
      name: "space_1",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_other_1.extensionId = "spaces_toolbar_other@mochi.test";
    }
    verify("Check space_1 from other extension", other_1, expected_other_1);

    // Verify space_11 from other extension.
    const expected_other_11 = {
      name: "space_11",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_other_11.extensionId = "spaces_toolbar_other@mochi.test";
    }
    verify("Check space_11 from other extension", other_11, expected_other_11);

    // Manipulate isSelfOwned, because we got those from the other extension.
    other_1.isSelfOwned = false;
    other_11.isSelfOwned = false;

    await query(null, [...builtIn, other_1, other_11]);
    await query({}, [...builtIn, other_1, other_11]);
    await query({ isSelfOwned: false }, [...builtIn, other_1, other_11]);
    await query({ isBuiltIn: true }, [...builtIn]);
    await query({ isBuiltIn: false }, [other_1, other_11]);
    await query({ isSelfOwned: true }, []);
    await query(
      { extensionId: "spaces_toolbar_other@mochi.test" },
      hasManagement ? [other_1, other_11] : []
    );

    // Add spaces.
    const url1 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
    const space_1 = await browser.spaces.create("space_1", url1);
    const url2 = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content_body.html`;
    const space_2 = await browser.spaces.create("space_2", url2);

    // Verify returned space_1
    const expected_space_1 = {
      name: "space_1",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_space_1.extensionId = "spaces_toolbar@mochi.test";
    }
    verify("Check space_1", space_1, expected_space_1);

    // Verify returned space_2
    const expected_space_2 = {
      name: "space_2",
      isBuiltIn: false,
      isSelfOwned: true,
    };
    if (hasManagement) {
      expected_space_2.extensionId = "spaces_toolbar@mochi.test";
    }
    verify("Check space_2", space_2, expected_space_2);

    await query(null, [...builtIn, other_1, other_11, space_1, space_2]);
    await query({ isSelfOwned: false }, [...builtIn, other_1, other_11]);
    await query({ isBuiltIn: true }, [...builtIn]);
    await query({ isBuiltIn: false }, [other_1, other_11, space_1, space_2]);
    await query({ isSelfOwned: true }, [space_1, space_2]);
    await query(
      { extensionId: "spaces_toolbar_other@mochi.test" },
      hasManagement ? [other_1, other_11] : []
    );
    await query(
      { extensionId: "spaces_toolbar@mochi.test" },
      hasManagement ? [space_1, space_2] : []
    );

    await query({ spaceId: space_1.id }, [space_1]);
    await query({ spaceId: other_1.id }, [other_1]);
    await query({ spaceId: space_2.id }, [space_2]);
    await query({ spaceId: other_11.id }, [other_11]);
    await query({ name: "space_1" }, [other_1, space_1]);
    await query({ name: "space_2" }, [space_2]);
    await query({ name: "space_11" }, [other_11]);

    browser.test.notifyPass();
  }

  const otherExtension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const url = `http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html`;
        // Test string url as second parameter.
        const other_1 = await browser.spaces.create("space_1", url);
        // Test SpaceTabProperties as second parameter.
        const other_11 = await browser.spaces.create("space_11", { url });
        browser.test.sendMessage("Done", { other_1, other_11 });
        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      browser_specific_settings: {
        gecko: {
          id: "spaces_toolbar_other@mochi.test",
        },
      },
      permissions,
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  await otherExtension.startup();
  const { other_1, other_11 } = await otherExtension.awaitMessage("Done");

  await test_space(query_background, {
    selectedTheme: "default",
    other_1,
    other_11,
    permissions,
  });

  await otherExtension.awaitFinish();
  await otherExtension.unload();
}

add_task(async function test_query_no_management_permission() {
  await test_query({ permissions: [] });
});

add_task(async function test_query_management_permission() {
  await test_query({ permissions: ["management"] });
});
