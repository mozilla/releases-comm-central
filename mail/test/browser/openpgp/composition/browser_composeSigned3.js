/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for OpenPGP unobtrusive signed message composition.
 *
 * Derived from browser_sendFormat.js and browser_composeSigned.js
 */

"use strict";

const { getMimeTree } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/MimeTree.sys.mjs"
);

const { MimeParser } = ChromeUtils.importESModule(
  "resource:///modules/mimeParser.sys.mjs"
);

const {
  assert_selected_and_displayed,
  be_in_folder,
  empty_folder,
  get_about_message,
  get_special_folder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { FormatHelper, get_msg_source, open_compose_new_mail, send_later } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let bobAcct;
let bobIdentity;
let gOutbox;

const aboutMessage = get_about_message();
const unobSigPrefName = "mail.openpgp.clear_signature_format";

async function waitCheckEncryptionStateDone(win) {
  return BrowserTestUtils.waitForEvent(
    win.document,
    "encryption-state-checked"
  );
}

var sendFormatPreference;
var htmlAsPreference;
var draftsFolder;
var outboxFolder;

/**
 * Setup a mail account with a private key and import the public key for the
 * receiver.
 */
add_setup(async function () {
  Services.prefs.setStringPref(unobSigPrefName, "unobtrusive");

  bobAcct = MailServices.accounts.createAccount();
  bobAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "imap"
  );
  bobIdentity = MailServices.accounts.createIdentity();
  bobIdentity.email = "bob@openpgp.example";
  bobAcct.addIdentity(bobIdentity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );

  Assert.ok(id, "private key id received");

  bobIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/alice@openpgp.example-0xf231550c4f47e38e-pub.asc"
      )
    )
  );

  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc"
      )
    )
  );

  gOutbox = await get_special_folder(Ci.nsMsgFolderFlags.Queue);

  sendFormatPreference = Services.prefs.getIntPref("mail.default_send_format");
  htmlAsPreference = Services.prefs.getIntPref("mailnews.display.html_as");
  // Show all parts to a message in the message display.
  // This allows us to see if a message contains both a plain text and a HTML
  // part.
  Services.prefs.setIntPref("mailnews.display.html_as", 4);
  draftsFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
  outboxFolder = await get_special_folder(Ci.nsMsgFolderFlags.Queue, true);
});

const PLAIN_MESSAGE_BODY = "Plain message body";
const BOLD_MESSAGE_BODY = "Bold message body";
const BOLD_MESSAGE_BODY_AS_PLAIN = `*${BOLD_MESSAGE_BODY}*`;

/**
 * Set the default send format and create a new message in the compose window.
 *
 * @param {nsIMsgCompSendFormat} preference - The default send format to set via
 *   a preference before opening the window.
 * @param {boolean} useBold - Whether to use bold text in the message's body.
 *
 * @returns {Window} - The opened compose window, pre-filled with a message.
 */
async function newMessage(preference, useBold) {
  Services.prefs.setIntPref("mail.default_send_format", preference);

  const composeWindow = await open_compose_new_mail();

  // Focus should be on "To" field.
  EventUtils.sendString("recipient@server.net", composeWindow);
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Enter", {}, composeWindow);
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Enter", {}, composeWindow);
  await TestUtils.waitForTick();
  // Focus should be in the "Subject" field.
  EventUtils.sendString(
    `${useBold ? "rich" : "plain"} message with preference ${preference}`,
    composeWindow
  );
  await TestUtils.waitForTick();
  EventUtils.synthesizeKey("KEY_Enter", {}, composeWindow);
  await TestUtils.waitForTick();

  // Focus should be in the body.
  const formatHelper = new FormatHelper(composeWindow);
  if (useBold) {
    EventUtils.synthesizeMouseAtCenter(
      formatHelper.boldButton,
      {},
      composeWindow
    );
    await TestUtils.waitForTick();
    await formatHelper.typeInMessage(BOLD_MESSAGE_BODY);
  } else {
    await formatHelper.typeInMessage(PLAIN_MESSAGE_BODY);
  }

  return composeWindow;
}

/**
 * Verify the actual sent message of a composed message.
 *
 * @param {Window} composeWindow - The compose window that contains the message
 *   we want to send.
 * @param {object} expectMessage - The expected sent message.
 * @param {boolean} expectMessage.isBold - Whether the message uses a bold
 *   message, rather than the plain message.
 * @param {boolean} expectMessage.plain - Whether the message has a plain part.
 * @param {boolean} expectMessage.html - Whether the message has a html part.
 * @param {string} msg - A message to use in assertions.
 */
