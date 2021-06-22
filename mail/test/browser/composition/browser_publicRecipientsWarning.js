/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the warning notification that appears when there are too many public
 * recipients.
 */

"use strict";

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var {
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { close_window } = ChromeUtils.import(
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
  let i = 1;

  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing To Field",
    ""
  );

  Assert.ok(
    cwc.window.gComposeNotification.getNotificationWithValue(
      "warnPublicRecipientsNotification"
    ),
    `warning shown when "To" recipients >= ${publicRecipientLimit}`
  );

  close_compose_window(cwc);
});

/**
 * Test the warning displays when the "Cc" recipients list hits the limit.
 */
add_task(async function testWarningShowsWhenCcFieldHitLimit() {
  let cwc = open_compose_new_mail();

  // Click on the Cc recipient label.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  // The Cc field should now be visible.
  Assert.ok(
    !cwc.window.document
      .getElementById("ccAddrInput")
      .closest(".addressingWidgetItem")
      .classList.contains("hidden"),
    "The Cc field is visible"
  );

  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing Cc Field",
    "",
    "ccAddrInput"
  );

  Assert.ok(
    cwc.window.gComposeNotification.getNotificationWithValue(
      "warnPublicRecipientsNotification"
    ),
    `warning shown when "Cc" recipients >= ${publicRecipientLimit}`
  );

  close_compose_window(cwc);
});

/**
 * Test the warning displays when both the "To" and "Cc" recipients lists
 * combined hit the limit.
 */
add_task(async function testWarningShowsWhenToAndCcFieldHitLimit() {
  let cwc = open_compose_new_mail();

  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit - 1)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing To and Cc Fields",
    ""
  );

  // Click on the Cc recipient label.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  // The Cc field should now be visible.
  Assert.ok(
    !cwc.window.document
      .getElementById("ccAddrInput")
      .closest(".addressingWidgetItem")
      .classList.contains("hidden"),
    "The Cc field is visible"
  );

  setup_msg_contents(cwc, "test@example.org", "", "", "ccAddrInput");

  Assert.ok(
    cwc.window.gComposeNotification.getNotificationWithValue(
      "warnPublicRecipientsNotification"
    ),
    `warning shown when "To" and "Cc" recipients >= ${publicRecipientLimit}`
  );

  close_compose_window(cwc);
});

/**
 * Test the "To" recipients are moved to the "Bcc" field when the user selects
 * that option.
 */
add_task(async function testToRecipientsMovedToBcc() {
  let cwc = open_compose_new_mail();
  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing move to Bcc",
    ""
  );

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
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

  await notificationHidden;

  close_compose_window(cwc);
});

/**
 * Test that all the "To" recipients are moved to the "Bcc" field when the
 * address count is over the limit.
 */
add_task(async function testAllToRecipientsMovedToBccWhenOverLimit() {
  let cwc = open_compose_new_mail();
  let limit = publicRecipientLimit + 1;
  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(limit).replace(/test@/g, () => `test${i++}@`),
    "Testing move to Bcc",
    ""
  );

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
    {},
    cwc.window
  );

  Assert.equal(
    cwc.window.document.querySelectorAll(
      "#bccAddrContainer > mail-address-pill"
    ).length,
    limit,
    "Bcc field populated with addresses"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll("#toAddrContainer > mail-address-pill")
      .length,
    0,
    "addresses removed from the To field"
  );

  await notificationHidden;

  close_compose_window(cwc);
});

/**
 * Test the "Cc" recipients are moved to the "Bcc" field when the user selects
 * that option.
 */
add_task(async function testCcRecipientsMovedToBcc() {
  let cwc = open_compose_new_mail();

  // Click on the Cc recipient label.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  // The Cc field should now be visible.
  Assert.ok(
    !cwc.window.document
      .getElementById("ccAddrInput")
      .closest(".addressingWidgetItem")
      .classList.contains("hidden"),
    "The Cc field is visible"
  );

  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing move to Bcc",
    ""
  );

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
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

  await notificationHidden;

  close_compose_window(cwc);
});

/**
 * Test that all the "Cc" recipients are moved to the "Bcc" field when the
 * address count is over the limit.
 */
