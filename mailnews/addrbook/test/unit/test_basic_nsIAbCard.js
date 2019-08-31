/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for basic nsIAbCard functions.
 */

// Intersperse these with UTF-8 values to check we handle them correctly.
var kFNValue = "testFirst\u00D0";
var kLNValue = "testLast";
var kDNValue = "testDisplay\u00D1";
var kEmailValue = "testEmail\u00D2@foo.invalid";
var kEmailValueLC = "testemail\u00D2@foo.invalid";
var kEmailValue2 = "test@test.foo.invalid";
// Email without the @ or anything after it.
var kEmailReducedValue = "testEmail\u00D2";
var kCompanyValue = "Test\u00D0 Company";

function run_test() {
  // Create a new card
  var card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );

  // Test - Set First, Last and Display Names and Email Address
  // via setProperty, and check correctly saved via their
  // attributes. We're using firstName to check UTF-8 values.
  card.setProperty("FirstName", kFNValue);
  card.setProperty("LastName", kLNValue);
  card.setProperty("DisplayName", kDNValue);
  card.setProperty("PrimaryEmail", kEmailValue);

  Assert.equal(card.firstName, kFNValue);
  Assert.equal(card.lastName, kLNValue);
  Assert.equal(card.displayName, kDNValue);
  Assert.equal(card.primaryEmail, kEmailValue);

  // Repeat in the opposite order.
  card.firstName = kFNValue;
  card.lastName = kLNValue;
  card.displayName = kDNValue;
  card.primaryEmail = kEmailValue;

  Assert.equal(card.getProperty("FirstName", "BAD"), kFNValue);
  Assert.equal(card.getProperty("LastName", "BAD"), kLNValue);
  Assert.equal(card.getProperty("DisplayName", "BAD"), kDNValue);
  Assert.equal(card.getProperty("PrimaryEmail", "BAD"), kEmailValue);

  // Test - generateName. Note: if the addressBook.properties
  // value changes, this will affect these tests.

  // Add a company name, so we can test fallback to company name.
  card.setProperty("Company", kCompanyValue);

  Assert.equal(card.generateName(0), kDNValue);
  Assert.equal(card.generateName(1), kLNValue + ", " + kFNValue);
  Assert.equal(card.generateName(2), kFNValue + " " + kLNValue);

  // Test - generateName, with missing items.

  card.displayName = "";
  Assert.equal(card.generateName(0), kCompanyValue);

  card.deleteProperty("Company");
  Assert.equal(card.generateName(0), kEmailReducedValue);

  // Reset company name for the first/last name tests.
  card.setProperty("Company", kCompanyValue);

  card.firstName = "";
  Assert.equal(card.generateName(1), kLNValue);
  Assert.equal(card.generateName(2), kLNValue);

  card.firstName = kFNValue;
  card.lastName = "";
  Assert.equal(card.generateName(1), kFNValue);
  Assert.equal(card.generateName(2), kFNValue);

  card.firstName = "";
  Assert.equal(card.generateName(1), kCompanyValue);
  Assert.equal(card.generateName(2), kCompanyValue);

  card.deleteProperty("Company");
  Assert.equal(card.generateName(1), kEmailReducedValue);
  Assert.equal(card.generateName(2), kEmailReducedValue);

  card.primaryEmail = "";
  Assert.equal(card.generateName(1), "");
  Assert.equal(card.generateName(2), "");

  // Test - generateNameWithBundle, most of this will have
  // been tested above.

  card.firstName = kFNValue;
  card.lastName = kLNValue;

  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/addressbook/addressBook.properties"
  );

  Assert.equal(card.generateName(1, bundle), kLNValue + ", " + kFNValue);

  // Test - generatePhoneticName

  card.setProperty("PhoneticFirstName", kFNValue);
  card.setProperty("PhoneticLastName", kLNValue);
  Assert.equal(card.generatePhoneticName(false), kFNValue + kLNValue);
  Assert.equal(card.generatePhoneticName(true), kLNValue + kFNValue);

  card.setProperty("PhoneticLastName", "");
  Assert.equal(card.generatePhoneticName(false), kFNValue);
  Assert.equal(card.generatePhoneticName(true), kFNValue);

  card.setProperty("PhoneticFirstName", "");
  card.setProperty("PhoneticLastName", kLNValue);
  Assert.equal(card.generatePhoneticName(false), kLNValue);
  Assert.equal(card.generatePhoneticName(true), kLNValue);

  // Test - hasEmailAddress

  card.deleteProperty("PrimaryEmail");
  card.deleteProperty("SecondEmail");

  Assert.equal(card.hasEmailAddress(kEmailValue), false);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), false);
  Assert.equal(card.hasEmailAddress(kEmailValue2), false);

  card.setProperty("PrimaryEmail", kEmailValue);

  Assert.equal(card.hasEmailAddress(kEmailValue), true);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), true);
  Assert.equal(card.hasEmailAddress(kEmailValue2), false);

  card.setProperty("SecondEmail", kEmailValue2);

  Assert.equal(card.hasEmailAddress(kEmailValue), true);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), true);
  Assert.equal(card.hasEmailAddress(kEmailValue2), true);

  card.deleteProperty("PrimaryEmail");

  Assert.equal(card.hasEmailAddress(kEmailValue), false);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), false);
  Assert.equal(card.hasEmailAddress(kEmailValue2), true);
}
