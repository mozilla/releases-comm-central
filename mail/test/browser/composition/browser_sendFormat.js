/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests resulting send format of a message dependent on using HTML features
 * in the composition.
 */

"use strict";

requestLongerTimeout(4);

var {
  open_compose_from_draft,
  open_compose_new_mail,
  open_compose_with_reply,
  FormatHelper,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");

var {
  be_in_folder,
  empty_folder,
  get_special_folder,
  get_about_message,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var sendFormatPreference;
var htmlAsPreference;
var draftsFolder;
var outboxFolder;

add_setup(async () => {
  sendFormatPreference = Services.prefs.getIntPref("mail.default_send_format");
  htmlAsPreference = Services.prefs.getIntPref("mailnews.display.html_as");
  // Show all parts to a message in the message display.
  // This allows us to see if a message contains both a plain text and a HTML
  // part.
  Services.prefs.setIntPref("mailnews.display.html_as", 4);
  draftsFolder = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
  outboxFolder = await get_special_folder(Ci.nsMsgFolderFlags.Queue, true);
});

registerCleanupFunction(async function () {
  Services.prefs.setIntPref("mail.default_send_format", sendFormatPreference);
  Services.prefs.setIntPref("mailnews.display.html_as", htmlAsPreference);
  await empty_folder(draftsFolder);
  await empty_folder(outboxFolder);
});

async function checkMsgFile(aFilePath, aConvertibility) {
  const file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
  const messageWin = await open_message_from_file(file);

  // Creating a reply should not affect convertibility.
  const composeWindow = await open_compose_with_reply(messageWin);

  Assert.equal(composeWindow.gMsgCompose.bodyConvertible(), aConvertibility);

  await BrowserTestUtils.closeWindow(composeWindow);
  await BrowserTestUtils.closeWindow(messageWin);
}

/**
 * Tests nodeTreeConvertible() can be called from JavaScript.
 */
add_task(async function test_msg_nodeTreeConvertible() {
  const msgCompose = Cc[
    "@mozilla.org/messengercompose/compose;1"
  ].createInstance(Ci.nsIMsgCompose);

  const textDoc = new DOMParser().parseFromString(
    "<p>Simple Text</p>",
    "text/html"
  );
  Assert.equal(
    msgCompose.nodeTreeConvertible(textDoc.documentElement),
    Ci.nsIMsgCompConvertible.Plain
  );

  const htmlDoc = new DOMParser().parseFromString(
    '<p>Complex <span style="font-weight: bold">Text</span></p>',
    "text/html"
  );
  Assert.equal(
    msgCompose.nodeTreeConvertible(htmlDoc.documentElement),
    Ci.nsIMsgCompConvertible.No
  );
});

/**
 * Tests that we only open one compose window for one instance of a draft.
 */
add_task(async function test_msg_convertibility() {
  await checkMsgFile("./format1-plain.eml", Ci.nsIMsgCompConvertible.Plain);

  // Bug 1385636
  await checkMsgFile(
    "./format1-altering.eml",
    Ci.nsIMsgCompConvertible.Altering
  );

  // Bug 584313
  await checkMsgFile("./format2-style-attr.eml", Ci.nsIMsgCompConvertible.No);
  await checkMsgFile("./format3-style-tag.eml", Ci.nsIMsgCompConvertible.No);
});

/**
 * Map from a nsIMsgCompSendFormat to the id of the corresponding menuitem in
 * the Options, Send Format menu.
 *
 * @type {Map<nsIMsgCompSendFormat, string>}
 */
var sendFormatToMenuitem = new Map([
  [Ci.nsIMsgCompSendFormat.PlainText, "format_plain"],
  [Ci.nsIMsgCompSendFormat.HTML, "format_html"],
  [Ci.nsIMsgCompSendFormat.Both, "format_both"],
  [Ci.nsIMsgCompSendFormat.Auto, "format_auto"],
]);

/**
 * Verify that the correct send format menu item is checked.
 *
 * @param {Window} composeWindow - The compose window.
 * @param {nsIMsgCompSendFormat} expectFormat - The expected checked format
 *   option. Either Auto, PlainText, HTML, or Both.
 * @param {string} msg - A message to use in assertions.
 */
function assertSendFormatInMenu(composeWindow, expectFormat, msg) {
  for (const [format, menuitemId] of sendFormatToMenuitem.entries()) {
    const menuitem = composeWindow.document.getElementById(menuitemId);
    const checked = expectFormat == format;
    Assert.equal(
      menuitem.getAttribute("checked") == "true",
      checked,
      `${menuitemId} should ${checked ? "not " : ""}be checked: ${msg}`
    );
  }
}

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
  assertSendFormatInMenu(
    composeWindow,
    preference,
    "Send format should initially match preference"
  );

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
 * Set the send format to something else via the application menu.
 *
 * @param {Window} composeWindow - The compose window to set the format in.
 * @param {nsIMsgCompSendFormat} sendFormat - The send format to set. Either
 *   Auto, PlainText, HTML, or Both.
 */
async function setSendFormat(composeWindow, sendFormat) {
  async function openMenu(menu) {
    const openPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    menu.openMenu(true);
    await openPromise;
  }
  const optionsMenu = composeWindow.document.getElementById("optionsMenu");
  const sendFormatMenu =
    composeWindow.document.getElementById("outputFormatMenu");
  const menuitem = composeWindow.document.getElementById(
    sendFormatToMenuitem.get(sendFormat)
  );

  await openMenu(optionsMenu);
  await openMenu(sendFormatMenu);

  const closePromise = BrowserTestUtils.waitForEvent(
    optionsMenu,
    "popuphidden"
  );
  sendFormatMenu.menupopup.activateItem(menuitem);
  await closePromise;
  assertSendFormatInMenu(
    composeWindow,
    sendFormat,
    "Send format should change to the selected format"
  );
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

  // Send later.
  const closePromise = BrowserTestUtils.windowClosed(composeWindow);
  EventUtils.synthesizeKey(
    "KEY_Enter",
    { accelKey: true, shiftKey: true },
    composeWindow
  );
  await closePromise;

  // Open the "sent" message.
  await be_in_folder(outboxFolder);
  // Should be the last message in the tree.
  await select_click_row(0);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test that the sent content type is either text/plain, text/html or
  // multipart/alternative.
  // TODO: Is there a better way to expose the content-type of the displayed
  // message?
  const contentType =
    get_about_message().currentHeaderData["content-type"].headerValue;
  if (plain && html) {
    Assert.ok(
      contentType.startsWith("multipart/alternative"),
      `Sent contentType "${contentType}" should be multipart: ${msg}`
    );
  } else if (plain) {
    Assert.ok(
      contentType.startsWith("text/plain"),
      `Sent contentType "${contentType}" should be plain text only: ${msg}`
    );
  } else if (html) {
    Assert.ok(
      contentType.startsWith("text/html"),
      `Sent contentType "${contentType}" should be html only: ${msg}`
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
      BrowserTestUtils.is_visible(plainBody),
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
      BrowserTestUtils.is_visible(htmlBody),
      `HTML part should be visible: ${msg}`
    );
    Assert.equal(
      htmlBody.textContent.trim(),
      isBold ? BOLD_MESSAGE_BODY : PLAIN_MESSAGE_BODY,
      `HTML text content should match: ${msg}`
    );
  }
}

async function saveDraft(composeWindow) {
  const oldDraftsCounts = draftsFolder.getTotalMessages(false);
  // Save as draft.
  EventUtils.synthesizeKey("s", { accelKey: true }, composeWindow);
  await TestUtils.waitForCondition(
    () => composeWindow.gSaveOperationInProgress,
    "Should start save operation"
  );
  await TestUtils.waitForCondition(
    () => !composeWindow.gSaveOperationInProgress && !composeWindow.gWindowLock,
    "Waiting for the save operation to complete"
  );
  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) > oldDraftsCounts,
    "message saved to drafts folder"
  );
  await BrowserTestUtils.closeWindow(composeWindow);
}

