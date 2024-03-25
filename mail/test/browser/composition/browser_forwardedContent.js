/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that forwarded content is ok.
 */

"use strict";

var { close_compose_window, open_compose_with_forward } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  create_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder = null;

add_setup(async function () {
  folder = await create_folder("Forward Content Testing");
  await add_message_to_folder(
    [folder],
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
add_task(async function test_forwarded_subj() {
  await be_in_folder(folder);

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const fwdWin = await open_compose_with_forward();

  const headerTableText = fwdWin.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("table").textContent;
  if (!headerTableText.includes(msg.mime2DecodedSubject)) {
    throw new Error(
      "Subject not set correctly in header table: subject=" +
        msg.mime2DecodedSubject +
        ", header table text=" +
        headerTableText
    );
  }
  await close_compose_window(fwdWin);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
