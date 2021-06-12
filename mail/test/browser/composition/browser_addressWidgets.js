/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests proper enabling of addressing widgets.
 */

/* globals gFolderTreeView */

"use strict";

var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { be_in_folder, FAKE_SERVER_HOSTNAME } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var cwc = null; // compose window controller
var accountPOP3 = null;
var accountNNTP = null;
var originalAccountCount;

add_task(function setupModule(module) {
  gFolderTreeView._tree.focus();

  // Ensure we're in the tinderbox account as that has the right identities set
  // up for this test.
  let server = MailServices.accounts.FindServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  accountPOP3 = MailServices.accounts.FindAccountForServer(server);

  // There may be pre-existing accounts from other tests.
  originalAccountCount = MailServices.accounts.allServers.length;
});

/**
 * Check if the address type items are in the wished state.
 *
 * @param aItemsEnabled  List of item values that should be enabled (uncollapsed).
 */
function check_address_types_state(aItemsEnabled) {
  let addr_types = document.querySelectorAll("label.recipient-label");
  for (let item of addr_types) {
    Assert.ok(item.collapsed != aItemsEnabled.includes(item.id));
  }
}

/**
 * With only a POP3 account, no News related address types should be enabled.
 */
function check_mail_address_types() {
  check_address_types_state(["addr_to", "addr_cc", "addr_reply", "addr_bcc"]);
}

/**
 * With a NNTP account, all address types should be enabled.
 */
function check_nntp_address_types() {
  check_address_types_state([
    "addr_to",
    "addr_cc",
    "addr_reply",
    "addr_bcc",
    "addr_newsgroups",
    "addr_followup",
  ]);
}

/**
 * With an NNTP account, the 'To' addressing row should be hidden.
 */
function check_collapsed_pop_recipient(cwc) {
  Assert.ok(cwc.e("addressRowTo").classList.contains("hidden"));
}

function add_NNTP_account() {
  // Create a NNTP server
  let nntpServer = MailServices.accounts
    .createIncomingServer(null, "example.nntp.invalid", "nntp")
    .QueryInterface(Ci.nsINntpIncomingServer);

  let identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox2@example.invalid";

  accountNNTP = MailServices.accounts.createAccount();
  accountNNTP.incomingServer = nntpServer;
  accountNNTP.addIdentity(identity);
  // Now there should be 1 more account.
  Assert.equal(
    MailServices.accounts.allServers.length,
    originalAccountCount + 1
  );
}

function remove_NNTP_account() {
  // Remove our NNTP account to leave the profile clean.
  MailServices.accounts.removeAccount(accountNNTP);
  // There should be only the original accounts left.
  Assert.equal(MailServices.accounts.allServers.length, originalAccountCount);
}

/**
 * Bug 399446 & bug 922614
 * Test that the allowed address types depend on the account type
 * we are sending from.
 */
add_task(async function test_address_types() {
  // Be sure there is no NNTP account yet.
  for (let account of MailServices.accounts.accounts) {
    Assert.notEqual(
      account.incomingServer.type,
      "nntp",
      "There is a NNTP account existing unexpectedly"
    );
  }

  // Open compose window on the existing POP3 account.
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  cwc = open_compose_new_mail();
  check_mail_address_types();
  close_compose_window(cwc);

  add_NNTP_account();

  // From now on, we should always get all possible address types offered,
  // regardless of which account is used of composing (bug 922614).
  be_in_folder(accountNNTP.incomingServer.rootFolder);
  cwc = open_compose_new_mail();
  check_nntp_address_types();
  check_collapsed_pop_recipient(cwc);
  close_compose_window(cwc);

  // Now try the same accounts but choosing them in the From dropdown
  // inside compose window.
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  cwc = open_compose_new_mail();
  check_nntp_address_types();

  let NNTPidentity = accountNNTP.defaultIdentity.key;
  cwc.click(cwc.e("msgIdentity"));
  await cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"), [
    { identitykey: NNTPidentity },
  ]);
  check_nntp_address_types();

  // Switch back to the POP3 account.
  let POP3identity = accountPOP3.defaultIdentity.key;
  cwc.click(cwc.e("msgIdentity"));
  await cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"), [
    { identitykey: POP3identity },
  ]);
  check_nntp_address_types();

  close_compose_window(cwc);

  remove_NNTP_account();

  // Now the NNTP account is lost, so we should be back to mail only addresses.
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  cwc = open_compose_new_mail();
  check_mail_address_types();
  close_compose_window(cwc);
});

