/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, get_compose_body, open_compose_with_forward } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  make_display_unthreaded,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("Attachment Only Multipart Mixed");
  const file = new FileUtils.File(
    getTestFilePath("data/attachment-only-multipart-mixed.eml")
  );
  const source = await IOUtils.readUTF8(file.path);
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);
  registerCleanupFunction(() => folder.deleteSelf(null));
});

add_task(async function test_forward_keeps_attachment_only_multipart_mixed() {
  await be_in_folder(folder);
  await make_display_unthreaded();

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const cwc = await open_compose_with_forward();
  const body = get_compose_body(cwc);
  const bucket = cwc.document.getElementById("attachmentBucket");

  Assert.equal(
    body.innerText.trim(),
    "",
    "The forwarded plain text body should render no text"
  );
  Assert.equal(
    body.textContent.trim(),
    "",
    "The forwarded HTML body should render no text"
  );
  Assert.equal(
    bucket.itemCount,
    1,
    "The forward should restore one attachment"
  );
  Assert.equal(
    bucket.itemChildren[0].attachment.name,
    "note.txt",
    "The forward should keep the original attachment"
  );

  await close_compose_window(cwc);
});
