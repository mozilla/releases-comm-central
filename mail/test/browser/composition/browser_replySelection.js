/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that reply with selection works properly.
 */

"use strict";

var { close_compose_window, open_compose_with_reply } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence, close_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

async function subtest(path) {
  const file = new FileUtils.File(getTestFilePath(path));
  const msgc = await open_message_from_file(file);

  const aboutMessage = get_about_message(msgc);
  const win = aboutMessage.document.getElementById("messagepane").contentWindow;
  const doc =
    aboutMessage.document.getElementById("messagepane").contentDocument;
  const selection = win.getSelection();

  const text = doc.querySelector(
    "body > div.moz-text-plain > pre.moz-quote-pre"
  );

  // Lines 2-3 of the text.
  const range1 = doc.createRange();
  range1.setStart(text.firstChild, 6);
  range1.setEnd(text.firstChild, 20);

  // The <pre> node itself.
  const range2 = doc.createRange();
  range2.setStart(text, 0);
  range2.setEnd(text, 1);

  for (const range of [range1, range2]) {
    selection.removeAllRanges();
    selection.addRange(range);

    const cwc = await open_compose_with_reply(msgc);
    const blockquote = cwc.document
      .getElementById("messageEditor")
      .contentDocument.body.querySelector("blockquote");

    const pre = blockquote.querySelector(":scope > pre");
    Assert.ok(pre, "the non-flowed content should be in a <pre>");
    Assert.ok(
      pre.classList.contains("moz-quote-pre"),
      "<pre> should have the 'moz-quote-pre' class"
    );
    Assert.equal(
      getComputedStyle(pre).whiteSpace,
      "pre-wrap",
      "quoted text should visually wrap"
    );
    Assert.ok(
      !pre.innerHTML.includes("<"),
      "should be all text, no tags in the message text"
    );
    if (range == range1) {
      Assert.equal(
        pre.textContent,
        "line 2\nline 3",
        "selected text should be quoted correctly"
      );
    }
    if (range == range2) {
      const textContent = pre.textContent;
      const line = textContent.slice(
        textContent.indexOf("line 7"),
        textContent.lastIndexOf("line 7") + 6
      );
      Assert.ok(
        !line.includes("\n"),
        "long lines of quoted text should not contain \\n"
      );
    }
    await close_compose_window(cwc);
  }

  await BrowserTestUtils.closeWindow(msgc);
}

// Specific subtest for HTML emails containing <pre> tags (Bug 2029007)
async function html_pre_subtest(path) {
  const file = new FileUtils.File(getTestFilePath(path));
  const msgc = await open_message_from_file(file);

  const aboutMessage = get_about_message(msgc);
  const win = aboutMessage.document.getElementById("messagepane").contentWindow;
  const doc =
    aboutMessage.document.getElementById("messagepane").contentDocument;
  const selection = win.getSelection();

  // Use a looser selector because Thunderbird wraps HTML bodies in container
  // divs.
  const text = doc.querySelector("pre");

  // Lines 2-3 of the text.
  // Note: HTML parsers strip the newline immediately following a <pre> tag.
  // The firstChild text node actually contains: "line 1\nline 2\nline 3\n..."
  // Index 7 starts exactly at "l" in "line 2"
  // Index 20 ends exactly after "3" in "line 3"
  const range = doc.createRange();
  range.setStart(text.firstChild, 7);
  range.setEnd(text.firstChild, 20);

  selection.removeAllRanges();
  selection.addRange(range);

  const cwc = await open_compose_with_reply(msgc);
  const blockquote = cwc.document
    .getElementById("messageEditor")
    .contentDocument.body.querySelector("blockquote");

  const pre = blockquote.querySelector(":scope > pre");
  Assert.ok(
    pre,
    "the selection from HTML <pre> should be wrapped in a <pre> when quoted"
  );
  Assert.ok(
    pre.classList.contains("moz-quote-pre"),
    "<pre> should have the 'moz-quote-pre' class"
  );
  Assert.equal(
    pre.textContent,
    "line 2\nline 3",
    "selected text should be quoted correctly without losing line breaks"
  );

  await close_compose_window(cwc);
  await BrowserTestUtils.closeWindow(msgc);
}

add_task(async function test_non_flowed() {
  await subtest("data/non-flowed-plain.eml");
});

add_task(async function test_base64() {
  await subtest("data/base64-quoting.eml");
});

add_task(async function test_quoted_printable() {
  await subtest("data/quoted-printable.eml");
});

add_task(async function test_html_pre() {
  await html_pre_subtest("data/html-pre.eml");
});
