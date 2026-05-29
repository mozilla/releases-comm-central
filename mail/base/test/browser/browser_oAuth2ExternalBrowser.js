/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2Module } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Module.sys.mjs"
);
const { OAuth2TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs"
);
const { PromptTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromptTestUtils.sys.mjs"
);

let oAuth2Server;

add_setup(async () => {
  oAuth2Server = await OAuth2TestUtils.startServer();
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.oauth.useExternalBrowser", true]],
  });

  registerCleanupFunction(async () => {
    OAuth2TestUtils.forgetObjects();
    OAuth2TestUtils.stopServer();
    await Services.logins.removeAllLoginsAsync();
  });
});

add_task(async function test_promptBeforeReauth() {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "oauth://external.test",
    null,
    "test_mail",
    "julia@foo.invalid",
    "invalid_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);
  oAuth2Server.accessToken = "revoked_access_token_2";
  oAuth2Server.refreshToken = "invalid_token";
  oAuth2Server.rotateTokens = true;
  oAuth2Server.expiry = -3600;
  const module = new OAuth2Module();
  Assert.ok(
    module.initFromHostname("external.test", "julia@foo.invalid", "imap")
  );
  OAuth2TestUtils.revokeToken(oAuth2Server.accessToken);
  oAuth2Server.accessToken = "access_token";
  oAuth2Server.refreshToken = "refresh_token";
  const shownPromise = PromptTestUtils.waitForPrompt(window, {
    modalType: Ci.nsIPromptService.MODAL_TYPE_WINDOW,
    promptType: "confirm",
  });
  const externalOAuthURL = OAuth2TestUtils.promiseExternalOAuthURL();
  const deferred = Promise.withResolvers();

  module.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  info("Waiting for prompt...");
  const prompt = await shownPromise;

  Assert.stringContains(
    prompt.ui.infoBody.textContent,
    "julia@foo.invalid",
    "Should contain username in description"
  );
  Assert.stringContains(
    prompt.ui.infoBody.textContent,
    "oauth.test.test",
    "Should contain OAuth provider hostname in description"
  );
  Assert.greater(
    prompt.ui.infoTitle.textContent.length,
    0,
    "Title should be a non-empty string"
  );

  await PromptTestUtils.handlePrompt(prompt, { buttonNumClick: 0 });

  const url = await externalOAuthURL;
  await OAuth2TestUtils.submitOAuthURL(url, {
    expectedScope: "test_mail",
    username: "user",
    password: "password",
  });
  info("Submitted OAuth request...");
  const result = await deferred.promise;
  Assert.ok(result, "Should get a token");

  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
  oAuth2Server.rotateTokens = false;
  oAuth2Server.expiry = 0;
});

add_task(async function test_promptBeforeReauthRejected() {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "oauth://external.test",
    null,
    "test_mail",
    "julia@foo.invalid",
    "invalid_token",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);
  oAuth2Server.accessToken = "revoked_access_token_2";
  oAuth2Server.refreshToken = "invalid_token";
  oAuth2Server.rotateTokens = true;
  oAuth2Server.expiry = -3600;
  const module = new OAuth2Module();
  Assert.ok(
    module.initFromHostname("external.test", "julia@foo.invalid", "imap")
  );
  OAuth2TestUtils.revokeToken(oAuth2Server.accessToken);
  oAuth2Server.accessToken = "access_token";
  oAuth2Server.refreshToken = "refresh_token";
  const shownPromise = PromptTestUtils.waitForPrompt(window, {
    modalType: Ci.nsIPromptService.MODAL_TYPE_WINDOW,
    promptType: "confirm",
  });
  const deferred = Promise.withResolvers();

  module.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  info("Waiting for prompt...");
  const prompt = await shownPromise;

  Assert.stringContains(
    prompt.ui.infoBody.textContent,
    "julia@foo.invalid",
    "Should contain username in description"
  );
  Assert.stringContains(
    prompt.ui.infoBody.textContent,
    "oauth.test.test",
    "Should contain OAuth provider hostname in description"
  );
  Assert.greater(
    prompt.ui.infoTitle.textContent.length,
    0,
    "Title should be a non-empty string"
  );

  await PromptTestUtils.handlePrompt(prompt, { buttonNumClick: 1 });

  await Assert.rejects(
    deferred.promise,
    error => error == Cr.NS_ERROR_ABORT,
    "Should reject with an abort"
  );

  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
  oAuth2Server.rotateTokens = false;
  oAuth2Server.expiry = 0;
});

