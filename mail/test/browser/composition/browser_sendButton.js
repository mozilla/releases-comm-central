/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests proper enabling of send buttons depending on addresses input.
 */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var { create_contact, create_mailing_list, load_contacts_into_address_book } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/AddressBookHelpers.jsm"
  );
var {
  be_in_folder,
  click_tree_row,
  FAKE_SERVER_HOSTNAME,
  get_special_folder,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  clear_recipients,
  get_first_pill,
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { plan_for_modal_dialog, wait_for_frame_load, wait_for_modal_dialog } =
  ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var account = null;

add_setup(async function () {
  // Ensure we're in the tinderbox account as that has the right identities set
  // up for this test.
  let server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  account = MailServices.accounts.FindAccountForServer(server);
  let inbox = await get_special_folder(
    Ci.nsMsgFolderFlags.Inbox,
    false,
    server
  );
  await be_in_folder(inbox);
});

/**
 * Check if the send commands are in the wished state.
 *
 * @param aCwc      The compose window controller.
 * @param aEnabled  The expected state of the commands.
 */
function check_send_commands_state(aCwc, aEnabled) {
  Assert.equal(
    aCwc.window.document
      .getElementById("cmd_sendButton")
      .hasAttribute("disabled"),
    !aEnabled
  );
  Assert.equal(
    aCwc.window.document.getElementById("cmd_sendNow").hasAttribute("disabled"),
    !aEnabled
  );
  Assert.equal(
    aCwc.window.document
      .getElementById("cmd_sendWithCheck")
      .hasAttribute("disabled"),
    !aEnabled
  );
  Assert.equal(
    aCwc.window.document
      .getElementById("cmd_sendLater")
      .hasAttribute("disabled"),
    !aEnabled
  );

  // The toolbar buttons and menuitems should be linked to these commands
  // thus inheriting the enabled state. Check that on the Send button
  // and Send Now menuitem.
  Assert.equal(
    aCwc.window.document.getElementById("button-send").getAttribute("command"),
    "cmd_sendButton"
  );
  Assert.equal(
    aCwc.window.document
      .getElementById("menu-item-send-now")
      .getAttribute("command"),
    "cmd_sendNow"
  );
}

/**
 * Bug 431217
 * Test that the Send buttons are properly enabled if an addressee is input
 * by the user.
 */
add_task(async function test_send_enabled_manual_address() {
  let cwc = open_compose_new_mail(); // compose controller
  let menu = cwc.window.document.getElementById("extraAddressRowsMenu"); // extra recipients menu
  let menuButton = cwc.window.document.getElementById(
    "extraAddressRowsMenuButton"
  );

  // On an empty window, Send must be disabled.
  check_send_commands_state(cwc, false);

  // On valid "To:" addressee input, Send must be enabled.
  setup_msg_contents(cwc, " recipient@fake.invalid ", "", "");
  check_send_commands_state(cwc, true);

  // When the addressee is not in To, Cc, Bcc or Newsgroup, disable Send again.
  clear_recipients(cwc);
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, menuButton.ownerGlobal);
  await new Promise(resolve => setTimeout(resolve));
  await wait_for_popup_to_open(menu);
  menu.activateItem(
    cwc.window.document.getElementById("addr_replyShowAddressRowMenuItem")
  );
  setup_msg_contents(cwc, " recipient@fake.invalid ", "", "", "replyAddrInput");
  check_send_commands_state(cwc, false);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  // Bug 1296535
  // Try some other invalid and valid recipient strings:
  // - random string that is no email.
  setup_msg_contents(cwc, " recipient@", "", "");
  check_send_commands_state(cwc, false);

  let ccShow = cwc.window.document.getElementById(
    "addr_ccShowAddressRowButton"
  );
  EventUtils.synthesizeMouseAtCenter(ccShow, {}, ccShow.ownerGlobal);
  await new Promise(resolve => setTimeout(resolve));
  check_send_commands_state(cwc, false);

  // Select the newly generated pill.
  EventUtils.synthesizeMouseAtCenter(
    get_first_pill(cwc),
    {},
    get_first_pill(cwc).ownerGlobal
  );
  await new Promise(resolve => setTimeout(resolve));
  // Delete the selected pill.
  EventUtils.synthesizeKey("VK_DELETE", {}, cwc.window);
  // Confirm the address row is now empty.
  Assert.ok(!get_first_pill(cwc));
  // Confirm the send button is disabled.
  check_send_commands_state(cwc, false);
  // Add multiple recipients.
  setup_msg_contents(
    cwc,
    "recipient@domain.invalid, info@somedomain.extension, name@incomplete",
    "",
    ""
  );
  check_send_commands_state(cwc, true);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  // - a mailinglist in addressbook
  // Button is enabled without checking whether it contains valid addresses.
  let defaultAB = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  let ml = create_mailing_list("emptyList");
  defaultAB.addMailList(ml);

  setup_msg_contents(cwc, " emptyList", "", "");
  check_send_commands_state(cwc, true);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  setup_msg_contents(cwc, "emptyList <list> ", "", "");
  check_send_commands_state(cwc, true);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  // Hack to reveal the newsgroup button.
  let newsgroupsButton = cwc.window.document.getElementById(
    "addr_newsgroupsShowAddressRowButton"
  );
  newsgroupsButton.hidden = false;
  EventUtils.synthesizeMouseAtCenter(
    newsgroupsButton,
    {},
    newsgroupsButton.ownerGlobal
  );
  await new Promise(resolve => setTimeout(resolve));

  // - some string as a newsgroup
  setup_msg_contents(cwc, "newsgroup ", "", "", "newsgroupsAddrInput");
  check_send_commands_state(cwc, true);

  close_compose_window(cwc);
});

