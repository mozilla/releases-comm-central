/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that compose new message chooses the correct initial identity when
 * called from the context of an open composer.
 */

"use strict";

var {
  close_compose_window,
  compose_window_ready,
  open_compose_new_mail,
  save_compose_message,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var { be_in_folder, get_special_folder, press_delete, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
  );
var { click_menus_in_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
  );
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gInbox;
var gDrafts;
var account;

var identityKey1;
var identity1Email = "x@example.invalid";
var identityKey2;
var identity2Email = "y@example.invalid";
var identity2Name = "User Y";
var identity2From = identity2Name + " <" + identity2Email + ">";
var identityKey3;
var identity3Email = "z@example.invalid";
var identity3Name = "User Z";
var identity3Label = "Label Z";
var identityKey4;

add_setup(async function () {
  // Now set up an account with some identities.
  account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "New Msg Compose Identity Testing",
    "pop3"
  );

  const identity1 = MailServices.accounts.createIdentity();
  identity1.email = identity1Email;
  account.addIdentity(identity1);
  identityKey1 = identity1.key;

  const identity2 = MailServices.accounts.createIdentity();
  identity2.email = identity2Email;
  identity2.fullName = identity2Name;
  account.addIdentity(identity2);
  identityKey2 = identity2.key;

  const identity3 = MailServices.accounts.createIdentity();
  identity3.email = identity3Email;
  identity3.fullName = identity3Name;
  identity3.label = identity3Label;
  account.addIdentity(identity3);
  identityKey3 = identity3.key;

  // Identity with no data.
  const identity4 = MailServices.accounts.createIdentity();
  account.addIdentity(identity4);
  identityKey4 = identity4.key;

  gInbox = account.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Helper to check that a suitable From identity was set up in the given
 * composer window.
 *
 * @param {Window} cwc - Compose window.
 * @param {string} aIdentityKey - The key of the expected identity.
 * @param {string} aIdentityAlias - The displayed label of the expected identity.
 * @param {string} aIdentityValue - The value of the expected identity (the
 *   sender address to be sent out).
 */
function checkCompIdentity(cwc, aIdentityKey, aIdentityAlias, aIdentityValue) {
  const identityList = cwc.document.getElementById("msgIdentity");

  Assert.equal(
    cwc.getCurrentIdentityKey(),
    aIdentityKey,
    "The From identity is not correctly selected"
  );

  if (aIdentityAlias) {
    Assert.equal(
      identityList.label,
      aIdentityAlias,
      "The From address does not have the correct label"
    );
  }

  if (aIdentityValue) {
    Assert.equal(
      identityList.value,
      aIdentityValue,
      "The From address does not have the correct value"
    );
  }
}

/**
 * Test that starting a new message from an open compose window gets the
 * expected initial identity.
 */
add_task(async function test_compose_from_composer() {
  await be_in_folder(gInbox);

  const cwc = await open_compose_new_mail();
  checkCompIdentity(cwc, account.defaultIdentity.key);

  // Compose a new message from the compose window.
  let composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("n", { shiftKey: false, accelKey: true }, cwc);
  const newCompWin = await compose_window_ready(composePromise);
  checkCompIdentity(newCompWin, account.defaultIdentity.key);
  await close_compose_window(newCompWin);

  // Switch to identity2 in the main compose window, new compose windows
  // starting from here should use the same identity as its "parent".
  await chooseIdentity(cwc, identityKey2);
  checkCompIdentity(cwc, identityKey2);

  // Compose a second new message from the compose window.
  composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("n", { shiftKey: false, accelKey: true }, cwc);
  const newCompWin2 = await compose_window_ready(composePromise);
  checkCompIdentity(newCompWin2, identityKey2);

  await close_compose_window(newCompWin2);

  await close_compose_window(cwc);
});

/**
 * Bug 87987
 * Test editing the identity email/name for the current composition.
 */
add_task(async function test_editing_identity() {
  Services.prefs.setBoolPref("mail.compose.warned_about_customize_from", true);
  await be_in_folder(gInbox);

  const compWin = await open_compose_new_mail();
  checkCompIdentity(compWin, account.defaultIdentity.key, identity1Email);

  // Input custom identity data into the From field.
  const customName = "custom";
  const customEmail = "custom@edited.invalid";
  const identityCustom = customName + " <" + customEmail + ">";

  EventUtils.synthesizeMouseAtCenter(
    compWin.document.getElementById("msgIdentity"),
    {},
    compWin.document.getElementById("msgIdentity").ownerGlobal
  );
  await click_menus_in_sequence(
    compWin.document.getElementById("msgIdentityPopup"),
    [{ command: "cmd_customizeFromAddress" }]
  );
  await TestUtils.waitForCondition(
    () => compWin.document.getElementById("msgIdentity").editable
  );

  compWin.document.getElementById("msgIdentityPopup").focus();
  EventUtils.sendString(identityCustom, compWin);
  checkCompIdentity(
    compWin,
    account.defaultIdentity.key,
    identityCustom,
    identityCustom
  );
  await close_compose_window(compWin);

  /* Temporarily disabled due to intermittent failure, bug 1237565.
     TODO: To be reeabled in bug 1238264.
  // Save message with this changed identity.
  compWin.SaveAsDraft();

  // Switch to another identity to see if editable field still obeys predefined
  // identity values.
  await click_menus_in_sequence(compWin.document.getElementById("msgIdentityPopup"),
                                  [ { identitykey: identityKey2 } ]);
  checkCompIdentity(compWin, identityKey2, identity2From, identity2From);

  // This should not save the identity2 to the draft message.
  await close_compose_window(compWin);

  await be_in_folder(gDrafts);
  let curMessage = await select_click_row(0);
  Assert.equal(curMessage.author, identityCustom);
  // Remove the saved draft.
  await press_delete(window);
  */
  Services.prefs.setBoolPref("mail.compose.warned_about_customize_from", false);
});

/**
 * Bug 318495
 * Test how an identity displays and behaves in the compose window.
 */
add_task(async function test_display_of_identities() {
  await be_in_folder(gInbox);

  const cwc = await open_compose_new_mail();
  checkCompIdentity(cwc, account.defaultIdentity.key, identity1Email);

  await chooseIdentity(cwc, identityKey2);
  checkCompIdentity(cwc, identityKey2, identity2From, identity2From);

  await chooseIdentity(cwc, identityKey4);
  checkCompIdentity(
    cwc,
    identityKey4,
    "[nsIMsgIdentity: " + identityKey4 + "]"
  );

  await chooseIdentity(cwc, identityKey3);
  const identity3From = identity3Name + " <" + identity3Email + ">";
  checkCompIdentity(
    cwc,
    identityKey3,
    identity3From + " (" + identity3Label + ")",
    identity3From
  );

  // Bug 1152045, check that the email address from the selected identity
  // is properly used for the From field in the created message.
  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await be_in_folder(gDrafts);
  const curMessage = await select_click_row(0);
  Assert.equal(curMessage.author, identity3From);
  // Remove the saved draft.
  await press_delete(window);
});

registerCleanupFunction(function () {
  account.removeIdentity(MailServices.accounts.getIdentity(identityKey1));
  account.removeIdentity(MailServices.accounts.getIdentity(identityKey2));
  account.removeIdentity(MailServices.accounts.getIdentity(identityKey3));

  // The last identity of an account can't be removed so clear all its prefs
  // which effectively destroys it.
  MailServices.accounts.getIdentity(identityKey4).clearAllValues();
  MailServices.accounts.removeAccount(account);
});
