/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the ways to make Thunderbird send mail. In this file are best case
 * scenarios. Edge cases and failure cases are in separate files.
 */

let smtpServer, smtpIdentity;

add_setup(async function () {
  [smtpServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.smtp.plain,
  ]);

  let smtpAccount, smtpOutgoingServer;
  ({ smtpAccount, smtpIdentity, smtpOutgoingServer } = createSMTPAccount());
  await addLoginInfo("smtp://test.test", "user", "password");

  registerCleanupFunction(async function () {
    smtpOutgoingServer.closeCachedConnections();

    MailServices.accounts.removeAccount(smtpAccount, false);
    Services.logins.removeAllLogins();
    Services.prefs.clearUserPref("mail.warn_on_send_accel_key");
  });
});

/**
 * Tests spell check on send pass.
 */
add_task(async function testSpellCheckPass() {
  const { composeWindow, subject } = await newComposeWindow(
    null,
    "spellled wrong"
  );
  const composeDocument = composeWindow.document;
  const toolbarButton = composeDocument.getElementById("button-send");

  EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, composeWindow);

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.stringContains(
    smtpServer.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
});

/**
 * Tests spell check on send fail.
 */
add_task(async function testSpellCheckBeforeSendFail() {
  Services.prefs.setBoolPref("mail.SpellCheckBeforeSend", true);
  const { composeWindow, subject } = await newComposeWindow(
    null,
    "spellled wrong"
  );
  const composeDocument = composeWindow.document;
  const toolbarButton = composeDocument.getElementById("button-send");

  EventUtils.synthesizeMouseAtCenter(toolbarButton, {}, composeWindow);

  const newWindow = await BrowserTestUtils.domWindowOpenedAndLoaded();

  Assert.equal(
    newWindow.location.pathname,
    "/content/messengercompose/EdSpellCheck.xhtml",
    "Should open spell check window"
  );

  await SimpleTest.promiseFocus(newWindow);

  const closeButton = newWindow.document.getElementById("Close");
  await BrowserTestUtils.waitForMutationCondition(
    closeButton,
    {
      attributes: true,
      attriubuteFilter: ["hidden"],
    },
    () => closeButton.hidden
  );

  EventUtils.synthesizeMouseAtCenter(
    newWindow.document.getElementById("Send"),
    {},
    newWindow
  );

  await BrowserTestUtils.domWindowClosed(composeWindow);

  Assert.stringContains(
    smtpServer.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );

  Services.prefs.setBoolPref("mail.SpellCheckBeforeSend", false);
});
