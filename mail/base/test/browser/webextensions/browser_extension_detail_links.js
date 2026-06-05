/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that http(s) hyperlinks on an extension's Details and Permissions
 * pages in about:addons are correctly opened in a content tab.
 */

const HOMEPAGE_URL = "https://example.com/extension-homepage/";
const ID = "detail-links@mochi.test";

/**
 * Wait for the next content tab to be opened in tabmail and finish loading the
 * given URL.
 *
 * @param {object} tabmail - The tabmail element.
 * @param {string} url - The URL the new content tab is expected to load.
 * @returns {Promise<object>} Resolves with the opened tabInfo once it has
 *   loaded the expected URL.
 */
function promiseContentTabLoaded(tabmail, url) {
  return new Promise(resolve => {
    const monitor = {
      onTabTitleChanged() {},
      onTabClosing() {},
      onTabPersist() {},
      onTabRestored() {},
      onTabSwitched() {},
      onTabOpened(tab) {
        tabmail.unregisterTabMonitor(monitor);
        resolve(
          BrowserTestUtils.browserLoaded(
            tab.browser,
            false,
            loaded => loaded == url
          ).then(() => tab)
        );
      },
    };
    tabmail.registerTabMonitor(monitor);
  });
}

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

  let tabPromise = promiseContentTabLoaded(tabmail, HOMEPAGE_URL);
  homepageLink.click();
  let openedTab = await tabPromise;
  is(
    openedTab.browser.currentURI.spec,
    HOMEPAGE_URL,
    "Clicking the homepage link opened it in a content tab"
  );
  tabmail.closeTab(openedTab);
  tabmail.switchToTab(aboutAddonsTab);

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
  tabPromise = promiseContentTabLoaded(tabmail, learnMoreURL);
  learnMoreLink.click();
  openedTab = await tabPromise;
  is(
    openedTab.browser.currentURI.spec,
    learnMoreURL,
    "Clicking the permissions learn more link opened it in a content tab"
  );
  tabmail.closeTab(openedTab);

  tabmail.closeTab(aboutAddonsTab);

  await extension.unload();
});
