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
add_task(function test_address_types() {
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
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"), [
    { identitykey: NNTPidentity },
  ]);
  check_nntp_address_types();

  // Switch back to the POP3 account.
  let POP3identity = accountPOP3.defaultIdentity.key;
  cwc.click(cwc.e("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"), [
    { identitykey: POP3identity },
  ]);
  check_nntp_address_types();

  close_compose_window(cwc);

  remove_NNTP_account();

  // Now the NNTP account is lost, so we should be back to mail only addressees.
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
  await assertPillsCreationInField(
    cwc.window.document.getElementById("toAddrInput")
  );

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

  close_compose_window(cwc);
});
