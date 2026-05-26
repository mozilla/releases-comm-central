/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that with mailnews.sendInBackground=true, clicking Send queues the
 * message to the Outbox folder rather than delivering it immediately
 * to the SMTP server, and that nsMsgSendLater then delivers it.
 */

let smtpServer, smtpIdentity, smtpOutgoingServer;

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.sendInBackground", true);

  [smtpServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.plain,
  ]);

  let smtpAccount;
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount());
  await addLoginInfo("smtp://test.test", "user", "password");

  const localMailAccount = MailServices.accounts.createLocalMailAccount();
  const outbox =
    MailServices.accounts.localFoldersServer.rootFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Queue
    );
  Assert.equal(
    outbox.getTotalMessages(false),
    0,
    "outbox should start off empty"
  );

  const sendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );
  // Add folder listener now, like nsMsgSendLater.Init() does at startup.
  outbox.AddFolderListener(sendLater.QueryInterface(Ci.nsIFolderListener));

  registerCleanupFunction(async function () {
    outbox.RemoveFolderListener(sendLater.QueryInterface(Ci.nsIFolderListener));
    smtpOutgoingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(localMailAccount, false);
    await Services.logins.removeAllLoginsAsync();
    Services.prefs.clearUserPref("mailnews.sendInBackground");

    Assert.equal(
      outbox.getTotalMessages(false),
      0,
      "outbox should be empty at finish"
    );
  });
});

add_task(async function testSendInBackground() {
  const { composeWindow, subject } = await newComposeWindow(smtpIdentity);

  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );

  // With mailnews.sendInBackground=true the compose window should close after
  // queuing, without waiting for SMTP delivery.
  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.ok(
    !smtpServer.lastSentMessage,
    "server should not have received the message in background mode"
  );

  const sendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );
  Assert.ok(
    sendLater.hasUnsentMessages(smtpIdentity),
    "message should be queued in the outbox"
  );

  const outbox = sendLater.getUnsentMessagesFolder(smtpIdentity);
  await TestUtils.waitForCondition(
    () => outbox.getTotalMessages(false) == 0,
    "waiting for background send to deliver"
  );

  Assert.stringContains(
    smtpServer.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received the message after background send"
  );
});
