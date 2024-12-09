/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the OAuth2 authentication code without the complications of accounts.
 */

const { OAuth2Module } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Module.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

add_setup(async function () {
  await OAuth2TestUtils.startServer();
});

/**
 * Tests what happens when completing the authorisation step.
 */
add_task(async function testAccept() {
  Services.fog.testResetFOG();

  const mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "victor@foo.invalid", "imap");

  const oAuthPromise = OAuth2TestUtils.promiseOAuthWindow();
  const deferred = Promise.withResolvers();
  mod.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  const oAuthWindow = await oAuthPromise;
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [
      {
        expectedHint: "victor@foo.invalid",
        expectedScope: "test_scope",
        username: "user",
        password: "password",
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );

  await deferred.promise;

  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "no refresh token",
      result: "succeeded",
    },
  ]);
  OAuth2TestUtils.forgetObjects();

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "the should be a token saved");
  Assert.equal(logins[0].origin, "oauth://test.test");
  Assert.equal(logins[0].httpRealm, "test_scope");
  Assert.equal(logins[0].username, "victor@foo.invalid");
  Assert.equal(logins[0].password, "refresh_token");
  Services.logins.removeAllLogins();
});

/**
 * Tests what happens when cancelling the authorisation step.
 */
add_task(async function testCancel() {
  Services.fog.testResetFOG();

  const mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "romeo@foo.invalid", "imap");

  const oAuthPromise = OAuth2TestUtils.promiseOAuthWindow();
  const deferred = Promise.withResolvers();
  mod.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  const oAuthWindow = await oAuthPromise;
  await SimpleTest.promiseFocus(oAuthWindow.getBrowser());
  EventUtils.synthesizeKey("KEY_Escape", {}, oAuthWindow);

  await Assert.rejects(deferred.promise, /2147500036/); // NS_ERROR_ABORT

  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "no refresh token",
      result: "cancelled",
    },
  ]);
  OAuth2TestUtils.forgetObjects();

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "there should be no token saved");
  Services.logins.removeAllLogins();
});

/**
 * Tests what happens when trying to break the authorisation step by spoofing
 * the scope.
 */
add_task(async function testSpoofScope() {
  Services.fog.testResetFOG();

  const mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "papa@foo.invalid", "imap");

  const oAuthPromise = OAuth2TestUtils.promiseOAuthWindow();
  const deferred = Promise.withResolvers();
  mod.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  const oAuthWindow = await oAuthPromise;
  // Let's try to get a scope we weren't offered!
  await SpecialPowers.spawn(oAuthWindow.getBrowser(), [], function () {
    content.document.querySelector(
      `input[name="scope"][value="test_scope"]`
    ).value = "bad_scope";
  });
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [
      {
        expectedHint: "papa@foo.invalid",
        expectedScope: "test_scope",
        grantedScope: "bad_scope",
        username: "user",
        password: "password",
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );

  await Assert.rejects(deferred.promise, /2147500036/); // NS_ERROR_ABORT

  OAuth2TestUtils.checkTelemetry([
    {
      issuer: "test.test",
      reason: "no refresh token",
      result: "invalid scope",
    },
  ]);
  OAuth2TestUtils.forgetObjects();

  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "there should be no token saved");
  Services.logins.removeAllLogins();
});
