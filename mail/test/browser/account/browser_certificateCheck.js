/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { click_account_tree_row, get_account_tree_row, openAccountSettings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);

const tabmail = document.getElementById("tabmail");
// Incoming servers.
let imapPlain, imapTLS, imapExpired, imapNoServer, pop3TLS, ewsTLS, nntpTLS;
// Outgoing servers.
let smtpPlain, smtpTLS, ewsOutgoingTLS;

add_setup(async () => {
  await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.tls,
    ServerTestUtils.serverDefs.imap.expiredTLS,
    ServerTestUtils.serverDefs.pop3.tls,
    ServerTestUtils.serverDefs.ews.tls,
    ServerTestUtils.serverDefs.smtp.tls,
  ]);

  imapPlain = MailServices.accounts.createAccount();
  imapPlain.addIdentity(MailServices.accounts.createIdentity());
  imapPlain.incomingServer = MailServices.accounts.createIncomingServer(
    "user1",
    "test.test",
    "imap"
  );
  imapPlain.incomingServer.port = 143;
  imapPlain.incomingServer.prettyName = "IMAP plain";

  imapTLS = MailServices.accounts.createAccount();
  imapTLS.addIdentity(MailServices.accounts.createIdentity());
  imapTLS.incomingServer = MailServices.accounts.createIncomingServer(
    "user2",
    "test.test",
    "imap"
  );
  imapTLS.incomingServer.port = 993;
  imapTLS.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  imapTLS.incomingServer.prettyName = "IMAP TLS";

  imapExpired = MailServices.accounts.createAccount();
  imapExpired.addIdentity(MailServices.accounts.createIdentity());
  imapExpired.incomingServer = MailServices.accounts.createIncomingServer(
    "user3",
    "expired.test.test",
    "imap"
  );
  imapExpired.incomingServer.port = 993;
  imapExpired.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  imapExpired.incomingServer.prettyName = "IMAP expiredTLS";

  imapNoServer = MailServices.accounts.createAccount();
  imapNoServer.addIdentity(MailServices.accounts.createIdentity());
  imapNoServer.incomingServer = MailServices.accounts.createIncomingServer(
    "user4",
    "wrong.test",
    "imap"
  );
  imapNoServer.incomingServer.port = 993;
  imapNoServer.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  imapNoServer.incomingServer.prettyName = "IMAP no server";

  pop3TLS = MailServices.accounts.createAccount();
  pop3TLS.addIdentity(MailServices.accounts.createIdentity());
  pop3TLS.incomingServer = MailServices.accounts.createIncomingServer(
    "user5",
    "test.test",
    "pop3"
  );
  pop3TLS.incomingServer.port = 995;
  pop3TLS.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  pop3TLS.incomingServer.prettyName = "POP3 TLS";

  ewsTLS = MailServices.accounts.createAccount();
  ewsTLS.addIdentity(MailServices.accounts.createIdentity());
  ewsTLS.incomingServer = MailServices.accounts.createIncomingServer(
    "user6",
    "test.test",
    "ews"
  );
  ewsTLS.incomingServer.setStringValue(
    "ews_url",
    "https://test.test/EWS/Exchange.asmx"
  );
  ewsTLS.incomingServer.port = 443;
  ewsTLS.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  ewsTLS.incomingServer.prettyName = "EWS TLS";

  nntpTLS = MailServices.accounts.createAccount();
  nntpTLS.addIdentity(MailServices.accounts.createIdentity());
  nntpTLS.incomingServer = MailServices.accounts.createIncomingServer(
    "user7",
    "test.test",
    "nntp"
  );
  nntpTLS.incomingServer.port = 563;
  nntpTLS.incomingServer.socketType = Ci.nsMsgSocketType.SSL;
  nntpTLS.incomingServer.prettyName = "NNTP TLS";

  MailServices.outgoingServer.defaultServer =
    MailServices.outgoingServer.servers[0];

  smtpPlain = MailServices.outgoingServer.createServer("smtp");
  smtpPlain.QueryInterface(Ci.nsISmtpServer);
  smtpPlain.hostname = "test.test";
  smtpPlain.port = 587;
  smtpPlain.description = "SMTP plain";

  smtpTLS = MailServices.outgoingServer.createServer("smtp");
  smtpTLS.QueryInterface(Ci.nsISmtpServer);
  smtpTLS.hostname = "test.test";
  smtpTLS.port = 465;
  smtpTLS.socketType = Ci.nsMsgSocketType.SSL;
  smtpTLS.description = "SMTP TLS";

  ewsOutgoingTLS = MailServices.outgoingServer.createServer("ews");
  ewsOutgoingTLS.QueryInterface(Ci.nsIEwsServer);
  ewsOutgoingTLS.initialize("https://test.test/EWS/Exchange.asmx");
  ewsOutgoingTLS.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
  ewsOutgoingTLS.username = "user";

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(imapPlain, false);
    MailServices.accounts.removeAccount(imapTLS, false);
    MailServices.accounts.removeAccount(imapExpired, false);
    MailServices.accounts.removeAccount(imapNoServer, false);
    MailServices.accounts.removeAccount(pop3TLS, false);
    MailServices.accounts.removeAccount(ewsTLS, false);
    MailServices.accounts.removeAccount(nntpTLS, false);
    MailServices.outgoingServer.deleteServer(smtpPlain);
    MailServices.outgoingServer.deleteServer(smtpTLS);
    MailServices.outgoingServer.deleteServer(ewsOutgoingTLS);
    certOverrideService.clearAllOverrides();
    tabmail.closeOtherTabs(0);
  });
});

