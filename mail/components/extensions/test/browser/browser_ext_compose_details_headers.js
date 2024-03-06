/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const account = createAccount();
const defaultIdentity = addIdentity(account);
const nonDefaultIdentity = addIdentity(account);
const gRootFolder = account.incomingServer.rootFolder;

gRootFolder.createSubfolder("test", null);
const gTestFolder = gRootFolder.getChildNamed("test");
createMessages(gTestFolder, 4);

add_setup(async () => {
  // Add a custom header to the composer UI.
  Services.prefs.setCharPref("mail.compose.other.header", "X-Expediteur");
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("mail.compose.other.header");
  });
});

add_task(async function testHeaders() {
  const files = {
    "background.js": async () => {
      async function checkAPI(expected) {
        const state = await browser.compose.getComposeDetails(createdTab.id);
        for (const field of [
          "to",
          "cc",
          "bcc",
          "replyTo",
          "followupTo",
          "newsgroups",
        ]) {
          if (field in expected) {
            browser.test.assertEq(
              expected[field].length,
              state[field].length,
              `${field} has the right number of values`
            );
            for (let i = 0; i < expected[field].length; i++) {
              browser.test.assertEq(expected[field][i], state[field][i]);
            }
          } else {
            browser.test.assertEq(0, state[field].length, `${field} is empty`);
          }
        }

        if (expected.from) {
          // From will always return a value, only check if explicitly requested.
          browser.test.assertEq(expected.from, state.from, "from is correct");
        }

        if (expected.subject) {
          browser.test.assertEq(
            expected.subject,
            state.subject,
            "subject is correct"
          );
        } else {
          browser.test.assertTrue(!state.subject, "subject is empty");
        }
      }

      const [account] = await browser.accounts.list();
      const [defaultIdentity, nonDefaultIdentity] = account.identities;

      const addressBook = await browser.addressBooks.create({
        name: "Baker Street",
      });
      const contacts = {
        sherlock: await browser.contacts.create(addressBook, {
          DisplayName: "Sherlock Holmes",
          PrimaryEmail: "sherlock@bakerstreet.invalid",
        }),
        john: await browser.contacts.create(addressBook, {
          DisplayName: "John Watson",
          PrimaryEmail: "john@bakerstreet.invalid",
        }),
        empty: await browser.contacts.create(addressBook, {
          DisplayName: "Jim Moriarty",
          PrimaryEmail: "",
        }),
      };
      const list = await browser.mailingLists.create(addressBook, {
        name: "Holmes and Watson",
        description: "Tenants221B",
      });
      await browser.mailingLists.addMember(list, contacts.sherlock);
      await browser.mailingLists.addMember(list, contacts.john);

      let identityChanged = null;
      browser.compose.onIdentityChanged.addListener((tab, identityId) => {
        identityChanged = identityId;
      });

      // Start a new message.

      const createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      const [createdWindow] = await createdWindowPromise;
      const [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await checkAPI({ identityId: defaultIdentity.id });
      await window.sendMessage("checkWindow", {
        identityId: defaultIdentity.id,
      });

      const tests = [
        {
          // Change the identity and check default from.
          input: { identityId: nonDefaultIdentity.id },
          expected: {
            identityId: nonDefaultIdentity.id,
            from: "mochitest@localhost",
          },
          expectIdentityChanged: nonDefaultIdentity.id,
        },
        {
          // Don't change the identity.
          input: {},
          expected: {
            identityId: nonDefaultIdentity.id,
            from: "mochitest@localhost",
          },
        },
        {
          // Change the identity back again.
          input: { identityId: defaultIdentity.id },
          expected: {
            identityId: defaultIdentity.id,
            from: "mochitest@localhost",
          },
          expectIdentityChanged: defaultIdentity.id,
        },
        {
          // Single input, string.
          input: { to: "Greg Lestrade <greg@bakerstreet.invalid>" },
          expected: { to: ["Greg Lestrade <greg@bakerstreet.invalid>"] },
        },
        {
          // Empty string. Done here so we have something to clear.
          input: { to: "" },
          expected: {},
        },
        {
          // Single input, array with string.
          input: { to: ["John Watson <john@bakerstreet.invalid>"] },
          expected: { to: ["John Watson <john@bakerstreet.invalid>"] },
        },
        {
          // Name with a comma, not quoted per RFC 822. The API returns the addr
          // quoted as per RFC 5322, the UI is not using quotes.
          input: { to: ["Holmes, Mycroft <mycroft@bakerstreet.invalid>"] },
          expected_API: {
            to: ['"Holmes, Mycroft" <mycroft@bakerstreet.invalid>'],
          },
          expected_UI: {
            to: ["Holmes, Mycroft <mycroft@bakerstreet.invalid>"],
          },
        },
        {
          // Name with a comma, quoted per RFC 822. This should work too.
          input: { to: [`"Holmes, Mycroft" <mycroft@bakerstreet.invalid>`] },
          expected_API: {
            to: ['"Holmes, Mycroft" <mycroft@bakerstreet.invalid>'],
          },
          expected_UI: {
            to: ["Holmes, Mycroft <mycroft@bakerstreet.invalid>"],
          },
        },
        {
          // Name and address with non-ASCII characters.
          input: { to: ["Jïm Morïarty <morïarty@bakerstreet.invalid>"] },
          expected: { to: ["Jïm Morïarty <morïarty@bakerstreet.invalid>"] },
        },
        {
          // Empty array. Done here so we have something to clear.
          input: { to: [] },
          expected: {},
        },
        {
          // Single input, array with contact.
          input: { to: [{ id: contacts.sherlock, type: "contact" }] },
          expected: { to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"] },
        },
        {
          // Null input. This should not clear the field.
          input: { to: null },
          expected: { to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"] },
        },
        {
          // Single input, array with mailing list.
          input: { to: [{ id: list, type: "mailingList" }] },
          expected: { to: ["Holmes and Watson <Tenants221B>"] },
        },
        {
          // Multiple inputs, string.
          input: {
            to: "Molly Hooper <molly@bakerstreet.invalid>, Mrs Hudson <mrs_hudson@bakerstreet.invalid>",
          },
          expected: {
            to: [
              "Molly Hooper <molly@bakerstreet.invalid>",
              "Mrs Hudson <mrs_hudson@bakerstreet.invalid>",
            ],
          },
        },
        {
          // Multiple inputs, array with strings.
          input: {
            to: [
              "Irene Adler <irene@bakerstreet.invalid>",
              "Mary Watson <mary@bakerstreet.invalid>",
            ],
          },
          expected: {
            to: [
              "Irene Adler <irene@bakerstreet.invalid>",
              "Mary Watson <mary@bakerstreet.invalid>",
            ],
          },
        },
        {
          // Multiple inputs, mixed.
          input: {
            to: [
              { id: contacts.sherlock, type: "contact" },
              "Mycroft Holmes <mycroft@bakerstreet.invalid>",
            ],
          },
          expected: {
            to: [
              "Sherlock Holmes <sherlock@bakerstreet.invalid>",
              "Mycroft Holmes <mycroft@bakerstreet.invalid>",
            ],
          },
        },
        {
          // A newsgroup, string.
          input: {
            to: "",
            newsgroups: "invalid.fake.newsgroup",
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup"],
          },
        },
        {
          // Multiple newsgroups, string.
          input: {
            newsgroups: "invalid.fake.newsgroup, invalid.real.newsgroup",
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
        },
        {
          // A newsgroup, array with string.
          input: {
            newsgroups: ["invalid.real.newsgroup"],
          },
          expected: {
            newsgroups: ["invalid.real.newsgroup"],
          },
        },
        {
          // Multiple newsgroup, array with string.
          input: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
        },
        {
          // Change the subject.
          input: {
            newsgroups: "",
            subject: "This is a test",
          },
          expected: {
            subject: "This is a test",
          },
        },
        {
          // Clear the subject.
          input: {
            subject: "",
          },
          expected: {},
        },
        {
          // Override from with string address
          input: { from: "Mycroft Holmes <mycroft@bakerstreet.invalid>" },
          expected: { from: "Mycroft Holmes <mycroft@bakerstreet.invalid>" },
        },
        {
          // Override from with contact id
          input: { from: { id: contacts.sherlock, type: "contact" } },
          expected: { from: "Sherlock Holmes <sherlock@bakerstreet.invalid>" },
        },
        {
          // Override from with multiple string address
          input: {
            from: "Mycroft Holmes <mycroft@bakerstreet.invalid>, Mary Watson <mary@bakerstreet.invalid>",
          },
          expected: {
            errorDescription:
              "Setting from to multiple addresses should throw.",
            errorRejected:
              "ComposeDetails.from: Exactly one address instead of 2 is required.",
          },
        },
        {
          // Override from with empty string address 1
          input: { from: "Mycroft Holmes <>" },
          expected: {
            errorDescription:
              "Setting from to a display name without address should throw (#1).",
            errorRejected: "ComposeDetails.from: Invalid address: ",
          },
        },
        {
          // Override from with empty string address 2
          input: { from: "Mycroft Holmes" },
          expected: {
            errorDescription:
              "Setting from to a display name without address should throw (#2).",
            errorRejected:
              "ComposeDetails.from: Invalid address: Mycroft Holmes",
          },
        },
        {
          // Override from with contact id with empty address
          input: { from: { id: contacts.empty, type: "contact" } },
          expected: {
            errorDescription:
              "Setting from to a contact with an empty PrimaryEmail should throw.",
            errorRejected: `ComposeDetails.from: Contact does not have a valid email address: ${contacts.empty}`,
          },
        },
        {
          // Override from with invalid contact id
          input: { from: { id: "1234", type: "contact" } },
          expected: {
            errorDescription:
              "Setting from to a contact with an invalid contact id should throw.",
            errorRejected:
              "ComposeDetails.from: contact with id=1234 could not be found.",
          },
        },
        {
          // Override from with mailinglist id
          input: { from: { id: list, type: "mailingList" } },
          expected: {
            errorDescription: "Setting from to a mailing list should throw.",
            errorRejected: "ComposeDetails.from: Mailing list not allowed.",
          },
        },
        {
          // From may not be cleared.
          input: { from: "" },
          expected: {
            errorDescription: "Setting from to an empty string should throw.",
            errorRejected:
              "ComposeDetails.from: Address must not be set to an empty string.",
          },
        },
      ];
      for (const test of tests) {
        browser.test.log(`Checking input: ${JSON.stringify(test.input)}`);
        const expected_API = test.expected || test.expected_API;
        const expected_UI = test.expected || test.expected_UI;

        if (expected_API.errorRejected) {
          await browser.test.assertRejects(
            browser.compose.setComposeDetails(createdTab.id, test.input),
            expected_API.errorRejected,
            expected_API.errorDescription
          );
          continue;
        }

        await browser.compose.setComposeDetails(createdTab.id, test.input);
        await checkAPI(expected_API);
        await window.sendMessage("checkWindow", expected_UI);

        if (test.expectIdentityChanged) {
          browser.test.assertEq(
            test.expectIdentityChanged,
            identityChanged,
            "onIdentityChanged fired"
          );
        } else {
          browser.test.assertEq(
            null,
            identityChanged,
            "onIdentityChanged not fired"
          );
        }
        identityChanged = null;
      }

      // Change the identity through the UI to check onIdentityChanged works.

      browser.test.log("Checking external identity change");
      await window.sendMessage("changeIdentity", nonDefaultIdentity.id);
      browser.test.assertEq(
        nonDefaultIdentity.id,
        identityChanged,
        "onIdentityChanged fired"
      );

      // Clean up.

      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "addressBooks", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  extension.onMessage("changeIdentity", newIdentity => {
    const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    const composeDocument = composeWindows[0].document;

    const identityList = composeDocument.getElementById("msgIdentity");
    const identityItem = identityList.querySelector(
      `[identitykey="${newIdentity}"]`
    );
    ok(identityItem);
    identityList.selectedItem = identityItem;
    composeWindows[0].LoadIdentity(false);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_onIdentityChanged_MV3_event_pages() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, the eventCounter is reset and
      // allows to observe the order of events fired. In case of a wake-up, the
      // first observed event is the one that woke up the background.
      let eventCounter = 0;

      browser.compose.onIdentityChanged.addListener(async (tab, identityId) => {
        browser.test.sendMessage("identity changed", {
          eventCount: ++eventCounter,
          identityId,
        });
      });

      browser.compose.onComposeStateChanged.addListener(async (tab, state) => {
        browser.test.sendMessage("compose state changed", {
          eventCount: ++eventCounter,
          state,
        });
      });

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "addressBooks", "compose", "messagesRead"],
      browser_specific_settings: { gecko: { id: "compose@mochi.test" } },
    },
  });

  function changeIdentity(newIdentity) {
    const composeDocument = composeWindow.document;

    const identityList = composeDocument.getElementById("msgIdentity");
    const identityItem = identityList.querySelector(
      `[identitykey="${newIdentity}"]`
    );
    ok(identityItem);
    identityList.selectedItem = identityItem;
    composeWindow.LoadIdentity(false);
  }

  function setToAddr(to) {
    composeWindow.SetComposeDetails({ to });
  }

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "compose.onIdentityChanged",
      "compose.onComposeStateChanged",
    ];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  const composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });

  // Trigger events without terminating the background first.

  changeIdentity(nonDefaultIdentity.key);
  {
    const rv = await extension.awaitMessage("identity changed");
    Assert.deepEqual(
      {
        eventCount: 1,
        identityId: nonDefaultIdentity.key,
      },
      rv,
      "The non-primed onIdentityChanged event should return the correct values"
    );
  }

  setToAddr("user@invalid.net");
  {
    const rv = await extension.awaitMessage("compose state changed");
    Assert.deepEqual(
      {
        eventCount: 2,
        state: {
          canSendNow: true,
          canSendLater: true,
        },
      },
      rv,
      "The non-primed onComposeStateChanged should return the correct values"
    );
  }

  // Terminate background and re-trigger onIdentityChanged event.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });

  changeIdentity(defaultIdentity.key);
  {
    const rv = await extension.awaitMessage("identity changed");
    Assert.deepEqual(
      {
        eventCount: 1,
        identityId: defaultIdentity.key,
      },
      rv,
      "The primed onIdentityChanged event should return the correct values"
    );
  }

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listeners should no longer be primed.
  checkPersistentListeners({ primed: false });

  // Terminate background and re-trigger onComposeStateChanged event.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });

  setToAddr("invalid");
  {
    const rv = await extension.awaitMessage("compose state changed");
    Assert.deepEqual(
      {
        eventCount: 1,
        state: {
          canSendNow: false,
          canSendLater: false,
        },
      },
      rv,
      "The primed onComposeStateChanged should return the correct values"
    );
  }

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listeners should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();
  composeWindow.close();
});

add_task(async function testCustomHeaders() {
  const files = {
    "background.js": async () => {
      async function checkCustomHeaders(tab, expectedCustomHeaders) {
        const [testHeader] = await window.sendMessage("getTestHeader");
        browser.test.assertEq(
          "CannotTouchThis",
          testHeader,
          "Should include the test header."
        );

        const details = await browser.compose.getComposeDetails(tab.id);

        browser.test.assertEq(
          expectedCustomHeaders.length,
          details.customHeaders.length,
          "Should have the correct number of custom headers"
        );
        for (let i = 0; i < expectedCustomHeaders.length; i++) {
          browser.test.assertEq(
            expectedCustomHeaders[i].name,
            details.customHeaders[i].name,
            "Should have the correct header name"
          );
          browser.test.assertEq(
            expectedCustomHeaders[i].value,
            details.customHeaders[i].value,
            "Should have the correct header value"
          );
        }
      }

      // Start a new message with custom headers.
      let customHeaders = [{ name: "X-TEST1", value: "some header" }];
      const tab = await browser.compose.beginNew(null, { customHeaders });

      // Add a header which does not start with X- and should not be touched by
      // the API.
      await window.sendMessage("addTestHeader");

      let expectedHeaders = [{ name: "X-Test1", value: "some header" }];
      await checkCustomHeaders(tab, expectedHeaders);

      // Update details without changing headers.
      await browser.compose.setComposeDetails(tab.id, {});
      await checkCustomHeaders(tab, expectedHeaders);

      // Update existing header and add a new one.
      customHeaders = [
        { name: "X-TEST1", value: "this is header #1" },
        { name: "X-TEST2", value: "this is header #2" },
        { name: "X-TEST3", value: "this is header #3" },
        { name: "X-TEST4", value: "this is header #4" },
        { name: "X-EXPEDITEUR", value: "this is expediteur" },
        { name: "MSIP_Labels", value: "this is a MSIP label" },
      ];
      await browser.compose.setComposeDetails(tab.id, { customHeaders });
      expectedHeaders = [
        { name: "X-Test1", value: "this is header #1" },
        { name: "X-Test2", value: "this is header #2" },
        { name: "X-Test3", value: "this is header #3" },
        { name: "X-Test4", value: "this is header #4" },
        { name: "X-Expediteur", value: "this is expediteur" },
        { name: "Msip_Labels", value: "this is a MSIP label" },
      ];
      await checkCustomHeaders(tab, expectedHeaders);

      // Update existing header and remove some of the others. Test support for
      // empty headers.
      customHeaders = [
        { name: "X-TEST2", value: "this is a header" },
        { name: "X-TEST3", value: "" },
        { name: "X-EXPEDITEUR", value: "this is another expediteur" },
      ];
      await browser.compose.setComposeDetails(tab.id, { customHeaders });
      expectedHeaders = [
        { name: "X-Test2", value: "this is a header" },
        { name: "X-Test3", value: "" },
        { name: "X-Expediteur", value: "this is another expediteur" },
      ];
      await checkCustomHeaders(tab, expectedHeaders);

      // Clear headers.
      customHeaders = [];
      await browser.compose.setComposeDetails(tab.id, { customHeaders });
      await checkCustomHeaders(tab, []);

      // Should throw for invalid custom headers.
      await browser.test.assertRejects(
        browser.compose.setComposeDetails(tab.id, {
          customHeaders: [
            { name: "TEST2", value: "this is an invalid custom header" },
          ],
        }),
        /Invalid custom header: TEST2/,
        "Should throw for invalid custom headers"
      );

      // Should throw for internal mozilla headers.
      await browser.test.assertRejects(
        browser.compose.setComposeDetails(tab.id, {
          customHeaders: [
            {
              name: "X-Mozilla-Status",
              value: "this is an invalid Mozilla header",
            },
          ],
        }),
        /Invalid custom header: X-Mozilla-Status/,
        "Should throw for invalid custom headers"
      );

      // Clean up.
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(tab.windowId);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "addressBooks", "compose", "messagesRead"],
    },
  });

  extension.onMessage("addTestHeader", () => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    composeWindow.gMsgCompose.compFields.setHeader(
      "ATestHeader",
      "CannotTouchThis"
    );
    extension.sendMessage();
  });

  extension.onMessage("getTestHeader", () => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const value = composeWindow.gMsgCompose.compFields.getHeader("ATestHeader");
    extension.sendMessage(value);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
