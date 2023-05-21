/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);
// Import the smtp server scripts
var {
  nsMailServer,
  gThreadManager,
  fsDebugNone,
  fsDebugAll,
  fsDebugRecv,
  fsDebugRecvSend,
} = ChromeUtils.import("resource://testing-common/mailnews/Maild.jsm");
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.import(
  "resource://testing-common/mailnews/Smtpd.jsm"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.import(
  "resource://testing-common/mailnews/Auth.jsm"
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
  let server = localAccountUtils.create_outgoing_server(
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
  let identity = MailServices.accounts.createIdentity();
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
  let popAccount = createAccount("pop3");
  let localAccount = createAccount("local");
  MailServices.accounts.defaultAccount = popAccount;

  let identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  popAccount.addIdentity(identity);
  popAccount.defaultIdentity = identity;

  // Test is using the Sent folder and Outbox folder of the local account.
  let rootFolder = localAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("Sent", null);
  MailServices.accounts.setSpecialFolders();
  gOutbox = rootFolder.getChildNamed("Outbox");

  registerCleanupFunction(() => {
    gServer.stop();
  });
});

add_task(async function testIsReflexive() {
  let files = {
    "background.js": async () => {
      function trimContent(content) {
        let data = content.replaceAll("\r\n", "\n").split("\n");
        while (data[data.length - 1] == "") {
          data.pop();
        }
        return data.join("\n");
      }

      // Create a plain text message.
      let createdTextWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        plainTextBody: "This is some PLAIN text.",
        isPlainText: true,
        to: "rcpt@invalid.foo",
        subject: "Test message",
      });
      let [createdTextWindow] = await createdTextWindowPromise;
      let [createdTextTab] = await browser.tabs.query({
        windowId: createdTextWindow.id,
      });

      // Call getComposeDetails() to trigger the actual bug.
      let details = await browser.compose.getComposeDetails(createdTextTab.id);
      browser.test.assertEq("This is some PLAIN text.", details.plainTextBody);

      // Send the message.
      let removedTextWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.compose.sendMessage(createdTextTab.id);
      await removedTextWindowPromise;

      // Find the message in the send folder.
      let accounts = await browser.accounts.list();
      let account = accounts.find(a => a.folders.find(f => f.type == "sent"));
      let { messages } = await browser.messages.list(
        account.folders.find(f => f.type == "sent")
      );

      // Read the message.
      browser.test.assertEq(
        "Test message",
        messages[0].subject,
        "Should find the sent message"
      );
      let message = await browser.messages.getFull(messages[0].id);
      let content = trimContent(message.parts[0].body);

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
  let extension = ExtensionTestUtils.loadExtension({
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
