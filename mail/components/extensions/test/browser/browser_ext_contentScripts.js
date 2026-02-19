/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * This test is using opening tabs and popups and tests content script and css
 * injection in web pages and into about:blank.
 */

const CONTENT_PAGE =
  "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/content.html";
const CONTENT_VALUES = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  color: "rgb(0, 0, 0)",
  foo: null,
  textContent: "\n  This is text.\n  This is a link with text.\n  \n\n\n",
};
const ABOUTBLANK_VALUES = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  color: "rgb(0, 0, 0)",
  foo: null,
  textContent: "",
};
const CONTENT_TASKS = [
  "openContentTab",
  "updateMailTabBrowser",
  "createWebExtensionTab",
  "createWebExtensionPopup",
];
const ABOUTBLANK_TASKS = [
  "openContentTab",
  // TODO: Investigate why we cannot load about:blank in the mail tab via
  //       tabs.update(). Even if we include about:blank in `isContentTab` in
  //       ext-tabs.js, the resulting tab does not receive a browser and many
  //       assumptions in the API fail.
  //"updateMailTabBrowser",
  "createWebExtensionTab",
  "createWebExtensionPopup",
];

const {
  Management: {
    global: { tabTracker, windowTracker },
  },
} = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");

/**
 * Helper function for the initial ping-pong communication with the background
 * script to open the requested tab and wait for it to load.
 *
 * @param {Extension} extension
 * @param {object} testConfig
 * @param {string} testConfig.url - The url to open in the test tab.
 * @param {string} testConfig.tabConfig - Determines how the tab is created:
 *    - "openContentTab": Use window.openContentTab() to create the tab.
 *    - "createWebExtensionTab": Use browser.tabs.create() to create the tab.
 *    - "updateMailTabBrowser": Use browser.tabs.update() to load a page into a
 *                              mail tab.
 *    - "createWebExtensionPopup": Use browser.windows.create() to create a popup
 *                                 window.
 *
 * @returns {Promise<NativeTab>} Resolves to the loaded tab.
 */
async function getInitialTabLoaded(extension, testConfig) {
  info(
    `Preparing sub test for ${testConfig.tabConfig} with url ${testConfig.url}`
  );
  await extension.awaitMessage("get test config");
  // Create the content tab, if requested by the testConfig. Otherwise the
  // extension will create one after it has received the configuration.
  if (testConfig.tabConfig == "openContentTab") {
    window.openContentTab(testConfig.url);
  }
  extension.sendMessage(testConfig);

  const id = await extension.awaitMessage("load tab");
  const tab = tabTracker.getTab(id);
  await awaitBrowserLoaded(tab.browser, url => url.endsWith(testConfig.url));
  extension.sendMessage();

  return tab;
}

/**
 * Helper function used by the test extension to make common functions available
 * in the background.
 */
function getBackgoundHelperFunctions() {
  return () => {
    window.getTestTab = async config => {
      // Do we need to create a tab, or was it created via openContentTab()?
      switch (config.tabConfig) {
        case "openContentTab":
          return browser.tabs.query({ active: true }).then(tabs => tabs[0]);

        case "createWebExtensionTab":
          return browser.tabs.create({ url: config.url });

        case "updateMailTabBrowser":
          return browser.tabs
            .query({ active: true })
            .then(tabs => browser.tabs.update(tabs[0].id, { url: config.url }));

        case "createWebExtensionPopup":
          return browser.windows
            .create({
              url: config.url,
              type: "popup",
            })
            .then(win => win.tabs[0]);
      }
      browser.test.fail(`Unknown tab config: ${config.tabConfig}`);
      return null;
    };
  };
}

