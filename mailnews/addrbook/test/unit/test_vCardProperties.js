/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* Tests of VCardProperties and VCardPropertyEntry. */

var { AddrBookCard } = ChromeUtils.import(
  "resource:///modules/AddrBookCard.jsm"
);
var { VCardProperties, VCardPropertyEntry } = ChromeUtils.import(
  "resource:///modules/VCardUtils.jsm"
);

function propertyEqual(actual, expected, message) {
  let actualAsObject = {
    name: actual.name,
    params: actual.params,
    type: actual.type,
    value: actual.value,
  };
  Assert.deepEqual(actualAsObject, expected, message);
}

function propertyArrayEqual(actual, expected, message) {
  Assert.deepEqual(
    actual.map(a => {
      return {
        name: a.name,
        params: a.params,
        type: a.type,
        value: a.value,
      };
    }),
    expected,
    message
  );
}

/**
 * Tests that AddrBookCard supports vCard.
 */
add_task(function testAddrBookCard() {
  let card = new AddrBookCard();
  Assert.equal(card.supportsVCard, true, "AddrBookCard supports vCard");
  Assert.ok(card.vCardProperties, "AddrBookCard has vCardProperties");
  Assert.equal(card.vCardProperties.constructor.name, "VCardProperties");
});

/**
 * Tests that nsAbCardProperty does not support vCard.
 */
add_task(function testABCardProperty() {
  let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  Assert.equal(
    card.supportsVCard,
    false,
    "nsAbCardProperty does not support vCard"
  );
  Assert.strictEqual(
    card.vCardProperties,
    null,
    "nsAbCardProperty has no vCardProperties"
  );
});

/**
 * Tests the `clone` and `equals` functions of VCardPropertyEntry, with a
 * simple value type.
 */
add_task(function testPropertyEntrySingleValue() {
  let entry = new VCardPropertyEntry("fn", {}, "text", "Juliet");
  let clone = entry.clone();

  Assert.ok(entry.equals(entry), "original is equal to itself");
  Assert.ok(entry.equals(clone), "original is equal to cloned object");
  Assert.ok(clone.equals(entry), "cloned object is equal to original");
  Assert.ok(clone.equals(clone), "cloned object is equal to itself");

  Assert.equal(clone.value, entry.value, "values are identical");

  let other = new VCardPropertyEntry("n", {}, "text", "Romeo");
  Assert.ok(!entry.equals(other), "original is not equal to another object");
  Assert.ok(!other.equals(entry), "another object is not equal to original");
});

/**
 * Tests the `clone` and `equals` functions of VCardPropertyEntry, with a
 * complex value type.
 */
add_task(function testPropertyEntryMultiValue() {
  // A name entry for somebody named "Mr One Two Three Four Senior".
  let entry = new VCardPropertyEntry("n", {}, "text", [
    "Four",
    "One",
    ["Two", "Three"],
    "Mr",
    "Senior",
  ]);
  let clone = entry.clone();

  Assert.ok(entry.equals(entry), "original is equal to itself");
  Assert.ok(entry.equals(clone), "original is equal to cloned object");
  Assert.ok(clone.equals(entry), "cloned object is equal to original");
  Assert.ok(clone.equals(clone), "cloned object is equal to itself");

  Assert.deepEqual(clone.value, entry.value, "values are identical");

  Assert.notEqual(
    clone.value,
    entry.value,
    "value arrays are separate objects"
  );
  Assert.notEqual(
    clone.value[2],
    entry.value[2],
    "subvalue arrays are separate objects"
  );

  // A name entry for somebody named "Mr One Two Three Four Junior".
  let other = new VCardPropertyEntry("n", {}, "text", [
    "Four",
    "One",
    ["Two", "Three"],
    "Mr",
    "Junior",
  ]);
  Assert.ok(!entry.equals(other), "original is not equal to another object");
  Assert.ok(!other.equals(entry), "another object is not equal to original");
});

/**
 * Tests creating a VCardProperties from a vCard string,
 * then recreating the vCard.
 */
add_task(function testFromToVCard() {
  let inVCard = formatVCard`
    BEGIN:VCARD
    VERSION:3.0
    FN:Mike Test
    N:Test;Mike;;;
    EMAIL;PREF=1:mike@test.invalid
    END:VCARD`;
  let properties = VCardProperties.fromVCard(inVCard);

  Assert.equal(properties.entries.length, 4, "entry count");
  propertyEqual(
    properties.getFirstEntry("version"),
    {
      name: "version",
      params: {},
      type: "text",
      value: "3.0",
    },
    "version entry"
  );
  propertyEqual(
    properties.getFirstEntry("fn"),
    {
      name: "fn",
      params: {},
      type: "text",
      value: "Mike Test",
    },
    "fn entry"
  );
  propertyEqual(
    properties.getFirstEntry("n"),
    {
      name: "n",
      params: {},
      type: "text",
      value: ["Test", "Mike", "", "", ""],
    },
    "n entry"
  );
  propertyEqual(
    properties.getFirstEntry("email"),
    {
      name: "email",
      params: { pref: 1 },
      type: "text",
      value: "mike@test.invalid",
    },
    "email entry"
  );

  let outVCard = properties.toVCard();
  Assert.equal(outVCard, inVCard, "vCard reproduction");
});

