/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that actions such as replying to an .eml works properly.
 */

"use strict";

var {
  close_compose_window,
  compose_window_ready,
  get_compose_body,
  open_compose_with_forward,
  open_compose_with_reply,
  save_compose_message,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var {
  be_in_folder,
  get_about_message,
  get_special_folder,
  open_message_from_file,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var gDrafts;

add_setup(async function () {
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Test that replying to an opened .eml message works, and that the reply can
 * be saved as a draft.
 */
add_task(async function test_reply_to_eml_save_as_draft() {
  // Open an .eml file.
  const file = new FileUtils.File(getTestFilePath("data/testmsg.eml"));
  const msgc = await open_message_from_file(file);

  const replyWin = await open_compose_with_reply(msgc);

  // Ctrl+S saves as draft.
  await save_compose_message(replyWin);
  await close_compose_window(replyWin);

  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  // Drafts folder should exist now.
  await be_in_folder(gDrafts);
  const draftMsg = await select_click_row(0);
  if (!draftMsg) {
    throw new Error("No draft saved!");
  }
  await press_delete(); // Delete the draft.

  await BrowserTestUtils.closeWindow(msgc); // close base .eml message
});

/**
 * Test that forwarding an opened .eml message works, and that the forward can
 * be saved as a draft.
 */
add_task(async function test_forward_eml_save_as_draft() {
  // Open an .eml file.
  const file = new FileUtils.File(getTestFilePath("data/testmsg.eml"));
  const msgc = await open_message_from_file(file);

  const replyWin = await open_compose_with_forward(msgc);

  await save_compose_message(replyWin);
  await close_compose_window(replyWin);

  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  // Drafts folder should exist now.
  await be_in_folder(gDrafts);
  const draftMsg = await select_click_row(0);
  if (!draftMsg) {
    throw new Error("No draft saved!");
  }
  await press_delete(); // Delete the draft.

  await BrowserTestUtils.closeWindow(msgc); // close base .eml message
});

/**
 * Test that MIME encoded subject is decoded when replying to an opened .eml.
 */
add_task(async function test_reply_eml_subject() {
  // Open an .eml file whose subject is encoded.
  const file = new FileUtils.File(
    getTestFilePath("data/mime-encoded-subject.eml")
  );
  const msgc = await open_message_from_file(file);

  const replyWin = await open_compose_with_reply(msgc);

  Assert.equal(
    replyWin.document.getElementById("msgSubject").value,
    "Re: \u2200a\u220aA"
  );
  await close_compose_window(replyWin); // close compose window
  await BrowserTestUtils.closeWindow(msgc); // close base .eml message
});

/**
 * Test that replying to a base64 encoded .eml works.
 */
add_task(async function test_reply_to_base64_eml() {
  // Open an .eml file.
  const file = new FileUtils.File(
    getTestFilePath("data/base64-encoded-msg.eml")
  );
  const msgc = await open_message_from_file(file);
  const compWin = await open_compose_with_reply(msgc);
  const bodyText = get_compose_body(compWin).textContent;
  const TXT = "You have decoded this text from base64.";
  Assert.ok(bodyText.includes(TXT), "body should contain the decoded text");
  await close_compose_window(compWin);
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that forwarding a base64 encoded .eml works.
 */
add_task(async function test_forward_base64_eml() {
  // Open an .eml file.
  const file = new FileUtils.File(
    getTestFilePath("data/base64-encoded-msg.eml")
  );
  const msgc = await open_message_from_file(file);
  const compWin = await open_compose_with_forward(msgc);
  const bodyText = get_compose_body(compWin).textContent;
  const TXT = "You have decoded this text from base64.";
  Assert.ok(bodyText.includes(TXT), "body should contain the decoded text");
  await close_compose_window(compWin);
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that replying and forwarding an evil meta msg works.
 */
add_task(async function test_reply_fwd_to_evil_meta() {
  // Open an .eml file.
  const file = new FileUtils.File(getTestFilePath("data/evil-meta-msg.eml"));
  const msgc = await open_message_from_file(file);

  const TXT = "KABOOM!";

  const reWin = await open_compose_with_reply(msgc);
  const reText = get_compose_body(reWin).textContent;
  Assert.ok(reText.includes(TXT), "re body should contain the text");
  await close_compose_window(reWin);

  const fwdWin = await open_compose_with_forward(msgc);
  const fwdText = get_compose_body(fwdWin).textContent;
  Assert.ok(fwdText.includes(TXT), "fwd body should contain the text");
  await close_compose_window(fwdWin);

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that forwarding an opened .eml message works with catchAll enabled.
 */
add_task(async function test_forward_eml_catchall() {
  // Open an .eml file.
  const file = new FileUtils.File(getTestFilePath("data/testmsg.eml"));
  const msgc = await open_message_from_file(file);

  MailServices.accounts.defaultAccount.defaultIdentity.catchAll = true;

  const replyWin = await open_compose_with_forward(msgc);
  const bodyText = get_compose_body(replyWin).textContent;
  const message = "Because they're stupid, that's why";
  Assert.ok(bodyText.includes(message), "Correct message body");

  MailServices.accounts.defaultAccount.defaultIdentity.catchAll = false;

  await close_compose_window(replyWin); // close compose window
  await BrowserTestUtils.closeWindow(msgc); // close base .eml message
});

/**
 * Test that saving an .eml opened from a file works.
 */
add_task(async function test_save_eml_as_file() {
  const file = new FileUtils.File(getTestFilePath("data/testmsg.eml"));
  const msgc = await open_message_from_file(file);
  const pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.init(window.browsingContext);
    SpecialPowers.MockFilePicker.showCallback = picker => {
      resolve(picker.defaultString);
      return Ci.nsIFilePicker.returnOK;
    };
  });
  EventUtils.synthesizeKey("s", { accelKey: true }, msgc);
  Assert.equal(await pickerPromise, "testmsg.eml");
  SpecialPowers.MockFilePicker.cleanup();
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that an attached .eml that has been opened retains the correct filename
 * when it is subsequently saved.
 */
add_task(async function test_save_eml_as_file() {
  const file = new FileUtils.File(getTestFilePath("data/testmsg-nested.eml"));
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);
  const newWindowPromise = promise_new_window("mail:messageWindow");
  await EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    {},
    aboutMessage
  );
  const msgc2 = await newWindowPromise;
  const pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.init(window.browsingContext);
    SpecialPowers.MockFilePicker.showCallback = picker => {
      resolve(picker.defaultString);
      return Ci.nsIFilePicker.returnOK;
    };
  });
  EventUtils.synthesizeKey("s", { accelKey: true }, msgc2);
  Assert.ok(
    /that's why(-(\d)+)?\.eml/.test(await pickerPromise),
    "Correct filename"
  );
  SpecialPowers.MockFilePicker.cleanup();
  await BrowserTestUtils.closeWindow(msgc2);
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that clicking on a 'mailto:' link in an .eml opens a compose window.
 */
add_task(async function test_mailto_link_in_eml() {
  // Open an .eml file.
  const file = new FileUtils.File(getTestFilePath("data/testmsg-html.eml"));
  const msgc = await open_message_from_file(file);
  const composePromise = promise_new_window("msgcompose");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#mailtolink",
    {},
    get_about_message(msgc).getMessagePaneBrowser()
  );
  const cwc = await compose_window_ready(composePromise);
  await close_compose_window(cwc);
  await BrowserTestUtils.closeWindow(msgc); // close base .eml message
});

/**
 * Test that forward as attachment works.
 */
add_task(async function test_forward_eml_as_attachment() {
  Services.prefs.setIntPref("mail.forward_message_mode", 0);

  const file = new FileUtils.File(getTestFilePath("data/testmsg.eml"));
  const msgc = await open_message_from_file(file);

  // Case 1 - with extension.
  Services.prefs.setBoolPref("mail.forward_add_extension", true);
  const win = await open_compose_with_forward(msgc);
  const attachment =
    win.document.getElementById("attachmentBucket").itemChildren[0]?.attachment;
  Assert.equal(attachment.name, "why.eml", "should get correct name w/ ext");
  Assert.equal(
    attachment.contentType,
    "message/rfc822",
    "should get correct mime type w/ ext"
  );
  await close_compose_window(win);

  // Case 2 - without extension.
  Services.prefs.setBoolPref("mail.forward_add_extension", false);
  const win2 = await open_compose_with_forward(msgc);
  const attachment2 =
    win2.document.getElementById("attachmentBucket").itemChildren[0]
      ?.attachment;
  Assert.equal(attachment2.name, "why", "should get correct name w/o ext");
  Assert.equal(
    attachment2.contentType,
    "message/rfc822",
    "should get correct mime type w/o ext"
  );
  await save_compose_message(win2);
  await close_compose_window(win2);

  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  // Drafts folder should exist now.
  await be_in_folder(gDrafts);
  const draftMsg = await select_click_row(0);
  if (!draftMsg) {
    throw new Error("No draft saved!");
  }
  await press_delete(); // Delete the draft.

  await BrowserTestUtils.closeWindow(msgc); // close base .eml message
  Services.prefs.clearUserPref("mail.forward_add_extension");
  Services.prefs.clearUserPref("mail.forward_message_mode");
});
