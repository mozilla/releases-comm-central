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

async function checkLoginCount(total) {
  Assert.equal(total, await Services.logins.countLoginsAsync("", "", ""));
}

/**
 * Tests the passwordManager{Get,Save,Remove} functions
 */
add_task(async function test_password_manager() {
  await Services.logins.initializationPromise;
  await checkLoginCount(0);

  // Save the password
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);
  await checkLoginCount(1);

  // Save again, should modify the existing login
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);
  await checkLoginCount(1);

  // Retrieve the saved password
  let passout = {};
  let found = await cal.auth.passwordManagerGet(USERNAME, passout, ORIGIN, REALM);
  Assert.equal(passout.value, PASSWORD);
  Assert.ok(found);
  await checkLoginCount(1);

  // Retrieving should still happen with signon saving disabled, but saving should not
  Services.prefs.setBoolPref("signon.rememberSignons", false);
  passout = {};
  found = await cal.auth.passwordManagerGet(USERNAME, passout, ORIGIN, REALM);
  Assert.equal(passout.value, PASSWORD);
  Assert.ok(found);

  await Assert.rejects(
    cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM),
    /NS_ERROR_NOT_AVAILABLE/
  );
  Services.prefs.clearUserPref("signon.rememberSignons");
  await checkLoginCount(1);

  // Remove the password
  found = await cal.auth.passwordManagerRemove(USERNAME, ORIGIN, REALM);
  await checkLoginCount(0);
  Assert.ok(found);

  // Really gone?
  found = await cal.auth.passwordManagerRemove(USERNAME, ORIGIN, REALM);
  await checkLoginCount(0);
  Assert.ok(!found);
});

/**
 * Tests that origins are passed through to the password manager verbatim.
 */
add_task(async function test_password_manager_origins() {
  await Services.logins.initializationPromise;
  await checkLoginCount(0);

  // Saving the same origin twice should modify the existing login.
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "https://example.com", REALM);
  await checkLoginCount(1);
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "https://example.com", REALM);
  await checkLoginCount(1);

  // Distinct origins should each get their own login.
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, "https://example.net", REALM);
  const found = await cal.auth.passwordManagerGet(USERNAME, {}, "https://example.net", REALM);
  Assert.ok(found, "the login saved for example.net should be found");
  await checkLoginCount(2);

  // Cleanup
  await cal.auth.passwordManagerRemove(USERNAME, "https://example.com", REALM);
  await cal.auth.passwordManagerRemove(USERNAME, "https://example.net", REALM);
  await checkLoginCount(0);
});
