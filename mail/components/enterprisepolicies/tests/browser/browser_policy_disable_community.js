/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

add_setup(async function () {
  await setupPolicyEngineWithJson({
    policies: {
      DisableCommunity: true,
    },
  });
});

add_task(async function test_help_menu() {
  buildHelpMenu();

  for (const id of [
    "getInvolved",
    "donationsPage",
    "feedbackPage",
    "functionsSeparator",
  ]) {
    is(
      BrowserTestUtils.isHidden(document.getElementById(id)),
      true,
      `${id} should be hidden`
    );
  }
});

add_task(async function test_app_menu() {
  for (const id of [
    "appmenu_getInvolved",
    "appmenu_makeDonation",
    "appmenu_submitFeedback",
  ]) {
    is(
      BrowserTestUtils.isHidden(document.getElementById(id)),
      true,
      `${id} should be hidden`
    );
  }

  is(
    BrowserTestUtils.isHidden(
      document.getElementById("appmenu_submitFeedback").nextElementSibling
    ),
    true,
    "The App Menu community separator should be hidden"
  );
});

add_task(async function test_start_page_settings() {
  await withNewTab({ url: "about:preferences" }, browser => {
    const startPageSettings =
      browser.contentDocument.getElementById("startPageSettings");

    is(
      BrowserTestUtils.isHidden(startPageSettings),
      true,
      "Start Page settings should be hidden"
    );
  });
});
