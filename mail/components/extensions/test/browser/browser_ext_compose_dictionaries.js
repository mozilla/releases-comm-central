/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const account = createAccount();
const defaultIdentity = addIdentity(account);

add_task(async function test_dictionaries() {
  const files = {
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
        const changes = new Promise(resolve => {
          const listener = (tab, dictionaries) => {
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
        const eventData = await changes;
        verifyDictionaries(expected.dictionaries, eventData.dictionaries);

        browser.test.assertEq(
          expected.tab.id,
          eventData.tab.id,
          "Should find the correct tab"
        );

        const dictionaries = await browser.compose.getActiveDictionaries(
          createdTab.id
        );
        verifyDictionaries(expected.dictionaries, dictionaries);
      }

      // Start a new message.

      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      const [createdWindow] = await createdWindowPromise;
      const [createdTab] = await browser.tabs.query({
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

      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
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

add_task(async function test_onActiveDictionariesChanged_MV3_event_pages() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      browser.compose.onActiveDictionariesChanged.addListener(
        async (tab, dictionaries) => {
          // Only send the first event after background wake-up, this should be
          // the only one expected.
          if (!hasFired) {
            hasFired = true;
            browser.test.sendMessage(
              "onActiveDictionariesChanged received",
              dictionaries
            );
          }
        }
      );

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
      browser_specific_settings: {
        gecko: { id: "compose.dictionary@xpcshell.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = ["compose.onActiveDictionariesChanged"];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  async function setActiveDictionaries(activeDictionaries) {
    const installedDictionaries = Cc["@mozilla.org/spellchecker/engine;1"]
      .getService(Ci.mozISpellCheckingEngine)
      .getDictionaryList();

    for (const dict of activeDictionaries) {
      if (!installedDictionaries.includes(dict)) {
        throw new Error(`Dictionary not found: ${dict}`);
      }
    }

    await composeWindow.ComposeChangeLanguage(activeDictionaries);
  }

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });

  // Trigger onActiveDictionariesChanged without terminating the background first.

  setActiveDictionaries(["en-US"]);
  const newActiveDictionary1 = await extension.awaitMessage(
    "onActiveDictionariesChanged received"
  );
  Assert.equal(
    newActiveDictionary1["en-US"],
    true,
    "Returned active dictionary should be correct"
  );

  // Terminate background and re-trigger onActiveDictionariesChanged.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });

  setActiveDictionaries([]);
  const newActiveDictionary2 = await extension.awaitMessage(
    "onActiveDictionariesChanged received"
  );
  Assert.equal(
    newActiveDictionary2["en-US"],
    false,
    "Returned active dictionary should be correct"
  );

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listener should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();
  composeWindow.close();
});
