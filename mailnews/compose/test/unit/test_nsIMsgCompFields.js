/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/// Test that nsIMsgCompFields works properly

var Ci = Components.interfaces;

var nsMsgCompFields = Components.Constructor(
  "@mozilla.org/messengercompose/composefields;1",
  Ci.nsIMsgCompFields);

function check_headers(enumerator, container) {
  let checkValues = new Set([for (header of container) header.toLowerCase()]);
  while (enumerator.hasMore()) {
    let value = enumerator.getNext().toLowerCase();
    do_check_true(checkValues.has(value));
    checkValues.delete(value);
  }
  do_check_eq(checkValues.size, 0);
}

function run_test() {
  let fields = new nsMsgCompFields;
  do_check_true(fields instanceof Ci.nsIMsgCompFields);
  do_check_true(fields instanceof Ci.msgIStructuredHeaders);
  do_check_true(fields instanceof Ci.msgIWritableStructuredHeaders);
  check_headers(fields.headerNames, []);
  do_check_false(fields.hasRecipients);

  // Try some basic headers
  fields.setHeader("From", [{name: "", email: "a@test.invalid"}]);
  let from = fields.getHeader("from");
  do_check_eq(from.length, 1);
  do_check_eq(from[0].email, "a@test.invalid");
  check_headers(fields.headerNames, ["From"]);
  do_check_false(fields.hasRecipients);

  // Add a To header
  fields.setHeader("To", [{name: "", email: "b@test.invalid"}]);
  check_headers(fields.headerNames, ["From", "To"]);
  do_check_true(fields.hasRecipients);

  // Delete a header...
  fields.deleteHeader("from");
  do_check_eq(fields.getHeader("From"), undefined);
  check_headers(fields.headerNames, ["To"]);

  // Subject should work and not convert to RFC 2047.
  fields.subject = "\u79c1\u306f\u4ef6\u540d\u5348\u524d";
  do_check_eq(fields.subject, "\u79c1\u306f\u4ef6\u540d\u5348\u524d");
  do_check_eq(fields.getHeader("Subject"),
    "\u79c1\u306f\u4ef6\u540d\u5348\u524d");

  // Check header synchronization.
  fields.from = "a@test.invalid";
  do_check_eq(fields.from, "a@test.invalid");
  do_check_eq(fields.getHeader("From")[0].email, "a@test.invalid");
  fields.from = null;
  do_check_eq(fields.getHeader("From"), undefined);
}
