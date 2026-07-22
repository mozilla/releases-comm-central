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

async function selectDraftBySubject(subject) {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const folder = about3Pane.gDBView.msgFolder;
  const enumerator = folder.messages;
  while (enumerator.hasMoreElements()) {
    const hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
    if (hdr.subject == subject) {
      return select_click_row(about3Pane.gDBView.findIndexOfMsgHdr(hdr, false));
    }
  }
  throw new Error(`Could not find draft with subject: ${subject}`);
}

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

add_task(async function test_edit_draft_keeps_referenced_related_attachments() {
  const draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true
  );
  const file = new FileUtils.File(
    getTestFilePath("../attachment/data/apple_mail_related_attachments.eml")
  );
  const source = await IOUtils.readUTF8(file.path);

  draftsFolder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);

  await be_in_folder(draftsFolder);
  await make_display_unthreaded();

  const draftMsg = await selectDraftBySubject(
    "Apple Mail referenced related attachments"
  );
  await assert_selected_and_displayed(window, draftMsg);
  await wait_for_notification_to_show(
    get_about_message(),
    "mail-notification-top",
    "draftMsgContent"
  );

  const cwc = await open_compose_from_draft();
  const bucket = cwc.document.getElementById("attachmentBucket");

  Assert.equal(bucket.itemCount, 3, "The draft should restore all attachments");

  const expectedNames = ["example.md", "example.sh", "example.py"];

  for (const [i, expectedName] of expectedNames.entries()) {
    Assert.equal(
      bucket.itemChildren[i].attachment.name,
      expectedName,
      `attachment ${i + 1} should be ${expectedName}`
    );
  }

  await close_compose_window(cwc);
});
