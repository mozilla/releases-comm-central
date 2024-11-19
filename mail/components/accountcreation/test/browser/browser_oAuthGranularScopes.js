/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { ConfigVerifier } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ConfigVerifier.sys.mjs"
);
const { CreateInBackend } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { createServer, serverDefs } = ServerTestUtils;

let oAuth2Server;

add_setup(async function () {
  await createServer(serverDefs.imap.oAuth);
  oAuth2Server = await OAuth2TestUtils.startServer();
});

registerCleanupFunction(async function () {
  Services.logins.removeAllLogins();
  // Some tests that open new windows confuse mochitest, which waits for a
  // focus event on the main window, and the test times out. If we focus a
  // different window (browser-harness.xhtml should be the only other window
  // at this point) then mochitest gets its focus event and the test ends.
  await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
});

async function subtest(grantedScope, expectFailure) {
  Services.logins.removeAllLogins();

  const config = {
    incoming: {
      type: "imap",
      hostname: "test.test",
      port: 143,
      socketType: Ci.nsMsgSocketType.plain,
      auth: Ci.nsMsgAuthMethod.OAuth2,
      username: "user",
      password: "not using a password",
    },
    outgoing: {
      type: "smtp",
      hostname: "test.test",
      port: 587,
      socketType: Ci.nsMsgSocketType.plain,
      auth: Ci.nsMsgAuthMethod.OAuth2,
      username: "user",
      password: "not using a password",
      addThisServer: true,
    },
    identity: {
      emailAddress: "test@test.test",
    },
  };

  const dialogPromise = expectOAuthDialog(grantedScope);
  const verifier = new ConfigVerifier(window.msgWindow);
  const verifyPromise = verifier.verifyConfig(config);
  await dialogPromise;
  if (expectFailure) {
    await Assert.rejects(
      verifyPromise,
      /Unable to log in at server./,
      "verify should fail"
    );
    return;
  }

  const configOut = await verifyPromise;
  OAuth2TestUtils.forgetObjects();

  const allLogins = await Services.logins.getAllLogins();
  Assert.equal(allLogins.length, 1, "refresh token should have been saved");
  Assert.equal(
    allLogins[0].hostname,
    "oauth://test.test",
    "saved login should be for the right origin"
  );
  Assert.equal(
    allLogins[0].httpRealm,
    grantedScope,
    "saved login should have only the granted scope"
  );

  const account = await CreateInBackend.createAccountInBackend(configOut);
  const incomingServer = account.incomingServer;
  Assert.equal(incomingServer.authMethod, Ci.nsMsgAuthMethod.OAuth2);

  const outgoingServer = MailServices.outgoingServer.defaultServer;
  Assert.equal(outgoingServer.authMethod, Ci.nsMsgAuthMethod.OAuth2);

  MailServices.accounts.removeAccount(account, false);
  MailServices.outgoingServer.deleteServer(outgoingServer);
  Services.logins.removeAllLogins();
}

async function expectOAuthDialog(grantedScope) {
  const oAuthWindow = await OAuth2TestUtils.promiseOAuthWindow();
  info("oauth2 window shown");
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [
      {
        expectedHint: "user",
        username: "user",
        password: "password",
        grantedScope,
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );
}

add_task(async function testNotGranted() {
  await subtest("", true);
});

add_task(async function testOnlyMailScope() {
  await subtest("test_mail", false);
});

add_task(async function testNotMailScope() {
  await subtest("test_addressbook test_calendar", true);
});

add_task(async function testAllScopes() {
  await subtest("test_mail test_addressbook test_calendar", false);
});