add_task(async function testAllCcRecipientsMovedToBccWhenOverLimit() {
  let cwc = open_compose_new_mail();
  let limit = publicRecipientLimit + 1;

  // Click on the Cc recipient label.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  // The Cc field should now be visible.
  Assert.ok(
    !cwc.window.document
      .getElementById("ccAddrInput")
      .closest(".addressingWidgetItem")
      .classList.contains("hidden"),
    "The Cc field is visible"
  );

  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,".repeat(limit).replace(/test@/g, () => `test${i++}@`),
    "Testing move to Bcc",
    ""
  );

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
    {},
    cwc.window
  );

  Assert.equal(
    cwc.window.document.querySelectorAll(
      "#bccAddrContainer > mail-address-pill"
    ).length,
    limit,
    "Bcc field populated with addresses"
  );

  Assert.equal(
    cwc.window.document.querySelectorAll("#ccAddrContainer > mail-address-pill")
      .length,
    0,
    "addresses removed from the Cc field"
  );

  await notificationHidden;

  close_compose_window(cwc);
});

/**
 * Test that both the "To" and "Cc" recipients are moved to the "Bcc" field when
 * the user selects that option.
 */
add_task(async function testToAndCcRecipientsMovedToBcc() {
  let cwc = open_compose_new_mail();
  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit - 1)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing move to Bcc",
    ""
  );

  // Click on the Cc recipient label.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  // The Cc field should now be visible.
  Assert.ok(
    !cwc.window.document
      .getElementById("ccAddrInput")
      .closest(".addressingWidgetItem")
      .classList.contains("hidden"),
    "The Cc field is visible"
  );
  setup_msg_contents(cwc, "test@example.org", "", "");

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
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

  await notificationHidden;

  close_compose_window(cwc);
});

/**
 * Test the warning is removed when the user chooses to "Keep Recipients Public".
 */
add_task(async function testWarningRemovedWhenKeepPublic() {
  let cwc = open_compose_new_mail();
  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing dismissal",
    ""
  );

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.lastElementChild,
    {},
    cwc.window
  );

  await notificationHidden;

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
  let i = 1;
  setup_msg_contents(
    cwc,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`),
    "Testing dismissal",
    ""
  );

  let notificationBox = cwc.window.gComposeNotification;

  let notification = notificationBox.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );

  Assert.ok(notification, "public recipients warning appeared");

  let notificationHidden = BrowserTestUtils.waitForCondition(
    () =>
      !notificationBox.getNotificationWithValue(
        "warnPublicRecipientsNotification"
      ),
    "public recipients warning was not removed in time"
  );

  EventUtils.synthesizeMouseAtCenter(notification.closeButton, {}, cwc.window);

  await notificationHidden;

  let input = cwc.window.document.getElementById("toAddrInput");
  input.focus();

  cwc.type(
    input,
    "test@example.org,"
      .repeat(publicRecipientLimit)
      .replace(/test@/g, () => `test${i++}@`)
  );

  // Wait a little in case the notification bar mistakenly appears.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  Assert.ok(
    !notificationBox.getNotificationWithValue(
      "warnPublicRecipientsNotification"
    ),
    "public recipients warning did not appear after dismissal"
  );
  close_compose_window(cwc);
});

/**
 * Tests that the individual addresses of a mailing list are considered.
 */
add_task(async function testMailingListMembersCounted() {
  let book = MailServices.ab.getDirectoryFromId(
    MailServices.ab.newAddressBook("Mochitest", null, 101)
  );
  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "Test List";
  list = book.addMailList(list);

  for (let i = 0; i < publicRecipientLimit; i++) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.primaryEmail = `test${i}@example`;
    list.addCard(card);
  }
  list.editMailListToDatabase(null);

  let cwc = open_compose_new_mail();
  setup_msg_contents(cwc, "Test List", "Testing mailing lists", "");

  let notification = cwc.window.gComposeNotification.getNotificationWithValue(
    "warnPublicRecipientsNotification"
  );
  Assert.ok(notification, "public recipients warning appeared");

  Assert.equal(
    notification.messageText.textContent,
    `The ${publicRecipientLimit} recipients in To and Cc will see each other’s address. You can avoid disclosing recipients by using Bcc instead.`,
    "total count equals all addresses plus list expanded"
  );

  MailServices.ab.deleteAddressBook(book.URI);
  close_compose_window(cwc);
});
