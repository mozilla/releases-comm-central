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
var { smtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.import(
  "resource://testing-common/mailnews/Smtpd.jsm"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.import(
  "resource://testing-common/mailnews/Auth.jsm"
);

// Setup the daemon and server
function setupServerDaemon(handler) {
  if (!handler) {
    handler = function(d) {
      return new SMTP_RFC2821_handler(d);
    };
  }
  var server = new nsMailServer(handler, new smtpDaemon());
  return server;
}

function getBasicSmtpServer(port = 1, hostname = "localhost") {
  let server = localAccountUtils.create_outgoing_server(
    port,
    "user",
    "password",
    hostname
  );

  // Override the default greeting so we get something predicitable
  // in the ELHO message
  Services.prefs.setCharPref("mail.smtpserver.default.hello_argument", "test");

  return server;
}

function getSmtpIdentity(senderName, smtpServer) {
  // Set up the identity
  let identity = MailServices.accounts.createIdentity();
  identity.email = senderName;
  identity.smtpServerKey = smtpServer.key;

  return identity;
}

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
        "Should find the send message"
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

  let kIdentityMail = "identity@foo.invalid";

  let server = setupServerDaemon();
  server.start();

  // Ensure we have a local mail account, an normal account and appropriate
  // servers and identities.
  localAccountUtils.loadLocalMailAccount();
  MailServices.accounts.setSpecialFolders();

  let account = MailServices.accounts.createAccount();
  let incomingServer = MailServices.accounts.createIncomingServer(
    "test",
    "localhost",
    "pop3"
  );

  let smtpServer = getBasicSmtpServer(server.port);
  let identity = getSmtpIdentity(kIdentityMail, smtpServer);

  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;
  MailServices.accounts.defaultAccount = account;
  localAccountUtils.rootFolder.createLocalSubfolder("Sent");

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  server.stop();
});
