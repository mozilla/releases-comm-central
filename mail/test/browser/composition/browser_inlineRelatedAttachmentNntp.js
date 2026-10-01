/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MessageGenerator, SyntheticPartMultiRelated, SyntheticPartLeaf } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
  );
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const {
  close_compose_window,
  open_compose_from_draft,
  open_compose_with_forward,
  save_compose_message,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
const {
  assert_selected_and_displayed,
  be_in_folder,
  get_about_message,
  get_special_folder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { wait_for_notification_to_show } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);

const GROUP = "test.inlinerelated";
const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFUlEQVQI12P8z8AARAjAxIAGCAsAAIPRAgYARhzoAAAAAElFTkSuQmCC";

let nntpAccount, newsFolder, draftsFolder;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.forward_message_mode", 2]],
  });

  const [nntpServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.nntp.plain,
  ]);
  nntpServer.addGroup(GROUP);
  nntpServer.addMessages(GROUP, [makeMessage()]);

  nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "test.test",
    "nntp"
  );
  nntpAccount.incomingServer.port = 119;
  const rootFolder = nntpAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder(GROUP, null);
  newsFolder = rootFolder.getChildNamed(GROUP);
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  nntpAccount.incomingServer.getNewMessages(
    newsFolder,
    window.msgWindow,
    urlListener
  );
  await urlListener.promise;

  draftsFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(nntpAccount, false);
  });
});

/**
 * Test that inline related attachments of a news message are embedded when
 * forwarding it inline, and are retained when the forward is saved as a draft
 * and opened again.
 */
add_task(async function test_forward_keeps_inline_related_attachment() {
  await be_in_folder(newsFolder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);
  checkPreviewImage();

  const cwc = await open_compose_with_forward();
  await waitForEmbeddedImage(cwc);

  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await be_in_folder(draftsFolder);
  const draftMsg = await select_click_row(0);
  await assert_selected_and_displayed(window, draftMsg);
  await wait_for_notification_to_show(
    get_about_message(),
    "mail-notification-top",
    "draftMsgContent"
  );
  checkPreviewImage();

  const reopenedCwc = await open_compose_from_draft();
  await waitForEmbeddedImage(reopenedCwc);
  await close_compose_window(reopenedCwc);
});

function checkPreviewImage() {
  const messageDoc =
    get_about_message().document.getElementById("messagepane").contentDocument;
  const imgElement = messageDoc.getElementById("embeddedImage");
  Assert.ok(!!imgElement, "img element should be in preview display.");
  Assert.greater(imgElement.naturalWidth, 0, "img element should have width.");
  Assert.greater(
    imgElement.naturalHeight,
    0,
    "img element should have height."
  );
}

async function waitForEmbeddedImage(cwc) {
  let images;
  await TestUtils.waitForCondition(() => {
    images = cwc.document
      .getElementById("messageEditor")
      .contentDocument?.getElementsByTagName("img");
    return images?.[0]?.getAttribute("src").startsWith("data:image/png");
  }, "Waiting for the image to be embedded.");
  Assert.equal(images.length, 1, "Should be one embedded image.");
}

function makeMessage() {
  const htmlPart = new SyntheticPartLeaf(
    `<html>
<body>
<p>Check out this <strong>image</strong>!</p>
<img id="embeddedImage" src="cid:image1@embedded.invalid" alt="Embedded Image"/>
</body>
</html>
`,
    { contentType: "text/html; charset=UTF-8" }
  );
  const imagePart = new SyntheticPartLeaf(imageData, {
    contentType: "image/png; name=test.png",
    contentId: "image1@embedded.invalid",
    encoding: "base64",
    disposition: "inline",
  });
  return new MessageGenerator().makeMessage({
    from: ["Sender", "sender@example.invalid"],
    subject: "Test with Embedded Image",
    bodyPart: new SyntheticPartMultiRelated([htmlPart, imagePart], {
      contentType: "multipart/related",
    }),
  });
}