async function assertDraftFormat(expectSavedFormat) {
  await be_in_folder(draftsFolder);
  await select_click_row(0);

  const newComposeWindow = await open_compose_from_draft();
  assertSendFormatInMenu(
    newComposeWindow,
    expectSavedFormat,
    "Send format of the opened draft should match the saved format"
  );
  return newComposeWindow;
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
    await assertSentMessage(
      composeWindow,
      { plain: sendsPlain, html: sendsHtml, isBold: true },
      `Bold message with preference ${preference}`
    );
  }
});

add_task(async function test_setting_send_format() {
  for (const { preference, sendFormat, boldMessage, sendsPlain, sendsHtml } of [
    {
      preference: Ci.nsIMsgCompSendFormat.Auto,
      boldMessage: true,
      sendFormat: Ci.nsIMsgCompSendFormat.HTML,
      sendsPlain: false,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.Auto,
      boldMessage: true,
      sendFormat: Ci.nsIMsgCompSendFormat.PlainText,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.PlainText,
      boldMessage: false,
      sendFormat: Ci.nsIMsgCompSendFormat.Both,
      sendsPlain: true,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.HTML,
      boldMessage: false,
      sendFormat: Ci.nsIMsgCompSendFormat.Auto,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.Both,
      boldMessage: false,
      sendFormat: Ci.nsIMsgCompSendFormat.HTML,
      sendsPlain: false,
      sendsHtml: true,
    },
  ]) {
    info(
      `Testing changing format from preference ${preference} to ${sendFormat}`
    );
    const composeWindow = await newMessage(preference, boldMessage);
    await setSendFormat(composeWindow, sendFormat);
    await assertSentMessage(
      composeWindow,
      { isBold: boldMessage, plain: sendsPlain, html: sendsHtml },
      `${boldMessage ? "Bold" : "Plain"} message set as ${sendFormat}`
    );
  }
}).__skipMe = AppConstants.platform == "macosx";
// Can't click menu bar on Mac to change the send format.

