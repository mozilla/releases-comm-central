/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the OAuth2 window tells the user when the provider's page cannot
 * use cookies. Without that the sign-in just sits there forever.
 */

const { OAuth2Module } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Module.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { EnterprisePolicyTesting, PoliciesPrefTracker } =
  ChromeUtils.importESModule(
    "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
  );
const { PermissionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PermissionTestUtils.sys.mjs"
);

const OAUTH_ORIGIN = "https://oauth.test.test";
const PARENT_ORIGIN = "https://test.test";
const COOKIE_BEHAVIOR_PREF = "network.cookie.cookieBehavior";
const COOKIE_BEHAVIOR_PRIVATE_PREF = "network.cookie.cookieBehavior.pbmode";

add_setup(async function () {
  await OAuth2TestUtils.startServer({ requireCookies: true });
  PoliciesPrefTracker.start();
  registerCleanupFunction(async function () {
    await applyCookiePolicy(null);
    EnterprisePolicyTesting.resetRunOnceState();
    PoliciesPrefTracker.stop();
    // An exception an administrator set cannot be removed one by one.
    Services.perms.removeAll();
    OAuth2TestUtils.forgetObjects();
    await Services.logins.removeAllLoginsAsync();
  });
});

/**
 * Hands the policy engine an administrator's cookie policy, or switches it
 * off again. The engine restores the preferences it changed by itself.
 *
 * @param {?object} cookies - The `Cookies` policy to apply, or null for none.
 */
async function applyCookiePolicy(cookies) {
  PoliciesPrefTracker.restoreDefaultValues();
  await EnterprisePolicyTesting.setupPolicyEngineWithJson(
    cookies ? { policies: { Cookies: cookies } } : ""
  );
}

/**
 * Rejects cookies for every site, as unticking the settings option does.
 */
function rejectAllCookies() {
  return SpecialPowers.pushPrefEnv({
    set: [[COOKIE_BEHAVIOR_PREF, Ci.nsICookieService.BEHAVIOR_REJECT]],
  });
}

/**
 * Adds the exception a user can add themselves, blocking cookies for a site.
 *
 * @param {string} [origin=OAUTH_ORIGIN] - The site to block.
 */
function addBlockingException(origin = OAUTH_ORIGIN) {
  PermissionTestUtils.add(origin, "cookie", Services.perms.DENY_ACTION);
}

/**
 * Reports a blocked request to the window, the way Necko does.
 *
 * @param {Window} oAuthWindow - The window that opened.
 * @param {integer} state - The blocking state to report.
 */
function reportBlockingEvent(oAuthWindow, state) {
  oAuthWindow.reporterListener.onContentBlockingEvent(
    oAuthWindow.getBrowser().webProgress,
    NetUtil.newChannel({
      uri: "https://analytics.test.test/beacon",
      loadUsingSystemPrincipal: true,
    }),
    state
  );
}

/**
 * Starts a sign-in, which opens the window with the provider's page.
 *
 * @returns {object} The window that opened and the promise of the sign-in,
 *   which the caller has to settle.
 */
async function startSignIn() {
  const mod = new OAuth2Module();
  mod.initFromHostname("mochi.test", "victor@foo.invalid", "imap");

  const oAuthPromise = OAuth2TestUtils.promiseOAuthWindow();
  const deferred = Promise.withResolvers();
  mod.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });
  return { oAuthWindow: await oAuthPromise, signIn: deferred.promise };
}

/**
 * Presses the notification's button and waits for the page to load again.
 *
 * @param {Element} notification - The notification shown.
 * @param {Window} oAuthWindow - The window that opened.
 */
async function pressAcceptCookies(notification, oAuthWindow) {
  const button = notification.buttonContainer.firstElementChild;
  Assert.equal(
    button.dataset.l10nId,
    "browser-request-cookies-accept",
    "the notification should offer to accept cookies"
  );
  const loadedPromise = BrowserTestUtils.browserLoaded(
    oAuthWindow.getBrowser()
  );
  button.doCommand();
  await loadedPromise;
}

/**
 * Finishes a sign-in that works again, which is the point of the button.
 *
 * @param {Window} oAuthWindow - The window that opened.
 * @param {Promise} signIn - The promise of the sign-in.
 */
async function finishSignIn(oAuthWindow, signIn) {
  const browser = oAuthWindow.getBrowser();
  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(
      content.document.querySelector("form"),
      "the login form should be there once cookies are accepted"
    );
  });
  await SpecialPowers.spawn(
    browser,
    [
      {
        expectedHint: "victor@foo.invalid",
        expectedScope: "test_scope",
        username: "user",
        password: "password",
      },
    ],
    OAuth2TestUtils.submitOAuthLogin
  );
  Assert.equal(await signIn, "access_token", "the sign-in should complete");

  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
}

