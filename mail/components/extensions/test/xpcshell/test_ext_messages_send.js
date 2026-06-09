/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Smtpd.sys.mjs"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Auth.sys.mjs"
);

// Setup the daemon and server.
function setupServerDaemon(handler) {
  if (!handler) {
    handler = function (d) {
      return new SMTP_RFC2821_handler(d);
    };
  }
  var server = new nsMailServer(handler, new SmtpDaemon());
  return server;
}

function getBasicSmtpServer(port = 1, hostname = "localhost") {
  const server = localAccountUtils.create_outgoing_server(
    "smtp",
    "user",
    "password",
    { port, hostname }
  );

  // Override the default greeting so we get something predictable in the ELHO
  // message.
  Services.prefs.setCharPref("mail.smtpserver.default.hello_argument", "test");

  return server;
}

function getSmtpIdentity(senderName, smtpServer) {
  // Set up the identity.
  const identity = MailServices.accounts.createIdentity();
  identity.email = senderName;
  identity.smtpServerKey = smtpServer.key;
  identity.escapedVCard =
    "BEGIN%3AVCARD%0D%0AVERSION%3A4.0%0D%0AN%3ATest%3BUser%3B%3B%3B%0D%0AFN%3ATest%20User%0D%0AEMAIL%3BPREF%3D1%3Auser%40test.invalid%0D%0AEND%3AVCARD%0D%0A";
  return identity;
}

var gServer;
var gPopAccount;
var gLocalAccount;

// Drop accumulated messages from the local test folders. Each task that sends
// or saves messages calls this at the start to be in a sane state regardless
// of what previous tasks did, since the big test_send_save_Message asserts
// each folder starts empty.
function clearTestFolders() {
  const rootFolder = gLocalAccount.incomingServer.rootFolder;
  for (const name of ["Sent", "Drafts", "Outbox", "Templates"]) {
    // getChildNamed()s returns null when the folder does not exist.
    const folder = rootFolder.getChildNamed(name);
    if (!folder) {
      continue;
    }
    const messages = [...folder.msgDatabase.enumerateMessages()];
    if (messages.length) {
      folder.deleteMessages(messages, null, true, false, null, false);
    }
  }
}

// The optional-permission prompt is triggered by browser.permissions.request()
// for the optional-only messages.send permission. Individual tests toggle
// `acceptPrompt` to simulate user approval or rejection.
const optionalPermissionsPromptHandler = {
  acceptPrompt: true,
  observe(subject, topic) {
    if (topic == "webextension-optional-permission-prompt") {
      const { resolve } = subject.wrappedJSObject;
      resolve(this.acceptPrompt);
    }
  },
};

add_setup(async () => {
  Services.prefs.setBoolPref(
    "extensions.webextOptionalPermissionPrompts",
    true
  );
  Services.obs.addObserver(
    optionalPermissionsPromptHandler,
    "webextension-optional-permission-prompt"
  );
  registerCleanupFunction(() => {
    Services.obs.removeObserver(
      optionalPermissionsPromptHandler,
      "webextension-optional-permission-prompt"
    );
    Services.prefs.clearUserPref("extensions.webextOptionalPermissionPrompts");
  });

  gServer = setupServerDaemon();
  gServer.start();

  // Test needs a non-local default account to be able to send messages.
  gPopAccount = await createAccount("pop3");
  gLocalAccount = await createAccount("local");
  MailServices.accounts.defaultAccount = gPopAccount;

  const identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  // The API never sets the organization. It is copied from the identity by the
  // compose backend (nsMsgCompose::SendMsg), so configure one to verify that.
  identity.organization = "Test Organization";
  gPopAccount.addIdentity(identity);
  gPopAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  const rootFolder = gLocalAccount.incomingServer.rootFolder;
  await createSubfolder(rootFolder, "Sent");
  await createSubfolder(rootFolder, "Drafts");
  await createSubfolder(rootFolder, "Templates");
  MailServices.accounts.setSpecialFolders();

  identity.fccFolderURI = rootFolder.getChildNamed("Sent").URI;
  identity.draftsFolderURI = rootFolder.getChildNamed("Drafts").URI;
  identity.templatesFolderURI = rootFolder.getChildNamed("Templates").URI;

  registerCleanupFunction(() => {
    gServer.stop();
  });
});

