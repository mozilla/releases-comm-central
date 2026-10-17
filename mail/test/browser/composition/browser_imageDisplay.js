/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we load and display embedded images in messages.
 */

"use strict";

var {
  close_compose_window,
  open_compose_with_edit_as_new,
  open_compose_with_forward,
  open_compose_with_reply,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
var { wait_for_notification_to_show } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
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
async function check_image_size(aImage, aSrcStart) {
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
  const id = aImage.id;
  Assert.ok(
    aImage.hasAttribute("height"),
    "Image " + id + " is missing a required attribute"
  );
  Assert.ok(
    aImage.hasAttribute("width"),
    "Image " + id + " is missing a required attribute"
  );

  Assert.greater(
    aImage.height,
    0,
    "Image " + id + " is missing a required attribute"
  );
  Assert.greater(
    aImage.width,
    0,
    "Image " + id + " is missing a required attribute"
  );

  // If the image couldn't be loaded, the naturalWidth and Height are zero.
  Assert.greater(
    aImage.naturalHeight,
    0,
    "Loaded image " + id + " is of zero size"
  );
  Assert.greater(
    aImage.naturalWidth,
    0,
    "Loaded image " + id + " is of zero size"
  );
}

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message from file will work.
 */
add_task(async function test_cid_image_load() {
  const file = new FileUtils.File(
    getTestFilePath("data/content-utf8-rel-only.eml")
  );

  // Make sure there is a cid: referenced image in the message.
  const msgSource = await IOUtils.readUTF8(file.path);
  Assert.ok(msgSource.includes('<img src="cid:'));

  // Our image should be in the loaded eml document.
  const msgc = await open_message_from_file(file);
  const messageDoc = msgc.content.document;
  let image = messageDoc.getElementById("cidImage");
  await check_image_size(image, "mailbox://");
  image = messageDoc.getElementById("cidImageOrigin");
  check_image_size(image, "mailbox://");

  // Copy the message to a folder.
  const documentChild = messageDoc.firstElementChild;
  EventUtils.synthesizeMouseAtCenter(
    documentChild,
    { type: "contextmenu", button: 2 },
    documentChild.documentGlobal
  );
  const aboutMessage = get_about_message(msgc);
  await click_menus_in_sequence(
    aboutMessage.document.getElementById("mailContext"),
    [
      { id: "mailContext-copyMenu" },
      { label: "Local Folders" },
      { label: gImageFolder.localizedName },
    ]
  );
  await TestUtils.waitForCondition(
    () => gImageFolder.getTotalMessages(false) == 1,
    "waiting for copy to gImageFolder to complete"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message in a folder with work.
 */
add_task(async function test_cid_image_view() {
  // Preview the message in the folder.
  await be_in_folder(gImageFolder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  // Check image in the preview.
  const messageDoc =
    get_about_message().document.getElementById("messagepane").contentDocument;
  let image = messageDoc.getElementById("cidImage");
  await check_image_size(image, gImageFolder.server.localStoreType + "://");
  image = messageDoc.getElementById("cidImageOrigin");
  await check_image_size(image, gImageFolder.server.localStoreType + "://");
});

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message will work
 * in a composition.
 */
async function check_cid_image_compose(cwc) {
  // Our image should also be in composition when the message is forwarded/replied.
  let image = cwc.document
    .getElementById("messageEditor")
    .contentDocument.getElementById("cidImage");
  await check_image_size(image, "data:");
  image = cwc.document
    .getElementById("messageEditor")
    .contentDocument.getElementById("cidImageOrigin");
  await check_image_size(image, "data:");
}

add_task(async function test_cid_image_compose_fwd() {
  // Our image should also be in composition when the message is forwarded.
  const cwc = await open_compose_with_forward();
  await check_cid_image_compose(cwc);
  await close_compose_window(cwc);
});

add_task(async function test_cid_image_compose_re() {
  // Our image should also be in composition when the message is replied.
  const cwc = await open_compose_with_reply();
  await check_cid_image_compose(cwc);
  await close_compose_window(cwc);
});

add_task(async function test_cid_image_compose_edit_as_new() {
  const cwc = await open_compose_with_edit_as_new();
  await check_cid_image_compose(cwc);
  await close_compose_window(cwc);
});

/**
 * Test that an image referencing a part of another message is not loaded,
 * even if the URL of the original message is a prefix of its URL.
 */
add_task(async function test_other_message_image_compose_re() {
  const cwc = await open_compose_with_reply();
  const msgURL = MailServices.messageServiceFromURI(cwc.gOriginalMsgURI)
    .getUrlForUri(cwc.gOriginalMsgURI)
    .spec.replace("&type=application/x-message-display", "");
  Assert.ok(
    /number=\d+$/.test(msgURL),
    `original message URL should end with a message key: ${msgURL}`
  );
  const otherSrc = `${msgURL}0&part=1.2&filename=other.png`;

  const editorDoc =
    cwc.document.getElementById("messageEditor").contentDocument;
  const image = editorDoc.createElement("img");
  image.id = "otherMessageImage";
  image.src = otherSrc;
  editorDoc.body.append(image);

  await wait_for_notification_to_show(
    cwc,
    "compose-notification-bottom",
    "blockedContent"
  );
  Assert.equal(
    image.src,
    otherSrc,
    "image from another message should not be loaded"
  );
  await close_compose_window(cwc);
});

add_task(function test_isURLOfMessage() {
  const { ComposeUtils } = ChromeUtils.importESModule(
    "resource:///modules/ComposeUtils.sys.mjs"
  );
  const cases = [
    ["mailbox:///p/Inbox?number=2", "mailbox:///p/Inbox?number=2", true],
    [
      "mailbox:///p/Inbox?number=2&part=1.2",
      "mailbox:///p/Inbox?number=2",
      true,
    ],
    [
      "mailbox:///p/Inbox?number=20&part=1.2",
      "mailbox:///p/Inbox?number=2",
      false,
    ],
    [
      "mailbox:///p/Inbox?number=10&part=1.2",
      "mailbox:///p/Inbox?number=1",
      false,
    ],
    [
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2?part=1.2",
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2",
      true,
    ],
    [
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E20?part=1.2",
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2",
      false,
    ],
    [
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2/;section=2?part=1.2",
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2",
      true,
    ],
    [
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E20/;section=2?part=1.2",
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2",
      false,
    ],
    [
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2?header=quotebody/;section=2.2?part=1.2.2",
      "imap://u@h:143/fetch%3EUID%3E/INBOX%3E2",
      true,
    ],
    [
      "news://h:119/id%40h?group=g&key=2&part=1.2",
      "news://h:119/id%40h?group=g&key=2",
      true,
    ],
    [
      "news://h:119/id%40h?group=g&key=20&part=1.2",
      "news://h:119/id%40h?group=g&key=2",
      false,
    ],
    ["file:///tmp/a.eml?part=1.2", "file:///tmp/a.eml?", true],
    ["file:///tmp/a.eml.png", "file:///tmp/a.eml", false],
    [
      "mailbox:///p/Other?number=2&part=1.2",
      "mailbox:///p/Inbox?number=2",
      false,
    ],
  ];
  for (const [url, msgURL, expected] of cases) {
    Assert.equal(
      ComposeUtils.isURLOfMessage(url, msgURL),
      expected,
      `${url} should ${expected ? "" : "not "}be considered part of ${msgURL}`
    );
  }
});
