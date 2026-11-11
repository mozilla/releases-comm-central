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
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { add_message_to_folder, create_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
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

/**
 * Test that only the first Date header is used in the forwarded message
 * content.
 */
add_task(async function test_forwarded_multiple_dates() {
  const dateFolder = await create_folder("Forward Multiple Dates Testing");
  dateFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  dateFolder.addMessage(
    "From: Alice <alice@example.com>\r\n" +
      "To: Bob <bob@example.com>\r\n" +
      "Subject: Multiple dates\r\n" +
      "Date: Wed, 08 Jul 2026 11:36:38 +0000\r\n" +
      "Date: this-is-not-a-date\r\n" +
      "Message-ID: <multiple-dates@example.com>\r\n" +
      "MIME-Version: 1.0\r\n" +
      "Content-Type: text/plain; charset=UTF-8\r\n" +
      "\r\n" +
      "Testing multiple dates.\r\n"
  );
  await be_in_folder(dateFolder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const fwdWin = await open_compose_with_forward();
  const headerTableText = fwdWin.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("table").textContent;
  Assert.ok(
    headerTableText.includes("Wed, 08 Jul 2026 11:36:38 +0000"),
    "the first Date header should be in the header table"
  );
  Assert.ok(
    !headerTableText.includes("this-is-not-a-date"),
    "the second Date header should not be in the header table"
  );
  await close_compose_window(fwdWin);
});
