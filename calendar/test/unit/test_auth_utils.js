/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const USERNAME = "fred";
const PASSWORD = "********";
const NEW_PASSWORD = "########";
const ORIGIN = "https://origin";
const REALM = "realm";
const AUTH_HOST = Ci.nsIAuthInformation.AUTH_HOST;
const PREVIOUS_FAILED = Ci.nsIAuthInformation.PREVIOUS_FAILED;

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

/**
 * Creates a channel stub good enough for cal.auth.Prompt.
 *
 * @param {integer} [userContextId] - The container the request runs in.
 * @returns {nsIChannel}
 */
function makeChannel(userContextId) {
  return {
    URI: Services.io.newURI(ORIGIN),
    loadInfo: { originAttributes: { userContextId } },
  };
}

/**
 * Mimics an authentication retry, which redirects to a new channel but keeps
 * the load info of the request it retries.
 *
 * @param {nsIChannel} channel - The channel the server challenged.
 * @returns {nsIChannel}
 */
function retryOf(channel) {
  return { URI: channel.URI, loadInfo: channel.loadInfo };
}

/**
 * Runs cal.auth.Prompt.asyncPromptAuth and waits for the callback.
 *
 * @param {object} prompt - A cal.auth.Prompt instance.
 * @param {nsIAuthInformation} authInfo
 * @param {nsIChannel} [channel]
 * @returns {Promise<boolean>} Whether credentials were made available.
 */
function promptAuth(prompt, authInfo, channel = makeChannel()) {
  return new Promise(resolve => {
    prompt.asyncPromptAuth(
      channel,
      {
        onAuthAvailable: () => resolve(true),
        onAuthCancelled: () => resolve(false),
      },
      null,
      0,
      authInfo
    );
  });
}

/**
 * Creates a cal.auth.Prompt that counts dialogs instead of showing them.
 *
 * @param {boolean} [entered] - Whether the user enters NEW_PASSWORD or cancels.
 * @returns {object} The prompt, with an `asked` counter on it.
 */
function makePrompt(entered = false) {
  const prompt = new cal.auth.Prompt();
  prompt.asked = 0;
  prompt._promptAuthInternal = (channel, level, authInfo) => {
    prompt.asked++;
    if (entered) {
      authInfo.username = USERNAME;
      authInfo.password = NEW_PASSWORD;
    }
    return entered;
  };
  return prompt;
}

/** Empties the login manager, so one failing test cannot fail the next. */
async function resetLogins() {
  await Services.logins.removeAllLoginsAsync();
  await checkLoginCount(0);
}

add_setup(async function () {
  await Services.logins.initializationPromise;

  // xpcshell has no calendar window for the prompt to queue its dialog on.
  const getCalendarWindow = cal.window.getCalendarWindow;
  cal.window.getCalendarWindow = () => ({ document: { readyState: "complete" } });

  registerCleanupFunction(async () => {
    cal.window.getCalendarWindow = getCalendarWindow;
    await Services.logins.removeAllLoginsAsync();
  });
});

/** Concurrent challenges say nothing about the login, so it must survive. */
add_task(async function test_prompt_keeps_a_login_that_was_not_rejected() {
  await resetLogins();
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);

  const prompt = makePrompt();

  for (const attempt of ["first", "second", "third"]) {
    const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
    Assert.ok(await promptAuth(prompt, authInfo), `the ${attempt} challenge should be answered`);
    Assert.equal(authInfo.password, PASSWORD, `the ${attempt} challenge should get the password`);
  }
  Assert.equal(prompt.asked, 0, "the user should not be asked while the saved login works");
  await checkLoginCount(1);
});

/** A rejected password is dropped and the user is asked. */
add_task(async function test_prompt_asks_after_a_rejected_login() {
  await resetLogins();
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);

  const prompt = makePrompt();
  const channel = makeChannel();

  const first = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, first, channel), "the saved login should be handed out");
  Assert.equal(first.password, PASSWORD, "the password should come from the saved login");
  Assert.equal(prompt.asked, 0, "the user should not be asked while the saved login is untried");
  await checkLoginCount(1);

  const second = { realm: REALM, flags: AUTH_HOST | PREVIOUS_FAILED, username: "", password: "" };
  Assert.equal(
    await promptAuth(prompt, second, retryOf(channel)),
    false,
    "the rejected login should not be handed out"
  );
  Assert.equal(second.password, "", "no password should be reported after dropping the login");
  Assert.equal(second.username, USERNAME, "the username should still name the account");
  Assert.equal(prompt.asked, 1, "the user should be asked once the saved login is gone");
  await checkLoginCount(0);
});

/** A login saved after we handed the old one out must not be dropped. */
add_task(async function test_prompt_keeps_a_login_it_did_not_hand_out() {
  await resetLogins();
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);

  const prompt = makePrompt();
  const channel = makeChannel();

  const first = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, first, channel), "the saved login should be handed out");

  // The user notices and stores a working password while the old one is still
  // in flight.
  await cal.auth.passwordManagerSave(USERNAME, NEW_PASSWORD, ORIGIN, REALM);

  const second = { realm: REALM, flags: AUTH_HOST | PREVIOUS_FAILED, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, second, retryOf(channel)),
    "the replacement login should be handed out"
  );
  Assert.equal(second.password, NEW_PASSWORD, "the replacement password should be used");
  Assert.equal(prompt.asked, 0, "the user should not be asked while an untried login exists");
  await checkLoginCount(1);
});

/** With nothing saved, the prompt still has to name the account. */
add_task(async function test_prompt_names_the_account_with_nothing_saved() {
  await resetLogins();

  const userContextId = cal.auth.containerMap.getUserContextIdForUsername(USERNAME);
  const prompt = makePrompt();

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.equal(
    await promptAuth(prompt, authInfo, makeChannel(userContextId)),
    false,
    "nothing should be handed out with an empty login manager"
  );
  Assert.equal(authInfo.username, USERNAME, "the username should name the calendar's account");
  Assert.equal(prompt.asked, 1, "the user should be asked");
});

/** What the user types into the dialog has to reach the caller. */
add_task(async function test_prompt_hands_out_what_the_dialog_returned() {
  await resetLogins();

  const prompt = makePrompt(true);

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, authInfo), "the entered credentials should be handed out");
  Assert.equal(authInfo.username, USERNAME, "the entered username should be reported");
  Assert.equal(authInfo.password, NEW_PASSWORD, "the entered password should be reported");
  Assert.equal(prompt.asked, 1, "the user should be asked once");
});

/** One request's late rejection must not cost what another request just got. */
add_task(async function test_prompt_keeps_a_login_another_request_uses() {
  await resetLogins();
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);

  const prompt = makePrompt();
  const slow = makeChannel();

  const first = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, first, slow), "the saved login should be handed out");

  // The user stores a working password, and the next request picks it up.
  await cal.auth.passwordManagerSave(USERNAME, NEW_PASSWORD, ORIGIN, REALM);
  const other = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, other, makeChannel()), "the replacement should be handed out");
  Assert.equal(other.password, NEW_PASSWORD, "the other request should get the replacement");

  // Only now does the first request report that the old password was rejected.
  const second = { realm: REALM, flags: AUTH_HOST | PREVIOUS_FAILED, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, second, retryOf(slow)),
    "the replacement should survive the late rejection"
  );
  Assert.equal(second.password, NEW_PASSWORD, "the replacement password should be used");
  Assert.equal(prompt.asked, 0, "the user should not be asked while an untried login exists");
  await checkLoginCount(1);
});
