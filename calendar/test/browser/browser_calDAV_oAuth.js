/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Creates calendars in various configurations (current and legacy) and performs
// requests in each of them to prove that OAuth2 authentication is working as expected.

var { CalDavCalendar } = ChromeUtils.importESModule("resource:///modules/CalDavCalendar.sys.mjs");
var { CalDavGenericRequest } = ChromeUtils.importESModule(
  "resource:///modules/caldav/CalDavRequest.sys.mjs"
);
var { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);

var LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

// Ideal login info. This is what would be saved if you created a new calendar.
const ORIGIN = "oauth://test.test";
const SCOPE = "test_scope";
const USERNAME = "user";
const PASSWORD = "password";
const VALID_TOKEN = "refresh_token";

const defaultLogin = {
  origin: ORIGIN,
  scope: SCOPE,
  username: USERNAME,
  password: VALID_TOKEN,
};

const GOOGLE_SCOPE = "Google CalDAV v2";
const googleLogin = { ...defaultLogin, scope: GOOGLE_SCOPE };

add_setup(async function () {
  Services.logins.removeAllLogins();
  await OAuth2TestUtils.startServer();
});

/**
 * Set a string pref for the given calendar.
 *
 * @param {string} calendarId
 * @param {string} key
 * @param {string} value
 */
function setPref(calendarId, key, value) {
  Services.prefs.setStringPref(`calendar.registry.${calendarId}.${key}`, value);
}

/**
 * @typedef {LoginData}
 * @property {string} origin
 * @property {string} scope
 * @property {string} username
 * @property {string} password
 */

/**
 * Clear any existing saved logins and add the given ones.
 *
 * @param {LoginData[]} logins - Zero or more login data objects.
 */
async function setLogins(logins) {
  Services.logins.removeAllLogins();
  for (const { origin, scope, username, password } of logins) {
    await Services.logins.addLoginAsync(
      new LoginInfo(origin, null, scope, username, password, "", "")
    );
  }
}

/**
 * Wait for a login prompt window to appear, and submit it.
 *
 * @param {string} expectedHint - Expected value of the login_hint URL param.
 */
async function handleOAuthDialog(expectedHint) {
  const oAuthWindow = await OAuth2TestUtils.promiseOAuthWindow();
  info("oauth2 window shown");
  await SpecialPowers.spawn(
    oAuthWindow.getBrowser(),
    [{ expectedHint, expectedScope: SCOPE, username: USERNAME, password: PASSWORD }],
    OAuth2TestUtils.submitOAuthLogin
  );
}

/**
 * Create a calendar with the given id, perform a request, and check that the correct
 * authorisation header was used. If the user is required to re-authenticate with the provider,
 * check that the new token is stored in the right place.
 *
 * @param {string} calendarId - ID of the new calendar
 * @param {object} [newTokenDetails] - If given, re-authentication must happen.
 * @param {string} [newTokenDetails.username] - The new token must be stored with this user name.
 */
async function subtest(calendarId, newTokenDetails) {
  const calendar = new CalDavCalendar();
  calendar.id = calendarId;

  const request = new CalDavGenericRequest(
    calendar.wrappedJSObject.session,
    calendar,
    "GET",
    Services.io.newURI(
      "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/data/auth_headers.sjs"
    )
  );
  const dialogPromise = newTokenDetails
    ? handleOAuthDialog(newTokenDetails.username)
    : Promise.resolve();
  const response = await request.commit();
  await dialogPromise;
  const headers = JSON.parse(response.text);

  Assert.equal(headers.authorization, "Bearer access_token");
}

/**
 * Checks that the saved logins are as expected, and then clears all saved logins.
 *
 * @param {LoginData[]} expectedLogins - Zero or more login data objects.
 */
function checkAndClearLogins(expectedLogins) {
  const logins = Services.logins.findLogins("", null, "");
  Assert.equal(logins.length, expectedLogins.length);
  for (let i = 0; i < logins.length; i++) {
    Assert.equal(logins[i].origin, expectedLogins[i].origin);
    Assert.equal(logins[i].httpRealm, expectedLogins[i].scope);
    Assert.equal(logins[i].username, expectedLogins[i].username);
    Assert.equal(logins[i].password, expectedLogins[i].password);
  }

  Services.logins.removeAllLogins();
  OAuth2TestUtils.forgetObjects();
}

// Test making a request when there is no matching token stored.

/** No token stored, no username or session ID set. */
add_task(async function testCalendarOAuth_id_none() {
  const calendarId = "testCalendarOAuth_id_none";
  await subtest(calendarId, {});
  checkAndClearLogins([{ ...defaultLogin, username: calendarId }]);
});

/** No token stored, session ID set. */
add_task(async function testCalendarOAuth_sessionId_none() {
  const calendarId = "testCalendarOAuth_sessionId_none";
  setPref(calendarId, "sessionId", "test_session");
  await subtest(calendarId, {});
  checkAndClearLogins([{ ...defaultLogin, username: "test_session" }]);
});

/** No token stored, username set. */
add_task(async function testCalendarOAuth_username_none() {
  const calendarId = "testCalendarOAuth_username_none";
  setPref(calendarId, "username", USERNAME);
  await subtest(calendarId, { username: USERNAME });
  checkAndClearLogins([defaultLogin]);
});

