/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

registerCleanupFunction(() => {
  let tabmail = document.getElementById("tabmail");
  is(tabmail.tabInfo.length, 1, "only the first tab should remain open");

  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(tabmail.tabInfo[1]);
  }
});
