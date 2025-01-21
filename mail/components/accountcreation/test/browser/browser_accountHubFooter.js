/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let footer;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubFooter.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  footer =
    tab.browser.contentWindow.document.querySelector("account-hub-footer");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_disabled() {
  const back = footer.querySelector("#back");
  const forward = footer.querySelector("#forward");
  footer.canBack(true);

  footer.disabled = false;
  Assert.ok(!back.disabled, "Back button should be enabled");
  Assert.ok(!forward.disabled, "Forward button should be enabled");
  Assert.ok(!footer.disabled, "Should not report itself as disabled");

  footer.disabled = true;
  Assert.ok(back.disabled, "Back button should be disabled");
  Assert.ok(forward.disabled, "Forward button should be disabled");
  Assert.ok(footer.disabled, "Should report itself as disabled");

  footer.disabled = false;
  Assert.ok(!back.disabled, "Back button should be enabled again");
  Assert.ok(!forward.disabled, "Forward button should be enabled again");
  Assert.ok(!footer.disabled, "Should report itself as enabled again");
});
