/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests using the global search input retains focus after a search. What we are
 * really interested in however, is the search input not causing an error when
 * it gains focus.
 */
add_task(async function testGlobalSearchInputGainsFocus() {
  let searchInput = document.querySelector("#searchInput");
  searchInput.value = "Bugzilla";
  EventUtils.synthesizeMouseAtCenter(searchInput, {}, window);
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  Assert.ok(
    document.activeElement === searchInput,
    "global search input has focus"
  );
});

registerCleanupFunction(function tearDown() {
  let tabmail = document.querySelector("tabmail");
  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(1);
  }
});