add_task(async function test_address_suppress_leading_comma_space() {
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  let controller = open_compose_new_mail();

  let addrInput = controller.window.document.getElementById("toAddrInput");
  Assert.ok(addrInput);
  Assert.equal(addrInput.value, "");

  // Create a pill.
  addrInput.value = "person@org";
  // Comma triggers the pill creation.
  // Note: the address input should already have focus.
  EventUtils.synthesizeKey(",", {}, controller.window);

  let addrPill = await TestUtils.waitForCondition(
    () =>
      controller.window.document.querySelector(
        "#toAddrContainer > .address-pill"
      ),
    "Pill creation"
  );
  Assert.equal(addrInput.value, "");
  let pillInput = addrPill.querySelector("input");
  Assert.ok(pillInput);

  // Asserts that the input has the correct exceptional behaviour for 'comma'
  // and 'space'.
  async function assertKeyInput(input) {
    // Since we will be partially testing for a lack of response to the " " and
    // "," key presses, we first run the tests with the "a" key press to assure
    // us that the tests would otherwise capture the normal behaviour. This will
    // also shows us that the comma and space behaviour is exceptional.
    for (let key of ["a", " ", ","]) {
      // Clear input.
      input.value = "";
      await TestUtils.waitForTick();

      // Type the key in an empty input.
      let eventPromise = BrowserTestUtils.waitForEvent(input, "keydown");
      EventUtils.synthesizeKey(key, {}, controller.window);
      await eventPromise;

      if (key === " " || key === ",") {
        // Key is suppressed, so the input remains empty.
        Assert.equal(input.value, "");
      } else {
        // Normal behaviour: key is added to the input.
        Assert.equal(input.value, key);
      }

      // If the input is not empty, we should still have the normal behaviour.
      input.value = "z";
      input.selectionStart = 1;
      input.SelectionEnd = 1;
      await TestUtils.waitForTick();

      eventPromise = BrowserTestUtils.waitForEvent(input, "keydown");
      EventUtils.synthesizeKey(key, {}, controller.window);
      await eventPromise;

      Assert.equal(input.value, "z" + key);

      // Test typing the key to replace all the trimmed input.
      // Sample text with two spaces as start and end. Also includes a 2
      // character emoji.
      let someText = "  some, text📜  ";
      for (let selection of [
        { start: 0, end: 0 },
        { start: 1, end: 0 },
        { start: 0, end: 1 },
        { start: 2, end: 2 },
      ]) {
        input.value = someText;
        input.selectionStart = selection.start;
        input.selectionEnd = someText.length - selection.end;
        await TestUtils.waitForTick();

        // Type the key to replace the text.
        eventPromise = BrowserTestUtils.waitForEvent(input, "keydown");
        EventUtils.synthesizeKey(key, {}, controller.window);
        await eventPromise;

        if (key === " " || key === ",") {
          // Key is suppressed and input is empty.
          Assert.equal(input.value, "");
        } else {
          // Normal behaviour: key replaces the selected text.
          Assert.equal(
            input.value,
            someText.slice(0, selection.start) +
              key +
              someText.slice(someText.length - selection.end)
          );
        }
      }

      // If we do not replace all the trimmed input, we should still have
      // normal behaviour.
      input.value = "  text ";
      input.selectionStart = 1;
      // Select up to 'x'.
      input.selectionEnd = 5;
      await TestUtils.waitForTick();

      eventPromise = BrowserTestUtils.waitForEvent(input, "keydown");
      EventUtils.synthesizeKey(key, {}, controller.window);
      await eventPromise;
      Assert.equal(input.value, " " + key + "t ");
    }
  }

  // Assert that the address input has the correct behaviour for key presses.
  // Note: the address input should still have focus.
  await assertKeyInput(addrInput);

  // Now test the behaviour when editing a pill.
  // First, we need to get into editing mode by clicking the pill twice.
  EventUtils.synthesizeMouseAtCenter(
    addrPill,
    { clickCount: 1 },
    controller.window
  );
  let clickPromise = BrowserTestUtils.waitForEvent(addrPill, "click");
  // We do not want a double click, but two separate clicks.
  EventUtils.synthesizeMouseAtCenter(
    addrPill,
    { clickCount: 1 },
    controller.window
  );
  await clickPromise;

  Assert.ok(!pillInput.hidden);

  // Assert that editing a pill has the same behaviour as the address input.
  await assertKeyInput(pillInput);

  close_compose_window(controller);
});

