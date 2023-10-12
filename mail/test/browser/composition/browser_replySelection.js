/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that reply with selection works properly.
 */

"use strict";

var { close_compose_window, open_compose_with_reply } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { get_about_message, open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence, close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

add_task(async function test_reply_w_selection_direct() {
  let file = new FileUtils.File(getTestFilePath("data/non-flowed-plain.eml"));
  let msgc = await open_message_from_file(file);

  let aboutMessage = get_about_message(msgc);
  let win = aboutMessage.document.getElementById("messagepane").contentWindow;
  let doc = aboutMessage.document.getElementById("messagepane").contentDocument;
  let selection = win.getSelection();

  let text = doc.querySelector("body > div.moz-text-plain > pre.moz-quote-pre");

  // Lines 2-3 of the text.
  let range1 = doc.createRange();
  range1.setStart(text.firstChild, 6);
  range1.setEnd(text.firstChild, 20);

  // The <pre> node itself.
  let range2 = doc.createRange();
  range2.setStart(text, 0);
  range2.setEnd(text, 1);

  for (let range of [range1, range2]) {
    selection.removeAllRanges();
    selection.addRange(range);

    let cwc = await open_compose_with_reply(msgc);
    let blockquote = cwc.document
      .getElementById("messageEditor")
      .contentDocument.body.querySelector("blockquote");

    Assert.ok(
      blockquote.querySelector(":scope > pre"),
      "the non-flowed content should be in a <pre>"
    );

    Assert.ok(
      !blockquote.querySelector(":scope > pre").innerHTML.includes("<"),
      "should be all text, no tags in the message text"
    );
    await close_compose_window(cwc);
  }

  await BrowserTestUtils.closeWindow(msgc);
});
