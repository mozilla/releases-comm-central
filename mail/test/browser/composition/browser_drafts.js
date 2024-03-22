/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests draft related functionality:
 * - that we don't allow opening multiple copies of a draft.
 */

"use strict";

var {
  close_compose_window,
  compose_window_ready,
  get_compose_body,
  get_msg_source,
  open_compose_new_mail,
  save_compose_message,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var {
  be_in_folder,
  get_about_message,
  get_special_folder,
  make_message_sets_in_folders,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { get_notification, wait_for_notification_to_show } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/NotificationBoxHelpers.sys.mjs"
  );

var { click_menus_in_sequence, close_popup_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
  );

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const aboutMessage = get_about_message();

var kBoxId = "mail-notification-top";
var draftsFolder;

add_setup(async function () {
  requestLongerTimeout(2);
  draftsFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Bug 349547.
 * Tests that we only open one compose window for one instance of a draft.
 */
add_task(async function test_open_draft_again() {
  await make_message_sets_in_folders([draftsFolder], [{ count: 1 }]);
  await be_in_folder(draftsFolder);
  await select_click_row(0);

  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(aboutMessage, kBoxId, "draftMsgContent");
  const box = get_notification(aboutMessage, kBoxId, "draftMsgContent");

  const composePromise = promise_new_window("msgcompose");
  // Click on the "Edit" button in the draft notification.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  const cwc = await compose_window_ready(composePromise);

  const cwins = [...Services.wm.getEnumerator("msgcompose")].length;

  // click edit in main win again
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );

  // Wait a sec to see if it caused a new window.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  Assert.ok(
    Services.ww.activeWindow == cwc,
    "the original draft composition window should have got focus (again)"
  );

  const cwins2 = [...Services.wm.getEnumerator("msgcompose")].length;

  Assert.ok(cwins2 > 0, "No compose window open!");
  Assert.equal(cwins, cwins2, "The number of compose windows changed!");

  // Type something and save, then check that we only have one draft.
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Hello!", cwc);
  await save_compose_message(cwc);
  await close_compose_window(cwc);
  Assert.equal(draftsFolder.getTotalMessages(false), 1);

  await select_click_row(0);
  await press_delete(window); // clean up after ourselves
});

/**
 * Bug 1202165
 * Test that the user set delivery format is preserved in a draft message.
 */
async function internal_check_delivery_format(editDraft) {
  let cwc = await open_compose_new_mail();

  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing storing of the composition properties in the draft!",
    "Hello!"
  );

  // Select our wanted format.
  EventUtils.synthesizeMouseAtCenter(
    cwc.document.getElementById("optionsMenu"),
    {},
    cwc.document.getElementById("optionsMenu").ownerGlobal
  );
  await click_menus_in_sequence(
    cwc.document.getElementById("optionsMenuPopup"),
    [{ id: "outputFormatMenu" }, { id: "format_both" }]
  );

  /**
   * Check if the right format is selected in the menu.
   *
   * @param aMenuItemId  The id of the menuitem expected to be selected.
   * @param aValue       A value of nsIMsgCompSendFormat constants of the expected selected format.
   */
  async function assert_format_value(aMenuItemId) {
    EventUtils.synthesizeMouseAtCenter(
      cwc.document.getElementById("optionsMenu"),
      {},
      cwc.document.getElementById("optionsMenu").ownerGlobal
    );
    const formatMenu = await click_menus_in_sequence(
      cwc.document.getElementById("optionsMenuPopup"),
      [{ id: "outputFormatMenu" }],
      true
    );
    const formatItem = cwc.document
      .getElementById("outputFormatMenuPopup")
      .querySelector("[name=output_format][checked=true]");
    Assert.equal(formatItem.id, aMenuItemId);
    close_popup_sequence(formatMenu);
  }

  await save_compose_message(cwc);
  await close_compose_window(cwc);

  // Open a new composition see if the menu is again at default value, not the one
  // chosen above.
  cwc = await open_compose_new_mail();

  await assert_format_value("format_auto", Ci.nsIMsgCompSendFormat.Auto);

  await close_compose_window(cwc);

  await be_in_folder(draftsFolder);
  await select_click_row(0);

  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(aboutMessage, kBoxId, "draftMsgContent");
  const box = get_notification(aboutMessage, kBoxId, "draftMsgContent");

  const composePromise = promise_new_window("msgcompose");
  if (editDraft) {
    // Trigger "edit draft".
    EventUtils.synthesizeMouseAtCenter(
      box.buttonContainer.firstElementChild,
      {},
      aboutMessage
    );
  } else {
    // Trigger "edit as new" resulting in template processing.
    EventUtils.synthesizeKey("e", { shiftKey: false, accelKey: true }, window);
  }
  cwc = await compose_window_ready(composePromise);

  // Check if format value was restored.
  await assert_format_value("format_both", Ci.nsIMsgCompSendFormat.Both);

  await close_compose_window(cwc);

  await press_delete(window); // clean up the created draft
}

add_task(async function test_save_delivery_format_with_edit_draft() {
  await internal_check_delivery_format(true);
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

add_task(async function test_save_delivery_format_with_edit_template() {
  await internal_check_delivery_format(false);
}).__skipMe = AppConstants.platform == "macosx"; // Can't click menu bar on Mac.

/**
 * Tests that 'Edit as New' leaves the original message in drafts folder.
 */
add_task(async function test_edit_as_new_in_draft() {
  await make_message_sets_in_folders([draftsFolder], [{ count: 1 }]);
  await be_in_folder(draftsFolder);

  Assert.equal(draftsFolder.getTotalMessages(false), 1);

  await select_click_row(0);

  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(aboutMessage, kBoxId, "draftMsgContent");

  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("e", { shiftKey: false, accelKey: true });
  const cwc = await compose_window_ready(composePromise);

  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Hello!", cwc);
  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) == 2,
    "message saved to drafts folder"
  );

  // Clean up the created drafts and count again.
  await press_delete(window);
  await select_click_row(0);
  await press_delete(window);
  Assert.equal(draftsFolder.getTotalMessages(false), 0);
});

