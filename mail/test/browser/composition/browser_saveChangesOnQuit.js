/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we prompt the user if they'd like to save their message when they
 * try to quit/close with an open compose window with unsaved changes, and
 * that we don't prompt if there are no changes.
 */

"use strict";

var {
  close_compose_window,
  compose_window_ready,
  open_compose_new_mail,
  open_compose_with_forward,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  create_message,
  get_about_message,
  get_special_folder,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);
var { get_notification, wait_for_notification_to_show } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
var { promise_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var CANCEL = 1;
var DONT_SAVE = 2;

var folder = null;
var gDraftFolder = null;

add_setup(async function () {
  requestLongerTimeout(3);

  folder = await create_folder("PromptToSaveTest");

  await add_message_to_folder([folder], create_message()); // row 0
  const localFolder = folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localFolder.addMessage(msgSource("content type: text", "text")); // row 1
  localFolder.addMessage(msgSource("content type missing", null)); // row 2
  gDraftFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

function msgSource(aSubject, aContentType) {
  const msgId = Services.uuid.generateUUID() + "@invalid";

  return (
    "From - Sun Apr 07 22:47:11 2013\r\n" +
    "X-Mozilla-Status: 0001\r\n" +
    "X-Mozilla-Status2: 00000000\r\n" +
    "Message-ID: <" +
    msgId +
    ">\r\n" +
    "Date: Sun, 07 Apr 2013 22:47:11 +0300\r\n" +
    "From: Someone <some.one@invalid>\r\n" +
    "To: someone.else@invalid\r\n" +
    "Subject: " +
    aSubject +
    "\r\n" +
    "MIME-Version: 1.0\r\n" +
    (aContentType ? "Content-Type: " + aContentType + "\r\n" : "") +
    "Content-Transfer-Encoding: 7bit\r\n\r\n" +
    "A msg with contentType " +
    aContentType +
    "\r\n"
  );
}

/**
 * Test that when a compose window is open with changes, and
 * a Quit is requested (for example, from File > Quit from the
 * 3pane), that the user gets a confirmation dialog to discard
 * the changes. This also tests that the user can cancel the
 * quit request.
 */
add_task(async function test_can_cancel_quit_on_changes() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  // opening a new compose window
  const cwc = await open_compose_new_mail(window);

  // Make some changes
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Hey check out this megalol link", cwc);

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Set the Mock Prompt Service to return false, so that we
  // cancel the quit.
  gMockPromptService.returnValue = CANCEL;
  // Trigger the quit-application-request notification

  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");

  const promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a confirmEx prompt");

  Assert.equal("confirmEx", promptState.method);
  // Since we returned false on the confirmation dialog,
  // we should be cancelling the quit - so cancelQuit.data
  // should now be true
  Assert.ok(cancelQuit.data, "Didn't cancel the quit");

  await close_compose_window(cwc);

  // Unregister the Mock Prompt Service
  gMockPromptService.unregister();
});

/**
 * Test that when a compose window is open with changes, and
 * a Quit is requested (for example, from File > Quit from the
 * 3pane), that the user gets a confirmation dialog to discard
 * the changes. This also tests that the user can let the quit
 * occur.
 */
add_task(async function test_can_quit_on_changes() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  // opening a new compose window
  const cwc = await open_compose_new_mail(window);

  // Make some changes
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Hey check out this megalol link", cwc);

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Set the Mock Prompt Service to return true, so that we're
  // allowing the quit to occur.
  gMockPromptService.returnValue = DONT_SAVE;

  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");

  const promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a confirmEx prompt");

  Assert.equal("confirmEx", promptState.method);
  // Since we returned true on the confirmation dialog,
  // we should be quitting - so cancelQuit.data should now be
  // false
  Assert.ok(!cancelQuit.data, "The quit request was cancelled");

  await close_compose_window(cwc);

  // Unregister the Mock Prompt Service
  gMockPromptService.unregister();
});

/**
 * Bug 698077 - test that when quitting with two compose windows open, if
 * one chooses "Don't Save", and the other chooses "Cancel", that the first
 * window's state is such that subsequent quit requests still cause the
 * Don't Save / Cancel / Save dialog to come up.
 */
add_task(async function test_window_quit_state_reset_on_aborted_quit() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  // open two new compose windows
  const cwc1 = await open_compose_new_mail(window);
  const cwc2 = await open_compose_new_mail(window);

  // Type something in each window.
  cwc1.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Marco!", cwc1);

  cwc2.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Polo!", cwc2);

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // This is a hacky method for making sure that the second window
  // receives a CANCEL click in the popup dialog.
  var numOfPrompts = 0;
  gMockPromptService.onPromptCallback = function () {
    numOfPrompts++;

    if (numOfPrompts > 1) {
      gMockPromptService.returnValue = CANCEL;
    }
  };

  gMockPromptService.returnValue = DONT_SAVE;

  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");

  // We should have cancelled the quit appropriately.
  Assert.ok(cancelQuit.data);

  // The quit behaviour is that the second window to spawn is the first
  // one that prompts for Save / Don't Save, etc.
  gMockPromptService.reset();

  // The first window should still prompt when attempting to close the
  // window.
  gMockPromptService.returnValue = DONT_SAVE;

  // Unclear why the timeout is needed.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  cwc2.goDoCommand("cmd_close");

  TestUtils.waitForCondition(
    () => !!gMockPromptService.promptState,
    "Expected a confirmEx prompt to come up"
  );

  await close_compose_window(cwc1);

  gMockPromptService.unregister();
});