/**
 * Cancels the sign-in the way a user would, by closing the window.
 *
 * @param {Window} oAuthWindow - The window that opened.
 * @param {Promise} signIn - The promise of the sign-in.
 */
async function cancelSignIn(oAuthWindow, signIn) {
  await SimpleTest.promiseFocus(oAuthWindow.getBrowser());
  EventUtils.synthesizeKey("KEY_Escape", {}, oAuthWindow);
  await Assert.rejects(signIn, /2147500036/); // NS_ERROR_ABORT
  OAuth2TestUtils.forgetObjects();
}

/**
 * The notification shown in the window, if there is one.
 *
 * @param {Window} oAuthWindow - The window that opened.
 * @returns {?Element}
 */
function cookieNotification(oAuthWindow) {
  return oAuthWindow.gNotification.getNotificationWithValue("cookiesBlocked");
}

/**
 * Waits for the window to explain why nothing happens.
 *
 * @param {Window} oAuthWindow - The window that opened.
 * @returns {Element} The notification shown.
 */
async function promiseCookieNotification(oAuthWindow) {
  await SpecialPowers.spawn(oAuthWindow.getBrowser(), [], () => {
    Assert.ok(
      !content.document.querySelector("form"),
      "the login form should be missing, as on a real provider's page"
    );
  });

  const notification = await TestUtils.waitForCondition(
    () => cookieNotification(oAuthWindow),
    "the window should say that cookies are blocked"
  );
  Assert.equal(
    notification.messageText.dataset.l10nId,
    "browser-request-cookies-blocked",
    "the notification should name the blocked cookies as the reason"
  );
  return notification;
}

/**
 * Checks that the notification comes without a button, because the user is
 * not allowed to remove what blocks the page.
 */
async function subtestNothingToOffer() {
  const { oAuthWindow, signIn } = await startSignIn();
  const notification = await promiseCookieNotification(oAuthWindow);
  Assert.equal(
    notification.buttonContainer.children.length,
    0,
    "there should be nothing to press if the user can't change it anyway"
  );
  await cancelSignIn(oAuthWindow, signIn);
}

/** All cookies are rejected, as if the user unticked the settings option. */
add_task(async function testAllCookiesBlocked() {
  await rejectAllCookies();

  const { oAuthWindow, signIn } = await startSignIn();
  const notification = await promiseCookieNotification(oAuthWindow);
  await pressAcceptCookies(notification, oAuthWindow);

  Assert.equal(
    Services.prefs.getIntPref(COOKIE_BEHAVIOR_PREF),
    Ci.nsICookieService.BEHAVIOR_ACCEPT,
    "the setting should be back on"
  );
  Assert.ok(
    !cookieNotification(oAuthWindow),
    "the notification should go once the user has dealt with it"
  );
  await finishSignIn(oAuthWindow, signIn);
  await SpecialPowers.popPrefEnv();
});

/** Cookies are rejected for this site only. */
add_task(async function testCookiesBlockedForSite() {
  addBlockingException();

  const { oAuthWindow, signIn } = await startSignIn();
  const notification = await promiseCookieNotification(oAuthWindow);
  await pressAcceptCookies(notification, oAuthWindow);

  Assert.equal(
    PermissionTestUtils.testPermission(OAUTH_ORIGIN, "cookie"),
    Services.perms.UNKNOWN_ACTION,
    "the exception blocking this site should be gone"
  );
  await finishSignIn(oAuthWindow, signIn);
});

/**
 * A second exception still in the way after the first is gone gets a
 * notification of its own, as would one for the next site the page leads to.
 */
add_task(async function testCookiesBlockedTwice() {
  addBlockingException();
  addBlockingException(PARENT_ORIGIN);

  const { oAuthWindow, signIn } = await startSignIn();
  let notification = await promiseCookieNotification(oAuthWindow);
  await pressAcceptCookies(notification, oAuthWindow);
  Assert.equal(
    PermissionTestUtils.testPermission(PARENT_ORIGIN, "cookie"),
    Services.perms.DENY_ACTION,
    "only the exception for the page itself should be gone"
  );

  notification = await promiseCookieNotification(oAuthWindow);
  await pressAcceptCookies(notification, oAuthWindow);
  Assert.equal(
    PermissionTestUtils.testPermission(PARENT_ORIGIN, "cookie"),
    Services.perms.UNKNOWN_ACTION,
    "the exception for the parent domain should be gone too"
  );
  await finishSignIn(oAuthWindow, signIn);
});

