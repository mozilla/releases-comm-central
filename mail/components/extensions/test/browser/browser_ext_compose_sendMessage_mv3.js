/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);
// Import the smtp server scripts
var { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Smtpd.sys.mjs"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Auth.sys.mjs"
);

// Setup the daemon and server
function setupServerDaemon(handler) {
  if (!handler) {
    handler = function (d) {
      return new SMTP_RFC2821_handler(d);
    };
  }
  const server = new nsMailServer(handler, new SmtpDaemon());
  return server;
}

function getBasicSmtpServer(port = 1, hostname = "localhost") {
  const server = localAccountUtils.create_outgoing_server(
    "smtp",
    "user",
    "password",
    { port, hostname }
  );

  // Override the default greeting so we get something predictable
  // in the ELHO message
  Services.prefs.setCharPref("mail.smtpserver.default.hello_argument", "test");

  return server;
}

function getSmtpIdentity(senderName, smtpServer) {
  // Set up the identity.
  const identity = MailServices.accounts.createIdentity();
  identity.email = senderName;
  identity.smtpServerKey = smtpServer.key;

  return identity;
}

let gPopAccount;

add_setup(async () => {
  const server = setupServerDaemon();
  server.start();

  // Test needs a non-local default account to be able to send messages.
  gPopAccount = createAccount("pop3");
  const localAccount = createAccount("local");
  MailServices.accounts.defaultAccount = gPopAccount;

  const identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(server.port)
  );
  gPopAccount.addIdentity(identity);
  gPopAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  const rootFolder = localAccount.incomingServer.rootFolder;
  await createSubfolder(rootFolder, "Sent");
  MailServices.accounts.setSpecialFolders();

  registerCleanupFunction(() => {
    server.stop();
  });
});

// Test onAfterSend for MV3
add_task(async function test_onAfterSend_MV3_event_pages() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      browser.compose.onAfterSend.addListener(async (tab, sendInfo) => {
        // Only send the first event after background wake-up, this should be
        // the only one expected.
        if (!hasFired) {
          hasFired = true;
          browser.test.sendMessage("onAfterSend received", sendInfo);
        }
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
      permissions: ["compose"],
      browser_specific_settings: {
        gecko: { id: "compose.onAfterSend@xpcshell.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = ["compose.onAfterSend"];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });

  // Trigger onAfterSend without terminating the background first.

  const firstComposeWindow = await openComposeWindow(gPopAccount);
  await focusWindow(firstComposeWindow);
  firstComposeWindow.SetComposeDetails({ to: "first@invalid.net" });
  firstComposeWindow.SetComposeDetails({ subject: "First message" });
  firstComposeWindow.SendMessage();
  const firstSendInfo = await extension.awaitMessage("onAfterSend received");
  Assert.equal(
    "sendNow",
    firstSendInfo.mode,
    "Returned SendInfo should be correct"
  );
  Assert.deepEqual(
    firstSendInfo.details,
    {
      from: "identity@foo.invalid",
      to: ["first@invalid.net"],
      cc: [],
      bcc: [],
      type: "new",
      replyTo: [],
      followupTo: [],
      newsgroups: [],
      subject: "First message",
      isPlainText: false,
      body: '<!DOCTYPE html>\n<html><head>\n<meta http-equiv="content-type" content="text/html; charset=UTF-8"></head><body><p><br></p></body></html>',
      plainTextBody: "",
      customHeaders: [],
      priority: "normal",
      returnReceipt: false,
      deliveryStatusNotification: false,
      attachPublicPGPKey: false,
      attachVCard: false,
      isModified: true,
      deliveryFormat: "auto",
    },
    "Returned details in SendInfo should be correct"
  );

  // Terminate background and re-trigger onAfterSend.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // The listeners should be primed.
  checkPersistentListeners({ primed: true });
  const secondComposeWindow = await openComposeWindow(gPopAccount);
  await focusWindow(secondComposeWindow);
  secondComposeWindow.SetComposeDetails({ to: "second@invalid.net" });
  secondComposeWindow.SetComposeDetails({ subject: "Second message" });
  secondComposeWindow.SendMessage();
  const secondSendInfo = await extension.awaitMessage("onAfterSend received");
  Assert.equal(
    "sendNow",
    secondSendInfo.mode,
    "Returned SendInfo should be correct"
  );
  Assert.deepEqual(
    secondSendInfo.details,
    {
      from: "identity@foo.invalid",
      to: ["second@invalid.net"],
      cc: [],
      bcc: [],
      type: "new",
      replyTo: [],
      followupTo: [],
      newsgroups: [],
      subject: "Second message",
      isPlainText: false,
      body: '<!DOCTYPE html>\n<html><head>\n<meta http-equiv="content-type" content="text/html; charset=UTF-8"></head><body><p><br></p></body></html>',
      plainTextBody: "",
      customHeaders: [],
      priority: "normal",
      returnReceipt: false,
      deliveryStatusNotification: false,
      attachPublicPGPKey: false,
      attachVCard: false,
      isModified: true,
      deliveryFormat: "auto",
    },
    "Returned details in SendInfo should be correct again"
  );

  // The background should have been restarted.
  await extension.awaitMessage("background started");
  // The listener should no longer be primed.
  checkPersistentListeners({ primed: false });

  await extension.unload();
});
