/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const getCommonFiles = async () => {
  return {
    "utils.js": await getUtilsJS(),
    "common.js": () => {
      window.CreateTabPromise = class {
        constructor() {
          this.promise = new Promise(resolve => {
            let createListener = tab => {
              browser.tabs.onCreated.removeListener(createListener);
              resolve(tab);
            };
            browser.tabs.onCreated.addListener(createListener);
          });
        }
        async done() {
          return this.promise;
        }
      };

      window.UpdateTabPromise = class {
        constructor(options) {
          this.logWindowId = options?.logWindowId;
          this.promise = new Promise(resolve => {
            let updateLog = new Map();
            let updateListener = (tabId, changes, tab) => {
              let id = this.logWindowId ? tab.windowId : tabId;

              if (changes?.url != "about:blank") {
                let log = updateLog.get(id) || {};

                if (changes.url) {
                  log.url = changes.url;
                }
                // The complete is only valid, if we have seen a url (which was
                // not "about:blank")
                if (log.url && changes?.status == "complete") {
                  log.complete = true;
                }

                updateLog.set(id, log);
                if (log.url && log.complete) {
                  browser.tabs.onUpdated.removeListener(updateListener);
                  resolve(updateLog);
                }
              }
            };
            browser.tabs.onUpdated.addListener(updateListener);
          });
        }
        async verify(id, url) {
          // The updatePromise resolves after we have seen the "complete" state
          // and a url.
          let updateLog = await this.promise;
          browser.test.assertEq(
            1,
            updateLog.size,
            `Should have seen exactly one tab being updated - ${JSON.stringify(
              Array.from(updateLog)
            )}`
          );
          browser.test.assertTrue(
            updateLog.has(id),
            `Updates must belong to the current tab ${id}`
          );
          browser.test.assertEq(
            url,
            updateLog.get(id).url,
            "Should have seen the correct url loaded."
          );
        }
      };
    },
    "background.js": async () => {
      // Open a local extension page and click a handler link. They are all
      // expected to open in a new tab.
      let testSelectors = ["#link1", "#link2", "#link3", "#link4"];
      for (let linkSelector of testSelectors) {
        await window.expectLinkOpenInNewTab(
          browser.runtime.getURL("test.html"),
          linkSelector,
          browser.runtime.getURL("handler.html#ext%2Btest%3Apayload")
        );
      }
      browser.test.notifyPass();
    },
    "handler.html": `<!DOCTYPE HTML>
      <html>
      <head>
        <title>EXAMPLE</title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
      </head>
      <body>
        <p>This is an example page</p>
      </body>
      </html>`,
    "test.html": `<!DOCTYPE HTML>
      <html>
      <head>
        <title>TEST</title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
      </head>
      <body>
        <ul>
          <li><a id="link1" href="ext+test:payload">extension handler without target</a>
          <li><a id="link2" href="ext+test:payload" target = "_self">extension handler with _self target</a>
          <li><a id="link3" href="ext+test:payload" target = "_blank">extension handler with _blank target</a>
          <li><a id="link4" href="ext+test:payload" target = "_other">extension handler with _other target</a>
        </ul>
      </body>
      </html>`,
  };
};

const subtest_clickInBrowser = async (extension, getBrowser) => {
  async function clickLink(linkSelector, browser) {
    await awaitBrowserLoaded(browser, url => url != "about:blank");
    await synthesizeMouseAtCenterAndRetry(linkSelector, {}, browser);
  }

  await extension.startup();

  let testSelectors = ["#link1", "#link2", "#link3", "#link4"];

  for (let expectedSelector of testSelectors) {
    // Wait for click on link (new tab)
    let { linkSelector } = await extension.awaitMessage("click");
    Assert.equal(
      expectedSelector,
      linkSelector,
      `Test should click on the correct link.`
    );
    await clickLink(linkSelector, getBrowser());
    await extension.sendMessage();
  }

  await extension.awaitFinish();
  await extension.unload();
};

add_setup(async () => {
  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  let subFolders = {};
  for (let folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);

  let about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(subFolders.test0.URI);
});

