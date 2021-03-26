/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for attached vcards.
 */

"use strict";

var { get_cards_in_all_address_books_for_email } = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  close_window,
  plan_for_modal_dialog,
  wait_for_modal_dialog,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

/**
 * Bug 1374779
 * Check if clicking attached vcard image opens new card dialog and adds a contact.
 */
add_task(async function test_check_vcard_icon() {
  let file = new FileUtils.File(getTestFilePath("data/test-vcard-icon.eml"));
  let msgc = await open_message_from_file(file);

  let newcards = get_cards_in_all_address_books_for_email(
    "meister@example.com"
  );
  Assert.equal(newcards.length, 0);

  function subtest_check_card(cardc) {
    // Check new card is properly prefilled.
    let emailField = cardc.e("PrimaryEmail");
    Assert.equal(emailField.value, "meister@example.com");
    cardc.window.document.documentElement
      .querySelector("dialog")
      .acceptDialog();
  }

  // Click icon on the vcard block.
  let vcard = msgc
    .e("messagepane")
    .contentDocument.querySelector(".moz-vcard-badge");
  // Check new card dialog opens.
  plan_for_modal_dialog("mailnews:newcarddialog", subtest_check_card);
  msgc.click(vcard);
  wait_for_modal_dialog("mailnews:newcarddialog");

  // Check new card was created from the vcard.
  newcards = get_cards_in_all_address_books_for_email("meister@example.com");
  Assert.equal(newcards.length, 1);

  close_window(msgc);
});
