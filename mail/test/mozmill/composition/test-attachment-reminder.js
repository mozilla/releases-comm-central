/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the attachment reminder works properly.
 */

// make SOLO_TEST=composition/test-attachment-reminder.js mozmill-one

var MODULE_NAME = "test-attachment-reminder";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers",
                         "compose-helpers",
                         "window-helpers",
                         "notificationbox-helpers",
                         "keyboard-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");

var kBoxId = "attachmentNotificationBox";
var kNotificationId = "attachmentReminder";
var kReminderPref = "mail.compose.attachment_reminder";

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  assert_true(Services.prefs.getBoolPref(kReminderPref));
}

function setupComposeWin(aCwc, toAddr, subj, body) {
  aCwc.type(aCwc.eid("addressCol2#1"), toAddr);
  aCwc.type(aCwc.eid("msgSubject"), subj);
  aCwc.type(aCwc.eid("content-frame"), body);
}

/**
 * Check if the attachment reminder bar is in the wished state.
 *
 * @param aCwc    A compose window controller.
 * @param aShown  True for expecting the bar to be shown, false otherwise.
 *
 * @return        If the bar is shown, return the notification object.
 */
function assert_automatic_reminder_state(aCwc, aShown) {
  return assert_notification_displayed(aCwc, kBoxId, kNotificationId, aShown);
}

/**
 * Waits for the attachment reminder bar to change into the wished state.
 *
 * @param aCwc    A compose window controller.
 * @param aShown  True for waiting for the bar to be shown, false otherwise.
 * @param aDelay  Set to true to sleep a while to give the notification time
 *                to change. This is used if the state is already what we want
 *                but we expect it could change in a short while.
 */
function wait_for_reminder_state(aCwc, aShown, aDelay = false) {
  const notificationSlackTime = 5000;

  if (aShown) {
    if (aDelay)
      aCwc.sleep(notificationSlackTime);
    // This waits up to 30 seconds for the notification to appear.
    wait_for_notification_to_show(aCwc, kBoxId, kNotificationId);
  } else if (check_notification_displayed(aCwc, kBoxId, kNotificationId)) {
    // This waits up to 30 seconds for the notification to disappear.
    wait_for_notification_to_stop(aCwc, kBoxId, kNotificationId);
  } else {
    // This waits 5 seconds during which the notification must not appear.
    aCwc.sleep(notificationSlackTime);
    assert_automatic_reminder_state(aCwc, false);
  }
}

/**
 * Check whether the manual reminder is in the proper state.
 *
 * @param aCwc      A compose window controller.
 * @param aChecked  Whether the reminder should be enabled.
 */
function assert_manual_reminder_state(aCwc, aChecked) {
  const remindCommand = "cmd_remindLater";
  assert_equals(aCwc.e("button-attachPopup_remindLaterItem").getAttribute("command"),
                remindCommand);

  let checkedValue = aChecked ? "true" : "false";
  assert_equals(aCwc.e(remindCommand).getAttribute("checked"), checkedValue);
}

/**
 * Returns the keywords string currently shown in the notification message.
 *
 * @param aCwc A compose window controller.
 */
function get_reminder_keywords(aCwc) {
  assert_automatic_reminder_state(aCwc, true);
  let nBox = aCwc.e(kBoxId);
  let notification = nBox.getNotificationWithValue(kNotificationId);
  return notification.querySelector("#attachmentKeywords").getAttribute("value");
}


/**
 * Test that the attachment reminder works, in general.
 */