async function assertSentMessage(composeWindow, expectMessage, msg) {
  const { isBold, plain, html } = expectMessage;

  await send_later(composeWindow);

  // Open the "sent" message.
  await be_in_folder(outboxFolder);
  // Should be the last message in the tree.
  const clickedMessage = await select_click_row(0);

  // The following delay was taken from origin browser_sendFormat.js
  // Without it, the code below selects the wrong message.

  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  await assert_selected_and_displayed(0);

  // signed unobtrusive wraps the payload message in multipart/mixed,
  // we must fetch the part that's one level below.

  const src = await get_msg_source(clickedMessage);
  const tree = getMimeTree(src, false);
  const signedPayloadCT = tree.subParts[0].fullContentType;

  // Ensure there is RFC 9788 parameter hp=clear
  const ctParsed = MimeParser.parseHeaderField(
    signedPayloadCT,
    MimeParser.HEADER_PARAMETER
  );

  const hpParameter = ctParsed.get("hp");
  Assert.equal(hpParameter, "clear");

  // Test that the sent content type is either text/plain, text/html or
  // multipart/alternative.

  if (plain && html) {
    Assert.ok(
      signedPayloadCT.startsWith("multipart/alternative"),
      `Sent nested contentType "${signedPayloadCT}" should be multipart: ${msg}`
    );
  } else if (plain) {
    Assert.ok(
      signedPayloadCT.startsWith("text/plain"),
      `Sent nested contentType "${signedPayloadCT}" should be plain text only: ${msg}`
    );
  } else if (html) {
    Assert.ok(
      signedPayloadCT.startsWith("text/html"),
      `Sent nested contentType "${signedPayloadCT}" should be html only: ${msg}`
    );
  } else {
    throw new Error("Expected message is missing either plain or html parts");
  }

  // Assert the html and plain text parts are either hidden or shown.
  // NOTE: We have set the mailnews.display.html_as preference to show all parts
  // of the message, which means it will show both the plain text and html parts
  // if both were sent.
  const messageBody =
    get_about_message().document.getElementById("messagepane").contentDocument
      .body;

  const plainBody = messageBody.querySelector(".moz-text-flowed");
  const htmlBody = messageBody.querySelector(".moz-text-html");
  Assert.equal(
    !!plain,
    !!plainBody,
    `Message should ${plain ? "" : "not "}have a Plain part: ${msg}`
  );
  Assert.equal(
    !!html,
    !!htmlBody,
    `Message should ${html ? "" : "not "}have a HTML part: ${msg}`
  );

  if (plain) {
    Assert.ok(
      BrowserTestUtils.isVisible(plainBody),
      `Plain part should be visible: ${msg}`
    );
    Assert.equal(
      plainBody.textContent.trim(),
      isBold ? BOLD_MESSAGE_BODY_AS_PLAIN : PLAIN_MESSAGE_BODY,
      `Plain text content should match: ${msg}`
    );
  }

  if (html) {
    Assert.ok(
      BrowserTestUtils.isVisible(htmlBody),
      `HTML part should be visible: ${msg}`
    );
    Assert.equal(
      htmlBody.textContent.trim(),
      isBold ? BOLD_MESSAGE_BODY : PLAIN_MESSAGE_BODY,
      `HTML text content should match: ${msg}`
    );
  }
}

add_task(async function test_preference_send_format() {
  // Sending a plain message.
  for (const { preference, sendsPlain, sendsHtml } of [
    {
      preference: Ci.nsIMsgCompSendFormat.Auto,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.PlainText,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.HTML,
      sendsPlain: false,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.Both,
      sendsPlain: true,
      sendsHtml: true,
    },
  ]) {
    info(`Testing preference ${preference} with a plain message`);
    const composeWindow = await newMessage(preference, false);

    await OpenPGPTestUtils.toggleMessageSigning(composeWindow);
    await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWindow);

    await assertSentMessage(
      composeWindow,
      { plain: sendsPlain, html: sendsHtml, isBold: false },
      `Plain message with preference ${preference}`
    );
  }
  // Sending a bold message.
  for (const { preference, sendsPlain, sendsHtml } of [
    {
      preference: Ci.nsIMsgCompSendFormat.Auto,
      sendsPlain: true,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.PlainText,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.HTML,
      sendsPlain: false,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.Both,
      sendsPlain: true,
      sendsHtml: true,
    },
  ]) {
    info(`Testing preference ${preference} with a bold message`);
    const composeWindow = await newMessage(preference, true);

    await OpenPGPTestUtils.toggleMessageSigning(composeWindow);
    await OpenPGPTestUtils.toggleMessageKeyAttachment(composeWindow);

    await assertSentMessage(
      composeWindow,
      { plain: sendsPlain, html: sendsHtml, isBold: true },
      `Bold message with preference ${preference}`
    );
  }
});

registerCleanupFunction(async function tearDown() {
  Services.prefs.clearUserPref("openpgp_key_id");
  await OpenPGPTestUtils.removeKeyById("0xfbfcc82a015e7330", true);
  MailServices.accounts.removeIncomingServer(bobAcct.incomingServer, true);
  MailServices.accounts.removeAccount(bobAcct, true);

  Services.prefs.clearUserPref(unobSigPrefName);
  Services.prefs.setIntPref("mail.default_send_format", sendFormatPreference);
  Services.prefs.setIntPref("mailnews.display.html_as", htmlAsPreference);
  await empty_folder(draftsFolder);
  await empty_folder(outboxFolder);
});
