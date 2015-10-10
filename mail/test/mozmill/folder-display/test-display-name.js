/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the display names in email addresses are correctly shown in the
 * thread pane.
 */
var MODULE_NAME = "test-display-name";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "address-book-helpers"];

var folder;

var messages = [
  // Basic From header tests
  { name: "from_display_name_unquoted",
    headers: { From: "Carter Burke <cburke@wyutani.invalid>" },
    expected: { column: "from", value: "Carter Burke" },
  },
  { name: "from_display_name_quoted",
    headers: { From: '"Ellen Ripley" <eripley@wyutani.invalid>' },
    expected: { column: "from", value: "Ellen Ripley" },
  },
  { name: "from_display_name_with_comma",
    headers: { From: '"William Gorman, Lt." <wgorman@uscmc.invalid>' },
    expected: { column: "from", value: "William Gorman, Lt." },
  },
  { name: "from_email_raw",
    headers: { From: "dhicks@uscmc.invalid" },
    expected: { column: "from", value: "dhicks@uscmc.invalid" },
  },
  { name: "from_email_in_angle_brackets",
    headers: { From: "<whudson@uscmc.invalid>" },
    expected: { column: "from", value: "whudson@uscmc.invalid" },
  },

  // Basic To header tests
  { name: "to_display_name_unquoted",
    headers: { To: "Carter Burke <cburke@wyutani.invalid>" },
    expected: { column: "recipients", value: "Carter Burke" },
  },
  { name: "to_display_name_quoted",
    headers: { To: '"Ellen Ripley" <eripley@wyutani.invalid>' },
    expected: { column: "recipients", value: "Ellen Ripley" },
  },
  { name: "to_display_name_with_comma",
    headers: { To: '"William Gorman, Lt." <wgorman@uscmc.invalid>' },
    expected: { column: "recipients", value: "William Gorman, Lt." },
  },
  { name: "to_email_raw",
    headers: { To: "dhicks@uscmc.invalid" },
    expected: { column: "recipients", value: "dhicks@uscmc.invalid" },
  },
  { name: "to_email_in_angle_brackets",
    headers: { To: "<whudson@uscmc.invalid>" },
    expected: { column: "recipients", value: "whudson@uscmc.invalid" },
  },
  { name: "to_display_name_multiple",
    headers: { To: "Carter Burke <cburke@wyutani.invalid>, " +
                   "Dwayne Hicks <dhicks@uscmc.invalid>" },
    expected: { column: "recipients", value: "Carter Burke, Dwayne Hicks" },
  },

  // Address book tests
  { name: "from_in_abook_pdn",
    headers: { From: "Al Apone <aapone@uscmc.invalid>" },
    expected: { column: "from", value: "Sarge" },
  },
  { name: "from_in_abook_no_pdn",
    headers: { From: "Rebeccah Jorden <rjorden@hadleys-hope.invalid>" },
    expected: { column: "from", value: "Rebeccah Jorden" },
  },
  { name: "to_in_abook_pdn",
    headers: { To: "Al Apone <aapone@uscmc.invalid>" },
    expected: { column: "recipients", value: "Sarge" },
  },
  { name: "to_in_abook_no_pdn",
    headers: { To: "Rebeccah Jorden <rjorden@hadleys-hope.invalid>" },
    expected: { column: "recipients", value: "Rebeccah Jorden" },
  },
  { name: "to_in_abook_multiple_mixed_pdn",
    headers: { To: "Al Apone <aapone@uscmc.invalid>, " +
                   "Rebeccah Jorden <rjorden@hadleys-hope.invalid>" },
    expected: { column: "recipients", value: "Sarge, Rebeccah Jorden" },
  },

  // Esoteric tests; these mainly test that we're getting the expected info back
  // from the message header.
  { name: "from_display_name_multiple",
    headers: { From: "Carter Burke <cburke@wyutani.invalid>, " +
                     "Dwayne Hicks <dhicks@uscmc.invalid>" },
    expected: { column: "from", value: "Carter Burke" },
  },
  { name: "from_missing",
    headers: { From: null },
    expected: { column: "from", value: "" },
  },
  { name: "from_empty",
    headers: { From: "" },
    expected: { column: "from", value: "" },
  },
  { name: "from_invalid",
    headers: { From: "invalid" },
    expected: { column: "from", value: "invalid" },
  },
  { name: "from_and_sender_display_name",
    headers: { From: "Carter Burke <cburke@wyutani.invalid>",
               Sender: "The Company <thecompany@wyutani.invalid>" },
    expected: { column: "from", value: "Carter Burke" },
  },
  { name: "sender_and_no_from_display_name",
    headers: { From: null,
               Sender: "The Company <thecompany@wyutani.invalid>" },
    expected: { column: "from", value: "The Company" },
  },
  { name: "to_missing",
    headers: { To: null },
    expected: { column: "recipients", value: "" },
  },
  { name: "to_empty",
    headers: { To: "" },
    expected: { column: "recipients", value: "" },
  },
  { name: "to_invalid",
    headers: { To: "invalid" },
    expected: { column: "recipients", value: "invalid" },
  },
  { name: "to_and_cc_display_name",
    headers: { To: "Carter Burke <cburke@wyutani.invalid>",
               Cc: "The Company <thecompany@wyutani.invalid>" },
    expected: { column: "recipients", value: "Carter Burke" },
  },
  { name: "cc_and_no_to_display_name",
    headers: { To: null,
               Cc: "The Company <thecompany@wyutani.invalid>" },
    expected: { column: "recipients", value: "The Company" },
  },
];

var contacts = [
  { email: "aapone@uscmc.invalid", name: "Sarge", pdn: true },
  { email: "rjorden@hadleys-hope.invalid", name: "Newt", pdn: false },
];

function setupModule(module) {
  for (let req of MODULE_REQUIRES) {
    collector.getModule(req).installInto(module);
  }

  folder = create_folder("DisplayNameA");

  for (let message of messages) {
    add_message_to_folder(folder, create_message({
      clobberHeaders: message.headers,
    }));
  }

  for (let contact of contacts) {
    ensure_card_exists(contact.email, contact.name, contact.pdn);
  }
}

function check_display_name(index, columnName, expectedName) {
  let columnIndex;
  switch (columnName) {
    case "from":
      columnIndex = 5;
      break;
    case "recipients":
      columnIndex = 6;
      break;
    default:
      throw new Error("unknown column name: " + columnName);
  }

  // Select the nth message
  be_in_folder(folder);
  let curMessage = select_click_row(index);

  let tree = mc.folderDisplay.tree;
  let cellText = tree.view.getCellText(index, tree.columns[columnIndex]);

  assert_equals(cellText, expectedName, columnName);
}

// Generate a test for each message in |messages|.
for (let [i, message] in Iterator(messages)) {
  this["test_" + message.name] = function(i, message) {
    check_display_name(i, message.expected.column, message.expected.value);
  }.bind(this, i, message);
}
