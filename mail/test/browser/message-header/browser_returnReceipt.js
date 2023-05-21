/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test return receipt (MDN) stuff.
 */

"use strict";

var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  create_message,
  get_about_message,
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { assert_notification_displayed } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);

var folder;

var kBoxId = "mail-notification-top";
var kNotificationValue = "mdnRequested";

add_setup(async function () {
  folder = await create_folder("ReturnReceiptTest");

  // Create a message that requests a return receipt.
  let msg0 = create_message({
    from: ["Ake", "ake@example.com"],
    clobberHeaders: { "Disposition-Notification-To": "ake@example.com" },
  });
  await add_message_to_folder([folder], msg0);

  // ... and one that doesn't request a return receipt.
  let msg1 = create_message();
  await add_message_to_folder([folder], msg1);

  // Create a message that requests a return receipt to a different address.
  let msg2 = create_message({
    from: ["Mimi", "me@example.org"],
    clobberHeaders: { "Disposition-Notification-To": "other@example.com" },
  });
  await add_message_to_folder([folder], msg2);

  // Create a message that requests a return receipt to different addresses.
  let msg3 = create_message({
    from: ["Bobby", "bob@example.org"],
    clobberHeaders: {
      "Disposition-Notification-To": "ex1@example.com, ex2@example.com",
    },
  });
  await add_message_to_folder([folder], msg3);

  // Create a message that requests a return receipt using non-standard header.
  let msg4 = create_message({
    from: ["Ake", "ake@example.com"],
    clobberHeaders: { "Return-Receipt-To": "ake@example.com" },
  });
  await add_message_to_folder([folder], msg4);

  // Create a message that requests a return receipt to a different address
  // using non-standard header.
  let msg5 = create_message({
    from: ["Mimi", "me@example.org"],
    clobberHeaders: { "Return-Receipt-To": "other@example.com" },
  });
  await add_message_to_folder([folder], msg5);

  // Create a message that requests a return receipt to different addresses
  // using non-standard header.
  let msg6 = create_message({
    from: ["Bobby", "bob@example.org"],
    clobberHeaders: { "Return-Receipt-To": "ex1@example.com, ex2@example.com" },
  });
  await add_message_to_folder([folder], msg6);

  await be_in_folder(folder);
});

/** Utility to select a message. */
function gotoMsg(row) {
  let curMessage = select_click_row(row);
  assert_selected_and_displayed(mc, curMessage);
}

/**
 * Utility to make sure the MDN bar is shown / not shown.
 */
function assert_mdn_shown(shouldShow) {
  assert_notification_displayed(
    get_about_message(),
    kBoxId,
    kNotificationValue,
    shouldShow
  );
}

/**
 * Utility function to make sure the notification contains a certain text.
 */
function assert_mdn_text_contains(text, shouldContain) {
  let nb = get_about_message().document.getElementById(kBoxId);
  let box = nb.querySelector(".notificationbox-stack")._notificationBox;
  let notificationText = box.currentNotification.messageText.textContent;
  if (shouldContain && !notificationText.includes(text)) {
    throw new Error(
      "mdnBar should contain text=" +
        text +
        "; notificationText=" +
        notificationText
    );
  }
  if (!shouldContain && notificationText.includes(text)) {
    throw new Error(
      "mdnBar shouldn't contain text=" +
        text +
        "; notificationText=" +
        notificationText
    );
  }
}

/**
 * Test that return receipts are not shown when Disposition-Notification-To
 * and Return-Receipt-To isn't set.
 */
add_task(function test_no_mdn_for_normal_msgs() {
  gotoMsg(0); // TODO this shouldn't be needed but the selection goes to 0 on focus.
  gotoMsg(1); // This message doesn't request a return receipt.
  assert_mdn_shown(false);
});

/**
 * Test that return receipts are shown when Disposition-Notification-To is set.
 */
add_task(function test_basic_mdn_shown() {
  gotoMsg(0); // This message requests a return receipt.
  assert_mdn_shown(true);
  assert_mdn_text_contains("ake@example.com", false); // only name should show
});

/**
 * Test that return receipts are shown when Return-Receipt-To is set.
 */
add_task(function test_basic_mdn_shown_nonrfc() {
  gotoMsg(4); // This message requests a return receipt.
  assert_mdn_shown(true);
  assert_mdn_text_contains("ake@example.com", false); // only name should show
});

/**
 * Test that return receipts warns when the mdn address is different.
 * The RFC compliant version.
 */
add_task(function test_mdn_when_from_and_disposition_to_differs() {
  gotoMsg(2); // Should display a notification with warning.
  assert_mdn_shown(true);
  assert_mdn_text_contains("other@example.com", true); // address should show
});

/**
 * Test that return receipts warns when the mdn address is different.
 * The RFC non-compliant version.
 */
add_task(function test_mdn_when_from_and_disposition_to_differs_nonrfc() {
  gotoMsg(5); // Should display a notification with warning.
  assert_mdn_shown(true);
  assert_mdn_text_contains("other@example.com", true); // address should show
});

/**
 * Test that return receipts warns when the mdn address consists of multiple
 * addresses.
 */
add_task(function test_mdn_when_disposition_to_multi() {
  gotoMsg(3);
  // Should display a notification with warning listing all the addresses.
  assert_mdn_shown(true);
  assert_mdn_text_contains("ex1@example.com", true);
  assert_mdn_text_contains("ex2@example.com", true);
});

/**
 * Test that return receipts warns when the mdn address consists of multiple
 * addresses. Non-RFC compliant version.
 */
add_task(function test_mdn_when_disposition_to_multi_nonrfc() {
  gotoMsg(6);
  // Should display a notification with warning listing all the addresses.
  assert_mdn_shown(true);
  assert_mdn_text_contains("ex1@example.com", true);
  assert_mdn_text_contains("ex2@example.com", true);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
