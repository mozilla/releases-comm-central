/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MessageGenerator, SyntheticPartMultiRelated, SyntheticPartLeaf } =
  ChromeUtils.importESModule(
    "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
  );

const { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

const { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

const { open_compose_with_forward, save_compose_message } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
const { close_compose_window, open_compose_from_draft } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

const {
  be_in_folder,
  get_about_message,
  get_special_folder,
  make_display_unthreaded,
  select_click_row,
  assert_selected_and_displayed,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { wait_for_notification_to_show } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let ewsServer = null;
let incomingServer = null;
let ewsAccount = null;

add_setup(async function () {
  ewsServer = new EwsServer({
    version: "Exchange2013",
    username: "user",
    password: "password",
  });
  ewsServer.start();

  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );

  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  incomingServer.prettyName = "EWS Account";
  incomingServer.password = "password";

  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "ews://127.0.0.1",
    null,
    "ews://127.0.0.1",
    "user",
    "password",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  ewsAccount = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "sender@example.invalid"; // matches the draft's From:
  ewsAccount.addIdentity(identity);
  ewsAccount.incomingServer = incomingServer;
  MailServices.accounts.defaultAccount = ewsAccount;

  registerCleanupFunction(async function () {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    await Services.logins.removeAllLoginsAsync();
    MailServices.accounts.removeAccount(ewsAccount, false);
  });

  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, null);
  await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed("Drafts"),
    "Waiting for Drafts folder to exist."
  );
});

async function syncFolder(folder) {
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(folder, null, asyncUrlListener);
  return asyncUrlListener.promise;
}

/**
 * Test that inline related attachments are retained when composing a new message
 * from a draft saved with the EWS protocol.
 */
add_task(async function test_draft_keeps_inline_related_attachment() {
  const draftsFolder = incomingServer.rootFolder.getChildNamed("Drafts");

  info(draftsFolder.name);

  const message = makeMessage();
  ewsServer.addItemToFolder("id-1", "drafts", message);

  await syncFolder(draftsFolder);

  Assert.equal(
    draftsFolder.getTotalMessages(false),
    1,
    "There should be a draft."
  );

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
  await waitForContent(cwc);
  checkImageContent(cwc);

  // Save the draft
  await save_compose_message(cwc);
  await close_compose_window(cwc);

  await syncFolder(draftsFolder);

  const draftMsgReopened = await select_click_row(0);
  await assert_selected_and_displayed(window, draftMsgReopened);
  await wait_for_notification_to_show(
    get_about_message(),
    "mail-notification-top",
    "draftMsgContent"
  );

  // Check image in the preview.
  const messageDoc =
    get_about_message().document.getElementById("messagepane").contentDocument;
  const imgElement = messageDoc.getElementById("embeddedImage");
  Assert.ok(!!imgElement, "img element should be in preview display.");
  Assert.greater(
    imgElement.naturalHeight,
    0,
    "img element should have height."
  );
  Assert.greater(imgElement.naturalWidth, 0, "img element should have width.");

  const reopenedCwc = await open_compose_from_draft();
  await waitForContent(reopenedCwc);
  checkImageContent(reopenedCwc);

  await close_compose_window(reopenedCwc);
});

async function waitForContent(cwc) {
  await TestUtils.waitForCondition(() => {
    return cwc.document.getElementById("messageEditor").contentDocument;
  }, "Waiting for draft content to load.");
}

function checkImageContent(cwc) {
  const image = cwc.document
    .getElementById("messageEditor")
    .contentDocument.getElementsByTagName("img");
  Assert.equal(image.length, 1, "Should be one embedded image.");
  const imgSrc = image[0].getAttribute("src");
  info(`imgSrc = ${imgSrc}`);
  Assert.ok(
    image[0].getAttribute("src").startsWith("data:image/png"),
    "Image should be embedded."
  );
}

function makeMessage() {
  const generator = new MessageGenerator();

  // Create the HTML body part
  const htmlBody = `
<html>
<head><title>Test Email</title></head>
<body>
<h1>Hello World</h1>
<p>Check out this <strong>image</strong>!</p>
<img id="embeddedImage" src="cid:image1@embedded.invalid" alt="Embedded Image"/>
</body>
</html>
`;

  const htmlPart = new SyntheticPartLeaf(htmlBody, {
    contentType: "text/html; charset=UTF-8",
  });

  // Create the embedded image (as a synthetic part)
  const imagePart = new SyntheticPartLeaf(imageData, {
    contentType: "image/png; name=test.png",
    contentId: "image1@embedded.invalid", // Required for embedding!
    encoding: "base64",
    disposition: "inline",
  });

  // Create the multipart/related message
  const relatedPart = new SyntheticPartMultiRelated([htmlPart, imagePart], {
    contentType: "multipart/related",
  });

  // Create the full message
  const message = generator.makeMessage({
    from: ["Sender", "sender@example.invalid"],
    to: ["Recipient", "recipient@example.invalid"],
    subject: "Test with Embedded Image",
    bodyPart: relatedPart,
  });

  return message;
}

const imageData =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAC4jAAAuIwF4pT92AAAAFUlEQVQI12P8z8AARAjAxIAGCAsAAIPRAgYARhzoAAAAAElFTkSuQmCC";
