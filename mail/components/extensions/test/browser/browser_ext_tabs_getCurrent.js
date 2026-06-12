/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function testGetCurrent() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Helper to wait for the next runtime message (sent by page.js
        // from whichever extension page is loaded in a tab).
        function waitForResult() {
          return new Promise(resolve => {
            browser.runtime.onMessage.addListener(function listener(msg) {
              browser.runtime.onMessage.removeListener(listener);
              resolve(msg);
            });
          });
        }

        // Open a first extension page in a content tab and wait for its
        // getCurrent() result.
        const tab1 = await browser.tabs.create({ url: "page1.html" });
        const tab1Result = await waitForResult();
        await browser.tabs.remove(tab1.id);

        // Open a second page to verify getCurrent() returns a different tab.
        const tab2 = await browser.tabs.create({ url: "page2.html" });
        const tab2Result = await waitForResult();
        await browser.tabs.remove(tab2.id);

        // Each result should match its own tab.
        browser.test.assertEq(
          tab1.id,
          tab1Result.id,
          "getCurrent() from tab1 returns tab1's id"
        );
        browser.test.assertEq(
          "content",
          tab1Result.type,
          "getCurrent() from tab1 returns type content"
        );
        browser.test.assertTrue(
          tab1Result.active,
          "getCurrent() from tab1 reports tab as active"
        );

        browser.test.assertEq(
          tab2.id,
          tab2Result.id,
          "getCurrent() from tab2 returns tab2's id"
        );
        browser.test.assertTrue(
          tab1.id !== tab2.id,
          "tab1 and tab2 have different ids"
        );

        browser.test.notifyPass();
      },
      "page1.html": `<!DOCTYPE html><html><body>
        <script src="page.js"></script>
      </body></html>`,
      "page2.html": `<!DOCTYPE html><html><body>
        <script src="page.js"></script>
      </body></html>`,
      "page.js": () => {
        browser.tabs.getCurrent().then(current => {
          browser.runtime.sendMessage(current);
        });
      },
    },
    manifest: {
      background: { scripts: ["background.js"] },
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
