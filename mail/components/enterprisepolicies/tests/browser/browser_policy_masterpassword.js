/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { LoginTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/LoginTestUtils.sys.mjs"
);

// Test that once a password is set, you can't unset it
add_task(async function test_policy_masterpassword_set() {
  await setupPolicyEngineWithJson({
    policies: {
      PrimaryPassword: true,
    },
  });

  LoginTestUtils.primaryPassword.enable();

  window.openPreferencesTab("panePrivacy");
  await BrowserTestUtils.browserLoaded(
    window.preferencesTabType.tab.browser,
    undefined,
    url => url.startsWith("about:preferences")
  );
  const { contentDocument } = window.preferencesTabType.tab.browser;
  await TestUtils.waitForCondition(() =>
    contentDocument.getElementById("useMasterPassword")
  );

  is(
    contentDocument.getElementById("useMasterPassword").disabled,
    true,
    "Primary Password checkbox should be disabled"
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.preferencesTabType.tab);

  LoginTestUtils.primaryPassword.disable();
});

// Test that password can't be removed in changemp.xhtml
add_task(async function test_policy_nochangemp() {
  await setupPolicyEngineWithJson({
    policies: {
      PrimaryPassword: true,
    },
  });

  LoginTestUtils.primaryPassword.enable();

  const changeMPWindow = window.openDialog(
    "chrome://mozapps/content/preferences/changemp.xhtml",
    "",
    ""
  );
  await BrowserTestUtils.waitForEvent(changeMPWindow, "load");

  is(
    changeMPWindow.document.getElementById("admin").hidden,
    true,
    "Admin message should not be visible because there is a password."
  );

  changeMPWindow.document.getElementById("oldpw").value =
    LoginTestUtils.primaryPassword.masterPassword;

  is(
    changeMPWindow.document.getElementById("changemp").getButton("accept")
      .disabled,
    true,
    "OK button should not be enabled if there is an old password."
  );

  await BrowserTestUtils.closeWindow(changeMPWindow);

  LoginTestUtils.primaryPassword.disable();
});

// Test that admin message shows
add_task(async function test_policy_admin() {
  await setupPolicyEngineWithJson({
    policies: {
      PrimaryPassword: true,
    },
  });

  const changeMPWindow = window.openDialog(
    "chrome://mozapps/content/preferences/changemp.xhtml",
    "",
    ""
  );
  await BrowserTestUtils.waitForEvent(changeMPWindow, "load");

  is(
    changeMPWindow.document.getElementById("admin").hidden,
    false,
    true,
    "Admin message should not be hidden because there is not a password."
  );

  await BrowserTestUtils.closeWindow(changeMPWindow);
});
