/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, open_compose_with_edit_as_new } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  make_display_unthreaded,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

let folder;

add_setup(async function () {
  folder = await create_folder("Related attachment visibility");
  registerCleanupFunction(() => folder.deleteSelf(null));
});

// Unreferenced related parts should remain visible when composing, including
// parts without either Content-ID or Content-Location.
add_task(async function test_unreferenced_related_attachments() {
  const encoded = btoa("Unreferenced related attachment contents.");
  const parts = [
    {
      name: "related.mp4",
      headers: ["Content-ID: <orphan@example.invalid>"],
    },
    { name: "no-cid.mp4", headers: [] },
    {
      name: "attachment.mp4",
      headers: ['Content-Disposition: attachment; filename="attachment.mp4"'],
    },
  ];
  const source = [
    "From: sender@example.invalid",
    "To: tinderbox@foo.invalid",
    "Subject: Related attachment visibility",
    "Message-ID: <related-visibility@example.invalid>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/related; type="multipart/alternative"; boundary="related"',
    "",
    "--related",
    'Content-Type: multipart/alternative; boundary="alternative"',
    "",
    "--alternative",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "An unreferenced related attachment.",
    "--alternative",
    "Content-Type: text/html; charset=UTF-8",
    "",
    "<html><body>An unreferenced related attachment.</body></html>",
    "--alternative--",
    ...parts.flatMap(part => [
      "--related",
      `Content-Type: video/mp4; name="${part.name}"`,
      "Content-Transfer-Encoding: base64",
      ...part.headers,
      "",
      encoded,
    ]),
    "--related--",
    "",
  ].join("\r\n");
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(source);
  await be_in_folder(folder);
  await make_display_unthreaded();
  const hdr = folder.msgDatabase.getMsgHdrForMessageID(
    "related-visibility@example.invalid"
  );
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const msg = await select_click_row(
    about3Pane.gDBView.findIndexOfMsgHdr(hdr, false)
  );
  await assert_selected_and_displayed(window, msg);
  Assert.deepEqual(
    get_about_message().currentAttachments.map(attachment => attachment.name),
    parts.map(part => part.name),
    "The reader should expose all unreferenced related attachments"
  );

  const cwc = await open_compose_with_edit_as_new();
  try {
    const bucket = cwc.document.getElementById("attachmentBucket");
    Assert.equal(
      bucket.itemCount,
      parts.length,
      "Edit as New should retain all unreferenced related attachments"
    );
    Assert.deepEqual(
      bucket.itemChildren.map(item => item.attachment.name),
      parts.map(part => part.name),
      "Edit as New should retain all attachment names from the reader"
    );
  } finally {
    await close_compose_window(cwc);
  }
});
