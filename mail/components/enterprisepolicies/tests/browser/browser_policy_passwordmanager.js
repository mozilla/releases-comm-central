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
  await BrowserTestUtils.browserLoaded(window.preferencesTabType.tab.browser);
  await new Promise(resolve => setTimeout(resolve));

  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "showPasswords"
    ).disabled,
    true,
    "showPasswords should be disabled."
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.preferencesTabType.tab);
});
