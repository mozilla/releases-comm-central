/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const USERNAME = "fred";
const PASSWORD = "********";
const NEW_PASSWORD = "########";
const ORIGIN = "https://origin";
const ORIGIN_WITH_PORT = "https://origin:8443";
const REALM = "realm";
const CALENDAR_NAME = "Work";
const OLD_USERNAME = "barney";
const OTHER_USERNAME = "wilma";
const AUTH_HOST = Ci.nsIAuthInformation.AUTH_HOST;
const PREVIOUS_FAILED = Ci.nsIAuthInformation.PREVIOUS_FAILED;

function run_test() {
  do_get_profile();
  run_next_test();
}

async function checkLoginCount(total) {
  Assert.equal(total, await Services.logins.countLoginsAsync("", "", ""));
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

/**
 * Creates a cal.auth.Prompt with a stubbed dialog, so everything around the
 * dialog runs for real.
 *
 * @param {?object} calendar - The calendar the prompt belongs to.
 * @param {string} [entered] - The username the user types, empty if they cancel
 *   the dialog.
 * @returns {object} The prompt, with an `asked` counter, the text the dialog
 *   asked with in `text` and the username it offered in `prefilled`.
 */
function makeDialogPrompt(calendar, entered = USERNAME) {
  const prompt = new cal.auth.Prompt(calendar);
  prompt.asked = 0;
  prompt._showAuthDialog = (channel, level, authInfo, label, savePassword, text) => {
    prompt.asked++;
    prompt.text = text;
    prompt.prefilled = authInfo.username;
    if (!entered) {
      return false;
    }
    authInfo.username = entered;
    authInfo.password = NEW_PASSWORD;
    return true;
  };
  return prompt;
}

/**
 * Creates a calendar stub that remembers what is set on it.
 *
 * @param {object} [properties] - What the calendar starts out with.
 * @returns {object}
 */
function makeCalendar(properties = {}) {
  const props = {
    name: CALENDAR_NAME,
    "capabilities.username.supported": true,
    ...properties,
  };
  return {
    get name() {
      return props.name;
    },
    getProperty: name => props[name] ?? null,
    setProperty: (name, value) => (props[name] = value),
  };
}

/** Empties the login manager, so one failing test cannot fail the next. */
async function resetLogins() {
  await Services.logins.removeAllLoginsAsync();
  await checkLoginCount(0);
}

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

/** With several calendars subscribed, the dialog has to say which one it is. */
add_task(async function test_prompt_names_the_calendar_it_asks_for() {
  await resetLogins();

  const prompt = makeDialogPrompt(makeCalendar());
  // A server on a port other than the default, because that is part of its name.
  const channel = { URI: Services.io.newURI(ORIGIN_WITH_PORT), loadInfo: { originAttributes: {} } };

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, authInfo, channel),
    "the entered credentials should be handed out"
  );
  Assert.ok(prompt.text.includes(CALENDAR_NAME), "the dialog should name the calendar");
  Assert.ok(prompt.text.includes(ORIGIN_WITH_PORT), "the dialog should name the server");
});

/** Without a calendar there is no name to add, so the dialog keeps its own text. */
add_task(async function test_prompt_without_a_calendar_asks_with_the_default_text() {
  await resetLogins();

  const prompt = makeDialogPrompt(null);

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, authInfo), "the entered credentials should be handed out");
  Assert.equal(prompt.text, null, "the dialog should be left to name the server itself");
});

/** The prompt only knows the calendar if the provider hands it over. */
add_task(function test_provider_hands_its_calendar_to_the_prompt() {
  const calendar = {
    name: CALENDAR_NAME,
    QueryInterface: ChromeUtils.generateQI([]),
  };

  const prompt = cal.provider.InterfaceRequestor_getInterface.call(calendar, Ci.nsIAuthPrompt2);
  Assert.equal(prompt.mProvider, calendar, "the prompt should know which calendar it asks for");
});

/** A username corrected in the dialog has to reach the calendar. */
add_task(async function test_prompt_stores_the_entered_username_on_the_calendar() {
  await resetLogins();

  const calendar = makeCalendar({ username: OLD_USERNAME });
  const prompt = makeDialogPrompt(calendar);
  const channel = makeChannel();

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, authInfo, channel),
    "the entered credentials should be handed out"
  );
  Assert.equal(
    calendar.getProperty("username"),
    OLD_USERNAME,
    "the calendar should keep its name while the server has not answered"
  );

  prompt.saveUsername(channel);
  Assert.equal(
    calendar.getProperty("username"),
    USERNAME,
    "the calendar should carry the entered username once the server took it"
  );
});

