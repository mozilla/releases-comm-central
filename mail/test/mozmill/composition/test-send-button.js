/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests proper enabling of send buttons depending on addresses input.
 */

"use strict";

var MODULE_NAME = "test-send-button";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers",
                         "window-helpers", "address-book-helpers"];

var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var account = null;

var setupModule = function (module) {
  collector.getModule("folder-display-helpers").installInto(module);
  collector.getModule("compose-helpers").installInto(module);
  collector.getModule("window-helpers").installInto(module);
  collector.getModule("address-book-helpers").installInto(module);

  // Ensure we're in the tinderbox account as that has the right identities set
  // up for this test.
  let server = MailServices.accounts.FindServer("tinderbox", FAKE_SERVER_HOSTNAME, "pop3");
  account = MailServices.accounts.FindAccountForServer(server);
  let inbox = get_special_folder(Ci.nsMsgFolderFlags.Inbox, false, server);
  be_in_folder(inbox);
};

/**
 * Check if the send commands are in the wished state.
 *
 * @param aCwc      The compose window controller.
 * @param aEnabled  The expected state of the commands.
 */
function check_send_commands_state(aCwc, aEnabled) {
  assert_equals(aCwc.e("cmd_sendButton").hasAttribute("disabled"), !aEnabled);
  assert_equals(aCwc.e("cmd_sendNow").hasAttribute("disabled"), !aEnabled);
  assert_equals(aCwc.e("cmd_sendWithCheck").hasAttribute("disabled"), !aEnabled);
  assert_equals(aCwc.e("cmd_sendLater").hasAttribute("disabled"), !aEnabled);

  // The toolbar buttons and menuitems should be linked to these commands
  // thus inheriting the enabled state. Check that on the Send button
  // and Send Now menuitem.
  assert_equals(aCwc.e("button-send").getAttribute("command"), "cmd_sendButton");
  assert_equals(aCwc.e("menu-item-send-now").getAttribute("command"), "cmd_sendNow");
}

/**
 * Bug 431217
 * Test that the Send buttons are properly enabled if an addressee is input
 * by the user.
 */
function test_send_enabled_manual_address() {
  let isMac = AppConstants.platform == "macosx";
  let cwc = open_compose_new_mail(); // compose controller
  // On an empty window, Send must be disabled.
  check_send_commands_state(cwc, false);

  // On valid "To:" addressee input, Send must be enabled.
  toggle_recipient_type(cwc, "addr_to");
  setup_msg_contents(cwc, " recipient@fake.invalid ", "", "");
  check_send_commands_state(cwc, true);

  // When the addressee is not in To, Cc, Bcc or Newsgroup, disable Send again.
  toggle_recipient_type(cwc, "addr_reply");
  check_send_commands_state(cwc, false);

  clear_recipient(cwc);
  check_send_commands_state(cwc, false);

  // Bug 1296535
  // Try some other invalid and valid recipient strings:
  // - random string that is no email.
  setup_msg_contents(cwc, " recipient@", "", "");
  check_send_commands_state(cwc, false);

  toggle_recipient_type(cwc, "addr_cc");
  check_send_commands_state(cwc, false);

  // We change focus from recipient type box to recipient input box.
  // One click on the recipient input box selects the whole typed string (bug 1527547).
  cwc.click(cwc.eid("addressCol2#1"), 200, 5);
  // On macOS the focus is automatically returned to the input box after operating
  // the type box and no focus event is fired. So the recipient is not selected
  // and the caret is after the last typed character (where we left off).
  if (AppConstants.platform == "macosx") {
    // Click subject and then back to recipient input to see that it gets selected.
    cwc.click(cwc.eid("msgSubject"));
    cwc.click(cwc.eid("addressCol2#1"));
  }
  assert_equals(cwc.e("addressCol2#1").selectionStart, 0);
  // End of selection counts the length of the " recipient@" string from above.
  assert_equals(cwc.e("addressCol2#1").selectionEnd, 11);
  // Another click after the recipient deselects it to allow typing.
  cwc.click(cwc.eid("addressCol2#1"), 200, 5);
  assert_equals(cwc.e("addressCol2#1").selectionStart, 11);
  // This types additional characters into the recipient.
  setup_msg_contents(cwc, "domain.invalid", "", "");
  check_send_commands_state(cwc, true);

  clear_recipient(cwc);
  check_send_commands_state(cwc, false);

  // - a mailinglist in addressbook
  // Button is enabled without checking whether it contains valid addresses.
  let defaultAB = MailServices.ab.getDirectory("moz-abmdbdirectory://abook.mab");
  let ml = create_mailing_list("emptyList");
  defaultAB.addMailList(ml);

  setup_msg_contents(cwc, " emptyList", "", "");
  check_send_commands_state(cwc, true);

  clear_recipient(cwc);
  check_send_commands_state(cwc, false);

  setup_msg_contents(cwc, "emptyList <list> ", "", "");
  check_send_commands_state(cwc, true);

  clear_recipient(cwc);
  check_send_commands_state(cwc, false);

  // - some string as a newsgroup
  toggle_recipient_type(cwc, "addr_newsgroups");
  setup_msg_contents(cwc, "newsgroup ", "", "");
  check_send_commands_state(cwc, true);

  close_compose_window(cwc);
}

