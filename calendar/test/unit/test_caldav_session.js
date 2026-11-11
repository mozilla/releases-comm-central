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
  registerCleanupFunction(() => {
    cal.auth.passwordManagerSave = originalSave;
  });
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

add_task(async function testDetectionSavedLoginForOtherSite() {
  const prompts = [];
  let response = null;
  const originalPromptAuth = MsgAuthPrompt.prototype.promptAuth;
  MsgAuthPrompt.prototype.promptAuth = function (channel, level, authInfo, label, save) {
    prompts.push(channel.URI.host);
    if (!response) {
      return false;
    }
    authInfo.password = response.password;
    save.value = response.save;
    return true;
  };
  registerCleanupFunction(() => {
    MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  });
  await Services.logins.addLoginAsync(
    new LoginInfo("https://dav.example.com", null, "test", USERNAME, "saved", "", "")
  );
  await Services.logins.addLoginAsync(
    new LoginInfo("https://other.example.com", null, "test", USERNAME, "other", "", "")
  );

  const session = new CalDavDetectionSession(USERNAME, PASSWORD, false);
  session.promptSites.add("https://example.com");
  session.promptSites.add("https://example.net");

  Assert.equal(
    promptAuth(session, "https://dav.example.com/"),
    "saved",
    "the saved password should be used for an SRV target on another site"
  );
  Assert.equal(
    promptAuth(session, "https://other.example.com/"),
    "other",
    "the password saved for another server on the same site should be used for it"
  );
  Assert.deepEqual(prompts, [], "the user should not be asked when a login is saved");

  response = { password: "entered", save: false };
  Assert.equal(
    promptAuth(session, "https://dav.example.com/", Ci.nsIAuthInformation.PREVIOUS_FAILED),
    "entered",
    "the entered password should be used when the saved one failed"
  );
  Assert.deepEqual(
    prompts,
    ["dav.example.com"],
    "the user should be asked when the saved password failed"
  );
  response = null;
  Assert.equal(
    promptAuth(session, "https://dav.example.com/", Ci.nsIAuthInformation.PREVIOUS_FAILED),
    null,
    "nothing should be used if the user declines after a failed password"
  );
  const [login] = await Services.logins.searchLoginsAsync({ origin: "https://dav.example.com" });
  Assert.equal(login?.password, "saved", "a login saved before should not be removed");

  const saved = [];
  const originalSave = cal.auth.passwordManagerSave;
  registerCleanupFunction(() => {
    cal.auth.passwordManagerSave = originalSave;
  });
  cal.auth.passwordManagerSave = async (username, password, origin) => saved.push(origin);
  response = { password: "", save: true };
  Assert.equal(
    promptAuth(session, "https://dav.example.net/"),
    "",
    "an empty entered password should be used"
  );
  cal.auth.passwordManagerSave = originalSave;
  Assert.deepEqual(saved, [], "an empty password should not be saved");

  const otherSession = new CalDavDetectionSession(USERNAME, PASSWORD, false);
  otherSession.promptSites.add("https://example.com");
  promptAuth(otherSession, "https://dav.example.com/");
  prompts.length = 0;
  response = null;
  Assert.equal(
    promptAuth(otherSession, "https://third.example.com/"),
    null,
    "a password saved for one server should not be used for another on the same site"
  );
  Assert.deepEqual(prompts, ["third.example.com"], "the user should be asked for the other server");

  MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  await Services.logins.removeAllLoginsAsync();
});

add_task(async function testDetectionLoginChangesInOrder() {
  const changes = [];
  let response = { password: "first", save: true };
  const originalPromptAuth = MsgAuthPrompt.prototype.promptAuth;
  const originalSave = cal.auth.passwordManagerSave;
  const originalRemove = cal.auth.passwordManagerRemove;
  MsgAuthPrompt.prototype.promptAuth = function (channel, level, authInfo, label, save) {
    authInfo.password = response.password;
    save.value = response.save;
    return true;
  };
  // The first save takes longer, so a removal waiting only for it would run
  // after the second save.
  cal.auth.passwordManagerSave = async (username, password) => {
    if (password == "first") {
      await new Promise(resolve => do_timeout(100, resolve));
    }
    changes.push(`save ${password}`);
  };
  cal.auth.passwordManagerRemove = async () => changes.push("remove");
  registerCleanupFunction(() => {
    MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
    cal.auth.passwordManagerSave = originalSave;
    cal.auth.passwordManagerRemove = originalRemove;
  });

  const session = new CalDavDetectionSession(USERNAME, PASSWORD, false);
  session.promptSites.add("https://example.net");

  Assert.equal(
    promptAuth(session, "https://dav.example.net/"),
    "first",
    "the first entered password should be used"
  );
  response = { password: "second", save: true };
  Assert.equal(
    promptAuth(session, "https://dav.example.net/", Ci.nsIAuthInformation.PREVIOUS_FAILED),
    "second",
    "the password entered after the first failed should be used"
  );
  await TestUtils.waitForCondition(() => changes.length == 3, "waiting for the login changes");
  Assert.deepEqual(
    changes,
    ["save first", "remove", "save second"],
    "the failed login should be removed before the new one is saved"
  );

  changes.length = 0;
  const savingSession = new CalDavDetectionSession(USERNAME, "first", true);
  savingSession.passwordSites.add("https://example.org");
  Assert.equal(
    promptAuth(savingSession, "https://dav.example.org/"),
    "first",
    "the password should be used for its site"
  );
  Assert.equal(
    promptAuth(savingSession, "https://dav.example.org/", Ci.nsIAuthInformation.PREVIOUS_FAILED),
    null,
    "nothing should be used when the password failed"
  );
  await TestUtils.waitForCondition(() => changes.length == 2, "waiting for the login changes");
  Assert.deepEqual(
    changes,
    ["save first", "remove"],
    "the failed login should be removed after it was saved"
  );

  MsgAuthPrompt.prototype.promptAuth = originalPromptAuth;
  cal.auth.passwordManagerSave = originalSave;
  cal.auth.passwordManagerRemove = originalRemove;
});
