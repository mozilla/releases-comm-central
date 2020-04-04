/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that we can open and close a standalone message display window from the
 *  folder pane.
 */

"use strict";

var { ensure_card_exists, ensure_no_card_exists } = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var folder;
var decoyFolder;
var localAccount;
var secondIdentity;
var myEmail = "sender@nul.invalid"; // Dictated by messagerInjector.js
var friendEmail = "carl@sagan.invalid";
var friendName = "Carl Sagan";
var headertoFieldMe;
var collectedAddresses;

add_task(function setupModule(module) {
  localAccount = MailServices.accounts.FindAccountForServer(
    MailServices.accounts.localFoldersServer
  );

  // We need to make sure we have only one identity:
  // 1) Delete all accounts except for Local Folders
  for (let account of MailServices.accounts.accounts) {
    if (account != localAccount) {
      MailServices.accounts.removeAccount(account);
    }
  }

  // 2) Delete all identities except for one
  for (let i = localAccount.identities.length - 1; i >= 0; i--) {
    let identity = localAccount.identities[i];
    if (identity.email != myEmail) {
      localAccount.removeIdentity(identity);
    }
  }

  // 3) Create a second identity and hold onto it for later
  secondIdentity = MailServices.accounts.createIdentity();
  secondIdentity.email = "nobody@nowhere.invalid";

  folder = create_folder("DisplayNamesA");
  decoyFolder = create_folder("DisplayNamesB");

  add_message_to_folder(folder, create_message({ to: [["", myEmail]] }));
  add_message_to_folder(folder, create_message({ from: ["", friendEmail] }));
  add_message_to_folder(
    folder,
    create_message({ from: [friendName, friendEmail] })
  );

  // Ensure all the directories are initialised.
  MailServices.ab.directories;
  collectedAddresses = MailServices.ab.getDirectory(
    "jsaddrbook://history.sqlite"
  );

  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  headertoFieldMe = bundle.GetStringFromName("headertoFieldMe");
});

function ensure_single_identity() {
  if (localAccount.identities.length > 1) {
    localAccount.removeIdentity(secondIdentity);
  }
  Assert.ok(
    MailServices.accounts.allIdentities.length == 1,
    "Expected 1 identity, but got " +
      MailServices.accounts.allIdentities.length +
      " identities"
  );
}

function ensure_multiple_identities() {
  if (localAccount.identities.length == 1) {
    localAccount.addIdentity(secondIdentity);
  }
  Assert.ok(
    MailServices.accounts.allIdentities.length > 1,
    "Expected multiple identities, but got only one identity"
  );
}

function help_test_display_name(message, field, expectedValue) {
  // Switch to a decoy folder first to ensure that we refresh the message we're
  // looking at in order to update information changed in address book entries.
  be_in_folder(decoyFolder);
  be_in_folder(folder);
  select_click_row(message);

  let value = mc
    .e("expanded" + field + "Box", { tagName: "mail-emailaddress" })
    .querySelector(".emaillabel").value;

  if (value != expectedValue) {
    throw new Error("got '" + value + "' but expected '" + expectedValue + "'");
  }
}

add_task(function test_single_identity() {
  ensure_no_card_exists(myEmail);
  ensure_single_identity();
  help_test_display_name(0, "to", headertoFieldMe);
});

add_task(function test_single_identity_in_abook() {
  ensure_card_exists(myEmail, "President Frankenstein", true);
  ensure_single_identity();
  help_test_display_name(0, "to", "President Frankenstein");
});

add_task(function test_single_identity_in_abook_no_pdn() {
  ensure_card_exists(myEmail, "President Frankenstein");
  ensure_single_identity();
  help_test_display_name(0, "to", headertoFieldMe);
});

add_task(function test_multiple_identities() {
  ensure_no_card_exists(myEmail);
  ensure_multiple_identities();
  help_test_display_name(0, "to", headertoFieldMe + " <" + myEmail + ">");
});

add_task(function test_multiple_identities_in_abook() {
  ensure_card_exists(myEmail, "President Frankenstein", true);
  ensure_multiple_identities();
  help_test_display_name(0, "to", "President Frankenstein");
});

add_task(function test_multiple_identities_in_abook_no_pdn() {
  ensure_card_exists(myEmail, "President Frankenstein");
  ensure_multiple_identities();
  help_test_display_name(0, "to", headertoFieldMe + " <" + myEmail + ">");
});

add_task(function test_no_header_name() {
  ensure_no_card_exists(friendEmail);
  ensure_single_identity();
  help_test_display_name(1, "from", friendEmail);
});

add_task(function test_no_header_name_in_abook() {
  ensure_card_exists(friendEmail, "My Buddy", true);
  ensure_single_identity();
  help_test_display_name(1, "from", "My Buddy");
});

add_task(function test_no_header_name_in_abook_no_pdn() {
  ensure_card_exists(friendEmail, "My Buddy");
  ensure_single_identity();
  // With address book entry but display name not preferred, we display name and
  // e-mail address or only the e-mail address if no name exists.
  help_test_display_name(1, "from", "carl@sagan.invalid");
});

add_task(function test_header_name() {
  ensure_no_card_exists(friendEmail);
  ensure_single_identity();
  help_test_display_name(2, "from", friendName + " <" + friendEmail + ">");
});

add_task(function test_header_name_in_abook() {
  ensure_card_exists(friendEmail, "My Buddy", true);
  ensure_single_identity();
  help_test_display_name(2, "from", "My Buddy");
});

add_task(function test_header_name_in_abook_no_pdn() {
  ensure_card_exists(friendEmail, "My Buddy");
  ensure_single_identity();
  // With address book entry but display name not preferred, we display name and
  // e-mail address.
  help_test_display_name(2, "from", "Carl Sagan <carl@sagan.invalid>");
});
