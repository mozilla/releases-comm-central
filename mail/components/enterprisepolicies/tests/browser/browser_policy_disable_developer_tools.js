/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await setupPolicyEngineWithJson({
    policies: {
      DisableDeveloperTools: true,
    },
  });
});

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

  await SpecialPowers.pushPrefEnv({
    set: [["devtools.policy.disabled", false]],
  });

  is(
    Services.prefs.getBoolPref("devtools.policy.disabled"),
    true,
    "devtools dedicated disabled pref can not be updated"
  );

  is(
    Services.prefs.getBoolPref("remote.policy.disabled"),
    true,
    "remote automation should be disabled by policy"
  );

  await expectErrorPage("about:devtools-toolbox");
  await expectErrorPage("about:debugging");

  info("Check that the Web Developer menu is hidden in a newly opened window");

  const policyWindow = window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "chrome,all,dialog=no"
  );
  await BrowserTestUtils.waitForEvent(policyWindow, "load");

  const devtoolsMenu = policyWindow.document.getElementById("devtoolsMenu");
  ok(devtoolsMenu.hidden, "The Web Developer item of the tools menu is hidden");

  await BrowserTestUtils.closeWindow(policyWindow);

  info("Check that the App Menu Developer Tools items are hidden");

  const appMenuButton = document.getElementById("button-appmenu");
  const appMenuPopup = document.getElementById("appMenu-popup");
  const toolsMenu = document.getElementById("appmenu_toolsMenu");
  const toolsView = document.getElementById("appMenu-toolsView");

  const popupShownPromise = BrowserTestUtils.waitForPopupEvent(
    appMenuPopup,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(appMenuButton, {}, window);
  await popupShownPromise;

  const viewShownPromise = BrowserTestUtils.waitForEvent(
    toolsView,
    "ViewShown"
  );
  EventUtils.synthesizeMouseAtCenter(toolsMenu, {}, window);
  await viewShownPromise;

  ok(
    toolsView.querySelector("#appmenu_devtoolsToolbox").hidden,
    "The App Menu Developer Tools item is hidden"
  );
  ok(
    toolsView.querySelector("#devToolsSeparator").hidden,
    "The App Menu Developer Tools separator is hidden"
  );

  const popupHiddenPromise = BrowserTestUtils.waitForPopupEvent(
    appMenuPopup,
    "hidden"
  );
  appMenuPopup.hidePopup();
  await popupHiddenPromise;
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
