/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
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
  var server = new nsMailServer(handler, new SmtpDaemon());
  return server;
}

function getBasicSmtpServer(port = 1, hostname = "localhost") {
  const server = localAccountUtils.create_outgoing_server(
    port,
    "user",
    "password",
    hostname
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

var gServer;
var gOutbox;

add_setup(() => {
  gServer = setupServerDaemon();
  gServer.start();

  // Test needs a non-local default account to be able to send messages.
  const popAccount = createAccount("pop3");
  const localAccount = createAccount("local");
  MailServices.accounts.defaultAccount = popAccount;

  const identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  popAccount.addIdentity(identity);
  popAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  const rootFolder = localAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("Sent", null);
  MailServices.accounts.setSpecialFolders();
  gOutbox = rootFolder.getChildNamed("Outbox");

  registerCleanupFunction(() => {
    gServer.stop();
  });
});

add_task(async function testIsReflexive() {
  const files = {
    "background.js": async () => {
      function trimContent(content) {
        const data = content.replaceAll("\r\n", "\n").split("\n");
        while (data[data.length - 1] == "") {
          data.pop();
        }
        return data.join("\n");
      }

      // Create a plain text message.
      const createdTextWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        plainTextBody: "This is some PLAIN text.",
        isPlainText: true,
        to: "rcpt@invalid.foo",
        subject: "Test message",
      });
      const [createdTextWindow] = await createdTextWindowPromise;
      const [createdTextTab] = await browser.tabs.query({
        windowId: createdTextWindow.id,
      });

      // Call getComposeDetails() to trigger the actual bug.
      const details = await browser.compose.getComposeDetails(
        createdTextTab.id
      );
      browser.test.assertEq("This is some PLAIN text.", details.plainTextBody);

      // Send the message.
      const removedTextWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.compose.sendMessage(createdTextTab.id);
      await removedTextWindowPromise;

      // Find the message in the send folder.
      const accounts = await browser.accounts.list();
      const account = accounts.find(a => a.folders.find(f => f.type == "sent"));
      const { messages } = await browser.messages.list(
        account.folders.find(f => f.type == "sent").id
      );

      // Read the message.
      browser.test.assertEq(
        "Test message",
        messages[0].subject,
        "Should find the sent message"
      );
      const message = await browser.messages.getFull(messages[0].id);
      const content = trimContent(message.parts[0].body);

      // Test that the first line is not an empty line.
      browser.test.assertEq(
        "This is some PLAIN text.",
        content,
        "The content should not start with an empty line"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "compose.send", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
