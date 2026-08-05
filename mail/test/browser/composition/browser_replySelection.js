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

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mailnews.reply_quoting_selection");
  Services.prefs.clearUserPref(
    "mailnews.reply_quoting_selection.only_if_chars"
  );
  Services.prefs.clearUserPref("mailnews.reply_quoting_selection.multi_word");
});

async function subtest(path) {
  const file = new FileUtils.File(getTestFilePath(path));
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Select lines 2-3 of the text.
  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    function () {
      const selection = content.getSelection();

      const text = content.document.querySelector(
        "body > div.moz-text-plain > pre.moz-quote-pre"
      );

      const range1 = content.document.createRange();
      range1.setStart(text.firstChild, 6);
      range1.setEnd(text.firstChild, 20);

      selection.removeAllRanges();
      selection.addRange(range1);
    }
  );

  let cwc = await open_compose_with_reply(msgc);
  let blockquote = cwc.document
    .getElementById("messageEditor")
    .contentDocument.body.querySelector("blockquote");

  let pre = blockquote.querySelector(":scope > pre");
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
  Assert.equal(
    pre.textContent,
    "line 2\nline 3",
    "selected text should be quoted correctly"
  );
  await close_compose_window(cwc);

  // Select the <pre> node itself.
  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    function () {
      const selection = content.getSelection();

      const text = content.document.querySelector(
        "body > div.moz-text-plain > pre.moz-quote-pre"
      );

      const range2 = content.document.createRange();
      range2.setStart(text, 0);
      range2.setEnd(text, 1);

      selection.removeAllRanges();
      selection.addRange(range2);
    }
  );

  cwc = await open_compose_with_reply(msgc);
  blockquote = cwc.document
    .getElementById("messageEditor")
    .contentDocument.body.querySelector("blockquote");

  pre = blockquote.querySelector(":scope > pre");
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
  const textContent = pre.textContent;
  const line = textContent.slice(
    textContent.indexOf("line 7"),
    textContent.lastIndexOf("line 7") + 6
  );
  Assert.ok(
    !line.includes("\n"),
    "long lines of quoted text should not contain \\n"
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

/* Specific test for HTML emails containing <pre> tags (Bug 2029007). */
add_task(async function test_html_pre() {
  const file = new FileUtils.File(getTestFilePath("data/html-pre.eml"));
  const msgc = await open_message_from_file(file);

  const aboutMessage = get_about_message(msgc);
  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    function () {
      const selection = content.getSelection();

      // Use a looser selector because Thunderbird wraps HTML bodies in container
      // divs.
      const text = content.document.querySelector("pre");

      // Lines 2-3 of the text.
      // Note: HTML parsers strip the newline immediately following a <pre> tag.
      // The firstChild text node actually contains: "line 1\nline 2\nline 3\n..."
      // Index 7 starts exactly at "l" in "line 2"
      // Index 20 ends exactly after "3" in "line 3"
      const range = content.document.createRange();
      range.setStart(text.firstChild, 7);
      range.setEnd(text.firstChild, 20);

      selection.removeAllRanges();
      selection.addRange(range);
    }
  );

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
});

add_task(async function test_quoting_prefs() {
  const file = new FileUtils.File(getTestFilePath("data/html-quoting.eml"));
  const messageWindow = await open_message_from_file(file);
  const aboutMessage = get_about_message(messageWindow);
  const browser = aboutMessage.getMessagePaneBrowser();

  function selectCharacters(line, start, end) {
    const selection = content.getSelection();

    const text = content.document.querySelector(
      `body > div.moz-text-html > p:nth-child(${line})`
    );

    const range = content.document.createRange();
    range.setStart(text.firstChild, start);
    range.setEnd(text.firstChild, end);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function getQuotedText() {
    const replyWindow = await open_compose_with_reply(messageWindow);
    const blockquote = replyWindow.document
      .getElementById("messageEditor")
      .contentDocument.body.querySelector("blockquote");
    const textContent = blockquote.textContent;
    await close_compose_window(replyWindow);
    return textContent.trim();
  }

  async function assertWholeMessageQuoted() {
    const textContent = await getQuotedText();
    Assert.stringMatches(
      textContent,
      /^line 1\n.*\nline 8$/s,
      "the whole message should be quoted"
    );
  }

  async function assertSelectionQuoted(expectedQuote) {
    const textContent = await getQuotedText();
    Assert.equal(textContent, expectedQuote, "the selection should be quoted");
  }

  // Select just the word "line". With multiple words required, the whole
  // message should be quoted.
  await SpecialPowers.spawn(browser, [7, 7, 11], selectCharacters);
  await assertWholeMessageQuoted();

  // Check selection quoting when multiple words not required.
  Services.prefs.setBoolPref(
    "mailnews.reply_quoting_selection.multi_word",
    false
  );
  await assertSelectionQuoted("line");
  Services.prefs.setBoolPref(
    "mailnews.reply_quoting_selection.multi_word",
    true
  );

  // Select more than one word. The selection should be quoted.
  await SpecialPowers.spawn(browser, [7, 7, 13], selectCharacters);
  await assertSelectionQuoted("line 7");

  // Check selection quoting can be disabled.
  Services.prefs.setBoolPref("mailnews.reply_quoting_selection", false);
  await assertWholeMessageQuoted();
  Services.prefs.setBoolPref("mailnews.reply_quoting_selection", true);

  // Check selection quoting when particular characters are required.
  Services.prefs.setStringPref(
    "mailnews.reply_quoting_selection.only_if_chars",
    "456"
  );
  await SpecialPowers.spawn(browser, [3, 0, 6], selectCharacters);
  await assertWholeMessageQuoted();
  await SpecialPowers.spawn(browser, [4, 0, 6], selectCharacters);
  await assertSelectionQuoted("line 4");
  Services.prefs.setStringPref(
    "mailnews.reply_quoting_selection.only_if_chars",
    ""
  );

  await BrowserTestUtils.closeWindow(messageWindow);
});