add_task(async function test_restoresWindowAndReturnsFocus() {
  const module = new OAuth2Module();
  Assert.ok(
    module.initFromHostname("external.test", "julia@foo.invalid", "imap")
  );

  const externalOAuthURL = OAuth2TestUtils.promiseExternalOAuthURL();
  const deferred = Promise.withResolvers();
  Assert.equal(
    Services.focus.activeWindow,
    window,
    "OAuth request should come from our window"
  );
  module.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  const url = await externalOAuthURL;
  Assert.notEqual(window.windowState, window.STATE_MINIMIZED);
  const windowMinimized = BrowserTestUtils.waitForEvent(window, "blur");
  window.minimize();
  info("Waiting for blur...");
  await windowMinimized;
  await TestUtils.waitForCondition(
    () => window.document.hidden,
    "window is minimized"
  );

  const otherWindows = new Set();
  while (Services.focus.activeWindow) {
    info("Cleaning up focus on another window...");
    const otherWindow = Services.focus.activeWindow;
    otherWindows.add(otherWindow);
    const windowBlurred = BrowserTestUtils.waitForEvent(otherWindow, "blur");
    otherWindow.minimize();
    info("Waiting for blur...");
    await windowBlurred;
    await TestUtils.waitForCondition(
      () => otherWindow.document.hidden,
      "window is hidden"
    );
  }

  Assert.notEqual(Services.focus.activeWindow, window, "Should lose focus");
  await OAuth2TestUtils.submitOAuthURL(url, {
    expectedScope: "test_mail",
    username: "user",
    password: "password",
  });

  const result = await deferred.promise;
  info("Waiting for focus... " + window.windowState);
  await TestUtils.waitForCondition(
    () => !window.document.hidden,
    "Wait for window to be visible"
  );

  Assert.ok(result, "Should get a token");
  Assert.equal(
    Services.focus.activeWindow,
    window,
    "Should return focus to our window"
  );
  Assert.notEqual(
    window.windowState,
    window.STATE_MINIMIZED,
    "Window should no longer be minimized"
  );

  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();

  // Restore all the windows
  for (const otherWindow of otherWindows) {
    const focusReturned = BrowserTestUtils.waitForEvent(otherWindow, "focus");
    otherWindow.restore();
    await focusReturned;
  }
  await SimpleTest.promiseFocus(window);
});

add_task(async function test_handlesFocusRetained() {
  const module = new OAuth2Module();
  Assert.ok(
    module.initFromHostname("external.test", "julia@foo.invalid", "imap")
  );

  const externalOAuthURL = OAuth2TestUtils.promiseExternalOAuthURL();
  const deferred = Promise.withResolvers();
  Assert.equal(
    Services.focus.activeWindow,
    window,
    "OAuth request should come from our window"
  );
  module.getAccessToken({
    onSuccess: deferred.resolve,
    onFailure: deferred.reject,
  });

  const url = await externalOAuthURL;
  Assert.notEqual(window.windowState, window.STATE_MINIMIZED);
  Assert.equal(Services.focus.activeWindow, window, "Should still have focus");
  await OAuth2TestUtils.submitOAuthURL(url, {
    expectedScope: "test_mail",
    username: "user",
    password: "password",
  });

  const result = await deferred.promise;

  Assert.ok(result, "Should get a token");
  Assert.equal(
    Services.focus.activeWindow,
    window,
    "Should retain focus to our window"
  );
  Assert.notEqual(
    window.windowState,
    window.STATE_MINIMIZED,
    "Window should not be minimized"
  );

  OAuth2TestUtils.forgetObjects();
  await Services.logins.removeAllLoginsAsync();
});
