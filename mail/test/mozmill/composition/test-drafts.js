/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests draft related functionality:
 * - that we don't allow opening multiple copies of a draft.
 */

// make SOLO_TEST=composition/test-drafts.js mozmill-one

var MODULE_NAME = "test-drafts";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers",
                       "window-helpers", "notificationbox-helpers"];

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");

var kBoxId = "msgNotificationBar";
var draftsFolder;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  draftsFolder = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
}

/**
 * Bug 349547.
 * Tests that we only open one compose window for one instance of a draft.
 */
function test_open_draft_again() {
  make_new_sets_in_folder(draftsFolder, [{count: 1}]);
  be_in_folder(draftsFolder);
  let draftMsg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, kBoxId, "draftMsgContent");

  plan_for_new_window("msgcompose");
  mc.click(mc.eid(kBoxId, {tagName: "button", label: "Edit"}));
  let cwc = wait_for_compose_window();

  let cwins = 0;
  let e = Services.wm.getEnumerator("msgcompose");
  while (e.hasMoreElements()) {
    e.getNext();
    cwins++;
  }

  // click edit in main win again
  mc.click(mc.eid(kBoxId, {tagName: "button", label: "Edit"}));

  mc.sleep(1000); // wait a sec to see if it caused a new window

  assert_true(Services.ww.activeWindow == cwc.window,
    "the original draft composition window should have got focus (again)");

  let cwins2 = 0;
  let e2 = Services.wm.getEnumerator("msgcompose");
  while (e2.hasMoreElements()) {
    e2.getNext();
    cwins2++;
  }

  assert_true(cwins2 > 0, "No compose window open!");
  assert_equals(cwins, cwins2, "The number of compose windows changed!");

  // Type something and save, then check that we only have one draft.
  cwc.type(cwc.eid("content-frame"), "Hello!");
  cwc.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(cwc);
  assert_equals(draftsFolder.getTotalMessages(false), 1);

  press_delete(mc); // clean up after ourselves
}

/**
 * Bug 1202165
 * Test that the user set delivery format is preserved in a draft message.
 */
function internal_check_delivery_format(editDraft) {
  let cwc = open_compose_new_mail();

  setup_msg_contents(cwc, "test@example.invalid",
                     "Testing storing of the composition properties in the draft!",
                     "Hello!");

  // Select our wanted format.
  if (!mc.mozmillModule.isMac) {
    formatMenu = cwc.click_menus_in_sequence(cwc.e("optionsMenuPopup"),
                                             [ { id: "outputFormatMenu" },
                                               { id: "format_both" } ]);
  } else {
    // On OS X the main menu seems not accessible for clicking from mozmill.
    assert_true(cwc.e("outputFormatMenu").getAttribute("oncommand").startsWith("OutputFormatMenuSelect("));
    cwc.window.OutputFormatMenuSelect(cwc.e("format_both"));
  }

  /**
   * Check if the right format is selected in the menu.
   *
   * @param aMenuItemId  The id of the menuitem expected to be selected.
   * @param aValue       A value of nsIMsgCompSendFormat contants of the expected selected format.
   */
  function assert_format_value(aMenuItemId, aValue) {
    if (!mc.mozmillModule.isMac) {
      let formatMenu = cwc.click_menus_in_sequence(cwc.e("optionsMenuPopup"),
                                                   [ { id: "outputFormatMenu" } ], true);
      let formatItem = cwc.e("outputFormatMenuPopup")
                          .querySelector("[name=output_format][checked=true]");
      assert_equals(formatItem.id, aMenuItemId);
      cwc.close_popup_sequence(formatMenu);
    } else {
      assert_equals(cwc.window.gSendFormat, aValue);
    }
  }

  cwc.window.SaveAsDraft();
  utils.waitFor(() => !cwc.window.gSaveOperationInProgress && !cwc.window.gWindowLock,
                "Saving of draft did not finish");
  wait_for_window_focused(cwc.window);

  close_compose_window(cwc);

  // Open a new composition see if the menu is again at default value, not the one
  // chosen above.
  cwc = open_compose_new_mail();

  assert_format_value("format_auto", Ci.nsIMsgCompSendFormat.AskUser);

  close_compose_window(cwc);

  be_in_folder(draftsFolder);
  select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, kBoxId, "draftMsgContent");

  plan_for_new_window("msgcompose");
  if (editDraft) {
    // Trigger "edit draft".
    mc.click(mc.eid(kBoxId, {tagName: "button", label: "Edit"}));
  } else {
    // Trigger "edit as new" resulting in template processing.
    mc.keypress(null, "e", {shiftKey: false, accelKey: true});
  }
  cwc = wait_for_compose_window();

  // Check if format value was restored.
  assert_format_value("format_both", Ci.nsIMsgCompSendFormat.Both);

  close_compose_window(cwc);

  press_delete(mc); // clean up the created draft
}