/**
 * Tests that we don't get a prompt to save if there has been no user input
 * into the message yet, when trying to close.
 */
add_task(async function test_no_prompt_on_close_for_unmodified() {
  await be_in_folder(folder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const nwc = await open_compose_new_mail();
  await close_compose_window(nwc, false);

  const rwc = await open_compose_with_reply();
  await close_compose_window(rwc, false);

  const fwc = await open_compose_with_forward();
  await close_compose_window(fwc, false);
});

/**
 * Tests that we get a prompt to save if the user made changes to the message
 * before trying to close it.
 */
add_task(async function test_prompt_on_close_for_modified() {
  await be_in_folder(folder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const nwc = await open_compose_new_mail();
  nwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Hey hey hey!", nwc);
  await close_compose_window(nwc, true);

  const rwc = await open_compose_with_reply();
  rwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Howdy!", rwc);
  await close_compose_window(rwc, true);

  const fwc = await open_compose_with_forward();
  fwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Greetings!", fwc);
  await close_compose_window(fwc, true);
});

/**
 * Test there's no prompt on close when no changes was made in reply/forward
 * windows - for the case the original msg had content type "text".
 */
add_task(
  async function test_no_prompt_on_close_for_unmodified_content_type_text() {
    await be_in_folder(folder);
    const msg = await select_click_row(1); // row 1 is the one with content type text
    await assert_selected_and_displayed(window, msg);

    const rwc = await open_compose_with_reply();
    await close_compose_window(rwc, false);

    const fwc = await open_compose_with_forward();
    Assert.equal(
      fwc.document.getElementById("attachmentBucket").getRowCount(),
      0,
      "forwarding msg created attachment"
    );
    await close_compose_window(fwc, false);
  }
);

/**
 * Test there's no prompt on close when no changes was made in reply/forward
 * windows - for the case the original msg had no content type.
 */
add_task(
  async function test_no_prompt_on_close_for_unmodified_no_content_type() {
    await be_in_folder(folder);
    const msg = await select_click_row(2); // row 2 is the one with no content type
    await assert_selected_and_displayed(window, msg);

    const rwc = await open_compose_with_reply();
    await close_compose_window(rwc, false);

    const fwc = await open_compose_with_forward();
    Assert.equal(
      fwc.document.getElementById("attachmentBucket").getRowCount(),
      0,
      "forwarding msg created attachment"
    );
    await close_compose_window(fwc, false);
  }
);

add_task(async function test_prompt_save_on_pill_editing() {
  let cwc = await open_compose_new_mail(window);

  // Focus should be on the To field, so just type an address.
  EventUtils.sendString("test@foo.invalid", cwc);
  const pillCreated = TestUtils.waitForCondition(
    () => cwc.document.querySelectorAll("mail-address-pill").length == 1,
    "One pill was created"
  );
  // Trigger the saving of the draft.
  EventUtils.synthesizeKey("s", { accelKey: true }, cwc);
  await pillCreated;
  Assert.ok(cwc.gSaveOperationInProgress, "Should start save operation");
  await TestUtils.waitForCondition(
    () => !cwc.gSaveOperationInProgress && !cwc.gWindowLock,
    "Waiting for the save operation to complete"
  );

  // All leftover text should have been cleared and pill should have been
  // created before the draft is actually saved.
  Assert.equal(
    cwc.document.activeElement.id,
    "toAddrInput",
    "The input field is focused."
  );
  Assert.equal(
    cwc.document.activeElement.value,
    "",
    "The input field is empty."
  );

  // Close the compose window after the saving operation is completed.
  await close_compose_window(cwc, false);

  // Move to the drafts folder and select the recently saved message.
  await be_in_folder(gDraftFolder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  // Click on the "edit draft" notification.
  const aboutMessage = get_about_message();
  const kBoxId = "mail-notification-top";
  await wait_for_notification_to_show(aboutMessage, kBoxId, "draftMsgContent");
  const box = get_notification(aboutMessage, kBoxId, "draftMsgContent");

  const composePromise = promise_new_window("msgcompose");
  // Click on the "Edit" button in the draft notification.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  cwc = await compose_window_ready(composePromise);

  // Make sure the address was saved correctly.
  const pill = cwc.document.querySelector("mail-address-pill");
  Assert.equal(
    pill.fullAddress,
    "test@foo.invalid",
    "the email address matches"
  );
  const isEditing = TestUtils.waitForCondition(
    () => pill.isEditing,
    "Pill is being edited"
  );

  const focusPromise = TestUtils.waitForCondition(
    () => cwc.document.activeElement == pill,
    "Pill is focused"
  );
  // The focus should be on the subject since we didn't write anything,
  // so shift+tab to move the focus on the To field, and pressing Arrow Left
  // should correctly focus the previously generated pill.
  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, cwc);
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, cwc);
  await focusPromise;
  EventUtils.synthesizeKey("VK_RETURN", {}, cwc);
  await isEditing;

  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  // Try to quit after entering the pill edit mode, a "unsaved changes" dialog
  // should be triggered.
  cwc.goDoCommand("cmd_close");
  await promptPromise;

  await close_compose_window(cwc);
});
