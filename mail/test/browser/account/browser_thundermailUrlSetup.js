/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests automatic configuration of Thundermail with a net.thunderbird URL.
 */

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const setupService = Cc["@mozilla.org/thundermail-url-handler;1"].getService(
  Ci.nsIObserver
);

let oAuth2Server, imapServer;
let account, incomingServer, outgoingServer;

async function configureServers(username, accessToken, refreshToken) {
  imapServer?.close();
  imapServer = await ServerTestUtils.createServer({
    ...ServerTestUtils.serverDefs.imap.oAuth,
    options: {
      username,
      password: accessToken,
    },
    hostname: "external.test",
  });

  OAuth2TestUtils.stopServer();
  oAuth2Server = await OAuth2TestUtils.startServer({
    username,
    accessToken,
    refreshToken,
  });
  oAuth2Server.grantedScope = "test_mail";
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.accounthub.thundermail.hostname", "external.test"],
      ["mailnews.oauth.useExternalBrowser", false],
    ],
  });

  // We get the autoconfig file from the service, not ISPDB.
  const xml = await IOUtils.readUTF8(getTestFilePath("xml/external.test"));
  const autoConfigServer = new HttpServer();
  autoConfigServer.identity.add("http", "autoconfig.external.test", 80);
  autoConfigServer.registerPathHandler(
    "/mail/config-v1.1.xml",
    (request, response) => {
      response.setHeader("Content-Type", "text/xml", false);
      response.write(xml);
    }
  );
  autoConfigServer.start(-1);
  NetworkTestUtils.configureProxy(
    "autoconfig.external.test",
    80,
    autoConfigServer.identity.primaryPort
  );

  await ServerTestUtils.createServer(ServerTestUtils.serverDefs.smtp.oAuth);

  registerCleanupFunction(async () => {
    if (account) {
      MailServices.accounts.removeAccount(account, false);
    }
    if (outgoingServer) {
      MailServices.outgoingServer.deleteServer(outgoingServer);
    }
    await Services.logins.removeAllLoginsAsync();
    NetworkTestUtils.unconfigureProxy("autoconfig.external.test", 80);
    autoConfigServer.stop();
  });
});

/**
 * Tests adding a Thundermail account where everything is working fine.
 */
