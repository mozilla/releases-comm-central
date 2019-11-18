/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that forwarded content is ok.
 */

"use strict";

var { close_compose_window, open_compose_with_forward } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
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

var folder = null;

add_task(function setupModule(module) {
  folder = create_folder("Forward Content Testing");
  add_message_to_folder(
    folder,
    create_message({
      subject: "something like <foo@example>",
      body: { body: "Testing bug 397021!" },
    })
  );
});

/**
 * Test that the subject is set properly in the forwarded message content
 * when you hit forward.
 */
add_task(function test_forwarded_subj() {
  be_in_folder(folder);

  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  let fwdWin = open_compose_with_forward();

  let headerTableText = fwdWin
    .e("content-frame")
    .contentDocument.querySelector("table").textContent;
  if (!headerTableText.includes(msg.mime2DecodedSubject)) {
    throw new Error(
      "Subject not set correctly in header table: subject=" +
        msg.mime2DecodedSubject +
        ", header table text=" +
        headerTableText
    );
  }
  close_compose_window(fwdWin);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
