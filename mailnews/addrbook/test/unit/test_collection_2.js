/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { collectSingleAddress } = ChromeUtils.importESModule(
  "resource:///modules/AddressCollector.sys.mjs"
);

/*
 * Test suite for the Address Collector Service part 2.
 *
 * This test checks that we don't collect addresses when they already exist
 * in other address books.
 */
function run_test() {
  // Test - Get the address collector
  loadABFile("data/collect", kPABData.fileName);

  // Set the new pref afterwards to ensure we change correctly
  Services.prefs.setCharPref("mail.collect_addressbook", kCABData.URI);

  collectSingleAddress("other@book.invalid", "Other Book", true);

  const PAB = MailServices.ab.getDirectory(kPABData.URI);

  var cards = PAB.childCards;

  Assert.equal(cards.length, 1);

  Assert.equal(cards[0].displayName, "Other Book");
  Assert.equal(cards[0].primaryEmail, "other@book.invalid");

  // Check the CAB has no cards.
  const CAB = MailServices.ab.getDirectory(kCABData.URI);
  Assert.equal(CAB.childCards.length, 0);
}
