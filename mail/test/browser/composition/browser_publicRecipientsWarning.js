/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the warning notification that appears when there are too many public
 * recipients.
 */

"use strict";

const {
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
const { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

let publicRecipientLimit = Services.prefs.getIntPref(
  "mail.compose.warn_public_recipients.threshold"
);

requestLongerTimeout(5);

/**
 * Test the warning displays when the "To" recipients list hits the limit.
 */
add_task(async function testWarningShowsWhenToFieldHitsLimit() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit),
    "Testing To Field",
    ""
  );

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );
  Assert.ok(
    notification,
    `warning shown when "To" recipients >= ${publicRecipientLimit}`
  );
  close_compose_window(cwc);
});

/**
 * Test the warning displays when the "Cc" recipients list hits the limit.
 */
add_task(async function testWarningShowsWhenCcFieldHitLimit() {
  let cwc = open_compose_new_mail();
  let label = cwc.window.document.getElementById("addr_cc");
  cwc.window.showAddressRow(label, "addressRowCc");
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit),
    "Testing Cc Field",
    "",
    "ccAddrInput"
  );

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );
  Assert.ok(
    notification,
    `warning shown when "To" recipients >= ${publicRecipientLimit}`
  );
  close_compose_window(cwc);
});

/**
 * Test the warning displays when both the "To" and "Cc" recipients lists
 * combined hit the limit.
 */
add_task(async function testWarningShowsWhenToAndCcFieldHitLimit() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit - 1),
    "Testing To and Cc Fields",
    ""
  );

  let label = cwc.window.document.getElementById("addr_cc");
  cwc.window.showAddressRow(label, "addressRowCc");
  setup_msg_contents(cwc, "test@example.org", "", "", "ccAddrInput");

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );
  Assert.ok(
    notification,
    `warning shown when "To" recipients > ${publicRecipientLimit}`
  );
  close_compose_window(cwc);
});

/**
 * Test the "To" recipients are moved to the "Bcc" field when the user selects
 * that option.
 */
add_task(async function testToRecipientsMovedToBcc() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit),
    "Testing move to Bcc",
    ""
  );

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  EventUtils.synthesizeMouseAtCenter(
    notification.querySelectorAll(".notification-button")[0],
    {},
    cwc.window
  );

  Assert.equal(
    cwc.window.document.querySelectorAll(
      "#bccAddrContainer > mail-address-pill"
    ).length,
    publicRecipientLimit,
    "Bcc field populated with addresses"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll("#toAddrContainer > mail-address-pill")
      .length,
    0,
    "addresses removed from the To field"
  );

  await TestUtils.waitForCondition(
    () =>
      !cwc.window.document.getElementById("warnPublicRecipientsNotification"),
    "public recipients warning was not removed in time"
  );
  close_compose_window(cwc);
});

/**
 * Test the "Cc" recipients are moved to the "Bcc" field when the user selects
 * that option.
 */
add_task(async function testCcRecipientsMovedToBcc() {
  let cwc = open_compose_new_mail();
  let label = cwc.window.document.getElementById("addr_cc");
  cwc.window.showAddressRow(label, "addressRowCc");
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit),
    "Testing move to Bcc",
    ""
  );

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  EventUtils.synthesizeMouseAtCenter(
    notification.querySelectorAll(".notification-button")[0],
    {},
    cwc.window
  );

  Assert.equal(
    cwc.window.document.querySelectorAll(
      "#bccAddrContainer > mail-address-pill"
    ).length,
    publicRecipientLimit,
    "Bcc field populated with addresses"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll("#ccAddrContainer > mail-address-pill")
      .length,
    0,
    "addresses removed from the Cc field"
  );

  await TestUtils.waitForCondition(
    () =>
      !cwc.window.document.getElementById("warnPublicRecipientsNotification"),
    "public recipients warning was not removed in time"
  );
  close_compose_window(cwc);
});

/**
 * Test that both the "To" and "Cc" recipients are moved to the "Bcc" field when
 * the user selects that option.
 */
add_task(async function testToAndCcRecipientsMovedToBcc() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit - 1),
    "Testing move to Bcc",
    ""
  );

  let label = cwc.window.document.getElementById("addr_cc");
  cwc.window.showAddressRow(label, "addressRowCc");
  setup_msg_contents(cwc, "test@example.org", "", "");

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  EventUtils.synthesizeMouseAtCenter(
    notification.querySelectorAll(".notification-button")[0],
    {},
    cwc.window
  );

  Assert.equal(
    cwc.window.document.querySelectorAll(
      "#bccAddrContainer > mail-address-pill"
    ).length,
    publicRecipientLimit,
    "Bcc field populated with addresses"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll("#toAddrContainer > mail-address-pill")
      .length,
    0,
    "addresses removed from the To field"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll("#ccAddrContainer > mail-address-pill")
      .length,
    0,
    "addresses removed from the Cc field"
  );

  await TestUtils.waitForCondition(
    () =>
      !cwc.window.document.getElementById("warnPublicRecipientsNotification"),
    "public recipients warning was not removed in time"
  );
  close_compose_window(cwc);
});

/**
 * Test the warning is removed when the user chooses to "Keep Recipients Public".
 */
add_task(async function testWarningRemovedWhenKeepPublic() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit),
    "Testing dismissal",
    ""
  );

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  EventUtils.synthesizeMouseAtCenter(
    notification.querySelectorAll(".notification-button")[1],
    {},
    cwc.window
  );

  await TestUtils.waitForCondition(() => {
    notification = cwc.window.document.getElementById(
      "warnPublicRecipientsNotification"
    );

    return !notification;
  }, "public recipients warning was not removed in time");

  Assert.ok(!notification, "public recipients warning was removed");

  Assert.equal(
    cwc.window.document.querySelectorAll("#toAddrContainer > mail-address-pill")
      .length,
    publicRecipientLimit,
    "addresses were not removed from the field"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll(
      "#bccAddrContainer > mail-address-pill"
    ).length,
    0,
    "no addresses added to the Bcc field"
  );
  close_compose_window(cwc);
});

/**
 * Test that the warning is not shown again if the user dismisses it.
 */
add_task(async function testWarningNotShownAfterDismissal() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(publicRecipientLimit),
    "Testing dismissal",
    ""
  );

  let notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  EventUtils.synthesizeMouseAtCenter(
    notification.querySelector(".messageCloseButton"),
    {},
    cwc.window
  );

  await TestUtils.waitForCondition(
    () =>
      !cwc.window.document.getElementById("warnPublicRecipientsNotification"),
    "public recipients warning was not removed in time"
  );

  let input = cwc.window.document.getElementById("toAddrInput");
  input.focus();
  cwc.type(input, "test@example.org,".repeat(publicRecipientLimit));

  // Wait a little in case the notification bar mistakenly appears.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  notification = cwc.window.document.getElementById(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(
    !notification,
    "public recipients warning did not appear after dismissal"
  );
  close_compose_window(cwc);
});