/** An empty username is a field waiting to be filled in, not a calendar to skip. */
add_task(async function test_prompt_stores_the_username_on_a_calendar_that_has_none() {
  await resetLogins();

  const calendar = makeCalendar({ username: null });
  const prompt = makeDialogPrompt(calendar);
  const channel = makeChannel();

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, authInfo, channel),
    "the entered credentials should be handed out"
  );

  prompt.saveUsername(channel);
  Assert.equal(
    calendar.getProperty("username"),
    USERNAME,
    "the calendar should be given the name the user typed"
  );
});

/** Nothing was entered, so a later request has nothing to store. */
add_task(async function test_prompt_stores_nothing_after_a_cancelled_dialog() {
  await resetLogins();

  const calendar = makeCalendar({ username: OLD_USERNAME });
  const prompt = makeDialogPrompt(calendar, "");
  const channel = makeChannel();

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.equal(
    await promptAuth(prompt, authInfo, channel),
    false,
    "the dialog should report the cancel"
  );

  prompt.saveUsername(channel);
  Assert.equal(
    calendar.getProperty("username"),
    OLD_USERNAME,
    "the calendar should keep its username"
  );
});

/** A provider that has no username of its own must be left alone. */
add_task(async function test_prompt_leaves_a_calendar_without_username_support_alone() {
  await resetLogins();

  const calendar = makeCalendar({
    username: OLD_USERNAME,
    "capabilities.username.supported": false,
  });
  const prompt = makeDialogPrompt(calendar);
  const channel = makeChannel();

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, authInfo, channel),
    "the entered credentials should be handed out"
  );
  prompt.saveUsername(channel);
  Assert.equal(
    calendar.getProperty("username"),
    OLD_USERNAME,
    "the calendar should keep its username"
  );
});

/** Nothing was entered, so nothing may be stored. */
add_task(async function test_prompt_stores_nothing_when_the_dialog_is_cancelled() {
  await resetLogins();
  await cal.auth.passwordManagerSave(USERNAME, PASSWORD, ORIGIN, REALM);

  // A calendar without a stored username takes whatever login it finds.
  const calendar = makeCalendar({ username: null });
  const prompt = makeDialogPrompt(calendar, "");
  const channel = makeChannel();

  const first = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, first, channel), "the saved login should be handed out");
  Assert.equal(first.username, USERNAME, "the login should name the account");

  // The server rejects it, so the login goes and the user is asked - and cancels.
  const second = { realm: REALM, flags: AUTH_HOST | PREVIOUS_FAILED, username: "", password: "" };
  Assert.equal(
    await promptAuth(prompt, second, retryOf(channel)),
    false,
    "the cancelled dialog should report no credentials"
  );
  Assert.equal(second.username, USERNAME, "the dialog should still name the account");
  prompt.saveUsername(channel);
  Assert.equal(
    calendar.getProperty("username"),
    null,
    "the calendar should not be given a username the user did not confirm"
  );
});

/** What bug 2007933 reports: the dialog returns at every start. */
add_task(async function test_prompt_stops_asking_after_the_username_was_corrected() {
  await resetLogins();

  const calendar = makeCalendar({ username: OLD_USERNAME });
  const prompt = makeDialogPrompt(calendar);

  // The calendar carries a username the server does not know, so nothing is
  // found and the user types the right one.
  const stale = makeChannel(cal.auth.containerMap.getUserContextIdForUsername(OLD_USERNAME));
  const first = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, first, stale), "the user should be asked");
  prompt.saveUsername(stale);
  await cal.auth.passwordManagerSave(first.username, first.password, ORIGIN, REALM);

  // The next start looks the container up from the calendar's properties again.
  const container = cal.auth.containerMap.getUserContextIdForUsername(
    calendar.getProperty("username")
  );
  const second = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, second, makeChannel(container)),
    "the saved login should be found"
  );
  Assert.equal(second.password, NEW_PASSWORD, "the saved password should be used");
  Assert.equal(prompt.asked, 1, "the user should not be asked a second time");
});

/** A retry runs in the container of the name we just replaced, so ask the calendar. */
add_task(async function test_prompt_offers_the_corrected_username_on_the_retry() {
  await resetLogins();

  const calendar = makeCalendar({ username: OLD_USERNAME });
  const prompt = makeDialogPrompt(calendar);
  const channel = makeChannel(cal.auth.containerMap.getUserContextIdForUsername(OLD_USERNAME));

  const first = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, first, channel), "the user should be asked");
  prompt.saveUsername(channel);
  Assert.equal(prompt.prefilled, OLD_USERNAME, "the dialog should offer the calendar's name");
  Assert.equal(calendar.getProperty("username"), USERNAME, "the entered name should be stored");

  // The server rejects what was entered, and the retry runs on the same request.
  const second = { realm: REALM, flags: AUTH_HOST | PREVIOUS_FAILED, username: "", password: "" };
  Assert.ok(await promptAuth(prompt, second, retryOf(channel)), "the user should be asked again");
  Assert.equal(prompt.prefilled, USERNAME, "the dialog should offer the corrected name");
});

