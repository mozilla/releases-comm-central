/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2Module } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Module.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

/**
 * Tests that refresh tokens are correctly retrieved from the login manager.
 */
add_task(async function testGetRefreshToken() {
  await storeLogins([
    // Some logins we don't ever want to see in this test.
    ["https://test.test", "test_scope", "charlie@foo.invalid", "WRONG"],
    ["https://test.test", "test_scope", "mike@mochi.test", "WRONG"],
    ["oauth://test.test", "unknown_scope", "oscar@mochi.test", "WRONG"],
    // Good logins.
    ["oauth://test.test", "test_scope", "charlie@foo.invalid", "charlie"],
    [
      "oauth://test.test",
      "test_mail test_addressbook test_calendar",
      "juliet@bar.invalid",
      "juliet",
    ],
    [
      "oauth://test.test",
      "test_calendar test_addressbook test_mail",
      "mike@bar.invalid",
      "mike",
    ],
    ["oauth://test.test", "test_mail", "oscar@bar.invalid", "oscar-mail"],
    [
      "oauth://test.test",
      "test_addressbook",
      "oscar@bar.invalid",
      "oscar-addressbook",
    ],
    [
      "oauth://test.test",
      "test_calendar",
      "oscar@bar.invalid",
      "oscar-calendar",
    ],
  ]);

  // charlie@foo.invalid has a token for mochi.test.

  info("charlie@foo.invalid: mochi.test");
  let mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "charlie@foo.invalid");
  Assert.equal(mod._scope, "test_scope");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "charlie@foo.invalid");
  Assert.equal(mod.getRefreshToken(), "charlie");

  OAuth2TestUtils.forgetObjects();

  // charlie@bar.invalid does not have a token for mochi.test.
  // (Username doesn't match.)

  info("charlie@bar.invalid: mochi.test");
  mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "charlie@bar.invalid");
  Assert.equal(mod._scope, "test_scope");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "charlie@bar.invalid");
  Assert.equal(mod.getRefreshToken(), "");

  OAuth2TestUtils.forgetObjects();

  // charlie@foo.invalid does not have a token for test.test.
  // (Domain doesn't match.)

  info("charlie@foo.invalid: test.test");
  mod = new OAuth2Module();
  mod.initFromHostname("test.test", "charlie@foo.invalid");
  Assert.equal(mod._scope, "test_mail test_addressbook test_calendar");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "charlie@foo.invalid");
  Assert.equal(mod.getRefreshToken(), "");

  OAuth2TestUtils.forgetObjects();

  // charlie@bar.invalid does not have a token for test.test.
  // (Username and domain don't match.)

  info("charlie@bar.invalid: test.test");
  mod = new OAuth2Module();
  mod.initFromHostname("test.test", "charlie@bar.invalid");
  Assert.equal(mod._scope, "test_mail test_addressbook test_calendar");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "charlie@bar.invalid");
  Assert.equal(mod.getRefreshToken(), "");

  OAuth2TestUtils.forgetObjects();

  // juliet@bar.invalid has a token for all test.test scopes.

  info("juliet@bar.invalid: test.test, all scopes");
  mod = new OAuth2Module();
  mod.initFromHostname("test.test", "juliet@bar.invalid");
  Assert.equal(mod._scope, "test_mail test_addressbook test_calendar");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "juliet@bar.invalid");
  Assert.equal(mod.getRefreshToken(), "juliet");

  OAuth2TestUtils.forgetObjects();

  // mike@bar.invalid has a token for all test.test scopes, in a different order.
  // The order should not matter.

  info("mike@bar.invalid: test.test, all scopes");
  mod = new OAuth2Module();
  mod.initFromHostname("test.test", "mike@bar.invalid");
  Assert.equal(mod._scope, "test_mail test_addressbook test_calendar");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "mike@bar.invalid");
  Assert.equal(mod.getRefreshToken(), "mike");

  OAuth2TestUtils.forgetObjects();

  // oscar@bar.invalid has tokens for test.test scopes individually.
  // Looking for all the scopes at once will not find a token.

  info("oscar@bar.invalid: test.test, all scopes");
  mod = new OAuth2Module();
  mod.initFromHostname("test.test", "oscar@bar.invalid");
  Assert.equal(mod._scope, "test_mail test_addressbook test_calendar");
  Assert.equal(mod._loginOrigin, "oauth://test.test");
  Assert.equal(mod._username, "oscar@bar.invalid");
  Assert.equal(mod.getRefreshToken(), "");

  OAuth2TestUtils.forgetObjects();
  Services.logins.removeAllLogins();
});

/**
 * Tests that `OAuth2` objects are correctly cached and reused. An object can
 * be reused if:
 * - it's for the same endpoint, and
 * - it's for the same username, and
 * - the scopes it was granted, or the scopes it's requesting if it hasn't
 *   connected yet, are a superset of the scopes to be requested.
 */
