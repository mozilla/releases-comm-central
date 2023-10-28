/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

ExtensionTestUtils.mockAppInfo();
AddonTestUtils.maybeInit(this);

add_task(async function test_identities_MV3_event_pages() {
  await AddonTestUtils.promiseStartupManager();

  const account1 = createAccount();
  addIdentity(account1, "id1@invalid");

  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      for (const eventName of ["onCreated", "onUpdated", "onDeleted"]) {
        browser.identities[eventName].addListener((...args) => {
          // Only send the first event after background wake-up, this should be the
          // only one expected.
          if (!hasFired) {
            hasFired = true;
            browser.test.sendMessage(`${eventName} received`, args);
          }
        });
      }

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsIdentities"],
      browser_specific_settings: { gecko: { id: "identities@xpcshell.test" } },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "identities.onCreated",
      "identities.onUpdated",
      "identities.onDeleted",
    ];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  await extension.startup();

  await extension.awaitMessage("background started");
  // Verify persistent listener, not yet primed.
  checkPersistentListeners({ primed: false });
  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Create.

  const id2 = addIdentity(account1, "id2@invalid");
  const createData = await extension.awaitMessage("onCreated received");
  Assert.deepEqual(
    [
      "id2",
      {
        accountId: "account1",
        id: "id2",
        label: "",
        name: "",
        email: "id2@invalid",
        replyTo: "",
        organization: "",
        composeHtml: true,
        signature: "",
        signatureIsPlainText: true,
      },
    ],
    createData,
    "The primed onCreated event should return the correct values"
  );

  await extension.awaitMessage("background started");
  // Verify persistent listener, not yet primed.
  checkPersistentListeners({ primed: false });
  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Update

  id2.fullName = "Updated Name";
  const updateData = await extension.awaitMessage("onUpdated received");
  Assert.deepEqual(
    ["id2", { name: "Updated Name", accountId: "account1", id: "id2" }],
    updateData,
    "The primed onUpdated event should return the correct values"
  );
  await extension.awaitMessage("background started");
  // Verify persistent listener, not yet primed.
  checkPersistentListeners({ primed: false });
  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Delete

  account1.removeIdentity(id2);
  const deleteData = await extension.awaitMessage("onDeleted received");
  Assert.deepEqual(
    ["id2"],
    deleteData,
    "The primed onDeleted event should return the correct values"
  );
  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listener should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();

  cleanUpAccount(account1);
  await AddonTestUtils.promiseShutdownManager();
});
