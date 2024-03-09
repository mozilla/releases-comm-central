/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that actions such as replying and forwarding works correctly from
 * an .eml message that's attached to another mail.
 */

"use strict";

var { close_compose_window, compose_window_ready, get_compose_body } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var {
  assert_selected_and_displayed,
  be_in_folder,
  close_tab,
  create_folder,
  get_about_message,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);

var folder;

var msgsubject = "mail client suggestions";
var msgbodyA = "know of a good email client?";
var msgbodyB = "hi, i think you may know of an email client to recommend?";

add_setup(async function () {
  folder = await create_folder("FwdedEmlTest");

  const source =
    "From - Mon Apr  16 22:55:33 2012\n" +
    "Date: Mon, 16 Apr 2012 22:55:33 +0300\n" +
    "From: Mr Example <example@invalid>\n" +
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:14.0) Gecko/20120331 Thunderbird/14.0a1\n" +
    "MIME-Version: 1.0\n" +
    "To: example@invalid\n" +
    "Subject: Fwd: " +
    msgsubject +
    "\n" +
    "References: <4F8C78F5.4000704@invalid>\n" +
    "In-Reply-To: <4F8C78F5.4000704@invalid>\n" +
    "X-Forwarded-Message-Id: <4F8C78F5.4000704@invalid>\n" +
    "Content-Type: multipart/mixed;\n" +
    ' boundary="------------080806020206040800000503"\n' +
    "\n" +
    "This is a multi-part message in MIME format.\n" +
    "--------------080806020206040800000503\n" +
    "Content-Type: text/plain; charset=ISO-8859-1; format=flowed\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\n" +
    msgbodyB +
    "\n" +
    "\n" +
    "--------------080806020206040800000503\n" +
    "Content-Type: message/rfc822;\n" +
    ' name="mail client suggestions.eml"\n' +
    "Content-Transfer-Encoding: 7bit\n" +
    "Content-Disposition: attachment;\n" +
    ' filename="mail client suggestions.eml"\n' +
    "\n" +
    "Return-Path: <example@invalid>\n" +
    "Received: from xxx (smtpu [10.0.0.51])\n" +
    "  by storage (Cyrus v2.3.7-Invoca-RPM-2.3.7-1.1) with LMTPA;\n" +
    "  Mon, 16 Apr 2012 22:54:36 +0300\n" +
    "Message-ID: <4F8C78F5.4000704@invalid>\n" +
    "Date: Mon, 16 Apr 2012 22:54:29 +0300\n" +
    "From: Mr Example <example@invalid>\n" +
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:14.0) Gecko/20120331 Thunderbird/14.0a1\n" +
    "MIME-Version: 1.0\n" +
    "To: example@invalid\n" +
    "Subject: mail client suggestions\n" +
    "Content-Type: text/plain; charset=ISO-8859-1; format=flowed\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\n" +
    msgbodyA +
    "\n" +
    "\n" +
    "--------------080806020206040800000503--\n";

  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessage(source);
});

/**
 * Helper to open an attached .eml file, invoke the hotkey and check some
 * properties of the composition content we get.
 */
async function setupWindowAndTest(hotkeyToHit, hotkeyModifiers) {
  await be_in_folder(folder);

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const tabSelectPromise = BrowserTestUtils.waitForEvent(
    document.getElementById("tabmail").tabContainer,
    "select"
  );
  const aboutMessage = get_about_message();
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    { clickCount: 1 },
    aboutMessage
  );
  await tabSelectPromise;
  await wait_for_message_display_completion(window, false);

  const newWindowPromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey(hotkeyToHit, hotkeyModifiers, window);
  const compWin = await compose_window_ready(newWindowPromise);

  const bodyText = get_compose_body(compWin).textContent;
  if (bodyText.includes("html")) {
    throw new Error("body text contains raw html; bodyText=" + bodyText);
  }

  if (!bodyText.includes(msgbodyA)) {
    throw new Error(
      "body text didn't contain the body text; msgbodyA=" +
        msgbodyB +
        ", bodyText=" +
        bodyText
    );
  }

  const subjectText = compWin.document.getElementById("msgSubject").value;
  if (!subjectText.includes(msgsubject)) {
    throw new Error(
      "subject text didn't contain the original subject; " +
        "msgsubject=" +
        msgsubject +
        ", subjectText=" +
        subjectText
    );
  }

  await close_compose_window(compWin, false);
  close_tab(document.getElementById("tabmail").currentTabInfo);
}

/**
 * Test that replying to an attached .eml contains the expected texts.
 */
add_task(function test_reply_to_attached_eml() {
  return setupWindowAndTest("R", { shiftKey: false, accelKey: true });
});

/**
 * Test that forwarding an attached .eml contains the expected texts.
 */
add_task(async function test_forward_attached_eml() {
  await setupWindowAndTest("L", { shiftKey: false, accelKey: true });

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
