/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  make_new_sets_in_folder,
  delete_message_set,
  inboxFolder,
  be_in_folder,
  create_folder,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

const { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);

let folder;
let threads;

/**
 * Tests the 3 global search bars found in the UI:
 * 1) The one on the mail tab.
 * 2) The one on the chat tab.
 * 3) The one in the search result tab.
 *
 * 1 and 2 are skipped because their tab types currently cause an error to be
 * thrown when focused on. See bug 1680587 and bug 1649035.
 */
let tests = [
  {
    selector: "#searchInput",
    tabCountBefore: 1,
    tabCountAfter: 2,
  },
  {
    selector: "#IMSearchInput",
    tabCountBefore: 2,
    skip: true,
    before() {
      // Make sure we are on the chat tab.
      window.showChatTab();
      Assert.equal(
        window.tabmail.selectedTab,
        window.gChatTab,
        "chat tab is selected"
      );
    },
    tabCountAfter: 3,
  },
  {
    selector: ".remote-gloda-search",
    tabCountBefore: 2,
    async before() {
      // Run a search so we can search from the results tab.
      let input = document.querySelector("#searchInput");
      input.value = "us";
      EventUtils.synthesizeMouseAtCenter(input, {});
      EventUtils.synthesizeKey("VK_RETURN", {});

      await BrowserTestUtils.waitForCondition(
        () =>
          window.tabmail.selectedTab.browser &&
          window.tabmail.selectedTab.browser.src ==
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
  folder = create_folder("SearchedFolder");
  be_in_folder(folder);
  threads = make_new_sets_in_folder(folder, [
    { from: ["User", "user@example.com"] },
    { from: ["User", "user@example.com"] },
    { from: ["User", "user@example.com"] },
  ]);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  for (let test of tests) {
    if (test.skip) {
      info(`Skipping "gloda-autocomplete-input${test.selector}"...`);
      continue;
    }

    while (window.tabmail.tabInfo.length > 1) {
      window.tabmail.closeTab(1);
    }

    if (test.before) {
      await test.before();
    }

    Assert.equal(
      window.tabmail.tabInfo.length,
      test.tabCountBefore,
      "tab count is as expected before"
    );

    let input = document.querySelector(test.selector);
    input.value = "";
    input.focus();

    EventUtils.synthesizeKey("u", {});
    EventUtils.synthesizeKey("s", {});
    EventUtils.synthesizeKey("e", {});

    await BrowserTestUtils.waitForCondition(
      () => input.controller.matchCount > 0,
      `"${test.selector}" did not find any matches`
    );

    let target = document.querySelector(
      "#PopupGlodaAutocomplete > richlistbox > richlistitem"
    );
    Assert.ok(target, "target item to click found");
    EventUtils.synthesizeMouseAtCenter(target, {});

    // Give any potentially extra tabs time to appear.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => window.setTimeout(resolve, 1000));

    Assert.equal(
      window.tabmail.tabInfo.length,
      test.tabCountAfter,
      "tab count is as expected after"
    );
    Assert.equal(
      window.tabmail.selectedTab.browser.src,
      "chrome://messenger/content/glodaFacetView.xhtml",
      "current tab is the search results tab"
    );
  }
});

registerCleanupFunction(() => {
  be_in_folder(inboxFolder);
  folder.deleteSelf(null);
  while (window.tabmail.tabInfo.length > 1) {
    window.tabmail.closeTab(1);
  }
});
