/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that replying in to mail with subject change (was: old) style will
 * do the right thing.
 */

"use strict";

var { close_compose_window, open_compose_with_reply } = ChromeUtils.import(
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

add_setup(async function () {
  folder = await create_folder("SubjectWas");
  await add_message_to_folder(
    [folder],
    create_message({
      subject: "New subject (was: Old subject)",
      body: { body: "Testing thread subject switch reply." },
      clobberHeaders: {
        References: "<97010db3-bd55-34e0-b08b-841b2a9ff0ec@test>",
      },
    })
  );
  registerCleanupFunction(() => folder.deleteSelf(null));
});

/**
 * Test that the subject is set properly in the replied message.
 */
add_task(async function test_was_reply_subj() {
  await be_in_folder(folder);

  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  let cwc = open_compose_with_reply();

  let msgSubject = cwc.window.document.getElementById("msgSubject").value;

  // Subject should be Re: <the original subject stripped of the was: part>
  Assert.equal(
    msgSubject,
    "Re: New subject",
    "was: part of subject should have been removed"
  );

  close_compose_window(cwc);
});