function test_attachment_reminder_appears_properly() {
  let cwc = open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  setupComposeWin(cwc, "test@example.org", "Testing automatic reminder!",
                  "Hello! ");

  // Give the notification time to appear. It shouldn't.
  wait_for_reminder_state(cwc, false);

  cwc.type(cwc.eid("content-frame"), "Seen this cool attachment?");

  // Give the notification time to appear. It should now.
  wait_for_reminder_state(cwc, true);

  // The manual reminder should be disabled yet.
  assert_manual_reminder_state(cwc, false);

  // Click ok to be notified on send if no attachments are attached.
  cwc.click(cwc.eid(kBoxId, {tagName: "button", label: "Remind Me Later"}));

  // The manual reminder should be enabled now.
  assert_manual_reminder_state(cwc, true);

  // Now try to send, make sure we get the alert.
  plan_for_modal_dialog("commonDialog", click_oh_i_did);
  cwc.click(cwc.eid("button-send"));
  wait_for_modal_dialog("commonDialog");

  // After confirming the reminder the menuitem should get disabled.
  assert_manual_reminder_state(cwc, false);

  close_compose_window(cwc);
}

/**
 * Test that the alert appears normally, but not after closing the
 * notification.
 */
function test_attachment_reminder_dismissal() {
  let cwc = open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  setupComposeWin(cwc, "test@example.org", "popping up, eh?",
                  "Hi there, remember the attachment! " +
                  "Yes, there is a file test.doc attached! " +
                  "Do check it, test.doc is a nice attachment.");

  // Give the notification time to appear.
  wait_for_reminder_state(cwc, true);

  assert_equals(get_reminder_keywords(cwc), "test.doc, attachment, attached");

  // We didn't click the "Remind Me Later" - the alert should pop up
  // on send anyway.
  plan_for_modal_dialog("commonDialog", click_oh_i_did);
  cwc.click(cwc.eid("button-send"));
  wait_for_modal_dialog("commonDialog");

  let notification = assert_automatic_reminder_state(cwc, true);

  notification.close();
  assert_automatic_reminder_state(cwc, false);

  click_send_and_handle_send_error(cwc);

  close_compose_window(cwc);
}

/**
 * Bug 938829
 * Check that adding an attachment actually hides the notification.
 */
function test_attachment_reminder_with_attachment() {
  let cwc = open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  setupComposeWin(cwc, "test@example.org", "Testing automatic reminder!",
                  "Hello! We will have a real attachment here.");

  // Give the notification time to appear. It should.
  wait_for_reminder_state(cwc, true);

  // Add an attachment.
  let file = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
  file.append("panacea.dat");
  assert_true(file.exists(), "The required file panacea.dat was not found in the profile.");
  let attachment = [cwc.window.FileToAttachment(file)];
  cwc.window.AddAttachments(attachment);

  // The notification should hide.
  wait_for_reminder_state(cwc, false);

  // Add some more text with keyword so the automatic notification
  // could potentially show up.
  setupComposeWin(cwc, "", "", " Yes, there is a file attached!");
  // Give the notification time to appear. It shouldn't.
  wait_for_reminder_state(cwc, false);

  cwc.window.RemoveAllAttachments();

  // After removing the attachment, notification should come back
  // with all the keywords, even those input while having an attachment.
  wait_for_reminder_state(cwc, true);
  assert_equals(get_reminder_keywords(cwc), "attachment, attached");

  close_compose_window(cwc);
}

/**
 * Test that the mail.compose.attachment_reminder_aggressive pref works.
 */
function test_attachment_reminder_aggressive_pref() {
  const kPref = "mail.compose.attachment_reminder_aggressive";
  Services.prefs.setBoolPref(kPref, false);

  let cwc = open_compose_new_mail();

  // There should be no notification yet.
  assert_automatic_reminder_state(cwc, false);

  setupComposeWin(cwc, "test@example.org", "aggressive?",
                  "Check this attachment!");

  wait_for_reminder_state(cwc, true);
  click_send_and_handle_send_error(cwc);

  close_compose_window(cwc);

  // Now reset the pref back to original value.
  if (Services.prefs.prefHasUserValue(kPref))
    Services.prefs.clearUserPref(kPref);
}

/**
 * Test that clicking "No, Send Now" in the attachment reminder alert
 * works.
 */
