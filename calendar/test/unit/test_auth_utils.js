/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const USERNAME = "fred";
const PASSWORD = "********";
const ORIGIN = "https://origin";
const REALM = "realm";

function run_test() {
  do_get_profile();
  run_next_test();
}

function checkLoginCount(total) {
  Assert.equal(total, Services.logins.countLogins("", "", ""));
}

/**
 * Tests the passwordManager{Get,Save,Remove} functions
 */
add_task(async function test_password_manager() {
  await Services.logins.initializationPromise;
  checkLoginCount(0);

  // Save the password
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);
  checkLoginCount(1);

  // Save again, should modify the existing login
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);
  checkLoginCount(1);

  // Retrieve the saved password
  let passout = {};
  let found = cal.auth.passwordManagerGet(USERNAME, passout, ORIGIN, REALM);
  Assert.equal(passout.value, PASSWORD);
  Assert.ok(found);
  checkLoginCount(1);

  // Retrieving should still happen with signon saving disabled, but saving should not
  Services.prefs.setBoolPref("signon.rememberSignons", false);
  passout = {};
  found = cal.auth.passwordManagerGet(USERNAME, passout, ORIGIN, REALM);
  Assert.equal(passout.value, PASSWORD);
  Assert.ok(found);

  await Assert.rejects(
    cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM),
    /NS_ERROR_NOT_AVAILABLE/
  );
  Services.prefs.clearUserPref("signon.rememberSignons");
  checkLoginCount(1);

  // Remove the password
  found = cal.auth.passwordManagerRemove(USERNAME, ORIGIN, REALM);
  checkLoginCount(0);
  Assert.ok(found);

  // Really gone?
  found = cal.auth.passwordManagerRemove(USERNAME, ORIGIN, REALM);
  checkLoginCount(0);
  Assert.ok(!found);
});

/**
 * Tests various origins that can be passed to passwordManagerSave
 */
add_task(async function test_password_manager_origins() {
  await Services.logins.initializationPromise;
  checkLoginCount(0);

  // The scheme of the origin should be normalized to lowercase, this won't add any new passwords
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "OAUTH:xpcshell@example.com", REALM);
  checkLoginCount(1);
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "oauth:xpcshell@example.com", REALM);
  checkLoginCount(1);

  // Make sure that the prePath isn't used for oauth, because that is only the scheme
  let found = cal.auth.passwordManagerGet(USERNAME, {}, "oauth:", REALM);
  Assert.ok(!found);

  // Save a https url with a path (only prePath should be used)
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "https://example.com/withpath", REALM);
  found = cal.auth.passwordManagerGet(USERNAME, {}, "https://example.com", REALM);
  Assert.ok(found);
  checkLoginCount(2);

  // Entering something that is not an URL should assume https
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "example.net", REALM);
  found = cal.auth.passwordManagerGet(USERNAME, {}, "https://example.net", REALM);
  Assert.ok(found);
  checkLoginCount(3);

  // Cleanup
  cal.auth.passwordManagerRemove(USERNAME, "oauth:xpcshell@example.com", REALM);
  cal.auth.passwordManagerRemove(USERNAME, "https://example.com", REALM);
  cal.auth.passwordManagerRemove(USERNAME, "https://example.net", REALM);
  checkLoginCount(0);
});