/**
 * Test a server that does not use TLS. The certificate check should be hidden.
 */
add_task(async function testNonTLS() {
  const accountsTab = await openTab(imapPlain, "hidden");
  tabmail.closeTab(accountsTab);
});

/**
 * Test changing the server's socket type in the UI.
 */
add_task(async function testSwitchSocketTypes() {
  const accountsTab = await openTab(imapPlain, "hidden");
  const certCheck = getCertificateCheck(accountsTab);
  const socketType =
    certCheck.ownerDocument.getElementById("server.socketType");
  const options = Object.fromEntries(
    Array.from(socketType.options, o => [o.value, o.index])
  );

  async function changeSocketType(type) {
    const shownPromise = BrowserTestUtils.waitForSelectPopupShown(window);
    EventUtils.synthesizeMouseAtCenter(socketType, {}, socketType.ownerGlobal);
    const popup = await shownPromise;
    popup.activateItem(popup.children[options[type]]);
    await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  }

  // Change to TLS. The cert check UI should now be configured and visible.

  await changeSocketType(Ci.nsMsgSocketType.SSL);
  Assert.equal(
    imapPlain.incomingServer.socketType,
    Ci.nsMsgSocketType.SSL,
    "the server's socket type should be updated"
  );
  Assert.equal(
    imapPlain.incomingServer.port,
    993,
    "the server's port should be updated"
  );
  checkStatus(certCheck, null, undefined, "fetch");
  Assert.ok(!certCheck.isStartTLS, "the isStartTLS flag should not be set");
  Assert.equal(certCheck.port, 993, "the port should be set");

  // Change to startTLS. The cert check UI should now be configured and visible.
  // We can't currently simulate a startTLS server, so this is as close as we
  // get to proving the check works for startTLS in a test.

  await changeSocketType(Ci.nsMsgSocketType.alwaysSTARTTLS);
  Assert.equal(
    imapPlain.incomingServer.socketType,
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    "the server's socket type should be updated"
  );
  Assert.equal(
    imapPlain.incomingServer.port,
    143,
    "the server's port should be updated"
  );
  checkStatus(certCheck, null, undefined, "fetch");
  Assert.ok(certCheck.isStartTLS, "the isStartTLS flag should be set");
  Assert.equal(certCheck.port, 143, "the port should be set");

  // Change back to plain. The cert check UI should now be hidden.

  await changeSocketType(Ci.nsMsgSocketType.plain);
  Assert.equal(
    imapPlain.incomingServer.socketType,
    Ci.nsMsgSocketType.plain,
    "the server's socket type should be updated"
  );
  Assert.equal(
    imapPlain.incomingServer.port,
    143,
    "the server's port should be updated"
  );
  checkStatus(certCheck, "hidden");

  tabmail.closeTab(accountsTab);
});

