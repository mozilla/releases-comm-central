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
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("TextSandwichedInlineImageForward");
  const file = new FileUtils.File(
    getTestFilePath("data/text-sandwiched-inline-image.eml")
  );
  const source = await IOUtils.readUTF8(file.path);
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);
  registerCleanupFunction(() => folder.deleteSelf(null));
});

/**
 * Apple Mail composes plain-text-only messages with inline images as a
 * multipart/mixed body: a text/plain part, the image with
 * Content-Disposition: inline; filename=, and another text/plain part. There
 * is no text/html alternative. Forwarding such a message inline should quote
 * both text parts in the body and carry the image over as the sole attachment.
 */
add_task(async function test_sandwiched_image_survives_forward() {
  await be_in_folder(folder);

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const cwc = await open_compose_with_forward();
  const body = get_compose_body(cwc);
  const bucket = cwc.document.getElementById("attachmentBucket");

  Assert.stringContains(
    body.textContent,
    "beautiful landscape",
    "text before the inline image should be quoted in the forwarded body"
  );
  Assert.stringContains(
    body.textContent,
    "Don't leave me behind",
    "text after the inline image should be quoted in the forwarded body"
  );

  Assert.equal(
    bucket.itemCount,
    1,
    "the inline image should carry over as the sole attachment when forwarded"
  );

  const attachment = bucket.itemChildren[0].attachment;
  Assert.equal(
    attachment.name,
    "pixel.png",
    "attachment should use the provided filename"
  );
  Assert.equal(
    attachment.contentType,
    "image/png",
    "attachment content type should be image/png"
  );
  Assert.greater(attachment.size, 0, "attachment size should be non-zero");

  await close_compose_window(cwc);
});
