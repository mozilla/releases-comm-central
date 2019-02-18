/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for attached vcards.
 */

// make SOLO_TEST=message-window/test-vcard-actions.js mozmill-one

"use strict";

var MODULE_NAME = "test-vcard-actions";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers",
                       "address-book-helpers"];

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

/**
 * Bug 1374779
 * Check if clicking attached vcard image opens new card dialog and adds a contact.
 */
function test_check_vcard_icon() {
  let file = os.getFileForPath(os.abspath("./test-vcard-icon.eml", os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  let newcards = get_cards_in_all_address_books_for_email("meister@example.com");
  assert_equals(newcards.length, 0);

  function subtest_check_card(cardc) {
    // Check new card is properly prefilled.
    let emailField = cardc.e("PrimaryEmail");
    assert_equals(emailField.value, "meister@example.com");
    cardc.window.document.documentElement.acceptDialog();
  }

  // Click icon on the vcard block.
  let vcard = msgc.e("messagepane").contentDocument.querySelector(".moz-vcard-badge");
  // Check new card dialog opens.
  plan_for_modal_dialog("mailnews:newcarddialog", subtest_check_card);
  msgc.click(new elementslib.Elem(vcard));
  wait_for_modal_dialog("mailnews:newcarddialog");

  // Check new card was created from the vcard.
  newcards = get_cards_in_all_address_books_for_email("meister@example.com");
  assert_equals(newcards.length, 1);

  close_window(msgc);
}
