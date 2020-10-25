/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/PromiseTestUtils.jsm"
);

add_task(async function test_updates_post_policy() {
  is(
    Services.policies.isAllowed("devtools"),
    false,
    "devtools should be disabled by policy."
  );

  is(
    Services.prefs.getBoolPref("devtools.policy.disabled"),
    true,
    "devtools dedicated disabled pref is set to true"
  );

  Services.prefs.setBoolPref("devtools.policy.disabled", false);

  is(
    Services.prefs.getBoolPref("devtools.policy.disabled"),
    true,
    "devtools dedicated disabled pref can not be updated"
  );

  await checkBlockedPage("about:devtools", true);
  await checkBlockedPage("about:devtools-toolbox", true);
  await checkBlockedPage("about:debugging", true);

  info("Check that devtools menu items are hidden");
  let devtoolsMenu = window.document.getElementById("devtoolsMenu");
  ok(devtoolsMenu.hidden, "The Web Developer item of the tools menu is hidden");
  let appmenu_devtoolsMenu = window.document.getElementById(
    "appmenu_devtoolsMenu"
  );
  ok(
    appmenu_devtoolsMenu.hidden,
    "The Web Developer item of the hamburger menu is hidden"
  );
});

async function checkBlockedPage(url, expectedBlocked) {
  let tabmail = document.getElementById("tabmail");
  let index = tabmail.tabInfo.length;
  window.openContentTab("about:blank");
  let tab = tabmail.tabInfo[index];
  let browser = tab.browser;

  // Because `browser` is in the parent process, handle the rejection message.
  // This should stop happening once E10s is enabled.
  PromiseTestUtils.expectUncaughtRejection(/NS_ERROR_BLOCKED_BY_POLICY/);
  BrowserTestUtils.loadURI(browser, url);

  await BrowserTestUtils.waitForCondition(async function() {
    let blocked = await ContentTask.spawn(browser, null, async function() {
      return content.document.documentURI.startsWith("about:neterror");
    });
    return blocked == expectedBlocked;
  }, `Page ${url} block was correct (expected=${expectedBlocked}).`);

  tabmail.closeTab(tab);
}
