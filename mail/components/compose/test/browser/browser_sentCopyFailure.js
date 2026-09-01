/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an asynchronous failure to copy a successfully sent message to
 * an IMAP Sent folder is reported while the compose window is still
 * available, and that the Save Message recovery prompt is shown.
 */

let imapServer;
let localAccount;
let smtpAccount;
let smtpIdentity;
let smtpOutgoingServer;

add_setup(async function () {
  await addLoginInfo("imap://test.test", "user", "password");
  await addLoginInfo("smtp://test.test", "user", "password");

  [imapServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
    ServerTestUtils.serverDefs.smtp.plain,
  ]);
  imapServer.daemon.createMailbox("Sent", {
    flags: ["\\Sent"],
    subscribed: true,
  });

  localAccount = MailServices.accounts.createLocalMailAccount();
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } =
    createSMTPAccount("imap"));
  smtpIdentity.doFcc = true;

  const incomingServer = smtpAccount.incomingServer;
  incomingServer.performBiff(window.msgWindow);
  await TestUtils.waitForCondition(
    () => incomingServer.rootFolder.containsChildNamed("Sent"),
    "waiting for the Sent folder to synchronise"
  );
  smtpIdentity.fccFolderURI = incomingServer.serverURI + "/Sent";

  registerCleanupFunction(async function () {
    imapServer.daemon.commandToFail = "";
    incomingServer.closeCachedConnections();
    smtpOutgoingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(localAccount, false);
    await Services.logins.removeAllLoginsAsync();
  });
});

add_task(async function testSentCopyFailureOffersRecovery() {
  const { composeWindow } = await newComposeWindow(smtpIdentity);
  const composeClosed = BrowserTestUtils.domWindowClosed(composeWindow);

  imapServer.daemon.commandToFail = "APPEND";
  const originalPrompt = Services.prompt;
  const promptCalled = Promise.withResolvers();
  let promptHadOpenComposeParent;
  Services.prompt = {
    QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
    confirmEx(parentWindow) {
      promptHadOpenComposeParent =
        parentWindow == composeWindow && !composeWindow.closed;
      promptCalled.resolve();
      return 1; // Don't Save.
    },
  };

  try {
    EventUtils.synthesizeMouseAtCenter(
      composeWindow.document.getElementById("button-send"),
      {},
      composeWindow
    );
    await Promise.all([promptCalled.promise, composeClosed]);
  } finally {
    Services.prompt = originalPrompt;
    imapServer.daemon.commandToFail = "";
  }

  Assert.ok(
    promptHadOpenComposeParent,
    "the recovery prompt should have an open compose parent"
  );
});