/**
 * An exception allowing the site wins over the setting, so the page works and
 * blocked requests of other sites are no reason to offer anything.
 */
add_task(async function testAllowedSiteNotReported() {
  PermissionTestUtils.add(OAUTH_ORIGIN, "cookie", Services.perms.ALLOW_ACTION);
  await rejectAllCookies();

  const { oAuthWindow, signIn } = await startSignIn();
  reportBlockingEvent(
    oAuthWindow,
    Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_ALL
  );
  await TestUtils.waitForTick();
  Assert.ok(
    !cookieNotification(oAuthWindow),
    "a site the user allowed cookies for should not be reported"
  );
  await finishSignIn(oAuthWindow, signIn);

  PermissionTestUtils.remove(OAUTH_ORIGIN, "cookie");
  await SpecialPowers.popPrefEnv();
});

/** A private window follows its own setting once that has been changed. */
add_task(async function testPrivateWindowBlocked() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.oauth.usePrivateBrowser", true],
      [COOKIE_BEHAVIOR_PRIVATE_PREF, Ci.nsICookieService.BEHAVIOR_REJECT],
    ],
  });

  const { oAuthWindow, signIn } = await startSignIn();
  const notification = await promiseCookieNotification(oAuthWindow);
  await pressAcceptCookies(notification, oAuthWindow);

  Assert.equal(
    Services.prefs.getIntPref(COOKIE_BEHAVIOR_PRIVATE_PREF),
    Ci.nsICookieService.BEHAVIOR_ACCEPT,
    "the setting for private windows should be back on"
  );
  await finishSignIn(oAuthWindow, signIn);
  await SpecialPowers.popPrefEnv();
});

/**
 * What matters is whether this page can use cookies, not which request was
 * blocked: providers load analytics, advertising and consent domains, and
 * those being blocked does not stop the sign-in.
 */
add_task(async function testOnlyWhenThisPageIsBlocked() {
  const { oAuthWindow, signIn } = await startSignIn();

  reportBlockingEvent(
    oAuthWindow,
    Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_ALL
  );
  await TestUtils.waitForTick();
  Assert.ok(
    !cookieNotification(oAuthWindow),
    "a page that can use cookies should not be reported"
  );

  await rejectAllCookies();

  reportBlockingEvent(
    oAuthWindow,
    Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_TRACKER
  );
  await TestUtils.waitForTick();
  Assert.ok(
    !cookieNotification(oAuthWindow),
    "blocking that isn't the user's cookie setting should not be reported"
  );

  // The control for the two assertions above: the same call does show the
  // notification when the page is blocked, and only ever one of them.
  reportBlockingEvent(
    oAuthWindow,
    Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_ALL
  );
  reportBlockingEvent(
    oAuthWindow,
    Ci.nsIWebProgressListener.STATE_COOKIES_BLOCKED_ALL
  );
  await TestUtils.waitForCondition(
    () => cookieNotification(oAuthWindow),
    "the window should say that cookies are blocked"
  );
  Assert.equal(
    oAuthWindow.gNotification.allNotifications.length,
    1,
    "the user should be told once, however many events arrive"
  );

  await cancelSignIn(oAuthWindow, signIn);
  await SpecialPowers.popPrefEnv();
});

/** An administrator can switch cookies off for everything, and lock it. */
add_task(async function testBlockedByPolicy() {
  await applyCookiePolicy({ Default: false, Locked: true });
  Assert.ok(
    Services.prefs.prefIsLocked(COOKIE_BEHAVIOR_PREF),
    "the policy should have locked the setting"
  );

  try {
    await subtestNothingToOffer();
  } finally {
    await applyCookiePolicy(null);
  }
});

/** An administrator can also block this one site. */
add_task(async function testBlockedByPolicyException() {
  await applyCookiePolicy({ Block: [OAUTH_ORIGIN] });

  try {
    await subtestNothingToOffer();
  } finally {
    await applyCookiePolicy(null);
    Services.perms.removeAll();
  }
});

/**
 * Turning cookies back on is no use while an administrator's exception blocks
 * the site, so there is nothing to offer.
 */
add_task(async function testBlockedByPolicyExceptionAndSetting() {
  await applyCookiePolicy({ Block: [OAUTH_ORIGIN] });
  await rejectAllCookies();

  try {
    await subtestNothingToOffer();
  } finally {
    await applyCookiePolicy(null);
    Services.perms.removeAll();
    await SpecialPowers.popPrefEnv();
  }
});
