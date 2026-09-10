/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that http(s) hyperlinks on an extension's Details and Permissions
 * pages in about:addons are opened in the external browser.
 */

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const HOMEPAGE_URL = "https://example.com/extension-homepage/";
const ID = "detail-links@mochi.test";

add_setup(function () {
  MockExternalProtocolService.init();
});

registerCleanupFunction(function () {
  MockExternalProtocolService.cleanup();
});

add_task(async function test_detail_and_permissions_links() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      name: "Detail Links Extension",
      browser_specific_settings: { gecko: { id: ID } },
      homepage_url: HOMEPAGE_URL,
      permissions: ["tabs"],
    },
    useAddonManager: "temporary",
  });
  await extension.startup();

  const tabmail = document.getElementById("tabmail");
  const win = await openAddonsMgr(`addons://detail/${encodeURIComponent(ID)}`);
  await waitAboutAddonsViewLoaded(win.document);
  const aboutAddonsTab = tabmail.currentTabInfo;

  const doc = win.document;
  const card = doc.querySelector(`addon-card[addon-id="${ID}"]`);

  // The Details page shows the homepage as a regular http(s) link.
  const homepageLink = await TestUtils.waitForCondition(
    () => card.querySelector(".addon-detail-row-homepage a[href]"),
    "Wait for the homepage link to be rendered"
  );
  is(
    homepageLink.href,
    HOMEPAGE_URL,
    "The homepage link points at the extension homepage"
  );

  let loadPromise = MockExternalProtocolService.promiseLoad();
  homepageLink.click();
  is(
    await loadPromise,
    HOMEPAGE_URL,
    "Clicking the homepage link should have opened it externally"
  );
  is(
    tabmail.currentTabInfo,
    aboutAddonsTab,
    "The about:addons tab should still be the current tab"
  );

  // Switch to the Permissions page, which has a "learn more" support link in
  // its footer.
  const { deck, tabGroup } = card.details;
  const permsShown = BrowserTestUtils.waitForEvent(deck, "view-changed");
  tabGroup.querySelector('[name="permissions"]').click();
  await permsShown;

  const learnMoreLink = await TestUtils.waitForCondition(
    () => card.querySelector(".addon-permissions-footer a[href]"),
    "Wait for the permissions learn more link to be rendered"
  );
  const learnMoreURL = learnMoreLink.href;
  ok(
    /^https?:\/\//.test(learnMoreURL),
    `The learn more link is an http(s) link: ${learnMoreURL}`
  );

  // Bring the footer link on-screen so it is considered clickable.
  learnMoreLink.scrollIntoView();
  loadPromise = MockExternalProtocolService.promiseLoad();
  learnMoreLink.click();
  is(
    await loadPromise,
    learnMoreURL,
    "Clicking the permissions learn more link should have opened it externally"
  );
  is(
    tabmail.currentTabInfo,
    aboutAddonsTab,
    "The about:addons tab should still be the current tab"
  );

  tabmail.closeTab(aboutAddonsTab);

  await extension.unload();
});
