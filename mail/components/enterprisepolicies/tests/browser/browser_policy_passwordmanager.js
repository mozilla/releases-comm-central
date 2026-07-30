/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { wait_for_frame_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

add_task(async function test_pwmanagerbutton() {
  await setupPolicyEngineWithJson({
    policies: {
      PasswordManagerEnabled: false,
    },
  });

  const prefWin = await window.openPreferencesTab("panePrivacy");
  await new Promise(resolve => prefWin.setTimeout(resolve));
  Assert.ok(
    prefWin.document.getElementById("showPasswords").disabled,
    "showPasswords should be disabled."
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.preferencesTabType.tab);
});

add_task(async function test_password_reveal_policy() {
  await setupPolicyEngineWithJson({
    policies: {
      DisablePasswordReveal: true,
    },
  });

  // Show the "Privacy & Security" settings section.
  const prefWin = await window.openPreferencesTab("panePrivacy");
  await new Promise(resolve => prefWin.setTimeout(resolve));

  // Show the password manager.
  const button = prefWin.document.getElementById("showPasswords");
  EventUtils.synthesizeMouseAtCenter(button, {}, prefWin);

  const passwordMgr = await wait_for_frame_load(
    prefWin.gSubDialog._topDialog._frame,
    "chrome://messenger/content/preferences/passwordManager.xhtml"
  );

  // Check the "Show Passwords" button is hidden.
  const toggleButton = passwordMgr.document.getElementById("togglePasswords");
  Assert.ok(
    toggleButton.hidden,
    "the visibility toggle button should be hidden"
  );

  // Check the "Show Passwords" button no-ops even if made visible.
  toggleButton.toggleAttribute("hidden", false);
  EventUtils.synthesizeMouseAtCenter(toggleButton, {}, passwordMgr);
  await new Promise(resolve => prefWin.setTimeout(resolve));

  const passwordCol = passwordMgr.document.getElementById("passwordCol");
  Assert.ok(
    passwordCol.hidden,
    "even if the button is made visible again, clicking it should no-op"
  );
});
