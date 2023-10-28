/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("testFolder", null);
  await createMessages(rootFolder.getChildNamed("testFolder"), 5);
});

add_task(async function test_tabs_move() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Works as intended only if tabs are created one after the other.
        async function createTab(url) {
          const loadPromise = new Promise(resolve => {
            let urlSeen = false;
            const listener = (tabId, changeInfo) => {
              if (changeInfo.url && changeInfo.url == url) {
                urlSeen = true;
              }
              if (changeInfo.status == "complete" && urlSeen) {
                browser.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            browser.tabs.onUpdated.addListener(listener);
          });
          const createdTab = await browser.tabs.create({ url });
          await loadPromise;
          return createdTab;
        }

        // Works as intended only if windows are created one after the other.
        async function createWindow({ url, type }) {
          const loadPromise = new Promise(resolve => {
            if (!url) {
              resolve();
            } else {
              let urlSeen = false;
              const listener = async (tabId, changeInfo) => {
                if (changeInfo.url && changeInfo.url == url) {
                  urlSeen = true;
                }
                if (changeInfo.status == "complete" && urlSeen) {
                  browser.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              };
              browser.tabs.onUpdated.addListener(listener);
            }
          });
          const createdWindow = await browser.windows.create({ type, url });
          await loadPromise;
          return createdWindow;
        }

        const mailWindow = await browser.windows.getCurrent();

        const tab1 = await createTab(browser.runtime.getURL("test1.html"));
        const tab2 = await createTab(browser.runtime.getURL("test2.html"));
        const tab3 = await createTab(browser.runtime.getURL("test3.html"));
        const tab4 = await createTab(browser.runtime.getURL("test4.html"));

        let tabs = await browser.tabs.query({ windowId: mailWindow.id });
        browser.test.assertEq(5, tabs.length, "Number of tabs is correct");
        browser.test.assertEq(
          tab1.id,
          tabs[1].id,
          "Id of tab at index 1 should be that of tab1"
        );
        browser.test.assertEq(
          tab2.id,
          tabs[2].id,
          "Id of tab at index 2 should be that of tab2"
        );
        browser.test.assertEq(
          tab3.id,
          tabs[3].id,
          "Id of tab at index 3 should be that of tab3"
        );
        browser.test.assertEq(
          tab4.id,
          tabs[4].id,
          "Id of tab at index 4 should be that of tab4"
        );
        browser.test.assertEq(1, tabs[1].index, "Index of tab1 is correct");
        browser.test.assertEq(2, tabs[2].index, "Index of tab2 is correct");
        browser.test.assertEq(3, tabs[3].index, "Index of tab3 is correct");
        browser.test.assertEq(4, tabs[4].index, "Index of tab4 is correct");

        // Move two tabs to the end of the current window.
        await browser.tabs.move([tab2.id, tab1.id], { index: -1 });

        tabs = await browser.tabs.query({ windowId: mailWindow.id });
        browser.test.assertEq(
          5,
          tabs.length,
          "Number of tabs after move #1 is correct"
        );
        browser.test.assertEq(
          tab3.id,
          tabs[1].id,
          "Id of tab at index 1 should be that of tab3 after move #1"
        );
        browser.test.assertEq(
          tab4.id,
          tabs[2].id,
          "Id of tab at index 2 should be that of tab4 after move #1"
        );
        browser.test.assertEq(
          tab2.id,
          tabs[3].id,
          "Id of tab at index 3 should be that of tab2 after move #1"
        );
        browser.test.assertEq(
          tab1.id,
          tabs[4].id,
          "Id of tab at index 4 should be that of tab1 after move #1"
        );
        browser.test.assertEq(
          1,
          tabs[1].index,
          "Index of tab3 after move #1 is correct"
        );
        browser.test.assertEq(
          2,
          tabs[2].index,
          "Index of tab4 after move #1 is correct"
        );
        browser.test.assertEq(
          3,
          tabs[3].index,
          "Index of tab2 after move #1 is correct"
        );
        browser.test.assertEq(
          4,
          tabs[4].index,
          "Index of tab1 after move #1 is correct"
        );

        // Move a single tab to a specific location in current window.
        await browser.tabs.move(tab3.id, { index: 3 });

        tabs = await browser.tabs.query({ windowId: mailWindow.id });
        browser.test.assertEq(
          5,
          tabs.length,
          "Number of tabs after move #2 is correct"
        );
        browser.test.assertEq(
          tab4.id,
          tabs[1].id,
          "Id of tab at index 1 should be that of tab4 after move #2"
        );
        browser.test.assertEq(
          tab3.id,
          tabs[2].id,
          "Id of tab at index 2 should be that of tab3 after move #2"
        );
        browser.test.assertEq(
          tab2.id,
          tabs[3].id,
          "Id of tab at index 3 should be that of tab2 after move #2"
        );
        browser.test.assertEq(
          tab1.id,
          tabs[4].id,
          "Id of tab at index 4 should be that of tab1 after move #2"
        );
        browser.test.assertEq(
          1,
          tabs[1].index,
          "Index of tab4 after move #2 is correct"
        );
        browser.test.assertEq(
          2,
          tabs[2].index,
          "Index of tab3 after move #2 is correct"
        );
        browser.test.assertEq(
          3,
          tabs[3].index,
          "Index of tab2 after move #2 is correct"
        );
        browser.test.assertEq(
          4,
          tabs[4].index,
          "Index of tab1 after move #2 is correct"
        );

        // Moving tabs to a popup should fail.
        const popupWindow = await createWindow({
          url: browser.runtime.getURL("test1.html"),
          type: "popup",
        });
        await browser.test.assertRejects(
          browser.tabs.move([tab3.id, tabs[4].id], {
            windowId: popupWindow.id,
            index: -1,
          }),
          `Window with ID ${popupWindow.id} is not a normal window`,
          "Moving tabs to a popup window should fail."
        );

        // Moving a tab from a popup should fail.
        const [popupTab] = await browser.tabs.query({
          windowId: popupWindow.id,
        });
        await browser.test.assertRejects(
          browser.tabs.move(popupTab.id, {
            windowId: mailWindow.id,
            index: -1,
          }),
          `Tab with ID ${popupTab.id} does not belong to a normal window`,
          "Moving tabs from a popup window should fail."
        );

        // Moving a tab to an invalid window should fail.
        await browser.test.assertRejects(
          browser.tabs.move(popupTab.id, { windowId: 1234, index: -1 }),
          `Invalid window ID: 1234`,
          "Moving tabs to an invalid window should fail."
        );

        // Move tab between windows.
        const secondMailWindow = await createWindow({ type: "normal" });
        const [movedTab] = await browser.tabs.move(tab3.id, {
          windowId: secondMailWindow.id,
          index: -1,
        });

        tabs = await browser.tabs.query({ windowId: mailWindow.id });
        browser.test.assertEq(
          4,
          tabs.length,
          "Number of tabs after move #3 is correct"
        );
        browser.test.assertEq(
          tab4.id,
          tabs[1].id,
          "Id of tab at index 1 should be that of tab4 after move #3"
        );
        browser.test.assertEq(
          tab2.id,
          tabs[2].id,
          "Id of tab at index 2 should be that of tab2 after move #3"
        );
        browser.test.assertEq(
          tab1.id,
          tabs[3].id,
          "Id of tab at index 3 should be that of tab1 after move #3"
        );
        browser.test.assertEq(
          1,
          tabs[1].index,
          "Index of tab4 after move #3 is correct"
        );
        browser.test.assertEq(
          2,
          tabs[2].index,
          "Index of tab2 after move #3 is correct"
        );
        browser.test.assertEq(
          3,
          tabs[3].index,
          "Index of tab1 after move #3 is correct"
        );

        tabs = await browser.tabs.query({ windowId: secondMailWindow.id });
        browser.test.assertEq(
          2,
          tabs.length,
          "Number of tabs in the second normal window after move #3 is correct"
        );
        browser.test.assertEq(
          movedTab.id,
          tabs[1].id,
          "Id of tab at index 1 of the second normal window should be that of the moved tab"
        );

        await browser.tabs.remove(tab1.id);
        await browser.tabs.remove(tab2.id);
        await browser.tabs.remove(tab4.id);
        await browser.windows.remove(popupWindow.id);
        await browser.windows.remove(secondMailWindow.id);

        browser.test.notifyPass();
      },
      "test1.html": "<html><body>I'm page #1!</body></html>",
      "test2.html": "<html><body>I'm page #2!</body></html>",
      "test3.html": "<html><body>I'm page #3!</body></html>",
      "test4.html": "<html><body>I'm page #4!</body></html>",
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
