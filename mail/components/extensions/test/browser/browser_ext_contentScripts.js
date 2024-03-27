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

/** Tests browser.tabs.insertCSS and browser.tabs.removeCSS. */
add_task(async function testInsertRemoveCSS() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.tabs.insertCSS(tab.id, {
          code: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.tabs.removeCSS(tab.id, {
          code: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.tabs.insertCSS(tab.id, { file: "test.css" });
        await window.sendMessage();

        await browser.tabs.removeCSS(tab.id, { file: "test.css" });
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["*://mochi.test/*"],
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

/** Tests browser.tabs.insertCSS fails without the host permission. */
add_task(async function testInsertRemoveCSSNoPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [tab] = await browser.tabs.query({ active: true });

        await browser.test.assertRejects(
          browser.tabs.insertCSS(tab.id, {
            code: "body { background-color: darkred; }",
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.insertCSS(tab.id, { file: "test.css" }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.insertCSS(tab.id, {
            file: "test.css",
            matchAboutBlank: true,
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
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [],
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

/** Tests browser.tabs.executeScript. */
add_task(async function testExecuteScript() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.tabs.query({ active: true });

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.setAttribute("foo", "bar");`,
        });
        await window.sendMessage();

        await browser.tabs.executeScript(tab.id, { file: "test.js" });
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["*://mochi.test/*"],
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

/** Tests browser.tabs.executeScript fails without the host permission. */
add_task(async function testExecuteScriptNoPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.tabs.query({ active: true });

        await browser.test.assertRejects(
          browser.tabs.executeScript(tab.id, {
            code: `document.body.setAttribute("foo", "bar");`,
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.executeScript(tab.id, { file: "test.js" }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.tabs.executeScript(tab.id, {
            file: "test.js",
            matchAboutBlank: true,
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
      background: { scripts: ["utils.js", "background.js"] },
      permissions: [],
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
        const tab = await browser.tabs.query({ active: true });

        await browser.tabs.executeScript(tab.id, {
          code: `document.body.textContent = messenger.runtime.getManifest().applications.gecko.id;`,
        });
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      applications: { gecko: { id: "content_scripts@mochitest" } },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["*://mochi.test/*"],
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
 * Tests browser.contentScripts.register correctly adds CSS and JavaScript to
 * message composition windows opened after it was called. Also tests calling
 * `unregister` on the returned object.
 */
add_task(async function testRegister() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const registeredScript = await browser.contentScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
          matches: ["*://mochi.test/*"],
        });
        await window.sendMessage();

        await registeredScript.unregister();
        await window.sendMessage();

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["*://mochi.test/*"],
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
