/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals reset, showNotification, waitForMinimize NotificationManager,
 * waitASecond, NotificationScheduler
 */
"use strict";

const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);
const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const { NotificationFilter } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/inappnotifications/modules/NotificationFilter.sys.mjs"
);

const tabmail = document.getElementById("tabmail");

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  NotificationScheduler.observe(null, "active");
  NotificationScheduler._startupDelay = 0;
  NotificationScheduler._idleService.disabled = true;
  // PlacesUtils when executing the CTA needs the profile.

  MockExternalProtocolService.init();

  registerCleanupFunction(async () => {
    await InAppNotifications.updateNotifications([]);
    await EnterprisePolicyTesting.setupPolicyEngineWithJson({ policies: {} });
    EnterprisePolicyTesting.resetRunOnceState();
    MockExternalProtocolService.cleanup();
    await PlacesUtils.history.clear();
  });
});

/**
 * Helper function to inject and verify notifications.
 *
 * @param {string} type - The type of notification.
 * @param {boolean} shouldAppear - If the notification should appear or not.
 */
async function injectAndCheckNotification(type, shouldAppear) {
  await showNotification({
    title: `${type} notification`,
    type,
    wait: shouldAppear,
  });

  if (shouldAppear) {
    await waitForNotification(true);
  } else {
    await waitASecond();
    Assert.ok(
      !document.querySelector("in-app-notification"),
      "notification does not exist"
    );
  }

  const notificationElement = document.querySelector("in-app-notification");

  if (!shouldAppear) {
    Assert.ok(!shouldAppear, `${type} notification should not appear.`);
  } else {
    const container = notificationElement.shadowRoot.querySelector(
      "in-app-notification-container"
    ).shadowRoot;

    const notificationText =
      container
        .querySelector(".in-app-notification-container")
        .textContent.trim() || "";

    if (shouldAppear) {
      Assert.stringContains(
        notificationText,
        `${type} notification`,
        `${type} notification should be displayed in UI.`
      );
    } else {
      Assert.ok(
        !notificationText.includes(`${type} notification`),
        `${type} notification should not appear in UI.`
      );
    }
  }
}

/**
 * Test that default behavior applies when no policy exists.
 */
add_task(async function test_enterprise_policy_not_defined() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({ policies: {} });
  EnterprisePolicyTesting.resetRunOnceState();

  Assert.ok(
    Services.prefs.getBoolPref("mail.inappnotifications.enabled", true),
    "Notifications are enabled"
  );
  Assert.ok(
    Services.prefs.getBoolPref(
      "mail.inappnotifications.donation_enabled",
      true
    ),
    "Donations are enabled"
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.inappnotifications.message_enabled", true),
    "Messages are enabled"
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.inappnotifications.blog_enabled", true),
    "Blogs are enabled"
  );

  await injectAndCheckNotification("donation", true);
  await injectAndCheckNotification("blog", true);
  await injectAndCheckNotification("message", true);
  await injectAndCheckNotification("security", true);
});

add_task(async function test_enterprise_policy_blocked() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      InAppNotification: {
        DonationEnabled: false,
        SurveyEnabled: false,
        MessageEnabled: false,
      },
    },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  Assert.ok(
    Services.prefs.getBoolPref("mail.inappnotifications.enabled", true),
    "Notifications are enabled"
  );
  Assert.ok(
    !Services.prefs.getBoolPref(
      "mail.inappnotifications.donation_enabled",
      true
    ),
    "Donations are disabled"
  );
  Assert.ok(
    !Services.prefs.getBoolPref(
      "mail.inappnotifications.message_enabled",
      true
    ),
    "Messages are disabled"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("mail.inappnotifications.blog_enabled", true),
    "Blogs  are disabled"
  );

  await injectAndCheckNotification("donation", false);
  await injectAndCheckNotification("blog", false);
  await injectAndCheckNotification("message", false);
  await injectAndCheckNotification("security", true);

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      InAppNotification: {
        DonationEnabled: true,
        SurveyEnabled: true,
        MessageEnabled: true,
      },
    },
  });
  EnterprisePolicyTesting.resetRunOnceState();
});

add_task(async function test_enterprise_policy_disabled() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: true } },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  Assert.ok(
    !Services.prefs.getBoolPref("mail.inappnotifications.enabled", true),
    "Notifications are disabled"
  );
  Assert.ok(
    Services.prefs.getBoolPref(
      "mail.inappnotifications.donation_enabled",
      true
    ),
    "Donations are enabled"
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.inappnotifications.message_enabled", true),
    "Messages are enabled"
  );
  Assert.ok(
    Services.prefs.getBoolPref("mail.inappnotifications.blog_enabled", true),
    "Blogs are enabled"
  );

  await injectAndCheckNotification("donation", false);
  await injectAndCheckNotification("blog", false);
  await injectAndCheckNotification("message", false);
  await injectAndCheckNotification("security", false);

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: false } },
  });
  EnterprisePolicyTesting.resetRunOnceState();
});

add_task(async function test_enterprise_policy_donation_tab() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      InAppNotification: {
        DonationEnabled: false,
      },
    },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened");

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      InAppNotification: {
        DonationEnabled: true,
      },
    },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await InAppNotifications.updateNotifications([]);
});

add_task(async function test_enterprise_policy_disabled_donation_tab() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: true } },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await showNotification({ type: "donation_tab" });

  await waitASecond();

  Assert.equal(tabmail.tabs.length, 1, "tab was not opened");

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: false } },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await InAppNotifications.updateNotifications([]);
});

add_task(async function test_enterprise_policy_donation_browser() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      InAppNotification: {
        DonationEnabled: false,
      },
    },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened"
  );

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      InAppNotification: {
        DonationEnabled: true,
      },
    },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await InAppNotifications.updateNotifications([]);
});

add_task(async function test_enterprise_policy_disabled_donation_browser() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: true } },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await showNotification({ type: "donation_browser" });

  await waitASecond();

  Assert.equal(
    MockExternalProtocolService.urls.length,
    0,
    "browser was not opened"
  );

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: false } },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await InAppNotifications.updateNotifications([]);
});