function test_no_send_now_sends() {
  let cwc = open_compose_new_mail();

  setupComposeWin(cwc, "test@example.org",
                  "will the 'No, Send Now' button work?",
                  "Hello, i got your attachment!");

  wait_for_reminder_state(cwc, true);

  // Click the send button again, this time choose "No, Send Now".
  plan_for_modal_dialog("commonDialog", click_no_send_now);
  cwc.click(cwc.eid("button-send"));
  wait_for_modal_dialog("commonDialog");

  // After clicking "Send Now" sending is proceeding, just handle the error.
  click_send_and_handle_send_error(cwc, true);

  // We're now back in the compose window, let's close it then.
  close_compose_window(cwc);
}

/**
 * Click the manual reminder in the menu.
 *
 * @param aCwc            A compose window controller.
 * @param aExpectedState  A boolean specifying what is the expected state
 *                        of the reminder menuitem after the click.
 */
function click_manual_reminder(aCwc, aExpectedState) {
  wait_for_window_focused(aCwc.window);
  aCwc.click_menus_in_sequence(aCwc.e("button-attachPopup"),
                               [ {id: "button-attachPopup_remindLaterItem"} ]);
  wait_for_window_focused(aCwc.window);
  assert_manual_reminder_state(aCwc, aExpectedState);
}

/**
 * Bug 521128
 * Test proper behaviour of the manual reminder.
 */
function test_manual_attachment_reminder() {
  // Open a sample message with no attachment keywords.
  let cwc = open_compose_new_mail();
  setupComposeWin(cwc, "test@example.invalid", "Testing manual reminder!",
                  "Some body...");

  // Enable the manual reminder.
  click_manual_reminder(cwc, true);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Now close the message with saving it as draft.
  plan_for_modal_dialog("commonDialog", click_save_message);
  cwc.window.goDoCommand("cmd_close");
  wait_for_modal_dialog("commonDialog");

  // Open another blank compose window.
  cwc = open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  close_compose_window(cwc);

  // The draft message was saved into Local Folders/Drafts.
  let drafts = MailServices.accounts.localFoldersServer.rootFolder
                           .getFolderWithFlags(Ci.nsMsgFolderFlags.Drafts);
  be_in_folder(drafts);

  // Edit it again...
  select_click_row(0);
  plan_for_new_window("msgcompose");
  // ... by clicking Edit in the draft message notification bar.
  mc.click(mc.eid("msgNotificationBar", {tagName: "button", label: "Edit"}));
  cwc = wait_for_compose_window();

  // Check the reminder enablement was preserved in the message.
  assert_manual_reminder_state(cwc, true);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Now try to send, make sure we get the alert.
  plan_for_modal_dialog("commonDialog", click_oh_i_did);
  cwc.click(cwc.eid("button-send"));
  wait_for_modal_dialog("commonDialog");

  // We were alerted once and the manual reminder is automatically turned off.
  assert_manual_reminder_state(cwc, false);

  // Enable the manual reminder and disable it again to see if it toggles right.
  click_manual_reminder(cwc, true);
  cwc.sleep(2000);
  click_manual_reminder(cwc, false);

  // Now try to send again, there should be no more alert.
  click_send_and_handle_send_error(cwc);

  close_compose_window(cwc);

  // Delete the leftover draft message.
  press_delete();
}

/**
 * Bug 938759
 * Test hiding of the automatic notification if the manual reminder is set.
 */
