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

add_task(async function test_accounts_MV3_event_pages() {
  await AddonTestUtils.promiseStartupManager();

  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, the eventCounter is reset and
      // allows to observe the order of events fired. In case of a wake-up, the
      // first observed event is the one that woke up the background.
      let eventCounter = 0;

      for (const eventName of ["onCreated", "onUpdated", "onDeleted"]) {
        browser.accounts[eventName].addListener(async (...args) => {
          browser.test.sendMessage(`${eventName} event received`, {
            eventCount: ++eventCounter,
            args,
          });
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
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "accounts.onCreated",
      "accounts.onUpdated",
      "accounts.onDeleted",
    ];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  const testData = [
    {
      type: "imap",
      identity: "user@invalidImap",
      expectedUpdate: true,
      expectedName: accountKey => `Mail for ${accountKey}user@localhost`,
      expectedType: "imap",
      updatedName: "Test1",
    },
    {
      type: "pop3",
      identity: "user@invalidPop",
      expectedUpdate: false,
      expectedName: accountKey => `${accountKey}user on localhost`,
      expectedType: "pop3",
      updatedName: "Test2",
    },
    {
      type: "none",
      identity: "user@invalidLocal",
      expectedUpdate: false,
      expectedName: accountKey => `${accountKey}user on localhost`,
      expectedType: "none",
      updatedName: "Test3",
    },
    {
      type: "local",
      identity: "user@invalidLocal",
      expectedUpdate: false,
      expectedName: accountKey => "Local Folders",
      expectedType: "none",
      updatedName: "Test4",
    },
  ];

  await extension.startup();
  await extension.awaitMessage("background started");

  // Verify persistent listener, not yet primed.
  checkPersistentListeners({ primed: false });

  // Create.

  for (const details of testData) {
    await extension.terminateBackground({ disableResetIdleForTest: true });
    // Verify the primed persistent listeners.
    checkPersistentListeners({ primed: true });

    const account = createAccount(details.type);
    details.account = account;

    {
      const rv = await extension.awaitMessage("onCreated event received");
      Assert.deepEqual(
        {
          eventCount: 1,
          args: [
            details.account.key,
            {
              id: details.account.key,
              name: details.expectedName(account.key),
              type: details.expectedType,
              folders: null,
              identities: [],
            },
          ],
        },
        rv,
        `The primed onCreated event should return the correct values for account type ${details.type}`
      );
    }

    if (details.expectedUpdate) {
      const rv = await extension.awaitMessage("onUpdated event received");
      Assert.deepEqual(
        {
          eventCount: 2,
          args: [
            details.account.key,
            { id: details.account.key, name: "Mail for user@localhost" },
          ],
        },
        rv,
        "The non-primed onUpdated event should return the correct values"
      );
    }

    // The background should have been restarted.
    await extension.awaitMessage("background started");
    // The listener should no longer be primed.
    checkPersistentListeners({ primed: false });
  }

  // Update.

  for (const details of testData) {
    await extension.terminateBackground({ disableResetIdleForTest: true });
    // Verify the primed persistent listeners.
    checkPersistentListeners({ primed: true });

    const account = MailServices.accounts.getAccount(details.account.key);
    account.incomingServer.prettyName = details.updatedName;
    const rv = await extension.awaitMessage("onUpdated event received");

    Assert.deepEqual(
      {
        eventCount: 1,
        args: [
          details.account.key,
          {
            id: details.account.key,
            name: details.updatedName,
          },
        ],
      },
      rv,
      "The primed onUpdated event should return the correct values"
    );

    // The background should have been restarted.
    await extension.awaitMessage("background started");
    // The listener should no longer be primed.
    checkPersistentListeners({ primed: false });
  }

  // Delete.

  for (const details of testData) {
    await extension.terminateBackground({ disableResetIdleForTest: true });
    // Verify the primed persistent listeners.
    checkPersistentListeners({ primed: true });

    cleanUpAccount(details.account);
    const rv = await extension.awaitMessage("onDeleted event received");

    Assert.deepEqual(
      {
        eventCount: 1,
        args: [details.account.key],
      },
      rv,
      "The primed onDeleted event should return the correct values"
    );

    // The background should have been restarted.
    await extension.awaitMessage("background started");
    // The listener should no longer be primed.
    checkPersistentListeners({ primed: false });
  }

  await extension.unload();

  await AddonTestUtils.promiseShutdownManager();
});
