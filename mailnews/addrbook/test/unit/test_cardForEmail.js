/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests nsIAbDirectory::cardForEmailAddress
 * - checks correct return when no email address supplied
 * - checks correct return when no matching email address supplied
 * - checks correct return when matching email address supplied.
 *
 * Uses: cardForEmail.mab
 */

function check_correct_card(card) {
  Assert.notEqual(card, null);

  Assert.equal(card.firstName, "FirstName1");
  Assert.equal(card.lastName, "LastName1");
  Assert.equal(card.displayName, "DisplayName1");
  Assert.equal(card.primaryEmail, "PrimaryEmail1@test.invalid");
  Assert.equal(
    card.getProperty("SecondEmail", "BAD"),
    "SecondEmail1\u00D0@test.invalid"
  );
}

function run_test() {
  loadABFile("data/cardForEmail", kPABData.fileName);

  // Test - Get the directory
  let AB = MailServices.ab.getDirectory(kPABData.URI);

  // Test - Check that a null string succeeds and does not
  // return a card (bug 404264)
  Assert.ok(AB.cardForEmailAddress(null) == null);

  // Test - Check that an empty string succeeds and does not
  // return a card (bug 404264)
  Assert.ok(AB.cardForEmailAddress("") == null);

  // Test - Check that we don't match an email that doesn't exist
  Assert.ok(AB.cardForEmailAddress("nocard@this.email.invalid") == null);

  // Test - Check that we match this email and some of the fields
  // of the card are correct.
  var card = AB.cardForEmailAddress("PrimaryEmail1@test.invalid");

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

  // Check getCardFromProperty returns null correctly for non-extant properties
  Assert.equal(AB.getCardFromProperty("JobTitle", "", false), null);
  Assert.equal(AB.getCardFromProperty("JobTitle", "JobTitle", false), null);

  // Check case-insensitive searching works
  card = AB.getCardFromProperty("JobTitle", "JobTitle1", true);
  check_correct_card(card);
  card = AB.getCardFromProperty("JobTitle", "JobTitle1", false);
  check_correct_card(card);

  Assert.equal(AB.getCardFromProperty("JobTitle", "jobtitle1", true), null);

  card = AB.getCardFromProperty("JobTitle", "jobtitle1", false);
  check_correct_card(card);

  var cards = AB.getCardsFromProperty("LastName", "DOE", true);
  Assert.equal(cards.length, 0);

  cards = AB.getCardsFromProperty("LastName", "Doe", true);
  var i = 0;
  var data = ["John", "Jane"];

  for (card of cards) {
    i++;
    Assert.equal(card.lastName, "Doe");
    var index = data.indexOf(card.firstName);
    Assert.notEqual(index, -1);
    delete data[index];
  }
  Assert.equal(i, 2);
}
