/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that CalDAV sessions only send credentials to the servers they are for.

const { CalDavDetectionSession, CalDavSession } = ChromeUtils.importESModule(
  "resource:///modules/caldav/CalDavSession.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

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
 * @returns {?string}
 */
function promptAuth(session, uri) {
  const authInfo = {
    flags: 0,
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
