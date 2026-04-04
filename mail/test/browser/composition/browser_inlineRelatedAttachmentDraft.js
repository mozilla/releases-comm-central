/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, open_compose_from_draft } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  assert_selected_and_displayed,
  be_in_folder,
  get_about_message,
  get_special_folder,
  make_display_unthreaded,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { wait_for_notification_to_show } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);

add_task(async function test_edit_draft_keeps_related_inline_pdf_attachment() {
  const draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true
  );
  const file = new FileUtils.File(
    getTestFilePath("data/related-inline-pdf-draft.eml")
  );
  const source = await IOUtils.readUTF8(file.path);

  draftsFolder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);

  await be_in_folder(draftsFolder);
  await make_display_unthreaded();

  const draftMsg = await select_click_row(0);
  await assert_selected_and_displayed(window, draftMsg);
  await wait_for_notification_to_show(
    get_about_message(),
    "mail-notification-top",
    "draftMsgContent"
  );

  const cwc = await open_compose_from_draft();
  const bucket = cwc.document.getElementById("attachmentBucket");

  Assert.equal(bucket.itemCount, 1, "The draft should restore one attachment");
  Assert.equal(
    bucket.itemChildren[0].attachment.name,
    "pdf-sample_0.pdf",
    "The draft should restore the related PDF attachment"
  );

  await close_compose_window(cwc);
});
