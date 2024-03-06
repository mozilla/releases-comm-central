/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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
var gRootFolder;
let gPopAccount;
let gLocalAccount;

requestLongerTimeout(2);

add_setup(() => {
  gServer = setupServerDaemon();
  gServer.start();

  // Test needs a non-local default account.
  gPopAccount = createAccount("pop3");
  gLocalAccount = createAccount("local");
  MailServices.accounts.defaultAccount = gPopAccount;

  const identity = getSmtpIdentity(
    "identity@foo.invalid",
    getBasicSmtpServer(gServer.port)
  );
  gPopAccount.addIdentity(identity);
  gPopAccount.defaultIdentity = identity;

  // Test is using the Drafts folder of the local account.
  gRootFolder = gLocalAccount.incomingServer.rootFolder;
  gRootFolder.createSubfolder("Sent", null);
  gRootFolder.createSubfolder("Drafts", null);
  MailServices.accounts.setSpecialFolders();

  // Reduce autosave interval to the minimum..
  Services.prefs.setIntPref("mail.compose.autosaveinterval", 1);
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("mail.compose.autosaveinterval");
    gServer.stop();
  });
});

add_task(async function test_compose_action_status_after_save() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const localAccount = accounts.find(a => a.type == "none");
      const draftFolder = localAccount.folders.find(f =>
        f.specialUse.includes("drafts")
      );

      // Open a compose windows.
      const tab = await browser.compose.beginNew({
        to: ["test@test.invalid"],
        subject: "Test message",
        body: "Waiting for autosave to kick in (60s).",
      });

      await browser.composeAction.disable(tab.id);
      await window.sendMessage("checkStatus", tab.windowId);

      // Add onAfterSave listener
      await new Promise(resolve => {
        function listener(tab, info) {
          const [msg] = info.messages;
          browser.test.log(
            `draftFolder.id: ${draftFolder.id}, folder.id: ${msg.folder.id}`
          );
          if (
            info.mode == "autoSave" &&
            msg.folder.id == draftFolder.id &&
            msg.subject == "Test message"
          ) {
            browser.compose.onAfterSave.removeListener(listener);
            resolve();
          }
        }
        browser.compose.onAfterSave.addListener(listener);
      });

      // This will be enabled in Bug 1862405.
      // await window.sendMessage("checkStatus", tab.windowId);
      await browser.tabs.remove(tab.id);

      // Remove all saved messages.
      await window.sendMessage("clearMessagesInFolder", draftFolder.name);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      compose_action: { default_title: "Test" },
      permissions: ["compose", "compose.save", "messagesRead", "accountsRead"],
    },
  });

  extension.onMessage("checkStatus", async windowId => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const button = composeWindow.document.querySelector(
      "[id$=_-composeAction-toolbarbutton]"
    );
    Assert.ok(button.disabled, "button should be disabled");
    extension.sendMessage();
  });

  extension.onMessage("clearMessagesInFolder", async folderName => {
    const folder = gRootFolder.getChildNamed(folderName);
    const messages = [...folder.messages];
    await new Promise(resolve => {
      folder.deleteMessages(
        messages,
        null,
        true,
        false,
        { OnStopCopy: resolve },
        false
      );
    });

    Assert.equal(0, [...folder.messages].length, "folder should be empty");
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
  gServer.resetTest();
});
