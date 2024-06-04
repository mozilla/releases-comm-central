/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const CONTENT_PAGE =
  "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html";
const UNCHANGED_VALUES = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  color: "rgb(0, 0, 0)",
  foo: null,
  textContent: "\n  This is text.\n  This is a link with text.\n  \n\n\n",
};

/** Tests browser.scripting.insertCSS and browser.scripting.removeCSS. */
add_task(async function testInsertRemoveCSS() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.scripting.insertCSS({
          target: { tabId: tab.id },
          css: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.scripting.removeCSS({
          target: { tabId: tab.id },
          css: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["test.css"],
        });
        await window.sendMessage();

        await browser.scripting.removeCSS({
          target: { tabId: tab.id },
          files: ["test.css"],
        });
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
      host_permissions: ["*://mochi.test/*"],
    },
  });

  const tab = window.openContentTab(CONTENT_PAGE);
  await awaitBrowserLoaded(tab.browser, CONTENT_PAGE);

  await extension.startup();

  await extension.awaitMessage(); // insertCSS with code
  await checkContent(tab.browser, { backgroundColor: "rgb(0, 255, 0)" });
  extension.sendMessage();

  await extension.awaitMessage(); // removeCSS with code
  await checkContent(tab.browser, UNCHANGED_VALUES);
  extension.sendMessage();

  await extension.awaitMessage(); // insertCSS with file
  await checkContent(tab.browser, { backgroundColor: "rgb(0, 128, 0)" });
  extension.sendMessage();

  await extension.awaitFinish("finished"); // removeCSS with file
  await checkContent(tab.browser, UNCHANGED_VALUES);

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});

/** Tests browser.scripting.insertCSS fails without the host permission. */
add_task(async function testInsertRemoveCSSNoHostPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.test.assertRejects(
          browser.scripting.insertCSS({
            target: { tabId: tab.id },
            css: "body { background-color: darkred; }",
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["test.css"],
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["test.css"],
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
    },
  });

  const tab = window.openContentTab(CONTENT_PAGE);
  await awaitBrowserLoaded(tab.browser, CONTENT_PAGE);

  await extension.startup();

  await extension.awaitFinish("finished");
  await checkContent(tab.browser, UNCHANGED_VALUES);

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});

/** Tests browser.scripting.executeScript. */
add_task(async function testExecuteScript() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            document.body.setAttribute("foo", "bar");
          },
        });
        await window.sendMessage();

        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["test.js"],
        });
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
      host_permissions: ["*://mochi.test/*"],
    },
  });

  const tab = window.openContentTab(CONTENT_PAGE);
  await awaitBrowserLoaded(tab.browser, CONTENT_PAGE);

  await extension.startup();

  await extension.awaitMessage(); // executeScript with code
  await checkContent(tab.browser, { foo: "bar" });
  extension.sendMessage();

  await extension.awaitFinish("finished"); // executeScript with file
  await checkContent(tab.browser, {
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});

/** Tests browser.scripting.executeScript fails without the host permission. */
add_task(async function testExecuteScriptNoHostPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.test.assertRejects(
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              document.body.setAttribute("foo", "bar");
            },
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["test.js"],
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["test.js"],
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
    },
  });

  const tab = window.openContentTab(CONTENT_PAGE);
  await awaitBrowserLoaded(tab.browser, CONTENT_PAGE);

  await extension.startup();

  await extension.awaitFinish("finished");
  await checkContent(tab.browser, UNCHANGED_VALUES);

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});

/** Tests the messenger alias is available. */
add_task(async function testExecuteScriptAlias() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // eslint-disable-next-line no-undef
            const id = messenger.runtime.getManifest().applications.gecko.id;
            document.body.textContent = id;
          },
        });
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      browser_specific_settings: { gecko: { id: "content_scripts@mochitest" } },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
      host_permissions: ["*://mochi.test/*"],
    },
  });

  const tab = window.openContentTab(CONTENT_PAGE);
  await awaitBrowserLoaded(tab.browser, CONTENT_PAGE);

  await extension.startup();

  await extension.awaitFinish("finished");
  await checkContent(tab.browser, { textContent: "content_scripts@mochitest" });

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});

