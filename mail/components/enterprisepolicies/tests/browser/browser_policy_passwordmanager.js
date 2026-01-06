/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

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
