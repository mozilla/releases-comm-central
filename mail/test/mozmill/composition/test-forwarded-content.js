/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that forwarded content is ok.
 */

"use strict";

/* import-globals-from ../shared-modules/test-compose-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */

var MODULE_NAME = "test-forwarded-content";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers"];

var folder = null;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  folder = create_folder("Forward Content Testing");
  add_message_to_folder(
    folder,
    create_message({
      subject: "something like <foo@example>",
      body: { body: "Testing bug 397021!" },
    })
  );
}

/**
 * Test that the subject is set properly in the forwarded message content
 * when you hit forward.
 */
function test_forwarded_subj() {
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
}