/**
 * Tests creating a VCardProperties from a Map of old-style address book
 * properties, then recreating the Map.
 */
add_task(function testFromToPropertyMap() {
  let inProperties = [
    ["DisplayName", "Mike Test"],
    ["LastName", "Test"],
    ["FirstName", "Mike"],
    ["PrimaryEmail", "mike@test.invalid"],
  ];
  let properties = VCardProperties.fromPropertyMap(
    new Map(inProperties),
    "3.0"
  );

  Assert.equal(properties.entries.length, 4, "entry count");
  propertyEqual(
    properties.getFirstEntry("version"),
    {
      name: "version",
      params: {},
      type: "text",
      value: "3.0",
    },
    "version entry"
  );
  propertyEqual(
    properties.getFirstEntry("fn"),
    {
      name: "fn",
      params: {},
      type: "text",
      value: "Mike Test",
    },
    "fn entry"
  );
  propertyEqual(
    properties.getFirstEntry("n"),
    {
      name: "n",
      params: {},
      type: "text",
      value: ["Test", "Mike", "", "", ""],
    },
    "n entry"
  );
  propertyEqual(
    properties.getFirstEntry("email"),
    {
      name: "email",
      params: { pref: 1 },
      type: "text",
      value: "mike@test.invalid",
    },
    "email entry"
  );

  let outProperties = properties.toPropertyMap();
  Assert.equal(outProperties.size, 4, "property count");
  for (let [key, value] of inProperties) {
    Assert.equal(outProperties.get(key), value, `${key} property`);
  }
});

/**
 * Tests adding to and removing from VCardProperties using VCardPropertyEntry.
 */
add_task(function testEntryMethods() {
  // Sanity check.

  let props = new VCardProperties();
  Assert.deepEqual(props.entries, [], "props has no entries");

  // Add property entries.

  // Real VCardPropertyEntry objects.
  let charlie = new VCardPropertyEntry(
    "email",
    { type: "home" },
    "text",
    "charlie@invalid"
  );
  let delta = new VCardPropertyEntry(
    "email",
    { type: "work" },
    "text",
    "delta@invalid"
  );

  // Ordinary objects for Assert.deepEqual comparison. Use these objects to be
  // sure of the values being tested.
  let data = {
    charlie: {
      name: "email",
      params: { type: "home" },
      type: "text",
      value: "charlie@invalid",
    },
    delta: {
      name: "email",
      params: { type: "work" },
      type: "text",
      value: "delta@invalid",
    },
    juliet: {
      name: "email",
      params: { type: "home" },
      type: "text",
      value: "juliet@invalid",
    },
  };

  props.addEntry(charlie);
  propertyArrayEqual(
    props.getAllEntries("email"),
    [data.charlie],
    "props.email has one entry"
  );
  Assert.deepEqual(
    props.getAllValues("email"),
    ["charlie@invalid"],
    "props.email has one value"
  );
  Assert.equal(
    props.getFirstValue("email"),
    "charlie@invalid",
    "props.email has a first value"
  );
  propertyArrayEqual(props.entries, [data.charlie], "props has one entry");

  props.addEntry(delta);
  propertyArrayEqual(
    props.getAllEntries("email"),
    [data.charlie, data.delta],
    "props.email has two entries"
  );
  Assert.deepEqual(
    props.getAllValues("email"),
    ["charlie@invalid", "delta@invalid"],
    "props.email has two values"
  );
  Assert.equal(
    props.getFirstValue("email"),
    "charlie@invalid",
    "props.email has a first value"
  );
  propertyArrayEqual(
    props.entries,
    [data.charlie, data.delta],
    "props has two entries"
  );

  // Update a property entry.

  charlie.value = "juliet@invalid";
  propertyArrayEqual(
    props.getAllEntries("email"),
    [data.juliet, data.delta],
    "props.email has two entries"
  );
  Assert.deepEqual(
    props.getAllValues("email"),
    ["juliet@invalid", "delta@invalid"],
    "props.email has two values"
  );
  Assert.equal(
    props.getFirstValue("email"),
    "juliet@invalid",
    "props.email has a first value"
  );
  propertyArrayEqual(
    props.entries,
    [data.juliet, data.delta],
    "props has two entries"
  );

  // Clone a property entry.

  let juliet = charlie.clone();
  Assert.notEqual(
    juliet,
    charlie,
    "cloned VCardPropertyEntry is not the same object"
  );
  propertyEqual(
    juliet,
    data.juliet,
    "cloned VCardPropertyEntry has the same properties"
  );

  // Delete a property entry.

  Assert.ok(props.removeEntry(delta));
  propertyArrayEqual(
    props.getAllEntries("email"),
    [data.juliet],
    "props.email has one entry"
  );
  Assert.deepEqual(
    props.getAllValues("email"),
    ["juliet@invalid"],
    "props.email has one value"
  );
  Assert.equal(
    props.getFirstValue("email"),
    "juliet@invalid",
    "props.email has a first value"
  );
  propertyArrayEqual(props.entries, [data.juliet], "props has one entry");

  // Delete a property entry using a clone of it.

  Assert.ok(props.removeEntry(juliet));
  propertyArrayEqual(props.entries, [], "all entries removed");
});

