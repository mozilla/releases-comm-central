/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let account = createAccount();
let defaultIdentity = addIdentity(account);

add_task(async function testDictionaries() {
  let files = {
    "background.js": async () => {
      function verifyDictionaries(dictionaries, expected) {
        browser.test.assertEq(
          Object.values(expected).length,
          Object.values(dictionaries).length,
          "Should find the correct number of installed dictionaries"
        );
        browser.test.assertEq(
          Object.values(expected).filter(active => active).length,
          Object.values(dictionaries).filter(active => active).length,
          "Should find the correct number of active dictionaries"
        );
        for (let i = 0; i < expected.length; i++) {
          browser.test.assertEq(
            Object.keys(expected)[i],
            Object.keys(dictionaries)[i],
            "Should find the correct dictionary"
          );
        }
      }
      async function setDictionaries(newActiveDictionaries, expected) {
        let changes = new Promise(resolve => {
          let listener = (tab, dictionaries) => {
            browser.compose.onActiveDictionariesChanged.removeListener(
              listener
            );
            resolve({ tab, dictionaries });
          };
          browser.compose.onActiveDictionariesChanged.addListener(listener);
        });

        await browser.compose.setActiveDictionaries(
          createdTab.id,
          newActiveDictionaries
        );
        let eventData = await changes;
        verifyDictionaries(expected.dictionaries, eventData.dictionaries);

        browser.test.assertEq(
          expected.tab.id,
          eventData.tab.id,
          "Should find the correct tab"
        );

        let dictionaries = await browser.compose.getActiveDictionaries(
          createdTab.id
        );
        verifyDictionaries(expected.dictionaries, dictionaries);
      }

      // Start a new message.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      let [createdWindow] = await createdWindowPromise;
      let [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await browser.test.assertRejects(
        browser.compose.setActiveDictionaries(createdTab.id, ["invalid"]),
        `Dictionary not found: invalid`,
        "should reject for invalid dictionaries"
      );

      await setDictionaries([], {
        dictionaries: { "en-US": false },
        tab: createdTab,
      });
      await setDictionaries(["en-US"], {
        dictionaries: { "en-US": true },
        tab: createdTab,
      });

      // Clean up.

      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