/** Calendars sharing an account share one dialog, so they share its answer. */
add_task(async function test_prompt_stores_the_username_on_a_calendar_that_shared_the_dialog() {
  await resetLogins();

  const asked = makeCalendar({ name: "asked", username: OLD_USERNAME });
  const silent = makeCalendar({ name: "silent", username: OLD_USERNAME });
  const askedPrompt = makeDialogPrompt(asked);
  const silentPrompt = makeDialogPrompt(silent);

  // Both requests run in the container of the same account, so they share a key
  // and the prompter binds the second to the dialog of the first - but only
  // while that dialog is open. So start the second from inside it and wait for
  // it to reach the queue: its lookup names the account on the auth info and
  // queues right after, which makes that name the signal.
  const container = cal.auth.containerMap.getUserContextIdForUsername(OLD_USERNAME);
  const askedChannel = makeChannel(container);
  const silentChannel = makeChannel(container);
  const silentAuthInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  let silentRequest;

  askedPrompt._showAuthDialog = (channel, level, authInfo) => {
    askedPrompt.asked++;
    silentRequest = promptAuth(silentPrompt, silentAuthInfo, silentChannel);
    const deadline = Date.now() + 10000;
    Services.tm.spinEventLoopUntil(
      "test_auth_utils.js:shared dialog",
      () => silentAuthInfo.username || Date.now() > deadline
    );
    authInfo.username = USERNAME;
    authInfo.password = NEW_PASSWORD;
    return true;
  };

  const askedAuthInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(askedPrompt, askedAuthInfo, askedChannel),
    "the asked calendar should get credentials"
  );
  Assert.ok(await silentRequest, "the silent calendar should get them too");
  Assert.equal(silentPrompt.asked, 0, "the silent calendar should not be asked as well");

  askedPrompt.saveUsername(askedChannel);
  silentPrompt.saveUsername(silentChannel);
  Assert.equal(asked.getProperty("username"), USERNAME, "the asked calendar should be corrected");
  Assert.equal(silent.getProperty("username"), USERNAME, "the silent one should be corrected too");
});

/** A calendar can have several requests out at once, each with its own answer. */
add_task(async function test_prompt_keeps_the_username_of_the_request_it_belongs_to() {
  await resetLogins();

  const calendar = makeCalendar({ username: OLD_USERNAME });
  const prompt = makeDialogPrompt(calendar);
  // The prompter binds a request only to a dialog that is still pending, so a
  // challenge arriving after the first was answered gets a dialog of its own.
  prompt._showAuthDialog = (channel, level, authInfo) => {
    prompt.asked++;
    authInfo.username = prompt.asked == 1 ? USERNAME : OTHER_USERNAME;
    authInfo.password = NEW_PASSWORD;
    return true;
  };

  const first = makeChannel();
  const second = makeChannel();
  Assert.ok(
    await promptAuth(prompt, { realm: REALM, flags: AUTH_HOST, username: "", password: "" }, first),
    "the first request should be answered"
  );
  Assert.ok(
    await promptAuth(
      prompt,
      { realm: REALM, flags: AUTH_HOST, username: "", password: "" },
      second
    ),
    "the second request should be answered"
  );
  Assert.equal(prompt.asked, 2, "each request should get its own dialog");

  prompt.saveUsername(first);
  Assert.equal(
    calendar.getProperty("username"),
    USERNAME,
    "the calendar should get the name entered for the request that went through"
  );

  prompt.saveUsername(second);
  Assert.equal(
    calendar.getProperty("username"),
    OTHER_USERNAME,
    "the other request should still carry its own answer"
  );
});

/** A name that already matches is not written again. */
add_task(async function test_prompt_leaves_a_matching_username_alone() {
  await resetLogins();

  const calendar = makeCalendar({ username: USERNAME });
  let written = 0;
  const setProperty = calendar.setProperty;
  calendar.setProperty = (name, value) => {
    written += name == "username" ? 1 : 0;
    return setProperty(name, value);
  };
  const prompt = makeDialogPrompt(calendar);
  const channel = makeChannel();

  const authInfo = { realm: REALM, flags: AUTH_HOST, username: "", password: "" };
  Assert.ok(
    await promptAuth(prompt, authInfo, channel),
    "the entered credentials should be handed out"
  );
  prompt.saveUsername(channel);
  Assert.equal(written, 0, "the calendar should not be written to for an unchanged name");
});
