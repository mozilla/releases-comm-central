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
  folder = await create_folder("AttachmentInMultipartAlternative");
  const file = new FileUtils.File(
    getTestFilePath("data/attachment-in-multipart-alternative.eml")
  );
  const source = await IOUtils.readUTF8(file.path);
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);
  registerCleanupFunction(() => folder.deleteSelf(null));
});

// Malformed messages (e.g. from Outlook) place binary attachments directly
// inside multipart/alternative. The attachment must survive forwarding.
add_task(
  async function test_forward_keeps_attachment_in_multipart_alternative() {
    await be_in_folder(folder);
    await make_display_unthreaded();

    const msg = await select_click_row(0);
    await assert_selected_and_displayed(window, msg);

    const cwc = await open_compose_with_forward();
    const body = get_compose_body(cwc);
    const bucket = cwc.document.getElementById("attachmentBucket");

    Assert.stringContains(
      body.innerText,
      "We open attachments.",
      "body text should be preserved"
    );
    // Non-zero bucket count indirectly proves the part URL is readable.
    Assert.equal(
      bucket.itemCount,
      1,
      "forwarded message should have one attachment"
    );
    if (bucket.itemCount) {
      Assert.equal(
        bucket.itemChildren[0].attachment.name,
        "report.pdf",
        "attachment name should be report.pdf"
      );
      Assert.greater(
        bucket.itemChildren[0].attachment.size,
        0,
        "attachment size should be non-zero"
      );
    }

    await close_compose_window(cwc);
  }
);
