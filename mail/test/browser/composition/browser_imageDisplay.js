/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we load and display embedded images in messages.
 */

"use strict";

var elib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);

var {
  close_compose_window,
  open_compose_with_forward,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  mc,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { IOUtils } = ChromeUtils.import("resource:///modules/IOUtils.jsm");

var gImageFolder;

add_task(function setupModule(module) {
  gImageFolder = create_folder("ImageFolder");
});

/**
 * Check dimensions of the embedded image and whether it could be loaded.
 */
function check_image_size(aController, aImage, aSrcStart) {
  Assert.notEqual(null, aImage);
  aController.waitFor(() => aImage.complete);
  // There should not be a cid: URL now.
  Assert.ok(!aImage.src.startsWith("cid:"));
  if (aSrcStart) {
    Assert.ok(aImage.src.startsWith(aSrcStart));
  }

  // Check if there are height and width attributes forcing the image to a size.
  let id = aImage.id;
  Assert.ok(
    aImage.hasAttribute("height"),
    "Image " + id + " is missing a required attribute"
  );
  Assert.ok(
    aImage.hasAttribute("width"),
    "Image " + id + " is missing a required attribute"
  );

  Assert.ok(
    aImage.height > 0,
    "Image " + id + " is missing a required attribute"
  );
  Assert.ok(
    aImage.width > 0,
    "Image " + id + " is missing a required attribute"
  );

  // If the image couldn't be loaded, the naturalWidth and Height are zero.
  Assert.ok(
    aImage.naturalHeight > 0,
    "Loaded image " + id + " is of zero size"
  );
  Assert.ok(aImage.naturalWidth > 0, "Loaded image " + id + " is of zero size");
}

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message from file will work.
 */
add_task(async function test_cid_image_load() {
  let file = new FileUtils.File(
    getTestFilePath("data/content-utf8-rel-only.eml")
  );

  // Make sure there is a cid: referenced image in the message.
  let msgSource = IOUtils.loadFileToString(file);
  Assert.ok(msgSource.includes('<img src="cid:'));

  // Our image should be in the loaded eml document.
  let msgc = await open_message_from_file(file);
  let messageDoc = msgc.e("messagepane").contentDocument;
  let image = messageDoc.getElementById("cidImage");
  check_image_size(msgc, image, "mailbox://");
  image = messageDoc.getElementById("cidImageOrigin");
  check_image_size(msgc, image, "mailbox://");

  // Copy the message to a folder.
  let documentChild = messageDoc.firstElementChild;
  msgc.rightClick(new elib.Elem(documentChild));
  msgc.click_menus_in_sequence(msgc.e("mailContext"), [
    { id: "mailContext-copyMenu" },
    { label: "Local Folders" },
    { label: gImageFolder.prettyName },
  ]);
  close_window(msgc);
});

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message in a folder with work.
 */
add_task(function test_cid_image_view() {
  // Preview the message in the folder.
  be_in_folder(gImageFolder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  // Check image in the preview.
  let messageDoc = mc.e("messagepane").contentDocument;
  let image = messageDoc.getElementById("cidImage");
  check_image_size(mc, image, gImageFolder.server.localStoreType + "://");
  image = messageDoc.getElementById("cidImageOrigin");
  check_image_size(mc, image, gImageFolder.server.localStoreType + "://");
});

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message will work
 * in a composition.
 */
add_task(function test_cid_image_compose() {
  // Our image should also be in composition when the message is forwarded/replied.
  for (let msgOperation of [
    open_compose_with_forward,
    open_compose_with_reply,
  ]) {
    let cwc = msgOperation();
    let image = cwc
      .e("content-frame")
      .contentDocument.getElementById("cidImage");
    check_image_size(cwc, image, "data:");
    image = cwc
      .e("content-frame")
      .contentDocument.getElementById("cidImageOrigin");
    check_image_size(cwc, image, "data:");
    close_compose_window(cwc);
  }
});
