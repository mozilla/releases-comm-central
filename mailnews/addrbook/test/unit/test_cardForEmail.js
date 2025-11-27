/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests nsIAbDirectory::cardForEmailAddress
 * - checks correct return when no email address supplied
 * - checks correct return when no matching email address supplied
 * - checks correct return when matching email address supplied.
 *
 * Uses: cardForEmail.mab
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function bumpDisplayNameVersion() {
  // Invalidate the AddrBookManager email->card cache.
  MailServices.ab.clearCache();
}

function check_correct_card(card) {
  Assert.ok(!!card);

  Assert.equal(card.firstName, "FirstName1");
  Assert.equal(card.lastName, "LastName1");
  Assert.equal(card.displayName, "DisplayName1");
  Assert.deepEqual(card.emailAddresses, [
    "PrimaryEmail1@test.invalid",
    "SecondEmail1\u00D0@test.invalid",
  ]);
}

function run_test() {
  loadABFile("data/cardForEmail", kPABData.fileName);

  // Test - Get the directory
  const AB = MailServices.ab.getDirectory(kPABData.URI);

  // Test - Check that a null string succeeds and does not
  // return a card (bug 404264)
  Assert.equal(AB.cardForEmailAddress(null), null);

  // Test - Check that an empty string succeeds and does not
  // return a card (bug 404264)
  Assert.equal(AB.cardForEmailAddress(""), null);

  // Test - Check that we don't match an email that doesn't exist
  Assert.equal(AB.cardForEmailAddress("nocard@this.email.invalid"), null);

  // Test - Check that we match this email and some of the fields
  // of the card are correct.
  let card = AB.cardForEmailAddress("PrimaryEmail1@test.invalid");

  check_correct_card(card);

  // Test - Check that we match with the primary email with insensitive case.
  card = AB.cardForEmailAddress("pRimaryemAIL1@teST.invalid");

  check_correct_card(card);

  // Test - Check that we match with the second email.
  card = AB.cardForEmailAddress("SecondEmail1\u00D0@test.invalid");

  check_correct_card(card);

  // Test - Check that we match with the second email with insensitive case.
  card = AB.cardForEmailAddress("SECondEMail1\u00D0@TEST.inValid");

  check_correct_card(card);

  // Check that we match cards that have more than two email addresses.
  card = AB.cardForEmailAddress("first@SOMETHING.invalid");
  Assert.equal(card.UID, "f68fbac4-158b-4bdc-95c6-592a5f93cfa1");
  Assert.equal(card.displayName, "A vCard!");

  card = AB.cardForEmailAddress("second@something.INVALID");
  Assert.equal(card.UID, "f68fbac4-158b-4bdc-95c6-592a5f93cfa1");
  Assert.equal(card.displayName, "A vCard!");

  card = AB.cardForEmailAddress("THIRD@something.invalid");
  Assert.equal(card.UID, "f68fbac4-158b-4bdc-95c6-592a5f93cfa1");
  Assert.equal(card.displayName, "A vCard!");

  card = AB.cardForEmailAddress("FOURTH@SOMETHING.INVALID");
  Assert.equal(card.UID, "f68fbac4-158b-4bdc-95c6-592a5f93cfa1");
  Assert.equal(card.displayName, "A vCard!");

  card = AB.cardForEmailAddress("A vCard!");
  Assert.equal(card, null);

  // Check getCardFromProperty returns null correctly for non-extant properties
  Assert.equal(AB.getCardFromProperty("NickName", "", false), null);
  Assert.equal(AB.getCardFromProperty("NickName", "NickName", false), null);

  // Check case-insensitive searching works
  card = AB.getCardFromProperty("NickName", "NickName1", true);
  check_correct_card(card);
  card = AB.getCardFromProperty("NickName", "NickName1", false);
  check_correct_card(card);

  Assert.equal(AB.getCardFromProperty("NickName", "nickName1", true), null);

  card = AB.getCardFromProperty("NickName", "nickName1", false);
  check_correct_card(card);

  let cards = AB.getCardsFromProperty("LastName", "DOE", true);
  Assert.equal(cards.length, 0);

  cards = AB.getCardsFromProperty("LastName", "Doe", true);
  let i = 0;
  const data = ["John", "Jane"];

  for (card of cards) {
    i++;
    Assert.equal(card.lastName, "Doe");
    const index = data.indexOf(card.firstName);
    Assert.notEqual(index, -1);
    delete data[index];
  }
  Assert.equal(i, 2);

  // Test cardForEmailAddress on the address book manager.

  // Build the manager's cache with one case, then look up with another.
  let mgrCard = MailServices.ab.cardForEmailAddress(
    "PRIMARYEMAIL1@TEST.INVALID"
  );
  check_correct_card(mgrCard);

  mgrCard = MailServices.ab.cardForEmailAddress("primaryemail1@test.invalid");
  check_correct_card(mgrCard);

  // Clear cache; verify trimming on lookup (leading/trailing spaces).
  bumpDisplayNameVersion();
  mgrCard = MailServices.ab.cardForEmailAddress(
    "   PrimaryEmail1@test.invalid   "
  );
  check_correct_card(mgrCard);

  // Clear cache again; check second email with mixed case + U+00D0 (ETH) in local-part.
  bumpDisplayNameVersion();
  mgrCard = MailServices.ab.cardForEmailAddress(
    "SECondEMail1\u00D0@TEST.inValid"
  );
  check_correct_card(mgrCard);

  // Build the manager's cache for the *old* email.
  const oldEmail = "PrimaryEmail1@test.invalid";
  const oldCard = MailServices.ab.cardForEmailAddress(oldEmail);
  check_correct_card(oldCard);

  // Test that the manager's cache is cleared and rebuilt when a card changes.

  // Change that card's PrimaryEmail and fetch the same card via NickName1.
  const editable = AB.getCardFromProperty("NickName", "NickName1", false);
  Assert.ok(editable);
  const newEmail = "PrimaryEmail1Changed@test.invalid";
  const cardProperties = editable.vCardProperties;
  const existingEmails = cardProperties.getAllValuesSorted("email");
  const secondEmail = existingEmails[1];
  const originalVCard = editable.vCardProperties.toVCard();

  cardProperties.clearValues("email");
  cardProperties.addValue("email", newEmail);
  if (secondEmail) {
    cardProperties.addValue("email", secondEmail);
  }

  // Write the updated vCard back to the card and save.
  editable.setProperty("_vCard", cardProperties.toVCard());
  AB.modifyCard(editable);

  // After modifyCard(), the manager cache has been invalidated.
  // The *new* email should resolve now, and the *old* email should not.
  const updated = MailServices.ab.cardForEmailAddress(newEmail);
  Assert.ok(updated, "After invalidation, new email should resolve");
  Assert.equal(
    updated.UID,
    editable.UID,
    "Resolved card should be the edited one"
  );
  Assert.equal(
    MailServices.ab.cardForEmailAddress(oldEmail),
    null,
    "Old email should no longer resolve after cache rebuild"
  );

  // Restore original vCard for future tests after this point
  editable.setProperty("_vCard", originalVCard);
  AB.modifyCard(editable); // bumps cache version again
}
