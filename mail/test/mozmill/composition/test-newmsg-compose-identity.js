/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that compose new message chooses the correct initial identity when
 * called from the context of an open composer.
 */

var MODULE_NAME = "test-newmsg-compose-identity";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers",
                       "window-helpers", "compose-helpers"];

Components.utils.import("resource:///modules/mailServices.js");

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

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  // Now set up an account with some identities.
  let acctMgr = MailServices.accounts;
  account = acctMgr.createAccount();
  account.incomingServer = acctMgr.createIncomingServer(
    "nobody", "New Msg Compose Identity Testing", "pop3");

  let identity1 = acctMgr.createIdentity();
  identity1.email = identity1Email;
  account.addIdentity(identity1);
  identityKey1 = identity1.key;

  let identity2 = acctMgr.createIdentity();
  identity2.email = identity2Email;
  identity2.fullName = identity2Name;
  account.addIdentity(identity2);
  identityKey2 = identity2.key;

  let identity3 = acctMgr.createIdentity();
  identity3.email = identity3Email;
  identity3.fullName = identity3Name;
  identity3.label = identity3Label;
  account.addIdentity(identity3);
  identityKey3 = identity3.key;

  // Identity with no data.
  let identity4 = acctMgr.createIdentity();
  account.addIdentity(identity4);
  identityKey4 = identity4.key;

  gInbox = account.incomingServer.rootFolder
                  .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
}

/**
 * Helper to check that a suitable From identity was set up in the given
 * composer window.
 *
 * @param cwc             Compose window controller.
 * @param aIdentityKey    The key of the expected identity.
 * @param aIdentityAlias  The displayed label of the expected identity.
 * @param aIdentityValue  The value of the expected identity
 *                        (the sender address to be sent out).
 */
function checkCompIdentity(cwc, aIdentityKey, aIdentityAlias, aIdentityValue) {
  let identityList = cwc.e("msgIdentity");

  assert_equals(cwc.window.getCurrentIdentityKey(), aIdentityKey,
                "The From identity is not correctly selected");

  if (aIdentityAlias) {
    assert_equals(identityList.label, aIdentityAlias,
                  "The From address does not have the correct label");
  }

  if (aIdentityValue) {
    assert_equals(identityList.value, aIdentityValue,
                  "The From address does not have the correct value");
  }
}

/**
 * Test that starting a new message from an open compose window gets the
 * expected initial identity.
 */
function test_compose_from_composer() {
  be_in_folder(gInbox);

  let mainCompWin = open_compose_new_mail();
  checkCompIdentity(mainCompWin, account.defaultIdentity.key);

  // Compose a new message from the compose window.
  plan_for_new_window("msgcompose");
  mainCompWin.keypress(null, "n", {shiftKey: false, accelKey: true});
  let newCompWin = wait_for_compose_window();
  checkCompIdentity(newCompWin, account.defaultIdentity.key);
  close_compose_window(newCompWin);

  // Switch to identity2 in the main compose window, new compose windows
  // starting from here should use the same identity as its "parent".
  let identityList = mainCompWin.e("msgIdentity");
  identityList.selectedIndex++;
  mainCompWin.click_menus_in_sequence(mainCompWin.e("msgIdentityPopup"),
                                      [ { identitykey: identityKey2 } ]);
  checkCompIdentity(mainCompWin, identityKey2);

  // Compose a second new message from the compose window.
  plan_for_new_window("msgcompose");
  mainCompWin.keypress(null, "n", {shiftKey: false, accelKey: true});
  let newCompWin2 = wait_for_compose_window();
  checkCompIdentity(newCompWin2, identityKey2);

  close_compose_window(newCompWin2);

  close_compose_window(mainCompWin);
}

/**
 * Bug 87987
 * Test editing the identity email/name for the current composition.
 */
function test_editing_identity() {
  Services.prefs.setBoolPref("mail.compose.warned_about_customize_from", true);
  be_in_folder(gInbox);

  let compWin = open_compose_new_mail();
  checkCompIdentity(compWin, account.defaultIdentity.key, identity1Email);

  // Input custom identity data into the From field.
  let customName = "custom";
  let customEmail = "custom@edited.invalid";
  let identityCustom = customName + " <" + customEmail + ">";

  compWin.click_menus_in_sequence(compWin.e("msgIdentityPopup"),
                                  [ { command: "cmd_customizeFromAddress" } ]);

  compWin.type(compWin.e("msgIdentityPopup").value, identityCustom);

  checkCompIdentity(compWin, account.defaultIdentity.key, identityCustom, identityCustom);
  close_compose_window(compWin);

  /* Temporarily disabled due to intermittent failure, bug 1237565.
     TODO: To be reeabled in bug 1238264.
  // Save message with this changed identity.
  compWin.window.SaveAsDraft();

  // Switch to another identity to see if editable field still obeys predefined
  // identity values.
  compWin.click_menus_in_sequence(compWin.e("msgIdentityPopup"),
                                  [ { identitykey: identityKey2 } ]);
  checkCompIdentity(compWin, identityKey2, identity2From, identity2From);

  // This should not save the identity2 to the draft message.
  close_compose_window(compWin);

  be_in_folder(gDrafts);
  let curMessage = select_click_row(0);
  assert_equals(curMessage.author, identityCustom);
  // Remove the saved draft.
  press_delete(mc);
  */
  Services.prefs.setBoolPref("mail.compose.warned_about_customize_from", false);
}

/**
 * Bug 318495
 * Test how an identity displays and behaves in the compose window.
 */
function test_display_of_identities() {
  be_in_folder(gInbox);

  let cwc = open_compose_new_mail();
  checkCompIdentity(cwc, account.defaultIdentity.key, identity1Email);

  cwc.click(cwc.eid("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"),
                              [ { identitykey: identityKey2 } ]);
  checkCompIdentity(cwc, identityKey2, identity2From, identity2From);

  cwc.click(cwc.eid("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"),
                              [ { identitykey: identityKey4 } ]);
  checkCompIdentity(cwc, identityKey4, "[nsIMsgIdentity: " + identityKey4 + "]");

  cwc.click(cwc.eid("msgIdentity"));
  cwc.click_menus_in_sequence(cwc.e("msgIdentityPopup"),
                              [ { identitykey: identityKey3 } ]);
  let identity3From = identity3Name + " <" + identity3Email + ">";
  checkCompIdentity(cwc, identityKey3,
                    identity3From + " (" + identity3Label + ")",
                    identity3From);

  // Bug 1152045, check that the email address from the selected identity
  // is properly used for the From field in the created message.
  cwc.window.SaveAsDraft();
  close_compose_window(cwc);

  be_in_folder(gDrafts);
  let curMessage = select_click_row(0);
  assert_equals(curMessage.author, identity3From);
  // Remove the saved draft.
  press_delete(mc);
}

function teardownModule(module) {
  account.removeIdentity(MailServices.accounts.getIdentity(identityKey1));
  account.removeIdentity(MailServices.accounts.getIdentity(identityKey2));
  account.removeIdentity(MailServices.accounts.getIdentity(identityKey3));

  // The last identity of an account can't be removed so clear all its prefs
  // which effectively destroys it.
  MailServices.accounts.getIdentity(identityKey4).clearAllValues();
  MailServices.accounts.removeAccount(account);
}
