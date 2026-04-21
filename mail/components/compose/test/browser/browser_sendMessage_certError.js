/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that sending mail from a server with an invalid certificate shows a
 * notification, that clicking the notification opens the certificate error
 * dialog if appropriate, and that using the dialog to add an exception works
 * correctly, allowing mail to be sent.
 */

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);
const { getCertificate } = ServerTestUtils;

let smtpIdentity, ewsIdentity;

add_setup(async function () {
  const smtpAccount = MailServices.accounts.createAccount();
  smtpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  smtpAccount.incomingServer.prettyName = "SMTP Account";

  smtpIdentity = MailServices.accounts.createIdentity();
  smtpIdentity.fullName = "test";
  smtpIdentity.email = "test@test.test";
  smtpIdentity.doFcc = false;

  smtpAccount.addIdentity(smtpIdentity);

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "ews"
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";

  ewsIdentity = MailServices.accounts.createIdentity();
  ewsIdentity.fullName = "test";
  ewsIdentity.email = "test@test.test";
  ewsIdentity.doFcc = false;

  ewsAccount.addIdentity(ewsIdentity);
  // Add passwords to the login manager, as we setting them on the outgoing
  // server doesn't work. TODO: Fix this.
  await addLoginInfo("ews://mitm.test.test", "user", "password");
  await addLoginInfo("ews://expired.test.test", "user", "password");
  await addLoginInfo("ews://notyetvalid.test.test", "user", "password");
  await addLoginInfo("ews://selfsigned.test.test", "user", "password");

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(smtpAccount, false);
    MailServices.accounts.removeAccount(ewsAccount, false);

    await removeLoginInfo("ews://mitm.test.test", "user", "password");
    await removeLoginInfo("ews://expired.test.test", "user", "password");
    await removeLoginInfo("ews://notyetvalid.test.test", "user", "password");
    await removeLoginInfo("ews://selfsigned.test.test", "user", "password");
  });
});

add_task(async function testDomainMismatchSMTP() {
  await subtest(
    ServerTestUtils.serverDefs.smtp.tls,
    "mitm.test.test",
    "The certificate belongs to a different site",
    "SSL_ERROR_BAD_CERT_DOMAIN",
    "valid"
  );
});

add_task(async function testExpiredSMTP() {
  await subtest(
    ServerTestUtils.serverDefs.smtp.expiredTLS,
    "expired.test.test",
    "The certificate is not currently valid",
    "SEC_ERROR_EXPIRED_CERTIFICATE",
    "expired"
  );
});

add_task(async function testNotYetValidSMTP() {
  await subtest(
    ServerTestUtils.serverDefs.smtp.notYetValidTLS,
    "notyetvalid.test.test",
    "The certificate is not currently valid",
    "MOZILLA_PKIX_ERROR_NOT_YET_VALID_CERTIFICATE",
    "notyetvalid"
  );
});

add_task(async function testSelfSignedSMTP() {
  await subtest(
    ServerTestUtils.serverDefs.smtp.selfSignedTLS,
    "selfsigned.test.test",
    "The certificate is not trusted",
    "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT",
    "selfsigned"
  );
});

add_task(async function testDomainMismatchEWS() {
  await subtest(
    ServerTestUtils.serverDefs.ews.tls,
    "mitm.test.test",
    "The certificate belongs to a different site",
    "SSL_ERROR_BAD_CERT_DOMAIN",
    "valid"
  );
});

add_task(async function testExpiredEWS() {
  await subtest(
    ServerTestUtils.serverDefs.ews.expiredTLS,
    "expired.test.test",
    "The certificate is not currently valid",
    "SEC_ERROR_EXPIRED_CERTIFICATE",
    "expired"
  );
});

add_task(async function testNotYetValidEWS() {
  await subtest(
    ServerTestUtils.serverDefs.ews.notYetValidTLS,
    "notyetvalid.test.test",
    "The certificate is not currently valid",
    "MOZILLA_PKIX_ERROR_NOT_YET_VALID_CERTIFICATE",
    "notyetvalid"
  );
});

add_task(async function testSelfSignedEWS() {
  await subtest(
    ServerTestUtils.serverDefs.ews.selfSignedTLS,
    "selfsigned.test.test",
    "The certificate is not trusted",
    "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT",
    "selfsigned"
  );
});

