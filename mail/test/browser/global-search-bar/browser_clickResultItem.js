/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  be_in_folder,
  create_folder,
  inboxFolder,
  make_message_sets_in_folders,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

const { GlodaMsgIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);

let folder;

/**
 * Tests the 3 global search bars found in the UI:
 * 1) The one on the mail tab.
 * 2) The one in the search result tab.
 */
const tests = [
  {
    selector: "#unifiedToolbarContent .search-bar global-search-bar",
    isNewSearchBar: true,
    tabCountBefore: 1,
    tabCountAfter: 2,
  },
  {
    selector: ".remote-gloda-search",
    tabCountBefore: 2,
    async before() {
      // Run a search so we can search from the results tab.
      const input = document.querySelector(
        "#unifiedToolbarContent .search-bar"
      );
      EventUtils.synthesizeMouseAtCenter(input, {});
      EventUtils.sendString("us", window);
      EventUtils.synthesizeKey("KEY_Enter", {});

      await BrowserTestUtils.waitForCondition(
        () =>
          window.document.getElementById("tabmail").selectedTab.browser &&
          window.document.getElementById("tabmail").selectedTab.browser.src ==
            "chrome://messenger/content/glodaFacetView.xhtml",
        "search result tab did not open in time"
      );
    },
    tabCountAfter: 3,
  },
];

/**
 * Tests clicking on an item in the various global search bars opens one tab
 * only. See bug 1679113.
 */
add_task(async function testClickingGlobalSearchResultItemOpensOneTab() {
  window.focus();
  folder = await create_folder("SearchedFolder");
  await be_in_folder(folder);
  await make_message_sets_in_folders(
    [folder],
    [
      { from: ["User", "user@example.com"] },
      { from: ["User", "user@example.com"] },
      { from: ["User", "user@example.com"] },
    ]
  );

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  const tabmail = window.document.getElementById("tabmail");
  for (const test of tests) {
    while (tabmail.tabInfo.length > 1) {
      tabmail.closeTab(1);
    }

    if (test.before) {
      await test.before();
    }

    Assert.equal(
      tabmail.tabInfo.length,
      test.tabCountBefore,
      "tab count is as expected before"
    );

    const input = document.querySelector(test.selector);
    if (test.isNewSearchBar) {
      input.reset();
    } else {
      input.value = "";
    }
    input.focus();

    EventUtils.synthesizeKey("u", {});
    EventUtils.synthesizeKey("s", {});
    EventUtils.synthesizeKey("e", {});

    await BrowserTestUtils.waitForCondition(
      () => input.controller.matchCount > 0,
      `"${test.selector}" did not find any matches`
    );

    const target = document.querySelector(
      "#PopupGlodaAutocomplete > richlistbox > richlistitem"
    );
    Assert.ok(target, "target item to click found");
    EventUtils.synthesizeMouseAtCenter(target, {});

    // Give any potentially extra tabs time to appear.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => window.setTimeout(resolve, 1000));

    Assert.equal(
      tabmail.tabInfo.length,
      test.tabCountAfter,
      "tab count is as expected after"
    );
    Assert.equal(
      tabmail.selectedTab.browser.src,
      "chrome://messenger/content/glodaFacetView.xhtml",
      "current tab is the search results tab"
    );
  }
});

registerCleanupFunction(async function () {
  const tabmail = window.document.getElementById("tabmail");
  tabmail.selectTabByMode("mail3PaneTab");
  await be_in_folder(inboxFolder);
  folder.deleteSelf(null);
  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(1);
  }
});
