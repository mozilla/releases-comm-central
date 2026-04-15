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
  folder = await create_folder("Malformed Multipart Mixed");
  const file = new FileUtils.File(
    getTestFilePath("data/malformed-multipart-mixed.eml")
  );
  const source = await IOUtils.readUTF8(file.path);
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);
  registerCleanupFunction(() => folder.deleteSelf(null));
});

add_task(
  async function test_forward_keeps_body_for_malformed_multipart_mixed() {
    await be_in_folder(folder);
    await make_display_unthreaded();

    const msg = await select_click_row(0);
    await assert_selected_and_displayed(window, msg);

    const cwc = await open_compose_with_forward();
    const bodyText = get_compose_body(cwc).textContent;
    const bucket = cwc.document.getElementById("attachmentBucket");

    Assert.ok(
      bodyText.includes(
        "This is malformed multipart/mixed with a nested multipart/alternative body."
      ),
      "The forwarded message should keep the actual body text"
    );
    Assert.ok(
      !bodyText.includes("Attached Message Part"),
      "The forwarded body should not be turned into an attached message part"
    );
    Assert.equal(
      bucket.itemCount,
      1,
      "The forward should restore one attachment"
    );
    Assert.equal(
      bucket.itemChildren[0].attachment.name,
      "test.pdf",
      "The forward should keep the original PDF attachment"
    );

    await close_compose_window(cwc);
  }
);
