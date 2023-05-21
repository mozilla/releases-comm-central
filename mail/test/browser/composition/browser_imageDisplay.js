/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we load and display embedded images in messages.
 */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var {
  close_compose_window,
  open_compose_with_forward,
  open_compose_with_reply,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  mc,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence, close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var gImageFolder;

add_setup(async function () {
  gImageFolder = await create_folder("ImageFolder");
  registerCleanupFunction(() => {
    gImageFolder.deleteSelf(null);
  });
});

/**
 * Check dimensions of the embedded image and whether it could be loaded.
 */
async function check_image_size(aController, aImage, aSrcStart) {
  Assert.notEqual(null, aImage, "should have a image");
  await TestUtils.waitForCondition(
    () => aImage.complete,
    "waiting for image.complete"
  );
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
  let msgSource = await IOUtils.readUTF8(file.path);
  Assert.ok(msgSource.includes('<img src="cid:'));

  // Our image should be in the loaded eml document.
  let msgc = await open_message_from_file(file);
  let messageDoc = msgc.window.content.document;
  let image = messageDoc.getElementById("cidImage");
  await check_image_size(msgc, image, "mailbox://");
  image = messageDoc.getElementById("cidImageOrigin");
  check_image_size(msgc, image, "mailbox://");

  // Copy the message to a folder.
  let documentChild = messageDoc.firstElementChild;
  EventUtils.synthesizeMouseAtCenter(
    documentChild,
    { type: "contextmenu", button: 2 },
    documentChild.ownerGlobal
  );
  let aboutMessage = get_about_message(msgc.window);
  await click_menus_in_sequence(
    aboutMessage.document.getElementById("mailContext"),
    [
      { id: "mailContext-copyMenu" },
      { label: "Local Folders" },
      { label: gImageFolder.prettyName },
    ]
  );
  close_window(msgc);
});

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message in a folder with work.
 */
add_task(async function test_cid_image_view() {
  // Preview the message in the folder.
  await be_in_folder(gImageFolder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  // Check image in the preview.
  let messageDoc =
    get_about_message().document.getElementById("messagepane").contentDocument;
  let image = messageDoc.getElementById("cidImage");
  await check_image_size(mc, image, gImageFolder.server.localStoreType + "://");
  image = messageDoc.getElementById("cidImageOrigin");
  await check_image_size(mc, image, gImageFolder.server.localStoreType + "://");
});

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message will work
 * in a composition.
 */
async function check_cid_image_compose(cwc) {
  // Our image should also be in composition when the message is forwarded/replied.
  let image = cwc.window.document
    .getElementById("messageEditor")
    .contentDocument.getElementById("cidImage");
  await check_image_size(cwc, image, "data:");
  image = cwc.window.document
    .getElementById("messageEditor")
    .contentDocument.getElementById("cidImageOrigin");
  await check_image_size(cwc, image, "data:");
}

add_task(async function test_cid_image_compose_fwd() {
  // Our image should also be in composition when the message is forwarded.
  let cwc = open_compose_with_forward();
  await check_cid_image_compose(cwc);
  close_compose_window(cwc);
});

add_task(async function test_cid_image_compose_re() {
  // Our image should also be in composition when the message is replied.
  let cwc = open_compose_with_reply();
  await check_cid_image_compose(cwc);
  close_compose_window(cwc);
});