function test_manual_automatic_attachment_reminder_interaction() {
  // Open a blank message compose
  let cwc = open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some attachment keywords.
  setupComposeWin(cwc, "test@example.invalid", "Testing manual reminder!",
                  "Expect an attachment here...");

  // The automatic attachment notification should pop up.
  wait_for_reminder_state(cwc, true);

  // Now enable the manual reminder.
  click_manual_reminder(cwc, true);
  // The attachment notification should disappear.
  wait_for_reminder_state(cwc, false);

  // Add some more text so the automatic notification
  // could potentially show up.
  setupComposeWin(cwc, "", "", " and look for your attachment!");
  // Give the notification time to appear. It shouldn't.
  wait_for_reminder_state(cwc, false);

  // Now disable the manual reminder.
  click_manual_reminder(cwc, false);
  // Give the notification time to appear. It shouldn't.
  wait_for_reminder_state(cwc, false);

  // Add some more text without keywords.
  setupComposeWin(cwc, "", "", " No keywords here.");
  // Give the notification time to appear. It shouldn't.
  wait_for_reminder_state(cwc, false);

  // Add some more text with a new keyword.
  setupComposeWin(cwc, "", "", " Do you find it attached?");
  // Give the notification time to appear. It should now.
  wait_for_reminder_state(cwc, true);
  assert_equals(get_reminder_keywords(cwc), "attachment, attached");

  close_compose_window(cwc);
}

/**
 * Assert if there is any notification in the compose window.
 *
 * @param aCwc         Compose Window Controller
 * @param aValue       True if notification should exist.
 *                     False otherwise.
 */
function assert_any_notification(aCwc, aValue)
{
  let notification = aCwc.e(kBoxId).currentNotification;
  if ((notification == null) == aValue)
    throw new Error("Notification in wrong state");
}

/**
 * Bug 989653
 * Send filelink attachment should not trigger the
 * attachment reminder.
 */
function test_attachment_vs_filelink_reminder() {
  // Open a blank message compose
  let cwc = open_compose_new_mail();
  setupComposeWin(cwc, "test@example.invalid", "Testing Filelink notification",
                  "There is no body. I hope you don't mind!");

  // There should be no notification yet.
  assert_any_notification(cwc, false);

  // Bring up the FileLink notification.
  let kOfferThreshold = "mail.compose.big_attachments.threshold_kb";
  let maxSize = Services.prefs.getIntPref(kOfferThreshold, 0) * 1024;
  add_attachment(cwc, "http://www.example.com/1", maxSize);

  // The filelink attachment proposal should be up but not the attachment
  // reminder and it should also not interfere with the sending of the message.
  assert_notification_displayed(cwc, kBoxId, "bigAttachment", true);
  assert_automatic_reminder_state(cwc, false);

  click_send_and_handle_send_error(cwc);
  close_window(cwc);
}

/**
 * Bug 944643
 * Test the attachment reminder coming up when keyword is in subject line.
 */
function test_attachment_reminder_in_subject() {
  // Open a blank message compose
  let cwc = open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some attachment keyword in subject.
  setupComposeWin(cwc, "test@example.invalid", "Testing attachment reminder!",
                  "There is no keyword in this body...");

  // The automatic attachment notification should pop up.
  wait_for_reminder_state(cwc, true);
  assert_equals(get_reminder_keywords(cwc), "attachment");

  // Now clear the subject
  delete_all_existing(cwc, cwc.eid("msgSubject"));

  // Give the notification time to disappear.
  wait_for_reminder_state(cwc, false);

  close_compose_window(cwc);
}

/**
 * Bug 944643
 * Test the attachment reminder coming up when keyword is in subject line
 * and also body.
 */
function test_attachment_reminder_in_subject_and_body() {
  // Open a blank message compose
  let cwc = open_compose_new_mail();
  // This one should have the reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some attachment keyword in subject.
  setupComposeWin(cwc, "test@example.invalid", "Testing attachment reminder!",
                  "There should be an attached file in this body...");

  // The automatic attachment notification should pop up.
  wait_for_reminder_state(cwc, true);
  assert_equals(get_reminder_keywords(cwc), "attachment, attached");

  // Now clear only the subject
  delete_all_existing(cwc, cwc.eid("msgSubject"));

  // Give the notification some time. It should not disappear,
  // just reduce the keywords list.
  wait_for_reminder_state(cwc, true, true);
  assert_equals(get_reminder_keywords(cwc), "attached");

  close_compose_window(cwc);
}

/**
 * Bug 1099866
 * Test proper behaviour of attachment reminder when keyword reminding
 * is turned off.
 */
