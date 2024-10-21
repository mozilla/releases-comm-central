/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);
const { getCertificate } = ServerTestUtils;

let identity;

add_setup(async function () {
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("sendMessage certError", null);

  identity = MailServices.accounts.createIdentity();
  identity.fullName = "test";
  identity.email = "test@test.test";
  identity.fccFolder = rootFolder.getChildNamed("sendMessage certError").URI;

  account.addIdentity(identity);

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testDomainMismatch() {
  await subtest(
    "tls",
    "mitm.test.test",
    "The certificate belongs to a different site",
    "valid"
  );
});

add_task(async function testExpired() {
  await subtest(
    "expiredTLS",
    "expired.test.test",
    "The certificate is not currently valid",
    "expired"
  );
});

add_task(async function testNotYetValid() {
  await subtest(
    "notYetValidTLS",
    "notyetvalid.test.test",
    "The certificate is not currently valid",
    "notyetvalid"
  );
});

add_task(async function testSelfSigned() {
  await subtest(
    "selfSignedTLS",
    "selfsigned.test.test",
    "The certificate is not trusted",
    "selfsigned"
  );
});

async function subtest(serverDef, hostname, expectedDialogText, expectedCert) {
  const smtpServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.smtp[serverDef]
  );

  const outgoingServer = MailServices.outgoingServer.createServer("smtp");
  outgoingServer.QueryInterface(Ci.nsISmtpServer);
  outgoingServer.hostname = hostname;
  outgoingServer.socketType = Ci.nsMsgSocketType.SSL;
  outgoingServer.port = 465;
  outgoingServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  outgoingServer.username = "user";
  outgoingServer.password = "password";
  identity.smtpServerKey = outgoingServer.key;

  const { composeWindow, subject } = await newComposeWindow();

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://pippki/content/exceptionDialog.xhtml",
    {
      callback(win) {
        const location = win.document.getElementById("locationTextBox").value;
        Assert.equal(
          location,
          `${hostname}:465`,
          "the exception dialog should show the hostname and port of the server"
        );
        const text = win.document.getElementById(
          "statusLongDescription"
        ).textContent;
        Assert.stringContains(
          text,
          expectedDialogText,
          "the exception dialog should state the problem"
        );

        EventUtils.synthesizeMouseAtCenter(
          win.document.querySelector("dialog").getButton("extra1"),
          {},
          win
        );
      },
    }
  );

  composeWindow.document.getElementById("toAddrInput").focus();
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );

  await dialogPromise;
  // FIXME: At this point, an alert appears and tells the user that sending
  // failed because of the bad certificate, which is true but redundant,
  // especially if we just added an exception. I think the alert is meant to
  // happen before the exception dialog but this got broken somewhere.
  // See bug 1853440.
  await BrowserTestUtils.promiseAlertDialogOpen("accept");

  // Try to solve strange focus issues.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  EventUtils.synthesizeKey("KEY_Tab", {}, composeWindow);
  await SimpleTest.promiseFocus(composeWindow);

  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await BrowserTestUtils.domWindowClosed(composeWindow);

  if (expectedCert) {
    // Check the certificate exception was created.
    const isTemporary = {};
    Assert.ok(
      certOverrideService.hasMatchingOverride(
        hostname,
        465,
        {},
        await getCertificate(expectedCert),
        isTemporary
      ),
      `certificate exception should exist for ${hostname}:465`
    );
    // The checkbox in the dialog was checked, so this exception is permanent.
    Assert.ok(!isTemporary.value, "certificate exception should be permanent");
  }
  certOverrideService.clearAllOverrides();

  Assert.stringContains(
    smtpServer.lastMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}
