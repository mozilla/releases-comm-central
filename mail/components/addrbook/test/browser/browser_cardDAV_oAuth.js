/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Creates address books in various configurations (current and legacy) and
// performs requests in each of them to prove that OAuth2 authentication is
// working as expected.

var { CardDAVDirectory } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVDirectory.sys.mjs"
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

const PATH = "comm/mail/components/addrbook/test/browser/data/";
const URL = `http://mochi.test:8888/browser/${PATH}`;

let oAuth2Server;

add_setup(async function () {
  oAuth2Server = await OAuth2TestUtils.startServer();
});

/**
 * Set a string pref for the given directory.
 *
 * @param {string} dirPrefId
 * @param {string} key
 * @param {string} value
 */
function setPref(dirPrefId, key, value) {
  Services.prefs.setStringPref(`ldap_2.servers.${dirPrefId}.${key}`, value);
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
    [
      {
        expectedHint,
        expectedScope: SCOPE,
        username: USERNAME,
        password: PASSWORD,
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );
}

/**
 * Create a directory with the given id, perform a request, and check that the
 * correct authorisation header was used. If the user is required to
 * re-authenticate with the provider, check that the new token is stored in the
 * right place.
 *
 * @param {string} dirPrefId - Pref ID of the new directory.
 * @param {string} uid - UID of the new directory.
 * @param {object} [newTokenDetails] - If given, re-authentication must happen.
 * @param {string} [newTokenDetails.username] - The new token must be stored
 *   with this user name.
 */
async function subtest(dirPrefId, uid, newTokenDetails) {
  const directory = new CardDAVDirectory();
  directory._dirPrefId = dirPrefId;
  directory._uid = uid;
  directory.__prefBranch = Services.prefs.getBranch(
    `ldap_2.servers.${dirPrefId}.`
  );
  directory.__prefBranch.setStringPref("carddav.url", URL);

  const dialogPromise = newTokenDetails
    ? handleOAuthDialog(newTokenDetails.username)
    : Promise.resolve();
  const response = await directory._makeRequest("auth_headers.sjs");
  await dialogPromise;
  Assert.equal(response.status, 200);
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
  oAuth2Server.grantedScope = null;
}

// Test making a request when there is no matching token stored.

/** No token stored, no username set. */
add_task(async function testAddressBookOAuth_uid_none() {
  const dirPrefId = "uid_none";
  const uid = "testAddressBookOAuth_uid_none";
  await subtest(dirPrefId, uid, { username: uid });
  checkAndClearLogins([{ ...defaultLogin, username: uid }]);
});

// Test making a request when there IS a matching token, but the server rejects
// it. A new token is requested on failure.

/** Expired token stored with UID. */
add_task(async function testAddressBookOAuth_uid_expired() {
  const dirPrefId = "uid_expired";
  const uid = "testAddressBookOAuth_uid_expired";
  const logins = [
    { ...defaultLogin, username: uid, password: "expired_token" },
  ];
  await setLogins(logins);
  await subtest(dirPrefId, uid, { username: uid });
  logins[0].password = VALID_TOKEN;
  checkAndClearLogins(logins);
});

// Test making a request with a valid token.

/** Valid token stored with UID. This is the old way of storing the token. */
add_task(async function testAddressBookOAuth_uid_valid() {
  const dirPrefId = "uid_valid";
  const uid = "testAddressBookOAuth_uid_valid";
  const logins = [{ ...defaultLogin, username: uid }];
  await setLogins(logins);
  await subtest(dirPrefId, uid);
  checkAndClearLogins(logins);
});

/** Valid token stored with username, exact scope. */
add_task(async function testAddressBookOAuth_username_validSingle() {
  const dirPrefId = "username_validSingle";
  const uid = "testAddressBookOAuth_username_validSingle";
  const logins = [
    { ...defaultLogin },
    { ...defaultLogin, scope: "other_scope", password: "other_refresh_token" },
  ];
  setPref(dirPrefId, "carddav.username", USERNAME);
  await setLogins(logins);
  await subtest(dirPrefId, uid);
  checkAndClearLogins(logins);
});

/** Valid token stored with username, many scopes. */
add_task(async function testAddressBookOAuth_username_validMultiple() {
  const dirPrefId = "username_validMultiple";
  const uid = "testAddressBookOAuth_username_validMultiple";
  const logins = [{ ...defaultLogin, scope: "scope test_scope other_scope" }];
  setPref(dirPrefId, "carddav.username", USERNAME);
  await setLogins(logins);
  await subtest(dirPrefId, uid);
  checkAndClearLogins(logins);
});
