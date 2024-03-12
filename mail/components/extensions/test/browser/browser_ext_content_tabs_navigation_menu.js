/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. *
 */

// Load subscript shared with all menu tests.
Services.scriptloader.loadSubScript(
  new URL("head_menus.js", gTestPath).href,
  this
);

const getCommonFiles = async () => {
  return {
    "utils.js": await getUtilsJS(),
    "example.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>EXAMPLE</title>
          <meta charset="utf-8">
        </head>
        <body>
        <p id="description">This is text.</p>
        </body>
      </html>`,
    "test.html": `<!DOCTYPE html>
      <html>
        <head>
          <title>TEST</title>
          <meta charset="utf-8">
        </head>
        <body>
          <p id="description">This is text.</p>
          <ul>
            <li><a id="link" href="example.html">link to example page</a>
          </ul>
        </body>
      </html>`,
  };
};

const subtest_clickOpenInBrowserContextMenu = async (extension, getBrowser) => {
  function waitForLoad(browser, expectedUrl) {
    return awaitBrowserLoaded(browser, url => url.endsWith(expectedUrl));
  }

  async function testMenuNavItems(description, browser, expected) {
    const menuId = browser.getAttribute("context");
    const menu = browser.ownerGlobal.top.document.getElementById(menuId);
    await rightClickOnContent(menu, "#description", browser);
    for (const [key, value] of Object.entries(expected)) {
      Assert.ok(
        menu.querySelector(key),
        `[${description}] ${key} menu item should exist`
      );
      switch (value) {
        case "disabled":
        case "enabled":
          Assert.ok(
            menu.querySelector(key).hasAttribute("disabled") ==
              (value == "disabled"),
            `[${description}] ${key} menu item should have the correct disabled state`
          );
          break;
        case "hidden":
        case "shown":
          Assert.ok(
            menu.querySelector(key).hidden == (value == "hidden"),
            `[${description}] ${key} menu item should have the correct hidden state`
          );
          break;
      }
    }
    // Wait a moment to make the test not fail.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => window.setTimeout(r, 125));
    menu.hidePopup();
  }

  async function clickLink(browser) {
    await synthesizeMouseAtCenterAndRetry("#link", {}, browser);
  }

  await extension.startup();

  await extension.awaitMessage("contextClick");
  const browser = getBrowser();

  // Wait till test.html is fully loaded and check the state of the nav items.
  await waitForLoad(browser, "test.html");
  await testMenuNavItems("after initial load", browser, {
    "#browserContext-back": browser.webNavigation.canGoBack
      ? "enabled"
      : "disabled",
    "#browserContext-forward": "disabled",
    "#browserContext-reload": "shown",
    "#browserContext-stop": "hidden",
  });

  // Click on a link to load example.html and wait till page load has started.
  // The navigation items should have the stop item shown.
  let startLoadPromise = BrowserTestUtils.browserStarted(browser);
  await clickLink(browser);
  await startLoadPromise;
  await testMenuNavItems("before link load", browser, {
    "#browserContext-back": browser.webNavigation.canGoBack
      ? "enabled"
      : "disabled",
    "#browserContext-forward": "disabled",
    "#browserContext-reload": "hidden",
    "#browserContext-stop": "shown",
  });

  // Wait till example.html is fully loaded and check the state of the nav
  // items.
  await waitForLoad(browser, "example.html");
  await testMenuNavItems("after link load", browser, {
    "#browserContext-back": "enabled",
    "#browserContext-forward": "disabled",
    "#browserContext-reload": "shown",
    "#browserContext-stop": "hidden",
  });

  // Navigate back and wait till the load of test.html has started. The
  // navigation items should have the stop item shown.
  startLoadPromise = BrowserTestUtils.browserStarted(browser);
  browser.webNavigation.goBack();
  await startLoadPromise;
  await testMenuNavItems("before navigate back load", browser, {
    "#browserContext-back": "enabled",
    "#browserContext-forward": "disabled",
    "#browserContext-reload": "hidden",
    "#browserContext-stop": "shown",
  });

  // Wait till test.html is fully loaded and check the state of the nav items.
  await waitForLoad(browser, "test.html");
  await testMenuNavItems("after navigate back load", browser, {
    "#browserContext-back": browser.webNavigation.canGoBack
      ? "enabled"
      : "disabled",
    "#browserContext-forward": "enabled",
    "#browserContext-reload": "shown",
    "#browserContext-stop": "hidden",
  });

  await extension.sendMessage();
  await extension.awaitFinish();
  await extension.unload();
};

add_setup(() => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(subFolders.test0.URI);
});

add_task(async function test_tabs() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const url = "test.html";
        const testTab = await browser.tabs.create({ url });
        await window.sendMessage("contextClick");
        await browser.tabs.remove(testTab.id);

        browser.test.notifyPass();
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: ["utils.js", "background.js"],
      },
      permissions: ["tabs"],
    },
  });

  await subtest_clickOpenInBrowserContextMenu(
    extension,
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_windows() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const url = "test.html";
        const testWindow = await browser.windows.create({ type: "popup", url });
        await window.sendMessage("contextClick");
        await browser.windows.remove(testWindow.id);

        browser.test.notifyPass();
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: ["utils.js", "background.js"],
      },
      permissions: ["tabs"],
    },
  });

  await subtest_clickOpenInBrowserContextMenu(
    extension,
    () => Services.wm.getMostRecentWindow("mail:extensionPopup").browser
  );
});

add_task(async function test_mail3pane() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const url = "test.html";
        const mailTabs = await browser.tabs.query({ type: "mail" });
        browser.test.assertEq(
          1,
          mailTabs.length,
          "Should find a single mailTab"
        );
        await browser.tabs.update(mailTabs[0].id, { url });
        await window.sendMessage("contextClick");

        browser.test.notifyPass();
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: ["utils.js", "background.js"],
      },
      permissions: ["tabs"],
    },
  });

  await subtest_clickOpenInBrowserContextMenu(
    extension,
    () => document.getElementById("tabmail").currentAbout3Pane.webBrowser
  );
});
