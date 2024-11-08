/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

/* eslint-disable @microsoft/sdl/no-insecure-url */

const BASE_URL =
  "http://mochi.test:8888/browser/comm/mail/components/enterprisepolicies/tests/browser/";

async function openTab(url) {
  const tab = window.openContentTab(url, null, null);
  if (
    tab.browser.ownerDocument.readyState != "complete" ||
    !tab.browser.currentURI ||
    tab.browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(tab.browser, false, url);
  }
  return tab;
}

/**
 * Wait for the given PopupNotification to display
 *
 * @param {string} name
 *        The name of the notification to wait for.
 *
 * @returns {Promise}
 *          Resolves with the notification window.
 */
function promisePopupNotificationShown(name) {
  return new Promise(resolve => {
    function popupshown() {
      const notification = PopupNotifications.getNotification(name);
      if (!notification) {
        return;
      }

      ok(notification, `${name} notification shown`);
      ok(PopupNotifications.isPanelOpen, "notification panel open");

      PopupNotifications.panel.removeEventListener("popupshown", popupshown);
      resolve(PopupNotifications.panel.firstElementChild);
    }

    PopupNotifications.panel.addEventListener("popupshown", popupshown);
  });
}

function dismissNotification(win = window) {
  return new Promise(resolve => {
    function popuphidden() {
      PopupNotifications.panel.removeEventListener("popuphidden", popuphidden);
      resolve();
    }
    PopupNotifications.panel.addEventListener("popuphidden", popuphidden);
    executeSoon(function () {
      EventUtils.synthesizeKey("VK_ESCAPE", {}, win);
    });
  });
}

add_setup(async function setupTestEnvironment() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.InstallTrigger.enabled", true],
      ["extensions.InstallTriggerImpl.enabled", true],
      // Relax the user input requirements while running this test.
      ["xpinstall.userActivation.required", false],
    ],
  });
});

add_task(async function test_install_source_blocked_link() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://blocks.other.install.sources/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-install-policy-blocked"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.document.getElementById("policytest").click();
  });
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_blocked_installtrigger() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://blocks.other.install.sources/*"],
          blocked_install_message: "blocked_install_message",
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-install-policy-blocked"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.document.getElementById("policytest_installtrigger").click();
  });
  const popup = await popupPromise;
  const description = popup.querySelector(".popup-notification-description");
  ok(
    description.textContent.endsWith("blocked_install_message"),
    "Custom install message present"
  );
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_blocked_otherdomain() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://mochi.test/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-install-policy-blocked"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.document.getElementById("policytest_otherdomain").click();
  });
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_blocked_direct() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://blocks.other.install.sources/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-install-policy-blocked"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [{ baseUrl: BASE_URL }],
    async function ({ baseUrl }) {
      content.document.location.href = baseUrl + "policytest_v0.1.xpi";
    }
  );
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_allowed_link() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://mochi.test/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-webext-permissions"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.document.getElementById("policytest").click();
  });
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_allowed_installtrigger() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://mochi.test/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-webext-permissions"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.document.getElementById("policytest_installtrigger").click();
  });
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_allowed_otherdomain() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://mochi.test/*", "http://example.org/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-webext-permissions"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.document.getElementById("policytest_otherdomain").click();
  });
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function test_install_source_allowed_direct() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "*": {
          install_sources: ["http://mochi.test/*"],
        },
      },
    },
  });
  const popupPromise = promisePopupNotificationShown(
    "addon-webext-permissions"
  );
  const tab = await openTab(`${BASE_URL}extensionsettings.html`);

  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [{ baseUrl: BASE_URL }],
    async function ({ baseUrl }) {
      content.document.location.href = baseUrl + "policytest_v0.1.xpi";
    }
  );
  await popupPromise;
  await dismissNotification();
  document.getElementById("tabmail").closeTab(tab);
});