add_task(async function test_pill_creation_in_all_fields() {
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  let cwc = open_compose_new_mail();

  let addresses = ["person@org", "foo@address.valid", "invalid", "foo@address"];
  let subjectField = cwc.window.document.getElementById("msgSubject");

  // Helper method to create multiple pills in a field.
  async function assertPillsCreationInField(input) {
    Assert.ok(input);
    Assert.equal(input.value, "");

    // Write an address in the field.
    input.value = addresses[0];
    // Enter triggers the pill creation.
    EventUtils.synthesizeKey("VK_RETURN", {}, cwc.window);
    // Assert the pill was created.
    await TestUtils.waitForCondition(
      () =>
        input
          .closest(".address-container")
          .querySelectorAll("mail-address-pill").length == 1,
      "Pills created"
    );
    // Assert the pill has the correct address.
    Assert.equal(
      input
        .closest(".address-container")
        .querySelectorAll("mail-address-pill")[0].emailAddress,
      addresses[0]
    );

    // Write another address in the field.
    input.value = addresses[1];
    // Tab triggers the pill creation.
    EventUtils.synthesizeKey("VK_TAB", {}, cwc.window);
    // Assert the pill was created.
    await TestUtils.waitForCondition(
      () =>
        input
          .closest(".address-container")
          .querySelectorAll("mail-address-pill").length == 2,
      "Pills created"
    );
    // Assert the pill has the correct address.
    Assert.equal(
      input
        .closest(".address-container")
        .querySelectorAll("mail-address-pill")[1].emailAddress,
      addresses[1]
    );

    // Write an invalid email address in the To field.
    input.value = addresses[2];
    // Enter triggers the pill creation.
    EventUtils.synthesizeKey("VK_RETURN", {}, cwc.window);
    // Assert that an invalid address pill was created.
    await TestUtils.waitForCondition(
      () =>
        input
          .closest(".address-container")
          .querySelectorAll("mail-address-pill.invalid-address").length == 1,
      "Invalid pill created"
    );
    // Assert the pill has the correct address.
    Assert.equal(
      input
        .closest(".address-container")
        .querySelector("mail-address-pill.invalid-address").emailAddress,
      addresses[2]
    );

    // Write another address in the field.
    input.value = addresses[3];
    // Focusing on another element triggers the pill creation.
    subjectField.focus();
    // Assert the pill was created.
    await TestUtils.waitForCondition(
      () =>
        input
          .closest(".address-container")
          .querySelectorAll("mail-address-pill").length == 4,
      "Pills created"
    );
    // Assert the pill has the correct address.
    Assert.equal(
      input
        .closest(".address-container")
        .querySelectorAll("mail-address-pill")[3].emailAddress,
      addresses[3]
    );
  }

  // The To field is visible and focused by default when the compose window is
  // first opened.
  // Test pill creation for the To input field.
  let toInput = cwc.window.document.getElementById("toAddrInput");
  await assertPillsCreationInField(toInput);

  // Click on the Cc recipient label.
  let ccInput = cwc.window.document.getElementById("ccAddrInput");
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  // The Cc field should now be visible.
  Assert.ok(
    !ccInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The Cc field is visible"
  );
  // Test pill creation for the Cc input field.
  await assertPillsCreationInField(ccInput);

  // Click on the Bcc recipient label.
  let bccInput = cwc.window.document.getElementById("bccAddrInput");
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_bcc"),
    {},
    cwc.window
  );
  // The Bcc field should now be visible.
  Assert.ok(
    !bccInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The Bcc field is visible"
  );
  // Test pill creation for the Bcc input field.
  await assertPillsCreationInField(bccInput);

  // Focus on the Bcc field and hold press the Backspace key.
  bccInput.focus();
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 5 }, cwc.window);

  // All pills should be deleted, but the focus should remain on the Bcc field.
  Assert.equal(
    bccInput.closest(".address-container").querySelectorAll("mail-address-pill")
      .length,
    0,
    "All pills in the Bcc field have been removed."
  );
  Assert.ok(
    !bccInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The Bcc field is still visible"
  );

  // Press and hold Backspace again.
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 2 }, cwc.window);

  // Confirm the Bcc field is closed and the focus moved to the Cc field.
  Assert.ok(
    bccInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The Bcc field was closed"
  );
  Assert.equal(cwc.window.document.activeElement, ccInput);

  // Now we're on the Cc field. Press and hold Backspace to delete all pills.
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 5 }, cwc.window);

  // All pills should be deleted, but the focus should remain on the Cc field.
  Assert.equal(
    ccInput.closest(".address-container").querySelectorAll("mail-address-pill")
      .length,
    0,
    "All pills in the Cc field have been removed."
  );
  Assert.ok(
    !ccInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The Cc field is still visible"
  );

  // Press and hold Backspace again.
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 2 }, cwc.window);

  // Confirm the Cc field is closed and the focus moved to the To field.
  Assert.ok(
    ccInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The Cc field was closed"
  );
  Assert.equal(cwc.window.document.activeElement, toInput);

  // Now we're on the To field. Press and hold Backspace to delete all pills.
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 5 }, cwc.window);

  // All pills should be deleted, but the focus should remain on the To field.
  Assert.equal(
    toInput.closest(".address-container").querySelectorAll("mail-address-pill")
      .length,
    0,
    "All pills in the To field have been removed."
  );
  Assert.ok(
    !toInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The To field is still visible"
  );

  // Press and hold Backspace again.
  EventUtils.synthesizeKey("KEY_Backspace", { repeat: 2 }, cwc.window);

  // Long backspace keypress on the To field shouldn't do anything if the field
  // is empty. Confirm the To field is still visible and the focus stays on the
  // To field.
  Assert.ok(
    !toInput.closest(".addressingWidgetItem").classList.contains("hidden"),
    "The To field is still visible"
  );
  Assert.equal(cwc.window.document.activeElement, toInput);

  close_compose_window(cwc);
});

