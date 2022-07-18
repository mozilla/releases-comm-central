/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Creates calendars in various configurations (current and legacy) and performs
// requests in each of them to prove that OAuth2 authentication is working as expected.

var { CalDavCalendar } = ChromeUtils.import("resource:///modules/CalDavCalendar.jsm");
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
function setLogins(...logins) {
  Services.logins.removeAllLogins();
  for (let [origin, realm, username, password] of logins) {
    Services.logins.addLogin(new LoginInfo(origin, null, realm, username, password, "", ""));
  }
}

/**
 * Create a calendar with the given id, perform a request, and check that the correct
 * authorisation header was used. If the user is required to re-authenticate with the provider,
 * check that the new token is stored in the right place.
 *
 * @param {string} calendarId - ID of the new calendar
 * @param {string} [newTokenUsername] - If given, re-authentication must happen and the new token
 *   stored with this user name.
 */
async function subtest(calendarId, newTokenUsername) {
  let calendar = new CalDavCalendar();
  calendar.id = calendarId;

  let request = new CalDavGenericRequest(
    calendar.wrappedJSObject.session,
    calendar,
    "GET",
    Services.io.newURI(
      "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/data/auth_headers.sjs"
    )
  );
  let response = await request.commit();
  let headers = JSON.parse(response.text);

  if (newTokenUsername) {
    Assert.equal(headers.authorization, "Bearer new_access_token");

    let logins = Services.logins
      .findLogins(ORIGIN, null, SCOPE)
      .filter(l => l.username == newTokenUsername);
    Assert.equal(logins.length, 1);
    Assert.equal(logins[0].username, newTokenUsername);
    Assert.equal(logins[0].password, "new_refresh_token");
  } else {
    Assert.equal(headers.authorization, "Bearer bobs_access_token");
  }

  Services.logins.removeAllLogins();
}

// Test making a request when there is no matching token stored.

/** No token stored, no username or session ID set. */
add_task(function testCalendarOAuth_id_none() {
  let calendarId = "testCalendarOAuth_id_none";
  return subtest(calendarId, calendarId);
});

/** No token stored, session ID set. */
add_task(function testCalendarOAuth_sessionId_none() {
  let calendarId = "testCalendarOAuth_sessionId_none";
  setPref(calendarId, "sessionId", "test_session");
  return subtest(calendarId, "test_session");
});

/** No token stored, username set. */
add_task(function testCalendarOAuth_username_none() {
  let calendarId = "testCalendarOAuth_username_none";
  setPref(calendarId, "username", USERNAME);
  return subtest(calendarId, USERNAME);
});

// Test making a request when there IS a matching token, but the server rejects it.
// Currently a new token is not requested on failure.

/** Expired token stored with calendar ID. */
add_task(function testCalendarOAuth_id_expired() {
  let calendarId = "testCalendarOAuth_id_expired";
  setLogins([`oauth:${calendarId}`, "Google CalDAV v2", calendarId, "expired_token"]);
  return subtest(calendarId, calendarId);
}).skip(); // Broken.

/** Expired token stored with session ID. */
add_task(function testCalendarOAuth_sessionId_expired() {
  let calendarId = "testCalendarOAuth_sessionId_expired";
  setPref(calendarId, "sessionId", "test_session");
  setLogins(["oauth:test_session", "Google CalDAV v2", "test_session", "expired_token"]);
  return subtest(calendarId, "test_session");
}).skip(); // Broken.

/** Expired token stored with calendar ID, username set. */
add_task(function testCalendarOAuth_username_expired() {
  let calendarId = "testCalendarOAuth_username_expired";
  setPref(calendarId, "username", USERNAME);
  setLogins([`oauth:${calendarId}`, "Google CalDAV v2", calendarId, "expired_token"]);
  return subtest(calendarId, USERNAME);
}).skip(); // Broken.

// Test making a request with a valid token, using Lightning's client ID and secret.

/** Valid token stored with calendar ID. */
add_task(function testCalendarOAuth_id_valid() {
  let calendarId = "testCalendarOAuth_id_valid";
  setLogins([`oauth:${calendarId}`, "Google CalDAV v2", calendarId, VALID_TOKEN]);
  return subtest(calendarId);
});

/** Valid token stored with session ID. */
add_task(function testCalendarOAuth_sessionId_valid() {
  let calendarId = "testCalendarOAuth_sessionId_valid";
  setPref(calendarId, "sessionId", "test_session");
  setLogins(["oauth:test_session", "Google CalDAV v2", "test_session", VALID_TOKEN]);
  return subtest(calendarId);
});

/** Valid token stored with calendar ID, username set. */
add_task(function testCalendarOAuth_username_valid() {
  let calendarId = "testCalendarOAuth_username_valid";
  setPref(calendarId, "username", USERNAME);
  setLogins([`oauth:${calendarId}`, "Google CalDAV v2", calendarId, VALID_TOKEN]);
  return subtest(calendarId, USERNAME);
});

// Test making a request with a valid token, using Thunderbird's client ID and secret.

/** Valid token stored with calendar ID. */
add_task(function testCalendarOAuthTB_id_valid() {
  let calendarId = "testCalendarOAuthTB_id_valid";
  setLogins([ORIGIN, SCOPE, calendarId, VALID_TOKEN]);
  return subtest(calendarId);
});

/** Valid token stored with session ID. */
add_task(function testCalendarOAuthTB_sessionId_valid() {
  let calendarId = "testCalendarOAuthTB_sessionId_valid";
  setPref(calendarId, "sessionId", "test_session");
  setLogins([ORIGIN, SCOPE, "test_session", VALID_TOKEN]);
  return subtest(calendarId);
});

/** Valid token stored with calendar ID, username set. */
add_task(function testCalendarOAuthTB_username_valid() {
  let calendarId = "testCalendarOAuthTB_username_valid";
  setPref(calendarId, "username", USERNAME);
  setLogins([ORIGIN, SCOPE, calendarId, VALID_TOKEN]);
  return subtest(calendarId, USERNAME);
});

/** Valid token stored with username, exact scope. */
add_task(function testCalendarOAuthTB_username_validSingle() {
  let calendarId = "testCalendarOAuthTB_username_validSingle";
  setPref(calendarId, "username", USERNAME);
  setLogins(
    [ORIGIN, SCOPE, USERNAME, VALID_TOKEN],
    [ORIGIN, "other_scope", USERNAME, "other_refresh_token"]
  );
  return subtest(calendarId);
});

/** Valid token stored with username, many scopes. */
add_task(function testCalendarOAuthTB_username_validMultiple() {
  let calendarId = "testCalendarOAuthTB_username_validMultiple";
  setPref(calendarId, "username", USERNAME);
  setLogins([ORIGIN, "scope test_scope other_scope", USERNAME, VALID_TOKEN]);
  return subtest(calendarId);
});
