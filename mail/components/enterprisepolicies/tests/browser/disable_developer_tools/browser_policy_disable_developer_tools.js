/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

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

  await expectErrorPage("about:devtools-toolbox");
  await expectErrorPage("about:debugging");

  info("Check that devtools menu items are hidden");
  const devtoolsMenu = window.document.getElementById("devtoolsMenu");
  ok(devtoolsMenu.hidden, "The Web Developer item of the tools menu is hidden");
});

const expectErrorPage = async function (url) {
  const tabmail = document.getElementById("tabmail");
  const index = tabmail.tabInfo.length;
  window.openContentTab("about:blank");
  const tab = tabmail.tabInfo[index];
  const browser = tab.browser;

  BrowserTestUtils.startLoadingURIString(browser, url);
  await BrowserTestUtils.browserLoaded(browser, false, url, true);
  await SpecialPowers.spawn(browser, [url], async function () {
    ok(
      content.document.documentURI.startsWith(
        "about:neterror?e=blockedByPolicy"
      ),
      content.document.documentURI +
        " should start with about:neterror?e=blockedByPolicy"
    );
  });

  tabmail.closeTab(tab);
};