async function verifyInsertRemoveCSS(extension, testConfig) {
  await extension.startup();

  const tab = await getInitialTabLoaded(extension, testConfig);

  await extension.awaitMessage("code insertCSS()");
  await checkContent(tab.browser, { backgroundColor: "rgb(0, 255, 0)" });
  extension.sendMessage();

  await extension.awaitMessage("code removeCSS()");
  await checkContent(tab.browser, testConfig.values);
  extension.sendMessage();

  await extension.awaitMessage("file insertCSS()");
  await checkContent(tab.browser, { backgroundColor: "rgb(0, 128, 0)" });
  extension.sendMessage();

  await extension.awaitMessage("file removeCSS()");
  await checkContent(tab.browser, testConfig.values);
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

async function verifyExecuteScript(extension, testConfig) {
  await extension.startup();

  const tab = await getInitialTabLoaded(extension, testConfig);

  await extension.awaitMessage("code executeScript()");
  await extension.awaitMessage("expected code injection");
  await checkContent(tab.browser, { foo: "bar" });
  extension.sendMessage();

  await extension.awaitMessage("file executeScript()");
  await extension.awaitMessage("expected file injection");
  await checkContent(tab.browser, {
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

async function verifyAliasInjection(extension, testConfig) {
  await extension.startup();

  const tab = await getInitialTabLoaded(extension, testConfig);

  await extension.awaitMessage("code executeScript()");
  await extension.awaitMessage("expected code injection");
  await checkContent(tab.browser, { textContent: "content_scripts@mochitest" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

async function verifyNoPermissions(extension, testConfig) {
  await extension.startup();

  const tab = await getInitialTabLoaded(extension, testConfig);

  await extension.awaitMessage("ready");
  await checkContent(tab.browser, testConfig.values);
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

/** Tests browser.tabs.insertCSS and browser.tabs.removeCSS. */
add_task(async function testInsertRemoveCSS() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.tabs.insertCSS(tab.id, {
            code: "body { background-color: lime; }",
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("code insertCSS()");

          await browser.tabs.removeCSS(tab.id, {
            code: "body { background-color: lime; }",
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("code removeCSS()");

          await browser.tabs.insertCSS(tab.id, {
            file: "test.css",
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("file insertCSS()");

          await browser.tabs.removeCSS(tab.id, {
            file: "test.css",
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("file removeCSS()");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.css": "body { background-color: green; }",
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyInsertRemoveCSS(
      await extension({
        manifest_version: 2,
        permissions: ["*://mochi.test/*"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
        values: CONTENT_VALUES,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyInsertRemoveCSS(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
        values: ABOUTBLANK_VALUES,
        matchAboutBlank: true,
      }
    );
  }
});

/** Tests browser.scripting.insertCSS and browser.scripting.removeCSS. */
add_task(async function testInsertRemoveCSSViaScriptingAPI() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.scripting.insertCSS({
            target: { tabId: tab.id },
            css: "body { background-color: lime; }",
          });
          await window.sendMessage("code insertCSS()");

          await browser.scripting.removeCSS({
            target: { tabId: tab.id },
            css: "body { background-color: lime; }",
          });
          await window.sendMessage("code removeCSS()");

          await browser.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["test.css"],
          });
          await window.sendMessage("file insertCSS()");

          await browser.scripting.removeCSS({
            target: { tabId: tab.id },
            files: ["test.css"],
          });
          await window.sendMessage("file removeCSS()");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.css": "body { background-color: green; }",
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyInsertRemoveCSS(
      await extension({
        manifest_version: 2,
        permissions: ["*://mochi.test/*", "scripting"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
        values: CONTENT_VALUES,
      }
    );
    await verifyInsertRemoveCSS(
      await extension({
        manifest_version: 3,
        permissions: ["scripting"],
        host_permissions: ["*://mochi.test/*"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
        values: CONTENT_VALUES,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyInsertRemoveCSS(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*", "scripting"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
        values: ABOUTBLANK_VALUES,
      }
    );
    await verifyInsertRemoveCSS(
      await extension({
        manifest_version: 3,
        permissions: ["scripting"],
        host_permissions: ["*://*/*"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
        values: ABOUTBLANK_VALUES,
      }
    );
  }
});

/** Tests browser.tabs.insertCSS fails without the host permission. */
add_task(async function testInsertRemoveCSSNoPermissions() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.test.assertRejects(
            browser.tabs.insertCSS(tab.id, {
              code: "body { background-color: darkred; }",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "insertCSS without permission should throw"
          );

          await browser.test.assertRejects(
            browser.tabs.insertCSS(tab.id, {
              file: "test.css",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "insertCSS without permission should throw"
          );

          await browser.test.assertRejects(
            browser.tabs.insertCSS(tab.id, {
              file: "test.css",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "insertCSS without permission should throw"
          );
          await window.sendMessage("ready");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.css": "body { background-color: red; }",
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyNoPermissions(
      await extension({
        manifest_version: 2,
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
        values: CONTENT_VALUES,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyNoPermissions(
      await extension({
        manifest_version: 2,
      }),
      {
        tabConfig: task,
        url: "about:blank",
        values: ABOUTBLANK_VALUES,
        matchAboutBlank: true,
      }
    );
  }
});

/** Tests browser.tabs.executeScript. */
add_task(async function testExecuteScript() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.tabs.executeScript(tab.id, {
            code: `document.body.setAttribute("foo", "bar"); browser.test.sendMessage("expected code injection"); `,
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("code executeScript()");

          await browser.tabs.executeScript(tab.id, {
            file: "test.js",
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("file executeScript()");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.js": () => {
          document.body.textContent = "Hey look, the script ran!";
          browser.test.sendMessage("expected file injection");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyExecuteScript(
      await extension({
        manifest_version: 2,
        permissions: ["*://mochi.test/*"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyExecuteScript(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
        matchAboutBlank: true,
      }
    );
  }
});

/** Tests browser.scripting.executeScript. */
add_task(async function testExecuteScriptViaScriptingAPI() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              document.body.setAttribute("foo", "bar");
              browser.test.sendMessage("expected code injection");
            },
          });
          await window.sendMessage("code executeScript()");

          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["test.js"],
          });
          await window.sendMessage("file executeScript()");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.js": () => {
          document.body.textContent = "Hey look, the script ran!";
          browser.test.sendMessage("expected file injection");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyExecuteScript(
      await extension({
        manifest_version: 2,
        permissions: ["*://mochi.test/*", "scripting"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
      }
    );
    await verifyExecuteScript(
      await extension({
        manifest_version: 3,
        permissions: ["scripting"],
        host_permissions: ["*://mochi.test/*"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyExecuteScript(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*", "scripting"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
      }
    );
    await verifyExecuteScript(
      await extension({
        manifest_version: 3,
        permissions: ["scripting"],
        host_permissions: ["*://*/*"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
      }
    );
  }
});

/** Tests browser.tabs.executeScript fails without the host permission. */
add_task(async function testExecuteScriptNoPermissions() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.test.assertRejects(
            browser.tabs.executeScript(tab.id, {
              code: `document.body.setAttribute("foo", "bar"); browser.test.sendMessage("unexpected code injection"); `,
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "executeScript without permission should throw"
          );

          await browser.test.assertRejects(
            browser.tabs.executeScript(tab.id, {
              file: "test.js",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "executeScript without permission should throw"
          );

          await browser.test.assertRejects(
            browser.tabs.executeScript(tab.id, {
              file: "test.js",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "executeScript without permission should throw"
          );
          await window.sendMessage("ready");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.js": () => {
          document.body.textContent = "Hey look, the script ran!";
          browser.test.sendMessage("unexpected file injection");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyNoPermissions(
      await extension({
        manifest_version: 2,
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
        values: CONTENT_VALUES,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyNoPermissions(
      await extension({
        manifest_version: 2,
      }),
      {
        tabConfig: task,
        url: "about:blank",
        values: ABOUTBLANK_VALUES,
        matchAboutBlank: true,
      }
    );
  }
});

/**
 * Tests the messenger alias is available after browser.tabs.executeScript().
 */
add_task(async function testExecuteScriptAlias() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.tabs.executeScript(tab.id, {
            code: `document.body.textContent = messenger.runtime.getManifest().browser_specific_settings.gecko.id; browser.test.sendMessage("expected code injection");`,
            matchAboutBlank: config.matchAboutBlank,
          });
          await window.sendMessage("code executeScript()");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        browser_specific_settings: {
          gecko: { id: "content_scripts@mochitest" },
        },
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyAliasInjection(
      await extension({
        manifest_version: 2,
        permissions: ["*://mochi.test/*"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyAliasInjection(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*", "scripting"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
        matchAboutBlank: true,
      }
    );
  }
});

/**
 * Tests messenger alias is available after browser.scripting.executeScript().
 */
add_task(async function testExecuteScriptAliasViaScriptingAPI() {
  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const id =
                // eslint-disable-next-line no-undef
                messenger.runtime.getManifest().browser_specific_settings.gecko
                  .id;
              document.body.textContent = id;
              browser.test.sendMessage("expected code injection");
            },
          });
          await window.sendMessage("code executeScript()");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        browser_specific_settings: {
          gecko: { id: "content_scripts@mochitest" },
        },
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    await verifyAliasInjection(
      await extension({
        manifest_version: 2,
        permissions: ["*://mochi.test/*", "scripting"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
      }
    );
    await verifyAliasInjection(
      await extension({
        manifest_version: 3,
        permissions: ["scripting"],
        host_permissions: ["*://mochi.test/*"],
      }),
      {
        tabConfig: task,
        url: CONTENT_PAGE,
      }
    );
  }

  for (const task of ABOUTBLANK_TASKS) {
    await verifyAliasInjection(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*", "scripting"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
      }
    );
    await verifyAliasInjection(
      await extension({
        manifest_version: 3,
        permissions: ["scripting"],
        host_permissions: ["*://*/*"], // about:blank requires broad host permissions
      }),
      {
        tabConfig: task,
        url: "about:blank",
      }
    );
  }
});

/**
 * Tests browser.tabs.executeScript fails as expected after Bug 2011234 when
 * injecting into an extension page (moz-extension://*).
 */
add_task(async function testExecuteScriptFailInMozExtension() {
  // Make sure the restriction is enabled while running this test,
  // TODO(Bug 2015559): Remove this once pref flip along with letting the
  // restriction to be riding the release train (presumably v153).
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.webextensions.allow_executeScript_in_moz_extension", false],
    ],
  });

  const extension = async (manifest = {}) =>
    ExtensionTestUtils.loadExtension({
      files: {
        "helper.js": getBackgoundHelperFunctions(),
        "background.js": async () => {
          const [config] = await window.sendMessage("get test config");
          const tab = await window.getTestTab(config);
          await window.sendMessage("load tab", tab.id);

          await browser.test.assertRejects(
            browser.tabs.executeScript(tab.id, {
              code: `document.body.setAttribute("foo", "bar"); browser.test.sendMessage("unexpected code injection"); `,
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "executeScript without permission should throw"
          );

          await browser.test.assertRejects(
            browser.tabs.executeScript(tab.id, {
              file: "test.js",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "executeScript without permission should throw"
          );

          await browser.test.assertRejects(
            browser.tabs.executeScript(tab.id, {
              file: "test.js",
              matchAboutBlank: config.matchAboutBlank,
            }),
            /Missing host permission for the tab/,
            "executeScript without permission should throw"
          );
          await window.sendMessage("ready");

          if (config.tabConfig != "updateMailTabBrowser") {
            await browser.tabs.remove(tab.id);
          }
          browser.test.notifyPass("finished");
        },
        "test.js": () => {
          document.body.textContent = "Hey look, the script ran!";
          browser.test.sendMessage("expected file injection");
        },
        "content.html": `<!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8"/>
              <title>A test document</title>
            </head>
            <body>
              <p>This is text.</p>
            </body>
          </html>`,
        "utils.js": await getUtilsJS(),
      },
      manifest: {
        ...manifest,
        background: { scripts: ["utils.js", "helper.js", "background.js"] },
      },
    });

  for (const task of CONTENT_TASKS) {
    // moz-extension urls are not loaded by Thunderbird itself, so we only test
    // tabs created by WebExtensions.
    if (task == "openContentTab") {
      continue;
    }

    await verifyNoPermissions(
      await extension({
        manifest_version: 2,
        permissions: ["*://*/*"], // be broad to make sure this is not causing the failure
      }),
      {
        tabConfig: task,
        url: "content.html",
        values: {
          backgroundColor: "rgba(0, 0, 0, 0)",
          color: "rgb(0, 0, 0)",
          foo: null,
          textContent:
            "\n              This is text.\n            \n          ",
        },
      }
    );
  }
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
            {
              code: `document.body.setAttribute("foo", "bar"); browser.test.sendMessage("expected code injection");`,
            },
            { file: "test.js" },
          ],
          matches: ["*://mochi.test/*"],
        });
        await window.sendMessage("registered");

        await registeredScript.unregister();
        await window.sendMessage("unregistered");

        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
        browser.test.sendMessage("expected file injection");
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

  await extension.awaitMessage("registered");
  // Registering a script will not inject it into already open tabs, wait a moment
  // to make sure we still get the unchanged values.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));
  await checkContent(tab1.browser, CONTENT_VALUES);

  // Tab 2: loads after the script is registered.
  const tab2 = window.openContentTab(CONTENT_PAGE + "?tab2");
  await awaitBrowserLoaded(tab2.browser, CONTENT_PAGE + "?tab2");
  await extension.awaitMessage("expected code injection");
  await extension.awaitMessage("expected file injection");
  await checkContent(tab2.browser, {
    backgroundColor: "rgb(0, 128, 0)",
    color: "rgb(255, 255, 255)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  extension.sendMessage();
  await extension.awaitMessage("unregistered");

  await checkContent(tab2.browser, {
    backgroundColor: "rgb(0, 128, 0)",
    color: "rgb(255, 255, 255)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  // Tab 3: loads after the script is unregistered.
  const tab3 = window.openContentTab(CONTENT_PAGE + "?tab3");
  await awaitBrowserLoaded(tab3.browser, CONTENT_PAGE + "?tab3");
  await checkContent(tab3.browser, CONTENT_VALUES);

  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  // Tab 2 should have the CSS removed.
  await checkContent(tab2.browser, {
    backgroundColor: CONTENT_VALUES.backgroundColor,
    color: CONTENT_VALUES.color,
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
        browser.test.sendMessage("expected file injection");
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
  await checkContent(tab1.browser, CONTENT_VALUES);

  await extension.startup();

  // The extension started and the content script defined in the manifest should
  // be injected into the already open tab.
  await extension.awaitMessage("expected file injection");
  await checkContent(tab1.browser, {
    backgroundColor: "rgb(0, 255, 0)",
    textContent: "Hey look, the script ran!",
  });

  // Tab 2: loads after the script is registered.
  const tab2 = window.openContentTab(CONTENT_PAGE + "?tab2");
  await awaitBrowserLoaded(tab2.browser, CONTENT_PAGE + "?tab2");
  await extension.awaitMessage("expected file injection");
  await checkContent(tab2.browser, {
    backgroundColor: "rgb(0, 255, 0)",
    textContent: "Hey look, the script ran!",
  });

  await extension.unload();

  // Tab 2 should have the CSS removed.
  await checkContent(tab2.browser, {
    backgroundColor: CONTENT_VALUES.backgroundColor,
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
        browser.test.sendMessage("unexpected file injection");
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
  await checkContent(tab.browser, CONTENT_VALUES);

  await extension.unload();

  document.getElementById("tabmail").closeTab(tab);
});
