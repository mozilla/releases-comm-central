/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that pills are created correctly when a user doesn't explicitly trigger
 * the pill creation with Enter or on blur, and that the proper value is used
 * when an autocomplete match is present.
 */

"use strict";

var { be_in_folder, get_special_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

let addressBook, draftsFolder;

add_setup(async function () {
  const addressBookName = MailServices.ab.newAddressBook(
    "Mochitest",
    null,
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  addressBook = MailServices.ab.getDirectoryFromId(addressBookName);

  // Add names with identically repeated initials to kick the autocomplete with
  // multiple suggestions.
  for (const name of ["Aaron", "Aalexander", "Aaarchie"]) {
    const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.firstName = name;
    card.lastName = "Mochitest";
    card.displayName = `${name} Mochitest`;
    card.primaryEmail = `${name.toLowerCase()}@example.com`;
    addressBook.addCard(card);
  }
  draftsFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  registerCleanupFunction(async () => {
    MailServices.ab.deleteAddressBook(addressBook.URI);
    draftsFolder.deleteSelf(null);
  });
});

add_task(async function test_pill_creation_edge_cases() {
  await be_in_folder(draftsFolder);
  const cwc = await open_compose_new_mail();

  // When the compose window is opened, the focus should be on the To field.
  const toInput = cwc.document.getElementById("toAddrInput");
  Assert.equal(cwc.document.activeElement, toInput);
  Assert.equal(toInput.value, "");

  // Type the first 2 letters and a space to trigger the autocomplete with the
  // double chevron format suggestion.
  EventUtils.sendString("aa ", cwc);
  await BrowserTestUtils.waitForPopupEvent(toInput.popup, "shown");
  // Wait for the autocomplete to resolve.
  Assert.ok(
    toInput.value.includes(">>"),
    "The autocomplete should show the double chevron suggestion."
  );

  Assert.equal(
    toInput.controller.matchCount,
    3,
    "The autocomplete should have 3 matches for 'aa '"
  );

  const modifiers =
    AppConstants.platform == "macosx" ? { accelKey: true } : { ctrlKey: true };
  // Trigger the save of the message.
  EventUtils.synthesizeKey("S", modifiers, cwc);
  await BrowserTestUtils.waitForEvent(cwc, "aftersave");

  // The pill should have been created even without a blur or enter event, and
  // the correct address should have been picked from the first autocomplete
  // match.
  const pills = cwc.document.querySelectorAll(
    "#toAddrContainer > .address-pill"
  );
  Assert.equal(
    pills.length,
    1,
    "The address pill should be created after saving."
  );

  Assert.equal(
    pills[0].label,
    "Aaarchie Mochitest <aaarchie@example.com>",
    "The address pill should have the correct label."
  );

  await close_compose_window(cwc);
});
