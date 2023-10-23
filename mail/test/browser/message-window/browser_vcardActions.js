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

async function openMessageFromFile(file) {
  let fileURL = Services.io
    .newFileURI(file)
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  let winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  let win = await winPromise;
  await BrowserTestUtils.waitForEvent(win, "MsgLoaded");
  if (win.content.document.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(win.content, "load", true);
  }
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  return win;
}

/**
 * Bug 1374779
 * Check if clicking attached vCard image opens the Address Book and adds a contact.
 */
add_task(async function test_check_vcard_icon() {
  // Force full screen to avoid UI issues before the AB gets fully responsive.
  window.fullScreen = true;

  let newcards = get_cards_in_all_address_books_for_email(
    "meister@example.com"
  );
  Assert.equal(newcards.length, 0, "card does not exist at the start");

  let tabPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");

  let file = new FileUtils.File(getTestFilePath("data/test-vcard-icon.eml"));
  let messageWindow = await openMessageFromFile(file);

  // Click icon on the vcard block.
  let vcard = messageWindow.content.document.querySelector(".moz-vcard-badge");
  EventUtils.synthesizeMouseAtCenter(vcard, {}, vcard.ownerGlobal);
  await tabPromise;
  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == window,
    "the main window was focused"
  );

  let tabmail = document.getElementById("tabmail");
  Assert.equal(
    tabmail.currentTabInfo.mode.name,
    "addressBookTab",
    "the Address Book tab opened"
  );

  let abWindow = tabmail.currentTabInfo.browser.contentWindow;
  let saveEditButton = await TestUtils.waitForCondition(
    () => abWindow.document.getElementById("saveEditButton"),
    "Address Book page properly loaded"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.is_visible(saveEditButton),
    "entered edit mode"
  );
  saveEditButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);

  // Check new card was created from the vcard.
  newcards = get_cards_in_all_address_books_for_email("meister@example.com");
  Assert.equal(newcards.length, 1, "exactly one card created");
  Assert.equal(newcards[0].displayName, "Meister", "display name saved");
  Assert.ok(
    newcards[0].photoURL.startsWith(
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/"
    ),
    "PHOTO correctly saved"
  );

  tabmail.closeTab(tabmail.currentTabInfo);
  // Reset the window size.
  window.fullScreen = false;
  await BrowserTestUtils.closeWindow(messageWindow);
});
