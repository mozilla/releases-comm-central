/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that CalDAV sessions only send credentials to the servers they are for.

const { CalDavDetectionSession, CalDavSession } = ChromeUtils.importESModule(
  "resource:///modules/caldav/CalDavSession.sys.mjs"
);
const { MsgAuthPrompt } = ChromeUtils.importESModule(
  "resource:///modules/MsgAsyncPrompter.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

const USERNAME = "user";
const PASSWORD = "password";

add_setup(async function () {
  do_get_profile();
  await OAuth2TestUtils.startServer();
  registerCleanupFunction(() => OAuth2TestUtils.stopServer());
});

/**
 * Prepares a channel for the given URI with the session, and returns the
 * authorization header set on it.
 *
 * @param {CalDavSession} session
 * @param {string} uri
 * @returns {Promise<?string>}
 */
async function prepareRequest(session, uri) {
  const channel = Services.io
    .newChannelFromURI(
      Services.io.newURI(uri),
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    )
    .QueryInterface(Ci.nsIHttpChannel);
  await session.prepareRequest(channel);
  try {
    return channel.getRequestHeader("Authorization");
  } catch (e) {
    return null;
  }
}

/**
 * Asks the session for credentials for the given URI, and returns the
 * password given.
 *
 * @param {CalDavDetectionSession} session
 * @param {string} uri
 * @param {integer} [flags=0] - The nsIAuthInformation flags.
 * @returns {?string}
 */
function promptAuth(session, uri, flags = 0) {
  const authInfo = {
    flags,
    PREVIOUS_FAILED: Ci.nsIAuthInformation.PREVIOUS_FAILED,
    username: "",
    password: "",
    realm: "test",
  };
  const ok = session.promptAuth(
    { URI: Services.io.newURI(uri) },
    Ci.nsIAuthPrompt2.LEVEL_NONE,
    authInfo
  );
  return ok ? authInfo.password : null;
}

add_task(async function testOAuthTokenOnlyForItsServer() {
  await Services.logins.addLoginAsync(
    new LoginInfo("oauth://test.test", null, "test_calendar", USERNAME, "refresh_token", "", "")
  );

  const session = new CalDavSession(USERNAME);
  Assert.equal(
    await prepareRequest(session, "http://test.test/calendars/"),
    "Bearer access_token",
    "the token should be sent to the server it was obtained for"
  );
  Assert.equal(
    await prepareRequest(session, "http://test.test/principals/"),
    "Bearer access_token",
    "the token should be sent to other paths on the same server"
  );
  Assert.equal(
    await prepareRequest(session, "http://other.invalid/principals/"),
    null,
    "the token should not be sent to a different server"
  );
  Assert.equal(
    await prepareRequest(session, "https://test.test/principals/"),
    null,
    "the token should not be sent to a different origin on the same host"
  );

  await Services.logins.removeAllLoginsAsync();
  OAuth2TestUtils.forgetObjects();
});

add_task(function testDetectionPasswordOnlyForItsSite() {
  const session = new CalDavDetectionSession(USERNAME, PASSWORD, false);
  session.passwordSites.add("https://example.org");
  session.passwordSites.add("http://example.net");

  Assert.equal(
    promptAuth(session, "https://dav.example.org:8443/"),
    PASSWORD,
    "the password should be used for the same site"
  );
  Assert.equal(
    promptAuth(session, "http://example.org/"),
    null,
    "the password should not be used without TLS on a site given with TLS"
  );
  Assert.equal(
    promptAuth(session, "https://example.com/"),
    null,
    "the password should not be used for a different site"
  );
  Assert.equal(
    promptAuth(session, "http://dav.example.net/"),
    PASSWORD,
    "the password should be used for a site given without TLS"
  );
  Assert.equal(
    promptAuth(session, "https://dav.example.net/"),
    PASSWORD,
    "the password should be used with TLS on a site given without TLS"
  );
});

add_task(async function testDetectionPromptForOtherSite() {
  const prompts = [];
  let response = null;
  const originalPromptAuth = MsgAuthPrompt.prototype.promptAuth;
  MsgAuthPrompt.prototype.promptAuth = function (channel, level, authInfo, label, save) {
    prompts.push({
      host: channel.URI.host,
      username: authInfo.username,
      hasPassword: !!authInfo.password,
    });
    if (!response) {
      return false;
    }
    authInfo.username = response.username ?? authInfo.username;
    authInfo.password = response.password;
    save.value = response.save;
    return true;
  };
  registerCleanupFunction(() => {
    MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  });

  // As set up for SRV records pointing to the same site and to other sites.
  const session = new CalDavDetectionSession(USERNAME, PASSWORD, false);
  session.passwordSites.add("https://example.org");
  session.promptSites.add("https://example.org");
  session.promptSites.add("https://example.com");
  session.promptSites.add("https://example.net");
  session.promptSites.add("https://example.info");

  Assert.equal(
    promptAuth(session, "https://dav.example.org/"),
    PASSWORD,
    "the password should be used for an SRV target on the same site"
  );
  Assert.deepEqual(prompts, [], "the user should not be asked for an SRV target on the same site");

  Assert.equal(
    promptAuth(session, "https://dav.example.com/"),
    null,
    "nothing should be used for an SRV target on another site if the user declines"
  );
  Assert.equal(
    promptAuth(session, "https://dav.example.com/principal/"),
    null,
    "nothing should be used for the declined site later"
  );
  Assert.ok(session.declinedSites.has("https://example.com"), "the site should be declined");
  Assert.deepEqual(
    prompts,
    [{ host: "dav.example.com", username: USERNAME, hasPassword: false }],
    "the user should be asked once, without the password filled in"
  );

  prompts.length = 0;
  response = { password: "entered", save: true };
  Assert.equal(
    promptAuth(session, "https://dav.example.net/"),
    "entered",
    "the entered password should be used for an SRV target on another site"
  );
  Assert.equal(
    promptAuth(session, "https://dav.example.net/principal/"),
    "entered",
    "the entered password should be used again for the same site"
  );
  Assert.equal(
    promptAuth(session, "https://caldav.example.net/"),
    "entered",
    "the entered password should be used for another server on the same site"
  );
  Assert.equal(prompts.length, 1, "the user should be asked once for the site");
  await TestUtils.waitForCondition(
    async () =>
      (await Services.logins.searchLoginsAsync({ origin: "https://dav.example.net" })).length,
    "the entered password should be saved"
  );
  await TestUtils.waitForCondition(
    async () =>
      (await Services.logins.searchLoginsAsync({ origin: "https://caldav.example.net" })).length,
    "the entered password should be saved for the other server too"
  );

  response = { password: "retyped", save: false };
  Assert.equal(
    promptAuth(
      session,
      "https://dav.example.net/principal/",
      Ci.nsIAuthInformation.PREVIOUS_FAILED
    ),
    "retyped",
    "the password entered again should be used when the entered password failed"
  );
  Assert.equal(prompts.length, 2, "the user should be asked again after a failed password");
  await TestUtils.waitForCondition(
    async () =>
      !(await Services.logins.searchLoginsAsync({ origin: "https://dav.example.net" })).length,
    "the failed password should no longer be saved"
  );

  response = null;
  Assert.equal(
    promptAuth(
      session,
      "https://dav.example.net/principal/",
      Ci.nsIAuthInformation.PREVIOUS_FAILED
    ),
    null,
    "nothing should be used if the user declines after a failed password"
  );
  Assert.equal(
    promptAuth(session, "https://dav.example.net/"),
    null,
    "nothing should be used for the site after declining"
  );
  Assert.equal(prompts.length, 3, "the user should not be asked again after declining");

  prompts.length = 0;
  const saved = [];
  const originalSave = cal.auth.passwordManagerSave;
  cal.auth.passwordManagerSave = (username, password, origin) => saved.push(origin);
  response = { username: "other", password: "entered", save: true };
  Assert.equal(
    promptAuth(session, "https://dav.example.info/"),
    "entered",
    "the entered password should be used with a changed username"
  );
  cal.auth.passwordManagerSave = originalSave;
  Assert.equal(prompts.length, 1, "the user should be asked for the site");
  Assert.deepEqual(saved, [], "a login for a changed username should not be saved");

  prompts.length = 0;
  Assert.equal(
    promptAuth(session, "https://example.edu/"),
    null,
    "nothing should be used for an unrelated site"
  );
  Assert.deepEqual(prompts, [], "the user should not be asked for an unrelated site");

  MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  await Services.logins.removeAllLoginsAsync();
});
