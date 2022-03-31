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

  // Click icon on the vcard block.
  let vcard = msgc
    .e("messagepane")
    .contentDocument.querySelector(".moz-vcard-badge");

  msgc.click(vcard);

  let tabmail = document.getElementById("tabmail");
  await TestUtils.waitForCondition(
    () =>
      Services.focus.focusedWindow == window &&
      tabmail.currentTabInfo.mode.name == "addressBookTab",
    "the Address Book tab opened"
  );

  let abWindow = tabmail.currentTabInfo.browser.contentWindow;
  let saveEditButton = await TestUtils.waitForCondition(() =>
    abWindow.document.getElementById("saveEditButton")
  );
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(saveEditButton)
  );
  // TODO check the card
  saveEditButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);

  // Check new card was created from the vcard.
  // newcards = get_cards_in_all_address_books_for_email("meister@example.com");
  // Assert.equal(newcards.length, 1);

  tabmail.closeTab(tabmail.currentTabInfo);
  close_window(msgc);
});