add_task(async function testOAuth2ObjectsReuse() {
  // Check that two instances use the same object.
  const mod1 = new OAuth2Module();
  mod1.initFromHostname("mochi.test", "user1@foo.invalid");

  const mod2 = new OAuth2Module();
  mod2.initFromHostname("mochi.test", "user1@foo.invalid");
  Assert.equal(mod2._oauth, mod1._oauth, "the same object should be used");

  // Add another scope to the object and check that creating another new
  // instance with the same arguments still uses it.
  mod1._oauth.scope = "test_other_scope test_scope";
  const mod3 = new OAuth2Module();
  mod3.initFromHostname("mochi.test", "user1@foo.invalid");
  Assert.equal(mod3._oauth, mod1._oauth, "the same object should be used");

  // Check that a different set of scopes requires a different object.
  // This isn't really supported in practice as we only save one refresh token
  // per endpoint/username combination, but check anyway.
  const mod4 = new OAuth2Module();
  mod4.initFromHostname("test.test", "user1@foo.invalid");
  Assert.notEqual(mod4._oauth, mod1._oauth, "the same object must not be used");

  // Check that a different username requires a different object.
  const mod5 = new OAuth2Module();
  mod5.initFromHostname("mochi.test", "user2@foo.invalid");
  Assert.notEqual(mod5._oauth, mod1._oauth, "the same object must not be used");

  // Check that a different endpoint requires a different object.
  const mod6 = new OAuth2Module();
  mod6.initFromHostname("imap.gmail.com", "user1@foo.invalid");
  Assert.notEqual(mod6._oauth, mod1._oauth, "the same object must not be used");

  OAuth2TestUtils.forgetObjects();
});

/**
 * Tests that saved tokens get updated when a new token is issued.
 */
add_task(async function testSetRefreshToken() {
  // Create a server that makes a new token every time we use the current token.
  await OAuth2TestUtils.startServer({
    refreshToken: "romeo",
    rotateTokens: true,
  });

  // Store a token to be overwritten.
  await storeLogins([
    ["oauth://test.test", "test_scope", "romeo@foo.invalid", "romeo"],
  ]);

  // Connect.
  const mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "romeo@foo.invalid");

  const deferred = Promise.withResolvers();
  mod.connect(false, {
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });
  await deferred.promise;

  Assert.equal(
    mod._oauth.refreshToken,
    "romeo_1",
    "refresh token in memory should have been updated"
  );
  Assert.equal(mod._oauth.scope, "test_scope");

  // Check that the saved token was updated.
  const logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "another login should not have been added");

  Assert.equal(logins[0].hostname, "oauth://test.test");
  Assert.equal(logins[0].httpRealm, "test_scope");
  Assert.equal(logins[0].username, "romeo@foo.invalid");
  Assert.equal(logins[0].password, "romeo_1", "token should have been updated");

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
  OAuth2TestUtils.stopServer();
});

/**
 * Tests that saved scopes and tokens get updated when a new token is issued
 * and the server responds with a different set of scopes.
 */
add_task(async function testSetRefreshTokenWithNewScope() {
  // Create a server that makes a new token every time we use the current token.
  const oAuth2Server = await OAuth2TestUtils.startServer({
    refreshToken: "victor",
    rotateTokens: true,
  });

  // Tell the server to grant us a new scope. We won't be asking for it, but
  // servers are weird.
  oAuth2Server.grantedScope = "test_other_scope test_scope";

  // Store a token to be overwritten.
  await storeLogins([
    ["oauth://test.test", "test_scope", "victor@foo.invalid", "victor"],
  ]);

  // Connect.
  const mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "victor@foo.invalid");

  let deferred = Promise.withResolvers();
  mod.connect(false, {
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });
  await deferred.promise;

  Assert.equal(
    mod._oauth.refreshToken,
    "victor_1",
    "refresh token in memory should have been updated"
  );
  Assert.equal(
    mod._oauth.scope,
    "test_other_scope test_scope",
    "scope in memory should have been updated"
  );

  // Check that the saved token was updated.
  let logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "another login should not have been added");

  Assert.equal(logins[0].hostname, "oauth://test.test");
  Assert.equal(
    logins[0].httpRealm,
    "test_other_scope test_scope",
    "scope should have been updated"
  );
  Assert.equal(logins[0].username, "victor@foo.invalid");
  Assert.equal(
    logins[0].password,
    "victor_1",
    "token should have been updated"
  );

  // Pretend the access token has expired, and connect again.
  mod._oauth.tokenExpires = 0;
  deferred = Promise.withResolvers();
  mod.connect(false, {
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });
  await deferred.promise;

  Assert.ok(!mod._oauth.tokenExpired);
  Assert.equal(
    mod._oauth.refreshToken,
    "victor_2",
    "refresh token in memory should have been updated"
  );
  Assert.equal(mod._oauth.scope, "test_other_scope test_scope");

  // Check that the saved token was updated.
  logins = await Services.logins.getAllLogins();
  Assert.equal(logins.length, 1, "another login should not have been added");

  Assert.equal(logins[0].hostname, "oauth://test.test");
  Assert.equal(logins[0].httpRealm, "test_other_scope test_scope");
  Assert.equal(logins[0].username, "victor@foo.invalid");
  Assert.equal(
    logins[0].password,
    "victor_2",
    "token should have been updated"
  );

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
  OAuth2TestUtils.stopServer();
});

async function storeLogins(logins) {
  for (const [origin, scope, username, token] of logins) {
    const loginInfo = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    loginInfo.init(origin, null, scope, username, token, "", "");
    await Services.logins.addLoginAsync(loginInfo);
  }
}
