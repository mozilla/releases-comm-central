/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the mail.strip_sig_on_reply pref.
 */

"use strict";

var {
  close_compose_window,
  get_compose_body,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  create_message,
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var sig = "roses are red";
var folder;

add_task(function setupModule(module) {
  folder = create_folder("SigStripTest");

  let msg = create_message({
    subject: "msg with signature; format=flowed",
    body: {
      body:
        "get with the flow! get with the flow! get with the flow! " +
        "get with the \n flow! get with the flow!\n-- \n" +
        sig +
        "\n",
      contentType: "text/plain",
      charset: "UTF-8",
      format: "flowed",
    },
  });
  add_message_to_folder(folder, msg);
  let msg2 = create_message({
    subject: "msg with signature; format not flowed",
    body: {
      body:
        "not flowed! not flowed! not flowed! \n" +
        "not flowed!\n-- \n" +
        sig +
        "\n",
      contentType: "text/plain",
      charset: "UTF-8",
      format: "",
    },
  });
  add_message_to_folder(folder, msg2);
});

/** Test sig strip true for format flowed. */
add_task(function test_sig_strip_true_ff() {
  Services.prefs.setBoolPref("mail.strip_sig_on_reply", true);
  check_sig_strip_works(0, true);
  Services.prefs.clearUserPref("mail.strip_sig_on_reply");
});

/** Test sig strip false for format flowed. */
add_task(function test_sig_strip_false_ff() {
  Services.prefs.setBoolPref("mail.strip_sig_on_reply", false);
  check_sig_strip_works(0, false);
  Services.prefs.clearUserPref("mail.strip_sig_on_reply");
});

/** Test sig strip true for non-format flowed. */
add_task(function test_sig_strip_true_nonff() {
  Services.prefs.setBoolPref("mail.strip_sig_on_reply", true);
  check_sig_strip_works(1, true);
  Services.prefs.clearUserPref("mail.strip_sig_on_reply");
});

/** Test sig strip false for non-format flowed. */
add_task(function test_sig_strip_false_nonff() {
  Services.prefs.setBoolPref("mail.strip_sig_on_reply", false);
  check_sig_strip_works(1, false);
  Services.prefs.clearUserPref("mail.strip_sig_on_reply");
});

/**
 * Helper function to check signature stripping works as it should.
 * @param aRow the row index of the message to test
 * @param aShouldStrip true if the signature should be stripped
 */
function check_sig_strip_works(aRow, aShouldStrip) {
  be_in_folder(folder);
  let msg = select_click_row(aRow);
  assert_selected_and_displayed(mc, msg);

  let rwc = open_compose_with_reply();
  let body = get_compose_body(rwc);

  if (aShouldStrip && body.textContent.includes(sig)) {
    throw new Error("signature was not stripped; body=" + body.textContent);
  } else if (!aShouldStrip && !body.textContent.includes(sig)) {
    throw new Error("signature stripped; body=" + body.textContent);
  }
  close_compose_window(rwc);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
}
