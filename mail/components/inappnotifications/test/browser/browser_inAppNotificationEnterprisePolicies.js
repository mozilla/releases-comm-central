/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InAppNotifications } = ChromeUtils.importESModule(
  "resource:///modules/InAppNotifications.sys.mjs"
);

const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);

const { NotificationFilter } = ChromeUtils.importESModule(
  "resource:///modules/NotificationFilter.sys.mjs"
);

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const { NotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/NotificationManager.sys.mjs"
);

/**
 * Wait an amount of time for something to NOT happen.
 *
 * @param {number} time - The amount of time to wait.
 */
async function waitASecond(time = 1000) {
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(resolve => setTimeout(resolve, time));
}

const tabmail = document.getElementById("tabmail");
let didOpen = false;

add_setup(async function () {
  NotificationManager._PER_TIME_UNIT = 1;
  // PlacesUtils when executing the CTA needs the profile.
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      didOpen = true;
      Assert.equal(
        uri.spec,
        "https://example.com/donation_browser",
        "Should only receive load request got test specific URI"
      );
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  registerCleanupFunction(async () => {
    await InAppNotifications.updateNotifications([]);
    await EnterprisePolicyTesting.setupPolicyEngineWithJson({ policies: {} });
    EnterprisePolicyTesting.resetRunOnceState();
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

async function showNotification(type) {
  await InAppNotifications.updateNotifications([]);

  const notification = {
    id: `${type}Notification` + Date.now(),
    title: `${type} notification`,
    description: `Test description for ${type}`,
    URL: `https://example.com/${type}`,
    CTA: "Click me!",
    severity: 1,
    type,
    start_at: new Date(Date.now() - 1000).toISOString(),
    end_at: new Date(Date.now() + 100000).toISOString(),
    targeting: {},
  };

  await InAppNotifications.updateNotifications([notification]);
}

/**
 * Helper function to inject and verify notifications.
 *
 * @param {string} type - The type of notification.
 * @param {boolean} shouldAppear - If the notification should appear or not.
 */
async function injectAndCheckNotification(type, shouldAppear) {
  await showNotification(type);

  if (shouldAppear) {
    try {
      await BrowserTestUtils.waitForCondition(
        () => document.querySelector("in-app-notification"),
        `Waiting for ${type} notification to appear`,
        5000
      );
    } catch {}
  } else {
    Assert.ok(
      !document.querySelector("in-app-notification"),
      "notification does not exist"
    );
  }

  const notificationElement = document.querySelector("in-app-notification");

  if (!notificationElement) {
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

  await showNotification("donation_tab");

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

  await showNotification("donation_tab");

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

  await showNotification("donation_browser");

  await waitASecond();

  Assert.ok(!didOpen, "browser was not opened");

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

  await showNotification("donation_browser");

  await waitASecond();

  Assert.ok(!didOpen, "browser was not opened");

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { InAppNotification: { Disabled: false } },
  });
  EnterprisePolicyTesting.resetRunOnceState();

  await InAppNotifications.updateNotifications([]);
});
