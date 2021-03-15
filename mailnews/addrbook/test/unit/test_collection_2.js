/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for the Address Collector Service part 2.
 *
 * This test checks that we don't collect addresses when they already exist
 * in other address books.
 */

var nsIAbPMF = Ci.nsIAbPreferMailFormat;

function run_test() {
  // Test - Get the address collecter

  // Get the actual collecter
  var addressCollect = Cc[
    "@mozilla.org/addressbook/services/addressCollector;1"
  ].getService(Ci.nsIAbAddressCollector);

  // Set the new pref afterwards to ensure we change correctly
  Services.prefs.setCharPref("mail.collect_addressbook", kCABData.URI);

  loadABFile("data/collect", kPABData.fileName);

  // XXX Getting all directories ensures we create all ABs because the
  // address collecter can't currently create ABs itself (bug 314448).
  MailServices.ab.directories;

  addressCollect.collectAddress(
    "Other Book <other@book.invalid>",
    true,
    nsIAbPMF.unknown
  );

  let PAB = MailServices.ab.getDirectory(kPABData.URI);

  var cards = PAB.childCards;

  Assert.equal(cards.length, 1);

  Assert.equal(cards[0].displayName, "Other Book");
  Assert.equal(cards[0].primaryEmail, "other@book.invalid");

  // Check the CAB has no cards.
  let CAB = MailServices.ab.getDirectory(kCABData.URI);
  Assert.equal(CAB.childCards.length, 0);
}
