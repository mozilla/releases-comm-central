/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Creates calendars in various configurations (current and legacy) and performs
// requests in each of them to prove that OAuth2 authentication is working as expected.

var { CalDavCalendar } = ChromeUtils.importESModule("resource:///modules/CalDavCalendar.sys.mjs");
var { CalDavGenericRequest } = ChromeUtils.import("resource:///modules/caldav/CalDavRequest.jsm");

var LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  Ci.nsILoginInfo,
  "init"
);

// Ideal login info. This is what would be saved if you created a new calendar.
const ORIGIN = "oauth://mochi.test";
const SCOPE = "test_scope";
const USERNAME = "bob@test.invalid";
const VALID_TOKEN = "bobs_refresh_token";

const GOOGLE_SCOPE = "Google CalDAV v2";

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
 * Clear any existing saved logins and add the given ones.
 *
 * @param {string[][]} - Zero or more arrays consisting of origin, realm, username, and password.
 */
async function setLogins(...logins) {
  Services.logins.removeAllLogins();
  for (const [origin, realm, username, password] of logins) {
    await Services.logins.addLoginAsync(
      new LoginInfo(origin, null, realm, username, password, "", "")
    );
  }
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
  const response = await request.commit();
  const headers = JSON.parse(response.text);

  if (newTokenDetails) {
    Assert.equal(headers.authorization, "Bearer new_access_token");
    const logins = Services.logins
      .findLogins(newTokenDetails.origin ?? ORIGIN, null, newTokenDetails.scope ?? SCOPE)
      .filter(l => l.username == newTokenDetails.username);
    Assert.equal(logins.length, 1);
    Assert.equal(logins[0].username, newTokenDetails.username);
    Assert.equal(logins[0].password, "new_refresh_token");
  } else {
    Assert.equal(headers.authorization, "Bearer bobs_access_token");
  }

  Services.logins.removeAllLogins();
}

// Test making a request when there is no matching token stored.

/** No token stored, no username or session ID set. */
add_task(function testCalendarOAuth_id_none() {
  const calendarId = "testCalendarOAuth_id_none";
  return subtest(calendarId, { username: calendarId });
});

/** No token stored, session ID set. */
add_task(function testCalendarOAuth_sessionId_none() {
  const calendarId = "testCalendarOAuth_sessionId_none";
  setPref(calendarId, "sessionId", "test_session");
  return subtest(calendarId, { username: "test_session" });
});

/** No token stored, username set. */
add_task(function testCalendarOAuth_username_none() {
  const calendarId = "testCalendarOAuth_username_none";
  setPref(calendarId, "username", USERNAME);
  return subtest(calendarId, { username: USERNAME });
});

// Test making a request when there IS a matching token, but the server rejects it.
// A new token is requested on failure.

/** Expired token stored with calendar ID. */
add_task(async function testCalendarOAuth_id_expired() {
  const calendarId = "testCalendarOAuth_id_expired";
  await setLogins([`oauth:${calendarId}`, GOOGLE_SCOPE, calendarId, "expired_token"]);
  await subtest(calendarId, {
    origin: `oauth:${calendarId}`,
    scope: GOOGLE_SCOPE,
    username: calendarId,
  });
});

/** Expired token stored with session ID. */
add_task(async function testCalendarOAuth_sessionId_expired() {
  const calendarId = "testCalendarOAuth_sessionId_expired";
  setPref(calendarId, "sessionId", "test_session");
  await setLogins(["oauth:test_session", GOOGLE_SCOPE, "test_session", "expired_token"]);
  await subtest(calendarId, {
    origin: "oauth:test_session",
    scope: GOOGLE_SCOPE,
    username: "test_session",
  });
});

/** Expired token stored with calendar ID, username set. */
add_task(async function testCalendarOAuth_username_expired() {
  const calendarId = "testCalendarOAuth_username_expired";
  setPref(calendarId, "username", USERNAME);
  await setLogins([`oauth:${calendarId}`, GOOGLE_SCOPE, calendarId, "expired_token"]);
  await subtest(calendarId, { username: USERNAME });
});

// Test making a request with a valid token, using Lightning's client ID and secret.

/** Valid token stored with calendar ID. */
add_task(async function testCalendarOAuth_id_valid() {
  const calendarId = "testCalendarOAuth_id_valid";
  await setLogins([`oauth:${calendarId}`, GOOGLE_SCOPE, calendarId, VALID_TOKEN]);
  await subtest(calendarId);
});

/** Valid token stored with session ID. */
add_task(async function testCalendarOAuth_sessionId_valid() {
  const calendarId = "testCalendarOAuth_sessionId_valid";
  setPref(calendarId, "sessionId", "test_session");
  await setLogins(["oauth:test_session", GOOGLE_SCOPE, "test_session", VALID_TOKEN]);
  await subtest(calendarId);
});

/** Valid token stored with calendar ID, username set. */
add_task(async function testCalendarOAuth_username_valid() {
  const calendarId = "testCalendarOAuth_username_valid";
  setPref(calendarId, "username", USERNAME);
  await setLogins([`oauth:${calendarId}`, GOOGLE_SCOPE, calendarId, VALID_TOKEN]);
  await subtest(calendarId, { username: USERNAME });
});

// Test making a request with a valid token, using Thunderbird's client ID and secret.

/** Valid token stored with calendar ID. */
add_task(async function testCalendarOAuthTB_id_valid() {
  const calendarId = "testCalendarOAuthTB_id_valid";
  await setLogins([ORIGIN, SCOPE, calendarId, VALID_TOKEN]);
  await subtest(calendarId);
});

/** Valid token stored with session ID. */
add_task(async function testCalendarOAuthTB_sessionId_valid() {
  const calendarId = "testCalendarOAuthTB_sessionId_valid";
  setPref(calendarId, "sessionId", "test_session");
  await setLogins([ORIGIN, SCOPE, "test_session", VALID_TOKEN]);
  await subtest(calendarId);
});

/** Valid token stored with calendar ID, username set. */
add_task(async function testCalendarOAuthTB_username_valid() {
  const calendarId = "testCalendarOAuthTB_username_valid";
  setPref(calendarId, "username", USERNAME);
  await setLogins([ORIGIN, SCOPE, calendarId, VALID_TOKEN]);
  await subtest(calendarId, { username: USERNAME });
});

/** Valid token stored with username, exact scope. */
add_task(async function testCalendarOAuthTB_username_validSingle() {
  const calendarId = "testCalendarOAuthTB_username_validSingle";
  setPref(calendarId, "username", USERNAME);
  await setLogins(
    [ORIGIN, SCOPE, USERNAME, VALID_TOKEN],
    [ORIGIN, "other_scope", USERNAME, "other_refresh_token"]
  );
  await subtest(calendarId);
});

/** Valid token stored with username, many scopes. */
add_task(async function testCalendarOAuthTB_username_validMultiple() {
  const calendarId = "testCalendarOAuthTB_username_validMultiple";
  setPref(calendarId, "username", USERNAME);
  await setLogins([ORIGIN, "scope test_scope other_scope", USERNAME, VALID_TOKEN]);
  await subtest(calendarId);
});
