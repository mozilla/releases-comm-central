/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InAppNotifications } = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
);

add_task(async function testInAppNotificationDonationTab() {
  const tabmail = document.getElementById("tabmail");
  Assert.strictEqual(
    Services.wm.getMostRecentWindow("mail:3pane"),
    window,
    "Test window should be most recent window"
  );

  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );

  InAppNotifications.updateNotifications([
    {
      id: "testNotification" + Date.now(),
      title: "Test notification with a really really long title",
      description: "Long prose text",
      URL: "https://example.com",
      CTA: "Click me!",
      severity: 1,
      type: "donation_tab",
      start_at: new Date(Date.now() - 100000).toISOString(),
      end_at: new Date(Date.now() + 9999999999).toISOString(),
      targeting: {},
    },
  ]);

  const {
    detail: { tabInfo },
  } = await tabPromise;

  await BrowserTestUtils.browserLoaded(
    tabInfo.browser,
    false,
    "https://example.com/"
  );

  Assert.equal(
    tabInfo.browser.currentURI.spec,
    "https://example.com/",
    "loaded url in new tab"
  );

  InAppNotifications.updateNotifications([]);
  tabmail.closeOtherTabs(0);
});