add_task(async function test_saving_draft_with_set_format() {
  for (const { preference, sendFormat, sendsPlain, sendsHtml } of [
    {
      preference: Ci.nsIMsgCompSendFormat.Auto,
      sendFormat: Ci.nsIMsgCompSendFormat.PlainText,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.PlainText,
      sendFormat: Ci.nsIMsgCompSendFormat.Auto,
      sendsPlain: true,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.Both,
      sendFormat: Ci.nsIMsgCompSendFormat.HTML,
      sendsPlain: false,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.HTML,
      sendFormat: Ci.nsIMsgCompSendFormat.Both,
      sendsPlain: true,
      sendsHtml: true,
    },
  ]) {
    info(`Testing draft saved as ${sendFormat}`);
    let composeWindow = await newMessage(preference, true);
    await setSendFormat(composeWindow, sendFormat);
    await saveDraft(composeWindow);
    // Draft keeps the set format when opened.
    composeWindow = await assertDraftFormat(sendFormat);
    await assertSentMessage(
      composeWindow,
      { isBold: true, plain: sendsPlain, html: sendsHtml },
      `Bold draft message set as ${sendFormat}`
    );
  }
}).__skipMe = AppConstants.platform == "macosx";
// Can't click menu bar on Mac to change the send format.

add_task(async function test_saving_draft_with_new_preference() {
  for (const { preference, newPreference, sendsPlain, sendsHtml } of [
    {
      preference: Ci.nsIMsgCompSendFormat.Auto,
      newPreference: Ci.nsIMsgCompSendFormat.HTML,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.PlainText,
      newPreference: Ci.nsIMsgCompSendFormat.Both,
      sendsPlain: true,
      sendsHtml: false,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.Both,
      newPreference: Ci.nsIMsgCompSendFormat.Auto,
      sendsPlain: true,
      sendsHtml: true,
    },
    {
      preference: Ci.nsIMsgCompSendFormat.HTML,
      newPreference: Ci.nsIMsgCompSendFormat.PlainText,
      sendsPlain: false,
      sendsHtml: true,
    },
  ]) {
    info(`Testing changing preference from ${preference} to ${newPreference}`);
    let composeWindow = await newMessage(preference, false);
    await saveDraft(composeWindow);
    // Re-open, with a new default preference set, to make sure the draft has
    // the send format set earlier saved in its headers.
    Services.prefs.setIntPref("mail.default_send_format", newPreference);
    // Draft keeps the old preference.
    composeWindow = await assertDraftFormat(preference);
    await assertSentMessage(
      composeWindow,
      { isBold: false, plain: sendsPlain, html: sendsHtml },
      `Plain draft message with preference ${preference}`
    );
  }
});