add_task(async function test_tabs() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "tabFunctions.js": async () => {
        let openTestTab = async url => {
          let createdTestTab = new window.CreateTabPromise();
          let updatedTestTab = new window.UpdateTabPromise();
          let testTab = await browser.tabs.create({ url });
          await createdTestTab.done();
          await updatedTestTab.verify(testTab.id, url);
          return testTab;
        };

        window.expectLinkOpenInNewTab = async (
          testUrl,
          linkSelector,
          expectedUrl
        ) => {
          let testTab = await openTestTab(testUrl);

          // Click a link in testTab to open a new tab.
          let createdNewTab = new window.CreateTabPromise();
          let updatedNewTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkSelector });
          let createdTab = await createdNewTab.done();
          await updatedNewTab.verify(createdTab.id, expectedUrl);

          await browser.tabs.remove(createdTab.id);
          await browser.tabs.remove(testTab.id);
        };
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: ["utils.js", "common.js", "tabFunctions.js", "background.js"],
      },
      permissions: ["tabs"],
      protocol_handlers: [
        {
          protocol: "ext+test",
          name: "Protocol Handler Example",
          uriTemplate: "/handler.html#%s",
        },
      ],
    },
  });

  await subtest_clickInBrowser(
    extension,
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});

add_task(async function test_windows() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "windowFunctions.js": async () => {
        let openTestWin = async url => {
          let createdTestTab = new window.CreateTabPromise();
          let updatedTestTab = new window.UpdateTabPromise({
            logWindowId: true,
          });
          let testWindow = await browser.windows.create({ type: "popup", url });
          await createdTestTab.done();
          await updatedTestTab.verify(testWindow.id, url);
          return testWindow;
        };

        window.expectLinkOpenInNewTab = async (
          testUrl,
          linkSelector,
          expectedUrl
        ) => {
          let testWindow = await openTestWin(testUrl);

          // Click a link in testWindow to open a new tab.
          let createdNewTab = new window.CreateTabPromise();
          let updatedNewTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkSelector });
          let createdTab = await createdNewTab.done();
          await updatedNewTab.verify(createdTab.id, expectedUrl);

          await browser.tabs.remove(createdTab.id);
          await browser.windows.remove(testWindow.id);
        };
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: [
          "utils.js",
          "common.js",
          "windowFunctions.js",
          "background.js",
        ],
      },
      permissions: ["tabs"],
      protocol_handlers: [
        {
          protocol: "ext+test",
          name: "Protocol Handler Example",
          uriTemplate: "/handler.html#%s",
        },
      ],
    },
  });

  await subtest_clickInBrowser(
    extension,
    () => Services.wm.getMostRecentWindow("mail:extensionPopup").browser
  );
});

add_task(async function test_mail3pane() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "mail3paneFunctions.js": async () => {
        let updateTestTab = async url => {
          let updatedTestTab = new window.UpdateTabPromise();
          let mailTabs = await browser.tabs.query({ type: "mail" });
          browser.test.assertEq(
            1,
            mailTabs.length,
            "Should find a single mailTab"
          );
          await browser.tabs.update(mailTabs[0].id, { url });
          await updatedTestTab.verify(mailTabs[0].id, url);
          return mailTabs[0];
        };

        window.expectLinkOpenInNewTab = async (
          testUrl,
          linkSelector,
          expectedUrl
        ) => {
          await updateTestTab(testUrl);

          // Click a link in testTab to open a new tab.
          let createdNewTab = new window.CreateTabPromise();
          let updatedNewTab = new window.UpdateTabPromise();
          await window.sendMessage("click", { linkSelector });
          let createdTab = await createdNewTab.done();
          await updatedNewTab.verify(createdTab.id, expectedUrl);

          await browser.tabs.remove(createdTab.id);
        };
      },
      ...(await getCommonFiles()),
    },
    manifest: {
      background: {
        scripts: [
          "utils.js",
          "common.js",
          "mail3paneFunctions.js",
          "background.js",
        ],
      },
      permissions: ["tabs"],
      protocol_handlers: [
        {
          protocol: "ext+test",
          name: "Protocol Handler Example",
          uriTemplate: "/handler.html#%s",
        },
      ],
    },
  });

  await subtest_clickInBrowser(
    extension,
    () => document.getElementById("tabmail").currentTabInfo.browser
  );
});