// Test making a request when there IS a matching token, but the server rejects it.
// A new token is requested on failure.

/** Expired token stored with calendar ID. */
add_task(async function testCalendarOAuth_id_expired() {
  const calendarId = "testCalendarOAuth_id_expired";
  const logins = [
    {
      ...googleLogin,
      origin: `oauth:${calendarId}`,
      username: calendarId,
      password: "expired_token",
    },
  ];
  await setLogins(logins);
  await subtest(calendarId, {});
  logins[0].password = VALID_TOKEN;
  checkAndClearLogins(logins);
});

/** Expired token stored with session ID. */
add_task(async function testCalendarOAuth_sessionId_expired() {
  const calendarId = "testCalendarOAuth_sessionId_expired";
  const logins = [
    {
      ...googleLogin,
      origin: "oauth:test_session",
      username: "test_session",
      password: "expired_token",
    },
  ];
  setPref(calendarId, "sessionId", "test_session");
  await setLogins(logins);
  await subtest(calendarId, {});
  logins[0].password = VALID_TOKEN;
  checkAndClearLogins(logins);
});

/** Expired token stored with calendar ID, username set. */
add_task(async function testCalendarOAuth_username_expired() {
  const calendarId = "testCalendarOAuth_username_expired";
  const logins = [
    {
      ...googleLogin,
      origin: `oauth:${calendarId}`,
      username: calendarId,
      password: "expired_token",
    },
  ];
  setPref(calendarId, "username", USERNAME);
  await setLogins(logins);
  await subtest(calendarId, { username: USERNAME });
  checkAndClearLogins([logins[0], defaultLogin]);
});

// Test making a request with a valid token, using Lightning's client ID and secret.

/** Valid token stored with calendar ID. */
add_task(async function testCalendarOAuth_id_valid() {
  const calendarId = "testCalendarOAuth_id_valid";
  const logins = [{ ...googleLogin, origin: `oauth:${calendarId}`, username: calendarId }];
  await setLogins(logins);
  await subtest(calendarId);
  checkAndClearLogins(logins);
});

/** Valid token stored with session ID. */
add_task(async function testCalendarOAuth_sessionId_valid() {
  const calendarId = "testCalendarOAuth_sessionId_valid";
  const logins = [{ ...googleLogin, origin: "oauth:test_session", username: "test_session" }];
  setPref(calendarId, "sessionId", "test_session");
  await setLogins(logins);
  await subtest(calendarId);
  checkAndClearLogins(logins);
});

/** Valid token stored with calendar ID, username set. */
add_task(async function testCalendarOAuth_username_valid() {
  const calendarId = "testCalendarOAuth_username_valid";
  const logins = [{ ...googleLogin, origin: `oauth:${calendarId}`, username: calendarId }];
  setPref(calendarId, "username", USERNAME);
  await setLogins(logins);
  await subtest(calendarId, { username: USERNAME });
  checkAndClearLogins([logins[0], defaultLogin]);
});

// Test making a request with a valid token, using Thunderbird's client ID and secret.

/** Valid token stored with calendar ID. */
add_task(async function testCalendarOAuthTB_id_valid() {
  const calendarId = "testCalendarOAuthTB_id_valid";
  const logins = [{ ...defaultLogin, username: calendarId }];
  await setLogins(logins);
  await subtest(calendarId);
  checkAndClearLogins(logins);
});

/** Valid token stored with session ID. */
add_task(async function testCalendarOAuthTB_sessionId_valid() {
  const calendarId = "testCalendarOAuthTB_sessionId_valid";
  const logins = [{ ...defaultLogin, username: "test_session" }];
  setPref(calendarId, "sessionId", "test_session");
  await setLogins(logins);
  await subtest(calendarId);
  checkAndClearLogins(logins);
});

/** Valid token stored with calendar ID, username set. */
add_task(async function testCalendarOAuthTB_username_valid() {
  const calendarId = "testCalendarOAuthTB_username_valid";
  const logins = [{ ...defaultLogin, username: calendarId }];
  setPref(calendarId, "username", USERNAME);
  await setLogins(logins);
  await subtest(calendarId, { username: USERNAME });
  checkAndClearLogins([logins[0], defaultLogin]);
});

/** Valid token stored with username, exact scope. */
add_task(async function testCalendarOAuthTB_username_validSingle() {
  const calendarId = "testCalendarOAuthTB_username_validSingle";
  const logins = [
    { ...defaultLogin },
    { ...defaultLogin, scope: "other_scope", password: "other_refresh_token" },
  ];
  setPref(calendarId, "username", USERNAME);
  await setLogins(logins);
  await subtest(calendarId);
  checkAndClearLogins(logins);
});

/** Valid token stored with username, many scopes. */
add_task(async function testCalendarOAuthTB_username_validMultiple() {
  const calendarId = "testCalendarOAuthTB_username_validMultiple";
  const logins = [{ ...defaultLogin, scope: "scope test_scope other_scope" }];
  setPref(calendarId, "username", USERNAME);
  await setLogins(logins);
  await subtest(calendarId);
  checkAndClearLogins(logins);
});
