/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

add_setup(async function () {
  // make sure userContext is enabled.
  return SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });
});

add_task(async function () {
  info("Start testing tabs.create with cookieStoreId");

  const testCases = [
    {
      cookieStoreId: undefined,
      expectedCookieStoreId: "firefox-default",
    },
    {
      cookieStoreId: "firefox-default",
      expectedCookieStoreId: "firefox-default",
    },
    {
      cookieStoreId: "firefox-container-1",
      expectedCookieStoreId: "firefox-container-1",
    },
    {
      cookieStoreId: "firefox-container-2",
      expectedCookieStoreId: "firefox-container-2",
    },
    { cookieStoreId: "firefox-container-42", failure: "exist" },
    { cookieStoreId: "firefox-private", failure: "defaultToPrivate" },
    { cookieStoreId: "wow", failure: "illegal" },
  ];

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["tabs", "cookies"],
    },

    background() {
      function testTab(data, tab) {
        browser.test.assertTrue(!data.failure, "we want a success");
        browser.test.assertTrue(!!tab, "we have a tab");
        browser.test.assertEq(
          data.expectedCookieStoreId,
          tab.cookieStoreId,
          "tab should have the correct cookieStoreId"
        );
      }

      async function runTest(data) {
        try {
          // Tab Creation
          let tab;
          try {
            tab = await browser.tabs.create({
              windowId: this.defaultWindowId,
              cookieStoreId: data.cookieStoreId,
            });

            browser.test.assertTrue(!data.failure, "we want a success");
          } catch (error) {
            browser.test.assertTrue(!!data.failure, "we want a failure");
            if (data.failure == "illegal") {
              browser.test.assertEq(
                `Illegal cookieStoreId: ${data.cookieStoreId}`,
                error.message,
                "runtime.lastError should report the expected error message"
              );
            } else if (data.failure == "defaultToPrivate") {
              browser.test.assertEq(
                "Illegal to set private cookieStoreId in a non-private window",
                error.message,
                "runtime.lastError should report the expected error message"
              );
            } else if (data.failure == "privateToDefault") {
              browser.test.assertEq(
                "Illegal to set non-private cookieStoreId in a private window",
                error.message,
                "runtime.lastError should report the expected error message"
              );
            } else if (data.failure == "exist") {
              browser.test.assertEq(
                `No cookie store exists with ID ${data.cookieStoreId}`,
                error.message,
                "runtime.lastError should report the expected error message"
              );
            } else {
              browser.test.fail("The test is broken");
            }

            browser.test.sendMessage("test-done");
            return;
          }

          // Tests for tab creation
          testTab(data, tab);

          {
            // Tests for tab querying
            const [qtab] = await browser.tabs.query({
              windowId: this.defaultWindowId,
              cookieStoreId: data.cookieStoreId,
            });

            browser.test.assertTrue(qtab != undefined, "Tab found!");
            testTab(data, qtab);
          }

          const stores = await browser.cookies.getAllCookieStores();

          const store = stores.find(s => s.id === tab.cookieStoreId);
          browser.test.assertTrue(!!store, "We have a store for this tab.");
          browser.test.assertTrue(
            store.tabIds.includes(tab.id),
            "tabIds includes this tab."
          );

          await browser.tabs.remove(tab.id);

          browser.test.sendMessage("test-done");
        } catch (e) {
          browser.test.fail("An exception has been thrown");
        }
      }

      async function initialize() {
        const win = await browser.windows.getCurrent();
        this.defaultWindowId = win.id;

        browser.test.sendMessage("ready");
      }

      async function shutdown() {
        browser.test.sendMessage("gone");
      }

      // Waiting for messages
      browser.test.onMessage.addListener((msg, data) => {
        if (msg == "be-ready") {
          initialize();
        } else if (msg == "test") {
          runTest(data);
        } else {
          browser.test.assertTrue("finish", msg, "Shutting down");
          shutdown();
        }
      });
    },
  });

  await extension.startup();

  info("Tests must be ready...");
  extension.sendMessage("be-ready");
  await extension.awaitMessage("ready");
  info("Tests are ready to run!");

  for (const test of testCases) {
    info(`test tab.create with cookieStoreId: "${test.cookieStoreId}"`);
    extension.sendMessage("test", test);
    await extension.awaitMessage("test-done");
  }

  info("Waiting for shutting down...");
  extension.sendMessage("finish");
  await extension.awaitMessage("gone");

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
        browser.tabs.create({ cookieStoreId: "firefox-container-1" }),
        /Contextual identities are currently disabled/,
        "should refuse to open container tab when contextual identities are disabled"
      );
      browser.test.sendMessage("done");
    },
  });
  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
  await SpecialPowers.popPrefEnv();
});

add_task(async function tabs_query_cookiestoreid_nocookiepermission() {
  const extension = ExtensionTestUtils.loadExtension({
    async background() {
      const tab = await browser.tabs.create({});
      browser.test.assertEq(
        "firefox-default",
        tab.cookieStoreId,
        "Expecting cookieStoreId for new tab"
      );
      const query = await browser.tabs.query({
        index: tab.index,
        cookieStoreId: tab.cookieStoreId,
      });
      browser.test.assertEq(
        "firefox-default",
        query[0].cookieStoreId,
        "Expecting cookieStoreId for new tab through browser.tabs.query"
      );
      await browser.tabs.remove(tab.id);
      browser.test.sendMessage("done");
    },
  });
  await extension.startup();
  await extension.awaitMessage("done");
  await extension.unload();
});

add_task(async function tabs_query_multiple_cookiestoreId() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["cookies"],
    },

    async background() {
      const tab1 = await browser.tabs.create({
        cookieStoreId: "firefox-container-1",
      });
      browser.test.log(`Tab created for cookieStoreId:${tab1.cookieStoreId}`);

      const tab2 = await browser.tabs.create({
        cookieStoreId: "firefox-container-2",
      });
      browser.test.log(`Tab created for cookieStoreId:${tab2.cookieStoreId}`);

      const tab3 = await browser.tabs.create({
        cookieStoreId: "firefox-container-3",
      });
      browser.test.log(`Tab created for cookieStoreId:${tab3.cookieStoreId}`);

      const tabs = await browser.tabs.query({
        cookieStoreId: ["firefox-container-1", "firefox-container-2"],
      });

      browser.test.assertEq(
        2,
        tabs.length,
        "Expecting tabs for firefox-container-1 and firefox-container-2"
      );

      browser.test.assertEq(
        "firefox-container-1",
        tabs[0].cookieStoreId,
        "Expecting tab for firefox-container-1 cookieStoreId"
      );

      browser.test.assertEq(
        "firefox-container-2",
        tabs[1].cookieStoreId,
        "Expecting tab for firefox-container-2 cookieStoreId"
      );

      await browser.tabs.remove([tab1.id, tab2.id, tab3.id]);
      browser.test.sendMessage("test-done");
    },
  });
  await extension.startup();
  await extension.awaitMessage("test-done");
  await extension.unload();
});
