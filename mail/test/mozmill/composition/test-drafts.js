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

  if (!MailServices.accounts
                   .localFoldersServer
                   .rootFolder
                   .containsChildNamed("Drafts")) {
    create_folder("Drafts", [Ci.nsMsgFolderFlags.Drafts]);
  }
  draftsFolder = MailServices.accounts
                             .localFoldersServer
                             .rootFolder
                             .getChildNamed("Drafts");
}

function setupComposeWin(aCwc, toAddr, subj, body) {
  aCwc.type(aCwc.eid("addressCol2#1"), toAddr);
  aCwc.type(aCwc.eid("msgSubject"), subj);
  aCwc.type(aCwc.eid("content-frame"), body);
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

  close_compose_window(cwc); // close compose window

  press_delete(mc); // clean up after ourselves
}

/**
 * Bug 1202165
 * Test that the user set delivery format is preserved in a draft message.
 */
function test_save_delivery_format() {
  let cwc = open_compose_new_mail();

  setupComposeWin(cwc, "test@example.invalid",
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
  // chosen above, even in a recycled compose window.
  cwc = open_compose_new_mail();

  assert_format_value("format_auto", Ci.nsIMsgCompSendFormat.AskUser);

  close_compose_window(cwc);

  be_in_folder(draftsFolder);
  select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, kBoxId, "draftMsgContent");

  plan_for_new_window("msgcompose");
  mc.click(mc.eid(kBoxId, {tagName: "button", label: "Edit"}));
  cwc = wait_for_compose_window();

  // Check if format value was restored.
  assert_format_value("format_both", Ci.nsIMsgCompSendFormat.Both);

  close_compose_window(cwc);

  press_delete(mc); // clean up the created draft
}

function teardownModule() {
  MailServices.accounts.localFoldersServer.rootFolder
              .propagateDelete(draftsFolder, true, null);
}
