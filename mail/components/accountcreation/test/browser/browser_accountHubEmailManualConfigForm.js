/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let subview;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailManualConfigForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-manual-config-form"
  );
  EventUtils.synthesizeMouseAtCenter(subview, {}, browser.contentWindow);

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  const state = new AccountConfig();

  subview.setState(state);

  // The current state of the form should be updated.
  Assert.deepEqual(
    subview.captureState(),
    state,
    "The current state should have been updated"
  );
});