/**
 * @param {ServerDef} serverDef - From ServerTestUtils
 * @param {string} hostname - The hostname to attempt connection to.
 * @param {string} expectedDialogText - This text should appear in the dialog.
 * @param {string} expectedErrorCategory - See nsITransportSecurityInfo.errorCodeString.
 * @param {"selfsigned"|"expired"|"notyetvalid"|"selfsigned"|"valid"} expectedCert - Expected type of cerficate.
 */
async function subtest(
  serverDef,
  hostname,
  expectedDialogText,
  expectedErrorCategory,
  expectedCert
) {
  info(`Performing subtest for type=${serverDef.type}`);
  Services.fog.testResetFOG();
  const smtpServer = await ServerTestUtils.createServer(serverDef);

  const outgoingServer = MailServices.outgoingServer.createServer(
    serverDef.type
  );
  let identity, port;
  if (serverDef.type == "smtp") {
    outgoingServer.QueryInterface(Ci.nsISmtpServer);
    outgoingServer.hostname = hostname;
    outgoingServer.socketType = Ci.nsMsgSocketType.SSL;
    outgoingServer.port = 465;
    identity = smtpIdentity;
    port = 465;
  } else if (serverDef.type == "ews") {
    outgoingServer.QueryInterface(Ci.IExchangeOutgoingServer);
    outgoingServer.initialize(`https://${hostname}/EWS/Exchange.asmx`);
    identity = ewsIdentity;
    port = 443;
  }
  outgoingServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  outgoingServer.username = "user";
  outgoingServer.password = "password";
  identity.smtpServerKey = outgoingServer.key;

  const { composeWindow, subject } = await newComposeWindow(identity);

  const commonDialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://global/content/commonDialog.xhtml",
    {
      async callback(win) {
        info(`${win.location} now open`);
        await new Promise(resolve => win.requestAnimationFrame(resolve));
        await new Promise(win.requestIdleCallback);
        win.document.querySelector("dialog").acceptDialog();
      },
    }
  );
  const exceptionDialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://pippki/content/exceptionDialog.xhtml",
    {
      async callback(win) {
        info(`${win.location} now open`);
        const location = win.document.getElementById("locationTextBox").value;
        if (port == 443) {
          Assert.equal(
            location,
            hostname,
            "the exception dialog should show the hostname of the server"
          );
        } else {
          Assert.equal(
            location,
            `${hostname}:465`,
            "the exception dialog should show the hostname and port of the server"
          );
        }
        const text = win.document.getElementById(
          "statusLongDescription"
        ).textContent;
        Assert.stringContains(
          text,
          expectedDialogText,
          "the exception dialog should state the problem"
        );

        const viewButton = win.document.getElementById("viewCertButton");
        const tabmail = document.getElementById("tabmail");
        const tabPromise = BrowserTestUtils.waitForEvent(
          tabmail.tabContainer,
          "TabOpen"
        );
        viewButton.click();
        const {
          detail: { tabInfo },
        } = await tabPromise;
        await BrowserTestUtils.browserLoaded(tabInfo.browser, false, url =>
          url.startsWith("about:certificate?cert=")
        );
        tabmail.closeTab(tabInfo);

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

  await Promise.allSettled([commonDialogPromise, exceptionDialogPromise]);
  info("The dialogs were shown.");

  // Try to solve strange focus issues.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  EventUtils.synthesizeKey("KEY_Tab", {}, composeWindow);
  await SimpleTest.promiseFocus(composeWindow);

  info("Checking certificate exception gets created");
  const isTemporary = {};
  Assert.ok(
    certOverrideService.hasMatchingOverride(
      hostname,
      port,
      {},
      await getCertificate(expectedCert),
      isTemporary
    ),
    `certificate exception should exist for ${hostname}:${port}`
  );
  // The checkbox in the dialog was checked, so this exception is permanent.
  Assert.ok(!isTemporary.value, "certificate exception should be permanent");

  const telemetryEvents = Glean.mail.certificateExceptionAdded.testGetValue();
  Assert.equal(telemetryEvents.length, 1);
  Assert.deepEqual(telemetryEvents[0].extra, {
    error_category: expectedErrorCategory,
    protocol: serverDef.type,
    port,
    ui: "compose-send-listener",
  });

  info("Will try to send again, now that a certificate exception was added");
  EventUtils.synthesizeMouseAtCenter(
    composeWindow.document.getElementById("button-send"),
    {},
    composeWindow
  );
  await BrowserTestUtils.domWindowClosed(composeWindow);

  certOverrideService.clearAllOverrides();

  Assert.stringContains(
    smtpServer.lastSentMessage,
    `Subject: ${subject}`,
    "server should have received message"
  );
}
