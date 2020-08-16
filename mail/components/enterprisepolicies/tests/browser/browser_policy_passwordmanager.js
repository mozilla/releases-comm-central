/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_pwmanagerbutton() {
  await setupPolicyEngineWithJson({
    policies: {
      PasswordManagerEnabled: false,
    },
  });

  window.openPreferencesTab("panePrivacy");
  await BrowserTestUtils.browserLoaded(window.gPrefTab.browser);
  await new Promise(resolve => setTimeout(resolve));

  is(
    window.gPrefTab.browser.contentDocument.getElementById("showPasswords")
      .disabled,
    true,
    "showPasswords should be disabled."
  );

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.gPrefTab);
});