function test_disabled_attachment_reminder() {

  Services.prefs.setBoolPref(kReminderPref, false);

  // Open a sample message with no attachment keywords.
  let cwc = open_compose_new_mail();
  setupComposeWin(cwc, "test@example.invalid", "Testing disabled keyword reminder!",
                  "Some body...");

  // This one should have the manual reminder disabled.
  assert_manual_reminder_state(cwc, false);
  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some keyword so the automatic notification
  // could potentially show up.
  setupComposeWin(cwc, "", "", " and look for your attachment!");
  // Give the notification time to appear. It shouldn't.
  wait_for_reminder_state(cwc, false);

  // Enable the manual reminder.
  click_manual_reminder(cwc, true);
  assert_automatic_reminder_state(cwc, false);

  // Disable the manual reminder and the notification should still be hidden
  // even when there are still keywords in the body.
  click_manual_reminder(cwc, false);
  assert_automatic_reminder_state(cwc, false);

  // There should be no attachment message upon send.
  click_send_and_handle_send_error(cwc);

  close_compose_window(cwc);

  Services.prefs.setBoolPref(kReminderPref, true);
}

/**
 * Bug 1099866
 * Check if reminder does not stay open on compose window reopen
 * due to window recycling.
 */
function test_recycling_attachment_reminder() {
  let recycledWindows = Services.prefs.getIntPref("mail.compose.max_recycled_windows");
  assert_true(recycledWindows > 0);
  // Open a sample message with no attachment keywords.
  let cwc = open_compose_new_mail();
  setupComposeWin(cwc, "test@example.invalid", "Testing recycling a reminder!",
                  "Some body...");

  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  // Add some keyword so the automatic notification
  // could potentially show up.
  setupComposeWin(cwc, "", "", " and look for your attachment!");
  // Give the notification time to appear. It should.
  wait_for_reminder_state(cwc, true);

  close_compose_window(cwc, true);

  // Another compose window without any keywords.
  cwc = open_compose_new_mail();
  setupComposeWin(cwc, "test@example.invalid", "Testing reminder after recycling!",
                  "Some body...");

  // There should be no attachment notification.
  assert_automatic_reminder_state(cwc, false);

  close_compose_window(cwc);
}


/**
 * Click the send button and handle the send error dialog popping up.
 * It will return us back to the compose window.
 *
 * @param aController
 * @param aAlreadySending  Set this to true if sending was already triggered
 *                         by other means.
 */
function click_send_and_handle_send_error(aController, aAlreadySending) {
  plan_for_modal_dialog("commonDialog", click_ok_on_send_error);
  if (!aAlreadySending)
    aController.click(aController.eid("button-send"));
  wait_for_modal_dialog("commonDialog");
}

/**
 * Click the "Oh, I Did!" button in the attachment reminder dialog.
 */
function click_oh_i_did(controller) {
  controller.window.document.documentElement.getButton('extra1').doCommand();
}

/**
 * Click the "No, Send Now" button in the attachment reminder dialog.
 */
function click_no_send_now(controller) {
  controller.window.document.documentElement.getButton('accept').doCommand();
}

/**
 * Click Ok in the Send Message Error dialog.
 */
function click_ok_on_send_error(controller) {
  if (controller.window.document.title != "Send Message Error")
    throw new Error("Not a send error dialog; title=" +
                    controller.window.document.title);
  controller.window.document.documentElement.getButton('accept').doCommand();
}

/**
 * Click Save in the Save message dialog.
 */
function click_save_message(controller) {
  if (controller.window.document.title != "Save Message")
    throw new Error("Not a Save message dialog; title=" +
                    controller.window.document.title);
  controller.window.document.documentElement.getButton('accept').doCommand();
}

function teardownModule(module) {
  let drafts = MailServices.accounts.localFoldersServer.rootFolder
                           .getFolderWithFlags(Ci.nsMsgFolderFlags.Drafts);
  MailServices.accounts.localFoldersServer.rootFolder
              .propagateDelete(drafts, true, null);
}
