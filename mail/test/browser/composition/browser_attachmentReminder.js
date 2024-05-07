/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the attachment reminder works properly.
 */

"use strict";

var {
  add_attachments,
  close_compose_window,
  compose_window_ready,
  open_compose_new_mail,
  save_compose_message,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var {
  be_in_folder,
  get_about_message,
  get_special_folder,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { delete_all_existing } = ChromeUtils.importESModule(
  "resource://testing-common/mail/KeyboardHelpers.sys.mjs"
);
var {
  assert_notification_displayed,
  check_notification_displayed,
  get_notification,
  get_notification_button,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);
var {
  click_menus_in_sequence,
  promise_modal_dialog,
  promise_new_window,
  wait_for_window_focused,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const aboutMessage = get_about_message();

var kBoxId = "compose-notification-bottom";
var kNotificationId = "attachmentReminder";
var kReminderPref = "mail.compose.attachment_reminder";
var gDrafts;
var gOutbox;

add_setup(async function () {
  requestLongerTimeout(4);

  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
  gOutbox = await get_special_folder(Ci.nsMsgFolderFlags.Queue);

  Assert.ok(Services.prefs.getBoolPref(kReminderPref));
});

/**
 * Check if the attachment reminder bar is in the wished state.
 *
 * @param {Window} aCwc - A compose window.
 * @param {boolean} aShown - True for expecting the bar to be shown, false otherwise.
 * @returns If the bar is shown, return the notification object.
 */
function assert_automatic_reminder_state(aCwc, aShown) {
  return assert_notification_displayed(aCwc, kBoxId, kNotificationId, aShown);
}

/**
 * Waits for the attachment reminder bar to change into the wished state.
 *
 * @param {Window} aCwc - A compose window.
 * @param {boolean} aShown - True for waiting for the bar to be shown, false
 *   for waiting for it to be hidden.
 * @param {boolean} [aDelay=false] - Set to true to sleep a while to give the
 *   notification time to change. This is used if the state is already what we
 *   want but we expect it could change in a short while.
 */
async function wait_for_reminder_state(aCwc, aShown, aDelay = false) {
  const notificationSlackTime = 5000;

  if (aShown) {
    if (aDelay) {
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => setTimeout(resolve, notificationSlackTime));
    }
    // This waits up to 30 seconds for the notification to appear.
    await wait_for_notification_to_show(aCwc, kBoxId, kNotificationId);
  } else if (check_notification_displayed(aCwc, kBoxId, kNotificationId)) {
    // This waits up to 30 seconds for the notification to disappear.
    await wait_for_notification_to_stop(aCwc, kBoxId, kNotificationId);
  } else {
    // This waits 5 seconds during which the notification must not appear.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, notificationSlackTime));
    assert_automatic_reminder_state(aCwc, false);
  }
}

/**
 * Check whether the manual reminder is in the proper state.
 *
 * @param {Window} aCwc - A compose window.
 * @param {boolean} aChecked - Whether the reminder should be enabled.
 */
function assert_manual_reminder_state(aCwc, aChecked) {
  const remindCommand = "cmd_remindLater";
  Assert.equal(
    aCwc.document
      .getElementById("button-attachPopup_remindLaterItem")
      .getAttribute("command"),
    remindCommand
  );

  const checkedValue = aChecked ? "true" : "false";
  Assert.equal(
    aCwc.document.getElementById(remindCommand).getAttribute("checked"),
    checkedValue
  );
}

/**
 * Returns the keywords string currently shown in the notification message.
 *
 * @param {Window} cwc - The compose window.
 */
function get_reminder_keywords(cwc) {
  assert_automatic_reminder_state(cwc, true);
  const box = get_notification(cwc, kBoxId, kNotificationId);
  return box.messageText.querySelector("#attachmentKeywords").textContent;
}

/**
 * Test that the attachment reminder works, in general.
 */
add_task(async function test_attachment_reminder_appears_properly() {
  const cwc = await open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  await setup_msg_contents(
    cwc,
    "test@example.org",
    "Testing automatic reminder!",
    "Hello! "
  );

  // Give the notification time to appear. It shouldn't.
  await wait_for_reminder_state(cwc, false);

  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Seen this cool attachment?", cwc);

  // Give the notification time to appear. It should now.
  await wait_for_reminder_state(cwc, true);

  // The manual reminder should be disabled yet.
  assert_manual_reminder_state(cwc, false);

  const box = get_notification(cwc, kBoxId, kNotificationId);
  // Click ok to be notified on send if no attachments are attached.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.lastElementChild,
    {},
    cwc
  );
  await wait_for_reminder_state(cwc, false);

  // The manual reminder should be enabled now.
  assert_manual_reminder_state(cwc, true);

  // Now try to send, make sure we get the alert.
  // Click the "Oh, I Did!" button in the attachment reminder dialog.
  const dialogPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  const buttonSend = cwc.document.getElementById("button-send");
  EventUtils.synthesizeMouseAtCenter(buttonSend, {}, buttonSend.ownerGlobal);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  // After confirming the reminder the menuitem should get disabled.
  assert_manual_reminder_state(cwc, false);

  await close_compose_window(cwc);
});

/**
 * Test that the alert appears normally, but not after closing the
 * notification.
 */
add_task(async function test_attachment_reminder_dismissal() {
  const cwc = await open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  await setup_msg_contents(
    cwc,
    "test@example.org",
    "popping up, eh?",
    "Hi there, remember the attachment! " +
      "Yes, there is a file test.doc attached! " +
      "Do check it, test.doc is a nice attachment."
  );

  // Give the notification time to appear.
  await wait_for_reminder_state(cwc, true);

  Assert.equal(get_reminder_keywords(cwc), "test.doc, attachment, attached");

  // We didn't click the "Remind Me Later" - the alert should pop up
  // on send anyway.
  // Click the "Oh, I Did!" button in the attachment reminder dialog.
  const dialogPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  const buttonSend = cwc.document.getElementById("button-send");
  EventUtils.synthesizeMouseAtCenter(buttonSend, {}, buttonSend.ownerGlobal);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  const notification = assert_automatic_reminder_state(cwc, true);

  notification.close();
  assert_automatic_reminder_state(cwc, false);

  await click_send_and_handle_send_error(cwc);

  await close_compose_window(cwc);
});

/**
 * Bug 938829
 * Check that adding an attachment actually hides the notification.
 */
add_task(async function test_attachment_reminder_with_attachment() {
  const cwc = await open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  await setup_msg_contents(
    cwc,
    "test@example.org",
    "Testing automatic reminder!",
    "Hello! We will have a real attachment here."
  );

  // Give the notification time to appear. It should.
  await wait_for_reminder_state(cwc, true);

  // Add an attachment.
  const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
  file.append("prefs.js");
  Assert.ok(
    file.exists(),
    "The required file prefs.js was not found in the profile."
  );
  const attachments = [cwc.FileToAttachment(file)];
  cwc.AddAttachments(attachments);

  // The notification should hide.
  await wait_for_reminder_state(cwc, false);

  // Add some more text with keyword so the automatic notification
  // could potentially show up.
  await setup_msg_contents(cwc, "", "", " Yes, there is a file attached!");
  // Give the notification time to appear. It shouldn't.
  await wait_for_reminder_state(cwc, false);

  cwc.RemoveAllAttachments();

  // After removing the attachment, notification should come back
  // with all the keywords, even those input while having an attachment.
  await wait_for_reminder_state(cwc, true);
  Assert.equal(get_reminder_keywords(cwc), "attachment, attached");

  await close_compose_window(cwc);
});

/**
 * Test that the mail.compose.attachment_reminder_aggressive pref works.
 */
add_task(async function test_attachment_reminder_aggressive_pref() {
  const kPref = "mail.compose.attachment_reminder_aggressive";
  Services.prefs.setBoolPref(kPref, false);

  const cwc = await open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  await setup_msg_contents(
    cwc,
    "test@example.org",
    "aggressive?",
    "Check this attachment!"
  );

  await wait_for_reminder_state(cwc, true);
  await click_send_and_handle_send_error(cwc);

  await close_compose_window(cwc);

  // Now reset the pref back to original value.
  if (Services.prefs.prefHasUserValue(kPref)) {
    Services.prefs.clearUserPref(kPref);
  }
});

/**
 * Test that clicking "No, Send Now" in the attachment reminder alert
 * works.
 */
add_task(async function test_no_send_now_sends() {
  const cwc = await open_compose_new_mail();

  await setup_msg_contents(
    cwc,
    "test@example.org",
    "will the 'No, Send Now' button work?",
    "Hello, I got your attachment!"
  );

  await wait_for_reminder_state(cwc, true);

  // Click the send button again, this time choose "No, Send Now".
  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  const buttonSend = cwc.document.getElementById("button-send");
  EventUtils.synthesizeMouseAtCenter(buttonSend, {}, buttonSend.ownerGlobal);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  // After clicking "Send Now" sending is proceeding, just handle the error.
  await click_send_and_handle_send_error(cwc, true);

  // We're now back in the compose window, let's close it then.
  await close_compose_window(cwc);
});

/**
 * Click the manual reminder in the menu.
 *
 * @param {Window} aCwc - A compose window.
 * @param {boolean} aExpectedState - The expected state of the reminder
 *   menuitem after the click.
 */
async function click_manual_reminder(aCwc, aExpectedState) {
  await wait_for_window_focused(aCwc);
  const button = aCwc.document.getElementById("button-attach");

  const popup = aCwc.document.getElementById("button-attachPopup");
  const shownPromise = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    button.querySelector(".toolbarbutton-menubutton-dropmarker"),
    {},
    aCwc
  );
  await shownPromise;
  const hiddenPromise = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.activateItem(
    aCwc.document.getElementById("button-attachPopup_remindLaterItem")
  );
  await hiddenPromise;
  await wait_for_window_focused(aCwc);
  assert_manual_reminder_state(aCwc, aExpectedState);
}