/**
 * Bug 431217
 * Test that the Send buttons are properly enabled if an addressee is prefilled
 * automatically via account prefs.
 */
function test_send_enabled_prefilled_address() {
  // Set the prefs to prefill a default CC address when Compose is opened.
  let identity = account.defaultIdentity;
  identity.doCc = true;
  identity.doCcList = "Auto@recipient.invalid";

  // In that case the recipient is input, enabled Send.
  let cwc = open_compose_new_mail(); // compose controller
  check_send_commands_state(cwc, true);

  // Press backspace to remove the recipient. No other valid one is there,
  // Send should become disabled.
  cwc.e("addressCol2#1").select();
  cwc.keypress(null, "VK_BACK_SPACE", {});
  check_send_commands_state(cwc, false);

  close_compose_window(cwc);
  identity.doCcList = "";
  identity.doCc = false;
}

/**
 * Bug 933101
 * Similar to test_send_enabled_prefilled_address but switched between an identity
 * that has a CC list and one that doesn't directly in the compose window.
 */
function test_send_enabled_prefilled_address_from_identity() {
  // The first identity will have an automatic CC enabled.
  let identityWithCC = account.defaultIdentity;
  identityWithCC.doCc = true;
  identityWithCC.doCcList = "Auto@recipient.invalid";

  // CC is prefilled, Send enabled.
  let cwc = open_compose_new_mail();
  check_send_commands_state(cwc, true);

  let identityPicker = cwc.e("msgIdentity");
  assert_equals(identityPicker.selectedIndex, 0);

  // Switch to the second identity that has no CC. Send should be disabled.
  assert_true(account.identities.length >= 2);
  let identityWithoutCC = account.identities.queryElementAt(1, Ci.nsIMsgIdentity);
  assert_false(identityWithoutCC.doCc);
  cwc.click(cwc.eid("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"),
                              [ { identitykey: identityWithoutCC.key } ]);
  check_send_commands_state(cwc, false);

  // Check the first identity again.
  cwc.click(cwc.eid("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"),
                              [ { identitykey: identityWithCC.key } ]);
  check_send_commands_state(cwc, true);

  close_compose_window(cwc);
  identityWithCC.doCcList = "";
  identityWithCC.doCc = false;
}

/**
 * Bug 863231
 * Test that the Send buttons are properly enabled if an addressee is populated
 * via the Contacts sidebar.
 */
function test_send_enabled_address_contacts_sidebar() {
  // Create some contact address book card in the Personal addressbook.
  let defaultAB = MailServices.ab.getDirectory("moz-abmdbdirectory://abook.mab");
  let contact = create_contact("test@example.com", "Sammy Jenkis", true);
  load_contacts_into_address_book(defaultAB, [contact]);

  let cwc = open_compose_new_mail(); // compose controller
  // On an empty window, Send must be disabled.
  check_send_commands_state(cwc, false);

  // Open Contacts sidebar and use our contact.
  cwc.window.toggleAddressPicker();

  let sidebar = cwc.e("sidebar");
  wait_for_frame_load(sidebar,
    "chrome://messenger/content/addressbook/abContactsPanel.xul?focus");

  let abTree = sidebar.contentDocument.getElementById("abResultsTree");
  // The results are loaded async so wait for the population of the tree.
  utils.waitFor(() => abTree.view.rowCount > 0, "Addressbook cards didn't load");
  click_tree_row(abTree, 0, cwc);

  sidebar.contentDocument.getElementById("ccButton").click();

  // The recipient is filled in, Send must be enabled.
  check_send_commands_state(cwc, true);

  cwc.window.toggleAddressPicker();
  close_compose_window(cwc);
}
