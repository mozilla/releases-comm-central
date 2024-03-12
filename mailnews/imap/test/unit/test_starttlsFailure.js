/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks that we handle the server dropping the connection
 * on starttls. Since fakeserver doesn't support STARTTLS, I've made
 * it drop the connection when it's attempted.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gAlertResolve;
var gGotAlert = new Promise(resolve => {
  gAlertResolve = resolve;
});

/* exported alert to alertTestUtils.js */
function alertPS(parent, aDialogTitle, aText) {
  gAlertResolve(aText);
}

add_setup(async function () {
  // Set up IMAP fakeserver and incoming server.
  IMAPPump.daemon = new ImapDaemon();
  IMAPPump.server = makeServer(IMAPPump.daemon, "", { dropOnStartTLS: true });
  IMAPPump.incomingServer = createLocalIMAPServer(IMAPPump.server.port);
  IMAPPump.incomingServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;

  // We need a local account for the IMAP server to have its sent messages in.
  localAccountUtils.loadLocalMailAccount();

  // We need an identity so that updateFolder doesn't fail.
  const imapAccount = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  imapAccount.addIdentity(identity);
  imapAccount.defaultIdentity = identity;
  imapAccount.incomingServer = IMAPPump.incomingServer;
  MailServices.accounts.defaultAccount = imapAccount;

  // The server doesn't support more than one connection.
  Services.prefs.setIntPref("mail.server.server1.max_cached_connections", 1);
  // We aren't interested in downloading messages automatically.
  Services.prefs.setBoolPref("mail.server.server1.download_on_biff", false);

  IMAPPump.inbox = IMAPPump.incomingServer.rootFolder
    .getChildNamed("Inbox")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  registerAlertTestUtils();

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(gDummyMsgWindow, listener);
  await listener.promise
    .then(res => {
      throw new Error("updateFolderWithListener has to fail");
    })
    .catch(exitCode => {
      Assert.ok(!Components.isSuccessCode(exitCode));
    });
});

add_task(async function check_alert() {
  const alertText = await gGotAlert;
  Assert.ok(alertText.startsWith("Server localhost has disconnected"));
});

add_task(function teardown() {
  IMAPPump.incomingServer.closeCachedConnections();
  IMAPPump.server.stop();
});