/**
 * Bug 521128
 * Test proper behaviour of the manual reminder.
 */
add_task(async function test_manual_attachment_reminder() {
  // Open a sample message with no attachment keywords.
  let cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing manual reminder!",
    "Some body..."
  );

  // Enable the manual reminder.
  await click_manual_reminder(cwc, true);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Now close the message with saving it as draft.
  let dialogPromise = promise_modal_dialog(
    "commonDialogWindow",
    click_save_message
  );
  cwc.goDoCommand("cmd_close");
  await dialogPromise;

  // Open another blank compose window.
  cwc = await open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  await close_compose_window(cwc);

  // The draft message was saved into Local Folders/Drafts.
  await be_in_folder(gDrafts);

  await select_click_row(0);
  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // Edit the draft again...
  const composePromise = promise_new_window("msgcompose");
  const box = get_notification(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // ... by clicking Edit in the draft message notification bar.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  cwc = await compose_window_ready(composePromise);

  // Check the reminder enablement was preserved in the message.
  assert_manual_reminder_state(cwc, true);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Now try to send, make sure we get the alert.
  // Click the "Oh, I Did!" button in the attachment reminder dialog.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  const buttonSend = cwc.document.getElementById("button-send");
  EventUtils.synthesizeMouseAtCenter(buttonSend, {}, buttonSend.ownerGlobal);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  // We were alerted once and the manual reminder is automatically turned off.
  assert_manual_reminder_state(cwc, false);

  // Enable the manual reminder and disable it again to see if it toggles right.
  await click_manual_reminder(cwc, true);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));
  await click_manual_reminder(cwc, false);

  // Now try to send again, there should be no more alert.
  await click_send_and_handle_send_error(cwc);

  await close_compose_window(cwc);

  // Delete the leftover draft message.
  await press_delete();
}).skip(AppConstants.platform == "linux"); // See bug 1535292.

