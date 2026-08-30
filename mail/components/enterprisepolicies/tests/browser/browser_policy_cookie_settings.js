/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { UrlClassifierTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlClassifierTestUtils.sys.mjs"
);
Services.cookies.QueryInterface(Ci.nsICookieService);

async function restore_prefs() {
  await SpecialPowers.pushPrefEnv({
    clear: [
      ["network.cookie.sameSite.laxByDefault"],
      ["network.cookie.cookieBehavior"],
      ["network.cookieJarSettings.unblocked_for_testing"],
      ["network.cookie.rejectForeignWithExceptions.enabled"],
    ],
  });
}

async function set_cookie_test_prefs(additionalPrefs = []) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["network.cookieJarSettings.unblocked_for_testing", true],
      ["network.cookie.rejectForeignWithExceptions.enabled", false],
      ...additionalPrefs,
    ],
  });
}

add_setup(restore_prefs);

async function fake_profile_change() {
  await new Promise(resolve => {
    Services.obs.addObserver(function waitForDBClose() {
      Services.obs.removeObserver(waitForDBClose, "cookie-db-closed");
      resolve();
    }, "cookie-db-closed");
    Services.cookies.testCloseCookieDB();
  });
  await new Promise(resolve => {
    Services.obs.addObserver(function waitForDBOpen() {
      Services.obs.removeObserver(waitForDBOpen, "cookie-db-read");
      resolve();
    }, "cookie-db-read");
    Services.cookies.testOpenCookieDB();
  });
}

async function test_cookie_settings({
  cookiesEnabled,
  thirdPartyCookiesEnabled,
  cookieJarSettingsLocked,
}) {
  const firstPartyURI = NetUtil.newURI("https://example.com/");
  const thirdPartyURI = NetUtil.newURI("https://example.org/");
  const channel = NetUtil.newChannel({
    uri: firstPartyURI,
    loadUsingSystemPrincipal: true,
  });
  channel.QueryInterface(Ci.nsIHttpChannelInternal).forceAllowThirdPartyCookie =
    true;
  Services.cookies.removeAll();
  Services.cookies.setCookieStringFromHttp(firstPartyURI, "key=value", channel);
  Services.cookies.setCookieStringFromHttp(thirdPartyURI, "key=value", channel);

  let expectedFirstPartyCookies = 1;
  let expectedThirdPartyCookies = 1;
  if (!cookiesEnabled) {
    expectedFirstPartyCookies = 0;
  }
  if (!cookiesEnabled || !thirdPartyCookiesEnabled) {
    expectedThirdPartyCookies = 0;
  }
  is(
    Services.cookies.countCookiesFromHost(firstPartyURI.host),
    expectedFirstPartyCookies,
    "Number of first-party cookies should match expected"
  );
  is(
    Services.cookies.countCookiesFromHost(thirdPartyURI.host),
    expectedThirdPartyCookies,
    "Number of third-party cookies should match expected"
  );

  // Add a cookie so we can check if it persists past the end of the session
  // but, first remove existing cookies set by this host to put us in a known state
  Services.cookies.removeAll();
  Services.cookies.setCookieStringFromHttp(
    firstPartyURI,
    "key=value; max-age=1000",
    channel
  );

  await fake_profile_change();

  // Now check if the cookie persisted or not
  let expectedCookieCount = 1;
  if (!cookiesEnabled) {
    expectedCookieCount = 0;
  }
  is(
    Services.cookies.countCookiesFromHost(firstPartyURI.host),
    expectedCookieCount,
    "Number of cookies was not what expected after restarting session"
  );

  is(
    Services.prefs.prefIsLocked("network.cookie.cookieBehavior"),
    cookieJarSettingsLocked,
    "Cookie behavior pref lock status should be what is expected"
  );

  window.openPreferencesTab("panePrivacy");
  await BrowserTestUtils.browserLoaded(
    window.preferencesTabType.tab.browser,
    undefined,
    url => url.startsWith("about:preferences")
  );
  const { contentDocument } = window.preferencesTabType.tab.browser;
  await TestUtils.waitForCondition(() =>
    contentDocument.getElementById("acceptCookies")
  );
  const expectControlsDisabled = !cookiesEnabled || cookieJarSettingsLocked;

  for (const id of ["acceptCookies", "showCookiesButton"]) {
    is(
      contentDocument.getElementById(id).disabled,
      cookieJarSettingsLocked,
      `#${id} disabled status should match expected`
    );
  }
  for (const id of ["acceptThirdPartyMenu"]) {
    is(
      contentDocument.getElementById(id).disabled,
      expectControlsDisabled,
      `#${id} disabled status should match expected`
    );
  }

  is(
    contentDocument.getElementById("cookieExceptions").disabled,
    cookieJarSettingsLocked,
    "#cookieExceptions disabled status should matched expected"
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.preferencesTabType.tab);
}

add_task(async function prepare_tracker_tables() {
  await UrlClassifierTestUtils.addTestTrackers();
});

add_task(async function test_initial_state() {
  await set_cookie_test_prefs([
    ["network.cookie.sameSite.laxByDefault", false],
  ]);
  await test_cookie_settings({
    cookiesEnabled: true,
    thirdPartyCookiesEnabled: true,
    cookieJarSettingsLocked: false,
  });
  await restore_prefs();
});

add_task(async function test_undefined_unlocked() {
  await set_cookie_test_prefs([["network.cookie.cookieBehavior", 3]]);
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {},
    },
  });
  is(
    Services.prefs.getIntPref("network.cookie.cookieBehavior", undefined),
    3,
    "An empty cookie policy should not have changed the cookieBehavior preference"
  );
  await restore_prefs();
});

add_task(async function test_disabled() {
  await set_cookie_test_prefs();
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Default: false,
      },
    },
  });

  await test_cookie_settings({
    cookiesEnabled: false,
    thirdPartyCookiesEnabled: true,
    cookieJarSettingsLocked: false,
  });
  await restore_prefs();
});

add_task(async function test_third_party_disabled() {
  await set_cookie_test_prefs();
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        AcceptThirdParty: "never",
      },
    },
  });

  await test_cookie_settings({
    cookiesEnabled: true,
    thirdPartyCookiesEnabled: false,
    cookieJarSettingsLocked: false,
  });
  await restore_prefs();
});

add_task(async function test_disabled_and_third_party_disabled() {
  await set_cookie_test_prefs();
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Default: false,
        AcceptThirdParty: "never",
      },
    },
  });

  await test_cookie_settings({
    cookiesEnabled: false,
    thirdPartyCookiesEnabled: false,
    cookieJarSettingsLocked: false,
  });
  await restore_prefs();
});

add_task(async function test_disabled_and_third_party_disabled_locked() {
  await set_cookie_test_prefs();
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Default: false,
        AcceptThirdParty: "never",
        Locked: true,
      },
    },
  });

  await test_cookie_settings({
    cookiesEnabled: false,
    thirdPartyCookiesEnabled: false,
    cookieJarSettingsLocked: true,
  });
  await restore_prefs();
});

add_task(async function test_undefined_locked() {
  await set_cookie_test_prefs([
    ["network.cookie.sameSite.laxByDefault", false],
  ]);
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Locked: true,
      },
    },
  });

  await test_cookie_settings({
    cookiesEnabled: true,
    thirdPartyCookiesEnabled: true,
    cookieJarSettingsLocked: true,
  });
  await restore_prefs();
});

add_task(async function prepare_tracker_tables() {
  await UrlClassifierTestUtils.cleanupTestTrackers();
});
