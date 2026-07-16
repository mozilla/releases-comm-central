/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
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

// The flow may be retried a few times if the OAuth prompt races with the
// verification teardown, so allow extra time.
requestLongerTimeout(2);

let oAuth2Server;

add_setup(async function () {
  await createServer(serverDefs.imap.oAuth);
  oAuth2Server = await OAuth2TestUtils.startServer();
});

registerCleanupFunction(async function () {
  await Services.logins.removeAllLoginsAsync();
  // Some tests that open new windows confuse mochitest, which waits for a
  // focus event on the main window, and the test times out. If we focus a
  // different window (browser-harness.xhtml should be the only other window
  // at this point) then mochitest gets its focus event and the test ends.
  await SimpleTest.promiseFocus([...Services.wm.getEnumerator(null)][1]);
});

async function subtest(grantedScope, expectFailure) {
  const config = new AccountConfig();
  config.incoming = {
    type: "imap",
    hostname: "test.test",
    port: 143,
    socketType: Ci.nsMsgSocketType.plain,
    auth: Ci.nsMsgAuthMethod.OAuth2,
    username: "user",
    password: "not using a password",
  };
  config.outgoing = {
    type: "smtp",
    hostname: "test.test",
    port: 587,
    socketType: Ci.nsMsgSocketType.plain,
    auth: Ci.nsMsgAuthMethod.OAuth2,
    username: "user",
    password: "not using a password",
    addThisServer: true,
  };
  config.identity = {
    emailAddress: "test@test.test",
  };

  try {
    let configOut;
    let verifyError;
    let telemetryResult;

    // Whether verification succeeds or fails, the OAuth authorization itself
    // must succeed first. On slow machines the verification can tear the OAuth
    // prompt down before the login form finishes submitting, recording a
    // "cancelled" telemetry event instead of "succeeded" (and, for the failure
    // cases, leaving a half-loaded window). Retry the whole flow until the
    // authorization actually completes.
    for (let attempt = 1; attempt <= 10; attempt++) {
      await Services.logins.removeAllLoginsAsync();
      OAuth2TestUtils.forgetObjects();
      Services.fog.testResetFOG();

      const oAuthPromise = expectOAuthDialog(grantedScope).catch(error => {
        info(`OAuth dialog handling did not complete: ${error}`);
      });
      const abortController = new AbortController();
      const verifier = new ConfigVerifier(
        window.msgWindow,
        abortController.signal
      );

      configOut = undefined;
      verifyError = null;
      await verifier.verifyConfig(config).then(
        result => {
          configOut = result;
        },
        error => {
          verifyError = error;
        }
      );
      await oAuthPromise;

      // Wait for the OAuth module to record telemetry, which signals that the
      // token exchange has completed (either successfully or as cancelled).
      await TestUtils.waitForCondition(
        () => Glean.mail.oauth2Authentication.testGetValue(),
        "waiting for OAuth telemetry"
      ).catch(() => {});
      telemetryResult = Glean.mail.oauth2Authentication.testGetValue()?.at(-1)
        ?.extra?.result;

      if (telemetryResult === "succeeded") {
        break;
      }
      info(
        `Attempt ${attempt}: OAuth did not complete (result=${telemetryResult}); retrying`
      );
    }

    Assert.equal(
      telemetryResult,
      "succeeded",
      "OAuth authorization should complete"
    );
    OAuth2TestUtils.checkTelemetry([
      {
        issuer: "test.test",
        reason: "no refresh token",
        result: "succeeded",
        where: "internal",
      },
    ]);

    if (expectFailure) {
      Assert.ok(verifyError, "verify should fail");
      Assert.ok(
        /Unable to log in at server./.test(verifyError?.message ?? ""),
        "verify should fail with the expected error"
      );
      return;
    }

    if (verifyError) {
      // OAuth succeeded, but IMAP timed out before the token was ready. Retry
      // now that the token is cached (this reuses the in-memory access token,
      // so no additional telemetry is recorded).
      info("IMAP probably timed out, retrying with the cached token...");
      configOut = await new ConfigVerifier(
        window.msgWindow,
        new AbortController().signal
      ).verifyConfig(config);
    }

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
  } finally {
    await Services.logins.removeAllLoginsAsync();
  }
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