/**
 * Bug 938759
 * Test hiding of the automatic notification if the manual reminder is set.
 */
add_task(
  async function test_manual_automatic_attachment_reminder_interaction() {
    // Open a blank message compose
    const cwc = await open_compose_new_mail();
    // This one should have the reminder disabled.
    assert_manual_reminder_state(cwc, false);
    // There should be no attachment notification.
    assert_automatic_reminder_state(cwc, false);

    // Add some attachment keywords.
    await setup_msg_contents(
      cwc,
      "test@example.invalid",
      "Testing manual reminder!",
      "Expect an attachment here..."
    );

    // The automatic attachment notification should pop up.
    await wait_for_reminder_state(cwc, true);

    // Now enable the manual reminder.
    await click_manual_reminder(cwc, true);
    // The attachment notification should disappear.
    await wait_for_reminder_state(cwc, false);

    // Add some more text so the automatic notification
    // could potentially show up.
    await setup_msg_contents(cwc, "", "", " and look for your attachment!");
    // Give the notification time to appear. It shouldn't.
    await wait_for_reminder_state(cwc, false);

    // Now disable the manual reminder.
    await click_manual_reminder(cwc, false);
    // Give the notification time to appear. It shouldn't.
    await wait_for_reminder_state(cwc, false);

    // Add some more text without keywords.
    await setup_msg_contents(cwc, "", "", " No keywords here.");
    // Give the notification time to appear. It shouldn't.
    await wait_for_reminder_state(cwc, false);

    // Add some more text with a new keyword.
    await setup_msg_contents(cwc, "", "", " Do you find it attached?");
    // Give the notification time to appear. It should now.
    await wait_for_reminder_state(cwc, true);
    Assert.equal(get_reminder_keywords(cwc), "attachment, attached");

    await close_compose_window(cwc);
  }
);

