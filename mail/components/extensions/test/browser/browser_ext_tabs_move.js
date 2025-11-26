/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const testFolder = await createSubfolder(rootFolder, "testFolder");
  await createMessages(testFolder, 5);
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
        const [primaryTab0] = await browser.tabs.query({});
        const primaryTab1 = await createTab(
          browser.runtime.getURL("test1.html")
        );
        const primaryTab2 = await createTab(
          browser.runtime.getURL("test2.html")
        );
        const primaryTab3 = await createTab(
          browser.runtime.getURL("test3.html")
        );
        const primaryTab4 = await createTab(
          browser.runtime.getURL("test4.html")
        );

        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab1.id, index: 1 },
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab4.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs should be as expected before moving them.`
        );

        // Move tab2 and tab1 to the end of the current window.
        await browser.tabs.move([primaryTab2.id, primaryTab1.id], {
          index: -1,
        });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab3.id, index: 1 },
            { id: primaryTab4.id, index: 2 },
            { id: primaryTab2.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #1`
        );

        // Move a single tab to a specific location in current window.
        await browser.tabs.move(primaryTab3.id, { index: 3 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab4.id, index: 1 },
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #2`
        );

        // Move a single tab to its next location in current window.
        await browser.tabs.move(primaryTab4.id, { index: 2 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab2.id, index: 1 },
            { id: primaryTab4.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #3`
        );
        await browser.tabs.move(primaryTab4.id, { index: 3 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab2.id, index: 1 },
            { id: primaryTab3.id, index: 2 },
            { id: primaryTab4.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #4`
        );
        await browser.tabs.move(primaryTab4.id, { index: 4 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab2.id, index: 1 },
            { id: primaryTab3.id, index: 2 },
            { id: primaryTab1.id, index: 3 },
            { id: primaryTab4.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #5`
        );

        // Move a single tab to its previous location in current window.
        await browser.tabs.move(primaryTab4.id, { index: 3 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab2.id, index: 1 },
            { id: primaryTab3.id, index: 2 },
            { id: primaryTab4.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #6`
        );
        await browser.tabs.move(primaryTab4.id, { index: 2 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab2.id, index: 1 },
            { id: primaryTab4.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #7`
        );
        await browser.tabs.move(primaryTab4.id, { index: 1 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab4.id, index: 1 },
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #8`
        );

        // NOTE: Moving before the first tab is not allowed, the tab is moved
        // behind it instead.
        await browser.tabs.move(primaryTab4.id, { index: 0 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab4.id, index: 1 }, // <- !!
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab1.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #9`
        );

        // Back to normal via alignment on the right edge. The move logic will try
        // to place the rightmost tab at the requested index. Since the order must
        // be honoured, all other tabs will be placed to the left.
        await browser.tabs.move(
          [primaryTab1.id, primaryTab2.id, primaryTab3.id, primaryTab4.id],
          { index: 4 }
        );
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab1.id, index: 1 },
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab4.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #10`
        );

        // Move a left tab and a right tab somewhere in the middle, the rightmost
        // tab of the moved group should be at the requested index.
        await browser.tabs.move([primaryTab4.id, primaryTab1.id], { index: 3 });
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab2.id, index: 1 },
            { id: primaryTab4.id, index: 2 },
            { id: primaryTab1.id, index: 3 },
            { id: primaryTab3.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #11`
        );

        // Back to normal via alignment on the left edge. The move logic will try
        // to place the rightmost tab at the requested index. Since the order must
        // be honoured, everything will be shifted to the right.
        // Note: Moving the first tab is not allowed, the command has the same
        // effect as specifying target index 1.
        await browser.tabs.move(
          [primaryTab1.id, primaryTab2.id, primaryTab3.id, primaryTab4.id],
          { index: 0 }
        );
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab1.id, index: 1 },
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab3.id, index: 3 },
            { id: primaryTab4.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #12`
        );

        // Moving the primary/main mail tab should fail.
        await browser.test.assertRejects(
          browser.tabs.move(primaryTab0.id, {
            windowId: mailWindow.id,
            index: -1,
          }),
          `The primary mail tab in a normal Thunderbird window cannot be moved`,
          "Moving the primary mail tab should fail."
        );

        // Moving tabs to a popup should fail.
        const popupWindow = await createWindow({
          url: browser.runtime.getURL("test1.html"),
          type: "popup",
        });
        await browser.test.assertRejects(
          browser.tabs.move([primaryTab3.id, primaryTab4.id], {
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

        // Move tab between windows, placing it at -1.
        const secondMailWindow = await createWindow({ type: "normal" });
        const [secondaryTab0] = await browser.tabs.query({
          windowId: secondMailWindow.id,
        });
        const [movedTab3] = await browser.tabs.move(primaryTab3.id, {
          windowId: secondMailWindow.id,
          index: -1,
        });
        window.assertDeepEqual(
          [
            { id: secondaryTab0.id, index: 0 },
            { id: movedTab3.id, index: 1 },
          ],
          await browser.tabs.query({ windowId: secondMailWindow.id }),
          `Tabs in the secondary window should be as expected after move #13`
        );
        // FIXME: Firefox does not assign new IDs!
        // browser.test.assertEq(
        //  movedTab3.id,
        //  primaryTab3.id,
        //  "The moved tab #3 should keep its id"
        //);
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab1.id, index: 1 },
            { id: primaryTab2.id, index: 2 },
            { id: primaryTab4.id, index: 3 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #13`
        );

        // Move tab between windows, placing it at the end, overshooting.
        const [movedTab2] = await browser.tabs.move(primaryTab2.id, {
          windowId: secondMailWindow.id,
          index: 3,
        });
        window.assertDeepEqual(
          [
            { id: secondaryTab0.id, index: 0 },
            { id: movedTab3.id, index: 1 },
            { id: movedTab2.id, index: 2 },
          ],
          await browser.tabs.query({ windowId: secondMailWindow.id }),
          `Tabs in the secondary window should be as expected after move #14`
        );
        // FIXME: Firefox does not assign new IDs!
        // browser.test.assertEq(
        //   movedTab2.id,
        //   primaryTab2.id,
        //   "The moved tab #2 should keep its id"
        // );
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab1.id, index: 1 },
            { id: primaryTab4.id, index: 2 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #14`
        );

        // Move tab between windows, placing it in the middle.
        const [movedTab1] = await browser.tabs.move(primaryTab1.id, {
          windowId: secondMailWindow.id,
          index: 1,
        });
        window.assertDeepEqual(
          [
            { id: secondaryTab0.id, index: 0 },
            { id: movedTab1.id, index: 1 },
            { id: movedTab3.id, index: 2 },
            { id: movedTab2.id, index: 3 },
          ],
          await browser.tabs.query({ windowId: secondMailWindow.id }),
          `Tabs in the secondary window should be as expected after move #15`
        );
        // FIXME: Firefox does not assign new IDs!
        // browser.test.assertEq(
        //   movedTab1.id,
        //   primaryTab1.id,
        //   "The moved tab #1 should keep its id"
        // );
        window.assertDeepEqual(
          [
            { id: primaryTab0.id, index: 0 },
            { id: primaryTab4.id, index: 1 },
          ],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #15`
        );

        // Move tab between windows, placing it at the beginning (which is not
        // allowed, is moved after the first locked tab instead).
        const [movedTab4] = await browser.tabs.move(primaryTab4.id, {
          windowId: secondMailWindow.id,
          index: 0,
        });
        window.assertDeepEqual(
          [
            { id: secondaryTab0.id, index: 0 },
            { id: movedTab4.id, index: 1 },
            { id: movedTab1.id, index: 2 },
            { id: movedTab3.id, index: 3 },
            { id: movedTab2.id, index: 4 },
          ],
          await browser.tabs.query({ windowId: secondMailWindow.id }),
          `Tabs in the secondary window should be as expected after move #16`
        );
        // FIXME: Firefox does not assign new IDs!
        // browser.test.assertEq(
        //   movedTab4.id,
        //   primaryTab4.id,
        //   "The moved tab #4 should keep its id"
        // );
        window.assertDeepEqual(
          [{ id: primaryTab0.id, index: 0 }],
          await browser.tabs.query({ windowId: mailWindow.id }),
          `Tabs in the primary window should be as expected after move #16`
        );

        await browser.tabs.remove(primaryTab1.id);
        await browser.tabs.remove(primaryTab2.id);
        await browser.tabs.remove(primaryTab4.id);
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