/**
 * Tests that editing a draft works as it should also when the identity
 * name has properties that require mime encoding when sent out.
 */
add_task(async function test_edit_draft_mime_from() {
  const identity = MailServices.accounts.createIdentity();
  identity.email = "skinner@example.com";
  identity.fullName = "SKINNER, Seymore";
  const accounts = MailServices.accounts.accounts.at(-1); // Local Folders
  accounts.addIdentity(identity);
  registerCleanupFunction(() => {
    accounts.removeIdentity(identity);
  });

  draftsFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(
      "From - Sun Oct 01 01:02:03 2023\n" +
        "X-Mozilla-Status: 0000\n" +
        "X-Mozilla-Status2: 00000000\n" +
        "X-Mozilla-Keys:\n" +
        `X-Account-Key: ${accounts.key}\n` +
        `From: "SKINNER, Seymore <skinner@example.com>\n` +
        "To: nobody@example.invalid\n" +
        "Subject: test_edit_draft_mime_from!\n" +
        `Message-ID: <${Date.now()}@example.invalid>\n` +
        "Date: Sun, 1 Oct 2017 01:02:03 +0100\n" +
        "X-Mozilla-Draft-Info: internal/draft; vcard=0; receipt=0; DSN=0; uuencode=0;\n" +
        " attachmentreminder=0; deliveryformat=4\n" +
        "MIME-Version: 1.0\n" +
        "Content-Type: text/plain; charset=utf-8\n" +
        "Content-Transfer-Encoding: 8bit\n" +
        "\n" +
        "Identitiy names should not show quotes!.\n"
    );
  await be_in_folder(draftsFolder);

  Assert.equal(
    draftsFolder.getTotalMessages(false),
    1,
    "should have one draft"
  );

  await select_click_row(0);

  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(aboutMessage, kBoxId, "draftMsgContent");

  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("e", { shiftKey: false, accelKey: true });
  const cwc = await compose_window_ready(composePromise);

  const msgIdentity = cwc.document.getElementById("msgIdentity");
  // Should show no quotes in the address.
  Assert.equal(
    msgIdentity.value,
    "SKINNER, Seymore <skinner@example.com>",
    "should show human readable version of identity"
  );
  // Should not be editable - which it would be if no identity matched.
  Assert.equal(
    msgIdentity.getAttribute("editable"),
    null,
    "msgIdentity should not be editable since a draft identity email matches"
  );

  await close_compose_window(cwc);
  // Clean up the created draft and count again.
  await press_delete(window);
  Assert.equal(
    draftsFolder.getTotalMessages(false),
    0,
    "should have no drafts after deleting"
  );
});

/**
 * Tests Content-Language header.
 */
add_task(async function test_content_language_header() {
  const cwc = await open_compose_new_mail();

  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing Content-Language header",
    "Hello, we speak en-US"
  );

  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  await be_in_folder(draftsFolder);
  const draftMsg = await select_click_row(0);
  const draftMsgContent = await get_msg_source(draftMsg);

  // Check for a single line that contains our header.
  if (
    !draftMsgContent
      .split("\n")
      .some(line => line.trim() == "Content-Language: en-US")
  ) {
    Assert.ok(false, "Failed to find Content-Language: en-US");
  }

  // Clean up the created draft.
  await press_delete(window);
});

/**
 * Tests Content-Language header suppression.
 */
add_task(async function test_content_language_header_suppression() {
  const statusQuo = Services.prefs.getBoolPref(
    "mail.suppress_content_language"
  );
  Services.prefs.setBoolPref("mail.suppress_content_language", true);

  const cwc = await open_compose_new_mail();

  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing Content-Language header suppression",
    "Hello, we speak blank"
  );

  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  await be_in_folder(draftsFolder);
  const draftMsg = await select_click_row(0);
  const draftMsgContent = await get_msg_source(draftMsg);

  // Check no line contains our Content-Language.
  Assert.ok(
    !draftMsgContent.split("\n").some(line => /^Content-Language:/.test(line)),
    "Didn't find Content-Language header in draft content"
  );

  // Clean up the created draft.
  await press_delete(window);

  Services.prefs.setBoolPref("mail.suppress_content_language", statusQuo);
});

/**
 * Tests space stuffing of plaintext message.
 */
add_task(async function test_remove_space_stuffing_format_flowed() {
  // Prepare for plaintext email.
  const oldHtmlPref = Services.prefs.getBoolPref(
    "mail.identity.default.compose_html"
  );
  Services.prefs.setBoolPref("mail.identity.default.compose_html", false);

  let cwc = await open_compose_new_mail();

  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    "Testing space stuffing in plain text email",
    "NoSpace\n OneSpace\n  TwoSpaces"
  );

  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  await be_in_folder(draftsFolder);

  await select_click_row(0);

  // Wait for the notification with the Edit button.
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

  const bodyText = get_compose_body(cwc).innerHTML;
  if (!bodyText.includes("NoSpace<br> OneSpace<br>  TwoSpaces")) {
    Assert.ok(false, "Something went wrong with space stuffing");
  }
  await close_compose_window(cwc);

  // Clean up the created draft.
  await press_delete(window);

  Services.prefs.setBoolPref("mail.identity.default.compose_html", oldHtmlPref);
});