/**
 * Assert if there is any notification in the compose window.
 *
 * @param {Window} aCwc - Compose window.
 * @param {boolean} aValue - True if notification should exist. False otherwise.
 */
function assert_any_notification(aCwc, aValue) {
  const notification = aCwc.document.getElementById(kBoxId).currentNotification;
  if ((notification == null) == aValue) {
    throw new Error("Notification in wrong state");
  }
}

/**
 * Bug 989653
 * Send filelink attachment should not trigger the attachment reminder.
 */
add_task(async function test_attachment_vs_filelink_reminder() {
  // Open a blank message compose
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing Filelink notification",
    "There is no body. I hope you don't mind!"
  );

  // There should be no notification yet.
  assert_any_notification(cwc, false);

  // Bring up the FileLink notification.
  const kOfferThreshold = "mail.compose.big_attachments.threshold_kb";
  const maxSize = Services.prefs.getIntPref(kOfferThreshold, 0) * 1024;
  const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
  file.append("prefs.js");
  await add_attachments(cwc, Services.io.newFileURI(file).spec, maxSize);

  // The filelink attachment proposal should be up but not the attachment
  // reminder and it should also not interfere with the sending of the message.
  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachment");
  assert_automatic_reminder_state(cwc, false);

  await click_send_and_handle_send_error(cwc);
  await close_compose_window(cwc);
});

/**
 * Bug 944643
 * Test the attachment reminder coming up when keyword is in subject line.
 */
add_task(async function test_attachment_reminder_in_subject() {
  // Open a blank message compose
  const cwc = await open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some attachment keyword in subject.
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing attachment reminder!",
    "There is no keyword in this body..."
  );

  // The automatic attachment notification should pop up.
  await wait_for_reminder_state(cwc, true);
  Assert.equal(get_reminder_keywords(cwc), "attachment");

  // Now clear the subject
  delete_all_existing(cwc, cwc.document.getElementById("msgSubject"));

  // Give the notification time to disappear.
  await wait_for_reminder_state(cwc, false);

  await close_compose_window(cwc);
});

/**
 * Bug 944643
 * Test the attachment reminder coming up when keyword is in subject line
 * and also body.
 */
add_task(async function test_attachment_reminder_in_subject_and_body() {
  // Open a blank message compose
  const cwc = await open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some attachment keyword in subject.
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing attachment reminder!",
    "There should be an attached file in this body..."
  );

  // The automatic attachment notification should pop up.
  await wait_for_reminder_state(cwc, true);
  Assert.equal(get_reminder_keywords(cwc), "attachment, attached");

  // Now clear only the subject
  delete_all_existing(cwc, cwc.document.getElementById("msgSubject"));

  // Give the notification some time. It should not disappear,
  // just reduce the keywords list.
  await wait_for_reminder_state(cwc, true, true);
  Assert.equal(get_reminder_keywords(cwc), "attached");

  await close_compose_window(cwc);
});

/**
 * Bug 1099866
 * Test proper behaviour of attachment reminder when keyword reminding
 * is turned off.
 */
add_task(async function test_disabled_attachment_reminder() {
  Services.prefs.setBoolPref(kReminderPref, false);

  // Open a sample message with no attachment keywords.
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing disabled keyword reminder!",
    "Some body..."
  );

  // This one should have the manual reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some keyword so the automatic notification
  // could potentially show up.
  await setup_msg_contents(cwc, "", "", " and look for your attachment!");
  // Give the notification time to appear. It shouldn't.
  await wait_for_reminder_state(cwc, false);

  // Enable the manual reminder.
  await click_manual_reminder(cwc, true);
  assert_automatic_reminder_state(cwc, false);

  // Disable the manual reminder and the notification should still be hidden
  // even when there are still keywords in the body.
  await click_manual_reminder(cwc, false);
  assert_automatic_reminder_state(cwc, false);

  // There should be no attachment message upon send.
  await click_send_and_handle_send_error(cwc);

  await close_compose_window(cwc);

  Services.prefs.setBoolPref(kReminderPref, true);
});

/**
 * Bug 833909
 * Test reminder comes up when a draft with keywords is opened.
 */
add_task(async function test_reminder_in_draft() {
  // Open a sample message with no attachment keywords.
  let cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing draft reminder!",
    "Some body..."
  );

  // This one should have the manual reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some keyword so the automatic notification
  // could potentially show up.
  await setup_msg_contents(cwc, "", "", " and look for your attachment!");

  // Give the notification time to appear.
  await wait_for_reminder_state(cwc, true);

  // Now close the message with saving it as draft.
  await save_compose_message(cwc);
  await close_compose_window(cwc);

  // The draft message was saved into Local Folders/Drafts.
  await be_in_folder(gDrafts);

  await select_click_row(0);
  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // Edit the draft again...
  const composePromise = promise_new_window("msgcompose");
  const box = get_notification(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // ... by clicking Edit in the draft message notification bar.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  cwc = await compose_window_ready(composePromise);

  // Give the notification time to appear.
  await wait_for_reminder_state(cwc, true);

  await close_compose_window(cwc);

  // Delete the leftover draft message.
  await press_delete();
});