/**
 * Tests `browser.scripting.registerContentScripts()` correctly adds CSS and
 * JavaScript to message composition windows opened after it was called. Also
 * tests calling `browser.scripting.unregisterContentScripts()`
 */
add_task(async function testRegister() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const expectedDetails = [
          {
            id: "test-1",
            allFrames: false,
            matches: ["*://mochi.test/*"],
            matchOriginAsFallback: false,
            runAt: "document_idle",
            world: "ISOLATED",
            persistAcrossSessions: true,
            css: ["test.css"],
            js: ["test.js"],
          },
        ];
        const scriptDetails = await browser.scripting.registerContentScripts([
          {
            id: "test-1",
            css: ["test.css"],
            js: ["test.js"],
            matches: ["*://mochi.test/*"],
          },
        ]);
        window.assertDeepEqual(
          // Whoops, mozilla-central may have this wrong, at least according to
          // the MDN documentation. Bug 1896508.
          undefined /* expectedDetails */,
          scriptDetails,
          `Details of registered script should be correct`,
          { strict: true }
        );

        // Test getRegisteredScripts(filter).
        const testsForGetRegisteredScripts = [
          { expected: expectedDetails },
          { filter: {}, expected: expectedDetails },
          { filter: { ids: [] }, expected: [] },
          { filter: { ids: ["test-1"] }, expected: expectedDetails },
          { filter: { ids: ["test-1", "test-2"] }, expected: expectedDetails },
          { filter: { ids: ["test-2"] }, expected: [] },
        ];
        for (const test of testsForGetRegisteredScripts) {
          window.assertDeepEqual(
            test.expected,
            await browser.scripting.getRegisteredContentScripts(test.filter),
            `Return value of getRegisteredScripts(${JSON.stringify(
              test.filter
            )}) should be correct`,
            { strict: true }
          );
        }

        await window.sendMessage();

        // Test unregisterScripts(filter).
        const testsForUnregisterScripts = [
          { filter: {}, expected: [] },
          { filter: { ids: [] }, expected: expectedDetails },
          {
            filter: { ids: ["test-2"] },
            expected: expectedDetails,
            expectedError: `Content script with id "test-2" does not exist.`,
          },
          { filter: { ids: ["test-1"] }, expected: [] },
          {
            filter: { ids: ["test-1", "test-2"] },
            // The entire call rejects, not just the request to unregister the
            // test-2 script.
            expected: expectedDetails,
            expectedError: `Content script with id "test-2" does not exist.`,
          },
        ];
        for (const test of testsForUnregisterScripts) {
          let error = false;
          try {
            await browser.scripting.unregisterContentScripts(test.filter);
          } catch (ex) {
            browser.test.assertEq(
              test.expectedError,
              ex.message,
              "Error message of unregisterContentScripts() should be correct"
            );
            error = true;
          }
          browser.test.assertEq(
            !!test.expectedError,
            error,
            "unregisterContentScripts() should throw as expected"
          );
          window.assertDeepEqual(
            test.expected,
            await browser.scripting.getRegisteredContentScripts(),
            `Registered scripts after unregisterContentScripts(${JSON.stringify(
              test.filter
            )}) should be correct`,
            { strict: true }
          );
          // Re-Register.
          try {
            await browser.scripting.registerContentScripts([
              {
                id: "test-1",
                css: ["test.css"],
                js: ["test.js"],
                matches: ["*://mochi.test/*"],
              },
            ]);
          } catch (ex) {
            // Yep, this may throw, if we re-register a script which exists already.
            console.log(ex);
          }
          // Re-Check.
          window.assertDeepEqual(
            expectedDetails,
            await browser.scripting.getRegisteredContentScripts(),
            `Registered scripts after re-registering should be correct`,
            { strict: true }
          );
        }

        await browser.scripting.unregisterContentScripts();
        window.assertDeepEqual(
          [],
          await browser.scripting.getRegisteredContentScripts(),
          `Registered scripts after unregisterContentScripts() should be correct`,
          { strict: true }
        );

        await window.sendMessage();

        browser.test.notifyPass("finished");
      },
      "test.css": "body { color: white; background-color: green; }",
      "test.js": () => {
        document.body.setAttribute("foo", "bar");
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
      host_permissions: ["*://mochi.test/*"],
    },
  });

  // Tab 1: loads before the script is registered.
  const tab1 = window.openContentTab(CONTENT_PAGE + "?tab1");
  await awaitBrowserLoaded(tab1.browser, CONTENT_PAGE + "?tab1");

  await extension.startup();

  await extension.awaitMessage(); // register
  // Registering a script will not inject it into already open tabs, wait a moment
  // to make sure we still get the unchanged values.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));
  await checkContent(tab1.browser, UNCHANGED_VALUES);

  // Tab 2: loads after the script is registered.
  const tab2 = window.openContentTab(CONTENT_PAGE + "?tab2");
  await awaitBrowserLoaded(tab2.browser, CONTENT_PAGE + "?tab2");
  await checkContent(tab2.browser, {
    backgroundColor: "rgb(0, 128, 0)",
    color: "rgb(255, 255, 255)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  extension.sendMessage();
  await extension.awaitMessage(); // unregister

  await checkContent(tab2.browser, {
    backgroundColor: "rgb(0, 128, 0)",
    color: "rgb(255, 255, 255)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  // Tab 3: loads after the script is unregistered.
  const tab3 = window.openContentTab(CONTENT_PAGE + "?tab3");
  await awaitBrowserLoaded(tab3.browser, CONTENT_PAGE + "?tab3");
  await checkContent(tab3.browser, UNCHANGED_VALUES);

  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  // Tab 2 should have the CSS removed.
  await checkContent(tab2.browser, {
    backgroundColor: UNCHANGED_VALUES.backgroundColor,
    color: UNCHANGED_VALUES.color,
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  const tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

/** Tests content_scripts in the manifest with permission work. */
add_task(async function testManifest() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.css": "body { background-color: lime; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
    },
    manifest: {
      manifest_version: 3,
      content_scripts: [
        {
          matches: ["<all_urls>"],
          css: ["test.css"],
          js: ["test.js"],
        },
      ],
    },
  });

  // Tab 1: loads before the script is registered.
  const tab1 = window.openContentTab(CONTENT_PAGE + "?tab1");
  await awaitBrowserLoaded(tab1.browser, CONTENT_PAGE + "?tab1");

  // The extension is not running, no script should be injected, wait a moment to
  // make sure we still get the unchanged values.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));
  await checkContent(tab1.browser, UNCHANGED_VALUES);

  await extension.startup();

  // The extension started and the content script defined in the manifest should
  // be injected into the already open tab.
  await checkContent(tab1.browser, {
    backgroundColor: "rgb(0, 255, 0)",
    textContent: "Hey look, the script ran!",
  });

  // Tab 2: loads after the script is registered.
  const tab2 = window.openContentTab(CONTENT_PAGE + "?tab2");
  await awaitBrowserLoaded(tab2.browser, CONTENT_PAGE + "?tab2");
  await checkContent(tab2.browser, {
    backgroundColor: "rgb(0, 255, 0)",
    textContent: "Hey look, the script ran!",
  });

  await extension.unload();

  // Tab 2 should have the CSS removed.
  await checkContent(tab2.browser, {
    backgroundColor: UNCHANGED_VALUES.backgroundColor,
    textContent: "Hey look, the script ran!",
  });

  const tabmail = document.getElementById("tabmail");
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

/** Tests content_scripts match patterns in the manifest. */
add_task(async function testManifestNoPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.css": "body { background-color: red; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
    },
    manifest: {
      manifest_version: 3,
      content_scripts: [
        {
          matches: ["*://example.org/*"],
          css: ["test.css"],
          js: ["test.js"],
        },
      ],
    },
  });

  await extension.startup();

  const tab = window.openContentTab(CONTENT_PAGE);
  await awaitBrowserLoaded(tab.browser, CONTENT_PAGE);
  await checkContent(tab.browser, UNCHANGED_VALUES);

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});
