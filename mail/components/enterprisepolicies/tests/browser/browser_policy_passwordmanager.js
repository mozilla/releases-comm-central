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

add_task(async function test_context_menus_hide_reveal_password() {
  await setupPolicyEngineWithJson({
    policies: {
      DisablePasswordReveal: true,
    },
  });

  const input = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "input"
  );
  input.type = "password";
  document.documentElement.appendChild(input);
  const popup = EditContextMenu._ensurePopup();
  const popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EditContextMenu.open(input, new PointerEvent("contextmenu"));
  await popupShown;
  Assert.ok(
    popup.querySelector("#edit-contextmenu-reveal-password").hidden,
    "Reveal Password should be hidden in the chrome text context menu"
  );
  const popupHidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.hidePopup();
  await popupHidden;
  input.remove();

  Assert.equal(
    Services.prefs.getBoolPref("layout.forms.reveal-password-button.enabled"),
    false,
    "Reveal password button pref should be false"
  );
  Assert.ok(
    Services.prefs.prefIsLocked("layout.forms.reveal-password-button.enabled"),
    "Reveal password button pref should be locked"
  );
});
