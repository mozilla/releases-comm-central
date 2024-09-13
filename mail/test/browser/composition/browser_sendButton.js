/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests proper enabling of send buttons depending on addresses input.
 */

"use strict";

var { create_contact, create_mailing_list, load_contacts_into_address_book } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AddressBookHelpers.sys.mjs"
  );
var {
  be_in_folder,
  click_tree_row,
  FAKE_SERVER_HOSTNAME,
  get_special_folder,
  wait_for_popup_to_open,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var {
  clear_recipients,
  get_first_pill,
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { promise_modal_dialog, wait_for_frame_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var account = null;

add_setup(async function () {
  // Ensure we're in the tinderbox account as that has the right identities set
  // up for this test.
  const server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  account = MailServices.accounts.findAccountForServer(server);
  const inbox = await get_special_folder(
    Ci.nsMsgFolderFlags.Inbox,
    false,
    server
  );
  await be_in_folder(inbox);
});

/**
 * Check if the send commands are in the wished state.
 *
 * @param {Window} aCwc - The compose window.
 * @param {boolean} aEnabled - The expected state of the commands.
 */
function check_send_commands_state(aCwc, aEnabled) {
  Assert.equal(
    aCwc.document.getElementById("cmd_sendButton").hasAttribute("disabled"),
    !aEnabled
  );
  Assert.equal(
    aCwc.document.getElementById("cmd_sendNow").hasAttribute("disabled"),
    !aEnabled
  );
  Assert.equal(
    aCwc.document.getElementById("cmd_sendWithCheck").hasAttribute("disabled"),
    !aEnabled
  );
  Assert.equal(
    aCwc.document.getElementById("cmd_sendLater").hasAttribute("disabled"),
    !aEnabled
  );

  // The toolbar buttons and menuitems should be linked to these commands
  // thus inheriting the enabled state. Check that on the Send button
  // and Send Now menuitem.
  Assert.equal(
    aCwc.document.getElementById("button-send").getAttribute("command"),
    "cmd_sendButton"
  );
  Assert.equal(
    aCwc.document.getElementById("menu-item-send-now").getAttribute("command"),
    "cmd_sendNow"
  );
}

/**
 * Bug 431217
 * Test that the Send buttons are properly enabled if an addressee is input
 * by the user.
 */
add_task(async function test_send_enabled_manual_address() {
  const cwc = await open_compose_new_mail();
  const menu = cwc.document.getElementById("extraAddressRowsMenu"); // extra recipients menu
  const menuButton = cwc.document.getElementById("extraAddressRowsMenuButton");

  // On an empty window, Send must be disabled.
  check_send_commands_state(cwc, false);

  // On valid "To:" addressee input, Send must be enabled.
  await setup_msg_contents(cwc, " recipient@fake.invalid ", "", "");
  check_send_commands_state(cwc, true);

  // When the addressee is not in To, Cc, Bcc or Newsgroup, disable Send again.
  clear_recipients(cwc);
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, menuButton.ownerGlobal);
  await new Promise(resolve => setTimeout(resolve));
  await wait_for_popup_to_open(menu);
  menu.activateItem(
    cwc.document.getElementById("addr_replyShowAddressRowMenuItem")
  );
  await setup_msg_contents(
    cwc,
    " recipient@fake.invalid ",
    "",
    "",
    "replyAddrInput"
  );
  check_send_commands_state(cwc, false);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  // Bug 1296535
  // Try some other invalid and valid recipient strings:
  // - random string that is no email.
  await setup_msg_contents(cwc, " recipient@", "", "");
  check_send_commands_state(cwc, false);

  const ccShow = cwc.document.getElementById("addr_ccShowAddressRowButton");
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
  EventUtils.synthesizeKey("VK_DELETE", {}, cwc);
  // Confirm the address row is now empty.
  Assert.ok(!get_first_pill(cwc));
  // Confirm the send button is disabled.
  check_send_commands_state(cwc, false);
  // Add multiple recipients.
  await setup_msg_contents(
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
  const defaultAB = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  const ml = create_mailing_list("emptyList");
  defaultAB.addMailList(ml);

  await setup_msg_contents(cwc, " emptyList", "", "");
  check_send_commands_state(cwc, true);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  await setup_msg_contents(cwc, "emptyList <list> ", "", "");
  check_send_commands_state(cwc, true);

  clear_recipients(cwc);
  check_send_commands_state(cwc, false);

  // Hack to reveal the newsgroup button.
  const newsgroupsButton = cwc.document.getElementById(
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
  await setup_msg_contents(cwc, "newsgroup ", "", "", "newsgroupsAddrInput");
  check_send_commands_state(cwc, true);

  await close_compose_window(cwc);
});

/**
 * Bug 431217
 * Test that the Send buttons are properly enabled if an addressee is prefilled
 * automatically via account prefs.
 */
add_task(async function test_send_enabled_prefilled_address() {
  // Set the prefs to prefill a default CC address when Compose is opened.
  const identity = account.defaultIdentity;
  identity.doCc = true;
  identity.doCcList = "Auto@recipient.invalid";

  // In that case the recipient is input, enabled Send.
  const cwc = await open_compose_new_mail();
  check_send_commands_state(cwc, true);

  // Clear the CC list.
  clear_recipients(cwc);
  // No other pill is there. Send should become disabled.
  check_send_commands_state(cwc, false);

  await close_compose_window(cwc);
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
  const identityWithCC = account.defaultIdentity;
  identityWithCC.doCc = true;
  identityWithCC.doCcList = "Auto@recipient.invalid";

  // CC is prefilled, Send enabled.
  const cwc = await open_compose_new_mail();
  check_send_commands_state(cwc, true);

  const identityPicker = cwc.document.getElementById("msgIdentity");
  Assert.equal(identityPicker.selectedIndex, 0);

  // Switch to the second identity that has no CC. Send should be disabled.
  Assert.ok(account.identities.length >= 2);
  const identityWithoutCC = account.identities[1];
  Assert.ok(!identityWithoutCC.doCc);
  await chooseIdentity(cwc, identityWithoutCC.key);
  check_send_commands_state(cwc, false);

  // Check the first identity again.
  await chooseIdentity(cwc, identityWithCC.key);
  check_send_commands_state(cwc, true);

  await close_compose_window(cwc);
  identityWithCC.doCcList = "";
  identityWithCC.doCc = false;
});

/**
 * Bug 863231
 * Test that the Send buttons are properly enabled if an addressee is populated
 * via the Contacts sidebar.
 */
add_task(async function test_send_enabled_address_contacts_sidebar() {
  // Create some contact address book card in the Personal addressbook.
  const defaultAB = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  const contact = create_contact("test@example.com", "Sammy Jenkis", true);
  load_contacts_into_address_book(defaultAB, [contact]);

  const cwc = await open_compose_new_mail();
  // On an empty window, Send must be disabled.
  check_send_commands_state(cwc, false);

  // Open Contacts sidebar and use our contact.
  // FIXME: Use UI to open contacts sidebar.
  cwc.toggleContactsSidebar();

  const contactsBrowser = cwc.document.getElementById("contactsBrowser");
  await wait_for_frame_load(
    contactsBrowser,
    "chrome://messenger/content/addressbook/abContactsPanel.xhtml?focus"
  );

  const abTree =
    contactsBrowser.contentDocument.getElementById("abResultsTree");
  // The results are loaded async so wait for the population of the tree.
  await TestUtils.waitForCondition(
    () => abTree.view.rowCount > 0,
    "Addressbook cards didn't load"
  );
  EventUtils.synthesizeMouseAtCenter(
    abTree.getRowAtIndex(0),
    {},
    contactsBrowser.contentWindow
  );

  contactsBrowser.contentDocument.getElementById("ccButton").click();

  // The recipient is filled in, Send must be enabled.
  check_send_commands_state(cwc, true);

  // FIXME: Use UI to close contacts sidebar.
  cwc.toggleContactsSidebar();
  await close_compose_window(cwc);
});

/**
 * Tests that when editing a pill and clicking send while the edit is active
 * the pill gets updated before the send of the email.
 */
add_task(async function test_update_pill_before_send() {
  const cwc = await open_compose_new_mail();

  await setup_msg_contents(cwc, "recipient@fake.invalid", "Subject", "");

  const pill = get_first_pill(cwc);

  // Edit the first pill.
  // First, we need to get into the edit mode by clicking the pill twice.
  EventUtils.synthesizeMouseAtCenter(pill, { clickCount: 1 }, cwc);
  const clickPromise = BrowserTestUtils.waitForEvent(pill, "click");
  // We do not want a double click, but two separate clicks.
  EventUtils.synthesizeMouseAtCenter(pill, { clickCount: 1 }, cwc);
  await clickPromise;

  Assert.ok(!pill.querySelector("input").hidden);

  // Set the pill which is in edit mode to an invalid email.
  EventUtils.synthesizeKey("KEY_Home", { shiftKey: true }, cwc);
  EventUtils.synthesizeKey("VK_BACK_SPACE", {}, cwc);
  EventUtils.sendString("invalidEmail", cwc);

  // Click send while the pill is in the edit mode and check the dialog title
  // if the pill is updated we get an invalid recipient error. Otherwise the
  // error would be an imap error because the email would still be sent to
  // `recipient@fake.invalid`.
  const dialogPromise = promise_modal_dialog("commonDialogWindow", cdw => {
    const dialogTitle = cdw.document.getElementById("infoTitle").textContent;
    Assert.ok(
      dialogTitle.includes("Invalid Recipient Address"),
      "The pill edit has been updated before sending the email"
    );
    cdw.document.querySelector("dialog").getButton("accept").click();
  });
  // Click the send button.
  EventUtils.synthesizeMouseAtCenter(
    cwc.document.getElementById("button-send"),
    {},
    cwc
  );
  await dialogPromise;
  await TestUtils.waitForTick();

  await close_compose_window(cwc);
});
