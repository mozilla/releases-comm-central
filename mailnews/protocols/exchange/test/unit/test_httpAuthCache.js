/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const authManager = Cc["@mozilla.org/network/http-auth-manager;1"].getService(
  Ci.nsIHttpAuthManager
);
const authCache = Cc["@mozilla.org/network/http-auth-cache;1"].getService(
  Ci.nsIHttpAuthCache
);

/** @type {EwsServer} */
var ewsServer;

/** @type {nsIMsgIncomingServer} */
var incomingServer;

const USERNAME = "user";
const PASSWORD = "password";

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({
    username: USERNAME,
    password: PASSWORD,
  });

  incomingServer.authMethod = Ci.nsMsgAuthMethod.NTLM;

  // The password stored in the cache entry is read from the login manager
  // rather than from the server's in-memory copy, so we need an actual login.
  await storeLoginInfo();

  // Make sure the auth cache is initially empty.
  Assert.equal(
    authCache.getEntries().length,
    0,
    "the auth cache should have no entry"
  );

  // Instantiating the protocol client is what registers the server's
  // credentials with Necko.
  incomingServer.getProtocolClient();

  // Ensure we have our initial cache entry now.
  checkAuthCache({ realm: "", domain: "", user: USERNAME, password: PASSWORD });

  registerCleanupFunction(async () => {
    await Services.logins.removeAllLoginsAsync();
    authManager.clearAll();
  });
});

/**
 * Tests that the authentication cache is properly updated when changing the
 * server's auth method.
 */
add_task(async function test_change_auth_method() {
  // OAuth2 is an auth method we do not, and probably won't ever delegate to
  // Necko.
  incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  Assert.equal(
    authCache.getEntries().length,
    0,
    "the auth cache should have no entry"
  );

  incomingServer.authMethod = Ci.nsMsgAuthMethod.NTLM;
  checkAuthCache({ realm: "", domain: "", user: USERNAME, password: PASSWORD });
});

/**
 * Tests that the authentication cache is properly updated when changing the
 * server's URL.
 */
add_task(async function test_change_url() {
  const oldUrl = incomingServer.getStringValue("ews_url");

  // Set a different EWS URL.
  const newHostname = "foo.invalid";
  const newPort = "42424";
  const newUrl = `http://${newHostname}:${newPort}/EWS/Exchange.asmx`;

  incomingServer.setStringValue("ews_url", newUrl);

  // Check that there's a cache entry matching the new URL. Unlike other places,
  // we do this with `nsIHttpAuthManager::GetAuthIdentity` because that's the
  // only way to make sure the new cache entry matches the URL's settings.
  const domain = { value: "" };
  const user = { value: "" };
  const password = { value: "" };

  authManager.getAuthIdentity(
    "http",
    newHostname,
    newPort,
    "ntlm",
    "",
    "",
    domain,
    user,
    password
  );

  Assert.strictEqual(domain.value, "");
  Assert.strictEqual(user.value, USERNAME);
  Assert.strictEqual(password.value, PASSWORD);

  // Also check that there isn't any other entry in the cache.
  Assert.equal(
    authCache.getEntries().length,
    1,
    "the auth cache should have exactly one entry"
  );

  // Reset the old URL to avoid side-effects with other tests.
  incomingServer.setStringValue("ews_url", oldUrl);
});

/**
 * Tests that the authentication cache is properly updated when changing the
 * server's authentication realm.
 */
add_task(async function test_change_realm() {
  checkAuthCache({ realm: "", domain: "", user: USERNAME, password: PASSWORD });

  incomingServer.setStringValue("realm", "foo");
  checkAuthCache({
    realm: "foo",
    domain: "",
    user: USERNAME,
    password: PASSWORD,
  });

  // Reset the realm to avoid future side-effects.
  incomingServer.setStringValue("realm", "");
});

/**
 * Tests that the authentication cache is properly updated when changing the
 * server's username.
 */
add_task(async function test_change_username() {
  const newUsername = "someoneElse";
  incomingServer.username = newUsername;

  // Re-store the server login info, because `nsMsgIncomingServer` removes it
  // when updating the username (presumably so that the user is prompted to
  // authenticate again from scratch).
  await storeLoginInfo();

  checkAuthCache({
    realm: "",
    domain: "",
    user: newUsername,
    password: PASSWORD,
  });

  // Also check that we correctly derive NTLM domains from usernames while we're
  // here.
  const domain = "someDomain";
  incomingServer.username = `${domain}\\${newUsername}`;
  await storeLoginInfo();
  checkAuthCache({ realm: "", domain, user: newUsername, password: PASSWORD });

  // Reset the server's username
  incomingServer.username = USERNAME;
  await storeLoginInfo();
  checkAuthCache({ realm: "", domain: "", user: USERNAME, password: PASSWORD });
});

/**
 * Tests that the authentication cache is properly updated when changing the
 * server's password.
 */
add_task(async function test_change_password() {
  await modifyLoginAndCheck(USERNAME, "newPassword");

  // Reset the login as it was in the logins manager initially.
  await modifyLoginAndCheck(USERNAME, PASSWORD);
});

function checkAuthCache(expectedEntry) {
  const entries = authCache.getEntries();
  Assert.equal(
    entries.length,
    1,
    "the auth cache should have exactly one entry"
  );

  const entry = entries[0];
  Assert.strictEqual(entry.realm, expectedEntry.realm);
  Assert.equal(entry.domain, expectedEntry.domain);
  Assert.equal(entry.user, expectedEntry.user);
  Assert.equal(entry.password, expectedEntry.password);
}

/**
 * Updates a login in the logins manager with the given username and password,
 * and checks that the authentication cache is updated accordingly.
 *
 * @param {string} username - The username to set in the new login entry.
 * @param {string} password - The password to set in the new login entry.
 */
async function modifyLoginAndCheck(username, password) {
  const loginInfo = await getLoginInfo();

  const newLoginInfo = loginInfo.clone();
  newLoginInfo.username = username;
  newLoginInfo.password = password;
  await Services.logins.modifyLoginAsync(loginInfo, newLoginInfo);

  checkAuthCache({
    realm: "",
    domain: "",
    user: username,
    password,
  });
}

/**
 * Adds the incoming server's current login info to the logins manager.
 */
async function storeLoginInfo() {
  const origin = `ews://${incomingServer.hostname}`;
  const username = incomingServer.username;
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(origin, null, origin, username, PASSWORD, "", "");
  await Services.logins.addLoginAsync(loginInfo);
}

/**
 * Retrieves the logins manager's entry that matches the incoming server.
 *
 * @returns {nsILoginInfo}
 */
async function getLoginInfo() {
  const ourOrigin = `ews://${incomingServer.hostname}`;

  let ourLogin = null;
  for (const login of await Services.logins.getAllLogins()) {
    if (login.origin == ourOrigin) {
      ourLogin = login;
      break;
    }
  }

  Assert.ok(ourLogin, "we should have a matching login");

  return ourLogin;
}