add_task(async function testGoodConfig() {
  const name = "Roc E. Mail";
  const username = "roc@external.test";
  const token = "refresh_token";
  await configureServers(username, "access_token", token);
  await imapServer.addMessages(
    "INBOX",
    new MessageGenerator().makeMessages({ count: 5 })
  );

  // Load the URL.
  setupService.observe(
    null,
    "net-thunderbird-url",
    `net.thunderbird://thundermail/add?name=${name}&email=${username}&token=${token}`
  );

  // Check the account hub.
  const dialog = await subtest_wait_for_account_hub_dialog("MAIL");
  const footer = dialog.querySelector("#emailFooter");
  const footerForward = footer.querySelector("#forward");

  // Wait for the Thundermail config to be found and displayed, then move on.
  const configFoundStep = dialog.querySelector("email-config-found");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundStep),
    "waiting for Thundermail config to be found"
  );
  // Click through to the success page. No address books or calendars are
  // found because this test is a bit of a hack.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const successStep = dialog.querySelector("email-added-success");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(successStep),
    "waiting for account added success message"
  );
  // Click to the close the account hub.
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await closeEvent;

  await TestUtils.waitForCondition(
    () => MailServices.accounts.accounts.length === 3,
    "waiting for Thundermail account to be added"
  );

  // Okay, we've finished the account set up. Check the login is saved.
  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should be a saved password");
  Assert.equal(logins[0].origin, "oauth://external.test", "login origin");
  Assert.equal(logins[0].formActionOrigin, null, "login formActionOrigin");
  Assert.equal(logins[0].httpRealm, "test_mail", "login httpRealm");
  Assert.equal(logins[0].username, username, "login username");
  Assert.equal(logins[0].password, token, "login password");

  // Check the incoming server config was saved.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  account = MailServices.accounts.accounts.find(
    a => !["account1", "account2"].includes(a.key)
  );
  incomingServer = account.incomingServer;
  Assert.equal(incomingServer.type, "imap");
  Assert.equal(incomingServer.hostname, "external.test");
  Assert.equal(incomingServer.port, 143);
  Assert.equal(incomingServer.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(incomingServer.username, username);

  // Check an identity was created with the right information.
  Assert.equal(account.identities.length, 1);
  Assert.equal(account.defaultIdentity.fullName, name);
  Assert.equal(account.defaultIdentity.email, username);

  // Check the outgoing server config was saved.
  Assert.equal(MailServices.outgoingServer.servers.length, 2);
  outgoingServer = MailServices.outgoingServer.servers.find(
    o => o.key != "smtp1"
  );
  Assert.equal(outgoingServer.type, "smtp");
  Assert.equal(outgoingServer.hostname, "external.test");
  Assert.equal(outgoingServer.port, 587);
  Assert.equal(outgoingServer.authMethod, Ci.nsMsgAuthMethod.OAuth2);
  Assert.equal(outgoingServer.username, username);
  Assert.equal(account.defaultIdentity.smtpServerKey, outgoingServer.key);

  // Wait for mail to appear in the inbox.
  const inbox = incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  await TestUtils.waitForCondition(
    () => inbox.getTotalMessages(false) == 5,
    "waiting for mail to be received"
  );
  incomingServer.QueryInterface(Ci.nsIImapIncomingServer);
  await TestUtils.waitForCondition(
    () => incomingServer.allConnectionsIdle,
    "waiting for IMAP connection to become idle"
  );

  // Do not clean up.
});

/**
 * Tests what happens when trying to add a Thundermail account that already
 * exists. Thunderbird should refuse to add a new account and MUST NOT
 * override the existing token. Depends on testGoodConfig.
 */
add_task(async function testRepeat() {
  const name = "Roc E. Mail";
  const username = "roc@external.test";
  const token = "refresh_token";

  setupService.observe(
    null,
    "net-thunderbird-url",
    `net.thunderbird://thundermail/add?name=${name}&email=${username}&token=other_token`
  );

  // The account hub dialog should open with an error message.

  const dialog = await subtest_wait_for_account_hub_dialog("MAIL");
  const subview = dialog.querySelector("#emailAutoConfigSubview");
  const header = subview.shadowRoot.querySelector("account-hub-header");
  const closeButton = header.shadowRoot.querySelector("#closeButton");
  const footer = dialog.querySelector("#emailFooter");
  const footerBack = footer.querySelector("#back");
  const footerForward = footer.querySelector("#forward");

  // TODO There should be an appropriate subview.
  // TODO This is the wrong string.
  await checkErrorNotification(subview, "account-hub-creation-error-title");
  Assert.ok(BrowserTestUtils.isHidden(footerBack));
  Assert.ok(footerForward.disabled);

  // Close the account hub.
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(closeButton, {});
  await closeEvent;

  // Check the login was not overwritten.
  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "there should still be a saved password");
  Assert.equal(logins[0].username, username, "login username");
  Assert.equal(
    logins[0].password,
    token,
    "login password must not have changed"
  );

  // Check no new servers were created.
  Assert.equal(MailServices.accounts.accounts.length, 3);
  Assert.equal(MailServices.outgoingServer.servers.length, 2);

  // Do not clean up.
});

/**
 * Tests adding a second valid account. This can co-exist with the first account.
 * Depends on testGoodConfig.
 */
