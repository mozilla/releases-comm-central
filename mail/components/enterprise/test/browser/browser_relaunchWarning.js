/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { RelaunchEnforcer } = ChromeUtils.importESModule(
  "resource://gre/modules/enterprise/RelaunchEnforcer.sys.mjs"
);

add_task(async function test_relaunch_warning_is_displayed_and_updated() {
  const warningUI = RelaunchEnforcer._appWarningUI();

  Assert.ok(
    warningUI,
    "The Thunderbird relaunch warning UI should be registered"
  );

  registerCleanupFunction(() => {
    warningUI.hide();
  });

  let restartRequested = false;
  const restartAt = Date.now() + 45 * 60_000;
  const restartNow = () => {
    restartRequested = true;
  };

  const shown = await warningUI.showOrUpdate({
    phase: "warning",
    restartAt,
    minutes: 45,
    restartNow,
  });

  Assert.ok(shown, "The warning should be shown");
  Assert.ok(warningUI.isVisible(), "The warning should be reported as visible");

  const container = document.getElementById("enterprise-notifications");
  const notification = container.querySelector('[value="enterprise-relaunch"]');

  Assert.ok(notification, "The relaunch notification should exist");
  Assert.equal(
    notification.getAttribute("type"),
    "info",
    "The warning should have the informational type"
  );

  await notification.updateComplete;

  let { id, args } = document.l10n.getAttributes(notification.messageText);

  Assert.equal(
    id,
    "enterprise-relaunch-warning-message",
    "The warning should use the expected message"
  );
  Assert.equal(
    args.datetime,
    restartAt,
    "The warning should contain the restart deadline"
  );
  Assert.ok(
    !restartRequested,
    "Displaying the warning did not request a restart"
  );

  const updated = await warningUI.showOrUpdate({
    phase: "imminent",
    restartAt,
    minutes: 4,
    restartNow,
  });

  Assert.ok(updated, "The warning should be updated");

  const updatedNotification = container.querySelector(
    '[value="enterprise-relaunch"]'
  );

  Assert.strictEqual(
    updatedNotification,
    notification,
    "The existing notification should be updated instead of creating another one"
  );

  await updatedNotification.updateComplete;

  Assert.equal(
    updatedNotification.getAttribute("type"),
    "critical",
    "The imminent warning should have the critical type"
  );

  ({ id, args } = document.l10n.getAttributes(updatedNotification.messageText));

  Assert.equal(
    id,
    "enterprise-relaunch-imminent-message",
    "The imminent warning should use the expected message"
  );
  Assert.equal(
    args.minutes,
    4,
    "The imminent warning should contain the remaining minutes"
  );

  const restartButton = updatedNotification.buttonContainer.querySelector(
    "button.notification-button"
  );

  Assert.ok(restartButton, "The notification should have a restart button");

  restartButton.click();

  Assert.ok(restartRequested, "The restart button should request a restart");

  warningUI.hide();

  Assert.ok(!warningUI.isVisible(), "The warning should be removed");
  Assert.ok(
    !container.querySelector('[value="enterprise-relaunch"]'),
    "The notification should be removed from its container"
  );
});
