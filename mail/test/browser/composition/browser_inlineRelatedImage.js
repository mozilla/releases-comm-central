/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  close_compose_window,
  get_msg_source,
  open_compose_from_draft,
  open_compose_new_mail,
  open_compose_with_edit_as_new,
  open_compose_with_forward,
  open_compose_with_reply,
  save_compose_message,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
const {
  assert_selected_and_displayed,
  be_in_folder,
  get_about_message,
  get_special_folder,
  press_delete,
  select_click_row,
  wait_for_blank_content_pane,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { wait_for_notification_to_show } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);
const { MimeParser } = ChromeUtils.importESModule(
  "resource:///modules/mimeParser.sys.mjs"
);

const IMAGE_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAYAAAAGCAIAAABvrngfAAAAFklEQVQImWMwjWhCQwxECoW3oCHihAB0LyYv5/oAHwAAAABJRU5ErkJggg==";
let draftsFolder;
let savedSource;

add_setup(async function () {
  draftsFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/** Check the loaded pixels and the bytes, rather than attachment visibility. */
async function checkImage(win, operation) {
  let image;
  await TestUtils.waitForCondition(() => {
    image = win.document
      .getElementById("messageEditor")
      .contentDocument.querySelector("img");
    return image;
  }, `${operation} should insert the inline image`);
  Assert.ok(image, `${operation} should retain the inline image`);
  await TestUtils.waitForCondition(
    () => image.complete,
    `${operation} image should finish loading`
  );
  info(
    `${operation}: ${JSON.stringify({
      src: image.getAttribute("src"),
      resolvedSrc: image.src,
      doNotSend: image.getAttribute("moz-do-not-send"),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    })}`
  );
  Assert.equal(
    image.naturalWidth,
    6,
    `${operation} image should load its width`
  );
  Assert.equal(
    image.naturalHeight,
    6,
    `${operation} image should load its height`
  );
  Assert.notEqual(
    image.getAttribute("moz-do-not-send"),
    "true",
    `${operation} should allow sending the original inline image`
  );
  Assert.ok(
    image.src.startsWith("data:image/png"),
    `${operation} should embed the image`
  );
  Assert.equal(
    image.src.split(";base64,")[1],
    IMAGE_DATA,
    `${operation} should preserve the PNG bytes`
  );
}

add_task(async function test_pasted_image_reconstruction() {
  const win = await open_compose_new_mail();
  await setup_msg_contents(
    win,
    "someone@example.com",
    "Pasted inline image",
    "An image pasted from a bitmap transferable:\n"
  );

  // Exercise the editor's bitmap paste path, as used by native image clipboards.
  const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
    Ci.nsIStringInputStream
  );
  stream.setByteStringData(atob(IMAGE_DATA));
  const transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  transferable.init(null);
  transferable.setTransferData("image/png", stream);
  win.document.getElementById("messageEditor").focus();
  win
    .GetCurrentEditor()
    .QueryInterface(Ci.nsIHTMLEditor)
    .pasteTransferable(transferable);
  await checkImage(win, "Paste");

  await save_compose_message(win);
  await close_compose_window(win);
  await be_in_folder(draftsFolder);
  const draft = await select_click_row(0);
  await assert_selected_and_displayed(window, draft);

  const source = await get_msg_source(draft);
  savedSource = source;
  const headers = new Map();
  const bodies = new Map();
  MimeParser.parseSync(
    source,
    {
      startPart(part, partHeaders) {
        headers.set(part, partHeaders);
        bodies.set(part, "");
      },
      deliverPartData(part, data) {
        bodies.set(part, bodies.get(part) + data);
      },
    },
    { bodyformat: "decode", strformat: "binarystring" }
  );
  Assert.equal(
    headers.get("").contentType.type,
    "multipart/related",
    "The draft should contain related parts"
  );
  Assert.equal(
    headers.get("1").contentType.type,
    "text/html",
    "The draft should contain an HTML body"
  );
  Assert.equal(
    headers.get("2").contentType.type,
    "image/png",
    "The draft should contain a PNG part"
  );
  Assert.equal(
    headers.get("2").get("Content-Transfer-Encoding"),
    "base64",
    "The PNG should be base64 encoded"
  );
  Assert.ok(
    headers
      .get("2")
      .getRawHeader("Content-Disposition")[0]
      .startsWith("inline; filename="),
    "The PNG should have an inline disposition and filename"
  );
  Assert.ok(
    !headers.get("2").has("Content-Location"),
    "The pasted PNG should be identified by its CID"
  );
  const cid = headers.get("2").getRawHeader("Content-ID")[0].slice(1, -1);
  Assert.ok(
    bodies.get("1").includes(`src="cid:${cid}"`),
    "The HTML should reference the PNG's CID"
  );
  Assert.equal(
    btoa(bodies.get("2")),
    IMAGE_DATA,
    "The saved draft should preserve the PNG bytes"
  );
  info(`PNG headers: ${JSON.stringify([...headers.get("2")])}`);

  const preview = get_about_message()
    .document.getElementById("messagepane")
    .contentDocument.querySelector("img");
  await TestUtils.waitForCondition(
    () => preview.complete,
    "The preview image should finish loading"
  );
  Assert.equal(
    preview.naturalWidth,
    6,
    "The preview image should load its width"
  );
  Assert.equal(
    preview.naturalHeight,
    6,
    "The preview image should load its height"
  );
  info(`Preview src: ${preview.src}`);

  await wait_for_notification_to_show(
    get_about_message(),
    "mail-notification-top",
    "draftMsgContent"
  );
  const uri = draftsFolder.getUriForMsg(draft);
  const messageURL = MailServices.messageServiceFromURI(uri).getUrlForUri(uri);
  for (const [operation, open] of [
    ["Draft", open_compose_from_draft],
    ["Reply", open_compose_with_reply],
    ["Forward", open_compose_with_forward],
    ["Edit as New", open_compose_with_edit_as_new],
  ]) {
    const compose = await open();
    // Replies are quoted directly into the editor. The other operations first
    // reconstruct the body in compose fields, including the source-part URL.
    if (operation != "Reply") {
      const body = new compose.DOMParser().parseFromString(
        compose.gMsgCompose.compFields.body,
        "text/html"
      );
      const src = body.querySelector("img").getAttribute("src");
      info(`${operation} reconstructed src: ${src}`);
      Assert.ok(
        src.startsWith(`${messageURL.spec}&`),
        `${operation} should reference the original folder and message key`
      );
      Assert.equal(
        new URLSearchParams(Services.io.newURI(src).query).get("part"),
        "1.2",
        `${operation} should reference the PNG part`
      );
    }
    await checkImage(compose, operation);
    Assert.equal(
      compose.document.getElementById("attachmentBucket").itemCount,
      0,
      `${operation} should keep the image inline`
    );
    await close_compose_window(compose);
  }
  await press_delete();
});

add_task(async function test_imap_image_reconstruction() {
  const { ServerTestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
  );
  const [server] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.imap.plain,
  ]);
  await server.addMessages("INBOX", [savedSource]);
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "tinderbox@foo.invalid";
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "imap"
  );
  account.incomingServer.password = "password";
  registerCleanupFunction(async () => {
    // Clear the displayed IMAP URI while its account still exists.
    await be_in_folder(draftsFolder);
    await wait_for_blank_content_pane();
    Assert.equal(
      get_about_message().getMessagePaneBrowser().currentURI.spec,
      "about:blank",
      "The IMAP message should be cleared before removing its account"
    );
    account.incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
  });
  const inbox = account.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  await server.addMessages(inbox, [], true);
  await be_in_folder(inbox);
  const message = await select_click_row(0);
  await assert_selected_and_displayed(window, message);
  const uri = inbox.getUriForMsg(message);
  const service = MailServices.messageServiceFromURI(uri);
  const messageURL = service.getUrlForUri(uri);
  for (const [operation, open] of [
    ["IMAP Forward", open_compose_with_forward],
    ["IMAP Edit as New", open_compose_with_edit_as_new],
  ]) {
    const compose = await open();
    const body = new compose.DOMParser().parseFromString(
      compose.gMsgCompose.compFields.body,
      "text/html"
    );
    const src = body.querySelector("img").getAttribute("src");
    info(`${operation} reconstructed src: ${src}`);
    Assert.ok(
      src.startsWith(`${messageURL.spec}?`),
      `${operation} should reference the original IMAP message`
    );
    await checkImage(compose, operation);
    await close_compose_window(compose);
  }
});
