/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that nsIMsgCompFields works properly

var nsMsgCompFields = Components.Constructor(
  "@mozilla.org/messengercompose/composefields;1",
  Ci.nsIMsgCompFields
);

function check_headers(enumerator, container) {
  const checkValues = new Set(container.map(header => header.toLowerCase()));
  for (let value of enumerator) {
    value = value.toLowerCase();
    Assert.ok(checkValues.has(value));
    checkValues.delete(value);
  }
  Assert.equal(checkValues.size, 0);
}

function run_test() {
  const fields = new nsMsgCompFields();
  Assert.ok(fields instanceof Ci.nsIMsgCompFields);
  Assert.ok(fields instanceof Ci.msgIStructuredHeaders);
  Assert.ok(fields instanceof Ci.msgIWritableStructuredHeaders);
  check_headers(fields.headerNames, []);
  Assert.ok(!fields.hasRecipients);

  // Try some basic headers
  fields.setHeader("From", [{ name: "", email: "a@test.invalid" }]);
  const from = fields.getHeader("from");
  Assert.equal(from.length, 1);
  Assert.equal(from[0].email, "a@test.invalid");
  check_headers(fields.headerNames, ["From"]);
  Assert.ok(!fields.hasRecipients);

  // Add a To header
  fields.setHeader("To", [{ name: "", email: "b@test.invalid" }]);
  check_headers(fields.headerNames, ["From", "To"]);
  Assert.ok(fields.hasRecipients);

  // Delete a header...
  fields.deleteHeader("from");
  Assert.equal(fields.getHeader("From"), undefined);
  check_headers(fields.headerNames, ["To"]);

  // Subject should work and not convert to RFC 2047.
  fields.subject = "\u79c1\u306f\u4ef6\u540d\u5348\u524d";
  Assert.equal(fields.subject, "\u79c1\u306f\u4ef6\u540d\u5348\u524d");
  Assert.equal(
    fields.getHeader("Subject"),
    "\u79c1\u306f\u4ef6\u540d\u5348\u524d"
  );

  // Check header synchronization.
  fields.from = "a@test.invalid";
  Assert.equal(fields.from, "a@test.invalid");
  Assert.equal(fields.getHeader("From")[0].email, "a@test.invalid");
  fields.from = null;
  Assert.equal(fields.getHeader("From"), undefined);
}