/**
 * Test a server with a valid certificate and the View Certificate button.
 */
add_task(async function testValidCertificate() {
  const accountsTab = await openTab(imapTLS, null, undefined, ["fetch"]);

  const certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "success",
    {
      id: "certificate-check-success",
      args: { hostname: "test.test:993" },
    },
    ["view"]
  );

  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  EventUtils.synthesizeMouseAtCenter(
    certCheck.viewButton,
    {},
    certCheck.ownerGlobal
  );
  const {
    detail: { tabInfo: certificateTab },
  } = await tabOpenPromise;
  await BrowserTestUtils.browserLoaded(certificateTab.browser, false, url =>
    url.startsWith("about:certificate?cert=")
  );

  tabmail.closeTab(certificateTab);
  tabmail.closeTab(accountsTab);
});

/**
 * Test a server with an invalid certificate and adding then removing a
 * certificate exception.
 */
add_task(async function testInvalidCertificate() {
  Services.fog.testResetFOG();
  const accountsTab = await openTab(imapExpired, null, undefined, ["fetch"]);

  const certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "cert-error",
    {
      id: "cert-error-expired",
      args: {
        hostname: "expired.test.test:993",
        "not-after": new Intl.DateTimeFormat().format(
          new Date(Date.UTC(2010, 0, 6))
        ),
      },
    },
    ["view", "addException"]
  );

  const expiredCertificate = await ServerTestUtils.getCertificate("expired");
  await addException(certCheck, expiredCertificate);
  await removeException(certCheck, expiredCertificate);

  tabmail.closeTab(accountsTab);

  const telemetryEvents = Glean.mail.certificateExceptionAdded.testGetValue();
  Assert.equal(telemetryEvents.length, 1);
  Assert.deepEqual(telemetryEvents[0].extra, {
    error_category: "SEC_ERROR_EXPIRED_CERTIFICATE",
    protocol: "imap",
    port: "993",
    ui: "certificate-check",
  });
});

/**
 * Test a server with an invalid certificate when a certificate exception
 * already exists.
 */
add_task(async function testWithExistingException() {
  const expiredCertificate = await ServerTestUtils.getCertificate("expired");
  certOverrideService.rememberValidityOverride(
    "expired.test.test",
    993,
    {},
    expiredCertificate,
    false
  );

  const accountsTab = await openTab(
    imapExpired,
    "cert-error",
    {
      id: "certificate-check-exception-exists",
      args: { hostname: "expired.test.test:993" },
    },
    ["fetch", "removeException"]
  );

  const certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "cert-error",
    {
      id: "certificate-check-exception-exists",
      args: { hostname: "expired.test.test:993" },
    },
    ["view", "removeException"]
  );

  await removeException(certCheck, expiredCertificate);

  tabmail.closeTab(accountsTab);
});

/**
 * Test fetching the certificate from a server that doesn't exist.
 */
add_task(async function testConnectionError() {
  const accountsTab = await openTab(imapNoServer, null, undefined, ["fetch"]);

  const certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "failure",
    {
      id: "certificate-check-failure",
      args: { hostname: "wrong.test:993" },
    },
    []
  );

  tabmail.closeTab(accountsTab);
});

/**
 * Check that the certificate check UI gets reset when moving to a different
 * settings pane and back.
 */