/**
 * Bug 431217
 * Test that the Send buttons are properly enabled if an addressee is prefilled
 * automatically via account prefs.
 */
add_task(function test_send_enabled_prefilled_address() {
  // Set the prefs to prefill a default CC address when Compose is opened.
  let identity = account.defaultIdentity;
  identity.doCc = true;
  identity.doCcList = "Auto@recipient.invalid";

  // In that case the recipient is input, enabled Send.
  let cwc = open_compose_new_mail(); // compose controller
  check_send_commands_state(cwc, true);

  // Clear the CC list.
  clear_recipients(cwc);
  // No other pill is there. Send should become disabled.
  check_send_commands_state(cwc, false);

  close_compose_window(cwc);
  identity.doCcList = "";
  identity.doCc = false;
});

/**
 * Bug 933101
 * Similar to test_send_enabled_prefilled_address but switched between an identity
 * that has a CC list and one that doesn't directly in the compose window.
 */
add_task(async function test_send_enabled_prefilled_address_from_identity() {
  // The first identity will have an automatic CC enabled.
  let identityWithCC = account.defaultIdentity;
  identityWithCC.doCc = true;
  identityWithCC.doCcList = "Auto@recipient.invalid";

  // CC is prefilled, Send enabled.
  let cwc = open_compose_new_mail();
  check_send_commands_state(cwc, true);

  let identityPicker = cwc.window.document.getElementById("msgIdentity");
  Assert.equal(identityPicker.selectedIndex, 0);

  // Switch to the second identity that has no CC. Send should be disabled.
  Assert.ok(account.identities.length >= 2);
  let identityWithoutCC = account.identities[1];
  Assert.ok(!identityWithoutCC.doCc);
  await chooseIdentity(cwc.window, identityWithoutCC.key);
  check_send_commands_state(cwc, false);

  // Check the first identity again.
  await chooseIdentity(cwc.window, identityWithCC.key);
  check_send_commands_state(cwc, true);

  close_compose_window(cwc);
  identityWithCC.doCcList = "";
  identityWithCC.doCc = false;
});

/**
 * Bug 863231
 * Test that the Send buttons are properly enabled if an addressee is populated
 * via the Contacts sidebar.
 */
add_task(function test_send_enabled_address_contacts_sidebar() {
  // Create some contact address book card in the Personal addressbook.
  let defaultAB = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  let contact = create_contact("test@example.com", "Sammy Jenkis", true);
  load_contacts_into_address_book(defaultAB, [contact]);

  let cwc = open_compose_new_mail(); // compose controller
  // On an empty window, Send must be disabled.
  check_send_commands_state(cwc, false);

  // Open Contacts sidebar and use our contact.
  // FIXME: Use UI to open contacts sidebar.
  cwc.window.toggleContactsSidebar();

  let contactsBrowser = cwc.window.document.getElementById("contactsBrowser");
  wait_for_frame_load(
    contactsBrowser,
    "chrome://messenger/content/addressbook/abContactsPanel.xhtml?focus"
  );

  let abTree = contactsBrowser.contentDocument.getElementById("abResultsTree");
  // The results are loaded async so wait for the population of the tree.
  utils.waitFor(
    () => abTree.view.rowCount > 0,
    "Addressbook cards didn't load"
  );
  click_tree_row(abTree, 0, cwc);

  contactsBrowser.contentDocument.getElementById("ccButton").click();

  // The recipient is filled in, Send must be enabled.
  check_send_commands_state(cwc, true);

  // FIXME: Use UI to close contacts sidebar.
  cwc.window.toggleContactsSidebar();
  close_compose_window(cwc);
});

/**
 * Tests that when editing a pill and clicking send while the edit is active
 * the pill gets updated before the send of the email.
 */
add_task(async function test_update_pill_before_send() {
  let cwc = open_compose_new_mail();

  setup_msg_contents(cwc, "recipient@fake.invalid", "Subject", "");

  let pill = get_first_pill(cwc);

  // Edit the first pill.
  // First, we need to get into the edit mode by clicking the pill twice.
  EventUtils.synthesizeMouseAtCenter(pill, { clickCount: 1 }, cwc.window);
  let clickPromise = BrowserTestUtils.waitForEvent(pill, "click");
  // We do not want a double click, but two separate clicks.
  EventUtils.synthesizeMouseAtCenter(pill, { clickCount: 1 }, cwc.window);
  await clickPromise;

  Assert.ok(!pill.querySelector("input").hidden);

  // Set the pill which is in edit mode to an invalid email.
  EventUtils.synthesizeKey("KEY_Home", { shiftKey: true }, cwc.window);
  EventUtils.synthesizeKey("VK_BACK_SPACE", {}, cwc.window);
  EventUtils.sendString("invalidEmail", cwc.window);

  // Click send while the pill is in the edit mode and check the dialog title
  // if the pill is updated we get an invalid recipient error. Otherwise the
  // error would be an imap error because the email would still be sent to
  // `recipient@fake.invalid`.
  let dialogTitle;
  plan_for_modal_dialog("commonDialogWindow", cwc => {
    dialogTitle = cwc.window.document.getElementById("infoTitle").textContent;
    cwc.window.document.querySelector("dialog").getButton("accept").click();
  });
  // Click the send button.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("button-send"),
    {},
    cwc.window
  );
  wait_for_modal_dialog("commonDialogWindow");

  Assert.ok(
    dialogTitle.includes("Invalid Recipient Address"),
    "The pill edit has been updated before sending the email"
  );

  close_compose_window(cwc);
});