/**
 * Bug 942436
 * Test that the reminder can be turned off for the current message.
 */
add_task(async function test_disabling_attachment_reminder() {
  // Open a sample message with attachment keywords.
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing turning off the reminder",
    "Some attachment keywords here..."
  );

  // This one should have the manual reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be an attachment reminder.
  await wait_for_reminder_state(cwc, true);

  // Disable the reminder (not just dismiss) using the menuitem
  // in the notification bar menu-button.
  let disableButton = get_notification_button(cwc, kBoxId, kNotificationId, {
    popup: "reminderBarPopup",
  });
  let dropmarker = disableButton.querySelector("dropmarker");
  EventUtils.synthesizeMouseAtCenter(dropmarker, {}, dropmarker.ownerGlobal);
  await click_menus_in_sequence(
    disableButton.closest("toolbarbutton").querySelector("menupopup"),
    [{ id: "disableReminder" }]
  );

  await wait_for_reminder_state(cwc, false);

  // Add more keywords.
  await setup_msg_contents(cwc, "", "", "... and another file attached.");
  // Give the notification time to appear. It shouldn't.
  await wait_for_reminder_state(cwc, false);

  // Enable the manual reminder.
  // This overrides the previous explicit disabling of any reminder.
  await click_manual_reminder(cwc, true);
  assert_automatic_reminder_state(cwc, false);

  // Disable the manual reminder and the notification should still be hidden
  // even when there are still keywords in the body.
  await click_manual_reminder(cwc, false);
  assert_automatic_reminder_state(cwc, false);

  // Add more keywords to trigger automatic reminder.
  await setup_msg_contents(cwc, "", "", "I enclosed another file.");
  // Give the notification time to appear. It should now.
  await wait_for_reminder_state(cwc, true);

  // Disable the reminder again.
  disableButton = get_notification_button(cwc, kBoxId, kNotificationId, {
    popup: "reminderBarPopup",
  });
  dropmarker = disableButton.querySelector("dropmarker");
  EventUtils.synthesizeMouseAtCenter(dropmarker, {}, dropmarker.ownerGlobal);
  await click_menus_in_sequence(
    disableButton.closest("toolbarbutton").querySelector("menupopup"),
    [{ id: "disableReminder" }]
  );
  await wait_for_reminder_state(cwc, false);

  // Now send the message.
  const closePromise = BrowserTestUtils.domWindowClosed(cwc);
  cwc.goDoCommand("cmd_sendLater");
  await closePromise;

  // There should be no alert so it is saved in Outbox.
  await be_in_folder(gOutbox);

  await select_click_row(0);
  // Delete the leftover outgoing message.
  await press_delete();

  // Get back to the mail account for other tests.
  const mail = MailServices.accounts.defaultAccount.incomingServer.rootFolder;
  await be_in_folder(mail);
});

/**
 * Click the send button and handle the send error dialog popping up.
 * It will return us back to the compose window.
 *
 * @param {Window} aWin
 * @param {boolean} aAlreadySending - Set this to true if sending was already
 *   triggered by other means.
 */
async function click_send_and_handle_send_error(aWin, aAlreadySending) {
  const dialogPromise = promise_modal_dialog(
    "commonDialogWindow",
    click_ok_on_send_error
  );
  if (!aAlreadySending) {
    const buttonSend = aWin.document.getElementById("button-send");
    EventUtils.synthesizeMouseAtCenter(buttonSend, {}, buttonSend.ownerGlobal);
  }
  await dialogPromise;
  await TestUtils.waitForTick();
}

/**
 * Click Ok in the Send Message Error dialog.
 */
function click_ok_on_send_error(win) {
  if (win.document.title != "Send Message Error") {
    throw new Error("Not a send error dialog; title=" + win.document.title);
  }
  win.document.querySelector("dialog").getButton("accept").doCommand();
}

/**
 * Click Save in the Save message dialog.
 */
function click_save_message(win) {
  if (win.document.title != "Save Message") {
    throw new Error("Not a Save message dialog; title=" + win.document.title);
  }
  win.document.querySelector("dialog").getButton("accept").doCommand();
}