function test_save_delivery_format_with_edit_draft() {
  internal_check_delivery_format(true);
}

function test_save_delivery_format_with_edit_template() {
  internal_check_delivery_format(false);
}

/**
 * Tests that 'Edit as New' leaves the original message in drafts folder.
 */
function test_edit_as_new_in_draft() {
  make_new_sets_in_folder(draftsFolder, [{count: 1}]);
  be_in_folder(draftsFolder);

  assert_equals(draftsFolder.getTotalMessages(false), 1);

  let draftMsg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, kBoxId, "draftMsgContent");

  plan_for_new_window("msgcompose");
  mc.keypress(null, "e", {shiftKey: false, accelKey: true});
  let cwc = wait_for_compose_window();

  cwc.type(cwc.eid("content-frame"), "Hello!");
  cwc.keypress(null, "s", {shiftKey: false, accelKey: true});

  close_compose_window(cwc);
  assert_equals(draftsFolder.getTotalMessages(false), 2);

  // Clean up the created drafts and count again.
  press_delete(mc);
  press_delete(mc);
  assert_equals(draftsFolder.getTotalMessages(false), 0);
}

/**
 * Tests Content-Language header.
 */
function test_content_language_header() {
  let cwc = open_compose_new_mail();

  setup_msg_contents(cwc, "test@example.invalid",
                     "Testing Content-Language header",
                     "Hello, we speak en-US");

  cwc.window.SaveAsDraft();
  utils.waitFor(() => !cwc.window.gSaveOperationInProgress && !cwc.window.gWindowLock,
                "Saving of draft did not finish");
  wait_for_window_focused(cwc.window);
  close_compose_window(cwc);

  be_in_folder(draftsFolder);
  let draftMsg = select_click_row(0);
  let draftMsgContent = get_msg_source(draftMsg);

  // Check for a single line that contains our header.
  if (!draftMsgContent.split("\n")
                      .some(line => (line.trim() == "Content-Language: en-US"))) {
    assert_true(false, "Failed to find Content-Language: en-US");
  }

  // Clean up the created draft.
  press_delete(mc);
}

/**
 * Tests space stuffing of plaintext message.
 */
function test_remove_space_stuffing_format_flowed() {
  // Prepare for plaintext email.
  let oldHtmlPref = Services.prefs.getBoolPref("mail.identity.default.compose_html");
  Services.prefs.setBoolPref("mail.identity.default.compose_html", false);

  let cwc = open_compose_new_mail();

  setup_msg_contents(cwc, "test@example.invalid",
                     "Testing space stuffing in plain text email",
                     "NoSpace\n OneSpace\n  TwoSpaces");

  cwc.window.SaveAsDraft();
  utils.waitFor(() => !cwc.window.gSaveOperationInProgress && !cwc.window.gWindowLock,
                "Saving of draft did not finish");
  wait_for_window_focused(cwc.window);

  close_compose_window(cwc);

  be_in_folder(draftsFolder);

  let draftMsg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, kBoxId, "draftMsgContent");

  plan_for_new_window("msgcompose");
  mc.click(mc.eid(kBoxId, {tagName: "button", label: "Edit"}));
  cwc = wait_for_compose_window();

  let bodyText = cwc.e("content-frame").contentDocument
                    .querySelector("body").innerHTML;

  if (!bodyText.includes("NoSpace<br> OneSpace<br>  TwoSpaces")) {
    assert_true(false, "Something went wrong with space stuffing");
  }

  // Clean up the created draft.
  press_delete(mc);

  Services.prefs.setBoolPref("mail.identity.default.compose_html", oldHtmlPref);
}

function teardownModule() {
}
