/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test mail.compose.other.header is rendered and handled correctly.
 */
var {
  close_compose_window,
  get_msg_source,
  open_compose_new_mail,
  save_compose_message,
  open_compose_from_draft,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { be_in_folder, select_click_row, get_special_folder } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

/**
 * Test custom headers are set and encoded correctly.
 */
add_task(async function test_customHeaders() {
  const draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true
  );

  // Set other.header so that they will be rendered in compose window.
  const otherHeaders = Services.prefs.getCharPref("mail.compose.other.header");
  Services.prefs.setCharPref(
    "mail.compose.other.header",
    "X-Header1, X-Header2, Approved ,Supersedes"
  );

  // Set values to custom headers.
  let cwc = await open_compose_new_mail();
  const inputs = cwc.document.querySelectorAll(".address-row-raw input");
  inputs[0].value = "Test äöü";
  inputs[1].value = "Test 😃";
  inputs[2].value = "moderator@tinderbox.com";
  inputs[3].value = "<message-id-1234@tinderbox.com>";

  await save_compose_message(cwc);
  await close_compose_window(cwc);
  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  await be_in_folder(draftsFolder);
  const draftMsg = await select_click_row(0);
  const draftMsgLines = (await get_msg_source(draftMsg)).split("\n");

  // Check header values are set and encoded correctly.
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "X-Header1: =?UTF-8?B?VGVzdCDDpMO2w7w=?="
    ),
    "Correct X-Header1 found"
  );
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "X-Header2: =?UTF-8?B?VGVzdCDwn5iD?="
    ),
    "Correct X-Header2 found"
  );
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "Approved: moderator@tinderbox.com"
    ),
    "Correct Approved found"
  );
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "Supersedes: <message-id-1234@tinderbox.com>"
    ),
    "Correct Supersedes found"
  );

  cwc = await open_compose_from_draft();
  const inputs2 = cwc.document.querySelectorAll(".address-row-raw input");

  Assert.equal(inputs2[0].value, "Test äöü");
  Assert.equal(inputs2[1].value, "Test 😃");
  Assert.equal(inputs2[2].value, "moderator@tinderbox.com");
  Assert.equal(inputs2[3].value, "<message-id-1234@tinderbox.com>");

  await close_compose_window(cwc);

  // Reset other.header.
  Services.prefs.setCharPref("mail.compose.other.header", otherHeaders);
});
