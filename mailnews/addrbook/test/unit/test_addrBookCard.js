/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for basic nsIAbCard functions.
 */

const { AddrBookCard } = ChromeUtils.import(
  "resource:///modules/AddrBookCard.jsm"
);
const { VCardPropertyEntry } = ChromeUtils.import(
  "resource:///modules/VCardUtils.jsm"
);

// Intersperse these with UTF-8 values to check we handle them correctly.
var kFNValue = "testFirst\u00D0";
var kLNValue = "testLast";
var kDNValue = "testDisplay\u00D1";
var kEmailValue = "testEmail\u00D2@foo.invalid";
var kEmailValueLC = "testemail\u00D2@foo.invalid";
var kEmailValue2 = "test@test.foo.invalid";
// Email without the @ or anything after it.
var kEmailReducedValue = "testEmail\u00D2";

add_task(function testAddrBookCard() {
  const card = new AddrBookCard();

  // Test - Set First, Last and Display Names and Email Address
  // via setProperty, and check correctly saved via their
  // attributes. We're using firstName to check UTF-8 values.
  card.vCardProperties.addValue("n", [kLNValue, kFNValue, "", "", ""]);
  card.vCardProperties.addValue("fn", kDNValue);
  card.vCardProperties.addValue("email", kEmailValue);

  Assert.equal(card.firstName, kFNValue);
  Assert.equal(card.lastName, kLNValue);
  Assert.equal(card.displayName, kDNValue);
  Assert.equal(card.primaryEmail, kEmailValue);

  // Repeat in the opposite order.
  card.firstName = kFNValue;
  card.lastName = kLNValue;
  card.displayName = kDNValue;
  card.primaryEmail = kEmailValue;

  Assert.deepEqual(card.vCardProperties.getFirstValue("n"), [
    kLNValue,
    kFNValue,
    "",
    "",
    "",
  ]);
  Assert.equal(card.vCardProperties.getFirstValue("fn"), kDNValue);
  Assert.equal(card.vCardProperties.getFirstValue("email"), kEmailValue);

  // Test - generateName. Note: if the addressBook.properties
  // value changes, this will affect these tests.

  const {
    GENERATE_DISPLAY_NAME,
    GENERATE_LAST_FIRST_ORDER,
    GENERATE_FIRST_LAST_ORDER,
  } = Ci.nsIAbCard;

  Assert.equal(card.generateName(GENERATE_DISPLAY_NAME), kDNValue);
  Assert.equal(
    card.generateName(GENERATE_LAST_FIRST_ORDER),
    kLNValue + ", " + kFNValue
  );
  Assert.equal(
    card.generateName(GENERATE_FIRST_LAST_ORDER),
    kFNValue + " " + kLNValue
  );

  // Test - generateName, with missing items.

  card.displayName = "";
  Assert.equal(
    card.generateName(GENERATE_DISPLAY_NAME),
    kFNValue + " " + kLNValue
  );

  card.firstName = "";
  Assert.equal(card.generateName(GENERATE_LAST_FIRST_ORDER), kLNValue);
  Assert.equal(card.generateName(GENERATE_FIRST_LAST_ORDER), kLNValue);

  card.firstName = kFNValue;
  card.lastName = "";
  Assert.equal(card.generateName(GENERATE_LAST_FIRST_ORDER), kFNValue);
  Assert.equal(card.generateName(GENERATE_FIRST_LAST_ORDER), kFNValue);

  card.firstName = "";
  Assert.equal(
    card.generateName(GENERATE_LAST_FIRST_ORDER),
    kEmailReducedValue
  );
  Assert.equal(
    card.generateName(GENERATE_FIRST_LAST_ORDER),
    kEmailReducedValue
  );

  card.vCardProperties.clearValues("email");
  Assert.equal(card.generateName(GENERATE_LAST_FIRST_ORDER), "");
  Assert.equal(card.generateName(GENERATE_FIRST_LAST_ORDER), "");

  // Test - generateNameWithBundle, most of this will have
  // been tested above.

  card.firstName = kFNValue;
  card.lastName = kLNValue;

  const bundle = Services.strings.createBundle(
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

  // Test - emailAddresses

  Assert.deepEqual(card.emailAddresses, []);

  card.primaryEmail = kEmailValue;
  Assert.deepEqual(card.emailAddresses, [kEmailValue]);

  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", {}, "text", kEmailValue2)
  );
  Assert.deepEqual(card.emailAddresses, [kEmailValue, kEmailValue2]);

  card.primaryEmail = "";
  Assert.deepEqual(card.emailAddresses, [kEmailValue2]);

  card.primaryEmail = "";
  Assert.deepEqual(card.emailAddresses, []);

  // Test - primaryEmail

  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", {}, "text", "three@invalid")
  );
  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", { pref: 2 }, "text", "two@invalid")
  );
  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", {}, "text", "four@invalid")
  );
  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", { pref: 1 }, "text", "one@invalid")
  );
  Assert.deepEqual(card.emailAddresses, [
    "one@invalid",
    "two@invalid",
    "three@invalid",
    "four@invalid",
  ]);
  Assert.equal(card.primaryEmail, "one@invalid");

  // Setting primaryEmail to the existing value changes nothing.
  card.primaryEmail = "one@invalid";
  Assert.deepEqual(card.emailAddresses, [
    "one@invalid",
    "two@invalid",
    "three@invalid",
    "four@invalid",
  ]);
  Assert.equal(card.primaryEmail, "one@invalid");
  Assert.deepEqual(
    card.vCardProperties.getAllEntriesSorted("email").map(e => e.params.pref),
    ["1", "2", undefined, undefined]
  );

  // Setting primaryEmail to another existing address replaces the address with the new one.
  card.primaryEmail = "four@invalid";
  Assert.deepEqual(card.emailAddresses, [
    "four@invalid",
    "two@invalid",
    "three@invalid",
  ]);
  Assert.equal(card.primaryEmail, "four@invalid");
  Assert.deepEqual(
    card.vCardProperties.getAllEntriesSorted("email").map(e => e.params.pref),
    ["1", "2", undefined]
  );

  // Setting primaryEmail to null promotes the next address.
  card.primaryEmail = null;
  Assert.deepEqual(card.emailAddresses, ["two@invalid", "three@invalid"]);
  Assert.equal(card.primaryEmail, "two@invalid");
  Assert.deepEqual(
    card.vCardProperties.getAllEntriesSorted("email").map(e => e.params.pref),
    ["1", undefined]
  );

  // Setting primaryEmail to a new address replaces the address with the new one.
  card.primaryEmail = "five@invalid";
  Assert.deepEqual(card.emailAddresses, ["five@invalid", "three@invalid"]);
  Assert.equal(card.primaryEmail, "five@invalid");
  Assert.deepEqual(
    card.vCardProperties.getAllEntriesSorted("email").map(e => e.params.pref),
    ["1", undefined]
  );

  // Setting primaryEmail to an empty string promotes the next address.
  card.primaryEmail = "";
  Assert.deepEqual(card.emailAddresses, ["three@invalid"]);
  Assert.equal(card.primaryEmail, "three@invalid");
  Assert.deepEqual(
    card.vCardProperties.getAllEntriesSorted("email").map(e => e.params.pref),
    ["1"]
  );

  // Setting primaryEmail to null clears the only address.
  card.primaryEmail = null;
  Assert.deepEqual(card.emailAddresses, []);
  Assert.equal(card.primaryEmail, "");

  // Test - hasEmailAddress

  Assert.equal(card.hasEmailAddress(kEmailValue), false);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), false);
  Assert.equal(card.hasEmailAddress(kEmailValue2), false);

  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", {}, "text", kEmailValue)
  );

  Assert.equal(card.hasEmailAddress(kEmailValue), true);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), true);
  Assert.equal(card.hasEmailAddress(kEmailValue2), false);

  card.vCardProperties.addEntry(
    new VCardPropertyEntry("email", {}, "text", kEmailValue2)
  );

  Assert.equal(card.hasEmailAddress(kEmailValue), true);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), true);
  Assert.equal(card.hasEmailAddress(kEmailValue2), true);

  card.vCardProperties.removeEntry(
    card.vCardProperties.getAllEntries("email")[0]
  );

  Assert.equal(card.hasEmailAddress(kEmailValue), false);
  Assert.equal(card.hasEmailAddress(kEmailValueLC), false);
  Assert.equal(card.hasEmailAddress(kEmailValue2), true);
});