/**
 * Tests adding to and removing from VCardProperties using names and values.
 */
add_task(function testValueMethods() {
  let props = new VCardProperties();

  // Add a value.

  let first = props.addValue("tel", "tel:1234567");
  propertyEqual(first, {
    name: "tel",
    params: {},
    type: "uri",
    value: "tel:1234567",
  });
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
  ]);

  // Add a second value.

  let second = props.addValue("tel", "tel:2345678");
  propertyEqual(second, {
    name: "tel",
    params: {},
    type: "uri",
    value: "tel:2345678",
  });
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:2345678",
    },
  ]);

  // Add a value that already exists. The existing property should be returned.

  let secondCopy = props.addValue("tel", "tel:2345678");
  Assert.equal(secondCopy, second);
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:2345678",
    },
  ]);

  // Add a third value.

  let third = props.addValue("tel", "tel:3456789");
  propertyEqual(third, {
    name: "tel",
    params: {},
    type: "uri",
    value: "tel:3456789",
  });
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:2345678",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:3456789",
    },
  ]);

  // Remove the second value.

  props.removeValue("tel", "tel:2345678");
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:3456789",
    },
  ]);

  // Remove a value that's already been removed.

  props.removeValue("tel", "tel:2345678");
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:3456789",
    },
  ]);

  // Remove a value that never existed.

  props.removeValue("tel", "tel:4567890");
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:1234567",
    },
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:3456789",
    },
  ]);

  // Remove the first value.

  props.removeValue("tel", "tel:1234567");
  propertyArrayEqual(props.entries, [
    {
      name: "tel",
      params: {},
      type: "uri",
      value: "tel:3456789",
    },
  ]);

  // Remove the last value.

  props.removeValue("tel", "tel:3456789");
  propertyArrayEqual(props.entries, []);
});

/**
 * Tests retrieving entries and values in preference order.
 */
add_task(function testSortMethods() {
  let props = new VCardProperties();
  props.addEntry(new VCardPropertyEntry("email", {}, "text", "third@invalid"));
  props.addEntry(
    new VCardPropertyEntry("email", { pref: 2 }, "text", "second@invalid")
  );
  props.addEntry(new VCardPropertyEntry("email", {}, "text", "fourth@invalid"));
  props.addEntry(
    new VCardPropertyEntry("email", { pref: 1 }, "text", "first@invalid")
  );

  propertyArrayEqual(props.getAllEntriesSorted("email"), [
    {
      name: "email",
      params: { pref: 1 },
      type: "text",
      value: "first@invalid",
    },
    {
      name: "email",
      params: { pref: 2 },
      type: "text",
      value: "second@invalid",
    },
    { name: "email", params: {}, type: "text", value: "third@invalid" },
    { name: "email", params: {}, type: "text", value: "fourth@invalid" },
  ]);

  Assert.deepEqual(props.getAllValuesSorted("email"), [
    "first@invalid",
    "second@invalid",
    "third@invalid",
    "fourth@invalid",
  ]);
});

/**
 * Tests the `clone` method of VCardProperties.
 */
add_task(function testClone() {
  let properties = VCardProperties.fromVCard(
    formatVCard`
      BEGIN:VCARD
      FN:this is a test
      N:test;this;is,a;;
      EMAIL;PREF=1;TYPE=WORK:test@invalid
      EMAIL:test@test.invalid
      END:VCARD`
  );
  let clone = properties.clone();

  Assert.deepEqual(clone.entries, properties.entries);
  Assert.notEqual(clone.entries, properties.entries);

  for (let i = 0; i < 4; i++) {
    Assert.deepEqual(clone.entries[i].value, properties.entries[i].value);
    Assert.notEqual(clone.entries[i], properties.entries[i]);
    Assert.ok(clone.entries[i].equals(properties.entries[i]));
  }
});
