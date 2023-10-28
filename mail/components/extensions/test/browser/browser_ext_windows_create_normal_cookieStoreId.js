/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

// Supported for creating normal windows is very limited in Thunderbird, a url
// in the createData is ignored for example. This test only verifies that all the
// things that are officially not supported, fail.

add_task(async function no_cookies_permission() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const extension = ExtensionTestUtils.loadExtension({
    async background() {
      await browser.test.assertRejects(
        browser.windows.create({ cookieStoreId: "firefox-container-1" }),
        /No permission for cookieStoreId/,
        "cookieStoreId requires cookies permission"
      );
      browser.test.sendMessage("done");
    },
  });

  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
});

add_task(async function invalid_cookieStoreId() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["cookies"],
    },
    async background() {
      await browser.test.assertRejects(
        browser.windows.create({ cookieStoreId: "not-firefox-container-1" }),
        /Illegal cookieStoreId/,
        "cookieStoreId must be valid"
      );

      await browser.test.assertRejects(
        browser.windows.create({ cookieStoreId: "firefox-private" }),
        /Illegal to set private cookieStoreId in a non-private window/,
        "cookieStoreId cannot be private in a non-private window"
      );

      browser.test.sendMessage("done");
    },
  });

  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
});

add_task(async function userContext_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", false]],
  });
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["tabs", "cookies"],
    },
    async background() {
      await browser.test.assertRejects(
        browser.windows.create({ cookieStoreId: "firefox-container-1" }),
        /Contextual identities are currently disabled/,
        "cookieStoreId cannot be a container tab ID when contextual identities are disabled"
      );
      browser.test.sendMessage("done");
    },
  });
  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
  await SpecialPowers.popPrefEnv();
});

add_task(async function cookieStoreId_and_tabId() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["cookies"],
    },
    async background() {
      for (const cookieStoreId of ["firefox-default", "firefox-container-1"]) {
        const { id: normalTabId } = await browser.tabs.create({
          cookieStoreId,
        });

        await browser.test.assertRejects(
          browser.windows.create({
            cookieStoreId: "firefox-container-2",
            tabId: normalTabId,
          }),
          /`tabId` may not be used in conjunction with `cookieStoreId`/,
          "Cannot use cookieStoreId for pre-existing tabs"
        );

        await browser.tabs.remove(normalTabId);
      }

      browser.test.sendMessage("done");
    },
  });

  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
});