add_task(async function testSwitchPanes() {
  const accountsTab = await openTab(imapTLS, null, undefined, ["fetch"]);

  let certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "success",
    {
      id: "certificate-check-success",
      args: { hostname: "test.test:993" },
    },
    ["view"]
  );

  await switchPane(imapTLS, "am-copies.xhtml", accountsTab);
  await switchPane(imapTLS, "am-server.xhtml", accountsTab);

  certCheck = getCertificateCheck(accountsTab);
  checkStatus(certCheck, null, undefined);
  checkButtons(certCheck, ["fetch"]);

  tabmail.closeTab(accountsTab);
});

/**
 * Check that the certificate check UI gets reset when moving to the settings
 * pane of another account. This doesn't cause am-server.xhtml to be reloaded.
 */
add_task(async function testSwitchAccounts() {
  const accountsTab = await openTab(imapExpired, null, undefined, ["fetch"]);

  let certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "cert-error",
    {
      id: "cert-error-expired",
      args: {
        hostname: "expired.test.test:993",
        "not-after": new Intl.DateTimeFormat().format(
          new Date(Date.UTC(2010, 0, 6))
        ),
      },
    },
    ["view", "addException"]
  );

  await switchPane(imapTLS, "am-server.xhtml", accountsTab);

  certCheck = getCertificateCheck(accountsTab);
  checkStatus(certCheck, null, undefined);
  checkButtons(certCheck, ["fetch"]);

  tabmail.closeTab(accountsTab);
});

/**
 * Test a POP3 server that uses TLS.
 */
add_task(async function testPOP3() {
  const accountsTab = await openTab(pop3TLS, null, undefined, ["fetch"]);

  const certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "success",
    {
      id: "certificate-check-success",
      args: { hostname: "test.test:995" },
    },
    ["view"]
  );

  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  EventUtils.synthesizeMouseAtCenter(
    certCheck.viewButton,
    {},
    certCheck.ownerGlobal
  );
  const {
    detail: { tabInfo: certificateTab },
  } = await tabOpenPromise;
  await BrowserTestUtils.browserLoaded(certificateTab.browser, false, url =>
    url.startsWith("about:certificate?cert=")
  );

  tabmail.closeTab(certificateTab);
  tabmail.closeTab(accountsTab);
});

/**
 * Test an Exchange server that uses TLS.
 */
add_task(async function testEWS() {
  const accountsTab = await openTab(ewsTLS, null, undefined, ["fetch"]);

  const certCheck = getCertificateCheck(accountsTab);
  await fetchCert(
    certCheck,
    "success",
    {
      id: "certificate-check-success",
      args: { hostname: "test.test:443" },
    },
    ["view"]
  );

  tabmail.closeTab(accountsTab);
});

/**
 * Test an NNTP server. This isn't implemented yet, but we need to check that
 * the certificate check UI is hidden.
 */
add_task(async function testNNTP() {
  const accountsTab = await openTab(nntpTLS, "hidden");
  tabmail.closeTab(accountsTab);
});

/**
 * Test the outgoing server pane.
 */