// Verify that messages.sendMessage() is not exposed when the user denies the
// optional-only permission request. messages.save is a regular permission, so
// its runtime grant flow is not exercised here.
add_task(async function test_send_save_denied() {
  optionalPermissionsPromptHandler.acceptPrompt = false;

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      // Before the request, the gated API method must not be exposed.
      browser.test.assertEq(
        undefined,
        browser.messages.sendMessage,
        "messages.sendMessage() should not be exposed before grant"
      );

      // After the user denies the prompt, the gated API method must still not
      // be exposed.
      const granted = await new Promise(resolve => {
        browser.test.withHandlingUserInput(() => {
          resolve(
            browser.permissions.request({ permissions: ["messages.send"] })
          );
        });
      });
      browser.test.assertFalse(granted, "messages.send should be denied");
      browser.test.assertEq(
        undefined,
        browser.messages.sendMessage,
        "messages.sendMessage() should remain unexposed after denial"
      );

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["messagesRead"],
      optional_permissions: ["messages.send"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Verify the per-extension throttle enforces a minimum start-to-start gap
// between sends. SEND_SAVE_GAP_MS is 125 ms (not configurable), so 10 sends in a
// tight loop incur at least 9 gaps.
add_task(async function test_send_gap_delays() {
  gServer.resetTest();
  clearTestFolders();
  optionalPermissionsPromptHandler.acceptPrompt = true;

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      for (const perm of ["messages.send"]) {
        await new Promise(resolve => {
          browser.test.withHandlingUserInput(() => {
            resolve(browser.permissions.request({ permissions: [perm] }));
          });
        });
      }
      const details = {
        to: "to@example.invalid",
        subject: "Gap test",
        body: "Body",
      };
      const t0 = Date.now();
      for (let i = 1; i <= 10; i++) {
        const rv = await browser.messages.sendMessage(details);
        browser.test.assertEq("sendNow", rv.mode, `Send ${i} should succeed`);
      }
      const elapsed = Date.now() - t0;
      // SEND_SAVE_GAP_MS is 125 ms, so 10 tight-loop sends take at least
      // 9*125=1125 ms.
      browser.test.assertTrue(
        elapsed >= 1000,
        `10 tight-loop sends should take >= 1000ms, took ${elapsed}ms`
      );
      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["messagesRead", "accountsRead", "messagesDelete"],
      optional_permissions: ["messages.send"],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Verify messages.sendMessage() usage is recorded in the Activity Manager: first
// a live process and later a permanent entry.
// We fire messages-send-tracker-flush-for-tests to force the finalization instead
// of waiting for the idle DeferredTask (ACTIVITY_FLUSH_MS).
add_task(async function test_send_activity_logged() {
  gServer.resetTest();
  clearTestFolders();
  optionalPermissionsPromptHandler.acceptPrompt = true;

  const TEST_ADDON_NAME = "MessagesSend Activity Logger Test";
  const activityMgr = Cc["@mozilla.org/activity-manager;1"].getService(
    Ci.nsIActivityManager
  );
  const processes = [];
  const events = [];
  const listener = {
    onAddedActivity(id, activity) {
      if (
        activity.iconClass != "sendMail" ||
        !activity.displayText.includes(TEST_ADDON_NAME)
      ) {
        return;
      }
      if (activity instanceof Ci.nsIActivityProcess) {
        processes.push(activity);
      } else if (activity instanceof Ci.nsIActivityEvent) {
        events.push(activity);
      }
    },
    onRemovedActivity() {},
  };
  activityMgr.addListener(listener);
  registerCleanupFunction(() => activityMgr.removeListener(listener));

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      for (const perm of ["messages.send"]) {
        await new Promise(resolve => {
          browser.test.withHandlingUserInput(() => {
            resolve(browser.permissions.request({ permissions: [perm] }));
          });
        });
      }
      const details = {
        to: "to@example.invalid",
        subject: "Audit test",
        body: "Body",
      };
      for (let i = 0; i < 3; i++) {
        await browser.messages.sendMessage(details);
      }
      browser.test.notifyPass("finished");
    },
    manifest: {
      name: TEST_ADDON_NAME,
      permissions: ["messagesRead", "accountsRead", "messagesDelete"],
      optional_permissions: ["messages.send"],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");

  // While sending, a single live process should have been posted and updated
  // to reflect the running count. It is not finalized yet (still within the
  // idle window), so no permanent event exists.
  Assert.equal(processes.length, 1, "exactly one live process");
  Assert.equal(
    processes[0].state,
    Ci.nsIActivityProcess.STATE_INPROGRESS,
    "Live process should still be in the in-progress state"
  );
  Assert.stringContains(
    processes[0].lastStatusText,
    "3 messages",
    "Live process status should reflect 3 sends"
  );
  Assert.equal(events.length, 0, "no permanent event before finalization");

  // Force finalization via the dedicated test-only observer topic so we don't
  // have to wait for the DeferredTask (ACTIVITY_FLUSH_MS) to fire.
  Services.obs.notifyObservers(null, "messages-send-tracker-flush-for-tests");

  // Wait for the finalized activity to land.
  await TestUtils.waitForCondition(
    () => events.length > 0,
    "Activity Manager should record the finalized send batch"
  );
  Assert.equal(events.length, 1, "exactly one permanent event");
  Assert.stringContains(
    events[0].displayText,
    "multiple unattended messages",
    "Activity event display line should report a multi-message batch"
  );
  Assert.stringContains(
    events[0].statusText,
    "3 messages",
    "Activity event status line should report 3 messages"
  );

  await extension.unload();
});

// Same as test_send_activity_logged, but for a single message. Exercises the
// singular display line ("sent an unattended message") and the singular status
// line ("1 message in 1 second").
add_task(async function test_send_activity_logged_single() {
  gServer.resetTest();
  clearTestFolders();
  optionalPermissionsPromptHandler.acceptPrompt = true;

  const TEST_ADDON_NAME = "MessagesSend Single Activity Logger Test";
  const activityMgr = Cc["@mozilla.org/activity-manager;1"].getService(
    Ci.nsIActivityManager
  );
  const processes = [];
  const events = [];
  const listener = {
    onAddedActivity(id, activity) {
      if (
        activity.iconClass != "sendMail" ||
        !activity.displayText.includes(TEST_ADDON_NAME)
      ) {
        return;
      }
      if (activity instanceof Ci.nsIActivityProcess) {
        processes.push(activity);
      } else if (activity instanceof Ci.nsIActivityEvent) {
        events.push(activity);
      }
    },
    onRemovedActivity() {},
  };
  activityMgr.addListener(listener);
  registerCleanupFunction(() => activityMgr.removeListener(listener));

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      for (const perm of ["messages.send"]) {
        await new Promise(resolve => {
          browser.test.withHandlingUserInput(() => {
            resolve(browser.permissions.request({ permissions: [perm] }));
          });
        });
      }
      await browser.messages.sendMessage({
        to: "to@example.invalid",
        subject: "Audit test",
        body: "Body",
      });
      browser.test.notifyPass("finished");
    },
    manifest: {
      name: TEST_ADDON_NAME,
      permissions: ["messagesRead", "accountsRead", "messagesDelete"],
      optional_permissions: ["messages.send"],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");

  // While sending, a single live process should have been posted, reflecting a
  // single send. It is not finalized yet, so no permanent event exists.
  Assert.equal(processes.length, 1, "exactly one live process");
  Assert.equal(
    processes[0].state,
    Ci.nsIActivityProcess.STATE_INPROGRESS,
    "Live process should still be in the in-progress state"
  );
  Assert.stringContains(
    processes[0].lastStatusText,
    "1 message sent",
    "Live process status should reflect a single send"
  );
  Assert.equal(events.length, 0, "no permanent event before finalization");

  // Force finalization via the dedicated test-only observer topic so we don't
  // have to wait for the DeferredTask (ACTIVITY_FLUSH_MS) to fire.
  Services.obs.notifyObservers(null, "messages-send-tracker-flush-for-tests");

  // Wait for the finalized activity to land.
  await TestUtils.waitForCondition(
    () => events.length > 0,
    "Activity Manager should record the finalized send"
  );
  Assert.equal(events.length, 1, "exactly one permanent event");
  Assert.stringContains(
    events[0].displayText,
    "an unattended message",
    "Activity event display line should report a single-message batch"
  );
  Assert.stringContains(
    events[0].statusText,
    "1 message in 1 second",
    "Activity event status line should report 1 message in 1 second"
  );

  await extension.unload();
});

add_task(async function test_send_save_Message() {
  gServer.resetTest();
  clearTestFolders();
  optionalPermissionsPromptHandler.acceptPrompt = true;

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      // While messages.send is optional-only and must be granted at runtime,
      // messages.save is a regular permission and already granted.
      const granted = await new Promise(resolve => {
        browser.test.withHandlingUserInput(() => {
          resolve(
            browser.permissions.request({ permissions: ["messages.send"] })
          );
        });
      });
      browser.test.assertTrue(granted, "messages.send should be granted");

      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const localAccount = accounts.find(a => a.type == "none");
      const testFolders = {
        sent: localAccount.folders.find(f => f.name == "Sent"),
        draft: localAccount.folders.find(f => f.name == "Drafts"),
        outbox: localAccount.folders.find(f => f.name == "Outbox"),
        template: localAccount.folders.find(f => f.name == "Templates"),
      };

      const defaultAccount = await browser.accounts.getDefault();
      const defaultIdentity = await browser.identities.getDefault(
        defaultAccount.id
      );
      const identityMailFrom = defaultIdentity.name.length
        ? defaultIdentity.name + " <" + defaultIdentity.email + ">"
        : defaultIdentity.email;

      async function verifyMessage(messageHeader, details, expected) {
        const raw = await browser.messages.getRaw(messageHeader.id);
        // Verify message format. multipart/alternative is only produced when
        // sending in "both" format. Saved drafts and templates instead store the
        // body directly and record the format in X-Mozilla-Draft-Info, so they
        // reopen in the format the user authored.
        const isSendMode = ["sendNow", "sendLater"].includes(expected.mode);
        if (isSendMode) {
          browser.test.assertEq(
            expected.deliveryFormat.includes("both"),
            raw.includes("multipart/alternative"),
            "Message format should be correct"
          );
        } else {
          browser.test.assertFalse(
            raw.includes("multipart/alternative"),
            "A saved draft or template should not be multipart/alternative"
          );
          const deliveryFormatValues = {
            auto: 0,
            plaintext: 1,
            html: 2,
            both: 3,
          };
          const expectedFormat = deliveryFormatValues[expected.deliveryFormat];
          browser.test.assertTrue(
            raw.includes(`deliveryformat=${expectedFormat}`),
            `Saved message should record deliveryformat=${expectedFormat}`
          );
        }

        // Verify subject.
        browser.test.assertEq(
          details.subject,
          messageHeader.subject,
          "Subject should be correct"
        );

        // Verify from.
        browser.test.assertTrue(
          raw.includes(`From: ${details.from || identityMailFrom}`),
          `From should be included and be correct ${raw}`
        );

        // Verify that the organization is copied from the sending identity by
        // the backed.
        if (defaultIdentity.organization) {
          browser.test.assertTrue(
            raw.includes(`Organization: ${defaultIdentity.organization}`),
            "The identity's organization should be included"
          );
        }

        // Verify recipients.
        const RECIPIENTS = {
          to: "To",
          cc: "Cc",
          bcc: "Bcc",
          replyTo: "Reply-To",
          followupTo: "Followup-To",
        };
        for (const recipient of Object.keys(RECIPIENTS)) {
          if (!details.hasOwnProperty(recipient)) {
            continue;
          }
          browser.test.assertTrue(
            raw.includes(`${RECIPIENTS[recipient]}: ${details[recipient]}`),
            `Recipient ${RECIPIENTS[recipient]} should be included and be correct`
          );
        }

        // Verify priority.
        const PRIORITIES = {
          highest: "1 (Highest)",
          high: "2 (High)",
          low: "4 (Low)",
          lowest: "5 (Lowest)",
        };
        if (
          details.hasOwnProperty("priority") &&
          details.priority != "normal"
        ) {
          browser.test.assertTrue(
            raw.includes(`X-Priority: ${PRIORITIES[details.priority]}`),
            "There should be the correct priority header"
          );
        } else {
          browser.test.assertTrue(
            !raw.includes("X-Priority"),
            "There should not be a priority header"
          );
        }

        // Verify custom headers.
        if (details.hasOwnProperty("customHeaders")) {
          for (const header of details.customHeaders) {
            browser.test.assertTrue(
              raw.includes(`${header.name}: ${header.value}`),
              `Should include ${header.name}: ${header.value}.`
            );
          }
        }

        // Verify returnReceipt.
        if (details.returnReceipt) {
          browser.test.assertTrue(
            raw.includes("Disposition-Notification-To: identity@foo.invalid"),
            "There should be the correct Disposition-Notification-To header"
          );
        } else {
          browser.test.assertTrue(
            !raw.includes("Disposition-Notification-To:"),
            "There should be no Disposition-Notification-To header"
          );
        }

        // Verify attachments.
        const attachmentsFound = await browser.messages.listAttachments(
          messageHeader.id
        );
        if (details.hasOwnProperty("attachments") || details.attachVCard) {
          browser.test.assertEq(
            expected.attachments.length,
            attachmentsFound.length,
            "The API should have returned as many attachments as expected"
          );
          for (let i = 0; i < expected.attachments.length; i++) {
            browser.test.assertEq(
              expected.attachments[i],
              attachmentsFound[i].name,
              "The API should have returned the correct attachment"
            );
          }
        } else {
          browser.test.assertEq(
            0,
            attachmentsFound.length,
            "The API should not have have returned any attachment."
          );
        }
      }

      async function runTest({ testFunc, details, options, expected }) {
        // Check for expected initial state.
        for (const folder of Object.values(testFolders)) {
          const messageList = await browser.messages.list(folder.id);
          browser.test.assertEq(
            0,
            messageList.messages.length,
            `Number of messages in the ${folder.name} folder should be correct`
          );
        }

        // Send or Save a message.
        const rv = await browser.messages[testFunc](details, options);

        // Verify return values.
        if (expected.mode == "sendNow") {
          browser.test.assertTrue(
            rv.headerMessageId,
            `There should be a headerMessageId`
          );
          for (const messageHeader of rv.messages) {
            browser.test.assertEq(
              rv.headerMessageId,
              messageHeader.headerMessageId,
              `The message copy in ${messageHeader.folder.name} should have the correct headerMessageId`
            );
          }
        } else {
          browser.test.assertTrue(
            !rv.headerMessageId,
            `There should not be a headerMessageId`
          );
          // nsMsgCompose generates a Message-ID for every message it constructs,
          // regardless of mode, so saved copies also carry one.
          for (const messageHeader of rv.messages) {
            browser.test.assertTrue(
              messageHeader.headerMessageId,
              `The message copy in ${messageHeader.folder.name} should have a headerMessageId`
            );
          }
        }

        browser.test.assertEq(
          expected.mode,
          rv.mode,
          "The mode of the sent message should be correct"
        );

        browser.test.assertEq(
          expected.messageCopies.length,
          rv.messages.length,
          `There should be the correct number of copies of the sent message`
        );

        for (let i = 0; i < expected.messageCopies; i++) {
          browser.test.assertEq(
            testFolders[expected.messageCopies[i]].path,
            rv.messages[i].folder.path,
            "The reported message copies should be correct"
          );
        }

        for (const messageHeader of rv.messages) {
          await verifyMessage(messageHeader, details, expected);
        }

        // Verify actual messages in each test folder.
        for (const [name, folder] of Object.entries(testFolders)) {
          const messageList = await browser.messages.list(folder.id);
          browser.test.assertEq(
            expected.messageCopies.filter(e => e == name).length,
            messageList.messages.length,
            `Number of messages in the ${folder.name} folder should be correct`
          );
          // Cleanup.
          await browser.messages.delete(
            messageList.messages.map(m => m.id, true)
          );
        }
      }

      // Specify plaintext body. Should create a plaintext message.
      await runTest({
        testFunc: "sendMessage",
        details: {
          from: "SuperUser <otherIdentity@foo.invalid>",
          to: "to@example.invalid",
          body: "Test body",
          subject: "Test Message",
          priority: "normal",
          customHeaders: [
            {
              name: "X-Test-1",
              value: "test-1",
            },
            {
              name: "X-Test-2",
              value: "test-2",
            },
          ],
        },
        options: null,
        expected: {
          mode: "sendNow",
          messageCopies: ["sent"],
          deliveryFormat: "plaintext",
        },
      });

      // Specify plainTextBody which is actually html. Should be forced into a
      // plaintext message, because plaintext was specifically requested.
      await runTest({
        testFunc: "saveMessage",
        details: {
          to: "to@example.invalid",
          plainTextBody: "<p><b>Test body</b></p>",
          subject: "Test Message",
          priority: "high",
        },
        options: null,
        expected: {
          mode: "draft",
          messageCopies: ["draft"],
          deliveryFormat: "plaintext",
        },
      });

      // Specify plainTextBody which is html and request delivery format "both".
      // should still enforce a plaintext message, because plaintext was
      // specifically requested.
      await runTest({
        testFunc: "sendMessage",
        details: {
          to: "to@example.invalid",
          plainTextBody: "<p><b>Test body</b></p>",
          subject: "Test Message",
          deliveryFormat: "both",
          priority: "highest",
        },
        options: {
          mode: "sendNow",
        },
        expected: {
          mode: "sendNow",
          messageCopies: ["sent"],
          deliveryFormat: "plaintext",
        },
      });

      // Request delivery format "both" for an HTML body saved as a draft. The
      // draft stores the HTML body and records deliveryformat=3 (Both); it is
      // not converted to multipart/alternative, which only happens on send.
      await runTest({
        testFunc: "saveMessage",
        details: {
          to: "to@example.invalid",
          body: "Test body",
          subject: "Test Message",
          deliveryFormat: "both",
          priority: "low",
        },
        options: {
          mode: "draft",
        },
        expected: {
          mode: "draft",
          messageCopies: ["draft"],
          deliveryFormat: "both",
        },
      });

      // Same as above, but additionally set isPlainText true, which should
      // enforce plaintext delivery again.
      await runTest({
        testFunc: "sendMessage",
        details: {
          to: "to@example.invalid",
          body: "Test body",
          isPlainText: true,
          subject: "Test Message",
          deliveryFormat: "both",
          priority: "lowest",
        },
        options: {
          mode: "sendLater",
        },
        expected: {
          mode: "sendLater",
          messageCopies: ["outbox"],
          deliveryFormat: "plaintext",
        },
      });

      // Test additionalFccFolder. The API method adds an independent copy of
      // the outgoing message to the additional folder after sendMsg resolves.
      await runTest({
        testFunc: "sendMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          body: "Test body",
          subject: "Test Message",
          additionalFccFolder: testFolders.draft,
        },
        options: {
          mode: "default",
        },
        expected: {
          mode: "sendNow",
          messageCopies: ["sent", "draft"],
          deliveryFormat: "plaintext",
        },
      });

      // Test overrideDefaultFccFolder: Clear.
      await runTest({
        testFunc: "sendMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          body: "Test body",
          subject: "Test Message",
          overrideDefaultFccFolder: "",
        },
        options: {
          mode: "sendNow",
        },
        expected: {
          mode: "sendNow",
          messageCopies: [],
          deliveryFormat: "plaintext",
        },
      });

      // Test overrideDefaultFccFolder: Replace.
      await runTest({
        testFunc: "sendMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          body: "Test body",
          subject: "Test Message",
          overrideDefaultFccFolder: testFolders.draft,
        },
        options: {
          mode: "sendNow",
        },
        expected: {
          mode: "sendNow",
          messageCopies: ["draft"],
          deliveryFormat: "plaintext",
        },
      });

      // Test overrideDefaultFccFolder="" combined with additionalFccFolder. The
      // default fcc is suppressed and the additional fcc receives the only copy.
      await runTest({
        testFunc: "sendMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          body: "Test body",
          subject: "Test Message",
          overrideDefaultFccFolder: "",
          additionalFccFolder: testFolders.draft,
        },
        options: {
          mode: "sendNow",
        },
        expected: {
          mode: "sendNow",
          messageCopies: ["draft"],
          deliveryFormat: "plaintext",
        },
      });

      // Test recipients, returnReceipt and attachVCard.
      await runTest({
        testFunc: "sendMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          cc: "cc@example.invalid",
          bcc: "bcc@example.invalid",
          replyTo: "replyTo@example.invalid",
          followupTo: "followupTo@example.invalid",
          subject: "Subject",
          body: "<p><b>Test body</b></p>",
          priority: "normal",
          returnReceipt: true,
          attachVCard: true,
        },
        options: {
          mode: "sendNow",
        },
        expected: {
          mode: "sendNow",
          messageCopies: ["sent"],
          deliveryFormat: "both",
          attachments: ["identity.vcf"],
        },
      });

      // Test attachments.
      await runTest({
        testFunc: "saveMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          subject: "Subject",
          attachments: [{ file: new File(["I'm a text file."], "file.txt") }],
          body: "<p><b>Test body</b></p>",
        },
        options: {
          mode: "template",
        },
        expected: {
          mode: "template",
          messageCopies: ["template"],
          // No deliveryFormat was requested, so it defaults to Auto (0). As a
          // saved template the HTML body is stored as-is.
          deliveryFormat: "auto",
          attachments: ["file.txt"],
        },
      });

      // Test attachments + vCard.
      await runTest({
        testFunc: "sendMessage",
        details: {
          identityId: popAccount.identities[0].id,
          to: "to@example.invalid",
          subject: "Subject",
          attachments: [{ file: new File(["I'm a text file."], "file.txt") }],
          body: "<p><b>Test body</b></p>",
          attachVCard: true,
        },
        options: {
          mode: "sendNow",
        },
        expected: {
          mode: "sendNow",
          messageCopies: ["sent"],
          deliveryFormat: "both",
          attachments: ["file.txt", "identity.vcf"],
        },
      });

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: [
        "messagesRead",
        "accountsRead",
        "messagesDelete",
        "messages.save",
      ],
      optional_permissions: ["messages.send"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Verify the per-extension throttle also applies to save operations, not just
// sends. SEND_SAVE_GAP_MS is 125 ms (not configurable), so 10 saves in a tight loop
// incur at least 9 gaps.
add_task(async function test_save_gap_delays() {
  gServer.resetTest();
  clearTestFolders();

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const details = {
        to: "to@example.invalid",
        subject: "Save gap test",
        body: "Body",
      };
      const t0 = Date.now();
      for (let i = 1; i <= 10; i++) {
        const rv = await browser.messages.saveMessage(details);
        browser.test.assertEq("draft", rv.mode, `Save ${i} should succeed`);
      }
      const elapsed = Date.now() - t0;
      // SEND_SAVE_GAP_MS is 125 ms, so 10 tight-loop saves take at least
      // 9*125=1125 ms.
      browser.test.assertTrue(
        elapsed >= 1000,
        `10 tight-loop saves should take >= 1000ms, took ${elapsed}ms`
      );
      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: [
        "messagesRead",
        "accountsRead",
        "messagesDelete",
        "messages.save",
      ],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

// Verify plain text messages use Content-Transfer-Encoding: 7bit, not base64, as
// we do not set forceMsgEncoding.
add_task(async function test_plaintext_uses_7bit_encoding() {
  gServer.resetTest();
  clearTestFolders();

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const { messages } = await browser.messages.saveMessage(
        {
          to: "to@example.invalid",
          subject: "Encoding test",
          isPlainText: true,
          plainTextBody: "A readable ASCII body.",
        },
        { mode: "draft" }
      );
      browser.test.assertEq(1, messages.length, "One draft should be saved");

      const raw = await browser.messages.getRaw(messages[0].id);
      browser.test.assertTrue(
        raw.includes("Content-Transfer-Encoding: 7bit"),
        `Plain text body should be 7bit encoded:\n${raw}`
      );
      browser.test.assertFalse(
        raw.includes("Content-Transfer-Encoding: base64"),
        "Plain text body should not be base64 encoded"
      );
      browser.test.assertTrue(
        raw.includes("A readable ASCII body."),
        "Plain text body should be human-readable in the raw message"
      );
      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: [
        "messagesRead",
        "accountsRead",
        "messagesDelete",
        "messages.save",
      ],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Verify save operations keep their format intent: an HTML draft is stored as
 * HTML (not downgraded to plain text) so it reopens in HTML mode, and the
 * X-Mozilla-Draft-Info header records the delivery format (0 = Auto by default,
 * 1 = PlainText for a pure plain text draft).
 */
add_task(async function test_save_keeps_format_intent() {
  gServer.resetTest();
  clearTestFolders();

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      // Default (auto) HTML draft.
      const htmlSave = await browser.messages.saveMessage(
        {
          to: "to@example.invalid",
          subject: "HTML draft",
          body: "<p>Some <b>HTML</b> content.</p>",
        },
        { mode: "draft" }
      );
      browser.test.assertEq(1, htmlSave.messages.length, "One draft saved");
      let raw = await browser.messages.getRaw(htmlSave.messages[0].id);
      browser.test.assertTrue(
        /Content-Type:\s*text\/html/i.test(raw),
        `HTML draft should be stored as text/html, not downgraded:\n${raw}`
      );
      browser.test.assertTrue(
        raw.includes("<b>HTML</b>"),
        "HTML body should be preserved in the draft"
      );
      browser.test.assertTrue(
        raw.includes("deliveryformat=0"),
        `Default delivery format should be 0 (Auto):\n${raw}`
      );

      // Pure plain text draft.
      const textSave = await browser.messages.saveMessage(
        {
          to: "to@example.invalid",
          subject: "Plain draft",
          isPlainText: true,
          plainTextBody: "Just plain text.",
        },
        { mode: "draft" }
      );
      raw = await browser.messages.getRaw(textSave.messages[0].id);
      browser.test.assertTrue(
        /Content-Type:\s*text\/plain/i.test(raw),
        `Plain text draft should be stored as text/plain:\n${raw}`
      );
      browser.test.assertTrue(
        raw.includes("deliveryformat=1"),
        `Plain text delivery format should be 1 (PlainText):\n${raw}`
      );

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: [
        "messagesRead",
        "accountsRead",
        "messagesDelete",
        "messages.save",
      ],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Verify the Content-Language header: an explicit contentLanguage is written
 * verbatim, and no header is added when it is omitted.
 */
add_task(async function test_content_language() {
  gServer.resetTest();
  clearTestFolders();

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      // Explicit contentLanguage is joined into the Content-Language header.
      const explicit = await browser.messages.saveMessage(
        {
          to: "to@example.invalid",
          subject: "Explicit language",
          body: "<p>Some content.</p>",
          contentLanguage: ["de-DE", "en-US"],
        },
        { mode: "draft" }
      );
      let raw = await browser.messages.getRaw(explicit.messages[0].id);
      browser.test.assertTrue(
        raw.includes("Content-Language: de-DE, en-US"),
        `Explicit content language should be written verbatim:\n${raw}`
      );

      // Without contentLanguage, no Content-Language header is added.
      const omitted = await browser.messages.saveMessage(
        {
          to: "to@example.invalid",
          subject: "No language",
          body: "<p>Some content.</p>",
        },
        { mode: "draft" }
      );
      raw = await browser.messages.getRaw(omitted.messages[0].id);
      browser.test.assertFalse(
        raw.includes("Content-Language:"),
        `No Content-Language header should be set when omitted:\n${raw}`
      );

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: [
        "messagesRead",
        "accountsRead",
        "messagesDelete",
        "messages.save",
      ],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Verify the mail.suppress_content_language preference: when enabled, no
 * Content-Language header is set even if an explicit contentLanguage is given.
 */
add_task(async function test_content_language_suppressed() {
  gServer.resetTest();
  clearTestFolders();
  Services.prefs.setBoolPref("mail.suppress_content_language", true);
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("mail.suppress_content_language")
  );

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const { messages } = await browser.messages.saveMessage(
        {
          to: "to@example.invalid",
          subject: "Suppressed language",
          body: "<p>Some content.</p>",
          contentLanguage: ["de-DE"],
        },
        { mode: "draft" }
      );
      const raw = await browser.messages.getRaw(messages[0].id);
      browser.test.assertFalse(
        raw.includes("Content-Language:"),
        `No Content-Language header should be set when suppressed:\n${raw}`
      );
      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: [
        "messagesRead",
        "accountsRead",
        "messagesDelete",
        "messages.save",
      ],
    },
  });
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  Services.prefs.clearUserPref("mail.suppress_content_language");
});
