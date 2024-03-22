/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_setup(async function () {
  await setupPolicyEngineWithJson({
    policies: {
      DisableSafeMode: true,
    },
  });
});

add_task(async function test_help_menu() {
  buildHelpMenu();
  const safeModeMenu = document.getElementById("helpTroubleshootMode");
  is(
    safeModeMenu.getAttribute("disabled"),
    "true",
    "The `Restart with Add-ons Disabled...` item should be disabled"
  );
  const safeModeAppMenu = document.getElementById("appmenu_troubleshootMode");
  is(
    safeModeAppMenu.getAttribute("disabled"),
    "true",
    "The `Restart with Add-ons Disabled...` appmenu item should be disabled"
  );
});

add_task(async function test_safemode_from_about_support() {
  await withNewTab({ url: "about:support" }, () => {
    const button = content.document.getElementById(
      "restart-in-safe-mode-button"
    );
    is(
      button.getAttribute("disabled"),
      "true",
      "The `Restart with Add-ons Disabled...` button should be disabled"
    );
  });
});

add_task(async function test_safemode_from_about_profiles() {
  await withNewTab({ url: "about:profiles" }, () => {
    const button = content.document.getElementById(
      "restart-in-safe-mode-button"
    );
    is(
      button.getAttribute("disabled"),
      "true",
      "The `Restart with Add-ons Disabled...` button should be disabled"
    );
  });
});