add_task(async function testOutgoingServerPane() {
  const accountsTab = await openAccountSettings();
  const accountRow = get_account_tree_row(null, null, accountsTab);
  await click_account_tree_row(accountsTab, accountRow);

  const { contentWindow, contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  const serverList = contentDocument.getElementById("smtpList");

  // Test a non-TLS SMTP server.

  EventUtils.synthesizeMouseAtCenter(
    serverList.querySelector(`[key="${smtpPlain.key}"]`),
    {},
    contentWindow
  );
  let certCheck = contentDocument.querySelector("certificate-check");
  Assert.ok(!certCheck, "certificate check should not exist for plain server");

  // Test a TLS SMTP server.

  EventUtils.synthesizeMouseAtCenter(
    serverList.querySelector(`[key="${smtpTLS.key}"]`),
    {},
    contentWindow
  );
  certCheck = contentDocument.querySelector("certificate-check");
  Assert.ok(certCheck, "certificate check should exist for TLS server");
  checkStatus(certCheck, null);
  await fetchCert(
    certCheck,
    "success",
    {
      id: "certificate-check-success",
      args: { hostname: "test.test:465" },
    },
    ["view"]
  );

  // Test a TLS EWS server.

  EventUtils.synthesizeMouseAtCenter(
    serverList.querySelector(`[key="${ewsOutgoingTLS.key}"]`),
    {},
    contentWindow
  );
  certCheck = contentDocument.querySelector("certificate-check");
  Assert.ok(certCheck, "certificate check should exist for TLS server");
  checkStatus(certCheck, null);
  await fetchCert(
    certCheck,
    "success",
    {
      id: "certificate-check-success",
      args: { hostname: "test.test:443" },
    },
    ["view"]
  );

  // Return to the non-TLS server. The UI should no longer be visible.

  EventUtils.synthesizeMouseAtCenter(
    serverList.querySelector(`[key="${smtpPlain.key}"]`),
    {},
    contentWindow
  );
  certCheck = contentDocument.querySelector("certificate-check");
  Assert.ok(!certCheck, "certificate check should not exist for plain server");

  tabmail.closeTab(accountsTab);
});

/**
 * Open the account manager tab to the server pane.
 *
 * @param {nsIMsgIncomingServer} server - The server to test.
 * @param {string} [expectStatus] - The expected value of the status attribute.
 * @param {object} [expectStatusLabel] - The expected Fluent attributes of the
 *   status label.
 * @param {string[]} [expectButtons] - IDs of the buttons expected to be visible.
 * @returns {TabInfo}
 */
async function openTab(server, expectStatus, expectStatusLabel, expectButtons) {
  const accountsTab = await openAccountSettings();
  await switchPane(server, "am-server.xhtml", accountsTab);

  const certCheck = getCertificateCheck(accountsTab);
  checkStatus(certCheck, expectStatus, expectStatusLabel);
  if (expectStatus != "hidden") {
    checkButtons(certCheck, expectButtons);
  }

  return accountsTab;
}

/**
 * Switch to a different pane of an already-open account manager tab.
 *
 * @param {nsIMsgIncomingServer} server - The server to test.
 * @param {string} paneId - Which pane to go to.
 * @param {TabInfo} accountsTab - The account manager tab.
 */
async function switchPane(server, paneId, accountsTab) {
  const accountRow = get_account_tree_row(server.key, paneId, accountsTab);
  await click_account_tree_row(accountsTab, accountRow);
}

/**
 * Get the certificate-check element in the current pane of the account manager tab.
 *
 * @param {TabInfo} accountsTab
 * @returns {CertificateCheck}
 */
function getCertificateCheck(accountsTab) {
  const { contentDocument } =
    accountsTab.browser.contentDocument.getElementById("contentFrame");
  return contentDocument.querySelector("certificate-check");
}

/**
 * Check the status attribute and label of the certificate check UI.
 *
 * @param {CertificateCheck} certCheck - The certificate-check element to test.
 * @param {string} [expectStatus] - The expected value of the status attribute.
 * @param {object} [expectStatusLabel] - The expected Fluent attributes of the
 *   status label.
 */
function checkStatus(certCheck, expectStatus, expectStatusLabel) {
  if (expectStatus == "hidden") {
    Assert.ok(
      BrowserTestUtils.isHidden(certCheck),
      "certificate check should be hidden"
    );
  } else {
    Assert.ok(
      BrowserTestUtils.isVisible(certCheck),
      "certificate check should be visible"
    );
    Assert.equal(
      certCheck.getAttribute("status"),
      expectStatus,
      `certificate check should start with ${expectStatus} status`
    );
    if (expectStatus) {
      Assert.deepEqual(
        certCheck.ownerDocument.l10n.getAttributes(certCheck.statusLabel),
        expectStatusLabel,
        `status label should display the correct message`
      );
    }
  }
}

/**
 * Check the buttons of the certificate check UI.
 *
 * @param {CertificateCheck} certCheck - The certificate-check element to test.
 * @param {string[]} [expectButtons] - IDs of the buttons expected to be visible.
 */
function checkButtons(certCheck, expectButtons) {
  Assert.equal(
    BrowserTestUtils.isVisible(certCheck.fetchButton),
    expectButtons.includes("fetch")
  );
  Assert.equal(
    BrowserTestUtils.isVisible(certCheck.viewButton),
    expectButtons.includes("view")
  );
  Assert.equal(
    BrowserTestUtils.isVisible(certCheck.addExceptionButton),
    expectButtons.includes("addException")
  );
  Assert.equal(
    BrowserTestUtils.isVisible(certCheck.removeExceptionButton),
    expectButtons.includes("removeException")
  );
}

/**
 * Test the certificate check UI fetching a certificate.
 *
 * @param {CertificateCheck} certCheck - The certificate-check element to test.
 * @param {string} [expectStatus] - The expected value of the status attribute.
 * @param {object} [expectStatusLabel] - The expected Fluent attributes of the
 *   status label.
 * @param {string[]} [expectButtons] - IDs of the buttons expected to be visible.
 */
async function fetchCert(
  certCheck,
  expectStatus,
  expectStatusLabel,
  expectButtons
) {
  // Ensure the L10n is ready before we begin.
  await certCheck.ownerDocument.l10n.translateRoots();
  EventUtils.synthesizeMouseAtCenter(
    certCheck.fetchButton,
    {},
    certCheck.ownerGlobal
  );
  Assert.equal(
    certCheck.getAttribute("status"),
    "fetching",
    "certificate check should be in fetching status"
  );
  await TestUtils.waitForCondition(
    () => certCheck.getAttribute("status") == expectStatus,
    `waiting for ${expectStatus} status`
  );
  Assert.deepEqual(
    certCheck.ownerDocument.l10n.getAttributes(certCheck.statusLabel),
    expectStatusLabel,
    "status label should display the correct message"
  );
  checkButtons(certCheck, expectButtons);
}

/**
 * Test the certificate check UI adding a certificate exception.
 *
 * @param {CertificateCheck} certCheck - The certificate-check element to test.
 * @param {nsIX509Cert} certificate - The certificate to test.
 */
async function addException(certCheck, certificate) {
  EventUtils.synthesizeMouseAtCenter(
    certCheck.addExceptionButton,
    {},
    certCheck.ownerGlobal
  );

  const isTemporary = {};
  Assert.ok(
    certOverrideService.hasMatchingOverride(
      "expired.test.test",
      993,
      {},
      certificate,
      isTemporary
    ),
    "certificate exception should exist for expired.test.test:993"
  );
  Assert.ok(!isTemporary.value, "certificate exception should be permanent");
  Assert.deepEqual(
    certCheck.ownerDocument.l10n.getAttributes(certCheck.statusLabel),
    {
      id: "certificate-check-exception-added",
      args: null,
    },
    "status label should display the exception added message"
  );
  checkButtons(certCheck, ["view", "removeException"]);
}

/**
 * Test the certificate check UI removing a certificate exception.
 *
 * @param {CertificateCheck} certCheck - The certificate-check element to test.
 * @param {nsIX509Cert} certificate - The certificate to test.
 */
async function removeException(certCheck, certificate) {
  EventUtils.synthesizeMouseAtCenter(
    certCheck.removeExceptionButton,
    {},
    certCheck.ownerGlobal
  );

  Assert.ok(
    !certOverrideService.hasMatchingOverride(
      "expired.test.test",
      993,
      {},
      certificate,
      {}
    ),
    "certificate exception should not exist for expired.test.test:993"
  );
  Assert.deepEqual(
    certCheck.ownerDocument.l10n.getAttributes(certCheck.statusLabel),
    {
      id: "certificate-check-exception-removed",
      args: null,
    },
    "status label should display the exception removed message"
  );
  checkButtons(certCheck, ["view", "addException"]);
}