add_task(async function testSecondConfig() {
  const secondName = "Twee T. Bird";
  const secondUsername = "twee.t@external.test";
  const secondToken = "second_refresh_token";
  await configureServers(
    secondUsername,
    "second_access_token",
    "second_refresh_token"
  );

  // Load the URL.
  setupService.observe(
    null,
    "net-thunderbird-url",
    `net.thunderbird://thundermail/add?name=${secondName}&email=${secondUsername}&token=${secondToken}`
  );

  // Check the account hub.
  const dialog = await subtest_wait_for_account_hub_dialog("MAIL");
  const footer = dialog.querySelector("#emailFooter");
  const footerForward = footer.querySelector("#forward");

  // Wait for the Thundermail config to be found and displayed, then move on.
  const configFoundStep = dialog.querySelector("email-config-found");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(configFoundStep),
    "waiting for Thundermail config to be found"
  );
  // Click through to the success page. No address books or calendars are
  // found because this test is a bit of a hack.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const successStep = dialog.querySelector("email-added-success");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(successStep),
    "waiting for account added success message"
  );
  // Click to the close the account hub.
  const closeEvent = BrowserTestUtils.waitForEvent(dialog, "close");
  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await closeEvent;

  await TestUtils.waitForCondition(
    () => MailServices.accounts.accounts.length === 4,
    "waiting for Thundermail account to be added"
  );

  // Okay, we've finished the account set up. Check the login is saved.
  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 2, "there should be a second saved password");
  Assert.equal(logins[1].origin, "oauth://external.test", "login origin");
  Assert.equal(logins[1].formActionOrigin, null, "login formActionOrigin");
  Assert.equal(logins[1].httpRealm, "test_mail", "login httpRealm");
  Assert.equal(logins[1].username, secondUsername, "login username");
  Assert.equal(logins[1].password, secondToken, "login password");

  // Check the incoming server config was saved.
  Assert.equal(MailServices.accounts.accounts.length, 4);
  const secondAccount = MailServices.accounts.accounts.find(
    a => !["account1", "account2", account.key].includes(a.key)
  );
  const secondIncomingServer = secondAccount.incomingServer;
  Assert.equal(secondIncomingServer.username, secondUsername);

  // Check an identity was created with the right information.
  Assert.equal(secondAccount.identities.length, 1);
  Assert.equal(secondAccount.defaultIdentity.fullName, secondName);
  Assert.equal(secondAccount.defaultIdentity.email, secondUsername);

  // Check the outgoing server config was saved.
  Assert.equal(MailServices.outgoingServer.servers.length, 3);
  const secondOutgoingServer = MailServices.outgoingServer.servers.find(
    o => !["smtp1", outgoingServer.key].includes(o.key)
  );
  Assert.equal(secondOutgoingServer.username, secondUsername);
  Assert.equal(
    secondAccount.defaultIdentity.smtpServerKey,
    secondOutgoingServer.key
  );

  secondIncomingServer.QueryInterface(Ci.nsIImapIncomingServer);
  await TestUtils.waitForCondition(
    () => secondIncomingServer.allConnectionsIdle,
    "waiting for IMAP connection to become idle"
  );

  // Clean up both accounts.
  MailServices.accounts.removeAccount(account, false);
  MailServices.outgoingServer.deleteServer(outgoingServer);
  account = incomingServer = outgoingServer = null;
  MailServices.accounts.removeAccount(secondAccount, false);
  MailServices.outgoingServer.deleteServer(secondOutgoingServer);
  await Services.logins.removeAllLoginsAsync();
});

async function checkErrorNotification(subview, expectedId, expectedArgs = {}) {
  const header = subview.shadowRoot.querySelector("account-hub-header");
  const errorNotification = header.shadowRoot.querySelector(
    "#emailFormNotification"
  );
  const errorTitle = header.shadowRoot.querySelector(
    "#emailFormNotificationTitle"
  );

  await BrowserTestUtils.waitForMutationCondition(
    errorNotification,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(errorTitle)
  );
  await TestUtils.waitForTick();

  Assert.ok(errorNotification.classList.contains("error"));
  Assert.deepEqual(
    document.l10n.getAttributes(errorTitle.querySelector(".localized-title")),
    { id: expectedId, args: expectedArgs }
  );
}