add_task(async function test_addressing_fields_shortcuts() {
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  let cwc = open_compose_new_mail();

  let addrToInput = cwc.window.document.getElementById("toAddrInput");
  // The To input field should be empty.
  Assert.equal(addrToInput.value, "");
  // The To input field should be the currently focused element.
  Assert.equal(cwc.window.document.activeElement, addrToInput);

  const modifiers =
    AppConstants.platform == "macosx"
      ? { accelKey: true, shiftKey: true }
      : { ctrlKey: true, shiftKey: true };

  let addrCcInput = cwc.window.document.getElementById("ccAddrInput");
  let ccRowShownPromise = BrowserTestUtils.waitForCondition(
    () => !addrCcInput.closest(".address-row").classList.contains("hidden"),
    "The Cc addressing row is not visible."
  );
  // Press the Ctrl/Cmd+Shift+C.
  EventUtils.synthesizeKey("C", modifiers, cwc.window);
  // The Cc addressing row should be visible.
  await ccRowShownPromise;
  // The Cc input field should be currently focused.
  Assert.equal(cwc.window.document.activeElement, addrCcInput);

  let addrBccInput = cwc.window.document.getElementById("bccAddrInput");
  let bccRowShownPromise = BrowserTestUtils.waitForCondition(
    () => !addrBccInput.closest(".address-row").classList.contains("hidden"),
    "The Bcc addressing row is not visible."
  );
  // Press the Ctrl/Cmd+Shift+B.
  EventUtils.synthesizeKey("B", modifiers, cwc.window);
  await bccRowShownPromise;
  // The Bcc input field should be currently focused.
  Assert.equal(cwc.window.document.activeElement, addrBccInput);

  // Press the Ctrl/Cmd+Shift+T.
  EventUtils.synthesizeKey("T", modifiers, cwc.window);
  // The To input field should be the currently focused element.
  Assert.equal(cwc.window.document.activeElement, addrToInput);

  // Press the Ctrl/Cmd+Shift+C.
  EventUtils.synthesizeKey("C", modifiers, cwc.window);
  // The Cc input field should be currently focused.
  Assert.equal(cwc.window.document.activeElement, addrCcInput);

  // Press the Ctrl/Cmd+Shift+B.
  EventUtils.synthesizeKey("B", modifiers, cwc.window);
  // The Bcc input field should be currently focused.
  Assert.equal(cwc.window.document.activeElement, addrBccInput);

  close_compose_window(cwc);
});

