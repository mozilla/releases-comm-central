/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Gloda search bar is focused after a search. What we are really
 * interested in however, is the search input not causing an error when it
 * gains focus.
 */
add_task(async function testGlobalSearchInputGainsFocus() {
  const searchInput = document.querySelector(".search-bar");
  EventUtils.synthesizeMouseAtCenter(searchInput, {}, window);
  EventUtils.sendString("Bugzilla", window);
  EventUtils.synthesizeKey("KEY_Enter", {}, window);

  const tabmail = document.querySelector("tabmail");
  Assert.equal(tabmail.tabInfo.length, 2);
  Assert.equal(tabmail.currentTabInfo, tabmail.tabInfo[1]);

  await TestUtils.waitForCondition(() => {
    const browser = tabmail.currentTabInfo.browser;
    return (
      browser &&
      !browser.webProgress?.isLoadingDocument &&
      browser.currentURI?.spec != "about:blank"
    );
  });

  const activeElement = document.activeElement;
  info(`<${activeElement.localName}>`);
  Assert.equal(
    activeElement.getAttribute("is"),
    "gloda-autocomplete-input",
    "gloda search input has focus"
  );
});

registerCleanupFunction(function tearDown() {
  const tabmail = document.querySelector("tabmail");
  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(1);
  }
});