add_task(async function test_pill_deletion_and_focus() {
  be_in_folder(accountPOP3.incomingServer.rootFolder);
  let cwc = open_compose_new_mail();

  // When the compose window is opened, the focus should be on the To field.
  let toInput = cwc.window.document.getElementById("toAddrInput");
  Assert.equal(cwc.window.document.activeElement, toInput);

  const modifiers =
    AppConstants.platform == "macosx" ? { accelKey: true } : { ctrlKey: true };
  const addresses = "person@org, foo@address.valid, invalid, foo@address";

  // Test the To field.
  test_deletion_and_focus_on_input(cwc, toInput, addresses, modifiers);

  // Reveal and test the Cc field.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_cc"),
    {},
    cwc.window
  );
  test_deletion_and_focus_on_input(
    cwc,
    cwc.window.document.getElementById("ccAddrInput"),
    addresses,
    modifiers
  );

  // Reveal and test the Bcc field.
  EventUtils.synthesizeMouseAtCenter(
    cwc.window.document.getElementById("addr_bcc"),
    {},
    cwc.window
  );
  test_deletion_and_focus_on_input(
    cwc,
    cwc.window.document.getElementById("bccAddrInput"),
    addresses,
    modifiers
  );

  close_compose_window(cwc);
});

function test_deletion_and_focus_on_input(cwc, input, addresses, modifiers) {
  // Focus on the input before adding anything to be sure keyboard shortcut are
  // triggered from the right element.
  input.focus();

  // Fill the input field with a long of string of comma separated addresses.
  input.value = addresses;

  // Enter triggers the pill creation.
  EventUtils.synthesizeKey("VK_RETURN", {}, cwc.window);

  let container = input.closest(".address-container");
  // We should now have 4 pills.
  Assert.equal(
    container.querySelectorAll("mail-address-pill").length,
    4,
    "All pills in the field have been created."
  );

  // One pill should be flagged as invalid.
  Assert.equal(
    container.querySelectorAll("mail-address-pill.invalid-address").length,
    1,
    "One created pill is invalid."
  );

  // After pills creation, the same field should be still focused.
  Assert.equal(cwc.window.document.activeElement, input);

  // Keypress left arrow should focus and select the last created pill.
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, cwc.window);
  Assert.equal(
    container.querySelectorAll("mail-address-pill[selected]").length,
    1,
    "One pill is currently selected."
  );

  // Pressing delete should delete the selected pill and move the focus back to
  // the input.
  EventUtils.synthesizeKey("KEY_Delete", {}, cwc.window);
  Assert.equal(
    container.querySelectorAll("mail-address-pill").length,
    3,
    "One pill correctly deleted."
  );
  Assert.equal(cwc.window.document.activeElement, input);

  // Keypress left arrow to select the last available pill.
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, cwc.window);
  Assert.equal(
    container.querySelectorAll("mail-address-pill[selected]").length,
    1,
    "One pill is currently selected."
  );

  // BackSpace should delete the pill and focus on the previous adjacent pill.
  EventUtils.synthesizeKey("KEY_Backspace", {}, cwc.window);
  Assert.equal(
    container.querySelectorAll("mail-address-pill").length,
    2,
    "One pill correctly deleted."
  );
  let selectedPill = container.querySelector("mail-address-pill[selected]");
  Assert.equal(cwc.window.document.activeElement, selectedPill);

  // Pressing CTRL+A should select all pills.
  EventUtils.synthesizeKey("a", modifiers, cwc.window);
  Assert.equal(
    container.querySelectorAll("mail-address-pill[selected]").length,
    2,
    "All remaining 2 pills are currently selected."
  );

  // BackSpace should delete all pills and focus on empty inptu field.
  EventUtils.synthesizeKey("KEY_Backspace", {}, cwc.window);
  Assert.equal(
    container.querySelectorAll("mail-address-pill").length,
    0,
    "All pills have been deleted."
  );
  Assert.equal(cwc.window.document.activeElement, input);
}
